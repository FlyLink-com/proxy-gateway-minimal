import { Router } from "express";
import { requireAdminCapability } from "../middleware/admin-authorization.mjs";
import { authorizeAdmin } from "../services/platform/admin-authorization.mjs";
import { createAdminUserMonitorService } from "../services/platform/admin-user-monitor.mjs";
import {
  createUnavailableTrafficCollectorAdminProjection,
  sanitizeTrafficCollectorAdminProjection
} from "../services/platform/traffic-collector-admin-projection.mjs";
import {
  createOperationsReadEnvelope
} from "../services/platform/operations-read-envelope.mjs";
import {
  projectOperationsDashboardSummary
} from "../services/platform/operations-dashboard-summary.mjs";
import {
  projectOperationsOverviewReadModel
} from "../services/platform/operations-overview-read-model.mjs";

const DASHBOARD_DAY_MS = 86400000;
const DASHBOARD_DEFAULT_RANGE_MS = 30 * DASHBOARD_DAY_MS;

function invalidQuery() {
  const error = new Error("invalid_query");
  error.code = "invalid_query";
  return error;
}

function registrationGrowthFor(state, req) {
  const query = req.query ?? {};
  const keys = Object.keys(query);
  if (keys.some((key) => key !== "from" && key !== "to")) throw invalidQuery();
  const hasFrom = Object.prototype.hasOwnProperty.call(query, "from");
  const hasTo = Object.prototype.hasOwnProperty.call(query, "to");
  if (hasFrom !== hasTo) throw invalidQuery();
  const decision = authorizeAdmin({
    principal: req.adminPrincipal,
    capability: "users.read"
  });
  if (!decision.allowed) return { availability: "not_authorized" };
  const now = new Date();
  const from = hasFrom ? query.from : new Date(now.getTime() - DASHBOARD_DEFAULT_RANGE_MS).toISOString();
  const to = hasTo ? query.to : now.toISOString();
  try {
    const body = createAdminUserMonitorService({
      controlStore: state.platform?.controlStore ?? null
    }).readGrowth({ from, to });
    return {
      availability: "ready",
      timezone: body.timezone,
      definition: "account_created_at",
      from: body.from,
      to: body.to,
      registeredCount: body.registeredCount,
      otherCreatedCount: body.otherCreatedCount,
      points: body.points.map((point) => ({
        at: point.at,
        registeredCount: point.registeredCount,
        otherCreatedCount: point.otherCreatedCount,
        coverage: "queried"
      }))
    };
  } catch (error) {
    if (error?.code === "invalid_query") throw error;
    return { availability: "unavailable" };
  }
}

function trafficCollectorFor(state) {
  const store = state.platform?.trafficCollectorStatusStore;
  if (!store || typeof store.read !== "function") {
    return createUnavailableTrafficCollectorAdminProjection("not_configured");
  }
  try {
    return sanitizeTrafficCollectorAdminProjection(store.read());
  } catch {
    return createUnavailableTrafficCollectorAdminProjection("invalid_observation");
  }
}

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

  const operationsReadGate = state.platform?.adminAuthorizationEnabled
    ? requireAdminCapability("operations.read")
    : (_req, _res, next) => next();

  router.get("/api/admin/overview", operationsReadGate, (_req, res) => {
    try {
      res.json(core.overview());
    } catch (error) {
      sendError(res, error);
    }
  });

  if (state.platform?.adminAuthorizationEnabled === true) {
    router.get(
      "/api/admin/operations/overview",
      requireAdminCapability("operations.read"),
      (_req, res) => {
        try {
          const data = projectOperationsOverviewReadModel(core.overview());
          res.json(createOperationsReadEnvelope({
            schemaVersion: "operations-overview-read-envelope/v1",
            freshness: "fresh",
            sourceState: "implemented_source",
            data,
            warnings: [],
            access: {
              allowed: true,
              capability: "operations.read",
              reasonCode: "allowed"
            }
          }));
        } catch {
          res.status(500).json({ error: "internal_error" });
        }
      }
    );

    router.get(
      "/api/admin/operations/dashboard-summary",
      requireAdminCapability("operations.read"),
      (req, res) => {
        try {
          const registrationGrowth = registrationGrowthFor(state, req);
          const trafficCollector = trafficCollectorFor(state);
          const data = projectOperationsDashboardSummary(core.overview(), {
            registrationGrowth,
            trafficCollector
          });
          const warnings = [{ code: "source_partial" }];
          if (
            data.registrationGrowth.availability === "unavailable"
            || data.trafficCollector.availability === "unknown"
          ) {
            warnings.push({ code: "source_unavailable" });
          }
          res.set("Cache-Control", "no-store");
          res.json(createOperationsReadEnvelope({
            schemaVersion: "operations-dashboard-summary/v1",
            freshness: "partial",
            sourceState: "implemented_source",
            data,
            warnings,
            access: {
              allowed: true,
              capability: "operations.read",
              reasonCode: "allowed"
            }
          }));
        } catch (error) {
          if (error?.code === "invalid_query") {
            res.status(400).json({ error: "invalid_query" });
            return;
          }
          res.status(500).json({ error: "internal_error" });
        }
      }
    );
  }

  return router;
}
