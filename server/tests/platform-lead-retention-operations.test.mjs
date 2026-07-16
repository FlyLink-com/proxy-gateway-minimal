import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  buildLeadRetentionCommandResult,
  calculateLeadBackupRetention,
  createLeadBackupManifest,
  runLeadPurge,
  serializeLeadRetentionCommandResult,
  validateLeadBackupManifest
} from "../services/platform/lead-retention-operations.mjs";

const CREATED_AT = "2026-07-16T00:00:00.000Z";
const EMPTY_PRIVACY_CUTOFF = "2026-10-14T00:00:00.000Z";
const EMPTY_PRUNE_AT = "2026-10-13T22:00:00.000Z";

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
