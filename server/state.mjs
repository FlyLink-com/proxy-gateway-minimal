import http from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { SocksClient } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";
import nodeFetch from "node-fetch";
import { createSsLocalService } from "./services/ss-local.mjs";
import { createHttpProxyService } from "./services/http-proxy.mjs";
import { isPortListening } from "./services/ports.mjs";
import { loadProxyConfig } from "./services/config.mjs";
import { createCommandRunner } from "./services/command.mjs";
import { resolveConsoleToken } from "./services/console-token.mjs";
import { createSubscriptionRepository } from "./services/subscriptions/repository.mjs";
import { createSubscriptionService } from "./services/subscriptions/service.mjs";
import { DEFAULT_ADMIN_ALLOWED_CIDRS } from "./services/ip-address.mjs";
import { spawn } from "node:child_process";

function rootPathFrom(rootDir) {
  if (rootDir instanceof URL) {
    return resolve(fileURLToPath(rootDir));
  }
  return resolve(rootDir);
}

function parseCsv(value, fallback) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
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
  const consolePort = Number.parseInt(env.CONSOLE_PORT, 10) || 3456;
  const ports = { console: consolePort, socks: 1080, httpProxy: 18180 };
  const consoleToken = resolveConsoleToken({
    rootDir,
    env,
    tokenStorePath: options.consoleTokenStorePath,
    tokenFactory: options.tokenFactory
  });
  const proxyConfig = loadProxyConfig({
    configPath: join(rootDir, "config", "proxy-servers.json"),
    env
  });
  const subscriptionDbPath = options.subscriptionDbPath || env.SUBSCRIPTION_DB_PATH || join(rootDir, ".proxy-gateway", "subscriptions.sqlite");
  const publicSubscriptionBaseUrl = String(env.PUBLIC_SUBSCRIPTION_BASE_URL || `http://${host}:${consolePort}`).trim().replace(/\/+$/, "");
  const adminAllowedCidrs = parseCsv(env.ADMIN_ALLOWED_CIDRS, DEFAULT_ADMIN_ALLOWED_CIDRS);
  const tempLinkTtlMinutes = Number.parseInt(env.SUBSCRIPTION_TEMP_LINK_TTL_MINUTES, 10) || 24 * 60;
  const ownsSubscriptionRepository = !options.subscriptionRepository && !options.subscriptionService;
  const subscriptionRepository = options.subscriptionRepository || (
    ownsSubscriptionRepository ? createSubscriptionRepository({ dbPath: subscriptionDbPath }) : null
  );
  const subscriptionService = options.subscriptionService || createSubscriptionService({
    repository: subscriptionRepository,
    proxyConfig,
    publicSubscriptionBaseUrl,
    expiringDays: Number.parseInt(env.SUBSCRIPTION_EXPIRING_DAYS, 10) || 7,
    tempLinkTtlMinutes
  });
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    if (ownsSubscriptionRepository) {
      subscriptionRepository.close();
    }
  }

  const bridgeServer = options.httpProxyServer || createBridgeServer({ socksPort: ports.socks });
  const ssLocal = createSsLocalService({
    ssPath: join(rootDir, "bin", "sslocal.exe"),
    templatePath: join(rootDir, "config", "ss-local.json"),
    env,
    socksPort: ports.socks,
    spawnFn: spawn,
    isPortListeningFn: isPortListening
  });
  const httpProxy = createHttpProxyService({
    server: bridgeServer,
    port: ports.httpProxy,
    host,
    isPortListeningFn: isPortListening
  });

  const runKnownCommand = createCommandRunner({
    "system-proxy": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "status"],
      timeoutMs: 10000
    },
    "env-proxy-on": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "env"],
      timeoutMs: 10000
    },
    "env-proxy-off": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "env-off"],
      timeoutMs: 10000
    },
    "env-proxy-status": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-Command", "$h=[Environment]::GetEnvironmentVariable('HTTP_PROXY','User');$s=[Environment]::GetEnvironmentVariable('HTTPS_PROXY','User');$a=[Environment]::GetEnvironmentVariable('ALL_PROXY','User');Write-Output \"HTTP_PROXY=$h\";Write-Output \"HTTPS_PROXY=$s\";Write-Output \"ALL_PROXY=$a\""],
      timeoutMs: 10000
    },
    "autostart-on": {
      command: "schtasks",
      args: ["/Create", "/SC", "ONLOGON", "/TN", "ProxyGatewayConsole", "/TR", `"${process.execPath}" "${join(rootDir, "server", "index.mjs")}"`, "/RL", "LIMITED", "/F"],
      timeoutMs: 10000
    },
    "autostart-off": {
      command: "schtasks",
      args: ["/Delete", "/TN", "ProxyGatewayConsole", "/F"],
      timeoutMs: 10000
    },
    "autostart-status": {
      command: "schtasks",
      args: ["/Query", "/TN", "ProxyGatewayConsole"],
      timeoutMs: 5000
    },
    "network-status": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "network-doctor.ps1"), "status", "-Json"],
      timeoutMs: 15000,
      maxOutput: 64_000
    },
    "network-repair": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "network-doctor.ps1"), "repair", "-Json"],
      timeoutMs: 30000,
      maxOutput: 64_000
    },
    "network-reset": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "network-doctor.ps1"), "reset", "-Json"],
      timeoutMs: 20000,
      maxOutput: 64_000
    },
    "ping": {
      command: "ping",
      args: ["-n", "3", "127.0.0.1"],
      timeoutMs: 15000
    }
  });

  function runCommand(name, data = {}) {
    if (name === "system-proxy") {
      const action = ["on", "off", "pac", "status"].includes(data.action) ? data.action : "status";
      return createCommandRunner({
        "system-proxy": {
          command: "powershell",
          args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), action],
          timeoutMs: 10000
        }
      })("system-proxy");
    }
    if (name === "ping") {
      return createCommandRunner({
        ping: {
          command: "ping",
          args: ["-n", "3", data.host],
          timeoutMs: 15000
        }
      })("ping");
    }
    return runKnownCommand(name);
  }

  return {
    rootDir,
    host,
    ports,
    proxyConfig,
    consoleToken: consoleToken.token,
    consoleTokenSource: consoleToken.source,
    consoleTokenStorePath: consoleToken.tokenStorePath,
    services: { ssLocal, httpProxy },
    subscriptions: {
      repository: subscriptionRepository,
      service: subscriptionService,
      publicSubscriptionBaseUrl,
      tempLinkTtlMinutes,
      close
    },
    security: {
      adminAllowedCidrs,
      subRateLimit: {
        windowMs: Number.parseInt(env.SUB_RATE_LIMIT_WINDOW_MS, 10) || 60000,
        max: Number.parseInt(env.SUB_RATE_LIMIT_MAX, 10) || 30
      }
    },
    close,
    runCommand,
    isPortListening,
    autoStartHttpProxy: options.autoStartHttpProxy ?? true
  };
}
