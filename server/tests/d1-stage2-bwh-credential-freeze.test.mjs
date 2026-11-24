// D1 Stage 2 — credential-only reconciliation and freeze/drain
// tests (tasks 5–6, plus the credential/freeze crash cases of task
// 7). All fixtures are synthetic (s2s- prefix). No production data,
// no real credential material, no network.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import {
  buildSyntheticSourceSnapshot,
  SNAPSHOT_FIXTURE_DDL,
  syntheticMaterialDigest,
} from "../services/platform/d1-stage2-source-manifest.mjs";
import {
  ensureCredentialVersionTracking,
  backfillCredentialVersions,
  buildCredentialVersionManifest,
  verifyCredentialVersionManifest,
  detectCredentialRotations,
  credentialPk,
} from "../services/platform/d1-stage2-credential-reconciliation.mjs";
import {
  fingerprintRow,
  buildCheckpointManifest,
  enumerateSourceDeltas,
} from "../services/platform/source-delta.mjs";
import {
  buildWriteLockReceipt,
  buildSchedulerQuiescenceReceipt,
  buildCallbackDrainReceipt,
  buildHwmCompletenessReceipt,
  buildFreezeReadinessBundle,
  verifyFreezeReadinessBundle,
  buildUnfencedWriterCoverage,
  SCHEDULER_JOBS,
} from "../services/platform/d1-stage2-freeze-drain.mjs";
import { verifyFreezeReceipt } from "../services/platform/writer-freeze-receipt.mjs";
import { createHighWaterMark } from "../services/platform/d1-stage2-source-export.mjs";

const NOW = "2026-11-20T00:00:00.000Z";
const SNAPSHOT_A = "s2s-snapshot-test-001";
const SNAPSHOT_B = "s2s-snapshot-test-002";

function makeDatabaseFixture(t, filename) {
  const dir = mkdtempSync(join(tmpdir(), "stage2-cred-"));
  const dbPath = join(dir, filename);
  const connections = [];
  t.after(() => {
    for (const connection of connections.reverse()) {
      if (connection.open) connection.close();
    }
    rmSync(dir, { recursive: true, force: true });
  });
  return function openConnection(timeout) {
    const connection = new Database(dbPath, timeout === undefined ? undefined : { timeout });
    connections.push(connection);
    return connection;
  };
}

function makeSnapshot(t, snapshotId = SNAPSHOT_A, timeout) {
  const openConnection = makeDatabaseFixture(t, "snapshot.sqlite");
  const db = openConnection(timeout);
  const { metadata } = buildSyntheticSourceSnapshot({ db, snapshotId, now: NOW });
  return { metadata, db, openConnection };
}

function assertErrorCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

function recomputeFreezeBundleHash(bundle) {
  const { bundleHash: _bundleHash, ...unsigned } = bundle;
  return createHash("sha256").update(canonicalJson(unsigned), "utf8").digest("hex");
}

function allQuiescedEvidence() {
  return Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true]));
}

// ---- Task 5: U-F18 credential-only reconciliation ----

test("S2S-CRED-1 versions bump on insert, update and delete; manifest verifies", (t) => {
  const { db } = makeSnapshot(t);
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  assert.equal(before.liveRowCount, 3);
  assert.equal(before.tombstoneCount, 0);
  assert.equal(before.backfilledCount, 0);
  assert.ok(before.entries.every((entry) => entry.version === 1 && entry.origin === "tracked"));
  db.prepare(`update platform_portal_edge_credentials set edge_credential_ref = 's2s-cred-001-rotated', edge_material_digest = ? where request_id = 's2s-request-001' and edge_channel_ref = 's2s-channel-a'`)
    .run(syntheticMaterialDigest("s2s-cred-001-rotated"));
  db.prepare(`delete from platform_portal_edge_credentials where request_id = 's2s-request-002' and edge_channel_ref = 's2s-channel-b'`).run();
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-003', 's2s-channel-a', 's2s-cred-004', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-004"));
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  assert.equal(after.liveRowCount, 3);
  assert.equal(after.tombstoneCount, 1);
  const rotated = after.entries.find((entry) => entry.pk === credentialPk("s2s-request-001", "s2s-channel-a"));
  assert.equal(rotated.version, 2);
  assert.equal(rotated.deleted, 0);
  const tombstone = after.entries.find((entry) => entry.pk === credentialPk("s2s-request-002", "s2s-channel-b"));
  assert.equal(tombstone.version, 2);
  assert.equal(tombstone.deleted, 1);
  const added = after.entries.find((entry) => entry.pk === credentialPk("s2s-request-003", "s2s-channel-a"));
  assert.equal(added.version, 1);
  assert.equal(verifyCredentialVersionManifest(after), true);
  assert.equal(verifyCredentialVersionManifest(before), true);
});

test("S2S-CRED-2 a credential-only rotation is invisible to fingerprints but visible to versions", (t) => {
  const { db } = makeSnapshot(t);
  const rowBefore = db.prepare(`select * from platform_portal_edge_credentials where request_id = 's2s-request-001'`).get();
  const fingerprintBefore = fingerprintRow(rowBefore, { excludeColumns: ["edge_credential_ref", "edge_material_digest"] });
  const manifestBefore = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  db.prepare(`update platform_portal_edge_credentials set edge_credential_ref = 's2s-cred-001-rotated', edge_material_digest = ? where request_id = 's2s-request-001'`)
    .run(syntheticMaterialDigest("s2s-cred-001-rotated"));
  const rowAfter = db.prepare(`select * from platform_portal_edge_credentials where request_id = 's2s-request-001'`).get();
  const fingerprintAfter = fingerprintRow(rowAfter, { excludeColumns: ["edge_credential_ref", "edge_material_digest"] });
  assert.equal(fingerprintAfter, fingerprintBefore, "fingerprint diffing cannot see a credential-only rotation (the 1B gap)");
  const manifestAfter = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  const diff = detectCredentialRotations(manifestBefore, manifestAfter);
  assert.equal(diff.rotated.length, 1);
  assert.equal(diff.rotated[0].pk, credentialPk("s2s-request-001", "s2s-channel-a"));
  assert.equal(diff.rotated[0].fromVersion, 1);
  assert.equal(diff.rotated[0].toVersion, 2);
  assert.equal(diff.unchanged, 2);
});

test("S2S-CRED-3 rows that predate tracking are backfilled and flagged", (t) => {
  const db = makeDatabaseFixture(t, "plain.sqlite")();
  db.exec(SNAPSHOT_FIXTURE_DDL.platform_portal_edge_credentials);
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-001', 's2s-channel-a', 's2s-cred-001', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-001"));
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-002', 's2s-channel-a', 's2s-cred-002', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-002"));
  ensureCredentialVersionTracking(db);
  const backfilled = backfillCredentialVersions(db, { now: () => new Date(NOW) });
  assert.equal(backfilled.backfilled, 2);
  const manifest = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  assert.equal(manifest.backfilledCount, 2);
  assert.ok(manifest.entries.every((entry) => entry.origin === "backfilled" && entry.version === 1));
  db.prepare(`update platform_portal_edge_credentials set ordinal = 1 where request_id = 's2s-request-001'`).run();
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  const entry = after.entries.find((item) => item.pk === credentialPk("s2s-request-001", "s2s-channel-a"));
  assert.equal(entry.version, 2);
  assert.equal(entry.origin, "backfilled", "a pre-tracking row keeps its weak-baseline flag");
  assert.equal(verifyCredentialVersionManifest(after), true);
});

test("S2S-CRED-4 an untracked live row and an orphaned version both fail closed", (t) => {
  const { db } = makeSnapshot(t);
  db.prepare(`delete from platform_credential_versions where credential_pk = ?`).run(credentialPk("s2s-request-001", "s2s-channel-a"));
  assertErrorCode(() => buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A }), "credential_version_untracked");
  const { db: db2 } = makeSnapshot(t, "s2s-snapshot-test-004");
  db2.prepare(`insert into platform_credential_versions (credential_pk, version, deleted, origin, updated_at) values ('s2s-request-999|s2s-channel-z', 1, 0, 'tracked', ?)`)
    .run(NOW);
  assertErrorCode(() => buildCredentialVersionManifest(db2, { snapshotId: SNAPSHOT_A }), "credential_version_orphaned");
});

test("S2S-CRED-5 a tampered version manifest fails verification", (t) => {
  const { db } = makeSnapshot(t);
  const manifest = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  const tamperedDigest = { ...manifest, entries: manifest.entries.map((entry, i) => (i === 0 ? { ...entry, versionDigest: "0".repeat(64) } : entry)) };
  assertErrorCode(() => verifyCredentialVersionManifest(tamperedDigest), "credential_manifest_invalid");
  const tamperedHash = { ...manifest, manifestHash: "0".repeat(64) };
  assertErrorCode(() => verifyCredentialVersionManifest(tamperedHash), "credential_manifest_invalid");
  const tamperedCount = { ...manifest, liveRowCount: 99 };
  assertErrorCode(() => verifyCredentialVersionManifest(tamperedCount), "credential_manifest_invalid");
});

test("S2S-CRED-6 rotation detection reports rotated, added, deleted and unchanged", (t) => {
  const { db } = makeSnapshot(t);
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  db.prepare(`update platform_portal_edge_credentials set edge_credential_ref = 's2s-cred-001-rotated', edge_material_digest = ? where request_id = 's2s-request-001'`)
    .run(syntheticMaterialDigest("s2s-cred-001-rotated"));
  db.prepare(`delete from platform_portal_edge_credentials where request_id = 's2s-request-002' and edge_channel_ref = 's2s-channel-b'`).run();
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-003', 's2s-channel-a', 's2s-cred-004', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-004"));
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  const diff = detectCredentialRotations(before, after);
  assert.equal(diff.rotated.length, 1);
  assert.deepEqual(diff.added, [credentialPk("s2s-request-003", "s2s-channel-a")]);
  assert.deepEqual(diff.deleted, [credentialPk("s2s-request-002", "s2s-channel-b")]);
  assert.equal(diff.unchanged, 1);
});

test("S2S-CRED-7 version digests do not depend on credential values", (t) => {
  const { db } = makeSnapshot(t);
  const manifestA = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  const db2 = makeDatabaseFixture(t, "other.sqlite")();
  db2.exec(SNAPSHOT_FIXTURE_DDL.platform_portal_edge_credentials);
  ensureCredentialVersionTracking(db2);
  for (const row of [
    ["s2s-request-001", "s2s-channel-a", "s2s-cred-AAA", 0],
    ["s2s-request-002", "s2s-channel-a", "s2s-cred-BBB", 0],
    ["s2s-request-002", "s2s-channel-b", "s2s-cred-CCC", 1],
  ]) {
    db2.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values (?, ?, ?, ?, ?)`)
      .run(row[0], row[1], row[2], syntheticMaterialDigest(row[2]), row[3]);
  }
  const manifestB = buildCredentialVersionManifest(db2, { snapshotId: SNAPSHOT_A });
  assert.deepEqual(
    manifestA.entries.map((entry) => entry.versionDigest),
    manifestB.entries.map((entry) => entry.versionDigest),
    "same PKs and versions with different credential values must produce identical digests",
  );
});

// ---- Task 6: freeze execution and drain ----

test("S2S-FRZ-1 write-lock receipt builds and verifies; a concurrent write lock rejects it", (t) => {
  const { db, openConnection } = makeSnapshot(t, SNAPSHOT_A, 100);
  const receipt = buildWriteLockReceipt(db, { snapshotId: SNAPSHOT_A, checkpointId: "s2s-checkpoint-001", outstandingJobs: [] });
  assert.equal(receipt.kind, "write-lock");
  assert.equal(receipt.snapshotId, SNAPSHOT_A);
  assert.ok(receipt.doesNotProve.includes("scheduler quiescence"));
  assert.equal(verifyFreezeReceipt(receipt.receipt), true);
  assert.equal(receipt.receipt.phase, "BWH_ACTIVE");
  assert.equal(receipt.receipt.epoch, 1);
  const db2 = openConnection(100);
  db2.prepare("begin immediate").run();
  try {
    assert.throws(
      () => buildWriteLockReceipt(db, { snapshotId: SNAPSHOT_A, checkpointId: "s2s-checkpoint-002", outstandingJobs: [] }),
      (error) => error && (/busy|locked|timeout/i.test(error.message) || error.code === "freeze_receipt_invalid"),
    );
  } finally {
    db2.prepare("rollback").run();
  }
});

test("S2S-FRZ-2 scheduler quiescence requires positive evidence for every job", (t) => {
  const receipt = buildSchedulerQuiescenceReceipt({ evidence: allQuiescedEvidence(), snapshotId: SNAPSHOT_A, now: () => new Date(NOW) });
  assert.equal(receipt.kind, "scheduler-quiescence");
  assert.equal(receipt.jobs.length, SCHEDULER_JOBS.length);
  assert.ok(receipt.jobs.every((job) => job.quiesced === true));
  const oneFalse = allQuiescedEvidence();
  oneFalse["W-115"] = false;
  assertErrorCode(
    () => buildSchedulerQuiescenceReceipt({ evidence: oneFalse, snapshotId: SNAPSHOT_A }),
    "freeze_scheduler_not_quiesced",
  );
  const missing = allQuiescedEvidence();
  delete missing.METERING;
  assertErrorCode(
    () => buildSchedulerQuiescenceReceipt({ evidence: missing, snapshotId: SNAPSHOT_A }),
    "freeze_scheduler_not_quiesced",
  );
});

test("S2S-FRZ-3 callback drain requires every callback settled and rejects conflicts", (t) => {
  const receipt = buildCallbackDrainReceipt({
    callbacks: [
      { id: "cb-1", description: "commerce confirm callback", settled: true },
      { id: "cb-2", description: "referral tick callback", settled: true },
    ],
    snapshotId: SNAPSHOT_A, now: () => new Date(NOW),
  });
  assert.equal(receipt.kind, "callback-drain");
  assert.equal(receipt.drained, 2);
  assert.deepEqual(receipt.pending, []);
  assertErrorCode(
    () => buildCallbackDrainReceipt({
      callbacks: [{ id: "cb-1", description: "x", settled: true }, { id: "cb-2", description: "y", settled: false }],
      snapshotId: SNAPSHOT_A,
    }),
    "freeze_callback_pending",
  );
  assertErrorCode(
    () => buildCallbackDrainReceipt({
      callbacks: [{ id: "cb-1", description: "x", settled: true }, { id: "cb-1", description: "x", settled: false }],
      snapshotId: SNAPSHOT_A,
    }),
    "freeze_callback_conflict",
  );
});

test("S2S-FRZ-4 HWM completeness requires the manifest seq to match", (t) => {
  const receipt = buildHwmCompletenessReceipt({
    highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_A }),
    manifestSeq: 1,
    rowCounts: { platform_accounts: 3, platform_entitlements: 4 },
    snapshotId: SNAPSHOT_A, now: () => new Date(NOW),
  });
  assert.equal(receipt.kind, "hwm-completeness");
  assert.equal(receipt.seq, 1);
  assertErrorCode(
    () => buildHwmCompletenessReceipt({
      highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_A }),
      manifestSeq: 2,
      rowCounts: { platform_accounts: 3 },
      snapshotId: SNAPSHOT_A,
    }),
    "freeze_hwm_gap",
  );
  assertErrorCode(
    () => buildHwmCompletenessReceipt({
      highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_A }),
      manifestSeq: 1,
      rowCounts: {},
      snapshotId: SNAPSHOT_A,
    }),
    "freeze_hwm_invalid",
  );
});

test("S2S-FRZ-5 the readiness bundle holds all four receipts and never transitions phase", (t) => {
  const { db } = makeSnapshot(t);
  const writeLock = buildWriteLockReceipt(db, { snapshotId: SNAPSHOT_A, checkpointId: "s2s-checkpoint-001", outstandingJobs: [] });
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({ evidence: allQuiescedEvidence(), snapshotId: SNAPSHOT_A, now: () => new Date(NOW) });
  const callbackDrain = buildCallbackDrainReceipt({ callbacks: [{ id: "cb-1", description: "x", settled: true }], snapshotId: SNAPSHOT_A, now: () => new Date(NOW) });
  const hwmCompleteness = buildHwmCompletenessReceipt({
    highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_A }),
    manifestSeq: 1,
    rowCounts: { platform_accounts: 3 },
    snapshotId: SNAPSHOT_A, now: () => new Date(NOW),
  });
  const bundle = buildFreezeReadinessBundle({
    snapshotId: SNAPSHOT_A, writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness,
    now: () => new Date(NOW),
  });
  assert.equal(bundle.phaseTransition, "none");
  assert.equal(verifyFreezeReadinessBundle(bundle).valid, true);
  const tampered = { ...bundle, bundleHash: "0".repeat(64) };
  assertErrorCode(() => verifyFreezeReadinessBundle(tampered), "freeze_bundle_hash_mismatch");
  assertErrorCode(
    () => buildFreezeReadinessBundle({ snapshotId: SNAPSHOT_A, writeLock, schedulerQuiescence, hwmCompleteness, now: () => new Date(NOW) }),
    "freeze_bundle_incomplete",
  );
});

test("S2S-FRZ-7 bundle hash covers complete receipts and verifies positive receipt states", (t) => {
  const { db } = makeSnapshot(t);
  const writeLock = buildWriteLockReceipt(db, {
    snapshotId: SNAPSHOT_A,
    checkpointId: "s2s-checkpoint-001",
    outstandingJobs: [],
  });
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    evidence: allQuiescedEvidence(),
    snapshotId: SNAPSHOT_A,
    now: () => new Date(NOW),
  });
  const callbackDrain = buildCallbackDrainReceipt({
    callbacks: [{ id: "cb-1", description: "x", settled: true }],
    snapshotId: SNAPSHOT_A,
    now: () => new Date(NOW),
  });
  const hwmCompleteness = buildHwmCompletenessReceipt({
    highWaterMark: createHighWaterMark({ seq: 1, snapshotId: SNAPSHOT_A }),
    manifestSeq: 1,
    rowCounts: { platform_accounts: 3 },
    snapshotId: SNAPSHOT_A,
    now: () => new Date(NOW),
  });
  const bundle = buildFreezeReadinessBundle({
    snapshotId: SNAPSHOT_A,
    writeLock,
    schedulerQuiescence,
    callbackDrain,
    hwmCompleteness,
    now: () => new Date(NOW),
  });

  const changedReceiptField = {
    ...bundle,
    receipts: {
      ...bundle.receipts,
      schedulerQuiescence: {
        ...bundle.receipts.schedulerQuiescence,
        timestamp: "2026-11-20T00:00:01.000Z",
      },
    },
  };
  assertErrorCode(() => verifyFreezeReadinessBundle(changedReceiptField), "freeze_bundle_hash_mismatch");

  const schedulerNotQuiesced = {
    ...bundle,
    receipts: {
      ...bundle.receipts,
      schedulerQuiescence: {
        ...bundle.receipts.schedulerQuiescence,
        jobs: bundle.receipts.schedulerQuiescence.jobs.map((job, index) =>
          index === 0 ? { ...job, quiesced: false } : job),
      },
    },
  };
  schedulerNotQuiesced.bundleHash = recomputeFreezeBundleHash(schedulerNotQuiesced);
  assertErrorCode(() => verifyFreezeReadinessBundle(schedulerNotQuiesced), "freeze_scheduler_not_quiesced");

  const callbackStillPending = {
    ...bundle,
    receipts: {
      ...bundle.receipts,
      callbackDrain: {
        ...bundle.receipts.callbackDrain,
        pending: [{ id: "cb-pending" }],
      },
    },
  };
  callbackStillPending.bundleHash = recomputeFreezeBundleHash(callbackStillPending);
  assertErrorCode(() => verifyFreezeReadinessBundle(callbackStillPending), "freeze_callback_pending");

  const invalidHwm = {
    ...bundle,
    receipts: {
      ...bundle.receipts,
      hwmCompleteness: {
        ...bundle.receipts.hwmCompleteness,
        rowCounts: { platform_accounts: -1 },
      },
    },
  };
  invalidHwm.bundleHash = recomputeFreezeBundleHash(invalidHwm);
  assertErrorCode(() => verifyFreezeReadinessBundle(invalidHwm), "freeze_hwm_invalid");

  assertErrorCode(() => buildFreezeReadinessBundle({
    snapshotId: SNAPSHOT_A,
    writeLock,
    schedulerQuiescence: schedulerNotQuiesced.receipts.schedulerQuiescence,
    callbackDrain,
    hwmCompleteness,
  }), "freeze_scheduler_not_quiesced");
});

test("S2S-FRZ-6 the unfenced-writer coverage report starts at 28 open", (t) => {
  const coverage = buildUnfencedWriterCoverage({ fencedIds: [] });
  assert.equal(coverage.total, 28);
  assert.equal(coverage.fencedCount, 0);
  assert.equal(coverage.openCount, 28);
  const uf18 = coverage.entries.find((entry) => entry.id === "U-F18");
  assert.equal(uf18.status, "open");
  assert.match(uf18.note, /cutover blocker/);
  const partial = buildUnfencedWriterCoverage({ fencedIds: ["U-F1", "U-F2"] });
  assert.equal(partial.fencedCount, 2);
  assert.equal(partial.openCount, 26);
  assertErrorCode(() => buildUnfencedWriterCoverage({ fencedIds: ["U-F99"] }), "freeze_coverage_unknown");
});

// ---- Task 7 (credential/freeze side): crash and integrity ----

test("S2S-CRASH-6 cross-connection WAL reads see consistent states while another connection writes", (t) => {
  const { db, openConnection } = makeSnapshot(t);
  const db2 = openConnection();
  const count = () => db.prepare(`select count(*) as n from platform_accounts`).get().n;
  assert.equal(count(), 3);
  db2.prepare("begin immediate").run();
  db2.prepare(`insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json) values ('s2s-account-900', 's2s-owner-900', 'active', ?, ?, '{}')`).run(NOW, NOW);
  assert.equal(count(), 3, "an uncommitted write in another connection is invisible to readers");
  db2.prepare("commit").run();
  assert.equal(count(), 4, "the committed write becomes visible");
  db2.prepare(`insert into platform_accounts (id, owner_ref, status, created_at, updated_at, metadata_json) values ('s2s-account-901', 's2s-owner-901', 'active', ?, ?, '{}')`).run(NOW, NOW);
  assert.equal(count(), 5);
  const checkpoint = db.pragma("wal_checkpoint(TRUNCATE)");
  assert.ok(checkpoint && typeof checkpoint === "object");
});

test("S2S-CRASH-7 duplicate and resorted callbacks drain to the same count", (t) => {
  const first = buildCallbackDrainReceipt({
    callbacks: [
      { id: "cb-1", description: "x", settled: true },
      { id: "cb-2", description: "y", settled: true },
    ],
    snapshotId: SNAPSHOT_A, now: () => new Date(NOW),
  });
  const resorted = buildCallbackDrainReceipt({
    callbacks: [
      { id: "cb-2", description: "y", settled: true },
      { id: "cb-1", description: "x", settled: true },
    ],
    snapshotId: SNAPSHOT_A, now: () => new Date(NOW),
  });
  assert.equal(first.drained, resorted.drained);
  const duplicated = buildCallbackDrainReceipt({
    callbacks: [
      { id: "cb-1", description: "x", settled: true },
      { id: "cb-1", description: "x", settled: true },
      { id: "cb-2", description: "y", settled: true },
    ],
    snapshotId: SNAPSHOT_A, now: () => new Date(NOW),
  });
  assert.equal(duplicated.drained, 2, "duplicate callbacks are deduplicated by id");
});

test("S2S-CRASH-8 a tampered checkpoint forces re-examination instead of silent acceptance", (t) => {
  const { db } = makeSnapshot(t);
  const checkpoint = buildCheckpointManifest(db, {
    tables: [{ table: "platform_accounts", pk: "id" }],
    snapshotId: SNAPSHOT_A,
  });
  const tampered = {
    ...checkpoint,
    tables: {
      platform_accounts: {
        ...checkpoint.tables.platform_accounts,
        "s2s-account-001": "0".repeat(64),
      },
    },
  };
  const deltas = enumerateSourceDeltas(db, {
    tables: [{ table: "platform_accounts", pk: "id" }],
    checkpoint: tampered,
  });
  assert.deepEqual(deltas.tables[0].updated.map((row) => row.pk), ["s2s-account-001"]);
  const phantom = {
    ...checkpoint,
    tables: {
      platform_accounts: {
        ...checkpoint.tables.platform_accounts,
        "s2s-account-999": "a".repeat(64),
      },
    },
  };
  const phantomDeltas = enumerateSourceDeltas(db, {
    tables: [{ table: "platform_accounts", pk: "id" }],
    checkpoint: phantom,
  });
  assert.deepEqual(phantomDeltas.tables[0].deleted.map((row) => row.pk), ["s2s-account-999"]);
});
