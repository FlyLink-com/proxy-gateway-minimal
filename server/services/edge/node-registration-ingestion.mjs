import { isSafeWireguardPlanRef } from "../node-image-first-boot-packet.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SENSITIVE_TEXT_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;
const ANCHOR_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

// Shared identity-anchor normalization for every registration entry: an
// absent anchor stays absent (see the anchor-presence policy at the
// write boundary below); a present anchor must be a sha256 fingerprint
// and is normalized to lowercase. Anything else is rejected here, at the
// single point all registration records are built through, so a malformed
// anchor can never be persisted into an identity binding.
export function normalizeRegistrationAnchorFingerprint(value, field) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return "";
  if (!ANCHOR_FINGERPRINT_PATTERN.test(normalized)) {
    throw nodeRegistrationError("validation_error", `${field} must be a sha256 fingerprint`);
  }
  return normalized;
}

// The WireGuard planRef is judged by the dedicated rule shared with the
// first-boot packet builder: a plan name, never an address or a range.
function safePlanRef(value) {
  const normalized = text(value);
  if (!normalized) {
    throw nodeRegistrationError("validation_error", "wireguard.planRef is required");
  }
  if (!isSafeWireguardPlanRef(normalized)) {
    throw nodeRegistrationError(
      "validation_error",
      "wireguard.planRef must be a WireGuard plan reference, not an address or range"
    );
  }
  return normalized;
}

function nodeRegistrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

// Export the exact E1 reference predicate so source-only consumers can
// validate candidate bindings without constructing an approved record.
// Keep safeRef below on this same predicate to prevent rule drift.
export function isSafeNodeRegistrationReference(value) {
  const normalized = text(value);
  return Boolean(normalized) &&
    SAFE_REF_PATTERN.test(normalized) &&
    !SENSITIVE_TEXT_PATTERN.test(normalized);
}

function safeRef(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw nodeRegistrationError("validation_error", `${field} is required`);
  }
  if (!isSafeNodeRegistrationReference(normalized)) {
    throw nodeRegistrationError("validation_error", "node registration packet contains unsafe reference material");
  }
  return normalized;
}

function safeRefList(values, field) {
  if (!Array.isArray(values)) {
    throw nodeRegistrationError("validation_error", `${field} must be an array`);
  }
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = safeRef(value, field);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  if (result.length === 0) {
    throw nodeRegistrationError("validation_error", `${field} must contain at least one item`);
  }
  return result;
}

function assertNoUnsafeObjectValues(value) {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) assertNoUnsafeObjectValues(child);
    return;
  }
  for (const child of Object.values(value)) {
    if (typeof child === "string" && SENSITIVE_TEXT_PATTERN.test(child)) {
      throw nodeRegistrationError("validation_error", "node registration packet contains unsafe reference material");
    }
    assertNoUnsafeObjectValues(child);
  }
}

function requiredGate(value) {
  return value === true;
}

function requireApprovedFirstBootPacket(firstBootPacket) {
  assertNoUnsafeObjectValues(firstBootPacket);
  if (firstBootPacket?.mode !== "node-image-first-boot-packet") {
    throw nodeRegistrationError("validation_error", "node registration requires a node-image first-boot packet");
  }
  if (firstBootPacket?.packet?.readyForFirstBootApproval !== true) {
    throw nodeRegistrationError("precondition_failed", "node first-boot packet is not ready for approval");
  }
  if (firstBootPacket?.packet?.firstBootApplyAllowed !== true) {
    throw nodeRegistrationError("approval_required", "node first-boot apply approval is required");
  }
}

export function buildEdgeNodeRegistrationRecordFromFirstBootPacket(firstBootPacket = {}, options = {}) {
  requireApprovedFirstBootPacket(firstBootPacket);

  const node = firstBootPacket.node ?? {};
  const image = firstBootPacket.image ?? {};
  const controlPlane = firstBootPacket.controlPlane ?? {};
  const runtime = firstBootPacket.runtime ?? {};
  const receiptGate = firstBootPacket.receiptGate ?? {};
  const approval = firstBootPacket.approval ?? {};
  const wireguard = firstBootPacket.wireguard ?? {};

  const requiredBooleans = [
    ["controlPlane.nodeRegistrationDryRunPassed", controlPlane.nodeRegistrationDryRunPassed],
    ["controlPlane.privateAgentRoutePlanned", controlPlane.privateAgentRoutePlanned],
    ["controlPlane.protectedMaterialInjectPlanned", controlPlane.protectedMaterialInjectPlanned],
    ["controlPlane.agentNodeIdentityPlanned", controlPlane.agentNodeIdentityPlanned],
    ["runtime.servicesDisabledInImage", runtime.servicesDisabledInImage],
    ["runtime.xrayConfigTestPlanned", runtime.xrayConfigTestPlanned],
    ["runtime.hysteria2ConfigTestPlanned", runtime.hysteria2ConfigTestPlanned],
    ["runtime.tuicConfigTestPlanned", runtime.tuicConfigTestPlanned],
    ["runtime.statsLoopbackOnly", runtime.statsLoopbackOnly],
    ["receiptGate.desiredStatePullRequired", receiptGate.desiredStatePullRequired],
    ["receiptGate.materialPullRequired", receiptGate.materialPullRequired],
    ["receiptGate.appliedReceiptRequired", receiptGate.appliedReceiptRequired],
    ["receiptGate.renderWithholdsUntilReceipt", receiptGate.renderWithholdsUntilReceipt],
    ["approval.exactApprovalReceived", approval.exactApprovalReceived],
    ["approval.firstBootApplyApproved", approval.firstBootApplyApproved],
    ["wireguard.tunnelAddressAssigned", wireguard.tunnelAddressAssigned],
    ["wireguard.hostKeyGenerationPlanned", wireguard.hostKeyGenerationPlanned],
    ["wireguard.peerPublicKeyExchangePlanned", wireguard.peerPublicKeyExchangePlanned],
    ["wireguard.toolsPinnedInImageManifest", wireguard.toolsPinnedInImageManifest]
  ];
  const missing = requiredBooleans
    .filter(([, value]) => !requiredGate(value))
    .map(([field]) => field);
  if (missing.length > 0) {
    throw nodeRegistrationError("precondition_failed", "node first-boot packet is missing required gates");
  }

  const registeredAt = text(options.registeredAt || firstBootPacket.generatedAt) || new Date().toISOString();
  // Identity anchors are supplied by the registration caller (never by the
  // packet) and, when present, become part of the persisted record metadata
  // so the registration binding can be compared exactly on replay. Both
  // registration entries build records through this function, so anchor
  // format validation lives here and nowhere else.
  const wireguardPublicKeyFingerprint = normalizeRegistrationAnchorFingerprint(
    options.wireguardPublicKeyFingerprint,
    "wireguardPublicKeyFingerprint"
  );
  const agentAuthFingerprint = normalizeRegistrationAnchorFingerprint(
    options.agentAuthFingerprint,
    "agentAuthFingerprint"
  );
  return {
    nodeRef: safeRef(node.nodeRef, "node.nodeRef"),
    providerRef: safeRef(node.providerRef, "node.providerRef"),
    regionRef: safeRef(node.regionRef, "node.regionRef"),
    roleRef: safeRef(node.roleRef, "node.roleRef"),
    channelRefs: safeRefList(node.channelRefs, "node.channelRefs"),
    imageManifestRef: safeRef(image.imageManifestRef, "image.imageManifestRef"),
    releaseRef: safeRef(image.releaseRef, "image.releaseRef"),
    lifecycle: safeRef(options.lifecycle || "registered", "lifecycle"),
    status: safeRef(options.status || "active", "status"),
    firstBootPacketRef: safeRef(options.firstBootPacketRef || `first_boot_${node.nodeRef}`, "firstBootPacketRef"),
    registeredAt,
    updatedAt: text(options.updatedAt || registeredAt) || registeredAt,
    metadata: {
      source: "node-image-first-boot-packet",
      receiptGateRequired: true,
      imageSafeConfirmed: image.noSecretImageConfirmed === true,
      artifactHashRecorded: image.artifactSha256Recorded === true,
      wireguardPlanRef: safePlanRef(wireguard.planRef),
      ...(wireguardPublicKeyFingerprint ? { wireguardPublicKeyFingerprint } : {}),
      ...(agentAuthFingerprint ? { agentAuthFingerprint } : {})
    }
  };
}

// The registration write boundary is default-off (E1 review, D1): every
// function in this module that writes a registered-node record requires
// the gate below. Only the exact string "true" opens it: the comparison
// is a strict identity check with no type coercion, so boolean true, a
// String object, "TRUE", " true", "1", "yes", an unset value, or any
// other value refuses before any write. The gate is a second line of
// defense, not an authorization: opening it in production still requires
// its own approval.
//
// Boundary note: the gate lives at this service layer (this module and
// the registration executor). The control store's record methods are
// ungated persistence primitives; registration writes must go through
// this layer, and any future registration caller must pass this gate
// first. Gating here must not be described as gating of the store layer.
//
// Every registration write in this layer is insert-only and bound by the
// shared identity binding below: once a nodeRef has a stored binding, no
// entry in this layer can replace it, extend it, or strip parts of it
// (including the identity anchors). An identical replay returns the
// stored record; anything else is a registration_conflict. Key, plan, or
// identity rotation requires a separate supersede/retirement flow.
//
// Anchor-presence policy, enforced rather than merely documented: the
// registration executor always requires both identity anchors, and
// node-vultr-jp-01 registers ONLY through the executor — the ingestion
// function below refuses that nodeRef before any store interaction, with
// or without anchors. This module's ingestion function also accepts an
// anchor-less FIRST registration for other nodes, retained only for
// legacy nodes whose registration predates identity anchors; an
// anchor-less record can never satisfy an anchored binding afterwards
// (any anchored replay conflicts).
const EXECUTOR_ONLY_NODE_REF = "node-vultr-jp-01";
export const REGISTRATION_EXECUTION_ENV_KEY = "EDGE_NODE_REGISTRATION_EXECUTION_ENABLED";

export function assertRegistrationExecutionEnabled(env) {
  const source = env === undefined || env === null ? process.env : env;
  if (source[REGISTRATION_EXECUTION_ENV_KEY] !== "true") {
    throw nodeRegistrationError(
      "registration_execution_disabled",
      "edge node registration execution is disabled (EDGE_NODE_REGISTRATION_EXECUTION_ENABLED is not exactly \"true\")"
    );
  }
}

function sortedRefs(values) {
  return [...(Array.isArray(values) ? values : [])].sort();
}

// The identity binding of a registered-node record: the eleven fields
// every registration entry compares before it may treat a stored record
// as its own. Shared by the ingestion write path and the registration
// executor so no entry can apply a weaker comparison.
export function registrationBindingOf(record) {
  const metadata = record?.metadata ?? {};
  return {
    nodeRef: record?.nodeRef,
    providerRef: record?.providerRef,
    regionRef: record?.regionRef,
    roleRef: record?.roleRef,
    channelRefs: sortedRefs(record?.channelRefs),
    imageManifestRef: record?.imageManifestRef,
    releaseRef: record?.releaseRef,
    firstBootPacketRef: record?.firstBootPacketRef,
    wireguardPlanRef: metadata.wireguardPlanRef ?? null,
    wireguardPublicKeyFingerprint: metadata.wireguardPublicKeyFingerprint ?? null,
    agentAuthFingerprint: metadata.agentAuthFingerprint ?? null
  };
}

export function registrationBindingsEqual(left, right) {
  const a = registrationBindingOf(left);
  const b = registrationBindingOf(right);
  return (
    a.nodeRef === b.nodeRef &&
    a.providerRef === b.providerRef &&
    a.regionRef === b.regionRef &&
    a.roleRef === b.roleRef &&
    a.imageManifestRef === b.imageManifestRef &&
    a.releaseRef === b.releaseRef &&
    a.firstBootPacketRef === b.firstBootPacketRef &&
    a.wireguardPlanRef === b.wireguardPlanRef &&
    a.wireguardPublicKeyFingerprint === b.wireguardPublicKeyFingerprint &&
    a.agentAuthFingerprint === b.agentAuthFingerprint &&
    a.channelRefs.length === b.channelRefs.length &&
    a.channelRefs.every((value, index) => value === b.channelRefs[index])
  );
}

export function ingestEdgeNodeRegistrationFromFirstBootPacket({
  controlStore,
  firstBootPacket,
  env,
  ...options
} = {}) {
  assertRegistrationExecutionEnabled(env);
  if (text(firstBootPacket?.node?.nodeRef) === EXECUTOR_ONLY_NODE_REF) {
    throw nodeRegistrationError(
      "registration_path_forbidden",
      "node-vultr-jp-01 must register through the registration executor; the ingestion path refuses it"
    );
  }
  if (
    !controlStore ||
    typeof controlStore.getEdgeRegisteredNode !== "function" ||
    typeof controlStore.insertEdgeRegisteredNodeIfAbsent !== "function"
  ) {
    throw nodeRegistrationError(
      "validation_error",
      "controlStore with getEdgeRegisteredNode and insertEdgeRegisteredNodeIfAbsent is required"
    );
  }
  const candidate = buildEdgeNodeRegistrationRecordFromFirstBootPacket(firstBootPacket, options);
  const existing = controlStore.getEdgeRegisteredNode(candidate.nodeRef);
  if (existing) {
    if (!registrationBindingsEqual(existing, candidate)) {
      throw nodeRegistrationError(
        "registration_conflict",
        "node is already registered with a different binding; registration ingestion never overwrites an identity binding"
      );
    }
    return existing;
  }
  const attempt = controlStore.insertEdgeRegisteredNodeIfAbsent(candidate);
  const stored = attempt?.record ?? null;
  if (!stored) {
    throw nodeRegistrationError(
      "verification_failed",
      "registration record could not be read back after the insert attempt"
    );
  }
  if (!registrationBindingsEqual(stored, candidate)) {
    throw nodeRegistrationError(
      "registration_conflict",
      "a different registration for this node was recorded concurrently; registration ingestion never overwrites an identity binding"
    );
  }
  return stored;
}
