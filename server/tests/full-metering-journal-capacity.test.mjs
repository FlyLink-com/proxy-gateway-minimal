import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeFullMeteringJournal, readFullMeteringJournal, commitFullMeteringJournal,
  recoverFullMeteringJournal, admitPreRatingSwitchPending, fullMeteringDigest } from "../../scripts/lib/full-metering-journal.mjs";

const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
const magic = Buffer.from("GCCFMJ2\n");
function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "metering-capacity-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, "journal");
  initializeFullMeteringJournal({ directory, context, checkpoint: { sequence: 0 } });
  return directory;
}
function packed(bytes, declared = bytes.length) {
  const header = Buffer.alloc(16);
  magic.copy(header); header.writeBigUInt64LE(BigInt(declared), 8);
  return Buffer.concat([header, gzipSync(bytes)]);
}
function legacy(payload) {
  const body = { version: 1, context, payload };
  return Buffer.from(JSON.stringify({ ...body, digest: fullMeteringDigest(body) }));
}

test("canonical digest remains byte-compatible with existing journal hashes", () => {
  const value = { z: [3, { b: "中文", a: true }], a: null };
  const canonical = '{"a":null,"z":[3,{"a":true,"b":"中文"}]}';
  assert.equal(fullMeteringDigest(value), createHash("sha256").update(canonical).digest("hex"));
});

test("a checkpoint above the former 32 MiB limit commits and reads without resetting its sequence", t => {
  const directory = fixture(t);
  const next = { sequence: 1, syntheticPackedHistory: "a".repeat(33 * 1024 * 1024) };
  let written = 0;
  commitFullMeteringJournal({ directory, context, previousCheckpoint: { sequence: 0 }, nextCheckpoint: next,
    samples: [{ id: "synthetic-one" }], applySamples: () => { written++; } });
  const disk = readFileSync(join(directory, "checkpoint.json"));
  assert.deepEqual(disk.subarray(0, 8), magic);
  assert.ok(disk.length < 1024 * 1024);
  assert.deepEqual(readFullMeteringJournal({ directory, context }), next);
  assert.equal(written, 1);
});

for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`compressed intent recovery preserves exact batch at ${stage}`, t => {
    const directory = fixture(t);
    const next = { sequence: 1, syntheticHistory: "b".repeat(2 * 1024 * 1024) };
    const inserted = new Set();
    const applySamples = rows => rows.forEach(row => inserted.add(row.id));
    assert.throws(() => commitFullMeteringJournal({ directory, context, previousCheckpoint: { sequence: 0 }, nextCheckpoint: next,
      samples: [{ id: "synthetic-id" }], applySamples, onStage: value => { if (value === stage) throw new Error("crash"); } }), /crash/);
    assert.deepEqual(readFileSync(join(directory, "pending.json")).subarray(0, 8), magic);
    assert.equal(recoverFullMeteringJournal({ directory, context, applySamples }).recovered, true);
    assert.deepEqual(readFullMeteringJournal({ directory, context }), next);
    assert.equal(inserted.size, 1);
    assert.equal(existsSync(join(directory, "pending.json")), false);
  });
}

test("legacy pending replays into compressed checkpoint without replacing the original batch", t => {
  const directory = fixture(t);
  const next = { sequence: 1, syntheticHistory: "c".repeat(2 * 1024 * 1024) };
  writeFileSync(join(directory, "pending.json"), legacy({ previousDigest: fullMeteringDigest({ sequence: 0 }),
    nextCheckpoint: next, samples: [{ id: "legacy-synthetic" }] }), { mode: 0o600 });
  const seen = [];
  const applySamples = rows => seen.push(...rows);
  assert.throws(() => recoverFullMeteringJournal({ directory, context, applySamples }), /full_metering_legacy_unadmitted/);
  assert.deepEqual(seen, []);
  assert.equal(readFullMeteringJournal({ directory, context }).sequence, 0);
  admitPreRatingSwitchPending({ directory, context });
  recoverFullMeteringJournal({ directory, context, applySamples });
  assert.deepEqual(seen, [{ id: "legacy-synthetic" }]);
  assert.deepEqual(readFullMeteringJournal({ directory, context }), next);
  assert.deepEqual(readFileSync(join(directory, "checkpoint.json")).subarray(0, 8), magic);
});

for (const variant of ["truncated", "corrupt", "too-large", "under-declared", "over-declared", "tampered-digest", "foreign-context"]) {
  test(`compressed ${variant} state fails closed without applying or deleting intent`, t => {
    const directory = fixture(t);
    const payload = { previousDigest: fullMeteringDigest({ sequence: 0 }), nextCheckpoint: { sequence: 1 }, samples: [] };
    let bytes = legacy(payload), encoded = packed(bytes);
    if (variant === "truncated") encoded = magic;
    if (variant === "corrupt") encoded[encoded.length - 5] ^= 0xff;
    if (variant === "too-large") encoded.writeBigUInt64LE(BigInt(256 * 1024 * 1024 + 1), 8);
    if (variant === "under-declared") encoded = packed(bytes, 1);
    if (variant === "over-declared") encoded = packed(bytes, bytes.length + 1);
    if (variant === "tampered-digest") {
      const value = JSON.parse(bytes); value.payload.nextCheckpoint.sequence = 99;
      encoded = packed(Buffer.from(JSON.stringify(value)));
    }
    if (variant === "foreign-context") {
      const body = { version: 1, context: { ...context, scopeDigest: "c".repeat(64) }, payload };
      encoded = packed(Buffer.from(JSON.stringify({ ...body, digest: fullMeteringDigest(body) })));
    }
    writeFileSync(join(directory, "pending.json"), encoded, { mode: 0o600 });
    let attempts = 0;
    assert.throws(() => recoverFullMeteringJournal({ directory, context, applySamples: () => { attempts++; } }));
    assert.equal(attempts, 0);
    assert.equal(existsSync(join(directory, "pending.json")), true);
    assert.equal(readFullMeteringJournal({ directory, context }).sequence, 0);
  });
}

test("serialization failure creates no orphan temporary file and leaves the old checkpoint intact", t => {
  const directory = fixture(t);
  let attempts = 0;
  assert.throws(() => commitFullMeteringJournal({ directory, context, previousCheckpoint: { sequence: 0 },
    nextCheckpoint: { unsupported: 1n }, samples: [], applySamples: () => { attempts++; } }));
  assert.deepEqual(readdirSync(directory), ["checkpoint.json"]);
  assert.equal(attempts, 0);
  assert.equal(readFullMeteringJournal({ directory, context }).sequence, 0);
});
