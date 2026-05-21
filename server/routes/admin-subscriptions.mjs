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

export function adminSubscriptionRoutes(state) {
  const router = Router();
  const service = state.subscriptions.service;

  router.get("/api/admin/subscriptions", (_req, res) => {
    try {
      res.json({ items: service.listTenants() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions", (req, res) => {
    try {
      res.status(201).json(service.createTenant(req.body ?? {}));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/subscriptions/:id", (req, res) => {
    try {
      res.json({ tenant: service.getTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/api/admin/subscriptions/:id", (req, res) => {
    try {
      res.json({ tenant: service.renewTenant(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/renew", (req, res) => {
    try {
      res.json({ tenant: service.renewTenant(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/disable", (req, res) => {
    try {
      res.json({ tenant: service.disableTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/enable", (req, res) => {
    try {
      res.json({ tenant: service.enableTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/reset-token", (req, res) => {
    try {
      res.json(service.resetToken(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/nodes", (_req, res) => {
    try {
      res.json({ items: service.nodes() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/overview", (_req, res) => {
    try {
      res.json(service.overview());
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
