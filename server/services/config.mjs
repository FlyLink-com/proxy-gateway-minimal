import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function pathFrom(input) {
  return input instanceof URL ? fileURLToPath(input) : input;
}

const SENSITIVE_CONFIG_KEYS = new Set([
  "password",
  "token",
  "uuid",
  "secret",
  "privatekey",
  "private-key",
  "obfspassword",
  "obfs-password"
]);

function isSensitiveConfigKey(key = "") {
  return SENSITIVE_CONFIG_KEYS.has(String(key).toLowerCase());
}

function envPlaceholderName(value) {
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  return match?.[1] || "";
}

function replaceSecretPlaceholders(value, env, key) {
  if (isSensitiveConfigKey(key) && typeof value === "string") {
    const envName = envPlaceholderName(value);
    if (envName) {
      return env[envName] ?? "";
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceSecretPlaceholders(item, env));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceSecretPlaceholders(item, env, key)
      ])
    );
  }

  return value;
}

function stripSensitiveConfigKeys(value) {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveConfigKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isSensitiveConfigKey(key))
        .map(([key, item]) => [key, stripSensitiveConfigKeys(item)])
    );
  }

  return value;
}

export function loadProxyConfig({ configPath, env = process.env }) {
  const raw = readFileSync(pathFrom(configPath), "utf8");
  return replaceSecretPlaceholders(JSON.parse(raw), env);
}

export function publicProxyConfig(config) {
  return stripSensitiveConfigKeys({
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
