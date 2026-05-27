function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value) {
  return String(value ?? "").trim();
}

function safeInteger(value, fieldName) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`channel measurement investigation ${fieldName} must be a non-negative number`);
  }
  return Math.trunc(number);
}

function assertBundleReport(bundleReport) {
  if (
    !isObject(bundleReport) ||
    bundleReport.mode !== "channel-measurement-bundle-report" ||
    !isObject(bundleReport.extendedReport) ||
    bundleReport.extendedReport.mode !== "channel-extended-measurement-report" ||
    !Array.isArray(bundleReport.extendedReport.probes)
  ) {
    throw new Error("channel measurement investigation requires a channel measurement bundle report");
  }
}

function uniqueSorted(values) {
  return [...new Set(values.map(safeText).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function reasonCodesFor(probes) {
  return uniqueSorted(probes.flatMap((probe) => (Array.isArray(probe.reasonCodes) ? probe.reasonCodes : [])));
}

function issuePattern(probe) {
  const reasons = new Set(Array.isArray(probe.reasonCodes) ? probe.reasonCodes : []);
  const windowCount = safeInteger(probe.windowCount, "windowCount");
  const holdWindowCount = safeInteger(probe.holdWindowCount, "holdWindowCount");
  const readyWindowCount = safeInteger(probe.readyWindowCount, "readyWindowCount");

  if (reasons.has("low_success_rate") || reasons.has("timeout_rate_exceeded")) {
    return "reliability_failure";
  }
  if (reasons.has("high_p95_latency") && holdWindowCount >= Math.max(1, Math.ceil(windowCount / 2))) {
    return "sustained_tail_latency";
  }
  if (reasons.has("high_p99_latency") && readyWindowCount > 0 && holdWindowCount === 1) {
    return "isolated_tail_spike";
  }
  if (reasons.has("high_p95_latency") || reasons.has("high_p99_latency")) {
    return "tail_latency";
  }
  if (reasons.has("insufficient_windows") || reasons.has("insufficient_samples")) {
    return "insufficient_evidence";
  }
  return "ready_evidence";
}

function investigationPriority(pattern, readiness) {
  if (pattern === "reliability_failure" || pattern === "sustained_tail_latency") {
    return "high";
  }
  if (readiness === "hold_for_investigation" || pattern === "isolated_tail_spike" || pattern === "tail_latency") {
    return "medium";
  }
  if (pattern === "insufficient_evidence") {
    return "low";
  }
  return "none";
}

function probeSummary(probe) {
  const readiness = safeText(probe.readiness);
  const pattern = issuePattern(probe);
  const payload = {
    name: safeText(probe.name),
    protocol: safeText(probe.protocol),
    role: safeText(probe.role),
    qualityClass: safeText(probe.qualityClass),
    windowCount: safeInteger(probe.windowCount, "windowCount"),
    readyWindowCount: safeInteger(probe.readyWindowCount, "readyWindowCount"),
    needsExtendedMeasurementWindowCount: safeInteger(
      probe.needsExtendedMeasurementWindowCount,
      "needsExtendedMeasurementWindowCount"
    ),
    holdWindowCount: safeInteger(probe.holdWindowCount, "holdWindowCount"),
    totalSampleCount: safeInteger(probe.totalSampleCount, "totalSampleCount"),
    readiness,
    issuePattern: pattern,
    investigationPriority: investigationPriority(pattern, readiness),
    reasonCodes: reasonCodesFor([probe])
  };

  if (!payload.qualityClass) {
    delete payload.qualityClass;
  }
  return payload;
}

const READINESS_RANK = {
  hold_for_investigation: 0,
  needs_extended_measurement: 1,
  ready_for_decision: 2
};

const PRIORITY_RANK = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3
};

function sortProbeSummaries(a, b) {
  return (
    PRIORITY_RANK[a.investigationPriority] - PRIORITY_RANK[b.investigationPriority] ||
    READINESS_RANK[a.readiness] - READINESS_RANK[b.readiness] ||
    a.name.localeCompare(b.name)
  );
}

function overallStatus(extendedReport) {
  if (safeInteger(extendedReport.holdCount, "holdCount") > 0) {
    return "hold_for_investigation";
  }
  if (safeInteger(extendedReport.needsExtendedMeasurementCount, "needsExtendedMeasurementCount") > 0) {
    return "needs_extended_measurement";
  }
  return "ready_for_operator_decision";
}

function decisionFor(status) {
  if (status === "hold_for_investigation") {
    return {
      rolloutRecommendation: "do_not_roll_out",
      nextAction: "compare_or_investigate_candidate",
      productionImpact: "none",
      requiresRiskAForRuntime: true
    };
  }
  if (status === "needs_extended_measurement") {
    return {
      rolloutRecommendation: "do_not_roll_out",
      nextAction: "collect_more_measurements",
      productionImpact: "none",
      requiresRiskAForRuntime: true
    };
  }
  return {
    rolloutRecommendation: "operator_decision_required",
    nextAction: "prepare_risk_a_canary_gate",
    productionImpact: "none",
    requiresRiskAForRuntime: true
  };
}

export function buildChannelMeasurementInvestigationReport(bundleReport, options = {}) {
  assertBundleReport(bundleReport);
  const extendedReport = bundleReport.extendedReport;
  const probes = extendedReport.probes.map(probeSummary).sort(sortProbeSummaries);
  const status = overallStatus(extendedReport);

  return {
    ok: true,
    mode: "channel-measurement-investigation-report",
    generatedAt: options.generatedAt || new Date().toISOString(),
    sourceGeneratedAt: bundleReport.generatedAt,
    runId: safeText(bundleReport.runId),
    candidateSet: safeText(bundleReport.candidateSet),
    overallStatus: status,
    totalSampleCount: probes.reduce((sum, probe) => sum + probe.totalSampleCount, 0),
    summary: {
      probeCount: safeInteger(extendedReport.probeCount ?? probes.length, "probeCount"),
      readyCount: safeInteger(extendedReport.readyCount, "readyCount"),
      needsExtendedMeasurementCount: safeInteger(
        extendedReport.needsExtendedMeasurementCount,
        "needsExtendedMeasurementCount"
      ),
      holdCount: safeInteger(extendedReport.holdCount, "holdCount"),
      holdReasonCodes: reasonCodesFor(probes.filter((probe) => probe.readiness === "hold_for_investigation"))
    },
    decision: decisionFor(status),
    probes
  };
}
