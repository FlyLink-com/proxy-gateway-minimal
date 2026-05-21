import { createConnection } from "node:net";

export function isPortListening(port, host = "127.0.0.1", timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      resolve(false);
    });
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
