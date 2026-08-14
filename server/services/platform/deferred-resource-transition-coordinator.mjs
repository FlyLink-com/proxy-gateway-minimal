const OPTION_FIELDS = new Set([
  "store",
  "resourceEffectHandler",
  "nowFn",
  "scheduleFn",
  "clearScheduleFn",
  "leaseMs",
  "batchSize",
  "pollIntervalMs"
]);

export const DEFERRED_RESOURCE_TRANSITION_COORDINATOR_CONTRACT_VERSION =
  "deferred-resource-transition-coordinator/v1";

export const DEFERRED_RESOURCE_TRANSITION_COORDINATOR_STORE_METHODS = Object.freeze([
  "claimNextRecoverableEffectAppliedTransition",
  "claimNextPendingRebase",
  "claimNextDueTransition",
  "verifyClaimedTransitionReservation",
  "requireRequote",
  "recordEffectApplied",
  "settleTransition",
  "applyClaimedRebase",
  "reconcileRebase",
  "reconcileTransition"
]);

/**
 * A coordinator must never mutate a wallet reservation itself. The injected
 * store owns the transaction that releases a dedicated reservation on a
 * re-quote and captures it before reporting a settled transition.
 */
export const DEFERRED_RESOURCE_TRANSITION_STORE_RESERVATION_LIFECYCLE_CONTRACT =
  "deferred-transition-store-reservation-lifecycle/v1";

export const DEFERRED_RESOURCE_TRANSITION_EFFECT_HANDLER_IDEMPOTENCY_CONTRACT =
  "deduplicate_by_transition_ref";

export const DEFERRED_RESOURCE_TRANSITION_EFFECT_HANDLER_METHODS = Object.freeze([
  "revalidateDeferredResourceTransition",
  "resolveDeferredResourceTransitionEffect",
  "applyDeferredResourceTransition"
]);

const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{2,95}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_LEASE_MS = 86_400_000;
const MAX_BATCH_SIZE = 100;
const MAX_POLL_INTERVAL_MS = 86_400_000;
export const DEFERRED_RESOURCE_TRANSITION_RESERVATION_RECOVERY_GRACE_MS = 86_400_000;

function coordinatorError(code) {
  const error = new Error("Deferred resource-transition coordinator rejected operation");
  error.code = code;
  return error;
}

function assertPlainObject(value, code) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw coordinatorError(code);
  }
  return value;
}

function exactValues(value, fields, code) {
  const input = assertPlainObject(value, code);
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length
    || !fields.every((field) => keys.includes(field))
    || keys.some((key) => typeof key !== "string")
  ) {
    throw coordinatorError(code);
  }
  const result = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw coordinatorError(code);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function allowedValues(value, requiredFields, optionalFields, code) {
  const input = assertPlainObject(value, code);
  const allowed = new Set([...requiredFields, ...optionalFields]);
  const keys = Reflect.ownKeys(input);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key))
    || requiredFields.some((field) => !keys.includes(field))
  ) {
    throw coordinatorError(code);
  }
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw coordinatorError(code);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function ownData(value, field, code) {
  const input = assertPlainObject(value, code);
  const descriptor = Object.getOwnPropertyDescriptor(input, field);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw coordinatorError(code);
  }
  return descriptor.value;
}

function normalizeReference(value, code) {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw coordinatorError(code);
  }
  return value;
}

// The store returns Wallet-owned lot IDs in an immutable reservation snapshot.
// Wallet permits normalized UUID-backed IDs (including hyphens); keep the
// stricter local reference grammar for all coordinator-owned identifiers.
function normalizeWalletLotReference(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizeSafeCode(value, code) {
  if (typeof value !== "string" || !SAFE_CODE.test(value)) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizeTimestamp(value, code) {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizeNullableTimestamp(value, code) {
  return value === null ? null : normalizeTimestamp(value, code);
}

function normalizeNullableReference(value, code) {
  return value === null ? null : normalizeReference(value, code);
}

function addMilliseconds(timestamp, milliseconds, code) {
  const parsed = Date.parse(timestamp);
  const next = new Date(parsed + milliseconds).toISOString();
  return normalizeTimestamp(next, code);
}

function normalizePositiveInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw coordinatorError(code);
  }
  return value;
}

function normalizeLeaseToken(value, code) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw coordinatorError(code);
  }
  return value;
}

function snapshotJson(value, code, depth = 0) {
  if (depth > 32) throw coordinatorError(code);
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw coordinatorError(code);
    return value;
  }
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype
      || Reflect.ownKeys(value).length !== value.length + 1
    ) {
      throw coordinatorError(code);
    }
    return Object.freeze(value.map((item) => snapshotJson(item, code, depth + 1)));
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw coordinatorError(code);
  }
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw coordinatorError(code);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw coordinatorError(code);
    }
    result[key] = snapshotJson(descriptor.value, code, depth + 1);
  }
  return Object.freeze(result);
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function normalizeAllocation(input, amountUnits, code) {
  if (
    !Array.isArray(input)
    || Object.getPrototypeOf(input) !== Array.prototype
    || Reflect.ownKeys(input).length !== input.length + 1
    || input.length === 0
  ) {
    throw coordinatorError(code);
  }
  let total = 0;
  const seenLots = new Set();
  const allocation = input.map((item, index) => {
    const value = exactValues(item, [
      "lotRef", "allocationSequence", "coinType", "allocatedUnits", "expiresAt"
    ], code);
    const lotRef = normalizeWalletLotReference(value.lotRef, code);
    const allocationSequence = normalizePositiveInteger(
      value.allocationSequence,
      1,
      Number.MAX_SAFE_INTEGER,
      code
    );
    const allocatedUnits = normalizePositiveInteger(
      value.allocatedUnits,
      1,
      Number.MAX_SAFE_INTEGER,
      code
    );
    if (
      allocationSequence !== index + 1
      || seenLots.has(lotRef)
      || !["bonus_coins", "paid_coins", "reward_coins"].includes(value.coinType)
    ) {
      throw coordinatorError(code);
    }
    const expiresAt = normalizeNullableTimestamp(value.expiresAt, code);
    if (value.coinType !== "bonus_coins" && expiresAt !== null) {
      throw coordinatorError(code);
    }
    total += allocatedUnits;
    if (!Number.isSafeInteger(total) || total > Number.MAX_SAFE_INTEGER) {
      throw coordinatorError(code);
    }
    seenLots.add(lotRef);
    return Object.freeze({
      lotRef,
      allocationSequence,
      coinType: value.coinType,
      allocatedUnits,
      expiresAt
    });
  });
  if (total !== amountUnits) throw coordinatorError(code);
  return Object.freeze(allocation);
}

function normalizeClaim(input) {
  const requiredFields = [
    "transitionRef",
    "accountId",
    "orderRef",
    "reservationRef",
    "flowKind",
    "offer",
    "amountUnits",
    "allocationSnapshot",
    "scheduledFor",
    "expectedEntitlementId",
    "expectedRequestId",
    "expectedIssuedLinkId",
    "expectedValidUntil",
    "leaseGeneration",
    "leaseToken"
  ];
  const value = allowedValues(input, requiredFields, [
    "planRank",
    "state",
    "rebaseGeneration",
    "effectRef",
    "successor",
    "safeCode",
    "reservedAt",
    "settledAt",
    "createdAt",
    "updatedAt",
    "leaseUntil"
  ], "deferred_transition_coordinator_claim_invalid");
  const state = Object.hasOwn(value, "state") ? value.state : "processing";
  if (!["processing", "effect_applied"].includes(state)) {
    throw coordinatorError("deferred_transition_coordinator_claim_invalid");
  }
  const amountUnits = normalizePositiveInteger(
    value.amountUnits,
    1,
    Number.MAX_SAFE_INTEGER,
    "deferred_transition_coordinator_claim_invalid"
  );
  if (!["initial_activation", "scheduled_switch"].includes(value.flowKind)) {
    throw coordinatorError("deferred_transition_coordinator_claim_invalid");
  }
  const expectedEntitlementId = normalizeNullableReference(
    value.expectedEntitlementId,
    "deferred_transition_coordinator_claim_invalid"
  );
  const expectedRequestId = normalizeNullableReference(
    value.expectedRequestId,
    "deferred_transition_coordinator_claim_invalid"
  );
  const expectedIssuedLinkId = normalizeNullableReference(
    value.expectedIssuedLinkId,
    "deferred_transition_coordinator_claim_invalid"
  );
  const expectedValidUntil = normalizeNullableTimestamp(
    value.expectedValidUntil,
    "deferred_transition_coordinator_claim_invalid"
  );
  const expectedChain = [
    expectedEntitlementId,
    expectedRequestId,
    expectedIssuedLinkId,
    expectedValidUntil
  ];
  if (
    (value.flowKind === "initial_activation" && expectedChain.some((item) => item !== null))
    || (value.flowKind === "scheduled_switch" && expectedChain.some((item) => item === null))
  ) {
    throw coordinatorError("deferred_transition_coordinator_claim_invalid");
  }
  const scheduledFor = normalizeTimestamp(
    value.scheduledFor,
    "deferred_transition_coordinator_claim_invalid"
  );
  if (value.flowKind === "scheduled_switch" && scheduledFor !== expectedValidUntil) {
    throw coordinatorError("deferred_transition_coordinator_claim_invalid");
  }
  const offer = snapshotJson(value.offer, "deferred_transition_coordinator_claim_invalid");
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) {
    throw coordinatorError("deferred_transition_coordinator_claim_invalid");
  }
  let appliedEffect = null;
  if (state === "effect_applied") {
    if (!Object.hasOwn(value, "effectRef") || !Object.hasOwn(value, "successor")) {
      throw coordinatorError("deferred_transition_coordinator_claim_invalid");
    }
    appliedEffect = normalizeStoredEffect(value.effectRef, value.successor);
  } else if (Object.hasOwn(value, "successor")) {
    throw coordinatorError("deferred_transition_coordinator_claim_invalid");
  }
  return Object.freeze({
    transitionRef: normalizeReference(value.transitionRef, "deferred_transition_coordinator_claim_invalid"),
    accountId: normalizeReference(value.accountId, "deferred_transition_coordinator_claim_invalid"),
    orderRef: normalizeReference(value.orderRef, "deferred_transition_coordinator_claim_invalid"),
    reservationRef: normalizeReference(value.reservationRef, "deferred_transition_coordinator_claim_invalid"),
    flowKind: value.flowKind,
    offer,
    amountUnits,
    allocationSnapshot: normalizeAllocation(
      value.allocationSnapshot,
      amountUnits,
      "deferred_transition_coordinator_claim_invalid"
    ),
    scheduledFor,
    expectedEntitlementId,
    expectedRequestId,
    expectedIssuedLinkId,
    expectedValidUntil,
    state,
    appliedEffect,
    leaseGeneration: normalizePositiveInteger(
      value.leaseGeneration,
      1,
      Number.MAX_SAFE_INTEGER,
      "deferred_transition_coordinator_claim_invalid"
    ),
    leaseToken: normalizeLeaseToken(value.leaseToken, "deferred_transition_coordinator_claim_invalid")
  });
}

function normalizeReservationResult(input, claim) {
  const status = assertPlainObject(input, "deferred_transition_coordinator_reservation_invalid");
  const ok = ownData(status, "ok", "deferred_transition_coordinator_reservation_invalid");
  if (typeof ok !== "boolean") {
    throw coordinatorError("deferred_transition_coordinator_reservation_invalid");
  }
  if (ok === false) {
    const failed = exactValues(input, [
      "ok", "reservationRef", "safeResultCode"
    ], "deferred_transition_coordinator_reservation_invalid");
    return Object.freeze({
      ok: false,
      reservationRef: normalizeReference(
        failed.reservationRef,
        "deferred_transition_coordinator_reservation_invalid"
      ),
      safeCode: normalizeSafeCode(
        failed.safeResultCode,
        "deferred_transition_coordinator_reservation_invalid"
      )
    });
  }
  const value = exactValues(input, [
    "ok", "reservationRef", "state", "activationAt", "expiresAt", "allocationSnapshot"
  ], "deferred_transition_coordinator_reservation_invalid");
  const reservationRef = normalizeReference(
    value.reservationRef,
    "deferred_transition_coordinator_reservation_invalid"
  );
  const expiresAt = normalizeTimestamp(
    value.expiresAt,
    "deferred_transition_coordinator_reservation_invalid"
  );
  const activationAt = normalizeTimestamp(
    value.activationAt,
    "deferred_transition_coordinator_reservation_invalid"
  );
  const allocationSnapshot = normalizeAllocation(
    value.allocationSnapshot,
    claim.amountUnits,
    "deferred_transition_coordinator_reservation_invalid"
  );
  if (!["reserved", "processing", "captured", "released", "reconciliation_required"].includes(value.state)) {
    throw coordinatorError("deferred_transition_coordinator_reservation_invalid");
  }
  if (
    activationAt !== claim.scheduledFor
    || expiresAt !== addMilliseconds(
      activationAt,
      DEFERRED_RESOURCE_TRANSITION_RESERVATION_RECOVERY_GRACE_MS,
      "deferred_transition_coordinator_reservation_invalid"
    )
  ) {
    throw coordinatorError("deferred_transition_coordinator_reservation_invalid");
  }
  return Object.freeze({
    ok: true,
    reservationRef,
    state: value.state,
    activationAt,
    expiresAt,
    allocationSnapshot
  });
}

function normalizeRevalidation(input) {
  const value = assertPlainObject(input, "deferred_transition_coordinator_effect_invalid");
  const status = ownData(value, "status", "deferred_transition_coordinator_effect_invalid");
  if (status === "ready") {
    return Object.freeze(exactValues(value, ["status"], "deferred_transition_coordinator_effect_invalid"));
  }
  if (status === "requote_required") {
    const result = exactValues(value, ["status", "safeCode"], "deferred_transition_coordinator_effect_invalid");
    return Object.freeze({
      status,
      safeCode: normalizeSafeCode(result.safeCode, "deferred_transition_coordinator_effect_invalid")
    });
  }
  throw coordinatorError("deferred_transition_coordinator_effect_invalid");
}

function normalizeEffectResult(input) {
  const value = exactValues(input, [
    "status",
    "effectRef",
    "nextEntitlementId",
    "nextRequestId",
    "nextIssuedLinkId",
    "nextValidUntil"
  ], "deferred_transition_coordinator_effect_invalid");
  if (value.status !== "applied") {
    throw coordinatorError("deferred_transition_coordinator_effect_invalid");
  }
  return Object.freeze({
    effectRef: normalizeReference(value.effectRef, "deferred_transition_coordinator_effect_invalid"),
    successor: Object.freeze({
      entitlementId: normalizeReference(
        value.nextEntitlementId,
        "deferred_transition_coordinator_effect_invalid"
      ),
      requestId: normalizeReference(value.nextRequestId, "deferred_transition_coordinator_effect_invalid"),
      issuedLinkId: normalizeReference(
        value.nextIssuedLinkId,
        "deferred_transition_coordinator_effect_invalid"
      ),
      validUntil: normalizeTimestamp(value.nextValidUntil, "deferred_transition_coordinator_effect_invalid")
    })
  });
}

function normalizeStoredEffect(effectRef, successor) {
  const value = exactValues(successor, [
    "entitlementId", "requestId", "issuedLinkId", "validUntil"
  ], "deferred_transition_coordinator_claim_invalid");
  return Object.freeze({
    effectRef: normalizeReference(effectRef, "deferred_transition_coordinator_claim_invalid"),
    successor: Object.freeze({
      entitlementId: normalizeReference(
        value.entitlementId,
        "deferred_transition_coordinator_claim_invalid"
      ),
      requestId: normalizeReference(value.requestId, "deferred_transition_coordinator_claim_invalid"),
      issuedLinkId: normalizeReference(
        value.issuedLinkId,
        "deferred_transition_coordinator_claim_invalid"
      ),
      validUntil: normalizeTimestamp(value.validUntil, "deferred_transition_coordinator_claim_invalid")
    })
  });
}

function normalizeRebaseClaim(input) {
  const value = exactValues(input, [
    "settledTransitionRef",
    "accountId",
    "effectRef",
    "successor",
    "leaseGeneration",
    "leaseToken",
    "leaseUntil"
  ], "deferred_transition_coordinator_rebase_claim_invalid");
  const effect = normalizeStoredEffect(value.effectRef, value.successor);
  return Object.freeze({
    settledTransitionRef: normalizeReference(
      value.settledTransitionRef,
      "deferred_transition_coordinator_rebase_claim_invalid"
    ),
    accountId: normalizeReference(
      value.accountId,
      "deferred_transition_coordinator_rebase_claim_invalid"
    ),
    effectRef: effect.effectRef,
    successor: effect.successor,
    leaseGeneration: normalizePositiveInteger(
      value.leaseGeneration,
      1,
      Number.MAX_SAFE_INTEGER,
      "deferred_transition_coordinator_rebase_claim_invalid"
    ),
    leaseToken: normalizeLeaseToken(
      value.leaseToken,
      "deferred_transition_coordinator_rebase_claim_invalid"
    ),
    leaseUntil: normalizeTimestamp(
      value.leaseUntil,
      "deferred_transition_coordinator_rebase_claim_invalid"
    )
  });
}

function normalizeRebaseCompletion(input, rebase) {
  const value = exactValues(input, [
    "settledTransitionRef",
    "accountId",
    "effectRef",
    "state",
    "safeCode",
    "createdAt",
    "updatedAt",
    "completedAt",
    "successor"
  ], "deferred_transition_coordinator_rebase_result_invalid");
  const effect = normalizeStoredEffect(value.effectRef, value.successor);
  if (
    normalizeReference(
      value.settledTransitionRef,
      "deferred_transition_coordinator_rebase_result_invalid"
    ) !== rebase.settledTransitionRef
    || normalizeReference(
      value.accountId,
      "deferred_transition_coordinator_rebase_result_invalid"
    ) !== rebase.accountId
    || effect.effectRef !== rebase.effectRef
    || canonicalJson(effect.successor) !== canonicalJson(rebase.successor)
  ) {
    throw coordinatorError("deferred_transition_coordinator_rebase_result_invalid");
  }
  normalizeTimestamp(value.createdAt, "deferred_transition_coordinator_rebase_result_invalid");
  normalizeTimestamp(value.updatedAt, "deferred_transition_coordinator_rebase_result_invalid");
  if (value.state === "completed") {
    if (value.safeCode !== null) {
      throw coordinatorError("deferred_transition_coordinator_rebase_result_invalid");
    }
    normalizeTimestamp(value.completedAt, "deferred_transition_coordinator_rebase_result_invalid");
    return Object.freeze({ state: "completed" });
  }
  if (value.state === "reconciliation_required") {
    if (value.completedAt !== null) {
      throw coordinatorError("deferred_transition_coordinator_rebase_result_invalid");
    }
    return Object.freeze({
      state: "reconciliation_required",
      safeCode: normalizeSafeCode(
        value.safeCode,
        "deferred_transition_coordinator_rebase_result_invalid"
      )
    });
  }
  throw coordinatorError("deferred_transition_coordinator_rebase_result_invalid");
}

function normalizeResolvedEffect(input) {
  if (input === null) return null;
  return normalizeEffectResult(input);
}

function expectTransitionState(input, expected) {
  const state = ownData(input, "state", "deferred_transition_coordinator_unavailable");
  if (state !== expected) throw coordinatorError("deferred_transition_coordinator_unavailable");
}

function snapshotOptions(options) {
  const values = assertPlainObject(options, "deferred_transition_coordinator_invalid");
  const result = {};
  for (const key of Reflect.ownKeys(values)) {
    if (typeof key !== "string" || !OPTION_FIELDS.has(key)) {
      throw coordinatorError("deferred_transition_coordinator_invalid");
    }
    const descriptor = Object.getOwnPropertyDescriptor(values, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw coordinatorError("deferred_transition_coordinator_invalid");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotMethods(value, names) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    throw coordinatorError("deferred_transition_coordinator_invalid");
  }
  const result = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || typeof descriptor.value !== "function") {
      throw coordinatorError("deferred_transition_coordinator_invalid");
    }
    result[name] = (...args) => descriptor.value.call(value, ...args);
  }
  return Object.freeze(result);
}

function snapshotEffectHandler(value) {
  const methods = snapshotMethods(value, DEFERRED_RESOURCE_TRANSITION_EFFECT_HANDLER_METHODS);
  const contract = Object.getOwnPropertyDescriptor(value, "idempotencyContract");
  if (
    !contract
    || !contract.enumerable
    || !("value" in contract)
    || contract.value !== DEFERRED_RESOURCE_TRANSITION_EFFECT_HANDLER_IDEMPOTENCY_CONTRACT
  ) {
    throw coordinatorError("deferred_transition_coordinator_invalid");
  }
  return methods;
}

function snapshotStore(value) {
  const methods = snapshotMethods(value, DEFERRED_RESOURCE_TRANSITION_COORDINATOR_STORE_METHODS);
  const contract = Object.getOwnPropertyDescriptor(value, "reservationLifecycleContract");
  if (
    !contract
    || !contract.enumerable
    || !("value" in contract)
    || contract.value !== DEFERRED_RESOURCE_TRANSITION_STORE_RESERVATION_LIFECYCLE_CONTRACT
  ) {
    throw coordinatorError("deferred_transition_coordinator_invalid");
  }
  return methods;
}

function systemOperation(claim, phase) {
  return Object.freeze({
    actorScope: `deferred:${claim.accountId}`,
    idempotencyKey: `deferred_${phase}_${claim.transitionRef}_${claim.leaseGeneration}`,
    actorType: "commerce_system",
    actorRef: "deferred_resource_transition_coordinator"
  });
}

function rebaseOperation(rebase, phase) {
  return Object.freeze({
    actorScope: `deferred:${rebase.accountId}`,
    // This must survive an expired outbox lease. The store's receipt binds
    // one settled transition, while the lease remains a CAS guard only.
    idempotencyKey: `deferred_rebase_${phase}_${rebase.settledTransitionRef}`,
    actorType: "commerce_system",
    actorRef: "deferred_resource_transition_coordinator"
  });
}

function resourceInput(claim, activationAt) {
  return Object.freeze({
    transitionRef: claim.transitionRef,
    accountId: claim.accountId,
    orderRef: claim.orderRef,
    flowKind: claim.flowKind,
    offer: claim.offer,
    scheduledFor: claim.scheduledFor,
    expectedEntitlementId: claim.expectedEntitlementId,
    expectedRequestId: claim.expectedRequestId,
    expectedIssuedLinkId: claim.expectedIssuedLinkId,
    expectedValidUntil: claim.expectedValidUntil,
    activationAt
  });
}

function effectLookupInput(claim) {
  return Object.freeze({ transitionRef: claim.transitionRef });
}

function hasExpiredBonus(claim, reservationExpiresAt) {
  return claim.allocationSnapshot.some((allocation) => (
    allocation.coinType === "bonus_coins"
    && allocation.expiresAt !== null
    && allocation.expiresAt <= reservationExpiresAt
  ));
}

export function createDeferredResourceTransitionCoordinator(options = {}) {
  const values = snapshotOptions(options);
  if (
    !Object.hasOwn(values, "store")
    || !Object.hasOwn(values, "resourceEffectHandler")
  ) {
    throw coordinatorError("deferred_transition_coordinator_invalid");
  }
  const store = snapshotStore(values.store);
  const resourceEffectHandler = snapshotEffectHandler(values.resourceEffectHandler);
  const nowFn = values.nowFn ?? (() => new Date());
  const scheduleFn = values.scheduleFn ?? setTimeout;
  const clearScheduleFn = values.clearScheduleFn ?? clearTimeout;
  if (
    typeof nowFn !== "function"
    || typeof scheduleFn !== "function"
    || typeof clearScheduleFn !== "function"
  ) {
    throw coordinatorError("deferred_transition_coordinator_invalid");
  }
  const leaseMs = normalizePositiveInteger(
    values.leaseMs ?? 30_000,
    1,
    MAX_LEASE_MS,
    "deferred_transition_coordinator_invalid"
  );
  const batchSize = normalizePositiveInteger(
    values.batchSize ?? 25,
    1,
    MAX_BATCH_SIZE,
    "deferred_transition_coordinator_invalid"
  );
  const pollIntervalMs = normalizePositiveInteger(
    values.pollIntervalMs ?? 60_000,
    1,
    MAX_POLL_INTERVAL_MS,
    "deferred_transition_coordinator_invalid"
  );

  let lifecycle = "idle";
  let timer = null;
  let timerEpoch = 0;
  let activePass = null;
  const uncertainEffectTransitions = new Set();

  function nowIso() {
    try {
      const value = nowFn();
      return normalizeTimestamp(
        value instanceof Date ? value.toISOString() : value,
        "deferred_transition_coordinator_unavailable"
      );
    } catch (error) {
      if (error?.code === "deferred_transition_coordinator_unavailable") throw error;
      throw coordinatorError("deferred_transition_coordinator_unavailable");
    }
  }

  function totals() {
    return {
      claimed: 0,
      requoteRequired: 0,
      effectApplied: 0,
      settled: 0,
      rebased: 0,
      rebasePending: 0,
      reconciliationRequired: 0
    };
  }

  function clearTimer() {
    if (timer === null) return;
    const current = timer;
    timer = null;
    timerEpoch += 1;
    try {
      clearScheduleFn(current);
    } catch {
      throw coordinatorError("deferred_transition_coordinator_unavailable");
    }
  }

  function armTimer() {
    clearTimer();
    const epoch = ++timerEpoch;
    try {
      timer = scheduleFn(() => {
        if (epoch !== timerEpoch || lifecycle !== "running") return;
        timer = null;
        Promise.resolve(runOnce()).catch(() => {});
      }, pollIntervalMs);
    } catch {
      throw coordinatorError("deferred_transition_coordinator_unavailable");
    }
  }

  function reconciliationInput(claim, safeCode) {
    return {
      transitionRef: claim.transitionRef,
      leaseGeneration: claim.leaseGeneration,
      leaseToken: claim.leaseToken,
      safeCode,
      operation: systemOperation(claim, "reconcile")
    };
  }

  async function reconcile(claim, safeCode, result, { preserveEffectUncertainty = false } = {}) {
    uncertainEffectTransitions.add(claim.transitionRef);
    try {
      const transition = await store.reconcileTransition(reconciliationInput(claim, safeCode));
      expectTransitionState(transition, "reconciliation_required");
      if (!preserveEffectUncertainty) {
        uncertainEffectTransitions.delete(claim.transitionRef);
      }
      result.reconciliationRequired += 1;
    } catch {
      throw coordinatorError("deferred_transition_coordinator_unavailable");
    }
  }

  async function requireRequote(claim, safeCode, result) {
    try {
      const transition = await store.requireRequote({
        transitionRef: claim.transitionRef,
        leaseGeneration: claim.leaseGeneration,
        leaseToken: claim.leaseToken,
        safeCode,
        operation: systemOperation(claim, "requote")
      });
      expectTransitionState(transition, "requote_required");
      result.requoteRequired += 1;
    } catch {
      await reconcile(claim, "deferred_requote_unknown", result);
    }
  }

  async function resolveUnknownRebaseApply(rebase, result) {
    let rawTerminal;
    try {
      // First retry with the same operation key. If the apply committed but
      // its reply was lost, the store resolves its durable receipt before it
      // consults the now-stale lease. Do not convert that successful replay
      // into a spurious reconciliation attempt.
      rawTerminal = await store.applyClaimedRebase({
        settledTransitionRef: rebase.settledTransitionRef,
        leaseGeneration: rebase.leaseGeneration,
        leaseToken: rebase.leaseToken,
        operation: rebaseOperation(rebase, "apply")
      });
    } catch {
      try {
        rawTerminal = await store.reconcileRebase({
          settledTransitionRef: rebase.settledTransitionRef,
          leaseGeneration: rebase.leaseGeneration,
          leaseToken: rebase.leaseToken,
          safeCode: "deferred_rebase_apply_unknown",
          operation: rebaseOperation(rebase, "reconcile")
        });
      } catch {
        // The outbox lease will become pending again. No in-memory retry state
        // is retained, and a later worker uses the same settled-transition key.
        result.rebasePending += 1;
        return;
      }
    }
    const terminal = normalizeRebaseCompletion(rawTerminal, rebase);
    if (terminal.state === "completed") {
      result.rebased += 1;
      return;
    }
    result.reconciliationRequired += 1;
  }

  async function drainPendingRebases(result) {
    for (let index = 0; index < batchSize; index += 1) {
      if (lifecycle === "stopped") return;
      const rawRebase = await store.claimNextPendingRebase({ leaseMs });
      if (lifecycle === "stopped" || rawRebase === null) return;
      const rebase = normalizeRebaseClaim(rawRebase);
      let rawTerminal;
      try {
        rawTerminal = await store.applyClaimedRebase({
          settledTransitionRef: rebase.settledTransitionRef,
          leaseGeneration: rebase.leaseGeneration,
          leaseToken: rebase.leaseToken,
          operation: rebaseOperation(rebase, "apply")
        });
      } catch {
        await resolveUnknownRebaseApply(rebase, result);
        continue;
      }
      const terminal = normalizeRebaseCompletion(rawTerminal, rebase);
      if (terminal.state === "completed") {
        result.rebased += 1;
      } else {
        result.reconciliationRequired += 1;
      }
    }
  }

  function hasUsableSuccessor(effect, activationAt) {
    return effect.successor.validUntil > activationAt;
  }

  async function settleAndQueueRebase(claim, effect, activationAt, result) {
    if (!hasUsableSuccessor(effect, activationAt)) {
      await reconcile(
        claim,
        "deferred_effect_successor_invalid",
        result,
        { preserveEffectUncertainty: true }
      );
      return;
    }
    try {
      const settled = await store.settleTransition({
        transitionRef: claim.transitionRef,
        leaseGeneration: claim.leaseGeneration,
        leaseToken: claim.leaseToken,
        operation: systemOperation(claim, "settle")
      });
      const state = ownData(settled, "state", "deferred_transition_coordinator_unavailable");
      if (state === "reconciliation_required") {
        result.reconciliationRequired += 1;
        return;
      }
      if (state !== "settled") throw coordinatorError("deferred_transition_coordinator_unavailable");
      result.settled += 1;
    } catch {
      await reconcile(
        claim,
        "deferred_capture_unknown",
        result,
        { preserveEffectUncertainty: true }
      );
      return;
    }
    // `settleTransition` durably creates the rebase-outbox item in the same
    // transaction as capture. A later pass drains it from the store; memory
    // never becomes the source of truth across a process crash.
    uncertainEffectTransitions.delete(claim.transitionRef);
  }

  async function recordAndSettle(claim, effect, activationAt, result) {
    if (effect.successor.validUntil <= activationAt) {
      await reconcile(
        claim,
        "deferred_effect_successor_invalid",
        result,
        { preserveEffectUncertainty: true }
      );
      return;
    }
    try {
      const recorded = await store.recordEffectApplied({
        transitionRef: claim.transitionRef,
        leaseGeneration: claim.leaseGeneration,
        leaseToken: claim.leaseToken,
        effectRef: effect.effectRef,
        successor: effect.successor,
        operation: systemOperation(claim, "record")
      });
      expectTransitionState(recorded, "effect_applied");
      result.effectApplied += 1;
    } catch {
      await reconcile(
        claim,
        "deferred_effect_record_unknown",
        result,
        { preserveEffectUncertainty: true }
      );
      return;
    }
    await settleAndQueueRebase(claim, effect, activationAt, result);
  }

  async function processClaim(claim, result) {
    if (lifecycle === "stopped") return;
    if (claim.state === "effect_applied") {
      // A prior process has already persisted the immutable successor receipt.
      // Recovery may capture and queue rebase, but must never look up,
      // revalidate, or replay the external resource effect.
      uncertainEffectTransitions.add(claim.transitionRef);
      await settleAndQueueRebase(claim, claim.appliedEffect, nowIso(), result);
      return;
    }
    if (uncertainEffectTransitions.has(claim.transitionRef)) {
      await reconcile(
        claim,
        "deferred_effect_outcome_unknown",
        result,
        { preserveEffectUncertainty: true }
      );
      return;
    }
    const activationAt = nowIso();

    // Read back an effect receipt before checking a reserved balance. This is
    // the crash-recovery branch: a prior process may have completed the
    // external change but died before recording it in the transition store.
    let recoveredEffect;
    try {
      recoveredEffect = normalizeResolvedEffect(
        await resourceEffectHandler.resolveDeferredResourceTransitionEffect(effectLookupInput(claim))
      );
    } catch {
      await reconcile(claim, "deferred_effect_lookup_unknown", result);
      return;
    }
    if (recoveredEffect !== null) {
      uncertainEffectTransitions.add(claim.transitionRef);
      await recordAndSettle(claim, recoveredEffect, activationAt, result);
      return;
    }

    let reservation;
    try {
      reservation = normalizeReservationResult(
        await store.verifyClaimedTransitionReservation({
          transitionRef: claim.transitionRef,
          leaseGeneration: claim.leaseGeneration,
          leaseToken: claim.leaseToken
        }),
        claim
      );
    } catch {
      await reconcile(claim, "deferred_reservation_unknown", result);
      return;
    }
    if (reservation.ok === false) {
      await requireRequote(claim, reservation.safeCode, result);
      return;
    }
    if (
      reservation.reservationRef !== claim.reservationRef
      || canonicalJson(reservation.allocationSnapshot) !== canonicalJson(claim.allocationSnapshot)
    ) {
      await reconcile(claim, "deferred_reservation_invalid", result);
      return;
    }
    if (reservation.state !== "reserved") {
      await reconcile(claim, "deferred_reservation_not_reserved", result);
      return;
    }
    if (reservation.expiresAt <= activationAt) {
      await requireRequote(claim, "deferred_reservation_expires_before_effect", result);
      return;
    }
    if (hasExpiredBonus(claim, reservation.expiresAt)) {
      await requireRequote(
        claim,
        "deferred_bonus_expires_before_reservation_recovery",
        result
      );
      return;
    }
    const effectInput = resourceInput(claim, activationAt);
    let assessment;
    try {
      assessment = normalizeRevalidation(
        await resourceEffectHandler.revalidateDeferredResourceTransition(effectInput)
      );
    } catch {
      await reconcile(claim, "deferred_resource_revalidation_unknown", result);
      return;
    }
    if (assessment.status === "requote_required") {
      await requireRequote(claim, assessment.safeCode, result);
      return;
    }
    if (lifecycle === "stopped") return;

    // Once an external resource effect is entered, this process never invokes it
    // a second time for the same transition. Unknown outcomes are quarantined.
    uncertainEffectTransitions.add(claim.transitionRef);
    let effect;
    try {
      effect = normalizeEffectResult(
        await resourceEffectHandler.applyDeferredResourceTransition(effectInput)
      );
    } catch (error) {
      if (error?.code === "wallet_first_resource_effect_retryable") {
        // The inner runtime claim is leased by another worker. It performed no
        // probe or Core mutation, so retain the outer transition for normal
        // lease retry and clear this process-local quarantine before yielding.
        uncertainEffectTransitions.delete(claim.transitionRef);
        return;
      }
      await reconcile(
        claim,
        "deferred_effect_outcome_unknown",
        result,
        { preserveEffectUncertainty: true }
      );
      return;
    }
    await recordAndSettle(claim, effect, activationAt, result);
  }

  async function performPass() {
    const result = totals();
    let remaining = batchSize;
    // Drain durable effect receipts first. Their successor snapshot is the
    // only authority for post-crash capture; normal due work must not replay
    // a resource effect merely because a prior worker disappeared.
    while (remaining > 0) {
      if (lifecycle === "stopped") break;
      const rawClaim = await store.claimNextRecoverableEffectAppliedTransition({ leaseMs });
      if (lifecycle === "stopped") break;
      if (rawClaim === null) break;
      const claim = normalizeClaim(rawClaim);
      if (claim.state !== "effect_applied" || claim.appliedEffect === null) {
        throw coordinatorError("deferred_transition_coordinator_unavailable");
      }
      result.claimed += 1;
      remaining -= 1;
      await processClaim(claim, result);
    }
    // A recovered effect can settle and create an outbox item in this same
    // pass. Drain persistent rebases before any ordinary due claim observes
    // an obsolete resource chain.
    await drainPendingRebases(result);
    while (remaining > 0) {
      if (lifecycle === "stopped") break;
      const rawClaim = await store.claimNextDueTransition({ leaseMs });
      if (lifecycle === "stopped") break;
      if (rawClaim === null) break;
      const claim = normalizeClaim(rawClaim);
      result.claimed += 1;
      remaining -= 1;
      await processClaim(claim, result);
      if (lifecycle === "stopped") break;
    }
    return Object.freeze(result);
  }

  function runOnce() {
    if (lifecycle === "stopped") {
      return Promise.reject(coordinatorError("deferred_transition_coordinator_stopped"));
    }
    if (activePass) return activePass;
    const pass = (async () => {
      try {
        return await performPass();
      } catch (error) {
        if (error?.code === "deferred_transition_coordinator_unavailable") throw error;
        throw coordinatorError("deferred_transition_coordinator_unavailable");
      } finally {
        if (lifecycle === "running") armTimer();
      }
    })();
    activePass = pass;
    pass.finally(() => {
      if (activePass === pass) activePass = null;
    }).catch(() => {});
    return pass;
  }

  async function start() {
    if (lifecycle === "stopped") {
      throw coordinatorError("deferred_transition_coordinator_stopped");
    }
    lifecycle = "running";
    try {
      return await runOnce();
    } catch (error) {
      lifecycle = "stopped";
      try {
        clearTimer();
      } catch {
        // Preserve the pass failure rather than masking it with timer cleanup.
      }
      throw error;
    }
  }

  async function stop() {
    lifecycle = "stopped";
    let timerError = null;
    try {
      clearTimer();
    } catch (error) {
      timerError = error;
    }
    const pass = activePass;
    if (pass) await pass.catch(() => {});
    if (timerError) throw timerError;
  }

  return Object.freeze({
    runOnce,
    start,
    stop
  });
}
