export type OrderState = {
  orderId: string;
  status: string;
  latitude?: number;
  longitude?: number;
  deliveryAgentName?: string;
  estimatedDeliveryTime?: string;
  updatedAt: string;
};

export type KeyKind = "uuid" | "digits" | "customer_id" | "raw";
export type CandidateKey = { raw: string; kind: KeyKind };

const orders = new Map<string, OrderState>();
const tokenCache = new Map<string, Set<string>>();

// Canonical form per kind:
// - "digits":      last 9 digits (matches phone, awbNumber, orderNo across formats)
// - "customer_id": full digits, no truncation (Shopify customer IDs are 13 digits and must match exactly)
// - "uuid":        lowercase, strip non-alphanumerics (so dashed and undashed UUIDs collide)
// - "raw":         trim + lowercase (shopify order names like "#1234", GIDs)
export function canonicalize(raw: string, kind: KeyKind): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (kind === "digits") {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 9 ? digits.slice(-9) : digits;
  }
  if (kind === "customer_id") {
    return trimmed.replace(/\D/g, "");
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

  for (const key of canonicalKeys) {
    const set = tokenCache.get(key) ?? new Set<string>();
    set.add(token);
    tokenCache.set(key, set);
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
  for (const k of keys) {
    const canonical = canonicalize(k.raw, k.kind);
    if (!canonical) continue;

    const set = tokenCache.get(canonical);
    if (set && set.size) {
      const tokens = Array.from(set);
      console.log(
        `Token match: kind=${k.kind} raw=${k.raw} canonical=${canonical} tokens=${tokens.length}`
      );
      return { tokens, matchedKey: canonical, matchedRaw: k.raw, matchedKind: k.kind };
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
  console.log(`Cleaned up ${invalid.length} invalid token(s) from in-memory cache`);
}
