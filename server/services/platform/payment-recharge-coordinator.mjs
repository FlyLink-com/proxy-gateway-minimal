import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  normalizeVerifiedPaymentCallback,
  normalizeVerifiedPaymentEvent,
} from "./payment-provider-adapter-contract.mjs";

const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROVIDER_CAPTURE_ORDER_STATUSES = new Set([
  "entry_ready", "pending",
]);

function coordinatorError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function fail(code) {
  throw coordinatorError(code);
}

function plainObject(value, fields, code = "invalid_payment_recharge_request") {
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

function safeRef(value, code = "invalid_payment_recharge_request") {
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) fail(code);
  return value;
}

function positiveInteger(value, code = "invalid_payment_recharge_request") {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) fail(code);
  return value;
}

function canonicalDigest(value) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function settlementIdentity(context, receipt) {
  const settlementHash = canonicalDigest({
    adapterKey: context.adapterKey,
    merchantScopeDigest: receipt.merchantScopeDigest,
    providerCaptureRef: receipt.providerCaptureRef,
  });
  return Object.freeze({
    settlementRef: `payment_settlement_${settlementHash}`,
    settlementDigest: canonicalDigest({
      paymentOrderRef: context.orderRef,
      paymentMethod: context.paymentMethod,
      merchantBindingRef: context.merchantBindingRef,
      providerOrderRef: receipt.providerOrderRef,
      providerCaptureRef: receipt.providerCaptureRef,
      merchantScopeDigest: receipt.merchantScopeDigest,
      amountMinor: context.amountMinor,
      currency: context.currency,
      currencyExponent: context.currencyExponent,
      expectedPaidCoinUnits: context.expectedPaidCoinUnits,
    }),
  });
}

function sameSettlement(left, right) {
  return left.settlementRef === right.settlementRef
    && left.settlementDigest === right.settlementDigest;
}

function assertMethod(value, name) {
  if (typeof value?.[name] !== "function") fail("invalid_payment_recharge_coordinator");
}

export function createPaymentRechargeCoordinator(options = {}) {
  const input = plainObject(options, [
    "store", "walletStore", "offerCatalog", "adapter", "nowFn", "refFactory",
  ], "invalid_payment_recharge_coordinator");
  const { store, walletStore, offerCatalog, adapter, nowFn, refFactory } = input;
  for (const method of [
    "createOrder", "recordOperationReceipt", "acceptVerifiedPayment",
    "markOrderCredited", "markOrderReconciliationRequired",
    "getOrderForAccount", "getOrderForCapture", "getOrderForVerifiedCallback",
    "getVerifiedPaymentForOrder", "getSettlementContext", "listOrdersForAccount",
  ]) assertMethod(store, method);
  for (const method of ["creditCoins"]) assertMethod(walletStore, method);
  for (const method of ["getOffer", "listOffers"]) assertMethod(offerCatalog, method);
  for (const method of [
    "createRechargeOrder", "capturePayment", "verifyAndNormalizeCallback",
    "webhookSuccessAck",
  ]) assertMethod(adapter, method);
  if (
    typeof nowFn !== "function"
    || typeof refFactory !== "function"
    || typeof adapter.adapterKey !== "string"
    || typeof adapter.paymentMethod !== "string"
    || typeof adapter.merchantBindingRef !== "string"
    || typeof adapter.capabilities?.repeatCreateIdempotent !== "boolean"
  ) {
    fail("invalid_payment_recharge_coordinator");
  }
  const repeatCreateIdempotent = adapter.capabilities.repeatCreateIdempotent;
  const adapterKey = safeRef(adapter.adapterKey, "invalid_payment_recharge_coordinator");
  const paymentMethod = safeRef(adapter.paymentMethod, "invalid_payment_recharge_coordinator");
  const merchantBindingRef = safeRef(
    adapter.merchantBindingRef,
    "invalid_payment_recharge_coordinator",
  );

  function nowIso() {
    let value;
    try {
      const raw = nowFn();
      value = raw instanceof Date ? raw.toISOString() : raw;
      if (typeof value !== "string" || new Date(value).toISOString() !== value) throw new Error();
    } catch {
      fail("payment_recharge_clock_invalid");
    }
    return value;
  }

  function providerRef(kind, orderRef, idempotencyKey = null) {
    const suffix = idempotencyKey === null ? orderRef : `${orderRef}:${idempotencyKey}`;
    const value = `${kind}:${canonicalDigest(suffix).slice(0, 48)}`;
    return safeRef(value, "payment_recharge_reference_unavailable");
  }

  function publicOrder(order, readAt = nowIso()) {
    if (
      order !== null
      && ["created", "entry_ready", "pending"].includes(order.status)
      && Date.parse(readAt) >= Date.parse(order.expiresAt)
    ) {
      return Object.freeze({
        ...order,
        status: "expired",
        nextAction: null,
      });
    }
    return order;
  }

  function publicResult(order, wallet = null, extra = {}) {
    return Object.freeze({ order: publicOrder(order), wallet, ...extra });
  }

  function requireSettlementReconciliation(context) {
    try {
      store.markOrderReconciliationRequired({
        orderRef: context.orderRef,
        receiptRef: context.receipt.receiptRef,
      });
    } catch {
      fail("payment_reconciliation_persistence_failed");
    }
    fail("payment_reconciliation_required");
  }

  async function settle(accepted) {
    const context = store.getSettlementContext({
      orderRef: accepted.order.orderRef,
      receiptRef: accepted.receipt.receiptRef,
    });
    const identity = settlementIdentity(context, context.receipt);
    if (
      context.priorVerifiedReceipt !== null
      && !sameSettlement(identity, settlementIdentity(context, context.priorVerifiedReceipt))
    ) {
      requireSettlementReconciliation(context);
    }
    const hasWalletOperation = context.walletOperationRef !== null;
    const hasWalletLot = context.walletLotRef !== null;
    if (hasWalletOperation !== hasWalletLot) fail("payment_reconciliation_required");
    if (hasWalletOperation) {
      if (
        context.creditedReceipt !== null
        && sameSettlement(identity, settlementIdentity(context, context.creditedReceipt))
      ) {
        return publicResult(accepted.order, null, { replayed: true });
      }
      if (context.creditedReceipt !== null) {
        requireSettlementReconciliation(context);
      }
      fail("payment_reconciliation_required");
    }
    let wallet;
    try {
      wallet = walletStore.creditCoins({
        accountId: context.accountId,
        coinType: "paid_coins",
        amountUnits: context.expectedPaidCoinUnits,
        availability: "available",
        sourceType: "verified_payment_capture",
        sourceRef: identity.settlementRef,
        sourceDigest: identity.settlementDigest,
        policyRef: null,
        policyVersion: null,
        expiresAt: null,
        operation: {
          actorScope: `payment:${context.adapterKey}`,
          actorType: "payment_provider",
          actorRef: context.adapterKey,
          idempotencyKey: identity.settlementRef,
        },
      });
    } catch (error) {
      if (
        error?.code === "idempotency_conflict"
        || error?.code === "credit_origin_conflict"
      ) {
        requireSettlementReconciliation(context);
      }
      fail("payment_wallet_credit_failed");
    }
    if (typeof wallet?.operationRef !== "string" || typeof wallet?.resultRef !== "string") {
      fail("payment_order_close_failed");
    }
    let closed;
    try {
      closed = store.markOrderCredited({
        orderRef: context.orderRef,
        receiptRef: context.receipt.receiptRef,
        walletOperationRef: wallet.operationRef,
        walletLotRef: wallet.resultRef,
      });
    } catch {
      fail("payment_order_close_failed");
    }
    return publicResult(closed.order, Object.freeze({ ...wallet }));
  }

  async function createRechargeOrder(value) {
    const request = plainObject(value, ["accountId", "offerRef", "idempotencyKey"]);
    const accountId = safeRef(request.accountId);
    const offerRef = safeRef(request.offerRef);
    const idempotencyKey = safeRef(request.idempotencyKey);
    const offer = offerCatalog.getOffer(offerRef);
    if (offer === null) fail("payment_recharge_offer_not_available");
    const created = store.createOrder({
      accountId,
      offer,
      idempotencyKey,
      adapterKey,
      paymentMethod,
      merchantBindingRef,
    });
    if (created.order.status !== "created") return publicResult(created.order);
    if (created.replayed && !repeatCreateIdempotent) {
      return publicResult(created.order, null, { replayed: true });
    }
    const attemptRef = providerRef("attempt_create", created.order.orderRef);
    const providerRequestRef = providerRef("provider_create", created.order.orderRef);
    const operationResult = await adapter.createRechargeOrder({
      paymentOrderRef: created.order.orderRef,
      attemptRef,
      providerRequestRef,
      paymentMethod,
      amountMinor: offer.amountMinor,
      currency: offer.currency,
      currencyExponent: offer.currencyExponent,
      expectedPaidCoins: offer.paidCoinUnits,
      quoteDigest: offer.quoteDigest,
      expiresAt: created.order.expiresAt,
      callbackRouteRef: "portal_payment_callback_v1",
      returnRouteRef: "portal_wallet_return_v1",
    });
    const recorded = store.recordOperationReceipt({
      orderRef: created.order.orderRef,
      attemptRef,
      providerRequestRef,
      receiptType: "create",
      operationResult,
    });
    return publicResult(recorded.order);
  }

  function getRechargeOrder(value) {
    const request = plainObject(value, ["accountId", "orderRef"]);
    return publicOrder(store.getOrderForAccount({
      accountId: safeRef(request.accountId),
      orderRef: safeRef(request.orderRef),
    }));
  }

  function listRechargeOrders(value) {
    const request = plainObject(value, ["accountId", "limit", "cursor"]);
    if (request.cursor !== null) fail("payment_recharge_cursor_not_supported");
    const readAt = nowIso();
    return store.listOrdersForAccount({
      accountId: safeRef(request.accountId),
      limit: positiveInteger(request.limit),
    }).map((order) => publicOrder(order, readAt));
  }

  async function captureKnownOrder(order) {
    const orderRef = order.orderRef;
    if (order.status === "credited") return publicResult(order, null, { replayed: true });
    if (Date.parse(nowIso()) >= Date.parse(order.expiresAt)) fail("payment_recharge_order_expired");
    if (order.status === "failed_no_charge" || order.status === "reconciliation_required") {
      fail("payment_reconciliation_required");
    }
    if (order.status === "payment_verified") {
      return settle(store.getVerifiedPaymentForOrder({ orderRef }));
    }
    if (!PROVIDER_CAPTURE_ORDER_STATUSES.has(order.status)) {
      fail("payment_recharge_order_not_ready");
    }
    if (order.providerOrderRef === null) fail("payment_recharge_order_not_ready");
    const attemptRef = providerRef("attempt_capture", orderRef);
    const providerRequestRef = providerRef("provider_capture", orderRef);
    const outcome = await adapter.capturePayment({
      paymentOrderRef: orderRef,
      attemptRef,
      providerOrderRef: order.providerOrderRef,
      captureRequestRef: providerRequestRef,
      amountMinor: order.amountMinor,
      currency: order.currency,
      currencyExponent: order.currencyExponent,
    });
    if (outcome.paymentFact === null) {
      const recorded = store.recordOperationReceipt({
        orderRef,
        attemptRef,
        providerRequestRef,
        receiptType: "capture",
        operationResult: outcome.operationResult,
      });
      return publicResult(recorded.order);
    }
    const fact = normalizeVerifiedPaymentEvent(outcome.paymentFact);
    const accepted = store.acceptVerifiedPayment({
      orderRef,
      attemptRef,
      providerRequestRef,
      receiptType: "capture",
      adapterKey,
      paymentMethod,
      merchantBindingRef,
      paymentFact: fact,
    });
    return settle(accepted);
  }

  async function captureRechargeOrder(value) {
    const request = plainObject(value, ["accountId", "orderRef", "idempotencyKey"]);
    const accountId = safeRef(request.accountId);
    const orderRef = safeRef(request.orderRef);
    safeRef(request.idempotencyKey);
    const order = store.getOrderForCapture({
      accountId,
      orderRef,
      adapterKey,
      paymentMethod,
      merchantBindingRef,
    });
    if (order === null) fail("payment_recharge_order_not_found");
    return captureKnownOrder(order);
  }

  async function acceptProviderCallback(value) {
    const request = plainObject(value, [
      "callbackRequestRef", "receivedAt", "bodyBase64", "headerEntries",
    ]);
    const callbackRequestRef = safeRef(request.callbackRequestRef);
    const callback = normalizeVerifiedPaymentCallback(
      await adapter.verifyAndNormalizeCallback(request),
    );
    if (callback.disposition === "acknowledge") {
      const acknowledgement = await adapter.webhookSuccessAck(callback);
      return publicResult(null, null, { acknowledgement });
    }
    const fact = normalizeVerifiedPaymentEvent(callback);
    const order = store.getOrderForVerifiedCallback({
      orderRef: fact.paymentOrderRef,
      providerOrderRef: fact.providerOrderRef,
      amountMinor: fact.amountMinor,
      currency: fact.currency,
      currencyExponent: fact.currencyExponent,
      adapterKey,
      paymentMethod,
      merchantBindingRef,
    });
    if (order.status === "failed_no_charge" || order.status === "reconciliation_required") {
      fail("payment_reconciliation_required");
    }
    if (fact.eventType === "payment_pending") {
      const result = await captureKnownOrder(order);
      const acknowledgement = await adapter.webhookSuccessAck(callback);
      return publicResult(result.order, result.wallet, {
        acknowledgement,
        ...(result.replayed === undefined ? {} : { replayed: result.replayed }),
      });
    }
    const accepted = store.acceptVerifiedPayment({
      orderRef: fact.paymentOrderRef,
      attemptRef: providerRef("attempt_callback", fact.paymentOrderRef),
      providerRequestRef: callbackRequestRef,
      receiptType: "callback",
      adapterKey,
      paymentMethod,
      merchantBindingRef,
      paymentFact: fact,
    });
    const result = await settle(accepted);
    const acknowledgement = await adapter.webhookSuccessAck(callback);
    return publicResult(result.order, result.wallet, { acknowledgement });
  }

  return Object.freeze({
    acceptProviderCallback,
    captureRechargeOrder,
    createRechargeOrder,
    getRechargeOrder,
    listOffers: () => offerCatalog.listOffers(),
    listRechargeOrders,
  });
}
