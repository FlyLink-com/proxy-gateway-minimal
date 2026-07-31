import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  COIN_WALLET_REFERENCE_INDEX_MIGRATIONS,
  REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
} from "../services/platform/coin-wallet-reference-index-migrations.mjs";
import * as successorCli
  from "../../scripts/platform-coin-wallet-reference-index-schema.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-coin-wallet-reference-index-schema.mjs"
);
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const SUCCESSOR_ID = "20260730_001_coin_wallet_reference_indexes";
const SUCCESSOR_CHECKSUM =
  "2d8a0122a5a9078e9d6422f5230b03ae54789d50d0252485a29766dd3ab71d2b";
const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const SYNTHETIC_MARKERS = Object.freeze([
  "account_private",
  "owner_private",
  "wallet_private",
  "operation_private",
  "origin_private",
  "lot_private",
  "hold_private",
  "allocation_private",
  "entry_private",
  "order_private",
  "source_private"
]);
const OUTPUT_KEYS = Object.freeze([
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
const CHECK_KEYS = Object.freeze([
  "foreignKeys",
  "foundationDependency",
  "quickCheck",
  "schemaExact"
]);

function withTempDirectory(prefix, action) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return action(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50
    });
  }
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function seedSyntheticRows(dbPath) {
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
        "account_private",
        "owner_private",
        "active",
        timestamp,
        timestamp,
        "{}"
      );
      database.prepare(`
        insert into platform_coin_wallets
          (wallet_ref, account_id, status, version, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?)
      `).run(
        "wallet_private",
        "account_private",
        "active",
        1,
        timestamp,
        timestamp
      );
      database.prepare(`
        insert into platform_coin_operation_receipts (
          operation_ref, wallet_ref, actor_scope, operation_type,
          idempotency_key, request_digest, status, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, result_ref,
          safe_result_code, created_at, completed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "operation_private",
        "wallet_private",
        "system:synthetic",
        "credit",
        "idempotency_private",
        "digest_private",
        "succeeded",
        0,
        1,
        "active",
        "lot_private",
        "credited",
        timestamp,
        timestamp
      );
      database.prepare(`
        insert into platform_coin_credit_origins (
          credit_origin_ref, wallet_ref, coin_type, source_type, source_ref,
          source_digest, operation_ref, lot_ref, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "origin_private",
        "wallet_private",
        "paid_coins",
        "synthetic",
        "source_private",
        "source_digest_private",
        "operation_private",
        "lot_private",
        timestamp
      );
      database.prepare(`
        insert into platform_coin_lots (
          lot_ref, wallet_ref, coin_type, credit_origin_ref, issued_units,
          pending_units, available_units, held_units, consumed_units,
          reversed_units, expired_units, source_type, source_ref, policy_ref,
          policy_version, expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "lot_private",
        "wallet_private",
        "paid_coins",
        "origin_private",
        10,
        0,
        8,
        2,
        0,
        0,
        0,
        "synthetic",
        "source_private",
        null,
        null,
        null,
        timestamp,
        timestamp
      );
      database.prepare(`
        insert into platform_coin_holds (
          hold_ref, wallet_ref, purpose, purpose_ref, amount_units, status,
          expires_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "hold_private",
        "wallet_private",
        "product_purchase",
        "order_private",
        2,
        "active",
        "2026-08-30T00:00:00.000Z",
        timestamp,
        timestamp
      );
      database.prepare(`
        insert into platform_coin_hold_allocations (
          allocation_ref, hold_ref, lot_ref, allocation_sequence,
          allocated_units, created_at
        ) values (?, ?, ?, ?, ?, ?)
      `).run(
        "allocation_private",
        "hold_private",
        "lot_private",
        1,
        2,
        timestamp
      );
      database.prepare(`
        insert into platform_coin_ledger_entries (
          entry_ref, operation_ref, wallet_ref, lot_ref, operation,
          amount_units, hold_ref, order_ref, source_type, source_ref,
          actor_type, actor_ref, previous_wallet_version,
          resulting_wallet_version, resulting_wallet_status, occurred_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "entry_private",
        "operation_private",
        "wallet_private",
        "lot_private",
        "hold",
        2,
        "hold_private",
        "order_private",
        "synthetic",
        "source_private",
        "system",
        "actor_private",
        0,
        1,
        "active",
        timestamp
      );
    }).immediate();
  } finally {
    database.close();
  }
}

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
      values ('source_private', 'account_private');
  `);
  database.close();
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
  seedSyntheticRows(dbPath);
}

function runCli(args, { timeout = 10_000 } = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout,
    windowsHide: true
  });
}

function runStrictInjectionProbe(mode, behavior) {
  const marker = `${mode}_${behavior}_source_private`;
  const ready = JSON.stringify(readyValidation());
  const pending = JSON.stringify(pendingValidation());
  const dryRunReady = JSON.stringify(successfulOperation("dry-run", {
    appliedMigrationIds: [SUCCESSOR_ID],
    pendingMigrationIds: [SUCCESSOR_ID]
  }));
  const applyReady = JSON.stringify(successfulOperation("apply"));
  const operationResult = behavior === "rejected-promise"
    ? "Promise.reject(new Error(marker))"
    : mode === "validate"
      ? `throwingThenable(${ready})`
      : mode === "dry-run"
        ? `throwingThenable(${dryRunReady})`
        : `throwingThenable(${applyReady})`;
  const validateResult = mode === "validate"
    ? operationResult
    : pending;
  const dryRunResult = mode === "dry-run"
    ? operationResult
    : "(() => { throw new Error('operation_private'); })()";
  const applyResult = mode === "apply"
    ? operationResult
    : "(() => { throw new Error('origin_private'); })()";
  const source = `
    import { runCoinWalletReferenceIndexSchemaCli }
      from ${JSON.stringify(pathToFileURL(CLI_PATH).href)};
    const marker = ${JSON.stringify(marker)};
    function throwingThenable(value) {
      return Object.defineProperty(value, "then", {
        get() {
          throw new Error(marker);
        }
      });
    }
    const operations = {
      validateCoinWalletReferenceIndexSchema() {
        return ${validateResult};
      },
      dryRunCoinWalletReferenceIndexMigrations() {
        return ${dryRunResult};
      },
      applyCoinWalletReferenceIndexMigrations() {
        return ${applyResult};
      }
    };
    const outcome = await runCoinWalletReferenceIndexSchemaCli({
      argv: ${JSON.stringify(injectionArgv(mode))},
      operations
    });
    process.stdout.write(JSON.stringify(outcome.output) + "\\n");
    process.exitCode = outcome.exitCode;
  `;
  return {
    marker,
    result: spawnSync(process.execPath, [
      "--unhandled-rejections=strict",
      "--input-type=module",
      "--eval",
      source
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: {},
      timeout: 10_000,
      windowsHide: true
    })
  };
}

function parseProcessOutput(result, { paths = [], extraForbidden = [] } = {}) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.endsWith("\n"), true);
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(output).sort(), OUTPUT_KEYS);
  assert.deepEqual(Object.keys(output.checks).sort(), CHECK_KEYS);
  const serialized = `${result.stdout}${result.stderr}`;
  const lower = serialized.toLowerCase();
  for (const sqlVerb of [
    "create table",
    "create index",
    "select ",
    "insert ",
    "update ",
    "delete ",
    "drop ",
    "pragma "
  ]) {
    assert.equal(lower.includes(sqlVerb), false, `output leaked ${sqlVerb}`);
  }
  for (const value of [
    ...paths,
    ...paths.map((value) => basename(value)),
    ...SYNTHETIC_MARKERS,
    ...extraForbidden,
    "Error:",
    "SQLITE_"
  ].filter(Boolean)) {
    assert.equal(serialized.includes(value), false, `output leaked ${value}`);
  }
  return output;
}

function fullChecks(value) {
  return {
    foundationDependency: value,
    schemaExact: value,
    quickCheck: value,
    foreignKeys: value
  };
}

function readyValidation(overrides = {}) {
  return {
    ok: true,
    schemaState: "ready",
    requiredMigrationId: SUCCESSOR_ID,
    counts: {
      indexes: 3,
      migrationRows: 2,
      foreignKeyViolations: 0
    },
    checks: fullChecks(true),
    reasonCodes: [],
    pendingMigrationIds: [],
    ...overrides
  };
}

function pendingValidation(overrides = {}) {
  return {
    ok: false,
    schemaState: "pending",
    requiredMigrationId: SUCCESSOR_ID,
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
    pendingMigrationIds: [SUCCESSOR_ID],
    ...overrides
  };
}

function blockedValidation(reasonCode, overrides = {}) {
  return {
    ok: false,
    schemaState: "blocked",
    requiredMigrationId: SUCCESSOR_ID,
    counts: {
      indexes: 0,
      migrationRows: 0,
      foreignKeyViolations: 0
    },
    checks: fullChecks(false),
    reasonCodes: [reasonCode],
    pendingMigrationIds: [],
    ...overrides
  };
}

function successfulOperation(mode, {
  appliedMigrationIds = [],
  pendingMigrationIds = [],
  sourceChanged = false,
  ...overrides
} = {}) {
  return {
    ...readyValidation(),
    mode,
    sourceChanged,
    appliedMigrationIds,
    pendingMigrationIds,
    ...overrides
  };
}

function exactApplyArguments(dbPath) {
  return [
    "--mode",
    "apply",
    "--db-path",
    dbPath,
    "--confirm-migration-id",
    SUCCESSOR_ID,
    "--confirm-ddl-checksum",
    SUCCESSOR_CHECKSUM
  ];
}

function injectionArgv(mode) {
  const argv = [
    "--mode",
    mode,
    "--db-path",
    resolve("synthetic-injection.sqlite")
  ];
  if (mode === "apply") {
    argv.push(
      "--confirm-migration-id",
      SUCCESSOR_ID,
      "--confirm-ddl-checksum",
      SUCCESSOR_CHECKSUM
    );
  }
  return argv;
}

function assertClosedFailureDefaults(outcome) {
  assert.equal(outcome.output.ok, false);
  assert.equal(outcome.output.sourceChanged, false);
  assert.deepEqual(outcome.output.appliedMigrationIds, []);
}

test("package exposes the successor CLI and preserves the foundation CLI command", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:coin-wallet:reference-index-schema"],
    "node scripts/platform-coin-wallet-reference-index-schema.mjs"
  );
  assert.equal(
    packageJson.scripts["platform:coin-wallet:schema"],
    "node scripts/platform-coin-wallet-schema.mjs"
  );
});

test("missing duplicate unknown empty relative and mode-incompatible arguments exit 2", async () => {
  const dbPath = resolve("account_private-contract.sqlite");
  const tempRoot = resolve("source_private-temp");
  const cases = [
    { args: [], reason: "mode_required", mode: null },
    {
      args: ["--mode", "validate"],
      reason: "database_path_required",
      mode: "validate"
    },
    {
      args: ["--mode", "private", "--db-path", dbPath],
      reason: "invalid_mode",
      mode: null
    },
    {
      args: [
        "--mode", "validate", "--mode", "validate", "--db-path", dbPath
      ],
      reason: "duplicate_argument",
      mode: null
    },
    {
      args: ["--mode", "validate", "--unknown", "private", "--db-path", dbPath],
      reason: "unknown_argument",
      mode: null
    },
    {
      args: ["--mode", "", "--db-path", dbPath],
      reason: "empty_argument",
      mode: null
    },
    {
      args: ["--mode", "validate", "--db-path"],
      reason: "empty_argument",
      mode: null
    },
    {
      args: ["--mode", "validate", "--db-path", "relative.sqlite"],
      reason: "database_path_must_be_absolute",
      mode: "validate"
    },
    {
      args: [
        "--mode", "dry-run", "--db-path", dbPath,
        "--temp-root", "relative-temp"
      ],
      reason: "temp_root_must_be_absolute",
      mode: "dry-run"
    },
    {
      args: [
        "--mode", "validate", "--db-path", dbPath,
        "--temp-root", tempRoot
      ],
      reason: "argument_not_allowed_for_mode",
      mode: "validate"
    },
    {
      args: [
        "--mode", "dry-run", "--db-path", dbPath,
        "--confirm-migration-id", SUCCESSOR_ID
      ],
      reason: "argument_not_allowed_for_mode",
      mode: "dry-run"
    },
    {
      args: [
        "--mode", "apply", "--db-path", dbPath,
        "--confirm-migration-id", SUCCESSOR_ID,
        "--confirm-ddl-checksum", SUCCESSOR_CHECKSUM,
        "--temp-root", tempRoot
      ],
      reason: "argument_not_allowed_for_mode",
      mode: "apply"
    }
  ];
  for (const testCase of cases) {
    const result = runCli(testCase.args);
    assert.equal(result.status, EXIT_CONTRACT_REJECTED);
    const output = parseProcessOutput(result, {
      paths: [dbPath, tempRoot]
    });
    assertClosedFailureDefaults({ output });
    assert.equal(output.mode, testCase.mode);
    assert.equal(output.schemaState, "blocked");
    assert.deepEqual(output.reasonCodes, [testCase.reason]);
  }

  for (const [argv, reasonCode] of [
    [undefined, "unknown_argument"],
    [null, "unknown_argument"],
    [{}, "unknown_argument"],
    [["--mode", 1], "empty_argument"]
  ]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv,
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            throw new Error("account_private");
          },
          dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("owner_private");
          },
          applyCoinWalletReferenceIndexMigrations() {
            throw new Error("wallet_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_CONTRACT_REJECTED);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
  }
});

test("validate reports foundation-only state as pending with exit 3", () => {
  withTempDirectory("wallet-reference-cli-pending-", (directory) => {
    const dbPath = join(directory, "account_private.sqlite");
    createFoundationDatabase(dbPath);
    const before = fileSha256(dbPath);
    const result = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(result.status, EXIT_SCHEMA_REJECTED);
    const output = parseProcessOutput(result, { paths: [dbPath] });
    assert.equal(output.ok, false);
    assert.equal(output.mode, "validate");
    assert.equal(output.schemaState, "pending");
    assert.equal(output.requiredMigrationId, SUCCESSOR_ID);
    assert.equal(output.sourceChanged, false);
    assert.deepEqual(output.checks, {
      foundationDependency: true,
      schemaExact: false,
      quickCheck: true,
      foreignKeys: true
    });
    assert.deepEqual(output.reasonCodes, ["required_migration_missing"]);
    assert.deepEqual(output.appliedMigrationIds, []);
    assert.deepEqual(output.pendingMigrationIds, [SUCCESSOR_ID]);
    assert.equal(fileSha256(dbPath), before);
  });
});

test("dry-run accepts only the exact pending state and preserves the source", async () => {
  withTempDirectory("wallet-reference-cli-dry-run-", (directory) => {
    const dbPath = join(directory, "wallet_private.sqlite");
    const tempRoot = join(directory, "source_private-temp");
    createFoundationDatabase(dbPath);
    const before = fileSha256(dbPath);
    const result = runCli([
      "--mode", "dry-run", "--db-path", dbPath, "--temp-root", tempRoot
    ]);
    assert.equal(result.status, EXIT_SUCCESS);
    const output = parseProcessOutput(result, {
      paths: [dbPath, tempRoot]
    });
    assert.equal(output.ok, true);
    assert.equal(output.mode, "dry-run");
    assert.equal(output.schemaState, "ready");
    assert.equal(output.sourceChanged, false);
    assert.deepEqual(output.appliedMigrationIds, [SUCCESSOR_ID]);
    assert.deepEqual(output.pendingMigrationIds, [SUCCESSOR_ID]);
    assert.equal(fileSha256(dbPath), before);
    assert.deepEqual(readdirSync(tempRoot), []);
  });

  let readyDryRunCalls = 0;
  const readyOutcome =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("dry-run"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          return readyValidation();
        },
        async dryRunCoinWalletReferenceIndexMigrations() {
          readyDryRunCalls += 1;
          return successfulOperation("dry-run");
        },
        get applyCoinWalletReferenceIndexMigrations() {
          throw new Error("operation_private");
        }
      }
    });
  assert.equal(readyOutcome.exitCode, EXIT_SUCCESS);
  assert.equal(readyDryRunCalls, 1);

  for (const validation of [
    pendingValidation({ reasonCodes: [] }),
    pendingValidation({ reasonCodes: ["required_migration_missing", "quick_check_failed"] }),
    pendingValidation({ pendingMigrationIds: [] }),
    pendingValidation({ pendingMigrationIds: [SUCCESSOR_ID, SUCCESSOR_ID] }),
    blockedValidation("owned_object_missing")
  ]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("dry-run"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            return validation;
          },
          get dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("allocation_private");
          },
          get applyCoinWalletReferenceIndexMigrations() {
            throw new Error("entry_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_SCHEMA_REJECTED);
    assertClosedFailureDefaults(outcome);
  }
});

test("apply requires the exact successor ID and checksum before database access", () => {
  const missingDbPath = resolve("account_private-missing.sqlite");
  const cases = [
    {
      args: ["--mode", "apply", "--db-path", missingDbPath],
      reason: "apply_confirmation_required"
    },
    {
      args: [
        "--mode", "apply", "--db-path", missingDbPath,
        "--confirm-migration-id", SUCCESSOR_ID
      ],
      reason: "apply_confirmation_required"
    },
    {
      args: [
        "--mode", "apply", "--db-path", missingDbPath,
        "--confirm-migration-id", `${SUCCESSOR_ID}_private`,
        "--confirm-ddl-checksum", SUCCESSOR_CHECKSUM
      ],
      reason: "migration_id_mismatch"
    },
    {
      args: [
        "--mode", "apply", "--db-path", missingDbPath,
        "--confirm-migration-id", SUCCESSOR_ID,
        "--confirm-ddl-checksum", "0".repeat(64)
      ],
      reason: "migration_checksum_mismatch"
    }
  ];
  for (const testCase of cases) {
    const result = runCli(testCase.args);
    assert.equal(result.status, EXIT_CONTRACT_REJECTED);
    const output = parseProcessOutput(result, {
      paths: [missingDbPath],
      extraForbidden: [`${SUCCESSOR_ID}_private`]
    });
    assertClosedFailureDefaults({ output });
    assert.deepEqual(output.reasonCodes, [testCase.reason]);
  }
});

test("exact apply and replay return ready with exit 0", () => {
  withTempDirectory("wallet-reference-cli-apply-", (directory) => {
    const dbPath = join(directory, "order_private.sqlite");
    createFoundationDatabase(dbPath);

    const applyResult = runCli(exactApplyArguments(dbPath));
    assert.equal(applyResult.status, EXIT_SUCCESS);
    const applied = parseProcessOutput(applyResult, { paths: [dbPath] });
    assert.equal(applied.ok, true);
    assert.equal(applied.mode, "apply");
    assert.equal(applied.schemaState, "ready");
    assert.equal(applied.sourceChanged, true);
    assert.deepEqual(applied.appliedMigrationIds, [SUCCESSOR_ID]);
    assert.deepEqual(applied.pendingMigrationIds, []);

    const replayResult = runCli(exactApplyArguments(dbPath));
    assert.equal(replayResult.status, EXIT_SUCCESS);
    const replayed = parseProcessOutput(replayResult, { paths: [dbPath] });
    assert.equal(replayed.ok, true);
    assert.equal(replayed.schemaState, "ready");
    assert.equal(replayed.sourceChanged, false);
    assert.deepEqual(replayed.appliedMigrationIds, []);
    assert.deepEqual(replayed.pendingMigrationIds, []);

    const validateResult = runCli([
      "--mode", "validate", "--db-path", dbPath
    ]);
    assert.equal(validateResult.status, EXIT_SUCCESS);
    const validated = parseProcessOutput(validateResult, { paths: [dbPath] });
    assert.equal(validated.ok, true);
    assert.equal(validated.schemaState, "ready");
    assert.deepEqual(validated.appliedMigrationIds, []);
  });
});

test("dependency schema ledger index and integrity failures exit 3", async () => {
  withTempDirectory("wallet-reference-cli-schema-failures-", (directory) => {
    const dependencyPath = join(directory, "account_private-dependency.sqlite");
    const dependencyDatabase = new Database(dependencyPath);
    dependencyDatabase.exec(`
      create table platform_accounts (
        id text primary key,
        owner_ref text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null default '{}'
      )
    `);
    dependencyDatabase.close();

    const ledgerPath = join(directory, "owner_private-ledger.sqlite");
    createFoundationDatabase(ledgerPath);
    const ledgerDatabase = new Database(ledgerPath);
    ledgerDatabase.exec(`
      drop table platform_schema_migrations;
      create table platform_schema_migrations (
        migration_id text primary key,
        private_checksum text not null
      )
    `);
    ledgerDatabase.close();

    const indexPath = join(directory, "lot_private-index.sqlite");
    createFoundationDatabase(indexPath);
    const indexDatabase = new Database(indexPath);
    indexDatabase.exec(`
      create index platform_coin_hold_allocations_lot_ref_idx
        on platform_coin_hold_allocations(lot_ref)
    `);
    indexDatabase.close();

    const cases = [
      [dependencyPath, "migration_dependency_missing"],
      [ledgerPath, "migration_ledger_incompatible"],
      [indexPath, "owned_object_without_migration"]
    ];
    for (const [dbPath, reason] of cases) {
      const result = runCli(["--mode", "validate", "--db-path", dbPath]);
      assert.equal(result.status, EXIT_SCHEMA_REJECTED);
      const output = parseProcessOutput(result, { paths: [dbPath] });
      assertClosedFailureDefaults({ output });
      assert.equal(output.schemaState, "blocked");
      assert.ok(output.reasonCodes.includes(reason));
    }
  });

  for (const reasonCode of [
    "applied_schema_incompatible",
    "migration_checksum_mismatch",
    "owned_object_incompatible",
    "owned_object_missing",
    "quick_check_failed",
    "foreign_key_check_failed"
  ]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("validate"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            return blockedValidation(reasonCode);
          },
          get dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("hold_private");
          },
          get applyCoinWalletReferenceIndexMigrations() {
            throw new Error("allocation_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_SCHEMA_REJECTED);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
  }
});

test("locked inspection close and unexpected failures exit 4", async () => {
  withTempDirectory("wallet-reference-cli-locked-", (directory) => {
    const dbPath = join(directory, "entry_private.sqlite");
    createFoundationDatabase(dbPath);
    const database = new Database(dbPath);
    database.exec("begin exclusive");
    try {
      const result = runCli(["--mode", "validate", "--db-path", dbPath]);
      assert.equal(result.status, EXIT_INFRASTRUCTURE_FAILURE);
      const output = parseProcessOutput(result, { paths: [dbPath] });
      assertClosedFailureDefaults({ output });
      assert.deepEqual(output.reasonCodes, ["database_unavailable"]);
    } finally {
      database.exec("rollback");
      database.close();
    }
  });

  for (const reasonCode of [
    "database_close_failed",
    "database_inspection_failed",
    "source_changed_during_dry_run"
  ]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("validate"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            return blockedValidation(reasonCode);
          },
          get dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("order_private");
          },
          get applyCoinWalletReferenceIndexMigrations() {
            throw new Error("source_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
  }

  const privateException = "SQLITE_PRIVATE account_private";
  const unexpected =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("validate"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          throw new Error(privateException);
        },
        dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("owner_private");
        },
        applyCoinWalletReferenceIndexMigrations() {
          throw new Error("wallet_private");
        }
      }
    });
  assert.equal(unexpected.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
  assertClosedFailureDefaults(unexpected);
  assert.deepEqual(
    unexpected.output.reasonCodes,
    ["unexpected_execution_failure"]
  );
  assert.equal(JSON.stringify(unexpected.output).includes(privateException), false);

  const busy = Object.assign(new Error("operation_private"), {
    code: "SQLITE_BUSY"
  });
  const busyOutcome =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("apply"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          return pendingValidation();
        },
        get dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("origin_private");
        },
        applyCoinWalletReferenceIndexMigrations() {
          throw busy;
        }
      }
    });
  assert.equal(busyOutcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
  assertClosedFailureDefaults(busyOutcome);
  assert.deepEqual(busyOutcome.output.reasonCodes, ["database_unavailable"]);
});

test("unknown returned reason codes become unexpected_execution_failure", async () => {
  const privateReasonCode = "wallet_private_raw_reason";
  const validateOutcome =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("validate"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          return readyValidation({ reasonCodes: [privateReasonCode] });
        },
        dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("operation_private");
        },
        applyCoinWalletReferenceIndexMigrations() {
          throw new Error("origin_private");
        }
      }
    });
  assert.equal(validateOutcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
  assertClosedFailureDefaults(validateOutcome);
  assert.deepEqual(
    validateOutcome.output.reasonCodes,
    ["unexpected_execution_failure"]
  );
  assert.equal(
    JSON.stringify(validateOutcome.output).includes(privateReasonCode),
    false
  );

  for (const resultOrError of [
    successfulOperation("apply", {
      reasonCodes: ["migration_apply_failed"],
      sourceChanged: true,
      appliedMigrationIds: [SUCCESSOR_ID]
    }),
    Object.assign(new Error("lot_private"), {
      code: "migration_apply_failed"
    })
  ]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("apply"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            return pendingValidation();
          },
          dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("hold_private");
          },
          applyCoinWalletReferenceIndexMigrations() {
            if (resultOrError instanceof Error) throw resultOrError;
            return resultOrError;
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"]
    );
    assert.equal(
      JSON.stringify(outcome.output).includes("migration_apply_failed"),
      false
    );
  }
});

test("validate dry-run and apply await rejected Promises without unhandled output", () => {
  for (const mode of ["validate", "dry-run", "apply"]) {
    const { marker, result } =
      runStrictInjectionProbe(mode, "rejected-promise");
    assert.equal(result.status, EXIT_INFRASTRUCTURE_FAILURE);
    const output = parseProcessOutput(result, {
      extraForbidden: [marker]
    });
    assertClosedFailureDefaults({ output });
    assert.equal(output.mode, mode);
    assert.deepEqual(
      output.reasonCodes,
      ["unexpected_execution_failure"]
    );
  }
});

test("validate dry-run and apply assimilate hostile thenables", () => {
  for (const mode of ["validate", "dry-run", "apply"]) {
    const { marker, result } =
      runStrictInjectionProbe(mode, "hostile-thenable");
    assert.equal(result.status, EXIT_INFRASTRUCTURE_FAILURE);
    const output = parseProcessOutput(result, {
      extraForbidden: [marker]
    });
    assertClosedFailureDefaults({ output });
    assert.equal(output.mode, mode);
    assert.deepEqual(
      output.reasonCodes,
      ["unexpected_execution_failure"]
    );
  }
});

test("validate thrown operation codes use the closed operation mapper", async () => {
  const cases = [
    ["SQLITE_BUSY", EXIT_INFRASTRUCTURE_FAILURE, "database_unavailable"],
    [
      "SQLITE_LOCKED_SHAREDCACHE",
      EXIT_INFRASTRUCTURE_FAILURE,
      "database_unavailable"
    ],
    [
      "database_close_failed",
      EXIT_INFRASTRUCTURE_FAILURE,
      "database_close_failed"
    ],
    [
      "database_inspection_failed",
      EXIT_INFRASTRUCTURE_FAILURE,
      "database_inspection_failed"
    ],
    [
      "database_unavailable",
      EXIT_INFRASTRUCTURE_FAILURE,
      "database_unavailable"
    ],
    [
      "source_changed_during_dry_run",
      EXIT_INFRASTRUCTURE_FAILURE,
      "source_changed_during_dry_run"
    ],
    ["applied_schema_incompatible", EXIT_SCHEMA_REJECTED, "applied_schema_incompatible"],
    ["database_invalid", EXIT_SCHEMA_REJECTED, "database_invalid"],
    ["database_missing", EXIT_SCHEMA_REJECTED, "database_missing"],
    ["foreign_key_check_failed", EXIT_SCHEMA_REJECTED, "foreign_key_check_failed"],
    ["migration_checksum_mismatch", EXIT_SCHEMA_REJECTED, "migration_checksum_mismatch"],
    ["migration_dependency_missing", EXIT_SCHEMA_REJECTED, "migration_dependency_missing"],
    ["migration_id_mismatch", EXIT_SCHEMA_REJECTED, "migration_id_mismatch"],
    ["migration_ledger_incompatible", EXIT_SCHEMA_REJECTED, "migration_ledger_incompatible"],
    ["owned_object_incompatible", EXIT_SCHEMA_REJECTED, "owned_object_incompatible"],
    ["owned_object_missing", EXIT_SCHEMA_REJECTED, "owned_object_missing"],
    ["owned_object_without_migration", EXIT_SCHEMA_REJECTED, "owned_object_without_migration"],
    ["quick_check_failed", EXIT_SCHEMA_REJECTED, "quick_check_failed"],
    ["required_migration_missing", EXIT_SCHEMA_REJECTED, "required_migration_missing"]
  ];
  for (const [code, exitCode, reasonCode] of cases) {
    const privateMessage = `${code}_account_private`;
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("validate"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            throw Object.assign(new Error(privateMessage), { code });
          },
          dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("owner_private");
          },
          applyCoinWalletReferenceIndexMigrations() {
            throw new Error("wallet_private");
          }
        }
      });
    assert.equal(outcome.exitCode, exitCode);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
    assert.equal(
      JSON.stringify(outcome.output).includes(privateMessage),
      false
    );
  }

  const hostileCode = {};
  Object.defineProperty(hostileCode, "code", {
    get() {
      throw new Error("operation_private");
    }
  });
  for (const thrown of ["origin_private", hostileCode]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("validate"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            throw thrown;
          },
          dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("lot_private");
          },
          applyCoinWalletReferenceIndexMigrations() {
            throw new Error("hold_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"]
    );
    assert.equal(
      JSON.stringify(outcome.output).includes("origin_private"),
      false
    );
  }
});

test("returned unexpected and parser-only reasons fail as unexpected execution", async () => {
  const parserOnlyReasons = [
    "apply_confirmation_required",
    "argument_not_allowed_for_mode",
    "database_path_must_be_absolute",
    "database_path_required",
    "duplicate_argument",
    "empty_argument",
    "invalid_mode",
    "mode_required",
    "temp_root_must_be_absolute",
    "unknown_argument"
  ];
  for (const mode of ["validate", "apply"]) {
    for (const returnedReason of [
      "unexpected_execution_failure",
      ...parserOnlyReasons
    ]) {
      const returned = {
        ...blockedValidation(returnedReason),
        mode,
        sourceChanged: true,
        appliedMigrationIds: [SUCCESSOR_ID]
      };
      const outcome =
        await successorCli.runCoinWalletReferenceIndexSchemaCli({
          argv: injectionArgv(mode),
          operations: {
            validateCoinWalletReferenceIndexSchema() {
              return mode === "validate"
                ? returned
                : pendingValidation();
            },
            dryRunCoinWalletReferenceIndexMigrations() {
              throw new Error("allocation_private");
            },
            applyCoinWalletReferenceIndexMigrations() {
              return returned;
            }
          }
        });
      assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
      assertClosedFailureDefaults(outcome);
      assert.deepEqual(
        outcome.output.reasonCodes,
        ["unexpected_execution_failure"]
      );
      if (returnedReason !== "unexpected_execution_failure") {
        assert.equal(
          JSON.stringify(outcome.output).includes(returnedReason),
          false
        );
      }
    }
  }
});

test("private mode schemaState and requiredMigrationId values are clamped closed", async () => {
  const privateValues = [
    "mode_private",
    "schema_private",
    "migration_private"
  ];
  const validateOutcome =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("validate"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          return readyValidation({
            mode: privateValues[0],
            schemaState: privateValues[1],
            requiredMigrationId: privateValues[2],
            unknownPrivateKey: "account_private"
          });
        },
        dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("owner_private");
        },
        applyCoinWalletReferenceIndexMigrations() {
          throw new Error("wallet_private");
        }
      }
    });
  assert.equal(validateOutcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
  assertClosedFailureDefaults(validateOutcome);
  assert.equal(validateOutcome.output.mode, "validate");
  assert.equal(validateOutcome.output.schemaState, "blocked");
  assert.equal(validateOutcome.output.requiredMigrationId, SUCCESSOR_ID);
  assert.deepEqual(
    validateOutcome.output.reasonCodes,
    ["unexpected_execution_failure"]
  );
  const serialized = JSON.stringify(validateOutcome.output);
  for (const value of [...privateValues, "account_private"]) {
    assert.equal(serialized.includes(value), false);
  }
  assert.deepEqual(Object.keys(validateOutcome.output).sort(), OUTPUT_KEYS);
});

test("injected operations enforce one validate call and at most one target call", async () => {
  let validateCalls = 0;
  const validateOnly =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("validate"),
      operations: {
        validateCoinWalletReferenceIndexSchema({ dbPath }) {
          validateCalls += 1;
          assert.equal(dbPath, resolve("synthetic-injection.sqlite"));
          return readyValidation();
        },
        get dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("operation_private");
        },
        get applyCoinWalletReferenceIndexMigrations() {
          throw new Error("origin_private");
        }
      }
    });
  assert.equal(validateOnly.exitCode, EXIT_SUCCESS);
  assert.equal(validateCalls, 1);

  let dryValidateCalls = 0;
  let dryRunCalls = 0;
  const dryRun =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("dry-run"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          dryValidateCalls += 1;
          return pendingValidation();
        },
        async dryRunCoinWalletReferenceIndexMigrations({
          dbPath,
          tempRoot
        }) {
          dryRunCalls += 1;
          assert.equal(dbPath, resolve("synthetic-injection.sqlite"));
          assert.equal(tempRoot, undefined);
          return successfulOperation("dry-run", {
            appliedMigrationIds: [SUCCESSOR_ID],
            pendingMigrationIds: [SUCCESSOR_ID]
          });
        },
        get applyCoinWalletReferenceIndexMigrations() {
          throw new Error("lot_private");
        }
      }
    });
  assert.equal(dryRun.exitCode, EXIT_SUCCESS);
  assert.equal(dryValidateCalls, 1);
  assert.equal(dryRunCalls, 1);

  let applyValidateCalls = 0;
  let applyCalls = 0;
  const apply =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("apply"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          applyValidateCalls += 1;
          return readyValidation();
        },
        get dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("hold_private");
        },
        applyCoinWalletReferenceIndexMigrations({
          dbPath,
          expectedMigrationId,
          expectedDdlChecksum
        }) {
          applyCalls += 1;
          assert.equal(dbPath, resolve("synthetic-injection.sqlite"));
          assert.equal(expectedMigrationId, SUCCESSOR_ID);
          assert.equal(expectedDdlChecksum, SUCCESSOR_CHECKSUM);
          return successfulOperation("apply");
        }
      }
    });
  assert.equal(apply.exitCode, EXIT_SUCCESS);
  assert.equal(applyValidateCalls, 1);
  assert.equal(applyCalls, 1);

  for (const mode of ["dry-run", "apply"]) {
    let blockedValidateCalls = 0;
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv(mode),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            blockedValidateCalls += 1;
            return blockedValidation("migration_dependency_missing");
          },
          get dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("allocation_private");
          },
          get applyCoinWalletReferenceIndexMigrations() {
            throw new Error("entry_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_SCHEMA_REJECTED);
    assert.equal(blockedValidateCalls, 1);
  }
});

test("contract validation and execution failures keep sourceChanged false and applied IDs empty", async () => {
  const malformedOperations = [
    {
      validateCoinWalletReferenceIndexSchema: null,
      dryRunCoinWalletReferenceIndexMigrations() {
        throw new Error("account_private");
      },
      applyCoinWalletReferenceIndexMigrations() {
        throw new Error("owner_private");
      }
    },
    {
      get validateCoinWalletReferenceIndexSchema() {
        throw new Error("wallet_private");
      },
      dryRunCoinWalletReferenceIndexMigrations() {
        throw new Error("operation_private");
      },
      applyCoinWalletReferenceIndexMigrations() {
        throw new Error("origin_private");
      }
    },
    {
      validateCoinWalletReferenceIndexSchema: 42,
      dryRunCoinWalletReferenceIndexMigrations() {
        throw new Error("lot_private");
      },
      applyCoinWalletReferenceIndexMigrations() {
        throw new Error("hold_private");
      }
    }
  ];
  for (const operations of malformedOperations) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("validate"),
        operations
      });
    assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"]
    );
  }

  const hostileChecks = {};
  Object.defineProperty(hostileChecks, "schemaExact", {
    get() {
      throw new Error("source_private");
    }
  });
  const hostileReasons = [];
  Object.defineProperty(hostileReasons, Symbol.iterator, {
    value() {
      throw new Error("allocation_private");
    }
  });
  for (const result of [
    null,
    [],
    readyValidation({ checks: null }),
    readyValidation({ checks: hostileChecks }),
    readyValidation({ reasonCodes: null }),
    readyValidation({ reasonCodes: hostileReasons }),
    readyValidation({ pendingMigrationIds: null })
  ]) {
    const outcome =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("validate"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            return result;
          },
          dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("account_private");
          },
          applyCoinWalletReferenceIndexMigrations() {
            throw new Error("owner_private");
          }
        }
      });
    assert.equal(outcome.exitCode, EXIT_INFRASTRUCTURE_FAILURE);
    assertClosedFailureDefaults(outcome);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"]
    );
    assert.equal(
      JSON.stringify(outcome.output).includes("source_private"),
      false
    );
  }

  const failedResult = {
    ...blockedValidation("owned_object_missing"),
    mode: "apply",
    sourceChanged: true,
    appliedMigrationIds: [SUCCESSOR_ID]
  };
  const targetFailure =
    await successorCli.runCoinWalletReferenceIndexSchemaCli({
      argv: injectionArgv("apply"),
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          return pendingValidation();
        },
        dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("wallet_private");
        },
        applyCoinWalletReferenceIndexMigrations() {
          return failedResult;
        }
      }
    });
  assert.equal(targetFailure.exitCode, EXIT_SCHEMA_REJECTED);
  assertClosedFailureDefaults(targetFailure);
  assert.deepEqual(
    targetFailure.output.reasonCodes,
    ["owned_object_missing"]
  );

  for (const reasonCode of [
    "applied_schema_incompatible",
    "migration_checksum_mismatch",
    "migration_dependency_missing",
    "migration_id_mismatch",
    "owned_object_without_migration"
  ]) {
    const schemaError = Object.assign(new Error("operation_private"), {
      code: reasonCode
    });
    const thrownFailure =
      await successorCli.runCoinWalletReferenceIndexSchemaCli({
        argv: injectionArgv("apply"),
        operations: {
          validateCoinWalletReferenceIndexSchema() {
            return pendingValidation();
          },
          dryRunCoinWalletReferenceIndexMigrations() {
            throw new Error("origin_private");
          },
          applyCoinWalletReferenceIndexMigrations() {
            throw schemaError;
          }
        }
      });
    assert.equal(thrownFailure.exitCode, EXIT_SCHEMA_REJECTED);
    assertClosedFailureDefaults(thrownFailure);
    assert.deepEqual(thrownFailure.output.reasonCodes, [reasonCode]);
  }
});

test("CLI import emits no output and uses the module migration identity", async () => {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  const writes = [];
  let imported;
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    imported = await import(
      `${pathToFileURL(CLI_PATH).href}?silent-import=${Date.now()}`
    );
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode;
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(
    Object.keys(imported),
    ["runCoinWalletReferenceIndexSchemaCli"]
  );
  assert.equal(
    typeof imported.runCoinWalletReferenceIndexSchemaCli,
    "function"
  );
  assert.equal(
    REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    SUCCESSOR_ID
  );
  assert.deepEqual(COIN_WALLET_REFERENCE_INDEX_MIGRATIONS, [{
    id: SUCCESSOR_ID,
    ddlChecksum: SUCCESSOR_CHECKSUM
  }]);
  const outcome =
    await imported.runCoinWalletReferenceIndexSchemaCli({
      argv: [],
      operations: {
        validateCoinWalletReferenceIndexSchema() {
          throw new Error("account_private");
        },
        dryRunCoinWalletReferenceIndexMigrations() {
          throw new Error("owner_private");
        },
        applyCoinWalletReferenceIndexMigrations() {
          throw new Error("wallet_private");
        }
      }
    });
  assert.equal(outcome.output.requiredMigrationId, SUCCESSOR_ID);
});
