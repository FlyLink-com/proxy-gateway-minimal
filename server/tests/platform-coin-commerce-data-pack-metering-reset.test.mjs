import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { packFixture, NOW } from "./full-metering-data-pack-bindings.fixture.mjs";
import { syntheticMeteringContinuation } from "./platform-coin-commerce-data-pack-metering-reset.fixture.mjs";

function resetFixture(t) {
  const f = packFixture(t);
  let next = 0;
  function reset(pack = f.pack(), { applied = true, rotationRef } = {}) {
    const id = ++next;
    const input = { accountId: pack.accountId, orderRef: pack.orderRef, rotationRef: rotationRef || `packreset_meter_${id}` };
    const leaseRef = `packresetlease_meter_${id}`;
    f.control.beginCoinCommerceDataPackCredentialReset({ ...input, now: NOW });
    f.control.claimCoinCommerceDataPackCredentialReset({ ...input, leaseRef, now: NOW });
    for (const stage of ["staged", "control_switched", "material_committed"]) {
      f.control.advanceCoinCommerceDataPackCredentialReset({ ...input, leaseRef, stage, now: NOW,
        ...(stage === "staged" ? { newEdgeMaterialDigest: `sha256:${"f".repeat(64)}` } : {}) });
    }
    const result = { pack, input, leaseRef, id };
    if (applied) apply(result);
    return result;
  }
  function apply(value) {
    const desired = f.control.getLatestEdgeDesiredStateForChannel(value.pack.channelRef);
    f.control.recordEdgeDesiredStateNotification({ id: `notify_meter_reset_${value.id}`,
      nodeRef: value.pack.channelRef, channelRef: value.pack.channelRef,
      desiredStateRef: desired.desiredStateRef, generation: desired.generation,
      reason: "coin_commerce_data_pack_credential_reset", status: "pending", createdAt: NOW, updatedAt: NOW });
    f.control.recordEdgeApplyReceipt({ id: `receipt_meter_reset_${value.id}`, channelRef: value.pack.channelRef,
      desiredStateRef: desired.desiredStateRef, status: "applied", configTestOk: true,
      serviceActive: true, listenerUdp443: true, appliedAt: NOW, createdAt: NOW });
    f.control.advanceCoinCommerceDataPackCredentialReset({ ...value.input, leaseRef: value.leaseRef,
      stage: "edge_applied", now: NOW });
  }
  function finishArtifact(value) {
    const leaseRef = "artifact_meter_reset_lease";
    f.control.beginCoinCommerceDataPackArtifactRotation({ ...value.input, now: NOW });
    f.control.claimCoinCommerceDataPackArtifactRotation({ ...value.input, leaseRef, now: NOW });
    for (const stage of ["escrowed", "switched", "complete"]) {
      f.control.advanceCoinCommerceDataPackArtifactRotation({ ...value.input, leaseRef, stage, now: NOW,
        ...(stage === "escrowed" ? { replacementArtifactRef: "artifact_reset_replacement" } : {}) });
    }
    f.control.releaseCoinCommerceDataPackArtifactRotation({ ...value.input, leaseRef });
  }
  return { ...f, reset, apply, finishArtifact,
    proofs: () => f.control.readCoinCommerceDataPackMeteringResetProofs({ now: NOW }) };
}

test("only an exact edge-applied reset authorizes a stable read-only metering proof", t => {
  const f = resetFixture(t);
  const value = f.reset(undefined, { applied: false });
  assert.deepEqual(f.proofs(), []);
  f.apply(value);
  const changes = f.db.prepare("select total_changes() as count").get().count;
  const [proof] = f.proofs();
  assert.equal(proof.version, 1);
  assert.equal(proof.rotationRef, value.input.rotationRef);
  assert.equal(proof.requestRef, value.pack.requestId);
  assert.equal(proof.entitlementRef, value.pack.entitlementId);
  assert.equal(proof.quotaBytes, value.pack.quotaBytes);
  assert.equal(proof.exhausted, false);
  assert.deepEqual(proof.billingBinding, { plan: "offerv_pack_100gb_v1",
    validFrom: "2026-09-29T00:00:00.000Z", validUntil: "9999-12-31T23:59:59.999Z" });
  assert(Object.isFrozen(proof)); assert(Object.isFrozen(proof.billingBinding));
  assert.deepEqual(f.proofs(), [proof]);
  assert.equal(f.db.prepare("select total_changes() as count").get().count, changes);
});

test("a deterministic reset receipt is replay-safe and neither clears usage nor completes the reset", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const get = () => f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW });
  assert.equal(get(), null);
  const continuation = syntheticMeteringContinuation(proof);
  const record = () => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  const receipt = record();
  assert.deepEqual(record(), receipt); assert.deepEqual(get(), receipt);
  assert.deepEqual(receipt, { version: 1, proof, continuation });
  assert.equal(f.control.beginCoinCommerceDataPackCredentialReset({ ...value.input, now: NOW }).status, "edge_applied");
  assert.equal(f.db.prepare("select count(*) as count from platform_usage_samples").get().count, 0);
  assert.throws(() => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof,
    continuation: { ...continuation, identityDigest: "a".repeat(64) }, now: NOW }),
  { code: "reconciliation_required" });
});

test("receipt persists across a file-backed store restart with exact replay and no duplicate audit", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  const receipt = f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  const directory = mkdtempSync(join(tmpdir(), "pack-meter-reset-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "synthetic.sqlite");
  writeFileSync(dbPath, f.db.serialize());
  const reopened = createSqliteSubscriptionControlStore({ dbPath });
  try {
    assert.deepEqual(reopened.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), receipt);
    assert.deepEqual(reopened.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }), receipt);
    assert.equal(reopened.beginCoinCommerceDataPackCredentialReset({ ...value.input, now: NOW }).status, "edge_applied");
  } finally { reopened.close(); }
  assert.equal(f.db.prepare("select count(*) as count from platform_audit_events where action='data_pack_metering_reset_completed'").get().count, 1);
});

for (const [name, discriminator] of [
  ["legacy full-five", {}], ["explicit local-three", { meteringScope: "local-three-v1" }]
]) test(`real reset receipt persists ${name} context and refuses cross-scope replay`, t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  Object.assign(continuation.context, discriminator);
  const receipt = f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  const directory = mkdtempSync(join(tmpdir(), "pack-meter-scope-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "synthetic.sqlite");
  writeFileSync(dbPath, f.db.serialize());
  const reopened = createSqliteSubscriptionControlStore({ dbPath });
  try {
    assert.deepEqual(reopened.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), receipt);
    assert.deepEqual(reopened.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }), receipt);
    const changedScope = { ...continuation, context: { ...continuation.context } };
    if (Object.hasOwn(discriminator, "meteringScope")) delete changedScope.context.meteringScope;
    else changedScope.context.meteringScope = "local-three-v1";
    assert.throws(() => reopened.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation: changedScope, now: NOW }),
      { code: "reconciliation_required" });
    for (const field of ["scopeDigest", "databaseIdentityDigest"]) {
      assert.throws(() => reopened.recordCoinCommerceDataPackMeteringResetReceipt({ proof,
        continuation: { ...continuation, context: { ...continuation.context, [field]: "a".repeat(64) } }, now: NOW }),
      { code: "reconciliation_required" });
    }
    assert.deepEqual(reopened.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), receipt);
    assert.equal(reopened.beginCoinCommerceDataPackCredentialReset({ ...value.input, now: NOW }).status, "edge_applied");
  } finally { reopened.close(); }
  assert.equal(f.db.prepare("select count(*) as count from platform_audit_events where action='data_pack_metering_reset_completed'").get().count, 1);
  assert.equal(f.db.prepare("select count(*) as count from platform_usage_samples").get().count, 0);
});

for (const [name, change] of [
  ["missing digest", context => { delete context.scopeDigest; }],
  ["unknown scope", context => { context.meteringScope = "unknown"; }],
  ["explicit full-five discriminator", context => { context.meteringScope = "full-five-v1"; }],
  ["undefined scope", context => { context.meteringScope = undefined; }],
  ["extra field", context => { context.extra = true; }],
  ["symbol field", context => { context[Symbol("unapproved")] = true; }],
  ["non-enumerable scope", context => { Object.defineProperty(context, "meteringScope", { value: "local-three-v1" }); }],
  ["scope accessor", (context, getter) => { Object.defineProperty(context, "meteringScope", { enumerable: true, get: getter }); }],
  ["digest accessor", (context, getter) => { Object.defineProperty(context, "scopeDigest", { enumerable: true, get: getter }); }]
]) test(`real reset receipt rejects context ${name} without executing accessors or writing an audit`, t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  let getterCalls = 0;
  change(continuation.context, () => { getterCalls += 1; return "local-three-v1"; });
  assert.throws(() => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }),
    { code: "reconciliation_required" });
  assert.equal(getterCalls, 0);
  assert.equal(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), null);
  assert.equal(f.control.beginCoinCommerceDataPackCredentialReset({ ...value.input, now: NOW }).status, "edge_applied");
  assert.equal(f.db.prepare("select count(*) as count from platform_audit_events where action='data_pack_metering_reset_completed'").get().count, 0);
});

test("real reset receipt rejects proxy context before invoking traps or writing an audit", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  let trapCalls = 0;
  const trap = () => { trapCalls += 1; throw new Error("proxy trap must not run"); };
  continuation.context = new Proxy(continuation.context,
    { get: trap, getOwnPropertyDescriptor: trap, ownKeys: trap, getPrototypeOf: trap });
  assert.throws(() => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }),
    { code: "reconciliation_required" });
  assert.equal(trapCalls, 0);
  assert.equal(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), null);
});

test("private continuation proof never enters account summary even when a rotation ref equals an account ref", t => {
  const f = resetFixture(t), pack = f.pack();
  const value = f.reset(pack, { rotationRef: pack.accountId }), [proof] = f.proofs();
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation: syntheticMeteringContinuation(proof), now: NOW });
  assert.equal(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }).proof.rotationRef, pack.accountId);
  const summary = f.control.getAccountControlSummary(pack.accountId);
  assert.equal(summary.auditEvents.some(event => event.entityType === "coin_commerce_data_pack_metering_reset"), false);
  assert.doesNotMatch(JSON.stringify(summary), /previousCheckpointDigest|proofDigest|databaseIdentityDigest/);
});

test("proof ignores non-boundary usage increments but exhausted proof requires matching absent runtime receipt", t => {
  const f = resetFixture(t), value = f.reset(), [before] = f.proofs();
  const sample = (id, bytes) => f.control.recordUsageSample({ id, sourceRef: "synthetic_reset_meter",
    channelRef: value.pack.channelRef, edgeCredentialRef: value.pack.edgeCredentialRef,
    accountId: value.pack.accountId, entitlementId: value.pack.entitlementId, requestId: value.pack.requestId,
    observedAt: "2026-09-29T00:00:01.000Z", intervalStartedAt: "2026-09-29T00:00:01.000Z",
    intervalEndedAt: "2026-09-29T00:00:01.000Z", uploadBytes: bytes,
    downloadBytes: 0, sampleDigest: id, createdAt: NOW });
  sample("sample_meter_before_quota", 27);
  assert.deepEqual(f.proofs(), [before]);
  sample("sample_meter_at_quota", value.pack.quotaBytes - 27);
  assert.throws(() => f.proofs(), { code: "reconciliation_required" });
  // A second current desired state has removed the exhausted principal.
  f.apply({ ...value, id: 99 });
  const [proof] = f.proofs();
  assert.equal(proof.exhausted, true);
  assert.deepEqual({ ...proof, exhausted: false }, before);
  const totals = f.db.prepare("select sum(total_bytes) as used from platform_usage_samples").get();
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation: syntheticMeteringContinuation(proof), now: NOW });
  assert.deepEqual(f.db.prepare("select sum(total_bytes) as used from platform_usage_samples").get(), totals);
  assert.equal(totals.used, value.pack.quotaBytes);
});

test("an acknowledged boundary proof survives natural exhaustion without authorizing a second transition", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  const receipt = f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  f.control.recordUsageSample({ id: "sample_after_meter_ack", sourceRef: "synthetic_reset_meter",
    channelRef: value.pack.channelRef, edgeCredentialRef: value.pack.edgeCredentialRef,
    accountId: value.pack.accountId, entitlementId: value.pack.entitlementId, requestId: value.pack.requestId,
    observedAt: "2026-09-29T00:00:01.000Z", intervalStartedAt: "2026-09-29T00:00:01.000Z",
    intervalEndedAt: "2026-09-29T00:00:01.000Z", uploadBytes: value.pack.quotaBytes,
    downloadBytes: 0, sampleDigest: "sample_after_meter_ack", createdAt: NOW });
  assert.deepEqual(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), receipt);
  assert.deepEqual(f.proofs(), [proof]); // Keep the original boundary, never rewrite it to exhausted:true.
  assert.deepEqual(f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }), receipt);
  assert.equal(f.db.prepare("select count(*) as count from platform_audit_events where action='data_pack_metering_reset_completed'").get().count, 1);
  f.finishArtifact(value);
  assert.equal(f.control.advanceCoinCommerceDataPackCredentialReset({ ...value.input,
    leaseRef: value.leaseRef, stage: "complete", now: NOW }).status, "complete");
  assert.deepEqual(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), receipt);
});

test("an exhausted acknowledged boundary never becomes unexhausted after ledger drift", t => {
  const f = resetFixture(t), value = f.reset(undefined, { applied: false });
  f.control.recordUsageSample({ id: "sample_before_exhausted_ack", sourceRef: "synthetic_reset_meter",
    channelRef: value.pack.channelRef, edgeCredentialRef: value.pack.edgeCredentialRef,
    accountId: value.pack.accountId, entitlementId: value.pack.entitlementId, requestId: value.pack.requestId,
    observedAt: "2026-09-29T00:00:01.000Z", intervalStartedAt: "2026-09-29T00:00:01.000Z",
    intervalEndedAt: "2026-09-29T00:00:01.000Z", uploadBytes: value.pack.quotaBytes,
    downloadBytes: 0, sampleDigest: "sample_before_exhausted_ack", createdAt: NOW });
  f.apply(value);
  const [proof] = f.proofs(); assert.equal(proof.exhausted, true);
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation: syntheticMeteringContinuation(proof), now: NOW });
  f.db.exec("delete from platform_usage_samples");
  f.apply({ ...value, id: 98 }); // Even a new matching active runtime receipt cannot invert the boundary.
  assert.throws(() => f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }),
    { code: "reconciliation_required" });
  assert.throws(() => f.proofs(), { code: "reconciliation_required" });
});

test("the complete database transition cannot bypass the metering receipt even with a completed artifact", t => {
  const f = resetFixture(t), value = f.reset();
  f.finishArtifact(value);
  const complete = () => f.control.advanceCoinCommerceDataPackCredentialReset({ ...value.input,
    leaseRef: value.leaseRef, stage: "complete", now: NOW });
  assert.throws(complete, { code: "reconciliation_required" });
  const [proof] = f.proofs(), continuation = syntheticMeteringContinuation(proof);
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  assert.equal(complete().status, "complete");
  assert.equal(complete().status, "complete");
  assert.deepEqual(f.proofs(), []);
  assert.deepEqual(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }),
    { version: 1, proof, continuation });
  f.db.prepare("delete from platform_audit_events where action='data_pack_metering_reset_completed'").run();
  assert.throws(complete, { code: "reconciliation_required" });
});

test("up to 32 independently proved resets form one bounded exact batch; overflow is not silently truncated", t => {
  const f = resetFixture(t);
  for (let index = 0; index < 32; index++) f.reset();
  assert.equal(f.proofs().length, 32);
  f.reset();
  assert.throws(() => f.proofs(), { code: "reconciliation_required" });
});

for (const [name, change] of [
  ["reset owner", f => {
    f.control.createAccount({ id: "acct_wrong_owner", ownerRef: "owner_wrong", status: "active", createdAt: NOW, updatedAt: NOW });
    f.db.exec("update platform_data_pack_credential_resets set account_id='acct_wrong_owner'");
  }],
  ["reset order", f => f.db.prepare("update platform_data_pack_credential_resets set order_ref=?").run(f.pack().orderRef)],
  ["reset entitlement", f => f.db.prepare("update platform_data_pack_credential_resets set entitlement_ref=?").run(f.pack().entitlementId)],
  ["disabled account", f => f.db.exec("update platform_accounts set status='suspended'")],
  ["request owner", (f, value) => {
    f.control.createAccount({ id: "acct_wrong_owner", ownerRef: "owner_wrong", status: "active", createdAt: NOW, updatedAt: NOW });
    f.db.prepare("update platform_issuance_requests set account_id='acct_wrong_owner' where id=?").run(value.pack.requestId);
  }],
  ["current material", f => f.db.exec(`update platform_data_pack_edge_credentials set edge_material_digest='sha256:${"a".repeat(64)}'`)],
  ["credential channel", f => f.db.exec("update platform_data_pack_edge_credentials set edge_channel_ref='channel_drift'")],
  ["request channel", f => f.db.exec("update platform_issuance_requests set node_id='channel_drift'")],
  ["request metadata", f => f.db.exec("update platform_issuance_requests set metadata_json='{}'")],
  ["issued reservation approval", f => f.db.exec("update platform_issuance_requests set approval_ref='approval_other_order'")],
  ["quota", f => f.db.exec("update platform_data_pack_resources set quota_bytes=1")],
  ["fulfillment effect", f => f.db.exec("delete from platform_audit_events where action='data_pack_fulfillment_applied'")],
  ["missing apply", f => f.db.exec("delete from platform_edge_apply_receipts")],
  ["unhealthy apply", f => f.db.exec("update platform_edge_apply_receipts set service_active=0")],
  ["future apply", f => f.db.exec("update platform_edge_apply_receipts set applied_at='2027-01-01T00:00:00.000Z'")],
  ["wrong notification purpose", f => f.db.exec("update platform_edge_desired_state_notifications set reason='other_event'")]
]) {
  test(`metering proof rejects drifted ${name}, including after a receipt was recorded`, t => {
    const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
    f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation: syntheticMeteringContinuation(proof), now: NOW });
    change(f, value);
    assert.throws(() => f.proofs());
    assert.throws(() => f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }));
  });
}

for (const [name, change] of [
  ["extra field", continuation => { continuation.extra = true; }],
  ["partial context", continuation => { delete continuation.context.scopeDigest; }],
  ["upper-case hash", continuation => { continuation.identityDigest = "A".repeat(64); }],
  ["wrong proof digest", continuation => { continuation.proofDigest = "0".repeat(64); }],
  ["wrong sequence", continuation => { continuation.sequence += 1; }],
  ["unsafe sequence", continuation => { continuation.previousSequence = Number.MAX_SAFE_INTEGER; continuation.sequence = continuation.previousSequence + 1; }],
  ["archive mismatch", continuation => { continuation.archiveName = "wrong.json"; }],
  ["future completion", continuation => { continuation.completedAt = "2027-01-01T00:00:00.000Z"; }],
  ["completion before reset", continuation => { continuation.completedAt = "2026-09-30T00:00:00.000Z"; }],
  ["accessor", continuation => { Object.defineProperty(continuation, "identityDigest", { enumerable: true, get() { throw new Error("getter must not run"); } }); }]
]) {
  test(`receipt refuses ${name} without creating an audit or changing the reset`, t => {
    const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
    const continuation = syntheticMeteringContinuation(proof);
    change(continuation);
    assert.throws(() => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }),
      { code: "reconciliation_required" });
    assert.equal(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), null);
    assert.equal(f.control.beginCoinCommerceDataPackCredentialReset({ ...value.input, now: NOW }).status, "edge_applied");
  });
}

test("receipt collision, malformed metadata and proof extras are never accepted by audit replay", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  const scope = { ...value.input, now: NOW };
  const extraProof = { ...proof, usageTotal: 0 };
  assert.throws(() => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof: extraProof,
    continuation: syntheticMeteringContinuation(extraProof), now: NOW }), { code: "reconciliation_required" });
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  f.db.exec("update platform_audit_events set action='wrong_receipt' where action='data_pack_metering_reset_completed'");
  assert.throws(() => f.control.getCoinCommerceDataPackMeteringResetReceipt(scope), { code: "reconciliation_required" });
  f.db.exec("update platform_audit_events set action='data_pack_metering_reset_completed' where action='wrong_receipt'");
  const row = f.db.prepare("select id,metadata_json from platform_audit_events where action='data_pack_metering_reset_completed'").get();
  f.db.prepare("update platform_audit_events set metadata_json=? where id=?")
    .run(row.metadata_json.replace('{"version":1,', '{"version":0,"version":1,'), row.id);
  assert.throws(() => f.control.getCoinCommerceDataPackMeteringResetReceipt(scope), { code: "reconciliation_required" });
});
