import { Router } from "express";
import { createCleanStartControlPlanePackage } from "../services/platform/clean-start-control-plane.mjs";

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
  const accountShell = state.platform?.accountShell;
  const accessShell = state.platform?.accessShell;

  router.get("/api/admin/platform/clean-start", (req, res) => {
    try {
      res.json({
        cleanStart: createCleanStartControlPlanePackage({
          accountShell,
          accessShell,
          proxyConfig: state.proxyConfig,
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

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

  router.post("/api/admin/platform/leads/:id/account", (req, res) => {
    try {
      const lead = leadQueue.getLead(req.params.id);
      const account = accountShell.createAccountFromLead(lead, req.body ?? {});
      const updatedLead = leadQueue.updateLeadStatus(req.params.id, { status: "converted" });
      res.status(201).json({ account, lead: updatedLead });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/accounts", (req, res) => {
    try {
      res.json({ items: accountShell.listAccounts({ status: req.query.status }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/accounts/:id/entitlements", (req, res) => {
    try {
      const entitlement = accountShell.createEntitlement(req.params.id, req.body ?? {});
      res.status(201).json({ entitlement });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/accounts/:id/entitlements", (req, res) => {
    try {
      res.json({ items: accountShell.listEntitlements({ accountId: req.params.id }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/entitlements", (req, res) => {
    try {
      res.json({ items: accountShell.listEntitlements({ accountId: req.query.accountId }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/accounts/:accountId/entitlements/:entitlementId/dynamic-entry", (req, res) => {
    try {
      const access = accessShell.issueDynamicEntry(req.params.accountId, req.params.entitlementId, req.body ?? {});
      res.status(201).json({ access });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/access-grants", (req, res) => {
    try {
      res.json({
        items: accessShell.listAccessGrants({
          accountId: req.query.accountId,
          entitlementId: req.query.entitlementId
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
