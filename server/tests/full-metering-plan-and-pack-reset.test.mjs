import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { fullMeteringChannels, FULL_METERING_SCOPE, LOCAL_METERING_SCOPE } from "../../scripts/lib/full-metering-scope.mjs";
import { createFullMeteringSampleWriter } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringDigest as digest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";

const start = "2026-10-01T00:00:00.000Z", first = "2026-10-01T00:01:00.000Z";
const changedAt = "2026-10-01T00:01:30.000Z", switched = "2026-10-01T00:02:00.000Z";
const basic = "offerv_plan_30d_50gb_monthly_v1", plus = "offerv_plan_30d_100gb_monthly_v1";
const activationId = "synthetic-combined-continuation";

function fixture(t, { scope = FULL_METERING_SCOPE, mode = "cumulative", sameSource = true } = {}) {
  const channels = fullMeteringChannels(scope), packSource = channels.find(source => source.mode === mode);
  const planSource = sameSource ? packSource : channels.find(source => source !== packSource);
  const parent = mkdtempSync(join(tmpdir(), "combined-metering-")), directory = join(parent, "journal");
  const db = new Database(join(parent, "synthetic.sqlite")), control = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => { db.close(); rmSync(parent, { recursive: true, force: true, maxRetries: 3 }); });
  const context = { databaseIdentityDigest: "a".repeat(64), scopeDigest: "b".repeat(64),
    ...(scope === LOCAL_METERING_SCOPE ? { meteringScope: scope } : {}) };
  const entries = [], retained = [];
  function add(source, ref, pack = false) {
    const billingBinding = { plan: pack ? "offerv_pack_100gb_v1" : basic, validFrom: start,
      validUntil: pack ? "9999-12-31T23:59:59.999Z" : "2026-10-31T00:00:00.000Z" };
    const entry = { channelRef: source.channelRef, sourceRef: source.sourceRef, edgeCredentialRef: ref,
      accountId: `acct-${ref}`, entitlementId: `ent-${ref}`, requestId: `req-${ref}`,
      billingBinding, materialDigest: `sha256:${"c".repeat(64)}` };
    control.createAccount({ id: entry.accountId, ownerRef: `owner-${ref}`, status: "active", createdAt: start, updatedAt: start });
    control.createEntitlement({ id: entry.entitlementId, accountId: entry.accountId, ...billingBinding, status: "active",
      trafficLimitBytes: 100 * 1024 ** 3, createdAt: start, updatedAt: start });
    control.createIssuanceRequest({ id: entry.requestId, accountId: entry.accountId, entitlementId: entry.entitlementId,
      status: "issued", approvalRef: "synthetic", quantity: 1, nodeId: source.channelRef, purpose: "synthetic",
      requestedByRef: "synthetic", createdAt: start, updatedAt: start });
    entries.push(entry); return entry;
  }
  channels.forEach((source, i) => add(source, `peer-${i}`));
  const plan = add(planSource, "plan"), pack = add(packSource, "pack", true);
  const proof = { version: 1, rotationRef: "packrot_combined", orderRef: "order_combined", accountId: pack.accountId,
    requestRef: pack.requestId, entitlementRef: pack.entitlementId, edgeChannelRef: pack.channelRef,
    edgeCredentialRef: pack.edgeCredentialRef, oldEdgeMaterialDigest: pack.materialDigest,
    newEdgeMaterialDigest: `sha256:${"d".repeat(64)}`, billingBinding: { ...pack.billingBinding },
    quotaBytes: 100 * 1024 ** 3, exhausted: false };
  const receipts = new Map();
  // Synthetic authority ports only; real SQLite sample writer, counter transition
  // and durable journal. Actual control-store reset proof/receipt tests are separate.
  const f = { directory, entries, retained, pack, plan, proof, receipts, context, channels,
    now: start, value: 100, packValue: 100, generation: "e".repeat(64), proofCalls: 0, resetReads: 0,
    proofs: [], denyPlan: false, driftPlan: false, driftReset: false, failReceipt: false,
    checkpoint: () => readFullMeteringJournal({ directory, context }),
    bytes: () => readFileSync(join(directory, "checkpoint.json")),
    ledger: () => db.prepare("SELECT count(*) AS count, COALESCE(sum(total_bytes),0) AS bytes FROM platform_usage_samples").get(),
    samples: () => db.prepare("SELECT edge_credential_ref AS ref, total_bytes AS bytes FROM platform_usage_samples ORDER BY rowid").all(),
    inventory: () => ({ entries: structuredClone(entries), retainedBindings: structuredClone(retained) }),
    async run(mode = "collect-pack-resets", extra = {}) {
      return runFullMeteringCollection({ directory, context, activationId, mode, meteringScope: scope,
        nowFn: () => f.now, readInventory: f.inventory,
        readSources: async () => channels.map(source => ({ ...source, generation: f.generation, observedAt: f.now,
          observations: [...entries, ...retained].filter(entry => entry.channelRef === source.channelRef).map(entry => ({
            edgeCredentialRef: entry.edgeCredentialRef,
            uploadBytes: entry === pack ? f.packValue : f.value, downloadBytes: entry === pack ? f.packValue : f.value,
            ...(source.mode === "connections" ? { connectionId: `conn-${entry.edgeCredentialRef}` } : {}) })) })),
        readPlanSwitchProof: ({ previousIdentity, currentIdentity }) => {
          f.proofCalls++; assert.equal(currentIdentity.edgeCredentialRef, "plan");
          return f.denyPlan ? { ok: false } : { ok: true, proof: { version: 1, kind: "commerce_billing_chain",
            fromIdentityDigest: digest(previousIdentity), toIdentityDigest: digest(currentIdentity),
            evidenceDigest: (f.driftPlan && f.proofCalls > 1 ? "f" : "b").repeat(64), transitionCount: 1,
            changedAt: f.changedAt ?? changedAt } };
        },
        dataPackResetStore: {
          readCoinCommerceDataPackMeteringResetProofs: () => {
            f.resetReads++; return f.driftReset && f.resetReads > 1 ? [] : structuredClone(f.proofs);
          },
          getCoinCommerceDataPackMeteringResetReceipt: ({ rotationRef }) => receipts.get(rotationRef) ?? null,
          recordCoinCommerceDataPackMeteringResetReceipt: ({ proof: p, continuation }) => {
            if (f.failReceipt) throw new Error("synthetic_receipt_failure");
            receipts.set(p.rotationRef, { version: 1, proof: structuredClone(p), continuation: structuredClone(continuation) });
          }
        },
        applySamples: createFullMeteringSampleWriter({ database: db, controlStore: control,
          meteringScope: scope, activationId, readBindings: f.inventory }), ...extra });
    },
    async seed() { await f.run("initialize"); f.now = first; f.value = f.packValue = 110; await f.run("collect"); },
    change() { f.now = switched; f.value = 150; f.packValue = 3; f.proofs = [proof];
      plan.billingBinding.plan = plus; pack.materialDigest = proof.newEdgeMaterialDigest; }
  };
  return f;
}

for (const scope of [FULL_METERING_SCOPE, LOCAL_METERING_SCOPE]) for (const mode of ["cumulative", "connections"]) {
  for (const sameSource of [true, false]) test(`combined ${scope}/${mode}/same-source=${sameSource} preserves usage and baselines both changes`, async t => {
    const f = fixture(t, { scope, mode, sameSource }); await f.seed(); const before = f.checkpoint(), ledger = f.ledger(); f.change();
    const result = await f.run();
    assert.equal(result.recordedBytes, f.channels.length * 80);
    assert.equal(result.sampleCount, f.channels.length);
    assert.equal(result.planSwitchContinuation.identityCount, 1);
    assert.equal(result.dataPackResetContinuation.identityCount, 1);
    assert.equal(result.historicalDebits, false); assert.equal(f.proofCalls, 2);
    const after = f.checkpoint(); assert.equal(after.sequence, before.sequence + 1);
    assert.equal(after.planSwitchContinuations.length, 1); assert.equal(after.dataPackResetContinuations.length, 1);
    assert.equal(after.planSwitchContinuations[0].previousCheckpointDigest, after.dataPackResetContinuations[0].continuation.previousCheckpointDigest);
    for (const ref of ["plan", "pack"]) {
      const old = before.sources.flatMap(source => source.counterState.entries).find(entry => entry.edgeCredentialRef === ref);
      const current = after.sources.flatMap(source => source.counterState.entries).find(entry => entry.edgeCredentialRef === ref);
      assert.deepEqual(current.usage, old.usage);
    }
    assert.deepEqual(f.ledger(), { count: ledger.count + f.channels.length, bytes: ledger.bytes + result.recordedBytes });
    assert.ok(f.samples().slice(ledger.count).every(sample => sample.ref.startsWith("peer-")));
    assert.equal(f.receipts.size, 1); assert.equal((await f.run()).recordedBytes, 0);
    f.now = "2026-10-01T00:03:00.000Z"; f.value += 7; f.packValue += 7;
    assert.equal((await f.run()).recordedBytes, (f.channels.length + 2) * 14);
  });
}

for (const kind of ["missing-plan-reader", "unproven-plan", "unproven-reset", "overlap", "owner-drift", "plan-material-drift", "plan-proof-drift", "reset-proof-drift"]) {
  test(`combined rejects ${kind} without journal or accounting mutation`, async t => {
    const f = fixture(t); await f.seed(); const bytes = f.bytes(), ledger = f.ledger(); f.change();
    const extra = {};
    if (kind === "missing-plan-reader") extra.readPlanSwitchProof = undefined;
    if (kind === "unproven-plan") f.denyPlan = true;
    if (kind === "unproven-reset") f.proofs = [];
    if (kind === "overlap") f.pack.billingBinding.plan = "offerv_pack_200gb_v1";
    if (kind === "owner-drift") f.pack.accountId = f.plan.accountId;
    if (kind === "plan-material-drift") f.plan.materialDigest = f.proof.newEdgeMaterialDigest;
    if (kind === "plan-proof-drift") f.driftPlan = true;
    if (kind === "reset-proof-drift") f.driftReset = true;
    await assert.rejects(f.run("collect-pack-resets", extra), /full_metering_(binding_changed|plan_switch_unproven|plan_switch_evidence_changed)/);
    assert.deepEqual(f.bytes(), bytes); assert.deepEqual(f.ledger(), ledger);
    assert.equal(f.receipts.size, 0); assert.equal(existsSync(join(f.directory, "pending.json")), false);
  });
}

for (const stage of ["pending_durable", "samples_committed", "checkpoint_durable", "receipt"]) {
  test(`combined ${stage} interruption recovers once without repeated debit or baseline`, async t => {
    const f = fixture(t, { scope: LOCAL_METERING_SCOPE }); await f.seed(); const ledger = f.ledger(); f.change();
    if (stage === "receipt") f.failReceipt = true;
    await assert.rejects(f.run("collect-pack-resets", { onStage(actual) { if (actual === stage) throw new Error("synthetic_crash"); } }), /synthetic_/);
    f.failReceipt = false;
    assert.equal((await f.run()).status, "reset_receipts_recovered");
    assert.equal(f.checkpoint().sequence, 2); assert.equal(f.receipts.size, 1);
    assert.deepEqual(f.ledger(), { count: ledger.count + f.channels.length, bytes: ledger.bytes + f.channels.length * 80 });
    assert.equal(existsSync(join(f.directory, "pending.json")), false);
    assert.equal((await f.run()).recordedBytes, 0);
    assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
    assert.equal(f.checkpoint().dataPackResetContinuations.length, 1);
  });
}

test("ordinary collection still cannot authorize a pack reset", async t => {
  const f = fixture(t); await f.seed(); const bytes = f.bytes(); f.change();
  await assert.rejects(f.run("collect"), /full_metering_plan_switch_unproven/); assert.deepEqual(f.bytes(), bytes);
});

for (const mode of ["cumulative", "connections"]) test(`combined ${mode} supports proven reactivation and leaves old usage intact`, async t => {
  const f = fixture(t, { mode }); await f.seed();
  f.now = switched; f.value = f.packValue = 120;
  f.entries.splice(f.entries.indexOf(f.plan), 1); f.retained.push(f.plan); await f.run("collect");
  const retired = f.checkpoint().sources.flatMap(source => source.counterState.retiredEntries).find(entry => entry.edgeCredentialRef === "plan");
  f.entries.push(...f.retained.splice(0)); f.change();
  f.now = "2026-10-01T00:03:00.000Z"; f.changedAt = "2026-10-01T00:02:30.000Z";
  assert.equal((await f.run()).recordedBytes, f.channels.length * 60);
  const active = f.checkpoint().sources.flatMap(source => source.counterState.entries).find(entry => entry.edgeCredentialRef === "plan");
  assert.deepEqual(active.usage, retired.usage);
});

test("independently verified generation change baselines both changes without old debits", async t => {
  const f = fixture(t); await f.seed(); f.change(); f.generation = "f".repeat(64); f.value = f.packValue = 1;
  assert.equal((await f.run()).recordedBytes, 0);
  assert.equal(f.checkpoint().dataPackResetContinuations.length, 1);
  assert.equal(f.checkpoint().planSwitchContinuations.length, 1);
});

test("pack collection also admits a proven plan change when no pack is rotating", async t => {
  const f = fixture(t); await f.seed(); f.now = switched; f.value = f.packValue = 150;
  f.plan.billingBinding.plan = plus;
  assert.equal((await f.run()).recordedBytes, (f.channels.length + 1) * 80);
  assert.equal(f.checkpoint().dataPackResetContinuations, undefined);
});

test("combined precommit inventory drift stops without a pending batch", async t => {
  const f = fixture(t); await f.seed(); const bytes = f.bytes(), ledger = f.ledger(); f.change();
  let reads = 0;
  await assert.rejects(f.run("collect-pack-resets", { readInventory() {
    if (++reads === 3) f.pack.materialDigest = `sha256:${"f".repeat(64)}`;
    return f.inventory();
  } }), /full_metering_binding_changed/);
  assert.deepEqual(f.bytes(), bytes); assert.deepEqual(f.ledger(), ledger);
  assert.equal(existsSync(join(f.directory, "pending.json")), false);
});
