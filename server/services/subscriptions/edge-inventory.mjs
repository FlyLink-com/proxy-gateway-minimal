import { createNodeRegistry, normalizeNode } from "./node-registry.mjs";

export function namedEdgeServers(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).namedServers();
}

export function normalizeEdgeNode(server, index = 0) {
  return normalizeNode(server, index, { includeRuntime: true });
}

export function listEdgeNodes(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).listRenderableNodes();
}

export function subscriptionEligibleEdgeServers(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).subscriptionEligibleServers();
}

export function defaultSubscriptionEdgeServers(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).defaultSubscriptionServers();
}

export function firstSubscriptionEligibleEdgeServer(proxyConfig) {
  return createNodeRegistry({ proxyConfig }).firstDefaultSubscriptionServer();
}

export function resolveEdgeServer(proxyConfig, nodeId, { subscriptionEligibleOnly = false } = {}) {
  return createNodeRegistry({ proxyConfig }).resolveNode(nodeId, { subscriptionEligibleOnly });
}
