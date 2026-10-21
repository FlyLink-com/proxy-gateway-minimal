import { Router } from "express";
import { isThirdPartyCountryCode } from "../services/platform/third-party-node-country.mjs";

const ROOT = "/api/admin/third-party-subscriptions/distribution";
const PLANS = new Set(["monthly_basic", "monthly_plus", "yearly"]);
const REVISION = /^[a-f0-9]{64}$/;
const OWNED_NODE = /^ownnode_[a-f0-9]{32}$/;
const IMPORTED_NODE = /^tpnode_[a-f0-9]{32}$/;
const PUBLIC_CODES = new Set([
  "invalid_input", "invalid_node_name", "duplicate_node_name", "empty_source",
  "invalid_node", "revision_conflict", "distribution_unavailable", "bwh_supply_unavailable",
  "bwh_supply_conflict", "bwh_supply_busy", "bwh_supply_routes_required", "bwh_supply_invalid_input",
  "supply_busy", "third_party_required", "supply_unavailable", "supply_failed"
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
    if (req.method === "PUT" && state.subscriptionDistribution.supply?.isTransitioning?.() === true) {
      failure(res, "supply_busy", 409); return;
    }
    next();
  });

  const withSupply = (snapshot) => state.subscriptionDistribution.supply
    ? { ...snapshot, bwhSupply: state.subscriptionDistribution.supply.read() } : snapshot;
  const projectBandwidth = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const keys = ["revision", "state", "inboundEnabled", "outboundEnabled", "inboundMbps", "outboundMbps"];
    if (!keys.every((key) => Object.hasOwn(value, key))) return undefined;
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
  };
  const attachBandwidth = (snapshot) => {
    if (Object.hasOwn(snapshot, "bwhBandwidth") || typeof state.bwhBandwidth?.read !== "function") return snapshot;
    const bwhBandwidth = projectBandwidth(state.bwhBandwidth.read());
    return bwhBandwidth ? { ...snapshot, bwhBandwidth } : snapshot;
  };
  const execute = (operation) => async (req, res) => {
    try {
      res.json(await operation(state.subscriptionDistribution.store, req));
    } catch (error) {
      const code = PUBLIC_CODES.has(error?.code) ? error.code : "distribution_unavailable";
      failure(res, code, ["revision_conflict", "bwh_supply_conflict", "bwh_supply_busy", "supply_busy", "third_party_required"].includes(code) ? 409
        : ["distribution_unavailable", "bwh_supply_unavailable", "supply_unavailable", "supply_failed"].includes(code) ? 503 : 400);
    }
  };
  router.get(ROOT, execute((store) => attachBandwidth(withSupply(store.getSnapshot()))));
  router.put(ROOT, (req, res, next) => {
    if (!validRoutes(req.body)) { failure(res, "invalid_input", 400); return; }
    next();
  }, execute((store, req) => attachBandwidth(withSupply(store.writeRoutes(req.body)))));
  router.put(`${ROOT}/owned`, (req, res, next) => {
    if (!validOwned(req.body)) { failure(res, "invalid_input", 400); return; }
    next();
  }, execute((store, req) => attachBandwidth(withSupply(store.writeOwned(req.body)))));
  router.put(`${ROOT}/supply`, (req, res, next) => {
    // Actual service control never inherits the legacy console-token-only
    // write path. Its browser mutation always binds a configured exact origin.
    const platform = state.platform;
    if (!platform?.adminAuthRoutesEnabled || !platform.adminAuth
      || !["admin", "super_admin"].includes(req.adminPrincipal?.role)
      || typeof platform.adminBrowserOrigin !== "string" || !platform.adminBrowserOrigin
      || req.get("origin") !== platform.adminBrowserOrigin
      || (req.get("sec-fetch-site") && req.get("sec-fetch-site") !== "same-origin")) {
      failure(res, "admin_permission_required", 403); return;
    }
    if (!exact(req.body, ["revision", "supplyRevision", "enabled"])
      || ![req.body.revision, req.body.supplyRevision].every(value => typeof value === "string" && REVISION.test(value))
      || typeof req.body.enabled !== "boolean") {
      failure(res, "invalid_input", 400); return;
    }
    if (typeof state.subscriptionDistribution.supply?.setEnabled !== "function") {
      failure(res, "bwh_supply_unavailable", 503); return;
    }
    next();
  }, execute(async (store, req) => {
    const bwhSupply = await state.subscriptionDistribution.supply.setEnabled(req.body);
    return attachBandwidth({ ...store.getSnapshot(), bwhSupply });
  }));
  router.put(`${ROOT}/bandwidth`, async (req, res) => {
    const platform = state.platform;
    if (!platform?.adminAuthRoutesEnabled || !platform.adminAuth
      || !["admin", "super_admin"].includes(req.adminPrincipal?.role)
      || typeof platform.adminBrowserOrigin !== "string" || !platform.adminBrowserOrigin
      || req.get("origin") !== platform.adminBrowserOrigin
      || (req.get("sec-fetch-site") && req.get("sec-fetch-site") !== "same-origin")) {
      failure(res, "admin_permission_required", 403); return;
    }
    if (!exact(req.body, ["bandwidthRevision", "inboundEnabled", "outboundEnabled", "inboundMbps", "outboundMbps"])
      || typeof req.body.bandwidthRevision !== "string" || !REVISION.test(req.body.bandwidthRevision)
      || typeof req.body.inboundEnabled !== "boolean" || typeof req.body.outboundEnabled !== "boolean"
      || typeof req.body.inboundMbps !== "string" || typeof req.body.outboundMbps !== "string"
      || req.body.inboundMbps.length > 16 || req.body.outboundMbps.length > 16) {
      failure(res, "invalid_input", 400); return;
    }
    if (typeof state.bwhBandwidth?.save !== "function") {
      failure(res, "bwh_bandwidth_unavailable", 503); return;
    }
    try {
      const bwhBandwidth = projectBandwidth(await state.bwhBandwidth.save({
        bandwidthRevision: req.body.bandwidthRevision,
        inboundEnabled: req.body.inboundEnabled,
        outboundEnabled: req.body.outboundEnabled,
        inboundMbps: req.body.inboundMbps,
        outboundMbps: req.body.outboundMbps
      }));
      if (!bwhBandwidth) throw Object.assign(new Error("BWH bandwidth projection rejected"), { code: "bwh_bandwidth_failed" });
      const snapshot = state.subscriptionDistribution.store.getSnapshot();
      res.json({ ...withSupply(snapshot), bwhBandwidth });
    } catch (error) {
      const code = error?.code === "bwh_bandwidth_conflict" ? "bwh_bandwidth_conflict"
        : error?.code === "bwh_bandwidth_invalid" ? "bwh_bandwidth_invalid" : "bwh_bandwidth_failed";
      failure(res, code, code === "bwh_bandwidth_conflict" ? 409 : code === "bwh_bandwidth_invalid" ? 400 : 503);
    }
  });
  return router;
}
