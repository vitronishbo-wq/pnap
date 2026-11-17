import { getFirebaseIdToken } from '../firebase';
import type {
  AdmissionRecord,
  AuditLogEvent,
  EstablishmentProfile,
  ExitModality,
  HealthAlertSummary,
  HealthRecord,
  Inmate,
  InmateIncident,
  InmateVisit,
  InmateVisitor,
  JudicialProcess,
  LegalTransitionRecord,
  MovementRecord,
  MovementType,
  NationalInmateIndexItem,
  PnapCatalog,
  PnapUser,
  ProvinceId,
  ProvinceStatistics,
  ReleaseRecord,
  TransferRecord,
  VisitRecord,
  VisitorRecord
} from '../types/pnap';
import type { SearchCategory, SearchCustodyScope } from '../utils/inmateSearch';

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getApiBaseUrl(): string {
  return RAW_API_BASE_URL.trim().replace(/\/+$/, '');
}

export function isApiConfigured(): boolean {
  return getApiBaseUrl().length > 0;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    requireAuth?: boolean;
  } = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new ApiClientError(
      503,
      'VITE_API_BASE_URL_NOT_CONFIGURED',
      'Endpoint da API não configurado neste terminal.'
    );
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.requireAuth !== false) {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new ApiClientError(
        401,
        'FIREBASE_AUTH_REQUIRED',
        'Autenticação Firebase obrigatória para operar com a API oficial.'
      );
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.error === 'string' ? payload.error : `HTTP_${response.status}`;
    const message = typeof payload.message === 'string' ? payload.message : code;
    throw new ApiClientError(response.status, code, message, payload.details);
  }

  return payload as T;
}

export async function checkApiHealth() {
  return apiRequest<{
    status: string;
    service: string;
    rdpa: string;
    timestamp: string;
    configured: {
      firebaseAdmin: boolean;
      gemini: boolean;
      corsOriginsCount: number;
    };
  }>('/health', { requireAuth: false });
}

export async function fetchCurrentApiUser(): Promise<PnapUser> {
  const res = await apiRequest<{ user: PnapUser }>('/api/pnap/me');
  return res.user;
}

export async function fetchApiProvinceStats() {
  return apiRequest<{ scope: string; stats: Record<string, ProvinceStatistics> }>(
    '/api/pnap/provinces/stats'
  );
}

export async function fetchProvinceEstablishmentsViaApi(provinceId: ProvinceId) {
  return apiRequest<{ provinceId: ProvinceId; establishments: EstablishmentProfile[] }>(
    `/api/pnap/provinces/${provinceId}/establishments`
  );
}

export async function fetchProvinceInmatesViaApi(provinceId: ProvinceId) {
  return apiRequest<{ provinceId: ProvinceId; inmates: Inmate[] }>(
    `/api/pnap/provinces/${provinceId}/inmates`
  );
}

export async function fetchNationalIndexViaApi(
  qOrOptions:
    | string
    | {
        q?: string;
        category?: SearchCategory;
        custodyScope?: SearchCustodyScope;
        provinceId?: ProvinceId | '' | 'all';
        limit?: number;
      } = '',
  category: SearchCategory = 'all'
) {
  const opts =
    typeof qOrOptions === 'string'
      ? { q: qOrOptions, category }
      : qOrOptions;
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  if (opts.category && opts.category !== 'all') params.set('category', opts.category);
  if (opts.custodyScope && opts.custodyScope !== 'ALL') {
    params.set('custodyScope', opts.custodyScope);
  }
  if (opts.provinceId && opts.provinceId !== 'all') {
    params.set('provinceId', opts.provinceId);
  }
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiRequest<{ query: string; total: number; results: NationalInmateIndexItem[] }>(
    `/api/pnap/national-index/search${qs ? `?${qs}` : ''}`
  );
}

export async function fetchInmateByIdViaApi(
  inmateId: string,
  mode: 'default' | 'reentry' = 'default'
) {
  const qs = mode === 'reentry' ? '?mode=reentry' : '';
  return apiRequest<{ inmate: Inmate; mode?: string }>(
    `/api/pnap/inmates/${encodeURIComponent(inmateId)}${qs}`
  );
}

export async function saveDraftEstablishmentViaApi(
  establishment: Partial<EstablishmentProfile>
) {
  return apiRequest<{ success: boolean; message: string; establishment: EstablishmentProfile }>(
    '/api/pnap/establishments/draft',
    { method: 'POST', body: establishment }
  );
}

export async function homologateEstablishmentViaApi(
  provinceId: ProvinceId,
  establishmentId: string,
  decreeNumber: string
) {
  return apiRequest<{
    success: boolean;
    message: string;
    establishment: EstablishmentProfile;
    provinceStats: ProvinceStatistics;
  }>(`/api/pnap/establishments/${provinceId}/${establishmentId}/homologate`, {
    method: 'POST',
    body: { decreeNumber }
  });
}

// --- ADMISSÃO, SAÍDA, RECAPTURA & TRANSIÇÃO (FASE 2) ---

export async function admitInmateViaApi(
  payload: Partial<Inmate> & { reentry?: boolean }
) {
  return apiRequest<{
    success: boolean;
    inmate: Inmate;
    admission: AdmissionRecord;
    process: JudicialProcess;
  }>('/api/pnap/inmates/admission', { method: 'POST', body: payload });
}

export async function registerInmateExitViaApi(
  inmateId: string,
  exitData: {
    modality: ExitModality;
    documentNumber: string;
    authorityOrDetail: string;
    exitDate: string;
    destinationProvinceId?: ProvinceId;
    destinationEstablishmentId?: string;
    notes?: string;
    approvedByDirector?: boolean;
    extinguishProcessId?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    message: string;
    record: ReleaseRecord;
    inmate: Inmate;
    transfer?: TransferRecord;
    movement?: MovementRecord;
  }>(`/api/pnap/inmates/${inmateId}/exit`, { method: 'POST', body: exitData });
}

export async function registerLegalTransitionViaApi(
  inmateId: string,
  transitionData: {
    processId?: string;
    courtName?: string;
    sentenceAcordaoNumber: string;
    sentenceDate?: string;
    transitDate: string;
    totalSentenceYears: number;
    totalSentenceMonths: number;
    regime: 'FECHADO' | 'SEMI_ABERTO';
    judgeName?: string;
    notes?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    message: string;
    record: LegalTransitionRecord;
    inmate: Inmate;
  }>(`/api/pnap/inmates/${inmateId}/legal-transition`, {
    method: 'POST',
    body: transitionData
  });
}

export async function recaptureInmateViaApi(
  inmateId: string,
  payload: {
    documentNumber: string;
    authorityOrEscort: string;
    establishmentId?: string;
    cellId?: string;
    notes?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    inmate: Inmate;
    movement: MovementRecord;
  }>(`/api/pnap/inmates/${inmateId}/recapture`, { method: 'POST', body: payload });
}

// --- PROCESSOS JUDICIAIS MÚLTIPLOS ---

export async function fetchInmateProcessesViaApi(inmateId: string) {
  return apiRequest<{ inmateId: string; processes: JudicialProcess[] }>(
    `/api/pnap/inmates/${inmateId}/processes`
  );
}

export async function addJudicialProcessViaApi(
  inmateId: string,
  payload: {
    processNumber: string;
    courtName: string;
    judgeName?: string;
    crimeCategory: string;
    penalCodeArticle?: string;
    legalStatus?: JudicialProcess['legalStatus'];
    totalSentenceYears?: number;
    totalSentenceMonths?: number;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    process: JudicialProcess;
    inmate: Inmate;
  }>(`/api/pnap/inmates/${inmateId}/processes`, { method: 'POST', body: payload });
}

export async function extinguishJudicialProcessViaApi(
  inmateId: string,
  processId: string,
  payload: {
    extintionReason: string;
    extintionDate?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    process: JudicialProcess;
    inmate: Inmate;
  }>(`/api/pnap/inmates/${inmateId}/processes/${processId}/extinguish`, {
    method: 'POST',
    body: payload
  });
}

// --- TRANSFERÊNCIA EM DUAS ETAPAS & MOVIMENTAÇÕES TEMPORÁRIAS ---

export async function fetchTransfersViaApi() {
  return apiRequest<{ transfers: TransferRecord[] }>('/api/pnap/transfers');
}

export async function dispatchTransferViaApi(payload: {
  inmateId: string;
  destinationProvinceId: ProvinceId;
  destinationEstablishmentId: string;
  documentNumber: string;
  securityEscort: string;
  justification: string;
  expectedVersion?: number;
}) {
  return apiRequest<{
    success: boolean;
    inmate: Inmate;
    transfer: TransferRecord;
    movement: MovementRecord;
  }>(`/api/pnap/inmates/${encodeURIComponent(payload.inmateId)}/transfer/dispatch`, {
    method: 'POST',
    body: payload
  });
}

export async function receiveTransferViaApi(
  transferId: string,
  payload: {
    targetCellId?: string;
    notes?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    inmate: Inmate;
    transfer: TransferRecord;
    movement: MovementRecord;
  }>(`/api/pnap/transfers/${encodeURIComponent(transferId)}/receive`, {
    method: 'POST',
    body: payload
  });
}

export async function fetchInmateMovementsViaApi(inmateId: string) {
  return apiRequest<{ inmateId: string; movements: MovementRecord[] }>(
    `/api/pnap/inmates/${inmateId}/movements`
  );
}

export async function registerMovementViaApi(
  inmateId: string,
  payload: {
    type: Extract<
      MovementType,
      'SAIDA_DILIGENCIA' | 'RETORNO_DILIGENCIA' | 'HOSPITALIZACAO_EXTERNA' | 'RETORNO_HOSPITAL'
    >;
    documentNumber: string;
    authorityOrEscort: string;
    destinationLabel?: string;
    notes?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    inmate: Inmate;
    movement: MovementRecord;
  }>(`/api/pnap/inmates/${inmateId}/movements`, { method: 'POST', body: payload });
}

// --- MÓDULOS SETORIAIS (FASE 3: SAÚDE, REABILITAÇÃO, INCIDENTES, VISITAS, CATÁLOGOS) ---

export async function fetchHealthRecordsViaApi(inmateId: string) {
  return apiRequest<{
    inmateId: string;
    records: HealthRecord[];
    healthAlerts?: HealthAlertSummary;
  }>(`/api/pnap/inmates/${inmateId}/health-records`);
}

export async function recordClinicalEvaluationViaApi(
  inmateId: string,
  payload: {
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
) {
  return apiRequest<{
    success: boolean;
    record: HealthRecord;
    healthAlerts: HealthAlertSummary;
    version: number;
  }>(`/api/pnap/inmates/${inmateId}/health-records`, { method: 'POST', body: payload });
}

export async function updateRehabilitationViaApi(
  inmateId: string,
  payload: {
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
    targetCellId?: string;
    securityOverride?: boolean;
    expectedVersion?: number;
  }
) {
  return apiRequest<{ success: boolean; inmate: Inmate }>(
    `/api/pnap/inmates/${inmateId}/rehabilitation`,
    { method: 'POST', body: payload }
  );
}

export async function registerIncidentViaApi(
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
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    incident: InmateIncident;
    inmate: Inmate;
  }>(`/api/pnap/inmates/${inmateId}/incidents`, { method: 'POST', body: payload });
}

export async function registerInmateVisitorViaApi(
  inmateId: string,
  payload: {
    fullName: string;
    biNumber: string;
    phone?: string;
    relationship?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    visitor: VisitorRecord;
    embeddedVisitor: InmateVisitor;
    inmate: Inmate;
    deduplicated: boolean;
  }>(`/api/pnap/inmates/${encodeURIComponent(inmateId)}/visitors`, {
    method: 'POST',
    body: payload
  });
}

export async function updateInmateVisitorStatusViaApi(
  inmateId: string,
  visitorId: string,
  payload: {
    status: 'AUTORIZADO' | 'SUSPENSO';
    reason?: string;
  }
) {
  return apiRequest<{
    success: boolean;
    visitor: VisitorRecord;
    inmate: Inmate;
  }>(
    `/api/pnap/inmates/${encodeURIComponent(inmateId)}/visitors/${encodeURIComponent(visitorId)}/status`,
    { method: 'PATCH', body: payload }
  );
}

export async function registerInmateVisitViaApi(
  inmateId: string,
  payload: {
    visitorId: string;
    date?: string;
    timeSlot?: string;
    inspectionPassed: boolean;
    notes?: string;
    expectedVersion?: number;
  }
) {
  return apiRequest<{
    success: boolean;
    visit: VisitRecord;
    embeddedVisit: InmateVisit;
    inmate: Inmate;
  }>(`/api/pnap/inmates/${encodeURIComponent(inmateId)}/visits`, {
    method: 'POST',
    body: payload
  });
}

export async function fetchVisitorsViaApi(inmateId?: string) {
  const qs = inmateId ? `?inmateId=${encodeURIComponent(inmateId)}` : '';
  return apiRequest<{ visitors: VisitorRecord[] }>(`/api/pnap/visitors${qs}`);
}

export async function registerVisitorViaApi(payload: {
  inmateId: string;
  fullName: string;
  biNumber: string;
  phone?: string;
  relationship: string;
  expectedVersion?: number;
}) {
  return apiRequest<{
    success: boolean;
    visitor: VisitorRecord;
    inmate?: Inmate;
    deduplicated?: boolean;
  }>('/api/pnap/visitors', { method: 'POST', body: payload });
}

export async function updateVisitorStatusViaApi(
  visitorId: string,
  status: 'AUTORIZADO' | 'SUSPENSO',
  reason?: string,
  inmateId?: string
) {
  return apiRequest<{ success: boolean; visitor: VisitorRecord; inmate?: Inmate }>(
    `/api/pnap/visitors/${encodeURIComponent(visitorId)}/status`,
    { method: 'PATCH', body: { status, reason, ...(inmateId ? { inmateId } : {}) } }
  );
}

export async function fetchVisitsViaApi(inmateId?: string) {
  const qs = inmateId ? `?inmateId=${encodeURIComponent(inmateId)}` : '';
  return apiRequest<{ visits: VisitRecord[] }>(`/api/pnap/visits${qs}`);
}

export async function registerVisitCheckInViaApi(payload: {
  visitorId: string;
  inmateId?: string;
  date?: string;
  timeSlot?: string;
  inspectionPassed: boolean;
  notes?: string;
  expectedVersion?: number;
}) {
  return apiRequest<{ success: boolean; visit: VisitRecord; inmate?: Inmate }>(
    '/api/pnap/visits',
    { method: 'POST', body: payload }
  );
}

export async function fetchCatalogsViaApi() {
  return apiRequest<{ catalogs: PnapCatalog[] }>('/api/pnap/catalogs');
}

export async function upsertCatalogViaApi(
  catalogId: string,
  payload: { category: PnapCatalog['category']; items: PnapCatalog['items'] }
) {
  return apiRequest<{ success: boolean; catalog: PnapCatalog }>(
    `/api/pnap/catalogs/${catalogId}`,
    { method: 'PUT', body: payload }
  );
}

export async function fetchAuditLogsViaApi() {
  return apiRequest<{ scope: string; logs: AuditLogEvent[] }>('/api/pnap/audit-logs');
}

// --- PAINEL ADMINISTRATIVO (FASE 2: PORTA DE ENTRADA, VISÃO REAL, UTILIZADORES & SESSÕES) ---

export type AdminVerificationMethod = 'REAUTH_GOOGLE' | 'WEBAUTHN_PASSKEY' | 'FIREBASE_MFA';

export interface AdminChallengeResponse {
  challengeId: string;
  challenge: string;
  expiresAt: string;
  uid: string;
  email: string;
  isMasterAllowlisted: boolean;
  hasAdminDoc: boolean;
  hasMfaClaim: boolean;
  recentAuthValid: boolean;
}

export interface AdminVerifyAccessResponse {
  verified: boolean;
  verifiedAt: string;
  expiresAt: string;
  verificationMethod: AdminVerificationMethod;
  admin: {
    uid: string;
    email: string;
    role: string;
    isMasterAllowlisted: boolean;
    hasAdminDoc: boolean;
  };
}

export interface AdminOverviewResponse {
  generatedAt: string;
  metrics: {
    provincesConfigured: number;
    totalProvinces: number;
    establishmentsCount: number;
    homologatedCount: number;
    draftCount: number;
    activeInmates: number;
    totalCapacity: number;
    occupancyRate: number | null;
    usersCount: number;
    activeUsersCount: number;
    adminsCount: number;
  };
  statsByProvince: Record<string, ProvinceStatistics>;
  establishments: EstablishmentProfile[];
  users: PnapUser[];
  admins: Array<{ uid?: string; email?: string; role?: string; createdAt?: unknown }>;
  recentAuditLogs: AuditLogEvent[];
  systemInfo: {
    dpaVersion: string;
    firebaseAdminConfigured: boolean;
    databaseId: string;
    geminiConfigured: boolean;
    masterAllowlistCount: number;
  };
}

export async function requestAdminChallengeViaApi() {
  return apiRequest<AdminChallengeResponse>('/api/pnap/admin/challenge', {
    method: 'POST',
    body: {}
  });
}

export async function verifyAdminAccessViaApi(payload: {
  challengeId: string;
  verificationMethod: AdminVerificationMethod;
  credentialId?: string;
}) {
  return apiRequest<AdminVerifyAccessResponse>('/api/pnap/admin/verify-access', {
    method: 'POST',
    body: payload
  });
}

export async function fetchAdminOverviewViaApi() {
  return apiRequest<AdminOverviewResponse>('/api/pnap/admin/overview');
}

export async function checkFirestoreHealthViaApi() {
  return apiRequest<{ connected: boolean; collectionsCount?: number; error?: string }>(
    '/api/pnap/health/firestore'
  );
}

export async function upsertAdminUserViaApi(payload: {
  uid?: string;
  fullName: string;
  email: string;
  badgeNumber?: string;
  rank?: string;
  phone?: string;
  role: PnapUser['assignments']['role'];
  assignedProvinceId: string;
  assignedEstablishmentId?: string;
}) {
  return apiRequest<{ success: boolean; user: PnapUser }>('/api/pnap/admin/users', {
    method: 'POST',
    body: payload
  });
}

export async function updateAdminUserStatusViaApi(
  uid: string,
  status: 'active' | 'suspended'
) {
  return apiRequest<{ success: boolean; user: PnapUser }>(`/api/pnap/admin/users/${uid}/status`, {
    method: 'PATCH',
    body: { status }
  });
}

export async function revokeUserSessionsViaApi(uid: string) {
  return apiRequest<{ success: boolean; revokedUid: string; revokedAt: string }>(
    `/api/pnap/admin/sessions/${uid}/revoke`,
    { method: 'POST', body: {} }
  );
}

