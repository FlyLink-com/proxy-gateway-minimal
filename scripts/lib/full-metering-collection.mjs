import { transitionFullMeteringCounters, transitionVerifiedFullMeteringMaterialCounters, reconcileVerifiedFullMeteringScope, advanceVerifiedFullMeteringGeneration } from "../../server/services/edge/full-metering-counter-transition.mjs";
import { fullMeteringBindingIdentity, makeFullMeteringSample } from "./full-metering-sample-writer.mjs";
import { fullMeteringDigest, initializeFullMeteringJournal, readFullMeteringJournal, recoverFullMeteringJournal, commitFullMeteringJournal, withFullMeteringJournalLock, assertFullMeteringJournalNoPending, archiveFullMeteringMaterialCheckpoint, readFullMeteringMaterialCheckpointArchive } from "./full-metering-journal.mjs";
import { admitFullMeteringMaterialContinuation, materialContinuationHistory } from "./full-metering-material-continuation.mjs";
import { admitFullMeteringDataPackResets, fullMeteringDataPackResetHistory } from "./full-metering-data-pack-reset-continuation.mjs";

export const FULL_METERING_CHANNELS = Object.freeze([
  { channelRef: "channel-vultr-a-vless-reality-tcp", sourceRef: "full_metering_xray_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-sgp-a-vless-reality-tcp", sourceRef: "full_metering_xray_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-vultr-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-sgp-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-vultr-a-tuic", sourceRef: "full_metering_tuic_connections_v1", mode: "connections" }
].map(Object.freeze));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const key = entry => `${entry.channelRef ?? entry.edgeChannelRef}\0${entry.edgeCredentialRef}`;
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
export async function runFullMeteringCollection({ directory, context, activationId, mode, materialApproval = null, dataPackResetStore = null, nowFn = () => new Date().toISOString(), readInventory, readSources, applySamples, onStage }) {
  if (!["preflight", "initialize", "collect", "continue-material", "collect-pack-resets"].includes(mode) || !/^[A-Za-z0-9._:-]{1,128}$/.test(activationId)
    || typeof readInventory !== "function" || typeof readSources !== "function") fail("full_metering_collection_invalid");
  const continuation = mode === "continue-material";
  const packResets = mode === "collect-pack-resets";
  if (packResets && ["readCoinCommerceDataPackMeteringResetProofs", "getCoinCommerceDataPackMeteringResetReceipt", "recordCoinCommerceDataPackMeteringResetReceipt"]
    .some(method => typeof dataPackResetStore?.[method] !== "function")) fail("full_metering_pack_reset_invalid");
  if (!continuation && materialApproval !== null) fail("full_metering_material_approval_forbidden");
  const run = async () => {
    // Never replay an unrelated pending batch while admitting a new operation.
    if (continuation) assertFullMeteringJournalNoPending({ directory });
    if (mode === "collect" || packResets) recoverFullMeteringJournal({ directory, context, applySamples });
    const previous = mode === "collect" || continuation || packResets ? readFullMeteringJournal({ directory, context }) : null;
    if (previous && (previous.version !== 1 || previous.activationId !== activationId || !Number.isSafeInteger(previous.sequence)
      || previous.sequence < 0 || previous.sources?.length !== 5)) fail("full_metering_checkpoint_invalid");
    const admissionValue = nowFn();
    const admittedAt = admissionValue instanceof Date ? admissionValue.toISOString() : admissionValue;
    const before = readInventory();
    const identities = inventoryProjection(before);
    const history = materialContinuationHistory(previous);
    const packHistory = fullMeteringDataPackResetHistory(previous, context);
    let resetProofs = [];
    if (packResets) {
      resetProofs = dataPackResetStore.readCoinCommerceDataPackMeteringResetProofs({ now: admittedAt });
      if (!Array.isArray(resetProofs) || resetProofs.length > 32) fail("full_metering_pack_reset_invalid");
      const uncommitted = [], repairs = [];
      for (const proof of resetProofs) {
        const record = packHistory.find(item => item.proof.rotationRef === proof.rotationRef);
        if (!record) { uncommitted.push(proof); continue; }
        if (fullMeteringDigest(record.proof) !== fullMeteringDigest(proof)) fail("full_metering_binding_changed");
        const receipt = dataPackResetStore.getCoinCommerceDataPackMeteringResetReceipt({
          rotationRef: proof.rotationRef, orderRef: proof.orderRef, accountId: proof.accountId, now: admittedAt });
        if (receipt && fullMeteringDigest(receipt) !== fullMeteringDigest(record)) fail("full_metering_pack_reset_history_invalid");
        if (!receipt) {
          const archived = readFullMeteringMaterialCheckpointArchive({ directory, context, digest: record.continuation.previousCheckpointDigest });
          if (archived.activationId !== activationId || archived.sequence !== record.continuation.previousSequence) fail("full_metering_pack_reset_history_invalid");
          const recovered = admitFullMeteringDataPackResets({ proofs: [proof], checkpoint: archived, identities });
          const persistedIdentity = previous.sources.find(source => source.channelRef === proof.edgeChannelRef)?.identities
            .find(identity => identity.edgeCredentialRef === proof.edgeCredentialRef);
          if (!persistedIdentity || fullMeteringDigest(persistedIdentity) !== record.continuation.identityDigest
            || fullMeteringDigest(recovered.changes.get(key(proof)).nextIdentity) !== record.continuation.identityDigest) fail("full_metering_pack_reset_history_invalid");
          repairs.push(record);
        }
      }
      if (repairs.length) {
        // A durable journal is the authority for audit-write recovery. Do not
        // observe or baseline counters a second time to manufacture a receipt.
        for (const record of repairs) dataPackResetStore.recordCoinCommerceDataPackMeteringResetReceipt({
          proof: record.proof, continuation: record.continuation, now: admittedAt });
        return { ...previous.lastSummary, status: "reset_receipts_recovered", sampleCount: 0, recordedBytes: 0,
          dataPackResetContinuation: { identityCount: repairs.length, receiptRecovery: true, unassignedBytes: null } };
      }
      resetProofs = uncommitted;
      if (packHistory.length + resetProofs.length > 128) fail("full_metering_pack_reset_history_invalid");
    }
    const admission = continuation ? admitFullMeteringMaterialContinuation({ approval: materialApproval, checkpoint: previous, context, activationId, identities, now: admittedAt })
      : packResets ? admitFullMeteringDataPackResets({ proofs: resetProofs, checkpoint: previous, identities }) : null;
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
          if (current ? fullMeteringDigest(current) !== fullMeteringDigest(identity) && !admission?.changes.has(key(identity))
            : !expired || expired.materialDigest !== identity.materialDigest && !admission?.changes.has(key(identity))) fail("full_metering_binding_changed");
        }
      }
      const eligibleRefs = entries.map(entry => entry.edgeCredentialRef), retainedRefs = retained.map(entry => entry.edgeCredentialRef);
      const reconciled = prior ? reconcileVerifiedFullMeteringScope({ state: prior.counterState, eligibleRefs, retainedRefs }) : null;
      // Receipt + digests retain the transition link without embedding two more
      // full history snapshots in every scope/generation transition checkpoint.
      if (reconciled?.receipt) transitions.push({ beforePayloadDigest: fullMeteringDigest(prior.counterState), afterPayloadDigest: fullMeteringDigest(reconciled.nextState), receipt: reconciled.receipt });
      const advanced = reconciled && reconciled.nextState.generation !== source.generation
        ? advanceVerifiedFullMeteringGeneration({ state: reconciled.nextState, generation: source.generation, verifiedAt: source.observedAt }) : null;
      if (advanced?.receipt) transitions.push({ beforePayloadDigest: fullMeteringDigest(reconciled.nextState), afterPayloadDigest: fullMeteringDigest(advanced.nextState), receipt: advanced.receipt });
      const materialRefs = entries.filter(entry => admission?.changes.has(key(entry))).map(entry => entry.edgeCredentialRef).sort();
      const counterRequest = { state: advanced?.nextState ?? reconciled?.nextState ?? null, ...expected, generation: source.generation,
        eligibleRefs, retainedRefs, minObservedAt: startedAt, observedAt: source.observedAt, now, observations: source.observations };
      const outcome = materialRefs.length && !advanced
        ? transitionVerifiedFullMeteringMaterialCounters({ ...counterRequest, materialRefs })
        : transitionFullMeteringCounters(counterRequest);
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
      const archivedIdentities = prior?.identities.filter(identity => !entries.some(entry => entry.edgeCredentialRef === identity.edgeCredentialRef))
        .map(identity => packResets ? admission.changes.get(key(identity))?.nextIdentity ?? identity : identity) ?? [];
      nextSources.push({ channelRef: source.channelRef, counterState: outcome.nextState, identities: [...entries, ...archivedIdentities] });
      channels.push({ channelRef: source.channelRef, ...outcome.summary });
    }
    const summary = { type: "full_metering_collection", ok: true, status: mode === "initialize" ? "baseline_initialized" : mode === "preflight" ? "preflight_passed" : "collected",
      channelCount: channels.length, eligibleCount: channels.reduce((n, channel) => n + channel.eligibleCount, 0),
      pendingStartCount: channels.reduce((n, channel) => n + channel.pendingCount, 0), sampleCount: samples.length,
      recordedBytes: samples.reduce((n, sample) => n + sample.record.totalBytes, 0), cycleBoundaryUnassignedBytes, channels,
      historicalDebits: false, identitiesIssued: false, entitlementsChanged: false, sgpTuicSidecarChanged: false };
    if (continuation) summary.materialContinuation = { identityCount: admission.changes.size, unassignedBytes: null };
    if (packResets && resetProofs.length) summary.dataPackResetContinuation = { identityCount: resetProofs.length, unassignedBytes: null };
    if (!Number.isSafeInteger(summary.recordedBytes)) fail("full_metering_counter_invalid");
    if (mode === "preflight") return summary;
    const nextCheckpoint = { version: 1, activationId, startedAt, sequence: (previous?.sequence ?? -1) + 1,
      sources: nextSources, scopeTransitions: transitions, lastSummary: summary };
    if (!Number.isSafeInteger(nextCheckpoint.sequence)) fail("full_metering_checkpoint_invalid");
    if (history.length) nextCheckpoint.materialContinuations = history;
    if (packHistory.length) nextCheckpoint.dataPackResetContinuations = packHistory;
    if (continuation) {
      // Zero-delta affected refs do not reach the sample writer. Recheck their
      // complete authority immediately before creating durable state as well.
      if (fullMeteringDigest(identities) !== fullMeteringDigest(inventoryProjection(readInventory()))) fail("full_metering_binding_changed");
      const commitTime = nowFn(), completedAt = commitTime instanceof Date ? commitTime.toISOString() : commitTime;
      admitFullMeteringMaterialContinuation({ approval: materialApproval, checkpoint: previous, context, activationId, identities, now: completedAt });
      const archiveName = archiveFullMeteringMaterialCheckpoint({ directory, context, checkpoint: previous });
      nextCheckpoint.materialContinuations = [...history, { version: 1, approvalDigest: admission.approvalDigest,
        previousCheckpointDigest: fullMeteringDigest(previous), completedAt, identityCount: admission.changes.size, unassignedBytes: null, archiveName,
        approval: structuredClone(materialApproval) }];
    }
    if (packResets && resetProofs.length) {
      if (fullMeteringDigest(identities) !== fullMeteringDigest(inventoryProjection(readInventory()))) fail("full_metering_binding_changed");
      const commitValue = nowFn(), completedAt = commitValue instanceof Date ? commitValue.toISOString() : commitValue;
      const currentProofs = dataPackResetStore.readCoinCommerceDataPackMeteringResetProofs({ now: completedAt });
      for (const proof of resetProofs) {
        if (!currentProofs.some(item => fullMeteringDigest(item) === fullMeteringDigest(proof))) fail("full_metering_binding_changed");
      }
      admitFullMeteringDataPackResets({ proofs: resetProofs, checkpoint: previous, identities });
      const previousCheckpointDigest = fullMeteringDigest(previous);
      const archiveName = archiveFullMeteringMaterialCheckpoint({ directory, context, checkpoint: previous });
      const records = resetProofs.map(proof => ({ version: 1, proof: structuredClone(proof), continuation: {
        version: 1, activationId, context: structuredClone(context), previousSequence: previous.sequence,
        sequence: nextCheckpoint.sequence, previousCheckpointDigest,
        identityDigest: fullMeteringDigest(admission.changes.get(key(proof)).nextIdentity),
        proofDigest: fullMeteringDigest(proof), archiveName, completedAt } }));
      nextCheckpoint.dataPackResetContinuations = [...packHistory, ...records];
      fullMeteringDataPackResetHistory(nextCheckpoint, context);
    }
    if (mode === "initialize") {
      if (samples.length) fail("full_metering_initialization_charge_forbidden");
      initializeFullMeteringJournal({ directory, context, checkpoint: nextCheckpoint });
    } else commitFullMeteringJournal({ directory, context, previousCheckpoint: previous, nextCheckpoint, samples, applySamples, onStage });
    if (packResets && resetProofs.length) {
      const receiptValue = nowFn(), receiptAt = receiptValue instanceof Date ? receiptValue.toISOString() : receiptValue;
      for (const record of nextCheckpoint.dataPackResetContinuations.slice(packHistory.length)) {
        dataPackResetStore.recordCoinCommerceDataPackMeteringResetReceipt({ proof: record.proof, continuation: record.continuation, now: receiptAt });
      }
    }
    return summary;
  };
  return mode === "collect" || continuation || packResets ? withFullMeteringJournalLock({ directory }, run) : run();
}
