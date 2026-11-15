import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface FirebaseAdminServices {
  app: App;
  auth: Auth;
  db: Firestore;
}

export function normalizePrivateKey(rawKey: string): string {
  return rawKey
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function getFirebaseAdminEnvStatus() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() || '';
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || '';
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim() || '';
  const databaseId = process.env.FIREBASE_DATABASE_ID?.trim() || '';

  const configured = Boolean(
    serviceAccountJson || (projectId && clientEmail && privateKeyRaw)
  );
  return {
    configured,
    projectIdPresent: Boolean(projectId || serviceAccountJson),
    clientEmailPresent: Boolean(clientEmail || serviceAccountJson),
    privateKeyPresent: Boolean(privateKeyRaw || serviceAccountJson),
    databaseId: databaseId || '(default)'
  };
}

let cachedServices: FirebaseAdminServices | null = null;

export function getFirebaseAdminServices(): FirebaseAdminServices {
  if (cachedServices) {
    return cachedServices;
  }

  let projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();

  let privateKey = privateKeyRaw ? normalizePrivateKey(privateKeyRaw) : '';

  if ((!projectId || !clientEmail || !privateKey) && serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      projectId = projectId || parsed.project_id?.trim();
      clientEmail = clientEmail || parsed.client_email?.trim();
      privateKey = privateKey || (parsed.private_key ? normalizePrivateKey(parsed.private_key) : '');
    } catch {
      throw new Error('FIREBASE_ADMIN_INVALID_JSON');
    }
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_ADMIN_NOT_CONFIGURED');
  }

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey
          }),
          projectId
        });

  const auth = getAuth(app);
  const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

  cachedServices = { app, auth, db };
  return cachedServices;
}

export async function checkFirestoreConnection(dbInstance?: Firestore): Promise<{
  connected: boolean;
  collectionsCount?: number;
  error?: string;
}> {
  try {
    const db = dbInstance ?? getFirebaseAdminServices().db;
    const collections = await db.listCollections();
    return {
      connected: true,
      collectionsCount: collections.length
    };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : 'FIRESTORE_CONNECTION_FAILED'
    };
  }
}
