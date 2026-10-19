import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

// Synchronous query core only. Its caller must run it in a bounded child process
// with a deadline; do not invoke a full-history scan on the HTTP event loop.
const MAX_SCAN_LIMIT = 1_000_000;
const SAFE_COUNT_MAX = BigInt(Number.MAX_SAFE_INTEGER);
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MONTH_DAYS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
const CATEGORIES = Object.freeze([
  "local_vless", "local_hy2", "local_tuic", "sgp_vless", "sgp_hy2", "other_sources"
]);
// Exact pairs from full-metering-scope.mjs. These labels classify stored samples;
// they make no statement about current host location, activation or health.
const SOURCE_PAIRS = Object.freeze([
  ["local_vless", "full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp"],
  ["local_hy2", "full_metering_hy2_cumulative_v1", "channel-vultr-a-hy2"],
  ["local_tuic", "full_metering_tuic_connections_v1", "channel-vultr-a-tuic"],
  ["sgp_vless", "full_metering_xray_cumulative_v1", "channel-sgp-a-vless-reality-tcp"],
  ["sgp_hy2", "full_metering_hy2_cumulative_v1", "channel-sgp-a-hy2"]
]);
const TABLE_COLUMNS = Object.freeze({
  platform_usage_samples: ["source_ref", "channel_ref", "account_id", "observed_at",
    "interval_started_at", "interval_ended_at", "created_at", "upload_bytes", "download_bytes", "total_bytes"],
  platform_usage_rollups: ["account_id", "last_observed_at", "updated_at", "upload_bytes", "download_bytes", "total_bytes"],
  platform_accounts: ["id"]
});
const COVERAGE = Object.freeze({
  customerClassification: "not_available",
  population: "all_recorded_accounts",
  sourceClassification: "stored_pairs_not_current_activation",
  thirdPartyUsage: "not_metered_here",
  missingIntervals: "unknown",
  collectorHealth: "not_assessed",
  timestamps: "observation_time_not_commit_time",
  emptySamples: "not_proven_zero_consumption",
  reconciliation: "aggregate_totals_only"
});

class LedgerReadError extends Error {
  constructor(code) {
    super("Admin usage ledger unavailable");
    this.code = code;
  }
}

function fail(code) {
  throw new LedgerReadError(code);
}

// Optional, in-process diagnostics only. Observers receive no source values,
// SQL, timestamps or errors, and cannot turn an observer failure into a query
// or cleanup failure. The default path emits nothing and creates no promises.
function phaseRunner(options) {
  let onPhase;
  try { onPhase = options?.onPhase; } catch { /* Diagnostics are best-effort. */ }
  if (typeof onPhase !== "function") return (_phase, operation) => operation();
  const emit = (phase, event) => {
    try {
      const pending = onPhase(Object.freeze({ phase, event }));
      if (pending != null) Promise.resolve(pending).catch(() => {});
    } catch { /* Preserve query and close behavior if an observer throws. */ }
  };
  return (phase, operation) => {
    emit(phase, "start");
    try {
      const result = operation();
      emit(phase, "end");
      return result;
    } catch (error) {
      emit(phase, "error");
      throw error;
    }
  };
}

function canonicalIso(value) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) return false;
  // Every row is validated, including samples outside the requested windows.
  // Check the same proleptic Gregorian calendar as Date's ISO round-trip, but
  // avoid allocating/parsing/serializing a Date for every stored timestamp.
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const leapDay = month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 1 : 0;
  return day <= MONTH_DAYS[month - 1] + leapDay
    && Number(value.slice(11, 13)) < 24
    && Number(value.slice(14, 16)) < 60
    && Number(value.slice(17, 19)) < 60;
}

function sampleTimesValid(observed, started, ended, created) {
  // One SQLite -> JS call per row. Reuse only exact values already validated
  // in this row; there is no cross-row cache or assumption of normal writes.
  return canonicalIso(observed)
    && (started === observed || canonicalIso(started))
    && (ended === observed || ended === started || canonicalIso(ended))
    && (created === observed || created === started || created === ended || canonicalIso(created)) ? 1 : 0;
}

function rollupTimesValid(observed, updated) {
  return canonicalIso(observed) && (updated === observed || canonicalIso(updated)) ? 1 : 0;
}

function safeCount(value) {
  if (typeof value !== "bigint" || value < 0n || value > SAFE_COUNT_MAX) fail("integer_overflow");
  return Number(value);
}

function byteString(value) {
  if (typeof value !== "bigint" || value < 0n) fail("invalid_source_data");
  return value.toString();
}

function assertTablesAndBudget(db, scanLimit) {
  for (const [table, requiredColumns] of Object.entries(TABLE_COLUMNS)) {
    const schema = db.prepare("select type, sql from sqlite_schema where name = ?").get(table);
    if (!schema || schema.type !== "table" || typeof schema.sql !== "string"
      || !/^\s*create\s+table\b/i.test(schema.sql)) fail("source_unavailable");
    const columns = new Set(db.prepare(`pragma table_info(${table})`).all().map((column) => column.name));
    if (requiredColumns.some((column) => !columns.has(column))) fail("source_unavailable");
    // COUNT over a bounded subquery visits at most cap+1 rows, unlike LIMIT on
    // the result of a full-table aggregate. Never publish a truncated total.
    const { row_count: count } = db.prepare(`
      select count(*) as row_count from (select 1 from ${table} limit ?)
    `).get(scanLimit + 1);
    if (safeCount(count) > scanLimit) fail("scan_limit_exceeded");
  }
}

function invalidBytesSql() {
  return `typeof(upload_bytes) != 'integer' or upload_bytes < 0
    or typeof(download_bytes) != 'integer' or download_bytes < 0
    or typeof(total_bytes) != 'integer' or total_bytes < 0
    or upload_bytes > total_bytes or download_bytes != total_bytes - upload_bytes`;
}

function invalidTextSql(field) {
  return `typeof(${field}) != 'text' or length(${field}) = 0`;
}

function assertData(db, stage) {
  const checks = [
    ["validate_samples", "platform_usage_samples", [invalidBytesSql(), ...["account_id", "source_ref", "channel_ref"].map(invalidTextSql),
      "ledger_sample_times_valid(observed_at, interval_started_at, interval_ended_at, created_at) != 1",
      "interval_started_at > interval_ended_at"]],
    ["validate_rollups", "platform_usage_rollups", [invalidBytesSql(), invalidTextSql("account_id"),
      "ledger_rollup_times_valid(last_observed_at, updated_at) != 1"]],
    ["validate_accounts", "platform_accounts", [invalidTextSql("id")]]
  ];
  for (const [phase, table, conditions] of checks) {
    stage(phase, () => {
      if (db.prepare(`select 1 from ${table} where ${conditions.join(" or ")} limit 1`).get()) {
        fail("invalid_source_data");
      }
    });
  }
}

function windowsFor(cutoff) {
  const timestamp = Date.parse(cutoff);
  const from24h = new Date(timestamp - 86_400_000).toISOString();
  const from7d = new Date(timestamp - 7 * 86_400_000).toISOString();
  if (!canonicalIso(from24h) || !canonicalIso(from7d)) fail("invalid_query");
  return [
    { id: "all_time", from: null, to: cutoff },
    { id: "last_24h", from: from24h, to: cutoff },
    { id: "last_7d", from: from7d, to: cutoff },
    { id: "month_to_date", from: `${cutoff.slice(0, 7)}-01T00:00:00.000Z`, to: cutoff }
  ];
}

function windowCondition(window, index) {
  return window.from === null ? "observed_at < @cutoff"
    : `observed_at >= @from${index} and observed_at < @cutoff`;
}

function positiveAccountsColumn(window, index) {
  return `count(distinct case when ${windowCondition(window, index)} and total_bytes > 0 then account_id end) as w${index}_positive_accounts`;
}

function windowColumns(windows) {
  return windows.map((window, index) => {
    const condition = windowCondition(window, index);
    return `
      count(case when ${condition} then 1 end) as w${index}_sample_count,
      ${positiveAccountsColumn(window, index)},
      coalesce(sum(case when ${condition} then upload_bytes else 0 end), 0) as w${index}_upload_bytes,
      coalesce(sum(case when ${condition} then download_bytes else 0 end), 0) as w${index}_download_bytes,
      coalesce(sum(case when ${condition} then total_bytes else 0 end), 0) as w${index}_total_bytes,
      max(case when ${condition} then observed_at end) as w${index}_latest_observed_at`;
  }).join(",");
}

function windowMetrics(row, index) {
  const prefix = `w${index}_`;
  const sampleCount = row ? safeCount(row[`${prefix}sample_count`]) : 0;
  const totalBytes = row ? byteString(row[`${prefix}total_bytes`]) : "0";
  const latestObservedAt = row?.[`${prefix}latest_observed_at`] ?? null;
  if ((sampleCount === 0 && latestObservedAt !== null)
    || (sampleCount > 0 && !canonicalIso(latestObservedAt))) fail("invalid_source_data");
  return {
    state: sampleCount === 0 ? "not_collected" : totalBytes === "0" ? "measured_zero" : "measured",
    sampleCount,
    positiveAccountCount: row ? safeCount(row[`${prefix}positive_accounts`]) : 0,
    uploadBytes: row ? byteString(row[`${prefix}upload_bytes`]) : "0",
    downloadBytes: row ? byteString(row[`${prefix}download_bytes`]) : "0",
    totalBytes,
    latestObservedAt
  };
}

function readWindows(db, windows, cutoff, stage) {
  const bindings = { cutoff };
  for (const [index, window] of windows.entries()) if (window.from !== null) bindings[`from${index}`] = window.from;
  const columns = windowColumns(windows);
  // Positive accounts overlap categories: retain the independent DISTINCT
  // query (including CASE's original comparison semantics). Counts, bytes and
  // latest timestamps instead fold the disjoint six-category partition below.
  const totals = stage("window_accounts", () => db.prepare(`select ${windows.map(positiveAccountsColumn).join(",")}
    from platform_usage_samples`).get(bindings));
  const cases = SOURCE_PAIRS.map(([category], index) =>
    `when source_ref = @source${index} and channel_ref = @channel${index} then '${category}'`).join(" ");
  for (const [index, [, source, channel]] of SOURCE_PAIRS.entries()) {
    bindings[`source${index}`] = source;
    bindings[`channel${index}`] = channel;
  }
  const sources = stage("window_sources", () => new Map(db.prepare(`
    select case ${cases} else 'other_sources' end as category, ${columns}
      from platform_usage_samples group by category
  `).all(bindings).map((row) => [row.category, row])));
  return stage("window_fold", () => {
    for (const index of windows.keys()) {
      const prefix = `w${index}_`;
      for (const field of ["sample_count", "upload_bytes", "download_bytes", "total_bytes"]) {
        // All inputs are nonnegative BigInts. Full-snapshot reconciliation has
        // already enforced SQLite's 64-bit SUM overflow boundary before this
        // subset fold; do not round bytes through Number or sum account counts.
        totals[`${prefix}${field}`] = [...sources.values()].reduce((sum, row) => sum + row[`${prefix}${field}`], 0n);
      }
      totals[`${prefix}latest_observed_at`] = null;
      for (const row of sources.values()) {
        const latest = row[`${prefix}latest_observed_at`];
        if (latest !== null && (totals[`${prefix}latest_observed_at`] === null
          || latest > totals[`${prefix}latest_observed_at`])) totals[`${prefix}latest_observed_at`] = latest;
      }
    }
    return windows.map((window, index) => ({
      ...window,
      ...windowMetrics(totals, index),
      sources: CATEGORIES.map((category) => ({ category, ...windowMetrics(sources.get(category), index) }))
    }));
  });
}

function totalsFor(db, table, countName) {
  const row = db.prepare(`select count(*) as row_count,
    coalesce(sum(upload_bytes), 0) as upload_bytes,
    coalesce(sum(download_bytes), 0) as download_bytes,
    coalesce(sum(total_bytes), 0) as total_bytes from ${table}`).get();
  return {
    [countName]: safeCount(row.row_count),
    uploadBytes: byteString(row.upload_bytes),
    downloadBytes: byteString(row.download_bytes),
    totalBytes: byteString(row.total_bytes)
  };
}

function orphanCount(db, table) {
  return safeCount(db.prepare(`select count(distinct account_id) as orphan_count
    from ${table} where account_id not in (select id from platform_accounts)`).get().orphan_count);
}

function readReconciliation(db, cutoff, stage) {
  // The rollup is an undated cumulative projection: compare the entire snapshot,
  // including future / exactly-at-cutoff samples, never a window against it.
  const samples = stage("reconcile_samples", () => totalsFor(db, "platform_usage_samples", "sampleCount"));
  const rollups = stage("reconcile_rollups", () => totalsFor(db, "platform_usage_rollups", "rollupCount"));
  const differenceBytes = Object.fromEntries(["uploadBytes", "downloadBytes", "totalBytes"].map((key) =>
    [key, (BigInt(samples[key]) - BigInt(rollups[key])).toString()]));
  const outside = stage("reconcile_outside", () => db.prepare(`select
    count(case when observed_at > @cutoff then 1 end) as future_count,
    count(case when observed_at = @cutoff then 1 end) as at_cutoff_count
    from platform_usage_samples`).get({ cutoff }));
  return {
    scope: "entire_database_snapshot",
    aggregateOnly: true,
    state: Object.values(differenceBytes).every((value) => value === "0") ? "totals_match" : "totals_mismatch",
    samples,
    rollups,
    differenceBytes,
    futureSampleCount: safeCount(outside.future_count),
    atCutoffSampleCount: safeCount(outside.at_cutoff_count),
    orphanSampleAccountCount: stage("reconcile_orphan_samples", () => orphanCount(db, "platform_usage_samples")),
    orphanRollupAccountCount: stage("reconcile_orphan_rollups", () => orphanCount(db, "platform_usage_rollups"))
  };
}

/** Read aggregate traffic evidence only. Does not initialize or migrate schemas. */
export function readAdminUsageLedger(input = {}, diagnostics = {}) {
  const stage = phaseRunner(diagnostics);
  let db;
  try {
    const { dbPath, cutoff, scanLimit, windows } = stage("validate_input", () => {
      if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid_query");
      const { dbPath, cutoff, scanLimit = MAX_SCAN_LIMIT } = input;
      if (typeof dbPath !== "string" || !isAbsolute(dbPath) || !canonicalIso(cutoff)
        || !Number.isSafeInteger(scanLimit) || scanLimit < 1 || scanLimit > MAX_SCAN_LIMIT) fail("invalid_query");
      return { dbPath, cutoff, scanLimit, windows: windowsFor(cutoff) };
    });
    db = stage("db_open", () => new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 1000 }));
    stage("db_setup", () => {
      db.defaultSafeIntegers(true);
      db.pragma("query_only = ON");
      db.pragma("trusted_schema = OFF");
      if (!db.readonly || Number(db.pragma("query_only", { simple: true })) !== 1
        || Number(db.pragma("trusted_schema", { simple: true })) !== 0) fail("source_unavailable");
      db.function("ledger_sample_times_valid", { deterministic: true }, sampleTimesValid);
      db.function("ledger_rollup_times_valid", { deterministic: true }, rollupTimesValid);
    });
    return db.transaction(() => {
      stage("schema_budget", () => assertTablesAndBudget(db, scanLimit));
      assertData(db, stage);
      const reconciliation = readReconciliation(db, cutoff, stage);
      return {
        schemaVersion: "admin-usage-ledger/v1",
        cutoff,
        timezone: "UTC",
        unit: "bytes",
        windows: readWindows(db, windows, cutoff, stage),
        reconciliation,
        coverage: { ...COVERAGE }
      };
    })();
  } catch (error) {
    if (error instanceof LedgerReadError) throw error;
    if (error?.code === "SQLITE_ERROR" && error?.message === "integer overflow") fail("integer_overflow");
    fail("source_unavailable");
  } finally {
    // Never publish success with uncertain connection cleanup, or expose native
    // SQL, filenames or source values through the cleanup error.
    stage("db_close", () => {
      if (db?.open) {
        try { db.close(); } catch { fail("source_unavailable"); }
      }
    });
  }
}
