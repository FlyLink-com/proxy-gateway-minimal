import { Router } from "express";
import { buildChannelLabTargetDecision } from "../services/channel-lab-target-decision.mjs";
import { buildChannelRuntimeExecutionHandoff } from "../services/channel-runtime-execution-handoff.mjs";
import { buildChannelRuntimeEvidenceBridge } from "../services/channel-runtime-evidence-bridge.mjs";
import { buildChannelRuntimeGateWorkbench } from "../services/channel-runtime-gate-workbench.mjs";
import { buildChannelSystemDecisionFlow } from "../services/channel-system-decision-flow.mjs";
import { buildCleanEdgeReadinessSummary } from "../services/clean-edge-readiness-summary.mjs";
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

function channelSystemValidationError() {
  const error = new Error("channel system decision flow input is invalid");
  error.code = "validation_error";
  return error;
}

function channelRuntimeEvidenceBridgeValidationError() {
  const error = new Error("channel runtime evidence bridge input is invalid");
  error.code = "validation_error";
  return error;
}

function channelRuntimeGateWorkbenchValidationError() {
  const error = new Error("channel runtime gate workbench input is invalid");
  error.code = "validation_error";
  return error;
}

function channelRuntimeExecutionHandoffValidationError() {
  const error = new Error("channel runtime execution handoff input is invalid");
  error.code = "validation_error";
  return error;
}

function channelLabTargetDecisionValidationError() {
  const error = new Error("channel lab target decision input is invalid");
  error.code = "validation_error";
  return error;
}

function cleanEdgeReadinessSummaryValidationError() {
  const error = new Error("clean edge readiness summary input is invalid");
  error.code = "validation_error";
  return error;
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
          accessMigration: aliyunGateEvidenceShell
            ? aliyunGateEvidenceShell.accessMigrationEvidenceForDecisionPacket()
            : aliyunGateEvidence.accessMigration,
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

  router.post("/api/admin/platform/channel-system-decision-flow", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelSystem: buildChannelSystemDecisionFlow({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeInventoryInput: input.runtimeInventoryInput
        })
      });
    } catch {
      sendError(res, channelSystemValidationError());
    }
  });

  router.post("/api/admin/platform/channel-runtime-evidence-bridge", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelRuntimeEvidence: buildChannelRuntimeEvidenceBridge({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelRuntimeEvidenceBridgeValidationError());
    }
  });

  router.post("/api/admin/platform/channel-runtime-gate-workbench", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelRuntimeGateWorkbench: buildChannelRuntimeGateWorkbench({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelRuntimeGateWorkbenchValidationError());
    }
  });

  router.post("/api/admin/platform/channel-runtime-execution-handoff", (req, res) => {
    try {
      const input = req.body ?? {};
      res.json({
        channelRuntimeExecutionHandoff: buildChannelRuntimeExecutionHandoff({
          dryRunSummary: input.dryRunSummary,
          measurementScore: input.measurementScore,
          runtimeEvidenceInput: input.runtimeEvidenceInput
        })
      });
    } catch {
      sendError(res, channelRuntimeExecutionHandoffValidationError());
    }
  });

  router.post("/api/admin/platform/channel-lab-target-decision", (req, res) => {
    try {
      res.json({
        channelLabTargetDecision: buildChannelLabTargetDecision(req.body ?? {})
      });
    } catch {
      sendError(res, channelLabTargetDecisionValidationError());
    }
  });

  router.post("/api/admin/platform/clean-edge-readiness-summary", (req, res) => {
    try {
      res.json({
        cleanEdgeReadiness: buildCleanEdgeReadinessSummary(req.body ?? {})
      });
    } catch {
      sendError(res, cleanEdgeReadinessSummaryValidationError());
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

  router.post("/api/admin/platform/aliyun-gate-evidence/access-migration", (req, res) => {
    try {
      const evidence = requireAliyunGateEvidenceShell(aliyunGateEvidenceShell)
        .recordAccessMigrationEvidence(req.body ?? {});
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
