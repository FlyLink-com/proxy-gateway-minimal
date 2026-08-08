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
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";

import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations
} from "../services/platform/account-resource-authority-migrations.mjs";
import {
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
} from "../services/platform/account-resource-authority-commerce-migrations.mjs";
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
  runAccountResourceAuthorityCommerceSchemaCli
} from "../../scripts/platform-account-resource-authority-commerce-schema.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "platform-account-resource-authority-commerce-schema.mjs"
);
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const DDL_CHECKSUM =
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum;
const DB_PATH = process.platform === "win32"
  ? "C:\\synthetic-authority-commerce.sqlite"
  : "/tmp/synthetic-authority-commerce.sqlite";
const TEMP_ROOT = process.platform === "win32"
  ? "C:\\synthetic-authority-commerce-dry-run"
  : "/tmp/synthetic-authority-commerce-dry-run";
const APPLIED_AT = "2026-08-08T00:00:00.000Z";

const TOP_LEVEL_KEYS = [
  "appliedMigrationCount",
  "checks",
  "counts",
  "mode",
  "ok",
  "pendingMigrationCount",
  "reasonCodes",
  "requiredMigrationPresent",
  "rolledBackMigrationCount",
  "schemaState",
  "schemaVersion",
  "sourceChanged",
  "type"
];
const CHECK_KEYS = [
  "authorityDependency",
  "commerceDependency",
  "foreignKeys",
  "quickCheck",
  "rollbackSafe",
  "schemaExact",
  "zeroBackfill"
];
const COUNT_KEYS = [
  "bindingRows",
  "externalDependencies",
  "foreignKeyViolations",
  "migrationRows",
  "ownedObjects"
];

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-commerce-cli-test-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

async function withTempDirectoryAsync(action) {
  const directory = mkdtempSync(join(tmpdir(), "authority-commerce-cli-test-"));
  try {
    return await action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function createFoundation(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (
        status in ('active', 'suspended', 'disabled')
      ),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    create table platform_entitlements (
      id text primary key,
      account_id text not null references platform_accounts(id)
        on delete cascade,
      plan text not null,
      status text not null check (
        status in ('active', 'expired', 'revoked', 'suspended')
      ),
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
      status text not null check (
        status in ('planned', 'issued', 'failed', 'revoked', 'cancelled')
      ),
      quantity integer not null check (quantity > 0),
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
      status text not null check (
        status in ('active', 'revoked', 'rotated', 'disabled')
      ),
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
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyCoinCommerceMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    expectedDdlChecksum: COIN_COMMERCE_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
  applyAccountResourceAuthorityMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    expectedDdlChecksum: ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function seedBinding(database, suffix) {
  const accountId = `private_account_${suffix}`;
  const authorityRef = `private_authority_${suffix}`;
  const requestId = `private_request_${suffix}`;
  const entitlementId = `private_entitlement_${suffix}`;
  const linkId = `private_link_${suffix}`;
  const offerVersionRef = `private_offer_version_${suffix}`;
  const quoteRef = `private_quote_${suffix}`;
  database.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (?, ?, 'active', ?, ?, '{}')
  `).run(accountId, `private_owner_${suffix}`, APPLIED_AT, APPLIED_AT);
  database.prepare(`
    insert into platform_entitlements (
      id, account_id, plan, status, valid_from, valid_until,
      max_artifacts, max_devices, traffic_limit_bytes, created_at, updated_at
    ) values (?, ?, ?, 'active', ?, '2027-08-08T00:00:00.000Z',
      1, 1, 1, ?, ?)
  `).run(
    entitlementId,
    accountId,
    offerVersionRef,
    APPLIED_AT,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_issuance_requests (
      id, account_id, entitlement_id, approval_ref, status, quantity,
      node_id, purpose, requested_by_ref, created_at, updated_at,
      metadata_json
    ) values (?, ?, ?, ?, 'issued', 1, 'private-node', 'commerce', ?,
      ?, ?, '{}')
  `).run(
    requestId,
    accountId,
    entitlementId,
    `private_approval_${suffix}`,
    `private_requester_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_issued_subscription_links (
      id, request_id, tenant_ref, artifact_ref, status, created_at, updated_at
    ) values (?, ?, ?, ?, 'active', ?, ?)
  `).run(
    linkId,
    requestId,
    `private_tenant_${suffix}`,
    `private_artifact_${suffix}`,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_account_resource_authorities (
      authority_ref, account_id, resource_request_id, entitlement_id,
      issued_link_id, status, version, previous_authority_ref,
      created_at, updated_at, created_by, reason,
      revoked_at, revoked_by, revocation_reason
    ) values (?, ?, ?, ?, ?, 'active', 1, null, ?, ?, 'operator:test',
      'explicit_test_assignment', null, null, null)
  `).run(
    authorityRef,
    accountId,
    requestId,
    entitlementId,
    linkId,
    APPLIED_AT,
    APPLIED_AT
  );
  database.prepare(`
    insert into platform_coin_commerce_offer_versions (
      offer_version_ref, offer_ref, version, status, category,
      title_zh, title_en, summary_zh, summary_en,
      important_notices_zh_json, important_notices_en_json,
      base_coin_units, reference_currency, reference_amount_minor,
      accepted_coin_types_json, delivery_kind, duration_days,
      monthly_traffic_gb, traffic_gb, never_expires,
      discount_basis_points, created_at, published_at, retired_at
    ) values (
      ?, ?, 1, 'published', 'plan',
      'private', 'private', 'private', 'private',
      '["private"]', '["private"]',
      20, 'CNY', 2000, '["paid_coins"]',
      'subscription_plan', 30, 50, null, 0, 0, ?, ?, null
    )
  `).run(offerVersionRef, `private_offer_${suffix}`, APPLIED_AT, APPLIED_AT);
  database.prepare(`
    insert into platform_coin_commerce_quotes (
      quote_ref, account_id, offer_version_ref, wallet_version,
      amount_units, applied_discount_basis_points,
      purchase_availability, shortfall_units, allocation_json,
      before_balance_json, after_balance_json, status,
      created_at, expires_at, consumed_at
    ) values (
      ?, ?, ?, 0, 20, 0, 'available', 0, '[]',
      '{}', '{}', 'active', ?, '2027-08-08T00:00:00.000Z', null
    )
  `).run(quoteRef, accountId, offerVersionRef, APPLIED_AT);
  database.prepare(`
    insert into platform_commerce_authority_quote_bindings (
      quote_ref, authority_ref, account_id, authority_version,
      resource_request_id, entitlement_id, issued_link_id, created_at
    ) values (?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    quoteRef,
    authorityRef,
    accountId,
    requestId,
    entitlementId,
    linkId,
    APPLIED_AT
  );
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function checks(overrides = {}) {
  return {
    authorityDependency: true,
    commerceDependency: true,
    schemaExact: true,
    zeroBackfill: true,
    rollbackSafe: true,
    quickCheck: true,
    foreignKeys: true,
    ...overrides
  };
}

function counts(overrides = {}) {
  return {
    bindingRows: 0,
    externalDependencies: 0,
    ownedObjects: 4,
    migrationRows: 4,
    foreignKeyViolations: 0,
    ...overrides
  };
}

function readyResult(overrides = {}) {
  return {
    ok: true,
    schemaState: "ready",
    requiredMigrationId:
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    checks: checks(),
    counts: counts(),
    reasonCodes: [],
    pendingMigrationIds: [],
    ...overrides
  };
}

function pendingResult(overrides = {}) {
  return readyResult({
    ok: false,
    schemaState: "pending",
    checks: checks({ schemaExact: false }),
    counts: counts({ ownedObjects: 0, bindingRows: 0 }),
    reasonCodes: ["required_migration_missing"],
    pendingMigrationIds: [
      REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
    ],
    ...overrides
  });
}

function makeOperations(overrides = {}) {
  return {
    validateAccountResourceAuthorityCommerceSchema: () => readyResult(),
    dryRunAccountResourceAuthorityCommerceMigrations: () => readyResult({
      mode: "dry-run",
      sourceChanged: false,
      appliedMigrationIds: []
    }),
    applyAccountResourceAuthorityCommerceMigrations: () => readyResult({
      mode: "apply",
      sourceChanged: true,
      appliedMigrationIds: [
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ]
    }),
    rollbackAccountResourceAuthorityCommerceMigration: () => pendingResult({
      mode: "rollback",
      sourceChanged: true,
      rolledBackMigrationIds: [
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ]
    }),
    ...overrides
  };
}

function exactMutationArguments(mode, dbPath = DB_PATH) {
  return [
    "--mode", mode,
    "--db-path", dbPath,
    "--confirm-migration-id",
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    "--confirm-ddl-checksum", DDL_CHECKSUM
  ];
}

function assertClosedOutput(output) {
  assert.deepEqual(Object.keys(output).sort(), TOP_LEVEL_KEYS);
  assert.deepEqual(Object.keys(output.checks).sort(), CHECK_KEYS);
  assert.deepEqual(Object.keys(output.counts).sort(), COUNT_KEYS);
  assert.equal(output.schemaVersion, "1");
  assert.equal(output.type, "account_resource_authority_commerce_schema_operator");
  const serialized = JSON.stringify(output);
  for (const forbidden of [
    DB_PATH,
    TEMP_ROOT,
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
    DDL_CHECKSUM,
    "private-account",
    "private-resource",
    "private_authority",
    "private_request",
    "select ",
    "create table",
    "rawRows",
    "arbitraryNested",
    "Error:",
    "stack"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
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
  return output;
}

test("CLI import is quiet and a direct rejection is one closed JSON line", () => {
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

  const invoked = runCli([]);
  assert.equal(invoked.status, 2);
  const output = parseProcessOutput(invoked);
  assert.deepEqual(output.reasonCodes, ["mode_required"]);
});

test("all four modes dispatch only their matching Task 1 operation", async () => {
  for (const mode of ["validate", "dry-run", "apply", "rollback"]) {
    const calls = [];
    const operations = makeOperations({
      validateAccountResourceAuthorityCommerceSchema: (options) => {
        calls.push(["validate", options]);
        return readyResult();
      },
      dryRunAccountResourceAuthorityCommerceMigrations: (options) => {
        calls.push(["dry-run", options]);
        return readyResult({
          mode: "dry-run",
          sourceChanged: false,
          appliedMigrationIds: []
        });
      },
      applyAccountResourceAuthorityCommerceMigrations: (options) => {
        calls.push(["apply", options]);
        return readyResult({
          mode: "apply",
          sourceChanged: false,
          appliedMigrationIds: []
        });
      },
      rollbackAccountResourceAuthorityCommerceMigration: (options) => {
        calls.push(["rollback", options]);
        return pendingResult({
          mode: "rollback",
          sourceChanged: false,
          rolledBackMigrationIds: []
        });
      }
    });
    const argv = mode === "apply" || mode === "rollback"
      ? exactMutationArguments(mode)
      : [
          "--mode", mode,
          "--db-path", DB_PATH,
          ...(mode === "dry-run" ? ["--temp-root", TEMP_ROOT] : [])
        ];
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv,
      operations
    });
    assert.equal(outcome.exitCode, 0, mode);
    assert.equal(calls.length, 1, mode);
    assert.equal(calls[0][0], mode, mode);
    assert.equal(calls[0][1].dbPath, DB_PATH, mode);
    if (mode === "dry-run") assert.equal(calls[0][1].tempRoot, TEMP_ROOT);
    if (mode === "apply" || mode === "rollback") {
      assert.deepEqual(calls[0][1], {
        dbPath: DB_PATH,
        expectedMigrationId:
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
        expectedDdlChecksum: DDL_CHECKSUM
      });
    }
    assertClosedOutput(outcome.output);
  }
});

test("argument parsing rejects missing duplicate unknown relative and incompatible input before access", async () => {
  const cases = [
    [[], "mode_required"],
    [["--mode", "validate"], "database_path_required"],
    [["--mode", "plan", "--db-path", DB_PATH], "invalid_mode"],
    [["--mode", "assign", "--db-path", DB_PATH], "invalid_mode"],
    [["--mode", "reassign", "--db-path", DB_PATH], "invalid_mode"],
    [["--mode", "resolve-dry-run", "--db-path", DB_PATH], "invalid_mode"],
    [["--mode", "validate", "--mode", "validate", "--db-path", DB_PATH], "duplicate_argument"],
    [["--mode", "validate", "--account-id", "private-account", "--db-path", DB_PATH], "unknown_argument"],
    [["--mode", "validate", "--resource-request-id", "private-request", "--db-path", DB_PATH], "unknown_argument"],
    [["--mode", "validate", "--db-path", ""], "empty_argument"],
    [["--mode", "validate", "--db-path", "relative.sqlite"], "database_path_must_be_absolute"],
    [["--mode", "dry-run", "--db-path", DB_PATH, "--temp-root", "relative"], "temp_root_must_be_absolute"],
    [["--mode", "validate", "--db-path", DB_PATH, "trailing"], "unknown_argument"],
    [["--mode=validate", "--db-path", DB_PATH], "unknown_argument"]
  ];
  for (const [argv, reasonCode] of cases) {
    let accessCount = 0;
    const neverAccess = () => {
      accessCount += 1;
      throw new Error("operation must not run");
    };
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv,
      operations: {
        validateAccountResourceAuthorityCommerceSchema: neverAccess,
        dryRunAccountResourceAuthorityCommerceMigrations: neverAccess,
        applyAccountResourceAuthorityCommerceMigrations: neverAccess,
        rollbackAccountResourceAuthorityCommerceMigration: neverAccess
      }
    });
    assert.equal(outcome.exitCode, 2, JSON.stringify(argv));
    assert.equal(accessCount, 0, JSON.stringify(argv));
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
    assertClosedOutput(outcome.output);
  }
});

test("mutations require the exact sidecar identity and checksum before access", async () => {
  for (const mode of ["apply", "rollback"]) {
    const cases = [
      [
        ["--mode", mode, "--db-path", DB_PATH],
        mode === "apply"
          ? "apply_confirmation_required"
          : "rollback_confirmation_required"
      ],
      [
        [
          "--mode", mode,
          "--db-path", DB_PATH,
          "--confirm-migration-id", "private-wrong-id",
          "--confirm-ddl-checksum", DDL_CHECKSUM
        ],
        "migration_id_mismatch"
      ],
      [
        [
          "--mode", mode,
          "--db-path", DB_PATH,
          "--confirm-migration-id",
          REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
          "--confirm-ddl-checksum", "f".repeat(64)
        ],
        "migration_checksum_mismatch"
      ]
    ];
    for (const [argv, reasonCode] of cases) {
      let accessCount = 0;
      const neverAccess = () => {
        accessCount += 1;
        throw new Error("database access must not happen");
      };
      const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
        argv,
        operations: makeOperations({
          applyAccountResourceAuthorityCommerceMigrations: neverAccess,
          rollbackAccountResourceAuthorityCommerceMigration: neverAccess
        })
      });
      assert.equal(outcome.exitCode, 2);
      assert.equal(accessCount, 0);
      assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
      assertClosedOutput(outcome.output);
    }
  }
});

test("confirmation and temp-root flags are accepted only by compatible modes", async () => {
  const cases = [
    [
      [
        "--mode", "validate",
        "--db-path", DB_PATH,
        "--confirm-migration-id",
        REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
      ],
      "argument_not_allowed_for_mode"
    ],
    [
      [
        "--mode", "dry-run",
        "--db-path", DB_PATH,
        "--confirm-ddl-checksum", DDL_CHECKSUM
      ],
      "argument_not_allowed_for_mode"
    ],
    [
      ["--mode", "validate", "--db-path", DB_PATH, "--temp-root", TEMP_ROOT],
      "argument_not_allowed_for_mode"
    ],
    [
      [...exactMutationArguments("apply"), "--temp-root", TEMP_ROOT],
      "argument_not_allowed_for_mode"
    ],
    [
      [...exactMutationArguments("rollback"), "--temp-root", TEMP_ROOT],
      "argument_not_allowed_for_mode"
    ]
  ];
  for (const [argv, reasonCode] of cases) {
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv,
      operations: makeOperations()
    });
    assert.equal(outcome.exitCode, 2);
    assert.deepEqual(outcome.output.reasonCodes, [reasonCode]);
    assertClosedOutput(outcome.output);
  }
});

test("closed output preserves unknown counts and fail-closed booleans", async () => {
  const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => readyResult({
        ok: false,
        schemaState: "blocked",
        checks: checks({
          zeroBackfill: false,
          rollbackSafe: false,
        }),
        counts: counts({
          bindingRows: null,
          externalDependencies: 0
        }),
        reasonCodes: ["binding_row_count_unknown"]
      })
    })
  });
  assert.equal(outcome.exitCode, 4);
  assert.equal(outcome.output.counts.bindingRows, null);
  assert.equal(outcome.output.counts.externalDependencies, 0);
  assert.equal(outcome.output.checks.rollbackSafe, false);
  assertClosedOutput(outcome.output);
});

test("semantic coherence rejects contradictory Task 1 inspection results", async () => {
  const contradictions = [
    {
      name: "ready dependency contradiction",
      result: readyResult({
        checks: checks({ authorityDependency: false })
      })
    },
    {
      name: "ready owned-object contradiction",
      result: readyResult({ counts: counts({ ownedObjects: 3 }) })
    },
    {
      name: "ready ledger contradiction",
      result: readyResult({ counts: counts({ migrationRows: 0 }) })
    },
    {
      name: "ready foreign-key contradiction",
      result: readyResult({
        counts: counts({ foreignKeyViolations: 2 })
      })
    },
    {
      name: "ready zero-backfill contradiction",
      result: readyResult({
        checks: checks({ zeroBackfill: true, rollbackSafe: false }),
        counts: counts({ bindingRows: 2 })
      })
    },
    {
      name: "ready rollback-safety contradiction",
      result: readyResult({
        checks: checks({ rollbackSafe: true }),
        counts: counts({ externalDependencies: 2 })
      })
    },
    {
      name: "pending dependency contradiction",
      result: pendingResult({
        checks: checks({
          authorityDependency: false,
          schemaExact: false
        })
      })
    },
    {
      name: "pending binding-row contradiction",
      result: pendingResult({
        checks: checks({ schemaExact: false, zeroBackfill: false }),
        counts: counts({ bindingRows: 1, ownedObjects: 0 })
      })
    },
    {
      name: "blocked reason/check contradiction",
      result: readyResult({
        ok: false,
        schemaState: "blocked",
        reasonCodes: ["quick_check_failed"]
      })
    }
  ];

  for (const contradiction of contradictions) {
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv: ["--mode", "validate", "--db-path", DB_PATH],
      operations: makeOperations({
        validateAccountResourceAuthorityCommerceSchema: () =>
          contradiction.result
      })
    });
    assert.equal(outcome.exitCode, 4, contradiction.name);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"],
      contradiction.name
    );
    assertClosedOutput(outcome.output);
  }

  const legitimate = [
    {
      name: "populated ready schema",
      exitCode: 0,
      result: readyResult({
        checks: checks({ zeroBackfill: false, rollbackSafe: false }),
        counts: counts({
          bindingRows: 2,
          externalDependencies: 3,
          migrationRows: 27
        })
      })
    },
    {
      name: "pending schema with an external dependency",
      exitCode: 0,
      result: pendingResult({
        checks: checks({ schemaExact: false, rollbackSafe: false }),
        counts: counts({
          bindingRows: 0,
          externalDependencies: 2,
          ownedObjects: 0,
          migrationRows: 27
        })
      })
    },
    {
      name: "blocked missing schema with an integrity failure",
      exitCode: 3,
      result: pendingResult({
        schemaState: "blocked",
        checks: checks({
          schemaExact: false,
          quickCheck: false
        }),
        reasonCodes: ["quick_check_failed", "required_migration_missing"],
        pendingMigrationIds: []
      })
    }
  ];

  for (const example of legitimate) {
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv: ["--mode", "validate", "--db-path", DB_PATH],
      operations: makeOperations({
        validateAccountResourceAuthorityCommerceSchema: () => example.result
      })
    });
    assert.equal(outcome.exitCode, example.exitCode, example.name);
    assertClosedOutput(outcome.output);
  }
});

test("rejects accessors and proxies that can change between validation and output", async () => {
  const accessorChecks = checks();
  let accessorReads = 0;
  Object.defineProperty(accessorChecks, "authorityDependency", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return accessorReads === 1;
    }
  });

  let proxyReads = 0;
  const proxyResult = new Proxy(readyResult(), {
    get(target, property, receiver) {
      if (property === "checks") {
        proxyReads += 1;
        return checks({ authorityDependency: proxyReads === 1 });
      }
      return Reflect.get(target, property, receiver);
    }
  });

  for (const [name, result] of [
    ["nested accessor", readyResult({ checks: accessorChecks })],
    ["result proxy", proxyResult]
  ]) {
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv: ["--mode", "validate", "--db-path", DB_PATH],
      operations: makeOperations({
        validateAccountResourceAuthorityCommerceSchema: () => result
      })
    });
    assert.equal(outcome.exitCode, 4, name);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"],
      name
    );
    assertClosedOutput(outcome.output);
  }
});

test("mutation failures preserve an unknown source-change state as null", async () => {
  const failureCases = [
    {
      name: "unknown throw",
      operation: () => {
        throw new Error("private mutation outcome");
      },
      reasonCode: "unexpected_execution_failure"
    },
    {
      name: "database close failure",
      operation: () => {
        const error = new Error("private close outcome");
        error.code = "authority_commerce_database_close_failed";
        throw error;
      },
      reasonCode: "authority_commerce_database_close_failed"
    },
    {
      name: "migration apply failure",
      operation: () => {
        const error = new Error("private post-commit outcome");
        error.code = "authority_commerce_migration_apply_failed";
        throw error;
      },
      reasonCode: "authority_commerce_migration_apply_failed"
    },
    {
      name: "incoherent return",
      operation: () => ({ privateResult: true }),
      reasonCode: "unexpected_execution_failure"
    }
  ];

  for (const mode of ["apply", "rollback"]) {
    for (const failure of failureCases) {
      const operationName = mode === "apply"
        ? "applyAccountResourceAuthorityCommerceMigrations"
        : "rollbackAccountResourceAuthorityCommerceMigration";
      const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
        argv: exactMutationArguments(mode),
        operations: makeOperations({
          [operationName]: failure.operation
        })
      });
      assert.equal(outcome.exitCode, 4, `${mode}: ${failure.name}`);
      assert.equal(
        outcome.output.sourceChanged,
        null,
        `${mode}: ${failure.name}`
      );
      assert.deepEqual(
        outcome.output.reasonCodes,
        [failure.reasonCode],
        `${mode}: ${failure.name}`
      );
      assertClosedOutput(outcome.output);
    }
  }

  const validateFailure = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => {
        throw new Error("private validate outcome");
      }
    })
  });
  assert.equal(validateFailure.output.sourceChanged, false);

  const dryRunFailure = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "dry-run", "--db-path", DB_PATH],
    operations: makeOperations({
      dryRunAccountResourceAuthorityCommerceMigrations: () => {
        throw new Error("private dry-run outcome");
      }
    })
  });
  assert.equal(dryRunFailure.output.sourceChanged, false);

  const preAccessRejection = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "apply", "--db-path", DB_PATH],
    operations: makeOperations()
  });
  assert.equal(preAccessRejection.exitCode, 2);
  assert.equal(preAccessRejection.output.sourceChanged, false);
});

test("incomplete inspections null every count while readable blocks retain proven counts", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const missingPath = join(directory, "does-not-exist.sqlite");
    const missing = runCli([
      "--mode", "validate",
      "--db-path", missingPath
    ]);
    assert.equal(missing.status, 4);
    const missingOutput = parseProcessOutput(missing);
    assert.deepEqual(missingOutput.reasonCodes, ["database_missing"]);
    assert.deepEqual(missingOutput.counts, {
      bindingRows: null,
      externalDependencies: null,
      ownedObjects: null,
      migrationRows: null,
      foreignKeyViolations: null
    });
  });

  for (const reasonCode of [
    "database_missing",
    "database_unavailable",
    "database_invalid",
    "database_inspection_failed",
    "database_close_failed"
  ]) {
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv: ["--mode", "validate", "--db-path", DB_PATH],
      operations: makeOperations({
        validateAccountResourceAuthorityCommerceSchema: () => readyResult({
          ok: false,
          schemaState: "blocked",
          checks: checks({
            authorityDependency: false,
            commerceDependency: false,
            schemaExact: false,
            zeroBackfill: false,
            rollbackSafe: false,
            quickCheck: false,
            foreignKeys: false
          }),
          counts: counts({
            bindingRows: null,
            externalDependencies: null,
            ownedObjects: 0,
            migrationRows: 0,
            foreignKeyViolations: 0
          }),
          reasonCodes: [reasonCode]
        })
      })
    });
    assert.equal(outcome.exitCode, 4, reasonCode);
    assert.deepEqual(outcome.output.counts, {
      bindingRows: null,
      externalDependencies: null,
      ownedObjects: null,
      migrationRows: null,
      foreignKeyViolations: null
    }, reasonCode);
    assertClosedOutput(outcome.output);
  }

  const readableBlock = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => readyResult({
        ok: false,
        schemaState: "blocked",
        checks: checks({
          schemaExact: false,
          zeroBackfill: false,
          rollbackSafe: false,
          foreignKeys: false
        }),
        counts: counts({
          bindingRows: 2,
          externalDependencies: 3,
          ownedObjects: 4,
          migrationRows: 9,
          foreignKeyViolations: 1
        }),
        reasonCodes: [
          "foreign_key_check_failed",
          "owned_object_incompatible"
        ]
      })
    })
  });
  assert.equal(readableBlock.exitCode, 3);
  assert.deepEqual(readableBlock.output.counts, {
    bindingRows: 2,
    externalDependencies: 3,
    ownedObjects: 4,
    migrationRows: 9,
    foreignKeyViolations: 1
  });
});

test("integrity inspection exceptions are infrastructure failures without erasing proven counts", async () => {
  const inspectionException = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => readyResult({
        ok: false,
        schemaState: "blocked",
        checks: checks({
          zeroBackfill: false,
          rollbackSafe: false,
          quickCheck: false,
          foreignKeys: false
        }),
        counts: counts({
          bindingRows: 2,
          externalDependencies: 3,
          ownedObjects: 4,
          migrationRows: 9,
          foreignKeyViolations: 0
        }),
        reasonCodes: [
          "foreign_key_check_failed",
          "quick_check_failed"
        ]
      })
    })
  });
  assert.equal(inspectionException.exitCode, 4);
  assert.equal(inspectionException.output.checks.quickCheck, false);
  assert.equal(inspectionException.output.checks.foreignKeys, false);
  assert.deepEqual(inspectionException.output.reasonCodes, [
    "foreign_key_check_failed",
    "quick_check_failed"
  ]);
  assert.deepEqual(inspectionException.output.counts, {
    bindingRows: 2,
    externalDependencies: 3,
    ownedObjects: 4,
    migrationRows: 9,
    foreignKeyViolations: null
  });
  assertClosedOutput(inspectionException.output);

  const readableCases = [
    {
      name: "readable quick-check rejection",
      checks: checks({ quickCheck: false }),
      foreignKeyViolations: 0,
      reasonCodes: ["quick_check_failed"]
    },
    {
      name: "readable foreign-key violations",
      checks: checks({ foreignKeys: false }),
      foreignKeyViolations: 2,
      reasonCodes: ["foreign_key_check_failed"]
    },
    {
      name: "readable quick-check and foreign-key violations",
      checks: checks({ quickCheck: false, foreignKeys: false }),
      foreignKeyViolations: 2,
      reasonCodes: [
        "foreign_key_check_failed",
        "quick_check_failed"
      ]
    }
  ];
  for (const readable of readableCases) {
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv: ["--mode", "validate", "--db-path", DB_PATH],
      operations: makeOperations({
        validateAccountResourceAuthorityCommerceSchema: () => readyResult({
          ok: false,
          schemaState: "blocked",
          checks: readable.checks,
          counts: counts({
            foreignKeyViolations: readable.foreignKeyViolations
          }),
          reasonCodes: readable.reasonCodes
        })
      })
    });
    assert.equal(outcome.exitCode, 3, readable.name);
    assert.equal(
      outcome.output.counts.foreignKeyViolations,
      readable.foreignKeyViolations,
      readable.name
    );
    assertClosedOutput(outcome.output);
  }
});

test("mode-specific result coherence rejects incomplete contradictory and duplicate results", async () => {
  const migrationId =
    REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID;
  const missingCheck = {
    authorityDependency: true,
    commerceDependency: true,
    schemaExact: true,
    zeroBackfill: true,
    rollbackSafe: true,
    quickCheck: true
  };
  const missingCount = {
    bindingRows: 0,
    externalDependencies: 0,
    ownedObjects: 4,
    migrationRows: 4
  };
  const malformedCases = [
    {
      name: "validate result carries extra private data",
      mode: "validate",
      result: readyResult({
        dbPath: DB_PATH,
        sql: "create table private_account (id text)",
        arbitraryNested: { authorityRef: "private_authority" }
      })
    },
    {
      name: "validate checks carry extra private data",
      mode: "validate",
      result: readyResult({
        checks: {
          ...checks(),
          arbitraryNested: { sql: "select * from private_account" }
        }
      })
    },
    {
      name: "validate counts carry extra private data",
      mode: "validate",
      result: readyResult({
        counts: {
          ...counts(),
          rawRows: [{ account_id: "private-account" }]
        }
      })
    },
    {
      name: "validate missing check",
      mode: "validate",
      result: readyResult({ checks: missingCheck })
    },
    {
      name: "validate missing count",
      mode: "validate",
      result: readyResult({ counts: missingCount })
    },
    {
      name: "validate wrong check type",
      mode: "validate",
      result: readyResult({
        checks: checks({ rollbackSafe: "false" })
      })
    },
    {
      name: "validate wrong count type",
      mode: "validate",
      result: readyResult({ counts: counts({ bindingRows: "0" }) })
    },
    {
      name: "validate ready with pending migration",
      mode: "validate",
      result: readyResult({ pendingMigrationIds: [migrationId] })
    },
    {
      name: "validate result carries a mode",
      mode: "validate",
      result: readyResult({ mode: "validate" })
    },
    {
      name: "validate result carries sourceChanged",
      mode: "validate",
      result: readyResult({ sourceChanged: false })
    },
    {
      name: "validate result carries an action list",
      mode: "validate",
      result: readyResult({ appliedMigrationIds: [] })
    },
    {
      name: "dry-run missing mode",
      mode: "dry-run",
      result: readyResult({
        sourceChanged: false,
        appliedMigrationIds: []
      })
    },
    {
      name: "dry-run wrong mode",
      mode: "dry-run",
      result: readyResult({
        mode: "apply",
        sourceChanged: false,
        appliedMigrationIds: []
      })
    },
    {
      name: "dry-run reports source change",
      mode: "dry-run",
      result: readyResult({
        mode: "dry-run",
        sourceChanged: true,
        appliedMigrationIds: []
      })
    },
    {
      name: "dry-run pending and applied lists disagree",
      mode: "dry-run",
      result: readyResult({
        mode: "dry-run",
        sourceChanged: false,
        pendingMigrationIds: [migrationId],
        appliedMigrationIds: []
      })
    },
    {
      name: "dry-run repeats the migration identity",
      mode: "dry-run",
      result: readyResult({
        mode: "dry-run",
        sourceChanged: false,
        pendingMigrationIds: [migrationId, migrationId],
        appliedMigrationIds: [migrationId, migrationId]
      })
    },
    {
      name: "dry-run carries rollback actions",
      mode: "dry-run",
      result: readyResult({
        mode: "dry-run",
        sourceChanged: false,
        appliedMigrationIds: [],
        rolledBackMigrationIds: []
      })
    },
    {
      name: "apply missing mode",
      mode: "apply",
      result: readyResult({
        sourceChanged: false,
        appliedMigrationIds: []
      })
    },
    {
      name: "apply wrong mode",
      mode: "apply",
      result: readyResult({
        mode: "dry-run",
        sourceChanged: false,
        appliedMigrationIds: []
      })
    },
    {
      name: "apply action without source change",
      mode: "apply",
      result: readyResult({
        mode: "apply",
        sourceChanged: false,
        appliedMigrationIds: [migrationId]
      })
    },
    {
      name: "apply source change without action",
      mode: "apply",
      result: readyResult({
        mode: "apply",
        sourceChanged: true,
        appliedMigrationIds: []
      })
    },
    {
      name: "apply repeats the migration identity",
      mode: "apply",
      result: readyResult({
        mode: "apply",
        sourceChanged: true,
        appliedMigrationIds: [migrationId, migrationId]
      })
    },
    {
      name: "apply ready result carries pending migration",
      mode: "apply",
      result: readyResult({
        mode: "apply",
        sourceChanged: true,
        pendingMigrationIds: [migrationId],
        appliedMigrationIds: [migrationId]
      })
    },
    {
      name: "apply carries rollback actions",
      mode: "apply",
      result: readyResult({
        mode: "apply",
        sourceChanged: false,
        appliedMigrationIds: [],
        rolledBackMigrationIds: []
      })
    },
    {
      name: "rollback wrong mode",
      mode: "rollback",
      result: pendingResult({
        mode: "apply",
        sourceChanged: false,
        rolledBackMigrationIds: []
      })
    },
    {
      name: "rollback action without source change",
      mode: "rollback",
      result: pendingResult({
        mode: "rollback",
        sourceChanged: false,
        rolledBackMigrationIds: [migrationId]
      })
    },
    {
      name: "rollback source change without action",
      mode: "rollback",
      result: pendingResult({
        mode: "rollback",
        sourceChanged: true,
        rolledBackMigrationIds: []
      })
    },
    {
      name: "rollback repeats the migration identity",
      mode: "rollback",
      result: pendingResult({
        mode: "rollback",
        sourceChanged: true,
        rolledBackMigrationIds: [migrationId, migrationId]
      })
    },
    {
      name: "rollback returns ready state",
      mode: "rollback",
      result: readyResult({
        mode: "rollback",
        sourceChanged: false,
        rolledBackMigrationIds: []
      })
    },
    {
      name: "rollback carries apply actions",
      mode: "rollback",
      result: pendingResult({
        mode: "rollback",
        sourceChanged: false,
        appliedMigrationIds: [],
        rolledBackMigrationIds: []
      })
    }
  ];

  const operationNames = {
    validate: "validateAccountResourceAuthorityCommerceSchema",
    "dry-run": "dryRunAccountResourceAuthorityCommerceMigrations",
    apply: "applyAccountResourceAuthorityCommerceMigrations",
    rollback: "rollbackAccountResourceAuthorityCommerceMigration"
  };
  for (const malformed of malformedCases) {
    const argv = malformed.mode === "apply" || malformed.mode === "rollback"
      ? exactMutationArguments(malformed.mode)
      : ["--mode", malformed.mode, "--db-path", DB_PATH];
    const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
      argv,
      operations: makeOperations({
        [operationNames[malformed.mode]]: () => malformed.result
      })
    });
    assert.equal(outcome.exitCode, 4, malformed.name);
    assert.deepEqual(
      outcome.output.reasonCodes,
      ["unexpected_execution_failure"],
      malformed.name
    );
    assert.equal(
      outcome.output.sourceChanged,
      malformed.mode === "apply" || malformed.mode === "rollback"
        ? null
        : false,
      malformed.name
    );
    assertClosedOutput(outcome.output);
  }
});

test("exit codes are exactly 0 2 3 and 4 with safe error redaction", async () => {
  const success = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => pendingResult()
    })
  });
  assert.equal(success.exitCode, 0);
  assert.equal(success.output.ok, true);
  assert.equal(success.output.schemaState, "pending");

  const contract = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: [],
    operations: makeOperations()
  });
  assert.equal(contract.exitCode, 2);

  const readableBlock = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => readyResult({
        ok: false,
        schemaState: "blocked",
        checks: checks({ schemaExact: false }),
        reasonCodes: ["owned_object_incompatible"]
      })
    })
  });
  assert.equal(readableBlock.exitCode, 3);
  assert.deepEqual(readableBlock.output.reasonCodes, [
    "owned_object_incompatible"
  ]);

  const infrastructure = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => readyResult({
        ok: false,
        schemaState: "blocked",
        checks: checks({ schemaExact: false }),
        counts: counts({
          bindingRows: null,
          externalDependencies: null,
          ownedObjects: null,
          migrationRows: null,
          foreignKeyViolations: null
        }),
        reasonCodes: ["database_inspection_failed"]
      })
    })
  });
  assert.equal(infrastructure.exitCode, 4);

  const safeThrown = new Error("private-account raw SQL select secret");
  safeThrown.code = "authority_commerce_rollback_rows_present";
  const safeFailure = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: exactMutationArguments("rollback"),
    operations: makeOperations({
      rollbackAccountResourceAuthorityCommerceMigration: () => {
        throw safeThrown;
      }
    })
  });
  assert.equal(safeFailure.exitCode, 3);
  assert.deepEqual(safeFailure.output.reasonCodes, [
    "authority_commerce_rollback_rows_present"
  ]);

  const unknownThrown = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => {
        throw new Error("private-account raw SQL select secret");
      }
    })
  });
  assert.equal(unknownThrown.exitCode, 4);
  assert.deepEqual(unknownThrown.output.reasonCodes, [
    "unexpected_execution_failure"
  ]);

  const unknownReturned = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: ["--mode", "validate", "--db-path", DB_PATH],
    operations: makeOperations({
      validateAccountResourceAuthorityCommerceSchema: () => readyResult({
        ok: false,
        schemaState: "blocked",
        reasonCodes: ["private_raw_reason"]
      })
    })
  });
  assert.equal(unknownReturned.exitCode, 4);
  assert.deepEqual(unknownReturned.output.reasonCodes, [
    "unexpected_execution_failure"
  ]);
  for (const outcome of [
    success,
    contract,
    readableBlock,
    infrastructure,
    safeFailure,
    unknownThrown,
    unknownReturned
  ]) {
    assertClosedOutput(outcome.output);
  }
});

test("package alias is exact and the foundational schema alias is unchanged", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:account-resource-authority-commerce:schema"],
    "node scripts/platform-account-resource-authority-commerce-schema.mjs"
  );
  assert.equal(
    packageJson.scripts["platform:account-resource-authority:schema"],
    "node scripts/platform-account-resource-authority-schema.mjs"
  );
});

test("real CLI validates dry-runs applies replays and empty-rolls back without unsafe writes", async () => {
  await withTempDirectoryAsync(async (directory) => {
    const dbPath = join(directory, "private-authority-commerce.sqlite");
    const tempRoot = join(directory, "dry-run");
    createFoundation(dbPath);

    const pending = runCli(["--mode", "validate", "--db-path", dbPath]);
    assert.equal(pending.status, 0);
    const pendingOutput = parseProcessOutput(pending);
    assert.equal(pendingOutput.ok, true);
    assert.equal(pendingOutput.schemaState, "pending");
    assert.equal(pendingOutput.requiredMigrationPresent, false);
    assert.equal(pendingOutput.pendingMigrationCount, 1);

    const sourceBeforeDryRun = sha256File(dbPath);
    const dryRun = runCli([
      "--mode", "dry-run",
      "--db-path", dbPath,
      "--temp-root", tempRoot
    ]);
    assert.equal(dryRun.status, 0);
    const dryRunOutput = parseProcessOutput(dryRun);
    assert.equal(dryRunOutput.sourceChanged, false);
    assert.equal(sha256File(dbPath), sourceBeforeDryRun);
    assert.deepEqual(readdirSync(tempRoot), []);

    const applied = runCli(exactMutationArguments("apply", dbPath));
    assert.equal(applied.status, 0);
    const appliedOutput = parseProcessOutput(applied);
    assert.equal(appliedOutput.schemaState, "ready");
    assert.equal(appliedOutput.sourceChanged, true);
    assert.equal(appliedOutput.appliedMigrationCount, 1);
    assert.equal(appliedOutput.requiredMigrationPresent, true);

    const readyBytes = readFileSync(dbPath);
    const replayApply = runCli(exactMutationArguments("apply", dbPath));
    assert.equal(replayApply.status, 0);
    const replayApplyOutput = parseProcessOutput(replayApply);
    assert.equal(replayApplyOutput.sourceChanged, false);
    assert.equal(replayApplyOutput.appliedMigrationCount, 0);
    assert.deepEqual(readFileSync(dbPath), readyBytes);

    const rolledBack = runCli(exactMutationArguments("rollback", dbPath));
    assert.equal(rolledBack.status, 0);
    const rolledBackOutput = parseProcessOutput(rolledBack);
    assert.equal(rolledBackOutput.schemaState, "pending");
    assert.equal(rolledBackOutput.sourceChanged, true);
    assert.equal(rolledBackOutput.rolledBackMigrationCount, 1);
    assert.equal(rolledBackOutput.requiredMigrationPresent, false);

    const pendingBytes = readFileSync(dbPath);
    const replayRollback = runCli(exactMutationArguments("rollback", dbPath));
    assert.equal(replayRollback.status, 0);
    const replayRollbackOutput = parseProcessOutput(replayRollback);
    assert.equal(replayRollbackOutput.sourceChanged, false);
    assert.equal(replayRollbackOutput.rolledBackMigrationCount, 0);
    assert.deepEqual(readFileSync(dbPath), pendingBytes);
  });
});

test("real rollback rejects binding rows and external dependencies with zero mutation", () => {
  withTempDirectory((directory) => {
    const occupiedPath = join(directory, "private-occupied.sqlite");
    createFoundation(occupiedPath);
    const applyOccupied = runCli(exactMutationArguments("apply", occupiedPath));
    assert.equal(applyOccupied.status, 0);
    const occupied = new Database(occupiedPath);
    try {
      occupied.pragma("foreign_keys = ON");
      seedBinding(occupied, "occupied");
    } finally {
      occupied.close();
    }
    const occupiedBefore = readFileSync(occupiedPath);
    const blockedRows = runCli(exactMutationArguments("rollback", occupiedPath));
    assert.equal(blockedRows.status, 3);
    const blockedRowsOutput = parseProcessOutput(blockedRows);
    assert.deepEqual(blockedRowsOutput.reasonCodes, [
      "authority_commerce_rollback_rows_present"
    ]);
    assert.deepEqual(readFileSync(occupiedPath), occupiedBefore);

    const dependencyPath = join(directory, "private-dependency.sqlite");
    createFoundation(dependencyPath);
    const applyDependency = runCli(exactMutationArguments("apply", dependencyPath));
    assert.equal(applyDependency.status, 0);
    const dependency = new Database(dependencyPath);
    try {
      dependency.exec(`
        create table private_future_consumer (
          consumer_ref text primary key,
          quote_ref text not null references
            platform_commerce_authority_quote_bindings(quote_ref)
              on delete restrict
        )
      `);
    } finally {
      dependency.close();
    }
    const dependencyBefore = readFileSync(dependencyPath);
    const blockedDependency = runCli(
      exactMutationArguments("rollback", dependencyPath)
    );
    assert.equal(blockedDependency.status, 3);
    const blockedDependencyOutput = parseProcessOutput(blockedDependency);
    assert.deepEqual(blockedDependencyOutput.reasonCodes, [
      "authority_commerce_rollback_dependency_present"
    ]);
    assert.deepEqual(readFileSync(dependencyPath), dependencyBefore);
  });
});
