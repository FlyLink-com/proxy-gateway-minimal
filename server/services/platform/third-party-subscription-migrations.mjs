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
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep
} from "node:path";
import Database from "better-sqlite3";

export const REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID =
  "20261010_001_third_party_subscription";

export const THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE = "platform_schema_migrations";
export const THIRD_PARTY_SOURCES_TABLE = "platform_third_party_sources";
export const THIRD_PARTY_SOURCE_TIERS_TABLE = "platform_third_party_source_tiers";
export const THIRD_PARTY_NODES_TABLE = "platform_third_party_nodes";

const SOURCES_ENABLED_INDEX = "platform_third_party_sources_enabled_idx";
const SOURCE_TIERS_PLAN_INDEX = "platform_third_party_source_tiers_plan_idx";
const NODES_SOURCE_ACTIVE_INDEX = "platform_third_party_nodes_source_active_idx";
const NODES_COUNTRY_INDEX = "platform_third_party_nodes_country_idx";

const OWNED_OBJECTS = Object.freeze([
  ["table", THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE],
  ["table", THIRD_PARTY_SOURCES_TABLE],
  ["table", THIRD_PARTY_SOURCE_TIERS_TABLE],
  ["table", THIRD_PARTY_NODES_TABLE],
  ["index", SOURCES_ENABLED_INDEX],
  ["index", SOURCE_TIERS_PLAN_INDEX],
  ["index", NODES_SOURCE_ACTIVE_INDEX],
  ["index", NODES_COUNTRY_INDEX]
]);

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table ${THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE} (
      migration_id text primary key,
      ddl_checksum text not null,
      applied_at text not null
    )
  `,
  `
    create table ${THIRD_PARTY_SOURCES_TABLE} (
      id text primary key,
      name text not null,
      protected_url text not null,
      region_override text,
      enabled integer not null default 1 check (enabled in (0, 1)),
      status text not null default 'pending' check (status in ('pending', 'ready', 'error')),
      last_refresh_at text,
      last_error_code text,
      created_at text not null,
      updated_at text not null
    )
  `,
  `
    create table ${THIRD_PARTY_SOURCE_TIERS_TABLE} (
      source_id text not null references ${THIRD_PARTY_SOURCES_TABLE}(id),
      plan_id text not null check (plan_id in ('monthly_basic', 'monthly_plus', 'yearly')),
      primary key (source_id, plan_id)
    )
  `,
  `
    create table ${THIRD_PARTY_NODES_TABLE} (
      id text primary key,
      source_id text not null references ${THIRD_PARTY_SOURCES_TABLE}(id),
      fingerprint text not null,
      display_name text not null,
      country_code text not null,
      region text not null,
      protocol text not null check (protocol in ('ss', 'vless', 'hysteria2', 'tuic')),
      protected_config text not null,
      last_seen_at text not null,
      active integer not null default 1 check (active in (0, 1)),
      unique (source_id, fingerprint)
    )
  `,
  `
    create index ${SOURCES_ENABLED_INDEX}
      on ${THIRD_PARTY_SOURCES_TABLE}(enabled, id)
  `,
  `
    create index ${SOURCE_TIERS_PLAN_INDEX}
      on ${THIRD_PARTY_SOURCE_TIERS_TABLE}(plan_id, source_id)
  `,
  `
    create index ${NODES_SOURCE_ACTIVE_INDEX}
      on ${THIRD_PARTY_NODES_TABLE}(source_id, active, id)
  `,
  `
    create index ${NODES_COUNTRY_INDEX}
      on ${THIRD_PARTY_NODES_TABLE}(country_code, active)
  `
]);

function normalizeSql(sql) {
  return String(sql ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const DDL_CHECKSUM = createHash("sha256")
  .update(MIGRATION_STATEMENTS.map(normalizeSql).join("\n"), "utf8")
  .digest("hex");

export const REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM = DDL_CHECKSUM;

export const THIRD_PARTY_SUBSCRIPTION_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM,
    statements: MIGRATION_STATEMENTS
  })
]);

function migrationError(code) {
  const error = new Error("Third-party subscription schema operation rejected");
  error.code = code;
  return error;
}

function assertDatabasePath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    throw migrationError("invalid_migration_contract");
  }
}

function namedObject(database, name) {
  return database.prepare(`
    select type, name, tbl_name, sql from sqlite_master where name = ?
  `).get(name) ?? null;
}

function migrationRow(database) {
  if (!namedObject(database, THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE)) return null;
  try {
    return database.prepare(`
      select migration_id, ddl_checksum from ${THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE}
      where migration_id = ?
    `).get(REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID) ?? null;
  } catch {
    return null;
  }
}

function expectedSqlFor(name) {
  const index = OWNED_OBJECTS.findIndex(([, objectName]) => objectName === name);
  return index >= 0 ? MIGRATION_STATEMENTS[index] : null;
}

function ownedObjectsExact(database) {
  return OWNED_OBJECTS.every(([type, name]) => {
    const row = namedObject(database, name);
    return row
      && row.type === type
      && normalizeSql(row.sql) === normalizeSql(expectedSqlFor(name));
  });
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
  const row = migrationRow(database);
  const present = OWNED_OBJECTS.filter(([, name]) => namedObject(database, name));
  const checks = {
    schemaExact: row?.ddl_checksum === DDL_CHECKSUM && ownedObjectsExact(database),
    ...integrity(database)
  };
  const reasonCodes = [];
  if (!row && present.length === 0) reasonCodes.push("required_migration_missing");
  else if (!row) reasonCodes.push("owned_object_without_migration");
  else if (row.ddl_checksum !== DDL_CHECKSUM) reasonCodes.push("migration_checksum_mismatch");
  else if (!checks.schemaExact) {
    reasonCodes.push(
      present.length === OWNED_OBJECTS.length
        ? "owned_object_incompatible"
        : "owned_object_missing"
    );
  }
  if (!checks.quickCheck) reasonCodes.push("quick_check_failed");
  if (!checks.foreignKeys) reasonCodes.push("foreign_key_check_failed");
  const pending = reasonCodes.length === 1 && reasonCodes[0] === "required_migration_missing";
  const ok = checks.schemaExact && checks.quickCheck && checks.foreignKeys && reasonCodes.length === 0;
  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    checks,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    pendingMigrationIds: pending ? [REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID] : []
  };
}

function missingDatabaseInspection() {
  return {
    ok: false,
    schemaState: "pending",
    requiredMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    checks: {
      schemaExact: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID]
  };
}

export function inspectThirdPartySubscriptionSchema({ database } = {}) {
  if (!database || typeof database.prepare !== "function" || typeof database.pragma !== "function") {
    throw migrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

export function validateThirdPartySubscriptionSchema({ dbPath, database } = {}) {
  if (database) return inspectThirdPartySubscriptionSchema({ database });
  assertDatabasePath(dbPath);
  if (!existsSync(dbPath)) return missingDatabaseInspection();
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectThirdPartySubscriptionSchema({ database: owned });
  } catch (error) {
    const code = error?.code === "SQLITE_NOTADB"
      ? "database_invalid"
      : existsSync(dbPath) ? "database_inspection_failed" : "required_migration_missing";
    if (code === "required_migration_missing") return missingDatabaseInspection();
    return {
      ok: false,
      schemaState: "blocked",
      requiredMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      checks: {
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
  if (expectedMigrationId !== REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID) {
    throw migrationError("migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM || typeof nowFn !== "function") {
    throw migrationError(expectedDdlChecksum === DDL_CHECKSUM
      ? "invalid_migration_contract"
      : "migration_checksum_mismatch");
  }
}

function applyOn(database, nowFn) {
  database.pragma("foreign_keys = ON");
  return database.transaction(() => {
    const existing = migrationRow(database);
    if (existing) {
      if (existing.ddl_checksum !== DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch");
      }
      if (!inspectThirdPartySubscriptionSchema({ database }).ok) {
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
      insert into ${THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE}(migration_id, ddl_checksum, applied_at)
      values (?, ?, ?)
    `).run(
      REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      DDL_CHECKSUM,
      occurredAt.toISOString()
    );
    if (!inspectThirdPartySubscriptionSchema({ database }).ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return [REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID];
  }).immediate();
}

export function applyThirdPartySubscriptionMigrations({
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
    let connection = database;
    if (!connection) {
      if (!existsSync(dbPath)) {
        mkdirSync(dirname(dbPath), { recursive: true });
      }
      owned = new Database(dbPath);
      connection = owned;
    }
    const appliedMigrationIds = applyOn(connection, nowFn);
    const inspection = inspectThirdPartySubscriptionSchema({ database: connection });
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

function sourceInspectionState(database, inspection = null) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspection ?? inspectThirdPartySubscriptionSchema({ database })
  };
}

function sourceInspectionStateIsUnchanged(before, after) {
  return before.dataVersion === after.dataVersion
    && before.schemaVersion === after.schemaVersion
    && JSON.stringify(before.inspection) === JSON.stringify(after.inspection);
}

function sourceLogicalStateIsUnchanged(before, after) {
  return before.schemaVersion === after.schemaVersion
    && JSON.stringify(before.inspection) === JSON.stringify(after.inspection);
}

function removeOwnedDirectory(directory, root) {
  const child = relative(resolve(root), resolve(directory));
  if (child.length === 0 || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw migrationError("invalid_temp_root");
  }
  rmSync(directory, { recursive: true, force: true });
}

export async function dryRunThirdPartySubscriptionMigrations({
  dbPath,
  tempRoot
} = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) throw migrationError("invalid_temp_root");
  let directory;
  let source;
  let sourceReadTransaction = false;
  try {
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, "third-party-subscription-dry-run-"));
    const snapshot = join(directory, "snapshot.sqlite");
    const verificationSnapshot = join(directory, "verification.sqlite");
    if (!existsSync(dbPath)) {
      const applied = applyThirdPartySubscriptionMigrations({
        dbPath: snapshot,
        expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
        expectedDdlChecksum: DDL_CHECKSUM
      });
      const validated = validateThirdPartySubscriptionSchema({ dbPath: snapshot });
      if (!validated.ok) throw migrationError("applied_schema_incompatible");
      return {
        ...validated,
        mode: "dry-run",
        sourceChanged: false,
        pendingMigrationIds: [REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID],
        appliedMigrationIds: applied.appliedMigrationIds
      };
    }
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    source.exec("begin");
    sourceReadTransaction = true;
    const before = inspectThirdPartySubscriptionSchema({ database: source });
    const sourceStateBefore = sourceInspectionState(source, before);
    await source.backup(snapshot);
    const sourceSnapshotHash = sha256File(snapshot);
    const sourceStateAfter = sourceInspectionState(source);
    source.exec("rollback");
    sourceReadTransaction = false;
    const applied = applyThirdPartySubscriptionMigrations({
      dbPath: snapshot,
      expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateThirdPartySubscriptionSchema({ dbPath: snapshot });
    const verification = new Database(dbPath, { readonly: true, fileMustExist: true });
    let verificationState;
    let sourceSnapshotUnchanged;
    try {
      verificationState = sourceInspectionState(verification);
      await verification.backup(verificationSnapshot);
      sourceSnapshotUnchanged = sha256File(verificationSnapshot) === sourceSnapshotHash;
    } finally {
      verification.close();
    }
    if (
      !validated.ok
      || !sourceInspectionStateIsUnchanged(sourceStateBefore, sourceStateAfter)
      || !sourceLogicalStateIsUnchanged(sourceStateBefore, verificationState)
      || !sourceSnapshotUnchanged
    ) {
      throw migrationError("source_changed_during_dry_run");
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: before.ok
        ? []
        : [REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } finally {
    if (sourceReadTransaction) {
      try {
        source?.exec("rollback");
      } catch {
        // Preserve the primary closed operation error while releasing a read-only snapshot.
      }
    }
    source?.close();
    if (directory) removeOwnedDirectory(directory, root);
  }
}
