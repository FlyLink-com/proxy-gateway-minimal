import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { fullMeteringChannels, LOCAL_METERING_SCOPE } from "../../scripts/lib/full-metering-scope.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { createFullMeteringSampleWriter, fullMeteringBindingIdentity } from "../../scripts/lib/full-metering-sample-writer.mjs";
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
  const f = { directory, db, bindings, now: start, value: 1000, proofCalls: 0, deny: false, generation: "f".repeat(64),
    checkpoint: () => readFullMeteringJournal({ directory, context }),
    ledger: () => db.prepare("SELECT count(*) AS count, COALESCE(sum(total_bytes),0) AS bytes FROM platform_usage_samples").get(),
    rights: () => ["platform_accounts", "platform_entitlements", "platform_issuance_requests", "platform_usage_counter_cursors"]
      .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    proof(request) {
      f.proofCalls++;
      assert.equal(request.notBefore, first);
      if (f.deny) return { ok: false, reason: "synthetic_unproven" };
      return { ok: true, proof: { version: 1, kind: "commerce_billing_chain",
        fromIdentityDigest: fullMeteringDigest(request.previousIdentity), toIdentityDigest: fullMeteringDigest(request.currentIdentity),
        evidenceDigest: "b".repeat(64), transitionCount: 1, changedAt } };
    },
    snapshots() { return channels.map(source => ({ ...source, generation: f.generation, observedAt: f.now,
      observations: bindings.filter(entry => entry.channelRef === source.channelRef).map(entry => ({ edgeCredentialRef: entry.edgeCredentialRef,
        uploadBytes: f.value, downloadBytes: f.value, ...(source.mode === "connections" ? { connectionId: `connection-${entry.edgeCredentialRef}` } : {}) })) })); },
    async run(mode = "collect", extra = {}) {
      return runFullMeteringCollection({ directory, context, activationId, meteringScope: LOCAL_METERING_SCOPE, mode,
        nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(bindings), retainedBindings: [] }),
        readSources: async () => f.snapshots(), readPlanSwitchProof: request => f.proof(request),
        applySamples: createFullMeteringSampleWriter({ database: db, controlStore: store, meteringScope: LOCAL_METERING_SCOPE,
          activationId, readBindings: () => ({ entries: bindings }) }), ...extra });
    },
    async seed() { await f.run("initialize"); f.now = first; f.value += 10; await f.run(); },
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
