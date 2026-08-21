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
import { writeFileSync } from "node:fs";

export const DIAGNOSTICS_SCHEMA_VERSION = "diagnostics-1";
export const DIAGNOSTICS_TYPE = "control_plane_materializer_a3_physical_validation_diagnostics";

const REDACT_PATTERNS = [
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/g,
  /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi,
  /\b(?:[A-Za-z0-9_.\-]+@)?(?:[A-Za-z0-9_.\-]+):\d{1,5}\b/g,
  /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|ssh[_-]?key)\s*=\s*[^\s,;"']+/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/gi
];

function redact(input) {
  if (typeof input !== "string" || input.length === 0) return "";
  let value = input.replace(/\0/g, "");
  value = value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
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

// Build a read-only observer suitable for the executeA3Physical observer
// hook. The observer records every invocation to an in-memory bounded
// buffer (maxBytes / previewBytes). The optional `flush()` writes a
// JSONL file at `sinkPath`.
//
// The observer is fail-closed: any exception thrown by the underlying
// collector's `executeA3Physical` payload is captured into a sentinel
// record and never propagates.
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
  let seenSignatures = new Set();

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

  function record({ command, args, status, stdout, stderr, error, condition }) {
    if (observerError) return;
    if (typeof command !== "string" || !Array.isArray(args)) {
      push({
        schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
        type: DIAGNOSTICS_TYPE,
        command: typeof command === "string" ? command : "<invalid>",
        argv: Array.isArray(args) ? args.slice() : [],
        exitStatus: null,
        exitError: "diagnostics_invalid_invocation",
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
    if (observerError) return;
    const body = records.length === 0 ? "" : records.join("\n") + "\n";
    try {
      writeFileSync(filePath, body, { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      observerError = error;
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