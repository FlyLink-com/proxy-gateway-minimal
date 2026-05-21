import express from "express";
import { join } from "node:path";
import { createAuthMiddleware } from "./middleware/auth.mjs";
import { legacyProxyRoutes } from "./routes/legacy-proxy.mjs";
import { statusRoutes } from "./routes/status.mjs";

const PUBLIC_PATHS = ["/api/health", "/proxy.pac"];

export function createApp(state) {
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware({ token: state.consoleToken, publicPaths: PUBLIC_PATHS }));
  app.use(express.static(join(state.rootDir, "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now(), authRequired: true });
  });
  app.get("/api/status", statusRoutes(state));
  app.use(legacyProxyRoutes(state));

  return app;
}
