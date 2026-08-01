import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import Database from "better-sqlite3";

export const REQUIRED_PAYMENT_STORE_MIGRATION_ID =
  "20260801_001_payment_integration_closure";

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_payment_orders (
      payment_order_ref text primary key,
      account_id text not null references platform_accounts(id),
      offer_ref text not null,
      create_idempotency_key text not null,
      create_request_digest text not null check (length(create_request_digest) = 64),
      quote_version integer not null check (typeof(quote_version) = 'integer' and quote_version > 0),
      expected_paid_coin_units integer not null
        check (typeof(expected_paid_coin_units) = 'integer' and expected_paid_coin_units > 0),
      amount_minor integer not null
        check (typeof(amount_minor) = 'integer' and amount_minor > 0),
      currency text not null
        check (length(currency) = 3 and currency = upper(currency)),
      currency_exponent integer not null
        check (typeof(currency_exponent) = 'integer' and currency_exponent between 0 and 9),
      quote_digest text not null check (length(quote_digest) = 64),
      adapter_key text not null,
      payment_method text not null,
      merchant_binding_ref text not null,
      status text not null check (
        status in (
          'created',
          'entry_ready',
          'pending',
          'payment_verified',
          'credited',
          'failed_no_charge',
          'reconciliation_required',
          'expired'
        )
      ),
      latest_receipt_ref text,
      wallet_operation_ref text,
      wallet_lot_ref text,
      provider_order_ref text,
      expires_at text not null,
      created_at text not null,
      updated_at text not null,
      unique (account_id, create_idempotency_key),
      check (
        status <> 'credited'
        or (
          latest_receipt_ref is not null
          and wallet_operation_ref is not null
          and wallet_lot_ref is not null
          and provider_order_ref is not null
        )
      )
    )
  `,
  `
    create table platform_payment_receipts (
      receipt_ref text primary key,
      payment_order_ref text not null
        references platform_payment_orders(payment_order_ref),
      attempt_ref text not null,
      provider_request_ref text not null,
      receipt_type text not null
        check (receipt_type in ('create', 'query', 'capture', 'callback')),
      canonical_state text not null check (
        canonical_state in (
          'entry_ready',
          'pending',
          'payment_succeeded',
          'failed_no_charge',
          'reconciliation_required'
        )
      ),
      provider_order_ref text,
      provider_capture_ref text,
      provider_event_ref text,
      event_dedupe_key text,
      merchant_scope_digest text,
      payload_digest text,
      verification_result text not null
        check (verification_result in ('not_applicable', 'verified')),
      amount_minor integer not null
        check (typeof(amount_minor) = 'integer' and amount_minor > 0),
      currency text not null
        check (length(currency) = 3 and currency = upper(currency)),
      currency_exponent integer not null
        check (typeof(currency_exponent) = 'integer' and currency_exponent between 0 and 9),
      expected_paid_coin_units integer not null
        check (typeof(expected_paid_coin_units) = 'integer' and expected_paid_coin_units > 0),
      accepted_at text not null,
      unique (provider_request_ref, receipt_type),
      unique (merchant_scope_digest, event_dedupe_key),
      check (
        (
          verification_result = 'not_applicable'
          and event_dedupe_key is null
          and merchant_scope_digest is null
          and payload_digest is null
        )
        or
        (
          verification_result = 'verified'
          and canonical_state = 'payment_succeeded'
          and provider_order_ref is not null
          and provider_capture_ref is not null
          and event_dedupe_key is not null
          and length(merchant_scope_digest) = 64
          and length(payload_digest) = 64
        )
      )
    )
  `,
  `
    create index platform_payment_orders_account_created_idx
      on platform_payment_orders (account_id, created_at desc, payment_order_ref desc)
  `,
  `
    create index platform_payment_receipts_order_accepted_idx
      on platform_payment_receipts (payment_order_ref, accepted_at, receipt_ref)
  `,
  `
    create trigger platform_payment_orders_quote_immutable
    before update of
      account_id,
      offer_ref,
      create_idempotency_key,
      create_request_digest,
      quote_version,
      expected_paid_coin_units,
      amount_minor,
      currency,
      currency_exponent,
      quote_digest,
      adapter_key,
      payment_method,
      merchant_binding_ref,
      expires_at,
      created_at
    on platform_payment_orders
    begin
      select raise(abort, 'payment_order_quote_immutable');
    end
  `,
  `
    create trigger platform_payment_orders_status_transition
    before update of status on platform_payment_orders
    when new.status <> old.status
    begin
      select case
        when old.status = 'created'
          and new.status in (
            'entry_ready', 'pending', 'failed_no_charge',
            'reconciliation_required', 'expired'
          ) then null
        when old.status = 'entry_ready'
          and new.status in (
            'pending', 'payment_verified', 'failed_no_charge',
            'reconciliation_required', 'expired'
          ) then null
        when old.status = 'pending'
          and new.status in (
            'payment_verified', 'failed_no_charge',
            'reconciliation_required', 'expired'
          ) then null
        when old.status = 'payment_verified'
          and new.status in ('credited', 'reconciliation_required') then null
        when old.status = 'credited'
          and new.status = 'reconciliation_required' then null
        else raise(abort, 'payment_order_status_transition')
      end;
    end
  `,
  `
    create trigger platform_payment_receipts_fact_immutable_update
    before update on platform_payment_receipts
    begin
      select raise(abort, 'payment_receipt_fact_immutable');
    end
  `,
  `
    create trigger platform_payment_receipts_fact_immutable_delete
    before delete on platform_payment_receipts
    begin
      select raise(abort, 'payment_receipt_fact_immutable');
    end
  `,
]);

const DDL_CHECKSUM = createHash("sha256")
  .update(MIGRATION_STATEMENTS.join("\n-- statement --\n"), "utf8")
  .digest("hex");

const EXPECTED_COLUMNS = Object.freeze({
  platform_payment_orders: Object.freeze([
    ["payment_order_ref", "TEXT", 0, 1],
    ["account_id", "TEXT", 1, 0],
    ["offer_ref", "TEXT", 1, 0],
    ["create_idempotency_key", "TEXT", 1, 0],
    ["create_request_digest", "TEXT", 1, 0],
    ["quote_version", "INTEGER", 1, 0],
    ["expected_paid_coin_units", "INTEGER", 1, 0],
    ["amount_minor", "INTEGER", 1, 0],
    ["currency", "TEXT", 1, 0],
    ["currency_exponent", "INTEGER", 1, 0],
    ["quote_digest", "TEXT", 1, 0],
    ["adapter_key", "TEXT", 1, 0],
    ["payment_method", "TEXT", 1, 0],
    ["merchant_binding_ref", "TEXT", 1, 0],
    ["status", "TEXT", 1, 0],
    ["latest_receipt_ref", "TEXT", 0, 0],
    ["wallet_operation_ref", "TEXT", 0, 0],
    ["wallet_lot_ref", "TEXT", 0, 0],
    ["provider_order_ref", "TEXT", 0, 0],
    ["expires_at", "TEXT", 1, 0],
    ["created_at", "TEXT", 1, 0],
    ["updated_at", "TEXT", 1, 0],
  ]),
  platform_payment_receipts: Object.freeze([
    ["receipt_ref", "TEXT", 0, 1],
    ["payment_order_ref", "TEXT", 1, 0],
    ["attempt_ref", "TEXT", 1, 0],
    ["provider_request_ref", "TEXT", 1, 0],
    ["receipt_type", "TEXT", 1, 0],
    ["canonical_state", "TEXT", 1, 0],
    ["provider_order_ref", "TEXT", 0, 0],
    ["provider_capture_ref", "TEXT", 0, 0],
    ["provider_event_ref", "TEXT", 0, 0],
    ["event_dedupe_key", "TEXT", 0, 0],
    ["merchant_scope_digest", "TEXT", 0, 0],
    ["payload_digest", "TEXT", 0, 0],
    ["verification_result", "TEXT", 1, 0],
    ["amount_minor", "INTEGER", 1, 0],
    ["currency", "TEXT", 1, 0],
    ["currency_exponent", "INTEGER", 1, 0],
    ["expected_paid_coin_units", "INTEGER", 1, 0],
    ["accepted_at", "TEXT", 1, 0],
  ]),
});

const EXPECTED_INDEXES = Object.freeze({
  platform_payment_orders_account_created_idx: Object.freeze({
    table: "platform_payment_orders",
    unique: 0,
    columns: Object.freeze(["account_id", "created_at", "payment_order_ref"]),
  }),
  platform_payment_receipts_order_accepted_idx: Object.freeze({
    table: "platform_payment_receipts",
    unique: 0,
    columns: Object.freeze(["payment_order_ref", "accepted_at", "receipt_ref"]),
  }),
});

const EXPECTED_TRIGGERS = Object.freeze([
  "platform_payment_orders_quote_immutable",
  "platform_payment_orders_status_transition",
  "platform_payment_receipts_fact_immutable_update",
  "platform_payment_receipts_fact_immutable_delete",
]);

function migrationError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause !== undefined) {
    Object.defineProperty(error, "cause", {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
  return error;
}

function assertDatabase(database) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.exec !== "function"
    || typeof database.transaction !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw migrationError("invalid_payment_store_migration_options");
  }
  return database;
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") {
    throw migrationError("invalid_payment_store_migration_timestamp");
  }
  try {
    if (new Date(value).toISOString() !== value) {
      throw migrationError("invalid_payment_store_migration_timestamp");
    }
  } catch (error) {
    if (error?.code === "invalid_payment_store_migration_timestamp") throw error;
    throw migrationError("invalid_payment_store_migration_timestamp");
  }
  return value;
}

function migrationRow(database) {
  try {
    return database.prepare(`
      select migration_id, ddl_checksum, applied_at
        from platform_schema_migrations
       where migration_id = ?
    `).get(REQUIRED_PAYMENT_STORE_MIGRATION_ID) ?? null;
  } catch {
    throw migrationError("payment_store_migration_prerequisite_missing");
  }
}

function objectExists(database, type, name) {
  return database.prepare(`
    select count(*)
      from sqlite_master
     where type = ? and name = ?
  `).pluck().get(type, name) === 1;
}

function columnsMatch(database, table, expected) {
  try {
    const actual = database.pragma(`table_info(${table})`).map((column) => [
      column.name,
      String(column.type).toUpperCase(),
      column.notnull,
      column.pk,
    ]);
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function indexMatches(database, name, expected) {
  try {
    const listed = database.pragma(`index_list(${expected.table})`)
      .find((index) => index.name === name);
    if (!listed || listed.unique !== expected.unique) return false;
    const columns = database.pragma(`index_info(${name})`).map((row) => row.name);
    return JSON.stringify(columns) === JSON.stringify(expected.columns);
  } catch {
    return false;
  }
}

export function inspectPaymentStoreSchema({ database } = {}) {
  const db = assertDatabase(database);
  const missingObjects = [];
  const driftedObjects = [];
  let row = null;
  try {
    row = migrationRow(db);
  } catch {
    missingObjects.push("table:platform_schema_migrations");
  }
  if (row === null && !missingObjects.includes("table:platform_schema_migrations")) {
    missingObjects.push(`migration:${REQUIRED_PAYMENT_STORE_MIGRATION_ID}`);
  } else if (row !== null && row.ddl_checksum !== DDL_CHECKSUM) {
    driftedObjects.push(`migration:${REQUIRED_PAYMENT_STORE_MIGRATION_ID}`);
  }

  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    if (!objectExists(db, "table", table)) {
      missingObjects.push(`table:${table}`);
    } else if (!columnsMatch(db, table, columns)) {
      driftedObjects.push(`table:${table}`);
    }
  }
  for (const [name, expected] of Object.entries(EXPECTED_INDEXES)) {
    if (!objectExists(db, "index", name)) {
      missingObjects.push(`index:${name}`);
    } else if (!indexMatches(db, name, expected)) {
      driftedObjects.push(`index:${name}`);
    }
  }
  for (const name of EXPECTED_TRIGGERS) {
    if (!objectExists(db, "trigger", name)) {
      missingObjects.push(`trigger:${name}`);
    }
  }
  return Object.freeze({
    ready: missingObjects.length === 0 && driftedObjects.length === 0,
    migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM,
    appliedAt: row?.applied_at ?? null,
    missingObjects: Object.freeze(missingObjects),
    driftedObjects: Object.freeze(driftedObjects),
  });
}

export function validatePaymentStoreSchema({ database } = {}) {
  try {
    const inspection = inspectPaymentStoreSchema({ database });
    if (!inspection.ready) return false;
    return (
      database.pragma("quick_check").length === 1
      && database.pragma("quick_check")[0]?.quick_check === "ok"
      && database.pragma("foreign_key_check").length === 0
    );
  } catch {
    return false;
  }
}

export function applyPaymentStoreMigrations({
  database,
  nowFn = () => new Date().toISOString(),
} = {}) {
  const db = assertDatabase(database);
  if (typeof nowFn !== "function") {
    throw migrationError("invalid_payment_store_migration_options");
  }
  const existing = migrationRow(db);
  if (existing !== null) {
    if (existing.ddl_checksum !== DDL_CHECKSUM) {
      throw migrationError("payment_store_migration_checksum_mismatch");
    }
    if (!validatePaymentStoreSchema({ database: db })) {
      throw migrationError("payment_store_schema_not_ready");
    }
    return Object.freeze({
      applied: false,
      migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
    });
  }

  let appliedAt;
  try {
    appliedAt = normalizeTimestamp(nowFn());
  } catch (error) {
    if (error?.code) throw error;
    throw migrationError("invalid_payment_store_migration_timestamp");
  }
  const migrate = db.transaction(() => {
    for (const statement of MIGRATION_STATEMENTS) db.exec(statement);
    db.prepare(`
      insert into platform_schema_migrations (
        migration_id, ddl_checksum, applied_at
      ) values (?, ?, ?)
    `).run(REQUIRED_PAYMENT_STORE_MIGRATION_ID, DDL_CHECKSUM, appliedAt);
  });
  try {
    migrate.immediate();
  } catch (error) {
    throw migrationError("payment_store_migration_failed", error);
  }
  if (!validatePaymentStoreSchema({ database: db })) {
    throw migrationError("payment_store_schema_not_ready");
  }
  return Object.freeze({
    applied: true,
    migrationId: REQUIRED_PAYMENT_STORE_MIGRATION_ID,
  });
}

export async function dryRunPaymentStoreMigrations({
  dbPath,
  tempRoot,
  nowFn = () => new Date().toISOString(),
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw migrationError("invalid_payment_store_migration_options");
  }
  if (!isAbsolute(dbPath)) {
    throw migrationError("invalid_payment_store_migration_options");
  }
  const sourcePath = resolve(dbPath);
  const root = tempRoot === undefined ? dirname(sourcePath) : resolve(tempRoot);
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "payment-store-dry-run-"));
  const candidatePath = join(directory, "candidate.sqlite");
  let source;
  let candidate;
  try {
    source = new Database(sourcePath, { fileMustExist: true, readonly: true });
    await source.backup(candidatePath);
    source.close();
    source = null;
    candidate = new Database(candidatePath);
    candidate.pragma("foreign_keys = on");
    applyPaymentStoreMigrations({ database: candidate, nowFn });
    const inspection = inspectPaymentStoreSchema({ database: candidate });
    if (!inspection.ready || !validatePaymentStoreSchema({ database: candidate })) {
      throw migrationError("payment_store_schema_not_ready");
    }
    return inspection;
  } finally {
    try {
      candidate?.close();
    } catch {
      // The disposable directory is removed below.
    }
    try {
      source?.close();
    } catch {
      // The source was opened read-only and receives no mutation.
    }
    rmSync(directory, { force: true, recursive: true });
  }
}
