const DIAGNOSTIC_COUNTER_KEYS = Object.freeze([
  "connectOk",
  "connectFailure",
  "connectTimeout",
  "unsupportedCommand",
  "protocolError"
]);

const DIAGNOSTIC_FAILURE_CLASSES = Object.freeze([
  "channel_disabled",
  "channel_failure",
  "connect_failed",
  "edge_tunnel_failure",
  "protocol_error",
  "timeout",
  "unsupported_command",
  "unknown"
]);

const DIAGNOSTIC_COUNTER_KEY_SET = new Set(DIAGNOSTIC_COUNTER_KEYS);
const DIAGNOSTIC_FAILURE_CLASS_SET = new Set(DIAGNOSTIC_FAILURE_CLASSES);

export const LOCAL_EDGE_DIAGNOSTICS_CONTRACT = Object.freeze({
  counterKeys: DIAGNOSTIC_COUNTER_KEYS,
  failureClasses: DIAGNOSTIC_FAILURE_CLASSES
});

export function sanitizeDiagnosticsCounters(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const counters = {};
  for (const [key, value] of Object.entries(input)) {
    if (!DIAGNOSTIC_COUNTER_KEY_SET.has(key) || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    counters[key] = value;
  }
  return counters;
}

export function redactedLastFailure(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const failureClass = String(input.class ?? "").trim();
  return {
    class: DIAGNOSTIC_FAILURE_CLASS_SET.has(failureClass) ? failureClass : "unknown"
  };
}
