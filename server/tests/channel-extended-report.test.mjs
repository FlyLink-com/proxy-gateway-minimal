import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelExtendedMeasurementReport } from "../services/channel-extended-report.mjs";

function summary({ generatedAt, probes }) {
  return {
    ok: true,
    mode: "local-benchmark-summary",
    generatedAt,
    probes
  };
}

function probe(overrides) {
  return {
    name: "hy2-candidate",
    protocol: "hysteria2",
    role: "candidate",
    qualityClass: "weak-network",
    sampleCount: 60,
    successRate: 1,
    timeoutCount: 0,
    latencyMs: {
      duration: { p50: 180, p95: 260, p99: 320 }
    },
    ...overrides
  };
}

function withSummaryFiles(summaries, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-extended-report-"));
  try {
    const paths = summaries.map((payload, index) => {
      const filePath = join(tempDir, `summary-${index + 1}.json`);
      writeFileSync(filePath, JSON.stringify(payload, null, 2));
      return filePath;
    });
    return fn(paths);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("buildChannelExtendedMeasurementReport aggregates multiple local measurement windows safely", () => {
  const report = buildChannelExtendedMeasurementReport(
    [
      summary({
        generatedAt: "2026-05-26T22:20:00.000Z",
        probes: [
          probe({ name: "hy2-candidate", rawTarget: "https://secret.example/token=raw-secret" }),
          probe({
            name: "tuic-candidate",
            protocol: "tuic",
            successRate: 0.9,
            timeoutCount: 4,
            rawError: "secret backend timeout"
          }),
          probe({
            name: "ss-baseline",
            protocol: "ss",
            role: "baseline",
            qualityClass: "stable"
          })
        ]
      }),
      summary({
        generatedAt: "2026-05-26T23:20:00.000Z",
        probes: [
          probe({ name: "hy2-candidate" }),
          probe({
            name: "tuic-candidate",
            protocol: "tuic"
          })
        ]
      })
    ],
    {
      generatedAt: "2026-05-26T23:25:00.000Z",
      minimumWindows: 2,
      minimumSamples: 50,
      minimumSuccessRate: 0.98,
      maximumTimeoutRate: 0,
      maximumP95DurationMs: 800,
      maximumP99DurationMs: 1200
    }
  );

  assert.deepEqual(report, {
    ok: true,
    mode: "channel-extended-measurement-report",
    generatedAt: "2026-05-26T23:25:00.000Z",
    windowCount: 2,
    thresholds: {
      minimumWindows: 2,
      minimumSamples: 50,
      minimumSuccessRate: 0.98,
      maximumTimeoutRate: 0,
      maximumP95DurationMs: 800,
      maximumP99DurationMs: 1200
    },
    probeCount: 3,
    readyCount: 1,
    needsExtendedMeasurementCount: 1,
    holdCount: 1,
    probes: [
      {
        name: "hy2-candidate",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        windowCount: 2,
        readyWindowCount: 2,
        needsExtendedMeasurementWindowCount: 0,
        holdWindowCount: 0,
        totalSampleCount: 120,
        readiness: "ready_for_decision",
        reasonCodes: ["extended_measurement_ready"]
      },
      {
        name: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        windowCount: 1,
        readyWindowCount: 1,
        needsExtendedMeasurementWindowCount: 0,
        holdWindowCount: 0,
        totalSampleCount: 60,
        readiness: "needs_extended_measurement",
        reasonCodes: ["insufficient_windows"]
      },
      {
        name: "tuic-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "weak-network",
        windowCount: 2,
        readyWindowCount: 1,
        needsExtendedMeasurementWindowCount: 0,
        holdWindowCount: 1,
        totalSampleCount: 120,
        readiness: "hold_for_investigation",
        reasonCodes: ["hold_window_present", "low_success_rate", "timeout_rate_exceeded"]
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(report), /secret|rawTarget|rawError|token=/);
});

test("buildChannelExtendedMeasurementReport rejects unsupported input safely", () => {
  assert.throws(
    () =>
      buildChannelExtendedMeasurementReport([
        {
          ok: true,
          mode: "remote-runtime-result",
          rawSecret: "secret-token-value",
          probes: []
        }
      ]),
    (error) => {
      assert.match(error.message, /extended measurement report requires local benchmark summaries/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );

  assert.throws(
    () => buildChannelExtendedMeasurementReport([], { minimumWindows: 0 }),
    /extended measurement threshold minimumWindows must be a positive number/
  );
});

test("channel extended report CLI prints safe JSON from local summary windows", () => {
  withSummaryFiles(
    [
      summary({
        generatedAt: "2026-05-26T22:40:00.000Z",
        probes: [probe({ name: "hy2-candidate", rawError: "secret backend detail" })]
      }),
      summary({
        generatedAt: "2026-05-26T23:40:00.000Z",
        probes: [probe({ name: "hy2-candidate" })]
      })
    ],
    (paths) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-extended-report.mjs", ...paths], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const report = JSON.parse(stdout);
      assert.equal(report.ok, true);
      assert.equal(report.mode, "channel-extended-measurement-report");
      assert.equal(report.probes[0].readiness, "ready_for_decision");
      assert.doesNotMatch(stdout, /secret|rawError|token=/);
    }
  );
});
