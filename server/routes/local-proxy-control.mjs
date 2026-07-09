import { Router } from "express";

export const LOCAL_PROXY_CONTROL_ROUTE_OWNER = Object.freeze({
  owner: "local_proxy_control",
  scope: "local_operator_console",
  compatibility: "legacy_paths"
});

export function localProxyControlRoutesEnabled(state) {
  const configured = state?.localProxyControl?.routesEnabled;
  return configured === false ? false : true;
}

export function localProxyControlRoutes(state) {
  const router = Router();

  router.post("/api/ss/start", async (_req, res) => {
    res.json(await state.services.ssLocal.start());
  });

  router.post("/api/ss/stop", async (_req, res) => {
    res.json(await state.services.ssLocal.stop());
  });

  router.post("/api/http-proxy/start", async (_req, res) => {
    res.json(await state.services.httpProxy.start());
  });

  router.post("/api/http-proxy/stop", async (_req, res) => {
    res.json(await state.services.httpProxy.stop());
  });

  router.post("/api/proxy/start", async (_req, res) => {
    const socks = await state.services.ssLocal.start();
    const http = await state.services.httpProxy.start();
    if (!socks.ok && socks.msg !== "already running") {
      res.json({ ok: false, msg: socks.msg, socks5: false, http: state.services.httpProxy.status().running });
      return;
    }
    if (!http.ok && http.msg !== "already running") {
      res.json({ ok: false, msg: http.msg, socks5: state.services.ssLocal.status().running, http: false });
      return;
    }
    res.json({
      socks5: await state.isPortListening(state.ports.socks, state.host),
      http: await state.isPortListening(state.ports.httpProxy, state.host),
      ok: true
    });
  });

  router.post("/api/proxy/stop", async (_req, res) => {
    await state.services.ssLocal.stop();
    await state.services.httpProxy.stop();
    res.json({ ok: true });
  });

  router.get("/api/proxy/overview", async (_req, res) => {
    res.json({
      consolePort: { port: state.ports.console, ok: true, desc: "Console" },
      socks5: { port: state.ports.socks, ok: await state.isPortListening(state.ports.socks, state.host), desc: "SOCKS5" },
      httpProxy: { port: state.ports.httpProxy, ok: await state.isPortListening(state.ports.httpProxy, state.host), desc: "HTTP Proxy" },
      ssRunning: state.services.ssLocal.status().running
    });
  });

  return router;
}
