import { 
  ProvinceId, 
  EstablishmentProfile, 
  Pavilion, 
  Block, 
  Cell, 
  PnapUser, 
  LegalTransitionRecord, 
  TransferRecord, 
  AuditLogEvent,
  ProvinceStatistics,
  ExitModality,
  ReleaseRecord,
  Inmate,
  InmateIncident,
  InmateVisit,
  InmateVisitor,
  AdmissionRecord,
  VisitorRecord,
  VisitRecord
} from '../types/pnap';
import { 
  ESTABLISHMENTS_DATA, 
  PROVINCES_DATA,
  PROVINCE_STATISTICS, 
  INMATES_LOCAL_DB, 
  NATIONAL_INMATE_INDEX, 
  MOCK_AUDIT_LOGS,
  MOCK_TRANSFERS,
  MOCK_ADMISSIONS,
  MOCK_RELEASES,
  MOCK_VISITORS,
  MOCK_VISITS
} from '../data/mockPnapData';
import { inmateToNationalIndexItem } from '../utils/inmateSearch';

function isMeaningfulBi(bi?: string | null): boolean {
  if (!bi) return false;
  const cleaned = bi.trim().toUpperCase().replace(/[\s._-]+/g, '');
  if (!cleaned) return false;
  return !['PENDENTE', 'ND', 'SBI', 'SEMBI', 'NAODECLARADO', 'SEMNUMERO', 'UNKNOWN'].includes(cleaned);
}

// Initial Mock Transitions (Transição Processual: Detido/Preventivo -> Condenado)
const INITIAL_LEGAL_TRANSITIONS: LegalTransitionRecord[] = [
  {
    transitionId: 'trans-001',
    inmateId: 'inm-lua-002',
    inmateName: 'Mateus Kiala André',
    matricula: 'LA-2023-0891',
    provinceId: 'luanda',
    establishmentId: 'comarca-viana',
    previousStatus: 'PREVENTIVO',
    newStatus: 'CONDENADO',
    courtName: 'Tribunal da Comarca de Luanda - 2ª Secção dos Crimes Comuns',
    sentenceAcordaoNumber: 'Acórdão n.º 312/TCL-2024',
    sentenceDate: '2024-03-15',
    transitDate: '2024-04-10',
    totalSentenceYears: 12,
    totalSentenceMonths: 0,
    regime: 'FECHADO',
    judgeName: 'Juiz de Direito Dr. Amadeu dos Santos',
    effectiveDate: '2024-04-10',
    registeredBy: 'Secretaria Judicial Central PNAP',
    notes: 'Condenação confirmada em recurso sem mais possibilidade de impugnação ordinária.'
  }
];

// Helper to compute automated capacity down the tree:
// Bloco: Σ celas * vagas
// Pavilhão: Σ blocos
// Estabelecimento: Σ pavilhões
export function computeStructureCapacities(establishment: EstablishmentProfile): EstablishmentProfile {
  let estTotal = 0;
  const updatedPavilions = (establishment.pavilions || []).map((pav) => {
    let pavTotal = 0;
    const updatedBlocks = pav.blocks.map((blk) => {
      const blkTotal = blk.cells.reduce((acc, c) => acc + (Number(c.capacity) || 0), 0);
      pavTotal += blkTotal;
      return {
        ...blk,
        calculatedCapacity: blkTotal
      };
    });
    estTotal += pavTotal;
    return {
      ...pav,
      blocks: updatedBlocks,
      calculatedCapacity: pavTotal
    };
  });

  return {
    ...establishment,
    pavilions: updatedPavilions,
    totalCapacity: estTotal > 0 ? estTotal : establishment.totalCapacity
  };
}

class PnapStoreService {
  private establishments: Record<string, EstablishmentProfile[]> = {};
  private provinceStats: Record<string, ProvinceStatistics> = {};
  private inmates: Inmate[] = [...INMATES_LOCAL_DB];
  private admissions: AdmissionRecord[] = [...MOCK_ADMISSIONS];
  private legalTransitions: LegalTransitionRecord[] = [...INITIAL_LEGAL_TRANSITIONS];
  private physicalTransfers: TransferRecord[] = [...MOCK_TRANSFERS];
  private releases: ReleaseRecord[] = [...MOCK_RELEASES];
  private auditLogs: AuditLogEvent[] = [...MOCK_AUDIT_LOGS];
  private listeners: Array<() => void> = [];

  constructor() {
    // Initialize with existing data from mockPnapData
    Object.keys(ESTABLISHMENTS_DATA).forEach((provKey) => {
      this.establishments[provKey] = ESTABLISHMENTS_DATA[provKey].map((est) => ({
        ...est,
        provisioningStatus: 'HOMOLOGATED',
        homologatedAt: '2024-01-15T00:00:00Z',
        homologatedBy: 'Direcção Geral Central PNAP',
        homologationDecreeNumber: 'Despacho Homologatório Central n.º 001/2024'
      }));
    });

    Object.keys(PROVINCE_STATISTICS).forEach((provKey) => {
      this.provinceStats[provKey] = { ...PROVINCE_STATISTICS[provKey] };
    });
  }

  // Subscribe to changes
  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // --- 1. REGRAS DE AUTORIZAÇÃO GLOBAL ---
  canOperateProvince(user: PnapUser, provinceId: string): boolean {
    if (user.assignments.role === 'CENTRAL_ADMIN') return true;
    if (user.assignments.role === 'AUDITOR_INSPECTOR' && user.assignments.assignedProvinceId === 'all') {
      return true;
    }
    return user.assignments.assignedProvinceId === provinceId;
  }

  canProvision(user: PnapUser): boolean {
    return user.assignments.role === 'CENTRAL_ADMIN';
  }

  // --- 2. GETTERS & SINCRONIZAÇÃO LIVE API ---
  getInmates(): Inmate[] {
    return this.inmates;
  }

  getAdmissions(): AdmissionRecord[] {
    return this.admissions;
  }

  private syncNationalIndexFromInmate(inmate: Inmate) {
    const estList = this.establishments[inmate.provinceId] || [];
    const estName =
      estList.find((e) => e.establishmentId === inmate.establishmentId)?.name ||
      inmate.establishmentId;
    const provName = PROVINCES_DATA[inmate.provinceId]?.name || inmate.provinceId;
    const idxItem = inmateToNationalIndexItem(inmate, estName, provName);
    const existingIdx = NATIONAL_INMATE_INDEX.findIndex(
      (item) => item.inmateId === inmate.inmateId
    );
    if (existingIdx >= 0) {
      NATIONAL_INMATE_INDEX[existingIdx] = idxItem;
    } else {
      NATIONAL_INMATE_INDEX.unshift(idxItem);
    }
  }

  upsertLiveInmate(inmate: Inmate) {
    const idx = this.inmates.findIndex((i) => i.inmateId === inmate.inmateId);
    if (idx >= 0) {
      this.inmates[idx] = inmate;
    } else {
      this.inmates.unshift(inmate);
    }
    const localDbIdx = INMATES_LOCAL_DB.findIndex((i) => i.inmateId === inmate.inmateId);
    if (localDbIdx >= 0) {
      INMATES_LOCAL_DB[localDbIdx] = inmate;
    } else {
      INMATES_LOCAL_DB.unshift(inmate);
    }
    this.syncNationalIndexFromInmate(inmate);
    this.notify();
  }

  syncLiveInmates(provinceId: ProvinceId, liveInmates: Inmate[]) {
    const others = this.inmates.filter((i) => i.provinceId !== provinceId);
    this.inmates = [...liveInmates, ...others];
    this.notify();
  }

  syncLiveTransfers(transfers: TransferRecord[]) {
    this.physicalTransfers = transfers;
    this.notify();
  }

  syncLiveAuditLogs(logs: AuditLogEvent[]) {
    this.auditLogs = logs;
    this.notify();
  }

  syncLiveProvinceStats(statsMap: Record<string, ProvinceStatistics>) {
    this.provinceStats = { ...this.provinceStats, ...statsMap };
    this.notify();
  }

  syncLiveEstablishments(provinceId: ProvinceId, list: EstablishmentProfile[]) {
    this.establishments[provinceId] = list;
    this.notify();
  }

  getEstablishments(provinceId: string): EstablishmentProfile[] {
    return this.establishments[provinceId] || [];
  }

  getAllEstablishments(): Record<string, EstablishmentProfile[]> {
    return this.establishments;
  }

  getProvinceStats(provinceId: string): ProvinceStatistics {
    return this.provinceStats[provinceId] || {
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

  getAllProvinceStats(): Record<string, ProvinceStatistics> {
    return this.provinceStats;
  }

  getLegalTransitions(): LegalTransitionRecord[] {
    return this.legalTransitions;
  }

  getPhysicalTransfers(): TransferRecord[] {
    return this.physicalTransfers;
  }

  getReleases(): ReleaseRecord[] {
    return this.releases;
  }

  getAuditLogs(): AuditLogEvent[] {
    return this.auditLogs;
  }

  // --- 3. PROVISIONAMENTO EM DUAS FASES (RASCUNHO & HOMOLOGAÇÃO) ---
  
  // FASE 1: Salvar Rascunho (Draft)
  saveDraftEstablishment(
    user: PnapUser, 
    establishmentData: Omit<EstablishmentProfile, 'provisioningStatus' | 'totalCapacity'> & { totalCapacity?: number }
  ): { success: boolean; message: string; establishment?: EstablishmentProfile } {
    if (!this.canProvision(user)) {
      return { 
        success: false, 
        message: 'Acesso Negado: Apenas a Direcção Geral Central pode provisionar estruturas prisionais.' 
      };
    }

    const provinceKey = establishmentData.provinceId;
    if (!this.establishments[provinceKey]) {
      this.establishments[provinceKey] = [];
    }

    // Calcula capacidade hierárquica automática
    const draftProfile: EstablishmentProfile = computeStructureCapacities({
      ...establishmentData,
      totalCapacity: establishmentData.totalCapacity || 0,
      activeInmatesCount: 0,
      provisioningStatus: 'DRAFT'
    });

    // Substitui se já existir o rascunho com o mesmo ID, senão insere
    const existingIndex = this.establishments[provinceKey].findIndex(
      (e) => e.establishmentId === draftProfile.establishmentId
    );

    if (existingIndex >= 0) {
      this.establishments[provinceKey][existingIndex] = draftProfile;
    } else {
      this.establishments[provinceKey].push(draftProfile);
    }

    // Regista log de auditoria do rascunho
    this.auditLogs.unshift({
      eventId: `evt-draft-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince: 'CENTRAL_GLOBAL',
      action: 'ESTABLISHMENT_DRAFT_SAVED',
      targetResource: `pnap/provinces/${provinceKey}/establishments/${draftProfile.establishmentId}`,
      details: `Rascunho gravado: ${draftProfile.name || 'Sem nome'} (${provinceKey.toUpperCase()}). Capacidade: ${draftProfile.totalCapacity} vagas.`,
      ipAddress: '10.0.0.1 (VPN Segura PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });

    this.notify();
    return { 
      success: true, 
      message: `Rascunho gravado (${draftProfile.totalCapacity} vagas).`,
      establishment: draftProfile
    };
  }

  // FASE 2: Homologação Oficial (Homologate & Activate)
  homologateEstablishment(
    user: PnapUser,
    provinceId: ProvinceId,
    establishmentId: string,
    decreeNumber: string
  ): { success: boolean; message: string; establishment?: EstablishmentProfile } {
    if (!this.canProvision(user)) {
      return { 
        success: false, 
        message: 'Acesso Negado: Apenas o Administrador Central (Director Geral) possui autorização global de homologação.' 
      };
    }

    const provinceList = this.establishments[provinceId];
    if (!provinceList) {
      return { success: false, message: 'Província não encontrada no registo central.' };
    }

    const targetEst = provinceList.find((e) => e.establishmentId === establishmentId);
    if (!targetEst) {
      return { success: false, message: 'Estabelecimento prisional não encontrado.' };
    }

    // Validação estrutural integral obrigatória para HOMOLOGATED
    const recomputed = computeStructureCapacities(targetEst);
    if (!recomputed.name || !recomputed.name.trim()) {
      return { success: false, message: 'Homologação rejeitada: Nome oficial da estrutura obrigatório.' };
    }

    if (!recomputed.pavilions || recomputed.pavilions.length === 0) {
      return { success: false, message: 'Homologação rejeitada: A estrutura deve conter no mínimo 1 Pavilhão.' };
    }

    for (const pav of recomputed.pavilions) {
      if (!pav.name || !pav.name.trim()) {
        return { success: false, message: 'Homologação rejeitada: Todos os pavilhões devem ter nome.' };
      }
      if (!pav.blocks || pav.blocks.length === 0) {
        return { success: false, message: `Homologação rejeitada: Pavilhão "${pav.name}" sem blocos.` };
      }
      for (const blk of pav.blocks) {
        if (!blk.name || !blk.name.trim()) {
          return { success: false, message: `Homologação rejeitada: Selecione o bloco em "${pav.name}".` };
        }
        if (!blk.cells || blk.cells.length === 0) {
          return { success: false, message: `Homologação rejeitada: "${blk.name}" sem celas registadas.` };
        }
        for (const cell of blk.cells) {
          if (!cell.code || !cell.code.trim()) {
            return { success: false, message: `Homologação rejeitada: Existem celas sem código em "${blk.name}".` };
          }
          if (!Number.isFinite(cell.capacity) || cell.capacity <= 0) {
            return { success: false, message: `Homologação rejeitada: Cela "${cell.code}" sem capacidade válida.` };
          }
        }
      }
    }

    if (recomputed.totalCapacity <= 0) {
      return { success: false, message: 'Homologação rejeitada: A capacidade calculada das celas é zero.' };
    }

    if (!decreeNumber || !decreeNumber.trim()) {
      return { success: false, message: 'Homologação rejeitada: Informe o N.º do Despacho Homologatório.' };
    }

    // Ativação e Homologação Oficial
    recomputed.provisioningStatus = 'HOMOLOGATED';
    recomputed.homologatedAt = new Date().toISOString();
    recomputed.homologatedBy = `${user.profile.fullName} (${user.profile.rank})`;
    recomputed.homologationDecreeNumber = decreeNumber.trim();

    // Atualiza lista
    const estIndex = provinceList.findIndex((e) => e.establishmentId === establishmentId);
    provinceList[estIndex] = recomputed;

    // Recalcula estatísticas oficiais da província (somatório dos estabelecimentos homologados)
    const homologatedInProvince = provinceList.filter((e) => e.provisioningStatus === 'HOMOLOGATED');
    const totalCap = homologatedInProvince.reduce((sum, e) => sum + e.totalCapacity, 0);
    const totalActive = homologatedInProvince.reduce((sum, e) => sum + e.activeInmatesCount, 0);

    const prevStats = this.getProvinceStats(provinceId);
    this.provinceStats[provinceId] = {
      ...prevStats,
      establishmentsCount: homologatedInProvince.length,
      totalCapacity: totalCap,
      activeInmates: totalActive,
      availableSpots: Math.max(0, totalCap - totalActive),
      occupancyRate: totalCap > 0 ? Math.round((totalActive / totalCap) * 100) : 0
    };

    // Regista log de auditoria global imutável
    this.auditLogs.unshift({
      eventId: `evt-homolog-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince: 'CENTRAL_GLOBAL',
      action: 'ESTABLISHMENT_HOMOLOGATED',
      targetResource: `pnap/provinces/${provinceId}/establishments/${establishmentId}`,
      details: `HOMOLOGAÇÃO OFICIAL: ${recomputed.name} (${provinceId.toUpperCase()}) ativado com ${recomputed.totalCapacity} vagas. Despacho: ${recomputed.homologationDecreeNumber}.`,
      ipAddress: '10.0.0.1 (VPN Segura PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });

    this.notify();
    return {
      success: true,
      message: `${recomputed.name} homologado em ${provinceId.toUpperCase()} (${recomputed.totalCapacity} vagas).`,
      establishment: recomputed
    };
  }

  // --- 4. TRANSIÇÃO PENAL (DETIDO/PREVENTIVO → CONDENADO · ATUALIZAÇÃO DA FICHA ÚNICA) ---
  registerLegalTransition(
    user: PnapUser,
    transitionData: {
      inmateId: string;
      courtName?: string;
      sentenceAcordaoNumber: string;
      sentenceDate?: string;
      transitDate: string;
      totalSentenceYears: number;
      totalSentenceMonths: number;
      regime: 'FECHADO' | 'SEMI_ABERTO';
      judgeName?: string;
      endOfSentenceDate?: string;
      eligibleParoleDate?: string;
      notes?: string;
    }
  ): { success: boolean; message: string; record?: LegalTransitionRecord } {
    if (!transitionData.inmateId) {
      return { success: false, message: 'Localize e selecione o recluso pela sua Ficha Única.' };
    }

    const targetInmate = INMATES_LOCAL_DB.find((inm) => inm.inmateId === transitionData.inmateId);
    if (!targetInmate) {
      return { success: false, message: 'Ficha Única do recluso não encontrada.' };
    }

    // Validação de jurisdição na província real da Ficha Única
    if (!this.canOperateProvince(user, targetInmate.provinceId)) {
      this.auditLogs.unshift({
        eventId: `evt-trans-blk-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: user.assignments.assignedProvinceId,
        action: 'BLOCKED_LEGAL_TRANSITION_ATTEMPT',
        targetResource: `pnap/provinces/${targetInmate.provinceId}/inmates/${targetInmate.inmateId}`,
        details: `Tentativa bloqueada de transição penal para ${targetInmate.profile.fullName} fora da jurisdição autorizada.`,
        ipAddress: '10.0.0.1 (Terminal PNAP)',
        jurisdictionStatus: 'BLOCKED_ATTEMPT'
      });
      this.notify();
      return {
        success: false,
        message: `Acesso Negado: Sem competência territorial na província de ${targetInmate.provinceId.toUpperCase()}.`
      };
    }

    if (targetInmate.currentStatus !== 'ATIVO') {
      return {
        success: false,
        message: `Transição rejeitada: Recluso não está ATIVO (${targetInmate.currentStatus}).`
      };
    }

    if (
      targetInmate.legal.legalStatus !== 'PREVENTIVO' &&
      targetInmate.legal.legalStatus !== 'RECORRENTE'
    ) {
      return {
        success: false,
        message: `Transição já efetuada: Ficha Única já consta como ${targetInmate.legal.legalStatus}.`
      };
    }

    const years = Math.max(0, Math.floor(Number(transitionData.totalSentenceYears) || 0));
    const extraMonths = Math.max(0, Math.min(11, Math.floor(Number(transitionData.totalSentenceMonths) || 0)));
    const totalMonths = years * 12 + extraMonths;

    if (!transitionData.sentenceAcordaoNumber.trim() || !transitionData.transitDate.trim() || totalMonths <= 0) {
      return {
        success: false,
        message: 'Preencha N.º do Mandado/Acórdão, Data de Trânsito e Pena válida.'
      };
    }

    // Cálculo de cumprimento a partir da data de admissão na Ficha Única
    const addMonthsIso = (baseDateStr: string, monthsToAdd: number): string => {
      const d = new Date(baseDateStr || transitionData.transitDate);
      if (Number.isNaN(d.getTime())) return transitionData.transitDate;
      d.setMonth(d.getMonth() + monthsToAdd);
      return d.toISOString().split('T')[0];
    };

    const effectiveCourt = transitionData.courtName?.trim() || targetInmate.admission.courtName;
    const computedEnd =
      transitionData.endOfSentenceDate?.trim() ||
      addMonthsIso(targetInmate.admission.admissionDate, totalMonths);
    const computedParole =
      transitionData.eligibleParoleDate?.trim() ||
      addMonthsIso(targetInmate.admission.admissionDate, Math.max(1, Math.floor(totalMonths / 2)));

    const previousStatus: 'PREVENTIVO' | 'RECORRENTE' =
      targetInmate.legal.legalStatus === 'RECORRENTE' ? 'RECORRENTE' : 'PREVENTIVO';

    // Atualiza diretamente a Ficha Única do recluso (sem duplicar registo)
    targetInmate.legal.legalStatus = 'CONDENADO';
    targetInmate.legal.totalSentenceYears = years;
    targetInmate.legal.totalSentenceMonths = totalMonths;
    targetInmate.legal.endOfSentenceDate = computedEnd;
    targetInmate.legal.eligibleParoleDate = computedParole;

    targetInmate.documents.unshift({
      documentId: `doc-sent-${Date.now()}`,
      title: `Mandado / Sentença: ${transitionData.sentenceAcordaoNumber.trim()}`,
      type: 'CERTIDAO_SENTENCA',
      uploadDate: transitionData.transitDate.trim(),
      fileSize: 'Digital (PNAP)'
    });

    const newTransition: LegalTransitionRecord = {
      transitionId: `trans-${Date.now()}`,
      inmateId: targetInmate.inmateId,
      inmateName: targetInmate.profile.fullName,
      matricula: targetInmate.profile.matricula,
      provinceId: targetInmate.provinceId,
      establishmentId: targetInmate.establishmentId,
      previousStatus,
      newStatus: 'CONDENADO',
      courtName: effectiveCourt,
      sentenceAcordaoNumber: transitionData.sentenceAcordaoNumber.trim(),
      sentenceDate: transitionData.sentenceDate?.trim() || transitionData.transitDate.trim(),
      transitDate: transitionData.transitDate.trim(),
      totalSentenceYears: years,
      totalSentenceMonths: extraMonths,
      regime: transitionData.regime,
      judgeName: transitionData.judgeName?.trim() || 'Magistrado Judicial',
      effectiveDate: new Date().toISOString().split('T')[0],
      registeredBy: user.profile.fullName,
      notes: transitionData.notes?.trim() || undefined
    };

    this.legalTransitions.unshift(newTransition);

    // Atualiza o índice nacional federado
    targetInmate.version = (targetInmate.version || 1) + 1;
    targetInmate.updatedAt = new Date().toISOString();
    targetInmate.updatedBy = user.profile.fullName;
    this.syncNationalIndexFromInmate(targetInmate);

    // Atualiza estatísticas processuais da província (Preventivo -> Condenado)
    const provStats = this.provinceStats[targetInmate.provinceId];
    if (provStats) {
      if (provStats.preventiveCount > 0) provStats.preventiveCount -= 1;
      provStats.convictedCount += 1;
    }

    // Regista log de auditoria
    this.auditLogs.unshift({
      eventId: `evt-trans-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince:
        user.assignments.role === 'CENTRAL_ADMIN' ? 'CENTRAL_GLOBAL' : user.assignments.assignedProvinceId,
      action: 'INMATE_LEGAL_TRANSITION',
      targetResource: `pnap/provinces/${targetInmate.provinceId}/inmates/${targetInmate.inmateId}`,
      details: `Ficha Única Atualizada [${previousStatus} ➔ CONDENADO]: ${targetInmate.profile.fullName} (${targetInmate.profile.matricula}) · Pena: ${years}a ${extraMonths}m · Doc: ${newTransition.sentenceAcordaoNumber} · Término: ${computedEnd}.`,
      ipAddress: '10.0.0.1 (Terminal PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });

    this.notify();
    return {
      success: true,
      message: `Ficha Única atualizada: ${targetInmate.profile.fullName} convertido para CONDENADO (${years}a ${extraMonths}m).`,
      record: newTransition
    };
  }

  // --- 5. TRANSFERÊNCIA FÍSICA (LUANDA → HUAMBO / ENTRE ESTABELECIMENTOS) ---
  registerPhysicalTransfer(
    user: PnapUser,
    transferData: Omit<TransferRecord, 'transferId' | 'requestDate' | 'status'>
  ): { success: boolean; message: string; record?: TransferRecord } {
    const isCentral = user.assignments.role === 'CENTRAL_ADMIN';
    const isOrigin = user.assignments.assignedProvinceId === transferData.originProvinceId;

    if (!isCentral && !isOrigin) {
      return {
        success: false,
        message: 'Acesso Negado: Apenas o comando da província de origem ou o Administrador Central podem emitir Guias de Transferência.'
      };
    }

    const newTransfer: TransferRecord = {
      ...transferData,
      transferId: `trf-${Date.now()}`,
      requestDate: new Date().toISOString().split('T')[0],
      status: isCentral ? 'AUTORIZADO_CENTRAL' : 'PENDENTE'
    };

    this.physicalTransfers.unshift(newTransfer);

    // Auditoria
    this.auditLogs.unshift({
      eventId: `evt-trf-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince: user.assignments.assignedProvinceId,
      action: 'INMATE_PHYSICAL_TRANSFER_REQUEST',
      targetResource: `pnap/transfers/${newTransfer.transferId}`,
      details: `Guia de Transferência Física: ${newTransfer.inmateName} de ${newTransfer.originProvinceId.toUpperCase()} para ${newTransfer.destinationProvinceId.toUpperCase()}. Escolta: ${newTransfer.securityEscort}.`,
      ipAddress: '10.0.0.1 (Terminal PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });

    this.notify();
    return {
      success: true,
      message: isCentral 
        ? `Guia de Transferência Autorizada pelo Director Geral: ${newTransfer.inmateName} pronto para escolta para ${newTransfer.destinationProvinceId.toUpperCase()}.`
        : `Solicitação de Guia de Transferência enviada para autorização central da Direcção Geral.`,
      record: newTransfer
    };
  }

  // --- 6. REGISTO DE SAÍDA E MODALIDADES (ENTRADAS / SAÍDAS) ---
  registerInmateExit(
    user: PnapUser,
    exitData: {
      inmateId: string;
      modality: ExitModality;
      documentNumber: string;
      authorityOrDetail: string;
      exitDate: string;
      destinationProvinceId?: ProvinceId;
      destinationEstablishmentId?: string;
      notes?: string;
    }
  ): { success: boolean; message: string; record?: ReleaseRecord } {
    const validModalities: ExitModality[] = [
      'CUMPRIMENTO_PENA',
      'LIBERDADE_CONDICIONAL',
      'LIBERDADE_PROVISORIA',
      'ABSOLVICAO',
      'INDULTO',
      'OBITO',
      'EVASAO',
      'TRANSFERENCIA'
    ];

    if (!exitData.inmateId || !validModalities.includes(exitData.modality)) {
      return { success: false, message: 'Selecione o recluso e a modalidade de saída válida.' };
    }

    if (!exitData.documentNumber.trim() || !exitData.authorityOrDetail.trim() || !exitData.exitDate.trim()) {
      return { success: false, message: 'Preencha o documento legal, autoridade/detalhe e data da saída.' };
    }

    if (
      exitData.modality === 'TRANSFERENCIA' &&
      (!exitData.destinationProvinceId || !exitData.destinationEstablishmentId?.trim())
    ) {
      return { success: false, message: 'Indique a província e o estabelecimento de destino da transferência.' };
    }

    const inmate = INMATES_LOCAL_DB.find((inm) => inm.inmateId === exitData.inmateId);
    if (!inmate) {
      return { success: false, message: 'Recluso não localizado na base operacional.' };
    }

    // Validação RBAC e Isolamento Provincial
    if (!this.canOperateProvince(user, inmate.provinceId)) {
      this.auditLogs.unshift({
        eventId: `evt-exit-blk-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: user.assignments.assignedProvinceId,
        action: 'BLOCKED_INMATE_EXIT_ATTEMPT',
        targetResource: `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmate.inmateId}`,
        details: `Tentativa bloqueada de registo de saída (${exitData.modality}) para ${inmate.profile.fullName} fora da jurisdição autorizada.`,
        ipAddress: '10.0.0.1 (Terminal PNAP)',
        jurisdictionStatus: 'BLOCKED_ATTEMPT'
      });
      this.notify();
      return {
        success: false,
        message: `Acesso Negado: Sem competência territorial para registar saída na província de ${inmate.provinceId.toUpperCase()}.`
      };
    }

    // Impedir saídas duplicadas caso o recluso já não esteja em custódia ativa
    const activeCustody =
      inmate.custodyState
        ? ['ATIVO_NA_UNIDADE', 'EM_DILIGENCIA_EXTERNA', 'HOSPITALIZADO_EXTERNO'].includes(
            inmate.custodyState
          )
        : inmate.currentStatus === 'ATIVO';
    if (!activeCustody || inmate.currentStatus !== 'ATIVO') {
      return {
        success: false,
        message: `Saída duplicada bloqueada: ${inmate.profile.fullName} já não se encontra em estado ATIVO (${inmate.custodyState || inmate.currentStatus}).`
      };
    }

    // Mapear estado final conforme modalidade
    const resultingStatus: 'LIBERTADO' | 'FALECIDO' | 'EVADIDO' | 'TRANSFERIDO' =
      exitData.modality === 'OBITO'
        ? 'FALECIDO'
        : exitData.modality === 'EVASAO'
        ? 'EVADIDO'
        : exitData.modality === 'TRANSFERENCIA'
        ? 'TRANSFERIDO'
        : 'LIBERTADO';

    const nowIso = new Date().toISOString();

    // 1. Atualizar estado do recluso preservando integralmente o histórico de admissão
    inmate.currentStatus = resultingStatus;
    inmate.custodyState =
      resultingStatus === 'TRANSFERIDO' ? 'EM_TRANSITO_TRANSFERENCIA' : resultingStatus;
    inmate.version = (inmate.version || 1) + 1;
    inmate.updatedAt = nowIso;
    inmate.updatedBy = user.profile.fullName;

    // 2. Atualizar NATIONAL_INMATE_INDEX
    this.syncNationalIndexFromInmate(inmate);

    // 3. Recalcular ocupação da unidade de origem (sem alterar capacidade física)
    const provinceEstablishments = this.establishments[inmate.provinceId] || [];
    const originUnit = provinceEstablishments.find((e) => e.establishmentId === inmate.establishmentId);
    if (originUnit) {
      originUnit.activeInmatesCount = Math.max(0, originUnit.activeInmatesCount - 1);
      if (originUnit.pavilions) {
        originUnit.pavilions.forEach((pav) => {
          pav.blocks.forEach((blk) => {
            blk.cells.forEach((cell) => {
              if (cell.cellId === inmate.cellId || cell.inmateIds.includes(inmate.inmateId)) {
                cell.inmateIds = cell.inmateIds.filter((id) => id !== inmate.inmateId);
                cell.currentOccupants = Math.max(0, cell.currentOccupants - 1);
              }
            });
          });
        });
      }
    }

    // 4. Recalcular estatísticas da província (sem alterar totalCapacity)
    const prevStats = this.getProvinceStats(inmate.provinceId);
    const nextActive = Math.max(0, prevStats.activeInmates - 1);
    const totalCap = prevStats.totalCapacity;
    const isPreventive =
      inmate.legal.legalStatus === 'PREVENTIVO' || inmate.legal.legalStatus === 'RECORRENTE';

    this.provinceStats[inmate.provinceId] = {
      ...prevStats,
      activeInmates: nextActive,
      availableSpots: Math.max(0, totalCap - nextActive),
      occupancyRate: totalCap > 0 ? Number(((nextActive / totalCap) * 100).toFixed(1)) : 0,
      preventiveCount: isPreventive
        ? Math.max(0, prevStats.preventiveCount - 1)
        : prevStats.preventiveCount,
      convictedCount: !isPreventive
        ? Math.max(0, prevStats.convictedCount - 1)
        : prevStats.convictedCount,
      maleCount:
        inmate.profile.gender === 'M'
          ? Math.max(0, prevStats.maleCount - 1)
          : prevStats.maleCount,
      femaleCount:
        inmate.profile.gender === 'F'
          ? Math.max(0, prevStats.femaleCount - 1)
          : prevStats.femaleCount
    };

    // 5. Registar evento histórico de saída (e guia em physicalTransfers se TRANSFERENCIA)
    const newRelease: ReleaseRecord = {
      releaseId: `rel-${Date.now()}`,
      inmateId: inmate.inmateId,
      fullName: inmate.profile.fullName,
      matricula: inmate.profile.matricula,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      alvaraNumber: exitData.documentNumber.trim(),
      judgeName: exitData.authorityOrDetail.trim(),
      releaseDate: exitData.exitDate.trim(),
      reason: exitData.modality,
      resultingStatus,
      destinationProvinceId: exitData.destinationProvinceId,
      destinationEstablishmentId: exitData.destinationEstablishmentId?.trim() || undefined,
      notes: exitData.notes?.trim() || undefined,
      registeredBy: user.profile.fullName,
      registeredAt: nowIso
    };

    this.releases.unshift(newRelease);

    if (exitData.modality === 'TRANSFERENCIA' && exitData.destinationProvinceId) {
      this.physicalTransfers.unshift({
        transferId: `trf-${Date.now()}`,
        inmateId: inmate.inmateId,
        inmateName: inmate.profile.fullName,
        matricula: inmate.profile.matricula,
        originProvinceId: inmate.provinceId,
        originEstablishmentId: inmate.establishmentId,
        destinationProvinceId: exitData.destinationProvinceId,
        destinationEstablishmentId: exitData.destinationEstablishmentId?.trim() || '',
        requestDate: exitData.exitDate.trim(),
        status: user.assignments.role === 'CENTRAL_ADMIN' ? 'AUTORIZADO_CENTRAL' : 'PENDENTE',
        justification: exitData.notes?.trim() || `Guia ${exitData.documentNumber.trim()}`,
        securityEscort: exitData.authorityOrDetail.trim(),
        authorizedBy: user.profile.fullName
      });
    }

    // 6. Auditoria imutável INMATE_EXIT_REGISTERED
    const unitLabel = originUnit ? `${originUnit.name} (${originUnit.establishmentId})` : inmate.establishmentId;
    const destLabel =
      exitData.modality === 'TRANSFERENCIA' && exitData.destinationProvinceId
        ? ` | Destino: ${exitData.destinationEstablishmentId?.trim()} (${exitData.destinationProvinceId.toUpperCase()})`
        : '';

    this.auditLogs.unshift({
      eventId: `evt-exit-${Date.now()}`,
      timestamp: nowIso,
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince:
        user.assignments.role === 'CENTRAL_ADMIN' ? 'CENTRAL_GLOBAL' : user.assignments.assignedProvinceId,
      action: 'INMATE_EXIT_REGISTERED',
      targetResource: `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmate.inmateId}`,
      details: `Saída registada [${exitData.modality} ➔ ${resultingStatus}]: ${inmate.profile.fullName} (${inmate.profile.matricula}) | Doc: ${newRelease.alvaraNumber} | Data: ${newRelease.releaseDate} | Unidade: ${unitLabel}${destLabel} | Oficial: ${user.profile.fullName}.`,
      ipAddress: '10.0.0.1 (Terminal PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });

    this.notify();
    return {
      success: true,
      message: `Saída registada (${exitData.modality} ➔ ${resultingStatus}): ${inmate.profile.fullName}.`,
      record: newRelease
    };
  }

  // --- 7. ADMISSÃO (CONFLITO NACIONAL BI/MATRÍCULA + REENTRADA NA MESMA FUR), RECAPTURA & RECEPÇÃO ---
  admitInmateOffline(
    user: PnapUser,
    input: {
      provinceId: ProvinceId;
      establishmentId: string;
      fullName: string;
      matricula: string;
      biNumber: string;
      gender: 'M' | 'F';
      courtName: string;
      crimeCategory: string;
      processNumber: string;
      reentry?: boolean;
      existingInmateId?: string;
    }
  ): { success: boolean; message: string; inmate?: Inmate; admission?: AdmissionRecord } {
    if (!this.canOperateProvince(user, input.provinceId)) {
      return { success: false, message: 'Sem jurisdição provincial para admitir reclusos.' };
    }

    const normBi = isMeaningfulBi(input.biNumber) ? input.biNumber.trim().toUpperCase() : '';
    const normMat = input.matricula.trim().toUpperCase();
    const nowIso = new Date().toISOString();

    const matchedById = input.existingInmateId
      ? this.inmates.find((i) => i.inmateId === input.existingInmateId)
      : undefined;
    const duplicate =
      matchedById ||
      this.inmates.find(
        (i) =>
          (normBi && isMeaningfulBi(i.profile.biNumber) && i.profile.biNumber.trim().toUpperCase() === normBi) ||
          (normMat && i.profile.matricula.trim().toUpperCase() === normMat)
      );

    if (duplicate) {
      if (duplicate.currentStatus === 'EVADIDO' || duplicate.custodyState === 'EVADIDO') {
        return {
          success: false,
          message: `Recluso ${duplicate.profile.fullName} (${duplicate.profile.matricula}) encontra-se EVADIDO. Utilize o fluxo de Recaptura.`
        };
      }
      if (duplicate.currentStatus === 'FALECIDO' || duplicate.custodyState === 'FALECIDO') {
        return {
          success: false,
          message: `FUR bloqueada por óbito registado (${duplicate.profile.matricula}).`
        };
      }
      if (duplicate.currentStatus === 'ATIVO' || duplicate.currentStatus === 'TRANSFERIDO') {
        return {
          success: false,
          message: `Conflito de Identidade Nacional: já existe uma FUR ativa para BI/Matrícula (${duplicate.profile.matricula}).`
        };
      }

      if (!input.reentry) {
        return {
          success: false,
          message: `Cidadão já possui FUR histórica (${duplicate.profile.matricula}) em estado ${duplicate.currentStatus}. Selecione a ficha na pesquisa e ative Reentrada na Mesma FUR.`
        };
      }

      // Reentrada sobre a mesma FUR vitalícia (sem duplicar perfil, visitantes ou histórico)
      const admissionId = `adm-${Date.now()}`;
      duplicate.provinceId = input.provinceId;
      duplicate.establishmentId = input.establishmentId || duplicate.establishmentId;
      duplicate.currentStatus = 'ATIVO';
      duplicate.custodyState = 'ATIVO_NA_UNIDADE';
      duplicate.version = (duplicate.version || 1) + 1;
      duplicate.updatedAt = nowIso;
      duplicate.updatedBy = user.profile.fullName;
      duplicate.admission = {
        ...duplicate.admission,
        admissionId,
        admissionDate: nowIso.split('T')[0],
        courtName: input.courtName.trim(),
        processNumber: input.processNumber.trim(),
        mandateNumber: `MAND-${Date.now().toString().slice(-4)}`,
        custodyReason: input.crimeCategory.trim() || 'Novo Mandado / Reingresso',
        intakeOfficer: user.profile.fullName
      };
      duplicate.legal = {
        ...duplicate.legal,
        legalStatus: 'PREVENTIVO',
        crimeCategory: input.crimeCategory.trim()
      };
      duplicate.documents.unshift({
        documentId: `doc-reent-${Date.now()}`,
        title: `Mandado de Reingresso (${input.processNumber.trim()})`,
        type: 'GUIA_CONDUCAO',
        uploadDate: nowIso.split('T')[0],
        fileSize: 'Digital (PNAP)'
      });

      const admission: AdmissionRecord = {
        admissionId,
        inmateId: duplicate.inmateId,
        fullName: duplicate.profile.fullName,
        matricula: duplicate.profile.matricula,
        provinceId: duplicate.provinceId,
        establishmentId: duplicate.establishmentId,
        courtName: duplicate.admission.courtName,
        crime: duplicate.legal.crimeCategory,
        timestamp: nowIso,
        registeredBy: user.profile.fullName
      };

      this.admissions.unshift(admission);
      this.syncNationalIndexFromInmate(duplicate);
      this.auditLogs.unshift({
        eventId: `evt-reent-${Date.now()}`,
        timestamp: nowIso,
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: duplicate.provinceId,
        action: 'INMATE_REENTRY_SAME_FUR',
        targetResource: `pnap/inmates/${duplicate.inmateId}`,
        details: `Reentrada na mesma FUR (${duplicate.profile.matricula}) sem duplicação de dados biográficos. Processo: ${admission.courtName}.`,
        ipAddress: '10.0.0.1 (Terminal PNAP)',
        jurisdictionStatus: 'AUTHORIZED'
      });
      this.notify();
      return {
        success: true,
        message: `Reentrada registada sobre a mesma FUR (${duplicate.profile.matricula}) · v${duplicate.version}.`,
        inmate: duplicate,
        admission
      };
    }

    const inmateId = `inm-${Date.now()}`;
    const inmate: Inmate = {
      inmateId,
      provinceId: input.provinceId,
      establishmentId: input.establishmentId || 'comarca-viana',
      pavilionId: 'pav-1',
      blockId: 'blk-1',
      cellId: 'cel-1',
      currentStatus: 'ATIVO',
      custodyState: 'ATIVO_NA_UNIDADE',
      version: 1,
      profile: {
        inmateId,
        fullName: input.fullName.trim(),
        matricula: input.matricula.trim(),
        biNumber: input.biNumber.trim(),
        dateOfBirth: '1990-01-01',
        gender: input.gender,
        provinceOfOrigin: PROVINCES_DATA[input.provinceId]?.name || input.provinceId,
        fatherName: 'Não declarado',
        motherName: 'Não declarada',
        neighborhood: 'Em verificação',
        photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&fit=crop&crop=faces',
        emergencyContact: { name: 'Contacto pendente', phone: '', relationship: 'Familiar' }
      },
      admission: {
        admissionId: `adm-${Date.now()}`,
        admissionDate: nowIso.split('T')[0],
        courtName: input.courtName.trim(),
        processNumber: input.processNumber.trim(),
        mandateNumber: `MAND-${Date.now().toString().slice(-4)}`,
        custodyReason: input.crimeCategory.trim() || 'Mandado de Condução / Prisão Preventiva',
        initialPavilionId: 'pav-1',
        intakeOfficer: user.profile.fullName
      },
      legal: {
        legalStatus: 'PREVENTIVO',
        crimeCategory: input.crimeCategory.trim(),
        penalCodeArticle: 'Código Penal Angolano',
        totalSentenceYears: 0,
        totalSentenceMonths: 0,
        timeServedMonths: 0,
        remissionEarnedMonths: 0,
        eligibleParoleDate: '',
        endOfSentenceDate: ''
      },
      health: {
        bloodType: 'N/D',
        chronicDiseases: [],
        allergies: [],
        dailyMedication: [],
        mentalHealthStatus: 'Aguardando triagem clínica inicial',
        lastMedicalCheckup: nowIso.split('T')[0],
        dietaryRestrictions: 'Comum'
      },
      rehabilitation: {
        educationLevel: 'Em avaliação',
        coursesEnrolled: [],
        meritPoints: 50,
        conductClassification: 'BOM',
        riskLevel: 'MEDIO'
      },
      incidents: [],
      disciplinary: { infractionsCount: 0, sanctionHistory: [] },
      postInstitutional: { reintegrationPlanStatus: 'EM_ANALISE', familyShelterConfirmed: false, vocationalRecommendation: 'Avaliação inicial' },
      documents: [],
      visitors: [],
      visits: [],
      updatedAt: nowIso,
      updatedBy: user.profile.fullName
    };

    const admission: AdmissionRecord = {
      admissionId: `adm-${Date.now()}`,
      inmateId,
      fullName: inmate.profile.fullName,
      matricula: inmate.profile.matricula,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      courtName: inmate.admission.courtName,
      crime: inmate.legal.crimeCategory,
      timestamp: nowIso,
      registeredBy: user.profile.fullName
    };

    this.inmates.unshift(inmate);
    INMATES_LOCAL_DB.unshift(inmate);
    this.admissions.unshift(admission);
    this.syncNationalIndexFromInmate(inmate);
    this.notify();
    return {
      success: true,
      message: `FUR criada (${inmate.profile.matricula}) · Versão 1.`,
      inmate,
      admission
    };
  }

  recaptureInmateOffline(
    user: PnapUser,
    inmateId: string,
    documentNumber: string,
    authorityOrEscort: string
  ): { success: boolean; message: string; inmate?: Inmate } {
    const inmate = this.inmates.find((i) => i.inmateId === inmateId);
    if (!inmate) return { success: false, message: 'FUR não encontrada.' };
    if (inmate.currentStatus !== 'EVADIDO' && inmate.custodyState !== 'EVADIDO') {
      return { success: false, message: 'Apenas reclusos EVADIDOS podem ser recapturados.' };
    }
    const nowIso = new Date().toISOString();
    inmate.currentStatus = 'ATIVO';
    inmate.custodyState = 'ATIVO_NA_UNIDADE';
    inmate.version = (inmate.version || 1) + 1;
    inmate.updatedAt = nowIso;
    inmate.updatedBy = user.profile.fullName;
    this.syncNationalIndexFromInmate(inmate);
    this.auditLogs.unshift({
      eventId: `evt-rec-${Date.now()}`,
      timestamp: nowIso,
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince: inmate.provinceId,
      action: 'INMATE_RECAPTURED',
      targetResource: `pnap/inmates/${inmateId}`,
      details: `Recaptura registada sobre a mesma FUR (${inmate.profile.matricula}) · Auto ${documentNumber} (${authorityOrEscort}).`,
      ipAddress: '10.0.0.1 (Terminal PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });
    this.notify();
    return { success: true, message: `Recaptura concluída: ${inmate.profile.fullName} reativado na mesma matrícula.`, inmate };
  }

  receiveTransferOffline(user: PnapUser, transferId: string): { success: boolean; message: string } {
    const trf = this.physicalTransfers.find((t) => t.transferId === transferId);
    if (!trf) return { success: false, message: 'Guia de transferência não encontrada.' };
    if (!this.canOperateProvince(user, trf.destinationProvinceId)) {
      return { success: false, message: 'Apenas a unidade de destino ou Direção Geral pode confirmar receção.' };
    }
    trf.status = 'CONCLUIDO';
    const inmate = this.inmates.find((i) => i.inmateId === trf.inmateId);
    if (inmate) {
      inmate.provinceId = trf.destinationProvinceId;
      inmate.establishmentId = trf.destinationEstablishmentId;
      inmate.currentStatus = 'ATIVO';
      inmate.custodyState = 'ATIVO_NA_UNIDADE';
      inmate.version = (inmate.version || 1) + 1;
      inmate.updatedAt = new Date().toISOString();
      inmate.updatedBy = user.profile.fullName;
      this.syncNationalIndexFromInmate(inmate);
    }
    this.notify();
    return { success: true, message: `Receção confirmada em ${trf.destinationEstablishmentId} (${trf.destinationProvinceId.toUpperCase()}).` };
  }

  // --- 8. VISITAS, VISITANTES & INCIDENTES INTEGRADOS DIRETAMENTE NA FUR (SEM DUPLICAÇÃO) ---
  getVisitorsFromFursOffline(user: PnapUser): VisitorRecord[] {
    const byId = new Map<string, VisitorRecord>();
    this.inmates
      .filter((i) => this.canOperateProvince(user, i.provinceId))
      .forEach((inm) => {
        (inm.visitors || []).forEach((v) => {
          byId.set(v.visitorId, {
            visitorId: v.visitorId,
            fullName: v.fullName,
            biNumber: v.biNumber,
            phone: v.phone,
            relationship: v.relationship,
            inmateId: inm.inmateId,
            inmateName: inm.profile.fullName,
            provinceId: inm.provinceId,
            establishmentId: inm.establishmentId,
            lastVisitDate: v.lastVisitDate || '',
            status: v.status
          });
        });
      });
    MOCK_VISITORS.forEach((mv) => {
      if (this.canOperateProvince(user, mv.provinceId) && !byId.has(mv.visitorId)) {
        byId.set(mv.visitorId, mv);
      }
    });
    return Array.from(byId.values());
  }

  getVisitsFromFursOffline(user: PnapUser): VisitRecord[] {
    const byId = new Map<string, VisitRecord>();
    this.inmates
      .filter((i) => this.canOperateProvince(user, i.provinceId))
      .forEach((inm) => {
        (inm.visits || []).forEach((vst) => {
          byId.set(vst.visitId, {
            visitId: vst.visitId,
            visitorId: vst.visitorId,
            visitorName: vst.visitorName,
            inmateId: inm.inmateId,
            inmateName: inm.profile.fullName,
            provinceId: inm.provinceId,
            establishmentId: inm.establishmentId,
            date: vst.date,
            timeSlot: vst.timeSlot,
            inspectionPassed: vst.inspectionPassed,
            dutyOfficer: vst.dutyOfficer
          });
        });
      });
    MOCK_VISITS.forEach((mv) => {
      if ((!mv.provinceId || this.canOperateProvince(user, mv.provinceId)) && !byId.has(mv.visitId)) {
        byId.set(mv.visitId, mv);
      }
    });
    return Array.from(byId.values()).sort((a, b) => b.date.localeCompare(a.date));
  }

  registerVisitorOnFurOffline(
    user: PnapUser,
    inmateId: string,
    payload: { fullName: string; biNumber: string; phone?: string; relationship?: string }
  ): { success: boolean; message: string; visitor?: VisitorRecord; inmate?: Inmate } {
    const inmate = this.inmates.find((i) => i.inmateId === inmateId);
    if (!inmate) return { success: false, message: 'FUR do recluso não encontrada.' };
    if (!this.canOperateProvince(user, inmate.provinceId)) {
      return { success: false, message: 'Sem jurisdição provincial sobre esta FUR.' };
    }
    const custody = inmate.custodyState || inmate.currentStatus;
    if (custody === 'LIBERTADO' || custody === 'FALECIDO') {
      return { success: false, message: `Não é possível vincular visitante a recluso ${custody}.` };
    }
    const nowIso = new Date().toISOString();
    const normBi = payload.biNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const list = [...(inmate.visitors || [])];
    const existingIdx = list.findIndex(
      (v) => v.biNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === normBi
    );
    let embedded: InmateVisitor;
    let actionLabel = 'autorizado';
    if (existingIdx >= 0) {
      if (list[existingIdx].status === 'SUSPENSO') {
        return {
          success: false,
          message: `Visitante ${list[existingIdx].fullName} já consta como SUSPENSO nesta FUR.`
        };
      }
      embedded = {
        ...list[existingIdx],
        fullName: payload.fullName.trim(),
        phone: (payload.phone || list[existingIdx].phone || '').trim(),
        relationship: (payload.relationship || list[existingIdx].relationship || 'Familiar').trim()
      };
      list[existingIdx] = embedded;
      actionLabel = 'atualizado';
    } else {
      embedded = {
        visitorId: `vis-${Date.now()}`,
        fullName: payload.fullName.trim(),
        biNumber: payload.biNumber.trim(),
        phone: (payload.phone || '').trim(),
        relationship: (payload.relationship || 'Familiar').trim(),
        status: 'AUTORIZADO',
        registeredAt: nowIso,
        registeredBy: user.profile.fullName
      };
      list.unshift(embedded);
    }

    inmate.visitors = list;
    inmate.version = (inmate.version || 1) + 1;
    inmate.updatedAt = nowIso;
    inmate.updatedBy = user.profile.fullName;
    this.syncNationalIndexFromInmate(inmate);

    const record: VisitorRecord = {
      visitorId: embedded.visitorId,
      fullName: embedded.fullName,
      biNumber: embedded.biNumber,
      phone: embedded.phone,
      relationship: embedded.relationship,
      inmateId: inmate.inmateId,
      inmateName: inmate.profile.fullName,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      lastVisitDate: embedded.lastVisitDate || '',
      status: embedded.status
    };
    this.notify();
    return {
      success: true,
      message: `Visitante ${embedded.fullName} ${actionLabel} diretamente na FUR (${inmate.profile.matricula}).`,
      visitor: record,
      inmate
    };
  }

  toggleVisitorStatusOnFurOffline(
    user: PnapUser,
    inmateId: string,
    visitorId: string,
    status: 'AUTORIZADO' | 'SUSPENSO',
    reason?: string
  ): { success: boolean; message: string; visitor?: VisitorRecord; inmate?: Inmate } {
    const inmate = this.inmates.find((i) => i.inmateId === inmateId);
    if (!inmate) return { success: false, message: 'FUR não encontrada.' };
    if (!this.canOperateProvince(user, inmate.provinceId)) {
      return { success: false, message: 'Sem jurisdição provincial.' };
    }
    const list = [...(inmate.visitors || [])];
    const idx = list.findIndex((v) => v.visitorId === visitorId);
    if (idx < 0) return { success: false, message: 'Visitante não encontrado na FUR.' };

    const nowIso = new Date().toISOString();
    list[idx] = {
      ...list[idx],
      status,
      ...(status === 'SUSPENSO'
        ? { suspendedReason: reason?.trim() || 'Suspensão administrativa' }
        : { suspendedReason: undefined })
    };
    inmate.visitors = list;
    inmate.version = (inmate.version || 1) + 1;
    inmate.updatedAt = nowIso;
    inmate.updatedBy = user.profile.fullName;
    this.syncNationalIndexFromInmate(inmate);

    const updated = list[idx];
    this.notify();
    return {
      success: true,
      message: `${updated.fullName} atualizado para ${status} na FUR.`,
      visitor: {
        visitorId: updated.visitorId,
        fullName: updated.fullName,
        biNumber: updated.biNumber,
        phone: updated.phone,
        relationship: updated.relationship,
        inmateId: inmate.inmateId,
        inmateName: inmate.profile.fullName,
        provinceId: inmate.provinceId,
        establishmentId: inmate.establishmentId,
        lastVisitDate: updated.lastVisitDate || '',
        status: updated.status
      },
      inmate
    };
  }

  registerVisitCheckInOnFurOffline(
    user: PnapUser,
    inmateId: string,
    payload: { visitorId: string; date?: string; timeSlot?: string; inspectionPassed: boolean; notes?: string }
  ): { success: boolean; message: string; visit?: VisitRecord; inmate?: Inmate } {
    const inmate = this.inmates.find((i) => i.inmateId === inmateId);
    if (!inmate) return { success: false, message: 'FUR não encontrada.' };
    if (!this.canOperateProvince(user, inmate.provinceId)) {
      return { success: false, message: 'Sem jurisdição provincial.' };
    }
    const custody = inmate.custodyState || (inmate.currentStatus === 'ATIVO' ? 'ATIVO_NA_UNIDADE' : inmate.currentStatus);
    if (custody !== 'ATIVO_NA_UNIDADE') {
      return { success: false, message: `Visita bloqueada: custódia atual é ${custody}.` };
    }
    const visitDate = payload.date?.trim() || new Date().toISOString().split('T')[0];
    if (
      inmate.disciplinary?.visitsBlockedUntil &&
      visitDate <= inmate.disciplinary.visitsBlockedUntil
    ) {
      return {
        success: false,
        message: `Visita bloqueada por sanção disciplinar até ${inmate.disciplinary.visitsBlockedUntil}.`
      };
    }
    const list = [...(inmate.visitors || [])];
    const visIdx = list.findIndex((v) => v.visitorId === payload.visitorId);
    if (visIdx < 0) return { success: false, message: 'Visitante não autorizado nesta FUR.' };
    const visitor = list[visIdx];
    if (visitor.status !== 'AUTORIZADO') {
      return {
        success: false,
        message: `Visitante ${visitor.fullName} está SUSPENSO${visitor.suspendedReason ? ` (${visitor.suspendedReason})` : ''}.`
      };
    }
    if (!payload.inspectionPassed) {
      return { success: false, message: 'Visita bloqueada: inspeção obrigatória de portaria não aprovada.' };
    }

    const nowIso = new Date().toISOString();
    const embeddedVisit: InmateVisit = {
      visitId: `vst-${Date.now()}`,
      visitorId: visitor.visitorId,
      visitorName: visitor.fullName,
      visitorBi: visitor.biNumber,
      date: visitDate,
      timeSlot: payload.timeSlot?.trim() || '09:00 - 11:00',
      inspectionPassed: true,
      dutyOfficer: user.profile.fullName,
      ...(payload.notes?.trim() ? { notes: payload.notes.trim() } : {})
    };
    list[visIdx] = { ...visitor, lastVisitDate: visitDate };
    inmate.visitors = list;
    inmate.visits = [embeddedVisit, ...(inmate.visits || [])];
    inmate.version = (inmate.version || 1) + 1;
    inmate.updatedAt = nowIso;
    inmate.updatedBy = user.profile.fullName;

    const visitRecord: VisitRecord = {
      visitId: embeddedVisit.visitId,
      visitorId: embeddedVisit.visitorId,
      visitorName: embeddedVisit.visitorName,
      inmateId: inmate.inmateId,
      inmateName: inmate.profile.fullName,
      provinceId: inmate.provinceId,
      establishmentId: inmate.establishmentId,
      date: embeddedVisit.date,
      timeSlot: embeddedVisit.timeSlot,
      inspectionPassed: true,
      dutyOfficer: embeddedVisit.dutyOfficer
    };
    this.notify();
    return {
      success: true,
      message: `Entrada registada diretamente na FUR de ${inmate.profile.fullName}.`,
      visit: visitRecord,
      inmate
    };
  }

  registerIncidentOnFurOffline(
    user: PnapUser,
    inmateId: string,
    payload: {
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
    }
  ): { success: boolean; message: string; incident?: InmateIncident; inmate?: Inmate } {
    const inmate = this.inmates.find((i) => i.inmateId === inmateId);
    if (!inmate) return { success: false, message: 'FUR não encontrada.' };
    if (!this.canOperateProvince(user, inmate.provinceId)) {
      return { success: false, message: 'Sem jurisdição provincial.' };
    }
    const nowIso = new Date().toISOString();
    const incidentDate = payload.date?.trim() || nowIso.split('T')[0];
    const source: 'INTERNO' | 'VISITA' = payload.source === 'VISITA' ? 'VISITA' : 'INTERNO';
    const incident: InmateIncident = {
      incidentId: `inc-${Date.now()}`,
      date: incidentDate,
      type: payload.type,
      severity: payload.severity,
      description: payload.description.trim(),
      actionsTaken: payload.actionsTaken.trim(),
      reportedBy: user.profile.fullName,
      source,
      ...(payload.visitorId ? { visitorId: payload.visitorId } : {}),
      ...(payload.visitorName ? { visitorName: payload.visitorName } : {}),
      ...(payload.visitorBi ? { visitorBi: payload.visitorBi } : {})
    };

    inmate.incidents = [incident, ...(inmate.incidents || [])];
    inmate.disciplinary = {
      ...inmate.disciplinary,
      infractionsCount: (inmate.disciplinary?.infractionsCount || 0) + 1,
      lastInfractionDate: incidentDate,
      ...(payload.sanctionMeasure?.trim()
        ? {
            activeSanction: payload.sanctionMeasure.trim(),
            sanctionHistory: [
              {
                date: incidentDate,
                description: incident.description,
                measure: payload.sanctionMeasure.trim(),
                signedBy: user.profile.fullName
              },
              ...(inmate.disciplinary?.sanctionHistory || [])
            ]
          }
        : {}),
      ...(payload.visitsBlockedUntil?.trim()
        ? { visitsBlockedUntil: payload.visitsBlockedUntil.trim() }
        : {})
    };

    if (payload.suspendVisitorId && inmate.visitors) {
      inmate.visitors = inmate.visitors.map((v) =>
        v.visitorId === payload.suspendVisitorId
          ? {
              ...v,
              status: 'SUSPENSO',
              suspendedReason:
                payload.sanctionMeasure?.trim() || `Incidente em visita (${incident.type})`
            }
          : v
      );
    }

    const penalty = Math.max(0, Number(payload.meritPenaltyPoints) || 0);
    inmate.rehabilitation = {
      ...inmate.rehabilitation,
      meritPoints: Math.max(0, (inmate.rehabilitation?.meritPoints || 0) - penalty)
    };
    inmate.version = (inmate.version || 1) + 1;
    inmate.updatedAt = nowIso;
    inmate.updatedBy = user.profile.fullName;
    this.syncNationalIndexFromInmate(inmate);

    this.auditLogs.unshift({
      eventId: `evt-inc-${Date.now()}`,
      timestamp: nowIso,
      userId: user.uid,
      userName: user.profile.fullName,
      userRole: user.assignments.role,
      userScopeProvince: inmate.provinceId,
      action: source === 'VISITA' ? 'VISITOR_INCIDENT_MIGRATED_TO_FUR' : 'INMATE_INCIDENT_REGISTERED',
      targetResource: `pnap/inmates/${inmate.inmateId}`,
      details: `Ocorrência [${source}] gravada diretamente na FUR de ${inmate.profile.fullName} (${incident.type}).`,
      ipAddress: '10.0.0.1 (Terminal PNAP)',
      jurisdictionStatus: 'AUTHORIZED'
    });

    this.notify();
    return {
      success: true,
      message: `Ocorrência (${source}) migrada diretamente para a FUR de ${inmate.profile.fullName}.`,
      incident,
      inmate
    };
  }
}

export const pnapStore = new PnapStoreService();
