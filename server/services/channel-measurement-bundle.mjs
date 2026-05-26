import { buildChannelExtendedMeasurementReport } from "./channel-extended-report.mjs";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeWindow(window) {
  if (!isObject(window)) {
    throw new Error("channel measurement bundle window must be an object");
  }

  const id = safeText(window.id);
  if (!id) {
    throw new Error("channel measurement bundle window id is required");
  }
  return { id };
}

function normalizeManifest(manifest) {
  if (!isObject(manifest) || manifest.mode !== "channel-measurement-bundle" || !Array.isArray(manifest.windows)) {
    throw new Error("channel measurement bundle requires a manifest");
  }

  return {
    generatedAt: manifest.generatedAt,
    runId: safeText(manifest.runId),
    candidateSet: safeText(manifest.candidateSet),
    windows: manifest.windows.map(normalizeWindow)
  };
}

function assertSummaryCount(manifest, summaries) {
  if (!Array.isArray(summaries) || summaries.length !== manifest.windows.length) {
    throw new Error("channel measurement bundle window count mismatch");
  }
}

export function buildChannelMeasurementBundleReport(manifestInput, summaries, options = {}) {
  const manifest = normalizeManifest(manifestInput);
  assertSummaryCount(manifest, summaries);

  const generatedAt = options.generatedAt || manifest.generatedAt || summaries.at(-1)?.generatedAt || new Date().toISOString();
  const extendedReport = buildChannelExtendedMeasurementReport(summaries, {
    ...options,
    generatedAt
  });

  const report = {
    ok: true,
    mode: "channel-measurement-bundle-report",
    generatedAt,
    sourceGeneratedAt: manifest.generatedAt,
    runId: manifest.runId,
    candidateSet: manifest.candidateSet,
    windowCount: manifest.windows.length,
    windowIds: manifest.windows.map((window) => window.id),
    extendedReport
  };

  if (!report.sourceGeneratedAt) {
    delete report.sourceGeneratedAt;
  }
  if (!report.runId) {
    delete report.runId;
  }
  if (!report.candidateSet) {
    delete report.candidateSet;
  }
  return report;
}
