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
import { subscriptionRoutes } from "./routes/subscription.mjs";
import { resolveClientIp } from "./services/ip-address.mjs";

const PUBLIC_PATHS = ["/api/health", "/proxy.pac", "/sub/clash.yaml"];

export function createApp(state, options = {}) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.use(express.static(join(state.rootDir, "public")));
  const clientIpResolver = options.clientIpResolver || resolveClientIp;
  const security = state.security || {};
  app.use("/api/admin", createAdminAllowlistMiddleware({
    allowedCidrs: security.adminAllowedCidrs,
    resolveClientIpFn: clientIpResolver
  }));
  app.use(createAuthMiddleware({ token: state.consoleToken, publicPaths: PUBLIC_PATHS }));
  app.get("/api/status", statusRoutes(state));
  app.use(legacyProxyRoutes(state));
  app.use(systemProxyRoutes(state));
  app.use(networkRoutes(state));
  if (state.subscriptions?.service) {
    app.use(adminSubscriptionRoutes(state));
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
