import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";

const TABLES = Object.freeze({
  samples: "platform_usage_samples",
  rollups: "platform_usage_rollups",
  cursors: "platform_usage_counter_cursors"
});

function reject() {
  throw Object.assign(new Error("backup_boundary_invalid"), { rejected: true });
}

function pathInput(value) {
  if (typeof value !== "string" || !value || value !== value.trim()
    || value.includes("\0") || !isAbsolute(value) || resolve(value) !== value) reject();
  return value;
}

function absent(path) {
  try { lstatSync(path); return false; }
  catch (error) { if (error?.code === "ENOENT") return true; throw error; }
}

function noLinkedAncestors(path) {
  let current = path;
  for (;;) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) reject();
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function protectedDirectory(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) reject();
  if (process.platform !== "win32"
    && (stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)) reject();
  return stat;
}

function protectedAncestorChain(path) {
  noLinkedAncestors(path);
  if (process.platform === "win32") return;
  let current = path;
  let child;
  for (;;) {
    const stat = lstatSync(current);
    if (stat.uid !== process.getuid() && stat.uid !== 0) reject();
    if ((stat.mode & 0o022) !== 0
      && !((stat.mode & 0o1000) !== 0 && child?.uid === process.getuid())) reject();
    const parent = dirname(current);
    if (parent === current) return;
    child = stat;
    current = parent;
  }
}

function sameObject(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function safeCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("invalid_count");
  return count;
}

function accountingEvidence(db) {
  db.defaultSafeIntegers(true);
  const counts = {};
  const byteSums = {};
  for (const [label, table] of Object.entries(TABLES)) {
    if (db.prepare("SELECT type FROM sqlite_schema WHERE name = ?").get(table)?.type !== "table") {
      throw new Error("accounting_table_required");
    }
    counts[label] = safeCount(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
    if (label !== "cursors") {
      const aggregate = db.prepare(`SELECT
        COALESCE(SUM(upload_bytes), 0) AS upload,
        COALESCE(SUM(download_bytes), 0) AS download,
        COALESCE(SUM(total_bytes), 0) AS total FROM ${table}`).get();
      if (Object.values(aggregate).some((value) => typeof value !== "bigint" || value < 0n)) {
        throw new Error("accounting_aggregate_invalid");
      }
      byteSums[label] = aggregate;
    }
  }
  return {
    counts,
    byteSumsEqual: ["upload", "download", "total"]
      .every((key) => byteSums.samples[key] === byteSums.rollups[key])
  };
}

// Source-only helper. It does not authorize host access, collection, or restore.
// Each call owns a previously absent directory under an already protected base.
export async function createTrafficRecoveryOnlineBackup({ sourcePath, destinationPath } = {}) {
  let source;
  let target;
  let destinationFd;
  let directoryCreated = false;
  let fileCreated = false;
  let sourceOpenedReadOnly = false;
  let stage = "boundary";
  const safety = {
    productionCollectionAuthorized: false,
    sourceCheckpointPerformed: false,
    windowsAclVerified: false
  };
  try {
    sourcePath = pathInput(sourcePath);
    destinationPath = pathInput(destinationPath);
    if (sourcePath === destinationPath || /[:. ]$/.test(basename(destinationPath))
      || basename(destinationPath).includes(":")) reject();
    const destinationDirectory = dirname(destinationPath);
    const protectedBase = dirname(destinationDirectory);
    noLinkedAncestors(dirname(sourcePath));
    protectedAncestorChain(protectedBase);
    const baseIdentity = protectedDirectory(protectedBase);
    if (!absent(destinationDirectory) || !absent(destinationPath)) reject();
    if (absent(sourcePath)) reject();
    const sourceIdentity = lstatSync(sourcePath);
    if (sourceIdentity.isSymbolicLink() || !sourceIdentity.isFile()) reject();

    stage = "source";
    source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    source.pragma("query_only = ON");
    sourceOpenedReadOnly = source.readonly === true
      && source.pragma("query_only", { simple: true }) === 1;
    if (!sourceOpenedReadOnly || !sameObject(sourceIdentity, lstatSync(sourcePath))) {
      throw new Error("source_boundary_changed");
    }
    // Read only enough to reject an invalid database before creating output.
    source.prepare("SELECT COUNT(*) AS count FROM sqlite_schema").get();

    stage = "destination";
    mkdirSync(destinationDirectory, { mode: 0o700 });
    directoryCreated = true;
    chmodSync(destinationDirectory, 0o700);
    const directoryIdentity = protectedDirectory(destinationDirectory);
    destinationFd = openSync(destinationPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR
      | (constants.O_NOFOLLOW || 0), 0o600);
    fileCreated = true;
    chmodSync(destinationPath, 0o600);
    const destinationIdentity = fstatSync(destinationFd);

    function assertBoundary() {
      noLinkedAncestors(destinationDirectory);
      protectedAncestorChain(protectedBase);
      const baseNow = protectedDirectory(protectedBase);
      const directoryNow = protectedDirectory(destinationDirectory);
      const fileNow = lstatSync(destinationPath);
      const sourceNow = lstatSync(sourcePath);
      if (!sameObject(baseIdentity, baseNow) || !sameObject(directoryIdentity, directoryNow)
        || !sameObject(destinationIdentity, fileNow) || fileNow.isSymbolicLink() || !fileNow.isFile()
        || !sameObject(sourceIdentity, sourceNow) || sourceNow.isSymbolicLink()
        || fileNow.nlink !== 1
        || (process.platform !== "win32"
          && (fileNow.uid !== process.getuid() || (fileNow.mode & 0o777) !== 0o600))) {
        throw new Error("backup_boundary_changed");
      }
    }

    assertBoundary();
    stage = "transfer";
    await source.backup(destinationPath, {
      progress: () => { assertBoundary(); return 100; }
    });
    source.close();
    source = null;
    assertBoundary();

    stage = "verification";
    // Only the independently created destination is normalized or written.
    target = new Database(destinationPath, { fileMustExist: true });
    if (target.pragma("journal_mode = DELETE", { simple: true }) !== "delete") {
      throw new Error("standalone_mode_required");
    }
    target.pragma("query_only = ON");
    const integrity = target.pragma("integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error("integrity_check_failed");
    }
    if (target.pragma("foreign_key_check").length !== 0) throw new Error("foreign_key_check_failed");
    const evidence = accountingEvidence(target);
    target.close();
    target = null;
    assertBoundary();
    if (!absent(`${destinationPath}-wal`) || !absent(`${destinationPath}-shm`)
      || !absent(`${destinationPath}-journal`)) throw new Error("standalone_output_required");
    fsyncSync(destinationFd);
    const beforeHash = fstatSync(destinationFd);
    const sha256 = createHash("sha256").update(readFileSync(destinationFd)).digest("hex");
    const afterHash = fstatSync(destinationFd);
    if (beforeHash.size !== afterHash.size || beforeHash.mtimeMs !== afterHash.mtimeMs) {
      throw new Error("backup_changed_during_verification");
    }
    assertBoundary();
    closeSync(destinationFd);
    destinationFd = undefined;
    if (process.platform !== "win32") {
      for (const directory of [destinationDirectory, protectedBase]) {
        const directoryFd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
      }
    }
    return {
      type: "traffic_recovery_online_backup", ok: true, status: "backup_verified", verified: true,
      ...safety, sourceOpenedReadOnly, exclusiveDirectoryCreated: true,
      posixProtectionVerified: process.platform !== "win32",
      integrityCheckPassed: true, foreignKeyCheckPassed: true, standalone: true,
      ...evidence, sizeBytes: afterHash.size, sha256, partialRetained: false, partialState: "none"
    };
  } catch (error) {
    return {
      type: "traffic_recovery_online_backup", ok: false,
      status: stage === "boundary" || error?.rejected === true ? "backup_rejected" : "backup_failed",
      errorCode: stage === "boundary" || error?.rejected === true
        ? "traffic_recovery_backup_boundary_invalid" : "traffic_recovery_backup_failed",
      verified: false, ...safety, sourceOpenedReadOnly,
      partialRetained: directoryCreated,
      partialState: fileCreated ? "unverified_file" : directoryCreated ? "directory_only" : "none"
    };
  } finally {
    try { if (target?.open) target.close(); } catch { /* Only fixed errors are returned. */ }
    try { if (source?.open) source.close(); } catch { /* Never restore or modify the source. */ }
    try { if (destinationFd !== undefined) closeSync(destinationFd); } catch { /* Retain protected partial output. */ }
  }
}
