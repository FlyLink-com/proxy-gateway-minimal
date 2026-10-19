// Private diagnostic subset of the #792 query, not a replacement for ledger
// validation or its DTO. The caller MUST enforce the existing 10 s deadline in
// a separate child process: synchronous SQLite cannot be cancelled here.
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";

export const VERSION = "admin-ledger-schema-budget-probe/v1";
export const CATEGORIES = Object.freeze([
  "invalid_query", "source_unavailable", "scan_limit_exceeded",
  "integer_overflow", "diagnostic_unavailable", "cleanup_unconfirmed"
]);
const MAX_SCAN = 1000000;
const TABLES = Object.freeze([
  ["samples", "platform_usage_samples", ["source_ref", "channel_ref", "account_id", "observed_at", "interval_started_at", "interval_ended_at", "created_at", "upload_bytes", "download_bytes", "total_bytes"]],
  ["rollups", "platform_usage_rollups", ["account_id", "last_observed_at", "updated_at", "upload_bytes", "download_bytes", "total_bytes"]],
  ["accounts", "platform_accounts", ["id"]]
]);
const RESOURCE_FIELDS = Object.freeze({
  minorFaults: "minorPageFault", majorFaults: "majorPageFault", fsRead: "fsRead",
  voluntaryCS: "voluntaryContextSwitches", involuntaryCS: "involuntaryContextSwitches"
});
const unknown = () => Object.freeze({ state: "unknown" });
const safeInteger = value => Number.isSafeInteger(value) && value >= 0;
const rounded = value => Math.round(value * 1000) / 1000;

class ProbeError extends Error {
  constructor(category) { super(`Schema budget probe failed: ${category}`); this.category = category; }
}
function fail(category) { throw new ProbeError(category); }
function categoryOf(error) { return error instanceof ProbeError ? error.category : "source_unavailable"; }
function inputOf(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.keys(input).some(key => !["dbPath", "scanLimit"].includes(key))) fail("invalid_query");
  const { dbPath, scanLimit = MAX_SCAN } = input;
  if (typeof dbPath !== "string" || !isAbsolute(dbPath) || dbPath.includes("\0")
      || /^[a-z][a-z\d+.-]*:/i.test(dbPath.replace(/^[a-z]:[\\/]/i, ""))
      || !Number.isSafeInteger(scanLimit) || scanLimit < 1 || scanLimit > MAX_SCAN) fail("invalid_query");
  return { dbPath, scanLimit };
}
function sample(read) {
  try { return read(); } catch { return null; }
}
function cpuDelta(before, after) {
  if (![before?.user, before?.system, after?.user, after?.system].every(safeInteger)
      || after.user < before.user || after.system < before.system) return unknown();
  return Object.freeze({ state: "available", userUs: after.user - before.user, systemUs: after.system - before.system });
}
function resourceDelta(before, after) {
  const fields = [...Object.values(RESOURCE_FIELDS), "maxRSS"];
  if (!fields.every(key => safeInteger(before?.[key]) && safeInteger(after?.[key]) && after[key] >= before[key])) return unknown();
  const output = { state: "available" };
  for (const [key, input] of Object.entries(RESOURCE_FIELDS)) output[key] = after[input] - before[input];
  output.maxRssKiB = after.maxRSS;
  output.maxRssGrowthKiB = after.maxRSS - before.maxRSS;
  return Object.freeze(output);
}

export function runAdminLedgerSchemaBudgetProbe(input, {
  DatabaseClass = Database, onEvent = () => {}, now = () => performance.now(),
  cpuUsage = () => process.cpuUsage(),
  // Windows supplies unsupported counters as zero placeholders. Do not present
  // those as observed absence of IO/faults/context switches. Tests may inject a
  // known counter provider explicitly, independent of the host platform.
  resourceUsage = () => process.platform === "win32" ? null : process.resourceUsage()
} = {}) {
  const { dbPath, scanLimit } = inputOf(input);
  if (![DatabaseClass, onEvent, now, cpuUsage, resourceUsage].every(value => typeof value === "function")) fail("invalid_query");
  let observerFailed = false;
  const clock = () => {
    let value;
    try { value = now(); } catch { fail("diagnostic_unavailable"); }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail("diagnostic_unavailable");
    return value;
  };
  const startedAt = clock();
  const emit = (context, event, metrics, category) => {
    if (observerFailed) fail("diagnostic_unavailable");
    const elapsedMs = rounded(clock() - startedAt);
    if (elapsedMs < 0 || !Number.isFinite(elapsedMs)) fail("diagnostic_unavailable");
    const record = { ...context, event, elapsedMs };
    if (metrics) record.metrics = metrics;
    if (category) record.category = category;
    try {
      const returned = onEvent(Object.freeze(record));
      if (returned && typeof returned.then === "function") {
        // A synchronous observer is required. Consume a possible rejected promise
        // without awaiting it or permitting the query to continue.
        Promise.resolve(returned).catch(() => {});
        throw new Error();
      }
    } catch {
      observerFailed = true;
      fail("diagnostic_unavailable");
    }
  };
  const snapshot = () => ({ time: clock(), cpu: sample(cpuUsage), resource: sample(resourceUsage) });
  const measure = (context, action, fallback = "source_unavailable") => {
    emit(context, "start");
    const before = snapshot();
    let output, actionError;
    try { output = action(); } catch (error) { actionError = error instanceof ProbeError ? error : new ProbeError(fallback); }
    const after = snapshot();
    if (after.time < before.time) fail("diagnostic_unavailable");
    const metrics = Object.freeze({
      wallMs: rounded(after.time - before.time),
      cpu: cpuDelta(before.cpu, after.cpu), resource: resourceDelta(before.resource, after.resource)
    });
    emit(context, actionError ? "error" : "end", metrics, actionError?.category);
    if (actionError) throw actionError;
    return output;
  };
  const outer = phase => ({ phase, role: "none", step: 0, part: "operation" });
  const sql = (db, role, step, statement, method, args = []) => {
    const context = { phase: "sql", role, step };
    const prepared = measure({ ...context, part: "prepare" }, () => db.prepare(statement));
    return measure({ ...context, part: "execute" }, () => prepared[method](...args));
  };
  let db, error;
  try {
    // Assignment happens inside the action so an observer failure after open
    // still leaves the handle available to the unconditional close below.
    measure(outer("db_open"), () => { db = new DatabaseClass(dbPath, { readonly: true, fileMustExist: true, timeout: 1000 }); });
    measure(outer("db_setup"), () => {
      db.defaultSafeIntegers(true);
      db.pragma("query_only = ON");
      db.pragma("trusted_schema = OFF");
      if (!db.readonly || Number(db.pragma("query_only", { simple: true })) !== 1
          || Number(db.pragma("trusted_schema", { simple: true })) !== 0) fail("source_unavailable");
    });
    measure(outer("transaction"), () => db.transaction(() => {
      for (const [role, table, required] of TABLES) {
        const schema = sql(db, role, 1, "select type, sql from sqlite_schema where name = ?", "get", [table]);
        if (!schema || schema.type !== "table" || typeof schema.sql !== "string" || !/^\s*create\s+table\b/i.test(schema.sql)) fail("source_unavailable");
        const columns = new Set(sql(db, role, 2, `pragma table_info(${table})`, "all").map(column => column.name));
        if (required.some(column => !columns.has(column))) fail("source_unavailable");
        const { row_count: count } = sql(db, role, 3,
          `select count(*) as row_count from (select 1 from ${table} limit ?)`, "get", [scanLimit + 1]);
        if (typeof count !== "bigint" || count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) fail("integer_overflow");
        if (count > BigInt(scanLimit)) fail("scan_limit_exceeded");
      }
    })());
  } catch (caught) {
    error = new ProbeError(categoryOf(caught));
  } finally {
    if (db) {
      let closeAttempted = false;
      const close = () => {
        closeAttempted = true;
        try { db.close(); } catch { fail("cleanup_unconfirmed"); }
        if (db.open !== false) fail("cleanup_unconfirmed");
      };
      try {
        if (observerFailed) close();
        else measure(outer("db_close"), close, "cleanup_unconfirmed");
      } catch (caught) {
        // Diagnostics may fail before close's action. Cleanup is mandatory even
        // when no further diagnostic record can safely be emitted.
        if (!closeAttempted) {
          try { close(); } catch { error = new ProbeError("cleanup_unconfirmed"); }
        }
        if (!error || categoryOf(caught) === "cleanup_unconfirmed") error = new ProbeError(categoryOf(caught));
      }
    }
  }
  if (error) throw error;
  return Object.freeze({ version: VERSION, ok: true, statements: 9, mode: "legacy_bounded_count", readOnly: true });
}
