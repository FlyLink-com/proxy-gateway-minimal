// D1 Card 8 — durable delta journal + U-F18 credential-only
// reconciliation tests (synthetic data only).
//
// Everything here runs against in-memory SQLite databases (or temp
// files that are deleted afterwards). All credential values are
// synthetic (`s2s-` prefix); no real BWH row is read, no E4 write is
// attempted, no network call is made, no trigger is installed on a
// real database.
//
// Test IDs:
// - J-1..J-9: durable ordered delta journal (HWM, gap detection,
//   tombstone, resumable replay, checkpoint / snapshot binding).
// - U-1..U-5: U-F18 credential-only reconciliation over synthetic
//   credential version manifests, including the source/target final
//   reconciliation loop.
// - V-C1..V-C3: empirical re-verification of the three V-C checks
//   (measured here, not inferred from comments). The scan in V-C1
//   reads the actual `server/` tree; V-C2 executes both DDLs and
//   inspects the resulting tables; V-C3 calls `fingerprintRow` on a
//   synthetic row and observes which column changes move the hash.
//
// NOTE on wording in this file: the V-C1 scan looks for UPDATE
// statements on the credentials table in non-test source. This file
// therefore never writes that statement's table name next to the
// word UPDATE in a comment — only inside the scan regex itself and
// inside the synthetic SQL strings the scan is meant to find.

import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendCredentialRotations,
  appendDeltaEntries,
  appendSourceDelta,
  entryDigest,
  findJournalGaps,
  GENESIS_JOURNAL_HASH,
  readCheckpoint,
  readJournalEntries,
  reconcileCredentialManifests,
  replayDeltaJournal,
  verifyJournal,
} from "../services/platform/d1-card8-delta-journal.mjs";
import {
  buildCheckpointManifest,
  enumerateSourceDeltas,
  fingerprintRow,
  isCredentialColumn,
} from "../services/platform/source-delta.mjs";
import {
  buildCredentialVersionManifest,
  detectCredentialRotations,
  ensureCredentialVersionTracking,
  credentialPk,
  verifyCredentialVersionManifest,
} from "../services/platform/d1-stage2-credential-reconciliation.mjs";
import {
  buildSyntheticSourceSnapshot,
  SNAPSHOT_FIXTURE_DDL,
  syntheticMaterialDigest,
} from "../services/platform/d1-stage2-source-manifest.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const NOW = "2026-11-20T00:00:00.000Z";
const SNAPSHOT_A = "s2s-journal-snapshot-a";
const SNAPSHOT_B = "s2s-journal-snapshot-b";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function assertErrorCode(fn, code) {
  assert.throws(fn, (error) => error && error.code === code);
}

function makeJournalDb(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  return db;
}

function makeItemsDb(t, seed = true) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  db.exec("create table items (id text primary key, label text not null)");
  if (seed) {
    const insert = db.prepare("insert into items (id, label) values (?, ?)");
    insert.run("a", "one");
    insert.run("b", "two");
    insert.run("c", "three");
  }
  return db;
}

function makeCredentialSnapshot(t, snapshotId = SNAPSHOT_A) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  buildSyntheticSourceSnapshot({ db, snapshotId, now: NOW });
  return db;
}

function rotateFirstCredential(db) {
  db.prepare(`update platform_portal_edge_credentials set edge_credential_ref = 's2s-cred-001-rotated', edge_material_digest = ? where request_id = 's2s-request-001' and edge_channel_ref = 's2s-channel-a'`)
    .run(syntheticMaterialDigest("s2s-cred-001-rotated"));
}

function mutateItemsForDelta(db) {
  db.prepare("update items set label = ? where id = ?").run("two-updated", "b");
  db.prepare("delete from items where id = ?").run("c");
  db.prepare("insert into items (id, label) values (?, ?)").run("d", "four");
}

function sourceRowsById(db) {
  return new Map(db.prepare("select id, label from items order by id asc").all().map((row) => [row.id, row.label]));
}

// Replay applier used by J-5/J-6: re-fetch the current row from the
// synthetic source by PK (the journal carries fingerprints only, so
// it can never reconstruct a value) and apply insert/update/delete
// to the target.
function makeItemsApplier(sourceDb, targetDb) {
  return (entry) => {
    if (entry.kind === "delete") {
      targetDb.prepare("delete from items where id = ?").run(entry.pk);
      return;
    }
    const row = sourceDb.prepare("select id, label from items where id = ?").get(entry.pk);
    assert.ok(row, `replay applier cannot find source row for ${entry.pk}`);
    targetDb.prepare("insert into items (id, label) values (?, ?) on conflict(id) do update set label = excluded.label")
      .run(row.id, row.label);
  };
}

// ---- J: durable ordered delta journal ----

test("J-1 an empty journal verifies with HWM 0 and no checkpoint", (t) => {
  const db = makeJournalDb(t);
  assert.equal(readCheckpoint(db, { snapshotId: SNAPSHOT_A }), null);
  const verified = verifyJournal(db, { snapshotId: SNAPSHOT_A });
  assert.equal(verified.ok, true);
  assert.equal(verified.entryCount, 0);
  assert.equal(verified.highWaterMark, 0);
  assert.equal(verified.journalHash, GENESIS_JOURNAL_HASH);
  assert.equal(verified.tombstoneCount, 0);
  assert.equal(verified.credentialRotateCount, 0);
  assert.deepEqual(readJournalEntries(db, { snapshotId: SNAPSHOT_A }), []);
  assert.deepEqual(findJournalGaps(db, { snapshotId: SNAPSHOT_A }), []);
});

test("J-2 appendSourceDelta records insert/update/delete in deterministic order with contiguous seqs", (t) => {
  const source = makeItemsDb(t);
  const journal = makeJournalDb(t);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  mutateItemsForDelta(source);
  const delta = enumerateSourceDeltas(source, { tables, checkpoint });
  assert.deepEqual(delta.summary, { tables: 1, inserted: 1, updated: 1, deleted: 1 });
  const result = appendSourceDelta(journal, { snapshotId: SNAPSHOT_A, delta });
  assert.deepEqual(
    { appended: result.appended, firstSeq: result.firstSeq, lastSeq: result.lastSeq, highWaterMark: result.highWaterMark },
    { appended: 3, firstSeq: 1, lastSeq: 3, highWaterMark: 3 },
  );
  const entries = readJournalEntries(journal, { snapshotId: SNAPSHOT_A });
  assert.deepEqual(entries.map((e) => [e.seq, e.kind, e.pk]), [
    [1, "insert", "d"],
    [2, "update", "b"],
    [3, "delete", "c"],
  ]);
  assert.equal(entries[2].tombstone, 1, "a delete entry is a tombstone");
  assert.equal(entries[2].fingerprint, null);
  assert.ok(entries[2].previousFingerprint);
  assert.equal(entries[1].previousFingerprint, checkpoint.tables.items.b);
  const stored = readCheckpoint(journal, { snapshotId: SNAPSHOT_A });
  assert.equal(stored.highWaterMark, 3);
  assert.equal(stored.appliedSeq, 0, "appending never moves the replay resume point");
  assert.equal(stored.journalHash, entries[2].entryDigest);
  assert.equal(verifyJournal(journal, { snapshotId: SNAPSHOT_A }).ok, true);
});

test("J-3 a tampered fingerprint breaks the chain and a deleted row is reported as a gap", (t) => {
  const source = makeItemsDb(t);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  mutateItemsForDelta(source);
  const delta = enumerateSourceDeltas(source, { tables, checkpoint });

  const tampered = makeJournalDb(t);
  appendSourceDelta(tampered, { snapshotId: SNAPSHOT_A, delta });
  tampered.prepare(`update d1_delta_journal set fingerprint = ? where seq = 2`).run("0".repeat(64));
  assertErrorCode(() => verifyJournal(tampered, { snapshotId: SNAPSHOT_A }), "delta_journal_digest_mismatch");

  const gapped = makeJournalDb(t);
  appendSourceDelta(gapped, { snapshotId: SNAPSHOT_A, delta });
  gapped.prepare(`delete from d1_delta_journal where seq = 2`).run();
  assert.deepEqual(findJournalGaps(gapped, { snapshotId: SNAPSHOT_A }), [2]);
  assertErrorCode(() => verifyJournal(gapped, { snapshotId: SNAPSHOT_A }), "delta_journal_gap");
});

test("J-4 out-of-order seq, foreign snapshotId and malformed entries fail closed with nothing written", (t) => {
  const journal = makeJournalDb(t);
  assertErrorCode(
    () => appendDeltaEntries(journal, { snapshotId: SNAPSHOT_A, entries: [{ table: "items", pk: "a", kind: "insert", fingerprint: "0".repeat(64), seq: 5 }] }),
    "delta_journal_gap",
  );
  assert.equal(readJournalEntries(journal, { snapshotId: SNAPSHOT_A }).length, 0);

  appendDeltaEntries(journal, { snapshotId: SNAPSHOT_A, entries: [{ table: "items", pk: "a", kind: "insert", fingerprint: "0".repeat(64) }] });
  assertErrorCode(
    () => appendDeltaEntries(journal, { snapshotId: SNAPSHOT_B, entries: [{ table: "items", pk: "b", kind: "insert", fingerprint: "0".repeat(64) }] }),
    "delta_journal_snapshot_mismatch",
  );
  assertErrorCode(
    () => appendDeltaEntries(journal, { snapshotId: SNAPSHOT_A, entries: [{ table: "items", pk: "b", kind: "insert", fingerprint: "not-a-fingerprint" }] }),
    "delta_journal_entry_invalid",
  );
  assertErrorCode(
    () => appendDeltaEntries(journal, { snapshotId: SNAPSHOT_A, entries: [{ table: "items", pk: "b", kind: "explode" }] }),
    "delta_journal_entry_invalid",
  );
  assert.equal(readJournalEntries(journal, { snapshotId: SNAPSHOT_A }).length, 1);
  assert.equal(verifyJournal(journal, { snapshotId: SNAPSHOT_A }).highWaterMark, 1);
});

test("J-5 replay converges the target and a second replay is a no-op", async (t) => {
  const source = makeItemsDb(t);
  const target = makeItemsDb(t);
  const journal = makeJournalDb(t);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  mutateItemsForDelta(source);
  const delta = enumerateSourceDeltas(source, { tables, checkpoint });
  appendSourceDelta(journal, { snapshotId: SNAPSHOT_A, delta });

  const first = await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(source, target) });
  assert.deepEqual(first, { completed: true, applied: 3, skipped: 0, skippedSeqs: [], lastAppliedSeq: 3, failedSeq: null, error: null });
  assert.deepEqual([...sourceRowsById(target).entries()], [...sourceRowsById(source).entries()]);
  assert.equal(readCheckpoint(journal, { snapshotId: SNAPSHOT_A }).highWaterMark, 3);
  assert.equal(readCheckpoint(journal, { snapshotId: SNAPSHOT_A }).appliedSeq, 3);

  const second = await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(source, target) });
  assert.deepEqual(second, { completed: true, applied: 0, skipped: 0, skippedSeqs: [], lastAppliedSeq: 3, failedSeq: null, error: null });
});

test("J-6 a crash mid-replay resumes from the checkpoint and still converges", async (t) => {
  const source = makeItemsDb(t);
  const target = makeItemsDb(t);
  const journal = makeJournalDb(t);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  mutateItemsForDelta(source);
  const delta = enumerateSourceDeltas(source, { tables, checkpoint });
  appendSourceDelta(journal, { snapshotId: SNAPSHOT_A, delta });

  let failuresLeft = 1;
  const flaky = (entry) => {
    if (entry.seq === 2 && failuresLeft > 0) {
      failuresLeft -= 1;
      throw new Error("synthetic applier crash");
    }
    return makeItemsApplier(source, target)(entry);
  };
  const crashed = await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: flaky });
  assert.equal(crashed.completed, false);
  assert.equal(crashed.applied, 1);
  assert.equal(crashed.lastAppliedSeq, 1);
  assert.equal(crashed.failedSeq, 2);
  assert.match(crashed.error, /synthetic applier crash/);
  assert.equal(readCheckpoint(journal, { snapshotId: SNAPSHOT_A }).appliedSeq, 1);
  assert.equal(readCheckpoint(journal, { snapshotId: SNAPSHOT_A }).highWaterMark, 3, "the journal head does not move on a replay crash");
  assert.equal(target.prepare("select label from items where id = 'b'").get().label, "two");

  const resumed = await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(source, target) });
  assert.deepEqual(resumed, { completed: true, applied: 2, skipped: 0, skippedSeqs: [], lastAppliedSeq: 3, failedSeq: null, error: null });
  assert.deepEqual([...sourceRowsById(target).entries()], [...sourceRowsById(source).entries()]);
});

test("J-7 tombstones persist after replay and a re-insert orders after its tombstone", async (t) => {
  const source = makeItemsDb(t);
  const target = makeItemsDb(t);
  const journal = makeJournalDb(t);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  mutateItemsForDelta(source);
  const delta = enumerateSourceDeltas(source, { tables, checkpoint });
  appendSourceDelta(journal, { snapshotId: SNAPSHOT_A, delta });
  await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(source, target) });

  const entries = readJournalEntries(journal, { snapshotId: SNAPSHOT_A });
  assert.equal(entries.filter((e) => e.kind === "delete").length, 1, "the tombstone is retained, not compacted away");

  const reinsert = appendDeltaEntries(journal, {
    snapshotId: SNAPSHOT_A,
    entries: [{ table: "items", pk: "c", kind: "insert", fingerprint: fingerprintRow({ id: "c", label: "three-again" }) }],
  });
  assert.equal(reinsert.lastSeq, 4);
  const history = readJournalEntries(journal, { snapshotId: SNAPSHOT_A }).filter((e) => e.pk === "c");
  assert.deepEqual(history.map((e) => [e.seq, e.kind]), [[3, "delete"], [4, "insert"]]);
  assert.equal(verifyJournal(journal, { snapshotId: SNAPSHOT_A }).tombstoneCount, 1);
});

test("J-10 replay folds an update superseded by a later delete of the same PK (R)", async (t) => {
  const source = makeItemsDb(t);
  const target = makeItemsDb(t);
  const journal = makeJournalDb(t);
  // Same PK updated then deleted: the update's apply would re-fetch
  // a source row that no longer exists. The fold must skip it.
  appendDeltaEntries(journal, {
    snapshotId: SNAPSHOT_A,
    entries: [
      { table: "items", pk: "b", kind: "update", fingerprint: fingerprintRow({ id: "b", label: "two-updated" }), previousFingerprint: fingerprintRow({ id: "b", label: "two" }) },
      { table: "items", pk: "b", kind: "delete", previousFingerprint: fingerprintRow({ id: "b", label: "two-updated" }) },
    ],
  });
  source.prepare("delete from items where id = ?").run("b");
  const result = await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(source, target) });
  assert.deepEqual(result, { completed: true, applied: 1, skipped: 1, skippedSeqs: [1], lastAppliedSeq: 2, failedSeq: null, error: null });
  assert.deepEqual([...sourceRowsById(target).entries()], [...sourceRowsById(source).entries()]);
  assert.equal(readCheckpoint(journal, { snapshotId: SNAPSHOT_A }).appliedSeq, 2, "the pointer advances past the skipped entry too");
});

test("J-11 cross-checkpoint update+delete still folds at replay (R)", async (t) => {
  const source = makeItemsDb(t);
  const target = makeItemsDb(t);
  const journal = makeJournalDb(t);
  const tables = [{ table: "items", pk: "id" }];
  const checkpoint1 = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  source.prepare("update items set label = ? where id = ?").run("two-updated", "b");
  appendSourceDelta(journal, { snapshotId: SNAPSHOT_A, delta: enumerateSourceDeltas(source, { tables, checkpoint: checkpoint1 }) });
  const checkpoint2 = buildCheckpointManifest(source, { tables, snapshotId: SNAPSHOT_A });
  source.prepare("delete from items where id = ?").run("b");
  appendSourceDelta(journal, { snapshotId: SNAPSHOT_A, delta: enumerateSourceDeltas(source, { tables, checkpoint: checkpoint2 }) });
  assert.deepEqual(
    readJournalEntries(journal, { snapshotId: SNAPSHOT_A }).map((e) => [e.seq, e.kind, e.pk]),
    [[1, "update", "b"], [2, "delete", "b"]],
    "the two checkpoints enter the journal as two entries",
  );
  const result = await replayDeltaJournal(journal, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(source, target) });
  assert.deepEqual(result, { completed: true, applied: 1, skipped: 1, skippedSeqs: [1], lastAppliedSeq: 2, failedSeq: null, error: null });
  assert.deepEqual([...sourceRowsById(target).entries()], [...sourceRowsById(source).entries()]);
});

test("J-12 the fold is fail-closed: no tombstone, no skip; a throwing delete still blocks; a re-insert after a tombstone still applies (R)", async (t) => {
  // (a) An update with no later tombstone whose apply throws still
  // blocks the replay — it is a live write, not a superseded one.
  const sourceA = makeItemsDb(t);
  const targetA = makeItemsDb(t);
  const journalA = makeJournalDb(t);
  appendDeltaEntries(journalA, {
    snapshotId: SNAPSHOT_A,
    entries: [{ table: "items", pk: "b", kind: "update", fingerprint: fingerprintRow({ id: "b", label: "two-updated" }), previousFingerprint: fingerprintRow({ id: "b", label: "two" }) }],
  });
  sourceA.prepare("delete from items where id = ?").run("b");
  const blocked = await replayDeltaJournal(journalA, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(sourceA, targetA) });
  assert.equal(blocked.completed, false);
  assert.equal(blocked.failedSeq, 1);
  assert.equal(blocked.applied, 0);
  assert.equal(blocked.skipped, 0);
  assert.deepEqual(blocked.skippedSeqs, []);
  assert.equal(readCheckpoint(journalA, { snapshotId: SNAPSHOT_A }).appliedSeq, 0);

  // (b) A delete tombstone whose own apply throws still blocks.
  const sourceB = makeItemsDb(t);
  const targetB = makeItemsDb(t);
  const journalB = makeJournalDb(t);
  appendDeltaEntries(journalB, {
    snapshotId: SNAPSHOT_A,
    entries: [{ table: "items", pk: "c", kind: "delete", previousFingerprint: fingerprintRow({ id: "c", label: "three" }) }],
  });
  const throwingDelete = (entry) => {
    if (entry.kind === "delete") throw new Error("synthetic delete applier failure");
    return makeItemsApplier(sourceB, targetB)(entry);
  };
  const deleteBlocked = await replayDeltaJournal(journalB, { snapshotId: SNAPSHOT_A, apply: throwingDelete });
  assert.equal(deleteBlocked.completed, false);
  assert.equal(deleteBlocked.failedSeq, 1);

  // (c) A re-insert after a tombstone is not superseded: it applies.
  const sourceC = makeItemsDb(t);
  const targetC = makeItemsDb(t);
  const journalC = makeJournalDb(t);
  appendDeltaEntries(journalC, {
    snapshotId: SNAPSHOT_A,
    entries: [
      { table: "items", pk: "c", kind: "delete", previousFingerprint: fingerprintRow({ id: "c", label: "three" }) },
      { table: "items", pk: "c", kind: "insert", fingerprint: fingerprintRow({ id: "c", label: "three-again" }) },
    ],
  });
  sourceC.prepare("update items set label = ? where id = ?").run("three-again", "c");
  const reinserted = await replayDeltaJournal(journalC, { snapshotId: SNAPSHOT_A, apply: makeItemsApplier(sourceC, targetC) });
  assert.deepEqual(reinserted, { completed: true, applied: 2, skipped: 0, skippedSeqs: [], lastAppliedSeq: 2, failedSeq: null, error: null });
  assert.equal(targetC.prepare("select label from items where id = 'c'").get().label, "three-again");
});

test("J-8 the checkpoint binds the journal to one credential manifest hash", (t) => {
  const db = makeCredentialSnapshot(t, SNAPSHOT_A);
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  rotateFirstCredential(db);
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  const rotations = detectCredentialRotations(before, after);

  const journal = makeJournalDb(t);
  const result = appendCredentialRotations(journal, { snapshotId: SNAPSHOT_B, rotations, currentManifest: after });
  assert.equal(result.appended, 1);
  const stored = readCheckpoint(journal, { snapshotId: SNAPSHOT_B });
  assert.equal(stored.credentialManifestHash, after.manifestHash);
  assert.equal(verifyJournal(journal, { snapshotId: SNAPSHOT_B, expectedCredentialManifestHash: after.manifestHash }).ok, true);
  assertErrorCode(
    () => verifyJournal(journal, { snapshotId: SNAPSHOT_B, expectedCredentialManifestHash: before.manifestHash }),
    "delta_journal_snapshot_mismatch",
  );
});

test("J-9 appending zero entries is a no-op that leaves the HWM unchanged", (t) => {
  const journal = makeJournalDb(t);
  const first = appendDeltaEntries(journal, { snapshotId: SNAPSHOT_A, entries: [{ table: "items", pk: "a", kind: "insert", fingerprint: "0".repeat(64) }] });
  const second = appendDeltaEntries(journal, { snapshotId: SNAPSHOT_A, entries: [] });
  assert.deepEqual(second, { appended: 0, firstSeq: null, lastSeq: null, highWaterMark: first.highWaterMark, journalHash: first.journalHash });
});

// ---- U: U-F18 credential-only reconciliation ----

test("U-1 a row-count-preserving rotation is detected and journalled without any credential material", (t) => {
  const db = makeCredentialSnapshot(t, SNAPSHOT_A);
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  assert.equal(before.liveRowCount, 3);
  rotateFirstCredential(db);
  // Row count is unchanged: the rotation is invisible to row counts.
  assert.equal(db.prepare("select count(*) as n from platform_portal_edge_credentials").get().n, 3);
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });

  const report = reconcileCredentialManifests(after, before, { snapshotId: SNAPSHOT_B });
  assert.equal(report.identityConsistent, true);
  assert.equal(report.reconciled, false);
  assert.equal(report.sourceSnapshotId, SNAPSHOT_B);
  assert.equal(report.targetSnapshotId, SNAPSHOT_A);
  assert.equal(report.rotated.length, 1);
  assert.equal(report.rotated[0].pk, credentialPk("s2s-request-001", "s2s-channel-a"));
  assert.deepEqual([report.rotated[0].fromVersion, report.rotated[0].toVersion], [1, 2]);
  assert.deepEqual(report.added, []);
  assert.deepEqual(report.deleted, []);
  assert.equal(report.unchanged, 2);

  const journal = makeJournalDb(t);
  const rotations = detectCredentialRotations(before, after);
  const appended = appendCredentialRotations(journal, { snapshotId: SNAPSHOT_B, rotations, currentManifest: after });
  assert.equal(appended.appended, 1);
  const entries = readJournalEntries(journal, { snapshotId: SNAPSHOT_B });
  assert.equal(entries[0].kind, "credential-rotate");
  assert.equal(entries[0].credentialPreviousVersion, 1);
  assert.equal(entries[0].credentialVersion, 2);
  assert.equal(entries[0].versionDigest, after.entries.find((e) => e.pk === entries[0].pk).versionDigest);
  const journalJson = JSON.stringify(entries);
  assert.ok(!journalJson.includes("s2s-cred-"), "no synthetic credential ref may enter the journal");
  assert.ok(!journalJson.includes("sha256:"), "no synthetic material digest may enter the journal");
});

test("U-2 rotate + add + delete reconciles to zero diff once the target catches up", (t) => {
  const db = makeCredentialSnapshot(t, SNAPSHOT_A);
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  rotateFirstCredential(db);
  db.prepare(`delete from platform_portal_edge_credentials where request_id = 's2s-request-002' and edge_channel_ref = 's2s-channel-b'`).run();
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-003', 's2s-channel-a', 's2s-cred-004', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-004"));
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });

  const open = reconcileCredentialManifests(after, before, { snapshotId: SNAPSHOT_B });
  assert.equal(open.rotated.length, 1);
  assert.deepEqual(open.added, [credentialPk("s2s-request-003", "s2s-channel-a")]);
  assert.deepEqual(open.deleted, [credentialPk("s2s-request-002", "s2s-channel-b")]);
  assert.equal(open.unchanged, 1);
  assert.equal(open.reconciled, false);

  const journal = makeJournalDb(t);
  const rotations = detectCredentialRotations(before, after);
  const appended = appendCredentialRotations(journal, { snapshotId: SNAPSHOT_B, rotations, currentManifest: after });
  assert.equal(appended.appended, 3);
  assert.deepEqual(
    readJournalEntries(journal, { snapshotId: SNAPSHOT_B }).map((e) => e.kind),
    ["credential-rotate", "insert", "delete"],
  );
  const journalJson = JSON.stringify(readJournalEntries(journal, { snapshotId: SNAPSHOT_B }));
  for (const forbidden of ["s2s-cred-001", "s2s-cred-002", "s2s-cred-003", "s2s-cred-004", "sha256:"]) {
    assert.ok(!journalJson.includes(forbidden), `journal must not contain ${forbidden}`);
  }

  // The target applies the reported diff (same three synthetic
  // mutations, in its own database) and rebuilds its manifest: the
  // second reconciliation must report zero diff.
  const targetDb = makeCredentialSnapshot(t, SNAPSHOT_A);
  rotateFirstCredential(targetDb);
  targetDb.prepare(`delete from platform_portal_edge_credentials where request_id = 's2s-request-002' and edge_channel_ref = 's2s-channel-b'`).run();
  targetDb.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-003', 's2s-channel-a', 's2s-cred-004', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-004"));
  const targetCaughtUp = buildCredentialVersionManifest(targetDb, { snapshotId: SNAPSHOT_B });
  const closed = reconcileCredentialManifests(after, targetCaughtUp, { snapshotId: SNAPSHOT_B });
  assert.equal(closed.reconciled, true);
  assert.deepEqual([closed.rotated, closed.added, closed.deleted], [[], [], []]);
  // Unchanged counts every entry both manifests agree on, including
  // the tombstone both agree is deleted (3 live + 1 tombstone).
  assert.equal(closed.unchanged, 4);
  assert.equal(closed.sourceManifestHash, closed.targetManifestHash);
});

test("U-3 a foreign snapshotId and a tampered target manifest both fail closed", (t) => {
  const db = makeCredentialSnapshot(t, SNAPSHOT_A);
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  rotateFirstCredential(db);
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });

  assertErrorCode(
    () => reconcileCredentialManifests(after, before, { snapshotId: SNAPSHOT_A }),
    "delta_journal_snapshot_mismatch",
  );
  const tampered = { ...before, entries: before.entries.map((entry, i) => (i === 0 ? { ...entry, versionDigest: "0".repeat(64) } : entry)) };
  assert.throws(() => reconcileCredentialManifests(after, tampered, { snapshotId: SNAPSHOT_B }), { code: "credential_manifest_invalid" });
  assert.throws(() => verifyCredentialVersionManifest(tampered), { code: "credential_manifest_invalid" });
});

test("U-4 entry digests are chained from the genesis hash", (t) => {
  const journal = makeJournalDb(t);
  appendDeltaEntries(journal, {
    snapshotId: SNAPSHOT_A,
    entries: [
      { table: "items", pk: "a", kind: "insert", fingerprint: "a".repeat(64) },
      { table: "items", pk: "b", kind: "insert", fingerprint: "b".repeat(64) },
    ],
  });
  const entries = readJournalEntries(journal, { snapshotId: SNAPSHOT_A });
  // Seq 1 chains from the genesis hash; seq 2 chains from seq 1.
  const first = entryDigest({
    seq: 1, snapshotId: SNAPSHOT_A, table: "items", pk: "a", kind: "insert",
    fingerprint: "a".repeat(64), previousFingerprint: null,
    credentialVersion: null, credentialPreviousVersion: null, versionDigest: null,
    previousEntryDigest: GENESIS_JOURNAL_HASH,
  });
  assert.equal(first, entries[0].entryDigest);
  const second = entryDigest({
    seq: 2, snapshotId: SNAPSHOT_A, table: "items", pk: "b", kind: "insert",
    fingerprint: "b".repeat(64), previousFingerprint: null,
    credentialVersion: null, credentialPreviousVersion: null, versionDigest: null,
    previousEntryDigest: entries[0].entryDigest,
  });
  assert.equal(second, entries[1].entryDigest);
  assert.notEqual(GENESIS_JOURNAL_HASH, entries[0].entryDigest);
});

test("U-5 a delete-insert-delete cycle between manifests is reported rotated but never journalled (AC observation 2)", (t) => {
  // Both manifests hold deleted = 1 for the same PK with different
  // versions: the row was deleted, re-inserted, and deleted again
  // between the two captures. detectCredentialRotations reports it
  // as rotated (the only branch left for two tombstones whose
  // versions differ) — a misclassification, but a fail-closed one:
  // reconcile reports not-reconciled, and append refuses the entry
  // because the current manifest entry is tombstoned.
  const db = makeCredentialSnapshot(t, SNAPSHOT_A);
  const pk = credentialPk("s2s-request-001", "s2s-channel-a");
  db.prepare(`delete from platform_portal_edge_credentials where request_id = 's2s-request-001' and edge_channel_ref = 's2s-channel-a'`).run();
  const before = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_A });
  assert.equal(before.entries.find((e) => e.pk === pk).deleted, 1);
  assert.equal(before.entries.find((e) => e.pk === pk).version, 2);
  db.prepare(`insert into platform_portal_edge_credentials (request_id, edge_channel_ref, edge_credential_ref, edge_material_digest, ordinal) values ('s2s-request-001', 's2s-channel-a', 's2s-cred-001-again', ?, 0)`)
    .run(syntheticMaterialDigest("s2s-cred-001-again"));
  db.prepare(`delete from platform_portal_edge_credentials where request_id = 's2s-request-001' and edge_channel_ref = 's2s-channel-a'`).run();
  const after = buildCredentialVersionManifest(db, { snapshotId: SNAPSHOT_B });
  assert.equal(after.entries.find((e) => e.pk === pk).deleted, 1);
  assert.equal(after.entries.find((e) => e.pk === pk).version, 4);

  const rotations = detectCredentialRotations(before, after);
  assert.deepEqual(rotations.rotated, [{ pk, fromVersion: 2, toVersion: 4 }]);
  assert.deepEqual(rotations.added, []);
  assert.deepEqual(rotations.deleted, []);
  const report = reconcileCredentialManifests(after, before, { snapshotId: SNAPSHOT_B });
  assert.equal(report.reconciled, false);

  const journal = makeJournalDb(t);
  assertErrorCode(
    () => appendCredentialRotations(journal, { snapshotId: SNAPSHOT_B, rotations, currentManifest: after }),
    "delta_journal_entry_invalid",
  );
  assert.deepEqual(readJournalEntries(journal, { snapshotId: SNAPSHOT_B }), []);
});

// ---- V-C: empirical re-verification (measured, not inferred) ----

function walkMjsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walkMjsFiles(path));
    else if (name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

test("V-C1 no production write path refreshes the material digest on rotation", (t) => {
  const updatePattern = /\bupdate\s+["'`]?platform_portal_edge_credentials\b/i;
  const insertPattern = /\binsert\s+into\s+["'`]?platform_portal_edge_credentials\b/i;
  const deletePattern = /\bdelete\s+from\s+["'`]?platform_portal_edge_credentials\b/i;
  const files = walkMjsFiles(join(REPO_ROOT, "server"));
  const matches = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (updatePattern.test(text)) matches.push(file);
  }
  // The scan must actually find the pattern somewhere (synthetic
  // rotation simulations in tests), otherwise a zero outside tests
  // would be vacuous.
  assert.ok(matches.length > 0, "the scan must find synthetic rotation simulations in tests");
  assert.ok(matches.every((file) => file.includes("/tests/")), "every file with such a statement is a test file");
  assert.deepEqual(matches.filter((file) => !file.includes("/tests/")), [], "no non-test server source updates the credentials table");

  // The only non-test writes are provisioning-time inserts and one
  // revocation delete: no write path in-repo is proven to refresh the
  // material digest on every rotation.
  const serviceFiles = files.filter((file) => !file.includes("/tests/"));
  let inserts = 0;
  let deletes = 0;
  for (const file of serviceFiles) {
    const text = readFileSync(file, "utf8");
    inserts += [...text.matchAll(new RegExp(insertPattern, "gi"))].length;
    deletes += [...text.matchAll(new RegExp(deletePattern, "gi"))].length;
  }
  assert.equal(inserts, 2);
  assert.equal(deletes, 1);
});

test("V-C2 the credentials table has no updated_at column in either DDL", (t) => {
  const expectedColumns = ["request_id", "edge_channel_ref", "edge_credential_ref", "edge_material_digest", "ordinal"];

  // Rehearsal fixture DDL (d1-stage2-source-manifest.mjs).
  const fixtureDb = new Database(":memory:");
  t.after(() => fixtureDb.close());
  fixtureDb.exec(SNAPSHOT_FIXTURE_DDL.platform_portal_edge_credentials);
  const fixtureColumns = fixtureDb.prepare(`pragma table_info(platform_portal_edge_credentials)`).all().map((row) => row.name);
  assert.deepEqual(fixtureColumns, expectedColumns);
  assert.ok(!fixtureColumns.includes("updated_at"));

  // Real control-plane DDL (subscription-control-db.mjs), executed
  // in a temp-file database and inspected via pragma.
  const dir = mkdtempSync(join(tmpdir(), "card8-vc2-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const realDb = new Database(join(dir, "control.sqlite"));
  t.after(() => realDb.close());
  createSqliteSubscriptionControlStore({ database: realDb });
  const realColumns = realDb.prepare(`pragma table_info(platform_portal_edge_credentials)`).all().map((row) => row.name);
  assert.deepEqual(realColumns, expectedColumns);
  assert.ok(!realColumns.includes("updated_at"));
});

test("V-C3 fingerprintRow includes the material digest but excludes the credential ref", (t) => {
  const row = {
    request_id: "s2s-request-001",
    edge_channel_ref: "s2s-channel-a",
    edge_credential_ref: "s2s-cred-001",
    edge_material_digest: syntheticMaterialDigest("s2s-cred-001"),
    ordinal: 0,
  };
  assert.equal(isCredentialColumn("edge_credential_ref"), true);
  assert.equal(isCredentialColumn("edge_material_digest"), false);
  const base = fingerprintRow(row);
  assert.notEqual(fingerprintRow({ ...row, edge_material_digest: syntheticMaterialDigest("s2s-cred-001-rotated") }), base,
    "changing the material digest changes the fingerprint: it is included");
  assert.equal(fingerprintRow({ ...row, edge_credential_ref: "s2s-cred-001-rotated" }), base,
    "changing the credential ref leaves the fingerprint unchanged: it is excluded");
  assert.notEqual(fingerprintRow({ ...row, ordinal: 1 }), base, "ordinal is included");
  assert.notEqual(fingerprintRow({ ...row, request_id: "s2s-request-002" }), base, "request_id is included");
  assert.notEqual(fingerprintRow({ ...row, edge_channel_ref: "s2s-channel-b" }), base, "edge_channel_ref is included");
});
