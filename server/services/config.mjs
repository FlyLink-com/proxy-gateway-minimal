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
  "serverpassword",
  "server-password",
  "obfspassword",
  "obfs-password"
]);

const RUNTIME_PLACEHOLDER_CONFIG_KEYS = new Set([
  ...SENSITIVE_CONFIG_KEYS,
  "host",
  "server",
  "publickey",
  "public-key",
  "shortid",
  "short-id",
  "sni",
  "servername",
  "serverName"
].map((key) => String(key).toLowerCase()));

function isSensitiveConfigKey(key = "") {
  return SENSITIVE_CONFIG_KEYS.has(String(key).toLowerCase());
}

function isRuntimePlaceholderConfigKey(key = "") {
  return RUNTIME_PLACEHOLDER_CONFIG_KEYS.has(String(key).toLowerCase());
}

function envPlaceholderName(value) {
  const match = /^\$\{([A-Z0-9_]+)\}$/.exec(value);
  return match?.[1] || "";
}

function text(value) {
  return String(value ?? "").trim();
}

function serverLabel(server, index) {
  return text(server?.name || server?.id) || `server[${index}]`;
}

function normalizeProtocol(server) {
  const raw = text(server?.protocol || server?.clashType || server?.type || "ss").toLowerCase();
  if (raw === "ss" || raw === "shadowsocks" || raw === "shadowsocks-libev" || raw === "shadowsocks-rust") {
    return "ss";
  }
  if (raw === "vless") {
    return "vless";
  }
  if (raw === "hysteria2" || raw === "hy2") {
    return "hysteria2";
  }
  if (raw === "tuic") {
    return "tuic";
  }
  return "";
}

function requireConfigText(server, index, fieldName, ...keys) {
  for (const key of keys) {
    const value = text(server?.[key]);
    if (value) {
      return;
    }
  }
  throw new Error(`proxy server ${serverLabel(server, index)} ${fieldName} is required`);
}

function requireConfigPort(server, index) {
  const port = Number(server?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`proxy server ${serverLabel(server, index)} port must be an integer TCP port`);
  }
}

function validateProxyServer(server, index) {
  const label = serverLabel(server, index);
  const protocol = normalizeProtocol(server);
  if (!protocol) {
    throw new Error(`proxy server ${label} protocol is unsupported`);
  }

  requireConfigText(server, index, "host", "host");
  requireConfigPort(server, index);

  if (protocol === "ss") {
    requireConfigText(server, index, "cipher", "method", "cipher");
    requireConfigText(server, index, "password", "password");
    return;
  }

  if (protocol === "vless") {
    requireConfigText(server, index, "uuid", "uuid");
    return;
  }

  if (protocol === "hysteria2") {
    requireConfigText(server, index, "password", "password");
    return;
  }

  requireConfigText(server, index, "uuid", "uuid");
  requireConfigText(server, index, "password", "password");
}

export function validateProxyConfig(config) {
  if (!Array.isArray(config?.servers)) {
    throw new Error("proxy config servers must be an array");
  }

  config.servers.forEach(validateProxyServer);
  return config;
}

function normalizeProxyServerEndpointAliases(server) {
  if (!server || typeof server !== "object" || Array.isArray(server)) {
    return server;
  }

  const normalized = { ...server };
  if (!text(normalized.host) && text(normalized.server)) {
    normalized.host = text(normalized.server);
  }
  delete normalized.server;
  return normalized;
}

function normalizeProxyConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return config;
  }

  return {
    ...config,
    servers: Array.isArray(config.servers)
      ? config.servers.map(normalizeProxyServerEndpointAliases)
      : config.servers
  };
}

function replaceRuntimePlaceholders(value, env, key) {
  if (isRuntimePlaceholderConfigKey(key) && typeof value === "string") {
    const envName = envPlaceholderName(value);
    if (envName) {
      return env[envName] ?? "";
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceRuntimePlaceholders(item, env));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceRuntimePlaceholders(item, env, key)
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
  return validateProxyConfig(
    normalizeProxyConfig(replaceRuntimePlaceholders(JSON.parse(raw), env))
  );
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
