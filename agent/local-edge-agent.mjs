import express from "express";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const DEFAULTS = {
  bindHost: "127.0.0.1",
  subscriptionPort: 19090,
  proxyPort: 19080,
  profileName: "GlobalCircle Local Edge",
  localNodeName: "Local Edge Adapter"
};

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function normalizePort(value, fieldName) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${fieldName} must be an integer TCP port`);
  }
  return port;
}

export function normalizeAgentConfig(input = {}) {
  const bindHost = String(input.bindHost ?? DEFAULTS.bindHost).trim();
  if (!LOOPBACK_HOSTS.has(bindHost)) {
    throw new Error("bindHost must be loopback-only");
  }

  return {
    bindHost,
    subscriptionPort: normalizePort(input.subscriptionPort ?? DEFAULTS.subscriptionPort, "subscriptionPort"),
    proxyPort: normalizePort(input.proxyPort ?? DEFAULTS.proxyPort, "proxyPort"),
    profileName: String(input.profileName ?? DEFAULTS.profileName),
    localNodeName: String(input.localNodeName ?? DEFAULTS.localNodeName),
    activeEdge: {
      id: input.activeEdge?.id ? String(input.activeEdge.id) : null,
      host: input.activeEdge?.host ? String(input.activeEdge.host) : null
    }
  };
}

export function buildLocalClashSubscription(input = {}) {
  const config = normalizeAgentConfig(input);
  const nodeName = config.localNodeName;
  const lines = [
    "mixed-port: 7897",
    "allow-lan: false",
    "mode: global",
    "proxies:",
    `  - name: ${yamlQuote(nodeName)}`,
    "    type: socks5",
    `    server: ${yamlQuote(config.bindHost === "::1" ? "::1" : "127.0.0.1")}`,
    `    port: ${config.proxyPort}`,
    "proxy-groups:",
    "  - name: GLOBAL",
    "    type: select",
    "    proxies:",
    `      - ${yamlQuote(nodeName)}`,
    "      - DIRECT",
    "rules:",
    "  - MATCH,GLOBAL",
    ""
  ];

  return lines.join("\n");
}

export function redactedDiagnostics(input = {}) {
  const counters = input.counters && typeof input.counters === "object" ? input.counters : {};
  const lastFailure = input.lastFailure && typeof input.lastFailure === "object" ? input.lastFailure : null;

  return {
    ok: true,
    agent: "local-edge-agent",
    proxyImplemented: false,
    activeEdge: {
      id: input.activeEdge?.id ? String(input.activeEdge.id) : null,
      host: input.activeEdge?.host ? "[redacted]" : null
    },
    counters: { ...counters },
    lastFailure: lastFailure
      ? {
          class: lastFailure.class ? String(lastFailure.class) : "unknown"
        }
      : null
  };
}

export function createLocalEdgeAgentApp({ config: configInput = {}, diagnostics = {} } = {}) {
  const config = normalizeAgentConfig(configInput);
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      bindHost: config.bindHost,
      subscriptionPort: config.subscriptionPort,
      proxyPort: config.proxyPort,
      proxyImplemented: false
    });
  });

  app.get("/clash.yaml", (_req, res) => {
    res.type("application/x-yaml").send(buildLocalClashSubscription(config));
  });

  app.get("/diagnostics", (_req, res) => {
    res.json(redactedDiagnostics(diagnostics));
  });

  return app;
}

export function startLocalEdgeAgent({ config: configInput = {}, diagnostics = {} } = {}) {
  const config = normalizeAgentConfig(configInput);
  const app = createLocalEdgeAgentApp({ config, diagnostics });
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.subscriptionPort, config.bindHost, () => {
      server.off("error", reject);
      resolve({
        server,
        config,
        subscriptionUrl: `http://${config.bindHost}:${config.subscriptionPort}/clash.yaml`
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agent = await startLocalEdgeAgent();
  const close = () => {
    agent.server.close(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  console.log(`Local Edge Agent listening on ${agent.subscriptionUrl}`);
}
