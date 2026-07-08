#!/usr/bin/env node
import "dotenv/config";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFileMihomoConnectionDeltaStateStore,
  createMihomoConnectionDeltaUsageReader
} from "../server/services/edge/mihomo-connection-delta-usage-reader.mjs";
import { createMihomoTuicUsageCollector } from "../server/services/edge/mihomo-tuic-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../server/services/platform/traffic-accounting.mjs";

function text(value) {
  return String(value ?? "").trim();
}

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function envText(env, ...names) {
  for (const name of names) {
    const value = text(env[name]);
    if (value) return value;
  }
  return "";
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
      envText(
        env,
        "MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_JSON",
        "EDGE_MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_JSON"
      ),
      "MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_JSON"
    ),
    ...jsonObjectFromFile(
      envText(
        env,
        "MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_PATH",
        "EDGE_MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_PATH"
      ),
      "MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_PATH"
    )
  };
}

function secretFromEnv(env) {
  const directSecret = envText(
    env,
    "MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET",
    "EDGE_MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET"
  );
  if (directSecret) return directSecret;
  const secretPath = envText(
    env,
    "MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE",
    "EDGE_MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE"
  );
  if (!secretPath) return "";
  try {
    return text(readFileSync(secretPath, "utf8"));
  } catch {
    const error = new Error("MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE must reference a readable file");
    error.code = "validation_error";
    throw error;
  }
}

function blockerCodes(value) {
  return Array.isArray(value)
    ? value.map((entry) => text(entry?.code || entry)).filter(Boolean)
    : [];
}

function redactedFailure(error) {
  const code = error?.code || "mihomo_connection_delta_sidecar_failed";
  return {
    type: "mihomo_connection_delta_usage_sidecar",
    ok: false,
    recordUsage: false,
    collectorStatus: code,
    channelRef: "",
    accountingMode: "delta",
    stateWarmup: false,
    observationCount: 0,
    recordedCount: 0,
    insertedCount: 0,
    unresolvedCount: 0,
    blockers: [code],
    nextAction: "fix_mihomo_connection_delta_sidecar_configuration",
    sensitiveOutputSuppressed: true
  };
}

export function summarizeMihomoConnectionDeltaSidecarRun({
  channelRef,
  collected,
  recorded = [],
  recordUsage = false
} = {}) {
  const observations = Array.isArray(collected?.observations) ? collected.observations : [];
  const recordedItems = Array.isArray(recorded) ? recorded : [];
  const unresolvedCount = recordedItems.filter((item) => item?.ok !== true).length;
  const recordedCount = recordedItems.filter((item) => item?.ok === true).length;
  const insertedCount = recordedItems.filter((item) => item?.sampleInserted === true).length;
  const ok = collected?.ok === true && (!recordUsage || unresolvedCount === 0);
  return {
    type: "mihomo_connection_delta_usage_sidecar",
    ok,
    recordUsage,
    collectorStatus: text(collected?.status),
    channelRef: text(channelRef || collected?.channelRef),
    accountingMode: text(collected?.accountingMode) || "delta",
    stateWarmup: collected?.stateWarmup === true,
    observationCount: observations.length,
    recordedCount,
    insertedCount,
    unresolvedCount,
    blockers: [
      ...blockerCodes(collected?.blockers),
      ...recordedItems.flatMap((item) => blockerCodes(item?.blockers))
    ],
    nextAction: ok
      ? "continue_mihomo_connection_delta_usage_sidecar"
      : "review_mihomo_connection_delta_usage_sidecar",
    safety: {
      noRawRuntimePayload: collected?.safety?.noRawRuntimePayload === true,
      noSecretMaterialReturned: collected?.safety?.noSecretMaterialReturned === true,
      redacted: true
    },
    sensitiveOutputSuppressed: true
  };
}

export async function runMihomoConnectionDeltaUsageSidecar({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  fetchJson,
  nowFn = () => new Date()
} = {}) {
  const collect = argv.includes("--collect");
  const recordUsage = argv.includes("--record")
    || boolEnv(env.MIHOMO_CONNECTION_DELTA_RECORD_USAGE)
    || boolEnv(env.EDGE_MIHOMO_CONNECTION_DELTA_RECORD_USAGE);
  const channelRef = envText(
    env,
    "MIHOMO_CONNECTION_DELTA_CHANNEL_REF",
    "EDGE_MIHOMO_CONNECTION_DELTA_CHANNEL_REF"
  ) || "channel-sgp-a-tuic";
  const statePath = envText(
    env,
    "MIHOMO_CONNECTION_DELTA_STATE_PATH",
    "EDGE_MIHOMO_CONNECTION_DELTA_STATE_PATH"
  );

  if (!collect) {
    const summary = {
      type: "mihomo_connection_delta_usage_sidecar_check",
      ok: Boolean(statePath),
      channelRef,
      statePathConfigured: Boolean(statePath),
      recordUsage,
      nextAction: statePath
        ? "run_collect_after_operator_approval"
        : "configure_mihomo_connection_delta_state_path",
      sensitiveOutputSuppressed: true
    };
    stdout.write(`${JSON.stringify(summary)}\n`);
    return summary.ok ? 0 : 2;
  }

  const reader = createMihomoConnectionDeltaUsageReader({
    controllerUrl: envText(
      env,
      "MIHOMO_CONNECTION_DELTA_CONTROLLER_URL",
      "EDGE_MIHOMO_CONNECTION_DELTA_CONTROLLER_URL"
    ) || "http://127.0.0.1:19090",
    metricsPath: envText(
      env,
      "MIHOMO_CONNECTION_DELTA_METRICS_PATH",
      "EDGE_MIHOMO_CONNECTION_DELTA_METRICS_PATH"
    ) || "/connections",
    controllerSecret: secretFromEnv(env),
    credentialRefByRuntimeUser: credentialRefByRuntimeUserFromEnv(env),
    stateStore: createFileMihomoConnectionDeltaStateStore({ statePath }),
    fetchJson,
    nowFn
  });
  const collector = createMihomoTuicUsageCollector({
    channelRef,
    snapshotReader: reader
  });
  const collected = await collector.collect({
    since: envText(env, "MIHOMO_CONNECTION_DELTA_SINCE", "EDGE_MIHOMO_CONNECTION_DELTA_SINCE") || undefined
  });

  const recorded = [];
  let store;
  try {
    if (recordUsage && Array.isArray(collected.observations) && collected.observations.length > 0) {
      const controlDbPath = envText(
        env,
        "MIHOMO_CONNECTION_DELTA_CONTROL_DB_PATH",
        "EDGE_MIHOMO_CONNECTION_DELTA_CONTROL_DB_PATH",
        "SUBSCRIPTION_CONTROL_DB_PATH"
      );
      if (!controlDbPath) {
        const error = new Error("MIHOMO_CONNECTION_DELTA_CONTROL_DB_PATH is required when recording usage");
        error.code = "validation_error";
        throw error;
      }
      store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
      const accounting = createTrafficAccountingService({ controlStore: store });
      for (const observation of collected.observations) {
        recorded.push(await accounting.recordUsageObservation(observation));
      }
    }
  } finally {
    store?.close();
  }

  const summary = summarizeMihomoConnectionDeltaSidecarRun({
    channelRef,
    collected,
    recorded,
    recordUsage
  });
  stdout.write(`${JSON.stringify(summary)}\n`);
  return summary.ok ? 0 : 1;
}

function isDirectInvocation() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  runMihomoConnectionDeltaUsageSidecar()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stdout.write(`${JSON.stringify(redactedFailure(error))}\n`);
      process.exitCode = 1;
    });
}
