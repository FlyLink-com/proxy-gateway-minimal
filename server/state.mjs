import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createSsLocalService } from "./services/ss-local.mjs";
import { createHttpProxyService } from "./services/http-proxy.mjs";
import { createBridgeServer } from "./services/http-bridge.mjs";
import { isPortListening } from "./services/ports.mjs";
import { loadProxyConfig } from "./services/config.mjs";
import { createCommandRunner } from "./services/command.mjs";
import { resolveConsoleToken } from "./services/console-token.mjs";
import { createSqliteSubscriptionStore } from "./services/subscriptions/repository.mjs";
import { createSubscriptionCore } from "./services/subscriptions/core.mjs";
import { DEFAULT_ADMIN_ALLOWED_CIDRS, DEFAULT_TRUSTED_PROXY_CIDRS } from "./services/ip-address.mjs";
import { createPlatformAccountEntitlementShell } from "./services/platform/account-entitlement-shell.mjs";
import { createPlatformAliyunGateEvidenceShell } from "./services/platform/aliyun-gate-evidence-shell.mjs";
import { createSqliteSubscriptionControlStore } from "./services/platform/subscription-control-db.mjs";
import { createPlatformLeadReviewQueue } from "./services/platform/lead-review-queue.mjs";
import { createPlatformSubscriptionAccessShell } from "./services/platform/subscription-access-shell.mjs";
import { createPortalAccessRequestService } from "./services/platform/portal-access-requests.mjs";
import { createPortalSupportRequestService } from "./services/platform/portal-support-requests.mjs";
import { createPortalHumanChallengeService } from "./services/platform/portal-human-challenge.mjs";
import { createPortalPasswordCredentialService } from "./services/platform/portal-password-credentials.mjs";
import { createPortalTotpVerifier } from "./services/platform/portal-totp-verifier.mjs";
import { createUserPortalAuthService } from "./services/platform/user-portal-auth.mjs";
import { createHysteria2UsageCollector } from "./services/edge/hysteria2-usage-collector.mjs";
import { createRuntimeUsageAccountingService } from "./services/platform/runtime-usage-accounting.mjs";
import { createTrafficAccountingService } from "./services/platform/traffic-accounting.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "./services/edge/credential-material-store.mjs";
import {
  createOrderEdgeCredentialIssuer,
  edgeCredentialRefForOrderChannel
} from "./services/edge/order-credential-issuer.mjs";
import {
  createOrderCredentialLifecycleFanoutService,
  createOrderCredentialLifecycleService
} from "./services/edge/order-credential-lifecycle.mjs";
import { createMihomoTuicHostRuntimeAdapter } from "./services/edge/mihomo-tuic-host-runtime-adapter.mjs";
import { createSingBoxSsHostRuntimeAdapter } from "./services/edge/sing-box-ss-runtime-adapter.mjs";
import { createXrayVlessRealityHostRuntimeAdapter } from "./services/edge/xray-vless-reality-runtime-adapter.mjs";
import { createHysteria2HostRuntimeAdapter } from "./services/edge/hysteria2-runtime-adapter.mjs";
import { createDataPlaneHandoffRuntimeAdapter } from "./services/edge/data-plane-handoff-runtime-adapter.mjs";
import { createDataPlaneHandoffQueue } from "./services/edge/data-plane-handoff-queue.mjs";
import { createDataPlaneAgentService } from "./services/edge/data-plane-agent-service.mjs";
import { spawn } from "node:child_process";

function rootPathFrom(rootDir) {
  if (rootDir instanceof URL) {
    return resolve(fileURLToPath(rootDir));
  }
  return resolve(rootDir);
}

function parseCsv(value, fallback) {
  const items = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function mergeCsvValues(...values) {
  const merged = [];
  const seen = new Set();
  for (const value of values) {
    for (const item of parseCsv(value, [])) {
      if (!seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }
  return merged;
}

function envFlag(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function optionalEnvText(value) {
  return String(value || "").trim();
}

function optionalEnvPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function runtimeValidationError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function parseJsonArrayEnv(value, field) {
  const raw = optionalEnvText(value);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("not_array");
    }
    return parsed;
  } catch {
    throw runtimeValidationError(`${field} must be a JSON array`);
  }
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function normalizeHysteria2TrafficStatsUrl(value) {
  const raw = optionalEnvText(value);
  if (!raw) {
    throw runtimeValidationError("EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN is required when usage collection is enabled");
  }
  const candidate = raw.includes("://") ? raw : `http://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw runtimeValidationError("EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN must be a loopback HTTP address");
  }
  if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname)) {
    throw runtimeValidationError("Hysteria2 traffic stats API must be loopback-only HTTP");
  }
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/traffic";
  }
  return url;
}

function createHysteria2TrafficStatsReader({
  listen,
  secret,
  fetchFn = globalThis.fetch
} = {}) {
  const trafficUrl = normalizeHysteria2TrafficStatsUrl(listen);
  const statsSecret = optionalEnvText(secret);
  if (typeof fetchFn !== "function") {
    throw runtimeValidationError("fetch is required for Hysteria2 traffic stats collection");
  }

  return async function readHysteria2TrafficStats({ clear } = {}) {
    const url = new URL(trafficUrl.toString());
    if (clear === true) {
      url.searchParams.set("clear", "1");
    }
    const headers = {};
    if (statsSecret) {
      headers.Authorization = statsSecret;
    }
    const response = await fetchFn(url, { headers });
    if (!response?.ok) {
      throw runtimeValidationError("Hysteria2 traffic stats API request failed");
    }
    return await response.json();
  };
}

function proxyServerRef(server = {}) {
  return optionalEnvText(server.name || server.id || server.ref || server.channelRef);
}

function proxyServerRefSet(proxyConfig = {}) {
  return new Set(
    (Array.isArray(proxyConfig?.servers) ? proxyConfig.servers : [])
      .map(proxyServerRef)
      .filter(Boolean)
  );
}

function filterConfiguredProxyRefs(refs = [], configuredRefs = new Set()) {
  const normalizedRefs = Array.isArray(refs) ? refs : parseCsv(refs, []);
  if (!configuredRefs || configuredRefs.size === 0) {
    return normalizedRefs;
  }
  return normalizedRefs.filter((ref) => configuredRefs.has(ref));
}

function missingConfiguredProxyRefs(refs = [], configuredRefs = new Set()) {
  const normalizedRefs = Array.isArray(refs) ? refs : parseCsv(refs, []);
  if (!configuredRefs || configuredRefs.size === 0) {
    return [];
  }
  const missing = [];
  const seen = new Set();
  for (const ref of normalizedRefs) {
    if (!configuredRefs.has(ref) && !seen.has(ref)) {
      seen.add(ref);
      missing.push(ref);
    }
  }
  return missing;
}

function assertProxyRefsConfigured(label, refs, configuredRefs = new Set()) {
  const missing = missingConfiguredProxyRefs(refs, configuredRefs);
  if (missing.length > 0) {
    throw runtimeValidationError(`${label} contains refs not present in proxy config: ${missing.join(", ")}`);
  }
}

function isHysteria2ProxyServer(server = {}) {
  const protocol = optionalEnvText(server.protocol || server.type).toLowerCase();
  const runtimeAdapter = optionalEnvText(server.runtimeAdapter).toLowerCase();
  return protocol === "hysteria2" || protocol === "hy2" || runtimeAdapter.includes("hysteria2");
}

function runtimeFromProxyServer(server = {}, fallback = "mihomo-tuic") {
  const protocol = optionalEnvText(server.protocol || server.type).toLowerCase();
  const runtimeAdapter = optionalEnvText(server.runtimeAdapter).toLowerCase();
  if (protocol === "hysteria2" || protocol === "hy2" || runtimeAdapter.includes("hysteria2")) {
    return "hysteria2";
  }
  if (protocol === "vless" || runtimeAdapter.includes("vless")) {
    return "xray-vless-reality";
  }
  if (protocol === "ss" || protocol === "shadowsocks" || runtimeAdapter.includes("sing-box-ss")) {
    return "sing-box-ss";
  }
  if (protocol === "tuic" || runtimeAdapter.includes("tuic")) {
    return "mihomo-tuic";
  }
  return fallback;
}

function createEnvEdgeUsageCollectors({
  env,
  proxyConfig,
  edgeChannelRefs,
  hysteria2TrafficReader,
  fetchFn,
  nowFn
} = {}) {
  if (!envFlag(env.EDGE_USAGE_COLLECTOR_ENABLED || env.EDGE_USAGE_ACCOUNTING_ENABLED)) {
    return [];
  }

  const configuredServers = Array.isArray(proxyConfig?.servers) ? proxyConfig.servers : [];
  const allowedChannelRefs = new Set(edgeChannelRefs.map((ref) => optionalEnvText(ref)).filter(Boolean));
  const hy2ChannelRefs = configuredServers
    .filter(isHysteria2ProxyServer)
    .map(proxyServerRef)
    .filter((channelRef) => channelRef && (allowedChannelRefs.size === 0 || allowedChannelRefs.has(channelRef)));
  if (hy2ChannelRefs.length === 0) {
    return [];
  }

  const trafficReader = typeof hysteria2TrafficReader === "function"
    ? hysteria2TrafficReader
    : createHysteria2TrafficStatsReader({
      listen: env.EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN,
      secret: env.EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET,
      fetchFn
    });

  return [...new Set(hy2ChannelRefs)].map((channelRef) => ({
    channelRef,
    ...createHysteria2UsageCollector({
      channelRef,
      trafficReader,
      nowFn
    })
  }));
}

function edgeCredentialRefForRequestId(requestId, channelRef = "", options = {}) {
  const normalized = String(requestId || "").trim();
  if (!normalized) return "";
  if (channelRef) {
    return edgeCredentialRefForOrderChannel(normalized, channelRef, options);
  }
  return edgeCredentialRefForOrderChannel(normalized, "legacy", { singleChannel: true });
}

function edgeCredentialRefCandidatesForRequestId(requestId, channelRef = "") {
  const refs = [];
  const channelCredentialRef = channelRef
    ? edgeCredentialRefForRequestId(requestId, channelRef, { singleChannel: false })
    : "";
  const legacyCredentialRef = edgeCredentialRefForRequestId(requestId);
  if (channelCredentialRef) refs.push(channelCredentialRef);
  if (legacyCredentialRef && !refs.includes(legacyCredentialRef)) refs.push(legacyCredentialRef);
  return refs;
}

function controlSafeRef(prefix, value) {
  const normalized = String(value || "").trim();
  return normalized
    ? `${prefix}ref_${createHash("sha256").update(normalized).digest("hex").slice(0, 16)}`
    : "";
}

function durableEdgeCredentialOrders({ controlStore, materialStore, nodeId } = {}) {
  if (
    !controlStore
    || typeof controlStore.listIssuedSubscriptionBindings !== "function"
    || !materialStore
    || typeof materialStore.getCredentialMaterialSummary !== "function"
  ) {
    return [];
  }
  return controlStore.listIssuedSubscriptionBindings()
    .map((binding) => {
      const credentialRefs = edgeCredentialRefCandidatesForRequestId(binding.requestId, nodeId)
        .filter((credentialRef) => credentialRef && (!nodeId || credentialRef !== edgeCredentialRefForRequestId(binding.requestId) || binding.nodeId === nodeId));
      const materialSummary = credentialRefs
        .map((credentialRef) => materialStore.getCredentialMaterialSummary(credentialRef))
        .find(Boolean);
      if (!materialSummary) {
        return null;
      }
      return {
        id: binding.requestId,
        portalUserRef: binding.accountId,
        status: "issued",
        expiresAt: binding.validUntil,
        validUntil: binding.validUntil,
        edgeChannelRef: nodeId || binding.nodeId,
        edgeCredentialRef: materialSummary.credentialRef,
        edgeMaterialDigest: materialSummary.materialDigest
      };
    })
    .filter(Boolean);
}

function mergeEdgeCredentialOrders(...orderLists) {
  const byRef = new Map();
  for (const order of orderLists.flat()) {
    const orderRef = String(order?.id || order?.requestRef || "").trim();
    if (orderRef) {
      const existing = byRef.get(orderRef);
      if (!existing || edgeCredentialOrderPriority(order) >= edgeCredentialOrderPriority(existing)) {
        byRef.set(orderRef, order);
      }
    }
  }
  return [...byRef.values()].sort((a, b) =>
    String(a.id || a.requestRef).localeCompare(String(b.id || b.requestRef))
  );
}

function edgeCredentialOrderPriority(order = {}) {
  const orderRef = String(order?.id || order?.requestRef || "").trim();
  const credentialRef = String(order?.edgeCredentialRef || order?.credentialRef || "").trim();
  const channelRef = String(order?.edgeChannelRef || order?.channelRef || "").trim();
  if (!orderRef || !credentialRef) {
    return 0;
  }
  if (
    channelRef
    && credentialRef === edgeCredentialRefForRequestId(orderRef, channelRef, { singleChannel: false })
  ) {
    return 3;
  }
  if (credentialRef === edgeCredentialRefForRequestId(orderRef)) {
    return 1;
  }
  return 2;
}

function resolveTenantCredentialMaterialFromStores({ controlStore, materialStore, tenantId, nodeId } = {}) {
  if (
    !controlStore
    || typeof controlStore.findIssuedSubscriptionBindingByTenantRef !== "function"
    || !materialStore
    || typeof materialStore.resolveCredentialMaterial !== "function"
  ) {
    return null;
  }
  const tenantRefs = [
    String(tenantId || "").trim(),
    controlSafeRef("tenant", tenantId)
  ].filter(Boolean);
  let binding = null;
  for (const tenantRef of tenantRefs) {
    binding = controlStore.findIssuedSubscriptionBindingByTenantRef(tenantRef);
    if (binding) break;
  }
  if (!binding) {
    return null;
  }
  for (const credentialRef of edgeCredentialRefCandidatesForRequestId(binding.requestId, nodeId)) {
    if (credentialRef === edgeCredentialRefForRequestId(binding.requestId) && String(binding.nodeId || "") !== String(nodeId || "")) {
      continue;
    }
    const material = materialStore.resolveCredentialMaterial(credentialRef);
    if (material) {
      return {
        ...material,
        credentialRef
      };
    }
  }
  return null;
}

function remoteDataPlaneAdapterName(server = {}) {
  return optionalEnvText(server.runtimeAdapter || server.edgeRuntimeAdapter || server.dataPlaneRuntimeAdapter);
}

function requiresAppliedRemoteReceipt(server = {}) {
  return remoteDataPlaneAdapterName(server) === "remote-data-plane-handoff";
}

function latestMatchingAppliedReceipt({ controlStore, channelRef, desiredStateRef }) {
  if (!controlStore || typeof controlStore.listEdgeApplyReceipts !== "function") {
    return null;
  }
  return controlStore.listEdgeApplyReceipts({ channelRef })
    .filter((receipt) =>
      receipt?.desiredStateRef === desiredStateRef
      && receipt.status === "applied"
      && receipt.configTestOk === true
      && receipt.serviceActive === true
      && receipt.listenerUdp443 === true
    )
    .at(-1) || null;
}

function createReceiptBackedSubscriptionChannelGate({ controlStore } = {}) {
  return ({ server }) => {
    if (!requiresAppliedRemoteReceipt(server)) {
      return true;
    }
    const channelRef = optionalEnvText(server?.name || server?.id);
    if (
      !channelRef
      || !controlStore
      || typeof controlStore.getLatestEdgeDesiredStateForChannel !== "function"
    ) {
      return false;
    }
    const desiredState = controlStore.getLatestEdgeDesiredStateForChannel(channelRef, {
      nodeRef: optionalEnvText(server.physicalNodeRef || server.nodeRef) || channelRef,
      channelRefs: [channelRef]
    });
    if (!desiredState?.desiredStateRef) {
      return false;
    }
    return Boolean(latestMatchingAppliedReceipt({
      controlStore,
      channelRef,
      desiredStateRef: desiredState.desiredStateRef
    }));
  };
}

export function createRuntimeState(options = {}) {
  const rootDir = rootPathFrom(options.rootDir || new URL("..", import.meta.url));
  const env = options.env || process.env;
  const host = "127.0.0.1";
  const consolePort = Number.parseInt(env.CONSOLE_PORT, 10) || 3456;
  const ports = { console: consolePort, socks: 1080, httpProxy: 18180 };
  const consoleToken = resolveConsoleToken({
    rootDir,
    env,
    tokenStorePath: options.consoleTokenStorePath,
    tokenFactory: options.tokenFactory
  });
  const proxyConfigPath = options.proxyConfigPath
    || env.SUBSCRIPTION_PROXY_CONFIG_PATH
    || env.PROXY_SERVERS_CONFIG_PATH
    || join(rootDir, "config", "proxy-servers.json");
  const proxyConfig = loadProxyConfig({
    configPath: proxyConfigPath,
    env
  });
  const userPortalRoutesEnabled = envFlag(env.USER_PORTAL_ROUTES_ENABLED);
  const configuredServers = Array.isArray(proxyConfig?.servers) ? proxyConfig.servers : [];
  const configuredProxyRefs = proxyServerRefSet(proxyConfig);
  const edgeLifecycleEnabled = envFlag(env.USER_PORTAL_EDGE_LIFECYCLE_ENABLED || env.EDGE_CREDENTIAL_LIFECYCLE_ENABLED);
  const autoIssuanceEnabled = envFlag(env.USER_PORTAL_AUTO_ISSUANCE_ENABLED);
  const configuredEdgeChannelRef = optionalEnvText(env.USER_PORTAL_EDGE_CHANNEL_REF || env.EDGE_CREDENTIAL_CHANNEL_REF);
  const requestedEdgeChannelRefs = mergeCsvValues(
    configuredEdgeChannelRef,
    env.EDGE_CREDENTIAL_CHANNEL_REFS,
    env.USER_PORTAL_EDGE_CHANNEL_REFS
  );
  if (autoIssuanceEnabled) {
    assertProxyRefsConfigured(
      "USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS",
      mergeCsvValues(env.USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS || requestedEdgeChannelRefs.join(",")),
      configuredProxyRefs
    );
  }
  if (edgeLifecycleEnabled) {
    assertProxyRefsConfigured(
      "USER_PORTAL_EDGE_CHANNEL_REFS/EDGE_CREDENTIAL_CHANNEL_REFS",
      requestedEdgeChannelRefs,
      configuredProxyRefs
    );
  }
  const edgeChannelRefs = filterConfiguredProxyRefs(requestedEdgeChannelRefs, configuredProxyRefs);
  const edgeChannelRef = (
    configuredEdgeChannelRef && (!configuredProxyRefs.size || configuredProxyRefs.has(configuredEdgeChannelRef))
      ? configuredEdgeChannelRef
      : edgeChannelRefs[0]
  ) || "";
  const autoIssuanceChannelRefs = filterConfiguredProxyRefs(
    mergeCsvValues(edgeChannelRefs.join(","), env.USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS),
    configuredProxyRefs
  );
  const subscriptionDbPath = options.subscriptionDbPath || env.SUBSCRIPTION_DB_PATH || join(rootDir, ".proxy-gateway", "subscriptions.sqlite");
  const controlDbPath = options.controlDbPath
    || env.SUBSCRIPTION_CONTROL_DB_PATH
    || env.CONTROL_DB_PATH
    || join(rootDir, ".proxy-gateway", "control.sqlite");
  const publicSubscriptionBaseUrl = String(env.PUBLIC_SUBSCRIPTION_BASE_URL || `http://${host}:${consolePort}`).trim().replace(/\/+$/, "");
  const adminAllowedCidrs = parseCsv(env.ADMIN_ALLOWED_CIDRS, DEFAULT_ADMIN_ALLOWED_CIDRS);
  const trustedProxyCidrs = parseCsv(env.TRUSTED_PROXY_CIDRS, DEFAULT_TRUSTED_PROXY_CIDRS);
  const dataPlaneAgentRoutesEnabled = envFlag(env.EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED);
  const tempLinkTtlMinutes = Number.parseInt(env.SUBSCRIPTION_TEMP_LINK_TTL_MINUTES, 10) || 24 * 60;
  const ownsSubscriptionStore = !options.subscriptionStore && !options.subscriptionRepository && !options.subscriptionCore && !options.subscriptionService;
  const subscriptionStore = options.subscriptionStore || options.subscriptionRepository || (
    ownsSubscriptionStore ? createSqliteSubscriptionStore({ dbPath: subscriptionDbPath }) : null
  );
  const ownsControlStore = !options.platformControlStore;
  const platformControlStore = options.platformControlStore || createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  let edgeCredentialMaterialStore = options.edgeCredentialMaterialStore || null;
  const subscriptionCore = options.subscriptionCore || options.subscriptionService || createSubscriptionCore({
    store: subscriptionStore,
    proxyConfig,
    publicSubscriptionBaseUrl,
    expiringDays: Number.parseInt(env.SUBSCRIPTION_EXPIRING_DAYS, 10) || 7,
    tempLinkTtlMinutes,
    tenantCredentialMaterialResolver: ({ tenantId, nodeId }) => resolveTenantCredentialMaterialFromStores({
      controlStore: platformControlStore,
      materialStore: edgeCredentialMaterialStore,
      tenantId,
      nodeId
    }),
    subscriptionChannelGate: createReceiptBackedSubscriptionChannelGate({
      controlStore: platformControlStore
    })
  });
  const platformLeadQueue = options.platformLeadQueue || createPlatformLeadReviewQueue();
  const platformAccountShell = options.platformAccountShell || createPlatformAccountEntitlementShell();
  const platformAccessShell = options.platformAccessShell || createPlatformSubscriptionAccessShell({
    accountShell: platformAccountShell
  });
  let edgeCredentialIssuer = options.edgeCredentialIssuer || null;
  let edgeLifecycleService = options.edgeLifecycleService || null;
  let edgeRuntimeAdapter = options.edgeRuntimeAdapter || null;
  let edgeRuntime = "mihomo-tuic";
  let platformPortalAccessRequests;

  if (edgeLifecycleEnabled) {
    if (!edgeChannelRef) {
      throw runtimeValidationError("USER_PORTAL_EDGE_CHANNEL_REF is required when edge lifecycle is enabled");
    }
    if (!edgeCredentialMaterialStore) {
      const materialPath = optionalEnvText(env.EDGE_CREDENTIAL_MATERIAL_PATH || env.USER_PORTAL_EDGE_MATERIAL_PATH);
      if (!materialPath) {
        throw runtimeValidationError("EDGE_CREDENTIAL_MATERIAL_PATH is required when edge lifecycle is enabled");
      }
      edgeCredentialMaterialStore = createFileBackedEdgeCredentialMaterialStore({
        filePath: materialPath
      });
    }
    edgeCredentialIssuer = edgeCredentialIssuer || createOrderEdgeCredentialIssuer({
      channelRef: edgeChannelRef,
      channelRefs: edgeChannelRefs,
      materialStore: edgeCredentialMaterialStore
    });
    const defaultEdgeRuntimeAdapterName = optionalEnvText(env.EDGE_CREDENTIAL_RUNTIME_ADAPTER || env.USER_PORTAL_EDGE_RUNTIME_ADAPTER);
    const serverConfigForChannel = (channelRefForRuntime) => configuredServers.find((server) =>
      String(server?.name || "").trim() === channelRefForRuntime
      || String(server?.id || "").trim() === channelRefForRuntime
    );
    const adapterNameForChannel = (channelRefForRuntime) =>
      optionalEnvText(serverConfigForChannel(channelRefForRuntime)?.runtimeAdapter) || defaultEdgeRuntimeAdapterName;
    const currentCredentialSummariesForChannel = (channelRefForRuntime) => {
      if (typeof options.edgeCurrentCredentialSummaries === "function") {
        return options.edgeCurrentCredentialSummaries({ channelRef: channelRefForRuntime });
      }
      const summaries = Array.isArray(options.edgeCurrentCredentialSummaries)
        ? options.edgeCurrentCredentialSummaries
        : [];
      return summaries.filter((credential) => {
        const credentialChannelRef = String(credential?.edgeChannelRef || credential?.channelRef || "").trim();
        return !credentialChannelRef || credentialChannelRef === channelRefForRuntime;
      });
    };
    const portalEdgeCredentialOrdersForChannel = (channelRefForRuntime) => {
      const orders = platformPortalAccessRequests?.listEdgeCredentialOrders?.() || [];
      return orders.filter((order) => {
        const orderChannelRef = String(order?.edgeChannelRef || order?.channelRef || "").trim();
        return orderChannelRef === channelRefForRuntime || (!orderChannelRef && edgeChannelRefs.length === 1);
      });
    };
    const createRuntimeAdapterForChannel = (channelRefForRuntime) => {
      const serverConfig = serverConfigForChannel(channelRefForRuntime) || {};
      const adapterName = adapterNameForChannel(channelRefForRuntime).toLowerCase();
      if (options.edgeRuntimeAdapter && (!adapterName || channelRefForRuntime === edgeChannelRef)) {
        return {
          runtime: edgeRuntime,
          runtimeAdapter: options.edgeRuntimeAdapter
        };
      }
      if (adapterName === "remote-data-plane-handoff" || adapterName === "data-plane-handoff") {
        return {
          runtime: runtimeFromProxyServer(serverConfig, edgeRuntime),
          runtimeAdapter: createDataPlaneHandoffRuntimeAdapter({
            handoffDir: optionalEnvText(env.EDGE_DATA_PLANE_HANDOFF_DIR || env.USER_PORTAL_EDGE_HANDOFF_DIR),
            nodeRef: optionalEnvText(serverConfig.nodeRef || serverConfig.physicalNodeRef),
            physicalNodeRef: optionalEnvText(serverConfig.physicalNodeRef || serverConfig.nodeRef)
          })
        };
      }
      if (adapterName === "mihomo-tuic-explicit-restart") {
        return {
          runtime: "mihomo-tuic",
          runtimeAdapter: createMihomoTuicHostRuntimeAdapter({
            activeConfigPath: env.EDGE_MIHOMO_ACTIVE_CONFIG_PATH,
            candidateConfigPath: env.EDGE_MIHOMO_CANDIDATE_CONFIG_PATH,
            backupDir: env.EDGE_MIHOMO_BACKUP_DIR,
            serviceName: optionalEnvText(env.EDGE_MIHOMO_SERVICE_NAME) || "mihomo-tuic.service",
            mihomoBinary: optionalEnvText(env.EDGE_MIHOMO_BINARY) || "mihomo",
            listener: {
              name: channelRefForRuntime,
              port: env.EDGE_MIHOMO_TUIC_PORT || 443,
              listen: optionalEnvText(env.EDGE_MIHOMO_TUIC_LISTEN) || "0.0.0.0",
              certificate: env.EDGE_MIHOMO_TUIC_CERTIFICATE_PATH,
              privateKey: env.EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH,
              congestionController: optionalEnvText(env.EDGE_MIHOMO_TUIC_CONGESTION_CONTROLLER) || "bbr",
              alpn: parseCsv(env.EDGE_MIHOMO_TUIC_ALPN, ["h3"])
            },
            resolveCredentialMaterial: (credentialRef) => edgeCredentialMaterialStore.resolveCredentialMaterial(credentialRef),
            commandRunner: options.edgeRuntimeCommandRunner
          })
        };
      }
      if (adapterName === "sing-box-ss-explicit-restart") {
        return {
          runtime: "sing-box-ss",
          runtimeAdapter: createSingBoxSsHostRuntimeAdapter({
            activeConfigPath: env.EDGE_SING_BOX_ACTIVE_CONFIG_PATH,
            candidateConfigPath: env.EDGE_SING_BOX_CANDIDATE_CONFIG_PATH,
            backupDir: env.EDGE_SING_BOX_BACKUP_DIR,
            serviceName: optionalEnvText(env.EDGE_SING_BOX_SERVICE_NAME) || "sing-box-ss.service",
            singBoxBinary: optionalEnvText(env.EDGE_SING_BOX_BINARY) || "sing-box",
            listener: {
              name: channelRefForRuntime,
              port: env.EDGE_SING_BOX_SS_PORT || 18388,
              listen: optionalEnvText(env.EDGE_SING_BOX_SS_LISTEN) || "0.0.0.0",
              method: optionalEnvText(env.EDGE_SING_BOX_SS_METHOD) || "2022-blake3-aes-256-gcm",
              serverPassword: env.EDGE_SING_BOX_SS_SERVER_PASSWORD,
              v2rayApiListen: optionalEnvText(env.EDGE_SING_BOX_V2RAY_API_LISTEN),
              validationAttempts: env.EDGE_SING_BOX_LISTENER_VALIDATION_ATTEMPTS,
              validationRetryDelayMs: env.EDGE_SING_BOX_LISTENER_VALIDATION_RETRY_DELAY_MS
            },
            resolveCredentialMaterial: (credentialRef) => edgeCredentialMaterialStore.resolveCredentialMaterial(credentialRef),
            commandRunner: options.edgeRuntimeCommandRunner
          })
        };
      }
      if (adapterName === "xray-vless-reality-explicit-restart") {
        return {
          runtime: "xray-vless-reality",
          runtimeAdapter: createXrayVlessRealityHostRuntimeAdapter({
            activeConfigPath: env.EDGE_XRAY_ACTIVE_CONFIG_PATH,
            candidateConfigPath: env.EDGE_XRAY_CANDIDATE_CONFIG_PATH,
            backupDir: env.EDGE_XRAY_BACKUP_DIR,
            serviceName: optionalEnvText(env.EDGE_XRAY_SERVICE_NAME) || "xray-vless-reality.service",
            xrayBinary: optionalEnvText(env.EDGE_XRAY_BINARY) || "xray",
            listener: {
              name: channelRefForRuntime,
              port: env.EDGE_XRAY_VLESS_PORT || 443,
              listen: optionalEnvText(env.EDGE_XRAY_VLESS_LISTEN) || "0.0.0.0",
              flow: optionalEnvText(env.EDGE_XRAY_VLESS_FLOW) || "xtls-rprx-vision",
              dest: env.EDGE_XRAY_VLESS_DEST,
              serverNames: parseCsv(env.EDGE_XRAY_VLESS_SERVER_NAMES, []),
              privateKey: env.EDGE_XRAY_VLESS_REALITY_PRIVATE_KEY,
              shortIds: parseCsv(env.EDGE_XRAY_VLESS_SHORT_IDS, []),
              xver: env.EDGE_XRAY_VLESS_XVER,
              validationAttempts: env.EDGE_XRAY_LISTENER_VALIDATION_ATTEMPTS,
              validationRetryDelayMs: env.EDGE_XRAY_LISTENER_VALIDATION_RETRY_DELAY_MS
            },
            resolveCredentialMaterial: (credentialRef) => edgeCredentialMaterialStore.resolveCredentialMaterial(credentialRef),
            commandRunner: options.edgeRuntimeCommandRunner
          })
        };
      }
      if (adapterName === "hysteria2-explicit-restart") {
        return {
          runtime: "hysteria2",
          runtimeAdapter: createHysteria2HostRuntimeAdapter({
            activeConfigPath: env.EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH,
            candidateConfigPath: env.EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH,
            backupDir: env.EDGE_HYSTERIA2_BACKUP_DIR,
            serviceName: optionalEnvText(env.EDGE_HYSTERIA2_SERVICE_NAME) || "hysteria2.service",
            hysteriaBinary: optionalEnvText(env.EDGE_HYSTERIA2_BINARY) || "hysteria",
            listener: {
              listen: optionalEnvText(env.EDGE_HYSTERIA2_LISTEN) || ":443",
              certificate: env.EDGE_HYSTERIA2_CERTIFICATE_PATH,
              privateKey: env.EDGE_HYSTERIA2_PRIVATE_KEY_PATH,
              trafficStatsListen: optionalEnvText(env.EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN),
              trafficStatsSecret: env.EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET,
              bandwidth: {
                up: optionalEnvText(env.EDGE_HYSTERIA2_BANDWIDTH_UP),
                down: optionalEnvText(env.EDGE_HYSTERIA2_BANDWIDTH_DOWN)
              },
              ignoreClientBandwidth: optionalEnvText(env.EDGE_HYSTERIA2_IGNORE_CLIENT_BANDWIDTH),
              congestion: {
                type: optionalEnvText(env.EDGE_HYSTERIA2_CONGESTION_TYPE),
                bbrProfile: optionalEnvText(env.EDGE_HYSTERIA2_CONGESTION_BBR_PROFILE)
              },
              quic: {
                initStreamReceiveWindow: optionalEnvPositiveInteger(env.EDGE_HYSTERIA2_QUIC_INIT_STREAM_RECEIVE_WINDOW),
                maxStreamReceiveWindow: optionalEnvPositiveInteger(env.EDGE_HYSTERIA2_QUIC_MAX_STREAM_RECEIVE_WINDOW),
                initConnReceiveWindow: optionalEnvPositiveInteger(env.EDGE_HYSTERIA2_QUIC_INIT_CONN_RECEIVE_WINDOW),
                maxConnReceiveWindow: optionalEnvPositiveInteger(env.EDGE_HYSTERIA2_QUIC_MAX_CONN_RECEIVE_WINDOW),
                maxIdleTimeout: optionalEnvText(env.EDGE_HYSTERIA2_QUIC_MAX_IDLE_TIMEOUT),
                maxIncomingStreams: optionalEnvPositiveInteger(env.EDGE_HYSTERIA2_QUIC_MAX_INCOMING_STREAMS),
                disablePathMTUDiscovery: optionalEnvText(env.EDGE_HYSTERIA2_QUIC_DISABLE_PATH_MTU_DISCOVERY)
              },
              udpIdleTimeout: optionalEnvText(env.EDGE_HYSTERIA2_UDP_IDLE_TIMEOUT),
              sniff: {
                enabled: envFlag(env.EDGE_HYSTERIA2_SNIFF_ENABLED),
                rewriteDomain: envFlag(env.EDGE_HYSTERIA2_SNIFF_REWRITE_DOMAIN),
                tcpPorts: optionalEnvText(env.EDGE_HYSTERIA2_SNIFF_TCP_PORTS),
                udpPorts: optionalEnvText(env.EDGE_HYSTERIA2_SNIFF_UDP_PORTS)
              },
              outbound: {
                mode: optionalEnvPositiveInteger(env.EDGE_HYSTERIA2_OUTBOUND_MODE)
              },
              validationAttempts: env.EDGE_HYSTERIA2_LISTENER_VALIDATION_ATTEMPTS,
              validationRetryDelayMs: env.EDGE_HYSTERIA2_LISTENER_VALIDATION_RETRY_DELAY_MS
            },
            resolveCredentialMaterial: (credentialRef) => edgeCredentialMaterialStore.resolveCredentialMaterial(credentialRef),
            commandRunner: options.edgeRuntimeCommandRunner
          })
        };
      }
      return {
        runtime: edgeRuntime,
        runtimeAdapter: null
      };
    };
    const lifecycleEntries = edgeChannelRefs.map((channelRefForRuntime) => {
      const runtimeBinding = createRuntimeAdapterForChannel(channelRefForRuntime);
      if (channelRefForRuntime === edgeChannelRef) {
        edgeRuntime = runtimeBinding.runtime;
        edgeRuntimeAdapter = runtimeBinding.runtimeAdapter;
      }
      return {
        channelRef: channelRefForRuntime,
        service: createOrderCredentialLifecycleService({
          channelRef: channelRefForRuntime,
          runtime: runtimeBinding.runtime,
          listOrders: () => mergeEdgeCredentialOrders(
            durableEdgeCredentialOrders({
              controlStore: platformControlStore,
              materialStore: edgeCredentialMaterialStore,
              nodeId: channelRefForRuntime
            }),
            portalEdgeCredentialOrdersForChannel(channelRefForRuntime)
          ),
          listCurrentCredentials: () => currentCredentialSummariesForChannel(channelRefForRuntime),
          executeProductionMutation: envFlag(env.EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION),
          runtimeAdapter: runtimeBinding.runtimeAdapter,
          receiptStore: platformControlStore
        })
      };
    });
    edgeLifecycleService = edgeLifecycleService || (
      lifecycleEntries.length === 1
        ? lifecycleEntries[0].service
        : createOrderCredentialLifecycleFanoutService({ services: lifecycleEntries })
    );
  }

  platformPortalAccessRequests = options.platformPortalAccessRequests || createPortalAccessRequestService({
    runtimeCore: subscriptionCore,
    controlStore: platformControlStore,
    edgeCredentialIssuer,
    edgeLifecycleService,
    autoIssuance: {
      enabled: autoIssuanceEnabled,
      nodeId: optionalEnvText(env.USER_PORTAL_AUTO_ISSUANCE_NODE_ID),
      channelRefs: autoIssuanceChannelRefs,
      reviewedByRef: optionalEnvText(env.USER_PORTAL_AUTO_ISSUANCE_REVIEWED_BY_REF) || "portal_auto_issuer",
      monthlyLimits: {
        trial: optionalEnvPositiveInteger(env.USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT),
        monthly: optionalEnvPositiveInteger(env.USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT)
      }
    },
    deferEdgeLifecycle: envFlag(env.EDGE_CREDENTIAL_LIFECYCLE_DEFER_RESPONSE)
  });
  const platformPortalSupportRequests = options.platformPortalSupportRequests || createPortalSupportRequestService();
  const platformPortalHumanChallenges = options.platformPortalHumanChallenges || (
    userPortalRoutesEnabled ? createPortalHumanChallengeService({
      nowFn: options.userPortalNowFn
    }) : null
  );
  const platformPortalPasswordCredentialService = options.platformPortalPasswordCredentialService || (
    userPortalRoutesEnabled ? createPortalPasswordCredentialService({
      controlStore: platformControlStore,
      nowFn: options.userPortalNowFn
    }) : null
  );
  const platformPortalTotpVerifier = options.userPortalTotpVerifier || createPortalTotpVerifier({
    nowFn: options.userPortalNowFn
  });
  const platformUserPortalAuth = options.platformUserPortalAuth || (
    userPortalRoutesEnabled ? createUserPortalAuthService({
      controlStore: platformControlStore,
      nowFn: options.userPortalNowFn,
      totpVerifier: platformPortalTotpVerifier,
      passwordCredentialService: platformPortalPasswordCredentialService,
      allowPasswordOnlySessionForSetup: envFlag(env.USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION)
    }) : null
  );
  const platformTrafficAccounting = options.platformTrafficAccounting || createTrafficAccountingService({
    controlStore: platformControlStore,
    nowFn: options.trafficAccountingNowFn
  });
  const edgeUsageCollectors = Array.isArray(options.edgeUsageCollectors)
    ? options.edgeUsageCollectors
    : createEnvEdgeUsageCollectors({
      env,
      proxyConfig,
      edgeChannelRefs,
      hysteria2TrafficReader: options.hysteria2TrafficReader,
      fetchFn: options.edgeUsageFetch,
      nowFn: options.usageCollectorNowFn
    });
  const edgeUsageAccounting = options.edgeUsageAccounting || (
    edgeUsageCollectors.length > 0
      ? createRuntimeUsageAccountingService({
        collectors: edgeUsageCollectors,
        accounting: platformTrafficAccounting
      })
      : null
  );
  const dataPlaneHandoffDir = optionalEnvText(env.EDGE_DATA_PLANE_HANDOFF_DIR || env.USER_PORTAL_EDGE_HANDOFF_DIR);
  const dataPlaneHandoffQueue = options.dataPlaneHandoffQueue || (
    dataPlaneHandoffDir
      ? createDataPlaneHandoffQueue({
        handoffDir: dataPlaneHandoffDir,
        archiveDir: optionalEnvText(env.EDGE_DATA_PLANE_HANDOFF_ARCHIVE_DIR) || undefined
      })
      : null
  );
  const configuredDataPlaneAgentNodes = [
    ...parseJsonArrayEnv(env.EDGE_DATA_PLANE_AGENT_NODES_JSON, "EDGE_DATA_PLANE_AGENT_NODES_JSON"),
    ...(optionalEnvText(env.EDGE_DATA_PLANE_AGENT_NODE_REF) ? [{
      nodeRef: optionalEnvText(env.EDGE_DATA_PLANE_AGENT_NODE_REF),
      channelRefs: parseCsv(env.EDGE_DATA_PLANE_AGENT_CHANNEL_REFS, []),
      tokenSha256: optionalEnvText(env.EDGE_DATA_PLANE_AGENT_TOKEN_SHA256 || env.EDGE_DATA_PLANE_AGENT_TOKEN_HASH)
    }] : [])
  ];
  const dataPlaneAgentService = options.dataPlaneAgentService || (
    dataPlaneAgentRoutesEnabled
      ? createDataPlaneAgentService({
        controlStore: platformControlStore,
        nodes: configuredDataPlaneAgentNodes
      })
      : null
  );
  const platformAliyunGateEvidenceShell = options.platformAliyunGateEvidenceShell || createPlatformAliyunGateEvidenceShell();
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    if (ownsSubscriptionStore) {
      subscriptionStore.close();
    }
    if (ownsControlStore) {
      platformControlStore.close();
    }
  }

  const bridgeServer = options.httpProxyServer || createBridgeServer({ socksPort: ports.socks });
  const ssLocal = createSsLocalService({
    ssPath: join(rootDir, "bin", "sslocal.exe"),
    templatePath: join(rootDir, "config", "ss-local.json"),
    env,
    socksPort: ports.socks,
    spawnFn: spawn,
    isPortListeningFn: isPortListening
  });
  const httpProxy = createHttpProxyService({
    server: bridgeServer,
    port: ports.httpProxy,
    host,
    isPortListeningFn: isPortListening
  });

  const runKnownCommand = createCommandRunner({
    "system-proxy": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "status"],
      timeoutMs: 10000
    },
    "env-proxy-on": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "env"],
      timeoutMs: 10000
    },
    "env-proxy-off": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), "env-off"],
      timeoutMs: 10000
    },
    "env-proxy-status": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-Command", "$h=[Environment]::GetEnvironmentVariable('HTTP_PROXY','User');$s=[Environment]::GetEnvironmentVariable('HTTPS_PROXY','User');$a=[Environment]::GetEnvironmentVariable('ALL_PROXY','User');Write-Output \"HTTP_PROXY=$h\";Write-Output \"HTTPS_PROXY=$s\";Write-Output \"ALL_PROXY=$a\""],
      timeoutMs: 10000
    },
    "autostart-on": {
      command: "schtasks",
      args: ["/Create", "/SC", "ONLOGON", "/TN", "ProxyGatewayConsole", "/TR", `"${process.execPath}" "${join(rootDir, "server", "index.mjs")}"`, "/RL", "LIMITED", "/F"],
      timeoutMs: 10000
    },
    "autostart-off": {
      command: "schtasks",
      args: ["/Delete", "/TN", "ProxyGatewayConsole", "/F"],
      timeoutMs: 10000
    },
    "autostart-status": {
      command: "schtasks",
      args: ["/Query", "/TN", "ProxyGatewayConsole"],
      timeoutMs: 5000
    },
    "network-status": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "network-doctor.ps1"), "status", "-Json"],
      timeoutMs: 15000,
      maxOutput: 64_000
    },
    "network-repair": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "network-doctor.ps1"), "repair", "-Json"],
      timeoutMs: 30000,
      maxOutput: 64_000
    },
    "network-reset": {
      command: "powershell",
      args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "network-doctor.ps1"), "reset", "-Json"],
      timeoutMs: 20000,
      maxOutput: 64_000
    },
    "ping": {
      command: "ping",
      args: ["-n", "3", "127.0.0.1"],
      timeoutMs: 15000
    }
  });

  function runCommand(name, data = {}) {
    if (name === "system-proxy") {
      const action = ["on", "off", "pac", "status"].includes(data.action) ? data.action : "status";
      return createCommandRunner({
        "system-proxy": {
          command: "powershell",
          args: ["-ExecutionPolicy", "Bypass", "-File", join(rootDir, "scripts", "proxy.ps1"), action],
          timeoutMs: 10000
        }
      })("system-proxy");
    }
    if (name === "ping") {
      return createCommandRunner({
        ping: {
          command: "ping",
          args: ["-n", "3", data.host],
          timeoutMs: 15000
        }
      })("ping");
    }
    return runKnownCommand(name);
  }

  return {
    rootDir,
    host,
    ports,
    proxyConfig,
    consoleToken: consoleToken.token,
    consoleTokenSource: consoleToken.source,
    consoleTokenStorePath: consoleToken.tokenStorePath,
    services: { ssLocal, httpProxy },
    subscriptions: {
      store: subscriptionStore,
      core: subscriptionCore,
      repository: subscriptionStore,
      service: subscriptionCore,
      publicSubscriptionBaseUrl,
      tempLinkTtlMinutes,
      close
    },
    platform: {
      leadQueue: platformLeadQueue,
      accountShell: platformAccountShell,
      accessShell: platformAccessShell,
      userPortalRoutesEnabled,
      userPortalAuth: platformUserPortalAuth,
      portalHumanChallenges: platformPortalHumanChallenges,
      portalPasswordCredentialService: platformPortalPasswordCredentialService,
      portalAccessRequests: platformPortalAccessRequests,
      portalSupportRequests: platformPortalSupportRequests,
      aliyunGateEvidenceShell: platformAliyunGateEvidenceShell,
      controlStore: platformControlStore,
      edgeCredentialMaterialStore,
      edgeCredentialIssuer,
      edgeLifecycleService,
      edgeRuntimeAdapter,
      trafficAccounting: platformTrafficAccounting,
      edgeUsageCollectors,
      edgeUsageAccounting,
      dataPlaneHandoffQueue,
      dataPlaneAgentRoutesEnabled,
      dataPlaneAgentService
    },
    security: {
      adminAllowedCidrs,
      trustedProxyCidrs,
      subRateLimit: {
        windowMs: Number.parseInt(env.SUB_RATE_LIMIT_WINDOW_MS, 10) || 60000,
        max: Number.parseInt(env.SUB_RATE_LIMIT_MAX, 10) || 30
      }
    },
    close,
    runCommand,
    isPortListening,
    autoStartHttpProxy: options.autoStartHttpProxy ?? true
  };
}
