import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
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
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations,
  dryRunCoinCommerceMigrations,
  inspectCoinCommerceSchema,
  validateCoinCommerceSchema
} from "../services/platform/coin-commerce-migrations.mjs";

const APPLIED_AT = "2026-07-26T12:34:56.000Z";
const TABLES = [
  "platform_coin_commerce_offer_versions",
  "platform_coin_commerce_quotes",
  "platform_coin_commerce_orders",
  "platform_coin_commerce_operation_receipts",
  "platform_coin_commerce_order_events",
  "platform_coin_commerce_fulfillment_commands",
  "platform_coin_commerce_fulfillment_receipts"
];
const INDEXES = [
  "offer_versions_one_published_idx",
  "offer_versions_published_list_idx",
  "quotes_account_status_expiry_idx",
  "orders_due_capture_idx",
  "orders_capture_pending_idx",
  "operation_receipts_replay_idx",
  "order_events_order_page_idx",
  "fulfillment_commands_claim_idx",
  "fulfillment_receipts_command_idx"
];
const TRIGGERS = [
  "coin_commerce_order_events_immutable_update",
  "coin_commerce_order_events_immutable_delete",
  "coin_commerce_fulfillment_receipts_immutable_update",
  "coin_commerce_fulfillment_receipts_immutable_delete",
  "coin_commerce_quotes_snapshot_immutable_update",
  "coin_commerce_orders_snapshot_immutable_update",
  "coin_commerce_offer_versions_content_immutable_update",
  "coin_commerce_offer_versions_status_transition",
  "coin_commerce_quotes_status_transition",
  "coin_commerce_orders_payment_status_transition",
  "coin_commerce_operation_receipts_status_transition",
  "coin_commerce_fulfillment_commands_status_transition",
  "coin_commerce_offer_versions_terminal_immutable_update",
  "coin_commerce_quotes_terminal_immutable_update",
  "coin_commerce_operation_receipts_identity_immutable_update",
  "coin_commerce_operation_receipts_terminal_immutable_update"
];

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-migration-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function withTempDirectoryAsync(action) {
  const directory = mkdtempSync(join(tmpdir(), "coin-commerce-migration-test-"));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createBaseDatabase(dbPath) {
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
    create table synthetic_sentinel (
      sentinel_key text primary key,
      sentinel_value text not null
    );
    insert into synthetic_sentinel values ('preserve', 'unchanged');
  `);
  database.close();
}

function applyWallet(dbPath) {
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function createWalletDatabase(dbPath) {
  createBaseDatabase(dbPath);
  applyWallet(dbPath);
}

function exactApplyInput(database) {
  return {
    database,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  };
}

function schemaSql(database, names) {
  return database.prepare(`
    select type, name, sql
      from sqlite_master
     where name in (${names.map(() => "?").join(", ")})
     order by type, name
  `).all(...names);
}

function walletObjectSql(database) {
  return database.prepare(`
    select type, name, sql
      from sqlite_master
     where name like 'platform_coin_%'
       and name not like 'platform_coin_commerce_%'
     order by type, name
  `).all();
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function expectCode(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    assert.doesNotMatch(error?.message ?? "", /create table|select |insert |pragma /i);
    return true;
  });
}

test("requires the exact Wallet migration before Commerce apply", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "unmigrated.sqlite");
    createBaseDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      expectCode(
        () => applyCoinCommerceMigrations(exactApplyInput(database)),
        "commerce_migration_dependency_missing"
      );
    } finally {
      database.close();
    }
  });
});

test("rejects every pre-existing Commerce namespace object without the migration row", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "preexisting-extra.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      database.exec(`
        create table platform_coin_commerce_unreviewed (
          id text primary key
        )
      `);
      expectCode(
        () => applyCoinCommerceMigrations(exactApplyInput(database)),
        "commerce_owned_object_without_migration"
      );
    } finally {
      database.close();
    }
  });
});

test("applies only Commerce-owned additive objects with the exact closed inspection", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "commerce.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      const beforeWalletSql = walletObjectSql(database);
      const result = applyCoinCommerceMigrations(exactApplyInput(database));
      assert.deepEqual(walletObjectSql(database), beforeWalletSql);
      assert.deepEqual(result.appliedMigrationIds, [
        REQUIRED_COIN_COMMERCE_MIGRATION_ID
      ]);
      assert.deepEqual(result.counts, {
        tables: 7,
        indexes: 9,
        triggers: 16,
        migrationRows: 2,
        foreignKeyViolations: 0
      });
      assert.deepEqual(result.checks, {
        schemaExact: true,
        walletDependency: true,
        quickCheck: true,
        foreignKeys: true
      });
      assert.equal(result.ok, true);
      assert.deepEqual(
        schemaSql(database, [...TABLES, ...INDEXES, ...TRIGGERS]).map(({ name }) => name).sort(),
        [...TABLES, ...INDEXES, ...TRIGGERS].sort()
      );
    } finally {
      database.close();
    }
  });
});

test("repeated apply is a no-op and unrelated future migration rows are tolerated", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "repeat.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      database.prepare(`
        insert into platform_schema_migrations
          (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run("20991231_001_future", "f".repeat(64), APPLIED_AT);
      const result = applyCoinCommerceMigrations(exactApplyInput(database));
      assert.deepEqual(result.appliedMigrationIds, []);
      assert.equal(result.ok, true);
      assert.equal(result.counts.migrationRows, 3);
    } finally {
      database.close();
    }
  });
});

test("migration ID and checksum confirmations fail closed", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "contract.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      expectCode(
        () => applyCoinCommerceMigrations({
          ...exactApplyInput(database),
          expectedMigrationId: "wrong"
        }),
        "commerce_migration_id_mismatch"
      );
      expectCode(
        () => applyCoinCommerceMigrations({
          ...exactApplyInput(database),
          expectedDdlChecksum: "0".repeat(64)
        }),
        "commerce_migration_checksum_mismatch"
      );
    } finally {
      database.close();
    }
  });
});

test("validation rejects altered columns, checks, foreign keys, indexes, triggers, and migration rows", () => {
  for (const mutation of [
    "column",
    "check",
    "foreign-key",
    "index",
    "trigger",
    "migration"
  ]) {
    withTempDirectory((directory) => {
      const dbPath = join(directory, `${mutation}.sqlite`);
      createWalletDatabase(dbPath);
      const database = new Database(dbPath);
      try {
        applyCoinCommerceMigrations(exactApplyInput(database));
        if (mutation === "index") {
          database.exec("drop index offer_versions_published_list_idx");
        } else if (mutation === "trigger") {
          database.exec("drop trigger coin_commerce_order_events_immutable_delete");
        } else if (mutation === "migration") {
          database.prepare(`
            update platform_schema_migrations
               set ddl_checksum = ?
             where migration_id = ?
          `).run("0".repeat(64), REQUIRED_COIN_COMMERCE_MIGRATION_ID);
        } else {
          const replacements = {
            column: ["summary_en text not null", "summary_en blob not null"],
            check: ["status in ('active', 'consumed', 'expired')", "status in ('active', 'consumed')"],
            "foreign-key": [
              "account_id text not null references platform_accounts(id)",
              "account_id text not null"
            ]
          };
          const [from, to] = replacements[mutation];
          const table = mutation === "check"
            ? "platform_coin_commerce_quotes"
            : mutation === "foreign-key"
              ? "platform_coin_commerce_orders"
              : "platform_coin_commerce_offer_versions";
          const originalSql = database.prepare(`
            select sql from sqlite_master where type = 'table' and name = ?
          `).pluck().get(table);
          assert.match(originalSql, new RegExp(from.replace(/[()[\]]/g, "\\$&")));
          database.pragma("foreign_keys = OFF");
          database.pragma("legacy_alter_table = ON");
          database.exec(`alter table ${table} rename to ${table}_tampered`);
          database.exec(originalSql.replace(from, to));
          database.pragma("legacy_alter_table = OFF");
          database.pragma("foreign_keys = ON");
        }
        const result = inspectCoinCommerceSchema({ database });
        assert.equal(result.ok, false, mutation);
        assert.equal(result.checks.schemaExact, false, mutation);
      } catch (error) {
        throw new Error(`${mutation}: ${error.message}`, { cause: error });
      } finally {
        database.close();
      }
    });
  }
});

test("exact namespace inspection rejects extra Commerce tables and attached explicit indexes or triggers", () => {
  for (const mutation of ["table", "index", "trigger"]) {
    withTempDirectory((directory) => {
      const dbPath = join(directory, `extra-${mutation}.sqlite`);
      createWalletDatabase(dbPath);
      const database = new Database(dbPath);
      try {
        applyCoinCommerceMigrations(exactApplyInput(database));
        if (mutation === "table") {
          database.exec(`
            create table platform_coin_commerce_unreviewed (
              id text primary key
            )
          `);
        } else if (mutation === "index") {
          database.exec(`
            create index coin_commerce_unreviewed_idx
              on platform_coin_commerce_quotes(created_at)
          `);
        } else {
          database.exec(`
            create trigger coin_commerce_unreviewed_trigger
            before update on platform_coin_commerce_orders
            begin
              select raise(abort, 'unreviewed');
            end
          `);
        }
        const inspection = inspectCoinCommerceSchema({ database });
        assert.equal(inspection.ok, false, mutation);
        assert.equal(inspection.checks.schemaExact, false, mutation);
        assert.ok(
          inspection.reasonCodes.includes("commerce_owned_object_incompatible"),
          mutation
        );
      } finally {
        database.close();
      }
    });
  }
});

test("inspection requires quick-check and foreign-key-check", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "integrity.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      const failingQuickCheckDatabase = {
        prepare: database.prepare.bind(database),
        pragma(statement) {
          if (statement === "quick_check") return [{ quick_check: "corrupt" }];
          return database.pragma(statement);
        }
      };
      const quickCheck = inspectCoinCommerceSchema({
        database: failingQuickCheckDatabase
      });
      assert.equal(quickCheck.ok, false);
      assert.equal(quickCheck.checks.quickCheck, false);

      database.pragma("foreign_keys = OFF");
      database.prepare(`
        insert into platform_coin_commerce_order_events (
          event_ref, order_ref, event_type, safe_code, actor_type, actor_ref,
          occurred_at
        ) values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        "event_orphan",
        "order_missing",
        "order_held",
        null,
        "commerce_system",
        "system",
        APPLIED_AT
      );
      const foreignKeys = inspectCoinCommerceSchema({ database });
      assert.equal(foreignKeys.ok, false);
      assert.equal(foreignKeys.checks.foreignKeys, false);
    } finally {
      database.close();
    }
  });
});

test("fulfillment lease state is bidirectional and counters fail closed at overflow", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "lease.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      database.pragma("foreign_keys = OFF");
      const insert = database.prepare(`
        insert into platform_coin_commerce_fulfillment_commands (
          command_ref, order_ref, account_id, payload_json, status,
          attempt_count, lease_generation, lease_token, lease_until,
          safe_failure_code, created_at, updated_at
        ) values (?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const base = ["order_synthetic", "account_synthetic"];
      assert.throws(() => insert.run(
        "command_pending_with_lease", ...base, "pending", 0, 0,
        "lease_token", APPLIED_AT, null, APPLIED_AT, APPLIED_AT
      ), /check constraint/i);
      assert.throws(() => insert.run(
        "command_processing_without_lease", ...base, "processing", 0, 0,
        null, null, null, APPLIED_AT, APPLIED_AT
      ), /check constraint/i);
      assert.throws(() => insert.run(
        "command_attempt_overflow", ...base, "pending", 2_147_483_648, 0,
        null, null, null, APPLIED_AT, APPLIED_AT
      ), /check constraint/i);
      assert.throws(() => insert.run(
        "command_generation_overflow", ...base, "pending", 0, 2_147_483_648,
        null, null, null, APPLIED_AT, APPLIED_AT
      ), /check constraint/i);
    } finally {
      database.close();
    }
  });
});

test("Offer lifecycle permits publish and retire but rejects reverse transitions and content mutation", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "offer-lifecycle.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      database.prepare(`
        insert into platform_coin_commerce_offer_versions (
          offer_version_ref, offer_ref, version, status, category,
          title_zh, title_en, summary_zh, summary_en,
          important_notices_zh_json, important_notices_en_json,
          base_coin_units, reference_currency, reference_amount_minor,
          accepted_coin_types_json, delivery_kind, duration_days,
          monthly_traffic_gb, traffic_gb, never_expires,
          discount_basis_points, created_at, published_at, retired_at
        ) values (
          ?, ?, 1, 'draft', 'plan',
          '基础月卡', 'Basic plan', '月度方案', 'Monthly plan',
          '["平台自营"]', '["Platform-owned"]',
          20, 'CNY', 2000,
          '["paid_coins"]', 'subscription_plan', 30,
          50, null, 0,
          500, ?, null, null
        )
      `).run("offerv_lifecycle_v1", "offer_lifecycle", APPLIED_AT);
      database.prepare(`
        update platform_coin_commerce_offer_versions
           set status = 'published', published_at = ?
         where offer_version_ref = ?
      `).run(APPLIED_AT, "offerv_lifecycle_v1");
      database.prepare(`
        update platform_coin_commerce_offer_versions
           set status = 'retired', retired_at = ?
         where offer_version_ref = ?
      `).run("2026-07-27T00:00:00.000Z", "offerv_lifecycle_v1");
      assert.throws(() => database.prepare(`
        update platform_coin_commerce_offer_versions
           set status = 'draft', published_at = null, retired_at = null
         where offer_version_ref = ?
      `).run("offerv_lifecycle_v1"), /offer_(status_transition|terminal_immutable)/i);
      assert.throws(() => database.prepare(`
        update platform_coin_commerce_offer_versions
           set summary_en = 'Changed'
         where offer_version_ref = ?
      `).run("offerv_lifecycle_v1"), /offer_content_immutable/i);
      assert.throws(() => database.prepare(`
        update platform_coin_commerce_offer_versions
           set retired_at = ?
         where offer_version_ref = ?
      `).run("2026-07-28T00:00:00.000Z", "offerv_lifecycle_v1"), /immutable/i);
    } finally {
      database.close();
    }
  });
});

test("Quote lifecycle allows active to consumed or expired once and freezes terminal timestamps", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "quote-lifecycle.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      database.pragma("foreign_keys = OFF");
      database.exec(`
        insert into platform_coin_commerce_offer_versions (
          offer_version_ref, offer_ref, version, status, category,
          title_zh, title_en, summary_zh, summary_en,
          important_notices_zh_json, important_notices_en_json,
          base_coin_units, reference_currency, reference_amount_minor,
          accepted_coin_types_json, delivery_kind, duration_days,
          monthly_traffic_gb, traffic_gb, never_expires,
          discount_basis_points, created_at, published_at, retired_at
        ) values (
          'offerv_quotes_v1', 'offer_quotes', 1, 'published', 'plan',
          '月卡', 'Monthly', '月度', 'Monthly',
          '["平台自营"]', '["Platform-owned"]',
          20, 'CNY', 2000, '["paid_coins"]',
          'subscription_plan', 30, 50, null, 0, 0,
          '${APPLIED_AT}', '${APPLIED_AT}', null
        );
      `);
      const insertQuote = database.prepare(`
        insert into platform_coin_commerce_quotes (
          quote_ref, account_id, offer_version_ref, wallet_version,
          amount_units, applied_discount_basis_points,
          purchase_availability, shortfall_units, allocation_json,
          before_balance_json, after_balance_json, status,
          created_at, expires_at, consumed_at
        ) values (?, 'account_synthetic', 'offerv_quotes_v1', 0,
          20, 0, 'available', 0, '[]', '{}', '{}', 'active',
          ?, ?, null)
      `);
      insertQuote.run("quote_consumed", APPLIED_AT, "2026-07-27T00:00:00.000Z");
      insertQuote.run("quote_expired", APPLIED_AT, "2026-07-27T00:00:00.000Z");

      database.prepare(`
        update platform_coin_commerce_quotes
           set status = 'consumed', consumed_at = ?
         where quote_ref = 'quote_consumed'
      `).run("2026-07-26T13:00:00.000Z");
      database.exec(`
        update platform_coin_commerce_quotes
           set status = 'expired'
         where quote_ref = 'quote_expired'
      `);
      assert.throws(() => database.prepare(`
        update platform_coin_commerce_quotes
           set consumed_at = ?
         where quote_ref = 'quote_consumed'
      `).run("2026-07-26T14:00:00.000Z"), /immutable/i);
      assert.throws(() => database.exec(`
        update platform_coin_commerce_quotes
           set status = 'active'
         where quote_ref = 'quote_expired'
      `), /quote_(status_transition|terminal_immutable)/i);
    } finally {
      database.close();
    }
  });
});

test("Operation receipt identity is immutable and terminal result facts are written exactly once", () => {
  withTempDirectory((directory) => {
    const dbPath = join(directory, "receipt-lifecycle.sqlite");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      database.pragma("foreign_keys = OFF");
      database.prepare(`
        insert into platform_coin_commerce_operation_receipts (
          operation_ref, account_id, actor_scope, operation_type,
          idempotency_key, request_digest, status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
      `).run(
        "operation_lifecycle",
        "account_synthetic",
        "portal:synthetic",
        "create_quote",
        "idempotency_synthetic",
        "digest_synthetic",
        APPLIED_AT
      );
      assert.throws(() => database.exec(`
        update platform_coin_commerce_operation_receipts
           set request_digest = 'digest_changed'
         where operation_ref = 'operation_lifecycle'
      `), /immutable/i);
      database.prepare(`
        update platform_coin_commerce_operation_receipts
           set status = 'succeeded', result_ref = ?, completed_at = ?
         where operation_ref = 'operation_lifecycle'
      `).run("quote_result", "2026-07-26T13:00:00.000Z");
      assert.throws(() => database.prepare(`
        update platform_coin_commerce_operation_receipts
           set result_ref = ?, completed_at = ?
         where operation_ref = 'operation_lifecycle'
      `).run("quote_rewritten", "2026-07-26T14:00:00.000Z"), /immutable/i);

      database.prepare(`
        insert into platform_coin_commerce_operation_receipts (
          operation_ref, account_id, actor_scope, operation_type,
          idempotency_key, request_digest, status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (?, ?, ?, ?, ?, ?, 'started', null, null, ?, null)
      `).run(
        "operation_failed",
        "account_synthetic",
        "system:synthetic",
        "fulfillment_result",
        "idempotency_failed",
        "digest_failed",
        APPLIED_AT
      );
      database.prepare(`
        update platform_coin_commerce_operation_receipts
           set status = 'failed', safe_result_code = ?, completed_at = ?
         where operation_ref = 'operation_failed'
      `).run("safe_failure", "2026-07-26T13:00:00.000Z");
      assert.throws(() => database.prepare(`
        update platform_coin_commerce_operation_receipts
           set safe_result_code = ?, completed_at = ?
         where operation_ref = 'operation_failed'
      `).run("rewritten_failure", "2026-07-26T14:00:00.000Z"), /immutable/i);
    } finally {
      database.close();
    }
  });
});

test("source dry-run writes only an owned snapshot and cleans it on success", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "source.sqlite");
    const tempRoot = join(directory, "owned-temp");
    createWalletDatabase(dbPath);
    const beforeHash = sha256File(dbPath);
    const before = new Database(dbPath, { readonly: true });
    const beforeSchema = schemaSql(before, [...TABLES, ...INDEXES, ...TRIGGERS]);
    const beforeSentinel = before.prepare("select * from synthetic_sentinel").all();
    before.close();

    const result = await dryRunCoinCommerceMigrations({ dbPath, tempRoot });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.sourceChanged, false);
    assert.deepEqual(result.pendingMigrationIds, [
      REQUIRED_COIN_COMMERCE_MIGRATION_ID
    ]);
    assert.equal(sha256File(dbPath), beforeHash);

    const after = new Database(dbPath, { readonly: true });
    assert.deepEqual(
      schemaSql(after, [...TABLES, ...INDEXES, ...TRIGGERS]),
      beforeSchema
    );
    assert.deepEqual(
      after.prepare("select * from synthetic_sentinel").all(),
      beforeSentinel
    );
    after.close();
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("source dry-run rejects a missing Wallet dependency and cleans its owned directory", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "source.sqlite");
    const tempRoot = join(directory, "owned-temp");
    createBaseDatabase(dbPath);
    await assert.rejects(
      dryRunCoinCommerceMigrations({ dbPath, tempRoot }),
      (error) => error?.code === "commerce_migration_dependency_missing"
    );
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("source dry-run fails closed on a concurrent WAL commit and cleans the owned snapshot", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "wal-source.sqlite");
    const tempRoot = join(directory, "owned-temp");
    createWalletDatabase(dbPath);
    const setup = new Database(dbPath);
    setup.pragma("journal_mode = WAL");
    setup.close();

    const originalBackup = Database.prototype.backup;
    let wroteConcurrently = false;
    Database.prototype.backup = async function patchedBackup(...args) {
      const result = await originalBackup.apply(this, args);
      if (this.readonly && !wroteConcurrently) {
        const writer = new Database(dbPath);
        try {
          writer.prepare(`
            update synthetic_sentinel
               set sentinel_value = ?
             where sentinel_key = ?
          `).run("concurrent-commit", "preserve");
          wroteConcurrently = true;
        } finally {
          writer.close();
        }
      }
      return result;
    };
    try {
      await assert.rejects(
        dryRunCoinCommerceMigrations({ dbPath, tempRoot }),
        (error) => error?.code === "commerce_source_changed_during_dry_run"
      );
      assert.equal(wroteConcurrently, true);
      assert.deepEqual(readdirSync(tempRoot), []);
    } finally {
      Database.prototype.backup = originalBackup;
    }
  });
});

test("source dry-run cleanup is guaranteed when backup and source close both fail", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "close-failure.sqlite");
    const tempRoot = join(directory, "owned-temp");
    createWalletDatabase(dbPath);

    const originalBackup = Database.prototype.backup;
    const originalClose = Database.prototype.close;
    Database.prototype.backup = async function failedBackup() {
      throw new Error("synthetic backup failure");
    };
    Database.prototype.close = function failedReadonlyClose() {
      const wasReadonly = this.readonly;
      const result = originalClose.call(this);
      if (wasReadonly) throw new Error("synthetic close failure");
      return result;
    };
    try {
      await assert.rejects(
        dryRunCoinCommerceMigrations({ dbPath, tempRoot }),
        /synthetic close failure/
      );
      assert.deepEqual(readdirSync(tempRoot), []);
    } finally {
      Database.prototype.backup = originalBackup;
      Database.prototype.close = originalClose;
    }
  });
});

test("source dry-run cleans its owned snapshot after applied-schema validation failure", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "tampered-source.sqlite");
    const tempRoot = join(directory, "owned-temp");
    createWalletDatabase(dbPath);
    const database = new Database(dbPath);
    try {
      applyCoinCommerceMigrations(exactApplyInput(database));
      database.exec(`
        create index coin_commerce_unreviewed_idx
          on platform_coin_commerce_quotes(created_at)
      `);
    } finally {
      database.close();
    }
    await assert.rejects(
      dryRunCoinCommerceMigrations({ dbPath, tempRoot }),
      (error) => error?.code === "commerce_applied_schema_incompatible"
    );
    assert.deepEqual(readdirSync(tempRoot), []);
  });
});

test("path validation and closed validate results do not open implicit databases", () => {
  assert.throws(
    () => validateCoinCommerceSchema({ dbPath: "relative.sqlite" }),
    (error) => error?.code === "commerce_invalid_database_path"
  );
  withTempDirectory((directory) => {
    const result = validateCoinCommerceSchema({
      dbPath: join(directory, "missing.sqlite")
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, ["database_missing"]);
  });
});
