export type OrderState = {
  orderId: string;
  status: string;
  latitude?: number;
  longitude?: number;
  deliveryAgentName?: string;
  estimatedDeliveryTime?: string;
  updatedAt: string;
};

const orders = new Map<string, OrderState>();
const orderFcmTokens = new Map<string, string[]>();

// Normalizes phone numbers so local and international formats match.
// "0502657949" and "+966502657949" both become "502657949" (last 9 digits).
function normalizePhone(key: string): string {
  const digits = key.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : key;
}

export function setOrder(order: OrderState) {
  orders.set(order.orderId, order);
}

export function getOrder(orderId: string) {
  return orders.get(orderId);
}

export function registerFcmToken(orderId: string, token: string) {
  const key = normalizePhone(orderId);
  const existing = orderFcmTokens.get(key) ?? [];
  if (!existing.includes(token)) existing.push(token);
  orderFcmTokens.set(key, existing);
}

export function getFcmTokens(orderId: string) {
  const key = normalizePhone(orderId);
  const tokens = orderFcmTokens.get(key) ?? [];
  console.log("Getting tokens for key:", key, "(raw:", orderId, ") found:", tokens.length);
  return tokens;
}

export function removeFcmTokens(orderId: string, tokensToRemove: string[]) {
  if (!tokensToRemove.length) return;
  const existing = orderFcmTokens.get(orderId) ?? [];
  const remaining = existing.filter((t) => !tokensToRemove.includes(t));
  orderFcmTokens.set(orderId, remaining);
}

