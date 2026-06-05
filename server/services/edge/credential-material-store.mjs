const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function materialError(code, message) {
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
    throw materialError("validation_error", `${field} is required`);
  }
  return normalized;
}

function requiredMaterialText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw materialError("validation_error", `${field} is required`);
  }
  return normalized;
}

function summaryFor(record) {
  return {
    credentialRef: record.credentialRef,
    materialDigest: record.materialDigest,
    hasMaterial: true
  };
}

export function createEdgeCredentialMaterialStore({ records = [] } = {}) {
  const byRef = new Map();

  const store = {
    putCredentialMaterial(input = {}) {
      const record = {
        credentialRef: requiredSafeRef(input.credentialRef, "credentialRef"),
        materialDigest: requiredSafeRef(input.materialDigest, "materialDigest"),
        material: {
          uuid: requiredMaterialText(input.material?.uuid, "material.uuid"),
          password: requiredMaterialText(input.material?.password, "material.password")
        }
      };
      byRef.set(record.credentialRef, record);
      return summaryFor(record);
    },

    resolveCredentialMaterial(credentialRef) {
      const record = byRef.get(requiredSafeRef(credentialRef, "credentialRef"));
      if (!record) {
        return null;
      }
      return {
        uuid: record.material.uuid,
        password: record.material.password
      };
    },

    getCredentialMaterialSummary(credentialRef) {
      const record = byRef.get(requiredSafeRef(credentialRef, "credentialRef"));
      return record ? summaryFor(record) : null;
    },

    listCredentialMaterialSummaries() {
      return [...byRef.values()]
        .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef))
        .map(summaryFor);
    }
  };

  for (const record of records) {
    store.putCredentialMaterial(record);
  }

  return store;
}
