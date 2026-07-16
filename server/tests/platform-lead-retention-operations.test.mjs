import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeadRetentionCommandResult,
  calculateLeadBackupRetention,
  createLeadBackupManifest,
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
