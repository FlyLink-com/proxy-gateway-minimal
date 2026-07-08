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
    observationCount: Number(report?.observationCount || 0),
    recordedCount: Number(report?.recordedCount || 0),
    insertedCount: Number(report?.insertedCount || 0),
    unresolvedCount: Number(report?.unresolvedCount || 0),
    quotaDisableRequiredCount: Number(report?.quotaDisableRequiredCount || 0),
    unresolvedPolicy,
    unresolvedBindingTolerated,
    mappingReviewRequired: unresolvedBindingTolerated,
    reports: reports.map((entry) => ({
      channelRef: String(entry?.channelRef || "").trim(),
      collectorOk: entry?.collectorOk === true,
      collectorStatus: String(entry?.collectorStatus || "").trim(),
      observationCount: Number(entry?.observationCount || 0),
      recordedCount: Number(entry?.recordedCount || 0),
      unresolvedCount: Number(entry?.unresolvedCount || 0),
      blockers: reportCodeList(entry?.blockers),
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
  stderr = process.stderr
} = {}) {
  const mode = argv.includes("--collect") ? "collect" : "check";
  const state = createRuntimeState({
    rootDir: cwd,
    env
  });

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
      process.stderr.write(`${JSON.stringify({
        type: "traffic_usage_collect_once",
        ok: false,
        error: error?.code || "collector_exception"
      })}\n`);
      process.exitCode = 1;
    });
}
