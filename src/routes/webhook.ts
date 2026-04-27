import express, { Router, type Request } from "express";
import { getFcmTokens, setOrder } from "../store";
import { sendPushToOrder } from "../services/push";

export const webhookRouter = Router();

webhookRouter.post(
  "/loginext",
  express.json(),
  async (req: Request, res, next) => {
    try {
      const webhookSecret = req.get("x-webhook-secret");
      const expectedSecret = process.env.LOGINEXT_WEBHOOK_SECRET;
      if (!webhookSecret || !expectedSecret || webhookSecret !== expectedSecret) {
        return res.sendStatus(401);
      }

      res.sendStatus(200);

      setImmediate(() => processWebhook(req.body));
    } catch (err) {
      next(err);
    }
  }
);

async function processWebhook(body: unknown) {
  try {
    if (!body || typeof body !== "object") return;
    const payload = body as Record<string, unknown>;

    const orderId = String(payload.orderId ?? "");
    const orderStatus = String(payload.orderStatus ?? "");
    if (!orderId) return;
    console.log("Processing webhook for orderId:", orderId, "status:", orderStatus);

    const latitudeRaw = payload.latitude;
    const longitudeRaw = payload.longitude;
    const latitude =
      typeof latitudeRaw === "number" ? latitudeRaw : latitudeRaw ? Number(latitudeRaw) : undefined;
    const longitude =
      typeof longitudeRaw === "number" ? longitudeRaw : longitudeRaw ? Number(longitudeRaw) : undefined;

    const deliveryAgentName =
      payload.deliveryAgentName != null ? String(payload.deliveryAgentName) : undefined;
    const estimatedDeliveryTime =
      payload.estimatedDeliveryTime != null ? String(payload.estimatedDeliveryTime) : undefined;

    setOrder({
      orderId,
      status: orderStatus,
      latitude,
      longitude,
      deliveryAgentName,
      estimatedDeliveryTime,
      updatedAt: new Date().toISOString()
    });

    const tokens = getFcmTokens(orderId);
    console.log("FCM tokens found:", tokens.length);
    await sendPushToOrder(orderId, orderStatus);
    console.log("Push function called");
  } catch (err) {
    console.error("Webhook async processing error", err);
  }
}

