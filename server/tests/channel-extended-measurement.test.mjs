import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assessChannelExtendedMeasurement } from "../services/channel-extended-measurement.mjs";

function withSummary(summary, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-extended-summary-"));
  try {
    const summaryPath = join(tempDir, "summary.json");
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    return fn(summaryPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("assessChannelExtendedMeasurement classifies readiness from safe benchmark summaries", () => {
  const assessment = assessChannelExtendedMeasurement(
    {
      ok: true,
      mode: "local-benchmark-summary",
      generatedAt: "2026-05-26T21:20:00.000Z",
      probes: [
        {
          name: "ss-baseline",
          protocol: "ss",
          role: "baseline",
          qualityClass: "stable",
          sampleCount: 6,
          successRate: 1,
          timeoutCount: 0,
          latencyMs: {
            duration: { p50: 100, p95: 120, p99: 150 }
          },
          rawTarget: "https://secret.example/token=raw-secret"
        },
        {
          name: "hy2-candidate",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "weak-network",
          sampleCount: 3,
          successRate: 1,
          timeoutCount: 0,
          latencyMs: {
            duration: { p50: 180, p95: 240, p99: 260 }
          }
        },
        {
          name: "tuic-candidate",
          protocol: "tuic",
          role: "candidate",
          qualityClass: "weak-network",
          sampleCount: 5,
          successRate: 0.8,
          timeoutCount: 1,
          latencyMs: {
            duration: { p50: 700, p95: 900, p99: 1400 }
          },
          rawError: "secret backend timeout"
        }
      ]
    },
    {
      generatedAt: "2026-05-26T21:21:00.000Z",
      minimumSamples: 5,
      minimumSuccessRate: 0.98,
      maximumTimeoutRate: 0,
      maximumP95DurationMs: 800,
      maximumP99DurationMs: 1200
    }
  );

  assert.deepEqual(assessment, {
    ok: true,
    mode: "channel-extended-measurement-assessment",
    generatedAt: "2026-05-26T21:21:00.000Z",
    sourceGeneratedAt: "2026-05-26T21:20:00.000Z",
    thresholds: {
      minimumSamples: 5,
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
        name: "ss-baseline",
        protocol: "ss",
        role: "baseline",
        qualityClass: "stable",
        sampleCount: 6,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 120,
        p99DurationMs: 150,
        readiness: "ready_for_decision",
        reasonCodes: ["extended_measurement_ready"]
      },
      {
        name: "hy2-candidate",
        protocol: "hysteria2",
        role: "candidate",
        qualityClass: "weak-network",
        sampleCount: 3,
        successRate: 1,
        timeoutRate: 0,
        p95DurationMs: 240,
        p99DurationMs: 260,
        readiness: "needs_extended_measurement",
        reasonCodes: ["insufficient_samples"]
      },
      {
        name: "tuic-candidate",
        protocol: "tuic",
        role: "candidate",
        qualityClass: "weak-network",
        sampleCount: 5,
        successRate: 0.8,
        timeoutRate: 0.2,
        p95DurationMs: 900,
        p99DurationMs: 1400,
        readiness: "hold_for_investigation",
        reasonCodes: [
          "low_success_rate",
          "timeout_rate_exceeded",
          "high_p95_latency",
          "high_p99_latency"
        ]
      }
    ]
  });
  assert.doesNotMatch(JSON.stringify(assessment), /secret|rawTarget|rawError|token=/);
});

test("assessChannelExtendedMeasurement rejects unsupported summaries and thresholds safely", () => {
  assert.throws(
    () =>
      assessChannelExtendedMeasurement({
        ok: true,
        mode: "runtime-canary",
        rawSecret: "secret-token-value",
        probes: []
      }),
    (error) => {
      assert.match(error.message, /extended measurement assessment requires a local benchmark summary/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );

  assert.throws(
    () =>
      assessChannelExtendedMeasurement(
        {
          ok: true,
          mode: "local-benchmark-summary",
          probes: []
        },
        { minimumSamples: 0 }
      ),
    /extended measurement threshold minimumSamples must be a positive number/
  );
});

test("channel extended assessment CLI prints safe JSON from a local summary", () => {
  withSummary(
    {
      ok: true,
      mode: "local-benchmark-summary",
      generatedAt: "2026-05-26T21:30:00.000Z",
      probes: [
        {
          name: "hy2-candidate",
          protocol: "hysteria2",
          role: "candidate",
          qualityClass: "weak-network",
          sampleCount: 60,
          successRate: 1,
          timeoutCount: 0,
          latencyMs: {
            duration: { p50: 160, p95: 220, p99: 280 }
          },
          rawError: "secret backend detail"
        }
      ]
    },
    (summaryPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-extended-assessment.mjs", summaryPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const assessment = JSON.parse(stdout);
      assert.equal(assessment.ok, true);
      assert.equal(assessment.mode, "channel-extended-measurement-assessment");
      assert.equal(assessment.probes[0].readiness, "ready_for_decision");
      assert.doesNotMatch(stdout, /secret|rawError|token=/);
    }
  );
});
