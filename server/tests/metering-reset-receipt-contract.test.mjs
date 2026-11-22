import assert from "node:assert/strict";
import test from "node:test";
import {
  METERING_RESET_RECEIPT_TYPES,
  meteringResetReceiptId,
  meteringResetReceiptType,
  readMeteringResetReceiptRow,
  verifyMeteringResetReceiptRow,
  writeMeteringResetReceipt
} from "../services/platform/metering-reset-receipt.mjs";
import { packFixture, NOW } from "./full-metering-data-pack-bindings.fixture.mjs";
import { syntheticMeteringContinuation } from "./platform-coin-commerce-data-pack-metering-reset.fixture.mjs";

// M1-10 Option B: positive writer contract for the standalone metering-reset
// receipt mechanism. The receipt is NOT a generic audit event: it is written
// through metering-reset-receipt.mjs, never through recordAuditEvent(), and
// the generic audit unsafe-field filter is not relaxed for it. The tests
// below pin that boundary as well as the writer behaviour itself.

function resetFixture(t) {
  const f = packFixture(t);
  let next = 0;
  function reset(pack = f.pack(), { rotationRef } = {}) {
    const id = ++next;
    const input = { accountId: pack.accountId, orderRef: pack.orderRef, rotationRef: rotationRef || `packreset_receipt_${id}` };
    const leaseRef = `packresetlease_receipt_${id}`;
    f.control.beginCoinCommerceDataPackCredentialReset({ ...input, now: NOW });
    f.control.claimCoinCommerceDataPackCredentialReset({ ...input, leaseRef, now: NOW });
    for (const stage of ["staged", "control_switched", "material_committed"]) {
      f.control.advanceCoinCommerceDataPackCredentialReset({ ...input, leaseRef, stage, now: NOW,
        ...(stage === "staged" ? { newEdgeMaterialDigest: `sha256:${"f".repeat(64)}` } : {}) });
    }
    const desired = f.control.getLatestEdgeDesiredStateForChannel(pack.channelRef);
    f.control.recordEdgeDesiredStateNotification({ id: `notify_receipt_${id}`,
      nodeRef: pack.channelRef, channelRef: pack.channelRef,
      desiredStateRef: desired.desiredStateRef, generation: desired.generation,
      reason: "coin_commerce_data_pack_credential_reset", status: "pending", createdAt: NOW, updatedAt: NOW });
    f.control.recordEdgeApplyReceipt({ id: `receipt_meter_receipt_${id}`, channelRef: pack.channelRef,
      desiredStateRef: desired.desiredStateRef, status: "applied", configTestOk: true,
      serviceActive: true, listenerUdp443: true, appliedAt: NOW, createdAt: NOW });
    f.control.advanceCoinCommerceDataPackCredentialReset({ ...input, leaseRef, stage: "edge_applied", now: NOW });
    return { pack, input, leaseRef, id };
  }
  return { ...f, reset,
    proofs: () => f.control.readCoinCommerceDataPackMeteringResetProofs({ now: NOW }) };
}

const RECEIPT_COUNT = (f) => f.db.prepare(
  "select count(*) as count from platform_audit_events where action='data_pack_metering_reset_completed'").get().count;
const RECEIPT_ROW = (f) => f.db.prepare(
  "select * from platform_audit_events where action='data_pack_metering_reset_completed'").get();

test("writer contract: a normal receipt write stores one exact row and reads back identical", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  const receipt = f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  assert.deepEqual(receipt, { version: 1, proof, continuation });
  assert.equal(RECEIPT_COUNT(f), 1);
  const row = RECEIPT_ROW(f);
  assert.match(row.id, /^pack_metering_reset_[a-f0-9]{64}$/);
  assert.equal(row.id, meteringResetReceiptId(value.input.rotationRef));
  assert.equal(row.entity_type, "coin_commerce_data_pack_metering_reset");
  assert.equal(row.entity_ref, value.input.rotationRef);
  assert.equal(row.action, "data_pack_metering_reset_completed");
  assert.equal(row.actor_ref, "full_metering_collector");
  assert.equal(row.created_at, continuation.completedAt);
  assert.deepEqual(JSON.parse(row.metadata_json), { version: 1, proof, continuation });
  assert.deepEqual(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), receipt);
});

test("writer contract: an identical rewrite returns the existing receipt and writes no second row", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  const record = () => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  const receipt = record();
  assert.deepEqual(record(), receipt);
  assert.deepEqual(record(), receipt);
  assert.equal(RECEIPT_COUNT(f), 1);
});

test("writer contract: invalid input is refused before any row is written", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  delete continuation.context.scopeDigest;
  assert.throws(() => f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW }),
    { code: "reconciliation_required" });
  assert.equal(f.control.getCoinCommerceDataPackMeteringResetReceipt({ ...value.input, now: NOW }), null);
  assert.equal(RECEIPT_COUNT(f), 0);
  assert.equal(f.control.beginCoinCommerceDataPackCredentialReset({ ...value.input, now: NOW }).status, "edge_applied");
});

test("receipt id: deterministic per rotation ref and bound to the stored row", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  assert.equal(meteringResetReceiptId(value.input.rotationRef),
    meteringResetReceiptId(value.input.rotationRef));
  assert.notEqual(meteringResetReceiptId(value.input.rotationRef),
    meteringResetReceiptId(`${value.input.rotationRef}_other`));
  assert.equal(RECEIPT_ROW(f).id, meteringResetReceiptId(value.input.rotationRef));
  assert.throws(() => meteringResetReceiptId(""), { code: "reconciliation_required" });
  assert.throws(() => meteringResetReceiptId(42), { code: "reconciliation_required" });
});

test("enum guard: the receipt-type enum holds exactly one member and is frozen", t => {
  assert.deepEqual(Object.keys(METERING_RESET_RECEIPT_TYPES), ["data_pack_metering_reset_completed"]);
  assert.equal(Object.keys(METERING_RESET_RECEIPT_TYPES).length, 1);
  assert.deepEqual(METERING_RESET_RECEIPT_TYPES.data_pack_metering_reset_completed, {
    entityType: "coin_commerce_data_pack_metering_reset",
    action: "data_pack_metering_reset_completed",
    actorRef: "full_metering_collector",
    version: 1
  });
  assert(Object.isFrozen(METERING_RESET_RECEIPT_TYPES));
  assert(Object.isFrozen(METERING_RESET_RECEIPT_TYPES.data_pack_metering_reset_completed));
});

test("enum guard: any receipt type outside the enum is rejected", t => {
  for (const action of ["wrong_receipt", "data_pack_fulfillment_applied", "resource_effect_applied",
    "subscription_fulfillment_applied", "", "DATA_PACK_METERING_RESET_COMPLETED", null, undefined, 1]) {
    assert.throws(() => meteringResetReceiptType(action), { code: "reconciliation_required" });
  }
  assert.equal(meteringResetReceiptType("data_pack_metering_reset_completed").action,
    "data_pack_metering_reset_completed");
});

test("enum guard: the dedicated writer rejects rows whose type fields do not match the enum", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  const row = RECEIPT_ROW(f);
  const expected = { id: row.id, entityType: row.entity_type, entityRef: row.entity_ref,
    action: row.action, actorRef: row.actor_ref, createdAt: row.created_at, metadataJson: row.metadata_json };
  // A direct duplicate write through the module is a collision, not a
  // second row: the constraint is translated to reconciliation_required.
  assert.throws(() => writeMeteringResetReceipt(f.db, expected), { code: "reconciliation_required" });
  for (const change of [
    (draft) => { draft.action = "wrong_receipt"; },
    (draft) => { draft.action = "data_pack_fulfillment_applied"; },
    (draft) => { draft.entityType = "coin_commerce_data_pack_fulfillment"; },
    (draft) => { draft.actorRef = "coin_commerce_fulfillment"; },
    (draft) => { draft.id = `pack_metering_reset_${"0".repeat(64)}`; },
    (draft) => { draft.entityRef = `${value.input.rotationRef}_other`; },
    (draft) => { draft.createdAt = "2027-01-01T00:00:00.000Z"; },
    (draft) => { draft.metadataJson = JSON.stringify({ version: 2, proof, continuation }); },
    (draft) => { draft.metadataJson = JSON.stringify({ version: 1, proof }); },
    (draft) => { draft.metadataJson = "{not json"; },
    (draft) => { draft.extra = true; }
  ]) {
    const draft = { ...expected };
    change(draft);
    assert.throws(() => writeMeteringResetReceipt(f.db, draft), { code: "reconciliation_required" });
  }
  assert.equal(RECEIPT_COUNT(f), 1);
  assert.deepEqual(RECEIPT_ROW(f), row);
});

test("read-back guard: verification rejects a missing or drifted stored row", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  f.control.recordCoinCommerceDataPackMeteringResetReceipt({ proof, continuation, now: NOW });
  const row = RECEIPT_ROW(f);
  const expected = { id: row.id, entityType: row.entity_type, entityRef: row.entity_ref,
    action: row.action, actorRef: row.actor_ref, createdAt: row.created_at, metadataJson: row.metadata_json };
  assert.equal(verifyMeteringResetReceiptRow(row, expected), true);
  assert.equal(verifyMeteringResetReceiptRow(readMeteringResetReceiptRow(f.db, row.id), expected), true);
  assert.equal(readMeteringResetReceiptRow(f.db, `pack_metering_reset_${"0".repeat(64)}`), null);
  for (const change of [
    (draft) => { draft.id = `pack_metering_reset_${"0".repeat(64)}`; },
    (draft) => { draft.entity_type = "coin_commerce_data_pack_fulfillment"; },
    (draft) => { draft.entity_ref = `${value.input.rotationRef}_other`; },
    (draft) => { draft.action = "wrong_receipt"; },
    (draft) => { draft.actor_ref = "coin_commerce_fulfillment"; },
    (draft) => { draft.created_at = "2027-01-01T00:00:00.000Z"; },
    (draft) => { draft.metadata_json = JSON.stringify({ version: 1, proof, continuation: { ...continuation, sequence: 99 } }); }
  ]) {
    const drifted = { ...row };
    change(drifted);
    assert.throws(() => verifyMeteringResetReceiptRow(drifted, expected), { code: "reconciliation_required" });
  }
  assert.throws(() => verifyMeteringResetReceiptRow(null, expected), { code: "reconciliation_required" });
  assert.throws(() => verifyMeteringResetReceiptRow(row, { ...expected, extra: true }),
    { code: "reconciliation_required" });
});

test("boundary: the metering-reset pair is still not a generic audit event", t => {
  const f = resetFixture(t), value = f.reset(), [proof] = f.proofs();
  const continuation = syntheticMeteringContinuation(proof);
  assert.throws(() => f.control.recordAuditEvent({ id: meteringResetReceiptId(value.input.rotationRef),
    entityType: "coin_commerce_data_pack_metering_reset", entityRef: value.input.rotationRef,
    action: "data_pack_metering_reset_completed", actorRef: "full_metering_collector",
    createdAt: continuation.completedAt, metadata: { version: 1, proof, continuation } }),
  { code: "validation_error", message: /audit entity\/action JSON contract is not registered/ });
  assert.equal(RECEIPT_COUNT(f), 0);
});
