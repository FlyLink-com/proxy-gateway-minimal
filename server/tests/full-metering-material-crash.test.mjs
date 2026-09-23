import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { FULL_METERING_CHANNELS, runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSampleWriter, fullMeteringBindingIdentity } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest, readFullMeteringJournal, recoverFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { sanitizeSourceValidationChildEnvironment } from "../../scripts/source-validation-test-runner.mjs";

const START = "2026-09-24T06:00:00.000Z";
const FIRST = "2026-09-24T06:01:00.000Z";
const ROTATED = "2026-09-24T06:02:00.000Z";
const LATER = "2026-09-24T06:03:00.000Z";
const context = { databaseIdentityDigest: "d".repeat(64), scopeDigest: "e".repeat(64) };
const activationId = "synthetic-material-crash";
const generation = "f".repeat(64);
const rightsTables = ["platform_accounts", "platform_entitlements", "platform_issuance_requests",
  "platform_issued_subscription_links", "platform_portal_access_requests", "platform_portal_edge_credentials",
  "platform_usage_counter_cursors"];

function fixture(t, selectedIndex) {
  const parent = mkdtempSync(join(tmpdir(), "full-metering-material-crash-"));
  const dbPath = join(parent, "synthetic.sqlite"), directory = join(parent, "journal");
  // The extra identity shares the changed source: preserving other channels
  // alone would not catch an accidental source-wide counter rebaseline.
  const bindings = [...FULL_METERING_CHANNELS, FULL_METERING_CHANNELS[selectedIndex]].map((source, index) => ({
    sourceRef: source.sourceRef, channelRef: source.channelRef, edgeCredentialRef: `synthetic-ref-${index}`,
    accountId: `synthetic-account-${index}`, entitlementId: `synthetic-entitlement-${index}`,
    requestId: `synthetic-request-${index}`, materialDigest: `sha256:${String(index + 1).repeat(64)}`,
    billingBinding: { plan: "yearly", validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2027-09-01T00:00:00.000Z" }
  }));
  let db, store, now = START;
  const values = bindings.map(() => 1000);
  const generations = FULL_METERING_CHANNELS.map(() => generation);
  const f = {
    parent, dbPath, directory, bindings, values, generations, selectedIndex,
    get db() { return db; },
    get now() { return now; },
    open() {
      db = new Database(dbPath);
      store = createSqliteSubscriptionControlStore({ database: db });
    },
    close() { if (db?.open) db.close(); },
    write(samples) {
      return createFullMeteringSampleWriter({ database: db, controlStore: store,
        readBindings: () => ({ entries: bindings }) })(samples);
    },
    set(time, bytes) { now = time; values.fill(bytes); },
    snapshots() {
      return FULL_METERING_CHANNELS.map((source, sourceIndex) => ({ ...source, generation: generations[sourceIndex], observedAt: now,
        observations: bindings.flatMap((binding, index) => binding.channelRef !== source.channelRef ? [] : [{
          edgeCredentialRef: binding.edgeCredentialRef, uploadBytes: values[index], downloadBytes: values[index],
          ...(source.mode === "connections" ? { connectionId: `synthetic-connection-${index}` } : {})
        }]) }));
    },
    run(mode, extra = {}) {
      return runFullMeteringCollection({ directory, context, activationId, mode, nowFn: () => now,
        readInventory: () => ({ entries: bindings, retainedBindings: [] }),
        readSources: async () => f.snapshots(), applySamples: f.write, ...extra });
    },
    checkpoint: () => readFullMeteringJournal({ directory, context }),
    rights: () => Object.fromEntries(rightsTables.map(name => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()])),
    samples: () => db.prepare("SELECT * FROM platform_usage_samples ORDER BY id").all(),
    schema: () => db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all()
  };
  f.open();
  t.after(() => { f.close(); rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });
  for (const binding of bindings) {
    store.createAccount({ id: binding.accountId, ownerRef: `owner-${binding.accountId}`, status: "active", createdAt: START, updatedAt: START });
    store.createEntitlement({ id: binding.entitlementId, accountId: binding.accountId, plan: "yearly", status: "active",
      validFrom: binding.billingBinding.validFrom, validUntil: binding.billingBinding.validUntil,
      trafficLimitBytes: 1000000, createdAt: START, updatedAt: START });
    store.createIssuanceRequest({ id: binding.requestId, accountId: binding.accountId, entitlementId: binding.entitlementId,
      status: "issued", approvalRef: "synthetic-approval", quantity: 1, nodeId: binding.channelRef,
      purpose: "synthetic-test", requestedByRef: "synthetic-test", createdAt: START, updatedAt: START });
  }
  return f;
}

for (const [kind, selectedIndex] of [["cumulative", 0], ["connections", 4]]) {
  test(`${kind} material continuation with a real source restart baselines every identity in that source`, async t => {
    const f = fixture(t, selectedIndex), initialRights = f.rights(), initialSchema = f.schema();
    await f.run("initialize");
    f.set(FIRST, 1005);
    await f.run("collect");
    assertLedger(f, 6, 60);
    const oldSamples = f.samples(), before = f.checkpoint(), approval = rotate(f);
    f.generations[selectedIndex] = "b".repeat(64);
    f.values[selectedIndex] = 1;
    f.values[5] = 200000;
    const continued = await f.run("continue-material", { materialApproval: approval });
    // Only the four unchanged sources can contribute 3+3 bytes. Both users of
    // the restarted source baseline, even though just one has changed material.
    assert.equal(continued.recordedBytes, 24);
    assert.equal(continued.sampleCount, 4);
    assert.equal(continued.channels[selectedIndex].generationUnassignedGap.unassignedBytes, null);
    assertLedger(f, 10, 84);
    const restarted = f.checkpoint().sources[selectedIndex].counterState;
    const priorState = before.sources[selectedIndex].counterState;
    assert.equal(restarted.generation, f.generations[selectedIndex]);
    assert.equal(restarted.generationArchives.length, 1);
    const archive = restarted.generationArchives[0];
    if (kind === "cumulative") {
      assert.equal(archive.snapshot.stateDigest, priorState.stateDigest);
      assert.deepEqual(archive.snapshot.entries, priorState.entries);
    } else {
      assert.equal(archive.sourceStateDigest, priorState.stateDigest);
      assert.deepEqual(archive.entries, priorState.entries.map(({ edgeCredentialRef, usage }) => ({ edgeCredentialRef, usage })));
    }
    const samplesById = new Map(f.samples().map(sample => [sample.id, sample]));
    for (const sample of oldSamples) assert.deepEqual(samplesById.get(sample.id), sample);
    for (const index of [selectedIndex, 5]) {
      assert.equal(f.db.prepare("SELECT total_bytes FROM platform_usage_rollups WHERE edge_credential_ref=?")
        .get(f.bindings[index].edgeCredentialRef).total_bytes, 10);
    }
    f.set(LATER, 1011);
    f.values[selectedIndex] = 4;
    f.values[5] = 200003;
    assert.equal((await f.run("collect")).recordedBytes, 36);
    assertLedger(f, 16, 120);
    assert.deepEqual(f.rights(), initialRights);
    assert.deepEqual(f.schema(), initialSchema);
  });
}

function assertLedger(f, count, bytes) {
  assert.deepEqual(f.db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_bytes),0) AS bytes FROM platform_usage_samples").get(), { count, bytes });
  assert.equal(f.db.prepare("SELECT COALESCE(SUM(total_bytes),0) AS bytes FROM platform_usage_rollups").get().bytes, bytes);
  assert.equal(f.db.pragma("integrity_check", { simple: true }), "ok");
}

function rotate(f) {
  const before = f.checkpoint(), binding = f.bindings[f.selectedIndex];
  const oldIdentity = fullMeteringBindingIdentity(binding);
  f.set(ROTATED, 1008);
  f.values[f.selectedIndex] = 99000;
  binding.materialDigest = `sha256:${"a".repeat(64)}`;
  return { version: 1, activationId, context, previousSequence: before.sequence,
    previousCheckpointDigest: fullMeteringDigest(before), notBefore: ROTATED, expiresAt: LATER,
    changes: [{ channelRef: binding.channelRef, edgeCredentialRef: binding.edgeCredentialRef,
      previousIdentityDigest: fullMeteringDigest(oldIdentity),
      currentIdentityDigest: fullMeteringDigest(fullMeteringBindingIdentity(binding)) }] };
}

function crashChild(f, stage, approval) {
  // The child exits at the actual durability boundary without finally/DB close.
  // All inputs are generated synthetic facts in this test's private directory.
  const code = `
    import Database from "better-sqlite3";
    import { createSqliteSubscriptionControlStore } from ${JSON.stringify(new URL("../services/platform/subscription-control-db.mjs", import.meta.url).href)};
    import { createFullMeteringSampleWriter } from ${JSON.stringify(new URL("../../scripts/lib/full-metering-sample-writer.mjs", import.meta.url).href)};
    import { runFullMeteringCollection } from ${JSON.stringify(new URL("../../scripts/lib/full-metering-collection.mjs", import.meta.url).href)};
    const db = new Database(process.argv[1]);
    const store = createSqliteSubscriptionControlStore({ database: db, initializeSchema: false });
    const entries = ${JSON.stringify(f.bindings)};
    const applySamples = createFullMeteringSampleWriter({ database: db, controlStore: store, readBindings: () => ({ entries }) });
    await runFullMeteringCollection({ directory: process.argv[2], context: ${JSON.stringify(context)},
      activationId: ${JSON.stringify(activationId)}, mode: "continue-material", materialApproval: ${JSON.stringify(approval)},
      nowFn: () => ${JSON.stringify(f.now)}, readInventory: () => ({ entries, retainedBindings: [] }),
      readSources: async () => ${JSON.stringify(f.snapshots())}, applySamples,
      onStage(value) { if (value === process.argv[3]) process.exit(86); } });
    process.exit(87);
  `;
  f.close();
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code, f.dbPath, f.directory, stage], {
    encoding: "utf8", timeout: 20000, windowsHide: true, cwd: new URL("../../", import.meta.url),
    env: sanitizeSourceValidationChildEnvironment()
  });
  f.open();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 86, result.stderr);
  assert.equal(result.stdout, "");
}

const crashCases = [["cumulative", 0], ["connections", 4]].flatMap(([kind, selectedIndex]) =>
  ["pending_durable", "samples_committed", "checkpoint_durable"].map(stage => [kind, selectedIndex, stage]));
for (const [kind, selectedIndex, stage] of crashCases) {
  test(`${kind} material continuation survives process exit at ${stage} without rebilling history or changing rights`, async t => {
    const f = fixture(t, selectedIndex);
    const initialRights = f.rights(), initialSchema = f.schema();
    await f.run("initialize");
    f.set(FIRST, 1005);
    await f.run("collect");
    assertLedger(f, 6, 60);
    const oldSamples = f.samples(), before = f.checkpoint(), approval = rotate(f);
    await assert.rejects(f.run("collect"), { code: "full_metering_binding_changed" });
    assert.deepEqual(f.checkpoint(), before);
    assert.deepEqual(f.samples(), oldSamples);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);

    crashChild(f, stage, approval);
    assert.equal(existsSync(join(f.directory, "pending.json")), true);
    const durableIntent = JSON.parse(readFileSync(join(f.directory, "pending.json")));
    assert.deepEqual(durableIntent.payload.nextCheckpoint.materialContinuations[0].approval, approval);
    assertLedger(f, stage === "pending_durable" ? 6 : 11, stage === "pending_durable" ? 60 : 90);
    assert.equal(f.checkpoint().sequence, stage === "checkpoint_durable" ? before.sequence + 1 : before.sequence);
    await assert.rejects(f.run("collect"), { code: "full_metering_locked" });
    // Explicit fixture recovery after confirmed child exit. Source code must
    // never remove a stale lock automatically; this empty directory is owned
    // exclusively by this test and rmdir cannot delete non-empty contents.
    rmdirSync(join(f.directory, "writer.lock"));
    const recover = () => recoverFullMeteringJournal({ directory: f.directory, context, applySamples: f.write });
    assert.equal(recover().recovered, true);
    assertLedger(f, 11, 90);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
    assert.equal(recover().recovered, false);
    const continued = f.checkpoint();
    assert.equal(continued.sequence, before.sequence + 1);
    assert.equal(continued.startedAt, before.startedAt);
    assert.equal(continued.materialContinuations.length, 1);
    assert.equal(continued.materialContinuations[0].previousCheckpointDigest, fullMeteringDigest(before));
    assert.equal(continued.materialContinuations[0].unassignedBytes, null);
    assert.deepEqual(continued.materialContinuations[0].approval, approval);
    assert.equal(fullMeteringDigest(continued.materialContinuations[0].approval), continued.materialContinuations[0].approvalDigest);
    const archivePath = join(f.directory, continued.materialContinuations[0].archiveName);
    const archiveBytes = readFileSync(archivePath);
    assert.deepEqual(JSON.parse(archiveBytes).payload, before);
    assert.deepEqual(continued.lastSummary.materialContinuation, { identityCount: 1, unassignedBytes: null });
    const samplesById = new Map(f.samples().map(sample => [sample.id, sample]));
    for (const sample of oldSamples) assert.deepEqual(samplesById.get(sample.id), sample);
    assert.equal(f.db.prepare("SELECT total_bytes FROM platform_usage_rollups WHERE edge_credential_ref=?").get(f.bindings[selectedIndex].edgeCredentialRef).total_bytes, 10);
    assert.deepEqual(f.rights(), initialRights);
    assert.deepEqual(f.schema(), initialSchema);
    await assert.rejects(f.run("continue-material", { materialApproval: approval }));
    assert.deepEqual(f.checkpoint(), continued);
    assertLedger(f, 11, 90);
    assert.equal((await f.run("collect")).sampleCount, 0);
    f.set(LATER, 1011);
    f.values[selectedIndex] = 99003;
    assert.equal((await f.run("collect")).recordedBytes, 36);
    assertLedger(f, 17, 126);
    assert.deepEqual(f.checkpoint().materialContinuations, continued.materialContinuations);
    assert.deepEqual(f.checkpoint().materialContinuations[0].approval.changes, approval.changes);
    assert.deepEqual(readFileSync(archivePath), archiveBytes);
    assert.deepEqual(f.rights(), initialRights);
    assert.deepEqual(f.schema(), initialSchema);
  });
}
