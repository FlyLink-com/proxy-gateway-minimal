import { createConnection } from "node:net";

export function isPortListening(port, host = "127.0.0.1", timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
    socket.on("close", () => done(false));
  });
}

export async function buildPortStatus({ consolePort, socksPort, httpProxyPort, host = "127.0.0.1" }) {
  const [socks5, httpProxy] = await Promise.all([
    isPortListening(socksPort, host),
    isPortListening(httpProxyPort, host)
  ]);

  return {
    consolePort: { port: consolePort, ok: true, desc: "Console" },
    socks5: { port: socksPort, ok: socks5, desc: "SOCKS5" },
    httpProxy: { port: httpProxyPort, ok: httpProxy, desc: "HTTP Proxy" }
  };
}
