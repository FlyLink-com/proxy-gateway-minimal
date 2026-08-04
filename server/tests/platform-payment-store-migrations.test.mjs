import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  REQUIRED_PAYMENT_STORE_MIGRATION_ID,
  applyPaymentStoreMigrations,
  dryRunPaymentStoreMigrations,
  inspectPaymentStoreSchema,
  validatePaymentStoreSchema,
} from "../services/platform/payment-store-migrations.mjs";

const NOW = "2026-08-01T00:00:00.000Z";
const LEGACY_ARCHIVE_TABLE =
  "platform_payment_orders_legacy_archive_20260803";
const LEGACY_ARCHIVE_MIGRATION_ID =
  "20260803_001_legacy_payment_orders_archive";
const LEGACY_ARCHIVE_MIGRATION_CHECKSUM =
  "72790ce7fea38bdebde8c95bdc1ba1e08b74114b429abcc4da0d2d4b888ea0d6";

async function withTempDirectory(label, callback) {
  const directory = mkdtempSync(join(tmpdir(), label));
  try {
    return await callback(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function createFoundation(database) {
  database.pragma("foreign_keys = on");
  database.exec(`
    create table platform_schema_migrations (
      migration_id text primary key,
      ddl_checksum text not null,
      applied_at text not null
    );
    create table platform_accounts (
      id text primary key
    );
  `);
}

function createLegacyPaymentOrdersSchema(database, {
  driftPlanIndex = false,
  omitStatusConstraint = false,
} = {}) {
  let baseSchema = `
    create table if not exists platform_payment_orders (
      order_ref text primary key,
      portal_user_ref text not null,
      plan text not null check (plan in ('monthly_basic', 'monthly_plus', 'yearly')),
      plan_label text not null,
      amount_minor integer not null check (amount_minor > 0),
      money text not null,
      currency text not null,
      duration_days integer not null check (duration_days > 0),
      client_target text not null check (client_target in ('clash', 'karing')),
      channel text not null check (channel in ('alipay', 'wxpay', 'qqpay', 'bank', 'jdpay')),
      status text not null check (status in (
        'pending_payment',
        'payment_amount_mismatch',
        'payment_failed',
        'paid_pending_admin_review',
        'paid_access_delivered',
        'paid_delivery_blocked'
      )),
      provider text not null,
      provider_order_ref text,
      checkout_url text,
      access_request_ref text,
      access_request_status text,
      paid_at text,
      created_at text not null,
      updated_at text not null
    );
  `;
  if (omitStatusConstraint) {
    baseSchema = baseSchema.replace(
      `status text not null check (status in (
        'pending_payment',
        'payment_amount_mismatch',
        'payment_failed',
        'paid_pending_admin_review',
        'paid_access_delivered',
        'paid_delivery_blocked'
      ))`,
      "status text not null",
    );
  }
  database.exec(baseSchema);

  database.exec(`
    create index if not exists platform_payment_orders_portal_user_idx
      on platform_payment_orders(portal_user_ref, created_at);
    create index if not exists platform_payment_orders_status_idx
      on platform_payment_orders(status, created_at);
    create index if not exists platform_payment_orders_plan_idx
      on platform_payment_orders(plan, ${driftPlanIndex ? "updated_at" : "created_at"});
  `);

  database.exec(`
    alter table platform_payment_orders add column checkout_expires_at text;
    alter table platform_payment_orders add column checkout_url_scheme text;
    alter table platform_payment_orders add column checkout_qr_code text;
    alter table platform_payment_orders add column refund_status text check (refund_status is null or refund_status in ('refund_requested', 'refund_approved', 'refund_pending_provider', 'refund_succeeded', 'refund_failed', 'refund_rejected'));
    alter table platform_payment_orders add column refund_requested_at text;
    alter table platform_payment_orders add column refund_approved_at text;
    alter table platform_payment_orders add column refund_amount_minor integer check (refund_amount_minor is null or refund_amount_minor >= 0);
    alter table platform_payment_orders add column refund_remaining_days integer check (refund_remaining_days is null or refund_remaining_days >= 0);
    alter table platform_payment_orders add column refund_reason_code text;
    alter table platform_payment_orders add column refund_provider_ref text;
    alter table platform_payment_orders add column refund_failed_reason text;
  `);
}

function seedLegacyPaymentOrder(database) {
  database.prepare(`
    insert into platform_payment_orders (
      order_ref, portal_user_ref, plan, plan_label, amount_minor, money,
      currency, duration_days, client_target, channel, status, provider,
      provider_order_ref, checkout_url, checkout_url_scheme, checkout_qr_code,
      checkout_expires_at, access_request_ref, access_request_status, paid_at,
      refund_status, refund_requested_at, refund_approved_at,
      refund_amount_minor, refund_remaining_days, refund_reason_code,
      refund_provider_ref, refund_failed_reason, created_at, updated_at
    ) values (
      'legacy_order_1', 'legacy_portal_user_1', 'monthly_basic',
      'Legacy monthly basic', 1000, '10.00', 'CNY', 30, 'clash',
      'alipay', 'pending_payment', 'legacy_provider', null, null, null, null,
      null, null, null, null, null, null, null, null, null, null, null, null,
      @now, @now
    )
  `).run({ now: NOW });
}

function schemaObjectExists(database, type, name) {
  return database.prepare(`
    select count(*) from sqlite_schema where type = ? and name = ?
  `).pluck().get(type, name) === 1;
}

function migrationCount(database) {
  return database.prepare(`
    select count(*) from platform_schema_migrations where migration_id = ?
  `).pluck().get(REQUIRED_PAYMENT_STORE_MIGRATION_ID);
}

function legacyArchiveMigrationRow(database) {
  return database.prepare(`
    select migration_id, ddl_checksum, applied_at
      from platform_schema_migrations
     where migration_id = ?
  `).get(LEGACY_ARCHIVE_MIGRATION_ID) ?? null;
}

function legacySchemaDigest(database) {
  const rows = database.prepare(`
    select type, name, coalesce(sql, '') as sql
      from sqlite_schema
     where tbl_name = 'platform_payment_orders'
     order by type, name
  `).all();
  const material = rows
    .map((row) => [row.type, row.name, row.sql].join("|"))
    .join("\n--object--\n");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function paymentSchemaSnapshot(database) {
  return database.prepare(`
    select type, name, tbl_name, coalesce(sql, '') as sql
      from sqlite_schema
     where name like 'platform_payment_%'
        or tbl_name like 'platform_payment_%'
     order by type, name
  `).all();
}

function assertLegacyPrestateUnchanged(database) {
  assert.equal(schemaObjectExists(
    database,
    "table",
    "platform_payment_orders",
  ), true);
  assert.equal(schemaObjectExists(database, "table", LEGACY_ARCHIVE_TABLE), false);
  assert.equal(migrationCount(database), 0);
  assert.equal(legacyArchiveMigrationRow(database), null);
}

function paymentTableNames(database) {
  return database.prepare(`
    select name
      from sqlite_master
     where type = 'table'
       and name like 'platform_payment_%'
     order by name
  `).pluck().all();
}

function seedOrder(database) {
  database.prepare("insert into platform_accounts (id) values (?)").run("account_1");
  database.prepare(`
    insert into platform_payment_orders (
      payment_order_ref, account_id, offer_ref, create_idempotency_key,
      create_request_digest, quote_version, expected_paid_coin_units,
      amount_minor, currency, currency_exponent, quote_digest, adapter_key,
      payment_method, merchant_binding_ref, status, latest_receipt_ref,
      wallet_operation_ref, wallet_lot_ref, provider_order_ref, expires_at,
      created_at, updated_at
    ) values (
      'payment_order_1', 'account_1', 'coins_30', 'portal_create_1',
      @digest, 1, 30, 100, 'USD', 2, @digest, 'paypal_v1', 'paypal',
      'paypal_sandbox_primary', 'created', null, null, null, null,
      '2026-08-01T00:10:00.000Z', @now, @now
    )
  `).run({ digest: "a".repeat(64), now: NOW });
}

function seedVerifiedReceipt(database) {
  database.prepare(`
    insert into platform_payment_receipts (
      receipt_ref, payment_order_ref, attempt_ref, provider_request_ref,
      receipt_type, canonical_state, charge_certainty, provider_order_ref,
      provider_capture_ref, provider_event_ref, event_dedupe_key,
      merchant_scope_digest, payload_digest, verification_result,
      amount_minor, currency, currency_exponent, expected_paid_coin_units,
      accepted_at
    ) values (
      'payment_receipt_1', 'payment_order_1', 'payment_attempt_1',
      'provider_request_1', 'callback', 'payment_succeeded', 'confirmed_charged',
      'provider_order_1', 'provider_capture_1', 'provider_event_1',
      'event_dedupe_1', @merchant, @payload, 'verified',
      100, 'USD', 2, 30, @now
    )
  `).run({
    merchant: "b".repeat(64),
    payload: "c".repeat(64),
    now: NOW,
  });
}

test("payment migration creates exactly the two durable payment tables", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    const result = applyPaymentStoreMigrations({
      database,
      nowFn: () => NOW,
    });
    assert.deepEqual(result, {
      applied: true,
      migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
    });
    assert.deepEqual(paymentTableNames(database), [
      "platform_payment_orders",
      "platform_payment_receipts",
    ]);
    assert.equal(validatePaymentStoreSchema({ database }), true);
    assert.deepEqual(database.pragma("quick_check"), [{ quick_check: "ok" }]);
    assert.deepEqual(database.pragma("foreign_key_check"), []);

    const inspection = inspectPaymentStoreSchema({ database });
    assert.equal(inspection.ready, true);
    assert.equal(inspection.migrationId, REQUIRED_PAYMENT_STORE_MIGRATION_ID);
    assert.equal(
      inspection.ddlChecksum,
      "2fa4a23a4bbf13b9ed831f21ff0c72df55d8671783fdaa6a0ff4ca2b41e4c23e",
    );
    assert.deepEqual(inspection.missingObjects, []);
    assert.deepEqual(inspection.driftedObjects, []);
  } finally {
    database.close();
  }
});

test("payment migration replays safely and rejects checksum drift", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    assert.equal(schemaObjectExists(database, "table", LEGACY_ARCHIVE_TABLE), false);
    assert.equal(legacyArchiveMigrationRow(database), null);
    assert.deepEqual(applyPaymentStoreMigrations({ database, nowFn: () => {
      throw new Error("clock_must_not_run_on_replay");
    } }), {
      applied: false,
      migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
    });

    database.prepare(`
      update platform_schema_migrations
         set ddl_checksum = ?
       where migration_id = ?
    `).run("0".repeat(64), REQUIRED_PAYMENT_STORE_MIGRATION_ID);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_migration_checksum_mismatch/u,
    );
  } finally {
    database.close();
  }
});

test("payment migration rolls back every DDL statement after a mid-migration failure", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    database.exec("create table platform_payment_receipts (conflict text)");
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_migration_failed/u,
    );
    assert.deepEqual(paymentTableNames(database), ["platform_payment_receipts"]);
    assert.equal(database.prepare(`
      select count(*) from platform_schema_migrations
       where migration_id = ?
    `).pluck().get(REQUIRED_PAYMENT_STORE_MIGRATION_ID), 0);
  } finally {
    database.close();
  }
});

test("payment schema blocks quote mutation, illegal state jumps, and receipt mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    seedOrder(database);
    seedVerifiedReceipt(database);

    assert.throws(() => database.prepare(`
      update platform_payment_orders
         set amount_minor = 200
       where payment_order_ref = 'payment_order_1'
    `).run(), /payment_order_quote_immutable/u);
    assert.throws(() => database.prepare(`
      update platform_payment_orders
         set status = 'credited'
       where payment_order_ref = 'payment_order_1'
    `).run(), /payment_order_status_transition/u);
    assert.throws(() => database.prepare(`
      update platform_payment_receipts
         set payload_digest = @digest
       where receipt_ref = 'payment_receipt_1'
    `).run({ digest: "d".repeat(64) }), /payment_receipt_fact_immutable/u);
    assert.throws(() => database.prepare(`
      delete from platform_payment_receipts
       where receipt_ref = 'payment_receipt_1'
    `).run(), /payment_receipt_fact_immutable/u);
  } finally {
    database.close();
  }
});

test("payment schema inspection detects structural drift", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    database.exec("drop index platform_payment_orders_account_created_idx");
    assert.equal(validatePaymentStoreSchema({ database }), false);
    const inspection = inspectPaymentStoreSchema({ database });
    assert.equal(inspection.ready, false);
    assert.deepEqual(inspection.missingObjects, [
      "index:platform_payment_orders_account_created_idx",
    ]);
  } finally {
    database.close();
  }
});

test("payment migration dry-run validates a disposable copy without changing source", async () => {
  await withTempDirectory("payment-store-migration-dry-run-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const database = new Database(dbPath);
    createFoundation(database);
    database.close();

    const before = new Database(dbPath, { readonly: true });
    assert.deepEqual(paymentTableNames(before), []);
    before.close();

    const result = await dryRunPaymentStoreMigrations({
      dbPath,
      tempRoot: directory,
      nowFn: () => NOW,
    });
    assert.equal(result.ready, true);
    assert.equal(result.migrationId, REQUIRED_PAYMENT_STORE_MIGRATION_ID);

    const after = new Database(dbPath, { readonly: true });
    assert.deepEqual(paymentTableNames(after), []);
    after.close();
  });
});

test("payment migration archives the exact legacy order table and preserves its rows and indexes", () => {
  const trace = [];
  const database = new Database(":memory:", {
    verbose: (sql) => trace.push(sql),
  });
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    assert.equal(
      legacySchemaDigest(database),
      "ef29761348be1089f851e9426bfde45cf2a9b55f2f67a95a27275468043ad4c6",
    );
    seedLegacyPaymentOrder(database);
    const beforeRows = database.prepare(
      "select * from platform_payment_orders order by order_ref",
    ).all();
    trace.length = 0;

    assert.deepEqual(applyPaymentStoreMigrations({
      database,
      nowFn: () => NOW,
    }), {
      applied: true,
      migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
    });
    assert.deepEqual(trace.filter((sql) => {
      const normalized = sql.replace(/\s+/gu, " ").trim().toLowerCase();
      return /^(?:select\b.*\bfrom\s+|insert\s+into\s+|update\s+|delete\s+from\s+)"?platform_payment_orders(?:_legacy_archive_20260803)?\b/u
        .test(normalized);
    }), []);

    assert.equal(schemaObjectExists(database, "table", LEGACY_ARCHIVE_TABLE), true);
    assert.deepEqual(database.prepare(
      `select * from ${LEGACY_ARCHIVE_TABLE} order by order_ref`,
    ).all(), beforeRows);
    assert.deepEqual(
      database.pragma(`index_list(${LEGACY_ARCHIVE_TABLE})`)
        .map((index) => index.name)
        .sort(),
      [
        "platform_payment_orders_plan_idx",
        "platform_payment_orders_portal_user_idx",
        "platform_payment_orders_status_idx",
        `sqlite_autoindex_${LEGACY_ARCHIVE_TABLE}_1`,
      ],
    );
    assert.equal(database.prepare(
      "select count(*) from platform_payment_orders",
    ).pluck().get(), 0);
    assert.equal(database.prepare(
      "select count(*) from platform_payment_receipts",
    ).pluck().get(), 0);
    assert.equal(migrationCount(database), 1);
    assert.deepEqual(legacyArchiveMigrationRow(database), {
      applied_at: NOW,
      ddl_checksum: LEGACY_ARCHIVE_MIGRATION_CHECKSUM,
      migration_id: LEGACY_ARCHIVE_MIGRATION_ID,
    });
    assert.equal(validatePaymentStoreSchema({ database }), true);
    assert.deepEqual(database.pragma("quick_check"), [{ quick_check: "ok" }]);
    assert.deepEqual(database.pragma("foreign_key_check"), []);
    assert.throws(() => database.prepare(
      `insert into ${LEGACY_ARCHIVE_TABLE} (order_ref) values ('blocked')`,
    ).run(), /legacy_payment_orders_archive_immutable/u);
    assert.throws(() => database.prepare(`
      update ${LEGACY_ARCHIVE_TABLE}
         set updated_at = updated_at
       where order_ref = 'legacy_order_1'
    `).run(), /legacy_payment_orders_archive_immutable/u);
    assert.throws(() => database.prepare(`
      delete from ${LEGACY_ARCHIVE_TABLE}
       where order_ref = 'legacy_order_1'
    `).run(), /legacy_payment_orders_archive_immutable/u);
  } finally {
    database.close();
  }
});

test("payment migration replays safely after archiving the legacy order table", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    const beforeReplay = {
      archiveRows: database.prepare(
        `select * from ${LEGACY_ARCHIVE_TABLE} order by order_ref`,
      ).all(),
      ledgerRows: database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         order by migration_id
      `).all(),
      schema: paymentSchemaSnapshot(database),
    };

    assert.deepEqual(applyPaymentStoreMigrations({
      database,
      nowFn: () => {
        throw new Error("clock_must_not_run_on_legacy_replay");
      },
    }), {
      applied: false,
      migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
    });
    assert.equal(database.prepare(
      `select count(*) from ${LEGACY_ARCHIVE_TABLE}`,
    ).pluck().get(), 1);
    assert.deepEqual({
      archiveRows: database.prepare(
        `select * from ${LEGACY_ARCHIVE_TABLE} order by order_ref`,
      ).all(),
      ledgerRows: database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         order by migration_id
      `).all(),
      schema: paymentSchemaSnapshot(database),
    }, beforeReplay);
  } finally {
    database.close();
  }
});

test("payment migration replay rejects a missing versioned legacy archive", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    database.exec(`drop table ${LEGACY_ARCHIVE_TABLE}`);

    assert.equal(inspectPaymentStoreSchema({ database }).ready, false);
    assert.equal(validatePaymentStoreSchema({ database }), false);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_not_ready/u,
    );
  } finally {
    database.close();
  }
});

test("payment migration replay rejects same-name no-op archive guard drift", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    database.exec(`
      drop trigger platform_payment_orders_legacy_archive_20260803_insert_immutable;
      create trigger platform_payment_orders_legacy_archive_20260803_insert_immutable
      before insert on ${LEGACY_ARCHIVE_TABLE}
      begin
        select 1;
      end
    `);

    assert.equal(inspectPaymentStoreSchema({ database }).ready, false);
    assert.equal(validatePaymentStoreSchema({ database }), false);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_not_ready/u,
    );
  } finally {
    database.close();
  }
});

test("payment migration replay rejects legacy archive migration checksum drift", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    database.prepare(`
      update platform_schema_migrations
         set ddl_checksum = ?
       where migration_id = ?
    `).run("0".repeat(64), LEGACY_ARCHIVE_MIGRATION_ID);

    assert.equal(inspectPaymentStoreSchema({ database }).ready, false);
    assert.equal(validatePaymentStoreSchema({ database }), false);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_checksum_mismatch/u,
    );
  } finally {
    database.close();
  }
});

test("payment migration rejects an orphaned legacy archive migration marker", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    database.prepare(`
      insert into platform_schema_migrations (
        migration_id, ddl_checksum, applied_at
      ) values (?, ?, ?)
    `).run(LEGACY_ARCHIVE_MIGRATION_ID, LEGACY_ARCHIVE_MIGRATION_CHECKSUM, NOW);

    assert.equal(inspectPaymentStoreSchema({ database }).ready, false);
    assert.equal(validatePaymentStoreSchema({ database }), false);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_not_ready/u,
    );
    assert.deepEqual(paymentTableNames(database), []);
    assert.equal(migrationCount(database), 0);
  } finally {
    database.close();
  }
});

test("payment migration rejects a legacy archive without the main migration marker", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    database.prepare(`
      delete from platform_schema_migrations where migration_id = ?
    `).run(REQUIRED_PAYMENT_STORE_MIGRATION_ID);

    assert.equal(inspectPaymentStoreSchema({ database }).ready, false);
    assert.equal(validatePaymentStoreSchema({ database }), false);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_not_ready/u,
    );
    assert.equal(database.prepare(
      `select count(*) from ${LEGACY_ARCHIVE_TABLE}`,
    ).pluck().get(), 1);
    assert.deepEqual(legacyArchiveMigrationRow(database), {
      applied_at: NOW,
      ddl_checksum: LEGACY_ARCHIVE_MIGRATION_CHECKSUM,
      migration_id: LEGACY_ARCHIVE_MIGRATION_ID,
    });
  } finally {
    database.close();
  }
});

test("payment migration rejects an unversioned legacy archive", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    applyPaymentStoreMigrations({ database, nowFn: () => NOW });
    database.prepare(`
      delete from platform_schema_migrations where migration_id = ?
    `).run(LEGACY_ARCHIVE_MIGRATION_ID);

    assert.equal(inspectPaymentStoreSchema({ database }).ready, false);
    assert.equal(validatePaymentStoreSchema({ database }), false);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_not_ready/u,
    );
    assert.equal(database.prepare(
      `select count(*) from ${LEGACY_ARCHIVE_TABLE}`,
    ).pluck().get(), 1);
  } finally {
    database.close();
  }
});

test("payment migration rechecks a concurrent ledger winner inside the immediate transaction", async () => {
  await withTempDirectory("payment-store-concurrent-ledger-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const primary = new Database(dbPath);
    const competing = new Database(dbPath);
    try {
      createFoundation(primary);
      let injected = false;
      const racingDatabase = {
        exec: primary.exec.bind(primary),
        pragma: primary.pragma.bind(primary),
        prepare: primary.prepare.bind(primary),
        transaction(callback) {
          if (!injected) {
            injected = true;
            applyPaymentStoreMigrations({
              database: competing,
              nowFn: () => NOW,
            });
          }
          return primary.transaction(callback);
        },
      };

      assert.deepEqual(applyPaymentStoreMigrations({
        database: racingDatabase,
        nowFn: () => "2026-08-01T00:00:01.000Z",
      }), {
        applied: false,
        migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
      });
      assert.equal(migrationCount(primary), 1);
      assert.equal(legacyArchiveMigrationRow(primary), null);
      assert.equal(validatePaymentStoreSchema({ database: primary }), true);
    } finally {
      competing.close();
      primary.close();
    }
  });
});

test("payment migration rechecks a concurrent legacy archive winner", async () => {
  await withTempDirectory("payment-store-concurrent-legacy-ledger-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const primary = new Database(dbPath);
    const competing = new Database(dbPath);
    try {
      createFoundation(primary);
      createLegacyPaymentOrdersSchema(primary);
      seedLegacyPaymentOrder(primary);
      let injected = false;
      const racingDatabase = {
        exec: primary.exec.bind(primary),
        pragma: primary.pragma.bind(primary),
        prepare: primary.prepare.bind(primary),
        transaction(callback) {
          if (!injected) {
            injected = true;
            applyPaymentStoreMigrations({
              database: competing,
              nowFn: () => NOW,
            });
          }
          return primary.transaction(callback);
        },
      };

      assert.deepEqual(applyPaymentStoreMigrations({
        database: racingDatabase,
        nowFn: () => "2026-08-01T00:00:01.000Z",
      }), {
        applied: false,
        migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
      });
      assert.equal(migrationCount(primary), 1);
      assert.deepEqual(legacyArchiveMigrationRow(primary), {
        applied_at: NOW,
        ddl_checksum: LEGACY_ARCHIVE_MIGRATION_CHECKSUM,
        migration_id: LEGACY_ARCHIVE_MIGRATION_ID,
      });
      assert.equal(primary.prepare(
        `select count(*) from ${LEGACY_ARCHIVE_TABLE}`,
      ).pluck().get(), 1);
      assert.equal(validatePaymentStoreSchema({ database: primary }), true);
    } finally {
      competing.close();
      primary.close();
    }
  });
});

test("payment migration rejects legacy table constraint drift without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database, { omitStatusConstraint: true });
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_schema_not_exact/u,
    );
    assertLegacyPrestateUnchanged(database);
  } finally {
    database.close();
  }
});

test("payment migration rejects same-name legacy index definition drift without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database, { driftPlanIndex: true });
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_schema_not_exact/u,
    );
    assertLegacyPrestateUnchanged(database);
  } finally {
    database.close();
  }
});

test("payment migration rejects external foreign-key dependencies without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    database.exec(`
      create table legacy_payment_order_links (
        id text primary key,
        order_ref text not null references "PLATFORM_PAYMENT_ORDERS"(order_ref)
      )
    `);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_dependencies_present/u,
    );
    assertLegacyPrestateUnchanged(database);
  } finally {
    database.close();
  }
});

test("payment migration rejects external trigger dependencies without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    database.exec(`
      create table legacy_payment_order_events (order_ref text not null);
      create trigger legacy_payment_order_event_writer
      after insert on legacy_payment_order_events
      begin
        update platform_payment_orders
           set updated_at = updated_at
         where order_ref = new.order_ref;
      end
    `);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_dependencies_present/u,
    );
    assertLegacyPrestateUnchanged(database);
  } finally {
    database.close();
  }
});

test("payment migration rejects temporary trigger dependencies without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    database.exec(`
      create temp trigger temp_legacy_payment_orders_dependency
      after update on platform_payment_orders
      begin
        select 1;
      end
    `);

    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_dependencies_present/u,
    );
    assertLegacyPrestateUnchanged(database);
    assert.equal(database.prepare(`
      select count(*)
        from sqlite_temp_schema
       where type = 'trigger'
         and name = 'temp_legacy_payment_orders_dependency'
         and sql like '%platform_payment_orders%'
    `).pluck().get(), 1);
  } finally {
    database.close();
  }
});

test("payment migration rejects external view dependencies without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    database.exec(`
      create view legacy_payment_order_summary as
      select order_ref, status from platform_payment_orders
    `);
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_dependencies_present/u,
    );
    assertLegacyPrestateUnchanged(database);
  } finally {
    database.close();
  }
});

test("payment migration rejects virtual-table dependencies without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    database.exec(`
      create virtual table legacy_payment_order_search using fts5(
        status,
        content='platform_payment_orders',
        content_rowid='rowid'
      )
    `);

    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_dependencies_present/u,
    );
    assertLegacyPrestateUnchanged(database);
    assert.equal(database.prepare(`
      select count(*)
        from sqlite_schema
       where type = 'table'
         and name = 'legacy_payment_order_search'
         and sql like '%platform_payment_orders%'
    `).pluck().get(), 1);
  } finally {
    database.close();
  }
});

test("payment migration rejects a pre-existing legacy archive target without mutation", () => {
  const database = new Database(":memory:");
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    database.exec(`create table ${LEGACY_ARCHIVE_TABLE} (conflict text)`);
    database.prepare(
      `insert into ${LEGACY_ARCHIVE_TABLE} (conflict) values (?)`,
    ).run("sentinel");
    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      /payment_store_legacy_archive_conflict/u,
    );
    assert.equal(schemaObjectExists(
      database,
      "table",
      "platform_payment_orders",
    ), true);
    assert.equal(migrationCount(database), 0);
    assert.equal(database.prepare(
      `select conflict from ${LEGACY_ARCHIVE_TABLE}`,
    ).pluck().get(), "sentinel");
  } finally {
    database.close();
  }
});

test("payment migration rolls the legacy rename back when new schema creation fails", () => {
  const trace = [];
  const database = new Database(":memory:", {
    verbose: (sql) => trace.push(sql),
  });
  try {
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    database.exec(`
      create trigger fail_original_payment_migration_ledger
      before insert on platform_schema_migrations
      when new.migration_id = '${REQUIRED_PAYMENT_STORE_MIGRATION_ID}'
      begin
        select raise(abort, 'synthetic_payment_migration_ledger_failure');
      end
    `);
    trace.length = 0;

    assert.throws(
      () => applyPaymentStoreMigrations({ database, nowFn: () => NOW }),
      (error) => error?.code === "payment_store_migration_failed",
    );
    assert.equal(trace.some((sql) => (
      /alter table platform_payment_orders\s+rename to/u.test(sql.toLowerCase())
    )), true);
    assertLegacyPrestateUnchanged(database);
    assert.equal(database.prepare(
      "select count(*) from platform_payment_orders",
    ).pluck().get(), 1);
    assert.equal(schemaObjectExists(database, "table", "platform_payment_receipts"), false);
  } finally {
    database.close();
  }
});

test("payment migration dry-run accepts the exact legacy schema without changing its source", async () => {
  await withTempDirectory("payment-store-legacy-dry-run-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const database = new Database(dbPath);
    createFoundation(database);
    createLegacyPaymentOrdersSchema(database);
    seedLegacyPaymentOrder(database);
    database.close();

    const result = await dryRunPaymentStoreMigrations({
      dbPath,
      tempRoot: directory,
      nowFn: () => NOW,
    });
    assert.equal(result.ready, true);

    const source = new Database(dbPath, { readonly: true });
    assert.equal(schemaObjectExists(
      source,
      "table",
      "platform_payment_orders",
    ), true);
    assert.equal(schemaObjectExists(source, "table", LEGACY_ARCHIVE_TABLE), false);
    assert.equal(
      legacySchemaDigest(source),
      "ef29761348be1089f851e9426bfde45cf2a9b55f2f67a95a27275468043ad4c6",
    );
    assert.equal(source.prepare(
      "select count(*) from platform_payment_orders",
    ).pluck().get(), 1);
    assert.equal(migrationCount(source), 0);
    source.close();
  });
});
