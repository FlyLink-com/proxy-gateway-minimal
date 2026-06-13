const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function atomicError(code, message) {
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
    throw atomicError("validation_error", `${field} is required`);
  }
  return normalized;
}

function safeRef(value, field) {
  const normalized = requiredText(value, field);
  if (!SAFE_REF_PATTERN.test(normalized)) {
    throw atomicError("validation_error", `${field} must be a safe reference`);
  }
  return normalized;
}

function isoText(value, field) {
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw atomicError("validation_error", `${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function nonNegativeInteger(value, field) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw atomicError("validation_error", `${field} must be an integer >= 0`);
  }
  return normalized;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMode(value) {
  const raw = text(value || "delta").toLowerCase().replace(/[\s_]+/g, "-");
  if (raw === "delta" || raw === "read-clear" || raw === "read-and-clear") {
    return "delta";
  }
  if (raw === "cumulative" || raw === "counter") {
    return "cumulative";
  }
  throw atomicError("validation_error", "mode must be delta or cumulative");
}

function normalizeObservation(input) {
  if (!isPlainObject(input)) {
    throw atomicError("validation_error", "observation must be an object");
  }
  return {
    sourceRef: safeRef(input.sourceRef, "sourceRef"),
    channelRef: safeRef(input.channelRef, "channelRef"),
    edgeCredentialRef: safeRef(input.edgeCredentialRef, "edgeCredentialRef"),
    observedAt: isoText(input.observedAt, "observedAt"),
    intervalStartedAt: isoText(input.intervalStartedAt, "intervalStartedAt"),
    intervalEndedAt: isoText(input.intervalEndedAt, "intervalEndedAt"),
    uploadBytes: nonNegativeInteger(input.uploadBytes ?? 0, "uploadBytes"),
    downloadBytes: nonNegativeInteger(input.downloadBytes ?? 0, "downloadBytes")
  };
}

function normalizeCursor(input) {
  if (!isPlainObject(input)) {
    return null;
  }
  return {
    uploadBytes: nonNegativeInteger(input.uploadBytes ?? 0, "cursor.uploadBytes"),
    downloadBytes: nonNegativeInteger(input.downloadBytes ?? 0, "cursor.downloadBytes"),
    observedAt: isoText(input.observedAt, "cursor.observedAt")
  };
}

function cursorFromObservation(observation) {
  return {
    uploadBytes: observation.uploadBytes,
    downloadBytes: observation.downloadBytes,
    observedAt: observation.observedAt
  };
}

function statusFor({ observations, skipped, resetEvents }) {
  if (observations.length > 0) return "calculated";
  if (resetEvents.length > 0) return "counter_reset_detected";
  if (skipped.some((item) => item.reason === "cursor_initialized")) return "cursor_initialized";
  return "no_delta";
}

export function calculateRuntimeUsageDeltas({
  mode = "delta",
  observations = [],
  cursors = {}
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const inputObservations = Array.isArray(observations)
    ? observations.map(normalizeObservation)
    : (() => { throw atomicError("validation_error", "observations must be an array"); })();
  const inputCursors = isPlainObject(cursors) ? cursors : {};
  const nextCursors = {};
  const outputObservations = [];
  const skipped = [];
  const resetEvents = [];

  for (const observation of inputObservations) {
    const edgeCredentialRef = observation.edgeCredentialRef;
    if (normalizedMode === "delta") {
      outputObservations.push(observation);
      nextCursors[edgeCredentialRef] = cursorFromObservation(observation);
      continue;
    }

    const cursor = normalizeCursor(inputCursors[edgeCredentialRef]);
    nextCursors[edgeCredentialRef] = cursorFromObservation(observation);
    if (!cursor) {
      skipped.push({
        edgeCredentialRef,
        reason: "cursor_initialized"
      });
      continue;
    }

    if (observation.uploadBytes < cursor.uploadBytes || observation.downloadBytes < cursor.downloadBytes) {
      resetEvents.push({
        edgeCredentialRef,
        previousObservedAt: cursor.observedAt,
        observedAt: observation.observedAt,
        reason: "counter_decreased"
      });
      continue;
    }

    const uploadBytes = observation.uploadBytes - cursor.uploadBytes;
    const downloadBytes = observation.downloadBytes - cursor.downloadBytes;
    if (uploadBytes === 0 && downloadBytes === 0) {
      skipped.push({
        edgeCredentialRef,
        reason: "no_delta"
      });
      continue;
    }
    outputObservations.push({
      ...observation,
      intervalStartedAt: cursor.observedAt,
      uploadBytes,
      downloadBytes
    });
  }

  return {
    ok: true,
    status: statusFor({
      observations: outputObservations,
      skipped,
      resetEvents
    }),
    mode: normalizedMode,
    observations: outputObservations,
    nextCursors,
    skipped,
    resetEvents,
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  };
}
