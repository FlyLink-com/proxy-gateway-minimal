import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

import {
  applyCoinDiscount,
  normalizeCoinCommerceOffer
} from "./coin-commerce-domain.mjs";
import {
  assessReservationAtActivation,
  planRank,
  WALLET_FIRST_COMMERCIAL_MODEL
} from "./coin-commerce-deferred-transition-policy.mjs";
import {
  validateDeferredResourceTransitionSchema
} from "./deferred-resource-transition-migrations.mjs";
import {
  createDeferredResourceTransitionReservationParticipant
} from "./coin-wallet-store.mjs";
import {
  markWalletFirstDeferredCheckoutQuoteReservedInTransaction,
  prepareWalletFirstDeferredCheckoutQuoteReservationInTransaction
} from "./wallet-first-deferred-checkout-quote-contract.mjs";

const FACTORY_FIELDS = new Set([
  "dbPath",
  "database",
  "nowFn",
  "refFactory",
  "leaseTokenFactory",
  "reservationParticipantFactory"
]);
const OPERATION_FIELDS = ["actorScope", "idempotencyKey", "actorType", "actorRef"];
const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{2,95}$/;
const LEASE_TOKEN = /^[0-9a-f]{64}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_SAFE_UNITS = 9_007_199_254_740_991;
const MAX_PAGE_SIZE = 100;
// The Portal list surface intentionally has no cursor. Cap all non-terminal
// account-owned transitions at that same page size and order them first, so a
// user can always see and cancel every queued Coins reservation.
export const MAX_DEFERRED_TRANSITIONS_PER_ACCOUNT = MAX_PAGE_SIZE;
const MAX_LEASE_MS = 86_400_000;
export const DEFERRED_RESERVATION_RECOVERY_GRACE_MS = 86_400_000;
export const DEFERRED_RESOURCE_TRANSITION_STORE_RESERVATION_LIFECYCLE_CONTRACT =
  "deferred-transition-store-reservation-lifecycle/v1";
const TRANSITIONS_TABLE = "platform_deferred_resource_transitions";
const RECEIPTS_TABLE = "platform_deferred_resource_transition_operation_receipts";
const EVENTS_TABLE = "platform_deferred_resource_transition_events";
const REBASES_TABLE = "platform_deferred_resource_transition_rebases";
const KNOWN_STORE_CODES = new Set([
  "bonus_expires_before_activation",
  "deferred_reservation_adapter_failure",
  "deferred_reservation_capture_invalid",
  "deferred_reservation_expired_before_capture",
  "deferred_reservation_invalid",
  "deferred_reservation_not_active",
  "deferred_reservation_release_failed",
  "deferred_rebase_binding_invalid",
  "deferred_transition_account_conflict",
  "deferred_transition_account_not_eligible",
  "deferred_transition_busy",
  "deferred_transition_expected_chain_invalid",
  "deferred_transition_idempotency_conflict",
  "deferred_transition_infrastructure_error",
  "deferred_transition_invalid_input",
  "deferred_transition_lease_lost",
  "deferred_transition_not_found",
  "deferred_transition_queue_full",
  "deferred_transition_schema_not_ready",
  "deferred_transition_state_conflict",
  "deferred_transition_store_closed",
  "deferred_checkout_account_unavailable",
  "deferred_checkout_infrastructure_error",
  "deferred_checkout_invalid",
  "invalid_store_contract",
  "quote_expired",
  "quote_stale",
  "unsupported_deferred_transition_offer",
  "wallet_deferred_hold_adapter_required"
]);

export const DEFERRED_RESERVATION_PARTICIPANT_CONTRACT_VERSION =
  "deferred-reservation-participant/v1";

/**
 * The production participant is constructed against this store's exact SQLite
 * handle. A factory override exists only for focused tests; its methods still
 * must run on this store's active transaction, bind the immutable reservation
 * snapshot, and fail closed when any allocated lot is no longer capturable.
 */
export const DEFERRED_RESERVATION_PARTICIPANT_METHODS = Object.freeze([
  "createReservationInTransaction",
  "verifyReservationInTransaction",
  "preflightRebaseReservationInTransaction",
  "rebaseReservationInTransaction",
  "captureReservationInTransaction",
  "releaseReservationInTransaction"
]);

function snapshotReservationParticipant(value) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    throw storeError("wallet_deferred_hold_adapter_required");
  }
  const participant = {};
  for (const methodName of DEFERRED_RESERVATION_PARTICIPANT_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, methodName);
    if (!descriptor || typeof descriptor.value !== "function") {
      throw storeError("wallet_deferred_hold_adapter_required");
    }
    participant[methodName] = (...args) => descriptor.value.call(value, ...args);
  }
  return Object.freeze(participant);
}

function storeError(code) {
  const error = new Error("Deferred resource-transition store rejected operation");
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
    && (error.code.startsWith("SQLITE_BUSY") || error.code.startsWith("SQLITE_LOCKED"))
  ) {
    return storeError("deferred_transition_busy");
  }
  return storeError("deferred_transition_infrastructure_error");
}

function assertPlainObject(value, code = "deferred_transition_invalid_input") {
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

function assertExactFields(value, fields, code = "deferred_transition_invalid_input") {
  const input = assertPlainObject(value, code);
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length
    || !fields.every((field) => keys.includes(field))
    || keys.some((key) => typeof key !== "string")
  ) {
    throw storeError(code);
  }
  const normalized = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw storeError(code);
    }
    normalized[field] = descriptor.value;
  }
  return normalized;
}

function assertAllowedFields(value, fields, code = "deferred_transition_invalid_input") {
  const input = assertPlainObject(value, code);
  const allowed = new Set(fields);
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (
      typeof key !== "string"
      || !allowed.has(key)
      || !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw storeError(code);
    }
  }
  return input;
}

function normalizeReference(value, code = "deferred_transition_invalid_input") {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw storeError(code);
  }
  return value;
}

function normalizeText(value, code = "deferred_transition_invalid_input") {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw storeError(code);
  }
  return value;
}

// Wallet lots remain wallet-owned identifiers. Their default UUID-backed
// references contain hyphens, while deferred account/order/quote references
// deliberately retain the stricter local grammar.
function normalizeWalletLotReference(value, code = "deferred_transition_invalid_input") {
  return normalizeText(value, code);
}

function normalizeSafeCode(value) {
  if (typeof value !== "string" || !SAFE_CODE.test(value)) {
    throw storeError("deferred_transition_invalid_input");
  }
  return value;
}

function normalizeTimestamp(value, code = "deferred_transition_invalid_input") {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw storeError(code);
  }
  return value;
}

function normalizePositiveUnits(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SAFE_UNITS) {
    throw storeError("deferred_transition_invalid_input");
  }
  return value;
}

function normalizePositiveInteger(value, maximum = MAX_SAFE_UNITS) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw storeError("deferred_transition_invalid_input");
  }
  return value;
}

function normalizeLeaseToken(value) {
  if (typeof value !== "string" || !LEASE_TOKEN.test(value)) {
    throw storeError("deferred_transition_invalid_input");
  }
  return value;
}

function normalizeNullableReference(value) {
  return value === null ? null : normalizeReference(value);
}

function normalizeNullableTimestamp(value) {
  return value === null ? null : normalizeTimestamp(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function requestDigest(operationType, value) {
  return createHash("sha256")
    .update(
      `GCCWEBOS:DEFERRED_RESOURCE_TRANSITION_STORE:v1\0${operationType}\0${canonicalJson(value)}`,
      "utf8"
    )
    .digest("hex");
}

function normalizeOperation(input) {
  const value = assertExactFields(input, OPERATION_FIELDS);
  if (!["portal_user", "commerce_system"].includes(value.actorType)) {
    throw storeError("deferred_transition_invalid_input");
  }
  return Object.freeze({
    actorScope: normalizeText(value.actorScope),
    idempotencyKey: normalizeText(value.idempotencyKey),
    actorType: value.actorType,
    actorRef: normalizeText(value.actorRef)
  });
}

function normalizeAllocationSnapshot(input, amountUnits) {
  if (
    !Array.isArray(input)
    || Object.getPrototypeOf(input) !== Array.prototype
    || Reflect.ownKeys(input).length !== input.length + 1
    || input.length === 0
  ) {
    throw storeError("deferred_transition_invalid_input");
  }
  let total = 0;
  const seenLots = new Set();
  const allocation = input.map((item, index) => {
    const value = assertExactFields(item, [
      "lotRef", "allocationSequence", "coinType", "allocatedUnits", "expiresAt"
    ]);
    const lotRef = normalizeWalletLotReference(value.lotRef);
    const allocationSequence = normalizePositiveInteger(value.allocationSequence);
    const allocatedUnits = normalizePositiveUnits(value.allocatedUnits);
    if (allocationSequence !== index + 1 || seenLots.has(lotRef)) {
      throw storeError("deferred_transition_invalid_input");
    }
    if (!["bonus_coins", "paid_coins", "reward_coins"].includes(value.coinType)) {
      throw storeError("deferred_transition_invalid_input");
    }
    const expiresAt = normalizeNullableTimestamp(value.expiresAt);
    if (value.coinType !== "bonus_coins" && expiresAt !== null) {
      throw storeError("deferred_transition_invalid_input");
    }
    seenLots.add(lotRef);
    total += allocatedUnits;
    if (!Number.isSafeInteger(total) || total > MAX_SAFE_UNITS) {
      throw storeError("deferred_transition_invalid_input");
    }
    return Object.freeze({
      lotRef,
      allocationSequence,
      coinType: value.coinType,
      allocatedUnits,
      expiresAt
    });
  });
  if (total !== amountUnits) throw storeError("deferred_transition_invalid_input");
  return Object.freeze(allocation);
}

function normalizeOfferSnapshot(value, offerVersionRef) {
  let offer;
  try {
    offer = normalizeCoinCommerceOffer(value);
  } catch {
    throw storeError("deferred_transition_invalid_input");
  }
  if (
    offer.offerVersionRef !== offerVersionRef
    || offer.category !== "plan"
    || offer.delivery.kind !== "subscription_plan"
  ) {
    throw storeError("unsupported_deferred_transition_offer");
  }
  let rank;
  try {
    rank = planRank({
      offerVersionRef: offer.offerVersionRef,
      durationDays: offer.delivery.durationDays,
      monthlyTrafficGb: offer.delivery.monthlyTrafficGb
    });
  } catch {
    throw storeError("unsupported_deferred_transition_offer");
  }
  return Object.freeze({ offer, rank });
}

function normalizeReserveContext(value) {
  const accountId = normalizeReference(value.accountId);
  const orderRef = normalizeReference(value.orderRef);
  const offerVersionRef = normalizeReference(value.offerVersionRef);
  const scheduledFor = normalizeTimestamp(value.scheduledFor);
  if (!["initial_activation", "scheduled_switch"].includes(value.flowKind)) {
    throw storeError("deferred_transition_invalid_input");
  }
  const expectedEntitlementId = normalizeNullableReference(value.expectedEntitlementId);
  const expectedRequestId = normalizeNullableReference(value.expectedRequestId);
  const expectedIssuedLinkId = normalizeNullableReference(value.expectedIssuedLinkId);
  const expectedValidUntil = normalizeNullableTimestamp(value.expectedValidUntil);
  const expectedValues = [
    expectedEntitlementId,
    expectedRequestId,
    expectedIssuedLinkId,
    expectedValidUntil
  ];
  if (
    (value.flowKind === "initial_activation" && expectedValues.some((item) => item !== null))
    || (value.flowKind === "scheduled_switch" && expectedValues.some((item) => item === null))
  ) {
    throw storeError("deferred_transition_invalid_input");
  }
  if (value.flowKind === "scheduled_switch" && scheduledFor !== expectedValidUntil) {
    throw storeError("deferred_transition_expected_chain_invalid");
  }
  return Object.freeze({
    accountId,
    orderRef,
    offerVersionRef,
    flowKind: value.flowKind,
    scheduledFor,
    expectedEntitlementId,
    expectedRequestId,
    expectedIssuedLinkId,
    expectedValidUntil,
    operation: normalizeOperation(value.operation)
  });
}

function finalizeReserveRequest(context, { amountUnits, offerSnapshot }) {
  const normalizedAmountUnits = normalizePositiveUnits(amountUnits);
  const { offer, rank } = normalizeOfferSnapshot(offerSnapshot, context.offerVersionRef);
  return Object.freeze({
    ...context,
    amountUnits: normalizedAmountUnits,
    offerSnapshot: offer,
    planRank: rank,
    requestDigest: requestDigest("reserve_transition", {
      accountId: context.accountId,
      orderRef: context.orderRef,
      offerVersionRef: context.offerVersionRef,
      flowKind: context.flowKind,
      amountUnits: normalizedAmountUnits,
      offerSnapshot: offer,
      scheduledFor: context.scheduledFor,
      expectedEntitlementId: context.expectedEntitlementId,
      expectedRequestId: context.expectedRequestId,
      expectedIssuedLinkId: context.expectedIssuedLinkId,
      expectedValidUntil: context.expectedValidUntil
    })
  });
}

function normalizeTrustedReserveRequest(input) {
  const value = assertExactFields(input, [
    "accountId",
    "orderRef",
    "offerVersionRef",
    "flowKind",
    "amountUnits",
    "offerSnapshot",
    "scheduledFor",
    "expectedEntitlementId",
    "expectedRequestId",
    "expectedIssuedLinkId",
    "expectedValidUntil",
    "operation"
  ]);
  return finalizeReserveRequest(normalizeReserveContext(value), {
    amountUnits: value.amountUnits,
    offerSnapshot: value.offerSnapshot
  });
}

function normalizeDirectReserveRequest(input) {
  const value = assertExactFields(input, [
    "accountId",
    "orderRef",
    "offerVersionRef",
    "flowKind",
    "scheduledFor",
    "expectedEntitlementId",
    "expectedRequestId",
    "expectedIssuedLinkId",
    "expectedValidUntil",
    "operation"
  ]);
  return normalizeReserveContext(value);
}

function normalizeCheckoutQuoteReserveRequest(input) {
  const value = assertExactFields(input, [
    "accountId", "quoteRef", "operation"
  ]);
  const accountId = normalizeReference(value.accountId);
  const quoteRef = normalizeReference(value.quoteRef);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({ accountId, quoteRef, operation });
}

function normalizeClaimRequest(input) {
  const value = assertExactFields(input, ["leaseMs"]);
  return Object.freeze({ leaseMs: normalizePositiveInteger(value.leaseMs, MAX_LEASE_MS) });
}

function normalizeVerifyClaimedReservationRequest(input) {
  const value = assertExactFields(input, [
    "transitionRef", "leaseGeneration", "leaseToken"
  ]);
  return Object.freeze({
    transitionRef: normalizeReference(value.transitionRef),
    leaseGeneration: normalizePositiveInteger(value.leaseGeneration, 2_147_483_647),
    leaseToken: normalizeLeaseToken(value.leaseToken)
  });
}

function normalizeEffectSuccessor(input) {
  const value = assertExactFields(input, [
    "entitlementId", "requestId", "issuedLinkId", "validUntil"
  ]);
  return Object.freeze({
    entitlementId: normalizeReference(value.entitlementId),
    requestId: normalizeReference(value.requestId),
    issuedLinkId: normalizeReference(value.issuedLinkId),
    validUntil: normalizeTimestamp(value.validUntil)
  });
}

function normalizeEffectRequest(input) {
  const value = assertExactFields(input, [
    "transitionRef", "leaseGeneration", "leaseToken", "effectRef", "successor", "operation"
  ]);
  const transitionRef = normalizeReference(value.transitionRef);
  const leaseGeneration = normalizePositiveInteger(value.leaseGeneration, 2_147_483_647);
  const leaseToken = normalizeLeaseToken(value.leaseToken);
  const effectRef = normalizeReference(value.effectRef);
  const successor = normalizeEffectSuccessor(value.successor);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    transitionRef,
    leaseGeneration,
    leaseToken,
    effectRef,
    successor,
    operation,
    requestDigest: requestDigest("record_effect", {
      transitionRef, leaseGeneration, leaseToken, effectRef, successor
    })
  });
}

function normalizeEffectRecoveryClaimRequest(input) {
  const value = assertExactFields(input, ["leaseMs"]);
  return Object.freeze({ leaseMs: normalizePositiveInteger(value.leaseMs, MAX_LEASE_MS) });
}

function normalizeRebaseOutboxClaimRequest(input) {
  const value = assertExactFields(input, ["leaseMs"]);
  return Object.freeze({ leaseMs: normalizePositiveInteger(value.leaseMs, MAX_LEASE_MS) });
}

function normalizeApplyClaimedRebaseRequest(input) {
  const value = assertExactFields(input, [
    "settledTransitionRef", "leaseGeneration", "leaseToken", "operation"
  ]);
  const settledTransitionRef = normalizeReference(value.settledTransitionRef);
  const leaseGeneration = normalizePositiveInteger(value.leaseGeneration, 2_147_483_647);
  const leaseToken = normalizeLeaseToken(value.leaseToken);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    settledTransitionRef,
    leaseGeneration,
    leaseToken,
    operation,
    requestDigest: requestDigest("apply_rebase_outbox", {
      settledTransitionRef
    })
  });
}

function normalizeReconcileRebaseRequest(input) {
  const value = assertExactFields(input, [
    "settledTransitionRef", "leaseGeneration", "leaseToken", "safeCode", "operation"
  ]);
  const settledTransitionRef = normalizeReference(value.settledTransitionRef);
  const leaseGeneration = normalizePositiveInteger(value.leaseGeneration, 2_147_483_647);
  const leaseToken = normalizeLeaseToken(value.leaseToken);
  const safeCode = normalizeSafeCode(value.safeCode);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    settledTransitionRef,
    leaseGeneration,
    leaseToken,
    safeCode,
    operation,
    requestDigest: requestDigest("reconcile_rebase_outbox", {
      settledTransitionRef, safeCode
    })
  });
}

function assertStableRebaseOutboxOperation(request, phase) {
  const expectedKey = `deferred_rebase_${phase}_${request.settledTransitionRef}`;
  if (
    request.operation.actorType !== "commerce_system"
    || request.operation.idempotencyKey !== expectedKey
  ) {
    throw storeError("deferred_transition_invalid_input");
  }
  return request;
}

function normalizeSettleRequest(input) {
  const value = assertExactFields(input, [
    "transitionRef", "leaseGeneration", "leaseToken", "operation"
  ]);
  const transitionRef = normalizeReference(value.transitionRef);
  const leaseGeneration = normalizePositiveInteger(value.leaseGeneration, 2_147_483_647);
  const leaseToken = normalizeLeaseToken(value.leaseToken);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    transitionRef,
    leaseGeneration,
    leaseToken,
    operation,
    requestDigest: requestDigest("settle_transition", {
      transitionRef, leaseGeneration, leaseToken
    })
  });
}

function normalizeCancelRequest(input) {
  const value = assertExactFields(input, ["accountId", "transitionRef", "operation"]);
  const accountId = normalizeReference(value.accountId);
  const transitionRef = normalizeReference(value.transitionRef);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    accountId,
    transitionRef,
    operation,
    requestDigest: requestDigest("cancel_transition", { accountId, transitionRef })
  });
}

function normalizeLeaseActionRequest(input, operationType) {
  const value = assertExactFields(input, [
    "transitionRef", "leaseGeneration", "leaseToken", "safeCode", "operation"
  ]);
  const transitionRef = normalizeReference(value.transitionRef);
  const leaseGeneration = normalizePositiveInteger(value.leaseGeneration, 2_147_483_647);
  const leaseToken = normalizeLeaseToken(value.leaseToken);
  const safeCode = normalizeSafeCode(value.safeCode);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    transitionRef,
    leaseGeneration,
    leaseToken,
    safeCode,
    operation,
    requestDigest: requestDigest(operationType, {
      transitionRef, leaseGeneration, leaseToken, safeCode
    })
  });
}

function normalizeRebaseRequest(input) {
  const value = assertExactFields(input, [
    "accountId",
    "settledTransitionRef",
    "expectedEntitlementId",
    "expectedRequestId",
    "expectedIssuedLinkId",
    "expectedValidUntil",
    "operation"
  ]);
  const accountId = normalizeReference(value.accountId);
  const settledTransitionRef = normalizeReference(value.settledTransitionRef);
  const expectedEntitlementId = normalizeReference(value.expectedEntitlementId);
  const expectedRequestId = normalizeReference(value.expectedRequestId);
  const expectedIssuedLinkId = normalizeReference(value.expectedIssuedLinkId);
  const expectedValidUntil = normalizeTimestamp(value.expectedValidUntil);
  const operation = normalizeOperation(value.operation);
  return Object.freeze({
    accountId,
    settledTransitionRef,
    expectedEntitlementId,
    expectedRequestId,
    expectedIssuedLinkId,
    expectedValidUntil,
    operation,
    requestDigest: requestDigest("rebase_transition", {
      accountId,
      settledTransitionRef,
      expectedEntitlementId,
      expectedRequestId,
      expectedIssuedLinkId,
      expectedValidUntil
    })
  });
}

function normalizeListRequest(input) {
  const value = assertAllowedFields(input, ["accountId", "limit"]);
  if (!Object.hasOwn(value, "accountId")) {
    throw storeError("deferred_transition_invalid_input");
  }
  return Object.freeze({
    accountId: normalizeReference(value.accountId),
    limit: value.limit === undefined ? MAX_PAGE_SIZE : normalizePositiveInteger(value.limit, MAX_PAGE_SIZE)
  });
}

function normalizeGetRequest(input) {
  const value = assertExactFields(input, ["accountId", "transitionRef"]);
  return Object.freeze({
    accountId: normalizeReference(value.accountId),
    transitionRef: normalizeReference(value.transitionRef)
  });
}

function normalizeNow(nowFn) {
  let now;
  try {
    now = nowFn();
  } catch {
    throw storeError("deferred_transition_infrastructure_error");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw storeError("deferred_transition_infrastructure_error");
  }
  return now.toISOString();
}

function addMilliseconds(timestamp, milliseconds) {
  const value = Date.parse(timestamp) + milliseconds;
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8.64e15) {
    throw storeError("deferred_transition_infrastructure_error");
  }
  return new Date(value).toISOString();
}

function parseStoredJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw storeError("deferred_transition_infrastructure_error");
  }
}

function snapshotFactoryOptions(options) {
  const value = assertAllowedFields(options, [...FACTORY_FIELDS], "invalid_store_contract");
  const result = {};
  for (const key of FACTORY_FIELDS) {
    if (Object.hasOwn(value, key)) result[key] = value[key];
  }
  return result;
}

export function createSqliteDeferredResourceTransitionStore(options = {}) {
  const values = snapshotFactoryOptions(options);
  const hasPath = values.dbPath !== undefined;
  const hasDatabase = values.database !== undefined;
  if (
    hasPath === hasDatabase
    || (hasPath && (typeof values.dbPath !== "string" || !isAbsolute(values.dbPath)))
    || (values.nowFn !== undefined && typeof values.nowFn !== "function")
    || (values.refFactory !== undefined && typeof values.refFactory !== "function")
    || (values.leaseTokenFactory !== undefined && typeof values.leaseTokenFactory !== "function")
    || (
      values.reservationParticipantFactory !== undefined
      && typeof values.reservationParticipantFactory !== "function"
    )
  ) {
    throw storeError("invalid_store_contract");
  }

  let ownedDatabase = null;
  let db;
  try {
    if (hasPath) {
      ownedDatabase = new Database(values.dbPath, { fileMustExist: true });
      db = ownedDatabase;
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = ON");
    } else {
      db = values.database;
      if (
        !db
        || db.open !== true
        || db.inTransaction === true
        || db.pragma("foreign_keys", { simple: true }) !== 1
      ) {
        throw storeError("invalid_store_contract");
      }
    }
    if (!validateDeferredResourceTransitionSchema({ database: db }).ok) {
      throw storeError("deferred_transition_schema_not_ready");
    }
  } catch (error) {
    try {
      ownedDatabase?.close();
    } catch {}
    throw normalizeStoreError(error);
  }

  const nowFn = values.nowFn ?? (() => new Date());
  const refFactory = values.refFactory
    ?? ((kind) => `${kind}_${randomUUID().replaceAll("-", "")}`);
  const leaseTokenFactory = values.leaseTokenFactory
    ?? (() => randomBytes(32).toString("hex"));
  let reservationParticipant;
  try {
    const participantFactory = values.reservationParticipantFactory
      ?? createDeferredResourceTransitionReservationParticipant;
    reservationParticipant = snapshotReservationParticipant(
      participantFactory({ database: db, nowFn, refFactory })
    );
  } catch (error) {
    try {
      ownedDatabase?.close();
    } catch {}
    throw normalizeStoreError(error);
  }
  let closed = false;

  function assertOpen() {
    if (closed || db.open !== true) throw storeError("deferred_transition_store_closed");
  }

  function nextReference(kind) {
    let reference;
    try {
      reference = refFactory(kind);
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return normalizeReference(reference, "deferred_transition_infrastructure_error");
  }

  function nextLeaseToken() {
    let token;
    try {
      token = leaseTokenFactory();
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return normalizeLeaseToken(token);
  }

  function findTransition(transitionRef) {
    return db.prepare(`
      select * from ${TRANSITIONS_TABLE} where transition_ref = ?
    `).get(transitionRef) ?? null;
  }

  function projectOffer(value) {
    try {
      return normalizeCoinCommerceOffer(parseStoredJson(value));
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function liveOfferFromRow(row) {
    try {
      return normalizeCoinCommerceOffer({
        offerRef: row.offer_ref,
        offerVersionRef: row.offer_version_ref,
        version: row.version,
        category: row.category,
        title: { zh: row.title_zh, en: row.title_en },
        summary: { zh: row.summary_zh, en: row.summary_en },
        importantNotices: {
          zh: parseStoredJson(row.important_notices_zh_json),
          en: parseStoredJson(row.important_notices_en_json)
        },
        baseCoinUnits: row.base_coin_units,
        referencePrice: {
          currency: row.reference_currency,
          amountMinor: row.reference_amount_minor
        },
        acceptedCoinTypes: parseStoredJson(row.accepted_coin_types_json),
        delivery: {
          kind: row.delivery_kind,
          durationDays: row.duration_days,
          monthlyTrafficGb: row.monthly_traffic_gb,
          trafficGb: row.traffic_gb,
          neverExpires: row.never_expires === 1,
          discountBasisPoints: row.discount_basis_points
        }
      });
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function resolveDirectReserveRequest(context) {
    const row = db.prepare(`
      select * from platform_coin_commerce_offer_versions
       where offer_version_ref = ? and status = 'published'
       limit 1
    `).get(context.offerVersionRef);
    if (!row) throw storeError("unsupported_deferred_transition_offer");
    const offer = liveOfferFromRow(row);
    let amountUnits;
    try {
      amountUnits = applyCoinDiscount({
        baseCoinUnits: offer.baseCoinUnits,
        discountBasisPoints: offer.delivery.discountBasisPoints
      });
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return finalizeReserveRequest(context, { amountUnits, offerSnapshot: offer });
  }

  function projectAllocation(value, amountUnits) {
    try {
      return normalizeAllocationSnapshot(parseStoredJson(value), amountUnits);
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function projectEffectSuccessor(row) {
    const values = [
      row.effect_entitlement_id,
      row.effect_request_id,
      row.effect_issued_link_id,
      row.effect_valid_until
    ];
    const populated = values.filter((value) => value !== null);
    if (populated.length === 0) {
      if (row.effect_ref !== null) {
        throw storeError("deferred_transition_infrastructure_error");
      }
      return null;
    }
    if (
      populated.length !== values.length
      || !REFERENCE.test(row.effect_ref)
      || !values.slice(0, 3).every((value) => REFERENCE.test(value))
      || !ISO_UTC_MILLIS.test(row.effect_valid_until)
      || new Date(row.effect_valid_until).toISOString() !== row.effect_valid_until
    ) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return Object.freeze({
      entitlementId: row.effect_entitlement_id,
      requestId: row.effect_request_id,
      issuedLinkId: row.effect_issued_link_id,
      validUntil: row.effect_valid_until
    });
  }

  function projectAccountTransition(row) {
    if (!row) return null;
    if (
      !REFERENCE.test(row.transition_ref)
      || !REFERENCE.test(row.order_ref)
      || !REFERENCE.test(row.offer_version_ref)
      || !REFERENCE.test(row.reservation_ref)
      || !["initial_activation", "scheduled_switch"].includes(row.flow_kind)
      || !Number.isSafeInteger(row.plan_rank)
      || row.plan_rank < 1
      || row.plan_rank > 3
      || !Number.isSafeInteger(row.amount_units)
      || row.amount_units < 1
      || ![
        "reserved", "processing", "effect_applied", "settled",
        "requote_required", "cancelled", "reconciliation_required"
      ].includes(row.state)
      || ![
        row.reserved_at,
        row.scheduled_for,
        row.created_at,
        row.updated_at
      ].every((timestamp) => typeof timestamp === "string" && ISO_UTC_MILLIS.test(timestamp)
        && new Date(timestamp).toISOString() === timestamp)
      || (row.expected_valid_until !== null && (
        !ISO_UTC_MILLIS.test(row.expected_valid_until)
        || new Date(row.expected_valid_until).toISOString() !== row.expected_valid_until
      ))
      || (row.settled_at !== null && (
        !ISO_UTC_MILLIS.test(row.settled_at)
        || new Date(row.settled_at).toISOString() !== row.settled_at
      ))
      || (row.safe_code !== null && !SAFE_CODE.test(row.safe_code))
      || !Number.isSafeInteger(row.rebase_generation)
      || row.rebase_generation < 0
    ) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const offer = projectOffer(row.offer_snapshot_json);
    const allocation = projectAllocation(row.allocation_snapshot_json, row.amount_units);
    if (offer.offerVersionRef !== row.offer_version_ref) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    let expectedRank;
    try {
      expectedRank = planRank({
        offerVersionRef: offer.offerVersionRef,
        durationDays: offer.delivery.durationDays,
        monthlyTrafficGb: offer.delivery.monthlyTrafficGb
      });
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
    if (expectedRank !== row.plan_rank) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const effectSuccessor = projectEffectSuccessor(row);
    if (
      ["effect_applied", "settled"].includes(row.state)
      && effectSuccessor === null
    ) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    if (
      !["effect_applied", "settled", "reconciliation_required"].includes(row.state)
      && effectSuccessor !== null
    ) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const base = {
      transitionRef: row.transition_ref,
      orderRef: row.order_ref,
      reservationRef: row.reservation_ref,
      offer,
      amountUnits: row.amount_units,
      flowKind: row.flow_kind,
      planRank: row.plan_rank,
      scheduledFor: row.scheduled_for,
      expectedValidUntil: row.expected_valid_until,
      state: row.state,
      rebaseGeneration: row.rebase_generation,
      effectRef: row.effect_ref,
      safeCode: row.safe_code,
      reservedAt: row.reserved_at,
      settledAt: row.settled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
    return Object.freeze({ base: Object.freeze(base), allocation, effectSuccessor });
  }

  function publicProjection(row) {
    return projectAccountTransition(row).base;
  }

  function claimProjection(row) {
    const projected = projectAccountTransition(row);
    if (
      !Number.isSafeInteger(row.lease_generation)
      || row.lease_generation < 1
      || !LEASE_TOKEN.test(row.lease_token)
      || !ISO_UTC_MILLIS.test(row.lease_until)
      || new Date(row.lease_until).toISOString() !== row.lease_until
    ) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return Object.freeze({
      ...projected.base,
      accountId: row.account_id,
      allocationSnapshot: projected.allocation,
      expectedEntitlementId: row.expected_entitlement_id,
      expectedRequestId: row.expected_request_id,
      expectedIssuedLinkId: row.expected_issued_link_id,
      leaseGeneration: row.lease_generation,
      leaseToken: row.lease_token,
      leaseUntil: row.lease_until
    });
  }

  function recoverableEffectProjection(row) {
    const projected = projectAccountTransition(row);
    if (row.state !== "effect_applied" || projected.effectSuccessor === null) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return Object.freeze({
      ...claimProjection(row),
      successor: projected.effectSuccessor
    });
  }

  function projectRebaseOutbox(row) {
    if (
      !row
      || !REFERENCE.test(row.settled_transition_ref)
      || !REFERENCE.test(row.account_id)
      || !REFERENCE.test(row.effect_ref)
      || ![
        "pending", "processing", "completed", "reconciliation_required"
      ].includes(row.state)
      || !Number.isSafeInteger(row.lease_generation)
      || row.lease_generation < 0
      || ![row.created_at, row.updated_at].every((timestamp) => (
        typeof timestamp === "string"
        && ISO_UTC_MILLIS.test(timestamp)
        && new Date(timestamp).toISOString() === timestamp
      ))
      || (row.completed_at !== null && (
        !ISO_UTC_MILLIS.test(row.completed_at)
        || new Date(row.completed_at).toISOString() !== row.completed_at
      ))
      || (row.safe_code !== null && !SAFE_CODE.test(row.safe_code))
    ) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    let successor;
    try {
      successor = normalizeEffectSuccessor({
        entitlementId: row.effect_entitlement_id,
        requestId: row.effect_request_id,
        issuedLinkId: row.effect_issued_link_id,
        validUntil: row.effect_valid_until
      });
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const hasLease = row.lease_token !== null || row.lease_until !== null;
    const leaseIsValid = (
      LEASE_TOKEN.test(row.lease_token ?? "")
      && ISO_UTC_MILLIS.test(row.lease_until ?? "")
      && new Date(row.lease_until).toISOString() === row.lease_until
    );
    const stateIsValid = (
      (row.state === "pending" && !hasLease && row.safe_code === null && row.completed_at === null)
      || (row.state === "processing" && row.lease_generation >= 1 && leaseIsValid
        && row.safe_code === null && row.completed_at === null)
      || (row.state === "completed" && !hasLease && row.safe_code === null
        && row.completed_at !== null)
      || (row.state === "reconciliation_required" && !hasLease
        && row.safe_code !== null && row.completed_at === null)
    );
    if (!stateIsValid) throw storeError("deferred_transition_infrastructure_error");
    return Object.freeze({
      base: Object.freeze({
        settledTransitionRef: row.settled_transition_ref,
        accountId: row.account_id,
        effectRef: row.effect_ref,
        state: row.state,
        safeCode: row.safe_code,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
      }),
      successor
    });
  }

  function rebaseOutboxClaimProjection(row) {
    const projected = projectRebaseOutbox(row);
    if (row.state !== "processing") {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return Object.freeze({
      settledTransitionRef: projected.base.settledTransitionRef,
      accountId: projected.base.accountId,
      effectRef: projected.base.effectRef,
      successor: projected.successor,
      leaseGeneration: row.lease_generation,
      leaseToken: row.lease_token,
      leaseUntil: row.lease_until
    });
  }

  function rebaseOutboxTerminalProjection(row) {
    const projected = projectRebaseOutbox(row);
    if (!["completed", "reconciliation_required"].includes(row.state)) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return Object.freeze({ ...projected.base, successor: projected.successor });
  }

  function findReceipt({ actorScope, operationType, idempotencyKey }) {
    return db.prepare(`
      select * from ${RECEIPTS_TABLE}
       where actor_scope = ? and operation_type = ? and idempotency_key = ?
    `).get(actorScope, operationType, idempotencyKey) ?? null;
  }

  function findRebaseOutbox(settledTransitionRef) {
    return db.prepare(`
      select * from ${REBASES_TABLE} where settled_transition_ref = ?
    `).get(settledTransitionRef) ?? null;
  }

  function resolveReplay({ operation, operationType, digest }) {
    const receipt = findReceipt({
      actorScope: operation.actorScope,
      operationType,
      idempotencyKey: operation.idempotencyKey
    });
    if (!receipt) return null;
    if (receipt.request_digest !== digest) {
      throw storeError("deferred_transition_idempotency_conflict");
    }
    const row = findTransition(receipt.transition_ref);
    if (!row || row.account_id !== receipt.account_id) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return { receipt, row };
  }

  function insertStartedReceipt({ transitionRef, accountId, operationType, operation, digest, occurredAt }) {
    const operationRef = nextReference("deferred_operation");
    const inserted = db.prepare(`
      insert into ${RECEIPTS_TABLE} (
        operation_ref, transition_ref, account_id, actor_scope, operation_type,
        idempotency_key, request_digest, status, result_ref, safe_result_code,
        created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
    `).run(
      operationRef,
      transitionRef,
      accountId,
      operation.actorScope,
      operationType,
      operation.idempotencyKey,
      digest,
      occurredAt
    );
    if (inserted.changes !== 1) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    return operationRef;
  }

  function completeReceipt({ operationRef, status = "succeeded", resultRef = null, safeCode = null, occurredAt }) {
    if (status === "succeeded" && (resultRef === null || safeCode !== null)) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    if (status === "failed" && (resultRef !== null || safeCode === null)) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const updated = db.prepare(`
      update ${RECEIPTS_TABLE}
         set status = ?, result_ref = ?, safe_result_code = ?, completed_at = ?
       where operation_ref = ? and status = 'started'
    `).run(status, resultRef, safeCode, occurredAt, operationRef);
    if (updated.changes !== 1) {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function appendEvent({ transitionRef, eventType, safeCode = null, actorType, actorRef, occurredAt }) {
    const eventRef = nextReference("deferred_event");
    const inserted = db.prepare(`
      insert into ${EVENTS_TABLE} (
        event_ref, transition_ref, event_type, safe_code, actor_type, actor_ref, occurred_at
      ) values (?, ?, ?, ?, ?, ?, ?)
    `).run(eventRef, transitionRef, eventType, safeCode, actorType, actorRef, occurredAt);
    if (inserted.changes !== 1) {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function assertOfferVersion(request) {
    const row = db.prepare(`
      select offer_version_ref, status, category, delivery_kind,
             duration_days, monthly_traffic_gb
        from platform_coin_commerce_offer_versions
       where offer_version_ref = ?
    `).get(request.offerVersionRef);
    if (
      !row
      || row.status !== "published"
      || row.category !== "plan"
      || row.delivery_kind !== "subscription_plan"
      || row.duration_days !== request.offerSnapshot.delivery.durationDays
      || row.monthly_traffic_gb !== request.offerSnapshot.delivery.monthlyTrafficGb
    ) {
      throw storeError("unsupported_deferred_transition_offer");
    }
  }

  function assertExpectedChain(
    request,
    occurredAt = null,
    { allowExpiredScheduledBoundary = false } = {}
  ) {
    if (request.flowKind === "initial_activation") return;
    const row = db.prepare(`
      select e.id as entitlement_id,
             e.account_id as entitlement_account_id,
             e.status as entitlement_status,
             e.valid_until as entitlement_valid_until,
             r.id as request_id,
             r.account_id as request_account_id,
             r.entitlement_id as request_entitlement_id,
             l.id as issued_link_id,
             l.request_id as issued_link_request_id
        from platform_entitlements e
        join platform_issuance_requests r on r.id = ?
        join platform_issued_subscription_links l on l.id = ?
       where e.id = ?
    `).get(
      request.expectedRequestId,
      request.expectedIssuedLinkId,
      request.expectedEntitlementId
    );
    if (
      !row
      || row.entitlement_account_id !== request.accountId
      || row.request_account_id !== request.accountId
      || row.entitlement_status !== "active"
      || row.request_entitlement_id !== request.expectedEntitlementId
      || row.issued_link_request_id !== request.expectedRequestId
      || row.entitlement_valid_until !== request.expectedValidUntil
    ) {
      throw storeError("deferred_transition_expected_chain_invalid");
    }
    if (occurredAt !== null) {
      assertExactCurrentResourceChain({
        accountId: request.accountId,
        entitlementId: request.expectedEntitlementId,
        requestId: request.expectedRequestId,
        issuedLinkId: request.expectedIssuedLinkId,
        validUntil: request.expectedValidUntil,
        occurredAt,
        // This private option is only enabled by verification of an already
        // claimed scheduled transition. Reserve, rebase, and successor checks
        // retain the normal current-time predicate.
        allowExpiredScheduledBoundary: (
          allowExpiredScheduledBoundary && request.flowKind === "scheduled_switch"
        ),
        code: "deferred_transition_expected_chain_invalid"
      });
    }
  }

  function bindingRef(prefix, value) {
    if (typeof value !== "string" || value.length === 0) return null;
    return `${prefix}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
  }

  function parseWalletFirstAccountMetadata(value) {
    try {
      const metadata = JSON.parse(value);
      if (
        !metadata
        || typeof metadata !== "object"
        || Array.isArray(metadata)
        || Object.getPrototypeOf(metadata) !== Object.prototype
        || metadata.commercialModel !== WALLET_FIRST_COMMERCIAL_MODEL
      ) {
        throw storeError("deferred_transition_account_not_eligible");
      }
      return metadata;
    } catch (error) {
      if (isStoreError(error)) throw error;
      throw storeError("deferred_transition_account_not_eligible");
    }
  }

  function currentResourceChainRows(accountId) {
    return db.prepare(`
      select e.id as entitlement_id,
             e.account_id as entitlement_account_id,
             e.status as entitlement_status,
             e.valid_from as entitlement_valid_from,
             e.valid_until as entitlement_valid_until,
             r.id as request_id,
             r.account_id as request_account_id,
             r.entitlement_id as request_entitlement_id,
             r.status as request_status,
             l.id as issued_link_id,
             l.request_id as issued_link_request_id,
             l.tenant_ref as link_tenant_ref,
             l.artifact_ref as link_artifact_ref,
             l.status as link_status,
             p.id as portal_id,
             p.portal_user_ref,
             p.entitlement_ref as portal_entitlement_ref,
             p.status as portal_status,
             p.tenant_id as portal_tenant_id,
             p.artifact_id as portal_artifact_id,
             p.expires_at as portal_expires_at,
             p.valid_until as portal_valid_until
        from platform_entitlements e
        left join platform_issuance_requests r
          on r.account_id = e.account_id and r.entitlement_id = e.id
        left join platform_issued_subscription_links l on l.request_id = r.id
        left join platform_portal_access_requests p on p.id = r.id
       where e.account_id = ?
       order by e.id asc, r.id asc, l.id asc
    `).all(accountId);
  }

  function rowIsExactCurrentResourceChain(
    row,
    accountId,
    occurredAt,
    { allowExpiredScheduledBoundary = false } = {}
  ) {
    try {
      const validFrom = normalizeTimestamp(
        row.entitlement_valid_from,
        "deferred_transition_expected_chain_invalid"
      );
      const validUntil = normalizeTimestamp(
        row.entitlement_valid_until,
        "deferred_transition_expected_chain_invalid"
      );
      return (
        row.entitlement_account_id === accountId
        && row.request_account_id === accountId
        && row.entitlement_status === "active"
        && row.request_status === "issued"
        && row.link_status === "active"
        && row.request_entitlement_id === row.entitlement_id
        && row.issued_link_request_id === row.request_id
        && row.portal_id === row.request_id
        && row.portal_user_ref === accountId
        && row.portal_entitlement_ref === row.entitlement_id
        && ["delivered", "issued"].includes(row.portal_status)
        && row.portal_expires_at === validUntil
        && row.portal_valid_until === validUntil
        && bindingRef("tenant", row.portal_tenant_id) === row.link_tenant_ref
        && bindingRef("artifact", row.portal_artifact_id) === row.link_artifact_ref
        && validFrom <= occurredAt
        && (
          validUntil >= occurredAt
          || allowExpiredScheduledBoundary
        )
      );
    } catch {
      return false;
    }
  }

  function assertExactCurrentResourceChain({
    accountId,
    entitlementId,
    requestId,
    issuedLinkId,
    validUntil,
    occurredAt,
    allowExpiredScheduledBoundary = false,
    code = "deferred_transition_expected_chain_invalid"
  }) {
    const account = db.prepare(`
      select status from platform_accounts where id = ?
    `).get(accountId);
    if (!account || account.status !== "active") {
      throw storeError(code);
    }
    const candidates = currentResourceChainRows(accountId);
    const activeCandidates = candidates.filter(
      (candidate) => candidate.entitlement_status === "active"
    );
    if (
      activeCandidates.length !== 1
      || !rowIsExactCurrentResourceChain(
        activeCandidates[0],
        accountId,
        occurredAt,
        { allowExpiredScheduledBoundary }
      )
      || activeCandidates[0].entitlement_id !== entitlementId
      || activeCandidates[0].request_id !== requestId
      || activeCandidates[0].issued_link_id !== issuedLinkId
      || activeCandidates[0].entitlement_valid_until !== validUntil
    ) {
      throw storeError(code);
    }
  }

  function assertReserveResourceChain(request, occurredAt) {
    const account = db.prepare(`
      select status, metadata_json from platform_accounts where id = ?
    `).get(request.accountId);
    if (!account || account.status !== "active") {
      throw storeError("deferred_transition_account_not_eligible");
    }
    parseWalletFirstAccountMetadata(account.metadata_json);
    const reconciliation = db.prepare(`
      select 1 from ${TRANSITIONS_TABLE}
       where account_id = ? and state = 'reconciliation_required'
       limit 1
    `).pluck().get(request.accountId);
    if (reconciliation) throw storeError("deferred_transition_account_conflict");
    const rebaseBlocker = db.prepare(`
      select 1 from ${REBASES_TABLE}
       where account_id = ?
         and state in ('pending', 'processing', 'reconciliation_required')
       limit 1
    `).pluck().get(request.accountId);
    if (rebaseBlocker) throw storeError("deferred_transition_account_conflict");
    const candidates = currentResourceChainRows(request.accountId);
    if (request.flowKind === "initial_activation") {
      if (candidates.length !== 0) {
        throw storeError("deferred_transition_account_conflict");
      }
      return;
    }
    assertExactCurrentResourceChain({
      accountId: request.accountId,
      entitlementId: request.expectedEntitlementId,
      requestId: request.expectedRequestId,
      issuedLinkId: request.expectedIssuedLinkId,
      validUntil: request.expectedValidUntil,
      occurredAt,
      code: "deferred_transition_expected_chain_invalid"
    });
  }

  function assertEffectSuccessor({ row, successor, occurredAt }) {
    const effect = db.prepare(`
      select e.id as entitlement_id,
             e.account_id as entitlement_account_id,
             e.status as entitlement_status,
             e.valid_until as entitlement_valid_until,
             r.id as request_id,
             r.account_id as request_account_id,
             r.entitlement_id as request_entitlement_id,
             l.id as issued_link_id,
             l.request_id as issued_link_request_id
        from platform_entitlements e
        join platform_issuance_requests r on r.id = ?
        join platform_issued_subscription_links l on l.id = ?
       where e.id = ?
    `).get(
      successor.requestId,
      successor.issuedLinkId,
      successor.entitlementId
    );
    if (
      !effect
      || effect.entitlement_account_id !== row.account_id
      || effect.request_account_id !== row.account_id
      || effect.entitlement_status !== "active"
      || effect.request_entitlement_id !== successor.entitlementId
      || effect.issued_link_request_id !== successor.requestId
      || effect.entitlement_valid_until !== successor.validUntil
      || successor.validUntil <= row.scheduled_for
    ) {
      throw storeError("deferred_transition_expected_chain_invalid");
    }
    assertExactCurrentResourceChain({
      accountId: row.account_id,
      entitlementId: successor.entitlementId,
      requestId: successor.requestId,
      issuedLinkId: successor.issuedLinkId,
      validUntil: successor.validUntil,
      occurredAt,
      code: "deferred_transition_expected_chain_invalid"
    });
  }

  function normalizeReservationBinding(result, {
    reservationRef,
    amountUnits,
    expectedActivationAt,
    expectedAllocationSnapshot = null
  }) {
    let verified;
    try {
      const keys = Reflect.ownKeys(assertPlainObject(result, "deferred_reservation_adapter_failure"));
      if (keys.length === 3 && keys.every((key) => (
        typeof key === "string" && ["ok", "reservationRef", "safeResultCode"].includes(key)
      ))) {
        const failure = assertExactFields(result, ["ok", "reservationRef", "safeResultCode"],
          "deferred_reservation_adapter_failure");
        if (
          failure.ok !== false
          || normalizeReference(failure.reservationRef, "deferred_reservation_adapter_failure")
            !== reservationRef
          || !SAFE_CODE.test(failure.safeResultCode)
        ) {
          throw storeError("deferred_reservation_adapter_failure");
        }
        return Object.freeze({
          valid: false,
          safeCode: failure.safeResultCode,
          reservation: null,
          allocation: null
        });
      }
      const activationAt = normalizeTimestamp(
        expectedActivationAt,
        "deferred_reservation_adapter_failure"
      );
      verified = assertExactFields(result, [
        "ok", "reservationRef", "state", "activationAt", "expiresAt", "allocationSnapshot"
      ], "deferred_reservation_adapter_failure");
      if (
        verified.ok !== true
        || ![
          "reserved", "processing", "captured", "released", "reconciliation_required"
        ].includes(verified.state)
        || normalizeReference(verified.reservationRef, "deferred_reservation_adapter_failure")
          !== reservationRef
        || normalizeTimestamp(verified.activationAt, "deferred_reservation_adapter_failure")
          !== activationAt
        || normalizeTimestamp(verified.expiresAt, "deferred_reservation_adapter_failure")
          !== addMilliseconds(activationAt, DEFERRED_RESERVATION_RECOVERY_GRACE_MS)
      ) {
        return Object.freeze({
          valid: false,
          safeCode: "deferred_reservation_invalid",
          reservation: null,
          allocation: null
        });
      }
      const allocation = normalizeAllocationSnapshot(verified.allocationSnapshot, amountUnits);
      if (
        expectedAllocationSnapshot !== null
        && canonicalJson(allocation) !== canonicalJson(expectedAllocationSnapshot)
      ) {
        return Object.freeze({
          valid: false,
          safeCode: "deferred_reservation_invalid",
          reservation: null,
          allocation: null
        });
      }
      return Object.freeze({
        valid: true,
        reservation: Object.freeze({
          reservationRef,
          state: verified.state,
          activationAt: verified.activationAt,
          expiresAt: verified.expiresAt
        }),
        allocation
      });
    } catch (error) {
      if (isStoreError(error) && error.code === "deferred_reservation_adapter_failure") {
        throw error;
      }
      throw storeError("deferred_reservation_adapter_failure");
    }
  }

  function createReservation({ request, transitionRef, reservationRef }) {
    let result;
    try {
      result = reservationParticipant.createReservationInTransaction({
        accountId: request.accountId,
        orderRef: request.orderRef,
        transitionRef,
        reservationRef,
        amountUnits: request.amountUnits,
        acceptedCoinTypes: request.offerSnapshot.acceptedCoinTypes,
        scheduledFor: request.scheduledFor,
        operation: {
          actorScope: request.operation.actorScope,
          idempotencyKey: `deferred-reservation-create:${transitionRef}`,
          actorType: request.operation.actorType,
          actorRef: request.operation.actorRef
        }
      });
    } catch {
      throw storeError("deferred_reservation_adapter_failure");
    }
    return normalizeReservationBinding(result, {
      reservationRef,
      amountUnits: request.amountUnits,
      expectedActivationAt: request.scheduledFor
    });
  }

  function inspectReservation({
    accountId,
    orderRef,
    reservationRef,
    amountUnits,
    activationAt,
    allocationSnapshot
  }) {
    let result;
    try {
      result = reservationParticipant.verifyReservationInTransaction({
        accountId,
        orderRef,
        reservationRef,
        amountUnits,
        allocationSnapshot
      });
    } catch {
      throw storeError("deferred_reservation_adapter_failure");
    }
    return normalizeReservationBinding(result, {
      reservationRef,
      amountUnits,
      expectedActivationAt: activationAt,
      expectedAllocationSnapshot: allocationSnapshot
    });
  }

  function assessReservationAt(binding, { activationAt, evaluationAt }) {
    if (!binding.valid || !binding.reservation) {
      throw storeError("deferred_reservation_invalid");
    }
    if (
      binding.reservation.activationAt !== activationAt
      || binding.reservation.expiresAt
        !== addMilliseconds(activationAt, DEFERRED_RESERVATION_RECOVERY_GRACE_MS)
    ) {
      throw storeError("deferred_reservation_invalid");
    }
    if (binding.reservation.expiresAt <= evaluationAt) {
      return Object.freeze({
        status: "requote_required",
        reasonCode: "deferred_reservation_expired_before_capture"
      });
    }
    try {
      return assessReservationAtActivation({
        activationAt: binding.reservation.expiresAt,
        allocationLots: binding.allocation.map(({ coinType, expiresAt }) => ({
          coinType,
          expiresAt
        }))
      });
    } catch {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function runReservationOperation({ methodName, reservationRef, operation }) {
    let result;
    try {
      result = reservationParticipant[methodName]({ reservationRef, operation });
    } catch {
      throw storeError("deferred_reservation_adapter_failure");
    }
    let normalized;
    try {
      normalized = assertExactFields(result, ["ok", "reservationRef", "safeResultCode"],
        "deferred_reservation_adapter_failure");
      if (
        normalized.ok !== true
        || normalizeReference(normalized.reservationRef, "deferred_reservation_adapter_failure")
          !== reservationRef
        || !["captured", "released"].includes(normalized.safeResultCode)
      ) {
        return null;
      }
    } catch (error) {
      if (isStoreError(error) && error.code === "deferred_reservation_adapter_failure") {
        throw error;
      }
      throw storeError("deferred_reservation_adapter_failure");
    }
    return Object.freeze({ safeResultCode: normalized.safeResultCode });
  }

  function releaseReservation({ row, operation, operationKey }) {
    const result = runReservationOperation({
      methodName: "releaseReservationInTransaction",
      reservationRef: row.reservation_ref,
      operation: {
        actorScope: operation.actorScope,
        idempotencyKey: operationKey,
        actorType: operation.actorType,
        actorRef: operation.actorRef
      }
    });
    if (!result || result.safeResultCode !== "released") {
      throw storeError("deferred_reservation_release_failed");
    }
  }

  function systemOperation(accountId, idempotencyKey) {
    return Object.freeze({
      actorScope: `deferred:${accountId}`,
      idempotencyKey,
      actorType: "commerce_system",
      actorRef: "deferred_resource_transition_store"
    });
  }

  function transitionReservation(row) {
    const projection = projectAccountTransition(row);
    return inspectReservation({
      accountId: row.account_id,
      orderRef: row.order_ref,
      reservationRef: row.reservation_ref,
      amountUnits: row.amount_units,
      activationAt: row.scheduled_for,
      allocationSnapshot: projection.allocation
    });
  }

  function rebaseReservationBinding({ methodName, row, activationAt, operation = undefined }) {
    const projection = projectAccountTransition(row);
    let result;
    try {
      result = reservationParticipant[methodName]({
        reservationRef: row.reservation_ref,
        activationAt,
        ...(operation === undefined ? {} : { operation })
      });
    } catch {
      throw storeError("deferred_reservation_adapter_failure");
    }
    return normalizeReservationBinding(result, {
      reservationRef: row.reservation_ref,
      amountUnits: row.amount_units,
      expectedActivationAt: activationAt,
      expectedAllocationSnapshot: projection.allocation
    });
  }

  function rebaseReservationOperation({ row, operation, operationKey, activationAt }) {
    return rebaseReservationBinding({
      methodName: "rebaseReservationInTransaction",
      row,
      activationAt,
      operation: {
        actorScope: operation.actorScope,
        idempotencyKey: operationKey,
        actorType: operation.actorType,
        actorRef: operation.actorRef
      }
    });
  }

  function transitionLeaseMatches(row, request, occurredAt, expectedState) {
    return (
      row.state === expectedState
      && row.lease_generation === request.leaseGeneration
      && row.lease_token === request.leaseToken
      && typeof row.lease_until === "string"
      && row.lease_until > occurredAt
    );
  }

  function rebaseOutboxLeaseMatches(row, request, occurredAt) {
    return (
      row.state === "processing"
      && row.lease_generation === request.leaseGeneration
      && row.lease_token === request.leaseToken
      && typeof row.lease_until === "string"
      && row.lease_until > occurredAt
    );
  }

  function pendingRebaseOutbox({ row, occurredAt }) {
    const successor = projectEffectSuccessor(row);
    if (successor === null || !REFERENCE.test(row.effect_ref)) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const inserted = db.prepare(`
      insert into ${REBASES_TABLE} (
        settled_transition_ref, account_id, effect_ref,
        effect_entitlement_id, effect_request_id, effect_issued_link_id,
        effect_valid_until, state, lease_generation, lease_token, lease_until,
        safe_code, created_at, updated_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, ?, 'pending', 0, null, null, null, ?, ?, null)
    `).run(
      row.transition_ref,
      row.account_id,
      row.effect_ref,
      successor.entitlementId,
      successor.requestId,
      successor.issuedLinkId,
      successor.validUntil,
      occurredAt,
      occurredAt
    );
    if (inserted.changes !== 1) {
      throw storeError("deferred_transition_infrastructure_error");
    }
  }

  function expireLeaseBoundRebases(occurredAt) {
    db.prepare(`
      update ${REBASES_TABLE}
         set state = 'pending', lease_token = null, lease_until = null,
             updated_at = ?
       where state = 'processing' and lease_until <= ?
    `).run(occurredAt, occurredAt);
  }

  function safeRebaseCode(error) {
    if (isStoreError(error) && SAFE_CODE.test(error.code)) return error.code;
    return "deferred_rebase_binding_invalid";
  }

  function completeClaimedRebaseOutbox({ outbox, request, occurredAt }) {
    const completed = db.prepare(`
      update ${REBASES_TABLE}
         set state = 'completed', lease_token = null, lease_until = null,
             completed_at = ?, updated_at = ?
       where settled_transition_ref = ? and state = 'processing'
         and lease_generation = ? and lease_token = ? and lease_until > ?
    `).run(
      occurredAt,
      occurredAt,
      outbox.settled_transition_ref,
      request.leaseGeneration,
      request.leaseToken,
      occurredAt
    );
    if (completed.changes !== 1) throw storeError("deferred_transition_lease_lost");
    return rebaseOutboxTerminalProjection(findRebaseOutbox(outbox.settled_transition_ref));
  }

  function reconcileClaimedRebaseOutbox({ outbox, request, occurredAt, safeCode }) {
    const reconciled = db.prepare(`
      update ${REBASES_TABLE}
         set state = 'reconciliation_required', lease_token = null,
             lease_until = null, safe_code = ?, updated_at = ?
       where settled_transition_ref = ? and state = 'processing'
         and lease_generation = ? and lease_token = ? and lease_until > ?
    `).run(
      safeCode,
      occurredAt,
      outbox.settled_transition_ref,
      request.leaseGeneration,
      request.leaseToken,
      occurredAt
    );
    if (reconciled.changes !== 1) throw storeError("deferred_transition_lease_lost");
    return rebaseOutboxTerminalProjection(findRebaseOutbox(outbox.settled_transition_ref));
  }

  function markReconciliation({ row, request, occurredAt, operationType, safeCode, receiptStatus = "failed" }) {
    const receiptRef = insertStartedReceipt({
      transitionRef: row.transition_ref,
      accountId: row.account_id,
      operationType,
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    const updated = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'reconciliation_required',
             lease_token = null,
             lease_until = null,
             safe_code = ?,
             updated_at = ?
       where transition_ref = ?
         and state = ?
         and lease_generation = ?
         and lease_token = ?
         and lease_until > ?
    `).run(
      safeCode,
      occurredAt,
      row.transition_ref,
      row.state,
      request.leaseGeneration,
      request.leaseToken,
      occurredAt
    );
    if (updated.changes !== 1) throw storeError("deferred_transition_lease_lost");
    appendEvent({
      transitionRef: row.transition_ref,
      eventType: "transition_reconciliation_required",
      safeCode,
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeReceipt({
      operationRef: receiptRef,
      status: receiptStatus,
      safeCode,
      occurredAt
    });
    return publicProjection(findTransition(row.transition_ref));
  }

  function reconcileExpiredEffectAppliedForSuccessorDrift({ row, occurredAt, safeCode }) {
    const system = systemOperation(
      row.account_id,
      `deferred-recover-effect-reconcile:${row.transition_ref}`
    );
    const reconciled = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'reconciliation_required', lease_token = null,
             lease_until = null, safe_code = ?, updated_at = ?
       where transition_ref = ? and state = 'effect_applied'
         and lease_generation = ? and lease_token = ? and lease_until <= ?
    `).run(
      safeCode,
      occurredAt,
      row.transition_ref,
      row.lease_generation,
      row.lease_token,
      occurredAt
    );
    if (reconciled.changes !== 1) return false;
    appendEvent({
      transitionRef: row.transition_ref,
      eventType: "transition_reconciliation_required",
      safeCode,
      actorType: system.actorType,
      actorRef: system.actorRef,
      occurredAt
    });
    return true;
  }

  function reserveTransitionBody(request, occurredAt) {
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "reserve_transition",
      digest: request.requestDigest
    });
    if (replay) return publicProjection(replay.row);

    const duplicate = db.prepare(`
      select transition_ref from ${TRANSITIONS_TABLE}
       where order_ref = ?
       limit 1
    `).get(request.orderRef);
    if (duplicate) throw storeError("deferred_transition_account_conflict");

    const queuedCount = db.prepare(`
      select count(*) from ${TRANSITIONS_TABLE}
       where account_id = ?
         and state not in ('settled', 'cancelled')
    `).pluck().get(request.accountId);
    if (!Number.isSafeInteger(queuedCount)) {
      throw storeError("deferred_transition_infrastructure_error");
    }
    if (queuedCount >= MAX_DEFERRED_TRANSITIONS_PER_ACCOUNT) {
      throw storeError("deferred_transition_queue_full");
    }

    if (request.flowKind === "initial_activation") {
      const active = db.prepare(`
        select 1 from ${TRANSITIONS_TABLE}
         where account_id = ?
           and state in ('reserved', 'processing', 'effect_applied')
         limit 1
      `).pluck().get(request.accountId);
      if (active) throw storeError("deferred_transition_account_conflict");
    }
    assertOfferVersion(request);
    assertReserveResourceChain(request, occurredAt);
    const transitionRef = nextReference("deferred_transition");
    const reservationRef = nextReference("deferred_reservation");
    const binding = createReservation({ request, transitionRef, reservationRef });
    if (!binding.valid) {
      throw storeError(
        binding.safeCode === "bonus_expires_before_activation"
          ? binding.safeCode
          : "deferred_reservation_invalid"
      );
    }
    if (binding.reservation.state !== "reserved") {
      throw storeError("deferred_reservation_not_active");
    }
    const assessment = assessReservationAt(binding, {
      activationAt: request.scheduledFor,
      evaluationAt: occurredAt
    });
    if (assessment.status !== "reservable") {
      throw storeError(assessment.reasonCode);
    }

    const inserted = db.prepare(`
      insert into ${TRANSITIONS_TABLE} (
        transition_ref, account_id, order_ref, offer_version_ref, reservation_ref,
        commercial_model, flow_kind, plan_rank, amount_units,
        offer_snapshot_json, allocation_snapshot_json, reserved_at, scheduled_for,
        expected_entitlement_id, expected_request_id, expected_issued_link_id,
        expected_valid_until, rebase_generation, state, lease_generation,
        lease_token, lease_until, effect_ref, safe_code, settled_at,
        created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'reserved', 0,
        null, null, null, null, null, ?, ?)
    `).run(
      transitionRef,
      request.accountId,
      request.orderRef,
      request.offerVersionRef,
      reservationRef,
      WALLET_FIRST_COMMERCIAL_MODEL,
      request.flowKind,
      request.planRank,
      request.amountUnits,
      canonicalJson(request.offerSnapshot),
      canonicalJson(binding.allocation),
      occurredAt,
      request.scheduledFor,
      request.expectedEntitlementId,
      request.expectedRequestId,
      request.expectedIssuedLinkId,
      request.expectedValidUntil,
      occurredAt,
      occurredAt
    );
    if (inserted.changes !== 1) throw storeError("deferred_transition_infrastructure_error");
    const receiptRef = insertStartedReceipt({
      transitionRef,
      accountId: request.accountId,
      operationType: "reserve_transition",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    appendEvent({
      transitionRef,
      eventType: "transition_reserved",
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeReceipt({ operationRef: receiptRef, resultRef: transitionRef, occurredAt });
    return publicProjection(findTransition(transitionRef));
  }

  const directReserveTransaction = db.transaction((context) => (
    reserveTransitionBody(resolveDirectReserveRequest(context), normalizeNow(nowFn))
  ));

  const reserveCheckoutQuoteTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const prepared = prepareWalletFirstDeferredCheckoutQuoteReservationInTransaction({
      database: db,
      accountId: request.accountId,
      quoteRef: request.quoteRef,
      operation: request.operation,
      occurredAt
    });
    if (prepared.kind === "error") return prepared;
    if (prepared.kind === "replay") {
      const transition = findTransition(prepared.transitionRef);
      if (!transition || transition.account_id !== request.accountId) {
        throw storeError("deferred_transition_infrastructure_error");
      }
      return Object.freeze({ kind: "transition", transition: publicProjection(transition) });
    }
    if (prepared.kind !== "reserve") {
      throw storeError("deferred_transition_infrastructure_error");
    }
    const transition = reserveTransitionBody(
      normalizeTrustedReserveRequest(prepared.reserveRequest),
      occurredAt
    );
    markWalletFirstDeferredCheckoutQuoteReservedInTransaction({
      database: db,
      quoteRef: prepared.quoteRef,
      transitionRef: transition.transitionRef,
      operation: prepared.operation,
      occurredAt
    });
    return Object.freeze({ kind: "transition", transition });
  });

  function expireLeaseBoundTransitions(occurredAt) {
    // An effect_applied row has a durable successor snapshot. Its expired
    // lease is recovered by claimNextRecoverableEffectAppliedTransition(),
    // never silently quarantined here: reconciling it would invite an
    // integration to rediscover or replay an already-applied external effect.
    db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'reserved', lease_token = null, lease_until = ?, updated_at = ?
       where state = 'processing' and lease_until <= ?
    `).run(null, occurredAt, occurredAt);
  }

  const claimTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const leaseUntil = addMilliseconds(occurredAt, request.leaseMs);
    expireLeaseBoundTransitions(occurredAt);
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = db.prepare(`
        select t.* from ${TRANSITIONS_TABLE} t
         where t.state = 'reserved'
           and t.scheduled_for <= ?
           and not exists (
             select 1 from ${TRANSITIONS_TABLE} active
              where active.account_id = t.account_id
                and active.state in ('processing', 'effect_applied')
           )
           and not exists (
             select 1 from ${TRANSITIONS_TABLE} reconciliation
              where reconciliation.account_id = t.account_id
                and reconciliation.state = 'reconciliation_required'
           )
           and not exists (
             select 1 from ${REBASES_TABLE} rebase_blocker
              where rebase_blocker.account_id = t.account_id
                and rebase_blocker.state in (
                  'pending', 'processing', 'reconciliation_required'
                )
           )
           and not exists (
             select 1 from ${TRANSITIONS_TABLE} preferred
              where preferred.account_id = t.account_id
                and preferred.state = 'reserved'
                and preferred.scheduled_for <= ?
                and (
                  preferred.plan_rank > t.plan_rank
                  or (
                    preferred.plan_rank = t.plan_rank
                    and (
                      preferred.reserved_at < t.reserved_at
                      or (
                        preferred.reserved_at = t.reserved_at
                        and preferred.transition_ref < t.transition_ref
                      )
                    )
                  )
                )
           )
         order by t.scheduled_for asc, t.reserved_at asc, t.transition_ref asc
         limit 1
      `).get(occurredAt, occurredAt);
      if (!candidate) return null;
      const binding = transitionReservation(candidate);
      if (!binding.valid || binding.reservation.state !== "reserved") {
        const system = systemOperation(
          candidate.account_id,
          `deferred-reconcile-reservation:${candidate.transition_ref}`
        );
        const requestForReconciliation = {
          operation: system,
          requestDigest: requestDigest("reconcile_transition", {
            transitionRef: candidate.transition_ref,
            leaseGeneration: candidate.lease_generation,
            leaseToken: candidate.lease_token,
            safeCode: "deferred_reservation_invalid"
          }),
          leaseGeneration: candidate.lease_generation,
          leaseToken: candidate.lease_token
        };
        const receiptRef = insertStartedReceipt({
          transitionRef: candidate.transition_ref,
          accountId: candidate.account_id,
          operationType: "reconcile_transition",
          operation: system,
          digest: requestForReconciliation.requestDigest,
          occurredAt
        });
        const reconciled = db.prepare(`
          update ${TRANSITIONS_TABLE}
             set state = 'reconciliation_required', safe_code = 'deferred_reservation_invalid', updated_at = ?
           where transition_ref = ? and state = 'reserved'
        `).run(occurredAt, candidate.transition_ref);
        if (reconciled.changes !== 1) continue;
        appendEvent({
          transitionRef: candidate.transition_ref,
          eventType: "transition_reconciliation_required",
          safeCode: "deferred_reservation_invalid",
          actorType: system.actorType,
          actorRef: system.actorRef,
          occurredAt
        });
        completeReceipt({
          operationRef: receiptRef,
          status: "failed",
          safeCode: "deferred_reservation_invalid",
          occurredAt
        });
        continue;
      }
      const assessment = assessReservationAt(binding, {
        activationAt: candidate.scheduled_for,
        evaluationAt: occurredAt
      });
      if (assessment.status !== "reservable") {
        const system = systemOperation(
          candidate.account_id,
          `deferred-requote:${candidate.transition_ref}`
        );
        releaseReservation({
          row: candidate,
          operation: system,
          operationKey: `deferred-release-requote:${candidate.transition_ref}`
        });
        const receiptRef = insertStartedReceipt({
          transitionRef: candidate.transition_ref,
          accountId: candidate.account_id,
          operationType: "require_requote",
          operation: system,
          digest: requestDigest("require_requote", {
            transitionRef: candidate.transition_ref,
            safeCode: assessment.reasonCode
          }),
          occurredAt
        });
        const requoted = db.prepare(`
          update ${TRANSITIONS_TABLE}
             set state = 'requote_required', safe_code = ?, updated_at = ?
           where transition_ref = ? and state = 'reserved'
        `).run(assessment.reasonCode, occurredAt, candidate.transition_ref);
        if (requoted.changes !== 1) throw storeError("deferred_transition_state_conflict");
        appendEvent({
          transitionRef: candidate.transition_ref,
          eventType: "transition_requote_required",
          safeCode: assessment.reasonCode,
          actorType: system.actorType,
          actorRef: system.actorRef,
          occurredAt
        });
        completeReceipt({
          operationRef: receiptRef,
          resultRef: candidate.transition_ref,
          occurredAt
        });
        continue;
      }
      const leaseToken = nextLeaseToken();
      const updated = db.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = 'processing', lease_generation = lease_generation + 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where transition_ref = ? and state = 'reserved'
      `).run(leaseToken, leaseUntil, occurredAt, candidate.transition_ref);
      if (updated.changes !== 1) continue;
      const system = systemOperation(
        candidate.account_id,
        `deferred-claim:${candidate.transition_ref}:${leaseToken}`
      );
      const claimed = findTransition(candidate.transition_ref);
      const receiptRef = insertStartedReceipt({
        transitionRef: candidate.transition_ref,
        accountId: candidate.account_id,
        operationType: "claim_transition",
        operation: system,
        digest: requestDigest("claim_transition", {
          transitionRef: candidate.transition_ref,
          leaseGeneration: claimed.lease_generation,
          leaseToken,
          leaseUntil
        }),
        occurredAt
      });
      appendEvent({
        transitionRef: candidate.transition_ref,
        eventType: "transition_claimed",
        actorType: system.actorType,
        actorRef: system.actorRef,
        occurredAt
      });
      completeReceipt({
        operationRef: receiptRef,
        resultRef: candidate.transition_ref,
        occurredAt
      });
      return claimProjection(findTransition(candidate.transition_ref));
    }
    throw storeError("deferred_transition_busy");
  });

  // This is deliberately store-owned rather than exposing the wallet
  // participant to the coordinator. It re-reads the claimed transition under
  // the exact BEGIN IMMEDIATE transaction that the participant requires, so a
  // stale lease cannot validate a reservation for a newer worker.
  const verifyClaimedReservationTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const row = findTransition(request.transitionRef);
    if (!row) throw storeError("deferred_transition_not_found");
    if (!transitionLeaseMatches(row, request, occurredAt, "processing")) {
      throw storeError("deferred_transition_lease_lost");
    }
    const binding = transitionReservation(row);
    if (!binding.valid) {
      return Object.freeze({
        ok: false,
        reservationRef: row.reservation_ref,
        safeResultCode: binding.safeCode ?? "deferred_reservation_invalid"
      });
    }
    if (binding.reservation.state !== "reserved") {
      return Object.freeze({
        ok: false,
        reservationRef: row.reservation_ref,
        safeResultCode: "deferred_reservation_not_active"
      });
    }
    const assessment = assessReservationAt(binding, {
      activationAt: row.scheduled_for,
      evaluationAt: occurredAt
    });
    if (assessment.status !== "reservable") {
      return Object.freeze({
        ok: false,
        reservationRef: row.reservation_ref,
        safeResultCode: assessment.reasonCode
      });
    }
    if (row.flow_kind === "scheduled_switch") {
      try {
        assertExpectedChain({
          flowKind: row.flow_kind,
          accountId: row.account_id,
          expectedEntitlementId: row.expected_entitlement_id,
          expectedRequestId: row.expected_request_id,
          expectedIssuedLinkId: row.expected_issued_link_id,
          expectedValidUntil: row.expected_valid_until
        }, occurredAt, {
          // Only this already-leased, still-reservable verification may cross
          // the predecessor's natural expiry.
          allowExpiredScheduledBoundary: true
        });
      } catch (error) {
        if (isStoreError(error) && error.code === "deferred_transition_expected_chain_invalid") {
          return Object.freeze({
            ok: false,
            reservationRef: row.reservation_ref,
            safeResultCode: error.code
          });
        }
        throw error;
      }
    }
    return Object.freeze({
      ok: true,
      reservationRef: binding.reservation.reservationRef,
      state: binding.reservation.state,
      activationAt: binding.reservation.activationAt,
      expiresAt: binding.reservation.expiresAt,
      allocationSnapshot: binding.allocation
    });
  });

  const recoverEffectAppliedTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const leaseUntil = addMilliseconds(occurredAt, request.leaseMs);
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = db.prepare(`
        select * from ${TRANSITIONS_TABLE}
         where state = 'effect_applied' and lease_until <= ?
         order by lease_until asc, updated_at asc, transition_ref asc
         limit 1
      `).get(occurredAt);
      if (!candidate) return null;
      const projection = projectAccountTransition(candidate);
      if (projection.effectSuccessor === null) {
        throw storeError("deferred_transition_infrastructure_error");
      }
      try {
        assertEffectSuccessor({
          row: candidate,
          successor: projection.effectSuccessor,
          occurredAt
        });
      } catch (error) {
        if (
          isStoreError(error)
          && error.code === "deferred_transition_expected_chain_invalid"
        ) {
          reconcileExpiredEffectAppliedForSuccessorDrift({
            row: candidate,
            occurredAt,
            safeCode: error.code
          });
          continue;
        }
        throw error;
      }
      const leaseToken = nextLeaseToken();
      const updated = db.prepare(`
        update ${TRANSITIONS_TABLE}
           set lease_generation = lease_generation + 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where transition_ref = ? and state = 'effect_applied'
           and lease_generation = ? and lease_token = ? and lease_until <= ?
      `).run(
        leaseToken,
        leaseUntil,
        occurredAt,
        candidate.transition_ref,
        candidate.lease_generation,
        candidate.lease_token,
        occurredAt
      );
      if (updated.changes !== 1) continue;
      return recoverableEffectProjection(findTransition(candidate.transition_ref));
    }
    throw storeError("deferred_transition_busy");
  });

  const recordEffectTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "record_effect",
      digest: request.requestDigest
    });
    if (replay) return publicProjection(replay.row);
    const row = findTransition(request.transitionRef);
    if (!row) throw storeError("deferred_transition_not_found");
    if (!transitionLeaseMatches(row, request, occurredAt, "processing")) {
      throw storeError("deferred_transition_lease_lost");
    }
    const effectCollision = db.prepare(`
      select transition_ref from ${TRANSITIONS_TABLE}
       where effect_ref = ? and transition_ref <> ?
       limit 1
    `).get(request.effectRef, request.transitionRef);
    if (effectCollision) throw storeError("deferred_transition_state_conflict");
    assertEffectSuccessor({ row, successor: request.successor, occurredAt });
    const receiptRef = insertStartedReceipt({
      transitionRef: row.transition_ref,
      accountId: row.account_id,
      operationType: "record_effect",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    const updated = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'effect_applied', effect_ref = ?,
             effect_entitlement_id = ?, effect_request_id = ?,
             effect_issued_link_id = ?, effect_valid_until = ?, updated_at = ?
       where transition_ref = ? and state = 'processing'
         and lease_generation = ? and lease_token = ? and lease_until > ?
    `).run(
      request.effectRef,
      request.successor.entitlementId,
      request.successor.requestId,
      request.successor.issuedLinkId,
      request.successor.validUntil,
      occurredAt,
      row.transition_ref,
      request.leaseGeneration,
      request.leaseToken,
      occurredAt
    );
    if (updated.changes !== 1) throw storeError("deferred_transition_lease_lost");
    appendEvent({
      transitionRef: row.transition_ref,
      eventType: "resource_effect_applied",
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeReceipt({ receiptRef, operationRef: receiptRef, resultRef: request.effectRef, occurredAt });
    return publicProjection(findTransition(row.transition_ref));
  });

  const settleTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "settle_transition",
      digest: request.requestDigest
    });
    if (replay) return publicProjection(replay.row);
    const row = findTransition(request.transitionRef);
    if (!row) throw storeError("deferred_transition_not_found");
    if (!transitionLeaseMatches(row, request, occurredAt, "effect_applied")) {
      throw storeError("deferred_transition_lease_lost");
    }
    const binding = transitionReservation(row);
    if (!binding.valid || binding.reservation.state !== "reserved") {
      return markReconciliation({
        row,
        request,
        occurredAt,
        operationType: "settle_transition",
        safeCode: "deferred_reservation_invalid"
      });
    }
    const assessment = assessReservationAt(binding, {
      activationAt: row.scheduled_for,
      evaluationAt: occurredAt
    });
    if (assessment.status !== "reservable") {
      return markReconciliation({
        row,
        request,
        occurredAt,
        operationType: "settle_transition",
        safeCode: assessment.reasonCode
      });
    }
    const receiptRef = insertStartedReceipt({
      transitionRef: row.transition_ref,
      accountId: row.account_id,
      operationType: "settle_transition",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    const captured = runReservationOperation({
      methodName: "captureReservationInTransaction",
      reservationRef: row.reservation_ref,
      operation: {
        actorScope: request.operation.actorScope,
        idempotencyKey: `deferred-reservation-capture:${row.transition_ref}`,
        actorType: request.operation.actorType,
        actorRef: request.operation.actorRef
      }
    });
    if (!captured || captured.safeResultCode !== "captured") {
      const safeCode = "deferred_reservation_capture_invalid";
      const updated = db.prepare(`
        update ${TRANSITIONS_TABLE}
           set state = 'reconciliation_required', lease_token = null,
               lease_until = null, safe_code = ?, updated_at = ?
         where transition_ref = ? and state = 'effect_applied'
           and lease_generation = ? and lease_token = ? and lease_until > ?
      `).run(
        safeCode,
        occurredAt,
        row.transition_ref,
        request.leaseGeneration,
        request.leaseToken,
        occurredAt
      );
      if (updated.changes !== 1) throw storeError("deferred_transition_lease_lost");
      appendEvent({
        transitionRef: row.transition_ref,
        eventType: "transition_reconciliation_required",
        safeCode,
        actorType: request.operation.actorType,
        actorRef: request.operation.actorRef,
        occurredAt
      });
      completeReceipt({
        operationRef: receiptRef,
        status: "failed",
        safeCode,
        occurredAt
      });
      return publicProjection(findTransition(row.transition_ref));
    }
    pendingRebaseOutbox({ row, occurredAt });
    const updated = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'settled', lease_token = null, lease_until = null,
             settled_at = ?, updated_at = ?
       where transition_ref = ? and state = 'effect_applied'
         and lease_generation = ? and lease_token = ? and lease_until > ?
    `).run(
      occurredAt,
      occurredAt,
      row.transition_ref,
      request.leaseGeneration,
      request.leaseToken,
      occurredAt
    );
    if (updated.changes !== 1) throw storeError("deferred_transition_lease_lost");
    appendEvent({
      transitionRef: row.transition_ref,
      eventType: "transition_settled",
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeReceipt({ receiptRef, operationRef: receiptRef, resultRef: row.transition_ref, occurredAt });
    return publicProjection(findTransition(row.transition_ref));
  });

  const cancelTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "cancel_transition",
      digest: request.requestDigest
    });
    if (replay) return publicProjection(replay.row);
    const row = findTransition(request.transitionRef);
    if (!row || row.account_id !== request.accountId) {
      throw storeError("deferred_transition_not_found");
    }
    if (row.state !== "reserved") throw storeError("deferred_transition_state_conflict");
    const binding = transitionReservation(row);
    if (!binding.valid || binding.reservation.state !== "reserved") {
      throw storeError("deferred_reservation_invalid");
    }
    releaseReservation({
      row,
      operation: request.operation,
      operationKey: `deferred-cancel:${row.transition_ref}`
    });
    const receiptRef = insertStartedReceipt({
      transitionRef: row.transition_ref,
      accountId: row.account_id,
      operationType: "cancel_transition",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    const updated = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'cancelled', updated_at = ?
       where transition_ref = ? and account_id = ? and state = 'reserved'
    `).run(occurredAt, row.transition_ref, request.accountId);
    if (updated.changes !== 1) throw storeError("deferred_transition_state_conflict");
    appendEvent({
      transitionRef: row.transition_ref,
      eventType: "transition_cancelled",
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeReceipt({ receiptRef, operationRef: receiptRef, resultRef: row.transition_ref, occurredAt });
    return publicProjection(findTransition(row.transition_ref));
  });

  const requireRequoteTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "require_requote",
      digest: request.requestDigest
    });
    if (replay) return publicProjection(replay.row);
    const row = findTransition(request.transitionRef);
    if (!row) throw storeError("deferred_transition_not_found");
    if (!transitionLeaseMatches(row, request, occurredAt, "processing")) {
      throw storeError("deferred_transition_lease_lost");
    }
    const binding = transitionReservation(row);
    if (!binding.valid || binding.reservation.state !== "reserved") {
      return markReconciliation({
        row,
        request,
        occurredAt,
        operationType: "require_requote",
        safeCode: "deferred_reservation_invalid"
      });
    }
    releaseReservation({
      row,
      operation: request.operation,
      operationKey: `deferred-release-requote:${row.transition_ref}`
    });
    const receiptRef = insertStartedReceipt({
      transitionRef: row.transition_ref,
      accountId: row.account_id,
      operationType: "require_requote",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    const updated = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'requote_required', lease_token = null, lease_until = null,
             safe_code = ?, updated_at = ?
       where transition_ref = ? and state = 'processing'
         and lease_generation = ? and lease_token = ? and lease_until > ?
    `).run(
      request.safeCode,
      occurredAt,
      row.transition_ref,
      request.leaseGeneration,
      request.leaseToken,
      occurredAt
    );
    if (updated.changes !== 1) throw storeError("deferred_transition_lease_lost");
    appendEvent({
      transitionRef: row.transition_ref,
      eventType: "transition_requote_required",
      safeCode: request.safeCode,
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeReceipt({ receiptRef, operationRef: receiptRef, resultRef: row.transition_ref, occurredAt });
    return publicProjection(findTransition(row.transition_ref));
  });

  const reconcileTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "reconcile_transition",
      digest: request.requestDigest
    });
    if (replay) return publicProjection(replay.row);
    const row = findTransition(request.transitionRef);
    if (!row) throw storeError("deferred_transition_not_found");
    if (![
      "processing", "effect_applied"
    ].includes(row.state) || !transitionLeaseMatches(row, request, occurredAt, row.state)) {
      throw storeError("deferred_transition_lease_lost");
    }
    return markReconciliation({
      row,
      request,
      occurredAt,
      operationType: "reconcile_transition",
      safeCode: request.safeCode
    });
  });

  function assertOutboxSettledTransition(outbox, occurredAt) {
    const outboxProjection = projectRebaseOutbox(outbox);
    const transition = findTransition(outbox.settled_transition_ref);
    if (
      !transition
      || transition.state !== "settled"
      || transition.account_id !== outbox.account_id
      || transition.effect_ref !== outbox.effect_ref
      || transition.effect_entitlement_id !== outbox.effect_entitlement_id
      || transition.effect_request_id !== outbox.effect_request_id
      || transition.effect_issued_link_id !== outbox.effect_issued_link_id
      || transition.effect_valid_until !== outbox.effect_valid_until
    ) {
      throw storeError("deferred_rebase_binding_invalid");
    }
    const projected = projectAccountTransition(transition);
    if (
      projected.effectSuccessor === null
      || canonicalJson(projected.effectSuccessor) !== canonicalJson(outboxProjection.successor)
    ) {
      throw storeError("deferred_rebase_binding_invalid");
    }
    assertExactCurrentResourceChain({
      accountId: outbox.account_id,
      entitlementId: projected.effectSuccessor.entitlementId,
      requestId: projected.effectSuccessor.requestId,
      issuedLinkId: projected.effectSuccessor.issuedLinkId,
      validUntil: projected.effectSuccessor.validUntil,
      occurredAt,
      code: "deferred_transition_expected_chain_invalid"
    });
    return Object.freeze({ transition, successor: projected.effectSuccessor });
  }

  function markReservedTargetReconciliation({ target, occurredAt, operation, safeCode }) {
    const reconciled = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'reconciliation_required', safe_code = ?, updated_at = ?
       where transition_ref = ? and state = 'reserved' and rebase_generation = ?
    `).run(
      safeCode,
      occurredAt,
      target.transition_ref,
      target.rebase_generation
    );
    if (reconciled.changes !== 1) throw storeError("deferred_transition_state_conflict");
    appendEvent({
      transitionRef: target.transition_ref,
      eventType: "transition_reconciliation_required",
      safeCode,
      actorType: operation.actorType,
      actorRef: operation.actorRef,
      occurredAt
    });
  }

  function releaseAndRequoteReservedTarget({ target, occurredAt, operation, operationKey, safeCode }) {
    releaseReservation({ row: target, operation, operationKey });
    const requoted = db.prepare(`
      update ${TRANSITIONS_TABLE}
         set state = 'requote_required', safe_code = ?, updated_at = ?
       where transition_ref = ? and state = 'reserved' and rebase_generation = ?
    `).run(
      safeCode,
      occurredAt,
      target.transition_ref,
      target.rebase_generation
    );
    if (requoted.changes !== 1) throw storeError("deferred_transition_state_conflict");
    appendEvent({
      transitionRef: target.transition_ref,
      eventType: "transition_requote_required",
      safeCode,
      actorType: operation.actorType,
      actorRef: operation.actorRef,
      occurredAt
    });
  }

  const claimNextPendingRebaseTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const leaseUntil = addMilliseconds(occurredAt, request.leaseMs);
    expireLeaseBoundRebases(occurredAt);
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = db.prepare(`
        select * from ${REBASES_TABLE}
         where state = 'pending'
         order by created_at asc, settled_transition_ref asc
         limit 1
      `).get();
      if (!candidate) return null;
      const leaseToken = nextLeaseToken();
      const claimed = db.prepare(`
        update ${REBASES_TABLE}
           set state = 'processing', lease_generation = lease_generation + 1,
               lease_token = ?, lease_until = ?, updated_at = ?
         where settled_transition_ref = ? and state = 'pending'
           and lease_generation = ? and lease_token is null and lease_until is null
      `).run(
        leaseToken,
        leaseUntil,
        occurredAt,
        candidate.settled_transition_ref,
        candidate.lease_generation
      );
      if (claimed.changes !== 1) continue;
      return rebaseOutboxClaimProjection(findRebaseOutbox(candidate.settled_transition_ref));
    }
    throw storeError("deferred_transition_busy");
  });

  const applyClaimedRebaseTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "rebase_transition",
      digest: request.requestDigest
    });
    if (replay) {
      const existing = findRebaseOutbox(request.settledTransitionRef);
      if (!existing) throw storeError("deferred_transition_infrastructure_error");
      return rebaseOutboxTerminalProjection(existing);
    }
    const outbox = findRebaseOutbox(request.settledTransitionRef);
    if (!outbox) throw storeError("deferred_transition_not_found");
    if (!rebaseOutboxLeaseMatches(outbox, request, occurredAt)) {
      throw storeError("deferred_transition_lease_lost");
    }
    const receiptRef = insertStartedReceipt({
      transitionRef: outbox.settled_transition_ref,
      accountId: outbox.account_id,
      operationType: "rebase_transition",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    let settled;
    try {
      settled = assertOutboxSettledTransition(outbox, occurredAt);
    } catch (error) {
      const safeCode = safeRebaseCode(error);
      const reconciled = reconcileClaimedRebaseOutbox({
        outbox,
        request,
        occurredAt,
        safeCode
      });
      completeReceipt({
        operationRef: receiptRef,
        status: "failed",
        safeCode,
        occurredAt
      });
      return reconciled;
    }
    const targets = db.prepare(`
      select * from ${TRANSITIONS_TABLE}
       where account_id = ? and state = 'reserved' and flow_kind = 'scheduled_switch'
       order by plan_rank desc, reserved_at asc, transition_ref asc
    `).all(outbox.account_id);
    const preflightTargets = [];
    for (const target of targets) {
      if (settled.successor.validUntil <= target.scheduled_for) {
        markReservedTargetReconciliation({
          target,
          occurredAt,
          operation: request.operation,
          safeCode: "deferred_transition_expected_chain_invalid"
        });
        const reconciled = reconcileClaimedRebaseOutbox({
          outbox,
          request,
          occurredAt,
          safeCode: "deferred_transition_expected_chain_invalid"
        });
        completeReceipt({
          operationRef: receiptRef,
          status: "failed",
          safeCode: "deferred_transition_expected_chain_invalid",
          occurredAt
        });
        return reconciled;
      }
      let preflight;
      try {
        preflight = rebaseReservationBinding({
          methodName: "preflightRebaseReservationInTransaction",
          row: target,
          activationAt: settled.successor.validUntil
        });
      } catch (error) {
        const safeCode = safeRebaseCode(error);
        markReservedTargetReconciliation({
          target,
          occurredAt,
          operation: request.operation,
          safeCode
        });
        const reconciled = reconcileClaimedRebaseOutbox({
          outbox,
          request,
          occurredAt,
          safeCode
        });
        completeReceipt({ operationRef: receiptRef, status: "failed", safeCode, occurredAt });
        return reconciled;
      }
      if (
        !preflight.valid
        && [
          "bonus_expires_before_activation",
          "deferred_reservation_expired_before_capture"
        ].includes(preflight.safeCode)
      ) {
        preflightTargets.push(Object.freeze({
          target,
          kind: "requote",
          safeCode: preflight.safeCode
        }));
        continue;
      }
      if (!preflight.valid || preflight.reservation.state !== "reserved") {
        const safeCode = preflight.safeCode ?? "deferred_reservation_invalid";
        markReservedTargetReconciliation({
          target,
          occurredAt,
          operation: request.operation,
          safeCode
        });
        const reconciled = reconcileClaimedRebaseOutbox({
          outbox,
          request,
          occurredAt,
          safeCode
        });
        completeReceipt({ operationRef: receiptRef, status: "failed", safeCode, occurredAt });
        return reconciled;
      }
      const assessment = assessReservationAt(preflight, {
        activationAt: settled.successor.validUntil,
        evaluationAt: occurredAt
      });
      if (assessment.status !== "reservable") {
        preflightTargets.push(Object.freeze({
          target,
          kind: "requote",
          safeCode: assessment.reasonCode
        }));
        continue;
      }
      preflightTargets.push(Object.freeze({ target, kind: "rebase" }));
    }
    for (const item of preflightTargets) {
      if (item.kind === "requote") {
        releaseAndRequoteReservedTarget({
          target: item.target,
          occurredAt,
          operation: request.operation,
          operationKey: `deferred-rebase-release:${outbox.settled_transition_ref}:${item.target.transition_ref}`,
          safeCode: item.safeCode
        });
        continue;
      }
      const target = item.target;
      const updated = db.prepare(`
        update ${TRANSITIONS_TABLE}
           set scheduled_for = ?, expected_entitlement_id = ?, expected_request_id = ?,
               expected_issued_link_id = ?, expected_valid_until = ?,
               rebase_generation = rebase_generation + 1, updated_at = ?
         where transition_ref = ? and state = 'reserved' and flow_kind = 'scheduled_switch'
           and rebase_generation = ?
      `).run(
        settled.successor.validUntil,
        settled.successor.entitlementId,
        settled.successor.requestId,
        settled.successor.issuedLinkId,
        settled.successor.validUntil,
        occurredAt,
        target.transition_ref,
        target.rebase_generation
      );
      if (updated.changes !== 1) throw storeError("deferred_transition_state_conflict");
      let rebound;
      try {
        rebound = rebaseReservationOperation({
          row: target,
          operation: request.operation,
          operationKey: `deferred-rebase-reservation:${outbox.settled_transition_ref}:${target.transition_ref}`,
          activationAt: settled.successor.validUntil
        });
      } catch {
        throw storeError("deferred_rebase_binding_invalid");
      }
      if (
        !rebound.valid
        && [
          "bonus_expires_before_activation",
          "deferred_reservation_expired_before_capture"
        ].includes(rebound.safeCode)
      ) {
        releaseReservation({
          row: target,
          operation: request.operation,
          operationKey: `deferred-rebase-release-after-rebind:${outbox.settled_transition_ref}:${target.transition_ref}`
        });
        const requoted = db.prepare(`
          update ${TRANSITIONS_TABLE}
             set state = 'requote_required', safe_code = ?, updated_at = ?
           where transition_ref = ? and state = 'reserved'
             and rebase_generation = ?
        `).run(
          rebound.safeCode,
          occurredAt,
          target.transition_ref,
          target.rebase_generation + 1
        );
        if (requoted.changes !== 1) throw storeError("deferred_transition_state_conflict");
        appendEvent({
          transitionRef: target.transition_ref,
          eventType: "transition_requote_required",
          safeCode: rebound.safeCode,
          actorType: request.operation.actorType,
          actorRef: request.operation.actorRef,
          occurredAt
        });
        continue;
      }
      if (!rebound.valid || rebound.reservation.state !== "reserved") {
        const safeCode = rebound.safeCode ?? "deferred_reservation_invalid";
        markReservedTargetReconciliation({
          target: {
            ...target,
            rebase_generation: target.rebase_generation + 1
          },
          occurredAt,
          operation: request.operation,
          safeCode
        });
        const reconciled = reconcileClaimedRebaseOutbox({
          outbox,
          request,
          occurredAt,
          safeCode
        });
        completeReceipt({ operationRef: receiptRef, status: "failed", safeCode, occurredAt });
        return reconciled;
      }
      const reboundAssessment = assessReservationAt(rebound, {
        activationAt: settled.successor.validUntil,
        evaluationAt: occurredAt
      });
      if (reboundAssessment.status !== "reservable") {
        throw storeError("deferred_rebase_binding_invalid");
      }
      appendEvent({
        transitionRef: target.transition_ref,
        eventType: "transition_rebased",
        actorType: request.operation.actorType,
        actorRef: request.operation.actorRef,
        occurredAt
      });
    }
    const completed = completeClaimedRebaseOutbox({ outbox, request, occurredAt });
    completeReceipt({
      operationRef: receiptRef,
      resultRef: outbox.settled_transition_ref,
      occurredAt
    });
    return completed;
  });

  const reconcileRebaseTransaction = db.transaction((request) => {
    const occurredAt = normalizeNow(nowFn);
    const replay = resolveReplay({
      operation: request.operation,
      operationType: "rebase_transition",
      digest: request.requestDigest
    });
    if (replay) {
      const existing = findRebaseOutbox(request.settledTransitionRef);
      if (!existing) throw storeError("deferred_transition_infrastructure_error");
      return rebaseOutboxTerminalProjection(existing);
    }
    const outbox = findRebaseOutbox(request.settledTransitionRef);
    if (!outbox) throw storeError("deferred_transition_not_found");
    if (!rebaseOutboxLeaseMatches(outbox, request, occurredAt)) {
      throw storeError("deferred_transition_lease_lost");
    }
    const receiptRef = insertStartedReceipt({
      transitionRef: outbox.settled_transition_ref,
      accountId: outbox.account_id,
      operationType: "rebase_transition",
      operation: request.operation,
      digest: request.requestDigest,
      occurredAt
    });
    const reconciled = reconcileClaimedRebaseOutbox({
      outbox,
      request,
      occurredAt,
      safeCode: request.safeCode
    });
    completeReceipt({
      operationRef: receiptRef,
      status: "failed",
      safeCode: request.safeCode,
      occurredAt
    });
    return reconciled;
  });

  function reserveTransition(input) {
    assertOpen();
    try {
      return directReserveTransaction.immediate(normalizeDirectReserveRequest(input));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  /**
   * Dedicated wallet-first checkout confirmation. The quote provenance is
   * consumed only after the existing deferred reservation participant and
   * transition row succeed in this exact IMMEDIATE transaction. This method
   * intentionally accepts no offer, amount, allocation, order reference or
   * resource-chain fields: it reads the immutable server-derived context
   * only from the active quote it is consuming.
   */
  function reserveTransitionFromCheckoutQuote(input) {
    assertOpen();
    try {
      const outcome = reserveCheckoutQuoteTransaction.immediate(
        normalizeCheckoutQuoteReserveRequest(input)
      );
      if (outcome?.kind === "error") throw storeError(outcome.code);
      if (outcome?.kind !== "transition") {
        throw storeError("deferred_transition_infrastructure_error");
      }
      return outcome.transition;
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function listTransitions(input) {
    assertOpen();
    try {
      const request = normalizeListRequest(input);
      return db.prepare(`
        select * from ${TRANSITIONS_TABLE}
         where account_id = ?
         order by case when state in ('settled', 'cancelled') then 1 else 0 end asc,
                  reserved_at desc,
                  transition_ref desc
         limit ?
      `).all(request.accountId, request.limit).map(publicProjection);
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function getTransition(input) {
    assertOpen();
    try {
      const request = normalizeGetRequest(input);
      const row = db.prepare(`
        select * from ${TRANSITIONS_TABLE}
         where account_id = ? and transition_ref = ?
         limit 1
      `).get(request.accountId, request.transitionRef);
      if (!row) throw storeError("deferred_transition_not_found");
      return publicProjection(row);
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function claimNextDueTransition(input) {
    assertOpen();
    try {
      return claimTransaction.immediate(normalizeClaimRequest(input));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function verifyClaimedTransitionReservation(input) {
    assertOpen();
    try {
      return verifyClaimedReservationTransaction.immediate(
        normalizeVerifyClaimedReservationRequest(input)
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function claimNextRecoverableEffectAppliedTransition(input) {
    assertOpen();
    try {
      return recoverEffectAppliedTransaction.immediate(
        normalizeEffectRecoveryClaimRequest(input)
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function claimNextPendingRebase(input) {
    assertOpen();
    try {
      return claimNextPendingRebaseTransaction.immediate(
        normalizeRebaseOutboxClaimRequest(input)
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function applyClaimedRebase(input) {
    assertOpen();
    try {
      return applyClaimedRebaseTransaction.immediate(
        assertStableRebaseOutboxOperation(normalizeApplyClaimedRebaseRequest(input), "apply")
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  // This is intentionally an alias for the atomic application path, not a
  // state-only acknowledgement. A caller cannot mark a durable rebase item
  // complete without the same transaction first applying its reservation
  // rebases (or the resulting requotes).
  function completeRebase(input) {
    return applyClaimedRebase(input);
  }

  function reconcileRebase(input) {
    assertOpen();
    try {
      return reconcileRebaseTransaction.immediate(
        assertStableRebaseOutboxOperation(normalizeReconcileRebaseRequest(input), "reconcile")
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function recordEffectApplied(input) {
    assertOpen();
    try {
      return recordEffectTransaction.immediate(normalizeEffectRequest(input));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function settleTransition(input) {
    assertOpen();
    try {
      return settleTransaction.immediate(normalizeSettleRequest(input));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function cancelTransition(input) {
    assertOpen();
    try {
      return cancelTransaction.immediate(normalizeCancelRequest(input));
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function requireRequote(input) {
    assertOpen();
    try {
      return requireRequoteTransaction.immediate(
        normalizeLeaseActionRequest(input, "require_requote")
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function reconcileTransition(input) {
    assertOpen();
    try {
      return reconcileTransaction.immediate(
        normalizeLeaseActionRequest(input, "reconcile_transition")
      );
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function rebaseReservedTransitions(input) {
    assertOpen();
    try {
      // Kept as a temporary shape-compatible method while callers are moved to
      // the durable outbox. It must never mutate a settled account directly:
      // that would leave the required outbox pending and reintroduce a crash
      // window between rebasing reservations and recording completion.
      normalizeRebaseRequest(input);
      throw storeError("deferred_transition_state_conflict");
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    if (!ownedDatabase) return;
    try {
      ownedDatabase.close();
    } catch (error) {
      throw normalizeStoreError(error);
    }
  }

  return Object.freeze({
    applyClaimedRebase,
    cancelTransition,
    claimNextRecoverableEffectAppliedTransition,
    claimNextDueTransition,
    claimNextPendingRebase,
    close,
    completeRebase,
    listTransitions,
    getTransition,
    recordEffectApplied,
    reservationLifecycleContract:
      DEFERRED_RESOURCE_TRANSITION_STORE_RESERVATION_LIFECYCLE_CONTRACT,
    rebaseReservedTransitions,
    reconcileRebase,
    reconcileTransition,
    requireRequote,
    reserveTransition,
    reserveTransitionFromCheckoutQuote,
    settleTransition,
    verifyClaimedTransitionReservation
  });
}
