import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

import {
  DEFAULT_COIN_COMMERCE_HOLD_RECOVERY_GRACE_MS,
  applyCoinDiscount,
  canonicalCommerceRequestDigest,
  deriveCommerceOperationRefs,
  normalizeCancelOrderRequest,
  normalizeCheckoutQuoteRequest,
  normalizeCoinCommerceOffer,
  normalizeConfirmOrderRequest
} from "./coin-commerce-domain.mjs";
import {
  validateCoinCommerceSchema
} from "./coin-commerce-migrations.mjs";
import {
  validateCoinWalletSchema
} from "./coin-wallet-migrations.mjs";
import {
  createCoinWalletTransactionParticipant,
  createSqliteCoinWalletStore
} from "./coin-wallet-store.mjs";

const BUSY_TIMEOUT_MS = 2_000;
const DEFAULT_CANCEL_WINDOW_MS = 3_000;
const DEFAULT_QUOTE_TTL_MS = 300_000;
const MAX_SERVER_INTERVAL_MS = 86_400_000;
const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const FACTORY_FIELDS = new Set([
  "dbPath",
  "database",
  "commerceRefFactory",
  "walletRefFactory",
  "discountReader",
  "cancelWindowMs",
  "quoteTtlMs"
]);
const STORE_METHODS = [
  "walletStore",
  "publishOfferVersion",
  "retireOfferVersion",
  "listPublishedOffers",
  "getPublishedOffer",
  "createCheckoutQuote",
  "confirmOrder",
  "cancelOrder",
  "getOrder",
  "claimDueCaptures",
  "captureClaimedOrder",
  "recoverNonTerminalOrders",
  "claimNextFulfillmentCommand",
  "completeFulfillmentCommand",
  "failFulfillmentCommand",
  "nextWakeAt",
  "close"
];
const KNOWN_CODES = new Set([
  "invalid_store_contract",
  "commerce_store_closed",
  "coin_wallet_schema_not_ready",
  "coin_commerce_schema_not_ready",
  "commerce_not_found",
  "offer_unavailable",
  "quote_expired",
  "quote_stale",
  "insufficient_coins",
  "wallet_not_active",
  "cancel_window_closed",
  "capture_in_progress",
  "reconciliation_required",
  "idempotency_key_required",
  "idempotency_key_reused",
  "commerce_fulfillment_lease_lost",
  "commerce_fulfillment_attempt_limit",
  "commerce_invalid_fulfillment_result",
  "commerce_busy",
  "commerce_infrastructure_error",
  "invalid_pagination"
]);

function commerceError(code) {
  const error = new Error("Coin commerce store operation rejected");
  error.code = code;
  return error;
}

function isCommerceError(error) {
  return (
    KNOWN_CODES.has(error?.code)
    && error?.message === "Coin commerce store operation rejected"
  );
}

function normalizeError(error) {
  if (isCommerceError(error)) return error;
  if (error?.code === "wallet_not_active") {
    return commerceError("wallet_not_active");
  }
  if (
    typeof error?.code === "string"
    && (
      error.code.startsWith("SQLITE_BUSY")
      || error.code.startsWith("SQLITE_LOCKED")
      || error.code === "wallet_busy"
    )
  ) {
    return commerceError("commerce_busy");
  }
  if (error?.code === "wallet_not_active") {
    return commerceError("wallet_not_active");
  }
  return commerceError("commerce_infrastructure_error");
}

function assertPlainObject(value, code = "invalid_store_contract") {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw commerceError(code);
  }
  return value;
}

function assertExactDataFields(value, fields, required = fields) {
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== "string"
      || !fields.has(key)
      || !descriptor
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw commerceError("invalid_store_contract");
    }
  }
  for (const field of required) {
    if (!Object.hasOwn(value, field)) {
      throw commerceError("invalid_store_contract");
    }
  }
}

function normalizeReference(value) {
  if (typeof value !== "string" || !COMMERCE_REFERENCE.test(value)) {
    throw commerceError("invalid_store_contract");
  }
  return value;
}

function normalizeInterval(value, { allowZero = false } = {}) {
  if (
    !Number.isSafeInteger(value)
    || value < (allowZero ? 0 : 1)
    || value > MAX_SERVER_INTERVAL_MS
  ) {
    throw commerceError("invalid_store_contract");
  }
  return value;
}

function readDatabaseUtc(database) {
  const value = database.prepare(`
    select strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).pluck().get();
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw commerceError("commerce_infrastructure_error");
  }
  return value;
}

function addMilliseconds(timestamp, milliseconds) {
  const value = Date.parse(timestamp) + milliseconds;
  if (!Number.isSafeInteger(value)) {
    throw commerceError("commerce_infrastructure_error");
  }
  return new Date(value).toISOString();
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw commerceError("commerce_infrastructure_error");
  }
}

function offerFromRow(row) {
  if (!row) return null;
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
    if (isCommerceError(error)) throw error;
    throw commerceError("commerce_infrastructure_error");
  }
}

function offersEquivalent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function balanceProjection(walletProjection) {
  const totals = walletProjection?.totals;
  if (
    !totals
    || !["bonus_coins", "paid_coins", "reward_coins"].every(
      (coinType) => Number.isSafeInteger(totals[coinType]) && totals[coinType] >= 0
    )
    || !Number.isSafeInteger(walletProjection.heldUnits)
    || walletProjection.heldUnits < 0
    || !Number.isSafeInteger(walletProjection.version)
    || walletProjection.version < 0
  ) {
    throw commerceError("commerce_infrastructure_error");
  }
  return {
    bonusCoins: totals.bonus_coins,
    paidCoins: totals.paid_coins,
    rewardCoins: totals.reward_coins,
    heldCoins: walletProjection.heldUnits
  };
}

function afterHoldBalance(before, allocation, amountUnits) {
  const after = { ...before };
  const fieldByType = {
    bonus_coins: "bonusCoins",
    paid_coins: "paidCoins",
    reward_coins: "rewardCoins"
  };
  let allocated = 0;
  for (const item of allocation) {
    const field = fieldByType[item?.coinType];
    if (
      !field
      || !Number.isSafeInteger(item.amountUnits)
      || item.amountUnits < 1
      || item.amountUnits > after[field]
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    after[field] -= item.amountUnits;
    allocated += item.amountUnits;
  }
  if (!Number.isSafeInteger(allocated) || allocated !== amountUnits) {
    throw commerceError("commerce_infrastructure_error");
  }
  after.heldCoins += amountUnits;
  if (!Number.isSafeInteger(after.heldCoins)) {
    throw commerceError("commerce_infrastructure_error");
  }
  return after;
}

function normalizeAllocation(value, expectedAmount = null) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw commerceError("commerce_infrastructure_error");
  }
  const allowedOrder = ["bonus_coins", "paid_coins", "reward_coins"];
  let previous = -1;
  let total = 0;
  const normalized = value.map((item) => {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || Object.getPrototypeOf(item) !== Object.prototype
      || Reflect.ownKeys(item).length !== 2
      || !Object.hasOwn(item, "coinType")
      || !Object.hasOwn(item, "amountUnits")
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    const index = allowedOrder.indexOf(item.coinType);
    if (
      index <= previous
      || !Number.isSafeInteger(item.amountUnits)
      || item.amountUnits < 1
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    previous = index;
    total += item.amountUnits;
    if (!Number.isSafeInteger(total)) {
      throw commerceError("commerce_infrastructure_error");
    }
    return { coinType: item.coinType, amountUnits: item.amountUnits };
  });
  if (expectedAmount !== null && total !== expectedAmount) {
    throw commerceError("commerce_infrastructure_error");
  }
  return normalized;
}

function normalizeStoredOffer(value) {
  try {
    return normalizeCoinCommerceOffer(value);
  } catch {
    throw commerceError("commerce_infrastructure_error");
  }
}

export function createSqliteCoinCommerceStore(options = {}) {
  const input = assertPlainObject(options);
  assertExactDataFields(input, FACTORY_FIELDS, new Set());
  const {
    dbPath,
    database,
    commerceRefFactory,
    walletRefFactory,
    discountReader = () => 0,
    cancelWindowMs = DEFAULT_CANCEL_WINDOW_MS,
    quoteTtlMs = DEFAULT_QUOTE_TTL_MS
  } = input;
  const hasPath = dbPath !== undefined;
  const hasDatabase = database !== undefined;
  if (
    hasPath === hasDatabase
    || (hasPath && (typeof dbPath !== "string" || !isAbsolute(dbPath)))
    || (commerceRefFactory !== undefined && typeof commerceRefFactory !== "function")
    || (walletRefFactory !== undefined && typeof walletRefFactory !== "function")
    || typeof discountReader !== "function"
  ) {
    throw commerceError("invalid_store_contract");
  }
  normalizeInterval(cancelWindowMs, { allowZero: true });
  normalizeInterval(quoteTtlMs);

  const makeCommerceRef = commerceRefFactory
    ?? ((kind) => `${kind}_${randomUUID().replaceAll("-", "")}`);
  const makeWalletRef = walletRefFactory
    ?? ((kind) => `${kind}_${randomUUID()}`);
  let ownedDatabase;
  let db;
  let walletStore;
  let walletParticipant;
  try {
    if (hasPath) {
      ownedDatabase = new Database(dbPath, { fileMustExist: true });
      db = ownedDatabase;
      db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
      db.pragma("foreign_keys = ON");
    } else {
      db = database;
      if (
        !db
        || db.open !== true
        || db.inTransaction === true
        || db.pragma("foreign_keys", { simple: true }) !== 1
      ) {
        throw commerceError("invalid_store_contract");
      }
    }
    if (!validateCoinWalletSchema({ database: db }).ok) {
      throw commerceError("coin_wallet_schema_not_ready");
    }
    if (!validateCoinCommerceSchema({ database: db }).ok) {
      throw commerceError("coin_commerce_schema_not_ready");
    }
    walletStore = createSqliteCoinWalletStore({
      database: db,
      refFactory: makeWalletRef
    });
    walletParticipant = createCoinWalletTransactionParticipant({
      database: db,
      refFactory: makeWalletRef
    });
  } catch (error) {
    try {
      walletStore?.close();
      ownedDatabase?.close();
    } catch {
      // Construction still exposes one closed error.
    }
    if (isCommerceError(error)) throw error;
    if (error?.code === "coin_wallet_schema_not_ready") {
      throw commerceError("coin_wallet_schema_not_ready");
    }
    throw normalizeError(error);
  }

  let closed = false;

  function assertOpen() {
    if (closed) throw commerceError("commerce_store_closed");
  }

  function execute(action) {
    assertOpen();
    try {
      return action();
    } catch (error) {
      throw normalizeError(error);
    }
  }

  function nextCommerceRef(kind) {
    if (![
      "quote",
      "order",
      "commerce_operation",
      "order_event",
      "fulfillment_receipt"
    ].includes(kind)) {
      throw commerceError("commerce_infrastructure_error");
    }
    let value;
    try {
      value = makeCommerceRef(kind);
    } catch {
      throw commerceError("commerce_infrastructure_error");
    }
    if (typeof value !== "string" || !COMMERCE_REFERENCE.test(value)) {
      throw commerceError("commerce_infrastructure_error");
    }
    return value;
  }

  function requireAccount(accountId) {
    const normalized = normalizeReference(accountId);
    const row = db.prepare(`
      select id, status from platform_accounts where id = ?
    `).get(normalized);
    if (!row || row.status !== "active") {
      throw commerceError("commerce_not_found");
    }
    return normalized;
  }

  function findOfferVersion(offerVersionRef) {
    return db.prepare(`
      select * from platform_coin_commerce_offer_versions
       where offer_version_ref = ?
    `).get(offerVersionRef) ?? null;
  }

  function findPublishedOffer(offerRef) {
    return db.prepare(`
      select * from platform_coin_commerce_offer_versions
       where offer_ref = ? and status = 'published'
    `).get(offerRef) ?? null;
  }

  const publishTransaction = db.transaction((normalizedOffer) => {
    const existing = findOfferVersion(normalizedOffer.offerVersionRef);
    if (existing) {
      const projected = offerFromRow(existing);
      if (
        existing.status === "published"
        && offersEquivalent(projected, normalizedOffer)
      ) {
        return projected;
      }
      throw commerceError("offer_unavailable");
    }
    const sameOfferPublished = findPublishedOffer(normalizedOffer.offerRef);
    if (sameOfferPublished) throw commerceError("offer_unavailable");
    const highestVersion = db.prepare(`
      select max(version) from platform_coin_commerce_offer_versions
       where offer_ref = ?
    `).pluck().get(normalizedOffer.offerRef);
    if (
      highestVersion !== null
      && (
        !Number.isSafeInteger(highestVersion)
        || normalizedOffer.version <= highestVersion
      )
    ) {
      throw commerceError("offer_unavailable");
    }
    const occurredAt = readDatabaseUtc(db);
    db.prepare(`
      insert into platform_coin_commerce_offer_versions (
        offer_version_ref, offer_ref, version, status, category,
        title_zh, title_en, summary_zh, summary_en,
        important_notices_zh_json, important_notices_en_json,
        base_coin_units, reference_currency, reference_amount_minor,
        accepted_coin_types_json, delivery_kind, duration_days,
        monthly_traffic_gb, traffic_gb, never_expires,
        discount_basis_points, created_at, published_at, retired_at
      ) values (
        ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, null
      )
    `).run(
      normalizedOffer.offerVersionRef,
      normalizedOffer.offerRef,
      normalizedOffer.version,
      normalizedOffer.category,
      normalizedOffer.title.zh,
      normalizedOffer.title.en,
      normalizedOffer.summary.zh,
      normalizedOffer.summary.en,
      JSON.stringify(normalizedOffer.importantNotices.zh),
      JSON.stringify(normalizedOffer.importantNotices.en),
      normalizedOffer.baseCoinUnits,
      normalizedOffer.referencePrice.currency,
      normalizedOffer.referencePrice.amountMinor,
      JSON.stringify(normalizedOffer.acceptedCoinTypes),
      normalizedOffer.delivery.kind,
      normalizedOffer.delivery.durationDays,
      normalizedOffer.delivery.monthlyTrafficGb,
      normalizedOffer.delivery.trafficGb,
      normalizedOffer.delivery.neverExpires ? 1 : 0,
      normalizedOffer.delivery.discountBasisPoints,
      occurredAt,
      occurredAt
    );
    return offerFromRow(findOfferVersion(normalizedOffer.offerVersionRef));
  });

  function publishOfferVersion(offerInput) {
    return execute(() => {
      let normalized;
      try {
        normalized = normalizeCoinCommerceOffer(offerInput);
      } catch {
        throw commerceError("invalid_store_contract");
      }
      return publishTransaction.immediate(normalized);
    });
  }

  const retireTransaction = db.transaction(({ offerRef, offerVersionRef }) => {
    const row = db.prepare(`
      select * from platform_coin_commerce_offer_versions
       where offer_ref = ? and offer_version_ref = ?
    `).get(offerRef, offerVersionRef);
    if (!row) throw commerceError("offer_unavailable");
    const projected = offerFromRow(row);
    if (row.status === "retired") return projected;
    if (row.status !== "published") throw commerceError("offer_unavailable");
    const occurredAt = readDatabaseUtc(db);
    const updated = db.prepare(`
      update platform_coin_commerce_offer_versions
         set status = 'retired', retired_at = ?
       where offer_ref = ? and offer_version_ref = ? and status = 'published'
    `).run(occurredAt, offerRef, offerVersionRef);
    if (updated.changes !== 1) {
      throw commerceError("commerce_infrastructure_error");
    }
    return projected;
  });

  function retireOfferVersion(retireInput) {
    return execute(() => {
      const value = assertPlainObject(retireInput);
      const fields = new Set(["offerRef", "offerVersionRef"]);
      assertExactDataFields(value, fields);
      return retireTransaction.immediate({
        offerRef: normalizeReference(value.offerRef),
        offerVersionRef: normalizeReference(value.offerVersionRef)
      });
    });
  }

  function listPublishedOffers(listInput) {
    return execute(() => {
      const value = assertPlainObject(listInput);
      const fields = new Set(["accountId"]);
      assertExactDataFields(value, fields);
      requireAccount(value.accountId);
      return db.prepare(`
        select * from platform_coin_commerce_offer_versions
         where status = 'published'
         order by category, published_at desc, offer_ref
      `).all().map(offerFromRow);
    });
  }

  function getPublishedOffer(getInput) {
    return execute(() => {
      const value = assertPlainObject(getInput);
      const fields = new Set(["accountId", "offerRef"]);
      assertExactDataFields(value, fields);
      requireAccount(value.accountId);
      const row = findPublishedOffer(normalizeReference(value.offerRef));
      if (!row) throw commerceError("offer_unavailable");
      return offerFromRow(row);
    });
  }

  const createQuoteTransaction = db.transaction((request) => {
    requireAccount(request.accountId);
    const lockedOfferRow = findOfferVersion(request.offer.offerVersionRef);
    if (
      !lockedOfferRow
      || lockedOfferRow.status !== "published"
      || !offersEquivalent(offerFromRow(lockedOfferRow), request.offer)
    ) {
      throw commerceError("offer_unavailable");
    }
    const occurredAt = readDatabaseUtc(db);
    const preview = walletParticipant.previewCoinHoldInTransaction({
      accountId: request.accountId,
      amountUnits: request.amountUnits,
      acceptedCoinTypes: request.offer.acceptedCoinTypes
    });
    const before = balanceProjection(preview.walletProjection);
    let purchaseAvailability;
    let shortfallUnits;
    let allocation;
    let after;
    if (preview.sufficient) {
      allocation = preview.allocation;
      after = afterHoldBalance(before, allocation, request.amountUnits);
      purchaseAvailability = "available";
      shortfallUnits = 0;
    } else {
      allocation = [];
      after = { ...before };
      purchaseAvailability = "insufficient_balance";
      let acceptedUnits = 0;
      for (const coinType of request.offer.acceptedCoinTypes) {
        acceptedUnits += preview.walletProjection.totals[coinType];
      }
      shortfallUnits = request.amountUnits - acceptedUnits;
      if (!Number.isSafeInteger(shortfallUnits) || shortfallUnits < 1) {
        throw commerceError("commerce_infrastructure_error");
      }
    }
    const quoteRef = nextCommerceRef("quote");
    const expiresAt = addMilliseconds(occurredAt, quoteTtlMs);
    db.prepare(`
      insert into platform_coin_commerce_quotes (
        quote_ref, account_id, offer_version_ref, wallet_version,
        amount_units, applied_discount_basis_points,
        purchase_availability, shortfall_units, allocation_json,
        before_balance_json, after_balance_json, status,
        created_at, expires_at, consumed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, null)
    `).run(
      quoteRef,
      request.accountId,
      request.offer.offerVersionRef,
      preview.walletProjection.version,
      request.amountUnits,
      request.discountBasisPoints,
      purchaseAvailability,
      shortfallUnits,
      JSON.stringify(allocation),
      JSON.stringify(before),
      JSON.stringify(after),
      occurredAt,
      expiresAt
    );
    return {
      quoteRef,
      offer: request.offer,
      amountUnits: request.amountUnits,
      appliedDiscountBasisPoints: request.discountBasisPoints,
      purchaseAvailability,
      shortfallUnits,
      allocation,
      balances: { before, after },
      expiresAt
    };
  });

  function createCheckoutQuote(quoteInput) {
    return execute(() => {
      let normalized;
      try {
        normalized = normalizeCheckoutQuoteRequest(quoteInput);
      } catch {
        throw commerceError("invalid_store_contract");
      }
      requireAccount(normalized.accountId);
      const offerRow = findPublishedOffer(normalized.offerRef);
      if (!offerRow) throw commerceError("offer_unavailable");
      const offer = offerFromRow(offerRow);
      const occurredAt = readDatabaseUtc(db);
      let discountBasisPoints;
      try {
        discountBasisPoints = discountReader({
          accountId: normalized.accountId,
          offer,
          occurredAt
        });
      } catch {
        throw commerceError("commerce_infrastructure_error");
      }
      if (
        !Number.isSafeInteger(discountBasisPoints)
        || discountBasisPoints < 0
        || discountBasisPoints > 10_000
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
      let amountUnits;
      try {
        amountUnits = applyCoinDiscount({
          baseCoinUnits: offer.baseCoinUnits,
          discountBasisPoints
        });
      } catch {
        throw commerceError("commerce_infrastructure_error");
      }
      if (!Number.isSafeInteger(amountUnits) || amountUnits < 1) {
        throw commerceError("commerce_infrastructure_error");
      }
      return createQuoteTransaction.immediate({
        accountId: normalized.accountId,
        offer,
        amountUnits,
        discountBasisPoints
      });
    });
  }

  function normalizeOperation(operation, accountId) {
    const value = assertPlainObject(operation);
    const fields = new Set([
      "actorScope",
      "idempotencyKey",
      "actorType",
      "actorRef"
    ]);
    assertExactDataFields(value, fields);
    if (
      value.actorScope !== `portal:${accountId}`
      || value.actorType !== "portal_user"
      || value.actorRef !== accountId
      || typeof value.idempotencyKey !== "string"
      || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.idempotencyKey)
    ) {
      throw commerceError(
        value.idempotencyKey === undefined
          ? "idempotency_key_required"
          : "invalid_store_contract"
      );
    }
    return {
      actorScope: value.actorScope,
      idempotencyKey: value.idempotencyKey,
      actorType: value.actorType,
      actorRef: value.actorRef
    };
  }

  function findCommerceReceipt(operationType, operation) {
    return db.prepare(`
      select * from platform_coin_commerce_operation_receipts
       where actor_scope = ?
         and operation_type = ?
         and idempotency_key = ?
    `).get(
      operation.actorScope,
      operationType,
      operation.idempotencyKey
    ) ?? null;
  }

  function resolveReceiptReplay({
    operationType,
    operation,
    requestDigest,
    accountId
  }) {
    const receipt = findCommerceReceipt(operationType, operation);
    if (!receipt) return null;
    if (receipt.request_digest !== requestDigest) {
      throw commerceError("idempotency_key_reused");
    }
    if (
      receipt.account_id !== accountId
      || receipt.status !== "succeeded"
      || typeof receipt.result_ref !== "string"
      || receipt.safe_result_code !== null
      || typeof receipt.completed_at !== "string"
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    const order = findOrder(receipt.result_ref, accountId);
    if (!order) throw commerceError("commerce_infrastructure_error");
    return projectOrderRow(order);
  }

  function insertStartedCommerceReceipt({
    accountId,
    operationType,
    operation,
    requestDigest,
    occurredAt
  }) {
    const operationRef = nextCommerceRef("commerce_operation");
    db.prepare(`
      insert into platform_coin_commerce_operation_receipts (
        operation_ref, account_id, actor_scope, operation_type,
        idempotency_key, request_digest, status, result_ref,
        safe_result_code, created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
    `).run(
      operationRef,
      accountId,
      operation.actorScope,
      operationType,
      operation.idempotencyKey,
      requestDigest,
      occurredAt
    );
    return operationRef;
  }

  function completeCommerceReceipt(operationRef, resultRef, occurredAt) {
    const completed = db.prepare(`
      update platform_coin_commerce_operation_receipts
         set status = 'succeeded',
             result_ref = ?,
             safe_result_code = null,
             completed_at = ?
       where operation_ref = ? and status = 'started'
    `).run(resultRef, occurredAt, operationRef);
    if (completed.changes !== 1) {
      throw commerceError("commerce_infrastructure_error");
    }
  }

  function appendOrderEvent({
    orderRef,
    eventType,
    safeCode = null,
    actorType,
    actorRef,
    occurredAt,
    eventRef = null
  }) {
    db.prepare(`
      insert into platform_coin_commerce_order_events (
        event_ref, order_ref, event_type, safe_code,
        actor_type, actor_ref, occurred_at
      ) values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventRef ?? nextCommerceRef("order_event"),
      orderRef,
      eventType,
      safeCode,
      actorType,
      actorRef,
      occurredAt
    );
  }

  function recoveryEventRef(orderRef, eventType) {
    const suffix = createHash("sha256")
      .update(
        `GCCWEBOS:COIN_COMMERCE_RECOVERY_EVENT:v1\0${orderRef}\0${eventType}`,
        "utf8"
      )
      .digest("hex")
      .slice(0, 32);
    return `coinevt_recovery_${suffix}`;
  }

  function findOrder(orderRef, accountId = null) {
    const parameters = [orderRef];
    let ownership = "";
    if (accountId !== null) {
      ownership = "and o.account_id = ?";
      parameters.push(accountId);
    }
    return db.prepare(`
      select o.*,
             c.status as fulfillment_status,
             c.safe_failure_code as fulfillment_safe_code
        from platform_coin_commerce_orders o
        left join platform_coin_commerce_fulfillment_commands c
          on c.order_ref = o.order_ref
       where o.order_ref = ? ${ownership}
    `).get(...parameters) ?? null;
  }

  function projectOrderRow(row) {
    if (
      !row
      || !COMMERCE_REFERENCE.test(row.order_ref)
      || !Number.isSafeInteger(row.amount_units)
      || row.amount_units < 1
      || ![
        "held",
        "capture_pending",
        "captured",
        "cancelled",
        "capture_failed",
        "reconciliation_required"
      ].includes(row.payment_status)
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    const offerSnapshot = normalizeStoredOffer(parseJson(row.offer_snapshot_json));
    const allocation = normalizeAllocation(
      parseJson(row.allocation_snapshot_json),
      row.amount_units
    );
    let fulfillment;
    if (row.fulfillment_status === null || row.fulfillment_status === undefined) {
      fulfillment = { status: "not_requested", safeCode: null };
    } else {
      if (!["pending", "processing", "delivered", "failed"].includes(
        row.fulfillment_status
      )) {
        throw commerceError("commerce_infrastructure_error");
      }
      if (
        (row.fulfillment_status === "failed") !== (
          typeof row.fulfillment_safe_code === "string"
        )
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
      fulfillment = {
        status: row.fulfillment_status,
        safeCode: row.fulfillment_safe_code
      };
    }
    for (const timestamp of [
      row.cancel_until,
      row.created_at,
      row.updated_at
    ]) {
      if (
        typeof timestamp !== "string"
        || Number.isNaN(Date.parse(timestamp))
        || new Date(timestamp).toISOString() !== timestamp
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
    }
    return {
      orderRef: row.order_ref,
      offer: offerSnapshot,
      amountUnits: row.amount_units,
      allocation,
      paymentStatus: row.payment_status,
      cancelUntil: row.cancel_until,
      fulfillment,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function projectOwnedOrder(accountId, orderRef) {
    const row = findOrder(orderRef, accountId);
    if (!row) throw commerceError("commerce_not_found");
    return projectOrderRow(row);
  }

  function aggregateHoldAllocation(holdRef) {
    const rows = db.prepare(`
      select l.coin_type, sum(a.allocated_units) as amount_units
        from platform_coin_hold_allocations a
        join platform_coin_lots l on l.lot_ref = a.lot_ref
       where a.hold_ref = ?
       group by l.coin_type
    `).all(holdRef);
    const byType = new Map(rows.map((row) => [
      row.coin_type,
      row.amount_units
    ]));
    return ["bonus_coins", "paid_coins", "reward_coins"]
      .filter((coinType) => byType.has(coinType))
      .map((coinType) => ({
        coinType,
        amountUnits: byType.get(coinType)
      }));
  }

  function parseQuoteRow(row) {
    if (
      !row
      || !Number.isSafeInteger(row.wallet_version)
      || row.wallet_version < 0
      || !Number.isSafeInteger(row.amount_units)
      || row.amount_units < 1
      || !["available", "insufficient_balance"].includes(
        row.purchase_availability
      )
      || !["active", "consumed", "expired"].includes(row.status)
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    return {
      ...row,
      offer: offerFromRow(findOfferVersion(row.offer_version_ref)),
      allocation: normalizeAllocation(
        parseJson(row.allocation_json),
        row.purchase_availability === "available" ? row.amount_units : 0
      )
    };
  }

  const confirmTransaction = db.transaction((request) => {
    const occurredAt = readDatabaseUtc(db);
    const replay = resolveReceiptReplay({
      operationType: "confirm_order",
      operation: request.operation,
      requestDigest: request.requestDigest,
      accountId: request.accountId
    });
    if (replay) return replay;

    const quoteRow = db.prepare(`
      select * from platform_coin_commerce_quotes
       where quote_ref = ? and account_id = ?
    `).get(request.quoteRef, request.accountId);
    if (!quoteRow) throw commerceError("commerce_not_found");
    const quote = parseQuoteRow(quoteRow);
    if (quote.status !== "active") throw commerceError("quote_stale");
    if (quote.expires_at <= occurredAt) throw commerceError("quote_expired");
    if (quote.purchase_availability !== "available") {
      throw commerceError("insufficient_coins");
    }
    const wallet = walletParticipant.getWalletByAccountIdInTransaction(
      request.accountId
    );
    if (!wallet || wallet.status !== "active") {
      throw commerceError(wallet ? "wallet_not_active" : "quote_stale");
    }
    if (wallet.version !== quote.wallet_version) {
      throw commerceError("quote_stale");
    }

    const orderRef = nextCommerceRef("order");
    const refs = deriveCommerceOperationRefs(orderRef);
    const cancelUntil = addMilliseconds(occurredAt, cancelWindowMs);
    const holdExpiresAt = addMilliseconds(
      cancelUntil,
      DEFAULT_COIN_COMMERCE_HOLD_RECOVERY_GRACE_MS
    );
    const receiptRef = insertStartedCommerceReceipt({
      accountId: request.accountId,
      operationType: "confirm_order",
      operation: request.operation,
      requestDigest: request.requestDigest,
      occurredAt
    });
    const hold = walletParticipant.createCoinHoldInTransaction({
      walletRef: wallet.walletRef,
      purpose: "product_purchase",
      purposeRef: orderRef,
      amountUnits: quote.amount_units,
      acceptedCoinTypes: quote.offer.acceptedCoinTypes,
      expiresAt: holdExpiresAt,
      operation: {
        actorScope: request.operation.actorScope,
        idempotencyKey: refs.holdOperationRef,
        actorType: request.operation.actorType,
        actorRef: request.operation.actorRef
      }
    });
    if (
      hold?.ok !== true
      || hold.safeResultCode !== "held"
      || typeof hold.resultRef !== "string"
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    if (
      JSON.stringify(aggregateHoldAllocation(hold.resultRef))
      !== JSON.stringify(quote.allocation)
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    db.prepare(`
      insert into platform_coin_commerce_orders (
        order_ref, account_id, quote_ref, offer_version_ref, hold_ref,
        amount_units, offer_snapshot_json, allocation_snapshot_json,
        payment_status, cancel_until, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, 'held', ?, ?, ?)
    `).run(
      orderRef,
      request.accountId,
      quote.quote_ref,
      quote.offer_version_ref,
      hold.resultRef,
      quote.amount_units,
      JSON.stringify(quote.offer),
      JSON.stringify(quote.allocation),
      cancelUntil,
      occurredAt,
      occurredAt
    );
    const consumed = db.prepare(`
      update platform_coin_commerce_quotes
         set status = 'consumed', consumed_at = ?
       where quote_ref = ?
         and account_id = ?
         and status = 'active'
         and expires_at > ?
    `).run(
      occurredAt,
      quote.quote_ref,
      request.accountId,
      occurredAt
    );
    if (consumed.changes !== 1) {
      throw commerceError("commerce_infrastructure_error");
    }
    appendOrderEvent({
      orderRef,
      eventType: "order_held",
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeCommerceReceipt(receiptRef, orderRef, occurredAt);
    return projectOwnedOrder(request.accountId, orderRef);
  });

  function confirmOrder(confirmInput) {
    return execute(() => {
      const value = assertPlainObject(confirmInput);
      const fields = new Set(["accountId", "quoteRef", "operation"]);
      assertExactDataFields(value, fields);
      let business;
      try {
        business = normalizeConfirmOrderRequest({
          accountId: value.accountId,
          quoteRef: value.quoteRef
        });
      } catch {
        throw commerceError("invalid_store_contract");
      }
      const operation = normalizeOperation(value.operation, business.accountId);
      const requestDigest = canonicalCommerceRequestDigest(
        "confirm_order",
        business
      );
      return confirmTransaction.immediate({
        ...business,
        operation,
        requestDigest
      });
    });
  }

  const cancelTransaction = db.transaction((request) => {
    const occurredAt = readDatabaseUtc(db);
    const replay = resolveReceiptReplay({
      operationType: "cancel_order",
      operation: request.operation,
      requestDigest: request.requestDigest,
      accountId: request.accountId
    });
    if (replay) return replay;
    const order = findOrder(request.orderRef, request.accountId);
    if (!order) throw commerceError("commerce_not_found");
    if (["capture_pending", "captured"].includes(order.payment_status)) {
      throw commerceError("capture_in_progress");
    }
    if (
      order.payment_status !== "held"
      || occurredAt >= order.cancel_until
    ) {
      throw commerceError("cancel_window_closed");
    }
    const receiptRef = insertStartedCommerceReceipt({
      accountId: request.accountId,
      operationType: "cancel_order",
      operation: request.operation,
      requestDigest: request.requestDigest,
      occurredAt
    });
    const refs = deriveCommerceOperationRefs(request.orderRef);
    const release = walletParticipant.releaseCoinHoldInTransaction({
      holdRef: order.hold_ref,
      operation: {
        actorScope: request.operation.actorScope,
        idempotencyKey: refs.releaseOperationRef,
        actorType: request.operation.actorType,
        actorRef: request.operation.actorRef
      }
    });
    if (
      release?.ok !== true
      || release.safeResultCode !== "released"
      || release.resultRef !== order.hold_ref
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    const updated = db.prepare(`
      update platform_coin_commerce_orders
         set payment_status = 'cancelled', updated_at = ?
       where order_ref = ?
         and account_id = ?
         and payment_status = 'held'
         and cancel_until > ?
    `).run(
      occurredAt,
      request.orderRef,
      request.accountId,
      occurredAt
    );
    if (updated.changes !== 1) {
      throw commerceError("commerce_infrastructure_error");
    }
    appendOrderEvent({
      orderRef: request.orderRef,
      eventType: "order_cancelled",
      actorType: request.operation.actorType,
      actorRef: request.operation.actorRef,
      occurredAt
    });
    completeCommerceReceipt(receiptRef, request.orderRef, occurredAt);
    return projectOwnedOrder(request.accountId, request.orderRef);
  });

  function cancelOrder(cancelInput) {
    return execute(() => {
      const value = assertPlainObject(cancelInput);
      const fields = new Set(["accountId", "orderRef", "operation"]);
      assertExactDataFields(value, fields);
      let business;
      try {
        business = normalizeCancelOrderRequest({
          accountId: value.accountId,
          orderRef: value.orderRef
        });
      } catch {
        throw commerceError("invalid_store_contract");
      }
      const operation = normalizeOperation(value.operation, business.accountId);
      return cancelTransaction.immediate({
        ...business,
        operation,
        requestDigest: canonicalCommerceRequestDigest(
          "cancel_order",
          business
        )
      });
    });
  }

  function getOrder(getInput) {
    return execute(() => {
      const value = assertPlainObject(getInput);
      const fields = new Set(["accountId", "orderRef"]);
      assertExactDataFields(value, fields);
      const accountId = normalizeReference(value.accountId);
      const orderRef = normalizeReference(value.orderRef);
      return projectOwnedOrder(accountId, orderRef);
    });
  }

  function normalizeLimit(value) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
      throw commerceError("invalid_pagination");
    }
    return value;
  }

  const claimCapturesTransaction = db.transaction((limit) => {
    const occurredAt = readDatabaseUtc(db);
    const rows = db.prepare(`
      select order_ref
        from platform_coin_commerce_orders
       where payment_status = 'held' and cancel_until <= ?
       order by cancel_until, order_ref
       limit ?
    `).all(occurredAt, limit);
    const claimed = [];
    for (const row of rows) {
      const updated = db.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'capture_pending', updated_at = ?
         where order_ref = ?
           and payment_status = 'held'
           and cancel_until <= ?
      `).run(occurredAt, row.order_ref, occurredAt);
      if (updated.changes !== 1) continue;
      appendOrderEvent({
        orderRef: row.order_ref,
        eventType: "capture_claimed",
        actorType: "commerce_system",
        actorRef: "coin_commerce_capture",
        occurredAt
      });
      claimed.push({ orderRef: row.order_ref });
    }
    return claimed;
  });

  function claimDueCaptures(claimInput) {
    return execute(() => {
      const value = assertPlainObject(claimInput);
      const fields = new Set(["limit"]);
      assertExactDataFields(value, fields);
      return claimCapturesTransaction.immediate(normalizeLimit(value.limit));
    });
  }

  function commandPayloadForOrder(order) {
    const offerSnapshot = normalizeStoredOffer(
      parseJson(order.offer_snapshot_json)
    );
    return { delivery: offerSnapshot.delivery };
  }

  function validateDelivery(value) {
    if (
      !value
      || typeof value !== "object"
      || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    const keys = [
      "kind",
      "durationDays",
      "monthlyTrafficGb",
      "trafficGb",
      "neverExpires",
      "discountBasisPoints"
    ];
    if (
      Reflect.ownKeys(value).length !== keys.length
      || !keys.every((key) => Object.hasOwn(value, key))
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    const testOffer = {
      offerRef: "offer_payload_validation",
      offerVersionRef: "offerv_payload_validation",
      version: 1,
      category: value.kind === "subscription_plan" ? "plan" : "data_pack",
      title: { zh: "验证", en: "Validation" },
      summary: { zh: "验证", en: "Validation" },
      importantNotices: { zh: ["验证"], en: ["Validation"] },
      baseCoinUnits: 1,
      referencePrice: { currency: "CNY", amountMinor: 1 },
      acceptedCoinTypes: ["paid_coins"],
      delivery: value
    };
    return normalizeStoredOffer(testOffer).delivery;
  }

  function parseCommandPayload(payloadJson) {
    const payload = parseJson(payloadJson);
    if (
      !payload
      || typeof payload !== "object"
      || Array.isArray(payload)
      || Object.getPrototypeOf(payload) !== Object.prototype
      || Reflect.ownKeys(payload).length !== 1
      || !Object.hasOwn(payload, "delivery")
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    return { delivery: validateDelivery(payload.delivery) };
  }

  function ensureOutbox(order, occurredAt) {
    const refs = deriveCommerceOperationRefs(order.order_ref);
    const payload = commandPayloadForOrder(order);
    const existing = db.prepare(`
      select * from platform_coin_commerce_fulfillment_commands
       where command_ref = ? or order_ref = ?
    `).get(refs.commandRef, order.order_ref);
    if (existing) {
      if (
        existing.command_ref !== refs.commandRef
        || existing.order_ref !== order.order_ref
        || existing.account_id !== order.account_id
        || JSON.stringify(parseCommandPayload(existing.payload_json))
          !== JSON.stringify(payload)
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
      return false;
    }
    db.prepare(`
      insert into platform_coin_commerce_fulfillment_commands (
        command_ref, order_ref, account_id, payload_json, status,
        attempt_count, lease_generation, lease_token, lease_until,
        safe_failure_code, created_at, updated_at
      ) values (?, ?, ?, ?, 'pending', 0, 0, null, null, null, ?, ?)
    `).run(
      refs.commandRef,
      order.order_ref,
      order.account_id,
      JSON.stringify(payload),
      occurredAt,
      occurredAt
    );
    return true;
  }

  function markReconciliation(order, occurredAt) {
    let currentStatus = order.payment_status;
    if (currentStatus === "held") {
      const claimed = db.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'capture_pending', updated_at = ?
         where order_ref = ? and payment_status = 'held'
      `).run(occurredAt, order.order_ref);
      if (claimed.changes !== 1) {
        throw commerceError("commerce_infrastructure_error");
      }
      currentStatus = "capture_pending";
    } else if (currentStatus === "capture_failed") {
      const reset = db.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'capture_pending', updated_at = ?
         where order_ref = ? and payment_status = 'capture_failed'
      `).run(occurredAt, order.order_ref);
      if (reset.changes !== 1) {
        throw commerceError("commerce_infrastructure_error");
      }
      currentStatus = "capture_pending";
    }
    const updated = db.prepare(`
      update platform_coin_commerce_orders
         set payment_status = 'reconciliation_required', updated_at = ?
       where order_ref = ? and payment_status = ?
    `).run(occurredAt, order.order_ref, currentStatus);
    if (updated.changes !== 1) {
      throw commerceError("commerce_infrastructure_error");
    }
    appendOrderEvent({
      orderRef: order.order_ref,
      eventType: "reconciliation_required",
      safeCode: "reconciliation_required",
      actorType: "commerce_system",
      actorRef: "coin_commerce_recovery",
      occurredAt,
      eventRef: recoveryEventRef(order.order_ref, "reconciliation_required")
    });
  }

  function releaseForRecovery(order, occurredAt) {
    const hold = db.prepare(`
      select * from platform_coin_holds where hold_ref = ?
    `).get(order.hold_ref);
    if (!hold || hold.wallet_ref === undefined) return false;
    if (hold.status !== "active") return false;
    const refs = deriveCommerceOperationRefs(order.order_ref);
    const result = walletParticipant.releaseCoinHoldInTransaction({
      holdRef: order.hold_ref,
      operation: {
        actorScope: `commerce:${order.account_id}`,
        idempotencyKey: refs.recoveryOperationRef,
        actorType: "commerce_system",
        actorRef: "coin_commerce_recovery"
      }
    });
    if (
      result?.ok !== true
      || result.safeResultCode !== "released"
      || result.resultRef !== order.hold_ref
    ) {
      throw commerceError("commerce_infrastructure_error");
    }
    return true;
  }

  function isolateCapture(order, occurredAt) {
    releaseForRecovery(order, occurredAt);
    markReconciliation(order, occurredAt);
    return projectOrderRow(findOrder(order.order_ref));
  }

  function captureOrderBody(orderRef, { recovery = false } = {}) {
    const occurredAt = readDatabaseUtc(db);
    const order = findOrder(orderRef);
    if (!order) throw commerceError("commerce_not_found");
    if (order.payment_status === "captured") {
      ensureOutbox(order, occurredAt);
      return projectOrderRow(findOrder(orderRef));
    }
    if (order.payment_status === "reconciliation_required") {
      return projectOrderRow(order);
    }
    if (order.payment_status !== "capture_pending") {
      throw commerceError("capture_in_progress");
    }
    const hold = db.prepare(`
      select * from platform_coin_holds where hold_ref = ?
    `).get(order.hold_ref);
    if (
      !hold
      || hold.wallet_ref === undefined
      || hold.purpose !== "product_purchase"
      || hold.purpose_ref !== order.order_ref
      || hold.amount_units !== order.amount_units
    ) {
      return isolateCapture(order, occurredAt);
    }
    if (hold.status === "captured") {
      const repaired = db.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'captured', updated_at = ?
         where order_ref = ? and payment_status = 'capture_pending'
      `).run(occurredAt, order.order_ref);
      if (repaired.changes !== 1) {
        throw commerceError("commerce_infrastructure_error");
      }
      const repairedOrder = findOrder(order.order_ref);
      ensureOutbox(repairedOrder, occurredAt);
      appendOrderEvent({
        orderRef: order.order_ref,
        eventType: "payment_captured",
        actorType: "commerce_system",
        actorRef: "coin_commerce_recovery",
        occurredAt,
        eventRef: recovery
          ? recoveryEventRef(order.order_ref, "payment_captured")
          : null
      });
      return projectOrderRow(findOrder(order.order_ref));
    }
    if (hold.status !== "active") {
      return isolateCapture(order, occurredAt);
    }
    const refs = deriveCommerceOperationRefs(order.order_ref);
    let captured;
    try {
      captured = walletParticipant.captureCoinHoldInTransaction({
        holdRef: order.hold_ref,
        operation: {
          actorScope: `commerce:${order.account_id}`,
          idempotencyKey: refs.captureOperationRef,
          actorType: "commerce_system",
          actorRef: "coin_commerce_capture"
        }
      });
    } catch (error) {
      if (
        error?.code === "coin_hold_not_active"
        || error?.code === "wallet_not_active"
      ) {
        return isolateCapture(order, occurredAt);
      }
      throw error;
    }
    if (
      captured?.ok !== true
      || captured.safeResultCode !== "captured"
      || captured.resultRef !== order.hold_ref
    ) {
      if (captured?.safeResultCode === "hold_expired") {
        return isolateCapture(order, occurredAt);
      }
      throw commerceError("commerce_infrastructure_error");
    }
    const updated = db.prepare(`
      update platform_coin_commerce_orders
         set payment_status = 'captured', updated_at = ?
       where order_ref = ? and payment_status = 'capture_pending'
    `).run(occurredAt, order.order_ref);
    if (updated.changes !== 1) {
      throw commerceError("commerce_infrastructure_error");
    }
    const capturedOrder = findOrder(order.order_ref);
    ensureOutbox(capturedOrder, occurredAt);
    appendOrderEvent({
      orderRef: order.order_ref,
      eventType: "payment_captured",
      actorType: "commerce_system",
      actorRef: recovery
        ? "coin_commerce_recovery"
        : "coin_commerce_capture",
      occurredAt,
      eventRef: recovery
        ? recoveryEventRef(order.order_ref, "payment_captured")
        : null
    });
    return projectOrderRow(findOrder(order.order_ref));
  }

  const captureTransaction = db.transaction(captureOrderBody);

  function captureClaimedOrder(captureInput) {
    return execute(() => {
      const value = assertPlainObject(captureInput);
      const fields = new Set(["orderRef"]);
      assertExactDataFields(value, fields);
      return captureTransaction.immediate(normalizeReference(value.orderRef));
    });
  }

  const recoverTransaction = db.transaction((limit) => {
    const occurredAt = readDatabaseUtc(db);
    const rows = db.prepare(`
      select o.*
        from platform_coin_commerce_orders o
        left join platform_coin_commerce_fulfillment_commands c
          on c.order_ref = o.order_ref
       where o.payment_status in ('held', 'capture_pending', 'capture_failed')
          or (
            o.payment_status = 'captured'
            and (
              c.command_ref is null
              or (
                c.status = 'processing'
                and c.lease_until <= ?
              )
            )
          )
       order by o.updated_at, o.order_ref
       limit ?
    `).all(occurredAt, limit);
    const result = {
      scanned: rows.length,
      readyForCapture: 0,
      captureRecovered: 0,
      outboxRecovered: 0,
      expiredHoldReleased: 0,
      expiredLeaseObserved: 0,
      reconciliationRequired: 0,
      unchanged: 0
    };
    for (const order of rows) {
      if (order.payment_status === "held") {
        const hold = db.prepare(
          "select * from platform_coin_holds where hold_ref = ?"
        ).get(order.hold_ref);
        if (
          order.cancel_until <= occurredAt
          && hold?.status === "active"
          && hold.expires_at > occurredAt
        ) {
          result.readyForCapture += 1;
        } else if (
          hold?.status === "active"
          && hold.expires_at <= occurredAt
        ) {
          releaseForRecovery(order, occurredAt);
          markReconciliation(order, occurredAt);
          result.expiredHoldReleased += 1;
        } else if (
          !hold
          || hold.status !== "active"
          || hold.purpose_ref !== order.order_ref
        ) {
          markReconciliation(order, occurredAt);
          result.reconciliationRequired += 1;
        } else {
          result.unchanged += 1;
        }
        continue;
      }
      if (
        order.payment_status === "capture_pending"
        || order.payment_status === "capture_failed"
      ) {
        if (order.payment_status === "capture_failed") {
          const reset = db.prepare(`
            update platform_coin_commerce_orders
               set payment_status = 'capture_pending', updated_at = ?
             where order_ref = ? and payment_status = 'capture_failed'
          `).run(occurredAt, order.order_ref);
          if (reset.changes !== 1) {
            throw commerceError("commerce_infrastructure_error");
          }
        }
        const before = db.prepare(
          "select status, expires_at from platform_coin_holds where hold_ref = ?"
        ).get(order.hold_ref);
        captureOrderBody(order.order_ref, { recovery: true });
        const after = findOrder(order.order_ref);
        if (after.payment_status === "captured") {
          result.captureRecovered += 1;
        } else if (
          after.payment_status === "reconciliation_required"
          && before?.status === "active"
          && before.expires_at <= occurredAt
        ) {
          result.expiredHoldReleased += 1;
        } else {
          result.reconciliationRequired += 1;
        }
        continue;
      }
      const command = db.prepare(`
        select * from platform_coin_commerce_fulfillment_commands
         where order_ref = ?
      `).get(order.order_ref);
      if (!command) {
        ensureOutbox(order, occurredAt);
        result.outboxRecovered += 1;
      } else if (
        command.status === "processing"
        && command.lease_until <= occurredAt
      ) {
        result.expiredLeaseObserved += 1;
      } else {
        result.unchanged += 1;
      }
    }
    return result;
  });

  function recoverNonTerminalOrders(recoverInput) {
    return execute(() => {
      const value = assertPlainObject(recoverInput);
      const fields = new Set(["limit"]);
      assertExactDataFields(value, fields);
      return recoverTransaction.immediate(normalizeLimit(value.limit));
    });
  }

  function freshLeaseToken() {
    let token;
    try {
      token = randomBytes(32).toString("hex");
    } catch {
      throw commerceError("commerce_infrastructure_error");
    }
    if (!/^[0-9a-f]{64}$/.test(token)) {
      throw commerceError("commerce_infrastructure_error");
    }
    return token;
  }

  const claimCommandTransaction = db.transaction((leaseMs) => {
    const occurredAt = readDatabaseUtc(db);
    const command = db.prepare(`
      select * from platform_coin_commerce_fulfillment_commands
       where status = 'pending'
          or (status = 'processing' and lease_until <= ?)
       order by
         case status when 'pending' then 0 else 1 end,
         coalesce(lease_until, updated_at),
         command_ref
       limit 1
    `).get(occurredAt);
    if (!command) return null;
    if (
      command.attempt_count >= 2_147_483_647
      || command.lease_generation >= 2_147_483_647
    ) {
      const failed = db.prepare(`
        update platform_coin_commerce_fulfillment_commands
           set status = 'failed',
               lease_token = null,
               lease_until = null,
               safe_failure_code = 'fulfillment_attempt_limit',
               updated_at = ?
         where command_ref = ?
           and status = ?
           and lease_generation = ?
           and lease_token is ?
           and lease_until is ?
      `).run(
        occurredAt,
        command.command_ref,
        command.status,
        command.lease_generation,
        command.lease_token,
        command.lease_until
      );
      if (failed.changes !== 1) {
        throw commerceError("commerce_infrastructure_error");
      }
      appendOrderEvent({
        orderRef: command.order_ref,
        eventType: "fulfillment_failed",
        safeCode: "fulfillment_attempt_limit",
        actorType: "commerce_system",
        actorRef: "coin_commerce_fulfillment",
        occurredAt
      });
      return null;
    }
    const leaseToken = freshLeaseToken();
    const leaseUntil = addMilliseconds(occurredAt, leaseMs);
    const leaseGeneration = command.lease_generation + 1;
    const updated = db.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set status = 'processing',
             attempt_count = ?,
             lease_generation = ?,
             lease_token = ?,
             lease_until = ?,
             safe_failure_code = null,
             updated_at = ?
       where command_ref = ?
         and status = ?
         and lease_generation = ?
         and lease_token is ?
         and lease_until is ?
    `).run(
      command.attempt_count + 1,
      leaseGeneration,
      leaseToken,
      leaseUntil,
      occurredAt,
      command.command_ref,
      command.status,
      command.lease_generation,
      command.lease_token,
      command.lease_until
    );
    if (updated.changes !== 1) {
      throw commerceError("commerce_busy");
    }
    const payload = parseCommandPayload(command.payload_json);
    return {
      commandRef: command.command_ref,
      orderRef: command.order_ref,
      accountId: command.account_id,
      delivery: payload.delivery,
      leaseGeneration,
      leaseToken
    };
  });

  function claimNextFulfillmentCommand(claimInput) {
    return execute(() => {
      const value = assertPlainObject(claimInput);
      const fields = new Set(["leaseMs"]);
      assertExactDataFields(value, fields);
      const leaseMs = normalizeInterval(value.leaseMs);
      return claimCommandTransaction.immediate(leaseMs);
    });
  }

  const completeCommandTransaction = db.transaction((request) => {
    const occurredAt = readDatabaseUtc(db);
    const command = db.prepare(`
      select * from platform_coin_commerce_fulfillment_commands
       where command_ref = ?
    `).get(request.commandRef);
    if (!command) {
      throw commerceError("commerce_fulfillment_lease_lost");
    }
    if (command.status === "delivered") {
      const receipt = db.prepare(`
        select * from platform_coin_commerce_fulfillment_receipts
         where command_ref = ?
      `).get(request.commandRef);
      if (
        command.lease_generation === request.leaseGeneration
        && receipt?.effect_ref === request.effectRef
        && receipt.status === request.status
        && receipt.safe_code === null
      ) {
        return { status: "delivered" };
      }
      throw commerceError("commerce_fulfillment_lease_lost");
    }
    const updated = db.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set status = 'delivered',
             lease_token = null,
             lease_until = null,
             safe_failure_code = null,
             updated_at = ?
       where command_ref = ?
         and status = 'processing'
         and lease_generation = ?
         and lease_token = ?
    `).run(
      occurredAt,
      request.commandRef,
      request.leaseGeneration,
      request.leaseToken
    );
    if (updated.changes !== 1) {
      throw commerceError("commerce_fulfillment_lease_lost");
    }
    db.prepare(`
      insert into platform_coin_commerce_fulfillment_receipts (
        receipt_ref, command_ref, effect_ref, status, safe_code, recorded_at
      ) values (?, ?, ?, 'delivered', null, ?)
    `).run(
      nextCommerceRef("fulfillment_receipt"),
      request.commandRef,
      request.effectRef,
      occurredAt
    );
    appendOrderEvent({
      orderRef: command.order_ref,
      eventType: "fulfillment_delivered",
      actorType: "commerce_system",
      actorRef: "coin_commerce_fulfillment",
      occurredAt
    });
    return { status: "delivered" };
  });

  function completeFulfillmentCommand(completeInput) {
    return execute(() => {
      const value = assertPlainObject(completeInput);
      const fields = new Set([
        "commandRef",
        "leaseGeneration",
        "leaseToken",
        "effectRef",
        "status"
      ]);
      assertExactDataFields(value, fields);
      if (
        value.status !== "delivered"
        || !Number.isSafeInteger(value.leaseGeneration)
        || value.leaseGeneration < 1
        || !/^[0-9a-f]{64}$/.test(value.leaseToken)
      ) {
        throw commerceError("commerce_invalid_fulfillment_result");
      }
      return completeCommandTransaction.immediate({
        commandRef: normalizeReference(value.commandRef),
        leaseGeneration: value.leaseGeneration,
        leaseToken: value.leaseToken,
        effectRef: normalizeReference(value.effectRef),
        status: "delivered"
      });
    });
  }

  const FULFILLMENT_FAILURE_CODES = new Set([
    "fulfillment_handler_failed",
    "fulfillment_result_invalid",
    "fulfillment_handler_unavailable",
    "fulfillment_attempt_limit"
  ]);

  const failCommandTransaction = db.transaction((request) => {
    const occurredAt = readDatabaseUtc(db);
    const command = db.prepare(`
      select order_ref from platform_coin_commerce_fulfillment_commands
       where command_ref = ?
    `).get(request.commandRef);
    const updated = db.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set status = 'failed',
             lease_token = null,
             lease_until = null,
             safe_failure_code = ?,
             updated_at = ?
       where command_ref = ?
         and status = 'processing'
         and lease_generation = ?
         and lease_token = ?
    `).run(
      request.safeCode,
      occurredAt,
      request.commandRef,
      request.leaseGeneration,
      request.leaseToken
    );
    if (updated.changes !== 1 || !command) {
      throw commerceError("commerce_fulfillment_lease_lost");
    }
    appendOrderEvent({
      orderRef: command.order_ref,
      eventType: "fulfillment_failed",
      safeCode: request.safeCode,
      actorType: "commerce_system",
      actorRef: "coin_commerce_fulfillment",
      occurredAt
    });
    return { status: "failed", safeCode: request.safeCode };
  });

  function failFulfillmentCommand(failInput) {
    return execute(() => {
      const value = assertPlainObject(failInput);
      const fields = new Set([
        "commandRef",
        "leaseGeneration",
        "leaseToken",
        "safeCode"
      ]);
      assertExactDataFields(value, fields);
      if (
        !Number.isSafeInteger(value.leaseGeneration)
        || value.leaseGeneration < 1
        || !/^[0-9a-f]{64}$/.test(value.leaseToken)
        || !FULFILLMENT_FAILURE_CODES.has(value.safeCode)
      ) {
        throw commerceError("commerce_invalid_fulfillment_result");
      }
      return failCommandTransaction.immediate({
        commandRef: normalizeReference(value.commandRef),
        leaseGeneration: value.leaseGeneration,
        leaseToken: value.leaseToken,
        safeCode: value.safeCode
      });
    });
  }

  const nextWakeTransaction = db.transaction(() => {
    const occurredAt = readDatabaseUtc(db);
    const candidates = [];
    const held = db.prepare(`
      select min(cancel_until) from platform_coin_commerce_orders
       where payment_status = 'held'
    `).pluck().get();
    if (held !== null) candidates.push(held);
    const immediateOrder = db.prepare(`
      select 1 from platform_coin_commerce_orders o
       where o.payment_status in ('capture_pending', 'capture_failed')
          or (
            o.payment_status = 'captured'
            and not exists (
              select 1 from platform_coin_commerce_fulfillment_commands c
               where c.order_ref = o.order_ref
            )
          )
       limit 1
    `).get();
    if (immediateOrder) candidates.push(occurredAt);
    const pending = db.prepare(`
      select 1 from platform_coin_commerce_fulfillment_commands
       where status = 'pending' limit 1
    `).get();
    if (pending) candidates.push(occurredAt);
    const lease = db.prepare(`
      select min(lease_until)
        from platform_coin_commerce_fulfillment_commands
       where status = 'processing'
    `).pluck().get();
    if (lease !== null) candidates.push(lease);
    if (candidates.length === 0) return null;
    for (const candidate of candidates) {
      if (
        typeof candidate !== "string"
        || Number.isNaN(Date.parse(candidate))
        || new Date(candidate).toISOString() !== candidate
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
    }
    candidates.sort();
    return candidates[0];
  });

  function nextWakeAt() {
    return execute(() => nextWakeTransaction.immediate());
  }

  function validateStoredCommerceState() {
    for (const row of db.prepare(`
      select c.*, o.offer_snapshot_json
        from platform_coin_commerce_fulfillment_commands c
        join platform_coin_commerce_orders o on o.order_ref = c.order_ref
    `).all()) {
      const payload = parseCommandPayload(row.payload_json);
      const offerSnapshot = normalizeStoredOffer(
        parseJson(row.offer_snapshot_json)
      );
      const refs = deriveCommerceOperationRefs(row.order_ref);
      if (
        row.command_ref !== refs.commandRef
        || !COMMERCE_REFERENCE.test(row.account_id)
        || JSON.stringify(payload.delivery)
          !== JSON.stringify(offerSnapshot.delivery)
        || (
          row.status === "processing"
          && (
            !/^[0-9a-f]{64}$/.test(row.lease_token)
            || typeof row.lease_until !== "string"
            || new Date(row.lease_until).toISOString() !== row.lease_until
          )
        )
        || (
          row.status !== "processing"
          && (row.lease_token !== null || row.lease_until !== null)
        )
        || (
          row.status === "failed"
          && !FULFILLMENT_FAILURE_CODES.has(row.safe_failure_code)
        )
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
    }
    const duplicateReceipt = db.prepare(`
      select command_ref
        from platform_coin_commerce_fulfillment_receipts
       group by command_ref
      having count(*) <> 1
    `).get();
    if (duplicateReceipt) {
      throw commerceError("commerce_infrastructure_error");
    }
    for (const receipt of db.prepare(`
      select * from platform_coin_commerce_fulfillment_receipts
    `).all()) {
      if (
        !COMMERCE_REFERENCE.test(receipt.receipt_ref)
        || !COMMERCE_REFERENCE.test(receipt.effect_ref)
        || receipt.status !== "delivered"
        || receipt.safe_code !== null
      ) {
        throw commerceError("commerce_infrastructure_error");
      }
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    let closeError;
    try {
      walletStore.close();
    } catch (error) {
      closeError = error;
    }
    try {
      ownedDatabase?.close();
    } catch (error) {
      closeError ??= error;
    }
    if (closeError) throw normalizeError(closeError);
  }

  try {
    validateStoredCommerceState();
  } catch (error) {
    try {
      walletStore.close();
      ownedDatabase?.close();
    } catch {
      // Keep the original closed validation result.
    }
    throw normalizeError(error);
  }

  const store = {
    walletStore,
    publishOfferVersion,
    retireOfferVersion,
    listPublishedOffers,
    getPublishedOffer,
    createCheckoutQuote,
    confirmOrder,
    cancelOrder,
    getOrder,
    claimDueCaptures,
    captureClaimedOrder,
    recoverNonTerminalOrders,
    claimNextFulfillmentCommand,
    completeFulfillmentCommand,
    failFulfillmentCommand,
    nextWakeAt,
    close
  };
  if (JSON.stringify(Reflect.ownKeys(store)) !== JSON.stringify(STORE_METHODS)) {
    throw commerceError("commerce_infrastructure_error");
  }
  return store;
}
