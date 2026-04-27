import * as admin from "firebase-admin";
import { getFcmTokens, removeFcmTokens } from "../store";

let firebaseReady = false;
let firebaseInitError: unknown = null;

function ensureFirebaseInitialized() {
  if (firebaseReady) return true;
  if (firebaseInitError) return false;

  try {
    function getServiceAccount() {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const parsed = JSON.parse(raw);
        // Fix escaped newlines in private_key
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
    if (
      err instanceof Error &&
      err.message.includes("Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON")
    ) {
      firebaseInitError = new Error(
        "Firebase credentials missing. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
      );
      console.warn(String(firebaseInitError));
      return false;
    }
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
  console.log("sendPushToOrder called for orderId:", orderId);
  if (!ensureFirebaseInitialized()) return;

  const tokens = getFcmTokens(orderId);
  console.log("Tokens:", tokens);
  if (!tokens.length) {
    console.log(`No FCM tokens registered for orderId=${orderId}`);
    return;
  }

  const notification =
    statusToNotification[status] ?? { title: "Order update", body: `Status updated: ${status}` };

  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data: { orderId, status }
    });
    console.log("Firebase send result:", JSON.stringify(result));

    console.log(
      `FCM multicast for orderId=${orderId} status=${status} success=${result.successCount} failure=${result.failureCount}`
    );

    const invalidTokens: string[] = [];
    result.responses.forEach((r, idx) => {
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
  } catch (err: unknown) {
    console.error("FCM send error (full object):", err);
  }
}

