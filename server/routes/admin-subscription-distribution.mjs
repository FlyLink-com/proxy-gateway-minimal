import { Router } from "express";
import { isThirdPartyCountryCode } from "../services/platform/third-party-node-country.mjs";

const ROOT = "/api/admin/third-party-subscriptions/distribution";
const PLANS = new Set(["monthly_basic", "monthly_plus", "yearly"]);
const REVISION = /^[a-f0-9]{64}$/;
const MULTIPLIER = /^\d{1,2}(\.\d{1,4})?$/;
const OWNED_NODE = /^ownnode_[a-f0-9]{32}$/;
const IMPORTED_NODE = /^tpnode_[a-f0-9]{32}$/;
const PUBLIC_CODES = new Set([
  "invalid_input", "invalid_node_name", "duplicate_node_name", "empty_source",
  "invalid_node", "revision_conflict", "distribution_unavailable", "bwh_supply_unavailable",
  "bwh_supply_conflict", "bwh_supply_busy", "bwh_supply_routes_required", "bwh_supply_invalid_input",
  "supply_busy", "third_party_required", "supply_unavailable", "supply_failed",
  "protocol_rating_unavailable", "protocol_rating_conflict", "protocol_rating_invalid"
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
    const requestPath = `${req.baseUrl || ""}${req.path || ""}`;
    const ratingWrite = requestPath.endsWith("/rating") || String(req.originalUrl || "").split("?")[0].endsWith("/rating");
    if (req.method === "PUT" && !ratingWrite && state.subscriptionDistribution.supply?.isTransitioning?.() === true) {
      failure(res, "supply_busy", 409); return;
    }
    next();
  });

  const present = (snapshot) => {
    const withSupply = state.subscriptionDistribution.supply
      ? { ...snapshot, bwhSupply: state.subscriptionDistribution.supply.read() } : snapshot;
    return state.protocolRating ? { ...withSupply, protocolRating: state.protocolRating.read() } : withSupply;
  };
  const execute = (operation) => async (req, res) => {
    try {
      res.json(await operation(state.subscriptionDistribution.store, req));
    } catch (error) {
      const code = PUBLIC_CODES.has(error?.code) ? error.code : "distribution_unavailable";
      failure(res, code, ["revision_conflict", "bwh_supply_conflict", "bwh_supply_busy", "supply_busy", "third_party_required", "protocol_rating_conflict"].includes(code) ? 409
        : ["distribution_unavailable", "bwh_supply_unavailable", "supply_unavailable", "supply_failed", "protocol_rating_unavailable"].includes(code) ? 503 : 400);
    }
  };
  router.get(ROOT, execute((store) => present(store.getSnapshot())));
  router.put(ROOT, (req, res, next) => {
    if (!validRoutes(req.body)) { failure(res, "invalid_input", 400); return; }
    next();
  }, execute((store, req) => present(store.writeRoutes(req.body))));
  router.put(`${ROOT}/owned`, (req, res, next) => {
    if (!validOwned(req.body)) { failure(res, "invalid_input", 400); return; }
    next();
  }, execute((store, req) => present(store.writeOwned(req.body))));
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
    return present({ ...store.getSnapshot(), bwhSupply });
  }));
  router.put(`${ROOT}/rating`, (req, res, next) => {
    const platform = state.platform;
    if (!platform?.adminAuthRoutesEnabled || !platform.adminAuth
      || !["admin", "super_admin"].includes(req.adminPrincipal?.role)
      || typeof platform.adminBrowserOrigin !== "string" || !platform.adminBrowserOrigin
      || req.get("origin") !== platform.adminBrowserOrigin
      || (req.get("sec-fetch-site") && req.get("sec-fetch-site") !== "same-origin")) {
      failure(res, "admin_permission_required", 403); return;
    }
    if (!exact(req.body, ["ratingRevision", "vless", "hy2", "tuic"])
      || typeof req.body.ratingRevision !== "string" || !REVISION.test(req.body.ratingRevision)
      || !["vless", "hy2", "tuic"].every((key) => typeof req.body[key] === "string" && MULTIPLIER.test(req.body[key]))) {
      failure(res, "invalid_input", 400); return;
    }
    if (typeof state.protocolRating?.save !== "function") {
      failure(res, "protocol_rating_unavailable", 503); return;
    }
    next();
  }, execute((store, req) => {
    try {
      state.protocolRating.save({
        ratingRevision: req.body.ratingRevision,
        vless: req.body.vless,
        hy2: req.body.hy2,
        tuic: req.body.tuic,
        expectedRevision: req.body.ratingRevision
      });
    } catch (error) {
      const code = error?.code === "rating_conflict" ? "protocol_rating_conflict"
        : error?.code === "rating_schema_required" ? "protocol_rating_unavailable"
          : error?.code === "rating_invalid" || error?.code === "rating_overflow" ? "protocol_rating_invalid"
            : null;
      if (!code) throw error;
      throw Object.assign(new Error(code), { code });
    }
    return present(store.getSnapshot());
  }));
  return router;
}
