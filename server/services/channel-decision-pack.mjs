import { buildChannelCandidateReport } from "./channel-candidate-report.mjs";

function slimCandidate(candidate, overrides = {}) {
  return {
    name: candidate.name,
    protocol: candidate.protocol,
    qualityClass: candidate.qualityClass ?? "",
    qualityTier: Object.hasOwn(overrides, "qualityTier") ? overrides.qualityTier : candidate.qualityTier,
    channelScore: Object.hasOwn(overrides, "channelScore") ? overrides.channelScore : candidate.channelScore,
    reasonCodes: Array.isArray(candidate.reasonCodes) ? [...candidate.reasonCodes] : []
  };
}

function nextAction({ selectedBaseline, canaryCandidates, holdBlockers }) {
  if (!selectedBaseline) {
    return "select_baseline_before_canary";
  }
  if (canaryCandidates.length > 0) {
    return "request_risk_a_canary_approval";
  }
  if (holdBlockers.length > 0) {
    return "collect_measurements_or_fix_blockers";
  }
  return "continue_baseline_and_observe";
}

export function buildChannelDecisionPack({
  dryRunSummary,
  measurementScore,
  generatedAt = new Date().toISOString()
}) {
  const report = buildChannelCandidateReport({
    dryRunSummary,
    measurementScore,
    generatedAt
  });

  const selectedBaseline = report.groups.stable[0] ? slimCandidate(report.groups.stable[0]) : null;
  const canaryCandidates = report.groups.canary.map((candidate) => slimCandidate(candidate));
  const privateCandidates = report.groups.private.map((candidate) => slimCandidate(candidate));
  const holdBlockers = [
    ...report.groups.hold.map((candidate) => slimCandidate(candidate)),
    ...report.groups.missingMeasurement.map((candidate) => slimCandidate(candidate, {
      qualityTier: "unmeasured",
      channelScore: null
    }))
  ];
  const requiredNextAction = nextAction({
    selectedBaseline,
    canaryCandidates,
    holdBlockers
  });

  return {
    ok: true,
    mode: "channel-decision-pack",
    generatedAt,
    sourceGeneratedAt: report.sourceGeneratedAt,
    selectedBaseline,
    canaryCandidates,
    privateCandidates,
    holdBlockers,
    requiredNextAction,
    decisionEvidence: {
      advisoryOnly: true,
      noProductionMutation: true,
      requiresRiskAForRuntime: true,
      omittedFields: ["hosts", "ports", "credentials", "rawErrors", "tokens", "subscriptionUrls"]
    },
    candidateReport: {
      mode: report.mode,
      serverCount: report.serverCount,
      measuredCount: report.measuredCount,
      missingMeasurementCount: report.missingMeasurementCount
    }
  };
}
