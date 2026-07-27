import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

import {
  allocateCoinLots,
  assertCoinUnits,
  canonicalWalletRequestDigest,
  normalizeAcceptedCoinTypes,
  normalizeCoinType,
  projectCoinWalletBalance
} from "./coin-wallet-domain.mjs";
import {
  validateCoinWalletSchema
} from "./coin-wallet-migrations.mjs";

const BUSY_TIMEOUT_MS = 2000;
const MAX_LEDGER_PAGE_SIZE = 500;
const OPERATION_TYPE_CREDIT = "credit_coins";
const OPERATION_TYPE_CONFIRM_CREDIT = "confirm_coin_credit";
const OPERATION_TYPE_CREATE_HOLD = "create_coin_hold";
const OPERATION_TYPE_CAPTURE_HOLD = "capture_coin_hold";
const OPERATION_TYPE_RELEASE_HOLD = "release_coin_hold";
const OPERATION_TYPE_EXPIRE_HOLD = "expire_coin_hold";
const OPERATION_TYPE_EXPIRE_LOT = "expire_coin_lot";
const SAFE_RESULT_CREDITED = "credited";
const SAFE_RESULT_CONFIRMED = "confirmed";
const SAFE_RESULT_HELD = "held";
const SAFE_RESULT_INSUFFICIENT = "insufficient_balance";
const SAFE_RESULT_CAPTURED = "captured";
const SAFE_RESULT_RELEASED = "released";
const SAFE_RESULT_EXPIRED = "expired";
const SAFE_RESULT_EXPIRY_PROCESSED = "expiry_processed";
const SAFE_RESULT_HOLD_EXPIRED = "hold_expired";
const EXPIRY_ACTOR_SCOPE = "system:coin-wallet-expiry";
const EXPIRY_ACTOR_TYPE = "system";
const EXPIRY_ACTOR_REF = "coin_wallet_expiry_worker";
const CONFIRMATION_RESULT_STATUSES = new Set(["active", "frozen"]);
const CREDIT_FIELDS = new Set([
  "accountId",
  "coinType",
  "amountUnits",
  "availability",
  "sourceType",
  "sourceRef",
  "sourceDigest",
  "policyRef",
  "policyVersion",
  "expiresAt",
  "operation"
]);
const OPERATION_FIELDS = new Set([
  "actorScope",
  "idempotencyKey",
  "actorType",
  "actorRef"
]);
const CONFIRM_CREDIT_FIELDS = new Set([
  "lotRef",
  "amountUnits",
  "operation"
]);
const CREATE_HOLD_FIELDS = new Set([
  "walletRef",
  "purpose",
  "purposeRef",
  "amountUnits",
  "acceptedCoinTypes",
  "expiresAt",
  "operation"
]);
const PREVIEW_HOLD_FIELDS = new Set([
  "accountId",
  "amountUnits",
  "acceptedCoinTypes"
]);
const PARTICIPANT_PROJECTION_FIELDS = new Set(["accountId"]);
const PARTICIPANT_FACTORY_FIELDS = new Set([
  "database",
  "nowFn",
  "refFactory"
]);
const HOLD_LIFECYCLE_FIELDS = new Set(["holdRef", "operation"]);
const EXPIRE_HOLD_FIELDS = new Set(["holdRef"]);
const EXPIRE_LOT_FIELDS = new Set(["lotRef"]);
const HOLD_ALLOCATION_FIELDS = new Set([
  "lotRef",
  "coinType",
  "allocationSequence",
  "allocatedUnits"
]);
const HOLD_STATUSES = new Set([
  "active",
  "captured",
  "released",
  "expired",
  "invalidated"
]);
const KNOWN_STORE_CODES = new Set([
  "account_not_found",
  "coin_units_overflow",
  "coin_wallet_schema_not_ready",
  "coin_credit_not_confirmable",
  "coin_hold_not_active",
  "coin_lot_not_expirable",
  "credit_origin_conflict",
  "duplicate_coin_type",
  "idempotency_conflict",
  "idempotency_unavailable",
  "invalid_coin_expiry",
  "invalid_accepted_coin_types",
  "invalid_coin_policy",
  "invalid_coin_type",
  "invalid_coin_units",
  "invalid_credit_state",
  "invalid_pagination",
  "invalid_reference",
  "invalid_store_contract",
  "invalid_wallet_request",
  "invalid_wallet_timestamp",
  "hold_not_found",
  "lot_not_found",
  "non_normalized_wallet_request",
  "not_due",
  "store_closed",
  "wallet_busy",
  "wallet_infrastructure_error",
  "wallet_not_found",
  "wallet_not_active",
  "wallet_transaction_required"
]);
const TRANSACTION_PARTICIPANT_BY_STORE = new WeakMap();

function storeError(code) {
  const error = new Error("Coin wallet store operation rejected");
  error.code = code;
  return error;
}

function isStoreError(error) {
  return typeof error?.code === "string" && KNOWN_STORE_CODES.has(error.code);
}

function normalizeStoreError(error) {
  if (isStoreError(error)) return error;
  if (
    typeof error?.code === "string"
    && (
      error.code.startsWith("SQLITE_BUSY")
      || error.code.startsWith("SQLITE_LOCKED")
    )
  ) {
    return storeError("wallet_busy");
  }
  return storeError("wallet_infrastructure_error");
}

function assertPlainObject(value, code = "invalid_wallet_request") {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw storeError(code);
  }
  return value;
}

function assertExactDataFields(value, allowedFields) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedFields.has(key)) {
      throw storeError("invalid_wallet_request");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw storeError("invalid_wallet_request");
    }
  }
}

function assertRequiredOwnDataFields(value, requiredFields) {
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      throw storeError("invalid_wallet_request");
    }
  }
}

function assertNormalizedString(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw storeError("non_normalized_wallet_request");
  }
  return value;
}

function normalizeTimestamp(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw storeError("invalid_wallet_timestamp");
  }
  return value;
}

function normalizeNow(nowFn) {
  let value;
  try {
    value = nowFn();
  } catch {
    throw storeError("invalid_wallet_timestamp");
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw storeError("invalid_wallet_timestamp");
  }
  return value.toISOString();
}

function normalizePositiveUnits(value, code = "invalid_coin_units") {
  try {
    assertCoinUnits(value, "amountUnits");
  } catch {
    throw storeError(code);
  }
  if (value === 0) throw storeError(code);
  return value;
}

function safeAddUnits(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) {
    throw storeError("coin_units_overflow");
  }
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw storeError("coin_units_overflow");
  }
  return result;
}

function normalizeCreditRequest(input) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, CREDIT_FIELDS);
  const operation = assertPlainObject(request.operation);
  assertExactDataFields(operation, OPERATION_FIELDS);

  const accountId = assertNormalizedString(request.accountId);
  let coinType;
  try {
    coinType = normalizeCoinType(request.coinType);
  } catch {
    throw storeError("invalid_coin_type");
  }
  const amountUnits = normalizePositiveUnits(request.amountUnits);
  const availability = assertNormalizedString(request.availability);
  const sourceType = assertNormalizedString(request.sourceType);
  const sourceRef = assertNormalizedString(request.sourceRef);
  const sourceDigest = assertNormalizedString(request.sourceDigest);
  const policyRef = request.policyRef ?? null;
  const policyVersion = request.policyVersion ?? null;
  const expiresAt = normalizeTimestamp(request.expiresAt ?? null, {
    nullable: true
  });

  if (
    (coinType === "reward_coins" && availability !== "pending")
    || (coinType !== "reward_coins" && availability !== "available")
  ) {
    throw storeError("invalid_credit_state");
  }
  if (coinType !== "bonus_coins" && expiresAt !== null) {
    throw storeError("invalid_coin_expiry");
  }
  if (coinType === "reward_coins") {
    if (
      policyRef === null
      || policyVersion === null
      || typeof policyRef !== "string"
      || policyRef.length === 0
      || policyRef.trim() !== policyRef
      || !Number.isSafeInteger(policyVersion)
      || policyVersion <= 0
    ) {
      throw storeError("invalid_coin_policy");
    }
  } else if (policyRef !== null || policyVersion !== null) {
    throw storeError("invalid_coin_policy");
  }

  const normalizedOperation = {
    actorScope: assertNormalizedString(operation.actorScope),
    idempotencyKey: assertNormalizedString(operation.idempotencyKey),
    actorType: assertNormalizedString(operation.actorType),
    actorRef: assertNormalizedString(operation.actorRef)
  };
  const digestInput = {
    accountId,
    coinType,
    amountUnits,
    availability,
    sourceType,
    sourceRef,
    sourceDigest,
    expiresAt
  };
  if (coinType === "reward_coins") {
    digestInput.policyRef = policyRef;
    digestInput.policyVersion = policyVersion;
  }

  return {
    accountId,
    coinType,
    amountUnits,
    availability,
    sourceType,
    sourceRef,
    sourceDigest,
    policyRef,
    policyVersion,
    expiresAt,
    operation: normalizedOperation,
    requestDigest: canonicalWalletRequestDigest(
      OPERATION_TYPE_CREDIT,
      digestInput
    )
  };
}

function normalizeConfirmCreditRequest(input) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, CONFIRM_CREDIT_FIELDS);
  const operation = assertPlainObject(request.operation);
  assertExactDataFields(operation, OPERATION_FIELDS);

  const lotRef = assertNormalizedString(request.lotRef);
  const amountUnits = normalizePositiveUnits(request.amountUnits);
  const normalizedOperation = {
    actorScope: assertNormalizedString(operation.actorScope),
    idempotencyKey: assertNormalizedString(operation.idempotencyKey),
    actorType: assertNormalizedString(operation.actorType),
    actorRef: assertNormalizedString(operation.actorRef)
  };
  return {
    lotRef,
    amountUnits,
    operation: normalizedOperation,
    requestDigest: canonicalWalletRequestDigest(
      OPERATION_TYPE_CONFIRM_CREDIT,
      { lotRef, amountUnits }
    )
  };
}

function normalizeCreateHoldRequest(input) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, CREATE_HOLD_FIELDS);
  assertRequiredOwnDataFields(request, CREATE_HOLD_FIELDS);
  const operation = assertPlainObject(request.operation);
  assertExactDataFields(operation, OPERATION_FIELDS);
  assertRequiredOwnDataFields(operation, OPERATION_FIELDS);

  const walletRef = assertNormalizedString(request.walletRef);
  const purpose = assertNormalizedString(request.purpose);
  const purposeRef = assertNormalizedString(request.purposeRef);
  const amountUnits = normalizePositiveUnits(request.amountUnits);
  let acceptedCoinTypes;
  try {
    acceptedCoinTypes = normalizeAcceptedCoinTypes(request.acceptedCoinTypes);
  } catch (error) {
    if (
      error?.code === "invalid_accepted_coin_types"
      || error?.code === "duplicate_coin_type"
      || error?.code === "invalid_coin_type"
    ) {
      throw storeError(error.code);
    }
    throw storeError("invalid_coin_type");
  }
  const expiresAt = normalizeTimestamp(request.expiresAt);
  if (purpose === "reward_adjustment") {
    if (
      acceptedCoinTypes.length !== 1
      || acceptedCoinTypes[0] !== "reward_coins"
    ) {
      throw storeError("invalid_coin_type");
    }
  } else if (purpose !== "product_purchase") {
    throw storeError("invalid_wallet_request");
  }
  const normalizedOperation = {
    actorScope: assertNormalizedString(operation.actorScope),
    idempotencyKey: assertNormalizedString(operation.idempotencyKey),
    actorType: assertNormalizedString(operation.actorType),
    actorRef: assertNormalizedString(operation.actorRef)
  };
  return {
    walletRef,
    purpose,
    purposeRef,
    amountUnits,
    acceptedCoinTypes,
    expiresAt,
    operation: normalizedOperation,
    requestDigest: canonicalWalletRequestDigest(
      OPERATION_TYPE_CREATE_HOLD,
      {
        walletRef,
        purpose,
        purposeRef,
        amountUnits,
        acceptedCoinTypes,
        expiresAt
      }
    )
  };
}

function normalizeLifecycleOperation(operation) {
  const value = assertPlainObject(operation);
  assertExactDataFields(value, OPERATION_FIELDS);
  assertRequiredOwnDataFields(value, OPERATION_FIELDS);
  return {
    actorScope: assertNormalizedString(value.actorScope),
    idempotencyKey: assertNormalizedString(value.idempotencyKey),
    actorType: assertNormalizedString(value.actorType),
    actorRef: assertNormalizedString(value.actorRef)
  };
}

function normalizeHoldLifecycleRequest(input, operationType) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, HOLD_LIFECYCLE_FIELDS);
  assertRequiredOwnDataFields(request, HOLD_LIFECYCLE_FIELDS);
  const holdRef = assertNormalizedString(request.holdRef);
  return {
    holdRef,
    operation: normalizeLifecycleOperation(request.operation),
    requestDigest: canonicalWalletRequestDigest(operationType, { holdRef })
  };
}

function normalizePreviewHoldRequest(input) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, PREVIEW_HOLD_FIELDS);
  assertRequiredOwnDataFields(request, PREVIEW_HOLD_FIELDS);
  let acceptedCoinTypes;
  try {
    acceptedCoinTypes = normalizeAcceptedCoinTypes(request.acceptedCoinTypes);
  } catch (error) {
    if (
      error?.code === "invalid_accepted_coin_types"
      || error?.code === "duplicate_coin_type"
      || error?.code === "invalid_coin_type"
    ) {
      throw storeError(error.code);
    }
    throw storeError("invalid_coin_type");
  }
  return {
    accountId: assertNormalizedString(request.accountId),
    amountUnits: normalizePositiveUnits(request.amountUnits),
    acceptedCoinTypes
  };
}

function normalizeParticipantProjectionLookup(input) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, PARTICIPANT_PROJECTION_FIELDS);
  assertRequiredOwnDataFields(request, PARTICIPANT_PROJECTION_FIELDS);
  return { accountId: assertNormalizedString(request.accountId) };
}

function normalizeExpirySubjectRequest(input, fields, subjectField) {
  const request = assertPlainObject(input);
  assertExactDataFields(request, fields);
  assertRequiredOwnDataFields(request, fields);
  return assertNormalizedString(request[subjectField]);
}

function prepareHoldAllocations({
  allocations,
  lots,
  walletRef,
  acceptedCoinTypes,
  amountUnits
}) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw storeError("wallet_infrastructure_error");
  }
  for (const key of Reflect.ownKeys(allocations)) {
    if (key === "length") continue;
    if (
      typeof key !== "string"
      || !/^(0|[1-9][0-9]*)$/.test(key)
      || Number(key) >= allocations.length
    ) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  const lotsByRef = new Map(lots.map((lot) => [lot.lotRef, lot]));
  const accepted = new Set(acceptedCoinTypes);
  const seenLotRefs = new Set();
  const prepared = [];
  let allocatedTotal = 0;
  for (let index = 0; index < allocations.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(allocations, index)) {
      throw storeError("wallet_infrastructure_error");
    }
    const descriptor = Object.getOwnPropertyDescriptor(allocations, String(index));
    const allocation = descriptor?.value;
    if (
      !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
      || !allocation
      || typeof allocation !== "object"
      || Array.isArray(allocation)
      || Object.getPrototypeOf(allocation) !== Object.prototype
    ) {
      throw storeError("wallet_infrastructure_error");
    }
    const keys = Reflect.ownKeys(allocation);
    if (keys.length !== HOLD_ALLOCATION_FIELDS.size) {
      throw storeError("wallet_infrastructure_error");
    }
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(allocation, key);
      if (
        typeof key !== "string"
        || !HOLD_ALLOCATION_FIELDS.has(key)
        || !field
        || !field.enumerable
        || !("value" in field)
      ) {
        throw storeError("wallet_infrastructure_error");
      }
    }
    for (const field of HOLD_ALLOCATION_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(allocation, field)) {
        throw storeError("wallet_infrastructure_error");
      }
    }

    const lot = lotsByRef.get(allocation.lotRef);
    if (
      !lot
      || seenLotRefs.has(allocation.lotRef)
      || lot.walletRef !== walletRef
      || allocation.allocationSequence !== index + 1
      || allocation.coinType !== lot.coinType
      || !accepted.has(allocation.coinType)
      || !Number.isSafeInteger(allocation.allocatedUnits)
      || allocation.allocatedUnits <= 0
      || !Number.isSafeInteger(lot.availableUnits)
      || lot.availableUnits < allocation.allocatedUnits
      || !Number.isSafeInteger(lot.heldUnits)
      || lot.heldUnits < 0
      || typeof lot.sourceType !== "string"
      || lot.sourceType.length === 0
      || lot.sourceType.trim() !== lot.sourceType
      || typeof lot.sourceRef !== "string"
      || lot.sourceRef.length === 0
      || lot.sourceRef.trim() !== lot.sourceRef
    ) {
      throw storeError("wallet_infrastructure_error");
    }
    seenLotRefs.add(allocation.lotRef);
    allocatedTotal = safeAddUnits(allocatedTotal, allocation.allocatedUnits);
    prepared.push({
      ...allocation,
      lot,
      resultingAvailableUnits: lot.availableUnits - allocation.allocatedUnits,
      resultingHeldUnits: safeAddUnits(lot.heldUnits, allocation.allocatedUnits)
    });
  }
  if (allocatedTotal !== amountUnits) {
    throw storeError("wallet_infrastructure_error");
  }
  return prepared;
}

function mapWallet(row) {
  if (!row) return null;
  return {
    walletRef: row.wallet_ref,
    accountId: row.account_id,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLot(row) {
  if (!row) return null;
  return {
    lotRef: row.lot_ref,
    walletRef: row.wallet_ref,
    coinType: row.coin_type,
    creditOriginRef: row.credit_origin_ref,
    issuedUnits: row.issued_units,
    pendingUnits: row.pending_units,
    availableUnits: row.available_units,
    heldUnits: row.held_units,
    consumedUnits: row.consumed_units,
    reversedUnits: row.reversed_units,
    expiredUnits: row.expired_units,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    policyRef: row.policy_ref,
    policyVersion: row.policy_version,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapHold(row) {
  if (!row) return null;
  return {
    holdRef: row.hold_ref,
    walletRef: row.wallet_ref,
    purpose: row.purpose,
    purposeRef: row.purpose_ref,
    amountUnits: row.amount_units,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReceipt(row) {
  if (!row) return null;
  return {
    operationRef: row.operation_ref,
    walletRef: row.wallet_ref,
    actorScope: row.actor_scope,
    operationType: row.operation_type,
    idempotencyKey: row.idempotency_key,
    requestDigest: row.request_digest,
    status: row.status,
    previousWalletVersion: row.previous_wallet_version,
    resultingWalletVersion: row.resulting_wallet_version,
    resultingWalletStatus: row.resulting_wallet_status,
    resultRef: row.result_ref,
    safeResultCode: row.safe_result_code,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function mapLedgerEntry(row) {
  if (!row) return null;
  return {
    entryRef: row.entry_ref,
    operationRef: row.operation_ref,
    walletRef: row.wallet_ref,
    lotRef: row.lot_ref,
    operation: row.operation,
    amountUnits: row.amount_units,
    holdRef: row.hold_ref,
    orderRef: row.order_ref,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    actorType: row.actor_type,
    actorRef: row.actor_ref,
    previousWalletVersion: row.previous_wallet_version,
    resultingWalletVersion: row.resulting_wallet_version,
    resultingWalletStatus: row.resulting_wallet_status,
    occurredAt: row.occurred_at
  };
}

function assertOptionalStatus(value, allowedStatuses) {
  if (value === undefined) return null;
  const normalized = assertNormalizedString(value);
  if (!allowedStatuses.has(normalized)) {
    throw storeError("invalid_wallet_request");
  }
  return normalized;
}

function normalizeListLimit(value) {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_LEDGER_PAGE_SIZE
  ) {
    throw storeError("invalid_pagination");
  }
  return value;
}

function normalizeProjectionLookup(input) {
  const value = assertPlainObject(input);
  const allowed = new Set(["walletRef", "accountId"]);
  assertExactDataFields(value, allowed);
  const hasWalletRef = value.walletRef !== undefined;
  const hasAccountId = value.accountId !== undefined;
  if (hasWalletRef === hasAccountId) {
    throw storeError("invalid_wallet_request");
  }
  return hasWalletRef
    ? { walletRef: assertNormalizedString(value.walletRef), accountId: null }
    : { walletRef: null, accountId: assertNormalizedString(value.accountId) };
}

export function createSqliteCoinWalletStore(options = {}) {
  if (
    !options
    || typeof options !== "object"
    || Array.isArray(options)
    || Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw storeError("invalid_store_contract");
  }
  const {
    dbPath,
    database,
    nowFn = () => new Date(),
    refFactory
  } = options;
  const hasDbPath = dbPath !== undefined;
  const hasDatabase = database !== undefined;
  if (
    hasDbPath === hasDatabase
    || typeof nowFn !== "function"
    || (refFactory !== undefined && typeof refFactory !== "function")
    || (hasDbPath && (typeof dbPath !== "string" || !isAbsolute(dbPath)))
  ) {
    throw storeError("invalid_store_contract");
  }

  const makeRef = refFactory ?? ((kind) => `${kind}_${randomUUID()}`);
  let owned;
  let db;
  try {
    if (hasDatabase) {
      db = database;
    } else {
      owned = new Database(dbPath, { fileMustExist: true });
      db = owned;
      db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
      db.pragma("foreign_keys = ON");
    }
    const validation = validateCoinWalletSchema({ database: db });
    if (!validation.ok) throw storeError("coin_wallet_schema_not_ready");
  } catch (error) {
    try {
      owned?.close();
    } catch {
      // Construction still fails closed with one safe code.
    }
    if (isStoreError(error)) throw error;
    if (
      typeof error?.code === "string"
      && (
        error.code.startsWith("SQLITE_BUSY")
        || error.code.startsWith("SQLITE_LOCKED")
      )
    ) {
      throw storeError("wallet_busy");
    }
    throw storeError("coin_wallet_schema_not_ready");
  }

  let closed = false;

  function assertOpen() {
    if (closed) throw storeError("store_closed");
  }

  function read(action) {
    assertOpen();
    try {
      return action();
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function nextRef(kind) {
    let value;
    try {
      value = makeRef(kind);
    } catch {
      throw storeError("invalid_reference");
    }
    if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
      throw storeError("invalid_reference");
    }
    return value;
  }

  function findWalletByRef(walletRef) {
    return mapWallet(db.prepare(`
      select wallet_ref, account_id, status, version, created_at, updated_at
        from platform_coin_wallets
       where wallet_ref = ?
    `).get(walletRef));
  }

  function findWalletByAccountId(accountId) {
    return mapWallet(db.prepare(`
      select wallet_ref, account_id, status, version, created_at, updated_at
        from platform_coin_wallets
       where account_id = ?
    `).get(accountId));
  }

  function findLot(lotRef) {
    return mapLot(db.prepare(`
      select *
        from platform_coin_lots
       where lot_ref = ?
    `).get(lotRef));
  }

  function findReceipt({ actorScope, operationType, idempotencyKey }) {
    return mapReceipt(db.prepare(`
      select *
        from platform_coin_operation_receipts
       where actor_scope = ?
         and operation_type = ?
         and idempotency_key = ?
    `).get(actorScope, operationType, idempotencyKey));
  }

  function buildClosedMutationResult(
    receipt,
    replayed,
    expectedSafeResultCode,
    expectedResultRef = null,
    allowedResultingStatuses = new Set(["active", "frozen", "closed"])
  ) {
    if (
      receipt.status !== "succeeded"
      || receipt.safeResultCode !== expectedSafeResultCode
      || typeof receipt.operationRef !== "string"
      || receipt.operationRef.length === 0
      || receipt.operationRef.trim() !== receipt.operationRef
      || typeof receipt.walletRef !== "string"
      || receipt.walletRef.length === 0
      || receipt.walletRef.trim() !== receipt.walletRef
      || typeof receipt.resultRef !== "string"
      || receipt.resultRef.length === 0
      || receipt.resultRef.trim() !== receipt.resultRef
      || (expectedResultRef !== null && receipt.resultRef !== expectedResultRef)
      || !Number.isSafeInteger(receipt.previousWalletVersion)
      || receipt.previousWalletVersion < 0
      || !Number.isSafeInteger(receipt.resultingWalletVersion)
      || receipt.resultingWalletVersion !== receipt.previousWalletVersion + 1
      || !allowedResultingStatuses.has(receipt.resultingWalletStatus)
      || typeof receipt.completedAt !== "string"
      || Number.isNaN(Date.parse(receipt.completedAt))
      || new Date(receipt.completedAt).toISOString() !== receipt.completedAt
    ) {
      throw storeError("idempotency_unavailable");
    }
    return {
      ok: true,
      replayed,
      operationRef: receipt.operationRef,
      walletRef: receipt.walletRef,
      safeResultCode: receipt.safeResultCode,
      resultRef: receipt.resultRef,
      previousWalletVersion: receipt.previousWalletVersion,
      resultingWalletVersion: receipt.resultingWalletVersion,
      resultingWalletStatus: receipt.resultingWalletStatus
    };
  }

  function buildClosedCreditResult(receipt, replayed) {
    return buildClosedMutationResult(receipt, replayed, SAFE_RESULT_CREDITED);
  }

  function buildClosedConfirmationResult(receipt, replayed, expectedResultRef) {
    return buildClosedMutationResult(
      receipt,
      replayed,
      SAFE_RESULT_CONFIRMED,
      expectedResultRef,
      CONFIRMATION_RESULT_STATUSES
    );
  }

  function buildClosedHoldResult(receipt, replayed, expectedWalletRef) {
    const commonIsValid = (
      typeof receipt?.operationRef === "string"
      && receipt.operationRef.length > 0
      && receipt.operationRef.trim() === receipt.operationRef
      && receipt.walletRef === expectedWalletRef
      && typeof receipt.createdAt === "string"
      && !Number.isNaN(Date.parse(receipt.createdAt))
      && new Date(receipt.createdAt).toISOString() === receipt.createdAt
      && typeof receipt.completedAt === "string"
      && !Number.isNaN(Date.parse(receipt.completedAt))
      && new Date(receipt.completedAt).toISOString() === receipt.completedAt
      && receipt.completedAt === receipt.createdAt
      && Number.isSafeInteger(receipt.previousWalletVersion)
      && receipt.previousWalletVersion >= 0
      && Number.isSafeInteger(receipt.resultingWalletVersion)
      && receipt.resultingWalletStatus === "active"
    );
    const succeededIsValid = (
      receipt?.status === "succeeded"
      && receipt.safeResultCode === SAFE_RESULT_HELD
      && typeof receipt.resultRef === "string"
      && receipt.resultRef.length > 0
      && receipt.resultRef.trim() === receipt.resultRef
      && receipt.resultingWalletVersion === receipt.previousWalletVersion + 1
    );
    const failedIsValid = (
      receipt?.status === "failed"
      && receipt.safeResultCode === SAFE_RESULT_INSUFFICIENT
      && receipt.resultRef === null
      && receipt.resultingWalletVersion === receipt.previousWalletVersion
    );
    if (!commonIsValid || (!succeededIsValid && !failedIsValid)) {
      throw storeError("idempotency_unavailable");
    }
    return {
      ok: receipt.status === "succeeded",
      replayed,
      operationRef: receipt.operationRef,
      walletRef: receipt.walletRef,
      safeResultCode: receipt.safeResultCode,
      resultRef: receipt.resultRef,
      previousWalletVersion: receipt.previousWalletVersion,
      resultingWalletVersion: receipt.resultingWalletVersion,
      resultingWalletStatus: receipt.resultingWalletStatus
    };
  }

  function readLockedDatabaseUtc() {
    const value = db.prepare(`
      select strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).pluck().get();
    try {
      return normalizeTimestamp(value);
    } catch {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function assertLifecycleWallet(wallet) {
    if (
      !wallet
      || !["active", "frozen", "closed"].includes(wallet.status)
      || !Number.isSafeInteger(wallet.version)
      || wallet.version < 0
    ) {
      throw storeError("wallet_infrastructure_error");
    }
    return wallet;
  }

  function assertLifecycleLot(lot) {
    if (
      !lot
      || typeof lot.lotRef !== "string"
      || lot.lotRef.length === 0
      || lot.lotRef.trim() !== lot.lotRef
      || typeof lot.walletRef !== "string"
      || lot.walletRef.length === 0
      || lot.walletRef.trim() !== lot.walletRef
      || !["paid_coins", "bonus_coins", "reward_coins"].includes(lot.coinType)
      || typeof lot.sourceType !== "string"
      || lot.sourceType.length === 0
      || lot.sourceType.trim() !== lot.sourceType
      || typeof lot.sourceRef !== "string"
      || lot.sourceRef.length === 0
      || lot.sourceRef.trim() !== lot.sourceRef
    ) {
      throw storeError("wallet_infrastructure_error");
    }
    const buckets = [
      lot.issuedUnits,
      lot.pendingUnits,
      lot.availableUnits,
      lot.heldUnits,
      lot.consumedUnits,
      lot.reversedUnits,
      lot.expiredUnits
    ];
    if (buckets.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw storeError("wallet_infrastructure_error");
    }
    let projected = 0;
    for (const value of buckets.slice(1)) projected = safeAddUnits(projected, value);
    if (projected !== lot.issuedUnits) {
      throw storeError("wallet_infrastructure_error");
    }
    if (lot.expiresAt !== null) {
      try {
        normalizeTimestamp(lot.expiresAt);
      } catch {
        throw storeError("wallet_infrastructure_error");
      }
    }
    if (
      (lot.coinType !== "bonus_coins" && lot.expiresAt !== null)
      || (lot.coinType !== "reward_coins" && lot.pendingUnits !== 0)
    ) {
      throw storeError("wallet_infrastructure_error");
    }
    return lot;
  }

  function assertLifecycleHold(hold) {
    if (
      !hold
      || typeof hold.holdRef !== "string"
      || hold.holdRef.length === 0
      || hold.holdRef.trim() !== hold.holdRef
      || typeof hold.walletRef !== "string"
      || hold.walletRef.length === 0
      || hold.walletRef.trim() !== hold.walletRef
      || !["product_purchase", "reward_adjustment"].includes(hold.purpose)
      || typeof hold.purposeRef !== "string"
      || hold.purposeRef.length === 0
      || hold.purposeRef.trim() !== hold.purposeRef
      || !Number.isSafeInteger(hold.amountUnits)
      || hold.amountUnits <= 0
      || !HOLD_STATUSES.has(hold.status)
    ) {
      throw storeError("wallet_infrastructure_error");
    }
    try {
      normalizeTimestamp(hold.expiresAt);
    } catch {
      throw storeError("wallet_infrastructure_error");
    }
    return hold;
  }

  function findHold(holdRef) {
    return mapHold(db.prepare(`
      select *
        from platform_coin_holds
       where hold_ref = ?
    `).get(holdRef));
  }

  function loadLifecycleAllocations(hold) {
    const rows = db.prepare(`
      select allocation_ref, hold_ref, lot_ref, allocation_sequence,
             allocated_units, created_at
        from platform_coin_hold_allocations
       where hold_ref = ?
       order by allocation_sequence
    `).all(hold.holdRef);
    if (rows.length === 0) throw storeError("wallet_infrastructure_error");
    let total = 0;
    const seenLots = new Set();
    const allocations = rows.map((row, index) => {
      const lot = assertLifecycleLot(findLot(row.lot_ref));
      if (
        typeof row.allocation_ref !== "string"
        || row.allocation_ref.length === 0
        || row.allocation_ref.trim() !== row.allocation_ref
        || row.hold_ref !== hold.holdRef
        || row.allocation_sequence !== index + 1
        || !Number.isSafeInteger(row.allocated_units)
        || row.allocated_units <= 0
        || seenLots.has(row.lot_ref)
        || lot.walletRef !== hold.walletRef
        || lot.heldUnits < row.allocated_units
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      try {
        normalizeTimestamp(row.created_at);
      } catch {
        throw storeError("wallet_infrastructure_error");
      }
      seenLots.add(row.lot_ref);
      total = safeAddUnits(total, row.allocated_units);
      return {
        allocationRef: row.allocation_ref,
        allocationSequence: row.allocation_sequence,
        allocatedUnits: row.allocated_units,
        lot
      };
    });
    if (total !== hold.amountUnits) {
      throw storeError("wallet_infrastructure_error");
    }
    return allocations;
  }

  function buildClosedLifecycleResult(
    receipt,
    replayed,
    operationType,
    subjectRef
  ) {
    let valid = (
      receipt
      && typeof receipt.operationRef === "string"
      && receipt.operationRef.length > 0
      && receipt.operationRef.trim() === receipt.operationRef
      && typeof receipt.walletRef === "string"
      && receipt.walletRef.length > 0
      && receipt.walletRef.trim() === receipt.walletRef
      && Number.isSafeInteger(receipt.previousWalletVersion)
      && receipt.previousWalletVersion >= 0
      && Number.isSafeInteger(receipt.resultingWalletVersion)
      && ["active", "frozen", "closed"].includes(receipt.resultingWalletStatus)
      && typeof receipt.createdAt === "string"
      && typeof receipt.completedAt === "string"
      && receipt.createdAt === receipt.completedAt
    );
    if (valid) {
      try {
        normalizeTimestamp(receipt.createdAt);
      } catch {
        valid = false;
      }
    }
    if (valid && operationType === OPERATION_TYPE_CAPTURE_HOLD) {
      valid = (
        (
          receipt.status === "succeeded"
          && receipt.safeResultCode === SAFE_RESULT_CAPTURED
          && receipt.resultRef === subjectRef
          && receipt.resultingWalletVersion === receipt.previousWalletVersion + 1
        )
        || (
          receipt.status === "failed"
          && receipt.safeResultCode === SAFE_RESULT_HOLD_EXPIRED
          && receipt.resultRef === null
          && receipt.resultingWalletVersion === receipt.previousWalletVersion
        )
      ) && receipt.resultingWalletStatus === "active";
    } else if (valid && operationType === OPERATION_TYPE_RELEASE_HOLD) {
      valid = (
        receipt.status === "succeeded"
        && receipt.safeResultCode === SAFE_RESULT_RELEASED
        && receipt.resultRef === subjectRef
        && receipt.resultingWalletVersion === receipt.previousWalletVersion + 1
      );
    } else if (
      valid
      && (
        operationType === OPERATION_TYPE_EXPIRE_HOLD
        || operationType === OPERATION_TYPE_EXPIRE_LOT
      )
    ) {
      valid = (
        receipt.status === "succeeded"
        && receipt.resultRef === subjectRef
        && (
          (
            receipt.safeResultCode === SAFE_RESULT_EXPIRED
            && receipt.resultingWalletVersion
              === receipt.previousWalletVersion + 1
          )
          || (
            receipt.safeResultCode === SAFE_RESULT_EXPIRY_PROCESSED
            && receipt.resultingWalletVersion === receipt.previousWalletVersion
          )
        )
      );
    } else {
      valid = false;
    }
    if (!valid) throw storeError("idempotency_unavailable");
    return {
      ok: receipt.status === "succeeded",
      replayed,
      operationRef: receipt.operationRef,
      walletRef: receipt.walletRef,
      safeResultCode: receipt.safeResultCode,
      resultRef: receipt.resultRef,
      previousWalletVersion: receipt.previousWalletVersion,
      resultingWalletVersion: receipt.resultingWalletVersion,
      resultingWalletStatus: receipt.resultingWalletStatus
    };
  }

  function insertStartedLifecycleReceipt({
    operationRef,
    walletRef,
    actorScope,
    operationType,
    idempotencyKey,
    requestDigest,
    occurredAt
  }) {
    const inserted = db.prepare(`
      insert into platform_coin_operation_receipts (
        operation_ref, wallet_ref, actor_scope, operation_type,
        idempotency_key, request_digest, status, result_ref,
        safe_result_code, created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
    `).run(
      operationRef,
      walletRef,
      actorScope,
      operationType,
      idempotencyKey,
      requestDigest,
      occurredAt
    );
    if (inserted.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function completeLifecycleReceipt({
    operationRef,
    status,
    previousWalletVersion,
    resultingWalletVersion,
    resultingWalletStatus,
    resultRef,
    safeResultCode,
    occurredAt
  }) {
    const completed = db.prepare(`
      update platform_coin_operation_receipts
         set status = ?,
             previous_wallet_version = ?,
             resulting_wallet_version = ?,
             resulting_wallet_status = ?,
             result_ref = ?,
             safe_result_code = ?,
             completed_at = ?
       where operation_ref = ?
         and status = 'started'
    `).run(
      status,
      previousWalletVersion,
      resultingWalletVersion,
      resultingWalletStatus,
      resultRef,
      safeResultCode,
      occurredAt,
      operationRef
    );
    if (completed.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function assertWalletAggregateCanCredit(walletRef, amountUnits) {
    const aggregate = db.prepare(`
      select count(*) as lot_count,
             coalesce(sum(issued_units), 0) as total_issued_units
        from platform_coin_lots
       where wallet_ref = ?
    `).get(walletRef);
    if (
      !Number.isSafeInteger(aggregate.lot_count)
      || aggregate.lot_count < 0
      || !Number.isSafeInteger(aggregate.total_issued_units)
      || aggregate.total_issued_units < 0
    ) {
      throw storeError("coin_units_overflow");
    }
    safeAddUnits(aggregate.total_issued_units, amountUnits);
  }

  const runCreditTransaction = db.transaction((request, occurredAt) => {
    const replay = findReceipt({
      actorScope: request.operation.actorScope,
      operationType: OPERATION_TYPE_CREDIT,
      idempotencyKey: request.operation.idempotencyKey
    });
    if (replay) {
      if (replay.requestDigest !== request.requestDigest) {
        throw storeError("idempotency_conflict");
      }
      return buildClosedCreditResult(replay, true);
    }

    let wallet = findWalletByAccountId(request.accountId);
    const operationRef = nextRef("operation");
    db.prepare(`
      insert into platform_coin_operation_receipts (
        operation_ref, wallet_ref, actor_scope, operation_type,
        idempotency_key, request_digest, status, result_ref,
        safe_result_code, created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
    `).run(
      operationRef,
      wallet?.walletRef ?? null,
      request.operation.actorScope,
      OPERATION_TYPE_CREDIT,
      request.operation.idempotencyKey,
      request.requestDigest,
      occurredAt
    );

    if (!wallet) {
      const accountExists = db.prepare(
        "select 1 from platform_accounts where id = ?"
      ).pluck().get(request.accountId);
      if (!accountExists) throw storeError("account_not_found");
      const walletRef = nextRef("wallet");
      db.prepare(`
        insert into platform_coin_wallets (
          wallet_ref, account_id, status, version, created_at, updated_at
        ) values (?, ?, 'active', 0, ?, ?)
      `).run(walletRef, request.accountId, occurredAt, occurredAt);
      wallet = findWalletByRef(walletRef);
      const attached = db.prepare(`
        update platform_coin_operation_receipts
           set wallet_ref = ?
         where operation_ref = ?
           and status = 'started'
           and wallet_ref is null
      `).run(wallet.walletRef, operationRef);
      if (attached.changes !== 1) {
        throw storeError("wallet_infrastructure_error");
      }
    }
    if (!Number.isSafeInteger(wallet.version) || wallet.version >= Number.MAX_SAFE_INTEGER) {
      throw storeError("coin_units_overflow");
    }

    const existingOrigin = db.prepare(`
      select 1
        from platform_coin_credit_origins
       where wallet_ref = ?
         and coin_type = ?
         and source_type = ?
         and source_ref = ?
    `).pluck().get(
      wallet.walletRef,
      request.coinType,
      request.sourceType,
      request.sourceRef
    );
    if (existingOrigin) throw storeError("credit_origin_conflict");
    assertWalletAggregateCanCredit(wallet.walletRef, request.amountUnits);

    const creditOriginRef = nextRef("credit_origin");
    const lotRef = nextRef("lot");
    db.prepare(`
      insert into platform_coin_credit_origins (
        credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
        source_digest, operation_ref, lot_ref, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      creditOriginRef,
      wallet.walletRef,
      request.coinType,
      request.sourceType,
      request.sourceRef,
      request.sourceDigest,
      operationRef,
      lotRef,
      occurredAt
    );
    db.prepare(`
      insert into platform_coin_lots (
        lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
        pending_units, available_units, held_units, consumed_units,
        reversed_units, expired_units, source_type, source_ref,
        policy_ref, policy_version, expires_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lotRef,
      wallet.walletRef,
      request.coinType,
      creditOriginRef,
      request.amountUnits,
      request.availability === "pending" ? request.amountUnits : 0,
      request.availability === "available" ? request.amountUnits : 0,
      request.sourceType,
      request.sourceRef,
      request.policyRef,
      request.policyVersion,
      request.expiresAt,
      occurredAt,
      occurredAt
    );

    const previousWalletVersion = wallet.version;
    const resultingWalletVersion = previousWalletVersion + 1;
    const updated = db.prepare(`
      update platform_coin_wallets
         set version = ?,
             updated_at = ?
       where wallet_ref = ?
         and version = ?
    `).run(
      resultingWalletVersion,
      occurredAt,
      wallet.walletRef,
      previousWalletVersion
    );
    if (updated.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }

    const entryRef = nextRef("ledger_entry");
    db.prepare(`
      insert into platform_coin_ledger_entries (
        entry_ref, operation_ref, wallet_ref, lot_ref, operation,
        amount_units, hold_ref, order_ref, source_type, source_ref,
        actor_type, actor_ref, previous_wallet_version,
        resulting_wallet_version, resulting_wallet_status, occurred_at
      ) values (?, ?, ?, ?, 'credit', ?, null, null, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryRef,
      operationRef,
      wallet.walletRef,
      lotRef,
      request.amountUnits,
      request.sourceType,
      request.sourceRef,
      request.operation.actorType,
      request.operation.actorRef,
      previousWalletVersion,
      resultingWalletVersion,
      wallet.status,
      occurredAt
    );
    const completed = db.prepare(`
      update platform_coin_operation_receipts
         set status = 'succeeded',
             previous_wallet_version = ?,
             resulting_wallet_version = ?,
             resulting_wallet_status = ?,
             result_ref = ?,
             safe_result_code = ?,
             completed_at = ?
       where operation_ref = ?
         and status = 'started'
    `).run(
      previousWalletVersion,
      resultingWalletVersion,
      wallet.status,
      lotRef,
      SAFE_RESULT_CREDITED,
      occurredAt,
      operationRef
    );
    if (completed.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }

    const closedReceipt = findReceipt({
      actorScope: request.operation.actorScope,
      operationType: OPERATION_TYPE_CREDIT,
      idempotencyKey: request.operation.idempotencyKey
    });
    return buildClosedCreditResult(closedReceipt, false);
  });

  const runConfirmCreditTransaction = db.transaction((request) => {
    const replay = findReceipt({
      actorScope: request.operation.actorScope,
      operationType: OPERATION_TYPE_CONFIRM_CREDIT,
      idempotencyKey: request.operation.idempotencyKey
    });
    if (replay) {
      if (replay.requestDigest !== request.requestDigest) {
        throw storeError("idempotency_conflict");
      }
      return buildClosedConfirmationResult(replay, true, request.lotRef);
    }

    const lot = findLot(request.lotRef);
    if (!lot) throw storeError("lot_not_found");
    const wallet = findWalletByRef(lot.walletRef);
    if (!wallet) throw storeError("wallet_infrastructure_error");
    if (wallet.status !== "active" && wallet.status !== "frozen") {
      throw storeError("wallet_not_active");
    }
    if (
      lot.coinType !== "reward_coins"
      || !Number.isSafeInteger(lot.pendingUnits)
      || lot.pendingUnits < request.amountUnits
      || !Number.isSafeInteger(lot.availableUnits)
      || lot.availableUnits < 0
    ) {
      throw storeError("coin_credit_not_confirmable");
    }
    if (!Number.isSafeInteger(wallet.version) || wallet.version >= Number.MAX_SAFE_INTEGER) {
      throw storeError("wallet_infrastructure_error");
    }
    const resultingAvailableUnits = safeAddUnits(
      lot.availableUnits,
      request.amountUnits
    );
    const resultingPendingUnits = lot.pendingUnits - request.amountUnits;
    const databaseTimestamp = db.prepare(`
      select strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).pluck().get();
    let occurredAt;
    try {
      occurredAt = normalizeTimestamp(databaseTimestamp);
    } catch {
      throw storeError("wallet_infrastructure_error");
    }

    const operationRef = nextRef("operation");
    db.prepare(`
      insert into platform_coin_operation_receipts (
        operation_ref, wallet_ref, actor_scope, operation_type,
        idempotency_key, request_digest, status, result_ref,
        safe_result_code, created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
    `).run(
      operationRef,
      wallet.walletRef,
      request.operation.actorScope,
      OPERATION_TYPE_CONFIRM_CREDIT,
      request.operation.idempotencyKey,
      request.requestDigest,
      occurredAt
    );

    const updatedLot = db.prepare(`
      update platform_coin_lots
         set pending_units = ?,
             available_units = ?,
             updated_at = ?
       where lot_ref = ?
         and wallet_ref = ?
         and coin_type = 'reward_coins'
         and pending_units = ?
         and available_units = ?
    `).run(
      resultingPendingUnits,
      resultingAvailableUnits,
      occurredAt,
      lot.lotRef,
      wallet.walletRef,
      lot.pendingUnits,
      lot.availableUnits
    );
    if (updatedLot.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }

    const previousWalletVersion = wallet.version;
    const resultingWalletVersion = previousWalletVersion + 1;
    const updatedWallet = db.prepare(`
      update platform_coin_wallets
         set version = ?,
             updated_at = ?
       where wallet_ref = ?
         and version = ?
    `).run(
      resultingWalletVersion,
      occurredAt,
      wallet.walletRef,
      previousWalletVersion
    );
    if (updatedWallet.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }

    const entryRef = nextRef("ledger_entry");
    db.prepare(`
      insert into platform_coin_ledger_entries (
        entry_ref, operation_ref, wallet_ref, lot_ref, operation,
        amount_units, hold_ref, order_ref, source_type, source_ref,
        actor_type, actor_ref, previous_wallet_version,
        resulting_wallet_version, resulting_wallet_status, occurred_at
      ) values (
        ?, ?, ?, ?, 'pending_to_available', ?, null, null, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      entryRef,
      operationRef,
      wallet.walletRef,
      lot.lotRef,
      request.amountUnits,
      lot.sourceType,
      lot.sourceRef,
      request.operation.actorType,
      request.operation.actorRef,
      previousWalletVersion,
      resultingWalletVersion,
      wallet.status,
      occurredAt
    );

    const completed = db.prepare(`
      update platform_coin_operation_receipts
         set status = 'succeeded',
             previous_wallet_version = ?,
             resulting_wallet_version = ?,
             resulting_wallet_status = ?,
             result_ref = ?,
             safe_result_code = ?,
             completed_at = ?
       where operation_ref = ?
         and status = 'started'
    `).run(
      previousWalletVersion,
      resultingWalletVersion,
      wallet.status,
      lot.lotRef,
      SAFE_RESULT_CONFIRMED,
      occurredAt,
      operationRef
    );
    if (completed.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }

    const closedReceipt = findReceipt({
      actorScope: request.operation.actorScope,
      operationType: OPERATION_TYPE_CONFIRM_CREDIT,
      idempotencyKey: request.operation.idempotencyKey
    });
    return buildClosedConfirmationResult(closedReceipt, false, request.lotRef);
  });

  function createCoinHoldBody(request) {
    const replay = findReceipt({
      actorScope: request.operation.actorScope,
      operationType: OPERATION_TYPE_CREATE_HOLD,
      idempotencyKey: request.operation.idempotencyKey
    });
    if (replay) {
      if (replay.requestDigest !== request.requestDigest) {
        throw storeError("idempotency_conflict");
      }
      return buildClosedHoldResult(replay, true, request.walletRef);
    }

    const wallet = findWalletByRef(request.walletRef);
    if (!wallet) throw storeError("wallet_not_found");
    if (wallet.status !== "active") throw storeError("wallet_not_active");
    if (
      !Number.isSafeInteger(wallet.version)
      || wallet.version < 0
      || wallet.version >= Number.MAX_SAFE_INTEGER
    ) {
      throw storeError("coin_units_overflow");
    }

    const lockedTimestamp = db.prepare(`
      select strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).pluck().get();
    let occurredAt;
    try {
      occurredAt = normalizeTimestamp(lockedTimestamp);
    } catch {
      throw storeError("wallet_infrastructure_error");
    }
    if (request.expiresAt <= occurredAt) {
      throw storeError("invalid_coin_expiry");
    }

    const operationRef = nextRef("operation");
    db.prepare(`
      insert into platform_coin_operation_receipts (
        operation_ref, wallet_ref, actor_scope, operation_type,
        idempotency_key, request_digest, status, result_ref,
        safe_result_code, created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
    `).run(
      operationRef,
      wallet.walletRef,
      request.operation.actorScope,
      OPERATION_TYPE_CREATE_HOLD,
      request.operation.idempotencyKey,
      request.requestDigest,
      occurredAt
    );

    const placeholders = request.acceptedCoinTypes.map(() => "?").join(", ");
    const lots = db.prepare(`
      select *
        from platform_coin_lots
       where wallet_ref = ?
         and available_units > 0
         and coin_type in (${placeholders})
         and (
           coin_type <> 'bonus_coins'
           or expires_at is null
           or expires_at > ?
         )
    `).all(
      wallet.walletRef,
      ...request.acceptedCoinTypes,
      occurredAt
    ).map(mapLot);

    let allocations;
    try {
      allocations = allocateCoinLots({
        lots,
        amountUnits: request.amountUnits,
        acceptedCoinTypes: request.acceptedCoinTypes,
        now: occurredAt
      });
    } catch {
      throw storeError("wallet_infrastructure_error");
    }

    if (!Array.isArray(allocations)) {
      throw storeError("wallet_infrastructure_error");
    }
    let eligibleAvailableUnits = 0;
    for (const lot of lots) {
      if (
        !Number.isSafeInteger(lot.availableUnits)
        || lot.availableUnits < 0
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      eligibleAvailableUnits = safeAddUnits(
        eligibleAvailableUnits,
        lot.availableUnits
      );
    }
    if (allocations.length === 0) {
      if (eligibleAvailableUnits >= request.amountUnits) {
        throw storeError("wallet_infrastructure_error");
      }
      const failed = db.prepare(`
        update platform_coin_operation_receipts
           set status = 'failed',
               previous_wallet_version = ?,
               resulting_wallet_version = ?,
               resulting_wallet_status = 'active',
               result_ref = null,
               safe_result_code = ?,
               completed_at = ?
         where operation_ref = ?
           and status = 'started'
      `).run(
        wallet.version,
        wallet.version,
        SAFE_RESULT_INSUFFICIENT,
        occurredAt,
        operationRef
      );
      if (failed.changes !== 1) {
        throw storeError("wallet_infrastructure_error");
      }
      return buildClosedHoldResult(findReceipt({
        actorScope: request.operation.actorScope,
        operationType: OPERATION_TYPE_CREATE_HOLD,
        idempotencyKey: request.operation.idempotencyKey
      }), false, wallet.walletRef);
    }

    const preparedAllocations = prepareHoldAllocations({
      allocations,
      lots,
      walletRef: wallet.walletRef,
      acceptedCoinTypes: request.acceptedCoinTypes,
      amountUnits: request.amountUnits
    });

    const holdRef = nextRef("hold");
    const referencedAllocations = preparedAllocations.map((allocation) => ({
      ...allocation,
      allocationRef: nextRef("allocation"),
      ledgerEntryRef: nextRef("ledger_entry")
    }));

    for (const allocation of referencedAllocations) {
      const updatedLot = db.prepare(`
        update platform_coin_lots
           set available_units = ?,
               held_units = ?,
               updated_at = ?
         where lot_ref = ?
           and wallet_ref = ?
           and available_units = ?
           and held_units = ?
      `).run(
        allocation.resultingAvailableUnits,
        allocation.resultingHeldUnits,
        occurredAt,
        allocation.lot.lotRef,
        wallet.walletRef,
        allocation.lot.availableUnits,
        allocation.lot.heldUnits
      );
      if (updatedLot.changes !== 1) {
        throw storeError("wallet_infrastructure_error");
      }
    }

    db.prepare(`
      insert into platform_coin_holds (
        hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
        expires_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      holdRef,
      wallet.walletRef,
      request.purpose,
      request.purposeRef,
      request.amountUnits,
      request.expiresAt,
      occurredAt,
      occurredAt
    );
    const insertAllocation = db.prepare(`
      insert into platform_coin_hold_allocations (
        allocation_ref, hold_ref, lot_ref, allocation_sequence,
        allocated_units, created_at
      ) values (?, ?, ?, ?, ?, ?)
    `);
    for (const allocation of referencedAllocations) {
      const inserted = insertAllocation.run(
        allocation.allocationRef,
        holdRef,
        allocation.lot.lotRef,
        allocation.allocationSequence,
        allocation.allocatedUnits,
        occurredAt
      );
      if (inserted.changes !== 1) {
        throw storeError("wallet_infrastructure_error");
      }
    }

    const previousWalletVersion = wallet.version;
    const resultingWalletVersion = previousWalletVersion + 1;
    const updatedWallet = db.prepare(`
      update platform_coin_wallets
         set version = ?,
             updated_at = ?
       where wallet_ref = ?
         and status = 'active'
         and version = ?
    `).run(
      resultingWalletVersion,
      occurredAt,
      wallet.walletRef,
      previousWalletVersion
    );
    if (updatedWallet.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }

    const insertLedger = db.prepare(`
      insert into platform_coin_ledger_entries (
        entry_ref, operation_ref, wallet_ref, lot_ref, operation,
        amount_units, hold_ref, order_ref, source_type, source_ref,
        actor_type, actor_ref, previous_wallet_version,
        resulting_wallet_version, resulting_wallet_status, occurred_at
      ) values (
        ?, ?, ?, ?, 'available_to_held', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?
      )
    `);
    for (const allocation of referencedAllocations) {
      const inserted = insertLedger.run(
        allocation.ledgerEntryRef,
        operationRef,
        wallet.walletRef,
        allocation.lot.lotRef,
        allocation.allocatedUnits,
        holdRef,
        request.purpose === "product_purchase" ? request.purposeRef : null,
        allocation.lot.sourceType,
        allocation.lot.sourceRef,
        request.operation.actorType,
        request.operation.actorRef,
        previousWalletVersion,
        resultingWalletVersion,
        occurredAt
      );
      if (inserted.changes !== 1) {
        throw storeError("wallet_infrastructure_error");
      }
    }

    const completed = db.prepare(`
      update platform_coin_operation_receipts
         set status = 'succeeded',
             previous_wallet_version = ?,
             resulting_wallet_version = ?,
             resulting_wallet_status = 'active',
             result_ref = ?,
             safe_result_code = ?,
             completed_at = ?
       where operation_ref = ?
         and status = 'started'
    `).run(
      previousWalletVersion,
      resultingWalletVersion,
      holdRef,
      SAFE_RESULT_HELD,
      occurredAt,
      operationRef
    );
    if (completed.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
    return buildClosedHoldResult(findReceipt({
      actorScope: request.operation.actorScope,
      operationType: OPERATION_TYPE_CREATE_HOLD,
      idempotencyKey: request.operation.idempotencyKey
    }), false, wallet.walletRef);
  }

  const runCreateHoldTransaction = db.transaction(createCoinHoldBody);

  function updateLifecycleLot({
    lot,
    resultingAvailableUnits,
    resultingHeldUnits,
    resultingConsumedUnits,
    resultingExpiredUnits,
    occurredAt
  }) {
    const updated = db.prepare(`
      update platform_coin_lots
         set available_units = ?,
             held_units = ?,
             consumed_units = ?,
             expired_units = ?,
             updated_at = ?
       where lot_ref = ?
         and wallet_ref = ?
         and pending_units = ?
         and available_units = ?
         and held_units = ?
         and consumed_units = ?
         and reversed_units = ?
         and expired_units = ?
         and expires_at is ?
    `).run(
      resultingAvailableUnits,
      resultingHeldUnits,
      resultingConsumedUnits,
      resultingExpiredUnits,
      occurredAt,
      lot.lotRef,
      lot.walletRef,
      lot.pendingUnits,
      lot.availableUnits,
      lot.heldUnits,
      lot.consumedUnits,
      lot.reversedUnits,
      lot.expiredUnits,
      lot.expiresAt
    );
    if (updated.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function updateLifecycleHold({
    hold,
    resultingStatus,
    occurredAt
  }) {
    const updated = db.prepare(`
      update platform_coin_holds
         set status = ?,
             updated_at = ?
       where hold_ref = ?
         and wallet_ref = ?
         and status = 'active'
         and expires_at is ?
    `).run(
      resultingStatus,
      occurredAt,
      hold.holdRef,
      hold.walletRef,
      hold.expiresAt
    );
    if (updated.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function updateLifecycleWallet({
    wallet,
    resultingWalletVersion,
    occurredAt
  }) {
    const updated = db.prepare(`
      update platform_coin_wallets
         set version = ?,
             updated_at = ?
       where wallet_ref = ?
         and status = ?
         and version = ?
    `).run(
      resultingWalletVersion,
      occurredAt,
      wallet.walletRef,
      wallet.status,
      wallet.version
    );
    if (updated.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function insertLifecycleLedger({
    entryRef,
    operationRef,
    wallet,
    lot,
    operation,
    amountUnits,
    holdRef,
    orderRef,
    actorType,
    actorRef,
    previousWalletVersion,
    resultingWalletVersion,
    occurredAt
  }) {
    const inserted = db.prepare(`
      insert into platform_coin_ledger_entries (
        entry_ref, operation_ref, wallet_ref, lot_ref, operation,
        amount_units, hold_ref, order_ref, source_type, source_ref,
        actor_type, actor_ref, previous_wallet_version,
        resulting_wallet_version, resulting_wallet_status, occurred_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryRef,
      operationRef,
      wallet.walletRef,
      lot.lotRef,
      operation,
      amountUnits,
      holdRef,
      orderRef,
      lot.sourceType,
      lot.sourceRef,
      actorType,
      actorRef,
      previousWalletVersion,
      resultingWalletVersion,
      wallet.status,
      occurredAt
    );
    if (inserted.changes !== 1) {
      throw storeError("wallet_infrastructure_error");
    }
  }

  function readLifecycleReplay({
    actorScope,
    operationType,
    idempotencyKey,
    requestDigest,
    subjectRef
  }) {
    const receipt = findReceipt({
      actorScope,
      operationType,
      idempotencyKey
    });
    if (!receipt) return null;
    if (receipt.requestDigest !== requestDigest) {
      throw storeError("idempotency_conflict");
    }
    return buildClosedLifecycleResult(
      receipt,
      true,
      operationType,
      subjectRef
    );
  }

  function closeLifecycleResult({
    actorScope,
    operationType,
    idempotencyKey,
    subjectRef
  }) {
    return buildClosedLifecycleResult(
      findReceipt({ actorScope, operationType, idempotencyKey }),
      false,
      operationType,
      subjectRef
    );
  }

  function holdLifecycleBody(
    request,
    operationType
  ) {
    const replay = readLifecycleReplay({
      actorScope: request.operation.actorScope,
      operationType,
      idempotencyKey: request.operation.idempotencyKey,
      requestDigest: request.requestDigest,
      subjectRef: request.holdRef
    });
    if (replay) return replay;

    const hold = findHold(request.holdRef);
    if (!hold) throw storeError("hold_not_found");
    assertLifecycleHold(hold);
    if (hold.status !== "active") {
      throw storeError("coin_hold_not_active");
    }
    const wallet = assertLifecycleWallet(findWalletByRef(hold.walletRef));
    if (
      operationType === OPERATION_TYPE_CAPTURE_HOLD
      && wallet.status !== "active"
    ) {
      throw storeError("wallet_not_active");
    }
    const allocations = loadLifecycleAllocations(hold);
    const occurredAt = readLockedDatabaseUtc();

    if (
      operationType === OPERATION_TYPE_CAPTURE_HOLD
      && occurredAt >= hold.expiresAt
    ) {
      const operationRef = nextRef("operation");
      insertStartedLifecycleReceipt({
        operationRef,
        walletRef: wallet.walletRef,
        actorScope: request.operation.actorScope,
        operationType,
        idempotencyKey: request.operation.idempotencyKey,
        requestDigest: request.requestDigest,
        occurredAt
      });
      completeLifecycleReceipt({
        operationRef,
        status: "failed",
        previousWalletVersion: wallet.version,
        resultingWalletVersion: wallet.version,
        resultingWalletStatus: wallet.status,
        resultRef: null,
        safeResultCode: SAFE_RESULT_HOLD_EXPIRED,
        occurredAt
      });
      return closeLifecycleResult({
        actorScope: request.operation.actorScope,
        operationType,
        idempotencyKey: request.operation.idempotencyKey,
        subjectRef: request.holdRef
      });
    }

    const resultingWalletVersion = safeAddUnits(wallet.version, 1);
    const prepared = allocations.map((allocation) => {
      const { lot, allocatedUnits } = allocation;
      const dueBonus = (
        lot.coinType === "bonus_coins"
        && lot.expiresAt !== null
        && lot.expiresAt <= occurredAt
      );
      return {
        ...allocation,
        entryRef: nextRef("ledger_entry"),
        resultingAvailableUnits: (
          operationType === OPERATION_TYPE_RELEASE_HOLD && !dueBonus
            ? safeAddUnits(lot.availableUnits, allocatedUnits)
            : lot.availableUnits
        ),
        resultingHeldUnits: lot.heldUnits - allocatedUnits,
        resultingConsumedUnits: (
          operationType === OPERATION_TYPE_CAPTURE_HOLD
            ? safeAddUnits(lot.consumedUnits, allocatedUnits)
            : lot.consumedUnits
        ),
        resultingExpiredUnits: (
          operationType === OPERATION_TYPE_RELEASE_HOLD && dueBonus
            ? safeAddUnits(lot.expiredUnits, allocatedUnits)
            : lot.expiredUnits
        ),
        ledgerOperation: (
          operationType === OPERATION_TYPE_CAPTURE_HOLD
            ? "held_to_consumed"
            : dueBonus
              ? "held_to_expired"
              : "held_to_available"
        )
      };
    });
    const operationRef = nextRef("operation");

    insertStartedLifecycleReceipt({
      operationRef,
      walletRef: wallet.walletRef,
      actorScope: request.operation.actorScope,
      operationType,
      idempotencyKey: request.operation.idempotencyKey,
      requestDigest: request.requestDigest,
      occurredAt
    });
    for (const allocation of prepared) {
      updateLifecycleLot({
        lot: allocation.lot,
        resultingAvailableUnits: allocation.resultingAvailableUnits,
        resultingHeldUnits: allocation.resultingHeldUnits,
        resultingConsumedUnits: allocation.resultingConsumedUnits,
        resultingExpiredUnits: allocation.resultingExpiredUnits,
        occurredAt
      });
    }
    updateLifecycleHold({
      hold,
      resultingStatus: (
        operationType === OPERATION_TYPE_CAPTURE_HOLD
          ? "captured"
          : "released"
      ),
      occurredAt
    });
    updateLifecycleWallet({
      wallet,
      resultingWalletVersion,
      occurredAt
    });
    for (const allocation of prepared) {
      insertLifecycleLedger({
        entryRef: allocation.entryRef,
        operationRef,
        wallet,
        lot: allocation.lot,
        operation: allocation.ledgerOperation,
        amountUnits: allocation.allocatedUnits,
        holdRef: hold.holdRef,
        orderRef: hold.purpose === "product_purchase" ? hold.purposeRef : null,
        actorType: request.operation.actorType,
        actorRef: request.operation.actorRef,
        previousWalletVersion: wallet.version,
        resultingWalletVersion,
        occurredAt
      });
    }
    completeLifecycleReceipt({
      operationRef,
      status: "succeeded",
      previousWalletVersion: wallet.version,
      resultingWalletVersion,
      resultingWalletStatus: wallet.status,
      resultRef: hold.holdRef,
      safeResultCode: (
        operationType === OPERATION_TYPE_CAPTURE_HOLD
          ? SAFE_RESULT_CAPTURED
          : SAFE_RESULT_RELEASED
      ),
      occurredAt
    });
    return closeLifecycleResult({
      actorScope: request.operation.actorScope,
      operationType,
      idempotencyKey: request.operation.idempotencyKey,
      subjectRef: request.holdRef
    });
  }

  const runHoldLifecycleTransaction = db.transaction(holdLifecycleBody);

  const runExpireHoldTransaction = db.transaction((holdRef) => {
    const hold = findHold(holdRef);
    if (!hold) throw storeError("hold_not_found");
    assertLifecycleHold(hold);
    const idempotencyKey = `hold-expiry:${hold.holdRef}:${hold.expiresAt}`;
    const requestDigest = canonicalWalletRequestDigest(
      OPERATION_TYPE_EXPIRE_HOLD,
      { holdRef: hold.holdRef, expiresAt: hold.expiresAt }
    );
    const replay = readLifecycleReplay({
      actorScope: EXPIRY_ACTOR_SCOPE,
      operationType: OPERATION_TYPE_EXPIRE_HOLD,
      idempotencyKey,
      requestDigest,
      subjectRef: hold.holdRef
    });
    if (replay) return replay;

    const wallet = assertLifecycleWallet(findWalletByRef(hold.walletRef));
    const occurredAt = readLockedDatabaseUtc();
    if (occurredAt < hold.expiresAt) throw storeError("not_due");

    if (hold.status !== "active") {
      const operationRef = nextRef("operation");
      insertStartedLifecycleReceipt({
        operationRef,
        walletRef: wallet.walletRef,
        actorScope: EXPIRY_ACTOR_SCOPE,
        operationType: OPERATION_TYPE_EXPIRE_HOLD,
        idempotencyKey,
        requestDigest,
        occurredAt
      });
      completeLifecycleReceipt({
        operationRef,
        status: "succeeded",
        previousWalletVersion: wallet.version,
        resultingWalletVersion: wallet.version,
        resultingWalletStatus: wallet.status,
        resultRef: hold.holdRef,
        safeResultCode: SAFE_RESULT_EXPIRY_PROCESSED,
        occurredAt
      });
      return closeLifecycleResult({
        actorScope: EXPIRY_ACTOR_SCOPE,
        operationType: OPERATION_TYPE_EXPIRE_HOLD,
        idempotencyKey,
        subjectRef: hold.holdRef
      });
    }

    const allocations = loadLifecycleAllocations(hold);
    const resultingWalletVersion = safeAddUnits(wallet.version, 1);
    const operationRef = nextRef("operation");
    const prepared = allocations.map((allocation) => {
      const dueBonus = (
        allocation.lot.coinType === "bonus_coins"
        && allocation.lot.expiresAt !== null
        && allocation.lot.expiresAt <= occurredAt
      );
      return {
        ...allocation,
        entryRef: nextRef("ledger_entry"),
        resultingAvailableUnits: dueBonus
          ? allocation.lot.availableUnits
          : safeAddUnits(
            allocation.lot.availableUnits,
            allocation.allocatedUnits
          ),
        resultingHeldUnits:
          allocation.lot.heldUnits - allocation.allocatedUnits,
        resultingConsumedUnits: allocation.lot.consumedUnits,
        resultingExpiredUnits: dueBonus
          ? safeAddUnits(
            allocation.lot.expiredUnits,
            allocation.allocatedUnits
          )
          : allocation.lot.expiredUnits,
        ledgerOperation: dueBonus
          ? "held_to_expired"
          : "held_to_available"
      };
    });

    insertStartedLifecycleReceipt({
      operationRef,
      walletRef: wallet.walletRef,
      actorScope: EXPIRY_ACTOR_SCOPE,
      operationType: OPERATION_TYPE_EXPIRE_HOLD,
      idempotencyKey,
      requestDigest,
      occurredAt
    });
    for (const allocation of prepared) {
      updateLifecycleLot({
        lot: allocation.lot,
        resultingAvailableUnits: allocation.resultingAvailableUnits,
        resultingHeldUnits: allocation.resultingHeldUnits,
        resultingConsumedUnits: allocation.resultingConsumedUnits,
        resultingExpiredUnits: allocation.resultingExpiredUnits,
        occurredAt
      });
    }
    updateLifecycleHold({
      hold,
      resultingStatus: "expired",
      occurredAt
    });
    updateLifecycleWallet({
      wallet,
      resultingWalletVersion,
      occurredAt
    });
    for (const allocation of prepared) {
      insertLifecycleLedger({
        entryRef: allocation.entryRef,
        operationRef,
        wallet,
        lot: allocation.lot,
        operation: allocation.ledgerOperation,
        amountUnits: allocation.allocatedUnits,
        holdRef: hold.holdRef,
        orderRef: hold.purpose === "product_purchase" ? hold.purposeRef : null,
        actorType: EXPIRY_ACTOR_TYPE,
        actorRef: EXPIRY_ACTOR_REF,
        previousWalletVersion: wallet.version,
        resultingWalletVersion,
        occurredAt
      });
    }
    completeLifecycleReceipt({
      operationRef,
      status: "succeeded",
      previousWalletVersion: wallet.version,
      resultingWalletVersion,
      resultingWalletStatus: wallet.status,
      resultRef: hold.holdRef,
      safeResultCode: SAFE_RESULT_EXPIRED,
      occurredAt
    });
    return closeLifecycleResult({
      actorScope: EXPIRY_ACTOR_SCOPE,
      operationType: OPERATION_TYPE_EXPIRE_HOLD,
      idempotencyKey,
      subjectRef: hold.holdRef
    });
  });

  const runExpireLotTransaction = db.transaction((lotRef) => {
    const lot = findLot(lotRef);
    if (!lot) throw storeError("lot_not_found");
    assertLifecycleLot(lot);
    if (lot.coinType !== "bonus_coins" || lot.expiresAt === null) {
      throw storeError("coin_lot_not_expirable");
    }
    const idempotencyKey = `lot-expiry:${lot.lotRef}:${lot.expiresAt}`;
    const requestDigest = canonicalWalletRequestDigest(
      OPERATION_TYPE_EXPIRE_LOT,
      { lotRef: lot.lotRef, expiresAt: lot.expiresAt }
    );
    const replay = readLifecycleReplay({
      actorScope: EXPIRY_ACTOR_SCOPE,
      operationType: OPERATION_TYPE_EXPIRE_LOT,
      idempotencyKey,
      requestDigest,
      subjectRef: lot.lotRef
    });
    if (replay) return replay;

    const wallet = assertLifecycleWallet(findWalletByRef(lot.walletRef));
    const occurredAt = readLockedDatabaseUtc();
    if (occurredAt < lot.expiresAt) throw storeError("not_due");

    const operationRef = nextRef("operation");
    if (lot.availableUnits === 0) {
      insertStartedLifecycleReceipt({
        operationRef,
        walletRef: wallet.walletRef,
        actorScope: EXPIRY_ACTOR_SCOPE,
        operationType: OPERATION_TYPE_EXPIRE_LOT,
        idempotencyKey,
        requestDigest,
        occurredAt
      });
      completeLifecycleReceipt({
        operationRef,
        status: "succeeded",
        previousWalletVersion: wallet.version,
        resultingWalletVersion: wallet.version,
        resultingWalletStatus: wallet.status,
        resultRef: lot.lotRef,
        safeResultCode: SAFE_RESULT_EXPIRY_PROCESSED,
        occurredAt
      });
      return closeLifecycleResult({
        actorScope: EXPIRY_ACTOR_SCOPE,
        operationType: OPERATION_TYPE_EXPIRE_LOT,
        idempotencyKey,
        subjectRef: lot.lotRef
      });
    }

    const resultingExpiredUnits = safeAddUnits(
      lot.expiredUnits,
      lot.availableUnits
    );
    const resultingWalletVersion = safeAddUnits(wallet.version, 1);
    const entryRef = nextRef("ledger_entry");
    insertStartedLifecycleReceipt({
      operationRef,
      walletRef: wallet.walletRef,
      actorScope: EXPIRY_ACTOR_SCOPE,
      operationType: OPERATION_TYPE_EXPIRE_LOT,
      idempotencyKey,
      requestDigest,
      occurredAt
    });
    updateLifecycleLot({
      lot,
      resultingAvailableUnits: 0,
      resultingHeldUnits: lot.heldUnits,
      resultingConsumedUnits: lot.consumedUnits,
      resultingExpiredUnits,
      occurredAt
    });
    updateLifecycleWallet({
      wallet,
      resultingWalletVersion,
      occurredAt
    });
    insertLifecycleLedger({
      entryRef,
      operationRef,
      wallet,
      lot,
      operation: "available_to_expired",
      amountUnits: lot.availableUnits,
      holdRef: null,
      orderRef: null,
      actorType: EXPIRY_ACTOR_TYPE,
      actorRef: EXPIRY_ACTOR_REF,
      previousWalletVersion: wallet.version,
      resultingWalletVersion,
      occurredAt
    });
    completeLifecycleReceipt({
      operationRef,
      status: "succeeded",
      previousWalletVersion: wallet.version,
      resultingWalletVersion,
      resultingWalletStatus: wallet.status,
      resultRef: lot.lotRef,
      safeResultCode: SAFE_RESULT_EXPIRED,
      occurredAt
    });
    return closeLifecycleResult({
      actorScope: EXPIRY_ACTOR_SCOPE,
      operationType: OPERATION_TYPE_EXPIRE_LOT,
      idempotencyKey,
      subjectRef: lot.lotRef
    });
  });

  function getWallet(walletRef) {
    return read(() => findWalletByRef(assertNormalizedString(walletRef)));
  }

  function getWalletByAccountId(accountId) {
    return read(() => findWalletByAccountId(assertNormalizedString(accountId)));
  }

  function getWalletProjection(input) {
    return read(() => {
      const lookup = normalizeProjectionLookup(input);
      const wallet = lookup.walletRef
        ? findWalletByRef(lookup.walletRef)
        : findWalletByAccountId(lookup.accountId);
      if (!wallet) {
        return projectCoinWalletBalance({
          wallet: null,
          lots: [],
          activeAllocations: []
        });
      }
      const aggregates = db.prepare(`
        select coin_type,
               count(*) as lot_count,
               coalesce(sum(available_units), 0) as available_units,
               coalesce(sum(pending_units), 0) as pending_units,
               coalesce(sum(held_units), 0) as held_units
          from platform_coin_lots
         where wallet_ref = ?
         group by coin_type
         order by coin_type
      `).all(wallet.walletRef);
      if (aggregates.length > 3) {
        throw storeError("wallet_infrastructure_error");
      }
      const seenCoinTypes = new Set();
      for (const aggregate of aggregates) {
        let coinType;
        try {
          coinType = normalizeCoinType(aggregate.coin_type);
        } catch {
          throw storeError("wallet_infrastructure_error");
        }
        if (
          seenCoinTypes.has(coinType)
          || !Number.isSafeInteger(aggregate.lot_count)
          || aggregate.lot_count < 1
          || !Number.isSafeInteger(aggregate.available_units)
          || aggregate.available_units < 0
          || !Number.isSafeInteger(aggregate.pending_units)
          || aggregate.pending_units < 0
          || !Number.isSafeInteger(aggregate.held_units)
          || aggregate.held_units < 0
        ) {
          throw storeError("wallet_infrastructure_error");
        }
        seenCoinTypes.add(coinType);
      }
      const integrity = db.prepare(`
        with active_rows as (
          select a.lot_ref,
                 h.wallet_ref as hold_wallet_ref,
                 l.wallet_ref as lot_wallet_ref,
                 a.allocated_units
            from platform_coin_hold_allocations a
            join platform_coin_holds h
              on h.hold_ref = a.hold_ref
            join platform_coin_lots l
              on l.lot_ref = a.lot_ref
           where h.status = 'active'
        ),
        active_totals as (
          select lot_ref,
                 sum(allocated_units) as allocated_units
            from active_rows
           group by lot_ref
        )
        select (
                 select count(*)
                   from platform_coin_lots l
                   left join active_totals t
                     on t.lot_ref = l.lot_ref
                  where l.wallet_ref = ?
                    and l.held_units <> coalesce(t.allocated_units, 0)
               ) as held_mismatch_count,
               (
                 select count(*)
                   from active_rows
                  where (
                    hold_wallet_ref = ?
                    and lot_wallet_ref <> ?
                  )
                  or (
                    hold_wallet_ref <> ?
                    and lot_wallet_ref = ?
                  )
               ) as cross_wallet_count
      `).get(
        wallet.walletRef,
        wallet.walletRef,
        wallet.walletRef,
        wallet.walletRef,
        wallet.walletRef
      );
      if (
        !Number.isSafeInteger(integrity.held_mismatch_count)
        || !Number.isSafeInteger(integrity.cross_wallet_count)
        || integrity.held_mismatch_count !== 0
        || integrity.cross_wallet_count !== 0
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      const lots = aggregates.map((aggregate) => ({
        lotRef: `projection_${aggregate.coin_type}`,
        coinType: aggregate.coin_type,
        availableUnits: aggregate.available_units,
        pendingUnits: aggregate.pending_units,
        heldUnits: aggregate.held_units,
        expiresAt: null,
        createdAt: "1970-01-01T00:00:00.000Z"
      }));
      const activeAllocations = lots
        .filter(({ heldUnits }) => heldUnits > 0)
        .map(({ lotRef, heldUnits }) => ({
          lotRef,
          allocatedUnits: heldUnits
        }));
      return projectCoinWalletBalance({
        wallet,
        lots,
        activeAllocations
      });
    });
  }

  function getLot(lotRef) {
    return read(() => findLot(assertNormalizedString(lotRef)));
  }

  function listLots(options = {}) {
    return read(() => {
      const value = assertPlainObject(options);
      assertExactDataFields(
        value,
        new Set(["walletRef", "coinType", "includeDepleted", "limit"])
      );
      const {
        walletRef,
        coinType,
        includeDepleted = false,
        limit = 100
      } = value;
      const normalizedWalletRef = assertNormalizedString(walletRef);
      const normalizedLimit = normalizeListLimit(limit);
      if (typeof includeDepleted !== "boolean") {
        throw storeError("invalid_wallet_request");
      }
      let normalizedCoinType = null;
      if (coinType !== undefined) {
        try {
          normalizedCoinType = normalizeCoinType(coinType);
        } catch {
          throw storeError("invalid_coin_type");
        }
      }
      const conditions = ["wallet_ref = ?"];
      const parameters = [normalizedWalletRef];
      if (normalizedCoinType) {
        conditions.push("coin_type = ?");
        parameters.push(normalizedCoinType);
      }
      if (!includeDepleted) {
        conditions.push("(pending_units + available_units + held_units) > 0");
      }
      return db.prepare(`
        select *
          from platform_coin_lots
         where ${conditions.join(" and ")}
         order by created_at, lot_ref
         limit ?
      `).all(...parameters, normalizedLimit).map(mapLot);
    });
  }

  function getHold(holdRef) {
    return read(() => mapHold(db.prepare(`
      select *
        from platform_coin_holds
       where hold_ref = ?
    `).get(assertNormalizedString(holdRef))));
  }

  function listHolds(options = {}) {
    return read(() => {
      const value = assertPlainObject(options);
      assertExactDataFields(value, new Set(["walletRef", "status", "limit"]));
      const { walletRef, status, limit = 100 } = value;
      const normalizedWalletRef = assertNormalizedString(walletRef);
      const normalizedStatus = assertOptionalStatus(status, HOLD_STATUSES);
      const normalizedLimit = normalizeListLimit(limit);
      return db.prepare(`
        select *
          from platform_coin_holds
         where wallet_ref = ?
           and (? is null or status = ?)
         order by created_at, hold_ref
         limit ?
      `).all(
        normalizedWalletRef,
        normalizedStatus,
        normalizedStatus,
        normalizedLimit
      ).map(mapHold);
    });
  }

  function getOperationReceipt(options = {}) {
    return read(() => {
      const value = assertPlainObject(options);
      assertExactDataFields(
        value,
        new Set(["actorScope", "operationType", "idempotencyKey"])
      );
      return findReceipt({
        actorScope: assertNormalizedString(value.actorScope),
        operationType: assertNormalizedString(value.operationType),
        idempotencyKey: assertNormalizedString(value.idempotencyKey)
      });
    });
  }

  function listLedgerEntries(options = {}) {
    return read(() => {
      const value = assertPlainObject(options);
      assertExactDataFields(
        value,
        new Set(["walletRef", "afterOccurredAt", "afterEntryRef", "limit"])
      );
      const {
        walletRef,
        afterOccurredAt,
        afterEntryRef,
        limit = 100
      } = value;
      const normalizedWalletRef = assertNormalizedString(walletRef);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LEDGER_PAGE_SIZE) {
        throw storeError("invalid_pagination");
      }
      const hasOccurredAt = afterOccurredAt !== undefined;
      const hasEntryRef = afterEntryRef !== undefined;
      if (hasOccurredAt !== hasEntryRef) {
        throw storeError("invalid_pagination");
      }
      let normalizedOccurredAt = null;
      let normalizedEntryRef = null;
      if (hasOccurredAt) {
        normalizedOccurredAt = normalizeTimestamp(afterOccurredAt);
        normalizedEntryRef = assertNormalizedString(afterEntryRef);
      }
      return db.prepare(`
        select *
          from platform_coin_ledger_entries
         where wallet_ref = ?
           and (
             ? is null
             or occurred_at < ?
             or (occurred_at = ? and entry_ref < ?)
           )
         order by occurred_at desc, entry_ref desc
         limit ?
      `).all(
        normalizedWalletRef,
        normalizedOccurredAt,
        normalizedOccurredAt,
        normalizedOccurredAt,
        normalizedEntryRef,
        limit
      ).map(mapLedgerEntry);
    });
  }

  function assertCallerTransaction() {
    let inTransaction;
    try {
      inTransaction = db.inTransaction;
    } catch {
      throw storeError("wallet_transaction_required");
    }
    if (inTransaction !== true) {
      throw storeError("wallet_transaction_required");
    }
  }

  function getWalletByAccountIdInTransaction(accountId) {
    assertCallerTransaction();
    try {
      return findWalletByAccountId(assertNormalizedString(accountId));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function getWalletProjectionInTransaction(input) {
    assertCallerTransaction();
    try {
      return getWalletProjection(normalizeParticipantProjectionLookup(input));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function previewCoinHoldInTransaction(input) {
    assertCallerTransaction();
    try {
      const request = normalizePreviewHoldRequest(input);
      const wallet = findWalletByAccountId(request.accountId);
      if (!wallet) {
        return {
          walletProjection: getWalletProjection({
            accountId: request.accountId
          }),
          requestedUnits: request.amountUnits,
          acceptedCoinTypes: request.acceptedCoinTypes,
          allocation: [],
          sufficient: false
        };
      }
      if (wallet.status !== "active") {
        throw storeError("wallet_not_active");
      }
      const walletProjection = getWalletProjection({
        accountId: request.accountId
      });

      const occurredAt = readLockedDatabaseUtc();
      const placeholders = request.acceptedCoinTypes.map(() => "?").join(", ");
      const lots = db.prepare(`
        select *
          from platform_coin_lots
         where wallet_ref = ?
           and available_units > 0
           and coin_type in (${placeholders})
           and (
             coin_type <> 'bonus_coins'
             or expires_at is null
             or expires_at > ?
           )
      `).all(
        wallet.walletRef,
        ...request.acceptedCoinTypes,
        occurredAt
      ).map(mapLot);
      let allocations;
      try {
        allocations = allocateCoinLots({
          lots,
          amountUnits: request.amountUnits,
          acceptedCoinTypes: request.acceptedCoinTypes,
          now: occurredAt
        });
      } catch {
        throw storeError("wallet_infrastructure_error");
      }
      if (!Array.isArray(allocations)) {
        throw storeError("wallet_infrastructure_error");
      }

      const allocationByType = new Map();
      for (const allocation of allocations) {
        allocationByType.set(
          allocation.coinType,
          safeAddUnits(
            allocationByType.get(allocation.coinType) ?? 0,
            allocation.allocatedUnits
          )
        );
      }
      return {
        walletProjection,
        requestedUnits: request.amountUnits,
        acceptedCoinTypes: request.acceptedCoinTypes,
        allocation: ["bonus_coins", "paid_coins", "reward_coins"]
          .filter((coinType) => allocationByType.has(coinType))
          .map((coinType) => ({
            coinType,
            amountUnits: allocationByType.get(coinType)
          })),
        sufficient: allocations.length > 0
      };
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function createCoinHoldInTransaction(input) {
    assertCallerTransaction();
    try {
      return createCoinHoldBody(normalizeCreateHoldRequest(input));
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function captureCoinHoldInTransaction(input) {
    assertCallerTransaction();
    try {
      return holdLifecycleBody(
        normalizeHoldLifecycleRequest(input, OPERATION_TYPE_CAPTURE_HOLD),
        OPERATION_TYPE_CAPTURE_HOLD
      );
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function releaseCoinHoldInTransaction(input) {
    assertCallerTransaction();
    try {
      return holdLifecycleBody(
        normalizeHoldLifecycleRequest(input, OPERATION_TYPE_RELEASE_HOLD),
        OPERATION_TYPE_RELEASE_HOLD
      );
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function creditCoins(input) {
    assertOpen();
    let request;
    let occurredAt;
    try {
      request = normalizeCreditRequest(input);
      occurredAt = normalizeNow(nowFn);
      return runCreditTransaction.immediate(request, occurredAt);
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function confirmCoinCredit(input) {
    assertOpen();
    try {
      const request = normalizeConfirmCreditRequest(input);
      return runConfirmCreditTransaction.immediate(request);
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function createCoinHold(input) {
    assertOpen();
    try {
      const request = normalizeCreateHoldRequest(input);
      return runCreateHoldTransaction.immediate(request);
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function captureCoinHold(input) {
    assertOpen();
    try {
      const request = normalizeHoldLifecycleRequest(
        input,
        OPERATION_TYPE_CAPTURE_HOLD
      );
      return runHoldLifecycleTransaction.immediate(
        request,
        OPERATION_TYPE_CAPTURE_HOLD
      );
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function releaseCoinHold(input) {
    assertOpen();
    try {
      const request = normalizeHoldLifecycleRequest(
        input,
        OPERATION_TYPE_RELEASE_HOLD
      );
      return runHoldLifecycleTransaction.immediate(
        request,
        OPERATION_TYPE_RELEASE_HOLD
      );
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function expireCoinHold(input) {
    assertOpen();
    try {
      const holdRef = normalizeExpirySubjectRequest(
        input,
        EXPIRE_HOLD_FIELDS,
        "holdRef"
      );
      return runExpireHoldTransaction.immediate(holdRef);
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function expireCoinLot(input) {
    assertOpen();
    try {
      const lotRef = normalizeExpirySubjectRequest(
        input,
        EXPIRE_LOT_FIELDS,
        "lotRef"
      );
      return runExpireLotTransaction.immediate(lotRef);
    } catch (error) {
      if (
        error?.code === "invalid_reference"
        || error?.code === "coin_units_overflow"
      ) {
        throw storeError("wallet_infrastructure_error");
      }
      throw normalizeStoreError(error);
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    if (!owned) return;
    try {
      owned.close();
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  const store = {
    captureCoinHold,
    close,
    confirmCoinCredit,
    createCoinHold,
    creditCoins,
    expireCoinHold,
    expireCoinLot,
    getHold,
    getLot,
    getOperationReceipt,
    getWallet,
    getWalletByAccountId,
    getWalletProjection,
    listHolds,
    listLedgerEntries,
    listLots,
    releaseCoinHold
  };
  TRANSACTION_PARTICIPANT_BY_STORE.set(store, {
    getWalletByAccountIdInTransaction,
    getWalletProjectionInTransaction,
    previewCoinHoldInTransaction,
    createCoinHoldInTransaction,
    captureCoinHoldInTransaction,
    releaseCoinHoldInTransaction
  });
  return store;
}

export function createCoinWalletTransactionParticipant(options = {}) {
  if (
    !options
    || typeof options !== "object"
    || Array.isArray(options)
    || Object.getPrototypeOf(options) !== Object.prototype
  ) {
    throw storeError("invalid_store_contract");
  }
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (
      typeof key !== "string"
      || !PARTICIPANT_FACTORY_FIELDS.has(key)
      || !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw storeError("invalid_store_contract");
    }
  }
  if (!Object.prototype.hasOwnProperty.call(options, "database")) {
    throw storeError("invalid_store_contract");
  }
  const store = createSqliteCoinWalletStore(options);
  const participant = TRANSACTION_PARTICIPANT_BY_STORE.get(store);
  if (!participant) {
    throw storeError("wallet_infrastructure_error");
  }
  return participant;
}
