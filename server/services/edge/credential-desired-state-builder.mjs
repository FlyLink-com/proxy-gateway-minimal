const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTIVE_ORDER_STATUSES = new Set(["delivered", "issued"]);

function edgeError(code, message) {
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
    throw edgeError("validation_error", `${field} is required`);
  }
  return normalized;
}

function optionalSafeRef(value) {
  const normalized = text(value);
  return normalized && SAFE_REF_PATTERN.test(normalized) ? normalized : "";
}

function normalizeIso(value, field) {
  const normalized = text(value);
  const time = Date.parse(normalized);
  if (!normalized || Number.isNaN(time)) {
    throw edgeError("validation_error", `${field} is invalid`);
  }
  return new Date(time).toISOString();
}

function orderExpiry(order) {
  return text(order?.validUntil || order?.expiresAt);
}

function isActiveOrder(order, nowMs) {
  if (!ACTIVE_ORDER_STATUSES.has(text(order?.status))) {
    return false;
  }
  const expiresAt = orderExpiry(order);
  const expiresMs = Date.parse(expiresAt);
  return Boolean(expiresAt) && !Number.isNaN(expiresMs) && expiresMs > nowMs;
}

function desiredCredentialForOrder(order) {
  return {
    credentialRef: requiredSafeRef(order.edgeCredentialRef || order.credentialRef, "edge credential ref"),
    orderRef: requiredSafeRef(order.id || order.requestRef, "order ref"),
    userRef: requiredSafeRef(order.portalUserRef || order.userRef, "user ref"),
    expiresAt: normalizeIso(orderExpiry(order), "expiresAt"),
    materialDigest: requiredSafeRef(order.edgeMaterialDigest || order.materialDigest, "edge credential material digest")
  };
}

function normalizeCurrentCredential(credential) {
  return {
    credentialRef: requiredSafeRef(credential?.credentialRef, "current credential ref"),
    materialDigest: requiredSafeRef(credential?.materialDigest, "current credential material digest")
  };
}

export function buildEdgeCredentialDesiredState({
  channelRef,
  desiredStateRef,
  now = new Date(),
  orders = [],
  currentCredentials = [],
  runtime = "mihomo-tuic",
  activationSurface = "explicit-restart"
} = {}) {
  const safeChannelRef = requiredSafeRef(channelRef, "channelRef");
  const safeDesiredStateRef = requiredSafeRef(desiredStateRef, "desiredStateRef");
  const nowIso = normalizeIso(now, "now");
  const nowMs = Date.parse(nowIso);
  if (!Array.isArray(orders)) {
    throw edgeError("validation_error", "orders must be an array");
  }
  if (!Array.isArray(currentCredentials)) {
    throw edgeError("validation_error", "currentCredentials must be an array");
  }

  const desiredCredentials = orders
    .filter((order) => text(order?.edgeChannelRef || order?.channelRef || safeChannelRef) === safeChannelRef)
    .filter((order) => isActiveOrder(order, nowMs))
    .map(desiredCredentialForOrder)
    .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef));

  const normalizedCurrentCredentials = currentCredentials
    .map(normalizeCurrentCredential)
    .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef));

  const includedRefs = new Set(desiredCredentials.map((credential) => credential.orderRef));
  const channelOrderCount = orders.filter((order) =>
    text(order?.edgeChannelRef || order?.channelRef || safeChannelRef) === safeChannelRef
  ).length;

  return {
    type: "gccgw_edge_credential_desired_state",
    channelRef: safeChannelRef,
    runtime: optionalSafeRef(runtime) || "mihomo-tuic",
    activationSurface: optionalSafeRef(activationSurface) || "explicit-restart",
    desiredStateRef: safeDesiredStateRef,
    generatedAt: nowIso,
    desiredCredentials,
    currentCredentials: normalizedCurrentCredentials,
    summary: {
      orderCount: channelOrderCount,
      includedCount: desiredCredentials.length,
      skippedCount: Math.max(0, channelOrderCount - includedRefs.size),
      currentCount: normalizedCurrentCredentials.length
    },
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}
