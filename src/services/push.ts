import * as admin from "firebase-admin";
import { ensureFirebaseInitialized } from "../firebase-admin";
import { removeInvalidTokens } from "../store";

const statusToNotification: Record<string, { title: string; body: string }> = {
  PICKED_UP: { title: "Order picked up", body: "Your order is on the way!" },
  OUT_FOR_DELIVERY: { title: "Out for delivery", body: "Your rider is nearby" },
  DELIVERED: { title: "Delivered!", body: "Your order has arrived" },
  FAILED: { title: "Delivery failed", body: "We could not deliver your order" },
  CANCELLED: { title: "Order cancelled", body: "Your order has been cancelled" },
  IN_TRANSIT: { title: "In transit", body: "Your order is moving" }
};

export async function testFirebasePush(token: string): Promise<object> {
  if (!ensureFirebaseInitialized()) {
    return { error: "Firebase not initialized" };
  }
  try {
    return await admin.messaging().sendEachForMulticast({
      tokens: [token],
      notification: { title: "Test", body: "Push test from Railway" },
      data: { test: "true" }
    });
  } catch (err) {
    return { error: String(err) };
  }
}

export async function sendPushToTokens(tokens: string[], orderId: string, status: string) {
  if (!tokens.length) {
    console.log(`No tokens to push for orderId=${orderId}`);
    return;
  }
  if (!ensureFirebaseInitialized()) {
    console.error("Firebase not initialized, skipping push.");
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
    console.log(
      `FCM multicast orderId=${orderId} status=${status} success=${result.successCount} failure=${result.failureCount}`
    );

    const invalid: string[] = [];
    result.responses.forEach((r, idx) => {
      if (r.success) return;
      if (r.error?.code === "messaging/registration-token-not-registered") {
        invalid.push(tokens[idx]);
      }
    });
    if (invalid.length) {
      await removeInvalidTokens(invalid);
    }
  } catch (err) {
    console.error("FCM send error:", err);
  }
}
