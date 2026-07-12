import { safeUsageCollectorFailure } from "./usage-collector-failure.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function collectorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw collectorError("validation_error", `${field} is required`);
  }
  return normalized;
}

function safeRef(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw collectorError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw collectorError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function nonNegativeInteger(value, field) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw collectorError("validation_error", `${field} must be an integer >= 0`);
  }
  return normalized;
}

function defaultNow() {
  return new Date();
}

function isoNow(nowFn) {
  const value = typeof nowFn === "function" ? nowFn() : defaultNow();
  return isoText(value instanceof Date ? value.toISOString() : value, "now");
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function blocker(code, target) {
  return { code, target };
}

function validationFailure({ sourceRef, channelRef, error }) {
  return {
    ok: false,
    status: "validation_error",
    sourceRef,
    channelRef,
    accountingMode: "delta",
    observations: [],
    blockers: [blocker(error.code || "validation_error", "trafficStats")],
    nextAction: "fix_hysteria2_traffic_stats_mapping",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  };
}

function readStatsMap(payload) {
  if (!isPlainObject(payload)) {
    throw collectorError("validation_error", "traffic stats payload must be an object");
  }
  if (isPlainObject(payload.traffic)) return payload.traffic;
  if (isPlainObject(payload.stats)) return payload.stats;
  return payload;
}

function normalizeStatEntry(clientId, entry, snapshot) {
  if (!isPlainObject(entry)) {
    throw collectorError("validation_error", "traffic stats entry must be an object");
  }
  return {
    accountingMode: "delta",
    sourceRef: snapshot.sourceRef,
    channelRef: snapshot.channelRef,
    edgeCredentialRef: safeRef(clientId, "edgeCredentialRef"),
    observedAt: snapshot.observedAt,
    intervalStartedAt: snapshot.intervalStartedAt,
    intervalEndedAt: snapshot.intervalEndedAt,
    uploadBytes: nonNegativeInteger(entry.tx ?? entry.uploadBytes ?? entry.upload ?? 0, "uploadBytes"),
    downloadBytes: nonNegativeInteger(entry.rx ?? entry.downloadBytes ?? entry.download ?? 0, "downloadBytes")
  };
}

export function createHysteria2UsageCollector({
  channelRef,
  trafficReader,
  nowFn = defaultNow
} = {}) {
  const safeChannelRef = safeRef(channelRef, "channelRef");
  if (typeof trafficReader !== "function") {
    throw collectorError("validation_error", "trafficReader is required");
  }

  async function collect({ since } = {}) {
    const observedAt = isoNow(nowFn);
    const intervalStartedAt = isoText(since || observedAt, "intervalStartedAt");
    const snapshot = {
      sourceRef: "hysteria2_traffic_stats",
      channelRef: safeChannelRef,
      observedAt,
      intervalStartedAt,
      intervalEndedAt: observedAt
    };

    let source;
    try {
      source = await trafficReader({
        channelRef: safeChannelRef,
        clear: true
      });
    } catch (error) {
      const failure = safeUsageCollectorFailure({
        error,
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        target: "trafficReader",
        nextAction: "review_hysteria2_usage_source_failure",
        accountingMode: "delta"
      });
      if (failure) return failure;
      throw error;
    }

    let statsMap;
    try {
      statsMap = readStatsMap(source);
    } catch (error) {
      return validationFailure({
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        error
      });
    }

    try {
      const observations = Object.entries(statsMap)
        .map(([clientId, entry]) => normalizeStatEntry(clientId, entry, snapshot))
        .filter((observation) => observation.uploadBytes + observation.downloadBytes > 0);
      return {
        ok: true,
        status: "collected",
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        accountingMode: "delta",
        observations,
        blockers: [],
        nextAction: "record_usage_observations_with_control_plane_accounting",
        safety: {
          noRawRuntimePayload: true,
          noSecretMaterialReturned: true
        }
      };
    } catch (error) {
      return validationFailure({
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        error
      });
    }
  }

  return { collect };
}
