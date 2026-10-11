// Pure plan-switch policy. No database, no clock, no I/O.
// Charge arithmetic is BigInt. Results that do not fit a safe integer are rejected.

export const PLAN_SWITCH_CONTRACT_VERSION = "coin-commerce-plan-switch/v1";

export const PLAN_SWITCH_LEGACY_COMMERCE_MODE = "legacy";

export const PLAN_SWITCH_MS_PER_DAY = 86_400_000;

export const PLAN_SWITCH_MIN_UPGRADE_REMAINING_MS = 60 * 60 * 1000;

export const PLAN_SWITCH_KINDS = Object.freeze([
  "renewal",
  "upgrade_inplace",
  "upgrade_restart",
  "downgrade_scheduled"
]);

export const PLAN_SWITCH_ORDINARY_KIND = "ordinary_purchase";

export const PLAN_SWITCH_ERROR = Object.freeze({
  AUTHORITY_MODE_UNSUPPORTED: "plan_switch_authority_mode_unsupported",
  COMMERCE_MODEL_UNSUPPORTED: "plan_switch_commerce_model_unsupported",
  AUTHORITY_ROW_PRESENT: "plan_switch_authority_row_present",
  CREDIT_EXCEEDS_PRICE: "plan_switch_credit_exceeds_price",
  REQUIRES_LEGACY_COMMERCE: "plan_switch_requires_legacy_commerce",
  SCHEMA_NOT_READY: "plan_switch_schema_not_ready",
  STATE_CHANGED: "plan_switch_state_changed",
  APPLICATION_PENDING: "plan_switch_application_pending",
  ALREADY_SCHEDULED: "plan_switch_already_scheduled",
  UPGRADE_WINDOW_CLOSED: "plan_switch_upgrade_window_closed",
  CYCLE_MISALIGNED: "plan_switch_cycle_misaligned",
  PRECHECK_UNAVAILABLE: "plan_switch_precheck_unavailable",
  INVALID_INPUT: "plan_switch_invalid_input",
  OFFER_UNAVAILABLE: "offer_unavailable"
});

// HTTP 409 codes introduced by this feature. offer_unavailable already exists.
export const PLAN_SWITCH_CONFLICT_CODES = Object.freeze([
  PLAN_SWITCH_ERROR.AUTHORITY_MODE_UNSUPPORTED,
  PLAN_SWITCH_ERROR.COMMERCE_MODEL_UNSUPPORTED,
  PLAN_SWITCH_ERROR.AUTHORITY_ROW_PRESENT,
  PLAN_SWITCH_ERROR.CREDIT_EXCEEDS_PRICE,
  PLAN_SWITCH_ERROR.STATE_CHANGED,
  PLAN_SWITCH_ERROR.APPLICATION_PENDING,
  PLAN_SWITCH_ERROR.ALREADY_SCHEDULED,
  PLAN_SWITCH_ERROR.UPGRADE_WINDOW_CLOSED,
  PLAN_SWITCH_ERROR.CYCLE_MISALIGNED,
  PLAN_SWITCH_ERROR.PRECHECK_UNAVAILABLE
]);

export const PLAN_SWITCH_TIERS = Object.freeze([
  Object.freeze({
    rank: 1,
    offerRef: "offer_plan_30d_50gb_monthly",
    offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
    listPriceUnits: 20,
    durationDays: 30,
    monthlyTrafficGb: 50
  }),
  Object.freeze({
    rank: 2,
    offerRef: "offer_plan_30d_100gb_monthly",
    offerVersionRef: "offerv_plan_30d_100gb_monthly_v1",
    listPriceUnits: 30,
    durationDays: 30,
    monthlyTrafficGb: 100
  }),
  Object.freeze({
    rank: 3,
    offerRef: "offer_plan_365d_200gb_monthly",
    offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
    listPriceUnits: 200,
    durationDays: 365,
    monthlyTrafficGb: 200
  })
]);

const TIER_BY_VERSION = new Map(
  PLAN_SWITCH_TIERS.map((tier) => [tier.offerVersionRef, tier])
);

const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;

const PRECHECK_FIELDS = Object.freeze([
  "authorityFlagEnabled",
  "commerceMode",
  "authorityRowCount"
]);

const CLASSIFY_FIELDS = Object.freeze([
  "nowMs",
  "currentOfferVersionRef",
  "validUntilMs",
  "requestedOfferVersionRef",
  "scheduledSwitchRef",
  "scheduledEffectiveAtMs"
]);

const CHARGE_FIELDS = Object.freeze([
  "kind",
  "fromOfferVersionRef",
  "toOfferVersionRef",
  "remainingMs",
  "pendingCreditUnits"
]);

const STARTUP_FIELDS = Object.freeze([
  "planSwitchEnabled",
  "authorityEnabled"
]);

function fail(code) {
  return Object.freeze({ ok: false, code });
}

function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function readExact(input, fields) {
  if (!isPlainObject(input)) return null;
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== "string")
    || !fields.every((field) => keys.includes(field))
  ) {
    return null;
  }
  const snapshot = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (
      !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      return null;
    }
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

function isSafeNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function tierFor(offerVersionRef) {
  if (typeof offerVersionRef !== "string" || !REFERENCE.test(offerVersionRef)) {
    return null;
  }
  return TIER_BY_VERSION.get(offerVersionRef) ?? null;
}

export function planSwitchTierForOfferVersionRef(offerVersionRef) {
  const tier = tierFor(offerVersionRef);
  return tier ? tier : null;
}

export function planSwitchDurationMs(durationDays) {
  if (!Number.isSafeInteger(durationDays) || durationDays < 1) return null;
  const ms = durationDays * PLAN_SWITCH_MS_PER_DAY;
  return Number.isSafeInteger(ms) ? ms : null;
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function toSafeNumber(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function precheckPlanSwitchAccount(input) {
  const values = readExact(input, PRECHECK_FIELDS);
  if (!values) return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  if (typeof values.authorityFlagEnabled !== "boolean") {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  if (
    typeof values.commerceMode !== "string"
    || values.commerceMode.length === 0
    || values.commerceMode.trim() !== values.commerceMode
  ) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  if (!isSafeNonNegativeInteger(values.authorityRowCount)) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  if (values.authorityFlagEnabled) {
    return fail(PLAN_SWITCH_ERROR.AUTHORITY_MODE_UNSUPPORTED);
  }
  if (values.commerceMode !== PLAN_SWITCH_LEGACY_COMMERCE_MODE) {
    return fail(PLAN_SWITCH_ERROR.COMMERCE_MODEL_UNSUPPORTED);
  }
  if (values.authorityRowCount >= 1) {
    return fail(PLAN_SWITCH_ERROR.AUTHORITY_ROW_PRESENT);
  }
  return Object.freeze({ ok: true });
}

function ordinaryPurchase() {
  return Object.freeze({
    ok: true,
    kind: PLAN_SWITCH_ORDINARY_KIND
  });
}

function classifiedSwitch({
  kind,
  fromOfferVersionRef,
  toOfferVersionRef,
  remainingMs,
  cancelsSwitchRef,
  effectiveAtMs
}) {
  return Object.freeze({
    ok: true,
    kind,
    fromOfferVersionRef,
    toOfferVersionRef,
    remainingMs,
    cancelsSwitchRef,
    effectiveAtMs
  });
}

export function classifyPlanSwitch(input) {
  const values = readExact(input, CLASSIFY_FIELDS);
  if (!values) return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  if (!Number.isSafeInteger(values.nowMs)) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  const nowMs = values.nowMs;
  const scheduledRef = values.scheduledSwitchRef;
  const scheduledAt = values.scheduledEffectiveAtMs;
  const hasSchedule = scheduledRef !== null;
  if (hasSchedule) {
    if (typeof scheduledRef !== "string" || !REFERENCE.test(scheduledRef)) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    if (!Number.isSafeInteger(scheduledAt)) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    if (scheduledAt <= nowMs) {
      return fail(PLAN_SWITCH_ERROR.APPLICATION_PENDING);
    }
  } else if (scheduledAt !== null) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }

  const requested = tierFor(values.requestedOfferVersionRef);
  if (!requested) return fail(PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);

  const currentRef = values.currentOfferVersionRef;
  if (currentRef === null) {
    if (values.validUntilMs !== null) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    if (hasSchedule) return fail(PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
    return ordinaryPurchase();
  }
  if (typeof currentRef !== "string" || !REFERENCE.test(currentRef)) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  if (!Number.isSafeInteger(values.validUntilMs)) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  if (values.validUntilMs <= nowMs) {
    if (hasSchedule) return fail(PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
    return ordinaryPurchase();
  }

  const current = tierFor(currentRef);
  if (!current) return fail(PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
  const remainingMs = values.validUntilMs - nowMs;
  if (!Number.isSafeInteger(remainingMs) || remainingMs < 1) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }

  const cancelsSwitchRef = hasSchedule ? scheduledRef : null;
  if (current.offerVersionRef === requested.offerVersionRef) {
    return classifiedSwitch({
      kind: "renewal",
      fromOfferVersionRef: current.offerVersionRef,
      toOfferVersionRef: requested.offerVersionRef,
      remainingMs,
      cancelsSwitchRef,
      effectiveAtMs: null
    });
  }
  if (requested.rank > current.rank) {
    const inplace = current.durationDays === 30 && requested.durationDays === 30;
    const restart = requested.durationDays === 365;
    if (!inplace && !restart) return fail(PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
    if (remainingMs < PLAN_SWITCH_MIN_UPGRADE_REMAINING_MS) {
      return fail(PLAN_SWITCH_ERROR.UPGRADE_WINDOW_CLOSED);
    }
    return classifiedSwitch({
      kind: inplace ? "upgrade_inplace" : "upgrade_restart",
      fromOfferVersionRef: current.offerVersionRef,
      toOfferVersionRef: requested.offerVersionRef,
      remainingMs,
      cancelsSwitchRef,
      effectiveAtMs: null
    });
  }
  if (requested.rank < current.rank) {
    if (hasSchedule) return fail(PLAN_SWITCH_ERROR.ALREADY_SCHEDULED);
    return classifiedSwitch({
      kind: "downgrade_scheduled",
      fromOfferVersionRef: current.offerVersionRef,
      toOfferVersionRef: requested.offerVersionRef,
      remainingMs,
      cancelsSwitchRef: null,
      effectiveAtMs: values.validUntilMs
    });
  }
  return fail(PLAN_SWITCH_ERROR.OFFER_UNAVAILABLE);
}

export function computeSwitchCharge(input) {
  const values = readExact(input, CHARGE_FIELDS);
  if (!values) return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  if (!PLAN_SWITCH_KINDS.includes(values.kind)) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  const from = tierFor(values.fromOfferVersionRef);
  const to = tierFor(values.toOfferVersionRef);
  if (!from || !to) return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  if (
    !isSafeNonNegativeInteger(values.remainingMs)
    || !isSafeNonNegativeInteger(values.pendingCreditUnits)
  ) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }

  const priceNew = BigInt(to.listPriceUnits);
  const priceOld = BigInt(from.listPriceUnits);
  const remaining = BigInt(values.remainingMs);
  const pending = BigInt(values.pendingCreditUnits);
  const durationOld = BigInt(from.durationDays) * BigInt(PLAN_SWITCH_MS_PER_DAY);
  let switchCharge;
  let credit = 0n;

  if (values.kind === "renewal") {
    if (from.offerVersionRef !== to.offerVersionRef) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    switchCharge = priceNew;
  } else if (values.kind === "downgrade_scheduled") {
    if (!(to.rank < from.rank) || pending !== 0n) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    switchCharge = priceNew;
  } else if (values.kind === "upgrade_inplace") {
    if (
      !(to.rank > from.rank)
      || from.durationDays !== 30
      || to.durationDays !== 30
      || remaining <= 0n
    ) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    const delta = priceNew - priceOld;
    if (delta <= 0n) return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    const raw = (delta * remaining) / durationOld;
    switchCharge = raw < 1n ? 1n : raw;
    credit = raw >= delta ? 0n : delta - raw;
  } else if (values.kind === "upgrade_restart") {
    if (!(to.rank > from.rank) || to.durationDays !== 365 || remaining <= 0n) {
      return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
    }
    credit = ceilDiv(priceOld * remaining, durationOld);
    if (credit >= priceNew) {
      return fail(PLAN_SWITCH_ERROR.CREDIT_EXCEEDS_PRICE);
    }
    switchCharge = priceNew - credit;
  } else {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }

  let charge = switchCharge - pending;
  if (charge < 1n) charge = 1n;
  const listPriceUnits = toSafeNumber(priceNew);
  const creditUnits = toSafeNumber(credit);
  const pendingCreditUnits = toSafeNumber(pending);
  const chargeUnits = toSafeNumber(charge);
  if (
    listPriceUnits === null
    || creditUnits === null
    || pendingCreditUnits === null
    || chargeUnits === null
    || chargeUnits < 1
  ) {
    return fail(PLAN_SWITCH_ERROR.INVALID_INPUT);
  }
  return Object.freeze({
    ok: true,
    kind: values.kind,
    listPriceUnits,
    creditUnits,
    pendingCreditUnits,
    chargeUnits
  });
}

export function assertPlanSwitchStartupFlags(input) {
  const values = readExact(input, STARTUP_FIELDS);
  if (
    !values
    || typeof values.planSwitchEnabled !== "boolean"
    || typeof values.authorityEnabled !== "boolean"
  ) {
    const error = new Error("Plan switch startup flags are invalid");
    error.code = PLAN_SWITCH_ERROR.INVALID_INPUT;
    throw error;
  }
  if (values.planSwitchEnabled && values.authorityEnabled) {
    const error = new Error("Plan switch requires legacy commerce");
    error.code = PLAN_SWITCH_ERROR.REQUIRES_LEGACY_COMMERCE;
    throw error;
  }
}

// Every published plan offer must have a matching rank, price, and term.
// Returns the offer version refs that are missing or inconsistent.
export function planSwitchTierCoverageGaps(offers) {
  if (!Array.isArray(offers)) return Object.freeze(["invalid_catalog"]);
  const gaps = [];
  const seen = new Set();
  for (const offer of offers) {
    if (!offer || offer.category !== "plan") continue;
    const version = offer.offerVersionRef;
    seen.add(version);
    const tier = typeof version === "string" ? TIER_BY_VERSION.get(version) : null;
    if (!tier) {
      gaps.push(typeof version === "string" ? version : "unknown_plan");
      continue;
    }
    if (
      offer.offerRef !== tier.offerRef
      || offer.baseCoinUnits !== tier.listPriceUnits
      || offer.delivery?.durationDays !== tier.durationDays
      || offer.delivery?.monthlyTrafficGb !== tier.monthlyTrafficGb
    ) {
      gaps.push(version);
    }
  }
  for (const tier of PLAN_SWITCH_TIERS) {
    if (!seen.has(tier.offerVersionRef)) gaps.push(tier.offerVersionRef);
  }
  return Object.freeze(gaps);
}
