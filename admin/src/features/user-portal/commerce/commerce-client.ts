import type {
  PortalCoinAllocation,
  PortalCoinBalance,
  PortalCoinCommerceClient,
  PortalCoinCommerceClientErrorCode,
  PortalCoinCommerceErrorCode,
  PortalCommerceModel,
  PortalCommerceModelClient,
  PortalDeferredCheckoutQuote,
  PortalDeferredTransition,
  PortalCoinFulfillment,
  PortalCoinOffer,
  PortalCoinOrder,
  PortalCoinOrderPage,
  PortalCoinQuote,
  PortalPlanSwitchQuote,
  PortalPlanSwitchState,
  PortalCoinType,
  PortalWalletFirstCommerceClient
} from "./api-contract";

const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const SESSION_REFERENCE = /^[A-Za-z0-9._:-]{1,256}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const COIN_PRIORITY: PortalCoinType[] = [
  "bonus_coins",
  "paid_coins",
  "reward_coins"
];
const BALANCE_FIELDS = [
  "bonusCoins",
  "paidCoins",
  "rewardCoins",
  "heldCoins"
] as const;
type SpendableBalanceField = Exclude<keyof PortalCoinBalance, "heldCoins">;
const BALANCE_FIELD_BY_COIN = new Map<
  PortalCoinType,
  SpendableBalanceField
>([
  ["bonus_coins", "bonusCoins"],
  ["paid_coins", "paidCoins"],
  ["reward_coins", "rewardCoins"]
]);
const PAYMENT_STATUSES = new Set([
  "held",
  "capture_pending",
  "captured",
  "cancelled",
  "capture_failed",
  "reconciliation_required"
]);
const FULFILLMENT_STATUSES = new Set([
  "not_requested",
  "pending",
  "processing",
  "delivered",
  "failed"
]);
const FULFILLMENT_SAFE_CODES = new Set([
  "fulfillment_handler_failed",
  "fulfillment_result_invalid",
  "fulfillment_handler_unavailable",
  "fulfillment_attempt_limit"
]);
const DEFERRED_TRANSITION_STATES = new Set([
  "reserved",
  "processing",
  "effect_applied",
  "settled",
  "requote_required",
  "cancelled",
  "reconciliation_required"
]);
const DEFERRED_FLOW_KINDS = new Set([
  "initial_activation",
  "scheduled_switch"
]);
const COMMERCE_ERROR_CODES = new Set<PortalCoinCommerceErrorCode>([
  "cancel_window_closed",
  "capture_in_progress",
  "commerce_not_found",
  "commerce_rate_limited",
  "commerce_request_invalid",
  "commerce_session_invalid",
  "commerce_unavailable",
  "idempotency_key_required",
  "idempotency_key_reused",
  "insufficient_coins",
  "offer_unavailable",
  "plan_switch_already_scheduled",
  "plan_switch_application_pending",
  "plan_switch_authority_mode_unsupported",
  "plan_switch_authority_row_present",
  "plan_switch_commerce_model_unsupported",
  "plan_switch_credit_exceeds_price",
  "plan_switch_precheck_unavailable",
  "plan_switch_state_changed",
  "plan_switch_upgrade_window_closed",
  "quote_expired",
  "quote_stale",
  "reconciliation_required",
  "deferred_transition_conflict",
  "wallet_first_deferred_required",
  "wallet_not_active"
]);
const RETRYABLE_COMMERCE_ERROR_CODES = new Set<PortalCoinCommerceErrorCode>([
  "capture_in_progress",
  "commerce_rate_limited",
  "commerce_unavailable"
]);

export class PortalCoinCommerceClientError extends Error {
  readonly code: PortalCoinCommerceClientErrorCode;
  readonly retryable: boolean;

  constructor(code: PortalCoinCommerceClientErrorCode, retryable: boolean) {
    super("Portal Commerce request failed.");
    this.name = "PortalCoinCommerceClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

function requestFailed() {
  return new PortalCoinCommerceClientError(
    "commerce_request_failed",
    true
  );
}

function invalidProjection(): never {
  throw requestFailed();
}

function exactObject(
  input: unknown,
  fields: readonly string[]
): Record<string, unknown> {
  try {
    if (
      !input
      || typeof input !== "object"
      || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) {
      return invalidProjection();
    }
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length) return invalidProjection();
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        return invalidProjection();
      }
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return invalidProjection();
      }
      result[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(result, field)) return invalidProjection();
    }
    return result;
  } catch (error) {
    if (error instanceof PortalCoinCommerceClientError) throw error;
    return invalidProjection();
  }
}

function exactArray(input: unknown): unknown[] {
  try {
    if (
      !Array.isArray(input)
      || Object.getPrototypeOf(input) !== Array.prototype
    ) {
      return invalidProjection();
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (
      !lengthDescriptor
      || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || Reflect.ownKeys(input).length !== lengthDescriptor.value + 1
    ) {
      return invalidProjection();
    }
    const result = new Array(lengthDescriptor.value);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(
        input,
        String(index)
      );
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        return invalidProjection();
      }
      result[index] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof PortalCoinCommerceClientError) throw error;
    return invalidProjection();
  }
}

function normalizedText(value: unknown) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
  ) {
    return invalidProjection();
  }
  return value;
}

function positiveSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    return invalidProjection();
  }
  return value as number;
}

function nonNegativeSafeInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return invalidProjection();
  }
  return value as number;
}

function safeAdd(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) return invalidProjection();
  return result;
}

function applyCoinDiscount(
  baseCoinUnits: number,
  discountBasisPoints: number
) {
  const numerator = BigInt(baseCoinUnits)
    * BigInt(10_000 - discountBasisPoints);
  return Number((numerator + 9_999n) / 10_000n);
}

function utcTimestamp(value: unknown) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    return invalidProjection();
  }
  return value;
}

function commerceReference(value: unknown) {
  if (typeof value !== "string" || !COMMERCE_REFERENCE.test(value)) {
    return invalidProjection();
  }
  return value;
}

function localeMap(input: unknown) {
  const value = exactObject(input, ["zh", "en"]);
  return {
    zh: normalizedText(value.zh),
    en: normalizedText(value.en)
  };
}

function noticeMap(input: unknown) {
  const value = exactObject(input, ["zh", "en"]);
  function notices(inputNotices: unknown) {
    const raw = exactArray(inputNotices);
    if (raw.length === 0) return invalidProjection();
    const result = raw.map(normalizedText);
    if (new Set(result).size !== result.length) return invalidProjection();
    return result;
  }
  return {
    zh: notices(value.zh),
    en: notices(value.en)
  };
}

function acceptedCoinTypes(input: unknown) {
  const values = exactArray(input);
  if (values.length === 0) return invalidProjection();
  let previousPriority = -1;
  const result: PortalCoinType[] = [];
  for (const value of values) {
    const priority = COIN_PRIORITY.indexOf(value as PortalCoinType);
    if (priority <= previousPriority || priority < 0) {
      return invalidProjection();
    }
    result.push(COIN_PRIORITY[priority]);
    previousPriority = priority;
  }
  return result;
}

function offerProjection(input: unknown): PortalCoinOffer {
  const value = exactObject(input, [
    "offerRef",
    "offerVersionRef",
    "category",
    "title",
    "summary",
    "importantNotices",
    "baseCoinUnits",
    "referencePrice",
    "acceptedCoinTypes",
    "delivery"
  ]);
  const common = {
    offerRef: commerceReference(value.offerRef),
    offerVersionRef: commerceReference(value.offerVersionRef),
    title: localeMap(value.title),
    summary: localeMap(value.summary),
    importantNotices: noticeMap(value.importantNotices),
    baseCoinUnits: positiveSafeInteger(value.baseCoinUnits),
    referencePrice: (() => {
      const price = exactObject(value.referencePrice, [
        "currency",
        "amountMinor"
      ]);
      if (price.currency !== "CNY") return invalidProjection();
      return {
        currency: "CNY" as const,
        amountMinor: positiveSafeInteger(price.amountMinor)
      };
    })(),
    acceptedCoinTypes: acceptedCoinTypes(value.acceptedCoinTypes)
  };
  const delivery = exactObject(value.delivery, [
    "kind",
    "durationDays",
    "monthlyTrafficGb",
    "trafficGb",
    "neverExpires",
    "discountBasisPoints"
  ]);
  if (value.category === "plan" && delivery.kind === "subscription_plan") {
    const discountBasisPoints = nonNegativeSafeInteger(
      delivery.discountBasisPoints
    );
    if (
      delivery.trafficGb !== null
      || delivery.neverExpires !== false
      || discountBasisPoints > 10_000
    ) {
      return invalidProjection();
    }
    return {
      ...common,
      category: "plan",
      delivery: {
        kind: "subscription_plan",
        durationDays: positiveSafeInteger(delivery.durationDays),
        monthlyTrafficGb: positiveSafeInteger(delivery.monthlyTrafficGb),
        trafficGb: null,
        neverExpires: false,
        discountBasisPoints
      }
    };
  }
  if (value.category === "data_pack" && delivery.kind === "data_pack") {
    if (
      delivery.durationDays !== null
      || delivery.monthlyTrafficGb !== null
      || delivery.neverExpires !== true
      || delivery.discountBasisPoints !== null
    ) {
      return invalidProjection();
    }
    return {
      ...common,
      category: "data_pack",
      delivery: {
        kind: "data_pack",
        durationDays: null,
        monthlyTrafficGb: null,
        trafficGb: positiveSafeInteger(delivery.trafficGb),
        neverExpires: true,
        discountBasisPoints: null
      }
    };
  }
  return invalidProjection();
}

function allocationProjection(
  input: unknown,
  amountUnits: number,
  acceptedTypes: PortalCoinType[],
  allowEmpty: boolean
): PortalCoinAllocation[] {
  const values = exactArray(input);
  if (!allowEmpty && values.length === 0) return invalidProjection();
  const accepted = new Set(acceptedTypes);
  let previousPriority = -1;
  let total = 0;
  const result: PortalCoinAllocation[] = [];
  for (const value of values) {
    const item = exactObject(value, ["coinType", "amountUnits"]);
    const priority = COIN_PRIORITY.indexOf(item.coinType as PortalCoinType);
    if (
      priority <= previousPriority
      || priority < 0
      || !accepted.has(COIN_PRIORITY[priority])
    ) {
      return invalidProjection();
    }
    const units = positiveSafeInteger(item.amountUnits);
    total = safeAdd(total, units);
    result.push({
      coinType: COIN_PRIORITY[priority],
      amountUnits: units
    });
    previousPriority = priority;
  }
  if (total !== amountUnits) return invalidProjection();
  return result;
}

function balanceProjection(input: unknown): PortalCoinBalance {
  const value = exactObject(input, BALANCE_FIELDS);
  return {
    bonusCoins: nonNegativeSafeInteger(value.bonusCoins),
    paidCoins: nonNegativeSafeInteger(value.paidCoins),
    rewardCoins: nonNegativeSafeInteger(value.rewardCoins),
    heldCoins: nonNegativeSafeInteger(value.heldCoins)
  };
}

const PLAN_SWITCH_KINDS = new Set([
  "renewal",
  "upgrade_inplace",
  "upgrade_restart",
  "downgrade_scheduled"
]);
const QUOTE_FIELDS = [
  "quoteRef",
  "offer",
  "amountUnits",
  "appliedDiscountBasisPoints",
  "purchaseAvailability",
  "shortfallUnits",
  "allocation",
  "balances",
  "expiresAt"
];
const ORDER_FIELDS = [
  "orderRef",
  "offer",
  "amountUnits",
  "allocation",
  "paymentStatus",
  "cancelUntil",
  "fulfillment",
  "createdAt",
  "updatedAt"
];

function hasOwnKey(input: unknown, key: string) {
  return Boolean(
    input
    && typeof input === "object"
    && Object.hasOwn(input, key)
  );
}

function planSwitchProjection(input: unknown): PortalPlanSwitchQuote {
  const value = exactObject(input, [
    "kind",
    "creditUnits",
    "chargeUnits",
    "effectiveAt",
    "cancelsPendingDowngrade"
  ]);
  if (
    !PLAN_SWITCH_KINDS.has(value.kind as string)
    || typeof value.cancelsPendingDowngrade !== "boolean"
  ) {
    return invalidProjection();
  }
  return {
    kind: value.kind as PortalPlanSwitchQuote["kind"],
    creditUnits: nonNegativeSafeInteger(value.creditUnits),
    chargeUnits: positiveSafeInteger(value.chargeUnits),
    effectiveAt: value.effectiveAt === null
      ? null
      : utcTimestamp(value.effectiveAt),
    cancelsPendingDowngrade: value.cancelsPendingDowngrade
  };
}

function quoteProjection(input: unknown): PortalCoinQuote {
  const withPlanSwitch = hasOwnKey(input, "planSwitch");
  const value = exactObject(
    input,
    withPlanSwitch ? [...QUOTE_FIELDS, "planSwitch"] : QUOTE_FIELDS
  );
  const offer = offerProjection(value.offer);
  const amountUnits = positiveSafeInteger(value.amountUnits);
  const appliedDiscountBasisPoints = nonNegativeSafeInteger(
    value.appliedDiscountBasisPoints
  );
  if (appliedDiscountBasisPoints > 10_000) return invalidProjection();
  const planSwitch = withPlanSwitch
    ? planSwitchProjection(value.planSwitch)
    : null;
  if (
    amountUnits !== applyCoinDiscount(
      planSwitch ? planSwitch.chargeUnits : offer.baseCoinUnits,
      appliedDiscountBasisPoints
    )
  ) {
    return invalidProjection();
  }
  if (
    value.purchaseAvailability !== "available"
    && value.purchaseAvailability !== "insufficient_balance"
  ) {
    return invalidProjection();
  }
  const shortfallUnits = nonNegativeSafeInteger(value.shortfallUnits);
  const balances = exactObject(value.balances, ["before", "after"]);
  const before = balanceProjection(balances.before);
  const after = balanceProjection(balances.after);
  let allocation: PortalCoinAllocation[];
  if (value.purchaseAvailability === "available") {
    if (shortfallUnits !== 0) return invalidProjection();
    allocation = allocationProjection(
      value.allocation,
      amountUnits,
      offer.acceptedCoinTypes,
      false
    );
    const allocated: Record<SpendableBalanceField, number> = {
      bonusCoins: 0,
      paidCoins: 0,
      rewardCoins: 0
    };
    for (const item of allocation) {
      allocated[BALANCE_FIELD_BY_COIN.get(item.coinType)!] = item.amountUnits;
    }
    for (const field of ["bonusCoins", "paidCoins", "rewardCoins"] as const) {
      if (after[field] !== before[field] - allocated[field]) {
        return invalidProjection();
      }
    }
    if (after.heldCoins !== safeAdd(before.heldCoins, amountUnits)) {
      return invalidProjection();
    }
  } else {
    if (shortfallUnits < 1) return invalidProjection();
    allocation = allocationProjection(
      value.allocation,
      0,
      offer.acceptedCoinTypes,
      true
    );
    for (const field of BALANCE_FIELDS) {
      if (after[field] !== before[field]) return invalidProjection();
    }
    let acceptedUnits = 0;
    for (const coinType of offer.acceptedCoinTypes) {
      acceptedUnits = safeAdd(
        acceptedUnits,
        before[BALANCE_FIELD_BY_COIN.get(coinType)!]
      );
    }
    if (
      acceptedUnits >= amountUnits
      || amountUnits - acceptedUnits !== shortfallUnits
    ) {
      return invalidProjection();
    }
  }
  return {
    quoteRef: commerceReference(value.quoteRef),
    offer,
    amountUnits,
    appliedDiscountBasisPoints,
    purchaseAvailability: value.purchaseAvailability,
    shortfallUnits,
    allocation,
    balances: { before, after },
    expiresAt: utcTimestamp(value.expiresAt),
    ...(planSwitch ? { planSwitch } : {})
  };
}

function fulfillmentProjection(
  input: unknown,
  paymentStatus: PortalCoinOrder["paymentStatus"]
): PortalCoinFulfillment {
  const value = exactObject(input, ["status", "safeCode"]);
  if (!FULFILLMENT_STATUSES.has(value.status as string)) {
    return invalidProjection();
  }
  const status = value.status as PortalCoinFulfillment["status"];
  if (
    paymentStatus !== "captured"
    && paymentStatus !== "reconciliation_required"
  ) {
    if (status !== "not_requested" || value.safeCode !== null) {
      return invalidProjection();
    }
    return { status: "not_requested", safeCode: null };
  }
  if (
    paymentStatus === "reconciliation_required"
    && status !== "not_requested"
    && status !== "delivered"
    && status !== "failed"
  ) {
    return invalidProjection();
  }
  if (
    paymentStatus === "captured"
    && status !== "pending"
    && status !== "processing"
    && status !== "delivered"
    && status !== "failed"
  ) {
    return invalidProjection();
  }
  if (
    status === "not_requested"
    && value.safeCode === null
  ) {
    return { status: "not_requested", safeCode: null };
  }
  if (status === "failed") {
    if (!FULFILLMENT_SAFE_CODES.has(value.safeCode as string)) {
      return invalidProjection();
    }
    return {
      status: "failed",
      safeCode: value.safeCode as Extract<
        PortalCoinFulfillment,
        { status: "failed" }
      >["safeCode"]
    };
  }
  if (value.safeCode !== null) return invalidProjection();
  return { status, safeCode: null };
}

function orderProjection(input: unknown): PortalCoinOrder {
  const withPlanSwitch = hasOwnKey(input, "planSwitch");
  const value = exactObject(
    input,
    withPlanSwitch ? [...ORDER_FIELDS, "planSwitch"] : ORDER_FIELDS
  );
  if (!PAYMENT_STATUSES.has(value.paymentStatus as string)) {
    return invalidProjection();
  }
  const offer = offerProjection(value.offer);
  const amountUnits = positiveSafeInteger(value.amountUnits);
  const planSwitch = withPlanSwitch
    ? planSwitchProjection(value.planSwitch)
    : null;
  if (planSwitch) {
    if (amountUnits > planSwitch.chargeUnits) return invalidProjection();
  } else if (amountUnits > offer.baseCoinUnits) {
    return invalidProjection();
  }
  const createdAt = utcTimestamp(value.createdAt);
  const cancelUntil = utcTimestamp(value.cancelUntil);
  const updatedAt = utcTimestamp(value.updatedAt);
  if (
    Date.parse(cancelUntil) < Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    return invalidProjection();
  }
  return {
    orderRef: commerceReference(value.orderRef),
    offer,
    amountUnits,
    allocation: allocationProjection(
      value.allocation,
      amountUnits,
      offer.acceptedCoinTypes,
      false
    ),
    paymentStatus: value.paymentStatus as PortalCoinOrder["paymentStatus"],
    cancelUntil,
    fulfillment: fulfillmentProjection(
      value.fulfillment,
      value.paymentStatus as PortalCoinOrder["paymentStatus"]
    ),
    createdAt,
    updatedAt,
    ...(planSwitch ? { planSwitch } : {})
  };
}

function offerListWrapper(input: unknown) {
  const value = exactObject(input, ["offers"]);
  return exactArray(value.offers).map(offerProjection);
}

function offerWrapper(input: unknown) {
  return offerProjection(exactObject(input, ["offer"]).offer);
}

function quoteWrapper(input: unknown) {
  return quoteProjection(exactObject(input, ["quote"]).quote);
}

function planSwitchStateProjection(input: unknown): PortalPlanSwitchState {
  const value = exactObject(input, ["current", "pendingSwitch", "offers"]);
  const current = value.current === null
    ? null
    : (() => {
      const currentValue = exactObject(value.current, ["offerRef", "validUntil"]);
      return {
        offerRef: commerceReference(currentValue.offerRef),
        validUntil: utcTimestamp(currentValue.validUntil)
      };
    })();
  const pendingSwitch = value.pendingSwitch === null
    ? null
    : (() => {
      const pending = exactObject(value.pendingSwitch, ["toOfferRef", "effectiveAt"]);
      return {
        toOfferRef: commerceReference(pending.toOfferRef),
        effectiveAt: utcTimestamp(pending.effectiveAt)
      };
    })();
  const offers = exactArray(value.offers).map((entry) => {
    const item = exactObject(entry, [
      "offerRef",
      "action",
      "chargeUnits",
      "creditUnits",
      "effectiveAt",
      "reasonCode"
    ]);
    if (![
      "current_renew",
      "upgrade",
      "downgrade",
      "unavailable"
    ].includes(item.action as string)) {
      return invalidProjection();
    }
    const action = item.action as PortalPlanSwitchState["offers"][number]["action"];
    const reasonCode = item.reasonCode === null
      ? null
      : COMMERCE_ERROR_CODES.has(item.reasonCode as PortalCoinCommerceErrorCode)
        ? item.reasonCode as PortalCoinCommerceErrorCode
        : invalidProjection();
    const chargeUnits = item.chargeUnits === null
      ? null
      : positiveSafeInteger(item.chargeUnits);
    const creditUnits = item.creditUnits === null
      ? null
      : nonNegativeSafeInteger(item.creditUnits);
    const effectiveAt = item.effectiveAt === null
      ? null
      : utcTimestamp(item.effectiveAt);
    if (action === "unavailable") {
      if (chargeUnits !== null || creditUnits !== null || effectiveAt !== null) {
        return invalidProjection();
      }
    } else if (chargeUnits === null || creditUnits === null || reasonCode !== null) {
      return invalidProjection();
    }
    if (action === "downgrade" && effectiveAt === null) return invalidProjection();
    if (action !== "downgrade" && action !== "unavailable" && effectiveAt !== null) {
      return invalidProjection();
    }
    return {
      offerRef: commerceReference(item.offerRef),
      action,
      chargeUnits,
      creditUnits,
      effectiveAt,
      reasonCode
    };
  });
  return { current, pendingSwitch, offers };
}

function orderWrapper(input: unknown) {
  return orderProjection(exactObject(input, ["order"]).order);
}

function commerceModelWrapper(input: unknown): PortalCommerceModel {
  const value = exactObject(input, ["commerceModel"]);
  if (
    value.commerceModel !== "legacy"
    && value.commerceModel !== "wallet_first_unique_v1"
  ) {
    return invalidProjection();
  }
  return value.commerceModel;
}

function deferredCheckoutWrapper(input: unknown): PortalDeferredCheckoutQuote {
  const value = exactObject(input, ["quote"]);
  const quote = exactObject(value.quote, [
    "quoteRef",
    "offer",
    "amountUnits",
    "appliedDiscountBasisPoints",
    "purchaseAvailability",
    "shortfallUnits",
    "allocation",
    "balances",
    "expiresAt",
    "transition"
  ]);
  const projectedQuote = quoteProjection({
    quoteRef: quote.quoteRef,
    offer: quote.offer,
    amountUnits: quote.amountUnits,
    appliedDiscountBasisPoints: quote.appliedDiscountBasisPoints,
    purchaseAvailability: quote.purchaseAvailability,
    shortfallUnits: quote.shortfallUnits,
    allocation: quote.allocation,
    balances: quote.balances,
    expiresAt: quote.expiresAt
  });
  const transition = exactObject(quote.transition, [
    "flowKind",
    "scheduledFor"
  ]);
  if (!DEFERRED_FLOW_KINDS.has(transition.flowKind as string)) {
    return invalidProjection();
  }
  return {
    ...projectedQuote,
    transition: {
      flowKind: transition.flowKind as PortalDeferredCheckoutQuote["transition"]["flowKind"],
      scheduledFor: utcTimestamp(transition.scheduledFor)
    }
  };
}

function deferredTransitionProjection(input: unknown): PortalDeferredTransition {
  const value = exactObject(input, [
    "transitionRef",
    "offer",
    "amountUnits",
    "flowKind",
    "scheduledFor",
    "state",
    "safeCode",
    "reservedAt",
    "settledAt",
    "createdAt",
    "updatedAt"
  ]);
  if (
    !DEFERRED_FLOW_KINDS.has(value.flowKind as string)
    || !DEFERRED_TRANSITION_STATES.has(value.state as string)
    || (
      value.safeCode !== null
      && (typeof value.safeCode !== "string" || !COMMERCE_REFERENCE.test(value.safeCode))
    )
  ) {
    return invalidProjection();
  }
  const offer = offerProjection(value.offer);
  const amountUnits = positiveSafeInteger(value.amountUnits);
  if (amountUnits > offer.baseCoinUnits) return invalidProjection();
  const createdAt = utcTimestamp(value.createdAt);
  const reservedAt = utcTimestamp(value.reservedAt);
  const scheduledFor = utcTimestamp(value.scheduledFor);
  const settledAt = value.settledAt === null
    ? null
    : utcTimestamp(value.settledAt);
  const updatedAt = utcTimestamp(value.updatedAt);
  if (
    Date.parse(reservedAt) < Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (settledAt !== null && Date.parse(settledAt) < Date.parse(reservedAt))
  ) {
    return invalidProjection();
  }
  return {
    transitionRef: commerceReference(value.transitionRef),
    offer,
    amountUnits,
    flowKind: value.flowKind as PortalDeferredTransition["flowKind"],
    scheduledFor,
    state: value.state as PortalDeferredTransition["state"],
    safeCode: value.safeCode,
    reservedAt,
    settledAt,
    createdAt,
    updatedAt
  };
}

function deferredTransitionWrapper(input: unknown) {
  return deferredTransitionProjection(
    exactObject(input, ["transition"]).transition
  );
}

function deferredTransitionListWrapper(input: unknown) {
  const value = exactObject(input, ["transitions"]);
  return exactArray(value.transitions).map(deferredTransitionProjection);
}

type OrderCursor = {
  afterCreatedAt: string;
  afterOrderRef: string;
};

function isStrictlyAfter(
  value: Pick<PortalCoinOrder, "createdAt" | "orderRef">,
  cursor: OrderCursor
) {
  return value.createdAt < cursor.afterCreatedAt
    || (
      value.createdAt === cursor.afterCreatedAt
      && value.orderRef < cursor.afterOrderRef
    );
}

function orderPageProjection(
  input: unknown,
  limit: number,
  requestCursor: OrderCursor | null
): PortalCoinOrderPage {
  const value = exactObject(input, ["orders", "nextCursor"]);
  const orders = exactArray(value.orders).map(orderProjection);
  if (orders.length > limit) return invalidProjection();
  const seenOrderRefs = new Set<string>();
  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    if (seenOrderRefs.has(order.orderRef)) return invalidProjection();
    seenOrderRefs.add(order.orderRef);
    if (
      index > 0
      && !isStrictlyAfter(order, {
        afterCreatedAt: orders[index - 1].createdAt,
        afterOrderRef: orders[index - 1].orderRef
      })
    ) {
      return invalidProjection();
    }
    if (requestCursor && !isStrictlyAfter(order, requestCursor)) {
      return invalidProjection();
    }
  }
  if (orders.length === 0) {
    if (value.nextCursor !== null) return invalidProjection();
    return { orders, nextCursor: null };
  }
  if (value.nextCursor === null) {
    return { orders, nextCursor: null };
  }
  const cursorValue = exactObject(value.nextCursor, [
    "afterCreatedAt",
    "afterOrderRef"
  ]);
  const nextCursor = {
    afterCreatedAt: utcTimestamp(cursorValue.afterCreatedAt),
    afterOrderRef: commerceReference(cursorValue.afterOrderRef)
  };
  const finalOrder = orders[orders.length - 1];
  if (
    nextCursor.afterCreatedAt !== finalOrder.createdAt
    || nextCursor.afterOrderRef !== finalOrder.orderRef
  ) {
    return invalidProjection();
  }
  return { orders, nextCursor };
}

function exactInput(input: unknown, fields: readonly string[]) {
  try {
    return exactObject(input, fields);
  } catch {
    throw requestFailed();
  }
}

function sessionReference(value: unknown) {
  if (typeof value !== "string" || !SESSION_REFERENCE.test(value)) {
    throw requestFailed();
  }
  return value;
}

function callerCommerceReference(value: unknown) {
  if (typeof value !== "string" || !COMMERCE_REFERENCE.test(value)) {
    throw requestFailed();
  }
  return value;
}

function callerIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw requestFailed();
  }
  return value;
}

function callerOrderListInput(input: unknown) {
  try {
    if (
      !input
      || typeof input !== "object"
      || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) {
      throw requestFailed();
    }
    const keys = Reflect.ownKeys(input);
    const hasCreatedAt = keys.includes("afterCreatedAt");
    const hasOrderRef = keys.includes("afterOrderRef");
    if (hasCreatedAt !== hasOrderRef) throw requestFailed();
    return exactObject(
      input,
      hasCreatedAt
        ? ["sessionRef", "limit", "afterCreatedAt", "afterOrderRef"]
        : ["sessionRef", "limit"]
    );
  } catch {
    throw requestFailed();
  }
}

function callerOrderListLimit(value: unknown) {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 1
    || (value as number) > 100
  ) {
    throw requestFailed();
  }
  return value as number;
}

function callerUtcTimestamp(value: unknown) {
  try {
    return utcTimestamp(value);
  } catch {
    throw requestFailed();
  }
}

function structuredCommerceError(input: unknown) {
  const wrapper = exactObject(input, ["error"]);
  const error = exactObject(wrapper.error, ["code", "retryable"]);
  if (
    typeof error.code !== "string"
    || !COMMERCE_ERROR_CODES.has(error.code as PortalCoinCommerceErrorCode)
    || typeof error.retryable !== "boolean"
  ) {
    return invalidProjection();
  }
  const code = error.code as PortalCoinCommerceErrorCode;
  if (error.retryable !== RETRYABLE_COMMERCE_ERROR_CODES.has(code)) {
    return invalidProjection();
  }
  return new PortalCoinCommerceClientError(
    code,
    error.retryable
  );
}

async function request<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  expectedStatus: number,
  project: (input: unknown) => T,
  options: { legacyUnauthorizedUnavailable?: boolean } = {}
): Promise<T> {
  let body: unknown;
  let ok: boolean;
  let status: number;
  try {
    const response = await fetchFn(url, init);
    ok = response.ok;
    status = response.status;
    if (typeof ok !== "boolean") throw requestFailed();
    if (ok && response.status !== expectedStatus) throw requestFailed();
    const text = await response.text();
    if (typeof text !== "string") throw requestFailed();
    body = JSON.parse(text) as unknown;
  } catch {
    throw requestFailed();
  }
  if (!ok) {
    if (
      options.legacyUnauthorizedUnavailable
      && status === 401
    ) {
      try {
        const legacy = exactObject(body, ["error"]);
        if (legacy.error === "Unauthorized") {
          throw new PortalCoinCommerceClientError(
            "commerce_unavailable",
            true
          );
        }
      } catch (error) {
        if (
          error instanceof PortalCoinCommerceClientError
          && error.code === "commerce_unavailable"
        ) {
          throw error;
        }
      }
    }
    try {
      throw structuredCommerceError(body);
    } catch (error) {
      if (
        error instanceof PortalCoinCommerceClientError
        && error.code !== "commerce_request_failed"
      ) {
        throw error;
      }
      throw requestFailed();
    }
  }
  try {
    return project(body);
  } catch {
    throw requestFailed();
  }
}

function getInit(sessionRef: string): RequestInit {
  return {
    method: "GET",
    headers: { "X-Portal-Session": sessionRef }
  };
}

function postInit(
  sessionRef: string,
  body: string,
  idempotencyKey?: string
): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Portal-Session": sessionRef,
      ...(idempotencyKey === undefined
        ? {}
        : { "Idempotency-Key": idempotencyKey })
    },
    body
  };
}

export function createPortalCoinCommerceClient(
  options: { fetchFn?: typeof fetch } = {}
): PortalCoinCommerceClient {
  const fetchFn = options.fetchFn ?? fetch;
  return {
    async listOffers(input) {
      const value = exactInput(input, ["sessionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      return request(
        fetchFn,
        "/api/portal/catalog/offers",
        getInit(sessionRef),
        200,
        offerListWrapper
      );
    },

    async listOrders(input) {
      const value = callerOrderListInput(input);
      const sessionRef = sessionReference(value.sessionRef);
      const limit = callerOrderListLimit(value.limit);
      let requestCursor: OrderCursor | null = null;
      const query = new URLSearchParams();
      query.set("limit", String(limit));
      if (Object.hasOwn(value, "afterCreatedAt")) {
        requestCursor = {
          afterCreatedAt: callerUtcTimestamp(value.afterCreatedAt),
          afterOrderRef: callerCommerceReference(value.afterOrderRef)
        };
        query.set("afterCreatedAt", requestCursor.afterCreatedAt);
        query.set("afterOrderRef", requestCursor.afterOrderRef);
      }
      return request(
        fetchFn,
        `/api/portal/commerce/orders?${query.toString()}`,
        getInit(sessionRef),
        200,
        (body) => orderPageProjection(body, limit, requestCursor),
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async getOffer(input) {
      const value = exactInput(input, ["sessionRef", "offerRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      const offerRef = callerCommerceReference(value.offerRef);
      return request(
        fetchFn,
        `/api/portal/catalog/offers/${offerRef}`,
        getInit(sessionRef),
        200,
        (body) => {
          const offer = offerWrapper(body);
          if (offer.offerRef !== offerRef) return invalidProjection();
          return offer;
        }
      );
    },

    async previewCheckout(input) {
      const value = exactInput(input, ["sessionRef", "offerRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      const offerRef = callerCommerceReference(value.offerRef);
      return request(
        fetchFn,
        "/api/portal/commerce/checkout-preview",
        postInit(sessionRef, JSON.stringify({ offerRef })),
        200,
        (body) => {
          const quote = quoteWrapper(body);
          if (quote.offer.offerRef !== offerRef) return invalidProjection();
          return quote;
        }
      );
    },

    async readPlanSwitchState(input) {
      const value = exactInput(input, ["sessionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      let response: Response;
      try {
        response = await fetchFn(
          "/api/portal/commerce/plan-switch/state",
          getInit(sessionRef)
        );
      } catch {
        throw requestFailed();
      }
      if (response.status === 404) return null;
      let body: unknown;
      try {
        const text = await response.text();
        if (typeof text !== "string") throw requestFailed();
        body = JSON.parse(text) as unknown;
      } catch (error) {
        if (error instanceof PortalCoinCommerceClientError) throw error;
        throw requestFailed();
      }
      if (response.status !== 200) {
        try {
          throw structuredCommerceError(body);
        } catch (error) {
          if (
            error instanceof PortalCoinCommerceClientError
            && error.code !== "commerce_request_failed"
          ) {
            throw error;
          }
          throw requestFailed();
        }
      }
      try {
        return planSwitchStateProjection(body);
      } catch {
        throw requestFailed();
      }
    },

    async createOrder(input) {
      const value = exactInput(input, [
        "sessionRef",
        "quoteRef",
        "idempotencyKey"
      ]);
      const sessionRef = sessionReference(value.sessionRef);
      const quoteRef = callerCommerceReference(value.quoteRef);
      const idempotencyKey = callerIdempotencyKey(value.idempotencyKey);
      return request(
        fetchFn,
        "/api/portal/commerce/orders",
        postInit(
          sessionRef,
          JSON.stringify({ quoteRef }),
          idempotencyKey
        ),
        201,
        orderWrapper
      );
    },

    async getOrder(input) {
      const value = exactInput(input, ["sessionRef", "orderRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      const orderRef = callerCommerceReference(value.orderRef);
      return request(
        fetchFn,
        `/api/portal/commerce/orders/${orderRef}`,
        getInit(sessionRef),
        200,
        (body) => {
          const order = orderWrapper(body);
          if (order.orderRef !== orderRef) return invalidProjection();
          return order;
        }
      );
    },

    async cancelOrder(input) {
      const value = exactInput(input, [
        "sessionRef",
        "orderRef",
        "idempotencyKey"
      ]);
      const sessionRef = sessionReference(value.sessionRef);
      const orderRef = callerCommerceReference(value.orderRef);
      const idempotencyKey = callerIdempotencyKey(value.idempotencyKey);
      return request(
        fetchFn,
        `/api/portal/commerce/orders/${orderRef}/cancel`,
        postInit(sessionRef, "{}", idempotencyKey),
        200,
        (body) => {
          const order = orderWrapper(body);
          if (order.orderRef !== orderRef) return invalidProjection();
          return order;
        }
      );
    }
  };
}

/**
 * Reads the authenticated account's model projection.  There is intentionally
 * no setter or caller-supplied model input: the server alone selects whether
 * the legacy or deferred route family is legal for the session.
 */
export function createPortalCommerceModelClient(
  options: { fetchFn?: typeof fetch } = {}
): PortalCommerceModelClient {
  const fetchFn = options.fetchFn ?? fetch;
  return {
    async getCommerceModel(input) {
      const value = exactInput(input, ["sessionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      return request(
        fetchFn,
        "/api/portal/commerce/model",
        getInit(sessionRef),
        200,
        commerceModelWrapper,
        { legacyUnauthorizedUnavailable: true }
      );
    }
  };
}

/**
 * Dedicated wallet-first browser surface.  This client has no ordinary Order
 * methods, and every mutation sends only a server-issued quote/transition
 * reference plus an idempotency key.  Flow, schedule, chain, allocation and
 * priority remain exclusively server-derived.
 */
export function createPortalWalletFirstCommerceClient(
  options: { fetchFn?: typeof fetch } = {}
): PortalWalletFirstCommerceClient {
  const fetchFn = options.fetchFn ?? fetch;
  return {
    async listOffers(input) {
      const value = exactInput(input, ["sessionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      return request(
        fetchFn,
        "/api/portal/commerce/deferred/offers",
        getInit(sessionRef),
        200,
        offerListWrapper,
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async getOffer(input) {
      const value = exactInput(input, ["sessionRef", "offerRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      const offerRef = callerCommerceReference(value.offerRef);
      return request(
        fetchFn,
        `/api/portal/commerce/deferred/offers/${offerRef}`,
        getInit(sessionRef),
        200,
        (body) => {
          const offer = offerWrapper(body);
          if (offer.offerRef !== offerRef) return invalidProjection();
          return offer;
        },
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async previewDeferredCheckout(input) {
      const value = exactInput(input, ["sessionRef", "offerRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      const offerRef = callerCommerceReference(value.offerRef);
      return request(
        fetchFn,
        "/api/portal/commerce/deferred/checkout-preview",
        postInit(sessionRef, JSON.stringify({ offerRef })),
        200,
        (body) => {
          const quote = deferredCheckoutWrapper(body);
          if (quote.offer.offerRef !== offerRef) return invalidProjection();
          return quote;
        },
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async listDeferredTransitions(input) {
      const value = exactInput(input, ["sessionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      return request(
        fetchFn,
        "/api/portal/commerce/deferred/transitions",
        getInit(sessionRef),
        200,
        deferredTransitionListWrapper,
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async getDeferredTransition(input) {
      const value = exactInput(input, ["sessionRef", "transitionRef"]);
      const sessionRef = sessionReference(value.sessionRef);
      const transitionRef = callerCommerceReference(value.transitionRef);
      return request(
        fetchFn,
        `/api/portal/commerce/deferred/transitions/${transitionRef}`,
        getInit(sessionRef),
        200,
        (body) => {
          const transition = deferredTransitionWrapper(body);
          if (transition.transitionRef !== transitionRef) return invalidProjection();
          return transition;
        },
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async reserveDeferredTransition(input) {
      const value = exactInput(input, [
        "sessionRef",
        "quoteRef",
        "idempotencyKey"
      ]);
      const sessionRef = sessionReference(value.sessionRef);
      const quoteRef = callerCommerceReference(value.quoteRef);
      const idempotencyKey = callerIdempotencyKey(value.idempotencyKey);
      return request(
        fetchFn,
        "/api/portal/commerce/deferred/transitions",
        postInit(
          sessionRef,
          JSON.stringify({ quoteRef }),
          idempotencyKey
        ),
        201,
        deferredTransitionWrapper,
        { legacyUnauthorizedUnavailable: true }
      );
    },

    async cancelDeferredTransition(input) {
      const value = exactInput(input, [
        "sessionRef",
        "transitionRef",
        "idempotencyKey"
      ]);
      const sessionRef = sessionReference(value.sessionRef);
      const transitionRef = callerCommerceReference(value.transitionRef);
      const idempotencyKey = callerIdempotencyKey(value.idempotencyKey);
      return request(
        fetchFn,
        `/api/portal/commerce/deferred/transitions/${transitionRef}/cancel`,
        postInit(sessionRef, "{}", idempotencyKey),
        200,
        (body) => {
          const transition = deferredTransitionWrapper(body);
          if (transition.transitionRef !== transitionRef) return invalidProjection();
          return transition;
        },
        { legacyUnauthorizedUnavailable: true }
      );
    }
  };
}
