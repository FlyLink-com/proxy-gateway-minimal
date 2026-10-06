// Explicit operator-bound billing-window continuation. Ordinary collection never
// infers a later validUntil. This module has no host I/O.
import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { fullMeteringBindingIdentity } from "./full-metering-sample-writer.mjs";

const HASH = /^[a-f0-9]{64}$/, REF = /^[A-Za-z0-9._:-]{1,128}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code = "full_metering_billing_window_approval_invalid") => { if (!ok) fail(code); };
const key = entry => `${entry.channelRef}\0${entry.edgeCredentialRef}`;
function exact(value, fields) {
  need(value && typeof value === "object" && !Array.isArray(value));
  const own = Reflect.ownKeys(value);
  need(own.length === fields.length && own.every(field => fields.includes(field)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), "value")));
}
function iso(value) {
  need(typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
  return value;
}
function validateApproval(approval) {
  exact(approval, ["version", "activationId", "context", "previousSequence", "previousCheckpointDigest", "notBefore", "expiresAt", "changes"]);
  exact(approval.context, ["databaseIdentityDigest", "scopeDigest"]);
  need(approval.version === 1 && typeof approval.activationId === "string" && REF.test(approval.activationId)
    && Object.values(approval.context).every(value => typeof value === "string" && HASH.test(value))
    && Number.isSafeInteger(approval.previousSequence) && approval.previousSequence >= 0
    && typeof approval.previousCheckpointDigest === "string" && HASH.test(approval.previousCheckpointDigest));
  need(iso(approval.notBefore) < iso(approval.expiresAt)
    && Date.parse(approval.expiresAt) - Date.parse(approval.notBefore) <= 86400000);
  need(Array.isArray(approval.changes) && approval.changes.length > 0 && approval.changes.length <= 32);
  const changes = new Map();
  for (const change of approval.changes) {
    exact(change, ["channelRef", "edgeCredentialRef", "previousIdentityDigest", "currentIdentityDigest"]);
    need(typeof change.channelRef === "string" && REF.test(change.channelRef)
      && typeof change.edgeCredentialRef === "string" && REF.test(change.edgeCredentialRef)
      && typeof change.previousIdentityDigest === "string" && HASH.test(change.previousIdentityDigest)
      && typeof change.currentIdentityDigest === "string" && HASH.test(change.currentIdentityDigest)
      && change.previousIdentityDigest !== change.currentIdentityDigest && !changes.has(key(change)));
    changes.set(key(change), change);
  }
  return changes;
}
function onlyLaterValidUntil(before, after) {
  const later = iso(after.billingBinding?.validUntil), earlier = iso(before.billingBinding?.validUntil);
  if (!(later > earlier)) return false;
  const projected = { ...before, billingBinding: { ...before.billingBinding, validUntil: later } };
  return fullMeteringDigest(projected) === fullMeteringDigest(after);
}
export function billingWindowContinuationHistory(checkpoint) {
  const history = checkpoint?.billingWindowContinuations ?? [];
  need(Array.isArray(history) && history.length <= 128, "full_metering_billing_window_history_invalid");
  const seen = new Set();
  for (const record of history) {
    exact(record, ["version", "approvalDigest", "previousCheckpointDigest", "completedAt", "identityCount", "unassignedBytes", "archiveName", "approval"]);
    need(record.version === 1 && HASH.test(record.approvalDigest) && HASH.test(record.previousCheckpointDigest)
      && !seen.has(record.approvalDigest) && record.unassignedBytes === null
      && Number.isSafeInteger(record.identityCount) && record.identityCount > 0 && record.identityCount <= 32
      && record.archiveName === `billing-window-before-${record.previousCheckpointDigest}.json`, "full_metering_billing_window_history_invalid");
    validateApproval(record.approval);
    need(fullMeteringDigest(record.approval) === record.approvalDigest
      && record.approval.previousCheckpointDigest === record.previousCheckpointDigest
      && record.approval.activationId === checkpoint.activationId
      && record.approval.changes.length === record.identityCount
      && record.approval.notBefore <= iso(record.completedAt) && record.completedAt < record.approval.expiresAt,
    "full_metering_billing_window_history_invalid");
    seen.add(record.approvalDigest);
  }
  return structuredClone(history);
}
export function admitFullMeteringBillingWindowContinuation({ approval, checkpoint, context, activationId, identities, now }) {
  const changes = validateApproval(approval);
  need(approval.activationId === activationId && fullMeteringDigest(approval.context) === fullMeteringDigest(context));
  need(iso(approval.notBefore) <= iso(now) && now < iso(approval.expiresAt)
    && Date.parse(approval.expiresAt) - Date.parse(approval.notBefore) <= 86400000, "full_metering_billing_window_approval_expired");
  need(checkpoint && approval.previousSequence === checkpoint.sequence
    && approval.previousCheckpointDigest === fullMeteringDigest(checkpoint), "full_metering_billing_window_approval_stale");
  const history = billingWindowContinuationHistory(checkpoint), approvalDigest = fullMeteringDigest(approval);
  need(history.length < 128 && !history.some(record => record.approvalDigest === approvalDigest), "full_metering_billing_window_approval_stale");
  const active = new Map(identities.entries.map(entry => [key(entry), entry]));
  const retained = new Map(identities.retained.map(entry => [key(entry), entry]));
  const matched = new Set(), oldKeys = new Set(), channels = new Set();
  for (const source of checkpoint.sources) {
    need(!channels.has(source.channelRef) && Array.isArray(source.identities), "full_metering_binding_invalid"); channels.add(source.channelRef);
    for (const previous of source.identities) {
      need(previous.channelRef === source.channelRef && !oldKeys.has(key(previous)), "full_metering_binding_invalid"); oldKeys.add(key(previous));
      const current = active.get(key(previous));
      if (!current) {
        need(retained.get(key(previous))?.materialDigest === previous.materialDigest && !changes.has(key(previous)), "full_metering_binding_changed");
        continue;
      }
      need(fullMeteringDigest(fullMeteringBindingIdentity(previous)) === fullMeteringDigest(previous), "full_metering_binding_changed");
      if (fullMeteringDigest(previous) === fullMeteringDigest(current)) {
        need(!changes.has(key(previous)), "full_metering_billing_window_binding_invalid"); continue;
      }
      const change = changes.get(key(previous));
      need(change && onlyLaterValidUntil(previous, current)
        && change.previousIdentityDigest === fullMeteringDigest(previous)
        && change.currentIdentityDigest === fullMeteringDigest(current), "full_metering_billing_window_binding_invalid");
      matched.add(key(previous));
    }
  }
  need(matched.size === changes.size, "full_metering_billing_window_binding_invalid");
  return { changes, history, approvalDigest };
}
