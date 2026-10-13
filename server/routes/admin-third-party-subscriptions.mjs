import { Router } from "express";

const SOURCE_ID_PATTERN = /^tpsrc_[0-9a-f]{32}$/;
const NODE_ID_PATTERN = /^tpnode_[0-9a-f]{32}$/;
const REVISION_PATTERN = /^[0-9a-f]{64}$/;
const CREATE_KEYS = new Set(["name", "yamlContent", "regionOverride", "tiers", "enabled"]);
const PREVIEW_KEYS = new Set(["yamlContent", "regionOverride"]);
const PATCH_KEYS = new Set(["name", "tiers", "enabled"]);
const SAVE_NODES_KEYS = new Set(["revision", "nodes"]);
const ENABLE_NODES_KEYS = new Set(["revision"]);
const NODE_KEYS = new Set(["id", "customName"]);
const MAX_INLINE_YAML_BYTES = 64 * 1024;
const MAX_SOURCE_NODES = 256;
const PUBLIC_ERROR_CODES = new Set([
  "invalid_input",
  "invalid_name",
  "invalid_yaml",
  "invalid_region",
  "invalid_tiers",
  "invalid_enabled",
  "invalid_node",
  "invalid_node_name",
  "duplicate_node_name",
  "revision_conflict",
  "source_enabled",
  "empty_source",
  "unsupported_source_kind",
  "parse_no_valid_nodes",
  "protected_value_invalid",
  "remote_import_disabled",
  "remote_refresh_disabled",
  "not_found",
  "third_party_unavailable"
]);

function sendError(res, status, code) {
  res.set("Cache-Control", "no-store");
  res.status(status).json({ error: code });
}

function publicErrorCode(error, fallback) {
  const code = typeof error?.code === "string" ? error.code : "";
  return PUBLIC_ERROR_CODES.has(code) ? code : fallback;
}

function sendStoreError(res, error, fallback) {
  const code = publicErrorCode(error, fallback);
  sendError(res, statusForCode(code), code);
}

function featureStore(state) {
  const feature = state?.thirdPartySubscriptions;
  if (!feature?.enabled || feature.available !== true || !feature.store) {
    return null;
  }
  return feature.store;
}

function objectBody(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function assertKnownKeys(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return false;
    }
  }
  return true;
}

function picked(body, allowed) {
  const input = {};
  for (const key of allowed) {
    if (Object.hasOwn(body, key)) input[key] = body[key];
  }
  return input;
}

function yamlByteLength(value) {
  return typeof value === "string" ? Buffer.byteLength(value, "utf8") : null;
}

function statusForCode(code) {
  if (code === "not_found") return 404;
  if (code === "revision_conflict" || code === "source_enabled") return 409;
  if (code === "third_party_unavailable") return 503;
  return 400;
}

function validRevision(value) {
  return typeof value === "string" && REVISION_PATTERN.test(value);
}

function validNodeList(value) {
  return Array.isArray(value) && value.length <= MAX_SOURCE_NODES && value.every((node) => {
    const body = objectBody(node);
    return body && assertKnownKeys(body, NODE_KEYS)
      && typeof body.id === "string" && NODE_ID_PATTERN.test(body.id)
      && Object.hasOwn(body, "customName")
      && (body.customName === null || typeof body.customName === "string");
  });
}

export function adminThirdPartySubscriptionRoutes(state) {
  const router = Router();

  router.use("/api/admin/third-party-subscriptions", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    // Reuse the existing session principal when Admin login is enabled. A
    // gateway-authenticated cookie with an invalid configured role must not
    // inherit the legacy console-token access path.
    if (state.platform?.adminAuthRoutesEnabled && state.platform?.adminAuth
      && !["admin", "super_admin"].includes(req.adminPrincipal?.role)) {
      sendError(res, 403, "admin_permission_required");
      return;
    }
    const store = featureStore(state);
    if (!store) {
      sendError(res, 503, "third_party_unavailable");
      return;
    }
    req.thirdPartyStore = store;
    next();
  });

  // Inline YAML import. enabled defaults to false in the store. enabled true is
  // an explicit publication request and is the only create-time publish signal.
  // subscriptionUrl alone is remote_import_disabled and is not resolved or fetched.
  // yamlContent together with subscriptionUrl is invalid_input. The global JSON
  // body limit is unchanged; yamlContent itself must be <= 64KiB.
  router.post("/api/admin/third-party-subscriptions/sources", (req, res) => {
    try {
      const body = objectBody(req.body);
      if (!body) {
        sendError(res, 400, "invalid_input");
        return;
      }
      const unknown = Object.keys(body).filter((key) => key !== "subscriptionUrl" && !CREATE_KEYS.has(key));
      if (unknown.length > 0) {
        sendError(res, 400, "invalid_input");
        return;
      }
      const hasYaml = Object.hasOwn(body, "yamlContent");
      const hasUrl = Object.hasOwn(body, "subscriptionUrl");
      if (hasYaml && hasUrl) {
        sendError(res, 400, "invalid_input");
        return;
      }
      if (hasUrl) {
        sendError(res, 400, "remote_import_disabled");
        return;
      }
      if (!hasYaml) {
        sendError(res, 400, "invalid_input");
        return;
      }
      const yamlBytes = yamlByteLength(body.yamlContent);
      if (yamlBytes === null || yamlBytes > MAX_INLINE_YAML_BYTES) {
        sendError(res, 400, "invalid_yaml");
        return;
      }
      const source = req.thirdPartyStore.createInlineSource(picked(body, CREATE_KEYS));
      res.status(201).json(source);
    } catch (error) {
      sendStoreError(res, error, "invalid_input");
    }
  });

  router.post("/api/admin/third-party-subscriptions/sources/preview", (req, res) => {
    try {
      const body = objectBody(req.body);
      if (!body || !assertKnownKeys(body, PREVIEW_KEYS) || !Object.hasOwn(body, "yamlContent")) {
        sendError(res, 400, "invalid_input");
        return;
      }
      const yamlBytes = yamlByteLength(body.yamlContent);
      if (yamlBytes === null || yamlBytes > MAX_INLINE_YAML_BYTES) {
        sendError(res, 400, "invalid_yaml");
        return;
      }
      res.json(req.thirdPartyStore.previewInlineYaml(picked(body, PREVIEW_KEYS)));
    } catch (error) {
      sendStoreError(res, error, "invalid_yaml");
    }
  });

  router.get("/api/admin/third-party-subscriptions/sources", (_req, res) => {
    try {
      res.json({ items: _req.thirdPartyStore.listSources() });
    } catch (error) {
      sendStoreError(res, error, "third_party_unavailable");
    }
  });

  router.get("/api/admin/third-party-subscriptions/summary", (req, res) => {
    try {
      res.json(req.thirdPartyStore.getSummary());
    } catch (error) {
      sendStoreError(res, error, "third_party_unavailable");
    }
  });

  router.get("/api/admin/third-party-subscriptions/sources/:id/nodes", (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!SOURCE_ID_PATTERN.test(id)) {
        sendError(res, 404, "not_found");
        return;
      }
      res.json(req.thirdPartyStore.listSourceNodes(id));
    } catch (error) {
      sendStoreError(res, error, "third_party_unavailable");
    }
  });

  // Full retained-node list: omissions are logical deletions. The store checks
  // this revision transactionally and refuses mutations of enabled sources.
  router.put("/api/admin/third-party-subscriptions/sources/:id/nodes", (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!SOURCE_ID_PATTERN.test(id)) {
        sendError(res, 404, "not_found");
        return;
      }
      const body = objectBody(req.body);
      if (!body || !assertKnownKeys(body, SAVE_NODES_KEYS)
        || !validRevision(body.revision) || !validNodeList(body.nodes)) {
        sendError(res, 400, "invalid_input");
        return;
      }
      res.json(req.thirdPartyStore.saveSourceNodes(id, body));
    } catch (error) {
      sendStoreError(res, error, "third_party_unavailable");
    }
  });

  router.post("/api/admin/third-party-subscriptions/sources/:id/enable", (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!SOURCE_ID_PATTERN.test(id)) {
        sendError(res, 404, "not_found");
        return;
      }
      const body = objectBody(req.body);
      if (!body || !assertKnownKeys(body, ENABLE_NODES_KEYS) || !validRevision(body.revision)) {
        sendError(res, 400, "invalid_input");
        return;
      }
      res.json(req.thirdPartyStore.enableSourceNodes(id, body));
    } catch (error) {
      sendStoreError(res, error, "third_party_unavailable");
    }
  });

  router.patch("/api/admin/third-party-subscriptions/sources/:id", (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!SOURCE_ID_PATTERN.test(id)) {
        sendError(res, 404, "not_found");
        return;
      }
      const body = objectBody(req.body);
      if (!body) {
        sendError(res, 400, "invalid_input");
        return;
      }
      if (!assertKnownKeys(body, PATCH_KEYS)) {
        sendError(res, 400, "invalid_input");
        return;
      }
      res.json(req.thirdPartyStore.patchSource(id, body));
    } catch (error) {
      sendStoreError(res, error, "invalid_input");
    }
  });

  router.post("/api/admin/third-party-subscriptions/sources/:id/refresh", async (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!SOURCE_ID_PATTERN.test(id)) {
        sendError(res, 404, "not_found");
        return;
      }
      const result = await req.thirdPartyStore.refreshSource(id);
      res.json(result);
    } catch (error) {
      sendStoreError(res, error, "remote_refresh_disabled");
    }
  });

  return router;
}
