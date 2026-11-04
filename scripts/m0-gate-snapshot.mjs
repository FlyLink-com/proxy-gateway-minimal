#!/usr/bin/env node
// M0 formal Identity Gate — snapshot helper v2.
// Creates ONE standalone SQLite snapshot of a live database using the Online
// Backup API from a READ-ONLY source connection, then verifies the snapshot
// opens standalone (no -wal/-shm sidecars) with integrity_check = ok.
// Usage: node m0-gate-snapshot.mjs <sourceDbAbsPath> <destAbsPath>
// Output: one JSON line {ok, bytes, integrity, journalMode}; never emits paths.
// Never writes to the source; never uses immutable=1; refuses symlinks,
// non-absolute paths, and pre-existing destinations.
import { existsSync, lstatSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

const [source, dest] = process.argv.slice(2);
function fail(code) {
  process.stdout.write(JSON.stringify({ ok: false, code }) + "\n");
  process.exit(1);
}
if (!source || !dest || !isAbsolute(source) || !isAbsolute(dest)) fail("args_invalid");
if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !lstatSync(source).isFile()) fail("source_invalid");
if (existsSync(dest) || existsSync(dest + "-wal") || existsSync(dest + "-shm")) fail("dest_exists");

let db;
try {
  db = new Database(source, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  db.pragma("busy_timeout = 2000");
  await db.backup(dest);
} catch {
  fail("backup_failed");
} finally {
  try { db?.close(); } catch { /* ignore */ }
}
if (!existsSync(dest) || existsSync(dest + "-wal") || existsSync(dest + "-shm")) fail("sidecar_present");
let check;
try {
  check = new Database(dest, { readonly: true, fileMustExist: true });
  check.pragma("query_only = ON");
  const integrity = check.pragma("integrity_check", { simple: true });
  const journalMode = check.pragma("journal_mode", { simple: true });
  if (integrity !== "ok") fail("integrity_failed");
  process.stdout.write(JSON.stringify({ ok: true, bytes: statSync(dest).size, integrity, journalMode }) + "\n");
} catch {
  fail("verify_failed");
} finally {
  try { check?.close(); } catch { /* ignore */ }
}
