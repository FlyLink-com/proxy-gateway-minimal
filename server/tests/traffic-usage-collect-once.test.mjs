import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  hasOnlyUnresolvedBindingFailures,
  runTrafficUsageCollectOnce,
  summarizeCollectorCheck,
  summarizeCollectorStartupFailure,
  summarizeUsageAccountingReport
} from "../../scripts/traffic-usage-collect-once.mjs";

test("traffic usage collect summary omits credential refs and raw runtime payloads", () => {
  const summary = summarizeUsageAccountingReport({
    ok: true,
    collectorCount: 1,
    observationCount: 1,
    recordedCount: 1,
    insertedCount: 1,
    unresolvedCount: 0,
    quotaDisableRequiredCount: 0,
    trafficSupplySuspendRequiredCount: 0,
    trafficSupplySuspendAttemptedCount: 0,
    trafficSupplySuspendExecutedCount: 0,
    trafficSupplySuspendFailedCount: 0,
    trafficSupplySuspendPendingCount: 0,
    nextAction: "continue_usage_monitoring",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    },
    redacted: true,
    reports: [
      {
        channelRef: "channel-vultr-a-hy2",
        collectorOk: true,
        collectorStatus: "collected",
        observationCount: 1,
        recordedCount: 1,
        unresolvedCount: 0,
        blockers: [],
        recorded: [
          {
            edgeCredentialRef: "edgecred_sensitive_ref",
            sampleInserted: true
          }
        ],
        nextAction: "record_usage_observations_with_control_plane_accounting"
      }
    ]
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.reports[0].recordedCount, 1);
  assert.equal(summary.trafficSupplySuspendRequiredCount, 0);
  assert.equal(summary.trafficSupplySuspendExecutedCount, 0);
  assert.equal(JSON.stringify(summary).includes("edgecred_sensitive_ref"), false);
  assert.deepEqual(summary.safety, {
    noRawRuntimePayload: true,
    noSecretMaterialReturned: true,
    redacted: true
  });
});

test("traffic usage collect summary exposes idle Xray collectors as observable status", () => {
  const summary = summarizeUsageAccountingReport({
    ok: true,
    collectorCount: 1,
    idleCollectorCount: 1,
    observationCount: 0,
    recordedCount: 0,
    insertedCount: 0,
    unresolvedCount: 0,
    quotaDisableRequiredCount: 0,
    trafficSupplySuspendRequiredCount: 0,
    trafficSupplySuspendAttemptedCount: 0,
    trafficSupplySuspendExecutedCount: 0,
    trafficSupplySuspendFailedCount: 0,
    trafficSupplySuspendPendingCount: 0,
    nextAction: "continue_usage_monitoring",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    },
    redacted: true,
    reports: [
      {
        channelRef: "channel-sgp-a-vless-reality-tcp",
        collectorOk: true,
        collectorStatus: "idle_no_user_traffic",
        idle: true,
        observationCount: 0,
        recordedCount: 0,
        unresolvedCount: 0,
        blockers: [],
        observability: {
          statsApiReachable: true,
          userTrafficCountersObserved: false
        },
        recorded: [],
        nextAction: "continue_usage_monitoring_until_user_counters_are_observed"
      }
    ]
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.idleCollectorCount, 1);
  assert.equal(summary.reports[0].idle, true);
  assert.deepEqual(summary.reports[0].observability, {
    statsApiReachable: true,
    userTrafficCountersObserved: false
  });
  assert.equal(JSON.stringify(summary).includes("edgecred_"), false);
});

test("traffic usage collect summary tolerates only unresolved binding residue", () => {
  const report = {
    ok: false,
    collectorCount: 1,
    observationCount: 2,
    recordedCount: 1,
    insertedCount: 1,
    unresolvedCount: 1,
    quotaDisableRequiredCount: 0,
    nextAction: "review_usage_collector_mapping",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    },
    redacted: true,
    reports: [
      {
        channelRef: "channel-vultr-a-hy2",
        collectorOk: true,
        collectorStatus: "collected",
        observationCount: 2,
        recordedCount: 1,
        unresolvedCount: 1,
        blockers: [],
        recorded: [
          {
            ok: true,
            status: "within_quota",
            edgeCredentialRef: "edgecred_recorded_ref"
          },
          {
            ok: false,
            status: "unresolved_binding",
            edgeCredentialRef: "edgecred_unresolved_ref"
          }
        ],
        nextAction: "record_usage_observations_with_control_plane_accounting"
      }
    ]
  };

  assert.equal(hasOnlyUnresolvedBindingFailures(report), true);
  const summary = summarizeUsageAccountingReport(report, {
    unresolvedPolicy: "tolerate_unresolved_bindings"
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.rawReportOk, false);
  assert.equal(summary.unresolvedBindingTolerated, true);
  assert.equal(summary.mappingReviewRequired, true);
  assert.equal(summary.nextAction, "continue_usage_monitoring_review_unresolved_mapping");
  assert.equal(JSON.stringify(summary).includes("edgecred_recorded_ref"), false);
  assert.equal(JSON.stringify(summary).includes("edgecred_unresolved_ref"), false);
});

test("traffic usage collect summary does not tolerate non-mapping failures", () => {
  const report = {
    ok: false,
    collectorCount: 1,
    observationCount: 1,
    recordedCount: 0,
    insertedCount: 0,
    unresolvedCount: 1,
    quotaDisableRequiredCount: 0,
    nextAction: "review_usage_collector_mapping",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    },
    redacted: true,
    reports: [
      {
        channelRef: "channel-vultr-a-hy2",
        collectorOk: true,
        collectorStatus: "collected",
        observationCount: 1,
        recordedCount: 0,
        unresolvedCount: 1,
        blockers: [],
        recorded: [
          {
            ok: false,
            status: "accounting_error",
            edgeCredentialRef: "edgecred_failed_ref"
          }
        ],
        nextAction: "record_usage_observations_with_control_plane_accounting"
      }
    ]
  };

  assert.equal(hasOnlyUnresolvedBindingFailures(report), false);
  const summary = summarizeUsageAccountingReport(report, {
    unresolvedPolicy: "tolerate_unresolved_bindings"
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.unresolvedBindingTolerated, false);
  assert.equal(summary.mappingReviewRequired, false);
  assert.equal(JSON.stringify(summary).includes("edgecred_failed_ref"), false);
});

test("traffic usage collect check reports configured collector count without collecting", () => {
  const summary = summarizeCollectorCheck({
    platform: {
      edgeUsageAccounting: {
        collectAndRecord() {}
      },
      edgeUsageCollectors: [
        { channelRef: "channel-vultr-a-hy2" }
      ]
    }
  });

  assert.deepEqual(summary, {
    type: "traffic_usage_collect_check",
    ok: true,
    collectorCount: 1,
    channelRefs: ["channel-vultr-a-hy2"],
    nextAction: "enable_timer_after_operator_approval"
  });
});

test("traffic usage startup failure summary exposes redacted admin status probe", () => {
  const error = new Error("ADMIN_AUTH_PORTAL_ACCOUNT_ID is required when admin auth routes are enabled");
  const summary = summarizeCollectorStartupFailure(error, {
    mode: "collect",
    env: {
      ADMIN_AUTH_ROUTES_ENABLED: "true",
      ADMIN_AUTH_SESSION_SECRET: "synthetic-secret"
    }
  });

  assert.deepEqual(summary, {
    type: "traffic_usage_collect_status",
    ok: false,
    mode: "collect",
    status: "startup_failed",
    failureStage: "runtime_state",
    failureClass: "admin_auth_operator_ref_missing",
    errorCode: "collector_exception",
    adminStatus: {
      adminAuthRoutesEnabled: true,
      adminAuthPortalAccountIdPresent: false,
      adminAuthSessionSecretPresent: true
    },
    nextAction: "sync_usage_collector_admin_auth_environment",
    safety: {
      redacted: true,
      noRawEnvValues: true,
      noSecretMaterialReturned: true,
      adminStatusProbe: true
    }
  });
  assert.equal(JSON.stringify(summary).includes("synthetic-secret"), false);
});

test("traffic usage collect CLI reports startup diagnostics when runtime state initialization fails", async () => {
  let stderr = "";
  const exitCode = await runTrafficUsageCollectOnce({
    argv: ["--collect"],
    env: {
      ADMIN_AUTH_ROUTES_ENABLED: "true",
      ADMIN_AUTH_SESSION_SECRET: "synthetic-secret"
    },
    stdout: { write() {} },
    stderr: { write(chunk) { stderr += chunk; } },
    runtimeStateFactory() {
      throw new Error("ADMIN_AUTH_PORTAL_ACCOUNT_ID is required when admin auth routes are enabled");
    }
  });

  assert.equal(exitCode, 1);
  const summary = JSON.parse(stderr);
  assert.equal(summary.type, "traffic_usage_collect_status");
  assert.equal(summary.status, "startup_failed");
  assert.equal(summary.failureClass, "admin_auth_operator_ref_missing");
  assert.equal(summary.adminStatus.adminAuthRoutesEnabled, true);
  assert.equal(summary.adminStatus.adminAuthPortalAccountIdPresent, false);
  assert.equal(summary.adminStatus.adminAuthSessionSecretPresent, true);
  assert.equal(JSON.stringify(summary).includes("synthetic-secret"), false);
});

test("traffic usage collect CLI runs when invoked through a symlinked path", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "traffic-usage-collect-cli-"));
  const scriptPath = join(tempDir, "check-direct-invocation.mjs");
  writeFileSync(scriptPath, [
    "import { realpathSync } from 'node:fs';",
    "import { resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "function isDirectInvocation() {",
    "  if (!process.argv[1]) return false;",
    "  try {",
    "    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));",
    "  } catch {",
    "    return false;",
    "  }",
    "}",
    "if (isDirectInvocation()) console.log(JSON.stringify({ ok: true }));",
    ""
  ].join("\n"));

  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true });
});
