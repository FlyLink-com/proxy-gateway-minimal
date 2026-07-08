import express from "express";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createChannelFromProfile } from "./channel-profile.mjs";
import { redactedLastFailure, sanitizeDiagnosticsCounters } from "./diagnostics.mjs";
import { startLocalSocksAdapter } from "./socks5-adapter.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080
]);
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

function normalizePort(value, fieldName, { allowEphemeral = false } = {}) {
  const port = Number(value);
  const minimum = allowEphemeral ? 0 : 1;
  if (!Number.isInteger(port) || port < minimum || port > 65535) {
    throw new Error(`${fieldName} must be an integer TCP port`);
  }
  return port;
}

export function normalizeAgentConfig(input = {}, options = {}) {
  const bindHost = String(input.bindHost ?? DEFAULTS.bindHost).trim();
  if (!LOOPBACK_HOSTS.has(bindHost)) {
    throw new Error("bindHost must be loopback-only");
  }

  return {
    bindHost,
    subscriptionPort: normalizePort(input.subscriptionPort ?? DEFAULTS.subscriptionPort, "subscriptionPort", options),
    proxyPort: normalizePort(input.proxyPort ?? DEFAULTS.proxyPort, "proxyPort", options),
    profileName: String(input.profileName ?? DEFAULTS.profileName),
    localNodeName: String(input.localNodeName ?? DEFAULTS.localNodeName),
    activeEdge: {
      id: input.activeEdge?.id ? String(input.activeEdge.id) : null,
      host: input.activeEdge?.host ? String(input.activeEdge.host) : null
    }
  };
}

export function buildLocalClashSubscription(input = {}, options = {}) {
  const config = normalizeAgentConfig(input, options);
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
  return {
    ok: true,
    agent: "local-edge-agent",
    proxyImplemented: false,
    activeEdge: {
      id: input.activeEdge?.id ? String(input.activeEdge.id) : null,
      host: input.activeEdge?.host ? "[redacted]" : null
    },
    counters: sanitizeDiagnosticsCounters(input.counters),
    lastFailure: redactedLastFailure(input.lastFailure)
  };
}

export function createLocalEdgeAgentApp({
  config: configInput = {},
  diagnostics = {},
  proxyImplemented = false,
  trustedConfig = false
} = {}) {
  const config = trustedConfig ? configInput : normalizeAgentConfig(configInput, { allowEphemeral: true });
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      bindHost: config.bindHost,
      subscriptionPort: config.subscriptionPort,
      proxyPort: config.proxyPort,
      proxyImplemented
    });
  });

  app.get("/clash.yaml", (_req, res) => {
    res.type("application/x-yaml").send(buildLocalClashSubscription(config, { allowEphemeral: true }));
  });

  app.get("/diagnostics", (_req, res) => {
    res.json(redactedDiagnostics(diagnostics));
  });

  return app;
}

export async function startLocalEdgeAgent({
  config: configInput = {},
  diagnostics = {},
  startProxyAdapter = false,
  channel,
  channelProfile
} = {}) {
  const config = normalizeAgentConfig(configInput, { allowEphemeral: true });
  const resolvedChannel = channel ?? (channelProfile ? createChannelFromProfile(channelProfile) : null);
  let proxy = null;
  if (startProxyAdapter) {
    proxy = await startLocalSocksAdapter({
      bindHost: config.bindHost,
      port: config.proxyPort,
      channel: resolvedChannel
    });
    config.proxyPort = proxy.address.port;
  }

  const app = createLocalEdgeAgentApp({
    config,
    diagnostics,
    proxyImplemented: Boolean(proxy),
    trustedConfig: true
  });
  let server = createServer(app);
  const requestedEphemeralSubscriptionPort = config.subscriptionPort === 0;

  return new Promise((resolve, reject) => {
    let settled = false;

    async function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      if (proxy) {
        await proxy.close();
      }
      reject(error);
    }

    function tryListen() {
      server.once("error", fail);
      server.listen(0, config.bindHost, () => {
        server.off("error", fail);
        const address = server.address();
        if (requestedEphemeralSubscriptionPort && FETCH_BLOCKED_PORTS.has(address.port)) {
          server.close((error) => {
            if (error) {
              void fail(error);
              return;
            }
            server = createServer(app);
            tryListen();
          });
          return;
        }

        config.subscriptionPort = address.port;
        settled = true;
        const activeServer = server;
        resolve({
          server: activeServer,
          proxy,
          channel: resolvedChannel,
          config,
          subscriptionUrl: `http://${config.bindHost}:${config.subscriptionPort}/clash.yaml`,
          close: () =>
            new Promise((closeResolve, closeReject) => {
              activeServer.close(async (error) => {
                if (error) {
                  closeReject(error);
                  return;
                }
                if (proxy) {
                  await proxy.close();
                }
                closeResolve();
              });
            })
        });
      });
    }

    if (requestedEphemeralSubscriptionPort) {
      tryListen();
      return;
    }

    server.once("error", fail);
    server.listen(config.subscriptionPort, config.bindHost, () => {
      server.off("error", fail);
      config.subscriptionPort = server.address().port;
      settled = true;
      const activeServer = server;
      resolve({
        server: activeServer,
        proxy,
        channel: resolvedChannel,
        config,
        subscriptionUrl: `http://${config.bindHost}:${config.subscriptionPort}/clash.yaml`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            activeServer.close(async (error) => {
              if (error) {
                closeReject(error);
                return;
              }
              if (proxy) {
                await proxy.close();
              }
              closeResolve();
            });
          })
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
