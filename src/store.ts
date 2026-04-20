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

export function setOrder(order: OrderState) {
  orders.set(order.orderId, order);
}

export function getOrder(orderId: string) {
  return orders.get(orderId);
}

export function registerFcmToken(orderId: string, token: string) {
  const existing = orderFcmTokens.get(orderId) ?? [];
  if (!existing.includes(token)) existing.push(token);
  orderFcmTokens.set(orderId, existing);
}

export function getFcmTokens(orderId: string) {
  return orderFcmTokens.get(orderId) ?? [];
}

export function removeFcmTokens(orderId: string, tokensToRemove: string[]) {
  if (!tokensToRemove.length) return;
  const existing = orderFcmTokens.get(orderId) ?? [];
  const remaining = existing.filter((t) => !tokensToRemove.includes(t));
  orderFcmTokens.set(orderId, remaining);
}

