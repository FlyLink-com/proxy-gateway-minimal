import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { initializeFullMeteringJournal, readFullMeteringJournal, commitFullMeteringJournal, recoverFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";

const START = "2026-09-08T06:00:00.000Z", FIRST = "2026-09-08T06:00:01.000Z";
const NEXT = "2026-09-08T06:01:00.000Z", LATER = "2026-09-08T06:02:00.000Z";
const context = { databaseIdentityDigest: "d".repeat(64), scopeDigest: "e".repeat(64) };
const activationId = "synthetic-full-crash";
const generation = "f".repeat(64);
const priorCheckpoint = { version: 1, sequence: 0, marker: "synthetic-before" };
const nextCheckpoint = { version: 1, sequence: 1, marker: "synthetic-after" };
const bindings = FULL_METERING_CHANNELS.map((source, index) => ({
  sourceRef: source.sourceRef, channelRef: source.channelRef, edgeCredentialRef: `synthetic-ref-${index}`,
  accountId: `synthetic-account-${index}`, entitlementId: `synthetic-entitlement-${index}`,
  requestId: `synthetic-request-${index}`, materialDigest: `sha256:synthetic-material-${index}`,
  billingBinding: { plan: "yearly", validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2027-09-01T00:00:00.000Z" }
}));

function fixture(t, initializeJournal = true) {
  const parent = mkdtempSync(join(tmpdir(), "full-metering-real-crash-"));
  const dbPath = join(parent, "synthetic.sqlite"), directory = join(parent, "journal");
  let db, store;
  let currentBindings = structuredClone(bindings);
  const f = { parent, dbPath, directory, get db() { return db; }, get store() { return store; },
    open() {
      db = new Database(dbPath);
      store = createSqliteSubscriptionControlStore({ database: db });
    }, close() { if (db?.open) db.close(); }, setBindings(value) { currentBindings = value; },
    write(samples) { return createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: currentBindings }) })(samples); }
  };
  f.open();
  t.after(() => { f.close(); rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });
  for (const binding of bindings) {
    store.createAccount({ id: binding.accountId, ownerRef: `owner-${binding.accountId}`, status: "active", createdAt: START, updatedAt: START });
    store.createEntitlement({ id: binding.entitlementId, accountId: binding.accountId, plan: "yearly", status: "active",
      validFrom: binding.billingBinding.validFrom, validUntil: binding.billingBinding.validUntil, trafficLimitBytes: 1000000, createdAt: START, updatedAt: START });
    store.createIssuanceRequest({ id: binding.requestId, accountId: binding.accountId, entitlementId: binding.entitlementId,
      status: "issued", approvalRef: "synthetic-approval", quantity: 1, nodeId: binding.channelRef, purpose: "synthetic-test",
      requestedByRef: "synthetic-test", createdAt: START, updatedAt: START });
  }
  if (initializeJournal) initializeFullMeteringJournal({ directory, context, checkpoint: priorCheckpoint });
  return f;
}
function sample(binding) {
  return makeFullMeteringSample({ binding, activationId, generation,
    delta: { uploadBytes: 3, downloadBytes: 7, totalBytes: 10, intervalStartedAt: START, intervalEndedAt: NEXT } });
}
const batch = () => bindings.slice(0, 2).map(sample);
const rightsTables = ["platform_accounts", "platform_entitlements", "platform_issuance_requests", "platform_issued_subscription_links", "platform_portal_access_requests", "platform_portal_edge_credentials", "platform_usage_counter_cursors"];
function rights(f) { return Object.fromEntries(rightsTables.map(name => [name, f.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()])); }
function assertLedger(f, expectedCount, expectedBytes) {
  const samples = f.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total_bytes),0) AS bytes FROM platform_usage_samples").get();
  const rollups = f.db.prepare("SELECT COALESCE(SUM(total_bytes),0) AS bytes FROM platform_usage_rollups").get();
  assert.deepEqual(samples, { n: expectedCount, bytes: expectedBytes });
  assert.equal(rollups.bytes, expectedBytes);
  assert.equal(f.db.pragma("integrity_check", { simple: true }), "ok");
}
const recovery = f => recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.write });
const commit = (f, extra = {}) => commitFullMeteringJournal({ directory: f.directory, context, previousCheckpoint: priorCheckpoint,
  nextCheckpoint, samples: batch(), applySamples: f.write, ...extra });

for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`automatic thirty-day retention and SQLite recovery preserve usage at ${stage}`, async t => {
    const f = fixture(t, false), beforeRights = rights(f);
    let now = START, value = 1000, present = true, connectionValue = 1000;
    const options = { directory: f.directory, context, activationId, nowFn: () => now,
      readInventory: () => ({ entries: bindings, retainedBindings: [] }), applySamples: f.write,
      readSources: async () => FULL_METERING_CHANNELS.map((source, index) => ({ ...source, generation, observedAt: now,
        observations: source.mode === "connections" && !present ? [] : [{ edgeCredentialRef: bindings[index].edgeCredentialRef,
          uploadBytes: source.mode === "connections" ? connectionValue : value,
          downloadBytes: source.mode === "connections" ? connectionValue : value,
          ...(source.mode === "connections" ? { connectionId: "synthetic-retention" } : {}) }] })) };
    await runFullMeteringCollection({ ...options, mode: "initialize" });
    now = NEXT; value = connectionValue = 1005;
    await runFullMeteringCollection({ ...options, mode: "collect" });
    assertLedger(f, 5, 50);
    now = LATER; present = false;
    await runFullMeteringCollection({ ...options, mode: "collect" });
    const before = readFullMeteringJournal({ directory: f.directory, context });
    assert.equal(before.sources.at(-1).counterState.connectionHistory.count, 1);
    now = new Date(Date.parse(LATER) + 30 * 86400000 + 1).toISOString();
    present = true; connectionValue = 99000;
    await assert.rejects(runFullMeteringCollection({ ...options, mode: "collect", onStage(value) {
      if (value === stage) throw new Error("synthetic_retention_interrupt");
    } }), /synthetic_retention_interrupt/);
    assert.equal(recovery(f).recovered, true);
    const after = readFullMeteringJournal({ directory: f.directory, context });
    assert.equal(after.sequence, before.sequence + 1);
    assert.equal(after.sources.at(-1).counterState.connectionHistory.count, 0);
    assert.deepEqual(after.sources.at(-1).counterState.entries[0].usage, before.sources.at(-1).counterState.entries[0].usage);
    assertLedger(f, 5, 50);
    assert.equal(recovery(f).recovered, false);
    assert.equal((await runFullMeteringCollection({ ...options, mode: "collect" })).sampleCount, 0);
    now = new Date(Date.parse(now) + 60000).toISOString(); value += 3; connectionValue += 3;
    assert.equal((await runFullMeteringCollection({ ...options, mode: "collect" })).recordedBytes, 30);
    assertLedger(f, 10, 80);
    assert.deepEqual(rights(f), beforeRights);
  });
}

function crashChild(f, stage) {
  // A separate Node process exits without running a finally/close at an actual
  // journal failpoint. Only an owned disposable SQLite DB and journal are used.
  const code = `
    import Database from "better-sqlite3";
    import { createSqliteSubscriptionControlStore } from ${JSON.stringify(new URL("../services/platform/subscription-control-db.mjs", import.meta.url).href)};
    import { createFullMeteringSampleWriter } from ${JSON.stringify(new URL("../../scripts/lib/full-metering-sample-writer.mjs", import.meta.url).href)};
    import { commitFullMeteringJournal } from ${JSON.stringify(new URL("../../scripts/lib/full-metering-journal.mjs", import.meta.url).href)};
    const db = new Database(process.argv[1]);
    const store = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
    const applySamples = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries: ${JSON.stringify(bindings)} }) });
    commitFullMeteringJournal({ directory: process.argv[2], context: ${JSON.stringify(context)},
      previousCheckpoint: ${JSON.stringify(priorCheckpoint)}, nextCheckpoint: ${JSON.stringify(nextCheckpoint)},
      samples: ${JSON.stringify(batch())}, applySamples,
      onStage(value) { if (value === process.argv[3]) process.exit(86); } });
    process.exit(87);
  `;
  f.close();
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code, f.dbPath, f.directory, stage],
    { encoding: "utf8", timeout: 20000, windowsHide: true, cwd: new URL("../../", import.meta.url) });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 86, result.stderr);
  assert.equal(result.stdout, "");
  f.open();
}

for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`real SQLite and filesystem recover exactly once after process exit at ${stage}`, t => {
    const f = fixture(t), beforeRights = rights(f);
    const schema = f.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all();
    crashChild(f, stage);
    assert.equal(existsSync(join(f.directory, "pending.json")), true);
    const count = stage === "pending_durable" ? 0 : 2;
    assertLedger(f, count, count * 10);
    assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, stage === "checkpoint_durable" ? 1 : 0);
    assert.equal(recovery(f).recovered, true);
    assertLedger(f, 2, 20);
    assert.deepEqual(readFullMeteringJournal({ directory: f.directory, context }), nextCheckpoint);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
    assert.equal(recovery(f).recovered, false);
    assertLedger(f, 2, 20);
    assert.deepEqual(rights(f), beforeRights);
    assert.deepEqual(f.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all(), schema);
  });
}

test("real SQLite rolls back the first insert and rollup when a later insert fails", t => {
  const f = fixture(t), beforeRights = rights(f);
  f.db.exec(`CREATE TRIGGER synthetic_reject_second BEFORE INSERT ON platform_usage_samples
    WHEN NEW.edge_credential_ref = 'synthetic-ref-1' BEGIN SELECT RAISE(ABORT,'synthetic_second_insert_failure'); END`);
  assert.throws(() => commit(f), /synthetic_second_insert_failure/);
  assertLedger(f, 0, 0);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
  assert.equal(existsSync(join(f.directory, "pending.json")), true);
  f.close(); f.open();
  assertLedger(f, 0, 0);
  f.db.exec("DROP TRIGGER synthetic_reject_second");
  assert.equal(recovery(f).recovered, true);
  assertLedger(f, 2, 20);
  assert.deepEqual(rights(f), beforeRights);
});

test("real committed samples finalize the journal after expiry without new writes or reauthorization", t => {
  const f = fixture(t);
  crashChild(f, "samples_committed");
  f.setBindings([]);
  const beforeSamples = f.store.listUsageSamples();
  const beforeRights = rights(f);
  assert.equal(recovery(f).recovered, true);
  assert.deepEqual(f.store.listUsageSamples(), beforeSamples);
  assert.deepEqual(rights(f), beforeRights);
  assertLedger(f, 2, 20);
});

test("uncommitted expired identities cannot use a retained intent to bypass current ownership checks", t => {
  const f = fixture(t), beforeRights = rights(f);
  crashChild(f, "pending_durable");
  f.setBindings([]);
  assert.throws(() => recovery(f), /binding_changed/);
  assertLedger(f, 0, 0);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
  assert.equal(existsSync(join(f.directory, "pending.json")), true);
  assert.deepEqual(rights(f), beforeRights);
});

test("real conflicting sample digest blocks journal recovery without adding usage", t => {
  const f = fixture(t), beforeRights = rights(f);
  crashChild(f, "pending_durable");
  f.store.recordUsageSample({ ...batch()[0].record, uploadBytes: 4, downloadBytes: 6 });
  const prior = f.store.listUsageSamples();
  assert.throws(() => recovery(f), /sample_collision/);
  assert.deepEqual(f.store.listUsageSamples(), prior);
  assertLedger(f, 1, 10);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).sequence, 0);
  assert.deepEqual(rights(f), beforeRights);
});

test("real five-source collection admits distinct fetch times, then archives expiry without extra billing", async t => {
  const f = fixture(t, false), beforeRights = rights(f);
  let clock = START, observationTime = FIRST, bytes = 1000;
  let active = structuredClone(bindings), retained = [];
  const readSources = async () => {
    const snapshots = FULL_METERING_CHANNELS.map((source, index) => ({ ...source, generation,
      observedAt: new Date(Date.parse(observationTime) + index).toISOString(),
      observations: [{ edgeCredentialRef: bindings[index].edgeCredentialRef, uploadBytes: bytes, downloadBytes: bytes,
        ...(source.mode === "connections" ? { connectionId: "synthetic-connection" } : {}) }] }));
    clock = new Date(Date.parse(observationTime) + 1000).toISOString();
    return snapshots;
  };
  const options = { directory: f.directory, context, activationId, nowFn: () => clock,
    readInventory: () => ({ entries: active, retainedBindings: retained }), readSources,
    applySamples: samples => f.write(samples) };
  const initialized = await runFullMeteringCollection({ ...options, mode: "initialize" });
  assert.equal(initialized.sampleCount, 0);
  assert.equal(readFullMeteringJournal({ directory: f.directory, context }).startedAt, START);
  assertLedger(f, 0, 0);
  clock = NEXT; observationTime = NEXT; bytes = 1005;
  const second = await runFullMeteringCollection({ ...options, mode: "collect" });
  assert.equal(second.recordedBytes, 50); assertLedger(f, 5, 50);
  retained = [active[0]]; active = active.slice(1); f.setBindings(active);
  clock = LATER; observationTime = LATER; bytes = 1010;
  const third = await runFullMeteringCollection({ ...options, mode: "collect" });
  assert.equal(third.recordedBytes, 40); assertLedger(f, 9, 90);
  const checkpoint = readFullMeteringJournal({ directory: f.directory, context });
  assert.equal(checkpoint.sources[0].counterState.retiredEntries.length, 1);
  assert.equal(checkpoint.sources[0].counterState.retiredEntries[0].usage.uploadBytes, 5);
  assert.equal(checkpoint.sources[0].counterState.retiredEntries[0].cursor.uploadBytes, 1005);
  assert.deepEqual(rights(f), beforeRights);
  assert.equal(existsSync(join(f.directory, "pending.json")), false);
});

test("unverified historical source timestamps reject before writing any baseline or database row", async t => {
  const f = fixture(t, false), beforeRights = rights(f);
  await assert.rejects(runFullMeteringCollection({ directory: f.directory, context, activationId, mode: "initialize", nowFn: () => NEXT,
    readInventory: () => ({ entries: bindings, retainedBindings: [] }), applySamples: f.write,
    readSources: async () => FULL_METERING_CHANNELS.map((source, index) => ({ ...source, generation, observedAt: FIRST,
      observations: [{ edgeCredentialRef: bindings[index].edgeCredentialRef, uploadBytes: 1000, downloadBytes: 1000,
        ...(source.mode === "connections" ? { connectionId: "synthetic-connection" } : {}) }] })) }), /counter_input_invalid/);
  assert.equal(existsSync(f.directory), false);
  assertLedger(f, 0, 0);
  assert.deepEqual(rights(f), beforeRights);
});
