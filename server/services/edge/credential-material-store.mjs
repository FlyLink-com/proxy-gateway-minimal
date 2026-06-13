import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

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

function requiredPath(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw materialError("validation_error", `${field} is required`);
  }
  return normalized;
}

function materialRecordFor(input = {}) {
  return {
    credentialRef: requiredSafeRef(input.credentialRef, "credentialRef"),
    materialDigest: requiredSafeRef(input.materialDigest, "materialDigest"),
    material: {
      uuid: requiredMaterialText(input.material?.uuid, "material.uuid"),
      password: requiredMaterialText(input.material?.password, "material.password")
    }
  };
}

function summaryFor(record) {
  return {
    credentialRef: record.credentialRef,
    materialDigest: record.materialDigest,
    hasMaterial: true
  };
}

function protectedRecordFor(record) {
  return {
    credentialRef: record.credentialRef,
    materialDigest: record.materialDigest,
    material: {
      uuid: record.material.uuid,
      password: record.material.password
    }
  };
}

function parseProtectedRecords(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed?.records)) {
    return parsed.records;
  }
  throw materialError("validation_error", "protected material file records are invalid");
}

function writeProtectedRecords(filePath, records) {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const payload = JSON.stringify({
    version: 1,
    records
  }, null, 2);
  writeFileSync(tmpPath, `${payload}\n`, { mode: 0o600 });
  renameSync(tmpPath, filePath);
  chmodSync(filePath, 0o600);
}

function createMutableEdgeCredentialMaterialStore({ records = [], onChange } = {}) {
  const byRef = new Map();

  function protectedRecords() {
    return [...byRef.values()]
      .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef))
      .map(protectedRecordFor);
  }

  function putRecord(input = {}, { persist = true } = {}) {
    const record = materialRecordFor(input);
    byRef.set(record.credentialRef, record);
    if (persist && typeof onChange === "function") {
      onChange(protectedRecords());
    }
    return summaryFor(record);
  }

  const store = {
    putCredentialMaterial(input = {}) {
      return putRecord(input);
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
    putRecord(record, { persist: false });
  }

  return store;
}

export function createEdgeCredentialMaterialStore({ records = [] } = {}) {
  return createMutableEdgeCredentialMaterialStore({ records });
}

export function createFileBackedEdgeCredentialMaterialStore({ filePath } = {}) {
  const safeFilePath = requiredPath(filePath, "filePath");
  return createMutableEdgeCredentialMaterialStore({
    records: parseProtectedRecords(safeFilePath),
    onChange(records) {
      writeProtectedRecords(safeFilePath, records);
    }
  });
}
