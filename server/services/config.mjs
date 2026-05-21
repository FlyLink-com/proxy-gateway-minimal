import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function pathFrom(input) {
  return input instanceof URL ? fileURLToPath(input) : input;
}

export function loadProxyConfig({ configPath, env = process.env }) {
  const raw = readFileSync(pathFrom(configPath), "utf8");
  return JSON.parse(raw.replace(/\$\{SS_PASSWORD\}/g, env.SS_PASSWORD || ""));
}

export function publicProxyConfig(config) {
  return {
    servers: (config.servers || []).map(({ password, ...server }) => server),
    pingHosts: config.pingHosts || [],
    nginx: config.nginx || {}
  };
}

export function allowedDiagnosticHosts(config) {
  return [
    ...(config.servers || []).map((server) => server.host),
    config.nginx?.host,
    ...(config.pingHosts || [])
  ].filter((host, index, hosts) => host && hosts.indexOf(host) === index);
}
