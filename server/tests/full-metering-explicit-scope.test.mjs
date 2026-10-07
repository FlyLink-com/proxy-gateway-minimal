import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSourceDriver } from "../../scripts/lib/full-metering-source-driver.mjs";
import { validateFullMeteringConfig } from "../../scripts/lib/full-metering-command.mjs";
import { fullMeteringDigest, readFullMeteringJournal, recoverFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { createFullMeteringSampleWriter, makeFullMeteringSample, fullMeteringBindingIdentity } from "../../scripts/lib/full-metering-sample-writer.mjs";

const SCOPE = "local-three-v1";
const CHANNELS = FULL_METERING_CHANNELS.filter(row => row.channelRef.startsWith("channel-vultr-"));
const T0 = "2026-10-07T00:00:00.000Z", T1 = "2026-10-07T00:01:00.000Z", T2 = "2026-10-07T00:02:00.000Z";
const legacyContext = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64) };
const context = { ...legacyContext, meteringScope: SCOPE };
const sourceConfig = rows => rows.map(row => ({ channelRef: row.channelRef, host: row.channelRef.startsWith("channel-sgp-") ? "sgp" : "local",
  kind: row.sourceRef.includes("xray") ? "xray" : row.mode === "connections" ? "tuic" : "hy2",
  runtimeUnit: row.sourceRef.includes("xray") ? "xray-vless-reality.service" : row.mode === "connections" ? "mihomo-tuic.service" : "hysteria2.service",
  configPath: "/synthetic/config.json" }));
const config = () => ({ version: 1, activationId: "three-new-activation", meteringScope: SCOPE,
  dbPath: "/private/control.sqlite", journalDirectory: "/private/new-journal", materialPath: "/private/material.json",
  backup: { path: "/private/backup.sqlite", sha256: "d".repeat(64) },
  sources: sourceConfig(CHANNELS), sgp: { status: "paused", usage: "unknown" } });
function fixture(t, local = true) {
  const parent = mkdtempSync(join(tmpdir(), "metering-explicit-scope-")), directory = join(parent, "journal");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const channels = local ? CHANNELS : FULL_METERING_CHANNELS;
  const f = { now: T0, value: 1000, writes: [], reads: 0, directory, channels };
  f.entries = channels.map(source => ({ ...source, edgeCredentialRef: `ref-${source.channelRef}`, materialDigest: "sha256:synthetic",
    accountId: "account", entitlementId: "entitlement", requestId: "request",
    billingBinding: { plan: "yearly", validFrom: "2026-10-01T00:00:00.000Z", validUntil: "2027-10-01T00:00:00.000Z" } }));
  f.options = { directory, context: local ? context : legacyContext, ...(local ? { meteringScope: SCOPE } : {}), activationId: local ? "three-new-activation" : "old-five",
    nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(f.entries), retainedBindings: [] }),
    readSources: async () => { f.reads++; return channels.map(source => ({ ...source, generation: "c".repeat(64), observedAt: f.now,
      observations: [{ edgeCredentialRef: `ref-${source.channelRef}`, uploadBytes: f.value, downloadBytes: f.value,
        ...(source.mode === "connections" ? { connectionId: "synthetic-connection" } : {}) }] })); },
    applySamples: samples => f.writes.push(...structuredClone(samples)) };
  f.checkpoint = () => readFullMeteringJournal({ directory, context: f.options.context });
  return f;
}

test("explicit local scope validates exact three local sources and paused unknown SGP", () => {
  assert.deepEqual(validateFullMeteringConfig(config()), config());
  for (const change of [{ meteringScope: "arbitrary" }, { meteringScope: null }, { meteringScope: undefined }, { meteringScope: [SCOPE] }, { sgp: null }, { sgp: { status: "paused", usage: 0 } },
    { sgp: { status: "paused", usage: "unknown", identityFile: "/private/forbidden-key" } },
    { sources: sourceConfig(CHANNELS).slice(1) }, { sources: [...sourceConfig(CHANNELS), sourceConfig(CHANNELS)[0]] },
    { sources: sourceConfig(FULL_METERING_CHANNELS) }, { sources: sourceConfig(CHANNELS).map(row => ({ ...row, host: "sgp" })) }]) {
    assert.throws(() => validateFullMeteringConfig({ ...config(), ...change }), /full_metering_/);
  }
});
test("driver canonicalizes the three-source order, never contacts deferred SGP", async () => {
  const seen = [];
  const driver = createFullMeteringSourceDriver({ meteringScope: SCOPE, sources: sourceConfig([...CHANNELS].reverse()), readMaterial: () => ({ records: [] }),
    readSource: async source => { seen.push(source.channelRef); assert.equal(source.host, "local"); return {
      generation: "c".repeat(64), configDigest: "d".repeat(64), runtimeUsers: [], observations: [], observedAt: T0 }; } });
  assert.equal((await driver({ entries: [], retainedBindings: [] })).length, 3);
  assert.deepEqual(seen, CHANNELS.map(row => row.channelRef));
});
test("new three-source journal initializes zero then only records new increments", async t => {
  const f = fixture(t);
  const preflight = await runFullMeteringCollection({ ...f.options, mode: "preflight" });
  assert.equal(existsSync(f.directory), false);
  assert.deepEqual(preflight.deferredSources, { status: "paused", usage: "unknown", channelCount: 2, sidecar: "not_enabled_by_this_collector" });
  const first = await runFullMeteringCollection({ ...f.options, mode: "initialize" });
  assert.equal(first.recordedBytes, 0); assert.equal(first.channelCount, 3); assert.equal(f.writes.length, 0);
  assert.equal(f.checkpoint().meteringScope, SCOPE);
  f.now = T1; f.value += 5;
  const next = await runFullMeteringCollection({ ...f.options, mode: "collect" });
  assert.equal(next.recordedBytes, 30); assert.equal(next.sampleCount, 3);
  assert.equal(f.writes.every(row => CHANNELS.some(source => source.channelRef === row.record.channelRef)), true);
});
test("three-source failure leaves checkpoint and new samples untouched", async t => {
  const f = fixture(t); await runFullMeteringCollection({ ...f.options, mode: "initialize" });
  const before = readFileSync(join(f.directory, "checkpoint.json")); f.now = T1; f.value += 5;
  for (const mutate of [rows => rows.slice(1), rows => [rows[0], rows[0], rows[2]], rows => [...rows, { ...FULL_METERING_CHANNELS[1] }]]) {
    await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", readSources: async () => mutate(await f.options.readSources()) }), /source_scope_invalid/);
  }
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", readSources: async () => { throw new Error("synthetic_source_failure"); } }), /synthetic_source_failure/);
  assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), before); assert.equal(f.writes.length, 0);
});
test("explicit scope rejects out-of-scope inventory rather than silently filtering it", async t => {
  const f = fixture(t); f.entries.push({ ...f.entries[0], channelRef: FULL_METERING_CHANNELS[1].channelRef });
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "initialize" }), /binding_invalid/);
  assert.equal(existsSync(f.directory), false); assert.equal(f.reads, 0);
});
test("scope/context mismatch stops before inventory, source reads or pending recovery", async t => {
  const f = fixture(t);
  for (const change of [{ context: legacyContext }, { meteringScope: "full-five-v1" }, { meteringScope: "unsupported" }]) {
    await assert.rejects(runFullMeteringCollection({ ...f.options, ...change, mode: "initialize" }), /scope|context/);
  }
  assert.equal(f.reads, 0); assert.equal(f.writes.length, 0); assert.equal(existsSync(f.directory), false);
});
test("old five-source checkpoint and durable pending cannot be consumed by local scope", async t => {
  const f = fixture(t, false); await runFullMeteringCollection({ ...f.options, mode: "initialize" });
  f.now = T1; f.value += 5;
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", onStage: stage => { if (stage === "pending_durable") throw new Error("crash"); } }), /crash/);
  const pending = readFileSync(join(f.directory, "pending.json"));
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", meteringScope: SCOPE, context }), /context_changed|checkpoint_scope/);
  assert.equal(f.writes.length, 0); assert.deepEqual(readFileSync(join(f.directory, "pending.json")), pending);
});
test("pending next-checkpoint scope is validated before applying its samples", async t => {
  const f = fixture(t); await runFullMeteringCollection({ ...f.options, mode: "initialize" });
  f.now = T1; f.value += 5;
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect", onStage: stage => { if (stage === "pending_durable") throw new Error("crash"); } }), /crash/);
  const path = join(f.directory, "pending.json"), envelope = JSON.parse(readFileSync(path));
  delete envelope.payload.nextCheckpoint.meteringScope;
  envelope.digest = fullMeteringDigest({ version: envelope.version, context: envelope.context, payload: envelope.payload });
  writeFileSync(path, JSON.stringify(envelope));
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "collect" }), /checkpoint_scope/);
  assert.equal(f.writes.length, 0); assert.equal(existsSync(path), true);
  assert.throws(() => recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.options.applySamples }), /checkpoint_scope/);
  assert.equal(f.writes.length, 0);
});

test("local scope rejects a five-channel inventory declaration even if its entries were filtered", async t => {
  const f = fixture(t);
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "initialize", readInventory: () => ({ ...f.options.readInventory(),
    channelRefs: FULL_METERING_CHANNELS.map(source => source.channelRef) }) }), /binding_invalid/);
  assert.equal(f.reads, 0);
});

test("local billing-window continuation refuses a full-scope approval", async t => {
  const f = fixture(t); await runFullMeteringCollection({ ...f.options, mode: "initialize" });
  const previous = f.checkpoint(), binding = f.entries[0], previousIdentityDigest = fullMeteringDigest(fullMeteringBindingIdentity(binding));
  binding.billingBinding.validUntil = "2028-10-01T00:00:00.000Z"; f.now = T1; f.value += 5;
  const approval = { version: 1, activationId: f.options.activationId, context, previousSequence: previous.sequence,
    previousCheckpointDigest: fullMeteringDigest(previous), notBefore: T0, expiresAt: "2026-10-07T01:00:00.000Z",
    changes: [{ channelRef: binding.channelRef, edgeCredentialRef: binding.edgeCredentialRef, previousIdentityDigest, currentIdentityDigest: fullMeteringDigest(fullMeteringBindingIdentity(binding)) }] };
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-billing-window", billingWindowApproval: { ...approval, context: legacyContext } }), /approval_invalid/);
  assert.equal((await runFullMeteringCollection({ ...f.options, mode: "continue-billing-window", billingWindowApproval: approval })).recordedBytes, 20);
});
test("local material continuation stays in the same approved scope", async t => {
  const f = fixture(t); await runFullMeteringCollection({ ...f.options, mode: "initialize" });
  const previous = f.checkpoint(), binding = f.entries[0], previousIdentityDigest = fullMeteringDigest(fullMeteringBindingIdentity(binding));
  binding.materialDigest = "sha256:rotated-synthetic"; f.now = T1; f.value += 5;
  const approval = { version: 1, activationId: f.options.activationId, context, previousSequence: previous.sequence,
    previousCheckpointDigest: fullMeteringDigest(previous), notBefore: T0, expiresAt: "2026-10-07T01:00:00.000Z",
    changes: [{ channelRef: binding.channelRef, edgeCredentialRef: binding.edgeCredentialRef, previousIdentityDigest, currentIdentityDigest: fullMeteringDigest(fullMeteringBindingIdentity(binding)) }] };
  await assert.rejects(runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: { ...approval, context: legacyContext } }), /approval_invalid/);
  const result = await runFullMeteringCollection({ ...f.options, mode: "continue-material", materialApproval: approval });
  assert.equal(result.sampleCount, 2); assert.equal(result.recordedBytes, 20);
  f.now = T2; f.value += 1;
  assert.equal((await runFullMeteringCollection({ ...f.options, mode: "collect" })).recordedBytes, 6);
});
test("scoped sample writer rejects valid foreign activation and deferred channel before even duplicate lookup", t => {
  const f = fixture(t);
  let reads = 0;
  const writer = createFullMeteringSampleWriter({ meteringScope: SCOPE, activationId: "three-new-activation", database: {},
    controlStore: { getUsageSampleByDigest: () => { reads++; } }, readBindings: () => ({ entries: [] }) });
  for (const changes of [{ activationId: "old-five" }, { binding: { ...f.entries[0], channelRef: FULL_METERING_CHANNELS[1].channelRef } }]) {
    const sample = makeFullMeteringSample({ activationId: "three-new-activation", binding: f.entries[0], generation: "c".repeat(64),
      delta: { uploadBytes: 1, downloadBytes: 1, totalBytes: 2, intervalStartedAt: T0, intervalEndedAt: T1 }, ...changes });
    assert.throws(() => writer([sample]), /sample_scope_invalid/);
  }
  assert.equal(reads, 0);
});
