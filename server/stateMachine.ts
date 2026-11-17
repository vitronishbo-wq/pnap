import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type {
  AdmissionRecord,
  AuditLogEvent,
  CustodyState,
  EstablishmentProfile,
  ExitModality,
  IdentityLock,
  Inmate,
  JudicialProcess,
  LegalStatus,
  LegalTransitionRecord,
  MovementRecord,
  MovementType,
  NationalInmateIndexItem,
  PnapUser,
  ProvinceId,
  ProvinceStatistics,
  ReleaseRecord,
  TransferRecord
} from '../src/types/pnap';
import { isValidProvinceId } from './rbac';
import { buildIndexSearchText } from '../src/utils/inmateSearch';
import { buildNationalIndexItemWithSearch } from './searchEngine';

export class StateMachineError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StateMachineError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface ActorContext {
  user: PnapUser;
  ipAddress: string;
}

export function normalizeIdSegment(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

const PLACEHOLDER_BI_TOKENS = new Set([
  'PENDENTE',
  'ND',
  'SBI',
  'SEMBI',
  'NAODECLARADO',
  'NAO_DECLARADO',
  'SEMNUMERO',
  'SEM_NUMERO',
  'UNKNOWN'
]);

export function isMeaningfulBi(biNumber?: string): boolean {
  const cleanBi = normalizeIdSegment(biNumber || '');
  if (cleanBi.length < 4) return false;
  return !PLACEHOLDER_BI_TOKENS.has(cleanBi);
}

export function buildIdentityLockKey(biNumber?: string, matricula?: string): string {
  const cleanBi = normalizeIdSegment(biNumber || '');
  if (isMeaningfulBi(biNumber)) {
    return `bi-${cleanBi}`.slice(0, 120);
  }
  const cleanMat = normalizeIdSegment(matricula || '');
  return `mat-${cleanMat || 'unknown'}`.slice(0, 120);
}

export function resolveEffectiveCustodyState(inmate: Inmate): CustodyState {
  if (inmate.custodyState) {
    return inmate.custodyState;
  }
  switch (inmate.currentStatus) {
    case 'ATIVO':
      return 'ATIVO_NA_UNIDADE';
    case 'TRANSFERIDO':
      return 'EM_TRANSITO_TRANSFERENCIA';
    case 'LIBERTADO':
      return 'LIBERTADO';
    case 'EVADIDO':
      return 'EVADIDO';
    case 'FALECIDO':
      return 'FALECIDO';
    default:
      return 'ATIVO_NA_UNIDADE';
  }
}

export function mapCustodyStateToLegacyStatus(
  state: CustodyState
): Inmate['currentStatus'] {
  switch (state) {
    case 'ATIVO_NA_UNIDADE':
    case 'EM_DILIGENCIA_EXTERNA':
    case 'HOSPITALIZADO_EXTERNO':
    case 'PRE_ADMISSAO':
      return 'ATIVO';
    case 'EM_TRANSITO_TRANSFERENCIA':
      return 'TRANSFERIDO';
    case 'LIBERTADO':
      return 'LIBERTADO';
    case 'EVADIDO':
      return 'EVADIDO';
    case 'FALECIDO':
      return 'FALECIDO';
  }
}

export function consolidateLegalStatus(
  processes: JudicialProcess[],
  fallbackStatus: Exclude<LegalStatus, 'EXTINTO'> = 'PREVENTIVO'
): { consolidatedLegalStatus: LegalStatus; activeProcessesCount: number } {
  const active = processes.filter((p) => p.isActive && p.legalStatus !== 'EXTINTO');
  if (active.length === 0) {
    return {
      consolidatedLegalStatus: processes.length > 0 ? 'EXTINTO' : fallbackStatus,
      activeProcessesCount: 0
    };
  }
  if (active.some((p) => p.legalStatus === 'TRANSITO_EM_JULGADO')) {
    return { consolidatedLegalStatus: 'TRANSITO_EM_JULGADO', activeProcessesCount: active.length };
  }
  if (active.some((p) => p.legalStatus === 'CONDENADO')) {
    return { consolidatedLegalStatus: 'CONDENADO', activeProcessesCount: active.length };
  }
  if (active.some((p) => p.legalStatus === 'RECORRENTE')) {
    return { consolidatedLegalStatus: 'RECORRENTE', activeProcessesCount: active.length };
  }
  return { consolidatedLegalStatus: 'PREVENTIVO', activeProcessesCount: active.length };
}

export function assertExpectedVersion(inmate: Inmate, expectedVersion?: number): number {
  const currentVersion =
    typeof inmate.version === 'number' && Number.isInteger(inmate.version) && inmate.version >= 1
      ? inmate.version
      : 1;

  if (expectedVersion !== undefined) {
    if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
      throw new StateMachineError(
        409,
        'VERSION_CONFLICT',
        `Conflito de concorrência otimista: a Ficha Única foi atualizada para a versão ${currentVersion} (versão enviada: ${expectedVersion}). Recarregue os dados antes de repetir.`,
        { currentVersion, expectedVersion }
      );
    }
  }
  return currentVersion;
}

function emptyStats(provinceId: ProvinceId): ProvinceStatistics {
  return {
    periodId: '2024-Q4',
    activeInmates: 0,
    totalCapacity: 0,
    occupancyRate: 0,
    availableSpots: 0,
    establishmentsCount: 0,
    preventiveCount: 0,
    convictedCount: 0,
    maleCount: 0,
    femaleCount: 0
  };
}

function addMonthsIso(baseDateStr: string, monthsToAdd: number, fallbackDate: string): string {
  const parsed = new Date(baseDateStr || fallbackDate);
  if (Number.isNaN(parsed.getTime())) return fallbackDate;
  parsed.setMonth(parsed.getMonth() + monthsToAdd);
  return parsed.toISOString().split('T')[0];
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cleanUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        result[key] = cleanUndefined(val);
      }
    }
    return result as T;
  }
  return value;
}

function buildAuditRecord(
  actor: ActorContext,
  params: {
    action: string;
    targetResource: string;
    details: string;
    jurisdictionStatus?: AuditLogEvent['jurisdictionStatus'];
    previousState?: string;
    newState?: string;
    expectedVersion?: number;
    resultingVersion?: number;
  }
): AuditLogEvent {
  return {
    eventId: uniqueId('evt'),
    timestamp: new Date().toISOString(),
    userId: actor.user.uid,
    userName: actor.user.profile.fullName,
    userRole: actor.user.assignments.role,
    userScopeProvince:
      actor.user.assignments.role === 'CENTRAL_ADMIN'
        ? 'CENTRAL_GLOBAL'
        : actor.user.assignments.assignedProvinceId,
    action: params.action,
    targetResource: params.targetResource,
    details: params.details,
    ipAddress: actor.ipAddress,
    jurisdictionStatus: params.jurisdictionStatus || 'AUTHORIZED',
    ...(params.previousState ? { previousState: params.previousState } : {}),
    ...(params.newState ? { newState: params.newState } : {}),
    ...(params.expectedVersion !== undefined ? { expectedVersion: params.expectedVersion } : {}),
    ...(params.resultingVersion !== undefined ? { resultingVersion: params.resultingVersion } : {})
  };
}

function writeTxAuditLog(tx: Transaction, db: Firestore, record: AuditLogEvent): void {
  tx.set(db.collection('pnap_audit_logs').doc(record.eventId), cleanUndefined(record));
}

function allocateCellInEstablishment(
  est: EstablishmentProfile,
  inmateId: string,
  preferredPavilionId?: string,
  preferredBlockId?: string,
  preferredCellId?: string
): {
  updatedEst: EstablishmentProfile;
  pavilionId: string;
  blockId: string;
  cellId: string;
  cellCode: string;
} {
  const pavilions = est.pavilions || [];
  if (pavilions.length === 0) {
    return {
      updatedEst: {
        ...est,
        activeInmatesCount: (Number(est.activeInmatesCount) || 0) + 1
      },
      pavilionId: preferredPavilionId || 'pav-default',
      blockId: preferredBlockId || 'blk-default',
      cellId: preferredCellId || 'cell-default',
      cellCode: preferredCellId || 'CELA-01'
    };
  }

  let matched = false;
  let resolvedPav = preferredPavilionId || '';
  let resolvedBlk = preferredBlockId || '';
  let resolvedCell = preferredCellId || '';
  let resolvedCode = preferredCellId || '';

  const updatedPavilions = pavilions.map((pav) => {
    const blocks = (pav.blocks || []).map((blk) => {
      const cells = (blk.cells || []).map((cell) => {
        if (matched) return cell;

        const isExplicitTarget = preferredCellId
          ? cell.cellId === preferredCellId || cell.code === preferredCellId
          : (!preferredPavilionId || pav.pavilionId === preferredPavilionId) &&
            (!preferredBlockId || blk.blockId === preferredBlockId) &&
            cell.currentOccupants < cell.capacity;

        if (!isExplicitTarget) return cell;

        if (cell.inmateIds.includes(inmateId)) {
          matched = true;
          resolvedPav = pav.pavilionId;
          resolvedBlk = blk.blockId;
          resolvedCell = cell.cellId;
          resolvedCode = cell.code;
          return cell;
        }

        if (cell.currentOccupants >= cell.capacity) {
          throw new StateMachineError(
            409,
            'CELL_CAPACITY_EXCEEDED',
            `Cela ${cell.code} em ${est.name} atingiu a lotação máxima (${cell.currentOccupants}/${cell.capacity}).`
          );
        }

        matched = true;
        resolvedPav = pav.pavilionId;
        resolvedBlk = blk.blockId;
        resolvedCell = cell.cellId;
        resolvedCode = cell.code;

        return {
          ...cell,
          currentOccupants: cell.currentOccupants + 1,
          inmateIds: [...cell.inmateIds, inmateId]
        };
      });
      return { ...blk, cells };
    });
    return { ...pav, blocks };
  });

  if (!matched) {
    if (preferredCellId) {
      throw new StateMachineError(
        400,
        'CELL_NOT_FOUND',
        `Cela "${preferredCellId}" não encontrada no estabelecimento ${est.name}.`
      );
    }
    throw new StateMachineError(
      409,
      'ESTABLISHMENT_AT_FULL_CAPACITY',
      `Estabelecimento ${est.name} não possui vagas disponíveis em nenhuma cela.`
    );
  }

  return {
    updatedEst: {
      ...est,
      activeInmatesCount: (Number(est.activeInmatesCount) || 0) + 1,
      pavilions: updatedPavilions
    },
    pavilionId: resolvedPav,
    blockId: resolvedBlk,
    cellId: resolvedCell,
    cellCode: resolvedCode
  };
}

function releaseCellInEstablishment(
  est: EstablishmentProfile,
  inmateId: string,
  cellId?: string
): EstablishmentProfile {
  const nextPavilions = est.pavilions?.map((pav) => ({
    ...pav,
    blocks: pav.blocks.map((blk) => ({
      ...blk,
      cells: blk.cells.map((cell) => {
        if (cell.cellId === cellId || cell.inmateIds.includes(inmateId)) {
          return {
            ...cell,
            inmateIds: cell.inmateIds.filter((id) => id !== inmateId),
            currentOccupants: Math.max(0, cell.currentOccupants - 1)
          };
        }
        return cell;
      })
    }))
  }));

  return {
    ...est,
    activeInmatesCount: Math.max(0, (Number(est.activeInmatesCount) || 0) - 1),
    ...(nextPavilions ? { pavilions: nextPavilions } : {})
  };
}

function buildUpdatedProvinceStatsOnDelta(
  prev: ProvinceStatistics,
  deltaActive: number,
  legalStatus: LegalStatus,
  gender: 'M' | 'F'
): ProvinceStatistics {
  const nextActive = Math.max(0, prev.activeInmates + deltaActive);
  const totalCap = prev.totalCapacity;
  const isPreventive = legalStatus === 'PREVENTIVO' || legalStatus === 'RECORRENTE';

  return {
    ...prev,
    activeInmates: nextActive,
    availableSpots: Math.max(0, totalCap - nextActive),
    occupancyRate: totalCap > 0 ? Number(((nextActive / totalCap) * 100).toFixed(1)) : 0,
    preventiveCount: isPreventive
      ? Math.max(0, prev.preventiveCount + deltaActive)
      : prev.preventiveCount,
    convictedCount: !isPreventive
      ? Math.max(0, prev.convictedCount + deltaActive)
      : prev.convictedCount,
    maleCount: gender === 'M' ? Math.max(0, prev.maleCount + deltaActive) : prev.maleCount,
    femaleCount: gender === 'F' ? Math.max(0, prev.femaleCount + deltaActive) : prev.femaleCount
  };
}

function isMeaningfulText(val?: string | null): boolean {
  const trimmed = (val || '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return (
    lower !== 'pendente' &&
    lower !== 'contacto pendente' &&
    lower !== 'não declarado' &&
    lower !== 'nao declarado' &&
    lower !== 'não declarada' &&
    lower !== 'nao declarada' &&
    lower !== 'em verificação' &&
    lower !== 'em verificacao' &&
    lower !== 'n/d'
  );
}

function mergeLifetimeProfile(
  existingProfile: Inmate['profile'] | undefined,
  incomingProfile: Inmate['profile'],
  finalInmateId: string,
  finalMatricula: string
): Inmate['profile'] {
  if (!existingProfile) {
    return {
      ...incomingProfile,
      inmateId: finalInmateId,
      matricula: finalMatricula,
      biNumber: isMeaningfulBi(incomingProfile.biNumber) ? incomingProfile.biNumber.trim() : ''
    };
  }

  const resolvedBi = isMeaningfulBi(existingProfile.biNumber)
    ? existingProfile.biNumber
    : isMeaningfulBi(incomingProfile.biNumber)
    ? incomingProfile.biNumber.trim()
    : '';

  const resolvedEmergency =
    existingProfile.emergencyContact && isMeaningfulText(existingProfile.emergencyContact.name)
      ? existingProfile.emergencyContact
      : incomingProfile.emergencyContact;

  return {
    ...incomingProfile,
    ...existingProfile,
    inmateId: finalInmateId,
    matricula: finalMatricula,
    biNumber: resolvedBi,
    fullName: existingProfile.fullName || incomingProfile.fullName.trim(),
    alias: existingProfile.alias || incomingProfile.alias,
    dateOfBirth: existingProfile.dateOfBirth || incomingProfile.dateOfBirth,
    gender: existingProfile.gender || incomingProfile.gender,
    fatherName: isMeaningfulText(existingProfile.fatherName)
      ? existingProfile.fatherName
      : incomingProfile.fatherName,
    motherName: isMeaningfulText(existingProfile.motherName)
      ? existingProfile.motherName
      : incomingProfile.motherName,
    provinceOfOrigin: isMeaningfulText(existingProfile.provinceOfOrigin)
      ? existingProfile.provinceOfOrigin
      : incomingProfile.provinceOfOrigin,
    neighborhood: isMeaningfulText(existingProfile.neighborhood)
      ? existingProfile.neighborhood
      : incomingProfile.neighborhood,
    photoUrl: existingProfile.photoUrl || incomingProfile.photoUrl,
    emergencyContact: resolvedEmergency
  };
}

/**
 * 1. ADMISSÃO / INTERNAMENTO COM BLOQUEIO DE IDENTIDADE ÚNICA NACIONAL (Melhoria #1)
 */
export async function admitInmateTransactional(
  db: Firestore,
  actor: ActorContext,
  payload: Partial<Inmate> & { reentry?: boolean }
): Promise<{ inmate: Inmate; admission: AdmissionRecord; process: JudicialProcess }> {
  const provinceId = payload.provinceId;
  const establishmentId = payload.establishmentId?.trim() || '';

  if (!isValidProvinceId(provinceId) || !establishmentId) {
    throw new StateMachineError(
      400,
      'INVALID_PAYLOAD',
      'Província RDPA 2024 e estabelecimento de internamento são obrigatórios.'
    );
  }

  if (!payload.profile?.fullName?.trim() || !payload.profile?.matricula?.trim()) {
    throw new StateMachineError(
      400,
      'MISSING_INMATE_FIELDS',
      'Nome completo e matrícula do recluso são obrigatórios.'
    );
  }

  const initialLockKey = buildIdentityLockKey(payload.profile.biNumber, payload.profile.matricula);
  const explicitReentryInmateId = payload.reentry && payload.inmateId?.trim() ? payload.inmateId.trim() : '';
  const requestedInmateId = payload.inmateId?.trim() || `inm-${provinceId}-${Date.now()}`;

  return db.runTransaction(async (tx) => {
    const estRef = db.collection('pnap_establishments').doc(establishmentId);
    const lockRefInitial = db.collection('pnap_identity_locks').doc(initialLockKey);
    const statsRef = db.collection('pnap_province_stats').doc(provinceId);
    const matriculaQuery = db
      .collection('pnap_national_inmate_index')
      .where('matricula', '==', payload.profile!.matricula.trim())
      .limit(1);

    const [estSnap, lockSnapInitial, statsSnap, matriculaSnap, preloadedInmateSnap] = await Promise.all([
      tx.get(estRef),
      tx.get(lockRefInitial),
      tx.get(statsRef),
      tx.get(matriculaQuery),
      explicitReentryInmateId
        ? tx.get(db.collection('pnap_inmates').doc(explicitReentryInmateId))
        : Promise.resolve(null)
    ]);

    if (!estSnap.exists) {
      throw new StateMachineError(
        404,
        'ESTABLISHMENT_NOT_FOUND',
        'Estabelecimento de destino não encontrado.'
      );
    }

    const establishment = estSnap.data() as EstablishmentProfile;
    if (establishment.provinceId !== provinceId || establishment.provisioningStatus !== 'HOMOLOGATED') {
      throw new StateMachineError(
        400,
        'ESTABLISHMENT_NOT_HOMOLOGATED',
        'Estabelecimento deve pertencer à província indicada e estar HOMOLOGATED.'
      );
    }

    let finalInmateId = requestedInmateId;
    let finalMatricula = payload.profile!.matricula.trim();
    let effectiveLockKey = initialLockKey;
    let baseVersion = 1;
    let existingInmate: Inmate | null = null;

    if (preloadedInmateSnap && preloadedInmateSnap.exists) {
      const candidate = preloadedInmateSnap.data() as Inmate;
      const candidateCustody = resolveEffectiveCustodyState(candidate);
      if (candidateCustody === 'EVADIDO') {
        throw new StateMachineError(
          409,
          'IDENTITY_EVADED_USE_RECAPTURE',
          `Recluso ${candidate.profile.matricula} encontra-se EVADIDO. Utilize o fluxo de Recaptura em vez de reentrada.`,
          { existingInmateId: candidate.inmateId, matricula: candidate.profile.matricula }
        );
      }
      if (candidateCustody === 'FALECIDO') {
        throw new StateMachineError(
          409,
          'IDENTITY_DECEASED',
          `Identidade nacional ${candidate.profile.matricula} possui registo de ÓBITO confirmado.`
        );
      }
      if (candidateCustody !== 'LIBERTADO') {
        throw new StateMachineError(
          409,
          'IDENTITY_CONFLICT',
          `Identidade duplicada bloqueada: custódia atual é ${candidateCustody} sob Matrícula ${candidate.profile.matricula}.`,
          { existingInmateId: candidate.inmateId, matricula: candidate.profile.matricula, custodyState: candidateCustody }
        );
      }
      existingInmate = candidate;
      finalInmateId = candidate.inmateId;
      finalMatricula = candidate.profile.matricula;
      effectiveLockKey =
        candidate.identityLockKey ||
        buildIdentityLockKey(candidate.profile.biNumber, candidate.profile.matricula);
      baseVersion = (candidate.version ?? 1) + 1;
    } else if (lockSnapInitial.exists) {
      const lock = lockSnapInitial.data() as IdentityLock;
      if (lock.activeCustodyState === 'EVADIDO') {
        throw new StateMachineError(
          409,
          'IDENTITY_EVADED_USE_RECAPTURE',
          `Recluso ${lock.matricula} encontra-se EVADIDO. Utilize o fluxo de Recaptura em vez de criar nova matrícula.`,
          { existingInmateId: lock.inmateId, matricula: lock.matricula }
        );
      }
      if (lock.activeCustodyState === 'FALECIDO') {
        throw new StateMachineError(
          409,
          'IDENTITY_DECEASED',
          `Identidade nacional ${lock.matricula} possui registo de ÓBITO confirmado.`
        );
      }
      if (lock.activeCustodyState !== 'LIBERTADO') {
        throw new StateMachineError(
          409,
          'IDENTITY_CONFLICT',
          `Identidade duplicada bloqueada: já existe custódia ativa (${lock.activeCustodyState}) sob ID ${lock.inmateId} e Matrícula ${lock.matricula}.`,
          { existingInmateId: lock.inmateId, matricula: lock.matricula, custodyState: lock.activeCustodyState }
        );
      }
      // Reentrada autorizada de recluso previamente LIBERTADO: preserva identidade nacional única
      if (!payload.reentry) {
        throw new StateMachineError(
          409,
          'IDENTITY_REENTRY_CONFIRMATION_REQUIRED',
          `Recluso já cadastrado no sistema nacional (${lock.matricula}). Confirme reentrada (reentry: true) para reativar a mesma FUR.`,
          { existingInmateId: lock.inmateId, matricula: lock.matricula }
        );
      }
      finalInmateId = lock.inmateId;
      finalMatricula = lock.matricula;
    } else if (!matriculaSnap.empty) {
      const existingByMat = matriculaSnap.docs[0].data() as NationalInmateIndexItem;
      const existingState = existingByMat.custodyState || existingByMat.custodyStatus;
      if (payload.reentry && existingState === 'LIBERTADO') {
        finalInmateId = existingByMat.inmateId;
        finalMatricula = existingByMat.matricula;
      } else {
        throw new StateMachineError(
          409,
          'IDENTITY_CONFLICT',
          `Matrícula ${finalMatricula} já atribuída ao recluso ${existingByMat.fullName} (${existingByMat.inmateId}).`,
          { existingInmateId: existingByMat.inmateId, matricula: finalMatricula }
        );
      }
    }

    const inmateRef = db.collection('pnap_inmates').doc(finalInmateId);
    if (!existingInmate) {
      const inmateSnap = await tx.get(inmateRef);
      if (inmateSnap.exists) {
        const loaded = inmateSnap.data() as Inmate;
        const loadedCustody = resolveEffectiveCustodyState(loaded);
        if (!payload.reentry && !lockSnapInitial.exists) {
          throw new StateMachineError(
            409,
            'INMATE_ID_ALREADY_EXISTS',
            `Ficha Única ${finalInmateId} já existe.`
          );
        }
        if (payload.reentry && loadedCustody !== 'LIBERTADO') {
          throw new StateMachineError(
            409,
            'IDENTITY_CONFLICT',
            `Reentrada bloqueada: FUR ${loaded.profile.matricula} encontra-se em estado ${loadedCustody}.`
          );
        }
        existingInmate = loaded;
        effectiveLockKey =
          loaded.identityLockKey ||
          buildIdentityLockKey(loaded.profile.biNumber, loaded.profile.matricula);
        baseVersion = (existingInmate.version ?? 1) + 1;
      }
    }

    const allocated = allocateCellInEstablishment(
      establishment,
      finalInmateId,
      payload.pavilionId,
      payload.blockId,
      payload.cellId
    );

    const nowIso = new Date().toISOString();
    const admissionId = payload.admission?.admissionId || uniqueId('adm');
    const processId = uniqueId('proc');
    const legalStatus: Exclude<LegalStatus, 'EXTINTO'> =
      payload.legal?.legalStatus || 'PREVENTIVO';

    const newProcess: JudicialProcess = {
      processId,
      inmateId: finalInmateId,
      provinceId,
      establishmentId,
      processNumber: payload.admission?.processNumber || `PROC-${Date.now()}`,
      courtName: payload.admission?.courtName || 'Tribunal da Comarca',
      crimeCategory: payload.legal?.crimeCategory || 'Em Apuramento',
      penalCodeArticle: payload.legal?.penalCodeArticle || 'N/D',
      legalStatus,
      totalSentenceYears: Number(payload.legal?.totalSentenceYears) || 0,
      totalSentenceMonths: Number(payload.legal?.totalSentenceMonths) || 0,
      startDate: payload.admission?.admissionDate || nowIso.split('T')[0],
      endOfSentenceDate: payload.legal?.endOfSentenceDate || '',
      eligibleParoleDate: payload.legal?.eligibleParoleDate || '',
      isActive: true,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const mergedProfile = mergeLifetimeProfile(
      existingInmate?.profile,
      payload.profile!,
      finalInmateId,
      finalMatricula
    );

    const newInmate: Inmate = {
      ...(existingInmate || {}),
      ...(payload as Inmate),
      inmateId: finalInmateId,
      provinceId,
      establishmentId,
      pavilionId: allocated.pavilionId,
      blockId: allocated.blockId,
      cellId: allocated.cellId,
      profile: mergedProfile,
      admission: {
        ...payload.admission!,
        admissionId,
        intakeOfficer: actor.user.profile.fullName
      },
      legal: {
        ...(payload.legal as Inmate['legal']),
        legalStatus
      },
      // Regra de ouro: preserva todo o histórico vitalício da FUR em reentradas
      health: existingInmate?.health || payload.health!,
      rehabilitation: existingInmate?.rehabilitation || payload.rehabilitation!,
      disciplinary: existingInmate?.disciplinary || payload.disciplinary || { infractionsCount: 0, sanctionHistory: [] },
      incidents: existingInmate?.incidents || payload.incidents || [],
      postInstitutional: existingInmate?.postInstitutional || payload.postInstitutional!,
      documents: existingInmate?.documents || payload.documents || [],
      visitors: existingInmate?.visitors || payload.visitors || [],
      visits: existingInmate?.visits || payload.visits || [],
      currentStatus: 'ATIVO',
      custodyState: 'ATIVO_NA_UNIDADE',
      consolidatedLegalStatus: legalStatus,
      activeProcessesCount: (existingInmate?.activeProcessesCount || 0) + 1,
      identityLockKey: effectiveLockKey,
      version: baseVersion,
      lastMovementAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const identityLock: IdentityLock = {
      lockKey: effectiveLockKey,
      inmateId: finalInmateId,
      matricula: finalMatricula,
      normalizedBiNumber: normalizeIdSegment(
        isMeaningfulBi(newInmate.profile.biNumber) ? newInmate.profile.biNumber : finalMatricula
      ),
      fullNameNormalized: newInmate.profile.fullName.trim().toUpperCase(),
      activeCustodyState: 'ATIVO_NA_UNIDADE',
      lastUpdated: nowIso
    };

    const indexItem = buildNationalIndexItemWithSearch(
      newInmate,
      establishment.name,
      allocated.cellCode,
      nowIso
    );

    const admissionRecord: AdmissionRecord = {
      admissionId,
      inmateId: finalInmateId,
      fullName: newInmate.profile.fullName,
      matricula: finalMatricula,
      provinceId,
      establishmentId,
      courtName: newInmate.admission.courtName,
      crime: newInmate.legal.crimeCategory,
      timestamp: nowIso,
      registeredBy: actor.user.profile.fullName
    };

    const prevStats = statsSnap.exists
      ? (statsSnap.data() as ProvinceStatistics)
      : emptyStats(provinceId);
    const updatedStats = buildUpdatedProvinceStatsOnDelta(
      prevStats,
      1,
      legalStatus,
      newInmate.profile.gender
    );

    const finalLockRef = db.collection('pnap_identity_locks').doc(effectiveLockKey);
    tx.set(inmateRef, cleanUndefined(newInmate));
    tx.set(inmateRef.collection('judicial_processes').doc(processId), cleanUndefined(newProcess));
    tx.set(finalLockRef, cleanUndefined(identityLock));
    tx.set(db.collection('pnap_national_inmate_index').doc(finalInmateId), cleanUndefined(indexItem));
    tx.set(db.collection('pnap_admissions').doc(admissionId), cleanUndefined(admissionRecord));
    tx.set(estRef, cleanUndefined(allocated.updatedEst));
    tx.set(statsRef, cleanUndefined(updatedStats));

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: payload.reentry ? 'INMATE_REENTRY_REGISTERED' : 'INMATE_ADMISSION_REGISTERED',
        targetResource: `pnap/provinces/${provinceId}/establishments/${establishmentId}/inmates/${finalInmateId}`,
        details: `Internamento registado: ${newInmate.profile.fullName} (${finalMatricula}) em ${establishment.name} | Cela ${allocated.cellCode} | Processo ${newProcess.processNumber}.`,
        previousState: existingInmate ? resolveEffectiveCustodyState(existingInmate) : 'PRE_ADMISSAO',
        newState: 'ATIVO_NA_UNIDADE',
        resultingVersion: baseVersion
      })
    );

    return { inmate: newInmate, admission: admissionRecord, process: newProcess };
  });
}

/**
 * 2. PROCESSOS JUDICIAIS MÚLTIPLOS (Melhorias #2 & #3)
 */
export async function addJudicialProcessTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    processNumber: string;
    courtName: string;
    judgeName?: string;
    crimeCategory: string;
    penalCodeArticle?: string;
    legalStatus?: Exclude<LegalStatus, 'EXTINTO'>;
    totalSentenceYears?: number;
    totalSentenceMonths?: number;
    startDate?: string;
    expectedVersion?: number;
  }
): Promise<{ inmate: Inmate; process: JudicialProcess }> {
  if (!input.processNumber?.trim() || !input.courtName?.trim() || !input.crimeCategory?.trim()) {
    throw new StateMachineError(
      400,
      'INVALID_PROCESS_DATA',
      'N.º do processo, tribunal e tipologia criminal são obrigatórios.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const procsRef = inmateRef.collection('judicial_processes');
    const [inmateSnap, procsSnap] = await Promise.all([tx.get(inmateRef), tx.get(procsRef)]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const custodyState = resolveEffectiveCustodyState(inmate);

    if (custodyState === 'FALECIDO') {
      throw new StateMachineError(
        409,
        'INMATE_DECEASED',
        'Não é possível vincular processo judicial a recluso com estado FALECIDO.'
      );
    }

    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const indexSnap = await tx.get(indexRef);

    const existingProcs = procsSnap.docs.map((d) => d.data() as JudicialProcess);
    const nowIso = new Date().toISOString();
    const newProcess: JudicialProcess = {
      processId: uniqueId('proc'),
      inmateId,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      processNumber: input.processNumber.trim(),
      courtName: input.courtName.trim(),
      ...(input.judgeName ? { judgeName: input.judgeName.trim() } : {}),
      crimeCategory: input.crimeCategory.trim(),
      penalCodeArticle: input.penalCodeArticle?.trim() || 'N/D',
      legalStatus: input.legalStatus || 'PREVENTIVO',
      totalSentenceYears: Number(input.totalSentenceYears) || 0,
      totalSentenceMonths: Number(input.totalSentenceMonths) || 0,
      startDate: input.startDate?.trim() || nowIso.split('T')[0],
      isActive: true,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const allProcs = [...existingProcs, newProcess];
    const { consolidatedLegalStatus, activeProcessesCount } = consolidateLegalStatus(
      allProcs,
      inmate.legal.legalStatus
    );
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...inmate,
      consolidatedLegalStatus,
      activeProcessesCount,
      legal: {
        ...inmate.legal,
        legalStatus:
          consolidatedLegalStatus === 'EXTINTO'
            ? inmate.legal.legalStatus
            : consolidatedLegalStatus
      },
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(procsRef.doc(newProcess.processId), newProcess);
    tx.set(inmateRef, updatedInmate);
    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      const mergedIdx: NationalInmateIndexItem = {
        ...idx,
        processNumber: idx.processNumber || newProcess.processNumber,
        legalStatus: updatedInmate.legal.legalStatus,
        version: nextVersion,
        lastUpdated: nowIso
      };
      mergedIdx.searchText = buildIndexSearchText(mergedIdx);
      tx.set(indexRef, cleanUndefined(mergedIdx));
    }

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'JUDICIAL_PROCESS_ADDED',
        targetResource: `pnap/inmates/${inmateId}/judicial_processes/${newProcess.processId}`,
        details: `Novo processo judicial vinculado (${newProcess.processNumber} · ${newProcess.legalStatus}) à FUR ${inmate.profile.matricula}. Total ativos: ${activeProcessesCount}.`,
        previousState: inmate.consolidatedLegalStatus || inmate.legal.legalStatus,
        newState: consolidatedLegalStatus,
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { inmate: updatedInmate, process: newProcess };
  });
}

export async function extinguishJudicialProcessTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  processId: string,
  input: { extintionReason: string; extintionDate?: string; expectedVersion?: number }
): Promise<{ inmate: Inmate; process: JudicialProcess }> {
  if (!input.extintionReason?.trim()) {
    throw new StateMachineError(
      400,
      'MISSING_EXTINTION_REASON',
      'Informe o fundamento/alvará de extinção do processo.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const procsRef = inmateRef.collection('judicial_processes');
    const [inmateSnap, procsSnap] = await Promise.all([tx.get(inmateRef), tx.get(procsRef)]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);

    const targetDoc = procsSnap.docs.find((d) => d.id === processId);
    if (!targetDoc) {
      throw new StateMachineError(404, 'PROCESS_NOT_FOUND', 'Processo judicial não encontrado na FUR.');
    }

    const targetProc = targetDoc.data() as JudicialProcess;
    if (!targetProc.isActive) {
      throw new StateMachineError(
        409,
        'PROCESS_ALREADY_EXTINGUISHED',
        `Processo ${targetProc.processNumber} já se encontra extinto.`
      );
    }

    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const indexSnap = await tx.get(indexRef);

    const nowIso = new Date().toISOString();
    const updatedProc: JudicialProcess = {
      ...targetProc,
      legalStatus: 'EXTINTO',
      isActive: false,
      extintionReason: input.extintionReason.trim(),
      extintionDate: input.extintionDate?.trim() || nowIso.split('T')[0],
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const allProcs = procsSnap.docs.map((d) =>
      d.id === processId ? updatedProc : (d.data() as JudicialProcess)
    );
    const { consolidatedLegalStatus, activeProcessesCount } = consolidateLegalStatus(
      allProcs,
      inmate.legal.legalStatus
    );
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...inmate,
      consolidatedLegalStatus,
      activeProcessesCount,
      ...(consolidatedLegalStatus !== 'EXTINTO'
        ? {
            legal: {
              ...inmate.legal,
              legalStatus: consolidatedLegalStatus
            }
          }
        : {}),
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(procsRef.doc(processId), updatedProc);
    tx.set(inmateRef, updatedInmate);
    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(indexRef, {
        ...idx,
        legalStatus: updatedInmate.legal.legalStatus,
        version: nextVersion,
        lastUpdated: nowIso
      });
    }

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'JUDICIAL_PROCESS_EXTINGUISHED',
        targetResource: `pnap/inmates/${inmateId}/judicial_processes/${processId}`,
        details: `Processo ${updatedProc.processNumber} marcado como EXTINTO (${updatedProc.extintionReason}). Processos ativos restantes: ${activeProcessesCount}.`,
        previousState: targetProc.legalStatus,
        newState: 'EXTINTO',
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { inmate: updatedInmate, process: updatedProc };
  });
}

/**
 * 3. TRANSIÇÃO JURÍDICO-PENAL TRANSACIONAL (PREVENTIVO/RECORRENTE ➔ CONDENADO)
 */
export async function legalTransitionTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    processId?: string;
    courtName?: string;
    sentenceAcordaoNumber: string;
    sentenceDate?: string;
    transitDate: string;
    totalSentenceYears: number;
    totalSentenceMonths: number;
    regime?: 'FECHADO' | 'SEMI_ABERTO';
    judgeName?: string;
    notes?: string;
    expectedVersion?: number;
  }
): Promise<{ inmate: Inmate; transition: LegalTransitionRecord }> {
  const years = Math.max(0, Math.floor(Number(input.totalSentenceYears) || 0));
  const extraMonths = Math.max(0, Math.min(11, Math.floor(Number(input.totalSentenceMonths) || 0)));
  const totalMonths = years * 12 + extraMonths;

  if (
    !String(input.sentenceAcordaoNumber || '').trim() ||
    !String(input.transitDate || '').trim() ||
    totalMonths <= 0
  ) {
    throw new StateMachineError(
      400,
      'INVALID_TRANSITION_DATA',
      'Preencha N.º do Mandado/Acórdão, Data de Trânsito e Pena válida.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const procsRef = inmateRef.collection('judicial_processes');
    const [inmateSnap, procsSnap] = await Promise.all([tx.get(inmateRef), tx.get(procsRef)]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }

    const targetInmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(targetInmate, input.expectedVersion);
    const custodyState = resolveEffectiveCustodyState(targetInmate);

    if (custodyState === 'LIBERTADO' || custodyState === 'FALECIDO') {
      throw new StateMachineError(
        409,
        'INMATE_TERMINAL_STATE',
        `Transição rejeitada: Recluso encontra-se em estado terminal (${custodyState}).`
      );
    }

    const existingProcs = procsSnap.docs.map((d) => d.data() as JudicialProcess);
    let targetProc: JudicialProcess | undefined = input.processId
      ? existingProcs.find((p) => p.processId === input.processId)
      : existingProcs.find(
          (p) => p.isActive && (p.legalStatus === 'PREVENTIVO' || p.legalStatus === 'RECORRENTE')
        );

    const statusToCheck = targetProc ? targetProc.legalStatus : targetInmate.legal.legalStatus;
    if (statusToCheck !== 'PREVENTIVO' && statusToCheck !== 'RECORRENTE') {
      throw new StateMachineError(
        409,
        'ALREADY_CONVICTED',
        `Transição já efetuada: situação atual é ${statusToCheck}.`
      );
    }

    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const statsRef = db.collection('pnap_province_stats').doc(targetInmate.provinceId);
    const [indexSnap, statsSnap] = await Promise.all([tx.get(indexRef), tx.get(statsRef)]);

    const nowIso = new Date().toISOString();
    const transitIso = String(input.transitDate).trim();
    const computedEnd = addMonthsIso(
      targetInmate.admission.admissionDate,
      totalMonths,
      transitIso
    );
    const computedParole = addMonthsIso(
      targetInmate.admission.admissionDate,
      Math.max(1, Math.floor(totalMonths / 2)),
      transitIso
    );
    const previousStatus: 'PREVENTIVO' | 'RECORRENTE' =
      statusToCheck === 'RECORRENTE' ? 'RECORRENTE' : 'PREVENTIVO';
    const effectiveCourt = String(input.courtName || '').trim() || targetInmate.admission.courtName;

    const procId = targetProc?.processId || uniqueId('proc');
    const updatedProc: JudicialProcess = {
      processId: procId,
      inmateId,
      provinceId: targetInmate.provinceId,
      establishmentId: targetInmate.establishmentId,
      processNumber: targetProc?.processNumber || targetInmate.admission.processNumber,
      courtName: effectiveCourt,
      judgeName: String(input.judgeName || '').trim() || targetProc?.judgeName || 'Juiz de Direito',
      crimeCategory: targetProc?.crimeCategory || targetInmate.legal.crimeCategory,
      penalCodeArticle: targetProc?.penalCodeArticle || targetInmate.legal.penalCodeArticle,
      legalStatus: 'CONDENADO',
      regime: input.regime === 'SEMI_ABERTO' ? 'SEMI_ABERTO' : 'FECHADO',
      sentenceAcordaoNumber: String(input.sentenceAcordaoNumber).trim(),
      sentenceDate: String(input.sentenceDate || '').trim() || transitIso,
      transitDate: transitIso,
      totalSentenceYears: years,
      totalSentenceMonths: totalMonths,
      startDate: targetProc?.startDate || targetInmate.admission.admissionDate,
      endOfSentenceDate: computedEnd,
      eligibleParoleDate: computedParole,
      isActive: true,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const nextProcs = targetProc
      ? existingProcs.map((p) => (p.processId === procId ? updatedProc : p))
      : [...existingProcs, updatedProc];

    const { consolidatedLegalStatus, activeProcessesCount } = consolidateLegalStatus(
      nextProcs,
      'CONDENADO'
    );
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...targetInmate,
      legal: {
        ...targetInmate.legal,
        legalStatus:
          consolidatedLegalStatus === 'EXTINTO' ? 'CONDENADO' : consolidatedLegalStatus,
        totalSentenceYears: years,
        totalSentenceMonths: totalMonths,
        endOfSentenceDate: computedEnd,
        eligibleParoleDate: computedParole
      },
      consolidatedLegalStatus,
      activeProcessesCount,
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName,
      documents: [
        {
          documentId: `doc-sent-${Date.now()}`,
          title: `Mandado / Sentença: ${String(input.sentenceAcordaoNumber).trim()}`,
          type: 'CERTIDAO_SENTENCA',
          uploadDate: transitIso,
          fileSize: 'Digital (PNAP)'
        },
        ...(targetInmate.documents || [])
      ]
    };

    const transitionRecord: LegalTransitionRecord = {
      transitionId: uniqueId('trn'),
      inmateId,
      processId: procId,
      inmateName: targetInmate.profile.fullName,
      matricula: targetInmate.profile.matricula,
      provinceId: targetInmate.provinceId,
      establishmentId: targetInmate.establishmentId,
      previousStatus,
      newStatus: 'CONDENADO',
      courtName: effectiveCourt,
      sentenceAcordaoNumber: String(input.sentenceAcordaoNumber).trim(),
      sentenceDate: String(input.sentenceDate || '').trim() || transitIso,
      transitDate: transitIso,
      totalSentenceYears: years,
      totalSentenceMonths: extraMonths,
      regime: input.regime === 'SEMI_ABERTO' ? 'SEMI_ABERTO' : 'FECHADO',
      judgeName: String(input.judgeName || '').trim() || 'Juiz de Direito',
      effectiveDate: nowIso,
      registeredBy: actor.user.profile.fullName,
      ...(input.notes ? { notes: String(input.notes).trim() } : {})
    };

    tx.set(procsRef.doc(procId), cleanUndefined(updatedProc));
    tx.set(inmateRef, cleanUndefined(updatedInmate));
    tx.set(
      db.collection('pnap_legal_transitions').doc(transitionRecord.transitionId),
      cleanUndefined(transitionRecord)
    );

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(indexRef, {
        ...idx,
        legalStatus: updatedInmate.legal.legalStatus,
        version: nextVersion,
        lastUpdated: nowIso
      });
    }

    if (statsSnap.exists && targetInmate.legal.legalStatus !== 'CONDENADO') {
      const prevStats = statsSnap.data() as ProvinceStatistics;
      tx.set(statsRef, {
        ...prevStats,
        preventiveCount: Math.max(0, prevStats.preventiveCount - 1),
        convictedCount: prevStats.convictedCount + 1
      });
    }

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'INMATE_LEGAL_TRANSITION',
        targetResource: `pnap/provinces/${targetInmate.provinceId}/inmates/${inmateId}`,
        details: `Transição Penal [PROCESSO ${updatedProc.processNumber}]: ${targetInmate.profile.fullName} (${previousStatus} ➔ CONDENADO) | Acórdão: ${transitionRecord.sentenceAcordaoNumber}.`,
        previousState: previousStatus,
        newState: 'CONDENADO',
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { inmate: updatedInmate, transition: transitionRecord };
  });
}

/**
 * 4. SAÍDA DEFINITIVA RIGOROSA (Melhoria #3) & DESPACHO DE TRANSFERÊNCIA EM 2 ETAPAS (Melhoria #4)
 */
const DEFINITIVE_JUDICIAL_RELEASES: readonly ExitModality[] = [
  'CUMPRIMENTO_PENA',
  'LIBERDADE_CONDICIONAL',
  'LIBERDADE_PROVISORIA',
  'ABSOLVICAO',
  'INDULTO'
];

export async function registerExitTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    modality: ExitModality;
    documentNumber: string;
    authorityOrDetail: string;
    exitDate: string;
    destinationProvinceId?: ProvinceId;
    destinationEstablishmentId?: string;
    notes?: string;
    approvedByDirector?: string | boolean;
    extinguishProcessId?: string;
    expectedVersion?: number;
  }
): Promise<{
  record: ReleaseRecord;
  transfer?: TransferRecord;
  movement?: MovementRecord;
  inmate: Inmate;
}> {
  if (input.modality === 'TRANSFERENCIA') {
    if (!isValidProvinceId(input.destinationProvinceId) || !input.destinationEstablishmentId?.trim()) {
      throw new StateMachineError(
        400,
        'MISSING_TRANSFER_DESTINATION',
        'Indique província e estabelecimento de destino válidos para transferência.'
      );
    }
    const dispatchResult = await dispatchTransferTransactional(db, actor, inmateId, {
      destinationProvinceId: input.destinationProvinceId,
      destinationEstablishmentId: input.destinationEstablishmentId.trim(),
      documentNumber: input.documentNumber,
      securityEscort: input.authorityOrDetail,
      justification: input.notes || `Guia ${input.documentNumber}`,
      exitDate: input.exitDate,
      expectedVersion: input.expectedVersion
    });
    return {
      record: dispatchResult.releaseRecord,
      transfer: dispatchResult.transfer,
      movement: dispatchResult.movement,
      inmate: dispatchResult.inmate
    };
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const procsRef = inmateRef.collection('judicial_processes');
    const [inmateSnap, procsSnap] = await Promise.all([tx.get(inmateRef), tx.get(procsRef)]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Recluso não encontrado no Firestore.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const currentCustody = resolveEffectiveCustodyState(inmate);

    if (
      currentCustody !== 'ATIVO_NA_UNIDADE' &&
      currentCustody !== 'EM_DILIGENCIA_EXTERNA' &&
      currentCustody !== 'HOSPITALIZADO_EXTERNO'
    ) {
      throw new StateMachineError(
        409,
        'DUPLICATE_EXIT_BLOCKED',
        `Saída bloqueada: ${inmate.profile.fullName} encontra-se no estado ${currentCustody}.`
      );
    }

    const isJudicialRelease = DEFINITIVE_JUDICIAL_RELEASES.includes(input.modality);
    const existingProcs = procsSnap.docs.map((d) => d.data() as JudicialProcess);

    // Melhoria 3: Bloqueio de Soltura Definitiva se houver qualquer outro processo ativo + Dupla Verificação (4-olhos)
    let procsAfterExit = existingProcs;
    if (isJudicialRelease) {
      const directorRoles = ['CENTRAL_ADMIN', 'PROVINCIAL_COMMAND', 'ESTABLISHMENT_DIRECTOR'];
      const isDirectorOrCommand = directorRoles.includes(actor.user.assignments.role);
      const rawApprover = input.approvedByDirector;
      const approverName =
        typeof rawApprover === 'string'
          ? rawApprover.trim()
          : rawApprover === true
          ? 'Aprovação Nominal da Direção'
          : '';

      if (!isDirectorOrCommand && (!approverName || approverName === actor.user.profile.fullName)) {
        throw new StateMachineError(
          403,
          'DUAL_APPROVAL_REQUIRED',
          'Dupla validação (4-olhos) obrigatória: soltura definitiva por oficial operacional requer aprovação nominal da Direção/Comando.'
        );
      }

      if (input.extinguishProcessId) {
        procsAfterExit = existingProcs.map((p) =>
          p.processId === input.extinguishProcessId
            ? {
                ...p,
                legalStatus: 'EXTINTO' as const,
                isActive: false,
                extintionReason: `${input.modality} (${input.documentNumber.trim()})`,
                extintionDate: input.exitDate.trim(),
                updatedAt: new Date().toISOString(),
                updatedBy: actor.user.profile.fullName
              }
            : p
        );
      } else if (existingProcs.length === 1 && existingProcs[0].isActive) {
        // Caso padrão de processo único vinculado à soltura judicial
        procsAfterExit = [
          {
            ...existingProcs[0],
            legalStatus: 'EXTINTO',
            isActive: false,
            extintionReason: `${input.modality} (${input.documentNumber.trim()})`,
            extintionDate: input.exitDate.trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: actor.user.profile.fullName
          }
        ];
      }

      const remainingActive = procsAfterExit.filter((p) => p.isActive && p.legalStatus !== 'EXTINTO');
      if (remainingActive.length > 0) {
        throw new StateMachineError(
          409,
          'ACTIVE_PROCESSES_BLOCK_RELEASE',
          `Soltura definitiva bloqueada: recluso possui ${remainingActive.length} processo(s) judicial(is) ainda ativo(s) (${remainingActive
            .map((p) => p.processNumber)
            .join(', ')}).`,
          {
            remainingProcesses: remainingActive.map((p) => ({
              processId: p.processId,
              processNumber: p.processNumber,
              legalStatus: p.legalStatus
            }))
          }
        );
      }
    }

    const estRef = db.collection('pnap_establishments').doc(inmate.establishmentId);
    const statsRef = db.collection('pnap_province_stats').doc(inmate.provinceId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const lockRef = inmate.identityLockKey
      ? db.collection('pnap_identity_locks').doc(inmate.identityLockKey)
      : null;

    const [estSnap, statsSnap, indexSnap, lockSnap] = await Promise.all([
      tx.get(estRef),
      tx.get(statsRef),
      tx.get(indexRef),
      lockRef ? tx.get(lockRef) : Promise.resolve(null)
    ]);

    const resultingCustody: CustodyState =
      input.modality === 'OBITO'
        ? 'FALECIDO'
        : input.modality === 'EVASAO'
        ? 'EVADIDO'
        : 'LIBERTADO';
    const resultingStatus = mapCustodyStateToLegacyStatus(resultingCustody) as
      | 'LIBERTADO'
      | 'FALECIDO'
      | 'EVADIDO';

    const nowIso = new Date().toISOString();
    const nextVersion = currentVersion + 1;
    const legalConsolidation = isJudicialRelease
      ? consolidateLegalStatus(procsAfterExit, inmate.legal.legalStatus)
      : {
          consolidatedLegalStatus: inmate.consolidatedLegalStatus || inmate.legal.legalStatus,
          activeProcessesCount: inmate.activeProcessesCount ?? existingProcs.filter((p) => p.isActive).length
        };

    const updatedInmate: Inmate = {
      ...inmate,
      currentStatus: resultingStatus,
      custodyState: resultingCustody,
      consolidatedLegalStatus: legalConsolidation.consolidatedLegalStatus,
      activeProcessesCount: legalConsolidation.activeProcessesCount,
      version: nextVersion,
      lastMovementAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const releaseRecord: ReleaseRecord = {
      releaseId: uniqueId('rel'),
      inmateId,
      fullName: inmate.profile.fullName,
      matricula: inmate.profile.matricula,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      alvaraNumber: String(input.documentNumber).trim(),
      judgeName: String(input.authorityOrDetail).trim(),
      releaseDate: String(input.exitDate).trim(),
      reason: input.modality,
      resultingStatus,
      ...(input.notes ? { notes: String(input.notes).trim() } : {}),
      registeredBy: actor.user.profile.fullName,
      registeredAt: nowIso,
      approvedByDirector:
        typeof input.approvedByDirector === 'string' && input.approvedByDirector.trim()
          ? input.approvedByDirector.trim()
          : actor.user.profile.fullName
    };

    const movementType: MovementType =
      input.modality === 'OBITO'
        ? 'OBITO'
        : input.modality === 'EVASAO'
        ? 'EVASAO'
        : 'SOLTURA_DEFINITIVA';

    const movement: MovementRecord = {
      movementId: uniqueId('mov'),
      inmateId,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      type: movementType,
      documentNumber: releaseRecord.alvaraNumber,
      authorityOrEscort: releaseRecord.judgeName,
      reserveOriginCell: false,
      timestamp: nowIso,
      registeredByUid: actor.user.uid,
      registeredByName: actor.user.profile.fullName,
      ...(releaseRecord.notes ? { notes: releaseRecord.notes } : {})
    };

    for (const p of procsAfterExit) {
      if (isJudicialRelease && !p.isActive) {
        tx.set(procsRef.doc(p.processId), p);
      }
    }

    tx.set(inmateRef, updatedInmate);
    tx.set(db.collection('pnap_releases').doc(releaseRecord.releaseId), releaseRecord);
    tx.set(db.collection('pnap_movements').doc(movement.movementId), movement);

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(indexRef, {
        ...idx,
        custodyStatus: resultingStatus,
        custodyState: resultingCustody,
        version: nextVersion,
        lastUpdated: nowIso
      });
    }

    if (lockRef && lockSnap && lockSnap.exists) {
      const lock = lockSnap.data() as IdentityLock;
      tx.set(lockRef, {
        ...lock,
        activeCustodyState: resultingCustody,
        lastUpdated: nowIso
      });
    }

    let unitLabel = inmate.establishmentId;
    if (estSnap.exists) {
      const est = estSnap.data() as EstablishmentProfile;
      unitLabel = `${est.name} (${est.establishmentId})`;
      tx.set(estRef, releaseCellInEstablishment(est, inmateId, inmate.cellId));
    }

    const prevStats = statsSnap.exists
      ? (statsSnap.data() as ProvinceStatistics)
      : emptyStats(inmate.provinceId);
    tx.set(
      statsRef,
      buildUpdatedProvinceStatsOnDelta(
        prevStats,
        -1,
        inmate.legal.legalStatus,
        inmate.profile.gender
      )
    );

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'INMATE_EXIT_REGISTERED',
        targetResource: `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmateId}`,
        details: `Saída registada [${input.modality} ➔ ${resultingCustody}]: ${inmate.profile.fullName} (${inmate.profile.matricula}) | Doc: ${releaseRecord.alvaraNumber} | Unidade: ${unitLabel}.`,
        previousState: currentCustody,
        newState: resultingCustody,
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { record: releaseRecord, movement, inmate: updatedInmate };
  });
}

/**
 * TRANSFERÊNCIA EM DUAS ETAPAS — ETAPA 1: DESPACHO NA ORIGEM (Melhoria #4)
 * Liberta vaga na unidade de origem, coloca FUR em EM_TRANSITO_TRANSFERENCIA (sem finalizar como LIBERTADO)
 */
export async function dispatchTransferTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    destinationProvinceId: ProvinceId;
    destinationEstablishmentId: string;
    documentNumber: string;
    securityEscort: string;
    justification: string;
    exitDate?: string;
    expectedVersion?: number;
  }
): Promise<{
  transfer: TransferRecord;
  releaseRecord: ReleaseRecord;
  movement: MovementRecord;
  inmate: Inmate;
}> {
  if (
    !isValidProvinceId(input.destinationProvinceId) ||
    !input.destinationEstablishmentId?.trim() ||
    !input.documentNumber?.trim()
  ) {
    throw new StateMachineError(
      400,
      'INVALID_TRANSFER_DISPATCH',
      'Província de destino, estabelecimento de destino e guia/ofício são obrigatórios.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const destEstRef = db.collection('pnap_establishments').doc(input.destinationEstablishmentId.trim());
    const [inmateSnap, destEstSnap] = await Promise.all([tx.get(inmateRef), tx.get(destEstRef)]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }
    if (!destEstSnap.exists) {
      throw new StateMachineError(
        404,
        'DESTINATION_ESTABLISHMENT_NOT_FOUND',
        'Estabelecimento prisional de destino não encontrado.'
      );
    }

    const destEst = destEstSnap.data() as EstablishmentProfile;
    if (
      destEst.provinceId !== input.destinationProvinceId ||
      destEst.provisioningStatus !== 'HOMOLOGATED'
    ) {
      throw new StateMachineError(
        400,
        'DESTINATION_NOT_HOMOLOGATED',
        'Estabelecimento de destino deve pertencer à província indicada e estar HOMOLOGATED.'
      );
    }

    const inmate = inmateSnap.data() as Inmate;
    if (inmate.establishmentId === destEst.establishmentId) {
      throw new StateMachineError(
        400,
        'SAME_ESTABLISHMENT_TRANSFER',
        'Estabelecimento de destino deve ser diferente da unidade de origem.'
      );
    }

    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const currentCustody = resolveEffectiveCustodyState(inmate);

    if (currentCustody !== 'ATIVO_NA_UNIDADE') {
      throw new StateMachineError(
        409,
        'INMATE_NOT_IN_UNIT_FOR_TRANSFER',
        `Despacho de transferência rejeitado: o recluso deve estar ATIVO_NA_UNIDADE (estado atual: ${currentCustody}).`
      );
    }

    const originEstRef = db.collection('pnap_establishments').doc(inmate.establishmentId);
    const originStatsRef = db.collection('pnap_province_stats').doc(inmate.provinceId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const lockRef = inmate.identityLockKey
      ? db.collection('pnap_identity_locks').doc(inmate.identityLockKey)
      : null;

    const [originEstSnap, originStatsSnap, indexSnap, lockSnap] = await Promise.all([
      tx.get(originEstRef),
      tx.get(originStatsRef),
      tx.get(indexRef),
      lockRef ? tx.get(lockRef) : Promise.resolve(null)
    ]);

    const nowIso = new Date().toISOString();
    const effectiveDate = input.exitDate?.trim() || nowIso.split('T')[0];
    const nextVersion = currentVersion + 1;
    const transferId = uniqueId('trf');

    const transfer: TransferRecord = {
      transferId,
      inmateId,
      inmateName: inmate.profile.fullName,
      matricula: inmate.profile.matricula,
      originProvinceId: inmate.provinceId,
      originEstablishmentId: inmate.establishmentId,
      destinationProvinceId: input.destinationProvinceId,
      destinationEstablishmentId: destEst.establishmentId,
      requestDate: effectiveDate,
      status: 'EM_TRANSITO',
      stage: 'DISPATCHED',
      dispatchedAt: nowIso,
      dispatchedBy: actor.user.profile.fullName,
      justification: String(input.justification || '').trim() || `Guia ${input.documentNumber.trim()}`,
      securityEscort: String(input.securityEscort || '').trim() || 'Escolta PNAP',
      authorizedBy: actor.user.profile.fullName
    };

    const updatedInmate: Inmate = {
      ...inmate,
      currentStatus: 'TRANSFERIDO',
      custodyState: 'EM_TRANSITO_TRANSFERENCIA',
      pendingTransferId: transferId,
      version: nextVersion,
      lastMovementAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const releaseRecord: ReleaseRecord = {
      releaseId: uniqueId('rel'),
      inmateId,
      fullName: inmate.profile.fullName,
      matricula: inmate.profile.matricula,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      alvaraNumber: input.documentNumber.trim(),
      judgeName: transfer.securityEscort,
      releaseDate: effectiveDate,
      reason: 'TRANSFERENCIA',
      resultingStatus: 'TRANSFERIDO',
      destinationProvinceId: input.destinationProvinceId,
      destinationEstablishmentId: destEst.establishmentId,
      notes: transfer.justification,
      registeredBy: actor.user.profile.fullName,
      registeredAt: nowIso
    };

    const movement: MovementRecord = {
      movementId: uniqueId('mov'),
      inmateId,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      type: 'TRANSFERENCIA_DESPACHO',
      documentNumber: input.documentNumber.trim(),
      authorityOrEscort: transfer.securityEscort,
      targetProvinceId: input.destinationProvinceId,
      targetEstablishmentId: destEst.establishmentId,
      destinationLabel: destEst.name,
      reserveOriginCell: false,
      timestamp: nowIso,
      registeredByUid: actor.user.uid,
      registeredByName: actor.user.profile.fullName,
      notes: transfer.justification
    };

    tx.set(inmateRef, updatedInmate);
    tx.set(db.collection('pnap_transfers').doc(transferId), transfer);
    tx.set(db.collection('pnap_releases').doc(releaseRecord.releaseId), releaseRecord);
    tx.set(db.collection('pnap_movements').doc(movement.movementId), movement);

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(indexRef, {
        ...idx,
        custodyStatus: 'TRANSFERIDO',
        custodyState: 'EM_TRANSITO_TRANSFERENCIA',
        version: nextVersion,
        lastUpdated: nowIso
      });
    }

    if (lockRef && lockSnap && lockSnap.exists) {
      const lock = lockSnap.data() as IdentityLock;
      tx.set(lockRef, {
        ...lock,
        activeCustodyState: 'EM_TRANSITO_TRANSFERENCIA',
        lastUpdated: nowIso
      });
    }

    if (originEstSnap.exists) {
      const originEst = originEstSnap.data() as EstablishmentProfile;
      tx.set(originEstRef, releaseCellInEstablishment(originEst, inmateId, inmate.cellId));
    }

    const prevStats = originStatsSnap.exists
      ? (originStatsSnap.data() as ProvinceStatistics)
      : emptyStats(inmate.provinceId);
    tx.set(
      originStatsRef,
      buildUpdatedProvinceStatsOnDelta(
        prevStats,
        -1,
        inmate.legal.legalStatus,
        inmate.profile.gender
      )
    );

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'TRANSFER_DISPATCHED_ORIGIN',
        targetResource: `pnap/transfers/${transferId}`,
        details: `Etapa 1/2 Despacho de Transferência: ${inmate.profile.fullName} (${inmate.provinceId.toUpperCase()} ➔ ${input.destinationProvinceId.toUpperCase()} / ${destEst.name}). Vaga de origem libertada.`,
        previousState: currentCustody,
        newState: 'EM_TRANSITO_TRANSFERENCIA',
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { transfer, releaseRecord, movement, inmate: updatedInmate };
  });
}

/**
 * TRANSFERÊNCIA EM DUAS ETAPAS — ETAPA 2: RECEPÇÃO NO DESTINO (Melhoria #4)
 * Aloca cela no destino, atualiza unidade/província na FUR + processos e coloca em ATIVO_NA_UNIDADE.
 */
export async function receiveTransferTransactional(
  db: Firestore,
  actor: ActorContext,
  transferId: string,
  input: {
    targetPavilionId?: string;
    targetBlockId?: string;
    targetCellId?: string;
    notes?: string;
    expectedVersion?: number;
  }
): Promise<{ transfer: TransferRecord; movement: MovementRecord; inmate: Inmate }> {
  return db.runTransaction(async (tx) => {
    const trfRef = db.collection('pnap_transfers').doc(transferId);
    const trfSnap = await tx.get(trfRef);
    if (!trfSnap.exists) {
      throw new StateMachineError(404, 'TRANSFER_NOT_FOUND', 'Guia de transferência não encontrada.');
    }

    const transfer = trfSnap.data() as TransferRecord;
    if (transfer.status !== 'EM_TRANSITO' && transfer.stage !== 'DISPATCHED') {
      throw new StateMachineError(
        409,
        'TRANSFER_NOT_IN_TRANSIT',
        `Recepção recusada: guia ${transferId} está em estado ${transfer.status} (esperado EM_TRANSITO).`
      );
    }

    const inmateRef = db.collection('pnap_inmates').doc(transfer.inmateId);
    const procsRef = inmateRef.collection('judicial_processes');
    const destEstRef = db.collection('pnap_establishments').doc(transfer.destinationEstablishmentId);
    const destStatsRef = db.collection('pnap_province_stats').doc(transfer.destinationProvinceId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(transfer.inmateId);

    const [inmateSnap, procsSnap, destEstSnap, destStatsSnap, indexSnap] = await Promise.all([
      tx.get(inmateRef),
      tx.get(procsRef),
      tx.get(destEstRef),
      tx.get(destStatsRef),
      tx.get(indexRef)
    ]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'FUR do recluso transferido não encontrada.');
    }
    if (!destEstSnap.exists) {
      throw new StateMachineError(
        404,
        'DESTINATION_ESTABLISHMENT_NOT_FOUND',
        'Estabelecimento de destino não encontrado.'
      );
    }

    const inmate = inmateSnap.data() as Inmate;
    const lockRef = inmate.identityLockKey
      ? db.collection('pnap_identity_locks').doc(inmate.identityLockKey)
      : null;
    const lockSnap = lockRef ? await tx.get(lockRef) : null;

    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const currentCustody = resolveEffectiveCustodyState(inmate);

    if (currentCustody !== 'EM_TRANSITO_TRANSFERENCIA') {
      throw new StateMachineError(
        409,
        'INMATE_NOT_IN_TRANSIT',
        `Recepção recusada: recluso não está EM_TRANSITO_TRANSFERENCIA (estado atual: ${currentCustody}).`
      );
    }

    const destEst = destEstSnap.data() as EstablishmentProfile;
    if (destEst.provisioningStatus !== 'HOMOLOGATED') {
      throw new StateMachineError(
        400,
        'DESTINATION_NOT_HOMOLOGATED',
        'Estabelecimento de destino não está HOMOLOGATED.'
      );
    }

    const allocated = allocateCellInEstablishment(
      destEst,
      inmate.inmateId,
      input.targetPavilionId,
      input.targetBlockId,
      input.targetCellId
    );

    const nowIso = new Date().toISOString();
    const nextVersion = currentVersion + 1;

    const updatedTransfer: TransferRecord = {
      ...transfer,
      status: 'CONCLUIDO',
      stage: 'RECEIVED',
      receivedAt: nowIso,
      receivedBy: actor.user.profile.fullName,
      targetPavilionId: allocated.pavilionId,
      targetBlockId: allocated.blockId,
      targetCellId: allocated.cellId
    };

    const updatedInmate: Inmate = {
      ...inmate,
      provinceId: transfer.destinationProvinceId,
      establishmentId: destEst.establishmentId,
      pavilionId: allocated.pavilionId,
      blockId: allocated.blockId,
      cellId: allocated.cellId,
      currentStatus: 'ATIVO',
      custodyState: 'ATIVO_NA_UNIDADE',
      pendingTransferId: undefined,
      version: nextVersion,
      lastMovementAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };
    delete updatedInmate.pendingTransferId;

    const movement: MovementRecord = {
      movementId: uniqueId('mov'),
      inmateId: inmate.inmateId,
      provinceId: transfer.destinationProvinceId,
      establishmentId: destEst.establishmentId,
      type: 'TRANSFERENCIA_RECEPCAO',
      documentNumber: transfer.transferId,
      authorityOrEscort: transfer.securityEscort,
      targetPavilionId: allocated.pavilionId,
      targetBlockId: allocated.blockId,
      targetCellId: allocated.cellId,
      reserveOriginCell: false,
      timestamp: nowIso,
      registeredByUid: actor.user.uid,
      registeredByName: actor.user.profile.fullName,
      ...(input.notes ? { notes: String(input.notes).trim() } : {})
    };

    // Sincronizar provinceId/establishmentId nos processos judiciais da FUR para manter isolamento provincial
    procsSnap.docs.forEach((docSnap) => {
      const p = docSnap.data() as JudicialProcess;
      tx.set(procsRef.doc(docSnap.id), {
        ...p,
        provinceId: transfer.destinationProvinceId,
        establishmentId: destEst.establishmentId
      });
    });

    tx.set(trfRef, updatedTransfer);
    tx.set(inmateRef, updatedInmate);
    tx.set(db.collection('pnap_movements').doc(movement.movementId), movement);
    tx.set(destEstRef, allocated.updatedEst);

    const prevStats = destStatsSnap.exists
      ? (destStatsSnap.data() as ProvinceStatistics)
      : emptyStats(transfer.destinationProvinceId);
    tx.set(
      destStatsRef,
      buildUpdatedProvinceStatsOnDelta(
        prevStats,
        1,
        inmate.legal.legalStatus,
        inmate.profile.gender
      )
    );

    if (indexSnap.exists) {
      tx.set(
        indexRef,
        cleanUndefined(
          buildNationalIndexItemWithSearch(updatedInmate, destEst.name, allocated.cellCode, nowIso)
        )
      );
    }

    if (lockRef && lockSnap && lockSnap.exists) {
      const lock = lockSnap.data() as IdentityLock;
      tx.set(lockRef, {
        ...lock,
        activeCustodyState: 'ATIVO_NA_UNIDADE',
        lastUpdated: nowIso
      });
    }

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'TRANSFER_RECEIVED_DESTINATION',
        targetResource: `pnap/transfers/${transferId}`,
        details: `Etapa 2/2 Recepção de Transferência: ${inmate.profile.fullName} integrado em ${destEst.name} (${transfer.destinationProvinceId.toUpperCase()}) · Cela ${allocated.cellCode}.`,
        previousState: 'EM_TRANSITO_TRANSFERENCIA',
        newState: 'ATIVO_NA_UNIDADE',
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { transfer: updatedTransfer, movement, inmate: updatedInmate };
  });
}

/**
 * 5. RECAPTURA DE RECLUSO EVADIDO (Melhoria #5)
 * Restaura a mesma FUR/matrícula preservando todo o histórico criminal, disciplinar e processos.
 */
export async function recaptureInmateTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    provinceId: ProvinceId;
    establishmentId: string;
    pavilionId?: string;
    blockId?: string;
    cellId?: string;
    documentNumber: string;
    authorityOrEscort: string;
    notes?: string;
    expectedVersion?: number;
  }
): Promise<{ inmate: Inmate; movement: MovementRecord }> {
  if (
    !isValidProvinceId(input.provinceId) ||
    !input.establishmentId?.trim() ||
    !input.documentNumber?.trim()
  ) {
    throw new StateMachineError(
      400,
      'INVALID_RECAPTURE_DATA',
      'Província, estabelecimento de recolha e auto de recaptura são obrigatórios.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const procsRef = inmateRef.collection('judicial_processes');
    const estRef = db.collection('pnap_establishments').doc(input.establishmentId.trim());
    const statsRef = db.collection('pnap_province_stats').doc(input.provinceId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);

    const [inmateSnap, procsSnap, estSnap, statsSnap, indexSnap] = await Promise.all([
      tx.get(inmateRef),
      tx.get(procsRef),
      tx.get(estRef),
      tx.get(statsRef),
      tx.get(indexRef)
    ]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }
    if (!estSnap.exists) {
      throw new StateMachineError(
        404,
        'ESTABLISHMENT_NOT_FOUND',
        'Estabelecimento de recolha não encontrado.'
      );
    }

    const inmate = inmateSnap.data() as Inmate;
    const lockRef = inmate.identityLockKey
      ? db.collection('pnap_identity_locks').doc(inmate.identityLockKey)
      : null;
    const lockSnap = lockRef ? await tx.get(lockRef) : null;

    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const currentCustody = resolveEffectiveCustodyState(inmate);

    if (currentCustody !== 'EVADIDO') {
      throw new StateMachineError(
        409,
        'RECAPTURE_ONLY_FROM_EVADED',
        `Recaptura permitida apenas para estado EVADIDO (estado atual: ${currentCustody}).`
      );
    }

    const est = estSnap.data() as EstablishmentProfile;
    if (est.provinceId !== input.provinceId || est.provisioningStatus !== 'HOMOLOGATED') {
      throw new StateMachineError(
        400,
        'ESTABLISHMENT_NOT_HOMOLOGATED',
        'Estabelecimento de recolha deve pertencer à província indicada e estar HOMOLOGATED.'
      );
    }

    const allocated = allocateCellInEstablishment(
      est,
      inmateId,
      input.pavilionId,
      input.blockId,
      input.cellId
    );

    const nowIso = new Date().toISOString();
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...inmate,
      provinceId: input.provinceId,
      establishmentId: est.establishmentId,
      pavilionId: allocated.pavilionId,
      blockId: allocated.blockId,
      cellId: allocated.cellId,
      currentStatus: 'ATIVO',
      custodyState: 'ATIVO_NA_UNIDADE',
      version: nextVersion,
      lastMovementAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const movement: MovementRecord = {
      movementId: uniqueId('mov'),
      inmateId,
      provinceId: input.provinceId,
      establishmentId: est.establishmentId,
      type: 'RECAPTURA',
      documentNumber: input.documentNumber.trim(),
      authorityOrEscort: String(input.authorityOrEscort || '').trim() || 'Força de Segurança / PNAP',
      targetPavilionId: allocated.pavilionId,
      targetBlockId: allocated.blockId,
      targetCellId: allocated.cellId,
      reserveOriginCell: false,
      timestamp: nowIso,
      registeredByUid: actor.user.uid,
      registeredByName: actor.user.profile.fullName,
      ...(input.notes ? { notes: String(input.notes).trim() } : {})
    };

    procsSnap.docs.forEach((docSnap) => {
      const p = docSnap.data() as JudicialProcess;
      tx.set(procsRef.doc(docSnap.id), {
        ...p,
        provinceId: input.provinceId,
        establishmentId: est.establishmentId
      });
    });

    tx.set(inmateRef, updatedInmate);
    tx.set(db.collection('pnap_movements').doc(movement.movementId), movement);
    tx.set(estRef, allocated.updatedEst);

    const prevStats = statsSnap.exists
      ? (statsSnap.data() as ProvinceStatistics)
      : emptyStats(input.provinceId);
    tx.set(
      statsRef,
      buildUpdatedProvinceStatsOnDelta(
        prevStats,
        1,
        inmate.legal.legalStatus,
        inmate.profile.gender
      )
    );

    if (indexSnap.exists) {
      tx.set(
        indexRef,
        cleanUndefined(
          buildNationalIndexItemWithSearch(updatedInmate, est.name, allocated.cellCode, nowIso)
        )
      );
    }

    if (lockRef && lockSnap && lockSnap.exists) {
      const lock = lockSnap.data() as IdentityLock;
      tx.set(lockRef, {
        ...lock,
        activeCustodyState: 'ATIVO_NA_UNIDADE',
        lastUpdated: nowIso
      });
    }

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: 'INMATE_RECAPTURED',
        targetResource: `pnap/provinces/${input.provinceId}/establishments/${est.establishmentId}/inmates/${inmateId}`,
        details: `RECAPTURA registada sobre a mesma FUR (${inmate.profile.matricula}): ${inmate.profile.fullName} reintegrado em ${est.name} · Cela ${allocated.cellCode}. Auto: ${movement.documentNumber}.`,
        previousState: 'EVADIDO',
        newState: 'ATIVO_NA_UNIDADE',
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { inmate: updatedInmate, movement };
  });
}

/**
 * 6. MOVIMENTAÇÕES TEMPORÁRIAS COM RESERVA DE VAGA NA CELA (Diligência / Hospitalização)
 */
const TEMPORARY_MOVEMENT_TRANSITIONS: Record<
  'SAIDA_DILIGENCIA' | 'RETORNO_DILIGENCIA' | 'HOSPITALIZACAO_EXTERNA' | 'RETORNO_HOSPITAL',
  { allowedFrom: CustodyState[]; target: CustodyState }
> = {
  SAIDA_DILIGENCIA: {
    allowedFrom: ['ATIVO_NA_UNIDADE'],
    target: 'EM_DILIGENCIA_EXTERNA'
  },
  RETORNO_DILIGENCIA: {
    allowedFrom: ['EM_DILIGENCIA_EXTERNA'],
    target: 'ATIVO_NA_UNIDADE'
  },
  HOSPITALIZACAO_EXTERNA: {
    allowedFrom: ['ATIVO_NA_UNIDADE', 'EM_DILIGENCIA_EXTERNA'],
    target: 'HOSPITALIZADO_EXTERNO'
  },
  RETORNO_HOSPITAL: {
    allowedFrom: ['HOSPITALIZADO_EXTERNO'],
    target: 'ATIVO_NA_UNIDADE'
  }
};

export async function registerTemporaryMovementTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    type: 'SAIDA_DILIGENCIA' | 'RETORNO_DILIGENCIA' | 'HOSPITALIZACAO_EXTERNA' | 'RETORNO_HOSPITAL';
    documentNumber: string;
    authorityOrEscort: string;
    destinationLabel?: string;
    notes?: string;
    expectedVersion?: number;
  }
): Promise<{ inmate: Inmate; movement: MovementRecord }> {
  const rule = TEMPORARY_MOVEMENT_TRANSITIONS[input.type];
  if (!rule) {
    throw new StateMachineError(
      400,
      'INVALID_MOVEMENT_TYPE',
      'Tipo de movimentação temporária inválido.'
    );
  }
  if (!input.documentNumber?.trim() || !input.authorityOrEscort?.trim()) {
    throw new StateMachineError(
      400,
      'MISSING_MOVEMENT_FIELDS',
      'Documento/ofício e autoridade/escolta são obrigatórios.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const [inmateSnap, indexSnap] = await Promise.all([tx.get(inmateRef), tx.get(indexRef)]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const lockRef = inmate.identityLockKey
      ? db.collection('pnap_identity_locks').doc(inmate.identityLockKey)
      : null;
    const lockSnap = lockRef ? await tx.get(lockRef) : null;

    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const currentCustody = resolveEffectiveCustodyState(inmate);

    if (!rule.allowedFrom.includes(currentCustody)) {
      throw new StateMachineError(
        409,
        'INVALID_STATE_TRANSITION',
        `Transição inválida para ${input.type}: estado atual é ${currentCustody} (esperado: ${rule.allowedFrom.join(' ou ')}).`
      );
    }

    const nowIso = new Date().toISOString();
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...inmate,
      currentStatus: 'ATIVO',
      custodyState: rule.target,
      version: nextVersion,
      lastMovementAt: nowIso,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    const movement: MovementRecord = {
      movementId: uniqueId('mov'),
      inmateId,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      type: input.type,
      documentNumber: input.documentNumber.trim(),
      authorityOrEscort: input.authorityOrEscort.trim(),
      ...(input.destinationLabel ? { destinationLabel: input.destinationLabel.trim() } : {}),
      reserveOriginCell: true,
      timestamp: nowIso,
      registeredByUid: actor.user.uid,
      registeredByName: actor.user.profile.fullName,
      ...(input.notes ? { notes: input.notes.trim() } : {})
    };

    tx.set(inmateRef, updatedInmate);
    tx.set(db.collection('pnap_movements').doc(movement.movementId), movement);

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(indexRef, {
        ...idx,
        custodyStatus: 'ATIVO',
        custodyState: rule.target,
        version: nextVersion,
        lastUpdated: nowIso
      });
    }

    if (lockRef && lockSnap && lockSnap.exists) {
      const lock = lockSnap.data() as IdentityLock;
      tx.set(lockRef, {
        ...lock,
        activeCustodyState: rule.target,
        lastUpdated: nowIso
      });
    }

    writeTxAuditLog(
      tx,
      db,
      buildAuditRecord(actor, {
        action: `INMATE_MOVEMENT_${input.type}`,
        targetResource: `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmateId}`,
        details: `Movimentação temporária [${input.type}]: ${inmate.profile.fullName} (${currentCustody} ➔ ${rule.target}) | Vaga na cela ${inmate.cellId} reservada | Doc: ${movement.documentNumber}.`,
        previousState: currentCustody,
        newState: rule.target,
        expectedVersion: currentVersion,
        resultingVersion: nextVersion
      })
    );

    return { inmate: updatedInmate, movement };
  });
}
