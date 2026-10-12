import { transitionFullMeteringCounters, transitionVerifiedFullMeteringMaterialCounters, transitionVerifiedFullMeteringBillingWindowCounters, transitionVerifiedFullMeteringPlanSwitchCounters, transitionVerifiedFullMeteringPlanSwitchReactivationCounters, reconcileVerifiedFullMeteringScope, advanceVerifiedFullMeteringGeneration } from "../../server/services/edge/full-metering-counter-transition.mjs";
import { fullMeteringBindingIdentity, makeFullMeteringSample } from "./full-metering-sample-writer.mjs";
import { fullMeteringDigest, initializeFullMeteringJournal, readFullMeteringJournal, recoverFullMeteringJournal, commitFullMeteringJournal, withFullMeteringJournalLock, assertFullMeteringJournalNoPending, archiveFullMeteringMaterialCheckpoint } from "./full-metering-journal.mjs";
import { admitFullMeteringMaterialContinuation, materialContinuationHistory } from "./full-metering-material-continuation.mjs";
import { admitFullMeteringBillingWindowContinuation, billingWindowContinuationHistory } from "./full-metering-billing-window-continuation.mjs";
import { admitFullMeteringPlanSwitches, planSwitchContinuationHistory } from "./full-metering-plan-switch-continuation.mjs";
import { FULL_METERING_SCOPE, LOCAL_METERING_SCOPE, fullMeteringChannels, assertFullMeteringContextScope, assertFullMeteringCheckpointScope } from "./full-metering-scope.mjs";

export { FULL_METERING_CHANNELS } from "./full-metering-scope.mjs";
const fail = code => { throw Object.assign(new Error(code), { code }); };
const key = entry => `${entry.channelRef}\0${entry.edgeCredentialRef}`;
function inventoryProjection(inventory, channels) {
  if (!Array.isArray(inventory?.entries) || !Array.isArray(inventory?.retainedBindings)) fail("full_metering_binding_invalid");
  if (Object.hasOwn(inventory, "channelRefs") && (!Array.isArray(inventory.channelRefs)
    || inventory.channelRefs.length !== channels.length || new Set(inventory.channelRefs).size !== channels.length
    || inventory.channelRefs.some(ref => !channels.some(source => source.channelRef === ref)))) fail("full_metering_binding_invalid");
  const seen = new Set();
  const entries = inventory.entries.map(entry => fullMeteringBindingIdentity(entry));
  const retained = inventory.retainedBindings.map(entry => ({ channelRef: entry.channelRef, edgeCredentialRef: entry.edgeCredentialRef, materialDigest: entry.materialDigest,
    // Bind the driver's new runtime exclusion across the entire source read,
    // even if an already-retained identity only changes its retention reason.
    runtimeAbsenceRequired: entry.reasons?.includes("portal_durable_scope_supersedes_primary") === true }));
  for (const entry of [...entries, ...retained]) {
    if (!channels.some(source => source.channelRef === entry.channelRef) || seen.has(key(entry))) fail("full_metering_binding_invalid");
    seen.add(key(entry));
  }
  const sort = (a, b) => key(a).localeCompare(key(b));
  return { entries: entries.sort(sort), retained: retained.sort(sort) };
}
function verifySources(sources, channels) {
  if (!Array.isArray(sources) || sources.length !== channels.length) fail("full_metering_source_scope_invalid");
  const seen = new Set();
  for (const source of sources) {
    const expected = channels.find(item => item.channelRef === source.channelRef);
    if (!expected || seen.has(source.channelRef) || source.sourceRef !== expected.sourceRef || source.mode !== expected.mode) fail("full_metering_source_scope_invalid");
    seen.add(source.channelRef);
  }
}
// readSources is an owned, read-only host driver. It must verify endpoint socket
// ownership, runtime/config/material identity and generation before AND after a
// non-clearing fetch. Public/caller-supplied counter batches are never accepted
// by the production CLI. Tests inject disposable snapshots through this API.
export async function runFullMeteringCollection({ directory, context, activationId, mode, meteringScope = FULL_METERING_SCOPE, materialApproval = null, billingWindowApproval = null, nowFn = () => new Date().toISOString(), readInventory, readSources, readPlanSwitchProof, applySamples, onStage }) {
  const selectedChannels = fullMeteringChannels(meteringScope);
  assertFullMeteringContextScope(context, meteringScope);
  const validateCheckpoint = checkpoint => {
    assertFullMeteringCheckpointScope(checkpoint, meteringScope);
    if (checkpoint.version !== 1 || checkpoint.activationId !== activationId || !Number.isSafeInteger(checkpoint.sequence)
      || checkpoint.sequence < 0) fail("full_metering_checkpoint_invalid");
    planSwitchContinuationHistory(checkpoint);
  };
  if (!["preflight", "initialize", "collect", "continue-material", "continue-billing-window"].includes(mode) || !/^[A-Za-z0-9._:-]{1,128}$/.test(activationId)
    || typeof readInventory !== "function" || typeof readSources !== "function") fail("full_metering_collection_invalid");
  const materialContinuation = mode === "continue-material", billingContinuation = mode === "continue-billing-window";
  const continuation = materialContinuation || billingContinuation;
  if (!materialContinuation && materialApproval !== null) fail("full_metering_material_approval_forbidden");
  if (!billingContinuation && billingWindowApproval !== null) fail("full_metering_billing_window_approval_forbidden");
  const run = async () => {
    // Never replay an unrelated pending batch while admitting a new operation.
    if (continuation) assertFullMeteringJournalNoPending({ directory });
    if (mode === "collect") recoverFullMeteringJournal({ directory, context, applySamples, validateCheckpoint });
    const previous = mode === "collect" || continuation ? readFullMeteringJournal({ directory, context }) : null;
    if (previous) validateCheckpoint(previous);
    const admissionValue = nowFn();
    const admittedAt = admissionValue instanceof Date ? admissionValue.toISOString() : admissionValue;
    const before = readInventory();
    const identities = inventoryProjection(before, selectedChannels);
    const history = materialContinuationHistory(previous);
    const billingHistory = billingWindowContinuationHistory(previous);
    const planHistory = planSwitchContinuationHistory(previous);
    const admission = materialContinuation ? admitFullMeteringMaterialContinuation({ approval: materialApproval, checkpoint: previous, context, activationId, identities, now: admittedAt }) : null;
    const billingAdmission = billingContinuation ? admitFullMeteringBillingWindowContinuation({ approval: billingWindowApproval, checkpoint: previous, context, activationId, identities, now: admittedAt }) : null;
    const planAdmission = mode === "collect" ? admitFullMeteringPlanSwitches({ checkpoint: previous, identities, readPlanSwitchProof, now: admittedAt }) : null;
    const sources = await readSources(before);
    verifySources(sources, selectedChannels);
    if (fullMeteringDigest(identities) !== fullMeteringDigest(inventoryProjection(readInventory(), selectedChannels))) fail("full_metering_binding_changed");
    const nowValue = nowFn(), now = nowValue instanceof Date ? nowValue.toISOString() : nowValue;
    const startedAt = previous?.startedAt ?? admittedAt;
    const samples = [], nextSources = [], transitions = [], channels = [];
    let cycleBoundaryUnassignedBytes = 0;
    for (const expected of selectedChannels) {
      const source = sources.find(item => item.channelRef === expected.channelRef);
      const entries = identities.entries.filter(entry => entry.channelRef === source.channelRef);
      const retained = identities.retained.filter(entry => entry.channelRef === source.channelRef);
      const prior = previous?.sources.find(item => item.channelRef === source.channelRef);
      if (previous && !prior) fail("full_metering_checkpoint_invalid");
      if (prior) {
        for (const identity of prior.identities) {
          const current = entries.find(entry => entry.edgeCredentialRef === identity.edgeCredentialRef);
          const expired = retained.find(entry => entry.edgeCredentialRef === identity.edgeCredentialRef);
          if (current ? fullMeteringDigest(current) !== fullMeteringDigest(identity) && !admission?.changes.has(key(identity)) && !billingAdmission?.changes.has(key(identity)) && !planAdmission?.changes.has(key(identity)) : !expired || expired.materialDigest !== identity.materialDigest) fail("full_metering_binding_changed");
        }
      }
      const eligibleRefs = entries.map(entry => entry.edgeCredentialRef), retainedRefs = retained.map(entry => entry.edgeCredentialRef);
      const materialRefs = entries.filter(entry => admission?.changes.has(key(entry))).map(entry => entry.edgeCredentialRef).sort();
      const billingWindowRefs = entries.filter(entry => billingAdmission?.changes.has(key(entry))).map(entry => entry.edgeCredentialRef).sort();
      const planSwitchRefs = entries.filter(entry => planAdmission?.changes.has(key(entry))).map(entry => entry.edgeCredentialRef).sort();
      const reactivationRefs = planSwitchRefs.filter(ref => prior?.counterState.retainedRefs.includes(ref));
      const counterInput = { ...expected, generation: source.generation, eligibleRefs, retainedRefs,
        minObservedAt: startedAt, observedAt: source.observedAt, now, observations: source.observations };
      let counterRequest, outcome;
      if (reactivationRefs.length) {
        // Ordinary scope reconciliation deliberately forbids retained -> active.
        // Only commerce-proven identities can take this atomic reactivation path.
        // A real generation boundary is still verified by the owned source driver;
        // never synthesize one to bypass archived counters or their history.
        const advanced = prior.counterState.generation !== source.generation
          ? advanceVerifiedFullMeteringGeneration({ state: prior.counterState, generation: source.generation, verifiedAt: source.observedAt }) : null;
        if (advanced?.receipt) transitions.push({ beforePayloadDigest: fullMeteringDigest(prior.counterState), afterPayloadDigest: fullMeteringDigest(advanced.nextState), receipt: advanced.receipt });
        counterRequest = { state: advanced?.nextState ?? prior.counterState, ...counterInput };
        outcome = transitionVerifiedFullMeteringPlanSwitchReactivationCounters({ ...counterRequest, reactivationRefs, planSwitchRefs });
      } else {
        const reconciled = prior ? reconcileVerifiedFullMeteringScope({ state: prior.counterState, eligibleRefs, retainedRefs }) : null;
        // Receipt + digests retain the transition without duplicating full states.
        if (reconciled?.receipt) transitions.push({ beforePayloadDigest: fullMeteringDigest(prior.counterState), afterPayloadDigest: fullMeteringDigest(reconciled.nextState), receipt: reconciled.receipt });
        const advanced = reconciled && reconciled.nextState.generation !== source.generation
          ? advanceVerifiedFullMeteringGeneration({ state: reconciled.nextState, generation: source.generation, verifiedAt: source.observedAt }) : null;
        if (advanced?.receipt) transitions.push({ beforePayloadDigest: fullMeteringDigest(reconciled.nextState), afterPayloadDigest: fullMeteringDigest(advanced.nextState), receipt: advanced.receipt });
        counterRequest = { state: advanced?.nextState ?? reconciled?.nextState ?? null, ...counterInput };
        outcome = materialRefs.length && !advanced
          ? transitionVerifiedFullMeteringMaterialCounters({ ...counterRequest, materialRefs })
          : billingWindowRefs.length && !advanced
            ? transitionVerifiedFullMeteringBillingWindowCounters({ ...counterRequest, billingWindowRefs })
            : planSwitchRefs.length && !advanced
              ? transitionVerifiedFullMeteringPlanSwitchCounters({ ...counterRequest, planSwitchRefs })
              : transitionFullMeteringCounters(counterRequest);
      }
      if (outcome.receipt) transitions.push({ beforePayloadDigest: fullMeteringDigest(counterRequest.state), afterPayloadDigest: fullMeteringDigest(outcome.nextState), receipt: outcome.receipt });
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
    if (meteringScope === LOCAL_METERING_SCOPE) {
      summary.meteringScope = meteringScope;
      // Coverage is not a healthy verdict for deferred sources, nor zero usage.
      summary.deferredSources = { status: "paused", usage: "unknown", channelCount: 2, sidecar: "not_enabled_by_this_collector" };
    }
    if (admission) summary.materialContinuation = { identityCount: admission.changes.size, unassignedBytes: null };
    if (billingAdmission) summary.billingWindowContinuation = { identityCount: billingAdmission.changes.size, unassignedBytes: null };
    if (planAdmission?.changes.size) summary.planSwitchContinuation = { identityCount: planAdmission.changes.size, unassignedBytes: null };
    if (!Number.isSafeInteger(summary.recordedBytes)) fail("full_metering_counter_invalid");
    if (mode === "preflight") return summary;
    const nextCheckpoint = { version: 1, activationId, startedAt, sequence: (previous?.sequence ?? -1) + 1,
      sources: nextSources, scopeTransitions: transitions, lastSummary: summary };
    if (meteringScope === LOCAL_METERING_SCOPE) nextCheckpoint.meteringScope = meteringScope;
    if (!Number.isSafeInteger(nextCheckpoint.sequence)) fail("full_metering_checkpoint_invalid");
    if (history.length) nextCheckpoint.materialContinuations = history;
    if (billingHistory.length) nextCheckpoint.billingWindowContinuations = billingHistory;
    if (planHistory.length) nextCheckpoint.planSwitchContinuations = planHistory;
    if (planAdmission?.changes.size) {
      if (fullMeteringDigest(identities) !== fullMeteringDigest(inventoryProjection(readInventory(), selectedChannels))) fail("full_metering_binding_changed");
      const commitTime = nowFn(), completedAt = commitTime instanceof Date ? commitTime.toISOString() : commitTime;
      const finalAdmission = admitFullMeteringPlanSwitches({ checkpoint: previous, identities, readPlanSwitchProof, now: completedAt });
      if (fullMeteringDigest([...planAdmission.changes]) !== fullMeteringDigest([...finalAdmission.changes])) fail("full_metering_plan_switch_evidence_changed");
      const archiveName = archiveFullMeteringMaterialCheckpoint({ directory, context, checkpoint: previous, namePrefix: "plan-switch-before" });
      nextCheckpoint.planSwitchContinuations = [...planHistory, { version: 1, previousCheckpointDigest: fullMeteringDigest(previous),
        completedAt, identityCount: planAdmission.changes.size, unassignedBytes: null, archiveName, changes: [...planAdmission.changes.values()] }];
    }
    if (admission || billingAdmission) {
      // Zero-delta affected refs do not reach the sample writer. Recheck their
      // complete authority immediately before creating durable state as well.
      if (fullMeteringDigest(identities) !== fullMeteringDigest(inventoryProjection(readInventory(), selectedChannels))) fail("full_metering_binding_changed");
      const commitTime = nowFn(), completedAt = commitTime instanceof Date ? commitTime.toISOString() : commitTime;
      if (admission) {
        admitFullMeteringMaterialContinuation({ approval: materialApproval, checkpoint: previous, context, activationId, identities, now: completedAt });
        const archiveName = archiveFullMeteringMaterialCheckpoint({ directory, context, checkpoint: previous });
        nextCheckpoint.materialContinuations = [...history, { version: 1, approvalDigest: admission.approvalDigest,
          previousCheckpointDigest: fullMeteringDigest(previous), completedAt, identityCount: admission.changes.size, unassignedBytes: null, archiveName,
          approval: structuredClone(materialApproval) }];
      }
      if (billingAdmission) {
        admitFullMeteringBillingWindowContinuation({ approval: billingWindowApproval, checkpoint: previous, context, activationId, identities, now: completedAt });
        const archiveName = archiveFullMeteringMaterialCheckpoint({ directory, context, checkpoint: previous, namePrefix: "billing-window-before" });
        nextCheckpoint.billingWindowContinuations = [...billingHistory, { version: 1, approvalDigest: billingAdmission.approvalDigest,
          previousCheckpointDigest: fullMeteringDigest(previous), completedAt, identityCount: billingAdmission.changes.size, unassignedBytes: null, archiveName,
          approval: structuredClone(billingWindowApproval) }];
      }
    }
    if (mode === "initialize") {
      if (samples.length) fail("full_metering_initialization_charge_forbidden");
      initializeFullMeteringJournal({ directory, context, checkpoint: nextCheckpoint });
    } else commitFullMeteringJournal({ directory, context, previousCheckpoint: previous, nextCheckpoint, samples, applySamples, onStage });
    return summary;
  };
  return mode === "collect" || continuation ? withFullMeteringJournalLock({ directory }, run) : run();
}
