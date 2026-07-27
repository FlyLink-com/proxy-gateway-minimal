import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinCommerceStore
} from "../services/platform/coin-commerce-store.mjs";

const CLOCK = "2026-07-26T12:34:56.000Z";
const COMMERCE_TABLES = [
  "platform_coin_commerce_offer_versions",
  "platform_coin_commerce_quotes",
  "platform_coin_commerce_orders",
  "platform_coin_commerce_operation_receipts",
  "platform_coin_commerce_order_events",
  "platform_coin_commerce_fulfillment_commands",
  "platform_coin_commerce_fulfillment_receipts"
];

function refFactory() {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_${count}`;
  };
}

function fixedClockDatabase(database, clock) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            return { pluck: () => ({ get: () => clock.value }) };
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function createSchema(dbPath) {
  const database = new Database(dbPath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    )
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(CLOCK)
  });
  applyCoinCommerceMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(CLOCK)
  });
  return database;
}

function insertAccount(database, accountId = "acct_synthetic_1") {
  database.prepare(`
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `owner_${accountId}`, CLOCK, CLOCK);
}

function offer(overrides = {}) {
  return {
    offerRef: "offer_monthly_basic",
    offerVersionRef: "offerv_monthly_basic_v1",
    version: 1,
    category: "plan",
    title: { zh: "基础月卡", en: "Basic monthly plan" },
    summary: { zh: "每月 50 GB", en: "50 GB monthly" },
    importantNotices: {
      zh: ["仅用于平台自营服务"],
      en: ["For platform-owned services only"]
    },
    baseCoinUnits: 20,
    referencePrice: { currency: "CNY", amountMinor: 2_000 },
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 500
    },
    ...overrides
  };
}

function walletOperation(id) {
  return {
    actorScope: "system:commerce-test",
    idempotencyKey: id,
    actorType: "system",
    actorRef: "commerce_test"
  };
}

function commerceOperation(id, accountId = "acct_synthetic_1") {
  return {
    actorScope: `portal:${accountId}`,
    idempotencyKey: id,
    actorType: "portal_user",
    actorRef: accountId
  };
}

function credit(store, {
  coinType,
  amountUnits,
  suffix,
  availability = "available",
  expiresAt = null
}) {
  const credited = store.walletStore.creditCoins({
    accountId: "acct_synthetic_1",
    coinType,
    amountUnits,
    availability,
    sourceType: "synthetic_seed",
    sourceRef: `source_${suffix}`,
    sourceDigest: suffix.padEnd(64, "0").slice(0, 64),
    policyRef: coinType === "reward_coins" ? "reward_policy" : null,
    policyVersion: coinType === "reward_coins" ? 1 : null,
    expiresAt,
    operation: walletOperation(`credit_${suffix}`)
  });
  if (availability === "pending") {
    store.walletStore.confirmCoinCredit({
      lotRef: credited.resultRef,
      amountUnits,
      operation: walletOperation(`confirm_${suffix}`)
    });
  }
}

function seedWallet(store) {
  credit(store, {
    coinType: "bonus_coins",
    amountUnits: 5,
    suffix: "bonus",
    expiresAt: "2099-01-01T00:00:00.000Z"
  });
  credit(store, { coinType: "paid_coins", amountUnits: 20, suffix: "paid" });
  credit(store, {
    coinType: "reward_coins",
    amountUnits: 10,
    suffix: "reward",
    availability: "pending"
  });
}

function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-store-test-"));
  const dbPath = join(directory, "commerce.sqlite");
  const database = createSchema(dbPath);
  insertAccount(database);
  const clock = { value: CLOCK };
  const store = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(database, clock),
    commerceRefFactory: refFactory(),
    walletRefFactory: refFactory(),
    ...options
  });
  return {
    directory,
    dbPath,
    database,
    clock,
    store,
    close() {
      store.close();
      database.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  };
}

function commerceCounts(database) {
  return Object.fromEntries(COMMERCE_TABLES.map((table) => [
    table,
    database.prepare(`select count(*) from ${table}`).pluck().get()
  ]));
}

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, "Coin commerce store operation rejected");
    assert.equal(JSON.stringify(error).includes("SQLITE"), false);
    return true;
  });
}

function publishAndQuote(state) {
  state.store.publishOfferVersion(offer());
  return state.store.createCheckoutQuote({
    accountId: "acct_synthetic_1",
    offerRef: "offer_monthly_basic"
  });
}

function confirm(state, quote, key = "confirm_1") {
  return state.store.confirmOrder({
    accountId: "acct_synthetic_1",
    quoteRef: quote.quoteRef,
    operation: commerceOperation(key)
  });
}

test("factory enforces exact ownership, schemas, connection settings, and surface", () => {
  expectCode(() => createSqliteCoinCommerceStore(), "invalid_store_contract");
  const invalid = new Database(":memory:");
  try {
    invalid.pragma("foreign_keys = ON");
    expectCode(
      () => createSqliteCoinCommerceStore({ database: invalid }),
      "coin_wallet_schema_not_ready"
    );
  } finally {
    invalid.close();
  }

  const state = fixture();
  try {
    assert.deepEqual(Reflect.ownKeys(state.store), [
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
    ]);
    assert.equal("database" in state.store, false);
    assert.equal("transaction" in state.store, false);
    state.store.close();
    state.store.close();
    assert.equal(state.database.open, true);
    expectCode(
      () => state.store.listPublishedOffers({ accountId: "acct_synthetic_1" }),
      "commerce_store_closed"
    );
  } finally {
    state.database.close();
    rmSync(state.directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("trusted Offer bootstrap is versioned, replay-safe, global, and receipt-free", () => {
  const state = fixture();
  try {
    insertAccount(state.database, "acct_synthetic_2");
    const published = state.store.publishOfferVersion(offer());
    assert.deepEqual(published, offer());
    assert.deepEqual(state.store.publishOfferVersion(offer()), offer());
    assert.equal(commerceCounts(state.database).platform_coin_commerce_operation_receipts, 0);
    assert.deepEqual(
      state.store.listPublishedOffers({ accountId: "acct_synthetic_2" }),
      [offer()]
    );
    expectCode(
      () => state.store.publishOfferVersion(offer({ title: { zh: "漂移", en: "Drift" } })),
      "offer_unavailable"
    );
    assert.deepEqual(state.store.retireOfferVersion({
      offerRef: offer().offerRef,
      offerVersionRef: offer().offerVersionRef
    }), offer());
    assert.deepEqual(state.store.retireOfferVersion({
      offerRef: offer().offerRef,
      offerVersionRef: offer().offerVersionRef
    }), offer());
    const v2 = offer({
      offerVersionRef: "offerv_monthly_basic_v2",
      version: 2
    });
    assert.deepEqual(state.store.publishOfferVersion(v2), v2);
    assert.deepEqual(
      state.store.getPublishedOffer({
        accountId: "acct_synthetic_1",
        offerRef: offer().offerRef
      }),
      v2
    );
  } finally {
    state.close();
  }
});

test("Quote reads discount outside the transaction and returns an exact lot-free snapshot", () => {
  let observedInTransaction = null;
  const state = fixture({
    discountReader({ accountId, offer: inputOffer, occurredAt }) {
      observedInTransaction = state.database.inTransaction;
      assert.equal(accountId, "acct_synthetic_1");
      assert.deepEqual(inputOffer, offer());
      assert.equal(occurredAt, CLOCK);
      return 500;
    }
  });
  try {
    seedWallet(state.store);
    state.store.publishOfferVersion(offer());
    const quote = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    assert.equal(observedInTransaction, false);
    assert.deepEqual(quote, {
      quoteRef: "quote_1",
      offer: offer(),
      amountUnits: 19,
      appliedDiscountBasisPoints: 500,
      purchaseAvailability: "available",
      shortfallUnits: 0,
      allocation: [
        { coinType: "bonus_coins", amountUnits: 5 },
        { coinType: "paid_coins", amountUnits: 14 }
      ],
      balances: {
        before: {
          bonusCoins: 5,
          paidCoins: 20,
          rewardCoins: 10,
          heldCoins: 0
        },
        after: {
          bonusCoins: 0,
          paidCoins: 6,
          rewardCoins: 10,
          heldCoins: 19
        }
      },
      expiresAt: "2026-07-26T12:39:56.000Z"
    });
    assert.equal(JSON.stringify(quote).includes("lot"), false);
    assert.equal(JSON.stringify(quote).includes("walletVersion"), false);
  } finally {
    state.close();
  }
});

test("missing and insufficient Wallets persist only non-confirmable Quotes", () => {
  const state = fixture();
  try {
    state.store.publishOfferVersion(offer());
    const missing = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    assert.equal(missing.purchaseAvailability, "insufficient_balance");
    assert.equal(missing.shortfallUnits, 20);
    assert.deepEqual(missing.allocation, []);
    assert.deepEqual(missing.balances.before, missing.balances.after);
    expectCode(
      () => confirm(state, missing),
      "insufficient_coins"
    );
    const counts = commerceCounts(state.database);
    assert.equal(counts.platform_coin_commerce_quotes, 1);
    assert.equal(counts.platform_coin_commerce_orders, 0);
    assert.equal(counts.platform_coin_commerce_operation_receipts, 0);
    assert.equal(counts.platform_coin_commerce_fulfillment_commands, 0);
    assert.equal(
      state.database.prepare("select count(*) from platform_coin_holds").pluck().get(),
      0
    );
  } finally {
    state.close();
  }
});

test("frozen Wallet and asynchronous or invalid discounts fail closed without a Quote", () => {
  const asyncState = fixture({ discountReader: () => Promise.resolve(0) });
  try {
    asyncState.store.publishOfferVersion(offer());
    expectCode(
      () => asyncState.store.createCheckoutQuote({
        accountId: "acct_synthetic_1",
        offerRef: "offer_monthly_basic"
      }),
      "commerce_infrastructure_error"
    );
    assert.equal(commerceCounts(asyncState.database).platform_coin_commerce_quotes, 0);
  } finally {
    asyncState.close();
  }

  const state = fixture();
  try {
    seedWallet(state.store);
    state.store.publishOfferVersion(offer());
    state.database.prepare(
      "update platform_coin_wallets set status = 'frozen' where account_id = ?"
    ).run("acct_synthetic_1");
    expectCode(
      () => state.store.createCheckoutQuote({
        accountId: "acct_synthetic_1",
        offerRef: "offer_monthly_basic"
      }),
      "wallet_not_active"
    );
    assert.equal(commerceCounts(state.database).platform_coin_commerce_quotes, 0);
  } finally {
    state.close();
  }
});

test("confirm consumes the exact Quote, creates one Hold and safe Order, and replays", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const quote = publishAndQuote(state);
    const order = confirm(state, quote);
    assert.deepEqual(order, {
      orderRef: "order_1",
      offer: offer(),
      amountUnits: 20,
      allocation: [
        { coinType: "bonus_coins", amountUnits: 5 },
        { coinType: "paid_coins", amountUnits: 15 }
      ],
      paymentStatus: "held",
      cancelUntil: "2026-07-26T12:34:59.000Z",
      fulfillment: { status: "not_requested", safeCode: null },
      createdAt: CLOCK,
      updatedAt: CLOCK
    });
    assert.deepEqual(confirm(state, quote), order);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_orders"
    ).pluck().get(), 1);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_holds"
    ).pluck().get(), 1);
    assert.equal(JSON.stringify(order).includes("holdRef"), false);
    assert.equal(JSON.stringify(order).includes("wallet"), false);
    expectCode(
      () => state.store.confirmOrder({
        accountId: "acct_synthetic_1",
        quoteRef: "quote_drift",
        operation: commerceOperation("confirm_1")
      }),
      "idempotency_key_reused"
    );
  } finally {
    state.close();
  }
});

test("confirm rejects stale Wallet versions and cross-account references without writes", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const quote = publishAndQuote(state);
    credit(state.store, { coinType: "paid_coins", amountUnits: 1, suffix: "later" });
    const before = commerceCounts(state.database);
    expectCode(() => confirm(state, quote), "quote_stale");
    assert.deepEqual(commerceCounts(state.database), before);

    insertAccount(state.database, "acct_synthetic_2");
    expectCode(
      () => state.store.confirmOrder({
        accountId: "acct_synthetic_2",
        quoteRef: quote.quoteRef,
        operation: commerceOperation("cross", "acct_synthetic_2")
      }),
      "commerce_not_found"
    );
  } finally {
    state.close();
  }
});

test("cancel releases strictly before the boundary and same-key replay is stable", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    const cancelled = state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_1")
    });
    assert.equal(cancelled.paymentStatus, "cancelled");
    assert.equal(
      state.store.walletStore.getWalletProjection({
        accountId: "acct_synthetic_1"
      }).heldUnits,
      0
    );
    assert.deepEqual(state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_1")
    }), cancelled);

    const quote2 = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    const order2 = confirm(state, quote2, "confirm_2");
    state.clock.value = order2.cancelUntil;
    expectCode(
      () => state.store.cancelOrder({
        accountId: "acct_synthetic_1",
        orderRef: order2.orderRef,
        operation: commerceOperation("cancel_equality")
      }),
      "cancel_window_closed"
    );
  } finally {
    state.close();
  }
});

test("capture uses two durable stages and atomically creates one deterministic outbox", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    assert.deepEqual(state.store.claimDueCaptures({ limit: 10 }), [
      { orderRef: order.orderRef }
    ]);
    assert.equal(state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef
    }).paymentStatus, "capture_pending");
    const captured = state.store.captureClaimedOrder({ orderRef: order.orderRef });
    assert.equal(captured.paymentStatus, "captured");
    assert.equal(captured.fulfillment.status, "pending");
    assert.deepEqual(
      state.store.captureClaimedOrder({ orderRef: order.orderRef }),
      captured
    );
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_commands"
    ).pluck().get(), 1);
    assert.equal(state.store.walletStore.getWalletProjection({
      accountId: "acct_synthetic_1"
    }).heldUnits, 0);
    expectCode(
      () => state.store.cancelOrder({
        accountId: "acct_synthetic_1",
        orderRef: order.orderRef,
        operation: commerceOperation("late_cancel")
      }),
      "capture_in_progress"
    );
  } finally {
    state.close();
  }
});

test("expired Hold capture is isolated without fulfillment", () => {
  const state = fixture({ cancelWindowMs: 1 });
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    const hold = state.database.prepare(`
      select h.* from platform_coin_holds h
      join platform_coin_commerce_orders o on o.hold_ref = h.hold_ref
      where o.order_ref = ?
    `).get(order.orderRef);
    state.clock.value = hold.expires_at;
    state.database.prepare(`
      update platform_coin_commerce_orders
         set payment_status = 'capture_pending'
       where order_ref = ?
    `).run(order.orderRef);
    const isolated = state.store.captureClaimedOrder({ orderRef: order.orderRef });
    assert.equal(isolated.paymentStatus, "reconciliation_required");
    assert.equal(isolated.fulfillment.status, "not_requested");
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_commands"
    ).pluck().get(), 0);
    assert.equal(state.store.walletStore.getHold(hold.hold_ref).status, "released");
  } finally {
    state.close();
  }
});

test("outbox leases fence stale workers, complete atomically, and fail only once", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    const first = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.match(first.leaseToken, /^[0-9a-f]{64}$/);
    assert.deepEqual(Reflect.ownKeys(first), [
      "commandRef",
      "orderRef",
      "accountId",
      "delivery",
      "leaseGeneration",
      "leaseToken"
    ]);
    state.clock.value = "2026-07-26T12:35:00.000Z";
    const second = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.equal(second.leaseGeneration, first.leaseGeneration + 1);
    assert.notEqual(second.leaseToken, first.leaseToken);
    expectCode(
      () => state.store.completeFulfillmentCommand({
        commandRef: first.commandRef,
        leaseGeneration: first.leaseGeneration,
        leaseToken: first.leaseToken,
        effectRef: "effect_old",
        status: "delivered"
      }),
      "commerce_fulfillment_lease_lost"
    );
    const delivered = state.store.completeFulfillmentCommand({
      commandRef: second.commandRef,
      leaseGeneration: second.leaseGeneration,
      leaseToken: second.leaseToken,
      effectRef: "effect_final",
      status: "delivered"
    });
    assert.deepEqual(delivered, { status: "delivered" });
    assert.deepEqual(state.store.completeFulfillmentCommand({
      commandRef: second.commandRef,
      leaseGeneration: second.leaseGeneration,
      leaseToken: second.leaseToken,
      effectRef: "effect_final",
      status: "delivered"
    }), delivered);
    expectCode(
      () => state.store.completeFulfillmentCommand({
        commandRef: second.commandRef,
        leaseGeneration: second.leaseGeneration,
        leaseToken: second.leaseToken,
        effectRef: "effect_drift",
        status: "delivered"
      }),
      "commerce_fulfillment_lease_lost"
    );
  } finally {
    state.close();
  }
});

test("failed fulfillment has no receipt and repeated fail loses the lease", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    const command = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.deepEqual(state.store.failFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken,
      safeCode: "fulfillment_handler_failed"
    }), {
      status: "failed",
      safeCode: "fulfillment_handler_failed"
    });
    expectCode(
      () => state.store.failFulfillmentCommand({
        commandRef: command.commandRef,
        leaseGeneration: command.leaseGeneration,
        leaseToken: command.leaseToken,
        safeCode: "fulfillment_handler_failed"
      }),
      "commerce_fulfillment_lease_lost"
    );
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_receipts"
    ).pluck().get(), 0);
  } finally {
    state.close();
  }
});

test("bounded recovery returns aggregate-only buckets and repairs a missing outbox", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    state.database.prepare(
      "delete from platform_coin_commerce_fulfillment_commands where order_ref = ?"
    ).run(order.orderRef);
    const recovered = state.store.recoverNonTerminalOrders({ limit: 10 });
    assert.deepEqual(recovered, {
      scanned: 1,
      readyForCapture: 0,
      captureRecovered: 0,
      outboxRecovered: 1,
      expiredHoldReleased: 0,
      expiredLeaseObserved: 0,
      reconciliationRequired: 0,
      unchanged: 0
    });
    assert.equal(JSON.stringify(recovered).includes(order.orderRef), false);
    assert.equal(state.database.prepare(
      "select count(*) from platform_coin_commerce_fulfillment_commands"
    ).pluck().get(), 1);
  } finally {
    state.close();
  }
});

test("nextWakeAt is reference-free and follows held, pending, and lease boundaries", () => {
  const state = fixture();
  try {
    assert.equal(state.store.nextWakeAt(), null);
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    assert.equal(state.store.nextWakeAt(), order.cancelUntil);
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    assert.equal(state.store.nextWakeAt(), order.cancelUntil);
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    assert.equal(state.store.nextWakeAt(), order.cancelUntil);
    const command = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.equal(state.store.nextWakeAt(), "2026-07-26T12:35:00.000Z");
    assert.equal(JSON.stringify(state.store.nextWakeAt()).includes(command.commandRef), false);
  } finally {
    state.close();
  }
});

test("default references are normalized and a free Quote fails closed before persistence", () => {
  const free = fixture({ discountReader: () => 10_000 });
  try {
    free.store.publishOfferVersion(offer());
    expectCode(
      () => free.store.createCheckoutQuote({
        accountId: "acct_synthetic_1",
        offerRef: "offer_monthly_basic"
      }),
      "commerce_infrastructure_error"
    );
    assert.equal(commerceCounts(free.database).platform_coin_commerce_quotes, 0);
  } finally {
    free.close();
  }

  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-default-ref-test-"));
  const dbPath = join(directory, "commerce.sqlite");
  const database = createSchema(dbPath);
  insertAccount(database);
  database.close();
  const store = createSqliteCoinCommerceStore({ dbPath });
  try {
    store.publishOfferVersion(offer());
    const quote = store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    assert.match(quote.quoteRef, /^quote_[0-9a-f]{32}$/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("recovery of an existing Order never calls commerceRefFactory", () => {
  let blocked = false;
  const refs = refFactory();
  const state = fixture({
    commerceRefFactory(kind) {
      if (blocked) throw new Error("existing Order must not allocate refs");
      return refs(kind);
    }
  });
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    state.database.prepare(
      "delete from platform_coin_commerce_fulfillment_commands where order_ref = ?"
    ).run(order.orderRef);
    blocked = true;
    assert.equal(
      state.store.recoverNonTerminalOrders({ limit: 1 }).outboxRecovered,
      1
    );
  } finally {
    state.close();
  }
});

test("claim isolates counter overflow without issuing a lease", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    state.database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set attempt_count = 2147483647,
             lease_generation = 2147483647
       where order_ref = ?
    `).run(order.orderRef);
    assert.equal(
      state.store.claimNextFulfillmentCommand({ leaseMs: 1 }),
      null
    );
    assert.deepEqual(state.database.prepare(`
      select status, safe_failure_code
        from platform_coin_commerce_fulfillment_commands
       where order_ref = ?
    `).get(order.orderRef), {
      status: "failed",
      safe_failure_code: "fulfillment_attempt_limit"
    });
  } finally {
    state.close();
  }
});

test("construction rejects schema-valid but unsafe outbox payloads and lease tokens", () => {
  for (const corrupt of [
    (database) => database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set payload_json = '{}'
    `).run(),
    (database) => database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set status = 'processing',
             lease_token = 'not-hex',
             lease_until = ?
    `).run(CLOCK)
  ]) {
    const state = fixture();
    try {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
      state.store.captureClaimedOrder({ orderRef: order.orderRef });
      state.store.close();
      corrupt(state.database);
      expectCode(
        () => createSqliteCoinCommerceStore({ database: state.database }),
        "commerce_infrastructure_error"
      );
    } finally {
      state.database.close();
      rmSync(state.directory, { recursive: true, force: true, maxRetries: 3 });
    }
  }
});

test("construction rejects more than one immutable receipt for one command", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    state.store.captureClaimedOrder({ orderRef: order.orderRef });
    const command = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    state.store.completeFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken,
      effectRef: "effect_first",
      status: "delivered"
    });
    state.store.close();
    state.database.prepare(`
      insert into platform_coin_commerce_fulfillment_receipts
        (receipt_ref, command_ref, effect_ref, status, safe_code, recorded_at)
      values ('fulfillment_receipt_extra', ?, 'effect_second', 'delivered', null, ?)
    `).run(command.commandRef, state.clock.value);
    expectCode(
      () => createSqliteCoinCommerceStore({ database: state.database }),
      "commerce_infrastructure_error"
    );
  } finally {
    state.database.close();
    rmSync(state.directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
