const STATUS_BY_SOURCE_ERROR_CODE = Object.freeze({
  validation_error: "validation_error",
  xray_stats_query_failed: "collector_error",
  controller_error: "collector_error",
  controller_unauthorized: "collector_error",
  controller_forbidden: "collector_error",
  runtime_fetch_failed: "collector_error",
  traffic_stats_unauthorized: "collector_error",
  traffic_stats_forbidden: "collector_error",
  auth_error: "collector_error",
  authentication_failed: "collector_error",
  runtime_down: "collector_error"
});

function sourceErrorCode(error) {
  const code = String(error?.code ?? "").trim().toLowerCase();
  return Object.hasOwn(STATUS_BY_SOURCE_ERROR_CODE, code) ? code : "";
}

export function safeUsageCollectorFailure({
  error,
  sourceRef,
  channelRef,
  target,
  nextAction,
  accountingMode
} = {}) {
  const code = sourceErrorCode(error);
  if (!code) return null;

  return {
    ok: false,
    status: STATUS_BY_SOURCE_ERROR_CODE[code],
    sourceRef,
    channelRef,
    ...(accountingMode ? { accountingMode } : {}),
    observations: [],
    blockers: [{ code, target }],
    nextAction,
    safety: {
      noRawRuntimePayload: true,
      noSecretMaterialReturned: true
    }
  };
}
