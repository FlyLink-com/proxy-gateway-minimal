import { createHash, timingSafeEqual } from "node:crypto";
import {
  buildDataPlaneCredentialScopeDigest,
  buildRedactedDesiredStateSummary,
  buildSafeAgentErrorPayload,
  validateDataPlaneApplyReceipt,
  validateDataPlaneDesiredState,
  validateDataPlaneMaterialRequest,
  validateDataPlaneMaterialResponse
} from "./data-plane-agent-protocol.mjs";

const DEFAULT_LEASE_TTL_MS = 120000;
const SAFE_NODE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const TOMBSTONE_CAPABILITIES = ["empty_desired_state", "tombstone_reconcile"];
const SCOPED_TOMBSTONE_CAPABILITY = "scoped_tombstone_lineage";

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
  const source = typeof values === "string" ? values.split(",") : values;
  for (const value of Array.isArray(source) ? source : []) {
    const ref = optionalRef(value);
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

function normalizeDesiredStateFilter(filter = {}) {
  return {
    edgeCredentialRefs: uniqueRefs(filter.edgeCredentialRefs),
    agentVersion: optionalRef(filter.agentVersion),
    capabilities: uniqueRefs(filter.capabilities)
  };
}

function supportsProtocolVersion(agentVersion, minimumMinor) {
  const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(agentVersion);
  if (!match) {
    return false;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= minimumMinor);
}

function supportsTombstoneProtocol(agentVersion) {
  return supportsProtocolVersion(agentVersion, 1);
}

function supportsScopedTombstoneProtocol(agentVersion) {
  return supportsProtocolVersion(agentVersion, 2);
}

function tombstoneCompatibility(filter = {}) {
  const normalized = normalizeDesiredStateFilter(filter);
  const supported = supportsTombstoneProtocol(normalized.agentVersion)
    && TOMBSTONE_CAPABILITIES.every((capability) => normalized.capabilities.includes(capability));
  const scopedTombstoneLineage = supported
    && supportsScopedTombstoneProtocol(normalized.agentVersion)
    && normalized.capabilities.includes(SCOPED_TOMBSTONE_CAPABILITY);
  return {
    agentVersion: normalized.agentVersion || null,
    tombstoneReconcile: supported,
    scopedTombstoneLineage,
    blockedDesiredStateCount: 0,
    redacted: true
  };
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

function digestValue(digest) {
  return typeof digest === "string" ? digest : digest?.digest;
}

function materialDigestsForCredentials(desiredState, selectedRefs) {
  const selected = new Set(selectedRefs);
  return (desiredState.materialDigests || []).filter((digest) => {
    if (digest && typeof digest === "object") {
      return selected.has(digest.edgeCredentialRef);
    }
    return desiredState.edgeCredentialRefs.length === 1
      && selected.has(desiredState.edgeCredentialRefs[0]);
  });
}

function channelRefsForScopedState(desiredState, materialDigests) {
  const channels = uniqueRefs(materialDigests
    .filter((digest) => digest && typeof digest === "object")
    .map((digest) => digest.channelRef));
  return channels.length > 0 ? channels : [...desiredState.channelRefs];
}

function buildScopedDesiredState(desiredState, selectedRefs) {
  const materialDigests = materialDigestsForCredentials(desiredState, selectedRefs);
  const seed = stableJson({
    sourceDesiredStateRef: desiredState.desiredStateRef,
    sourceGeneration: desiredState.generation,
    edgeCredentialRefs: selectedRefs,
    materialDigests
  });
  const fingerprint = sha256(seed).slice(0, 32);
  const scoped = {
    ...desiredState,
    desiredStateRef: `desired_scoped_${fingerprint}`,
    generation: `gen_scoped_${fingerprint}`,
    channelRefs: channelRefsForScopedState(desiredState, materialDigests),
    edgeCredentialRefs: selectedRefs,
    materialDigests
  };
  return {
    ...scoped,
    summary: buildRedactedDesiredStateSummary(scoped)
  };
}

function buildScopedTombstoneDesiredState(desiredState, credentialDigests) {
  const sortedDigests = [...new Set(credentialDigests)].sort((a, b) => a.localeCompare(b));
  const scopedTombstone = {
    sourceDesiredStateRef: desiredState.desiredStateRef,
    sourceGeneration: desiredState.generation,
    credentialDigests: sortedDigests
  };
  const fingerprint = sha256(stableJson({
    sourceDesiredStateRef: desiredState.desiredStateRef,
    sourceGeneration: desiredState.generation,
    channelRefs: desiredState.channelRefs,
    edgeCredentialRefs: desiredState.edgeCredentialRefs,
    materialDigests: desiredState.materialDigests,
    scopedTombstone
  })).slice(0, 32);
  const scoped = {
    ...desiredState,
    desiredStateRef: `desired_scoped_${fingerprint}`,
    generation: `gen_scoped_${fingerprint}`,
    scopedTombstone
  };
  return {
    ...scoped,
    summary: buildRedactedDesiredStateSummary(scoped)
  };
}

export function scopedDesiredStateFrom(desiredState, filter = {}, {
  resolveCredentialChannelRef
} = {}) {
  const { edgeCredentialRefs } = normalizeDesiredStateFilter(filter);
  if (edgeCredentialRefs.length === 0) {
    return desiredState;
  }
  const selectedRefs = desiredState.edgeCredentialRefs.filter((ref) => edgeCredentialRefs.includes(ref));
  if (typeof resolveCredentialChannelRef !== "function") {
    if (selectedRefs.length > 0) {
      return buildScopedDesiredState(desiredState, selectedRefs);
    }
    return desiredState.edgeCredentialRefs.length === 0 ? desiredState : null;
  }
  if (desiredState.channelRefs.length !== 1) {
    return selectedRefs.length > 0 ? buildScopedDesiredState(desiredState, selectedRefs) : null;
  }
  const channelRef = desiredState.channelRefs[0];
  const activeRefSet = new Set(desiredState.edgeCredentialRefs);
  const scopedRefs = edgeCredentialRefs
    .filter((edgeCredentialRef) => (
      !activeRefSet.has(edgeCredentialRef)
      && resolveCredentialChannelRef(edgeCredentialRef) === channelRef
    ))
    .sort((a, b) => a.localeCompare(b));
  if (scopedRefs.length > 0) {
    return buildScopedTombstoneDesiredState(
      desiredState,
      scopedRefs.map(buildDataPlaneCredentialScopeDigest)
    );
  }
  return selectedRefs.length > 0 ? buildScopedDesiredState(desiredState, selectedRefs) : null;
}

function latestDesiredStatesForNode({ controlStore, node, filter = {} }) {
  const byDesiredStateRef = new Map();
  for (const channelRef of node.channelRefs) {
    const latest = controlStore.getLatestEdgeDesiredStateForChannel?.(channelRef, {
      nodeRef: node.nodeRef,
      channelRefs: node.channelRefs
    });
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
    const desiredState = {
      ...normalized,
      desiredStateRef: latest.desiredStateRef,
      summary: buildRedactedDesiredStateSummary(normalized)
    };
    const scoped = scopedDesiredStateFrom(desiredState, filter, {
      resolveCredentialChannelRef: (edgeCredentialRef) => (
        controlStore.getEdgeCredentialChannelRef?.(edgeCredentialRef)
        ?? controlStore.getPortalEdgeCredentialChannelRef?.(edgeCredentialRef)
        ?? null
      )
    });
    if (!scoped) {
      continue;
    }
    byDesiredStateRef.set(scoped.desiredStateRef, scoped);
  }
  return [...byDesiredStateRef.values()].sort((a, b) => a.generation.localeCompare(b.generation));
}

function materialDigestForCredential(desiredState, edgeCredentialRef) {
  for (const digest of desiredState.materialDigests || []) {
    if (digest && typeof digest === "object" && digest.edgeCredentialRef === edgeCredentialRef) {
      return digest.digest;
    }
  }
  const stringDigests = (desiredState.materialDigests || []).filter((digest) => typeof digest === "string");
  if (stringDigests.length === 1 && desiredState.edgeCredentialRefs.length === 1) {
    return stringDigests[0];
  }
  return "";
}

function assertMaterialStoreAvailable(store) {
  if (
    !store
    || typeof store.getCredentialMaterialSummary !== "function"
    || typeof store.resolveCredentialMaterial !== "function"
  ) {
    throw agentServiceError("material_store_unavailable", 503);
  }
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

function assertReceiptMatchesDesiredState(receipt, desiredState) {
  const expectedDigests = (desiredState.materialDigests || [])
    .map(digestValue)
    .sort((a, b) => a.localeCompare(b));
  const receiptDigests = (receipt.materialDigests || [])
    .map(digestValue)
    .sort((a, b) => a.localeCompare(b));
  const exactDigestSet = expectedDigests.length === receiptDigests.length
    && new Set(expectedDigests).size === expectedDigests.length
    && new Set(receiptDigests).size === receiptDigests.length
    && expectedDigests.every((digest, index) => digest === receiptDigests[index]);
  const exactScopedTombstone = stableJson(receipt.scopedTombstone || null)
    === stableJson(desiredState.scopedTombstone || null);
  if (receipt.credentialCount !== desiredState.edgeCredentialRefs.length || !exactDigestSet || !exactScopedTombstone) {
    throw agentServiceError("desired_state_receipt_mismatch", 409);
  }
}

export function hashDataPlaneAgentToken(token) {
  return `sha256:${sha256(token)}`;
}

export function createDataPlaneAgentService({
  controlStore,
  nodes = [],
  nowFn = () => new Date(),
  idFactory,
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  credentialMaterialStore = null
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

  function getDesiredState(identity, filter = {}) {
    const node = nodesByRef.get(requiredRef(identity?.nodeRef, "nodeRef"));
    if (!node) {
      throw agentServiceError("node_scope_mismatch", 403);
    }
    const compatibility = tombstoneCompatibility(filter);
    const availableDesiredStates = latestDesiredStatesForNode({ controlStore, node, filter });
    const desiredStates = availableDesiredStates.filter((state) => {
      if (state.scopedTombstone) {
        return compatibility.scopedTombstoneLineage;
      }
      if (state.edgeCredentialRefs.length > 0) {
        return true;
      }
      return compatibility.tombstoneReconcile;
    });
    compatibility.blockedDesiredStateCount = availableDesiredStates.length - desiredStates.length;
    return {
      type: "gccgw_data_plane_agent_desired_state_response",
      nodeRef: node.nodeRef,
      channelRefs: [...node.channelRefs],
      desiredStates,
      summaries: desiredStates.map((state) => state.summary),
      compatibility,
      redacted: true
    };
  }

  function getCredentialMaterials(identity, input = {}) {
    assertMaterialStoreAvailable(credentialMaterialStore);
    const node = nodesByRef.get(requiredRef(identity?.nodeRef, "nodeRef"));
    if (!node) {
      throw agentServiceError("node_scope_mismatch", 403);
    }
    const request = validateDataPlaneMaterialRequest(input, {
      expectedNodeRef: node.nodeRef
    });
    const desiredState = [
      ...latestDesiredStatesForNode({ controlStore, node }),
      ...latestDesiredStatesForNode({
        controlStore,
        node,
        filter: { edgeCredentialRefs: request.edgeCredentialRefs }
      })
    ]
      .find((candidate) => candidate.desiredStateRef === request.desiredStateRef);
    if (!desiredState) {
      throw agentServiceError("desired_state_not_found", 404);
    }

    const records = [];
    for (const edgeCredentialRef of request.edgeCredentialRefs) {
      if (!desiredState.edgeCredentialRefs.includes(edgeCredentialRef)) {
        throw agentServiceError("edge_credential_scope_mismatch", 403);
      }
      const expectedDigest = materialDigestForCredential(desiredState, edgeCredentialRef);
      if (!expectedDigest) {
        throw agentServiceError("material_digest_not_found", 404);
      }
      const summary = credentialMaterialStore.getCredentialMaterialSummary(edgeCredentialRef);
      if (!summary) {
        throw agentServiceError("material_not_found", 404);
      }
      if (summary.materialDigest !== expectedDigest) {
        throw agentServiceError("material_digest_mismatch", 409);
      }
      if (request.mode === "summary") {
        records.push({
          edgeCredentialRef,
          materialDigest: summary.materialDigest,
          hasMaterial: summary.hasMaterial === true
        });
        continue;
      }
      const material = credentialMaterialStore.resolveCredentialMaterial(edgeCredentialRef);
      if (!material) {
        throw agentServiceError("material_not_found", 404);
      }
      records.push({
        edgeCredentialRef,
        materialDigest: summary.materialDigest,
        material
      });
    }

    return validateDataPlaneMaterialResponse({
      type: "gccgw_data_plane_material_response",
      nodeRef: node.nodeRef,
      desiredStateRef: desiredState.desiredStateRef,
      mode: request.mode,
      records,
      ...(request.mode === "summary" ? { redacted: true } : { sensitive: true })
    }, {
      expectedNodeRef: node.nodeRef,
      expectedDesiredStateRef: desiredState.desiredStateRef
    });
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
    const latest = latestDesiredStatesForNode({ controlStore, node })
      .find((candidate) => candidate.channelRefs.includes(channelRef));
    if (!latest) {
      throw agentServiceError("desired_state_not_found", 404);
    }
    const candidateReceipt = validateDataPlaneApplyReceipt(input, {
      expectedNodeRef: node.nodeRef,
      allowedChannelRefs: node.channelRefs
    });
    const requestedDesiredStateRef = optionalRef(candidateReceipt.desiredStateRef);
    let receiptDesiredState = latest;
    if (requestedDesiredStateRef.startsWith("desired_scoped_")) {
      let scoped;
      if (candidateReceipt.scopedTombstone) {
        const scopedIdentity = candidateReceipt.scopedTombstone;
        const exactSourceIdentity = scopedIdentity.sourceDesiredStateRef === latest.desiredStateRef
          && scopedIdentity.sourceGeneration === latest.generation;
        const activeScopeDigests = new Set(
          latest.edgeCredentialRefs.map(buildDataPlaneCredentialScopeDigest)
        );
        const exactLineage = scopedIdentity.credentialDigests.every((credentialDigest) => (
          (controlStore.getEdgeCredentialChannelRefByScopeDigest?.(credentialDigest)
            ?? controlStore.getPortalEdgeCredentialChannelRefByScopeDigest?.(credentialDigest)) === channelRef
          && !activeScopeDigests.has(credentialDigest)
        ));
        const exactChannel = latest.channelRefs.length === 1 && latest.channelRefs[0] === channelRef;
        if (!exactSourceIdentity || !exactLineage || !exactChannel) {
          throw agentServiceError("desired_state_not_found", 404);
        }
        scoped = buildScopedTombstoneDesiredState(latest, scopedIdentity.credentialDigests);
      } else {
        scoped = scopedDesiredStateFrom(latest, {
          edgeCredentialRefs: edgeCredentialRefsFromReceiptMaterialDigests(
            latest,
            candidateReceipt.materialDigests
          )
        });
      }
      if (!scoped || scoped.desiredStateRef !== requestedDesiredStateRef) {
        throw agentServiceError("desired_state_not_found", 404);
      }
      receiptDesiredState = scoped;
    }
    const receipt = validateDataPlaneApplyReceipt(candidateReceipt, {
      expectedNodeRef: node.nodeRef,
      expectedDesiredStateRef: requestedDesiredStateRef.startsWith("desired_scoped_")
        ? receiptDesiredState.desiredStateRef
        : undefined,
      expectedGeneration: receiptDesiredState.generation,
      allowedChannelRefs: node.channelRefs
    });
    assertReceiptMatchesDesiredState(receipt, receiptDesiredState);
    const now = nowFn();
    const receiptDigest = `sha256:${sha256(stableJson(receipt)).slice(0, 32)}`;
    const storeStatus = mapReceiptStatusToStore(receipt);
    const id = idFactory?.("edge_apply_receipt", receipt)
      || `edge_apply_receipt_${sha256(`${node.nodeRef}:${channelRef}:${receiptDesiredState.desiredStateRef}:${receiptDesiredState.generation}`).slice(0, 16)}`;
    const stored = controlStore.recordEdgeApplyReceipt({
      id,
      channelRef,
      nodeRef: node.nodeRef,
      generation: receiptDesiredState.generation,
      desiredStateRef: receiptDesiredState.desiredStateRef,
      receiptDigest,
      status: storeStatus.status,
      actionCounts: {
        add: receipt.status === "applied" ? receipt.credentialCount : 0,
        revoke: receipt.status === "applied"
          ? (receipt.scopedTombstone?.credentialDigests.length || 0)
          : 0,
        rotate: 0,
        unchanged: receipt.status === "unchanged" ? receipt.credentialCount : 0
      },
      configTestOk: receipt.configTest,
      serviceActive: receipt.serviceActive,
      listenerUdp443: receipt.listenerPresent,
      ...(receipt.backupRef ? { backupRef: receipt.backupRef } : {}),
      ...(receipt.rollbackRef ? { rollbackRef: receipt.rollbackRef } : {}),
      reasonCode: storeStatus.reasonCode,
      appliedAt: receipt.appliedAt,
      createdAt: now.toISOString()
    });
    return {
      type: "gccgw_data_plane_receipt_response",
      nodeRef: node.nodeRef,
      channelRef,
      generation: receiptDesiredState.generation,
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
    if (typeof controlStore.acquireEdgeAgentLease !== "function") {
      throw agentServiceError("control_store_contract_missing", 500);
    }
    const latest = controlStore.getLatestEdgeDesiredStateForChannel?.(channelRef, {
      nodeRef: node.nodeRef,
      channelRefs: node.channelRefs
    });
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
    getCredentialMaterials,
    recordReceipt,
    recordLease,
    safeErrorPayload: buildSafeAgentErrorPayload
  };
}

function edgeCredentialRefsFromReceiptMaterialDigests(desiredState, receiptMaterialDigests = []) {
  const receiptDigests = new Set((receiptMaterialDigests || []).map(digestValue).filter(Boolean));
  if (receiptDigests.size === 0) {
    return [];
  }
  return uniqueRefs((desiredState.materialDigests || [])
    .filter((digest) => receiptDigests.has(digestValue(digest)))
    .map((digest) => typeof digest === "object" ? digest.edgeCredentialRef : desiredState.edgeCredentialRefs[0]));
}
