import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations
} from "../services/platform/coin-commerce-migrations.mjs";
import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  runAccountResourceAuthoritySchemaCli
} from "../../scripts/platform-account-resource-authority-schema.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-account-resource-authority-schema.mjs"
);
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const DDL_CHECKSUM = ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum;
const DB_PATH = process.platform === "win32"
  ? "C:\\synthetic-authority.sqlite"
  : "/tmp/synthetic-authority.sqlite";
const TEMP_ROOT = process.platform === "win32"
  ? "C:\\synthetic-authority-dry-run"
  : "/tmp/synthetic-authority-dry-run";

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-cli-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
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
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      plan text not null,
      status text not null,
      valid_from text not null,
      valid_until text not null,
      max_artifacts integer not null default 1,
      max_devices integer not null default 1,
      traffic_limit_bytes integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create table platform_issuance_requests (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      entitlement_id text not null references platform_entitlements(id)
        on delete cascade,
      approval_ref text not null,
      status text not null,
      quantity integer not null,
      node_id text not null,
      purpose text not null,
      requested_by_ref text not null,
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_issued_subscription_links (
      id text primary key,
      request_id text not null references platform_issuance_requests(id)
        on delete cascade,
      tenant_ref text not null,
      artifact_ref text not null,
      status text not null,
      created_at text not null,
      updated_at text not null
    );
    create table platform_portal_access_requests (
      id text primary key,
      portal_user_ref text not null,
      entitlement_ref text,
      status text not null,
      tenant_id text,
      artifact_id text,
      expires_at text,
      valid_until text
    );
    create table synthetic_private_sentinel (
      sentinel_key text primary key,
      sentinel_value text not null
    );
    insert into synthetic_private_sentinel
      values ('private-account', 'private-resource');
  `);
  database.close();
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum
  });
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });
}

function parseProcessOutput(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assertClosedOutput(output);
  const serialized = `${result.stdout}\n${result.stderr}`;
  for (const forbidden of [
    "private-account",
    "private-resource",
    "synthetic_private_sentinel"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  return output;
}

function checks({
  schemaExact = true,
  zeroBackfill = true,
  rollbackSafe = true
} = {}) {
  return {
    walletDependency: true,
    commerceDependency: true,
    lineageDependency: true,
    schemaExact,
    zeroBackfill,
    rollbackSafe,
    quickCheck: true,
    foreignKeys: true
  };
}

function emptyCounts(overrides = {}) {
  return {
    authorityRows: 0,
    ownedObjects: 0,
    migrationRows: 0,
    foreignKeyViolations: 0,
    externalDependencies: 0,
    accounts: 0,
    activeAuthorityRows: 0,
    resolved: 0,
    missingAuthority: 0,
    invalidAuthority: 0,
    authorityConflicts: 0,
    ambiguousBindingsWithoutAuthority: 0,
    singleBindingWithoutAuthority: 0,
    noBindingWithoutAuthority: 0,
    ...overrides
  };
}

function readyValidation(overrides = {}) {
  return {
    ok: true,
    schemaState: "ready",
    requiredMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    checks: checks(),
    counts: emptyCounts(),
    reasonCodes: [],
    pendingMigrationIds: [],
    ...overrides
  };
}

function pendingValidation() {
  return readyValidation({
    ok: false,
    schemaState: "pending",
    checks: checks({ schemaExact: false }),
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
  });
}

function makeOperations(overrides = {}) {
  return {
    validateAccountResourceAuthoritySchema: () => readyValidation(),
    dryRunAccountResourceAuthorityMigrations: () => ({
      ...readyValidation(),
      sourceChanged: false,
      pendingMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID],
      appliedMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
    }),
    applyAccountResourceAuthorityMigrations: () => ({
      ...readyValidation(),
      sourceChanged: true,
      appliedMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
    }),
    rollbackAccountResourceAuthorityMigration: () => ({
      ...pendingValidation(),
      sourceChanged: true,
      rolledBackMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
    }),
    resolveDryRunAccountResourceAuthorities: () => ({
      ok: true,
      ready: true,
      aggregateOnly: true,
      counts: emptyCounts(),
      reasonCodes: {
        no_authority: 0,
        authority_conflict: 0,
        authority_drift: 0
      }
    }),
    ...overrides
  };
}

function exactMutationArguments(mode) {
  return [
    "--mode",
    mode,
    "--db-path",
    DB_PATH,
    "--confirm-migration-id",
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    "--confirm-ddl-checksum",
    DDL_CHECKSUM
  ];
}

function assertClosedOutput(output) {
  assert.deepEqual(Object.keys(output).sort(), [
    "appliedMigrationIds",
    "checks",
    "counts",
    "mode",
    "ok",
    "pendingMigrationIds",
    "reasonCodes",
    "reasonCounts",
    "requiredMigrationId",
    "resolutionReady",
    "rolledBackMigrationIds",
    "schemaState",
    "sourceChanged"
  ]);
  assert.deepEqual(Object.keys(output.checks), [
    "walletDependency",
    "commerceDependency",
    "lineageDependency",
    "schemaExact",
    "zeroBackfill",
    "rollbackSafe",
    "quickCheck",
    "foreignKeys"
  ]);
  assert.deepEqual(Object.keys(output.counts), [
    "authorityRows",
    "ownedObjects",
    "migrationRows",
    "foreignKeyViolations",
    "externalDependencies",
    "accounts",
    "activeAuthorityRows",
    "resolved",
    "missingAuthority",
    "invalidAuthority",
    "authorityConflicts",
    "ambiguousBindingsWithoutAuthority",
    "singleBindingWithoutAuthority",
    "noBindingWithoutAuthority"
  ]);
  const serialized = JSON.stringify(output);
  for (const forbidden of [
    "account_id",
    "resource_request_id",
    "entitlement_id",
    "issued_link_id",
    "subscription_url",
    DB_PATH,
    "select ",
    "create table",
    "Error:"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
}

test("CLI import is quiet and a direct contract rejection is one closed JSON line", () => {
  const imported = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import(${JSON.stringify(pathToFileURL(CLI_PATH).href)})`
    ],
    { cwd: REPOSITORY_ROOT, encoding: "utf8", env: {}, windowsHide: true }
  );
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");

  const invoked = spawnSync(process.execPath, [CLI_PATH], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    windowsHide: true
  });
  assert.equal(invoked.status, 2);
  assert.equal(invoked.stderr, "");
  const lines = invoked.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assertClosedOutput(output);
  assert.deepEqual(output.reasonCodes, ["mode_required"]);
});

test("package exposes the account resource authority schema CLI", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:account-resource-authority:schema"],
    "node scripts/platform-account-resource-authority-schema.mjs"
  );
});

test("default CLI wiring dry-runs applies validates resolves and empty-rolls back", async () => {
  await withTempDirectory(async (directory) => {
    const dbPath = join(directory, "private-account-resource.sqlite");
    const tempRoot = join(directory, "dry-run");
    createFoundationDatabase(dbPath);
    const before = sha256File(dbPath);

    const pending = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(pending.status, 3);
    assert.equal(parseProcessOutput(pending).schemaState, "pending");

    const dryRun = runCli([
      "--mode", "dry-run", "--db-path", dbPath, "--temp-root", tempRoot
    ]);
    assert.equal(dryRun.status, 0);
    const dryOutput = parseProcessOutput(dryRun);
    assert.equal(dryOutput.sourceChanged, false);
    assert.equal(sha256File(dbPath), before);

    const apply = runCli([
      "--mode", "apply", "--db-path", dbPath,
      "--confirm-migration-id", REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      "--confirm-ddl-checksum", DDL_CHECKSUM
    ]);
    assert.equal(apply.status, 0);
    assert.equal(parseProcessOutput(apply).sourceChanged, true);

    const validate = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(validate.status, 0);
    assert.equal(parseProcessOutput(validate).schemaState, "ready");

    const resolveDryRun = runCli([
      "--mode", "resolve-dry-run", "--db-path", dbPath
    ]);
    assert.equal(resolveDryRun.status, 0);
    const resolveOutput = parseProcessOutput(resolveDryRun);
    assert.equal(resolveOutput.resolutionReady, true);
    assert.equal(resolveOutput.counts.accounts, 0);

    const rollback = runCli([
      "--mode", "rollback", "--db-path", dbPath,
      "--confirm-migration-id", REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      "--confirm-ddl-checksum", DDL_CHECKSUM
    ]);
    assert.equal(rollback.status, 0);
    const rollbackOutput = parseProcessOutput(rollback);
    assert.equal(rollbackOutput.schemaState, "pending");
    assert.equal(rollbackOutput.sourceChanged, true);
  });
});

test("argument contract rejects missing duplicate unknown relative and incompatible flags", async () => {
  const cases = [
    [[], "mode_required"],
    [["--mode", "validate"], "database_path_required"],
    [["--mode", "other", "--db-path", DB_PATH], "invalid_mode"],
    [["--mode", "validate", "--mode", "validate", "--db-path", DB_PATH], "duplicate_argument"],
    [["--mode", "validate", "--unknown", "value", "--db-path", DB_PATH], "unknown_argument"],
    [["--mode", "validate", "--db-path", ""], "empty_argument"],
    [["--mode", "validate", "--db-path", "relative.sqlite"], "database_path_must_be_absolute"],
    [["--mode", "validate", "--db-path", DB_PATH, "--temp-root", TEMP_ROOT], "argument_not_allowed_for_mode"],
    [["--mode", "resolve-dry-run", "--db-path", DB_PATH, "--confirm-migration-id", REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID], "argument_not_allowed_for_mode"]
  ];

  for (const [argv, reasonCode] of cases) {
    const outcome = await runAccountResourceAuthoritySchemaCli({
      argv,
      operations: makeOperations()
    });
    assert.equal(outcome.exitCode, 2);
    assertClosedOutput(outcome.output);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
  }
});

test("apply and rollback require the exact migration identity and checksum", async () => {
  for (const mode of ["apply", "rollback"]) {
    const missing = await runAccountResourceAuthoritySchemaCli({
      argv: ["--mode", mode, "--db-path", DB_PATH],
      operations: makeOperations()
    });
    assert.equal(missing.exitCode, 2);
    assert.deepEqual(missing.output.reasonCodes, [
      mode === "apply"
        ? "apply_confirmation_required"
        : "rollback_confirmation_required"
    ]);

    const wrongId = await runAccountResourceAuthoritySchemaCli({
      argv: [
        "--mode", mode, "--db-path", DB_PATH,
        "--confirm-migration-id", "wrong",
        "--confirm-ddl-checksum", DDL_CHECKSUM
      ],
      operations: makeOperations()
    });
    assert.equal(wrongId.exitCode, 2);
    assert.deepEqual(wrongId.output.reasonCodes, ["migration_id_mismatch"]);

    const wrongChecksum = await runAccountResourceAuthoritySchemaCli({
      argv: [
        "--mode", mode, "--db-path", DB_PATH,
        "--confirm-migration-id", REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
        "--confirm-ddl-checksum", "0".repeat(64)
      ],
      operations: makeOperations()
    });
    assert.equal(wrongChecksum.exitCode, 2);
    assert.deepEqual(wrongChecksum.output.reasonCodes, [
      "migration_checksum_mismatch"
    ]);
  }
});

test("migration dry-run and resolver dry-run are separate aggregate-only paths", async () => {
  const calls = [];
  const operations = makeOperations({
    validateAccountResourceAuthoritySchema: () => {
      calls.push("validate");
      return pendingValidation();
    },
    dryRunAccountResourceAuthorityMigrations: (options) => {
      calls.push(["migration", options]);
      return {
        ...readyValidation(),
        sourceChanged: false,
        pendingMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID],
        appliedMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
      };
    },
    resolveDryRunAccountResourceAuthorities: () => {
      throw new Error("resolver must not run during migration dry-run");
    }
  });
  const migration = await runAccountResourceAuthoritySchemaCli({
    argv: [
      "--mode", "dry-run", "--db-path", DB_PATH,
      "--temp-root", TEMP_ROOT
    ],
    operations
  });
  assert.equal(migration.exitCode, 0);
  assert.equal(migration.output.mode, "dry-run");
  assert.equal(migration.output.sourceChanged, false);
  assert.deepEqual(calls, [
    "validate",
    ["migration", { dbPath: DB_PATH, tempRoot: TEMP_ROOT }]
  ]);

  const resolutionCounts = emptyCounts({
    accounts: 9,
    activeAuthorityRows: 4,
    resolved: 3,
    missingAuthority: 4,
    invalidAuthority: 1,
    authorityConflicts: 1,
    ambiguousBindingsWithoutAuthority: 2,
    singleBindingWithoutAuthority: 1,
    noBindingWithoutAuthority: 1
  });
  const resolved = await runAccountResourceAuthoritySchemaCli({
    argv: ["--mode", "resolve-dry-run", "--db-path", DB_PATH],
    operations: makeOperations({
      resolveDryRunAccountResourceAuthorities: () => ({
        ok: true,
        ready: false,
        aggregateOnly: true,
        counts: resolutionCounts,
        reasonCodes: {
          no_authority: 4,
          authority_conflict: 1,
          authority_drift: 1
        }
      })
    })
  });
  assert.equal(resolved.exitCode, 0);
  assert.equal(resolved.output.mode, "resolve-dry-run");
  assert.equal(resolved.output.sourceChanged, false);
  assert.equal(resolved.output.resolutionReady, false);
  assert.deepEqual(resolved.output.counts, resolutionCounts);
  assert.deepEqual(resolved.output.reasonCounts, {
    no_authority: 4,
    authority_conflict: 1,
    authority_drift: 1
  });
  assertClosedOutput(resolved.output);
});

test("resolver dry-run fails closed when the operation returns references or raw rows", async () => {
  for (const unsafeResult of [
    {
      ok: true,
      ready: true,
      aggregateOnly: true,
      counts: emptyCounts(),
      reasonCodes: {},
      accountRefs: ["private-account"]
    },
    {
      ok: true,
      ready: true,
      aggregateOnly: true,
      counts: { ...emptyCounts(), account_id: 1 },
      reasonCodes: {}
    }
  ]) {
    const outcome = await runAccountResourceAuthoritySchemaCli({
      argv: ["--mode", "resolve-dry-run", "--db-path", DB_PATH],
      operations: makeOperations({
        resolveDryRunAccountResourceAuthorities: () => unsafeResult
      })
    });
    assert.equal(outcome.exitCode, 4);
    assert.deepEqual(outcome.output.reasonCodes, [
      "unexpected_execution_failure"
    ]);
    assert.equal(JSON.stringify(outcome.output).includes("private-account"), false);
    assertClosedOutput(outcome.output);
  }
});

test("exact apply and empty-table rollback call only their selected mutation", async () => {
  const calls = [];
  const operations = makeOperations({
    validateAccountResourceAuthoritySchema: () => {
      calls.push("validate");
      return pendingValidation();
    },
    applyAccountResourceAuthorityMigrations: (options) => {
      calls.push(["apply", options]);
      return {
        ...readyValidation(),
        sourceChanged: true,
        appliedMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
      };
    }
  });
  const applied = await runAccountResourceAuthoritySchemaCli({
    argv: exactMutationArguments("apply"),
    operations
  });
  assert.equal(applied.exitCode, 0);
  assert.equal(applied.output.sourceChanged, true);
  assert.deepEqual(applied.output.appliedMigrationIds, [
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  ]);
  assert.deepEqual(calls, [
    "validate",
    ["apply", {
      dbPath: DB_PATH,
      expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
      expectedDdlChecksum: DDL_CHECKSUM
    }]
  ]);

  const rollbackCalls = [];
  const rolledBack = await runAccountResourceAuthoritySchemaCli({
    argv: exactMutationArguments("rollback"),
    operations: makeOperations({
      validateAccountResourceAuthoritySchema: () => {
        rollbackCalls.push("validate");
        return readyValidation();
      },
      rollbackAccountResourceAuthorityMigration: (options) => {
        rollbackCalls.push(["rollback", options]);
        return {
          ...pendingValidation(),
          sourceChanged: true,
          rolledBackMigrationIds: [REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID]
        };
      }
    })
  });
  assert.equal(rolledBack.exitCode, 0);
  assert.equal(rolledBack.output.schemaState, "pending");
  assert.deepEqual(rolledBack.output.rolledBackMigrationIds, [
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  ]);
  assert.equal(rolledBack.output.checks.zeroBackfill, true);
  assert.equal(rollbackCalls.length, 2);
  assert.equal(rollbackCalls[0], "validate");
  assert.equal(rollbackCalls[1][0], "rollback");
});

test("rollback refuses a non-empty authority table without leaking data", async () => {
  const error = new Error("must not be exposed private-account");
  error.code = "authority_rollback_rows_present";
  const outcome = await runAccountResourceAuthoritySchemaCli({
    argv: exactMutationArguments("rollback"),
    operations: makeOperations({
      rollbackAccountResourceAuthorityMigration: () => {
        throw error;
      }
    })
  });
  assert.equal(outcome.exitCode, 3);
  assert.deepEqual(outcome.output.reasonCodes, [
    "authority_rollback_rows_present"
  ]);
  assert.equal(JSON.stringify(outcome.output).includes("private-account"), false);
  assertClosedOutput(outcome.output);
});

test("rollback refuses external schema consumers with a redacted safe reason", async () => {
  const error = new Error("private dependent object definition");
  error.code = "authority_rollback_dependency_present";
  const outcome = await runAccountResourceAuthoritySchemaCli({
    argv: exactMutationArguments("rollback"),
    operations: makeOperations({
      rollbackAccountResourceAuthorityMigration: () => {
        throw error;
      }
    })
  });
  assert.equal(outcome.exitCode, 3);
  assert.deepEqual(outcome.output.reasonCodes, [
    "authority_rollback_dependency_present"
  ]);
  assert.equal(
    JSON.stringify(outcome.output).includes("dependent object definition"),
    false
  );
  assertClosedOutput(outcome.output);
});

test("unknown operation reasons and unexpected failures are redacted infrastructure failures", async () => {
  const unknownReason = await runAccountResourceAuthoritySchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthoritySchema: () => readyValidation({
        ok: false,
        reasonCodes: ["private_reason"]
      })
    })
  });
  assert.equal(unknownReason.exitCode, 4);
  assert.deepEqual(unknownReason.output.reasonCodes, [
    "unexpected_execution_failure"
  ]);

  const thrown = await runAccountResourceAuthoritySchemaCli({
    argv: ["--mode", "resolve-dry-run", "--db-path", DB_PATH],
    operations: makeOperations({
      resolveDryRunAccountResourceAuthorities: () => {
        throw new Error("private-account private-link");
      }
    })
  });
  assert.equal(thrown.exitCode, 4);
  assert.deepEqual(thrown.output.reasonCodes, [
    "unexpected_execution_failure"
  ]);
  assertClosedOutput(thrown.output);

  const returnedInfrastructureFailure =
    await runAccountResourceAuthoritySchemaCli({
      argv: ["--mode", "dry-run", "--db-path", DB_PATH],
      operations: makeOperations({
        dryRunAccountResourceAuthorityMigrations: () => ({
          ...readyValidation({
            ok: false,
            schemaState: "blocked",
            reasonCodes: ["authority_source_changed_during_dry_run"]
          }),
          sourceChanged: false,
          appliedMigrationIds: [],
          pendingMigrationIds: []
        })
      })
    });
  assert.equal(returnedInfrastructureFailure.exitCode, 4);
  assert.deepEqual(returnedInfrastructureFailure.output.reasonCodes, [
    "authority_source_changed_during_dry_run"
  ]);
});
