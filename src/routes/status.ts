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

  const asStr = (v: unknown) =>
    v == null ? undefined : String(v).trim() || undefined;

  const shopifyCustomerId = asStr(body.shopifyCustomerId);
  const phone = asStr(body.phone);
  const shopifyOrderNumber = asStr(body.shopifyOrderNumber);

  const keys: CandidateKey[] = [];
  const push = (raw: unknown, kind: CandidateKey["kind"]) => {
    if (raw == null) return;
    const s = String(raw).trim();
    if (s) keys.push({ raw: s, kind });
  };

  push(body.orderReferenceId, "uuid");
  push(body.shopifyOrderId, "raw");
  push(body.shopifyOrderName, "raw");
  push(shopifyOrderNumber, "digits"); // numeric Shopify order number — matches LogiNext orderNo
  push(shopifyCustomerId, "customer_id"); // matches LogiNext deliverAccountCode (full 13-digit ID, no truncation)
  push(phone, "digits");
  // Legacy: old iOS clients send { orderId, fcmToken } where orderId is the customer phone.
  push(body.orderId, "digits");

  if (!keys.length) {
    return res.status(400).json({
      error:
        "At least one identifier (orderReferenceId, shopifyOrderId, shopifyOrderName, shopifyOrderNumber, shopifyCustomerId, phone, or orderId) is required"
    });
  }

  const canonicalKeys = await registerTokensForKeys(keys, fcmToken);

  console.log("=== TOKEN REGISTRATION ===");
  console.log("shopifyCustomerId:", shopifyCustomerId ?? "not provided");
  console.log("phone:", phone ?? "not provided");
  console.log("shopifyOrderNumber:", shopifyOrderNumber ?? "not provided");
  console.log("Final keys registered:", canonicalKeys);
  console.log("FCM token:", fcmToken.substring(0, 30) + "...");

  return res.status(200).json({ ok: true, keys: canonicalKeys });
});
