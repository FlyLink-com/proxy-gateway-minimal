import { computeSubscriptionStatus } from "./status.mjs";
import {
  firstSubscriptionEligibleEdgeServer,
  listEdgeNodes,
  namedEdgeServers,
  resolveEdgeServer,
  subscriptionEligibleEdgeServers
} from "./edge-inventory.mjs";

export function namedServers(proxyConfig) {
  return namedEdgeServers(proxyConfig);
}

export function firstNamedServer(proxyConfig) {
  const [server] = namedServers(proxyConfig);
  if (!server) {
    throw new Error("At least one named proxy server is required");
  }
  return server;
}

export function firstEligibleNamedServer(proxyConfig) {
  return firstSubscriptionEligibleEdgeServer(proxyConfig);
}

export function resolveNamedServer(proxyConfig, nodeId) {
  return resolveEdgeServer(proxyConfig, nodeId);
}

export function resolveEligibleNamedServer(proxyConfig, nodeId) {
  return resolveEdgeServer(proxyConfig, nodeId, { subscriptionEligibleOnly: true });
}

export function cloneProxyConfigForSubscriptionOutput(proxyConfig, nodeId) {
  const eligibleServers = subscriptionEligibleEdgeServers(proxyConfig);
  const [defaultNode] = eligibleServers;
  const node = eligibleServers.find((server) => server.name === String(nodeId ?? "").trim() || server.id === String(nodeId ?? "").trim()) || null;
  if (!node) {
    return {
      ...proxyConfig,
      servers: []
    };
  }

  if (node.name === defaultNode.name) {
    return {
      ...proxyConfig,
      servers: eligibleServers
    };
  }

  return {
    ...proxyConfig,
    servers: [node]
  };
}

export function serializeNode(server) {
  return listEdgeNodes({ servers: [server] })[0];
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
