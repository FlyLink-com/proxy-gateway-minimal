const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function preflightError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredSafeRef(value, field) {
  const normalized = text(value);
  if (!normalized || !SAFE_REF_PATTERN.test(normalized)) {
    throw preflightError("validation_error", `${field} is required`);
  }
  return normalized;
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function blocker(code, scope = {}) {
  return {
    code,
    ...scope
  };
}

function materialDigestForCredential(desiredState, edgeCredentialRef) {
  for (const digest of desiredState.materialDigests || []) {
    if (digest && typeof digest === "object" && digest.edgeCredentialRef === edgeCredentialRef) {
      return text(digest.digest);
    }
  }
  const stringDigests = (desiredState.materialDigests || []).filter((digest) => typeof digest === "string");
  if (stringDigests.length === 1 && desiredState.edgeCredentialRefs?.length === 1) {
    return text(stringDigests[0]);
  }
  return "";
}

function stateSummaryFor({
  desiredState,
  credentialMaterialStore
}) {
  const channelRef = desiredState.channelRefs?.[0] || "";
  const credentialRefs = uniqueSorted(desiredState.edgeCredentialRefs || []);
  let materialReadyCount = 0;
  let missingMaterialCount = 0;
  let digestMismatchCount = 0;
  const blockers = [];

  for (const edgeCredentialRef of credentialRefs) {
    const expectedDigest = materialDigestForCredential(desiredState, edgeCredentialRef);
    const summary = credentialMaterialStore.getCredentialMaterialSummary(edgeCredentialRef);
    if (!summary) {
      missingMaterialCount += 1;
      blockers.push(blocker("material_not_found", { channelRef, edgeCredentialRef }));
      continue;
    }
    if (summary.materialDigest !== expectedDigest) {
      digestMismatchCount += 1;
      blockers.push(blocker("material_digest_mismatch", { channelRef, edgeCredentialRef }));
      continue;
    }
    materialReadyCount += 1;
  }

  return {
    channelRef,
    desiredStateRef: desiredState.desiredStateRef,
    generation: desiredState.generation,
    validUntil: desiredState.validUntil,
    edgeCredentialCount: credentialRefs.length,
    materialDigestCount: (desiredState.materialDigests || []).length,
    materialReadyCount,
    missingMaterialCount,
    digestMismatchCount,
    blockers
  };
}

function assertStore(shape, methodName, label) {
  if (!shape || typeof shape[methodName] !== "function") {
    throw preflightError(`${label}_unavailable`, `${label} is unavailable`);
  }
}

export function buildProtectedMaterialHandoffPreflight({
  controlStore,
  credentialMaterialStore,
  nodeRef
} = {}) {
  assertStore(controlStore, "getEdgeRegisteredNode", "control_store");
  assertStore(controlStore, "getLatestEdgeDesiredStateForChannel", "control_store");
  assertStore(credentialMaterialStore, "getCredentialMaterialSummary", "material_store");

  const safeNodeRef = requiredSafeRef(nodeRef, "nodeRef");
  const node = controlStore.getEdgeRegisteredNode(safeNodeRef);
  if (!node) {
    return {
      type: "gccgw_protected_material_handoff_preflight",
      nodeRef: safeNodeRef,
      status: "blocked",
      ready: false,
      redacted: true,
      channelRefs: [],
      desiredStates: [],
      totals: {
        desiredStateCount: 0,
        edgeCredentialCount: 0,
        materialReadyCount: 0,
        missingMaterialCount: 0,
        digestMismatchCount: 0
      },
      blockers: [blocker("node_not_registered")]
    };
  }

  const channelRefs = uniqueSorted(node.channelRefs || []);
  const topBlockers = [];
  if (node.status !== "active") {
    topBlockers.push(blocker("node_not_active"));
  }

  const desiredStates = channelRefs
    .map((channelRef) => controlStore.getLatestEdgeDesiredStateForChannel(channelRef, {
      nodeRef: node.nodeRef,
      channelRefs
    }))
    .filter(Boolean)
    .map((desiredState) => stateSummaryFor({
      desiredState,
      credentialMaterialStore
    }));

  const stateBlockers = desiredStates.flatMap((state) => state.blockers);
  const totals = desiredStates.reduce((acc, state) => ({
    desiredStateCount: acc.desiredStateCount + 1,
    edgeCredentialCount: acc.edgeCredentialCount + state.edgeCredentialCount,
    materialReadyCount: acc.materialReadyCount + state.materialReadyCount,
    missingMaterialCount: acc.missingMaterialCount + state.missingMaterialCount,
    digestMismatchCount: acc.digestMismatchCount + state.digestMismatchCount
  }), {
    desiredStateCount: 0,
    edgeCredentialCount: 0,
    materialReadyCount: 0,
    missingMaterialCount: 0,
    digestMismatchCount: 0
  });

  const allBlockers = [...topBlockers, ...stateBlockers];
  const ready = allBlockers.length === 0;

  return {
    type: "gccgw_protected_material_handoff_preflight",
    nodeRef: node.nodeRef,
    status: ready ? (desiredStates.length > 0 ? "ready" : "idle") : "blocked",
    ready,
    redacted: true,
    channelRefs,
    desiredStates: desiredStates.map(({ blockers, ...state }) => state),
    totals,
    blockers: allBlockers
  };
}
