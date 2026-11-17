import type { Firestore } from 'firebase-admin/firestore';
import type {
  AuditLogEvent,
  EstablishmentProfile,
  HealthAlertSummary,
  HealthRecord,
  Inmate,
  InmateIncident,
  InmateVisit,
  InmateVisitor,
  NationalInmateIndexItem,
  PnapCatalog,
  UserRole,
  VisitRecord,
  VisitorRecord
} from '../src/types/pnap';
import { buildIndexSearchText, buildVisitorKeywords } from '../src/utils/inmateSearch';
import {
  StateMachineError,
  assertExpectedVersion,
  normalizeIdSegment,
  resolveEffectiveCustodyState,
  type ActorContext
} from './stateMachine';

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

/**
 * Melhoria 6: Redação de dados clínicos sensíveis quando o solicitante NÃO é HEALTH_SPECIALIST.
 * Mantém apenas projeções operacionais não-clínicas (healthAlerts, alergias críticas e dieta).
 */
export function redactInmateClinicalData(inmate: Inmate, callerRole: UserRole): Inmate {
  if (callerRole === 'HEALTH_SPECIALIST') {
    return inmate;
  }
  return {
    ...inmate,
    health: {
      bloodType: inmate.health?.bloodType || 'N/D',
      chronicDiseases: [],
      allergies: inmate.healthAlerts?.allergyFlags || inmate.health?.allergies || [],
      dailyMedication: [],
      mentalHealthStatus: '[SIGILO CLÍNICO — ACESSO RESTRITO A SAÚDE]',
      lastMedicalCheckup: inmate.health?.lastMedicalCheckup || '',
      dietaryRestrictions:
        (inmate.healthAlerts?.dietFlags || []).join(', ') ||
        inmate.health?.dietaryRestrictions ||
        'Sem restrições'
    }
  };
}

/**
 * MÓDULO SAÚDE (Sigilo Clínico estrito a HEALTH_SPECIALIST)
 */
export async function listHealthRecords(
  db: Firestore,
  actor: ActorContext,
  inmateId: string
): Promise<{ records: HealthRecord[]; healthAlerts?: HealthAlertSummary }> {
  const inmateRef = db.collection('pnap_inmates').doc(inmateId);
  const inmateSnap = await inmateRef.get();
  if (!inmateSnap.exists) {
    throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
  }

  const inmate = inmateSnap.data() as Inmate;
  const recordsSnap = await inmateRef.collection('health_records').get();
  const records = recordsSnap.docs
    .map((d) => d.data() as HealthRecord)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  await db
    .collection('pnap_audit_logs')
    .doc(uniqueId('evt'))
    .set(
      cleanUndefined(
        buildAuditRecord(actor, {
          action: 'CLINICAL_RECORDS_ACCESSED',
          targetResource: `pnap/inmates/${inmateId}/health_records`,
          details: `Consulta clínica autorizada por especialista de saúde à FUR ${inmate.profile.matricula}.`
        })
      )
    );

  return { records, healthAlerts: inmate.healthAlerts };
}

export async function recordClinicalEvaluationTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    bloodType?: string;
    clinicalDiagnosis: string;
    chronicDiseases?: string[];
    prescribedMedication?: string[];
    mentalHealthNotes?: string;
    clinicalObservations?: string;
    triageOutcome: HealthRecord['triageOutcome'];
    infectiousRisk?: boolean;
    suicideRisk?: boolean;
    mobilityRestricted?: boolean;
    allergyFlags?: string[];
    dietFlags?: string[];
    expectedVersion?: number;
  }
): Promise<{
  record: HealthRecord;
  healthAlerts: HealthAlertSummary;
  version: number;
}> {
  if (!input.clinicalDiagnosis?.trim()) {
    throw new StateMachineError(
      400,
      'MISSING_CLINICAL_DIAGNOSIS',
      'O diagnóstico ou resumo clínico é obrigatório para o prontuário.'
    );
  }
  const validOutcomes: HealthRecord['triageOutcome'][] = [
    'APTO_COMUM',
    'ISOLAMENTO_SANITARIO',
    'ENFERMARIA',
    'HOSPITAL_EXTERNO'
  ];
  if (!validOutcomes.includes(input.triageOutcome)) {
    throw new StateMachineError(
      400,
      'INVALID_TRIAGE_OUTCOME',
      'Resultado de triagem clínica inválido.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const inmateSnap = await tx.get(inmateRef);
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
        'Não é possível registar avaliação clínica em recluso FALECIDO.'
      );
    }

    const nowIso = new Date().toISOString();
    const recordId = uniqueId('hr');
    const healthRecord: HealthRecord = {
      recordId,
      inmateId,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      ...(input.bloodType ? { bloodType: input.bloodType.trim() } : {}),
      clinicalDiagnosis: input.clinicalDiagnosis.trim(),
      chronicDiseases: Array.isArray(input.chronicDiseases)
        ? input.chronicDiseases.map((s) => String(s).trim()).filter(Boolean)
        : [],
      prescribedMedication: Array.isArray(input.prescribedMedication)
        ? input.prescribedMedication.map((s) => String(s).trim()).filter(Boolean)
        : [],
      mentalHealthNotes: String(input.mentalHealthNotes || '').trim() || 'Sem notas psiquiátricas',
      clinicalObservations: String(input.clinicalObservations || '').trim(),
      triageOutcome: input.triageOutcome,
      recordedByUid: actor.user.uid,
      recordedByName: actor.user.profile.fullName,
      recordedAt: nowIso
    };

    const allergyFlags = Array.isArray(input.allergyFlags)
      ? input.allergyFlags.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const dietFlags = Array.isArray(input.dietFlags)
      ? input.dietFlags.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const infectiousRisk = Boolean(
      input.infectiousRisk || input.triageOutcome === 'ISOLAMENTO_SANITARIO'
    );
    const suicideRisk = Boolean(input.suicideRisk);
    const mobilityRestricted = Boolean(input.mobilityRestricted);
    const specialUnitRecommended = input.triageOutcome !== 'APTO_COMUM';

    const healthAlerts: HealthAlertSummary = {
      hasActiveAlerts:
        infectiousRisk ||
        suicideRisk ||
        mobilityRestricted ||
        specialUnitRecommended ||
        allergyFlags.length > 0 ||
        dietFlags.length > 0,
      infectiousRisk,
      suicideRisk,
      mobilityRestricted,
      allergyFlags,
      dietFlags,
      specialUnitRecommended,
      lastTriagedAt: nowIso
    };

    const nextVersion = currentVersion + 1;
    // Na raiz da FUR gravamos apenas projeção não-clínica (zero patologias/medicação sensível)
    const updatedInmate: Inmate = {
      ...inmate,
      healthAlerts,
      health: {
        bloodType: input.bloodType?.trim() || inmate.health?.bloodType || 'N/D',
        chronicDiseases: [],
        allergies: allergyFlags,
        dailyMedication: [],
        mentalHealthStatus: '[SIGILO CLÍNICO — SUBCOLEÇÃO ISOLADA]',
        lastMedicalCheckup: nowIso.split('T')[0],
        dietaryRestrictions: dietFlags.join(', ') || 'Sem restrições especiais'
      },
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(inmateRef.collection('health_records').doc(recordId), cleanUndefined(healthRecord));
    tx.set(inmateRef, cleanUndefined(updatedInmate));

    // Auditoria não expõe diagnóstico clínico (apenas metadados de triagem e versão)
    const auditEvt = buildAuditRecord(actor, {
      action: 'CLINICAL_TRIAGE_RECORDED',
      targetResource: `pnap/inmates/${inmateId}/health_records/${recordId}`,
      details: `Avaliação clínica registada por ${actor.user.profile.fullName} (Resultado: ${healthRecord.triageOutcome} | Alertas operacionais projetados: ${healthAlerts.hasActiveAlerts ? 'SIM' : 'NÃO'}).`,
      expectedVersion: currentVersion,
      resultingVersion: nextVersion
    });
    tx.set(db.collection('pnap_audit_logs').doc(auditEvt.eventId), cleanUndefined(auditEvt));

    return { record: healthRecord, healthAlerts, version: nextVersion };
  });
}

/**
 * MÓDULO REABILITAÇÃO, CLASSIFICAÇÃO & ALOJAMENTO COMPATÍVEL
 */
export async function updateRehabilitationTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    educationLevel?: string;
    coursesEnrolled?: string[];
    jobAssignment?: string;
    meritPoints?: number;
    conductClassification?: Inmate['rehabilitation']['conductClassification'];
    riskLevel?: Inmate['rehabilitation']['riskLevel'];
    cellCompatibilityFlags?: string[];
    reintegrationPlanStatus?: Inmate['postInstitutional']['reintegrationPlanStatus'];
    familyShelterConfirmed?: boolean;
    assignedSocialWorker?: string;
    vocationalRecommendation?: string;
    targetPavilionId?: string;
    targetBlockId?: string;
    targetCellId?: string;
    securityOverride?: boolean;
    expectedVersion?: number;
  }
): Promise<{ inmate: Inmate }> {
  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(inmateId);
    const inmateSnap = await tx.get(inmateRef);
    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'Ficha Única do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const custodyState = resolveEffectiveCustodyState(inmate);

    if (custodyState === 'LIBERTADO' || custodyState === 'FALECIDO') {
      throw new StateMachineError(
        409,
        'INMATE_TERMINAL_STATE',
        `Reabilitação rejeitada: Recluso encontra-se em estado terminal (${custodyState}).`
      );
    }

    const estRef = db.collection('pnap_establishments').doc(inmate.establishmentId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
    const [estSnap, indexSnap] = await Promise.all([tx.get(estRef), tx.get(indexRef)]);

    const nextRiskLevel = input.riskLevel ?? inmate.rehabilitation?.riskLevel;
    let nextPavilionId = inmate.pavilionId;
    let nextBlockId = inmate.blockId;
    let nextCellId = inmate.cellId;
    let resolvedCellCode = inmate.cellId;
    let healthSafetyNote = '';
    let updatedEst: EstablishmentProfile | null = null;

    if (input.targetCellId && input.targetCellId !== inmate.cellId) {
      if (custodyState !== 'ATIVO_NA_UNIDADE') {
        throw new StateMachineError(
          409,
          'CELL_CHANGE_REQUIRES_ACTIVE_CUSTODY',
          `Realojamento de cela exige custódia ATIVO_NA_UNIDADE (atual: ${custodyState}).`
        );
      }
      if (!estSnap.exists) {
        throw new StateMachineError(
          404,
          'ESTABLISHMENT_NOT_FOUND',
          'Estabelecimento do recluso não encontrado.'
        );
      }

      const est = estSnap.data() as EstablishmentProfile;
      let foundTarget = false;
      let newPav = inmate.pavilionId;
      let newBlk = inmate.blockId;

      const pavsWithMove = (est.pavilions || []).map((pav) => ({
        ...pav,
        blocks: (pav.blocks || []).map((blk) => ({
          ...blk,
          cells: (blk.cells || []).map((cell) => {
            const isTarget =
              cell.cellId === input.targetCellId || cell.code === input.targetCellId;
            const isSource = cell.cellId === inmate.cellId || cell.inmateIds.includes(inmateId);

            if (isTarget) {
              if (cell.currentOccupants >= cell.capacity && !cell.inmateIds.includes(inmateId)) {
                throw new StateMachineError(
                  409,
                  'CELL_CAPACITY_EXCEEDED',
                  `Cela de destino ${cell.code} já está lotada (${cell.currentOccupants}/${cell.capacity}).`
                );
              }
              if (
                nextRiskLevel === 'MAXIMO' &&
                cell.securityLevel === 'MINIMA' &&
                !input.securityOverride
              ) {
                throw new StateMachineError(
                  409,
                  'CELL_SECURITY_MISMATCH',
                  `Incompatibilidade de segurança: recluso de risco MAXIMO não pode ser alocado à cela ${cell.code} (segurança MINIMA) sem autorização de Direção.`
                );
              }
              if (
                inmate.healthAlerts?.infectiousRisk &&
                cell.securityLevel !== 'DISCIPLINAR' &&
                !input.securityOverride
              ) {
                healthSafetyNote = ' · Alerta sanitário: risco infeccioso ativo';
              }
              foundTarget = true;
              newPav = pav.pavilionId;
              newBlk = blk.blockId;
              nextCellId = cell.cellId;
              resolvedCellCode = cell.code;
              return cell.inmateIds.includes(inmateId)
                ? cell
                : {
                    ...cell,
                    currentOccupants: cell.currentOccupants + 1,
                    inmateIds: [...cell.inmateIds, inmateId]
                  };
            }

            if (isSource) {
              return {
                ...cell,
                currentOccupants: Math.max(0, cell.currentOccupants - 1),
                inmateIds: cell.inmateIds.filter((id) => id !== inmateId)
              };
            }
            return cell;
          })
        }))
      }));

      if (!foundTarget) {
        throw new StateMachineError(
          400,
          'CELL_NOT_FOUND',
          `Cela "${input.targetCellId}" não encontrada em ${est.name}.`
        );
      }

      nextPavilionId = newPav;
      nextBlockId = newBlk;
      updatedEst = { ...est, pavilions: pavsWithMove };
    }

    const nowIso = new Date().toISOString();
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...inmate,
      pavilionId: nextPavilionId,
      blockId: nextBlockId,
      cellId: nextCellId,
      rehabilitation: {
        ...inmate.rehabilitation,
        ...(input.educationLevel !== undefined ? { educationLevel: input.educationLevel.trim() } : {}),
        ...(input.coursesEnrolled !== undefined ? { coursesEnrolled: input.coursesEnrolled } : {}),
        ...(input.jobAssignment !== undefined ? { jobAssignment: input.jobAssignment.trim() } : {}),
        ...(input.meritPoints !== undefined ? { meritPoints: Number(input.meritPoints) } : {}),
        ...(input.conductClassification !== undefined
          ? { conductClassification: input.conductClassification }
          : {}),
        ...(nextRiskLevel !== undefined ? { riskLevel: nextRiskLevel } : {}),
        ...(input.cellCompatibilityFlags !== undefined
          ? { cellCompatibilityFlags: input.cellCompatibilityFlags }
          : {})
      },
      postInstitutional: {
        ...inmate.postInstitutional,
        ...(input.reintegrationPlanStatus !== undefined
          ? { reintegrationPlanStatus: input.reintegrationPlanStatus }
          : {}),
        ...(input.familyShelterConfirmed !== undefined
          ? { familyShelterConfirmed: Boolean(input.familyShelterConfirmed) }
          : {}),
        ...(input.assignedSocialWorker !== undefined
          ? { assignedSocialWorker: input.assignedSocialWorker.trim() }
          : {}),
        ...(input.vocationalRecommendation !== undefined
          ? { vocationalRecommendation: input.vocationalRecommendation.trim() }
          : {})
      },
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(inmateRef, cleanUndefined(updatedInmate));
    if (updatedEst) {
      tx.set(estRef, cleanUndefined(updatedEst));
    }
    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      const mergedIdx: NationalInmateIndexItem = {
        ...idx,
        pavilionName: nextPavilionId,
        cellCode: resolvedCellCode,
        version: nextVersion,
        lastUpdated: nowIso
      };
      mergedIdx.searchText = buildIndexSearchText(mergedIdx);
      tx.set(indexRef, cleanUndefined(mergedIdx));
    }

    const auditEvt = buildAuditRecord(actor, {
      action: 'INMATE_REHABILITATION_UPDATED',
      targetResource: `pnap/inmates/${inmateId}`,
      details: `Classificação/Reabilitação atualizada (${inmate.profile.fullName} · Risco: ${nextRiskLevel || 'N/D'} · Conduta: ${updatedInmate.rehabilitation.conductClassification}${updatedEst ? ` · Realojado para cela ${resolvedCellCode}` : ''}${healthSafetyNote}).`,
      expectedVersion: currentVersion,
      resultingVersion: nextVersion
    });
    tx.set(db.collection('pnap_audit_logs').doc(auditEvt.eventId), cleanUndefined(auditEvt));

    return { inmate: updatedInmate };
  });
}

/**
 * MÓDULO INCIDENTES & SANÇÕES DISCIPLINARES (Bloqueio automático de visitas se aplicável)
 */
export async function registerIncidentAndSanctionTransactional(
  db: Firestore,
  actor: ActorContext,
  inmateId: string,
  input: {
    type: InmateIncident['type'];
    severity: InmateIncident['severity'];
    description: string;
    actionsTaken: string;
    date?: string;
    sanctionMeasure?: string;
    visitsBlockedUntil?: string;
    meritPenaltyPoints?: number;
    source?: 'INTERNO' | 'VISITA';
    visitorId?: string;
    visitorName?: string;
    visitorBi?: string;
    suspendVisitorId?: string;
    expectedVersion?: number;
  }
): Promise<{ inmate: Inmate; incident: InmateIncident }> {
  const validTypes: InmateIncident['type'][] = [
    'TENTATIVA_FUGA',
    'AGRESSAO',
    'POSSE_ILICITA',
    'DESOBEDIENCIA',
    'OUTRO'
  ];
  const validSeverities: InmateIncident['severity'][] = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'];
  if (
    !validTypes.includes(input.type) ||
    !validSeverities.includes(input.severity) ||
    !input.description?.trim() ||
    !input.actionsTaken?.trim()
  ) {
    throw new StateMachineError(
      400,
      'INVALID_INCIDENT_DATA',
      'Tipo, gravidade, descrição e providências tomadas são obrigatórios.'
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
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const nowIso = new Date().toISOString();
    const incidentDate = input.date?.trim() || nowIso.split('T')[0];
    const source: 'INTERNO' | 'VISITA' = input.source === 'VISITA' ? 'VISITA' : 'INTERNO';

    const incident: InmateIncident = {
      incidentId: uniqueId('inc'),
      date: incidentDate,
      type: input.type,
      severity: input.severity,
      description: input.description.trim(),
      actionsTaken: input.actionsTaken.trim(),
      reportedBy: actor.user.profile.fullName,
      source,
      ...(input.visitorId?.trim() ? { visitorId: input.visitorId.trim() } : {}),
      ...(input.visitorName?.trim() ? { visitorName: input.visitorName.trim() } : {}),
      ...(input.visitorBi?.trim() ? { visitorBi: input.visitorBi.trim() } : {})
    };

    const nextDisciplinary = {
      ...inmate.disciplinary,
      infractionsCount: (inmate.disciplinary?.infractionsCount || 0) + 1,
      lastInfractionDate: incidentDate,
      ...(input.sanctionMeasure?.trim()
        ? {
            activeSanction: input.sanctionMeasure.trim(),
            sanctionHistory: [
              {
                date: incidentDate,
                description: input.description.trim(),
                measure: input.sanctionMeasure.trim(),
                signedBy: actor.user.profile.fullName
              },
              ...(inmate.disciplinary?.sanctionHistory || [])
            ]
          }
        : {
            sanctionHistory: inmate.disciplinary?.sanctionHistory || []
          }),
      ...(input.visitsBlockedUntil?.trim()
        ? { visitsBlockedUntil: input.visitsBlockedUntil.trim() }
        : {})
    };

    let nextVisitors = inmate.visitors ? [...inmate.visitors] : undefined;
    if (input.suspendVisitorId?.trim() && nextVisitors) {
      const targetVisId = input.suspendVisitorId.trim();
      nextVisitors = nextVisitors.map((v) =>
        v.visitorId === targetVisId
          ? {
              ...v,
              status: 'SUSPENSO' as const,
              suspendedReason:
                input.sanctionMeasure?.trim() ||
                `Incidente em visita (${incident.type}): ${incident.description}`
            }
          : v
      );
    }

    const penalty = Math.max(0, Number(input.meritPenaltyPoints) || 0);
    const nextVersion = currentVersion + 1;

    const updatedInmate: Inmate = {
      ...inmate,
      ...(nextVisitors ? { visitors: nextVisitors } : {}),
      incidents: [incident, ...(inmate.incidents || [])],
      disciplinary: nextDisciplinary,
      rehabilitation: {
        ...inmate.rehabilitation,
        meritPoints: Math.max(0, (inmate.rehabilitation?.meritPoints || 0) - penalty)
      },
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(inmateRef, cleanUndefined(updatedInmate));

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(
        indexRef,
        cleanUndefined({
          ...idx,
          version: nextVersion,
          lastUpdated: nowIso
        })
      );
    }

    const visitorContext =
      source === 'VISITA' && incident.visitorName
        ? ` · Visitante: ${incident.visitorName}${incident.visitorBi ? ` (${incident.visitorBi})` : ''}`
        : '';

    const auditEvt = buildAuditRecord(actor, {
      action:
        source === 'VISITA' ? 'VISITOR_INCIDENT_MIGRATED_TO_FUR' : 'INMATE_INCIDENT_REGISTERED',
      targetResource: `pnap/inmates/${inmateId}`,
      details: `Ocorrência [${source} · ${incident.type} · ${incident.severity}] registada na FUR de ${inmate.profile.fullName}${visitorContext}${input.visitsBlockedUntil ? ` · Visitas bloqueadas até ${input.visitsBlockedUntil}` : ''}.`,
      expectedVersion: currentVersion,
      resultingVersion: nextVersion
    });
    tx.set(db.collection('pnap_audit_logs').doc(auditEvt.eventId), cleanUndefined(auditEvt));

    return { inmate: updatedInmate, incident };
  });
}

/**
 * MÓDULO VISITAS & PORTARIA (Fonte Única: dentro da FUR do Recluso)
 */
function toVisitorRecord(v: InmateVisitor, inmate: Inmate): VisitorRecord {
  return {
    visitorId: v.visitorId,
    fullName: v.fullName,
    biNumber: v.biNumber,
    phone: v.phone,
    relationship: v.relationship,
    inmateId: inmate.inmateId,
    inmateName: inmate.profile.fullName,
    provinceId: inmate.provinceId,
    establishmentId: inmate.establishmentId,
    lastVisitDate: v.lastVisitDate || '',
    status: v.status
  };
}

function toVisitRecord(vst: InmateVisit, inmate: Inmate): VisitRecord {
  return {
    visitId: vst.visitId,
    visitorId: vst.visitorId,
    visitorName: vst.visitorName,
    inmateId: inmate.inmateId,
    inmateName: inmate.profile.fullName,
    provinceId: inmate.provinceId,
    establishmentId: inmate.establishmentId,
    date: vst.date,
    timeSlot: vst.timeSlot,
    inspectionPassed: vst.inspectionPassed,
    dutyOfficer: vst.dutyOfficer
  };
}

async function locateInmateIdForVisitor(
  db: Firestore,
  visitorId: string,
  inmateIdHint?: string
): Promise<string | null> {
  if (inmateIdHint?.trim()) {
    return inmateIdHint.trim();
  }
  const allSnap = await db.collection('pnap_inmates').get();
  for (const doc of allSnap.docs) {
    const data = doc.data() as Inmate;
    if ((data.visitors || []).some((v) => v.visitorId === visitorId)) {
      return data.inmateId || doc.id;
    }
  }
  const legacyVisSnap = await db.collection('pnap_visitors').doc(visitorId).get();
  if (legacyVisSnap.exists) {
    return (legacyVisSnap.data() as VisitorRecord).inmateId || null;
  }
  return null;
}

export async function listVisitorsFromFurs(
  db: Firestore,
  scope: { provinceId?: string; establishmentId?: string; inmateId?: string } = {}
): Promise<VisitorRecord[]> {
  const byId = new Map<string, VisitorRecord>();

  if (scope.inmateId) {
    const inmateSnap = await db.collection('pnap_inmates').doc(scope.inmateId).get();
    if (inmateSnap.exists) {
      const inmate = inmateSnap.data() as Inmate;
      (inmate.visitors || []).forEach((v) => {
        byId.set(v.visitorId, toVisitorRecord(v, inmate));
      });
    }
  } else {
    const snap = scope.provinceId
      ? await db.collection('pnap_inmates').where('provinceId', '==', scope.provinceId).get()
      : await db.collection('pnap_inmates').get();
    snap.docs.forEach((doc) => {
      const inmate = doc.data() as Inmate;
      if (scope.establishmentId && inmate.establishmentId !== scope.establishmentId) return;
      (inmate.visitors || []).forEach((v) => {
        byId.set(v.visitorId, toVisitorRecord(v, inmate));
      });
    });
  }

  // Fallback de leitura para registos legados pré-migração (sem sobrescrever FUR)
  const legacySnap = scope.inmateId
    ? await db.collection('pnap_visitors').where('inmateId', '==', scope.inmateId).get()
    : scope.provinceId
    ? await db.collection('pnap_visitors').where('provinceId', '==', scope.provinceId).get()
    : await db.collection('pnap_visitors').get();

  legacySnap.docs.forEach((doc) => {
    const leg = doc.data() as VisitorRecord;
    if (scope.establishmentId && leg.establishmentId !== scope.establishmentId) return;
    if (!byId.has(leg.visitorId)) {
      byId.set(leg.visitorId, leg);
    }
  });

  return Array.from(byId.values());
}

export async function listVisitsFromFurs(
  db: Firestore,
  scope: { provinceId?: string; establishmentId?: string; inmateId?: string } = {}
): Promise<VisitRecord[]> {
  const byId = new Map<string, VisitRecord>();

  if (scope.inmateId) {
    const inmateSnap = await db.collection('pnap_inmates').doc(scope.inmateId).get();
    if (inmateSnap.exists) {
      const inmate = inmateSnap.data() as Inmate;
      (inmate.visits || []).forEach((vst) => {
        byId.set(vst.visitId, toVisitRecord(vst, inmate));
      });
    }
  } else {
    const snap = scope.provinceId
      ? await db.collection('pnap_inmates').where('provinceId', '==', scope.provinceId).get()
      : await db.collection('pnap_inmates').get();
    snap.docs.forEach((doc) => {
      const inmate = doc.data() as Inmate;
      if (scope.establishmentId && inmate.establishmentId !== scope.establishmentId) return;
      (inmate.visits || []).forEach((vst) => {
        byId.set(vst.visitId, toVisitRecord(vst, inmate));
      });
    });
  }

  const legacySnap = scope.inmateId
    ? await db.collection('pnap_visits').where('inmateId', '==', scope.inmateId).get()
    : scope.provinceId
    ? await db.collection('pnap_visits').where('provinceId', '==', scope.provinceId).get()
    : await db.collection('pnap_visits').get();

  legacySnap.docs.forEach((doc) => {
    const leg = doc.data() as VisitRecord;
    if (scope.establishmentId && leg.establishmentId !== scope.establishmentId) return;
    if (!byId.has(leg.visitId)) {
      byId.set(leg.visitId, leg);
    }
  });

  return Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export async function registerVisitorTransactional(
  db: Firestore,
  actor: ActorContext,
  input: {
    inmateId: string;
    fullName: string;
    biNumber: string;
    phone?: string;
    relationship?: string;
    expectedVersion?: number;
  }
): Promise<{
  visitor: VisitorRecord;
  embeddedVisitor: InmateVisitor;
  inmate: Inmate;
  deduplicated: boolean;
}> {
  if (!input.inmateId?.trim() || !input.fullName?.trim() || !input.biNumber?.trim()) {
    throw new StateMachineError(
      400,
      'INVALID_VISITOR_DATA',
      'Recluso, nome completo e BI do visitante são obrigatórios.'
    );
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(input.inmateId.trim());
    const indexRef = db.collection('pnap_national_inmate_index').doc(input.inmateId.trim());
    const [inmateSnap, indexSnap] = await Promise.all([tx.get(inmateRef), tx.get(indexRef)]);
    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'FUR do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const custodyState = resolveEffectiveCustodyState(inmate);
    if (custodyState === 'LIBERTADO' || custodyState === 'FALECIDO') {
      throw new StateMachineError(
        409,
        'INMATE_TERMINAL_STATE',
        `Não é possível cadastrar visitante para recluso em estado ${custodyState}.`
      );
    }

    const nowIso = new Date().toISOString();
    const normBi = normalizeIdSegment(input.biNumber);
    const existingVisitors = [...(inmate.visitors || [])];
    const existingIdx = existingVisitors.findIndex(
      (v) => normalizeIdSegment(v.biNumber) === normBi
    );

    let embeddedVisitor: InmateVisitor;
    let deduplicated = false;
    if (existingIdx >= 0) {
      const existing = existingVisitors[existingIdx];
      if (existing.status === 'SUSPENSO') {
        throw new StateMachineError(
          409,
          'VISITOR_ALREADY_SUSPENDED',
          `Visitante ${existing.fullName} (BI ${existing.biNumber}) já consta na FUR como SUSPENSO${existing.suspendedReason ? ` (${existing.suspendedReason})` : ''}.`
        );
      }
      deduplicated = true;
      embeddedVisitor = {
        ...existing,
        fullName: input.fullName.trim(),
        phone: String(input.phone || existing.phone || '').trim(),
        relationship: String(input.relationship || existing.relationship || 'Familiar').trim()
      };
      existingVisitors[existingIdx] = embeddedVisitor;
    } else {
      embeddedVisitor = {
        visitorId: uniqueId('vis'),
        fullName: input.fullName.trim(),
        biNumber: input.biNumber.trim(),
        phone: String(input.phone || '').trim(),
        relationship: String(input.relationship || 'Familiar').trim(),
        status: 'AUTORIZADO',
        registeredAt: nowIso,
        registeredBy: actor.user.profile.fullName
      };
      existingVisitors.unshift(embeddedVisitor);
    }

    const nextVersion = currentVersion + 1;
    const updatedInmate: Inmate = {
      ...inmate,
      visitors: existingVisitors,
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(inmateRef, cleanUndefined(updatedInmate));

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      const visitorKeywords = buildVisitorKeywords(updatedInmate);
      const mergedIdx: NationalInmateIndexItem = {
        ...idx,
        visitorKeywords,
        version: nextVersion,
        lastUpdated: nowIso
      };
      mergedIdx.searchText = buildIndexSearchText(mergedIdx);
      tx.set(indexRef, cleanUndefined(mergedIdx));
    }

    const auditEvt = buildAuditRecord(actor, {
      action: deduplicated ? 'VISITOR_UPDATED_ON_FUR' : 'VISITOR_REGISTERED_ON_FUR',
      targetResource: `pnap/inmates/${inmate.inmateId}/visitors/${embeddedVisitor.visitorId}`,
      details: `Visitante ${deduplicated ? 'atualizado' : 'autorizado'} diretamente na FUR de ${inmate.profile.fullName} (${inmate.profile.matricula}): ${embeddedVisitor.fullName} (BI: ${embeddedVisitor.biNumber}).`,
      expectedVersion: currentVersion,
      resultingVersion: nextVersion
    });
    tx.set(db.collection('pnap_audit_logs').doc(auditEvt.eventId), cleanUndefined(auditEvt));

    return {
      visitor: toVisitorRecord(embeddedVisitor, updatedInmate),
      embeddedVisitor,
      inmate: updatedInmate,
      deduplicated
    };
  });
}

export async function updateVisitorStatusTransactional(
  db: Firestore,
  actor: ActorContext,
  visitorId: string,
  status: 'AUTORIZADO' | 'SUSPENSO',
  reason?: string,
  inmateIdHint?: string
): Promise<{ visitor: VisitorRecord; inmate: Inmate }> {
  if (status !== 'AUTORIZADO' && status !== 'SUSPENSO') {
    throw new StateMachineError(400, 'INVALID_VISITOR_STATUS', 'Estado do visitante inválido.');
  }

  const targetInmateId = await locateInmateIdForVisitor(db, visitorId, inmateIdHint);
  if (!targetInmateId) {
    throw new StateMachineError(404, 'VISITOR_NOT_FOUND', 'Visitante não encontrado em nenhuma FUR.');
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(targetInmateId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(targetInmateId);
    const legacyVisRef = db.collection('pnap_visitors').doc(visitorId);
    const [inmateSnap, indexSnap, legacyVisSnap] = await Promise.all([
      tx.get(inmateRef),
      tx.get(indexRef),
      tx.get(legacyVisRef)
    ]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'FUR do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate);
    const visitorsList = [...(inmate.visitors || [])];
    let idxInList = visitorsList.findIndex((v) => v.visitorId === visitorId);

    // Migração transparente caso o registo só existisse na coleção legada
    if (idxInList < 0 && legacyVisSnap.exists) {
      const leg = legacyVisSnap.data() as VisitorRecord;
      visitorsList.unshift({
        visitorId: leg.visitorId,
        fullName: leg.fullName,
        biNumber: leg.biNumber,
        phone: leg.phone,
        relationship: leg.relationship,
        status: leg.status,
        registeredAt: new Date().toISOString(),
        registeredBy: 'Migração FUR',
        ...(leg.lastVisitDate ? { lastVisitDate: leg.lastVisitDate } : {})
      });
      idxInList = 0;
    }

    if (idxInList < 0) {
      throw new StateMachineError(404, 'VISITOR_NOT_FOUND', 'Visitante não encontrado na FUR.');
    }

    const existing = visitorsList[idxInList];
    const nowIso = new Date().toISOString();
    const updatedEmbedded: InmateVisitor = {
      ...existing,
      status,
      ...(status === 'SUSPENSO'
        ? { suspendedReason: reason?.trim() || 'Suspensão administrativa' }
        : { suspendedReason: undefined })
    };
    visitorsList[idxInList] = updatedEmbedded;

    const nextVersion = currentVersion + 1;
    const updatedInmate: Inmate = {
      ...inmate,
      visitors: visitorsList,
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(inmateRef, cleanUndefined(updatedInmate));

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      const mergedIdx: NationalInmateIndexItem = {
        ...idx,
        visitorKeywords: buildVisitorKeywords(updatedInmate),
        version: nextVersion,
        lastUpdated: nowIso
      };
      mergedIdx.searchText = buildIndexSearchText(mergedIdx);
      tx.set(indexRef, cleanUndefined(mergedIdx));
    }

    const auditEvt = buildAuditRecord(actor, {
      action: 'VISITOR_STATUS_CHANGED',
      targetResource: `pnap/inmates/${targetInmateId}/visitors/${visitorId}`,
      details: `Visitante ${existing.fullName} na FUR de ${inmate.profile.fullName} atualizado [${existing.status} ➔ ${status}]${reason ? ` · Motivo: ${reason}` : ''}.`,
      previousState: existing.status,
      newState: status,
      expectedVersion: currentVersion,
      resultingVersion: nextVersion
    });
    tx.set(db.collection('pnap_audit_logs').doc(auditEvt.eventId), cleanUndefined(auditEvt));

    return {
      visitor: toVisitorRecord(updatedEmbedded, updatedInmate),
      inmate: updatedInmate
    };
  });
}

export async function registerVisitCheckInTransactional(
  db: Firestore,
  actor: ActorContext,
  input: {
    inmateId?: string;
    visitorId: string;
    date?: string;
    timeSlot?: string;
    inspectionPassed: boolean;
    notes?: string;
    expectedVersion?: number;
  }
): Promise<{
  visit: VisitRecord;
  embeddedVisit: InmateVisit;
  inmate: Inmate;
}> {
  if (!input.visitorId?.trim()) {
    throw new StateMachineError(400, 'MISSING_VISITOR_ID', 'ID do visitante é obrigatório.');
  }

  const visitorId = input.visitorId.trim();
  const visitDate = input.date?.trim() || new Date().toISOString().split('T')[0];

  if (!input.inspectionPassed) {
    await db
      .collection('pnap_audit_logs')
      .doc(uniqueId('evt'))
      .set(
        cleanUndefined(
          buildAuditRecord(actor, {
            action: 'VISIT_BLOCKED_INSPECTION_FAILED',
            targetResource: `pnap/visitors/${visitorId}`,
            details: `Entrada de visitante bloqueada na portaria: inspeção de segurança não aprovada.`,
            jurisdictionStatus: 'BLOCKED_ATTEMPT'
          })
        )
      );
    throw new StateMachineError(
      400,
      'SECURITY_INSPECTION_FAILED',
      'Visita bloqueada: inspeção obrigatória de portaria não aprovada.'
    );
  }

  const targetInmateId = await locateInmateIdForVisitor(db, visitorId, input.inmateId);
  if (!targetInmateId) {
    throw new StateMachineError(404, 'VISITOR_NOT_FOUND', 'Visitante não encontrado em nenhuma FUR.');
  }

  return db.runTransaction(async (tx) => {
    const inmateRef = db.collection('pnap_inmates').doc(targetInmateId);
    const indexRef = db.collection('pnap_national_inmate_index').doc(targetInmateId);
    const legacyVisRef = db.collection('pnap_visitors').doc(visitorId);
    const [inmateSnap, indexSnap, legacyVisSnap] = await Promise.all([
      tx.get(inmateRef),
      tx.get(indexRef),
      tx.get(legacyVisRef)
    ]);

    if (!inmateSnap.exists) {
      throw new StateMachineError(404, 'INMATE_NOT_FOUND', 'FUR do recluso não encontrada.');
    }

    const inmate = inmateSnap.data() as Inmate;
    const currentVersion = assertExpectedVersion(inmate, input.expectedVersion);
    const visitorsList = [...(inmate.visitors || [])];
    let visIndex = visitorsList.findIndex((v) => v.visitorId === visitorId);

    if (visIndex < 0 && legacyVisSnap.exists) {
      const leg = legacyVisSnap.data() as VisitorRecord;
      visitorsList.unshift({
        visitorId: leg.visitorId,
        fullName: leg.fullName,
        biNumber: leg.biNumber,
        phone: leg.phone,
        relationship: leg.relationship,
        status: leg.status,
        registeredAt: new Date().toISOString(),
        registeredBy: 'Migração FUR',
        ...(leg.lastVisitDate ? { lastVisitDate: leg.lastVisitDate } : {})
      });
      visIndex = 0;
    }

    if (visIndex < 0) {
      throw new StateMachineError(404, 'VISITOR_NOT_FOUND', 'Visitante não encontrado na FUR.');
    }

    const visitor = visitorsList[visIndex];
    if (visitor.status !== 'AUTORIZADO') {
      throw new StateMachineError(
        403,
        'VISITOR_SUSPENDED',
        `Entrada bloqueada: visitante ${visitor.fullName} encontra-se SUSPENSO.`
      );
    }

    const custodyState = resolveEffectiveCustodyState(inmate);
    if (custodyState !== 'ATIVO_NA_UNIDADE') {
      throw new StateMachineError(
        409,
        'INMATE_NOT_PRESENT_FOR_VISIT',
        `Visita indisponível: o recluso ${inmate.profile.fullName} não está na unidade (estado atual: ${custodyState}).`
      );
    }

    const blockedUntil = inmate.disciplinary?.visitsBlockedUntil;
    if (blockedUntil && blockedUntil >= visitDate) {
      throw new StateMachineError(
        403,
        'VISITS_BLOCKED_BY_SANCTION',
        `Visita bloqueada por sanção disciplinar ativa até ${blockedUntil}.`
      );
    }

    const nowIso = new Date().toISOString();
    const visitId = uniqueId('vst');
    const embeddedVisit: InmateVisit = {
      visitId,
      visitorId: visitor.visitorId,
      visitorName: visitor.fullName,
      visitorBi: visitor.biNumber,
      date: visitDate,
      timeSlot: input.timeSlot?.trim() || '09:00 - 11:00',
      inspectionPassed: true,
      dutyOfficer: actor.user.profile.fullName,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {})
    };

    visitorsList[visIndex] = { ...visitor, lastVisitDate: visitDate };
    const nextVersion = currentVersion + 1;
    const updatedInmate: Inmate = {
      ...inmate,
      visitors: visitorsList,
      visits: [embeddedVisit, ...(inmate.visits || [])].slice(0, 200),
      version: nextVersion,
      updatedAt: nowIso,
      updatedBy: actor.user.profile.fullName
    };

    tx.set(inmateRef, cleanUndefined(updatedInmate));

    if (indexSnap.exists) {
      const idx = indexSnap.data() as NationalInmateIndexItem;
      tx.set(
        indexRef,
        cleanUndefined({
          ...idx,
          version: nextVersion,
          lastUpdated: nowIso
        })
      );
    }

    const auditEvt = buildAuditRecord(actor, {
      action: 'VISIT_CHECKIN_REGISTERED',
      targetResource: `pnap/inmates/${inmate.inmateId}/visits/${visitId}`,
      details: `Visita registada diretamente na FUR de ${inmate.profile.fullName}: ${visitor.fullName} (${embeddedVisit.date} ${embeddedVisit.timeSlot}).`,
      expectedVersion: currentVersion,
      resultingVersion: nextVersion
    });
    tx.set(db.collection('pnap_audit_logs').doc(auditEvt.eventId), cleanUndefined(auditEvt));

    return {
      visit: toVisitRecord(embeddedVisit, updatedInmate),
      embeddedVisit,
      inmate: updatedInmate
    };
  });
}

/**
 * CATÁLOGOS DINÂMICOS CONFIGURÁVEIS (/pnap_catalogs/{catalogId})
 */
export async function upsertCatalogTransactional(
  db: Firestore,
  actor: ActorContext,
  catalogId: string,
  input: {
    category: PnapCatalog['category'];
    items: PnapCatalog['items'];
  }
): Promise<PnapCatalog> {
  const validCategories: PnapCatalog['category'][] = [
    'CRIMES',
    'INCIDENTS',
    'EXIT_REASONS',
    'ESCORT_PROTOCOLS',
    'REHAB_PROGRAMS'
  ];
  if (!validCategories.includes(input.category) || !Array.isArray(input.items)) {
    throw new StateMachineError(
      400,
      'INVALID_CATALOG_DATA',
      'Categoria e lista de itens válidos são obrigatórios.'
    );
  }

  const catalog: PnapCatalog = {
    catalogId,
    category: input.category,
    items: input.items.slice(0, 200).map((it) => ({
      code: String(it.code || '').trim(),
      label: String(it.label || '').trim(),
      active: Boolean(it.active),
      ...(it.severity ? { severity: String(it.severity).trim() } : {})
    })),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.user.profile.fullName
  };

  await db.collection('pnap_catalogs').doc(catalogId).set(cleanUndefined(catalog));
  await db
    .collection('pnap_audit_logs')
    .doc(uniqueId('evt'))
    .set(
      cleanUndefined(
        buildAuditRecord(actor, {
          action: 'CATALOG_UPDATED',
          targetResource: `pnap/catalogs/${catalogId}`,
          details: `Catálogo ${catalog.category} (${catalogId}) atualizado com ${catalog.items.length} itens.`
        })
      )
    );

  return catalog;
}
