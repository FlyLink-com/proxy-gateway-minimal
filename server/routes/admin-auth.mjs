import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { createAdminPrincipal } from "../services/platform/admin-auth.mjs";
import { authorizeAdmin } from "../services/platform/admin-authorization.mjs";

const ADMIN_AUTH_ATTEMPT_WINDOW_MS = 60_000;
const ADMIN_AUTH_ATTEMPT_MAX = 10;

function sendAdminAuthError(res, error) {
  if (error.code === "invalid_admin_login") {
    res.status(401).json({ error: "invalid_admin_login" });
    return;
  }
  if (error.code === "invalid_totp") {
    res.status(401).json({ error: "invalid_totp" });
    return;
  }
  if (error.code === "admin_operator_already_configured") {
    res.status(409).json({ error: "admin_operator_already_configured" });
    return;
  }
  if (error.code === "validation_error") {
    res.status(400).json({ error: "validation_error" });
    return;
  }
  res.status(500).json({ error: "internal_error" });
}

function sourceIpSafeRef(req) {
  return req.ip ? `ip:${req.ip}` : null;
}

export const ADMIN_AUTH_PUBLIC_PATHS = [
  "/api/admin-auth/session",
  "/api/admin-auth/bootstrap/start",
  "/api/admin-auth/totp/enrollment/confirm",
  "/api/admin-auth/login",
  "/api/admin-auth/totp/verify",
  "/api/admin-auth/logout"
];

export function adminAuthRoutes(state, options = {}) {
  const router = Router();
  const auth = options.adminAuth || state.platform?.adminAuth;
  const loginAttemptRateLimit = rateLimit({
    windowMs: ADMIN_AUTH_ATTEMPT_WINDOW_MS,
    limit: ADMIN_AUTH_ATTEMPT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too Many Requests" }
  });
  const totpAttemptRateLimit = rateLimit({
    windowMs: ADMIN_AUTH_ATTEMPT_WINDOW_MS,
    limit: ADMIN_AUTH_ATTEMPT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too Many Requests" }
  });

  router.get("/api/admin-auth/session", (req, res) => {
    try {
      res.json(auth.sessionStatus({ cookieHeader: req.get("cookie") }));
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/bootstrap/start", (req, res) => {
    try {
      res.status(201).json(auth.startBootstrap({
        bootstrapToken: req.body?.bootstrapToken
      }));
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/totp/enrollment/confirm", (req, res) => {
    try {
      const result = auth.confirmTotpEnrollment({
        enrollmentRef: req.body?.enrollmentRef,
        code: req.body?.code,
        sourceIpSafeRef: sourceIpSafeRef(req)
      });
      res.set("Set-Cookie", result.sessionCookie);
      res.json({ session: result.session });
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/login", loginAttemptRateLimit, (req, res) => {
    try {
      const result = auth.login({
        operatorRef: req.body?.operatorRef,
        bootstrapToken: req.body?.bootstrapToken
      });
      res.status(202).json({ challenge: result.challenge });
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/totp/verify", totpAttemptRateLimit, (req, res) => {
    try {
      const result = auth.verifyTotp({
        challengeRef: req.body?.challengeRef,
        code: req.body?.code,
        sourceIpSafeRef: sourceIpSafeRef(req)
      });
      res.set("Set-Cookie", result.sessionCookie);
      res.json({ session: result.session });
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/logout", (req, res) => {
    try {
      const result = auth.logout({ cookieHeader: req.get("cookie") });
      res.set("Set-Cookie", result.clearCookie);
      res.json({ loggedOut: true });
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  return router;
}

export function requireAdminCapability(capability) {
  return (req, res, next) => {
    const decision = authorizeAdmin({
      principal: req.adminPrincipal,
      capability
    });

    if (decision.allowed) {
      next();
      return;
    }
    if (decision.reasonCode === "principal_missing") {
      res.status(401).json({ error: "admin_authentication_required" });
      return;
    }
    res.status(403).json({
      error: "admin_capability_required",
      capability: decision.capability
    });
  };
}

export function createAdminSessionGatewayMiddleware({ adminAuth, consoleToken, role = "admin" }) {
  return (req, _res, next) => {
    delete req.headers.authorization;
    const session = adminAuth.authenticateCookie({ cookieHeader: req.get("cookie") });
    if (session) {
      req.adminPrincipal = createAdminPrincipal({ session, role });
      req.headers.authorization = `Bearer ${consoleToken}`;
    }
    next();
  };
}
