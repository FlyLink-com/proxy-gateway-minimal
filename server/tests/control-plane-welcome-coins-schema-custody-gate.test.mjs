import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import {
  COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID,
  applyCoinWalletMigrations
} from "../services/platform/coin-wallet-migrations.mjs";
import {
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
  applyPortalRegistrationWelcomeBonusMigrations,
  dryRunPortalRegistrationWelcomeBonusMigrations,
  validatePortalRegistrationWelcomeBonusSchema
} from "../services/platform/portal-registration-welcome-bonus-migrations.mjs";
import {
  applyWelcomeCoinsSchemaUnderCustody as applyWelcomeCoinsSchemaInProduction,
  inspectControlPlaneDatabaseBoundary,
  runWelcomeCoinsSchemaCustodyGateCli
} from "../../scripts/control-plane-welcome-coins-schema-custody-gate-lib.mjs";

const SERVICE_UNIT = "proxy-gateway-candidate.service";
const APPLIED_AT = "2026-08-30T12:00:00.000Z";
const MIGRATION_ID = REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID;
const DDL_CHECKSUM = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum;
const RUNTIME_CONDITION_START_GUARD_IDENTITY = "runtime-condition-v1:11:12:21:22";
const REPLACEMENT_RUNTIME_CONDITION_START_GUARD_IDENTITY =
  "runtime-condition-v1:31:32:41:42";
const SNAPSHOT_CONTRACT = new URL(
  "../../docs/CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md",
  import.meta.url
);
const DEPLOYMENT_RUNBOOK = new URL(
  "../../docs/GITHUB_DEPLOYMENT_RUNBOOK.md",
  import.meta.url
);
const WELCOME_COINS_CONTRACT = new URL(
  "../../docs/PORTAL_REGISTRATION_WELCOME_COINS.md",
  import.meta.url
);
const SNAPSHOT_GATE_SOURCE = new URL(
  "../../scripts/control-plane-db-snapshot-gate-lib.mjs",
  import.meta.url
);
const SCHEMA_CUSTODY_GATE_SOURCE = new URL(
  "../../scripts/control-plane-welcome-coins-schema-custody-gate-lib.mjs",
  import.meta.url
);
const SCHEMA_CUSTODY_GATE_COMPAT_PATH = fileURLToPath(new URL(
  "../../scripts/control-plane-welcome-coins-schema-custody-gate.mjs",
  import.meta.url
));
const SCHEMA_CUSTODY_GATE_CLI_SOURCE = new URL(
  "../../scripts/control-plane-welcome-coins-schema-custody-gate-cli.mjs",
  import.meta.url
);

function replaceExactModuleSpecifier(source, specifier, replacement) {
  const needle = JSON.stringify(specifier);
  assert.equal(source.split(needle).length - 1, 1, specifier);
  return source.replace(needle, JSON.stringify(replacement));
}

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function loadPrivateCustodyHarness() {
  let snapshotSource = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  snapshotSource = replaceExactModuleSpecifier(
    snapshotSource,
    "better-sqlite3",
    import.meta.resolve("better-sqlite3")
  );
  snapshotSource = replaceExactModuleSpecifier(
    snapshotSource,
    "../server/services/platform/portal-registration-welcome-bonus-migrations.mjs",
    new URL(
      "../services/platform/portal-registration-welcome-bonus-migrations.mjs",
      import.meta.url
    ).href
  );
  snapshotSource += `
export {
  applyWelcomeCoinsSchemaUnderCustodyCore as __applyForHarness,
  closeRetainedDirectory as __closeTempRootForHarness,
  closeSnapshotArtifactCustody as __closeArtifactForHarness,
  linuxDescriptorIdentityMap as __linuxDescriptorIdentitiesForHarness,
  linuxNewConnectionDescriptor as __linuxNewConnectionDescriptorForHarness,
  newMatchingDescriptorNumbers as __newMatchingDescriptorsForHarness
};
`;
  const snapshotHarness = await import(sourceDataUrl(snapshotSource));

  return {
    apply: (options) => snapshotHarness.__applyForHarness(options),
    closeArtifact: snapshotHarness.__closeArtifactForHarness,
    closeTempRoot: snapshotHarness.__closeTempRootForHarness,
    linuxDescriptorIdentities: snapshotHarness.__linuxDescriptorIdentitiesForHarness,
    linuxNewConnectionDescriptor: snapshotHarness.__linuxNewConnectionDescriptorForHarness,
    newMatchingDescriptors: snapshotHarness.__newMatchingDescriptorsForHarness
  };
}

const privateCustodyHarness = await loadPrivateCustodyHarness();
const applyWelcomeCoinsSchemaUnderCustody = privateCustodyHarness.apply;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-welcome-schema-custody-"));
  const dbPath = join(root, "state", "subscription-control.sqlite");
  const snapshotDirectory = join(root, "snapshots");
  const tempRoot = join(root, "dry-run");
  mkdirSync(join(root, "state"), { recursive: true });
  mkdirSync(snapshotDirectory, { mode: 0o700 });
  mkdirSync(tempRoot, { mode: 0o700 });
  chmodSync(snapshotDirectory, 0o700);
  chmodSync(tempRoot, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, dbPath, snapshotDirectory, tempRoot };
}

function createFoundationDatabase(dbPath) {
  const database = new Database(dbPath);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("wal_autocheckpoint = 0");
    database.exec(`
      create table platform_accounts (
        id text primary key,
        owner_ref text not null,
        status text not null,
        created_at text not null,
        updated_at text not null,
        metadata_json text not null default '{}'
      )
    `);
  } finally {
    database.close();
  }
  applyCoinWalletMigrations({
    dbPath,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(APPLIED_AT)
  });
}

function guardedState(identity = RUNTIME_CONDITION_START_GUARD_IDENTITY) {
  return {
    activeState: "inactive",
    unitFileState: "enabled",
    runtimeConditionStartGuard: true,
    runtimeConditionStartGuardIdentity: identity
  };
}

function options(state, overrides = {}) {
  return {
    dbPath: state.dbPath,
    snapshotDirectory: state.snapshotDirectory,
    tempRoot: state.tempRoot,
    serviceUnit: SERVICE_UNIT,
    expectedServiceState: "inactive",
    expectedMigrationId: MIGRATION_ID,
    expectedDdlChecksum: DDL_CHECKSUM,
    createdAt: APPLIED_AT,
    expectedDatabaseBoundary: overrides.expectedDatabaseBoundary ?? (
      existsSync(state.dbPath)
        ? inspectControlPlaneDatabaseBoundary({ dbPath: state.dbPath })
        : {
          objectIdentitySha256: "0".repeat(64),
          parentIdentitySha256: "0".repeat(64),
          logicalSha256: "0".repeat(64)
        }
    ),
    nowFn: () => new Date(APPLIED_AT),
    unitStateReader: () => guardedState(),
    expectedRuntimeConditionStartGuardIdentity:
      overrides.expectedRuntimeConditionStartGuardIdentity
      ?? RUNTIME_CONDITION_START_GUARD_IDENTITY,
    ...overrides,
    postCommitCustody: Object.hasOwn(overrides, "postCommitCustody")
      ? overrides.postCommitCustody
      : async () => {}
  };
}

function sqliteBusy(error) {
  return error?.code === "SQLITE_BUSY" || error?.code === "SQLITE_LOCKED";
}

function publishedSnapshotPath(state) {
  const matches = readdirSync(state.snapshotDirectory)
    .filter((name) => name.endsWith(".sqlite"));
  assert.equal(matches.length, 1);
  return join(state.snapshotDirectory, matches[0]);
}

function publishedManifestPath(state) {
  const matches = readdirSync(state.snapshotDirectory)
    .filter((name) => name.endsWith(".sqlite.json"));
  assert.equal(matches.length, 1);
  return join(state.snapshotDirectory, matches[0]);
}

test("retains exclusive custody through the post-commit held callback", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let outsider;
  let blockedReader = false;
  let blockedBeforeApply = false;
  let blockedAfterApply = false;
  let blockedPostCommitReader = false;
  let blockedPostCommitWriter = false;

  const result = await applyWelcomeCoinsSchemaUnderCustody(options(state, {
    async postCommitCustody(schemaResult) {
      assert.equal(schemaResult.state, "schema_ready");
      outsider = new Database(state.dbPath);
      outsider.pragma("busy_timeout = 0");
      try {
        outsider.prepare("select count(*) as count from platform_accounts").get();
      } catch (error) {
        blockedPostCommitReader = sqliteBusy(error);
      }
      try {
        outsider.exec("create table custody_escape_during_post_commit_hold (value text)");
      } catch (error) {
        blockedPostCommitWriter = sqliteBusy(error);
      }
      outsider.close();
      outsider = null;
    },
    operations: {
      applyPortalRegistrationWelcomeBonusMigrations(args) {
        outsider = new Database(state.dbPath);
        outsider.pragma("busy_timeout = 0");
        try {
          outsider.prepare("select count(*) as count from platform_accounts").get();
        } catch (error) {
          blockedReader = sqliteBusy(error);
        }
        try {
          outsider.exec("create table custody_escape_before_apply (value text)");
        } catch (error) {
          blockedBeforeApply = sqliteBusy(error);
        }
        const applied = applyPortalRegistrationWelcomeBonusMigrations(args);
        try {
          outsider.exec("create table custody_escape_after_apply (value text)");
        } catch (error) {
          blockedAfterApply = sqliteBusy(error);
        }
        outsider.close();
        outsider = null;
        return applied;
      },
      validatePortalRegistrationWelcomeBonusSchema
    }
  }));

  assert.equal(blockedReader, true);
  assert.equal(blockedBeforeApply, true);
  assert.equal(blockedAfterApply, true);
  assert.equal(blockedPostCommitReader, true);
  assert.equal(blockedPostCommitWriter, true);
  assert.equal(result.state, "schema_ready");
  assert.equal(result.databaseCustody, "exclusive");
  assert.equal(result.schema.sourceChanged, true);
  assert.deepEqual(result.schema.pendingMigrationIds, []);
  assert.equal(result.schema.checks.schemaExact, true);
  assert.equal(result.schema.checks.quickCheck, true);
  assert.equal(result.schema.checks.foreignKeys, true);
  assert.match(result.guardIdentitySha256, /^[a-f0-9]{64}$/);
  assert.equal(readdirSync(state.snapshotDirectory).filter((name) => name.endsWith(".sqlite")).length, 1);
  assert.equal(readdirSync(state.snapshotDirectory).filter((name) => name.endsWith(".sqlite.json")).length, 1);

  const released = new Database(state.dbPath);
  released.exec("create table custody_released_after_return (value text)");
  released.close();
});

test("an active reader blocks before snapshot publication or schema mutation", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const reader = new Database(state.dbPath);
  reader.exec("BEGIN");
  reader.prepare("select count(*) as count from platform_accounts").get();
  const writer = new Database(state.dbPath);
  writer.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('custody-reader-block', 'owner', 'active', ?, ?, '{}')
  `).run(APPLIED_AT, APPLIED_AT);
  writer.close();

  try {
    await assert.rejects(
      applyWelcomeCoinsSchemaUnderCustody(options(state)),
      (error) => new Set([
        "database_boundary_invalid",
        "database_custody_failed"
      ]).has(error?.condition)
    );
    assert.equal(readdirSync(state.snapshotDirectory).length, 0);
    assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
  } finally {
    reader.exec("ROLLBACK");
    reader.close();
  }
});

test("guard identity drift after snapshot blocks apply and retains only the verified snapshot", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let reads = 0;
  const unitStateReader = () => {
    reads += 1;
    return guardedState(reads < 6
      ? RUNTIME_CONDITION_START_GUARD_IDENTITY
      : REPLACEMENT_RUNTIME_CONDITION_START_GUARD_IDENTITY);
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "service_start_guard_changed"
  );

  assert.equal(readdirSync(state.snapshotDirectory).filter((name) => name.endsWith(".sqlite")).length, 1);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("guard drift after the nested migration rolls back schema before releasing custody", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let reads = 0;
  const unitStateReader = () => {
    reads += 1;
    return guardedState(reads <= 6
      ? RUNTIME_CONDITION_START_GUARD_IDENTITY
      : REPLACEMENT_RUNTIME_CONDITION_START_GUARD_IDENTITY);
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "service_start_guard_changed"
      && error?.mutationPossible === false
  );

  assert.equal(readdirSync(state.snapshotDirectory).filter((name) => name.endsWith(".sqlite")).length, 1);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("a ready schema publishes a fresh snapshot without replaying dry-run or apply", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  applyPortalRegistrationWelcomeBonusMigrations({
    dbPath: state.dbPath,
    expectedMigrationId: MIGRATION_ID,
    expectedDdlChecksum: DDL_CHECKSUM,
    nowFn: () => new Date(APPLIED_AT)
  });
  const calls = { validate: 0, dryRun: 0, apply: 0 };

  const result = await applyWelcomeCoinsSchemaUnderCustody(options(state, {
    operations: {
      validatePortalRegistrationWelcomeBonusSchema(args) {
        calls.validate += 1;
        return validatePortalRegistrationWelcomeBonusSchema(args);
      },
      dryRunPortalRegistrationWelcomeBonusMigrations() {
        calls.dryRun += 1;
      },
      applyPortalRegistrationWelcomeBonusMigrations() {
        calls.apply += 1;
      }
    }
  }));

  assert.deepEqual(calls, { validate: 1, dryRun: 0, apply: 0 });
  assert.equal(result.schema.sourceChanged, false);
  assert.deepEqual(result.schema.appliedMigrationIds, []);
});

test("migration failure rolls back live schema and preserves the verified pre-migration snapshot", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const failure = new Error("private migration detail");
  failure.code = "applied_schema_incompatible";

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          applyPortalRegistrationWelcomeBonusMigrations(args);
          throw failure;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "applied_schema_incompatible"
      && error?.mutationPossible === false
      && !String(error?.message).includes("private migration detail")
  );

  assert.equal(readdirSync(state.snapshotDirectory).filter((name) => name.endsWith(".sqlite")).length, 1);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("an operation that escapes the outer custody transaction is attention-required and non-retryable", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const escaped = new Error("private escaped transaction detail");
  escaped.code = "applied_schema_incompatible";

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations({ database }) {
          database.exec("COMMIT");
          throw escaped;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
});

test("a failed rollback is attention-required even when the original operation error looked retryable", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          const originalExec = args.database.exec.bind(args.database);
          applyPortalRegistrationWelcomeBonusMigrations(args);
          args.database.exec = (sql) => {
            if (sql === "ROLLBACK") throw new Error("private rollback failure");
            return originalExec(sql);
          };
          const failure = new Error("private operation failure");
          failure.code = "applied_schema_incompatible";
          throw failure;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
});

test("a failed connection close is attention-required after a confirmed rollback", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let faultedDatabase;

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          applyPortalRegistrationWelcomeBonusMigrations(args);
          faultedDatabase = args.database;
          const originalClose = args.database.close.bind(args.database);
          let closeCalls = 0;
          args.database.close = () => {
            closeCalls += 1;
            if (closeCalls === 1) throw new Error("private close failure");
            return originalClose();
          };
          const failure = new Error("private operation failure");
          failure.code = "applied_schema_incompatible";
          throw failure;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
  faultedDatabase.close();
});

test("a source sidecar created after exclusive close is preserved but requires attention", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const lateSidecar = `${state.dbPath}-shm`;

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          const originalClose = args.database.close.bind(args.database);
          args.database.close = () => {
            originalClose();
            rmSync(lateSidecar, { force: true });
            writeFileSync(lateSidecar, "external consumer sidecar\n");
          };
          return applyPortalRegistrationWelcomeBonusMigrations(args);
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );

  assert.equal(readFileSync(lateSidecar, "utf8"), "external consumer sidecar\n");
});

test("a same-inode DELETE-journal write during exclusive close blocks schema-ready", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          const result = applyPortalRegistrationWelcomeBonusMigrations(args);
          const originalClose = args.database.close.bind(args.database);
          args.database.close = () => {
            originalClose();
            const lateWriter = new Database(state.dbPath);
            lateWriter.pragma("journal_mode = DELETE");
            lateWriter.exec(`
              drop table platform_portal_registration_welcome_coin_grants;
              delete from platform_schema_migrations
              where migration_id = '${MIGRATION_ID}';
            `);
            lateWriter.close();
          };
          return result;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "blocked");
  assert.equal(existsSync(`${state.dbPath}-wal`), false);
  assert.equal(existsSync(`${state.dbPath}-shm`), false);
  assert.equal(existsSync(`${state.dbPath}-journal`), false);
});

test("a same-inode DELETE-journal write in the final guard readback blocks schema-ready", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let reads = 0;
  const unitStateReader = () => {
    reads += 1;
    if (reads === 11) {
      const lateWriter = new Database(state.dbPath);
      lateWriter.pragma("journal_mode = DELETE");
      lateWriter.exec(`
        drop table platform_portal_registration_welcome_coin_grants;
        delete from platform_schema_migrations
        where migration_id = '${MIGRATION_ID}';
      `);
      lateWriter.close();
    }
    return guardedState();
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );

  assert.equal(reads, 11);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "blocked");
  assert.equal(existsSync(`${state.dbPath}-journal`), false);
});

test("a final-guard rowid-only write changes the logical identity", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const seed = new Database(state.dbPath);
  seed.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('rowid-only-account', 'owner', 'active', ?, ?, '{}')
  `).run(APPLIED_AT, APPLIED_AT);
  seed.close();
  let reads = 0;
  const unitStateReader = () => {
    reads += 1;
    if (reads === 11) {
      const lateWriter = new Database(state.dbPath);
      lateWriter.pragma("journal_mode = DELETE");
      lateWriter.exec("update platform_accounts set rowid = rowid + 1000000");
      lateWriter.close();
    }
    return guardedState();
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );

  assert.equal(reads, 11);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("a final-guard schema-version-only write changes the logical identity", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let reads = 0;
  const unitStateReader = () => {
    reads += 1;
    if (reads === 11) {
      const lateWriter = new Database(state.dbPath);
      const schemaVersion = lateWriter.pragma("schema_version", { simple: true });
      lateWriter.unsafeMode(true);
      lateWriter.pragma(`schema_version = ${schemaVersion + 1}`);
      lateWriter.close();
    }
    return guardedState();
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );

  assert.equal(reads, 11);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("a final-guard journal-mode-only write changes the logical identity", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let reads = 0;
  const unitStateReader = () => {
    reads += 1;
    if (reads === 11) {
      const lateWriter = new Database(state.dbPath);
      const journalMode = lateWriter.pragma("journal_mode = DELETE", { simple: true });
      assert.equal(String(journalMode).toLowerCase(), "delete");
      lateWriter.close();
    }
    return guardedState();
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );

  assert.equal(reads, 11);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("a terminal close fault is reconciled before the exclusive connection loses ownership", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const originalClose = Database.prototype.close;
  let mutationConnection;
  let terminalCloseFailed = false;

  try {
    await assert.rejects(
      applyWelcomeCoinsSchemaUnderCustody(options(state, {
        operations: {
          applyPortalRegistrationWelcomeBonusMigrations(args) {
            const result = applyPortalRegistrationWelcomeBonusMigrations(args);
            mutationConnection = args.database;
            Database.prototype.close = function injectedTerminalCloseFault() {
              if (
                this !== mutationConnection
                && this.name === state.dbPath
                && !terminalCloseFailed
              ) {
                terminalCloseFailed = true;
                throw new Error("private terminal close fault");
              }
              return originalClose.call(this);
            };
            return result;
          },
          validatePortalRegistrationWelcomeBonusSchema
        }
      })),
      (error) => error?.condition === "database_custody_failed"
        && error?.mutationPossible === true
    );
  } finally {
    Database.prototype.close = originalClose;
  }

  assert.equal(terminalCloseFailed, true);
  const writer = new Database(state.dbPath);
  writer.pragma("busy_timeout = 0");
  assert.doesNotThrow(() => writer.exec("create table terminal_close_reconciled (value text)"));
  writer.close();
});

test("rejects a main database hard-link before snapshot or schema mutation", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const expectedDatabaseBoundary = inspectControlPlaneDatabaseBoundary({ dbPath: state.dbPath });
  linkSync(state.dbPath, join(state.root, "database-alias.sqlite"));

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { expectedDatabaseBoundary })),
    (error) => error?.condition === "database_boundary_invalid"
      && error?.mutationPossible === false
  );

  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("rejects a same-inode logical write made after the frozen holder observation", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const expectedDatabaseBoundary = inspectControlPlaneDatabaseBoundary({ dbPath: state.dbPath });
  const writer = new Database(state.dbPath);
  writer.prepare(`
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values ('post-observation-write', 'owner', 'active', ?, ?, '{}')
  `).run(APPLIED_AT, APPLIED_AT);
  writer.close();

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { expectedDatabaseBoundary })),
    (error) => error?.condition === "database_boundary_invalid"
      && error?.mutationPossible === false
  );

  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("rejects a pathname replacement after the frozen database observation", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const expectedDatabaseBoundary = inspectControlPlaneDatabaseBoundary({ dbPath: state.dbPath });
  renameSync(state.dbPath, join(state.root, "original.sqlite"));
  createFoundationDatabase(state.dbPath);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { expectedDatabaseBoundary })),
    (error) => error?.condition === "database_boundary_invalid"
      && error?.mutationPossible === false
  );

  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
});

test("snapshot drift before outer commit rolls the schema back", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        async dryRunPortalRegistrationWelcomeBonusMigrations(args) {
          const result = await dryRunPortalRegistrationWelcomeBonusMigrations(args);
          rmSync(publishedSnapshotPath(state), { force: true });
          return result;
        },
        applyPortalRegistrationWelcomeBonusMigrations,
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "snapshot_unavailable"
      && error?.mutationPossible === false
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("retained snapshot dry-run resists a public path swap and restore", {
  skip: process.platform !== "linux" ? "retained /proc descriptor access is Linux-only" : false
}, async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);

  const result = await applyWelcomeCoinsSchemaUnderCustody(options(state, {
    operations: {
      async dryRunPortalRegistrationWelcomeBonusMigrations(args) {
        const publicSnapshotPath = publishedSnapshotPath(state);
        const displacedSnapshotPath = `${publicSnapshotPath}.displaced`;
        assert.match(args.dbPath, /^\/proc\/self\/fd\/\d+$/);
        assert.notEqual(args.dbPath, publicSnapshotPath);
        renameSync(publicSnapshotPath, displacedSnapshotPath);
        writeFileSync(publicSnapshotPath, "not-a-sqlite-database");
        try {
          return await dryRunPortalRegistrationWelcomeBonusMigrations(args);
        } finally {
          rmSync(publicSnapshotPath, { force: true });
          renameSync(displacedSnapshotPath, publicSnapshotPath);
        }
      },
      applyPortalRegistrationWelcomeBonusMigrations,
      validatePortalRegistrationWelcomeBonusSchema
    }
  }));

  assert.equal(result.state, "schema_ready");
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("manifest byte drift before outer commit rolls the schema back", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        async dryRunPortalRegistrationWelcomeBonusMigrations(args) {
          const result = await dryRunPortalRegistrationWelcomeBonusMigrations(args);
          const manifestPath = publishedManifestPath(state);
          writeFileSync(manifestPath, `${readFileSync(manifestPath, "utf8").trim()}  \n`);
          return result;
        },
        applyPortalRegistrationWelcomeBonusMigrations,
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "manifest_boundary_invalid"
      && error?.mutationPossible === false
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("snapshot drift immediately after commit is attention-required", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let snapshotPath;

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        async dryRunPortalRegistrationWelcomeBonusMigrations(args) {
          snapshotPath = publishedSnapshotPath(state);
          return dryRunPortalRegistrationWelcomeBonusMigrations(args);
        },
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          const originalExec = args.database.exec.bind(args.database);
          args.database.exec = (sql) => {
            const result = originalExec(sql);
            if (sql === "COMMIT") rmSync(snapshotPath, { force: true });
            return result;
          };
          return applyPortalRegistrationWelcomeBonusMigrations(args);
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "snapshot_unavailable"
      && error?.mutationPossible === true
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("snapshot drift during final database close blocks the success receipt", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let snapshotPath;

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        async dryRunPortalRegistrationWelcomeBonusMigrations(args) {
          snapshotPath = publishedSnapshotPath(state);
          return dryRunPortalRegistrationWelcomeBonusMigrations(args);
        },
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          const result = applyPortalRegistrationWelcomeBonusMigrations(args);
          const originalClose = args.database.close.bind(args.database);
          args.database.close = () => {
            originalClose();
            rmSync(snapshotPath, { force: true });
          };
          return result;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "snapshot_unavailable"
      && error?.mutationPossible === true
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("temp-root identity drift after schema commit is reported as mutation-possible", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const displacedTempRoot = `${state.tempRoot}.displaced`;

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        dryRunPortalRegistrationWelcomeBonusMigrations,
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          const result = applyPortalRegistrationWelcomeBonusMigrations(args);
          const originalClose = args.database.close.bind(args.database);
          args.database.close = () => {
            originalClose();
            renameSync(state.tempRoot, displacedTempRoot);
            mkdirSync(state.tempRoot, { mode: 0o700 });
            chmodSync(state.tempRoot, 0o700);
          };
          return result;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "temp_root_invalid"
      && error?.mutationPossible === true
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "ready");
});

test("terminal artifact drift after schema commit never publishes a success receipt", async (t) => {
  const cases = [
    {
      name: "manifest bytes",
      condition: "manifest_boundary_invalid",
      mutate(state) {
        const manifestPath = publishedManifestPath(state);
        writeFileSync(manifestPath, `${readFileSync(manifestPath, "utf8").trim()}  \n`);
      }
    },
    {
      name: "extra directory entry",
      condition: "snapshot_directory_invalid",
      mutate(state) {
        writeFileSync(join(state.snapshotDirectory, "unexpected"), "unexpected");
      }
    },
    {
      name: "snapshot directory identity",
      condition: "snapshot_directory_invalid",
      alternateConditions: ["database_close_failed"],
      mutate(state) {
        renameSync(state.snapshotDirectory, `${state.snapshotDirectory}.displaced`);
        mkdirSync(state.snapshotDirectory, { mode: 0o700 });
        chmodSync(state.snapshotDirectory, 0o700);
      }
    }
  ];

  for (const current of cases) {
    await t.test(current.name, async (subtest) => {
      const state = fixture(subtest);
      createFoundationDatabase(state.dbPath);

      await assert.rejects(
        applyWelcomeCoinsSchemaUnderCustody(options(state, {
          operations: {
            dryRunPortalRegistrationWelcomeBonusMigrations,
            applyPortalRegistrationWelcomeBonusMigrations(args) {
              const result = applyPortalRegistrationWelcomeBonusMigrations(args);
              const originalClose = args.database.close.bind(args.database);
              args.database.close = () => {
                originalClose();
                current.mutate(state);
              };
              return result;
            },
            validatePortalRegistrationWelcomeBonusSchema
          }
        })),
        (error) => [current.condition, ...(current.alternateConditions ?? [])]
          .includes(error?.condition)
          && error?.mutationPossible === true
      );

      assert.equal(
        validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState,
        "ready"
      );
    });
  }
});

test("snapshot evidence loss takes precedence over a simultaneous operation failure", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  let snapshotPath;

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        async dryRunPortalRegistrationWelcomeBonusMigrations(args) {
          snapshotPath = publishedSnapshotPath(state);
          return dryRunPortalRegistrationWelcomeBonusMigrations(args);
        },
        applyPortalRegistrationWelcomeBonusMigrations(args) {
          applyPortalRegistrationWelcomeBonusMigrations(args);
          rmSync(snapshotPath, { force: true });
          const failure = new Error("private operation failure");
          failure.code = "migration_apply_failed";
          throw failure;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "snapshot_unavailable"
      && error?.mutationPossible === false
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("raw snapshot-directory evidence loss takes precedence over an operation failure", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      operations: {
        dryRunPortalRegistrationWelcomeBonusMigrations,
        applyPortalRegistrationWelcomeBonusMigrations() {
          rmSync(publishedSnapshotPath(state));
          rmSync(publishedManifestPath(state));
          rmdirSync(state.snapshotDirectory);
          const failure = new Error("private operation failure");
          failure.code = "migration_apply_failed";
          throw failure;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "snapshot_unavailable"
      && error?.mutationPossible === false
  );

  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("rejects the exact migration contract before database or snapshot access", async (t) => {
  const state = fixture(t);
  const calls = { guard: 0, apply: 0 };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      expectedDdlChecksum: "0".repeat(64),
      unitStateReader: () => {
        calls.guard += 1;
        return guardedState();
      },
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations() {
          calls.apply += 1;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "migration_checksum_mismatch"
  );

  assert.deepEqual(calls, { guard: 0, apply: 0 });
  assert.equal(existsSync(state.dbPath), false);
  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
});

test("production import requires an execution-envelope capability before every injected seam", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const calls = { guard: 0, apply: 0 };

  await assert.rejects(
    applyWelcomeCoinsSchemaInProduction(options(state, {
      unitStateReader: () => {
        calls.guard += 1;
        return guardedState();
      },
      operations: {
        applyPortalRegistrationWelcomeBonusMigrations() {
          calls.apply += 1;
        },
        validatePortalRegistrationWelcomeBonusSchema
      }
    })),
    (error) => error?.condition === "execution_envelope_required"
  );

  assert.deepEqual(calls, { guard: 0, apply: 0 });
  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assert.equal(validatePortalRegistrationWelcomeBonusSchema({ dbPath: state.dbPath }).schemaState, "pending");
});

test("production modules export no test-only or generic database mutation seam", async () => {
  const schemaModule = await import(SCHEMA_CUSTODY_GATE_SOURCE);
  const snapshotModule = await import(SNAPSHOT_GATE_SOURCE);
  const schemaSource = readFileSync(SCHEMA_CUSTODY_GATE_SOURCE, "utf8");
  const snapshotSource = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");

  assert.equal(Object.hasOwn(schemaModule, "applyWelcomeCoinsSchemaUnderCustodyForTest"), false);
  assert.equal(Object.hasOwn(snapshotModule, "withControlPlaneDatabaseExclusiveCustody"), false);
  assert.equal(Object.hasOwn(snapshotModule, "applyWelcomeCoinsSchemaUnderCustodyCore"), false);
  assert.doesNotMatch(schemaSource, /function applyWelcomeCoinsSchemaUnderCustodyCore/);
  assert.match(snapshotSource, /function applyWelcomeCoinsSchemaUnderCustodyCore/);
});

test("descriptor and directory custody are acquired and released without ownership gaps", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const createStart = source.indexOf("function createSnapshotArtifactUnderExclusiveCustody");
  const createEnd = source.indexOf("function snapshotIdentityMatches", createStart);
  const createSource = source.slice(createStart, createEnd);
  const snapshotOpen = createSource.indexOf("openSync(storageFinalSnapshotPath");
  const snapshotRegistered = createSource.indexOf("custodyDescriptors.push(snapshotDescriptor)");
  const manifestOpen = createSource.indexOf("openSync(storageManifestPath");
  const directoryOpen = createSource.indexOf("directoryDescriptor = openSync(");
  const databaseCopy = createSource.indexOf("copyDescriptorToExclusiveFile");
  const closeStart = source.indexOf("function closeSnapshotArtifactCustody");
  const closeEnd = source.indexOf("function checkpointIsComplete", closeStart);
  const closeSource = source.slice(closeStart, closeEnd);

  assert.ok(snapshotOpen >= 0);
  assert.ok(snapshotRegistered > snapshotOpen && snapshotRegistered < manifestOpen);
  assert.ok(directoryOpen >= 0 && directoryOpen < databaseCopy);
  assert.equal(closeSource.includes("splice(0)"), false);
  assert.match(source, /beforeConnectionDescriptors/);
  assert.match(source, /connectionDescriptor/);
  assert.match(source, /tempRootCustody = retainProtectedDirectory/);
  assert.match(source, /tempRoot: tempRootCustody\.accessPath/);
});

test("terminal logical readback is exclusive and is the last synchronous database action", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const terminalStart = source.indexOf("function assertTerminalDatabaseBoundary");
  const terminalEnd = source.indexOf("function linuxDescriptorIdentityMap", terminalStart);
  const terminalSource = source.slice(terminalStart, terminalEnd);
  const custodyStart = source.indexOf("async function withControlPlaneDatabaseExclusiveCustody");
  const custodyEnd = source.indexOf("function safeReport", custodyStart);
  const custodySource = source.slice(custodyStart, custodyEnd);
  const successReturn = custodySource.indexOf("return Object.freeze({");
  const successSource = custodySource.slice(0, successReturn);

  assert.ok(terminalSource.indexOf('database.exec("BEGIN EXCLUSIVE")') >= 0);
  assert.ok(
    terminalSource.indexOf('database.exec("BEGIN EXCLUSIVE")')
      < terminalSource.indexOf("databaseLogicalSha256(database)")
  );
  assert.ok(
    terminalSource.indexOf("databaseLogicalSha256(database)")
      < terminalSource.indexOf('database.exec("ROLLBACK")')
  );
  assert.ok(successSource.lastIndexOf("assertStartGuard();") >= 0);
  assert.ok(
    successSource.lastIndexOf("assertStartGuard();")
      < successSource.lastIndexOf("assertTerminalDatabaseBoundary({")
  );
  assert.ok(
    successSource.lastIndexOf("closeSnapshotArtifactCustody(artifact)")
      < successSource.lastIndexOf("assertTerminalDatabaseBoundary({")
  );
  assert.ok(
    successSource.lastIndexOf("closeBoundaryDescriptors()")
      < successSource.lastIndexOf("assertTerminalDatabaseBoundary({")
  );
});

test("schema dry-run receives the retained snapshot object instead of a re-resolved path", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const custodyStart = source.indexOf("async function withControlPlaneDatabaseExclusiveCustody");
  const custodyEnd = source.indexOf("function safeReport", custodyStart);
  const custodySource = source.slice(custodyStart, custodyEnd);

  assert.match(source, /function retainedSnapshotAccessPath\(artifact\)/);
  assert.match(custodySource, /snapshotPath: retainedSnapshotAccessPath\(artifact\)/);
  assert.doesNotMatch(custodySource, /snapshotPath: artifact\.snapshotPath/);
});

test("Linux descriptor baselines compare live object identity instead of fd number alone", () => {
  const source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");

  assert.match(source, /function linuxDescriptorIdentityMap\(\)/);
  assert.match(source, /beforeConnectionDescriptors\.get\(descriptor\) === identity/);
  assert.doesNotMatch(source, /function linuxDescriptorNumbers\(\)/);
});

test("same-number descriptor reuse is new when the bound object identity changes", () => {
  const beforeConnectionDescriptors = new Map([
    [7, "1:10"],
    [8, "1:20"]
  ]);
  const currentConnectionDescriptors = new Map([
    [7, "1:30"],
    [8, "1:20"],
    [9, "1:40"]
  ]);

  assert.deepEqual(privateCustodyHarness.newMatchingDescriptors({
    beforeConnectionDescriptors,
    currentConnectionDescriptors,
    expectedIdentity: "1:30"
  }), [7]);
});

test("Linux live-fd scan identifies a same-number replacement", {
  skip: process.platform !== "linux" ? "live /proc fd behavior is Linux-only" : false
}, (t) => {
  const state = fixture(t);
  const firstPath = join(state.root, "fd-first");
  const replacementPath = join(state.root, "fd-replacement");
  writeFileSync(firstPath, "first");
  writeFileSync(replacementPath, "replacement");
  const firstDescriptor = openSync(firstPath, "r");
  const beforeConnectionDescriptors = privateCustodyHarness.linuxDescriptorIdentities();
  closeSync(firstDescriptor);
  const replacementDescriptor = openSync(replacementPath, "r");
  try {
    assert.equal(replacementDescriptor, firstDescriptor);
    const metadata = fstatSync(replacementDescriptor, { bigint: true });
    const expectedIdentity = `${metadata.dev}:${metadata.ino}`;
    assert.equal(privateCustodyHarness.linuxNewConnectionDescriptor({
      beforeConnectionDescriptors,
      expectedIdentity
    }), replacementDescriptor);
  } finally {
    closeSync(replacementDescriptor);
  }
});

test("a failed artifact descriptor close remains tracked for cleanup reconciliation", () => {
  const unresolvedDescriptor = Object.freeze({ synthetic: true });
  const artifact = { custodyDescriptors: [unresolvedDescriptor] };

  assert.throws(
    () => privateCustodyHarness.closeArtifact(artifact),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
  assert.deepEqual(artifact.custodyDescriptors, [unresolvedDescriptor]);
});

test("partial artifact descriptor cleanup retains only unresolved ownership", (t) => {
  const state = fixture(t);
  const firstPath = join(state.root, "first");
  const lastPath = join(state.root, "last");
  writeFileSync(firstPath, "first");
  writeFileSync(lastPath, "last");
  const firstDescriptor = openSync(firstPath, "r");
  const unresolvedDescriptor = Object.freeze({ synthetic: true });
  const lastDescriptor = openSync(lastPath, "r");
  const artifact = {
    custodyDescriptors: [firstDescriptor, unresolvedDescriptor, lastDescriptor]
  };

  assert.throws(
    () => privateCustodyHarness.closeArtifact(artifact),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === true
  );
  assert.deepEqual(artifact.custodyDescriptors, [unresolvedDescriptor]);
  assert.throws(() => closeSync(firstDescriptor), (error) => error?.code === "EBADF");
  assert.throws(() => closeSync(lastDescriptor), (error) => error?.code === "EBADF");
});

test("a failed temp-root descriptor close remains owned by the custody object", () => {
  const unresolvedDescriptor = Object.freeze({ synthetic: true });
  const custody = { descriptor: unresolvedDescriptor };

  assert.throws(
    () => privateCustodyHarness.closeTempRoot(custody),
    (error) => error?.condition === "database_custody_failed"
      && error?.mutationPossible === false
  );
  assert.equal(custody.descriptor, unresolvedDescriptor);
});

test("rejects malformed paths and timestamps before start-guard readback", async (t) => {
  const state = fixture(t);
  const cases = [
    [{ dbPath: "relative.sqlite" }, "path_must_be_absolute"],
    [{ snapshotDirectory: "relative-snapshots" }, "path_must_be_absolute"],
    [{ tempRoot: "relative-dry-run" }, "path_must_be_absolute"],
    [{ createdAt: "not-a-time" }, "invalid_created_at"]
  ];

  for (const [overrides, condition] of cases) {
    let guardReads = 0;
    await assert.rejects(
      applyWelcomeCoinsSchemaUnderCustody(options(state, {
        ...overrides,
        unitStateReader: () => {
          guardReads += 1;
          return guardedState();
        }
      })),
      (error) => error?.condition === condition
    );
    assert.equal(guardReads, 0, condition);
  }
});

test("requires protected existing temp storage and a fresh empty snapshot directory before guard readback", async (t) => {
  const state = fixture(t);
  const missingTempRoot = join(state.root, "missing-dry-run");
  writeFileSync(join(state.snapshotDirectory, "stale-evidence"), "stale\n");
  let guardReads = 0;
  const unitStateReader = () => {
    guardReads += 1;
    return guardedState();
  };

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, {
      tempRoot: missingTempRoot,
      unitStateReader
    })),
    (error) => error?.condition === "temp_root_invalid"
  );
  assert.equal(guardReads, 0);

  await assert.rejects(
    applyWelcomeCoinsSchemaUnderCustody(options(state, { unitStateReader })),
    (error) => error?.condition === "snapshot_directory_invalid"
  );
  assert.equal(guardReads, 0);
});

test("custody implementation is import-only and its CLI launcher dispatches unconditionally", () => {
  const implementation = readFileSync(SCHEMA_CUSTODY_GATE_SOURCE, "utf8");
  const launcher = readFileSync(SCHEMA_CUSTODY_GATE_CLI_SOURCE, "utf8");

  assert.doesNotMatch(implementation, /isDirectInvocation|process\.argv\[1\]|process\.exitCode/);
  assert.doesNotMatch(launcher, /isDirectInvocation|process\.argv\[1\]|realpathSync|import\.meta\.main/);
  assert.match(launcher, /process\.exitCode = await runWelcomeCoinsSchemaCustodyGateCli\(\);/);
});

test("the historical custody entry emits a blocked receipt instead of silent success", () => {
  const result = spawnSync(process.execPath, [SCHEMA_CUSTODY_GATE_COMPAT_PATH], {
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "blocked",
    condition: "execution_envelope_required"
  });
});

test("standalone CLI requires the production execution envelope before invoking the mutation seam", async (t) => {
  const state = fixture(t);
  const protectedProbe = join(state.root, "private-probe.sqlite");
  const writes = { stdout: "", stderr: "" };
  let operationCalls = 0;
  const exitCode = await runWelcomeCoinsSchemaCustodyGateCli({
    argv: [
      "--db-path", protectedProbe,
      "--snapshot-dir", state.snapshotDirectory,
      "--temp-root", state.tempRoot,
      "--service-unit", SERVICE_UNIT,
      "--expected-service-state", "inactive",
      "--confirm-migration-id", MIGRATION_ID,
      "--confirm-ddl-checksum", DDL_CHECKSUM,
      "--created-at", APPLIED_AT,
      "--apply"
    ],
    stdout: { write: (value) => { writes.stdout += value; } },
    stderr: { write: (value) => { writes.stderr += value; } },
    operation: async () => {
      operationCalls += 1;
      throw new Error("private mutation seam reached");
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(operationCalls, 0);
  const output = `${writes.stdout}${writes.stderr}`;
  assert.equal(output.includes(protectedProbe), false);
  assert.equal(output.includes(state.snapshotDirectory), false);
  assert.equal(output.includes(state.tempRoot), false);
  assert.equal(output.includes("SQLITE"), false);
  assert.equal(output.includes("Error"), false);
  assert.deepEqual(JSON.parse(output), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "blocked",
    condition: "execution_envelope_required"
  });
});

test("a symlinked custody CLI entry still emits the blocked receipt", (t) => {
  const state = fixture(t);
  const sourcePath = fileURLToPath(SCHEMA_CUSTODY_GATE_CLI_SOURCE);
  const linkedScripts = join(state.root, "scripts-current");
  symlinkSync(
    dirname(sourcePath),
    linkedScripts,
    process.platform === "win32" ? "junction" : "dir"
  );
  const linkedCli = join(linkedScripts, basename(sourcePath));
  const result = spawnSync(process.execPath, [linkedCli], {
    cwd: state.root,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const lines = result.stderr.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "blocked",
    condition: "execution_envelope_required"
  });
});

test("a file-symlinked custody CLI entry still emits the blocked receipt", (t) => {
  const state = fixture(t);
  const sourcePath = fileURLToPath(SCHEMA_CUSTODY_GATE_CLI_SOURCE);
  const linkedCli = join(state.root, basename(sourcePath));
  symlinkSync(sourcePath, linkedCli, "file");
  const result = spawnSync(process.execPath, [linkedCli], {
    cwd: state.root,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  const lines = result.stderr.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    schemaVersion: "1",
    type: "control_plane_welcome_coins_schema_custody_gate",
    state: "blocked",
    condition: "execution_envelope_required"
  });
});

test("a missing importer argv path does not trigger the custody CLI", (t) => {
  const state = fixture(t);
  const importerPath = join(state.root, "importer.mjs");
  const missingArgvPath = join(state.root, "missing-entry.mjs");
  writeFileSync(importerPath, `
process.argv[1] = ${JSON.stringify(missingArgvPath)};
await import(${JSON.stringify(SCHEMA_CUSTODY_GATE_SOURCE.href)});
process.stdout.write("imported\\n");
`);
  const result = spawnSync(process.execPath, [importerPath], {
    cwd: state.root,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "imported\n");
  assert.equal(result.stderr, "");
});

test("an argv alias import does not trigger the custody CLI", (t) => {
  const state = fixture(t);
  const sourcePath = fileURLToPath(SCHEMA_CUSTODY_GATE_SOURCE);
  const importerPath = join(state.root, "importer.mjs");
  const aliasedArgvPath = join(state.root, basename(sourcePath));
  symlinkSync(sourcePath, aliasedArgvPath, "file");
  writeFileSync(importerPath, `
process.argv[1] = ${JSON.stringify(aliasedArgvPath)};
await import(${JSON.stringify(SCHEMA_CUSTODY_GATE_SOURCE.href)});
process.stdout.write("imported\\n");
`);
  const result = spawnSync(process.execPath, [importerPath], {
    cwd: state.root,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "imported\n");
  assert.equal(result.stderr, "");
});

test("published receipt excludes paths, SQL, rows, process identifiers, and raw guard identity", async (t) => {
  const state = fixture(t);
  createFoundationDatabase(state.dbPath);
  const result = await applyWelcomeCoinsSchemaUnderCustody(options(state));
  const serialized = JSON.stringify(result);

  for (const forbidden of [
    state.root,
    state.dbPath,
    state.snapshotDirectory,
    state.tempRoot,
    RUNTIME_CONDITION_START_GUARD_IDENTITY,
    "platform_accounts",
    "create table",
    "pid",
    "process"
  ]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.equal(result.snapshot.quickCheck, true);
  assert.equal(result.snapshot.foreignKeys, true);
  assert.equal(readFileSync(state.dbPath).length > 0, true);
});

test("runbooks require the retained-custody gate and prohibit standalone production apply", () => {
  const snapshotContract = readFileSync(SNAPSHOT_CONTRACT, "utf8");
  const deploymentRunbook = readFileSync(DEPLOYMENT_RUNBOOK, "utf8");
  const welcomeContract = readFileSync(WELCOME_COINS_CONTRACT, "utf8");

  for (const document of [snapshotContract, deploymentRunbook, welcomeContract]) {
    assert.match(document, /control-plane-welcome-coins-schema-custody-gate-lib\.mjs/);
    assert.match(document, /one SQLite connection|same SQLite connection|same retained SQLite connection/i);
    assert.match(document, /custody_gate_required/);
    assert.match(document, /execution_envelope_required/);
    assert.match(document, /one.?shot transaction\s+wrapper/i);
    assert.match(
      document,
      /Importing an implementation|import-only `\*-lib\.mjs` modules|`\*-lib\.mjs` imports have no CLI side effects|import-side-effect free/i
    );
  }
  assert.doesNotMatch(deploymentRunbook, /`welcome-coins:activation:apply`/);
  assert.doesNotMatch(deploymentRunbook, /run `deactivate --apply`/);
  assert.match(
    deploymentRunbook,
    /durably consumed[\s\S]*wrapper-owned private activation operation/i
  );
  assert.match(
    deploymentRunbook,
    /separately approved[\s\S]*private\s+bounded\s+deactivation\s+operation/i
  );
  assert.match(deploymentRunbook, /snapshot.*dry-run.*apply.*validate/is);
  assert.match(snapshotContract, /external.*holder.*zero|external.*holder.*0/is);
});
