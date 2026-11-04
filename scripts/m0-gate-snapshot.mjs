#!/usr/bin/env node
// M0 formal Identity Gate — snapshot helper v2.4.
// Creates ONE standalone SQLite snapshot of a live database using the Online
// Backup API from a READ-ONLY source connection. Integrity/readability checks
// run against a disposable copy in a temporary sibling directory so SQLite's
// WAL-mode read-only probe can never create sidecars beside the snapshot.
// Usage: node m0-gate-snapshot.mjs <sourceDbAbsPath> <destAbsPath>
// Output: one JSON line {ok, bytes, integrity, journalMode}; never emits paths.
// Never writes the source main DB or WAL; SQLite may create transient -shm
// coordination state when absent. Never uses immutable=1; refuses symlinks,
// non-absolute paths, and pre-existing destinations.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  statSync
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import Database from "better-sqlite3";

const [source, dest] = process.argv.slice(2);
function fail(code) {
  process.stdout.write(JSON.stringify({ ok: false, code }) + "\n");
  process.exit(1);
}
function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function unsafeSidecar(dbPath) {
  for (const suffix of ["-wal", "-shm"]) {
    try {
      const sidecar = lstatSync(dbPath + suffix);
      if (sidecar.isSymbolicLink() || !sidecar.isFile()) return true;
    } catch (error) {
      if (error?.code !== "ENOENT") return true;
    }
  }
  return false;
}
if (!source || !dest || !isAbsolute(source) || !isAbsolute(dest)) fail("args_invalid");
if (!existsSync(source) || lstatSync(source).isSymbolicLink() || !lstatSync(source).isFile()) fail("source_invalid");
if (unsafeSidecar(source)) fail("sidecar_invalid");
if (pathExists(dest) || pathExists(dest + "-wal") || pathExists(dest + "-shm")) fail("dest_exists");

let db;
let failureCode;
try {
  db = new Database(source, { readonly: true, fileMustExist: true });
  if (unsafeSidecar(source)) {
    throw Object.assign(new Error("sidecar_invalid"), { gateCode: "sidecar_invalid" });
  }
  db.pragma("query_only = ON");
  db.pragma("busy_timeout = 2000");
  await db.backup(dest);
  if (unsafeSidecar(source)) {
    throw Object.assign(new Error("sidecar_invalid"), { gateCode: "sidecar_invalid" });
  }
} catch (error) {
  failureCode = error?.gateCode === "sidecar_invalid" ? "sidecar_invalid" : "backup_failed";
} finally {
  try { db?.close(); } catch { /* ignore */ }
}
if (failureCode) fail(failureCode);
if (unsafeSidecar(source)) fail("sidecar_invalid");
if (!existsSync(dest) || pathExists(dest + "-wal") || pathExists(dest + "-shm")) fail("sidecar_present");

let probeDir;
let check;
let integrity;
let journalMode;
let verifyError;
try {
  // Match the original 2026-11-01 fixture procedure: probe a standalone copy,
  // never the snapshot artifact that the caller will hash and consume.
  probeDir = mkdtempSync(join(dirname(dest), ".m0-gate-probe-"));
  const probe = join(probeDir, "snapshot.sqlite");
  copyFileSync(dest, probe);
  check = new Database(probe, { readonly: true, fileMustExist: true });
  check.pragma("query_only = ON");
  check.pragma("busy_timeout = 2000");
  integrity = check.pragma("integrity_check", { simple: true });
  journalMode = check.pragma("journal_mode", { simple: true });
  if (integrity !== "ok") verifyError = "integrity_failed";
} catch {
  verifyError = verifyError || "verify_failed";
} finally {
  try { check?.close(); } catch { verifyError = verifyError || "verify_close_failed"; }
  if (probeDir) {
    try { rmSync(probeDir, { recursive: true, force: true }); }
    catch { verifyError = verifyError || "probe_cleanup_failed"; }
  }
}
if (probeDir && pathExists(probeDir)) verifyError = verifyError || "probe_cleanup_failed";
if (verifyError) fail(verifyError);

// Re-check the artifact after the probe copy has been closed and removed.
// These checks intentionally inspect the original snapshot, never open it.
if (pathExists(dest + "-wal") || pathExists(dest + "-shm")) fail("sidecar_present");
process.stdout.write(JSON.stringify({
  ok: true,
  bytes: statSync(dest).size,
  integrity,
  journalMode
}) + "\n");
