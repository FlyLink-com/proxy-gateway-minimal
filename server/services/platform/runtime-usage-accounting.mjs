import { projectTrafficCollectorState } from "./traffic-collector-state.mjs";

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

export function createRuntimeUsageAccountingService({
  collectors = [],
  accounting,
  trafficSupplyLifecycleGate
} = {}) {
  const normalizedCollectors = normalizeCollectors(collectors);
  if (!accounting || typeof accounting.recordUsageObservation !== "function") {
    throw usageError("validation_error", "accounting service is required");
  }
  const lifecycleGate = trafficSupplyLifecycleGate
    && typeof trafficSupplyLifecycleGate.handleUsageDecision === "function"
    ? trafficSupplyLifecycleGate
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
    let idleCollectorCount = 0;

    for (const { channelRef, collector } of normalizedCollectors) {
      let collected;
      try {
        collected = await collector.collect({
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
          if (result.sampleInserted === true && lifecycleGate) {
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
          nextAction: result.nextAction
        });
      }
      const reportChannelRef = channelRef || text(collected?.channelRef);
      const reportUnresolvedCount = recorded.filter((item) => !item.ok).length;
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
          blockers: collected?.blockers,
          recorded,
          idle: collectorIdle,
          stateWarmup: collected?.stateWarmup === true
        }),
        idle: collectorIdle,
        observationCount: observations.length,
        recordedCount: recorded.filter((item) => item.ok).length,
        unresolvedCount: reportUnresolvedCount,
        blockers: blockerCodes(collected),
        observability: safeCollectorObservability(collected),
        recorded,
        nextAction: collected?.nextAction
      });
    }

    const ok = reports.every((report) => report.collectorOk && report.unresolvedCount === 0)
      && trafficSupplySuspendFailedCount === 0
      && trafficSupplySuspendPendingCount === 0;
    return {
      type: "gccgw_runtime_usage_accounting_report",
      ok,
      collectorCount: normalizedCollectors.length,
      idleCollectorCount,
      observationCount,
      recordedCount,
      insertedCount,
      unresolvedCount,
      quotaDisableRequiredCount,
      trafficSupplySuspendRequiredCount,
      trafficSupplySuspendAttemptedCount,
      trafficSupplySuspendExecutedCount,
      trafficSupplySuspendFailedCount,
      trafficSupplySuspendPendingCount,
      reports,
      nextAction: ok ? "continue_usage_monitoring" : "review_usage_collector_mapping_or_traffic_supply_lifecycle",
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
