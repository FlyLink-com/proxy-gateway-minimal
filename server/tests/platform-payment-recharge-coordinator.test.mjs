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
    ) values
      ('account_1', 'owner_account_1', 'active', '${NOW}', '${NOW}', '{}'),
      ('account_2', 'owner_account_2', 'active', '${NOW}', '${NOW}', '{}');
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
  repeatCreateIdempotent = true,
  createRechargeOrderFn = null,
  callbackFactOverrides = {},
  callbackFactOverridesSequence = [],
  callbackDisposition = "settle",
  capturePaymentFact = "default",
  adapterKey = "paypal_v1",
  paymentMethod = "paypal",
  merchantBindingRef = "paypal_sandbox_primary",
  captureInputs = [],
  acknowledgementCalls = [],
} = {}) {
  let callbackFactCallCount = 0;
  return Object.freeze({
    adapterKey,
    paymentMethod,
    merchantBindingRef,
    capabilities: Object.freeze({ repeatCreateIdempotent }),
    async createRechargeOrder(input) {
      if (createRechargeOrderFn) return createRechargeOrderFn(input);
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
              status: capturePaymentFact === null ? "pending" : "succeeded",
              chargeCertainty: capturePaymentFact === null
                ? "possibly_charged"
                : "confirmed_charged",
              nextAction: null,
              occurredAt: NOW,
            },
            paymentFact: capturePaymentFact === null
              ? null
              : paymentFact({
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
                ...(callbackFactOverridesSequence[callbackFactCallCount++] ?? {}),
              }),
        };
      });
    },
    async webhookSuccessAck() {
      acknowledgementCalls.push(true);
      return { statusCode: 204, contentType: "text/plain", body: "" };
    },
  });
}

function createSystem({
  adapterOptions = {},
  callbackFactOverrides = {},
  callbackFactOverridesSequence = [],
  callbackDisposition = "settle",
  capturePaymentFact = "default",
  failCreditOnce = false,
  failCreateReceiptOnce = false,
  failMarkOnce = false,
  offerEnabled = true,
  walletResponseOverrides = null,
  onCredited,
} = {}) {
  const database = createDatabase();
  const captureInputs = [];
  const acknowledgementCalls = [];
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
  let shouldFailCreateReceipt = failCreateReceiptOnce;
  const paymentStore = Object.freeze({
    ...rawPaymentStore,
    recordOperationReceipt(input) {
      if (shouldFailCreateReceipt && input.receiptType === "create") {
        shouldFailCreateReceipt = false;
        throw new Error("injected_create_receipt_failure");
      }
      return rawPaymentStore.recordOperationReceipt(input);
    },
    markOrderCredited(input) {
      if (shouldFailMark) {
        shouldFailMark = false;
        throw new Error("injected_order_close_failure");
      }
      return rawPaymentStore.markOrderCredited(input);
    },
  });
  let shouldFailCredit = failCreditOnce;
  let walletCreditCalls = 0;
  const injectedWalletStore = Object.freeze({
    ...walletStore,
    creditCoins(input) {
      walletCreditCalls += 1;
      if (shouldFailCredit) {
        shouldFailCredit = false;
        throw new Error("injected_wallet_failure");
      }
      return {
        ...walletStore.creditCoins(input),
        ...(walletResponseOverrides ?? {}),
      };
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
      paymentMethods: ["paypal"],
      enabled: offerEnabled,
    }],
  });
  const coordinator = createPaymentRechargeCoordinator({
    ...(onCredited ? {onCredited} : {}),
    store: paymentStore,
    walletStore: injectedWalletStore,
    offerCatalog,
    adapter: createAdapter({
      ...adapterOptions,
      callbackFactOverrides,
      callbackFactOverridesSequence,
      callbackDisposition,
      capturePaymentFact,
      captureInputs,
      acknowledgementCalls,
    }),
    nowFn: () => new Date(currentNow),
    refFactory: refFactory("coordinator"),
  });
  return {
    coordinator,
    captureInputs,
    database,
    paymentStore: rawPaymentStore,
    walletStore,
    acknowledgementCalls: () => acknowledgementCalls.length,
    walletCreditCalls: () => walletCreditCalls,
    createCoordinator(adapterOptions = {}) {
      const alternateCaptureInputs = [];
      return {
        coordinator: createPaymentRechargeCoordinator({
          store: paymentStore,
          walletStore: injectedWalletStore,
          offerCatalog,
          adapter: createAdapter({
            ...adapterOptions,
            captureInputs: alternateCaptureInputs,
          }),
          nowFn: () => new Date(currentNow),
          refFactory: refFactory("alternate_coordinator"),
        }),
        captureInputs: alternateCaptureInputs,
      };
    },
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

function seedLegacyVerifiedWalletCredit(system, orderRef) {
  const accepted = system.paymentStore.acceptVerifiedPayment({
    orderRef,
    attemptRef: "attempt_legacy_callback_1",
    providerRequestRef: "provider_legacy_callback_1",
    receiptType: "callback",
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
    paymentFact: paymentFact({
      sourceType: "callback",
      eventDedupeKey: "legacy_callback_event_1",
      payloadDigest: CALLBACK_PAYLOAD_DIGEST,
    }),
  });
  const wallet = system.walletStore.creditCoins({
    accountId: "account_1",
    coinType: "paid_coins",
    amountUnits: 30,
    availability: "available",
    sourceType: "verified_payment_capture",
    sourceRef: "payment_settlement_d71fa888d1f6195cfa6ca987c160846a92d655de88106039a7ce4c008e48db0e",
    sourceDigest: "c5d1f52353e09d438bc5384ef6df2570f9388b3c22674bb1a8c7d1cada7aaa78",
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "payment:paypal_v1",
      actorType: "payment_provider",
      actorRef: "paypal_v1",
      idempotencyKey: "payment_settlement_d71fa888d1f6195cfa6ca987c160846a92d655de88106039a7ce4c008e48db0e",
    },
  });
  assert.equal(accepted.order.status, "payment_verified");
  assert.equal(wallet.replayed, false);
}

const CALLBACK_INPUT = Object.freeze({
  callbackRequestRef: "callback_request_1",
  receivedAt: NOW,
  bodyBase64: Buffer.from("verified callback", "utf8").toString("base64"),
  headerEntries: [{ name: "paypal-transmission-id", value: "safe" }],
});

test("non-idempotent concurrent create replays the unresolved durable claim without provider redispatch", async () => {
  let providerCalls = 0;
  let firstOrderRef = null;
  let releaseFirstProvider;
  let signalFirstProvider;
  const firstProviderEntered = new Promise((resolve) => { signalFirstProvider = resolve; });
  const firstProviderRelease = new Promise((resolve) => { releaseFirstProvider = resolve; });
  const nextAction = Object.freeze({
    type: "redirect",
    url: "https://checkout.example.test/pay/1",
    expiresAt: EXPIRES_AT,
  });
  const system = createSystem({
    adapterOptions: {
      repeatCreateIdempotent: false,
      async createRechargeOrderFn(input) {
        providerCalls += 1;
        if (providerCalls !== 1) throw new Error("duplicate_provider_dispatch");
        firstOrderRef = input.paymentOrderRef;
        signalFirstProvider();
        await firstProviderRelease;
        return {
          providerOrderRef: "provider_order_1",
          status: "entry_ready",
          chargeCertainty: "possibly_charged",
          nextAction,
          occurredAt: NOW,
        };
      },
    },
  });
  try {
    const firstCreate = createRechargeOrder(system.coordinator);
    await firstProviderEntered;
    try {
      const replay = await createRechargeOrder(system.coordinator);
      assert.equal(replay.order.orderRef, firstOrderRef);
      assert.equal(replay.order.status, "created");
      assert.equal(replay.order.nextAction, null);
      assert.equal(replay.replayed, true);
      assert.equal(providerCalls, 1);
    } finally {
      releaseFirstProvider();
      await firstCreate;
    }
    const saved = await createRechargeOrder(system.coordinator);
    assert.equal(saved.order.orderRef, firstOrderRef);
    assert.equal(saved.order.status, "entry_ready");
    assert.deepEqual(saved.order.nextAction, nextAction);
    assert.equal(providerCalls, 1);
  } finally {
    system.close();
  }
});

test("non-idempotent create receipt loss replays the unresolved durable claim without provider redispatch", async () => {
  let providerCalls = 0;
  const system = createSystem({
    failCreateReceiptOnce: true,
    adapterOptions: {
      repeatCreateIdempotent: false,
      async createRechargeOrderFn() {
        providerCalls += 1;
        return {
          providerOrderRef: "provider_order_1",
          status: "entry_ready",
          chargeCertainty: "possibly_charged",
          nextAction: {
            type: "redirect",
            url: "https://checkout.example.test/pay/1",
            expiresAt: EXPIRES_AT,
          },
          occurredAt: NOW,
        };
      },
    },
  });
  try {
    const firstCreate = createRechargeOrder(system.coordinator);
    await assert.rejects(() => firstCreate, /injected_create_receipt_failure/u);
    const replay = await createRechargeOrder(system.coordinator);
    assert.equal(replay.order.status, "created");
    assert.equal(replay.order.providerOrderRef, null);
    assert.equal(replay.order.nextAction, null);
    assert.equal(replay.replayed, true);
    assert.equal(providerCalls, 1);
    assert.equal(system.database.prepare(
      "select count(*) as count from platform_payment_receipts where receipt_type = 'create'",
    ).get().count, 0);
  } finally {
    system.close();
  }
});

test("repeat-create-idempotent provider retries the deterministic request after receipt loss", async () => {
  const providerRequestRefs = [];
  const system = createSystem({
    failCreateReceiptOnce: true,
    adapterOptions: {
      repeatCreateIdempotent: true,
      async createRechargeOrderFn(input) {
        providerRequestRefs.push(input.providerRequestRef);
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
    },
  });
  try {
    await assert.rejects(
      () => createRechargeOrder(system.coordinator),
      /injected_create_receipt_failure/u,
    );
    assert.equal(providerRequestRefs.length, 1);
    const retry = await createRechargeOrder(system.coordinator);
    assert.equal(retry.order.status, "entry_ready");
    assert.equal(providerRequestRefs.length, 2);
    assert.equal(providerRequestRefs[1], providerRequestRefs[0]);
    const replay = await createRechargeOrder(system.coordinator);
    assert.equal(replay.order.status, "entry_ready");
    assert.deepEqual(replay.order.nextAction, retry.order.nextAction);
    assert.equal(providerRequestRefs.length, 2);
  } finally {
    system.close();
  }
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
    assert.equal(callback.wallet, null);
  } finally {
    system.close();
  }
});

test("Wallet settlement preserves the canonical merchant-scoped capture identity", async () => {
  const system = createSystem();
  try {
    const created = await createRechargeOrder(system.coordinator);
    await system.coordinator.captureRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
      idempotencyKey: "capture_canonical_identity_1",
    });
    const lot = system.database.prepare(`
      select source_ref from platform_coin_lots
       where source_type = 'verified_payment_capture'
    `).get();
    assert.equal(
      lot.source_ref,
      "payment_settlement_d71fa888d1f6195cfa6ca987c160846a92d655de88106039a7ce4c008e48db0e",
    );
  } finally {
    system.close();
  }
});

test("one merchant-scoped provider capture cannot credit two payment orders", async () => {
  const system = createSystem({
    callbackFactOverridesSequence: [
      {},
      {
        paymentOrderRef: "payment_payment_order_2",
        providerEventRef: "paypal_event_2",
        eventDedupeKey: "callback_event_2",
      },
    ],
  });
  try {
    await createRechargeOrder(system.coordinator);
    await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    const second = await system.coordinator.createRechargeOrder({
      accountId: "account_2",
      offerRef: "coins_30",
      idempotencyKey: "portal_create_2",
    });
    await assert.rejects(
      () => system.coordinator.acceptProviderCallback({
        ...CALLBACK_INPUT,
        callbackRequestRef: "callback_request_2",
      }),
      /payment_reconciliation_required/u,
    );
    assert.equal(system.walletStore.getWalletProjection({
      accountId: "account_1",
    }).totals.paid_coins, 30);
    assert.equal(system.walletStore.getWalletProjection({
      accountId: "account_2",
    }).totals.paid_coins, 0);
    assert.equal(system.coordinator.getRechargeOrder({
      accountId: "account_2",
      orderRef: second.order.orderRef,
    }).status, "reconciliation_required");
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

    assert.equal(first.order.orderRef, created.order.orderRef);
    assert.equal(replay.order.orderRef, created.order.orderRef);
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

test("payment_verified direct capture resumes the durable legacy settlement without provider recapture", async () => {
  const system = createSystem();
  try {
    const created = await createRechargeOrder(system.coordinator);
    seedLegacyVerifiedWalletCredit(system, created.order.orderRef);
    const recovered = await system.coordinator.captureRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
      idempotencyKey: "capture_verified_recovery_1",
    });
    assert.equal(recovered.order.status, "credited");
    assert.equal(recovered.wallet.replayed, true);
    assert.equal(system.captureInputs.length, 0);
    assert.equal(system.walletStore.getWalletProjection({
      accountId: "account_1",
    }).totals.paid_coins, 30);
    const wallet = system.walletStore.getWalletByAccountId("account_1");
    assert.equal(system.walletStore.listLots({ walletRef: wallet.walletRef }).length, 1);
  } finally {
    system.close();
  }
});

test("payment_verified pending callback resumes the durable receipt without provider recapture", async () => {
  const system = createSystem({
    callbackFactOverrides: {
      eventType: "payment_pending",
      providerCaptureRef: null,
    },
  });
  try {
    const created = await createRechargeOrder(system.coordinator);
    seedLegacyVerifiedWalletCredit(system, created.order.orderRef);
    const recovered = await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.equal(recovered.order.status, "credited");
    assert.equal(recovered.wallet.replayed, true);
    assert.equal(recovered.acknowledgement.statusCode, 204);
    assert.equal(system.captureInputs.length, 0);
    assert.equal(system.walletStore.getWalletProjection({
      accountId: "account_1",
    }).totals.paid_coins, 30);
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
    assert.equal(captureMismatch.walletCreditCalls(), 1);
    await assert.rejects(
      () => captureMismatch.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_reconciliation_required/u,
    );
    assert.equal(captureMismatch.walletCreditCalls(), 1);
    await assert.rejects(
      () => captureMismatch.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_reconciliation_required/u,
    );
    assert.equal(captureMismatch.walletCreditCalls(), 1);
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

test("conflicting verified capture after an unclosed Wallet credit reconciles without a second lot", async () => {
  const system = createSystem({
    failMarkOnce: true,
    callbackFactOverridesSequence: [
      {},
      {
        providerCaptureRef: "paypal_capture_2",
        providerEventRef: "paypal_event_2",
        eventDedupeKey: "callback_event_2",
      },
    ],
  });
  try {
    const created = await createRechargeOrder(system.coordinator);
    await assert.rejects(
      () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_order_close_failed/u,
    );
    const wallet = system.walletStore.getWalletByAccountId("account_1");
    assert.equal(system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins, 30);
    assert.equal(system.walletStore.listLots({ walletRef: wallet.walletRef }).length, 1);
    assert.equal(system.database.prepare(`
      select count(*) as count from platform_coin_operation_receipts
       where operation_type = 'credit_coins' and status = 'succeeded'
    `).get().count, 1);

    await assert.rejects(
      () => system.coordinator.acceptProviderCallback({
        ...CALLBACK_INPUT,
        callbackRequestRef: "callback_request_2",
      }),
      /payment_reconciliation_required/u,
    );
    assert.equal(system.walletStore.getWalletProjection({ accountId: "account_1" }).totals.paid_coins, 30);
    assert.equal(system.walletStore.listLots({ walletRef: wallet.walletRef }).length, 1);
    assert.equal(system.database.prepare(`
      select count(*) as count from platform_coin_operation_receipts
       where operation_type = 'credit_coins' and status = 'succeeded'
    `).get().count, 1);
    assert.equal(system.coordinator.getRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
    }).status, "reconciliation_required");
  } finally {
    system.close();
  }
});

test("persisted partial Wallet references block every callback before Wallet credit", async () => {
  for (const [column, value] of [
    ["wallet_operation_ref", "wallet_operation_1"],
    ["wallet_lot_ref", "wallet_lot_1"],
  ]) {
    const system = createSystem();
    try {
      const created = await createRechargeOrder(system.coordinator);
      const accepted = system.paymentStore.acceptVerifiedPayment({
        orderRef: created.order.orderRef,
        attemptRef: "attempt_capture_1",
        providerRequestRef: "provider_capture_1",
        receiptType: "capture",
        adapterKey: "paypal_v1",
        paymentMethod: "paypal",
        merchantBindingRef: "paypal_sandbox_primary",
        paymentFact: paymentFact({
          sourceType: "authenticated_capture_response",
          eventDedupeKey: "capture_event_1",
          payloadDigest: CAPTURE_PAYLOAD_DIGEST,
        }),
      });
      assert.equal(accepted.order.status, "payment_verified");
      system.database.prepare(`
        update platform_payment_orders set ${column} = ? where payment_order_ref = ?
      `).run(value, created.order.orderRef);
      await assert.rejects(
        () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
        /payment_reconciliation_required/u,
      );
      assert.equal(system.walletCreditCalls(), 0);
    } finally {
      system.close();
    }
  }
});

test("late verified success after failed_no_charge requires reconciliation without acknowledgement", async () => {
  const system = createSystem();
  try {
    const created = await createRechargeOrder(system.coordinator);
    system.paymentStore.recordOperationReceipt({
      orderRef: created.order.orderRef,
      attemptRef: "attempt_failed_1",
      providerRequestRef: "provider_failed_1",
      receiptType: "capture",
      operationResult: {
        providerOrderRef: "paypal_order_1",
        status: "failed_no_charge",
        chargeCertainty: "confirmed_no_charge",
        nextAction: null,
        occurredAt: NOW,
      },
    });
    await assert.rejects(
      () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
      /payment_reconciliation_required/u,
    );
    assert.equal(system.coordinator.getRechargeOrder({
      accountId: "account_1",
      orderRef: created.order.orderRef,
    }).status, "failed_no_charge");
    assert.equal(system.walletCreditCalls(), 0);
    assert.equal(system.acknowledgementCalls(), 0);
    assert.equal(system.database.prepare(`
      select count(*) as count from platform_payment_receipts
       where verification_result = 'verified'
    `).get().count, 0);
  } finally {
    system.close();
  }
});

test("pending callbacks for terminal payment states reject before capture, Wallet, or acknowledgement", async () => {
  for (const terminalState of ["failed_no_charge", "reconciliation_required"]) {
    const system = createSystem({
      callbackFactOverrides: {
        eventType: "payment_pending",
        providerCaptureRef: null,
      },
    });
    try {
      const created = await createRechargeOrder(system.coordinator);
      if (terminalState === "failed_no_charge") {
        system.paymentStore.recordOperationReceipt({
          orderRef: created.order.orderRef,
          attemptRef: "attempt_failed_pending_1",
          providerRequestRef: "provider_failed_pending_1",
          receiptType: "capture",
          operationResult: {
            providerOrderRef: "paypal_order_1",
            status: "failed_no_charge",
            chargeCertainty: "confirmed_no_charge",
            nextAction: null,
            occurredAt: NOW,
          },
        });
      } else {
        const accepted = system.paymentStore.acceptVerifiedPayment({
          orderRef: created.order.orderRef,
          attemptRef: "attempt_reconciliation_1",
          providerRequestRef: "provider_reconciliation_1",
          receiptType: "capture",
          adapterKey: "paypal_v1",
          paymentMethod: "paypal",
          merchantBindingRef: "paypal_sandbox_primary",
          paymentFact: paymentFact({
            sourceType: "authenticated_capture_response",
            eventDedupeKey: "reconciliation_event_1",
            payloadDigest: CAPTURE_PAYLOAD_DIGEST,
          }),
        });
        system.paymentStore.markOrderReconciliationRequired({
          orderRef: created.order.orderRef,
          receiptRef: accepted.receipt.receiptRef,
        });
      }
      await assert.rejects(
        () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
        /payment_reconciliation_required/u,
      );
      assert.equal(system.captureInputs.length, 0);
      assert.equal(system.walletCreditCalls(), 0);
      assert.equal(system.acknowledgementCalls(), 0);
      assert.equal(system.coordinator.getRechargeOrder({
        accountId: "account_1",
        orderRef: created.order.orderRef,
      }).status, terminalState);
    } finally {
      system.close();
    }
  }
});

test("direct capture rejects terminal payment states before provider capture", async () => {
  for (const terminalState of ["failed_no_charge", "reconciliation_required"]) {
    const system = createSystem();
    try {
      const created = await createRechargeOrder(system.coordinator);
      if (terminalState === "failed_no_charge") {
        system.paymentStore.recordOperationReceipt({
          orderRef: created.order.orderRef,
          attemptRef: "attempt_failed_direct_1",
          providerRequestRef: "provider_failed_direct_1",
          receiptType: "capture",
          operationResult: {
            providerOrderRef: "paypal_order_1",
            status: "failed_no_charge",
            chargeCertainty: "confirmed_no_charge",
            nextAction: null,
            occurredAt: NOW,
          },
        });
      } else {
        const accepted = system.paymentStore.acceptVerifiedPayment({
          orderRef: created.order.orderRef,
          attemptRef: "attempt_reconciliation_direct_1",
          providerRequestRef: "provider_reconciliation_direct_1",
          receiptType: "capture",
          adapterKey: "paypal_v1",
          paymentMethod: "paypal",
          merchantBindingRef: "paypal_sandbox_primary",
          paymentFact: paymentFact({
            sourceType: "authenticated_capture_response",
            eventDedupeKey: "reconciliation_direct_event_1",
            payloadDigest: CAPTURE_PAYLOAD_DIGEST,
          }),
        });
        system.paymentStore.markOrderReconciliationRequired({
          orderRef: created.order.orderRef,
          receiptRef: accepted.receipt.receiptRef,
        });
      }
      await assert.rejects(
        () => system.coordinator.captureRechargeOrder({
          accountId: "account_1",
          orderRef: created.order.orderRef,
          idempotencyKey: "capture_terminal_1",
        }),
        /payment_reconciliation_required/u,
      );
      assert.equal(system.captureInputs.length, 0);
    } finally {
      system.close();
    }
  }
});

test("direct capture validates every durable payment binding before a pending provider side effect", async () => {
  for (const [field, value] of [
    ["adapterKey", "paypal_v2"],
    ["paymentMethod", "wechat_pay"],
    ["merchantBindingRef", "paypal_sandbox_other"],
  ]) {
    const system = createSystem();
    try {
      const created = await createRechargeOrder(system.coordinator);
      const mismatched = system.createCoordinator({
        capturePaymentFact: null,
        [field]: value,
      });
      const receiptCountBefore = system.database.prepare(`
        select count(*) as count from platform_payment_receipts
      `).get().count;
      await assert.rejects(
        () => mismatched.coordinator.captureRechargeOrder({
          accountId: "account_1",
          orderRef: created.order.orderRef,
          idempotencyKey: `capture_binding_mismatch_${field}`,
        }),
        /payment_fact_mismatch/u,
      );
      assert.equal(mismatched.captureInputs.length, 0);
      assert.equal(system.database.prepare(`
        select count(*) as count from platform_payment_receipts
      `).get().count, receiptCountBefore);
    } finally {
      system.close();
    }
  }
});

test("a Wallet response missing either persisted reference cannot close an order as credited", async () => {
  for (const response of [
    { operationRef: undefined },
    { resultRef: undefined },
  ]) {
    const system = createSystem({ walletResponseOverrides: response });
    try {
      const created = await createRechargeOrder(system.coordinator);
      await assert.rejects(
        () => system.coordinator.acceptProviderCallback(CALLBACK_INPUT),
        /payment_order_close_failed/u,
      );
      const order = system.coordinator.getRechargeOrder({
        accountId: "account_1",
        orderRef: created.order.orderRef,
      });
      assert.equal(order.status, "payment_verified");
      assert.equal(order.walletOperationRef, null);
      assert.equal(order.walletLotRef, null);
    } finally {
      system.close();
    }
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


test("referral observer runs only after durable closure and a reward failure preserves successful recharge", async () => {
  let observed = 0;
  const system = createSystem({onCredited(accountId) {
    assert.equal(accountId, "account_1");
    assert.equal(system.database.prepare("select status from platform_payment_orders").get().status, "credited");
    observed += 1;
    throw new Error("synthetic_referral_failure");
  }});
  try {
    await createRechargeOrder(system.coordinator);
    await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.equal(observed, 1);
    assert.equal(system.database.prepare("select count(*) n from platform_coin_lots").get().n, 1);
    await system.coordinator.acceptProviderCallback(CALLBACK_INPUT);
    assert.equal(observed, 2);
    assert.equal(system.database.prepare("select count(*) n from platform_coin_lots").get().n, 1);
  } finally {system.close();}
});
