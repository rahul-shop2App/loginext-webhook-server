import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { ensureFirebaseInitialized } from "./firebase-admin";
import { webhookRouter } from "./routes/webhook";
import { statusRouter } from "./routes/status";
import { testFirebasePush } from "./services/push";

// Initialize Firebase at startup so Firestore is ready for token registration
ensureFirebaseInitialized();

const app = express();

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Use JSON parsing globally, except the LogiNext webhook route which needs raw bytes for HMAC.
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/webhook/loginext") return next();
  return express.json()(req, res, next);
});

app.use("/status", statusRouter);
app.use("/webhook", webhookRouter);

app.post("/debug/test-push", async (req, res) => {
  const { token } = req.body ?? {};
  if (!token) return res.status(400).json({ error: "token required" });
  const result = await testFirebasePush(String(token));
  console.log("Debug test-push result:", JSON.stringify(result));
  return res.json(result);
});

// Global error handler middleware (must be last)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
