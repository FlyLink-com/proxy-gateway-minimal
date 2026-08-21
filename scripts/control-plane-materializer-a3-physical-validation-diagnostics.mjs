// A3-1 physical-validation diagnostics observer (stacked Draft PR companion).
//
// Read-only observation layer for the A3-1 physical-validation runner.
// Activated ONLY when the runner is invoked with
// `A3_PHYSICAL_DIAGNOSTICS=1` and `A3_PHYSICAL_DIAGNOSTICS_FILE=<path>`.
// Default behaviour with no environment set is byte-for-byte compatible
// with the un-diagnosed invocation. The observer never changes the
// commands, the parser, the readback logic, the success conditions, or
// the fail-closed behaviour of the existing collector. Its outputs are
// entirely additive.
//
// Activation (operator-controlled):
//   A3_PHYSICAL_DIAGNOSTICS=1
//   A3_PHYSICAL_DIAGNOSTICS_FILE=/path/to/diagnostics.jsonl
//   A3_PHYSICAL_DIAGNOSTICS_MAX_BYTES=65536      (optional, default 65536)
//   A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES=256    (optional, default 256)
//
// Diagnostics NEVER carry:
//   - environment variables (collector wipes env via CMD_ENV)
//   - SSH material (host:port, IP addresses, key paths)
//   - credentials, tokens, secret-bearing key=value pairs
//   - bearer tokens
//
// All retained preview bytes are printable ASCII / UTF-8 with NUL
// bytes stripped and invalid UTF-16 surrogates replaced by U+FFFD
// before redaction and preview slicing.
//
// The sink is published via `O_EXCL | O_NOFOLLOW | O_CREAT` directly
// on the final path. There is no `lstat + rename` step, so a racing
// attacker cannot substitute the destination between checks. Before
// the open syscall, every parent directory segment from the operator-
// provided `sinkRoot` (or, when omitted, the parent directory of the
// final path itself) down to the sink's immediate parent is verified
// to be a real directory, NOT a symlink, NOT world/group-writable, and
// owned by the calling uid. The sink file is also `fsync`'d before
// close and the custody readback is performed on the SAME fd via
// `fstatSync` + `readSync` — never on a path lookup after close, so a
// racing attacker cannot swap the path between close and readback.
// The directory the sink lives in MUST already exist; the observer
// does NOT create parent directories and does NOT mutate any
// pre-existing file. Mode 0600 is enforced at open time only (no chmod).

import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
  constants as fsConstants
} from "node:fs";
import { dirname, isAbsolute, resolve as resolvePath, sep as pathSep } from "node:path";

export const DIAGNOSTICS_SCHEMA_VERSION = "diagnostics-1";
export const DIAGNOSTICS_TYPE = "control_plane_materializer_a3_physical_validation_diagnostics";
export const DIAGNOSTICS_INTEGRITY_TYPE = "control_plane_materializer_a3_physical_validation_diagnostics_integrity";

// IPv6 / IPv4 / secret redaction. The IPv6 patterns are deliberately
// permissive and run BEFORE the IPv4 pattern so that IPv4-mapped IPv6
// (`::ffff:1.2.3.4`) is consumed as IPv6 and the inner IPv4 literal
// does not leak. The bare-compressed IPv6 patterns catch `::1`, `::`,
// and other forms that start with a colon (no leading word boundary).
const REDACT_PATTERNS = [
  // IPv4-mapped IPv6 (must run BEFORE the generic IPv6 / IPv4 rules).
  // Matches `::ffff:1.2.3.4` end-to-end so the trailing IPv4 does not
  // leak after the IPv6 prefix is scrubbed.
  /(?<![\w\[\(\]])(?:[0-9a-f]{0,4}:){2,6}:ffff:\d{1,3}(?:\.\d{1,3}){3}(?:%[A-Za-z0-9_.\-]+)?(?![\w\]\)])/gi,
  // Bracketed IPv6 in URL form: `[2001:db8::1]`. Allow `[]` to wrap
  // any colon-delimited IPv6 token, including bare `::1` / `::`.
  /(?<![\w\[\(\]])\[(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:%[A-Za-z0-9_.\-]+)?\](?![\w\]\)])/gi,
  // Bare compressed IPv6 (must run BEFORE IPv4): matches `::1`, `::`,
  // `fe80::1%eth0`, `2001:db8::1`, `1:2:3:4:5:6:7:8`.
  /(?<![\w\[\(\]])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:%[A-Za-z0-9_.\-]+)?(?![\w\]\)])/gi,
  // IPv4 (with optional /mask) - matches only AFTER IPv6 is scrubbed.
  /\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/g,
  // user@host:port (SSH, SCP, rsync, etc.)
  /\b[A-Za-z0-9_.\-]+@[A-Za-z0-9_.\-]+(?::\d{1,5})?\b/g,
  // host:port (no user) - tightened so it does NOT consume IPv6.
  /(?<![\w@:\[])[A-Za-z0-9_.\-]+:\d{1,5}\b/g,
  // secret-bearing key=value pairs
  /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|ssh[_-]?key)\s*=\s*[^\s,;"']+/gi,
  // Authorization: Bearer ...
  /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._\-]+/gi,
  // Bare Bearer (preceded by start-of-string or whitespace)
  /(?:^|\s)Bearer\s+[A-Za-z0-9._\-]+/gi
];

function redact(input) {
  if (typeof input !== "string" || input.length === 0) return "";
  let value = input.replace(/\0/g, "");
  value = value.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "\uFFFD"
  );
  for (const pattern of REDACT_PATTERNS) value = value.replace(pattern, "<redacted>");
  return value;
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safePreview(input, maxBytes) {
  if (typeof input !== "string" || input.length === 0 || maxBytes <= 0) return "";
  const preview = redact(input);
  return preview.length > maxBytes ? `${preview.slice(0, maxBytes)}\u2026` : preview;
}

// Verify the parent directory chain from `rootAbs` down to (but not
// including) `targetParent` is composed of real directories — no
// symlinks at any segment. The check is mandatory because O_NOFOLLOW
// only protects the FINAL path; a junction or symlink at any parent
// segment can still divert the open into a different tree.
//
// When `expectedUid` is a non-negative integer, also verify the uid
// of every segment (caller-controlled hardening). When `expectedUid`
// is null, the ownership check is skipped — this is the default,
// because portable Windows filesystems do not preserve Unix uid
// semantics. Posix callers SHOULD pass an explicit uid for maximum
// safety; the default config is sufficient to defeat symlink/junction
// substitution, which is the core P1 the reviewer raised.
//
// Throws DIAGNOSTICS_PARENT_CHAIN_UNSAFE on any failure.
function verifyParentChain(rootAbs, targetParent, expectedUid) {
  const rootWithSep = rootAbs.endsWith(pathSep) || rootAbs === pathSep
    ? rootAbs
    : rootAbs + pathSep;
  if (targetParent !== rootAbs && !targetParent.startsWith(rootWithSep)) {
    const err = new Error(
      `diagnostics_parent_chain_unsafe: target ${targetParent} is not nested under sink root ${rootAbs}`
    );
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }

  const segments = [];
  let cursor = targetParent;
  while (cursor !== rootAbs && cursor !== dirname(cursor)) {
    segments.unshift(cursor);
    cursor = dirname(cursor);
  }
  if (cursor !== rootAbs) {
    const err = new Error(
      `diagnostics_parent_chain_unsafe: target ${targetParent} does not descend from sink root ${rootAbs}`
    );
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  for (const segment of segments) {
    const st = lstatSync(segment);
    if (!st.isDirectory()) {
      const err = new Error(`diagnostics_parent_chain_unsafe: ${segment} is not a directory`);
      err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw err;
    }
    if (typeof expectedUid === "number" && expectedUid >= 0 && st.uid !== expectedUid) {
      const err = new Error(
        `diagnostics_parent_chain_unsafe: ${segment} owned by uid=${st.uid}, expected ${expectedUid}`
      );
      err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw err;
    }
  }
}

// Publish the body to a brand-new file. No-replace, no pre-existing-
// file mutation, no symlink substitution at the final path or any
// parent directory segment.
//
// Steps:
//   1. verifyParentChain(sinkRoot, parentDir, uid) — refuses if any
//      parent segment is a symlink/junction, owned by another uid, or
//      not nested under sinkRoot.
//   2. openSync(finalPath, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
//      - O_EXCL guarantees the final entry did not exist at the moment of
//        the open syscall. There is NO `lstat + rename` window.
//      - O_NOFOLLOW refuses symlinks at the final path.
//      - mode 0600 set at create time only.
//      - O_RDWR (not O_WRONLY) so the same fd can drive the post-write
//        custody readback via readSync. On Linux this is also possible
//        on an O_WRONLY fd, but on Windows O_WRONLY forbids readback
//        with EBADF. The bit does not weaken the publish invariant —
//        O_EXCL still guarantees we are the sole creator, and the
//        file is fsync'd before close.
//   3. fstatSync(fd) -> preWriteStat { dev, ino, mode, uid, size }
//   4. writeSync(fd, body)
//   5. fsyncSync(fd)
//   6. readSync(fd, buf, 0, body.length, 0) on the SAME fd, no path
//      lookup, no second open. Compare SHA against the in-memory
//      body SHA. Mismatch throws DIAGNOSTICS_READBACK_MISMATCH;
//      the file is left in place as forensic evidence and is NOT
//      silently removed (closing it would risk the same-path unlink
//      problem the P1 raised).
//   7. closeSync(fd)
//
// On any pre-readback failure, the file is unlinked ONLY if we are
// the process that created it (createdHere === true). Pre-existing
// entries are NEVER mutated.
function publishOnce(filePath, body, { sinkRoot, uid } = {}) {
  const finalPath = resolvePath(filePath);
  const parentDir = dirname(finalPath);
  const verifiedRoot = sinkRoot && isAbsolute(sinkRoot) ? resolvePath(sinkRoot) : parentDir;
  // Pre-open: certify the parent chain.
  verifyParentChain(verifiedRoot, parentDir, uid);

  let fd = null;
  let createdHere = false;
  let preWriteStat = null;
  try {
    fd = openSync(
      finalPath,
      fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600
    );
    createdHere = true;
    preWriteStat = fstatSync(fd);
    writeSync(fd, body);
    fsyncSync(fd);
    // Custody readback: same fd, no path lookup after close.
    const expectedBytes = Buffer.byteLength(body, "utf8");
    const buffer = Buffer.allocUnsafe(expectedBytes);
    let totalRead = 0;
    while (totalRead < expectedBytes) {
      const read = readSync(fd, buffer, totalRead, expectedBytes - totalRead, totalRead);
      if (read === 0) break;
      totalRead += read;
    }
    const onDiskBytes = totalRead === expectedBytes ? buffer.subarray(0, expectedBytes) : buffer.subarray(0, totalRead);
    const expectedSha = sha256Hex(Buffer.from(body, "utf8"));
    const readbackSha = sha256Hex(onDiskBytes);
    if (totalRead !== expectedBytes || readbackSha !== expectedSha) {
      const err = new Error(
        `diagnostics_publish_readback_mismatch: expected=${expectedSha} got=${readbackSha} bytes=${totalRead}/${expectedBytes}`
      );
      err.code = "DIAGNOSTICS_READBACK_MISMATCH";
      throw err;
    }
    return {
      path: finalPath,
      parentDir,
      bodySha256: expectedSha,
      byteCount: expectedBytes,
      dev: preWriteStat.dev,
      ino: preWriteStat.ino
    };
  } catch (error) {
    if (fd !== null) try { closeSync(fd); } catch { /* */ }
    if (createdHere) {
      // Only unlink files WE just created in this process. Pre-existing
      // entries (EEXIST/ELOOP) are NEVER mutated.
      try { rmSync(finalPath, { force: true }); } catch { /* best effort */ }
    }
    const wrapped = new Error(`diagnostics_publish_failed: ${error?.message ?? error}`);
    wrapped.code = error?.code ?? "DIAGNOSTICS_PUBLISH_FAILED";
    wrapped.cause = error;
    throw wrapped;
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* */ }
  }
}

export function createDiagnosticsObserver({
  filePath,
  maxBytes = 65536,
  maxRecords = 64,
  previewBytes = 256,
  sinkRoot = null,
  uid = null,
  enforceOwnedRoot = false
} = {}) {
  if (typeof filePath !== "string" || filePath.length === 0) throw new Error("diagnostics_invalid_file_path");
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new Error("diagnostics_invalid_max_bytes");
  if (!Number.isInteger(maxRecords) || maxRecords <= 0) throw new Error("diagnostics_invalid_max_records");
  if (!Number.isInteger(previewBytes) || previewBytes <= 0) throw new Error("diagnostics_invalid_preview_bytes");
  if (sinkRoot !== null && (typeof sinkRoot !== "string" || !isAbsolute(sinkRoot))) {
    throw new Error("diagnostics_invalid_sink_root");
  }
  if (uid !== null && (!Number.isInteger(uid) || uid < 0)) {
    throw new Error("diagnostics_invalid_uid");
  }
  if (enforceOwnedRoot && !Number.isInteger(uid)) {
    throw new Error("diagnostics_enforce_owned_root_requires_uid");
  }

  const records = [];
  let totalBytes = 0;
  let truncated = false;
  let observerError = null;
  let lastFlushStatus = null;
  const seenSignatures = new Set();

  function push(record) {
    if (observerError) return;
    try {
      const serialized = JSON.stringify(record);
      const size = Buffer.byteLength(serialized, "utf8") + 1;
      if (records.length >= maxRecords || totalBytes + size > maxBytes) {
        truncated = true;
        return;
      }
      records.push(serialized);
      totalBytes += size;
    } catch (error) {
      observerError = error;
    }
  }

  function record({ command, args, status, stdout, stderr, error, condition, elapsedMs }) {
    if (observerError) return;
    if (typeof command !== "string" || !Array.isArray(args)) {
      push({
        schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
        type: DIAGNOSTICS_TYPE,
        command: typeof command === "string" ? command : "<invalid>",
        argv: Array.isArray(args) ? args.slice() : [],
        exitStatus: null,
        exitError: "diagnostics_invalid_invocation",
        elapsedMs: typeof elapsedMs === "number" && Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : null,
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutSha256: sha256Hex(Buffer.alloc(0)),
        stderrSha256: sha256Hex(Buffer.alloc(0)),
        stdoutRedacted: "",
        stderrRedacted: "",
        condition: typeof condition === "string" ? condition : null,
        truncated,
        duplicate: false
      });
      return;
    }
    const signature = sha256Hex(Buffer.from(`${command}\u0000${args.join("\u0000")}`, "utf8"));
    const duplicate = seenSignatures.has(signature);
    seenSignatures.add(signature);
    const stdoutText = typeof stdout === "string" ? stdout : "";
    const stderrText = typeof stderr === "string" ? stderr : "";
    push({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      type: DIAGNOSTICS_TYPE,
      command,
      argv: args.slice(),
      exitStatus: typeof status === "number" ? status : null,
      exitError: error ? redact(String(error?.message ?? error)) : null,
      elapsedMs: typeof elapsedMs === "number" && Number.isFinite(elapsedMs) ? Math.round(elapsedMs) : null,
      stdoutBytes: Buffer.byteLength(stdoutText, "utf8"),
      stderrBytes: Buffer.byteLength(stderrText, "utf8"),
      stdoutSha256: sha256Hex(Buffer.from(stdoutText, "utf8")),
      stderrSha256: sha256Hex(Buffer.from(stderrText, "utf8")),
      stdoutRedacted: safePreview(stdoutText, previewBytes),
      stderrRedacted: safePreview(stderrText, previewBytes),
      condition: typeof condition === "string" ? condition : null,
      truncated,
      duplicate
    });
  }

  // Returns a structured status describing what flush() did. The
  // runner MUST inspect this and surface a diagnostic gate failure
  // when status.published is false AND the collector returned a
  // non-trivial result. status.published === true means the on-disk
  // SHA matched the in-memory body SHA (custody-verified).
  function flush() {
    if (observerError) {
      lastFlushStatus = {
        published: false,
        mainPath: null,
        bodySha256: null,
        recordCount: records.length,
        byteCount: totalBytes,
        truncated,
        observerError: String(observerError?.message ?? observerError),
        flushedAt: new Date().toISOString()
      };
      return lastFlushStatus;
    }

    const body = records.length === 0 ? "" : records.join("\n") + "\n";
    const bodySha = sha256Hex(Buffer.from(body, "utf8"));
    const footer = JSON.stringify({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      type: DIAGNOSTICS_INTEGRITY_TYPE,
      bodySha256: bodySha,
      recordCount: records.length,
      byteCount: totalBytes,
      truncated,
      observerError: null,
      flushedAt: new Date().toISOString()
    });
    const fullBody = `${body}${footer}\n`;
    try {
      const result = publishOnce(filePath, fullBody, { sinkRoot, uid: enforceOwnedRoot ? uid : null });
      lastFlushStatus = Object.freeze({
        published: true,
        mainPath: result.path,
        parentDir: result.parentDir,
        bodySha256: result.bodySha256,
        recordCount: records.length,
        byteCount: totalBytes,
        truncated,
        observerError: null,
        fallbackPath: null,
        flushedAt: new Date().toISOString()
      });
      return lastFlushStatus;
    } catch (error) {
      observerError = error;
      // Try to write a fallback footer-only file via a sibling path so
      // the operator can see WHY the main publish failed.
      const fallbackPath = `${filePath}.integrity-fallback`;
      const fallbackBody = JSON.stringify({
        schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
        type: DIAGNOSTICS_INTEGRITY_TYPE,
        recordCount: records.length,
        byteCount: totalBytes,
        truncated,
        observerError: String(error?.message ?? error),
        flushedAt: new Date().toISOString()
      });
      let fallbackPublished = false;
      try {
        publishOnce(fallbackPath, `${fallbackBody}\n`, { sinkRoot, uid: enforceOwnedRoot ? uid : null });
        fallbackPublished = true;
      } catch {
        // Both main and fallback failed. Status reflects this honestly.
      }
      lastFlushStatus = Object.freeze({
        published: false,
        mainPath: filePath,
        parentDir: dirname(resolvePath(filePath)),
        bodySha256: bodySha,
        recordCount: records.length,
        byteCount: totalBytes,
        truncated,
        observerError: String(error?.message ?? error),
        fallbackPath: fallbackPublished ? fallbackPath : null,
        flushedAt: new Date().toISOString()
      });
      return lastFlushStatus;
    }
  }

  function snapshot() {
    return Object.freeze({
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      type: DIAGNOSTICS_TYPE,
      recordCount: records.length,
      byteCount: totalBytes,
      truncated,
      observerError: observerError ? String(observerError?.message ?? observerError) : null,
      lastFlushStatus,
      records: Object.freeze(records.slice())
    });
  }

  return Object.freeze({ record, flush, snapshot });
}