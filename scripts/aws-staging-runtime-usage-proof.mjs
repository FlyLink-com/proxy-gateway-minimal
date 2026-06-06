#!/usr/bin/env node
import "dotenv/config";
import { createMihomoExternalControllerUsageSnapshotReader } from "../server/services/edge/mihomo-external-controller-usage-reader.mjs";
import { createMihomoTuicUsageCollector } from "../server/services/edge/mihomo-tuic-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../server/services/platform/traffic-accounting.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function blockerCodes(result) {
  return Array.isArray(result?.blockers)
    ? result.blockers.map((blocker) => text(blocker.code)).filter(Boolean)
    : [];
}

function redactedFailure(error) {
  return {
    ok: false,
    controllerLoopbackOnly: false,
    collectorStatus: error?.code || "usage_proof_failed",
    observationCount: 0,
    mappedObservationCount: 0,
    aggregateOnlyBlocked: false,
    usageLedgerRecorded: false,
    quotaDecision: null,
    blockers: [error?.code || "usage_proof_failed"],
    sensitiveOutputSuppressed: true
  };
}

async function main(env = process.env) {
  const channelRef = text(env.USAGE_PROOF_CHANNEL_REF) || "channel-aws-staging-a-tuic";
  const recordUsage = boolEnv(env.USAGE_PROOF_RECORD);
  const controlDbPath = text(env.USAGE_PROOF_CONTROL_DB_PATH);
  const reader = createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: text(env.USAGE_PROOF_CONTROLLER_URL) || "http://127.0.0.1:9090",
    metricsPath: text(env.USAGE_PROOF_METRICS_PATH) || "/traffic",
    controllerSecret: env.USAGE_PROOF_CONTROLLER_SECRET,
    nowFn: () => new Date()
  });
  const collector = createMihomoTuicUsageCollector({
    channelRef,
    snapshotReader: reader
  });
  const collected = await collector.collect({
    since: text(env.USAGE_PROOF_SINCE) || undefined
  });
  const observations = Array.isArray(collected.observations) ? collected.observations : [];
  const aggregateOnlyBlocked = blockerCodes(collected).includes("node_aggregate_only");
  let mappedObservationCount = 0;
  let usageLedgerRecorded = false;
  let quotaDecision = null;
  let store;

  try {
    if (recordUsage && observations.length > 0) {
      if (!controlDbPath) {
        throw new Error("USAGE_PROOF_CONTROL_DB_PATH is required when USAGE_PROOF_RECORD=true");
      }
      store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
      const accounting = createTrafficAccountingService({ controlStore: store });
      for (const observation of observations) {
        const recorded = accounting.recordUsageObservation(observation);
        if (recorded.ok) {
          mappedObservationCount += 1;
          usageLedgerRecorded = usageLedgerRecorded || Boolean(recorded.sampleInserted);
          quotaDecision = recorded.status;
        }
      }
    }
  } finally {
    store?.close();
  }

  return {
    ok: collected.ok === true,
    controllerLoopbackOnly: true,
    collectorStatus: collected.status,
    observationCount: observations.length,
    mappedObservationCount,
    aggregateOnlyBlocked,
    usageLedgerRecorded,
    quotaDecision,
    blockers: blockerCodes(collected),
    sensitiveOutputSuppressed: true
  };
}

try {
  const summary = await main();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify(redactedFailure(error), null, 2)}\n`);
  process.exitCode = 1;
}
