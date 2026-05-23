import { computeSubscriptionStatus } from "./status.mjs";
import { SHARED_NODE_MODE } from "./validation.mjs";

export function namedServers(proxyConfig) {
  return (proxyConfig.servers || []).filter((server) => String(server.name || "").trim());
}

export function firstNamedServer(proxyConfig) {
  const [server] = namedServers(proxyConfig);
  if (!server) {
    throw new Error("At least one named proxy server is required");
  }
  return server;
}

export function resolveNamedServer(proxyConfig, nodeId) {
  const normalized = String(nodeId ?? "").trim();
  return namedServers(proxyConfig).find((server) => server.name === normalized || server.id === normalized) || null;
}

export function cloneProxyConfigForNode(proxyConfig, nodeName) {
  return {
    ...proxyConfig,
    servers: (proxyConfig.servers || []).filter((server) => server.name === nodeName)
  };
}

export function serializeNode(server) {
  return {
    id: server.id || server.name,
    name: server.name,
    region: server.region || "",
    host: server.host,
    port: server.port,
    method: server.method,
    credentialMode: SHARED_NODE_MODE,
    status: "online"
  };
}

export function createSubscriptionSerializer({ nowFn, expiringDays }) {
  function computeStatus(tenant) {
    return computeSubscriptionStatus({
      storedStatus: tenant.status,
      expiresAt: tenant.expiresAt,
      now: nowFn(),
      expiringDays
    });
  }

  function serializeTenant(tenant) {
    if (!tenant) return null;
    return {
      id: tenant.id,
      displayName: tenant.displayName,
      status: computeStatus(tenant),
      expiresAt: tenant.expiresAt,
      note: tenant.note,
      nodeName: tenant.nodeId,
      tokenPrefix: tenant.tokenPrefix,
      lastUsedAt: tenant.lastUsedAt,
      credentialMode: tenant.credentialMode
    };
  }

  function serializeTempLink(link, tenant) {
    return {
      id: link.id,
      tenant: serializeTenant(tenant),
      tokenPrefix: link.tokenPrefix,
      expiresAt: link.expiresAt,
      usedAt: link.usedAt,
      createdAt: link.createdAt
    };
  }

  return {
    computeStatus,
    serializeTenant,
    serializeTempLink
  };
}
