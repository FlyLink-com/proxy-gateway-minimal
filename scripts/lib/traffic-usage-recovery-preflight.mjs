import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";
import { sanitizeTrafficCollectorAdminProjection } from "../../server/services/platform/traffic-collector-admin-projection.mjs";

const STALE_AFTER_SECONDS = 15 * 60;
const MAX_STATUS_BYTES = 256 * 1024;
// Validate only the columns this read-only aggregate inspection consumes.
const REQUIRED_COLUMNS = Object.freeze({
  platform_usage_counter_cursors: { observed_at: "TEXT" },
  platform_usage_samples: { upload_bytes: "INTEGER", download_bytes: "INTEGER", total_bytes: "INTEGER" },
  platform_usage_rollups: { upload_bytes: "INTEGER", download_bytes: "INTEGER", total_bytes: "INTEGER" }
});

function timestampMs(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}

function safeCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("aggregate_invalid");
  return count;
}

function emptyStatus(availability) {
  return {
    availability, observedAt: null, ageSeconds: null,
    staleAfterSeconds: STALE_AFTER_SECONDS, stale: null, futureTimestamp: false,
    freshness: "unavailable", runOk: null, rawReportOk: null, recordingOk: null,
    collectorCount: 0
  };
}

function readStatusEvidence(filePath, nowMs) {
  let projection;
  try {
    if (statSync(filePath).size > MAX_STATUS_BYTES) return emptyStatus("invalid_observation");
    const raw = readFileSync(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_STATUS_BYTES) return emptyStatus("invalid_observation");
    projection = sanitizeTrafficCollectorAdminProjection(JSON.parse(raw));
  } catch (error) {
    return emptyStatus(error?.code === "ENOENT" ? "not_observed" : "invalid_observation");
  }
  if (projection?.availability !== "available") {
    const availability = ["not_configured", "not_observed", "invalid_observation"].includes(projection?.availability)
      ? projection.availability : "invalid_observation";
    return emptyStatus(availability);
  }
  const observedMs = timestampMs(projection.observedAt);
  if (observedMs === null) return emptyStatus("invalid_observation");
  const ageSeconds = Math.floor((nowMs - observedMs) / 1000);
  return {
    availability: "available",
    observedAt: projection.observedAt,
    ageSeconds,
    staleAfterSeconds: STALE_AFTER_SECONDS,
    stale: nowMs - observedMs > STALE_AFTER_SECONDS * 1000,
    futureTimestamp: observedMs > nowMs,
    freshness: observedMs > nowMs ? "future" : nowMs - observedMs > STALE_AFTER_SECONDS * 1000 ? "stale" : "recent",
    runOk: projection.run.runOk,
    rawReportOk: projection.run.rawReportOk,
    recordingOk: projection.accounting.recordingOk,
    collectorCount: projection.run.collectorCount
  };
}

function assertSchema(db) {
  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const entry = db.prepare("SELECT type FROM sqlite_schema WHERE name = ?").get(table);
    if (entry?.type !== "table") throw Object.assign(new Error("schema_invalid"), { recoverySchemaInvalid: true });
    const columns = new Map(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => [column.name, column.type.toUpperCase()]));
    if (Object.entries(required).some(([name, type]) => columns.get(name) !== type)) {
      throw Object.assign(new Error("schema_invalid"), { recoverySchemaInvalid: true });
    }
  }
}

function byteAggregate(db, table) {
  const aggregate = db.prepare(`
    SELECT COUNT(*) AS count,
      COALESCE(SUM(upload_bytes), 0) AS upload_bytes,
      COALESCE(SUM(download_bytes), 0) AS download_bytes,
      COALESCE(SUM(total_bytes), 0) AS total_bytes,
      COALESCE(SUM(CASE WHEN
        typeof(upload_bytes) != 'integer' OR upload_bytes < 0 OR
        typeof(download_bytes) != 'integer' OR download_bytes < 0 OR
        typeof(total_bytes) != 'integer' OR total_bytes < 0
      THEN 1 ELSE 0 END), 0) AS invalid_count
    FROM ${table}
  `).get();
  if (aggregate.invalid_count !== 0n) throw new Error("aggregate_invalid");
  return {
    count: safeCount(aggregate.count),
    uploadBytes: aggregate.upload_bytes.toString(),
    downloadBytes: aggregate.download_bytes.toString(),
    totalBytes: aggregate.total_bytes.toString()
  };
}

function readDatabaseEvidence(filePath, nowMs) {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    db.defaultSafeIntegers(true);
    db.function("recovery_timestamp_ms", { deterministic: true }, timestampMs);
    return db.transaction(() => {
      assertSchema(db);
      const cursors = db.prepare(`
        SELECT COUNT(*) AS count,
          COALESCE(SUM(CASE WHEN timestamp_ms IS NULL THEN 1 ELSE 0 END), 0) AS invalid_count,
          COALESCE(SUM(CASE WHEN timestamp_ms > ? THEN 1 ELSE 0 END), 0) AS future_count,
          COALESCE(SUM(CASE WHEN timestamp_ms < ? THEN 1 ELSE 0 END), 0) AS stale_count,
          MIN(timestamp_ms) AS oldest_ms, MAX(timestamp_ms) AS newest_ms
        FROM (SELECT recovery_timestamp_ms(observed_at) AS timestamp_ms FROM platform_usage_counter_cursors)
      `).get(nowMs, nowMs - STALE_AFTER_SECONDS * 1000);
      const samples = byteAggregate(db, "platform_usage_samples");
      const rollups = byteAggregate(db, "platform_usage_rollups");
      return {
        cursorEvidence: {
          count: safeCount(cursors.count),
          staleAfterSeconds: STALE_AFTER_SECONDS,
          staleCount: safeCount(cursors.stale_count),
          invalidTimestampCount: safeCount(cursors.invalid_count),
          futureTimestampCount: safeCount(cursors.future_count),
          oldestObservedAt: cursors.oldest_ms === null ? null : new Date(Number(cursors.oldest_ms)).toISOString(),
          newestObservedAt: cursors.newest_ms === null ? null : new Date(Number(cursors.newest_ms)).toISOString()
        },
        accountingEvidence: {
          samples, rollups,
          byteSumsEqual: ["uploadBytes", "downloadBytes", "totalBytes"].every((key) => samples[key] === rollups[key]),
          scope: "all_sources_aggregate",
          aggregateEqualityProvesCollectionHealth: false
        }
      };
    })();
  } finally {
    db.close();
  }
}

// This is evidence collection only. It never admits a first production run,
// initializes business stores, advances cursors, clears counters or writes status.
export function runTrafficUsageRecoveryPreflight({ env = {}, nowFn = () => new Date() } = {}) {
  const result = {
    type: "traffic_usage_recovery_preflight",
    ok: false,
    status: "requires_review",
    productionCollectionAuthorized: false,
    observedAt: null,
    statusEvidence: null,
    cursorEvidence: null,
    accountingEvidence: null,
    errorCode: null,
    reviewReasons: ["first_collection_policy_required"],
    safety: { redacted: true, summaryOnly: true, databaseReadOnly: true, businessRuntimeInitialized: false, productionCollectionAuthorized: false }
  };
  let nowMs;
  try {
    const now = nowFn();
    const normalized = now instanceof Date ? now.toISOString() : now;
    nowMs = timestampMs(normalized);
    if (nowMs === null) throw new Error("clock_invalid");
    result.observedAt = new Date(nowMs).toISOString();
  } catch {
    result.errorCode = "recovery_clock_invalid";
    return result;
  }
  const dbPath = typeof env.SUBSCRIPTION_CONTROL_DB_PATH === "string" ? env.SUBSCRIPTION_CONTROL_DB_PATH.trim() : "";
  const statusPath = typeof env.EDGE_USAGE_COLLECTOR_STATUS_PATH === "string" ? env.EDGE_USAGE_COLLECTOR_STATUS_PATH.trim() : "";
  if (!dbPath || !statusPath || !isAbsolute(dbPath) || !isAbsolute(statusPath)) {
    result.errorCode = "recovery_paths_required";
    return result;
  }
  result.statusEvidence = readStatusEvidence(statusPath, nowMs);
  try {
    Object.assign(result, readDatabaseEvidence(dbPath, nowMs));
  } catch (error) {
    result.errorCode = error?.recoverySchemaInvalid === true ? "recovery_database_schema_invalid" : "recovery_database_read_failed";
    return result;
  }
  const status = result.statusEvidence;
  if (status.availability !== "available") {
    result.errorCode = "recovery_status_unavailable";
    result.reviewReasons.push("status_unavailable");
  } else {
    result.ok = true;
    if (status.stale) result.reviewReasons.push("status_stale");
    if (status.futureTimestamp) result.reviewReasons.push("status_timestamp_in_future");
    if (!status.runOk || !status.rawReportOk) result.reviewReasons.push("status_run_unsuccessful");
    if (!status.recordingOk) result.reviewReasons.push("status_accounting_unsuccessful");
  }
  if (result.cursorEvidence.staleCount > 0) result.reviewReasons.push("cursors_stale");
  if (result.cursorEvidence.invalidTimestampCount > 0) result.reviewReasons.push("cursor_timestamp_invalid");
  if (result.cursorEvidence.futureTimestampCount > 0) result.reviewReasons.push("cursor_timestamp_in_future");
  if (!result.accountingEvidence.byteSumsEqual) result.reviewReasons.push("accounting_byte_sums_mismatch");
  return result;
}
