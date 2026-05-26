function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function assertShape(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function safeServer(server) {
  return {
    name: text(server.name),
    protocol: text(server.protocol),
    qualityClass: text(server.qualityClass)
  };
}

function safeCandidate(candidate) {
  const payload = {
    name: text(candidate.name),
    protocol: text(candidate.protocol),
    qualityClass: text(candidate.qualityClass),
    qualityTier: text(candidate.qualityTier),
    channelScore: Number(candidate.channelScore),
    recommendedPool: text(candidate.recommendedPool),
    reasonCodes: Array.isArray(candidate.reasonCodes) ? candidate.reasonCodes.map(text) : []
  };

  if (!payload.qualityClass) {
    delete payload.qualityClass;
  }
  return payload;
}

function missingMeasurement(server) {
  return {
    ...server,
    reasonCodes: ["missing_measurement"]
  };
}

function compareCandidates(left, right) {
  const leftScore = Number.isFinite(left.channelScore) ? left.channelScore : -1;
  const rightScore = Number.isFinite(right.channelScore) ? right.channelScore : -1;
  if (leftScore !== rightScore) return rightScore - leftScore;
  return left.name.localeCompare(right.name);
}

export function buildChannelCandidateReport({
  dryRunSummary,
  measurementScore,
  generatedAt = new Date().toISOString()
}) {
  assertShape(isObject(dryRunSummary) && dryRunSummary.ok === true && Array.isArray(dryRunSummary.servers), "channel candidate report requires a dry-run summary");
  assertShape(isObject(measurementScore) && measurementScore.mode === "channel-measurement-score" && Array.isArray(measurementScore.candidates), "channel candidate report requires a measurement score");

  const servers = dryRunSummary.servers.map(safeServer);
  const scoredByName = new Map(measurementScore.candidates.map((candidate) => [text(candidate.name), candidate]));
  const groups = {
    stable: [],
    canary: [],
    private: [],
    hold: [],
    missingMeasurement: []
  };

  for (const server of servers) {
    const scored = scoredByName.get(server.name);
    if (!scored) {
      groups.missingMeasurement.push(missingMeasurement(server));
      continue;
    }

    const safe = safeCandidate(scored);
    if (safe.recommendedPool === "stable") {
      groups.stable.push(safe);
    } else if (safe.recommendedPool === "canary") {
      groups.canary.push(safe);
    } else if (safe.recommendedPool === "private") {
      groups.private.push(safe);
    } else {
      groups.hold.push(safe);
    }
  }

  for (const group of Object.values(groups)) {
    group.sort(compareCandidates);
  }

  return {
    ok: true,
    mode: "channel-candidate-report",
    generatedAt,
    sourceGeneratedAt: measurementScore.generatedAt,
    serverCount: servers.length,
    measuredCount: servers.length - groups.missingMeasurement.length,
    missingMeasurementCount: groups.missingMeasurement.length,
    groups
  };
}
