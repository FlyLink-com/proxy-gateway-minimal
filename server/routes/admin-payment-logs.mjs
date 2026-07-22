import { Router } from "express";

export function adminPaymentLogsRoutes(state, options = {}) {
  const router = Router();
  const service = options.platformCoinsCommerceService || state.platform?.coinsCommerceService;
  router.get("/api/admin/platform/payment-logs", (req, res) => {
    try {
      if (!service?.listPaymentLogs) throw Object.assign(new Error("commerce unavailable"), { code: "validation_error" });
      const result = service.listPaymentLogs({
        ...(req.query.status ? { status: req.query.status } : {}),
        ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
        ...(req.query.cursor ? { cursor: Number(req.query.cursor) } : {})
      });
      res.json(result);
    } catch (error) {
      const code = error?.code === "validation_error" ? "validation_error" : "internal_error";
      res.status(code === "validation_error" ? 400 : 500).json({ error: code });
    }
  });
  return router;
}
