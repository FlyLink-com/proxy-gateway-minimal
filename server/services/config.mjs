import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function pathFrom(input) {
  return input instanceof URL ? fileURLToPath(input) : input;
}

const SS_PASSWORD_PLACEHOLDER = /\$\{SS_PASSWORD\}/g;

function replaceSecretPlaceholders(value, env) {
  if (typeof value === "string") {
    const password = env.SS_PASSWORD ?? "";
    return value.replace(SS_PASSWORD_PLACEHOLDER, () => password);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceSecretPlaceholders(item, env));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceSecretPlaceholders(item, env)
      ])
    );
  }

  return value;
}

function stripPasswordKeys(value) {
  if (Array.isArray(value)) {
    return value.map(stripPasswordKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "password")
        .map(([key, item]) => [key, stripPasswordKeys(item)])
    );
  }

  return value;
}

export function loadProxyConfig({ configPath, env = process.env }) {
  const raw = readFileSync(pathFrom(configPath), "utf8");
  return replaceSecretPlaceholders(JSON.parse(raw), env);
}

export function publicProxyConfig(config) {
  return stripPasswordKeys({
    servers: config.servers || [],
    pingHosts: config.pingHosts || [],
    nginx: config.nginx || {}
  });
}

export function allowedDiagnosticHosts(config) {
  return [
    ...(config.servers || []).map((server) => server.host),
    config.nginx?.host,
    ...(config.pingHosts || [])
  ].filter((host, index, hosts) => host && hosts.indexOf(host) === index);
}
