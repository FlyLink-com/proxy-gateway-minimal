import express from "express";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createAdminAllowlistMiddleware } from "./middleware/admin-allowlist.mjs";
import { createAdminCorsMiddleware } from "./middleware/admin-cors.mjs";
import { createPortalAllowlistMiddleware } from "./middleware/portal-allowlist.mjs";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { createRateLimitMiddleware } from "./middleware/rate-limit.mjs";
import { legacyProxyRoutes } from "./routes/legacy-proxy.mjs";
import { statusRoutes } from "./routes/status.mjs";
import { diagnosticsRoutes } from "./routes/diagnostics.mjs";
import { systemProxyRoutes } from "./routes/system-proxy.mjs";
import { networkRoutes } from "./routes/network.mjs";
import { adminSubscriptionRoutes } from "./routes/admin-subscriptions.mjs";
import { adminPlatformRoutes } from "./routes/admin-platform.mjs";
import {
  ADMIN_AUTH_PUBLIC_PATHS,
  adminAuthRoutes,
  createAdminSessionGatewayMiddleware
} from "./routes/admin-auth.mjs";
import { subscriptionRoutes } from "./routes/subscription.mjs";
import { publicLeadRoutes } from "./routes/public-leads.mjs";
import { userPortalRoutes } from "./routes/user-portal.mjs";
import { dataPlaneAgentRoutes } from "./routes/data-plane-agent.mjs";
import { resolveClientIp } from "./services/ip-address.mjs";

const PUBLIC_PATHS = ["/api/health", "/api/public/leads", "/proxy.pac", "/sub/clash.yaml"];
const PUBLIC_PATH_PREFIXES = ["/sub/a/"];
const USER_PORTAL_PUBLIC_PATHS = [
  "/api/portal/human-challenges",
  "/api/portal/registration",
  "/api/portal/registration/email-verification",
  "/api/portal/password/session",
  "/api/portal/password/second-factor",
  "/api/portal/entry/enroll",
  "/api/portal/session",
  "/api/portal/access-requests",
  "/api/portal/access-requests/current",
  "/api/portal/access-requests/refresh",
  "/api/portal/access-requests/reveal",
  "/api/portal/access-requests/disable",
  "/api/portal/payments/checkout",
  "/api/portal/payments/current",
  "/api/portal/payments/notify",
  "/api/portal/security/current",
  "/api/portal/security/totp/enrollment",
  "/api/portal/security/totp/enrollment/confirm",
  "/api/portal/support-requests"
];
const DEFAULT_PUBLIC_LEAD_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 8 };
const DEFAULT_PUBLIC_LEAD_IDENTITY_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 3 };
const DEFAULT_PORTAL_CHALLENGE_RATE_LIMIT = { windowMs: 5 * 60 * 1000, max: 10 };
const DEFAULT_PORTAL_REGISTRATION_EMAIL_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 3 };
const DEFAULT_PORTAL_REGISTRATION_EMAIL_IDENTITY_RATE_LIMIT = { windowMs: 24 * 60 * 60 * 1000, max: 3 };
const DEFAULT_PORTAL_REGISTRATION_RATE_LIMIT = { windowMs: 60 * 60 * 1000, max: 8 };
const DEFAULT_PORTAL_REGISTRATION_IDENTITY_RATE_LIMIT = { windowMs: 24 * 60 * 60 * 1000, max: 3 };
const DEFAULT_PORTAL_PASSWORD_SESSION_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 12 };
const DEFAULT_PORTAL_PASSWORD_SESSION_IDENTITY_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 5 };
const DEFAULT_PORTAL_SECOND_FACTOR_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 20 };
const DEFAULT_PORTAL_SECOND_FACTOR_IDENTITY_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 5 };

function rateLimitConfig(defaults, overrides) {
  return {
    ...defaults,
    ...(overrides || {})
  };
}

function hashRateLimitKey(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function bodyIdentityKey(req, fields, fallbackKey) {
  for (const field of fields) {
    const value = req.body?.[field];
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized) {
      return `body:${field}:${hashRateLimitKey(normalized)}`;
    }
  }
  return `fallback:${hashRateLimitKey(fallbackKey || "unknown")}`;
}

function exactMountedPathOnly(middleware) {
  return (req, res, next) => {
    if (req.path !== "/") {
      next();
      return;
    }
    middleware(req, res, next);
  };
}

export function createApp(state, options = {}) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.use(express.static(join(state.rootDir, "public")));
  const security = state.security || {};
  const userPortalRoutesEnabled = Boolean(
    state.platform?.userPortalRoutesEnabled
    && (
      state.platform?.userPortalAuth
      || state.platform?.portalAccessRequests
      || state.platform?.portalRegistrations
      || state.platform?.portalPayments
      || state.platform?.portalSupportRequests
    )
  );
  const dataPlaneAgentRoutesEnabled = Boolean(
    state.platform?.dataPlaneAgentRoutesEnabled
    && state.platform?.dataPlaneAgentService
  );
  const adminAuthRoutesEnabled = Boolean(
    state.platform?.adminAuthRoutesEnabled
    && state.platform?.adminAuth
  );
  const authPublicPaths = [
    ...PUBLIC_PATHS,
    ...(userPortalRoutesEnabled ? USER_PORTAL_PUBLIC_PATHS : []),
    ...(adminAuthRoutesEnabled ? ADMIN_AUTH_PUBLIC_PATHS : [])
  ];
  const clientIpResolver = options.clientIpResolver || ((req) => resolveClientIp(req, {
    trustedProxyCidrs: security.trustedProxyCidrs
  }));
  app.use("/api/public/leads", createRateLimitMiddleware({
    ...rateLimitConfig(DEFAULT_PUBLIC_LEAD_RATE_LIMIT, security.publicLeadRateLimit),
    nowFn: options.rateLimitNowFn,
    keyFn: clientIpResolver
  }));
  app.use("/api/public/leads", createRateLimitMiddleware({
    ...rateLimitConfig(DEFAULT_PUBLIC_LEAD_IDENTITY_RATE_LIMIT, security.publicLeadIdentityRateLimit),
    nowFn: options.rateLimitNowFn,
    keyFn: (req) => bodyIdentityKey(req, ["email", "phone", "organization"], clientIpResolver(req))
  }));
  if (userPortalRoutesEnabled) {
    app.use("/api/portal", createPortalAllowlistMiddleware({
      allowedCidrs: security.userPortalAllowedCidrs,
      resolveClientIpFn: clientIpResolver
    }));
    app.use("/api/portal/human-challenges", createRateLimitMiddleware({
      ...rateLimitConfig(DEFAULT_PORTAL_CHALLENGE_RATE_LIMIT, security.portalChallengeRateLimit),
      nowFn: options.rateLimitNowFn,
      keyFn: clientIpResolver
    }));
    app.use("/api/portal/registration/email-verification", createRateLimitMiddleware({
      ...rateLimitConfig(
        DEFAULT_PORTAL_REGISTRATION_EMAIL_RATE_LIMIT,
        security.portalRegistrationEmailRateLimit
      ),
      nowFn: options.rateLimitNowFn,
      keyFn: clientIpResolver
    }));
    app.use("/api/portal/registration/email-verification", createRateLimitMiddleware({
      ...rateLimitConfig(
        DEFAULT_PORTAL_REGISTRATION_EMAIL_IDENTITY_RATE_LIMIT,
        security.portalRegistrationEmailIdentityRateLimit
      ),
      nowFn: options.rateLimitNowFn,
      keyFn: (req) => bodyIdentityKey(req, ["email"], clientIpResolver(req))
    }));
    app.use("/api/portal/registration", exactMountedPathOnly(createRateLimitMiddleware({
      ...rateLimitConfig(DEFAULT_PORTAL_REGISTRATION_RATE_LIMIT, security.portalRegistrationRateLimit),
      nowFn: options.rateLimitNowFn,
      keyFn: clientIpResolver
    })));
    app.use("/api/portal/registration", exactMountedPathOnly(createRateLimitMiddleware({
      ...rateLimitConfig(
        DEFAULT_PORTAL_REGISTRATION_IDENTITY_RATE_LIMIT,
        security.portalRegistrationIdentityRateLimit
      ),
      nowFn: options.rateLimitNowFn,
      keyFn: (req) => bodyIdentityKey(req, ["email", "userRef", "accountId"], clientIpResolver(req))
    })));
    app.use("/api/portal/password/session", createRateLimitMiddleware({
      ...rateLimitConfig(DEFAULT_PORTAL_PASSWORD_SESSION_RATE_LIMIT, security.portalPasswordSessionRateLimit),
      nowFn: options.rateLimitNowFn,
      keyFn: clientIpResolver
    }));
    app.use("/api/portal/password/session", createRateLimitMiddleware({
      ...rateLimitConfig(
        DEFAULT_PORTAL_PASSWORD_SESSION_IDENTITY_RATE_LIMIT,
        security.portalPasswordSessionIdentityRateLimit
      ),
      nowFn: options.rateLimitNowFn,
      keyFn: (req) => bodyIdentityKey(req, ["accountId", "email", "userRef"], clientIpResolver(req))
    }));
    app.use("/api/portal/password/second-factor", createRateLimitMiddleware({
      ...rateLimitConfig(DEFAULT_PORTAL_SECOND_FACTOR_RATE_LIMIT, security.portalSecondFactorRateLimit),
      nowFn: options.rateLimitNowFn,
      keyFn: clientIpResolver
    }));
    app.use("/api/portal/password/second-factor", createRateLimitMiddleware({
      ...rateLimitConfig(
        DEFAULT_PORTAL_SECOND_FACTOR_IDENTITY_RATE_LIMIT,
        security.portalSecondFactorIdentityRateLimit
      ),
      nowFn: options.rateLimitNowFn,
      keyFn: (req) => bodyIdentityKey(req, ["challengeRef", "accountId", "email"], clientIpResolver(req))
    }));
  }
  app.use("/api/admin", createAdminAllowlistMiddleware({
    allowedCidrs: security.adminAllowedCidrs,
    resolveClientIpFn: clientIpResolver
  }));
  app.use("/api/admin", createAdminCorsMiddleware({
    allowedOrigins: security.adminAllowedOrigins
  }));
  if (adminAuthRoutesEnabled) {
    app.use("/api/admin-auth", createAdminAllowlistMiddleware({
      allowedCidrs: security.adminAllowedCidrs,
      resolveClientIpFn: clientIpResolver
    }));
    app.use("/api/admin-auth", createAdminCorsMiddleware({
      allowedOrigins: security.adminAllowedOrigins
    }));
    app.use(adminAuthRoutes(state));
    app.use("/api/admin", createAdminSessionGatewayMiddleware({
      adminAuth: state.platform.adminAuth,
      consoleToken: state.consoleToken
    }));
  }
  if (dataPlaneAgentRoutesEnabled) {
    app.use(dataPlaneAgentRoutes(state, {
      resolveClientIpFn: clientIpResolver
    }));
  }
  app.use(createAuthMiddleware({
    token: state.consoleToken,
    publicPaths: authPublicPaths,
    publicPathPrefixes: PUBLIC_PATH_PREFIXES
  }));
  app.use(publicLeadRoutes(state));
  if (userPortalRoutesEnabled) {
    app.use(userPortalRoutes(state));
  }
  app.get("/api/status", statusRoutes(state));
  app.use(legacyProxyRoutes(state));
  app.use(systemProxyRoutes(state));
  app.use(networkRoutes(state));
  if (state.subscriptions?.core || state.subscriptions?.service) {
    app.use(adminSubscriptionRoutes(state));
  }
  if (
    state.platform?.leadQueue
    || state.platform?.accountShell
    || state.platform?.accessShell
    || state.platform?.portalAccessRequests
    || state.platform?.portalPayments
    || state.platform?.controlStore
    || state.platform?.edgeUsageAccounting
    || state.platform?.dataPlaneHandoffQueue
  ) {
    app.use(adminPlatformRoutes(state));
  }
  app.use("/sub", createRateLimitMiddleware({
    windowMs: security.subRateLimit?.windowMs,
    max: security.subRateLimit?.max,
    nowFn: options.rateLimitNowFn,
    keyFn: clientIpResolver
  }));
  app.use(subscriptionRoutes(state));
  app.use(diagnosticsRoutes(state));

  return app;
}
