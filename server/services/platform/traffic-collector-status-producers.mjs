const AVAILABLE = "available";
const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const PRODUCER_UNAVAILABLE_STATES = new Set([
  "not_observed",
  "invalid_observation"
]);
const PRODUCER_REFS = new Set([
  "japan_tuic_usage_credential_map",
  "sgp_tuic_connection_delta_sidecar"
]);
const PRODUCER_HEALTH_CONDITIONS = new Set([
  "healthy:ok",
  "degraded:mapping_unresolved",
  "degraded:missing_stats",
  "degraded:sidecar_idle",
  "failed:runtime_down",
  "failed:config_error",
  "failed:auth_error"
]);
const SAFE_REASON_CODES = new Set([
  "controller_error",
  "controller_forbidden",
  "controller_unauthorized",
  "credential_binding_missing",
  "mapping_unresolved",
  "runtime_fetch_failed",
  "unresolved_binding",
  "validation_error"
]);

export const TRAFFIC_COLLECTOR_PRODUCER_REFS = Object.freeze([...PRODUCER_REFS]);

function producerError(message) {
  const error = new Error(message);
  error.code = "validation_error";
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeRef(value) {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : "";
}

function nonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function positiveIntegerOrNull(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function isoOrNull(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const timestamp = new Date(normalized);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function requiredIso(value, field) {
  const timestamp = isoOrNull(value);
  if (!timestamp) throw producerError(`${field} must be a valid ISO timestamp`);
  return timestamp;
}

function producerSafety(extra = {}) {
  return {
    redacted: true,
    summaryOnly: true,
    protectedMaterialReturned: false,
    ...extra
  };
}

function reasonCodes(value) {
  const codes = Array.isArray(value)
    ? value.map((entry) => text(entry?.code || entry).toLowerCase())
    : [];
  return [...new Set(codes.filter((code) => SAFE_REASON_CODES.has(code)))].sort();
}

function producerBase(value) {
  if (!isRecord(value)) return null;
  if (
    text(value.type) !== "traffic_collector_status_producer"
    || text(value.schemaVersion) !== "1"
    || value.availability !== AVAILABLE
  ) return null;
  const producerRef = text(value.producerRef);
  const observedAt = isoOrNull(value.observedAt);
  const producerHealth = text(value.producerHealth);
  const producerCondition = text(value.producerCondition);
  if (
    !PRODUCER_REFS.has(producerRef)
    || !observedAt
    || !PRODUCER_HEALTH_CONDITIONS.has(`${producerHealth}:${producerCondition}`)
  ) return null;
  return {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef,
    availability: AVAILABLE,
    observedAt,
    channelRef: safeRef(value.channelRef),
    producerHealth,
    producerCondition,
    lastSuccessAt: isoOrNull(value.lastSuccessAt)
  };
}

function mapProducerProjection(value, base) {
  if (!isRecord(value.map)) return null;
  const status = text(value.map.status);
  const expected = {
    in_sync: "healthy:ok",
    drifted: "degraded:mapping_unresolved",
    missing_material: "failed:config_error",
    verification_failed: "failed:config_error"
  }[status];
  if (!expected || expected !== `${base.producerHealth}:${base.producerCondition}`) return null;
  const map = {
    status,
    currentMapCount: nonNegativeInteger(value.map.currentMapCount),
    expectedMapCount: nonNegativeInteger(value.map.expectedMapCount),
    addCount: nonNegativeInteger(value.map.addCount),
    removeCount: nonNegativeInteger(value.map.removeCount),
    changedCount: nonNegativeInteger(value.map.changedCount),
    missingMaterialCount: nonNegativeInteger(value.map.missingMaterialCount)
  };
  const hasDrift = map.addCount + map.removeCount + map.changedCount > 0;
  if (
    (status === "in_sync" && map.missingMaterialCount > 0)
    || (status === "drifted" && (map.missingMaterialCount > 0 || !hasDrift))
    || (status === "missing_material" && map.missingMaterialCount === 0)
  ) return null;
  return {
    ...base,
    map,
    safety: producerSafety()
  };
}

function sidecarEvidenceCondition({
  safeReasonCodes = [],
  lastRunResult,
  timerActive,
  timerEnabled,
  stateFileConfigured,
  stateFileProtected,
  observationCount,
  unresolvedCount
} = {}) {
  if (safeReasonCodes.some((code) => code.includes("unauthorized") || code.includes("forbidden"))) {
    return ["failed", "auth_error"];
  }
  if (
    safeReasonCodes.includes("validation_error")
    || (
      lastRunResult === "success"
      && (stateFileConfigured === false || stateFileProtected === false)
    )
  ) {
    return ["failed", "config_error"];
  }
  if (
    nonNegativeInteger(unresolvedCount) > 0
    || safeReasonCodes.some((code) => code.includes("unresolved") || code.includes("binding_missing"))
  ) {
    return ["degraded", "mapping_unresolved"];
  }
  if (timerActive === false || timerEnabled === false) {
    return ["failed", "runtime_down"];
  }
  if (
    typeof timerActive !== "boolean"
    || typeof timerEnabled !== "boolean"
    || lastRunResult === "unknown"
    || (lastRunResult === "success" && stateFileProtected === null)
  ) {
    return ["degraded", "missing_stats"];
  }
  if (lastRunResult === "success" && nonNegativeInteger(observationCount) === 0) {
    return ["degraded", "sidecar_idle"];
  }
  if (lastRunResult === "success") return ["healthy", "ok"];
  return ["failed", "runtime_down"];
}

function sidecarProducerProjection(value, base) {
  if (!isRecord(value.sidecar) || !isRecord(value.polling)) return null;
  if (text(value.polling.model) !== "connection_delta") return null;
  const lastRunResult = text(value.sidecar.lastRunResult);
  if (!new Set(["success", "failed", "unknown"]).has(lastRunResult)) return null;
  const sidecar = {
    timerActive: booleanOrNull(value.sidecar.timerActive),
    timerEnabled: booleanOrNull(value.sidecar.timerEnabled),
    lastRunResult,
    recordUsage: value.sidecar.recordUsage === true,
    stateFileConfigured: value.sidecar.stateFileConfigured === true,
    stateFileProtected: booleanOrNull(value.sidecar.stateFileProtected),
    observationCount: nonNegativeInteger(value.sidecar.observationCount),
    recordedCount: nonNegativeInteger(value.sidecar.recordedCount),
    insertedCount: nonNegativeInteger(value.sidecar.insertedCount),
    unresolvedCount: nonNegativeInteger(value.sidecar.unresolvedCount)
  };
  const safeReasonCodes = reasonCodes(value.reasonCodes);
  const expected = sidecarEvidenceCondition({ ...sidecar, safeReasonCodes });
  if (expected.join(":") !== `${base.producerHealth}:${base.producerCondition}`) return null;
  return {
    ...base,
    sidecar,
    polling: {
      model: "connection_delta",
      intervalSeconds: positiveIntegerOrNull(value.polling.intervalSeconds),
      mayUndercountShortConnections: value.polling.mayUndercountShortConnections === true
    },
    reasonCodes: safeReasonCodes,
    safety: producerSafety({ rawControllerPayloadReturned: false })
  };
}

export function createUnavailableTrafficCollectorProducerStatus(
  producerRef,
  availability = "invalid_observation"
) {
  const safeProducerRef = PRODUCER_REFS.has(text(producerRef)) ? text(producerRef) : "";
  if (!safeProducerRef) return null;
  return {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: safeProducerRef,
    availability: PRODUCER_UNAVAILABLE_STATES.has(availability)
      ? availability
      : "invalid_observation",
    observedAt: null,
    channelRef: "",
    producerHealth: null,
    producerCondition: null,
    lastSuccessAt: null,
    safety: producerSafety()
  };
}

export function sanitizeTrafficCollectorProducerStatus(value) {
  if (
    isRecord(value)
    && text(value.type) === "traffic_collector_status_producer"
    && text(value.schemaVersion) === "1"
    && PRODUCER_REFS.has(text(value.producerRef))
    && PRODUCER_UNAVAILABLE_STATES.has(value.availability)
  ) {
    return createUnavailableTrafficCollectorProducerStatus(value.producerRef, value.availability);
  }
  const base = producerBase(value);
  if (!base) return null;
  if (base.producerRef === "japan_tuic_usage_credential_map") {
    return mapProducerProjection(value, base);
  }
  if (base.producerRef === "sgp_tuic_connection_delta_sidecar") {
    return sidecarProducerProjection(value, base);
  }
  return null;
}

export function buildMihomoTuicUsageCredentialMapProducerStatus({
  report,
  observedAt,
  channelRef = "channel-vultr-a-tuic"
} = {}) {
  if (text(report?.type) !== "mihomo_tuic_usage_credential_map_rebuild") {
    throw producerError("usage credential map report is required");
  }
  const safeObservedAt = requiredIso(observedAt, "observedAt");
  const addCount = nonNegativeInteger(report.addCount);
  const removeCount = nonNegativeInteger(report.removeCount);
  const changedCount = nonNegativeInteger(report.changedCount);
  const missingMaterialCount = nonNegativeInteger(report.missingMaterial);
  const verificationFailed = report.verificationFailed === true;
  const inSync = !verificationFailed && missingMaterialCount === 0
    && (report.applied === true || (addCount === 0 && removeCount === 0 && changedCount === 0));
  const missingMaterial = missingMaterialCount > 0;

  return {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "japan_tuic_usage_credential_map",
    availability: AVAILABLE,
    observedAt: safeObservedAt,
    channelRef: safeRef(channelRef),
    producerHealth: inSync ? "healthy" : verificationFailed || missingMaterial ? "failed" : "degraded",
    producerCondition: inSync ? "ok" : verificationFailed || missingMaterial ? "config_error" : "mapping_unresolved",
    lastSuccessAt: inSync ? safeObservedAt : null,
    map: {
      status: inSync
        ? "in_sync"
        : verificationFailed
          ? "verification_failed"
          : missingMaterial
            ? "missing_material"
            : "drifted",
      currentMapCount: nonNegativeInteger(report.currentMapCount),
      expectedMapCount: nonNegativeInteger(report.rebuiltMapCount),
      addCount,
      removeCount,
      changedCount,
      missingMaterialCount
    },
    safety: producerSafety()
  };
}

function sidecarProducerCondition({ summary, timer, stateFile }) {
  return sidecarEvidenceCondition({
    safeReasonCodes: reasonCodes(summary?.blockers),
    lastRunResult: summary?.ok === true ? "success" : "failed",
    timerActive: booleanOrNull(timer?.active),
    timerEnabled: booleanOrNull(timer?.enabled),
    stateFileConfigured: stateFile?.configured === true,
    stateFileProtected: booleanOrNull(stateFile?.protected),
    observationCount: nonNegativeInteger(summary?.observationCount),
    unresolvedCount: nonNegativeInteger(summary?.unresolvedCount)
  });
}

export function buildMihomoConnectionDeltaSidecarProducerStatus({
  summary,
  observedAt,
  timer = {},
  stateFile = {},
  pollIntervalSeconds
} = {}) {
  if (text(summary?.type) !== "mihomo_connection_delta_usage_sidecar") {
    throw producerError("connection delta sidecar summary is required");
  }
  const safeObservedAt = requiredIso(observedAt, "observedAt");
  const [producerHealth, producerCondition] = sidecarProducerCondition({ summary, timer, stateFile });

  return {
    type: "traffic_collector_status_producer",
    schemaVersion: "1",
    producerRef: "sgp_tuic_connection_delta_sidecar",
    availability: AVAILABLE,
    observedAt: safeObservedAt,
    channelRef: safeRef(summary.channelRef),
    producerHealth,
    producerCondition,
    lastSuccessAt: summary.ok === true ? safeObservedAt : null,
    sidecar: {
      timerActive: booleanOrNull(timer.active),
      timerEnabled: booleanOrNull(timer.enabled),
      lastRunResult: summary.ok === true ? "success" : "failed",
      recordUsage: summary.recordUsage === true,
      stateFileConfigured: stateFile.configured === true,
      stateFileProtected: booleanOrNull(stateFile.protected),
      observationCount: nonNegativeInteger(summary.observationCount),
      recordedCount: nonNegativeInteger(summary.recordedCount),
      insertedCount: nonNegativeInteger(summary.insertedCount),
      unresolvedCount: nonNegativeInteger(summary.unresolvedCount)
    },
    polling: {
      model: "connection_delta",
      intervalSeconds: positiveIntegerOrNull(pollIntervalSeconds),
      mayUndercountShortConnections: true
    },
    reasonCodes: reasonCodes(summary.blockers),
    safety: producerSafety({ rawControllerPayloadReturned: false })
  };
}
