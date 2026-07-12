const BYTES_PER_GIB = 1024 ** 3;
export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_TRAFFIC_LIMIT_BYTES = 5 * BYTES_PER_GIB;

export function trafficLimitBytesForPlan(plan, requestedBytes = 0) {
  return String(plan ?? "").trim().toLowerCase() === "trial"
    ? TRIAL_TRAFFIC_LIMIT_BYTES
    : requestedBytes;
}
