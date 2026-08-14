import { types as utilTypes } from "node:util";

import {
  applyCoinDiscount,
  normalizeCoinCommerceOffer
} from "./coin-commerce-domain.mjs";
import {
  planRank,
  WALLET_FIRST_COMMERCIAL_MODEL
} from "./coin-commerce-deferred-transition-policy.mjs";
import {
  WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE
} from "./wallet-first-deferred-checkout-migrations.mjs";

export const WALLET_FIRST_DEFERRED_CHECKOUT_QUOTE_TTL_MS = 300_000;
export const WALLET_FIRST_DEFERRED_CHECKOUT_RESERVATION_GRACE_MS = 86_400_000;

const REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_UNITS = 9_007_199_254_740_991;
const COIN_TYPES = Object.freeze(["bonus_coins", "paid_coins", "reward_coins"]);
const OPERATION_FIELDS = Object.freeze([
  "actorScope", "idempotencyKey", "actorType", "actorRef"
]);
const CONTEXT_FIELDS = Object.freeze([
  "flowKind",
  "scheduledFor",
  "expectedEntitlementId",
  "expectedRequestId",
  "expectedIssuedLinkId",
  "expectedValidUntil"
]);

function quoteError(code) {
  const error = new Error("Wallet-first deferred checkout quote rejected");
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && !utilTypes.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function exactObject(value, fields, code = "deferred_checkout_invalid") {
  if (!isPlainObject(value)) throw quoteError(code);
  const expected = new Set(fields);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !expected.has(key))) {
    throw quoteError(code);
  }
  const output = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw quoteError(code);
    }
    output[field] = descriptor.value;
  }
  return output;
}

function reference(value, code = "deferred_checkout_invalid") {
  if (typeof value !== "string" || !REFERENCE.test(value)) throw quoteError(code);
  return value;
}

function timestamp(value, code = "deferred_checkout_invalid") {
  if (
    typeof value !== "string"
    || !ISO_UTC_MILLIS.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw quoteError(code);
  }
  return value;
}

function nullableReference(value, code) {
  return value === null ? null : reference(value, code);
}

function nullableTimestamp(value, code) {
  return value === null ? null : timestamp(value, code);
}

function positiveUnits(value, code = "deferred_checkout_invalid") {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_UNITS) {
    throw quoteError(code);
  }
  return value;
}

function nonNegativeUnits(value, code = "deferred_checkout_invalid") {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UNITS) {
    throw quoteError(code);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function parseJson(value, code = "deferred_checkout_infrastructure_error") {
  try {
    return JSON.parse(value);
  } catch {
    throw quoteError(code);
  }
}

function addMilliseconds(value, milliseconds, code = "deferred_checkout_infrastructure_error") {
  const total = Date.parse(value) + milliseconds;
  if (!Number.isSafeInteger(total)) throw quoteError(code);
  return new Date(total).toISOString();
}

export function normalizeWalletFirstDeferredTransitionContext(value) {
  const context = exactObject(value, CONTEXT_FIELDS);
  if (!["initial_activation", "scheduled_switch"].includes(context.flowKind)) {
    throw quoteError("deferred_checkout_invalid");
  }
  const normalized = Object.freeze({
    flowKind: context.flowKind,
    scheduledFor: timestamp(context.scheduledFor),
    expectedEntitlementId: nullableReference(context.expectedEntitlementId),
    expectedRequestId: nullableReference(context.expectedRequestId),
    expectedIssuedLinkId: nullableReference(context.expectedIssuedLinkId),
    expectedValidUntil: nullableTimestamp(context.expectedValidUntil)
  });
  const expected = [
    normalized.expectedEntitlementId,
    normalized.expectedRequestId,
    normalized.expectedIssuedLinkId,
    normalized.expectedValidUntil
  ];
  if (
    (normalized.flowKind === "initial_activation" && expected.some((item) => item !== null))
    || (normalized.flowKind === "scheduled_switch" && expected.some((item) => item === null))
    || (
      normalized.flowKind === "scheduled_switch"
      && normalized.scheduledFor !== normalized.expectedValidUntil
    )
  ) {
    throw quoteError("deferred_checkout_invalid");
  }
  return normalized;
}

export function normalizeWalletFirstDeferredCheckoutOperation(value, accountId) {
  const operation = exactObject(value, OPERATION_FIELDS);
  if (
    operation.actorScope !== `portal:${accountId}`
    || operation.actorType !== "portal_user"
    || operation.actorRef !== accountId
    || typeof operation.idempotencyKey !== "string"
    || !IDEMPOTENCY_KEY.test(operation.idempotencyKey)
  ) {
    throw quoteError("deferred_checkout_invalid");
  }
  return Object.freeze(operation);
}

function offerFromRow(row) {
  try {
    return normalizeCoinCommerceOffer({
      offerRef: row.offer_ref,
      offerVersionRef: row.offer_version_ref,
      version: row.version,
      category: row.category,
      title: { zh: row.title_zh, en: row.title_en },
      summary: { zh: row.summary_zh, en: row.summary_en },
      importantNotices: {
        zh: parseJson(row.important_notices_zh_json),
        en: parseJson(row.important_notices_en_json)
      },
      baseCoinUnits: row.base_coin_units,
      referencePrice: {
        currency: row.reference_currency,
        amountMinor: row.reference_amount_minor
      },
      acceptedCoinTypes: parseJson(row.accepted_coin_types_json),
      delivery: {
        kind: row.delivery_kind,
        durationDays: row.duration_days,
        monthlyTrafficGb: row.monthly_traffic_gb,
        trafficGb: row.traffic_gb,
        neverExpires: row.never_expires === 1,
        discountBasisPoints: row.discount_basis_points
      }
    });
  } catch (error) {
    if (error?.code === "deferred_checkout_infrastructure_error") throw error;
    throw quoteError("deferred_checkout_infrastructure_error");
  }
}

function liveOfferByRef(database, offerRef) {
  const row = database.prepare(`
    select * from platform_coin_commerce_offer_versions
     where offer_ref = ? and status = 'published'
     limit 1
  `).get(offerRef);
  if (!row) throw quoteError("offer_unavailable");
  const offer = offerFromRow(row);
  try {
    planRank({
      offerVersionRef: offer.offerVersionRef,
      durationDays: offer.delivery.durationDays,
      monthlyTrafficGb: offer.delivery.monthlyTrafficGb
    });
  } catch {
    throw quoteError("offer_unavailable");
  }
  return offer;
}

function liveOfferByVersion(database, offerVersionRef) {
  const row = database.prepare(`
    select * from platform_coin_commerce_offer_versions
     where offer_version_ref = ? and status = 'published'
     limit 1
  `).get(offerVersionRef);
  if (!row) throw quoteError("quote_stale");
  const offer = offerFromRow(row);
  try {
    planRank({
      offerVersionRef: offer.offerVersionRef,
      durationDays: offer.delivery.durationDays,
      monthlyTrafficGb: offer.delivery.monthlyTrafficGb
    });
  } catch {
    throw quoteError("quote_stale");
  }
  return offer;
}

export function listWalletFirstDeferredCheckoutOffersInTransaction({ database, accountId }) {
  const normalizedAccountId = reference(accountId);
  assertWalletFirstAccount(database, normalizedAccountId);
  const rows = database.prepare(`
    select * from platform_coin_commerce_offer_versions
     where status = 'published' and category = 'plan'
     order by base_coin_units asc, offer_ref asc
  `).all();
  const offers = [];
  for (const row of rows) {
    try {
      const offer = offerFromRow(row);
      planRank({
        offerVersionRef: offer.offerVersionRef,
        durationDays: offer.delivery.durationDays,
        monthlyTrafficGb: offer.delivery.monthlyTrafficGb
      });
      offers.push(offer);
    } catch {
      // Published but unsupported products are not a deferred offer.
    }
  }
  if (offers.length === 0) throw quoteError("offer_unavailable");
  return Object.freeze(offers);
}

export function getWalletFirstDeferredCheckoutOfferInTransaction({ database, accountId, offerRef }) {
  const normalizedAccountId = reference(accountId);
  assertWalletFirstAccount(database, normalizedAccountId);
  return liveOfferByRef(database, reference(offerRef));
}

function assertWalletFirstAccount(database, accountId) {
  const row = database.prepare(`
    select status, metadata_json from platform_accounts where id = ?
  `).get(accountId);
  if (!row || row.status !== "active") throw quoteError("deferred_checkout_account_unavailable");
  try {
    const metadata = parseJson(row.metadata_json, "deferred_checkout_account_unavailable");
    if (
      !isPlainObject(metadata)
      || metadata.commercialModel !== WALLET_FIRST_COMMERCIAL_MODEL
    ) {
      throw quoteError("deferred_checkout_account_unavailable");
    }
  } catch (error) {
    if (error?.code === "deferred_checkout_account_unavailable") throw error;
    throw quoteError("deferred_checkout_account_unavailable");
  }
}

function quoteWalletProjection(database, { accountId, acceptedCoinTypes, reservationExpiresAt }) {
  const wallet = database.prepare(`
    select wallet_ref, status, version
      from platform_coin_wallets
     where account_id = ?
  `).get(accountId) ?? null;
  const empty = {
    bonusCoins: 0,
    paidCoins: 0,
    rewardCoins: 0,
    heldCoins: 0
  };
  if (!wallet || wallet.status !== "active") {
    return { walletVersion: 0, before: empty };
  }
  if (!Number.isSafeInteger(wallet.version) || wallet.version < 0) {
    throw quoteError("deferred_checkout_infrastructure_error");
  }
  const rows = database.prepare(`
    select coin_type,
           coalesce(sum(available_units), 0) as available_units,
           coalesce(sum(held_units), 0) as held_units
      from platform_coin_lots
     where wallet_ref = ?
       and (
         coin_type <> 'bonus_coins'
         or expires_at is null
         or expires_at > ?
       )
     group by coin_type
  `).all(wallet.wallet_ref, reservationExpiresAt);
  const before = { ...empty };
  for (const row of rows) {
    if (
      !COIN_TYPES.includes(row.coin_type)
      || !Number.isSafeInteger(row.available_units)
      || row.available_units < 0
      || !Number.isSafeInteger(row.held_units)
      || row.held_units < 0
    ) {
      throw quoteError("deferred_checkout_infrastructure_error");
    }
    const key = row.coin_type === "bonus_coins"
      ? "bonusCoins"
      : row.coin_type === "paid_coins"
        ? "paidCoins"
        : "rewardCoins";
    before[key] = row.available_units;
    before.heldCoins += row.held_units;
    if (!Number.isSafeInteger(before.heldCoins)) {
      throw quoteError("deferred_checkout_infrastructure_error");
    }
  }
  return { walletVersion: wallet.version, before };
}

function allocationFor({ before, acceptedCoinTypes, amountUnits }) {
  const keyByType = {
    bonus_coins: "bonusCoins",
    paid_coins: "paidCoins",
    reward_coins: "rewardCoins"
  };
  let total = 0;
  for (const type of acceptedCoinTypes) {
    total += before[keyByType[type]];
    if (!Number.isSafeInteger(total)) throw quoteError("deferred_checkout_infrastructure_error");
  }
  if (total < amountUnits) return Object.freeze([]);
  let remaining = amountUnits;
  const allocation = [];
  for (const type of COIN_TYPES) {
    if (!acceptedCoinTypes.includes(type) || remaining === 0) continue;
    const units = Math.min(before[keyByType[type]], remaining);
    if (units > 0) allocation.push(Object.freeze({ coinType: type, amountUnits: units }));
    remaining -= units;
  }
  if (remaining !== 0) throw quoteError("deferred_checkout_infrastructure_error");
  return Object.freeze(allocation);
}

function projectedAfter(before, allocation, amountUnits) {
  const after = { ...before };
  const keyByType = {
    bonus_coins: "bonusCoins",
    paid_coins: "paidCoins",
    reward_coins: "rewardCoins"
  };
  for (const item of allocation) after[keyByType[item.coinType]] -= item.amountUnits;
  after.heldCoins += amountUnits;
  if (Object.values(after).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw quoteError("deferred_checkout_infrastructure_error");
  }
  return after;
}

function quotePrice(offer) {
  try {
    const appliedDiscountBasisPoints = offer.delivery.discountBasisPoints;
    return Object.freeze({
      appliedDiscountBasisPoints,
      amountUnits: applyCoinDiscount({
        baseCoinUnits: offer.baseCoinUnits,
        discountBasisPoints: appliedDiscountBasisPoints
      })
    });
  } catch {
    throw quoteError("deferred_checkout_infrastructure_error");
  }
}

function assertStoredQuoteRow(row) {
  if (!row || !REFERENCE.test(row.quote_ref) || !REFERENCE.test(row.account_id)) {
    throw quoteError("deferred_checkout_infrastructure_error");
  }
  return row;
}

function terminalQuote(database, quoteRef, status) {
  const updated = database.prepare(`
    update ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}
       set status = ?
     where quote_ref = ? and status = 'active'
  `).run(status, quoteRef);
  if (updated.changes !== 1) throw quoteError("deferred_checkout_infrastructure_error");
}

function sameOperation(row, operation) {
  return row.reserve_actor_scope === operation.actorScope
    && row.reserve_idempotency_key === operation.idempotencyKey
    && row.reserve_actor_type === operation.actorType
    && row.reserve_actor_ref === operation.actorRef;
}

function storedTransitionContext(row) {
  try {
    return normalizeWalletFirstDeferredTransitionContext({
      flowKind: row.flow_kind,
      scheduledFor: row.scheduled_for,
      expectedEntitlementId: row.expected_entitlement_id,
      expectedRequestId: row.expected_request_id,
      expectedIssuedLinkId: row.expected_issued_link_id,
      expectedValidUntil: row.expected_valid_until
    });
  } catch {
    throw quoteError("deferred_checkout_infrastructure_error");
  }
}

/**
 * Creates the immutable server-side quote record. This is deliberately not a
 * Coin hold: allocation is a preview only, while the deferred reservation
 * participant performs the actual ledger reservation during atomic confirm.
 */
export function createWalletFirstDeferredCheckoutQuoteInTransaction({
  database,
  accountId,
  offerRef,
  transitionContext,
  quoteRef,
  deferredOrderRef,
  occurredAt,
  quoteTtlMs = WALLET_FIRST_DEFERRED_CHECKOUT_QUOTE_TTL_MS
}) {
  const normalizedAccountId = reference(accountId);
  const normalizedOfferRef = reference(offerRef);
  const context = normalizeWalletFirstDeferredTransitionContext(transitionContext);
  const normalizedQuoteRef = reference(quoteRef);
  const normalizedOrderRef = reference(deferredOrderRef);
  const now = timestamp(occurredAt);
  if (!Number.isSafeInteger(quoteTtlMs) || quoteTtlMs < 1 || quoteTtlMs > 3_600_000) {
    throw quoteError("deferred_checkout_invalid");
  }
  assertWalletFirstAccount(database, normalizedAccountId);
  const offer = liveOfferByRef(database, normalizedOfferRef);
  const price = quotePrice(offer);
  const reservationExpiresAt = addMilliseconds(
    context.scheduledFor,
    WALLET_FIRST_DEFERRED_CHECKOUT_RESERVATION_GRACE_MS
  );
  const projection = quoteWalletProjection(database, {
    accountId: normalizedAccountId,
    acceptedCoinTypes: offer.acceptedCoinTypes,
    reservationExpiresAt
  });
  const allocation = allocationFor({
    before: projection.before,
    acceptedCoinTypes: offer.acceptedCoinTypes,
    amountUnits: price.amountUnits
  });
  const purchaseAvailability = allocation.length > 0 ? "available" : "insufficient_balance";
  const shortfallUnits = purchaseAvailability === "available"
    ? 0
    : price.amountUnits - offer.acceptedCoinTypes.reduce((total, type) => {
      const field = type === "bonus_coins"
        ? "bonusCoins"
        : type === "paid_coins" ? "paidCoins" : "rewardCoins";
      return total + projection.before[field];
    }, 0);
  if (!Number.isSafeInteger(shortfallUnits) || shortfallUnits < 0) {
    throw quoteError("deferred_checkout_infrastructure_error");
  }
  const after = purchaseAvailability === "available"
    ? projectedAfter(projection.before, allocation, price.amountUnits)
    : { ...projection.before };
  const expiresAt = addMilliseconds(now, quoteTtlMs);
  const inserted = database.prepare(`
    insert into ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE} (
      quote_ref, account_id, deferred_order_ref, offer_version_ref,
      offer_snapshot_json, wallet_version, amount_units,
      applied_discount_basis_points, purchase_availability, shortfall_units,
      allocation_json, before_balance_json, after_balance_json,
      flow_kind, scheduled_for, expected_entitlement_id, expected_request_id,
      expected_issued_link_id, expected_valid_until, status, transition_ref,
      reserve_actor_scope, reserve_idempotency_key, reserve_actor_type,
      reserve_actor_ref, created_at, expires_at, reserved_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'active', null, null, null, null, null, ?, ?, null)
  `).run(
    normalizedQuoteRef,
    normalizedAccountId,
    normalizedOrderRef,
    offer.offerVersionRef,
    canonicalJson(offer),
    projection.walletVersion,
    price.amountUnits,
    price.appliedDiscountBasisPoints,
    purchaseAvailability,
    shortfallUnits,
    canonicalJson(allocation),
    canonicalJson(projection.before),
    canonicalJson(after),
    context.flowKind,
    context.scheduledFor,
    context.expectedEntitlementId,
    context.expectedRequestId,
    context.expectedIssuedLinkId,
    context.expectedValidUntil,
    now,
    expiresAt
  );
  if (inserted.changes !== 1) throw quoteError("deferred_checkout_infrastructure_error");
  return Object.freeze({
    quoteRef: normalizedQuoteRef,
    offer,
    amountUnits: price.amountUnits,
    appliedDiscountBasisPoints: price.appliedDiscountBasisPoints,
    purchaseAvailability,
    shortfallUnits,
    allocation,
    balances: Object.freeze({ before: projection.before, after }),
    expiresAt,
    transition: Object.freeze({
      flowKind: context.flowKind,
      scheduledFor: context.scheduledFor
    })
  });
}

/**
 * Used only by the deferred-transition store while it owns a BEGIN IMMEDIATE
 * transaction. It returns a sealed reserve input or a committed terminal quote
 * result. No caller can inject an offer, price, wallet snapshot or chain.
 */
export function prepareWalletFirstDeferredCheckoutQuoteReservationInTransaction({
  database,
  accountId,
  quoteRef,
  operation,
  occurredAt
}) {
  const normalizedAccountId = reference(accountId);
  const normalizedQuoteRef = reference(quoteRef);
  const normalizedOperation = normalizeWalletFirstDeferredCheckoutOperation(operation, normalizedAccountId);
  const now = timestamp(occurredAt);
  const stored = database.prepare(`
    select * from ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}
     where quote_ref = ? and account_id = ?
  `).get(normalizedQuoteRef, normalizedAccountId);
  if (!stored) return Object.freeze({ kind: "error", code: "quote_stale" });
  const row = assertStoredQuoteRow(stored);

  if (row.status === "reserved") {
    if (!sameOperation(row, normalizedOperation) || !REFERENCE.test(row.transition_ref ?? "")) {
      return Object.freeze({ kind: "error", code: "quote_stale" });
    }
    return Object.freeze({ kind: "replay", transitionRef: row.transition_ref });
  }
  if (row.status === "expired") return Object.freeze({ kind: "error", code: "quote_expired" });
  if (row.status !== "active") return Object.freeze({ kind: "error", code: "quote_stale" });
  if (row.expires_at <= now) {
    terminalQuote(database, normalizedQuoteRef, "expired");
    return Object.freeze({ kind: "error", code: "quote_expired" });
  }
  const context = storedTransitionContext(row);
  if (row.purchase_availability !== "available" || row.shortfall_units !== 0) {
    terminalQuote(database, normalizedQuoteRef, "stale");
    return Object.freeze({ kind: "error", code: "quote_stale" });
  }
  try {
    assertWalletFirstAccount(database, normalizedAccountId);
    const wallet = database.prepare(`
      select status, version from platform_coin_wallets where account_id = ?
    `).get(normalizedAccountId);
    if (!wallet || wallet.status !== "active" || wallet.version !== row.wallet_version) {
      terminalQuote(database, normalizedQuoteRef, "stale");
      return Object.freeze({ kind: "error", code: "quote_stale" });
    }
    const liveOffer = liveOfferByVersion(database, row.offer_version_ref);
    const quoteOffer = normalizeCoinCommerceOffer(parseJson(row.offer_snapshot_json));
    const price = quotePrice(quoteOffer);
    if (
      canonicalJson(liveOffer) !== canonicalJson(quoteOffer)
      || price.amountUnits !== row.amount_units
      || price.appliedDiscountBasisPoints !== row.applied_discount_basis_points
    ) {
      terminalQuote(database, normalizedQuoteRef, "stale");
      return Object.freeze({ kind: "error", code: "quote_stale" });
    }
    return Object.freeze({
      kind: "reserve",
      quoteRef: normalizedQuoteRef,
      operation: normalizedOperation,
      reserveRequest: Object.freeze({
        accountId: normalizedAccountId,
        orderRef: reference(row.deferred_order_ref),
        offerVersionRef: quoteOffer.offerVersionRef,
        flowKind: context.flowKind,
        amountUnits: positiveUnits(row.amount_units),
        offerSnapshot: quoteOffer,
        scheduledFor: context.scheduledFor,
        expectedEntitlementId: context.expectedEntitlementId,
        expectedRequestId: context.expectedRequestId,
        expectedIssuedLinkId: context.expectedIssuedLinkId,
        expectedValidUntil: context.expectedValidUntil,
        operation: normalizedOperation
      })
    });
  } catch (error) {
    if (error?.code === "quote_stale" || error?.code === "deferred_checkout_account_unavailable") {
      terminalQuote(database, normalizedQuoteRef, "stale");
      return Object.freeze({ kind: "error", code: "quote_stale" });
    }
    throw error;
  }
}

export function markWalletFirstDeferredCheckoutQuoteReservedInTransaction({
  database,
  quoteRef,
  transitionRef,
  operation,
  occurredAt
}) {
  const normalizedQuoteRef = reference(quoteRef);
  const normalizedTransitionRef = reference(transitionRef);
  const normalizedOperation = exactObject(operation, OPERATION_FIELDS);
  const now = timestamp(occurredAt);
  const updated = database.prepare(`
    update ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}
       set status = 'reserved', transition_ref = ?, reserve_actor_scope = ?,
           reserve_idempotency_key = ?, reserve_actor_type = ?, reserve_actor_ref = ?,
           reserved_at = ?
     where quote_ref = ? and status = 'active'
  `).run(
    normalizedTransitionRef,
    normalizedOperation.actorScope,
    normalizedOperation.idempotencyKey,
    normalizedOperation.actorType,
    normalizedOperation.actorRef,
    now,
    normalizedQuoteRef
  );
  if (updated.changes !== 1) throw quoteError("quote_stale");
}

export function quoteContractErrorCode(error) {
  return typeof error?.code === "string" ? error.code : null;
}
