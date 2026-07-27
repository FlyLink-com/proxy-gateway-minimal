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
  "getWalletByAccountIdInTransaction",
  "getWalletProjectionInTransaction",
  "previewCoinHoldInTransaction",
  "createCoinHoldInTransaction",
  "captureCoinHoldInTransaction",
  "releaseCoinHoldInTransaction"
];
const MUTATION_ENVELOPE_FIELDS = [
  "ok",
  "replayed",
  "operationRef",
  "walletRef",
  "safeResultCode",
  "resultRef",
  "previousWalletVersion",
  "resultingWalletVersion",
  "resultingWalletStatus"
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
    ...overrides,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "capture_1",
      actorType: "user",
      actorRef: "account_1",
      ...(overrides.operation ?? {})
    }
  };
}

function validRelease(holdRef, overrides = {}) {
  return {
    holdRef,
    ...overrides,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "release_1",
      actorType: "user",
      actorRef: "account_1",
      ...(overrides.operation ?? {})
    }
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

function mutationOutcome(action) {
  try {
    return { kind: "result", value: action() };
  } catch (error) {
    return {
      kind: "error",
      value: {
        code: error?.code,
        message: error?.message
      }
    };
  }
}

function assertExactMutationOutcomes(outcomes) {
  for (const outcome of outcomes) {
    if (outcome.kind === "error") {
      assert.deepEqual(Reflect.ownKeys(outcome.value), ["code", "message"]);
      assert.equal(
        outcome.value.message,
        "Coin wallet store operation rejected"
      );
      continue;
    }
    assert.deepEqual(Reflect.ownKeys(outcome.value), MUTATION_ENVELOPE_FIELDS);
    for (const field of MUTATION_ENVELOPE_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(outcome.value, field);
      assert.equal(descriptor?.enumerable, true);
      assert.equal("value" in descriptor, true);
    }
  }
}

function seedAllocationWallet(store) {
  store.creditCoins(validCredit({
    coinType: "bonus_coins",
    amountUnits: 4,
    sourceRef: "bonus_seed",
    sourceDigest: "b".repeat(64),
    expiresAt: "2099-01-01T00:00:00.000Z",
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "credit_bonus_seed",
      actorType: "system",
      actorRef: "settlement_worker"
    }
  }));
  store.creditCoins(validCredit({
    amountUnits: 5,
    sourceRef: "paid_seed",
    sourceDigest: "c".repeat(64),
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "credit_paid_seed",
      actorType: "system",
      actorRef: "settlement_worker"
    }
  }));
  const reward = store.creditCoins(validCredit({
    coinType: "reward_coins",
    amountUnits: 6,
    availability: "pending",
    sourceRef: "reward_seed",
    sourceDigest: "d".repeat(64),
    policyRef: "reward_policy",
    policyVersion: 1,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "credit_reward_seed",
      actorType: "system",
      actorRef: "settlement_worker"
    }
  }));
  store.confirmCoinCredit({
    lotRef: reward.resultRef,
    amountUnits: 6,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "confirm_reward_seed",
      actorType: "system",
      actorRef: "reward_confirmer"
    }
  });
}

test("factory rejects every extra or non-data option without invoking accessors", () => {
  assert.throws(
    () => createCoinWalletTransactionParticipant(),
    (error) => error?.code === "invalid_store_contract"
  );

  const database = createSyntheticDatabase();
  try {
    let accessorReads = 0;
    const invalidOptions = [
      { database, extra: true },
      { database, dbPath: "ignored.sqlite" },
      Object.assign({ database }, { [Symbol("escape")]: true }),
      Object.defineProperty({ database }, "extra", {
        enumerable: true,
        get() {
          accessorReads += 1;
          return true;
        }
      }),
      Object.defineProperty({}, "database", {
        enumerable: true,
        get() {
          accessorReads += 1;
          return database;
        }
      }),
      Object.defineProperty({ database }, "extra", {
        enumerable: false,
        value: true
      })
    ];
    for (const options of invalidOptions) {
      expectCode(
        () => createCoinWalletTransactionParticipant(options),
        "invalid_store_contract"
      );
    }
    assert.equal(accessorReads, 0);
  } finally {
    database.close();
  }
});

test("factory validates exact schema and exposes six own enumerable data methods", () => {
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
    assert.deepEqual(Reflect.ownKeys(participant), PARTICIPANT_METHODS);
    for (const method of PARTICIPANT_METHODS) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(participant, method), {
        value: participant[method],
        writable: true,
        enumerable: true,
        configurable: true
      });
      assert.equal(typeof participant[method], "function");
    }
    assert.deepEqual(
      Reflect.ownKeys(participant).filter((key) => typeof key === "symbol"),
      []
    );
    for (const escape of ["database", "db", "close", "transaction", "run"]) {
      assert.equal(escape in participant, false);
    }
  } finally {
    database.close();
  }
});

test("all six methods gate false, missing, and throwing state before poisoned input", () => {
  const transactionStates = [
    ["false", () => false],
    ["missing", () => undefined],
    ["throwing", () => {
      throw new Error("synthetic transaction-state fault");
    }]
  ];
  for (const [state, readInTransaction] of transactionStates) {
    const database = createSyntheticDatabase();
    try {
      const participant = createCoinWalletTransactionParticipant({
        database: overrideInTransaction(database, readInTransaction)
      });
      for (const method of PARTICIPANT_METHODS) {
        let poisonReads = 0;
        const poisonedInput = new Proxy({}, {
          get() {
            poisonReads += 1;
            throw new Error(`poisoned ${state} input`);
          },
          getOwnPropertyDescriptor() {
            poisonReads += 1;
            throw new Error(`poisoned ${state} input`);
          },
          getPrototypeOf() {
            poisonReads += 1;
            throw new Error(`poisoned ${state} input`);
          },
          ownKeys() {
            poisonReads += 1;
            throw new Error(`poisoned ${state} input`);
          }
        });
        expectCode(
          () => participant[method](poisonedInput),
          "wallet_transaction_required"
        );
        assert.equal(poisonReads, 0, `${method} inspected ${state} input`);
      }
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
    const before = walletFinancialSnapshot(database);

    const outer = database.transaction(() => {
      participant.createCoinHoldInTransaction(validHold());
      throw new Error("synthetic_outer_failure");
    });
    assert.throws(() => outer.immediate(), /synthetic_outer_failure/);
    assert.deepEqual(walletFinancialSnapshot(database), before);
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
  const clock = { value: NOW };
  const locked = createLockedUtcDatabase(database, clock);
  const refs = makeObservedRefFactory();
  const store = createSqliteCoinWalletStore({
    database: locked.database,
    nowFn: () => new Date(NOW),
    refFactory: refs
  });
  seedAllocationWallet(store);
  return {
    database,
    clock,
    locked,
    refs,
    store,
    participant: participant
      ? createCoinWalletTransactionParticipant({
          database: locked.database,
          nowFn: () => new Date(NOW),
          refFactory: refs
        })
      : null
  };
}

function runParticipant(database, action) {
  return database.transaction(action).immediate();
}

function invokeMutation(fixture, operation, input) {
  if (!fixture.participant) return fixture.store[operation](input);
  const participantMethod = {
    createCoinHold: "createCoinHoldInTransaction",
    captureCoinHold: "captureCoinHoldInTransaction",
    releaseCoinHold: "releaseCoinHoldInTransaction"
  }[operation];
  return runParticipant(
    fixture.database,
    () => fixture.participant[participantMethod](input)
  );
}

function setWalletStatus(fixture, status) {
  fixture.database.prepare(`
    update platform_coin_wallets set status = ? where account_id = 'account_1'
  `).run(status);
}

const HOLD_SUCCESS_REF_CALLS = [
  "operation",
  "hold",
  "allocation",
  "ledger_entry",
  "allocation",
  "ledger_entry",
  "allocation",
  "ledger_entry"
];
const LIFECYCLE_SUCCESS_REF_CALLS = [
  "ledger_entry",
  "ledger_entry",
  "ledger_entry",
  "operation"
];

function setupActiveHold(fixture, overrides = {}) {
  const result = invokeMutation(
    fixture,
    "createCoinHold",
    validHold({
      expiresAt: "2026-07-27T12:34:56.000Z",
      ...overrides
    })
  );
  assert.equal(result.safeResultCode, "held");
  fixture.holdRef = result.resultRef;
}

function outcomeSignatures(outcomes) {
  return outcomes.map((outcome) => outcome.kind === "error"
    ? `error:${outcome.value.code}`
    : `result:${outcome.value.safeResultCode}:${outcome.value.replayed}`);
}

const PARITY_SCENARIOS = [
  {
    name: "create success",
    expected: ["result:held:false"],
    expectedRefs: HOLD_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "createCoinHold",
        validHold()
      ))
    ]
  },
  {
    name: "create replay",
    expected: ["result:held:false", "result:held:true"],
    expectedRefs: HOLD_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(fixture, "createCoinHold", validHold())),
      mutationOutcome(() => invokeMutation(fixture, "createCoinHold", validHold()))
    ]
  },
  {
    name: "create insufficient",
    expected: ["result:insufficient_balance:false"],
    expectedRefs: ["operation"],
    expectedClockReads: 1,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "createCoinHold",
        validHold({ amountUnits: 16 })
      ))
    ]
  },
  {
    name: "create drift",
    expected: ["result:held:false", "error:idempotency_conflict"],
    expectedRefs: HOLD_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(fixture, "createCoinHold", validHold())),
      mutationOutcome(() => invokeMutation(
        fixture,
        "createCoinHold",
        validHold({ amountUnits: 11 })
      ))
    ]
  },
  {
    name: "create expiry",
    expected: ["error:invalid_coin_expiry"],
    expectedRefs: [],
    expectedClockReads: 1,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "createCoinHold",
        validHold({ expiresAt: NOW })
      ))
    ]
  },
  ...["frozen", "closed"].map((status) => ({
    name: `create ${status} Wallet`,
    expected: ["error:wallet_not_active"],
    expectedRefs: [],
    expectedClockReads: 0,
    setup: (fixture) => setWalletStatus(fixture, status),
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(fixture, "createCoinHold", validHold()))
    ]
  })),
  {
    name: "capture success",
    expected: ["result:captured:false"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "captureCoinHold",
        validCapture(fixture.holdRef)
      ))
    ]
  },
  {
    name: "capture replay",
    expected: ["result:captured:false", "result:captured:true"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "captureCoinHold",
        validCapture(fixture.holdRef)
      )),
      mutationOutcome(() => invokeMutation(
        fixture,
        "captureCoinHold",
        validCapture(fixture.holdRef)
      ))
    ]
  },
  {
    name: "capture drift",
    expected: ["result:captured:false", "error:idempotency_conflict"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "captureCoinHold",
        validCapture(fixture.holdRef)
      )),
      mutationOutcome(() => invokeMutation(
        fixture,
        "captureCoinHold",
        validCapture("hold_other")
      ))
    ]
  },
  {
    name: "capture expired Hold",
    expected: ["result:hold_expired:false"],
    expectedRefs: ["operation"],
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => {
      fixture.clock.value = "2026-07-27T12:34:56.000Z";
      return [
        mutationOutcome(() => invokeMutation(
          fixture,
          "captureCoinHold",
          validCapture(fixture.holdRef)
        ))
      ];
    }
  },
  ...["frozen", "closed"].map((status) => ({
    name: `capture ${status} Wallet`,
    expected: ["error:wallet_not_active"],
    expectedRefs: [],
    expectedClockReads: 0,
    setup: (fixture) => {
      setupActiveHold(fixture);
      setWalletStatus(fixture, status);
    },
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "captureCoinHold",
        validCapture(fixture.holdRef)
      ))
    ]
  })),
  {
    name: "release success",
    expected: ["result:released:false"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "releaseCoinHold",
        validRelease(fixture.holdRef)
      ))
    ]
  },
  {
    name: "release replay",
    expected: ["result:released:false", "result:released:true"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "releaseCoinHold",
        validRelease(fixture.holdRef)
      )),
      mutationOutcome(() => invokeMutation(
        fixture,
        "releaseCoinHold",
        validRelease(fixture.holdRef)
      ))
    ]
  },
  {
    name: "release drift",
    expected: ["result:released:false", "error:idempotency_conflict"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: setupActiveHold,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "releaseCoinHold",
        validRelease(fixture.holdRef)
      )),
      mutationOutcome(() => invokeMutation(
        fixture,
        "releaseCoinHold",
        validRelease("hold_other")
      ))
    ]
  },
  ...["frozen", "closed"].map((status) => ({
    name: `release ${status} Wallet`,
    expected: ["result:released:false"],
    expectedRefs: LIFECYCLE_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    setup: (fixture) => {
      setupActiveHold(fixture);
      setWalletStatus(fixture, status);
    },
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "releaseCoinHold",
        validRelease(fixture.holdRef)
      ))
    ]
  })),
  {
    name: "fixed bonus paid reward allocation",
    expected: ["result:held:false"],
    expectedRefs: HOLD_SUCCESS_REF_CALLS,
    expectedClockReads: 1,
    act: (fixture) => [
      mutationOutcome(() => invokeMutation(
        fixture,
        "createCoinHold",
        validHold({ amountUnits: 12 })
      ))
    ],
    verify: (fixture) => {
      assert.deepEqual(fixture.database.prepare(`
        select l.coin_type, a.allocation_sequence, a.allocated_units
          from platform_coin_hold_allocations a
          join platform_coin_lots l on l.lot_ref = a.lot_ref
         order by a.allocation_sequence
      `).all(), [
        { coin_type: "bonus_coins", allocation_sequence: 1, allocated_units: 4 },
        { coin_type: "paid_coins", allocation_sequence: 2, allocated_units: 5 },
        { coin_type: "reward_coins", allocation_sequence: 3, allocated_units: 3 }
      ]);
    }
  }
];

for (const scenario of PARITY_SCENARIOS) {
  test(`public and participant parity: ${scenario.name}`, () => {
    const publicFixture = createMutationFixture();
    const participantFixture = createMutationFixture({ participant: true });
    try {
      scenario.setup?.(publicFixture);
      scenario.setup?.(participantFixture);
      const publicRefOffset = publicFixture.refs.calls().length;
      const participantRefOffset = participantFixture.refs.calls().length;
      const publicClockOffset = publicFixture.locked.reads();
      const participantClockOffset = participantFixture.locked.reads();

      const publicOutcomes = scenario.act(publicFixture);
      const participantOutcomes = scenario.act(participantFixture);
      assertExactMutationOutcomes(publicOutcomes);
      assertExactMutationOutcomes(participantOutcomes);
      assert.deepEqual(outcomeSignatures(publicOutcomes), scenario.expected);
      assert.deepEqual(participantOutcomes, publicOutcomes);
      assert.deepEqual(
        publicFixture.refs.calls().slice(publicRefOffset),
        scenario.expectedRefs
      );
      assert.deepEqual(
        participantFixture.refs.calls().slice(participantRefOffset),
        scenario.expectedRefs
      );
      assert.equal(
        publicFixture.locked.reads() - publicClockOffset,
        scenario.expectedClockReads
      );
      assert.equal(
        participantFixture.locked.reads() - participantClockOffset,
        scenario.expectedClockReads
      );
      assert.deepEqual(
        walletFinancialSnapshot(participantFixture.database),
        walletFinancialSnapshot(publicFixture.database)
      );
      scenario.verify?.(publicFixture);
      scenario.verify?.(participantFixture);
    } finally {
      publicFixture.database.close();
      participantFixture.database.close();
    }
  });
}

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
