export const COIN_COMMERCE_DEFERRED_TRANSITION_CONTRACT_VERSION =
  "coin-commerce-deferred-transition/v1";

export const WALLET_FIRST_COMMERCIAL_MODEL = "wallet_first_unique_v1";

export const DEFERRED_TRANSITION_STATES = Object.freeze([
  "reserved",
  "processing",
  "effect_applied",
  "settled",
  "requote_required",
  "cancelled",
  "reconciliation_required"
]);

const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const PLAN_PRIORITY = new Map([
  ["offerv_plan_365d_200gb_monthly_v1", Object.freeze({
    rank: 3,
    durationDays: 365,
    monthlyTrafficGb: 200
  })],
  ["offerv_plan_30d_100gb_monthly_v1", Object.freeze({
    rank: 2,
    durationDays: 30,
    monthlyTrafficGb: 100
  })],
  ["offerv_plan_30d_50gb_monthly_v1", Object.freeze({
    rank: 1,
    durationDays: 30,
    monthlyTrafficGb: 50
  })]
]);

function policyError(code) {
  const error = new Error("Coin commerce deferred-transition policy rejected input");
  error.code = code;
  return error;
}

function assertPlainObject(value) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw policyError("invalid_deferred_transition_contract");
  }
  return value;
}

function assertExactKeys(value, keys) {
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== keys.length
    || !keys.every((key) => actual.includes(key))
    || actual.some((key) => typeof key !== "string")
  ) {
    throw policyError("invalid_deferred_transition_contract");
  }
  return value;
}

function normalizeReference(value) {
  if (typeof value !== "string" || !REFERENCE.test(value)) {
    throw policyError("invalid_deferred_transition_reference");
  }
  return value;
}

function normalizeTimestamp(value) {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw policyError("invalid_deferred_transition_timestamp");
  }
  return value;
}

function snapshotArray(value) {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw policyError("invalid_deferred_transition_contract");
  }
  return Array.from(value);
}

function normalizePlan(input) {
  const value = assertExactKeys(assertPlainObject(input), [
    "offerVersionRef",
    "durationDays",
    "monthlyTrafficGb"
  ]);
  const offerVersionRef = normalizeReference(value.offerVersionRef);
  const expected = PLAN_PRIORITY.get(offerVersionRef);
  if (
    !expected
    || value.durationDays !== expected.durationDays
    || value.monthlyTrafficGb !== expected.monthlyTrafficGb
  ) {
    throw policyError("unsupported_deferred_transition_offer");
  }
  return Object.freeze({
    offerVersionRef,
    durationDays: expected.durationDays,
    monthlyTrafficGb: expected.monthlyTrafficGb,
    rank: expected.rank
  });
}

function normalizeTransition(input) {
  const value = assertExactKeys(assertPlainObject(input), [
    "transitionRef",
    "plan",
    "reservedAt",
    "state"
  ]);
  if (!DEFERRED_TRANSITION_STATES.includes(value.state)) {
    throw policyError("invalid_deferred_transition_state");
  }
  return Object.freeze({
    transitionRef: normalizeReference(value.transitionRef),
    plan: normalizePlan(value.plan),
    reservedAt: normalizeTimestamp(value.reservedAt),
    state: value.state
  });
}

function normalizeAllocationLot(input) {
  const value = assertExactKeys(assertPlainObject(input), [
    "coinType",
    "expiresAt"
  ]);
  if (!["bonus_coins", "paid_coins", "reward_coins"].includes(value.coinType)) {
    throw policyError("invalid_deferred_transition_coin_type");
  }
  if (value.expiresAt !== null) normalizeTimestamp(value.expiresAt);
  if (value.coinType !== "bonus_coins" && value.expiresAt !== null) {
    throw policyError("invalid_deferred_transition_allocation");
  }
  return Object.freeze({
    coinType: value.coinType,
    expiresAt: value.expiresAt
  });
}

export function planRank(input) {
  return normalizePlan(input).rank;
}

export function selectDeferredTransition(input) {
  const transitions = snapshotArray(input).map(normalizeTransition)
    .filter((transition) => transition.state === "reserved");
  if (transitions.length === 0) return null;
  transitions.sort((left, right) => (
    right.plan.rank - left.plan.rank
    || left.reservedAt.localeCompare(right.reservedAt)
    || left.transitionRef.localeCompare(right.transitionRef)
  ));
  return transitions[0];
}

export function assessReservationAtActivation(input) {
  const value = assertExactKeys(assertPlainObject(input), [
    "activationAt",
    "allocationLots"
  ]);
  const activationAt = normalizeTimestamp(value.activationAt);
  const allocationLots = snapshotArray(value.allocationLots).map(normalizeAllocationLot);
  const hasExpiredBonusAtActivation = allocationLots.some((lot) => (
    lot.coinType === "bonus_coins"
    && lot.expiresAt !== null
    && lot.expiresAt <= activationAt
  ));
  return Object.freeze({
    status: hasExpiredBonusAtActivation ? "requote_required" : "reservable",
    reasonCode: hasExpiredBonusAtActivation
      ? "bonus_expires_before_activation"
      : null
  });
}
