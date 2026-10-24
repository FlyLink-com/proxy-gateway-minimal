import { Router } from "express";
import { requireAdminCapability } from "../middleware/admin-authorization.mjs";

const PATH = "/api/admin/operations/order-status-summary";

function sendSummary(res, action) {
  res.set("Cache-Control", "no-store");
  try {
    res.json(action());
  } catch (error) {
    const code = error && error.code;
    if (code === "invalid_query") {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    if (code === "source_unavailable") {
      res.status(503).json({ error: "source_unavailable" });
      return;
    }
    res.status(500).json({ error: "internal_error" });
  }
}

export function adminOrderStatusSummaryRoutes(state) {
  const router = Router();
  if (state?.platform?.adminAuthorizationEnabled !== true) return router;

  router.use(PATH, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get(PATH, requireAdminCapability("operations.read"), (req, res) => {
    sendSummary(res, () => {
      const service = state.platform?.adminOrderStatusSummary;
      if (!service || typeof service.readSummary !== "function") {
        const error = new Error("source_unavailable");
        error.code = "source_unavailable";
        throw error;
      }
      return service.readSummary(req.query);
    });
  });

  return router;
}
