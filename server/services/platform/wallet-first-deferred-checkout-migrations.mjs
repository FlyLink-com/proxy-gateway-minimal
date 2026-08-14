import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import {
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import Database from "better-sqlite3";

import {
  DEFERRED_RESOURCE_TRANSITION_MIGRATIONS,
  REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID,
  validateDeferredResourceTransitionSchema
} from "./deferred-resource-transition-migrations.mjs";

export const REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID =
  "20260813_003_wallet_first_deferred_checkout_quotes";

export const WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE =
  "platform_wallet_first_deferred_checkout_quotes";

const QUOTE_ACCOUNT_STATUS_EXPIRY_INDEX =
  "platform_wallet_first_deferred_checkout_quotes_account_status_expiry_idx";
const QUOTE_TRANSITION_INDEX =
  "platform_wallet_first_deferred_checkout_quotes_transition_idx";
const SAFE_INTEGER_MAX = 9_007_199_254_740_991;
const OWNED_OBJECTS = Object.freeze([
  ["table", WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE],
  ["index", QUOTE_ACCOUNT_STATUS_EXPIRY_INDEX],
  ["index", QUOTE_TRANSITION_INDEX]
]);

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE} (
      quote_ref text primary key,
      account_id text not null references platform_accounts(id),
      deferred_order_ref text not null unique,
      offer_version_ref text not null
        references platform_coin_commerce_offer_versions(offer_version_ref),
      offer_snapshot_json text not null check (
        json_valid(offer_snapshot_json) and json_type(offer_snapshot_json) = 'object'
      ),
      wallet_version integer not null check (
        typeof(wallet_version) = 'integer'
        and wallet_version between 0 and ${SAFE_INTEGER_MAX}
      ),
      amount_units integer not null check (
        typeof(amount_units) = 'integer'
        and amount_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      applied_discount_basis_points integer not null check (
        typeof(applied_discount_basis_points) = 'integer'
        and applied_discount_basis_points between 0 and 10000
      ),
      purchase_availability text not null check (
        purchase_availability in ('available', 'insufficient_balance')
      ),
      shortfall_units integer not null check (
        typeof(shortfall_units) = 'integer'
        and shortfall_units between 0 and ${SAFE_INTEGER_MAX}
      ),
      allocation_json text not null check (
        json_valid(allocation_json) and json_type(allocation_json) = 'array'
      ),
      before_balance_json text not null check (
        json_valid(before_balance_json) and json_type(before_balance_json) = 'object'
      ),
      after_balance_json text not null check (
        json_valid(after_balance_json) and json_type(after_balance_json) = 'object'
      ),
      flow_kind text not null check (
        flow_kind in ('initial_activation', 'scheduled_switch')
      ),
      scheduled_for text not null,
      expected_entitlement_id text references platform_entitlements(id),
      expected_request_id text references platform_issuance_requests(id),
      expected_issued_link_id text references platform_issued_subscription_links(id),
      expected_valid_until text,
      status text not null check (
        status in ('active', 'reserved', 'expired', 'stale')
      ),
      transition_ref text unique
        references platform_deferred_resource_transitions(transition_ref),
      reserve_actor_scope text,
      reserve_idempotency_key text,
      reserve_actor_type text,
      reserve_actor_ref text,
      created_at text not null,
      expires_at text not null,
      reserved_at text,
      check (
        (
          flow_kind = 'initial_activation'
          and expected_entitlement_id is null
          and expected_request_id is null
          and expected_issued_link_id is null
          and expected_valid_until is null
        )
        or
        (
          flow_kind = 'scheduled_switch'
          and expected_entitlement_id is not null
          and expected_request_id is not null
          and expected_issued_link_id is not null
          and expected_valid_until is not null
          and scheduled_for = expected_valid_until
        )
      ),
      check (
        (
          purchase_availability = 'available'
          and shortfall_units = 0
        )
        or
        (
          purchase_availability = 'insufficient_balance'
          and shortfall_units > 0
          and json_array_length(allocation_json) = 0
          and json(before_balance_json) = json(after_balance_json)
        )
      ),
      check (
        (
          status = 'active'
          and transition_ref is null
          and reserve_actor_scope is null
          and reserve_idempotency_key is null
          and reserve_actor_type is null
          and reserve_actor_ref is null
          and reserved_at is null
        )
        or
        (
          status = 'reserved'
          and transition_ref is not null
          and reserve_actor_scope is not null
          and reserve_idempotency_key is not null
          and reserve_actor_type is not null
          and reserve_actor_ref is not null
          and reserved_at is not null
        )
        or
        (
          status in ('expired', 'stale')
          and transition_ref is null
          and reserve_actor_scope is null
          and reserve_idempotency_key is null
          and reserve_actor_type is null
          and reserve_actor_ref is null
          and reserved_at is null
        )
      )
    )
  `,
  `
    create index ${QUOTE_ACCOUNT_STATUS_EXPIRY_INDEX}
      on ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}(
        account_id, status, expires_at, quote_ref
      )
  `,
  `
    create index ${QUOTE_TRANSITION_INDEX}
      on ${WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE}(transition_ref)
      where transition_ref is not null
  `
]);

function normalizeSql(sql) {
  return String(sql ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const DDL_CHECKSUM = createHash("sha256")
  .update(MIGRATION_STATEMENTS.map(normalizeSql).join("\n"), "utf8")
  .digest("hex");

export const WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS = Object.freeze([
  Object.freeze({
    migrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM,
    statements: MIGRATION_STATEMENTS
  })
]);

function migrationError(code) {
  const error = new Error("Wallet-first deferred checkout schema operation rejected");
  error.code = code;
  return error;
}

function assertDatabasePath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw migrationError("invalid_migration_contract");
  }
}

function migrationRow(database) {
  return database.prepare(`
    select migration_id, ddl_checksum
      from platform_schema_migrations
     where migration_id = ?
  `).get(REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID) ?? null;
}

function namedObject(database, name) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from sqlite_master
     where name = ?
  `).get(name) ?? null;
}

function expectedSqlFor(name) {
  if (name === WALLET_FIRST_DEFERRED_CHECKOUT_QUOTES_TABLE) return MIGRATION_STATEMENTS[0];
  if (name === QUOTE_ACCOUNT_STATUS_EXPIRY_INDEX) return MIGRATION_STATEMENTS[1];
  if (name === QUOTE_TRANSITION_INDEX) return MIGRATION_STATEMENTS[2];
  return null;
}

function ownedObjectsExact(database) {
  return OWNED_OBJECTS.every(([type, name]) => {
    const row = namedObject(database, name);
    return row
      && row.type === type
      && normalizeSql(row.sql) === normalizeSql(expectedSqlFor(name));
  });
}

function exactDeferredDependency(database) {
  const required = DEFERRED_RESOURCE_TRANSITION_MIGRATIONS[0];
  const row = database.prepare(`
    select ddl_checksum from platform_schema_migrations where migration_id = ?
  `).get(REQUIRED_DEFERRED_RESOURCE_TRANSITION_MIGRATION_ID);
  return row?.ddl_checksum === required.ddlChecksum
    && validateDeferredResourceTransitionSchema({ database }).ok === true;
}

function integrity(database) {
  try {
    const quick = database.pragma("quick_check");
    return {
      quickCheck: quick.length === 1 && Object.values(quick[0])[0] === "ok",
      foreignKeys: database.pragma("foreign_key_check").length === 0
    };
  } catch {
    return { quickCheck: false, foreignKeys: false };
  }
}

function closedInspection(database) {
  const dependency = exactDeferredDependency(database);
  const row = dependency ? migrationRow(database) : null;
  const present = OWNED_OBJECTS.filter(([, name]) => namedObject(database, name));
  const checks = {
    deferredTransitionDependency: dependency,
    schemaExact: row?.ddl_checksum === DDL_CHECKSUM && ownedObjectsExact(database),
    ...integrity(database)
  };
  const reasonCodes = [];
  if (!dependency) reasonCodes.push("migration_dependency_missing");
  else if (!row && present.length === 0) reasonCodes.push("required_migration_missing");
  else if (!row) reasonCodes.push("owned_object_without_migration");
  else if (row.ddl_checksum !== DDL_CHECKSUM) reasonCodes.push("migration_checksum_mismatch");
  else if (!checks.schemaExact) reasonCodes.push(
    present.length !== OWNED_OBJECTS.length ? "owned_object_missing" : "owned_object_incompatible"
  );
  if (!checks.quickCheck) reasonCodes.push("quick_check_failed");
  if (!checks.foreignKeys) reasonCodes.push("foreign_key_check_failed");
  const pending = dependency && reasonCodes.length === 1
    && reasonCodes[0] === "required_migration_missing";
  const ok = dependency && checks.schemaExact && checks.quickCheck && checks.foreignKeys
    && reasonCodes.length === 0;
  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    checks,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    pendingMigrationIds: pending
      ? [REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID]
      : []
  };
}

export function inspectWalletFirstDeferredCheckoutSchema({ database } = {}) {
  if (!database || typeof database.prepare !== "function" || typeof database.pragma !== "function") {
    throw migrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

export function validateWalletFirstDeferredCheckoutSchema({ dbPath, database } = {}) {
  if (database) return inspectWalletFirstDeferredCheckoutSchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectWalletFirstDeferredCheckoutSchema({ database: owned });
  } catch (error) {
    const code = error?.code === "SQLITE_NOTADB"
      ? "database_invalid"
      : existsSync(dbPath) ? "database_inspection_failed" : "database_missing";
    return {
      ok: false,
      schemaState: "blocked",
      requiredMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
      checks: {
        deferredTransitionDependency: false,
        schemaExact: false,
        quickCheck: false,
        foreignKeys: false
      },
      reasonCodes: [code],
      pendingMigrationIds: []
    };
  } finally {
    owned?.close();
  }
}

function assertApplyArguments({ expectedMigrationId, expectedDdlChecksum, nowFn }) {
  if (expectedMigrationId !== REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID) {
    throw migrationError("migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw migrationError("migration_checksum_mismatch");
  }
  if (typeof nowFn !== "function") throw migrationError("invalid_migration_contract");
}

function applyOn(database, nowFn) {
  database.pragma("foreign_keys = ON");
  return database.transaction(() => {
    if (!exactDeferredDependency(database)) throw migrationError("migration_dependency_missing");
    const existing = migrationRow(database);
    if (existing) {
      if (existing.ddl_checksum !== DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch");
      }
      if (!inspectWalletFirstDeferredCheckoutSchema({ database }).ok) {
        throw migrationError("applied_schema_incompatible");
      }
      return [];
    }
    if (OWNED_OBJECTS.some(([, name]) => namedObject(database, name))) {
      throw migrationError("owned_object_without_migration");
    }
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    const occurredAt = nowFn();
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw migrationError("invalid_migration_contract");
    }
    database.prepare(`
      insert into platform_schema_migrations(migration_id, ddl_checksum, applied_at)
      values (?, ?, ?)
    `).run(REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID, DDL_CHECKSUM, occurredAt.toISOString());
    if (!inspectWalletFirstDeferredCheckoutSchema({ database }).ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return [REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID];
  }).immediate();
}

export function applyWalletFirstDeferredCheckoutMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  assertApplyArguments({ expectedMigrationId, expectedDdlChecksum, nowFn });
  if (!database) assertDatabasePath(dbPath);
  let owned;
  try {
    const connection = database ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const appliedMigrationIds = applyOn(connection, nowFn);
    const inspection = inspectWalletFirstDeferredCheckoutSchema({ database: connection });
    if (!inspection.ok) throw migrationError("applied_schema_incompatible");
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length === 1,
      appliedMigrationIds
    };
  } finally {
    owned?.close();
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function removeOwnedDirectory(directory, root) {
  const child = relative(resolve(root), resolve(directory));
  if (child.length === 0 || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw migrationError("invalid_temp_root");
  }
  rmSync(directory, { recursive: true, force: true });
}

export async function dryRunWalletFirstDeferredCheckoutMigrations({ dbPath, tempRoot } = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) throw migrationError("invalid_temp_root");
  let directory;
  let source;
  try {
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, "wallet-first-deferred-checkout-dry-run-"));
    const snapshot = join(directory, "snapshot.sqlite");
    const sourceHash = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    const before = inspectWalletFirstDeferredCheckoutSchema({ database: source });
    await source.backup(snapshot);
    const applied = applyWalletFirstDeferredCheckoutMigrations({
      dbPath: snapshot,
      expectedMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateWalletFirstDeferredCheckoutSchema({ dbPath: snapshot });
    if (!validated.ok || sha256File(dbPath) !== sourceHash) {
      throw migrationError("source_changed_during_dry_run");
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: before.ok
        ? []
        : [REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } finally {
    source?.close();
    if (directory) removeOwnedDirectory(directory, root);
  }
}
