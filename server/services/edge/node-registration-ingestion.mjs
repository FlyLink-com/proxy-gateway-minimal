const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_:/-]{0,127}$/;
const SENSITIVE_TEXT_PATTERN =
  /https?:|token=|secret|credential|password|private|customer|@|\/sub\/clash\.yaml|(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+\.[a-z]{2,}/i;

function nodeRegistrationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw nodeRegistrationError("validation_error", `${field} is required`);
  }
  if (!SAFE_REF_PATTERN.test(normalized) || SENSITIVE_TEXT_PATTERN.test(normalized)) {
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
    ["approval.firstBootApplyApproved", approval.firstBootApplyApproved]
  ];
  const missing = requiredBooleans
    .filter(([, value]) => !requiredGate(value))
    .map(([field]) => field);
  if (missing.length > 0) {
    throw nodeRegistrationError("precondition_failed", "node first-boot packet is missing required gates");
  }

  const registeredAt = text(options.registeredAt || firstBootPacket.generatedAt) || new Date().toISOString();
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
      artifactHashRecorded: image.artifactSha256Recorded === true
    }
  };
}

export function ingestEdgeNodeRegistrationFromFirstBootPacket({
  controlStore,
  firstBootPacket,
  ...options
} = {}) {
  if (!controlStore || typeof controlStore.upsertEdgeRegisteredNode !== "function") {
    throw nodeRegistrationError("validation_error", "controlStore with upsertEdgeRegisteredNode is required");
  }
  return controlStore.upsertEdgeRegisteredNode(
    buildEdgeNodeRegistrationRecordFromFirstBootPacket(firstBootPacket, options)
  );
}
