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
const WALLET_FINANCIAL_TABLES = [
  "platform_coin_wallets",
  "platform_coin_lots",
  "platform_coin_credit_origins",
  "platform_coin_holds",
  "platform_coin_hold_allocations",
  "platform_coin_operation_receipts",
  "platform_coin_ledger_entries",
];

function refFactory() {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_${count}`;
  };
}

function fixedClockDatabase(database, clock, onPrepare = () => {}) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          onPrepare(sql);
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
  accountId = "acct_synthetic_1",
  coinType,
  amountUnits,
  suffix,
  availability = "available",
  expiresAt = null
}) {
  const credited = store.walletStore.creditCoins({
    accountId,
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
  return credited;
}

function seedWallet(
  store,
  accountId = "acct_synthetic_1",
  suffixPrefix = ""
) {
  const suffix = (value) => suffixPrefix ? `${suffixPrefix}_${value}` : value;
  const first = credit(store, {
    accountId,
    coinType: "bonus_coins",
    amountUnits: 5,
    suffix: suffix("bonus"),
    expiresAt: "2099-01-01T00:00:00.000Z"
  });
  credit(store, {
    accountId,
    coinType: "paid_coins",
    amountUnits: 20,
    suffix: suffix("paid")
  });
  credit(store, {
    accountId,
    coinType: "reward_coins",
    amountUnits: 10,
    suffix: suffix("reward"),
    availability: "pending"
  });
  return first.walletRef;
}

function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-store-test-"));
  const dbPath = join(directory, "commerce.sqlite");
  const database = createSchema(dbPath);
  insertAccount(database);
  const clock = { value: CLOCK };
  const preparedSql = [];
  const store = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(
      database,
      clock,
      (sql) => preparedSql.push(sql)
    ),
    commerceRefFactory: refFactory(),
    walletRefFactory: refFactory(),
    ...options
  });
  return {
    directory,
    dbPath,
    database,
    clock,
    preparedSql,
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

function snapshotTables(database, tables) {
  return Object.fromEntries(tables.map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

function dropTableTriggers(database, table) {
  const names = database.prepare(`
    select name from sqlite_master
     where type = 'trigger' and tbl_name = ?
  `).all(table);
  for (const { name } of names) {
    database.exec(`drop trigger "${name.replaceAll("\"", "\"\"")}"`);
  }
}

function mutateOrderSnapshot(state, sql, ...parameters) {
  state.database.exec(
    "drop trigger coin_commerce_orders_snapshot_immutable_update"
  );
  state.database.prepare(sql).run(...parameters);
  state.database.exec(`
    create trigger coin_commerce_orders_snapshot_immutable_update
    before update of
      order_ref,
      account_id,
      quote_ref,
      offer_version_ref,
      hold_ref,
      amount_units,
      offer_snapshot_json,
      allocation_snapshot_json,
      cancel_until,
      created_at
    on platform_coin_commerce_orders
    begin
      select raise(abort, 'coin_commerce_order_snapshot_immutable');
    end
  `);
}

function attachForeignHold(state, order, { captured = false } = {}) {
  const accountId = "acct_synthetic_2";
  insertAccount(state.database, accountId);
  const walletRef = seedWallet(state.store, accountId, "foreign");
  const hold = state.store.walletStore.createCoinHold({
    walletRef,
    purpose: "product_purchase",
    purposeRef: order.orderRef,
    amountUnits: order.amountUnits,
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    expiresAt: "2099-01-01T00:00:00.000Z",
    operation: walletOperation("foreign_hold")
  });
  if (captured) {
    state.store.walletStore.captureCoinHold({
      holdRef: hold.resultRef,
      operation: walletOperation("foreign_capture")
    });
  }
  mutateOrderSnapshot(state, `
    update platform_coin_commerce_orders
       set hold_ref = ?
     where order_ref = ?
  `, hold.resultRef, order.orderRef);
  return { accountId, holdRef: hold.resultRef };
}

function captureToOutbox(state) {
  seedWallet(state.store);
  const order = confirm(state, publishAndQuote(state));
  state.clock.value = order.cancelUntil;
  state.store.claimDueCaptures({ limit: 1 });
  state.store.captureClaimedOrder({ orderRef: order.orderRef });
  return {
    order,
    command: state.database.prepare(`
      select * from platform_coin_commerce_fulfillment_commands
       where order_ref = ?
    `).get(order.orderRef)
  };
}

function holdForOrder(state, orderRef) {
  return state.database.prepare(`
    select h.*
      from platform_coin_holds h
      join platform_coin_commerce_orders o on o.hold_ref = h.hold_ref
     where o.order_ref = ?
  `).get(orderRef);
}

function assertSingleRecoveryBucket(result, bucket) {
  const buckets = [
    "readyForCapture",
    "captureRecovered",
    "outboxRecovered",
    "expiredHoldReleased",
    "expiredLeaseObserved",
    "reconciliationRequired",
    "unchanged"
  ];
  assert.equal(result.scanned, 1);
  for (const name of buckets) {
    assert.equal(result[name], name === bucket ? 1 : 0, name);
  }
  assert.equal(
    buckets.reduce((sum, name) => sum + result[name], 0),
    result.scanned
  );
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
      "listOrders",
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

test("listOrders is account-owned, deterministically paged, bounded, query-constant, and read-only", () => {
  const state = fixture();
  try {
    insertAccount(state.database, "acct_synthetic_2");
    state.store.publishOfferVersion(offer());
    credit(state.store, {
      accountId: "acct_synthetic_1",
      coinType: "paid_coins",
      amountUnits: 100,
      suffix: "list_owner"
    });
    credit(state.store, {
      accountId: "acct_synthetic_2",
      coinType: "paid_coins",
      amountUnits: 100,
      suffix: "list_other"
    });

    const createOrder = (accountId, createdAt, key) => {
      state.clock.value = createdAt;
      const quote = state.store.createCheckoutQuote({
        accountId,
        offerRef: "offer_monthly_basic"
      });
      return state.store.confirmOrder({
        accountId,
        quoteRef: quote.quoteRef,
        operation: commerceOperation(key, accountId)
      });
    };
    const oldest = createOrder(
      "acct_synthetic_1",
      "2026-07-26T12:34:54.000Z",
      "list_owner_oldest"
    );
    const tiedLowerRef = createOrder(
      "acct_synthetic_1",
      "2026-07-26T12:34:56.000Z",
      "list_owner_tied_lower"
    );
    const tiedHigherRef = createOrder(
      "acct_synthetic_1",
      "2026-07-26T12:34:56.000Z",
      "list_owner_tied_higher"
    );
    createOrder(
      "acct_synthetic_2",
      "2026-07-26T12:34:57.000Z",
      "list_other_newest"
    );

    const before = snapshotTables(
      state.database,
      [...COMMERCE_TABLES, ...WALLET_FINANCIAL_TABLES]
    );
    state.preparedSql.length = 0;
    const firstPage = state.store.listOrders({
      accountId: "acct_synthetic_1",
      limit: 2
    });
    assert.deepEqual(
      firstPage.orders.map((order) => order.orderRef),
      [tiedHigherRef.orderRef, tiedLowerRef.orderRef]
    );
    assert.deepEqual(firstPage.nextCursor, {
      afterCreatedAt: tiedLowerRef.createdAt,
      afterOrderRef: tiedLowerRef.orderRef
    });
    assert.equal(state.preparedSql.length, 2);
    assert.equal(
      state.preparedSql.filter(
        (sql) => /platform_coin_commerce_fulfillment_commands/i.test(sql)
      ).length,
      1
    );

    const continuation = state.store.listOrders({
      accountId: "acct_synthetic_1",
      limit: 2,
      afterCreatedAt: firstPage.nextCursor.afterCreatedAt,
      afterOrderRef: firstPage.nextCursor.afterOrderRef
    });
    assert.deepEqual(
      continuation.orders.map((order) => order.orderRef),
      [oldest.orderRef]
    );
    assert.equal(continuation.nextCursor, null);

    const one = state.store.listOrders({
      accountId: "acct_synthetic_1",
      limit: 1
    });
    assert.deepEqual(
      one.orders.map((order) => order.orderRef),
      [tiedHigherRef.orderRef]
    );
    assert.deepEqual(one.nextCursor, {
      afterCreatedAt: tiedHigherRef.createdAt,
      afterOrderRef: tiedHigherRef.orderRef
    });
    assert.equal(
      state.store.listOrders({
        accountId: "acct_synthetic_1",
        limit: 100
      }).orders.length,
      3
    );

    for (const limit of [0, 101]) {
      expectCode(() => state.store.listOrders({
        accountId: "acct_synthetic_1",
        limit
      }), "invalid_pagination");
    }
    for (const input of [
      {
        accountId: "acct_synthetic_1",
        limit: 2,
        afterCreatedAt: tiedLowerRef.createdAt
      },
      {
        accountId: "acct_synthetic_1",
        limit: 2,
        afterOrderRef: tiedLowerRef.orderRef
      },
      {
        accountId: "acct_synthetic_1",
        limit: 2,
        afterCreatedAt: "2026-07-26T12:34:56Z",
        afterOrderRef: tiedLowerRef.orderRef
      },
      {
        accountId: "acct_synthetic_1",
        limit: 2,
        afterCreatedAt: tiedLowerRef.createdAt,
        afterOrderRef: "ORDER_UNSAFE"
      }
    ]) {
      expectCode(() => state.store.listOrders(input), "invalid_pagination");
    }
    expectCode(() => state.store.listOrders({
      accountId: "acct_synthetic_1",
      limit: 2,
      unknown: true
    }), "invalid_store_contract");
    assert.deepEqual(
      snapshotTables(
        state.database,
        [...COMMERCE_TABLES, ...WALLET_FINANCIAL_TABLES]
      ),
      before
    );
  } finally {
    state.close();
  }
});

test("listOrders projects valid delivered and failed fulfillment with one bounded query", () => {
  for (const terminalStatus of ["delivered", "failed"]) {
    const state = fixture();
    try {
      const { order } = captureToOutbox(state);
      const claimed = state.store.claimNextFulfillmentCommand({
        leaseMs: 1000
      });
      if (terminalStatus === "delivered") {
        state.store.completeFulfillmentCommand({
          commandRef: claimed.commandRef,
          leaseGeneration: claimed.leaseGeneration,
          leaseToken: claimed.leaseToken,
          effectRef: "effect_list_valid_delivered",
          status: "delivered"
        });
      } else {
        state.store.failFulfillmentCommand({
          commandRef: claimed.commandRef,
          leaseGeneration: claimed.leaseGeneration,
          leaseToken: claimed.leaseToken,
          safeCode: "fulfillment_handler_failed"
        });
      }
      const expected = state.store.getOrder({
        accountId: "acct_synthetic_1",
        orderRef: order.orderRef
      });

      state.preparedSql.length = 0;
      assert.deepEqual(state.store.listOrders({
        accountId: "acct_synthetic_1",
        limit: 100
      }), {
        orders: [expected],
        nextCursor: null
      });
      assert.equal(state.preparedSql.length, 2, terminalStatus);
    } finally {
      state.close();
    }
  }
});

test("listOrders fails closed on command state drift and missing delivered receipt without N+1", () => {
  for (const corruption of ["held_with_pending_command", "delivered_without_receipt"]) {
    const state = fixture();
    try {
      const { order } = captureToOutbox(state);
      if (corruption === "held_with_pending_command") {
        dropTableTriggers(
          state.database,
          "platform_coin_commerce_orders"
        );
        state.database.prepare(`
          update platform_coin_commerce_orders
             set payment_status = 'held'
           where order_ref = ?
        `).run(order.orderRef);
      } else {
        const claimed = state.store.claimNextFulfillmentCommand({
          leaseMs: 1000
        });
        state.store.completeFulfillmentCommand({
          commandRef: claimed.commandRef,
          leaseGeneration: claimed.leaseGeneration,
          leaseToken: claimed.leaseToken,
          effectRef: "effect_list_missing_receipt",
          status: "delivered"
        });
        dropTableTriggers(
          state.database,
          "platform_coin_commerce_fulfillment_receipts"
        );
        state.database.prepare(`
          delete from platform_coin_commerce_fulfillment_receipts
           where command_ref = ?
        `).run(claimed.commandRef);
      }

      state.preparedSql.length = 0;
      expectCode(() => state.store.listOrders({
        accountId: "acct_synthetic_1",
        limit: 100
      }), "commerce_infrastructure_error");
      assert.equal(state.preparedSql.length, 2, corruption);
    } finally {
      state.close();
    }
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

test("discount reader rejects every closed invalid boundary before Quote persistence", () => {
  for (const discountReader of [
    () => -1,
    () => 10_001,
    () => Number.MAX_SAFE_INTEGER + 1,
    () => Promise.resolve(0)
  ]) {
    const state = fixture({ discountReader });
    try {
      seedWallet(state.store);
      state.store.publishOfferVersion(offer());
      expectCode(() => state.store.createCheckoutQuote({
        accountId: "acct_synthetic_1",
        offerRef: "offer_monthly_basic"
      }), "commerce_infrastructure_error");
      assert.equal(
        commerceCounts(state.database).platform_coin_commerce_quotes,
        0
      );
    } finally {
      state.close();
    }
  }
});

test("active Quote confirms one millisecond before expiry and expires at equality", () => {
  for (const boundary of ["before", "equal"]) {
    const state = fixture();
    try {
      seedWallet(state.store);
      const quote = publishAndQuote(state);
      state.clock.value = boundary === "before"
        ? "2026-07-26T12:39:55.999Z"
        : "2026-07-26T12:39:56.000Z";
      if (boundary === "before") {
        assert.equal(confirm(state, quote).paymentStatus, "held");
      } else {
        expectCode(() => confirm(state, quote), "quote_expired");
        assert.equal(state.database.prepare(`
          select status from platform_coin_commerce_quotes
           where quote_ref = ?
        `).pluck().get(quote.quoteRef), "active");
      }
    } finally {
      state.close();
    }
  }
});

test("frozen and closed Wallets reject confirmation without Commerce writes", () => {
  for (const status of ["frozen", "closed"]) {
    const state = fixture();
    try {
      seedWallet(state.store);
      const quote = publishAndQuote(state);
      state.database.prepare(`
        update platform_coin_wallets set status = ? where account_id = ?
      `).run(status, "acct_synthetic_1");
      const before = commerceCounts(state.database);
      expectCode(() => confirm(state, quote), "wallet_not_active");
      assert.deepEqual(commerceCounts(state.database), before);
    } finally {
      state.close();
    }
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

test("confirm reports a missing own idempotency key without reading accessors", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const quote = publishAndQuote(state);
    for (const operation of [
      {
        actorScope: "portal:acct_synthetic_1",
        actorType: "portal_user",
        actorRef: "acct_synthetic_1"
      },
      {}
    ]) {
      expectCode(() => state.store.confirmOrder({
        accountId: "acct_synthetic_1",
        quoteRef: quote.quoteRef,
        operation
      }), "idempotency_key_required");
    }
  } finally {
    state.close();
  }
});

test("confirm replay rejects matching started and failed durable receipts", () => {
  for (const status of ["started", "failed"]) {
    const state = fixture();
    try {
      seedWallet(state.store);
      const quote = publishAndQuote(state);
      confirm(state, quote);
      dropTableTriggers(
        state.database,
        "platform_coin_commerce_operation_receipts"
      );
      state.database.prepare(`
        update platform_coin_commerce_operation_receipts
           set status = ?,
               result_ref = null,
               safe_result_code = ?,
               completed_at = ?
         where operation_type = 'confirm_order'
           and idempotency_key = 'confirm_1'
      `).run(
        status,
        status === "failed" ? "synthetic_failure" : null,
        status === "failed" ? CLOCK : null
      );
      expectCode(
        () => confirm(state, quote),
        "commerce_infrastructure_error"
      );
    } finally {
      state.close();
    }
  }
});

test("confirm replay rejects a malformed succeeded receipt reference", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const quote = publishAndQuote(state);
    confirm(state, quote);
    dropTableTriggers(
      state.database,
      "platform_coin_commerce_operation_receipts"
    );
    state.database.prepare(`
      update platform_coin_commerce_operation_receipts
         set operation_ref = 'bad ref'
       where operation_type = 'confirm_order'
         and idempotency_key = 'confirm_1'
    `).run();
    expectCode(
      () => confirm(state, quote),
      "commerce_infrastructure_error"
    );
  } finally {
    state.close();
  }
});

test("confirm replay rejects malformed and reversed succeeded timestamps", () => {
  for (const timestamps of [
    {
      createdAt: "not-an-iso-time",
      completedAt: CLOCK
    },
    {
      createdAt: "2026-07-26T12:34:57.000Z",
      completedAt: CLOCK
    }
  ]) {
    const state = fixture();
    try {
      seedWallet(state.store);
      const quote = publishAndQuote(state);
      confirm(state, quote);
      dropTableTriggers(
        state.database,
        "platform_coin_commerce_operation_receipts"
      );
      state.database.prepare(`
        update platform_coin_commerce_operation_receipts
           set created_at = ?, completed_at = ?
         where operation_type = 'confirm_order'
           and idempotency_key = 'confirm_1'
      `).run(timestamps.createdAt, timestamps.completedAt);
      expectCode(
        () => confirm(state, quote),
        "commerce_infrastructure_error"
      );
    } finally {
      state.close();
    }
  }
});

test("confirm replay rejects an Order associated with a different Quote", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    state.store.publishOfferVersion(offer());
    const quote1 = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    confirm(state, quote1);
    credit(state.store, {
      coinType: "paid_coins",
      amountUnits: 20,
      suffix: "receipt_second_order"
    });
    const quote2 = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    const order2 = confirm(state, quote2, "confirm_receipt_second");
    dropTableTriggers(
      state.database,
      "platform_coin_commerce_operation_receipts"
    );
    state.database.prepare(`
      update platform_coin_commerce_operation_receipts
         set result_ref = ?
       where operation_type = 'confirm_order'
         and idempotency_key = 'confirm_1'
    `).run(order2.orderRef);

    expectCode(
      () => confirm(state, quote1),
      "commerce_infrastructure_error"
    );
  } finally {
    state.close();
  }
});

test("cancel reports a missing own idempotency key without consuming a receipt", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    const before = commerceCounts(state.database);
    const operation = {
      actorScope: "portal:acct_synthetic_1",
      actorType: "portal_user",
      actorRef: "acct_synthetic_1"
    };
    expectCode(() => state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation
    }), "idempotency_key_required");
    assert.deepEqual(commerceCounts(state.database), before);
  } finally {
    state.close();
  }
});

test("cancel replay rejects matching started and failed durable receipts", () => {
  for (const status of ["started", "failed"]) {
    const state = fixture();
    try {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.store.cancelOrder({
        accountId: "acct_synthetic_1",
        orderRef: order.orderRef,
        operation: commerceOperation("cancel_terminal_shape")
      });
      dropTableTriggers(
        state.database,
        "platform_coin_commerce_operation_receipts"
      );
      state.database.prepare(`
        update platform_coin_commerce_operation_receipts
           set status = ?,
               result_ref = null,
               safe_result_code = ?,
               completed_at = ?
         where operation_type = 'cancel_order'
           and idempotency_key = 'cancel_terminal_shape'
      `).run(
        status,
        status === "failed" ? "synthetic_failure" : null,
        status === "failed" ? CLOCK : null
      );
      expectCode(() => state.store.cancelOrder({
        accountId: "acct_synthetic_1",
        orderRef: order.orderRef,
        operation: commerceOperation("cancel_terminal_shape")
      }), "commerce_infrastructure_error");
    } finally {
      state.close();
    }
  }
});

test("cancel replay rejects an Order association different from the request", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    state.store.publishOfferVersion(offer());
    const quote1 = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    const order1 = confirm(state, quote1);
    credit(state.store, {
      coinType: "paid_coins",
      amountUnits: 20,
      suffix: "cancel_receipt_second_order"
    });
    const quote2 = state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    });
    const order2 = confirm(state, quote2, "confirm_cancel_second");
    state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order1.orderRef,
      operation: commerceOperation("cancel_wrong_association")
    });
    dropTableTriggers(
      state.database,
      "platform_coin_commerce_operation_receipts"
    );
    state.database.prepare(`
      update platform_coin_commerce_operation_receipts
         set result_ref = ?
       where operation_type = 'cancel_order'
         and idempotency_key = 'cancel_wrong_association'
    `).run(order2.orderRef);

    expectCode(() => state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order1.orderRef,
      operation: commerceOperation("cancel_wrong_association")
    }), "commerce_infrastructure_error");
  } finally {
    state.close();
  }
});

test("cancel replay rejects an impossible held Order behind a succeeded receipt", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_impossible_held")
    });
    dropTableTriggers(state.database, "platform_coin_commerce_orders");
    state.database.prepare(`
      update platform_coin_commerce_orders
         set payment_status = 'held'
       where order_ref = ?
    `).run(order.orderRef);

    expectCode(() => state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_impossible_held")
    }), "commerce_infrastructure_error");
  } finally {
    state.close();
  }
});

test("cancel replay accepts a later Wallet release timestamp within the same transaction", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    const lockedTimes = [
      "2026-07-26T12:34:56.100Z",
      "2026-07-26T12:34:56.101Z"
    ];
    let reads = 0;
    Object.defineProperty(state.clock, "value", {
      configurable: true,
      get() {
        const value = lockedTimes[Math.min(reads, lockedTimes.length - 1)];
        reads += 1;
        return value;
      }
    });
    const cancelled = state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_clock_progress")
    });

    assert.deepEqual(state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_clock_progress")
    }), cancelled);
  } finally {
    state.close();
  }
});

test("cancel replay requires a one-to-one release ledger fact for every allocation", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_duplicate_release_lot")
    });
    const ledger = state.database.prepare(`
      select entry_ref, lot_ref, amount_units
        from platform_coin_ledger_entries
       where hold_ref = ?
         and order_ref = ?
         and operation in ('held_to_available', 'held_to_expired')
       order by entry_ref
    `).all(
      state.database.prepare(`
        select hold_ref from platform_coin_commerce_orders where order_ref = ?
      `).pluck().get(order.orderRef),
      order.orderRef
    );
    assert.equal(ledger.length, 2);
    dropTableTriggers(state.database, "platform_coin_ledger_entries");
    state.database.prepare(`
      update platform_coin_ledger_entries
         set lot_ref = ?, amount_units = ?
       where entry_ref = ?
    `).run(ledger[0].lot_ref, ledger[0].amount_units, ledger[1].entry_ref);

    expectCode(() => state.store.cancelOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef,
      operation: commerceOperation("cancel_duplicate_release_lot")
    }), "commerce_infrastructure_error");
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

test("cross-account Hold capture isolates the Order without touching either Wallet", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    const foreign = attachForeignHold(state, order);
    const walletBefore = snapshotTables(state.database, WALLET_FINANCIAL_TABLES);

    const isolated = state.store.captureClaimedOrder({
      orderRef: order.orderRef
    });

    assert.equal(isolated.paymentStatus, "reconciliation_required");
    assert.deepEqual(
      snapshotTables(state.database, WALLET_FINANCIAL_TABLES),
      walletBefore
    );
    assert.equal(
      state.store.walletStore.getHold(foreign.holdRef).status,
      "active"
    );
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_commerce_fulfillment_commands
       where order_ref = ?
    `).pluck().get(order.orderRef), 0);
  } finally {
    state.close();
  }
});

test("cross-account Hold cancel isolates without release or cancel receipt", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    const foreign = attachForeignHold(state, order);
    const walletBefore = snapshotTables(state.database, WALLET_FINANCIAL_TABLES);
    const receiptsBefore = state.database.prepare(`
      select count(*) from platform_coin_commerce_operation_receipts
    `).pluck().get();

    const observed = [];
    for (const key of [
      "cancel_foreign",
      "cancel_foreign",
      "cancel_foreign_different"
    ]) {
      try {
        state.store.cancelOrder({
          accountId: "acct_synthetic_1",
          orderRef: order.orderRef,
          operation: commerceOperation(key)
        });
        observed.push("success");
      } catch (error) {
        observed.push(error?.code);
        assert.equal(
          error?.message,
          "Coin commerce store operation rejected"
        );
      }
    }

    assert.deepEqual(observed, [
      "reconciliation_required",
      "reconciliation_required",
      "reconciliation_required"
    ]);
    assert.deepEqual(
      snapshotTables(state.database, WALLET_FINANCIAL_TABLES),
      walletBefore
    );
    assert.equal(
      state.store.walletStore.getHold(foreign.holdRef).status,
      "active"
    );
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_commerce_operation_receipts
    `).pluck().get(), receiptsBefore);
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_commerce_order_events
       where order_ref = ?
         and event_type = 'reconciliation_required'
    `).pluck().get(order.orderRef), 1);
  } finally {
    state.close();
  }
});

test("restart recovery isolates a cross-account active Hold without Wallet writes", () => {
  const state = fixture();
  let restarted;
  let verification;
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    const foreign = attachForeignHold(state, order);
    state.clock.value = order.cancelUntil;
    const walletBefore = snapshotTables(state.database, WALLET_FINANCIAL_TABLES);
    state.store.close();
    state.database.close();
    restarted = createSqliteCoinCommerceStore({
      dbPath: state.dbPath,
      commerceRefFactory: refFactory(),
      walletRefFactory: refFactory()
    });

    const recovered = restarted.recoverNonTerminalOrders({ limit: 1 });
    verification = new Database(state.dbPath, {
      readonly: true,
      fileMustExist: true
    });

    assert.equal(recovered.scanned, 1);
    assert.equal(recovered.reconciliationRequired, 1);
    assert.equal(recovered.readyForCapture, 0);
    assert.equal(
      Object.entries(recovered)
        .filter(([key]) => key !== "scanned")
        .reduce((sum, [, value]) => sum + value, 0),
      recovered.scanned
    );
    assert.deepEqual(
      snapshotTables(verification, WALLET_FINANCIAL_TABLES),
      walletBefore
    );
    assert.equal(verification.prepare(`
      select status from platform_coin_holds where hold_ref = ?
    `).pluck().get(foreign.holdRef), "active");
    assert.equal(verification.prepare(`
      select payment_status
        from platform_coin_commerce_orders
       where order_ref = ?
    `).pluck().get(order.orderRef), "reconciliation_required");
  } finally {
    verification?.close();
    restarted?.close();
    state.store.close();
    if (state.database.open) state.database.close();
    rmSync(state.directory, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("captured cross-account Hold repair isolates without creating outbox", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    const order = confirm(state, publishAndQuote(state));
    state.clock.value = order.cancelUntil;
    state.store.claimDueCaptures({ limit: 1 });
    const foreign = attachForeignHold(state, order, { captured: true });
    const walletBefore = snapshotTables(state.database, WALLET_FINANCIAL_TABLES);

    const isolated = state.store.captureClaimedOrder({
      orderRef: order.orderRef
    });

    assert.equal(isolated.paymentStatus, "reconciliation_required");
    assert.deepEqual(
      snapshotTables(state.database, WALLET_FINANCIAL_TABLES),
      walletBefore
    );
    assert.equal(
      state.store.walletStore.getHold(foreign.holdRef).status,
      "captured"
    );
    assert.equal(state.database.prepare(`
      select count(*) from platform_coin_commerce_fulfillment_commands
       where order_ref = ?
    `).pluck().get(order.orderRef), 0);
  } finally {
    state.close();
  }
});

test("captured invalid Hold with an existing command isolates without projection rollback", () => {
  const state = fixture();
  try {
    const { order } = captureToOutbox(state);
    const hold = holdForOrder(state, order.orderRef);
    dropTableTriggers(state.database, "platform_coin_holds");
    state.database.prepare(`
      update platform_coin_holds
         set purpose_ref = 'order_invalid_binding'
       where hold_ref = ?
    `).run(hold.hold_ref);
    const walletBefore = snapshotTables(
      state.database,
      WALLET_FINANCIAL_TABLES
    );

    const isolated = state.store.captureClaimedOrder({
      orderRef: order.orderRef
    });

    assert.equal(isolated.paymentStatus, "reconciliation_required");
    assert.deepEqual(isolated.fulfillment, {
      status: "failed",
      safeCode: "fulfillment_result_invalid"
    });
    assert.equal(state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef
    }).paymentStatus, "reconciliation_required");
    assert.deepEqual(
      snapshotTables(state.database, WALLET_FINANCIAL_TABLES),
      walletBefore
    );
  } finally {
    state.close();
  }
});

test("captured isolation quiesces processing and preserves terminal fulfillment history", () => {
  for (const status of ["processing", "failed", "delivered"]) {
    const state = fixture();
    try {
      const { order } = captureToOutbox(state);
      const lease = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      if (status === "failed") {
        state.store.failFulfillmentCommand({
          commandRef: lease.commandRef,
          leaseGeneration: lease.leaseGeneration,
          leaseToken: lease.leaseToken,
          safeCode: "fulfillment_handler_failed"
        });
      } else if (status === "delivered") {
        state.store.completeFulfillmentCommand({
          commandRef: lease.commandRef,
          leaseGeneration: lease.leaseGeneration,
          leaseToken: lease.leaseToken,
          effectRef: "effect_preserved_delivery",
          status: "delivered"
        });
      }
      const commandBefore = state.database.prepare(`
        select * from platform_coin_commerce_fulfillment_commands
         where order_ref = ?
      `).get(order.orderRef);
      const receiptsBefore = state.database.prepare(`
        select * from platform_coin_commerce_fulfillment_receipts
         where command_ref = ?
         order by receipt_ref
      `).all(commandBefore.command_ref);
      const hold = holdForOrder(state, order.orderRef);
      dropTableTriggers(state.database, "platform_coin_holds");
      state.database.prepare(`
        update platform_coin_holds
           set amount_units = amount_units + 1
         where hold_ref = ?
      `).run(hold.hold_ref);
      const walletBefore = snapshotTables(
        state.database,
        WALLET_FINANCIAL_TABLES
      );

      const isolated = state.store.captureClaimedOrder({
        orderRef: order.orderRef
      });

      assert.equal(isolated.paymentStatus, "reconciliation_required");
      const commandAfter = state.database.prepare(`
        select * from platform_coin_commerce_fulfillment_commands
         where order_ref = ?
      `).get(order.orderRef);
      const receiptsAfter = state.database.prepare(`
        select * from platform_coin_commerce_fulfillment_receipts
         where command_ref = ?
         order by receipt_ref
      `).all(commandAfter.command_ref);
      if (status === "processing") {
        assert.equal(commandAfter.status, "failed");
        assert.equal(
          commandAfter.safe_failure_code,
          "fulfillment_result_invalid"
        );
        assert.equal(commandAfter.lease_token, null);
        assert.equal(commandAfter.lease_until, null);
        expectCode(() => state.store.completeFulfillmentCommand({
          commandRef: lease.commandRef,
          leaseGeneration: lease.leaseGeneration,
          leaseToken: lease.leaseToken,
          effectRef: "effect_stale_after_isolation",
          status: "delivered"
        }), "commerce_fulfillment_lease_lost");
      } else {
        assert.deepEqual(commandAfter, commandBefore);
      }
      assert.deepEqual(receiptsAfter, receiptsBefore);
      assert.deepEqual(
        snapshotTables(state.database, WALLET_FINANCIAL_TABLES),
        walletBefore
      );
      assert.equal(state.store.nextWakeAt(), null);
    } finally {
      state.close();
    }
  }
});

test("fulfillment claim isolates an invalid captured Order before granting a lease", () => {
  const state = fixture();
  try {
    const { order } = captureToOutbox(state);
    const hold = holdForOrder(state, order.orderRef);
    dropTableTriggers(state.database, "platform_coin_holds");
    state.database.prepare(`
      update platform_coin_holds
         set purpose_ref = 'order_invalid_claim_binding'
       where hold_ref = ?
    `).run(hold.hold_ref);

    assert.equal(
      state.store.claimNextFulfillmentCommand({ leaseMs: 1000 }),
      null
    );
    const isolated = state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef
    });
    assert.equal(isolated.paymentStatus, "reconciliation_required");
    assert.deepEqual(isolated.fulfillment, {
      status: "failed",
      safeCode: "fulfillment_result_invalid"
    });
    assert.equal(state.store.nextWakeAt(), null);
  } finally {
    state.close();
  }
});

test("nextWakeAt is immediate when a processing command loses its Hold invariant", () => {
  const state = fixture();
  try {
    const { order } = captureToOutbox(state);
    state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    const hold = holdForOrder(state, order.orderRef);
    dropTableTriggers(state.database, "platform_coin_holds");
    state.database.prepare(`
      update platform_coin_holds
         set purpose_ref = 'order_invalid_processing_wake'
       where hold_ref = ?
    `).run(hold.hold_ref);

    assert.equal(state.store.nextWakeAt(), state.clock.value);
  } finally {
    state.close();
  }
});

test("completion and failure isolate a post-claim invalid Hold before losing the old lease", () => {
  for (const callback of ["complete", "fail"]) {
    const state = fixture();
    try {
      const { order } = captureToOutbox(state);
      const lease = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      const hold = holdForOrder(state, order.orderRef);
      dropTableTriggers(state.database, "platform_coin_holds");
      state.database.prepare(`
        update platform_coin_holds
           set purpose_ref = 'order_invalid_${callback}_callback'
         where hold_ref = ?
      `).run(hold.hold_ref);
      const walletBefore = snapshotTables(
        state.database,
        WALLET_FINANCIAL_TABLES
      );

      expectCode(() => {
        if (callback === "complete") {
          state.store.completeFulfillmentCommand({
            commandRef: lease.commandRef,
            leaseGeneration: lease.leaseGeneration,
            leaseToken: lease.leaseToken,
            effectRef: "effect_invalid_post_claim_hold",
            status: "delivered"
          });
        } else {
          state.store.failFulfillmentCommand({
            commandRef: lease.commandRef,
            leaseGeneration: lease.leaseGeneration,
            leaseToken: lease.leaseToken,
            safeCode: "fulfillment_handler_failed"
          });
        }
      }, "commerce_fulfillment_lease_lost");

      const isolated = state.store.getOrder({
        accountId: "acct_synthetic_1",
        orderRef: order.orderRef
      });
      assert.equal(isolated.paymentStatus, "reconciliation_required");
      assert.deepEqual(isolated.fulfillment, {
        status: "failed",
        safeCode: "fulfillment_result_invalid"
      });
      assert.equal(state.database.prepare(`
        select count(*)
          from platform_coin_commerce_fulfillment_receipts
         where command_ref = ?
      `).pluck().get(lease.commandRef), 0);
      assert.deepEqual(
        snapshotTables(state.database, WALLET_FINANCIAL_TABLES),
        walletBefore
      );
    } finally {
      state.close();
    }
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

test("capture succeeds immediately before Hold expiry and isolates at equality", () => {
  for (const boundary of ["before", "equal"]) {
    const state = fixture({ cancelWindowMs: 1 });
    try {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      const expiresAt = state.database.prepare(`
        select h.expires_at
          from platform_coin_holds h
          join platform_coin_commerce_orders o on o.hold_ref = h.hold_ref
         where o.order_ref = ?
      `).pluck().get(order.orderRef);
      state.database.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'capture_pending'
         where order_ref = ?
      `).run(order.orderRef);
      state.clock.value = boundary === "before"
        ? new Date(Date.parse(expiresAt) - 1).toISOString()
        : expiresAt;
      const result = state.store.captureClaimedOrder({
        orderRef: order.orderRef
      });
      assert.equal(
        result.paymentStatus,
        boundary === "before" ? "captured" : "reconciliation_required"
      );
    } finally {
      state.close();
    }
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

test("fulfillment lease is owned immediately before expiry and reclaimable at equality", () => {
  const state = fixture();
  try {
    captureToOutbox(state);
    const first = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    state.clock.value = "2026-07-26T12:34:59.999Z";
    assert.equal(state.store.claimNextFulfillmentCommand({ leaseMs: 1000 }), null);
    state.clock.value = "2026-07-26T12:35:00.000Z";
    const second = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    assert.equal(second.leaseGeneration, first.leaseGeneration + 1);
    assert.notEqual(second.leaseToken, first.leaseToken);
  } finally {
    state.close();
  }
});

test("expired fulfillment leases cannot complete or fail before reclaim", () => {
  for (const callback of ["complete", "fail"]) {
    const state = fixture();
    try {
      captureToOutbox(state);
      const lease = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      state.clock.value = "2026-07-26T12:35:00.000Z";
      expectCode(() => {
        if (callback === "complete") {
          state.store.completeFulfillmentCommand({
            commandRef: lease.commandRef,
            leaseGeneration: lease.leaseGeneration,
            leaseToken: lease.leaseToken,
            effectRef: `effect_expired_${callback}`,
            status: "delivered"
          });
          return;
        }
        state.store.failFulfillmentCommand({
          commandRef: lease.commandRef,
          leaseGeneration: lease.leaseGeneration,
          leaseToken: lease.leaseToken,
          safeCode: "fulfillment_handler_failed"
        });
      }, "commerce_fulfillment_lease_lost");
      assert.deepEqual(state.database.prepare(`
        select status, lease_generation, lease_token, lease_until
          from platform_coin_commerce_fulfillment_commands
         where command_ref = ?
      `).get(lease.commandRef), {
        status: "processing",
        lease_generation: lease.leaseGeneration,
        lease_token: lease.leaseToken,
        lease_until: state.clock.value
      });
      const reclaimed = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      assert.equal(reclaimed.leaseGeneration, lease.leaseGeneration + 1);
      assert.notEqual(reclaimed.leaseToken, lease.leaseToken);
    } finally {
      state.close();
    }
  }
});

test("stale fulfillment generation and token are fenced independently", () => {
  const state = fixture();
  try {
    captureToOutbox(state);
    const command = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    expectCode(() => state.store.completeFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration + 1,
      leaseToken: command.leaseToken,
      effectRef: "effect_stale_generation",
      status: "delivered"
    }), "commerce_fulfillment_lease_lost");
    expectCode(() => state.store.completeFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: "f".repeat(64),
      effectRef: "effect_stale_token",
      status: "delivered"
    }), "commerce_fulfillment_lease_lost");
    assert.deepEqual(state.store.completeFulfillmentCommand({
      commandRef: command.commandRef,
      leaseGeneration: command.leaseGeneration,
      leaseToken: command.leaseToken,
      effectRef: "effect_current",
      status: "delivered"
    }), { status: "delivered" });
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

test("claim rejects a runtime command account mismatch without issuing a lease", () => {
  const state = fixture();
  try {
    const { command } = captureToOutbox(state);
    insertAccount(state.database, "acct_synthetic_2");
    state.database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set account_id = 'acct_synthetic_2'
       where command_ref = ?
    `).run(command.command_ref);
    expectCode(
      () => state.store.claimNextFulfillmentCommand({ leaseMs: 1000 }),
      "commerce_infrastructure_error"
    );
    assert.deepEqual(state.database.prepare(`
      select status, attempt_count, lease_generation, lease_token, lease_until
        from platform_coin_commerce_fulfillment_commands
       where command_ref = ?
    `).get(command.command_ref), {
      status: "pending",
      attempt_count: 0,
      lease_generation: 0,
      lease_token: null,
      lease_until: null
    });
  } finally {
    state.close();
  }
});

test("Order projection rejects a delivered command without its immutable receipt", () => {
  const state = fixture();
  try {
    const { order } = captureToOutbox(state);
    const claimed = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    state.store.completeFulfillmentCommand({
      commandRef: claimed.commandRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      effectRef: "effect_missing_receipt",
      status: "delivered"
    });
    dropTableTriggers(
      state.database,
      "platform_coin_commerce_fulfillment_receipts"
    );
    state.database.prepare(`
      delete from platform_coin_commerce_fulfillment_receipts
       where command_ref = ?
    `).run(claimed.commandRef);
    expectCode(() => state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef
    }), "commerce_infrastructure_error");
  } finally {
    state.close();
  }
});

test("Order projection rejects a non-delivered command carrying a receipt", () => {
  const state = fixture();
  try {
    const { order, command } = captureToOutbox(state);
    state.database.prepare(`
      insert into platform_coin_commerce_fulfillment_receipts
        (receipt_ref, command_ref, effect_ref, status, safe_code, recorded_at)
      values ('receipt_impossible_pending', ?, 'effect_impossible_pending',
              'delivered', null, ?)
    `).run(command.command_ref, CLOCK);
    expectCode(() => state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef
    }), "commerce_infrastructure_error");
  } finally {
    state.close();
  }
});

test("Order projection never exposes an arbitrary runtime failure code", () => {
  const state = fixture();
  try {
    const { order } = captureToOutbox(state);
    const claimed = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
    state.store.failFulfillmentCommand({
      commandRef: claimed.commandRef,
      leaseGeneration: claimed.leaseGeneration,
      leaseToken: claimed.leaseToken,
      safeCode: "fulfillment_handler_failed"
    });
    dropTableTriggers(
      state.database,
      "platform_coin_commerce_fulfillment_commands"
    );
    state.database.prepare(`
      update platform_coin_commerce_fulfillment_commands
         set safe_failure_code = 'raw_runtime_provider_failure'
       where command_ref = ?
    `).run(claimed.commandRef);
    expectCode(() => state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: order.orderRef
    }), "commerce_infrastructure_error");
  } finally {
    state.close();
  }
});

test("runtime command and receipt timestamps are revalidated on every use", () => {
  for (const corrupt of ["command", "receipt"]) {
    const state = fixture();
    try {
      const { order, command } = captureToOutbox(state);
      if (corrupt === "command") {
        state.database.prepare(`
          update platform_coin_commerce_fulfillment_commands
             set updated_at = 'not-an-iso-time'
           where command_ref = ?
        `).run(command.command_ref);
      } else {
        const claimed = state.store.claimNextFulfillmentCommand({
          leaseMs: 1000
        });
        state.store.completeFulfillmentCommand({
          commandRef: claimed.commandRef,
          leaseGeneration: claimed.leaseGeneration,
          leaseToken: claimed.leaseToken,
          effectRef: "effect_bad_receipt_time",
          status: "delivered"
        });
        dropTableTriggers(
          state.database,
          "platform_coin_commerce_fulfillment_receipts"
        );
        state.database.prepare(`
          update platform_coin_commerce_fulfillment_receipts
             set recorded_at = 'not-an-iso-time'
           where command_ref = ?
        `).run(command.command_ref);
      }
      expectCode(() => state.store.getOrder({
        accountId: "acct_synthetic_1",
        orderRef: order.orderRef
      }), "commerce_infrastructure_error");
    } finally {
      state.close();
    }
  }
});

const recoveryScenarios = [
  {
    name: "held due with active unexpired Hold",
    bucket: "readyForCapture",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.clock.value = order.cancelUntil;
    }
  },
  {
    name: "released Hold",
    bucket: "reconciliationRequired",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      const hold = holdForOrder(state, order.orderRef);
      state.store.walletStore.releaseCoinHold({
        holdRef: hold.hold_ref,
        operation: walletOperation("recovery_released_hold")
      });
    }
  },
  {
    name: "missing Hold",
    bucket: "reconciliationRequired",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.database.pragma("foreign_keys = OFF");
      mutateOrderSnapshot(state, `
        update platform_coin_commerce_orders
           set hold_ref = 'hold_missing'
         where order_ref = ?
      `, order.orderRef);
      state.database.pragma("foreign_keys = ON");
    }
  },
  {
    name: "purpose mismatch",
    bucket: "reconciliationRequired",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      const hold = holdForOrder(state, order.orderRef);
      dropTableTriggers(state.database, "platform_coin_holds");
      state.database.prepare(`
        update platform_coin_holds
           set purpose_ref = 'order_other'
         where hold_ref = ?
      `).run(hold.hold_ref);
    }
  },
  {
    name: "amount mismatch",
    bucket: "reconciliationRequired",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      const hold = holdForOrder(state, order.orderRef);
      dropTableTriggers(state.database, "platform_coin_holds");
      state.database.prepare(`
        update platform_coin_holds set amount_units = 19 where hold_ref = ?
      `).run(hold.hold_ref);
    }
  },
  {
    name: "allocation mismatch",
    bucket: "reconciliationRequired",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      mutateOrderSnapshot(state, `
        update platform_coin_commerce_orders
           set allocation_snapshot_json =
             '[{"coinType":"paid_coins","amountUnits":20}]'
         where order_ref = ?
      `, order.orderRef);
    }
  },
  {
    name: "account mismatch",
    bucket: "reconciliationRequired",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      attachForeignHold(state, order);
    }
  },
  {
    name: "expired active Hold",
    bucket: "expiredHoldReleased",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.clock.value = holdForOrder(state, order.orderRef).expires_at;
    }
  },
  {
    name: "capture-pending active Hold",
    bucket: "captureRecovered",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
    }
  },
  {
    name: "capture-pending captured Hold",
    bucket: "captureRecovered",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
      const hold = holdForOrder(state, order.orderRef);
      state.store.walletStore.captureCoinHold({
        holdRef: hold.hold_ref,
        operation: walletOperation("recovery_pre_captured")
      });
    }
  },
  {
    name: "expired processing lease",
    bucket: "expiredLeaseObserved",
    setup(state) {
      captureToOutbox(state);
      state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      state.clock.value = "2026-07-26T12:35:00.000Z";
    }
  },
  {
    name: "legacy capture-failed Order",
    bucket: "captureRecovered",
    setup(state) {
      seedWallet(state.store);
      const order = confirm(state, publishAndQuote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
      state.database.prepare(`
        update platform_coin_commerce_orders
           set payment_status = 'capture_failed'
         where order_ref = ?
      `).run(order.orderRef);
    }
  },
  {
    name: "captured Order missing outbox",
    bucket: "outboxRecovered",
    setup(state) {
      const { order } = captureToOutbox(state);
      state.database.prepare(`
        delete from platform_coin_commerce_fulfillment_commands
         where order_ref = ?
      `).run(order.orderRef);
    }
  },
  {
    name: "captured Order with existing outbox",
    notSelected: true,
    setup(state) {
      captureToOutbox(state);
    }
  }
];

for (const scenario of recoveryScenarios) {
  test(`recovery bucket: ${scenario.name}`, () => {
    const state = fixture();
    try {
      scenario.setup(state);
      if (scenario.notSelected) {
        const before = snapshotTables(
          state.database,
          [...WALLET_FINANCIAL_TABLES, ...COMMERCE_TABLES]
        );
        const result = state.store.recoverNonTerminalOrders({ limit: 1 });
        assertSingleRecoveryBucket(result, "unchanged");
        assert.deepEqual(
          snapshotTables(
            state.database,
            [...WALLET_FINANCIAL_TABLES, ...COMMERCE_TABLES]
          ),
          before
        );
      } else {
        assertSingleRecoveryBucket(
          state.store.recoverNonTerminalOrders({ limit: 1 }),
          scenario.bucket
        );
      }
    } finally {
      state.close();
    }
  });
}

test("bounded recovery does not let an older healthy future Hold starve later actionable work", () => {
  const state = fixture();
  try {
    seedWallet(state.store);
    state.store.publishOfferVersion(offer());
    const older = confirm(state, state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    }));
    credit(state.store, {
      coinType: "paid_coins",
      amountUnits: 20,
      suffix: "recovery_starvation"
    });
    const actionable = confirm(state, state.store.createCheckoutQuote({
      accountId: "acct_synthetic_1",
      offerRef: "offer_monthly_basic"
    }), "confirm_recovery_starvation");
    mutateOrderSnapshot(state, `
      update platform_coin_commerce_orders
         set cancel_until = '2099-01-01T00:00:00.000Z'
       where order_ref = ?
    `, older.orderRef);
    state.clock.value = actionable.cancelUntil;
    assert.deepEqual(state.store.claimDueCaptures({ limit: 1 }), [
      { orderRef: actionable.orderRef }
    ]);

    for (let call = 0; call < 2; call += 1) {
      const recovered = state.store.recoverNonTerminalOrders({ limit: 1 });
      assert.equal(recovered.scanned, 1);
      assert.equal(
        Object.entries(recovered)
          .filter(([key]) => key !== "scanned")
          .reduce((sum, [, value]) => sum + value, 0),
        recovered.scanned
      );
    }

    assert.equal(state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: actionable.orderRef
    }).paymentStatus, "captured");
  } finally {
    state.close();
  }
});

test("recovery audit rotates to deep corruption, wraps, and does not advance on rollback", () => {
  const state = fixture();
  try {
    credit(state.store, {
      coinType: "paid_coins",
      amountUnits: 60,
      suffix: "recovery_audit"
    });
    state.store.publishOfferVersion(offer());
    const orders = [];
    for (let index = 0; index < 3; index += 1) {
      orders.push(confirm(state, state.store.createCheckoutQuote({
        accountId: "acct_synthetic_1",
        offerRef: "offer_monthly_basic"
      }), `confirm_recovery_audit_${index}`));
    }
    dropTableTriggers(state.database, "platform_coin_hold_allocations");
    state.database.prepare(`
      update platform_coin_hold_allocations
         set allocated_units = allocated_units - 1
       where hold_ref = (
         select hold_ref
           from platform_coin_commerce_orders
          where order_ref = ?
       )
    `).run(orders[2].orderRef);

    assertSingleRecoveryBucket(
      state.store.recoverNonTerminalOrders({ limit: 1 }),
      "unchanged"
    );
    assertSingleRecoveryBucket(
      state.store.recoverNonTerminalOrders({ limit: 1 }),
      "unchanged"
    );
    state.database.exec(`
      create trigger synthetic_recovery_audit_rollback
      before update of payment_status on platform_coin_commerce_orders
      when old.order_ref = '${orders[2].orderRef}'
      begin
        select raise(abort, 'synthetic_recovery_audit_rollback');
      end
    `);
    expectCode(
      () => state.store.recoverNonTerminalOrders({ limit: 1 }),
      "commerce_infrastructure_error"
    );
    state.database.exec("drop trigger synthetic_recovery_audit_rollback");

    assertSingleRecoveryBucket(
      state.store.recoverNonTerminalOrders({ limit: 1 }),
      "reconciliationRequired"
    );
    assertSingleRecoveryBucket(
      state.store.recoverNonTerminalOrders({ limit: 1 }),
      "unchanged"
    );
    assert.equal(state.store.getOrder({
      accountId: "acct_synthetic_1",
      orderRef: orders[2].orderRef
    }).paymentStatus, "reconciliation_required");
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

test("attempt and lease-generation overflow isolate independently", () => {
  for (const field of ["attempt_count", "lease_generation"]) {
    const state = fixture();
    try {
      const { command } = captureToOutbox(state);
      state.database.prepare(`
        update platform_coin_commerce_fulfillment_commands
           set ${field} = 2147483647
         where command_ref = ?
      `).run(command.command_ref);
      assert.equal(
        state.store.claimNextFulfillmentCommand({ leaseMs: 1 }),
        null
      );
      assert.deepEqual(state.database.prepare(`
        select status, safe_failure_code, lease_token, lease_until
          from platform_coin_commerce_fulfillment_commands
         where command_ref = ?
      `).get(command.command_ref), {
        status: "failed",
        safe_failure_code: "fulfillment_attempt_limit",
        lease_token: null,
        lease_until: null
      });
    } finally {
      state.close();
    }
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
