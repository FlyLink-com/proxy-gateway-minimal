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

export const LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID =
  "20260813_001_portal_registration_welcome_bonus";
export const PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID =
  "20260814_001_portal_registration_welcome_bonus_contract";
export const REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID =
  "20260815_001_portal_registration_welcome_coins_promotion_contract";

const WELCOME_GRANTS_TABLE = "platform_portal_registration_welcome_coin_grants";
const WELCOME_GRANTS_CLAIM_INDEX =
  "platform_portal_registration_welcome_coin_grants_claim_idx";
const WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER =
  "platform_portal_registration_welcome_coin_grants_timestamps_immutable";
const WELCOME_GRANTS_CONTRACT_REBUILD_TABLE =
  "platform_portal_registration_welcome_coin_grants_contract_rebuild";
const WELCOME_GRANTS_PROMOTION_REBUILD_TABLE =
  "platform_portal_registration_welcome_coin_grants_promotion_rebuild";

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table ${WELCOME_GRANTS_TABLE} (
      grant_ref text primary key,
      account_id text not null unique references platform_accounts(id) on delete cascade,
      commercial_model text not null
        check (commercial_model = 'wallet_first_unique_v1'),
      coin_type text not null check (coin_type = 'bonus_coins'),
      amount_units integer not null
        check (typeof(amount_units) = 'integer' and amount_units = 10),
      source_type text not null,
      source_ref text not null unique,
      source_digest text not null,
      actor_scope text not null,
      idempotency_key text not null,
      expires_at text not null,
      status text not null check (status in (
        'pending', 'processing', 'credited', 'expired',
        'reconciliation_required'
      )),
      next_attempt_at text not null,
      attempt_count integer not null default 0
        check (typeof(attempt_count) = 'integer' and attempt_count >= 0),
      lease_generation integer not null default 0
        check (typeof(lease_generation) = 'integer' and lease_generation >= 0),
      lease_token text,
      lease_until text,
      last_safe_code text,
      credited_lot_ref text,
      created_at text not null,
      updated_at text not null,
      credited_at text,
      unique (actor_scope, idempotency_key),
      check (
        (
          status = 'pending'
          and lease_token is null
          and lease_until is null
          and credited_lot_ref is null
          and credited_at is null
        )
        or
        (
          status = 'processing'
          and lease_token is not null
          and lease_until is not null
          and credited_lot_ref is null
          and credited_at is null
        )
        or
        (
          status = 'credited'
          and lease_token is null
          and lease_until is null
          and credited_lot_ref is not null
          and credited_at is not null
        )
        or
        (
          status in ('expired', 'reconciliation_required')
          and lease_token is null
          and lease_until is null
          and credited_lot_ref is null
          and credited_at is null
        )
      )
    )
  `,
  `
    create index ${WELCOME_GRANTS_CLAIM_INDEX}
      on ${WELCOME_GRANTS_TABLE}(
        status, next_attempt_at, lease_until, expires_at, grant_ref
      )
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

const CONTRACT_TABLE_STATEMENT = MIGRATION_STATEMENTS[0].replace(
  "expires_at text not null,",
  `expires_at text not null check (
    typeof(expires_at) = 'text'
    and typeof(created_at) = 'text'
    and length(expires_at) = 24
    and length(created_at) = 24
    and expires_at glob '????-??-??T??:??:??.???Z'
    and created_at glob '????-??-??T??:??:??.???Z'
    and strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) = expires_at
    and strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
    and strftime(
      '%Y-%m-%dT%H:%M:%fZ',
      julianday(created_at) + 7
    ) = expires_at
  ),`
);
const CONTRACT_FINAL_TABLE_EXPECTED_STATEMENT = CONTRACT_TABLE_STATEMENT.replace(
  `create table ${WELCOME_GRANTS_TABLE}`,
  `create table "${WELCOME_GRANTS_TABLE}"`
);
const PROMOTION_TABLE_STATEMENT = CONTRACT_TABLE_STATEMENT.replace(
  `commercial_model text not null
        check (commercial_model = 'wallet_first_unique_v1'),
      `,
  ""
);
const PROMOTION_FINAL_TABLE_EXPECTED_STATEMENT = PROMOTION_TABLE_STATEMENT.replace(
  `create table ${WELCOME_GRANTS_TABLE}`,
  `create table "${WELCOME_GRANTS_TABLE}"`
);

const CONTRACT_TIMESTAMP_IMMUTABLE_TRIGGER_STATEMENT = `
  create trigger ${WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER}
  before update of created_at, expires_at on ${WELCOME_GRANTS_TABLE}
  when new.created_at is not old.created_at
    or new.expires_at is not old.expires_at
  begin
    select raise(abort, 'welcome_coin_grant_timestamps_immutable');
  end
`;

const WELCOME_GRANT_COLUMNS = Object.freeze([
  "grant_ref",
  "account_id",
  "commercial_model",
  "coin_type",
  "amount_units",
  "source_type",
  "source_ref",
  "source_digest",
  "actor_scope",
  "idempotency_key",
  "expires_at",
  "status",
  "next_attempt_at",
  "attempt_count",
  "lease_generation",
  "lease_token",
  "lease_until",
  "last_safe_code",
  "credited_lot_ref",
  "created_at",
  "updated_at",
  "credited_at"
]);
const PROMOTION_WELCOME_GRANT_COLUMNS = Object.freeze(
  WELCOME_GRANT_COLUMNS.filter((column) => column !== "commercial_model")
);

const CONTRACT_MIGRATION_STATEMENTS = Object.freeze([
  CONTRACT_TABLE_STATEMENT.replace(
    WELCOME_GRANTS_TABLE,
    WELCOME_GRANTS_CONTRACT_REBUILD_TABLE
  ),
  `
    insert into ${WELCOME_GRANTS_CONTRACT_REBUILD_TABLE} (
      ${WELCOME_GRANT_COLUMNS.join(", ")}
    ) select ${WELCOME_GRANT_COLUMNS.join(", ")}
      from ${WELCOME_GRANTS_TABLE}
  `,
  `drop index ${WELCOME_GRANTS_CLAIM_INDEX}`,
  `drop table ${WELCOME_GRANTS_TABLE}`,
  `alter table ${WELCOME_GRANTS_CONTRACT_REBUILD_TABLE}
    rename to ${WELCOME_GRANTS_TABLE}`,
  MIGRATION_STATEMENTS[1],
  CONTRACT_TIMESTAMP_IMMUTABLE_TRIGGER_STATEMENT
]);
const PROMOTION_MIGRATION_STATEMENTS = Object.freeze([
  PROMOTION_TABLE_STATEMENT.replace(
    WELCOME_GRANTS_TABLE,
    WELCOME_GRANTS_PROMOTION_REBUILD_TABLE
  ),
  `
    insert into ${WELCOME_GRANTS_PROMOTION_REBUILD_TABLE} (
      ${PROMOTION_WELCOME_GRANT_COLUMNS.join(", ")}
    ) select ${PROMOTION_WELCOME_GRANT_COLUMNS.join(", ")}
      from ${WELCOME_GRANTS_TABLE}
  `,
  `drop index ${WELCOME_GRANTS_CLAIM_INDEX}`,
  `drop table ${WELCOME_GRANTS_TABLE}`,
  `alter table ${WELCOME_GRANTS_PROMOTION_REBUILD_TABLE}
    rename to ${WELCOME_GRANTS_TABLE}`,
  MIGRATION_STATEMENTS[1],
  CONTRACT_TIMESTAMP_IMMUTABLE_TRIGGER_STATEMENT
]);

const LEGACY_OWNED_OBJECTS = Object.freeze([
  ["table", WELCOME_GRANTS_TABLE],
  ["index", WELCOME_GRANTS_CLAIM_INDEX]
]);
const OWNED_OBJECTS = Object.freeze([
  ...LEGACY_OWNED_OBJECTS,
  ["trigger", WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER]
]);

const CONTRACT_EXPECTED_OBJECT_SQL = new Map(
  [
    ["table", WELCOME_GRANTS_TABLE, CONTRACT_FINAL_TABLE_EXPECTED_STATEMENT],
    ["index", WELCOME_GRANTS_CLAIM_INDEX, MIGRATION_STATEMENTS[1]],
    [
      "trigger",
      WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER,
      CONTRACT_TIMESTAMP_IMMUTABLE_TRIGGER_STATEMENT
    ]
  ].map(([type, name, statement]) => [
    `${type}:${name}`,
    normalizeSql(statement)
  ])
);
const EXPECTED_OBJECT_SQL = new Map(
  [
    ["table", WELCOME_GRANTS_TABLE, PROMOTION_FINAL_TABLE_EXPECTED_STATEMENT],
    ["index", WELCOME_GRANTS_CLAIM_INDEX, MIGRATION_STATEMENTS[1]],
    [
      "trigger",
      WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER,
      CONTRACT_TIMESTAMP_IMMUTABLE_TRIGGER_STATEMENT
    ]
  ].map(([type, name, statement]) => [
    `${type}:${name}`,
    normalizeSql(statement)
  ])
);
const LEGACY_EXPECTED_OBJECT_SQL = new Map(
  LEGACY_OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const EXPECTED_TABLE_COLUMNS = PROMOTION_WELCOME_GRANT_COLUMNS;

const EXPECTED_FOREIGN_KEYS = Object.freeze([
  "account_id->platform_accounts.id"
]);

const EXPECTED_INDEX = Object.freeze({
  table: WELCOME_GRANTS_TABLE,
  columns: [
    "status",
    "next_attempt_at",
    "lease_until",
    "expires_at",
    "grant_ref"
  ],
  unique: 0,
  partial: 0
});

const EXPECTED_LEDGER_SQL = normalizeSql(`
  create table platform_schema_migrations (
    migration_id text primary key,
    ddl_checksum text not null,
    applied_at text not null
  )
`);

const LEGACY_DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:PORTAL_REGISTRATION_WELCOME_BONUS_DDL:v1\0${
      MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");
const CONTRACT_DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:PORTAL_REGISTRATION_WELCOME_BONUS_DDL:v2\0${
      CONTRACT_MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");
const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:PORTAL_REGISTRATION_WELCOME_COINS_PROMOTION_DDL:v3\0${
      PROMOTION_MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");

export const PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    ddlChecksum: LEGACY_DDL_CHECKSUM,
    statements: MIGRATION_STATEMENTS
  }),
  Object.freeze({
    id: PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID,
    ddlChecksum: CONTRACT_DDL_CHECKSUM,
    statements: CONTRACT_MIGRATION_STATEMENTS
  }),
  Object.freeze({
    id: REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM,
    statements: PROMOTION_MIGRATION_STATEMENTS
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

const INTERNAL_MIGRATION_ERRORS = new WeakMap();

function safeMigrationError(code) {
  const error = new Error("Portal registration welcome-bonus schema rejected");
  error.code = code;
  return error;
}

function migrationError(code, invocationToken) {
  const error = safeMigrationError(code);
  INTERNAL_MIGRATION_ERRORS.set(error, Object.freeze({
    code,
    invocationToken
  }));
  return error;
}

function safeErrorCode(error) {
  try {
    const code = error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

function isSqliteContentionCode(code) {
  return (
    typeof code === "string"
    && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(code)
  );
}

function closedOperationError(error, invocationToken) {
  const provenance = INTERNAL_MIGRATION_ERRORS.get(error);
  if (
    provenance?.invocationToken === invocationToken
    && KNOWN_ERROR_CODES.has(provenance.code)
  ) {
    return safeMigrationError(provenance.code);
  }
  if (isSqliteContentionCode(safeErrorCode(error))) {
    return safeMigrationError("database_unavailable");
  }
  return safeMigrationError("migration_apply_failed");
}

function inspectWithContentionTracking(database, operation, contentionError) {
  let contention = false;

  function recordContention(error) {
    if (isSqliteContentionCode(safeErrorCode(error))) {
      contention = true;
    }
  }

  function statementView(statement) {
    let view;
    view = new Proxy(statement, {
      get(target, property) {
        let member;
        try {
          member = Reflect.get(target, property, target);
        } catch (error) {
          recordContention(error);
          throw error;
        }
        if (typeof member !== "function") return member;
        return (...args) => {
          try {
            const result = member.apply(target, args);
            return result === target ? view : result;
          } catch (error) {
            recordContention(error);
            throw error;
          }
        };
      }
    });
    return view;
  }

  let databaseView;
  databaseView = new Proxy(database, {
    get(target, property) {
      let member;
      try {
        member = Reflect.get(target, property, target);
      } catch (error) {
        recordContention(error);
        throw error;
      }
      if (typeof member !== "function") return member;
      return (...args) => {
        try {
          const result = member.apply(target, args);
          if (property === "prepare") return statementView(result);
          return result === target ? databaseView : result;
        } catch (error) {
          recordContention(error);
          throw error;
        }
      };
    }
  });

  let result;
  try {
    result = operation(databaseView);
  } catch (error) {
    if (contention) throw contentionError();
    throw error;
  }
  if (contention) throw contentionError();
  return result;
}

function inspectForApply(database, operation, invocationToken) {
  return inspectWithContentionTracking(
    database,
    operation,
    () => migrationError("database_unavailable", invocationToken)
  );
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw safeMigrationError("invalid_database_path");
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

function tableIsExact(database, expectedSql, expectedColumns = EXPECTED_TABLE_COLUMNS) {
  const row = objectRow(database, "table", WELCOME_GRANTS_TABLE);
  if (
    !row
    || row.name !== WELCOME_GRANTS_TABLE
    || normalizeSql(row.sql) !== expectedSql
  ) {
    return false;
  }
  const columns = database.pragma(`table_info(${WELCOME_GRANTS_TABLE})`)
    .map(({ name }) => name);
  if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) {
    return false;
  }
  const foreignKeys = database.pragma(`foreign_key_list(${WELCOME_GRANTS_TABLE})`)
    .map((entry) => `${entry.from}->${entry.table}.${entry.to}`)
    .sort();
  return JSON.stringify(foreignKeys)
    === JSON.stringify([...EXPECTED_FOREIGN_KEYS].sort());
}

function indexIsExact(database, expectedSql) {
  const row = objectRow(database, "index", WELCOME_GRANTS_CLAIM_INDEX);
  if (
    !row
    || row.name !== WELCOME_GRANTS_CLAIM_INDEX
    || row.tbl_name !== EXPECTED_INDEX.table
    || normalizeSql(row.sql) !== expectedSql
  ) {
    return false;
  }
  const listed = database.pragma(`index_list(${EXPECTED_INDEX.table})`)
    .find(({ name }) => name === WELCOME_GRANTS_CLAIM_INDEX);
  const columns = database.pragma(`index_info(${WELCOME_GRANTS_CLAIM_INDEX})`)
    .map(({ name }) => name);
  return listed?.unique === EXPECTED_INDEX.unique
    && listed.partial === EXPECTED_INDEX.partial
    && JSON.stringify(columns) === JSON.stringify(EXPECTED_INDEX.columns);
}

function explicitAttachedObjectsAreExact(database, expectedObjects) {
  const attachedObjects = database.prepare(`
    select type, name
      from sqlite_master
     where tbl_name = ? collate nocase
       and type in ('index', 'trigger')
       and sql is not null
     order by type asc, name asc
  `).all(WELCOME_GRANTS_TABLE).map(({ type, name }) => `${type}:${name}`);
  const expected = expectedObjects
    .map(([type, name]) => `${type}:${name}`)
    .sort();
  return JSON.stringify(attachedObjects) === JSON.stringify(expected);
}

function dependentViewsAreAbsent(database) {
  return database.prepare(`
    select count(*)
      from sqlite_master
     where type = 'view'
       and sql is not null
       and instr(lower(sql), lower(?)) > 0
  `).pluck().get(WELCOME_GRANTS_TABLE) === 0;
}

function ownedTimestampImmutableTriggerIsExact(database) {
  const row = objectRow(
    database,
    "trigger",
    WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER
  );
  return row?.name === WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER
    && row.tbl_name === WELCOME_GRANTS_TABLE
    && normalizeSql(row.sql) === EXPECTED_OBJECT_SQL.get(
      `trigger:${WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER}`
    );
}

function contractTimestampImmutableTriggerIsExact(database) {
  const row = objectRow(
    database,
    "trigger",
    WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER
  );
  return row?.name === WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER
    && row.tbl_name === WELCOME_GRANTS_TABLE
    && normalizeSql(row.sql) === CONTRACT_EXPECTED_OBJECT_SQL.get(
      `trigger:${WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER}`
    );
}

function ownedTableIsExact(database) {
  return tableIsExact(
    database,
    EXPECTED_OBJECT_SQL.get(`table:${WELCOME_GRANTS_TABLE}`)
  );
}

function ownedIndexIsExact(database) {
  return indexIsExact(
    database,
    EXPECTED_OBJECT_SQL.get(`index:${WELCOME_GRANTS_CLAIM_INDEX}`)
  );
}

function ownedObjectsAreExact(database) {
  return ownedTableIsExact(database)
    && ownedIndexIsExact(database)
    && ownedTimestampImmutableTriggerIsExact(database)
    && explicitAttachedObjectsAreExact(database, [
      ["index", WELCOME_GRANTS_CLAIM_INDEX],
      ["trigger", WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER]
    ])
    && dependentViewsAreAbsent(database);
}

function legacyOwnedObjectsAreExact(database) {
  return tableIsExact(
    database,
    LEGACY_EXPECTED_OBJECT_SQL.get(`table:${WELCOME_GRANTS_TABLE}`),
    WELCOME_GRANT_COLUMNS
  )
    && indexIsExact(
      database,
      LEGACY_EXPECTED_OBJECT_SQL.get(`index:${WELCOME_GRANTS_CLAIM_INDEX}`)
    )
    && !namedObjectRow(database, WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER)
    && explicitAttachedObjectsAreExact(database, [
      ["index", WELCOME_GRANTS_CLAIM_INDEX]
    ])
    && dependentViewsAreAbsent(database);
}

function contractOwnedObjectsAreExact(database) {
  return tableIsExact(
    database,
    CONTRACT_EXPECTED_OBJECT_SQL.get(`table:${WELCOME_GRANTS_TABLE}`),
    WELCOME_GRANT_COLUMNS
  )
    && indexIsExact(
      database,
      CONTRACT_EXPECTED_OBJECT_SQL.get(`index:${WELCOME_GRANTS_CLAIM_INDEX}`)
    )
    && contractTimestampImmutableTriggerIsExact(database)
    && explicitAttachedObjectsAreExact(database, [
      ["index", WELCOME_GRANTS_CLAIM_INDEX],
      ["trigger", WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER]
    ])
    && dependentViewsAreAbsent(database);
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
  const foundationDependency = ledgerState === "compatible"
    && foundationDependencyIsExact(database);
  let migrationRows = 0;
  let legacyRow = null;
  let contractRow = null;
  let successorRow = null;
  if (ledgerState === "compatible") {
    migrationRows = database.prepare(
      "select count(*) from platform_schema_migrations"
    ).pluck().get();
    legacyRow = migrationRow(
      database,
      LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    );
    contractRow = migrationRow(
      database,
      PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID
    );
    successorRow = migrationRow(
      database,
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    );
  } else if (ledgerState === "incompatible") {
    reasons.push("migration_ledger_incompatible");
  }

  const presentTargetNames = OWNED_OBJECTS
    .filter(([, name]) => namedObjectRow(database, name));
  const presentTables = OWNED_OBJECTS
    .filter(([type, name]) => type === "table" && objectRow(database, type, name));
  const presentIndexes = OWNED_OBJECTS
    .filter(([type, name]) => type === "index" && objectRow(database, type, name));

  if (!foundationDependency && ledgerState !== "incompatible") {
    reasons.push("migration_dependency_missing");
  }
  if (foundationDependency && !legacyRow) {
    if (presentTargetNames.length === 0) {
      reasons.push("required_migration_missing");
    } else {
      reasons.push("owned_object_without_migration");
    }
  } else if (
    foundationDependency
    && legacyRow.ddl_checksum !== LEGACY_DDL_CHECKSUM
  ) {
    reasons.push("migration_checksum_mismatch");
  } else if (foundationDependency && !contractRow) {
    if (legacyOwnedObjectsAreExact(database)) {
      reasons.push("required_migration_missing");
    } else if (
      !objectRow(database, "table", WELCOME_GRANTS_TABLE)
      || !objectRow(database, "index", WELCOME_GRANTS_CLAIM_INDEX)
    ) {
      reasons.push("owned_object_missing");
    } else {
      reasons.push("owned_object_incompatible");
    }
  } else if (
    foundationDependency
    && contractRow.ddl_checksum !== CONTRACT_DDL_CHECKSUM
  ) {
    reasons.push("migration_checksum_mismatch");
  } else if (foundationDependency && !successorRow) {
    if (contractOwnedObjectsAreExact(database)) {
      reasons.push("required_migration_missing");
    } else if (
      !objectRow(database, "table", WELCOME_GRANTS_TABLE)
      || !objectRow(database, "index", WELCOME_GRANTS_CLAIM_INDEX)
      || !objectRow(database, "trigger", WELCOME_GRANTS_TIMESTAMP_IMMUTABLE_TRIGGER)
    ) {
      reasons.push("owned_object_missing");
    } else {
      reasons.push("owned_object_incompatible");
    }
  } else if (foundationDependency && successorRow.ddl_checksum !== DDL_CHECKSUM) {
    reasons.push("migration_checksum_mismatch");
  } else if (foundationDependency && !ownedObjectsAreExact(database)) {
    if (OWNED_OBJECTS.some(([type, name]) => !objectRow(database, type, name))) {
      reasons.push("owned_object_missing");
    } else {
      reasons.push("owned_object_incompatible");
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
  const schemaExact = successorRow?.ddl_checksum === DDL_CHECKSUM
    && ownedObjectsAreExact(database);
  const checks = {
    foundationDependency,
    schemaExact,
    quickCheck: integrity.quickCheck && !integrity.integrityError,
    foreignKeys:
      integrity.foreignKeyViolations === 0 && !integrity.integrityError
  };
  const counts = {
    tables: presentTables.length,
    indexes: presentIndexes.length,
    migrationRows,
    foreignKeyViolations: integrity.foreignKeyViolations
  };
  const pending = foundationDependency
    && reasonCodes.length === 1
    && reasonCodes[0] === "required_migration_missing";
  const pendingMigrationIds = pending
    ? legacyRow
      ? contractRow
        ? [REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID]
        : [
          PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID,
          REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
        ]
      : [
        LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
        PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID,
        REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
      ]
    : [];
  const ok = foundationDependency
    && reasonCodes.length === 0
    && checks.schemaExact
    && checks.quickCheck
    && checks.foreignKeys;

  return {
    ok,
    schemaState: ok ? "ready" : pending ? "pending" : "blocked",
    requiredMigrationId:
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    counts,
    checks,
    reasonCodes,
    pendingMigrationIds
  };
}

export function inspectPortalRegistrationWelcomeBonusSchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw safeMigrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId:
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    counts: {
      tables: 0,
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
  const code = safeErrorCode(error);
  if (code === "database_unavailable") return "database_unavailable";
  if (code === "SQLITE_NOTADB") return "database_invalid";
  if (isSqliteContentionCode(code)) return "database_unavailable";
  return "database_inspection_failed";
}

export function validatePortalRegistrationWelcomeBonusSchema({
  dbPath,
  database
} = {}) {
  if (database) {
    return inspectPortalRegistrationWelcomeBonusSchema({ database });
  }
  assertDatabasePath(dbPath);
  let owned;
  let result;
  let closeFailed = false;
  try {
    try {
      owned = new Database(dbPath, { readonly: true, fileMustExist: true });
      result = inspectWithContentionTracking(
        owned,
        (inspectionDatabase) =>
          inspectPortalRegistrationWelcomeBonusSchema({
            database: inspectionDatabase
          }),
        () => safeMigrationError("database_unavailable")
      );
    } catch (error) {
      try {
        result = closedValidationFailure(validationFailureReason(dbPath, error));
      } catch {
        result = closedValidationFailure("database_inspection_failed");
      }
    }
  } finally {
    try {
      owned?.close();
    } catch {
      closeFailed = true;
    }
  }
  if (closeFailed) return closedValidationFailure("database_close_failed");
  return result;
}

function assertFoundationDependency(database, invocationToken) {
  if (
    !inspectForApply(
      database,
      (inspectionDatabase) => foundationDependencyIsExact(inspectionDatabase),
      invocationToken
    )
  ) {
    throw migrationError("migration_dependency_missing", invocationToken);
  }
}

function assertOwnedObjectsAreAbsent(database, invocationToken) {
  if (OWNED_OBJECTS.some(([, name]) => namedObjectRow(database, name))) {
    throw migrationError("owned_object_without_migration", invocationToken);
  }
}

function normalizeAppliedAt(nowFn, invocationToken) {
  const value = nowFn();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw migrationError("invalid_migration_contract", invocationToken);
  }
  return value.toISOString();
}

function insertMigrationLedgerRow(database, migrationId, ddlChecksum, appliedAt) {
  database.prepare(`
    insert into platform_schema_migrations
      (migration_id, ddl_checksum, applied_at)
    values (?, ?, ?)
  `).run(migrationId, ddlChecksum, appliedAt);
}

function applyWithDatabase(database, nowFn, invocationToken) {
  database.pragma("foreign_keys = ON");
  const migrate = database.transaction(() => {
    assertFoundationDependency(database, invocationToken);
    const successor = migrationRow(
      database,
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    );
    if (successor) {
      if (successor.ddl_checksum !== DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch", invocationToken);
      }
      if (
        !inspectForApply(
          database,
          (inspectionDatabase) =>
            inspectPortalRegistrationWelcomeBonusSchema({
              database: inspectionDatabase
            }),
          invocationToken
        ).ok
      ) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
      return [];
    }

    const appliedMigrationIds = [];
    const legacy = migrationRow(
      database,
      LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
    );
    const contract = migrationRow(
      database,
      PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID
    );
    const appliedAt = normalizeAppliedAt(nowFn, invocationToken);
    if (!legacy) {
      assertOwnedObjectsAreAbsent(database, invocationToken);
      for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
      insertMigrationLedgerRow(
        database,
        LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
        LEGACY_DDL_CHECKSUM,
        appliedAt
      );
      appliedMigrationIds.push(LEGACY_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID);
    } else {
      if (legacy.ddl_checksum !== LEGACY_DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch", invocationToken);
      }
      if (!contract && !legacyOwnedObjectsAreExact(database)) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
    }

    if (!contract) {
      for (const statement of CONTRACT_MIGRATION_STATEMENTS) database.exec(statement);
      insertMigrationLedgerRow(
        database,
        PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID,
        CONTRACT_DDL_CHECKSUM,
        appliedAt
      );
      appliedMigrationIds.push(PORTAL_REGISTRATION_WELCOME_BONUS_CONTRACT_MIGRATION_ID);
    } else {
      if (contract.ddl_checksum !== CONTRACT_DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch", invocationToken);
      }
      if (!contractOwnedObjectsAreExact(database)) {
        throw migrationError("applied_schema_incompatible", invocationToken);
      }
    }

    for (const statement of PROMOTION_MIGRATION_STATEMENTS) database.exec(statement);
    insertMigrationLedgerRow(
      database,
      REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
      DDL_CHECKSUM,
      appliedAt
    );
    appliedMigrationIds.push(REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID);
    if (
      !inspectForApply(
        database,
        (inspectionDatabase) =>
          inspectPortalRegistrationWelcomeBonusSchema({
            database: inspectionDatabase
          }),
        invocationToken
      ).ok
    ) {
      throw migrationError("applied_schema_incompatible", invocationToken);
    }
    return appliedMigrationIds;
  });
  return migrate.immediate();
}

export function applyPortalRegistrationWelcomeBonusMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  if (
    expectedMigrationId
    !== REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
  ) {
    throw safeMigrationError("migration_id_mismatch");
  }
  if (expectedDdlChecksum !== DDL_CHECKSUM) {
    throw safeMigrationError("migration_checksum_mismatch");
  }
  if (typeof nowFn !== "function" || (!database && dbPath === undefined)) {
    throw safeMigrationError("invalid_migration_contract");
  }
  if (!database) assertDatabasePath(dbPath);

  const invocationToken = Object.freeze({});
  let owned;
  try {
    const connection = database ?? (owned = new Database(dbPath, {
      fileMustExist: true
    }));
    const appliedMigrationIds = applyWithDatabase(
      connection,
      nowFn,
      invocationToken
    );
    const inspection = inspectForApply(
      connection,
      (inspectionDatabase) => inspectPortalRegistrationWelcomeBonusSchema({
        database: inspectionDatabase
      }),
      invocationToken
    );
    if (!inspection.ok) {
      throw migrationError("applied_schema_incompatible", invocationToken);
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length > 0,
      appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error, invocationToken);
  } finally {
    if (owned) {
      try {
        owned.close();
      } catch {
        throw safeMigrationError("database_close_failed");
      }
    }
  }
}

function assertAbsoluteTempRoot(root, invocationToken) {
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw migrationError("invalid_temp_root", invocationToken);
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sourceInspectionState(database) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectPortalRegistrationWelcomeBonusSchema({ database })
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

function safeRemoveOwnedDirectory(directory, root, invocationToken) {
  const resolvedDirectory = resolve(directory);
  const resolvedRoot = resolve(root);
  const child = relative(resolvedRoot, resolvedDirectory);
  if (
    child.length === 0
    || child === ".."
    || child.startsWith(`..${sep}`)
    || isAbsolute(child)
  ) {
    throw migrationError("invalid_temp_root", invocationToken);
  }
  try {
    rmSync(resolvedDirectory, { recursive: true, force: true });
  } catch {
    throw migrationError("migration_apply_failed", invocationToken);
  }
}

export async function dryRunPortalRegistrationWelcomeBonusMigrations({
  dbPath,
  tempRoot
} = {}) {
  assertDatabasePath(dbPath);
  const invocationToken = Object.freeze({});
  const root = tempRoot ?? tmpdir();
  let workDirectory;
  let source;
  let sourceReadTransaction = false;
  try {
    assertAbsoluteTempRoot(root, invocationToken);
    mkdirSync(root, { recursive: true });
    workDirectory = mkdtempSync(
      join(root, "portal-registration-welcome-bonus-dry-run-")
    );
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    const verificationSnapshotPath = join(workDirectory, "verification.sqlite");
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    source.exec("begin");
    sourceReadTransaction = true;
    assertFoundationDependency(source, invocationToken);
    const sourceInspectionBefore =
      inspectPortalRegistrationWelcomeBonusSchema({ database: source });
    const sourceStateBefore = sourceInspectionState(source);
    const wasApplied = sourceInspectionBefore.ok;
    await source.backup(snapshotPath);
    const sourceSnapshotHash = sha256File(snapshotPath);
    const sourceStateAfter = sourceInspectionState(source);
    source.exec("rollback");
    sourceReadTransaction = false;
    const applied = applyPortalRegistrationWelcomeBonusMigrations({
      dbPath: snapshotPath,
      expectedMigrationId:
        REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validatePortalRegistrationWelcomeBonusSchema({
      dbPath: snapshotPath
    });
    if (!validated.ok) {
      throw migrationError("applied_schema_incompatible", invocationToken);
    }
    const verification = new Database(dbPath, { readonly: true, fileMustExist: true });
    let verificationState;
    let sourceSnapshotUnchanged;
    try {
      verificationState = sourceInspectionState(verification);
      await verification.backup(verificationSnapshotPath);
      sourceSnapshotUnchanged = sha256File(verificationSnapshotPath)
        === sourceSnapshotHash;
    } finally {
      verification.close();
    }
    if (
      !sourceInspectionStateIsUnchanged(
        sourceStateBefore,
        sourceStateAfter
      )
      || !sourceLogicalStateIsUnchanged(
        sourceStateBefore,
        verificationState
      )
      || !sourceSnapshotUnchanged
    ) {
      throw migrationError("source_changed_during_dry_run", invocationToken);
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied
        ? []
        : sourceInspectionBefore.pendingMigrationIds,
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error, invocationToken);
  } finally {
    let cleanupError = null;
    if (sourceReadTransaction) {
      try {
        source?.exec("rollback");
      } catch {
        // Preserve the primary closed operation error while releasing a read-only snapshot.
      }
    }
    try {
      source?.close();
    } catch {
      cleanupError = migrationError("database_close_failed", invocationToken);
    }
    if (workDirectory) {
      try {
        safeRemoveOwnedDirectory(workDirectory, root, invocationToken);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) {
      throw closedOperationError(cleanupError, invocationToken);
    }
  }
}
