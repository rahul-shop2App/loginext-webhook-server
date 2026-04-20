import crypto from "crypto";
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

export async function sendFakeWebhook(status: string) {
  const secret = process.env.LOGINEXT_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("LOGINEXT_WEBHOOK_SECRET is missing. Set it in your .env file.");
  }

  const payload = {
    orderId: "TEST-001",
    orderStatus: status,
    latitude: 28.6139,
    longitude: 77.209,
    deliveryAgentName: "Ravi Kumar",
    estimatedDeliveryTime: "2026-04-20T15:30:00Z"
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  const fetch = getFetch();
  const res = await fetch("http://localhost:3000/webhook/loginext", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-loginext-signature": signature
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

