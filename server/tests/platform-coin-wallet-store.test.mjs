import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  canonicalWalletRequestDigest
} from "../services/platform/coin-wallet-domain.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  createSqliteCoinWalletStore
} from "../services/platform/coin-wallet-store.mjs";

const NOW = "2026-07-23T12:34:56.000Z";
const BONUS_EXPIRY = "2026-08-23T12:34:56.000Z";
const STORE_METHODS = [
  "captureCoinHold",
  "close",
  "confirmCoinCredit",
  "createCoinHold",
  "creditCoins",
  "expireCoinHold",
  "expireCoinLot",
  "getHold",
  "getLot",
  "getOperationReceipt",
  "getWallet",
  "getWalletByAccountId",
  "getWalletProjection",
  "listHolds",
  "listLedgerEntries",
  "listLots",
  "releaseCoinHold"
];

function withTempDirectory(prefix, action) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return action(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50
    });
  }
}

function createSyntheticDatabase(dbPath = ":memory:") {
  const database = new Database(dbPath);
  try {
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
  } catch (error) {
    database.close();
    throw error;
  }
}

function insertAccount(database, accountId) {
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `owner_${accountId}`, NOW, NOW);
}

function makeRefFactory(overrides = {}) {
  const counts = new Map();
  return (kind) => {
    const count = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, count);
    if (typeof overrides[kind] === "function") {
      return overrides[kind](count);
    }
    if (typeof overrides[kind] === "string") return overrides[kind];
    return `${kind}_${count}`;
  };
}

function createStore(database, options = {}) {
  return createSqliteCoinWalletStore({
    database,
    nowFn: options.nowFn ?? (() => new Date(NOW)),
    refFactory: options.refFactory ?? makeRefFactory()
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
    ...overrides,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "credit_1",
      actorType: "system",
      actorRef: "settlement_worker",
      ...(overrides.operation ?? {})
    }
  };
}

function validConfirmation(overrides = {}) {
  return {
    lotRef: "lot_1",
    amountUnits: 4,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "confirm_1",
      actorType: "system",
      actorRef: "reward_confirmer"
    },
    ...overrides,
    operation: {
      actorScope: "account:account_1",
      idempotencyKey: "confirm_1",
      actorType: "system",
      actorRef: "reward_confirmer",
      ...(overrides.operation ?? {})
    }
  };
}

function validHold(overrides = {}) {
  return {
    walletRef: "wallet_1",
    purpose: "product_purchase",
    purposeRef: "order_1",
    amountUnits: 10,
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
    expiresAt: "2026-07-24T12:34:56.000Z",
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

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.message, "Coin wallet store operation rejected");
    assert.doesNotMatch(
      JSON.stringify({
        message: error?.message,
        code: error?.code
      }),
      /select |insert |update |pragma |sqlite|platform_coin|account_1/i
    );
    return true;
  });
}

function countRows(database, table) {
  return database.prepare(`select count(*) from ${table}`).pluck().get();
}

function financialCounts(database) {
  return {
    wallets: countRows(database, "platform_coin_wallets"),
    receipts: countRows(database, "platform_coin_operation_receipts"),
    origins: countRows(database, "platform_coin_credit_origins"),
    lots: countRows(database, "platform_coin_lots"),
    ledger: countRows(database, "platform_coin_ledger_entries")
  };
}

function holdFinancialSnapshot(database) {
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

function createFixedDatabaseTimeConnection(
  database,
  timestamp = NOW,
  onDatabaseTimeRead = () => {}
) {
  return {
    pragma: (...args) => database.pragma(...args),
    prepare: (sql) => {
      if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
        return {
          pluck() {
            return {
              get() {
                onDatabaseTimeRead();
                return timestamp;
              }
            };
          }
        };
      }
      return database.prepare(sql);
    },
    transaction: (...args) => database.transaction(...args)
  };
}

function createObservedDatabase(database) {
  let rejectUnboundedProjectionReads = false;
  return {
    connection: {
      pragma: (...args) => database.pragma(...args),
      prepare: (sql) => {
        if (
          rejectUnboundedProjectionReads
          && (
            /select\s+\*\s+from\s+platform_coin_lots[\s\S]+where\s+wallet_ref/i.test(sql)
            || /select\s+allocation\.lot_ref[\s\S]+platform_coin_hold_allocations/i.test(sql)
          )
        ) {
          throw new Error("unbounded projection read");
        }
        return database.prepare(sql);
      },
      transaction: (...args) => database.transaction(...args)
    },
    arm() {
      rejectUnboundedProjectionReads = true;
    }
  };
}

function createInvalidDatabaseTimeConnection(database) {
  return {
    pragma: (...args) => database.pragma(...args),
    prepare: (sql) => {
      if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
        return {
          pluck() {
            return {
              get() {
                return "not-a-database-time";
              }
            };
          }
        };
      }
      return database.prepare(sql);
    },
    transaction: (...args) => database.transaction(...args)
  };
}

function createHoldWriteProbeConnection(database) {
  let fault = null;
  let lotUpdateAttempts = 0;
  let walletUpdateAttempts = 0;
  let receiptCompletionAttempts = 0;
  return {
    connection: {
      pragma: (...args) => database.pragma(...args),
      prepare: (sql) => {
        const statement = database.prepare(sql);
        const isLotUpdate = (
          /update\s+platform_coin_lots[\s\S]*set\s+available_units\s*=/i.test(sql)
          && /held_units\s*=/i.test(sql)
        );
        const isWalletUpdate = (
          /update\s+platform_coin_wallets[\s\S]*set\s+version\s*=/i.test(sql)
          && /status\s*=\s*'active'/i.test(sql)
        );
        const isReceiptCompletion = (
          /update\s+platform_coin_operation_receipts[\s\S]*set\s+status\s*=\s*'succeeded'/i.test(sql)
          && /safe_result_code\s*=/i.test(sql)
        );
        if (!isLotUpdate && !isWalletUpdate && !isReceiptCompletion) {
          return statement;
        }
        return {
          run(...args) {
            if (isLotUpdate) {
              lotUpdateAttempts += 1;
              if (fault === "later_lot" && lotUpdateAttempts === 2) {
                return { changes: 0 };
              }
            }
            if (isWalletUpdate) {
              walletUpdateAttempts += 1;
              if (fault === "wallet") return { changes: 0 };
            }
            if (isReceiptCompletion) {
              receiptCompletionAttempts += 1;
              if (fault === "receipt") return { changes: 0 };
            }
            return statement.run(...args);
          }
        };
      },
      transaction: (...args) => database.transaction(...args)
    },
    arm(nextFault) {
      fault = nextFault;
      lotUpdateAttempts = 0;
      walletUpdateAttempts = 0;
      receiptCompletionAttempts = 0;
    },
    counts() {
      return {
        lotUpdateAttempts,
        walletUpdateAttempts,
        receiptCompletionAttempts
      };
    }
  };
}

test("factory requires exactly one connection source and fails closed on missing schema", () => {
  expectCode(() => createSqliteCoinWalletStore(), "invalid_store_contract");
  expectCode(() => createSqliteCoinWalletStore(null), "invalid_store_contract");

  const both = new Database(":memory:");
  try {
    expectCode(
      () => createSqliteCoinWalletStore({
        dbPath: "D:\\synthetic.sqlite",
        database: both
      }),
      "invalid_store_contract"
    );
  } finally {
    both.close();
  }

  const injected = new Database(":memory:");
  try {
    injected.exec("create table platform_accounts (id text primary key)");
    expectCode(
      () => createSqliteCoinWalletStore({ database: injected }),
      "coin_wallet_schema_not_ready"
    );
    assert.equal(injected.open, true);
  } finally {
    if (injected.open) injected.close();
  }

  withTempDirectory("coin-wallet-store-missing-", (directory) => {
    expectCode(
      () => createSqliteCoinWalletStore({
        dbPath: join(directory, "missing.sqlite")
      }),
      "coin_wallet_schema_not_ready"
    );
  });
});

test("factory validates exact schema, exposes only bounded methods, and owns close correctly", () => {
  const injected = createSyntheticDatabase();
  let store;
  try {
    const beforeSchema = injected.prepare(
      "select type, name, sql from sqlite_master order by type, name"
    ).all();
    store = createStore(injected);
    assert.equal("database" in store, false);
    assert.equal("transaction" in store, false);
    assert.equal("runInTransaction" in store, false);
    assert.deepEqual(injected.prepare(
      "select type, name, sql from sqlite_master order by type, name"
    ).all(), beforeSchema);
    store.close();
    store.close();
    assert.equal(injected.open, true);
    assert.equal(injected.prepare("select 1").pluck().get(), 1);
  } finally {
    store?.close();
    if (injected.open) injected.close();
  }

  withTempDirectory("coin-wallet-store-owned-", (directory) => {
    const dbPath = join(directory, "wallet.sqlite");
    const setup = createSyntheticDatabase(dbPath);
    let journalMode;
    let schema;
    try {
      journalMode = setup.pragma("journal_mode", { simple: true });
      schema = setup.prepare(
        "select type, name, sql from sqlite_master order by type, name"
      ).all();
    } finally {
      setup.close();
    }

    let ownedStore;
    try {
      ownedStore = createSqliteCoinWalletStore({
        dbPath,
        nowFn: () => new Date(NOW),
        refFactory: makeRefFactory()
      });
      ownedStore.close();
      ownedStore.close();
      expectCode(() => ownedStore.getWallet("wallet_1"), "store_closed");
    } finally {
      ownedStore?.close();
    }

    const readback = new Database(dbPath);
    try {
      assert.equal(readback.pragma("journal_mode", { simple: true }), journalMode);
      assert.deepEqual(readback.prepare(
        "select type, name, sql from sqlite_master order by type, name"
      ).all(), schema);
    } finally {
      readback.close();
    }
  });
});

test("core-only Store surface and source contain no deferred recovery APIs or SQL", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    for (const method of [
      "getRecoveryCase",
      "getRecoveryResolution",
      "listRecoveryCases",
      "listRecoveryResolutions"
    ]) {
      assert.equal(method in store, false);
    }
    const source = readFileSync(
      new URL("../services/platform/coin-wallet-store.mjs", import.meta.url),
      "utf8"
    );
    assert.doesNotMatch(
      source,
      /platform_coin_(?:recovery|reversal|restriction)|Recovery|RECOVERY/
    );
  } finally {
    store?.close();
    database.close();
  }
});

test("constructor validation normalizes BUSY and LOCKED families to wallet_busy", () => {
  for (const sqliteCode of ["SQLITE_BUSY_RECOVERY", "SQLITE_LOCKED_SHAREDCACHE"]) {
    const injected = {
      prepare() {
        const error = new Error(`raw constructor detail for ${sqliteCode}`);
        error.code = sqliteCode;
        throw error;
      }
    };
    expectCode(
      () => createSqliteCoinWalletStore({ database: injected }),
      "wallet_busy"
    );
  }
});

test("missing-wallet projection is exact and performs zero writes", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const changesBefore = database.prepare("select total_changes()").pluck().get();
    const rowsBefore = financialCounts(database);
    assert.deepEqual(store.getWalletProjection({ accountId: "account_1" }), {
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
    assert.equal(database.prepare("select total_changes()").pluck().get(), changesBefore);
    assert.deepEqual(financialCounts(database), rowsBefore);
    assert.equal(store.getWallet("wallet_missing"), null);
    assert.equal(store.getWalletByAccountId("account_missing"), null);
  } finally {
    store.close();
    database.close();
  }
});

test("first paid, bonus, and reward credits create exact initial states and one version interval", () => {
  const database = createSyntheticDatabase();
  for (const accountId of ["paid_account", "bonus_account", "reward_account"]) {
    insertAccount(database, accountId);
  }
  const store = createStore(database);
  try {
    const paid = store.creditCoins(validCredit({
      accountId: "paid_account",
      operation: {
        actorScope: "account:paid_account",
        idempotencyKey: "paid_credit"
      }
    }));
    const bonus = store.creditCoins(validCredit({
      accountId: "bonus_account",
      coinType: "bonus_coins",
      amountUnits: 7,
      sourceType: "approved_bonus",
      sourceRef: "bonus_source",
      sourceDigest: "b".repeat(64),
      expiresAt: BONUS_EXPIRY,
      operation: {
        actorScope: "account:bonus_account",
        idempotencyKey: "bonus_credit"
      }
    }));
    const reward = store.creditCoins(validCredit({
      accountId: "reward_account",
      coinType: "reward_coins",
      amountUnits: 11,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      sourceDigest: "c".repeat(64),
      policyRef: "reward_policy_1",
      policyVersion: 3,
      operation: {
        actorScope: "account:reward_account",
        idempotencyKey: "reward_credit"
      }
    }));

    for (const result of [paid, bonus, reward]) {
      assert.deepEqual(Object.keys(result).sort(), [
        "ok",
        "operationRef",
        "previousWalletVersion",
        "replayed",
        "resultRef",
        "resultingWalletStatus",
        "resultingWalletVersion",
        "safeResultCode",
        "walletRef"
      ]);
      assert.equal(result.ok, true);
      assert.equal(result.replayed, false);
      assert.equal(result.safeResultCode, "credited");
      assert.equal(result.previousWalletVersion, 0);
      assert.equal(result.resultingWalletVersion, 1);
      assert.equal(result.resultingWalletStatus, "active");
      assert.equal(store.getWallet(result.walletRef).version, 1);
      assert.equal(store.getLot(result.resultRef).walletRef, result.walletRef);
      assert.equal("wallet" in result, false);
      assert.equal("result" in result, false);
    }

    const paidLot = store.getLot(paid.resultRef);
    assert.deepEqual({
      pending: paidLot.pendingUnits,
      available: paidLot.availableUnits,
      policyRef: paidLot.policyRef,
      policyVersion: paidLot.policyVersion,
      expiresAt: paidLot.expiresAt
    }, {
      pending: 0,
      available: 25,
      policyRef: null,
      policyVersion: null,
      expiresAt: null
    });
    const bonusLot = store.getLot(bonus.resultRef);
    assert.deepEqual({
      pending: bonusLot.pendingUnits,
      available: bonusLot.availableUnits,
      policyRef: bonusLot.policyRef,
      policyVersion: bonusLot.policyVersion,
      expiresAt: bonusLot.expiresAt
    }, {
      pending: 0,
      available: 7,
      policyRef: null,
      policyVersion: null,
      expiresAt: BONUS_EXPIRY
    });
    const rewardLot = store.getLot(reward.resultRef);
    assert.deepEqual({
      pending: rewardLot.pendingUnits,
      available: rewardLot.availableUnits,
      policyRef: rewardLot.policyRef,
      policyVersion: rewardLot.policyVersion,
      expiresAt: rewardLot.expiresAt
    }, {
      pending: 11,
      available: 0,
      policyRef: "reward_policy_1",
      policyVersion: 3,
      expiresAt: null
    });

    assert.deepEqual(financialCounts(database), {
      wallets: 3,
      receipts: 3,
      origins: 3,
      lots: 3,
      ledger: 3
    });
    assert.deepEqual(database.prepare(`
      select previous_wallet_version, resulting_wallet_version
        from platform_coin_ledger_entries
       order by entry_ref
    `).all(), [
      { previous_wallet_version: 0, resulting_wallet_version: 1 },
      { previous_wallet_version: 0, resulting_wallet_version: 1 },
      { previous_wallet_version: 0, resulting_wallet_version: 1 }
    ]);
    assert.deepEqual(database.prepare(`
      select source_digest
        from platform_coin_credit_origins
       order by source_digest
    `).pluck().all(), [
      "a".repeat(64),
      "b".repeat(64),
      "c".repeat(64)
    ]);
    for (const result of [paid, bonus, reward]) {
      assert.deepEqual(database.prepare(`
        select wallet_ref, status, previous_wallet_version,
               resulting_wallet_version, resulting_wallet_status,
               result_ref, safe_result_code, completed_at
          from platform_coin_operation_receipts
         where operation_ref = ?
      `).get(result.operationRef), {
        wallet_ref: result.walletRef,
        status: "succeeded",
        previous_wallet_version: 0,
        resulting_wallet_version: 1,
        resulting_wallet_status: "active",
        result_ref: result.resultRef,
        safe_result_code: "credited",
        completed_at: NOW
      });
    }
  } finally {
    store.close();
    database.close();
  }
});

test("credit validation rejects invalid states, types, expiry, policy, and units before writing", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const cases = [
      [validCredit({ coinType: "fiat" }), "invalid_coin_type"],
      [validCredit({ amountUnits: 0 }), "invalid_coin_units"],
      [validCredit({ amountUnits: -1 }), "invalid_coin_units"],
      [validCredit({ amountUnits: 1.5 }), "invalid_coin_units"],
      [validCredit({ amountUnits: Number.MAX_SAFE_INTEGER + 1 }), "invalid_coin_units"],
      [validCredit({ availability: "pending" }), "invalid_credit_state"],
      [validCredit({
        coinType: "bonus_coins",
        availability: "pending"
      }), "invalid_credit_state"],
      [validCredit({
        coinType: "reward_coins",
        availability: "available",
        policyRef: "reward_policy_1",
        policyVersion: 1
      }), "invalid_credit_state"],
      [validCredit({ expiresAt: BONUS_EXPIRY }), "invalid_coin_expiry"],
      [validCredit({
        coinType: "reward_coins",
        availability: "pending",
        policyRef: "reward_policy_1",
        policyVersion: 1,
        expiresAt: BONUS_EXPIRY
      }), "invalid_coin_expiry"],
      [validCredit({
        coinType: "bonus_coins",
        expiresAt: "not-a-time"
      }), "invalid_wallet_timestamp"],
      [validCredit({
        policyRef: "not_allowed",
        policyVersion: 1
      }), "invalid_coin_policy"],
      [validCredit({
        coinType: "reward_coins",
        availability: "pending"
      }), "invalid_coin_policy"],
      [validCredit({
        coinType: "reward_coins",
        availability: "pending",
        policyRef: "reward_policy_1",
        policyVersion: null
      }), "invalid_coin_policy"],
      [validCredit({
        coinType: "reward_coins",
        availability: "pending",
        policyRef: "reward_policy_1",
        policyVersion: 0
      }), "invalid_coin_policy"],
      [validCredit({
        operation: {
          actorScope: " account:account_1"
        }
      }), "non_normalized_wallet_request"],
      [{
        ...validCredit(),
        unexpected: "forbidden"
      }, "invalid_wallet_request"],
      [validCredit({
        operation: {
          unexpected: "forbidden"
        }
      }), "invalid_wallet_request"]
    ];

    for (const [input, code] of cases) {
      expectCode(() => store.creditCoins(input), code);
    }
    assert.deepEqual(financialCounts(database), {
      wallets: 0,
      receipts: 0,
      origins: 0,
      lots: 0,
      ledger: 0
    });
  } finally {
    store.close();
    database.close();
  }
});

test("missing account fails without lazily creating a wallet", () => {
  const database = createSyntheticDatabase();
  const store = createStore(database);
  try {
    expectCode(() => store.creditCoins(validCredit()), "account_not_found");
    assert.deepEqual(financialCounts(database), {
      wallets: 0,
      receipts: 0,
      origins: 0,
      lots: 0,
      ledger: 0
    });
  } finally {
    store.close();
    database.close();
  }
});

test("lazy wallet creation observes an already-claimed started receipt", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    database.exec(`
      create trigger test_wallet_requires_started_receipt
      before insert on platform_coin_wallets
      when not exists (
        select 1
          from platform_coin_operation_receipts
         where status = 'started'
           and wallet_ref is null
           and actor_scope = 'account:' || new.account_id
           and operation_type = 'credit_coins'
      )
      begin
        select raise(abort, 'started_receipt_required');
      end
    `);

    const result = store.creditCoins(validCredit());
    assert.equal(result.walletRef, "wallet_1");
    assert.equal(database.prepare(`
      select status
        from platform_coin_operation_receipts
       where operation_ref = ?
    `).pluck().get(result.operationRef), "succeeded");
  } finally {
    store.close();
    database.close();
  }
});

test("maximum safe credit succeeds and aggregate overflow rolls back every second-operation write", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const maximum = store.creditCoins(validCredit({
      amountUnits: Number.MAX_SAFE_INTEGER
    }));
    assert.equal(
      store.getLot(maximum.resultRef).issuedUnits,
      Number.MAX_SAFE_INTEGER
    );

    expectCode(() => store.creditCoins(validCredit({
      amountUnits: 1,
      sourceRef: "source_2",
      sourceDigest: "b".repeat(64),
      operation: {
        idempotencyKey: "credit_2"
      }
    })), "coin_units_overflow");
    assert.equal(store.getWalletByAccountId("account_1").version, 1);
    assert.deepEqual(financialCounts(database), {
      wallets: 1,
      receipts: 1,
      origins: 1,
      lots: 1,
      ledger: 1
    });
  } finally {
    store.close();
    database.close();
  }
});

test("same operation key and computed digest replays; digest drift conflicts without writes", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const input = validCredit();
    const first = store.creditCoins(input);
    const replay = store.creditCoins(input);
    assert.deepEqual(replay, {
      ...first,
      replayed: true
    });

    const expectedDigest = canonicalWalletRequestDigest("credit_coins", {
      accountId: input.accountId,
      coinType: input.coinType,
      amountUnits: input.amountUnits,
      availability: input.availability,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceDigest: input.sourceDigest,
      expiresAt: input.expiresAt
    });
    assert.equal(store.getOperationReceipt({
      actorScope: input.operation.actorScope,
      operationType: "credit_coins",
      idempotencyKey: input.operation.idempotencyKey
    }).requestDigest, expectedDigest);

    expectCode(() => store.creditCoins({
      ...input,
      amountUnits: input.amountUnits + 1
    }), "idempotency_conflict");
    assert.deepEqual(financialCounts(database), {
      wallets: 1,
      receipts: 1,
      origins: 1,
      lots: 1,
      ledger: 1
    });
  } finally {
    store.close();
    database.close();
  }
});

test("closed replay remains exact after a later legitimate credit advances the wallet", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const input = validCredit();
    const first = store.creditCoins(input);
    const second = store.creditCoins(validCredit({
      amountUnits: 10,
      sourceRef: "source_2",
      sourceDigest: "b".repeat(64),
      operation: {
        idempotencyKey: "credit_2"
      }
    }));
    assert.deepEqual({
      previousWalletVersion: second.previousWalletVersion,
      resultingWalletVersion: second.resultingWalletVersion,
      currentWalletVersion: store.getWallet(first.walletRef).version
    }, {
      previousWalletVersion: 1,
      resultingWalletVersion: 2,
      currentWalletVersion: 2
    });
    const replay = store.creditCoins(input);
    assert.deepEqual(Object.keys(replay).sort(), [
      "ok",
      "operationRef",
      "previousWalletVersion",
      "replayed",
      "resultRef",
      "resultingWalletStatus",
      "resultingWalletVersion",
      "safeResultCode",
      "walletRef"
    ]);
    assert.deepEqual(replay, {
      ...first,
      replayed: true
    });
  } finally {
    store.close();
    database.close();
  }
});

test("replay fails closed for started and malformed terminal receipt shapes", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const input = validCredit();
    const requestDigest = canonicalWalletRequestDigest("credit_coins", {
      accountId: input.accountId,
      coinType: input.coinType,
      amountUnits: input.amountUnits,
      availability: input.availability,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      sourceDigest: input.sourceDigest,
      expiresAt: input.expiresAt
    });
    database.prepare(`
      insert into platform_coin_operation_receipts (
        operation_ref, wallet_ref, actor_scope, operation_type,
        idempotency_key, request_digest, status, previous_wallet_version,
        resulting_wallet_version, resulting_wallet_status, result_ref,
        safe_result_code, created_at, completed_at
      ) values (
        'operation_started', null, ?, 'credit_coins', ?, ?, 'started',
        null, null, null, null, null, ?, null
      )
    `).run(
      input.operation.actorScope,
      input.operation.idempotencyKey,
      requestDigest,
      NOW
    );
    expectCode(() => store.creditCoins(input), "idempotency_unavailable");

    database.exec(`
      drop trigger platform_coin_operation_receipts_terminal_immutable_update;
      drop trigger platform_coin_operation_receipts_immutable_delete;
      delete from platform_coin_operation_receipts;
    `);
    const first = store.creditCoins(input);
    database.pragma("ignore_check_constraints = ON");
    const restoreReceipt = database.prepare(`
      update platform_coin_operation_receipts
         set status = 'succeeded',
             previous_wallet_version = ?,
             resulting_wallet_version = ?,
             resulting_wallet_status = ?,
             result_ref = ?,
             safe_result_code = ?,
             completed_at = ?
       where operation_ref = ?
    `);
    const malformedMutations = [
      () => database.prepare(`
        update platform_coin_operation_receipts
           set status = 'failed',
               resulting_wallet_version = previous_wallet_version
         where operation_ref = ?
      `).run(first.operationRef),
      () => database.prepare(`
        update platform_coin_operation_receipts
           set resulting_wallet_version = previous_wallet_version
         where operation_ref = ?
      `).run(first.operationRef),
      () => database.prepare(`
        update platform_coin_operation_receipts
           set resulting_wallet_status = 'invalid_status'
         where operation_ref = ?
      `).run(first.operationRef),
      () => database.prepare(`
        update platform_coin_operation_receipts
           set completed_at = 'not-a-time'
         where operation_ref = ?
      `).run(first.operationRef),
      () => database.prepare(`
        update platform_coin_operation_receipts
           set result_ref = ''
         where operation_ref = ?
      `).run(first.operationRef),
      () => database.prepare(`
        update platform_coin_operation_receipts
           set safe_result_code = 'unsafe_internal_detail'
         where operation_ref = ?
      `).run(first.operationRef)
    ];
    for (const mutate of malformedMutations) {
      mutate();
      expectCode(() => store.creditCoins(input), "idempotency_unavailable");
      const restored = restoreReceipt.run(
        first.previousWalletVersion,
        first.resultingWalletVersion,
        first.resultingWalletStatus,
        first.resultRef,
        first.safeResultCode,
        NOW,
        first.operationRef
      );
      assert.equal(restored.changes, 1);
    }
  } finally {
    store.close();
    database.close();
  }
});

test("read option objects reject null and unexpected fields through safe errors", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const invalidCalls = [
      () => store.listLots(null),
      () => store.listLots({ walletRef: "wallet_1", unexpected: true }),
      () => store.listHolds(null),
      () => store.listLedgerEntries(null),
      () => store.getOperationReceipt(null)
    ];
    for (const action of invalidCalls) {
      expectCode(action, "invalid_wallet_request");
    }
  } finally {
    store.close();
    database.close();
  }
});

test("bounded list methods accept limit one and reject limits outside 1 through 500", () => {
  const database = createSyntheticDatabase();
  const store = createStore(database);
  try {
    const calls = [
      (limit) => store.listLots({
        walletRef: "wallet_1",
        includeDepleted: true,
        limit
      }),
      (limit) => store.listHolds({
        walletRef: "wallet_1",
        limit
      })
    ];
    for (const call of calls) {
      assert.deepEqual(call(1), []);
      expectCode(() => call(null), "invalid_pagination");
      expectCode(() => call(0), "invalid_pagination");
      expectCode(() => call(501), "invalid_pagination");
    }
  } finally {
    store.close();
    database.close();
  }
});

test("wallet projection uses bounded aggregates rather than loading every lot or allocation", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const observed = createObservedDatabase(database);
  const store = createStore(observed.connection);
  try {
    const credit = store.creditCoins(validCredit());
    observed.arm();
    assert.deepEqual(store.getWalletProjection({
      walletRef: credit.walletRef
    }), {
      exists: true,
      walletRef: credit.walletRef,
      status: "active",
      version: 1,
      totals: {
        paid_coins: 25,
        bonus_coins: 0,
        reward_coins: 0
      },
      spendableUnits: 25,
      heldUnits: 0,
      pendingUnits: 0
    });
  } finally {
    store.close();
    database.close();
  }
});

test("wallet projection fails closed on held-allocation drift and cross-wallet allocation", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  insertAccount(database, "account_2");
  const store = createStore(database);
  try {
    const first = store.creditCoins(validCredit());
    const second = store.creditCoins(validCredit({
      accountId: "account_2",
      sourceRef: "source_2",
      sourceDigest: "b".repeat(64),
      operation: {
        actorScope: "account:account_2",
        idempotencyKey: "credit_2"
      }
    }));
    database.prepare(`
      update platform_coin_lots
         set available_units = 24,
             held_units = 1
       where lot_ref = ?
    `).run(first.resultRef);
    expectCode(() => store.getWalletProjection({
      walletRef: first.walletRef
    }), "wallet_infrastructure_error");

    database.prepare(`
      insert into platform_coin_holds (
        hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
        expires_at, created_at, updated_at
      ) values (
        'cross_hold', ?, 'product_purchase', 'order_cross', 1, 'active',
        ?, ?, ?
      )
    `).run(second.walletRef, BONUS_EXPIRY, NOW, NOW);
    database.prepare(`
      insert into platform_coin_hold_allocations (
        allocation_ref, hold_ref, lot_ref, allocation_sequence,
        allocated_units, created_at
      ) values ('cross_allocation', 'cross_hold', ?, 1, 1, ?)
    `).run(first.resultRef, NOW);
    expectCode(() => store.getWalletProjection({
      walletRef: first.walletRef
    }), "wallet_infrastructure_error");
  } finally {
    store.close();
    database.close();
  }
});

test("busy and locked SQLite families map to wallet_busy without raw leakage", () => {
  for (const sqliteCode of ["SQLITE_BUSY_SNAPSHOT", "SQLITE_LOCKED_SHAREDCACHE"]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const injected = {
      pragma: (...args) => database.pragma(...args),
      prepare: (...args) => database.prepare(...args),
      transaction: () => ({
        immediate() {
          const error = new Error(`raw database detail for ${sqliteCode}`);
          error.code = sqliteCode;
          throw error;
        }
      })
    };
    const store = createStore(injected);
    try {
      expectCode(() => store.creditCoins(validCredit()), "wallet_busy");
      assert.deepEqual(financialCounts(database), {
        wallets: 0,
        receipts: 0,
        origins: 0,
        lots: 0,
        ledger: 0
      });
    } finally {
      store.close();
      database.close();
    }
  }
});

test("a different operation key cannot mint the same credit origin", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    store.creditCoins(validCredit());
    expectCode(() => store.creditCoins(validCredit({
      operation: {
        idempotencyKey: "credit_2"
      }
    })), "credit_origin_conflict");
    assert.equal(store.getWalletByAccountId("account_1").version, 1);
    assert.deepEqual(financialCounts(database), {
      wallets: 1,
      receipts: 1,
      origins: 1,
      lots: 1,
      ledger: 1
    });
  } finally {
    store.close();
    database.close();
  }
});

test("read methods map durable rows and apply closed list filters", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const paid = store.creditCoins(validCredit());
    const bonus = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 5,
      sourceType: "approved_bonus",
      sourceRef: "source_2",
      sourceDigest: "b".repeat(64),
      expiresAt: BONUS_EXPIRY,
      operation: {
        idempotencyKey: "credit_2"
      }
    }));
    database.prepare(`
      update platform_coin_lots
         set available_units = 0,
             consumed_units = issued_units,
             updated_at = ?
       where lot_ref = ?
    `).run(NOW, paid.resultRef);
    database.prepare(`
      update platform_coin_lots
         set available_units = 3,
             held_units = 2,
             updated_at = ?
       where lot_ref = ?
    `).run(NOW, bonus.resultRef);

    database.prepare(`
      insert into platform_coin_holds (
        hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
        expires_at, created_at, updated_at
      ) values (?, ?, 'product_purchase', ?, 2, 'active', ?, ?, ?)
    `).run("hold_1", paid.walletRef, "order_1", BONUS_EXPIRY, NOW, NOW);
    database.prepare(`
      insert into platform_coin_hold_allocations (
        allocation_ref, hold_ref, lot_ref, allocation_sequence,
        allocated_units, created_at
      ) values ('allocation_1', 'hold_1', ?, 1, 2, ?)
    `).run(bonus.resultRef, NOW);
    database.prepare(`
      insert into platform_coin_holds (
        hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
        expires_at, created_at, updated_at
      ) values ('hold_2', ?, 'product_purchase', 'order_2', 1, 'captured', ?, ?, ?)
    `).run(paid.walletRef, BONUS_EXPIRY, NOW, NOW);

    assert.equal(store.getWallet(paid.walletRef).accountId, "account_1");
    assert.equal(store.getWalletByAccountId("account_1").version, 2);
    assert.equal(store.getLot(paid.resultRef).consumedUnits, 25);
    assert.equal(store.getLot("lot_missing"), null);
    assert.deepEqual(
      store.listLots({ walletRef: paid.walletRef }).map(({ lotRef }) => lotRef),
      [bonus.resultRef]
    );
    assert.deepEqual(
      store.listLots({
        walletRef: paid.walletRef,
        includeDepleted: true,
        limit: 1
      }).map(({ lotRef }) => lotRef),
      [paid.resultRef]
    );
    assert.deepEqual(
      store.listLots({
        walletRef: paid.walletRef,
        coinType: "bonus_coins",
        includeDepleted: true
      }).map(({ lotRef }) => lotRef),
      [bonus.resultRef]
    );
    assert.equal(store.getHold("hold_1").status, "active");
    assert.equal(store.getHold("hold_missing"), null);
    assert.deepEqual(
      store.listHolds({
        walletRef: paid.walletRef,
        status: "active",
        limit: 1
      }).map(({ holdRef }) => holdRef),
      ["hold_1"]
    );
    assert.deepEqual(
      store.listHolds({
        walletRef: paid.walletRef,
        limit: 1
      }).map(({ holdRef }) => holdRef),
      ["hold_1"]
    );
    assert.deepEqual(store.getWalletProjection({
      walletRef: paid.walletRef
    }), {
      exists: true,
      walletRef: paid.walletRef,
      status: "active",
      version: 2,
      totals: {
        paid_coins: 0,
        bonus_coins: 3,
        reward_coins: 0
      },
      spendableUnits: 3,
      heldUnits: 2,
      pendingUnits: 0
    });
  } finally {
    store.close();
    database.close();
  }
});

test("ledger pagination is bounded and uses the descending compound cursor", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const timestamps = [
    "2026-07-23T12:34:54.000Z",
    "2026-07-23T12:34:55.000Z",
    "2026-07-23T12:34:56.000Z"
  ];
  const store = createStore(database, {
    nowFn: () => new Date(timestamps.shift())
  });
  try {
    for (let index = 1; index <= 3; index += 1) {
      store.creditCoins(validCredit({
        amountUnits: index,
        sourceRef: `source_${index}`,
        sourceDigest: String(index).repeat(64),
        operation: {
          idempotencyKey: `credit_${index}`
        }
      }));
    }
    const firstPage = store.listLedgerEntries({
      walletRef: "wallet_1",
      limit: 2
    });
    assert.deepEqual(firstPage.map(({ amountUnits }) => amountUnits), [3, 2]);
    const cursor = firstPage[1];
    const secondPage = store.listLedgerEntries({
      walletRef: "wallet_1",
      afterOccurredAt: cursor.occurredAt,
      afterEntryRef: cursor.entryRef,
      limit: 2
    });
    assert.deepEqual(secondPage.map(({ amountUnits }) => amountUnits), [1]);

    for (const limit of [0, -1, 1.5, 501, Number.MAX_SAFE_INTEGER + 1]) {
      expectCode(() => store.listLedgerEntries({
        walletRef: "wallet_1",
        limit
      }), "invalid_pagination");
    }
    expectCode(() => store.listLedgerEntries({
      walletRef: "wallet_1",
      afterOccurredAt: NOW
    }), "invalid_pagination");
    expectCode(() => store.listLedgerEntries({
      walletRef: "wallet_1",
      afterOccurredAt: "not-a-time",
      afterEntryRef: "entry_1"
    }), "invalid_wallet_timestamp");
  } finally {
    store.close();
    database.close();
  }
});

test("a late reference collision rolls back receipt, origin, lot, ledger, and version together", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database, {
    refFactory: makeRefFactory({
      lot: () => "lot_collision"
    })
  });
  try {
    store.creditCoins(validCredit());
    expectCode(() => store.creditCoins(validCredit({
      sourceRef: "source_2",
      sourceDigest: "b".repeat(64),
      operation: {
        idempotencyKey: "credit_2"
      }
    })), "wallet_infrastructure_error");
    assert.equal(store.getWalletByAccountId("account_1").version, 1);
    assert.deepEqual(financialCounts(database), {
      wallets: 1,
      receipts: 1,
      origins: 1,
      lots: 1,
      ledger: 1
    });
  } finally {
    store.close();
    database.close();
  }
});

test("confirmation exposes the exact method and rejects malformed shapes before transaction entry", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    const symbolRequest = validConfirmation();
    symbolRequest[Symbol("extra")] = true;
    const hiddenRequest = validConfirmation();
    Object.defineProperty(hiddenRequest, "hidden", { value: true });
    const symbolOperation = validConfirmation();
    symbolOperation.operation[Symbol("extra")] = true;
    const hiddenOperation = validConfirmation();
    Object.defineProperty(hiddenOperation.operation, "hidden", { value: true });
    const cases = [
      [null, "invalid_wallet_request"],
      [{ ...validConfirmation(), extra: true }, "invalid_wallet_request"],
      [symbolRequest, "invalid_wallet_request"],
      [hiddenRequest, "invalid_wallet_request"],
      [{ ...validConfirmation(), operation: null }, "invalid_wallet_request"],
      [validConfirmation({ operation: { extra: true } }), "invalid_wallet_request"],
      [symbolOperation, "invalid_wallet_request"],
      [hiddenOperation, "invalid_wallet_request"],
      [validConfirmation({ amountUnits: 0 }), "invalid_coin_units"],
      [validConfirmation({ amountUnits: -1 }), "invalid_coin_units"],
      [validConfirmation({ amountUnits: 1.5 }), "invalid_coin_units"],
      [validConfirmation({
        amountUnits: Number.MAX_SAFE_INTEGER + 1
      }), "invalid_coin_units"]
    ];
    const changesBefore = database.prepare("select total_changes()").pluck().get();
    for (const [input, code] of cases) {
      expectCode(() => store.confirmCoinCredit(input), code);
    }
    assert.equal(database.prepare("select total_changes()").pluck().get(), changesBefore);
    assert.deepEqual(financialCounts(database), {
      wallets: 0,
      receipts: 0,
      origins: 0,
      lots: 0,
      ledger: 0
    });
  } finally {
    store?.close();
    database.close();
  }
});

test("partial and full reward confirmation move pending to available with exact receipts and audit", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const credit = store.creditCoins(validCredit({
      coinType: "reward_coins",
      amountUnits: 11,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      sourceDigest: "c".repeat(64),
      policyRef: "reward_policy_1",
      policyVersion: 3
    }));
    const partialInput = validConfirmation({ lotRef: credit.resultRef });
    const partial = store.confirmCoinCredit(partialInput);
    assert.deepEqual(Object.keys(partial).sort(), [
      "ok",
      "operationRef",
      "previousWalletVersion",
      "replayed",
      "resultRef",
      "resultingWalletStatus",
      "resultingWalletVersion",
      "safeResultCode",
      "walletRef"
    ]);
    assert.deepEqual(partial, {
      ok: true,
      replayed: false,
      operationRef: "operation_2",
      walletRef: credit.walletRef,
      safeResultCode: "confirmed",
      resultRef: credit.resultRef,
      previousWalletVersion: 1,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active"
    });
    assert.deepEqual(store.getLot(credit.resultRef), {
      ...store.getLot(credit.resultRef),
      pendingUnits: 7,
      availableUnits: 4
    });

    const full = store.confirmCoinCredit(validConfirmation({
      lotRef: credit.resultRef,
      amountUnits: 7,
      operation: { idempotencyKey: "confirm_2" }
    }));
    assert.equal(full.previousWalletVersion, 2);
    assert.equal(full.resultingWalletVersion, 3);
    assert.equal(full.safeResultCode, "confirmed");
    assert.equal(full.resultRef, credit.resultRef);
    const lot = store.getLot(credit.resultRef);
    assert.equal(lot.pendingUnits, 0);
    assert.equal(lot.availableUnits, 11);
    assert.equal(store.getWallet(credit.walletRef).version, 3);

    const confirmationRows = database.prepare(`
      select operation_ref, wallet_ref, lot_ref, operation, amount_units,
             hold_ref, order_ref, source_type, source_ref, actor_type,
             actor_ref, previous_wallet_version, resulting_wallet_version,
             resulting_wallet_status, occurred_at
        from platform_coin_ledger_entries
       where operation = 'pending_to_available'
       order by previous_wallet_version
    `).all();
    assert.equal(confirmationRows.length, 2);
    assert.deepEqual(confirmationRows.map((row) => ({
      ...row,
      occurred_at: typeof row.occurred_at
    })), [
      {
        operation_ref: partial.operationRef,
        wallet_ref: credit.walletRef,
        lot_ref: credit.resultRef,
        operation: "pending_to_available",
        amount_units: 4,
        hold_ref: null,
        order_ref: null,
        source_type: "promotion_accrual",
        source_ref: "reward_source",
        actor_type: "system",
        actor_ref: "reward_confirmer",
        previous_wallet_version: 1,
        resulting_wallet_version: 2,
        resulting_wallet_status: "active",
        occurred_at: "string"
      },
      {
        operation_ref: full.operationRef,
        wallet_ref: credit.walletRef,
        lot_ref: credit.resultRef,
        operation: "pending_to_available",
        amount_units: 7,
        hold_ref: null,
        order_ref: null,
        source_type: "promotion_accrual",
        source_ref: "reward_source",
        actor_type: "system",
        actor_ref: "reward_confirmer",
        previous_wallet_version: 2,
        resulting_wallet_version: 3,
        resulting_wallet_status: "active",
        occurred_at: "string"
      }
    ]);
    for (const row of confirmationRows) {
      assert.equal(new Date(row.occurred_at).toISOString(), row.occurred_at);
    }
    assert.deepEqual(database.prepare(`
      select status, safe_result_code, result_ref, previous_wallet_version,
             resulting_wallet_version, resulting_wallet_status,
             created_at = completed_at as shared_timestamp
        from platform_coin_operation_receipts
       where operation_type = 'confirm_coin_credit'
       order by previous_wallet_version
    `).all(), [
      {
        status: "succeeded",
        safe_result_code: "confirmed",
        result_ref: credit.resultRef,
        previous_wallet_version: 1,
        resulting_wallet_version: 2,
        resulting_wallet_status: "active",
        shared_timestamp: 1
      },
      {
        status: "succeeded",
        safe_result_code: "confirmed",
        result_ref: credit.resultRef,
        previous_wallet_version: 2,
        resulting_wallet_version: 3,
        resulting_wallet_status: "active",
        shared_timestamp: 1
      }
    ]);
  } finally {
    store.close();
    database.close();
  }
});

test("confirmation replays before state checks and digest drift conflicts without writes", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const credit = store.creditCoins(validCredit({
      coinType: "reward_coins",
      amountUnits: 6,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      policyRef: "reward_policy_1",
      policyVersion: 1
    }));
    const input = validConfirmation({
      lotRef: credit.resultRef,
      amountUnits: 6
    });
    const first = store.confirmCoinCredit(input);
    database.prepare(`
      update platform_coin_wallets set status = 'closed' where wallet_ref = ?
    `).run(credit.walletRef);
    const countsBefore = financialCounts(database);
    assert.deepEqual(store.confirmCoinCredit({
      ...input,
      operation: {
        ...input.operation,
        actorType: "admin",
        actorRef: "different_replay_actor"
      }
    }), {
      ...first,
      replayed: true
    });
    assert.equal(store.getOperationReceipt({
      actorScope: input.operation.actorScope,
      operationType: "confirm_coin_credit",
      idempotencyKey: input.operation.idempotencyKey
    }).requestDigest, canonicalWalletRequestDigest("confirm_coin_credit", {
      lotRef: credit.resultRef,
      amountUnits: 6
    }));
    expectCode(() => store.confirmCoinCredit({
      ...input,
      amountUnits: 5
    }), "idempotency_conflict");
    assert.deepEqual(financialCounts(database), countsBefore);
  } finally {
    store.close();
    database.close();
  }
});

test("confirmation allows active and frozen but rejects closed, missing, wrong type, and underflow without receipts", () => {
  for (const status of ["active", "frozen"]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const store = createStore(database);
    try {
      const credit = store.creditCoins(validCredit({
        coinType: "reward_coins",
        amountUnits: 2,
        availability: "pending",
        sourceType: "promotion_accrual",
        sourceRef: `reward_${status}`,
        policyRef: "reward_policy_1",
        policyVersion: 1
      }));
      database.prepare(`
        update platform_coin_wallets set status = ? where wallet_ref = ?
      `).run(status, credit.walletRef);
      assert.equal(store.confirmCoinCredit(validConfirmation({
        lotRef: credit.resultRef,
        amountUnits: 2
      })).resultingWalletStatus, status);
    } finally {
      store.close();
      database.close();
    }
  }

  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const paid = store.creditCoins(validCredit());
    const bonus = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 2,
      sourceType: "approved_bonus",
      sourceRef: "bonus_source",
      sourceDigest: "b".repeat(64),
      expiresAt: BONUS_EXPIRY,
      operation: { idempotencyKey: "credit_bonus" }
    }));
    const reward = store.creditCoins(validCredit({
      coinType: "reward_coins",
      amountUnits: 3,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      sourceDigest: "c".repeat(64),
      policyRef: "reward_policy_1",
      policyVersion: 1,
      operation: { idempotencyKey: "credit_reward" }
    }));
    const receiptsBefore = countRows(database, "platform_coin_operation_receipts");
    expectCode(() => store.confirmCoinCredit(validConfirmation({
      lotRef: "lot_missing"
    })), "lot_not_found");
    expectCode(() => store.confirmCoinCredit(validConfirmation({
      lotRef: paid.resultRef
    })), "coin_credit_not_confirmable");
    expectCode(() => store.confirmCoinCredit(validConfirmation({
      lotRef: bonus.resultRef
    })), "coin_credit_not_confirmable");
    expectCode(() => store.confirmCoinCredit(validConfirmation({
      lotRef: reward.resultRef,
      amountUnits: 4
    })), "coin_credit_not_confirmable");
    database.prepare(`
      update platform_coin_wallets set status = 'closed' where wallet_ref = ?
    `).run(reward.walletRef);
    expectCode(() => store.confirmCoinCredit(validConfirmation({
      lotRef: reward.resultRef
    })), "wallet_not_active");
    assert.equal(countRows(database, "platform_coin_operation_receipts"), receiptsBefore);
    assert.equal(store.getWallet(reward.walletRef).version, 3);
    assert.equal(store.getLot(reward.resultRef).pendingUnits, 3);
  } finally {
    store.close();
    database.close();
  }
});

test("confirmation SQL and late-reference faults roll back receipt, lot, wallet, and ledger", () => {
  for (const fault of ["guard", "reference"]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const store = createStore(database, {
      refFactory: fault === "reference"
        ? makeRefFactory({ ledger_entry: "ledger_collision" })
        : makeRefFactory()
    });
    try {
      const credit = store.creditCoins(validCredit({
        coinType: "reward_coins",
        amountUnits: 5,
        availability: "pending",
        sourceType: "promotion_accrual",
        sourceRef: "reward_source",
        policyRef: "reward_policy_1",
        policyVersion: 1
      }));
      if (fault === "guard") {
        database.exec(`
          create trigger reject_confirmation_lot_update
          before update on platform_coin_lots
          when new.pending_units < old.pending_units
          begin
            select raise(abort, 'synthetic guard fault');
          end
        `);
      }
      const countsBefore = financialCounts(database);
      expectCode(() => store.confirmCoinCredit(validConfirmation({
        lotRef: credit.resultRef
      })), "wallet_infrastructure_error");
      assert.deepEqual(financialCounts(database), countsBefore);
      assert.equal(store.getWallet(credit.walletRef).version, 1);
      assert.equal(store.getLot(credit.resultRef).pendingUnits, 5);
      assert.equal(store.getLot(credit.resultRef).availableUnits, 0);
      assert.equal(store.getOperationReceipt({
        actorScope: "account:account_1",
        operationType: "confirm_coin_credit",
        idempotencyKey: "confirm_1"
      }), null);
    } finally {
      store.close();
      database.close();
    }
  }
});

test("confirmation fails closed for operation-specific receipt mismatches", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const creditInput = validCredit({
      coinType: "reward_coins",
      amountUnits: 2,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      policyRef: "reward_policy_1",
      policyVersion: 1
    });
    const credit = store.creditCoins(creditInput);
    const confirmInput = validConfirmation({
      lotRef: credit.resultRef,
      amountUnits: 2
    });
    const confirmation = store.confirmCoinCredit(confirmInput);
    database.exec(`
      drop trigger platform_coin_operation_receipts_terminal_immutable_update
    `);
    const setCode = database.prepare(`
      update platform_coin_operation_receipts
         set safe_result_code = ?
       where operation_ref = ?
    `);
    assert.equal(setCode.run("credited", confirmation.operationRef).changes, 1);
    expectCode(
      () => store.confirmCoinCredit(confirmInput),
      "idempotency_unavailable"
    );
    assert.equal(setCode.run("confirmed", confirmation.operationRef).changes, 1);
    assert.equal(database.prepare(`
      update platform_coin_operation_receipts
         set result_ref = 'lot_other'
       where operation_ref = ?
    `).run(confirmation.operationRef).changes, 1);
    expectCode(
      () => store.confirmCoinCredit(confirmInput),
      "idempotency_unavailable"
    );
    assert.equal(setCode.run("confirmed", credit.operationRef).changes, 1);
    expectCode(() => store.creditCoins(creditInput), "idempotency_unavailable");
  } finally {
    store.close();
    database.close();
  }
});

test("invalid locked database UTC rolls back confirmation as an infrastructure error", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const seedStore = createStore(database);
  const credit = seedStore.creditCoins(validCredit({
    coinType: "reward_coins",
    amountUnits: 5,
    availability: "pending",
    sourceType: "promotion_accrual",
    sourceRef: "reward_source",
    policyRef: "reward_policy_1",
    policyVersion: 1
  }));
  seedStore.close();
  const store = createSqliteCoinWalletStore({
    database: createInvalidDatabaseTimeConnection(database),
    refFactory: makeRefFactory()
  });
  try {
    const countsBefore = financialCounts(database);
    expectCode(() => store.confirmCoinCredit(validConfirmation({
      lotRef: credit.resultRef
    })), "wallet_infrastructure_error");
    assert.deepEqual(financialCounts(database), countsBefore);
    assert.equal(store.getWallet(credit.walletRef).version, 1);
    assert.equal(store.getLot(credit.resultRef).pendingUnits, 5);
    assert.equal(store.getOperationReceipt({
      actorScope: "account:account_1",
      operationType: "confirm_coin_credit",
      idempotencyKey: "confirm_1"
    }), null);
  } finally {
    store.close();
    database.close();
  }
});

test("confirmation normalizes transaction-internal reference and unit overflow failures", () => {
  for (const fault of ["reference", "unsafe_aggregate"]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const seedStore = createStore(database);
    const credit = seedStore.creditCoins(validCredit({
      coinType: "reward_coins",
      amountUnits: fault === "unsafe_aggregate" ? Number.MAX_SAFE_INTEGER : 5,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      policyRef: "reward_policy_1",
      policyVersion: 1
    }));
    seedStore.close();
    if (fault === "unsafe_aggregate") {
      database.prepare(`
        update platform_coin_lots
           set issued_units = 9007199254740992,
               pending_units = 1,
               available_units = 9007199254740991
         where lot_ref = ?
      `).run(credit.resultRef);
    }
    const store = createSqliteCoinWalletStore({
      database,
      refFactory: fault === "reference"
        ? () => " invalid-reference "
        : makeRefFactory()
    });
    try {
      const countsBefore = financialCounts(database);
      const walletBefore = store.getWallet(credit.walletRef);
      const lotBefore = store.getLot(credit.resultRef);
      expectCode(() => store.confirmCoinCredit(validConfirmation({
        lotRef: credit.resultRef,
        amountUnits: fault === "unsafe_aggregate" ? 1 : 4
      })), "wallet_infrastructure_error");
      assert.deepEqual(financialCounts(database), countsBefore);
      assert.deepEqual(store.getWallet(credit.walletRef), walletBefore);
      assert.deepEqual(store.getLot(credit.resultRef), lotBefore);
      assert.equal(store.getWallet(credit.walletRef).version, 1);
      assert.equal(store.getOperationReceipt({
        actorScope: "account:account_1",
        operationType: "confirm_coin_credit",
        idempotencyKey: "confirm_1"
      }), null);
    } finally {
      store.close();
      database.close();
    }
  }
});

test("confirmation rejects a schema-valid closed terminal while credit replay stays closed-compatible", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createStore(database);
  try {
    const creditInput = validCredit({
      coinType: "reward_coins",
      amountUnits: 2,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward_source",
      policyRef: "reward_policy_1",
      policyVersion: 1
    });
    const credit = store.creditCoins(creditInput);
    const confirmInput = validConfirmation({
      lotRef: credit.resultRef,
      amountUnits: 2
    });
    const confirmation = store.confirmCoinCredit(confirmInput);
    database.exec(`
      drop trigger platform_coin_operation_receipts_terminal_immutable_update
    `);
    assert.equal(database.prepare(`
      update platform_coin_operation_receipts
         set resulting_wallet_status = 'closed'
       where operation_ref = ?
    `).run(confirmation.operationRef).changes, 1);
    expectCode(
      () => store.confirmCoinCredit(confirmInput),
      "idempotency_unavailable"
    );
    assert.equal(database.prepare(`
      update platform_coin_operation_receipts
         set resulting_wallet_status = 'closed'
       where operation_ref = ?
    `).run(credit.operationRef).changes, 1);
    assert.deepEqual(store.creditCoins(creditInput), {
      ...credit,
      replayed: true,
      resultingWalletStatus: "closed"
    });
  } finally {
    store.close();
    database.close();
  }
});

test("hold exposes the exact method and rejects malformed requests before transaction entry", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    const before = holdFinancialSnapshot(database);
    const symbolRequest = validHold();
    symbolRequest[Symbol("extra")] = true;
    const hiddenRequest = validHold();
    Object.defineProperty(hiddenRequest, "hidden", { value: true });
    const symbolOperation = validHold();
    symbolOperation.operation[Symbol("extra")] = true;
    const hiddenOperation = validHold();
    Object.defineProperty(hiddenOperation.operation, "hidden", { value: true });
    const sparseAccepted = new Array(1);
    const cases = [
      [null, "invalid_wallet_request"],
      [{ ...validHold(), extra: true }, "invalid_wallet_request"],
      [symbolRequest, "invalid_wallet_request"],
      [hiddenRequest, "invalid_wallet_request"],
      [{ ...validHold(), operation: null }, "invalid_wallet_request"],
      [validHold({ operation: { extra: true } }), "invalid_wallet_request"],
      [symbolOperation, "invalid_wallet_request"],
      [hiddenOperation, "invalid_wallet_request"],
      [validHold({ amountUnits: 0 }), "invalid_coin_units"],
      [validHold({ amountUnits: -1 }), "invalid_coin_units"],
      [validHold({ amountUnits: 1.5 }), "invalid_coin_units"],
      [validHold({ amountUnits: Number.MAX_SAFE_INTEGER + 1 }), "invalid_coin_units"],
      [validHold({ acceptedCoinTypes: [] }), "invalid_accepted_coin_types"],
      [validHold({ acceptedCoinTypes: ["paid_coins", "paid_coins"] }), "duplicate_coin_type"],
      [validHold({ acceptedCoinTypes: ["external_coins"] }), "invalid_coin_type"],
      [validHold({ acceptedCoinTypes: sparseAccepted }), "invalid_coin_type"],
      [validHold({ purpose: "transfer" }), "invalid_wallet_request"],
      [validHold({
        purpose: "reward_adjustment",
        acceptedCoinTypes: ["paid_coins"]
      }), "invalid_coin_type"],
      [validHold({ expiresAt: "2026-07-24" }), "invalid_wallet_timestamp"]
    ];
    const changesBefore = database.prepare("select total_changes()").pluck().get();
    for (const [input, code] of cases) {
      expectCode(() => store.createCoinHold(input), code);
    }
    for (const field of [
      "walletRef",
      "purpose",
      "purposeRef",
      "amountUnits",
      "acceptedCoinTypes",
      "expiresAt",
      "operation"
    ]) {
      const input = validHold();
      delete input[field];
      expectCode(() => store.createCoinHold(input), "invalid_wallet_request");
    }
    for (const field of [
      "actorScope",
      "idempotencyKey",
      "actorType",
      "actorRef"
    ]) {
      const input = validHold();
      delete input.operation[field];
      expectCode(() => store.createCoinHold(input), "invalid_wallet_request");
    }
    assert.equal(database.prepare("select total_changes()").pluck().get(), changesBefore);
    assert.deepEqual(holdFinancialSnapshot(database), before);
  } finally {
    store?.close();
    database.close();
  }
});

test("hold uses locked database time, excludes expired bonus, and requires an active wallet", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  let databaseTimeReads = 0;
  const store = createSqliteCoinWalletStore({
    database: createFixedDatabaseTimeConnection(
      database,
      NOW,
      () => { databaseTimeReads += 1; }
    ),
    nowFn: () => new Date("2099-01-01T00:00:00.000Z"),
    refFactory: makeRefFactory()
  });
  try {
    expectCode(() => store.createCoinHold(validHold({
      walletRef: "wallet_missing"
    })), "wallet_not_found");
    const expiredBonus = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 50,
      sourceType: "approved_bonus",
      sourceRef: "expired_bonus",
      expiresAt: NOW,
      operation: { idempotencyKey: "credit_expired" }
    }));
    const paid = store.creditCoins(validCredit({
      amountUnits: 7,
      sourceRef: "paid_source",
      operation: { idempotencyKey: "credit_paid" }
    }));
    expectCode(() => store.createCoinHold(validHold({
      walletRef: paid.walletRef,
      amountUnits: 1,
      expiresAt: NOW
    })), "invalid_coin_expiry");
    assert.equal(databaseTimeReads, 1);
    expectCode(() => store.createCoinHold(validHold({
      walletRef: paid.walletRef,
      amountUnits: 1,
      expiresAt: "2026-07-23T12:34:55.999Z"
    })), "invalid_coin_expiry");
    assert.equal(databaseTimeReads, 2);
    const held = store.createCoinHold(validHold({
      walletRef: paid.walletRef,
      amountUnits: 7,
      expiresAt: "2026-07-23T12:34:56.001Z"
    }));
    assert.equal(databaseTimeReads, 3);
    assert.equal(held.safeResultCode, "held");
    assert.equal(store.getLot(expiredBonus.resultRef).heldUnits, 0);
    assert.equal(store.getLot(paid.resultRef).heldUnits, 7);

    database.prepare(
      "update platform_coin_wallets set status = 'frozen' where wallet_ref = ?"
    ).run(paid.walletRef);
    expectCode(() => store.createCoinHold(validHold({
      walletRef: paid.walletRef,
      operation: { idempotencyKey: "hold_frozen" }
    })), "wallet_not_active");
    assert.equal(databaseTimeReads, 3);
    database.prepare(
      "update platform_coin_wallets set status = 'closed' where wallet_ref = ?"
    ).run(paid.walletRef);
    expectCode(() => store.createCoinHold(validHold({
      walletRef: paid.walletRef,
      operation: { idempotencyKey: "hold_closed" }
    })), "wallet_not_active");
    assert.equal(databaseTimeReads, 3);
    assert.equal(countRows(database, "platform_coin_operation_receipts"), 3);
  } finally {
    store.close();
    database.close();
  }
});

test("multi-lot hold is deterministic and persists exact atomic audit rows", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createSqliteCoinWalletStore({
    database: createFixedDatabaseTimeConnection(database),
    nowFn: () => new Date(NOW),
    refFactory: makeRefFactory()
  });
  try {
    const finiteBonus = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 3,
      sourceType: "approved_bonus",
      sourceRef: "bonus_finite",
      expiresAt: "2026-07-25T00:00:00.000Z",
      operation: { idempotencyKey: "credit_bonus_finite" }
    }));
    const openBonus = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 2,
      sourceType: "approved_bonus",
      sourceRef: "bonus_open",
      expiresAt: null,
      operation: { idempotencyKey: "credit_bonus_open" }
    }));
    const paid = store.creditCoins(validCredit({
      amountUnits: 4,
      sourceRef: "paid",
      operation: { idempotencyKey: "credit_paid" }
    }));
    const reward = store.creditCoins(validCredit({
      coinType: "reward_coins",
      amountUnits: 5,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward",
      policyRef: "reward_policy_1",
      policyVersion: 1,
      operation: { idempotencyKey: "credit_reward" }
    }));
    store.confirmCoinCredit(validConfirmation({
      lotRef: reward.resultRef,
      amountUnits: 5
    }));

    const input = validHold({
      walletRef: finiteBonus.walletRef,
      amountUnits: 10,
      acceptedCoinTypes: ["reward_coins", "paid_coins", "bonus_coins"]
    });
    const held = store.createCoinHold(input);
    assert.deepEqual(held, {
      ok: true,
      replayed: false,
      operationRef: "operation_6",
      walletRef: finiteBonus.walletRef,
      safeResultCode: "held",
      resultRef: "hold_1",
      previousWalletVersion: 5,
      resultingWalletVersion: 6,
      resultingWalletStatus: "active"
    });
    assert.deepEqual(store.getHold(held.resultRef), {
      holdRef: "hold_1",
      walletRef: finiteBonus.walletRef,
      purpose: "product_purchase",
      purposeRef: "order_1",
      amountUnits: 10,
      status: "active",
      expiresAt: "2026-07-24T12:34:56.000Z",
      createdAt: NOW,
      updatedAt: NOW
    });
    assert.deepEqual(database.prepare(`
      select allocation_ref, hold_ref, lot_ref, allocation_sequence,
             allocated_units, created_at
        from platform_coin_hold_allocations
       order by allocation_sequence
    `).all(), [
      { allocation_ref: "allocation_1", hold_ref: "hold_1", lot_ref: finiteBonus.resultRef, allocation_sequence: 1, allocated_units: 3, created_at: NOW },
      { allocation_ref: "allocation_2", hold_ref: "hold_1", lot_ref: openBonus.resultRef, allocation_sequence: 2, allocated_units: 2, created_at: NOW },
      { allocation_ref: "allocation_3", hold_ref: "hold_1", lot_ref: paid.resultRef, allocation_sequence: 3, allocated_units: 4, created_at: NOW },
      { allocation_ref: "allocation_4", hold_ref: "hold_1", lot_ref: reward.resultRef, allocation_sequence: 4, allocated_units: 1, created_at: NOW }
    ]);
    assert.deepEqual([
      finiteBonus, openBonus, paid, reward
    ].map(({ resultRef }) => {
      const lot = store.getLot(resultRef);
      return [lot.availableUnits, lot.heldUnits];
    }), [[0, 3], [0, 2], [0, 4], [4, 1]]);
    assert.equal(store.getWallet(finiteBonus.walletRef).version, 6);

    const ledger = database.prepare(`
      select entry_ref, operation_ref, wallet_ref, lot_ref, operation,
             amount_units, hold_ref, order_ref, source_type, source_ref,
             actor_type, actor_ref, previous_wallet_version,
             resulting_wallet_version, resulting_wallet_status, occurred_at
        from platform_coin_ledger_entries
       where operation = 'available_to_held'
       order by entry_ref
    `).all();
    assert.deepEqual(ledger, [
      [finiteBonus, 3, "approved_bonus", "bonus_finite"],
      [openBonus, 2, "approved_bonus", "bonus_open"],
      [paid, 4, "verified_recharge", "paid"],
      [reward, 1, "promotion_accrual", "reward"]
    ].map(([lot, amountUnits, sourceType, sourceRef], index) => ({
      entry_ref: `ledger_entry_${index + 6}`,
      operation_ref: held.operationRef,
      wallet_ref: held.walletRef,
      lot_ref: lot.resultRef,
      operation: "available_to_held",
      amount_units: amountUnits,
      hold_ref: held.resultRef,
      order_ref: "order_1",
      source_type: sourceType,
      source_ref: sourceRef,
      actor_type: "user",
      actor_ref: "account_1",
      previous_wallet_version: 5,
      resulting_wallet_version: 6,
      resulting_wallet_status: "active",
      occurred_at: NOW
    })));
    assert.deepEqual(database.prepare(`
      select status, previous_wallet_version, resulting_wallet_version,
             resulting_wallet_status, result_ref, safe_result_code,
             created_at, completed_at, request_digest
        from platform_coin_operation_receipts
       where operation_ref = ?
    `).get(held.operationRef), {
      status: "succeeded",
      previous_wallet_version: 5,
      resulting_wallet_version: 6,
      resulting_wallet_status: "active",
      result_ref: held.resultRef,
      safe_result_code: "held",
      created_at: NOW,
      completed_at: NOW,
      request_digest: canonicalWalletRequestDigest("create_coin_hold", {
        walletRef: held.walletRef,
        purpose: "product_purchase",
        purposeRef: "order_1",
        amountUnits: 10,
        acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
        expiresAt: "2026-07-24T12:34:56.000Z"
      })
    });
  } finally {
    store.close();
    database.close();
  }
});

test("hold accepted-type permutations replay while set and business drift conflict", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createSqliteCoinWalletStore({
    database: createFixedDatabaseTimeConnection(database),
    refFactory: makeRefFactory()
  });
  try {
    const credit = store.creditCoins(validCredit({ amountUnits: 20 }));
    const input = validHold({
      walletRef: credit.walletRef,
      acceptedCoinTypes: ["paid_coins", "bonus_coins"]
    });
    const first = store.createCoinHold(input);
    database.prepare(
      "update platform_coin_wallets set status = 'frozen' where wallet_ref = ?"
    ).run(credit.walletRef);
    assert.deepEqual(store.createCoinHold({
      ...input,
      acceptedCoinTypes: ["bonus_coins", "paid_coins"],
      operation: {
        ...input.operation,
        actorType: "admin",
        actorRef: "replay_actor"
      }
    }), { ...first, replayed: true });
    for (const drift of [
      { acceptedCoinTypes: ["paid_coins"] },
      { purposeRef: "order_2" },
      { amountUnits: 9 }
    ]) {
      expectCode(() => store.createCoinHold({ ...input, ...drift }), "idempotency_conflict");
    }
  } finally {
    store.close();
    database.close();
  }
});

test("reward adjustment is reward-only and binds no order reference", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createSqliteCoinWalletStore({
    database: createFixedDatabaseTimeConnection(database),
    refFactory: makeRefFactory()
  });
  try {
    const reward = store.creditCoins(validCredit({
      coinType: "reward_coins",
      amountUnits: 8,
      availability: "pending",
      sourceType: "promotion_accrual",
      sourceRef: "reward",
      policyRef: "reward_policy_1",
      policyVersion: 1
    }));
    store.confirmCoinCredit(validConfirmation({
      lotRef: reward.resultRef,
      amountUnits: 8
    }));
    const result = store.createCoinHold(validHold({
      walletRef: reward.walletRef,
      purpose: "reward_adjustment",
      purposeRef: "adjustment_1",
      amountUnits: 3,
      acceptedCoinTypes: ["reward_coins"]
    }));
    assert.equal(result.safeResultCode, "held");
    assert.deepEqual(database.prepare(`
      select order_ref, source_type, source_ref
        from platform_coin_ledger_entries
       where operation_ref = ?
    `).get(result.operationRef), {
      order_ref: null,
      source_type: "promotion_accrual",
      source_ref: "reward"
    });
  } finally {
    store.close();
    database.close();
  }
});

test("insufficient hold commits only one stable failed receipt and later funds cannot change replay", () => {
  const database = createSyntheticDatabase();
  insertAccount(database, "account_1");
  const store = createSqliteCoinWalletStore({
    database: createFixedDatabaseTimeConnection(database),
    refFactory: makeRefFactory()
  });
  try {
    const credit = store.creditCoins(validCredit({ amountUnits: 3 }));
    const input = validHold({
      walletRef: credit.walletRef,
      amountUnits: 4,
      acceptedCoinTypes: ["paid_coins"]
    });
    const before = holdFinancialSnapshot(database);
    const failed = store.createCoinHold(input);
    assert.deepEqual(failed, {
      ok: false,
      replayed: false,
      operationRef: "operation_2",
      walletRef: credit.walletRef,
      safeResultCode: "insufficient_balance",
      resultRef: null,
      previousWalletVersion: 1,
      resultingWalletVersion: 1,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      ...holdFinancialSnapshot(database),
      platform_coin_operation_receipts: before.platform_coin_operation_receipts
    }, before);
    store.creditCoins(validCredit({
      amountUnits: 10,
      sourceRef: "paid_2",
      operation: { idempotencyKey: "credit_2" }
    }));
    assert.deepEqual(store.createCoinHold(input), { ...failed, replayed: true });
    assert.equal(countRows(database, "platform_coin_holds"), 0);
    assert.equal(countRows(database, "platform_coin_hold_allocations"), 0);
  } finally {
    store.close();
    database.close();
  }
});

test("corrupt allocator output fails before any financial write", () => {
  for (const corruption of ["sparse", "duplicate_lot", "empty", "non_array"]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const probe = createHoldWriteProbeConnection(database);
    const store = createSqliteCoinWalletStore({
      database: probe.connection,
      refFactory: makeRefFactory()
    });
    try {
      const credit = store.creditCoins(validCredit({ amountUnits: 20 }));
      const before = holdFinancialSnapshot(database);
      probe.arm("count_only");
      const originalMap = Array.prototype.map;
      Array.prototype.map = function patchedMap(callback, thisArg) {
        const mapped = originalMap.call(this, callback, thisArg);
        if (
          mapped.length > 0
          && mapped.every((value) => (
            value
            && typeof value === "object"
            && Number.isSafeInteger(value.allocationSequence)
          ))
        ) {
          if (corruption === "empty") return [];
          if (corruption === "non_array") return { length: 0 };
          if (corruption === "sparse") {
            const sparse = new Array(2);
            sparse[1] = {
              ...mapped[0],
              allocationSequence: 2
            };
            return sparse;
          }
          return [
            {
              ...mapped[0],
              allocationSequence: 1,
              allocatedUnits: 5
            },
            {
              ...mapped[0],
              allocationSequence: 2,
              allocatedUnits: 5
            }
          ];
        }
        return mapped;
      };
      try {
        expectCode(() => store.createCoinHold(validHold({
          walletRef: credit.walletRef,
          expiresAt: "2099-01-01T00:00:00.000Z"
        })), "wallet_infrastructure_error");
      } finally {
        Array.prototype.map = originalMap;
      }
      assert.equal(probe.counts().lotUpdateAttempts, 0);
      assert.deepEqual(holdFinancialSnapshot(database), before);
    } finally {
      store.close();
      database.close();
    }
  }
});

test("later lot, wallet, and receipt zero-row guards roll back complete hold state", () => {
  for (const fault of ["later_lot", "wallet", "receipt"]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const probe = createHoldWriteProbeConnection(database);
    const store = createSqliteCoinWalletStore({
      database: probe.connection,
      refFactory: makeRefFactory()
    });
    try {
      const first = store.creditCoins(validCredit({
        amountUnits: fault === "later_lot" ? 5 : 20
      }));
      if (fault === "later_lot") {
        store.creditCoins(validCredit({
          amountUnits: 5,
          sourceRef: "paid_second",
          operation: { idempotencyKey: "credit_second" }
        }));
      }
      const before = holdFinancialSnapshot(database);
      probe.arm(fault);
      expectCode(() => store.createCoinHold(validHold({
        walletRef: first.walletRef,
        expiresAt: "2099-01-01T00:00:00.000Z"
      })), "wallet_infrastructure_error");
      assert.deepEqual(holdFinancialSnapshot(database), before);
      const counts = probe.counts();
      if (fault === "later_lot") {
        assert.equal(counts.lotUpdateAttempts, 2);
        assert.equal(counts.walletUpdateAttempts, 0);
      } else if (fault === "wallet") {
        assert.equal(counts.lotUpdateAttempts, 1);
        assert.equal(counts.walletUpdateAttempts, 1);
      } else {
        assert.equal(counts.lotUpdateAttempts, 1);
        assert.equal(counts.walletUpdateAttempts, 1);
        assert.equal(counts.receiptCompletionAttempts, 1);
      }
    } finally {
      store.close();
      database.close();
    }
  }
});

test("hold reference, guard, and SQL faults roll back every financial row", () => {
  for (const fault of [
    "hold_collision",
    "allocation_collision",
    "later_allocation_collision",
    "ledger_collision",
    "later_ledger_collision",
    "invalid_reference",
    "late_ref_factory",
    "overflow",
    "guard"
  ]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const seedStore = createStore(database);
    const needsTwoLots = new Set([
      "later_allocation_collision",
      "later_ledger_collision",
      "late_ref_factory"
    ]).has(fault);
    const credit = seedStore.creditCoins(validCredit({
      amountUnits: needsTwoLots ? 5 : 20
    }));
    if (needsTwoLots) {
      seedStore.creditCoins(validCredit({
        amountUnits: 5,
        sourceRef: "paid_second",
        operation: { idempotencyKey: "credit_second" }
      }));
    }
    seedStore.close();
    if (fault === "hold_collision") {
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values ('hold_collision', ?, 'product_purchase', 'seed', 1, 'released',
                  '2099-01-01T00:00:00.000Z', ?, ?)
      `).run(credit.walletRef, NOW, NOW);
    }
    if (fault === "allocation_collision" || fault === "later_allocation_collision") {
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values ('hold_seed_collision', ?, 'product_purchase', 'seed', 1,
                  'released', '2099-01-01T00:00:00.000Z', ?, ?)
      `).run(credit.walletRef, NOW, NOW);
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence,
          allocated_units, created_at
        ) values ('allocation_collision', 'hold_seed_collision', ?, 1, 1, ?)
      `).run(credit.resultRef, NOW);
    }
    if (fault === "ledger_collision" || fault === "later_ledger_collision") {
      database.prepare(`
        insert into platform_coin_ledger_entries (
          entry_ref, operation_ref, wallet_ref, lot_ref, operation,
          amount_units, hold_ref, order_ref, source_type, source_ref,
          actor_type, actor_ref, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, occurred_at
        ) select 'ledger_collision', operation_ref, wallet_ref, lot_ref,
                 'synthetic', 1, null, null, source_type, source_ref,
                 actor_type, actor_ref, previous_wallet_version,
                 resulting_wallet_version, resulting_wallet_status, occurred_at
            from platform_coin_ledger_entries limit 1
      `).run();
    }
    if (fault === "guard") {
      database.exec(`
        create trigger reject_hold_lot_update
        before update on platform_coin_lots
        when new.held_units > old.held_units
        begin
          select raise(abort, 'synthetic hold guard fault');
        end
      `);
    }
    const overrides = {
      hold: fault === "hold_collision"
        ? "hold_collision"
        : fault === "invalid_reference"
          ? " invalid-hold "
          : "hold_new",
      allocation: fault === "allocation_collision"
        ? "allocation_collision"
        : fault === "later_allocation_collision"
          ? (count) => count === 2 ? "allocation_collision" : `allocation_new_${count}`
          : (count) => `allocation_new_${count}`,
      ledger_entry: fault === "ledger_collision"
        ? "ledger_collision"
        : fault === "later_ledger_collision"
          ? (count) => count === 2 ? "ledger_collision" : `ledger_hold_${count}`
        : fault === "late_ref_factory"
          ? (count) => count === 2 ? " invalid-ledger " : `ledger_hold_${count}`
          : "ledger_new",
      operation: `operation_${fault}`
    };
    const store = createSqliteCoinWalletStore({
      database: createFixedDatabaseTimeConnection(database),
      refFactory: makeRefFactory(overrides)
    });
    try {
      if (fault === "overflow") {
        database.pragma("ignore_check_constraints = ON");
        database.prepare(`
          update platform_coin_lots
             set issued_units = 9007199254740992,
                 available_units = 1,
                 held_units = 9007199254740991
           where lot_ref = ?
        `).run(credit.resultRef);
      }
      const before = holdFinancialSnapshot(database);
      expectCode(() => store.createCoinHold(validHold({
        walletRef: credit.walletRef,
        amountUnits: fault === "overflow" ? 1 : 10
      })), "wallet_infrastructure_error");
      assert.deepEqual(holdFinancialSnapshot(database), before);
    } finally {
      store.close();
      database.close();
    }
  }
});

test("hold replay fails closed for malformed success and insufficient terminal receipts", () => {
  for (const mutation of [
    "safe_result_code = 'credited'",
    "result_ref = null",
    "resulting_wallet_version = previous_wallet_version",
    "resulting_wallet_status = 'frozen'",
    "completed_at = '2099-01-01T00:00:00.000Z'",
    "completed_at = null"
  ]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const store = createSqliteCoinWalletStore({
      database: createFixedDatabaseTimeConnection(database),
      refFactory: makeRefFactory()
    });
    try {
      const credit = store.creditCoins(validCredit({ amountUnits: 20 }));
      const input = validHold({ walletRef: credit.walletRef });
      const result = store.createCoinHold(input);
      database.exec("drop trigger platform_coin_operation_receipts_terminal_immutable_update");
      database.pragma("ignore_check_constraints = ON");
      database.prepare(`
        update platform_coin_operation_receipts set ${mutation}
         where operation_ref = ?
      `).run(result.operationRef);
      expectCode(() => store.createCoinHold(input), "idempotency_unavailable");
    } finally {
      store.close();
      database.close();
    }
  }

  for (const mutation of [
    "safe_result_code = 'held'",
    "result_ref = 'hold_bad'",
    "resulting_wallet_version = previous_wallet_version + 1",
    "resulting_wallet_status = 'closed'",
    "completed_at = '2099-01-01T00:00:00.000Z'",
    "completed_at = null"
  ]) {
    const database = createSyntheticDatabase();
    insertAccount(database, "account_1");
    const store = createSqliteCoinWalletStore({
      database: createFixedDatabaseTimeConnection(database),
      refFactory: makeRefFactory()
    });
    try {
      const credit = store.creditCoins(validCredit({ amountUnits: 1 }));
      const input = validHold({
        walletRef: credit.walletRef,
        amountUnits: 2,
        acceptedCoinTypes: ["paid_coins"]
      });
      const result = store.createCoinHold(input);
      database.exec("drop trigger platform_coin_operation_receipts_terminal_immutable_update");
      database.pragma("ignore_check_constraints = ON");
      database.prepare(`
        update platform_coin_operation_receipts set ${mutation}
         where operation_ref = ?
      `).run(result.operationRef);
      expectCode(() => store.createCoinHold(input), "idempotency_unavailable");
    } finally {
      store.close();
      database.close();
    }
  }
});

const LIFECYCLE_RESULT_FIELDS = [
  "ok",
  "operationRef",
  "previousWalletVersion",
  "replayed",
  "resultRef",
  "resultingWalletStatus",
  "resultingWalletVersion",
  "safeResultCode",
  "walletRef"
].sort();

function validLifecycleOperation(overrides = {}) {
  return {
    actorScope: "account:account_1",
    idempotencyKey: "lifecycle_1",
    actorType: "user",
    actorRef: "account_1",
    ...overrides
  };
}

function validCapture(holdRef, overrides = {}) {
  return {
    holdRef,
    operation: validLifecycleOperation({
      idempotencyKey: "capture_1",
      ...(overrides.operation ?? {})
    }),
    ...overrides,
    operation: validLifecycleOperation({
      idempotencyKey: "capture_1",
      ...(overrides.operation ?? {})
    })
  };
}

function validRelease(holdRef, overrides = {}) {
  return {
    holdRef,
    operation: validLifecycleOperation({
      idempotencyKey: "release_1",
      ...(overrides.operation ?? {})
    }),
    ...overrides,
    operation: validLifecycleOperation({
      idempotencyKey: "release_1",
      ...(overrides.operation ?? {})
    })
  };
}

function createMutableDatabaseTimeConnection(database, initialTimestamp = NOW) {
  let timestamp = initialTimestamp;
  let reads = 0;
  return {
    connection: {
      pragma: (...args) => database.pragma(...args),
      prepare: (sql) => {
        if (/select\s+strftime\('%Y-%m-%dT%H:%M:%fZ',\s*'now'\)/i.test(sql)) {
          return {
            pluck() {
              return {
                get() {
                  reads += 1;
                  return timestamp;
                }
              };
            }
          };
        }
        return database.prepare(sql);
      },
      transaction: (...args) => database.transaction(...args)
    },
    setTimestamp(nextTimestamp) {
      timestamp = nextTimestamp;
    },
    reads() {
      return reads;
    }
  };
}

function createArmableBusyConnection(database) {
  let armed = false;
  return {
    connection: {
      pragma: (...args) => database.pragma(...args),
      prepare: (...args) => database.prepare(...args),
      transaction: (callback) => {
        const transaction = database.transaction(callback);
        const wrapped = (...args) => transaction(...args);
        wrapped.deferred = (...args) => transaction.deferred(...args);
        wrapped.exclusive = (...args) => transaction.exclusive(...args);
        wrapped.immediate = (...args) => {
          if (armed) {
            const error = new Error("synthetic busy");
            error.code = "SQLITE_BUSY";
            throw error;
          }
          return transaction.immediate(...args);
        };
        return wrapped;
      }
    },
    arm() {
      armed = true;
    }
  };
}

function createLifecycleFixture({
  coinType = "paid_coins",
  amountUnits = 10,
  lotExpiresAt = null,
  holdExpiresAt = "2026-07-24T12:34:56.000Z",
  accountId = "account_1",
  purpose = "product_purchase",
  purposeRef = "order_1"
} = {}) {
  const database = createSyntheticDatabase();
  let store;
  try {
    insertAccount(database, accountId);
    const clock = createMutableDatabaseTimeConnection(database);
    store = createSqliteCoinWalletStore({
      database: clock.connection,
      refFactory: makeRefFactory(),
      nowFn: () => new Date(NOW)
    });
    const credit = store.creditCoins(validCredit({
      accountId,
      coinType,
      amountUnits,
      sourceType: coinType === "bonus_coins"
        ? "approved_bonus"
        : "verified_recharge",
      sourceRef: `${coinType}_source`,
      expiresAt: lotExpiresAt,
      operation: {
        actorScope: `account:${accountId}`,
        idempotencyKey: `${coinType}_credit`,
        actorRef: accountId
      }
    }));
    const hold = store.createCoinHold(validHold({
      walletRef: credit.walletRef,
      purpose,
      purposeRef,
      amountUnits,
      acceptedCoinTypes: [coinType],
      expiresAt: holdExpiresAt,
      operation: {
        actorScope: `account:${accountId}`,
        idempotencyKey: `${coinType}_hold`,
        actorRef: accountId
      }
    }));
    return {
      clock,
      credit,
      database,
      hold,
      store
    };
  } catch (error) {
    try {
      store?.close();
    } finally {
      database.close();
    }
    throw error;
  }
}

function assertLifecycleEnvelope(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), LIFECYCLE_RESULT_FIELDS);
  assert.equal(typeof actual.operationRef, "string");
  assert.equal(actual.operationRef.trim(), actual.operationRef);
  assert.notEqual(actual.operationRef, "");
  assert.deepEqual(actual, {
    ...expected,
    operationRef: actual.operationRef
  });
}

function lifecycleReceiptCount(database) {
  return database.prepare(`
    select count(*)
      from platform_coin_operation_receipts
     where operation_type in (
       'capture_coin_hold',
       'release_coin_hold',
       'expire_coin_hold',
       'expire_coin_lot'
     )
  `).pluck().get();
}

function assertLifecycleErrorWithoutReceipt(database, action, code) {
  const before = holdFinancialSnapshot(database);
  expectCode(action, code);
  assert.deepEqual(holdFinancialSnapshot(database), before);
}

function receiptByOperation(database, operationRef) {
  return database.prepare(`
    select *
      from platform_coin_operation_receipts
     where operation_ref = ?
  `).get(operationRef);
}

function assertLifecycleReceipt(database, result, expected) {
  assert.deepEqual(receiptByOperation(database, result.operationRef), {
    operation_ref: result.operationRef,
    wallet_ref: expected.walletRef,
    actor_scope: expected.actorScope,
    operation_type: expected.operationType,
    idempotency_key: expected.idempotencyKey,
    request_digest: expected.requestDigest,
    status: expected.status,
    previous_wallet_version: expected.previousWalletVersion,
    resulting_wallet_version: expected.resultingWalletVersion,
    resulting_wallet_status: expected.resultingWalletStatus,
    result_ref: expected.resultRef,
    safe_result_code: expected.safeResultCode,
    created_at: expected.occurredAt,
    completed_at: expected.occurredAt
  });
}

function lifecycleLedger(database, operationRef) {
  return database.prepare(`
    select operation_ref, wallet_ref, lot_ref, operation, amount_units,
           hold_ref, order_ref, source_type, source_ref, actor_type, actor_ref,
           previous_wallet_version, resulting_wallet_version,
           resulting_wallet_status, occurred_at
      from platform_coin_ledger_entries
     where operation_ref = ?
     order by lot_ref
  `).all(operationRef);
}

test("lifecycle Store exposes only the four frozen terminal methods in addition to the existing surface", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    assert.deepEqual(Object.keys(store).sort(), STORE_METHODS);
    for (const method of [
      "captureCoinHold",
      "releaseCoinHold",
      "expireCoinHold",
      "expireCoinLot"
    ]) {
      assert.equal(typeof store[method], "function");
    }
  } finally {
    store?.close();
    database.close();
  }
});

test("forbidden generic balance and transaction APIs remain absent independently of lifecycle surface completion", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    for (const forbidden of [
      "setBalance",
      "adjustBalance",
      "updateBucket",
      "runInTransaction"
    ]) {
      assert.equal(forbidden in store, false);
    }
  } finally {
    store?.close();
    database.close();
  }
});

test("capture and release reject malformed exact request and operation shapes before transaction entry", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    for (const method of ["captureCoinHold", "releaseCoinHold"]) {
      const valid = method === "captureCoinHold"
        ? validCapture("hold_1")
        : validRelease("hold_1");
      const symbolRequest = { ...valid };
      symbolRequest[Symbol("extra")] = true;
      const hiddenRequest = { ...valid };
      Object.defineProperty(hiddenRequest, "hidden", { value: true });
      const accessorRequest = { ...valid };
      Object.defineProperty(accessorRequest, "holdRef", {
        enumerable: true,
        get: () => "hold_1"
      });
      const symbolOperation = {
        ...valid,
        operation: { ...valid.operation }
      };
      symbolOperation.operation[Symbol("extra")] = true;
      const hiddenOperation = {
        ...valid,
        operation: { ...valid.operation }
      };
      Object.defineProperty(hiddenOperation.operation, "hidden", { value: true });
      const accessorOperation = {
        ...valid,
        operation: { ...valid.operation }
      };
      Object.defineProperty(accessorOperation.operation, "actorRef", {
        enumerable: true,
        get: () => "account_1"
      });
      for (const input of [
        null,
        { ...valid, extra: true },
        symbolRequest,
        hiddenRequest,
        accessorRequest,
        { ...valid, operation: null },
        { ...valid, operation: { ...valid.operation, extra: true } },
        symbolOperation,
        hiddenOperation,
        accessorOperation
      ]) {
        assertLifecycleErrorWithoutReceipt(
          database,
          () => store[method](input),
          "invalid_wallet_request"
        );
      }
      for (const field of ["holdRef", "operation"]) {
        const input = { ...valid };
        delete input[field];
        assertLifecycleErrorWithoutReceipt(
          database,
          () => store[method](input),
          "invalid_wallet_request"
        );
      }
      for (const field of [
        "actorScope",
        "idempotencyKey",
        "actorType",
        "actorRef"
      ]) {
        const input = {
          ...valid,
          operation: { ...valid.operation }
        };
        delete input.operation[field];
        assertLifecycleErrorWithoutReceipt(
          database,
          () => store[method](input),
          "invalid_wallet_request"
        );
      }
      assertLifecycleErrorWithoutReceipt(
        database,
        () => store[method]({ ...valid, holdRef: " hold_1" }),
        "non_normalized_wallet_request"
      );
      assertLifecycleErrorWithoutReceipt(
        database,
        () => store[method]({
          ...valid,
          operation: {
            ...valid.operation,
            actorScope: " account:account_1"
          }
        }),
        "non_normalized_wallet_request"
      );
    }
  } finally {
    store?.close();
    database.close();
  }
});

test("expiry accepts only an exact subject ref and rejects caller operation evidence", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    store = createStore(database);
    for (const [method, field] of [
      ["expireCoinHold", "holdRef"],
      ["expireCoinLot", "lotRef"]
    ]) {
      const valid = { [field]: `${field}_1` };
      const symbolRequest = { ...valid };
      symbolRequest[Symbol("extra")] = true;
      const hiddenRequest = { ...valid };
      Object.defineProperty(hiddenRequest, "hidden", { value: true });
      const accessorRequest = {};
      Object.defineProperty(accessorRequest, field, {
        enumerable: true,
        get: () => `${field}_1`
      });
      for (const input of [
        null,
        {},
        { ...valid, extra: true },
        { ...valid, expiresAt: BONUS_EXPIRY },
        { ...valid, operation: validLifecycleOperation() },
        { ...valid, actorScope: "system:coin-wallet-expiry" },
        { ...valid, idempotencyKey: "caller_key" },
        { ...valid, requestDigest: "caller_digest" },
        symbolRequest,
        hiddenRequest,
        accessorRequest
      ]) {
        assertLifecycleErrorWithoutReceipt(
          database,
          () => store[method](input),
          "invalid_wallet_request"
        );
      }
      assertLifecycleErrorWithoutReceipt(
        database,
        () => store[method]({ [field]: ` ${field}_1` }),
        "non_normalized_wallet_request"
      );
    }
  } finally {
    store?.close();
    database.close();
  }
});

for (const [method, input, code] of [
  ["captureCoinHold", validCapture("hold_missing"), "hold_not_found"],
  ["releaseCoinHold", validRelease("hold_missing"), "hold_not_found"],
  ["expireCoinHold", { holdRef: "hold_missing" }, "hold_not_found"],
  ["expireCoinLot", { lotRef: "lot_missing" }, "lot_not_found"]
]) {
  test(`${method} rejects a missing durable subject without consuming a receipt key`, () => {
    const database = createSyntheticDatabase();
    let store;
    try {
      store = createStore(database);
      assertLifecycleErrorWithoutReceipt(
        database,
        () => store[method](input),
        code
      );
    } finally {
      store?.close();
      database.close();
    }
  });
}

test("credit rejects expanded-year expiry before creating any financial evidence", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    insertAccount(database, "account_1");
    store = createStore(database);
    const before = holdFinancialSnapshot(database);
    const countsBefore = financialCounts(database);
    expectCode(
      () => store.creditCoins(validCredit({
        coinType: "bonus_coins",
        sourceType: "approved_bonus",
        sourceRef: "expanded_year_bonus",
        expiresAt: "+010000-01-01T00:00:00.000Z"
      })),
      "invalid_wallet_timestamp"
    );
    assert.deepEqual(financialCounts(database), countsBefore);
    assert.deepEqual(holdFinancialSnapshot(database), before);
  } finally {
    store?.close();
    database.close();
  }
});

test("lifecycle rejects an expanded-year durable lot deadline without treating it as due", () => {
  const fixture = createLifecycleFixture({
    coinType: "bonus_coins",
    lotExpiresAt: "2026-07-24T00:00:00.000Z"
  });
  const { database, store, credit } = fixture;
  try {
    database.exec("drop trigger platform_coin_lots_expires_at_immutable_update");
    assert.equal(database.prepare(`
      update platform_coin_lots
         set expires_at = '+010000-01-01T00:00:00.000Z'
       where lot_ref = ?
    `).run(credit.resultRef).changes, 1);
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.expireCoinLot({ lotRef: credit.resultRef }),
      "wallet_infrastructure_error"
    );
  } finally {
    store.close();
    database.close();
  }
});

test("capture hold_expired remains receipt-only at the maximum safe wallet version", () => {
  const fixture = createLifecycleFixture();
  const { clock, database, store, credit, hold } = fixture;
  try {
    assert.equal(database.prepare(`
      update platform_coin_wallets set version = ? where wallet_ref = ?
    `).run(Number.MAX_SAFE_INTEGER, hold.walletRef).changes, 1);
    clock.setTimestamp("2026-07-24T12:34:56.000Z");
    const before = {
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef)
    };
    const result = store.captureCoinHold(validCapture(hold.resultRef));
    assertLifecycleEnvelope(result, {
      ok: false,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "hold_expired",
      resultRef: null,
      previousWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef)
    }, before);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "account:account_1",
      operationType: "capture_coin_hold",
      idempotencyKey: "capture_1",
      requestDigest: canonicalWalletRequestDigest("capture_coin_hold", {
        holdRef: hold.resultRef
      }),
      status: "failed",
      previousWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletStatus: "active",
      safeResultCode: "hold_expired",
      resultRef: null,
      occurredAt: "2026-07-24T12:34:56.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), []);
  } finally {
    store.close();
    database.close();
  }
});

test("terminal hold expiry remains receipt-only at the maximum safe wallet version", () => {
  const fixture = createLifecycleFixture();
  const { clock, database, store, credit, hold } = fixture;
  try {
    store.captureCoinHold(validCapture(hold.resultRef));
    assert.equal(database.prepare(`
      update platform_coin_wallets set version = ? where wallet_ref = ?
    `).run(Number.MAX_SAFE_INTEGER, hold.walletRef).changes, 1);
    clock.setTimestamp("2026-07-24T12:34:56.000Z");
    const before = {
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef)
    };
    const result = store.expireCoinHold({ holdRef: hold.resultRef });
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "expiry_processed",
      resultRef: hold.resultRef,
      previousWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef)
    }, before);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "system:coin-wallet-expiry",
      operationType: "expire_coin_hold",
      idempotencyKey:
        `hold-expiry:${hold.resultRef}:2026-07-24T12:34:56.000Z`,
      requestDigest: canonicalWalletRequestDigest("expire_coin_hold", {
        holdRef: hold.resultRef,
        expiresAt: "2026-07-24T12:34:56.000Z"
      }),
      status: "succeeded",
      previousWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletStatus: "active",
      safeResultCode: "expiry_processed",
      resultRef: hold.resultRef,
      occurredAt: "2026-07-24T12:34:56.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), []);
  } finally {
    store.close();
    database.close();
  }
});

test("zero-available lot expiry remains receipt-only at the maximum safe wallet version", () => {
  const fixture = createLifecycleFixture({
    coinType: "bonus_coins",
    lotExpiresAt: "2026-07-24T00:00:00.000Z"
  });
  const { clock, database, store, credit, hold } = fixture;
  try {
    assert.equal(database.prepare(`
      update platform_coin_wallets set version = ? where wallet_ref = ?
    `).run(Number.MAX_SAFE_INTEGER, hold.walletRef).changes, 1);
    clock.setTimestamp("2026-07-24T00:00:00.000Z");
    const before = {
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef)
    };
    const result = store.expireCoinLot({ lotRef: credit.resultRef });
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "expiry_processed",
      resultRef: credit.resultRef,
      previousWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef)
    }, before);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "system:coin-wallet-expiry",
      operationType: "expire_coin_lot",
      idempotencyKey:
        `lot-expiry:${credit.resultRef}:2026-07-24T00:00:00.000Z`,
      requestDigest: canonicalWalletRequestDigest("expire_coin_lot", {
        lotRef: credit.resultRef,
        expiresAt: "2026-07-24T00:00:00.000Z"
      }),
      status: "succeeded",
      previousWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletVersion: Number.MAX_SAFE_INTEGER,
      resultingWalletStatus: "active",
      safeResultCode: "expiry_processed",
      resultRef: credit.resultRef,
      occurredAt: "2026-07-24T00:00:00.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), []);
  } finally {
    store.close();
    database.close();
  }
});

test("a maximum safe wallet version still rejects a financial lifecycle increment atomically", () => {
  const fixture = createLifecycleFixture();
  const { database, store, hold } = fixture;
  try {
    assert.equal(database.prepare(`
      update platform_coin_wallets set version = ? where wallet_ref = ?
    `).run(Number.MAX_SAFE_INTEGER, hold.walletRef).changes, 1);
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.releaseCoinHold(validRelease(hold.resultRef)),
      "wallet_infrastructure_error"
    );
  } finally {
    store.close();
    database.close();
  }
});

test("capture success has the exact terminal envelope, receipt, buckets, version, actor audit, ledger, and replay", () => {
  const fixture = createLifecycleFixture();
  const { clock, database, store, credit, hold } = fixture;
  try {
    const input = validCapture(hold.resultRef);
    const readsBefore = clock.reads();
    const result = store.captureCoinHold(input);
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "captured",
      resultRef: hold.resultRef,
      previousWalletVersion: 2,
      resultingWalletVersion: 3,
      resultingWalletStatus: "active"
    });
    assert.equal(store.getHold(hold.resultRef).status, "captured");
    assert.deepEqual(store.getLot(credit.resultRef), {
      lotRef: credit.resultRef,
      walletRef: credit.walletRef,
      coinType: "paid_coins",
      creditOriginRef: "credit_origin_1",
      issuedUnits: 10,
      pendingUnits: 0,
      availableUnits: 0,
      heldUnits: 0,
      consumedUnits: 10,
      reversedUnits: 0,
      expiredUnits: 0,
      sourceType: "verified_recharge",
      sourceRef: "paid_coins_source",
      policyRef: null,
      policyVersion: null,
      expiresAt: null,
      createdAt: NOW,
      updatedAt: NOW
    });
    assert.equal(store.getWallet(hold.walletRef).version, 3);
    assert.deepEqual(lifecycleLedger(database, result.operationRef), [{
      operation_ref: result.operationRef,
      wallet_ref: hold.walletRef,
      lot_ref: credit.resultRef,
      operation: "held_to_consumed",
      amount_units: 10,
      hold_ref: hold.resultRef,
      order_ref: "order_1",
      source_type: "verified_recharge",
      source_ref: "paid_coins_source",
      actor_type: "user",
      actor_ref: "account_1",
      previous_wallet_version: 2,
      resulting_wallet_version: 3,
      resulting_wallet_status: "active",
      occurred_at: NOW
    }]);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "account:account_1",
      operationType: "capture_coin_hold",
      idempotencyKey: "capture_1",
      requestDigest: canonicalWalletRequestDigest(
        "capture_coin_hold",
        { holdRef: hold.resultRef }
      ),
      status: "succeeded",
      previousWalletVersion: 2,
      resultingWalletVersion: 3,
      resultingWalletStatus: "active",
      safeResultCode: "captured",
      resultRef: hold.resultRef,
      occurredAt: NOW
    });
    assert.deepEqual(store.captureCoinHold({
      ...input,
      operation: {
        ...input.operation,
        actorType: "admin",
        actorRef: "replay_actor"
      }
    }), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
    assert.equal(lifecycleLedger(database, result.operationRef).length, 1);
  } finally {
    store.close();
    database.close();
  }
});

test("capture at the exact immutable deadline stores only failed hold_expired and replays it", () => {
  const fixture = createLifecycleFixture();
  const { clock, database, store, credit, hold } = fixture;
  try {
    clock.setTimestamp("2026-07-24T12:34:56.000Z");
    const readsBefore = clock.reads();
    const before = {
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef),
      wallet: store.getWallet(hold.walletRef),
      ledgerCount: countRows(database, "platform_coin_ledger_entries")
    };
    const result = store.captureCoinHold(validCapture(hold.resultRef));
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: false,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "hold_expired",
      resultRef: null,
      previousWalletVersion: 2,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      hold: store.getHold(hold.resultRef),
      lot: store.getLot(credit.resultRef),
      wallet: store.getWallet(hold.walletRef),
      ledgerCount: countRows(database, "platform_coin_ledger_entries")
    }, before);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "account:account_1",
      operationType: "capture_coin_hold",
      idempotencyKey: "capture_1",
      requestDigest: canonicalWalletRequestDigest("capture_coin_hold", {
        holdRef: hold.resultRef
      }),
      status: "failed",
      previousWalletVersion: 2,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active",
      safeResultCode: "hold_expired",
      resultRef: null,
      occurredAt: "2026-07-24T12:34:56.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), []);
    assert.deepEqual(store.captureCoinHold(validCapture(hold.resultRef)), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
  } finally {
    store.close();
    database.close();
  }
});

test("release routes a due bonus to expired and paid Coins to available with one frozen-wallet version interval", () => {
  const database = createSyntheticDatabase();
  let clock;
  let store;
  try {
    insertAccount(database, "account_1");
    clock = createMutableDatabaseTimeConnection(database);
    store = createSqliteCoinWalletStore({
      database: clock.connection,
      refFactory: makeRefFactory()
    });
    const bonus = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 3,
      sourceType: "approved_bonus",
      sourceRef: "bonus_release",
      expiresAt: "2026-07-24T00:00:00.000Z",
      operation: { idempotencyKey: "credit_bonus_release" }
    }));
    const paid = store.creditCoins(validCredit({
      amountUnits: 4,
      sourceRef: "paid_release",
      operation: { idempotencyKey: "credit_paid_release" }
    }));
    const hold = store.createCoinHold(validHold({
      walletRef: bonus.walletRef,
      amountUnits: 7,
      acceptedCoinTypes: ["paid_coins", "bonus_coins"],
      operation: { idempotencyKey: "hold_release" }
    }));
    database.prepare(`
      update platform_coin_wallets
         set status = 'frozen'
       where wallet_ref = ?
    `).run(hold.walletRef);
    clock.setTimestamp("2026-07-24T12:34:56.000Z");
    const readsBefore = clock.reads();
    const result = store.releaseCoinHold(validRelease(hold.resultRef));
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "released",
      resultRef: hold.resultRef,
      previousWalletVersion: 3,
      resultingWalletVersion: 4,
      resultingWalletStatus: "frozen"
    });
    assert.equal(store.getHold(hold.resultRef).status, "released");
    assert.deepEqual([
      store.getLot(bonus.resultRef),
      store.getLot(paid.resultRef)
    ].map((lot) => [
      lot.availableUnits,
      lot.heldUnits,
      lot.expiredUnits
    ]), [
      [0, 0, 3],
      [4, 0, 0]
    ]);
    const ledger = lifecycleLedger(database, result.operationRef);
    assert.deepEqual(ledger, [
      {
        operation_ref: result.operationRef,
        wallet_ref: hold.walletRef,
        lot_ref: bonus.resultRef,
        operation: "held_to_expired",
        amount_units: 3,
        hold_ref: hold.resultRef,
        order_ref: "order_1",
        source_type: "approved_bonus",
        source_ref: "bonus_release",
        actor_type: "user",
        actor_ref: "account_1",
        previous_wallet_version: 3,
        resulting_wallet_version: 4,
        resulting_wallet_status: "frozen",
        occurred_at: "2026-07-24T12:34:56.000Z"
      },
      {
        operation_ref: result.operationRef,
        wallet_ref: hold.walletRef,
        lot_ref: paid.resultRef,
        operation: "held_to_available",
        amount_units: 4,
        hold_ref: hold.resultRef,
        order_ref: "order_1",
        source_type: "verified_recharge",
        source_ref: "paid_release",
        actor_type: "user",
        actor_ref: "account_1",
        previous_wallet_version: 3,
        resulting_wallet_version: 4,
        resulting_wallet_status: "frozen",
        occurred_at: "2026-07-24T12:34:56.000Z"
      }
    ]);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "account:account_1",
      operationType: "release_coin_hold",
      idempotencyKey: "release_1",
      requestDigest: canonicalWalletRequestDigest("release_coin_hold", {
        holdRef: hold.resultRef
      }),
      status: "succeeded",
      previousWalletVersion: 3,
      resultingWalletVersion: 4,
      resultingWalletStatus: "frozen",
      safeResultCode: "released",
      resultRef: hold.resultRef,
      occurredAt: "2026-07-24T12:34:56.000Z"
    });
    assert.deepEqual(store.releaseCoinHold(validRelease(hold.resultRef)), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
  } finally {
    store?.close();
    database.close();
  }
});

test("due hold expiry performs cleanup on a closed wallet and derives the exact worker identity and digest", () => {
  const fixture = createLifecycleFixture({
    coinType: "bonus_coins",
    lotExpiresAt: "2026-07-24T00:00:00.000Z"
  });
  const { clock, database, store, credit, hold } = fixture;
  try {
    database.prepare(`
      update platform_coin_wallets set status = 'closed' where wallet_ref = ?
    `).run(hold.walletRef);
    clock.setTimestamp("2026-07-24T12:34:56.000Z");
    const readsBefore = clock.reads();
    const result = store.expireCoinHold({ holdRef: hold.resultRef });
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "expired",
      resultRef: hold.resultRef,
      previousWalletVersion: 2,
      resultingWalletVersion: 3,
      resultingWalletStatus: "closed"
    });
    assert.equal(store.getHold(hold.resultRef).status, "expired");
    assert.deepEqual([
      store.getLot(credit.resultRef).availableUnits,
      store.getLot(credit.resultRef).heldUnits,
      store.getLot(credit.resultRef).expiredUnits
    ], [0, 0, 10]);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "system:coin-wallet-expiry",
      operationType: "expire_coin_hold",
      idempotencyKey:
        `hold-expiry:${hold.resultRef}:2026-07-24T12:34:56.000Z`,
      requestDigest: canonicalWalletRequestDigest("expire_coin_hold", {
        holdRef: hold.resultRef,
        expiresAt: "2026-07-24T12:34:56.000Z"
      }),
      status: "succeeded",
      previousWalletVersion: 2,
      resultingWalletVersion: 3,
      resultingWalletStatus: "closed",
      safeResultCode: "expired",
      resultRef: hold.resultRef,
      occurredAt: "2026-07-24T12:34:56.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), [{
      operation_ref: result.operationRef,
      wallet_ref: hold.walletRef,
      lot_ref: credit.resultRef,
      operation: "held_to_expired",
      amount_units: 10,
      hold_ref: hold.resultRef,
      order_ref: "order_1",
      source_type: "approved_bonus",
      source_ref: "bonus_coins_source",
      actor_type: "system",
      actor_ref: "coin_wallet_expiry_worker",
      previous_wallet_version: 2,
      resulting_wallet_version: 3,
      resulting_wallet_status: "closed",
      occurred_at: "2026-07-24T12:34:56.000Z"
    }]);
    assert.deepEqual(store.expireCoinHold({ holdRef: hold.resultRef }), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
  } finally {
    store.close();
    database.close();
  }
});

test("due expiry of a terminal hold stores expiry_processed without rewriting its terminal financial history", () => {
  const fixture = createLifecycleFixture();
  const { clock, database, store, hold } = fixture;
  try {
    const captured = store.captureCoinHold(validCapture(hold.resultRef));
    clock.setTimestamp("2026-07-24T12:34:56.000Z");
    const readsBefore = clock.reads();
    const before = {
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lots: database.prepare(
        "select * from platform_coin_lots order by lot_ref"
      ).all(),
      allocations: database.prepare(
        "select * from platform_coin_hold_allocations order by allocation_ref"
      ).all(),
      ledger: database.prepare(
        "select * from platform_coin_ledger_entries order by entry_ref"
      ).all()
    };
    const result = store.expireCoinHold({ holdRef: hold.resultRef });
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "expiry_processed",
      resultRef: hold.resultRef,
      previousWalletVersion: 3,
      resultingWalletVersion: 3,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      wallet: store.getWallet(hold.walletRef),
      hold: store.getHold(hold.resultRef),
      lots: database.prepare(
        "select * from platform_coin_lots order by lot_ref"
      ).all(),
      allocations: database.prepare(
        "select * from platform_coin_hold_allocations order by allocation_ref"
      ).all(),
      ledger: database.prepare(
        "select * from platform_coin_ledger_entries order by entry_ref"
      ).all()
    }, before);
    assert.equal(captured.safeResultCode, "captured");
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "system:coin-wallet-expiry",
      operationType: "expire_coin_hold",
      idempotencyKey:
        `hold-expiry:${hold.resultRef}:2026-07-24T12:34:56.000Z`,
      requestDigest: canonicalWalletRequestDigest("expire_coin_hold", {
        holdRef: hold.resultRef,
        expiresAt: "2026-07-24T12:34:56.000Z"
      }),
      status: "succeeded",
      previousWalletVersion: 3,
      resultingWalletVersion: 3,
      resultingWalletStatus: "active",
      safeResultCode: "expiry_processed",
      resultRef: hold.resultRef,
      occurredAt: "2026-07-24T12:34:56.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), []);
    assert.deepEqual(store.expireCoinHold({ holdRef: hold.resultRef }), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
  } finally {
    store.close();
    database.close();
  }
});

test("due finite bonus lot expiry moves all available units once with exact system audit", () => {
  const database = createSyntheticDatabase();
  let clock;
  let store;
  try {
    insertAccount(database, "account_1");
    clock = createMutableDatabaseTimeConnection(database);
    store = createSqliteCoinWalletStore({
      database: clock.connection,
      refFactory: makeRefFactory()
    });
    const credit = store.creditCoins(validCredit({
      coinType: "bonus_coins",
      amountUnits: 6,
      sourceType: "approved_bonus",
      sourceRef: "bonus_expiry",
      expiresAt: "2026-07-24T00:00:00.000Z"
    }));
    clock.setTimestamp("2026-07-24T00:00:00.000Z");
    const readsBefore = clock.reads();
    const result = store.expireCoinLot({ lotRef: credit.resultRef });
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: credit.walletRef,
      safeResultCode: "expired",
      resultRef: credit.resultRef,
      previousWalletVersion: 1,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active"
    });
    assert.deepEqual([
      store.getLot(credit.resultRef).availableUnits,
      store.getLot(credit.resultRef).heldUnits,
      store.getLot(credit.resultRef).expiredUnits
    ], [0, 0, 6]);
    assertLifecycleReceipt(database, result, {
      walletRef: credit.walletRef,
      actorScope: "system:coin-wallet-expiry",
      operationType: "expire_coin_lot",
      idempotencyKey:
        `lot-expiry:${credit.resultRef}:2026-07-24T00:00:00.000Z`,
      requestDigest: canonicalWalletRequestDigest("expire_coin_lot", {
        lotRef: credit.resultRef,
        expiresAt: "2026-07-24T00:00:00.000Z"
      }),
      status: "succeeded",
      previousWalletVersion: 1,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active",
      safeResultCode: "expired",
      resultRef: credit.resultRef,
      occurredAt: "2026-07-24T00:00:00.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), [{
      operation_ref: result.operationRef,
      wallet_ref: credit.walletRef,
      lot_ref: credit.resultRef,
      operation: "available_to_expired",
      amount_units: 6,
      hold_ref: null,
      order_ref: null,
      source_type: "approved_bonus",
      source_ref: "bonus_expiry",
      actor_type: "system",
      actor_ref: "coin_wallet_expiry_worker",
      previous_wallet_version: 1,
      resulting_wallet_version: 2,
      resulting_wallet_status: "active",
      occurred_at: "2026-07-24T00:00:00.000Z"
    }]);
    assert.deepEqual(store.expireCoinLot({ lotRef: credit.resultRef }), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
  } finally {
    store?.close();
    database.close();
  }
});

test("due finite bonus lot with only protected held units stores expiry_processed and changes no financial row", () => {
  const fixture = createLifecycleFixture({
    coinType: "bonus_coins",
    lotExpiresAt: "2026-07-24T00:00:00.000Z"
  });
  const { clock, database, store, credit, hold } = fixture;
  try {
    clock.setTimestamp("2026-07-24T00:00:00.000Z");
    const readsBefore = clock.reads();
    const before = {
      wallet: store.getWallet(hold.walletRef),
      lot: store.getLot(credit.resultRef),
      hold: store.getHold(hold.resultRef),
      ledger: database.prepare(
        "select * from platform_coin_ledger_entries order by entry_ref"
      ).all()
    };
    const result = store.expireCoinLot({ lotRef: credit.resultRef });
    assert.equal(clock.reads(), readsBefore + 1);
    assertLifecycleEnvelope(result, {
      ok: true,
      replayed: false,
      walletRef: hold.walletRef,
      safeResultCode: "expiry_processed",
      resultRef: credit.resultRef,
      previousWalletVersion: 2,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active"
    });
    assert.deepEqual({
      wallet: store.getWallet(hold.walletRef),
      lot: store.getLot(credit.resultRef),
      hold: store.getHold(hold.resultRef),
      ledger: database.prepare(
        "select * from platform_coin_ledger_entries order by entry_ref"
      ).all()
    }, before);
    assertLifecycleReceipt(database, result, {
      walletRef: hold.walletRef,
      actorScope: "system:coin-wallet-expiry",
      operationType: "expire_coin_lot",
      idempotencyKey:
        `lot-expiry:${credit.resultRef}:2026-07-24T00:00:00.000Z`,
      requestDigest: canonicalWalletRequestDigest("expire_coin_lot", {
        lotRef: credit.resultRef,
        expiresAt: "2026-07-24T00:00:00.000Z"
      }),
      status: "succeeded",
      previousWalletVersion: 2,
      resultingWalletVersion: 2,
      resultingWalletStatus: "active",
      safeResultCode: "expiry_processed",
      resultRef: credit.resultRef,
      occurredAt: "2026-07-24T00:00:00.000Z"
    });
    assert.deepEqual(lifecycleLedger(database, result.operationRef), []);
    assert.deepEqual(store.expireCoinLot({ lotRef: credit.resultRef }), {
      ...result,
      replayed: true
    });
    assert.equal(clock.reads(), readsBefore + 1);
  } finally {
    store.close();
    database.close();
  }
});

for (const walletStatus of ["active", "closed"]) {
  test(`release preserves ${walletStatus} wallet status during mandatory cleanup`, () => {
    const fixture = createLifecycleFixture();
    const { clock, database, store, hold } = fixture;
    try {
      database.prepare(`
        update platform_coin_wallets set status = ? where wallet_ref = ?
      `).run(walletStatus, hold.walletRef);
      clock.setTimestamp("2026-07-25T00:00:00.000Z");
      const result = store.releaseCoinHold(validRelease(hold.resultRef));
      assert.equal(result.safeResultCode, "released");
      assert.equal(result.resultingWalletStatus, walletStatus);
      assert.equal(result.resultingWalletVersion, result.previousWalletVersion + 1);
      assert.equal(store.getWallet(hold.walletRef).status, walletStatus);
    } finally {
      store.close();
      database.close();
    }
  });
}

for (const walletStatus of ["active", "frozen"]) {
  test(`hold expiry preserves ${walletStatus} wallet status during mandatory cleanup`, () => {
    const fixture = createLifecycleFixture();
    const { clock, database, store, hold } = fixture;
    try {
      database.prepare(`
        update platform_coin_wallets set status = ? where wallet_ref = ?
      `).run(walletStatus, hold.walletRef);
      clock.setTimestamp("2026-07-24T12:34:56.000Z");
      const result = store.expireCoinHold({ holdRef: hold.resultRef });
      assert.equal(result.safeResultCode, "expired");
      assert.equal(result.resultingWalletStatus, walletStatus);
      assert.equal(result.resultingWalletVersion, result.previousWalletVersion + 1);
      assert.equal(store.getWallet(hold.walletRef).status, walletStatus);
    } finally {
      store.close();
      database.close();
    }
  });
}

for (const walletStatus of ["frozen", "closed"]) {
  test(`lot expiry preserves ${walletStatus} wallet status for receipt-only cleanup`, () => {
    const fixture = createLifecycleFixture({
      coinType: "bonus_coins",
      lotExpiresAt: "2026-07-24T00:00:00.000Z"
    });
    const { clock, credit, database, store, hold } = fixture;
    try {
      database.prepare(`
        update platform_coin_wallets set status = ? where wallet_ref = ?
      `).run(walletStatus, hold.walletRef);
      clock.setTimestamp("2026-07-24T00:00:00.000Z");
      const result = store.expireCoinLot({ lotRef: credit.resultRef });
      assert.equal(result.safeResultCode, "expiry_processed");
      assert.equal(result.resultingWalletStatus, walletStatus);
      assert.equal(result.resultingWalletVersion, result.previousWalletVersion);
      assert.equal(store.getWallet(hold.walletRef).status, walletStatus);
    } finally {
      store.close();
      database.close();
    }
  });
}

test("remaining lifecycle business errors are no-receipt and capture rejects frozen and closed wallets", () => {
  for (const walletStatus of ["frozen", "closed"]) {
    const fixture = createLifecycleFixture();
    const { database, store, hold } = fixture;
    try {
      database.prepare(`
        update platform_coin_wallets set status = ? where wallet_ref = ?
      `).run(walletStatus, hold.walletRef);
      assertLifecycleErrorWithoutReceipt(
        database,
        () => store.captureCoinHold(validCapture(hold.resultRef, {
          operation: { idempotencyKey: `capture_${walletStatus}` }
        })),
        "wallet_not_active"
      );
    } finally {
      store.close();
      database.close();
    }
  }

  const terminal = createLifecycleFixture();
  try {
    terminal.store.releaseCoinHold(validRelease(terminal.hold.resultRef));
    for (const [method, input] of [
      ["captureCoinHold", validCapture(terminal.hold.resultRef, {
        operation: { idempotencyKey: "capture_terminal" }
      })],
      ["releaseCoinHold", validRelease(terminal.hold.resultRef, {
        operation: { idempotencyKey: "release_terminal" }
      })]
    ]) {
      assertLifecycleErrorWithoutReceipt(
        terminal.database,
        () => terminal.store[method](input),
        "coin_hold_not_active"
      );
    }
  } finally {
    terminal.store.close();
    terminal.database.close();
  }

  for (const options of [
    { coinType: "paid_coins" },
    { coinType: "bonus_coins", lotExpiresAt: null }
  ]) {
    const fixture = createLifecycleFixture(options);
    try {
      assertLifecycleErrorWithoutReceipt(
        fixture.database,
        () => fixture.store.expireCoinLot({ lotRef: fixture.credit.resultRef }),
        "coin_lot_not_expirable"
      );
    } finally {
      fixture.store.close();
      fixture.database.close();
    }
  }
});

test("early hold and lot expiry return not_due without receipts, including a terminal hold", () => {
  const fixture = createLifecycleFixture({
    coinType: "bonus_coins",
    lotExpiresAt: "2026-07-25T00:00:00.000Z"
  });
  const { database, store, credit, hold } = fixture;
  try {
    const holdReadsBefore = fixture.clock.reads();
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.expireCoinHold({ holdRef: hold.resultRef }),
      "not_due"
    );
    assert.equal(fixture.clock.reads(), holdReadsBefore + 1);
    const lotReadsBefore = fixture.clock.reads();
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.expireCoinLot({ lotRef: credit.resultRef }),
      "not_due"
    );
    assert.equal(fixture.clock.reads(), lotReadsBefore + 1);
    database.prepare(`
      update platform_coin_holds
         set status = 'invalidated'
       where hold_ref = ?
    `).run(hold.resultRef);
    const terminalReadsBefore = fixture.clock.reads();
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.expireCoinHold({ holdRef: hold.resultRef }),
      "not_due"
    );
    assert.equal(fixture.clock.reads(), terminalReadsBefore + 1);
  } finally {
    store.close();
    database.close();
  }
});

test("lifecycle digest drift conflicts and a malformed locked DB UTC fails without consuming a receipt", () => {
  const fixture = createLifecycleFixture();
  const { clock, database, store, hold } = fixture;
  try {
    const input = validCapture(hold.resultRef);
    store.captureCoinHold(input);
    const readsAfterCapture = clock.reads();
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.captureCoinHold({
        ...input,
        holdRef: "hold_other"
      }),
      "idempotency_conflict"
    );
    assert.equal(clock.reads(), readsAfterCapture);
  } finally {
    store.close();
    database.close();
  }

  const invalidTime = createLifecycleFixture();
  try {
    invalidTime.clock.setTimestamp("not-a-database-time");
    const readsBefore = invalidTime.clock.reads();
    assertLifecycleErrorWithoutReceipt(
      invalidTime.database,
      () => invalidTime.store.releaseCoinHold(
        validRelease(invalidTime.hold.resultRef)
      ),
      "wallet_infrastructure_error"
    );
    assert.equal(invalidTime.clock.reads(), readsBefore + 1);
  } finally {
    invalidTime.store.close();
    invalidTime.database.close();
  }
});

test("BEGIN IMMEDIATE busy maps to wallet_busy and does not consume a lifecycle key", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    insertAccount(database, "account_1");
    const fixedTimeDatabase = createFixedDatabaseTimeConnection(database, NOW);
    const probe = createArmableBusyConnection(fixedTimeDatabase);
    store = createSqliteCoinWalletStore({
      database: probe.connection,
      refFactory: makeRefFactory()
    });
    const credit = store.creditCoins(validCredit());
    const hold = store.createCoinHold(validHold({
      walletRef: credit.walletRef
    }));
    probe.arm();
    assertLifecycleErrorWithoutReceipt(
      database,
      () => store.captureCoinHold(validCapture(hold.resultRef)),
      "wallet_busy"
    );
  } finally {
    store?.close();
    database.close();
  }
});

for (const receiptShape of [
  "capture_success",
  "capture_failed",
  "release_success",
  "expire_hold_success",
  "expire_hold_noop",
  "expire_lot_success",
  "expire_lot_noop"
]) {
  test(`${receiptShape} replay rejects one cross-shape terminal receipt mutation`, () => {
    const needsBonus = receiptShape.startsWith("expire_lot");
    const fixture = createLifecycleFixture(needsBonus
      ? {
          coinType: "bonus_coins",
          lotExpiresAt: "2026-07-24T00:00:00.000Z"
        }
      : {});
    const { clock, credit, database, store, hold } = fixture;
    try {
      let result;
      let replay;
      let mutation;
      if (receiptShape === "capture_success") {
        const input = validCapture(hold.resultRef);
        result = store.captureCoinHold(input);
        replay = () => store.captureCoinHold(input);
        mutation = "safe_result_code = 'released'";
      } else if (receiptShape === "capture_failed") {
        clock.setTimestamp("2026-07-24T12:34:56.000Z");
        const input = validCapture(hold.resultRef);
        result = store.captureCoinHold(input);
        replay = () => store.captureCoinHold(input);
        mutation = "result_ref = 'hold_cross_shape'";
      } else if (receiptShape === "release_success") {
        const input = validRelease(hold.resultRef);
        result = store.releaseCoinHold(input);
        replay = () => store.releaseCoinHold(input);
        mutation = "safe_result_code = 'captured'";
      } else if (receiptShape === "expire_hold_success") {
        clock.setTimestamp("2026-07-24T12:34:56.000Z");
        result = store.expireCoinHold({ holdRef: hold.resultRef });
        replay = () => store.expireCoinHold({ holdRef: hold.resultRef });
        mutation = "safe_result_code = 'expiry_processed'";
      } else if (receiptShape === "expire_hold_noop") {
        store.captureCoinHold(validCapture(hold.resultRef));
        clock.setTimestamp("2026-07-24T12:34:56.000Z");
        result = store.expireCoinHold({ holdRef: hold.resultRef });
        replay = () => store.expireCoinHold({ holdRef: hold.resultRef });
        mutation = "resulting_wallet_version = previous_wallet_version + 1";
      } else if (receiptShape === "expire_lot_success") {
        store.releaseCoinHold(validRelease(hold.resultRef));
        clock.setTimestamp("2026-07-24T00:00:00.000Z");
        result = store.expireCoinLot({ lotRef: credit.resultRef });
        replay = () => store.expireCoinLot({ lotRef: credit.resultRef });
        mutation = "result_ref = 'lot_cross_shape'";
      } else {
        clock.setTimestamp("2026-07-24T00:00:00.000Z");
        result = store.expireCoinLot({ lotRef: credit.resultRef });
        replay = () => store.expireCoinLot({ lotRef: credit.resultRef });
        mutation = "safe_result_code = 'expired'";
      }
      const receiptCountBeforeReplay = lifecycleReceiptCount(database);
      database.exec(`
        drop trigger platform_coin_operation_receipts_terminal_immutable_update
      `);
      database.pragma("ignore_check_constraints = ON");
      database.prepare(`
        update platform_coin_operation_receipts
           set ${mutation}
         where operation_ref = ?
      `).run(result.operationRef);
      assertLifecycleErrorWithoutReceipt(
        database,
        replay,
        "idempotency_unavailable"
      );
      assert.equal(
        lifecycleReceiptCount(database),
        receiptCountBeforeReplay
      );
    } finally {
      store.close();
      database.close();
    }
  });
}

test("ledger history rejects direct update and delete through both named immutable triggers", () => {
  const database = createSyntheticDatabase();
  let store;
  try {
    insertAccount(database, "account_1");
    store = createStore(database);
    const credit = store.creditCoins(validCredit());
    const before = database.prepare(`
      select * from platform_coin_ledger_entries where operation_ref = ?
    `).get(credit.operationRef);
    for (const sql of [
      `
        update platform_coin_ledger_entries
           set operation = 'balance_update'
         where operation_ref = ?
      `,
      `
        delete from platform_coin_ledger_entries
         where operation_ref = ?
      `
    ]) {
      assert.throws(
        () => database.prepare(sql).run(credit.operationRef),
        (error) => (
          error?.code === "SQLITE_CONSTRAINT_TRIGGER"
          && /coin_ledger_immutable/.test(error.message)
        )
      );
      assert.deepEqual(database.prepare(`
        select * from platform_coin_ledger_entries where operation_ref = ?
      `).get(credit.operationRef), before);
    }
  } finally {
    store?.close();
    database.close();
  }
});

for (const corruption of [
  "allocation_sequence",
  "allocation_sum",
  "lot_ownership",
  "held_coverage",
  "unsafe_arithmetic"
]) {
  test(`release rejects ${corruption} allocation corruption without a receipt or partial write`, () => {
    const fixture = createLifecycleFixture();
    const { database, store, credit, hold } = fixture;
    try {
      database.exec(`
        drop trigger platform_coin_hold_allocations_immutable_update
      `);
      if (corruption === "allocation_sequence") {
        database.prepare(`
          update platform_coin_hold_allocations
             set allocation_sequence = 2
           where hold_ref = ?
        `).run(hold.resultRef);
      } else if (corruption === "allocation_sum") {
        database.prepare(`
          update platform_coin_hold_allocations
             set allocated_units = 9
           where hold_ref = ?
        `).run(hold.resultRef);
      } else if (corruption === "lot_ownership") {
        insertAccount(database, "account_2");
        const other = store.creditCoins(validCredit({
          accountId: "account_2",
          amountUnits: 1,
          sourceRef: "other_wallet_source",
          operation: {
            actorScope: "account:account_2",
            idempotencyKey: "other_wallet_credit",
            actorRef: "account_2"
          }
        }));
        database.prepare(`
          update platform_coin_hold_allocations
             set lot_ref = ?
           where hold_ref = ?
        `).run(other.resultRef, hold.resultRef);
      } else if (corruption === "held_coverage") {
        database.prepare(`
          update platform_coin_lots
             set available_units = 1,
                 held_units = 9
           where lot_ref = ?
        `).run(credit.resultRef);
      } else {
        const unsafe = Number.MAX_SAFE_INTEGER + 1;
        database.prepare(`
          update platform_coin_hold_allocations
             set allocated_units = ?
           where hold_ref = ?
        `).run(unsafe, hold.resultRef);
        database.prepare(`
          update platform_coin_holds
             set amount_units = ?
           where hold_ref = ?
        `).run(unsafe, hold.resultRef);
        database.prepare(`
          update platform_coin_lots
             set issued_units = ?,
                 available_units = 0,
                 held_units = ?,
                 consumed_units = 0,
                 reversed_units = 0,
                 expired_units = 0
           where lot_ref = ?
        `).run(unsafe, unsafe, credit.resultRef);
      }
      const before = holdFinancialSnapshot(database);
      assertLifecycleErrorWithoutReceipt(
        database,
        () => store.releaseCoinHold(validRelease(hold.resultRef)),
        "wallet_infrastructure_error"
      );
      assert.deepEqual(holdFinancialSnapshot(database), before);
    } finally {
      store.close();
      database.close();
    }
  });
}
