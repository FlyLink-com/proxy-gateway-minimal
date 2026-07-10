#!/usr/bin/env node
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFileMihomoConnectionDeltaStateStore,
  createMihomoConnectionDeltaUsageReader
} from "../server/services/edge/mihomo-connection-delta-usage-reader.mjs";
import { createMihomoTuicUsageCollector } from "../server/services/edge/mihomo-tuic-usage-collector.mjs";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../server/services/platform/traffic-accounting.mjs";
import { createFileTrafficCollectorStatusStore } from "../server/services/platform/traffic-collector-admin-projection.mjs";
import { buildMihomoConnectionDeltaSidecarProducerStatus } from "../server/services/platform/traffic-collector-status-producers.mjs";

export { buildMihomoConnectionDeltaSidecarProducerStatus };

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_FAILURE_CODES = new Set([
  "controller_error",
  "controller_forbidden",
  "controller_unauthorized",
  "credential_binding_missing",
  "mapping_unresolved",
  "runtime_fetch_failed",
  "unresolved_binding",
  "validation_error"
]);

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

function readSidecarTimerStatus({
  unitName = "gccgw-sgp-tuic-delta-usage-sidecar.timer"
} = {}) {
  try {
    const result = spawnSync("systemctl", [
      "show",
      unitName,
      "--property=ActiveState",
      "--property=UnitFileState",
      "--no-pager"
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2000,
      maxBuffer: 4096
    });
    const properties = Object.fromEntries(text(result.stdout)
      .split(/\r?\n/)
      .map((line) => line.split("=", 2).map((part) => text(part).toLowerCase()))
      .filter(([key, value]) => key && value));
    return {
      active: properties.activestate === "active"
        ? true
        : ["inactive", "failed", "deactivating"].includes(properties.activestate)
          ? false
          : null,
      enabled: ["enabled", "enabled-runtime"].includes(properties.unitfilestate)
        ? true
        : ["disabled", "masked", "static"].includes(properties.unitfilestate)
          ? false
          : null
    };
  } catch {
    // An unavailable systemd client is represented as an unknown observation.
  }
  return { active: null, enabled: null };
}

function readSidecarStateFileStatus({ statePath } = {}) {
  if (!text(statePath)) return { configured: false, protected: null };
  try {
    const state = statSync(statePath);
    return {
      configured: true,
      protected: state.isFile() && (process.platform === "win32" || (state.mode & 0o777) === 0o600)
    };
  } catch {
    return { configured: true, protected: false };
  }
}

function redactedFailure(error, { channelRef, recordUsage = false } = {}) {
  const rawCode = text(error?.code);
  const code = SAFE_FAILURE_CODES.has(rawCode)
    ? rawCode
    : "mihomo_connection_delta_sidecar_failed";
  return {
    type: "mihomo_connection_delta_usage_sidecar",
    ok: false,
    recordUsage,
    collectorStatus: code,
    channelRef: SAFE_REF_PATTERN.test(text(channelRef)) ? text(channelRef) : "",
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

function writeSidecarProducerStatus({
  summary,
  env,
  statePath,
  nowFn,
  timerStatusReader,
  stateFileStatusReader,
  stderr
}) {
  const statusPath = envText(env, "EDGE_USAGE_COLLECTOR_STATUS_PATH");
  if (!statusPath) return;
  try {
    const now = nowFn();
    createFileTrafficCollectorStatusStore({ filePath: statusPath }).writeProducerStatus(
      buildMihomoConnectionDeltaSidecarProducerStatus({
        summary,
        observedAt: now instanceof Date ? now.toISOString() : now,
        timer: timerStatusReader({
          unitName: "gccgw-sgp-tuic-delta-usage-sidecar.timer"
        }),
        stateFile: stateFileStatusReader({ statePath }),
        pollIntervalSeconds: envText(env, "MIHOMO_CONNECTION_DELTA_POLL_INTERVAL_SECONDS") || undefined
      })
    );
  } catch {
    stderr.write(`${JSON.stringify({
      type: "traffic_collector_status_producer_snapshot",
      ok: false,
      producerRef: "sgp_tuic_connection_delta_sidecar",
      error: "status_snapshot_write_failed",
      safety: {
        redacted: true,
        pathReturned: false,
        rawErrorReturned: false
      }
    })}\n`);
  }
}

async function runMihomoConnectionDeltaUsageSidecarCore({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  fetchJson,
  nowFn = () => new Date(),
  timerStatusReader = readSidecarTimerStatus,
  stateFileStatusReader = readSidecarStateFileStatus
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
  writeSidecarProducerStatus({
    summary,
    env,
    statePath,
    nowFn,
    timerStatusReader,
    stateFileStatusReader,
    stderr
  });
  stdout.write(`${JSON.stringify(summary)}\n`);
  return summary.ok ? 0 : 1;
}

export async function runMihomoConnectionDeltaUsageSidecar(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const env = options.env || process.env;
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const nowFn = options.nowFn || (() => new Date());
  const timerStatusReader = options.timerStatusReader || readSidecarTimerStatus;
  const stateFileStatusReader = options.stateFileStatusReader || readSidecarStateFileStatus;
  try {
    return await runMihomoConnectionDeltaUsageSidecarCore({
      ...options,
      argv,
      env,
      stdout,
      stderr,
      nowFn,
      timerStatusReader,
      stateFileStatusReader
    });
  } catch (error) {
    const channelRef = envText(
      env,
      "MIHOMO_CONNECTION_DELTA_CHANNEL_REF",
      "EDGE_MIHOMO_CONNECTION_DELTA_CHANNEL_REF"
    ) || "channel-sgp-a-tuic";
    const recordUsage = argv.includes("--record")
      || boolEnv(env.MIHOMO_CONNECTION_DELTA_RECORD_USAGE)
      || boolEnv(env.EDGE_MIHOMO_CONNECTION_DELTA_RECORD_USAGE);
    const statePath = envText(
      env,
      "MIHOMO_CONNECTION_DELTA_STATE_PATH",
      "EDGE_MIHOMO_CONNECTION_DELTA_STATE_PATH"
    );
    const summary = redactedFailure(error, { channelRef, recordUsage });
    writeSidecarProducerStatus({
      summary,
      env,
      statePath,
      nowFn,
      timerStatusReader,
      stateFileStatusReader,
      stderr
    });
    stdout.write(`${JSON.stringify(summary)}\n`);
    return 1;
  }
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
