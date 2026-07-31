import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";

import * as walletFoundation from "../services/platform/coin-wallet-migrations.mjs";
import {
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  applyCoinWalletReferenceIndexMigrations,
  COIN_WALLET_REFERENCE_INDEX_MIGRATIONS,
  REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
  inspectCoinWalletReferenceIndexSchema,
  validateCoinWalletReferenceIndexSchema
} from "../services/platform/coin-wallet-reference-index-migrations.mjs";

const FOUNDATION_CHECKSUM =
  "03422fd22ae8047aea8374ed0e34ebaaf8663c90c24d7bbefef11d66498b02e7";
const SUCCESSOR_CHECKSUM =
  "2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b";

const SUCCESSOR_INDEX_STATEMENTS = [
  `
    create index platform_coin_hold_allocations_lot_ref_idx
      on platform_coin_hold_allocations(lot_ref)
  `,
  `
    create index platform_coin_ledger_entries_lot_ref_idx
      on platform_coin_ledger_entries(lot_ref)
  `,
  `
    create index platform_coin_ledger_entries_hold_ref_idx
      on platform_coin_ledger_entries(hold_ref)
  `
];

const EXPECTED_TEST_INDEXES = Object.freeze({
  platform_coin_hold_allocations_lot_ref_idx: {
    table: "platform_coin_hold_allocations",
    columns: ["lot_ref"]
  },
  platform_coin_ledger_entries_lot_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["lot_ref"]
  },
  platform_coin_ledger_entries_hold_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["hold_ref"]
  }
});

const CANONICAL_TABLES = Object.freeze([
  ["wallets", "platform_coin_wallets", "wallet_ref"],
  ["lots", "platform_coin_lots", "lot_ref"],
  ["holds", "platform_coin_holds", "hold_ref"],
  ["allocations", "platform_coin_hold_allocations", "allocation_ref"],
  ["receipts", "platform_coin_operation_receipts", "operation_ref"],
  ["origins", "platform_coin_credit_origins", "credit_origin_ref"],
  ["ledgerEntries", "platform_coin_ledger_entries", "entry_ref"]
]);

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function withOwnedDatabase(prefix, callback) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(directory, "database.sqlite");
  try {
    return await callback({ directory, dbPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertPending(result) {
  assert.deepEqual(result, {
    ok: false,
    schemaState: "pending",
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    counts: {
      indexes: 0,
      migrationRows: 1,
      foreignKeyViolations: 0
    },
    checks: {
      foundationDependency: true,
      schemaExact: false,
      quickCheck: true,
      foreignKeys: true
    },
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    ]
  });
}

function createPlatformAccounts(database) {
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
}

function createFoundationDatabase(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table synthetic_reference_index_sentinel (
      sentinel_key text primary key,
      sentinel_value text not null
    );
    insert into synthetic_reference_index_sentinel
      values ('preserve', 'synthetic-private-marker');
  `);
  database.close();
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum:
      walletFoundation.COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
  seedCanonicalWalletRows(dbPath);
}

function seedCanonicalWalletRows(dbPath) {
  const database = new Database(dbPath);
  const timestamp = "2026-07-30T00:00:00.000Z";
  try {
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      database.prepare(`
        insert into platform_accounts
          (id, owner_ref, status, created_at, updated_at, metadata_json)
        values (?, ?, ?, ?, ?, ?)
      `).run(
        "account_private", "owner_private", "active",
        timestamp, timestamp, "{}"
      );
      database.prepare(`
        insert into platform_coin_wallets
          (wallet_ref, account_id, status, version, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?)
      `).run(
        "wallet_private", "account_private", "active", 1,
        timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_operation_receipts (
          operation_ref, wallet_ref, actor_scope, operation_type,
          idempotency_key, request_digest, status, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "operation_private", "wallet_private", "system:synthetic", "credit",
        "idempotency_private", "digest_private", "succeeded", 0, 1, "active",
        "lot_private", "credited", timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_credit_origins (
          credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
          source_digest, operation_ref, lot_ref, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "origin_private", "wallet_private", "paid_coins", "synthetic",
        "source_private", "source_digest_private", "operation_private",
        "lot_private", timestamp
      );
      database.prepare(`
        insert into platform_coin_lots (
          lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
          pending_units, available_units, held_units, consumed_units,
          reversed_units, expired_units, source_type, source_ref, policy_ref,
          policy_version, expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "lot_private", "wallet_private", "paid_coins", "origin_private",
        10, 0, 8, 2, 0, 0, 0, "synthetic", "source_private",
        null, null, null, timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "hold_private", "wallet_private", "product_purchase", "order_private",
        2, "active", "2026-08-30T00:00:00.000Z", timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence,
          allocated_units, created_at
        ) values (?, ?, ?, ?, ?, ?)
      `).run(
        "allocation_private", "hold_private", "lot_private", 1, 2, timestamp
      );
      database.prepare(`
        insert into platform_coin_ledger_entries (
          entry_ref, operation_ref, wallet_ref, lot_ref, operation,
          amount_units, hold_ref, order_ref, source_type, source_ref,
          actor_type, actor_ref, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, occurred_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "entry_private", "operation_private", "wallet_private", "lot_private",
        "hold", 2, "hold_private", "order_private", "synthetic",
        "source_private", "system", "actor_private", 0, 1, "active", timestamp
      );
    }).immediate();
  } finally {
    database.close();
  }
}

function installExactSuccessor(database, { checksum = SUCCESSOR_CHECKSUM } = {}) {
  for (const statement of SUCCESSOR_INDEX_STATEMENTS) {
    database.exec(statement);
  }
  database.prepare(`
    insert into platform_schema_migrations
      (migration_id, ddl_checksum, applied_at)
    values (?, ?, ?)
  `).run(
    REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    checksum,
    "2026-07-30T00:01:00.000Z"
  );
}

function canonicalDatabaseState(dbPath) {
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    return {
      foundationMigration: database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         where migration_id = ?
      `).get(walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID),
      tables: Object.fromEntries(CANONICAL_TABLES.map(
        ([key, table, orderColumn]) => [
          key,
          database.prepare(
            `select * from ${table} order by ${orderColumn}`
          ).all()
        ]
      )),
      sentinelRows: database.prepare(`
        select sentinel_key, sentinel_value
          from synthetic_reference_index_sentinel
         order by sentinel_key
      `).all()
    };
  } finally {
    database.close();
  }
}

function exactApply({ dbPath, database, nowFn } = {}) {
  return applyCoinWalletReferenceIndexMigrations({
    dbPath,
    database,
    expectedMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    expectedDdlChecksum: SUCCESSOR_CHECKSUM,
    nowFn: nowFn ?? (() => new Date("2026-07-30T00:00:00.000Z"))
  });
}

function assertFoundationReadyAndSuccessorAbsent(dbPath) {
  assert.equal(walletFoundation.validateCoinWalletSchema({ dbPath }).ok, true);
  assertPending(validateCoinWalletReferenceIndexSchema({ dbPath }));
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    for (const name of Object.keys(EXPECTED_TEST_INDEXES)) {
      assert.equal(
        database.prepare(
          "select 1 from sqlite_master where type='index' and name=?"
        ).get(name),
        undefined
      );
    }
    assert.equal(database.prepare(`
      select 1 from platform_schema_migrations where migration_id = ?
    `).get(REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID), undefined);
  } finally {
    database.close();
  }
}

function assertRollbackState(dbPath, beforeState) {
  assertFoundationReadyAndSuccessorAbsent(dbPath);
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    assert.deepEqual(database.pragma("quick_check"), [{ quick_check: "ok" }]);
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
  }
  assert.deepEqual(canonicalDatabaseState(dbPath), beforeState);
}

function canonicalState(dbPath) {
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    return {
      sentinel: database.prepare(
        "select sentinel_key, sentinel_value"
          + " from synthetic_reference_index_sentinel order by sentinel_key"
      ).all(),
      accounts: database.prepare(
        "select id, owner_ref, status, created_at, updated_at, metadata_json"
          + " from platform_accounts order by id"
      ).all(),
      wallets: database.prepare(
        "select wallet_ref, account_id, status, version, created_at, updated_at"
          + " from platform_coin_wallets order by wallet_ref"
      ).all(),
      lots: database.prepare(
        "select lot_ref, wallet_ref, issued_units, available_units, held_units"
          + " from platform_coin_lots order by lot_ref"
      ).all(),
      holds: database.prepare(
        "select hold_ref, wallet_ref, amount_units, status"
          + " from platform_coin_holds order by hold_ref"
      ).all(),
      ledger: database.prepare(
        "select entry_ref, operation_ref, wallet_ref, lot_ref, hold_ref"
          + " from platform_coin_ledger_entries order by entry_ref"
      ).all()
    };
  } finally {
    database.close();
  }
}

test("exports one frozen successor identity without changing the foundation namespace", () => {
  assert.deepEqual(Object.keys(walletFoundation).sort(), [
    "COIN_WALLET_MIGRATIONS",
    "REQUIRED_COIN_WALLET_MIGRATION_ID",
    "applyCoinWalletMigrations",
    "dryRunCoinWalletMigrations",
    "inspectCoinWalletSchema",
    "validateCoinWalletSchema"
  ]);
  assert.equal(walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID,
    "20260723_001_coin_wallet_foundation");
  assert.equal(walletFoundation.COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    FOUNDATION_CHECKSUM);
  assert.equal(REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    "20260730_001_coin_wallet_reference_indexes");
  assert.deepEqual(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS, [{
    id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    ddlChecksum: SUCCESSOR_CHECKSUM
  }]);
  assert.equal(Object.isFrozen(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS), true);
  assert.equal(Object.isFrozen(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS[0]), true);
});

test("importing the successor module has no database or filesystem side effect", () => {
  const directory = mkdtempSync(join(tmpdir(), "wallet-reference-import-"));
  try {
    const moduleUrl = pathToFileURL(
      join(process.cwd(), "server", "services", "platform",
        "coin-wallet-reference-index-migrations.mjs")
    ).href;
    const result = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(moduleUrl)})`
    ], {
      cwd: directory,
      encoding: "utf8",
      env: {},
      windowsHide: true
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validate reports foundation-only state as pending without writing", async () => {
  await withOwnedDatabase("wallet-reference-pending-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const beforeHash = fileSha256(dbPath);

    const result = validateCoinWalletReferenceIndexSchema({ dbPath });

    assertPending(result);
    assert.equal(fileSha256(dbPath), beforeHash);
  });
});

test("missing drifted and incompatible foundation dependencies fail closed", async () => {
  const cases = [
    ["missing", (dbPath) => {
      const database = new Database(dbPath);
      try {
        createPlatformAccounts(database);
      } finally {
        database.close();
      }
    }],
    ["drifted-row", (dbPath) => {
      createFoundationDatabase(dbPath);
      const database = new Database(dbPath);
      try {
        database.prepare(`
          update platform_schema_migrations
             set ddl_checksum = ?
           where migration_id = ?
        `).run(
          "0".repeat(64),
          walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID
        );
      } finally {
        database.close();
      }
    }],
    ["incompatible-schema", (dbPath) => {
      createFoundationDatabase(dbPath);
      const database = new Database(dbPath);
      try {
        database.exec(
          "drop index platform_coin_ledger_entries_wallet_page_idx"
        );
      } finally {
        database.close();
      }
    }]
  ];

  for (const [name, setup] of cases) {
    await withOwnedDatabase(`wallet-reference-foundation-${name}-`, ({ dbPath }) => {
      setup(dbPath);
      const result = validateCoinWalletReferenceIndexSchema({ dbPath });
      assert.equal(result.ok, false, name);
      assert.equal(result.schemaState, "blocked", name);
      assert.equal(result.checks.foundationDependency, false, name);
      assert.deepEqual(result.reasonCodes, ["migration_dependency_missing"], name);
      assert.deepEqual(result.pendingMigrationIds, [], name);
    });
  }
});

test("an incompatible shared migration ledger returns a closed rejection without throwing", async () => {
  await withOwnedDatabase("wallet-reference-ledger-incompatible-", ({ dbPath }) => {
    const database = new Database(dbPath);
    try {
      createPlatformAccounts(database);
      database.exec(`
        create table platform_schema_migrations (
          migration_id text primary key,
          applied_at text not null
        )
      `);

      let inspected;
      assert.doesNotThrow(() => {
        inspected = inspectCoinWalletReferenceIndexSchema({ database });
      });
      assert.equal(inspected.ok, false);
      assert.equal(inspected.schemaState, "blocked");
      assert.equal(inspected.checks.foundationDependency, false);
      assert.deepEqual(
        inspected.reasonCodes,
        ["migration_ledger_incompatible"]
      );
      assert.deepEqual(inspected.pendingMigrationIds, []);
    } finally {
      database.close();
    }

    let validated;
    assert.doesNotThrow(() => {
      validated = validateCoinWalletReferenceIndexSchema({ dbPath });
    });
    assert.equal(validated.ok, false);
    assert.equal(validated.schemaState, "blocked");
    assert.equal(validated.checks.foundationDependency, false);
    assert.deepEqual(
      validated.reasonCodes,
      ["migration_ledger_incompatible"]
    );
    assert.deepEqual(validated.pendingMigrationIds, []);
  });
});

test("exact successor objects and row inspect ready while unrelated future rows remain allowed", async () => {
  await withOwnedDatabase("wallet-reference-successor-ready-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      installExactSuccessor(database);
      database.exec(`
        create index synthetic_unrelated_ledger_lot_ref_idx
          on platform_coin_ledger_entries(lot_ref)
      `);
      database.prepare(`
        insert into platform_schema_migrations
          (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run(
        "20990101_001_synthetic_future",
        "f".repeat(64),
        "2099-01-01T00:00:00.000Z"
      );

      assert.deepEqual(inspectCoinWalletReferenceIndexSchema({ database }), {
        ok: true,
        schemaState: "ready",
        requiredMigrationId:
          REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
        counts: {
          indexes: 3,
          migrationRows: 3,
          foreignKeyViolations: 0
        },
        checks: {
          foundationDependency: true,
          schemaExact: true,
          quickCheck: true,
          foreignKeys: true
        },
        reasonCodes: [],
        pendingMigrationIds: []
      });
    } finally {
      database.close();
    }
  });
});

test("a successor ledger checksum mismatch is blocked without mutation", async () => {
  await withOwnedDatabase("wallet-reference-successor-checksum-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      installExactSuccessor(database, { checksum: "0".repeat(64) });
    } finally {
      database.close();
    }
    const beforeHash = fileSha256(dbPath);
    const beforeState = canonicalState(dbPath);

    const result = validateCoinWalletReferenceIndexSchema({ dbPath });

    assert.equal(result.ok, false);
    assert.equal(result.schemaState, "blocked");
    assert.deepEqual(result.reasonCodes, ["migration_checksum_mismatch"]);
    assert.deepEqual(result.pendingMigrationIds, []);
    assert.equal(fileSha256(dbPath), beforeHash);
    assert.deepEqual(canonicalState(dbPath), beforeState);
  });
});

test("partial successor state and applied index drift are blocked", async () => {
  const cases = [
    {
      name: "without-row",
      expectedReason: "owned_object_without_migration",
      setup(database) {
        database.exec(SUCCESSOR_INDEX_STATEMENTS[0]);
      }
    },
    {
      name: "missing-index",
      expectedReason: "owned_object_missing",
      setup(database) {
        database.exec(SUCCESSOR_INDEX_STATEMENTS[0]);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[1]);
        database.prepare(`
          insert into platform_schema_migrations
            (migration_id, ddl_checksum, applied_at)
          values (?, ?, ?)
        `).run(
          REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
          SUCCESSOR_CHECKSUM,
          "2026-07-30T00:01:00.000Z"
        );
      }
    },
    {
      name: "wrong-column",
      expectedReason: "owned_object_incompatible",
      setup(database) {
        database.exec(`
          create index platform_coin_hold_allocations_lot_ref_idx
            on platform_coin_hold_allocations(hold_ref)
        `);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[1]);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[2]);
        database.prepare(`
          insert into platform_schema_migrations
            (migration_id, ddl_checksum, applied_at)
          values (?, ?, ?)
        `).run(
          REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
          SUCCESSOR_CHECKSUM,
          "2026-07-30T00:01:00.000Z"
        );
      }
    },
    {
      name: "unique-index",
      expectedReason: "owned_object_incompatible",
      setup(database) {
        database.exec(`
          create unique index platform_coin_hold_allocations_lot_ref_idx
            on platform_coin_hold_allocations(lot_ref)
        `);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[1]);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[2]);
        database.prepare(`
          insert into platform_schema_migrations
            (migration_id, ddl_checksum, applied_at)
          values (?, ?, ?)
        `).run(
          REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
          SUCCESSOR_CHECKSUM,
          "2026-07-30T00:01:00.000Z"
        );
      }
    },
    {
      name: "partial-index",
      expectedReason: "owned_object_incompatible",
      setup(database) {
        database.exec(`
          create index platform_coin_hold_allocations_lot_ref_idx
            on platform_coin_hold_allocations(lot_ref)
           where allocated_units > 0
        `);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[1]);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[2]);
        database.prepare(`
          insert into platform_schema_migrations
            (migration_id, ddl_checksum, applied_at)
          values (?, ?, ?)
        `).run(
          REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
          SUCCESSOR_CHECKSUM,
          "2026-07-30T00:01:00.000Z"
        );
      }
    },
    {
      name: "wrong-table",
      expectedReason: "owned_object_incompatible",
      setup(database) {
        database.exec(`
          create index platform_coin_hold_allocations_lot_ref_idx
            on platform_coin_lots(lot_ref)
        `);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[1]);
        database.exec(SUCCESSOR_INDEX_STATEMENTS[2]);
        database.prepare(`
          insert into platform_schema_migrations
            (migration_id, ddl_checksum, applied_at)
          values (?, ?, ?)
        `).run(
          REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
          SUCCESSOR_CHECKSUM,
          "2026-07-30T00:01:00.000Z"
        );
      }
    }
  ];

  for (const fixture of cases) {
    await withOwnedDatabase(
      `wallet-reference-partial-${fixture.name}-`,
      ({ dbPath }) => {
        createFoundationDatabase(dbPath);
        const database = new Database(dbPath);
        try {
          fixture.setup(database);
        } finally {
          database.close();
        }

        const result = validateCoinWalletReferenceIndexSchema({ dbPath });
        assert.equal(result.ok, false, fixture.name);
        assert.equal(result.schemaState, "blocked", fixture.name);
        assert.equal(result.checks.schemaExact, false, fixture.name);
        assert.deepEqual(
          result.reasonCodes,
          [fixture.expectedReason],
          fixture.name
        );
        assert.deepEqual(result.pendingMigrationIds, [], fixture.name);
      }
    );
  }
});

test("case-fold uppercase target collision without successor row is blocked", async () => {
  await withOwnedDatabase("wallet-reference-case-fold-collision-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create index PLATFORM_COIN_HOLD_ALLOCATIONS_LOT_REF_IDX
          on platform_coin_hold_allocations(lot_ref)
      `);
    } finally {
      database.close();
    }

    const result = validateCoinWalletReferenceIndexSchema({ dbPath });

    assert.equal(result.ok, false);
    assert.equal(result.schemaState, "blocked");
    assert.equal(result.checks.schemaExact, false);
    assert.deepEqual(result.reasonCodes, ["owned_object_without_migration"]);
    assert.deepEqual(result.pendingMigrationIds, []);
  });
});

test("case-fold target name drift with successor row is incompatible", async () => {
  await withOwnedDatabase("wallet-reference-case-fold-drift-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create index Platform_Coin_Hold_Allocations_Lot_Ref_Idx
          on platform_coin_hold_allocations(lot_ref)
      `);
      database.exec(SUCCESSOR_INDEX_STATEMENTS[1]);
      database.exec(SUCCESSOR_INDEX_STATEMENTS[2]);
      database.prepare(`
        insert into platform_schema_migrations
          (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run(
        REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
        SUCCESSOR_CHECKSUM,
        "2026-07-30T00:01:00.000Z"
      );
    } finally {
      database.close();
    }

    const result = validateCoinWalletReferenceIndexSchema({ dbPath });

    assert.equal(result.ok, false);
    assert.equal(result.schemaState, "blocked");
    assert.equal(result.checks.schemaExact, false);
    assert.deepEqual(result.reasonCodes, ["owned_object_incompatible"]);
    assert.deepEqual(result.pendingMigrationIds, []);
  });
});

test("apply creates exactly three approved indexes and one successor row", async () => {
  await withOwnedDatabase("wallet-reference-apply-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const beforeState = canonicalDatabaseState(dbPath);

    const result = exactApply({ dbPath });

    assert.equal(result.ok, true);
    assert.equal(result.schemaState, "ready");
    assert.equal(result.sourceChanged, true);
    assert.deepEqual(result.appliedMigrationIds, [
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    ]);
    assert.deepEqual(result.pendingMigrationIds, []);
    const database = new Database(dbPath, {
      readonly: true,
      fileMustExist: true
    });
    try {
      assert.deepEqual(database.prepare(`
        select migration_id, ddl_checksum
          from platform_schema_migrations
         where migration_id = ?
      `).get(REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID), {
        migration_id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
        ddl_checksum: SUCCESSOR_CHECKSUM
      });
      for (const [name, expected] of Object.entries(EXPECTED_TEST_INDEXES)) {
        const listed = database.pragma(`index_list(${expected.table})`)
          .find((candidate) => candidate.name === name);
        assert.equal(listed?.unique, 0, name);
        assert.equal(listed?.partial, 0, name);
        assert.deepEqual(
          database.pragma(`index_info(${name})`)
            .map(({ name: column }) => column),
          expected.columns,
          name
        );
      }
    } finally {
      database.close();
    }
    assert.deepEqual(canonicalDatabaseState(dbPath), beforeState);
  });
});

test("exact replay is a no-op and tolerates future rows and unrelated indexes", async () => {
  await withOwnedDatabase("wallet-reference-replay-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    exactApply({ dbPath });
    const database = new Database(dbPath);
    try {
      database.exec(`
        create index synthetic_equivalent_ledger_lot_ref_idx
          on platform_coin_ledger_entries(lot_ref)
      `);
      database.prepare(`
        insert into platform_schema_migrations
          (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run(
        "20990101_001_synthetic_future",
        "f".repeat(64),
        "2099-01-01T00:00:00.000Z"
      );
    } finally {
      database.close();
    }
    const beforeState = canonicalDatabaseState(dbPath);
    const beforeSchema =
      validateCoinWalletReferenceIndexSchema({ dbPath });

    const result = exactApply({
      dbPath,
      nowFn() {
        throw new Error("nowFn must not run on replay");
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.schemaState, "ready");
    assert.equal(result.sourceChanged, false);
    assert.deepEqual(result.appliedMigrationIds, []);
    assert.deepEqual(result.pendingMigrationIds, []);
    assert.deepEqual(canonicalDatabaseState(dbPath), beforeState);
    assert.deepEqual(
      validateCoinWalletReferenceIndexSchema({ dbPath }),
      beforeSchema
    );
  });
});

test("confirmation mismatch rejects before database access", () => {
  let accessed = false;
  const database = new Proxy({}, {
    get() {
      accessed = true;
      throw new Error("database access forbidden");
    }
  });

  assert.throws(
    () => applyCoinWalletReferenceIndexMigrations({
      database,
      expectedMigrationId: "wrong_migration",
      expectedDdlChecksum: SUCCESSOR_CHECKSUM
    }),
    (error) => error.code === "migration_id_mismatch"
  );
  assert.equal(accessed, false);
  assert.throws(
    () => applyCoinWalletReferenceIndexMigrations({
      database,
      expectedMigrationId:
        REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
      expectedDdlChecksum: "0".repeat(64)
    }),
    (error) => error.code === "migration_checksum_mismatch"
  );
  assert.equal(accessed, false);
});

test("target-name collision rejects without adopting or mutating it", async () => {
  for (let index = 0; index < SUCCESSOR_INDEX_STATEMENTS.length; index += 1) {
    await withOwnedDatabase(
      `wallet-reference-collision-${index + 1}-`,
      ({ dbPath }) => {
        createFoundationDatabase(dbPath);
        const database = new Database(dbPath);
        try {
          database.exec(SUCCESSOR_INDEX_STATEMENTS[index]);
        } finally {
          database.close();
        }
        const beforeState = canonicalDatabaseState(dbPath);
        const beforeSchema =
          validateCoinWalletReferenceIndexSchema({ dbPath });

        assert.throws(
          () => exactApply({ dbPath }),
          (error) => error.code === "owned_object_without_migration"
        );

        assert.deepEqual(canonicalDatabaseState(dbPath), beforeState);
        assert.deepEqual(
          validateCoinWalletReferenceIndexSchema({ dbPath }),
          beforeSchema
        );
      }
    );
  }
});

test("apply maps SQLite busy and locked errors without exposing raw details", () => {
  for (const code of [
    "SQLITE_BUSY",
    "SQLITE_BUSY_SNAPSHOT",
    "SQLITE_LOCKED"
  ]) {
    const rawMessage = `synthetic raw detail for ${code}`;
    const database = {
      pragma() {
        const error = new Error(rawMessage);
        error.code = code;
        throw error;
      }
    };
    assert.throws(
      () => exactApply({ database }),
      (error) => {
        assert.equal(error.code, "database_unavailable");
        assert.equal(error.message.includes(rawMessage), false);
        assert.equal(error.message.includes(code), false);
        return true;
      }
    );
  }
});

test("database ownership is explicit on apply success and failure", async () => {
  await withOwnedDatabase("wallet-reference-owned-success-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    exactApply({ dbPath });
    assert.doesNotThrow(() => rmSync(dbPath));
  });

  await withOwnedDatabase("wallet-reference-owned-failure-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create trigger synthetic_owned_insert_abort
        before insert on platform_schema_migrations
        when new.migration_id =
          '20260730_001_coin_wallet_reference_indexes'
        begin
          select raise(abort, 'synthetic owned apply fault');
        end
      `);
    } finally {
      database.close();
    }
    assert.throws(
      () => exactApply({ dbPath }),
      (error) => error.code === "migration_apply_failed"
    );
    assert.doesNotThrow(() => rmSync(dbPath));
  });

  await withOwnedDatabase("wallet-reference-injected-success-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      exactApply({ database });
      assert.equal(database.prepare("select 1").pluck().get(), 1);
    } finally {
      database.close();
    }
  });

  await withOwnedDatabase("wallet-reference-injected-failure-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(SUCCESSOR_INDEX_STATEMENTS[0]);
      assert.throws(
        () => exactApply({ database }),
        (error) => error.code === "owned_object_without_migration"
      );
      assert.equal(database.prepare("select 1").pluck().get(), 1);
    } finally {
      database.close();
    }
  });

  await withOwnedDatabase("wallet-reference-close-failure-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const originalClose = Database.prototype.close;
    Database.prototype.close = function closeThenThrow() {
      originalClose.call(this);
      throw new Error("synthetic close fault");
    };
    try {
      assert.throws(
        () => exactApply({ dbPath }),
        (error) => error.code === "database_close_failed"
      );
    } finally {
      Database.prototype.close = originalClose;
    }
    assert.doesNotThrow(() => rmSync(dbPath));
  });
});

test("DDL faults roll back every successor mutation", async () => {
  for (const failAfter of [1, 2, 3]) {
    await withOwnedDatabase(
      `wallet-reference-ddl-${failAfter}-`,
      ({ dbPath }) => {
        createFoundationDatabase(dbPath);
        const beforeState = canonicalDatabaseState(dbPath);
        const database = new Database(dbPath);
        const originalExec = database.exec.bind(database);
        let executed = 0;
        database.exec = (sql) => {
          const result = originalExec(sql);
          executed += 1;
          if (executed === failAfter) {
            throw new Error("synthetic ddl fault");
          }
          return result;
        };
        try {
          assert.throws(
            () => exactApply({ database }),
            (error) => error.code === "migration_apply_failed"
          );
        } finally {
          database.close();
        }
        assertRollbackState(dbPath, beforeState);
      }
    );
  }
});

test("ledger insertion fault rolls back indexes and successor row", async () => {
  await withOwnedDatabase("wallet-reference-ledger-fault-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const beforeState = canonicalDatabaseState(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create trigger synthetic_successor_insert_abort
        before insert on platform_schema_migrations
        when new.migration_id =
          '20260730_001_coin_wallet_reference_indexes'
        begin
          select raise(abort, 'synthetic successor insert fault');
        end
      `);
      assert.throws(
        () => exactApply({ database }),
        (error) => error.code === "migration_apply_failed"
      );
    } finally {
      database.close();
    }
    assertRollbackState(dbPath, beforeState);
  });
});

test("postcondition failure rolls back indexes and successor row", async () => {
  await withOwnedDatabase("wallet-reference-postcondition-", ({ dbPath }) => {
    createFoundationDatabase(dbPath);
    const beforeState = canonicalDatabaseState(dbPath);
    const database = new Database(dbPath);
    try {
      assert.throws(
        () => exactApply({
          database,
          nowFn() {
            database.exec(`
              create temp trigger synthetic_successor_row_delete
              after insert on platform_schema_migrations
              when new.migration_id =
                '20260730_001_coin_wallet_reference_indexes'
              begin
                delete from platform_schema_migrations
                 where migration_id = new.migration_id;
              end
            `);
            return new Date("2026-07-30T00:00:00.000Z");
          }
        }),
        (error) => error.code === "applied_schema_incompatible"
      );
    } finally {
      database.close();
    }
    assertRollbackState(dbPath, beforeState);
  });
});
