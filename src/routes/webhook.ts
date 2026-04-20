import crypto from "crypto";
import express, { Router, type Request } from "express";
import { setOrder } from "../store";
import { sendPushToOrder } from "../services/push";

export const webhookRouter = Router();

type AuthedRawBodyRequest = Request & { body: Buffer };

function safeEqualHex(aHex: string, bHex: string) {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

webhookRouter.post(
  "/loginext",
  express.raw({ type: "application/json" }),
  async (req: AuthedRawBodyRequest, res, next) => {
    try {
      const signature = (req.get("x-loginext-signature") ?? "").trim();
      const secret = process.env.LOGINEXT_WEBHOOK_SECRET ?? "";
      if (!signature || !secret) return res.sendStatus(401);

      const computed = crypto
        .createHmac("sha256", secret)
        .update(req.body)
        .digest("hex");

      if (!safeEqualHex(signature, computed)) return res.sendStatus(401);

      res.sendStatus(200);

      setImmediate(() => processWebhook(req.body));
    } catch (err) {
      next(err);
    }
  }
);

async function processWebhook(body: Buffer) {
  try {
    const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;

    const orderId = String(payload.orderId ?? "");
    const orderStatus = String(payload.orderStatus ?? "");
    if (!orderId) return;

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

    await sendPushToOrder(orderId, orderStatus);
  } catch (err) {
    console.error("Webhook async processing error", err);
  }
}

