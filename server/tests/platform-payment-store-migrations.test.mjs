import assert from "node:assert/strict";
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
