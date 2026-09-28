import express, { Router } from "express";
import { types as utilTypes } from "node:util";

import {
  applyCoinDiscount,
  normalizeCoinCommerceOffer
} from "../services/platform/coin-commerce-domain.mjs";
import {
  PORTAL_COMMERCE_MODE_LEGACY,
  PORTAL_COMMERCE_MODE_WALLET_FIRST,
  resolveWalletFirstCommerceMode,
  snapshotWalletFirstCommerceService
} from "../services/platform/wallet-first-commerce-service.mjs";

const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const SESSION_REFERENCE = /^[A-Za-z0-9._:-]{1,256}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const JSON_LIMIT_BYTES = 16_384;
const PREVIEW_WINDOW_MS = 60_000;
const PREVIEW_WINDOW_MAX = 30;
const PREVIEW_BUCKET_CAPACITY = 10_000;
const JSON_BODY_BYTES = Symbol("portalCommerceJsonBodyBytes");
const ALLOCATION_ORDER = [
  "bonus_coins",
  "paid_coins",
  "reward_coins"
];
const BALANCE_FIELDS = [
  "bonusCoins",
  "paidCoins",
  "rewardCoins",
  "heldCoins"
];
const BALANCE_FIELD_BY_COIN_TYPE = new Map([
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
const DEFERRED_SAFE_CODE = /^[a-z][a-z0-9_]{2,95}$/;
const STORE_ERROR_RESPONSES = new Map([
  ["commerce_not_found", [404, "commerce_not_found"]],
  ["idempotency_key_required", [400, "idempotency_key_required"]],
  ["idempotency_key_reused", [409, "idempotency_key_reused"]],
  ["offer_unavailable", [409, "offer_unavailable"]],
  ["quote_expired", [409, "quote_expired"]],
  ["quote_stale", [409, "quote_stale"]],
  ["cancel_window_closed", [409, "cancel_window_closed"]],
  ["capture_in_progress", [409, "capture_in_progress"]],
  ["insufficient_coins", [423, "insufficient_coins"]],
  ["wallet_not_active", [423, "wallet_not_active"]],
  ["reconciliation_required", [423, "reconciliation_required"]]
]);

function projectionInvalid() {
  return new Error("invalid Portal Commerce projection");
}

function sendCommerceError(res, status, code) {
  res.status(status).json({
    error: {
      code,
      retryable: (
        code === "capture_in_progress"
        || code === "commerce_rate_limited"
        || code === "commerce_unavailable"
      )
    }
  });
}

function preventSubscriptionCaching(_req, res, next) {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex");
  next();
}

function projectDataPackDelivery(value, orderRef) {
  const delivery = snapshotExactObject(value, ["orderRef", "subscriptionUrl", "usage"]);
  const usage = snapshotExactObject(delivery.usage, [
    "totalBytes", "usedBytes", "remainingBytes", "collectionStatus", "updatedAt", "exhausted"
  ]);
  let subscriptionUrl;
  try { subscriptionUrl = new URL(delivery.subscriptionUrl); }
  catch { throw projectionInvalid(); }
  if (delivery.orderRef !== orderRef || typeof delivery.subscriptionUrl !== "string"
    || subscriptionUrl.protocol !== "https:" || !subscriptionUrl.hostname
    || subscriptionUrl.username || subscriptionUrl.password || subscriptionUrl.hash
    || !Number.isSafeInteger(usage.totalBytes) || usage.totalBytes <= 0
    || !["pending", "stale", "measured", "measured_zero"].includes(usage.collectionStatus)) {
    throw projectionInvalid();
  }
  if (usage.collectionStatus === "pending") {
    if (usage.usedBytes !== null || usage.remainingBytes !== null
      || usage.updatedAt !== null || usage.exhausted !== null) throw projectionInvalid();
  } else if (!Number.isSafeInteger(usage.usedBytes) || usage.usedBytes < 0
    || usage.remainingBytes !== Math.max(0, usage.totalBytes - usage.usedBytes)
    || usage.exhausted !== (usage.usedBytes >= usage.totalBytes)
    || (usage.collectionStatus === "measured_zero" && usage.usedBytes !== 0)
    || typeof usage.updatedAt !== "string"
    || !Number.isFinite(Date.parse(usage.updatedAt))) throw projectionInvalid();
  return { orderRef, subscriptionUrl: delivery.subscriptionUrl, usage };
}

function ownErrorCode(error) {
  try {
    if (
      utilTypes.isProxy(error)
      || !error
      || (typeof error !== "object" && typeof error !== "function")
    ) {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    if (
      !descriptor
      || !("value" in descriptor)
      || typeof descriptor.value !== "string"
    ) {
      return null;
    }
    return descriptor.value;
  } catch {
    return null;
  }
}

function sendStoreError(res, error, { offerLookup = false } = {}) {
  const code = ownErrorCode(error);
  if (offerLookup && code === "offer_unavailable") {
    sendCommerceError(res, 404, "commerce_not_found");
    return;
  }
  const mapped = STORE_ERROR_RESPONSES.get(code);
  if (mapped) {
    sendCommerceError(res, mapped[0], mapped[1]);
    return;
  }
  sendCommerceError(res, 503, "commerce_unavailable");
}

function sendDeferredStoreError(res, error, { offerLookup = false } = {}) {
  const code = ownErrorCode(error);
  if (
    offerLookup
    && (code === "offer_unavailable" || code === "unsupported_deferred_transition_offer")
  ) {
    sendCommerceError(res, 404, "commerce_not_found");
    return;
  }
  if (code === "deferred_transition_not_found") {
    sendCommerceError(res, 404, "commerce_not_found");
    return;
  }
  if (code === "deferred_transition_idempotency_conflict") {
    sendCommerceError(res, 409, "idempotency_key_reused");
    return;
  }
  if (code === "quote_expired" || code === "quote_stale") {
    // A deferred quote is immutable. The caller must refresh it rather than
    // retrying against a stale wallet version or expiry window.
    sendCommerceError(res, 409, code);
    return;
  }
  if (code === "unsupported_deferred_transition_offer" || code === "offer_unavailable") {
    sendCommerceError(res, 409, "offer_unavailable");
    return;
  }
  if (
    code === "deferred_transition_state_conflict"
    || code === "deferred_transition_account_conflict"
    || code === "deferred_transition_queue_full"
    || code === "deferred_transition_expected_chain_invalid"
  ) {
    sendCommerceError(res, 409, "deferred_transition_conflict");
    return;
  }
  if (
    code === "deferred_reservation_invalid"
    || code === "deferred_reservation_capture_invalid"
    || code === "deferred_transition_account_not_eligible"
    || code === "reconciliation_required"
  ) {
    sendCommerceError(res, 423, "reconciliation_required");
    return;
  }
  if (code === "insufficient_coins" || code === "wallet_not_active") {
    sendStoreError(res, error);
    return;
  }
  if (code === "deferred_transition_invalid_input") {
    sendCommerceError(res, 400, "commerce_request_invalid");
    return;
  }
  // All unrecognized deferred/runtime failures are deliberately collapsed.
  sendCommerceError(res, 503, "commerce_unavailable");
}

function snapshotExactObject(value, fields) {
  try {
    if (
      utilTypes.isProxy(value)
      || !value
      || typeof value !== "object"
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw projectionInvalid();
    }
    const expected = new Set(fields);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) throw projectionInvalid();
    const snapshot = {};
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        throw projectionInvalid();
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        throw projectionInvalid();
      }
      snapshot[key] = descriptor.value;
    }
    for (const field of fields) {
      if (!Object.hasOwn(snapshot, field)) throw projectionInvalid();
    }
    return snapshot;
  } catch {
    throw projectionInvalid();
  }
}

function snapshotPlainArray(value) {
  try {
    if (
      utilTypes.isProxy(value)
      || !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
    ) {
      throw projectionInvalid();
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      !lengthDescriptor
      || !("value" in lengthDescriptor)
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      throw projectionInvalid();
    }
    const length = lengthDescriptor.value;
    if (Reflect.ownKeys(value).length !== length + 1) {
      throw projectionInvalid();
    }
    const snapshot = new Array(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        !descriptor
        || !descriptor.enumerable
        || !("value" in descriptor)
      ) {
        throw projectionInvalid();
      }
      snapshot[index] = descriptor.value;
    }
    return snapshot;
  } catch {
    throw projectionInvalid();
  }
}

function requirePositiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw projectionInvalid();
  }
  return value;
}

function requireNonNegativeSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw projectionInvalid();
  }
  return value;
}

function safeAdd(left, right) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) throw projectionInvalid();
  return total;
}

function requireUtcTimestamp(value) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw projectionInvalid();
  }
  return value;
}

function copyArray(value) {
  const snapshot = snapshotPlainArray(value);
  const copy = new Array(snapshot.length);
  for (let index = 0; index < snapshot.length; index += 1) {
    copy[index] = snapshot[index];
  }
  return copy;
}

function snapshotOfferForNormalization(input) {
  const value = snapshotExactObject(input, [
    "offerRef",
    "offerVersionRef",
    "version",
    "category",
    "title",
    "summary",
    "importantNotices",
    "baseCoinUnits",
    "referencePrice",
    "acceptedCoinTypes",
    "delivery"
  ]);
  const title = snapshotExactObject(value.title, ["zh", "en"]);
  const summary = snapshotExactObject(value.summary, ["zh", "en"]);
  const importantNotices = snapshotExactObject(
    value.importantNotices,
    ["zh", "en"]
  );
  const referencePrice = snapshotExactObject(
    value.referencePrice,
    ["currency", "amountMinor"]
  );
  const delivery = snapshotExactObject(value.delivery, [
    "kind",
    "durationDays",
    "monthlyTrafficGb",
    "trafficGb",
    "neverExpires",
    "discountBasisPoints"
  ]);
  return {
    offerRef: value.offerRef,
    offerVersionRef: value.offerVersionRef,
    version: value.version,
    category: value.category,
    title: {
      zh: title.zh,
      en: title.en
    },
    summary: {
      zh: summary.zh,
      en: summary.en
    },
    importantNotices: {
      zh: copyArray(importantNotices.zh),
      en: copyArray(importantNotices.en)
    },
    baseCoinUnits: value.baseCoinUnits,
    referencePrice: {
      currency: referencePrice.currency,
      amountMinor: referencePrice.amountMinor
    },
    acceptedCoinTypes: copyArray(value.acceptedCoinTypes),
    delivery: {
      kind: delivery.kind,
      durationDays: delivery.durationDays,
      monthlyTrafficGb: delivery.monthlyTrafficGb,
      trafficGb: delivery.trafficGb,
      neverExpires: delivery.neverExpires,
      discountBasisPoints: delivery.discountBasisPoints
    }
  };
}

function normalizeAndProjectOffer(input) {
  let normalized;
  try {
    normalized = normalizeCoinCommerceOffer(
      snapshotOfferForNormalization(input)
    );
  } catch {
    throw projectionInvalid();
  }
  return {
    normalized,
    portal: {
      offerRef: normalized.offerRef,
      offerVersionRef: normalized.offerVersionRef,
      category: normalized.category,
      title: {
        zh: normalized.title.zh,
        en: normalized.title.en
      },
      summary: {
        zh: normalized.summary.zh,
        en: normalized.summary.en
      },
      importantNotices: {
        zh: copyArray(normalized.importantNotices.zh),
        en: copyArray(normalized.importantNotices.en)
      },
      baseCoinUnits: normalized.baseCoinUnits,
      referencePrice: {
        currency: normalized.referencePrice.currency,
        amountMinor: normalized.referencePrice.amountMinor
      },
      acceptedCoinTypes: copyArray(normalized.acceptedCoinTypes),
      delivery: {
        kind: normalized.delivery.kind,
        durationDays: normalized.delivery.durationDays,
        monthlyTrafficGb: normalized.delivery.monthlyTrafficGb,
        trafficGb: normalized.delivery.trafficGb,
        neverExpires: normalized.delivery.neverExpires,
        discountBasisPoints: normalized.delivery.discountBasisPoints
      }
    }
  };
}

function projectOffer(input) {
  return normalizeAndProjectOffer(input).portal;
}

function normalizeAllocation(value, {
  amountUnits,
  acceptedCoinTypes,
  allowEmpty
}) {
  const values = snapshotPlainArray(value);
  if (!allowEmpty && values.length === 0) throw projectionInvalid();
  const accepted = new Set(acceptedCoinTypes);
  const allocation = new Array(values.length);
  let previousPriority = -1;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const item = snapshotExactObject(values[index], [
      "coinType",
      "amountUnits"
    ]);
    const priority = ALLOCATION_ORDER.indexOf(item.coinType);
    if (
      priority <= previousPriority
      || priority < 0
      || !accepted.has(item.coinType)
    ) {
      throw projectionInvalid();
    }
    const units = requirePositiveSafeInteger(item.amountUnits);
    total = safeAdd(total, units);
    previousPriority = priority;
    allocation[index] = {
      coinType: item.coinType,
      amountUnits: units
    };
  }
  if (total !== amountUnits) throw projectionInvalid();
  return allocation;
}

function normalizeBalance(value) {
  const fields = snapshotExactObject(value, BALANCE_FIELDS);
  return {
    bonusCoins: requireNonNegativeSafeInteger(fields.bonusCoins),
    paidCoins: requireNonNegativeSafeInteger(fields.paidCoins),
    rewardCoins: requireNonNegativeSafeInteger(fields.rewardCoins),
    heldCoins: requireNonNegativeSafeInteger(fields.heldCoins)
  };
}

function projectQuote(input) {
  const value = snapshotExactObject(input, [
    "quoteRef",
    "offer",
    "amountUnits",
    "appliedDiscountBasisPoints",
    "purchaseAvailability",
    "shortfallUnits",
    "allocation",
    "balances",
    "expiresAt"
  ]);
  if (
    typeof value.quoteRef !== "string"
    || !COMMERCE_REFERENCE.test(value.quoteRef)
  ) {
    throw projectionInvalid();
  }
  const offer = normalizeAndProjectOffer(value.offer);
  const amountUnits = requirePositiveSafeInteger(value.amountUnits);
  const appliedDiscountBasisPoints = requireNonNegativeSafeInteger(
    value.appliedDiscountBasisPoints
  );
  if (appliedDiscountBasisPoints > 10_000) throw projectionInvalid();
  let expectedAmount;
  try {
    expectedAmount = applyCoinDiscount({
      baseCoinUnits: offer.normalized.baseCoinUnits,
      discountBasisPoints: appliedDiscountBasisPoints
    });
  } catch {
    throw projectionInvalid();
  }
  if (amountUnits !== expectedAmount) throw projectionInvalid();
  if (
    value.purchaseAvailability !== "available"
    && value.purchaseAvailability !== "insufficient_balance"
  ) {
    throw projectionInvalid();
  }
  const shortfallUnits = requireNonNegativeSafeInteger(value.shortfallUnits);
  const balancesValue = snapshotExactObject(value.balances, [
    "before",
    "after"
  ]);
  const before = normalizeBalance(balancesValue.before);
  const after = normalizeBalance(balancesValue.after);
  let allocation;
  if (value.purchaseAvailability === "available") {
    if (shortfallUnits !== 0) throw projectionInvalid();
    allocation = normalizeAllocation(value.allocation, {
      amountUnits,
      acceptedCoinTypes: offer.portal.acceptedCoinTypes,
      allowEmpty: false
    });
    const allocatedByField = {
      bonusCoins: 0,
      paidCoins: 0,
      rewardCoins: 0
    };
    for (let index = 0; index < allocation.length; index += 1) {
      const item = allocation[index];
      const field = BALANCE_FIELD_BY_COIN_TYPE.get(item.coinType);
      allocatedByField[field] = item.amountUnits;
    }
    for (const field of ["bonusCoins", "paidCoins", "rewardCoins"]) {
      if (after[field] !== before[field] - allocatedByField[field]) {
        throw projectionInvalid();
      }
    }
    if (
      safeAdd(before.heldCoins, amountUnits) !== after.heldCoins
    ) {
      throw projectionInvalid();
    }
  } else {
    if (shortfallUnits < 1) throw projectionInvalid();
    allocation = normalizeAllocation(value.allocation, {
      amountUnits: 0,
      acceptedCoinTypes: offer.portal.acceptedCoinTypes,
      allowEmpty: true
    });
    for (const field of BALANCE_FIELDS) {
      if (before[field] !== after[field]) throw projectionInvalid();
    }
    let acceptedUnits = 0;
    for (
      let index = 0;
      index < offer.portal.acceptedCoinTypes.length;
      index += 1
    ) {
      const field = BALANCE_FIELD_BY_COIN_TYPE.get(
        offer.portal.acceptedCoinTypes[index]
      );
      acceptedUnits = safeAdd(acceptedUnits, before[field]);
    }
    if (
      acceptedUnits >= amountUnits
      || amountUnits - acceptedUnits !== shortfallUnits
    ) {
      throw projectionInvalid();
    }
  }
  return {
    quoteRef: value.quoteRef,
    offer: offer.portal,
    amountUnits,
    appliedDiscountBasisPoints,
    purchaseAvailability: value.purchaseAvailability,
    shortfallUnits,
    allocation,
    balances: { before, after },
    expiresAt: requireUtcTimestamp(value.expiresAt)
  };
}

function projectDeferredCheckout(input) {
  const value = snapshotExactObject(input, [
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
  const quote = projectQuote({
    quoteRef: value.quoteRef,
    offer: value.offer,
    amountUnits: value.amountUnits,
    appliedDiscountBasisPoints: value.appliedDiscountBasisPoints,
    purchaseAvailability: value.purchaseAvailability,
    shortfallUnits: value.shortfallUnits,
    allocation: value.allocation,
    balances: value.balances,
    expiresAt: value.expiresAt
  });
  const transition = snapshotExactObject(value.transition, [
    "flowKind",
    "scheduledFor"
  ]);
  if (!DEFERRED_FLOW_KINDS.has(transition.flowKind)) {
    throw projectionInvalid();
  }
  return {
    ...quote,
    transition: {
      flowKind: transition.flowKind,
      scheduledFor: requireUtcTimestamp(transition.scheduledFor)
    }
  };
}

function projectDeferredTransition(input) {
  const value = snapshotExactObject(input, [
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
    typeof value.transitionRef !== "string"
    || !COMMERCE_REFERENCE.test(value.transitionRef)
    || !DEFERRED_FLOW_KINDS.has(value.flowKind)
    || !DEFERRED_TRANSITION_STATES.has(value.state)
    || (
      value.safeCode !== null
      && (typeof value.safeCode !== "string" || !DEFERRED_SAFE_CODE.test(value.safeCode))
    )
  ) {
    throw projectionInvalid();
  }
  const scheduledFor = requireUtcTimestamp(value.scheduledFor);
  const reservedAt = requireUtcTimestamp(value.reservedAt);
  const settledAt = value.settledAt === null
    ? null
    : requireUtcTimestamp(value.settledAt);
  const createdAt = requireUtcTimestamp(value.createdAt);
  const updatedAt = requireUtcTimestamp(value.updatedAt);
  if (
    Date.parse(reservedAt) < Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
    || (settledAt !== null && Date.parse(settledAt) < Date.parse(reservedAt))
  ) {
    throw projectionInvalid();
  }
  return {
    transitionRef: value.transitionRef,
    offer: projectOffer(value.offer),
    amountUnits: requirePositiveSafeInteger(value.amountUnits),
    flowKind: value.flowKind,
    scheduledFor,
    state: value.state,
    safeCode: value.safeCode,
    reservedAt,
    settledAt,
    createdAt,
    updatedAt
  };
}

function projectDeferredTransitionList(input) {
  const transitions = snapshotPlainArray(input);
  return transitions.map(projectDeferredTransition);
}

function projectOrder(input) {
  const value = snapshotExactObject(input, [
    "orderRef",
    "offer",
    "amountUnits",
    "allocation",
    "paymentStatus",
    "cancelUntil",
    "fulfillment",
    "createdAt",
    "updatedAt"
  ]);
  if (
    typeof value.orderRef !== "string"
    || !COMMERCE_REFERENCE.test(value.orderRef)
  ) {
    throw projectionInvalid();
  }
  const offer = normalizeAndProjectOffer(value.offer);
  const amountUnits = requirePositiveSafeInteger(value.amountUnits);
  const allocation = normalizeAllocation(value.allocation, {
    amountUnits,
    acceptedCoinTypes: offer.portal.acceptedCoinTypes,
    allowEmpty: false
  });
  if (!PAYMENT_STATUSES.has(value.paymentStatus)) {
    throw projectionInvalid();
  }
  const fulfillmentValue = snapshotExactObject(value.fulfillment, [
    "status",
    "safeCode"
  ]);
  if (!FULFILLMENT_STATUSES.has(fulfillmentValue.status)) {
    throw projectionInvalid();
  }
  if (
    fulfillmentValue.safeCode !== null
    && !FULFILLMENT_SAFE_CODES.has(fulfillmentValue.safeCode)
  ) {
    throw projectionInvalid();
  }
  if (
    value.paymentStatus !== "captured"
    && value.paymentStatus !== "reconciliation_required"
  ) {
    if (
      fulfillmentValue.status !== "not_requested"
      || fulfillmentValue.safeCode !== null
    ) {
      throw projectionInvalid();
    }
  } else {
    // Reconciliation can retain a terminal command/receipt after settlement.
    // Preserve that store-validated history, but never admit a live command.
    const allowedStatuses = value.paymentStatus === "reconciliation_required"
      ? new Set(["not_requested", "delivered", "failed"])
      : new Set(["pending", "processing", "delivered", "failed"]);
    if (
      !allowedStatuses.has(fulfillmentValue.status)
    ) {
      throw projectionInvalid();
    }
    if (
      fulfillmentValue.status === "failed"
        ? !FULFILLMENT_SAFE_CODES.has(fulfillmentValue.safeCode)
        : fulfillmentValue.safeCode !== null
    ) {
      throw projectionInvalid();
    }
  }
  const cancelUntil = requireUtcTimestamp(value.cancelUntil);
  const createdAt = requireUtcTimestamp(value.createdAt);
  const updatedAt = requireUtcTimestamp(value.updatedAt);
  if (
    Date.parse(cancelUntil) < Date.parse(createdAt)
    || Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw projectionInvalid();
  }
  return {
    orderRef: value.orderRef,
    offer: offer.portal,
    amountUnits,
    allocation,
    paymentStatus: value.paymentStatus,
    cancelUntil,
    fulfillment: {
      status: fulfillmentValue.status,
      safeCode: fulfillmentValue.safeCode
    },
    createdAt,
    updatedAt
  };
}

function projectOfferList(input) {
  const offers = snapshotPlainArray(input);
  const projected = new Array(offers.length);
  for (let index = 0; index < offers.length; index += 1) {
    projected[index] = projectOffer(offers[index]);
  }
  return projected;
}

function projectOrderPage(input) {
  const value = snapshotExactObject(input, ["orders", "nextCursor"]);
  const sourceOrders = snapshotPlainArray(value.orders);
  const orders = new Array(sourceOrders.length);
  for (let index = 0; index < sourceOrders.length; index += 1) {
    orders[index] = projectOrder(sourceOrders[index]);
  }
  if (value.nextCursor === null) {
    return { orders, nextCursor: null };
  }
  const cursor = snapshotExactObject(value.nextCursor, [
    "afterCreatedAt",
    "afterOrderRef"
  ]);
  const afterCreatedAt = requireUtcTimestamp(cursor.afterCreatedAt);
  if (
    typeof cursor.afterOrderRef !== "string"
    || !COMMERCE_REFERENCE.test(cursor.afterOrderRef)
    || orders.length === 0
    || orders.at(-1).createdAt !== afterCreatedAt
    || orders.at(-1).orderRef !== cursor.afterOrderRef
  ) {
    throw projectionInvalid();
  }
  return {
    orders,
    nextCursor: {
      afterCreatedAt,
      afterOrderRef: cursor.afterOrderRef
    }
  };
}

function readRawHeader(req, expectedName) {
  const rawHeaders = req.rawHeaders;
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
    return { state: "invalid", value: null };
  }
  let found = false;
  let value = null;
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const candidate = rawHeaders[index + 1];
    if (
      typeof name !== "string"
      || typeof candidate !== "string"
    ) {
      return { state: "invalid", value: null };
    }
    if (name.toLowerCase() !== expectedName) continue;
    if (found) return { state: "invalid", value: null };
    found = true;
    value = candidate;
  }
  return found
    ? { state: "present", value }
    : { state: "missing", value: null };
}

function requireNoQuery(req, res, next) {
  const target = typeof req.originalUrl === "string"
    ? req.originalUrl
    : req.url;
  if (typeof target !== "string" || target.includes("?")) {
    sendCommerceError(res, 400, "commerce_request_invalid");
    return;
  }
  next();
}

function parseOrderListQuery(req, res, next) {
  const target = typeof req.originalUrl === "string"
    ? req.originalUrl
    : req.url;
  const queryIndex = typeof target === "string" ? target.indexOf("?") : -1;
  if (queryIndex === -1 || queryIndex === target.length - 1) {
    sendCommerceError(res, 400, "commerce_request_invalid");
    return;
  }
  const allowed = new Set(["limit", "afterCreatedAt", "afterOrderRef"]);
  const values = {};
  try {
    const parameters = new URLSearchParams(target.slice(queryIndex + 1));
    for (const [key, value] of parameters) {
      if (!allowed.has(key) || Object.hasOwn(values, key)) {
        throw projectionInvalid();
      }
      values[key] = value;
    }
    if (
      !Object.hasOwn(values, "limit")
      || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(values.limit)
    ) {
      throw projectionInvalid();
    }
    const hasCreatedAt = Object.hasOwn(values, "afterCreatedAt");
    const hasOrderRef = Object.hasOwn(values, "afterOrderRef");
    if (
      hasCreatedAt !== hasOrderRef
      || (
        hasCreatedAt
        && (
          requireUtcTimestamp(values.afterCreatedAt) !== values.afterCreatedAt
          || !COMMERCE_REFERENCE.test(values.afterOrderRef)
        )
      )
    ) {
      throw projectionInvalid();
    }
    res.locals.portalCommerceOrderListQuery = {
      limit: Number(values.limit),
      ...(hasCreatedAt
        ? {
            afterCreatedAt: values.afterCreatedAt,
            afterOrderRef: values.afterOrderRef
          }
        : {})
    };
    next();
  } catch {
    sendCommerceError(res, 400, "commerce_request_invalid");
  }
}

function createSessionMiddleware(state, browserSessions) {
  return function requirePortalSession(req, res, next) {
    let browser;
    try { browser = browserSessions?.session(req); }
    catch { sendCommerceError(res, 401, "commerce_session_invalid"); return; }
    const header = readRawHeader(req, "x-portal-session");
    if (
      !browser && (header.state !== "present"
      || !SESSION_REFERENCE.test(header.value))
    ) {
      sendCommerceError(res, 401, "commerce_session_invalid");
      return;
    }
    const auth = state.platform?.userPortalAuth;
    let projection;
    try {
      if (!auth || typeof auth.requireSession !== "function") {
        sendCommerceError(res, 503, "commerce_unavailable");
        return;
      }
      projection = browser ?? auth.requireSession({ sessionRef: header.value });
    } catch {
      sendCommerceError(res, 401, "commerce_session_invalid");
      return;
    }
    let session;
    try {
      session = snapshotExactObject(projection, [
        "sessionRef",
        "accountId"
      ]);
      if (
        session.sessionRef !== (browser?.sessionRef ?? header.value)
        || typeof session.sessionRef !== "string"
        || !SESSION_REFERENCE.test(session.sessionRef)
        || typeof session.accountId !== "string"
        || !COMMERCE_REFERENCE.test(session.accountId)
      ) {
        throw projectionInvalid();
      }
    } catch {
      sendCommerceError(res, 503, "commerce_unavailable");
      return;
    }
    res.locals.portalCommerceSession = {
      sessionRef: session.sessionRef,
      accountId: session.accountId
    };
    next();
  };
}

function ownDataValue(value, field) {
  try {
    if (
      !value
      || (typeof value !== "object" && typeof value !== "function")
      || utilTypes.isProxy(value)
    ) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor)) return undefined;
    return descriptor.value;
  } catch {
    return undefined;
  }
}

function ownBooleanFeatureFlag(value, field) {
  try {
    if (
      !value
      || (typeof value !== "object" && typeof value !== "function")
      || utilTypes.isProxy(value)
    ) {
      return null;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor) return false;
    if (!("value" in descriptor) || typeof descriptor.value !== "boolean") {
      return null;
    }
    return descriptor.value;
  } catch {
    return null;
  }
}

function createCommerceModelMiddleware(state) {
  const platform = ownDataValue(state, "platform");
  const walletFirstRoutingEnabled = ownBooleanFeatureFlag(
    platform,
    "walletFirstRegistrationEnabled"
  );
  const controlStore = ownDataValue(platform, "controlStore");

  return function resolveCommerceModel(_req, res, next) {
    // A real control store always wins over a mutable registration flag. Once
    // an account carries an explicit future-model marker, disabling new
    // registration must never silently route it back to ordinary Commerce.
    if (controlStore !== undefined) {
      try {
        const mode = resolveWalletFirstCommerceMode({
          controlStore,
          accountId: res.locals.portalCommerceSession.accountId
        });
        res.locals.portalCommerceMode = mode;
        next();
      } catch {
        sendCommerceError(res, 503, "commerce_unavailable");
      }
      return;
    }
    if (walletFirstRoutingEnabled === false) {
      res.locals.portalCommerceMode = PORTAL_COMMERCE_MODE_LEGACY;
      next();
      return;
    }
    if (walletFirstRoutingEnabled !== true) {
      sendCommerceError(res, 503, "commerce_unavailable");
      return;
    }
    // An enabled model without a server-side account source cannot safely
    // fall back to ordinary Commerce.
    sendCommerceError(res, 503, "commerce_unavailable");
  };
}

function requireLegacyCommerceModel(_req, res, next) {
  if (res.locals.portalCommerceMode === PORTAL_COMMERCE_MODE_LEGACY) {
    next();
    return;
  }
  if (res.locals.portalCommerceMode === PORTAL_COMMERCE_MODE_WALLET_FIRST) {
    sendCommerceError(res, 409, "wallet_first_deferred_required");
    return;
  }
  sendCommerceError(res, 503, "commerce_unavailable");
}

function createWalletFirstServiceMiddleware(state) {
  const platform = ownDataValue(state, "platform");
  const configuredService = ownDataValue(platform, "walletFirstCommerceService");

  return function requireWalletFirstService(_req, res, next) {
    if (res.locals.portalCommerceMode !== PORTAL_COMMERCE_MODE_WALLET_FIRST) {
      // The surface is intentionally not a second path for legacy accounts.
      sendCommerceError(res, 404, "commerce_not_found");
      return;
    }
    try {
      res.locals.walletFirstCommerceService =
        snapshotWalletFirstCommerceService(configuredService);
      next();
    } catch {
      // No adapter/coordinator means no reservation, never a legacy fallback.
      sendCommerceError(res, 503, "commerce_unavailable");
    }
  };
}

function requireJsonContentType(req, res, next) {
  const header = readRawHeader(req, "content-type");
  if (
    header.state !== "present"
    || !/^application\/json(?:[ \t]*;[ \t]*charset[ \t]*=[ \t]*utf-8)?$/i
      .test(header.value)
  ) {
    sendCommerceError(res, 400, "commerce_request_invalid");
    return;
  }
  next();
}

const strictJsonParser = express.json({
  limit: JSON_LIMIT_BYTES,
  strict: true,
  type: () => true,
  verify(req, _res, buffer) {
    req[JSON_BODY_BYTES] = buffer.length;
  }
});

function parseStrictJson(req, res, next) {
  delete req[JSON_BODY_BYTES];
  strictJsonParser(req, res, (error) => {
    const bodyBytes = req[JSON_BODY_BYTES];
    delete req[JSON_BODY_BYTES];
    if (error || !Number.isSafeInteger(bodyBytes) || bodyBytes < 1) {
      sendCommerceError(res, 400, "commerce_request_invalid");
      return;
    }
    next();
  });
}

function exactBody(fields) {
  return function validateExactBody(req, res, next) {
    try {
      res.locals.portalCommerceBody = snapshotExactObject(req.body, fields);
      next();
    } catch {
      sendCommerceError(res, 400, "commerce_request_invalid");
    }
  };
}

function requireIdempotencyKey(req, res, next) {
  const header = readRawHeader(req, "idempotency-key");
  if (header.state === "missing") {
    sendCommerceError(res, 400, "idempotency_key_required");
    return;
  }
  if (
    header.state !== "present"
    || !IDEMPOTENCY_KEY.test(header.value)
  ) {
    sendCommerceError(res, 400, "commerce_request_invalid");
    return;
  }
  res.locals.portalCommerceIdempotencyKey = header.value;
  next();
}

function createPreviewRateLimiter(nowFn) {
  const buckets = new Map();
  let nextExpiryAt = null;
  return function previewRateLimit(req, res, next) {
    let now;
    try {
      now = nowFn();
    } catch {
      sendCommerceError(res, 503, "commerce_unavailable");
      return;
    }
    if (
      !Number.isSafeInteger(now)
      || now < 0
      || now > Number.MAX_SAFE_INTEGER - PREVIEW_WINDOW_MS
    ) {
      sendCommerceError(res, 503, "commerce_unavailable");
      return;
    }
    if (nextExpiryAt !== null && nextExpiryAt <= now) {
      let followingExpiry = null;
      for (const [accountId, bucket] of buckets) {
        const expiry = bucket.windowStart + PREVIEW_WINDOW_MS;
        if (expiry <= now) {
          buckets.delete(accountId);
          continue;
        }
        if (followingExpiry === null || expiry < followingExpiry) {
          followingExpiry = expiry;
        }
      }
      nextExpiryAt = followingExpiry;
    }
    const accountId = res.locals.portalCommerceSession.accountId;
    const bucket = buckets.get(accountId);
    if (bucket) {
      if (bucket.count >= PREVIEW_WINDOW_MAX) {
        const retryAfter = Math.max(
          1,
          Math.ceil(
            (bucket.windowStart + PREVIEW_WINDOW_MS - now) / 1_000
          )
        );
        res.set("Retry-After", String(retryAfter));
        sendCommerceError(res, 429, "commerce_rate_limited");
        return;
      }
      bucket.count += 1;
      next();
      return;
    }
    if (buckets.size >= PREVIEW_BUCKET_CAPACITY) {
      const retryAfter = Math.max(
        1,
        Math.ceil(((nextExpiryAt ?? now + PREVIEW_WINDOW_MS) - now) / 1_000)
      );
      res.set("Retry-After", String(retryAfter));
      sendCommerceError(res, 429, "commerce_rate_limited");
      return;
    }
    buckets.set(accountId, { windowStart: now, count: 1 });
    const expiry = now + PREVIEW_WINDOW_MS;
    if (nextExpiryAt === null || expiry < nextExpiryAt) {
      nextExpiryAt = expiry;
    }
    next();
  };
}

function mutationOperation(res) {
  const accountId = res.locals.portalCommerceSession.accountId;
  return {
    actorScope: `portal:${accountId}`,
    idempotencyKey: res.locals.portalCommerceIdempotencyKey,
    actorType: "portal_user",
    actorRef: accountId
  };
}

function rawPathname(req) {
  const target = typeof req.originalUrl === "string"
    ? req.originalUrl
    : req.url;
  if (typeof target !== "string") return "";
  const queryIndex = target.indexOf("?");
  return queryIndex === -1 ? target : target.slice(0, queryIndex);
}

function isSelectedCommerceRoute(method, pathname) {
  if (method === "GET") {
    return (
      pathname === "/api/portal/catalog/offers"
      || /^\/api\/portal\/catalog\/offers\/[a-z][a-z0-9_]{2,95}$/
        .test(pathname)
      || pathname === "/api/portal/commerce/model"
      || pathname === "/api/portal/commerce/orders"
      || /^\/api\/portal\/commerce\/orders\/[a-z][a-z0-9_]{2,95}$/
        .test(pathname)
      || /^\/api\/portal\/commerce\/orders\/[a-z][a-z0-9_]{2,95}\/subscription$/
        .test(pathname)
      || pathname === "/api/portal/commerce/deferred/offers"
      || /^\/api\/portal\/commerce\/deferred\/offers\/[a-z][a-z0-9_]{2,95}$/
        .test(pathname)
      || pathname === "/api/portal/commerce/deferred/transitions"
      || /^\/api\/portal\/commerce\/deferred\/transitions\/[a-z][a-z0-9_]{2,95}$/
        .test(pathname)
    );
  }
  if (method === "POST") {
    return (
      pathname === "/api/portal/commerce/checkout-preview"
      || pathname === "/api/portal/commerce/orders"
      || /^\/api\/portal\/commerce\/orders\/[a-z][a-z0-9_]{2,95}\/cancel$/
        .test(pathname)
      || pathname === "/api/portal/commerce/deferred/checkout-preview"
      || pathname === "/api/portal/commerce/deferred/transitions"
      || /^\/api\/portal\/commerce\/deferred\/transitions\/[a-z][a-z0-9_]{2,95}\/cancel$/
        .test(pathname)
    );
  }
  return false;
}

export function portalCoinCommerceRoutes(state, options = {}) {
  const router = Router({ caseSensitive: true, strict: true });
  const store = state.platform?.coinCommerceStore;
  const dataPackDelivery = ownDataValue(state.platform, "coinCommerceDataPackOrderDelivery");
  const requireSession = createSessionMiddleware(state, options.browserSessions);
  const resolveCommerceModel = createCommerceModelMiddleware(state);
  const requireWalletFirstService = createWalletFirstServiceMiddleware(state);
  const previewRateLimit = createPreviewRateLimiter(
    options.nowFn || Date.now
  );

  router.get(
    "/api/portal/catalog/offers",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    (_req, res) => {
      try {
        const offers = projectOfferList(
          store.listPublishedOffers({
            accountId: res.locals.portalCommerceSession.accountId
          })
        );
        res.json({ offers });
      } catch (error) {
        sendStoreError(res, error);
      }
    }
  );

  router.get(
    "/api/portal/catalog/offers/:offerRef",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    (req, res) => {
      try {
        const offer = projectOffer(
          store.getPublishedOffer({
            accountId: res.locals.portalCommerceSession.accountId,
            offerRef: req.params.offerRef
          })
        );
        res.json({ offer });
      } catch (error) {
        sendStoreError(res, error, { offerLookup: true });
      }
    }
  );

  router.post(
    "/api/portal/commerce/checkout-preview",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    requireJsonContentType,
    parseStrictJson,
    exactBody(["offerRef"]),
    previewRateLimit,
    (_req, res) => {
      const { offerRef } = res.locals.portalCommerceBody;
      if (
        typeof offerRef !== "string"
        || !COMMERCE_REFERENCE.test(offerRef)
      ) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const quote = projectQuote(
          store.createCheckoutQuote({
            accountId: res.locals.portalCommerceSession.accountId,
            offerRef
          })
        );
        res.json({ quote });
      } catch (error) {
        sendStoreError(res, error);
      }
    }
  );

  router.get(
    "/api/portal/commerce/orders",
    parseOrderListQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    (_req, res) => {
      try {
        const page = projectOrderPage(
          store.listOrders({
            accountId: res.locals.portalCommerceSession.accountId,
            ...res.locals.portalCommerceOrderListQuery
          })
        );
        res.json(page);
      } catch (error) {
        sendStoreError(res, error);
      }
    }
  );

  router.post(
    "/api/portal/commerce/orders",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    requireJsonContentType,
    requireIdempotencyKey,
    parseStrictJson,
    exactBody(["quoteRef"]),
    (_req, res) => {
      const { quoteRef } = res.locals.portalCommerceBody;
      if (
        typeof quoteRef !== "string"
        || !COMMERCE_REFERENCE.test(quoteRef)
      ) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const order = projectOrder(
          store.confirmOrder({
            accountId: res.locals.portalCommerceSession.accountId,
            quoteRef,
            operation: mutationOperation(res)
          })
        );
        res.status(201).json({ order });
      } catch (error) {
        sendStoreError(res, error);
      }
    }
  );

  router.post(
    "/api/portal/commerce/orders/:orderRef/cancel",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    requireJsonContentType,
    requireIdempotencyKey,
    parseStrictJson,
    exactBody([]),
    (req, res) => {
      try {
        const order = projectOrder(
          store.cancelOrder({
            accountId: res.locals.portalCommerceSession.accountId,
            orderRef: req.params.orderRef,
            operation: mutationOperation(res)
          })
        );
        res.json({ order });
      } catch (error) {
        sendStoreError(res, error);
      }
    }
  );

  router.get(
    "/api/portal/commerce/orders/:orderRef",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireLegacyCommerceModel,
    (req, res) => {
      try {
        const order = projectOrder(
          store.getOrder({
            accountId: res.locals.portalCommerceSession.accountId,
            orderRef: req.params.orderRef
          })
        );
        res.json({ order });
      } catch (error) {
        sendStoreError(res, error);
      }
    }
  );

  if (typeof ownDataValue(dataPackDelivery, "get") === "function") {
    router.get(
      "/api/portal/commerce/orders/:orderRef/subscription",
      preventSubscriptionCaching,
      requireNoQuery,
      requireSession,
      (req, res) => {
        try {
          const delivery = projectDataPackDelivery(dataPackDelivery.get({
            accountId: res.locals.portalCommerceSession.accountId,
            orderRef: req.params.orderRef
          }), req.params.orderRef);
          res.json(delivery);
        } catch {
          // Other accounts and missing/incomplete delivery are indistinguishable.
          sendCommerceError(res, 404, "commerce_not_found");
        }
      }
    );
  }

  router.get(
    "/api/portal/commerce/model",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    (_req, res) => {
      res.json({ commerceModel: res.locals.portalCommerceMode });
    }
  );

  router.get(
    "/api/portal/commerce/deferred/offers",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    (_req, res) => {
      try {
        const offers = projectOfferList(
          res.locals.walletFirstCommerceService.listOffers({
            accountId: res.locals.portalCommerceSession.accountId
          })
        );
        res.json({ offers });
      } catch (error) {
        sendDeferredStoreError(res, error);
      }
    }
  );

  router.get(
    "/api/portal/commerce/deferred/offers/:offerRef",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    (req, res) => {
      if (!COMMERCE_REFERENCE.test(req.params.offerRef)) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const offer = projectOffer(
          res.locals.walletFirstCommerceService.getOffer({
            accountId: res.locals.portalCommerceSession.accountId,
            offerRef: req.params.offerRef
          })
        );
        res.json({ offer });
      } catch (error) {
        sendDeferredStoreError(res, error, { offerLookup: true });
      }
    }
  );

  router.post(
    "/api/portal/commerce/deferred/checkout-preview",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    requireJsonContentType,
    parseStrictJson,
    exactBody(["offerRef"]),
    previewRateLimit,
    (_req, res) => {
      const { offerRef } = res.locals.portalCommerceBody;
      if (typeof offerRef !== "string" || !COMMERCE_REFERENCE.test(offerRef)) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const quote = projectDeferredCheckout(
          res.locals.walletFirstCommerceService.previewDeferredCheckout({
            accountId: res.locals.portalCommerceSession.accountId,
            offerRef
          })
        );
        res.json({ quote });
      } catch (error) {
        sendDeferredStoreError(res, error);
      }
    }
  );

  router.get(
    "/api/portal/commerce/deferred/transitions",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    (_req, res) => {
      try {
        const transitions = projectDeferredTransitionList(
          res.locals.walletFirstCommerceService.listDeferredTransitions({
            accountId: res.locals.portalCommerceSession.accountId
          })
        );
        res.json({ transitions });
      } catch (error) {
        sendDeferredStoreError(res, error);
      }
    }
  );

  router.post(
    "/api/portal/commerce/deferred/transitions",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    requireJsonContentType,
    requireIdempotencyKey,
    parseStrictJson,
    exactBody(["quoteRef"]),
    (_req, res) => {
      const { quoteRef } = res.locals.portalCommerceBody;
      if (typeof quoteRef !== "string" || !COMMERCE_REFERENCE.test(quoteRef)) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const transition = projectDeferredTransition(
          res.locals.walletFirstCommerceService.reserveDeferredTransition({
            accountId: res.locals.portalCommerceSession.accountId,
            quoteRef,
            operation: mutationOperation(res)
          })
        );
        res.status(201).json({ transition });
      } catch (error) {
        sendDeferredStoreError(res, error);
      }
    }
  );

  router.get(
    "/api/portal/commerce/deferred/transitions/:transitionRef",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    (req, res) => {
      if (!COMMERCE_REFERENCE.test(req.params.transitionRef)) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const transition = projectDeferredTransition(
          res.locals.walletFirstCommerceService.getDeferredTransition({
            accountId: res.locals.portalCommerceSession.accountId,
            transitionRef: req.params.transitionRef
          })
        );
        res.json({ transition });
      } catch (error) {
        sendDeferredStoreError(res, error);
      }
    }
  );

  router.post(
    "/api/portal/commerce/deferred/transitions/:transitionRef/cancel",
    requireNoQuery,
    requireSession,
    resolveCommerceModel,
    requireWalletFirstService,
    requireJsonContentType,
    requireIdempotencyKey,
    parseStrictJson,
    exactBody([]),
    (req, res) => {
      if (!COMMERCE_REFERENCE.test(req.params.transitionRef)) {
        sendCommerceError(res, 400, "commerce_request_invalid");
        return;
      }
      try {
        const transition = projectDeferredTransition(
          res.locals.walletFirstCommerceService.cancelDeferredTransition({
            accountId: res.locals.portalCommerceSession.accountId,
            transitionRef: req.params.transitionRef,
            operation: mutationOperation(res)
          })
        );
        res.json({ transition });
      } catch (error) {
        sendDeferredStoreError(res, error);
      }
    }
  );

  return function portalCoinCommerceDispatcher(req, res, next) {
    if (!isSelectedCommerceRoute(req.method, rawPathname(req))) {
      next();
      return;
    }
    router(req, res, next);
  };
}
