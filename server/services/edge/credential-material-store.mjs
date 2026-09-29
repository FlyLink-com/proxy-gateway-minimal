import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
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
    return { records: [], pending: [] };
  }
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) {
    return { records: parsed, pending: [] };
  }
  if (Array.isArray(parsed?.records)
    && (parsed.pending === undefined || Array.isArray(parsed.pending))) {
    return { records: parsed.records, pending: parsed.pending || [] };
  }
  throw materialError("validation_error", "protected material file records are invalid");
}

function writeProtectedRecords(filePath, { records, pending }) {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const payload = JSON.stringify({
    version: 1,
    records,
    pending
  }, null, 2);
  writeFileSync(tmpPath, `${payload}\n`, { mode: 0o600 });
  renameSync(tmpPath, filePath);
  chmodSync(filePath, 0o600);
}

function createMutableEdgeCredentialMaterialStore({ records = [], pending = [], onChange } = {}) {
  const byRef = new Map();
  const pendingByRef = new Map();
  let activeTransaction = null;
  let revision = 0;

  function protectedRecords(source = byRef) {
    return [...source.values()]
      .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef))
      .map(protectedRecordFor);
  }

  function protectedPending(source = pendingByRef) {
    return [...source.values()]
      .sort((a, b) => a.credentialRef.localeCompare(b.credentialRef))
      .map((entry) => ({ ...entry, material: { ...entry.material } }));
  }

  function persist(nextRecords = byRef, nextPending = pendingByRef) {
    if (typeof onChange === "function") {
      onChange({ records: protectedRecords(nextRecords), pending: protectedPending(nextPending) });
    }
  }

  function pendingSummary(entry) {
    return { rotationRef: entry.rotationRef, credentialRef: entry.credentialRef,
      oldMaterialDigest: entry.oldMaterialDigest, newMaterialDigest: entry.newMaterialDigest };
  }

  function pendingRecordFor(input) {
    const rotationRef = requiredSafeRef(input?.rotationRef, "rotationRef");
    const credentialRef = requiredSafeRef(input?.credentialRef, "credentialRef");
    const oldMaterialDigest = requiredSafeRef(input?.oldMaterialDigest, "oldMaterialDigest");
    const newMaterialDigest = requiredSafeRef(input?.newMaterialDigest, "newMaterialDigest");
    const material = {
      uuid: requiredMaterialText(input?.material?.uuid, "material.uuid"),
      password: requiredMaterialText(input?.material?.password, "material.password")
    };
    const actualDigest = `sha256:${createHash("sha256")
      .update(material.uuid).update("\0").update(material.password).digest("hex")}`;
    if (newMaterialDigest !== actualDigest || newMaterialDigest === oldMaterialDigest) {
      throw materialError("validation_error", "staged credential digest is invalid");
    }
    return { rotationRef, credentialRef, oldMaterialDigest, newMaterialDigest, material };
  }

  function putRecord(input = {}, { persist = true, target = byRef } = {}) {
    const record = materialRecordFor(input);
    if (pendingByRef.has(record.credentialRef)) {
      throw materialError("credential_rotation_pending", "credential rotation is pending");
    }
    if (persist) {
      const next = new Map(target);
      next.set(record.credentialRef, record);
      // Persist before exposing the new record to readers.
      if (typeof onChange === "function") {
        onChange({ records: protectedRecords(next), pending: protectedPending() });
      }
    }
    target.set(record.credentialRef, record);
    if (persist) revision += 1;
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

    getStagedCredentialMaterialRotation(rotationRef) {
      const safeRef = requiredSafeRef(rotationRef, "rotationRef");
      const entry = [...pendingByRef.values()].find((item) => item.rotationRef === safeRef);
      return entry ? pendingSummary(entry) : null;
    },

    stageCredentialMaterialRotation(input = {}) {
      assertNoActiveTransaction();
      const entry = pendingRecordFor(input);
      const active = byRef.get(entry.credentialRef);
      if (!active || active.materialDigest !== entry.oldMaterialDigest) {
        throw materialError("credential_rotation_drift", "active credential changed");
      }
      const existing = pendingByRef.get(entry.credentialRef);
      if (existing) {
        if (existing.rotationRef !== entry.rotationRef
          || existing.oldMaterialDigest !== entry.oldMaterialDigest
          || existing.newMaterialDigest !== entry.newMaterialDigest
          || existing.material.uuid !== entry.material.uuid
          || existing.material.password !== entry.material.password) {
          throw materialError("credential_rotation_pending", "another credential rotation is pending");
        }
        return pendingSummary(existing);
      }
      if ([...pendingByRef.values()].some((item) => item.rotationRef === entry.rotationRef)) {
        throw materialError("credential_rotation_pending", "rotation reference is already in use");
      }
      const next = new Map(pendingByRef);
      next.set(entry.credentialRef, entry);
      persist(byRef, next);
      pendingByRef.set(entry.credentialRef, entry);
      revision += 1;
      return pendingSummary(entry);
    },

    commitCredentialMaterialRotation(input = {}) {
      assertNoActiveTransaction();
      const rotationRef = requiredSafeRef(input.rotationRef, "rotationRef");
      const credentialRef = requiredSafeRef(input.credentialRef, "credentialRef");
      const oldDigest = requiredSafeRef(input.oldMaterialDigest, "oldMaterialDigest");
      const newDigest = requiredSafeRef(input.newMaterialDigest, "newMaterialDigest");
      const active = byRef.get(credentialRef);
      const entry = pendingByRef.get(credentialRef);
      if (!entry && active?.materialDigest === newDigest) return summaryFor(active);
      if (!entry || entry.rotationRef !== rotationRef
        || entry.oldMaterialDigest !== oldDigest || entry.newMaterialDigest !== newDigest
        || active?.materialDigest !== oldDigest) {
        throw materialError("credential_rotation_drift", "staged credential changed");
      }
      const nextRecords = new Map(byRef);
      const nextPending = new Map(pendingByRef);
      const replacement = materialRecordFor({ credentialRef, materialDigest: newDigest,
        material: entry.material });
      nextRecords.set(credentialRef, replacement);
      nextPending.delete(credentialRef);
      persist(nextRecords, nextPending);
      byRef.set(credentialRef, replacement);
      pendingByRef.delete(credentialRef);
      revision += 1;
      return summaryFor(replacement);
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
            onChange({ records: protectedRecords(transaction.records), pending: protectedPending() });
          }
          byRef.clear();
          for (const [credentialRef, record] of transaction.records) {
            byRef.set(credentialRef, record);
          }
          transaction.state = "committed";
          revision += 1;
          transaction.committedRevision = revision;
          activeTransaction = null;
        },
        rollback() {
          assertOpen();
          transaction.state = "rolled_back";
          activeTransaction = null;
        },
        restore() {
          if (transaction.state !== "committed" || activeTransaction
            || transaction.committedRevision !== revision) {
            throw materialError("credential_transaction_closed", "credential material transaction cannot be restored");
          }
          if (typeof onChange === "function") {
            onChange({ records: protectedRecords(transaction.originalRecords), pending: protectedPending() });
          }
          byRef.clear();
          for (const [credentialRef, record] of transaction.originalRecords) {
            byRef.set(credentialRef, record);
          }
          transaction.state = "restored";
          revision += 1;
        }
      };
    }
  };

  for (const record of records) {
    putRecord(record, { persist: false });
  }
  for (const input of pending) {
    const entry = pendingRecordFor(input);
    if (pendingByRef.has(entry.credentialRef)
      || [...pendingByRef.values()].some((item) => item.rotationRef === entry.rotationRef)
      || byRef.get(entry.credentialRef)?.materialDigest !== entry.oldMaterialDigest) {
      throw materialError("validation_error", "protected pending material is invalid");
    }
    pendingByRef.set(entry.credentialRef, entry);
  }

  return store;
}

export function createEdgeCredentialMaterialStore({ records = [] } = {}) {
  return createMutableEdgeCredentialMaterialStore({ records });
}

export function createFileBackedEdgeCredentialMaterialStore({ filePath } = {}) {
  const safeFilePath = requiredPath(filePath, "filePath");
  const { records, pending } = parseProtectedRecords(safeFilePath);
  return createMutableEdgeCredentialMaterialStore({
    records,
    pending,
    onChange(contents) {
      writeProtectedRecords(safeFilePath, contents);
    }
  });
}
