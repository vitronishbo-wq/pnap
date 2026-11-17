import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  multiFactor,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { PnapUser } from './types/pnap';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function reauthenticateWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'login' });
  if (!auth.currentUser) {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
  const result = await reauthenticateWithPopup(auth.currentUser, provider);
  return result.user;
}

export function getEnrolledMfaInfo(user: User | null): { count: number; factors: Array<{ uid: string; factorId: string; displayName?: string | null }> } {
  if (!user) return { count: 0, factors: [] };
  try {
    const enrolled = multiFactor(user).enrolledFactors || [];
    return {
      count: enrolled.length,
      factors: enrolled.map((f) => ({
        uid: f.uid,
        factorId: f.factorId,
        displayName: f.displayName
      }))
    };
  } catch {
    return { count: 0, factors: [] };
  }
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function fetchAuthenticatedPnapUser(uid: string): Promise<PnapUser | null> {
  const path = `pnap_users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'pnap_users', uid));
    if (!snap.exists()) return null;
    return snap.data() as PnapUser;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function checkAdminGateFirestore(uid: string): Promise<{
  hasAdminDoc: boolean;
  adminRole?: string;
  pnapUser: PnapUser | null;
}> {
  const adminPath = `pnap_admins/${uid}`;
  let hasAdminDoc = false;
  let adminRole: string | undefined;

  try {
    const adminSnap = await getDoc(doc(db, 'pnap_admins', uid));
    if (adminSnap.exists()) {
      hasAdminDoc = true;
      const data = adminSnap.data() as { role?: string };
      adminRole = data.role;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, adminPath);
  }

  const pnapUser = await fetchAuthenticatedPnapUser(uid);
  return {
    hasAdminDoc,
    adminRole,
    pnapUser
  };
}

