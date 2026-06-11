import { pathToFileURL } from "node:url";
import { buildCredentialReconciliationApplyPlan } from "../server/services/edge/credential-reconciliation-gateway.mjs";

const DEFAULT_AGENT_ROUTE = "/api/internal/data-plane-agent";
const SAFE_REASON_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function text(value) {
  return String(value ?? "").trim();
}

function trimBaseUrl(value) {
  const normalized = text(value).replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("baseUrl is required");
  }
  return normalized;
}

function safeReasonCode(value, fallback = "adapter_failed") {
  const normalized = text(value);
  return SAFE_REASON_PATTERN.test(normalized) ? normalized : fallback;
}

function channelMaterialDigests(desiredState, channelRef) {
  return (Array.isArray(desiredState?.materialDigests) ? desiredState.materialDigests : [])
    .filter((item) => {
      if (typeof item === "string") {
        return true;
      }
      return text(item?.channelRef) === channelRef;
    });
}

function channelCredentialCount(desiredState, channelRef) {
  const channelDigests = channelMaterialDigests(desiredState, channelRef);
  if (channelDigests.length > 0) {
    return channelDigests.length;
  }
  return Array.isArray(desiredState?.edgeCredentialRefs) ? desiredState.edgeCredentialRefs.length : 0;
}

async function defaultHttpClient(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `http_${response.status}`);
    error.statusCode = response.status;
    error.payload = body;
    throw error;
  }
  return body;
}

function resolveAdapter(runtimeAdapters, channelRef) {
  if (runtimeAdapters instanceof Map) {
    return runtimeAdapters.get(channelRef);
  }
  return runtimeAdapters?.[channelRef];
}

function inferRuntimeForChannel(channelRef) {
  const ref = text(channelRef).toLowerCase();
  if (ref.includes("hy2") || ref.includes("hysteria2")) {
    return "hysteria2";
  }
  if (ref.includes("vless")) {
    return "xray-vless-reality";
  }
  if (ref.includes("tuic")) {
    return "mihomo-tuic";
  }
  return "mihomo-tuic";
}

function materialDigestValue(entry, fallback = "") {
  if (typeof entry === "string") {
    return text(entry);
  }
  return text(entry?.digest) || fallback;
}

function channelCredentialDigestEntries(desiredState, channelRef) {
  const objectDigests = channelMaterialDigests(desiredState, channelRef)
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      credentialRef: text(entry.edgeCredentialRef),
      materialDigest: materialDigestValue(entry)
    }))
    .filter((entry) => entry.credentialRef && entry.materialDigest);
  if (objectDigests.length > 0) {
    return objectDigests;
  }

  const refs = Array.isArray(desiredState?.edgeCredentialRefs) ? desiredState.edgeCredentialRefs : [];
  const digests = channelMaterialDigests(desiredState, channelRef);
  return refs.map((credentialRef, index) => ({
    credentialRef: text(credentialRef),
    materialDigest: materialDigestValue(digests[index])
  })).filter((entry) => entry.credentialRef && entry.materialDigest);
}

function resolveMaterial(materialStore, credentialRef) {
  if (!materialStore) {
    return null;
  }
  if (typeof materialStore === "function") {
    return materialStore(credentialRef);
  }
  if (typeof materialStore.resolveCredentialMaterial === "function") {
    return materialStore.resolveCredentialMaterial(credentialRef);
  }
  if (materialStore instanceof Map) {
    return materialStore.get(credentialRef) || null;
  }
  return materialStore?.[credentialRef] || null;
}

function materialSummary(materialStore, credentialRef) {
  if (!materialStore) {
    return null;
  }
  if (typeof materialStore.getCredentialMaterialSummary === "function") {
    return materialStore.getCredentialMaterialSummary(credentialRef);
  }
  return null;
}

function ensureChannelMaterialAvailable({ materialStore, desiredState, channelRef }) {
  const entries = channelCredentialDigestEntries(desiredState, channelRef);
  if (entries.length === 0) {
    return {
      ok: false,
      reasonCode: "material_missing",
      credentialCount: 0,
      materialDigests: channelMaterialDigests(desiredState, channelRef)
    };
  }

  const missing = entries.find((entry) => {
    const material = resolveMaterial(materialStore, entry.credentialRef);
    if (!material) {
      return true;
    }
    const summary = materialSummary(materialStore, entry.credentialRef);
    return summary?.materialDigest && summary.materialDigest !== entry.materialDigest;
  });
  if (missing) {
    return {
      ok: false,
      reasonCode: "material_missing",
      credentialCount: 0,
      materialDigests: entries.map((entry) => ({
        channelRef,
        edgeCredentialRef: entry.credentialRef,
        digest: entry.materialDigest
      }))
    };
  }

  return {
    ok: true,
    credentialCount: entries.length,
    entries
  };
}

function applyDesiredStateForChannel({ adapter, desiredState, channelRef, materialStore, runtimeResolver }) {
  if (!adapter) {
    return {
      status: "failed",
      configTest: false,
      serviceActive: false,
      listenerPresent: false,
      credentialCount: 0,
      reasonCode: "adapter_missing",
      materialDigests: channelMaterialDigests(desiredState, channelRef)
    };
  }
  const materialCheck = ensureChannelMaterialAvailable({ materialStore, desiredState, channelRef });
  if (!materialCheck.ok) {
    return {
      status: "failed",
      configTest: false,
      serviceActive: false,
      listenerPresent: false,
      credentialCount: materialCheck.credentialCount,
      reasonCode: materialCheck.reasonCode,
      materialDigests: materialCheck.materialDigests
    };
  }

  if (typeof adapter.applyDesiredState === "function") {
    return adapter.applyDesiredState({
      desiredState,
      channelRef,
      dryRun: false,
      resolveCredentialMaterial: (credentialRef) => resolveMaterial(materialStore, credentialRef)
    });
  }

  if (typeof adapter.applyCredentialReconciliation !== "function") {
    return {
      status: "failed",
      configTest: false,
      serviceActive: false,
      listenerPresent: false,
      credentialCount: 0,
      reasonCode: "adapter_invalid",
      materialDigests: channelMaterialDigests(desiredState, channelRef)
    };
  }

  const desiredCredentials = materialCheck.entries.map((entry) => ({
    credentialRef: entry.credentialRef,
    orderRef: entry.credentialRef,
    userRef: entry.credentialRef,
    expiresAt: desiredState.validUntil,
    materialDigest: entry.materialDigest
  }));
  const applyPlan = buildCredentialReconciliationApplyPlan({
    desiredState: {
      type: "gccgw_edge_credential_desired_state",
      channelRef,
      runtime: typeof runtimeResolver === "function"
        ? runtimeResolver(channelRef, desiredState)
        : inferRuntimeForChannel(channelRef),
      activationSurface: "explicit-restart",
      desiredStateRef: desiredState.desiredStateRef || desiredState.generation,
      generatedAt: new Date().toISOString(),
      desiredCredentials,
      currentCredentials: [],
      redacted: true
    },
    inputPath: "edge-agent:desired-state",
    executeProductionMutation: true,
    runtimeAdapter: adapter
  });

  const receipt = applyPlan.runtimeReceipt || {};
  return {
    status: applyPlan.ok ? "applied" : "failed",
    configTest: receipt.configTest?.ok === true || receipt.configTest === true,
    serviceActive: receipt.service?.active === true,
    listenerPresent: receipt.listener?.tcp === true || receipt.listener?.udp443 === true,
    credentialCount: materialCheck.credentialCount,
    reasonCode: applyPlan.ok ? "runtime_apply_ok" : "runtime_apply_failed",
    materialDigests: materialCheck.entries.map((entry) => ({
      channelRef,
      edgeCredentialRef: entry.credentialRef,
      digest: entry.materialDigest
    }))
  };
}

async function invokeDryRunAdapter(adapter, desiredState, channelRef, context) {
  if (!adapter) {
    return {
      status: "failed",
      configTest: false,
      serviceActive: false,
      listenerPresent: false,
      credentialCount: 0,
      reasonCode: "adapter_missing",
      materialDigests: channelMaterialDigests(desiredState, channelRef)
    };
  }
  if (typeof adapter === "function") {
    return adapter({ desiredState, channelRef, ...context });
  }
  if (typeof adapter.dryRunDesiredState === "function") {
    return adapter.dryRunDesiredState({ desiredState, channelRef, ...context });
  }
  if (typeof adapter.applyDesiredState === "function") {
    return adapter.applyDesiredState({ desiredState, channelRef, dryRun: true, ...context });
  }
  if (typeof adapter.applyCredentialReconciliation === "function") {
    const materialCheck = ensureChannelMaterialAvailable({
      materialStore: context?.materialStore,
      desiredState,
      channelRef
    });
    if (!materialCheck.ok) {
      return {
        status: "failed",
        configTest: false,
        serviceActive: false,
        listenerPresent: false,
        credentialCount: materialCheck.credentialCount,
        reasonCode: materialCheck.reasonCode,
        materialDigests: materialCheck.materialDigests
      };
    }
    return {
      status: "applied",
      configTest: false,
      serviceActive: false,
      listenerPresent: false,
      credentialCount: materialCheck.credentialCount,
      reasonCode: "dry_run_checked",
      materialDigests: materialCheck.entries.map((entry) => ({
        channelRef,
        edgeCredentialRef: entry.credentialRef,
        digest: entry.materialDigest
      }))
    };
  }
  return {
    status: "failed",
    configTest: false,
    serviceActive: false,
    listenerPresent: false,
    credentialCount: 0,
    reasonCode: "adapter_invalid",
    materialDigests: channelMaterialDigests(desiredState, channelRef)
  };
}

function normalizeAdapterResult(result = {}, desiredState, channelRef) {
  return {
    status: text(result.status) || "applied",
    configTest: result.configTest === true,
    serviceActive: result.serviceActive === true,
    listenerPresent: result.listenerPresent === true,
    credentialCount: Number.isInteger(result.credentialCount) && result.credentialCount >= 0
      ? result.credentialCount
      : channelCredentialCount(desiredState, channelRef),
    reasonCode: safeReasonCode(result.reasonCode, "dry_run_checked"),
    materialDigests: Array.isArray(result.materialDigests)
      ? result.materialDigests
      : channelMaterialDigests(desiredState, channelRef)
  };
}

export function createEdgeAgent({
  allowApply = false,
  httpClient = defaultHttpClient,
  materialStore = null,
  runtimeAdapters = {},
  runtimeResolver = inferRuntimeForChannel,
  logger = console,
  nowFn = () => new Date()
} = {}) {
  async function request({ baseUrl, token, path, method = "GET", body }) {
    const headers = {
      Authorization: `Bearer ${token}`
    };
    const options = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    return httpClient(`${trimBaseUrl(baseUrl)}${path}`, options);
  }

  async function postReceipt({ baseUrl, token, desiredState, channelRef, adapterResult }) {
    const appliedAt = nowFn();
    return request({
      baseUrl,
      token,
      path: `${DEFAULT_AGENT_ROUTE}/receipts`,
      method: "POST",
      body: {
        nodeRef: desiredState.nodeRef,
        generation: desiredState.generation,
        channelRef,
        status: adapterResult.status,
        configTest: adapterResult.configTest,
        serviceActive: adapterResult.serviceActive,
        listenerPresent: adapterResult.listenerPresent,
        credentialCount: adapterResult.credentialCount,
        appliedAt: (appliedAt instanceof Date ? appliedAt : new Date(appliedAt)).toISOString(),
        reasonCode: adapterResult.reasonCode,
        materialDigests: adapterResult.materialDigests
      }
    });
  }

  async function runOnce({ baseUrl, token, nodeRef, agentRef, dryRun = true } = {}) {
    const applyMode = dryRun === false;
    if (applyMode && allowApply !== true) {
      throw new Error("apply_disabled");
    }
    const desiredResponse = await request({
      baseUrl,
      token,
      path: `${DEFAULT_AGENT_ROUTE}/desired-state`
    });
    const desiredStates = Array.isArray(desiredResponse.desiredStates) ? desiredResponse.desiredStates : [];
    const receipts = [];
    const failures = [];

    for (const desiredState of desiredStates) {
      const channelRefs = Array.isArray(desiredState.channelRefs) ? desiredState.channelRefs : [];
      for (const channelRef of channelRefs) {
        await request({
          baseUrl,
          token,
          path: `${DEFAULT_AGENT_ROUTE}/lease`,
          method: "POST",
          body: {
            channelRef,
            agentRef: text(agentRef) || text(nodeRef) || desiredState.nodeRef
          }
        });

        let adapterResult;
        try {
          const adapter = resolveAdapter(runtimeAdapters, channelRef);
          const rawResult = applyMode
            ? await applyDesiredStateForChannel({
              adapter,
              desiredState,
              channelRef,
              materialStore,
              runtimeResolver
            })
            : await invokeDryRunAdapter(adapter, desiredState, channelRef, { nodeRef, agentRef, dryRun, materialStore });
          adapterResult = normalizeAdapterResult(rawResult, desiredState, channelRef);
        } catch (error) {
          logger?.warn?.("edge-agent adapter failed", { channelRef, reasonCode: "adapter_failed" });
          adapterResult = {
            status: "failed",
            configTest: false,
            serviceActive: false,
            listenerPresent: false,
            credentialCount: 0,
            reasonCode: "adapter_failed",
            materialDigests: channelMaterialDigests(desiredState, channelRef)
          };
        }

        const receipt = await postReceipt({
          baseUrl,
          token,
          desiredState,
          channelRef,
          adapterResult
        });
        receipts.push({
          channelRef,
          generation: desiredState.generation,
          status: receipt.status,
          redacted: true
        });
        if (receipt.status !== "applied") {
          failures.push({
            channelRef,
            generation: desiredState.generation,
            reasonCode: adapterResult.reasonCode,
            redacted: true
          });
        }
      }
    }

    return {
      ok: failures.length === 0,
      nodeRef: text(nodeRef) || desiredResponse.nodeRef,
      desiredStateCount: desiredStates.length,
      receiptCount: receipts.length,
      receipts,
      failures,
      dryRun: !applyMode,
      redacted: true
    };
  }

  return {
    runOnce
  };
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1]);
  }
  const agent = createEdgeAgent();
  const report = await agent.runOnce({
    baseUrl: args.get("--base-url"),
    token: process.env.EDGE_DATA_PLANE_AGENT_TOKEN,
    nodeRef: args.get("--node-ref"),
    agentRef: args.get("--agent-ref"),
    dryRun: true
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    process.stderr.write(`${safeReasonCode(error?.message, "edge_agent_failed")}\n`);
    process.exitCode = 1;
  });
}
