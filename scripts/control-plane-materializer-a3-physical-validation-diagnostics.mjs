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

import { createHash } from "node:crypto";
import {
  openSync,
  closeSync,
  writeSync,
  renameSync,
  lstatSync,
  chmodSync,
  constants as fsConstants
} from "node:fs";
import { dirname, basename, resolve as resolvePath } from "node:path";

export const DIAGNOSTICS_SCHEMA_VERSION = "diagnostics-1";
export const DIAGNOSTICS_TYPE = "control_plane_materializer_a3_physical_validation_diagnostics";
export const DIAGNOSTICS_INTEGRITY_TYPE = "control_plane_materializer_a3_physical_validation_diagnostics_integrity";

const REDACT_PATTERNS = [
  // IPv4 (with optional /mask)
  /\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/g,
  // IPv6: full form, compressed form, IPv4-mapped, link-local zone IDs
  /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:%[A-Za-z0-9_.\-]+)?\b/gi,
  // IPv6 in URL bracket form: http://[2001:db8::1]:443/
  /\[(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:%[A-Za-z0-9_.\-]+)?\]/gi,
  // user@host:port (SSH, SCP, rsync, etc.)
  /\b[A-Za-z0-9_.\-]+@[A-Za-z0-9_.\-]+(?::\d{1,5})?\b/g,
  // host:port (no user) - tightened so it does NOT consume IPv6
  /(?<![\w@:\[])[A-Za-z0-9_.\-]+:\d{1,5}\b/g,
  // secret-bearing key=value pairs
  /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|ssh[_-]?key)\s*=\s*[^\s,;"']+/gi,
  // Authorization: Bearer ...
  /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._\-]+/gi,
  // Bare Bearer
  /Bearer\s+[A-Za-z0-9._\-]+/gi
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

function atomicWrite(filePath, body) {
  const finalPath = resolvePath(filePath);
  const dir = dirname(finalPath);
  const base = basename(finalPath);
  const tmpPath = resolvePath(dir, `.${base}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  // Pre-check: refuse to overwrite existing files. lstatSync (NOT statSync)
  // so we never follow symlinks.
  try {
    const existing = lstatSync(finalPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      const error = new Error("diagnostics_refused_non_regular_sink");
      error.code = "DIAGNOSTICS_REFUSED";
      throw error;
    }
    try { chmodSync(finalPath, 0o600); } catch { /* best effort */ }
    const error = new Error("diagnostics_refused_existing_sink");
    error.code = "DIAGNOSTICS_REFUSED";
    throw error;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      // expected
    } else {
      throw error;
    }
  }

  try {
    const existingTmp = lstatSync(tmpPath);
    if (existingTmp.isSymbolicLink() || existingTmp.isFile()) {
      const error = new Error("diagnostics_tmp_path_collision");
      error.code = "DIAGNOSTICS_TMP_COLLISION";
      throw error;
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  const fd = openSync(tmpPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try {
    writeSync(fd, body);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, finalPath);
  try { chmodSync(finalPath, 0o600); } catch { /* best effort */ }
}

export function createDiagnosticsObserver({
  filePath,
  maxBytes = 65536,
  maxRecords = 64,
  previewBytes = 256
} = {}) {
  if (typeof filePath !== "string" || filePath.length === 0) throw new Error("diagnostics_invalid_file_path");
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new Error("diagnostics_invalid_max_bytes");
  if (!Number.isInteger(maxRecords) || maxRecords <= 0) throw new Error("diagnostics_invalid_max_records");
  if (!Number.isInteger(previewBytes) || previewBytes <= 0) throw new Error("diagnostics_invalid_preview_bytes");

  const records = [];
  let totalBytes = 0;
  let truncated = false;
  let observerError = null;
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

  function flush() {
    if (observerError) {
      try {
        const errorBody = JSON.stringify({
          schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          type: DIAGNOSTICS_INTEGRITY_TYPE,
          recordCount: records.length,
          byteCount: totalBytes,
          truncated,
          observerError: String(observerError?.message ?? observerError),
          flushedAt: new Date().toISOString()
        });
        atomicWrite(filePath, `${errorBody}\n`);
      } catch { /* swallow */ }
      return;
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
    try {
      atomicWrite(filePath, `${body}${footer}\n`);
    } catch (error) {
      observerError = error;
      try {
        const fallbackBody = JSON.stringify({
          schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
          type: DIAGNOSTICS_INTEGRITY_TYPE,
          recordCount: records.length,
          byteCount: totalBytes,
          truncated,
          observerError: String(error?.message ?? error),
          flushedAt: new Date().toISOString()
        });
        atomicWrite(`${filePath}.integrity-fallback`, `${fallbackBody}\n`);
      } catch { /* give up */ }
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
      records: Object.freeze(records.slice())
    });
  }

  return Object.freeze({ record, flush, snapshot });
}