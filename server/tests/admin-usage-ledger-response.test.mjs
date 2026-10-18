import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { readAdminUsageLedger } from "../services/platform/admin-usage-ledger-query.mjs";
import { validateAdminUsageLedgerResponse } from "../services/platform/admin-usage-ledger-response.mjs";

const CUTOFF = "2026-10-16T12:00:00.000Z";
const AT = "2026-10-16T11:00:00.000Z";
const PRIVATE = "private-synthetic-data-never-return";
const MAX_BYTES = 9223372036854775807n;

function queryFixture(t, { cutoff = CUTOFF, samples = [{ up: 1n, down: 2n }, { up: 3n, other: true }],
  rollups = [{ up: 4n, down: 2n }] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "admin-usage-response-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbPath = join(directory, "synthetic.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec(`
      create table platform_accounts (id text primary key);
      create table platform_usage_samples (
        source_ref text, channel_ref text, account_id text, observed_at text,
        interval_started_at text, interval_ended_at text, created_at text,
        upload_bytes integer, download_bytes integer, total_bytes integer
      );
      create table platform_usage_rollups (
        account_id text, last_observed_at text, updated_at text,
        upload_bytes integer, download_bytes integer, total_bytes integer
      );
    `);
    db.prepare("insert into platform_accounts values (?)").run(PRIVATE);
    for (const { up = 0n, down = 0n, at = AT, other = false } of samples) {
      db.prepare("insert into platform_usage_samples values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(other ? PRIVATE : "full_metering_xray_cumulative_v1",
          other ? PRIVATE : "channel-vultr-a-vless-reality-tcp", PRIVATE,
          at, at, at, at, up, down, up + down);
    }
    for (const { up = 0n, down = 0n, at = AT } of rollups) {
      db.prepare("insert into platform_usage_rollups values (?, ?, ?, ?, ?, ?)")
        .run(PRIVATE, at, at, up, down, up + down);
    }
  } finally { db.close(); }
  return readAdminUsageLedger({ dbPath, cutoff });
}

function assertUnavailable(action) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Admin usage ledger unavailable");
    assert.equal(error.code, "source_unavailable");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.equal(JSON.stringify(error).includes(PRIVATE), false);
    return true;
  });
}

test("response accepts the real aggregate query and projects independent fixed fields", (t) => {
  const source = queryFixture(t);
  const result = validateAdminUsageLedgerResponse(source, CUTOFF);
  assert.deepEqual(result, source);
  assert.notEqual(result, source);
  assert.notEqual(result.windows[0], source.windows[0]);
  assert.notEqual(result.windows[0].sources[0], source.windows[0].sources[0]);
  assert.notEqual(result.reconciliation.samples, source.reconciliation.samples);
  assert.notEqual(result.coverage, source.coverage);
  // One recorded account can occur in multiple source categories.
  assert.equal(result.windows[0].positiveAccountCount, 1);
  assert.equal(result.windows[0].sources.reduce((sum, item) => sum + item.positiveAccountCount, 0), 2);
  assert.equal(JSON.stringify(result).includes(PRIVATE), false);
});

test("response strips extra fields at every object boundary without accessing their values", (t) => {
  const source = queryFixture(t);
  const expected = structuredClone(source);
  const addExtras = (value) => {
    if (!value || typeof value !== "object") return;
    for (const child of Object.values(value)) addExtras(child);
    Object.defineProperty(value, "privateDetail", { enumerable: true, get() { throw new Error(PRIVATE); } });
  };
  addExtras(source);
  const result = validateAdminUsageLedgerResponse(source, CUTOFF);
  assert.deepEqual(result, expected);
  assert.equal(JSON.stringify(result).includes("privateDetail"), false);
});

test("response preserves empty, measured zero, mismatch and exact 64-bit boundary evidence", (t) => {
  for (const options of [
    { samples: [], rollups: [] },
    { samples: [{}], rollups: [] },
    { samples: [{ up: 1n }], rollups: [{ up: 2n }] },
    { samples: [{ up: MAX_BYTES }], rollups: [] },
    { samples: [], rollups: [{ down: MAX_BYTES }] },
    { samples: [{ up: 1n, at: CUTOFF }, { up: 2n, at: "2026-10-17T00:00:00.000Z" }] },
    { cutoff: "2024-03-01T00:00:00.000Z", samples: [{ up: 1n, at: "2024-02-29T23:59:59.999Z" }], rollups: [] }
  ]) {
    const source = queryFixture(t, options);
    assert.deepEqual(validateAdminUsageLedgerResponse(source, options.cutoff ?? CUTOFF), source);
  }
});

test("response requires the exact canonical server-selected cutoff", (t) => {
  const source = queryFixture(t);
  for (const cutoff of [undefined, null, new Date(CUTOFF), "2026-10-16T12:00:00Z",
    "2026-10-16T12:00:00.000+00:00", "2026-10-16T12:00:00.001Z", "2026-02-30T12:00:00.000Z"]) {
    assertUnavailable(() => validateAdminUsageLedgerResponse(source, cutoff));
  }
  for (const value of [undefined, null, false, [], "{}", { ...source, cutoff: "2026-10-16T12:00:00Z" },
    { ...source, error: PRIVATE }]) {
    assertUnavailable(() => validateAdminUsageLedgerResponse(value, CUTOFF));
  }
});

test("response rejects structural, window, category, timestamp and coverage mismatches", (t) => {
  const source = queryFixture(t);
  const mutations = [
    (x) => { x.schemaVersion = "other/v1"; },
    (x) => { x.timezone = "local"; },
    (x) => { x.unit = "GB"; },
    (x) => { x.windows = {}; },
    (x) => { x.windows.pop(); },
    (x) => { x.windows.push(x.windows[0]); },
    (x) => { x.windows[0] = null; },
    (x) => { [x.windows[0], x.windows[1]] = [x.windows[1], x.windows[0]]; },
    (x) => { x.windows[0].from = AT; },
    (x) => { x.windows[1].from = "2026-10-15T12:00:00.001Z"; },
    (x) => { x.windows[0].to = AT; },
    (x) => { x.windows[0].sources = {}; },
    (x) => { x.windows[0].sources.pop(); },
    (x) => { x.windows[0].sources[0] = []; },
    (x) => { x.windows[0].sources[0].category = PRIVATE; },
    (x) => { x.windows[0].sources.reverse(); },
    (x) => { x.windows[0].latestObservedAt = CUTOFF; },
    (x) => { x.windows[0].latestObservedAt = "2026-02-30T00:00:00.000Z"; },
    (x) => { x.windows[1].latestObservedAt = "2026-10-15T11:59:59.999Z"; },
    (x) => { x.coverage = []; },
    (x) => { x.coverage.collectorHealth = "healthy"; },
    (x) => { delete x.coverage.reconciliation; }
  ];
  for (const mutate of mutations) {
    const value = structuredClone(source);
    mutate(value);
    assertUnavailable(() => validateAdminUsageLedgerResponse(value, CUTOFF));
  }
});

test("response rejects noncanonical bytes, unsafe counts and inconsistent sample states", (t) => {
  const source = queryFixture(t);
  for (const bytes of [0, 1n, null, "", "01", "+1", "-1", "-0", "1.0", "1e2", " 1", "1\n",
    "9223372036854775808", "100000000000000000000"]) {
    const value = structuredClone(source);
    value.windows[0].uploadBytes = bytes;
    assertUnavailable(() => validateAdminUsageLedgerResponse(value, CUTOFF));
  }
  const mutations = [
    ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null].map((count) =>
      (x) => { x.windows[0].sampleCount = count; }),
    (x) => { x.windows[0].positiveAccountCount = 3; },
    (x) => { x.windows[0].positiveAccountCount = 0; },
    (x) => { x.windows[0].state = "measured_zero"; },
    (x) => { x.windows[0].latestObservedAt = null; },
    (x) => { x.windows[0].totalBytes = "7"; },
    (x) => { x.windows[0].uploadBytes = MAX_BYTES.toString(); },
    (x) => { x.windows[0].sources[1].state = "measured_zero"; },
    (x) => { x.windows[0].sources[1].latestObservedAt = AT; },
    (x) => { x.windows[0].sources[1].positiveAccountCount = 1; }
  ];
  for (const mutate of mutations) {
    const value = structuredClone(source);
    mutate(value);
    assertUnavailable(() => validateAdminUsageLedgerResponse(value, CUTOFF));
  }
  const zero = queryFixture(t, { samples: [{}], rollups: [] });
  zero.windows[0].positiveAccountCount = 1;
  assertUnavailable(() => validateAdminUsageLedgerResponse(zero, CUTOFF));
});

test("response checks source conservation for count, all byte totals and latest observation", (t) => {
  const source = queryFixture(t);
  for (const mutate of [
    (x) => { x.windows[0].sampleCount += 1; },
    (x) => { x.windows[0].uploadBytes = "5"; x.windows[0].totalBytes = "7"; },
    (x) => { x.windows[0].downloadBytes = "3"; x.windows[0].totalBytes = "7"; },
    (x) => { x.windows[0].latestObservedAt = "2026-10-16T11:30:00.000Z"; },
    (x) => { x.windows[0].sources[0].sampleCount = Number.MAX_SAFE_INTEGER; }
  ]) {
    const value = structuredClone(source);
    mutate(value);
    assertUnavailable(() => validateAdminUsageLedgerResponse(value, CUTOFF));
  }
});

test("response validates reconciliation totals, signed differences, state and counts", (t) => {
  const source = queryFixture(t);
  for (const mutate of [
    (x) => { x.reconciliation = []; },
    (x) => { x.reconciliation.scope = "last_24h"; },
    (x) => { x.reconciliation.aggregateOnly = false; },
    (x) => { x.reconciliation.samples = null; },
    (x) => { x.reconciliation.rollups.totalBytes = "7"; },
    (x) => { x.reconciliation.samples.sampleCount = "2"; },
    (x) => { x.reconciliation.rollups.rollupCount = -1; },
    (x) => { x.reconciliation.differenceBytes = null; },
    ...["-0", "01", "-9223372036854775809", "9223372036854775808", 0].map((bytes) =>
      (x) => { x.reconciliation.differenceBytes.totalBytes = bytes; }),
    (x) => { x.reconciliation.differenceBytes.uploadBytes = "1"; },
    (x) => { x.reconciliation.state = "totals_mismatch"; },
    (x) => { x.reconciliation.futureSampleCount = -1; },
    (x) => { x.reconciliation.atCutoffSampleCount = Infinity; },
    (x) => { x.reconciliation.orphanSampleAccountCount = 0.5; },
    (x) => { x.reconciliation.orphanRollupAccountCount = null; }
  ]) {
    const value = structuredClone(source);
    mutate(value);
    assertUnavailable(() => validateAdminUsageLedgerResponse(value, CUTOFF));
  }
});

test("response normalizes unexpected input errors without exposing their cause", (t) => {
  const source = queryFixture(t);
  Object.defineProperty(source.windows[0], "sampleCount", { get() { throw new Error(PRIVATE); } });
  assertUnavailable(() => validateAdminUsageLedgerResponse(source, CUTOFF));
});
