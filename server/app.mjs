import express from "express";
import { join } from "node:path";
import { createAdminAllowlistMiddleware } from "./middleware/admin-allowlist.mjs";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { createRateLimitMiddleware } from "./middleware/rate-limit.mjs";
import { legacyProxyRoutes } from "./routes/legacy-proxy.mjs";
import { statusRoutes } from "./routes/status.mjs";
import { diagnosticsRoutes } from "./routes/diagnostics.mjs";
import { systemProxyRoutes } from "./routes/system-proxy.mjs";
import { networkRoutes } from "./routes/network.mjs";
import { adminSubscriptionRoutes } from "./routes/admin-subscriptions.mjs";
import { adminPlatformRoutes } from "./routes/admin-platform.mjs";
import { subscriptionRoutes } from "./routes/subscription.mjs";
import { publicLeadRoutes } from "./routes/public-leads.mjs";
import { userPortalRoutes } from "./routes/user-portal.mjs";
import { resolveClientIp } from "./services/ip-address.mjs";

const PUBLIC_PATHS = ["/api/health", "/api/public/leads", "/proxy.pac", "/sub/clash.yaml"];
const PUBLIC_PATH_PREFIXES = ["/sub/a/"];
const USER_PORTAL_PUBLIC_PATHS = [
  "/api/portal/human-challenges",
  "/api/portal/password/session",
  "/api/portal/password/second-factor",
  "/api/portal/entry/enroll",
  "/api/portal/session",
  "/api/portal/access-requests",
  "/api/portal/access-requests/current",
  "/api/portal/access-requests/refresh",
  "/api/portal/access-requests/disable",
  "/api/portal/security/current",
  "/api/portal/security/totp/enrollment",
  "/api/portal/security/totp/enrollment/confirm",
  "/api/portal/support-requests"
];

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
      || state.platform?.portalSupportRequests
    )
  );
  const clientIpResolver = options.clientIpResolver || ((req) => resolveClientIp(req, {
    trustedProxyCidrs: security.trustedProxyCidrs
  }));
  app.use("/api/admin", createAdminAllowlistMiddleware({
    allowedCidrs: security.adminAllowedCidrs,
    resolveClientIpFn: clientIpResolver
  }));
  app.use(createAuthMiddleware({
    token: state.consoleToken,
    publicPaths: userPortalRoutesEnabled ? [...PUBLIC_PATHS, ...USER_PORTAL_PUBLIC_PATHS] : PUBLIC_PATHS,
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
