import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { buildChannelMeasurementBundleReport } from "../services/channel-measurement-bundle.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixtureDir = join(
  repoRoot,
  "docs",
  "channel-measurement-bundles",
  "2026-05-26-channel-lab-a-hysteria2-short-canary"
);

function readJson(...segments) {
  return JSON.parse(readFileSync(join(fixtureDir, ...segments), "utf8"));
}

test("historical Hysteria2 short canary fixture remains below extended measurement gate", () => {
  const manifest = readJson("manifest.json");
  const summaries = manifest.windows.map((window) => readJson(window.summaryFile));

  const report = buildChannelMeasurementBundleReport(manifest, summaries, {
    generatedAt: "2026-05-26T18:45:00.000Z"
  });

  assert.equal(report.mode, "channel-measurement-bundle-report");
  assert.equal(report.runId, "2026-05-26-channel-lab-a-hysteria2-short-canary");
  assert.equal(report.candidateSet, "channel-lab-a-hysteria2-short-canary");
  assert.equal(report.windowCount, 2);
  assert.equal(report.extendedReport.probeCount, 2);
  assert.equal(report.extendedReport.readyCount, 0);
  assert.equal(report.extendedReport.needsExtendedMeasurementCount, 2);
  assert.equal(report.extendedReport.holdCount, 0);

  const probes = report.extendedReport.probes;
  assert.deepEqual(
    probes.map((probe) => probe.readiness),
    ["needs_extended_measurement", "needs_extended_measurement"]
  );
  assert.ok(probes.every((probe) => probe.reasonCodes.includes("insufficient_windows")));
  assert.ok(probes.every((probe) => probe.reasonCodes.includes("insufficient_samples")));
  assert.ok(probes.every((probe) => probe.totalSampleCount === 20));
  assert.doesNotMatch(JSON.stringify(report), /secret|token|subscription|password|summaryFile|raw/i);
});
