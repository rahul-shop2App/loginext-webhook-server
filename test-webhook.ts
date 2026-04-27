import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, ".env") });

type FetchFn = (url: string, init?: any) => Promise<{ status: number; text?: () => Promise<string> }>;

function getFetch(): FetchFn {
  const builtIn = (globalThis as any).fetch as FetchFn | undefined;
  if (builtIn) return builtIn;

  throw new Error("Global fetch is not available. Run this with Node 18+.");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const backendUrl = "https://loginext-webhook-server-production.up.railway.app";
const resolvedBackendUrl =
  (process.env.BACKEND_URL ?? "").trim().replace(/\/+$/, "") || backendUrl.replace(/\/+$/, "");

export async function sendFakeWebhook(status: string) {
  const payload = {
    orderId: "TEST-001",
    orderStatus: status,
    latitude: 28.6139,
    longitude: 77.209,
    deliveryAgentName: "Ravi Kumar",
    estimatedDeliveryTime: "2026-04-20T15:30:00Z"
  };

  const body = JSON.stringify(payload);

  const fetch = getFetch();
  const res = await fetch(`${backendUrl}/webhook/loginext`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": process.env.LOGINEXT_WEBHOOK_SECRET || ""
    },
    body
  });

  console.log(`[${new Date().toISOString()}] Sent ${status} -> HTTP ${res.status}`);
}

async function main() {
  await sendFakeWebhook("PICKED_UP");
  await sleep(2000);
  await sendFakeWebhook("OUT_FOR_DELIVERY");
  await sleep(2000);
  await sendFakeWebhook("DELIVERED");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

