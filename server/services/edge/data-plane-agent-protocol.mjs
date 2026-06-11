const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const DIGEST_PATTERN = /^[A-Za-z0-9._:+/-]{6,256}$/;
const DESIRED_STATE_TYPE = "gccgw_data_plane_desired_state";
const APPLY_RECEIPT_TYPE = "gccgw_data_plane_apply_receipt";
const RECEIPT_STATUSES = new Set(["applied", "failed", "unchanged", "stale", "rejected"]);
const FORBIDDEN_KEY_NORMALIZED = new Set([
  "authorization",
  "cookie",
  "customerdata",
  "env",
  "password",
  "privatekey",
  "rawconfig",
  "rawenv",
  "rawlog",
  "secret",
  "sqlite",
  "sqliterow",
  "subscriptionurl",
  "token",
  "uuid"
]);

function protocolError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeKey(key) {
  return text(key).replace(/[-_\s]/g, "").toLowerCase();
}

function safeRef(value, field) {
  const normalized = text(value);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw protocolError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function safeRefs(values, field) {
  if (!Array.isArray(values) || values.length === 0) {
    throw protocolError("validation_error", `${field} must be a non-empty array`);
  }
  const refs = values.map((value, index) => safeRef(value, `${field}[${index}]`));
  return [...new Set(refs)].sort((a, b) => a.localeCompare(b));
}

function safeDigest(value, field) {
  const normalized = text(value);
  if (!DIGEST_PATTERN.test(normalized)) {
    throw protocolError("validation_error", `${field} is invalid`);
  }
  return normalized;
}

function normalizeIso(value, field) {
  const normalized = text(value);
  const ms = Date.parse(normalized);
  if (!normalized || Number.isNaN(ms)) {
    throw protocolError("validation_error", `${field} is invalid`);
  }
  return new Date(ms).toISOString();
}

function normalizeBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw protocolError("validation_error", `${field} must be boolean`);
  }
  return value;
}

function normalizeNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw protocolError("validation_error", `${field} must be a non-negative integer`);
  }
  return value;
}

function assertScope(value, expected, code) {
  if (expected && value !== expected) {
    throw protocolError(code);
  }
}

function assertAllowedChannels(channelRefs, allowedChannelRefs = []) {
  if (!Array.isArray(allowedChannelRefs) || allowedChannelRefs.length === 0) {
    return;
  }
  const allowed = new Set(allowedChannelRefs.map((ref) => safeRef(ref, "allowedChannelRef")));
  const unknown = channelRefs.find((channelRef) => !allowed.has(channelRef));
  if (unknown) {
    throw protocolError("channel_scope_mismatch");
  }
}

function assertNoUnsafeFields(value, path = "payload") {
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUnsafeFields(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_NORMALIZED.has(normalizeKey(key))) {
      throw protocolError("unsafe_agent_payload", `${path}.${key} is forbidden`);
    }
    assertNoUnsafeFields(child, `${path}.${key}`);
  }
}

function normalizeMaterialDigests(value = []) {
  if (!Array.isArray(value)) {
    throw protocolError("validation_error", "materialDigests must be an array");
  }
  return value.map((item, index) => {
    if (typeof item === "string") {
      return safeDigest(item, `materialDigests[${index}]`);
    }
    if (!item || typeof item !== "object") {
      throw protocolError("validation_error", `materialDigests[${index}] is invalid`);
    }
    return {
      channelRef: safeRef(item.channelRef, `materialDigests[${index}].channelRef`),
      edgeCredentialRef: safeRef(item.edgeCredentialRef, `materialDigests[${index}].edgeCredentialRef`),
      digest: safeDigest(item.digest, `materialDigests[${index}].digest`)
    };
  });
}

export function validateDataPlaneDesiredState(input = {}, {
  expectedNodeRef,
  allowedChannelRefs = []
} = {}) {
  assertNoUnsafeFields(input);
  if (input?.type && input.type !== DESIRED_STATE_TYPE) {
    throw protocolError("validation_error", "desired-state type is invalid");
  }

  const nodeRef = safeRef(input.nodeRef, "nodeRef");
  assertScope(nodeRef, expectedNodeRef, "node_scope_mismatch");
  const channelRefs = safeRefs(input.channelRefs, "channelRefs");
  assertAllowedChannels(channelRefs, allowedChannelRefs);
  const edgeCredentialRefs = safeRefs(input.edgeCredentialRefs, "edgeCredentialRefs");
  const materialDigests = normalizeMaterialDigests(input.materialDigests);

  return {
    type: DESIRED_STATE_TYPE,
    nodeRef,
    generation: safeRef(input.generation, "generation"),
    channelRefs,
    edgeCredentialRefs,
    materialDigests,
    validUntil: normalizeIso(input.validUntil, "validUntil"),
    redacted: true
  };
}

export function buildRedactedDesiredStateSummary(desiredState = {}) {
  const normalized = validateDataPlaneDesiredState(desiredState);
  return {
    type: "gccgw_data_plane_desired_state_summary",
    nodeRef: normalized.nodeRef,
    generation: normalized.generation,
    channelCount: normalized.channelRefs.length,
    edgeCredentialCount: normalized.edgeCredentialRefs.length,
    digestCount: normalized.materialDigests.length,
    validUntil: normalized.validUntil,
    redacted: true
  };
}

export function validateDataPlaneApplyReceipt(input = {}, {
  expectedNodeRef,
  expectedGeneration,
  allowedChannelRefs = []
} = {}) {
  assertNoUnsafeFields(input);
  if (input?.type && input.type !== APPLY_RECEIPT_TYPE) {
    throw protocolError("validation_error", "apply-receipt type is invalid");
  }

  const nodeRef = safeRef(input.nodeRef, "nodeRef");
  assertScope(nodeRef, expectedNodeRef, "node_scope_mismatch");
  const generation = safeRef(input.generation, "generation");
  assertScope(generation, expectedGeneration, "generation_scope_mismatch");
  const channelRef = safeRef(input.channelRef, "channelRef");
  assertAllowedChannels([channelRef], allowedChannelRefs);
  const status = text(input.status);
  if (!RECEIPT_STATUSES.has(status)) {
    throw protocolError("validation_error", "receipt status is invalid");
  }

  return {
    type: APPLY_RECEIPT_TYPE,
    nodeRef,
    generation,
    channelRef,
    status,
    configTest: normalizeBoolean(input.configTest, "configTest"),
    serviceActive: normalizeBoolean(input.serviceActive, "serviceActive"),
    listenerPresent: normalizeBoolean(input.listenerPresent, "listenerPresent"),
    credentialCount: normalizeNonNegativeInteger(input.credentialCount, "credentialCount"),
    appliedAt: normalizeIso(input.appliedAt, "appliedAt"),
    ...(text(input.reasonCode) ? { reasonCode: safeRef(input.reasonCode, "reasonCode") } : {}),
    materialDigests: normalizeMaterialDigests(input.materialDigests),
    redacted: true
  };
}

export function buildSafeAgentErrorPayload(error) {
  const code = safeRef(error?.code || "agent_protocol_error", "errorCode");
  return {
    error: code,
    message: code,
    redacted: true
  };
}
