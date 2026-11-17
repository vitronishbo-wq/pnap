/**
 * PNAP - Sistema Nacional de Administração Prisional (República de Angola)
 * Tipagens estritas baseadas na hierarquia do sistema, RDPA 2024 (21 Províncias)
 * e Arquitetura Oficial da Ficha Única do Recluso (FUR) + Motor de Estados.
 */

export type UserRole =
  | 'CENTRAL_ADMIN'          // Direcção Geral Nacional PNAP (Acesso irrestrito a todas as províncias)
  | 'PROVINCIAL_COMMAND'     // Comando Provincial (ex: Luanda) - Acesso estrito à sua província
  | 'ESTABLISHMENT_DIRECTOR' // Director de Comarca/Penitenciária
  | 'OPERATIONAL_OFFICER'    // Oficial Operacional / Portaria / Registo (compatibilidade legada)
  | 'PENAL_CONTROL'          // Oficial de Controlo Penal (Admissões, Processos, Transições, Transferências)
  | 'HEALTH_SPECIALIST'      // Técnico/Médico de Saúde Prisional (Sigilo Clínico estrito)
  | 'REHABILITATION'         // Reabilitador / Psicossocial / Classificação e Alojamento
  | 'GATE_SECURITY'          // Oficial de Portaria / Escolta / Visitas e Movimentação Física
  | 'AUDITOR_INSPECTOR';     // Auditor / Inspector Nacional ou Provincial (Leitura & Auditoria)

export interface UserAssignment {
  role: UserRole;
  assignedProvinceId: string; // ex: 'luanda' ou 'all'
  assignedEstablishmentId?: string; // ex: 'comarca-viana'
  permissions: string[];
}

export interface UserProfile {
  uid: string;
  fullName: string;
  badgeNumber: string; // Patente / CIP
  rank: string;        // ex: Subcomissário Prisional, Superintendente, etc.
  phone: string;
  email: string;
  status: 'active' | 'suspended';
}

export interface PnapUser {
  uid: string;
  profile: UserProfile;
  assignments: UserAssignment;
}

// 21 Províncias segundo a Nova Divisão Político-Administrativa (RDPA 2024)
export type ProvinceId =
  | 'luanda'
  | 'icolo_e_bengo'
  | 'bengo'
  | 'cuanza_norte'
  | 'cuanza_sul'
  | 'malanje'
  | 'uige'
  | 'zaire'
  | 'cabinda'
  | 'lunda_norte'
  | 'lunda_sul'
  | 'benguela'
  | 'huambo'
  | 'bie'
  | 'moxico'
  | 'moxico_leste'
  | 'huila'
  | 'namibe'
  | 'cunene'
  | 'cuando'
  | 'cubango';

export interface ProvinceProfile {
  id: ProvinceId;
  name: string;
  capital: string;
  delegadoProvincial: string;
  contactEmergency: string;
  coordinates: { lat: number; lng: number };
  shortCode: string;
}

export interface ProvinceStatistics {
  periodId: string;
  activeInmates: number;
  totalCapacity: number;
  occupancyRate: number; // Percentual
  availableSpots: number;
  establishmentsCount: number;
  preventiveCount: number;
  convictedCount: number;
  maleCount: number;
  femaleCount: number;
}

export interface Cell {
  cellId: string;
  code: string;
  capacity: number; // ex: 4 vagas
  currentOccupants: number;
  securityLevel: 'MAXIMA' | 'MEDIA' | 'MINIMA' | 'DISCIPLINAR';
  inmateIds: string[];
}

export interface Block {
  blockId: string;
  name: string;
  cells: Cell[];
  calculatedCapacity?: number; // Calculado automaticamente: Σ celas * vagas
}

export interface Pavilion {
  pavilionId: string;
  name: string;
  securityType: 'FECHADO' | 'SEMI_ABERTO' | 'ABERTO' | 'HOSPITALAR';
  blocks: Block[];
  calculatedCapacity?: number; // Calculado automaticamente: Σ blocos
}

export interface EstablishmentProfile {
  establishmentId: string;
  provinceId: ProvinceId;
  name: string;
  code: string;
  type: 'PENITENCIARIA' | 'COMARCA' | 'CENTRO_JUVENIL' | 'HOSPITAL_PRISIONAL';
  securityLevel: 'MAXIMA' | 'MEDIA' | 'COMUM';
  directorName: string;
  address: string;
  totalCapacity: number; // Calculado automaticamente: Σ pavilhões
  activeInmatesCount: number;
  pavilions?: Pavilion[];
  // Provisionamento em Duas Fases:
  provisioningStatus?: 'DRAFT' | 'HOMOLOGATED';
  homologatedAt?: string;
  homologatedBy?: string;
  homologationDecreeNumber?: string;
}

// --- MOTOR DE ESTADOS DA FICHA ÚNICA DO RECLUSO (FUR) ---

/**
 * Eixo 1 (Físico / Custódia): Estado real da custódia e ocupação de vaga.
 * Ortogonal à situação jurídico-penal (Eixo 2).
 */
export type CustodyState =
  | 'PRE_ADMISSAO'
  | 'ATIVO_NA_UNIDADE'
  | 'EM_DILIGENCIA_EXTERNA'
  | 'HOSPITALIZADO_EXTERNO'
  | 'EM_TRANSITO_TRANSFERENCIA'
  | 'LIBERTADO'
  | 'EVADIDO'
  | 'FALECIDO';

/**
 * Eixo 2 (Jurídico-Penal): Situação processual consolidada sobre N processos ativos.
 */
export type LegalStatus =
  | 'PREVENTIVO'
  | 'CONDENADO'
  | 'RECORRENTE'
  | 'TRANSITO_EM_JULGADO'
  | 'EXTINTO';

/**
 * Estado legado na UI/API (mantido para compatibilidade retroativa durante migração progressiva)
 */
export type LegacyCustodyStatus = 'ATIVO' | 'TRANSFERIDO' | 'LIBERTADO' | 'EVADIDO' | 'FALECIDO';

/**
 * Melhoria 1: Bloqueio de Identidade Única Nacional (previne duplicação de matrícula/BI em reentradas ou recapturas)
 */
export interface IdentityLock {
  lockKey: string; // ex: BI normalizado ou chave composta nacional
  inmateId: string;
  matricula: string;
  normalizedBiNumber: string;
  fullNameNormalized: string;
  activeCustodyState: CustodyState;
  lastUpdated: string;
}

/**
 * Melhoria 2 & 3: Processo Judicial Individual (1 recluso pode ter N processos simultâneos).
 * A soltura definitiva é bloqueada se existir qualquer processo com isActive === true.
 */
export interface JudicialProcess {
  processId: string;
  inmateId: string;
  provinceId: ProvinceId;
  establishmentId: string;
  processNumber: string;
  courtName: string;
  judgeName?: string;
  crimeCategory: string;
  penalCodeArticle: string;
  legalStatus: LegalStatus;
  regime?: 'FECHADO' | 'SEMI_ABERTO' | 'ABERTO';
  sentenceAcordaoNumber?: string;
  sentenceDate?: string;
  transitDate?: string;
  totalSentenceYears: number;
  totalSentenceMonths: number;
  startDate: string;
  endOfSentenceDate?: string;
  eligibleParoleDate?: string;
  isActive: boolean;
  extintionReason?: string;
  extintionDate?: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Melhoria 6: Projeção não-clínica para a raiz da FUR (sem diagnósticos ou patologias sensíveis).
 * Visível operacionalmente para segurança e alocação segura de cela/dieta.
 */
export interface HealthAlertSummary {
  hasActiveAlerts: boolean;
  infectiousRisk: boolean;
  suicideRisk: boolean;
  mobilityRestricted: boolean;
  allergyFlags: string[];
  dietFlags: string[];
  specialUnitRecommended?: boolean;
  lastTriagedAt?: string;
}

/**
 * Melhoria 6: Registo Clínico Isolado em Subcoleção (/pnap_inmates/{inmateId}/health_records/{recordId}).
 * Leitura e escrita estritamente bloqueadas para perfis não-HEALTH_SPECIALIST.
 */
export interface HealthRecord {
  recordId: string;
  inmateId: string;
  provinceId: ProvinceId;
  establishmentId: string;
  bloodType?: string;
  clinicalDiagnosis: string;
  chronicDiseases: string[];
  prescribedMedication: string[];
  mentalHealthNotes: string;
  clinicalObservations: string;
  triageOutcome: 'APTO_COMUM' | 'ISOLAMENTO_SANITARIO' | 'ENFERMARIA' | 'HOSPITAL_EXTERNO';
  recordedByUid: string;
  recordedByName: string;
  recordedAt: string;
}

export type MovementType =
  | 'SAIDA_DILIGENCIA'
  | 'RETORNO_DILIGENCIA'
  | 'HOSPITALIZACAO_EXTERNA'
  | 'RETORNO_HOSPITAL'
  | 'TRANSFERENCIA_DESPACHO'
  | 'TRANSFERENCIA_RECEPCAO'
  | 'RECAPTURA'
  | 'EVASAO'
  | 'OBITO'
  | 'SOLTURA_DEFINITIVA';

/**
 * Melhorias 4 & 5: Registo de Movimentação Física (diligências, transferências em 2 etapas, recaptura).
 */
export interface MovementRecord {
  movementId: string;
  inmateId: string;
  provinceId: ProvinceId;
  establishmentId: string;
  type: MovementType;
  documentNumber: string;
  authorityOrEscort: string;
  destinationLabel?: string;
  targetProvinceId?: ProvinceId;
  targetEstablishmentId?: string;
  targetPavilionId?: string;
  targetBlockId?: string;
  targetCellId?: string;
  reserveOriginCell: boolean;
  timestamp: string;
  registeredByUid: string;
  registeredByName: string;
  notes?: string;
}

/**
 * Catálogo Dinâmico Configurável (/pnap_catalogs/{catalogId})
 */
export interface PnapCatalog {
  catalogId: string;
  category: 'CRIMES' | 'INCIDENTS' | 'EXIT_REASONS' | 'ESCORT_PROTOCOLS' | 'REHAB_PROGRAMS';
  items: Array<{
    code: string;
    label: string;
    active: boolean;
    severity?: string;
  }>;
  updatedAt: string;
  updatedBy: string;
}

// Transição Jurídico-Penal: Mudança de estado do recluso (Detido/Preventivo → Condenado com trânsito em julgado)
export interface LegalTransitionRecord {
  transitionId: string;
  inmateId: string;
  processId?: string;
  inmateName: string;
  matricula: string;
  provinceId: ProvinceId;
  establishmentId: string;
  previousStatus: 'PREVENTIVO' | 'RECORRENTE';
  newStatus: 'CONDENADO' | 'TRANSITO_EM_JULGADO';
  courtName: string;             // Tribunal Judicial da Comarca
  sentenceAcordaoNumber: string; // N.º do Acórdão / Sentença
  sentenceDate: string;          // Data da Decisão Judicial
  transitDate: string;           // Data do Trânsito em Julgado
  totalSentenceYears: number;    // Anos fixados
  totalSentenceMonths: number;   // Meses fixados
  regime: 'FECHADO' | 'SEMI_ABERTO';
  judgeName: string;             // Juiz da Causa
  effectiveDate: string;
  registeredBy: string;
  notes?: string;
}

export interface InmateProfile {
  inmateId: string;
  matricula: string; // ex: LA-2024-0012
  biNumber: string;   // Bilhete de Identidade
  fullName: string;
  alias?: string;     // Alcunha
  dateOfBirth: string;
  gender: 'M' | 'F';
  fatherName: string;
  motherName: string;
  emergencyContact: {
    name: string;
    relationship: string; // Parente (ex: Mãe, Irmão, Esposa)
    phone: string;
  };
  neighborhood: string; // Bairro de residência/origem
  provinceOfOrigin: string;
  photoUrl: string;
}

export interface InmateAdmission {
  admissionId: string;
  admissionDate: string;
  processNumber: string;
  courtName: string;    // Tribunal da Comarca de...
  mandateNumber: string; // Mandado de Condução
  custodyReason: string;
  initialPavilionId: string;
  intakeOfficer: string;
}

export interface InmateLegal {
  legalStatus: Exclude<LegalStatus, 'EXTINTO'>;
  crimeCategory: string; // ex: Roubo Qualificado, Homicídio, Burla por Defraudação
  penalCodeArticle: string;
  totalSentenceYears: number;
  totalSentenceMonths: number;
  timeServedMonths: number;
  remissionEarnedMonths: number;
  eligibleParoleDate: string;
  endOfSentenceDate: string;
}

export interface InmateHealth {
  bloodType: string;
  chronicDiseases: string[];
  allergies: string[];
  dailyMedication: string[];
  mentalHealthStatus: string;
  lastMedicalCheckup: string;
  dietaryRestrictions: string;
}

export interface InmateRehabilitation {
  jobAssignment?: string; // ex: Marcenaria, Padaria Prisional, Agricultura
  educationLevel: string;
  coursesEnrolled: string[];
  meritPoints: number;
  conductClassification: 'MUITO_BOM' | 'BOM' | 'REGULAR' | 'MAU';
  riskLevel?: 'BAIXO' | 'MEDIO' | 'ALTO' | 'MAXIMO';
  cellCompatibilityFlags?: string[];
}

export interface InmateDisciplinary {
  infractionsCount: number;
  lastInfractionDate?: string;
  activeSanction?: string;
  visitsBlockedUntil?: string;
  sanctionHistory: Array<{
    date: string;
    description: string;
    measure: string;
    signedBy: string;
  }>;
}

export interface InmateIncident {
  incidentId: string;
  date: string;
  type: 'TENTATIVA_FUGA' | 'AGRESSAO' | 'POSSE_ILICITA' | 'DESOBEDIENCIA' | 'OUTRO';
  severity: 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  description: string;
  actionsTaken: string;
  reportedBy: string;
  source?: 'INTERNO' | 'VISITA';
  visitorId?: string;
  visitorName?: string;
  visitorBi?: string;
}

export interface InmateVisitor {
  visitorId: string;
  fullName: string;
  biNumber: string;
  phone: string;
  relationship: string;
  status: 'AUTORIZADO' | 'SUSPENSO';
  registeredAt: string;
  registeredBy: string;
  lastVisitDate?: string;
  suspendedReason?: string;
}

export interface InmateVisit {
  visitId: string;
  visitorId: string;
  visitorName: string;
  visitorBi?: string;
  date: string;
  timeSlot: string;
  inspectionPassed: boolean;
  dutyOfficer: string;
  notes?: string;
}

export interface InmatePostInstitutional {
  reintegrationPlanStatus: 'EM_ANALISE' | 'APROVADO' | 'REJEITADO';
  familyShelterConfirmed: boolean;
  assignedSocialWorker?: string;
  vocationalRecommendation: string;
}

export interface InmateDocument {
  documentId: string;
  title: string;
  type: 'ALVARA_SOLTURA' | 'CERTIDAO_SENTENCA' | 'GUIA_CONDUCAO' | 'FICHA_BIOMETRICA';
  uploadDate: string;
  fileSize: string;
}

// A Ficha Única do Recluso (FUR) Completa (Armazenada na província e estabelecimento)
export interface Inmate {
  inmateId: string;
  provinceId: ProvinceId;
  establishmentId: string;
  pavilionId: string;
  blockId: string;
  cellId: string;
  profile: InmateProfile;
  admission: InmateAdmission;
  legal: InmateLegal;
  health: InmateHealth;
  rehabilitation: InmateRehabilitation;
  disciplinary: InmateDisciplinary;
  incidents: InmateIncident[];
  postInstitutional: InmatePostInstitutional;
  documents: InmateDocument[];
  visitors?: InmateVisitor[];
  visits?: InmateVisit[];
  currentStatus: LegacyCustodyStatus;
  // Campos da Máquina de Estados Formal & 8 Melhorias (Fase 1)
  version?: number; // Controlo de concorrência otimista (obrigatório em transações Phase 2+)
  custodyState?: CustodyState; // Estado físico formal ortogonal ao jurídico
  consolidatedLegalStatus?: LegalStatus; // Consolidação automática dos N processos judiciais
  activeProcessesCount?: number; // Bloqueia soltura definitiva se > 0
  identityLockKey?: string; // Referência para /pnap_identity_locks/{lockKey}
  healthAlerts?: HealthAlertSummary; // Projeção operacional não-clínica
  pendingTransferId?: string; // Guia de transferência ativa em trânsito
  lastMovementAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// ÍNDICE NACIONAL DE RECLUSOS (nationalInmateIndex)
// Estrutura federada limpa, acessível transversalmente por Luanda para localizar reclusos de outras províncias
export interface NationalInmateIndexItem {
  inmateId: string;
  matricula: string;
  fullName: string;
  alias?: string;
  biNumber: string;
  provinceId: ProvinceId;
  provinceName: string;
  establishmentId: string;
  establishmentName: string;
  pavilionName: string;
  cellCode: string;
  processNumber?: string;
  legalStatus: Exclude<LegalStatus, 'EXTINTO'>;
  crimeCategory: string;
  penalCodeArticle: string;
  parentName: string; // Nome de Parente (Pai/Mãe)
  emergencyContactName: string;
  emergencyPhone: string;
  neighborhood: string; // Bairro
  photoUrl: string;
  lastUpdated: string;
  custodyStatus?: LegacyCustodyStatus;
  custodyState?: CustodyState;
  version?: number;
  visitorKeywords?: string;
  searchText?: string;
}

export interface TransferRecord {
  transferId: string;
  inmateId: string;
  inmateName: string;
  matricula: string;
  originProvinceId: ProvinceId;
  originEstablishmentId: string;
  destinationProvinceId: ProvinceId;
  destinationEstablishmentId: string;
  requestDate: string;
  status: 'PENDENTE' | 'AUTORIZADO_CENTRAL' | 'EM_TRANSITO' | 'CONCLUIDO' | 'REJEITADO';
  stage?: 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';
  dispatchedAt?: string;
  dispatchedBy?: string;
  receivedAt?: string;
  receivedBy?: string;
  targetPavilionId?: string;
  targetBlockId?: string;
  targetCellId?: string;
  justification: string;
  securityEscort: string;
  authorizedBy: string;
}

export interface AdmissionRecord {
  admissionId: string;
  inmateId: string;
  fullName: string;
  matricula: string;
  provinceId: ProvinceId;
  establishmentId: string;
  courtName: string;
  crime: string;
  timestamp: string;
  registeredBy: string;
}

export type ExitModality =
  | 'CUMPRIMENTO_PENA'
  | 'LIBERDADE_CONDICIONAL'
  | 'LIBERDADE_PROVISORIA'
  | 'ABSOLVICAO'
  | 'INDULTO'
  | 'OBITO'
  | 'EVASAO'
  | 'TRANSFERENCIA';

export interface ReleaseRecord {
  releaseId: string;
  inmateId: string;
  fullName: string;
  matricula: string;
  provinceId: ProvinceId;
  establishmentId: string;
  alvaraNumber: string;
  judgeName: string;
  releaseDate: string;
  reason: ExitModality;
  resultingStatus?: 'LIBERTADO' | 'FALECIDO' | 'EVADIDO' | 'TRANSFERIDO';
  destinationProvinceId?: ProvinceId;
  destinationEstablishmentId?: string;
  notes?: string;
  registeredBy: string;
  registeredAt?: string;
  approvedByDirector?: string; // Melhoria 3: dupla verificação / 4-olhos
}

export interface VisitorRecord {
  visitorId: string;
  fullName: string;
  biNumber: string;
  phone: string;
  relationship: string;
  inmateId: string;
  inmateName: string;
  provinceId: ProvinceId;
  establishmentId: string;
  lastVisitDate: string;
  status: 'AUTORIZADO' | 'SUSPENSO';
}

export interface VisitRecord {
  visitId: string;
  visitorId: string;
  visitorName: string;
  inmateId: string;
  inmateName: string;
  provinceId?: ProvinceId;
  establishmentId: string;
  date: string;
  timeSlot: string;
  inspectionPassed: boolean;
  dutyOfficer: string;
}

export interface AuditLogEvent {
  eventId: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userScopeProvince: string;
  action: string;
  targetResource: string;
  details: string;
  ipAddress: string;
  jurisdictionStatus: 'AUTHORIZED' | 'CROSS_PROVINCE_QUERY' | 'BLOCKED_ATTEMPT';
  previousState?: string;
  newState?: string;
  expectedVersion?: number;
  resultingVersion?: number;
}

export interface PnapSystem {
  configuration: {
    country: string;
    lawFramework: string;
    dpaVersion: string; // "RDPA 2024 · 21 Províncias"
    systemState: 'ONLINE' | 'MAINTENANCE' | 'ALERT';
    maxCellCapacityAlertThreshold: number; // 90%
  };
  schemaVersions: {
    current: string;
    appliedAt: string;
  };
  deploymentStatus: {
    provincesOnline: number;
    totalProvinces: number;
    lastPing: string;
  };
}
