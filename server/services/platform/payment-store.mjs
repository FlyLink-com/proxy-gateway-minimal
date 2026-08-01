import { createHash, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { types as utilTypes } from "node:util";

import Database from "better-sqlite3";

import { assertPaymentRechargeOffer } from "./payment-recharge-offer-catalog.mjs";
import { validatePaymentStoreSchema } from "./payment-store-migrations.mjs";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const ORDER_TTL_MS = 10 * 60 * 1000;
const RECEIPT_TYPES = new Set(["create", "query", "capture", "callback"]);
const OPERATION_STATUSES = new Set([
  "entry_ready",
  "pending",
  "failed_no_charge",
  "reconciliation_required",
]);
const CHARGE_CERTAINTIES = new Set([
  "unknown",
  "possibly_charged",
  "confirmed_no_charge",
  "confirmed_charged",
]);

function storeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function fail(code) {
  throw storeError(code);
}

function snapshotExact(value, fields, code = "invalid_payment_store_request") {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))
    || fields.some((field) => !Object.hasOwn(descriptors, field))
  ) {
    fail(code);
  }
  const result = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail(code);
    result[field] = descriptor.value;
  }
  return result;
}

function safeRef(value, code = "invalid_payment_store_request") {
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) fail(code);
  return value;
}

function nullableSafeRef(value, code = "payment_store_corrupt") {
  return value === null ? null : safeRef(value, code);
}

function positiveInteger(value, code = "invalid_payment_store_request") {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) fail(code);
  return value;
}

function currencyExponent(value, code = "invalid_payment_store_request") {
  if (!Number.isSafeInteger(value) || value < 0 || value > 9 || Object.is(value, -0)) {
    fail(code);
  }
  return value;
}

function digest(value, code = "invalid_payment_store_request") {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) fail(code);
  return value;
}

function timestamp(value, code = "invalid_payment_store_request") {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (typeof normalized !== "string") fail(code);
  try {
    if (new Date(normalized).toISOString() !== normalized) fail(code);
  } catch {
    fail(code);
  }
  return normalized;
}

function nowIso(nowFn) {
  try {
    return timestamp(nowFn(), "payment_store_clock_invalid");
  } catch (error) {
    if (error?.code) throw error;
    fail("payment_store_clock_invalid");
  }
}

function canonicalDigest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function normalizeNextAction(value) {
  if (value === null) return null;
  const input = snapshotExact(value, ["type", "url", "expiresAt"]);
  if (input.type !== "redirect" && input.type !== "qr_code") {
    fail("invalid_payment_store_request");
  }
  let parsed;
  try {
    parsed = new URL(input.url);
  } catch {
    fail("invalid_payment_store_request");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
  ) {
    fail("invalid_payment_store_request");
  }
  return Object.freeze({
    type: input.type,
    url: input.url,
    expiresAt: timestamp(input.expiresAt),
  });
}

function mapReceipt(row) {
  if (!row) return null;
  const nextAction = row.next_action_type === null
    ? null
    : Object.freeze({
      type: row.next_action_type,
      url: row.next_action_url,
      expiresAt: row.next_action_expires_at,
    });
  return Object.freeze({
    receiptRef: safeRef(row.receipt_ref, "payment_store_corrupt"),
    orderRef: safeRef(row.payment_order_ref, "payment_store_corrupt"),
    attemptRef: safeRef(row.attempt_ref, "payment_store_corrupt"),
    providerRequestRef: safeRef(row.provider_request_ref, "payment_store_corrupt"),
    receiptType: row.receipt_type,
    canonicalState: row.canonical_state,
    chargeCertainty: row.charge_certainty,
    providerOrderRef: nullableSafeRef(row.provider_order_ref),
    providerCaptureRef: nullableSafeRef(row.provider_capture_ref),
    providerEventRef: nullableSafeRef(row.provider_event_ref),
    eventDedupeKey: nullableSafeRef(row.event_dedupe_key),
    merchantScopeDigest: row.merchant_scope_digest,
    payloadDigest: row.payload_digest,
    nextAction,
    verificationResult: row.verification_result,
    amountMinor: positiveInteger(row.amount_minor, "payment_store_corrupt"),
    currency: row.currency,
    currencyExponent: currencyExponent(row.currency_exponent, "payment_store_corrupt"),
    expectedPaidCoinUnits: positiveInteger(
      row.expected_paid_coin_units,
      "payment_store_corrupt",
    ),
    acceptedAt: timestamp(row.accepted_at, "payment_store_corrupt"),
  });
}

function mapOrder(row) {
  if (!row) return null;
  const showAction = row.status === "entry_ready" || row.status === "pending";
  const nextAction = showAction && row.action_type !== null
    ? Object.freeze({
      type: row.action_type,
      url: row.action_url,
      expiresAt: row.action_expires_at,
    })
    : null;
  return Object.freeze({
    orderRef: safeRef(row.payment_order_ref, "payment_store_corrupt"),
    offerRef: safeRef(row.offer_ref, "payment_store_corrupt"),
    quoteVersion: positiveInteger(row.quote_version, "payment_store_corrupt"),
    expectedPaidCoinUnits: positiveInteger(
      row.expected_paid_coin_units,
      "payment_store_corrupt",
    ),
    amountMinor: positiveInteger(row.amount_minor, "payment_store_corrupt"),
    currency: row.currency,
    currencyExponent: currencyExponent(row.currency_exponent, "payment_store_corrupt"),
    adapterKey: safeRef(row.adapter_key, "payment_store_corrupt"),
    paymentMethod: safeRef(row.payment_method, "payment_store_corrupt"),
    status: row.status,
    providerOrderRef: nullableSafeRef(row.provider_order_ref),
    nextAction,
    walletOperationRef: nullableSafeRef(row.wallet_operation_ref),
    walletLotRef: nullableSafeRef(row.wallet_lot_ref),
    expiresAt: timestamp(row.expires_at, "payment_store_corrupt"),
    createdAt: timestamp(row.created_at, "payment_store_corrupt"),
    updatedAt: timestamp(row.updated_at, "payment_store_corrupt"),
  });
}

const ORDER_SELECT = `
  select o.*,
         (
           select r.next_action_type
             from platform_payment_receipts r
            where r.payment_order_ref = o.payment_order_ref
              and r.next_action_type is not null
            order by r.accepted_at desc, r.receipt_ref desc
            limit 1
         ) as action_type,
         (
           select r.next_action_url
             from platform_payment_receipts r
            where r.payment_order_ref = o.payment_order_ref
              and r.next_action_type is not null
            order by r.accepted_at desc, r.receipt_ref desc
            limit 1
         ) as action_url,
         (
           select r.next_action_expires_at
             from platform_payment_receipts r
            where r.payment_order_ref = o.payment_order_ref
              and r.next_action_type is not null
            order by r.accepted_at desc, r.receipt_ref desc
            limit 1
         ) as action_expires_at
    from platform_payment_orders o
`;

export function createSqlitePaymentStore(options = {}) {
  if (
    options === null
    || typeof options !== "object"
    || Array.isArray(options)
    || utilTypes.isProxy(options)
    || Object.getPrototypeOf(options) !== Object.prototype
  ) {
    fail("invalid_payment_store_contract");
  }
  const keys = Reflect.ownKeys(options);
  if (keys.some((key) => !["database", "dbPath", "nowFn", "refFactory"].includes(key))) {
    fail("invalid_payment_store_contract");
  }
  const {
    database,
    dbPath,
    nowFn = () => new Date(),
    refFactory = (kind) => `${kind}_${randomUUID()}`,
  } = options;
  const hasDatabase = database !== undefined;
  const hasDbPath = dbPath !== undefined;
  if (
    hasDatabase === hasDbPath
    || typeof nowFn !== "function"
    || typeof refFactory !== "function"
    || (hasDbPath && (typeof dbPath !== "string" || !isAbsolute(dbPath)))
  ) {
    fail("invalid_payment_store_contract");
  }
  let owned = null;
  let db;
  try {
    db = hasDatabase ? database : new Database(dbPath, { fileMustExist: true });
    if (!hasDatabase) {
      owned = db;
      db.pragma("busy_timeout = 5000");
      db.pragma("foreign_keys = on");
    }
    if (!validatePaymentStoreSchema({ database: db })) {
      fail("payment_store_schema_not_ready");
    }
  } catch (error) {
    try { owned?.close(); } catch { /* fail closed below */ }
    if (error?.code === "payment_store_schema_not_ready") throw error;
    fail("payment_store_schema_not_ready");
  }
  let closed = false;

  function assertOpen() {
    if (closed) fail("payment_store_closed");
  }

  function nextRef(kind) {
    let value;
    try { value = refFactory(kind); } catch { fail("payment_store_reference_unavailable"); }
    return safeRef(value, "payment_store_reference_unavailable");
  }

  function findOrder(orderRef) {
    return db.prepare(`${ORDER_SELECT} where o.payment_order_ref = ?`)
      .get(orderRef) ?? null;
  }

  function createOrder(input) {
    assertOpen();
    const request = snapshotExact(input, [
      "accountId", "offer", "idempotencyKey", "adapterKey",
      "paymentMethod", "merchantBindingRef",
    ]);
    const accountId = safeRef(request.accountId);
    const offer = assertPaymentRechargeOffer(request.offer);
    const idempotencyKey = safeRef(request.idempotencyKey);
    const adapterKey = safeRef(request.adapterKey);
    const paymentMethod = safeRef(request.paymentMethod);
    const merchantBindingRef = safeRef(request.merchantBindingRef);
    const requestDigest = canonicalDigest({
      accountId,
      offerRef: offer.offerRef,
      quoteVersion: offer.quoteVersion,
      expectedPaidCoinUnits: offer.paidCoinUnits,
      amountMinor: offer.amountMinor,
      currency: offer.currency,
      currencyExponent: offer.currencyExponent,
      quoteDigest: offer.quoteDigest,
      adapterKey,
      paymentMethod,
      merchantBindingRef,
    });
    const run = db.transaction(() => {
      const existing = db.prepare(`
        select payment_order_ref, create_request_digest
          from platform_payment_orders
         where account_id = ? and create_idempotency_key = ?
      `).get(accountId, idempotencyKey);
      if (existing) {
        if (existing.create_request_digest !== requestDigest) {
          fail("payment_order_idempotency_conflict");
        }
        return Object.freeze({
          order: mapOrder(findOrder(existing.payment_order_ref)),
          replayed: true,
        });
      }
      const createdAt = nowIso(nowFn);
      const expiresAt = new Date(Date.parse(createdAt) + ORDER_TTL_MS).toISOString();
      const orderRef = nextRef("payment_order");
      db.prepare(`
        insert into platform_payment_orders (
          payment_order_ref, account_id, offer_ref, create_idempotency_key,
          create_request_digest, quote_version, expected_paid_coin_units,
          amount_minor, currency, currency_exponent, quote_digest, adapter_key,
          payment_method, merchant_binding_ref, status, latest_receipt_ref,
          wallet_operation_ref, wallet_lot_ref, provider_order_ref, expires_at,
          created_at, updated_at
        ) values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', null,
          null, null, null, ?, ?, ?
        )
      `).run(
        orderRef,
        accountId,
        offer.offerRef,
        idempotencyKey,
        requestDigest,
        offer.quoteVersion,
        offer.paidCoinUnits,
        offer.amountMinor,
        offer.currency,
        offer.currencyExponent,
        offer.quoteDigest,
        adapterKey,
        paymentMethod,
        merchantBindingRef,
        expiresAt,
        createdAt,
        createdAt,
      );
      return Object.freeze({ order: mapOrder(findOrder(orderRef)), replayed: false });
    });
    try {
      return run.immediate();
    } catch (error) {
      if (error?.code?.startsWith("payment_")) throw error;
      fail("payment_store_write_failed");
    }
  }

  function normalizeOperationResult(value) {
    const input = snapshotExact(value, [
      "providerOrderRef", "status", "chargeCertainty", "nextAction", "occurredAt",
    ]);
    if (
      !OPERATION_STATUSES.has(input.status)
      || !CHARGE_CERTAINTIES.has(input.chargeCertainty)
    ) {
      fail("invalid_payment_store_request");
    }
    return Object.freeze({
      providerOrderRef: nullableSafeRef(
        input.providerOrderRef,
        "invalid_payment_store_request",
      ),
      status: input.status,
      chargeCertainty: input.chargeCertainty,
      nextAction: normalizeNextAction(input.nextAction),
      occurredAt: timestamp(input.occurredAt),
    });
  }

  function receiptMatchesOperation(receipt, order, request, result) {
    return (
      receipt.orderRef === order.payment_order_ref
      && receipt.attemptRef === request.attemptRef
      && receipt.providerRequestRef === request.providerRequestRef
      && receipt.receiptType === request.receiptType
      && receipt.canonicalState === result.status
      && receipt.chargeCertainty === result.chargeCertainty
      && receipt.providerOrderRef === result.providerOrderRef
      && JSON.stringify(receipt.nextAction) === JSON.stringify(result.nextAction)
      && receipt.amountMinor === order.amount_minor
      && receipt.currency === order.currency
      && receipt.currencyExponent === order.currency_exponent
      && receipt.expectedPaidCoinUnits === order.expected_paid_coin_units
    );
  }

  function recordOperationReceipt(input) {
    assertOpen();
    const request = snapshotExact(input, [
      "orderRef", "attemptRef", "providerRequestRef", "receiptType", "operationResult",
    ]);
    request.orderRef = safeRef(request.orderRef);
    request.attemptRef = safeRef(request.attemptRef);
    request.providerRequestRef = safeRef(request.providerRequestRef);
    if (!RECEIPT_TYPES.has(request.receiptType)) fail("invalid_payment_store_request");
    const result = normalizeOperationResult(request.operationResult);
    const run = db.transaction(() => {
      const order = findOrder(request.orderRef);
      if (!order) fail("payment_order_not_found");
      const sourceOrder = db.prepare(`
        select * from platform_payment_orders where payment_order_ref = ?
      `).get(request.orderRef);
      const existingRow = db.prepare(`
        select * from platform_payment_receipts
         where provider_request_ref = ? and receipt_type = ?
      `).get(request.providerRequestRef, request.receiptType);
      if (existingRow) {
        const receipt = mapReceipt(existingRow);
        if (!receiptMatchesOperation(receipt, sourceOrder, request, result)) {
          fail("payment_receipt_idempotency_conflict");
        }
        return Object.freeze({ order: mapOrder(findOrder(request.orderRef)), receipt, replayed: true });
      }
      const receiptRef = nextRef("payment_receipt");
      db.prepare(`
        insert into platform_payment_receipts (
          receipt_ref, payment_order_ref, attempt_ref, provider_request_ref,
          receipt_type, canonical_state, charge_certainty,
          provider_order_ref, provider_capture_ref, provider_event_ref,
          event_dedupe_key, merchant_scope_digest, payload_digest,
          next_action_type, next_action_url, next_action_expires_at,
          verification_result, amount_minor, currency, currency_exponent,
          expected_paid_coin_units, accepted_at
        ) values (
          ?, ?, ?, ?, ?, ?, ?, ?, null, null, null, null, null,
          ?, ?, ?, 'not_applicable', ?, ?, ?, ?, ?
        )
      `).run(
        receiptRef,
        request.orderRef,
        request.attemptRef,
        request.providerRequestRef,
        request.receiptType,
        result.status,
        result.chargeCertainty,
        result.providerOrderRef,
        result.nextAction?.type ?? null,
        result.nextAction?.url ?? null,
        result.nextAction?.expiresAt ?? null,
        sourceOrder.amount_minor,
        sourceOrder.currency,
        sourceOrder.currency_exponent,
        sourceOrder.expected_paid_coin_units,
        result.occurredAt,
      );
      const nextStatus = result.status;
      db.prepare(`
        update platform_payment_orders
           set status = ?,
               latest_receipt_ref = ?,
               provider_order_ref = coalesce(?, provider_order_ref),
               updated_at = ?
         where payment_order_ref = ?
      `).run(
        nextStatus,
        receiptRef,
        result.providerOrderRef,
        result.occurredAt,
        request.orderRef,
      );
      return Object.freeze({
        order: mapOrder(findOrder(request.orderRef)),
        receipt: mapReceipt(db.prepare(`
          select * from platform_payment_receipts where receipt_ref = ?
        `).get(receiptRef)),
        replayed: false,
      });
    });
    try { return run.immediate(); } catch (error) {
      if (error?.code?.startsWith("payment_")) throw error;
      fail("payment_store_write_failed");
    }
  }

  function normalizePaymentFact(value) {
    const fields = [
      "sourceType", "providerEventRef", "eventDedupeKey", "eventType",
      "paymentOrderRef", "providerOrderRef", "providerCaptureRef",
      "providerRefundRef", "amountMinor", "currency", "currencyExponent",
      "merchantScopeDigest", "payloadDigest", "occurredAt", "verificationResult",
    ];
    const input = snapshotExact(value, fields);
    if (
      (input.sourceType !== "callback"
        && input.sourceType !== "authenticated_capture_response")
      || input.eventType !== "payment_succeeded"
      || input.verificationResult !== "verified"
      || typeof input.currency !== "string"
      || !CURRENCY_RE.test(input.currency)
    ) {
      fail("invalid_payment_store_request");
    }
    return Object.freeze({
      ...input,
      providerEventRef: nullableSafeRef(input.providerEventRef, "invalid_payment_store_request"),
      eventDedupeKey: safeRef(input.eventDedupeKey),
      paymentOrderRef: safeRef(input.paymentOrderRef),
      providerOrderRef: safeRef(input.providerOrderRef),
      providerCaptureRef: safeRef(input.providerCaptureRef),
      providerRefundRef: nullableSafeRef(input.providerRefundRef, "invalid_payment_store_request"),
      amountMinor: positiveInteger(input.amountMinor),
      currencyExponent: currencyExponent(input.currencyExponent),
      merchantScopeDigest: digest(input.merchantScopeDigest),
      payloadDigest: digest(input.payloadDigest),
      occurredAt: timestamp(input.occurredAt),
    });
  }

  function verifiedReceiptMatches(receipt, order, request, fact) {
    return (
      receipt.orderRef === order.payment_order_ref
      && receipt.attemptRef === request.attemptRef
      && receipt.receiptType === request.receiptType
      && receipt.providerOrderRef === fact.providerOrderRef
      && receipt.providerCaptureRef === fact.providerCaptureRef
      && receipt.providerEventRef === fact.providerEventRef
      && receipt.eventDedupeKey === fact.eventDedupeKey
      && receipt.merchantScopeDigest === fact.merchantScopeDigest
      && receipt.payloadDigest === fact.payloadDigest
      && receipt.amountMinor === fact.amountMinor
      && receipt.currency === fact.currency
      && receipt.currencyExponent === fact.currencyExponent
      && receipt.expectedPaidCoinUnits === order.expected_paid_coin_units
    );
  }

  function acceptVerifiedPayment(input) {
    assertOpen();
    const request = snapshotExact(input, [
      "orderRef", "attemptRef", "providerRequestRef", "receiptType", "paymentFact",
    ]);
    request.orderRef = safeRef(request.orderRef);
    request.attemptRef = safeRef(request.attemptRef);
    request.providerRequestRef = safeRef(request.providerRequestRef);
    if (request.receiptType !== "capture" && request.receiptType !== "callback") {
      fail("invalid_payment_store_request");
    }
    const fact = normalizePaymentFact(request.paymentFact);
    const run = db.transaction(() => {
      const order = db.prepare(`
        select * from platform_payment_orders where payment_order_ref = ?
      `).get(request.orderRef);
      if (!order) fail("payment_order_not_found");
      if (
        fact.paymentOrderRef !== order.payment_order_ref
        || fact.providerOrderRef !== order.provider_order_ref
        || fact.amountMinor !== order.amount_minor
        || fact.currency !== order.currency
        || fact.currencyExponent !== order.currency_exponent
      ) {
        fail("payment_fact_mismatch");
      }
      const existing = db.prepare(`
        select * from platform_payment_receipts
         where merchant_scope_digest = ? and event_dedupe_key = ?
      `).get(fact.merchantScopeDigest, fact.eventDedupeKey);
      if (existing) {
        const receipt = mapReceipt(existing);
        if (!verifiedReceiptMatches(receipt, order, request, fact)) {
          fail("payment_event_conflict");
        }
        return Object.freeze({
          order: mapOrder(findOrder(request.orderRef)),
          receipt,
          replayed: true,
        });
      }
      if (order.status !== "entry_ready" && order.status !== "pending"
        && order.status !== "payment_verified" && order.status !== "credited") {
        fail("payment_order_state_conflict");
      }
      const receiptRef = nextRef("payment_receipt");
      db.prepare(`
        insert into platform_payment_receipts (
          receipt_ref, payment_order_ref, attempt_ref, provider_request_ref,
          receipt_type, canonical_state, charge_certainty,
          provider_order_ref, provider_capture_ref, provider_event_ref,
          event_dedupe_key, merchant_scope_digest, payload_digest,
          next_action_type, next_action_url, next_action_expires_at,
          verification_result, amount_minor, currency, currency_exponent,
          expected_paid_coin_units, accepted_at
        ) values (
          ?, ?, ?, ?, ?, 'payment_succeeded', 'confirmed_charged',
          ?, ?, ?, ?, ?, ?, null, null, null, 'verified', ?, ?, ?, ?, ?
        )
      `).run(
        receiptRef,
        request.orderRef,
        request.attemptRef,
        request.providerRequestRef,
        request.receiptType,
        fact.providerOrderRef,
        fact.providerCaptureRef,
        fact.providerEventRef,
        fact.eventDedupeKey,
        fact.merchantScopeDigest,
        fact.payloadDigest,
        fact.amountMinor,
        fact.currency,
        fact.currencyExponent,
        order.expected_paid_coin_units,
        fact.occurredAt,
      );
      if (order.status !== "credited") {
        db.prepare(`
          update platform_payment_orders
             set status = 'payment_verified', latest_receipt_ref = ?, updated_at = ?
           where payment_order_ref = ?
        `).run(receiptRef, fact.occurredAt, request.orderRef);
      }
      return Object.freeze({
        order: mapOrder(findOrder(request.orderRef)),
        receipt: mapReceipt(db.prepare(`
          select * from platform_payment_receipts where receipt_ref = ?
        `).get(receiptRef)),
        replayed: false,
      });
    });
    try { return run.immediate(); } catch (error) {
      if (error?.code?.startsWith("payment_")) throw error;
      fail("payment_store_write_failed");
    }
  }

  function markOrderCredited(input) {
    assertOpen();
    const request = snapshotExact(input, [
      "orderRef", "receiptRef", "walletOperationRef", "walletLotRef",
    ]);
    for (const key of Object.keys(request)) request[key] = safeRef(request[key]);
    const run = db.transaction(() => {
      const order = db.prepare(`
        select * from platform_payment_orders where payment_order_ref = ?
      `).get(request.orderRef);
      if (!order) fail("payment_order_not_found");
      if (order.status === "credited") {
        if (
          order.latest_receipt_ref !== request.receiptRef
          || order.wallet_operation_ref !== request.walletOperationRef
          || order.wallet_lot_ref !== request.walletLotRef
        ) {
          fail("payment_settlement_conflict");
        }
        return Object.freeze({ order: mapOrder(findOrder(request.orderRef)), replayed: true });
      }
      if (order.status !== "payment_verified") fail("payment_order_state_conflict");
      const receipt = db.prepare(`
        select receipt_ref from platform_payment_receipts
         where receipt_ref = ? and payment_order_ref = ? and verification_result = 'verified'
      `).get(request.receiptRef, request.orderRef);
      if (!receipt) fail("payment_receipt_not_found");
      const updatedAt = nowIso(nowFn);
      db.prepare(`
        update platform_payment_orders
           set status = 'credited', latest_receipt_ref = ?,
               wallet_operation_ref = ?, wallet_lot_ref = ?, updated_at = ?
         where payment_order_ref = ?
      `).run(
        request.receiptRef,
        request.walletOperationRef,
        request.walletLotRef,
        updatedAt,
        request.orderRef,
      );
      return Object.freeze({ order: mapOrder(findOrder(request.orderRef)), replayed: false });
    });
    try { return run.immediate(); } catch (error) {
      if (error?.code?.startsWith("payment_")) throw error;
      fail("payment_store_write_failed");
    }
  }

  function getOrderForAccount(input) {
    assertOpen();
    const request = snapshotExact(input, ["accountId", "orderRef"]);
    const row = db.prepare(`${ORDER_SELECT}
      where o.account_id = ? and o.payment_order_ref = ?
    `).get(safeRef(request.accountId), safeRef(request.orderRef));
    return mapOrder(row);
  }

  function listOrdersForAccount(input) {
    assertOpen();
    const request = snapshotExact(input, ["accountId", "limit"]);
    const accountId = safeRef(request.accountId);
    const limit = positiveInteger(request.limit);
    if (limit > 100) fail("invalid_payment_store_request");
    return Object.freeze(db.prepare(`${ORDER_SELECT}
      where o.account_id = ?
      order by o.created_at desc, o.payment_order_ref desc
      limit ?
    `).all(accountId, limit).map(mapOrder));
  }

  function close() {
    if (closed) return;
    closed = true;
    owned?.close();
  }

  return Object.freeze({
    acceptVerifiedPayment,
    close,
    createOrder,
    getOrderForAccount,
    listOrdersForAccount,
    markOrderCredited,
    recordOperationReceipt,
  });
}
