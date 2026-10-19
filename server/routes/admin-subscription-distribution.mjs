import { Router } from "express";
import { isThirdPartyCountryCode } from "../services/platform/third-party-node-country.mjs";

const ROOT = "/api/admin/third-party-subscriptions/distribution";
const PLANS = new Set(["monthly_basic", "monthly_plus", "yearly"]);
const REVISION = /^[a-f0-9]{64}$/;
const OWNED_NODE = /^ownnode_[a-f0-9]{32}$/;
const IMPORTED_NODE = /^tpnode_[a-f0-9]{32}$/;
const PUBLIC_CODES = new Set([
  "invalid_input", "invalid_node_name", "duplicate_node_name", "empty_source",
  "invalid_node", "revision_conflict", "distribution_unavailable"
]);

function exact(value, keys, optional = []) {
  return value && typeof value === "object" && !Array.isArray(value)
    && keys.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => keys.includes(key) || optional.includes(key));
}

function validRoutes(body) {
  if (!exact(body, ["revision", "routes"]) || typeof body.revision !== "string" || !REVISION.test(body.revision)
    || !Array.isArray(body.routes) || body.routes.length !== PLANS.size) return false;
  const seen = new Set();
  return body.routes.every((route) => {
    if (!exact(route, ["planId", "mode", "nodeIds"]) || !PLANS.has(route.planId) || seen.has(route.planId)
      || !["owned", "third-party"].includes(route.mode) || !Array.isArray(route.nodeIds) || route.nodeIds.length > 256
      || new Set(route.nodeIds).size !== route.nodeIds.length
      || route.nodeIds.some((id) => typeof id !== "string" || !IMPORTED_NODE.test(id))
      || (route.mode === "owned" && route.nodeIds.length !== 0)
      || (route.mode === "third-party" && route.nodeIds.length === 0)) return false;
    seen.add(route.planId);
    return true;
  });
}

function validOwned(body) {
  return exact(body, ["revision", "enabled", "nodes"])
    && typeof body.revision === "string" && REVISION.test(body.revision) && typeof body.enabled === "boolean"
    && Array.isArray(body.nodes) && body.nodes.length <= 256
    && new Set(body.nodes.map((node) => node?.id)).size === body.nodes.length
    && body.nodes.every((node) => exact(node, ["id", "enabled", "customName"], ["customCountryCode"])
      && typeof node.id === "string" && OWNED_NODE.test(node.id) && typeof node.enabled === "boolean"
      && (node.customName === null || (typeof node.customName === "string" && node.customName.length <= 128))
      && (!Object.hasOwn(node, "customCountryCode") || node.customCountryCode === null || isThirdPartyCountryCode(node.customCountryCode)));
}

function failure(res, code, status) {
  res.set("Cache-Control", "no-store").status(status).json({ error: code });
}

// Mounted behind the application's existing Admin CIDR/session/console gateway.
// This narrower role check also prevents invalid configured roles inheriting
// the legacy token route when session authentication is enabled.
export function adminSubscriptionDistributionRoutes(state) {
  const router = Router();
  router.use(ROOT, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (state.platform?.adminAuthRoutesEnabled && state.platform?.adminAuth
      && !["admin", "super_admin"].includes(req.adminPrincipal?.role)) {
      failure(res, "admin_permission_required", 403);
      return;
    }
    const feature = state.subscriptionDistribution;
    if (!feature?.enabled || feature.available !== true || !feature.store) {
      failure(res, "distribution_unavailable", 503);
      return;
    }
    if (Object.keys(req.query).length !== 0) {
      failure(res, "invalid_input", 400);
      return;
    }
    next();
  });

  const execute = (operation) => (req, res) => {
    try {
      res.json(operation(state.subscriptionDistribution.store, req));
    } catch (error) {
      const code = PUBLIC_CODES.has(error?.code) ? error.code : "distribution_unavailable";
      failure(res, code, code === "revision_conflict" ? 409 : code === "distribution_unavailable" ? 503 : 400);
    }
  };
  router.get(ROOT, execute((store) => store.getSnapshot()));
  router.put(ROOT, (req, res, next) => {
    if (!validRoutes(req.body)) { failure(res, "invalid_input", 400); return; }
    next();
  }, execute((store, req) => store.writeRoutes(req.body)));
  router.put(`${ROOT}/owned`, (req, res, next) => {
    if (!validOwned(req.body)) { failure(res, "invalid_input", 400); return; }
    next();
  }, execute((store, req) => store.writeOwned(req.body)));
  return router;
}
