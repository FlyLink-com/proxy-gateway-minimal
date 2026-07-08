#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "node:fs";
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

function envText(env, primary, fallback) {
  return text(env[primary]) || text(env[fallback]);
}

function jsonObjectFromText(value, field) {
  const raw = text(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_object");
    }
    return parsed;
  } catch {
    const error = new Error(`${field} must be a JSON object`);
    error.code = "validation_error";
    throw error;
  }
}

function jsonObjectFromFile(filePath, field) {
  const normalized = text(filePath);
  if (!normalized) return {};
  try {
    return jsonObjectFromText(readFileSync(normalized, "utf8"), field);
  } catch (error) {
    if (error?.code === "validation_error") throw error;
    const wrapped = new Error(`${field} must reference a readable JSON object file`);
    wrapped.code = "validation_error";
    throw wrapped;
  }
}

function credentialRefByRuntimeUserFromEnv(env) {
  return {
    ...jsonObjectFromText(
      envText(env, "TUIC_USAGE_PROOF_CREDENTIAL_MAP_JSON", "USAGE_PROOF_CREDENTIAL_MAP_JSON")
        || env.EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_JSON
        || env.EDGE_MIHOMO_TUIC_USAGE_CREDENTIAL_MAP_JSON,
      "TUIC_USAGE_PROOF_CREDENTIAL_MAP_JSON"
    ),
    ...jsonObjectFromFile(
      envText(env, "TUIC_USAGE_PROOF_CREDENTIAL_MAP_PATH", "USAGE_PROOF_CREDENTIAL_MAP_PATH")
        || env.EDGE_MIHOMO_USAGE_CREDENTIAL_MAP_PATH
        || env.EDGE_MIHOMO_TUIC_USAGE_CREDENTIAL_MAP_PATH,
      "TUIC_USAGE_PROOF_CREDENTIAL_MAP_PATH"
    )
  };
}

function blockerCodes(result) {
  return Array.isArray(result?.blockers)
    ? result.blockers.map((blocker) => text(blocker.code)).filter(Boolean)
    : [];
}

function redactedFailure(error) {
  const code = error?.code || "usage_proof_failed";
  return {
    type: "tuic_per_credential_usage_proof",
    ok: false,
    readyToEnableCollector: false,
    controllerLoopbackOnly: false,
    collectorStatus: code,
    channelRef: "",
    observationCount: 0,
    mappedObservationCount: 0,
    aggregateOnlyBlocked: false,
    usageLedgerRecorded: false,
    quotaDecision: null,
    blockers: [code],
    nextAction: "fix_tuic_usage_proof_configuration",
    sensitiveOutputSuppressed: true
  };
}

async function runTuicPerCredentialUsageProof(env = process.env) {
  const channelRef = text(env.TUIC_USAGE_PROOF_CHANNEL_REF)
    || text(env.USAGE_PROOF_CHANNEL_REF)
    || "channel-vultr-a-tuic";
  const recordUsage = boolEnv(env.TUIC_USAGE_PROOF_RECORD || env.USAGE_PROOF_RECORD);
  const controlDbPath = envText(env, "TUIC_USAGE_PROOF_CONTROL_DB_PATH", "USAGE_PROOF_CONTROL_DB_PATH");
  const reader = createMihomoExternalControllerUsageSnapshotReader({
    controllerUrl: envText(env, "TUIC_USAGE_PROOF_CONTROLLER_URL", "USAGE_PROOF_CONTROLLER_URL") || "http://127.0.0.1:9090",
    metricsPath: envText(env, "TUIC_USAGE_PROOF_METRICS_PATH", "USAGE_PROOF_METRICS_PATH") || "/usage",
    controllerSecret: env.TUIC_USAGE_PROOF_CONTROLLER_SECRET || env.USAGE_PROOF_CONTROLLER_SECRET,
    credentialRefByRuntimeUser: credentialRefByRuntimeUserFromEnv(env),
    nowFn: () => new Date()
  });
  const collector = createMihomoTuicUsageCollector({
    channelRef,
    snapshotReader: reader
  });
  const collected = await collector.collect({
    since: envText(env, "TUIC_USAGE_PROOF_SINCE", "USAGE_PROOF_SINCE") || undefined
  });
  const blockers = blockerCodes(collected);
  const observations = Array.isArray(collected.observations) ? collected.observations : [];
  const aggregateOnlyBlocked = blockers.includes("node_aggregate_only");
  let mappedObservationCount = 0;
  let usageLedgerRecorded = false;
  let quotaDecision = null;
  let store;

  try {
    if (recordUsage && observations.length > 0) {
      if (!controlDbPath) {
        const error = new Error("TUIC usage proof control DB path is required when recording usage");
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
    type: "tuic_per_credential_usage_proof",
    ok: readyToEnableCollector,
    readyToEnableCollector,
    controllerLoopbackOnly: true,
    collectorStatus: text(collected.status),
    channelRef,
    observationCount: observations.length,
    mappedObservationCount,
    aggregateOnlyBlocked,
    usageLedgerRecorded,
    quotaDecision,
    blockers,
    nextAction: readyToEnableCollector
      ? "request_operator_approval_to_enable_tuic_usage_collector"
      : "do_not_enable_tuic_usage_collector_until_per_credential_rows_exist",
    sensitiveOutputSuppressed: true
  };
}

try {
  const summary = await runTuicPerCredentialUsageProof();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exitCode = summary.ok ? 0 : 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify(redactedFailure(error), null, 2)}\n`);
  process.exitCode = 1;
}
