import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";

// Separate from the BWH supply wire. Callers cannot pass a command, unit,
// interface, or mark; apply and rollback name only a revision.
export const BWH_BANDWIDTH_WIRE_VERSION = 1;
export const BWH_BANDWIDTH_WIRE_MAX_REQUEST_BYTES = 512;
export const BWH_BANDWIDTH_WIRE_MAX_RESPONSE_BYTES = 8 * 1024;
const ACTIONS = new Set(["status", "plan", "apply", "rollback"]);
const REVISION = /^[a-f0-9]{64}$/;
const reject = () => { throw new Error("BWH bandwidth control frame rejected"); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function frame(text, limit) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > limit || !text.endsWith("\n")
    || text.slice(0, -1).includes("\n") || text.includes("\r")) reject();
  try { assertNoDuplicateObjectKeys(text); return JSON.parse(text); } catch { reject(); }
}

function validBps(enabled, bps) {
  if (enabled === true) return Number.isSafeInteger(bps) && bps >= 100000 && bps <= 10000000000;
  return enabled === false && bps === null;
}

function validStatus(value) {
  return exact(value, ["state", "revision", "inboundEnabled", "outboundEnabled", "inboundBps", "outboundBps", "classificationProven", "managementExemptProven"])
    && ["desired", "applying", "applied", "failed", "unknown"].includes(value.state)
    && typeof value.revision === "string" && REVISION.test(value.revision)
    && validBps(value.inboundEnabled, value.inboundBps)
    && validBps(value.outboundEnabled, value.outboundBps)
    && typeof value.classificationProven === "boolean"
    && typeof value.managementExemptProven === "boolean";
}

export function parseBwhBandwidthWireRequest(text) {
  const value = frame(text, BWH_BANDWIDTH_WIRE_MAX_REQUEST_BYTES);
  const mutating = value?.action === "apply" || value?.action === "rollback";
  const keys = mutating ? ["version", "action", "revision"] : ["version", "action"];
  if (!exact(value, keys) || value.version !== 1 || !ACTIONS.has(value.action)) reject();
  if (!mutating && value.action !== "status" && value.action !== "plan") reject();
  if (mutating && (typeof value.revision !== "string" || !REVISION.test(value.revision))) reject();
  return value;
}

export function encodeBwhBandwidthWireRequest(value) {
  const text = `${JSON.stringify(value)}\n`;
  parseBwhBandwidthWireRequest(text);
  return text;
}

export function parseBwhBandwidthWireResponse(text) {
  const value = frame(text, BWH_BANDWIDTH_WIRE_MAX_RESPONSE_BYTES);
  if (value?.version !== 1 || typeof value.ok !== "boolean"
    || !exact(value, value.ok ? ["version", "ok", "status"] : ["version", "ok"])) reject();
  if (value.ok && !validStatus(value.status)) reject();
  return value;
}

export function encodeBwhBandwidthWireResponse(value) {
  const text = `${JSON.stringify(value)}\n`;
  parseBwhBandwidthWireResponse(text);
  return text;
}
