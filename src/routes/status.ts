import { Router } from "express";
import { getOrder, registerFcmToken } from "../store";

export const statusRouter = Router();

statusRouter.get("/order/:orderId", (req, res) => {
  const order = getOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json(order);
});

statusRouter.post("/register-token", (req, res) => {
  const { orderId, fcmToken } = req.body ?? {};
  if (!orderId || !fcmToken) {
    return res.status(400).json({ error: "orderId and fcmToken are required" });
  }

  registerFcmToken(String(orderId), String(fcmToken));
  return res.status(200).json({ ok: true });
});

