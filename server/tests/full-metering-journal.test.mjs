import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initializeFullMeteringJournal, readFullMeteringJournal,
  commitFullMeteringJournal, recoverFullMeteringJournal, withFullMeteringJournalLock
} from "../../scripts/lib/full-metering-journal.mjs";

const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "full-metering-journal-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, "private");
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0, channels: [] } });
  const inserted = new Map();
  let attempts = 0;
  const applySamples = samples => { attempts++; for (const sample of samples) inserted.set(sample.id, sample); };
  return { directory, inserted, applySamples, attempts: () => attempts };
}
function commit(f, extra = {}) {
  return commitFullMeteringJournal({ directory: f.directory, context,
    previousCheckpoint: { sequence: 0, channels: [] }, nextCheckpoint: { sequence: 1, channels: ["private-credential"] },
    samples: [{ id: "sample-1", uploadBytes: 10 }], applySamples: f.applySamples, ...extra });
}
test("journal durably checkpoints one batch and refuses implicit reinitialization", t => {
  const f = fixture(t);
  assert.throws(() => initializeFullMeteringJournal({ directory: f.directory, context, checkpoint: {} }));
  commit(f);
  assert.deepEqual(readFullMeteringJournal({ directory: f.directory, context }), { sequence: 1, channels: ["private-credential"] });
  assert.equal(f.inserted.size, 1);
  assert.equal(existsSync(join(f.directory, "pending.json")), false);
  assert.throws(() => commit(f), /checkpoint_changed/);
});
for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`journal replays exact immutable intent after interruption at ${stage}`, t => {
    const f = fixture(t);
    assert.throws(() => commit(f, { onStage: value => { if (value === stage) throw new Error("synthetic_crash"); } }), /synthetic_crash/);
    assert.equal(existsSync(join(f.directory, "pending.json")), true);
    assert.throws(() => commit(f), /pending_recovery_required/);
    assert.equal(recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.applySamples }).recovered, true);
    assert.equal(f.inserted.size, 1);
    assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 1);
    assert.equal(recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.applySamples }).recovered, false);
  });
}
test("database failure leaves intent and old checkpoint for retry", t => {
  const f = fixture(t);
  assert.throws(() => commit(f, { applySamples: () => { throw new Error("sqlite_failure"); } }), /sqlite_failure/);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
  recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.applySamples });
  assert.equal(f.inserted.size, 1);
});
test("missing, tampered, foreign-context and divergent state never establish a fresh baseline", t => {
  const f = fixture(t);
  assert.throws(() => readFullMeteringJournal({ directory: join(f.directory, "absent"), context }));
  assert.throws(() => readFullMeteringJournal({ directory: f.directory, context: { ...context, scopeDigest: "c".repeat(64) } }), /context_changed/);
  assert.throws(() => commit(f, { onStage: () => { throw new Error("crash"); } }));
  const path = join(f.directory, "pending.json");
  const pending = JSON.parse(readFileSync(path, "utf8"));
  pending.payload.samples[0].uploadBytes = 900;
  writeFileSync(path, JSON.stringify(pending));
  assert.throws(() => recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.applySamples }), /digest_invalid/);
  assert.equal(f.inserted.size, 0);
});
test("exclusive scope lock prevents overlapping writers and releases on caught failure", async t => {
  const f = fixture(t);
  await assert.rejects(withFullMeteringJournalLock({ directory: f.directory }, async () => {
    await assert.rejects(withFullMeteringJournalLock({ directory: f.directory }, async () => {}), /locked/);
    throw new Error("failure");
  }), /failure/);
  assert.equal(await withFullMeteringJournalLock({ directory: f.directory }, async () => 42), 42);
});
