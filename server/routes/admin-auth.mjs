import { isIP } from "node:net";
import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { normalizeIpAddress, resolveClientIp } from "../services/ip-address.mjs";
import { createAdminPrincipal } from "../services/platform/admin-auth.mjs";

const ADMIN_AUTH_ATTEMPT_WINDOW_MS = 60_000;
const ADMIN_AUTH_ATTEMPT_MAX = 10;
const ADMIN_AUTH_IPV6_SUBNET = 56;
const ADMIN_AUTH_SOURCE_IP = Symbol("adminAuthSourceIp");

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
  return `ip:${req[ADMIN_AUTH_SOURCE_IP]}`;
}

function normalizeAdminSourceIp(value) {
  const ip = typeof value === "string" ? normalizeIpAddress(value) : "";
  if (!isIP(ip)) return "";
  if (isIP(ip) !== 6) return ip;

  // URL parsing is local: canonicalize legal IPv6 spellings before recognizing
  // mapped IPv4. ipKeyGenerator only recognizes mapped dotted-decimal notation.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
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
  const resolveClientIpFn = options.resolveClientIpFn || resolveClientIp;
  const requireSourceIp = (req, res, next) => {
    let sourceIp;
    try {
      sourceIp = normalizeAdminSourceIp(resolveClientIpFn(req));
    } catch {
      sourceIp = "";
    }
    if (!isIP(sourceIp)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    req[ADMIN_AUTH_SOURCE_IP] = sourceIp;
    next();
  };
  const requirePrivateSetup = (_req, res, next) => {
    if (state.platform?.adminPublicLoginEnabled === true) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    next();
  };
  const createAttemptRateLimit = () => rateLimit({
    windowMs: ADMIN_AUTH_ATTEMPT_WINDOW_MS,
    limit: ADMIN_AUTH_ATTEMPT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Only the validated application resolver establishes the source address.
    // Express trust-proxy settings and untrusted XFF never select this key.
    keyGenerator: (req) => ipKeyGenerator(req[ADMIN_AUTH_SOURCE_IP], ADMIN_AUTH_IPV6_SUBNET),
    message: { error: "Too Many Requests" }
  });
  const loginAttemptRateLimit = createAttemptRateLimit();
  const totpAttemptRateLimit = createAttemptRateLimit();
  const bootstrapAttemptRateLimit = createAttemptRateLimit();
  const enrollmentAttemptRateLimit = createAttemptRateLimit();

  router.get("/api/admin-auth/session", (req, res) => {
    try {
      const status = auth.sessionStatus({ cookieHeader: req.get("cookie") });
      res.json(state.platform?.adminPublicLoginEnabled === true && status?.authenticated !== true
        ? { authenticated: false, mode: "portalAccount" }
        : status);
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/bootstrap/start", requirePrivateSetup, requireSourceIp, bootstrapAttemptRateLimit, (req, res) => {
    try {
      res.status(201).json(auth.startBootstrap({
        bootstrapToken: req.body?.bootstrapToken
      }));
    } catch (error) {
      sendAdminAuthError(res, error);
    }
  });

  router.post("/api/admin-auth/totp/enrollment/confirm", requirePrivateSetup, requireSourceIp, enrollmentAttemptRateLimit, (req, res) => {
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

  router.post("/api/admin-auth/login", requireSourceIp, loginAttemptRateLimit, (req, res) => {
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

  router.post("/api/admin-auth/totp/verify", requireSourceIp, totpAttemptRateLimit, (req, res) => {
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
