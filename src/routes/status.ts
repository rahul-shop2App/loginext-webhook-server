import { Router } from "express";
import { getOrder, registerTokensForKeys, type CandidateKey } from "../store";

export const statusRouter = Router();

statusRouter.get("/order/:orderId", (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json(order);
});

statusRouter.post("/register-token", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fcmToken = String(body.fcmToken ?? "").trim();
  if (!fcmToken) {
    return res.status(400).json({ error: "fcmToken is required" });
  }

  const keys: CandidateKey[] = [];
  const push = (raw: unknown, kind: CandidateKey["kind"]) => {
    if (raw == null) return;
    const s = String(raw).trim();
    if (s) keys.push({ raw: s, kind });
  };

  push(body.orderReferenceId, "uuid");
  push(body.shopifyOrderId, "raw");
  push(body.shopifyOrderName, "raw");
  push(body.shopifyOrderNumber, "digits"); // numeric Shopify order number — matches LogiNext orderNo
  push(body.phone, "digits");
  // Legacy: old iOS clients send { orderId, fcmToken } where orderId is the customer phone.
  push(body.orderId, "digits");

  if (!keys.length) {
    return res.status(400).json({
      error:
        "At least one identifier (orderReferenceId, shopifyOrderId, shopifyOrderName, shopifyOrderNumber, phone, or orderId) is required"
    });
  }

  console.log(
    "Token registration request. Raw keys:",
    keys.map((k) => `${k.kind}:${k.raw}`).join(", ")
  );

  const registered = await registerTokensForKeys(keys, fcmToken);
  return res.status(200).json({ ok: true, keys: registered });
});
