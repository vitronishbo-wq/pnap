import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface FirebaseAdminServices {
  app: App;
  auth: Auth;
  db: Firestore;
}

export function getFirebaseAdminEnvStatus() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || '';
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim() || '';
  const databaseId = process.env.FIREBASE_DATABASE_ID?.trim() || '';

  const configured = Boolean(projectId && clientEmail && privateKeyRaw);
  return {
    configured,
    projectIdPresent: Boolean(projectId),
    clientEmailPresent: Boolean(clientEmail),
    privateKeyPresent: Boolean(privateKeyRaw),
    databaseId: databaseId || '(default)'
  };
}

let cachedServices: FirebaseAdminServices | null = null;

export function getFirebaseAdminServices(): FirebaseAdminServices {
  if (cachedServices) {
    return cachedServices;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error('FIREBASE_ADMIN_NOT_CONFIGURED');
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

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
