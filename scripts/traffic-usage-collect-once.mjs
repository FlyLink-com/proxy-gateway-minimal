#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeState } from "../server/state.mjs";

function reportCodeList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item?.code || item || "").trim()).filter(Boolean)
    : [];
}

function safeText(value) {
  return String(value || "").trim();
}

function safeObservability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const summary = {};
  if (typeof value.statsApiReachable === "boolean") {
    summary.statsApiReachable = value.statsApiReachable;
  }
  if (typeof value.userTrafficCountersObserved === "boolean") {
    summary.userTrafficCountersObserved = value.userTrafficCountersObserved;
  }
  return Object.keys(summary).length > 0 ? summary : null;
}

function envFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function envPresent(env, key) {
  return safeText(env?.[key]).length > 0;
}

function adminStatusProbe(env = {}) {
  return {
    adminAuthRoutesEnabled: envFlag(env.ADMIN_AUTH_ROUTES_ENABLED || env.ADMIN_PROTECTED_ROUTE_AUTH_ENABLED),
    adminAuthPortalAccountIdPresent: envPresent(env, "ADMIN_AUTH_PORTAL_ACCOUNT_ID"),
    adminAuthSessionSecretPresent: envPresent(env, "ADMIN_AUTH_SESSION_SECRET")
  };
}

function startupFailureClass(error, adminStatus) {
  const message = String(error?.message || "");
  if (
    message.includes("ADMIN_AUTH_PORTAL_ACCOUNT_ID")
    || (adminStatus.adminAuthRoutesEnabled && !adminStatus.adminAuthPortalAccountIdPresent)
  ) {
    return "admin_auth_operator_ref_missing";
  }
  return "runtime_state_initialization_failed";
}

export function summarizeCollectorStartupFailure(error, {
  mode = "collect",
  env = {},
  failureStage = "runtime_state"
} = {}) {
  const adminStatus = adminStatusProbe(env);
  const failureClass = startupFailureClass(error, adminStatus);
  return {
    type: "traffic_usage_collect_status",
    ok: false,
    mode,
    status: "startup_failed",
    failureStage,
    failureClass,
    errorCode: error?.code || "collector_exception",
    adminStatus,
    nextAction: failureClass === "admin_auth_operator_ref_missing"
      ? "sync_usage_collector_admin_auth_environment"
      : "review_usage_collector_startup_failure",
    safety: {
      redacted: true,
      noRawEnvValues: true,
      noSecretMaterialReturned: true,
      adminStatusProbe: true
    }
  };
}

export function hasOnlyUnresolvedBindingFailures(report) {
  const reports = Array.isArray(report?.reports) ? report.reports : [];
  if (report?.ok === true || Number(report?.unresolvedCount || 0) <= 0) {
    return false;
  }
  if (reports.length === 0 || reports.some((entry) => entry?.collectorOk !== true)) {
    return false;
  }
  const failedRecords = reports
    .flatMap((entry) => Array.isArray(entry?.recorded) ? entry.recorded : [])
    .filter((record) => record?.ok !== true);
  return failedRecords.length > 0
    && failedRecords.every((record) => safeText(record?.status) === "unresolved_binding");
}

export function summarizeUsageAccountingReport(report, {
  unresolvedPolicy = "fail_unresolved_bindings"
} = {}) {
  const reports = Array.isArray(report?.reports) ? report.reports : [];
  const unresolvedBindingTolerated = unresolvedPolicy === "tolerate_unresolved_bindings"
    && hasOnlyUnresolvedBindingFailures(report);
  return {
    type: "traffic_usage_collect_once",
    ok: report?.ok === true || unresolvedBindingTolerated,
    rawReportOk: report?.ok === true,
    collectorCount: Number(report?.collectorCount || 0),
    idleCollectorCount: Number(report?.idleCollectorCount || 0),
    observationCount: Number(report?.observationCount || 0),
    recordedCount: Number(report?.recordedCount || 0),
    insertedCount: Number(report?.insertedCount || 0),
    unresolvedCount: Number(report?.unresolvedCount || 0),
    quotaDisableRequiredCount: Number(report?.quotaDisableRequiredCount || 0),
    trafficSupplySuspendRequiredCount: Number(report?.trafficSupplySuspendRequiredCount || 0),
    trafficSupplySuspendAttemptedCount: Number(report?.trafficSupplySuspendAttemptedCount || 0),
    trafficSupplySuspendExecutedCount: Number(report?.trafficSupplySuspendExecutedCount || 0),
    trafficSupplySuspendFailedCount: Number(report?.trafficSupplySuspendFailedCount || 0),
    trafficSupplySuspendPendingCount: Number(report?.trafficSupplySuspendPendingCount || 0),
    unresolvedPolicy,
    unresolvedBindingTolerated,
    mappingReviewRequired: unresolvedBindingTolerated,
    reports: reports.map((entry) => ({
      channelRef: String(entry?.channelRef || "").trim(),
      collectorOk: entry?.collectorOk === true,
      collectorStatus: String(entry?.collectorStatus || "").trim(),
      idle: entry?.idle === true,
      observationCount: Number(entry?.observationCount || 0),
      recordedCount: Number(entry?.recordedCount || 0),
      unresolvedCount: Number(entry?.unresolvedCount || 0),
      blockers: reportCodeList(entry?.blockers),
      observability: safeObservability(entry?.observability),
      nextAction: String(entry?.nextAction || "").trim()
    })),
    nextAction: unresolvedBindingTolerated
      ? "continue_usage_monitoring_review_unresolved_mapping"
      : String(report?.nextAction || "").trim(),
    safety: {
      noRawRuntimePayload: report?.safety?.noRawRuntimePayload === true,
      noSecretMaterialReturned: report?.safety?.noSecretMaterialReturned === true,
      redacted: report?.redacted === true
    }
  };
}

export function summarizeCollectorCheck(state) {
  const collectors = Array.isArray(state?.platform?.edgeUsageCollectors)
    ? state.platform.edgeUsageCollectors
    : [];
  return {
    type: "traffic_usage_collect_check",
    ok: Boolean(state?.platform?.edgeUsageAccounting?.collectAndRecord),
    collectorCount: collectors.length,
    channelRefs: collectors.map((collector) => String(collector?.channelRef || "").trim()).filter(Boolean),
    nextAction: collectors.length > 0
      ? "enable_timer_after_operator_approval"
      : "configure_usage_collector_before_timer"
  };
}

export async function runTrafficUsageCollectOnce({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  runtimeStateFactory = createRuntimeState
} = {}) {
  const mode = argv.includes("--collect") ? "collect" : "check";
  let state;
  try {
    state = runtimeStateFactory({
      rootDir: cwd,
      env
    });
  } catch (error) {
    stderr.write(`${JSON.stringify(summarizeCollectorStartupFailure(error, {
      mode,
      env,
      failureStage: "runtime_state"
    }))}\n`);
    return 1;
  }

  if (mode === "check") {
    stdout.write(`${JSON.stringify(summarizeCollectorCheck(state))}\n`);
    return summarizeCollectorCheck(state).ok ? 0 : 2;
  }

  const accounting = state.platform?.edgeUsageAccounting;
  if (!accounting || typeof accounting.collectAndRecord !== "function") {
    stderr.write(`${JSON.stringify({
      type: "traffic_usage_collect_once",
      ok: false,
      error: "usage_accounting_not_configured"
    })}\n`);
    return 2;
  }

  const report = await accounting.collectAndRecord({});
  const summary = summarizeUsageAccountingReport(report, {
    unresolvedPolicy: "tolerate_unresolved_bindings"
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
  runTrafficUsageCollectOnce()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const mode = process.argv.slice(2).includes("--collect") ? "collect" : "check";
      process.stderr.write(`${JSON.stringify(summarizeCollectorStartupFailure(error, {
        mode,
        env: process.env,
        failureStage: "unhandled_exception"
      }))}\n`);
      process.exitCode = 1;
    });
}
