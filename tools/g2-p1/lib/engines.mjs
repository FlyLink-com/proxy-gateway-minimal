// G2-P1: dual-engine layer (better-sqlite3/SQLite <-> local Miniflare D1).
//
// Ports the G2 spike harness patterns (stage2b-lib.mjs) into this tool:
// same DDL build order (tables -> indexes -> triggers), same error
// signature vocabulary, same state-dump format, one Miniflare instance
// hosting one isolated in-memory D1 database per item. No absolute
// paths, no harness files: everything resolves from this package or
// the repo root node_modules.
import { Miniflare } from "miniflare";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

// ---------- error text + signatures (same vocabulary as the G2 spike) ----------
export function errString(e) {
  if (!e) return "";
  let s = String(e.message ?? e);
  let c = e.cause;
  let depth = 0;
  while (c && depth++ < 4) {
    s += " | cause: " + String(c.message ?? c);
    c = c.cause;
  }
  return s;
}

export function makeSignatures(objects) {
  const raiseTexts = new Set();
  for (const t of objects.filter((o) => o.type === "trigger")) {
    for (const m of t.sql.matchAll(/raise\(abort,\s*'([^']+)'\)/gi)) raiseTexts.add(m[1]);
  }
  function signature(errText) {
    if (!errText) return null;
    for (const r of raiseTexts) if (errText.includes(r)) return `RAISE:${r}`;
    if (/FOREIGN KEY constraint/i.test(errText)) return "FK";
    if (/SQLITE_CONSTRAINT_FOREIGNKEY/i.test(errText)) return "FK";
    if (/CHECK constraint/i.test(errText)) return "CHECK";
    if (/UNIQUE constraint/i.test(errText)) return "UNIQUE";
    if (/NOT NULL constraint/i.test(errText)) return "NOTNULL";
    if (/no such table/i.test(errText)) return "NO_SUCH_TABLE";
    if (/syntax error/i.test(errText)) return "SYNTAX";
    return `OTHER:${errText.slice(0, 100)}`;
  }
  return { raiseTexts, signature };
}

// ---------- SQLite engine ----------
export function buildSqlite(objects) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const ordered = [
    ...objects.filter((o) => o.type === "table"),
    ...objects.filter((o) => o.type === "index"),
    ...objects.filter((o) => o.type === "trigger"),
  ];
  for (const o of ordered) db.exec(o.sql);
  return db;
}

export function sqliteRun(db, entry) {
  if (typeof entry === "string") {
    db.exec(entry);
    return;
  }
  const tx = db.transaction((stmts) => {
    for (const s of stmts) db.exec(s);
  });
  tx(entry.batch);
}

export function sqliteQuery(db, sql) {
  return db.prepare(sql).all();
}

// ---------- D1 engine (local Miniflare) ----------
export async function buildD1(db, objects) {
  const ordered = [
    ...objects.filter((o) => o.type === "table"),
    ...objects.filter((o) => o.type === "index"),
    ...objects.filter((o) => o.type === "trigger"),
  ];
  for (let i = 0; i < ordered.length; i += 50) {
    await db.batch(ordered.slice(i, i + 50).map((o) => db.prepare(o.sql)));
  }
  return db;
}

export async function d1Run(db, entry) {
  if (typeof entry === "string") {
    await db.prepare(entry).run();
    return;
  }
  await db.batch(entry.batch.map((s) => db.prepare(s)));
}

export async function d1Query(db, sql) {
  const res = await db.prepare(sql).all();
  return res.results;
}

// One Miniflare instance hosting one isolated D1 database per item.
// Named databases + a persist dir (the G2 spike's proven pattern):
// ":memory:" bindings are NOT isolated -- every ":memory:" binding in
// one Miniflare shares the same underlying database, so a second
// item's DDL build fails with "table ... already exists".
export class D1Pool {
  constructor(count, persistDir) {
    this.count = count;
    this.persistDir = persistDir;
    this.mf = null;
    this.dbs = new Map();
    this.next = 0;
  }
  async init() {
    rmSync(this.persistDir, { recursive: true, force: true });
    const bindings = {};
    for (let i = 0; i < this.count; i++) bindings[`DB${i}`] = `g2-p1-${i}`;
    this.mf = new Miniflare({
      modules: true,
      script: 'export default { async fetch() { return new Response("g2-p1"); } }',
      d1Databases: bindings,
      d1Persist: this.persistDir,
    });
    for (let i = 0; i < this.count; i++) this.dbs.set(i, await this.mf.getD1Database(`DB${i}`));
  }
  take() {
    if (this.next >= this.count) throw new Error("D1Pool exhausted");
    return this.dbs.get(this.next++);
  }
  async dispose() {
    if (this.mf) await this.mf.dispose();
  }
}

// ---------- terminal-state dumps (same format on both engines) ----------
function sortRows(rows) {
  return rows
    .map((r) => Object.fromEntries(Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1))))
    .sort((a, b) => {
      const sa = JSON.stringify(a);
      const sb = JSON.stringify(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
}

export function dumpSqliteState(db, tables) {
  const out = {};
  for (const t of tables) {
    const rows = db.prepare(`SELECT * FROM "${t}" ORDER BY 1, 2`).all();
    out[t] = sortRows(rows);
  }
  return out;
}

export async function dumpD1State(db, tables) {
  const out = {};
  for (const t of tables) {
    const res = await db.prepare(`SELECT * FROM "${t}" ORDER BY 1, 2`).all();
    out[t] = sortRows(res.results);
  }
  return out;
}

export function statesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
