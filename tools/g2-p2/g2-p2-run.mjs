// G2-P2 probe runner.
//
// Executes every frozen fixture item on BOTH engines (better-sqlite3 /
// SQLite <-> local Miniflare D1) with local synthetic data only, and
// writes g2-p2-results.json. Exit code 0 iff every item is PROVEN on
// both engines and the schema verification passed.
//
// Usage:
//   node g2-p2-run.mjs [--fixture g2-p2-fixture.json] [--out g2-p2-results.json]
//                      [--only CHK-01] [--skip-d1]
//
// The runner never mutates the fixture. It rebuilds the experiment
// schema from this checkout's own migration modules (via
// lib/build-control-schema.mjs) and verifies it against the fixture's
// frozen hashes before running any probe. Probe SQL is replayed
// verbatim from the fixture; the frozen SQLite trial sigs must
// reproduce exactly, and the D1 run must match them.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  buildExperimentObjects,
  EXPERIMENT_OMIT_TRIGGERS,
  sha256,
} from "./lib/build-control-schema.mjs";
import {
  buildSqlite,
  buildD1,
  sqliteRun,
  sqliteQuery,
  d1Run,
  D1Pool,
  errString,
  makeSignatures,
  dumpSqliteState,
  dumpD1State,
  statesEqual,
} from "./lib/engines.mjs";

const require = createRequire(import.meta.url);
const bsPkg = require("better-sqlite3/package.json");
const mfPkg = require("miniflare/package.json");

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const FIXTURE_PATH = resolve(HERE, opt("--fixture", "g2-p2-fixture.json"));
const OUT_PATH = resolve(HERE, opt("--out", "g2-p2-results.json"));
const ONLY = opt("--only", null);
const SKIP_D1 = args.includes("--skip-d1");

const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const exprMatch = (error, expr) => norm(error ?? "").includes(norm(expr));

// Dedupe identical seed statements exactly like the fixture generator
// (and the G2 spike's runPair): seedEntries are assembled from several
// sources and may repeat a statement.
function dedupeEntries(entries) {
  const seen = new Set(), out = [];
  for (const e of entries ?? []) {
    const k = typeof e === "string" ? e : JSON.stringify(e);
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  }
  return out;
}

async function main() {
  const fixtureRaw = readFileSync(FIXTURE_PATH, "utf8");
  const fixture = JSON.parse(fixtureRaw);
  const fixtureSha256 = sha256(fixtureRaw);
  const items = ONLY ? fixture.items.filter((x) => x.id === ONLY) : fixture.items;
  if (items.length === 0) throw new Error(`no items matched (only=${ONLY})`);

  // ---------- schema verification (before any probe) ----------
  const omitUnion = [...fixture.meta.omissionUnion].sort();
  const builderUnion = [...EXPERIMENT_OMIT_TRIGGERS].sort();
  const exp = await buildExperimentObjects(
    join(HERE, ".g2-p2-run-build.sqlite"),
    fixture.meta.omissionUnion,
  );
  const verification = {
    baseline: fixture.meta.baseline,
    omissionUnionMatchesBuilder: JSON.stringify(omitUnion) === JSON.stringify(builderUnion),
    omissionUnionSize: omitUnion.length,
    objectSha256: exp.objectSha256,
    objectSha256MatchesFixture: exp.objectSha256 === fixture.meta.ddl.objectSha256,
    tables: exp.counts.tables,
    indexesTotal: exp.counts.indexesTotal,
    triggersBuilt: exp.counts.triggers,
    triggersOmitted: exp.omitCount,
    triggersRemaining: exp.counts.triggers - exp.omitCount,
    fkConstraints: exp.fkCount,
    fkInventoryMatchesFixture: false,
    checkExprsInLiveDdl: false,
    checkExprsChecked: 0,
    checkExprsMissing: [],
    ledgerRows: exp.ledgerRows.length,
  };
  // Group the live pragma FK rows into the frozen inventory shape.
  const grouped = (() => {
    const byKey = new Map();
    for (const r of exp.fkInventory) {
      const k = `${r.table}|${r.id}`;
      if (!byKey.has(k)) {
        byKey.set(k, {
          child: r.table, fkId: r.id, from: [], parent: r.parentTable, to: [],
          onDelete: r.onDelete, onUpdate: r.onUpdate, match: r.match,
        });
      }
      const e = byKey.get(k);
      e.from[r.seq] = r.column;
      e.to[r.seq] = r.parentColumn;
    }
    const out = [...byKey.values()];
    const g2byKey = new Map(
      fixture.meta.fkInventory.map((f) => [`${f.child}|${f.from.join(",")}|${f.parent}|${f.to.join(",")}`, f]),
    );
    for (const e of out) {
      const g = g2byKey.get(`${e.child}|${e.from.join(",")}|${e.parent}|${e.to.join(",")}`);
      e.deferrable = g ? g.deferrable : false;
      e.initiallyDeferred = g ? g.initiallyDeferred : false;
    }
    out.sort((a, b) => a.child.localeCompare(b.child) || a.fkId - b.fkId);
    return out;
  })();
  verification.fkInventoryMatchesFixture =
    JSON.stringify(grouped) === JSON.stringify(fixture.meta.fkInventory);
  // Every frozen CHECK expression must appear (whitespace-normalized)
  // in the live-built table DDL.
  const tableSql = new Map(exp.objects.filter((o) => o.type === "table").map((o) => [o.name, norm(o.sql)]));
  const missing = [];
  for (const c of fixture.meta.checkExprs) {
    const live = tableSql.get(c.table) ?? "";
    if (!live.includes(norm(c.expr))) missing.push(c.id);
  }
  verification.checkExprsChecked = fixture.meta.checkExprs.length;
  verification.checkExprsMissing = missing;
  verification.checkExprsInLiveDdl = missing.length === 0;
  verification.passed =
    verification.omissionUnionMatchesBuilder &&
    verification.objectSha256MatchesFixture &&
    verification.fkInventoryMatchesFixture &&
    verification.checkExprsInLiveDdl;
  if (!verification.passed) {
    console.error("SCHEMA VERIFICATION FAILED:", JSON.stringify(verification, null, 2));
    process.exitCode = 2;
  }

  const { signature } = makeSignatures(exp.objects);
  const tableNames = exp.objects.filter((o) => o.type === "table").map((o) => o.name);
  const sqliteVersion = (() => {
    const db = buildSqlite(exp.objects);
    const v = sqliteQuery(db, "SELECT sqlite_version() AS v")[0].v;
    db.close();
    return v;
  })();

  // ---------- D1 pool ----------
  // NOTE: D1 does not expose its SQLite version (sqlite_version() is
  // unauthorized: "D1_ERROR: not authorized to use function:
  // sqlite_version"). Record the Miniflare + workerd versions instead.
  let pool = null;
  let workerdVersion = null;
  if (!SKIP_D1) {
    try {
      workerdVersion = require("workerd/package.json").version;
    } catch {
      workerdVersion = null;
    }
    pool = new D1Pool(items.length, join(HERE, ".miniflare-d1"));
    await pool.init();
  }

  const runOne = (db, entry) => {
    try {
      sqliteRun(db, entry);
      return { ok: true, sig: "ok", error: null };
    } catch (e) {
      // Full error text is kept (not truncated): exprMatch must compare
      // against the whole echoed CHECK expression, and the table-level
      // CHECKs (CHK-05/CHK-15) echo expressions longer than 300 chars.
      const error = errString(e);
      return { ok: false, sig: signature(error), error };
    }
  };
  const runOneD1 = async (db, entry) => {
    try {
      await d1Run(db, entry);
      return { ok: true, sig: "ok", error: null };
    } catch (e) {
      const error = errString(e);
      return { ok: false, sig: signature(error), error };
    }
  };

  // ---------- per-item runs ----------
  const results = [];
  for (const item of items) {
    const rec = { id: item.id, kind: item.kind, key: item.key, sqlite: {}, d1: null, match: null, verdict: null, notes: [] };
    const sdb = buildSqlite(exp.objects);
    let ddb = null;
    if (!SKIP_D1) {
      ddb = pool.take();
      await buildD1(ddb, exp.objects);
    }
    const seed = dedupeEntries(item.seedEntries);
    try {
      for (const e of seed) sqliteRun(sdb, e);
      rec.sqlite.setup = { ok: true };
    } catch (e) { rec.sqlite.setup = { ok: false, error: errString(e).slice(0, 300) }; }
    if (ddb) {
      try {
        for (const e of seed) await d1Run(ddb, e);
        rec.d1 = { setup: { ok: true } };
      } catch (e) { rec.d1 = { setup: { ok: false, error: errString(e).slice(0, 300) } }; }
    }

    // Replay the frozen probe SQL verbatim.
    rec.sqlite.positive = runOne(sdb, item.probes.positive.sql);
    rec.sqlite.violation = runOne(sdb, item.probes.violation.sql);
    rec.sqlite.boundary = runOne(sdb, item.probes.boundary.sql);
    if (ddb) {
      rec.d1.positive = await runOneD1(ddb, item.probes.positive.sql);
      rec.d1.violation = await runOneD1(ddb, item.probes.violation.sql);
      rec.d1.boundary = await runOneD1(ddb, item.probes.boundary.sql);
    }
    rec.sqlite.terminalState = dumpSqliteState(sdb, tableNames);
    if (ddb) rec.d1.terminalState = await dumpD1State(ddb, tableNames);

    // ---------- verdict ----------
    const problems = [];
    if (!rec.sqlite.setup?.ok) problems.push(`sqlite setup failed: ${rec.sqlite.setup?.error}`);
    if (rec.d1 && !rec.d1.setup?.ok) problems.push(`d1 setup failed: ${rec.d1.setup?.error}`);
    const expr = item.expr;
    const checkProbe = (label, r, want) => {
      if (!r) return;
      if (want === "ok") {
        if (!r.ok) problems.push(`${label}: expected ok, got ${r.sig}: ${r.error ?? ""}`);
      } else if (want === "CHECK") {
        if (r.sig !== "CHECK") problems.push(`${label}: expected CHECK, got ${r.sig}: ${r.error ?? ""}`);
        else if (!exprMatch(r.error, expr)) problems.push(`${label}: CHECK error does not echo the target expression: ${r.error ?? ""}`);
      }
    };
    checkProbe("sqlite positive", rec.sqlite.positive, "ok");
    checkProbe("sqlite violation", rec.sqlite.violation, "CHECK");
    checkProbe("sqlite boundary", rec.sqlite.boundary, item.probes.boundary.expect);
    if (rec.d1) {
      checkProbe("d1 positive", rec.d1.positive, "ok");
      checkProbe("d1 violation", rec.d1.violation, "CHECK");
      checkProbe("d1 boundary", rec.d1.boundary, item.probes.boundary.expect);
      rec.match = statesEqual(rec.sqlite.terminalState, rec.d1.terminalState);
      if (!rec.match) problems.push("terminal states differ between engines");
    }
    // The frozen SQLite trial must reproduce exactly.
    const frozen = item.sqliteTrial ?? {};
    if (frozen.positiveSig && rec.sqlite.positive.sig !== frozen.positiveSig) problems.push(`sqlite positive sig ${rec.sqlite.positive.sig} != frozen trial ${frozen.positiveSig}`);
    if (frozen.violationSig && rec.sqlite.violation.sig !== frozen.violationSig) problems.push(`sqlite violation sig ${rec.sqlite.violation.sig} != frozen trial ${frozen.violationSig}`);
    if (frozen.boundarySig && rec.sqlite.boundary.sig !== frozen.boundarySig) problems.push(`sqlite boundary sig ${rec.sqlite.boundary.sig} != frozen trial ${frozen.boundarySig}`);
    if (frozen.violationExprMatch === true && !exprMatch(rec.sqlite.violation.error, expr)) problems.push("sqlite violation no longer echoes the target expression");
    rec.problems = problems;
    rec.verdict = problems.length === 0 ? "PROVEN" : "NEEDS-REVIEW";
    results.push(rec);
    sdb.close();
    console.log(`${item.id} ${item.key} :: ${rec.verdict}${problems.length ? " -- " + problems.join("; ") : ""}`);
  }

  if (pool) await pool.dispose();

  const summary = {
    total: results.length,
    proven: results.filter((r) => r.verdict === "PROVEN").length,
    needsReview: results.filter((r) => r.verdict !== "PROVEN").length,
    verificationPassed: verification.passed,
    dualEngine: !SKIP_D1,
  };
  const out = {
    meta: {
      baseline: fixture.meta.baseline,
      fixtureSha256,
      fixturePath: FIXTURE_PATH,
      generatedAt: new Date().toISOString(),
      versions: {
        node: process.version,
        betterSqlite3: bsPkg.version,
        sqlite: sqliteVersion,
        miniflare: SKIP_D1 ? null : mfPkg.version,
        workerd: workerdVersion,
        d1Sqlite: "not exposed by D1 (sqlite_version() is unauthorized)",
      },
      ddl: fixture.meta.ddl,
      omissionUnion: fixture.meta.omissionUnion,
    },
    verification,
    summary,
    items: results,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\n=== SUMMARY === ${summary.proven}/${summary.total} PROVEN; verification ${verification.passed ? "PASSED" : "FAILED"}; results sha256 ${sha256File(OUT_PATH)}`);
  process.exitCode = summary.proven === summary.total && verification.passed ? 0 : 1;
}

main().catch((e) => {
  console.error("RUNNER FAILED:", e);
  process.exitCode = 2;
});
