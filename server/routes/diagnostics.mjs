import { Router } from "express";
import nodeFetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import { allowedDiagnosticHosts, publicProxyConfig } from "../services/config.mjs";

export function diagnosticsRoutes(state) {
  const router = Router();

  router.get("/api/proxy/servers", (_req, res) => {
    res.json(publicProxyConfig(state.proxyConfig));
  });

  router.get("/api/nginx/status", async (_req, res) => {
    const host = state.proxyConfig.nginx?.host || "127.0.0.1";
    const ports = state.proxyConfig.nginx?.ports || [];
    const results = await Promise.all(ports.map(async (port) => ({
      port,
      host,
      ok: await state.isPortListening(port, host),
      ts: Date.now()
    })));
    res.json({ host, results, ts: Date.now() });
  });

  router.get("/api/ping/:host", async (req, res) => {
    if (!allowedDiagnosticHosts(state.proxyConfig).includes(req.params.host)) {
      res.status(403).json({ error: "Host not allowed" });
      return;
    }
    const result = await state.runCommand("ping", { host: req.params.host });
    const output = result.stdout || "";
    const avg = output.match(/Average = (\d+)ms/i);
    res.json({
      host: req.params.host,
      reachable: result.ok && output.includes("Received ="),
      avgMs: avg ? Number.parseInt(avg[1], 10) : null
    });
  });

  router.get("/api/proxy/test", async (_req, res) => {
    try {
      const agent = new SocksProxyAgent(`socks5://127.0.0.1:${state.ports.socks}`);
      const response = await nodeFetch("https://httpbin.org/ip", { agent, timeout: 10000 });
      const body = await response.json();
      res.json({ ok: true, origin: body.origin });
    } catch (error) {
      res.json({ ok: false, error: error.message });
    }
  });

  return router;
}
