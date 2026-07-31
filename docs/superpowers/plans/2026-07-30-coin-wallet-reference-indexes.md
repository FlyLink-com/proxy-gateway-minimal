# Coin Wallet Reference Indexes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one independently checksum-bound Wallet successor migration that creates exactly three reverse-reference indexes, proves their query plans and local recovery behavior, and exposes a closed source-only CLI without changing Wallet or Commerce semantics.

**Architecture:** Keep the frozen Wallet foundation runner and CLI byte-for-byte unchanged. Add a small successor migration module and matching CLI that share `platform_schema_migrations`, require the exact foundation identity, apply all successor objects inside one `BEGIN IMMEDIATE`, and validate only synthetic or explicitly supplied SQLite files.

**Tech Stack:** Node.js ESM (`20.x || 22.x || 23.x || 24.x || 25.x || 26.x`), `node:test`, `better-sqlite3@^12.10.0`, PowerShell, Git.

## Global Constraints

- Risk is A because this is SQLite schema/migration source, but this plan is source-only.
- Expected PR count is exactly one: `codex/wallet-reference-indexes`.
- Source baseline is `origin/master@b949b15b676af5837c8eeb04494a425524496d9d`.
- Approved design authority is `docs/superpowers/specs/2026-07-30-coin-wallet-reference-indexes-design.md`.
- Foundation migration ID remains exactly `20260723_001_coin_wallet_foundation`.
- Foundation checksum remains exactly `03422fd22ae8047aea8374ed0e34ebaaf8663c90c24d7bbefef11d66498b02e7`.
- Successor migration ID is exactly `20260730_001_coin_wallet_reference_indexes`.
- Successor checksum is exactly `2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b`.
- The successor checksum domain is exactly `GCCWEBOS:COIN_WALLET_REFERENCE_INDEX_DDL:v1`.
- Create exactly three full, non-unique, non-partial, single-column indexes in the approved order.
- Do not use `IF NOT EXISTS`, covering indexes, composite indexes, partial indexes, or runtime `INDEXED BY`.
- Do not modify the Wallet foundation module, foundation CLI, or their tests.
- Do not modify Wallet Store, ledger semantics, Commerce order logic, product contracts, fulfillment, Portal/Admin, payment/provider code, runtime flags, or production configuration.
- Do not add a down-migration or rollback CLI. DROP is allowed only inside an owned disposable test database.
- Tests may use only synthetic references and owned temporary SQLite files.
- Do not connect to, copy, inspect, or modify production; do not use SSH or provider access.
- A merged source PR remains `production_state: not_deployed`; a production Wallet schema Gate is a separate later approval.

---

## File Map

Create:

- `server/services/platform/coin-wallet-reference-index-migrations.mjs` — successor identity, exact schema inspection, validate, apply, and dry-run.
- `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs` — migration, dependency, atomicity, recovery, and EXPLAIN TDD.
- `scripts/platform-coin-wallet-reference-index-schema.mjs` — closed validate/dry-run/apply CLI.
- `server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs` — process, exit-code, argument, safe-output, and package-script TDD.

Modify during implementation:

- `package.json` — add only `platform:coin-wallet:reference-index-schema`.
- `docs/COINS_WALLET_SCHEMA_GATE.md` — document the successor identity, command, dependency, local validation, and later production gate.
- `docs/SUBSCRIPTION_CONTROL_DATABASE.md` — record successor ownership in the shared migration ledger.
- `docs/README.md` — index the approved plan and implemented source-only gate.

Frozen with zero changes:

- `server/services/platform/coin-wallet-migrations.mjs`
- `scripts/platform-coin-wallet-schema.mjs`
- `server/tests/platform-coin-wallet-migrations.test.mjs`
- `server/tests/platform-coin-wallet-schema-cli.test.mjs`

The successor module exports exactly:

```js
REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
COIN_WALLET_REFERENCE_INDEX_MIGRATIONS
inspectCoinWalletReferenceIndexSchema
validateCoinWalletReferenceIndexSchema
applyCoinWalletReferenceIndexMigrations
dryRunCoinWalletReferenceIndexMigrations
```

The successor closed inspection shape is:

```js
{
  ok: boolean,
  schemaState: "ready" | "pending" | "blocked",
  requiredMigrationId: "20260730_001_coin_wallet_reference_indexes",
  counts: {
    indexes: number,
    migrationRows: number,
    foreignKeyViolations: number
  },
  checks: {
    foundationDependency: boolean,
    schemaExact: boolean,
    quickCheck: boolean,
    foreignKeys: boolean
  },
  reasonCodes: string[],
  pendingMigrationIds: string[]
}
```

`counts.indexes` counts only the three owned successor names,
`counts.migrationRows` counts all rows in the shared migration ledger (matching
the frozen Wallet/Commerce inspectors), and `counts.foreignKeyViolations`
contains only the aggregate violation count. No count contains row content.

`appliedMigrationIds` means migrations applied by the current operation, not
all migrations already present. Therefore `validate` always exposes an empty
`appliedMigrationIds` through the CLI; current readiness is represented by
`schemaState`, `requiredMigrationId`, and `checks`.

### Task 1: Freeze The Successor Identity And DDL

**Files:**

- Create: `server/services/platform/coin-wallet-reference-index-migrations.mjs`
- Create: `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs`

**Interfaces:**

- Consumes: `COIN_WALLET_MIGRATIONS` and `REQUIRED_COIN_WALLET_MIGRATION_ID` from the frozen foundation module.
- Produces: the two successor identity exports and the internal ordered DDL used by later tasks.

- [ ] **Step 1: Write the failing identity and side-effect tests**

Start the test file with exact namespace checks:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import * as walletFoundation from "../services/platform/coin-wallet-migrations.mjs";
import {
  COIN_WALLET_REFERENCE_INDEX_MIGRATIONS,
  REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
} from "../services/platform/coin-wallet-reference-index-migrations.mjs";

const FOUNDATION_CHECKSUM =
  "03422fd22ae8047aea8374ed0e34ebaaf8663c90c24d7bbefef11d66498b02e7";
const SUCCESSOR_CHECKSUM =
  "2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b";

test("exports one frozen successor identity without changing the foundation namespace", () => {
  assert.deepEqual(Object.keys(walletFoundation).sort(), [
    "COIN_WALLET_MIGRATIONS",
    "REQUIRED_COIN_WALLET_MIGRATION_ID",
    "applyCoinWalletMigrations",
    "dryRunCoinWalletMigrations",
    "inspectCoinWalletSchema",
    "validateCoinWalletSchema"
  ]);
  assert.equal(walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID,
    "20260723_001_coin_wallet_foundation");
  assert.equal(walletFoundation.COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    FOUNDATION_CHECKSUM);
  assert.equal(REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    "20260730_001_coin_wallet_reference_indexes");
  assert.deepEqual(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS, [{
    id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    ddlChecksum: SUCCESSOR_CHECKSUM
  }]);
  assert.equal(Object.isFrozen(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS), true);
  assert.equal(Object.isFrozen(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS[0]), true);
});

test("importing the successor module has no database or filesystem side effect", () => {
  const directory = mkdtempSync(join(tmpdir(), "wallet-reference-import-"));
  try {
    const moduleUrl = pathToFileURL(
      join(process.cwd(), "server", "services", "platform",
        "coin-wallet-reference-index-migrations.mjs")
    ).href;
    const result = spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(moduleUrl)})`
    ], {
      cwd: directory,
      encoding: "utf8",
      env: {},
      windowsHide: true
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for
`coin-wallet-reference-index-migrations.mjs`.

- [ ] **Step 3: Implement the frozen identity and exact DDL**

Create the module with these statements in this exact order:

```js
import { createHash } from "node:crypto";

export const REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID =
  "20260730_001_coin_wallet_reference_indexes";

const MIGRATION_STATEMENTS = Object.freeze([
  `
    create index platform_coin_hold_allocations_lot_ref_idx
      on platform_coin_hold_allocations(lot_ref)
  `,
  `
    create index platform_coin_ledger_entries_lot_ref_idx
      on platform_coin_ledger_entries(lot_ref)
  `,
  `
    create index platform_coin_ledger_entries_hold_ref_idx
      on platform_coin_ledger_entries(hold_ref)
  `
]);
```

Copy the foundation normalizer into this new module without exporting it:

```js
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
```

Derive and export the frozen identity:

```js
const DDL_CHECKSUM = createHash("sha256")
  .update(
    `GCCWEBOS:COIN_WALLET_REFERENCE_INDEX_DDL:v1\0${
      MIGRATION_STATEMENTS.map(normalizeSql).join("\0")
    }`,
    "utf8"
  )
  .digest("hex");

export const COIN_WALLET_REFERENCE_INDEX_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    ddlChecksum: DDL_CHECKSUM
  })
]);
```

- [ ] **Step 4: Run the identity tests to verify GREEN**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: 2 tests PASS and checksum equals the frozen successor literal.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- server/services/platform/coin-wallet-reference-index-migrations.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
git commit -m "feat: freeze wallet reference index migration"
```

### Task 2: Add Closed Inspection And Read-Only Validation

**Files:**

- Modify: `server/services/platform/coin-wallet-reference-index-migrations.mjs`
- Modify: `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs`

**Interfaces:**

- Consumes: the exact foundation migration row/checksum and `inspectCoinWalletSchema({ database })`.
- Produces:
  - `inspectCoinWalletReferenceIndexSchema({ database })`
  - `validateCoinWalletReferenceIndexSchema({ dbPath, database })`
  - the frozen closed result shape used by apply, dry-run, and the CLI.

- [ ] **Step 1: Add failing synthetic fixture and inspection tests**

Add a helper that creates `platform_accounts`, one unrelated sentinel table,
then invokes the frozen foundation apply:

```js
function createFoundationDatabase(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table synthetic_reference_index_sentinel (
      sentinel_key text primary key,
      sentinel_value text not null
    );
    insert into synthetic_reference_index_sentinel
      values ('preserve', 'synthetic-private-marker');
  `);
  database.close();
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum:
      walletFoundation.COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
  seedCanonicalWalletRows(dbPath);
}

function seedCanonicalWalletRows(dbPath) {
  const database = new Database(dbPath);
  const timestamp = "2026-07-30T00:00:00.000Z";
  try {
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      database.prepare(`
        insert into platform_accounts
          (id, owner_ref, status, created_at, updated_at, metadata_json)
        values (?, ?, ?, ?, ?, ?)
      `).run(
        "account_private", "owner_private", "active",
        timestamp, timestamp, "{}"
      );
      database.prepare(`
        insert into platform_coin_wallets
          (wallet_ref, account_id, status, version, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?)
      `).run(
        "wallet_private", "account_private", "active", 1,
        timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_operation_receipts (
          operation_ref, wallet_ref, actor_scope, operation_type,
          idempotency_key, request_digest, status, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "operation_private", "wallet_private", "system:synthetic", "credit",
        "idempotency_private", "digest_private", "succeeded", 0, 1, "active",
        "lot_private", "credited", timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_credit_origins (
          credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
          source_digest, operation_ref, lot_ref, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "origin_private", "wallet_private", "paid_coins", "synthetic",
        "source_private", "source_digest_private", "operation_private",
        "lot_private", timestamp
      );
      database.prepare(`
        insert into platform_coin_lots (
          lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
          pending_units, available_units, held_units, consumed_units,
          reversed_units, expired_units, source_type, source_ref, policy_ref,
          policy_version, expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "lot_private", "wallet_private", "paid_coins", "origin_private",
        10, 0, 8, 2, 0, 0, 0, "synthetic", "source_private",
        null, null, null, timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "hold_private", "wallet_private", "product_purchase", "order_private",
        2, "active", "2026-08-30T00:00:00.000Z", timestamp, timestamp
      );
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence,
          allocated_units, created_at
        ) values (?, ?, ?, ?, ?, ?)
      `).run(
        "allocation_private", "hold_private", "lot_private", 1, 2, timestamp
      );
      database.prepare(`
        insert into platform_coin_ledger_entries (
          entry_ref, operation_ref, wallet_ref, lot_ref, operation,
          amount_units, hold_ref, order_ref, source_type, source_ref,
          actor_type, actor_ref, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, occurred_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "entry_private", "operation_private", "wallet_private", "lot_private",
        "hold", 2, "hold_private", "order_private", "synthetic",
        "source_private", "system", "actor_private", 0, 1, "active", timestamp
      );
    }).immediate();
  } finally {
    database.close();
  }
}
```

Extend the test imports with `createHash`/`readFileSync`,
`better-sqlite3`, and `applyCoinWalletMigrations`. Add these exact test helpers:

```js
function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function withOwnedDatabase(prefix, callback) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(directory, "database.sqlite");
  try {
    return await callback({ directory, dbPath });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function assertPending(result) {
  assert.deepEqual(result, {
    ok: false,
    schemaState: "pending",
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    counts: {
      indexes: 0,
      migrationRows: 1,
      foreignKeyViolations: 0
    },
    checks: {
      foundationDependency: true,
      schemaExact: false,
      quickCheck: true,
      foreignKeys: true
    },
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    ]
  });
}
```

Implement these named cases with separate owned database files:

| Test name | Exact setup and assertions |
| --- | --- |
| `validate reports foundation-only state as pending without writing` | Create the foundation fixture; capture `fileSha256(dbPath)`; call `validateCoinWalletReferenceIndexSchema({ dbPath })`; call `assertPending(result)`; assert the file hash is unchanged. |
| `missing drifted and incompatible foundation dependencies fail closed` | Case 1 has only `platform_accounts`; case 2 changes the foundation ledger checksum to 64 zeroes; case 3 drops `platform_coin_ledger_entries_wallet_page_idx`. For each, assert `ok === false`, `schemaState === "blocked"`, `checks.foundationDependency === false`, `reasonCodes === ["migration_dependency_missing"]`, and `pendingMigrationIds` is empty. |
| `an incompatible shared migration ledger returns a closed rejection without throwing` | Replace the foundation ledger with `create table platform_schema_migrations (migration_id text primary key, applied_at text not null)`. Call both injected `inspect` and path-based `validate`; assert neither throws and each is `blocked` with `foundationDependency === false`, `reasonCodes === ["migration_ledger_incompatible"]`, and no pending ID. |
| `exact successor objects and row inspect ready while unrelated future rows remain allowed` | Execute the three approved test-fixture `CREATE INDEX` statements and insert the exact successor row; also add `synthetic_unrelated_ledger_lot_ref_idx` with equivalent columns and a future ledger row. Assert `ready`, `ok === true`, `counts === { indexes: 3, migrationRows: 3, foreignKeyViolations: 0 }` (foundation + successor + future), every check is true, and `pendingMigrationIds` is empty. |
| `a successor ledger checksum mismatch is blocked without mutation` | Create the three exact target indexes, insert the successor row with 64 zeroes as checksum, snapshot file hash and canonical state, then validate. Assert `blocked`, `reasonCodes === ["migration_checksum_mismatch"]`, `pendingMigrationIds` is empty, and both snapshots are unchanged. |
| `partial successor state and applied index drift are blocked` | Case 1 has no successor row and only the first target index: expect `owned_object_without_migration`. Case 2 has the exact row but only two target indexes: expect `owned_object_missing`. With an exact row, separately replace a target by (3) the same name on the wrong column, (4) a unique index on the right column, (5) a partial index on the right column, and (6) the same name on the wrong table; each expects `owned_object_incompatible`. Every case is `blocked`, has `schemaExact === false`, and has no pending ID. |

Use literal SQL only inside the test fixture; do not export production DDL.

- [ ] **Step 2: Run the new tests to verify RED**

Run:

```powershell
node --test --test-name-pattern "pending|foundation|successor|ledger|partial" server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: FAIL because both inspection exports are absent.

- [ ] **Step 3: Implement the exact dependency and inspection state machine**

Extend the module imports now so later tasks do not change their names:

```js
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
```

Add the closed error and path primitives:

```js
function migrationError(code) {
  const error = new Error("Coin wallet reference-index schema rejected");
  error.code = code;
  return error;
}

function assertDatabasePath(dbPath) {
  if (typeof dbPath !== "string" || !isAbsolute(dbPath)) {
    throw migrationError("invalid_database_path");
  }
}
```

Define the exact owned index shape:

```js
const EXPECTED_INDEXES = Object.freeze({
  platform_coin_hold_allocations_lot_ref_idx: {
    table: "platform_coin_hold_allocations",
    columns: ["lot_ref"],
    unique: 0,
    partial: 0
  },
  platform_coin_ledger_entries_lot_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["lot_ref"],
    unique: 0,
    partial: 0
  },
  platform_coin_ledger_entries_hold_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["hold_ref"],
    unique: 0,
    partial: 0
  }
});

const EXPECTED_INDEX_SQL = new Map(
  Object.keys(EXPECTED_INDEXES).map((name, index) => [
    name,
    normalizeSql(MIGRATION_STATEMENTS[index])
  ])
);

const EXPECTED_LEDGER_SQL = normalizeSql(`
  create table platform_schema_migrations (
    migration_id text primary key,
    ddl_checksum text not null,
    applied_at text not null
  )
`);

function objectRow(database, type, name) {
  return database.prepare(
    "select type, name, tbl_name, sql from sqlite_master"
      + " where type = ? and name = ?"
  ).get(type, name) ?? null;
}

function namedObjectRow(database, name) {
  return database.prepare(
    "select type, name, tbl_name, sql from sqlite_master where name = ?"
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

function ownedIndexIsExact(database, name) {
  const expected = EXPECTED_INDEXES[name];
  const row = objectRow(database, "index", name);
  if (
    !row
    || row.tbl_name !== expected.table
    || normalizeSql(row.sql) !== EXPECTED_INDEX_SQL.get(name)
  ) {
    return false;
  }
  const listed = database.pragma(`index_list(${expected.table})`)
    .find((candidate) => candidate.name === name);
  const columns = database.pragma(`index_info(${name})`)
    .map(({ name: column }) => column);
  return listed?.unique === expected.unique
    && listed.partial === expected.partial
    && JSON.stringify(columns) === JSON.stringify(expected.columns);
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
```

Use only these safe reason codes:

```js
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
```

Put the following deterministic state rules inside
`closedInspection(database)` and use only the owned names:

```js
function closedInspection(database) {
const reasons = [];
const ledgerState = migrationLedgerState(database);
const foundationDependency =
  ledgerState === "compatible"
  && foundationDependencyIsExact(database);
let migrationRows = 0;
let successorRow = null;
if (ledgerState === "compatible") {
  migrationRows = database.prepare(
    "select count(*) from platform_schema_migrations"
  ).pluck().get();
  successorRow = migrationRow(
    database,
    REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
  );
} else if (ledgerState === "incompatible") {
  reasons.push("migration_ledger_incompatible");
}
const presentTargetNames = Object.keys(EXPECTED_INDEXES)
  .filter((name) => namedObjectRow(database, name));
const presentIndexes = Object.keys(EXPECTED_INDEXES)
  .filter((name) => objectRow(database, "index", name));

if (!foundationDependency && ledgerState !== "incompatible") {
  reasons.push("migration_dependency_missing");
}
if (
  foundationDependency
  && !successorRow
  && presentTargetNames.length === 0
) {
  reasons.push("required_migration_missing");
} else if (foundationDependency && !successorRow) {
  reasons.push("owned_object_without_migration");
} else if (
  foundationDependency
  && successorRow.ddl_checksum !== DDL_CHECKSUM
) {
  reasons.push("migration_checksum_mismatch");
} else if (foundationDependency) {
  for (const name of Object.keys(EXPECTED_INDEXES)) {
    if (!namedObjectRow(database, name)) {
      reasons.push("owned_object_missing");
    } else if (!ownedIndexIsExact(database, name)) {
      reasons.push("owned_object_incompatible");
    }
  }
}

const integrity = integrityChecks(database);
if (!integrity.quickCheck || integrity.integrityError) {
  reasons.push("quick_check_failed");
}
if (integrity.foreignKeyViolations > 0 || integrity.integrityError) {
  reasons.push("foreign_key_check_failed");
}
```

Compute state without inference:

```js
const reasonCodes = [...new Set(reasons)].sort();
const schemaExact =
  successorRow?.ddl_checksum === DDL_CHECKSUM
  && Object.keys(EXPECTED_INDEXES)
    .every((name) => ownedIndexIsExact(database, name));
const checks = {
  foundationDependency,
  schemaExact,
  quickCheck: integrity.quickCheck && !integrity.integrityError,
  foreignKeys:
    integrity.foreignKeyViolations === 0 && !integrity.integrityError
};
const counts = {
  indexes: presentIndexes.length,
  migrationRows,
  foreignKeyViolations: integrity.foreignKeyViolations
};
const pending = foundationDependency
  && reasonCodes.length === 1
  && reasonCodes[0] === "required_migration_missing";
const ok = foundationDependency
  && reasonCodes.length === 0
  && checks.schemaExact
  && checks.quickCheck
  && checks.foreignKeys;

return {
  ok,
  schemaState: ok ? "ready" : pending ? "pending" : "blocked",
  requiredMigrationId:
    REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
  counts,
  checks,
  reasonCodes,
  pendingMigrationIds: pending
    ? [REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID]
    : []
};
}
```

Export the strict inspection wrapper:

```js
export function inspectCoinWalletReferenceIndexSchema({ database } = {}) {
  if (
    !database
    || typeof database.prepare !== "function"
    || typeof database.pragma !== "function"
  ) {
    throw migrationError("invalid_migration_contract");
  }
  return closedInspection(database);
}
```

`validateCoinWalletReferenceIndexSchema` must open an explicit absolute path
with `{ readonly: true, fileMustExist: true }`, close only its owned handle,
and map missing, invalid, inspection, and close failures to the safe closed
shape. An injected database goes directly to `inspect` and is never closed:

```js
function closedValidationFailure(reasonCode) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    counts: {
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
  if (error?.code === "SQLITE_NOTADB") return "database_invalid";
  if (/^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(error?.code ?? "")) {
    return "database_unavailable";
  }
  return "database_inspection_failed";
}

export function validateCoinWalletReferenceIndexSchema({
  dbPath,
  database
} = {}) {
  if (database) {
    return inspectCoinWalletReferenceIndexSchema({ database });
  }
  assertDatabasePath(dbPath);
  let owned;
  let result;
  try {
    owned = new Database(dbPath, { readonly: true, fileMustExist: true });
    result = inspectCoinWalletReferenceIndexSchema({ database: owned });
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
```

- [ ] **Step 4: Run the inspection tests to verify GREEN**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: all identity, pending, dependency, exactness, drift, and future-row
tests PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- server/services/platform/coin-wallet-reference-index-migrations.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
git commit -m "feat: inspect wallet reference index schema"
```

### Task 3: Implement Atomic Apply, Replay, And Collision Rejection

**Files:**

- Modify: `server/services/platform/coin-wallet-reference-index-migrations.mjs`
- Modify: `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs`

**Interfaces:**

- Consumes: Task 2 closed inspection and exact successor identity.
- Produces:

```js
applyCoinWalletReferenceIndexMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
})
```

- [ ] **Step 1: Add failing apply, replay, collision, and rollback tests**

Add `canonicalDatabaseState(dbPath)` as a read-only test helper returning the
foundation row/checksum, ordered rows from every Wallet table, and the ordered
sentinel rows. Implement these exact named cases:

```js
const EXPECTED_TEST_INDEXES = Object.freeze({
  platform_coin_hold_allocations_lot_ref_idx: {
    table: "platform_coin_hold_allocations",
    columns: ["lot_ref"]
  },
  platform_coin_ledger_entries_lot_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["lot_ref"]
  },
  platform_coin_ledger_entries_hold_ref_idx: {
    table: "platform_coin_ledger_entries",
    columns: ["hold_ref"]
  }
});

const CANONICAL_TABLES = Object.freeze([
  ["wallets", "platform_coin_wallets", "wallet_ref"],
  ["lots", "platform_coin_lots", "lot_ref"],
  ["holds", "platform_coin_holds", "hold_ref"],
  ["allocations", "platform_coin_hold_allocations", "allocation_ref"],
  ["receipts", "platform_coin_operation_receipts", "operation_ref"],
  ["origins", "platform_coin_credit_origins", "credit_origin_ref"],
  ["ledgerEntries", "platform_coin_ledger_entries", "entry_ref"]
]);

function canonicalDatabaseState(dbPath) {
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    return {
      foundationMigration: database.prepare(`
        select migration_id, ddl_checksum, applied_at
          from platform_schema_migrations
         where migration_id = ?
      `).get(walletFoundation.REQUIRED_COIN_WALLET_MIGRATION_ID),
      tables: Object.fromEntries(CANONICAL_TABLES.map(
        ([key, table, orderColumn]) => [
          key,
          database.prepare(
            `select * from ${table} order by ${orderColumn}`
          ).all()
        ]
      )),
      sentinelRows: database.prepare(`
        select sentinel_key, sentinel_value
          from synthetic_reference_index_sentinel
         order by sentinel_key
      `).all()
    };
  } finally {
    database.close();
  }
}

function exactApply({ dbPath, database, nowFn } = {}) {
  return applyCoinWalletReferenceIndexMigrations({
    dbPath,
    database,
    expectedMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    expectedDdlChecksum: SUCCESSOR_CHECKSUM,
    nowFn: nowFn ?? (() => new Date("2026-07-30T00:00:00.000Z"))
  });
}

function assertFoundationReadyAndSuccessorAbsent(dbPath) {
  assert.equal(validateCoinWalletSchema({ dbPath }).ok, true);
  assertPending(validateCoinWalletReferenceIndexSchema({ dbPath }));
  const database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true
  });
  try {
    for (const name of Object.keys(EXPECTED_TEST_INDEXES)) {
      assert.equal(
        database.prepare(
          "select 1 from sqlite_master where type='index' and name=?"
        ).get(name),
        undefined
      );
    }
    assert.equal(database.prepare(`
      select 1 from platform_schema_migrations where migration_id = ?
    `).get(REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID), undefined);
  } finally {
    database.close();
  }
}
```

The test-only map is not imported from the module. The canonical snapshot
intentionally includes only the foundation ledger row, not the successor or
unrelated future rows.

| Test name | Exact setup and assertions |
| --- | --- |
| `apply creates exactly three approved indexes and one successor row` | Snapshot `canonicalDatabaseState`, apply with the exact ID/checksum, and reopen read-only. Assert `ok === true`, `schemaState === "ready"`, `sourceChanged === true`, `appliedMigrationIds` contains only the successor ID, `pendingMigrationIds` is empty, and the successor ledger row has the exact checksum. Use `PRAGMA index_list` plus `PRAGMA index_info` to prove each target has `unique=0`, `partial=0`, and exactly its approved one-column shape. Assert canonical state is unchanged. |
| `exact replay is a no-op and tolerates future rows and unrelated indexes` | Apply once, add one differently named equivalent index plus one future ledger row, snapshot canonical and successor schema state, and reapply with a `nowFn` that throws if called. Assert `sourceChanged === false`, `appliedMigrationIds` and `pendingMigrationIds` are empty, the result is ready, and both snapshots are unchanged. |
| `confirmation mismatch rejects before database access` | Invoke with a wrong ID, then a wrong checksum, while supplying a `database` Proxy whose property access throws. Assert `migration_id_mismatch` and `migration_checksum_mismatch`, respectively, and prove the Proxy was never accessed. |
| `target-name collision rejects without adopting or mutating it` | On separate foundation fixtures, create each target name without the successor row. Snapshot canonical and schema state, apply, assert `owned_object_without_migration`, then assert both snapshots are unchanged. A differently named equivalent index remains allowed by the replay test. |
| `apply maps SQLite busy and locked errors without exposing raw details` | Supply injected database doubles whose first `pragma` call throws errors with codes `SQLITE_BUSY`, `SQLITE_BUSY_SNAPSHOT`, and `SQLITE_LOCKED`. For each, assert only `database_unavailable`; assert neither raw message nor SQLite code appears in the error message. |
| `database ownership is explicit on apply success and failure` | With `dbPath`, assert the database file can be removed immediately after success and after an injected apply failure, proving the owned handle closed. With an injected `database`, assert a `select 1` succeeds after success and failure, proving caller-owned handles are never closed; the test closes them. Wrap `Database.prototype.close` with a normal function that calls the original then throws and assert the owned-path call returns only `database_close_failed`; restore the prototype in `finally`. |

Inject failures after each DDL without adding a production hook. Create and
close a fresh foundation database for every `failAfter` value:

```js
for (const failAfter of [1, 2, 3]) {
  await withOwnedDatabase(`wallet-reference-ddl-${failAfter}-`,
    async ({ dbPath }) => {
      createFoundationDatabase(dbPath);
      const database = new Database(dbPath);
      const originalExec = database.exec.bind(database);
      let executed = 0;
      database.exec = (sql) => {
        const result = originalExec(sql);
        executed += 1;
        if (executed === failAfter) {
          throw new Error("synthetic ddl fault");
        }
        return result;
      };
      try {
        assert.throws(
          () => exactApply({ database }),
          (error) => error.code === "migration_apply_failed"
        );
      } finally {
        database.close();
      }
      assertFoundationReadyAndSuccessorAbsent(dbPath);
    });
}
```

Add a ledger-insert failure with a synthetic trigger:

```sql
CREATE TRIGGER synthetic_successor_insert_abort
BEFORE INSERT ON platform_schema_migrations
WHEN new.migration_id = '20260730_001_coin_wallet_reference_indexes'
BEGIN
  SELECT raise(abort, 'synthetic successor insert fault');
END;
```

Add a postcondition failure by creating this TEMP trigger from a `nowFn`
closure before returning the fixed Date:

```sql
CREATE TEMP TRIGGER synthetic_successor_row_delete
AFTER INSERT ON platform_schema_migrations
WHEN new.migration_id = '20260730_001_coin_wallet_reference_indexes'
BEGIN
  DELETE FROM platform_schema_migrations
   WHERE migration_id = new.migration_id;
END;
```

After every failure, close and reopen the database; assert all three successor
indexes and the successor row are absent, foundation validation is ready,
`quick_check` is `ok`, foreign-key violations are zero, and canonical Wallet
and sentinel rows are unchanged.

- [ ] **Step 2: Run the apply tests to verify RED**

Run:

```powershell
node --test --test-name-pattern "apply|replay|confirmation|collision|fault|postcondition" server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: FAIL because `applyCoinWalletReferenceIndexMigrations` is absent.

- [ ] **Step 3: Implement one immediate transaction with in-transaction postconditions**

Freeze the known module errors:

```js
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

function closedOperationError(error) {
  if (KNOWN_ERROR_CODES.has(error?.code)) return error;
  if (/^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(error?.code ?? "")) {
    return migrationError("database_unavailable");
  }
  return migrationError("migration_apply_failed");
}
```

Implement the transaction in this exact order:

```js
function assertFoundationDependency(database) {
  if (!foundationDependencyIsExact(database)) {
    throw migrationError("migration_dependency_missing");
  }
}

function assertOwnedIndexesAreAbsent(database) {
  if (
    Object.keys(EXPECTED_INDEXES)
      .some((name) => namedObjectRow(database, name))
  ) {
    throw migrationError("owned_object_without_migration");
  }
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
    assertFoundationDependency(database);
    const applied = migrationRow(
      database,
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    );
    if (applied) {
      if (applied.ddl_checksum !== DDL_CHECKSUM) {
        throw migrationError("migration_checksum_mismatch");
      }
      if (!inspectCoinWalletReferenceIndexSchema({ database }).ok) {
        throw migrationError("applied_schema_incompatible");
      }
      return [];
    }
    assertOwnedIndexesAreAbsent(database);
    for (const statement of MIGRATION_STATEMENTS) database.exec(statement);
    database.prepare(`
      insert into platform_schema_migrations
        (migration_id, ddl_checksum, applied_at)
      values (?, ?, ?)
    `).run(
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
      DDL_CHECKSUM,
      normalizeAppliedAt(nowFn)
    );
    if (!inspectCoinWalletReferenceIndexSchema({ database }).ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return [REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID];
  });
  return migrate.immediate();
}
```

The exported wrapper validates exact confirmation values before opening or
mutating a database, maps `SQLITE_BUSY*`/`SQLITE_LOCKED*` to
`database_unavailable`, preserves only known errors, folds every other
SQLite/synthetic error to `migration_apply_failed`, closes only its owned
handle, and maps an owned close failure to `database_close_failed`:

```js
export function applyCoinWalletReferenceIndexMigrations({
  dbPath,
  database,
  expectedMigrationId,
  expectedDdlChecksum,
  nowFn = () => new Date()
} = {}) {
  if (
    expectedMigrationId
    !== REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
  ) {
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
  try {
    const connection =
      database ?? (owned = new Database(dbPath, { fileMustExist: true }));
    const appliedMigrationIds = applyWithDatabase(connection, nowFn);
    const inspection =
      inspectCoinWalletReferenceIndexSchema({ database: connection });
    if (!inspection.ok) {
      throw migrationError("applied_schema_incompatible");
    }
    return {
      ...inspection,
      mode: "apply",
      sourceChanged: appliedMigrationIds.length === 1,
      appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error);
  } finally {
    if (owned) {
      try {
        owned.close();
      } catch {
        throw migrationError("database_close_failed");
      }
    }
  }
}
```

- [ ] **Step 4: Run the full migration test to verify GREEN**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: all tests PASS, including three DDL rollback points, ledger insertion,
and postcondition rollback.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- server/services/platform/coin-wallet-reference-index-migrations.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
git commit -m "feat: apply wallet reference indexes atomically"
```

### Task 4: Add Dry-Run And Local Recovery Proofs

**Files:**

- Modify: `server/services/platform/coin-wallet-reference-index-migrations.mjs`
- Modify: `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs`

**Interfaces:**

- Consumes: Task 3 apply and Task 2 validation.
- Produces:

```js
dryRunCoinWalletReferenceIndexMigrations({ dbPath, tempRoot })
```

- [ ] **Step 1: Add failing dry-run and recovery tests**

Extend the test imports with `copyFileSync`. Implement these exact cases:

| Test name | Exact setup and assertions |
| --- | --- |
| `successor module exports exactly the six frozen public names` | Import the module namespace and assert its sorted keys are exactly the six names frozen in the File Map; no helper, DDL, checksum-domain, error, or cleanup primitive is exported. |
| `dry-run applies only its owned snapshot and preserves source bytes and logical state` | On a foundation-only source capture file SHA-256, `PRAGMA data_version`, `PRAGMA schema_version`, `assertPending(validate(...))`, `canonicalDatabaseState`, and sentinel rows. Run dry-run under an owned empty temp root. Assert the result is ready with `sourceChanged === false`, `pendingMigrationIds === [successor ID]`, and `appliedMigrationIds === [successor ID]`; then assert every captured source fact is unchanged and `readdirSync(tempRoot)` is empty. |
| `dry-run exact replay changes neither source nor snapshot identity` | Apply the successor to the source, capture the same source facts, run dry-run, and assert ready with both ID arrays empty, `sourceChanged === false`, unchanged source facts, and empty temp root. |
| `dry-run detects a concurrent source commit and cleans its owned directory` | Save `Database.prototype.backup`; replace it with a normal `async function (...args)` so the real method is called with `originalBackup.apply(this, args)`. After `await` completes, a second connection updates the sentinel inside a committed transaction, then the wrapper returns. Assert the already-open source handle's `data_version` changed, rejection code is `source_changed_during_dry_run`, and the temp root is empty. Restore the original prototype method in `finally`. |
| `dry-run folds busy backup generic backup and close failures to safe codes` | In separate owned fixtures, wrap `backup` to throw `{ code: "SQLITE_BUSY" }`, wrap it to throw a generic synthetic error, and wrap `close` to call the original then throw. Assert only `database_unavailable`, `migration_apply_failed`, and `database_close_failed`, respectively; reject raw message/path/SQLite text, assert the temp root is empty, and restore each prototype method in `finally`. |
| `disposable rollback removes only successor logical state` | Apply successor, snapshot canonical data, then only in that owned disposable DB execute the three exact `DROP INDEX` statements and delete only the successor ledger row. Assert foundation validation remains ready, successor validation matches `assertPending`, canonical data is unchanged, `quick_check` is `ok`, and `foreign_key_check` is empty. Do not compare file bytes, root pages, `schema_version`, or page layout. |
| `a pre-apply backup opens independently and restores foundation-only state` | Back up the foundation-only source with `await database.backup(backupPath)` before closing the source handle. Open backup read-only and assert foundation ready/successor pending. Apply successor to source. Use `copyFileSync(backupPath, restoredPath)`, open restored path independently, and assert foundation ready, successor pending, no successor indexes/row, canonical Wallet/sentinel data unchanged, `quick_check` is `ok`, and `foreign_key_check` is empty. |

For the namespace test, add a namespace import and the exact assertion:

```js
import * as walletReferenceIndexes
  from "../services/platform/coin-wallet-reference-index-migrations.mjs";

assert.deepEqual(Object.keys(walletReferenceIndexes).sort(), [
  "COIN_WALLET_REFERENCE_INDEX_MIGRATIONS",
  "REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID",
  "applyCoinWalletReferenceIndexMigrations",
  "dryRunCoinWalletReferenceIndexMigrations",
  "inspectCoinWalletReferenceIndexSchema",
  "validateCoinWalletReferenceIndexSchema"
]);
```

- [ ] **Step 2: Run the recovery tests to verify RED**

Run:

```powershell
node --test --test-name-pattern "dry-run|rollback|backup|restore" server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: dry-run tests FAIL because the export is absent; rollback and restore
tests remain RED until all expected assertions are present.

- [ ] **Step 3: Implement source-preserving dry-run**

Define the source-state and owned-cleanup helpers exactly:

```js
function assertAbsoluteTempRoot(root) {
  if (typeof root !== "string" || !isAbsolute(root)) {
    throw migrationError("invalid_temp_root");
  }
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function sourceInspectionState(database) {
  return {
    dataVersion: database.pragma("data_version", { simple: true }),
    schemaVersion: database.pragma("schema_version", { simple: true }),
    inspection: inspectCoinWalletReferenceIndexSchema({ database })
  };
}

function sourceInspectionStateIsUnchanged(before, after) {
  return before.dataVersion === after.dataVersion
    && before.schemaVersion === after.schemaVersion
    && JSON.stringify(before.inspection) === JSON.stringify(after.inspection);
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
  try {
    rmSync(resolvedDirectory, { recursive: true, force: true });
  } catch {
    throw migrationError("migration_apply_failed");
  }
}
```

Implement the dry-run with the same open source handle before/after backup:

```js
export async function dryRunCoinWalletReferenceIndexMigrations({
  dbPath,
  tempRoot
} = {}) {
  assertDatabasePath(dbPath);
  const root = tempRoot ?? tmpdir();
  assertAbsoluteTempRoot(root);
  let workDirectory;
  let source;
  try {
    mkdirSync(root, { recursive: true });
    workDirectory = mkdtempSync(
      join(root, "coin-wallet-reference-index-dry-run-")
    );
    const snapshotPath = join(workDirectory, "snapshot.sqlite");
    const sourceHashBefore = sha256File(dbPath);
    source = new Database(dbPath, { readonly: true, fileMustExist: true });
    assertFoundationDependency(source);
    const sourceInspectionBefore =
      inspectCoinWalletReferenceIndexSchema({ database: source });
    const sourceStateBefore = sourceInspectionState(source);
    const wasApplied = sourceInspectionBefore.ok;
    await source.backup(snapshotPath);
    const applied = applyCoinWalletReferenceIndexMigrations({
      dbPath: snapshotPath,
      expectedMigrationId:
        REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    });
    const validated =
      validateCoinWalletReferenceIndexSchema({ dbPath: snapshotPath });
    if (!validated.ok) throw migrationError("applied_schema_incompatible");
    if (
      sha256File(dbPath) !== sourceHashBefore
      || !sourceInspectionStateIsUnchanged(
        sourceStateBefore,
        sourceInspectionState(source)
      )
    ) {
      throw migrationError("source_changed_during_dry_run");
    }
    return {
      ...validated,
      mode: "dry-run",
      sourceChanged: false,
      pendingMigrationIds: wasApplied
        ? []
        : [REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID],
      appliedMigrationIds: applied.appliedMigrationIds
    };
  } catch (error) {
    throw closedOperationError(error);
  } finally {
    let cleanupError = null;
    try {
      source?.close();
    } catch {
      cleanupError = migrationError("database_close_failed");
    }
    if (workDirectory) {
      try {
        safeRemoveOwnedDirectory(workDirectory, root);
      } catch (error) {
        cleanupError ??= closedOperationError(error);
      }
    }
    if (cleanupError) throw cleanupError;
  }
}
```

Add `invalid_temp_root` and `source_changed_during_dry_run` to the module's
closed error vocabulary; do not expose raw backup, filesystem, or SQLite
exceptions.

- [ ] **Step 4: Run the full migration test to verify GREEN**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected: all migration, dry-run, cleanup, disposable DROP, and backup/restore
tests PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- server/services/platform/coin-wallet-reference-index-migrations.mjs server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
git commit -m "test: prove wallet index migration recovery"
```

### Task 5: Prove The Five Reverse-Reference Query Plans

**Files:**

- Modify: `server/tests/platform-coin-wallet-reference-index-migrations.test.mjs`

**Interfaces:**

- Consumes: the exact successor indexes from Task 3.
- Produces: a stable planner contract for the paused Commerce canary verifier.

- [ ] **Step 1: Add the two exact consumer-shaped EXPLAIN queries**

Use the actual three-branch Ledger query:

```js
const LEDGER_PLAN_SQL = `
WITH target_ledger AS (
  SELECT *
    FROM platform_coin_ledger_entries
   WHERE wallet_ref = ?
  UNION
  SELECT *
    FROM platform_coin_ledger_entries
   WHERE lot_ref IN (SELECT value FROM json_each(?))
  UNION
  SELECT *
    FROM platform_coin_ledger_entries
   WHERE hold_ref IN (SELECT value FROM json_each(?))
)
SELECT * FROM target_ledger
 ORDER BY entry_ref
`;
```

Use the actual two-branch allocation query:

```js
const ALLOCATION_PLAN_SQL = `
WITH target_allocations AS (
  SELECT *
    FROM platform_coin_hold_allocations
   WHERE hold_ref IN (SELECT value FROM json_each(?))
  UNION
  SELECT *
    FROM platform_coin_hold_allocations
   WHERE lot_ref IN (SELECT value FROM json_each(?))
)
SELECT a.*,
       CASE WHEN h.hold_ref IS NULL THEN 0 ELSE 1 END AS hold_exists,
       h.wallet_ref AS hold_wallet_ref,
       CASE WHEN l.lot_ref IS NULL THEN 0 ELSE 1 END AS lot_exists
  FROM target_allocations a
  LEFT JOIN platform_coin_holds h ON h.hold_ref = a.hold_ref
  LEFT JOIN platform_coin_lots l ON l.lot_ref = a.lot_ref
 ORDER BY a.allocation_ref
`;
```

- [ ] **Step 2: Write the failing applied-plan assertion**

Name the test exactly
`five reverse-reference branches use indexed SEARCH plans without base-table SCAN`.
Initially run both queries on a foundation-only fixture and assert the final
success contract below; that deliberate fixture choice must make the test RED:

```js
function explainQueryPlan(database, sql, parameters) {
  return database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters);
}

const ledgerPlan = explainQueryPlan(database, LEDGER_PLAN_SQL, [
  "wallet_private",
  JSON.stringify(["lot_private"]),
  JSON.stringify(["hold_private"])
]);
const allocationPlan = explainQueryPlan(
  database,
  ALLOCATION_PLAN_SQL,
  [
    JSON.stringify(["hold_private"]),
    JSON.stringify(["lot_private"])
  ]
);
const details = [...ledgerPlan, ...allocationPlan]
  .map(({ detail }) => detail);
const ledgerSearches = details.filter(
  (detail) => /^SEARCH platform_coin_ledger_entries\b/i.test(detail)
);
const allocationSearches = details.filter(
  (detail) => /^SEARCH platform_coin_hold_allocations\b/i.test(detail)
);
assert.equal(ledgerSearches.length, 3);
assert.equal(allocationSearches.length, 2);
for (const indexName of [
  "platform_coin_hold_allocations_lot_ref_idx",
  "platform_coin_ledger_entries_lot_ref_idx",
  "platform_coin_ledger_entries_hold_ref_idx",
  "platform_coin_ledger_entries_wallet_page_idx"
]) {
  assert.equal(details.some((detail) => detail.includes(indexName)), true);
}
assert.equal(
  allocationSearches.some((detail) => /\(hold_ref=\?\)/i.test(detail)),
  true
);
assert.equal(
  details.some((detail) =>
    /\bSCAN platform_coin_(?:ledger_entries|hold_allocations)\b/i.test(detail)
  ),
  false
);
```

Do not assert planner IDs, parent IDs, row order, SQLite auto-index names,
`json_each` scans, CTE scans, compound-query details, or temporary B-tree text.

- [ ] **Step 3: Verify RED, then add the explicit precondition and apply**

Run the command once before editing the fixture. Expected RED: the assertion
finds three fact-table scans and only two fact-table searches.

Run:

```powershell
node --test --test-name-pattern "five reverse-reference branches" server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Then add a separate passing test named
`foundation-only plan exposes exactly three missing reverse-reference scans`.
It uses the same query constants and asserts:

```js
const foundationDetails = [
  ...explainQueryPlan(database, LEDGER_PLAN_SQL, [
    "wallet_private",
    JSON.stringify(["lot_private"]),
    JSON.stringify(["hold_private"])
  ]),
  ...explainQueryPlan(database, ALLOCATION_PLAN_SQL, [
    JSON.stringify(["hold_private"]),
    JSON.stringify(["lot_private"])
  ])
].map(({ detail }) => detail);

assert.equal(foundationDetails.filter(
  (detail) =>
    /\bSCAN platform_coin_(?:ledger_entries|hold_allocations)\b/i.test(detail)
).length, 3);
assert.equal(foundationDetails.filter(
  (detail) =>
    /^SEARCH platform_coin_(?:ledger_entries|hold_allocations)\b/i.test(detail)
).length, 2);
```

In the applied-plan test, call `exactApply({ dbPath })` before `EXPLAIN` and
rerun both named cases:

```powershell
node --test --test-name-pattern "five reverse-reference branches|foundation-only plan" server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
```

Expected GREEN: the precondition test proves the original three scans, while
the applied test proves the three new exact index names and all five fact-table
branches are `SEARCH`.

- [ ] **Step 4: Commit Task 5**

```powershell
git add -- server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
git commit -m "test: prove wallet reverse reference plans"
```

### Task 6: Add The Closed Successor CLI

**Files:**

- Create: `scripts/platform-coin-wallet-reference-index-schema.mjs`
- Create: `server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: the successor identity plus validate, dry-run, and apply exports;
  `inspectCoinWalletReferenceIndexSchema` remains a module/test API and is not
  imported by the CLI.
- Produces:

```js
runCoinWalletReferenceIndexSchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
})
```

The default injection object is frozen with exactly those three keys:

```js
const DEFAULT_OPERATIONS = Object.freeze({
  validateCoinWalletReferenceIndexSchema,
  dryRunCoinWalletReferenceIndexMigrations,
  applyCoinWalletReferenceIndexMigrations
});
```

`validate` accepts `{ dbPath }` and returns the closed inspection shape;
`dryRun` accepts `{ dbPath, tempRoot }` and returns a Promise of the dry-run
shape; `apply` accepts
`{ dbPath, expectedMigrationId, expectedDdlChecksum }` and returns the apply
shape. Injection tests must implement all three keys even when a key is an
access trap.

The CLI emits exactly:

```js
{
  ok,
  mode,
  schemaState,
  requiredMigrationId,
  sourceChanged,
  checks: {
    foundationDependency,
    schemaExact,
    quickCheck,
    foreignKeys
  },
  reasonCodes,
  appliedMigrationIds,
  pendingMigrationIds
}
```

- [ ] **Step 1: Write failing CLI process and injection tests**

Create the closed CLI harness with `spawnSync`, `env: {}`,
`windowsHide: true`, one JSON stdout line, and empty stderr. Implement this
named test matrix:

```text
package exposes the successor CLI and preserves the foundation CLI command
missing duplicate unknown empty relative and mode-incompatible arguments exit 2
validate reports foundation-only state as pending with exit 3
dry-run accepts only the exact pending state and preserves the source
apply requires the exact successor ID and checksum before database access
exact apply and replay return ready with exit 0
dependency schema ledger index and integrity failures exit 3
locked inspection close and unexpected failures exit 4
unknown returned reason codes become unexpected_execution_failure
private mode schemaState and requiredMigrationId values are clamped closed
injected operations enforce one validate call and at most one target call
contract validation and execution failures keep sourceChanged false and applied IDs empty
CLI import emits no output and uses the module migration identity
```

Freeze output keys:

```js
assert.deepEqual(Object.keys(output).sort(), [
  "appliedMigrationIds",
  "checks",
  "mode",
  "ok",
  "pendingMigrationIds",
  "reasonCodes",
  "requiredMigrationId",
  "schemaState",
  "sourceChanged"
]);
assert.deepEqual(Object.keys(output.checks).sort(), [
  "foreignKeys",
  "foundationDependency",
  "quickCheck",
  "schemaExact"
]);
```

Freeze defaults and filtering:

```js
function closedOutput({
  ok = false,
  mode = null,
  schemaState = "blocked",
  sourceChanged = false,
  checks = {},
  reasonCodes = [],
  appliedMigrationIds = [],
  pendingMigrationIds = []
} = {}) {
  const safeSchemaState = new Set(["ready", "pending", "blocked"])
    .has(schemaState)
    ? schemaState
    : "blocked";
  return {
    ok: ok === true,
    mode: MODES.has(mode) ? mode : null,
    schemaState: safeSchemaState,
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    checks: {
      foundationDependency: checks.foundationDependency === true,
      schemaExact: checks.schemaExact === true,
      quickCheck: checks.quickCheck === true,
      foreignKeys: checks.foreignKeys === true
    },
    reasonCodes: reasonCodes.filter((code) => SAFE_REASON_CODES.has(code)),
    appliedMigrationIds: appliedMigrationIds.filter(
      (id) => id === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    ),
    pendingMigrationIds: pendingMigrationIds.filter(
      (id) => id === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    )
  };
}
```

Validate, contract-failure, preflight-failure, and execution-failure outputs
always retain the defaults `sourceChanged: false` and
`appliedMigrationIds: []`.

For every process case reject paths, filenames, SQL verbs, `Error:`,
`SQLITE_`, and every seeded synthetic marker:
`account_private`, `owner_private`, `wallet_private`, `operation_private`,
`origin_private`, `lot_private`, `hold_private`, `allocation_private`,
`entry_private`, `order_private`, and `source_private`.

- [ ] **Step 2: Run the CLI test to verify RED**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the CLI.

- [ ] **Step 3: Implement exact argument and exit contracts**

Allowed arguments:

```js
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply"]);
```

Freeze the mode/argument matrix:

| Mode | Required | Optional | Rejected |
| --- | --- | --- | --- |
| `validate` | `--mode`, `--db-path` | none | temp root and both confirmations |
| `dry-run` | `--mode`, `--db-path` | `--temp-root` | both confirmations |
| `apply` | `--mode`, `--db-path`, both exact confirmations | none | temp root |

`--db-path` and supplied `--temp-root` must be fully qualified. There is no
environment, current-directory, repository-relative, or default database path.

Freeze the safe result vocabulary:

```js
const SAFE_REASON_CODES = new Set([
  "apply_confirmation_required",
  "applied_schema_incompatible",
  "argument_not_allowed_for_mode",
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_path_must_be_absolute",
  "database_path_required",
  "database_unavailable",
  "duplicate_argument",
  "empty_argument",
  "foreign_key_check_failed",
  "invalid_mode",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
  "migration_ledger_incompatible",
  "mode_required",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "quick_check_failed",
  "required_migration_missing",
  "source_changed_during_dry_run",
  "temp_root_must_be_absolute",
  "unexpected_execution_failure",
  "unknown_argument"
]);

const INFRASTRUCTURE_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_unavailable",
  "source_changed_during_dry_run"
]);
```

`database_unavailable` is the only public reason synthesized for a known
locked/busy operation error. A raw `migration_apply_failed`, filesystem code,
SQLite code, or any other unlisted reason becomes
`unexpected_execution_failure`; none is forwarded.

Exit mapping:

```text
0: validate ready; dry-run ready; apply or replay ready
2: argument shape, absolute path, mode restriction, or confirmation rejection
3: validate pending; dependency/schema/index/ledger/integrity rejection;
   database missing or invalid
4: locked/inspection/close/backup/temp/concurrent-source failure;
   unknown throw or unknown returned reason
```

For `dry-run` and `apply`, the only preflight state allowed to continue is:

```js
validation.schemaState === "pending"
  && validation.reasonCodes.length === 1
  && validation.reasonCodes[0] === "required_migration_missing"
  && validation.pendingMigrationIds.length === 1
  && validation.pendingMigrationIds[0]
    === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
```

An already-ready exact schema also permits idempotent dry-run/apply. Every
blocked state stops with exit 3 before the mutation operation is called.
Unknown result keys are ignored by `closedOutput`; unknown reason codes turn
the entire outcome into exit 4 `unexpected_execution_failure`.

Export only:

```js
export async function runCoinWalletReferenceIndexSchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  const parsed = parseArguments(argv);
  return executeParsedOperation(parsed, operations);
}
```

`parseArguments` returns only
`{ mode, dbPath, tempRoot, expectedMigrationId, expectedDdlChecksum }`.
`executeParsedOperation` applies this exact call-count contract:

```text
validate:
  call validateCoinWalletReferenceIndexSchema exactly once
  call no dry-run/apply operation

dry-run:
  call validateCoinWalletReferenceIndexSchema exactly once
  if and only if preflight is exact pending or exact ready,
  call dryRunCoinWalletReferenceIndexMigrations exactly once

apply:
  call validateCoinWalletReferenceIndexSchema exactly once
  if and only if preflight is exact pending or exact ready,
  call applyCoinWalletReferenceIndexMigrations exactly once
```

Thus validate uses one operation; dry-run/apply use one read-only preflight
plus at most one target operation. The helper applies the frozen exit matrix
and always returns exactly `{ exitCode, output: closedOutput(...) }`.

Direct invocation writes `JSON.stringify(outcome.output)` plus one newline and
sets `process.exitCode`; importing the module writes nothing.

Add to `package.json` beside the foundation command:

```json
"platform:coin-wallet:reference-index-schema":
  "node scripts/platform-coin-wallet-reference-index-schema.mjs"
```

- [ ] **Step 4: Run focused CLI and syntax validation to verify GREEN**

Run:

```powershell
node --test server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
node --check scripts/platform-coin-wallet-reference-index-schema.mjs
```

Expected: all CLI tests PASS and syntax check exits 0.

- [ ] **Step 5: Commit Task 6**

```powershell
git add -- package.json scripts/platform-coin-wallet-reference-index-schema.mjs server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
git commit -m "feat: add wallet reference index CLI"
```

### Task 7: Align Source-Only Gate Documentation And Validate The PR

**Files:**

- Modify: `docs/COINS_WALLET_SCHEMA_GATE.md`
- Modify: `docs/SUBSCRIPTION_CONTROL_DATABASE.md`
- Modify: `docs/README.md`

**Interfaces:**

- Consumes: the exact implemented successor ID, checksum, package command, and validation evidence.
- Produces: source-only operator documentation; no Deploy Note and no production authority.

- [ ] **Step 1: Update the Wallet schema gate with exact synthetic commands**

Add a successor section using:

```powershell
npm run platform:coin-wallet:reference-index-schema -- --mode validate --db-path "C:\synthetic\wallet.sqlite"
npm run platform:coin-wallet:reference-index-schema -- --mode dry-run --db-path "C:\synthetic\wallet.sqlite" --temp-root "C:\synthetic\wallet-index-dry-run"
npm run platform:coin-wallet:reference-index-schema -- --mode apply --db-path "C:\synthetic\wallet.sqlite" --confirm-migration-id "20260730_001_coin_wallet_reference_indexes" --confirm-ddl-checksum "2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b"
```

State explicitly:

- the successor requires the exact foundation row/checksum;
- source presence and local dry-run do not prove production apply;
- production apply needs fresh inventory, verified backup, exact artifact,
  maintenance/stop/rollback conditions, and explicit approval;
- no production down CLI exists; forward-fix is preferred;
- schema readback stops before Wallet or Commerce runtime activation.

- [ ] **Step 2: Update database ownership and docs navigation**

In `docs/SUBSCRIPTION_CONTROL_DATABASE.md`, state that the independent Wallet
reference-index successor owns only the three named indexes and its own row in
the shared `platform_schema_migrations` ledger. Startup DDL, Wallet Store,
Commerce Store, and payment code do not own or auto-apply it.

In `docs/README.md`, update the Wallet schema gate description to mention both
the foundation and successor closed CLIs. Keep the design and plan indexed as
source-only with `production_authority: none`.

- [ ] **Step 3: Run focused tests**

```powershell
node --test server/tests/platform-coin-wallet-reference-index-migrations.test.mjs
node --test server/tests/platform-coin-wallet-reference-index-schema-cli.test.mjs
node --test server/tests/platform-coin-wallet-migrations.test.mjs
node --test server/tests/platform-coin-wallet-schema-cli.test.mjs
```

Expected: all four focused suites PASS. All four frozen foundation
module/CLI/test files must show no diff.

- [ ] **Step 4: Run syntax, documentation, full-suite, and diff validation**

```powershell
node --check scripts/platform-coin-wallet-reference-index-schema.mjs
npm run docs:authority:check
npm test
git diff --check
git diff --check origin/master...HEAD
```

Expected:

- syntax exits 0;
- document authority validates every declared metadata block;
- `npm test` has zero failures;
- worktree and committed-range diff checks emit no whitespace errors;
- `git diff --name-only origin/master...HEAD` contains only the approved plan,
  spec/index documentation, four new implementation/test files, `package.json`,
  and the two Wallet database/gate documents.

- [ ] **Step 5: Commit Task 7**

```powershell
git add -- docs/COINS_WALLET_SCHEMA_GATE.md docs/SUBSCRIPTION_CONTROL_DATABASE.md docs/README.md
git commit -m "docs: document wallet reference index gate"
```

- [ ] **Step 6: Revalidate the committed exact head**

```powershell
git diff --check origin/master...HEAD
git diff --name-only origin/master...HEAD
git status --short --branch
```

Expected: the committed PR range is whitespace-clean, the file list is exactly
the approved set, and the worktree is clean.

### Task 8: Independent Review And Single-PR Handoff

**Files:**

- Review: all files in `git diff --name-only origin/master...HEAD`
- No production files or hosts

**Interfaces:**

- Consumes: exact-head local validation from Task 7.
- Produces: one reviewed Risk A source PR with `production_state: not_deployed`.

- [ ] **Step 1: Request independent code review**

Invoke `superpowers:requesting-code-review`. The reviewer must verify:

```text
foundation files have zero diff
three and only three full indexes
successor checksum and ledger identity exact
collision and drift fail closed
all DDL and ledger insertion are one BEGIN IMMEDIATE
postconditions run before commit
dry-run source remains unchanged
DROP exists only in disposable tests
EXPLAIN has five fact-table SEARCH branches and no fact-table SCAN
CLI emits one safe closed JSON object
no Wallet Commerce provider runtime or production semantic change
```

If any blocking finding exists, return to the owning TDD task, reproduce it
with a failing test, implement the minimal fix, rerun Task 7 validation, and
commit the fix separately.

- [ ] **Step 2: Recheck exact integration head**

```powershell
git fetch origin
git rev-list --left-right --count origin/master...HEAD
git status --short --branch
```

If `origin/master` advanced, rebase this branch onto it, resolve only in-scope
conflicts, and rerun every Task 7 validation command. Do not rewrite or discard
the paused dirty Risk B worktree.

- [ ] **Step 3: Push one source branch and open one Draft PR**

```powershell
git push -u origin codex/wallet-reference-indexes
```

Create one Draft PR with:

```yaml
capability: coin-wallet-reference-indexes
release_unit: control-plane-app
production_state: not_deployed
identity_impact: false
risk: A
```

The PR body must include intent, exact migration IDs/checksums, exact three
indexes, local test evidence, rollback/recovery evidence, no-production
boundary, and the deferred separate production Wallet schema Gate. It must not
contain a Deploy Note.

- [ ] **Step 4: Ready and merge only after exact-head closure**

Require:

- no unresolved blocking review finding;
- required checks passing on the final exact head;
- PR still contains only the approved file set;
- PR remains source-only and has no production mutation.

Then mark Ready and merge the single PR. Record the exact merge commit and stop.
Do not apply the schema, activate Wallet/Commerce, rebase the paused Risk B
branch, or connect to production in this plan.

## Completion Boundary

This plan is complete only when the single Risk A source PR is merged with all
local and required checks passing. The next action is a separately prepared
production Wallet schema Gate for operator approval. That later gate does not
inherit mutation authority from this plan or PR.
