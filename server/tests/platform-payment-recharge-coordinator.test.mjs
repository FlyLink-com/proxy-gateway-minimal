import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations,
} from "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinWalletStore } from "../services/platform/coin-wallet-store.mjs";
import {
  createCredentialScopedPaymentExecution,
} from "../services/platform/payment-provider-adapter-contract.mjs";
import {
  createPaymentRechargeCoordinator,
} from "../services/platform/payment-recharge-coordinator.mjs";
import {
  createPaymentRechargeOfferCatalog,
} from "../services/platform/payment-recharge-offer-catalog.mjs";
import {
  applyPaymentStoreMigrations,
} from "../services/platform/payment-store-migrations.mjs";
import { createSqlitePaymentStore } from "../services/platform/payment-store.mjs";

const NOW = "2026-08-01T00:00:00.000Z";
const EXPIRES_AT = "2026-08-01T00:10:00.000Z";
const MERCHANT_DIGEST = "b".repeat(64);
const CAPTURE_PAYLOAD_DIGEST = "c".repeat(64);
const CALLBACK_PAYLOAD_DIGEST = "d".repeat(64);

function refFactory(prefix) {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefix}_${kind}_${next}`;
  };
}

function createDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = on");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('account_1', 'owner_account_1', 'active', '${NOW}', '${NOW}', '{}');
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW),
  });
  applyPaymentStoreMigrations({ database, nowFn: () => NOW });
  return database;
}

function paymentFact({ sourceType, eventDedupeKey, payloadDigest, ...overrides }) {
  return {
    sourceType,
    providerEventRef: sourceType === "callback" ? "paypal_event_1" : null,
    eventDedupeKey,
    eventType: "payment_succeeded",
    paymentOrderRef: "payment_payment_order_1",
    providerOrderRef: "paypal_order_1",
    providerCaptureRef: "paypal_capture_1",
    providerRefundRef: null,
    amountMinor: 100,
    currency: "USD",
    currencyExponent: 2,
    merchantScopeDigest: MERCHANT_DIGEST,
    payloadDigest,
    occurredAt: NOW,
    verificationResult: "verified",
    ...overrides,
  };
}

function createExecution() {
  return createCredentialScopedPaymentExecution({
    profileRef: "paypal_sandbox_profile",
    adapterKey: "paypal_v1",
    contractVersion: "v1",
    credentialProfileRef: "paypal_sandbox_credential",
    credentialLoader: {
      withCredential(_binding, callback) {
        return callback({ opaque: "test-only-credential" });
      },
    },
    requestFn({ binding }) {
      return {
        response: { ok: true },
        evidence: binding.operation === "capture_payment"
          ? {
              merchantScopeDigest: MERCHANT_DIGEST,
              payloadDigest: CAPTURE_PAYLOAD_DIGEST,
            }
          : {
              merchantScopeDigest: MERCHANT_DIGEST,
              payloadDigest: CALLBACK_PAYLOAD_DIGEST,
            },
      };
    },
    allowedActionOrigins: ["https://www.sandbox.paypal.com"],
  });
}

function createAdapter({
  callbackFactOverrides = {},
  callbackDisposition = "settle",
  captureInputs = [],
} = {}) {
  return Object.freeze({
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
    async createRechargeOrder() {
      return {
        providerOrderRef: "paypal_order_1",
        status: "entry_ready",
        chargeCertainty: "possibly_charged",
        nextAction: {
          type: "redirect",
          url: "https://www.sandbox.paypal.com/checkoutnow?token=safe",
          expiresAt: EXPIRES_AT,
        },
        occurredAt: NOW,
      };
    },
    async capturePayment(input) {
      captureInputs.push(structuredClone(input));
      const execution = createExecution();
      return execution.withCredential("capture_payment", async ({ request }) => {
        const { transportReceipt } = await request({ captureRequestRef: "capture_request_1" });
        return {
          transportReceipt,
          captureOutcome: {
            operationResult: {
              providerOrderRef: "paypal_order_1",
              status: "succeeded",
              chargeCertainty: "confirmed_charged",
              nextAction: null,
              occurredAt: NOW,
            },
            paymentFact: paymentFact({
              sourceType: "authenticated_capture_response",
              eventDedupeKey: "capture_event_1",
              payloadDigest: CAPTURE_PAYLOAD_DIGEST,
            }),
          },
        };
      });
    },
    async verifyAndNormalizeCallback() {
      const execution = createExecution();
      return execution.withCredential("verify_callback", async ({ request }) => {
        const { transportReceipt } = await request({ callbackRequestRef: "callback_request_1" });
        return {
          transportReceipt,
          paymentFact: callbackDisposition === "acknowledge"
            ? null
            : paymentFact({
                sourceType: "callback",
                eventDedupeKey: "callback_event_1",
                payloadDigest: CALLBACK_PAYLOAD_DIGEST,
                ...callbackFactOverrides,
              }),
        };
      });
    },
    async webhookSuccessAck() {
      return { statusCode: 204, contentType: "text/plain", body: "" };
    },
  });
}

function createSystem({
  callbackFactOverrides = {},
  callbackDisposition = "settle",
  failCreditOnce = false,
  failMarkOnce = false,
  offerEnabled = true,
} = {}) {
  const database = createDatabase();
  const captureInputs = [];
  let currentNow = NOW;
  const walletStore = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(currentNow),
    refFactory: refFactory("wallet"),
  });
  const rawPaymentStore = createSqlitePaymentStore({
    database,
    nowFn: () => currentNow,
    refFactory: refFactory("payment"),
  });
  let shouldFailMark = failMarkOnce;
  const paymentStore = Object.freeze({
    ...rawPaymentStore,
    markOrderCredited(input) {
      if (shouldFailMark) {
        shouldFailMark = false;
        throw new Error("injected_order_close_failure");
      }
      return rawPaymentStore.markOrderCredited(input);
    },
  });
  let shouldFailCredit = failCreditOnce;
  const injectedWalletStore = Object.freeze({
    ...walletStore,
    creditCoins(input) {
      if (shouldFailCredit) {
        shouldFailCredit = false;
        throw new Error("injected_wallet_failure");
      }
      return walletStore.creditCoins(input);
    },
  });
  const offerCatalog = createPaymentRechargeOfferCatalog({
    environment: "sandbox",
    offers: [{
      offerRef: "coins_30",
      quoteVersion: 1,
      paidCoinUnits: 30,
      amountMinor: 100,
      currency: "USD",
      currencyExponent: 2,
      enabled: offerEnabled,
    }],
  });
  const coordinator = createPaymentRechargeCoordinator({
    store: paymentStore,
    walletStore: injectedWalletStore,
    offerCatalog,
    adapter: createAdapter({
      callbackFactOverrides,
      callbackDisposition,
      captureInputs,
    }),
    nowFn: () => new Date(currentNow),
    refFactory: refFactory("coordinator"),
  });
  return {
    coordinator,
    captureInputs,
    database,
    walletStore,
    setNow(value) {
      currentNow = value;
    },
    close() {
      walletStore.close();
      rawPaymentStore.close();
      database.close();
    },
  };
}

async function createRechargeOrder(coordinator) {
  return coordinator.createRechargeOrder({
    accountId: "account_1",
    offerRef: "coins_30",
    idempotencyKey: "portal_create_1",
  });
}

const CALLBACK_INPUT = Object.freeze({
  callbackRequestRef: "callback_request_1",
  receivedAt: NOW,
  bodyBase64: Buffer.from("verified callback", "utf8").toString("base64"),
  headerEntries: [{ name: "paypal-transmission-id", value: "safe" }],
});

test("duplicate capture and callback converge to one paid_coins lot", async () => {
  const system = createSystem();
  try {
    const created = await createRechargeOrder(system.coordinator);
    const capture = await system.coordinator.captureRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
      idempotencyKey: "capture_1",
    });
    const callback = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.equal(capture.order.status, "credited");
    assert.equal(callback.order.status, "credited");
    const wallet = system.walletStore.getWalletByAccountId("account_1");
    assert.equal(system.walletStore.listLots({ walletRef: wallet.walletRef }).length, 1);
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      30,
    );
    assert.equal(capture.wallet.resultRef, callback.wallet.resultRef);
  } finally {
    system.close();
  }
});

test("verified non-settlement callback is acknowledged without a receipt or Wallet credit", async () => {
  const system = createSystem({ callbackDisposition: "acknowledge" });
  try {
    const created = await createRechargeOrder(system.coordinator);
    const callback = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.deepEqual(callback, {
      order: null,
      wallet: null,
      acknowledgement: { statusCode: 204, contentType: "text/plain", body: "" },
    });
    assert.equal(system.coordinator.getRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
    }).status, "entry_ready");
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      0,
    );
    assert.equal(
      system.database.prepare("select count(*) as count from platform_payment_receipts").get().count,
      1,
    );
  } finally {
    system.close();
  }
});

test("verified approval callback captures the order server-side and credits Coins once", async () => {
  const system = createSystem({
    callbackFactOverrides: {
      eventType: "payment_pending",
      providerCaptureRef: null,
    },
  });
  try {
    const created = await createRechargeOrder(system.coordinator);
    const first = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    const replay = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);

    assert.equal(first.order.status, "credited");
    assert.equal(replay.order.status, "credited");
    assert.equal(first.acknowledgement.statusCode, 204);
    assert.equal(replay.acknowledgement.statusCode, 204);
    assert.equal(system.captureInputs.length, 1);
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      30,
    );
    const wallet = system.walletStore.getWalletByAccountId("account_1");
    assert.equal(system.walletStore.listLots({ walletRef: wallet.walletRef }).length, 1);
  } finally {
    system.close();
  }
});

test("replay after credit-before-order-close uses the Wallet receipt", async () => {
  const system = createSystem({ failMarkOnce: true });
  try {
    await createRechargeOrder(system.coordinator);
    await assert.rejects(
      () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_order_close_failed/u,
    );
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      30,
    );
    const recovered = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.equal(recovered.order.status, "credited");
    assert.equal(recovered.wallet.replayed, true);
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      30,
    );
  } finally {
    system.close();
  }
});

test("verified payment survives a Wallet outage without double credit", async () => {
  const system = createSystem({ failCreditOnce: true });
  try {
    await createRechargeOrder(system.coordinator);
    await assert.rejects(
      () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_wallet_credit_failed/u,
    );
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      0,
    );
    const recovered = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.equal(recovered.order.status, "credited");
    assert.equal(recovered.wallet.replayed, false);
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      30,
    );
  } finally {
    system.close();
  }
});

test("contradictory money and capture identity never mint additional Coins", async () => {
  const amountMismatch = createSystem({ callbackFactOverrides: { amountMinor: 200 } });
  try {
    await createRechargeOrder(amountMismatch.coordinator);
    await assert.rejects(
      () => amountMismatch.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_fact_mismatch/u,
    );
    assert.equal(
      amountMismatch.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      0,
    );
  } finally {
    amountMismatch.close();
  }

  const captureMismatch = createSystem({
    callbackFactOverrides: { providerCaptureRef: "paypal_capture_2" },
  });
  try {
    const created = await createRechargeOrder(captureMismatch.coordinator);
    await captureMismatch.coordinator.captureRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
      idempotencyKey: "capture_1",
    });
    await assert.rejects(
      () => captureMismatch.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_reconciliation_required/u,
    );
    assert.equal(captureMismatch.coordinator.getRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
    }).status, "reconciliation_required");
    assert.equal(
      captureMismatch.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      30,
    );
  } finally {
    captureMismatch.close();
  }
});

test("account isolation and disabled offers fail before provider or Wallet mutation", async () => {
  const system = createSystem();
  try {
    const created = await createRechargeOrder(system.coordinator);
    await assert.rejects(() => system.coordinator.captureRechargeOrder({
      accountId: "account_2",
      orderRef: created.order.orderRef,
      idempotencyKey: "capture_wrong_account",
    }), /payment_recharge_order_not_found/u);
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      0,
    );
  } finally {
    system.close();
  }

  const disabled = createSystem({ offerEnabled: false });
  try {
    await assert.rejects(
      () => createRechargeOrder(disabled.coordinator),
      /payment_recharge_offer_not_available/u,
    );
    assert.equal(disabled.coordinator.listOffers().length, 0);
  } finally {
    disabled.close();
  }
});

test("expired orders pause capture before provider and Wallet mutation", async () => {
  const system = createSystem();
  try {
    const created = await createRechargeOrder(system.coordinator);
    system.setNow(EXPIRES_AT);
    const fetched = system.coordinator.getRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
    });
    const listed = system.coordinator.listRechargeOrders({
      accountId: "account_1",
      limit: 50,
      cursor: null,
    });
    assert.equal(fetched.status, "expired");
    assert.equal(fetched.nextAction, null);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].status, "expired");
    assert.equal(listed[0].nextAction, null);
    await assert.rejects(() => system.coordinator.captureRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
      idempotencyKey: "capture_expired",
    }), /payment_recharge_order_expired/u);
    assert.equal(
      system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins,
      0,
    );
  } finally {
    system.close();
  }
});
