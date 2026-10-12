import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { fullMeteringChannels, LOCAL_METERING_SCOPE } from "../../scripts/lib/full-metering-scope.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";

const start = "2026-10-01T00:00:00.000Z", first = "2026-10-01T00:01:00.000Z";
const changedAt = "2026-10-01T00:01:30.000Z", switched = "2026-10-01T00:02:00.000Z", later = "2026-10-01T00:03:00.000Z";
const basic = "offerv_plan_30d_50gb_monthly_v1", plus = "offerv_plan_30d_100gb_monthly_v1";
const channels = fullMeteringChannels(LOCAL_METERING_SCOPE);
const context = { databaseIdentityDigest: "d".repeat(64), scopeDigest: "e".repeat(64), meteringScope: LOCAL_METERING_SCOPE };
const activationId = "synthetic-plan-continuation";

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "plan-continuation-")), directory = join(parent, "journal");
  const db = new Database(join(parent, "synthetic.sqlite"));
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => { db.close(); rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });
  for (const n of [0, 1]) {
    store.createAccount({ id: `account-${n}`, ownerRef: `owner-${n}`, status: "active", createdAt: start, updatedAt: start });
    store.createEntitlement({ id: `ent-${n}`, accountId: `account-${n}`, plan: basic, status: "active",
      validFrom: start, validUntil: "2026-10-31T00:00:00.000Z", trafficLimitBytes: 1000000, createdAt: start, updatedAt: start });
    store.createIssuanceRequest({ id: `request-${n}`, accountId: `account-${n}`, entitlementId: `ent-${n}`, status: "issued",
      approvalRef: "synthetic", quantity: 1, nodeId: channels[0].channelRef, purpose: "synthetic", requestedByRef: "synthetic", createdAt: start, updatedAt: start });
  }
  const bindings = channels.flatMap((source, i) => [0, 1].map(n => ({ ...source, edgeCredentialRef: `synthetic-${i}-${n}`,
    accountId: `account-${n}`, entitlementId: `ent-${n}`, requestId: `request-${n}`, materialDigest: `sha256:${"a".repeat(64)}`,
    billingBinding: { plan: basic, validFrom: start, validUntil: "2026-10-31T00:00:00.000Z" } })));
  const f = { directory, db, bindings, retained: [], now: start, value: 1000, proofCalls: 0, deny: false, generation: "f".repeat(64),
    checkpoint: () => readFullMeteringJournal({ directory, context }),
    ledger: () => db.prepare("SELECT count(*) AS count, COALESCE(sum(total_bytes),0) AS bytes FROM platform_usage_samples").get(),
    rights: () => ["platform_accounts", "platform_entitlements", "platform_issuance_requests", "platform_usage_counter_cursors"]
      .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    proof(request) {
      f.proofCalls++;
      assert.equal(request.notBefore, f.proofNotBefore ?? first);
      if (f.deny) return { ok: false, reason: "synthetic_unproven" };
      return { ok: true, proof: { version: 1, kind: "commerce_billing_chain",
        fromIdentityDigest: fullMeteringDigest(request.previousIdentity), toIdentityDigest: fullMeteringDigest(request.currentIdentity),
        evidenceDigest: "b".repeat(64), transitionCount: 1, changedAt: f.proofChangedAt ?? changedAt } };
    },
    snapshots() { return channels.map(source => ({ ...source, generation: f.generation, observedAt: f.now,
      observations: [...bindings, ...f.retained].filter(entry => entry.channelRef === source.channelRef).map(entry => ({ edgeCredentialRef: entry.edgeCredentialRef,
        uploadBytes: f.value, downloadBytes: f.value, ...(source.mode === "connections" ? { connectionId: `connection-${entry.edgeCredentialRef}` } : {}) })) })); },
    async run(mode = "collect", extra = {}) {
      return runFullMeteringCollection({ directory, context, activationId, meteringScope: LOCAL_METERING_SCOPE, mode,
        nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(bindings), retainedBindings: structuredClone(f.retained) }),
        readSources: async () => f.snapshots(), readPlanSwitchProof: request => f.proof(request),
        applySamples: createFullMeteringSampleWriter({ database: db, controlStore: store, meteringScope: LOCAL_METERING_SCOPE,
          activationId, readBindings: () => ({ entries: bindings }) }), ...extra });
    },
    async seed() { await f.run("initialize"); f.now = first; f.value += 10; await f.run(); },
    async retire() {
      f.now = switched; f.value += 5;
      for (let index = bindings.length - 1; index >= 0; index--) {
        if (bindings[index].accountId === "account-0") f.retained.push(...bindings.splice(index, 1));
      }
      await f.run();
    },
    reactivate() {
      f.proofNotBefore = switched; f.proofChangedAt = "2026-10-01T00:02:30.000Z";
      f.now = later; f.value += 5000;
      bindings.push(...f.retained.splice(0).map(entry => ({ ...entry, billingBinding: { ...entry.billingBinding, plan: plus } })));
    },
    change() { f.now = switched; f.value += 5000;
      bindings.filter(entry => entry.accountId === "account-0").forEach(entry => { entry.billingBinding.plan = plus; }); }
  };
  return f;
}

test("verified plan-only change baselines exactly the three affected identities and preserves SQLite history", async t => {
  const f = fixture(t); await f.seed(); const before = f.checkpoint(), ledger = f.ledger(), rights = f.rights(); f.change();
  const result = await f.run();
  assert.equal(result.planSwitchContinuation.identityCount, 3);
  assert.equal(result.planSwitchContinuation.unassignedBytes, null);
  assert.equal(result.recordedBytes, 30000); // Only the unchanged account's ordinary deltas.
  assert.equal(result.sampleCount, 3); assert.equal(result.historicalDebits, false);
  assert.deepEqual(f.ledger(), { count: ledger.count + 3, bytes: ledger.bytes + 30000 });
  assert.deepEqual(f.rights(), rights);
  const after = f.checkpoint(); assert.equal(after.sequence, before.sequence + 1);
  assert.equal(after.planSwitchContinuations.length, 1);
  assert.equal(existsSync(join(f.directory, after.planSwitchContinuations[0].archiveName)), true);
  for (let i = 0; i < 3; i++) assert.deepEqual(after.sources[i].counterState.entries[0].usage, before.sources[i].counterState.entries[0].usage);
  assert.equal(f.proofCalls, 6); // Admission and pre-commit evidence recheck.
  assert.equal((await f.run()).recordedBytes, 0); assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
  f.now = later; f.value += 3;
  assert.equal((await f.run()).recordedBytes, 36);
  assert.deepEqual(f.rights(), rights);
  assert.equal(f.db.pragma("integrity_check", { simple: true }), "ok");
});

for (const kind of ["no reader", "unproven", "wrong digest", "old proof", "material", "account", "request", "entitlement", "source", "evidence drift", "inventory drift"]) {
  test(`plan continuation rejects ${kind} without durable mutation`, async t => {
    const f = fixture(t); await f.seed(); const checkpoint = readFileSync(join(f.directory, "checkpoint.json")), ledger = f.ledger(); f.change();
    const extra = {};
    if (kind === "no reader") extra.readPlanSwitchProof = undefined;
    if (kind === "unproven") f.deny = true;
    if (["wrong digest", "old proof", "evidence drift"].includes(kind)) {
      extra.readPlanSwitchProof = request => { const response = f.proof(request);
        if (kind === "wrong digest") response.proof.toIdentityDigest = "0".repeat(64);
        if (kind === "old proof") response.proof.changedAt = start;
        if (kind === "evidence drift" && f.proofCalls > 3) response.proof.evidenceDigest = "0".repeat(64);
        return response;
      };
    }
    if (kind === "material") f.bindings[0].materialDigest = `sha256:${"c".repeat(64)}`;
    if (kind === "account") f.bindings[0].accountId = "other";
    if (kind === "request") f.bindings[0].requestId = "other";
    if (kind === "entitlement") f.bindings[0].entitlementId = "other";
    if (kind === "source") f.bindings[0].sourceRef = "other";
    if (kind === "inventory drift") extra.readSources = async () => { const result = f.snapshots(); f.bindings[0].billingBinding.validUntil = "2026-11-30T00:00:00.000Z"; return result; };
    await assert.rejects(f.run("collect", extra), /full_metering_(plan_switch|binding)/);
    assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), checkpoint);
    assert.deepEqual(f.ledger(), ledger);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
  });
}

for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`plan continuation recovers ${stage} exactly once without charging the changed account's gap`, async t => {
    const f = fixture(t); await f.seed(); f.change();
    await assert.rejects(f.run("collect", { onStage(value) { if (value === stage) throw new Error("synthetic_interruption"); } }), /synthetic_interruption/);
    assert.equal(existsSync(join(f.directory, "pending.json")), true);
    assert.equal((await f.run()).recordedBytes, 0);
    assert.deepEqual(f.ledger(), { count: 9, bytes: 30120 });
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
    assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
    f.now = later; f.value += 3; assert.equal((await f.run()).recordedBytes, 36);
    assert.deepEqual(f.ledger(), { count: 15, bytes: 30156 });
  });
}

test("plan change with a verified process generation boundary preserves usage without any gap debit", async t => {
  const f = fixture(t); await f.seed(); const before = f.ledger(); f.change(); f.generation = "c".repeat(64); f.value = 2;
  assert.equal((await f.run()).recordedBytes, 0); assert.deepEqual(f.ledger(), before);
  assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
  f.now = later; f.value += 3; assert.equal((await f.run()).recordedBytes, 36);
});

test("concurrent collector refuses the same journal while a plan boundary is in flight", async t => {
  const f = fixture(t); await f.seed(); f.change();
  const result = await f.run("collect", { readSources: async () => {
    await assert.rejects(f.run(), /full_metering_locked/); return f.snapshots();
  } });
  assert.equal(result.planSwitchContinuation.identityCount, 3);
});

test("proven retained plan identities resume without losing history or charging their absence", async t => {
  const f = fixture(t); await f.seed(); await f.retire();
  const previous = f.checkpoint(), ledger = f.ledger(), rights = f.rights();
  assert.equal(previous.sources.every(source => source.counterState.retainedRefs.length === 1), true);
  f.reactivate();
  const result = await f.run();
  assert.equal(result.planSwitchContinuation.identityCount, 3);
  assert.equal(result.recordedBytes, 30000); // Only the continuously active peer.
  assert.deepEqual(f.ledger(), { count: ledger.count + 3, bytes: ledger.bytes + 30000 });
  for (const source of f.checkpoint().sources) {
    const archived = previous.sources.find(item => item.channelRef === source.channelRef).counterState.retiredEntries[0];
    assert.deepEqual(source.counterState.entries.find(entry => entry.edgeCredentialRef === archived.edgeCredentialRef).usage, archived.usage);
  }
  assert.deepEqual(f.rights(), rights);
  assert.equal(existsSync(join(f.directory, f.checkpoint().planSwitchContinuations[0].archiveName)), true);
  const recorded = f.ledger();
  assert.equal((await f.run()).recordedBytes, 0);
  assert.deepEqual(f.ledger(), recorded);
  assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
  assert.equal(existsSync(join(f.directory, "pending.json")), false);
  f.now = "2026-10-01T00:04:00.000Z"; f.value += 3;
  assert.equal((await f.run()).recordedBytes, 36);
  assert.equal(f.db.pragma("integrity_check", { simple: true }), "ok");
});

for (const kind of ["no proof", "material drift", "unproven peer", "proof drift"]) {
  test(`retained plan recovery rejects ${kind} without modifying samples or checkpoint`, async t => {
    const f = fixture(t); await f.seed(); await f.retire();
    const checkpoint = readFileSync(join(f.directory, "checkpoint.json")), ledger = f.ledger();
    f.reactivate(); const extra = {};
    if (kind === "no proof") f.deny = true;
    if (kind === "material drift") f.bindings.find(entry => entry.accountId === "account-0").materialDigest = "changed-material";
    if (kind === "unproven peer") extra.readPlanSwitchProof = request => request.currentIdentity.channelRef === channels[1].channelRef
      ? { ok: false } : f.proof(request);
    if (kind === "proof drift") extra.readPlanSwitchProof = request => {
      const response = f.proof(request); if (f.proofCalls > 3) response.proof.evidenceDigest = "c".repeat(64); return response;
    };
    await assert.rejects(f.run("collect", extra), /full_metering_plan_switch/);
    assert.deepEqual(readFileSync(join(f.directory, "checkpoint.json")), checkpoint);
    assert.deepEqual(f.ledger(), ledger);
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
  });
}

for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable"]) {
  test(`retained plan recovery survives ${stage} without duplicate peer samples or lost usage`, async t => {
    const f = fixture(t); await f.seed(); await f.retire(); const ledger = f.ledger(); f.reactivate();
    await assert.rejects(f.run("collect", { onStage(value) { if (value === stage) throw new Error("synthetic_reactivation_interruption"); } }), /synthetic_reactivation_interruption/);
    assert.equal(existsSync(join(f.directory, "pending.json")), true);
    assert.equal((await f.run()).recordedBytes, 0);
    assert.deepEqual(f.ledger(), { count: ledger.count + 3, bytes: ledger.bytes + 30000 });
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
    assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
    f.now = "2026-10-01T00:04:00.000Z"; f.value += 3;
    assert.equal((await f.run()).recordedBytes, 36);
  });
}
