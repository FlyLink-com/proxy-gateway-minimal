import { Router } from "express";

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

  router.post("/api/admin-auth/login", (req, res) => {
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

  router.post("/api/admin-auth/totp/verify", (req, res) => {
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

export function createAdminSessionGatewayMiddleware({ adminAuth, consoleToken }) {
  return (req, _res, next) => {
    delete req.headers.authorization;
    const session = adminAuth.authenticateCookie({ cookieHeader: req.get("cookie") });
    if (session) {
      req.headers.authorization = `Bearer ${consoleToken}`;
    }
    next();
  };
}
