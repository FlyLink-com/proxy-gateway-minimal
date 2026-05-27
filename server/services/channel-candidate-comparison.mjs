function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function safeInteger(value, fieldName) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`channel candidate comparison ${fieldName} must be a non-negative number`);
  }
  return Math.trunc(number);
}

function assertInvestigationReport(report) {
  if (!isObject(report) || report.mode !== "channel-measurement-investigation-report" || !Array.isArray(report.probes)) {
    throw new Error("channel candidate comparison requires a channel measurement investigation report");
  }
}

function assertDryRunSummary(summary) {
  if (!isObject(summary) || summary.ok !== true || !Array.isArray(summary.servers)) {
    throw new Error("channel candidate comparison requires a channel config dry-run summary");
  }
}

function reasonCodes(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function heldProtocols(report) {
  return reasonCodes(
    report.probes
      .filter((probe) => text(probe.readiness) === "hold_for_investigation")
      .map((probe) => text(probe.protocol))
  );
}

function issuePatterns(report) {
  return reasonCodes(report.probes.map((probe) => text(probe.issuePattern)));
}

function holdReasonCodes(report) {
  if (Array.isArray(report.summary?.holdReasonCodes)) {
    return reasonCodes(report.summary.holdReasonCodes);
  }
  return reasonCodes(report.probes.flatMap((probe) => (Array.isArray(probe.reasonCodes) ? probe.reasonCodes : [])));
}

function safeServer(server) {
  return {
    name: text(server.name),
    protocol: text(server.protocol),
    qualityClass: text(server.qualityClass)
  };
}

const PROTOCOL_PRIORITY = {
  tuic: 0,
  vless: 1,
  hysteria2: 2,
  ss: 3
};

function protocolPriority(protocol) {
  return Object.hasOwn(PROTOCOL_PRIORITY, protocol) ? PROTOCOL_PRIORITY[protocol] : 10;
}

function isPrivateCandidate(server) {
  return ["private", "operator", "operator-private"].includes(text(server.qualityClass).toLowerCase());
}

function comparisonReasonCodes(report, server) {
  const reasons = ["different_protocol_family", "needs_measurement"];
  if (issuePatterns(report).some((pattern) => pattern.includes("latency") || pattern.includes("spike"))) {
    reasons.push("compare_against_latency_hold");
  }
  if (text(server.protocol) === "vless") {
    reasons.push("xudp_candidate_family");
  }
  return reasonCodes(reasons);
}

function comparisonPriority(index) {
  return index === 0 ? "primary" : "secondary";
}

function sortComparisonServers(left, right) {
  return protocolPriority(left.protocol) - protocolPriority(right.protocol) || left.name.localeCompare(right.name);
}

function requiredNextAction(comparisonCandidates) {
  return comparisonCandidates.length > 0
    ? "prepare_risk_a_comparison_canary_for_primary_candidate"
    : "add_or_select_comparison_candidate";
}

export function buildChannelCandidateComparisonPlan({
  investigationReport,
  dryRunSummary,
  generatedAt = new Date().toISOString()
}) {
  assertInvestigationReport(investigationReport);
  assertDryRunSummary(dryRunSummary);

  const held = new Set(heldProtocols(investigationReport));
  const baselineCandidates = [];
  const heldCandidates = [];
  const privateCandidates = [];
  const comparisonServers = [];

  for (const rawServer of dryRunSummary.servers) {
    const server = safeServer(rawServer);
    if (server.protocol === "ss") {
      baselineCandidates.push({
        ...server,
        role: "baseline_reference",
        reasonCodes: ["baseline_reference_only"]
      });
      continue;
    }

    if (held.has(server.protocol)) {
      heldCandidates.push({
        ...server,
        reasonCodes: ["matches_held_protocol", "do_not_roll_out"]
      });
      continue;
    }

    if (isPrivateCandidate(server)) {
      privateCandidates.push({
        ...server,
        reasonCodes: ["private_capacity_not_default_comparison"]
      });
      continue;
    }

    comparisonServers.push(server);
  }

  comparisonServers.sort(sortComparisonServers);
  const comparisonCandidates = comparisonServers.map((server, index) => ({
    ...server,
    comparisonPriority: comparisonPriority(index),
    reasonCodes: comparisonReasonCodes(investigationReport, server)
  }));

  return {
    ok: true,
    mode: "channel-candidate-comparison-plan",
    generatedAt,
    sourceGeneratedAt: investigationReport.generatedAt,
    currentStatus: {
      overallStatus: text(investigationReport.overallStatus),
      rolloutRecommendation: text(investigationReport.decision?.rolloutRecommendation),
      totalSampleCount: safeInteger(investigationReport.totalSampleCount, "totalSampleCount"),
      heldProtocols: [...held],
      issuePatterns: issuePatterns(investigationReport),
      holdReasonCodes: holdReasonCodes(investigationReport)
    },
    baselineCandidates,
    comparisonCandidates,
    heldCandidates,
    privateCandidates,
    requiredNextAction: requiredNextAction(comparisonCandidates),
    advisoryEvidence: {
      advisoryOnly: true,
      noProductionMutation: true,
      requiresRiskAForRuntime: true,
      omittedFields: ["hosts", "ports", "credentials", "rawErrors", "tokens", "subscriptionUrls"]
    }
  };
}
