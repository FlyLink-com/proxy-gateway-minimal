import { createHash, randomBytes, randomUUID } from "node:crypto";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function issuerError(code, message) {
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
    throw issuerError("validation_error", `${field} is required`);
  }
  return normalized;
}

function defaultPasswordFactory() {
  return randomBytes(24).toString("base64url");
}

function defaultUuidFactory() {
  return randomUUID();
}

function materialDigestFor(material) {
  const digest = createHash("sha256")
    .update(material.uuid)
    .update("\0")
    .update(material.password)
    .digest("hex");
  return `sha256:${digest}`;
}

export function createOrderEdgeCredentialIssuer({
  channelRef,
  materialStore,
  credentialRefFactory,
  uuidFactory = defaultUuidFactory,
  passwordFactory = defaultPasswordFactory
} = {}) {
  const safeChannelRef = requiredSafeRef(channelRef, "channelRef");
  if (!materialStore || typeof materialStore.putCredentialMaterial !== "function") {
    throw issuerError("validation_error", "materialStore is required");
  }

  return {
    ensureCredentialForOrder(order = {}) {
      const orderRef = requiredSafeRef(order.id || order.requestRef, "orderRef");
      const credentialRef = requiredSafeRef(
        typeof credentialRefFactory === "function"
          ? credentialRefFactory({ orderRef, order })
          : `edgecred_${orderRef}`,
        "credentialRef"
      );

      const existing = typeof materialStore.getCredentialMaterialSummary === "function"
        ? materialStore.getCredentialMaterialSummary(credentialRef)
        : null;
      if (existing) {
        const existingMaterial = typeof materialStore.resolveCredentialMaterial === "function"
          ? materialStore.resolveCredentialMaterial(existing.credentialRef)
          : null;
        return {
          edgeChannelRef: safeChannelRef,
          edgeCredentialRef: existing.credentialRef,
          edgeMaterialDigest: existing.materialDigest,
          ...(existingMaterial ? { edgeCredentialMaterial: existingMaterial } : {})
        };
      }

      const material = {
        uuid: text(uuidFactory({ orderRef, order })),
        password: text(passwordFactory({ orderRef, order }))
      };
      if (!material.uuid || !material.password) {
        throw issuerError("validation_error", "edge credential material is incomplete");
      }
      const materialDigest = materialDigestFor(material);
      const summary = materialStore.putCredentialMaterial({
        credentialRef,
        materialDigest,
        material
      });
      return {
        edgeChannelRef: safeChannelRef,
        edgeCredentialRef: summary.credentialRef,
        edgeMaterialDigest: summary.materialDigest,
        edgeCredentialMaterial: material
      };
    }
  };
}
