import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { PnapUser, ProvinceId, UserRole } from '../src/types/pnap';

export const RDPA_2024_PROVINCES: readonly ProvinceId[] = [
  'luanda',
  'icolo_e_bengo',
  'bengo',
  'cuanza_norte',
  'cuanza_sul',
  'malanje',
  'uige',
  'zaire',
  'cabinda',
  'lunda_norte',
  'lunda_sul',
  'benguela',
  'huambo',
  'bie',
  'moxico',
  'moxico_leste',
  'huila',
  'namibe',
  'cunene',
  'cuando',
  'cubango'
] as const;

const VALID_ROLES: readonly UserRole[] = [
  'CENTRAL_ADMIN',
  'PROVINCIAL_COMMAND',
  'ESTABLISHMENT_DIRECTOR',
  'OPERATIONAL_OFFICER',
  'PENAL_CONTROL',
  'HEALTH_SPECIALIST',
  'REHABILITATION',
  'GATE_SECURITY',
  'AUDITOR_INSPECTOR'
] as const;

export function isValidProvinceId(value: unknown): value is ProvinceId {
  return typeof value === 'string' && (RDPA_2024_PROVINCES as readonly string[]).includes(value);
}

export function isValidUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value);
}

export function canProvision(user: PnapUser): boolean {
  return user.assignments.role === 'CENTRAL_ADMIN';
}

export function canOperateProvince(user: PnapUser, provinceId: string): boolean {
  if (!isValidProvinceId(provinceId)) return false;
  if (user.assignments.role === 'CENTRAL_ADMIN') return true;
  if (user.assignments.role === 'AUDITOR_INSPECTOR' && user.assignments.assignedProvinceId === 'all') {
    return true;
  }
  return user.assignments.assignedProvinceId === provinceId;
}

export function canOperateEstablishment(
  user: PnapUser,
  provinceId: string,
  establishmentId: string
): boolean {
  if (!canOperateProvince(user, provinceId)) return false;
  if (user.assignments.role === 'AUDITOR_INSPECTOR') {
    return false;
  }
  if (user.assignments.role === 'CENTRAL_ADMIN' || user.assignments.role === 'PROVINCIAL_COMMAND') {
    return true;
  }
  if (!user.assignments.assignedEstablishmentId) {
    return true;
  }
  return user.assignments.assignedEstablishmentId === establishmentId;
}

export function canAccessClinicalRecords(
  user: PnapUser,
  provinceId: string,
  establishmentId: string
): boolean {
  if (user.assignments.role !== 'HEALTH_SPECIALIST') return false;
  if (user.assignments.assignedProvinceId === 'all') return true;
  if (user.assignments.assignedProvinceId !== provinceId) return false;
  if (!user.assignments.assignedEstablishmentId) return true;
  return user.assignments.assignedEstablishmentId === establishmentId;
}

export function canManagePenalControl(
  user: PnapUser,
  provinceId: string,
  establishmentId: string
): boolean {
  const allowed: UserRole[] = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'OPERATIONAL_OFFICER',
    'PENAL_CONTROL'
  ];
  if (!allowed.includes(user.assignments.role)) return false;
  return canOperateEstablishment(user, provinceId, establishmentId);
}

export function canManageRehabilitation(
  user: PnapUser,
  provinceId: string,
  establishmentId: string
): boolean {
  const allowed: UserRole[] = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'REHABILITATION'
  ];
  if (!allowed.includes(user.assignments.role)) return false;
  return canOperateEstablishment(user, provinceId, establishmentId);
}

export function canRegisterPhysicalMovement(
  user: PnapUser,
  provinceId: string,
  establishmentId: string
): boolean {
  const allowed: UserRole[] = [
    'CENTRAL_ADMIN',
    'PROVINCIAL_COMMAND',
    'ESTABLISHMENT_DIRECTOR',
    'OPERATIONAL_OFFICER',
    'PENAL_CONTROL',
    'GATE_SECURITY'
  ];
  if (!allowed.includes(user.assignments.role)) return false;
  return canOperateEstablishment(user, provinceId, establishmentId);
}

export function canAuthorizePhysicalTransfer(user: PnapUser, originProvinceId: string): boolean {
  if (!isValidProvinceId(originProvinceId)) return false;
  if (user.assignments.role === 'CENTRAL_ADMIN') return true;
  if (user.assignments.role === 'AUDITOR_INSPECTOR' || user.assignments.role === 'HEALTH_SPECIALIST') {
    return false;
  }
  return user.assignments.assignedProvinceId === originProvinceId;
}

export function canViewAuditLogs(user: PnapUser): boolean {
  return (
    user.assignments.role === 'CENTRAL_ADMIN' ||
    user.assignments.role === 'PROVINCIAL_COMMAND' ||
    user.assignments.role === 'AUDITOR_INSPECTOR'
  );
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || 'unknown';
}

export interface AuthTokenVerifier {
  verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<DecodedIdToken>;
}

export interface UserDirectoryReader {
  getPnapUserByUid(uid: string): Promise<PnapUser | null>;
}

export type AuditLoggerFn = (entry: {
  userId: string;
  userName: string;
  userRole: UserRole;
  userScopeProvince: string;
  action: string;
  targetResource: string;
  details: string;
  ipAddress: string;
  jurisdictionStatus: 'AUTHORIZED' | 'CROSS_PROVINCE_QUERY' | 'BLOCKED_ATTEMPT';
}) => Promise<unknown>;

export interface AuthenticatedRequest extends Request {
  pnapUser?: PnapUser;
  authToken?: DecodedIdToken;
}

export function createRequirePnapAuth(deps: {
  getVerifier: () => AuthTokenVerifier;
  getUserDirectory: () => UserDirectoryReader;
  writeAuditLog: AuditLoggerFn;
}) {
  return async function requirePnapAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Token de autenticação Firebase ausente ou mal formatado.'
      });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Token de autenticação vazio.'
      });
      return;
    }

    let decoded: DecodedIdToken;
    try {
      const verifier = deps.getVerifier();
      decoded = await verifier.verifyIdToken(token, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'TOKEN_VERIFICATION_FAILED';
      if (message === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
        res.status(503).json({
          error: 'FIREBASE_ADMIN_NOT_CONFIGURED',
          message: 'Credenciais do Firebase Admin SDK não configuradas no servidor.'
        });
        return;
      }
      res.status(401).json({
        error: 'INVALID_OR_REVOKED_TOKEN',
        message: 'Sessão inválida, expirada ou revogada pelo Firebase Authentication.'
      });
      return;
    }

    let pnapUser: PnapUser | null = null;
    try {
      const directory = deps.getUserDirectory();
      pnapUser = await directory.getPnapUserByUid(decoded.uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'USER_LOOKUP_FAILED';
      if (message === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
        res.status(503).json({
          error: 'FIREBASE_ADMIN_NOT_CONFIGURED',
          message: 'Firestore indisponível para validação de credenciais RBAC.'
        });
        return;
      }
      res.status(500).json({
        error: 'RBAC_DIRECTORY_ERROR',
        message: 'Falha ao consultar o perfil oficial do utilizador no Firestore.'
      });
      return;
    }

    if (!pnapUser || !pnapUser.assignments || !isValidUserRole(pnapUser.assignments.role)) {
      res.status(403).json({
        error: 'USER_NOT_PROVISIONED_IN_PNAP',
        message: 'Utilizador autenticado não possui atribuição oficial ativa na estrutura PNAP.'
      });
      return;
    }

    if (pnapUser.profile?.status !== 'active') {
      await deps
        .writeAuditLog({
          userId: decoded.uid,
          userName: pnapUser.profile?.fullName || decoded.email || decoded.uid,
          userRole: pnapUser.assignments.role,
          userScopeProvince: pnapUser.assignments.assignedProvinceId || 'unknown',
          action: 'BLOCKED_SUSPENDED_ACCOUNT',
          targetResource: req.originalUrl,
          details: 'Tentativa de acesso com conta PNAP suspensa ou inativa.',
          ipAddress: extractClientIp(req),
          jurisdictionStatus: 'BLOCKED_ATTEMPT'
        })
        .catch(() => undefined);

      res.status(403).json({
        error: 'ACCOUNT_SUSPENDED',
        message: 'Acesso negado: conta PNAP suspensa.'
      });
      return;
    }

    const isGlobalScopeAllowed =
      pnapUser.assignments.role === 'CENTRAL_ADMIN' ||
      (pnapUser.assignments.role === 'AUDITOR_INSPECTOR' &&
        pnapUser.assignments.assignedProvinceId === 'all');

    if (
      !isGlobalScopeAllowed &&
      !isValidProvinceId(pnapUser.assignments.assignedProvinceId)
    ) {
      res.status(403).json({
        error: 'INVALID_PROVINCE_ASSIGNMENT',
        message: 'Atribuição provincial inválida no perfil oficial do utilizador.'
      });
      return;
    }

    req.authToken = decoded;
    req.pnapUser = pnapUser;
    next();
  };
}
