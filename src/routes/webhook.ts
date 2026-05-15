import express, { Router, type Request } from "express";
import { setOrder, getTokensForAnyKey, type CandidateKey } from "../store";
import { sendPushToTokens } from "../services/push";

export const webhookRouter = Router();

webhookRouter.post(
  "/loginext",
  express.json(),
  async (req: Request, res, next) => {
    try {
      const webhookSecret = req.get("x-webhook-secret");
      const expectedSecret = process.env.LOGINEXT_WEBHOOK_SECRET;
      console.log("=== LOGINEXT INCOMING ===");
      console.log("All headers:", JSON.stringify(req.headers, null, 2));
      console.log("Body:", JSON.stringify(req.body, null, 2));
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

// Priority order for matching against registered FCM tokens.
// orderReferenceId (UUID) is most unique; phone is last-resort fallback.
function buildCandidateKeys(payload: Record<string, unknown>): CandidateKey[] {
  const keys: CandidateKey[] = [];
  const push = (raw: unknown, kind: CandidateKey["kind"]) => {
    if (raw == null) return;
    const s = String(raw).trim();
    if (s) keys.push({ raw: s, kind });
  };
  push(payload.orderReferenceId, "uuid");
  push(payload.orderNo, "digits");                       // matches Shopify order_number from iOS
  push(payload.deliverAccountCode, "customer_id");        // matches iOS shopifyCustomerId (full digits, no truncation)
  push(payload.awbNumber, "digits");
  push(payload.phoneNumber, "digits");                    // fallback — note: this is rider phone in some payloads
  return keys;
}

async function processWebhook(body: unknown) {
  try {
    if (!body || typeof body !== "object") return;
    const payload = body as Record<string, unknown>;

    const candidateKeys = buildCandidateKeys(payload);
    const orderStatus = String(payload.orderStatus ?? "");

    if (!candidateKeys.length) {
      console.warn("Webhook has no recognizable order keys; skipping");
      return;
    }

    console.log(
      `Processing webhook status=${orderStatus} candidates=[${candidateKeys
        .map((k) => `${k.kind}:${k.raw}`)
        .join(", ")}]`
    );

    const lat = Number(payload.deliverLatitude ?? payload.latitude);
    const lng = Number(payload.deliverLongitude ?? payload.longitude);

    const orderState = {
      orderId: candidateKeys[0]?.raw ?? "",
      status: orderStatus,
      deliveryAgentName: payload.deliveryMediumName != null ? String(payload.deliveryMediumName) : null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      estimatedDeliveryTime: payload.endTimeWindow != null ? String(payload.endTimeWindow) : null,
      branchName: payload.branchName != null ? String(payload.branchName) : null,
      orderNo: payload.orderNo != null ? String(payload.orderNo) : null,
      awbNumber: payload.awbNumber != null ? String(payload.awbNumber) : null,
      notificationType: payload.notificationType != null ? String(payload.notificationType) : null,
      reason: payload.reason != null ? String(payload.reason) : null,
      updatedAt: new Date().toISOString()
    };
    setOrder(orderState, candidateKeys);

    const { tokens, matchedKey, matchedRaw, matchedKind } = await getTokensForAnyKey(candidateKeys);

    console.log("=== WEBHOOK MATCH ===");
    console.log("Tried keys:", candidateKeys.map((k) => k.raw));
    console.log("Matched via:", matchedKey ?? "none");
    console.log("Tokens found:", tokens.length);

    if (matchedKey) {
      console.log(
        `Push target: kind=${matchedKind} raw=${matchedRaw} canonical=${matchedKey} tokens=${tokens.length}`
      );
      await sendPushToTokens(tokens, orderState.orderId, orderStatus);
    } else {
      console.log("No tokens registered for any candidate key — push skipped");
    }
  } catch (err) {
    console.error("Webhook async processing error", err);
  }
}
