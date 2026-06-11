import { createHash, timingSafeEqual } from "node:crypto";
import {
  buildRedactedDesiredStateSummary,
  buildSafeAgentErrorPayload,
  validateDataPlaneApplyReceipt,
  validateDataPlaneDesiredState
} from "./data-plane-agent-protocol.mjs";

const DEFAULT_LEASE_TTL_MS = 120000;
const SAFE_NODE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function agentServiceError(code, statusCode = 400) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredRef(value, field) {
  const normalized = text(value);
  if (!SAFE_NODE_REF_PATTERN.test(normalized)) {
    throw agentServiceError("validation_error");
  }
  return normalized;
}

function optionalRef(value) {
  const normalized = text(value);
  return normalized ? requiredRef(normalized, "ref") : "";
}

function uniqueRefs(values = []) {
  const refs = [];
  const seen = new Set();
  for (const value of values) {
    const ref = optionalRef(value);
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

function bearerToken(authorization = "") {
  const raw = text(authorization);
  return raw.startsWith("Bearer ") ? raw.slice("Bearer ".length).trim() : "";
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeSha256Hash(value) {
  const normalized = text(value).replace(/^sha256:/i, "").toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function timingSafeHashEqual(left, right) {
  const leftHash = normalizeSha256Hash(left);
  const rightHash = normalizeSha256Hash(right);
  if (!leftHash || !rightHash) {
    return false;
  }
  const leftBuffer = Buffer.from(leftHash, "hex");
  const rightBuffer = Buffer.from(rightHash, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeAgentNodeConfig(config = {}) {
  const nodeRef = requiredRef(config.nodeRef, "nodeRef");
  const channelRefs = uniqueRefs(config.channelRefs);
  if (channelRefs.length === 0) {
    throw agentServiceError("agent_node_config_invalid", 500);
  }
  const tokenSha256 = normalizeSha256Hash(config.tokenSha256 || config.tokenHash);
  if (!tokenSha256) {
    throw agentServiceError("agent_node_config_invalid", 500);
  }
  return {
    nodeRef,
    channelRefs,
    tokenSha256
  };
}

function latestDesiredStatesForNode({ controlStore, node }) {
  const byDesiredStateRef = new Map();
  for (const channelRef of node.channelRefs) {
    const latest = controlStore.getLatestEdgeDesiredStateForChannel?.(channelRef);
    if (!latest || latest.nodeRef !== node.nodeRef) {
      continue;
    }
    const normalized = validateDataPlaneDesiredState({
      type: "gccgw_data_plane_desired_state",
      nodeRef: latest.nodeRef,
      generation: latest.generation,
      channelRefs: latest.channelRefs,
      edgeCredentialRefs: latest.edgeCredentialRefs,
      materialDigests: latest.materialDigests,
      validUntil: latest.validUntil
    }, {
      expectedNodeRef: node.nodeRef,
      allowedChannelRefs: node.channelRefs
    });
    byDesiredStateRef.set(latest.desiredStateRef, {
      ...normalized,
      desiredStateRef: latest.desiredStateRef,
      summary: buildRedactedDesiredStateSummary(normalized)
    });
  }
  return [...byDesiredStateRef.values()].sort((a, b) => a.generation.localeCompare(b.generation));
}

function stableJson(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function mapReceiptStatusToStore(receipt) {
  if (receipt.status === "unchanged") {
    return {
      status: "applied",
      reasonCode: receipt.reasonCode || "generation_unchanged"
    };
  }
  if (receipt.status === "stale" || receipt.status === "rejected") {
    return {
      status: "drift_detected",
      reasonCode: receipt.reasonCode || receipt.status
    };
  }
  return {
    status: receipt.status,
    reasonCode: receipt.reasonCode
  };
}

export function hashDataPlaneAgentToken(token) {
  return `sha256:${sha256(token)}`;
}

export function createDataPlaneAgentService({
  controlStore,
  nodes = [],
  nowFn = () => new Date(),
  idFactory,
  leaseTtlMs = DEFAULT_LEASE_TTL_MS
} = {}) {
  if (!controlStore) {
    throw agentServiceError("control_store_required", 500);
  }
  const nodeConfigs = nodes.map(normalizeAgentNodeConfig);
  const nodesByRef = new Map(nodeConfigs.map((node) => [node.nodeRef, node]));

  function authenticate({ authorization } = {}) {
    const token = bearerToken(authorization);
    if (!token) {
      throw agentServiceError("unauthorized", 401);
    }
    const suppliedHash = sha256(token);
    const node = nodeConfigs.find((candidate) => timingSafeHashEqual(suppliedHash, candidate.tokenSha256));
    if (!node) {
      throw agentServiceError("unauthorized", 401);
    }
    return {
      nodeRef: node.nodeRef,
      channelRefs: [...node.channelRefs]
    };
  }

  function getDesiredState(identity) {
    const node = nodesByRef.get(requiredRef(identity?.nodeRef, "nodeRef"));
    if (!node) {
      throw agentServiceError("node_scope_mismatch", 403);
    }
    const desiredStates = latestDesiredStatesForNode({ controlStore, node });
    return {
      type: "gccgw_data_plane_agent_desired_state_response",
      nodeRef: node.nodeRef,
      channelRefs: [...node.channelRefs],
      desiredStates,
      summaries: desiredStates.map((state) => state.summary),
      redacted: true
    };
  }

  function recordReceipt(identity, input = {}) {
    const node = nodesByRef.get(requiredRef(identity?.nodeRef, "nodeRef"));
    if (!node) {
      throw agentServiceError("node_scope_mismatch", 403);
    }
    const channelRef = requiredRef(input.channelRef, "channelRef");
    if (!node.channelRefs.includes(channelRef)) {
      throw agentServiceError("channel_scope_mismatch", 403);
    }
    const latest = controlStore.getLatestEdgeDesiredStateForChannel?.(channelRef);
    if (!latest || latest.nodeRef !== node.nodeRef) {
      throw agentServiceError("desired_state_not_found", 404);
    }
    const receipt = validateDataPlaneApplyReceipt(input, {
      expectedNodeRef: node.nodeRef,
      expectedGeneration: latest.generation,
      allowedChannelRefs: node.channelRefs
    });
    const now = nowFn();
    const receiptDigest = `sha256:${sha256(stableJson(receipt)).slice(0, 32)}`;
    const storeStatus = mapReceiptStatusToStore(receipt);
    const id = idFactory?.("edge_apply_receipt", receipt)
      || `edge_apply_receipt_${sha256(`${node.nodeRef}:${channelRef}:${latest.generation}`).slice(0, 16)}`;
    const stored = controlStore.recordEdgeApplyReceipt({
      id,
      channelRef,
      nodeRef: node.nodeRef,
      generation: latest.generation,
      desiredStateRef: latest.desiredStateRef,
      receiptDigest,
      status: storeStatus.status,
      actionCounts: {
        add: receipt.status === "applied" ? receipt.credentialCount : 0,
        revoke: 0,
        rotate: 0,
        unchanged: receipt.status === "unchanged" ? receipt.credentialCount : 0
      },
      configTestOk: receipt.configTest,
      serviceActive: receipt.serviceActive,
      listenerPresent: receipt.listenerPresent,
      credentialCount: receipt.credentialCount,
      reasonCode: storeStatus.reasonCode,
      appliedAt: receipt.appliedAt,
      createdAt: now.toISOString()
    });
    return {
      type: "gccgw_data_plane_receipt_response",
      nodeRef: node.nodeRef,
      channelRef,
      generation: latest.generation,
      receiptId: stored.id,
      status: stored.status,
      redacted: true
    };
  }

  function recordLease(identity, input = {}) {
    const node = nodesByRef.get(requiredRef(identity?.nodeRef, "nodeRef"));
    if (!node) {
      throw agentServiceError("node_scope_mismatch", 403);
    }
    const channelRef = requiredRef(input.channelRef, "channelRef");
    if (!node.channelRefs.includes(channelRef)) {
      throw agentServiceError("channel_scope_mismatch", 403);
    }
    const now = nowFn();
    const latest = controlStore.getLatestEdgeDesiredStateForChannel?.(channelRef);
    const leaseRef = optionalRef(input.leaseRef)
      || `edge_agent_lease_${sha256(`${node.nodeRef}:${channelRef}`).slice(0, 16)}`;
    const lease = controlStore.acquireEdgeAgentLease({
      leaseRef,
      agentRef: optionalRef(input.agentRef) || node.nodeRef,
      nodeRef: node.nodeRef,
      channelRef,
      desiredStateRef: latest?.nodeRef === node.nodeRef ? latest.desiredStateRef : undefined,
      status: "active",
      acquiredAt: now.toISOString(),
      renewedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + leaseTtlMs).toISOString()
    });
    return {
      type: "gccgw_data_plane_lease_response",
      nodeRef: node.nodeRef,
      channelRef,
      leaseRef: lease.leaseRef,
      status: lease.status,
      expiresAt: lease.expiresAt,
      redacted: true
    };
  }

  return {
    authenticate,
    getDesiredState,
    recordReceipt,
    recordLease,
    safeErrorPayload: buildSafeAgentErrorPayload
  };
}
