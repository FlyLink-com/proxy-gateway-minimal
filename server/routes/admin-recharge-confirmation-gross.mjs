import { Router } from "express";
import { requireAdminCapability } from "../middleware/admin-authorization.mjs";

const PATH = "/api/admin/operations/recharge-confirmation-gross";

function sendGross(res, action) {
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

export function adminRechargeConfirmationGrossRoutes(state) {
  const router = Router();
  if (state?.platform?.adminAuthorizationEnabled !== true) return router;

  router.use(PATH, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get(PATH, requireAdminCapability("operations.read"), (req, res) => {
    sendGross(res, () => {
      const service = state.platform?.adminRechargeConfirmationGross;
      if (!service || typeof service.readGross !== "function") {
        const error = new Error("source_unavailable");
        error.code = "source_unavailable";
        throw error;
      }
      return service.readGross(req.query);
    });
  });

  return router;
}
