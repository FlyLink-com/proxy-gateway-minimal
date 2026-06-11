import { Router } from "express";

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
  return 400;
}

function sendAgentError(res, service, error) {
  res.status(statusFromError(error)).json(service.safeErrorPayload?.(error) || {
    error: error?.code || "agent_error",
    message: error?.code || "agent_error",
    redacted: true
  });
}

export function dataPlaneAgentRoutes(state) {
  const service = state.platform?.dataPlaneAgentService;
  const router = Router();

  router.use((req, res, next) => {
    try {
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
      res.json(service.getDesiredState(req.dataPlaneAgentIdentity));
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
