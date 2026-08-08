import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";
import Database from "better-sqlite3";

import {
  createAccountResourceAuthorityStore,
  createAccountResourceAuthorityTargetReader
} from "./account-resource-authority.mjs";
import {
  inspectAccountResourceAuthoritySchema
} from "./account-resource-authority-migrations.mjs";

const ASSIGN_KEYS = Object.freeze([
  "schemaVersion",
  "operation",
  "newAuthorityRef",
  "accountId",
  "resourceRequestId",
  "entitlementId",
  "issuedLinkId",
  "createdBy",
  "reason"
]);
const REASSIGN_KEYS = Object.freeze([
  "schemaVersion",
  "operation",
  "newAuthorityRef",
  "expectedPreviousAuthorityRef",
  "expectedVersion",
  "accountId",
  "resourceRequestId",
  "entitlementId",
  "issuedLinkId",
  "createdBy",
  "reason",
  "revokedBy",
  "revocationReason"
]);
const SAFE_VALUE_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SECRET_LIKE_PATTERN = /^(?:https?:|mailto:|bearer[ .:_-]|sk[-_]|eyj[a-z0-9_-]{10,})/i;
const DIGEST_DOMAIN =
  "GCCWEBOS:ACCOUNT_RESOURCE_AUTHORITY_OPERATOR_REQUEST:v1\0";
const WINDOWS_RESERVED_BASENAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "CLOCK$",
  "CONIN$",
  "CONOUT$"
]);
const WINDOWS_SUPERSCRIPT_DIGITS = Object.freeze({
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9"
});
const WINDOWS_UNC_SHARE_PCHAR_PATTERN =
  /^[\x20-\x21\x23-\x29\x2d-\x2e\x30-\x39\x40-\x5a\x5e-\x7b\x7d-\xff]{1,80}$/u;
const AUTHORITY_COLUMNS = Object.freeze([
  "authority_ref",
  "account_id",
  "resource_request_id",
  "entitlement_id",
  "issued_link_id",
  "status",
  "version",
  "previous_authority_ref",
  "created_at",
  "updated_at",
  "created_by",
  "reason",
  "revoked_at",
  "revoked_by",
  "revocation_reason"
]);
const AUTHORITY_SELECT = AUTHORITY_COLUMNS.join(", ");

function operatorError() {
  const error = new Error("Account resource authority operator rejected");
  error.code = "account_resource_authority_operator_invalid_contract";
  return error;
}

function unsafeDataObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw operatorError();
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw operatorError();
  }
  return value;
}

function unsafeExactValues(value, expectedKeys) {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some((key) => typeof key !== "string")
    || expectedKeys.some((key) => !ownKeys.includes(key))
  ) {
    throw operatorError();
  }
  const values = Object.create(null);
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw operatorError();
    }
    values[key] = descriptor.value;
  }
  return values;
}

function safeValueIsExact(value) {
  return typeof value === "string"
    && SAFE_VALUE_PATTERN.test(value)
    && !SECRET_LIKE_PATTERN.test(value);
}

function unsafeSafeValue(value) {
  if (!safeValueIsExact(value)) {
    throw operatorError();
  }
  return value;
}

function unsafeNormalize(value) {
  const object = unsafeDataObject(value);
  const operationDescriptor = Reflect.getOwnPropertyDescriptor(
    object,
    "operation"
  );
  if (!operationDescriptor || !("value" in operationDescriptor)) {
    throw operatorError();
  }
  const operation = operationDescriptor.value;
  const keys = operation === "assign"
    ? ASSIGN_KEYS
    : operation === "reassign" ? REASSIGN_KEYS : null;
  if (!keys) throw operatorError();
  const input = unsafeExactValues(object, keys);
  if (input.schemaVersion !== "1" || input.operation !== operation) {
    throw operatorError();
  }

  if (operation === "assign") {
    return Object.freeze({
      schemaVersion: "1",
      operation: "assign",
      newAuthorityRef: unsafeSafeValue(input.newAuthorityRef),
      accountId: unsafeSafeValue(input.accountId),
      resourceRequestId: unsafeSafeValue(input.resourceRequestId),
      entitlementId: unsafeSafeValue(input.entitlementId),
      issuedLinkId: unsafeSafeValue(input.issuedLinkId),
      createdBy: unsafeSafeValue(input.createdBy),
      reason: unsafeSafeValue(input.reason)
    });
  }

  const newAuthorityRef = unsafeSafeValue(input.newAuthorityRef);
  const expectedPreviousAuthorityRef = unsafeSafeValue(
    input.expectedPreviousAuthorityRef
  );
  if (
    !Number.isSafeInteger(input.expectedVersion)
    || input.expectedVersion < 1
    || input.expectedVersion > Number.MAX_SAFE_INTEGER - 1
    || newAuthorityRef === expectedPreviousAuthorityRef
  ) {
    throw operatorError();
  }
  return Object.freeze({
    schemaVersion: "1",
    operation: "reassign",
    newAuthorityRef,
    expectedPreviousAuthorityRef,
    expectedVersion: input.expectedVersion,
    accountId: unsafeSafeValue(input.accountId),
    resourceRequestId: unsafeSafeValue(input.resourceRequestId),
    entitlementId: unsafeSafeValue(input.entitlementId),
    issuedLinkId: unsafeSafeValue(input.issuedLinkId),
    createdBy: unsafeSafeValue(input.createdBy),
    reason: unsafeSafeValue(input.reason),
    revokedBy: unsafeSafeValue(input.revokedBy),
    revocationReason: unsafeSafeValue(input.revocationReason)
  });
}

export function normalizeAuthorityOperatorRequest(value) {
  try {
    return unsafeNormalize(value);
  } catch {
    throw operatorError();
  }
}

export function digestAuthorityOperatorRequest(request) {
  const normalized = normalizeAuthorityOperatorRequest(request);
  const canonical = normalized.operation === "assign"
    ? {
        schemaVersion: normalized.schemaVersion,
        operation: normalized.operation,
        newAuthorityRef: normalized.newAuthorityRef,
        expectedVersion: 0,
        accountId: normalized.accountId,
        resourceRequestId: normalized.resourceRequestId,
        entitlementId: normalized.entitlementId,
        issuedLinkId: normalized.issuedLinkId,
        createdBy: normalized.createdBy,
        reason: normalized.reason
      }
    : {
        schemaVersion: normalized.schemaVersion,
        operation: normalized.operation,
        newAuthorityRef: normalized.newAuthorityRef,
        expectedPreviousAuthorityRef:
          normalized.expectedPreviousAuthorityRef,
        expectedVersion: normalized.expectedVersion,
        accountId: normalized.accountId,
        resourceRequestId: normalized.resourceRequestId,
        entitlementId: normalized.entitlementId,
        issuedLinkId: normalized.issuedLinkId,
        createdBy: normalized.createdBy,
        reason: normalized.reason,
        revokedBy: normalized.revokedBy,
        revocationReason: normalized.revocationReason
      };
  return `sha256:${createHash("sha256")
    .update(DIGEST_DOMAIN)
    .update(JSON.stringify(canonical))
    .digest("hex")}`;
}

function requireOperationInputs({ dbPath, request, nowFn }) {
  const normalized = normalizeAuthorityOperatorRequest(request);
  const requestDigest = digestAuthorityOperatorRequest(normalized);
  if (
    typeof dbPath !== "string"
    || !databasePathIsFullyQualified(dbPath)
    || typeof nowFn !== "function"
  ) {
    throw operatorError();
  }
  return { normalized, requestDigest };
}

function windowsPathIsFullyQualified(value) {
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return win32.isAbsolute(value)
      && value.slice(3).split(/[\\/]/).every(windowsComponentIsOrdinary);
  }
  if (!(value.startsWith("\\\\") || value.startsWith("//"))) return false;
  const components = value.slice(2).split(/[\\/]/);
  if (
    components.length < 3
    || !windowsComponentIsOrdinary(components[0])
    || !windowsShareIsExact(components[1])
    || !components.slice(2).every(windowsComponentIsOrdinary)
  ) {
    return false;
  }
  return true;
}

function windowsComponentIsOrdinary(value) {
  if (
    value.length === 0
    || value === "."
    || value === ".."
    || /[. ]$/.test(value)
    || /[<>:"|?*\u0000-\u001f\u007f-\u009f]/.test(value)
  ) {
    return false;
  }
  return !windowsComponentHasReservedBasename(value);
}

function windowsShareIsExact(value) {
  if (
    !WINDOWS_UNC_SHARE_PCHAR_PATTERN.test(value)
    || value === "."
    || value === ".."
    || /[. ]$/.test(value)
    || /[\u007f-\u009f]/.test(value)
    || windowsComponentHasReservedBasename(value)
  ) {
    return false;
  }
  const uppercase = value.toUpperCase();
  return uppercase !== "PIPE" && uppercase !== "IPC$";
}

function windowsComponentHasReservedBasename(value) {
  const basename = value.split(".", 1)[0]
    .toUpperCase()
    .replace(
      /[⁰¹²³⁴⁵⁶⁷⁸⁹]/gu,
      (digit) => WINDOWS_SUPERSCRIPT_DIGITS[digit]
    );
  return (
    WINDOWS_RESERVED_BASENAMES.has(basename)
    || /^(?:COM|LPT)[1-9]$/.test(basename)
  );
}

function databasePathIsFullyQualified(value) {
  return process.platform === "win32"
    ? windowsPathIsFullyQualified(value)
    : posix.isAbsolute(value);
}

function normalizedNow(nowFn) {
  const now = nowFn();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw operatorError();
  }
  return new Date(now.getTime());
}

function canonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function sameAuthorityRow(left, right) {
  return Boolean(left && right)
    && AUTHORITY_COLUMNS.every((column) => left[column] === right[column]);
}

function exactLineage(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const final = index === rows.length - 1;
    if (
      !safeValueIsExact(row.authority_ref)
      || !safeValueIsExact(row.account_id)
      || !safeValueIsExact(row.resource_request_id)
      || !safeValueIsExact(row.entitlement_id)
      || !safeValueIsExact(row.issued_link_id)
      || !safeValueIsExact(row.created_by)
      || !safeValueIsExact(row.reason)
      || row.version !== index + 1
      || row.previous_authority_ref !== (
        index === 0 ? null : rows[index - 1].authority_ref
      )
      || (
        row.previous_authority_ref !== null
        && !safeValueIsExact(row.previous_authority_ref)
      )
      || !canonicalIsoTimestamp(row.created_at)
      || !canonicalIsoTimestamp(row.updated_at)
    ) {
      return false;
    }
    if (index > 0) {
      const previous = rows[index - 1];
      if (
        previous.revoked_at !== row.created_at
        || (
          previous.resource_request_id === row.resource_request_id
          && previous.entitlement_id === row.entitlement_id
          && previous.issued_link_id === row.issued_link_id
        )
      ) {
        return false;
      }
    }
    if (final) {
      if (
        row.status !== "active"
        || row.revoked_at !== null
        || row.revoked_by !== null
        || row.revocation_reason !== null
        || row.created_at !== row.updated_at
      ) {
        return false;
      }
    } else if (
      row.status !== "revoked"
      || !canonicalIsoTimestamp(row.revoked_at)
      || !safeValueIsExact(row.revoked_by)
      || !safeValueIsExact(row.revocation_reason)
      || row.updated_at !== row.revoked_at
    ) {
      return false;
    }
  }
  return true;
}

function targetMatches(row, request) {
  return row.account_id === request.accountId
    && row.resource_request_id === request.resourceRequestId
    && row.entitlement_id === request.entitlementId
    && row.issued_link_id === request.issuedLinkId;
}

function targetDiffers(row, request) {
  return row.resource_request_id !== request.resourceRequestId
    || row.entitlement_id !== request.entitlementId
    || row.issued_link_id !== request.issuedLinkId;
}

function readClassification(database, request, now) {
  const inspection = inspectAccountResourceAuthoritySchema({ database });
  if (!inspection.ok) return "drift";

  const targetReader = createAccountResourceAuthorityTargetReader({ database });
  const target = targetReader.readExactTarget(request, now);
  const selectLineage = database.prepare(`
    select ${AUTHORITY_SELECT}
    from main.platform_account_resource_authorities
    where account_id = ?
    order by version asc, authority_ref asc
  `);
  const selectGlobal = database.prepare(`
    select ${AUTHORITY_SELECT}
    from main.platform_account_resource_authorities
    where authority_ref = ?
  `);
  const lineage = selectLineage.all(request.accountId);
  const globalNew = selectGlobal.get(request.newAuthorityRef) ?? null;
  const globalPrevious = request.operation === "reassign"
    ? selectGlobal.get(request.expectedPreviousAuthorityRef) ?? null
    : null;
  const lineageExact = exactLineage(lineage);

  if (request.operation === "assign") {
    if (target && lineage.length === 0 && !globalNew) return "not_applied";
    if (target && lineage.length === 1 && lineageExact) {
      const row = lineage[0];
      if (
        row.authority_ref === request.newAuthorityRef
        && row.version === 1
        && row.previous_authority_ref === null
        && targetMatches(row, request)
        && row.created_by === request.createdBy
        && row.reason === request.reason
        && sameAuthorityRow(row, globalNew)
      ) {
        return "applied_exact";
      }
    }
    return "drift";
  }

  if (
    target
    && lineage.length === request.expectedVersion
    && lineageExact
  ) {
    const previous = lineage[lineage.length - 1];
    if (
      previous.authority_ref === request.expectedPreviousAuthorityRef
      && previous.version === request.expectedVersion
      && targetDiffers(previous, request)
      && sameAuthorityRow(previous, globalPrevious)
      && !globalNew
    ) {
      return "not_applied";
    }
  }

  if (
    target
    && lineage.length === request.expectedVersion + 1
    && lineageExact
  ) {
    const previous = lineage[request.expectedVersion - 1];
    const current = lineage[request.expectedVersion];
    if (
      previous.authority_ref === request.expectedPreviousAuthorityRef
      && previous.version === request.expectedVersion
      && previous.status === "revoked"
      && targetDiffers(previous, request)
      && previous.revoked_by === request.revokedBy
      && previous.revocation_reason === request.revocationReason
      && current.authority_ref === request.newAuthorityRef
      && current.version === request.expectedVersion + 1
      && current.previous_authority_ref === request.expectedPreviousAuthorityRef
      && targetMatches(current, request)
      && current.created_by === request.createdBy
      && current.reason === request.reason
      && previous.updated_at === previous.revoked_at
      && previous.revoked_at === current.created_at
      && current.created_at === current.updated_at
      && sameAuthorityRow(previous, globalPrevious)
      && sameAuthorityRow(current, globalNew)
    ) {
      return "applied_exact";
    }
  }
  return "drift";
}

function result({
  operation,
  requestDigest,
  classification,
  receiptState,
  databaseChanged
}) {
  return Object.freeze({
    operation,
    requestDigest,
    classification,
    receiptState,
    databaseChanged,
    automaticRetry: false
  });
}

function planResult(operation, requestDigest, classification) {
  return result({
    operation,
    requestDigest,
    classification,
    receiptState: classification === "applied_exact"
      ? "recovered_after_unknown"
      : classification === "unknown" ? "unknown" : "not_applicable",
    databaseChanged: false
  });
}

function unknownApply(operation, requestDigest) {
  return result({
    operation,
    requestDigest,
    classification: "unknown",
    receiptState: "unknown",
    databaseChanged: null
  });
}

export function planAuthorityOperatorRequest({
  dbPath,
  request,
  nowFn = () => new Date()
} = {}) {
  const { normalized, requestDigest } = requireOperationInputs({
    dbPath,
    request,
    nowFn
  });
  let database;
  let planned;
  try {
    database = new Database(dbPath, { readonly: true, fileMustExist: true });
    database.pragma("busy_timeout = 0");
    database.pragma("query_only = ON");
    const read = database.transaction(() => readClassification(
      database,
      normalized,
      normalizedNow(nowFn)
    ));
    planned = planResult(normalized.operation, requestDigest, read.deferred());
  } catch {
    planned = planResult(normalized.operation, requestDigest, "unknown");
  }
  try {
    database?.close();
  } catch {
    planned = planResult(normalized.operation, requestDigest, "unknown");
  }
  return planned;
}

export function applyAuthorityOperatorRequest({
  dbPath,
  request,
  nowFn = () => new Date()
} = {}) {
  const { normalized, requestDigest } = requireOperationInputs({
    dbPath,
    request,
    nowFn
  });
  let database;
  let applied;
  try {
    database = new Database(dbPath, { fileMustExist: true });
    database.pragma("busy_timeout = 0");
    database.pragma("foreign_keys = ON");
    if (database.inTransaction) throw operatorError();

    const mutate = database.transaction(() => {
      const now = normalizedNow(nowFn);
      const preclassification = readClassification(database, normalized, now);
      if (preclassification === "applied_exact") {
        return result({
          operation: normalized.operation,
          requestDigest,
          classification: "applied_exact",
          receiptState: "apply_refused_already_applied",
          databaseChanged: false
        });
      }
      if (preclassification === "drift") {
        return result({
          operation: normalized.operation,
          requestDigest,
          classification: "drift",
          receiptState: "apply_refused_drift",
          databaseChanged: false
        });
      }

      const store = createAccountResourceAuthorityStore({
        database,
        nowFn: () => new Date(now.getTime()),
        idFactory: () => normalized.newAuthorityRef
      });
      if (normalized.operation === "assign") {
        store.assignAuthority({
          accountId: normalized.accountId,
          resourceRequestId: normalized.resourceRequestId,
          entitlementId: normalized.entitlementId,
          issuedLinkId: normalized.issuedLinkId,
          expectedVersion: 0,
          createdBy: normalized.createdBy,
          reason: normalized.reason
        });
      } else {
        store.reassignAuthority({
          accountId: normalized.accountId,
          resourceRequestId: normalized.resourceRequestId,
          entitlementId: normalized.entitlementId,
          issuedLinkId: normalized.issuedLinkId,
          expectedPreviousAuthorityRef:
            normalized.expectedPreviousAuthorityRef,
          expectedVersion: normalized.expectedVersion,
          createdBy: normalized.createdBy,
          reason: normalized.reason,
          revokedBy: normalized.revokedBy,
          revocationReason: normalized.revocationReason
        });
      }
      if (readClassification(database, normalized, now) !== "applied_exact") {
        throw operatorError();
      }
      return result({
        operation: normalized.operation,
        requestDigest,
        classification: "applied_exact",
        receiptState: "applied",
        databaseChanged: true
      });
    });
    applied = mutate.immediate();
  } catch {
    applied = unknownApply(normalized.operation, requestDigest);
  }
  try {
    database?.close();
  } catch {
    applied = unknownApply(normalized.operation, requestDigest);
  }
  return applied;
}
