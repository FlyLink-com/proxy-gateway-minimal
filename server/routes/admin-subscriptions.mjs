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

  res.status(500).json({ error: "internal_error" });
}

export function adminSubscriptionRoutes(state) {
  const router = Router();
  const core = state.subscriptions.core || state.subscriptions.service;

  router.get("/api/admin/subscriptions", (_req, res) => {
    try {
      res.json({ items: core.listTenants() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions", (req, res) => {
    try {
      res.status(201).json(core.createTenant(req.body ?? {}));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/subscriptions/:id", (req, res) => {
    try {
      res.json({ tenant: core.getTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch("/api/admin/subscriptions/:id", (req, res) => {
    try {
      res.json({ tenant: core.renewTenant(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/renew", (req, res) => {
    try {
      res.json({ tenant: core.renewTenant(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/node", (req, res) => {
    try {
      res.json({ tenant: core.setTenantNode(req.params.id, req.body ?? {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/disable", (req, res) => {
    try {
      res.json({ tenant: core.disableTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/enable", (req, res) => {
    try {
      res.json({ tenant: core.enableTenant(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/reset-token", (req, res) => {
    try {
      res.json(core.resetToken(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/temp-link", (req, res) => {
    try {
      res.status(201).json(core.createTempLink(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscriptions/:id/artifacts", (req, res) => {
    try {
      res.status(201).json(core.createSubscriptionArtifact(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/subscriptions/:id/artifacts", (req, res) => {
    try {
      res.json({ items: core.listSubscriptionArtifacts(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscription-artifacts/:id/revoke", (req, res) => {
    try {
      res.json({ artifact: core.revokeSubscriptionArtifact(req.params.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/subscription-artifacts/:id/rotate", (req, res) => {
    try {
      res.status(201).json(core.rotateSubscriptionArtifact(req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/nodes", (_req, res) => {
    try {
      res.json({ items: (core.listNodes || core.nodes).call(core) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/overview", (_req, res) => {
    try {
      res.json(core.overview());
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
