/**
 * PNAP - Sistema Nacional de Administração Prisional (República de Angola)
 * Tipagens estritas baseadas na hierarquia do sistema e RDPA 2024 (21 Províncias)
 */

export type UserRole = 
  | 'CENTRAL_ADMIN'        // Direcção Geral Nacional PNAP (Acesso irrestrito a todas as províncias)
  | 'PROVINCIAL_COMMAND'   // Comando Provincial (ex: Luanda) - Acesso estrito à sua província
  | 'ESTABLISHMENT_DIRECTOR' // Director de Comarca/Penitenciária
  | 'OPERATIONAL_OFFICER';  // Oficial Operacional / Portaria / Registo

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

// Transição Jurídico-Penal: Mudança de estado do recluso (Detido/Preventivo → Condenado com trânsito em julgado)
export interface LegalTransitionRecord {
  transitionId: string;
  inmateId: string;
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
  legalStatus: 'PREVENTIVO' | 'CONDENADO' | 'RECORRENTE' | 'TRANSITO_EM_JULGADO';
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
}

export interface InmateDisciplinary {
  infractionsCount: number;
  lastInfractionDate?: string;
  activeSanction?: string;
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

// O Recluso Completo (Armazenado na província e estabelecimento)
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
  currentStatus: 'ATIVO' | 'TRANSFERIDO' | 'LIBERTADO' | 'EVADIDO' | 'FALECIDO';
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
  legalStatus: 'PREVENTIVO' | 'CONDENADO' | 'RECORRENTE' | 'TRANSITO_EM_JULGADO';
  crimeCategory: string;
  penalCodeArticle: string;
  parentName: string; // Nome de Parente (Pai/Mãe)
  emergencyContactName: string;
  emergencyPhone: string;
  neighborhood: string; // Bairro
  photoUrl: string;
  lastUpdated: string;
  custodyStatus?: 'ATIVO' | 'TRANSFERIDO' | 'LIBERTADO' | 'EVADIDO' | 'FALECIDO';
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
