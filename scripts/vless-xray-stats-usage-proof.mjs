#!/usr/bin/env node
import "dotenv/config";
import { createXrayStatsCliUsageSnapshotReader } from "../server/services/edge/xray-stats-cli-usage-reader.mjs";
import { createXrayVlessUsageCollector } from "../server/services/edge/xray-vless-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../server/services/platform/traffic-accounting.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function envText(env, primary, fallback) {
  return text(env[primary]) || text(env[fallback]);
}

function blockerCodes(result) {
  return Array.isArray(result?.blockers)
    ? result.blockers.map((blocker) => text(blocker.code)).filter(Boolean)
    : [];
}

function redactedFailure(error) {
  const code = error?.code || "usage_proof_failed";
  return {
    type: "vless_xray_stats_usage_proof",
    ok: false,
    readyToEnableCollector: false,
    statsServerLoopbackOnly: false,
    collectorStatus: code,
    channelRef: "",
    observationCount: 0,
    mappedObservationCount: 0,
    usageLedgerRecorded: false,
    quotaDecision: null,
    blockers: [code],
    nextAction: "fix_vless_xray_stats_usage_proof_configuration",
    sensitiveOutputSuppressed: true
  };
}

function commandRunnerFromEnv(env) {
  const statsJson = text(env.VLESS_XRAY_USAGE_PROOF_STATS_JSON || env.XRAY_USAGE_PROOF_STATS_JSON);
  if (!statsJson) return undefined;
  return () => ({
    exitCode: 0,
    stdout: statsJson,
    stderr: ""
  });
}

async function runVlessXrayStatsUsageProof(env = process.env) {
  const channelRef = text(env.VLESS_XRAY_USAGE_PROOF_CHANNEL_REF)
    || text(env.XRAY_USAGE_PROOF_CHANNEL_REF)
    || "channel-vultr-a-vless-reality-tcp";
  const recordUsage = boolEnv(env.VLESS_XRAY_USAGE_PROOF_RECORD || env.XRAY_USAGE_PROOF_RECORD);
  const controlDbPath = envText(env, "VLESS_XRAY_USAGE_PROOF_CONTROL_DB_PATH", "XRAY_USAGE_PROOF_CONTROL_DB_PATH");
  const commandRunner = commandRunnerFromEnv(env);
  const reader = createXrayStatsCliUsageSnapshotReader({
    xrayBinary: envText(env, "VLESS_XRAY_USAGE_PROOF_XRAY_BINARY", "XRAY_USAGE_PROOF_XRAY_BINARY") || "xray",
    statsServer: envText(env, "VLESS_XRAY_USAGE_PROOF_SERVER", "XRAY_USAGE_PROOF_SERVER") || "127.0.0.1:10085",
    ...(commandRunner ? { commandRunner } : {}),
    nowFn: () => new Date()
  });
  const collector = createXrayVlessUsageCollector({
    channelRef,
    snapshotReader: reader
  });
  const collected = await collector.collect({
    since: envText(env, "VLESS_XRAY_USAGE_PROOF_SINCE", "XRAY_USAGE_PROOF_SINCE") || undefined
  });
  const observations = Array.isArray(collected.observations) ? collected.observations : [];
  const blockers = blockerCodes(collected);
  let mappedObservationCount = 0;
  let usageLedgerRecorded = false;
  let quotaDecision = null;
  let store;

  try {
    if (recordUsage && observations.length > 0) {
      if (!controlDbPath) {
        const error = new Error("VLESS Xray usage proof control DB path is required when recording usage");
        error.code = "validation_error";
        throw error;
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

  const readyToEnableCollector = collected.ok === true && observations.length > 0;
  return {
    type: "vless_xray_stats_usage_proof",
    ok: readyToEnableCollector,
    readyToEnableCollector,
    statsServerLoopbackOnly: true,
    collectorStatus: text(collected.status),
    channelRef,
    observationCount: observations.length,
    mappedObservationCount,
    usageLedgerRecorded,
    quotaDecision,
    blockers,
    nextAction: readyToEnableCollector
      ? "request_operator_approval_to_enable_vless_usage_collector"
      : "do_not_enable_vless_usage_collector_until_user_counters_exist",
    sensitiveOutputSuppressed: true
  };
}

try {
  const summary = await runVlessXrayStatsUsageProof();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.ok ? 0 : 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify(redactedFailure(error), null, 2)}\n`);
  process.exitCode = 1;
}
