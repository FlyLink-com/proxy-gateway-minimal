import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";

const CUTOFF = "2026-10-16T12:00:00.000Z";
const VLESS = ["full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp"];
const HY2 = ["full_metering_hy2_cumulative_v1", "channel-vultr-a-hy2"];
const TUIC = ["full_metering_tuic_connections_v1", "channel-vultr-a-tuic"];
const PRIVATE = "private-synthetic-account-do-not-return";

function fixture(t, setup = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-usage-ledger-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "control.sqlite");
  const db = new Database(dbPath);
  db.exec(`
    create table platform_accounts (id text primary key);
    create table platform_usage_samples (
      id text primary key, source_ref text, channel_ref text,
      edge_credential_ref text, account_id text, entitlement_id text, request_id text,
      observed_at text, interval_started_at text, interval_ended_at text,
      upload_bytes, download_bytes, total_bytes, sample_digest text, created_at text
    );
    create table platform_usage_rollups (
      edge_credential_ref text primary key, account_id text, entitlement_id text,
      request_id text, channel_ref text, upload_bytes, download_bytes, total_bytes,
      last_observed_at text, updated_at text
    );
  `);
  let serial = 0;
  const addAccount = (id = PRIVATE) => db.prepare("insert or ignore into platform_accounts (id) values (?)").run(id);
  const addSample = ({ account = PRIVATE, at = "2026-10-16T11:00:00.000Z", pair = VLESS,
    up = 1n, down = 2n, total = BigInt(up) + BigInt(down), created = at } = {}) => {
    serial += 1;
    db.prepare(`insert into platform_usage_samples values
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(`private-sample-${serial}`, pair[0], pair[1], `private-credential-${serial}`,
        account, "private-entitlement", "private-request", at, at, at,
        up, down, total, `private-digest-${serial}`, created);
  };
  const addRollup = ({ account = PRIVATE, up = 1n, down = 2n,
    total = BigInt(up) + BigInt(down), at = "2026-10-16T11:00:00.000Z" } = {}) => {
    serial += 1;
    db.prepare("insert into platform_usage_rollups values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(`private-rollup-${serial}`, account, "private-entitlement", "private-request",
        VLESS[1], up, down, total, at, at);
  };
  try { setup({ db, addAccount, addSample, addRollup }); } finally { db.close(); }
  return { dbPath, directory, read: (options = {}) => readAdminUsageLedger({ dbPath, cutoff: CUTOFF, ...options }) };
}

function windowOf(result, id) {
  return result.windows.find((window) => window.id === id);
}

function assertSafeError(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.message, "Admin usage ledger unavailable");
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
}

test("four windows share one cutoff, deduplicate positive accounts and use observation time", (t) => {
  const f = fixture(t, ({ addAccount, addSample, addRollup }) => {
    addAccount(); addAccount("second-private-account");
    addSample({ at: "2026-09-30T23:59:59.999Z", up: 1n, down: 0n });
    addSample({ at: "2026-10-01T00:00:00.000Z", up: 2n, down: 0n });
    addSample({ at: "2026-10-09T11:59:59.999Z", up: 4n, down: 0n });
    addSample({ at: "2026-10-09T12:00:00.000Z", up: 8n, down: 0n });
    addSample({ at: "2026-10-15T11:59:59.999Z", up: 16n, down: 0n });
    addSample({ at: "2026-10-15T12:00:00.000Z", up: 32n, down: 0n });
    addSample({ account: "second-private-account", at: "2026-10-16T11:59:59.999Z", up: 64n, down: 0n,
      created: "2025-01-01T00:00:00.000Z" });
    addSample({ account: "zero-private-account", up: 0n, down: 0n });
    addSample({ at: CUTOFF, up: 128n, down: 0n });
    addSample({ at: "2026-10-17T00:00:00.000Z", up: 256n, down: 0n });
    addRollup({ up: 511n, down: 0n });
  });
  const result = f.read();
  assert.equal(result.schemaVersion, "admin-usage-ledger/v1");
  assert.equal(result.cutoff, CUTOFF);
  assert.equal(result.timezone, "UTC");
  assert.equal(result.unit, "bytes");
  assert.deepEqual(result.windows.map(({ id, from, to, totalBytes, sampleCount, positiveAccountCount }) =>
    ({ id, from, to, totalBytes, sampleCount, positiveAccountCount })), [
    { id: "all_time", from: null, to: CUTOFF, totalBytes: "127", sampleCount: 8, positiveAccountCount: 2 },
    { id: "last_24h", from: "2026-10-15T12:00:00.000Z", to: CUTOFF, totalBytes: "96", sampleCount: 3, positiveAccountCount: 2 },
    { id: "last_7d", from: "2026-10-09T12:00:00.000Z", to: CUTOFF, totalBytes: "120", sampleCount: 5, positiveAccountCount: 2 },
    { id: "month_to_date", from: "2026-10-01T00:00:00.000Z", to: CUTOFF, totalBytes: "126", sampleCount: 7, positiveAccountCount: 2 }
  ]);
  assert.equal(windowOf(result, "all_time").latestObservedAt, "2026-10-16T11:59:59.999Z");
  assert.equal(result.reconciliation.samples.totalBytes, "511");
  assert.equal(result.reconciliation.rollups.totalBytes, "511");
  assert.equal(result.reconciliation.state, "totals_match");
  assert.equal(result.reconciliation.scope, "entire_database_snapshot");
  assert.equal(result.reconciliation.aggregateOnly, true);
  assert.equal(result.reconciliation.futureSampleCount, 1);
  assert.equal(result.reconciliation.atCutoffSampleCount, 1);
});

test("UTC month rollover and leap-day windows retain exact half-open boundaries", (t) => {
  const f = fixture(t, ({ addAccount, addSample }) => {
    addAccount();
    addSample({ at: "2024-02-29T00:00:00.000Z" });
    addSample({ at: "2024-02-29T23:59:59.999Z" });
    addSample({ at: "2024-03-01T00:00:00.000Z" });
  });
  const result = f.read({ cutoff: "2024-03-01T00:00:00.000Z" });
  assert.equal(windowOf(result, "last_24h").sampleCount, 2);
  assert.equal(windowOf(result, "last_24h").from, "2024-02-29T00:00:00.000Z");
  assert.equal(windowOf(result, "month_to_date").state, "not_collected");
  assert.equal(windowOf(result, "month_to_date").sampleCount, 0);
});

test("exact source/channel pairs classify all data without leaking private values", (t) => {
  const f = fixture(t, ({ addAccount, addSample }) => {
    addAccount();
    for (const pair of [VLESS, HY2, TUIC, [VLESS[0], "channel-sgp-a-vless-reality-tcp"],
      ["private-source-marker", HY2[1]], [VLESS[0], `${VLESS[1]}-lookalike`]]) addSample({ pair });
  });
  const result = f.read();
  const all = windowOf(result, "all_time");
  assert.deepEqual(all.sources.map(({ category, sampleCount, totalBytes }) => ({ category, sampleCount, totalBytes })), [
    { category: "local_vless", sampleCount: 1, totalBytes: "3" },
    { category: "local_hy2", sampleCount: 1, totalBytes: "3" },
    { category: "local_tuic", sampleCount: 1, totalBytes: "3" },
    { category: "sgp_vless", sampleCount: 1, totalBytes: "3" },
    { category: "sgp_hy2", sampleCount: 0, totalBytes: "0" },
    { category: "other_sources", sampleCount: 2, totalBytes: "6" }
  ]);
  assert.equal(all.totalBytes, "18");
  assert.equal(all.positiveAccountCount, 1);
  assert.equal(all.sources.reduce((sum, source) => sum + BigInt(source.totalBytes), 0n), 18n);
  const serialized = JSON.stringify(result);
  for (const forbidden of [PRIVATE, "private-source-marker", "private-credential", "private-request", "private-entitlement", "private-digest", "channel-", "full_metering_", f.dbPath]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("empty and measured-zero ledgers stay distinct with explicit coverage limits", (t) => {
  const empty = fixture(t).read();
  for (const window of empty.windows) {
    assert.equal(window.state, "not_collected");
    assert.equal(window.totalBytes, "0");
    assert.equal(window.latestObservedAt, null);
    assert.equal(window.positiveAccountCount, 0);
    assert.equal(window.sources.length, 6);
  }
  const zero = fixture(t, ({ addAccount, addSample }) => { addAccount(); addSample({ up: 0n, down: 0n }); }).read();
  assert.equal(windowOf(zero, "all_time").state, "measured_zero");
  assert.equal(windowOf(zero, "all_time").positiveAccountCount, 0);
  assert.equal(empty.coverage.customerClassification, "not_available");
  assert.equal(empty.coverage.thirdPartyUsage, "not_metered_here");
  assert.equal(empty.coverage.missingIntervals, "unknown");
  assert.equal(empty.coverage.collectorHealth, "not_assessed");
  assert.equal(empty.coverage.timestamps, "observation_time_not_commit_time");
});

test("large valid byte integers are exact decimal strings and totals are never added together", (t) => {
  const value = 9_007_199_254_740_993n;
  const result = fixture(t, ({ addAccount, addSample, addRollup }) => {
    addAccount(); addSample({ up: value, down: 6n }); addRollup({ up: value, down: 6n });
  }).read();
  assert.equal(windowOf(result, "all_time").totalBytes, "9007199254740999");
  assert.equal(result.reconciliation.samples.uploadBytes, value.toString());
  assert.equal(result.reconciliation.rollups.totalBytes, "9007199254740999");
  assert.deepEqual(result.reconciliation.differenceBytes, { uploadBytes: "0", downloadBytes: "0", totalBytes: "0" });
});

test("snapshot reconciliation reports signed mismatch and distinct orphan accounts without IDs", (t) => {
  const result = fixture(t, ({ addAccount, addSample, addRollup }) => {
    addAccount();
    addSample({ account: "missing-sample-account", up: 4n, down: 2n });
    addSample({ account: "missing-sample-account", up: 1n, down: 0n });
    addRollup({ account: "missing-rollup-account", up: 9n, down: 0n });
    addRollup({ account: "missing-rollup-account", up: 0n, down: 0n });
  }).read();
  assert.equal(result.reconciliation.state, "totals_mismatch");
  assert.deepEqual(result.reconciliation.differenceBytes, { uploadBytes: "-4", downloadBytes: "2", totalBytes: "-2" });
  assert.equal(result.reconciliation.orphanSampleAccountCount, 1);
  assert.equal(result.reconciliation.orphanRollupAccountCount, 1);
  assert.equal(JSON.stringify(result).includes("missing-"), false);
});

for (const table of ["platform_usage_samples", "platform_usage_rollups", "platform_accounts"]) {
  test(`scan budget is exact and never returns partial totals for ${table}`, (t) => {
    const f = fixture(t, ({ addAccount, addSample, addRollup }) => {
      if (table === "platform_accounts") { addAccount("one"); addAccount("two"); }
      else if (table === "platform_usage_samples") { addSample(); addSample(); }
      else { addRollup(); addRollup(); }
    });
    assert.doesNotThrow(() => f.read({ scanLimit: 2 }));
    assertSafeError(() => f.read({ scanLimit: 1 }), "scan_limit_exceeded");
  });

  test(`budget boundary handles empty through cap+1 rows for ${table}`, (t) => {
    const cap = 3;
    for (const rows of [0, 1, cap - 1, cap, cap + 1]) {
      const f = fixture(t, ({ addAccount, addSample, addRollup }) => {
        for (let index = 0; index < rows; index += 1) {
          if (table === "platform_accounts") addAccount(`synthetic-${index}`);
          else if (table === "platform_usage_samples") addSample();
          else addRollup();
        }
      });
      if (rows > cap) assertSafeError(() => f.read({ scanLimit: cap }), "scan_limit_exceeded");
      else {
        const result = f.read({ scanLimit: cap });
        if (table === "platform_usage_samples") assert.equal(result.reconciliation.samples.sampleCount, rows);
        if (table === "platform_usage_rollups") assert.equal(result.reconciliation.rollups.rollupCount, rows);
      }
    }
  });
}

test("budget probes test for an excess row without a counting coroutine or aggregate", (t) => {
  const f = fixture(t, ({ addAccount, addSample, addRollup }) => {
    addAccount(); addSample(); addRollup();
  });
  const prepare = Database.prototype.prepare;
  const probes = [];
  t.mock.method(Database.prototype, "prepare", function(sql) {
    const statement = prepare.call(this, sql);
    // Both the old bounded COUNT and the replacement existence probe are
    // captured. Inspect actual SQLite opcodes, not wall-clock performance.
    if (/\bfrom platform_(?:usage_samples|usage_rollups|accounts)\b/i.test(sql)
      && /\blimit\s+(?:\?|1\s+offset\s+\?)/i.test(sql) && !/\bwhere\b/i.test(sql)) {
      return { get: (...bindings) => {
        const plan = prepare.call(this, `explain ${sql}`).all(...bindings);
        probes.push({ sql, bindings, opcodes: plan.map(row => row.opcode) });
        return statement.get(...bindings);
      } };
    }
    return statement;
  });
  const result = f.read({ scanLimit: 3 });
  assert.equal(result.reconciliation.samples.sampleCount, 1);
  assert.equal(probes.length, 3, "Check every fixed table in the same snapshot");
  for (const [index, table] of ["platform_usage_samples", "platform_usage_rollups", "platform_accounts"].entries()) {
    const { sql, bindings, opcodes } = probes[index];
    assert.ok(sql.includes(`from ${table}`));
    assert.deepEqual(bindings, [3], "Skip exactly the permitted rows, then look for one excess row");
    assert.match(sql, /\blimit\s+1\s+offset\s+\?/i);
    assert.equal(opcodes.some(opcode => ["AggStep", "AggFinal", "InitCoroutine", "Yield"].includes(opcode)), false,
      "Budget detection must not count or yield each row through an aggregate subquery");
  }
});

test("the last permitted sample is still fully validated instead of being truncated", (t) => {
  const f = fixture(t, ({ addSample }) => {
    addSample(); addSample(); addSample({ at: "9999-12-31T23:59:59.999Z", total: 99n });
  });
  assertSafeError(() => f.read({ scanLimit: 2 }), "scan_limit_exceeded");
  assertSafeError(() => f.read({ scanLimit: 3 }), "invalid_source_data");
});

for (const patch of [
  "upload_bytes = -1", "upload_bytes = 1.5", "upload_bytes = '2'", "upload_bytes = null",
  "download_bytes = x'01'", "total_bytes = 99", "account_id = null", "source_ref = null",
  "observed_at = '2026-02-30T00:00:00.000Z'", "observed_at = '2026-10-16T11:00:00Z'",
  "interval_started_at = 'invalid'", "interval_ended_at = 'invalid'", "created_at = 'invalid'"
]) {
  test(`invalid sample data fails closed: ${patch}`, (t) => {
    const f = fixture(t, ({ db, addSample }) => { addSample(); db.exec(`update platform_usage_samples set ${patch}`); });
    assertSafeError(() => f.read(), "invalid_source_data");
  });
}

for (const patch of ["total_bytes = -1", "upload_bytes = 1.5", "download_bytes = '2'",
  "last_observed_at = 'invalid'", "updated_at = 'invalid'", "account_id = null"]) {
  test(`invalid rollup data fails closed: ${patch}`, (t) => {
    const f = fixture(t, ({ db, addRollup }) => { addRollup(); db.exec(`update platform_usage_rollups set ${patch}`); });
    assertSafeError(() => f.read(), "invalid_source_data");
  });
}

for (const kind of ["sample", "rollup"]) {
  test(`SQLite integer overflow is a safe failure for ${kind} aggregates`, (t) => {
    const f = fixture(t, ({ addSample, addRollup }) => {
      const add = kind === "sample" ? addSample : addRollup;
      add({ up: 9_223_372_036_854_775_807n, down: 0n }); add({ up: 1n, down: 0n });
    });
    assertSafeError(() => f.read(), "integer_overflow");
  });
}

test("invalid query inputs are fixed errors and cannot raise the one-million-row cap", (t) => {
  const f = fixture(t);
  for (const scanLimit of [0, -1, 1.5, "5", 1_000_001, Number.MAX_SAFE_INTEGER]) {
    assertSafeError(() => f.read({ scanLimit }), "invalid_query");
  }
  for (const cutoff of [null, new Date(CUTOFF), "invalid", "2026-02-30T00:00:00.000Z", "2026-10-16T12:00:00Z"]) {
    assertSafeError(() => f.read({ cutoff }), "invalid_query");
  }
  for (const dbPath of [null, "", ":memory:", "relative.sqlite"]) {
    assertSafeError(() => f.read({ dbPath }), "invalid_query");
  }
});

test("missing database is not created and missing table errors reveal no SQL or path", (t) => {
  const f = fixture(t, ({ db }) => db.exec("drop table platform_usage_rollups"));
  assertSafeError(() => f.read(), "source_unavailable");
  const missing = join(f.directory, "missing-private-path.sqlite");
  assertSafeError(() => f.read({ dbPath: missing }), "source_unavailable");
  assert.equal(existsSync(missing), false);
});

test("views and absent columns are rejected instead of executing substitute sources", (t) => {
  const view = fixture(t, ({ db }) => db.exec("drop table platform_usage_samples; create view platform_usage_samples as select 1 as total_bytes"));
  assertSafeError(() => view.read(), "source_unavailable");
  const missing = fixture(t, ({ db }) => db.exec("alter table platform_usage_samples rename column created_at to unexpected"));
  assertSafeError(() => missing.read(), "source_unavailable");
});

test("queries preserve the database bytes and schema and release the read-only connection", (t) => {
  const f = fixture(t, ({ addAccount, addSample, addRollup }) => { addAccount(); addSample(); addRollup(); });
  const hash = () => createHash("sha256").update(readFileSync(f.dbPath)).digest("hex");
  const before = hash();
  for (let run = 0; run < 3; run += 1) f.read();
  assert.equal(hash(), before);
  const db = new Database(f.dbPath);
  try {
    assert.deepEqual(db.prepare("select name from sqlite_schema where type = 'table' order by name").all().map((row) => row.name),
      ["platform_accounts", "platform_usage_rollups", "platform_usage_samples"]);
    db.exec("begin exclusive; rollback");
  } finally { db.close(); }
});
