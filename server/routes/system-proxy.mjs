import { Router } from "express";

export function systemProxyRoutes(state) {
  const router = Router();

  router.post("/api/system-proxy/:action", async (req, res) => {
    res.json(await state.runCommand("system-proxy", { action: req.params.action }));
  });

  router.post("/api/env-proxy/on", async (_req, res) => {
    res.json(await state.runCommand("env-proxy-on"));
  });

  router.post("/api/env-proxy/off", async (_req, res) => {
    res.json(await state.runCommand("env-proxy-off"));
  });

  router.get("/api/env-proxy/status", async (_req, res) => {
    const result = await state.runCommand("env-proxy-status");
    res.json({ ok: result.ok, output: result.stdout, error: result.stderr || undefined });
  });

  router.post("/api/autostart/on", async (_req, res) => {
    res.json(await state.runCommand("autostart-on"));
  });

  router.post("/api/autostart/off", async (_req, res) => {
    res.json(await state.runCommand("autostart-off"));
  });

  router.get("/api/autostart/status", async (_req, res) => {
    const result = await state.runCommand("autostart-status");
    res.json({ ok: true, enabled: result.ok });
  });

  return router;
}
