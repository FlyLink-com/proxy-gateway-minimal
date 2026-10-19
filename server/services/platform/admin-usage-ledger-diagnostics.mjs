// Private, opt-in progress protocol. Never part of the public aggregate DTO.
export const LEDGER_DIAGNOSTIC_FLAG = "--ledger-diagnostics-v1";
export const LEDGER_PHASES = Object.freeze([
  "worker_input", "native_import", "validate_input", "db_open", "db_setup", "schema_budget",
  "validate_samples", "validate_rollups", "validate_accounts", "reconcile_samples", "reconcile_rollups",
  "reconcile_outside", "reconcile_orphan_samples", "reconcile_orphan_rollups", "window_accounts",
  "window_sources", "window_fold", "db_close", "result_serialization", "result_write"
]);
export const LEDGER_WORKER_FAILURES = Object.freeze([
  "invalid_input", "import_failed", "source_unavailable", "invalid_query", "invalid_source_data",
  "integer_overflow", "scan_limit_exceeded", "output_too_large", "worker_io_error", "diagnostic_unavailable"
]);

export function notifyLedgerDiagnostic(observer, record) {
  if (typeof observer !== "function") return;
  try {
    const returned = observer(Object.freeze({ ...record }));
    if (returned && typeof returned.then === "function") Promise.resolve(returned).catch(() => {});
  } catch { /* Observers cannot change query outcomes or disclose their errors. */ }
}

export function createLedgerDiagnosticParser(observer) {
  let buffer = Buffer.alloc(0);
  let total = 0;
  let count = 0;
  let lastTime = 0;
  let phaseIndex = -1;
  const observed = new Set();
  let active = null;
  let last = "not_observed";
  let failed = null;
  let failure = null;
  let complete = false;
  let broken = false;
  const invalid = () => { broken = true; throw new Error("Invalid ledger diagnostic stream"); };
  const accept = (line) => {
    if (++count > 64 || line.length > 512) return invalid();
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line)); }
    catch { return invalid(); }
    if (!value || Array.isArray(value) || typeof value !== "object"
      || !Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < lastTime
      || value.elapsedMs > 60_000 || failure || complete) return invalid();
    lastTime = value.elapsedMs;
    if (value.kind === "worker_failure") {
      if (Object.keys(value).sort().join(",") !== "category,elapsedMs,kind"
        || !LEDGER_WORKER_FAILURES.includes(value.category)) return invalid();
      failure = value.category;
      notifyLedgerDiagnostic(observer, { kind: "worker_failure", category: failure, elapsedMs: lastTime });
      return;
    }
    if (value.kind !== "phase" || Object.keys(value).sort().join(",") !== "elapsedMs,event,kind,phase"
      || !LEDGER_PHASES.includes(value.phase) || !["start", "end", "error"].includes(value.event)) return invalid();
    if (value.event === "start") {
      const index = LEDGER_PHASES.indexOf(value.phase);
      if (active || index <= phaseIndex || (failed && value.phase !== "db_close")) return invalid();
      phaseIndex = index;
      observed.add(value.phase);
      active = value.phase;
      last = value.phase;
    } else {
      if (active !== value.phase) return invalid();
      if (value.event === "error") failed ??= active;
      active = null;
      if (value.phase === "result_write" && value.event === "end") {
        complete = !failed && observed.size === LEDGER_PHASES.length;
      }
    }
    notifyLedgerDiagnostic(observer, { kind: "phase", phase: value.phase, event: value.event, elapsedMs: lastTime });
  };
  return {
    push(chunk) {
      if (broken || !Buffer.isBuffer(chunk) || chunk.length > 8192 - total) return invalid();
      total += chunk.length;
      buffer = Buffer.concat([buffer, chunk]);
      let end;
      while ((end = buffer.indexOf(10)) !== -1) {
        accept(buffer.subarray(0, end));
        buffer = buffer.subarray(end + 1);
      }
      if (buffer.length > 512) return invalid();
    },
    finish({ success = false } = {}) {
      if (broken || buffer.length || (success && (!complete || failure || failed))) return invalid();
    },
    lastPhase: () => failed ?? active ?? last,
    failureCategory: () => failure,
    state: () => broken ? "invalid" : complete ? "complete" : "partial"
  };
}
