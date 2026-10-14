import { Router } from "express";
import { RESIDENTIAL_RELAY_STORE_CODES } from "../services/platform/residential-relay-pack-store.mjs";

const SKU_ID = /^rrsku_[0-9a-f]{32}$/;
const PUBLIC = new Set([...RESIDENTIAL_RELAY_STORE_CODES, "admin_permission_required", "invalid_revision"]);
const MAX_YAML = 64 * 1024;

function sendError(res, status, code) {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error: code });
}

function statusFor(code) {
  if (code === "not_found") return 404;
  if (code === "revision_conflict" || code === "upstream_enabled" || code === "no_enabled_upstream") return 409;
  if (code === "residential_relay_unavailable") return 503;
  if (code === "admin_permission_required") return 403;
  return 400;
}

function storeOf(state) {
  const feature = state?.residentialRelayPack;
  if (!feature?.enabled || feature.available !== true || !feature.store) return null;
  return feature.store;
}

function body(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}

function sendStoreError(res, error, fallback) {
  const code = PUBLIC.has(error?.code) ? error.code : fallback;
  sendError(res, statusFor(code), code);
}

export function adminResidentialRelayPackRoutes(state) {
  const router = Router();
  router.use("/api/admin/residential-relay-packs", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (state.platform?.adminAuthRoutesEnabled && state.platform?.adminAuth
      && !["admin", "super_admin"].includes(req.adminPrincipal?.role)) {
      sendError(res, 403, "admin_permission_required");
      return;
    }
    const store = storeOf(state);
    if (!store) { sendError(res, 503, "residential_relay_unavailable"); return; }
    req.residentialRelayStore = store;
    next();
  });

  router.get("/api/admin/residential-relay-packs/skus", (_req, res) => {
    try { res.json({ skus: _req.residentialRelayStore.listSkus() }); }
    catch (error) { sendStoreError(res, error, "residential_relay_unavailable"); }
  });

  router.put("/api/admin/residential-relay-packs/skus", (req, res) => {
    try {
      const input = body(req.body);
      if (!input) { sendError(res, 400, "invalid_input"); return; }
      res.json(req.residentialRelayStore.saveSku(pick(input, ["sizeCode", "buyerProtocol", "durationDays", "quotaBytes", "baseCoinUnits", "enabled", "revision"])));
    } catch (error) { sendStoreError(res, error, "invalid_input"); }
  });

  router.get("/api/admin/residential-relay-packs/skus/:id", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try { res.json(req.residentialRelayStore.getSku(req.params.id)); }
    catch (error) { sendStoreError(res, error, "not_found"); }
  });

  router.patch("/api/admin/residential-relay-packs/skus/:id/enabled", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try {
      const input = body(req.body);
      if (!input) { sendError(res, 400, "invalid_input"); return; }
      res.json(req.residentialRelayStore.setSkuEnabled(req.params.id, pick(input, ["revision", "enabled"])));
    } catch (error) { sendStoreError(res, error, "invalid_input"); }
  });

  router.post("/api/admin/residential-relay-packs/skus/:id/upstreams/preview", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try {
      const input = body(req.body);
      if (!input || typeof input.yamlContent !== "string" || Buffer.byteLength(input.yamlContent, "utf8") > MAX_YAML) {
        sendError(res, 400, "invalid_yaml"); return;
      }
      res.json(req.residentialRelayStore.previewUpstreams(pick(input, ["yamlContent", "regionOverride"])));
    } catch (error) { sendStoreError(res, error, "invalid_yaml"); }
  });

  router.post("/api/admin/residential-relay-packs/skus/:id/upstreams/import", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try {
      const input = body(req.body);
      if (!input || typeof input.yamlContent !== "string" || Buffer.byteLength(input.yamlContent, "utf8") > MAX_YAML) {
        sendError(res, 400, "invalid_yaml"); return;
      }
      res.status(201).json(req.residentialRelayStore.importUpstreams(req.params.id,
        pick(input, ["revision", "yamlContent", "regionOverride"])));
    } catch (error) { sendStoreError(res, error, "invalid_yaml"); }
  });

  router.get("/api/admin/residential-relay-packs/skus/:id/upstreams", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try { res.json(req.residentialRelayStore.listUpstreams(req.params.id)); }
    catch (error) { sendStoreError(res, error, "not_found"); }
  });

  router.post("/api/admin/residential-relay-packs/skus/:id/upstreams/enable", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try {
      const input = body(req.body);
      if (!input) { sendError(res, 400, "invalid_input"); return; }
      res.json(req.residentialRelayStore.setUpstreamsEnabled(req.params.id,
        { ...pick(input, ["revision", "upstreamIds"]), enabled: true }));
    } catch (error) { sendStoreError(res, error, "invalid_input"); }
  });

  router.post("/api/admin/residential-relay-packs/skus/:id/upstreams/pause", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try {
      const input = body(req.body);
      if (!input) { sendError(res, 400, "invalid_input"); return; }
      res.json(req.residentialRelayStore.setUpstreamsEnabled(req.params.id,
        { ...pick(input, ["revision", "upstreamIds"]), enabled: false }));
    } catch (error) { sendStoreError(res, error, "invalid_input"); }
  });

  router.post("/api/admin/residential-relay-packs/skus/:id/upstreams/delete", (req, res) => {
    if (!SKU_ID.test(req.params.id)) { sendError(res, 400, "invalid_input"); return; }
    try {
      const input = body(req.body);
      if (!input) { sendError(res, 400, "invalid_input"); return; }
      res.json(req.residentialRelayStore.deleteUpstreams(req.params.id, pick(input, ["revision", "upstreamIds"])));
    } catch (error) { sendStoreError(res, error, "invalid_input"); }
  });

  return router;
}
