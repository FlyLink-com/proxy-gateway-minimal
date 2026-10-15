import assert from "node:assert/strict";
import test from "node:test";
import { packFixture, CHANNELS, NOW, START, MATERIAL } from "./full-metering-data-pack-bindings.fixture.mjs";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";

const changes = db => db.prepare("select total_changes() as count").get().count;
const expectBlocked = (f, code = "baseline_pack_binding_invalid") => {
  const before = changes(f.db);
  assert.throws(() => f.read(), { baselineCode: code });
  assert.equal(changes(f.db), before);
};
function reserve(f) {
  return f.control.reserveCoinCommerceDataPackIssuance({ commandRef: "command_pending_pack", orderRef: "order_pending_pack",
    accountId: "acct_meter_packs", offerVersionRef: "offerv_pack_100gb_v1", quotaBytes: 100 * 1024 ** 3,
    nodeId: f.channels[0], now: START });
}
function sample(f, ref, bytes) {
  return makeFullMeteringSample({ binding: f.read().entries.find(entry => entry.requestId === ref.requestId),
    activationId: "pack_metering_test", generation: "c".repeat(64),
    delta: { intervalStartedAt: START, intervalEndedAt: NOW, uploadBytes: bytes, downloadBytes: 0, totalBytes: bytes } });
}

test("full-metering accepts one timed plan and two independent order-owned packs without writes", t => {
  const f = packFixture(t), timed = f.timed();
  const first = f.pack(), second = f.pack({ gigabytes: 200 });
  const before = changes(f.db);
  const result = f.read();
  assert.equal(result.entries.length, 3);
  assert.equal(result.retainedBindings.length, 0);
  for (const expected of [timed, first, second]) {
    const actual = result.entries.find(entry => entry.edgeCredentialRef === expected.edgeCredentialRef);
    for (const key of ["accountId", "entitlementId", "requestId", "channelRef"]) assert.equal(actual[key], expected[key]);
    assert.equal(actual.materialDigest, MATERIAL);
  }
  assert.equal(changes(f.db), before);
});

for (const channel of CHANNELS) {
  test(`full-metering admits a pack-only source on ${channel}`, t => {
    const f = packFixture(t, [channel]);
    f.pack({ gigabytes: 500 });
    const result = f.read();
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].billingBinding.plan, "offerv_pack_500gb_v1");
  });
}

test("real sample writer charges independent pack lifetime usage across a month boundary exactly once", t => {
  const f = packFixture(t), timed = f.timed(), first = f.pack(), second = f.pack({ gigabytes: 200 });
  const entries = f.read().entries;
  const writer = createFullMeteringSampleWriter({ database: f.db, controlStore: f.control, readBindings: f.read });
  const samples = [first, second].map((ref, index) => makeFullMeteringSample({
    binding: entries.find(entry => entry.edgeCredentialRef === ref.edgeCredentialRef),
    activationId: "pack_metering_test", generation: "c".repeat(64),
    delta: { intervalStartedAt: "2026-09-30T23:59:59.000Z", intervalEndedAt: NOW,
      uploadBytes: index + 1, downloadBytes: 0, totalBytes: index + 1 }
  }));
  assert.deepEqual(writer(samples), { insertedCount: 2, alreadyRecordedCount: 0 });
  assert.deepEqual(writer(samples), { insertedCount: 0, alreadyRecordedCount: 2 });
  for (const [index, ref] of [first, second].entries()) {
    assert.equal(f.control.readDataPackResourceUsage({ accountId: ref.accountId, orderRef: ref.orderRef,
      requestRef: ref.requestId, entitlementRef: ref.entitlementId, now: NOW }).usage.usedBytes, index + 1);
  }
  assert.equal(f.control.listUsageSamples({ requestId: timed.requestId }).length, 0);
});

test("a verified reservation with no runtime facts does not stop an existing timed source", t => {
  const f = packFixture(t); f.timed(); reserve(f);
  assert.equal(f.read().entries.length, 1);
});

for (const state of ["failed", "cancelled"]) {
  test(`a verified ${state} reservation without runtime facts remains unissued`, t => {
    const f = packFixture(t); f.timed(); const pending = reserve(f);
    f.control.setIssuanceRequestStatus(pending.requestRef, { status: state, updatedAt: START });
    assert.equal(f.read().entries.length, 1);
  });
}

const drifts = [
  ["request owner", (f, p) => f.db.prepare("update platform_issuance_requests set account_id='acct_other' where id=?").run(p.requestId)],
  ["resource owner", (f, p) => f.db.prepare("update platform_data_pack_resources set account_id='acct_other' where request_ref=?").run(p.requestId)],
  ["entitlement owner", (f, p) => f.db.prepare("update platform_entitlements set account_id='acct_other' where id=?").run(p.entitlementId)],
  ["missing account owner", f => f.db.exec("update platform_accounts set owner_ref='' where id='acct_meter_packs'")],
  ["order", (f, p) => f.db.prepare("update platform_data_pack_resources set order_ref='different_order' where request_ref=?").run(p.requestId)],
  ["command", (f, p) => f.db.prepare("update platform_data_pack_resources set command_ref='different_command' where request_ref=?").run(p.requestId)],
  ["quota", (f, p) => f.db.prepare("update platform_data_pack_resources set quota_bytes=1 where request_ref=?").run(p.requestId)],
  ["technical expiry", (f, p) => f.db.prepare("update platform_entitlements set valid_until='2027-10-01T00:00:00.000Z' where id=?").run(p.entitlementId)],
  ["future start", (f, p) => f.db.prepare("update platform_entitlements set valid_from='2027-10-01T00:00:00.000Z' where id=?").run(p.entitlementId)],
  ["material", (f, p) => f.db.prepare("update platform_data_pack_edge_credentials set edge_material_digest='' where request_ref=?").run(p.requestId)],
  ["credential channel", (f, p) => f.db.prepare("update platform_data_pack_edge_credentials set edge_channel_ref=? where request_ref=?").run(CHANNELS[1], p.requestId)],
  ["request channel", (f, p) => f.db.prepare("update platform_issuance_requests set node_id=? where id=?").run(CHANNELS[1], p.requestId)],
  ["request metadata", (f, p) => f.db.prepare("update platform_issuance_requests set metadata_json='{}' where id=?").run(p.requestId)],
  ["effect metadata", (f, p) => f.db.prepare("update platform_audit_events set metadata_json='{}' where id=?").run(p.effectRef)],
  ["missing effect", (f, p) => f.db.prepare("delete from platform_audit_events where id=?").run(p.effectRef)],
  ["missing resource", (f, p) => f.db.prepare("delete from platform_data_pack_resources where request_ref=?").run(p.requestId)],
  ["missing credential", (f, p) => f.db.prepare("delete from platform_data_pack_edge_credentials where request_ref=?").run(p.requestId)],
  ["issued becomes planned", (f, p) => f.control.setIssuanceRequestStatus(p.requestId, { status: "planned", updatedAt: START })],
  ["extra link", (f, p) => f.control.linkIssuedSubscription({ id: "extra_pack_link", requestId: p.requestId,
    tenantRef: "extra_tenant", artifactRef: "extra_artifact", status: "active", createdAt: START, updatedAt: START })]
];
for (const [name, drift] of drifts) {
  test(`pack ${name} drift fails closed even beside a valid timed binding`, t => {
    const f = packFixture(t); f.timed(); const p = f.pack();
    f.control.createAccount({ id: "acct_other", ownerRef: "owner_other", status: "active", createdAt: START, updatedAt: START });
    assert.equal(f.read().entries.length, 2);
    drift(f, p);
    expectBlocked(f);
  });
}

for (const runtimeFact of ["link", "usage", "metadata", "portal"]) {
  test(`a pending reservation with ${runtimeFact} cannot bypass complete pack proof`, t => {
    const f = packFixture(t); const timed = f.timed(), pending = reserve(f);
    if (runtimeFact === "link") f.control.linkIssuedSubscription({ id: "pending_pack_link", requestId: pending.requestRef,
      tenantRef: "pending_tenant", artifactRef: "pending_artifact", status: "active", createdAt: START, updatedAt: START });
    if (runtimeFact === "usage") f.control.recordUsageSample({ id: "pending_pack_sample", sourceRef: "test_source",
      channelRef: f.channels[0], edgeCredentialRef: "edge_pending_pack", accountId: timed.accountId,
      entitlementId: pending.entitlementRef, requestId: pending.requestRef, observedAt: NOW,
      intervalStartedAt: START, intervalEndedAt: NOW, uploadBytes: 1, downloadBytes: 0,
      sampleDigest: "pending_pack_digest", createdAt: NOW });
    if (runtimeFact === "metadata") f.db.prepare("update platform_issuance_requests set metadata_json='{}' where id=?").run(pending.requestRef);
    if (runtimeFact === "portal") f.db.prepare(`insert into platform_portal_access_requests
      (id,portal_user_ref,plan,client_target,duration_days,quantity,status,next_action,prior_trial_state,submitted_at,updated_at)
      values (?,?,'monthly','clash',30,1,'pending_admin_review','await_review','none',?,?)`)
      .run(pending.requestRef, timed.accountId, START, START);
    expectBlocked(f);
  });
}

test("pack credential collision with a Portal credential on an unselected channel is rejected", t => {
  const f = packFixture(t), timed = f.timed(CHANNELS[1]), p = f.pack();
  assert.equal(f.read().entries.length, 1);
  f.db.prepare("update platform_portal_edge_credentials set edge_credential_ref=? where request_id=?").run(p.edgeCredentialRef, timed.requestId);
  expectBlocked(f, "baseline_binding_ambiguous");
});

test("a selected timed credential cannot collide with a pack on an unselected channel", t => {
  const f = packFixture(t), timed = f.timed(), p = f.pack({ channel: CHANNELS[1] });
  assert.equal(f.read().entries.length, 1);
  f.db.prepare("update platform_data_pack_edge_credentials set edge_credential_ref=? where request_ref=?").run(timed.edgeCredentialRef, p.requestId);
  expectBlocked(f, "baseline_binding_ambiguous");
});

test("pre-pack schema without pack requests stays readable, partial schema does not", t => {
  const f = packFixture(t); f.timed();
  f.db.exec("drop table platform_data_pack_credential_resets");
  expectBlocked(f, "baseline_pack_schema_invalid");
  f.db.exec(`drop table platform_data_pack_artifact_rotations;
    drop table platform_data_pack_edge_credentials; drop table platform_data_pack_resources;`);
  assert.equal(f.read().entries.length, 1);
});

test("the existing timed-only inactive-channel contract is not relaxed", t => {
  const f = packFixture(t); f.timed();
  f.db.exec("update platform_accounts set status='suspended'");
  expectBlocked(f, "baseline_binding_scope_invalid");
});

test("a lone exhausted pack is explicitly retained while a truly empty source stays rejected", t => {
  const f = packFixture(t);
  expectBlocked(f, "baseline_binding_scope_invalid");
  const p = f.pack();
  const writer = createFullMeteringSampleWriter({ database: f.db, controlStore: f.control, readBindings: f.read });
  assert.equal(writer([sample(f, p, p.quotaBytes)]).insertedCount, 1);
  const result = f.read();
  assert.equal(result.entries.length, 0);
  assert.equal(result.retainedBindings.length, 1);
  assert.deepEqual(result.retainedBindings[0].reasons, ["quota_exhausted"]);
  assert.equal(result.retainedBindings[0].materialDigest, MATERIAL);
  // Exhaustion does not excuse invalid identity or material evidence.
  f.db.prepare("update platform_data_pack_edge_credentials set edge_material_digest='' where request_ref=?").run(p.requestId);
  expectBlocked(f);
});

test("pack exhaustion retains only that pack and never a different order or timed plan", t => {
  const f = packFixture(t), timed = f.timed(), first = f.pack(), second = f.pack();
  const writer = createFullMeteringSampleWriter({ database: f.db, controlStore: f.control, readBindings: f.read });
  writer([sample(f, first, first.quotaBytes)]);
  const result = f.read();
  assert.deepEqual(result.entries.map(entry => entry.requestId).sort(), [timed.requestId, second.requestId].sort());
  assert.equal(result.retainedBindings[0].edgeCredentialRef, first.edgeCredentialRef);
});

test("reset keeps metering ownership, blocks a half-committed material switch and refuses old queued samples", t => {
  const f = packFixture(t), p = f.pack();
  const queued = sample(f, p, 1), before = f.read().entries[0];
  const reset = { rotationRef: "reset_meter_pack", orderRef: p.orderRef,
    accountId: p.accountId, leaseRef: "lease_meter_pack", now: NOW };
  f.control.beginCoinCommerceDataPackCredentialReset({ rotationRef: reset.rotationRef,
    orderRef: reset.orderRef, accountId: reset.accountId, now: reset.now });
  f.control.claimCoinCommerceDataPackCredentialReset(reset);
  assert.equal(f.read().entries[0].materialDigest, MATERIAL);
  f.control.advanceCoinCommerceDataPackCredentialReset({ ...reset, stage: "staged", newEdgeMaterialDigest: `sha256:${"d".repeat(64)}` });
  assert.equal(f.read().entries[0].materialDigest, MATERIAL);
  f.db.prepare("update platform_data_pack_credential_resets set new_edge_material_digest='' where rotation_ref=?").run(reset.rotationRef);
  expectBlocked(f);
  f.db.prepare("update platform_data_pack_credential_resets set new_edge_material_digest=? where rotation_ref=?")
    .run(`sha256:${"d".repeat(64)}`, reset.rotationRef);
  f.control.advanceCoinCommerceDataPackCredentialReset({ ...reset, stage: "control_switched" });
  expectBlocked(f, "baseline_pack_material_pending");
  f.control.advanceCoinCommerceDataPackCredentialReset({ ...reset, stage: "material_committed" });
  const after = f.read().entries[0];
  for (const key of ["accountId", "entitlementId", "requestId", "channelRef", "edgeCredentialRef"]) assert.equal(after[key], before[key]);
  assert.notEqual(after.materialDigest, before.materialDigest);
  const writer = createFullMeteringSampleWriter({ database: f.db, controlStore: f.control, readBindings: f.read });
  assert.throws(() => writer([queued]), { code: "full_metering_binding_changed" });
  assert.equal(f.control.listUsageSamples({ requestId: p.requestId }).length, 0);
});
