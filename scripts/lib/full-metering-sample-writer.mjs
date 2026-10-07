import { fullMeteringDigest } from "./full-metering-journal.mjs";
import { usageCycleForBinding } from "../../server/services/platform/usage-billing-cycle.mjs";
import { fullMeteringChannels, FULL_METERING_SCOPE, LOCAL_METERING_SCOPE } from "./full-metering-scope.mjs";

const fail = code => { throw Object.assign(new Error(code), { code }); };
const REF = /^[A-Za-z0-9._:-]{1,128}$/;
const FIELDS = ["sourceRef", "channelRef", "edgeCredentialRef", "accountId", "entitlementId", "requestId"];
export function fullMeteringBindingIdentity(binding) {
  const result = {};
  for (const field of FIELDS) {
    if (!REF.test(binding?.[field] || "")) fail("full_metering_binding_invalid");
    result[field] = binding[field];
  }
  const billing = binding?.billingBinding;
  if (!billing || typeof billing.plan !== "string" || !billing.plan.trim()) fail("full_metering_binding_invalid");
  result.billingBinding = { plan: billing.plan, validFrom: iso(billing.validFrom), validUntil: iso(billing.validUntil) };
  // The strict DB inspector separately verifies complete material and resolver
  // evidence. Only stable ownership/period fields belong to this continuity key;
  // unrelated account last-used timestamps must not halt normal collection.
  if (typeof binding.materialDigest !== "string" || !binding.materialDigest.trim() || binding.materialDigest.length > 256) fail("full_metering_binding_invalid");
  result.materialDigest = binding.materialDigest;
  return result;
}
function iso(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail("full_metering_interval_invalid");
  return value;
}
export function makeFullMeteringSample({ binding, activationId, generation, delta }) {
  const identity = fullMeteringBindingIdentity(binding);
  if (!REF.test(activationId) || !/^[a-f0-9]{64}$/.test(generation)) fail("full_metering_sample_invalid");
  const { uploadBytes, downloadBytes, totalBytes } = delta;
  if (![uploadBytes, downloadBytes, totalBytes].every(value => Number.isSafeInteger(value) && value >= 0)
    || uploadBytes + downloadBytes !== totalBytes || !Number.isSafeInteger(uploadBytes + downloadBytes) || totalBytes === 0) fail("full_metering_counter_invalid");
  const intervalStartedAt = iso(delta.intervalStartedAt), intervalEndedAt = iso(delta.intervalEndedAt);
  if (intervalStartedAt >= intervalEndedAt || intervalStartedAt < identity.billingBinding.validFrom || intervalEndedAt > identity.billingBinding.validUntil) fail("full_metering_interval_invalid");
  const first = usageCycleForBinding(identity.billingBinding, intervalStartedAt);
  const last = usageCycleForBinding(identity.billingBinding, intervalEndedAt);
  if (!first || !last || first.startedAt !== last.startedAt || first.endedAt !== last.endedAt) fail("full_metering_billing_cycle_changed");
  const core = { ...Object.fromEntries(FIELDS.map(key => [key, identity[key]])), observedAt: intervalEndedAt,
    intervalStartedAt, intervalEndedAt, uploadBytes, downloadBytes, totalBytes, createdAt: intervalEndedAt };
  const digest = fullMeteringDigest({ activationId, generation, identity, core });
  return { version: 1, activationId, generation, identity, record: { ...core, id: `usage_full_${digest}`, sampleDigest: `sha256:${digest}` } };
}
function validate(sample) {
  if (!sample || Object.keys(sample).sort().join(",") !== "activationId,generation,identity,record,version" || sample.version !== 1) fail("full_metering_sample_invalid");
  let expected;
  try { expected = makeFullMeteringSample({ binding: sample.identity, activationId: sample.activationId, generation: sample.generation, delta: sample.record }); }
  catch { fail("full_metering_sample_invalid"); }
  if (fullMeteringDigest(expected) !== fullMeteringDigest(sample)) fail("full_metering_sample_invalid");
}
export function createFullMeteringSampleWriter({ database, controlStore, readBindings, meteringScope = FULL_METERING_SCOPE, activationId }) {
  const channels = fullMeteringChannels(meteringScope);
  if (!database || !controlStore || typeof readBindings !== "function") fail("full_metering_writer_invalid");
  if ((meteringScope === LOCAL_METERING_SCOPE || activationId !== undefined) && (typeof activationId !== "string" || !REF.test(activationId))) fail("full_metering_writer_invalid");
  return function applySamples(samples) {
    if (!Array.isArray(samples) || samples.length > 10000) fail("full_metering_batch_invalid");
    const seen = new Set();
    samples.forEach(sample => {
      validate(sample);
      if (!channels.some(source => source.channelRef === sample.record.channelRef && source.sourceRef === sample.record.sourceRef)
        || (activationId !== undefined && sample.activationId !== activationId)) fail("full_metering_sample_scope_invalid");
      if (seen.has(sample.record.id)) fail("full_metering_sample_invalid"); seen.add(sample.record.id);
    });
    return database.transaction(() => {
      let inventory;
      const known = new Map();
      const pending = [];
      for (const sample of samples) {
        const previous = controlStore.getUsageSampleByDigest(sample.record.sampleDigest);
        if (previous) {
          if (fullMeteringDigest(previous) !== fullMeteringDigest(sample.record)) fail("full_metering_sample_collision");
          continue;
        }
        if (!inventory) {
          inventory = readBindings();
          for (const entry of inventory.entries) {
            if (!channels.some(source => source.channelRef === entry.channelRef && source.sourceRef === entry.sourceRef)) fail("full_metering_binding_changed");
            const key = `${entry.channelRef}\0${entry.edgeCredentialRef}`;
            if (known.has(key)) fail("full_metering_binding_changed");
            known.set(key, fullMeteringBindingIdentity(entry));
          }
        }
        const current = known.get(`${sample.record.channelRef}\0${sample.record.edgeCredentialRef}`);
        if (!current || fullMeteringDigest(current) !== fullMeteringDigest(sample.identity)) fail("full_metering_binding_changed");
        pending.push(sample.record);
      }
      for (const record of pending) {
        const rollup = controlStore.getUsageRollupByEdgeCredentialRef(record.edgeCredentialRef);
        if (rollup) {
          if (["accountId", "entitlementId", "requestId", "channelRef"].some(key => rollup[key] !== record[key])
            || ["uploadBytes", "downloadBytes", "totalBytes"].some(key => !Number.isSafeInteger(rollup[key]) || rollup[key] < 0 || !Number.isSafeInteger(rollup[key] + record[key]))
            || rollup.totalBytes !== rollup.uploadBytes + rollup.downloadBytes
            || (rollup.lastObservedAt && rollup.lastObservedAt > record.observedAt)) fail("full_metering_rollup_invalid");
        }
        const outcome = controlStore.recordUsageSample(record);
        if (!outcome.inserted || fullMeteringDigest(outcome.sample) !== fullMeteringDigest(record)) fail("full_metering_sample_collision");
      }
      return { insertedCount: pending.length, alreadyRecordedCount: samples.length - pending.length };
    }).immediate();
  };
}
