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

function unsupported({ sourceRef, channelRef, blockers }) {
  return {
    ok: false,
    status: "collector_not_supported",
    sourceRef,
    channelRef,
    observations: [],
    blockers,
    nextAction: "prove_runtime_can_emit_edge_credential_usage_before_quota_enforcement",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  };
}

function validationFailure({ sourceRef, channelRef, error }) {
  return {
    ok: false,
    status: "validation_error",
    sourceRef,
    channelRef,
    observations: [],
    blockers: [blocker(error.code || "validation_error", "usageSnapshot")],
    nextAction: "fix_usage_collector_snapshot_contract",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  };
}

function readEntries(snapshot) {
  if (Array.isArray(snapshot.entries)) return snapshot.entries;
  if (Array.isArray(snapshot.users)) return snapshot.users;
  if (Array.isArray(snapshot.observations)) return snapshot.observations;
  return [];
}

function normalizeSnapshot(snapshot, { channelRef, since, nowFn }) {
  if (!isPlainObject(snapshot)) {
    throw collectorError("validation_error", "usage snapshot must be an object");
  }
  const sourceRef = safeRef(snapshot.sourceRef || "mihomo_usage_snapshot", "sourceRef");
  const accountingMode = text(snapshot.accountingMode) || "snapshot";
  const observedAt = isoText(snapshot.observedAt || isoNow(nowFn), "observedAt");
  const intervalStartedAt = isoText(snapshot.intervalStartedAt || since || observedAt, "intervalStartedAt");
  const intervalEndedAt = isoText(snapshot.intervalEndedAt || observedAt, "intervalEndedAt");
  const entries = readEntries(snapshot);

  return {
    sourceRef,
    accountingMode,
    stateWarmup: snapshot.stateWarmup === true,
    observedAt,
    intervalStartedAt,
    intervalEndedAt,
    entries,
    aggregateOnly: entries.length === 0 && Boolean(snapshot.aggregate)
  };
}

function normalizeEntry(entry, index, snapshot) {
  if (!isPlainObject(entry)) {
    throw collectorError("validation_error", `entries[${index}] must be an object`);
  }
  return {
    sourceRef: snapshot.sourceRef,
    channelRef: snapshot.channelRef,
    edgeCredentialRef: safeRef(entry.edgeCredentialRef || entry.credentialRef, `entries[${index}].edgeCredentialRef`),
    observedAt: snapshot.observedAt,
    intervalStartedAt: snapshot.intervalStartedAt,
    intervalEndedAt: snapshot.intervalEndedAt,
    uploadBytes: nonNegativeInteger(entry.uploadBytes ?? entry.upload ?? 0, `entries[${index}].uploadBytes`),
    downloadBytes: nonNegativeInteger(entry.downloadBytes ?? entry.download ?? 0, `entries[${index}].downloadBytes`)
  };
}

export function createMihomoTuicUsageCollector({
  channelRef,
  sourceRef = "mihomo_usage_snapshot",
  snapshotReader,
  nowFn = defaultNow
} = {}) {
  const safeChannelRef = safeRef(channelRef, "channelRef");
  const safeSourceRef = safeRef(sourceRef, "sourceRef");
  if (typeof snapshotReader !== "function") {
    throw collectorError("validation_error", "snapshotReader is required");
  }

  async function collect({ since } = {}) {
    let source;
    try {
      source = await snapshotReader({
        channelRef: safeChannelRef,
        since
      });
    } catch (error) {
      const failure = safeUsageCollectorFailure({
        error,
        sourceRef: safeSourceRef,
        channelRef: safeChannelRef,
        target: "snapshotReader",
        nextAction: "review_mihomo_usage_source_failure"
      });
      if (failure) return failure;
      throw error;
    }

    let snapshot;
    try {
      snapshot = normalizeSnapshot(source, {
        channelRef: safeChannelRef,
        since,
        nowFn
      });
    } catch (error) {
      return validationFailure({
        sourceRef: safeSourceRef,
        channelRef: safeChannelRef,
        error
      });
    }

    if (snapshot.aggregateOnly) {
      return unsupported({
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        blockers: [blocker("node_aggregate_only", "usageSnapshot.aggregate")]
      });
    }
    if (snapshot.accountingMode === "delta" && !snapshot.entries.length) {
      return {
        ok: true,
        status: "collected",
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        accountingMode: "delta",
        stateWarmup: snapshot.stateWarmup,
        observations: [],
        blockers: [],
        nextAction: "record_usage_observations_with_control_plane_accounting",
        safety: {
          noRawRuntimePayload: true,
          noSecretMaterialReturned: true
        }
      };
    }
    if (!snapshot.entries.length) {
      return unsupported({
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        blockers: [blocker("per_credential_usage_entries_required", "usageSnapshot.entries")]
      });
    }

    const contextualSnapshot = {
      ...snapshot,
      channelRef: safeChannelRef
    };
    try {
      return {
        ok: true,
        status: "collected",
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        accountingMode: snapshot.accountingMode,
        stateWarmup: snapshot.stateWarmup,
        observations: snapshot.entries.map((entry, index) =>
          normalizeEntry(entry, index, contextualSnapshot)
        ),
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
