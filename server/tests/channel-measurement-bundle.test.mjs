import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelMeasurementBundleReport } from "../services/channel-measurement-bundle.mjs";

function summary({ generatedAt, probes }) {
  return {
    ok: true,
    mode: "local-benchmark-summary",
    generatedAt,
    probes
  };
}

function probe(overrides = {}) {
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

function manifest(overrides = {}) {
  return {
    mode: "channel-measurement-bundle",
    generatedAt: "2026-05-26T23:50:00.000Z",
    runId: "hy2-long-haul-001",
    candidateSet: "operator-device-hy2",
    windows: [
      { id: "window-1", summaryFile: "inputs/secret-path-window-1.json" },
      { id: "window-2", summaryFile: "inputs/secret-path-window-2.json" }
    ],
    operatorNotes: "secret note that must not be emitted",
    ...overrides
  };
}

function withBundleFiles({ bundle, summaries }, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-measurement-bundle-"));
  try {
    const inputDir = join(tempDir, "inputs");
    mkdirSync(inputDir);
    const manifestPath = join(tempDir, "bundle.json");
    const fileBundle = {
      ...bundle,
      windows: bundle.windows.map((window, index) => {
        const fileName = `window-${index + 1}.json`;
        writeFileSync(join(inputDir, fileName), JSON.stringify(summaries[index], null, 2));
        return { ...window, summaryFile: `inputs/${fileName}` };
      })
    };
    writeFileSync(manifestPath, JSON.stringify(fileBundle, null, 2));
    return fn(manifestPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("buildChannelMeasurementBundleReport turns manifest windows into a safe report", () => {
  const report = buildChannelMeasurementBundleReport(
    manifest(),
    [
      summary({
        generatedAt: "2026-05-26T23:00:00.000Z",
        probes: [probe({ rawTarget: "https://secret.example/token=raw-secret" })]
      }),
      summary({
        generatedAt: "2026-05-26T23:30:00.000Z",
        probes: [probe({ rawError: "secret backend detail" })]
      })
    ],
    {
      generatedAt: "2026-05-26T23:55:00.000Z",
      minimumWindows: 2,
      minimumSamples: 50
    }
  );

  assert.deepEqual(report, {
    ok: true,
    mode: "channel-measurement-bundle-report",
    generatedAt: "2026-05-26T23:55:00.000Z",
    sourceGeneratedAt: "2026-05-26T23:50:00.000Z",
    runId: "hy2-long-haul-001",
    candidateSet: "operator-device-hy2",
    windowCount: 2,
    windowIds: ["window-1", "window-2"],
    extendedReport: {
      ok: true,
      mode: "channel-extended-measurement-report",
      generatedAt: "2026-05-26T23:55:00.000Z",
      windowCount: 2,
      thresholds: {
        minimumWindows: 2,
        minimumSamples: 50,
        minimumSuccessRate: 0.98,
        maximumTimeoutRate: 0.01,
        maximumP95DurationMs: 1200,
        maximumP99DurationMs: 1800
      },
      probeCount: 1,
      readyCount: 1,
      needsExtendedMeasurementCount: 0,
      holdCount: 0,
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
        }
      ]
    }
  });
  assert.doesNotMatch(JSON.stringify(report), /secret|summaryFile|rawTarget|rawError|token=/);
});

test("buildChannelMeasurementBundleReport rejects unsafe or mismatched manifests without echoing raw fields", () => {
  assert.throws(
    () =>
      buildChannelMeasurementBundleReport(
        {
          mode: "runtime-canary",
          rawSecret: "secret-token-value",
          windows: []
        },
        []
      ),
    (error) => {
      assert.match(error.message, /channel measurement bundle requires a manifest/);
      assert.doesNotMatch(error.message, /secret-token-value|rawSecret/);
      return true;
    }
  );

  assert.throws(
    () =>
      buildChannelMeasurementBundleReport(
        manifest({
          windows: [{ id: "window-1", summaryFile: "inputs/secret-file.json" }]
        }),
        [
          summary({
            generatedAt: "2026-05-26T23:00:00.000Z",
            probes: [probe()]
          }),
          summary({
            generatedAt: "2026-05-26T23:30:00.000Z",
            probes: [probe()]
          })
        ]
      ),
    (error) => {
      assert.match(error.message, /channel measurement bundle window count mismatch/);
      assert.doesNotMatch(error.message, /secret-file/);
      return true;
    }
  );
});

test("channel measurement bundle CLI reads a manifest without leaking file paths", () => {
  withBundleFiles(
    {
      bundle: manifest(),
      summaries: [
        summary({
          generatedAt: "2026-05-26T23:00:00.000Z",
          probes: [probe({ rawTarget: "https://secret.example/token=raw-secret" })]
        }),
        summary({
          generatedAt: "2026-05-26T23:30:00.000Z",
          probes: [probe()]
        })
      ]
    },
    (manifestPath) => {
      const stdout = execFileSync(process.execPath, ["scripts/channel-measurement-bundle.mjs", manifestPath], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const report = JSON.parse(stdout);
      assert.equal(report.ok, true);
      assert.equal(report.mode, "channel-measurement-bundle-report");
      assert.equal(report.extendedReport.probes[0].readiness, "ready_for_decision");
      assert.doesNotMatch(stdout, /secret|summaryFile|inputs\/window|rawTarget|token=/);
    }
  );
});
