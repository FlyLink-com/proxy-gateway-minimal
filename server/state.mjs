import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { createSqliteSubscriptionControlStore } from "./services/platform/subscription-control-db.mjs";
import { createPlatformLeadReviewQueue } from "./services/platform/lead-review-queue.mjs";
import { createPlatformSubscriptionAccessShell } from "./services/platform/subscription-access-shell.mjs";
import { createPortalAccessRequestService } from "./services/platform/portal-access-requests.mjs";
import { createPortalSupportRequestService } from "./services/platform/portal-support-requests.mjs";
import { createPortalHumanChallengeService } from "./services/platform/portal-human-challenge.mjs";
import { createPortalPasswordCredentialService } from "./services/platform/portal-password-credentials.mjs";
import { createPortalRegistrationEmailVerificationService } from "./services/platform/portal-registration-email-verification.mjs";
import { createResendRegistrationEmailSender } from "./services/platform/resend-registration-email-sender.mjs";
import { createPortalRegistrationService } from "./services/platform/portal-registration.mjs";
import { createPortalTotpSecretProtector, createPortalTotpVerifier } from "./services/platform/portal-totp-verifier.mjs";
import { createUserPortalAuthService } from "./services/platform/user-portal-auth.mjs";
import { createPortalAccountAdminAuthService } from "./services/platform/admin-auth.mjs";
import { createHysteria2UsageCollector } from "./services/edge/hysteria2-usage-collector.mjs";
import { createMihomoTuicUsageCollector } from "./services/edge/mihomo-tuic-usage-collector.mjs";
import { createMihomoExternalControllerUsageSnapshotReader } from "./services/edge/mihomo-external-controller-usage-reader.mjs";
import { createXrayVlessUsageCollector } from "./services/edge/xray-vless-usage-collector.mjs";
import { createXrayStatsCliUsageSnapshotReader } from "./services/edge/xray-stats-cli-usage-reader.mjs";
import { createRuntimeUsageAccountingService } from "./services/platform/runtime-usage-accounting.mjs";
import { createTrafficAccountingService } from "./services/platform/traffic-accounting.mjs";
import { createFileTrafficCollectorStatusStore } from "./services/platform/traffic-collector-admin-projection.mjs";
import { createJapanTuicRepairObservationStore } from "./services/platform/japan-tuic-repair-observation.mjs";
import { createOrderUsageQuotaLifecycleGate } from "./services/platform/order-usage-quota-lifecycle-gate.mjs";
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
import { createDataPlaneDesiredStateNotifier } from "./services/edge/data-plane-desired-state-notifier.mjs";
import { createDataPlaneAgentService, scopedDesiredStateFrom } from "./services/edge/data-plane-agent-service.mjs";
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

function firstOptionalEnvText(...values) {
  for (const value of values) {
    const text = optionalEnvText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function firstOptionalTextFile(...candidates) {
  for (const [value, field] of candidates) {
    const filePath = optionalEnvText(value);
    if (filePath) {
      return optionalTextFile(filePath, field);
    }
  }
  return "";
}

function optionalEnvPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function envPositiveInteger(value, fallback) {
  return optionalEnvPositiveInteger(value) ?? fallback;
}

function envNonNegativeInteger(value, fallback) {
  if (String(value ?? "").trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeRuntimeIdentity(value) {
  return optionalEnvText(value).toLowerCase();
}

function runtimeValidationError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function runtimeUsageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createOptionalPortalTotpSecretProtector(value) {
  const key = optionalEnvText(value);
  if (!key) {
    return null;
  }
  try {
    return createPortalTotpSecretProtector({ key });
  } catch (error) {
    throw runtimeValidationError(`USER_PORTAL_TOTP_SECRET_KEY ${error.message}`);
  }
}

function dateNowFn(nowFn) {
  if (typeof nowFn !== "function") {
    return undefined;
  }
  return () => {
    const value = nowFn();
    if (value instanceof Date) {
      return value;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };
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

function parseJsonObjectEnv(value, field) {
  const raw = optionalEnvText(value);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_object");
    }
    return parsed;
  } catch {
    throw runtimeValidationError(`${field} must be a JSON object`);
  }
}

function parseJsonObjectConfig(value, field) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return parseJsonObjectEnv(value, field);
}

function parseJsonObjectFileEnv(value, field) {
  const filePath = optionalEnvText(value);
  if (!filePath) {
    return {};
  }
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    throw runtimeValidationError(`${field} must reference a readable JSON object file`);
  }
  return parseJsonObjectEnv(raw, field);
}

function optionalTextFile(value, field) {
  const filePath = optionalEnvText(value);
  if (!filePath) {
    return "";
  }
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    throw runtimeValidationError(`${field} must reference a readable text file`);
  }
}

function createMihomoUsageCredentialMap(env = {}, source = {}) {
  const sourceCredentialMapJson = source.credentialMapJson ?? source.credentialMap ?? source.runtimeCredentialMap;
  const sourceCredentialMapPath = source.credentialMapPath ?? source.credentialMapFile;
  return {
    ...parseJsonObjectConfig(
      sourceCredentialMapJson
        ?? env.EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_JSON
        ?? env.EDGE_MIHOMO_TUIC_USAGE_CREDENTIAL_MAP_JSON
        ?? env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_CREDENTIAL_MAP_JSON,
      sourceCredentialMapJson === undefined
        ? "EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_JSON"
        : "EDGE_MIHOMO_USAGE_SOURCES_JSON[].credentialMapJson"
    ),
    ...parseJsonObjectFileEnv(
      sourceCredentialMapPath
        ?? env.EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH
        ?? env.EDGE_MIHOMO_TUIC_USAGE_CREDENTIAL_MAP_PATH
        ?? env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_CREDENTIAL_MAP_PATH,
      sourceCredentialMapPath === undefined
        ? "EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH"
        : "EDGE_MIHOMO_USAGE_SOURCES_JSON[].credentialMapPath"
    )
  };
}

function parseUsageSourceArray(value, field) {
  return parseJsonArrayEnv(value, field).map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw runtimeValidationError(`${field}[${index}] must be an object`);
    }
    return source;
  });
}

function sourceChannelRefs(source, fallback = []) {
  if (Array.isArray(source.channelRefs)) {
    return source.channelRefs.map((ref) => optionalEnvText(ref)).filter(Boolean);
  }
  return parseCsv(source.channelRefs || source.channelRef, fallback);
}

function createXrayUsageSourceConfigs(env = {}) {
  const configuredSources = parseUsageSourceArray(
    env.EDGE_XRAY_USAGE_SOURCES_JSON || env.EDGE_XRAY_STATS_SOURCES_JSON,
    "EDGE_XRAY_USAGE_SOURCES_JSON"
  );
  if (configuredSources.length > 0) {
    return configuredSources.map((source, index) => ({
      statsServer: optionalEnvText(source.statsServer || source.server),
      xrayBinary: optionalEnvText(source.xrayBinary),
      channelRefs: sourceChannelRefs(source, []),
      fieldPrefix: `EDGE_XRAY_USAGE_SOURCES_JSON[${index}]`
    }));
  }

  const statsServer = firstOptionalEnvText(env.EDGE_XRAY_STATS_SERVER, env.EDGE_XRAY_STATS_API_SERVER);
  if (!statsServer) {
    return [];
  }
  return [{
    statsServer,
    xrayBinary: optionalEnvText(env.EDGE_XRAY_BINARY),
    channelRefs: parseCsv(env.EDGE_XRAY_USAGE_CHANNEL_REFS || env.EDGE_XRAY_STATS_CHANNEL_REFS, []),
    fieldPrefix: "EDGE_XRAY_STATS_SERVER"
  }];
}

function createMihomoUsageSourceConfigs(env = {}) {
  const configuredSources = parseUsageSourceArray(
    env.EDGE_MIHOMO_USAGE_SOURCES_JSON
      || env.EDGE_MIHOMO_TUIC_USAGE_SOURCES_JSON
      || env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_SOURCES_JSON,
    "EDGE_MIHOMO_USAGE_SOURCES_JSON"
  );
  if (configuredSources.length > 0) {
    return configuredSources.map((source, index) => ({
      sourceRef: optionalEnvText(source.sourceRef || source.id) || `mihomo_usage_source_${index + 1}`,
      controllerUrl: optionalEnvText(source.controllerUrl || source.url),
      metricsPath: source.metricsPath,
      controllerSecret: optionalEnvText(source.controllerSecret)
        || optionalTextFile(source.controllerSecretPath || source.controllerSecretFile, `EDGE_MIHOMO_USAGE_SOURCES_JSON[${index}].controllerSecretPath`),
      channelRefs: sourceChannelRefs(source, []),
      credentialMapJson: source.credentialMapJson ?? source.credentialMap ?? source.runtimeCredentialMap,
      credentialMapPath: source.credentialMapPath ?? source.credentialMapFile,
      fieldPrefix: `EDGE_MIHOMO_USAGE_SOURCES_JSON[${index}]`
    }));
  }

  const controllerUrl = firstOptionalEnvText(
    env.EDGE_MIHOMO_USAGE_CONTROLLER_URL,
    env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_URL
  );
  if (!controllerUrl) {
    return [];
  }
  return [{
    sourceRef: "",
    controllerUrl,
    metricsPath: env.EDGE_MIHOMO_USAGE_METRICS_PATH || env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_METRICS_PATH,
    controllerSecret: firstOptionalEnvText(
      env.EDGE_MIHOMO_USAGE_CONTROLLER_SECRET,
      env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_SECRET
    ) || firstOptionalTextFile(
      [env.EDGE_MIHOMO_USAGE_CONTROLLER_SECRET_FILE, "EDGE_MIHOMO_USAGE_CONTROLLER_SECRET_FILE"],
      [env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_SECRET_FILE, "EDGE_MIHOMO_EXTERNAL_CONTROLLER_SECRET_FILE"]
    ),
    channelRefs: parseCsv(env.EDGE_MIHOMO_USAGE_CHANNEL_REFS || env.EDGE_MIHOMO_TUIC_USAGE_CHANNEL_REFS, []),
    fieldPrefix: "EDGE_MIHOMO_USAGE_CONTROLLER_URL"
  }];
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
    let response;
    try {
      response = await fetchFn(url, { headers });
    } catch {
      throw runtimeUsageError("runtime_fetch_failed", "Hysteria2 traffic stats API request failed");
    }
    if (response?.status === 401) {
      throw runtimeUsageError("traffic_stats_unauthorized", "Hysteria2 traffic stats API request failed");
    }
    if (response?.status === 403) {
      throw runtimeUsageError("traffic_stats_forbidden", "Hysteria2 traffic stats API request failed");
    }
    if (!response?.ok) {
      throw runtimeUsageError("runtime_fetch_failed", "Hysteria2 traffic stats API request failed");
    }
    try {
      return await response.json();
    } catch {
      throw runtimeValidationError("Hysteria2 traffic stats API response must be JSON");
    }
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

function isMihomoTuicProxyServer(server = {}) {
  const protocol = optionalEnvText(server.protocol || server.type).toLowerCase();
  const runtimeAdapter = optionalEnvText(server.runtimeAdapter).toLowerCase();
  return protocol === "tuic" || runtimeAdapter.includes("mihomo-tuic") || runtimeAdapter.includes("tuic");
}

function isXrayVlessProxyServer(server = {}) {
  const protocol = optionalEnvText(server.protocol || server.type).toLowerCase();
  const runtimeAdapter = optionalEnvText(server.runtimeAdapter).toLowerCase();
  return protocol === "vless" || runtimeAdapter.includes("xray-vless") || runtimeAdapter.includes("vless");
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
  xrayStatsCommandRunner,
  nowFn
} = {}) {
  if (!envFlag(env.EDGE_USAGE_COLLECTOR_ENABLED || env.EDGE_USAGE_ACCOUNTING_ENABLED)) {
    return [];
  }

  const configuredServers = Array.isArray(proxyConfig?.servers) ? proxyConfig.servers : [];
  const allowedChannelRefs = new Set(edgeChannelRefs.map((ref) => optionalEnvText(ref)).filter(Boolean));
  const collectors = [];
  const hy2ChannelRefs = configuredServers
    .filter(isHysteria2ProxyServer)
    .map(proxyServerRef)
    .filter((channelRef) => channelRef && (allowedChannelRefs.size === 0 || allowedChannelRefs.has(channelRef)));

  if (hy2ChannelRefs.length > 0) {
    const trafficReader = typeof hysteria2TrafficReader === "function"
      ? hysteria2TrafficReader
      : createHysteria2TrafficStatsReader({
        listen: env.EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN,
        secret: env.EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET,
        fetchFn
      });

    collectors.push(...[...new Set(hy2ChannelRefs)].map((channelRef) => ({
      channelRef,
      ...createHysteria2UsageCollector({
        channelRef,
        trafficReader,
        nowFn
      })
    })));
  }

  for (const mihomoUsageSource of createMihomoUsageSourceConfigs(env)) {
    const allowedMihomoUsageChannelRefs = new Set(
      mihomoUsageSource.channelRefs.map((ref) => optionalEnvText(ref)).filter(Boolean)
    );
    const tuicChannelRefs = configuredServers
      .filter(isMihomoTuicProxyServer)
      .map(proxyServerRef)
      .filter((channelRef) =>
        channelRef
        && (allowedChannelRefs.size === 0 || allowedChannelRefs.has(channelRef))
        && (allowedMihomoUsageChannelRefs.size === 0 || allowedMihomoUsageChannelRefs.has(channelRef))
      );
    const snapshotReader = createMihomoExternalControllerUsageSnapshotReader({
      controllerUrl: mihomoUsageSource.controllerUrl,
      metricsPath: mihomoUsageSource.metricsPath,
      sourceRef: mihomoUsageSource.sourceRef || undefined,
      controllerSecret: mihomoUsageSource.controllerSecret,
      credentialRefByRuntimeUser: createMihomoUsageCredentialMap(env, mihomoUsageSource),
      fetchFn,
      nowFn
    });

    collectors.push(...[...new Set(tuicChannelRefs)].map((channelRef) => ({
      channelRef,
      ...createMihomoTuicUsageCollector({
        channelRef,
        sourceRef: mihomoUsageSource.sourceRef || undefined,
        snapshotReader,
        nowFn
      })
    })));
  }

  for (const xrayUsageSource of createXrayUsageSourceConfigs(env)) {
    const allowedXrayUsageChannelRefs = new Set(
      xrayUsageSource.channelRefs.map((ref) => optionalEnvText(ref)).filter(Boolean)
    );
    const vlessChannelRefs = configuredServers
      .filter(isXrayVlessProxyServer)
      .map(proxyServerRef)
      .filter((channelRef) =>
        channelRef
        && (allowedChannelRefs.size === 0 || allowedChannelRefs.has(channelRef))
        && (allowedXrayUsageChannelRefs.size === 0 || allowedXrayUsageChannelRefs.has(channelRef))
      );
    const snapshotReader = createXrayStatsCliUsageSnapshotReader({
      xrayBinary: optionalEnvText(xrayUsageSource.xrayBinary) || optionalEnvText(env.EDGE_XRAY_BINARY) || "xray",
      statsServer: xrayUsageSource.statsServer,
      ...(typeof xrayStatsCommandRunner === "function" ? { commandRunner: xrayStatsCommandRunner } : {}),
      nowFn
    });

    collectors.push(...[...new Set(vlessChannelRefs)].map((channelRef) => ({
      channelRef,
      ...createXrayVlessUsageCollector({
        channelRef,
        snapshotReader
      })
    })));
  }

  return collectors;
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

function runtimePathHasIdentitySegment(value, identity) {
  return normalizeRuntimeIdentity(value)
    .replaceAll("\\", "/")
    .split("/")
    .some((segment) => segment === identity);
}

function assertJpRuntimeTlsIdentity({ channelRef, serverConfig = {}, certificatePath, privateKeyPath } = {}) {
  const host = normalizeRuntimeIdentity(serverConfig.host || serverConfig.server);
  const sni = normalizeRuntimeIdentity(serverConfig.sni || serverConfig.serverName || serverConfig.server_name);
  const identity = sni || host;
  if (identity !== "jp.gccwebos.com") {
    return;
  }

  const safeChannelRef = optionalEnvText(channelRef || serverConfig.name || serverConfig.id || "runtime channel");
  if (!runtimePathHasIdentitySegment(certificatePath, identity)) {
    throw runtimeValidationError(`${safeChannelRef} uses jp.gccwebos.com but TLS certificate path must reference jp.gccwebos.com material`);
  }
  if (!runtimePathHasIdentitySegment(privateKeyPath, identity)) {
    throw runtimeValidationError(`${safeChannelRef} uses jp.gccwebos.com but TLS private key path must reference jp.gccwebos.com material`);
  }
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

function portalAccessRequestForTenant({ controlStore, tenantId }) {
  if (
    !tenantId
    || !controlStore
    || typeof controlStore.getPortalAccessRequest !== "function"
  ) {
    return null;
  }
  if (typeof controlStore.listPortalAccessRequests === "function") {
    const requests = [
      ...controlStore.listPortalAccessRequests({ status: "delivered" }),
      ...controlStore.listPortalAccessRequests({ status: "issued" })
    ];
    const direct = requests.find((request) => optionalEnvText(request?.tenantId) === tenantId);
    if (direct) {
      return direct;
    }
  }
  if (typeof controlStore.findIssuedSubscriptionBindingByTenantRef !== "function") {
    return null;
  }
  const binding = controlStore.findIssuedSubscriptionBindingByTenantRef(tenantId);
  if (!binding?.requestId) {
    return null;
  }
  return controlStore.getPortalAccessRequest(binding.requestId);
}

function edgeCredentialRefsForTenantChannel({ controlStore, tenantId, channelRef }) {
  if (!tenantId || !channelRef) {
    return [];
  }
  const request = portalAccessRequestForTenant({ controlStore, tenantId });
  if (!request) {
    return [];
  }
  const credentials = Array.isArray(request.edgeCredentials) && request.edgeCredentials.length > 0
    ? request.edgeCredentials
    : [{
      edgeChannelRef: request.edgeChannelRef,
      edgeCredentialRef: request.edgeCredentialRef
    }];
  return credentials
    .filter((credential) => optionalEnvText(credential?.edgeChannelRef) === channelRef)
    .map((credential) => optionalEnvText(credential?.edgeCredentialRef))
    .filter(Boolean);
}

function latestMatchingScopedAppliedReceipt({ controlStore, channelRef, desiredState, tenantId }) {
  const edgeCredentialRefs = edgeCredentialRefsForTenantChannel({
    controlStore,
    tenantId,
    channelRef
  });
  if (edgeCredentialRefs.length === 0) {
    return null;
  }
  const scopedDesiredState = scopedDesiredStateFrom(desiredState, { edgeCredentialRefs });
  if (!scopedDesiredState?.desiredStateRef || !scopedDesiredState.channelRefs?.includes(channelRef)) {
    return null;
  }
  return latestMatchingAppliedReceipt({
    controlStore,
    channelRef,
    desiredStateRef: scopedDesiredState.desiredStateRef
  });
}

function createReceiptBackedSubscriptionChannelGate({ controlStore } = {}) {
  return ({ server, tenantId }) => {
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
    }) || latestMatchingScopedAppliedReceipt({
      controlStore,
      channelRef,
      desiredState,
      tenantId
    }));
  };
}

export function createRuntimeState(options = {}) {
  const rootDir = rootPathFrom(options.rootDir || new URL("..", import.meta.url));
  const env = options.env || process.env;
  const trafficCollectorStatusPath = optionalEnvText(env.EDGE_USAGE_COLLECTOR_STATUS_PATH);
  const japanTuicRepairObservationPath = optionalEnvText(env.EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH);
  if (japanTuicRepairObservationPath && !trafficCollectorStatusPath) {
    throw runtimeValidationError(
      "EDGE_JAPAN_TUIC_REPAIR_OBSERVATION_PATH requires EDGE_USAGE_COLLECTOR_STATUS_PATH"
    );
  }
  if (
    japanTuicRepairObservationPath
    && resolve(japanTuicRepairObservationPath) === resolve(trafficCollectorStatusPath)
  ) {
    throw runtimeValidationError(
      "Japan TUIC repair observation and collector status paths must differ"
    );
  }
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
  const adminAuthRoutesEnabled = envFlag(env.ADMIN_AUTH_ROUTES_ENABLED || env.ADMIN_PROTECTED_ROUTE_AUTH_ENABLED);
  const localProxyControlRoutesEnabled = envFlag(env.LOCAL_PROXY_CONTROL_ROUTES_ENABLED, true);
  const adminAuthPortalAccountId = optionalEnvText(env.ADMIN_AUTH_PORTAL_ACCOUNT_ID);
  if (adminAuthRoutesEnabled && !adminAuthPortalAccountId) {
    throw new Error("ADMIN_AUTH_PORTAL_ACCOUNT_ID is required when admin auth routes are enabled");
  }
  const portalRegistrationEmailProvider = optionalEnvText(env.USER_PORTAL_REGISTRATION_EMAIL_PROVIDER).toLowerCase();
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
  const dataPlaneAgentAllowedCidrs = parseCsv(env.EDGE_DATA_PLANE_AGENT_ALLOWED_CIDRS, DEFAULT_ADMIN_ALLOWED_CIDRS);
  const dataPlaneAgentRoutesEnabled = envFlag(env.EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED);
  const tempLinkTtlMinutes = Number.parseInt(env.SUBSCRIPTION_TEMP_LINK_TTL_MINUTES, 10) || 24 * 60;
  const portalRefreshCooldownMs = envNonNegativeInteger(env.USER_PORTAL_REFRESH_COOLDOWN_MS, 300000);
  const ownsSubscriptionStore = !options.subscriptionStore && !options.subscriptionRepository && !options.subscriptionCore && !options.subscriptionService;
  const subscriptionStore = options.subscriptionStore || options.subscriptionRepository || (
    ownsSubscriptionStore ? createSqliteSubscriptionStore({ dbPath: subscriptionDbPath }) : null
  );
  const ownsControlStore = !options.platformControlStore;
  const platformControlStore = options.platformControlStore || createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  const subscriptionCoreNowFn = dateNowFn(options.subscriptionNowFn || options.userPortalNowFn);
  let edgeCredentialMaterialStore = options.edgeCredentialMaterialStore || null;
  const subscriptionCore = options.subscriptionCore || options.subscriptionService || createSubscriptionCore({
    store: subscriptionStore,
    proxyConfig,
    publicSubscriptionBaseUrl,
    nowFn: subscriptionCoreNowFn,
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
  const platformLeadQueue = options.platformLeadQueue || createPlatformLeadReviewQueue({
    store: platformControlStore
  });
  const platformAccountShell = options.platformAccountShell || createPlatformAccountEntitlementShell();
  const platformAccessShell = options.platformAccessShell || createPlatformSubscriptionAccessShell({
    accountShell: platformAccountShell
  });
  let edgeCredentialIssuer = options.edgeCredentialIssuer || null;
  let edgeLifecycleService = options.edgeLifecycleService || null;
  let edgeRuntimeAdapter = options.edgeRuntimeAdapter || null;
  const edgeDesiredStateNotifier = options.edgeDesiredStateNotifier || createDataPlaneDesiredStateNotifier({
    controlStore: platformControlStore,
    servers: configuredServers
  });
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
        assertJpRuntimeTlsIdentity({
          channelRef: channelRefForRuntime,
          serverConfig,
          certificatePath: env.EDGE_MIHOMO_TUIC_CERTIFICATE_PATH,
          privateKeyPath: env.EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH
        });
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
              alpn: parseCsv(env.EDGE_MIHOMO_TUIC_ALPN, ["h3"]),
              usageController: {
                controllerUrl: firstOptionalEnvText(
                  env.EDGE_MIHOMO_RUNTIME_CONTROLLER_URL,
                  env.EDGE_MIHOMO_USAGE_CONTROLLER_URL,
                  env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_URL
                ),
                secret: firstOptionalEnvText(
                  env.EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET,
                  env.EDGE_MIHOMO_USAGE_CONTROLLER_SECRET,
                  env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_SECRET
                ) || firstOptionalTextFile(
                  [env.EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET_FILE, "EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET_FILE"],
                  [env.EDGE_MIHOMO_USAGE_CONTROLLER_SECRET_FILE, "EDGE_MIHOMO_USAGE_CONTROLLER_SECRET_FILE"],
                  [env.EDGE_MIHOMO_EXTERNAL_CONTROLLER_SECRET_FILE, "EDGE_MIHOMO_EXTERNAL_CONTROLLER_SECRET_FILE"]
                )
              }
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
              usageStats: {
                statsServer: firstOptionalEnvText(
                  env.EDGE_XRAY_RUNTIME_STATS_SERVER,
                  env.EDGE_XRAY_STATS_SERVER,
                  env.EDGE_XRAY_STATS_API_SERVER
                )
              },
              validationAttempts: env.EDGE_XRAY_LISTENER_VALIDATION_ATTEMPTS,
              validationRetryDelayMs: env.EDGE_XRAY_LISTENER_VALIDATION_RETRY_DELAY_MS
            },
            resolveCredentialMaterial: (credentialRef) => edgeCredentialMaterialStore.resolveCredentialMaterial(credentialRef),
            commandRunner: options.edgeRuntimeCommandRunner
          })
        };
      }
      if (adapterName === "hysteria2-explicit-restart") {
        assertJpRuntimeTlsIdentity({
          channelRef: channelRefForRuntime,
          serverConfig,
          certificatePath: env.EDGE_HYSTERIA2_CERTIFICATE_PATH,
          privateKeyPath: env.EDGE_HYSTERIA2_PRIVATE_KEY_PATH
        });
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
          nowFn: options.edgeLifecycleNowFn || options.userPortalNowFn,
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
    nowFn: options.userPortalNowFn,
    edgeCredentialIssuer,
    edgeLifecycleService,
    edgeDesiredStateNotifier,
    refreshCooldownMs: portalRefreshCooldownMs,
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
  const platformPortalRegistrationEmailSender = options.portalRegistrationEmailSender || (
    userPortalRoutesEnabled && portalRegistrationEmailProvider === "resend"
      ? createResendRegistrationEmailSender({
        apiKey: env.RESEND_API_KEY,
        from: env.USER_PORTAL_REGISTRATION_EMAIL_FROM,
        replyTo: env.USER_PORTAL_REGISTRATION_EMAIL_REPLY_TO,
        userAgent: env.USER_PORTAL_REGISTRATION_EMAIL_USER_AGENT,
        fetchFn: options.portalRegistrationEmailFetchFn
      })
      : null
  );
  const platformPortalRegistrationEmailDelivery = {
    provider: platformPortalRegistrationEmailSender && !portalRegistrationEmailProvider
      ? "custom"
      : (portalRegistrationEmailProvider || "disabled"),
    configured: Boolean(
      platformPortalRegistrationEmailSender
      && (
        typeof platformPortalRegistrationEmailSender.isConfigured !== "function"
        || platformPortalRegistrationEmailSender.isConfigured()
      )
    )
  };
  const platformPortalRegistrationEmailVerifications = options.platformPortalRegistrationEmailVerifications || (
    userPortalRoutesEnabled ? createPortalRegistrationEmailVerificationService({
      nowFn: options.userPortalNowFn,
      sender: platformPortalRegistrationEmailSender
    }) : null
  );
  const platformPortalPasswordCredentialService = options.platformPortalPasswordCredentialService || (
    (userPortalRoutesEnabled || adminAuthRoutesEnabled) ? createPortalPasswordCredentialService({
      controlStore: platformControlStore,
      nowFn: options.userPortalNowFn
    }) : null
  );
  const platformPortalTotpSecretProtector = options.userPortalTotpSecretProtector
    || createOptionalPortalTotpSecretProtector(env.USER_PORTAL_TOTP_SECRET_KEY);
  const platformPortalTotpVerifier = options.userPortalTotpVerifier || createPortalTotpVerifier({
    nowFn: options.userPortalNowFn,
    secretProtector: platformPortalTotpSecretProtector
  });
  const platformAdminTotpVerifier = options.adminAuthTotpVerifier || createPortalTotpVerifier({
    nowFn: options.adminAuthNowFn,
    secretProtector: platformPortalTotpSecretProtector
  });
  const platformAdminAuth = options.platformAdminAuth || (
    adminAuthRoutesEnabled
      ? createPortalAccountAdminAuthService({
        controlStore: platformControlStore,
        passwordCredentialService: platformPortalPasswordCredentialService,
        nowFn: options.adminAuthNowFn,
        sessionSecret: env.ADMIN_AUTH_SESSION_SECRET,
        accountId: adminAuthPortalAccountId,
        totpVerifier: platformAdminTotpVerifier,
        totpSecretFactory: options.adminAuthTotpSecretFactory,
        enrollmentRefFactory: options.adminAuthEnrollmentRefFactory,
        credentialRefFactory: options.adminAuthCredentialRefFactory,
        challengeRefFactory: options.adminAuthChallengeRefFactory,
        sessionRefFactory: options.adminAuthSessionRefFactory
      })
      : null
  );
  const platformUserPortalAuth = options.platformUserPortalAuth || (
    userPortalRoutesEnabled ? createUserPortalAuthService({
      controlStore: platformControlStore,
      nowFn: options.userPortalNowFn,
      totpVerifier: platformPortalTotpVerifier,
      totpSecretProtector: platformPortalTotpSecretProtector,
      passwordCredentialService: platformPortalPasswordCredentialService,
      allowPasswordOnlySessionForSetup: envFlag(env.USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION)
    }) : null
  );
  const platformPortalRegistrations = options.platformPortalRegistrations || (
    userPortalRoutesEnabled ? createPortalRegistrationService({
      controlStore: platformControlStore,
      userPortalAuth: platformUserPortalAuth,
      passwordCredentialService: platformPortalPasswordCredentialService,
      portalAccessRequests: platformPortalAccessRequests,
      nowFn: options.userPortalNowFn
    }) : null
  );
  const platformTrafficAccounting = options.platformTrafficAccounting || createTrafficAccountingService({
    controlStore: platformControlStore,
    nowFn: options.trafficAccountingNowFn
  });
  const orderUsageQuotaLifecycleGate = options.orderUsageQuotaLifecycleGate || (
    platformPortalAccessRequests
      ? createOrderUsageQuotaLifecycleGate({
        orderLifecycleService: platformPortalAccessRequests
      })
      : null
  );
  const edgeUsageCollectors = Array.isArray(options.edgeUsageCollectors)
    ? options.edgeUsageCollectors
    : createEnvEdgeUsageCollectors({
      env,
      proxyConfig,
      edgeChannelRefs,
      hysteria2TrafficReader: options.hysteria2TrafficReader,
      fetchFn: options.edgeUsageFetch,
      xrayStatsCommandRunner: options.edgeUsageCommandRunner || options.edgeRuntimeCommandRunner,
      nowFn: options.usageCollectorNowFn
    });
  const edgeUsageAccounting = options.edgeUsageAccounting || (
    edgeUsageCollectors.length > 0
      ? createRuntimeUsageAccountingService({
        collectors: edgeUsageCollectors,
        accounting: platformTrafficAccounting,
        trafficSupplyLifecycleGate: orderUsageQuotaLifecycleGate
      })
      : null
  );
  const trafficCollectorStatusStore = options.trafficCollectorStatusStore || (
    trafficCollectorStatusPath
      ? createFileTrafficCollectorStatusStore({
        filePath: trafficCollectorStatusPath
      })
      : null
  );
  const japanTuicRepairObservationStore = options.japanTuicRepairObservationStore || (
    japanTuicRepairObservationPath
      ? createJapanTuicRepairObservationStore({
        filePath: japanTuicRepairObservationPath
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
  if (!edgeCredentialMaterialStore && dataPlaneAgentRoutesEnabled) {
    const materialPath = optionalEnvText(env.EDGE_CREDENTIAL_MATERIAL_PATH || env.USER_PORTAL_EDGE_MATERIAL_PATH);
    if (materialPath) {
      edgeCredentialMaterialStore = createFileBackedEdgeCredentialMaterialStore({
        filePath: materialPath
      });
    }
  }
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
        nodes: configuredDataPlaneAgentNodes,
        credentialMaterialStore: edgeCredentialMaterialStore
      })
      : null
  );
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
    localProxyControl: {
      routesEnabled: localProxyControlRoutesEnabled,
      owner: "local_proxy_control",
      scope: "local_operator_console"
    },
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
      adminAuthRoutesEnabled,
      adminAuth: platformAdminAuth,
      userPortalRoutesEnabled,
      userPortalAuth: platformUserPortalAuth,
      portalHumanChallenges: platformPortalHumanChallenges,
      portalRegistrationEmailDelivery: platformPortalRegistrationEmailDelivery,
      portalRegistrationEmailVerifications: platformPortalRegistrationEmailVerifications,
      portalPasswordCredentialService: platformPortalPasswordCredentialService,
      portalRegistrations: platformPortalRegistrations,
      portalAccessRequests: platformPortalAccessRequests,
      portalSupportRequests: platformPortalSupportRequests,
      controlStore: platformControlStore,
      edgeCredentialMaterialStore,
      edgeCredentialIssuer,
      edgeLifecycleService,
      edgeRuntimeAdapter,
      trafficAccounting: platformTrafficAccounting,
      orderUsageQuotaLifecycleGate,
      edgeUsageCollectors,
      edgeUsageAccounting,
      trafficCollectorStatusStore,
      japanTuicRepairObservationStore,
      dataPlaneHandoffQueue,
      dataPlaneAgentRoutesEnabled,
      dataPlaneAgentService
    },
    security: {
      adminAllowedCidrs,
      trustedProxyCidrs,
      dataPlaneAgentAllowedCidrs,
      subRateLimit: {
        windowMs: Number.parseInt(env.SUB_RATE_LIMIT_WINDOW_MS, 10) || 60000,
        max: Number.parseInt(env.SUB_RATE_LIMIT_MAX, 10) || 30
      },
      subCredentialRateLimit: {
        windowMs: envPositiveInteger(env.SUB_CREDENTIAL_RATE_LIMIT_WINDOW_MS, 60000),
        max: envPositiveInteger(env.SUB_CREDENTIAL_RATE_LIMIT_MAX, 30)
      }
    },
    close,
    runCommand,
    isPortListening,
    autoStartHttpProxy: options.autoStartHttpProxy ?? true
  };
}
