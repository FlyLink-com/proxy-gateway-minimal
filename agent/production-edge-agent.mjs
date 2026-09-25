import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createFileBackedEdgeCredentialMaterialStore } from "../server/services/edge/credential-material-store.mjs";
import {
  buildDataPlaneCredentialScopeDigest,
  validateDataPlaneApplyReceipt,
  validateDataPlaneDesiredState,
  validateDataPlaneMaterialResponse
} from "../server/services/edge/data-plane-agent-protocol.mjs";
import { createHysteria2HostRuntimeAdapter } from "../server/services/edge/hysteria2-runtime-adapter.mjs";
import { createMihomoTuicHostRuntimeAdapter } from "../server/services/edge/mihomo-tuic-host-runtime-adapter.mjs";
import { createXrayVlessRealityHostRuntimeAdapter } from "../server/services/edge/xray-vless-reality-runtime-adapter.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function agentError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }
  const normalized = text(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw agentError("validation_error", `${field} is required`);
  }
  return normalized;
}

function safeRef(value, field = "ref") {
  const normalized = text(value);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw agentError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function parseCsv(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeRef(item, "channelRef"));
  }
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => safeRef(item, "channelRef"));
}

function isPrivateIpv4(hostname) {
  const parts = text(hostname).split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 127;
}

function normalizeBaseUrl(value) {
  const raw = requiredText(value, "baseUrl");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw agentError("validation_error", "baseUrl is invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw agentError("validation_error", "baseUrl protocol is invalid");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!PRIVATE_HOSTS.has(host) && !isPrivateIpv4(host)) {
    throw agentError("validation_error", "baseUrl must be private");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function readToken({ token, tokenFile }) {
  const supplied = text(token);
  if (supplied) {
    return supplied;
  }
  const path = text(tokenFile);
  if (!path) {
    throw agentError("validation_error", "token or tokenFile is required");
  }
  return requiredText(readFileSync(path, "utf8"), "token").replace(/\r?\n$/, "");
}

function normalizeRuntimeAdapters(runtimeAdapters = {}) {
  if (runtimeAdapters instanceof Map) {
    return runtimeAdapters;
  }
  if (runtimeAdapters && typeof runtimeAdapters === "object") {
    return new Map(Object.entries(runtimeAdapters));
  }
  return new Map();
}

export function normalizeProductionEdgeAgentConfig(input = {}) {
  const channelRefs = parseCsv(input.channelRefs);
  if (channelRefs.length === 0) {
    throw agentError("validation_error", "channelRefs is required");
  }
  return {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    token: readToken(input),
    nodeRef: safeRef(input.nodeRef, "nodeRef"),
    channelRefs,
    edgeCredentialRefs: parseCsv(input.edgeCredentialRefs),
    applyEnabled: bool(input.applyEnabled, false),
    dryRun: bool(input.dryRun, true),
    fetchImpl: input.fetchImpl || globalThis.fetch,
    nowFn: typeof input.nowFn === "function" ? input.nowFn : () => new Date(),
    runtimeAdapters: normalizeRuntimeAdapters(input.runtimeAdapters),
    materialStore: input.materialStore || null
  };
}

function desiredStateUrl(baseUrl, edgeCredentialRefs = []) {
  const url = new URL(`${baseUrl}/api/internal/data-plane-agent/desired-state`);
  if (edgeCredentialRefs.length > 0) {
    url.searchParams.set("edgeCredentialRefs", edgeCredentialRefs.join(","));
  }
  return url.toString();
}

const AGENT_PROTOCOL_VERSION = "1.1";
const AGENT_CAPABILITIES = ["empty_desired_state", "tombstone_reconcile"];
const SCOPED_AGENT_PROTOCOL_VERSION = "1.2";
const SCOPED_AGENT_CAPABILITIES = [
  ...AGENT_CAPABILITIES,
  "scoped_tombstone_lineage"
];

function receiptUrl(baseUrl) {
  return `${baseUrl}/api/internal/data-plane-agent/receipts`;
}

function materialUrl(baseUrl) {
  return `${baseUrl}/api/internal/data-plane-agent/materials`;
}

async function readJsonResponse(response, context) {
  if (!response?.ok) {
    throw agentError("agent_route_failed", `${context} failed`);
  }
  return response.json();
}

function materialDigestStrings(state, channelRef) {
  const digests = Array.isArray(state.materialDigests) ? state.materialDigests : [];
  return digests
    .filter((item) => typeof item === "string" || item?.channelRef === channelRef)
    .map((item) => typeof item === "string" ? item : item.digest)
    .filter(Boolean);
}

function exactUniqueSet(left = [], right = []) {
  const leftSorted = [...left].sort((a, b) => a.localeCompare(b));
  const rightSorted = [...right].sort((a, b) => a.localeCompare(b));
  return leftSorted.length === rightSorted.length
    && new Set(leftSorted).size === leftSorted.length
    && new Set(rightSorted).size === rightSorted.length
    && leftSorted.every((value, index) => value === rightSorted[index]);
}

function scopedActiveMaterialEvidence(state = {}) {
  return (state.materialDigests || []).map((item) => (
    typeof item === "string"
      ? JSON.stringify(["string", item])
      : JSON.stringify(["object", item?.channelRef, item?.edgeCredentialRef, item?.digest])
  ));
}

function exactScopedActiveState(state, authoritative) {
  return exactUniqueSet(state.channelRefs, authoritative.channelRefs)
    && exactUniqueSet(state.edgeCredentialRefs, authoritative.edgeCredentialRefs)
    && exactUniqueSet(
      scopedActiveMaterialEvidence(state),
      scopedActiveMaterialEvidence(authoritative)
    );
}

function runtimeFromChannel(channelRef) {
  const ref = text(channelRef).toLowerCase();
  if (ref.includes("vless") || ref.includes("xray")) {
    return "xray-vless-reality";
  }
  if (ref.includes("hy2") || ref.includes("hysteria")) {
    return "hysteria2";
  }
  return "mihomo-tuic";
}

function payloadForAdapter(state, channelRef, runtime, revokeCredentialRefs = []) {
  const refs = Array.isArray(state.edgeCredentialRefs) ? state.edgeCredentialRefs : [];
  return {
    channelRef,
    desiredStateRef: state.desiredStateRef,
    runtime,
    activationSurface: "explicit-restart",
    summary: {
      addCount: refs.length,
      revokeCount: revokeCredentialRefs.length,
      rotateCount: 0,
      unchangedCount: 0
    },
    actions: [
      ...refs.map((credentialRef) => ({
        action: "add",
        credentialRef
      })),
      ...revokeCredentialRefs.map((credentialRef) => ({
        action: "revoke",
        credentialRef
      }))
    ]
  };
}

async function applyWithAdapter({ adapter, state, channelRef, revokeCredentialRefs = [] }) {
  if (revokeCredentialRefs.length > 0) {
    if (adapter && typeof adapter.applyCredentialReconciliation === "function") {
      const runtime = text(adapter.runtime) || runtimeFromChannel(channelRef);
      return adapter.applyCredentialReconciliation(
        payloadForAdapter(state, channelRef, runtime, revokeCredentialRefs)
      );
    }
    throw agentError("runtime_adapter_missing", "runtime reconciliation adapter is missing");
  }
  if (adapter && typeof adapter.applyDesiredState === "function") {
    return adapter.applyDesiredState(state, { channelRef });
  }
  if (adapter && typeof adapter.applyCredentialReconciliation === "function") {
    const runtime = text(adapter.runtime) || runtimeFromChannel(channelRef);
    return adapter.applyCredentialReconciliation(
      payloadForAdapter(state, channelRef, runtime, revokeCredentialRefs)
    );
  }
  throw agentError("runtime_adapter_missing", "runtime adapter is missing");
}

function oneApplyRef(applyResult, field) {
  const direct = text(applyResult?.[field]);
  const nested = text(applyResult?.runtimeReceipt?.[field]);
  if (direct && nested && direct !== nested) {
    throw agentError("validation_error", `${field} conflict`);
  }
  return direct || nested;
}

function receiptFromApplyResult({ state, channelRef, applyResult = {}, now }) {
  const status = text(applyResult.status) || "failed";
  const scopedTombstone = state.scopedTombstone || null;
  const receipt = {
    type: "gccgw_data_plane_apply_receipt",
    nodeRef: state.nodeRef,
    desiredStateRef: state.desiredStateRef,
    generation: state.generation,
    channelRef,
    status: ["applied", "failed", "unchanged", "stale", "rejected"].includes(status) ? status : "failed",
    configTest: applyResult.configTest === true || applyResult.configTest?.ok === true,
    serviceActive: applyResult.serviceActive === true || applyResult.service?.active === true,
    listenerPresent: applyResult.listenerPresent === true
      || applyResult.listener?.udp443 === true
      || applyResult.listener?.tcp === true,
    credentialCount: scopedTombstone
      ? (Array.isArray(state.edgeCredentialRefs) ? state.edgeCredentialRefs.length : 0)
      : (Number.isInteger(applyResult.credentialCount)
          ? applyResult.credentialCount
          : (Array.isArray(state.edgeCredentialRefs) ? state.edgeCredentialRefs.length : 0)),
    appliedAt: text(applyResult.appliedAt) || now.toISOString(),
    materialDigests: scopedTombstone
      ? materialDigestStrings(state, channelRef)
      : (Array.isArray(applyResult.materialDigests) && applyResult.materialDigests.length > 0
          ? applyResult.materialDigests
          : materialDigestStrings(state, channelRef)),
    ...(scopedTombstone ? { scopedTombstone } : {})
  };
  const backupRef = oneApplyRef(applyResult, "backupRef");
  const rollbackRef = oneApplyRef(applyResult, "rollbackRef");
  if (backupRef) {
    receipt.backupRef = backupRef;
  }
  if (rollbackRef) {
    receipt.rollbackRef = rollbackRef;
  }
  if (text(applyResult.reasonCode)) {
    receipt.reasonCode = text(applyResult.reasonCode);
  }
  return validateDataPlaneApplyReceipt(receipt, {
    expectedNodeRef: state.nodeRef,
    expectedGeneration: state.generation,
    allowedChannelRefs: state.channelRefs
  });
}

function normalizeDesiredState(input, { nodeRef, channelRefs }) {
  const normalized = validateDataPlaneDesiredState(input, {
    expectedNodeRef: nodeRef,
    allowedChannelRefs: channelRefs
  });
  return {
    ...normalized,
    desiredStateRef: safeRef(input.desiredStateRef, "desiredStateRef")
  };
}

function assertMaterialStore(store) {
  if (!store || typeof store.putCredentialMaterial !== "function") {
    throw agentError("material_store_required", "protected material store is required");
  }
  return store;
}

function mergeMaterialBatchIntoStore(materialStore, batch) {
  const store = assertMaterialStore(materialStore);
  let count = 0;
  for (const record of batch.records || []) {
    store.putCredentialMaterial({
      credentialRef: record.edgeCredentialRef,
      materialDigest: record.materialDigest,
      material: record.material
    });
    count += 1;
  }
  return count;
}

export function createProductionEdgeAgentRunner(input = {}) {
  const config = normalizeProductionEdgeAgentConfig(input);
  if (typeof config.fetchImpl !== "function") {
    throw agentError("validation_error", "fetchImpl is required");
  }

  const scopedLineageEnabled = config.edgeCredentialRefs.length > 0;
  const agentProtocolVersion = scopedLineageEnabled
    ? SCOPED_AGENT_PROTOCOL_VERSION
    : AGENT_PROTOCOL_VERSION;
  const agentCapabilities = scopedLineageEnabled
    ? SCOPED_AGENT_CAPABILITIES
    : AGENT_CAPABILITIES;

  async function fetchDesiredState(edgeCredentialRefs = config.edgeCredentialRefs) {
    const response = await config.fetchImpl(desiredStateUrl(config.baseUrl, edgeCredentialRefs), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        "X-GCCGW-Agent-Version": agentProtocolVersion,
        "X-GCCGW-Agent-Capabilities": agentCapabilities.join(",")
      }
    });
    const body = await readJsonResponse(response, "desired-state");
    const states = Array.isArray(body?.desiredStates) ? body.desiredStates : [];
    return states.map((state) => normalizeDesiredState(state, {
      nodeRef: config.nodeRef,
      channelRefs: config.channelRefs
    }));
  }

  async function fetchMaterialBatch(state) {
    const response = await config.fetchImpl(materialUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        type: "gccgw_data_plane_material_request",
        nodeRef: state.nodeRef,
        desiredStateRef: state.desiredStateRef,
        edgeCredentialRefs: state.edgeCredentialRefs,
        mode: "material"
      })
    });
    const body = await readJsonResponse(response, "material");
    return validateDataPlaneMaterialResponse(body, {
      expectedNodeRef: state.nodeRef,
      expectedDesiredStateRef: state.desiredStateRef
    });
  }

  async function postReceipt(receipt) {
    const response = await config.fetchImpl(receiptUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(receipt)
    });
    return readJsonResponse(response, "receipt");
  }

  function assertScopedMaterialBatch(state, batch) {
    const expectedByRef = new Map();
    for (const digest of state.materialDigests || []) {
      if (digest && typeof digest === "object") {
        expectedByRef.set(digest.edgeCredentialRef, digest.digest);
      } else if (state.edgeCredentialRefs.length === 1) {
        expectedByRef.set(state.edgeCredentialRefs[0], digest);
      }
    }
    const actualByRef = new Map();
    for (const record of batch.records || []) {
      if (actualByRef.has(record.edgeCredentialRef)) {
        throw agentError("scoped_tombstone_material_mismatch");
      }
      actualByRef.set(record.edgeCredentialRef, record.materialDigest);
    }
    const exact = actualByRef.size === state.edgeCredentialRefs.length
      && state.edgeCredentialRefs.every((edgeCredentialRef) => (
        expectedByRef.get(edgeCredentialRef) === actualByRef.get(edgeCredentialRef)
      ));
    if (!exact) {
      throw agentError("scoped_tombstone_material_mismatch");
    }
  }

  async function prepareScopedTombstone(state) {
    const authoritativeStates = await fetchDesiredState([]);
    const matching = authoritativeStates.filter((candidate) => (
      !candidate.scopedTombstone
      && candidate.desiredStateRef === state.scopedTombstone.sourceDesiredStateRef
      && candidate.generation === state.scopedTombstone.sourceGeneration
      && candidate.channelRefs.length === 1
      && state.channelRefs.length === 1
      && candidate.channelRefs[0] === state.channelRefs[0]
    ));
    if (matching.length !== 1) {
      throw agentError("scoped_tombstone_authority_mismatch");
    }
    const authoritative = matching[0];
    if (!exactScopedActiveState(state, authoritative)) {
      throw agentError("scoped_tombstone_state_mismatch");
    }
    const expectedDigests = state.scopedTombstone.credentialDigests;
    const revokeCredentialRefs = config.edgeCredentialRefs.filter((edgeCredentialRef) => (
      expectedDigests.includes(buildDataPlaneCredentialScopeDigest(edgeCredentialRef))
    ));
    const actualDigests = revokeCredentialRefs
      .map(buildDataPlaneCredentialScopeDigest)
      .sort((a, b) => a.localeCompare(b));
    if (actualDigests.length !== expectedDigests.length
      || actualDigests.some((digest, index) => digest !== expectedDigests[index])
      || revokeCredentialRefs.some((edgeCredentialRef) => authoritative.edgeCredentialRefs.includes(edgeCredentialRef))) {
      throw agentError("scoped_tombstone_scope_mismatch");
    }
    let materialCount = 0;
    if (authoritative.edgeCredentialRefs.length > 0) {
      const materialBatch = await fetchMaterialBatch(authoritative);
      assertScopedMaterialBatch(authoritative, materialBatch);
      materialCount = mergeMaterialBatchIntoStore(config.materialStore, materialBatch);
    }
    return {
      runtimeState: {
        ...authoritative,
        desiredStateRef: state.desiredStateRef,
        generation: state.generation,
        scopedTombstone: state.scopedTombstone
      },
      revokeCredentialRefs,
      materialCount
    };
  }

  return {
    async runOnce() {
      const desiredStates = await fetchDesiredState();
      if (config.dryRun || !config.applyEnabled) {
        return {
          ok: true,
          dryRun: config.dryRun,
          applyEnabled: config.applyEnabled,
          desiredStateCount: desiredStates.length,
          appliedCount: 0,
          receiptCount: 0,
          redacted: true
        };
      }

      let appliedCount = 0;
      let receiptCount = 0;
      let materialCount = 0;
      const receipts = [];
      for (const state of desiredStates) {
        let runtimeState = state;
        let revokeCredentialRefs = [];
        if (state.scopedTombstone) {
          const prepared = await prepareScopedTombstone(state);
          runtimeState = prepared.runtimeState;
          revokeCredentialRefs = prepared.revokeCredentialRefs;
          materialCount += prepared.materialCount;
        } else if (state.edgeCredentialRefs.length > 0) {
          const materialBatch = await fetchMaterialBatch(state);
          materialCount += mergeMaterialBatchIntoStore(config.materialStore, materialBatch);
        }
        for (const channelRef of state.channelRefs) {
          const adapter = config.runtimeAdapters.get(channelRef);
          const applyResult = await applyWithAdapter({
            adapter,
            state: runtimeState,
            channelRef,
            revokeCredentialRefs
          });
          appliedCount += 1;
          const receipt = receiptFromApplyResult({
            state,
            channelRef,
            applyResult,
            now: config.nowFn()
          });
          await postReceipt(receipt);
          receiptCount += 1;
          receipts.push({
            nodeRef: receipt.nodeRef,
            channelRef: receipt.channelRef,
            generation: receipt.generation,
            status: receipt.status,
            redacted: true
          });
        }
      }

      return {
        ok: true,
        dryRun: false,
        applyEnabled: true,
        desiredStateCount: desiredStates.length,
        appliedCount,
        materialCount,
        receiptCount,
        receipts,
        redacted: true
      };
    }
  };
}

function optionalEnvText(env, name) {
  return text(env[name]);
}

function optionalEnvTextFile(env, name) {
  const path = optionalEnvText(env, name);
  if (!path) {
    return "";
  }
  return text(readFileSync(path, "utf8"));
}

function parseEnvCsv(env, name, fallback = []) {
  const raw = optionalEnvText(env, name);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

export function createProductionRuntimeAdaptersFromEnv(env = process.env) {
  const materialStore = createProductionMaterialStoreFromEnv(env);
  return createProductionRuntimeAdaptersFromEnvWithStore(env, materialStore);
}

function createProductionMaterialStoreFromEnv(env = process.env) {
  const materialPath = optionalEnvText(env, "EDGE_CREDENTIAL_MATERIAL_PATH")
    || optionalEnvText(env, "EDGE_AGENT_MATERIAL_PATH");
  if (!materialPath) {
    return null;
  }
  return createFileBackedEdgeCredentialMaterialStore({ filePath: materialPath });
}

function createProductionRuntimeAdaptersFromEnvWithStore(env = process.env, materialStore = null) {
  if (!materialStore) {
    return {};
  }
  const resolveCredentialMaterial = (credentialRef) => materialStore.resolveCredentialMaterial(credentialRef);
  const adapters = {};
  const channelRefs = parseEnvCsv(env, "EDGE_AGENT_CHANNEL_REFS");
  for (const channelRef of channelRefs) {
    if (channelRef.includes("vless")) {
      adapters[channelRef] = {
        runtime: "xray-vless-reality",
        ...createXrayVlessRealityHostRuntimeAdapter({
          activeConfigPath: env.EDGE_XRAY_ACTIVE_CONFIG_PATH,
          candidateConfigPath: env.EDGE_XRAY_CANDIDATE_CONFIG_PATH,
          backupDir: env.EDGE_XRAY_BACKUP_DIR,
          serviceName: optionalEnvText(env, "EDGE_XRAY_SERVICE_NAME") || "xray-vless-reality.service",
          xrayBinary: optionalEnvText(env, "EDGE_XRAY_BINARY") || "xray",
          listener: {
            name: channelRef,
            port: env.EDGE_XRAY_VLESS_PORT || 8443,
            listen: optionalEnvText(env, "EDGE_XRAY_VLESS_LISTEN") || "0.0.0.0",
            flow: optionalEnvText(env, "EDGE_XRAY_VLESS_FLOW") || "xtls-rprx-vision",
            dest: env.EDGE_XRAY_VLESS_DEST,
            serverNames: parseEnvCsv(env, "EDGE_XRAY_VLESS_SERVER_NAMES", []),
            privateKey: env.EDGE_XRAY_VLESS_REALITY_PRIVATE_KEY,
            shortIds: parseEnvCsv(env, "EDGE_XRAY_VLESS_SHORT_IDS", []),
            xver: env.EDGE_XRAY_VLESS_XVER,
            usageStats: {
              statsServer: optionalEnvText(env, "EDGE_XRAY_RUNTIME_STATS_SERVER")
            },
            validationAttempts: env.EDGE_XRAY_LISTENER_VALIDATION_ATTEMPTS,
            validationRetryDelayMs: env.EDGE_XRAY_LISTENER_VALIDATION_RETRY_DELAY_MS
          },
          resolveCredentialMaterial
        })
      };
    } else if (channelRef.includes("hy2") || channelRef.includes("hysteria")) {
      adapters[channelRef] = {
        runtime: "hysteria2",
        ...createHysteria2HostRuntimeAdapter({
          activeConfigPath: env.EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH,
          candidateConfigPath: env.EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH,
          backupDir: env.EDGE_HYSTERIA2_BACKUP_DIR,
          serviceName: optionalEnvText(env, "EDGE_HYSTERIA2_SERVICE_NAME") || "hysteria2.service",
          hysteriaBinary: optionalEnvText(env, "EDGE_HYSTERIA2_BINARY") || "hysteria",
          listener: {
            listen: optionalEnvText(env, "EDGE_HYSTERIA2_LISTEN") || ":10443",
            certificate: env.EDGE_HYSTERIA2_CERTIFICATE_PATH,
            privateKey: env.EDGE_HYSTERIA2_PRIVATE_KEY_PATH,
            trafficStatsListen: optionalEnvText(env, "EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN"),
            trafficStatsSecret: env.EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET,
            bandwidth: {
              up: optionalEnvText(env, "EDGE_HYSTERIA2_BANDWIDTH_UP"),
              down: optionalEnvText(env, "EDGE_HYSTERIA2_BANDWIDTH_DOWN")
            },
            ignoreClientBandwidth: optionalEnvText(env, "EDGE_HYSTERIA2_IGNORE_CLIENT_BANDWIDTH"),
            congestion: {
              type: optionalEnvText(env, "EDGE_HYSTERIA2_CONGESTION_TYPE"),
              bbrProfile: optionalEnvText(env, "EDGE_HYSTERIA2_CONGESTION_BBR_PROFILE")
            },
            quic: {
              initStreamReceiveWindow: env.EDGE_HYSTERIA2_QUIC_INIT_STREAM_RECEIVE_WINDOW,
              maxStreamReceiveWindow: env.EDGE_HYSTERIA2_QUIC_MAX_STREAM_RECEIVE_WINDOW,
              initConnReceiveWindow: env.EDGE_HYSTERIA2_QUIC_INIT_CONN_RECEIVE_WINDOW,
              maxConnReceiveWindow: env.EDGE_HYSTERIA2_QUIC_MAX_CONN_RECEIVE_WINDOW,
              maxIdleTimeout: optionalEnvText(env, "EDGE_HYSTERIA2_QUIC_MAX_IDLE_TIMEOUT"),
              maxIncomingStreams: env.EDGE_HYSTERIA2_QUIC_MAX_INCOMING_STREAMS,
              disablePathMTUDiscovery: optionalEnvText(env, "EDGE_HYSTERIA2_QUIC_DISABLE_PATH_MTU_DISCOVERY")
            },
            udpIdleTimeout: optionalEnvText(env, "EDGE_HYSTERIA2_UDP_IDLE_TIMEOUT"),
            sniff: {
              enabled: bool(env.EDGE_HYSTERIA2_SNIFF_ENABLED),
              rewriteDomain: bool(env.EDGE_HYSTERIA2_SNIFF_REWRITE_DOMAIN),
              tcpPorts: optionalEnvText(env, "EDGE_HYSTERIA2_SNIFF_TCP_PORTS"),
              udpPorts: optionalEnvText(env, "EDGE_HYSTERIA2_SNIFF_UDP_PORTS")
            },
            outbound: {
              mode: env.EDGE_HYSTERIA2_OUTBOUND_MODE
            },
            validationAttempts: env.EDGE_HYSTERIA2_LISTENER_VALIDATION_ATTEMPTS,
            validationRetryDelayMs: env.EDGE_HYSTERIA2_LISTENER_VALIDATION_RETRY_DELAY_MS
          },
          resolveCredentialMaterial
        })
      };
    } else if (channelRef.includes("tuic")) {
      adapters[channelRef] = {
        runtime: "mihomo-tuic",
        ...createMihomoTuicHostRuntimeAdapter({
          activeConfigPath: env.EDGE_MIHOMO_ACTIVE_CONFIG_PATH,
          candidateConfigPath: env.EDGE_MIHOMO_CANDIDATE_CONFIG_PATH,
          backupDir: env.EDGE_MIHOMO_BACKUP_DIR,
          serviceName: optionalEnvText(env, "EDGE_MIHOMO_SERVICE_NAME") || "mihomo-tuic.service",
          mihomoBinary: optionalEnvText(env, "EDGE_MIHOMO_BINARY") || "mihomo",
          listener: {
            name: channelRef,
            port: env.EDGE_MIHOMO_TUIC_PORT || 443,
            listen: optionalEnvText(env, "EDGE_MIHOMO_TUIC_LISTEN") || "0.0.0.0",
            certificate: env.EDGE_MIHOMO_TUIC_CERTIFICATE_PATH,
            privateKey: env.EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH,
            congestionController: optionalEnvText(env, "EDGE_MIHOMO_TUIC_CONGESTION_CONTROLLER") || "bbr",
            alpn: parseEnvCsv(env, "EDGE_MIHOMO_TUIC_ALPN", ["h3"]),
            usageController: {
              controllerUrl: optionalEnvText(env, "EDGE_MIHOMO_RUNTIME_CONTROLLER_URL"),
              secret: optionalEnvText(env, "EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET")
                || optionalEnvTextFile(env, "EDGE_MIHOMO_RUNTIME_CONTROLLER_SECRET_FILE")
            }
          },
          resolveCredentialMaterial
        })
      };
    }
  }
  return adapters;
}

export function createProductionEdgeAgentRunnerFromEnv(env = process.env) {
  const materialStore = createProductionMaterialStoreFromEnv(env);
  return createProductionEdgeAgentRunner({
    baseUrl: env.EDGE_AGENT_BASE_URL,
    tokenFile: env.EDGE_AGENT_TOKEN_FILE,
    token: env.EDGE_AGENT_TOKEN,
    nodeRef: env.EDGE_AGENT_NODE_REF,
    channelRefs: env.EDGE_AGENT_CHANNEL_REFS,
    applyEnabled: env.EDGE_AGENT_APPLY_ENABLED,
    dryRun: env.EDGE_AGENT_DRY_RUN,
    edgeCredentialRefs: env.EDGE_AGENT_EDGE_CREDENTIAL_REFS,
    runtimeAdapters: createProductionRuntimeAdaptersFromEnvWithStore(env, materialStore),
    materialStore
  });
}

function safeErrorCode(error) {
  const code = text(error?.code || error?.message || "edge_agent_failed");
  return SAFE_REF_PATTERN.test(code) ? code : "edge_agent_failed";
}

export async function main(env = process.env) {
  const runner = createProductionEdgeAgentRunnerFromEnv(env);
  return runner.runOnce();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await main();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: safeErrorCode(error),
      redacted: true
    }));
    process.exitCode = 1;
  }
}
