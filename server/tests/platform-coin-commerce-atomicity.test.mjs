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
const ATOMIC_TABLES = [
  "platform_coin_wallets",
  "platform_coin_lots",
  "platform_coin_credit_origins",
  "platform_coin_holds",
  "platform_coin_hold_allocations",
  "platform_coin_operation_receipts",
  "platform_coin_ledger_entries",
  "platform_coin_commerce_offer_versions",
  "platform_coin_commerce_quotes",
  "platform_coin_commerce_orders",
  "platform_coin_commerce_operation_receipts",
  "platform_coin_commerce_order_events",
  "platform_coin_commerce_fulfillment_commands",
  "platform_coin_commerce_fulfillment_receipts"
];

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

function refs() {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_${count}`;
  };
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
    );
    insert into platform_accounts
      (id, owner_ref, status, created_at, updated_at, metadata_json)
    values (
      'acct_atomic_1', 'owner_atomic_1', 'active',
      '${CLOCK}', '${CLOCK}', '{}'
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

function offer() {
  return {
    offerRef: "offer_atomic",
    offerVersionRef: "offerv_atomic_v1",
    version: 1,
    category: "data_pack",
    title: { zh: "原子流量包", en: "Atomic data pack" },
    summary: { zh: "合成测试", en: "Synthetic test" },
    importantNotices: { zh: ["合成测试"], en: ["Synthetic test"] },
    baseCoinUnits: 10,
    referencePrice: { currency: "CNY", amountMinor: 1_000 },
    acceptedCoinTypes: ["paid_coins"],
    delivery: {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: 100,
      neverExpires: true,
      discountBasisPoints: null
    }
  };
}

function operation(key) {
  return {
    actorScope: "portal:acct_atomic_1",
    idempotencyKey: key,
    actorType: "portal_user",
    actorRef: "acct_atomic_1"
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-atomicity-"));
  const dbPath = join(directory, "commerce.sqlite");
  const database = createSchema(dbPath);
  const clock = { value: CLOCK };
  const store = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(database, clock),
    commerceRefFactory: refs(),
    walletRefFactory: refs()
  });
  store.walletStore.creditCoins({
    accountId: "acct_atomic_1",
    coinType: "paid_coins",
    amountUnits: 100,
    availability: "available",
    sourceType: "synthetic_seed",
    sourceRef: "source_atomic",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "system:atomic",
      idempotencyKey: "credit_atomic",
      actorType: "system",
      actorRef: "atomic_seed"
    }
  });
  store.publishOfferVersion(offer());
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

function quote(state) {
  return state.store.createCheckoutQuote({
    accountId: "acct_atomic_1",
    offerRef: offer().offerRef
  });
}

function confirm(state, quoteValue, key = "confirm_atomic") {
  return state.store.confirmOrder({
    accountId: "acct_atomic_1",
    quoteRef: quoteValue.quoteRef,
    operation: operation(key)
  });
}

function snapshot(database) {
  return Object.fromEntries(ATOMIC_TABLES.map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

function installFault(database, body) {
  database.exec(`
    create trigger synthetic_commerce_fault
    ${body}
    begin
      select raise(abort, 'RAW_SYNTHETIC_BOUNDARY_FAULT');
    end
  `);
}

function expectSafeRollback(state, before, action) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, "commerce_infrastructure_error");
    assert.equal(error?.message, "Coin commerce store operation rejected");
    assert.equal(error.message.includes("RAW_SYNTHETIC"), false);
    return true;
  });
  state.database.exec("drop trigger synthetic_commerce_fault");
  assert.deepEqual(snapshot(state.database), before);
}

test("confirm rolls all fourteen financial tables back at every write boundary", () => {
  const boundaries = [
    `before insert on platform_coin_commerce_operation_receipts
      when new.status = 'started' and new.operation_type = 'confirm_order'`,
    `before insert on platform_coin_operation_receipts
      when new.status = 'started'`,
    "before insert on platform_coin_holds",
    "before insert on platform_coin_hold_allocations",
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    `before update on platform_coin_wallets
      when new.version <> old.version`,
    "before insert on platform_coin_ledger_entries",
    `before update on platform_coin_operation_receipts
      when new.status = 'succeeded'`,
    "before insert on platform_coin_commerce_orders",
    `before update on platform_coin_commerce_quotes
      when new.status = 'consumed'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'order_held'`,
    `before update on platform_coin_commerce_operation_receipts
      when new.status = 'succeeded' and new.operation_type = 'confirm_order'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const quoteValue = quote(state);
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(
        state,
        before,
        () => confirm(state, quoteValue, `confirm_${boundaries.indexOf(boundary)}`)
      );
    } finally {
      state.close();
    }
  }
});

test("cancel rolls Wallet release and Commerce receipt/event/order writes back together", () => {
  const boundaries = [
    `before insert on platform_coin_commerce_operation_receipts
      when new.status = 'started' and new.operation_type = 'cancel_order'`,
    `before insert on platform_coin_operation_receipts
      when new.status = 'started'`,
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    `before update on platform_coin_holds
      when new.status = 'released'`,
    `before update on platform_coin_wallets
      when new.version <> old.version`,
    "before insert on platform_coin_ledger_entries",
    `before update on platform_coin_operation_receipts
      when new.status = 'succeeded'`,
    `before update on platform_coin_commerce_orders
      when new.payment_status = 'cancelled'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'order_cancelled'`,
    `before update on platform_coin_commerce_operation_receipts
      when new.status = 'succeeded' and new.operation_type = 'cancel_order'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const order = confirm(state, quote(state));
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(state, before, () => state.store.cancelOrder({
        accountId: "acct_atomic_1",
        orderRef: order.orderRef,
        operation: operation(`cancel_${boundaries.indexOf(boundary)}`)
      }));
    } finally {
      state.close();
    }
  }
});

test("capture rolls Wallet consumption, Order, event, and outbox back together", () => {
  const boundaries = [
    `before insert on platform_coin_operation_receipts
      when new.status = 'started'`,
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    `before update on platform_coin_holds
      when new.status = 'captured'`,
    `before update on platform_coin_wallets
      when new.version <> old.version`,
    "before insert on platform_coin_ledger_entries",
    `before update on platform_coin_operation_receipts
      when new.status = 'succeeded'`,
    `before update on platform_coin_commerce_orders
      when new.payment_status = 'captured'`,
    "before insert on platform_coin_commerce_fulfillment_commands",
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'payment_captured'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const order = confirm(state, quote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(
        state,
        before,
        () => state.store.captureClaimedOrder({ orderRef: order.orderRef })
      );
    } finally {
      state.close();
    }
  }
});

test("capture claim rolls all fourteen tables back at both write boundaries", () => {
  const boundaries = [
    `before update on platform_coin_commerce_orders
      when new.payment_status = 'capture_pending'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'capture_claimed'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const order = confirm(state, quote(state));
      state.clock.value = order.cancelUntil;
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(
        state,
        before,
        () => state.store.claimDueCaptures({ limit: 1 })
      );
    } finally {
      state.close();
    }
  }
});

test("fulfillment completion rolls all fourteen tables back at every write boundary", () => {
  const boundaries = [
    `before update on platform_coin_commerce_fulfillment_commands
      when new.status = 'delivered'`,
    "before insert on platform_coin_commerce_fulfillment_receipts",
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'fulfillment_delivered'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const order = confirm(state, quote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
      state.store.captureClaimedOrder({ orderRef: order.orderRef });
      const command = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(state, before, () => (
        state.store.completeFulfillmentCommand({
          commandRef: command.commandRef,
          leaseGeneration: command.leaseGeneration,
          leaseToken: command.leaseToken,
          effectRef: `effect_atomic_${boundaries.indexOf(boundary)}`,
          status: "delivered"
        })
      ));
    } finally {
      state.close();
    }
  }
});

test("fulfillment failure rolls all fourteen tables back at every write boundary", () => {
  const boundaries = [
    `before update on platform_coin_commerce_fulfillment_commands
      when new.status = 'failed'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'fulfillment_failed'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const order = confirm(state, quote(state));
      state.clock.value = order.cancelUntil;
      state.store.claimDueCaptures({ limit: 1 });
      state.store.captureClaimedOrder({ orderRef: order.orderRef });
      const command = state.store.claimNextFulfillmentCommand({ leaseMs: 1000 });
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(state, before, () => (
        state.store.failFulfillmentCommand({
          commandRef: command.commandRef,
          leaseGeneration: command.leaseGeneration,
          leaseToken: command.leaseToken,
          safeCode: "fulfillment_handler_failed"
        })
      ));
    } finally {
      state.close();
    }
  }
});

test("restart recovery captures one pending Order with original deterministic references", () => {
  const state = fixture();
  const order = confirm(state, quote(state));
  state.database.prepare(`
    update platform_coin_commerce_orders
       set payment_status = 'capture_pending'
     where order_ref = ?
  `).run(order.orderRef);
  state.store.close();
  state.database.close();

  const reopened = createSqliteCoinCommerceStore({ dbPath: state.dbPath });
  try {
    const recovered = reopened.recoverNonTerminalOrders({ limit: 10 });
    assert.equal(recovered.scanned, 1);
    assert.equal(recovered.captureRecovered, 1);
    assert.equal(reopened.getOrder({
      accountId: "acct_atomic_1",
      orderRef: order.orderRef
    }).paymentStatus, "captured");
    const database = new Database(state.dbPath);
    try {
      assert.equal(database.prepare(
        "select count(*) from platform_coin_commerce_fulfillment_commands"
      ).pluck().get(), 1);
      assert.equal(database.prepare(
        "select count(*) from platform_coin_ledger_entries where order_ref = ?"
      ).pluck().get(order.orderRef) > 0, true);
    } finally {
      database.close();
    }
  } finally {
    reopened.close();
    rmSync(state.directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
