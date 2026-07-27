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
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
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
  for (const seed of [
    {
      coinType: "bonus_coins",
      amountUnits: 3,
      availability: "available",
      expiresAt: "2099-01-01T00:00:00.000Z"
    },
    {
      coinType: "paid_coins",
      amountUnits: 4,
      availability: "available",
      expiresAt: null
    },
    {
      coinType: "reward_coins",
      amountUnits: 3,
      availability: "pending",
      expiresAt: null
    }
  ]) {
    const credited = store.walletStore.creditCoins({
      accountId: "acct_atomic_1",
      coinType: seed.coinType,
      amountUnits: seed.amountUnits,
      availability: seed.availability,
      sourceType: "synthetic_seed",
      sourceRef: `source_atomic_${seed.coinType}`,
      sourceDigest: seed.coinType.padEnd(64, "0").slice(0, 64),
      policyRef: seed.coinType === "reward_coins"
        ? "reward_policy_atomic"
        : null,
      policyVersion: seed.coinType === "reward_coins" ? 1 : null,
      expiresAt: seed.expiresAt,
      operation: {
        actorScope: "system:atomic",
        idempotencyKey: `credit_atomic_${seed.coinType}`,
        actorType: "system",
        actorRef: "atomic_seed"
      }
    });
    if (seed.availability === "pending") {
      store.walletStore.confirmCoinCredit({
        lotRef: credited.resultRef,
        amountUnits: seed.amountUnits,
        operation: {
          actorScope: "system:atomic",
          idempotencyKey: `confirm_atomic_${seed.coinType}`,
          actorType: "system",
          actorRef: "atomic_seed"
        }
      });
    }
  }
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

function captureToOutbox(state) {
  const order = confirm(state, quote(state));
  state.clock.value = order.cancelUntil;
  state.store.claimDueCaptures({ limit: 1 });
  state.store.captureClaimedOrder({ orderRef: order.orderRef });
  return order;
}

function holdForOrder(state, orderRef) {
  return state.database.prepare(`
    select h.*
      from platform_coin_holds h
      join platform_coin_commerce_orders o on o.hold_ref = h.hold_ref
     where o.order_ref = ?
  `).get(orderRef);
}

function snapshot(database) {
  return Object.fromEntries(ATOMIC_TABLES.map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

function dropTableTriggers(database, table) {
  const triggers = database.prepare(`
    select name from sqlite_master
     where type = 'trigger' and tbl_name = ?
  `).all(table);
  for (const { name } of triggers) {
    database.exec(`drop trigger "${name.replaceAll("\"", "\"\"")}"`);
  }
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

function installNthFault(database, body, nthWrite) {
  const mainTarget = body.replace(
    /\bon\s+(platform_coin_[a-z_]+)/i,
    "on main.$1"
  );
  database.exec(`
    create temp table synthetic_commerce_fault_counter (
      seen integer not null
    );
    insert into synthetic_commerce_fault_counter (seen) values (0);
    create temp trigger synthetic_commerce_nth_fault
    ${mainTarget}
    begin
      update synthetic_commerce_fault_counter set seen = seen + 1;
      select case
        when (select seen from synthetic_commerce_fault_counter) = ${nthWrite}
        then raise(abort, 'RAW_SYNTHETIC_NTH_WRITE_FAULT')
      end;
    end
  `);
}

function expectSafeNthRollback(state, before, action) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, "commerce_infrastructure_error");
    assert.equal(error?.message, "Coin commerce store operation rejected");
    assert.equal(error.message.includes("RAW_SYNTHETIC"), false);
    return true;
  });
  state.database.exec(`
    drop trigger temp.synthetic_commerce_nth_fault;
    drop table temp.synthetic_commerce_fault_counter;
  `);
  assert.deepEqual(snapshot(state.database), before);
}

function expectNthWriteRollbacks({
  setup,
  action,
  trigger,
  writeCount = 3
}) {
  for (let nthWrite = 1; nthWrite <= writeCount; nthWrite += 1) {
    const state = fixture();
    try {
      const subject = setup(state);
      const before = snapshot(state.database);
      installNthFault(state.database, trigger, nthWrite);
      expectSafeNthRollback(
        state,
        before,
        () => action(state, subject, nthWrite)
      );
    } finally {
      state.close();
    }
  }
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

test("three-allocation confirm rolls back every Nth allocation, lot, and ledger write", () => {
  for (const trigger of [
    "before insert on platform_coin_hold_allocations",
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    "before insert on platform_coin_ledger_entries"
  ]) {
    expectNthWriteRollbacks({
      setup: (state) => quote(state),
      action: (state, quoteValue, nthWrite) => confirm(
        state,
        quoteValue,
        `confirm_nth_${nthWrite}`
      ),
      trigger
    });
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

test("three-allocation cancel rolls back every Nth lot and ledger write", () => {
  for (const trigger of [
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    "before insert on platform_coin_ledger_entries"
  ]) {
    expectNthWriteRollbacks({
      setup(state) {
        return confirm(state, quote(state));
      },
      action: (state, order, nthWrite) => state.store.cancelOrder({
        accountId: "acct_atomic_1",
        orderRef: order.orderRef,
        operation: operation(`cancel_nth_${nthWrite}`)
      }),
      trigger
    });
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

test("three-allocation capture rolls back every Nth lot and ledger write", () => {
  for (const trigger of [
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    "before insert on platform_coin_ledger_entries"
  ]) {
    expectNthWriteRollbacks({
      setup(state) {
        const order = confirm(state, quote(state));
        state.clock.value = order.cancelUntil;
        state.store.claimDueCaptures({ limit: 1 });
        return order;
      },
      action: (state, order) => state.store.captureClaimedOrder({
        orderRef: order.orderRef
      }),
      trigger
    });
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

test("expired-Hold recovery rolls every release and reconciliation write back", () => {
  const setupExpired = (state) => {
    const order = confirm(state, quote(state));
    state.clock.value = holdForOrder(state, order.orderRef).expires_at;
    return order;
  };
  for (const trigger of [
    `before update on platform_coin_lots
      when new.held_units <> old.held_units`,
    "before insert on platform_coin_ledger_entries"
  ]) {
    expectNthWriteRollbacks({
      setup: setupExpired,
      action: (state) => state.store.recoverNonTerminalOrders({ limit: 1 }),
      trigger
    });
  }
  const boundaries = [
    `before insert on platform_coin_operation_receipts
      when new.status = 'started'
       and new.operation_type = 'release_coin_hold'`,
    `before update on platform_coin_holds
      when new.status = 'released'`,
    `before update on platform_coin_wallets
      when new.version <> old.version`,
    `before update on platform_coin_operation_receipts
      when new.status = 'succeeded'
       and new.operation_type = 'release_coin_hold'`,
    `before update on platform_coin_commerce_orders
      when new.payment_status = 'capture_pending'`,
    `before update on platform_coin_commerce_orders
      when new.payment_status = 'reconciliation_required'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'reconciliation_required'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      setupExpired(state);
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(
        state,
        before,
        () => state.store.recoverNonTerminalOrders({ limit: 1 })
      );
    } finally {
      state.close();
    }
  }
});

test("captured-invalid recovery rolls command quarantine and Order isolation back together", () => {
  const boundaries = [
    `before update on platform_coin_commerce_fulfillment_commands
      when new.status = 'failed'
       and new.safe_failure_code = 'fulfillment_result_invalid'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'fulfillment_failed'
       and new.safe_code = 'fulfillment_result_invalid'`,
    `before update on platform_coin_commerce_orders
      when new.payment_status = 'reconciliation_required'`,
    `before insert on platform_coin_commerce_order_events
      when new.event_type = 'reconciliation_required'`
  ];
  for (const boundary of boundaries) {
    const state = fixture();
    try {
      const order = captureToOutbox(state);
      const hold = holdForOrder(state, order.orderRef);
      dropTableTriggers(state.database, "platform_coin_holds");
      state.database.prepare(`
        update platform_coin_holds
           set purpose_ref = 'order_invalid_atomic_recovery'
         where hold_ref = ?
      `).run(hold.hold_ref);
      const before = snapshot(state.database);
      installFault(state.database, boundary);
      expectSafeRollback(
        state,
        before,
        () => state.store.recoverNonTerminalOrders({ limit: 1 })
      );
    } finally {
      state.close();
    }
  }
});

test("captured missing-command recovery rolls outbox insertion back", () => {
  const state = fixture();
  try {
    const order = captureToOutbox(state);
    state.database.prepare(`
      delete from platform_coin_commerce_fulfillment_commands
       where order_ref = ?
    `).run(order.orderRef);
    const before = snapshot(state.database);
    installFault(
      state.database,
      "before insert on platform_coin_commerce_fulfillment_commands"
    );
    expectSafeRollback(
      state,
      before,
      () => state.store.recoverNonTerminalOrders({ limit: 1 })
    );
  } finally {
    state.close();
  }
});

test("normal fulfillment claim rolls lease update back", () => {
  const state = fixture();
  try {
    captureToOutbox(state);
    const before = snapshot(state.database);
    installFault(
      state.database,
      `before update on platform_coin_commerce_fulfillment_commands
        when new.status = 'processing'`
    );
    expectSafeRollback(
      state,
      before,
      () => state.store.claimNextFulfillmentCommand({ leaseMs: 1000 })
    );
  } finally {
    state.close();
  }
});

test("attempt and generation overflow each roll command failure and event back", () => {
  for (const counter of ["attempt_count", "lease_generation"]) {
    for (const boundary of [
      `before update on platform_coin_commerce_fulfillment_commands
        when new.status = 'failed'
         and new.safe_failure_code = 'fulfillment_attempt_limit'`,
      `before insert on platform_coin_commerce_order_events
        when new.event_type = 'fulfillment_failed'
         and new.safe_code = 'fulfillment_attempt_limit'`
    ]) {
      const state = fixture();
      try {
        const order = captureToOutbox(state);
        state.database.prepare(`
          update platform_coin_commerce_fulfillment_commands
             set ${counter} = 2147483647
           where order_ref = ?
        `).run(order.orderRef);
        const before = snapshot(state.database);
        installFault(state.database, boundary);
        expectSafeRollback(
          state,
          before,
          () => state.store.claimNextFulfillmentCommand({ leaseMs: 1000 })
        );
      } finally {
        state.close();
      }
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

  const reopenedDatabase = new Database(state.dbPath);
  reopenedDatabase.pragma("foreign_keys = ON");
  const reopened = createSqliteCoinCommerceStore({
    database: fixedClockDatabase(reopenedDatabase, state.clock)
  });
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
    reopenedDatabase.close();
    rmSync(state.directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
