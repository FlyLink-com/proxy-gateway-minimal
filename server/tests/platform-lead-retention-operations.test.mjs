import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import {
  buildLeadRetentionCommandResult,
  calculateLeadBackupRetention,
  createLeadBackupManifest,
  runLeadBackup,
  runLeadPurge,
  runLeadPrune,
  serializeLeadRetentionCommandResult,
  validateLeadBackupManifest
} from "../services/platform/lead-retention-operations.mjs";

const CREATED_AT = "2026-07-16T00:00:00.000Z";
const EMPTY_PRIVACY_CUTOFF = "2026-10-14T00:00:00.000Z";
const EMPTY_PRUNE_AT = "2026-10-13T22:00:00.000Z";
const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RETENTION_CLI = fileURLToPath(
  new URL("../../scripts/platform-lead-retention.mjs", import.meta.url)
);

function manifestInput(overrides = {}) {
  return {
    file: "control-20260716T000000Z-aabbccdd.sqlite",
    createdAt: CREATED_AT,
    privacyCutoff: EMPTY_PRIVACY_CUTOFF,
    pruneAt: EMPTY_PRUNE_AT,
    retentionBasis: "created_at_plus_90d",
    size: 4096,
    sha256: "a".repeat(64),
    quickCheck: "ok",
    leadTablePresent: false,
    leadRowCount: 0,
    ...overrides
  };
}

function withTempDir(prefix, callback) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

async function withTempDirAsync(prefix, callback) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return await callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function createBackupFixture(dbPath, { leadExpiresAt = [] } = {}) {
  const database = new Database(dbPath);
  database.exec(`
    create table retention_sentinel (
      id text primary key,
      value text not null
    );
    insert into retention_sentinel (id, value) values ('sentinel_1', 'preserve-me');
    create table platform_leads (
      id text primary key,
      status text not null check (status in ('new', 'reviewing', 'converted', 'rejected')),
      organization text not null,
      email text not null,
      direction text not null,
      stage text not null default '',
      message text not null,
      source text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text not null
    );
  `);
  const insert = database.prepare(`
    insert into platform_leads (
      id, status, organization, email, direction, stage, message, source,
      created_at, updated_at, expires_at
    ) values (
      @id, 'new', 'Private Organization', @email, 'Private Direction', 'review',
      @message, 'company-site', @createdAt, @createdAt, @expiresAt
    )
  `);
  leadExpiresAt.forEach((expiresAt, index) => insert.run({
    id: `lead_private_${index + 1}`,
    email: `private-${index + 1}@example.test`,
    message: `private message ${index + 1}`,
    createdAt: CREATED_AT,
    expiresAt
  }));
  database.close();
}

function readBackupPair(backupDir) {
  const names = readdirSync(backupDir).sort();
  const manifestName = names.find((name) => name.endsWith(".manifest.json"));
  assert.ok(manifestName, "manifest should exist");
  const manifest = JSON.parse(readFileSync(join(backupDir, manifestName), "utf8"));
  return {
    names,
    manifest,
    manifestPath: join(backupDir, manifestName),
    backupPath: join(backupDir, manifest.file)
  };
}

function runRetentionCli(args, { env = {} } = {}) {
  return spawnSync(process.execPath, [RETENTION_CLI, ...args], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      SUBSCRIPTION_CONTROL_DB_PATH: "",
      ...env
    },
    encoding: "utf8"
  });
}

function createPurgeFixture(dbPath) {
  const database = new Database(dbPath);
  database.exec(`
    create table platform_leads (
      id text primary key,
      status text not null check (status in ('new', 'reviewing', 'converted', 'rejected')),
      organization text not null,
      email text not null,
      direction text not null,
      stage text not null default '',
      message text not null,
      source text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text not null
    );
    create table retention_sentinel (
      id text primary key,
      value text not null
    );
    insert into retention_sentinel (id, value) values ('sentinel_1', 'preserve-me');
  `);
  const insert = database.prepare(`
    insert into platform_leads (
      id, status, organization, email, direction, stage, message, source,
      created_at, updated_at, expires_at
    ) values (
      @id, 'new', 'Synthetic Research', @email, 'API Sandbox', 'review',
      @message, 'company-site', @createdAt, @createdAt, @expiresAt
    )
  `);
  insert.run({
    id: "lead_due",
    email: "private-due@example.test",
    message: "private due message",
    createdAt: CREATED_AT,
    expiresAt: "2026-07-20T00:00:00.000Z"
  });
  insert.run({
    id: "lead_future",
    email: "private-future@example.test",
    message: "private future message",
    createdAt: CREATED_AT,
    expiresAt: "2026-07-21T00:00:00.000Z"
  });
  database.close();
}

test("backup retention uses exactly 90 days and the two-hour safety window without Leads", () => {
  assert.deepEqual(calculateLeadBackupRetention({
    createdAt: CREATED_AT,
    leadExpiresAt: []
  }), {
    createdAt: CREATED_AT,
    privacyCutoff: EMPTY_PRIVACY_CUTOFF,
    pruneAt: EMPTY_PRUNE_AT,
    retentionBasis: "created_at_plus_90d"
  });
});

test("backup retention selects the earliest contained Lead expiry", () => {
  assert.deepEqual(calculateLeadBackupRetention({
    createdAt: CREATED_AT,
    leadExpiresAt: [
      "2026-08-01T00:00:00.000Z",
      "2026-07-20T00:00:00.000Z"
    ]
  }), {
    createdAt: CREATED_AT,
    privacyCutoff: "2026-07-20T00:00:00.000Z",
    pruneAt: "2026-07-19T22:00:00.000Z",
    retentionBasis: "earliest_lead_expiry"
  });
});

test("backup retention rejects invalid time and a Lead inside the safety window", () => {
  assert.throws(
    () => calculateLeadBackupRetention({
      createdAt: "not-a-time",
      leadExpiresAt: []
    }),
    (error) => error?.reasonCode === "invalid_timestamp"
  );
  assert.throws(
    () => calculateLeadBackupRetention({
      createdAt: CREATED_AT,
      leadExpiresAt: ["2026-07-16T01:59:59.999Z"]
    }),
    (error) => error?.reasonCode === "backup_safety_window_unavailable"
  );
});

test("backup manifest is closed, canonical, and digest-bound", () => {
  const manifest = createLeadBackupManifest(manifestInput());
  assert.deepEqual(validateLeadBackupManifest(manifest), manifest);
  assert.equal(
    manifest.manifestDigest,
    "69ed052e5f787443b0d49bb76480ca519a02955dc2c00f6e293e8ab49f6f0c4c"
  );
  assert.equal(Object.keys(manifest).join(","), [
    "schemaVersion",
    "artifactKind",
    "file",
    "createdAt",
    "privacyCutoff",
    "pruneAt",
    "retentionBasis",
    "size",
    "sha256",
    "quickCheck",
    "leadTablePresent",
    "leadRowCount",
    "manifestDigest"
  ].join(","));

  assert.throws(
    () => validateLeadBackupManifest({ ...manifest, extra: true }),
    (error) => error?.reasonCode === "invalid_manifest"
  );
  assert.throws(
    () => createLeadBackupManifest(manifestInput({ file: "../escape.sqlite" })),
    (error) => error?.reasonCode === "invalid_backup_basename"
  );
  assert.throws(
    () => validateLeadBackupManifest({ ...manifest, size: manifest.size + 1 }),
    (error) => error?.reasonCode === "manifest_digest_mismatch"
  );
});

test("command result allows only closed aggregate evidence and sorted reason codes", () => {
  const result = buildLeadRetentionCommandResult({
    command: "prune",
    mode: "dry-run",
    status: "blocked",
    mutationState: "none",
    counts: {
      candidatePairCount: 2,
      blockedEntryCount: 1
    },
    reasonCodes: ["unsafe_entry", "manifest_digest_mismatch", "unsafe_entry"]
  });

  assert.deepEqual(result, {
    schemaVersion: "1",
    command: "prune",
    mode: "dry-run",
    status: "blocked",
    mutationState: "none",
    counts: {
      blockedEntryCount: 1,
      candidatePairCount: 2
    },
    reasonCodes: ["manifest_digest_mismatch", "unsafe_entry"]
  });
  assert.equal(serializeLeadRetentionCommandResult(result), `${JSON.stringify(result)}\n`);

  assert.throws(
    () => buildLeadRetentionCommandResult({
      command: "purge",
      mode: "dry-run",
      status: "planned",
      mutationState: "none",
      counts: { email: 1 },
      reasonCodes: []
    }),
    (error) => error?.reasonCode === "invalid_command_result"
  );
  assert.throws(
    () => buildLeadRetentionCommandResult({
      command: "purge",
      mode: "dry-run",
      status: "planned",
      mutationState: "none",
      counts: { eligibleLeadCount: -1 },
      reasonCodes: []
    }),
    (error) => error?.reasonCode === "invalid_command_result"
  );
});

test("purge dry-run reports eligibility without deleting rows or initializing schema", () => {
  withTempDir("platform-lead-purge-dry-", (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    createPurgeFixture(dbPath);

    const result = runLeadPurge({
      dbPath,
      apply: false,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.deepEqual(result, {
      schemaVersion: "1",
      command: "purge",
      mode: "dry-run",
      status: "planned",
      mutationState: "none",
      counts: {
        deletedLeadCount: 0,
        eligibleLeadCount: 1
      },
      reasonCodes: []
    });

    const database = new Database(dbPath, { readonly: true });
    assert.equal(database.prepare("select count(*) as count from platform_leads").get().count, 2);
    assert.deepEqual(database.prepare("select * from retention_sentinel").all(), [
      { id: "sentinel_1", value: "preserve-me" }
    ]);
    database.close();

    const serialized = serializeLeadRetentionCommandResult(result);
    assert.doesNotMatch(serialized, /private-control|private-due|private-future|private due|private future|example\.test/i);
  });
});

test("purge apply deletes only Leads at the exact expiry boundary", () => {
  withTempDir("platform-lead-purge-apply-", (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createPurgeFixture(dbPath);

    const before = runLeadPurge({
      dbPath,
      apply: true,
      nowFn: () => new Date("2026-07-19T23:59:59.999Z")
    });
    assert.equal(before.counts.deletedLeadCount, 0);

    const atBoundary = runLeadPurge({
      dbPath,
      apply: true,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.deepEqual(atBoundary.counts, {
      deletedLeadCount: 1,
      eligibleLeadCount: 1
    });
    assert.equal(atBoundary.status, "completed");
    assert.equal(atBoundary.mutationState, "completed");

    const database = new Database(dbPath, { readonly: true });
    assert.deepEqual(
      database.prepare("select id from platform_leads order by id").all(),
      [{ id: "lead_future" }]
    );
    assert.deepEqual(database.prepare("select * from retention_sentinel").all(), [
      { id: "sentinel_1", value: "preserve-me" }
    ]);
    database.close();
  });
});

test("purge treats an absent Lead table as a no-op and never creates it", () => {
  withTempDir("platform-lead-purge-absent-", (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const database = new Database(dbPath);
    database.exec("create table sentinel (id text primary key)");
    database.close();

    const result = runLeadPurge({
      dbPath,
      apply: true,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.deepEqual(result.counts, {
      deletedLeadCount: 0,
      eligibleLeadCount: 0
    });
    assert.deepEqual(result.reasonCodes, []);

    const readback = new Database(dbPath, { readonly: true });
    assert.equal(
      readback.prepare("select count(*) as count from sqlite_master where name = 'platform_leads'").get().count,
      0
    );
    readback.close();
  });
});

test("purge blocks missing, invalid, and incompatible databases without leaking details", () => {
  withTempDir("platform-lead-purge-blocked-", (directory) => {
    const missingPath = join(directory, "missing-private.sqlite");
    const missing = runLeadPurge({
      dbPath: missingPath,
      apply: false,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.equal(missing.status, "blocked");
    assert.deepEqual(missing.reasonCodes, ["database_missing"]);

    const invalidPath = join(directory, "invalid-private.sqlite");
    writeFileSync(invalidPath, "not a sqlite database", "utf8");
    const invalid = runLeadPurge({
      dbPath: invalidPath,
      apply: false,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.equal(invalid.status, "blocked");
    assert.deepEqual(invalid.reasonCodes, ["database_invalid"]);

    const incompatiblePath = join(directory, "incompatible-private.sqlite");
    const database = new Database(incompatiblePath);
    database.exec("create table platform_leads (id text primary key, expires_at text not null)");
    database.close();
    const incompatible = runLeadPurge({
      dbPath: incompatiblePath,
      apply: true,
      nowFn: () => new Date("2026-07-20T00:00:00.000Z")
    });
    assert.equal(incompatible.status, "blocked");
    assert.deepEqual(incompatible.reasonCodes, ["lead_schema_incompatible"]);

    const serialized = JSON.stringify([missing, invalid, incompatible]);
    assert.doesNotMatch(serialized, /missing-private|invalid-private|incompatible-private|not a sqlite/i);
  });
});

test("purge blocks a busy database without deleting eligible Leads", () => {
  withTempDir("platform-lead-purge-busy-", (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createPurgeFixture(dbPath);
    const lock = new Database(dbPath);
    lock.exec("begin exclusive");
    try {
      const result = runLeadPurge({
        dbPath,
        apply: true,
        nowFn: () => new Date("2026-07-20T00:00:00.000Z")
      });
      assert.equal(result.status, "blocked");
      assert.deepEqual(result.reasonCodes, ["database_busy"]);
    } finally {
      lock.exec("rollback");
      lock.close();
    }

    const database = new Database(dbPath, { readonly: true });
    assert.equal(database.prepare("select count(*) as count from platform_leads").get().count, 2);
    database.close();
  });
});

test("backup dry-run validates eligibility without creating filesystem entries", async () => {
  await withTempDirAsync("platform-lead-backup-dry-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath);
    mkdirSync(backupDir, { mode: 0o700 });

    const result = await runLeadBackup({
      dbPath,
      backupDir,
      apply: false,
      nowFn: () => new Date(CREATED_AT),
      randomBytesFn: () => Buffer.from("0011223344556677", "hex")
    });
    assert.deepEqual(result, {
      schemaVersion: "1",
      command: "backup",
      mode: "dry-run",
      status: "planned",
      mutationState: "none",
      counts: {
        backupEligibleCount: 1,
        createdBackupCount: 0,
        leadRowCount: 0
      },
      reasonCodes: []
    });
    assert.deepEqual(readdirSync(backupDir), []);
  });
});

test("backup apply publishes a complete verified SQLite pair without leaking its name", async () => {
  await withTempDirAsync("platform-lead-backup-apply-", async (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath);
    mkdirSync(backupDir, { mode: 0o700 });

    const result = await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date(CREATED_AT),
      randomBytesFn: () => Buffer.from("0011223344556677", "hex")
    });
    assert.deepEqual(result.counts, {
      backupEligibleCount: 1,
      createdBackupCount: 1,
      leadRowCount: 0
    });
    assert.equal(result.status, "completed");
    assert.doesNotMatch(JSON.stringify(result), /private-control|control-2026|lead-aware-backups/i);

    const pair = readBackupPair(backupDir);
    assert.equal(pair.names.length, 2);
    assert.deepEqual(validateLeadBackupManifest(pair.manifest), pair.manifest);
    assert.equal(pair.manifest.createdAt, CREATED_AT);
    assert.equal(pair.manifest.privacyCutoff, EMPTY_PRIVACY_CUTOFF);
    assert.equal(pair.manifest.pruneAt, EMPTY_PRUNE_AT);
    assert.equal(pair.manifest.retentionBasis, "created_at_plus_90d");
    assert.equal(pair.manifest.leadRowCount, 0);
    assert.equal(pair.manifest.size, statSync(pair.backupPath).size);
    assert.equal(
      pair.manifest.sha256,
      createHash("sha256").update(readFileSync(pair.backupPath)).digest("hex")
    );
    assert.equal(lstatSync(pair.backupPath).isSymbolicLink(), false);
    assert.equal(lstatSync(pair.manifestPath).isSymbolicLink(), false);
    if (process.platform !== "win32") {
      assert.equal(statSync(pair.backupPath).mode & 0o777, 0o600);
      assert.equal(statSync(pair.manifestPath).mode & 0o777, 0o600);
    }

    const snapshot = new Database(pair.backupPath, { readonly: true });
    assert.deepEqual(snapshot.pragma("quick_check"), [{ quick_check: "ok" }]);
    assert.deepEqual(snapshot.prepare("select * from retention_sentinel").all(), [
      { id: "sentinel_1", value: "preserve-me" }
    ]);
    snapshot.close();
  });
});

test("backup binds retention to the earliest Lead expiry in the snapshot", async () => {
  await withTempDirAsync("platform-lead-backup-expiry-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath, {
      leadExpiresAt: [
        "2026-08-01T00:00:00.000Z",
        "2026-07-20T00:00:00.000Z"
      ]
    });
    mkdirSync(backupDir, { mode: 0o700 });

    const result = await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date(CREATED_AT),
      randomBytesFn: () => Buffer.from("8899aabbccddeeff", "hex")
    });
    assert.equal(result.counts.leadRowCount, 2);
    const { manifest } = readBackupPair(backupDir);
    assert.equal(manifest.privacyCutoff, "2026-07-20T00:00:00.000Z");
    assert.equal(manifest.pruneAt, "2026-07-19T22:00:00.000Z");
    assert.equal(manifest.retentionBasis, "earliest_lead_expiry");
    assert.equal(manifest.leadTablePresent, true);
    assert.equal(manifest.leadRowCount, 2);
    assert.doesNotMatch(JSON.stringify(manifest), /private organization|private direction|private message|example\.test|lead_private/i);
  });
});

test("backup refuses expired Leads, unavailable safety margin, and collisions", async () => {
  await withTempDirAsync("platform-lead-backup-blocked-", async (directory) => {
    const expiredPath = join(directory, "expired.sqlite");
    const safetyPath = join(directory, "safety.sqlite");
    const validPath = join(directory, "valid.sqlite");
    const expiredDir = join(directory, "expired-backups");
    const safetyDir = join(directory, "safety-backups");
    const validDir = join(directory, "valid-backups");
    createBackupFixture(expiredPath, {
      leadExpiresAt: ["2026-07-16T00:00:00.000Z"]
    });
    createBackupFixture(safetyPath, {
      leadExpiresAt: ["2026-07-16T01:59:59.999Z"]
    });
    createBackupFixture(validPath);
    [expiredDir, safetyDir, validDir].forEach((path) => mkdirSync(path, { mode: 0o700 }));

    const expired = await runLeadBackup({
      dbPath: expiredPath,
      backupDir: expiredDir,
      apply: true,
      nowFn: () => new Date(CREATED_AT)
    });
    assert.equal(expired.status, "blocked");
    assert.deepEqual(expired.reasonCodes, ["expired_lead_present"]);
    assert.deepEqual(readdirSync(expiredDir), []);

    const safety = await runLeadBackup({
      dbPath: safetyPath,
      backupDir: safetyDir,
      apply: true,
      nowFn: () => new Date(CREATED_AT)
    });
    assert.equal(safety.status, "blocked");
    assert.deepEqual(safety.reasonCodes, ["backup_safety_window_unavailable"]);
    assert.deepEqual(readdirSync(safetyDir), []);

    const options = {
      dbPath: validPath,
      backupDir: validDir,
      apply: true,
      nowFn: () => new Date(CREATED_AT),
      randomBytesFn: () => Buffer.from("0011223344556677", "hex")
    };
    assert.equal((await runLeadBackup(options)).status, "completed");
    const before = readdirSync(validDir).sort();
    const collision = await runLeadBackup(options);
    assert.equal(collision.status, "blocked");
    assert.deepEqual(collision.reasonCodes, ["backup_collision"]);
    assert.deepEqual(readdirSync(validDir).sort(), before);
  });
});

test("prune dry-run plans due pairs and apply deletes only due verified pairs", async () => {
  await withTempDirAsync("platform-lead-prune-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath);
    mkdirSync(backupDir, { mode: 0o700 });
    await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytesFn: () => Buffer.from("0011223344556677", "hex")
    });
    await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-07-01T00:00:00.000Z"),
      randomBytesFn: () => Buffer.from("8899aabbccddeeff", "hex")
    });
    const before = readdirSync(backupDir).sort();

    const dryRun = runLeadPrune({
      backupDir,
      apply: false,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z")
    });
    assert.deepEqual(dryRun.counts, {
      blockedEntryCount: 0,
      candidatePairCount: 2,
      deletedPairCount: 0,
      duePairCount: 1,
      futurePairCount: 1
    });
    assert.deepEqual(readdirSync(backupDir).sort(), before);

    const applied = runLeadPrune({
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z")
    });
    assert.deepEqual(applied.counts, {
      blockedEntryCount: 0,
      candidatePairCount: 2,
      deletedPairCount: 1,
      duePairCount: 1,
      futurePairCount: 1
    });
    const after = readdirSync(backupDir).sort();
    assert.equal(after.length, 2);
    assert.ok(after.every((name) => name.includes("20260701T000000Z")));
  });
});

test("prune blocks the whole batch on unknown, orphaned, or integrity-drifted entries", async () => {
  await withTempDirAsync("platform-lead-prune-blocked-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath);
    mkdirSync(backupDir, { mode: 0o700 });
    await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytesFn: () => Buffer.from("0011223344556677", "hex")
    });
    const pair = readBackupPair(backupDir);
    const originalNames = [...pair.names];

    writeFileSync(join(backupDir, "unknown-private.txt"), "do not delete", "utf8");
    const unknown = runLeadPrune({
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z")
    });
    assert.equal(unknown.status, "blocked");
    assert.ok(unknown.counts.blockedEntryCount >= 1);
    assert.ok(existsSync(pair.backupPath));
    assert.ok(existsSync(pair.manifestPath));
    rmSync(join(backupDir, "unknown-private.txt"));

    writeFileSync(pair.backupPath, "integrity drift", { flag: "a" });
    const drifted = runLeadPrune({
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z")
    });
    assert.equal(drifted.status, "blocked");
    assert.ok(drifted.reasonCodes.includes("backup_integrity_mismatch"));
    assert.ok(existsSync(pair.backupPath));
    assert.ok(existsSync(pair.manifestPath));
    assert.deepEqual(readdirSync(backupDir).sort(), originalNames);
  });
});

test("prune reports reconciliation required after a partial pair deletion", async () => {
  await withTempDirAsync("platform-lead-prune-partial-", async (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath);
    mkdirSync(backupDir, { mode: 0o700 });
    await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytesFn: () => Buffer.from("0011223344556677", "hex")
    });
    const pair = readBackupPair(backupDir);

    const result = runLeadPrune({
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z"),
      unlinkFn(path) {
        if (path.endsWith(".manifest.json")) throw new Error("synthetic unlink failure");
        rmSync(path);
      }
    });
    assert.equal(result.status, "reconciliation_required");
    assert.equal(result.mutationState, "unknown");
    assert.deepEqual(result.reasonCodes, ["partial_pair_deletion"]);
    assert.equal(existsSync(pair.backupPath), false);
    assert.equal(existsSync(pair.manifestPath), true);
    assert.doesNotMatch(JSON.stringify(result), /synthetic unlink|control-2026|manifest\.json/i);
  });
});

test("prune rejects traversal manifests, nested entries, and symlinked artifacts", async (context) => {
  await withTempDirAsync("platform-lead-prune-unsafe-", async (directory) => {
    const backupDir = join(directory, "lead-aware-backups");
    mkdirSync(backupDir, { mode: 0o700 });
    const unsafeManifestName = "control-20260101T000000Z-0011223344556677.sqlite.manifest.json";
    writeFileSync(join(backupDir, unsafeManifestName), JSON.stringify({
      ...createLeadBackupManifest(manifestInput({
        file: "control-20260101T000000Z-0011223344556677.sqlite"
      })),
      file: "../escape.sqlite"
    }), "utf8");
    mkdirSync(join(backupDir, "nested-private"));

    const traversal = runLeadPrune({
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z")
    });
    assert.equal(traversal.status, "blocked");
    assert.ok(traversal.reasonCodes.includes("invalid_backup_basename"));
    assert.ok(traversal.reasonCodes.includes("unsafe_entry"));
    assert.ok(existsSync(join(backupDir, unsafeManifestName)));

    rmSync(join(backupDir, unsafeManifestName));
    rmSync(join(backupDir, "nested-private"), { recursive: true });
    const dbPath = join(directory, "control.sqlite");
    createBackupFixture(dbPath);
    await runLeadBackup({
      dbPath,
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-01-01T00:00:00.000Z"),
      randomBytesFn: () => Buffer.from("8899aabbccddeeff", "hex")
    });
    const pair = readBackupPair(backupDir);
    const outside = join(directory, "outside.sqlite");
    writeFileSync(outside, "outside private fixture", "utf8");
    rmSync(pair.backupPath);
    try {
      symlinkSync(outside, pair.backupPath, "file");
    } catch (error) {
      if (error?.code === "EPERM" || error?.code === "EACCES") {
        context.skip("file symlink creation is unavailable on this Windows host");
        return;
      }
      throw error;
    }

    const symlinked = runLeadPrune({
      backupDir,
      apply: true,
      nowFn: () => new Date("2026-04-01T00:00:00.000Z")
    });
    assert.equal(symlinked.status, "blocked");
    assert.ok(symlinked.reasonCodes.includes("unsafe_entry"));
    assert.equal(readFileSync(outside, "utf8"), "outside private fixture");
    assert.equal(lstatSync(pair.backupPath).isSymbolicLink(), true);
  });
});

test("retention CLI defaults purge to dry-run and emits one closed JSON line", () => {
  withTempDir("platform-lead-cli-purge-", (directory) => {
    const dbPath = join(directory, "private-control.sqlite");
    createPurgeFixture(dbPath);
    const processResult = runRetentionCli(["purge"], {
      env: { SUBSCRIPTION_CONTROL_DB_PATH: dbPath }
    });
    assert.equal(processResult.status, 0);
    assert.equal(processResult.stderr, "");
    assert.equal(processResult.stdout.trim().split(/\r?\n/).length, 1);
    const result = JSON.parse(processResult.stdout);
    assert.equal(result.command, "purge");
    assert.equal(result.mode, "dry-run");
    assert.equal(result.status, "planned");
    assert.equal(result.counts.deletedLeadCount, 0);
    assert.doesNotMatch(processResult.stdout, /private-control|private-due|private-future|example\.test/i);

    const database = new Database(dbPath, { readonly: true });
    assert.equal(database.prepare("select count(*) as count from platform_leads").get().count, 2);
    database.close();
  });
});

test("retention CLI applies purge only with explicit apply and maps completion to zero", () => {
  withTempDir("platform-lead-cli-apply-", (directory) => {
    const dbPath = join(directory, "control.sqlite");
    createPurgeFixture(dbPath);
    const expired = new Database(dbPath);
    expired.prepare("update platform_leads set expires_at = ?")
      .run("2020-01-01T00:00:00.000Z");
    expired.close();
    const processResult = runRetentionCli(["purge", "--apply"], {
      env: { SUBSCRIPTION_CONTROL_DB_PATH: dbPath }
    });
    assert.equal(processResult.status, 0);
    const result = JSON.parse(processResult.stdout);
    assert.equal(result.mode, "apply");
    assert.equal(result.status, "completed");
    assert.equal(result.counts.deletedLeadCount, 2);

    const database = new Database(dbPath, { readonly: true });
    assert.equal(database.prepare("select count(*) as count from platform_leads").get().count, 0);
    database.close();
  });
});

test("retention CLI validates backup and prune grammar without creating artifacts", () => {
  withTempDir("platform-lead-cli-backup-", (directory) => {
    const dbPath = join(directory, "control.sqlite");
    const backupDir = join(directory, "lead-aware-backups");
    createBackupFixture(dbPath);
    mkdirSync(backupDir, { mode: 0o700 });

    const backup = runRetentionCli(["backup", "--backup-dir", backupDir], {
      env: { SUBSCRIPTION_CONTROL_DB_PATH: dbPath }
    });
    assert.equal(backup.status, 0);
    assert.equal(JSON.parse(backup.stdout).mode, "dry-run");
    assert.deepEqual(readdirSync(backupDir), []);

    const prune = runRetentionCli(["prune", "--backup-dir", backupDir]);
    assert.equal(prune.status, 0);
    assert.equal(JSON.parse(prune.stdout).mode, "dry-run");
    assert.deepEqual(readdirSync(backupDir), []);
    assert.doesNotMatch(`${backup.stdout}${prune.stdout}`, /lead-aware-backups|control\.sqlite/i);
  });
});

test("retention CLI rejects missing configuration and unknown or duplicate arguments", () => {
  const cases = [
    runRetentionCli(["purge"]),
    runRetentionCli(["backup"]),
    runRetentionCli(["prune", "--backup-dir", "x"]),
    runRetentionCli(["purge", "--unknown"]),
    runRetentionCli(["purge", "--apply", "--apply"])
  ];
  for (const processResult of cases) {
    assert.equal(processResult.status, 64);
    assert.equal(processResult.stderr, "");
    const result = JSON.parse(processResult.stdout);
    assert.equal(result.status, "blocked");
    assert.deepEqual(result.reasonCodes, ["invalid_command_contract"]);
    assert.equal(processResult.stdout.trim().split(/\r?\n/).length, 1);
  }
});
