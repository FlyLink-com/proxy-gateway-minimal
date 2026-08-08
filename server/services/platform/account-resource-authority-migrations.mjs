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
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  inspectCoinWalletSchema
} from "./coin-wallet-migrations.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  inspectCoinCommerceSchema
} from "./coin-commerce-migrations.mjs";

export const REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID =
  "20260807_001_account_resource_authority";

const TABLE = "platform_account_resource_authorities";

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_account_resource_authorities (
      authority_ref text primary key,
      account_id text not null
        references platform_accounts(id) on delete restrict,
      resource_request_id text not null
        references platform_issuance_requests(id) on delete restrict,
      entitlement_id text not null
        references platform_entitlements(id) on delete restrict,
      issued_link_id text not null
        references platform_issued_subscription_links(id) on delete restrict,
      status text not null check (status in ('active', 'revoked')),
      version integer not null check (
        typeof(version) = 'integer' and version >= 1
      ),
      previous_authority_ref text
        references platform_account_resource_authorities(authority_ref)
          on delete restrict,
      created_at text not null check (length(trim(created_at)) > 0),
      updated_at text not null check (length(trim(updated_at)) > 0),
      created_by text not null check (length(trim(created_by)) > 0),
      reason text not null check (length(trim(reason)) > 0),
      revoked_at text,
      revoked_by text,
      revocation_reason text,
      unique (account_id, version),
      check (
        (
          status = 'active'
          and revoked_at is null
          and revoked_by is null
          and revocation_reason is null
        )
        or (
          status = 'revoked'
          and revoked_at is not null
          and length(trim(revoked_at)) > 0
          and revoked_by is not null
          and length(trim(revoked_by)) > 0
          and revocation_reason is not null
          and length(trim(revocation_reason)) > 0
        )
      )
    )
  `,
  `
    create unique index account_resource_authorities_active_account_uidx
      on platform_account_resource_authorities(account_id)
      where status = 'active'
  `,
  `
    create unique index account_resource_authorities_active_request_uidx
      on platform_account_resource_authorities(resource_request_id)
      where status = 'active'
  `,
  `
    create unique index account_resource_authorities_active_entitlement_uidx
      on platform_account_resource_authorities(entitlement_id)
      where status = 'active'
  `,
  `
    create unique index account_resource_authorities_active_link_uidx
      on platform_account_resource_authorities(issued_link_id)
      where status = 'active'
  `,
  `
    create trigger account_resource_authorities_insert_state_guard
    before insert on platform_account_resource_authorities
    when new.status <> 'active'
      or new.revoked_at is not null
      or new.revoked_by is not null
      or new.revocation_reason is not null
      or new.created_at <> new.updated_at
    begin
      select raise(abort, 'authority_insert_state_invalid');
    end
  `,
  `
    create trigger account_resource_authorities_insert_lineage_guard
    before insert on platform_account_resource_authorities
    when not exists (
      select 1
        from platform_accounts a
        join platform_entitlements e
          on e.id = new.entitlement_id
         and e.account_id = a.id
        join platform_issuance_requests r
          on r.id = new.resource_request_id
         and r.account_id = a.id
         and r.entitlement_id = e.id
        join platform_issued_subscription_links l
          on l.id = new.issued_link_id
         and l.request_id = r.id
       where a.id = new.account_id
         and a.status = 'active'
         and e.status = 'active'
         and r.status = 'issued'
         and l.status = 'active'
    )
    begin
      select raise(abort, 'authority_lineage_invalid');
    end
  `,
  `
    create trigger account_resource_authorities_insert_cas_guard
    before insert on platform_account_resource_authorities
    when not (
      (
        new.version = 1
        and new.previous_authority_ref is null
        and not exists (
          select 1
            from platform_account_resource_authorities existing
           where existing.account_id = new.account_id
        )
      )
      or (
        new.version > 1
        and new.previous_authority_ref is not null
        and new.version = (
          select coalesce(max(existing.version), 0) + 1
            from platform_account_resource_authorities existing
           where existing.account_id = new.account_id
        )
        and exists (
          select 1
            from platform_account_resource_authorities previous
           where previous.authority_ref = new.previous_authority_ref
             and previous.account_id = new.account_id
             and previous.version = new.version - 1
             and previous.status = 'revoked'
        )
      )
    )
    begin
      select raise(abort, 'authority_insert_cas_mismatch');
    end
  `,
  `
    create trigger account_resource_authorities_revoke_only_update
    before update on platform_account_resource_authorities
    when not (
      old.status = 'active'
      and new.status = 'revoked'
      and new.authority_ref = old.authority_ref
      and new.account_id = old.account_id
      and new.resource_request_id = old.resource_request_id
      and new.entitlement_id = old.entitlement_id
      and new.issued_link_id = old.issued_link_id
      and new.version = old.version
      and new.previous_authority_ref is old.previous_authority_ref
      and new.created_at = old.created_at
      and new.created_by = old.created_by
      and new.reason = old.reason
      and new.updated_at = new.revoked_at
      and new.revoked_at is not null
      and length(trim(new.revoked_at)) > 0
      and new.revoked_by is not null
      and length(trim(new.revoked_by)) > 0
      and new.revocation_reason is not null
      and length(trim(new.revocation_reason)) > 0
    )
    begin
      select raise(abort, 'authority_update_must_revoke');
    end
  `,
  `
    create trigger account_resource_authorities_delete_deny
    before delete on platform_account_resource_authorities
    begin
      select raise(abort, 'authority_delete_denied');
    end
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

const OWNED_OBJECTS = Object.freeze([
  ["table", TABLE],
  ["index", "account_resource_authorities_active_account_uidx"],
  ["index", "account_resource_authorities_active_request_uidx"],
  ["index", "account_resource_authorities_active_entitlement_uidx"],
  ["index", "account_resource_authorities_active_link_uidx"],
  ["trigger", "account_resource_authorities_insert_state_guard"],
  ["trigger", "account_resource_authorities_insert_lineage_guard"],
  ["trigger", "account_resource_authorities_insert_cas_guard"],
  ["trigger", "account_resource_authorities_revoke_only_update"],
  ["trigger", "account_resource_authorities_delete_deny"]
]);

const EXPECTED_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:ACCOUNT_RESOURCE_AUTHORITY_DDL:v1\0${MIGRATION_STATEMENTS
      .map(normalizeSql)
      .join("\0")}`,
    "utf8"
  )
  .digest("hex");

export const ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);

const INTERNAL_ERRORS = new WeakMap();
const INTERNAL_CODES = new Set([
  "authority_applied_schema_incompatible",
  "authority_database_unavailable",
  "authority_invalid_migration_contract",
  "authority_invalid_temp_root",
  "authority_migration_apply_failed",
  "authority_migration_checksum_mismatch",
  "authority_migration_dependency_missing",
  "authority_owned_object_without_migration",
  "authority_rollback_dependency_present",
  "authority_rollback_rows_present",
  "authority_source_changed_during_dry_run"
]);

function safeAuthorityError(code) {
  const error = new Error("Account resource authority schema rejected");
  error.code = code;
  return error;
}

function internalError(code, token) {
  const error = safeAuthorityError(code);
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
    return safeAuthorityError(provenance.code);
  }
  if (isContention(safeCode(error))) {
    return safeAuthorityError("authority_database_unavailable");
  }
  return safeAuthorityError("authority_migration_apply_failed");
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw safeAuthorityError("authority_invalid_database_path");
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

function dependencyIsExact(database, {
  migrationId,
  checksum,
  inspect
}) {
  try {
    const row = migrationRow(database, migrationId);
    return row?.ddl_checksum === checksum && inspect({ database }).ok;
  } catch {
    return false;
  }
}

function hasColumns(database, table, required) {
  const columns = new Map(database.pragma(`table_info(${table})`)
    .map((column) => [column.name, column]));
  return required.every((name) => columns.has(name));
}

function hasForeignKey(database, table, from, targetTable, to) {
  return database.pragma(`foreign_key_list(${table})`).some((foreignKey) =>
    foreignKey.from === from
    && foreignKey.table === targetTable
    && foreignKey.to === to
  );
}

function lineageDependencyIsCompatible(database) {
  try {
    return hasColumns(database, "platform_accounts", ["id", "status"])
      && hasColumns(database, "platform_entitlements", [
        "id", "account_id", "status", "valid_from", "valid_until"
      ])
      && hasColumns(database, "platform_issuance_requests", [
        "id", "account_id", "entitlement_id", "status"
      ])
      && hasColumns(database, "platform_issued_subscription_links", [
        "id", "request_id", "status", "tenant_ref", "artifact_ref"
      ])
      && hasColumns(database, "platform_portal_access_requests", [
        "id",
        "portal_user_ref",
        "entitlement_ref",
        "status",
        "tenant_id",
        "artifact_id",
        "expires_at",
        "valid_until"
      ])
      && hasForeignKey(
        database,
        "platform_entitlements",
        "account_id",
        "platform_accounts",
        "id"
      )
      && hasForeignKey(
        database,
        "platform_issuance_requests",
        "account_id",
        "platform_accounts",
        "id"
      )
      && hasForeignKey(
        database,
        "platform_issuance_requests",
        "entitlement_id",
        "platform_entitlements",
        "id"
      )
      && hasForeignKey(
        database,
        "platform_issued_subscription_links",
        "request_id",
        "platform_issuance_requests",
        "id"
      );
  } catch {
    return false;
  }
}

function dependencies(database) {
  const wallet = dependencyIsExact(database, {
    migrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    checksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    inspect: inspectCoinWalletSchema
  });
  const commerce = dependencyIsExact(database, {
    migrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    checksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    inspect: inspectCoinCommerceSchema
  });
  const lineage = lineageDependencyIsCompatible(database);
  return { wallet, commerce, lineage };
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
  const actual = database.prepare(`
    select type, name
      from sqlite_master
     where name = ? or tbl_name = ?
     order by type, name
  `).all(TABLE, TABLE).filter(({ name }) => !name.startsWith(
    "sqlite_autoindex_"
  ));
  const expected = [...OWNED_OBJECTS]
    .map(([type, name]) => `${type}:${name}`)
    .sort();
  return JSON.stringify(actual.map(({ type, name }) => `${type}:${name}`))
    === JSON.stringify(expected);
}

const OWNED_OBJECT_KEYS = new Set(
  OWNED_OBJECTS.map(([type, name]) => `${type}:${name}`)
);

function quotedIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function externalAuthorityDependencyCount(database) {
  const dependencies = new Set();
  const authorityName = TABLE.toLowerCase();
  const objects = database.prepare(`
    select type, name, tbl_name, sql
      from sqlite_master
     where sql is not null
       and name not like 'sqlite_%'
     order by type, name
  `).all();

  for (const row of objects) {
    const key = `${row.type}:${row.name}`;
    if (OWNED_OBJECT_KEYS.has(key)) continue;
    if (String(row.sql).toLowerCase().includes(authorityName)) {
      dependencies.add(key);
    }
    if (row.type !== "table" || row.name === TABLE) continue;
    const foreignKeys = database.pragma(
      `foreign_key_list(${quotedIdentifier(row.name)})`
    );
    if (foreignKeys.some((foreignKey) =>
      String(foreignKey.table).toLowerCase() === authorityName
    )) {
      dependencies.add(key);
    }
  }
  return dependencies.size;
}

function integrity(database) {
  try {
    const quick = database.pragma("quick_check");
    const foreignKeyViolations = database.pragma("foreign_key_check").length;
    return {
      quickCheck: quick.length === 1
        && Object.values(quick[0])[0] === "ok",
      foreignKeyViolations,
      failed: false
    };
  } catch {
    return { quickCheck: false, foreignKeyViolations: 0, failed: true };
  }
}

function closedInspection(database) {
  const reasons = [];
  const deps = dependencies(database);
  const allDependencies = deps.wallet && deps.commerce && deps.lineage;
  if (!allDependencies) reasons.push("migration_dependency_missing");

  const applied = migrationRow(
    database,
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  );
  const present = presentOwnedObjects(database);
  if (!applied && present.length === 0 && allDependencies) {
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

  let authorityRows = 0;
  if (ownedObjectIsExact(database, "table", TABLE)) {
    authorityRows = database.prepare(`select count(*) from ${TABLE}`)
      .pluck().get();
  }
  const externalDependencies = applied
    ? externalAuthorityDependencyCount(database)
    : 0;
  const health = integrity(database);
  if (!health.quickCheck || health.failed) reasons.push("quick_check_failed");
  if (health.foreignKeyViolations > 0 || health.failed) {
    reasons.push("foreign_key_check_failed");
  }

  const schemaExact = Boolean(applied)
    && applied.ddl_checksum === DDL_CHECKSUM
    && OWNED_OBJECTS.every(([type, name]) =>
      ownedObjectIsExact(database, type, name)
    )
    && namespaceIsExact(database);
  const reasonCodes = [...new Set(reasons)].sort();
  const pending = allDependencies
    && reasonCodes.length === 1
    && reasonCodes[0] === "required_migration_missing";
  const ok = allDependencies
    && schemaExact
    && health.quickCheck
    && health.foreignKeyViolations === 0
    && reasonCodes.length === 0;
  const migrationRows = objectRow(
    database,
    "table",
    "platform_schema_migrations"
  ) ? database.prepare("select count(*) from platform_schema_migrations")
    .pluck().get() : 0;

  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    counts: {
      authorityRows,
      externalDependencies,
      ownedObjects: present.length,
      migrationRows,
      foreignKeyViolations: health.foreignKeyViolations
    },
    checks: {
      walletDependency: deps.wallet,
      commerceDependency: deps.commerce,
      lineageDependency: deps.lineage,
      schemaExact,
      rollbackSafe: authorityRows === 0 && externalDependencies === 0,
      zeroBackfill: authorityRows === 0,
      quickCheck: health.quickCheck && !health.failed,
      foreignKeys: health.foreignKeyViolations === 0 && !health.failed
    },
    reasonCodes,
    pendingMigrationIds: pending
      ? [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
      : []
  };
}

export function inspectAccountResourceAuthoritySchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw safeAuthorityError("authority_invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidation(reason) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    counts: {
      authorityRows: 0,
      externalDependencies: 0,
      ownedObjects: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      walletDependency: false,
      commerceDependency: false,
      lineageDependency: false,
      schemaExact: false,
      rollbackSafe: false,
      zeroBackfill: true,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: [reason],
    pendingMigrationIds: []
  };
}

export function validateAccountResourceAuthoritySchema({
  dbPath,
  database
} = {}) {
  if (database) return inspectAccountResourceAuthoritySchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectAccountResourceAuthoritySchema({ database: owned });
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

function assertDependencies(database, token) {
  const deps = dependencies(database);
  if (!(deps.wallet && deps.commerce && deps.lineage)) {
    throw internalError("authority_migration_dependency_missing", token);
  }
}

function assertExpected({ expectedMigrationId, expectedDdlChecksum }) {
  if (
    expectedMigrationId !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  ) {
    throw safeAuthorityError("authority_migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw safeAuthorityError("authority_migration_checksum_mismatch");
  }
}

function normalizeAppliedAt(nowFn, token) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw internalError("authority_invalid_migration_contract", token);
  }
  return value.toISOString();
}

function applyWithDatabase(database, nowFn, token) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    assertDependencies(database, token);
    const applied = migrationRow(
      database,
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    );
    if (applied) {
      if (applied.ddl_checksum !== DDL_CHECKSUM) {
        throw internalError("authority_migration_checksum_mismatch", token);
      }
      if (!inspectAccountResourceAuthoritySchema({ database }).ok) {
        throw internalError("authority_applied_schema_incompatible", token);
      }
      return [];
    }
    if (presentOwnedObjects(database).length > 0) {
      throw internalError("authority_owned_object_without_migration", token);
    }
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    database.prepare(`
      insert into platform_schema_migrations (
        migration_id, ddl_checksum, applied_at
      ) values (?, ?, ?)
    `).run(
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      DDL_CHECKSUM,
      normalizeAppliedAt(nowFn, token)
    );
    const inspection = inspectAccountResourceAuthoritySchema({ database });
    if (!inspection.ok || inspection.counts.authorityRows !== 0) {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    return [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID];
  });
  return migrate.immediate();
}

export function applyAccountResourceAuthorityMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  assertExpected({ expectedMigrationId, expectedDdlChecksum });
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw safeAuthorityError("authority_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  const token = Object.freeze({});
  let owned;
  try {
    const connection = database
      ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const appliedMigrationIds = applyWithDatabase(connection, nowFn, token);
    const inspection = inspectAccountResourceAuthoritySchema({
      database: connection
    });
    if (!inspection.ok) {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length === 1,
      appliedMigrationIds
    };
  } catch (error) {
    throw closeOperationError(error, token);
  } finally {
    if (owned) {
      try {
        owned.close();
      } catch {
        throw safeAuthorityError("authority_database_close_failed");
      }
    }
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sourceState(database) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectAccountResourceAuthoritySchema({ database })
  };
}

function removeOwnedDirectory(directory, root, token) {
  const resolvedDirectory = resolve(directory);
  const resolvedRoot = resolve(root);
  const child = relative(resolvedRoot, resolvedDirectory);
  if (
    child.length === 0
    || child === ".."
    || child.startsWith(`..${sep}`)
    || isAbsolute(child)
  ) {
    throw internalError("authority_invalid_temp_root", token);
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

export async function dryRunAccountResourceAuthorityMigrations({
  dbPath,
  tempRoot
} = {}) {
  assertDatabasePath(dbPath);
  const token = Object.freeze({});
  const root = tempRoot ?? tmpdir();
  let workDirectory;
  let source;
  try {
    if (typeof root !== "string" || !isAbsolute(root)) {
      throw internalError("authority_invalid_temp_root", token);
    }
    mkdirSync(root, { recursive: true });
    workDirectory = mkdtempSync(join(root, "account-authority-dry-run-"));
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    const sourceHash = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    assertDependencies(source, token);
    const before = sourceState(source);
    if (!before.inspection.ok && before.inspection.schemaState !== "pending") {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    const wasApplied = before.inspection.ok;
    await source.backup(snapshotPath);
    const applied = applyAccountResourceAuthorityMigrations({
      dbPath: snapshotPath,
      expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateAccountResourceAuthoritySchema({
      dbPath: snapshotPath
    });
    if (!validated.ok) {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    const after = sourceState(source);
    if (
      sha256File(dbPath) !== sourceHash
      || before.dataVersion !== after.dataVersion
      || before.schemaVersion !== after.schemaVersion
      || JSON.stringify(before.inspection) !== JSON.stringify(after.inspection)
    ) {
      throw internalError("authority_source_changed_during_dry_run", token);
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied
        ? []
        : [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } catch (error) {
    throw closeOperationError(error, token);
  } finally {
    let cleanupError = null;
    try {
      source?.close();
    } catch {
      cleanupError = internalError("authority_database_unavailable", token);
    }
    if (workDirectory) {
      try {
        removeOwnedDirectory(workDirectory, root, token);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) throw closeOperationError(cleanupError, token);
  }
}

function rollbackWithDatabase(database, token) {
  database.pragma("foreign_keys = ON");
  const rollback = database.transaction(() => {
    assertDependencies(database, token);
    const applied = migrationRow(
      database,
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    );
    const present = presentOwnedObjects(database);
    if (!applied) {
      if (present.length > 0) {
        throw internalError("authority_owned_object_without_migration", token);
      }
      return [];
    }
    if (applied.ddl_checksum !== DDL_CHECKSUM) {
      throw internalError("authority_migration_checksum_mismatch", token);
    }
    const inspection = inspectAccountResourceAuthoritySchema({ database });
    if (!inspection.ok) {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    if (inspection.counts.authorityRows !== 0) {
      throw internalError("authority_rollback_rows_present", token);
    }
    if (inspection.counts.externalDependencies !== 0) {
      throw internalError("authority_rollback_dependency_present", token);
    }
    for (const [, name] of [...OWNED_OBJECTS].reverse()) {
      const type = name === TABLE
        ? "table"
        : name.includes("_uidx") ? "index" : "trigger";
      database.exec(`drop ${type} ${name}`);
    }
    database.prepare(`
      delete from platform_schema_migrations where migration_id = ?
    `).run(REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID);
    const after = inspectAccountResourceAuthoritySchema({ database });
    if (after.schemaState !== "pending") {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    return [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID];
  });
  return rollback.immediate();
}

export function rollbackAccountResourceAuthorityMigration({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum
} = {}) {
  assertExpected({ expectedMigrationId, expectedDdlChecksum });
  if (!database && dbPath === undefined) {
    throw safeAuthorityError("authority_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  const token = Object.freeze({});
  let owned;
  try {
    const connection = database
      ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const rolledBackMigrationIds = rollbackWithDatabase(connection, token);
    const inspection = inspectAccountResourceAuthoritySchema({
      database: connection
    });
    if (inspection.schemaState !== "pending") {
      throw internalError("authority_applied_schema_incompatible", token);
    }
    return {
      ...inspection,
      mode: "rollback",
      sourceChanged: rolledBackMigrationIds.length === 1,
      rolledBackMigrationIds
    };
  } catch (error) {
    throw closeOperationError(error, token);
  } finally {
    if (owned) {
      try {
        owned.close();
      } catch {
        throw safeAuthorityError("authority_database_close_failed");
      }
    }
  }
}
