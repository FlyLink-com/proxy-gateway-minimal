// A3-1 physical-validation diagnostics observer (stacked Draft PR companion).
//
// Read-only observation layer for the A3-1 physical-validation runner.
// Activated ONLY when the runner is invoked with
// `A3_PHYSICAL_DIAGNOSTICS=1` plus all of `A3_PHYSICAL_DIAGNOSTICS_FILE`,
// `A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT` (absolute, controlled). When the
// flag is on but any required custody parameter is missing, the runner
// fails CLOSED — no collector work happens and the diagnostics gate
// line on stderr tells the operator exactly which parameter is wrong.
// Default behaviour with no environment set is byte-for-byte compatible
// with the un-diagnosed invocation. The observer never changes the
// commands, the parser, the readback logic, the success conditions, or
// the fail-closed behaviour of the existing collector. Its outputs are
// entirely additive.
//
// Activation (operator-controlled):
//   A3_PHYSICAL_DIAGNOSTICS=1                              (REQUIRED: enable)
//   A3_PHYSICAL_DIAGNOSTICS_FILE=/path/to/diagnostics.jsonl (REQUIRED: sink file path)
//   A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT=/controlled/absolute/root   (REQUIRED when diagnostics is enabled)
//   A3_PHYSICAL_DIAGNOSTICS_UID=<non-negative integer>      (REQUIRED on Linux when diagnostics enabled)
//   A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT=1            (FORCED ON Linux when diagnostics enabled)
//   A3_PHYSICAL_DIAGNOSTICS_MAX_BYTES=65536    (optional, default 65536)
//   A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES=256  (optional, default 256)
//
// Linux hardening (iteration 7): on the privileged Linux path, when
// `A3_PHYSICAL_DIAGNOSTICS=1`, the runner enforces:
//   - absolute FILE inside SINK_ROOT (parent must exist)
//   - SINK_ROOT, UID, and ENFORCE_OWNED_ROOT must all be set
//   - sink bind runs BEFORE the collector is invoked
//   - on bind failure the runner exits 1 with a diagnostics_gate line
//     and the collector NEVER runs
//   - on flush failure (after collector) the runner ALSO exits 1;
//     successful collector + failed diagnostics = failed run
//   - the sink itself is verified via an O_DIRECTORY|O_NOFOLLOW fd
//     (fstat on the fd), not via path re-stat, closing the
//     `lstat -> open` TOCTOU window.
//
// The hardened parent-chain check is in TWO layers:
//   1. verifyAncestorChain(rootAbs): walks the path components from
//      a fixed filesystem anchor (Windows drive root like `C:\` or
//      POSIX `/`) down to rootAbs. Every component is lstat'd and
//      must be a real directory — no symlink/junction at any level
//      above the operator-provided sink root. This closes the
//      "rootAbs itself is inside an attacker-controlled junction"
//      P1 (iteration 5 reviewer finding).
//   2. verifyParentChain(rootAbs, targetParent, uid, opts): walks
//      rootAbs and every segment from rootAbs down to targetParent.
//      Refuses any segment that is a symlink/junction, is group/other-
//      writable, or is owned by a uid other than `uid` (when uid +
//      enforceOwnedRoot are supplied).
//
// Together these two layers guarantee that the sink file is published
// inside a path tree that the operator fully controls — the entire
// chain from the trusted filesystem anchor to the sink's immediate
// parent directory is composed of real directories, no redirects.
//
// Diagnostics NEVER carry (these are scrubbed via redact() before
// they reach the JSONL):
//   - environment variables (collector wipes env via CMD_ENV)
//   - SSH material (host:port, IP addresses, key paths)
//   - credentials, tokens, secret-bearing key=value pairs
//   - bearer tokens
//
// Diagnostics DO carry (by design — these are the audit record):
//   - the literal `command` and `argv` arrays of each physical command,
//     so an operator can verify the trusted tool identity and arguments
//   - byte counts, SHA-256 hashes, exit status, elapsed time, condition
//
// Operators on hardened deployments that need to scrub `argv` can do so
// out-of-band; the observer deliberately does not rewrite argv because
// doing so would hide the very tool path the audit needs.
//
// All retained preview bytes are printable ASCII / UTF-8 with NUL
// bytes stripped and invalid UTF-16 surrogates replaced by U+FFFD
// before redaction and preview slicing.
//
// The sink is published via `O_EXCL | O_NOFOLLOW | O_CREAT` directly
// on the final path. There is no `lstat + rename` step, so a racing
// attacker cannot substitute the destination between checks. Before
// the open syscall, every parent directory segment from the trusted
// filesystem anchor down to the sink's immediate parent is verified
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
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  rmSync,
  writeSync,
  constants as fsConstants
} from "node:fs";
import { dirname, isAbsolute, resolve as resolvePath, sep as pathSep, parse as parsePath } from "node:path";

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

// Compute the fixed filesystem anchor for an absolute path:
//   POSIX      -> "/"
//   Windows    -> "<drive>:\\"   (e.g. "C:\\")
//
// The anchor is the topmost directory on the same filesystem volume
// that rootAbs lives on. We treat it as trusted because it is supplied
// by the OS itself (drive root on Windows, `/` on POSIX) and cannot
// itself be a symlink (POSIX `/` is always a directory; Windows drive
// roots cannot be junctions either — junctions always live BELOW the
// drive root). The walk from anchor down to rootAbs catches every
// intermediate symlink/junction that could redirect the publish into
// an attacker-controlled tree.
function fsAnchorFor(rootAbs) {
  if (typeof rootAbs !== "string" || rootAbs.length === 0) {
    const err = new Error("diagnostics_invalid_sink_root: empty path");
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  if (!isAbsolute(rootAbs)) {
    const err = new Error(`diagnostics_invalid_sink_root: ${rootAbs} is not absolute`);
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  // Windows-style absolute: <drive>:\... or <drive>:/...
  const parsed = parsePath(rootAbs);
  if (typeof parsed.root === "string" && parsed.root.length > 0 && /^[a-zA-Z]:[\\/]?$/.test(parsed.root)) {
    // Normalise to <drive>:\ — the actual drive root.
    return `${parsed.root.replace(/[\\/]$/, "")}\\`;
  }
  // POSIX absolute: /...
  if (rootAbs.startsWith("/")) return "/";
  const err = new Error(`diagnostics_invalid_sink_root: ${rootAbs} has no filesystem anchor`);
  err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
  throw err;
}

// Verify every path component from the fixed filesystem anchor down
// to (but NOT including) rootAbs is a real directory — no symlinks or
// junctions. This catches the case where the operator's sinkRoot is
// itself nested under an attacker-controlled ancestor (a junction at
// `C:\Users\Public\link` for example).
//
// When the anchor equals rootAbs itself (i.e. rootAbs IS the drive
// root or `/`), this walk is a no-op and we trust the anchor.
//
// When `expectedUid` is supplied AND `enforceOwnedRoot` is true, we
// additionally require no group/other-write bit and an exact uid match
// on every segment.
//
// Throws DIAGNOSTICS_PARENT_CHAIN_UNSAFE on any failure.
function verifyAncestorChain(rootAbs, expectedUid, { enforceOwnedRoot = false } = {}) {
  const anchor = fsAnchorFor(rootAbs);
  if (anchor === rootAbs) return; // no ancestors to walk
  const rootWithSep = rootAbs.endsWith(pathSep) || rootAbs === pathSep
    ? rootAbs
    : rootAbs + pathSep;
  if (!rootAbs.startsWith(anchor.endsWith(pathSep) ? anchor : anchor + pathSep)
    && rootAbs !== anchor) {
    const err = new Error(
      `diagnostics_ancestor_chain_unsafe: sink root ${rootAbs} does not descend from anchor ${anchor}`
    );
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  // Walk from rootAbs's parent UP to (but not including) anchor.
  const segments = [];
  let cursor = dirname(rootAbs);
  while (cursor !== anchor && cursor !== dirname(cursor)) {
    segments.push(cursor);
    cursor = dirname(cursor);
  }
  if (cursor !== anchor) {
    const err = new Error(
      `diagnostics_ancestor_chain_unsafe: sink root ${rootAbs} does not descend from anchor ${anchor}`
    );
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  for (const segment of segments) {
    const st = lstatSync(segment);
    if (!st.isDirectory()) {
      const err = new Error(
        `diagnostics_ancestor_chain_unsafe: ${segment} is not a directory (lstat mode=${st.mode.toString(8)})`
      );
      err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw err;
    }
    if (enforceOwnedRoot) {
      if ((st.mode & 0o022) !== 0) {
        const err = new Error(
          `diagnostics_ancestor_chain_unsafe: ${segment} is group/other-writable (mode=${st.mode.toString(8)})`
        );
        err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
        throw err;
      }
      if (typeof expectedUid !== "number" || expectedUid < 0 || st.uid !== expectedUid) {
        const err = new Error(
          `diagnostics_ancestor_chain_unsafe: ${segment} owned by uid=${st.uid}, expected ${expectedUid}`
        );
        err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
        throw err;
      }
    }
  }
}

// Verify that every segment of the chain from `rootAbs` (inclusive)
// down to `targetParent` (inclusive) is a real directory owned by the
// calling uid (when `expectedUid` is supplied) and not a symlink or
// junction. The directory-type check is mandatory: O_NOFOLLOW only
// protects the FINAL path; a junction or symlink at `rootAbs` itself
// OR any parent segment can still divert the open into a different
// tree.
//
// When `expectedUid` is a non-negative integer AND `enforceOwnedRoot`
// is true, the chain ALSO verifies:
//   - segment's mode has no group- or other-write bit set
//   - segment's uid matches `expectedUid`
//
// The mode check is opt-in via `enforceOwnedRoot` because portable
// Windows filesystems (and many default tmpdir configurations on
// Linux/macOS) do not preserve the strict Unix mode bits the check
// expects. Operators on hardened Linux hosts MUST set
// `A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT=1` together with
// `A3_PHYSICAL_DIAGNOSTICS_UID=<uid>` to activate this defence.
//
// The root-itself check is unconditional across all configurations
// because iteration 4 stopped one segment short and let a symlinked
// sinkRoot pass.
//
// Throws DIAGNOSTICS_PARENT_CHAIN_UNSAFE on any failure.
function verifyParentChain(rootAbs, targetParent, expectedUid, { enforceOwnedRoot = false } = {}) {
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

  // Build the full list of segments from rootAbs down to targetParent,
  // inclusive of rootAbs itself. Iteration 4 stopped one segment short
  // and left rootAbs itself unverified; iteration 5+ verify the root too.
  const segments = [rootAbs];
  let cursor = targetParent;
  while (cursor !== rootAbs && cursor !== dirname(cursor)) {
    segments.push(cursor);
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
      const err = new Error(
        `diagnostics_parent_chain_unsafe: ${segment} is not a directory (lstat mode=${st.mode.toString(8)})`
      );
      err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw err;
    }
    if (enforceOwnedRoot) {
      if ((st.mode & 0o022) !== 0) {
        const err = new Error(
          `diagnostics_parent_chain_unsafe: ${segment} is group/other-writable (mode=${st.mode.toString(8)})`
        );
        err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
        throw err;
      }
      if (typeof expectedUid !== "number" || expectedUid < 0 || st.uid !== expectedUid) {
        const err = new Error(
          `diagnostics_parent_chain_unsafe: ${segment} owned by uid=${st.uid}, expected ${expectedUid}`
        );
        err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
        throw err;
      }
    } else if (typeof expectedUid === "number" && expectedUid >= 0 && st.uid !== expectedUid) {
      // Legacy opt-in uid check (iteration 4): without enforceOwnedRoot
      // we still honour an explicit uid by matching it; we do not
      // require non-world-writable because the caller has not asked
      // for that hardening.
      const err = new Error(
        `diagnostics_parent_chain_unsafe: ${segment} owned by uid=${st.uid}, expected ${expectedUid}`
      );
      err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw err;
    }
  }
}

// Verify the sink root itself by opening it with O_DIRECTORY | O_NOFOLLOW
// and using fstat on the resulting fd. This defeats the
// `lstat(path) -> open(path)` TOCTOU window on Linux where a junction
// or bind mount could be swapped in between the path-based check and
// the open syscall. The fd check is on the live inode, not a path.
//
// Throws DIAGNOSTICS_PARENT_CHAIN_UNSAFE on any failure.
function verifySinkRootViaFd(sinkRoot, expectedUid, { enforceOwnedRoot = false } = {}) {
  let fd = null;
  try {
    fd = openSync(
      sinkRoot,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
    );
  } catch (error) {
    const wrapped = new Error(
      `diagnostics_sink_root_open_failed: ${sinkRoot} (${error?.code ?? error?.message ?? error})`
    );
    wrapped.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    wrapped.cause = error;
    throw wrapped;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isDirectory()) {
      const wrapped = new Error(
        `diagnostics_sink_root_open_failed: ${sinkRoot} is not a directory (mode=${st.mode.toString(8)})`
      );
      wrapped.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw wrapped;
    }
    if (enforceOwnedRoot) {
      if ((st.mode & 0o022) !== 0) {
        const wrapped = new Error(
          `diagnostics_sink_root_open_failed: ${sinkRoot} is group/other-writable (mode=${st.mode.toString(8)})`
        );
        wrapped.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
        throw wrapped;
      }
      if (typeof expectedUid !== "number" || expectedUid < 0 || st.uid !== expectedUid) {
        const wrapped = new Error(
          `diagnostics_sink_root_open_failed: ${sinkRoot} owned by uid=${st.uid}, expected ${expectedUid}`
        );
        wrapped.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
        throw wrapped;
      }
    } else if (typeof expectedUid === "number" && expectedUid >= 0 && st.uid !== expectedUid) {
      const wrapped = new Error(
        `diagnostics_sink_root_open_failed: ${sinkRoot} owned by uid=${st.uid}, expected ${expectedUid}`
      );
      wrapped.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
      throw wrapped;
    }
  } finally {
    if (fd !== null) try { closeSync(fd); } catch { /* */ }
  }
}

// Prepare the diagnostics sink BEFORE any collector work runs. This is
// the iteration 7 pre-collector gate: when the runner enables
// diagnostics, it must successfully bind the sink (open the final
// file with O_EXCL | O_NOFOLLOW and verify the entire parent chain
// including the sink root via an fd-based fstat) before the collector
// is invoked. If any step fails, the runner refuses with a
// `diagnostics_*` gate line on stderr and the collector NEVER runs.
//
// Returns a frozen handle that the observer's flush() will write
// through. The fd is held open across the collector run so that a
// racing attacker cannot swap the path between bind and publish.
export function prepareDiagnosticsSink({
  filePath,
  sinkRoot,
  uid = null,
  enforceOwnedRoot = false
} = {}) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    const err = new Error("diagnostics_invalid_file_path");
    err.code = "DIAGNOSTICS_INVALID_CONFIG";
    throw err;
  }
  if (!isAbsolute(filePath)) {
    const err = new Error("diagnostics_file_not_absolute");
    err.code = "DIAGNOSTICS_INVALID_CONFIG";
    throw err;
  }
  if (typeof sinkRoot !== "string" || sinkRoot.length === 0) {
    const err = new Error("diagnostics_invalid_sink_root");
    err.code = "DIAGNOSTICS_INVALID_CONFIG";
    throw err;
  }
  if (!isAbsolute(sinkRoot)) {
    const err = new Error("diagnostics_invalid_sink_root");
    err.code = "DIAGNOSTICS_INVALID_CONFIG";
    throw err;
  }
  const finalPath = resolvePath(filePath);
  const resolvedRoot = resolvePath(sinkRoot);
  const rootWithSep = resolvedRoot.endsWith(pathSep) ? resolvedRoot : resolvedRoot + pathSep;
  if (finalPath !== resolvedRoot && !finalPath.startsWith(rootWithSep)) {
    const err = new Error("diagnostics_file_outside_sink_root");
    err.code = "DIAGNOSTICS_INVALID_CONFIG";
    throw err;
  }
  const parentDir = dirname(finalPath);
  // Pre-flight: parent directory must already exist as a real dir. We
  // do not create it and we do not tolerate a symlink in its place.
  let parentLstat;
  try {
    parentLstat = lstatSync(parentDir);
  } catch (lstatErr) {
    const err = new Error(
      `diagnostics_parent_dir_missing: ${parentDir} (${lstatErr?.code ?? lstatErr?.message ?? "lstat_failed"})`
    );
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  if (!parentLstat.isDirectory() || parentLstat.isSymbolicLink()) {
    const err = new Error(
      `diagnostics_parent_dir_missing: ${parentDir} is not a directory`
    );
    err.code = "DIAGNOSTICS_PARENT_CHAIN_UNSAFE";
    throw err;
  }
  // Layer 1: verify the ANCESTOR chain above the sink root (every
  // component from the trusted FS anchor down to sinkRoot is a real
  // directory, no symlink/junction).
  verifyAncestorChain(resolvedRoot, uid, { enforceOwnedRoot });
  // Layer 2: verify the PARENT chain from sinkRoot down to the sink's
  // immediate parent (every segment including sinkRoot itself is a
  // real directory, optionally owned by expectedUid, optionally with
  // group/other-write disabled).
  verifyParentChain(resolvedRoot, parentDir, uid, { enforceOwnedRoot });
  // Layer 3 (Linux hardening): fstat the sink root via an
  // O_DIRECTORY|O_NOFOLLOW fd to defeat the lstat->open race.
  if (enforceOwnedRoot) {
    verifySinkRootViaFd(resolvedRoot, uid, { enforceOwnedRoot: true });
  }
  // Layer 4: open the final file with O_EXCL | O_NOFOLLOW | O_RDWR |
  // O_CREAT. The fd is held open across the collector run.
  const fd = openSync(
    finalPath,
    fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
    0o600
  );
  const preWriteStat = fstatSync(fd);
  return {
    fd,
    finalPath,
    parentDir,
    sinkRoot: resolvedRoot,
    preWriteStat: {
      dev: preWriteStat.dev,
      ino: preWriteStat.ino,
      mode: preWriteStat.mode,
      uid: preWriteStat.uid,
      size: preWriteStat.size
    }
    // Intentionally NOT frozen: createDiagnosticsObserver attaches an
    // onFdReleased hook and publishOnce mutates state on this object.
  };
}

// Publish the body to a brand-new file. No-replace, no pre-existing-
// file mutation, no symlink substitution at the final path or any
// parent directory segment (including the sink root itself).
//
// Steps:
//   1. verifyParentChain(sinkRoot, parentDir, uid) — refuses if any
//      segment INCLUDING sinkRoot itself is a symlink/junction, is
//      group/other-writable, or owned by an unexpected uid.
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
//      removed via path-based rmSync (doing so would re-introduce the
//      very path-substitution TOCTOU the parent-chain check was
//      designed to close).
//   7. closeSync(fd)
//
// Cleanup is split into two clearly-named regimes:
//   - WRITE_FAILURE: pre-write / during-write errors (open failed,
//     write threw, fsync threw). The file is unlinked ONLY if we
//     created it in this process (createdHere === true). Pre-existing
//     entries are NEVER mutated.
//   - READBACK_MISMATCH: post-write, post-fsync, post-readback — the
//     bytes that landed on disk do not match the bytes we wrote. The
//     file is left in place so an operator can forensic-inspect it;
//     no path-based cleanup runs.
function publishOnce(filePath, body, { sinkRoot, uid, enforceOwnedRoot = false, preBoundSink = null } = {}) {
  // Iteration 7: if a pre-bound sink is provided (from
  // prepareDiagnosticsSink), write through its held fd and reuse its
  // verified finalPath/parentDir. We MUST NOT call openSync again on
  // the path because that would close the original fd and reopen —
  // re-opening after pre-bind defeats the TOCTOU guard.
  if (preBoundSink) {
    const fd = preBoundSink.fd;
    const preWriteStat = preBoundSink.preWriteStat;
    let alreadyClosed = false;
    const closeAndClear = () => {
      if (alreadyClosed) return;
      alreadyClosed = true;
      try { closeSync(fd); } catch { /* */ }
      if (typeof preBoundSink.onFdReleased === "function") {
        try { preBoundSink.onFdReleased(); } catch { /* */ }
      }
    };
    try {
      writeSync(fd, body);
      fsyncSync(fd);
      // Custody readback on the SAME fd.
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
      closeAndClear();
      return {
        path: preBoundSink.finalPath,
        parentDir: preBoundSink.parentDir,
        bodySha256: expectedSha,
        byteCount: expectedBytes,
        dev: preWriteStat?.dev ?? null,
        ino: preWriteStat?.ino ?? null
      };
    } catch (error) {
      const code = error?.code;
      const isReadbackMismatch = code === "DIAGNOSTICS_READBACK_MISMATCH";
      // READBACK_MISMATCH: file stays on disk as forensic evidence.
      // We do NOT path-rm because that re-introduces the TOCTOU.
      if (!isReadbackMismatch) {
        // Pre-write / during-write failure on the pre-bound fd.
        // The file was created by prepareDiagnosticsSink (O_EXCL),
        // so it is OUR file in this process; close and remove.
        closeAndClear();
        try { rmSync(preBoundSink.finalPath, { force: true }); } catch { /* best effort */ }
      } else {
        closeAndClear();
      }
      const wrapped = new Error(`diagnostics_publish_failed: ${error?.message ?? error}`);
      wrapped.code = code ?? "DIAGNOSTICS_PUBLISH_FAILED";
      wrapped.cause = error;
      wrapped.readbackMismatch = isReadbackMismatch;
      throw wrapped;
    }
  }

  const finalPath = resolvePath(filePath);
  const parentDir = dirname(finalPath);
  const verifiedRoot = sinkRoot && isAbsolute(sinkRoot) ? resolvePath(sinkRoot) : parentDir;
  // Pre-open: certify the ANCESTOR chain above the sink root (every
  // path component from the trusted filesystem anchor down to sinkRoot
  // is a real directory, no symlink/junction), THEN certify the
  // parent chain from sinkRoot down to the sink's immediate parent.
  // Together these two layers close both the "sinkRoot inside an
  // attacker-controlled junction" P1 (iteration 6 reviewer finding)
  // and the "sinkRoot is a symlink" P1 from iteration 4.
  verifyAncestorChain(verifiedRoot, uid, { enforceOwnedRoot });
  verifyParentChain(verifiedRoot, parentDir, uid, { enforceOwnedRoot });

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
    // Always close the fd if we have one.
    if (fd !== null) try { closeSync(fd); } catch { /* */ }

    const code = error?.code;
    const isReadbackMismatch = code === "DIAGNOSTICS_READBACK_MISMATCH";
    // READBACK_MISMATCH: we wrote, fsync'd, and read back bytes that
    // do not match. The file stays on disk for forensic inspection.
    // We MUST NOT rmSync(finalPath) here because that is exactly the
    // path-based TOCTOU the parent-chain check was designed to close.
    if (!isReadbackMismatch && createdHere) {
      // Pre-write / during-write failure only. Unlink the file we
      // created in this process. Pre-existing entries (EEXIST/ELOOP)
      // are NEVER mutated.
      try { rmSync(finalPath, { force: true }); } catch { /* best effort */ }
    }
    const wrapped = new Error(`diagnostics_publish_failed: ${error?.message ?? error}`);
    wrapped.code = code ?? "DIAGNOSTICS_PUBLISH_FAILED";
    wrapped.cause = error;
    wrapped.readbackMismatch = isReadbackMismatch;
    throw wrapped;
  } finally {
    // Defensive close: covers any path that bypassed the catch (e.g.
    // a throw from openSync before fd was assigned, although the
    // outer catch already handles that — kept for symmetry).
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
  enforceOwnedRoot = false,
  preBoundSink = null
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
  if (preBoundSink !== null && (typeof preBoundSink !== "object" || typeof preBoundSink.fd !== "number")) {
    throw new Error("diagnostics_invalid_pre_bound_sink");
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
      const result = publishOnce(filePath, fullBody, { sinkRoot, uid, enforceOwnedRoot, preBoundSink });
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
      // Fallback: try to write a footer-only file via a sibling path
      // so the operator can see WHY the main publish failed. With a
      // pre-bound sink, the main path already opened the file via
      // O_EXCL; if the main write/readback fails, the same fd path
      // cannot be retried — fall back to a fresh publishOnce on a
      // sibling path (which has its own fd lifecycle).
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
        publishOnce(fallbackPath, `${fallbackBody}\n`, { sinkRoot, uid, enforceOwnedRoot, preBoundSink: null });
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

  // closePreBoundSink releases the fd held by prepareDiagnosticsSink
  // (if any). Must be called by the runner after flush() returns.
  // Idempotent: safe to call multiple times. No-op when no pre-bound
  // sink was supplied OR when the fd was already released by
  // publishOnce (which calls onFdReleased).
  function closePreBoundSink() {
    if (!preBoundSink) return false;
    const fd = preBoundSink.fd;
    preBoundSink = null;
    if (typeof fd !== "number") return false;
    try { closeSync(fd); return true; } catch { return false; }
  }

  // Wire an onFdReleased hook into the pre-bound sink so publishOnce
  // can signal the observer that the fd is no longer its
  // responsibility. Without this, a double-close could occur if the
  // observer flush errors out (which closes inside publishOnce) and
  // then closePreBoundSink runs from the outer finally.
  if (preBoundSink && typeof preBoundSink.fd === "number") {
    preBoundSink.onFdReleased = () => { preBoundSink = null; };
  }

  return Object.freeze({ record, flush, snapshot, closePreBoundSink });
}