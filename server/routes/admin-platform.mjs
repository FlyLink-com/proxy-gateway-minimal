import { Router } from "express";
import { createCleanStartControlPlanePackage } from "../services/platform/clean-start-control-plane.mjs";
import { createAliyunGateDecisionPacket } from "../services/platform/aliyun-gate-decision-packet.mjs";

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

function requireAliyunGateEvidenceShell(shell) {
  if (shell) {
    return shell;
  }
  const error = new Error("Aliyun gate evidence shell is not configured");
  error.code = "validation_error";
  throw error;
}

export function adminPlatformRoutes(state) {
  const router = Router();
  const leadQueue = state.platform?.leadQueue;
  const accountShell = state.platform?.accountShell;
  const accessShell = state.platform?.accessShell;
  const aliyunGateEvidence = state.platform?.aliyunGateEvidence || {};
  const aliyunGateEvidenceShell = state.platform?.aliyunGateEvidenceShell;

  function buildCleanStartPackage() {
    return createCleanStartControlPlanePackage({
      accountShell,
      accessShell,
      proxyConfig: state.proxyConfig,
      now: new Date()
    });
  }

  router.get("/api/admin/platform/clean-start", (req, res) => {
    try {
      res.json({ cleanStart: buildCleanStartPackage() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/aliyun-gates", (req, res) => {
    try {
      res.json({
        aliyunGates: createAliyunGateDecisionPacket({
          cleanStart: buildCleanStartPackage(),
          providerFirewall: aliyunGateEvidenceShell
            ? aliyunGateEvidenceShell.providerFirewallEvidenceForDecisionPacket()
            : aliyunGateEvidence.providerFirewall,
          now: new Date()
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/api/admin/platform/aliyun-gate-evidence", (req, res) => {
    try {
      res.json({ evidence: aliyunGateEvidenceShell ? aliyunGateEvidenceShell.summary() : null });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/api/admin/platform/aliyun-gate-evidence/provider-firewall", (req, res) => {
    try {
      const evidence = requireAliyunGateEvidenceShell(aliyunGateEvidenceShell)
        .recordProviderFirewallEvidence(req.body ?? {});
      res.status(201).json({ evidence });
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
