import { Router } from "express";
import { DEFAULT_ADMIN_ALLOWED_CIDRS, createIpAllowlist, resolveClientIp } from "../services/ip-address.mjs";

function statusFromError(error) {
  if (Number.isInteger(error?.statusCode)) {
    return error.statusCode;
  }
  if (error?.code === "unauthorized") {
    return 401;
  }
  if (String(error?.code || "").includes("scope_mismatch")) {
    return 403;
  }
  if (error?.code === "desired_state_not_found") {
    return 404;
  }
  if (error?.code === "material_store_unavailable") {
    return 503;
  }
  if (error?.code === "material_not_found" || error?.code === "material_digest_not_found") {
    return 404;
  }
  if (error?.code === "material_digest_mismatch") {
    return 409;
  }
  return 400;
}

function sendAgentError(res, service, error) {
  res.status(statusFromError(error)).json(service.safeErrorPayload?.(error) || {
    error: error?.code || "agent_error",
    message: error?.code || "agent_error",
    redacted: true
  });
}

function queryRefs(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => queryRefs(item));
  }
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function dataPlaneAgentRoutes(state, {
  resolveClientIpFn = resolveClientIp
} = {}) {
  const service = state.platform?.dataPlaneAgentService;
  const isAllowedSourceIp = createIpAllowlist(
    state.security?.dataPlaneAgentAllowedCidrs || DEFAULT_ADMIN_ALLOWED_CIDRS
  );
  const router = Router();

  router.use("/api/internal/data-plane-agent", (req, res, next) => {
    try {
      const clientIp = resolveClientIpFn(req);
      if (!isAllowedSourceIp(clientIp)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.dataPlaneAgentIdentity = service.authenticate({
        authorization: req.headers.authorization
      });
      next();
    } catch (error) {
      sendAgentError(res, service, error);
    }
  });

  router.get("/api/internal/data-plane-agent/desired-state", (req, res) => {
    try {
      res.json(service.getDesiredState(req.dataPlaneAgentIdentity, {
        edgeCredentialRefs: queryRefs(req.query.edgeCredentialRefs),
        agentVersion: req.headers["x-gccgw-agent-version"],
        capabilities: req.headers["x-gccgw-agent-capabilities"]
      }));
    } catch (error) {
      sendAgentError(res, service, error);
    }
  });

  router.post("/api/internal/data-plane-agent/materials", (req, res) => {
    try {
      res.json(service.getCredentialMaterials(req.dataPlaneAgentIdentity, req.body));
    } catch (error) {
      sendAgentError(res, service, error);
    }
  });

  router.post("/api/internal/data-plane-agent/receipts", (req, res) => {
    try {
      res.status(201).json(service.recordReceipt(req.dataPlaneAgentIdentity, req.body));
    } catch (error) {
      sendAgentError(res, service, error);
    }
  });

  router.post("/api/internal/data-plane-agent/lease", (req, res) => {
    try {
      res.status(201).json(service.recordLease(req.dataPlaneAgentIdentity, req.body));
    } catch (error) {
      sendAgentError(res, service, error);
    }
  });

  return router;
}
