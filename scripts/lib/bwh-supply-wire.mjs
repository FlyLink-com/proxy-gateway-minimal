import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";
import { parseBwhSupplyHostStatus } from "../../server/services/platform/bwh-supply-status.mjs";

export const BWH_SUPPLY_SOCKET_PATH = "/run/gccgw-bwh-supply-control/control.sock";
export const BWH_SUPPLY_WIRE_MAX_REQUEST_BYTES = 256;
export const BWH_SUPPLY_WIRE_MAX_RESPONSE_BYTES = 16 * 1024;
const reject = () => { throw new Error("BWH supply control frame rejected"); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function frame(text, limit) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > limit || !text.endsWith("\n")
    || text.slice(0, -1).includes("\n") || text.includes("\r")) reject();
  try { assertNoDuplicateObjectKeys(text); return JSON.parse(text); } catch { reject(); }
}

export function parseBwhSupplyWireRequest(text) {
  const value = frame(text, BWH_SUPPLY_WIRE_MAX_REQUEST_BYTES);
  if (!exact(value, value?.action === "status" ? ["version", "action"] : ["version", "action", "revision"])
    || value.version !== 1 || !["status", "pause", "enable"].includes(value.action)
    || (value.action !== "status" && (typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)))) reject();
  return value;
}

export function encodeBwhSupplyWireRequest(value) {
  const text = `${JSON.stringify(value)}\n`; parseBwhSupplyWireRequest(text); return text;
}

export function parseBwhSupplyWireResponse(text) {
  const value = frame(text, BWH_SUPPLY_WIRE_MAX_RESPONSE_BYTES);
  if (value?.version !== 1 || typeof value.ok !== "boolean"
    || !exact(value, value.ok ? ["version", "ok", "status"] : ["version", "ok"])) reject();
  if (value.ok) value.status = parseBwhSupplyHostStatus(JSON.stringify(value.status), { fresh: false });
  return value;
}

export function encodeBwhSupplyWireResponse(value) {
  const text = `${JSON.stringify(value)}\n`; parseBwhSupplyWireResponse(text); return text;
}
