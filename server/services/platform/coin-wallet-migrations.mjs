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

export const REQUIRED_COIN_WALLET_MIGRATION_ID = "20260723_001_coin_wallet_foundation";

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create table platform_schema_migrations (
      migration_id text primary key,
      ddl_checksum text not null,
      applied_at text not null
    )
  `,
  `
    create table platform_coin_wallets (
      wallet_ref text primary key,
      account_id text not null unique references platform_accounts(id),
      status text not null check (status in ('active', 'frozen', 'closed')),
      version integer not null default 0 check (typeof(version) = 'integer' and version >= 0),
      created_at text not null,
      updated_at text not null
    )
  `,
  `
    create table platform_coin_lots (
      lot_ref text primary key,
      wallet_ref text not null references platform_coin_wallets(wallet_ref),
      coin_type text not null check (coin_type in ('paid_coins', 'bonus_coins', 'reward_coins')),
      credit_origin_ref text not null unique,
      issued_units integer not null check (typeof(issued_units) = 'integer' and issued_units >= 0),
      pending_units integer not null check (typeof(pending_units) = 'integer' and pending_units >= 0),
      available_units integer not null check (typeof(available_units) = 'integer' and available_units >= 0),
      held_units integer not null check (typeof(held_units) = 'integer' and held_units >= 0),
      consumed_units integer not null check (typeof(consumed_units) = 'integer' and consumed_units >= 0),
      reversed_units integer not null check (typeof(reversed_units) = 'integer' and reversed_units >= 0),
      expired_units integer not null check (typeof(expired_units) = 'integer' and expired_units >= 0),
      source_type text not null,
      source_ref text not null,
      policy_ref text,
      policy_version integer,
      expires_at text,
      created_at text not null,
      updated_at text not null,
      check (
        pending_units + available_units + held_units + consumed_units
          + reversed_units + expired_units = issued_units
      ),
      check (coin_type = 'bonus_coins' or expires_at is null),
      check (
        (
          coin_type = 'reward_coins'
          and policy_ref is not null
          and typeof(policy_version) = 'integer'
          and policy_version > 0
        )
        or
        (
          coin_type in ('paid_coins', 'bonus_coins')
          and policy_ref is null
          and policy_version is null
        )
      ),
      foreign key (credit_origin_ref)
        references platform_coin_credit_origins(credit_origin_ref)
        deferrable initially deferred
    )
  `,
  `
    create table platform_coin_holds (
      hold_ref text primary key,
      wallet_ref text not null references platform_coin_wallets(wallet_ref),
      purpose text not null check (purpose in ('product_purchase', 'reward_adjustment')),
      purpose_ref text not null,
      amount_units integer not null check (typeof(amount_units) = 'integer' and amount_units > 0),
      status text not null check (status in ('active', 'captured', 'released', 'expired', 'invalidated')),
      expires_at text not null,
      created_at text not null,
      updated_at text not null
    )
  `,
  `
    create table platform_coin_hold_allocations (
      allocation_ref text primary key,
      hold_ref text not null references platform_coin_holds(hold_ref),
      lot_ref text not null references platform_coin_lots(lot_ref),
      allocation_sequence integer not null
        check (typeof(allocation_sequence) = 'integer' and allocation_sequence > 0),
      allocated_units integer not null
        check (typeof(allocated_units) = 'integer' and allocated_units > 0),
      created_at text not null,
      unique (hold_ref, lot_ref),
      unique (hold_ref, allocation_sequence)
    )
  `,
  `
    create table platform_coin_operation_receipts (
      operation_ref text primary key,
      wallet_ref text references platform_coin_wallets(wallet_ref),
      actor_scope text not null,
      operation_type text not null,
      idempotency_key text not null,
      request_digest text not null,
      status text not null check (status in ('started', 'succeeded', 'failed')),
      previous_wallet_version integer check (
        previous_wallet_version is null
        or (
          typeof(previous_wallet_version) = 'integer'
          and previous_wallet_version >= 0
        )
      ),
      resulting_wallet_version integer check (
        resulting_wallet_version is null
        or (
          typeof(resulting_wallet_version) = 'integer'
          and resulting_wallet_version >= 0
        )
      ),
      resulting_wallet_status text check (
        resulting_wallet_status is null
        or resulting_wallet_status in ('active', 'frozen', 'closed')
      ),
      result_ref text,
      safe_result_code text,
      created_at text not null,
      completed_at text,
      unique (actor_scope, operation_type, idempotency_key),
      check (
        (
          status = 'started'
          and result_ref is null
          and safe_result_code is null
          and completed_at is null
          and previous_wallet_version is null
          and resulting_wallet_version is null
          and resulting_wallet_status is null
        )
        or
        (
          status = 'succeeded'
          and wallet_ref is not null
          and result_ref is not null
          and safe_result_code is not null
          and completed_at is not null
          and previous_wallet_version is not null
          and resulting_wallet_version is not null
          and resulting_wallet_status is not null
          and resulting_wallet_version >= previous_wallet_version
        )
        or
        (
          status = 'failed'
          and wallet_ref is not null
          and safe_result_code is not null
          and completed_at is not null
          and previous_wallet_version is not null
          and resulting_wallet_version is not null
          and resulting_wallet_status is not null
          and resulting_wallet_version = previous_wallet_version
        )
      )
    )
  `,
  `
    create table platform_coin_credit_origins (
      credit_origin_ref text primary key,
      wallet_ref text not null references platform_coin_wallets(wallet_ref),
      coin_type text not null check (coin_type in ('paid_coins', 'bonus_coins', 'reward_coins')),
      source_type text not null,
      source_ref text not null,
      source_digest text not null,
      operation_ref text not null references platform_coin_operation_receipts(operation_ref),
      lot_ref text not null unique,
      created_at text not null,
      unique (wallet_ref, coin_type, source_type, source_ref),
      foreign key (lot_ref)
        references platform_coin_lots(lot_ref)
        deferrable initially deferred
    )
  `,
  `
    create table platform_coin_ledger_entries (
      entry_ref text primary key,
      operation_ref text not null references platform_coin_operation_receipts(operation_ref),
      wallet_ref text not null references platform_coin_wallets(wallet_ref),
      lot_ref text not null references platform_coin_lots(lot_ref),
      operation text not null,
      amount_units integer not null check (typeof(amount_units) = 'integer' and amount_units > 0),
      hold_ref text references platform_coin_holds(hold_ref),
      order_ref text,
      source_type text not null,
      source_ref text not null,
      actor_type text not null,
      actor_ref text not null,
      previous_wallet_version integer not null
        check (typeof(previous_wallet_version) = 'integer' and previous_wallet_version >= 0),
      resulting_wallet_version integer not null
        check (
          typeof(resulting_wallet_version) = 'integer'
          and resulting_wallet_version > previous_wallet_version
        ),
      resulting_wallet_status text not null
        check (resulting_wallet_status in ('active', 'frozen', 'closed')),
      occurred_at text not null
    )
  `,
  `
    create index platform_coin_wallets_account_id_idx
      on platform_coin_wallets(account_id)
  `,
  `
    create index platform_coin_lots_eligible_allocation_idx
      on platform_coin_lots(wallet_ref, coin_type, expires_at, created_at, lot_ref)
      where available_units > 0
  `,
  `
    create index platform_coin_holds_active_expiry_idx
      on platform_coin_holds(expires_at, wallet_ref, hold_ref)
      where status = 'active'
  `,
  `
    create index platform_coin_operation_receipts_replay_idx
      on platform_coin_operation_receipts(actor_scope, operation_type, idempotency_key)
  `,
  `
    create index platform_coin_ledger_entries_wallet_page_idx
      on platform_coin_ledger_entries(wallet_ref, occurred_at desc, entry_ref desc)
  `,
  `
    create trigger platform_coin_ledger_entries_immutable_update
    before update on platform_coin_ledger_entries
    begin
      select raise(abort, 'coin_ledger_immutable');
    end
  `,
  `
    create trigger platform_coin_ledger_entries_immutable_delete
    before delete on platform_coin_ledger_entries
    begin
      select raise(abort, 'coin_ledger_immutable');
    end
  `,
  `
    create trigger platform_coin_operation_receipts_terminal_immutable_update
    before update on platform_coin_operation_receipts
    when old.status in ('succeeded', 'failed')
    begin
      select raise(abort, 'coin_operation_receipt_terminal_immutable');
    end
  `,
  `
    create trigger platform_coin_operation_receipts_immutable_delete
    before delete on platform_coin_operation_receipts
    begin
      select raise(abort, 'coin_operation_receipt_immutable');
    end
  `,
  `
    create trigger platform_coin_hold_allocations_immutable_update
    before update on platform_coin_hold_allocations
    begin
      select raise(abort, 'coin_hold_allocation_immutable');
    end
  `,
  `
    create trigger platform_coin_hold_allocations_immutable_delete
    before delete on platform_coin_hold_allocations
    begin
      select raise(abort, 'coin_hold_allocation_immutable');
    end
  `,
  `
    create trigger platform_coin_holds_expires_at_immutable_update
    before update of expires_at on platform_coin_holds
    when new.expires_at is not old.expires_at
    begin
      select raise(abort, 'coin_hold_expires_at_immutable');
    end
  `,
  `
    create trigger platform_coin_lots_expires_at_immutable_update
    before update of expires_at on platform_coin_lots
    when new.expires_at is not old.expires_at
    begin
      select raise(abort, 'coin_lot_expires_at_immutable');
    end
  `
]);

const OWNED_OBJECTS = Object.freeze([
  ["table", "platform_schema_migrations"],
  ["table", "platform_coin_wallets"],
  ["table", "platform_coin_lots"],
  ["table", "platform_coin_holds"],
  ["table", "platform_coin_hold_allocations"],
  ["table", "platform_coin_operation_receipts"],
  ["table", "platform_coin_credit_origins"],
  ["table", "platform_coin_ledger_entries"],
  ["index", "platform_coin_wallets_account_id_idx"],
  ["index", "platform_coin_lots_eligible_allocation_idx"],
  ["index", "platform_coin_holds_active_expiry_idx"],
  ["index", "platform_coin_operation_receipts_replay_idx"],
  ["index", "platform_coin_ledger_entries_wallet_page_idx"],
  ["trigger", "platform_coin_ledger_entries_immutable_update"],
  ["trigger", "platform_coin_ledger_entries_immutable_delete"],
  ["trigger", "platform_coin_operation_receipts_terminal_immutable_update"],
  ["trigger", "platform_coin_operation_receipts_immutable_delete"],
  ["trigger", "platform_coin_hold_allocations_immutable_update"],
  ["trigger", "platform_coin_hold_allocations_immutable_delete"],
  ["trigger", "platform_coin_holds_expires_at_immutable_update"],
  ["trigger", "platform_coin_lots_expires_at_immutable_update"]
]);

const EXPECTED_TABLE_COLUMNS = Object.freeze({
  platform_schema_migrations: [
    "migration_id", "ddl_checksum", "applied_at"
  ],
  platform_coin_wallets: [
    "wallet_ref", "account_id", "status", "version", "created_at", "updated_at"
  ],
  platform_coin_lots: [
    "lot_ref", "wallet_ref", "coin_type", "credit_origin_ref", "issued_units",
    "pending_units", "available_units", "held_units", "consumed_units",
    "reversed_units", "expired_units", "source_type", "source_ref", "policy_ref",
    "policy_version", "expires_at", "created_at", "updated_at"
  ],
  platform_coin_holds: [
    "hold_ref", "wallet_ref", "purpose", "purpose_ref", "amount_units", "status",
    "expires_at", "created_at", "updated_at"
  ],
  platform_coin_hold_allocations: [
    "allocation_ref", "hold_ref", "lot_ref", "allocation_sequence",
    "allocated_units", "created_at"
  ],
  platform_coin_operation_receipts: [
    "operation_ref", "wallet_ref", "actor_scope", "operation_type",
    "idempotency_key", "request_digest", "status", "previous_wallet_version",
    "resulting_wallet_version", "resulting_wallet_status", "result_ref",
    "safe_result_code", "created_at", "completed_at"
  ],
  platform_coin_credit_origins: [
    "credit_origin_ref", "wallet_ref", "coin_type", "source_type", "source_ref",
    "source_digest", "operation_ref", "lot_ref", "created_at"
  ],
  platform_coin_ledger_entries: [
    "entry_ref", "operation_ref", "wallet_ref", "lot_ref", "operation",
    "amount_units", "hold_ref", "order_ref", "source_type", "source_ref",
    "actor_type", "actor_ref", "previous_wallet_version",
    "resulting_wallet_version", "resulting_wallet_status", "occurred_at"
  ]
});

const EXPECTED_FOREIGN_KEYS = Object.freeze({
  platform_schema_migrations: [],
  platform_coin_wallets: [
    "account_id->platform_accounts.id"
  ],
  platform_coin_lots: [
    "credit_origin_ref->platform_coin_credit_origins.credit_origin_ref",
    "wallet_ref->platform_coin_wallets.wallet_ref"
  ],
  platform_coin_holds: [
    "wallet_ref->platform_coin_wallets.wallet_ref"
  ],
  platform_coin_hold_allocations: [
    "hold_ref->platform_coin_holds.hold_ref",
    "lot_ref->platform_coin_lots.lot_ref"
  ],
  platform_coin_operation_receipts: [
    "wallet_ref->platform_coin_wallets.wallet_ref"
  ],
  platform_coin_credit_origins: [
    "lot_ref->platform_coin_lots.lot_ref",
    "operation_ref->platform_coin_operation_receipts.operation_ref",
    "wallet_ref->platform_coin_wallets.wallet_ref"
  ],
  platform_coin_ledger_entries: [
    "hold_ref->platform_coin_holds.hold_ref",
    "lot_ref->platform_coin_lots.lot_ref",
    "operation_ref->platform_coin_operation_receipts.operation_ref",
    "wallet_ref->platform_coin_wallets.wallet_ref"
  ]
});

const EXPECTED_INDEXES = Object.freeze({
  platform_coin_wallets_account_id_idx: {
    table: "platform_coin_wallets",
    columns: ["account_id"],
    partial: 0
  },
  platform_coin_lots_eligible_allocation_idx: {
    table: "platform_coin_lots",
    columns: ["wallet_ref", "coin_type", "expires_at", "created_at", "lot_ref"],
    partial: 1
  },
  platform_coin_holds_active_expiry_idx: {
    table: "platform_coin_holds",
    columns: ["expires_at", "wallet_ref", "hold_ref"],
    partial: 1
  },
  platform_coin_operation_receipts_replay_idx: {
    table: "platform_coin_operation_receipts",
    columns: ["actor_scope", "operation_type", "idempotency_key"],
    partial: 0
  },
  platform_coin_ledger_entries_wallet_page_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["wallet_ref", "occurred_at", "entry_ref"],
    partial: 0
  }
});

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

const EXPECTED_OBJECT_SQL = new Map(
  OWNED_OBJECTS.map(([type, name], index) => [
    `${type}:${name}`,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_WALLET_DDL:v1\0${MIGRATION_STATEMENTS.map(normalizeSql).join("\0")}`,
    "utf8"
  )
  .digest("hex");

export const COIN_WALLET_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_COIN_WALLET_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);

function migrationError(code) {
  const error = new Error("Coin wallet schema operation rejected");
  error.code = code;
  return error;
}

function isKnownMigrationError(error) {
  return typeof error?.code === "string" && new Set([
    "invalid_migration_contract",
    "invalid_database_path",
    "invalid_temp_root",
    "migration_id_mismatch",
    "migration_checksum_mismatch",
    "migration_ledger_incompatible",
    "owned_object_without_migration",
    "applied_schema_incompatible",
    "migration_dependency_missing"
  ]).has(error.code);
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw migrationError("invalid_database_path");
  }
}

function objectRow(database, type, name) {
  return database.prepare(
    "select type, name, sql from sqlite_master where type = ? and name = ?"
  ).get(type, name) ?? null;
}

function migrationRow(database) {
  if (!objectRow(database, "table", "platform_schema_migrations")) return null;
  return database.prepare(`
    select migration_id, ddl_checksum, applied_at
      from platform_schema_migrations
     where migration_id = ?
  `).get(REQUIRED_COIN_WALLET_MIGRATION_ID) ?? null;
}

function assertMigrationLedgerCompatible(database) {
  const ledger = objectRow(database, "table", "platform_schema_migrations");
  if (!ledger) return;
  if (
    normalizeSql(ledger.sql)
    !== EXPECTED_OBJECT_SQL.get("table:platform_schema_migrations")
  ) {
    throw migrationError("migration_ledger_incompatible");
  }
}

function assertPr1OwnedObjectsAreAbsent(database) {
  for (const [type, name] of OWNED_OBJECTS) {
    if (objectRow(database, type, name)) {
      throw migrationError("owned_object_without_migration");
    }
  }
}

function assertPlatformAccountsDependency(database) {
  const table = objectRow(database, "table", "platform_accounts");
  if (!table) throw migrationError("migration_dependency_missing");
  const idColumn = database.pragma("table_info(platform_accounts)")
    .find(({ name }) => name === "id");
  if (!idColumn || idColumn.pk < 1) {
    throw migrationError("migration_dependency_missing");
  }
}

function integrityChecks(database) {
  let quickCheck = false;
  let foreignKeyViolations = 0;
  let integrityError = false;
  try {
    const rows = database.pragma("quick_check");
    quickCheck = rows.length === 1 && rows[0]?.quick_check === "ok";
  } catch {
    integrityError = true;
  }
  try {
    foreignKeyViolations = database.pragma("foreign_key_check").length;
  } catch {
    integrityError = true;
    foreignKeyViolations = 1;
  }
  return {
    quickCheck,
    foreignKeyViolations,
    integrityError
  };
}

function pragmaStructureIsExact(database) {
  for (const [table, expectedColumns] of Object.entries(EXPECTED_TABLE_COLUMNS)) {
    const columns = database.pragma(`table_info(${table})`).map(({ name }) => name);
    if (JSON.stringify(columns) !== JSON.stringify(expectedColumns)) return false;

    const foreignKeys = database.pragma(`foreign_key_list(${table})`)
      .map((row) => `${row.from}->${row.table}.${row.to}`)
      .sort();
    const expectedForeignKeys = [...EXPECTED_FOREIGN_KEYS[table]].sort();
    if (JSON.stringify(foreignKeys) !== JSON.stringify(expectedForeignKeys)) {
      return false;
    }
  }

  for (const [indexName, expected] of Object.entries(EXPECTED_INDEXES)) {
    const listed = database.pragma(`index_list(${expected.table})`)
      .find(({ name }) => name === indexName);
    if (!listed || listed.unique !== 0 || listed.partial !== expected.partial) {
      return false;
    }
    const columns = database.pragma(`index_info(${indexName})`).map(({ name }) => name);
    if (JSON.stringify(columns) !== JSON.stringify(expected.columns)) return false;
  }
  return true;
}

function closedInspection(database) {
  const reasons = [];
  const counts = {
    tables: 0,
    indexes: 0,
    triggers: 0,
    migrationRows: 0,
    foreignKeyViolations: 0
  };
  let schemaExact = true;

  for (const [type, name] of OWNED_OBJECTS) {
    const actual = objectRow(database, type, name);
    if (!actual) {
      reasons.push("owned_object_missing");
      schemaExact = false;
      continue;
    }
    const countKey = type === "index" ? "indexes" : `${type}s`;
    counts[countKey] += 1;
    if (normalizeSql(actual.sql) !== EXPECTED_OBJECT_SQL.get(`${type}:${name}`)) {
      reasons.push("owned_object_incompatible");
      schemaExact = false;
    }
  }
  try {
    if (!pragmaStructureIsExact(database)) {
      reasons.push("owned_object_incompatible");
      schemaExact = false;
    }
  } catch {
    reasons.push("owned_object_incompatible");
    schemaExact = false;
  }

  const ledger = objectRow(database, "table", "platform_schema_migrations");
  if (!ledger) {
    reasons.push("migration_ledger_missing");
    schemaExact = false;
  } else if (
    normalizeSql(ledger.sql)
    !== EXPECTED_OBJECT_SQL.get("table:platform_schema_migrations")
  ) {
    reasons.push("migration_ledger_incompatible");
    schemaExact = false;
  } else {
    try {
      counts.migrationRows = database.prepare(
        "select count(*) from platform_schema_migrations"
      ).pluck().get();
      const required = migrationRow(database);
      if (!required) {
        reasons.push("required_migration_missing");
        schemaExact = false;
      } else if (required.ddl_checksum !== DDL_CHECKSUM) {
        reasons.push("migration_checksum_mismatch");
        schemaExact = false;
      }
    } catch {
      reasons.push("migration_ledger_incompatible");
      schemaExact = false;
    }
  }

  const integrity = integrityChecks(database);
  counts.foreignKeyViolations = integrity.foreignKeyViolations;
  if (!integrity.quickCheck || integrity.integrityError) {
    reasons.push("quick_check_failed");
  }
  if (integrity.foreignKeyViolations > 0 || integrity.integrityError) {
    reasons.push("foreign_key_check_failed");
  }
  const reasonCodes = [...new Set(reasons)].sort();
  const checks = {
    schemaExact,
    quickCheck: integrity.quickCheck && !integrity.integrityError,
    foreignKeys: integrity.foreignKeyViolations === 0 && !integrity.integrityError
  };
  const ok = reasonCodes.length === 0
    && checks.schemaExact
    && checks.quickCheck
    && checks.foreignKeys;

  return {
    ok,
    schemaState: ok ? "ready" : "blocked",
    requiredMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    counts,
    checks,
    reasonCodes
  };
}

export function inspectCoinWalletSchema({ database } = {}) {
  if (!database || typeof database.prepare !== "function") {
    throw migrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}

function closedValidationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    counts: {
      tables: 0,
      indexes: 0,
      triggers: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: {
      schemaExact: false,
      quickCheck: false,
      foreignKeys: false
    },
    reasonCodes: [reasonCode]
  };
}

function validationFailureReason(dbPath, error) {
  if (!existsSync(dbPath)) return "database_missing";
  if (error?.code === "SQLITE_NOTADB") return "database_invalid";
  return "database_inspection_failed";
}

export function validateCoinWalletSchema({ dbPath, database } = {}) {
  if (database) return inspectCoinWalletSchema({ database });
  assertDatabasePath(dbPath);
  let owned;
  let result;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = inspectCoinWalletSchema({ database: owned });
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

function assertAppliedMigrationAndOwnedObjectsAreExact(database, applied) {
  if (applied.ddl_checksum !== DDL_CHECKSUM) {
    throw migrationError("migration_checksum_mismatch");
  }
  const inspection = inspectCoinWalletSchema({ database });
  if (!inspection.ok) throw migrationError("applied_schema_incompatible");
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
    assertMigrationLedgerCompatible(database);
    const applied = migrationRow(database);
    if (applied) {
      assertAppliedMigrationAndOwnedObjectsAreExact(database, applied);
      return [];
    }
    assertPr1OwnedObjectsAreAbsent(database);
    assertPlatformAccountsDependency(database);
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    const appliedAt = normalizeAppliedAt(nowFn);
    database.prepare(`
      insert into platform_schema_migrations (migration_id, ddl_checksum, applied_at)
      values (?, ?, ?)
    `).run(REQUIRED_COIN_WALLET_MIGRATION_ID, DDL_CHECKSUM, appliedAt);
    return [REQUIRED_COIN_WALLET_MIGRATION_ID];
  });
  return migrate.immediate();
}

export function applyCoinWalletMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  if (expectedMigrationId !== REQUIRED_COIN_WALLET_MIGRATION_ID) {
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
  const connection = database ?? (owned = new Database(dbPath, { fileMustExist: true }));
  try {
    const appliedMigrationIds = applyWithDatabase(connection, nowFn);
    const inspection = inspectCoinWalletSchema({ database: connection });
    if (!inspection.ok) throw migrationError("applied_schema_incompatible");
    return {
      ...inspection,
      mode: "apply",
      appliedMigrationIds
    };
  } catch (error) {
    if (isKnownMigrationError(error)) throw error;
    throw migrationError("migration_apply_failed");
  } finally {
    owned?.close();
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
    throw migrationError("invalid_temp_root");
  }
  rmSync(resolvedDirectory, { recursive: true, force: true });
}

function sourceHasRequiredMigration(database) {
  const ledger = objectRow(database, "table", "platform_schema_migrations");
  if (!ledger) return false;
  if (
    normalizeSql(ledger.sql)
    !== EXPECTED_OBJECT_SQL.get("table:platform_schema_migrations")
  ) {
    return false;
  }
  return Boolean(migrationRow(database));
}

export async function dryRunCoinWalletMigrations({ dbPath, tempRoot } = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw migrationError("invalid_temp_root");
  }
  mkdirSync(root, { recursive: true });
  const workDirectory = mkdtempSync(join(root, "coin-wallet-dry-run-"));
  let source;
  let wasApplied;
  try {
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    const sourceHashBefore = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    wasApplied = sourceHasRequiredMigration(source);
    await source.backup(snapshotPath);
    source.close();
    source = null;

    const applied = applyCoinWalletMigrations({
      dbPath: snapshotPath,
      expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated = validateCoinWalletSchema({ dbPath: snapshotPath });
    if (!validated.ok) throw migrationError("applied_schema_incompatible");
    const sourceHashAfter = sha256File(dbPath);
    if (sourceHashAfter !== sourceHashBefore) {
      throw migrationError("source_changed_during_dry_run");
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied
        ? []
        : [REQUIRED_COIN_WALLET_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } finally {
    source?.close();
    safeRemoveOwnedDirectory(workDirectory, root);
  }
}
