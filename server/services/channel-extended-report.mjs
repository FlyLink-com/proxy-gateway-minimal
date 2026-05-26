import { assessChannelExtendedMeasurement } from "./channel-extended-measurement.mjs";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`extended measurement threshold ${fieldName} must be a positive number`);
  }
  return number;
}

function normalizeOptions(options) {
  return {
    minimumWindows: positiveNumber(options.minimumWindows ?? 2, "minimumWindows"),
    minimumSamples: options.minimumSamples,
    minimumSuccessRate: options.minimumSuccessRate,
    maximumTimeoutRate: options.maximumTimeoutRate,
    maximumP95DurationMs: options.maximumP95DurationMs,
    maximumP99DurationMs: options.maximumP99DurationMs
  };
}

function assertLocalSummaries(summaries) {
  if (
    !Array.isArray(summaries) ||
    summaries.some(
      (summary) => !isObject(summary) || summary.mode !== "local-benchmark-summary" || !Array.isArray(summary.probes)
    )
  ) {
    throw new Error("extended measurement report requires local benchmark summaries");
  }
}

function cleanThresholds(thresholds, minimumWindows) {
  return {
    minimumWindows,
    minimumSamples: thresholds.minimumSamples,
    minimumSuccessRate: thresholds.minimumSuccessRate,
    maximumTimeoutRate: thresholds.maximumTimeoutRate,
    maximumP95DurationMs: thresholds.maximumP95DurationMs,
    maximumP99DurationMs: thresholds.maximumP99DurationMs
  };
}

function probeKey(probe) {
  return `${probe.name}\0${probe.protocol}\0${probe.role}`;
}

function addReason(target, reason) {
  if (reason !== "extended_measurement_ready" && !target.includes(reason)) {
    target.push(reason);
  }
}

function summarizeProbe(group, minimumWindows) {
  const reasonCodes = [];
  if (group.holdWindowCount > 0) {
    reasonCodes.push("hold_window_present");
    group.reasonCodes.forEach((reason) => addReason(reasonCodes, reason));
  } else if (group.windowCount < minimumWindows || group.needsExtendedMeasurementWindowCount > 0) {
    if (group.windowCount < minimumWindows) {
      reasonCodes.push("insufficient_windows");
    }
    group.reasonCodes.forEach((reason) => addReason(reasonCodes, reason));
  } else {
    reasonCodes.push("extended_measurement_ready");
  }

  let readiness = "ready_for_decision";
  if (reasonCodes.includes("hold_window_present")) {
    readiness = "hold_for_investigation";
  } else if (reasonCodes.includes("insufficient_windows") || group.needsExtendedMeasurementWindowCount > 0) {
    readiness = "needs_extended_measurement";
  }

  const payload = {
    name: group.name,
    protocol: group.protocol,
    role: group.role,
    qualityClass: group.qualityClass,
    windowCount: group.windowCount,
    readyWindowCount: group.readyWindowCount,
    needsExtendedMeasurementWindowCount: group.needsExtendedMeasurementWindowCount,
    holdWindowCount: group.holdWindowCount,
    totalSampleCount: group.totalSampleCount,
    readiness,
    reasonCodes
  };

  if (!payload.qualityClass) {
    delete payload.qualityClass;
  }
  return payload;
}

const READINESS_ORDER = {
  ready_for_decision: 0,
  needs_extended_measurement: 1,
  hold_for_investigation: 2
};

function sortProbes(a, b) {
  return READINESS_ORDER[a.readiness] - READINESS_ORDER[b.readiness] || a.name.localeCompare(b.name);
}

export function buildChannelExtendedMeasurementReport(summaries, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  assertLocalSummaries(summaries);

  const groups = new Map();
  let thresholds;

  for (const summary of summaries) {
    const assessment = assessChannelExtendedMeasurement(summary, {
      ...normalizedOptions,
      generatedAt: summary.generatedAt
    });
    thresholds = cleanThresholds(assessment.thresholds, normalizedOptions.minimumWindows);

    for (const probe of assessment.probes) {
      const key = probeKey(probe);
      if (!groups.has(key)) {
        groups.set(key, {
          name: probe.name,
          protocol: probe.protocol,
          role: probe.role,
          qualityClass: probe.qualityClass,
          windowCount: 0,
          readyWindowCount: 0,
          needsExtendedMeasurementWindowCount: 0,
          holdWindowCount: 0,
          totalSampleCount: 0,
          reasonCodes: []
        });
      }

      const group = groups.get(key);
      group.windowCount += 1;
      group.totalSampleCount += probe.sampleCount;
      if (probe.readiness === "ready_for_decision") {
        group.readyWindowCount += 1;
      } else if (probe.readiness === "needs_extended_measurement") {
        group.needsExtendedMeasurementWindowCount += 1;
      } else if (probe.readiness === "hold_for_investigation") {
        group.holdWindowCount += 1;
      }
      probe.reasonCodes.forEach((reason) => addReason(group.reasonCodes, reason));
    }
  }

  thresholds ??= cleanThresholds(
    assessChannelExtendedMeasurement({ ok: true, mode: "local-benchmark-summary", probes: [] }, normalizedOptions)
      .thresholds,
    normalizedOptions.minimumWindows
  );

  const probes = [...groups.values()].map((group) => summarizeProbe(group, normalizedOptions.minimumWindows)).sort(sortProbes);

  return {
    ok: true,
    mode: "channel-extended-measurement-report",
    generatedAt: options.generatedAt || summaries.at(-1)?.generatedAt || new Date().toISOString(),
    windowCount: summaries.length,
    thresholds,
    probeCount: probes.length,
    readyCount: probes.filter((probe) => probe.readiness === "ready_for_decision").length,
    needsExtendedMeasurementCount: probes.filter((probe) => probe.readiness === "needs_extended_measurement").length,
    holdCount: probes.filter((probe) => probe.readiness === "hold_for_investigation").length,
    probes
  };
}
