import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";

const CUTOFF = "2026-10-16T12:00:00.000Z";
const FUTURE = "9999-12-31T23:59:59.999Z";
const PAIRS = [
  ["local_vless", "full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp"],
  ["local_hy2", "full_metering_hy2_cumulative_v1", "channel-vultr-a-hy2"],
  ["local_tuic", "full_metering_tuic_connections_v1", "channel-vultr-a-tuic"],
  ["sgp_vless", "full_metering_xray_cumulative_v1", "channel-sgp-a-vless-reality-tcp"],
  ["sgp_hy2", "full_metering_hy2_cumulative_v1", "channel-sgp-a-hy2"],
  ["other_sources", "full_metering_xray_cumulative_v1", "channel-vultr-a-vless-reality-tcp-lookalike"]
];

function fixture(t, { samples = [], rollups = [], accounts = [] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-ledger-performance-contract-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "synthetic.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec(`
      create table platform_accounts (id text primary key);
      create table platform_usage_samples (
        account_id text, source_ref text, channel_ref text, observed_at text,
        interval_started_at text, interval_ended_at text, created_at text,
        upload_bytes, download_bytes, total_bytes
      );
      create table platform_usage_rollups (
        account_id text, last_observed_at text, updated_at text,
        upload_bytes, download_bytes, total_bytes
      );
    `);
    db.transaction(() => {
      const accountInsert = db.prepare("insert into platform_accounts values (?)");
      for (const account of accounts) accountInsert.run(account);
      const sampleInsert = db.prepare("insert into platform_usage_samples values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const row of samples) sampleInsert.run(row.account, row.pair[1], row.pair[2],
        row.at, row.at, row.at, row.at, row.up, row.down, row.up + row.down);
      const rollupInsert = db.prepare("insert into platform_usage_rollups values (?, ?, ?, ?, ?, ?)");
      for (const row of rollups) rollupInsert.run(row.account, row.at, row.at, row.up, row.down, row.up + row.down);
    })();
  } finally { db.close(); }
  return {
    read: (options = {}) => readAdminUsageLedger({ dbPath, cutoff: CUTOFF, ...options }),
    edit: (sql, ...values) => {
      const writable = new Database(dbPath);
      try { writable.prepare(sql).run(...values); } finally { writable.close(); }
    }
  };
}

function sample(overrides = {}) {
  return { account: "synthetic-account", pair: PAIRS[0], at: FUTURE, up: 1n, down: 2n, ...overrides };
}

function assertFailure(action, code, context) {
  assert.throws(action, (error) => {
    assert.equal(error.code, code, context);
    assert.equal(error.message, "Admin usage ledger unavailable", context);
    assert.equal(Object.hasOwn(error, "cause"), false, context);
    return true;
  }, context);
}

function sums(rows) {
  const up = rows.reduce((sum, row) => sum + row.up, 0n);
  const down = rows.reduce((sum, row) => sum + row.down, 0n);
  return { uploadBytes: up.toString(), downloadBytes: down.toString(), totalBytes: (up + down).toString() };
}

function metrics(rows) {
  const bytes = sums(rows);
  return {
    state: rows.length === 0 ? "not_collected" : bytes.totalBytes === "0" ? "measured_zero" : "measured",
    sampleCount: rows.length,
    positiveAccountCount: new Set(rows.filter((row) => row.up + row.down > 0n).map((row) => row.account)).size,
    ...bytes,
    latestObservedAt: rows.length ? rows.map((row) => row.at).sort().at(-1) : null
  };
}

// An independent, bounded JS oracle keeps query changes accountable for every
// returned metric without depending on timing, query text or a Git checkout.
function reference({ samples, rollups, accounts }, cutoff) {
  const end = Date.parse(cutoff);
  const ranges = [
    ["all_time", null],
    ["last_24h", new Date(end - 86_400_000).toISOString()],
    ["last_7d", new Date(end - 604_800_000).toISOString()],
    ["month_to_date", `${cutoff.slice(0, 7)}-01T00:00:00.000Z`]
  ];
  const windows = ranges.map(([id, from]) => {
    const rows = samples.filter((row) => Date.parse(row.at) < end
      && (from === null || Date.parse(row.at) >= Date.parse(from)));
    return {
      id, from, to: cutoff, ...metrics(rows),
      sources: PAIRS.map(([category]) => ({ category, ...metrics(rows.filter((row) => row.pair[0] === category)) }))
    };
  });
  const sampleTotals = sums(samples);
  const rollupTotals = sums(rollups);
  const differenceBytes = Object.fromEntries(Object.keys(sampleTotals).map((key) =>
    [key, (BigInt(sampleTotals[key]) - BigInt(rollupTotals[key])).toString()]));
  const known = new Set(accounts);
  const orphanCount = (rows) => new Set(rows.filter((row) => !known.has(row.account)).map((row) => row.account)).size;
  return {
    windows,
    reconciliation: {
      scope: "entire_database_snapshot", aggregateOnly: true,
      state: Object.values(differenceBytes).every((value) => value === "0") ? "totals_match" : "totals_mismatch",
      samples: { sampleCount: samples.length, ...sampleTotals },
      rollups: { rollupCount: rollups.length, ...rollupTotals },
      differenceBytes,
      futureSampleCount: samples.filter((row) => Date.parse(row.at) > end).length,
      atCutoffSampleCount: samples.filter((row) => Date.parse(row.at) === end).length,
      orphanSampleAccountCount: orphanCount(samples),
      orphanRollupAccountCount: orphanCount(rollups)
    }
  };
}

for (const seed of [17, 0x19ab32]) {
  test(`all aggregate fields match an independent synthetic reference (seed ${seed})`, (t) => {
    let state = seed;
    const random = (limit) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % limit;
    };
    const accounts = ["known-a", "known-b", "known-c", "zero-only"];
    const population = [...accounts, "orphan-a", "orphan-b"];
    const at = ["0000-02-29T00:00:00.000Z", "2026-09-30T23:59:59.999Z", "2026-10-01T00:00:00.000Z",
      "2026-10-09T11:59:59.999Z", "2026-10-09T12:00:00.000Z", "2026-10-15T11:59:59.999Z",
      "2026-10-15T12:00:00.000Z", "2026-10-16T11:59:59.999Z", CUTOFF, "2026-10-16T12:00:00.001Z", FUTURE];
    const samples = Array.from({ length: 96 }, (_, index) => {
      const account = population[random(population.length)];
      return sample({ account, pair: PAIRS[index % PAIRS.length], at: at[index % at.length],
        up: account === "zero-only" ? 0n : BigInt(random(10_000)),
        down: account === "zero-only" ? 0n : BigInt(random(10_000)) });
    });
    // The same positive account in every category must count once globally.
    for (const pair of PAIRS) samples.push(sample({ account: "known-a", pair, at: "2026-10-16T11:00:00.000Z" }));
    samples.push(sample({ account: "known-b", at: "2026-10-16T11:00:00.000Z", up: 9_007_199_254_740_993n, down: 7n }));
    const rollups = Array.from({ length: 12 }, (_, index) => sample({
      account: population[index % population.length], at: at[index % at.length],
      up: BigInt(random(100_000)), down: BigInt(random(100_000))
    }));
    const data = { accounts, samples, rollups };
    const f = fixture(t, data);
    for (const cutoff of [CUTOFF, "2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]) {
      const result = f.read({ cutoff });
      const expected = reference(data, cutoff);
      assert.deepEqual(result.windows, expected.windows, cutoff);
      assert.deepEqual(result.reconciliation, expected.reconciliation, cutoff);
    }
  });
}

const DATE_FIELDS = [
  ["platform_usage_samples", "observed_at"],
  ["platform_usage_samples", "interval_started_at"],
  ["platform_usage_samples", "interval_ended_at"],
  ["platform_usage_samples", "created_at"],
  ["platform_usage_rollups", "last_observed_at"],
  ["platform_usage_rollups", "updated_at"]
];
const INVALID_DATES = [
  null, 0n, 20261016n, Buffer.from(CUTOFF), "", " ",
  "1900-02-29T00:00:00.000Z", "2025-02-29T00:00:00.000Z", "2024-02-30T00:00:00.000Z",
  "9999-02-29T00:00:00.000Z", "2026-04-31T00:00:00.000Z", "2026-00-01T00:00:00.000Z",
  "2026-13-01T00:00:00.000Z", "2026-01-00T00:00:00.000Z", "2026-01-32T00:00:00.000Z",
  "2026-10-16T24:00:00.000Z", "2026-10-16T23:60:00.000Z", "2026-10-16T23:59:60.000Z",
  "2026-10-16T12:00:00Z", "2026-10-16T12:00:00.0Z", "2026-10-16T12:00:00.00Z", "2026-10-16T12:00:00.0000Z",
  "2026-10-16T12:00:00.000+00:00", "2026-10-16T12:00:00.000-00:00", "2026-10-16T13:00:00.000+01:00",
  "2026-10-16 12:00:00.000Z", "2026-10-16t12:00:00.000Z", "2026-10-16T12:00:00.000z",
  "+002026-10-16T12:00:00.000Z", "-000001-10-16T12:00:00.000Z", "026-10-16T12:00:00.000Z",
  ` ${CUTOFF}`, `${CUTOFF} `, `${CUTOFF}\n`, `${CUTOFF}\0`, "２０２６-10-16T12:00:00.000Z"
];

for (const [table, field] of DATE_FIELDS) {
  test(`${table}.${field} rejects noncanonical dates even outside every window`, (t) => {
    const f = fixture(t, { samples: [sample()], rollups: [sample()] });
    for (const value of INVALID_DATES) {
      f.edit(`update ${table} set ${field} = ?`, value);
      assertFailure(() => f.read(), "invalid_source_data", `${field}: ${String(value)}`);
    }
  });
}

test("canonical proleptic Gregorian dates remain valid across all stored timestamp fields", (t) => {
  const dates = ["0000-02-29T00:00:00.000Z", "0099-01-31T23:59:59.999Z", "1900-02-28T00:00:00.000Z",
    "2000-02-29T00:00:00.000Z", "2024-02-29T00:00:00.000Z", "2026-04-30T23:59:59.999Z", FUTURE];
  const samples = dates.map((at) => sample({ at }));
  const data = { samples, rollups: samples, accounts: ["synthetic-account"] };
  const result = fixture(t, data).read();
  const expected = reference(data, CUTOFF);
  assert.deepEqual(result.windows, expected.windows);
  assert.deepEqual(result.reconciliation, expected.reconciliation);
});

test("cutoff date validation preserves early-year and century arithmetic", (t) => {
  const f = fixture(t);
  for (const [cutoff, day, week] of [
    ["0000-01-08T00:00:00.000Z", "0000-01-07T00:00:00.000Z", "0000-01-01T00:00:00.000Z"],
    ["0099-03-01T00:00:00.000Z", "0099-02-28T00:00:00.000Z", "0099-02-22T00:00:00.000Z"],
    ["1900-03-01T00:00:00.000Z", "1900-02-28T00:00:00.000Z", "1900-02-22T00:00:00.000Z"],
    ["2000-03-01T00:00:00.000Z", "2000-02-29T00:00:00.000Z", "2000-02-23T00:00:00.000Z"],
    [FUTURE, "9999-12-30T23:59:59.999Z", "9999-12-24T23:59:59.999Z"]
  ]) {
    const result = f.read({ cutoff });
    assert.equal(result.windows.find((window) => window.id === "last_24h").from, day);
    assert.equal(result.windows.find((window) => window.id === "last_7d").from, week);
    assert.equal(result.windows.find((window) => window.id === "month_to_date").from, `${cutoff.slice(0, 7)}-01T00:00:00.000Z`);
  }
  for (const cutoff of [...INVALID_DATES, "0000-01-01T00:00:00.000Z", "0000-01-07T23:59:59.999Z"]) {
    assertFailure(() => f.read({ cutoff }), "invalid_query", String(cutoff));
  }
});

test("required text and byte validation includes future-only rows and the account table", (t) => {
  for (const [table, fields] of [
    ["platform_usage_samples", ["account_id", "source_ref", "channel_ref"]],
    ["platform_usage_rollups", ["account_id"]],
    ["platform_accounts", ["id"]]
  ]) {
    for (const field of fields) {
      const f = fixture(t, { accounts: ["synthetic-account"], samples: [sample()], rollups: [sample()] });
      for (const value of [null, "", Buffer.from("synthetic")]) {
        f.edit(`update ${table} set ${field} = ?`, value);
        assertFailure(() => f.read(), "invalid_source_data", `${table}.${field}`);
      }
    }
  }
  for (const field of ["upload_bytes", "download_bytes", "total_bytes"]) {
    const f = fixture(t, { samples: [sample()] });
    for (const value of [null, -1n, "3", 1.5, Buffer.from("3")]) {
      f.edit(`update platform_usage_samples set ${field} = ?`, value);
      assertFailure(() => f.read(), "invalid_source_data", field);
    }
  }
  const reversed = fixture(t, { samples: [sample()] });
  reversed.edit("update platform_usage_samples set interval_started_at = ?, interval_ended_at = ?", FUTURE, CUTOFF);
  assertFailure(() => reversed.read(), "invalid_source_data");
});

test("full-snapshot overflow cannot disappear when every overflowing row is outside the windows", (t) => {
  const f = fixture(t, { samples: [
    sample({ pair: PAIRS[0], at: CUTOFF, up: 9_223_372_036_854_775_807n, down: 0n }),
    sample({ pair: PAIRS[1], at: FUTURE, up: 0n, down: 1n })
  ] });
  assertFailure(() => f.read(), "integer_overflow");
});

test("budget and whole-snapshot validation retain their error precedence over aggregation", (t) => {
  const f = fixture(t, {
    accounts: ["known-a", "known-b", "known-c"],
    samples: [sample({ up: 9_223_372_036_854_775_807n, down: 0n }), sample({ up: 1n, down: 0n })],
    rollups: [sample()]
  });
  f.edit("update platform_usage_rollups set updated_at = ?", "invalid");
  assertFailure(() => f.read({ scanLimit: 2 }), "scan_limit_exceeded");
  assertFailure(() => f.read({ scanLimit: 3 }), "invalid_source_data");
  f.edit("update platform_usage_rollups set updated_at = ?", FUTURE);
  assertFailure(() => f.read({ scanLimit: 3 }), "integer_overflow");
});

test("timestamp validation crosses from SQLite to JS at most once per sample or rollup", (t) => {
  const f = fixture(t, { samples: [sample(), sample()], rollups: [sample(), sample()] });
  let calls = 0;
  const register = Database.prototype.function;
  t.mock.method(Database.prototype, "function", function (name, options, callback) {
    // A proxy preserves the function arity used by SQLite; count real calls,
    // not SQL text or timing. No changes to the production query API.
    return register.call(this, name, options, new Proxy(callback, {
      apply(target, thisArg, args) {
        calls += 1;
        return Reflect.apply(target, thisArg, args);
      }
    }));
  });
  const result = f.read();
  assert.equal(result.reconciliation.samples.sampleCount, 2);
  assert.equal(result.reconciliation.rollups.rollupCount, 2);
  assert.ok(calls <= 4, `Expected at most four validation callbacks, got ${calls}`);
});
