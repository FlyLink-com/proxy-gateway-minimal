import http from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import crypto from "node:crypto";
import { SocksClient } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";
import nodeFetch from "node-fetch";
import { createSsLocalService } from "./services/ss-local.mjs";
import { createHttpProxyService } from "./services/http-proxy.mjs";
import { isPortListening } from "./services/ports.mjs";
import { loadProxyConfig } from "./services/config.mjs";

function rootPathFrom(rootDir) {
  if (rootDir instanceof URL) {
    return resolve(fileURLToPath(rootDir));
  }
  return resolve(rootDir);
}

function createBridgeServer({ socksPort }) {
  const socksAgent = new SocksProxyAgent(`socks5://127.0.0.1:${socksPort}`);
  const server = http.createServer(async (req, res) => {
    const targetUrl = req.url || "";
    if (!targetUrl.startsWith("http")) {
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    try {
      const proxyRes = await nodeFetch(targetUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined,
        timeout: 15000,
        agent: socksAgent
      });
      const headers = {};
      proxyRes.headers.forEach((value, key) => {
        headers[key] = value;
      });
      res.writeHead(proxyRes.status, headers);
      proxyRes.body.pipe(res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end(`Proxy Error: ${error.message}`);
    }
  });

  server.on("connect", (req, clientSocket, head) => {
    const [hostname, portText] = (req.url || "").split(":");
    const port = Number.parseInt(portText, 10) || 443;
    SocksClient.createConnection({
      proxy: { host: "127.0.0.1", port: socksPort, type: 5 },
      destination: { host: hostname, port },
      command: "connect"
    }).then(({ socket }) => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) {
        socket.write(head);
      }
      socket.pipe(clientSocket);
      clientSocket.pipe(socket);
      socket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => socket.destroy());
    }).catch((error) => {
      clientSocket.end(`HTTP/1.1 502 Proxy Error\r\n\r\n${error.message}`);
    });
  });

  return server;
}

export function createRuntimeState(options = {}) {
  const rootDir = rootPathFrom(options.rootDir || new URL("..", import.meta.url));
  const env = options.env || process.env;
  const host = "127.0.0.1";
  const ports = { console: 4077, socks: 1080, httpProxy: 18180 };
  const proxyConfig = loadProxyConfig({
    configPath: join(rootDir, "config", "proxy-servers.json"),
    env
  });

  const bridgeServer = options.httpProxyServer || createBridgeServer({ socksPort: ports.socks });
  const ssLocal = createSsLocalService({
    ssPath: join(rootDir, "bin", "sslocal.exe"),
    templatePath: join(rootDir, "config", "ss-local.json"),
    env,
    socksPort: ports.socks,
    isPortListeningFn: isPortListening
  });
  const httpProxy = createHttpProxyService({
    server: bridgeServer,
    port: ports.httpProxy,
    host,
    isPortListeningFn: isPortListening
  });

  return {
    rootDir,
    host,
    ports,
    proxyConfig,
    consoleToken: env.CONSOLE_TOKEN || crypto.randomUUID(),
    services: { ssLocal, httpProxy },
    autoStartHttpProxy: options.autoStartHttpProxy ?? true
  };
}
