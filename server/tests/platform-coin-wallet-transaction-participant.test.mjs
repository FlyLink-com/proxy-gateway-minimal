import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createCoinWalletTransactionParticipant,
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";

const NOW = "2026-07-26T12:34:56.000Z";
const PARTICIPANT_METHODS = [
  "captureCoinHoldInTransaction",
  "createCoinHoldInTransaction",
  "getWalletByAccountIdInTransaction",
  "getWalletProjectionInTransaction",
  "previewCoinHoldInTransaction",
  "releaseCoinHoldInTransaction"
];

function createSyntheticDatabase() {
  const database = new Database(":memory:");
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
    nowFn: () => new Date(NOW)
  });
  return database;
}

function insertAccount(database, accountId = "account_1") {
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `owner_${accountId}`, NOW, NOW);
}

function makeRefFactory() {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    return `${kind}_${count}`;
  };
}

function makeObservedRefFactory() {
  const calls = [];
  const factory = (kind) => {
    calls.push(kind);
    return `${kind}_${calls.filter((value) => value === kind).length}`;
  };
  factory.calls = () => [...calls];
  return factory;
}

function observeLockedUtcReads(database) {
  let reads = 0;
  const observed = new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            reads += 1;
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { database: observed, reads: () => reads };
}

function createLockedUtcDatabase(database, clock) {
  let reads = 0;
  const observed = new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return target.inTransaction;
      if (property === "prepare") {
        return (sql) => {
          if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
            return {
              pluck() {
                return {
                  get() {
                    reads += 1;
                    return clock.value;
                  }
                };
              }
            };
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { database: observed, reads: () => reads };
}

function overrideInTransaction(database, readInTransaction) {
  return new Proxy(database, {
    get(target, property) {
      if (property === "inTransaction") return readInTransaction();
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function validCredit(overrides = {}) {
  return {
    accountId: "account_1",
    coinType: "paid_coins",
    amountUnits: 25,
    availability: "available",
    sourceType: "verified_recharge",
    sourceRef: "source_1",
    sourceDigest: "a".repeat(64),
    policyRef: null,
    policyVersion: null,
    expiresAt: null,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "credit_1",
      actorType: "system",
      actorRef: "settlement_worker"
    },
    ...overrides
  };
}

function validHold(overrides = {}) {
  return {
    walletRef: "wallet_1",
    purpose: "product_purchase",
    purposeRef: "order_1",
    amountUnits: 10,
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    expiresAt: "2099-07-27T12:34:56.000Z",
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "hold_1",
      actorType: "user",
      actorRef: "account_1"
    },
    ...overrides,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "hold_1",
      actorType: "user",
      actorRef: "account_1",
      ...(overrides.operation ?? {})
    }
  };
}

function validCapture(holdRef, overrides = {}) {
  return {
    holdRef,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "capture_1",
      actorType: "user",
      actorRef: "account_1",
      ...(overrides.operation ?? {})
    },
    ...overrides
  };
}

function validRelease(holdRef, overrides = {}) {
  return {
    holdRef,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "release_1",
      actorType: "user",
      actorRef: "account_1",
      ...(overrides.operation ?? {})
    },
    ...overrides
  };
}

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, "Coin wallet store operation rejected");
    return true;
  });
}

function walletFinancialSnapshot(database) {
  const tables = [
    "platform_coin_wallets",
    "platform_coin_lots",
    "platform_coin_holds",
    "platform_coin_hold_allocations",
    "platform_coin_operation_receipts",
    "platform_coin_ledger_entries"
  ];
  return Object.fromEntries(tables.map((table) => [
    table,
    database.prepare(`select * from ${table} order by rowid`).all()
  ]));
}

test("factory validates exact schema and exposes only the six transaction methods", () => {
  assert.throws(
    () => createCoinWalletTransactionParticipant(),
    (error) => error?.code === "invalid_store_contract"
  );

  const invalid = new Database(":memory:");
  try {
    expectCode(
      () => createCoinWalletTransactionParticipant({ database: invalid }),
      "coin_wallet_schema_not_ready"
    );
    assert.equal(invalid.open, true);
  } finally {
    invalid.close();
  }

  const database = createSyntheticDatabase();
  try {
    const participant = createCoinWalletTransactionParticipant({
      database,
      nowFn: () => new Date(NOW),
      refFactory: makeRefFactory()
    });
    assert.deepEqual(Object.keys(participant).sort(), PARTICIPANT_METHODS);
    assert.equal("database" in participant, false);
    assert.equal("close" in participant, false);
  } finally {
    database.close();
  }
});

test("all participant methods require a caller-owned transaction as their first gate", () => {
  const database = createSyntheticDatabase();
  try {
    const participant = createCoinWalletTransactionParticipant({ database });
    for (const method of PARTICIPANT_METHODS) {
      expectCode(() => participant[method](undefined), "wallet_transaction_required");
    }
  } finally {
    database.close();
  }
});

test("missing and throwing transaction state fail with the same safe gate code", () => {
  for (const readInTransaction of [
    () => undefined,
    () => {
      throw new Error("synthetic transaction-state fault");
    }
  ]) {
    const database = createSyntheticDatabase();
    try {
      const participant = createCoinWalletTransactionParticipant({
        database: overrideInTransaction(database, readInTransaction)
      });
      expectCode(
        () => participant.getWalletByAccountIdInTransaction("account_1"),
        "wallet_transaction_required"
      );
    } finally {
      database.close();
    }
  }
});

test("participant Wallet changes roll back with the caller transaction", () => {
  const database = createSyntheticDatabase();
  try {
    insertAccount(database);
    const refs = makeRefFactory();
    const store = createSqliteCoinWalletStore({
      database,
      nowFn: () => new Date(NOW),
      refFactory: refs
    });
    store.creditCoins(validCredit());
    const participant = createCoinWalletTransactionParticipant({
      database,
      nowFn: () => new Date(NOW),
      refFactory: refs
    });

    const outer = database.transaction(() => {
      participant.createCoinHoldInTransaction(validHold());
      throw new Error("synthetic_outer_failure");
    });
    assert.throws(() => outer.immediate(), /synthetic_outer_failure/);
    assert.equal(store.getHold("hold_1"), null);
  } finally {
    database.close();
  }
});

test("transaction reads preserve account ownership and the exact missing projection", () => {
  const database = createSyntheticDatabase();
  try {
    const participant = createCoinWalletTransactionParticipant({ database });
    const read = database.transaction(() => ({
      wallet: participant.getWalletByAccountIdInTransaction("account_missing"),
      projection: participant.getWalletProjectionInTransaction({
        accountId: "account_missing"
      })
    })).immediate();
    assert.equal(read.wallet, null);
    assert.deepEqual(read.projection, {
      exists: false,
      status: "not_created",
      version: 0,
      totals: {
        paid_coins: 0,
        bonus_coins: 0,
        reward_coins: 0
      },
      spendableUnits: 0,
      heldUnits: 0,
      pendingUnits: 0
    });
  } finally {
    database.close();
  }
});

test("preview is zero-write, zero-ref, one-clock, expiry-aware, and lot-ref free", () => {
  const database = createSyntheticDatabase();
  try {
    insertAccount(database);
    const seedStore = createSqliteCoinWalletStore({
      database,
      nowFn: () => new Date("1999-01-01T00:00:00.000Z"),
      refFactory: makeRefFactory()
    });
    seedStore.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 11,
      sourceRef: "expired_bonus",
      expiresAt: "2000-01-01T00:00:00.000Z",
      operation: {
        actorScope: "account:account_1",
        idempotencyKey: "credit_expired_bonus",
        actorType: "system",
        actorRef: "settlement_worker"
      }
    }));
    seedStore.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 3,
      sourceRef: "future_bonus",
      expiresAt: "2099-01-01T00:00:00.000Z",
      operation: {
        actorScope: "account:account_1",
        idempotencyKey: "credit_future_bonus",
        actorType: "system",
        actorRef: "settlement_worker"
      }
    }));
    seedStore.creditCoins(validCredit({
      amountUnits: 7,
      sourceRef: "paid",
      operation: {
        actorScope: "account:account_1",
        idempotencyKey: "credit_paid",
        actorType: "system",
        actorRef: "settlement_worker"
      }
    }));
    const before = database.serialize();
    const observed = observeLockedUtcReads(database);
    const refs = makeObservedRefFactory();
    const participant = createCoinWalletTransactionParticipant({
      database: observed.database,
      refFactory: refs
    });
    const preview = database.transaction(() => (
      participant.previewCoinHoldInTransaction({
        accountId: "account_1",
        amountUnits: 10,
        acceptedCoinTypes: ["paid_coins", "bonus_coins"]
      })
    )).immediate();

    assert.deepEqual(preview, {
      walletProjection: seedStore.getWalletProjection({ accountId: "account_1" }),
      requestedUnits: 10,
      acceptedCoinTypes: ["bonus_coins", "paid_coins"],
      allocation: [
        { coinType: "bonus_coins", amountUnits: 3 },
        { coinType: "paid_coins", amountUnits: 7 }
      ],
      sufficient: true
    });
    assert.equal(JSON.stringify(preview).includes("lotRef"), false);
    assert.deepEqual(refs.calls(), []);
    assert.equal(observed.reads(), 1);
    assert.deepEqual(database.serialize(), before);
  } finally {
    database.close();
  }
});

test("preview handles missing and inactive Wallets without exposing financial rows", () => {
  const database = createSyntheticDatabase();
  try {
    const participant = createCoinWalletTransactionParticipant({ database });
    const missing = database.transaction(() => (
      participant.previewCoinHoldInTransaction({
        accountId: "account_missing",
        amountUnits: 1,
        acceptedCoinTypes: ["paid_coins"]
      })
    )).immediate();
    assert.equal(missing.walletProjection.status, "not_created");
    assert.deepEqual(missing.allocation, []);
    assert.equal(missing.sufficient, false);

    insertAccount(database);
    const store = createSqliteCoinWalletStore({
      database,
      nowFn: () => new Date(NOW),
      refFactory: makeRefFactory()
    });
    store.creditCoins(validCredit());
    for (const status of ["frozen", "closed"]) {
      database.prepare(`
        update platform_coin_wallets set status = ? where account_id = 'account_1'
      `).run(status);
      expectCode(
        () => database.transaction(() => (
          participant.previewCoinHoldInTransaction({
            accountId: "account_1",
            amountUnits: 1,
            acceptedCoinTypes: ["paid_coins"]
          })
        )).immediate(),
        "wallet_not_active"
      );
    }
  } finally {
    database.close();
  }
});

function createMutationFixture({ participant = false } = {}) {
  const database = createSyntheticDatabase();
  insertAccount(database);
  const refs = makeObservedRefFactory();
  const store = createSqliteCoinWalletStore({
    database,
    nowFn: () => new Date(NOW),
    refFactory: refs
  });
  store.creditCoins(validCredit());
  return {
    database,
    refs,
    store,
    participant: participant
      ? createCoinWalletTransactionParticipant({
          database,
          nowFn: () => new Date(NOW),
          refFactory: refs
        })
      : null
  };
}

function runParticipant(database, action) {
  return database.transaction(action).immediate();
}

test("participant hold, replay, capture, and release preserve public envelopes and ref order", () => {
  for (const operation of ["capture", "release"]) {
    const publicFixture = createMutationFixture();
    const participantFixture = createMutationFixture({ participant: true });
    try {
      const publicHold = publicFixture.store.createCoinHold(validHold());
      const participantHold = runParticipant(
        participantFixture.database,
        () => participantFixture.participant.createCoinHoldInTransaction(validHold())
      );
      assert.deepEqual(participantHold, publicHold);
      assert.deepEqual(
        runParticipant(
          participantFixture.database,
          () => participantFixture.participant.createCoinHoldInTransaction(validHold())
        ),
        publicFixture.store.createCoinHold(validHold())
      );

      const publicResult = operation === "capture"
        ? publicFixture.store.captureCoinHold(validCapture(publicHold.resultRef))
        : publicFixture.store.releaseCoinHold(validRelease(publicHold.resultRef));
      const participantResult = runParticipant(
        participantFixture.database,
        () => operation === "capture"
          ? participantFixture.participant.captureCoinHoldInTransaction(
              validCapture(participantHold.resultRef)
            )
          : participantFixture.participant.releaseCoinHoldInTransaction(
              validRelease(participantHold.resultRef)
            )
      );
      assert.deepEqual(participantResult, publicResult);
      assert.deepEqual(participantFixture.refs.calls(), publicFixture.refs.calls());
    } finally {
      publicFixture.database.close();
      participantFixture.database.close();
    }
  }
});

test("participant preserves insufficient, idempotency-drift, and expiry result codes", () => {
  const fixture = createMutationFixture({ participant: true });
  try {
    const insufficient = runParticipant(
      fixture.database,
      () => fixture.participant.createCoinHoldInTransaction(validHold({
        amountUnits: 26,
        operation: { idempotencyKey: "hold_insufficient" }
      }))
    );
    assert.equal(insufficient.safeResultCode, "insufficient_balance");
    assert.equal(insufficient.ok, false);
    expectCode(
      () => runParticipant(
        fixture.database,
        () => fixture.participant.createCoinHoldInTransaction(validHold({
          amountUnits: 24,
          operation: { idempotencyKey: "hold_insufficient" }
        }))
      ),
      "idempotency_conflict"
    );
    expectCode(
      () => runParticipant(
        fixture.database,
        () => fixture.participant.createCoinHoldInTransaction(validHold({
          expiresAt: "2000-01-01T00:00:00.000Z",
          operation: { idempotencyKey: "hold_expired_input" }
        }))
      ),
      "invalid_coin_expiry"
    );
  } finally {
    fixture.database.close();
  }
});

test("capture expiry uses one locked UTC read and replay uses none", () => {
  const database = createSyntheticDatabase();
  try {
    insertAccount(database);
    const refs = makeRefFactory();
    const store = createSqliteCoinWalletStore({
      database,
      nowFn: () => new Date(NOW),
      refFactory: refs
    });
    store.creditCoins(validCredit());
    const clock = { value: NOW };
    const locked = createLockedUtcDatabase(database, clock);
    const participant = createCoinWalletTransactionParticipant({
      database: locked.database,
      nowFn: () => new Date(NOW),
      refFactory: refs
    });
    const hold = runParticipant(
      database,
      () => participant.createCoinHoldInTransaction(validHold({
        expiresAt: "2026-07-27T12:34:56.000Z"
      }))
    );
    assert.equal(locked.reads(), 1);

    clock.value = "2026-07-27T12:34:56.000Z";
    const expired = runParticipant(
      database,
      () => participant.captureCoinHoldInTransaction(validCapture(hold.resultRef))
    );
    assert.equal(expired.safeResultCode, "hold_expired");
    assert.equal(expired.ok, false);
    assert.equal(locked.reads(), 2);
    assert.deepEqual(
      runParticipant(
        database,
        () => participant.captureCoinHoldInTransaction(validCapture(hold.resultRef))
      ),
      { ...expired, replayed: true }
    );
    assert.equal(locked.reads(), 2);
  } finally {
    database.close();
  }
});

test("an injected hold trigger failure rolls every participant write back", () => {
  const fixture = createMutationFixture({ participant: true });
  try {
    const before = walletFinancialSnapshot(fixture.database);
    fixture.database.exec(`
      create trigger reject_participant_hold
      before insert on platform_coin_holds
      begin
        select raise(abort, 'synthetic participant hold fault');
      end
    `);
    expectCode(
      () => runParticipant(
        fixture.database,
        () => fixture.participant.createCoinHoldInTransaction(validHold())
      ),
      "wallet_infrastructure_error"
    );
    fixture.database.exec("drop trigger reject_participant_hold");
    assert.deepEqual(walletFinancialSnapshot(fixture.database), before);
  } finally {
    fixture.database.close();
  }
});
