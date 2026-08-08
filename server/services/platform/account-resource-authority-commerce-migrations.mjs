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
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  inspectAccountResourceAuthoritySchema
} from "./account-resource-authority-migrations.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  inspectCoinCommerceSchema
} from "./coin-commerce-migrations.mjs";

export const REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID =
  "20260808_001_account_resource_authority_commerce_binding";

const TABLE = "platform_commerce_authority_quote_bindings";
const SAFE_INTEGER_MAX = 9_007_199_254_740_991;

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_commerce_authority_quote_bindings (
      quote_ref text primary key
        references platform_coin_commerce_quotes(quote_ref)
          on delete restrict,
      authority_ref text not null
        references platform_account_resource_authorities(authority_ref)
          on delete restrict,
      account_id text not null
        references platform_accounts(id) on delete restrict,
      authority_version integer not null check (
        typeof(authority_version) = 'integer'
        and authority_version between 1 and ${SAFE_INTEGER_MAX}
      ),
      resource_request_id text not null
        references platform_issuance_requests(id) on delete restrict,
      entitlement_id text not null
        references platform_entitlements(id) on delete restrict,
      issued_link_id text not null
        references platform_issued_subscription_links(id) on delete restrict,
      created_at text not null check (length(trim(created_at)) > 0),
      foreign key (account_id, authority_version)
        references platform_account_resource_authorities(account_id, version)
          on delete restrict
    )
  `,
  `
    create trigger commerce_authority_quote_bindings_insert_guard
    before insert on platform_commerce_authority_quote_bindings
    when not exists (
      select 1
        from platform_coin_commerce_quotes q
        join platform_account_resource_authorities a
          on a.authority_ref = new.authority_ref
       where q.quote_ref = new.quote_ref
         and q.account_id = new.account_id
         and q.status = 'active'
         and a.status = 'active'
         and a.account_id = new.account_id
         and a.version = new.authority_version
         and a.resource_request_id = new.resource_request_id
         and a.entitlement_id = new.entitlement_id
         and a.issued_link_id = new.issued_link_id
    )
    begin
      select raise(abort, 'commerce_authority_quote_binding_invalid');
    end
  `,
  `
    create trigger commerce_authority_quote_bindings_update_deny
    before update on platform_commerce_authority_quote_bindings
    begin
      select raise(abort, 'commerce_authority_quote_binding_immutable');
    end
  `,
  `
    create trigger commerce_authority_quote_bindings_delete_deny
    before delete on platform_commerce_authority_quote_bindings
    begin
      select raise(abort, 'commerce_authority_quote_binding_immutable');
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
  ["trigger", "commerce_authority_quote_bindings_insert_guard"],
  ["trigger", "commerce_authority_quote_bindings_update_deny"],
  ["trigger", "commerce_authority_quote_bindings_delete_deny"]
]);
const EXPECTED_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);
const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_DDL:v1\0${MIGRATION_STATEMENTS
      .map(normalizeSql)
      .join("\0")}`,
    "utf8"
  )
  .digest("hex");

export const ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);

const INTERNAL_ERRORS = new WeakMap();
const INTERNAL_CODES = new Set([
  "authority_commerce_applied_schema_incompatible",
  "authority_commerce_invalid_migration_contract",
  "authority_commerce_invalid_temp_root",
  "authority_commerce_migration_checksum_mismatch",
  "authority_commerce_migration_dependency_missing",
  "authority_commerce_owned_object_without_migration",
  "authority_commerce_rollback_dependency_present",
  "authority_commerce_rollback_rows_present",
  "authority_commerce_source_changed_during_dry_run"
]);

function migrationError(code) {
  const error = new Error("Account resource authority Commerce schema rejected");
  error.code = code;
  return error;
}

function internalError(code, token) {
  const error = migrationError(code);
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
    return migrationError(provenance.code);
  }
  if (isContention(safeCode(error))) {
    return migrationError("authority_commerce_database_unavailable");
  }
  return migrationError("authority_commerce_migration_apply_failed");
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw migrationError("authority_commerce_invalid_database_path");
  }
}

function objectRow(database, type, name) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from main.sqlite_master
     where type = ? and name = ? collate nocase
  `).get(type, name) ?? null;
}

function namedObjectRow(database, name) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from main.sqlite_master
     where name = ? collate nocase
  `).get(name) ?? null;
}

function migrationRow(database, migrationId) {
  if (!objectRow(database, "table", "platform_schema_migrations")) return null;
  return database.prepare(`
    select migration_id, ddl_checksum, applied_at
      from main.platform_schema_migrations
     where migration_id = ?
  `).get(migrationId) ?? null;
}

function dependencyIsExact(database, { migrationId, checksum, inspect }) {
  try {
    return migrationRow(database, migrationId)?.ddl_checksum === checksum
      && inspect({ database }).ok === true;
  } catch {
    return false;
  }
}

function dependencies(database) {
  return {
    authority: dependencyIsExact(database, {
      migrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      checksum: ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
      inspect: inspectAccountResourceAuthoritySchema
    }),
    commerce: dependencyIsExact(database, {
      migrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
      checksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
      inspect: inspectCoinCommerceSchema
    })
  };
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
      from main.sqlite_master
     where name = ? or tbl_name = ?
     order by type, name
  `).all(TABLE, TABLE).filter(({ name }) => !name.startsWith(
    "sqlite_autoindex_"
  ));
  const expected = OWNED_OBJECTS
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

function schemaObjects(database, schema) {
  return database.prepare(`
    select type, name, tbl_name, sql
      from ${schema}.sqlite_master
     where sql is not null
       and name not like 'sqlite_%'
     order by type, name
  `).all();
}

function sqliteTokens(sql) {
  const source = String(sql);
  const tokens = [];
  let index = 0;
  const identifierStart = (value) => /[A-Za-z_\u0080-\uFFFF]/.test(value);
  const identifierPart = (value) => /[A-Za-z0-9_$\u0080-\uFFFF]/.test(value);

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === "-" && source[index + 1] === "-") {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) return null;
      index = end + 2;
      continue;
    }
    if (character === "'") {
      let value = "";
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] !== "'") {
          value += source[index];
          index += 1;
          continue;
        }
        if (source[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) return null;
      tokens.push({ type: "single-quoted", value: value.toLowerCase() });
      continue;
    }
    if (character === '"' || character === "`") {
      const delimiter = character;
      let value = "";
      let closed = false;
      index += 1;
      while (index < source.length) {
        if (source[index] !== delimiter) {
          value += source[index];
          index += 1;
          continue;
        }
        if (source[index + 1] === delimiter) {
          value += delimiter;
          index += 2;
          continue;
        }
        index += 1;
        closed = true;
        break;
      }
      if (!closed) return null;
      tokens.push({ type: "identifier", value: value.toLowerCase() });
      continue;
    }
    if (character === "[") {
      const end = source.indexOf("]", index + 1);
      if (end === -1) return null;
      tokens.push({
        type: "identifier",
        value: source.slice(index + 1, end).toLowerCase()
      });
      index = end + 1;
      continue;
    }
    if (identifierStart(character)) {
      let end = index + 1;
      while (end < source.length && identifierPart(source[end])) end += 1;
      tokens.push({
        type: "word",
        value: source.slice(index, end).toLowerCase()
      });
      index = end;
      continue;
    }
    tokens.push({ type: "symbol", value: character });
    index += 1;
  }
  return tokens;
}

function triggerTargetsExactTempShadow(row) {
  const tokens = sqliteTokens(row.sql);
  if (!tokens) return false;
  const tableName = TABLE.toLowerCase();
  if (tokens.some(({ type, value }) =>
    type === "single-quoted" && value === tableName
  )) {
    return false;
  }
  const tableReferences = tokens.filter(({ type, value }) =>
    (type === "word" || type === "identifier") && value === tableName
  );
  if (tableReferences.length !== 1) return false;
  const trigger = tokens.findIndex(({ type, value }) =>
    type === "word" && value === "trigger"
  );
  const on = tokens.findIndex(({ type, value }, index) =>
    index > trigger && type === "word" && value === "on"
  );
  if (trigger === -1 || on === -1) return false;
  const schema = tokens[on + 1];
  const dot = tokens[on + 2];
  const table = tokens[on + 3];
  return (schema?.type === "word" || schema?.type === "identifier")
    && schema.value === "temp"
    && dot?.type === "symbol"
    && dot.value === "."
    && (table?.type === "word" || table?.type === "identifier")
    && table.value === tableName;
}

function exactTempShadowKeys(objects) {
  const relevant = objects.filter(({ name, tbl_name: tableName }) =>
    name === TABLE || tableName === TABLE
  );
  const actual = relevant
    .map(({ type, name }) => `${type}:${name}`)
    .sort();
  const expected = OWNED_OBJECTS
    .map(([type, name]) => `${type}:${name}`)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return new Set();
  }
  const rows = new Map(
    relevant.map((row) => [`${row.type}:${row.name}`, row])
  );
  for (const [type, name] of OWNED_OBJECTS) {
    if (type === "table") continue;
    if (!triggerTargetsExactTempShadow(rows.get(`${type}:${name}`))) {
      return new Set();
    }
  }
  return new Set(expected);
}

function externalDependencyCount(database) {
  const consumers = new Set();
  const tableName = TABLE.toLowerCase();
  const objectsBySchema = {
    main: schemaObjects(database, "main"),
    temp: schemaObjects(database, "temp")
  };
  const tempShadowKeys = exactTempShadowKeys(objectsBySchema.temp);

  for (const [schema, objects] of Object.entries(objectsBySchema)) {
    for (const row of objects) {
      const objectKey = `${row.type}:${row.name}`;
      const consumerKey = `${schema}:${objectKey}`;
      if (
        (schema === "main" && OWNED_OBJECT_KEYS.has(objectKey))
        || (schema === "temp" && tempShadowKeys.has(objectKey))
      ) {
        continue;
      }
      if (String(row.sql).toLowerCase().includes(tableName)) {
        consumers.add(consumerKey);
      }
      if (row.type !== "table" || row.name === TABLE) continue;
      const foreignKeys = database.pragma(
        `${schema}.foreign_key_list(${quotedIdentifier(row.name)})`
      );
      if (foreignKeys.some((foreignKey) =>
        String(foreignKey.table).toLowerCase() === tableName
      )) {
        consumers.add(consumerKey);
      }
    }
  }
  return consumers.size;
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

function bindingRowCount(database) {
  if (!objectRow(database, "table", TABLE)) return 0;
  try {
    const count = database.prepare(`select count(*) from main.${TABLE}`)
      .pluck().get();
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

function closedInspection(database) {
  const reasonCodes = [];
  const deps = dependencies(database);
  const allDependencies = deps.authority && deps.commerce;
  if (!allDependencies) {
    reasonCodes.push("authority_commerce_migration_dependency_missing");
  }
  const applied = migrationRow(
    database,
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
  );
  const present = presentOwnedObjects(database);
  if (!applied && present.length === 0 && allDependencies) {
    reasonCodes.push("required_migration_missing");
  } else if (!applied && present.length > 0) {
    reasonCodes.push("owned_object_without_migration");
  } else if (applied && applied.ddl_checksum !== DDL_CHECKSUM) {
    reasonCodes.push("migration_checksum_mismatch");
  } else if (applied) {
    for (const [type, name] of OWNED_OBJECTS) {
      if (!namedObjectRow(database, name)) {
        reasonCodes.push("owned_object_missing");
      } else if (!ownedObjectIsExact(database, type, name)) {
        reasonCodes.push("owned_object_incompatible");
      }
    }
    if (!namespaceIsExact(database)) {
      reasonCodes.push("owned_object_incompatible");
    }
  }

  const bindingRows = bindingRowCount(database);
  if (bindingRows === null) {
    reasonCodes.push("binding_row_count_unknown");
  }
  const externalDependencies = externalDependencyCount(database);
  const health = integrity(database);
  if (!health.quickCheck || health.failed) reasonCodes.push("quick_check_failed");
  if (health.foreignKeyViolations > 0 || health.failed) {
    reasonCodes.push("foreign_key_check_failed");
  }
  const schemaExact = Boolean(applied)
    && applied.ddl_checksum === DDL_CHECKSUM
    && OWNED_OBJECTS.every(([type, name]) =>
      ownedObjectIsExact(database, type, name)
    )
    && namespaceIsExact(database);
  const reasons = [...new Set(reasonCodes)].sort();
  const pending = allDependencies
    && reasons.length === 1
    && reasons[0] === "required_migration_missing";
  const ok = allDependencies
    && schemaExact
    && health.quickCheck
    && health.foreignKeyViolations === 0
    && reasons.length === 0;
  const migrationRows = objectRow(
    database,
    "table",
    "platform_schema_migrations"
  ) ? database.prepare("select count(*) from main.platform_schema_migrations")
    .pluck().get() : 0;

  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId:
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    counts: {
      bindingRows,
      externalDependencies,
      ownedObjects: present.length,
      migrationRows,
      foreignKeyViolations: health.foreignKeyViolations
    },
    checks: {
      authorityDependency: deps.authority,
      commerceDependency: deps.commerce,
      schemaExact,
      rollbackSafe:
        bindingRows === 0 && externalDependencies === 0,
      zeroBackfill: bindingRows === 0,
      quickCheck: health.quickCheck && !health.failed,
      foreignKeys: health.foreignKeyViolations === 0 && !health.failed
    },
    reasonCodes: reasons,
    pendingMigrationIds: pending
      ? [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID]
      : []
  };
}

export function inspectAccountResourceAuthorityCommerceSchema({
  database
} = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw migrationError("authority_commerce_invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidation(reason) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId:
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    counts: {
      bindingRows: null,
      externalDependencies: null,
      ownedObjects: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      authorityDependency: false,
      commerceDependency: false,
      schemaExact: false,
      rollbackSafe: false,
      zeroBackfill: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: [reason],
    pendingMigrationIds: []
  };
}

export function validateAccountResourceAuthorityCommerceSchema({
  dbPath,
  database
} = {}) {
  if (database) {
    try {
      return inspectAccountResourceAuthorityCommerceSchema({ database });
    } catch (error) {
      const code = safeCode(error);
      if (code === "authority_commerce_invalid_migration_contract") {
        throw error;
      }
      if (isContention(code)) {
        return closedValidation("database_unavailable");
      }
      if (code === "SQLITE_NOTADB") {
        return closedValidation("database_invalid");
      }
      return closedValidation("database_inspection_failed");
    }
  }
  assertDatabasePath(dbPath);
  let owned;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    return inspectAccountResourceAuthorityCommerceSchema({ database: owned });
  } catch (error) {
    if (!existsSync(dbPath)) return closedValidation("database_missing");
    if (isContention(safeCode(error))) {
      return closedValidation("database_unavailable");
    }
    if (safeCode(error) === "SQLITE_NOTADB") {
      return closedValidation("database_invalid");
    }
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
  if (
    expectedMigrationId
    !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
  ) {
    throw migrationError("authority_commerce_migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw migrationError("authority_commerce_migration_checksum_mismatch");
  }
}

function applyWithDatabase(database, nowFn, token) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    const deps = dependencies(database);
    if (!(deps.authority && deps.commerce)) {
      throw internalError(
        "authority_commerce_migration_dependency_missing",
        token
      );
    }
    const applied = migrationRow(
      database,
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
    );
    if (applied) {
      if (applied.ddl_checksum !== DDL_CHECKSUM) {
        throw internalError(
          "authority_commerce_migration_checksum_mismatch",
          token
        );
      }
      if (!inspectAccountResourceAuthorityCommerceSchema({ database }).ok) {
        throw internalError(
          "authority_commerce_applied_schema_incompatible",
          token
        );
      }
      return [];
    }
    if (presentOwnedObjects(database).length > 0) {
      throw internalError(
        "authority_commerce_owned_object_without_migration",
        token
      );
    }
    const now = nowFn();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw internalError(
        "authority_commerce_invalid_migration_contract",
        token
      );
    }
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    database.prepare(`
      insert into main.platform_schema_migrations (
        migration_id, ddl_checksum, applied_at
      ) values (?, ?, ?)
    `).run(
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      DDL_CHECKSUM,
      now.toISOString()
    );
    const inspection = inspectAccountResourceAuthorityCommerceSchema({ database });
    if (!inspection.ok || inspection.counts.bindingRows !== 0) {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
    }
    return [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID];
  });
  return migrate.immediate();
}

export function applyAccountResourceAuthorityCommerceMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  assertExpected({ expectedMigrationId, expectedDdlChecksum });
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw migrationError("authority_commerce_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  const token = Object.freeze({});
  let owned;
  try {
    const connection = database
      ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const appliedMigrationIds = applyWithDatabase(connection, nowFn, token);
    const inspection = inspectAccountResourceAuthorityCommerceSchema({
      database: connection
    });
    if (!inspection.ok) {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
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
        throw migrationError("authority_commerce_database_close_failed");
      }
    }
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sourceSchemaState(database) {
  return {
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectAccountResourceAuthorityCommerceSchema({ database })
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
    throw internalError("authority_commerce_invalid_temp_root", token);
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

export async function dryRunAccountResourceAuthorityCommerceMigrations({
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
      throw internalError("authority_commerce_invalid_temp_root", token);
    }
    mkdirSync(root, { recursive: true });
    workDirectory = mkdtempSync(join(root, "authority-commerce-dry-run-"));
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    const initialVersionBefore = source.pragma("data_version", {
      simple: true
    });
    const sourceHash = sha256File(dbPath);
    const deps = dependencies(source);
    if (!(deps.authority && deps.commerce)) {
      throw internalError(
        "authority_commerce_migration_dependency_missing",
        token
      );
    }
    const before = sourceSchemaState(source);
    const initialVersionAfter = source.pragma("data_version", {
      simple: true
    });
    if (initialVersionBefore !== initialVersionAfter) {
      throw internalError(
        "authority_commerce_source_changed_during_dry_run",
        token
      );
    }
    if (!before.inspection.ok && before.inspection.schemaState !== "pending") {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
    }
    const wasApplied = before.inspection.ok;
    await source.backup(snapshotPath);
    const applied = applyAccountResourceAuthorityCommerceMigrations({
      dbPath: snapshotPath,
      expectedMigrationId:
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateAccountResourceAuthorityCommerceSchema({
      dbPath: snapshotPath
    });
    if (!validated.ok) {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
    }
    const finalVersionBefore = source.pragma("data_version", {
      simple: true
    });
    const finalHash = sha256File(dbPath);
    const after = sourceSchemaState(source);
    const finalVersionAfter = source.pragma("data_version", {
      simple: true
    });
    if (
      finalHash !== sourceHash
      || initialVersionBefore !== finalVersionBefore
      || initialVersionBefore !== finalVersionAfter
      || before.schemaVersion !== after.schemaVersion
      || JSON.stringify(before.inspection) !== JSON.stringify(after.inspection)
    ) {
      throw internalError(
        "authority_commerce_source_changed_during_dry_run",
        token
      );
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied
        ? []
        : [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } catch (error) {
    throw closeOperationError(error, token);
  } finally {
    let cleanupError = null;
    try {
      source?.close();
    } catch (error) {
      cleanupError = error;
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
    const deps = dependencies(database);
    if (!(deps.authority && deps.commerce)) {
      throw internalError(
        "authority_commerce_migration_dependency_missing",
        token
      );
    }
    const applied = migrationRow(
      database,
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
    );
    const present = presentOwnedObjects(database);
    if (!applied) {
      if (present.length > 0) {
        throw internalError(
          "authority_commerce_owned_object_without_migration",
          token
        );
      }
      const pending = inspectAccountResourceAuthorityCommerceSchema({
        database
      });
      if (pending.counts.externalDependencies !== 0) {
        throw internalError(
          "authority_commerce_rollback_dependency_present",
          token
        );
      }
      if (
        pending.schemaState !== "pending"
        || pending.counts.bindingRows !== 0
        || pending.counts.ownedObjects !== 0
        || pending.pendingMigrationIds.length !== 1
        || pending.pendingMigrationIds[0]
          !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ) {
        throw internalError(
          "authority_commerce_applied_schema_incompatible",
          token
        );
      }
      return [];
    }
    if (applied.ddl_checksum !== DDL_CHECKSUM) {
      throw internalError(
        "authority_commerce_migration_checksum_mismatch",
        token
      );
    }
    const inspection = inspectAccountResourceAuthorityCommerceSchema({
      database
    });
    if (!inspection.ok) {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
    }
    if (inspection.counts.bindingRows !== 0) {
      throw internalError(
        "authority_commerce_rollback_rows_present",
        token
      );
    }
    if (inspection.counts.externalDependencies !== 0) {
      throw internalError(
        "authority_commerce_rollback_dependency_present",
        token
      );
    }
    for (const [type, name] of [...OWNED_OBJECTS].reverse()) {
      database.exec(`drop ${type} main.${quotedIdentifier(name)}`);
    }
    const deleted = database.prepare(`
      delete from main.platform_schema_migrations
       where migration_id = ? and ddl_checksum = ?
    `).run(
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
      DDL_CHECKSUM
    );
    if (deleted.changes !== 1) {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
    }
    const pending = inspectAccountResourceAuthorityCommerceSchema({
      database
    });
    if (
      pending.schemaState !== "pending"
      || pending.counts.bindingRows !== 0
      || pending.counts.externalDependencies !== 0
      || pending.counts.ownedObjects !== 0
      || pending.pendingMigrationIds.length !== 1
      || pending.pendingMigrationIds[0]
        !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
    ) {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
    }
    return [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID];
  });
  return rollback.immediate();
}

export function rollbackAccountResourceAuthorityCommerceMigration({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum
} = {}) {
  assertExpected({ expectedMigrationId, expectedDdlChecksum });
  if (!database && dbPath === undefined) {
    throw migrationError("authority_commerce_invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);
  const token = Object.freeze({});
  let owned;
  try {
    const connection = database
      ?? (owned = new Database(dbPath, { fileMustExist: true }));
    if (connection.inTransaction === true) {
      throw internalError(
        "authority_commerce_invalid_migration_contract",
        token
      );
    }
    const rolledBackMigrationIds = rollbackWithDatabase(connection, token);
    const inspection = inspectAccountResourceAuthorityCommerceSchema({
      database: connection
    });
    if (inspection.schemaState !== "pending") {
      throw internalError(
        "authority_commerce_applied_schema_incompatible",
        token
      );
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
        throw migrationError("authority_commerce_database_close_failed");
      }
    }
  }
}
