import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { Firestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
import type {
  AdmissionRecord,
  AuditLogEvent,
  EstablishmentProfile,
  ExitModality,
  Inmate,
  LegalTransitionRecord,
  NationalInmateIndexItem,
  PnapUser,
  ProvinceId,
  ProvinceStatistics,
  ReleaseRecord,
  TransferRecord
} from './src/types/pnap';
import {
  checkFirestoreConnection,
  getFirebaseAdminEnvStatus,
  getFirebaseAdminServices
} from './server/firebaseAdmin';
import {
  RDPA_2024_PROVINCES,
  canAuthorizePhysicalTransfer,
  canOperateEstablishment,
  canOperateProvince,
  canProvision,
  canViewAuditLogs,
  createRequirePnapAuth,
  extractClientIp,
  isValidProvinceId,
  type AuditLoggerFn,
  type AuthTokenVerifier,
  type AuthenticatedRequest,
  type UserDirectoryReader
} from './server/rbac';
import { createFirestoreAuditLogger } from './server/audit';
import { computeStructureCapacities, validateEstablishmentForHomologation } from './server/capacity';
import { generatePnapOperationalBrief, isGeminiConfigured } from './server/geminiService';

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
    getAllowedOrigins: () => parseAllowedOrigins()
  };
}

function addMonthsIso(baseDateStr: string, monthsToAdd: number, fallbackDate: string): string {
  const parsed = new Date(baseDateStr || fallbackDate);
  if (Number.isNaN(parsed.getTime())) return fallbackDate;
  parsed.setMonth(parsed.getMonth() + monthsToAdd);
  return parsed.toISOString().split('T')[0];
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

  // --- ROTA PÚBLICA DE HEALTHCHECK (RENDER) ---
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
          (user.assignments.role === 'ESTABLISHMENT_DIRECTOR' ||
            user.assignments.role === 'OPERATIONAL_OFFICER') &&
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

  // --- ÍNDICE NACIONAL DE RECLUSOS & LISTAGEM PROVINCIAL ---
  app.get('/api/pnap/inmates/national-index', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const queryProvince = typeof req.query.provinceId === 'string' ? req.query.provinceId.trim() : '';

    if (queryProvince && !isValidProvinceId(queryProvince)) {
      res.status(400).json({ error: 'INVALID_PROVINCE', message: 'Província de pesquisa inválida.' });
      return;
    }

    try {
      const db = deps.getDb();
      let snap;
      if (queryProvince) {
        snap = await db
          .collection('pnap_national_inmate_index')
          .where('provinceId', '==', queryProvince)
          .get();
      } else {
        snap = await db.collection('pnap_national_inmate_index').get();
      }

      const items = snap.docs.map((d) => d.data() as NationalInmateIndexItem);

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
          details: `Consulta federada ao Índice Nacional por utilizador de ${user.assignments.assignedProvinceId.toUpperCase()}.`,
          ipAddress: extractClientIp(req),
          jurisdictionStatus: 'CROSS_PROVINCE_QUERY'
        });
      }

      res.status(200).json({ items });
    } catch (err) {
      handleServerError(err, res, 'Erro ao consultar o Índice Nacional de Reclusos.');
    }
  });

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
          (user.assignments.role === 'ESTABLISHMENT_DIRECTOR' ||
            user.assignments.role === 'OPERATIONAL_OFFICER') &&
          user.assignments.assignedEstablishmentId
        ) {
          inmates = inmates.filter(
            (inm) => inm.establishmentId === user.assignments.assignedEstablishmentId
          );
        }

        res.status(200).json({ provinceId, inmates });
      } catch (err) {
        handleServerError(err, res, 'Erro ao listar reclusos da província.');
      }
    }
  );

  // --- ENTRADA / INTERNAMENTO DE RECLUSO ---
  app.post('/api/pnap/inmates/admission', requirePnapAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.pnapUser!;
    const inmatePayload = req.body as Partial<Inmate> | undefined;

    const provinceId = inmatePayload?.provinceId;
    const establishmentId = inmatePayload?.establishmentId?.trim() || '';

    if (!isValidProvinceId(provinceId) || !establishmentId) {
      res.status(400).json({
        error: 'INVALID_PAYLOAD',
        message: 'Província RDPA 2024 e estabelecimento de internamento são obrigatórios.'
      });
      return;
    }

    if (!canOperateEstablishment(user, provinceId, establishmentId)) {
      await logBlockedAttempt(
        req,
        user,
        'BLOCKED_INMATE_ADMISSION_ATTEMPT',
        `pnap/provinces/${provinceId}/establishments/${establishmentId}/inmates`,
        `Tentativa bloqueada de internamento fora da jurisdição autorizada (${provinceId.toUpperCase()} / ${establishmentId}).`
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Acesso Negado: Sem competência territorial para admitir reclusos em ${provinceId.toUpperCase()}.`
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
      const db = deps.getDb();
      const estRef = db.collection('pnap_establishments').doc(establishmentId);
      const estSnap = await estRef.get();
      if (!estSnap.exists) {
        res.status(404).json({
          error: 'ESTABLISHMENT_NOT_FOUND',
          message: 'Estabelecimento de destino não encontrado.'
        });
        return;
      }

      const establishment = estSnap.data() as EstablishmentProfile;
      if (establishment.provinceId !== provinceId || establishment.provisioningStatus !== 'HOMOLOGATED') {
        res.status(400).json({
          error: 'ESTABLISHMENT_NOT_HOMOLOGATED',
          message: 'Estabelecimento deve pertencer à província indicada e estar HOMOLOGATED.'
        });
        return;
      }

      const inmateId = inmatePayload.inmateId?.trim() || `inm-${provinceId}-${Date.now()}`;
      const nowIso = new Date().toISOString();

      const newInmate: Inmate = {
        ...(inmatePayload as Inmate),
        inmateId,
        provinceId,
        establishmentId,
        currentStatus: 'ATIVO',
        admission: {
          ...inmatePayload.admission!,
          admissionId: inmatePayload.admission?.admissionId || `adm-${Date.now()}`,
          intakeOfficer: user.profile.fullName
        }
      };

      const indexItem: NationalInmateIndexItem = {
        inmateId,
        matricula: newInmate.profile.matricula,
        fullName: newInmate.profile.fullName,
        alias: newInmate.profile.alias,
        biNumber: newInmate.profile.biNumber,
        provinceId,
        provinceName: provinceId.toUpperCase(),
        establishmentId,
        establishmentName: establishment.name,
        pavilionName: newInmate.pavilionId,
        cellCode: newInmate.cellId,
        legalStatus: newInmate.legal.legalStatus,
        crimeCategory: newInmate.legal.crimeCategory,
        penalCodeArticle: newInmate.legal.penalCodeArticle,
        parentName: newInmate.profile.fatherName || newInmate.profile.motherName || '',
        emergencyContactName: newInmate.profile.emergencyContact?.name || '',
        emergencyPhone: newInmate.profile.emergencyContact?.phone || '',
        neighborhood: newInmate.profile.neighborhood || '',
        photoUrl: newInmate.profile.photoUrl || '',
        lastUpdated: nowIso,
        custodyStatus: 'ATIVO'
      };

      const admissionRecord: AdmissionRecord = {
        admissionId: newInmate.admission.admissionId,
        inmateId,
        fullName: newInmate.profile.fullName,
        matricula: newInmate.profile.matricula,
        provinceId,
        establishmentId,
        courtName: newInmate.admission.courtName,
        crime: newInmate.legal.crimeCategory,
        timestamp: nowIso,
        registeredBy: user.profile.fullName
      };

      await db.collection('pnap_inmates').doc(inmateId).set(newInmate);
      await db.collection('pnap_national_inmate_index').doc(inmateId).set(indexItem);
      await db.collection('pnap_admissions').doc(admissionRecord.admissionId).set(admissionRecord);

      // Atualizar ocupação da unidade e estatísticas provinciais
      const nextUnitActive = (Number(establishment.activeInmatesCount) || 0) + 1;
      await estRef.set({ ...establishment, activeInmatesCount: nextUnitActive });

      const statsRef = db.collection('pnap_province_stats').doc(provinceId);
      const statsSnap = await statsRef.get();
      const prevStats = statsSnap.exists
        ? (statsSnap.data() as ProvinceStatistics)
        : emptyProvinceStats(provinceId);

      const nextActive = prevStats.activeInmates + 1;
      const totalCap = prevStats.totalCapacity;
      const isPreventive =
        newInmate.legal.legalStatus === 'PREVENTIVO' || newInmate.legal.legalStatus === 'RECORRENTE';

      const updatedStats: ProvinceStatistics = {
        ...prevStats,
        activeInmates: nextActive,
        availableSpots: Math.max(0, totalCap - nextActive),
        occupancyRate: totalCap > 0 ? Number(((nextActive / totalCap) * 100).toFixed(1)) : 0,
        preventiveCount: isPreventive ? prevStats.preventiveCount + 1 : prevStats.preventiveCount,
        convictedCount: !isPreventive ? prevStats.convictedCount + 1 : prevStats.convictedCount,
        maleCount: newInmate.profile.gender === 'M' ? prevStats.maleCount + 1 : prevStats.maleCount,
        femaleCount: newInmate.profile.gender === 'F' ? prevStats.femaleCount + 1 : prevStats.femaleCount
      };
      await statsRef.set(updatedStats);

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince:
          user.assignments.role === 'CENTRAL_ADMIN'
            ? 'CENTRAL_GLOBAL'
            : user.assignments.assignedProvinceId,
        action: 'INMATE_ADMISSION_REGISTERED',
        targetResource: `pnap/provinces/${provinceId}/establishments/${establishmentId}/inmates/${inmateId}`,
        details: `Internamento registado: ${newInmate.profile.fullName} (${newInmate.profile.matricula}) em ${establishment.name}. Oficial: ${user.profile.fullName}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(201).json({
        success: true,
        inmate: newInmate,
        admission: admissionRecord
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao registar internamento.');
    }
  });

  // --- SAÍDAS E MODALIDADES (8 MODALIDADES INCLUINDO TRANSFERENCIA) ---
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
      notes
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

    if (
      modality === 'TRANSFERENCIA' &&
      (!isValidProvinceId(destinationProvinceId) || !String(destinationEstablishmentId || '').trim())
    ) {
      res.status(400).json({
        error: 'MISSING_TRANSFER_DESTINATION',
        message: 'Indique província e estabelecimento de destino válidos para transferência.'
      });
      return;
    }

    try {
      const db = deps.getDb();
      const inmateRef = db.collection('pnap_inmates').doc(inmateId);
      const inmateSnap = await inmateRef.get();
      if (!inmateSnap.exists) {
        res.status(404).json({
          error: 'INMATE_NOT_FOUND',
          message: 'Recluso não encontrado no Firestore.'
        });
        return;
      }

      const inmate = inmateSnap.data() as Inmate;

      if (!canOperateEstablishment(user, inmate.provinceId, inmate.establishmentId)) {
        await logBlockedAttempt(
          req,
          user,
          'BLOCKED_INMATE_EXIT_ATTEMPT',
          `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmateId}`,
          `Tentativa bloqueada de saída (${modality}) para ${inmate.profile.fullName} fora da jurisdição.`
        );
        res.status(403).json({
          error: 'FORBIDDEN',
          message: `Acesso Negado: Sem competência para registar saída na província ${inmate.provinceId.toUpperCase()}.`
        });
        return;
      }

      const existingReleaseSnap = await db
        .collection('pnap_releases')
        .where('inmateId', '==', inmateId)
        .get();

      if (inmate.currentStatus !== 'ATIVO' || !existingReleaseSnap.empty) {
        res.status(409).json({
          error: 'DUPLICATE_EXIT_BLOCKED',
          message: `Saída duplicada bloqueada: ${inmate.profile.fullName} já possui estado ${inmate.currentStatus}.`
        });
        return;
      }

      const resultingStatus: 'LIBERTADO' | 'FALECIDO' | 'EVADIDO' | 'TRANSFERIDO' =
        modality === 'OBITO'
          ? 'FALECIDO'
          : modality === 'EVASAO'
          ? 'EVADIDO'
          : modality === 'TRANSFERENCIA'
          ? 'TRANSFERIDO'
          : 'LIBERTADO';

      const nowIso = new Date().toISOString();

      await inmateRef.set({ ...inmate, currentStatus: resultingStatus });

      const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
      const indexSnap = await indexRef.get();
      if (indexSnap.exists) {
        const indexData = indexSnap.data() as NationalInmateIndexItem;
        await indexRef.set({
          ...indexData,
          custodyStatus: resultingStatus,
          lastUpdated: nowIso
        });
      }

      // Atualizar ocupação do estabelecimento sem alterar totalCapacity
      const estRef = db.collection('pnap_establishments').doc(inmate.establishmentId);
      const estSnap = await estRef.get();
      let unitLabel = inmate.establishmentId;
      if (estSnap.exists) {
        const est = estSnap.data() as EstablishmentProfile;
        unitLabel = `${est.name} (${est.establishmentId})`;
        const nextPavilions = est.pavilions?.map((pav) => ({
          ...pav,
          blocks: pav.blocks.map((blk) => ({
            ...blk,
            cells: blk.cells.map((cell) => {
              if (cell.cellId === inmate.cellId || cell.inmateIds.includes(inmateId)) {
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

        await estRef.set({
          ...est,
          activeInmatesCount: Math.max(0, (Number(est.activeInmatesCount) || 0) - 1),
          ...(nextPavilions ? { pavilions: nextPavilions } : {})
        });
      }

      // Atualizar estatísticas provinciais sem alterar totalCapacity
      const statsRef = db.collection('pnap_province_stats').doc(inmate.provinceId);
      const statsSnap = await statsRef.get();
      const prevStats = statsSnap.exists
        ? (statsSnap.data() as ProvinceStatistics)
        : emptyProvinceStats(inmate.provinceId);
      const nextActive = Math.max(0, prevStats.activeInmates - 1);
      const totalCap = prevStats.totalCapacity;
      const isPreventive =
        inmate.legal.legalStatus === 'PREVENTIVO' || inmate.legal.legalStatus === 'RECORRENTE';

      await statsRef.set({
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
          inmate.profile.gender === 'M' ? Math.max(0, prevStats.maleCount - 1) : prevStats.maleCount,
        femaleCount:
          inmate.profile.gender === 'F'
            ? Math.max(0, prevStats.femaleCount - 1)
            : prevStats.femaleCount
      });

      const releaseRecord: ReleaseRecord = {
        releaseId: `rel-${Date.now()}`,
        inmateId,
        fullName: inmate.profile.fullName,
        matricula: inmate.profile.matricula,
        provinceId: inmate.provinceId,
        establishmentId: inmate.establishmentId,
        alvaraNumber: String(documentNumber).trim(),
        judgeName: String(authorityOrDetail).trim(),
        releaseDate: String(exitDate).trim(),
        reason: modality,
        resultingStatus,
        ...(modality === 'TRANSFERENCIA'
          ? {
              destinationProvinceId,
              destinationEstablishmentId: String(destinationEstablishmentId).trim()
            }
          : {}),
        ...(notes ? { notes: String(notes).trim() } : {}),
        registeredBy: user.profile.fullName,
        registeredAt: nowIso
      };

      await db.collection('pnap_releases').doc(releaseRecord.releaseId).set(releaseRecord);

      if (modality === 'TRANSFERENCIA' && destinationProvinceId) {
        const transferRecord: TransferRecord = {
          transferId: `trf-${Date.now()}`,
          inmateId,
          inmateName: inmate.profile.fullName,
          matricula: inmate.profile.matricula,
          originProvinceId: inmate.provinceId,
          originEstablishmentId: inmate.establishmentId,
          destinationProvinceId,
          destinationEstablishmentId: String(destinationEstablishmentId).trim(),
          requestDate: String(exitDate).trim(),
          status: user.assignments.role === 'CENTRAL_ADMIN' ? 'AUTORIZADO_CENTRAL' : 'PENDENTE',
          justification: String(notes || '').trim() || `Guia ${releaseRecord.alvaraNumber}`,
          securityEscort: releaseRecord.judgeName,
          authorizedBy: user.profile.fullName
        };
        await db.collection('pnap_transfers').doc(transferRecord.transferId).set(transferRecord);
      }

      await deps.writeAuditLog({
        userId: user.uid,
        userName: user.profile.fullName,
        userRole: user.assignments.role,
        userScopeProvince:
          user.assignments.role === 'CENTRAL_ADMIN'
            ? 'CENTRAL_GLOBAL'
            : user.assignments.assignedProvinceId,
        action: 'INMATE_EXIT_REGISTERED',
        targetResource: `pnap/provinces/${inmate.provinceId}/establishments/${inmate.establishmentId}/inmates/${inmateId}`,
        details: `Saída registada [${modality} ➔ ${resultingStatus}]: ${inmate.profile.fullName} (${inmate.profile.matricula}) | Doc: ${releaseRecord.alvaraNumber} | Data: ${releaseRecord.releaseDate} | Unidade: ${unitLabel} | Oficial: ${user.profile.fullName}.`,
        ipAddress: extractClientIp(req),
        jurisdictionStatus: 'AUTHORIZED'
      });

      res.status(200).json({
        success: true,
        message: `Saída registada (${modality} ➔ ${resultingStatus}): ${inmate.profile.fullName}.`,
        record: releaseRecord
      });
    } catch (err) {
      handleServerError(err, res, 'Erro ao registar saída do recluso.');
    }
  });

  // --- TRANSIÇÃO PENAL (DETIDO/PREVENTIVO -> CONDENADO VIA FICHA ÚNICA) ---
  app.post(
    '/api/pnap/inmates/:inmateId/legal-transition',
    requirePnapAuth,
    async (req: AuthenticatedRequest, res) => {
      const user = req.pnapUser!;
      const inmateId = String(req.params.inmateId || '').trim();
      const {
        courtName,
        sentenceAcordaoNumber,
        sentenceDate,
        transitDate,
        totalSentenceYears,
        totalSentenceMonths,
        regime,
        judgeName,
        notes
      } = req.body || {};

      try {
        const db = deps.getDb();
        const inmateRef = db.collection('pnap_inmates').doc(inmateId);
        const inmateSnap = await inmateRef.get();
        if (!inmateSnap.exists) {
          res.status(404).json({
            error: 'INMATE_NOT_FOUND',
            message: 'Ficha Única do recluso não encontrada.'
          });
          return;
        }

        const targetInmate = inmateSnap.data() as Inmate;

        if (!canOperateEstablishment(user, targetInmate.provinceId, targetInmate.establishmentId)) {
          await logBlockedAttempt(
            req,
            user,
            'BLOCKED_LEGAL_TRANSITION_ATTEMPT',
            `pnap/provinces/${targetInmate.provinceId}/inmates/${inmateId}`,
            `Tentativa bloqueada de transição penal para ${targetInmate.profile.fullName} fora da jurisdição.`
          );
          res.status(403).json({
            error: 'FORBIDDEN',
            message: `Acesso Negado: Sem competência territorial na província ${targetInmate.provinceId.toUpperCase()}.`
          });
          return;
        }

        if (targetInmate.currentStatus !== 'ATIVO') {
          res.status(409).json({
            error: 'INMATE_NOT_ACTIVE',
            message: `Transição rejeitada: Recluso não está ATIVO (${targetInmate.currentStatus}).`
          });
          return;
        }

        if (
          targetInmate.legal.legalStatus !== 'PREVENTIVO' &&
          targetInmate.legal.legalStatus !== 'RECORRENTE'
        ) {
          res.status(409).json({
            error: 'ALREADY_CONVICTED',
            message: `Transição já efetuada: Ficha Única já consta como ${targetInmate.legal.legalStatus}.`
          });
          return;
        }

        const years = Math.max(0, Math.floor(Number(totalSentenceYears) || 0));
        const extraMonths = Math.max(0, Math.min(11, Math.floor(Number(totalSentenceMonths) || 0)));
        const totalMonths = years * 12 + extraMonths;

        if (
          !String(sentenceAcordaoNumber || '').trim() ||
          !String(transitDate || '').trim() ||
          totalMonths <= 0
        ) {
          res.status(400).json({
            error: 'INVALID_TRANSITION_DATA',
            message: 'Preencha N.º do Mandado/Acórdão, Data de Trânsito e Pena válida.'
          });
          return;
        }

        const transitIso = String(transitDate).trim();
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
          targetInmate.legal.legalStatus === 'RECORRENTE' ? 'RECORRENTE' : 'PREVENTIVO';
        const effectiveCourt = String(courtName || '').trim() || targetInmate.admission.courtName;

        const updatedInmate: Inmate = {
          ...targetInmate,
          legal: {
            ...targetInmate.legal,
            legalStatus: 'CONDENADO',
            totalSentenceYears: years,
            totalSentenceMonths: totalMonths,
            endOfSentenceDate: computedEnd,
            eligibleParoleDate: computedParole
          },
          documents: [
            {
              documentId: `doc-sent-${Date.now()}`,
              title: `Mandado / Sentença: ${String(sentenceAcordaoNumber).trim()}`,
              type: 'CERTIDAO_SENTENCA',
              uploadDate: transitIso,
              fileSize: 'Digital (PNAP)'
            },
            ...(targetInmate.documents || [])
          ]
        };

        await inmateRef.set(updatedInmate);

        const transitionRecord: LegalTransitionRecord = {
          transitionId: `trans-${Date.now()}`,
          inmateId,
          inmateName: targetInmate.profile.fullName,
          matricula: targetInmate.profile.matricula,
          provinceId: targetInmate.provinceId,
          establishmentId: targetInmate.establishmentId,
          previousStatus,
          newStatus: 'CONDENADO',
          courtName: effectiveCourt,
          sentenceAcordaoNumber: String(sentenceAcordaoNumber).trim(),
          sentenceDate: String(sentenceDate || '').trim() || transitIso,
          transitDate: transitIso,
          totalSentenceYears: years,
          totalSentenceMonths: extraMonths,
          regime: regime === 'SEMI_ABERTO' ? 'SEMI_ABERTO' : 'FECHADO',
          judgeName: String(judgeName || '').trim() || 'Magistrado Judicial',
          effectiveDate: new Date().toISOString().split('T')[0],
          registeredBy: user.profile.fullName,
          ...(notes ? { notes: String(notes).trim() } : {})
        };

        await db
          .collection('pnap_legal_transitions')
          .doc(transitionRecord.transitionId)
          .set(transitionRecord);

        const indexRef = db.collection('pnap_national_inmate_index').doc(inmateId);
        const indexSnap = await indexRef.get();
        if (indexSnap.exists) {
          const indexData = indexSnap.data() as NationalInmateIndexItem;
          await indexRef.set({
            ...indexData,
            legalStatus: 'CONDENADO',
            lastUpdated: new Date().toISOString()
          });
        }

        const statsRef = db.collection('pnap_province_stats').doc(targetInmate.provinceId);
        const statsSnap = await statsRef.get();
        if (statsSnap.exists) {
          const prevStats = statsSnap.data() as ProvinceStatistics;
          await statsRef.set({
            ...prevStats,
            preventiveCount: Math.max(0, prevStats.preventiveCount - 1),
            convictedCount: prevStats.convictedCount + 1
          });
        }

        await deps.writeAuditLog({
          userId: user.uid,
          userName: user.profile.fullName,
          userRole: user.assignments.role,
          userScopeProvince:
            user.assignments.role === 'CENTRAL_ADMIN'
              ? 'CENTRAL_GLOBAL'
              : user.assignments.assignedProvinceId,
          action: 'INMATE_LEGAL_TRANSITION',
          targetResource: `pnap/provinces/${targetInmate.provinceId}/inmates/${inmateId}`,
          details: `Ficha Única Atualizada [${previousStatus} ➔ CONDENADO]: ${targetInmate.profile.fullName} (${targetInmate.profile.matricula}) · Pena: ${years}a ${extraMonths}m · Doc: ${transitionRecord.sentenceAcordaoNumber} · Término: ${computedEnd}.`,
          ipAddress: extractClientIp(req),
          jurisdictionStatus: 'AUTHORIZED'
        });

        res.status(200).json({
          success: true,
          message: `Ficha Única atualizada: ${targetInmate.profile.fullName} convertido para CONDENADO.`,
          record: transitionRecord
        });
      } catch (err) {
        handleServerError(err, res, 'Erro ao registar transição penal.');
      }
    }
  );

  // --- TRANSFERÊNCIA FÍSICA ---
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
      let snap;
      if (user.assignments.role === 'CENTRAL_ADMIN') {
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
