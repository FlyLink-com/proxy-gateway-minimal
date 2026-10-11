import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import Database from "better-sqlite3";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  inspectCoinCommerceSchema
} from "./coin-commerce-migrations.mjs";
import {
  MIGRATION_STATEMENTS,
  OWNED_OBJECTS,
  PLAN_SWITCH_QUOTES_TABLE,
  PLAN_SWITCH_SCHEDULED_TABLE,
  PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID,
  normalizeSql,
  planSwitchCommerceNamespaceRowIsExact
} from "./coin-commerce-plan-switch-schema-contract.mjs";

export {
  PLAN_SWITCH_QUOTES_TABLE,
  PLAN_SWITCH_SCHEDULED_TABLE,
  PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID,
  planSwitchCommerceNamespaceRowIsExact
};

const EXPECTED_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_COMMERCE_PLAN_SWITCH_DDL:v1\0${MIGRATION_STATEMENTS
      .map(normalizeSql)
      .join("\0")}`,
    "utf8"
  )
  .digest("hex");

export const PLAN_SWITCH_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);

const INTERNAL_ERRORS = new WeakMap();
const INTERNAL_CODES = new Set([
  "plan_switch_applied_schema_incompatible",
  "plan_switch_database_unavailable",
  "plan_switch_invalid_migration_contract",
  "plan_switch_invalid_temp_root",
  "plan_switch_migration_apply_failed",
  "plan_switch_migration_checksum_mismatch",
  "plan_switch_migration_dependency_missing",
  "plan_switch_owned_object_without_migration",
  "plan_switch_rollback_rows_present",
  "plan_switch_source_changed_during_dry_run"
]);

function schemaError(code) {
  const error = new Error("Coin commerce plan switch schema rejected");
  error.code = code;
  return error;
}

function internalError(code, token) {
  const error = schemaError(code);
  INTERNAL_ERRORS.set(error, { code, token });
  return error;
}

function safeCode(error) {
  try {
    return typeof error?.code === "string" ? error.code : null;
  } catch {
    return null;
  }
}

function isContention(code) {
  return typeof code === "string"
    && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(code);
}

function closeOperationError(error, token) {
  const provenance = INTERNAL_ERRORS.get(error);
  if (provenance?.token === token && INTERNAL_CODES.has(provenance.code)) {
    return schemaError(provenance.code);
  }
  if (isContention(safeCode(error))) {
    return schemaError("plan_switch_database_unavailable");
  }
  return schemaError("plan_switch_migration_apply_failed");
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw schemaError("plan_switch_invalid_database_path");
  }
}

function objectRow(database, type, name) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from sqlite_master
     where type = ? and name = ? collate nocase
  `).get(type, name) ?? null;
}

function namedObjectRow(database, name) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from sqlite_master
     where name = ? collate nocase
  `).get(name) ?? null;
}

function migrationRow(database, migrationId) {
  const ledger = objectRow(database, "table", "platform_schema_migrations");
  if (!ledger) return null;
  return database.prepare(`
    select migration_id, ddl_checksum, applied_at
      from platform_schema_migrations
     where migration_id = ?
  `).get(migrationId) ?? null;
}

function commerceDependencyIsExact(database) {
  try {
    const row = migrationRow(database, REQUIRED_COIN_COMMERCE_MIGRATION_ID);
    return row?.ddl_checksum === COIN_COMMERCE_MIGRATIONS[0].ddlChecksum
      && inspectCoinCommerceSchema({ database }).ok === true;
  } catch {
    return false;
  }
}

function ownedObjectIsExact(database, type, name) {
  const row = objectRow(database, type, name);
  return row?.name === name
    && normalizeSql(row.sql) === EXPECTED_SQL.get(`${type}:${name}`);
}

function presentOwnedObjects(database) {
  return OWNED_OBJECTS.filter(([, name]) => namedObjectRow(database, name));
}

function namespaceIsExact(database) {
  const actual = [];
  for (const table of [PLAN_SWITCH_QUOTES_TABLE, PLAN_SWITCH_SCHEDULED_TABLE]) {
    const rows = database.prepare(`
      select type, name
        from sqlite_master
       where name = ? or tbl_name = ?
       order by type, name
    `).all(table, table).filter(({ name }) => !name.startsWith("sqlite_autoindex_"));
    actual.push(...rows);
  }
  actual.sort((left, right) => (
    `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`)
  ));
  const expected = OWNED_OBJECTS
    .map(([type, name]) => `${type}:${name}`)
    .sort();
  return JSON.stringify(actual.map(({ type, name }) => `${type}:${name}`))
    === JSON.stringify(expected);
}

function integrity(database) {
  try {
    const quick = database.pragma("quick_check");
    const foreignKeyViolations = database.pragma("foreign_key_check").length;
    return {
      quickCheck: quick.length === 1 && Object.values(quick[0])[0] === "ok",
      foreignKeyViolations,
      failed: false
    };
  } catch {
    return { quickCheck: false, foreignKeyViolations: 0, failed: true };
  }
}

function scheduledRowCount(database) {
  if (!ownedObjectIsExact(database, "table", PLAN_SWITCH_SCHEDULED_TABLE)) {
    return 0;
  }
  return database.prepare(
    `select count(*) from ${PLAN_SWITCH_SCHEDULED_TABLE} where status in ('scheduled', 'applying')`
  ).pluck().get();
}

function closedInspection(database) {
  const reasons = [];
  const commerceDependency = commerceDependencyIsExact(database);
  if (!commerceDependency) reasons.push("migration_dependency_missing");
  const applied = migrationRow(database, REQUIRED_PLAN_SWITCH_MIGRATION_ID);
  const present = presentOwnedObjects(database);
  if (!applied && present.length === 0 && commerceDependency) {
    reasons.push("required_migration_missing");
  } else if (!applied && present.length > 0) {
    reasons.push("owned_object_without_migration");
  } else if (applied && applied.ddl_checksum !== DDL_CHECKSUM) {
    reasons.push("migration_checksum_mismatch");
  } else if (applied) {
    for (const [type, name] of OWNED_OBJECTS) {
      if (!namedObjectRow(database, name)) {
        reasons.push("owned_object_missing");
      } else if (!ownedObjectIsExact(database, type, name)) {
        reasons.push("owned_object_incompatible");
      }
    }
    if (!namespaceIsExact(database)) reasons.push("owned_object_incompatible");
  }
  const health = integrity(database);
  if (!health.quickCheck || health.failed) reasons.push("quick_check_failed");
  if (health.foreignKeyViolations > 0 || health.failed) {
    reasons.push("foreign_key_check_failed");
  }
  const schemaExact = Boolean(applied)
    && applied.ddl_checksum === DDL_CHECKSUM
    && OWNED_OBJECTS.every(([type, name]) => ownedObjectIsExact(database, type, name))
    && namespaceIsExact(database);
  const reasonCodes = [...new Set(reasons)].sort();
  const pending = commerceDependency
    && reasonCodes.length === 1
    && reasonCodes[0] === "required_migration_missing";
  const ok = commerceDependency
    && schemaExact
    && health.quickCheck
    && health.foreignKeyViolations === 0
    && reasonCodes.length === 0;
  const migrationRows = objectRow(database, "table", "platform_schema_migrations")
    ? database.prepare("select count(*) from platform_schema_migrations").pluck().get()
    : 0;
  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    counts: {
      scheduledRows: scheduledRowCount(database),
      ownedObjects: present.length,
      migrationRows,
      foreignKeyViolations: health.foreignKeyViolations
    },
    checks: {
      commerceDependency,
      schemaExact,
      rollbackSafe: scheduledRowCount(database) === 0,
      quickCheck: health.quickCheck && !health.failed,
      foreignKeys: health.foreignKeyViolations === 0 && !health.failed
    },
    reasonCodes,
    pendingMigrationIds: pending ? [REQUIRED_PLAN_SWITCH_MIGRATION_ID] : []
  };
}

function closedValidation(reason) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    counts: {
      scheduledRows: 0,
      ownedObjects: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      commerceDependency: false,
      schemaExact: false,
      rollbackSafe: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: [reason],
    pendingMigrationIds: []
  };
}

export function inspectPlanSwitchSchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw schemaError("plan_switch_invalid_migration_contract");
  }
  return closedInspection(database);
}

export function validatePlanSwitchSchema({ dbPath, database } = {}) {
  if (database) return inspectPlanSwitchSchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectPlanSwitchSchema({ database: owned });
  } catch (error) {
    if (!existsSync(dbPath)) return closedValidation("database_missing");
    const code = safeCode(error);
    if (isContention(code)) return closedValidation("database_unavailable");
    if (code === "SQLITE_NOTADB") return closedValidation("database_invalid");
    return closedValidation("database_inspection_failed");
  } finally {
    try {
      owned?.close();
    } catch {
      return closedValidation("database_close_failed");
    }
  }
}

function assertExpected({ expectedMigrationId, expectedDdlChecksum }) {
  if (expectedMigrationId !== REQUIRED_PLAN_SWITCH_MIGRATION_ID) {
    throw schemaError("plan_switch_migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw schemaError("plan_switch_migration_checksum_mismatch");
  }
}

function normalizeAppliedAt(nowFn, token) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw internalError("plan_switch_invalid_migration_contract", token);
  }
  return value.toISOString();
}

function applyWithDatabase(database, nowFn, token) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    if (!commerceDependencyIsExact(database)) {
      throw internalError("plan_switch_migration_dependency_missing", token);
    }
    const applied = migrationRow(database, REQUIRED_PLAN_SWITCH_MIGRATION_ID);
    if (applied) {
      if (applied.ddl_checksum !== DDL_CHECKSUM) {
        throw internalError("plan_switch_migration_checksum_mismatch", token);
      }
      if (!inspectPlanSwitchSchema({ database }).ok) {
        throw internalError("plan_switch_applied_schema_incompatible", token);
      }
      return [];
    }
    if (presentOwnedObjects(database).length > 0) {
      throw internalError("plan_switch_owned_object_without_migration", token);
    }
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    database.prepare(`
      insert into platform_schema_migrations (
        migration_id, ddl_checksum, applied_at
      ) values (?, ?, ?)
    `).run(
      REQUIRED_PLAN_SWITCH_MIGRATION_ID,
      DDL_CHECKSUM,
      normalizeAppliedAt(nowFn, token)
    );
    const inspection = inspectPlanSwitchSchema({ database });
    if (!inspection.ok || inspection.counts.scheduledRows !== 0) {
      throw internalError("plan_switch_applied_schema_incompatible", token);
    }
    return [REQUIRED_PLAN_SWITCH_MIGRATION_ID];
  });
  return migrate.immediate();
}

export function applyPlanSwitchMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  assertExpected({ expectedMigrationId, expectedDdlChecksum });
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw schemaError("plan_switch_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  const token = Object.freeze({});
  let owned;
  try {
    const connection = database
      ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const appliedMigrationIds = applyWithDatabase(connection, nowFn, token);
    const inspection = inspectPlanSwitchSchema({ database: connection });
    if (!inspection.ok) {
      throw internalError("plan_switch_applied_schema_incompatible", token);
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length > 0,
      appliedMigrationIds
    };
  } catch (error) {
    throw closeOperationError(error, token);
  } finally {
    try {
      owned?.close();
    } catch {
      throw schemaError("plan_switch_database_unavailable");
    }
  }
}

function rollbackWithDatabase(database, token) {
  database.pragma("foreign_keys = ON");
  const rollback = database.transaction(() => {
    const inspection = inspectPlanSwitchSchema({ database });
    if (!inspection.ok) {
      throw internalError("plan_switch_applied_schema_incompatible", token);
    }
    if (inspection.counts.scheduledRows !== 0) {
      throw internalError("plan_switch_rollback_rows_present", token);
    }
    for (const statement of PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS) {
      database.exec(statement);
    }
    database.prepare(`
      delete from platform_schema_migrations
       where migration_id = ?
    `).run(REQUIRED_PLAN_SWITCH_MIGRATION_ID);
    if (presentOwnedObjects(database).length !== 0) {
      throw internalError("plan_switch_applied_schema_incompatible", token);
    }
    return [REQUIRED_PLAN_SWITCH_MIGRATION_ID];
  });
  return rollback.immediate();
}

export function rollbackPlanSwitchMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum
} = {}) {
  assertExpected({ expectedMigrationId, expectedDdlChecksum });
  if (!database && dbPath === undefined) {
    throw schemaError("plan_switch_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  const token = Object.freeze({});
  let owned;
  try {
    const connection = database
      ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const removedMigrationIds = rollbackWithDatabase(connection, token);
    const inspection = inspectPlanSwitchSchema({ database: connection });
    return {
      ...inspection,
      mode: "rollback",
      sourceChanged: removedMigrationIds.length > 0,
      removedMigrationIds
    };
  } catch (error) {
    throw closeOperationError(error, token);
  } finally {
    try {
      owned?.close();
    } catch {
      throw schemaError("plan_switch_database_unavailable");
    }
  }
}

function sourceDataVersion(database) {
  const rows = database.pragma("data_version");
  const value = rows?.[0]?.data_version;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw schemaError("plan_switch_database_unavailable");
  }
  return value;
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1024);
  const descriptor = openSync(filePath, "r");
  try {
    let count;
    while ((count = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
    }
    return hash.digest("hex");
  } finally {
    closeSync(descriptor);
  }
}

function safeRemoveOwnedDirectory(directory, root) {
  const resolvedDirectory = resolve(directory);
  const resolvedRoot = resolve(root);
  const child = relative(resolvedRoot, resolvedDirectory);
  if (
    child.length === 0
    || child === ".."
    || child.startsWith(`..${sep}`)
    || isAbsolute(child)
  ) {
    throw schemaError("plan_switch_invalid_temp_root");
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

export async function dryRunPlanSwitchMigrations({ dbPath, tempRoot } = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw schemaError("plan_switch_invalid_temp_root");
  }
  mkdirSync(root, { recursive: true });
  const workDirectory = mkdtempSync(join(root, "plan-switch-dry-run-"));
  let source;
  try {
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    const sourceDataVersionBefore = sourceDataVersion(source);
    const sourceHashBefore = sha256File(dbPath);
    if (!commerceDependencyIsExact(source)) {
      throw schemaError("plan_switch_migration_dependency_missing");
    }
    const wasApplied = Boolean(
      migrationRow(source, REQUIRED_PLAN_SWITCH_MIGRATION_ID)
    );
    const before = JSON.stringify(inspectPlanSwitchSchema({ database: source }));
    await source.backup(snapshotPath);
    const applied = applyPlanSwitchMigrations({
      dbPath: snapshotPath,
      expectedMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validatePlanSwitchSchema({ dbPath: snapshotPath });
    if (!validated.ok) {
      throw schemaError("plan_switch_applied_schema_incompatible");
    }
    const after = JSON.stringify(inspectPlanSwitchSchema({ database: source }));
    const sourceHashAfter = sha256File(dbPath);
    const sourceDataVersionAfter = sourceDataVersion(source);
    if (
      sourceHashAfter !== sourceHashBefore
      || before !== after
      || sourceDataVersionAfter !== sourceDataVersionBefore
    ) {
      throw schemaError("plan_switch_source_changed_during_dry_run");
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied ? [] : [REQUIRED_PLAN_SWITCH_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } finally {
    try {
      source?.close();
    } finally {
      safeRemoveOwnedDirectory(workDirectory, root);
    }
  }
}
