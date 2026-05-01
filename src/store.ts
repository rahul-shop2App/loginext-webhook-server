import { getFirestoreOrNull } from "./firebase-admin";

export type OrderState = {
  orderId: string;
  status: string;
  latitude?: number;
  longitude?: number;
  deliveryAgentName?: string;
  estimatedDeliveryTime?: string;
  updatedAt: string;
};

export type KeyKind = "uuid" | "digits" | "raw";
export type CandidateKey = { raw: string; kind: KeyKind };

const orders = new Map<string, OrderState>();
const tokenCache = new Map<string, Set<string>>();

// Canonical form per kind:
// - "digits": last 9 digits (matches phone, awbNumber, deliverAccountCode, orderNo across formats)
// - "uuid":   lowercase, strip non-alphanumerics (so dashed and undashed UUIDs collide)
// - "raw":    trim + lowercase (shopify order names like "#1234", GIDs)
export function canonicalize(raw: string, kind: KeyKind): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (kind === "digits") {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 9 ? digits.slice(-9) : digits;
  }
  if (kind === "uuid") {
    return trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  return trimmed.toLowerCase();
}

function dedupedCanonical(keys: CandidateKey[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const c = canonicalize(k.raw, k.kind);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export function setOrder(orderState: OrderState, additionalKeys: CandidateKey[] = []) {
  orders.set(orderState.orderId, orderState);
  for (const k of dedupedCanonical(additionalKeys)) {
    if (k !== orderState.orderId) {
      orders.set(k, orderState);
    }
  }
}

export function getOrder(orderId: string): OrderState | undefined {
  return (
    orders.get(orderId) ??
    orders.get(canonicalize(orderId, "digits")) ??
    orders.get(canonicalize(orderId, "uuid")) ??
    orders.get(canonicalize(orderId, "raw"))
  );
}

export async function registerTokensForKeys(keys: CandidateKey[], token: string): Promise<string[]> {
  const canonicalKeys = dedupedCanonical(keys);
  if (!canonicalKeys.length) return [];

  const db = getFirestoreOrNull();
  for (const key of canonicalKeys) {
    const set = tokenCache.get(key) ?? new Set<string>();
    set.add(token);
    tokenCache.set(key, set);

    if (db) {
      try {
        await db
          .collection("fcm_tokens")
          .doc(key)
          .set({ tokens: Array.from(set), updatedAt: new Date().toISOString() });
      } catch (err) {
        console.error("Failed to persist FCM token to Firestore:", err);
      }
    }
  }
  console.log("Registered FCM token under canonical keys:", canonicalKeys);
  return canonicalKeys;
}

export type TokenLookup = {
  tokens: string[];
  matchedKey?: string;
  matchedRaw?: string;
  matchedKind?: KeyKind;
};

export async function getTokensForAnyKey(keys: CandidateKey[]): Promise<TokenLookup> {
  const db = getFirestoreOrNull();
  for (const k of keys) {
    const canonical = canonicalize(k.raw, k.kind);
    if (!canonical) continue;

    if (tokenCache.has(canonical)) {
      const tokens = Array.from(tokenCache.get(canonical)!);
      if (tokens.length) {
        console.log(
          `Token match (cache): kind=${k.kind} raw=${k.raw} canonical=${canonical} tokens=${tokens.length}`
        );
        return { tokens, matchedKey: canonical, matchedRaw: k.raw, matchedKind: k.kind };
      }
    }

    if (db) {
      try {
        const snap = await db.collection("fcm_tokens").doc(canonical).get();
        if (snap.exists) {
          const tokens = (snap.data()?.tokens as string[]) ?? [];
          if (tokens.length) {
            tokenCache.set(canonical, new Set(tokens));
            console.log(
              `Token match (Firestore): kind=${k.kind} raw=${k.raw} canonical=${canonical} tokens=${tokens.length}`
            );
            return { tokens, matchedKey: canonical, matchedRaw: k.raw, matchedKind: k.kind };
          }
        }
      } catch (err) {
        console.error("Failed to fetch FCM tokens from Firestore:", err);
      }
    }
  }

  console.log(
    "No token match for any candidate key:",
    keys.map((k) => `${k.kind}:${k.raw}`).join(", ")
  );
  return { tokens: [] };
}

export async function removeInvalidTokens(invalid: string[]) {
  if (!invalid.length) return;

  for (const set of tokenCache.values()) {
    for (const t of invalid) set.delete(t);
  }

  const db = getFirestoreOrNull();
  if (!db) return;

  for (const t of invalid) {
    try {
      const snap = await db.collection("fcm_tokens").where("tokens", "array-contains", t).get();
      for (const doc of snap.docs) {
        const remaining = ((doc.data().tokens as string[]) ?? []).filter((x) => x !== t);
        await doc.ref.set({ tokens: remaining, updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error(`Failed to remove invalid token ${t} from Firestore:`, err);
    }
  }
  console.log(`Cleaned up ${invalid.length} invalid token(s)`);
}
