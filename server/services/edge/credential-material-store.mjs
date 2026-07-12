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

export function normalizeCredentialMaterialRecord(input = {}) {
  return materialRecordFor(input);
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
  let activeTransaction = null;

  function protectedRecords(source = byRef) {
    return [...source.values()]
      .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef))
      .map(protectedRecordFor);
  }

  function putRecord(input = {}, { persist = true, target = byRef } = {}) {
    const record = materialRecordFor(input);
    target.set(record.credentialRef, record);
    if (persist && typeof onChange === "function") {
      onChange(protectedRecords());
    }
    return summaryFor(record);
  }

  function visibleRecords() {
    return activeTransaction?.records || byRef;
  }

  function assertNoActiveTransaction() {
    if (activeTransaction) {
      throw materialError("credential_transaction_active", "credential material transaction is active");
    }
  }

  const store = {
    putCredentialMaterial(input = {}) {
      assertNoActiveTransaction();
      return putRecord(input);
    },

    resolveCredentialMaterial(credentialRef) {
      const record = visibleRecords().get(requiredSafeRef(credentialRef, "credentialRef"));
      if (!record) {
        return null;
      }
      return {
        uuid: record.material.uuid,
        password: record.material.password
      };
    },

    getCredentialMaterialSummary(credentialRef) {
      const record = visibleRecords().get(requiredSafeRef(credentialRef, "credentialRef"));
      return record ? summaryFor(record) : null;
    },

    listCredentialMaterialSummaries() {
      return [...visibleRecords().values()]
        .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef))
        .map(summaryFor);
    },

    beginCredentialMaterialTransaction() {
      assertNoActiveTransaction();
      const transaction = {
        originalRecords: new Map(byRef),
        records: new Map(byRef),
        state: "active"
      };
      activeTransaction = transaction;

      function assertOpen() {
        if (transaction.state !== "active" || activeTransaction !== transaction) {
          throw materialError("credential_transaction_closed", "credential material transaction is closed");
        }
      }

      return {
        putCredentialMaterial(input = {}) {
          assertOpen();
          return putRecord(input, { persist: false, target: transaction.records });
        },
        resolveCredentialMaterial(credentialRef) {
          assertOpen();
          return store.resolveCredentialMaterial(credentialRef);
        },
        getCredentialMaterialSummary(credentialRef) {
          assertOpen();
          return store.getCredentialMaterialSummary(credentialRef);
        },
        listCredentialMaterialSummaries() {
          assertOpen();
          return store.listCredentialMaterialSummaries();
        },
        getOriginalCredentialMaterialSummary(credentialRef) {
          assertOpen();
          const record = transaction.originalRecords.get(requiredSafeRef(credentialRef, "credentialRef"));
          return record ? summaryFor(record) : null;
        },
        resolveOriginalCredentialMaterial(credentialRef) {
          assertOpen();
          const record = transaction.originalRecords.get(requiredSafeRef(credentialRef, "credentialRef"));
          return record ? { ...record.material } : null;
        },
        commit() {
          assertOpen();
          if (typeof onChange === "function") {
            onChange(protectedRecords(transaction.records));
          }
          byRef.clear();
          for (const [credentialRef, record] of transaction.records) {
            byRef.set(credentialRef, record);
          }
          transaction.state = "committed";
          activeTransaction = null;
        },
        rollback() {
          assertOpen();
          transaction.state = "rolled_back";
          activeTransaction = null;
        },
        restore() {
          if (transaction.state !== "committed" || activeTransaction) {
            throw materialError("credential_transaction_closed", "credential material transaction cannot be restored");
          }
          if (typeof onChange === "function") {
            onChange(protectedRecords(transaction.originalRecords));
          }
          byRef.clear();
          for (const [credentialRef, record] of transaction.originalRecords) {
            byRef.set(credentialRef, record);
          }
          transaction.state = "restored";
        }
      };
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
