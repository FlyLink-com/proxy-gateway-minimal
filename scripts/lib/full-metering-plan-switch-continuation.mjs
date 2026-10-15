// Pure collector admission. Only the owned CLI supplies the DB-backed proof
// reader; neither HTTP callers nor operator material/window approvals do so.
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { fullMeteringBindingIdentity } from "./full-metering-sample-writer.mjs";
import { admitFullMeteringDataPackResets } from "./full-metering-data-pack-reset-continuation.mjs";

const HASH = /^[a-f0-9]{64}$/;
const key = identity => `${identity.channelRef}\0${identity.edgeCredentialRef}`;
const fail = () => { throw Object.assign(new Error("full_metering_plan_switch_unproven"), { code: "full_metering_plan_switch_unproven" }); };
const need = ok => { if (!ok) fail(); };
function iso(value) {
  need(typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
function exact(value, keys) {
  need(value && typeof value === "object" && !Array.isArray(value));
  const own = Reflect.ownKeys(value);
  need(own.length === keys.length && own.every(field => keys.includes(field)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), "value")));
}
function proofShape(proof) {
  exact(proof, ["version", "kind", "fromIdentityDigest", "toIdentityDigest", "evidenceDigest", "transitionCount", "changedAt"]);
  need(proof.version === 1 && proof.kind === "commerce_billing_chain"
    && [proof.fromIdentityDigest, proof.toIdentityDigest, proof.evidenceDigest].every(value => typeof value === "string" && HASH.test(value))
    && proof.fromIdentityDigest !== proof.toIdentityDigest
    && Number.isSafeInteger(proof.transitionCount) && proof.transitionCount > 0 && proof.transitionCount <= 32);
  iso(proof.changedAt);
}
export function planSwitchContinuationHistory(checkpoint) {
  const history = checkpoint?.planSwitchContinuations ?? [];
  need(Array.isArray(history) && history.length <= 128);
  const seen = new Set();
  for (const record of history) {
    exact(record, ["version", "previousCheckpointDigest", "completedAt", "identityCount", "unassignedBytes", "archiveName", "changes"]);
    need(record.version === 1 && HASH.test(record.previousCheckpointDigest) && !seen.has(record.previousCheckpointDigest)
      && record.unassignedBytes === null && record.archiveName === `plan-switch-before-${record.previousCheckpointDigest}.json`
      && Number.isSafeInteger(record.identityCount) && record.identityCount > 0 && record.identityCount <= 10000
      && Array.isArray(record.changes) && record.changes.length === record.identityCount);
    iso(record.completedAt);
    const keys = new Set();
    for (const change of record.changes) {
      exact(change, ["channelRef", "edgeCredentialRef", "proof"]);
      need([change.channelRef, change.edgeCredentialRef].every(value => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value))
        && !keys.has(key(change)));
      keys.add(key(change)); proofShape(change.proof);
      need(change.proof.changedAt <= record.completedAt);
    }
    seen.add(record.previousCheckpointDigest);
  }
  return structuredClone(history);
}

export function admitFullMeteringPlanSwitches({ checkpoint, identities, readPlanSwitchProof, now, dataPackResetProofs = [] }) {
  const changes = new Map();
  if (!checkpoint || typeof readPlanSwitchProof !== "function") return { changes };
  // A material rotation is never plan-switch authority. Only a separately
  // validated, exact pack reset may be excluded from the plan-only comparison;
  // do not accept caller-supplied skip refs or mutate the checkpoint preimage.
  const resets = admitFullMeteringDataPackResets({ proofs: dataPackResetProofs, checkpoint, identities });
  const active = new Map(identities.entries.map(entry => [key(entry), entry]));
  const visited = new Set();
  for (const source of checkpoint.sources) {
    for (const previous of source.identities) {
      need(previous.channelRef === source.channelRef && !visited.has(key(previous)));
      visited.add(key(previous));
      const current = active.get(key(previous));
      if (!current || fullMeteringDigest(previous) === fullMeteringDigest(current)) continue;
      if (resets.changes.has(key(previous))) continue;
      // Never use a commerce record to authorize ownership, material, source,
      // request or credential rotation. Billing is the sole admitted dimension.
      need(fullMeteringDigest(fullMeteringBindingIdentity(previous)) === fullMeteringDigest(previous));
      need(fullMeteringDigest({ ...previous, billingBinding: current.billingBinding }) === fullMeteringDigest(current));
      const notBefore = iso(source.counterState.lastObservedAt);
      const result = readPlanSwitchProof({ previousIdentity: structuredClone(previous), currentIdentity: structuredClone(current), notBefore, now: iso(now) });
      need(result?.ok === true);
      proofShape(result.proof);
      need(result.proof.fromIdentityDigest === fullMeteringDigest(previous)
        && result.proof.toIdentityDigest === fullMeteringDigest(current)
        && notBefore <= result.proof.changedAt && result.proof.changedAt <= now);
      changes.set(key(previous), { channelRef: current.channelRef, edgeCredentialRef: current.edgeCredentialRef, proof: structuredClone(result.proof) });
    }
  }
  if (changes.size) need(changes.size <= 10000 && planSwitchContinuationHistory(checkpoint).length < 128);
  return { changes };
}
