import { getFirebaseIdToken } from '../firebase';
import type {
  EstablishmentProfile,
  ExitModality,
  LegalTransitionRecord,
  PnapUser,
  ProvinceId,
  ProvinceStatistics,
  ReleaseRecord
} from '../types/pnap';

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';

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
    throw new Error('VITE_API_BASE_URL_NOT_CONFIGURED');
  }

  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.requireAuth !== false) {
    const token = await getFirebaseIdToken();
    if (!token) {
      throw new Error('FIREBASE_AUTH_REQUIRED');
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
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : typeof payload.error === 'string'
        ? payload.error
        : `HTTP_${response.status}`;
    throw new Error(message);
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
  }
) {
  return apiRequest<{ success: boolean; message: string; record: ReleaseRecord }>(
    `/api/pnap/inmates/${inmateId}/exit`,
    { method: 'POST', body: exitData }
  );
}

export async function registerLegalTransitionViaApi(
  inmateId: string,
  transitionData: {
    courtName?: string;
    sentenceAcordaoNumber: string;
    sentenceDate?: string;
    transitDate: string;
    totalSentenceYears: number;
    totalSentenceMonths: number;
    regime: 'FECHADO' | 'SEMI_ABERTO';
    judgeName?: string;
    notes?: string;
  }
) {
  return apiRequest<{ success: boolean; message: string; record: LegalTransitionRecord }>(
    `/api/pnap/inmates/${inmateId}/legal-transition`,
    { method: 'POST', body: transitionData }
  );
}
