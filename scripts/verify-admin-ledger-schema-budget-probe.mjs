// Manual, synthetic-only comparison against the real, pinned #792 source.
// Does not accept a DB path, run SSH, or read production/environment data.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { runAdminLedgerSchemaBudgetProbe } from "./lib/admin-ledger-schema-budget-probe.mjs";

assert.equal(process.argv.length, 2, "No inputs accepted");
const BASE = "35c969eb53ecd689f4094c9a68d50891dbb1b26d";
const BASE_SHA = "864281f210a8dcb053e9ed0759dae16c47ce2cd516fbf270bb5955fee0bb3be8";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = execFileSync("git", ["show", `${BASE}:server/services/platform/admin-usage-ledger-query.mjs`], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true
}).replaceAll("\r\n", "\n");
assert.equal(createHash("sha256").update(source).digest("hex"), BASE_SHA);
let trace;
function TracingDatabase(...args) {
  const db = new Database(...args);
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const statement = prepare(sql);
    for (const method of ["get", "all"]) {
      const execute = statement[method].bind(statement);
      statement[method] = (...parameters) => {
        trace.push({ sql: sql.trim().replace(/\s+/g, " "), method, parameters });
        return execute(...parameters);
      };
    }
    return statement;
  };
  return db;
}
const key = "__syntheticSchemaBudgetDatabase";
assert.equal(Object.hasOwn(globalThis, key), false);
globalThis[key] = TracingDatabase;
let baseline;
try {
  assert.equal(source.split('import Database from "better-sqlite3";').length, 2);
  const instrumented = source.replace('import Database from "better-sqlite3";', `const Database = globalThis[${JSON.stringify(key)}];`);
  baseline = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString("base64")}`);
} finally { delete globalThis[key]; }

const directory = mkdtempSync(join(tmpdir(), "ledger-probe-trace-"));
let comparisons = 0;
try {
  const dbPath = join(directory, "synthetic.sqlite");
  createSqliteSubscriptionControlStore({ dbPath }).close();
  // Compare the schema/budget prefix of the real old query, not a duplicate SQL list.
  // Over-cap/missing-schema cases also prove the stopping point and error order.
  for (const scenario of ["valid", "over_cap", "missing_rollups"]) {
    const writer = new Database(dbPath);
    try {
      if (scenario === "over_cap") {
        const insert = writer.prepare("insert into platform_accounts(id, owner_ref, status, created_at, updated_at) values (?, 'synthetic-owner', 'active', ?, ?)");
        const at = "2026-10-19T00:00:00.000Z";
        for (let index = 0; index < 4; index += 1) insert.run(`probe-synthetic-${index}`, at, at);
      }
      if (scenario === "missing_rollups") writer.exec("drop table platform_usage_rollups");
    } finally { writer.close(); }
    trace = []; let baselineError = null;
    try { baseline.readAdminUsageLedger({ dbPath, cutoff: "2026-10-19T00:00:00.000Z", scanLimit: 3 }); }
    catch (error) { baselineError = error.code; }
    const original = trace.slice(0, 9);
    trace = []; let probeError = null;
    try { runAdminLedgerSchemaBudgetProbe({ dbPath, scanLimit: 3 }, { DatabaseClass: TracingDatabase }); }
    catch (error) { probeError = error.category; }
    assert.deepEqual(trace, original);
    assert.equal(probeError, baselineError);
    comparisons += 1;
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
// Only source identity and synthetic assertion totals leave this experiment.
process.stdout.write(`${JSON.stringify({ ok: true, baseline: BASE, baselineSha256: BASE_SHA, comparisons, productionRead: false })}\n`);
