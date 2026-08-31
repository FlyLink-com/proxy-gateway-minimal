export function statusRoutes(state) {
  const releaseIdentity = state.releaseIdentity || Object.freeze({ state: "unavailable" });
  return async function statusHandler(_req, res) {
    const [socks5, httpProxy] = await Promise.all([
      state.isPortListening(state.ports.socks, state.host),
      state.isPortListening(state.ports.httpProxy, state.host)
    ]);

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      releaseIdentity,
      ports: {
        console: { port: state.ports.console, ok: true },
        socks5: { port: state.ports.socks, ok: socks5 },
        httpProxy: { port: state.ports.httpProxy, ok: httpProxy }
      },
      runtime: {
        ssLocal: state.services.ssLocal.status(),
        httpProxy: state.services.httpProxy.status()
      }
    });
  };
}
