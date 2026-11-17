import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { Firestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import type {
  AuditLogEvent,
  EstablishmentProfile,
  ExitModality,
  Inmate,
  JudicialProcess,
  MovementRecord,
  NationalInmateIndexItem,
  PnapCatalog,
  PnapUser,
  ProvinceId,
  ProvinceStatistics,
  TransferRecord,
  VisitRecord,
  VisitorRecord
} from './src/types/pnap';
import {
  checkFirestoreConnection,
  getFirebaseAdminEnvStatus,
  getFirebaseAdminServices
} from './server/firebaseAdmin';
import {
  RDPA_2024_PROVINCES,
  canAccessClinicalRecords,
  canAuthorizePhysicalTransfer,
  canManagePenalControl,
  canManageRehabilitation,
  canOperateEstablishment,
  canOperateProvince,
  canProvision,
  canRegisterPhysicalMovement,
  canViewAuditLogs,
  createRequirePnapAuth,
  extractClientIp,
  isValidProvinceId,
  isValidUserRole,
  type AuditLoggerFn,
  type AuthTokenVerifier,
  type AuthenticatedRequest,
  type UserDirectoryReader
} from './server/rbac';
import {
  createAdminChallengeStore,
  evaluateCentralAdminEligibility,
  hasFirebaseMfaClaim,
  isRecentAuthentication,
  parseMasterAdminEmails,
  type AdminVerificationMethod
} from './server/adminAuth';
import { createFirestoreAuditLogger } from './server/audit';
import { computeStructureCapacities, validateEstablishmentForHomologation } from './server/capacity';
import { generatePnapOperationalBrief, isGeminiConfigured } from './server/geminiService';
import {
  StateMachineError,
  addJudicialProcessTransactional,
  admitInmateTransactional,
  dispatchTransferTransactional,
  extinguishJudicialProcessTransactional,
  legalTransitionTransactional,
  recaptureInmateTransactional,
  receiveTransferTransactional,
  registerExitTransactional,
  registerTemporaryMovementTransactional,
  resolveEffectiveCustodyState
} from './server/stateMachine';
import {
  listHealthRecords,
  listVisitorsFromFurs,
  listVisitsFromFurs,
  recordClinicalEvaluationTransactional,
  redactInmateClinicalData,
  registerIncidentAndSanctionTransactional,
  registerVisitCheckInTransactional,
  registerVisitorTransactional,
  updateRehabilitationTransactional,
  updateVisitorStatusTransactional,
  upsertCatalogTransactional
} from './server/sectoralModules';
import {
  searchNationalIndexInFirestore,
  type SearchCategory,
  type SearchCustodyScope
} from './server/searchEngine';

const VALID_EXIT_MODALITIES: readonly ExitModality[] = [
  'CUMPRIMENTO_PENA',
  'LIBERDADE_CONDICIONAL',
  'LIBERDADE_PROVISORIA',
  'ABSOLVICAO',
  'INDULTO',
  'OBITO',
  'EVASAO',
  'TRANSFERENCIA'
] as const;

export interface ServerDependencies {
  getDb: () => Firestore;
  getVerifier: () => AuthTokenVerifier;
  getUserDirectory: () => UserDirectoryReader;
  writeAuditLog: AuditLoggerFn;
  checkFirestore: () => Promise<{ connected: boolean; collectionsCount?: number; error?: string }>;
  generateAiBrief: typeof generatePnapOperationalBrief;
  getAllowedOrigins: () => string[];
  getMasterAdminEmails?: () => string[];
  revokeUserRefreshTokens?: (uid: string) => Promise<void>;
  lookupAuthUidByEmail?: (email: string) => Promise<string | null>;
}

export function parseAllowedOrigins(rawFrontendUrl = process.env.FRONTEND_URL): string[] {
  const configured = (rawFrontendUrl || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  if (process.env.NODE_ENV !== 'production') {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return [];
}

function getDefaultDependencies(): ServerDependencies {
  const getDb = () => getFirebaseAdminServices().db;
  const getVerifier = () => getFirebaseAdminServices().auth;
  const getUserDirectory = (): UserDirectoryReader => ({
    async getPnapUserByUid(uid: string): Promise<PnapUser | null> {
      const snap = await getDb().collection('pnap_users').doc(uid).get();
      if (!snap.exists) return null;
      return snap.data() as PnapUser;
    }
  });

  return {
    getDb,
    getVerifier,
    getUserDirectory,
    writeAuditLog: createFirestoreAuditLogger(getDb),
    checkFirestore: () => checkFirestoreConnection(),
    generateAiBrief: generatePnapOperationalBrief,
    getAllowedOrigins: () => parseAllowedOrigins(),
    getMasterAdminEmails: () => parseMasterAdminEmails(),
    revokeUserRefreshTokens: async (uid: string) => {
      await getFirebaseAdminServices().auth.revokeRefreshTokens(uid);
    },
    lookupAuthUidByEmail: async (email: string) => {
      try {
        const rec = await getFirebaseAdminServices().auth.getUserByEmail(email);
        return rec.uid;
      } catch {
        return null;
      }
    }
  };
}

function emptyProvinceStats(provinceId: ProvinceId): ProvinceStatistics {
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

function handleServerError(err: unknown, res: Response, fallbackMessage: string) {
  if (err instanceof StateMachineError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {})
    });
    return;
  }
  const message = err instanceof Error ? err.message : fallbackMessage;
  if (message === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
    res.status(503).json({
      error: 'FIREBASE_ADMIN_NOT_CONFIGURED',
      message: 'Credenciais do Firebase Admin SDK não configuradas no ambiente do servidor.'
    });
    return;
  }
  if (message === 'GEMINI_API_KEY_NOT_CONFIGURED') {
    res.status(503).json({
      error: 'GEMINI_API_KEY_NOT_CONFIGURED',
      message: 'GEMINI_API_KEY não configurada no ambiente do servidor.'
    });
    return;
  }
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage
  });
}

export function createApp(customDeps?: Partial<ServerDependencies>) {
  const defaults = getDefaultDependencies();
  const deps: ServerDependencies = {
    ...defaults,
    ...customDeps
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Cabeçalhos mínimos de segurança
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // CORS estrito exclusivamente para origens autorizadas (FRONTEND_URL)
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.trim().replace(/\/+$/, '');
        const allowed = deps.getAllowedOrigins();
        if (allowed.includes(normalized)) {
          callback(null, true);
          return;
        }
        callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: true
    })
  );

  app.use(express.json({ limit: '1mb' }));

  const requirePnapAuth = createRequirePnapAuth({
    getVerifier: deps.getVerifier,
    getUserDirectory: deps.getUserDirectory,
    writeAuditLog: deps.writeAuditLog
  });

  async function logBlockedAttempt(
    req: AuthenticatedRequest,
    user: PnapUser,
    action: string,
    targetResource: string,
    details: string
  ) {
    await deps
      .writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince:
          user.assignments.role === 'CENTRAL_ADMIN'
            ? 'CENTRAL_GLOBAL'
            : user.assignments.assignedProvinceId,
        action,
        targetResource,
        details,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'BLOCKED_ATTEMPT'
      })
      .catch(() => undefined);
  }

  // --- ROTA RAIZ & HEALTHCHECK (RENDER) ---
  app.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'pnap-backend-api',
      rdpa: 'RDPA 2024 · 21 Províncias',
      endpoints: {
        health: '/health',
        api: '/api/pnap'
      }
    });
  });

  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  app.get('/health', (_req, res) => {
    const firebaseStatus = getFirebaseAdminEnvStatus();
    res.status(200).json({
      status: 'ok',
      service: 'pnap-backend-api',
      rdpa: 'RDPA 2024 · 21 Províncias',
      timestamp: new Date().toISOString(),
      configured: {
        firebaseAdmin: firebaseStatus.configured,
        gemini: isGeminiConfigured(),
        corsOriginsCount: deps.getAllowedOrigins().length
      }
    });
  });

  // --- IDENTIDADE AUTENTICADA & ESTADO FIRESTORE ---
  app.get('/api/pnap/me', requirePnapAuth, (req: AuthenticatedRequest, res) => {
    res.status(200).json({
      user: req.pnapUser
    });
  });

  app.get('/api/pnap/health/firestore', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    if (!canProvision(user)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_FIRESTORE_DIAGNOSTIC',
        'pnap/system/firestore',
        'Tentativa de diagnóstico global Firestore por perfil não central.'
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Apenas CENTRAL_ADMIN pode consultar o diagnóstico global do Firestore.'
      });
      return;
    }

    const status = await deps.checkFirestore();
    res.status(status.connected ? 200 : 503).json(status);
  });

  // --- PAINEL ADMINISTRATIVO (FASE 2: PORTA DE ENTRADA, GOVERNAÇÃO & SEGURANÇA) ---
  const adminChallengeStore = createAdminChallengeStore();

  app.post('/api/pnap/admin/challenge', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const decoded = req.authToken!;
    try {
      const db = deps.getDb();
      const eligibility = await evaluateCentralAdminEligibility({
        db,
        decoded,
        pnapUser: user,
        allowlist: deps.getMasterAdminEmails ? deps.getMasterAdminEmails() : parseMasterAdminEmails()
      });

      if (!eligibility.eligible) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_ADMIN_PANEL_CHALLENGE',
          'pnap/admin/challenge',
          `Acesso negado ao desafio administrativo (${eligibility.reasonCode}): ${eligibility.reasonMessage}`
        );
        res.status(403).json({
          error: eligibility.reasonCode || 'FORBIDDEN',
          message: eligibility.reasonMessage || 'Sem autorização para o Painel Administrativo.'
        });
        return;
      }

      const issued = adminChallengeStore.issue(decoded.uid, decoded.email!);
      res.status(200).json({
        challengeId: issued.challengeId,
        challenge: issued.challenge,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        uid: decoded.uid,
        email: decoded.email,
        isMasterAllowlisted: eligibility.isMasterAllowlisted,
        hasAdminDoc: eligibility.hasAdminDoc,
        hasMfaClaim: hasFirebaseMfaClaim(decoded),
        recentAuthValid: isRecentAuthentication(decoded)
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao gerar desafio de verificação administrativa.');
    }
  });

  app.post('/api/pnap/admin/verify-access', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const decoded = req.authToken!;
    const challengeId = String(req.body?.challengeId || '').trim();
    const verificationMethod = String(req.body?.verificationMethod || '').trim() as AdminVerificationMethod;
    const credentialId = String(req.body?.credentialId || '').trim();

    if (!challengeId) {
      res.status(400).json({
        error: 'MISSING_CHALLENGE_ID',
        message: 'Identificador do desafio administrativo é obrigatório.'
      });
      return;
    }

    if (
      verificationMethod !== 'REAUTH_GOOGLE' &&
      verificationMethod !== 'WEBAUTHN_PASSKEY' &&
      verificationMethod !== 'FIREBASE_MFA'
    ) {
      res.status(400).json({
        error: 'INVALID_VERIFICATION_METHOD',
        message: 'Método de segunda verificação individual inválido.'
      });
      return;
    }

    try {
      const db = deps.getDb();
      const eligibility = await evaluateCentralAdminEligibility({
        db,
        decoded,
        pnapUser: user,
        allowlist: deps.getMasterAdminEmails ? deps.getMasterAdminEmails() : parseMasterAdminEmails()
      });

      if (!eligibility.eligible) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_ADMIN_PANEL_ACCESS',
          'pnap/admin/verify-access',
          `Tentativa bloqueada de acesso ao Painel Administrativo (${eligibility.reasonCode}).`
        );
        res.status(403).json({
          error: eligibility.reasonCode || 'FORBIDDEN',
          message: eligibility.reasonMessage || 'Acesso negado ao Painel Administrativo.'
        });
        return;
      }

      const consumed = adminChallengeStore.consume(challengeId, decoded.uid);
      if (!consumed.ok) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_ADMIN_CHALLENGE_INVALID',
          'pnap/admin/verify-access',
          consumed.message
        );
        res.status(401).json({ error: consumed.code, message: consumed.message });
        return;
      }

      if (verificationMethod === 'WEBAUTHN_PASSKEY' && !credentialId) {
        res.status(400).json({
          error: 'MISSING_WEBAUTHN_CREDENTIAL',
          message: 'Credencial de passkey individual não fornecida.'
        });
        return;
      }

      if (verificationMethod === 'FIREBASE_MFA' && !hasFirebaseMfaClaim(decoded)) {
        res.status(403).json({
          error: 'MFA_CLAIM_REQUIRED',
          message: 'A sessão atual não contém segundo factor MFA validado pelo Firebase.'
        });
        return;
      }

      if (verificationMethod === 'REAUTH_GOOGLE' && !isRecentAuthentication(decoded)) {
        res.status(401).json({
          error: 'RECENT_REAUTH_REQUIRED',
          message: 'Confirme novamente a conta Google institucional para completar a segunda verificação.'
        });
        return;
      }

      const verifiedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: 'CENTRAL_GLOBAL',
        action: 'ADMIN_PANEL_ACCESS_GRANTED',
        targetResource: 'pnap/admin',
        details: `Acesso ao Painel Administrativo concedido a ${decoded.email} via ${verificationMethod}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({
        verified: true,
        verifiedAt,
        expiresAt,
        verificationMethod,
        admin: {
          uid: decoded.uid,
          email: decoded.email,
          role: user.assignments.role,
          isMasterAllowlisted: eligibility.isMasterAllowlisted,
          hasAdminDoc: eligibility.hasAdminDoc
        }
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao validar acesso administrativo.');
    }
  });

  app.get('/api/pnap/admin/overview', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const decoded = req.authToken!;
    try {
      const db = deps.getDb();
      const eligibility = await evaluateCentralAdminEligibility({
        db,
        decoded,
        pnapUser: user,
        allowlist: deps.getMasterAdminEmails ? deps.getMasterAdminEmails() : parseMasterAdminEmails()
      });

      if (!eligibility.eligible) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_ADMIN_OVERVIEW_READ',
          'pnap/admin/overview',
          'Tentativa não autorizada de leitura da visão administrativa nacional.'
        );
        res.status(403).json({
          error: eligibility.reasonCode || 'FORBIDDEN',
          message: eligibility.reasonMessage || 'Acesso restrito a CENTRAL_ADMIN autorizado.'
        });
        return;
      }

      const [statsSnap, estSnap, usersSnap, adminsSnap, auditSnap] = await Promise.all([
        db.collection('pnap_province_stats').get(),
        db.collection('pnap_establishments').get(),
        db.collection('pnap_users').get(),
        db.collection('pnap_admins').get(),
        db.collection('pnap_audit_logs').get()
      ]);

      const statsByProvince: Record<string, ProvinceStatistics> = {};
      let activeInmates = 0;
      let totalCapacity = 0;
      statsSnap.docs.forEach((doc) => {
        const data = doc.data() as ProvinceStatistics;
        statsByProvince[doc.id] = data;
        activeInmates += Number(data.activeInmates) || 0;
        totalCapacity += Number(data.totalCapacity) || 0;
      });

      const establishments = estSnap.docs.map((d) => d.data() as EstablishmentProfile);
      const homologatedCount = establishments.filter((e) => e.provisioningStatus === 'HOMOLOGATED').length;
      const draftCount = establishments.filter((e) => e.provisioningStatus !== 'HOMOLOGATED').length;
      const users = usersSnap.docs.map((d) => d.data() as PnapUser);
      const admins = adminsSnap.docs.map((d) => d.data() as Record<string, unknown>);
      const recentAuditLogs = auditSnap.docs
        .map((d) => d.data() as AuditLogEvent)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 20);

      const occupancyRate = totalCapacity > 0 ? Math.round((activeInmates / totalCapacity) * 100) : null;

      res.status(200).json({
        generatedAt: new Date().toISOString(),
        metrics: {
          provincesConfigured: Object.keys(statsByProvince).length,
          totalProvinces: RDPA_2024_PROVINCES.length,
          establishmentsCount: establishments.length,
          homologatedCount,
          draftCount,
          activeInmates,
          totalCapacity,
          occupancyRate,
          usersCount: users.length,
          activeUsersCount: users.filter((u) => u.profile?.status === 'active').length,
          adminsCount: admins.length
        },
        statsByProvince,
        establishments,
        users,
        admins,
        recentAuditLogs,
        systemInfo: {
          dpaVersion: 'RDPA 2024 · 21 Províncias',
          firebaseAdminConfigured: getFirebaseAdminEnvStatus().configured,
          databaseId: getFirebaseAdminEnvStatus().databaseId,
          geminiConfigured: isGeminiConfigured(),
          masterAllowlistCount: (deps.getMasterAdminEmails
            ? deps.getMasterAdminEmails()
            : parseMasterAdminEmails()
          ).length
        }
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao carregar indicadores reais do Painel Administrativo.');
    }
  });

  app.post('/api/pnap/admin/users', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const decoded = req.authToken!;
    try {
      const db = deps.getDb();
      const eligibility = await evaluateCentralAdminEligibility({
        db,
        decoded,
        pnapUser: user,
        allowlist: deps.getMasterAdminEmails ? deps.getMasterAdminEmails() : parseMasterAdminEmails()
      });

      if (!eligibility.eligible) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_ADMIN_USER_PROVISION',
          'pnap/admin/users',
          'Tentativa não autorizada de provisionar utilizador PNAP.'
        );
        res.status(403).json({
          error: eligibility.reasonCode || 'FORBIDDEN',
          message: eligibility.reasonMessage || 'Apenas CENTRAL_ADMIN autorizado pode gerir utilizadores.'
        });
        return;
      }

      const fullName = String(req.body?.fullName || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const badgeNumber = String(req.body?.badgeNumber || '').trim() || 'PNAP-CIP';
      const rank = String(req.body?.rank || '').trim() || 'Oficial Prisional';
      const phone = String(req.body?.phone || '').trim();
      const role = req.body?.role;
      const assignedProvinceId = String(req.body?.assignedProvinceId || '').trim();
      const assignedEstablishmentId = String(req.body?.assignedEstablishmentId || '').trim();

      if (!fullName || !email) {
        res.status(400).json({ error: 'INVALID_USER_PAYLOAD', message: 'Nome completo e e-mail são obrigatórios.' });
        return;
      }
      if (!isValidUserRole(role)) {
        res.status(400).json({ error: 'INVALID_ROLE', message: 'Função RBAC inválida.' });
        return;
      }
      if (
        assignedProvinceId !== 'all' &&
        !isValidProvinceId(assignedProvinceId)
      ) {
        res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província atribuída inválida (RDPA 2024).' });
        return;
      }
      if (assignedProvinceId === 'all' && role !== 'CENTRAL_ADMIN' && role !== 'AUDITOR_INSPECTOR') {
        res.status(400).json({
          error: 'INVALID_GLOBAL_SCOPE',
          message: 'Apenas CENTRAL_ADMIN ou AUDITOR_INSPECTOR nacional podem ter escopo all.'
        });
        return;
      }

      let targetUid = String(req.body?.uid || '').trim();
      if (!targetUid && deps.lookupAuthUidByEmail) {
        targetUid = (await deps.lookupAuthUidByEmail(email)) || '';
      }
      if (!targetUid) {
        res.status(400).json({
          error: 'USER_UID_REQUIRED',
          message: 'Informe o UID Firebase do utilizador ou garanta que a conta Google já exista no Firebase Authentication.'
        });
        return;
      }

      const pnapUserDoc: PnapUser = {
        uid: targetUid,
        profile: {
          uid: targetUid,
          fullName,
          badgeNumber,
          rank,
          phone,
          email,
          status: 'active'
        },
        assignments: {
          role,
          assignedProvinceId,
          ...(assignedEstablishmentId ? { assignedEstablishmentId } : {}),
          permissions: Array.isArray(req.body?.permissions) ? req.body.permissions : []
        }
      };

      await db.collection('pnap_users').doc(targetUid).set(pnapUserDoc);

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: 'CENTRAL_GLOBAL',
        action: 'ADMIN_USER_PROVISIONED',
        targetResource: `pnap/users/${targetUid}`,
        details: `Utilizador ${fullName} (${email}) atribuído com perfil ${role} · ${assignedProvinceId}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({ success: true, user: pnapUserDoc });
    } catch (err) {
      handleServerError(err, res, 'Erro ao guardar conta de utilizador PNAP.');
    }
  });

  app.patch('/api/pnap/admin/users/:uid/status', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const decoded = req.authToken!;
    const targetUid = String(req.params.uid || '').trim();
    const nextStatus = req.body?.status === 'suspended' ? 'suspended' : req.body?.status === 'active' ? 'active' : null;

    if (!targetUid || !nextStatus) {
      res.status(400).json({ error: 'INVALID_STATUS_PAYLOAD', message: 'UID e estado (active/suspended) são obrigatórios.' });
      return;
    }

    try {
      const db = deps.getDb();
      const eligibility = await evaluateCentralAdminEligibility({
        db,
        decoded,
        pnapUser: user,
        allowlist: deps.getMasterAdminEmails ? deps.getMasterAdminEmails() : parseMasterAdminEmails()
      });

      if (!eligibility.eligible) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_ADMIN_USER_STATUS',
          `pnap/users/${targetUid}`,
          'Tentativa não autorizada de suspender/reactivar utilizador.'
        );
        res.status(403).json({
          error: eligibility.reasonCode || 'FORBIDDEN',
          message: eligibility.reasonMessage || 'Acesso negado.'
        });
        return;
      }

      if (targetUid === user.uid && nextStatus === 'suspended') {
        res.status(400).json({
          error: 'SELF_SUSPENSION_BLOCKED',
          message: 'O administrador autenticado não pode suspender a própria sessão ativa.'
        });
        return;
      }

      const ref = db.collection('pnap_users').doc(targetUid);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utilizador não encontrado em pnap_users.' });
        return;
      }

      const existing = snap.data() as PnapUser;
      const updated: PnapUser = {
        ...existing,
        profile: {
          ...existing.profile,
          status: nextStatus
        }
      };

      await ref.set(updated);
      if (nextStatus === 'suspended' && deps.revokeUserRefreshTokens) {
        await deps.revokeUserRefreshTokens(targetUid).catch(() => undefined);
      }

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: 'CENTRAL_GLOBAL',
        action: nextStatus === 'suspended' ? 'ADMIN_USER_SUSPENDED' : 'ADMIN_USER_REACTIVATED',
        targetResource: `pnap/users/${targetUid}`,
        details: `Estado da conta ${existing.profile?.email || targetUid} alterado para ${nextStatus}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({ success: true, user: updated });
    } catch (err) {
      handleServerError(err, res, 'Erro ao atualizar estado do utilizador.');
    }
  });

  app.post('/api/pnap/admin/sessions/:uid/revoke', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const decoded = req.authToken!;
    const targetUid = String(req.params.uid || '').trim();
    if (!targetUid) {
      res.status(400).json({ error: 'MISSING_UID', message: 'UID do utilizador é obrigatório.' });
      return;
    }

    try {
      const db = deps.getDb();
      const eligibility = await evaluateCentralAdminEligibility({
        db,
        decoded,
        pnapUser: user,
        allowlist: deps.getMasterAdminEmails ? deps.getMasterAdminEmails() : parseMasterAdminEmails()
      });

      if (!eligibility.eligible) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_SESSION_REVOKE',
          `pnap/admin/sessions/${targetUid}`,
          'Tentativa não autorizada de revogação de sessões.'
        );
        res.status(403).json({
          error: eligibility.reasonCode || 'FORBIDDEN',
          message: eligibility.reasonMessage || 'Acesso negado.'
        });
        return;
      }

      if (deps.revokeUserRefreshTokens) {
        await deps.revokeUserRefreshTokens(targetUid);
      }

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: 'CENTRAL_GLOBAL',
        action: 'ADMIN_USER_SESSIONS_REVOKED',
        targetResource: `pnap/sessions/${targetUid}`,
        details: `Tokens de sessão Firebase revogados para ${targetUid}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({
        success: true,
        revokedUid: targetUid,
        revokedAt: new Date().toISOString()
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao revogar sessões do utilizador.');
    }
  });

  // --- ESTATÍSTICAS PROVINCIAIS (RDPA 2024) ---
  app.get('/api/pnap/provinces/stats', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    try {
      const db = deps.getDb();
      if (user.assignments.role === 'CENTRAL_ADMIN') {
        const snap = await db.collection('pnap_province_stats').get();
        const stats: Record<string, ProvinceStatistics> = {};
        snap.docs.forEach((doc) => {
          stats[doc.id] = doc.data() as ProvinceStatistics;
        });
        res.status(200).json({ scope: 'CENTRAL_GLOBAL', stats });
        return;
      }

      const assignedProvince = user.assignments.assignedProvinceId;
      const doc = await db.collection('pnap_province_stats').doc(assignedProvince).get();
      res.status(200).json({
        scope: assignedProvince,
        stats: {
          [assignedProvince]: doc.exists
            ? (doc.data() as ProvinceStatistics)
            : emptyProvinceStats(assignedProvince as ProvinceId)
        }
      });
    } catch (err) {
      handleServerError(err, res, 'Falha ao carregar estatísticas provinciais.');
    }
  });

  // --- ESTABELECIMENTOS & PROVISIONAMENTO EM DUAS FASES ---
  app.get(
    '/api/pnap/provinces/:provinceId/establishments',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const provinceId = String(req.params.provinceId || '');

      if (!isValidProvinceId(provinceId)) {
        res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província RDPA 2024 inválida.' });
        return;
      }

      if (!canOperateProvince(user, provinceId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_PROVINCIAL_ESTABLISHMENTS_READ',
          `pnap/provinces/${provinceId}/establishments`,
          `Tentativa bloqueada de leitura de estabelecimentos em ${provinceId.toUpperCase()}.`
        );
        res.status(403).json({
          error: 'PROVINCIAL_ISOLATION_VIOLATION',
          message: `Acesso Negado: Sem jurisdição territorial sobre ${provinceId.toUpperCase()}.`
        });
        return;
      }

      try {
        const db = deps.getDb();
        const snap = await db
          .collection('pnap_establishments')
          .where('provinceId', '==', provinceId)
          .get();

        let establishments = snap.docs.map((doc) => doc.data() as EstablishmentProfile);
        if (
          user.assignments.role !== 'CENTRAL_ADMIN' &&
          user.assignments.role !== 'PROVINCIAL_COMMAND' &&
          user.assignments.role !== 'AUDITOR_INSPECTOR' &&
          user.assignments.assignedEstablishmentId
        ) {
          establishments = establishments.filter(
            (e) => e.establishmentId === user.assignments.assignedEstablishmentId
          );
        }

        res.status(200).json({ provinceId, establishments });
      } catch (err) {
        handleServerError(err, res, 'Erro ao consultar estabelecimentos prisionais.');
      }
    }
  );

  app.post('/api/pnap/establishments/draft', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const body = req.body as Partial<EstablishmentProfile> | undefined;
    const provinceId = body?.provinceId;

    if (!canProvision(user)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_PROVISIONING_DRAFT_ATTEMPT',
        `pnap/provinces/${provinceId || 'unknown'}/establishments`,
        'Tentativa de provisionamento (DRAFT) sem perfil CENTRAL_ADMIN.'
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Acesso Negado: Apenas a Direcção Geral Central (CENTRAL_ADMIN) pode provisionar estruturas.'
      });
      return;
    }

    if (!isValidProvinceId(provinceId)) {
      res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província RDPA 2024 inválida.' });
      return;
    }

    try {
      const establishmentId =
        body?.establishmentId?.trim() || `est-${provinceId}-${Date.now()}`;

      const draftProfile = computeStructureCapacities({
        establishmentId,
        provinceId,
        name: body?.name?.trim() || '',
        code: body?.code?.trim() || '',
        type: body?.type || 'COMARCA',
        securityLevel: body?.securityLevel || 'MEDIA',
        directorName: body?.directorName?.trim() || '',
        address: body?.address?.trim() || '',
        totalCapacity: Number(body?.totalCapacity) || 0,
        activeInmatesCount: 0,
        pavilions: Array.isArray(body?.pavilions) ? body.pavilions : [],
        provisioningStatus: 'DRAFT'
      });

      const db = deps.getDb();
      await db.collection('pnap_establishments').doc(establishmentId).set(draftProfile);

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: 'CENTRAL_GLOBAL',
        action: 'ESTABLISHMENT_DRAFT_SAVED',
        targetResource: `pnap/provinces/${provinceId}/establishments/${establishmentId}`,
        details: `Rascunho gravado: ${draftProfile.name || 'Sem nome'} (${provinceId.toUpperCase()}). Capacidade: ${draftProfile.totalCapacity} vagas.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({
        success: true,
        message: `Rascunho gravado (${draftProfile.totalCapacity} vagas).`,
        establishment: draftProfile
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao gravar rascunho de estabelecimento.');
    }
  });

  app.post(
    '/api/pnap/establishments/:provinceId/:establishmentId/homologate',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const provinceId = String(req.params.provinceId || '');
      const establishmentId = String(req.params.establishmentId || '');
      const decreeNumber = String(req.body?.decreeNumber || '');

      if (!canProvision(user)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_PROVISIONING_HOMOLOGATE_ATTEMPT',
          `pnap/provinces/${provinceId}/establishments/${establishmentId}`,
          'Tentativa de homologação oficial sem perfil CENTRAL_ADMIN.'
        );
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Acesso Negado: Apenas CENTRAL_ADMIN possui autorização global de homologação.'
        });
        return;
      }

      if (!isValidProvinceId(provinceId)) {
        res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província RDPA 2024 inválida.' });
        return;
      }

      try {
        const db = deps.getDb();
        const estRef = db.collection('pnap_establishments').doc(establishmentId);
        const estSnap = await estRef.get();

        if (!estSnap.exists) {
          res.status(404).json({
            error: 'ESTABLISHMENT_NOT_FOUND',
            message: 'Estabelecimento prisional não encontrado.'
          });
          return;
        }

        const existingEst = estSnap.data() as EstablishmentProfile;
        if (existingEst.provinceId !== provinceId) {
          res.status(400).json({
            error: 'PROVINCE_MISMATCH',
            message: 'Estabelecimento não pertence à província indicada.'
          });
          return;
        }

        const validation = validateEstablishmentForHomologation(existingEst, decreeNumber);
        if (!validation.valid) {
          res.status(400).json({
            error: 'HOMOLOGATION_VALIDATION_FAILED',
            message: validation.message
          });
          return;
        }

        const homologated: EstablishmentProfile = {
          ...validation.normalized,
          provisioningStatus: 'HOMOLOGATED',
          homologatedAt: new Date().toISOString(),
          homologatedBy: `${user.profile.fullName} (${user.profile.rank})`,
          homologationDecreeNumber: decreeNumber.trim()
        };

        await estRef.set(homologated);

        // Recalcular estatísticas provinciais a partir de todos os estabelecimentos homologados da província
        const provEstSnap = await db
          .collection('pnap_establishments')
          .where('provinceId', '==', provinceId)
          .get();

        const homologatedList = provEstSnap.docs
          .map((d) => d.data() as EstablishmentProfile)
          .filter((e) => e.provisioningStatus === 'HOMOLOGATED');

        const totalCap = homologatedList.reduce((sum, e) => sum + (Number(e.totalCapacity) || 0), 0);
        const totalActive = homologatedList.reduce(
          (sum, e) => sum + (Number(e.activeInmatesCount) || 0),
          0
        );

        const statsRef = db.collection('pnap_province_stats').doc(provinceId);
        const prevStatsSnap = await statsRef.get();
        const prevStats = prevStatsSnap.exists
          ? (prevStatsSnap.data() as ProvinceStatistics)
          : emptyProvinceStats(provinceId);

        const updatedStats: ProvinceStatistics = {
          ...prevStats,
          establishmentsCount: homologatedList.length,
          totalCapacity: totalCap,
          activeInmates: totalActive,
          availableSpots: Math.max(0, totalCap - totalActive),
          occupancyRate: totalCap > 0 ? Math.round((totalActive / totalCap) * 100) : 0
        };
        await statsRef.set(updatedStats);

        await deps.writeAuditLog({
          userId: user.uid,
          userName: user.profile.fullName,
          userRole: user.assignments.role,
          userScopeProvince: 'CENTRAL_GLOBAL',
          action: 'ESTABLISHMENT_HOMOLOGATED',
          targetResource: `pnap/provinces/${provinceId}/establishments/${establishmentId}`,
          details: `HOMOLOGAÇÃO OFICIAL: ${homologated.name} (${provinceId.toUpperCase()}) ativado com ${homologated.totalCapacity} vagas. Despacho: ${homologated.homologationDecreeNumber}.`,
          ipAddress: extractClientIp(req),
          jurisdictionStatus: 'AUTHORIZED'
        });

        res.status(200).json({
          success: true,
          message: `${homologated.name} homologado em ${provinceId.toUpperCase()} (${homologated.totalCapacity} vagas).`,
          establishment: homologated,
          provinceStats: updatedStats
        });
      } catch (err) {
        handleServerError(err, res, 'Erro ao homologar estabelecimento.');
      }
    }
  );

  // --- ÍNDICE NACIONAL DE RECLUSOS & CONSULTA INTELIGENTE ---
  async function handleNationalIndexSearch(req: AuthenticatedRequest, res: Response) {
    const user = req.pnapUser!;
    const queryProvince = typeof req.query.provinceId === 'string' ? req.query.provinceId.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = (typeof req.query.category === 'string' ? req.query.category.trim() : 'all') as SearchCategory;
    const custodyScope = (typeof req.query.custodyScope === 'string' ? req.query.custodyScope.trim() : 'ALL') as SearchCustodyScope;
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.floor(rawLimit)) : 50;

    if (queryProvince && queryProvince !== 'all' && !isValidProvinceId(queryProvince)) {
      res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província de pesquisa inválida.' });
      return;
    }

    try {
      const db = deps.getDb();
      const preferredProvinceId =
        isValidProvinceId(user.assignments.assignedProvinceId)
          ? user.assignments.assignedProvinceId
          : undefined;

      const searched = await searchNationalIndexInFirestore(db, {
        q,
        category,
        custodyScope,
        provinceId: (queryProvince || '') as ProvinceId | '' | 'all',
        preferredProvinceId,
        limit
      });

      const isCrossProvince =
        user.assignments.role !== 'CENTRAL_ADMIN' &&
        (!queryProvince || queryProvince !== user.assignments.assignedProvinceId);

      if (isCrossProvince) {
        await deps.writeAuditLog({
          userId: user.uid,
          userName: user.profile.fullName,
          userRole: user.assignments.role,
          userScopeProvince: user.assignments.assignedProvinceId,
          action: 'NATIONAL_INDEX_CROSS_PROVINCE_QUERY',
          targetResource: queryProvince
            ? `pnap/nationalInmateIndex/${queryProvince}`
            : 'pnap/nationalInmateIndex',
          details: `Consulta federada ao Índice Nacional${q ? ` (termo "${q}")` : ''} por utilizador de ${user.assignments.assignedProvinceId.toUpperCase()}.`,
          ipAddress: extractClientIp(req),
          jurisdictionStatus: 'CROSS_PROVINCE_QUERY'
        });
      }

      res.status(200).json({
        query: q,
        total: searched.total,
        results: searched.results,
        items: searched.results
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao consultar o Índice Nacional de Reclusos.');
    }
  }

  app.get('/api/pnap/national-index/search', requirePnapAuth, handleNationalIndexSearch);
  app.get('/api/pnap/inmates/national-index', requirePnapAuth, handleNationalIndexSearch);

  app.get(
    '/api/pnap/inmates/:inmateId',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      const mode = req.query.mode === 'reentry' ? 'reentry' : 'default';

      if (!inmateId) {
        res.status(400).json({ error: 'INVALID_INMATE_ID', message: 'ID da FUR inválido.' });
        return;
      }

      try {
        const db = deps.getDb();
        const snap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!snap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'Ficha Única do recluso não encontrada.' });
          return;
        }

        const inmate = snap.data() as Inmate;
        const custodyState = resolveEffectiveCustodyState(inmate);

        if (mode === 'reentry') {
          const canRehydrateByRole = [
            'CENTRAL_ADMIN',
            'PROVINCIAL_COMMAND',
            'ESTABLISHMENT_DIRECTOR',
            'OPERATIONAL_OFFICER',
            'PENAL_CONTROL'
          ].includes(user.assignments.role);

          if (!canRehydrateByRole || (custodyState !== 'LIBERTADO' && custodyState !== 'EVADIDO')) {
            await logBlockedAttempt(
              req,
              user,
              'BLOCKED_FUR_REENTRY_READ',
              `pnap/inmates/${inmateId}`,
              `Tentativa bloqueada de reidratação da FUR (${custodyState}) por ${user.assignments.role}.`
            );
            res.status(403).json({
              error: 'FORBIDDEN',
              message: 'Acesso Negado: Reidratação de FUR reservada a reentrada (LIBERTADO) ou recaptura (EVADIDO) por perfil de Controlo Penal.'
            });
            return;
          }

          if (
            user.assignments.role !== 'CENTRAL_ADMIN' &&
            user.assignments.assignedProvinceId !== inmate.provinceId
          ) {
            await deps.writeAuditLog({
              userId: user.uid,
              userName: user.profile.fullName,
              userRole: user.assignments.role,
              userScopeProvince: user.assignments.assignedProvinceId,
              action: 'CROSS_PROVINCE_FUR_REHYDRATE',
              targetResource: `pnap/inmates/${inmateId}`,
              details: `Pré-carregamento interprovincial da FUR ${inmate.profile.matricula} (${custodyState}) para reentrada/recaptura em ${user.assignments.assignedProvinceId.toUpperCase()}.`,
              ipAddress: extractClientIp(req),
              jurisdictionStatus: 'CROSS_PROVINCE_QUERY'
            });
          }

          res.status(200).json({
            inmate: redactInmateClinicalData(inmate, 'PENAL_CONTROL')
          });
          return;
        }

        const canRead =
          user.assignments.role === 'AUDITOR_INSPECTOR'
            ? canOperateProvince(user, inmate.provinceId)
            : canOperateEstablishment(user, inmate.provinceId, inmate.establishmentId);

        if (!canRead) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_INMATE_FUR_READ',
            `pnap/inmates/${inmateId}`,
            `Tentativa bloqueada de leitura da FUR fora da jurisdição.`
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Sem jurisdição territorial para consultar esta Ficha Única.'
          });
          return;
        }

        res.status(200).json({
          inmate: redactInmateClinicalData(inmate, user.assignments.role)
        });
      } catch (err) {
        handleServerError(err, res, 'Erro ao carregar Ficha Única do recluso.');
      }
    }
  );

  app.get(
    '/api/pnap/provinces/:provinceId/inmates',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const provinceId = String(req.params.provinceId || '');

      if (!isValidProvinceId(provinceId)) {
        res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província RDPA 2024 inválida.' });
        return;
      }

      if (!canOperateProvince(user, provinceId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_PROVINCIAL_INMATES_READ',
          `pnap/provinces/${provinceId}/inmates`,
          `Tentativa bloqueada de leitura de fichas prisionais em ${provinceId.toUpperCase()}.`
        );
        res.status(403).json({
          error: 'PROVINCIAL_ISOLATION_VIOLATION',
          message: `Acesso Negado: Isolamento provincial impede leitura de reclusos em ${provinceId.toUpperCase()}.`
        });
        return;
      }

      try {
        const db = deps.getDb();
        const snap = await db
          .collection('pnap_inmates')
          .where('provinceId', '==', provinceId)
          .get();

        let inmates = snap.docs.map((d) => d.data() as Inmate);
        if (
          user.assignments.role !== 'CENTRAL_ADMIN' &&
          user.assignments.role !== 'PROVINCIAL_COMMAND' &&
          user.assignments.role !== 'AUDITOR_INSPECTOR' &&
          user.assignments.assignedEstablishmentId
        ) {
          inmates = inmates.filter(
            (inm) => inm.establishmentId === user.assignments.assignedEstablishmentId
          );
        }

        inmates = inmates.map((inm) => redactInmateClinicalData(inm, user.assignments.role));
        res.status(200).json({ provinceId, inmates });
      } catch (err) {
        handleServerError(err, res, 'Erro ao listar reclusos da província.');
      }
    }
  );

  // --- ENTRADA / INTERNAMENTO TRANSACIONAL (UNICIDADE NACIONAL + VERSÃO) ---
  app.post('/api/pnap/inmates/admission', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const inmatePayload = req.body as (Partial<Inmate> & { reentry?: boolean }) | undefined;

    const provinceId = inmatePayload?.provinceId;
    const establishmentId = inmatePayload?.establishmentId?.trim() || '';

    if (!isValidProvinceId(provinceId) || !establishmentId) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Província RDPA 2024 e estabelecimento de internamento são obrigatórios.'
      });
      return;
    }

    if (!canManagePenalControl(user, provinceId, establishmentId)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_INMATE_ADMISSION_ATTEMPT',
        `pnap/provinces/${provinceId}/establishments/${establishmentId}/inmates`,
        `Tentativa bloqueada de internamento fora da jurisdição ou perfil não autorizado (${provinceId.toUpperCase()} / ${establishmentId}).`
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Acesso Negado: Sem competência de Controlo Penal para admitir reclusos em ${provinceId.toUpperCase()}.`
      });
      return;
    }

    if (!inmatePayload?.profile?.fullName?.trim() || !inmatePayload?.profile?.matricula?.trim()) {
      res.status(400).json({
        error: 'MISSING_INMATE_FIELDS',
        message: 'Nome completo e matrícula do recluso são obrigatórios.'
      });
      return;
    }

    try {
      const result = await admitInmateTransactional(
        deps.getDb(),
        { user, ipAddress: extractClientIp(req) },
        inmatePayload
      );
      res.status(201).json({
        success: true,
        inmate: result.inmate,
        admission: result.admission,
        process: result.process
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao registar internamento.');
    }
  });

  // --- SAÍDAS RIGOROSAS & DESPACHO DE TRANSFERÊNCIA (8 MODALIDADES) ---
  app.post('/api/pnap/inmates/:inmateId/exit', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const inmateId = String(req.params.inmateId || '').trim();
    const {
      modality,
      documentNumber,
      authorityOrDetail,
      exitDate,
      destinationProvinceId,
      destinationEstablishmentId,
      notes,
      approvedByDirector,
      extinguishProcessId,
      expectedVersion
    } = req.body || {};

    if (!inmateId || !VALID_EXIT_MODALITIES.includes(modality)) {
      res.status(400).json({
        error: 'INVALID_EXIT_MODALITY',
        message: 'Informe um recluso e uma modalidade de saída válida.'
      });
      return;
    }

    if (
      !String(documentNumber || '').trim() ||
      !String(authorityOrDetail || '').trim() ||
      !String(exitDate || '').trim()
    ) {
      res.status(400).json({
        error: 'MISSING_EXIT_FIELDS',
        message: 'Documento legal, autoridade/detalhe e data de saída são obrigatórios.'
      });
      return;
    }

    try {
      const db = deps.getDb();
      const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
      if (!inmateSnap.exists) {
        res.status(404).json({
          error: 'INMATE_NOT_FOUND',
          message: 'Recluso não encontrado no Firestore.'
        });
        return;
      }

      const inmate = inmateSnap.data() as Inmate;
      if (!canManagePenalControl(user, inmate.provinceId, inmate.establishmentId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_INMATE_EXIT_ATTEMPT',
          `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmateId}`,
          `Tentativa bloqueada de saída (${modality}) para ${inmate.profile.fullName} fora da jurisdição ou competência.`
        );
        res.status(403).json({
          error: 'FORBIDDEN',
          message: `Acesso Negado: Sem competência de Controlo Penal para registar saída em ${inmate.provinceId.toUpperCase()}.`
        });
        return;
      }

      const parsedExpectedVersion =
        expectedVersion !== undefined ? Number(expectedVersion) : undefined;

      const result = await registerExitTransactional(
        db,
        { user, ipAddress: extractClientIp(req) },
        inmateId,
        {
          modality,
          documentNumber: String(documentNumber).trim(),
          authorityOrDetail: String(authorityOrDetail).trim(),
          exitDate: String(exitDate).trim(),
          destinationProvinceId,
          destinationEstablishmentId,
          notes,
          approvedByDirector,
          extinguishProcessId,
          expectedVersion: parsedExpectedVersion
        }
      );

      res.status(200).json({
        success: true,
        message: `Saída registada (${modality} ➔ ${result.record.resultingStatus}): ${inmate.profile.fullName}.`,
        record: result.record,
        inmate: result.inmate,
        ...(result.transfer ? { transfer: result.transfer } : {}),
        ...(result.movement ? { movement: result.movement } : {})
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao registar saída do recluso.');
    }
  });

  // --- TRANSIÇÃO PENAL TRANSACIONAL (DETIDO/PREVENTIVO -> CONDENADO) ---
  app.post(
    '/api/pnap/inmates/:inmateId/legal-transition',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      const {
        processId,
        courtName,
        sentenceAcordaoNumber,
        sentenceDate,
        transitDate,
        totalSentenceYears,
        totalSentenceMonths,
        regime,
        judgeName,
        notes,
        expectedVersion
      } = req.body || {};

      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({
            error: 'INMATE_NOT_FOUND',
            message: 'Ficha Única do recluso não encontrada.'
          });
          return;
        }

        const targetInmate = inmateSnap.data() as Inmate;
        if (!canManagePenalControl(user, targetInmate.provinceId, targetInmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_LEGAL_TRANSITION_ATTEMPT',
            `pnap/provinces/${targetInmate.provinceId}/inmates/${inmateId}`,
            `Tentativa bloqueada de transição penal para ${targetInmate.profile.fullName} fora da jurisdição.`
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: `Acesso Negado: Sem competência na província ${targetInmate.provinceId.toUpperCase()}.`
          });
          return;
        }

        const parsedExpectedVersion =
          expectedVersion !== undefined ? Number(expectedVersion) : undefined;

        const result = await legalTransitionTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          {
            processId,
            courtName,
            sentenceAcordaoNumber: String(sentenceAcordaoNumber || ''),
            sentenceDate,
            transitDate: String(transitDate || ''),
            totalSentenceYears: Number(totalSentenceYears) || 0,
            totalSentenceMonths: Number(totalSentenceMonths) || 0,
            regime,
            judgeName,
            notes,
            expectedVersion: parsedExpectedVersion
          }
        );

        res.status(200).json({
          success: true,
          message: `Ficha Única atualizada: ${result.inmate.profile.fullName} convertido para CONDENADO.`,
          record: result.transition,
          inmate: result.inmate
        });
      } catch (err) {
        handleServerError(err, res, 'Erro ao registar transição penal.');
      }
    }
  );

  // --- PROCESSOS JUDICIAIS MÚLTIPLOS (ORTOGONALIDADE CUSTÓDIA × JURÍDICO) ---
  app.get(
    '/api/pnap/inmates/:inmateId/processes',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      if (!inmateId) {
        res.status(400).json({ error: 'INVALID_INMATE_ID', message: 'ID do recluso inválido.' });
        return;
      }

      if (user.assignments.role === 'HEALTH_SPECIALIST') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Segregação de funções: perfil clínico não acede aos processos judiciais.'
        });
        return;
      }

      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        const canInspect =
          user.assignments.role === 'AUDITOR_INSPECTOR'
            ? canOperateProvince(user, inmate.provinceId)
            : canOperateEstablishment(user, inmate.provinceId, inmate.establishmentId);

        if (!canInspect) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_JUDICIAL_PROCESSES_READ',
            `pnap/inmates/${inmateId}/judicial_processes`,
            'Tentativa bloqueada de leitura de processos judiciais fora da jurisdição.'
          );
          res.status(403).json({ error: 'FORBIDDEN', message: 'Sem jurisdição territorial.' });
          return;
        }

        const snap = await db
          .collection('pnap_inmates')
          .doc(inmateId)
          .collection('judicial_processes')
          .get();
        const processes = snap.docs.map((d) => d.data() as JudicialProcess);
        res.status(200).json({ inmateId, processes });
      } catch (err) {
        handleServerError(err, res, 'Erro ao consultar processos judiciais da FUR.');
      }
    }
  );

  app.post(
    '/api/pnap/inmates/:inmateId/processes',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canManagePenalControl(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_JUDICIAL_PROCESS_CREATE',
            `pnap/inmates/${inmateId}/judicial_processes`,
            'Tentativa não autorizada de vincular processo judicial.'
          );
          res.status(403).json({ error: 'FORBIDDEN', message: 'Sem competência de Controlo Penal.' });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await addJudicialProcessTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          { ...(req.body || {}), expectedVersion }
        );
        res.status(201).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao vincular processo judicial.');
      }
    }
  );

  app.post(
    '/api/pnap/inmates/:inmateId/processes/:processId/extinguish',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      const processId = String(req.params.processId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canManagePenalControl(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_JUDICIAL_PROCESS_EXTINGUISH',
            `pnap/inmates/${inmateId}/judicial_processes/${processId}`,
            'Tentativa não autorizada de extinguir processo judicial.'
          );
          res.status(403).json({ error: 'FORBIDDEN', message: 'Sem competência de Controlo Penal.' });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await extinguishJudicialProcessTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          processId,
          {
            extintionReason: String(req.body?.extintionReason || ''),
            extintionDate: req.body?.extintionDate,
            expectedVersion
          }
        );
        res.status(200).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao extinguir processo judicial.');
      }
    }
  );

  // --- TRANSFERÊNCIA EM DUAS ETAPAS (ETAPA 1: DESPACHO ORIGEM / ETAPA 2: RECEPÇÃO DESTINO) ---
  app.get('/api/pnap/transfers', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    try {
      const db = deps.getDb();
      const snap = await db.collection('pnap_transfers').get();
      let transfers = snap.docs.map((d) => d.data() as TransferRecord);
      if (
        user.assignments.role !== 'CENTRAL_ADMIN' &&
        !(user.assignments.role === 'AUDITOR_INSPECTOR' && user.assignments.assignedProvinceId === 'all')
      ) {
        const prov = user.assignments.assignedProvinceId;
        transfers = transfers.filter(
          (t) => t.originProvinceId === prov || t.destinationProvinceId === prov
        );
      }
      res.status(200).json({ transfers });
    } catch (err) {
      handleServerError(err, res, 'Erro ao listar guias de transferência.');
    }
  });

  app.post('/api/pnap/transfers/request', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const {
      inmateId,
      inmateName,
      matricula,
      originProvinceId,
      originEstablishmentId,
      destinationProvinceId,
      destinationEstablishmentId,
      justification,
      securityEscort
    } = req.body || {};

    if (!isValidProvinceId(originProvinceId) || !isValidProvinceId(destinationProvinceId)) {
      res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Províncias de origem/destino inválidas.' });
      return;
    }

    if (!canAuthorizePhysicalTransfer(user, originProvinceId)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_PHYSICAL_TRANSFER_ATTEMPT',
        `pnap/transfers/${inmateId || 'unknown'}`,
        `Tentativa bloqueada de emissão de guia de transferência a partir de ${originProvinceId.toUpperCase()}.`
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Acesso Negado: Apenas a província de origem ou CENTRAL_ADMIN podem emitir Guias de Transferência.'
      });
      return;
    }

    try {
      const db = deps.getDb();
      const isCentral = user.assignments.role === 'CENTRAL_ADMIN';
      const transfer: TransferRecord = {
        transferId: `trf-${Date.now()}`,
        inmateId: String(inmateId || '').trim(),
        inmateName: String(inmateName || '').trim(),
        matricula: String(matricula || '').trim(),
        originProvinceId,
        originEstablishmentId: String(originEstablishmentId || '').trim(),
        destinationProvinceId,
        destinationEstablishmentId: String(destinationEstablishmentId || '').trim(),
        requestDate: new Date().toISOString().split('T')[0],
        status: isCentral ? 'AUTORIZADO_CENTRAL' : 'PENDENTE',
        justification: String(justification || '').trim(),
        securityEscort: String(securityEscort || '').trim(),
        authorizedBy: user.profile.fullName
      };

      await db.collection('pnap_transfers').doc(transfer.transferId).set(transfer);

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince: isCentral ? 'CENTRAL_GLOBAL' : user.assignments.assignedProvinceId,
        action: 'INMATE_PHYSICAL_TRANSFER_REQUEST',
        targetResource: `pnap/transfers/${transfer.transferId}`,
        details: `Guia de Transferência Física: ${transfer.inmateName} (${originProvinceId.toUpperCase()} ➔ ${destinationProvinceId.toUpperCase()}).`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(201).json({ success: true, record: transfer });
    } catch (err) {
      handleServerError(err, res, 'Erro ao registar solicitação de transferência.');
    }
  });

  app.post(
    '/api/pnap/inmates/:inmateId/transfer/dispatch',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canManagePenalControl(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_TRANSFER_DISPATCH',
            `pnap/inmates/${inmateId}/transfer/dispatch`,
            'Tentativa bloqueada de despacho de transferência sem competência na unidade de origem.'
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Acesso Negado: Sem competência na unidade de origem para despachar transferência.'
          });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await dispatchTransferTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          {
            destinationProvinceId: req.body?.destinationProvinceId,
            destinationEstablishmentId: String(req.body?.destinationEstablishmentId || ''),
            documentNumber: String(req.body?.documentNumber || ''),
            securityEscort: String(req.body?.securityEscort || 'Escolta PNAP'),
            justification: String(req.body?.justification || ''),
            exitDate: req.body?.exitDate,
            expectedVersion
          }
        );

        res.status(200).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao despachar transferência na origem.');
      }
    }
  );

  app.post(
    '/api/pnap/transfers/:transferId/receive',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const transferId = String(req.params.transferId || '').trim();
      try {
        const db = deps.getDb();
        const trfSnap = await db.collection('pnap_transfers').doc(transferId).get();
        if (!trfSnap.exists) {
          res.status(404).json({ error: 'TRANSFER_NOT_FOUND', message: 'Guia de transferência não encontrada.' });
          return;
        }
        const transfer = trfSnap.data() as TransferRecord;

        if (
          !canManagePenalControl(
            user,
            transfer.destinationProvinceId,
            transfer.destinationEstablishmentId
          )
        ) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_TRANSFER_RECEIVE',
            `pnap/transfers/${transferId}/receive`,
            `Tentativa bloqueada de recepção de transferência fora da unidade de destino (${transfer.destinationProvinceId.toUpperCase()} / ${transfer.destinationEstablishmentId}).`
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: `Acesso Negado: Apenas o destino (${transfer.destinationProvinceId.toUpperCase()}) ou CENTRAL_ADMIN podem concluir a recepção.`
          });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await receiveTransferTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          transferId,
          {
            targetPavilionId: req.body?.targetPavilionId,
            targetBlockId: req.body?.targetBlockId,
            targetCellId: req.body?.targetCellId,
            notes: req.body?.notes,
            expectedVersion
          }
        );

        res.status(200).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao recepcionar recluso transferido no destino.');
      }
    }
  );

  // --- RECAPTURA DE EVADIDO (REATIVAÇÃO DA MESMA FUR E MATRÍCULA) ---
  app.post(
    '/api/pnap/inmates/:inmateId/recapture',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      const targetProvinceId = req.body?.provinceId;
      const targetEstablishmentId = String(req.body?.establishmentId || '').trim();

      if (!isValidProvinceId(targetProvinceId) || !targetEstablishmentId) {
        res.status(400).json({
          error: 'INVALID_RECAPTURE_DATA',
          message: 'Província e estabelecimento de recolha são obrigatórios para recaptura.'
        });
        return;
      }

      if (!canManagePenalControl(user, targetProvinceId, targetEstablishmentId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_INMATE_RECAPTURE',
          `pnap/inmates/${inmateId}/recapture`,
          `Tentativa bloqueada de recaptura na unidade ${targetEstablishmentId} fora da jurisdição.`
        );
        res.status(403).json({
          error: 'FORBIDDEN',
          message: `Acesso Negado: Sem competência de Controlo Penal para recaptura em ${targetProvinceId.toUpperCase()}.`
        });
        return;
      }

      try {
        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await recaptureInmateTransactional(
          deps.getDb(),
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          {
            provinceId: targetProvinceId,
            establishmentId: targetEstablishmentId,
            pavilionId: req.body?.pavilionId,
            blockId: req.body?.blockId,
            cellId: req.body?.cellId,
            documentNumber: String(req.body?.documentNumber || ''),
            authorityOrEscort: String(req.body?.authorityOrEscort || 'Escolta PNAP'),
            notes: req.body?.notes,
            expectedVersion
          }
        );
        res.status(200).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao registar recaptura.');
      }
    }
  );

  // --- MOVIMENTAÇÕES TEMPORÁRIAS COM RESERVA DE CELA (DILIGÊNCIA / HOSPITAL) ---
  app.get(
    '/api/pnap/inmates/:inmateId/movements',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        const canRead =
          user.assignments.role === 'AUDITOR_INSPECTOR'
            ? canOperateProvince(user, inmate.provinceId)
            : canOperateEstablishment(user, inmate.provinceId, inmate.establishmentId);

        if (!canRead) {
          res.status(403).json({ error: 'FORBIDDEN', message: 'Sem jurisdição territorial.' });
          return;
        }

        const snap = await db
          .collection('pnap_movements')
          .where('inmateId', '==', inmateId)
          .get();
        const movements = snap.docs
          .map((d) => d.data() as MovementRecord)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        res.status(200).json({ inmateId, movements });
      } catch (err) {
        handleServerError(err, res, 'Erro ao consultar histórico de movimentações.');
      }
    }
  );

  app.post(
    '/api/pnap/inmates/:inmateId/movements',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canRegisterPhysicalMovement(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_MOVEMENT_REGISTRATION',
            `pnap/inmates/${inmateId}/movements`,
            'Tentativa não autorizada de registo de movimentação física.'
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Acesso Negado: Sem competência de Portaria/Escolta ou Controlo Penal.'
          });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await registerTemporaryMovementTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          {
            type: req.body?.type,
            documentNumber: String(req.body?.documentNumber || ''),
            authorityOrEscort: String(req.body?.authorityOrEscort || ''),
            destinationLabel: req.body?.destinationLabel,
            notes: req.body?.notes,
            expectedVersion
          }
        );

        res.status(200).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao registar movimentação temporária.');
      }
    }
  );

  // --- MÓDULO SAÚDE & SIGILO CLÍNICO (EXCLUSIVO HEALTH_SPECIALIST) ---
  app.get(
    '/api/pnap/inmates/:inmateId/health-records',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canAccessClinicalRecords(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_CLINICAL_RECORDS_READ',
            `pnap/inmates/${inmateId}/health_records`,
            `Sigilo clínico protegido: perfil ${user.assignments.role} impedido de ler prontuário médico.`
          );
          res.status(403).json({
            error: 'CLINICAL_SECRECY_VIOLATION',
            message: 'Sigilo Clínico: Apenas o perfil HEALTH_SPECIALIST da unidade pode consultar prontuários médicos.'
          });
          return;
        }

        const result = await listHealthRecords(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId
        );
        res.status(200).json({ inmateId, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao consultar prontuário clínico.');
      }
    }
  );

  app.post(
    '/api/pnap/inmates/:inmateId/health-records',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canAccessClinicalRecords(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_CLINICAL_RECORDS_WRITE',
            `pnap/inmates/${inmateId}/health_records`,
            `Tentativa bloqueada de escrita clínica por perfil ${user.assignments.role}.`
          );
          res.status(403).json({
            error: 'CLINICAL_SECRECY_VIOLATION',
            message: 'Sigilo Clínico: Apenas HEALTH_SPECIALIST pode registar avaliações médicas.'
          });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await recordClinicalEvaluationTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          { ...(req.body || {}), expectedVersion }
        );
        res.status(201).json({ success: true, ...result });
      } catch (err) {
        handleServerError(err, res, 'Erro ao registar avaliação clínica.');
      }
    }
  );

  // --- MÓDULO REABILITAÇÃO, CLASSIFICAÇÃO & ALOJAMENTO COMPATÍVEL ---
  app.post(
    '/api/pnap/inmates/:inmateId/rehabilitation',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        if (!canManageRehabilitation(user, inmate.provinceId, inmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_REHABILITATION_UPDATE',
            `pnap/inmates/${inmateId}/rehabilitation`,
            `Tentativa não autorizada de alteração de classificação/alojamento por ${user.assignments.role}.`
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Acesso Negado: Sem competência de Reabilitação ou Direção nesta unidade.'
          });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await updateRehabilitationTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          { ...(req.body || {}), expectedVersion }
        );
        res.status(200).json({
          success: true,
          inmate: redactInmateClinicalData(result.inmate, user.assignments.role)
        });
      } catch (err) {
        handleServerError(err, res, 'Erro ao atualizar reabilitação e classificação.');
      }
    }
  );

  // --- MÓDULO INCIDENTES & SANÇÕES DISCIPLINARES (INCLUINDO INCIDENTES COM VISITANTES NA FUR) ---
  app.post(
    '/api/pnap/inmates/:inmateId/incidents',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      const source: 'INTERNO' | 'VISITA' = req.body?.source === 'VISITA' ? 'VISITA' : 'INTERNO';
      try {
        const db = deps.getDb();
        const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
        if (!inmateSnap.exists) {
          res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR não encontrada.' });
          return;
        }
        const inmate = inmateSnap.data() as Inmate;
        const authorized =
          source === 'VISITA'
            ? canRegisterPhysicalMovement(user, inmate.provinceId, inmate.establishmentId)
            : canManagePenalControl(user, inmate.provinceId, inmate.establishmentId);

        if (!authorized) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_INCIDENT_REGISTRATION',
            `pnap/inmates/${inmateId}/incidents`,
            `Tentativa não autorizada de registo de incidente (${source}).`
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message:
              source === 'VISITA'
                ? 'Acesso Negado: Sem competência de Portaria/Controlo Penal para registar incidente de visita.'
                : 'Acesso Negado: Sem competência disciplinar/controlo penal nesta unidade.'
          });
          return;
        }

        const expectedVersion =
          req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
        const result = await registerIncidentAndSanctionTransactional(
          db,
          { user, ipAddress: extractClientIp(req) },
          inmateId,
          { ...(req.body || {}), source, expectedVersion }
        );
        res.status(201).json({
          success: true,
          incident: result.incident,
          inmate: redactInmateClinicalData(result.inmate, user.assignments.role)
        });
      } catch (err) {
        handleServerError(err, res, 'Erro ao registar ocorrência disciplinar.');
      }
    }
  );

  // --- MÓDULO VISITAS & PORTARIA (INTEGRADO NA FICHA ÚNICA DO RECLUSO) ---
  function resolveReadScope(user: PnapUser, inmateId: string) {
    const isGlobal =
      user.assignments.role === 'CENTRAL_ADMIN' ||
      (user.assignments.role === 'AUDITOR_INSPECTOR' &&
        user.assignments.assignedProvinceId === 'all');
    const establishmentScoped =
      user.assignments.role !== 'CENTRAL_ADMIN' &&
      user.assignments.role !== 'PROVINCIAL_COMMAND' &&
      user.assignments.role !== 'AUDITOR_INSPECTOR' &&
      user.assignments.assignedEstablishmentId
        ? user.assignments.assignedEstablishmentId
        : undefined;
    return {
      inmateId: inmateId || undefined,
      provinceId: isGlobal ? undefined : user.assignments.assignedProvinceId,
      establishmentId: establishmentScoped
    };
  }

  app.get('/api/pnap/visitors', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const inmateId = typeof req.query.inmateId === 'string' ? req.query.inmateId.trim() : '';
    try {
      const db = deps.getDb();
      const visitors = await listVisitorsFromFurs(db, resolveReadScope(user, inmateId));
      res.status(200).json({ visitors });
    } catch (err) {
      handleServerError(err, res, 'Erro ao listar visitantes.');
    }
  });

  async function handleRegisterVisitorOnFur(req: AuthenticatedRequest, res: Response) {
    const user = req.pnapUser!;
    const inmateId = String(req.params.inmateId || req.body?.inmateId || '').trim();
    if (!inmateId) {
      res.status(400).json({ error: 'MISSING_INMATE_ID', message: 'ID da FUR é obrigatório.' });
      return;
    }
    try {
      const db = deps.getDb();
      const inmateSnap = await db.collection('pnap_inmates').doc(inmateId).get();
      if (!inmateSnap.exists) {
        res.status(404).json({ error: 'INMATE_NOT_FOUND', message: 'FUR do recluso não encontrada.' });
        return;
      }
      const inmate = inmateSnap.data() as Inmate;
      if (!canRegisterPhysicalMovement(user, inmate.provinceId, inmate.establishmentId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_VISITOR_REGISTER',
          `pnap/inmates/${inmateId}/visitors`,
          'Tentativa não autorizada de cadastro de visitante na FUR.'
        );
        res.status(403).json({ error: 'FORBIDDEN', message: 'Sem competência de Portaria/Controlo.' });
        return;
      }

      const expectedVersion =
        req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
      const result = await registerVisitorTransactional(
        db,
        { user, ipAddress: extractClientIp(req) },
        {
          inmateId,
          fullName: String(req.body?.fullName || ''),
          biNumber: String(req.body?.biNumber || ''),
          phone: String(req.body?.phone || ''),
          relationship: String(req.body?.relationship || 'Familiar'),
          expectedVersion
        }
      );
      res.status(201).json({
        success: true,
        visitor: result.visitor,
        embeddedVisitor: result.embeddedVisitor,
        deduplicated: result.deduplicated,
        inmate: redactInmateClinicalData(result.inmate, user.assignments.role)
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao cadastrar visitante na FUR.');
    }
  }

  app.post('/api/pnap/inmates/:inmateId/visitors', requirePnapAuth, handleRegisterVisitorOnFur);
  app.post('/api/pnap/visitors', requirePnapAuth, handleRegisterVisitorOnFur);

  async function handleUpdateVisitorStatusOnFur(req: AuthenticatedRequest, res: Response) {
    const user = req.pnapUser!;
    const visitorId = String(req.params.visitorId || '').trim();
    const inmateIdHint = String(req.params.inmateId || req.body?.inmateId || '').trim();
    try {
      const db = deps.getDb();
      let scopeInmate: Inmate | null = null;
      if (inmateIdHint) {
        const snap = await db.collection('pnap_inmates').doc(inmateIdHint).get();
        if (snap.exists) scopeInmate = snap.data() as Inmate;
      } else {
        const allSnap = await db.collection('pnap_inmates').get();
        for (const doc of allSnap.docs) {
          const data = doc.data() as Inmate;
          if ((data.visitors || []).some((v) => v.visitorId === visitorId)) {
            scopeInmate = data;
            break;
          }
        }
        if (!scopeInmate) {
          const legSnap = await db.collection('pnap_visitors').doc(visitorId).get();
          if (legSnap.exists) {
            const leg = legSnap.data() as VisitorRecord;
            const inmSnap = await db.collection('pnap_inmates').doc(leg.inmateId).get();
            if (inmSnap.exists) scopeInmate = inmSnap.data() as Inmate;
          }
        }
      }

      if (!scopeInmate) {
        res.status(404).json({ error: 'VISITOR_NOT_FOUND', message: 'Visitante não encontrado em nenhuma FUR.' });
        return;
      }

      if (
        !canManagePenalControl(user, scopeInmate.provinceId, scopeInmate.establishmentId)
      ) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_VISITOR_STATUS_CHANGE',
          `pnap/inmates/${scopeInmate.inmateId}/visitors/${visitorId}`,
          'Tentativa não autorizada de suspender/autorizar visitante.'
        );
        res.status(403).json({ error: 'FORBIDDEN', message: 'Sem competência de Controlo Penal.' });
        return;
      }

      const result = await updateVisitorStatusTransactional(
        db,
        { user, ipAddress: extractClientIp(req) },
        visitorId,
        req.body?.status,
        req.body?.reason,
        scopeInmate.inmateId
      );
      res.status(200).json({
        success: true,
        visitor: result.visitor,
        inmate: redactInmateClinicalData(result.inmate, user.assignments.role)
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao atualizar estado do visitante.');
    }
  }

  app.patch(
    '/api/pnap/inmates/:inmateId/visitors/:visitorId/status',
    requirePnapAuth,
    handleUpdateVisitorStatusOnFur
  );
  app.patch(
    '/api/pnap/visitors/:visitorId/status',
    requirePnapAuth,
    handleUpdateVisitorStatusOnFur
  );

  app.get('/api/pnap/visits', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const inmateId = typeof req.query.inmateId === 'string' ? req.query.inmateId.trim() : '';
    try {
      const db = deps.getDb();
      const visits = await listVisitsFromFurs(db, resolveReadScope(user, inmateId));
      res.status(200).json({ visits });
    } catch (err) {
      handleServerError(err, res, 'Erro ao listar histórico de visitas.');
    }
  });

  async function handleRegisterVisitOnFur(req: AuthenticatedRequest, res: Response) {
    const user = req.pnapUser!;
    const visitorId = String(req.body?.visitorId || '').trim();
    const inmateIdParam = String(req.params.inmateId || req.body?.inmateId || '').trim();
    try {
      const db = deps.getDb();
      let scopeInmate: Inmate | null = null;
      if (inmateIdParam) {
        const snap = await db.collection('pnap_inmates').doc(inmateIdParam).get();
        if (snap.exists) scopeInmate = snap.data() as Inmate;
      } else if (visitorId) {
        const allSnap = await db.collection('pnap_inmates').get();
        for (const doc of allSnap.docs) {
          const data = doc.data() as Inmate;
          if ((data.visitors || []).some((v) => v.visitorId === visitorId)) {
            scopeInmate = data;
            break;
          }
        }
        if (!scopeInmate) {
          const legSnap = await db.collection('pnap_visitors').doc(visitorId).get();
          if (legSnap.exists) {
            const leg = legSnap.data() as VisitorRecord;
            const inmSnap = await db.collection('pnap_inmates').doc(leg.inmateId).get();
            if (inmSnap.exists) scopeInmate = inmSnap.data() as Inmate;
          }
        }
      }

      if (!scopeInmate) {
        res.status(404).json({ error: 'VISITOR_NOT_FOUND', message: 'Visitante ou FUR não encontrado.' });
        return;
      }

      if (!canRegisterPhysicalMovement(user, scopeInmate.provinceId, scopeInmate.establishmentId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_VISIT_CHECKIN',
          `pnap/inmates/${scopeInmate.inmateId}/visits`,
          'Tentativa não autorizada de registo de visita na portaria.'
        );
        res.status(403).json({ error: 'FORBIDDEN', message: 'Sem competência de Portaria/Controlo.' });
        return;
      }

      const expectedVersion =
        req.body?.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
      const result = await registerVisitCheckInTransactional(
        db,
        { user, ipAddress: extractClientIp(req) },
        {
          inmateId: scopeInmate.inmateId,
          visitorId,
          date: req.body?.date,
          timeSlot: req.body?.timeSlot,
          inspectionPassed: Boolean(req.body?.inspectionPassed),
          notes: req.body?.notes,
          expectedVersion
        }
      );
      res.status(201).json({
        success: true,
        visit: result.visit,
        embeddedVisit: result.embeddedVisit,
        inmate: redactInmateClinicalData(result.inmate, user.assignments.role)
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao registar entrada de visita.');
    }
  }

  app.post('/api/pnap/inmates/:inmateId/visits', requirePnapAuth, handleRegisterVisitOnFur);
  app.post('/api/pnap/visits', requirePnapAuth, handleRegisterVisitOnFur);

  // --- CATÁLOGOS DINÂMICOS CONFIGURÁVEIS ---
  app.get('/api/pnap/catalogs', requirePnapAuth, async (_req: AuthenticatedRequest, res) => {
    try {
      const db = deps.getDb();
      const snap = await db.collection('pnap_catalogs').get();
      const catalogs = snap.docs.map((d) => d.data() as PnapCatalog);
      res.status(200).json({ catalogs });
    } catch (err) {
      handleServerError(err, res, 'Erro ao consultar catálogos configuráveis.');
    }
  });

  app.put(
    '/api/pnap/catalogs/:catalogId',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const catalogId = String(req.params.catalogId || '').trim();
      if (!canProvision(user)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_CATALOG_UPDATE',
          `pnap/catalogs/${catalogId}`,
          'Tentativa não autorizada de edição de catálogo nacional.'
        );
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Acesso Negado: Apenas CENTRAL_ADMIN gere os catálogos configuráveis.'
        });
        return;
      }
      try {
        const catalog = await upsertCatalogTransactional(
          deps.getDb(),
          { user, ipAddress: extractClientIp(req) },
          catalogId,
          {
            category: req.body?.category,
            items: req.body?.items
          }
        );
        res.status(200).json({ success: true, catalog });
      } catch (err) {
        handleServerError(err, res, 'Erro ao atualizar catálogo.');
      }
    }
  );

  // --- AUDITORIA IMUTÁVEL ---
  app.get('/api/pnap/audit-logs', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    if (!canViewAuditLogs(user)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_AUDIT_LOGS_READ',
        'pnap/auditLogs',
        'Tentativa de leitura de logs de auditoria sem privilégio de Comando.'
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Acesso Negado: Apenas CENTRAL_ADMIN e PROVINCIAL_COMMAND acedem à auditoria.'
      });
      return;
    }

    try {
      const db = deps.getDb();
      const isGlobalAuditAccess =
        user.assignments.role === 'CENTRAL_ADMIN' ||
        (user.assignments.role === 'AUDITOR_INSPECTOR' &&
          user.assignments.assignedProvinceId === 'all');
      let snap;
      if (isGlobalAuditAccess) {
        snap = await db.collection('pnap_audit_logs').get();
      } else {
        snap = await db
          .collection('pnap_audit_logs')
          .where('userScopeProvince', '==', user.assignments.assignedProvinceId)
          .get();
      }

      const logs = snap.docs
        .map((d) => d.data() as AuditLogEvent)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      res.status(200).json({ logs });
    } catch (err) {
      handleServerError(err, res, 'Erro ao consultar registos de auditoria.');
    }
  });

  // --- GEMINI API PROXY SEGURO ---
  app.post('/api/ai/analyze', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const prompt = String(req.body?.prompt || '').trim();
    const requestedProvinceId = String(req.body?.provinceId || '').trim();
    const contextSummary = typeof req.body?.contextSummary === 'string' ? req.body.contextSummary : '';

    if (!prompt) {
      res.status(400).json({ error: 'MISSING_PROMPT', message: 'O campo prompt é obrigatório.' });
      return;
    }

    if (requestedProvinceId && !canOperateProvince(user, requestedProvinceId)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_AI_CROSS_PROVINCE_ANALYSIS',
        `pnap/ai/${requestedProvinceId}`,
        `Tentativa bloqueada de análise Gemini para província não autorizada (${requestedProvinceId.toUpperCase()}).`
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Acesso Negado: Sem autorização para análise operacional em ${requestedProvinceId.toUpperCase()}.`
      });
      return;
    }

    const provinceScope =
      user.assignments.role === 'CENTRAL_ADMIN'
        ? requestedProvinceId || 'NACIONAL (21 Províncias)'
        : user.assignments.assignedProvinceId;

    try {
      const result = await deps.generateAiBrief({
        prompt,
        provinceScope,
        contextSummary
      });

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince:
          user.assignments.role === 'CENTRAL_ADMIN'
            ? 'CENTRAL_GLOBAL'
            : user.assignments.assignedProvinceId,
        action: 'GEMINI_OPERATIONAL_ANALYSIS',
        targetResource: `pnap/ai/${provinceScope}`,
        details: `Consulta Gemini (${result.model}) executada no âmbito ${provinceScope}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({
        model: result.model,
        provinceScope,
        analysis: result.text
      });
    } catch (err) {
      handleServerError(err, res, 'Falha ao processar análise no serviço Gemini.');
    }
  });

  // Tratamento global de erros (inclui CORS rejeitado e JSON inválido)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof Error && err.message === 'CORS_ORIGIN_NOT_ALLOWED') {
      res.status(403).json({
        error: 'CORS_ORIGIN_NOT_ALLOWED',
        message: 'Origem não autorizada pela política CORS do PNAP.'
      });
      return;
    }
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({
        error: 'INVALID_JSON',
        message: 'Payload JSON inválido.'
      });
      return;
    }
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno no servidor PNAP.'
    });
  });

  return app;
}

const isMainModule =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const port = Number(process.env.PORT) || 3001;
  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[PNAP API] Servidor Express ativo na porta ${port} (RDPA 2024 · 21 Províncias)`);
  });
}

export { RDPA_2024_PROVINCES };
