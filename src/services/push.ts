import * as admin from "firebase-admin";
import path from "path";
import { getFcmTokens, removeFcmTokens } from "../store";

let firebaseReady = false;
let firebaseInitError: unknown = null;

function ensureFirebaseInitialized() {
  if (firebaseReady) return true;
  if (firebaseInitError) return false;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!serviceAccountPath) {
    firebaseInitError = new Error("FIREBASE_SERVICE_ACCOUNT_PATH is missing (set it in your .env)");
    console.warn(String(firebaseInitError));
    return false;
  }

  try {
    const resolvedPath = path.isAbsolute(serviceAccountPath)
      ? serviceAccountPath
      : path.join(process.cwd(), serviceAccountPath);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(resolvedPath);
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

const statusToNotification: Record<string, { title: string; body: string }> = {
  PICKED_UP: { title: "Order picked up", body: "Your order is on the way!" },
  OUT_FOR_DELIVERY: { title: "Out for delivery", body: "Your rider is nearby" },
  DELIVERED: { title: "Delivered!", body: "Your order has arrived" },
  FAILED: { title: "Delivery failed", body: "We could not deliver your order" },
  CANCELLED: { title: "Order cancelled", body: "Your order has been cancelled" },
  IN_TRANSIT: { title: "In transit", body: "Your order is moving" }
};

export async function sendPushToOrder(orderId: string, status: string) {
  if (!ensureFirebaseInitialized()) return;

  const tokens = getFcmTokens(orderId);
  if (!tokens.length) {
    console.log(`No FCM tokens registered for orderId=${orderId}`);
    return;
  }

  const notification =
    statusToNotification[status] ?? { title: "Order update", body: `Status updated: ${status}` };

  try {
    const resp = await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data: { orderId, status }
    });

    console.log(
      `FCM multicast for orderId=${orderId} status=${status} success=${resp.successCount} failure=${resp.failureCount}`
    );

    const invalidTokens: string[] = [];
    resp.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error?.code ?? "";
      if (code === "messaging/registration-token-not-registered") {
        invalidTokens.push(tokens[idx]);
      }
    });

    if (invalidTokens.length) {
      removeFcmTokens(orderId, invalidTokens);
      console.log(`Removed ${invalidTokens.length} invalid FCM tokens for orderId=${orderId}`);
    }
  } catch (err) {
    console.error("FCM send error", err);
  }
}

