import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { applyPaymentStoreMigrations } from "../services/platform/payment-store-migrations.mjs";
import {
  createPaymentRechargeOfferCatalog,
} from "../services/platform/payment-recharge-offer-catalog.mjs";
import {
  createSqlitePaymentStore,
} from "../services/platform/payment-store.mjs";

const NOW = "2026-08-01T00:00:00.000Z";
const EXPIRES_AT = "2026-08-01T00:10:00.000Z";

function createDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = on");
  database.exec(`
    create table platform_schema_migrations (
      migration_id text primary key,
      ddl_checksum text not null,
      applied_at text not null
    );
    create table platform_accounts (
      id text primary key
    );
    insert into platform_accounts (id) values ('account_1'), ('account_2');
  `);
  applyPaymentStoreMigrations({ database, nowFn: () => NOW });
  return database;
}

function createCatalog() {
  return createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [
      {
        offerRef: "coins_30",
        quoteVersion: 1,
        paidCoinUnits: 30,
        amountMinor: 100,
        currency: "USD",
        currencyExponent: 2,
        paymentMethods: ["paypal"],
        enabled: true,
      },
      {
        offerRef: "coins_100",
        quoteVersion: 2,
        paidCoinUnits: 100,
        amountMinor: 300,
        currency: "USD",
        currencyExponent: 2,
        paymentMethods: ["paypal"],
        enabled: false,
      },
    ],
  });
}

function createRefFactory() {
  const sequences = new Map();
  return (kind) => {
    const next = (sequences.get(kind) ?? 0) + 1;
    sequences.set(kind, next);
    return `${kind}_${next}`;
  };
}

function createStore(database, options = {}) {
  return createSqlitePaymentStore({
    database,
    nowFn: () => NOW,
    refFactory: createRefFactory(),
    ...options,
  });
}

function createOrder(store, overrides = {}) {
  return store.createOrder({
    accountId: "account_1",
    offer: createCatalog().getOffer("coins_30"),
    idempotencyKey: "portal_create_1",
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
    ...overrides,
  });
}

function entryReadyResult() {
  return {
    providerOrderRef: "provider_order_1",
    status: "entry_ready",
    chargeCertainty: "possibly_charged",
    nextAction: {
      type: "redirect",
      url: "https://www.sandbox.paypal.com/checkoutnow?token=safe",
      expiresAt: EXPIRES_AT,
    },
    occurredAt: NOW,
  };
}

function paymentFact(overrides = {}) {
  return {
    sourceType: "callback",
    providerEventRef: "provider_event_1",
    eventDedupeKey: "event_dedupe_1",
    eventType: "payment_succeeded",
    paymentOrderRef: "payment_order_1",
    providerOrderRef: "provider_order_1",
    providerCaptureRef: "provider_capture_1",
    providerRefundRef: null,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    merchantScopeDigest: "b".repeat(64),
    payloadDigest: "c".repeat(64),
    occurredAt: NOW,
    verificationResult: "verified",
    ...overrides,
  };
}

function verifiedPaymentInput(overrides = {}) {
  return {
    orderRef: "payment_order_1",
    attemptRef: "payment_attempt_1",
    providerRequestRef: "provider_callback_1",
    receiptType: "callback",
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
    paymentFact: paymentFact(),
    ...overrides,
  };
}

test("sandbox catalog exposes only immutable server-authored USD offers", () => {
  const catalog = createCatalog();
  assert.deepEqual(catalog.listOffers(), [{
    offerRef: "coins_30",
    quoteVersion: 1,
    paidCoinUnits: 30,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    paymentMethods: ["paypal"],
    environment: "sandbox",
    quoteDigest: catalog.getOffer("coins_30").quoteDigest,
  }]);
  assert.equal(catalog.getOffer("coins_100"), null);
  assert.equal(Object.isFrozen(catalog.getOffer("coins_30")), true);
  assert.throws(() => createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [{
      offerRef: "coins_30",
      quoteVersion: 1,
      paidCoinUnits: 30,
      amountMinor: 100,
      currency: "CNY",
      currencyExponent: 2,
      paymentMethods: ["paypal"],
      enabled: true,
    }],
  }), /invalid_payment_recharge_catalog/u);
});

test("createOrder snapshots the server offer and replays one account idempotency key", () => {
  const database = createDatabase();
  const store = createStore(database);
  try {
    const first = createOrder(store);
    assert.equal(first.replayed, false);
    assert.deepEqual(first.order, {
      orderRef: "payment_order_1",
      offerRef: "coins_30",
      quoteVersion: 1,
      expectedPaidCoinUnits: 30,
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      adapterKey: "paypal_v1",
      paymentMethod: "paypal",
      status: "created",
      providerOrderRef: null,
      nextAction: null,
      walletOperationRef: null,
      walletLotRef: null,
      expiresAt: EXPIRES_AT,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const replay = createOrder(store);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.order, first.order);
    assert.throws(
      () => createOrder(store, {
        offer: createPaymentRechargeOfferCatalog({
          environment: "sandbox",
          offers: [{
            offerRef: "coins_50",
            quoteVersion: 1,
            paidCoinUnits: 50,
            amountMinor: 200,
            currency: "USD",
            currencyExponent: 2,
            paymentMethods: ["paypal"],
            enabled: true,
          }],
        }).getOffer("coins_50"),
      }),
      /payment_order_idempotency_conflict/u,
    );
    for (const [field, value] of [
      ["adapterKey", "stripe_v1"],
      ["paymentMethod", "stripe"],
      ["merchantBindingRef", "stripe_sandbox_primary"],
    ]) {
      assert.throws(
        () => createOrder(store, { [field]: value }),
        /payment_order_idempotency_conflict/u,
      );
    }
    assert.deepEqual(createOrder(store).order, first.order);
  } finally {
    store.close();
    database.close();
  }
});

test("create receipt durably restores the allowlisted provider entry action", () => {
  const database = createDatabase();
  const store = createStore(database);
  try {
    const { order } = createOrder(store);
    const result = store.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: "payment_attempt_1",
      providerRequestRef: "provider_create_1",
      receiptType: "create",
      operationResult: entryReadyResult(),
    });
    assert.equal(result.replayed, false);
    assert.equal(result.order.status, "entry_ready");
    assert.deepEqual(result.order.nextAction, entryReadyResult().nextAction);
    assert.equal(result.receipt.chargeCertainty, "possibly_charged");

    const replay = store.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: "payment_attempt_1",
      providerRequestRef: "provider_create_1",
      receiptType: "create",
      operationResult: entryReadyResult(),
    });
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.order.nextAction, entryReadyResult().nextAction);
    assert.throws(() => store.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: "payment_attempt_2",
      providerRequestRef: "provider_create_2",
      receiptType: "create",
      operationResult: { ...entryReadyResult(), providerOrderRef: "provider_order_2" },
    }), /payment_provider_order_conflict/u);
    assert.equal(store.getOrderForAccount({
      accountId: "account_1",
      orderRef: order.orderRef,
    }).providerOrderRef, "provider_order_1");
  } finally {
    store.close();
    database.close();
  }
});

test("verified events dedupe and mismatched money never advances the order", () => {
  const database = createDatabase();
  const store = createStore(database);
  try {
    const { order } = createOrder(store);
    store.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: "payment_attempt_1",
      providerRequestRef: "provider_create_1",
      receiptType: "create",
      operationResult: entryReadyResult(),
    });
    const accepted = store.acceptVerifiedPayment(verifiedPaymentInput({ orderRef: order.orderRef }));
    assert.equal(accepted.replayed, false);
    assert.equal(accepted.order.status, "payment_verified");
    assert.equal(accepted.receipt.verificationResult, "verified");

    const replay = store.acceptVerifiedPayment(verifiedPaymentInput({ orderRef: order.orderRef }));
    assert.equal(replay.replayed, true);

    assert.throws(() => store.acceptVerifiedPayment(verifiedPaymentInput({
      orderRef: order.orderRef,
      providerRequestRef: "provider_callback_2",
      paymentFact: paymentFact({ amountMinor: 200 }),
    })), /payment_fact_mismatch/u);
    assert.equal(store.getOrderForAccount({
      accountId: "account_1",
      orderRef: order.orderRef,
    }).status, "payment_verified");
  } finally {
    store.close();
    database.close();
  }
});

test("verified payment accepts only the immutable order payment binding", () => {
  const database = createDatabase();
  const store = createStore(database);
  try {
    const { order } = createOrder(store);
    store.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: "payment_attempt_1",
      providerRequestRef: "provider_create_1",
      receiptType: "create",
      operationResult: entryReadyResult(),
    });
    for (const [field, value] of [
      ["adapterKey", "stripe_v1"],
      ["paymentMethod", "stripe"],
      ["merchantBindingRef", "stripe_sandbox_primary"],
    ]) {
      assert.throws(
        () => store.acceptVerifiedPayment(verifiedPaymentInput({
          orderRef: order.orderRef,
          providerRequestRef: `provider_callback_${field}`,
          [field]: value,
        })),
        /payment_fact_mismatch/u,
      );
      assert.equal(database.prepare(`
        select count(*) as count from platform_payment_receipts
         where verification_result = 'verified'
      `).get().count, 0);
      const unchanged = store.getOrderForAccount({ accountId: "account_1", orderRef: order.orderRef });
      assert.equal(unchanged.status, "entry_ready");
      assert.equal(unchanged.walletOperationRef, null);
      assert.equal(unchanged.walletLotRef, null);
    }
  } finally {
    store.close();
    database.close();
  }
});

test("markOrderCredited closes once and account reads remain isolated", () => {
  const database = createDatabase();
  const store = createStore(database);
  try {
    const { order } = createOrder(store);
    store.recordOperationReceipt({
      orderRef: order.orderRef,
      attemptRef: "payment_attempt_1",
      providerRequestRef: "provider_create_1",
      receiptType: "create",
      operationResult: entryReadyResult(),
    });
    const verified = store.acceptVerifiedPayment(verifiedPaymentInput({ orderRef: order.orderRef }));
    const credited = store.markOrderCredited({
      orderRef: order.orderRef,
      receiptRef: verified.receipt.receiptRef,
      walletOperationRef: "wallet_operation_1",
      walletLotRef: "wallet_lot_1",
    });
    assert.equal(credited.replayed, false);
    assert.equal(credited.order.status, "credited");
    assert.equal(store.markOrderCredited({
      orderRef: order.orderRef,
      receiptRef: verified.receipt.receiptRef,
      walletOperationRef: "wallet_operation_1",
      walletLotRef: "wallet_lot_1",
    }).replayed, true);
    assert.equal(store.getOrderForAccount({
      accountId: "account_2",
      orderRef: order.orderRef,
    }), null);
    assert.deepEqual(store.listOrdersForAccount({
      accountId: "account_2",
      limit: 10,
    }), []);
  } finally {
    store.close();
    database.close();
  }
});

test("store fails closed when the payment schema is not ready", () => {
  const database = new Database(":memory:");
  try {
    assert.throws(
      () => createStore(database),
      /payment_store_schema_not_ready/u,
    );
  } finally {
    database.close();
  }
});
