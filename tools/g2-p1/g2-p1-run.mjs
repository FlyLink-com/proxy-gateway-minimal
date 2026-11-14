// G2-P1 probe runner.
//
// Executes every frozen fixture item on BOTH engines (better-sqlite3 /
// SQLite <-> local Miniflare D1) with local synthetic data only, and
// writes g2-p1-results.json. Exit code 0 iff every item is PROVEN on
// both engines and the schema verification passed.
//
// Usage:
//   node g2-p1-run.mjs [--fixture g2-p1-fixture.json] [--out g2-p1-results.json]
//                      [--only FK-01] [--skip-d1]
//
// The runner never mutates the fixture. It rebuilds the experiment
// schema from this checkout's own migration modules (via
// lib/build-control-schema.mjs) and verifies it against the fixture's
// frozen hashes before running any probe.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  buildExperimentObjects,
  EXPERIMENT_OMIT_TRIGGERS,
  fkList,
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
const FIXTURE_PATH = resolve(HERE, opt("--fixture", "g2-p1-fixture.json"));
const OUT_PATH = resolve(HERE, opt("--out", "g2-p1-results.json"));
const ONLY = opt("--only", null);
const SKIP_D1 = args.includes("--skip-d1");

const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

// Parse a frozen childWhere ("\"col\" = 'v' AND ...") into [{col, value}].
function parseWhere(where) {
  const out = [];
  for (const part of where.split(" AND ")) {
    const m = part.trim().match(/^"([^"]+)"\s*=\s*(.*)$/);
    if (!m) throw new Error(`unparsable where part: ${part}`);
    const raw = m[2].trim();
    let value;
    if (raw === "NULL") value = null;
    else if (/^'.*'$/.test(raw)) value = raw.slice(1, -1).replaceAll("''", "'");
    else if (/^-?\d+$/.test(raw)) value = Number(raw);
    else throw new Error(`unparsable literal: ${raw}`);
    out.push({ col: m[1], value });
  }
  return out;
}

function parseFkRef(ref) {
  // "table(col1,col2)" -> { table, cols }
  const m = ref.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)$/);
  if (!m) throw new Error(`unparsable fk ref: ${ref}`);
  return { table: m[1], cols: m[2].split(",").map((s) => s.trim()) };
}

// Dedupe identical seed statements exactly like the fixture generator
// (and the G2 spike's runPair): seedEntries are assembled from several
// sources and may repeat a statement (e.g. S_ACCOUNT inside both a
// harvested setup and S_LINEAGE).
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
    join(HERE, ".g2-p1-run-build.sqlite"),
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
    araIndexSqlMatchesFixture: false,
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
  verification.araIndexSqlMatchesFixture = fixture.meta.araIndexes.every((idx) => {
    const o = exp.objects.find((x) => x.type === "index" && x.name === idx.name);
    return o && o.sql === idx.sql && sha256(o.sql) === idx.sqlSha256;
  });
  verification.passed =
    verification.omissionUnionMatchesBuilder &&
    verification.objectSha256MatchesFixture &&
    verification.fkInventoryMatchesFixture &&
    verification.araIndexSqlMatchesFixture;
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
      return { ok: true, sig: null, error: null };
    } catch (e) {
      const error = errString(e);
      return { ok: false, sig: signature(error), error: error.slice(0, 300) };
    }
  };
  const runOneD1 = async (db, entry) => {
    try {
      await d1Run(db, entry);
      return { ok: true, sig: null, error: null };
    } catch (e) {
      const error = errString(e);
      return { ok: false, sig: signature(error), error: error.slice(0, 300) };
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
    const setup = async () => {
      const s = { sqlite: null, d1: null };
      const seed = dedupeEntries(item.seedEntries);
      try {
        for (const e of seed) sqliteRun(sdb, e);
        s.sqlite = { ok: true };
      } catch (e) { s.sqlite = { ok: false, error: errString(e).slice(0, 300) }; }
      if (ddb) {
        try {
          for (const e of seed) await d1Run(ddb, e);
          s.d1 = { ok: true };
        } catch (e) { s.d1 = { ok: false, error: errString(e).slice(0, 300) }; }
      }
      return s;
    };
    const setupRes = await setup();
    rec.sqlite.setup = setupRes.sqlite;
    if (ddb) rec.d1 = { setup: setupRes.d1 };

    const countWhere = (db, table, where) => {
      const parts = parseWhere(where);
      const sql = `SELECT COUNT(*) AS n FROM "${table}" WHERE ${parts.map((p) => `"${p.col}" = ?`).join(" AND ")}`;
      const params = parts.map((p) => p.value);
      return db.prepare(sql).all(...params)[0].n;
    };
    const countWhereD1 = async (db, table, where) => {
      const parts = parseWhere(where);
      const sql = `SELECT COUNT(*) AS n FROM "${table}" WHERE ${parts.map((p) => `"${p.col}" = ?`).join(" AND ")}`;
      const res = await db.prepare(sql).bind(...parts.map((p) => p.value)).all();
      return res.results[0].n;
    };
    // Recompute the reference census for the parent values in childWhere.
    const censusLive = async (engine) => {
      const parentValues = parseWhere(item.probes.delete.childWhere).map((p) => p.value);
      const out = [];
      for (const c of item.probes.delete.census) {
        const { table, cols } = parseFkRef(c.fk);
        const where = cols.map((col, i) => `"${col}" = ${parentValues[i] === null ? "NULL" : `'${String(parentValues[i]).replaceAll("'", "''")}'`}`).join(" AND ");
        const n = engine === "sqlite"
          ? sdb.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`).get().n
          : (await ddb.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`).all()).results[0].n;
        out.push({ child: c.child, fk: c.fk, rows: n });
      }
      return out;
    };

    if (item.kind === "fk") {
      // INSERT violation
      rec.sqlite.insert = runOne(sdb, item.probes.insert.sql);
      if (ddb) rec.d1.insert = await runOneD1(ddb, item.probes.insert.sql);
      // UPDATE violation (multi-step: every step runs, last must be FK)
      const updSteps = [];
      for (const step of item.probes.update.steps) {
        updSteps.push(runOne(sdb, step));
        if (ddb) {
          const d = await runOneD1(ddb, step);
          updSteps[updSteps.length - 1].d1 = d;
        }
      }
      rec.sqlite.update = { steps: updSteps.map((s) => ({ ok: s.ok, sig: s.sig, error: s.error })) };
      if (ddb) rec.d1.update = { steps: updSteps.map((s) => (s.d1 ? { ok: s.d1.ok, sig: s.d1.sig, error: s.d1.error } : null)) };
      // Positive control
      rec.sqlite.positive = runOne(sdb, item.probes.positive.sql);
      if (ddb) rec.d1.positive = await runOneD1(ddb, item.probes.positive.sql);
      // DELETE parent (after setup steps)
      for (const step of item.probes.delete.setupSteps) {
        const r = runOne(sdb, step);
        if (!r.ok) rec.notes.push(`sqlite delete-setup failed: ${r.error}`);
        if (ddb) {
          const d = await runOneD1(ddb, step);
          if (!d.ok) rec.notes.push(`d1 delete-setup failed: ${d.error}`);
        }
      }
      rec.sqlite.delete = {
        childBefore: countWhere(sdb, item.child, item.probes.delete.childWhere),
        census: await censusLive("sqlite"),
      };
      if (ddb) {
        rec.d1.delete = {
          childBefore: await countWhereD1(ddb, item.child, item.probes.delete.childWhere),
          census: await censusLive("d1"),
        };
      }
      const delS = runOne(sdb, item.probes.delete.sql);
      rec.sqlite.delete.outcome = delS;
      rec.sqlite.delete.childAfter = countWhere(sdb, item.child, item.probes.delete.childWhere);
      if (ddb) {
        const delD = await runOneD1(ddb, item.probes.delete.sql);
        rec.d1.delete.outcome = delD;
        rec.d1.delete.childAfter = await countWhereD1(ddb, item.child, item.probes.delete.childWhere);
      }
      // Terminal state (full dump of every table)
      rec.sqlite.terminalState = dumpSqliteState(sdb, tableNames);
      if (ddb) rec.d1.terminalState = await dumpD1State(ddb, tableNames);
    } else {
      // IDX items: P2 duplicate active, P3 revoked same key, P4 reactivate
      rec.sqlite.p2DuplicateActive = runOne(sdb, item.probes.p2DuplicateActive.sql);
      if (ddb) rec.d1.p2DuplicateActive = await runOneD1(ddb, item.probes.p2DuplicateActive.sql);
      rec.sqlite.p3RevokedSameKey = runOne(sdb, item.probes.p3RevokedSameKey.sql);
      if (ddb) rec.d1.p3RevokedSameKey = await runOneD1(ddb, item.probes.p3RevokedSameKey.sql);
      rec.sqlite.p4ReactivateRevoked = runOne(sdb, item.probes.p4ReactivateRevoked.sql);
      if (ddb) rec.d1.p4ReactivateRevoked = await runOneD1(ddb, item.probes.p4ReactivateRevoked.sql);
      rec.sqlite.terminalState = dumpSqliteState(sdb, tableNames);
      if (ddb) rec.d1.terminalState = await dumpD1State(ddb, tableNames);
    }

    // ---------- verdict ----------
    const problems = [];
    if (!rec.sqlite.setup?.ok) problems.push(`sqlite setup failed: ${rec.sqlite.setup?.error}`);
    if (rec.d1 && !rec.d1.setup?.ok) problems.push(`d1 setup failed: ${rec.d1.setup?.error}`);
    const expectSig = (label, got, want) => {
      if (got !== want) problems.push(`${label}: expected ${want}, got ${got}`);
    };
    if (item.kind === "fk") {
      expectSig("sqlite insert", rec.sqlite.insert.sig, "FK");
      expectSig("sqlite update(last)", rec.sqlite.update.steps.at(-1)?.sig, "FK");
      for (const [i, s] of rec.sqlite.update.steps.slice(0, -1).entries()) {
        if (!s.ok) problems.push(`sqlite update step ${i} not ok: ${s.sig}`);
      }
      if (!rec.sqlite.positive.ok) problems.push(`sqlite positive not ok: ${rec.sqlite.positive.sig}`);
      expectSig("sqlite delete", rec.sqlite.delete.outcome.sig, item.probes.delete.expect);
      if (rec.sqlite.delete.childBefore !== item.probes.delete.childBefore) problems.push(`sqlite delete childBefore ${rec.sqlite.delete.childBefore} != frozen ${item.probes.delete.childBefore}`);
      if (rec.sqlite.delete.childAfter !== item.probes.delete.childAfter) problems.push(`sqlite delete childAfter ${rec.sqlite.delete.childAfter} != frozen ${item.probes.delete.childAfter}`);
      if (JSON.stringify(rec.sqlite.delete.census) !== JSON.stringify(item.probes.delete.census)) problems.push(`sqlite census mismatch: ${JSON.stringify(rec.sqlite.delete.census)}`);
      if (rec.d1) {
        expectSig("d1 insert", rec.d1.insert.sig, "FK");
        expectSig("d1 update(last)", rec.d1.update.steps.at(-1)?.sig, "FK");
        for (const [i, s] of rec.d1.update.steps.slice(0, -1).entries()) {
          if (!s.ok) problems.push(`d1 update step ${i} not ok: ${s.sig}`);
        }
        if (!rec.d1.positive.ok) problems.push(`d1 positive not ok: ${rec.d1.positive.sig}`);
        expectSig("d1 delete", rec.d1.delete.outcome.sig, item.probes.delete.expect);
        if (rec.d1.delete.childBefore !== item.probes.delete.childBefore) problems.push(`d1 delete childBefore ${rec.d1.delete.childBefore} != frozen ${item.probes.delete.childBefore}`);
        if (rec.d1.delete.childAfter !== item.probes.delete.childAfter) problems.push(`d1 delete childAfter ${rec.d1.delete.childAfter} != frozen ${item.probes.delete.childAfter}`);
        if (JSON.stringify(rec.d1.delete.census) !== JSON.stringify(item.probes.delete.census)) problems.push(`d1 census mismatch: ${JSON.stringify(rec.d1.delete.census)}`);
        rec.match = statesEqual(rec.sqlite.terminalState, rec.d1.terminalState);
        if (!rec.match) problems.push("terminal states differ between engines");
      }
    } else {
      const keyCol = item.keyColumn;
      const namesCol = (r) => (r.error ?? "").includes(`platform_account_resource_authorities.${keyCol}`);
      expectSig("sqlite p2", rec.sqlite.p2DuplicateActive.sig, "UNIQUE");
      if (rec.sqlite.p2DuplicateActive.sig === "UNIQUE" && !namesCol(rec.sqlite.p2DuplicateActive)) problems.push("sqlite p2 UNIQUE error does not name the tested column");
      if (!rec.sqlite.p3RevokedSameKey.ok) problems.push(`sqlite p3 not ok: ${rec.sqlite.p3RevokedSameKey.sig}`);
      expectSig("sqlite p4", rec.sqlite.p4ReactivateRevoked.sig, "UNIQUE");
      if (rec.sqlite.p4ReactivateRevoked.sig === "UNIQUE" && !namesCol(rec.sqlite.p4ReactivateRevoked)) problems.push("sqlite p4 UNIQUE error does not name the tested column");
      if (rec.d1) {
        expectSig("d1 p2", rec.d1.p2DuplicateActive.sig, "UNIQUE");
        if (rec.d1.p2DuplicateActive.sig === "UNIQUE" && !namesCol(rec.d1.p2DuplicateActive)) problems.push("d1 p2 UNIQUE error does not name the tested column");
        if (!rec.d1.p3RevokedSameKey.ok) problems.push(`d1 p3 not ok: ${rec.d1.p3RevokedSameKey.sig}`);
        expectSig("d1 p4", rec.d1.p4ReactivateRevoked.sig, "UNIQUE");
        if (rec.d1.p4ReactivateRevoked.sig === "UNIQUE" && !namesCol(rec.d1.p4ReactivateRevoked)) problems.push("d1 p4 UNIQUE error does not name the tested column");
        rec.match = statesEqual(rec.sqlite.terminalState, rec.d1.terminalState);
        if (!rec.match) problems.push("terminal states differ between engines");
      }
    }
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
    fkProven: results.filter((r) => r.kind === "fk" && r.verdict === "PROVEN").length,
    fkTotal: results.filter((r) => r.kind === "fk").length,
    idxProven: results.filter((r) => r.kind === "index" && r.verdict === "PROVEN").length,
    idxTotal: results.filter((r) => r.kind === "index").length,
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
  console.log(`\n=== SUMMARY === ${summary.proven}/${summary.total} PROVEN (fk ${summary.fkProven}/${summary.fkTotal}, idx ${summary.idxProven}/${summary.idxTotal}); verification ${verification.passed ? "PASSED" : "FAILED"}; results sha256 ${sha256File(OUT_PATH)}`);
  process.exitCode = summary.proven === summary.total && verification.passed ? 0 : 1;
}

main().catch((e) => {
  console.error("RUNNER FAILED:", e);
  process.exitCode = 2;
});
