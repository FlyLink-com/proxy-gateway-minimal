import { Router } from "express";

function commandOutput(result) {
  return {
    ok: result.ok,
    output: result.stdout || "",
    error: result.ok ? undefined : result.stderr || undefined
  };
}

function commandMessage(result) {
  return {
    ok: result.ok,
    msg: result.stdout || "",
    error: result.ok ? undefined : result.stderr || undefined
  };
}

function parseEnvOutput(stdout = "") {
  const vars = {};
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [key, ...value] = line.split("=");
    vars[key.trim()] = value.join("=").trim();
  }
  return vars;
}

export function systemProxyRoutes(state) {
  const router = Router();

  router.post("/api/system-proxy/:action", async (req, res) => {
    res.json(commandOutput(await state.runCommand("system-proxy", { action: req.params.action })));
  });

  router.post("/api/env-proxy/on", async (_req, res) => {
    res.json(commandMessage(await state.runCommand("env-proxy-on")));
  });

  router.post("/api/env-proxy/off", async (_req, res) => {
    res.json(commandMessage(await state.runCommand("env-proxy-off")));
  });

  router.get("/api/env-proxy/status", async (_req, res) => {
    const result = await state.runCommand("env-proxy-status");
    const vars = parseEnvOutput(result.stdout);
    res.json({
      ok: result.ok,
      enabled: Boolean(vars.HTTP_PROXY || vars.HTTPS_PROXY || vars.ALL_PROXY),
      vars,
      error: result.ok ? undefined : result.stderr || undefined
    });
  });

  router.post("/api/autostart/on", async (_req, res) => {
    res.json(commandMessage(await state.runCommand("autostart-on")));
  });

  router.post("/api/autostart/off", async (_req, res) => {
    res.json(commandMessage(await state.runCommand("autostart-off")));
  });

  router.get("/api/autostart/status", async (_req, res) => {
    const result = await state.runCommand("autostart-status");
    res.json({ ok: true, enabled: result.ok });
  });

  return router;
}
