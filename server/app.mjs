import express from "express";
import { join } from "node:path";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { legacyProxyRoutes } from "./routes/legacy-proxy.mjs";
import { statusRoutes } from "./routes/status.mjs";
import { diagnosticsRoutes } from "./routes/diagnostics.mjs";
import { systemProxyRoutes } from "./routes/system-proxy.mjs";
import { networkRoutes } from "./routes/network.mjs";
import { subscriptionRoutes } from "./routes/subscription.mjs";

const PUBLIC_PATHS = ["/api/health", "/proxy.pac"];

export function createApp(state) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.use(express.static(join(state.rootDir, "public")));
  app.use(createAuthMiddleware({ token: state.consoleToken, publicPaths: PUBLIC_PATHS }));
  app.get("/api/status", statusRoutes(state));
  app.use(legacyProxyRoutes(state));
  app.use(systemProxyRoutes(state));
  app.use(networkRoutes(state));
  app.use(subscriptionRoutes(state));
  app.use(diagnosticsRoutes(state));

  return app;
}
