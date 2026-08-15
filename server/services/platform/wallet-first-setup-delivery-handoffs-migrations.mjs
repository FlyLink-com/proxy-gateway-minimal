import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import Database from "better-sqlite3";

import {
  REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID,
  WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS,
  validateWalletFirstResourceEffectRuntimeClaimsSchema
} from "./wallet-first-resource-effect-runtime-claims-migrations.mjs";

export const REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID =
  "20260815_001_wallet_first_setup_delivery_handoffs";
export const WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE =
  "platform_wallet_first_setup_delivery_handoffs";

const CLAIMABLE_INDEX =
  "platform_wallet_first_setup_delivery_handoffs_claimable_idx";
const OWNED_OBJECTS = Object.freeze([
  ["table", WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE],
  ["index", CLAIMABLE_INDEX]
]);
const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE} (
      -- This is a delivery handoff ledger, not a material vault. It may only
      -- retain opaque control/runtime references, one-way hashes, and CAS
      -- state. Configuration URLs, credentials, rendered YAML, sessions, and
      -- raw idempotency values must never enter this table.
      handoff_ref text not null primary key,
      account_id text not null,
      initial_transition_ref text not null,
      effect_ref text not null unique,
      tenant_ref text not null,
      artifact_ref text not null,
      idempotency_key_hash text,
      session_binding_hash text,
      status text not null check (
        status in ('pending', 'claimed', 'delivered', 'reconciliation_required')
      ),
      claim_generation integer not null default 0 check (
        typeof(claim_generation) = 'integer'
        and claim_generation between 0 and 2147483647
      ),
      lease_until text,
      created_at text not null,
      updated_at text not null,
      claimed_at text,
      delivered_at text,
      safe_code text,
      check (
        length(handoff_ref) = 57
        and handoff_ref glob 'wfxsetup_[0-9a-f]*'
        and handoff_ref not glob 'wfxsetup_*[^0-9a-f]*'
      ),
      check (
        idempotency_key_hash is null
        or (
          length(idempotency_key_hash) = 64
          and idempotency_key_hash not glob '*[^0-9a-f]*'
        )
      ),
      check (
        session_binding_hash is null
        or (
          length(session_binding_hash) = 64
          and session_binding_hash not glob '*[^0-9a-f]*'
        )
      ),
      unique (
        account_id,
        initial_transition_ref,
        effect_ref,
        tenant_ref,
        artifact_ref
      ),
      check (
        (
          status = 'pending'
          and claim_generation = 0
          and idempotency_key_hash is null
          and session_binding_hash is null
          and lease_until is null
          and claimed_at is null
          and delivered_at is null
          and safe_code is null
        )
        or
        (
          status = 'claimed'
          and claim_generation > 0
          and idempotency_key_hash is not null
          and session_binding_hash is not null
          and lease_until is not null
          and claimed_at is not null
          and delivered_at is null
          and safe_code is null
        )
        or
        (
          status = 'delivered'
          and claim_generation > 0
          and idempotency_key_hash is not null
          and session_binding_hash is not null
          and lease_until is null
          and claimed_at is not null
          and delivered_at is not null
          and safe_code is null
        )
        or
        (
          status = 'reconciliation_required'
          and idempotency_key_hash is null
          and session_binding_hash is null
          and lease_until is null
          and claimed_at is null
          and delivered_at is null
          and safe_code is not null
        )
      )
    )
  `,
  `
    create index ${CLAIMABLE_INDEX}
      on ${WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE}(
        account_id, status, lease_until, effect_ref
      )
      where status in ('pending', 'claimed')
  `
]);

function normalizeSql(sql) {
  return String(sql ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

const DDL_CHECKSUM = createHash("sha256")
  .update(MIGRATION_STATEMENTS.map(normalizeSql).join("\n"), "utf8")
  .digest("hex");

export const WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATIONS = Object.freeze([
  Object.freeze({
    migrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM,
    statements: MIGRATION_STATEMENTS
  })
]);

function migrationError(code) {
  const error = new Error("Wallet-first setup-delivery handoff schema operation rejected");
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
  return database.prepare(`
    select migration_id, ddl_checksum from platform_schema_migrations
    where migration_id = ?
  `).get(REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID) ?? null;
}

function exactDependency(database) {
  try {
    const expected = WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATIONS.find(
      ({ migrationId }) => (
        migrationId === REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID
      )
    );
    if (!expected) return false;
    const row = database.prepare(`
      select ddl_checksum from platform_schema_migrations where migration_id = ?
    `).get(REQUIRED_WALLET_FIRST_RESOURCE_EFFECT_RUNTIME_CLAIMS_MIGRATION_ID);
    return row?.ddl_checksum === expected.ddlChecksum
      && validateWalletFirstResourceEffectRuntimeClaimsSchema({ database }).ok === true;
  } catch {
    return false;
  }
}

function expectedSqlFor(name) {
  if (name === WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_TABLE) {
    return MIGRATION_STATEMENTS[0];
  }
  if (name === CLAIMABLE_INDEX) return MIGRATION_STATEMENTS[1];
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
  const dependency = exactDependency(database);
  const row = dependency ? migrationRow(database) : null;
  const present = OWNED_OBJECTS.filter(([, name]) => namedObject(database, name));
  const checks = {
    runtimeClaimsDependency: dependency,
    schemaExact: row?.ddl_checksum === DDL_CHECKSUM && ownedObjectsExact(database),
    ...integrity(database)
  };
  const reasonCodes = [];
  if (!dependency) reasonCodes.push("migration_dependency_missing");
  else if (!row && present.length === 0) reasonCodes.push("required_migration_missing");
  else if (!row) reasonCodes.push("owned_object_without_migration");
  else if (row.ddl_checksum !== DDL_CHECKSUM) reasonCodes.push("migration_checksum_mismatch");
  else if (!checks.schemaExact) reasonCodes.push(
    present.length === OWNED_OBJECTS.length ? "owned_object_incompatible" : "owned_object_missing"
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
    requiredMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
    checks,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    pendingMigrationIds: pending
      ? [REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID]
      : []
  };
}

export function inspectWalletFirstSetupDeliveryHandoffsSchema({ database } = {}) {
  if (!database || typeof database.prepare !== "function" || typeof database.pragma !== "function") {
    throw migrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

export function validateWalletFirstSetupDeliveryHandoffsSchema({ dbPath, database } = {}) {
  if (database) return inspectWalletFirstSetupDeliveryHandoffsSchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectWalletFirstSetupDeliveryHandoffsSchema({ database: owned });
  } catch (error) {
    const code = error?.code === "SQLITE_NOTADB"
      ? "database_invalid"
      : existsSync(dbPath) ? "database_inspection_failed" : "database_missing";
    return {
      ok: false,
      schemaState: "blocked",
      requiredMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
      checks: {
        runtimeClaimsDependency: false,
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
  if (expectedMigrationId !== REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID) {
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
    if (!exactDependency(database)) throw migrationError("migration_dependency_missing");
    const existing = migrationRow(database);
    if (existing) {
      if (existing.ddl_checksum !== DDL_CHECKSUM) throw migrationError("migration_checksum_mismatch");
      if (!inspectWalletFirstSetupDeliveryHandoffsSchema({ database }).ok) {
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
    `).run(
      REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
      DDL_CHECKSUM,
      occurredAt.toISOString()
    );
    if (!inspectWalletFirstSetupDeliveryHandoffsSchema({ database }).ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return [REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID];
  }).immediate();
}

export function applyWalletFirstSetupDeliveryHandoffsMigrations({
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
    const inspection = inspectWalletFirstSetupDeliveryHandoffsSchema({ database: connection });
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
    inspection: inspection ?? inspectWalletFirstSetupDeliveryHandoffsSchema({ database })
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

export async function dryRunWalletFirstSetupDeliveryHandoffsMigrations({
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
    directory = mkdtempSync(join(root, "wallet-first-setup-handoffs-dry-run-"));
    const snapshot = join(directory, "snapshot.sqlite");
    const verificationSnapshot = join(directory, "verification.sqlite");
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    source.exec("begin");
    sourceReadTransaction = true;
    const before = inspectWalletFirstSetupDeliveryHandoffsSchema({ database: source });
    const sourceStateBefore = sourceInspectionState(source, before);
    await source.backup(snapshot);
    const sourceSnapshotHash = sha256File(snapshot);
    const sourceStateAfter = sourceInspectionState(source);
    source.exec("rollback");
    sourceReadTransaction = false;
    const applied = applyWalletFirstSetupDeliveryHandoffsMigrations({
      dbPath: snapshot,
      expectedMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateWalletFirstSetupDeliveryHandoffsSchema({ dbPath: snapshot });
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
        : [REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID],
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
