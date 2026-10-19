import { isAbsolute } from "node:path";
import { writeSync } from "node:fs";
import { LEDGER_DIAGNOSTIC_FLAG, LEDGER_PHASES, LEDGER_WORKER_FAILURES } from "./admin-usage-ledger-diagnostics.mjs";

const MAX_INPUT_BYTES = 8192;
const MAX_OUTPUT_BYTES = 262144;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const input = Buffer.alloc(MAX_INPUT_BYTES);
let received = 0;
let failed = false;
const diagnosticsEnabled = process.argv.length === 3 && process.argv[2] === LEDGER_DIAGNOSTIC_FLAG;
const startedAt = performance.now();
let diagnosticBroken = false;
let diagnosticBytes = 0;
let activePhase = null;

function emit(record) {
  if (!diagnosticsEnabled || diagnosticBroken) return;
  const bytes = Buffer.from(`${JSON.stringify({ ...record, elapsedMs: Math.floor(performance.now() - startedAt) })}\n`);
  if (bytes.length > 8192 - diagnosticBytes) { diagnosticBroken = true; return; }
  diagnosticBytes += bytes.length;
  // Small, bounded synchronous writes preserve a milestone before a synchronous
  // native/SQL call blocks. There is no per-row logging or customer data.
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(3, bytes, offset, bytes.length - offset);
      if (written < 1) throw new Error("Diagnostic write unavailable");
      offset += written;
    }
  } catch { diagnosticBroken = true; }
}

function phase({ phase: name, event }) {
  if (!diagnosticsEnabled) return;
  if (!LEDGER_PHASES.includes(name) || !["start", "end", "error"].includes(event)) {
    diagnosticBroken = true; return;
  }
  activePhase = event === "start" ? name : null;
  emit({ kind: "phase", phase: name, event });
}

function fail(category = "worker_io_error") {
  if (failed) return;
  failed = true;
  if (activePhase) phase({ phase: activePhase, event: "error" });
  emit({ kind: "worker_failure", category: LEDGER_WORKER_FAILURES.includes(category) ? category : "source_unavailable" });
  process.exitCode = 1;
  process.stdin.destroy();
}

phase({ phase: "worker_input", event: "start" });
process.stdin.on("error", () => fail("worker_io_error"));
process.stdout.on("error", () => fail("worker_io_error"));
process.stdin.on("data", (chunk) => {
  if (failed) return;
  if (chunk.length > MAX_INPUT_BYTES - received) return fail("invalid_input");
  chunk.copy(input, received);
  received += chunk.length;
});
process.stdin.on("end", async () => {
  if (failed) return;
  let failureCategory = "invalid_input";
  try {
    const request = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(0, received)));
    if (!request || typeof request !== "object" || Array.isArray(request)
      || Object.keys(request).length !== 2 || !Object.hasOwn(request, "dbPath")
      || !Object.hasOwn(request, "cutoff")) return fail("invalid_input");
    const { dbPath, cutoff } = request;
    if (typeof dbPath !== "string" || !isAbsolute(dbPath) || dbPath.includes("\0")
      || /^[a-z][a-z\d+.-]*:/i.test(dbPath.replace(/^[a-z]:[\\/]/i, ""))
      || typeof cutoff !== "string" || !CANONICAL_UTC.test(cutoff)
      || new Date(cutoff).toISOString() !== cutoff) return fail("invalid_input");
    phase({ phase: "worker_input", event: "end" });
    // Import failures, SQLite failures and native details stay inside the worker.
    // The core opens an existing file read-only and never creates its schema.
    failureCategory = "import_failed";
    phase({ phase: "native_import", event: "start" });
    const { readAdminUsageLedger } = await import("./admin-usage-ledger-query.mjs");
    phase({ phase: "native_import", event: "end" });
    failureCategory = "source_unavailable";
    const summary = readAdminUsageLedger({ dbPath, cutoff }, diagnosticsEnabled ? { onPhase: phase } : undefined);
    phase({ phase: "result_serialization", event: "start" });
    const output = Buffer.from(JSON.stringify(summary));
    if (output.length > MAX_OUTPUT_BYTES) return fail("output_too_large");
    phase({ phase: "result_serialization", event: "end" });
    if (diagnosticBroken) return fail("diagnostic_unavailable");
    phase({ phase: "result_write", event: "start" });
    process.stdout.end(output, () => {
      if (failed) return;
      phase({ phase: "result_write", event: "end" });
      if (diagnosticBroken) fail("diagnostic_unavailable");
    });
  } catch (error) {
    fail(failureCategory === "source_unavailable" && LEDGER_WORKER_FAILURES.includes(error?.code)
      ? error.code : failureCategory);
  }
});
