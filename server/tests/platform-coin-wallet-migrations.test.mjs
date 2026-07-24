import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations,
  dryRunCoinWalletMigrations,
  inspectCoinWalletSchema,
  validateCoinWalletSchema
} from "../services/platform/coin-wallet-migrations.mjs";

const MIGRATION_ID = "20260723_001_coin_wallet_foundation";
const OLD_DDL_CHECKSUM = "6092a9fc1ad4b22d5b31592a6395f8938784fb44de2dca733f1eb16ec1505de7";
const APPLIED_AT = "2026-07-23T12:34:56.000Z";

const OWNED_TABLES = [
  "platform_schema_migrations",
  "platform_coin_wallets",
  "platform_coin_lots",
  "platform_coin_holds",
  "platform_coin_hold_allocations",
  "platform_coin_operation_receipts",
  "platform_coin_credit_origins",
  "platform_coin_ledger_entries"
];

const OWNED_INDEXES = [
  "platform_coin_wallets_account_id_idx",
  "platform_coin_lots_eligible_allocation_idx",
  "platform_coin_holds_active_expiry_idx",
  "platform_coin_operation_receipts_replay_idx",
  "platform_coin_ledger_entries_wallet_page_idx"
];

const OWNED_TRIGGERS = [
  "platform_coin_ledger_entries_immutable_update",
  "platform_coin_ledger_entries_immutable_delete",
  "platform_coin_operation_receipts_terminal_immutable_update",
  "platform_coin_operation_receipts_immutable_delete",
  "platform_coin_hold_allocations_immutable_update",
  "platform_coin_hold_allocations_immutable_delete",
  "platform_coin_holds_expires_at_immutable_update",
  "platform_coin_lots_expires_at_immutable_update"
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

async function withTempDirectoryAsync(prefix, action) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50
    });
  }
}

function createSyntheticDatabase(dbPath, { sentinel = false } = {}) {
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
      );
    `);
    if (sentinel) {
      database.exec(`
        create table legacy_sentinel (
          id integer primary key,
          label text not null,
          payload blob not null
        );
      `);
      database.prepare(
        "insert into legacy_sentinel (id, label, payload) values (?, ?, ?)"
      ).run(7, "preserve-me", Buffer.from([0, 1, 2, 254, 255]));
    }
  } finally {
    database.close();
  }
}

function expectMigrationError(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.doesNotMatch(error?.message ?? "", /create table|select |insert |pragma /i);
    return true;
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function loadNormalizeSqlForTest() {
  const source = readFileSync(
    new URL("../services/platform/coin-wallet-migrations.mjs", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("function normalizeSql(sql) {");
  const endMarker = "\n}\n\nconst EXPECTED_OBJECT_SQL";
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return Function(
    `"use strict"; ${source.slice(start, end + 2)}; return normalizeSql;`
  )();
}

function listOwnedObjects(database) {
  return database.prepare(`
    select type, name
      from sqlite_master
     where name in (${[...OWNED_TABLES, ...OWNED_INDEXES, ...OWNED_TRIGGERS].map(() => "?").join(", ")})
     order by type, name
  `).all(...OWNED_TABLES, ...OWNED_INDEXES, ...OWNED_TRIGGERS);
}

function uniqueColumnSets(database, table) {
  return database.pragma(`index_list(${table})`)
    .filter(({ unique }) => unique === 1)
    .map(({ name }) => database.pragma(`index_info(${name})`).map((column) => column.name))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function createLotPolicyFixture(dbPath) {
  createSyntheticDatabase(dbPath);
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
  const database = new Database(dbPath);
  try {
    database.pragma("foreign_keys = ON");
    database.prepare(`
      insert into platform_accounts (
        id, owner_ref, status, created_at, updated_at, metadata_json
      ) values (?, ?, ?, ?, ?, ?)
    `).run("account_policy", "owner_policy", "active", APPLIED_AT, APPLIED_AT, "{}");
    database.prepare(`
      insert into platform_coin_wallets (
        wallet_ref, account_id, status, version, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?)
    `).run("wallet_policy", "account_policy", "active", 0, APPLIED_AT, APPLIED_AT);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function insertPolicyLot(database, {
  suffix,
  coinType,
  policyRef,
  policyVersion,
  expiresAt = null
}) {
  const operationRef = `operation_${suffix}`;
  const originRef = `origin_${suffix}`;
  const lotRef = `lot_${suffix}`;
  const insert = database.transaction(() => {
    database.prepare(`
      insert into platform_coin_operation_receipts (
        operation_ref, wallet_ref, actor_scope, operation_type, idempotency_key,
        request_digest, status, previous_wallet_version, resulting_wallet_version,
        resulting_wallet_status, result_ref, safe_result_code, created_at, completed_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operationRef,
      "wallet_policy",
      "system:policy-test",
      "credit",
      `key_${suffix}`,
      `digest_${suffix}`,
      "succeeded",
      0,
      1,
      "active",
      lotRef,
      "credited",
      APPLIED_AT,
      APPLIED_AT
    );
    database.prepare(`
      insert into platform_coin_credit_origins (
        credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
        source_digest, operation_ref, lot_ref, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      originRef,
      "wallet_policy",
      coinType,
      "synthetic",
      `source_${suffix}`,
      `source_digest_${suffix}`,
      operationRef,
      lotRef,
      APPLIED_AT
    );
    database.prepare(`
      insert into platform_coin_lots (
        lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
        pending_units, available_units, held_units, consumed_units,
        reversed_units, expired_units, source_type, source_ref, policy_ref,
        policy_version, expires_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lotRef,
      "wallet_policy",
      coinType,
      originRef,
      1,
      coinType === "reward_coins" ? 1 : 0,
      coinType === "reward_coins" ? 0 : 1,
      0,
      0,
      0,
      0,
      "synthetic",
      `source_${suffix}`,
      policyRef,
      policyVersion,
      expiresAt,
      APPLIED_AT,
      APPLIED_AT
    );
  });
  insert.immediate();
}

function insertReceipt(database, options) {
  const {
    suffix,
    status,
    walletRef = null
  } = options;
  const isStarted = status === "started";
  const previousWalletVersion = options.previousWalletVersion === undefined
    ? (isStarted ? null : 0)
    : options.previousWalletVersion;
  const resultingWalletVersion = options.resultingWalletVersion === undefined
    ? (isStarted ? null : previousWalletVersion)
    : options.resultingWalletVersion;
  const resultingWalletStatus = options.resultingWalletStatus === undefined
    ? (isStarted ? null : "active")
    : options.resultingWalletStatus;
  const resultRef = options.resultRef === undefined
    ? (status === "succeeded" ? `result_${suffix}` : null)
    : options.resultRef;
  const safeResultCode = options.safeResultCode === undefined
    ? (isStarted ? null : status)
    : options.safeResultCode;
  const completedAt = options.completedAt === undefined
    ? (isStarted ? null : APPLIED_AT)
    : options.completedAt;
  database.prepare(`
    insert into platform_coin_operation_receipts (
      operation_ref, wallet_ref, actor_scope, operation_type, idempotency_key,
      request_digest, status, previous_wallet_version, resulting_wallet_version,
      resulting_wallet_status, result_ref, safe_result_code, created_at, completed_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `receipt_${suffix}`,
    walletRef,
    "system:receipt-test",
    "credit",
    `receipt_key_${suffix}`,
    `receipt_digest_${suffix}`,
    status,
    previousWalletVersion,
    resultingWalletVersion,
    resultingWalletStatus,
    resultRef,
    safeResultCode,
    APPLIED_AT,
    completedAt
  );
}

function insertLedgerEntry(database, {
  suffix,
  resultingWalletStatus
}) {
  database.prepare(`
    insert into platform_coin_ledger_entries (
      entry_ref, operation_ref, wallet_ref, lot_ref, operation, amount_units,
      hold_ref, order_ref, source_type, source_ref, actor_type, actor_ref,
      previous_wallet_version, resulting_wallet_version,
      resulting_wallet_status, occurred_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `entry_${suffix}`,
    "operation_ledger_source",
    "wallet_policy",
    "lot_ledger_source",
    "credit",
    1,
    null,
    null,
    "synthetic",
    "source_ledger_source",
    "system",
    "receipt-test",
    0,
    1,
    resultingWalletStatus,
    APPLIED_AT
  );
}

function insertHoldAllocationFixture(database) {
  insertPolicyLot(database, {
    suffix: "allocation_first",
    coinType: "paid_coins",
    policyRef: null,
    policyVersion: null
  });
  insertPolicyLot(database, {
    suffix: "allocation_second",
    coinType: "paid_coins",
    policyRef: null,
    policyVersion: null
  });
  database.prepare(`
    insert into platform_coin_holds (
      hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
      expires_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "hold_allocation",
    "wallet_policy",
    "product_purchase",
    "order_allocation",
    2,
    "active",
    "2026-07-23T13:34:56.000Z",
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_coin_hold_allocations (
      allocation_ref, hold_ref, lot_ref, allocation_sequence,
      allocated_units, created_at
    ) values (?, ?, ?, ?, ?, ?)
  `).run(
    "allocation_first",
    "hold_allocation",
    "lot_allocation_first",
    1,
    1,
    APPLIED_AT
  );
}

function assertClosedValidationFailure(result, reasonCode, forbiddenName) {
  assert.deepEqual(result, {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: MIGRATION_ID,
    counts: {
      tables: 0,
      indexes: 0,
      triggers: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      schemaExact: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: [reasonCode]
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    new RegExp(`${forbiddenName}|sqlite|select |pragma |not a database`, "i")
  );
}

function assertTriggerRejectsAndPreserves(database, {
  table,
  keyColumn,
  key,
  updateSql,
  params,
  abortMessage
}) {
  const select = database.prepare(
    `select * from ${table} where ${keyColumn} = ?`
  );
  const before = select.get(key);
  assert.throws(
    () => database.prepare(updateSql).run(...params),
    (error) => {
      assert.equal(error?.code, "SQLITE_CONSTRAINT_TRIGGER");
      assert.equal(error?.message, abortMessage);
      return true;
    }
  );
  assert.deepEqual(select.get(key), before);
}

test("exports one checksum-bound PR1 migration without touching a database on import", () => {
  assert.equal(REQUIRED_COIN_WALLET_MIGRATION_ID, MIGRATION_ID);
  assert.equal(COIN_WALLET_MIGRATIONS.length, 1);
  assert.deepEqual(Object.keys(COIN_WALLET_MIGRATIONS[0]).sort(), [
    "ddlChecksum",
    "id"
  ]);
  assert.equal(COIN_WALLET_MIGRATIONS[0].id, MIGRATION_ID);
  assert.match(COIN_WALLET_MIGRATIONS[0].ddlChecksum, /^[a-f0-9]{64}$/);
  assert.notEqual(COIN_WALLET_MIGRATIONS[0].ddlChecksum, OLD_DDL_CHECKSUM);
  assert.equal(OWNED_TABLES.length, 8);
  assert.equal(OWNED_INDEXES.length, 5);
  assert.equal(OWNED_TRIGGERS.length, 8);
});

test("SQL normalization preserves quoted literal bytes and safely handles unmatched quotes", () => {
  const normalizeSql = loadNormalizeSqlForTest();
  assert.equal(
    normalizeSql(
      " CREATE  TRIGGER sample BEFORE UPDATE ON sample BEGIN "
        + "SELECT RAISE ( ABORT , 'MiX  ''  ,(=+>)' ) ; END; "
    ),
    "create trigger sample before update on sample begin "
      + "select raise(abort,'MiX  ''  ,(=+>)'); end"
  );
  assert.notEqual(
    normalizeSql("select 'unterminated MiX"),
    normalizeSql("SELECT 'unterminated mix")
  );
});

test("initial migration creates only Wallet Core and defers recovery schema", () => {
  withTempDirectory("coin-wallet-migration-core-only-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    createSyntheticDatabase(dbPath);
    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(APPLIED_AT)
    });

    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const objects = database.prepare(`
        select type, name
          from sqlite_master
         where type in ('table', 'index', 'trigger')
           and (
             name = 'platform_schema_migrations'
             or name like 'platform_coin_%'
           )
         order by type, name
      `).all();
      assert.deepEqual(
        objects,
        [
          ...OWNED_INDEXES.map((name) => ({ type: "index", name })),
          ...OWNED_TABLES.map((name) => ({ type: "table", name })),
          ...OWNED_TRIGGERS.map((name) => ({ type: "trigger", name }))
        ].sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
      );
      for (const name of [
        "platform_coin_recovery_cases",
        "platform_coin_source_reversal_allocations",
        "platform_coin_recovery_resolutions",
        "platform_coin_wallet_restrictions",
        "platform_coin_recovery_cases_open_idx",
        "platform_coin_wallet_restrictions_active_idx"
      ]) {
        assert.equal(database.prepare(
          "select 1 from sqlite_master where name = ?"
        ).get(name), undefined, `${name} must be deferred`);
      }
    } finally {
      database.close();
    }
  });
});

test("first apply atomically creates the ledger, every owned object, and the PR1 row", () => {
  withTempDirectory("coin-wallet-migration-fresh-", (directory) => {
    const dbPath = join(directory, "synthetic.sqlite");
    createSyntheticDatabase(dbPath);

    const result = applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(APPLIED_AT)
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.appliedMigrationIds, [MIGRATION_ID]);
    assert.equal(result.schemaState, "ready");
    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      assert.deepEqual(
        listOwnedObjects(database),
        [
          ...OWNED_INDEXES.map((name) => ({ type: "index", name })),
          ...OWNED_TABLES.map((name) => ({ type: "table", name })),
          ...OWNED_TRIGGERS.map((name) => ({ type: "trigger", name }))
        ].sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
      );
      assert.deepEqual(database.prepare(
        "select migration_id, ddl_checksum, applied_at from platform_schema_migrations"
      ).all(), [{
        migration_id: MIGRATION_ID,
        ddl_checksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
        applied_at: APPLIED_AT
      }]);
    } finally {
      database.close();
    }
  });
});

test("apply preserves an unrelated legacy table definition and row bytes", () => {
  withTempDirectory("coin-wallet-migration-legacy-", (directory) => {
    const dbPath = join(directory, "legacy.sqlite");
    createSyntheticDatabase(dbPath, { sentinel: true });
    const before = new Database(dbPath, { readonly: true });
    let beforeSql;
    let beforeRow;
    try {
      beforeSql = before.prepare(
        "select sql from sqlite_master where type = 'table' and name = 'legacy_sentinel'"
      ).pluck().get();
      beforeRow = before.prepare(
        "select id, label, payload from legacy_sentinel"
      ).get();
    } finally {
      before.close();
    }

    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    });

    const after = new Database(dbPath, { readonly: true });
    try {
      assert.equal(after.prepare(
        "select sql from sqlite_master where type = 'table' and name = 'legacy_sentinel'"
      ).pluck().get(), beforeSql);
      assert.deepEqual(after.prepare(
        "select id, label, payload from legacy_sentinel"
      ).get(), beforeRow);
    } finally {
      after.close();
    }
  });
});

test("repeated apply is a no-op and accepts unrelated future migration rows", () => {
  withTempDirectory("coin-wallet-migration-repeat-", (directory) => {
    const dbPath = join(directory, "repeat.sqlite");
    createSyntheticDatabase(dbPath);
    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => new Date(APPLIED_AT)
    });
    const database = new Database(dbPath);
    try {
      database.prepare(`
        insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run("20990101_001_future", "f".repeat(64), "2099-01-01T00:00:00.000Z");
      const result = applyCoinWalletMigrations({
        database,
        expectedMigrationId: MIGRATION_ID,
        expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
        nowFn: () => {
          throw new Error("must not be called for a no-op");
        }
      });
      assert.deepEqual(result.appliedMigrationIds, []);
      assert.equal(result.counts.migrationRows, 2);
      assert.equal(database.prepare(
        "select applied_at from platform_schema_migrations where migration_id = ?"
      ).pluck().get(MIGRATION_ID), APPLIED_AT);
    } finally {
      database.close();
    }
  });
});

test("apply confirmation mismatch fails closed before schema mutation", () => {
  withTempDirectory("coin-wallet-migration-confirmation-", (directory) => {
    const dbPath = join(directory, "confirm.sqlite");
    createSyntheticDatabase(dbPath);
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: "wrong-migration",
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    }), "migration_id_mismatch");
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: OLD_DDL_CHECKSUM
    }), "migration_checksum_mismatch");
    const database = new Database(dbPath, { readonly: true });
    try {
      assert.deepEqual(listOwnedObjects(database), []);
    } finally {
      database.close();
    }
  });
});

test("incompatible same-name migration ledger and domain table fail closed", () => {
  withTempDirectory("coin-wallet-migration-collision-", (directory) => {
    const ledgerPath = join(directory, "ledger.sqlite");
    createSyntheticDatabase(ledgerPath);
    let database = new Database(ledgerPath);
    try {
      database.exec("create table platform_schema_migrations (migration_id text primary key)");
    } finally {
      database.close();
    }
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath: ledgerPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    }), "migration_ledger_incompatible");

    const domainPath = join(directory, "domain.sqlite");
    createSyntheticDatabase(domainPath);
    database = new Database(domainPath);
    try {
      database.exec("create table platform_coin_wallets (wallet_ref text primary key)");
    } finally {
      database.close();
    }
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath: domainPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    }), "owned_object_without_migration");
    database = new Database(domainPath, { readonly: true });
    try {
      assert.equal(database.prepare(
        "select count(*) from sqlite_master where name = 'platform_schema_migrations'"
      ).pluck().get(), 0);
    } finally {
      database.close();
    }
  });
});

test("a missing PR1 row independently rejects an orphan PR1 domain table", () => {
  withTempDirectory("coin-wallet-migration-orphan-table-", (directory) => {
    const dbPath = join(directory, "orphan-table.sqlite");
    createSyntheticDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create table platform_coin_wallets (
          wallet_ref text primary key,
          account_id text not null unique references platform_accounts(id),
          status text not null check (status in ('active', 'frozen', 'closed')),
          version integer not null default 0 check (typeof(version) = 'integer' and version >= 0),
          created_at text not null,
          updated_at text not null
        )
      `);
    } finally {
      database.close();
    }
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    }), "owned_object_without_migration");
  });
});

test("a missing PR1 row independently rejects an orphan named PR1 index", () => {
  withTempDirectory("coin-wallet-migration-orphan-index-", (directory) => {
    const dbPath = join(directory, "orphan-index.sqlite");
    createSyntheticDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create table orphan_index_host (account_id text not null);
        create index platform_coin_wallets_account_id_idx
          on orphan_index_host(account_id);
      `);
    } finally {
      database.close();
    }
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    }), "owned_object_without_migration");
  });
});

test("a missing PR1 row independently rejects an orphan named PR1 trigger", () => {
  withTempDirectory("coin-wallet-migration-orphan-trigger-", (directory) => {
    const dbPath = join(directory, "orphan-trigger.sqlite");
    createSyntheticDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create table orphan_trigger_host (entry_ref text primary key);
        create trigger platform_coin_ledger_entries_immutable_update
        before update on orphan_trigger_host
        begin
          select raise(abort, 'coin_ledger_immutable');
        end;
      `);
    } finally {
      database.close();
    }
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    }), "owned_object_without_migration");
  });
});

test("a missing PR1 row independently rejects each orphan deadline trigger", () => {
  withTempDirectory("coin-wallet-migration-orphan-deadline-trigger-", (directory) => {
    for (const [name, message] of [
      [
        "platform_coin_holds_expires_at_immutable_update",
        "coin_hold_expires_at_immutable"
      ],
      [
        "platform_coin_lots_expires_at_immutable_update",
        "coin_lot_expires_at_immutable"
      ]
    ]) {
      const dbPath = join(directory, `${name}.sqlite`);
      createSyntheticDatabase(dbPath);
      const database = new Database(dbPath);
      try {
        database.exec(`
          create table orphan_deadline_host (expires_at text);
          create trigger ${name}
          before update of expires_at on orphan_deadline_host
          when new.expires_at is not old.expires_at
          begin
            select raise(abort, '${message}');
          end;
        `);
      } finally {
        database.close();
      }
      expectMigrationError(() => applyCoinWalletMigrations({
        dbPath,
        expectedMigrationId: MIGRATION_ID,
        expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
      }), "owned_object_without_migration");
    }
  });
});

test("a fault before ledger insertion rolls back the ledger and every domain object", () => {
  withTempDirectory("coin-wallet-migration-rollback-", (directory) => {
    const dbPath = join(directory, "rollback.sqlite");
    createSyntheticDatabase(dbPath);
    expectMigrationError(() => applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
      nowFn: () => {
        const error = new Error("synthetic fault");
        error.code = "synthetic_fault";
        throw error;
      }
    }), "migration_apply_failed");
    const database = new Database(dbPath, { readonly: true });
    try {
      assert.deepEqual(listOwnedObjects(database), []);
      assert.deepEqual(database.pragma("quick_check"), [{ quick_check: "ok" }]);
    } finally {
      database.close();
    }
  });
});

test("exact schema exposes required columns, foreign keys, indexes, checks, and immutable triggers", () => {
  withTempDirectory("coin-wallet-migration-exact-", (directory) => {
    const dbPath = join(directory, "exact.sqlite");
    createSyntheticDatabase(dbPath);
    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    });
    const database = new Database(dbPath, { readonly: true });

    try {
      assert.deepEqual(database.pragma("table_info(platform_coin_wallets)").map(({ name }) => name), [
        "wallet_ref", "account_id", "status", "version", "created_at", "updated_at"
      ]);
      assert.deepEqual(database.pragma("table_info(platform_coin_lots)").map(({ name }) => name), [
        "lot_ref", "wallet_ref", "coin_type", "credit_origin_ref", "issued_units",
        "pending_units", "available_units", "held_units", "consumed_units",
        "reversed_units", "expired_units", "source_type", "source_ref",
        "policy_ref", "policy_version", "expires_at", "created_at", "updated_at"
      ]);
      assert.deepEqual(database.pragma("table_info(platform_coin_operation_receipts)").map(({ name }) => name), [
        "operation_ref", "wallet_ref", "actor_scope", "operation_type",
        "idempotency_key", "request_digest", "status", "previous_wallet_version",
        "resulting_wallet_version", "resulting_wallet_status", "result_ref",
        "safe_result_code", "created_at", "completed_at"
      ]);
      assert.deepEqual(database.pragma("table_info(platform_coin_ledger_entries)").map(({ name }) => name), [
        "entry_ref", "operation_ref", "wallet_ref", "lot_ref", "operation",
        "amount_units", "hold_ref", "order_ref", "source_type", "source_ref",
        "actor_type", "actor_ref", "previous_wallet_version",
        "resulting_wallet_version", "resulting_wallet_status", "occurred_at"
      ]);
      assert.equal(database.pragma("foreign_key_list(platform_coin_wallets)").some(
        ({ table, from, to }) => table === "platform_accounts" && from === "account_id" && to === "id"
      ), true);
      const allocationUniqueIndex = database
        .pragma("index_list(platform_coin_hold_allocations)")
        .filter(({ unique }) => unique === 1)
        .map((index) => ({
          name: index.name,
          columns: database.pragma(`index_info(${index.name})`).map(({ name }) => name)
        }))
        .find(({ columns }) => (
          JSON.stringify(columns) === JSON.stringify(["hold_ref", "lot_ref"])
        ));
      assert.deepEqual(allocationUniqueIndex?.columns, ["hold_ref", "lot_ref"]);
      assert.equal(uniqueColumnSets(database, "platform_coin_hold_allocations").some(
        (columns) => JSON.stringify(columns) === JSON.stringify(["hold_ref", "allocation_sequence"])
      ), true);
      for (const indexName of OWNED_INDEXES) {
        assert.ok(database.pragma(`index_info(${indexName})`).length > 0);
      }
      const lotSql = database.prepare(
        "select sql from sqlite_master where type = 'table' and name = 'platform_coin_lots'"
      ).pluck().get();
      assert.match(lotSql, /typeof\s*\(\s*issued_units\s*\)\s*=\s*'integer'/i);
      assert.match(lotSql, /pending_units\s*\+\s*available_units\s*\+\s*held_units\s*\+\s*consumed_units\s*\+\s*reversed_units\s*\+\s*expired_units\s*=\s*issued_units/i);
      assert.match(lotSql, /coin_type\s*=\s*'bonus_coins'\s+or\s+expires_at\s+is\s+null/i);
      const triggerSql = database.prepare(
        "select sql from sqlite_master where type = 'trigger' and name = ?"
      ).pluck();
      assert.match(triggerSql.get(OWNED_TRIGGERS[0]), /before update[\s\S]+raise\s*\(\s*abort/i);
      assert.match(triggerSql.get(OWNED_TRIGGERS[1]), /before delete[\s\S]+raise\s*\(\s*abort/i);
      for (const [name, table, message] of [
        [
          "platform_coin_holds_expires_at_immutable_update",
          "platform_coin_holds",
          "coin_hold_expires_at_immutable"
        ],
        [
          "platform_coin_lots_expires_at_immutable_update",
          "platform_coin_lots",
          "coin_lot_expires_at_immutable"
        ]
      ]) {
        const sql = triggerSql.get(name);
        assert.match(sql, new RegExp(`create trigger ${name}`, "i"));
        assert.match(
          sql,
          new RegExp(`before update of expires_at on ${table}`, "i")
        );
        assert.match(sql, /when new\.expires_at is not old\.expires_at/i);
        assert.match(
          sql,
          new RegExp(`raise\\s*\\(\\s*abort\\s*,\\s*'${message}'\\s*\\)`, "i")
        );
        assert.doesNotMatch(sql, /<>/);
      }
    } finally {
      database.close();
    }
  });
});

test("hold deadline is null-safe immutable while same-value lifecycle updates remain legal", () => {
  withTempDirectory("coin-wallet-hold-deadline-immutable-", (directory) => {
    const dbPath = join(directory, "hold.sqlite");
    const database = createLotPolicyFixture(dbPath);
    const deadline = "2026-07-24T12:34:56.000Z";
    const later = "2026-07-25T12:34:56.000Z";
    try {
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "hold_deadline",
        "wallet_policy",
        "product_purchase",
        "order_deadline",
        1,
        "active",
        deadline,
        APPLIED_AT,
        APPLIED_AT
      );
      const expiresColumn = database.pragma("table_info(platform_coin_holds)")
        .find(({ name }) => name === "expires_at");
      assert.equal(expiresColumn?.notnull, 1);
      for (const nextDeadline of [later, null]) {
        assertTriggerRejectsAndPreserves(database, {
          table: "platform_coin_holds",
          keyColumn: "hold_ref",
          key: "hold_deadline",
          updateSql: `
            update platform_coin_holds
               set expires_at = ?, status = 'released', updated_at = ?
             where hold_ref = ?
          `,
          params: [nextDeadline, later, "hold_deadline"],
          abortMessage: "coin_hold_expires_at_immutable"
        });
      }
      assert.equal(database.prepare(`
        update platform_coin_holds
           set expires_at = ?
         where hold_ref = ?
      `).run(deadline, "hold_deadline").changes, 1);
      assert.equal(database.prepare(`
        update platform_coin_holds
           set expires_at = ?, status = 'released', updated_at = ?
         where hold_ref = ?
      `).run(deadline, later, "hold_deadline").changes, 1);
      assert.deepEqual(database.prepare(`
        select expires_at, status, updated_at
          from platform_coin_holds
         where hold_ref = ?
      `).get("hold_deadline"), {
        expires_at: deadline,
        status: "released",
        updated_at: later
      });
    } finally {
      database.close();
    }
  });
});

test("lot deadline is null-safe immutable while same-value bucket updates remain legal", () => {
  withTempDirectory("coin-wallet-lot-deadline-immutable-", (directory) => {
    const dbPath = join(directory, "lot.sqlite");
    const database = createLotPolicyFixture(dbPath);
    const deadline = "2026-07-24T12:34:56.000Z";
    const later = "2026-07-25T12:34:56.000Z";
    try {
      insertPolicyLot(database, {
        suffix: "bonus_finite",
        coinType: "bonus_coins",
        policyRef: null,
        policyVersion: null,
        expiresAt: deadline
      });
      insertPolicyLot(database, {
        suffix: "bonus_null",
        coinType: "bonus_coins",
        policyRef: null,
        policyVersion: null
      });
      insertPolicyLot(database, {
        suffix: "paid_null",
        coinType: "paid_coins",
        policyRef: null,
        policyVersion: null
      });
      insertPolicyLot(database, {
        suffix: "reward_null",
        coinType: "reward_coins",
        policyRef: "policy_reward",
        policyVersion: 1
      });

      for (const nextDeadline of [later, null]) {
        assertTriggerRejectsAndPreserves(database, {
          table: "platform_coin_lots",
          keyColumn: "lot_ref",
          key: "lot_bonus_finite",
          updateSql: `
            update platform_coin_lots
               set expires_at = ?, available_units = 0, expired_units = 1,
                   updated_at = ?
             where lot_ref = ?
          `,
          params: [nextDeadline, later, "lot_bonus_finite"],
          abortMessage: "coin_lot_expires_at_immutable"
        });
      }
      assertTriggerRejectsAndPreserves(database, {
        table: "platform_coin_lots",
        keyColumn: "lot_ref",
        key: "lot_bonus_null",
        updateSql: `
          update platform_coin_lots
             set expires_at = ?, updated_at = ?
           where lot_ref = ?
        `,
        params: [deadline, later, "lot_bonus_null"],
        abortMessage: "coin_lot_expires_at_immutable"
      });

      assert.equal(database.prepare(`
        update platform_coin_lots
           set expires_at = ?
         where lot_ref = ?
      `).run(deadline, "lot_bonus_finite").changes, 1);
      assert.equal(database.prepare(`
        update platform_coin_lots
           set expires_at = ?, available_units = 0, expired_units = 1,
               updated_at = ?
         where lot_ref = ?
      `).run(deadline, later, "lot_bonus_finite").changes, 1);
      assert.deepEqual(database.prepare(`
        select expires_at, available_units, expired_units, updated_at
          from platform_coin_lots
         where lot_ref = ?
      `).get("lot_bonus_finite"), {
        expires_at: deadline,
        available_units: 0,
        expired_units: 1,
        updated_at: later
      });
      for (const lotRef of [
        "lot_bonus_null", "lot_paid_null", "lot_reward_null"
      ]) {
        assert.equal(database.prepare(`
          update platform_coin_lots
             set expires_at = null, updated_at = ?
           where lot_ref = ?
        `).run(later, lotRef).changes, 1);
        assert.equal(database.prepare(
          "select expires_at from platform_coin_lots where lot_ref = ?"
        ).pluck().get(lotRef), null);
      }
    } finally {
      database.close();
    }
  });
});

test("validate rejects changed deadline trigger table, WHEN, message, or SQL", () => {
  withTempDirectory("coin-wallet-deadline-trigger-tamper-", (directory) => {
    const variants = [
      [
        "table",
        "platform_coin_holds_expires_at_immutable_update",
        `create trigger platform_coin_holds_expires_at_immutable_update
         before update of expires_at on platform_coin_lots
         when new.expires_at is not old.expires_at
         begin select raise(abort, 'coin_hold_expires_at_immutable'); end`
      ],
      [
        "when",
        "platform_coin_holds_expires_at_immutable_update",
        `create trigger platform_coin_holds_expires_at_immutable_update
         before update of expires_at on platform_coin_holds
         when new.expires_at <> old.expires_at
         begin select raise(abort, 'coin_hold_expires_at_immutable'); end`
      ],
      [
        "message",
        "platform_coin_holds_expires_at_immutable_update",
        `create trigger platform_coin_holds_expires_at_immutable_update
         before update of expires_at on platform_coin_holds
         when new.expires_at is not old.expires_at
         begin select raise(abort, 'changed_message'); end`
      ],
      [
        "hold_message_case",
        "platform_coin_holds_expires_at_immutable_update",
        `create trigger platform_coin_holds_expires_at_immutable_update
         before update of expires_at on platform_coin_holds
         when new.expires_at is not old.expires_at
         begin select raise(abort, 'COIN_HOLD_EXPIRES_AT_IMMUTABLE'); end`
      ],
      [
        "lot_message_case",
        "platform_coin_lots_expires_at_immutable_update",
        `create trigger platform_coin_lots_expires_at_immutable_update
         before update of expires_at on platform_coin_lots
         when new.expires_at is not old.expires_at
         begin select raise(abort, 'COIN_LOT_EXPIRES_AT_IMMUTABLE'); end`
      ],
      [
        "sql",
        "platform_coin_lots_expires_at_immutable_update",
        `create trigger platform_coin_lots_expires_at_immutable_update
         after update of expires_at on platform_coin_lots
         when new.expires_at is not old.expires_at
         begin select raise(abort, 'coin_lot_expires_at_immutable'); end`
      ]
    ];
    for (const [variant, triggerName, createSql] of variants) {
      const dbPath = join(directory, `${variant}.sqlite`);
      createSyntheticDatabase(dbPath);
      applyCoinWalletMigrations({
        dbPath,
        expectedMigrationId: MIGRATION_ID,
        expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
      });
      const database = new Database(dbPath);
      try {
        assert.ok(database.prepare(`
          select 1 from sqlite_master
           where type = 'trigger' and name = ?
        `).get(triggerName), variant);
        database.exec(`drop trigger ${triggerName}`);
        database.exec(createSql);
      } finally {
        database.close();
      }
      const result = validateCoinWalletSchema({ dbPath });
      assert.equal(result.ok, false, variant);
      assert.ok(
        result.reasonCodes.includes("owned_object_incompatible"),
        variant
      );
    }
  });
});

test("validate accepts deadline trigger keyword case and whitespace formatting drift", () => {
  withTempDirectory("coin-wallet-deadline-trigger-format-", (directory) => {
    for (const [suffix, triggerName, table, message] of [
      [
        "hold",
        "platform_coin_holds_expires_at_immutable_update",
        "platform_coin_holds",
        "coin_hold_expires_at_immutable"
      ],
      [
        "lot",
        "platform_coin_lots_expires_at_immutable_update",
        "platform_coin_lots",
        "coin_lot_expires_at_immutable"
      ]
    ]) {
      const dbPath = join(directory, `${suffix}.sqlite`);
      createSyntheticDatabase(dbPath);
      applyCoinWalletMigrations({
        dbPath,
        expectedMigrationId: MIGRATION_ID,
        expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
      });
      const database = new Database(dbPath);
      try {
        database.exec(`drop trigger ${triggerName}`);
        database.exec(`
          CREATE   TRIGGER ${triggerName}
          BEFORE UPDATE OF expires_at ON ${table}
          WHEN new.expires_at IS NOT old.expires_at
          BEGIN
            SELECT RAISE ( ABORT , '${message}' ) ;
          END
        `);
      } finally {
        database.close();
      }
      assert.equal(validateCoinWalletSchema({ dbPath }).ok, true, suffix);
    }
  });
});

test("a started operation receipt may be claimed before a wallet exists", () => {
  withTempDirectory("coin-wallet-migration-receipt-started-", (directory) => {
    const dbPath = join(directory, "receipt-started.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      assert.doesNotThrow(() => insertReceipt(database, {
        suffix: "started_null",
        status: "started",
        walletRef: null
      }));
      assert.deepEqual(database.prepare(`
        select wallet_ref, status
          from platform_coin_operation_receipts
         where operation_ref = ?
      `).get("receipt_started_null"), {
        wallet_ref: null,
        status: "started"
      });
      const walletForeignKey = database
        .pragma("foreign_key_list(platform_coin_operation_receipts)")
        .find(({ from }) => from === "wallet_ref");
      assert.equal(walletForeignKey?.table, "platform_coin_wallets");
      assert.equal(walletForeignKey?.to, "wallet_ref");
      assert.equal(walletForeignKey?.on_delete, "NO ACTION");
    } finally {
      database.close();
    }
  });
});

test("terminal operation receipts reject a NULL wallet", () => {
  withTempDirectory("coin-wallet-migration-receipt-terminal-null-", (directory) => {
    const dbPath = join(directory, "receipt-terminal-null.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      for (const status of ["succeeded", "failed"]) {
        assert.throws(
          () => insertReceipt(database, {
            suffix: `terminal_null_${status}`,
            status,
            walletRef: null
          }),
          (error) => error?.code?.startsWith("SQLITE_CONSTRAINT"),
          status
        );
      }
    } finally {
      database.close();
    }
  });
});

test("a started receipt attaches a valid wallet before becoming terminal", () => {
  withTempDirectory("coin-wallet-migration-receipt-attach-", (directory) => {
    const dbPath = join(directory, "receipt-attach.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      insertReceipt(database, {
        suffix: "attach",
        status: "started",
        walletRef: null
      });
      assert.throws(
        () => database.prepare(`
          update platform_coin_operation_receipts
             set status = 'succeeded',
                 completed_at = ?
           where operation_ref = ?
        `).run(APPLIED_AT, "receipt_attach"),
        (error) => error?.code?.startsWith("SQLITE_CONSTRAINT")
      );
      assert.doesNotThrow(() => database.prepare(`
        update platform_coin_operation_receipts
           set wallet_ref = ?,
               status = 'succeeded',
               previous_wallet_version = ?,
               resulting_wallet_version = ?,
               resulting_wallet_status = ?,
               result_ref = ?,
               safe_result_code = ?,
               completed_at = ?
         where operation_ref = ?
      `).run(
        "wallet_policy",
        0,
        1,
        "active",
        "result_attach",
        "succeeded",
        APPLIED_AT,
        "receipt_attach"
      ));
      assert.deepEqual(database.prepare(`
        select wallet_ref, status
          from platform_coin_operation_receipts
         where operation_ref = ?
      `).get("receipt_attach"), {
        wallet_ref: "wallet_policy",
        status: "succeeded"
      });
    } finally {
      database.close();
    }
  });
});

test("operation receipts accept closed started, succeeded, and failed replay shapes", () => {
  withTempDirectory("coin-wallet-migration-receipt-valid-shapes-", (directory) => {
    const dbPath = join(directory, "receipt-valid-shapes.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      assert.doesNotThrow(() => insertReceipt(database, {
        suffix: "started_existing_wallet",
        status: "started",
        walletRef: "wallet_policy"
      }));
      assert.doesNotThrow(() => insertReceipt(database, {
        suffix: "succeeded_mutation",
        status: "succeeded",
        walletRef: "wallet_policy",
        previousWalletVersion: 0,
        resultingWalletVersion: 1,
        resultingWalletStatus: "active"
      }));
      assert.doesNotThrow(() => insertReceipt(database, {
        suffix: "succeeded_noop",
        status: "succeeded",
        walletRef: "wallet_policy",
        previousWalletVersion: 1,
        resultingWalletVersion: 1,
        resultingWalletStatus: "frozen"
      }));
      assert.doesNotThrow(() => insertReceipt(database, {
        suffix: "failed_equal",
        status: "failed",
        walletRef: "wallet_policy",
        previousWalletVersion: 2,
        resultingWalletVersion: 2,
        resultingWalletStatus: "closed",
        resultRef: null
      }));
    } finally {
      database.close();
    }
  });
});

test("started operation receipts reject terminal result, version, status, or completion fields", () => {
  withTempDirectory("coin-wallet-migration-receipt-started-invalid-", (directory) => {
    const dbPath = join(directory, "receipt-started-invalid.sqlite");
    const database = createLotPolicyFixture(dbPath);
    const variants = [
      ["result_ref", { resultRef: "result" }],
      ["safe_result", { safeResultCode: "started" }],
      ["completed", { completedAt: APPLIED_AT }],
      ["previous_version", { previousWalletVersion: 0 }],
      ["resulting_version", { resultingWalletVersion: 0 }],
      ["resulting_status", { resultingWalletStatus: "active" }]
    ];
    try {
      for (const [suffix, overrides] of variants) {
        assert.throws(
          () => insertReceipt(database, {
            suffix,
            status: "started",
            walletRef: null,
            ...overrides
          }),
          (error) => error?.code?.startsWith("SQLITE_CONSTRAINT"),
          suffix
        );
      }
    } finally {
      database.close();
    }
  });
});

test("succeeded operation receipts reject incomplete, invalid-version, and invalid-status shapes", () => {
  withTempDirectory("coin-wallet-migration-receipt-succeeded-invalid-", (directory) => {
    const dbPath = join(directory, "receipt-succeeded-invalid.sqlite");
    const database = createLotPolicyFixture(dbPath);
    const variants = [
      ["result_ref", { resultRef: null }],
      ["safe_result", { safeResultCode: null }],
      ["completed", { completedAt: null }],
      ["previous_version", { previousWalletVersion: null }],
      ["resulting_version", { resultingWalletVersion: null }],
      ["resulting_status", { resultingWalletStatus: null }],
      ["version_regression", { previousWalletVersion: 2, resultingWalletVersion: 1 }],
      ["negative_version", { previousWalletVersion: -1, resultingWalletVersion: 0 }],
      ["fractional_version", { previousWalletVersion: 0, resultingWalletVersion: 1.5 }],
      ["invalid_status", { resultingWalletStatus: "archived" }]
    ];
    try {
      for (const [suffix, overrides] of variants) {
        assert.throws(
          () => insertReceipt(database, {
            suffix,
            status: "succeeded",
            walletRef: "wallet_policy",
            ...overrides
          }),
          (error) => error?.code?.startsWith("SQLITE_CONSTRAINT"),
          suffix
        );
      }
    } finally {
      database.close();
    }
  });
});

test("failed operation receipts require equal valid versions, status, safe code, and completion", () => {
  withTempDirectory("coin-wallet-migration-receipt-failed-invalid-", (directory) => {
    const dbPath = join(directory, "receipt-failed-invalid.sqlite");
    const database = createLotPolicyFixture(dbPath);
    const variants = [
      ["safe_result", { safeResultCode: null }],
      ["completed", { completedAt: null }],
      ["previous_version", { previousWalletVersion: null }],
      ["resulting_version", { resultingWalletVersion: null }],
      ["resulting_status", { resultingWalletStatus: null }],
      ["version_change", { previousWalletVersion: 1, resultingWalletVersion: 2 }],
      ["negative_version", { previousWalletVersion: -1, resultingWalletVersion: -1 }],
      ["fractional_version", { previousWalletVersion: 1.5, resultingWalletVersion: 1.5 }],
      ["invalid_status", { resultingWalletStatus: "archived" }]
    ];
    try {
      for (const [suffix, overrides] of variants) {
        assert.throws(
          () => insertReceipt(database, {
            suffix,
            status: "failed",
            walletRef: "wallet_policy",
            resultRef: null,
            ...overrides
          }),
          (error) => error?.code?.startsWith("SQLITE_CONSTRAINT"),
          suffix
        );
      }
    } finally {
      database.close();
    }
  });
});

test("terminal receipts reject legal updates and every receipt rejects deletion", () => {
  withTempDirectory("coin-wallet-migration-receipt-immutable-", (directory) => {
    const dbPath = join(directory, "receipt-immutable.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      insertReceipt(database, {
        suffix: "terminal_update",
        status: "succeeded",
        walletRef: "wallet_policy",
        previousWalletVersion: 0,
        resultingWalletVersion: 1,
        resultingWalletStatus: "active"
      });
      assert.throws(
        () => database.prepare(`
          update platform_coin_operation_receipts
             set safe_result_code = 'credited_replay'
           where operation_ref = ?
        `).run("receipt_terminal_update"),
        (error) => error?.code === "SQLITE_CONSTRAINT_TRIGGER"
      );
      assert.equal(database.prepare(`
        select safe_result_code
          from platform_coin_operation_receipts
         where operation_ref = ?
      `).pluck().get("receipt_terminal_update"), "succeeded");

      insertReceipt(database, {
        suffix: "started_delete",
        status: "started",
        walletRef: null
      });
      for (const operationRef of ["receipt_terminal_update", "receipt_started_delete"]) {
        assert.throws(
          () => database.prepare(`
            delete from platform_coin_operation_receipts where operation_ref = ?
          `).run(operationRef),
          (error) => error?.code === "SQLITE_CONSTRAINT_TRIGGER",
          operationRef
        );
        assert.equal(database.prepare(`
          select count(*) from platform_coin_operation_receipts where operation_ref = ?
        `).pluck().get(operationRef), 1);
      }
    } finally {
      database.close();
    }
  });
});

test("ledger entries persist an exact resulting wallet status and reject invalid status", () => {
  withTempDirectory("coin-wallet-migration-ledger-wallet-status-", (directory) => {
    const dbPath = join(directory, "ledger-wallet-status.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      insertPolicyLot(database, {
        suffix: "ledger_source",
        coinType: "paid_coins",
        policyRef: null,
        policyVersion: null
      });
      for (const resultingWalletStatus of ["active", "frozen", "closed"]) {
        assert.doesNotThrow(() => insertLedgerEntry(database, {
          suffix: resultingWalletStatus,
          resultingWalletStatus
        }), resultingWalletStatus);
      }
      assert.throws(
        () => insertLedgerEntry(database, {
          suffix: "invalid",
          resultingWalletStatus: "archived"
        }),
        (error) => error?.code?.startsWith("SQLITE_CONSTRAINT")
      );
    } finally {
      database.close();
    }
  });
});

test("hold allocations enforce both deterministic unique keys and immutable facts", () => {
  withTempDirectory("coin-wallet-migration-allocation-immutable-", (directory) => {
    const dbPath = join(directory, "allocation-immutable.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      insertHoldAllocationFixture(database);
      assert.throws(
        () => database.prepare(`
          insert into platform_coin_hold_allocations (
            allocation_ref, hold_ref, lot_ref, allocation_sequence,
            allocated_units, created_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run(
          "allocation_duplicate_sequence",
          "hold_allocation",
          "lot_allocation_second",
          1,
          1,
          APPLIED_AT
        ),
        (error) => error?.code?.startsWith("SQLITE_CONSTRAINT")
      );
      assert.throws(
        () => database.prepare(`
          insert into platform_coin_hold_allocations (
            allocation_ref, hold_ref, lot_ref, allocation_sequence,
            allocated_units, created_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run(
          "allocation_duplicate_lot",
          "hold_allocation",
          "lot_allocation_first",
          2,
          1,
          APPLIED_AT
        ),
        (error) => error?.code?.startsWith("SQLITE_CONSTRAINT")
      );
      assert.throws(
        () => database.prepare(`
          update platform_coin_hold_allocations
             set allocated_units = 2
           where allocation_ref = ?
        `).run("allocation_first"),
        (error) => error?.code === "SQLITE_CONSTRAINT_TRIGGER"
      );
      assert.throws(
        () => database.prepare(`
          delete from platform_coin_hold_allocations where allocation_ref = ?
        `).run("allocation_first"),
        (error) => error?.code === "SQLITE_CONSTRAINT_TRIGGER"
      );
      assert.deepEqual(database.prepare(`
        select allocation_sequence, allocated_units
          from platform_coin_hold_allocations
         where allocation_ref = ?
      `).get("allocation_first"), {
        allocation_sequence: 1,
        allocated_units: 1
      });
    } finally {
      database.close();
    }
  });
});

test("immutable ledger trigger rejects a valid resulting wallet status update", () => {
  withTempDirectory("coin-wallet-migration-ledger-status-immutable-", (directory) => {
    const dbPath = join(directory, "ledger-status-immutable.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      insertPolicyLot(database, {
        suffix: "ledger_source",
        coinType: "paid_coins",
        policyRef: null,
        policyVersion: null
      });
      insertLedgerEntry(database, {
        suffix: "status_immutable",
        resultingWalletStatus: "active"
      });

      assert.throws(
        () => database.prepare(`
          update platform_coin_ledger_entries
             set resulting_wallet_status = 'frozen'
           where entry_ref = ?
        `).run("entry_status_immutable"),
        (error) => error?.code === "SQLITE_CONSTRAINT_TRIGGER"
      );
      assert.equal(database.prepare(`
        select resulting_wallet_status
          from platform_coin_ledger_entries
         where entry_ref = ?
      `).pluck().get("entry_status_immutable"), "active");
    } finally {
      database.close();
    }
  });
});

test("paid and bonus lots accept a NULL policy pair", () => {
  withTempDirectory("coin-wallet-migration-policy-null-", (directory) => {
    const dbPath = join(directory, "policy-null.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      for (const coinType of ["paid_coins", "bonus_coins"]) {
        assert.doesNotThrow(() => insertPolicyLot(database, {
          suffix: coinType,
          coinType,
          policyRef: null,
          policyVersion: null
        }), coinType);
      }
    } finally {
      database.close();
    }
  });
});

test("reward lots accept a present policy ref and positive integer version", () => {
  withTempDirectory("coin-wallet-migration-policy-reward-", (directory) => {
    const dbPath = join(directory, "policy-reward.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      assert.doesNotThrow(() => insertPolicyLot(database, {
        suffix: "reward_valid",
        coinType: "reward_coins",
        policyRef: "reward-policy-v1",
        policyVersion: 1
      }));
    } finally {
      database.close();
    }
  });
});

test("reward lots reject a NULL or mixed policy pair", () => {
  withTempDirectory("coin-wallet-migration-policy-reward-invalid-", (directory) => {
    const dbPath = join(directory, "policy-reward-invalid.sqlite");
    const database = createLotPolicyFixture(dbPath);
    const variants = [
      ["both_null", null, null],
      ["ref_only", "reward-policy-v1", null],
      ["version_only", null, 1],
      ["zero_version", "reward-policy-v1", 0],
      ["fractional_version", "reward-policy-v1", 1.5]
    ];
    try {
      for (const [suffix, policyRef, policyVersion] of variants) {
        assert.throws(
          () => insertPolicyLot(database, {
            suffix,
            coinType: "reward_coins",
            policyRef,
            policyVersion
          }),
          (error) => error?.code?.startsWith("SQLITE_CONSTRAINT"),
          suffix
        );
      }
    } finally {
      database.close();
    }
  });
});

test("paid and bonus lots reject either or both policy fields being non-NULL", () => {
  withTempDirectory("coin-wallet-migration-policy-nonreward-invalid-", (directory) => {
    const dbPath = join(directory, "policy-nonreward-invalid.sqlite");
    const database = createLotPolicyFixture(dbPath);
    try {
      for (const coinType of ["paid_coins", "bonus_coins"]) {
        const variants = [
          [`${coinType}_ref_only`, "nonreward-policy", null],
          [`${coinType}_version_only`, null, 1],
          [`${coinType}_both`, "nonreward-policy", 1]
        ];
        for (const [suffix, policyRef, policyVersion] of variants) {
          assert.throws(
            () => insertPolicyLot(database, {
              suffix,
              coinType,
              policyRef,
              policyVersion
            }),
            (error) => error?.code?.startsWith("SQLITE_CONSTRAINT"),
            suffix
          );
        }
      }
    } finally {
      database.close();
    }
  });
});

test("validate owns a readonly connection, performs no write, and returns closed counts and checks", () => {
  withTempDirectory("coin-wallet-migration-validate-", (directory) => {
    const dbPath = join(directory, "validate.sqlite");
    createSyntheticDatabase(dbPath, { sentinel: true });
    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    });
    const beforeHash = sha256File(dbPath);

    const result = validateCoinWalletSchema({ dbPath });

    assert.deepEqual(result, {
      ok: true,
      schemaState: "ready",
      requiredMigrationId: MIGRATION_ID,
      counts: {
        tables: OWNED_TABLES.length,
        indexes: OWNED_INDEXES.length,
        triggers: OWNED_TRIGGERS.length,
        migrationRows: 1,
        foreignKeyViolations: 0
      },
      checks: {
        schemaExact: true,
        quickCheck: true,
        foreignKeys: true
      },
      reasonCodes: []
    });
    assert.equal(sha256File(dbPath), beforeHash);
    assert.doesNotMatch(JSON.stringify(result), /sqlite|create table|synthetic\.sqlite/i);
  });
});

test("validate maps a missing owned database to a closed result without path leakage", () => {
  withTempDirectory("coin-wallet-migration-validate-missing-", (directory) => {
    const dbPath = join(directory, "missing-control.sqlite");
    const result = validateCoinWalletSchema({ dbPath });
    assertClosedValidationFailure(result, "database_missing", "missing-control");
  });
});

test("validate maps a corrupt owned database to a closed result and closes it", () => {
  withTempDirectory("coin-wallet-migration-validate-corrupt-", (directory) => {
    const dbPath = join(directory, "corrupt-control.sqlite");
    writeFileSync(dbPath, Buffer.from("synthetic corrupt database", "utf8"));
    const result = validateCoinWalletSchema({ dbPath });
    assertClosedValidationFailure(result, "database_invalid", "corrupt-control");
  });
});

test("inspection through an injected database is read-only and closed", () => {
  withTempDirectory("coin-wallet-migration-inspect-", (directory) => {
    const dbPath = join(directory, "inspect.sqlite");
    createSyntheticDatabase(dbPath);
    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    });
    const database = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const beforeTotalChanges = database.totalChanges;
      const result = inspectCoinWalletSchema({ database });
      assert.equal(result.ok, true);
      assert.equal(result.counts.tables, OWNED_TABLES.length);
      assert.equal(database.totalChanges, beforeTotalChanges);
    } finally {
      database.close();
    }
  });
});

test("validate rejects missing or altered exact schema components and checksum drift", () => {
  withTempDirectory("coin-wallet-migration-invalid-", (directory) => {
    const variants = [
      ["missing_index", (database) => database.exec(`drop index ${OWNED_INDEXES[0]}`), "owned_object_missing"],
      ["missing_trigger", (database) => database.exec(`drop trigger ${OWNED_TRIGGERS[0]}`), "owned_object_missing"],
      ["missing_hold_deadline_trigger", (database) => database.exec(
        "drop trigger platform_coin_holds_expires_at_immutable_update"
      ), "owned_object_missing"],
      ["missing_lot_deadline_trigger", (database) => database.exec(
        "drop trigger platform_coin_lots_expires_at_immutable_update"
      ), "owned_object_missing"],
      ["checksum_drift", (database) => database.prepare(
        "update platform_schema_migrations set ddl_checksum = ? where migration_id = ?"
      ).run("0".repeat(64), MIGRATION_ID), "migration_checksum_mismatch"]
    ];
    for (const [name, mutate, reasonCode] of variants) {
      const dbPath = join(directory, `${name}.sqlite`);
      createSyntheticDatabase(dbPath);
      applyCoinWalletMigrations({
        dbPath,
        expectedMigrationId: MIGRATION_ID,
        expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
      });
      const database = new Database(dbPath);
      try {
        assert.doesNotThrow(() => mutate(database), name);
      } finally {
        database.close();
      }
      const result = validateCoinWalletSchema({ dbPath });
      assert.equal(result.ok, false, name);
      assert.equal(result.schemaState, "blocked", name);
      assert.ok(result.reasonCodes.includes(reasonCode), name);
    }
  });
});

test("validate rejects a missing column, altered check, and incompatible foreign key", () => {
  withTempDirectory("coin-wallet-migration-sql-tamper-", (directory) => {
    const variants = [
      ["missing_column", `
        create table platform_coin_wallets (
          wallet_ref text primary key,
          account_id text not null unique references platform_accounts(id),
          status text not null,
          version integer not null,
          created_at text not null
        )
      `],
      ["altered_check", `
        create table platform_coin_wallets (
          wallet_ref text primary key,
          account_id text not null unique references platform_accounts(id),
          status text not null check (status in ('active', 'frozen', 'archived')),
          version integer not null,
          created_at text not null,
          updated_at text not null
        )
      `],
      ["foreign_key", `
        create table platform_coin_wallets (
          wallet_ref text primary key,
          account_id text not null unique references platform_accounts(owner_ref),
          status text not null check (status in ('active', 'frozen', 'closed')),
          version integer not null,
          created_at text not null,
          updated_at text not null
        )
      `]
    ];
    for (const [name, createSql] of variants) {
      const dbPath = join(directory, `${name}.sqlite`);
      createSyntheticDatabase(dbPath);
      const tampered = new Database(dbPath);
      try {
        tampered.exec(createSql);
        const result = validateCoinWalletSchema({ database: tampered });
        assert.equal(result.ok, false, name);
        assert.ok(result.reasonCodes.includes("owned_object_incompatible"), name);
      } finally {
        tampered.close();
      }
    }
  });
});

test("validate requires the PR1 row while accepting unrelated future rows", () => {
  withTempDirectory("coin-wallet-migration-required-row-", (directory) => {
    const dbPath = join(directory, "required.sqlite");
    createSyntheticDatabase(dbPath);
    applyCoinWalletMigrations({
      dbPath,
      expectedMigrationId: MIGRATION_ID,
      expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
    });
    let database = new Database(dbPath);
    try {
      database.prepare(`
        insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run("20990101_001_future", "f".repeat(64), "2099-01-01T00:00:00.000Z");
    } finally {
      database.close();
    }
    assert.equal(validateCoinWalletSchema({ dbPath }).ok, true);

    database = new Database(dbPath);
    try {
      database.prepare(
        "delete from platform_schema_migrations where migration_id = ?"
      ).run(MIGRATION_ID);
    } finally {
      database.close();
    }
    const missing = validateCoinWalletSchema({ dbPath });
    assert.equal(missing.ok, false);
    assert.ok(missing.reasonCodes.includes("required_migration_missing"));
    assert.equal(missing.counts.migrationRows, 1);
  });
});

test("dry-run backs up online, applies only the snapshot, reports IDs, and removes its snapshot", async () => {
  await withTempDirectoryAsync("coin-wallet-migration-dry-run-", async (directory) => {
    const dbPath = join(directory, "source.sqlite");
    const tempRoot = join(directory, "snapshots");
    const root = new Database(dbPath);
    try {
      root.exec(`
        create table platform_accounts (
          id text primary key,
          owner_ref text not null,
          status text not null,
          created_at text not null,
          updated_at text not null,
          metadata_json text not null default '{}'
        );
        create table legacy_sentinel (id integer primary key, value text not null);
        insert into legacy_sentinel (id, value) values (1, 'source-only');
      `);
    } finally {
      root.close();
    }
    const beforeHash = sha256File(dbPath);
    const beforeSchema = new Database(dbPath, { readonly: true });
    let beforeSql;
    let beforeRows;
    try {
      beforeSql = beforeSchema.prepare(
        "select type, name, sql from sqlite_master order by type, name"
      ).all();
      beforeRows = beforeSchema.prepare("select * from legacy_sentinel").all();
    } finally {
      beforeSchema.close();
    }

    const result = await dryRunCoinWalletMigrations({ dbPath, tempRoot });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.sourceChanged, false);
    assert.deepEqual(result.pendingMigrationIds, [MIGRATION_ID]);
    assert.deepEqual(result.appliedMigrationIds, [MIGRATION_ID]);
    assert.deepEqual(result.checks, {
      schemaExact: true,
      quickCheck: true,
      foreignKeys: true
    });
    assert.equal(sha256File(dbPath), beforeHash);
    const after = new Database(dbPath, { readonly: true });
    try {
      assert.deepEqual(after.prepare(
        "select type, name, sql from sqlite_master order by type, name"
      ).all(), beforeSql);
      assert.deepEqual(after.prepare("select * from legacy_sentinel").all(), beforeRows);
      assert.equal(after.prepare(
        "select count(*) from sqlite_master where name like 'platform_coin_%'"
      ).pluck().get(), 0);
    } finally {
      after.close();
    }
    assert.equal(existsSync(tempRoot), true);
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("dry-run opens a source without initializing it and cleans snapshots after failure", async () => {
  await withTempDirectoryAsync("coin-wallet-migration-dry-run-failure-", async (directory) => {
    const dbPath = join(directory, "source-without-dependency.sqlite");
    const tempRoot = join(directory, "snapshots");
    const database = new Database(dbPath);
    try {
      database.exec("create table legacy_sentinel (id integer primary key)");
    } finally {
      database.close();
    }
    const beforeHash = sha256File(dbPath);

    await assert.rejects(
      dryRunCoinWalletMigrations({ dbPath, tempRoot }),
      (error) => error?.code === "migration_dependency_missing"
    );

    assert.equal(sha256File(dbPath), beforeHash);
    const source = new Database(dbPath, { readonly: true });
    try {
      assert.deepEqual(listOwnedObjects(source), []);
    } finally {
      source.close();
    }
    assert.equal(existsSync(tempRoot), true);
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("dry-run removes its work directory when the source is missing or unreadable", async () => {
  await withTempDirectoryAsync("coin-wallet-migration-dry-run-open-failure-", async (directory) => {
    const fixtures = [
      ["missing", join(directory, "missing-source.sqlite")],
      ["unreadable", join(directory, "unreadable-source.sqlite")]
    ];
    mkdirSync(fixtures[1][1]);

    for (const [name, dbPath] of fixtures) {
      const tempRoot = join(directory, `${name}-snapshots`);
      await assert.rejects(dryRunCoinWalletMigrations({ dbPath, tempRoot }));
      assert.equal(existsSync(tempRoot), true, name);
      assert.deepEqual(readdirSync(tempRoot), [], name);
    }
  });
});
