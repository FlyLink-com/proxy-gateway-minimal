import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";

const CREATED_AT = "2026-07-23T12:34:56.000Z";
const DUE_AT = "2000-01-01T00:00:00.000Z";
const FUTURE_AT = "2099-01-01T00:00:00.000Z";
const TABLES = [
  "platform_coin_wallets",
  "platform_coin_lots",
  "platform_coin_holds",
  "platform_coin_hold_allocations",
  "platform_coin_operation_receipts",
  "platform_coin_ledger_entries"
];
const PUBLIC_RESULT_KEYS = [
  "ok",
  "operationRef",
  "previousWalletVersion",
  "replayed",
  "resultRef",
  "resultingWalletStatus",
  "resultingWalletVersion",
  "safeResultCode",
  "walletRef"
];

const OPERATION = Object.freeze({
  actorScope: "account:account_atomicity",
  idempotencyKey: "lifecycle_atomicity",
  actorType: "user",
  actorRef: "account_atomicity"
});

function withTempDatabase(action) {
  const directory = mkdtempSync(join(tmpdir(), "coin-wallet-lifecycle-atomicity-"));
  const dbPath = join(directory, "wallet.sqlite");
  let database;
  try {
    database = new Database(dbPath);
    database.pragma("foreign_keys = ON");
    database.exec(`
      create table platform_accounts (
        id text primary key,
        owner_ref text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null default '{}'
      )
    `);
    applyCoinWalletMigrations({
      database,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(CREATED_AT)
    });
    database.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values (?, ?, ?, ?, ?, '{}')
    `).run(
      "account_atomicity",
      "owner_atomicity",
      "active",
      CREATED_AT,
      CREATED_AT
    );
    return action({ database, dbPath });
  } finally {
    try {
      database?.close();
    } finally {
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 50
      });
    }
  }
}

function snapshotSixTables(database) {
  return Object.fromEntries(TABLES.map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

function insertCreditFixture(database, {
  suffix,
  walletRef,
  lotRef,
  coinType,
  availableUnits,
  heldUnits,
  expiresAt
}) {
  const operationRef = `credit_operation_${suffix}`;
  const originRef = `credit_origin_${suffix}`;
  database.prepare(`
    insert into platform_coin_operation_receipts (
      operation_ref, wallet_ref, actor_scope, operation_type, idempotency_key,
      request_digest, status, previous_wallet_version, resulting_wallet_version,
      resulting_wallet_status, result_ref, safe_result_code, created_at,
      completed_at
    ) values (?, ?, ?, 'credit_coins', ?, ?, 'succeeded', 0, 1, 'active',
              ?, 'credited', ?, ?)
  `).run(
    operationRef,
    walletRef,
    `system:seed:${suffix}`,
    `seed_${suffix}`,
    suffix.repeat(64).slice(0, 64),
    lotRef,
    CREATED_AT,
    CREATED_AT
  );
  database.prepare(`
    insert into platform_coin_credit_origins (
      credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
      source_digest, operation_ref, lot_ref, created_at
    ) values (?, ?, ?, 'synthetic_seed', ?, ?, ?, ?, ?)
  `).run(
    originRef,
    walletRef,
    coinType,
    `source_${suffix}`,
    suffix.repeat(64).slice(0, 64),
    operationRef,
    lotRef,
    CREATED_AT
  );
  database.prepare(`
    insert into platform_coin_lots (
      lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
      pending_units, available_units, held_units, consumed_units,
      reversed_units, expired_units, source_type, source_ref, policy_ref,
      policy_version, expires_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 0, 'synthetic_seed', ?,
              null, null, ?, ?, ?)
  `).run(
    lotRef,
    walletRef,
    coinType,
    originRef,
    availableUnits + heldUnits,
    availableUnits,
    heldUnits,
    `source_${suffix}`,
    expiresAt,
    CREATED_AT,
    CREATED_AT
  );
}

function seedHoldScenario(database, method, { receiptOnly = null } = {}) {
  const walletRef = "wallet_atomicity";
  const holdRef = "hold_atomicity";
  database.prepare(`
    insert into platform_coin_wallets (
      wallet_ref, account_id, status, version, created_at, updated_at
    ) values (?, 'account_atomicity', 'active', 2, ?, ?)
  `).run(walletRef, CREATED_AT, CREATED_AT);
  const seed = database.transaction(() => {
    insertCreditFixture(database, {
      suffix: "a",
      walletRef,
      lotRef: "lot_atomicity_a",
      coinType: "bonus_coins",
      availableUnits: 0,
      heldUnits: 5,
      expiresAt: method === "captureCoinHold" ? FUTURE_AT : DUE_AT
    });
    insertCreditFixture(database, {
      suffix: "b",
      walletRef,
      lotRef: "lot_atomicity_b",
      coinType: "paid_coins",
      availableUnits: 0,
      heldUnits: 5,
      expiresAt: null
    });
    database.prepare(`
      insert into platform_coin_holds (
        hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
        expires_at, created_at, updated_at
      ) values (?, ?, 'product_purchase', 'order_atomicity', 10, 'active',
                ?, ?, ?)
    `).run(
      holdRef,
      walletRef,
      method === "captureCoinHold"
        && receiptOnly !== "capture_hold_expired"
        ? FUTURE_AT
        : DUE_AT,
      CREATED_AT,
      CREATED_AT
    );
    for (const [sequence, lotRef] of [
      [1, "lot_atomicity_a"],
      [2, "lot_atomicity_b"]
    ]) {
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence,
          allocated_units, created_at
        ) values (?, ?, ?, ?, 5, ?)
      `).run(
        `allocation_atomicity_${sequence}`,
        holdRef,
        lotRef,
        sequence,
        CREATED_AT
      );
    }
    database.prepare(`
      insert into platform_coin_ledger_entries (
        entry_ref, operation_ref, wallet_ref, lot_ref, operation, amount_units,
        hold_ref, order_ref, source_type, source_ref, actor_type, actor_ref,
        previous_wallet_version, resulting_wallet_version,
        resulting_wallet_status, occurred_at
      ) values (
        'ledger_seed', 'credit_operation_a', ?, 'lot_atomicity_a', 'credit', 5,
        null, null, 'synthetic_seed', 'source_a', 'system', 'seed', 0, 1,
        'active', ?
      )
    `).run(walletRef, CREATED_AT);
  });
  seed.immediate();
  if (receiptOnly === "terminal_hold_expiry") {
    database.prepare(`
      update platform_coin_holds
         set status = 'released'
       where hold_ref = ?
    `).run(holdRef);
    database.prepare(`
      update platform_coin_lots
         set held_units = 0,
             available_units = case
               when lot_ref = 'lot_atomicity_b' then 5 else 0
             end,
             expired_units = case
               when lot_ref = 'lot_atomicity_a' then 5 else 0
             end
       where wallet_ref = ?
    `).run(walletRef);
  }
  return { walletRef, holdRef, resultRef: holdRef, previousVersion: 2 };
}

function seedLotScenario(database, { zeroAvailable = false } = {}) {
  const walletRef = "wallet_atomicity";
  const lotRef = "lot_atomicity_a";
  database.prepare(`
    insert into platform_coin_wallets (
      wallet_ref, account_id, status, version, created_at, updated_at
    ) values (?, 'account_atomicity', 'active', 1, ?, ?)
  `).run(walletRef, CREATED_AT, CREATED_AT);
  const seed = database.transaction(() => {
    insertCreditFixture(database, {
      suffix: "a",
      walletRef,
      lotRef,
      coinType: "bonus_coins",
      availableUnits: 10,
      heldUnits: 0,
      expiresAt: DUE_AT
    });
    database.prepare(`
      insert into platform_coin_ledger_entries (
        entry_ref, operation_ref, wallet_ref, lot_ref, operation, amount_units,
        hold_ref, order_ref, source_type, source_ref, actor_type, actor_ref,
        previous_wallet_version, resulting_wallet_version,
        resulting_wallet_status, occurred_at
      ) values (
        'ledger_seed', 'credit_operation_a', ?, ?, 'credit', 10, null, null,
        'synthetic_seed', 'source_a', 'system', 'seed', 0, 1, 'active', ?
      )
    `).run(walletRef, lotRef, CREATED_AT);
  });
  seed.immediate();
  if (zeroAvailable) {
    database.prepare(`
      update platform_coin_lots
         set available_units = 0, expired_units = 10
       where lot_ref = ?
    `).run(lotRef);
  }
  return { walletRef, lotRef, resultRef: lotRef, previousVersion: 1 };
}

function requestFor(method, subject) {
  if (method === "captureCoinHold" || method === "releaseCoinHold") {
    return {
      holdRef: subject.holdRef,
      operation: { ...OPERATION }
    };
  }
  if (method === "expireCoinHold") return { holdRef: subject.holdRef };
  return { lotRef: subject.lotRef };
}

function expectedCode(method) {
  return {
    captureCoinHold: "captured",
    releaseCoinHold: "released",
    expireCoinHold: "expired",
    expireCoinLot: "expired"
  }[method];
}

function assertSafeError(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, "Coin wallet store operation rejected");
    return true;
  });
}

function assertResultAndReplay(first, replay, subject, method) {
  assertExactResultAndReplay(first, replay, {
    ok: true,
    replayed: false,
    operationRef: first.operationRef,
    walletRef: subject.walletRef,
    safeResultCode: expectedCode(method),
    resultRef: subject.resultRef,
    previousWalletVersion: subject.previousVersion,
    resultingWalletVersion: subject.previousVersion + 1,
    resultingWalletStatus: "active"
  });
}

function assertExactResultAndReplay(first, replay, expected) {
  assert.deepEqual(Object.keys(first).sort(), PUBLIC_RESULT_KEYS);
  assert.deepEqual(first, expected);
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.deepEqual(Object.keys(replay).sort(), PUBLIC_RESULT_KEYS);
}

function triggerFor(point, mode) {
  const action = mode === "abort"
    ? "select raise(abort, 'synthetic_lifecycle_fault');"
    : "select raise(ignore);";
  const definitions = {
    started_receipt: `
      before insert on platform_coin_operation_receipts
      when new.status = 'started'
    `,
    first_lot: `
      before update on platform_coin_lots
      when old.lot_ref = 'lot_atomicity_a'
    `,
    lot: `
      before update on platform_coin_lots
      when old.lot_ref = 'lot_atomicity_a'
    `,
    later_lot: `
      before update on platform_coin_lots
      when old.lot_ref = 'lot_atomicity_b'
    `,
    hold: `
      before update on platform_coin_holds
      when old.hold_ref = 'hold_atomicity'
    `,
    wallet: `
      before update on platform_coin_wallets
      when old.wallet_ref = 'wallet_atomicity'
    `,
    first_ledger: `
      before insert on platform_coin_ledger_entries
      when new.lot_ref = 'lot_atomicity_a'
    `,
    ledger: `
      before insert on platform_coin_ledger_entries
      when new.lot_ref = 'lot_atomicity_a'
    `,
    later_ledger: `
      before insert on platform_coin_ledger_entries
      when new.lot_ref = 'lot_atomicity_b'
    `,
    terminal_receipt: `
      before update on platform_coin_operation_receipts
      when old.status = 'started'
    `
  };
  return `
    create temporary trigger lifecycle_fault
    ${definitions[point]}
    begin
      ${action}
    end
  `;
}

const FAULT_POINTS_BY_METHOD = Object.freeze({
  captureCoinHold: [
    "started_receipt", "first_lot", "later_lot", "hold", "wallet",
    "first_ledger", "later_ledger", "terminal_receipt"
  ],
  releaseCoinHold: [
    "started_receipt", "first_lot", "later_lot", "hold", "wallet",
    "first_ledger", "later_ledger", "terminal_receipt"
  ],
  expireCoinHold: [
    "started_receipt", "first_lot", "later_lot", "hold", "wallet",
    "first_ledger", "later_ledger", "terminal_receipt"
  ],
  expireCoinLot: [
    "started_receipt", "lot", "wallet", "ledger", "terminal_receipt"
  ]
});
const FAULT_MATRIX = Object.entries(FAULT_POINTS_BY_METHOD).flatMap(
  ([method, points]) => points.flatMap((point) => (
    ["abort", "ignore"].map((mode) => ({ method, point, mode }))
  ))
);
const RECEIPT_ONLY_CASES = [
  {
    name: "capture hold_expired",
    method: "captureCoinHold",
    seed: (database) => seedHoldScenario(
      database,
      "captureCoinHold",
      { receiptOnly: "capture_hold_expired" }
    ),
    result(subject, operationRef) {
      return {
        ok: false,
        replayed: false,
        operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "hold_expired",
        resultRef: null,
        previousWalletVersion: 2,
        resultingWalletVersion: 2,
        resultingWalletStatus: "active"
      };
    }
  },
  {
    name: "terminal hold expiry",
    method: "expireCoinHold",
    seed: (database) => seedHoldScenario(
      database,
      "expireCoinHold",
      { receiptOnly: "terminal_hold_expiry" }
    ),
    result(subject, operationRef) {
      return {
        ok: true,
        replayed: false,
        operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "expiry_processed",
        resultRef: subject.holdRef,
        previousWalletVersion: 2,
        resultingWalletVersion: 2,
        resultingWalletStatus: "active"
      };
    }
  },
  {
    name: "zero-available lot expiry",
    method: "expireCoinLot",
    seed: (database) => seedLotScenario(database, { zeroAvailable: true }),
    result(subject, operationRef) {
      return {
        ok: true,
        replayed: false,
        operationRef,
        walletRef: subject.walletRef,
        safeResultCode: "expiry_processed",
        resultRef: subject.lotRef,
        previousWalletVersion: 1,
        resultingWalletVersion: 1,
        resultingWalletStatus: "active"
      };
    }
  }
];

test("lifecycle atomicity matrix names every guarded write and all four methods", () => {
  assert.equal(FAULT_MATRIX.length, 58);
  for (const [method, points] of Object.entries(FAULT_POINTS_BY_METHOD)) {
    for (const point of points) {
      assert.deepEqual(
        FAULT_MATRIX.filter((entry) => (
          entry.method === method && entry.point === point
        )).map(({ mode }) => mode).sort(),
        ["abort", "ignore"]
      );
    }
  }
});

for (const { method, point, mode } of FAULT_MATRIX) {
  test(`${method} rolls back ${point} ${mode}, then succeeds once and replays`, () => {
    withTempDatabase(({ database }) => {
      const subject = method === "expireCoinLot"
        ? seedLotScenario(database)
        : seedHoldScenario(database, method);
      const request = requestFor(method, subject);
      const counters = new Map();
      const store = createSqliteCoinWalletStore({
        database,
        refFactory(kind) {
          const next = (counters.get(kind) ?? 0) + 1;
          counters.set(kind, next);
          return `${kind}_${method}_${point}_${mode}_${next}`;
        }
      });
      try {
        database.exec(triggerFor(point, mode));
        const before = snapshotSixTables(database);
        assertSafeError(
          () => store[method](request),
          "wallet_infrastructure_error"
        );
        assert.deepEqual(snapshotSixTables(database), before);
        assert.equal(database.prepare(`
          select count(*) from platform_coin_operation_receipts
           where status = 'started'
        `).pluck().get(), 0);
        database.exec("drop trigger lifecycle_fault");
        const first = store[method](request);
        const afterFirst = snapshotSixTables(database);
        const replay = store[method](request);
        assertResultAndReplay(first, replay, subject, method);
        assert.deepEqual(snapshotSixTables(database), afterFirst);
      } finally {
        try {
          database.exec("drop trigger if exists lifecycle_fault");
        } finally {
          store.close();
        }
      }
    });
  });
}

for (const scenario of RECEIPT_ONLY_CASES) {
  for (const mode of ["abort", "ignore"]) {
    test(`${scenario.name} rolls back terminal receipt ${mode}`, () => {
      withTempDatabase(({ database }) => {
        const subject = scenario.seed(database);
        const request = requestFor(scenario.method, subject);
        let sequence = 0;
        const store = createSqliteCoinWalletStore({
          database,
          refFactory: (kind) => (
            `${kind}_receipt_only_${mode}_${++sequence}`
          )
        });
        try {
          database.exec(triggerFor("terminal_receipt", mode));
          const before = snapshotSixTables(database);
          assertSafeError(
            () => store[scenario.method](request),
            "wallet_infrastructure_error"
          );
          assert.deepEqual(snapshotSixTables(database), before);
          assert.equal(database.prepare(`
            select count(*) from platform_coin_operation_receipts
             where status = 'started'
          `).pluck().get(), 0);
          database.exec("drop trigger lifecycle_fault");
          const first = store[scenario.method](request);
          const afterFirst = snapshotSixTables(database);
          const replay = store[scenario.method](request);
          assertExactResultAndReplay(
            first,
            replay,
            scenario.result(subject, first.operationRef)
          );
          assert.deepEqual(snapshotSixTables(database), afterFirst);
        } finally {
          try {
            database.exec("drop trigger if exists lifecycle_fault");
          } finally {
            store.close();
          }
        }
      });
    });
  }
}

const REFERENCE_FAILURES = ["operation", "ledger_entry"].flatMap(
  (kind) => ["invalid", "collision"].map((variant) => ({ kind, variant }))
);

for (const { kind: referenceKind, variant } of REFERENCE_FAILURES) {
  test(`expireCoinHold rolls back ${variant} ${referenceKind} reference, then succeeds and replays`, () => {
    withTempDatabase(({ database }) => {
      const subject = seedHoldScenario(database, "expireCoinHold");
      const request = requestFor("expireCoinHold", subject);
      const before = snapshotSixTables(database);
      const badStore = createSqliteCoinWalletStore({
        database,
        refFactory(kind) {
          if (kind === referenceKind) {
            if (variant === "invalid") return " invalid ";
            return referenceKind === "operation"
              ? "credit_operation_a"
              : "ledger_seed";
          }
          return `${kind}_${referenceKind}_${variant}`;
        }
      });
      try {
        assertSafeError(
          () => badStore.expireCoinHold(request),
          "wallet_infrastructure_error"
        );
        assert.deepEqual(snapshotSixTables(database), before);
        assert.equal(database.prepare(`
          select count(*) from platform_coin_operation_receipts
           where status = 'started'
        `).pluck().get(), 0);
      } finally {
        badStore.close();
      }

      let sequence = 0;
      const retryStore = createSqliteCoinWalletStore({
        database,
        refFactory: (kind) => (
          `${kind}_${referenceKind}_${variant}_retry_${++sequence}`
        )
      });
      try {
        const first = retryStore.expireCoinHold(request);
        const afterFirst = snapshotSixTables(database);
        const replay = retryStore.expireCoinHold(request);
        assertResultAndReplay(
          first,
          replay,
          subject,
          "expireCoinHold"
        );
        assert.deepEqual(snapshotSixTables(database), afterFirst);
      } finally {
        retryStore.close();
      }
    });
  });
}
