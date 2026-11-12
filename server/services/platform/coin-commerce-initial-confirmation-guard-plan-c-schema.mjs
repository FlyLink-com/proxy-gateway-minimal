import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import Database from "better-sqlite3";

import { inspectCoinCommerceInitialConfirmationSchema } from "./coin-commerce-migrations.mjs";
import {
  REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID as ID,
  INITIAL_CONFIRMATION_GUARD_PLAN_C_STATEMENT as GUARD_SQL,
  INITIAL_CONFIRMATION_GUARD_PLAN_C_STATEMENTS as DDL_STATEMENTS,
  COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS
} from "./coin-commerce-initial-confirmation-guard-plan-c-ddl.mjs";

export {
  ID as REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID,
  COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS
};

const CHECKSUM = COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS[0].ddlChecksum;
const SAFE_SCHEMA_ERRORS = new Set([
  "commerce_initial_confirmation_schema_incompatible",
  "commerce_initial_confirmation_guard_migration_missing",
  "commerce_initial_confirmation_guard_schema_incompatible",
  "commerce_migration_id_mismatch",
  "commerce_migration_checksum_mismatch"
]);

function schemaError(code) {
  const error = new Error("Coin Commerce initial-confirmation guard schema operation rejected");
  error.code = code;
  return error;
}

function validateDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) throw schemaError("commerce_invalid_database_path");
  const stat = lstatSync(dbPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw schemaError("commerce_invalid_database_path");
}

function inspection(database) {
  const extension = inspectCoinCommerceInitialConfirmationSchema({ database });
  const planCExact = extension.ok && extension.checks?.initialConfirmationGuardPlanC === true;
  const reasonCodes = [...extension.reasonCodes];
  if (extension.ok && !planCExact) reasonCodes.push("commerce_initial_confirmation_guard_migration_missing");
  return {
    ...extension,
    ok: planCExact,
    schemaState: planCExact ? "ready" : "blocked",
    requiredMigrationId: ID,
    checks: { ...extension.checks, initialConfirmationGuardPlanC: planCExact },
    reasonCodes: [...new Set(reasonCodes)].sort()
  };
}

export function inspectCoinCommerceInitialConfirmationGuardSchema({ database } = {}) {
  return inspection(database);
}

function validationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "unavailable",
    requiredMigrationId: ID,
    sourceChanged: false,
    checks: {
      schemaExact: false, walletDependency: false, quickCheck: false, foreignKeys: false,
      initialConfirmationExtension: false, initialConfirmationGuardPlanC: false
    },
    reasonCodes: [reasonCode]
  };
}

function reasonFor(error) {
  if (error?.code === "SQLITE_CANTOPEN" || error?.code === "ENOENT") return "database_missing";
  if (error?.code === "commerce_invalid_database_path") return "database_invalid";
  return "database_inspection_failed";
}

export function validateCoinCommerceInitialConfirmationGuardSchema({ dbPath, database } = {}) {
  if (database) return inspection(database);
  let owned;
  let result;
  try {
    validateDatabasePath(dbPath);
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = inspection(owned);
  } catch (error) {
    result = validationFailure(reasonFor(error));
  }
  try {
    owned?.close();
  } catch {
    return validationFailure("database_close_failed");
  }
  return result;
}

function timestamp(nowFn) {
  const value = nowFn();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw schemaError("commerce_invalid_migration_contract");
  return date.toISOString();
}

export function applyCoinCommerceInitialConfirmationGuardMigrations({
  dbPath, database, expectedMigrationId, expectedDdlChecksum, nowFn = () => new Date()
} = {}) {
  if (expectedMigrationId !== ID) throw schemaError("commerce_migration_id_mismatch");
  if (expectedDdlChecksum !== CHECKSUM) throw schemaError("commerce_migration_checksum_mismatch");
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)
    || (database && (typeof database.transaction !== "function" || database.inTransaction))) {
    throw schemaError("commerce_invalid_migration_contract");
  }
  if (!database) validateDatabasePath(dbPath);

  let owned;
  try {
    const connection = database ?? (owned = new Database(dbPath, { fileMustExist: true }));
    connection.pragma("foreign_keys = ON");
    if (connection.pragma("foreign_keys", { simple: true }) !== 1) {
      throw schemaError("commerce_invalid_migration_contract");
    }
    const sourceChanged = connection.transaction(() => {
      const before = inspection(connection);
      if (!before.ok && !before.reasonCodes.includes("commerce_initial_confirmation_guard_migration_missing")) {
        throw schemaError("commerce_initial_confirmation_schema_incompatible");
      }
      if (before.ok) return false;
      if (!before.checks?.initialConfirmationExtension) {
        throw schemaError("commerce_initial_confirmation_schema_incompatible");
      }
      connection.exec(DDL_STATEMENTS[0]);
      connection.exec(GUARD_SQL);
      connection.prepare(`
        insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at)
        values (?, ?, ?)
      `).run(ID, CHECKSUM, timestamp(nowFn));
      if (!inspection(connection).ok) throw schemaError("commerce_initial_confirmation_guard_schema_incompatible");
      return true;
    }).immediate();
    const result = inspection(connection);
    if (!result.ok) throw schemaError("commerce_initial_confirmation_guard_schema_incompatible");
    return {
      ...result,
      mode: "apply",
      sourceChanged,
      appliedMigrationIds: sourceChanged ? [ID] : []
    };
  } catch (error) {
    if (SAFE_SCHEMA_ERRORS.has(error?.code) || error?.code === "commerce_invalid_migration_contract"
      || error?.code === "commerce_invalid_database_path") throw error;
    throw schemaError("commerce_initial_confirmation_guard_migration_failed");
  } finally {
    owned?.close();
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sourceState(database) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectCoinCommerceInitialConfirmationSchema({ database })
  };
}

function removeOwnedDirectory(directory, root) {
  const relativePath = relative(resolve(root), resolve(directory));
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw schemaError("commerce_invalid_temp_root");
  }
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw schemaError("commerce_invalid_temp_root");
    rmSync(directory, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function dryRunCoinCommerceInitialConfirmationGuardMigrations({ dbPath, tempRoot } = {}) {
  validateDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) throw schemaError("commerce_invalid_temp_root");
  mkdirSync(root, { recursive: true });
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw schemaError("commerce_invalid_temp_root");
  const workDirectory = mkdtempSync(join(root, "coin-commerce-initial-confirmation-guard-dry-run-"));
  let source;
  let clone;
  try {
    const sourceHashBefore = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    const before = sourceState(source);
    if (!before.inspection.ok) throw schemaError("commerce_initial_confirmation_schema_incompatible");
    const alreadyApplied = before.inspection.checks.initialConfirmationGuardPlanC === true;
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    await source.backup(snapshotPath);
    clone = new Database(snapshotPath, { fileMustExist: true });
    const applied = applyCoinCommerceInitialConfirmationGuardMigrations({
      database: clone, expectedMigrationId: ID, expectedDdlChecksum: CHECKSUM
    });
    const verified = inspection(clone);
    if (!verified.ok) throw schemaError("commerce_initial_confirmation_guard_schema_incompatible");
    const after = sourceState(source);
    if (sha256File(dbPath) !== sourceHashBefore || JSON.stringify(before) !== JSON.stringify(after)) {
      throw schemaError("commerce_source_changed_during_dry_run");
    }
    return {
      ...verified,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: alreadyApplied ? [] : [ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } catch (error) {
    if (SAFE_SCHEMA_ERRORS.has(error?.code) || error?.code === "commerce_invalid_database_path"
      || error?.code === "commerce_invalid_temp_root" || error?.code === "commerce_source_changed_during_dry_run") {
      throw error;
    }
    throw schemaError("commerce_initial_confirmation_guard_migration_failed");
  } finally {
    try { clone?.close(); } finally {
      try { source?.close(); } finally { removeOwnedDirectory(workDirectory, root); }
    }
  }
}
