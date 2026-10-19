// Explicit operator entry, not an application route or a production approval.
// Input uses stdin, progress uses an independently captured fd 3, final safe
// report uses stdout. Never discovers a DB, loads .env, retries or starts a unit.
import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync, writeSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoDuplicateObjectKeys } from "../server/services/deployment/strict-json-scan.mjs";
import { runSchemaBudgetProbeSupervised } from "./lib/admin-ledger-schema-budget-probe-supervisor.mjs";
import { parseSchemaBudgetReport, serializeSchemaBudgetReport } from "./lib/admin-ledger-schema-budget-report.mjs";

const VERSION = "admin-ledger-schema-budget-entry/v1";
const FIELDS = ["dev", "ino", "uid", "gid", "mode", "nlink"];
const MAX_INPUT = 8192;
const MAX_OUTPUT = 16384;
const ENTRY_CATEGORIES = new Set(["invalid_invocation", "invalid_input", "file_identity_unavailable", "file_identity_changed", "entry_failed", "entry_cleanup_unconfirmed", "report_too_large"]);
const keys = (value, fields) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
function invalidInput() { throw new Error("Invalid probe entry input"); }
function decode(value, max) {
  if (typeof value !== "string" && !Buffer.isBuffer(value)) throw new Error("Invalid encoded report");
  const bytes = Buffer.from(value);
  if (bytes.length > max) throw new Error("Invalid encoded report");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  assertNoDuplicateObjectKeys(text);
  return JSON.parse(text);
}
function validateInput(input) {
  if (!keys(input, ["version", "dbPath", "scanLimit", "expectedIdentity"]) || input.version !== VERSION
    || typeof input.dbPath !== "string" || !isAbsolute(input.dbPath) || input.dbPath.includes("\0")
    || /^[a-z][a-z\d+.-]*:/i.test(input.dbPath.replace(/^[a-z]:[\\/]/i, ""))
    || !Number.isSafeInteger(input.scanLimit) || input.scanLimit < 1 || input.scanLimit > 1000000
    || !keys(input.expectedIdentity, FIELDS)
    || !FIELDS.every(key => typeof input.expectedIdentity[key] === "string" && /^(0|[1-9]\d{0,19})$/.test(input.expectedIdentity[key]))
    || input.expectedIdentity.nlink !== "1") invalidInput();
  return input;
}
export function parseSchemaBudgetEntryInput(value) {
  try { return validateInput(decode(value, MAX_INPUT)); } catch { invalidInput(); }
}
function matches(stat, expected) {
  return stat.isFile() && !stat.isSymbolicLink() && FIELDS.every(key => String(stat[key]) === expected[key]);
}
function checkPath(input) {
  if (realpathSync(input.dbPath) !== resolve(input.dbPath)
    || !matches(lstatSync(input.dbPath, { bigint: true }), input.expectedIdentity)) throw new Error("File identity unavailable");
}
const empty = category => ({ version: VERSION, ok: false, category, fileIdentity: "not_checked", descriptorClosed: null, probe: null });

/** Explicit identity-bound one-shot call. Path checks are drift detection, not a
 * database write freeze: they cannot exclude an adversarial swap-and-restore.
 * Production must additionally bind the trusted parent/runtime/authorization.
 */
export async function runSchemaBudgetProbeEntry(rawInput, { onEvent, runProbe = runSchemaBudgetProbeSupervised, signal } = {}) {
  let input;
  try {
    input = parseSchemaBudgetEntryInput(JSON.stringify(rawInput));
    if (typeof onEvent !== "function" || typeof runProbe !== "function") invalidInput();
  } catch { return empty("invalid_input"); }
  const result = empty("file_identity_unavailable");
  let descriptor;
  try {
    checkPath(input);
    descriptor = openSync(input.dbPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (!matches(fstatSync(descriptor, { bigint: true }), input.expectedIdentity)) throw new Error();
    checkPath(input);
    result.fileIdentity = "stable";
  } catch {
    result.fileIdentity = "unavailable";
    if (descriptor !== undefined) {
      try { closeSync(descriptor); result.descriptorClosed = true; }
      catch { result.descriptorClosed = false; result.category = "entry_cleanup_unconfirmed"; }
    }
    return result;
  }
  try {
    const probe = await runProbe({ dbPath: input.dbPath, scanLimit: input.scanLimit }, { onEvent, signal });
    const encoded = serializeSchemaBudgetReport(probe);
    parseSchemaBudgetReport(encoded);
    result.probe = JSON.parse(encoded);
    result.category = probe.category;
  } catch (error) {
    result.category = error?.code === "report_too_large" ? "report_too_large" : "entry_failed";
  } finally {
    try {
      checkPath(input);
      if (!matches(fstatSync(descriptor, { bigint: true }), input.expectedIdentity)) throw new Error();
    } catch { result.fileIdentity = "mismatch"; result.category = "file_identity_changed"; }
    try { closeSync(descriptor); result.descriptorClosed = true; }
    catch { result.descriptorClosed = false; result.category = "entry_cleanup_unconfirmed"; }
  }
  result.ok = result.category === "accepted" && result.fileIdentity === "stable" && result.descriptorClosed === true;
  if (Buffer.byteLength(JSON.stringify(result)) + 1 > MAX_OUTPUT) {
    result.ok = false; result.category = "report_too_large"; result.probe = null;
  }
  return result;
}

export function parseSchemaBudgetEntryResult(value) {
  try {
    const result = decode(value, MAX_OUTPUT);
    if (!keys(result, ["version", "ok", "category", "fileIdentity", "descriptorClosed", "probe"])
      || result.version !== VERSION || typeof result.ok !== "boolean"
      || !["stable", "mismatch", "unavailable", "not_checked"].includes(result.fileIdentity)
      || ![true, false, null].includes(result.descriptorClosed)) throw new Error();
    const probe = result.probe === null ? null : parseSchemaBudgetReport(JSON.stringify(result.probe));
    if (!ENTRY_CATEGORIES.has(result.category) && (!probe || result.category !== probe.category)) throw new Error();
    if (result.ok !== (result.category === "accepted") || (result.ok && (!probe?.ok || result.fileIdentity !== "stable" || result.descriptorClosed !== true))) throw new Error();
    if (result.fileIdentity === "stable" && result.descriptorClosed === null) throw new Error();
    if (result.descriptorClosed === false && result.category !== "entry_cleanup_unconfirmed") throw new Error();
    if (result.fileIdentity === "mismatch" && !["file_identity_changed", "entry_cleanup_unconfirmed", "report_too_large"].includes(result.category)) throw new Error();
    return result;
  } catch { throw new Error("Invalid probe entry report"); }
}

function write(fd, data) {
  const bytes = Buffer.from(data);
  for (let offset = 0; offset < bytes.length;) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (count <= 0) throw new Error("Probe output failed");
    offset += count;
  }
}
function readInput() {
  return new Promise((accept, reject) => {
    const buffer = Buffer.alloc(MAX_INPUT); let used = 0, done = false;
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      process.stdin.removeListener("data", data); process.stdin.removeListener("end", end);
      process.stdin.destroy();
      if (error) reject(new Error("Invalid probe entry input")); else accept(value);
    };
    const data = chunk => {
      if (chunk.length > buffer.length - used) { finish(true); return; }
      chunk.copy(buffer, used); used += chunk.length;
    };
    const end = () => {
      try { finish(false, parseSchemaBudgetEntryInput(buffer.subarray(0, used))); } catch { finish(true); }
    };
    const timer = setTimeout(() => finish(true), 2000);
    process.stdin.on("data", data); process.stdin.once("end", end); process.stdin.on("error", () => finish(true));
  });
}
async function main() {
  let result = empty("invalid_invocation");
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on("SIGTERM", abort); process.on("SIGINT", abort);
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "--schema-budget-entry-v1") throw new Error();
    const progress = fstatSync(3);
    // Windows libuv anonymous pipes report mode 0x1000, but Node's stat
    // isFIFO()/isSocket() methods both return false on that platform.
    const windowsPipe = process.platform === "win32" && progress.mode === 0x1000;
    if (!progress.isFIFO() && !progress.isSocket() && !windowsPipe) throw new Error();
    result = empty("invalid_input");
    const input = await readInput();
    let progressBytes = 0;
    result = await runSchemaBudgetProbeEntry(input, { signal: controller.signal, onEvent(event) {
      const line = `${JSON.stringify(event)}\n`;
      progressBytes += Buffer.byteLength(line);
      if (progressBytes > 49152) throw new Error("Probe progress unavailable");
      write(3, line);
    } });
  } catch { /* Only the fixed, already classified result may leave this entry. */ }
  finally { process.removeListener("SIGTERM", abort); process.removeListener("SIGINT", abort); }
  try {
    const text = `${JSON.stringify(result)}\n`;
    parseSchemaBudgetEntryResult(text); write(1, text); process.exitCode = result.ok ? 0 : 1;
  } catch { process.exitCode = 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
