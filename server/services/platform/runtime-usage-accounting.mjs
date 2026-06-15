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

function normalizeCollectors(collectors = []) {
  return (Array.isArray(collectors) ? collectors : [])
    .map((collector) => ({
      channelRef: text(collector?.channelRef),
      collector
    }))
    .filter(({ collector }) => collector && typeof collector.collect === "function");
}

export function createRuntimeUsageAccountingService({
  collectors = [],
  accounting
} = {}) {
  const normalizedCollectors = normalizeCollectors(collectors);
  if (!accounting || typeof accounting.recordUsageObservation !== "function") {
    throw usageError("validation_error", "accounting service is required");
  }

  async function collectAndRecord({ since, sinceByChannelRef = {} } = {}) {
    const reports = [];
    let observationCount = 0;
    let recordedCount = 0;
    let insertedCount = 0;
    let unresolvedCount = 0;
    let quotaDisableRequiredCount = 0;

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
      const recorded = [];
      for (const observation of observations) {
        observationCount += 1;
        let result;
        try {
          result = await accounting.recordUsageObservation(observation);
        } catch {
          result = accountingExceptionResult(observation);
        }
        if (result.ok === true) {
          recordedCount += 1;
          if (result.sampleInserted === true) insertedCount += 1;
          if (result.status === "over_quota_disable_required") {
            quotaDisableRequiredCount += 1;
          }
        } else {
          unresolvedCount += 1;
        }
        recorded.push({
          ok: result.ok === true,
          status: result.status,
          channelRef: result.channelRef,
          edgeCredentialRef: result.edgeCredentialRef,
          sampleInserted: result.sampleInserted === true,
          blockers: blockerCodes(result),
          nextAction: result.nextAction
        });
      }
      reports.push({
        channelRef: channelRef || text(collected?.channelRef),
        collectorOk: collected?.ok === true,
        collectorStatus: text(collected?.status),
        observationCount: observations.length,
        recordedCount: recorded.filter((item) => item.ok).length,
        unresolvedCount: recorded.filter((item) => !item.ok).length,
        blockers: blockerCodes(collected),
        recorded,
        nextAction: collected?.nextAction
      });
    }

    const ok = reports.every((report) => report.collectorOk && report.unresolvedCount === 0);
    return {
      type: "gccgw_runtime_usage_accounting_report",
      ok,
      collectorCount: normalizedCollectors.length,
      observationCount,
      recordedCount,
      insertedCount,
      unresolvedCount,
      quotaDisableRequiredCount,
      reports,
      nextAction: ok ? "continue_usage_monitoring" : "review_usage_collector_mapping",
      execution: {
        directRuntimeMutationAllowed: false,
        subscriptionMutationRequired: quotaDisableRequiredCount > 0,
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
