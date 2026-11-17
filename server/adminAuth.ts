import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { PnapUser } from '../src/types/pnap';

export type AdminVerificationMethod = 'REAUTH_GOOGLE' | 'WEBAUTHN_PASSKEY' | 'FIREBASE_MFA';

export interface AdminChallengeRecord {
  challengeId: string;
  challenge: string;
  uid: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
}

const DEFAULT_BOOTSTRAPPED_ADMIN_EMAILS = ['3silajaneiro@gmail.com'];
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RECENT_AUTH_MAX_AGE_SECONDS = 15 * 60;

export function parseMasterAdminEmails(
  rawEnv = process.env.MASTER_ADMIN_EMAILS
): string[] {
  const parsed = (rawEnv || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (parsed.length > 0) {
    return Array.from(new Set(parsed));
  }
  return [...DEFAULT_BOOTSTRAPPED_ADMIN_EMAILS];
}

export function isMasterAdminEmail(
  email: string | undefined,
  allowlist = parseMasterAdminEmails()
): boolean {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export async function checkAdminFirestoreRecord(
  db: Firestore,
  uid: string
): Promise<{ exists: boolean; role?: string; email?: string }> {
  const snap = await db.collection('pnap_admins').doc(uid).get();
  if (!snap.exists) {
    return { exists: false };
  }
  const data = snap.data() as { role?: string; email?: string } | undefined;
  return {
    exists: true,
    role: data?.role,
    email: data?.email
  };
}

export function isRecentAuthentication(decoded: DecodedIdToken, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (typeof decoded.auth_time !== 'number') {
    return false;
  }
  return nowSeconds - decoded.auth_time <= RECENT_AUTH_MAX_AGE_SECONDS;
}

export function hasFirebaseMfaClaim(decoded: DecodedIdToken): boolean {
  const firebaseClaim = decoded.firebase as { sign_in_second_factor?: string } | undefined;
  return Boolean(firebaseClaim && typeof firebaseClaim.sign_in_second_factor === 'string' && firebaseClaim.sign_in_second_factor.length > 0);
}

export function createAdminChallengeStore() {
  const challenges = new Map<string, AdminChallengeRecord>();

  function pruneExpired(now = Date.now()) {
    for (const [id, rec] of challenges.entries()) {
      if (rec.expiresAt <= now || rec.used) {
        challenges.delete(id);
      }
    }
  }

  return {
    issue(uid: string, email: string, now = Date.now()): AdminChallengeRecord {
      pruneExpired(now);
      const challengeId = `adm-chg-${crypto.randomUUID()}`;
      const challenge = crypto.randomBytes(32).toString('base64url');
      const record: AdminChallengeRecord = {
        challengeId,
        challenge,
        uid,
        email: email.toLowerCase(),
        issuedAt: now,
        expiresAt: now + CHALLENGE_TTL_MS,
        used: false
      };
      challenges.set(challengeId, record);
      return record;
    },

    consume(
      challengeId: string,
      uid: string,
      now = Date.now()
    ): { ok: true; record: AdminChallengeRecord } | { ok: false; code: string; message: string } {
      const record = challenges.get(challengeId);
      if (!record) {
        return {
          ok: false,
          code: 'ADMIN_CHALLENGE_NOT_FOUND',
          message: 'Desafio de verificação administrativa inexistente ou expirado.'
        };
      }
      if (record.used) {
        return {
          ok: false,
          code: 'ADMIN_CHALLENGE_ALREADY_USED',
          message: 'Este desafio de verificação já foi utilizado.'
        };
      }
      if (record.expiresAt <= now) {
        challenges.delete(challengeId);
        return {
          ok: false,
          code: 'ADMIN_CHALLENGE_EXPIRED',
          message: 'O desafio de verificação expirou. Inicie nova confirmação.'
        };
      }
      if (record.uid !== uid) {
        return {
          ok: false,
          code: 'ADMIN_CHALLENGE_UID_MISMATCH',
          message: 'O desafio não corresponde ao utilizador autenticado.'
        };
      }
      record.used = true;
      challenges.delete(challengeId);
      return { ok: true, record };
    }
  };
}

export async function evaluateCentralAdminEligibility(params: {
  db: Firestore;
  decoded: DecodedIdToken;
  pnapUser: PnapUser;
  allowlist?: string[];
}): Promise<{
  eligible: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  isMasterAllowlisted: boolean;
  hasAdminDoc: boolean;
}> {
  const { db, decoded, pnapUser, allowlist } = params;

  if (!decoded.email || decoded.email_verified !== true) {
    return {
      eligible: false,
      reasonCode: 'EMAIL_NOT_VERIFIED',
      reasonMessage: 'A conta Google institucional deve possuir e-mail verificado.',
      isMasterAllowlisted: false,
      hasAdminDoc: false
    };
  }

  if (pnapUser.profile?.status !== 'active') {
    return {
      eligible: false,
      reasonCode: 'ADMIN_ACCOUNT_INACTIVE',
      reasonMessage: 'Conta administrativa suspensa ou inativa.',
      isMasterAllowlisted: false,
      hasAdminDoc: false
    };
  }

  if (pnapUser.assignments.role !== 'CENTRAL_ADMIN') {
    return {
      eligible: false,
      reasonCode: 'CENTRAL_ADMIN_ROLE_REQUIRED',
      reasonMessage: 'Apenas o perfil CENTRAL_ADMIN tem acesso ao Painel Administrativo.',
      isMasterAllowlisted: false,
      hasAdminDoc: false
    };
  }

  const isAllowlisted = isMasterAdminEmail(decoded.email, allowlist);
  const adminDoc = await checkAdminFirestoreRecord(db, decoded.uid);
  const hasValidAdminDoc = adminDoc.exists && adminDoc.role === 'CENTRAL_ADMIN';

  if (!isAllowlisted && !hasValidAdminDoc) {
    return {
      eligible: false,
      reasonCode: 'NOT_AUTHORIZED_MASTER_ADMIN',
      reasonMessage: 'O e-mail autenticado não consta na lista de administradores master nem em pnap_admins.',
      isMasterAllowlisted: false,
      hasAdminDoc: false
    };
  }

  return {
    eligible: true,
    isMasterAllowlisted: isAllowlisted,
    hasAdminDoc: hasValidAdminDoc
  };
}
