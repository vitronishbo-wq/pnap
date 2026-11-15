import type { Firestore } from 'firebase-admin/firestore';
import type { AuditLogEvent, UserRole } from '../src/types/pnap';

export interface AuditInput {
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

export function createFirestoreAuditLogger(getDb: () => Firestore) {
  return async function writeAuditLog(entry: AuditInput): Promise<AuditLogEvent> {
    const nowIso = new Date().toISOString();
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: AuditLogEvent = {
      eventId,
      timestamp: nowIso,
      userId: entry.userId,
      userName: entry.userName,
      userRole: entry.userRole,
      userScopeProvince: entry.userScopeProvince,
      action: entry.action,
      targetResource: entry.targetResource,
      details: entry.details,
      ipAddress: entry.ipAddress,
      jurisdictionStatus: entry.jurisdictionStatus
    };

    const db = getDb();
    await db.collection('pnap_audit_logs').doc(eventId).set(record);
    return record;
  };
}
