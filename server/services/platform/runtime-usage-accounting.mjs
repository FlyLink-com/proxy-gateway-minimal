import { projectTrafficCollectorState } from "./traffic-collector-state.mjs";
import {
  normalizeUnresolvedReasonCounts,
  safeUnresolvedReason,
  unresolvedReasonCountsForRecords
} from "./unresolved-binding-provenance.mjs";

function usageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function blockerCodes(result) {
  return Array.isArray(result?.blockers)
    ? result.blockers.map((blocker) => text(blocker.code)).filter(Boolean)
    : [];
}

function redactedBlocker(code) {
  return { code };
}

function collectorExceptionResult(channelRef) {
  return {
    ok: false,
    status: "collector_error",
    channelRef,
    observations: [],
    blockers: [redactedBlocker("collector_exception")],
    nextAction: "review_usage_collector_failure"
  };
}

function accountingExceptionResult(observation) {
  return {
    ok: false,
    status: "accounting_error",
    channelRef: text(observation?.channelRef),
    edgeCredentialRef: text(observation?.edgeCredentialRef),
    sampleInserted: false,
    blockers: [redactedBlocker("accounting_exception")],
    nextAction: "review_usage_accounting_failure"
  };
}

function trafficSupplyLifecycleExceptionResult() {
  return {
    ok: false,
    status: "traffic_supply_suspend_failed",
    mutation: false,
    blockers: [redactedBlocker("traffic_supply_lifecycle_exception")],
    nextAction: "review_traffic_supply_lifecycle_failure"
  };
}

function trafficSupplyLifecycleMissingResult() {
  return {
    ok: false,
    status: "traffic_supply_suspend_gate_missing",
    mutation: false,
    blockers: [redactedBlocker("traffic_supply_lifecycle_gate_missing")],
    nextAction: "configure_traffic_supply_lifecycle_gate"
  };
}

function quotaCycleRolloverExceptionResult() {
  return {
    ok: false,
    status: "quota_cycle_rollover_sweep_failed",
    scannedCount: 0,
    appliedCount: 0,
    pendingCount: 0,
    failedCount: 1,
    skippedCount: 0,
    mutation: false,
    blockers: [redactedBlocker("quota_cycle_rollover_exception")],
    nextAction: "review_quota_cycle_rollover_failure"
  };
}

function safeCollectorObservability(result = {}) {
  const value = result?.observability;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const safe = {};
  if (typeof value.statsApiReachable === "boolean") {
    safe.statsApiReachable = value.statsApiReachable;
  }
  if (typeof value.userTrafficCountersObserved === "boolean") {
    safe.userTrafficCountersObserved = value.userTrafficCountersObserved;
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

function normalizeCollectors(collectors = []) {
  return (Array.isArray(collectors) ? collectors : [])
    .map((collector) => ({
      channelRef: text(collector?.channelRef),
      collector
    }))
    .filter(({ collector }) => collector && typeof collector.collect === "function");
}

export function normalizeTrafficUsageCollectionScope(scope) {
  if (scope === undefined) return null;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)
    || Object.keys(scope).some((key) => !["channelRefs", "protocol", "lifecycleMode"].includes(key))
    || scope.protocol !== "vless" || scope.lifecycleMode !== "record-only"
    || !Array.isArray(scope.channelRefs) || scope.channelRefs.length === 0
    || scope.channelRefs.some((ref) => typeof ref !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(ref))
    || new Set(scope.channelRefs).size !== scope.channelRefs.length) {
    throw usageError("traffic_usage_collection_scope_invalid", "traffic usage collection scope is invalid");
  }
  return Object.freeze({ channelRefs: Object.freeze([...scope.channelRefs]), protocol: "vless", lifecycleMode: "record-only" });
}

function deferredLifecycleResult() {
  return {
    ok: true, status: "deferred_for_recovery_review", mutation: false,
    blockers: [], nextAction: "review_deferred_traffic_supply_lifecycle"
  };
}

function trafficSupplySuspendRequired(result = {}) {
  return result?.status === "over_quota_disable_required"
    || result?.lifecycleAction === "traffic_supply_suspend_required"
    || result?.trafficSupply?.status === "suspend_required";
}

function safeLifecycleSummary(result = {}) {
  if (!result || typeof result !== "object") {
    return null;
  }
  return {
    ok: result.ok === true,
    status: text(result.status),
    mutation: result.mutation === true,
    blockers: blockerCodes(result),
    nextAction: text(result.nextAction),
    execution: {
      trafficSupplySuspendRequired: result.execution?.trafficSupplySuspendRequired === true,
      trafficSupplySuspendExecuted: result.execution?.trafficSupplySuspendExecuted === true,
      accountMutationRequired: result.execution?.accountMutationRequired === true
    }
  };
}

function safeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function safeQuotaCycleRolloverSummary(result = {}) {
  return {
    ok: result?.ok === true,
    status: text(result?.status),
    scannedCount: safeCount(result?.scannedCount),
    appliedCount: safeCount(result?.appliedCount),
    pendingCount: safeCount(result?.pendingCount),
    failedCount: safeCount(result?.failedCount),
    skippedCount: safeCount(result?.skippedCount),
    mutation: result?.mutation === true,
    blockers: blockerCodes(result),
    nextAction: text(result?.nextAction)
  };
}

export function createRuntimeUsageAccountingService({
  collectors = [],
  accounting,
  trafficSupplyLifecycleGate,
  collectionScope,
  beforeRecordGuard
} = {}) {
  const scope = normalizeTrafficUsageCollectionScope(collectionScope);
  if (scope && beforeRecordGuard !== undefined && typeof beforeRecordGuard !== "function") {
    throw usageError("traffic_usage_collection_scope_invalid", "traffic usage collection admission guard is invalid");
  }
  const normalizedCollectors = normalizeCollectors(collectors);
  if (scope && (normalizedCollectors.length !== scope.channelRefs.length
    || normalizedCollectors.length !== collectors.length
    || scope.channelRefs.some((ref) => normalizedCollectors.filter(({ channelRef }) => channelRef === ref).length !== 1))) {
    throw usageError("traffic_usage_collection_scope_invalid", "traffic usage collectors do not match collection scope");
  }
  if (!accounting || typeof accounting.recordUsageObservation !== "function") {
    throw usageError("validation_error", "accounting service is required");
  }
  const lifecycleGate = trafficSupplyLifecycleGate
    && typeof trafficSupplyLifecycleGate.handleUsageDecision === "function"
    ? trafficSupplyLifecycleGate
    : null;
  const quotaCycleRolloverSweep = trafficSupplyLifecycleGate
    && typeof trafficSupplyLifecycleGate.sweepQuotaCycleRollovers === "function"
    ? trafficSupplyLifecycleGate.sweepQuotaCycleRollovers.bind(trafficSupplyLifecycleGate)
    : null;

  async function collectAndRecord({ since, sinceByChannelRef = {} } = {}) {
    const reports = [];
    let observationCount = 0;
    let recordedCount = 0;
    let insertedCount = 0;
    let unresolvedCount = 0;
    let quotaDisableRequiredCount = 0;
    let trafficSupplySuspendRequiredCount = 0;
    let trafficSupplySuspendAttemptedCount = 0;
    let trafficSupplySuspendExecutedCount = 0;
    let trafficSupplySuspendFailedCount = 0;
    let trafficSupplySuspendPendingCount = 0;
    let trafficSupplySuspendDeferredCount = 0;
    let idleCollectorCount = 0;

    // Recovery mode must validate the complete read batch before the first write.
    // VLESS reads are non-clearing; the ordinary sequential path is unchanged.
    const scopedBatch = [];
    if (scope) {
      for (const { channelRef, collector } of normalizedCollectors) {
        let collected;
        try {
          collected = await collector.collect({ since: sinceByChannelRef[channelRef] || since });
        } catch {
          collected = collectorExceptionResult(channelRef);
        }
        scopedBatch.push({ channelRef, collected });
      }
      const invalid = scopedBatch.some(({ channelRef, collected }) => collected?.ok !== true
        || collected.channelRef !== channelRef || collected.accountingMode !== "cumulative"
        || !Array.isArray(collected.observations)
        || collected.observations.some((observation) => !observation || observation.channelRef !== channelRef
          || (observation.accountingMode !== undefined && observation.accountingMode !== "cumulative")));
      let batchErrorCode = invalid ? "traffic_usage_collection_scope_violation" : null;
      if (!invalid && beforeRecordGuard) {
        try {
          if (await beforeRecordGuard(scopedBatch) !== true) batchErrorCode = "traffic_usage_collection_admission_rejected";
        } catch {
          batchErrorCode = "traffic_usage_collection_admission_rejected";
        }
      }
      if (batchErrorCode) return {
        type: "gccgw_runtime_usage_accounting_report", ok: false,
        errorCode: batchErrorCode, collectionScope: scope,
        lifecycleDeferred: true, collectorCount: normalizedCollectors.length,
        observationCount: 0, recordedCount: 0, insertedCount: 0, unresolvedCount: 0,
        reports: [], nextAction: "review_scoped_collection_batch_before_retry",
        execution: { directRuntimeMutationAllowed: false, trafficSupplyMutationAttempted: false, trafficSupplyMutationExecuted: false, safeToRetry: true },
        safety: { noRawRuntimePayload: true, noSecretMaterialReturned: true }, redacted: true
      };
    }

    for (const [collectorIndex, { channelRef, collector }] of normalizedCollectors.entries()) {
      let collected;
      try {
        collected = scope ? scopedBatch[collectorIndex].collected : await collector.collect({
          since: sinceByChannelRef[channelRef] || since
        });
      } catch {
        collected = collectorExceptionResult(channelRef);
      }
      const observations = Array.isArray(collected?.observations)
        ? collected.observations
        : [];
      const collectorAccountingMode = text(collected?.accountingMode);
      const collectorIdle = collected?.ok === true
        && text(collected?.status) === "idle_no_user_traffic"
        && observations.length === 0;
      if (collectorIdle) {
        idleCollectorCount += 1;
      }
      const recorded = [];
      for (const observation of observations) {
        observationCount += 1;
        let result;
        try {
          result = await accounting.recordUsageObservation({
            ...observation,
            ...(collectorAccountingMode ? { accountingMode: collectorAccountingMode } : {})
          });
        } catch {
          result = accountingExceptionResult(observation);
        }
        if (result.ok === true) {
          recordedCount += 1;
          if (result.sampleInserted === true) insertedCount += 1;
          if (result.status === "over_quota_disable_required") {
            quotaDisableRequiredCount += 1;
          }
          if (
            result.lifecycleAction === "traffic_supply_suspend_required"
            || result.trafficSupply?.status === "suspend_required"
          ) {
            trafficSupplySuspendRequiredCount += 1;
          }
        } else {
          unresolvedCount += 1;
        }
        let trafficSupplyLifecycle = null;
        if (result.ok === true && trafficSupplySuspendRequired(result)) {
          if (scope) {
            trafficSupplySuspendDeferredCount += 1;
            trafficSupplyLifecycle = deferredLifecycleResult();
          } else if (result.sampleInserted === true && lifecycleGate) {
            trafficSupplySuspendAttemptedCount += 1;
            try {
              trafficSupplyLifecycle = await lifecycleGate.handleUsageDecision(result, {
                executeControlledTrafficSupplySuspend: true,
                reviewedByRef: "usage_quota_auto_gate"
              });
            } catch {
              trafficSupplyLifecycle = trafficSupplyLifecycleExceptionResult();
            }
            if (trafficSupplyLifecycle?.mutation === true) {
              trafficSupplySuspendExecutedCount += 1;
            } else if (trafficSupplyLifecycle?.ok !== true) {
              trafficSupplySuspendFailedCount += 1;
            } else {
              trafficSupplySuspendPendingCount += 1;
            }
          } else if (result.sampleInserted === true) {
            trafficSupplySuspendPendingCount += 1;
            trafficSupplyLifecycle = trafficSupplyLifecycleMissingResult();
          }
        }
        const unresolvedReason = safeUnresolvedReason(result.unresolvedReason);
        recorded.push({
          ok: result.ok === true,
          status: result.status,
          lifecycleAction: result.lifecycleAction,
          trafficSupply: result.trafficSupply,
          trafficSupplyLifecycle: safeLifecycleSummary(trafficSupplyLifecycle),
          channelRef: result.channelRef,
          edgeCredentialRef: result.edgeCredentialRef,
          sampleInserted: result.sampleInserted === true,
          blockers: blockerCodes(result),
          ...(unresolvedReason ? { unresolvedReason } : {}),
          nextAction: result.nextAction
        });
      }
      const reportChannelRef = channelRef || text(collected?.channelRef);
      const reportUnresolvedCount = recorded.filter((item) => !item.ok).length;
      const reportUnresolvedReasonCounts = unresolvedReasonCountsForRecords(
        recorded,
        reportUnresolvedCount
      );
      reports.push({
        channelRef: reportChannelRef,
        collectorOk: collected?.ok === true,
        collectorStatus: text(collected?.status),
        collectorState: projectTrafficCollectorState({
          collectorOk: collected?.ok === true,
          collectorStatus: collected?.status,
          sourceRef: collected?.sourceRef,
          channelRef: reportChannelRef,
          observations,
          unresolvedCount: reportUnresolvedCount,
          unresolvedReasonCounts: reportUnresolvedReasonCounts,
          blockers: collected?.blockers,
          recorded,
          idle: collectorIdle,
          stateWarmup: collected?.stateWarmup === true
        }),
        idle: collectorIdle,
        observationCount: observations.length,
        recordedCount: recorded.filter((item) => item.ok).length,
        unresolvedCount: reportUnresolvedCount,
        ...(reportUnresolvedCount > 0
          ? { unresolvedReasonCounts: reportUnresolvedReasonCounts }
          : {}),
        blockers: blockerCodes(collected),
        observability: safeCollectorObservability(collected),
        recorded,
        nextAction: collected?.nextAction
      });
    }

    let quotaCycleRollover = scope ? safeQuotaCycleRolloverSummary(deferredLifecycleResult()) : null;
    if (!scope && quotaCycleRolloverSweep) {
      try {
        quotaCycleRollover = safeQuotaCycleRolloverSummary(
          await quotaCycleRolloverSweep({
            limit: 100,
            reviewedByRef: "usage_quota_rollover_gate"
          })
        );
      } catch {
        quotaCycleRollover = safeQuotaCycleRolloverSummary(
          quotaCycleRolloverExceptionResult()
        );
      }
    }
    const ok = reports.every((report) => report.collectorOk && report.unresolvedCount === 0)
      && trafficSupplySuspendFailedCount === 0
      && trafficSupplySuspendPendingCount === 0
      && (!quotaCycleRollover || quotaCycleRollover.ok === true);
    const unresolvedReasonCounts = normalizeUnresolvedReasonCounts(
      reports.reduce((counts, report) => ({
        bindingMissing: counts.bindingMissing + Number(report.unresolvedReasonCounts?.bindingMissing || 0),
        channelMismatch: counts.channelMismatch + Number(report.unresolvedReasonCounts?.channelMismatch || 0)
      }), { bindingMissing: 0, channelMismatch: 0 }),
      unresolvedCount
    );
    return {
      type: "gccgw_runtime_usage_accounting_report",
      ok,
      ...(scope ? { collectionScope: scope, lifecycleDeferred: true, trafficSupplySuspendDeferredCount } : {}),
      collectorCount: normalizedCollectors.length,
      idleCollectorCount,
      observationCount,
      recordedCount,
      insertedCount,
      unresolvedCount,
      ...(unresolvedCount > 0 ? { unresolvedReasonCounts } : {}),
      quotaDisableRequiredCount,
      trafficSupplySuspendRequiredCount,
      trafficSupplySuspendAttemptedCount,
      trafficSupplySuspendExecutedCount,
      trafficSupplySuspendFailedCount,
      trafficSupplySuspendPendingCount,
      ...(quotaCycleRollover ? { quotaCycleRollover } : {}),
      reports,
      nextAction: scope && ok ? "review_deferred_traffic_supply_lifecycle"
        : ok ? "continue_usage_monitoring" : "review_usage_collector_mapping_or_traffic_supply_lifecycle",
      execution: {
        directRuntimeMutationAllowed: false,
        subscriptionMutationRequired: quotaDisableRequiredCount > 0,
        trafficSupplyMutationRequired: trafficSupplySuspendRequiredCount > 0,
        trafficSupplyMutationAttempted: trafficSupplySuspendAttemptedCount > 0,
        trafficSupplyMutationExecuted: trafficSupplySuspendExecutedCount > 0,
        accountMutationRequired: false,
        writerMode: "sequential",
        retryMode: "operator_replay_idempotent_samples",
        safeToRetry: true
      },
      safety: {
        noRawRuntimePayload: true,
        noSecretMaterialReturned: true
      },
      redacted: true
    };
  }

  return {
    collectAndRecord
  };
}
