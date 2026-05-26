import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelMeasurementInvestigationReport } from "../services/channel-measurement-investigation.mjs";

const rootDir = new URL("../../", import.meta.url);

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, rootDir), "utf8"));
}

function bundleReport(overrides = {}) {
  return {
    ok: true,
    mode: "channel-measurement-bundle-report",
    generatedAt: "2026-05-26T16:15:00.000Z",
    runId: "safe-run-id",
    candidateSet: "safe-candidate-set",
    windowCount: 6,
    windowIds: ["window-1", "window-2", "window-3", "window-4", "window-5", "window-6"],
    extendedReport: {
      ok: true,
      mode: "channel-extended-measurement-report",
      generatedAt: "2026-05-26T16:15:00.000Z",
      thresholds: {
        minimumWindows: 2,
        minimumSamples: 60,
        minimumSuccessRate: 0.98,
        maximumTimeoutRate: 0.01,
        maximumP95DurationMs: 1200,
        maximumP99DurationMs: 1800
      },
      windowCount: 6,
      probeCount: 2,
      readyCount: 0,
      needsExtendedMeasurementCount: 0,
      holdCount: 2,
      probes: [
        {
          name: "candidate-direct",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "direct",
          windowCount: 3,
          readyWindowCount: 0,
          needsExtendedMeasurementWindowCount: 0,
          holdWindowCount: 3,
          totalSampleCount: 180,
          readiness: "hold_for_investigation",
          reasonCodes: ["hold_window_present", "high_p95_latency", "high_p99_latency"]
        },
        {
          name: "candidate-client",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "client",
          windowCount: 3,
          readyWindowCount: 2,
          needsExtendedMeasurementWindowCount: 0,
          holdWindowCount: 1,
          totalSampleCount: 180,
          readiness: "hold_for_investigation",
          reasonCodes: ["hold_window_present", "high_p99_latency"]
        }
      ]
    },
    ...overrides
  };
}

test("buildChannelMeasurementInvestigationReport summarizes real Hysteria2 extended evidence without rollout approval", () => {
  const report = buildChannelMeasurementInvestigationReport(
    readJson(
      "docs/channel-measurement-bundles/2026-05-26-channel-lab-a-hysteria2-extended-measurement/bundle-report.json"
    ),
    { generatedAt: "2026-05-27T09:00:00.000Z" }
  );

  assert.equal(report.ok, true);
  assert.equal(report.mode, "channel-measurement-investigation-report");
  assert.equal(report.generatedAt, "2026-05-27T09:00:00.000Z");
  assert.equal(report.runId, "2026-05-26-channel-lab-a-hysteria2-extended-measurement");
  assert.equal(report.candidateSet, "channel-lab-a-hysteria2-extended-measurement");
  assert.equal(report.overallStatus, "hold_for_investigation");
  assert.equal(report.totalSampleCount, 360);
  assert.deepEqual(report.decision, {
    rolloutRecommendation: "do_not_roll_out",
    nextAction: "compare_or_investigate_candidate",
    productionImpact: "none",
    requiresRiskAForRuntime: true
  });
  assert.deepEqual(report.summary, {
    probeCount: 2,
    readyCount: 0,
    needsExtendedMeasurementCount: 0,
    holdCount: 2,
    holdReasonCodes: ["high_p95_latency", "high_p99_latency", "hold_window_present"]
  });
  assert.deepEqual(
    report.probes.map((probe) => ({
      name: probe.name,
      issuePattern: probe.issuePattern,
      investigationPriority: probe.investigationPriority
    })),
    [
      {
        name: "channel-lab-a-hysteria2-operator-device",
        issuePattern: "sustained_tail_latency",
        investigationPriority: "high"
      },
      {
        name: "channel-lab-a-hysteria2-mihomo-import",
        issuePattern: "isolated_tail_spike",
        investigationPriority: "medium"
      }
    ]
  );
  assert.doesNotMatch(JSON.stringify(report), /13\.|token=|secret|subscription|password|raw/i);
});

test("buildChannelMeasurementInvestigationReport keeps ready evidence advisory only", () => {
  const report = buildChannelMeasurementInvestigationReport({
    ...bundleReport(),
    extendedReport: {
      ...bundleReport().extendedReport,
      readyCount: 1,
      holdCount: 0,
      probes: [
        {
          name: "candidate-ready",
          protocol: "tuic",
          role: "candidate",
          qualityClass: "client",
          windowCount: 3,
          readyWindowCount: 3,
          needsExtendedMeasurementWindowCount: 0,
          holdWindowCount: 0,
          totalSampleCount: 180,
          readiness: "ready_for_decision",
          reasonCodes: ["extended_measurement_ready"]
        }
      ]
    }
  });

  assert.equal(report.overallStatus, "ready_for_operator_decision");
  assert.equal(report.decision.rolloutRecommendation, "operator_decision_required");
  assert.equal(report.decision.requiresRiskAForRuntime, true);
});

test("buildChannelMeasurementInvestigationReport is fail-closed and does not echo unsafe fields", () => {
  assert.throws(
    () =>
      buildChannelMeasurementInvestigationReport({
        mode: "runtime-result",
        rawSecret: "secret-token-value",
        extendedReport: {}
      }),
    (error) => {
      assert.match(error.message, /requires a channel measurement bundle report/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );
});

test("channel measurement investigation CLI prints safe JSON", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-measurement-investigation-"));
  try {
    const inputPath = join(tempDir, "bundle-report.json");
    writeFileSync(
      inputPath,
      JSON.stringify(
        bundleReport({
          rawSecret: "secret-token-value",
          operatorNotes: "do not emit this"
        }),
        null,
        2
      )
    );

    const stdout = execFileSync(process.execPath, ["scripts/channel-measurement-investigation.mjs", inputPath], {
      cwd: rootDir,
      encoding: "utf8"
    });

    const report = JSON.parse(stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "channel-measurement-investigation-report");
    assert.equal(report.overallStatus, "hold_for_investigation");
    assert.doesNotMatch(stdout, /secret|operatorNotes|rawSecret|token=/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
