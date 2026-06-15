const SUPPORTED_FIELDS = new Set([
  "channelRef",
  "nodeRef",
  "source",
  "clientProfile",
  "compatibility",
  "measuredAt",
  "latencyMs",
  "jitterMs",
  "packetLossRatio",
  "successRate",
  "timeoutRate",
  "downloadMbps",
  "uploadMbps",
  "notes"
]);

const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const UNSAFE_TEXT_PATTERN =
  /\b(token|password|passwd|secret|credential|private[-_\s]?key|subscription|subscribe|authorization|bearer)\b|https?:\/\/|[A-Za-z0-9.-]+\.[A-Za-z]{2,}:\d+/i;

const COMPATIBILITY_ORDER = {
  import_failed: 5,
  unsupported: 4,
  not_tested: 3,
  ok: 1,
  imported: 1
};

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, fieldName, { required = true } = {}) {
  const result = String(value ?? "").trim();
  if (!result) {
    if (required) {
      throw new Error(`channel quality observation ${fieldName} is required`);
    }
    return null;
  }
  if (!SAFE_TOKEN_PATTERN.test(result)) {
    throw new Error(`channel quality observation ${fieldName} must be a safe token`);
  }
  return result;
}

function checkedNotes(value) {
  const result = String(value ?? "").trim();
  if (!result) {
    return null;
  }
  if (UNSAFE_TEXT_PATTERN.test(result)) {
    throw new Error("channel quality observation contains unsafe text");
  }
  return result;
}

function checkSupportedFields(observation) {
  for (const fieldName of Object.keys(observation)) {
    if (!SUPPORTED_FIELDS.has(fieldName)) {
      throw new Error("channel quality observation contains unsupported field");
    }
  }
}

function optionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`channel quality observation ${fieldName} must be a non-negative number`);
  }
  return number;
}

function optionalRatio(value, fieldName) {
  const number = optionalNumber(value, fieldName);
  if (number === null) {
    return null;
  }
  if (number > 1) {
    throw new Error(`channel quality observation ${fieldName} must be between 0 and 1`);
  }
  return number;
}

function normalizeCompatibility(value) {
  const result = text(value, "compatibility").toLowerCase();
  if (!Object.hasOwn(COMPATIBILITY_ORDER, result)) {
    throw new Error("channel quality observation compatibility is unsupported");
  }
  return result;
}

function normalizeMeasuredAt(value) {
  const result = String(value ?? "").trim();
  if (!result) {
    throw new Error("channel quality observation measuredAt is required");
  }
  const time = Date.parse(result);
  if (!Number.isFinite(time)) {
    throw new Error("channel quality observation measuredAt must be an ISO timestamp");
  }
  if (UNSAFE_TEXT_PATTERN.test(result)) {
    throw new Error("channel quality observation contains unsafe text");
  }
  return result;
}

export function normalizeChannelQualityObservations(observations) {
  if (!Array.isArray(observations)) {
    throw new Error("channel quality observations must be an array");
  }

  return observations.map((observation) => {
    if (!isObject(observation)) {
      throw new Error("channel quality observation must be an object");
    }

    checkSupportedFields(observation);
    checkedNotes(observation.notes);

    return {
      channelRef: text(observation.channelRef, "channelRef"),
      nodeRef: text(observation.nodeRef, "nodeRef", { required: false }),
      source: text(observation.source, "source"),
      clientProfile: text(observation.clientProfile, "clientProfile"),
      compatibility: normalizeCompatibility(observation.compatibility),
      measuredAt: normalizeMeasuredAt(observation.measuredAt),
      latencyMs: optionalNumber(observation.latencyMs, "latencyMs"),
      jitterMs: optionalNumber(observation.jitterMs, "jitterMs"),
      packetLossRatio: optionalRatio(observation.packetLossRatio, "packetLossRatio"),
      successRate: optionalRatio(observation.successRate, "successRate"),
      timeoutRate: optionalRatio(observation.timeoutRate, "timeoutRate"),
      downloadMbps: optionalNumber(observation.downloadMbps, "downloadMbps"),
      uploadMbps: optionalNumber(observation.uploadMbps, "uploadMbps")
    };
  });
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function max(values) {
  return values.length === 0 ? null : round(Math.max(...values));
}

function min(values) {
  return values.length === 0 ? null : round(Math.min(...values));
}

function round(value) {
  return Number(value.toFixed(4));
}

function compactNumbers(observations, fieldName) {
  return observations
    .map((observation) => observation[fieldName])
    .filter((value) => value !== null && value !== undefined);
}

function worstCompatibility(observations) {
  return observations
    .map((observation) => observation.compatibility)
    .sort((left, right) => COMPATIBILITY_ORDER[right] - COMPATIBILITY_ORDER[left])[0];
}

function classifyChannel({ compatibility, metrics }) {
  const reasonCodes = [];

  if (compatibility === "import_failed" || compatibility === "unsupported") {
    return {
      qualityTier: "client_blocked",
      strategyAdvice: "hold_for_template_or_client_fix",
      reasonCodes: ["client_compatibility_failed"]
    };
  }

  if (compatibility === "not_tested") {
    reasonCodes.push("client_compatibility_not_tested");
  }

  const hasNetworkMeasurement =
    metrics.avgLatencyMs !== null ||
    metrics.maxPacketLossRatio !== null ||
    metrics.minSuccessRate !== null ||
    metrics.maxTimeoutRate !== null;

  if (!hasNetworkMeasurement) {
    reasonCodes.push("network_measurement_missing");
    return {
      qualityTier: "unknown",
      strategyAdvice: "collect_measurement_before_strategy_change",
      reasonCodes
    };
  }

  if (metrics.avgLatencyMs !== null && metrics.avgLatencyMs > 900) {
    reasonCodes.push("latency_high");
  }
  if (metrics.maxJitterMs !== null && metrics.maxJitterMs > 120) {
    reasonCodes.push("jitter_high");
  }
  if (metrics.maxPacketLossRatio !== null && metrics.maxPacketLossRatio >= 0.1) {
    reasonCodes.push("packet_loss_high");
  }
  if (metrics.minSuccessRate !== null && metrics.minSuccessRate < 0.98) {
    reasonCodes.push("success_rate_low");
  }
  if (metrics.maxTimeoutRate !== null && metrics.maxTimeoutRate > 0.01) {
    reasonCodes.push("timeout_rate_high");
  }

  const unstable =
    (metrics.maxPacketLossRatio !== null && metrics.maxPacketLossRatio >= 0.2) ||
    (metrics.minSuccessRate !== null && metrics.minSuccessRate < 0.8) ||
    (metrics.maxTimeoutRate !== null && metrics.maxTimeoutRate >= 0.2);

  if (unstable) {
    return {
      qualityTier: "unstable",
      strategyAdvice: "keep_optional_collect_evidence",
      reasonCodes
    };
  }

  if (reasonCodes.length > 0) {
    return {
      qualityTier: "degraded",
      strategyAdvice: "keep_optional_collect_evidence",
      reasonCodes
    };
  }

  return {
    qualityTier: "healthy",
    strategyAdvice: "auto_candidate",
    reasonCodes: ["network_quality_healthy"]
  };
}

function summarizeChannel(channelRef, observations) {
  const latestMeasuredAt = observations
    .map((observation) => observation.measuredAt)
    .sort()
    .at(-1);
  const compatibility = worstCompatibility(observations);
  const metrics = {
    avgLatencyMs: average(compactNumbers(observations, "latencyMs")),
    maxJitterMs: max(compactNumbers(observations, "jitterMs")),
    maxPacketLossRatio: max(compactNumbers(observations, "packetLossRatio")),
    minSuccessRate: min(compactNumbers(observations, "successRate")),
    maxTimeoutRate: max(compactNumbers(observations, "timeoutRate")),
    maxDownloadMbps: max(compactNumbers(observations, "downloadMbps")),
    maxUploadMbps: max(compactNumbers(observations, "uploadMbps"))
  };
  const classification = classifyChannel({ compatibility, metrics });

  return {
    channelRef,
    nodeRef: observations.find((observation) => observation.nodeRef)?.nodeRef ?? null,
    sampleCount: observations.length,
    latestMeasuredAt,
    clientCompatibility: compatibility,
    qualityTier: classification.qualityTier,
    strategyAdvice: classification.strategyAdvice,
    reasonCodes: classification.reasonCodes,
    metrics
  };
}

function summarizeReport(channels) {
  return {
    autoCandidateCount: channels.filter((channel) => channel.strategyAdvice === "auto_candidate").length,
    keepOptionalCount: channels.filter((channel) => channel.strategyAdvice === "keep_optional_collect_evidence").length,
    clientBlockedCount: channels.filter((channel) => channel.qualityTier === "client_blocked").length,
    unknownCount: channels.filter((channel) => channel.qualityTier === "unknown").length
  };
}

export function buildChannelQualityMeasurementReport(payload, { generatedAt = new Date().toISOString() } = {}) {
  if (!isObject(payload)) {
    throw new Error("channel quality measurement report requires an input object");
  }

  const observations = normalizeChannelQualityObservations(payload.observations);
  const grouped = new Map();
  for (const observation of observations) {
    if (!grouped.has(observation.channelRef)) {
      grouped.set(observation.channelRef, []);
    }
    grouped.get(observation.channelRef).push(observation);
  }

  const channels = [...grouped.entries()].map(([channelRef, channelObservations]) =>
    summarizeChannel(channelRef, channelObservations)
  );

  return {
    ok: true,
    mode: "channel-quality-measurement-report",
    generatedAt,
    channelCount: channels.length,
    observationCount: observations.length,
    summary: summarizeReport(channels),
    channels,
    evidence: {
      advisoryOnly: true,
      noProductionMutation: true,
      noSubscriptionOutputMutation: true,
      omittedFields: ["hosts", "ports", "tokens", "credentials", "subscriptionUrls", "rawLogs", "rawConfigs"]
    }
  };
}
