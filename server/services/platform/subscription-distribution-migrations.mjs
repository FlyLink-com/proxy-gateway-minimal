import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";
import { inspectThirdPartySubscriptionSchema, THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE } from "./third-party-subscription-migrations.mjs";

export const REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID = "20261019_001_subscription_distribution";
export const SUBSCRIPTION_DISTRIBUTION_POLICY_TABLE = "platform_subscription_distribution_policy";
export const SUBSCRIPTION_DISTRIBUTION_ROUTES_TABLE = "platform_subscription_distribution_routes";
export const SUBSCRIPTION_DISTRIBUTION_OWNED_TABLE = "platform_subscription_distribution_owned";

const STATEMENTS = Object.freeze([
  `create table ${SUBSCRIPTION_DISTRIBUTION_POLICY_TABLE} (
    id integer primary key check (id = 1),
    owned_enabled integer not null check (owned_enabled in (0, 1)),
    updated_at text not null
  )`,
  `create table ${SUBSCRIPTION_DISTRIBUTION_ROUTES_TABLE} (
    plan_id text primary key check (plan_id in ('monthly_basic', 'monthly_plus', 'yearly')),
    mode text not null check (mode in ('owned', 'third-party')),
    node_ids_json text not null,
    updated_at text not null
  )`,
  `create table ${SUBSCRIPTION_DISTRIBUTION_OWNED_TABLE} (
    node_id text primary key,
    enabled integer not null check (enabled in (0, 1)),
    custom_name text,
    custom_country_code text,
    updated_at text not null
  )`
]);
const normalize = sql => String(sql).replace(/\s+/g, " ").trim().toLowerCase();
export const REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM = createHash("sha256")
  .update(STATEMENTS.map(normalize).join("\n")).digest("hex");
export const SUBSCRIPTION_DISTRIBUTION_MIGRATIONS = Object.freeze([Object.freeze({
  id: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
  ddlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM,
  statements: STATEMENTS
})]);
const TABLES = [SUBSCRIPTION_DISTRIBUTION_POLICY_TABLE, SUBSCRIPTION_DISTRIBUTION_ROUTES_TABLE, SUBSCRIPTION_DISTRIBUTION_OWNED_TABLE];
const error = code => Object.assign(new Error("Subscription distribution schema operation rejected"), { code });
const pending = () => ({ ok: false, schemaState: "pending", requiredMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
  checks: { schemaExact: false, quickCheck: false, foreignKeys: false },
  reasonCodes: ["required_migration_missing"], pendingMigrationIds: [REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID] });
export function isFullyQualifiedSubscriptionDistributionPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) return false;
  if (process.platform !== "win32" || /^[A-Za-z]:[\\/]/.test(value)) return true;
  const match = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)(?:[\\/]|$)/.exec(value);
  return !!match && match.slice(1).every(part => ![".", "..", "?"].includes(part) && !/[<>:"|?*]/.test(part));
}
function pathContract(dbPath) {
  if (!isFullyQualifiedSubscriptionDistributionPath(dbPath)) throw error("invalid_migration_contract");
}
function logicalDigest(database) {
  const objects = database.prepare("select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' order by type, name").all();
  const contents = objects.filter(object => object.type === "table").map(object => {
    const identifier = `"${object.name.replace(/"/g, '""')}"`;
    const rows = database.prepare(`select * from ${identifier}`).all().map(row => JSON.stringify(row)).sort();
    return [object.name, rows];
  });
  return createHash("sha256").update(JSON.stringify({ objects, contents })).digest("hex");
}

export function inspectSubscriptionDistributionSchema({ database } = {}) {
  if (!database?.prepare || !database?.pragma) throw error("invalid_migration_contract");
  const reasons = [];
  const dependency = inspectThirdPartySubscriptionSchema({ database });
  if (!dependency.ok) reasons.push("third_party_schema_required");
  const present = TABLES.map(name => database.prepare("select type, sql from sqlite_master where name = ?").get(name));
  let row;
  try { row = database.prepare(`select ddl_checksum from ${THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE} where migration_id = ?`).get(REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID); } catch { /* dependency is reported above */ }
  if (!row && present.every(value => !value)) reasons.push("required_migration_missing");
  else if (!row) reasons.push("owned_object_without_migration");
  else if (row.ddl_checksum !== REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM) reasons.push("migration_checksum_mismatch");
  const schemaExact = row?.ddl_checksum === REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM
    && present.every((value, index) => value?.type === "table" && normalize(value.sql) === normalize(STATEMENTS[index]));
  if (row && !schemaExact && !reasons.includes("migration_checksum_mismatch")) reasons.push("owned_object_incompatible");
  const quick = database.pragma("quick_check");
  const quickCheck = quick.length === 1 && Object.values(quick[0])[0] === "ok";
  const foreignKeys = database.pragma("foreign_key_check").length === 0;
  if (!quickCheck) reasons.push("quick_check_failed");
  if (!foreignKeys) reasons.push("foreign_key_check_failed");
  return { ok: reasons.length === 0, schemaState: reasons.length === 0 ? "ready" : reasons.length === 1 && reasons[0] === "required_migration_missing" ? "pending" : "blocked",
    requiredMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
    checks: { schemaExact, quickCheck, foreignKeys }, reasonCodes: reasons,
    pendingMigrationIds: !row && present.every(value => !value) ? [REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID] : [] };
}

export function validateSubscriptionDistributionSchema({ dbPath, database } = {}) {
  if (database) return inspectSubscriptionDistributionSchema({ database });
  pathContract(dbPath);
  if (!existsSync(dbPath)) return pending();
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectSubscriptionDistributionSchema({ database: owned });
  } catch {
    return { ...pending(), schemaState: "blocked", reasonCodes: ["database_inspection_failed"], pendingMigrationIds: [] };
  } finally { owned?.close(); }
}

export function applySubscriptionDistributionMigrations({ dbPath, database, expectedMigrationId, expectedDdlChecksum, nowFn = () => new Date() } = {}) {
  if (expectedMigrationId !== REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID) throw error("migration_id_mismatch");
  if (expectedDdlChecksum !== REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM) throw error("migration_checksum_mismatch");
  if (!database) pathContract(dbPath);
  let owned;
  try {
    const db = database || (owned = new Database(dbPath, { fileMustExist: true, timeout: 0 }));
    return db.transaction(() => {
      const before = inspectSubscriptionDistributionSchema({ database: db });
      if (before.ok) return { ...before, mode: "apply", sourceChanged: false, appliedMigrationIds: [] };
      if (before.schemaState !== "pending") throw error(before.reasonCodes[0] || "applied_schema_incompatible");
      const at = new Date(nowFn());
      if (Number.isNaN(at.getTime())) throw error("invalid_migration_contract");
      for (const statement of STATEMENTS) db.exec(statement);
      db.prepare(`insert into ${THIRD_PARTY_SCHEMA_MIGRATIONS_TABLE}(migration_id, ddl_checksum, applied_at) values (?, ?, ?)`).run(
        REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID, REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM, at.toISOString());
      const after = inspectSubscriptionDistributionSchema({ database: db });
      if (!after.ok) throw error("applied_schema_incompatible");
      return { ...after, mode: "apply", sourceChanged: true, appliedMigrationIds: [REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID] };
    }).immediate();
  } finally { owned?.close(); }
}

export async function dryRunSubscriptionDistributionMigrations({ dbPath, tempRoot = tmpdir() } = {}) {
  pathContract(dbPath);
  if (!isFullyQualifiedSubscriptionDistributionPath(tempRoot)) throw error("invalid_temp_root");
  if (!existsSync(dbPath)) throw error("database_missing");
  mkdirSync(tempRoot, { recursive: true });
  const directory = mkdtempSync(join(tempRoot, "subscription-distribution-dry-run-"));
  let source;
  try {
    const identity = statSync(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 0 });
    const version = source.pragma("data_version", { simple: true });
    const originalDigest = logicalDigest(source);
    const backup = join(directory, "before.sqlite");
    const candidate = join(directory, "candidate.sqlite");
    await source.backup(backup);
    await source.backup(candidate);
    const result = applySubscriptionDistributionMigrations({ dbPath: candidate,
      expectedMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
      expectedDdlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM });
    // Restore the pre-migration backup over the already migrated local copy.
    // This exercises rollback of schema and rows, never overwriting source.
    const saved = new Database(backup, { readonly: true, fileMustExist: true });
    try { await saved.backup(candidate); } finally { saved.close(); }
    const restoredState = validateSubscriptionDistributionSchema({ dbPath: candidate });
    const restoredConnection = new Database(candidate, { readonly: true, fileMustExist: true });
    let restoredDigest;
    try { restoredDigest = logicalDigest(restoredConnection); } finally { restoredConnection.close(); }
    const originalState = inspectSubscriptionDistributionSchema({ database: source });
    const afterIdentity = statSync(dbPath);
    if (afterIdentity.dev !== identity.dev || afterIdentity.ino !== identity.ino
      || source.pragma("data_version", { simple: true }) !== version || logicalDigest(source) !== originalDigest
      || restoredDigest !== originalDigest || JSON.stringify(restoredState) !== JSON.stringify(originalState)) {
      throw error("source_changed_during_dry_run");
    }
    return { ...result, mode: "dry-run", sourceChanged: false, restoreVerified: true };
  } finally {
    source?.close();
    // mkdtemp returns an owned direct child; never remove the caller's root.
    rmSync(directory, { recursive: true, force: true });
  }
}
