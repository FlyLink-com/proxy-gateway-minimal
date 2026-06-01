import { SHARED_NODE_MODE } from "./validation.mjs";

const DEFAULT_STATUS = "online";
const DEFAULT_CHANNEL_POOL = "stable";
const CHANNEL_POOLS = new Set(["stable", "private", "canary", "recovery"]);

function text(value) {
  return String(value ?? "").trim();
}

function metadataToken(value) {
  return text(value).toLowerCase().replace(/[\s_]+/g, "-");
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

function channelPoolFor(server) {
  const explicitPool = metadataToken(server.channelPool || server.pool || server.strategyPool);
  if (CHANNEL_POOLS.has(explicitPool)) {
    return explicitPool;
  }

  const role = metadataToken(server.channelRole || server.role);
  if (role === "private" || role === "operator" || role === "operator-private") {
    return "private";
  }
  if (role === "canary") {
    return "canary";
  }
  if (role === "recovery" || role === "fallback") {
    return "recovery";
  }
  return DEFAULT_CHANNEL_POOL;
}

function optionalNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function strategyPriorityFor(server, index = 0) {
  const priority = optionalNumber(server.strategyPriority ?? server.priority);
  return priority ?? index;
}

function canaryWeightFor(server) {
  const weight = optionalNumber(server.canaryWeight);
  return weight ?? 0;
}

function byStrategyPriority(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.index - b.index;
}

export function normalizeNode(server, index = 0, { includeRuntime = false } = {}) {
  const status = normalizedStatus(server);
  const maintenance = status === "maintenance";
  const subscriptionEligible = status === DEFAULT_STATUS && !maintenance;
  const channelPool = channelPoolFor(server);
  const node = {
    id: server.id || server.name,
    name: server.name,
    role: text(server.role),
    region: text(server.region),
    channelPool,
    strategyPriority: strategyPriorityFor(server, index),
    canaryWeight: canaryWeightFor(server),
    credentialMode: SHARED_NODE_MODE,
    status,
    maintenance,
    subscriptionEligible,
    reason: reasonFor(server, status)
  };

  if (!includeRuntime) {
    return node;
  }

  return {
    ...node,
    host: server.host,
    port: server.port,
    method: server.method
  };
}

export function createNodeRegistry({ proxyConfig }) {
  const namedServers = () => (proxyConfig.servers || []).filter((server) => text(server.name));
  const listSafeNodes = () => namedServers().map((server, index) => normalizeNode(server, index));
  const listRenderableNodes = () => namedServers().map((server, index) => normalizeNode(server, index, {
    includeRuntime: true
  }));
  const subscriptionEligibleServers = () => namedServers().filter((server, index) => {
    return normalizeNode(server, index).subscriptionEligible;
  });
  const defaultSubscriptionServers = () => namedServers()
    .map((server, index) => ({ server, index, node: normalizeNode(server, index) }))
    .filter(({ node }) => node.subscriptionEligible && node.channelPool === DEFAULT_CHANNEL_POOL)
    .map(({ server, index, node }) => ({ server, index, priority: node.strategyPriority }))
    .sort(byStrategyPriority)
    .map(({ server }) => server);
  const firstDefaultSubscriptionServer = () => {
    const [server] = defaultSubscriptionServers();
    if (!server) {
      throw new Error("At least one subscription-eligible proxy server is required");
    }
    return server;
  };
  const resolveNode = (nodeId, { subscriptionEligibleOnly = false } = {}) => {
    const normalized = text(nodeId);
    const candidates = subscriptionEligibleOnly ? subscriptionEligibleServers() : namedServers();
    return candidates.find((server) => server.name === normalized || server.id === normalized) || null;
  };
  const resolveAssignableNode = (nodeId) => resolveNode(nodeId, { subscriptionEligibleOnly: true });
  const cloneProxyConfigForSubscriptionOutput = (nodeId) => {
    const defaultServers = defaultSubscriptionServers();
    const [defaultNode] = defaultServers;
    const node = resolveAssignableNode(nodeId);
    if (!node) {
      return {
        ...proxyConfig,
        servers: []
      };
    }

    if (defaultNode && node.name === defaultNode.name) {
      return {
        ...proxyConfig,
        servers: defaultServers
      };
    }

    return {
      ...proxyConfig,
      servers: [node]
    };
  };

  return {
    namedServers,
    listSafeNodes,
    listRenderableNodes,
    subscriptionEligibleServers,
    defaultSubscriptionServers,
    firstDefaultSubscriptionServer,
    resolveNode,
    resolveAssignableNode,
    cloneProxyConfigForSubscriptionOutput
  };
}
