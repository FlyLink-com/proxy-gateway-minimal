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
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  inspectCoinCommerceSchema,
  registerPlanSwitchNamespaceExclusion
} from "./coin-commerce-migrations.mjs";

export const REQUIRED_PLAN_SWITCH_MIGRATION_ID =
  "20261010_001_coin_commerce_plan_switch";

export const PLAN_SWITCH_QUOTES_TABLE =
  "platform_coin_commerce_plan_switch_quotes";
export const PLAN_SWITCH_SCHEDULED_TABLE =
  "platform_scheduled_plan_switches";

// Verbatim schema rollback from docs/MONTHLY_CARD_PLAN_SWITCH.md.
// Scheduled switches are dropped first. Quote rows may still name a
// superseded switch; cancels_switch_ref is not a SQL foreign key.
export const PLAN_SWITCH_SCHEMA_ROLLBACK_STATEMENTS = Object.freeze([
  "drop table platform_scheduled_plan_switches;",
  "drop table platform_coin_commerce_plan_switch_quotes;"
]);

const SAFE_INTEGER_MAX = 9_007_199_254_740_991;

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_coin_commerce_plan_switch_quotes (
      quote_ref text primary key
        references platform_coin_commerce_quotes(quote_ref) on delete restrict,
      account_id text not null
        references platform_accounts(id) on delete restrict,
      entitlement_id text not null check (length(trim(entitlement_id)) > 0),
      kind text not null check (kind in (
        'renewal',
        'upgrade_inplace',
        'upgrade_restart',
        'downgrade_scheduled'
      )),
      from_offer_version_ref text not null check (
        length(trim(from_offer_version_ref)) > 0
      ),
      to_offer_version_ref text not null check (
        length(trim(to_offer_version_ref)) > 0
      ),
      snapshot_valid_from text not null check (
        length(trim(snapshot_valid_from)) > 0
      ),
      snapshot_valid_until text not null check (
        length(trim(snapshot_valid_until)) > 0
      ),
      list_price_units integer not null check (
        typeof(list_price_units) = 'integer'
        and list_price_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      credit_units integer not null check (
        typeof(credit_units) = 'integer'
        and credit_units between 0 and ${SAFE_INTEGER_MAX}
      ),
      pending_credit_units integer not null check (
        typeof(pending_credit_units) = 'integer'
        and pending_credit_units between 0 and ${SAFE_INTEGER_MAX}
      ),
      charge_units integer not null check (
        typeof(charge_units) = 'integer'
        and charge_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      cancels_switch_ref text,
      effective_at text,
      created_at text not null check (length(trim(created_at)) > 0),
      check (snapshot_valid_from < snapshot_valid_until),
      check (
        (
          kind = 'renewal'
          and from_offer_version_ref = to_offer_version_ref
        )
        or (
          kind <> 'renewal'
          and from_offer_version_ref <> to_offer_version_ref
        )
      ),
      check (
        (
          kind = 'downgrade_scheduled'
          and effective_at is not null
          and length(trim(effective_at)) > 0
        )
        or (
          kind <> 'downgrade_scheduled'
          and effective_at is null
        )
      )
    )
  `,
  `
    create trigger platform_coin_commerce_plan_switch_quotes_update_deny
    before update on platform_coin_commerce_plan_switch_quotes
    begin
      select raise(abort, 'plan_switch_quote_update_denied');
    end
  `,
  `
    create trigger platform_coin_commerce_plan_switch_quotes_delete_deny
    before delete on platform_coin_commerce_plan_switch_quotes
    begin
      select raise(abort, 'plan_switch_quote_delete_denied');
    end
  `,
  `
    create table platform_scheduled_plan_switches (
      switch_ref text primary key
        references platform_coin_commerce_orders(order_ref) on delete restrict,
      account_id text not null
        references platform_accounts(id) on delete restrict,
      entitlement_id text not null check (length(trim(entitlement_id)) > 0),
      from_offer_version_ref text not null check (
        length(trim(from_offer_version_ref)) > 0
      ),
      to_offer_version_ref text not null check (
        length(trim(to_offer_version_ref)) > 0
      ),
      effective_at text not null check (length(trim(effective_at)) > 0),
      paid_units integer not null check (
        typeof(paid_units) = 'integer'
        and paid_units between 1 and ${SAFE_INTEGER_MAX}
      ),
      status text not null check (
        status in ('scheduled', 'applied', 'superseded')
      ),
      created_at text not null check (length(trim(created_at)) > 0),
      resolved_at text,
      superseded_by_order_ref text,
      check (from_offer_version_ref <> to_offer_version_ref),
      check (
        (
          status = 'scheduled'
          and resolved_at is null
          and superseded_by_order_ref is null
        )
        or (
          status = 'applied'
          and resolved_at is not null
          and length(trim(resolved_at)) > 0
          and superseded_by_order_ref is null
        )
        or (
          status = 'superseded'
          and resolved_at is not null
          and length(trim(resolved_at)) > 0
          and superseded_by_order_ref is not null
          and length(trim(superseded_by_order_ref)) > 0
        )
      )
    )
  `,
  `
    create unique index platform_scheduled_plan_switches_one_scheduled_uidx
      on platform_scheduled_plan_switches(account_id)
      where status = 'scheduled'
  `,
  `
    create trigger platform_scheduled_plan_switches_insert_guard
    before insert on platform_scheduled_plan_switches
    when new.status <> 'scheduled'
      or new.resolved_at is not null
      or new.superseded_by_order_ref is not null
    begin
      select raise(abort, 'plan_switch_insert_state_invalid');
    end
  `,
  `
    create trigger platform_scheduled_plan_switches_status_transition
    before update on platform_scheduled_plan_switches
    when not (
      old.status = 'scheduled'
      and new.status in ('applied', 'superseded')
      and new.switch_ref = old.switch_ref
      and new.account_id = old.account_id
      and new.entitlement_id = old.entitlement_id
      and new.from_offer_version_ref = old.from_offer_version_ref
      and new.to_offer_version_ref = old.to_offer_version_ref
      and new.effective_at = old.effective_at
      and new.paid_units = old.paid_units
      and new.created_at = old.created_at
      and new.resolved_at is not null
      and length(trim(new.resolved_at)) > 0
      and (
        (
          new.status = 'applied'
          and new.superseded_by_order_ref is null
        )
        or (
          new.status = 'superseded'
          and new.superseded_by_order_ref is not null
          and length(trim(new.superseded_by_order_ref)) > 0
        )
      )
    )
    begin
      select raise(abort, 'plan_switch_status_transition_denied');
    end
  `,
  `
    create trigger platform_scheduled_plan_switches_delete_deny
    before delete on platform_scheduled_plan_switches
    begin
      select raise(abort, 'plan_switch_delete_denied');
    end
  `,
  `
    create trigger platform_coin_commerce_plan_switch_quotes_cancel_ref_guard
    before insert on platform_coin_commerce_plan_switch_quotes
    when new.cancels_switch_ref is not null
      and not exists (
        select 1
          from platform_scheduled_plan_switches scheduled
         where scheduled.switch_ref = new.cancels_switch_ref
           and scheduled.account_id = new.account_id
           and scheduled.status = 'scheduled'
      )
    begin
      select raise(abort, 'plan_switch_quote_cancel_ref_invalid');
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
    .replace(/\s*([(),=<>])\s*/g, "$1")
    .toLowerCase()
    .replace(/\0(\d+)\0/g, (_match, index) => literals[Number(index)]);
}

const OWNED_OBJECTS = Object.freeze([
  ["table", PLAN_SWITCH_QUOTES_TABLE],
  ["trigger", "platform_coin_commerce_plan_switch_quotes_update_deny"],
  ["trigger", "platform_coin_commerce_plan_switch_quotes_delete_deny"],
  ["table", PLAN_SWITCH_SCHEDULED_TABLE],
  ["index", "platform_scheduled_plan_switches_one_scheduled_uidx"],
  ["trigger", "platform_scheduled_plan_switches_insert_guard"],
  ["trigger", "platform_scheduled_plan_switches_status_transition"],
  ["trigger", "platform_scheduled_plan_switches_delete_deny"],
  ["trigger", "platform_coin_commerce_plan_switch_quotes_cancel_ref_guard"]
]);

const EXPECTED_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

// Commerce validation treats every platform_coin_commerce_* object as its own.
// The quote table uses that prefix, so an exact plan-switch object is excluded
// from the commerce namespace. A different SQL text stays inside it and fails
// closed. Objects that are absent leave the commerce check unchanged.
export function planSwitchCommerceNamespaceRowIsExact(row) {
  if (
    !row
    || typeof row.type !== "string"
    || typeof row.name !== "string"
    || typeof row.sql !== "string"
  ) {
    return false;
  }
  const expected = EXPECTED_SQL.get(`${row.type}:${row.name}`);
  return typeof expected === "string" && normalizeSql(row.sql) === expected;
}

registerPlanSwitchNamespaceExclusion(planSwitchCommerceNamespaceRowIsExact);

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
    `select count(*) from ${PLAN_SWITCH_SCHEDULED_TABLE} where status = 'scheduled'`
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

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
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
    const sourceHashBefore = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
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
    if (sha256File(dbPath) !== sourceHashBefore || before !== after) {
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
