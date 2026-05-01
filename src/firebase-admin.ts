import * as admin from "firebase-admin";

let firebaseReady = false;
let firebaseInitError: unknown = null;

export function ensureFirebaseInitialized(): boolean {
  if (firebaseReady) return true;
  if (firebaseInitError) return false;

  try {
    function getServiceAccount() {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const parsed = JSON.parse(raw);
        if (parsed.private_key) {
          parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
        }
        return parsed;
      }
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        throw new Error(
          "Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    }

    const serviceAccount = getServiceAccount();
    if (admin.apps.length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    firebaseReady = true;
    return true;
  } catch (err) {
    firebaseInitError = err;
    console.error("Failed to initialize Firebase Admin SDK", err);
    return false;
  }
}

export function getFirestoreOrNull(): admin.firestore.Firestore | null {
  if (!firebaseReady) return null;
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}
