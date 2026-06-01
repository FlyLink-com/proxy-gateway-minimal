import { computeSubscriptionStatus } from "./status.mjs";
import { createNodeRegistry } from "./node-registry.mjs";

export function namedServers(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).namedServers();
}

export function firstNamedServer(proxyConfig) {
  const [server] = namedServers(proxyConfig);
  if (!server) {
    throw new Error("At least one named proxy server is required");
  }
  return server;
}

export function firstEligibleNamedServer(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).firstDefaultSubscriptionServer();
}

export function resolveNamedServer(proxyConfig, nodeId) {
  return createNodeRegistry({ proxyConfig }).resolveNode(nodeId);
}

export function resolveEligibleNamedServer(proxyConfig, nodeId) {
  return createNodeRegistry({ proxyConfig }).resolveAssignableNode(nodeId);
}

export function cloneProxyConfigForSubscriptionOutput(proxyConfig, nodeId) {
  return createNodeRegistry({ proxyConfig }).cloneProxyConfigForSubscriptionOutput(nodeId);
}

export function serializeNode(server) {
  return createNodeRegistry({ proxyConfig: { servers: [server] } }).listRenderableNodes()[0];
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
