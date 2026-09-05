import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { buildTrafficCollectorAdminProjection } from "../services/platform/traffic-collector-admin-projection.mjs";
import { runTrafficUsageRecoveryPreflight } from "../../scripts/lib/traffic-usage-recovery-preflight.mjs";

const NOW = "2026-09-05T12:00:00.000Z";
const OLD = "2026-08-01T12:00:00.000Z";

function fixture(t, { cursorDates = [OLD], statusDate = OLD, unequal = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "traffic-recovery-preflight-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "control.sqlite");
  const statusPath = join(directory, "status.json");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE platform_usage_counter_cursors (
      source_ref TEXT, channel_ref TEXT, edge_credential_ref TEXT,
      upload_bytes INTEGER, download_bytes INTEGER, observed_at TEXT,
      epoch INTEGER, updated_at TEXT
    );
    CREATE TABLE platform_usage_samples (
      id TEXT, observed_at TEXT, upload_bytes INTEGER, download_bytes INTEGER, total_bytes INTEGER
    );
    CREATE TABLE platform_usage_rollups (
      edge_credential_ref TEXT, last_observed_at TEXT,
      upload_bytes INTEGER, download_bytes INTEGER, total_bytes INTEGER
    );
  `);
  for (const [index, observedAt] of cursorDates.entries()) {
    db.prepare("INSERT INTO platform_usage_counter_cursors VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("private-source", "private-channel", `private-credential-${index}`, 10, 20, observedAt, 0, NOW);
  }
  db.prepare("INSERT INTO platform_usage_samples VALUES (?, ?, ?, ?, ?)").run("private-sample", NOW, 10, 20, 30);
  db.prepare("INSERT INTO platform_usage_rollups VALUES (?, ?, ?, ?, ?)").run("private-credential", NOW, 10, unequal ? 21 : 20, unequal ? 31 : 30);
  db.close();
  const projection = buildTrafficCollectorAdminProjection({
    observedAt: statusDate,
    summary: {
      type: "traffic_usage_collect_once", ok: true, rawReportOk: true,
      collectorCount: 1, observationCount: 1, recordedCount: 1, insertedCount: 1, unresolvedCount: 0,
      reports: [{
        collectorState: {
          health: "healthy", condition: "ok", sourceRef: "private-source", channelRef: "private-channel",
          lastCollectorSuccessAt: statusDate, observationCount: 1, unresolvedCount: 0
        }
      }]
    }
  });
  writeFileSync(statusPath, JSON.stringify(projection));
  return {
    directory, dbPath, statusPath,
    env: { SUBSCRIPTION_CONTROL_DB_PATH: dbPath, EDGE_USAGE_COLLECTOR_STATUS_PATH: statusPath }
  };
}

function inspect(f, env = f.env) {
  const result = runTrafficUsageRecoveryPreflight({ env, nowFn: () => new Date(NOW) });
  assert.equal(result.status, "requires_review");
  assert.equal(result.productionCollectionAuthorized, false);
  const text = JSON.stringify(result);
  for (const sensitive of [f.directory, f.dbPath, f.statusPath, "private-source", "private-channel", "private-credential", "private-sample", "injected-secret"]) {
    assert.equal(text.includes(sensitive), false, `redacts ${sensitive}`);
  }
  return result;
}

function fileIdentity(path) {
  return {
    hash: createHash("sha256").update(readFileSync(path)).digest("hex"),
    mtimeMs: statSync(path).mtimeMs
  };
}

test("preflight leaves live WAL business data unchanged and the writer can continue", (t) => {
  const f = fixture(t);
  const writer = new Database(f.dbPath);
  try {
    writer.pragma("journal_mode = WAL");
    writer.exec("UPDATE platform_usage_counter_cursors SET epoch = 1");
    assert.equal(existsSync(`${f.dbPath}-wal`), true);
    assert.equal(existsSync(`${f.dbPath}-shm`), true);
    const before = {
      main: fileIdentity(f.dbPath), wal: fileIdentity(`${f.dbPath}-wal`),
      rows: writer.prepare("SELECT * FROM platform_usage_counter_cursors").all()
    };
    const result = inspect(f);
    assert.equal(result.ok, true);
    assert.equal(result.cursorEvidence.staleCount, 1);
    assert.deepEqual(fileIdentity(f.dbPath), before.main);
    assert.deepEqual(fileIdentity(`${f.dbPath}-wal`), before.wal);
    assert.deepEqual(writer.prepare("SELECT * FROM platform_usage_counter_cursors").all(), before.rows);
    // SQLite read locks/shared-memory bookkeeping are not a claim of zero
    // filesystem effects. This probe promises no business-data/schema writes.
    writer.exec("UPDATE platform_usage_counter_cursors SET epoch = 2");
    assert.equal(writer.prepare("SELECT epoch FROM platform_usage_counter_cursors").get().epoch, 2);
  } finally {
    writer.close();
  }
});

function schema(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try { return db.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY name").all(); }
  finally { db.close(); }
}

test("recovery preflight reads old cursors and aggregate accounting without altering files or schema", (t) => {
  const f = fixture(t);
  const before = { db: fileIdentity(f.dbPath), status: fileIdentity(f.statusPath), schema: schema(f.dbPath), files: readdirSync(f.directory) };
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.observedAt, NOW);
  assert.equal(result.statusEvidence.observedAt, OLD);
  assert.equal(result.statusEvidence.ageSeconds, 35 * 86400);
  assert.equal(result.statusEvidence.stale, true);
  assert.equal(result.cursorEvidence.count, 1);
  assert.equal(result.cursorEvidence.staleCount, 1);
  assert.equal(result.cursorEvidence.oldestObservedAt, OLD);
  assert.equal(result.cursorEvidence.newestObservedAt, OLD);
  assert.equal(result.accountingEvidence.samples.count, 1);
  assert.equal(result.accountingEvidence.samples.totalBytes, "30");
  assert.equal(result.accountingEvidence.rollups.totalBytes, "30");
  assert.equal(result.accountingEvidence.byteSumsEqual, true);
  assert.deepEqual({ db: fileIdentity(f.dbPath), status: fileIdentity(f.statusPath), schema: schema(f.dbPath), files: readdirSync(f.directory) }, before);
});

test("fresh successful evidence never authorizes production collection", (t) => {
  const f = fixture(t, { cursorDates: [NOW], statusDate: NOW });
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.statusEvidence.stale, false);
  assert.equal(result.statusEvidence.runOk, true);
  assert.equal(result.statusEvidence.rawReportOk, true);
  assert.equal(result.statusEvidence.recordingOk, true);
  assert.equal(result.cursorEvidence.staleCount, 0);
  assert.ok(result.reviewReasons.includes("first_collection_policy_required"));
});

test("cursor boundaries distinguish stale, exact threshold, invalid, and future timestamps", (t) => {
  const f = fixture(t, { cursorDates: [OLD, "2026-09-05T11:45:00.000Z", "2026-09-05T11:44:59.999Z", "injected-secret", "2026-09-06T12:00:00.000Z"] });
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.cursorEvidence.count, 5);
  assert.equal(result.cursorEvidence.staleCount, 2);
  assert.equal(result.cursorEvidence.invalidTimestampCount, 1);
  assert.equal(result.cursorEvidence.futureTimestampCount, 1);
});

test("missing DB is not created and its path is not disclosed", (t) => {
  const f = fixture(t);
  const missingPath = join(f.directory, "missing-injected-secret.sqlite");
  const result = inspect(f, { ...f.env, SUBSCRIPTION_CONTROL_DB_PATH: missingPath });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "recovery_database_read_failed");
  assert.equal(existsSync(missingPath), false);
});

test("missing configured paths fail closed without defaulting to business stores", (t) => {
  const f = fixture(t);
  for (const env of [{}, { SUBSCRIPTION_CONTROL_DB_PATH: f.dbPath }, { EDGE_USAGE_COLLECTOR_STATUS_PATH: f.statusPath }]) {
    const result = inspect(f, env);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "recovery_paths_required");
  }
});

test("malformed and missing status preserve database evidence without synthesizing success", (t) => {
  const f = fixture(t);
  for (const mode of ["malformed", "missing"]) {
    if (mode === "malformed") writeFileSync(f.statusPath, "injected-secret");
    else rmSync(f.statusPath);
    const result = inspect(f);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "recovery_status_unavailable");
    assert.equal(result.statusEvidence.availability, mode === "malformed" ? "invalid_observation" : "not_observed");
    assert.equal(result.statusEvidence.observedAt, null);
    assert.equal(result.statusEvidence.runOk, null);
    assert.equal(result.cursorEvidence.count, 1);
    assert.equal(existsSync(f.statusPath), mode === "malformed");
  }
});

test("future status timestamps require review without being presented as fresh", (t) => {
  const f = fixture(t, { statusDate: "2026-09-06T12:00:00.000Z" });
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.statusEvidence.futureTimestamp, true);
  assert.ok(result.reviewReasons.includes("status_timestamp_in_future"));
});

test("accounting aggregates report mismatch even when status claims success", (t) => {
  const f = fixture(t, { unequal: true });
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.accountingEvidence.byteSumsEqual, false);
  assert.ok(result.reviewReasons.includes("accounting_byte_sums_mismatch"));
});

test("byte aggregates preserve integers above the JavaScript safe integer limit", (t) => {
  const f = fixture(t);
  const db = new Database(f.dbPath);
  const bytes = 9_007_199_254_740_993n;
  for (const table of ["platform_usage_samples", "platform_usage_rollups"]) {
    db.prepare(`UPDATE ${table} SET upload_bytes = ?, download_bytes = 0, total_bytes = ?`).run(bytes, bytes);
  }
  db.close();
  const result = inspect(f);
  assert.equal(result.ok, true);
  assert.equal(result.accountingEvidence.samples.totalBytes, "9007199254740993");
  assert.equal(result.accountingEvidence.byteSumsEqual, true);
});

test("malformed database produces only a fixed redacted error code", (t) => {
  const f = fixture(t);
  writeFileSync(f.dbPath, "injected-secret is not a database");
  const before = fileIdentity(f.dbPath);
  const result = inspect(f);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "recovery_database_read_failed");
  assert.deepEqual(fileIdentity(f.dbPath), before);
});

test("missing tables and unexpected required column types fail schema validation", (t) => {
  for (const sql of [
    "DROP TABLE platform_usage_rollups",
    "DROP TABLE platform_usage_counter_cursors; CREATE TABLE platform_usage_counter_cursors (observed_at INTEGER)",
    "DROP TABLE platform_usage_rollups; CREATE VIEW platform_usage_rollups AS SELECT upload_bytes, download_bytes, total_bytes FROM platform_usage_samples"
  ]) {
    const f = fixture(t);
    const db = new Database(f.dbPath);
    db.exec(sql);
    db.close();
    const before = fileIdentity(f.dbPath);
    const result = inspect(f);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "recovery_database_schema_invalid");
    assert.deepEqual(fileIdentity(f.dbPath), before);
  }
});

test("invalid clock fails closed with no raw exception text", (t) => {
  const f = fixture(t);
  const result = runTrafficUsageRecoveryPreflight({ env: f.env, nowFn: () => { throw new Error("injected-secret"); } });
  assert.equal(result.ok, false);
  assert.equal(result.status, "requires_review");
  assert.equal(result.productionCollectionAuthorized, false);
  assert.equal(result.errorCode, "recovery_clock_invalid");
  assert.equal(JSON.stringify(result).includes("injected-secret"), false);
});
