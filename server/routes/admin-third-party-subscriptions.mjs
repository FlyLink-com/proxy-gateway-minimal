import { Router } from "express";

const SOURCE_ID_PATTERN = /^tpsrc_[0-9a-f]{32}$/;
const CREATE_KEYS = new Set(["name", "subscriptionUrl", "regionOverride", "tiers", "enabled"]);
const PATCH_KEYS = new Set(["name", "regionOverride", "tiers", "enabled"]);

function sendError(res, status, code) {
  res.status(status).json({ error: code });
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
      const error = new Error("invalid_input");
      error.code = "invalid_input";
      throw error;
    }
  }
}

function statusForCode(code) {
  if (code === "not_found") return 404;
  if (code === "third_party_unavailable") return 503;
  return 400;
}

export function adminThirdPartySubscriptionRoutes(state) {
  const router = Router();

  router.use("/api/admin/third-party-subscriptions", (req, res, next) => {
    const store = featureStore(state);
    if (!store) {
      sendError(res, 503, "third_party_unavailable");
      return;
    }
    req.thirdPartyStore = store;
    next();
  });

  router.post("/api/admin/third-party-subscriptions/sources", async (req, res) => {
    try {
      const body = objectBody(req.body);
      if (!body) {
        sendError(res, 400, "invalid_input");
        return;
      }
      assertKnownKeys(body, CREATE_KEYS);
      const source = req.thirdPartyStore.createSource(body);
      res.status(201).json(source);
    } catch (error) {
      sendError(res, statusForCode(error?.code), error?.code || "invalid_input");
    }
  });

  router.get("/api/admin/third-party-subscriptions/sources", (_req, res) => {
    try {
      res.json({ items: _req.thirdPartyStore.listSources() });
    } catch (error) {
      sendError(res, statusForCode(error?.code), error?.code || "third_party_unavailable");
    }
  });

  router.get("/api/admin/third-party-subscriptions/summary", (req, res) => {
    try {
      res.json(req.thirdPartyStore.getSummary());
    } catch (error) {
      sendError(res, statusForCode(error?.code), error?.code || "third_party_unavailable");
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
      assertKnownKeys(body, PATCH_KEYS);
      res.json(req.thirdPartyStore.patchSource(id, body));
    } catch (error) {
      sendError(res, statusForCode(error?.code), error?.code || "invalid_input");
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
      sendError(res, statusForCode(error?.code), error?.code || "fetch_failed");
    }
  });

  return router;
}
