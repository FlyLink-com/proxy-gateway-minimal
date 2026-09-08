import { transitionFullMeteringCounters, reconcileVerifiedFullMeteringScope, advanceVerifiedFullMeteringGeneration } from "../../server/services/edge/full-metering-counter-transition.mjs";
import { fullMeteringBindingIdentity, makeFullMeteringSample } from "./full-metering-sample-writer.mjs";
import { fullMeteringDigest, initializeFullMeteringJournal, readFullMeteringJournal, recoverFullMeteringJournal, commitFullMeteringJournal, withFullMeteringJournalLock } from "./full-metering-journal.mjs";

export const FULL_METERING_CHANNELS = Object.freeze([
  { channelRef: "channel-vultr-a-vless-reality-tcp", sourceRef: "full_metering_xray_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-sgp-a-vless-reality-tcp", sourceRef: "full_metering_xray_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-vultr-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-sgp-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-vultr-a-tuic", sourceRef: "full_metering_tuic_connections_v1", mode: "connections" }
].map(Object.freeze));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const key = entry => `${entry.channelRef}\0${entry.edgeCredentialRef}`;
function inventoryProjection(inventory) {
  if (!Array.isArray(inventory?.entries) || !Array.isArray(inventory?.retainedBindings)) fail("full_metering_binding_invalid");
  const seen = new Set();
  const entries = inventory.entries.map(entry => fullMeteringBindingIdentity(entry));
  const retained = inventory.retainedBindings.map(entry => ({ channelRef: entry.channelRef, edgeCredentialRef: entry.edgeCredentialRef, materialDigest: entry.materialDigest }));
  for (const entry of [...entries, ...retained]) {
    if (!FULL_METERING_CHANNELS.some(source => source.channelRef === entry.channelRef) || seen.has(key(entry))) fail("full_metering_binding_invalid");
    seen.add(key(entry));
  }
  const sort = (a, b) => key(a).localeCompare(key(b));
  return { entries: entries.sort(sort), retained: retained.sort(sort) };
}
function verifySources(sources) {
  if (!Array.isArray(sources) || sources.length !== FULL_METERING_CHANNELS.length) fail("full_metering_source_scope_invalid");
  const seen = new Set();
  for (const source of sources) {
    const expected = FULL_METERING_CHANNELS.find(item => item.channelRef === source.channelRef);
    if (!expected || seen.has(source.channelRef) || source.sourceRef !== expected.sourceRef || source.mode !== expected.mode) fail("full_metering_source_scope_invalid");
    seen.add(source.channelRef);
  }
}
// readSources is an owned, read-only host driver. It must verify endpoint socket
// ownership, runtime/config/material identity and generation before AND after a
// non-clearing fetch. Public/caller-supplied counter batches are never accepted
// by the production CLI. Tests inject disposable snapshots through this API.
export async function runFullMeteringCollection({ directory, context, activationId, mode, nowFn = () => new Date().toISOString(), readInventory, readSources, applySamples, onStage }) {
  if (!["preflight", "initialize", "collect"].includes(mode) || !/^[A-Za-z0-9._:-]{1,128}$/.test(activationId)
    || typeof readInventory !== "function" || typeof readSources !== "function") fail("full_metering_collection_invalid");
  const run = async () => {
    if (mode === "collect") recoverFullMeteringJournal({ directory, context, applySamples });
    const previous = mode === "collect" ? readFullMeteringJournal({ directory, context }) : null;
    if (previous && (previous.version !== 1 || previous.activationId !== activationId || !Number.isSafeInteger(previous.sequence)
      || previous.sequence < 0 || previous.sources?.length !== 5)) fail("full_metering_checkpoint_invalid");
    const admissionValue = nowFn();
    const admittedAt = admissionValue instanceof Date ? admissionValue.toISOString() : admissionValue;
    const before = readInventory();
    const identities = inventoryProjection(before);
    const sources = await readSources(before);
    verifySources(sources);
    if (fullMeteringDigest(identities) !== fullMeteringDigest(inventoryProjection(readInventory()))) fail("full_metering_binding_changed");
    const nowValue = nowFn(), now = nowValue instanceof Date ? nowValue.toISOString() : nowValue;
    const startedAt = previous?.startedAt ?? admittedAt;
    const samples = [], nextSources = [], transitions = [], channels = [];
    let cycleBoundaryUnassignedBytes = 0;
    for (const expected of FULL_METERING_CHANNELS) {
      const source = sources.find(item => item.channelRef === expected.channelRef);
      const entries = identities.entries.filter(entry => entry.channelRef === source.channelRef);
      const retained = identities.retained.filter(entry => entry.channelRef === source.channelRef);
      const prior = previous?.sources.find(item => item.channelRef === source.channelRef);
      if (previous && !prior) fail("full_metering_checkpoint_invalid");
      if (prior) {
        for (const identity of prior.identities) {
          const current = entries.find(entry => entry.edgeCredentialRef === identity.edgeCredentialRef);
          const expired = retained.find(entry => entry.edgeCredentialRef === identity.edgeCredentialRef);
          if (current ? fullMeteringDigest(current) !== fullMeteringDigest(identity) : !expired || expired.materialDigest !== identity.materialDigest) fail("full_metering_binding_changed");
        }
      }
      const eligibleRefs = entries.map(entry => entry.edgeCredentialRef), retainedRefs = retained.map(entry => entry.edgeCredentialRef);
      const reconciled = prior ? reconcileVerifiedFullMeteringScope({ state: prior.counterState, eligibleRefs, retainedRefs }) : null;
      if (reconciled?.receipt) transitions.push({ beforeState: prior.counterState, afterState: reconciled.nextState, receipt: reconciled.receipt });
      const advanced = reconciled && reconciled.nextState.generation !== source.generation
        ? advanceVerifiedFullMeteringGeneration({ state: reconciled.nextState, generation: source.generation, verifiedAt: source.observedAt }) : null;
      if (advanced?.receipt) transitions.push({ beforeState: reconciled.nextState, afterState: advanced.nextState, receipt: advanced.receipt });
      const outcome = transitionFullMeteringCounters({ state: advanced?.nextState ?? reconciled?.nextState ?? null, ...expected, generation: source.generation,
        eligibleRefs, retainedRefs, minObservedAt: startedAt, observedAt: source.observedAt, now, observations: source.observations });
      for (const delta of outcome.deltas) {
        try { samples.push(makeFullMeteringSample({ binding: entries.find(entry => entry.edgeCredentialRef === delta.edgeCredentialRef), activationId, generation: source.generation, delta })); }
        catch (error) {
          // A polling interval straddling a cycle cannot be allocated precisely.
          // Advance its checkpoint without charging either period; expose this
          // small unassigned gap, never estimate or debit historical bytes.
          if (error.code !== "full_metering_billing_cycle_changed") throw error;
          cycleBoundaryUnassignedBytes += delta.totalBytes;
          if (!Number.isSafeInteger(cycleBoundaryUnassignedBytes)) fail("full_metering_counter_invalid");
        }
      }
      const archivedIdentities = prior?.identities.filter(identity => !entries.some(entry => entry.edgeCredentialRef === identity.edgeCredentialRef)) ?? [];
      nextSources.push({ channelRef: source.channelRef, counterState: outcome.nextState, identities: [...entries, ...archivedIdentities] });
      channels.push({ channelRef: source.channelRef, ...outcome.summary });
    }
    const summary = { type: "full_metering_collection", ok: true, status: mode === "initialize" ? "baseline_initialized" : mode === "preflight" ? "preflight_passed" : "collected",
      channelCount: channels.length, eligibleCount: channels.reduce((n, channel) => n + channel.eligibleCount, 0),
      pendingStartCount: channels.reduce((n, channel) => n + channel.pendingCount, 0), sampleCount: samples.length,
      recordedBytes: samples.reduce((n, sample) => n + sample.record.totalBytes, 0), cycleBoundaryUnassignedBytes, channels,
      historicalDebits: false, identitiesIssued: false, entitlementsChanged: false, sgpTuicSidecarChanged: false };
    if (!Number.isSafeInteger(summary.recordedBytes)) fail("full_metering_counter_invalid");
    if (mode === "preflight") return summary;
    const nextCheckpoint = { version: 1, activationId, startedAt, sequence: (previous?.sequence ?? -1) + 1,
      sources: nextSources, scopeTransitions: transitions, lastSummary: summary };
    if (mode === "initialize") {
      if (samples.length) fail("full_metering_initialization_charge_forbidden");
      initializeFullMeteringJournal({ directory, context, checkpoint: nextCheckpoint });
    } else commitFullMeteringJournal({ directory, context, previousCheckpoint: previous, nextCheckpoint, samples, applySamples, onStage });
    return summary;
  };
  return mode === "collect" ? withFullMeteringJournalLock({ directory }, run) : run();
}
