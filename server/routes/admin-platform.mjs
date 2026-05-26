import { Router } from "express";

function sendError(res, error) {
  if (error.code === "validation_error") {
    res.status(400).json({ error: "validation_error", message: error.message });
    return;
  }

  if (error.code === "not_found") {
    res.status(404).json({ error: "not_found", message: error.message });
    return;
  }

  res.status(500).json({ error: "internal_error", message: error.message });
}

export function adminPlatformRoutes(state) {
  const router = Router();
  const leadQueue = state.platform?.leadQueue;

  router.get("/api/admin/platform/leads", (req, res) => {
    try {
      res.json({ items: leadQueue.listLeads({ status: req.query.status }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/leads/:id/status", (req, res) => {
    try {
      res.json({ lead: leadQueue.updateLeadStatus(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
