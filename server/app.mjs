import { createHash } from "node:crypto";
import express from "express";
import { join } from "node:path";
import { createAdminAllowlistMiddleware } from "./middleware/admin-allowlist.mjs";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { createRateLimitMiddleware } from "./middleware/rate-limit.mjs";
import {
  localProxyControlRoutes,
  localProxyControlRoutesEnabled
} from "./routes/local-proxy-control.mjs";
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
  "/api/portal/access-requests/reveal",
  "/api/portal/access-requests/refresh",
  "/api/portal/access-requests/disable",
  "/api/portal/security/current",
  "/api/portal/security/totp/enrollment",
  "/api/portal/security/totp/enrollment/confirm",
  "/api/portal/payments/current",
  "/api/portal/payments/checkout",
  "/api/portal/payments/capture",
  "/api/portal/support-requests"
];

function hashRateLimitValue(value) {
  return createHash("sha256")
    .update(String(value || ""))
    .digest("hex")
    .slice(0, 24);
}

function trimYamlSuffix(value) {
  return String(value || "").replace(/\.ya?ml$/i, "");
}

function subscriptionCredentialRateLimitKey(req, fallbackKeyFn) {
  const fallbackKey = () => `ip:${hashRateLimitValue(
    fallbackKeyFn(req) || req.ip || req.socket?.remoteAddress || "unknown"
  )}`;
  let url;
  try {
    url = new URL(req.originalUrl || req.url || "", "http://127.0.0.1");
  } catch {
    return fallbackKey();
  }

  const artifactPrefix = "/sub/a/";
  if (url.pathname.startsWith(artifactPrefix)) {
    const [artifactSegment] = url.pathname.slice(artifactPrefix.length).split("/");
    const artifact = trimYamlSuffix(artifactSegment);
    if (artifact) {
      return `artifact:${hashRateLimitValue(artifact)}`;
    }
  }

  if (url.pathname === "/sub/clash.yaml") {
    const token = url.searchParams.get("token") || "";
    if (token) {
      return `token:${hashRateLimitValue(token)}`;
    }
  }

  return fallbackKey();
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
      || state.platform?.portalRegistrationEmailVerifications
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
  app.use("/api/admin", createAdminAllowlistMiddleware({
    allowedCidrs: security.adminAllowedCidrs,
    resolveClientIpFn: clientIpResolver
  }));
  if (adminAuthRoutesEnabled) {
    app.use("/api/admin-auth", createAdminAllowlistMiddleware({
      allowedCidrs: security.adminAllowedCidrs,
      resolveClientIpFn: clientIpResolver
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
  if (localProxyControlRoutesEnabled(state)) {
    app.use(localProxyControlRoutes(state));
  }
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
    || state.platform?.controlStore
    || state.platform?.edgeUsageAccounting
    || state.platform?.trafficCollectorStatusStore
    || state.platform?.dataPlaneHandoffQueue
    || state.platform?.partnerAttributionStore
    || state.platform?.partnerAttributionEventLedger
    || state.platform?.partnerSettlementCandidateEngine
  ) {
    app.use(adminPlatformRoutes(state));
  }
  app.use("/sub", createRateLimitMiddleware({
    windowMs: security.subRateLimit?.windowMs,
    max: security.subRateLimit?.max,
    nowFn: options.rateLimitNowFn,
    keyFn: clientIpResolver
  }));
  if (security.subCredentialRateLimit) {
    app.use("/sub", createRateLimitMiddleware({
      windowMs: security.subCredentialRateLimit.windowMs,
      max: security.subCredentialRateLimit.max,
      nowFn: options.rateLimitNowFn,
      keyFn: (req) => subscriptionCredentialRateLimitKey(req, clientIpResolver)
    }));
  }
  app.use(subscriptionRoutes(state, {
    resolveClientIpFn: clientIpResolver
  }));
  app.use(diagnosticsRoutes(state));

  return app;
}
