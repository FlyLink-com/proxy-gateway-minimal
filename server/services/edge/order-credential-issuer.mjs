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
  return randomBytes(32).toString("base64");
}

function defaultUuidFactory() {
  return randomUUID();
}

export function edgeCredentialRefForOrderChannel(orderRef, channelRef, { singleChannel = false } = {}) {
  const safeOrderRef = requiredSafeRef(orderRef, "orderRef");
  if (singleChannel) {
    return `edgecred_${safeOrderRef}`;
  }
  const safeChannelRef = requiredSafeRef(channelRef, "channelRef");
  const fullRef = `edgecred_${safeOrderRef}_${safeChannelRef}`;
  if (SAFE_REF_PATTERN.test(fullRef)) {
    return fullRef;
  }
  const channelDigest = createHash("sha256").update(safeChannelRef).digest("hex").slice(0, 16);
  return requiredSafeRef(`edgecred_${safeOrderRef}_${channelDigest}`, "credentialRef");
}

function materialDigestFor(material) {
  const digest = createHash("sha256")
    .update(material.uuid)
    .update("\0")
    .update(material.password)
    .digest("hex");
  return `sha256:${digest}`;
}

function normalizeChannelRefs({ channelRef, channelRefs } = {}) {
  const refs = Array.isArray(channelRefs) && channelRefs.length > 0
    ? channelRefs
    : [channelRef];
  const normalized = [];
  const seen = new Set();
  for (const ref of refs) {
    const safeRef = requiredSafeRef(ref, "channelRef");
    if (!seen.has(safeRef)) {
      seen.add(safeRef);
      normalized.push(safeRef);
    }
  }
  return normalized;
}

function forceRotateCredentialFor(order = {}) {
  return order.forceRotateCredential === true;
}

export function createOrderEdgeCredentialIssuer({
  channelRef,
  channelRefs,
  materialStore,
  credentialRefFactory,
  uuidFactory = defaultUuidFactory,
  passwordFactory = defaultPasswordFactory
} = {}) {
  const safeChannelRefs = normalizeChannelRefs({ channelRef, channelRefs });
  const [primaryChannelRef] = safeChannelRefs;
  if (!materialStore || typeof materialStore.putCredentialMaterial !== "function") {
    throw issuerError("validation_error", "materialStore is required");
  }

  function ensureCredentialForChannel(order = {}, channelRefForOrder, {
    singleChannelCredentialRef = safeChannelRefs.length === 1,
    forceRotateCredential = forceRotateCredentialFor(order),
    targetStore = materialStore
  } = {}) {
    const orderRef = requiredSafeRef(order.id || order.requestRef, "orderRef");
    const safeChannelRef = requiredSafeRef(channelRefForOrder, "channelRef");
    const credentialRef = requiredSafeRef(
      typeof credentialRefFactory === "function"
        ? credentialRefFactory({ orderRef, order, channelRef: safeChannelRef })
        : edgeCredentialRefForOrderChannel(orderRef, safeChannelRef, {
          singleChannel: singleChannelCredentialRef
        }),
      "credentialRef"
    );

    const existing = typeof targetStore.getCredentialMaterialSummary === "function"
      ? targetStore.getCredentialMaterialSummary(credentialRef)
      : null;
    if (existing && forceRotateCredential !== true) {
      const existingMaterial = typeof targetStore.resolveCredentialMaterial === "function"
        ? targetStore.resolveCredentialMaterial(existing.credentialRef)
        : null;
      return {
        edgeChannelRef: safeChannelRef,
        edgeCredentialRef: existing.credentialRef,
        edgeMaterialDigest: existing.materialDigest,
        ...(existingMaterial ? { edgeCredentialMaterial: existingMaterial } : {})
      };
    }

    const material = {
      uuid: text(uuidFactory({ orderRef, order, channelRef: safeChannelRef })),
      password: text(passwordFactory({ orderRef, order, channelRef: safeChannelRef }))
    };
    if (!material.uuid || !material.password) {
      throw issuerError("validation_error", "edge credential material is incomplete");
    }
    const materialDigest = materialDigestFor(material);
    const summary = targetStore.putCredentialMaterial({
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

  function ensureCredentials(order = {}, {
    targetStore = materialStore,
    forceRotateCredential = forceRotateCredentialFor(order)
  } = {}) {
    const orderChannelRefs = Array.isArray(order.channelRefs) && order.channelRefs.length > 0
      ? normalizeChannelRefs({ channelRefs: order.channelRefs })
      : safeChannelRefs;
    const singleChannelCredentialRef = orderChannelRefs.length === 1;
    return orderChannelRefs.map((safeChannelRef) => ensureCredentialForChannel(order, safeChannelRef, {
      singleChannelCredentialRef,
      forceRotateCredential,
      targetStore
    }));
  }

  return {
    ensureCredentialForOrder(order = {}) {
      return ensureCredentialForChannel(order, primaryChannelRef, {
        forceRotateCredential: forceRotateCredentialFor(order)
      });
    },

    ensureCredentialsForOrder(order = {}) {
      return ensureCredentials(order);
    },

    beginCredentialRotationForOrder(order = {}) {
      if (typeof materialStore.beginCredentialMaterialTransaction !== "function") {
        throw issuerError("credential_transaction_unavailable", "credential material transaction is unavailable");
      }
      const transaction = materialStore.beginCredentialMaterialTransaction();
      try {
        const credentials = ensureCredentials(order, {
          targetStore: transaction,
          forceRotateCredential: true
        });
        const previousCredentials = credentials.map((credential) => {
          const summary = transaction.getOriginalCredentialMaterialSummary(credential.edgeCredentialRef);
          const material = transaction.resolveOriginalCredentialMaterial(credential.edgeCredentialRef);
          return summary && material ? {
            edgeChannelRef: credential.edgeChannelRef,
            edgeCredentialRef: summary.credentialRef,
            edgeMaterialDigest: summary.materialDigest,
            edgeCredentialMaterial: material
          } : null;
        }).filter(Boolean);
        return {
          credentials,
          previousCredentials,
          commit: () => transaction.commit(),
          rollback: () => transaction.rollback(),
          restore: () => transaction.restore()
        };
      } catch (error) {
        transaction.rollback();
        throw error;
      }
    }
  };
}
