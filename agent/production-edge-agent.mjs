import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createEdgeAgent } from "./edge-agent.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../server/services/edge/credential-material-store.mjs";
import { createHysteria2HostRuntimeAdapter } from "../server/services/edge/hysteria2-runtime-adapter.mjs";
import { createMihomoTuicHostRuntimeAdapter } from "../server/services/edge/mihomo-tuic-host-runtime-adapter.mjs";
import { createXrayVlessRealityHostRuntimeAdapter } from "../server/services/edge/xray-vless-reality-runtime-adapter.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./
];

function runnerError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  if (value === true) return true;
  if (value === false) return false;
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function requiredText(value, code) {
  const normalized = text(value);
  if (!normalized) {
    throw runnerError(code);
  }
  return normalized;
}

function safeRef(value, code = "validation_error") {
  const normalized = requiredText(value, code);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw runnerError(code);
  }
  return normalized;
}

function parseCsv(value) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(value, code) {
  const raw = text(value);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw runnerError(code);
    }
    return parsed;
  } catch (error) {
    if (error?.code === code) {
      throw error;
    }
    throw runnerError(code);
  }
}

function readTokenFromFile(filePath) {
  const normalized = text(filePath);
  if (!normalized) {
    return "";
  }
  try {
    return text(readFileSync(normalized, "utf8"));
  } catch {
    throw runnerError("agent_token_file_unreadable");
  }
}

function stripIpv6Brackets(hostname) {
  return text(hostname).replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function isPrivateIpv4(hostname) {
  const normalized = stripIpv6Brackets(hostname);
  if (PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const match = normalized.match(/^172\.(\d{1,3})\./);
  if (!match) {
    return false;
  }
  const secondOctet = Number.parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isPrivateAgentHost(hostname) {
  const normalized = stripIpv6Brackets(hostname);
  return normalized === "localhost"
    || normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || isPrivateIpv4(normalized);
}

export function normalizePrivateAgentBaseUrl(value) {
  const raw = requiredText(value, "base_url_required").replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw runnerError("base_url_invalid");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw runnerError("base_url_invalid");
  }
  if (!isPrivateAgentHost(parsed.hostname)) {
    throw runnerError("private_base_url_required");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function resolveAdapter(runtimeAdapters, channelRef) {
  if (runtimeAdapters instanceof Map) {
    return runtimeAdapters.get(channelRef);
  }
  return runtimeAdapters?.[channelRef];
}

function assertMaterialStore(materialStore) {
  if (
    !materialStore
    || typeof materialStore.resolveCredentialMaterial !== "function"
    || typeof materialStore.getCredentialMaterialSummary !== "function"
  ) {
    throw runnerError("material_store_required");
  }
}

function assertRuntimeAdapters(runtimeAdapters, channelRefs) {
  for (const channelRef of channelRefs) {
    const adapter = resolveAdapter(runtimeAdapters, channelRef);
    if (!adapter || typeof adapter.applyCredentialReconciliation !== "function") {
      throw runnerError("runtime_adapter_missing");
    }
  }
}

function normalizeRunnerConfig(env = {}) {
  const baseUrl = normalizePrivateAgentBaseUrl(env.EDGE_AGENT_BASE_URL || env.EDGE_DATA_PLANE_AGENT_BASE_URL);
  const token = requiredText(
    env.EDGE_DATA_PLANE_AGENT_TOKEN
      || readTokenFromFile(env.EDGE_DATA_PLANE_AGENT_TOKEN_FILE || env.EDGE_AGENT_TOKEN_FILE),
    "agent_token_required"
  );
  const nodeRef = safeRef(env.EDGE_AGENT_NODE_REF || env.EDGE_DATA_PLANE_AGENT_NODE_REF, "node_ref_required");
  const agentRef = text(env.EDGE_AGENT_AGENT_REF || env.EDGE_DATA_PLANE_AGENT_REF) || nodeRef;
  const applyEnabled = bool(env.EDGE_AGENT_APPLY_ENABLED);
  const channelRefs = parseCsv(env.EDGE_AGENT_CHANNEL_REFS || env.EDGE_DATA_PLANE_AGENT_CHANNEL_REFS)
    .map((value) => safeRef(value, "channel_ref_invalid"));
  if (channelRefs.length === 0) {
    throw runnerError("channel_refs_required");
  }

  return {
    baseUrl,
    token,
    nodeRef,
    agentRef: safeRef(agentRef, "agent_ref_invalid"),
    applyEnabled,
    channelRefs
  };
}

export function createProductionRuntimeAdapters({
  channelConfigs = [],
  materialStore,
  adapterFactories = {},
  commandRunner,
  now
} = {}) {
  assertMaterialStore(materialStore);
  const factories = {
    "hysteria2": createHysteria2HostRuntimeAdapter,
    "hy2": createHysteria2HostRuntimeAdapter,
    "mihomo-tuic": createMihomoTuicHostRuntimeAdapter,
    "tuic": createMihomoTuicHostRuntimeAdapter,
    "xray-vless-reality": createXrayVlessRealityHostRuntimeAdapter,
    "vless": createXrayVlessRealityHostRuntimeAdapter,
    ...adapterFactories
  };
  const adapters = new Map();

  for (const config of channelConfigs) {
    const channelRef = safeRef(config?.channelRef, "channel_ref_invalid");
    const runtime = text(config?.runtime || config?.protocol).toLowerCase();
    const factory = factories[runtime];
    if (typeof factory !== "function") {
      throw runnerError("runtime_adapter_factory_missing");
    }
    const adapterConfig = {
      ...config,
      resolveCredentialMaterial: (credentialRef) =>
        materialStore.resolveCredentialMaterial(credentialRef),
      ...(commandRunner ? { commandRunner } : {}),
      ...(now ? { now } : {})
    };
    adapters.set(channelRef, factory(adapterConfig));
  }

  return adapters;
}

export function createProductionEdgeAgentRunner({
  env = process.env,
  httpClient,
  materialStore,
  runtimeAdapters = {},
  logger = console,
  nowFn = () => new Date()
} = {}) {
  const config = normalizeRunnerConfig(env);
  assertRuntimeAdapters(runtimeAdapters, config.channelRefs);
  if (config.applyEnabled) {
    assertMaterialStore(materialStore);
  }

  const agent = createEdgeAgent({
    allowApply: config.applyEnabled,
    httpClient,
    materialStore,
    runtimeAdapters,
    logger,
    nowFn
  });

  return {
    redactedConfig: {
      baseUrl: config.baseUrl,
      nodeRef: config.nodeRef,
      agentRef: config.agentRef,
      applyEnabled: config.applyEnabled,
      channelRefs: [...config.channelRefs],
      redacted: true
    },

    runOnce() {
      return agent.runOnce({
        baseUrl: config.baseUrl,
        token: config.token,
        nodeRef: config.nodeRef,
        agentRef: config.agentRef,
        dryRun: !config.applyEnabled
      });
    }
  };
}

export function createProductionEdgeAgentRunnerFromEnv({
  env = process.env,
  httpClient,
  commandRunner,
  logger = console,
  nowFn = () => new Date()
} = {}) {
  const materialFilePath = text(env.EDGE_AGENT_MATERIAL_FILE || env.EDGE_CREDENTIAL_MATERIAL_FILE);
  const materialStore = materialFilePath
    ? createFileBackedEdgeCredentialMaterialStore({ filePath: materialFilePath })
    : null;
  const channelConfigs = parseJsonArray(
    env.EDGE_AGENT_CHANNEL_CONFIGS_JSON || env.EDGE_RUNTIME_CHANNEL_CONFIGS_JSON,
    "channel_configs_invalid"
  );
  const runtimeAdapters = materialStore
    ? createProductionRuntimeAdapters({
      channelConfigs,
      materialStore,
      commandRunner,
      now: nowFn
    })
    : {};

  return createProductionEdgeAgentRunner({
    env,
    httpClient,
    materialStore,
    runtimeAdapters,
    logger,
    nowFn
  });
}

function safeErrorCode(error) {
  const code = text(error?.code || error?.message || "production_edge_agent_failed");
  return SAFE_REF_PATTERN.test(code) ? code : "production_edge_agent_failed";
}

async function main() {
  const runner = createProductionEdgeAgentRunnerFromEnv();
  const report = await runner.runOnce();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${safeErrorCode(error)}\n`);
    process.exitCode = 1;
  });
}
