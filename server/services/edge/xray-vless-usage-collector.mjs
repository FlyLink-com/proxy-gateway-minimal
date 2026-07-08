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
    nextAction: "enable_xray_stats_api_and_user_counters_before_quota_enforcement",
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
    nextAction: "fix_xray_usage_collector_snapshot_contract",
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  };
}

function normalizeSnapshot(snapshot, { since }) {
  if (!isPlainObject(snapshot)) {
    throw collectorError("validation_error", "usage snapshot must be an object");
  }
  const sourceRef = safeRef(snapshot.sourceRef || "xray_statsquery_user_traffic", "sourceRef");
  const observedAt = isoText(snapshot.observedAt, "observedAt");
  return {
    sourceRef,
    observedAt,
    intervalStartedAt: isoText(snapshot.intervalStartedAt || since || observedAt, "intervalStartedAt"),
    intervalEndedAt: isoText(snapshot.intervalEndedAt || observedAt, "intervalEndedAt"),
    entries: Array.isArray(snapshot.entries) ? snapshot.entries : []
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

export function createXrayVlessUsageCollector({
  channelRef,
  snapshotReader
} = {}) {
  const safeChannelRef = safeRef(channelRef, "channelRef");
  if (typeof snapshotReader !== "function") {
    throw collectorError("validation_error", "snapshotReader is required");
  }

  async function collect({ since } = {}) {
    const source = await snapshotReader({
      channelRef: safeChannelRef,
      since
    });

    let snapshot;
    try {
      snapshot = normalizeSnapshot(source, { since });
    } catch (error) {
      return validationFailure({
        sourceRef: "xray_statsquery_user_traffic",
        channelRef: safeChannelRef,
        error
      });
    }

    if (!snapshot.entries.length) {
      return unsupported({
        sourceRef: snapshot.sourceRef,
        channelRef: safeChannelRef,
        blockers: [blocker("xray_user_stats_required", "usageSnapshot.entries")]
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
