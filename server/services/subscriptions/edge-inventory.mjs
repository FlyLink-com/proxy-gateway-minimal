import { SHARED_NODE_MODE } from "./validation.mjs";

const DEFAULT_STATUS = "online";

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true || value === "true";
}

function normalizedStatus(server) {
  const rawStatus = text(server.status).toLowerCase();
  if (bool(server.maintenance) || rawStatus === "maintenance") return "maintenance";
  if (bool(server.disabled) || rawStatus === "disabled") return "disabled";
  if (rawStatus === "offline" || rawStatus === "degraded") return rawStatus;
  return DEFAULT_STATUS;
}

function reasonFor(server, status) {
  if (status === "maintenance") {
    return text(server.maintenanceReason || server.reason);
  }
  if (status === "disabled") {
    return text(server.disabledReason || server.reason);
  }
  return text(server.reason);
}

export function namedEdgeServers(proxyConfig) {
  return (proxyConfig.servers || []).filter((server) => text(server.name));
}

export function normalizeEdgeNode(server) {
  const status = normalizedStatus(server);
  const maintenance = status === "maintenance";
  const subscriptionEligible = status === DEFAULT_STATUS && !maintenance;

  return {
    id: server.id || server.name,
    name: server.name,
    role: text(server.role),
    region: text(server.region),
    host: server.host,
    port: server.port,
    method: server.method,
    credentialMode: SHARED_NODE_MODE,
    status,
    maintenance,
    subscriptionEligible,
    reason: reasonFor(server, status)
  };
}

export function listEdgeNodes(proxyConfig) {
  return namedEdgeServers(proxyConfig).map(normalizeEdgeNode);
}

export function subscriptionEligibleEdgeServers(proxyConfig) {
  return namedEdgeServers(proxyConfig).filter((server) => normalizeEdgeNode(server).subscriptionEligible);
}

export function firstSubscriptionEligibleEdgeServer(proxyConfig) {
  const [server] = subscriptionEligibleEdgeServers(proxyConfig);
  if (!server) {
    throw new Error("At least one subscription-eligible proxy server is required");
  }
  return server;
}

export function resolveEdgeServer(proxyConfig, nodeId, { subscriptionEligibleOnly = false } = {}) {
  const normalized = text(nodeId);
  const candidates = subscriptionEligibleOnly ? subscriptionEligibleEdgeServers(proxyConfig) : namedEdgeServers(proxyConfig);
  return candidates.find((server) => server.name === normalized || server.id === normalized) || null;
}
