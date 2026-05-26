function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function optionalText(value) {
  const result = text(value);
  return result || undefined;
}

function roundRate(value) {
  return Number(value.toFixed(4));
}

function positiveNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`extended measurement threshold ${fieldName} must be a positive number`);
  }
  return number;
}

function nonNegativeNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`extended measurement threshold ${fieldName} must be a non-negative number`);
  }
  return number;
}

function probeNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`extended measurement probe ${fieldName} must be a non-negative number`);
  }
  return number;
}

function durationPercentile(probe, percentileName) {
  const value = probe.latencyMs?.duration?.[percentileName];
  return value === undefined || value === null ? null : probeNumber(value, percentileName);
}

function normalizeThresholds(options) {
  return {
    minimumSamples: positiveNumber(options.minimumSamples ?? 60, "minimumSamples"),
    minimumSuccessRate: positiveNumber(options.minimumSuccessRate ?? 0.98, "minimumSuccessRate"),
    maximumTimeoutRate: nonNegativeNumber(options.maximumTimeoutRate ?? 0.01, "maximumTimeoutRate"),
    maximumP95DurationMs: positiveNumber(options.maximumP95DurationMs ?? 1200, "maximumP95DurationMs"),
    maximumP99DurationMs: positiveNumber(options.maximumP99DurationMs ?? 1800, "maximumP99DurationMs")
  };
}

function assessProbe(probe, thresholds) {
  if (!isObject(probe)) {
    throw new Error("extended measurement probe must be an object");
  }

  const sampleCount = probeNumber(probe.sampleCount, "sampleCount");
  const successRate = probeNumber(probe.successRate, "successRate");
  const timeoutCount = probeNumber(probe.timeoutCount ?? 0, "timeoutCount");
  const timeoutRate = sampleCount === 0 ? 0 : roundRate(timeoutCount / sampleCount);
  const p95DurationMs = durationPercentile(probe, "p95");
  const p99DurationMs = durationPercentile(probe, "p99");
  const reasonCodes = [];

  if (sampleCount < thresholds.minimumSamples) {
    reasonCodes.push("insufficient_samples");
  }
  if (successRate < thresholds.minimumSuccessRate) {
    reasonCodes.push("low_success_rate");
  }
  if (timeoutRate > thresholds.maximumTimeoutRate) {
    reasonCodes.push("timeout_rate_exceeded");
  }
  if (p95DurationMs !== null && p95DurationMs > thresholds.maximumP95DurationMs) {
    reasonCodes.push("high_p95_latency");
  }
  if (p99DurationMs !== null && p99DurationMs > thresholds.maximumP99DurationMs) {
    reasonCodes.push("high_p99_latency");
  }

  let readiness = "ready_for_decision";
  if (reasonCodes.includes("insufficient_samples")) {
    readiness = "needs_extended_measurement";
  } else if (reasonCodes.length > 0) {
    readiness = "hold_for_investigation";
  } else {
    reasonCodes.push("extended_measurement_ready");
  }

  const payload = {
    name: text(probe.name),
    protocol: text(probe.protocol),
    role: text(probe.role),
    qualityClass: optionalText(probe.qualityClass),
    sampleCount,
    successRate,
    timeoutRate,
    p95DurationMs,
    p99DurationMs,
    readiness,
    reasonCodes
  };

  if (!payload.qualityClass) {
    delete payload.qualityClass;
  }
  return payload;
}

export function assessChannelExtendedMeasurement(summary, options = {}) {
  if (!isObject(summary) || summary.mode !== "local-benchmark-summary" || !Array.isArray(summary.probes)) {
    throw new Error("extended measurement assessment requires a local benchmark summary");
  }

  const thresholds = normalizeThresholds(options);
  const probes = summary.probes.map((probe) => assessProbe(probe, thresholds));

  return {
    ok: true,
    mode: "channel-extended-measurement-assessment",
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceGeneratedAt: summary.generatedAt,
    thresholds,
    probeCount: probes.length,
    readyCount: probes.filter((probe) => probe.readiness === "ready_for_decision").length,
    needsExtendedMeasurementCount: probes.filter((probe) => probe.readiness === "needs_extended_measurement").length,
    holdCount: probes.filter((probe) => probe.readiness === "hold_for_investigation").length,
    probes
  };
}
