// Product reset authority comes from the owned control store, not a CLI payload.
// These records stay in the private journal; public output contains counts only.
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { fullMeteringBindingIdentity } from "./full-metering-sample-writer.mjs";
import { lifetimeDataPackQuotaBytesFor } from "../../server/services/platform/usage-billing-cycle.mjs";

const HASH = /^[a-f0-9]{64}$/, MATERIAL = /^sha256:[a-f0-9]{64}$/;
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (condition, code = "full_metering_pack_reset_invalid") => { if (!condition) fail(code); };
const key = entry => `${entry.channelRef ?? entry.edgeChannelRef}\0${entry.edgeCredentialRef}`;
function exact(value, fields) {
  need(value && typeof value === "object" && !Array.isArray(value));
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && keys.every(field => fields.includes(field)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), "value")));
}
function iso(value) {
  need(typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
export function validateFullMeteringDataPackResetProof(proof) {
  exact(proof, ["version", "rotationRef", "orderRef", "accountId", "requestRef", "entitlementRef",
    "edgeChannelRef", "edgeCredentialRef", "oldEdgeMaterialDigest", "newEdgeMaterialDigest", "billingBinding", "quotaBytes", "exhausted"]);
  need(proof.version === 1 && ["rotationRef", "orderRef", "accountId", "requestRef", "entitlementRef", "edgeChannelRef", "edgeCredentialRef"]
    .every(field => typeof proof[field] === "string" && REF.test(proof[field]))
    && MATERIAL.test(proof.oldEdgeMaterialDigest) && MATERIAL.test(proof.newEdgeMaterialDigest)
    && proof.oldEdgeMaterialDigest !== proof.newEdgeMaterialDigest && typeof proof.exhausted === "boolean"
    && Number.isSafeInteger(proof.quotaBytes) && proof.quotaBytes > 0);
  exact(proof.billingBinding, ["plan", "validFrom", "validUntil"]);
  need(lifetimeDataPackQuotaBytesFor(proof.billingBinding) === proof.quotaBytes
    && iso(proof.billingBinding.validFrom) < iso(proof.billingBinding.validUntil)
    && proof.billingBinding.validUntil === "9999-12-31T23:59:59.999Z");
  return proof;
}
export function fullMeteringDataPackResetHistory(checkpoint, context) {
  const records = checkpoint?.dataPackResetContinuations ?? [];
  need(Array.isArray(records) && records.length <= 128, "full_metering_pack_reset_history_invalid");
  const seen = new Set();
  let lastSequence = -1;
  for (const record of records) {
    exact(record, ["version", "proof", "continuation"]);
    validateFullMeteringDataPackResetProof(record.proof);
    const c = record.continuation;
    exact(c, ["version", "activationId", "context", "previousSequence", "sequence", "previousCheckpointDigest",
      "identityDigest", "proofDigest", "archiveName", "completedAt"]);
    exact(c.context, ["databaseIdentityDigest", "scopeDigest"]);
    need(record.version === 1 && c.version === 1 && c.activationId === checkpoint.activationId
      && fullMeteringDigest(c.context) === fullMeteringDigest(context)
      && Object.values(c.context).every(value => typeof value === "string" && HASH.test(value))
      && Number.isSafeInteger(c.previousSequence) && c.previousSequence >= 0 && c.sequence === c.previousSequence + 1
      && c.sequence >= lastSequence && c.sequence <= checkpoint.sequence
      && [c.previousCheckpointDigest, c.identityDigest, c.proofDigest].every(value => typeof value === "string" && HASH.test(value))
      && c.proofDigest === fullMeteringDigest(record.proof)
      && c.archiveName === `material-before-${c.previousCheckpointDigest}.json`
      && !seen.has(record.proof.rotationRef), "full_metering_pack_reset_history_invalid");
    iso(c.completedAt);
    seen.add(record.proof.rotationRef); lastSequence = c.sequence;
  }
  return structuredClone(records);
}
function boundIdentity(identity, proof, materialDigest) {
  need(fullMeteringDigest(fullMeteringBindingIdentity(identity)) === fullMeteringDigest(identity)
    && identity.channelRef === proof.edgeChannelRef && identity.edgeCredentialRef === proof.edgeCredentialRef
    && identity.accountId === proof.accountId && identity.requestId === proof.requestRef
    && identity.entitlementId === proof.entitlementRef && identity.materialDigest === materialDigest
    && fullMeteringDigest(identity.billingBinding) === fullMeteringDigest(proof.billingBinding), "full_metering_binding_changed");
}
export function admitFullMeteringDataPackResets({ proofs, checkpoint, identities }) {
  need(Array.isArray(proofs) && proofs.length <= 32);
  const changes = new Map(), rotations = new Set();
  const old = new Map();
  for (const source of checkpoint.sources) {
    need(Array.isArray(source.identities), "full_metering_checkpoint_invalid");
    for (const identity of source.identities) {
      need(identity.channelRef === source.channelRef && !old.has(key(identity)), "full_metering_binding_changed");
      old.set(key(identity), identity);
    }
  }
  const current = new Map(identities.entries.map(entry => [key(entry), entry]));
  const retained = new Map(identities.retained.map(entry => [key(entry), entry]));
  for (const proof of proofs) {
    validateFullMeteringDataPackResetProof(proof);
    need(!rotations.has(proof.rotationRef) && !changes.has(key(proof)));
    const previous = old.get(key(proof)), active = current.get(key(proof)), expired = retained.get(key(proof));
    // A never-observed pack may take its first zero-debit baseline after reset.
    // Otherwise the exact prior owner/period/material must match the intent.
    if (previous) boundIdentity(previous, proof, proof.oldEdgeMaterialDigest);
    let nextIdentity;
    if (proof.exhausted) {
      need(previous && !active && expired?.materialDigest === proof.newEdgeMaterialDigest, "full_metering_binding_changed");
      // No eligible identity is fabricated. The archived identity alone changes;
      // its retained counters and all previously recorded usage remain intact.
      nextIdentity = { ...previous, materialDigest: proof.newEdgeMaterialDigest };
    } else {
      need(active && !expired, "full_metering_binding_changed");
      boundIdentity(active, proof, proof.newEdgeMaterialDigest);
      if (previous) {
        const { materialDigest: oldMaterial, ...before } = previous;
        const { materialDigest: newMaterial, ...after } = active;
        need(oldMaterial !== newMaterial && fullMeteringDigest(before) === fullMeteringDigest(after), "full_metering_binding_changed");
      }
      nextIdentity = active;
    }
    changes.set(key(proof), { proof: structuredClone(proof), nextIdentity: structuredClone(nextIdentity) });
    rotations.add(proof.rotationRef);
  }
  return { changes };
}
