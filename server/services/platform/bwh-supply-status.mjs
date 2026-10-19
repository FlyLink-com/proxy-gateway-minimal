import { assertNoDuplicateObjectKeys } from "../deployment/strict-json-scan.mjs";

export const BWH_SUPPLY_MAX_BYTES = 16 * 1024;
const failure = () => Object.assign(new Error("BWH supply host unavailable"), { code: "bwh_supply_host_unavailable" });

/** Sanitized DTO shared by privileged worker and unprivileged transport only. */
export function parseBwhSupplyHostStatus(text, { fresh = true, now = Date.now() } = {}) {
  if (typeof text !== "string" || Buffer.byteLength(text) > BWH_SUPPLY_MAX_BYTES) throw failure();
  let value; try { assertNoDuplicateObjectKeys(text); value = JSON.parse(text); } catch { throw failure(); }
  const keys = ["revision", "state", "protocolsRunning", "collectorState", "nativeDistributionEnabled", "observedAt", "canPause", "canEnable"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key)) || !/^[a-f0-9]{64}$/.test(value.revision)
    || !["enabled", "paused", "transitioning", "failed", "unavailable"].includes(value.state)
    || !Number.isInteger(value.protocolsRunning) || value.protocolsRunning < 0 || value.protocolsRunning > 3
    || !["running", "paused", "unknown"].includes(value.collectorState)
    || ["nativeDistributionEnabled", "canPause", "canEnable"].some(key => typeof value[key] !== "boolean")) throw failure();
  if (value.observedAt !== null && (typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt))
    || new Date(value.observedAt).toISOString() !== value.observedAt)) throw failure();
  if (fresh && value.state !== "unavailable" && (value.observedAt === null || Date.parse(value.observedAt) > now || now - Date.parse(value.observedAt) > 60_000)) throw failure();
  if (value.state === "enabled") {
    if (!value.nativeDistributionEnabled || value.protocolsRunning !== 3 || value.collectorState !== "running" || !value.canPause || value.canEnable) throw failure();
  } else if (value.nativeDistributionEnabled || value.canPause || (value.canEnable && value.state !== "paused")) throw failure();
  if (value.state === "paused" && (value.protocolsRunning !== 0 || value.collectorState !== "paused")) throw failure();
  return value;
}
