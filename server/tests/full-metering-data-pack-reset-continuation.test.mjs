import assert from "node:assert/strict";
import test from "node:test";
import { admitFullMeteringDataPackResets, fullMeteringDataPackResetHistory, validateFullMeteringDataPackResetProof }
  from "../../scripts/lib/full-metering-data-pack-reset-continuation.mjs";
import { fullMeteringDigest } from "../../scripts/lib/full-metering-journal.mjs";

const CONTEXT = { databaseIdentityDigest: "a".repeat(64), scopeDigest: "b".repeat(64) };
const oldMaterial = `sha256:${"c".repeat(64)}`, newMaterial = `sha256:${"d".repeat(64)}`;
function fixture() {
  const proof = { version: 1, rotationRef: "packrot_reset_test", orderRef: "order_reset_test", accountId: "acct_reset_test",
    requestRef: "request_reset_test", entitlementRef: "ent_reset_test", edgeChannelRef: "channel-vultr-a-hy2",
    edgeCredentialRef: "edge_reset_test", oldEdgeMaterialDigest: oldMaterial, newEdgeMaterialDigest: newMaterial,
    billingBinding: { plan: "offerv_pack_100gb_v1", validFrom: "2026-09-29T00:00:00.000Z", validUntil: "9999-12-31T23:59:59.999Z" },
    quotaBytes: 100 * 1024 ** 3, exhausted: false };
  const identity = { sourceRef: "full_metering_hy2_cumulative_v1", channelRef: proof.edgeChannelRef,
    edgeCredentialRef: proof.edgeCredentialRef, accountId: proof.accountId, entitlementId: proof.entitlementRef,
    requestId: proof.requestRef, billingBinding: { ...proof.billingBinding }, materialDigest: oldMaterial };
  const checkpoint = { version: 1, activationId: "reset_test", sequence: 5,
    sources: [{ channelRef: proof.edgeChannelRef, identities: [identity] }] };
  const next = { ...identity, materialDigest: newMaterial };
  const identities = { entries: [next], retained: [] };
  return { proof, identity, checkpoint, identities, next };
}

test("pack reset admission matches exact prior ownership, period, material, and current identity", () => {
  const f = fixture();
  const changes = admitFullMeteringDataPackResets({ ...f, proofs: [f.proof] }).changes;
  assert.equal(changes.size, 1);
  assert.deepEqual([...changes.values()][0].nextIdentity, f.next);
  const fresh = { ...f.checkpoint, sources: [{ channelRef: f.proof.edgeChannelRef, identities: [] }] };
  assert.equal(admitFullMeteringDataPackResets({ ...f, checkpoint: fresh, proofs: [f.proof] }).changes.size, 1);
});
for (const field of ["accountId", "entitlementId", "requestId", "channelRef", "edgeCredentialRef", "materialDigest", "billingBinding"]) {
  test(`pack reset cannot substitute current ${field}`, () => {
    const f = fixture();
    f.identities.entries[0][field] = field === "billingBinding" ? { ...f.proof.billingBinding, plan: "monthly" } : "other_valid_ref";
    assert.throws(() => admitFullMeteringDataPackResets({ ...f, proofs: [f.proof] }), /binding_changed/);
  });
}
test("retained reset changes only private identity evidence without synthesizing eligible traffic", () => {
  const f = fixture(); f.proof.exhausted = true;
  f.identities = { entries: [], retained: [{ channelRef: f.proof.edgeChannelRef,
    edgeCredentialRef: f.proof.edgeCredentialRef, materialDigest: newMaterial }] };
  assert.deepEqual([...admitFullMeteringDataPackResets({ ...f, proofs: [f.proof] }).changes.values()][0].nextIdentity, f.next);
  f.identities.entries = [f.next];
  assert.throws(() => admitFullMeteringDataPackResets({ ...f, proofs: [f.proof] }), /binding_changed/);
});
test("proof schema rejects extra fields, quota mismatch, unchanged materials and duplicates", () => {
  const f = fixture();
  for (const proof of [{ ...f.proof, callerApproval: true }, { ...f.proof, quotaBytes: 1 },
    { ...f.proof, newEdgeMaterialDigest: oldMaterial }, { ...f.proof, exhausted: "false" }]) {
    assert.throws(() => validateFullMeteringDataPackResetProof(proof), /pack_reset_invalid/);
  }
  assert.throws(() => admitFullMeteringDataPackResets({ ...f, proofs: [f.proof, f.proof] }), /pack_reset_invalid/);
  assert.throws(() => admitFullMeteringDataPackResets({ ...f, proofs: Array(33).fill(f.proof) }), /pack_reset_invalid/);
});
test("private reset history binds activation, context, proof, immutable preimage and sequence", () => {
  const f = fixture(), digest = fullMeteringDigest(f.checkpoint);
  const continuation = { version: 1, activationId: "reset_test", context: CONTEXT, previousSequence: 5, sequence: 6,
    previousCheckpointDigest: digest, identityDigest: fullMeteringDigest(f.next), proofDigest: fullMeteringDigest(f.proof),
    archiveName: `material-before-${digest}.json`, completedAt: "2026-09-30T00:00:00.000Z" };
  const checkpoint = { ...f.checkpoint, sequence: 6, dataPackResetContinuations: [{ version: 1, proof: f.proof, continuation }] };
  assert.deepEqual(fullMeteringDataPackResetHistory(checkpoint, CONTEXT), checkpoint.dataPackResetContinuations);
  for (const patch of [{ activationId: "wrong_activation" }, { context: { ...CONTEXT, scopeDigest: "e".repeat(64) } },
    { proofDigest: "e".repeat(64) }, { sequence: 7 }, { archiveName: "../other.json" }]) {
    const mutated = structuredClone(checkpoint);
    Object.assign(mutated.dataPackResetContinuations[0].continuation, patch);
    assert.throws(() => fullMeteringDataPackResetHistory(mutated, CONTEXT), /pack_reset_history_invalid/);
  }
});
