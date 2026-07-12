import { normalizeUnresolvedReasonCounts } from "./unresolved-binding-provenance.mjs";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const TRAFFIC_COLLECTOR_HEALTH = Object.freeze({
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  FAILED: "failed"
});

export const TRAFFIC_COLLECTOR_CONDITION = Object.freeze({
  OK: "ok",
  IDLE_NO_USER_TRAFFIC: "idle_no_user_traffic",
  MISSING_STATS: "missing_stats",
  RUNTIME_DOWN: "runtime_down",
  CONFIG_ERROR: "config_error",
  AUTH_ERROR: "auth_error",
  MAPPING_UNRESOLVED: "mapping_unresolved",
  SIDECAR_IDLE: "sidecar_idle"
});

const HEALTH_VALUES = new Set(Object.values(TRAFFIC_COLLECTOR_HEALTH));
const CONDITION_VALUES = new Set(Object.values(TRAFFIC_COLLECTOR_CONDITION));
const HEALTH_BY_CONDITION = Object.freeze({
  [TRAFFIC_COLLECTOR_CONDITION.OK]: TRAFFIC_COLLECTOR_HEALTH.HEALTHY,
  [TRAFFIC_COLLECTOR_CONDITION.IDLE_NO_USER_TRAFFIC]: TRAFFIC_COLLECTOR_HEALTH.HEALTHY,
  [TRAFFIC_COLLECTOR_CONDITION.MISSING_STATS]: TRAFFIC_COLLECTOR_HEALTH.DEGRADED,
  [TRAFFIC_COLLECTOR_CONDITION.MAPPING_UNRESOLVED]: TRAFFIC_COLLECTOR_HEALTH.DEGRADED,
  [TRAFFIC_COLLECTOR_CONDITION.SIDECAR_IDLE]: TRAFFIC_COLLECTOR_HEALTH.DEGRADED,
  [TRAFFIC_COLLECTOR_CONDITION.RUNTIME_DOWN]: TRAFFIC_COLLECTOR_HEALTH.FAILED,
  [TRAFFIC_COLLECTOR_CONDITION.CONFIG_ERROR]: TRAFFIC_COLLECTOR_HEALTH.FAILED,
  [TRAFFIC_COLLECTOR_CONDITION.AUTH_ERROR]: TRAFFIC_COLLECTOR_HEALTH.FAILED
});

function text(value) {
  return String(value ?? "").trim();
}

function safeRef(value) {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : "";
}

function nonNegativeInteger(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : 0;
}

function isoOrNull(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const timestamp = new Date(normalized);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

function blockerCodes(value) {
  return Array.isArray(value)
    ? value.map((entry) => text(entry?.code || entry).toLowerCase()).filter(Boolean)
    : [];
}

function recordedStatuses(value) {
  return Array.isArray(value)
    ? value.map((entry) => text(entry?.status).toLowerCase()).filter(Boolean)
    : [];
}

function includesSignal(signals, fragments) {
  return signals.some((signal) => fragments.some((fragment) => signal.includes(fragment)));
}

function latestCollectorSuccessAt({ collectorOk, lastCollectorSuccessAt, observations }) {
  if (!collectorOk) return null;
  const candidates = [
    isoOrNull(lastCollectorSuccessAt),
    ...(Array.isArray(observations)
      ? observations.map((entry) => isoOrNull(entry?.observedAt))
      : [])
  ].filter(Boolean);
  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function classifyCollectorState({
  collectorOk,
  collectorStatus,
  idle,
  stateWarmup,
  blockers,
  recorded,
  unresolvedCount
}) {
  const status = text(collectorStatus).toLowerCase();
  const signals = [status, ...blockerCodes(blockers), ...recordedStatuses(recorded)];

  if (includesSignal(signals, ["unauthorized", "forbidden", "auth_error", "authentication_failed"])) {
    return [TRAFFIC_COLLECTOR_HEALTH.FAILED, TRAFFIC_COLLECTOR_CONDITION.AUTH_ERROR];
  }
  if (status === "validation_error" || includesSignal(signals, ["config_error", "configuration_error"])) {
    return [TRAFFIC_COLLECTOR_HEALTH.FAILED, TRAFFIC_COLLECTOR_CONDITION.CONFIG_ERROR];
  }
  if (
    nonNegativeInteger(unresolvedCount) > 0
    || includesSignal(signals, ["unresolved_binding", "mapping_unresolved", "credential_binding_missing"])
  ) {
    return [TRAFFIC_COLLECTOR_HEALTH.DEGRADED, TRAFFIC_COLLECTOR_CONDITION.MAPPING_UNRESOLVED];
  }
  if (
    status === "collector_not_supported"
    || includesSignal(signals, ["missing_stats", "aggregate_only", "usage_entries_required"])
  ) {
    return [TRAFFIC_COLLECTOR_HEALTH.DEGRADED, TRAFFIC_COLLECTOR_CONDITION.MISSING_STATS];
  }
  if (status === "sidecar_idle" || stateWarmup === true) {
    return [TRAFFIC_COLLECTOR_HEALTH.DEGRADED, TRAFFIC_COLLECTOR_CONDITION.SIDECAR_IDLE];
  }
  if (idle === true || status === "idle_no_user_traffic") {
    return [TRAFFIC_COLLECTOR_HEALTH.HEALTHY, TRAFFIC_COLLECTOR_CONDITION.IDLE_NO_USER_TRAFFIC];
  }
  if (collectorOk === true) {
    return [TRAFFIC_COLLECTOR_HEALTH.HEALTHY, TRAFFIC_COLLECTOR_CONDITION.OK];
  }
  return [TRAFFIC_COLLECTOR_HEALTH.FAILED, TRAFFIC_COLLECTOR_CONDITION.RUNTIME_DOWN];
}

function stateRecord({
  health,
  condition,
  sourceRef,
  channelRef,
  lastCollectorSuccessAt,
  observationCount,
  unresolvedCount,
  unresolvedReasonCounts
}) {
  const safeUnresolvedCount = nonNegativeInteger(unresolvedCount);
  return {
    type: "traffic_collector_state",
    health,
    condition,
    sourceRef: safeRef(sourceRef),
    channelRef: safeRef(channelRef),
    lastCollectorSuccessAt: isoOrNull(lastCollectorSuccessAt),
    observationCount: nonNegativeInteger(observationCount),
    unresolvedCount: safeUnresolvedCount,
    ...(safeUnresolvedCount > 0
      ? { unresolvedReasonCounts: normalizeUnresolvedReasonCounts(unresolvedReasonCounts, safeUnresolvedCount) }
      : {}),
    errorType: health === TRAFFIC_COLLECTOR_HEALTH.HEALTHY ? null : condition,
    safety: {
      redacted: true
    }
  };
}

export function projectTrafficCollectorState({
  collectorOk = false,
  collectorStatus,
  sourceRef,
  channelRef,
  lastCollectorSuccessAt,
  observations = [],
  observationCount,
  unresolvedCount = 0,
  unresolvedReasonCounts,
  blockers = [],
  recorded = [],
  idle = false,
  stateWarmup = false
} = {}) {
  const [health, condition] = classifyCollectorState({
    collectorOk,
    collectorStatus,
    idle,
    stateWarmup,
    blockers,
    recorded,
    unresolvedCount
  });
  const safeObservations = Array.isArray(observations) ? observations : [];
  return stateRecord({
    health,
    condition,
    sourceRef: sourceRef || safeObservations[0]?.sourceRef,
    channelRef,
    lastCollectorSuccessAt: latestCollectorSuccessAt({
      collectorOk,
      lastCollectorSuccessAt,
      observations: safeObservations
    }),
    observationCount: observationCount ?? safeObservations.length,
    unresolvedCount,
    unresolvedReasonCounts
  });
}

export function sanitizeTrafficCollectorState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const health = text(value.health);
  const condition = text(value.condition);
  if (
    !HEALTH_VALUES.has(health)
    || !CONDITION_VALUES.has(condition)
    || HEALTH_BY_CONDITION[condition] !== health
  ) return null;
  return stateRecord({
    health,
    condition,
    sourceRef: value.sourceRef,
    channelRef: value.channelRef,
    lastCollectorSuccessAt: value.lastCollectorSuccessAt,
    observationCount: value.observationCount,
    unresolvedCount: value.unresolvedCount,
    unresolvedReasonCounts: value.unresolvedReasonCounts
  });
}
