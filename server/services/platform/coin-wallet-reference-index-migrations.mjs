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
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  inspectCoinWalletSchema
} from "./coin-wallet-migrations.mjs";

export const REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID =
  "20260730_001_coin_wallet_reference_indexes";

const MIGRATION_STATEMENTS = Object.freeze([
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
]);

function normalizeSql(sql) {
  const source = String(sql);
  const literals = [];
  let protectedSql = "";
  for (let index = 0; index < source.length;) {
    if (source[index] !== "'") {
      protectedSql += source[index];
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] !== "'") {
        index += 1;
        continue;
      }
      if (source[index + 1] === "'") {
        index += 2;
        continue;
      }
      index += 1;
      break;
    }
    const token = `\0${literals.length}\0`;
    literals.push(source.slice(start, index));
    protectedSql += token;
  }
  return protectedSql
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=+>])\s*/g, "$1")
    .toLowerCase()
    .replace(/\0(\d+)\0/g, (_match, index) => literals[Number(index)]);
}

const EXPECTED_INDEXES = Object.freeze({
  platform_coin_hold_allocations_lot_ref_idx: {
    table: "platform_coin_hold_allocations",
    columns: ["lot_ref"],
    unique: 0,
    partial: 0
  },
  platform_coin_ledger_entries_lot_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["lot_ref"],
    unique: 0,
    partial: 0
  },
  platform_coin_ledger_entries_hold_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["hold_ref"],
    unique: 0,
    partial: 0
  }
});

const EXPECTED_INDEX_SQL = new Map(
  Object.keys(EXPECTED_INDEXES).map((name, index) => [
    name,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const EXPECTED_LEDGER_SQL = normalizeSql(`
  create table platform_schema_migrations (
    migration_id text primary key,
    ddl_checksum text not null,
    applied_at text not null
  )
`);

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_WALLET_REFERENCE_INDEX_DDL:v1\0${
      MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");

export const COIN_WALLET_REFERENCE_INDEX_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);

const SAFE_INSPECTION_REASONS = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable",
  "foreign_key_check_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_ledger_incompatible",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "quick_check_failed",
  "required_migration_missing"
]);

const KNOWN_ERROR_CODES = new Set([
  "applied_schema_incompatible",
  "database_close_failed",
  "database_unavailable",
  "invalid_database_path",
  "invalid_migration_contract",
  "invalid_temp_root",
  "migration_apply_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
  "owned_object_without_migration",
  "source_changed_during_dry_run"
]);

function migrationError(code) {
  const error = new Error("Coin wallet reference-index schema rejected");
  error.code = code;
  return error;
}

function closedOperationError(error) {
  if (KNOWN_ERROR_CODES.has(error?.code)) return error;
  if (/^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(error?.code ?? "")) {
    return migrationError("database_unavailable");
  }
  return migrationError("migration_apply_failed");
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw migrationError("invalid_database_path");
  }
}

function objectRow(database, type, name) {
  return database.prepare(
    "select type, name, tbl_name, sql from sqlite_master"
      + " where type = ? and name = ? collate nocase"
  ).get(type, name) ?? null;
}

function namedObjectRow(database, name) {
  return database.prepare(
    "select type, name, tbl_name, sql from sqlite_master"
      + " where name = ? collate nocase"
  ).get(name) ?? null;
}

function migrationRow(database, migrationId) {
  return database.prepare(`
    select migration_id, ddl_checksum
      from platform_schema_migrations
     where migration_id = ?
  `).get(migrationId) ?? null;
}

function migrationLedgerState(database) {
  const row = objectRow(database, "table", "platform_schema_migrations");
  if (!row) return "missing";
  return normalizeSql(row.sql) === EXPECTED_LEDGER_SQL
    ? "compatible"
    : "incompatible";
}

function foundationDependencyIsExact(database) {
  try {
    const row = migrationRow(database, REQUIRED_COIN_WALLET_MIGRATION_ID);
    return row?.ddl_checksum === COIN_WALLET_MIGRATIONS[0].ddlChecksum
      && inspectCoinWalletSchema({ database }).ok;
  } catch {
    return false;
  }
}

function ownedIndexIsExact(database, name) {
  const expected = EXPECTED_INDEXES[name];
  const row = objectRow(database, "index", name);
  if (
    !row
    || row.name !== name
    || row.tbl_name !== expected.table
    || normalizeSql(row.sql) !== EXPECTED_INDEX_SQL.get(name)
  ) {
    return false;
  }
  const listed = database.pragma(`index_list(${expected.table})`)
    .find((candidate) => candidate.name === name);
  const columns = database.pragma(`index_info(${name})`)
    .map(({ name: column }) => column);
  return listed?.unique === expected.unique
    && listed.partial === expected.partial
    && JSON.stringify(columns) === JSON.stringify(expected.columns);
}

function integrityChecks(database) {
  try {
    const quickRows = database.pragma("quick_check");
    const foreignKeyViolations = database.pragma("foreign_key_check").length;
    return {
      quickCheck:
        quickRows.length === 1
        && Object.values(quickRows[0])[0] === "ok",
      foreignKeyViolations,
      integrityError: false
    };
  } catch {
    return {
      quickCheck: false,
      foreignKeyViolations: 0,
      integrityError: true
    };
  }
}

function closedInspection(database) {
  const reasons = [];
  const ledgerState = migrationLedgerState(database);
  const foundationDependency =
    ledgerState === "compatible"
    && foundationDependencyIsExact(database);
  let migrationRows = 0;
  let successorRow = null;
  if (ledgerState === "compatible") {
    migrationRows = database.prepare(
      "select count(*) from platform_schema_migrations"
    ).pluck().get();
    successorRow = migrationRow(
      database,
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    );
  } else if (ledgerState === "incompatible") {
    reasons.push("migration_ledger_incompatible");
  }
  const presentTargetNames = Object.keys(EXPECTED_INDEXES)
    .filter((name) => namedObjectRow(database, name));
  const presentIndexes = Object.keys(EXPECTED_INDEXES)
    .filter((name) => objectRow(database, "index", name));

  if (!foundationDependency && ledgerState !== "incompatible") {
    reasons.push("migration_dependency_missing");
  }
  if (
    foundationDependency
    && !successorRow
    && presentTargetNames.length === 0
  ) {
    reasons.push("required_migration_missing");
  } else if (foundationDependency && !successorRow) {
    reasons.push("owned_object_without_migration");
  } else if (
    foundationDependency
    && successorRow.ddl_checksum !== DDL_CHECKSUM
  ) {
    reasons.push("migration_checksum_mismatch");
  } else if (foundationDependency) {
    for (const name of Object.keys(EXPECTED_INDEXES)) {
      if (!namedObjectRow(database, name)) {
        reasons.push("owned_object_missing");
      } else if (!ownedIndexIsExact(database, name)) {
        reasons.push("owned_object_incompatible");
      }
    }
  }

  const integrity = integrityChecks(database);
  if (!integrity.quickCheck || integrity.integrityError) {
    reasons.push("quick_check_failed");
  }
  if (integrity.foreignKeyViolations > 0 || integrity.integrityError) {
    reasons.push("foreign_key_check_failed");
  }

  const reasonCodes = [...new Set(reasons)].sort();
  const schemaExact =
    successorRow?.ddl_checksum === DDL_CHECKSUM
    && Object.keys(EXPECTED_INDEXES)
      .every((name) => ownedIndexIsExact(database, name));
  const checks = {
    foundationDependency,
    schemaExact,
    quickCheck: integrity.quickCheck && !integrity.integrityError,
    foreignKeys:
      integrity.foreignKeyViolations === 0 && !integrity.integrityError
  };
  const counts = {
    indexes: presentIndexes.length,
    migrationRows,
    foreignKeyViolations: integrity.foreignKeyViolations
  };
  const pending = foundationDependency
    && reasonCodes.length === 1
    && reasonCodes[0] === "required_migration_missing";
  const ok = foundationDependency
    && reasonCodes.length === 0
    && checks.schemaExact
    && checks.quickCheck
    && checks.foreignKeys;

  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    counts,
    checks,
    reasonCodes,
    pendingMigrationIds: pending
      ? [REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID]
      : []
  };
}

export function inspectCoinWalletReferenceIndexSchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw migrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    counts: {
      indexes: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      foundationDependency: false,
      schemaExact: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: SAFE_INSPECTION_REASONS.has(reasonCode)
      ? [reasonCode]
      : ["database_inspection_failed"],
    pendingMigrationIds: []
  };
}

function validationFailureReason(dbPath, error) {
  if (!existsSync(dbPath)) return "database_missing";
  if (error?.code === "SQLITE_NOTADB") return "database_invalid";
  if (/^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(error?.code ?? "")) {
    return "database_unavailable";
  }
  return "database_inspection_failed";
}

export function validateCoinWalletReferenceIndexSchema({
  dbPath,
  database
} = {}) {
  if (database) {
    return inspectCoinWalletReferenceIndexSchema({ database });
  }
  assertDatabasePath(dbPath);
  let owned;
  let result;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = inspectCoinWalletReferenceIndexSchema({ database: owned });
  } catch (error) {
    result = closedValidationFailure(validationFailureReason(dbPath, error));
  }
  try {
    owned?.close();
  } catch {
    return closedValidationFailure("database_close_failed");
  }
  return result;
}

function assertFoundationDependency(database) {
  if (!foundationDependencyIsExact(database)) {
    throw migrationError("migration_dependency_missing");
  }
}

function assertOwnedIndexesAreAbsent(database) {
  if (
    Object.keys(EXPECTED_INDEXES)
      .some((name) => namedObjectRow(database, name))
  ) {
    throw migrationError("owned_object_without_migration");
  }
}

function normalizeAppliedAt(nowFn) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw migrationError("invalid_migration_contract");
  }
  return value.toISOString();
}

function applyWithDatabase(database, nowFn) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    assertFoundationDependency(database);
    const applied = migrationRow(
      database,
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    );
    if (applied) {
      if (applied.ddl_checksum !== DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch");
      }
      if (!inspectCoinWalletReferenceIndexSchema({ database }).ok) {
        throw migrationError("applied_schema_incompatible");
      }
      return [];
    }
    assertOwnedIndexesAreAbsent(database);
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    database.prepare(`
      insert into platform_schema_migrations
        (migration_id, ddl_checksum, applied_at)
      values (?, ?, ?)
    `).run(
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
      DDL_CHECKSUM,
      normalizeAppliedAt(nowFn)
    );
    if (!inspectCoinWalletReferenceIndexSchema({ database }).ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return [REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID];
  });
  return migrate.immediate();
}

export function applyCoinWalletReferenceIndexMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  if (
    expectedMigrationId
    !== REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
  ) {
    throw migrationError("migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw migrationError("migration_checksum_mismatch");
  }
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw migrationError("invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);

  let owned;
  try {
    const connection =
      database ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const appliedMigrationIds = applyWithDatabase(connection, nowFn);
    const inspection =
      inspectCoinWalletReferenceIndexSchema({ database: connection });
    if (!inspection.ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length === 1,
      appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error);
  } finally {
    if (owned) {
      try {
        owned.close();
      } catch {
        throw migrationError("database_close_failed");
      }
    }
  }
}
