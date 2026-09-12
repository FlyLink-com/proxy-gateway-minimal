import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFullMeteringCollection, FULL_METERING_CHANNELS } from "../../scripts/lib/full-metering-collection.mjs";
import { readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
const T0 = "2026-09-08T00:00:00.000Z", T1 = "2026-09-08T00:01:00.000Z", T2 = "2026-09-08T00:02:00.000Z";
const context = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "full-collection-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, "private");
  let now = T0, value = 1000, failure = false;
  const entries = FULL_METERING_CHANNELS.map(({ channelRef, sourceRef }) => ({ channelRef, sourceRef, edgeCredentialRef: `ref-${channelRef}`, materialDigest: "sha256:test", accountId: "account", entitlementId: "entitlement", requestId: "request", billingBinding: { plan: "yearly", validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2027-09-01T00:00:00.000Z" } }));
  const samples = new Map();
  const opts = { directory, context, activationId: "test", nowFn: () => now,
    readInventory: () => ({ entries, retainedBindings: [] }),
    readSources: async () => {
      if (failure) throw Object.assign(new Error("unreachable"), { code: "source_unreachable" });
      return FULL_METERING_CHANNELS.map(({ channelRef, sourceRef, mode }) => ({ channelRef, sourceRef, mode, generation: "c".repeat(64), observedAt: now,
        observations: [{ edgeCredentialRef: `ref-${channelRef}`, uploadBytes: value, downloadBytes: value, ...(mode === "connections" ? { connectionId: "connection-1" } : {}) }] }));
    }, applySamples: batch => { for (const sample of batch) samples.set(sample.record.id, sample); } };
  return { directory, opts, samples, set: (time, bytes) => { now = time; value = bytes; }, fail: () => { failure = true; } };
}
test("five-source initialization only baselines; later collection records only new bytes", async t => {
  const f = fixture(t);
  const dry = await runFullMeteringCollection({ ...f.opts, mode: "preflight" });
  assert.equal(dry.channelCount, 5); assert.equal(f.samples.size, 0); assert.equal(existsSync(f.directory), false);
  const init = await runFullMeteringCollection({ ...f.opts, mode: "initialize" });
  assert.equal(init.status, "baseline_initialized"); assert.equal(f.samples.size, 0);
  f.set(T1, 1005);
  const next = await runFullMeteringCollection({ ...f.opts, mode: "collect" });
  assert.equal(next.sampleCount, 5); assert.equal(next.recordedBytes, 50); assert.equal(f.samples.size, 5);
  const replay = await runFullMeteringCollection({ ...f.opts, mode: "collect" });
  assert.equal(replay.sampleCount, 0); assert.equal(f.samples.size, 5);
});
test("missing, duplicate, unknown source or source failure cannot partially commit", async t => {
  const f = fixture(t);
  await runFullMeteringCollection({ ...f.opts, mode: "initialize" });
  f.set(T1, 1005);
  const read = f.opts.readSources;
  for (const transform of [v => v.slice(1), v => [...v, v[0]], v => [...v.slice(1), { ...v[0], channelRef: "channel-sgp-a-tuic" }]]) {
    await assert.rejects(runFullMeteringCollection({ ...f.opts, mode: "collect", readSources: async () => transform(await read()) }), /source_scope_invalid/);
  }
  assert.equal(f.samples.size, 0);
  f.fail(); await assert.rejects(runFullMeteringCollection({ ...f.opts, mode: "collect" }), /unreachable/);
  assert.equal(f.samples.size, 0);
});
test("unknown identity, ownership drift and absent checkpoint do not reset baseline", async t => {
  const f = fixture(t);
  await assert.rejects(runFullMeteringCollection({ ...f.opts, mode: "collect" }));
  await runFullMeteringCollection({ ...f.opts, mode: "initialize" });
  f.set(T1, 1005);
  const inventory = f.opts.readInventory(); inventory.entries[0].accountId = "different-account";
  await assert.rejects(runFullMeteringCollection({ ...f.opts, mode: "collect" }), /binding_changed/);
  assert.equal(f.samples.size, 0);
});
test("checkpoint-only first readings also require post-read identity revalidation", async t => {
  const f = fixture(t);
  let reads = 0;
  const original = f.opts.readInventory;
  await assert.rejects(runFullMeteringCollection({ ...f.opts, mode: "initialize", readInventory: () => {
    const value = structuredClone(original());
    if (++reads > 1) value.entries[0].materialDigest = "sha256:different";
    return value;
  } }), /binding_changed/);
  assert.equal(existsSync(f.directory), false);
});
test("normal newly verified identities start pending while old counters keep continuity", async t => {
  const f = fixture(t);
  await runFullMeteringCollection({ ...f.opts, mode: "initialize" });
  const inventory = f.opts.readInventory();
  inventory.entries.push({ ...inventory.entries[0], edgeCredentialRef: "new-verified-ref", accountId: "new-account" });
  f.set(T1, 1005);
  const outcome = await runFullMeteringCollection({ ...f.opts, mode: "collect" });
  assert.equal(outcome.pendingStartCount, 1); assert.equal(outcome.recordedBytes, 50);
  const checkpoint = readFullMeteringJournal({ directory: f.directory, context });
  assert.equal(checkpoint.scopeTransitions.length, 1);
  assert.deepEqual(Object.keys(checkpoint.scopeTransitions[0]).sort(), ["afterPayloadDigest", "beforePayloadDigest", "receipt"]);
  assert.match(checkpoint.scopeTransitions[0].beforePayloadDigest, /^[a-f0-9]{64}$/);
  assert.match(checkpoint.scopeTransitions[0].afterPayloadDigest, /^[a-f0-9]{64}$/);
});
test("verified runtime generation changes preserve old accounting and never charge new baseline values", async t => {
  const f = fixture(t);
  await runFullMeteringCollection({ ...f.opts, mode: "initialize" });
  f.set(T1, 1005);
  await runFullMeteringCollection({ ...f.opts, mode: "collect" });
  f.set(T2, 99000);
  const original = f.opts.readSources;
  const readSources = async () => (await original()).map(source => ({ ...source, generation: "d".repeat(64) }));
  const reset = await runFullMeteringCollection({ ...f.opts, readSources, mode: "collect" });
  assert.equal(reset.sampleCount, 0);
  assert.equal(f.samples.size, 5);
  assert.equal(reset.channels.every(channel => channel.generationUnassignedGap?.unassignedBytes === null), true);
  f.set("2026-09-08T00:03:00.000Z", 99003);
  const after = await runFullMeteringCollection({ ...f.opts, readSources, mode: "collect" });
  assert.equal(after.recordedBytes, 30);
  assert.equal(f.samples.size, 10);
});
