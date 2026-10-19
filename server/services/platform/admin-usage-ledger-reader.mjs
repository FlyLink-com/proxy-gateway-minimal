import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAdminUsageLedgerResponse } from "./admin-usage-ledger-response.mjs";
import { createLedgerDiagnosticParser, LEDGER_DIAGNOSTIC_FLAG, notifyLedgerDiagnostic } from "./admin-usage-ledger-diagnostics.mjs";

const WORKER_PATH = fileURLToPath(new URL("./admin-usage-ledger-worker.mjs", import.meta.url));
const MAX_INPUT_BYTES = 8192;
const MAX_OUTPUT_BYTES = 262144;
const MAX_TIMEOUT_MS = 10000;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function unavailable() {
  const error = new Error("Admin usage ledger unavailable");
  error.code = "source_unavailable";
  return error;
}

function validPath(value) {
  return typeof value === "string" && isAbsolute(value) && !value.includes("\0")
    && !/^[a-z][a-z\d+.-]*:/i.test(value.replace(/^[a-z]:[\\/]/i, ""));
}

function childEnvironment() {
  const env = {};
  if (process.platform === "win32") {
    const systemRoot = process.env.SYSTEMROOT ?? process.env.SystemRoot;
    if (systemRoot) env.SYSTEMROOT = systemRoot;
  }
  return env;
}

/** One server-bound read at a time; failures retain ownership until child close. */
export function createAdminUsageLedgerReader({
  dbPath, nowFn = () => new Date(), timeoutMs = MAX_TIMEOUT_MS, spawnFn = spawn, onDiagnostic
} = {}) {
  let closed = false;
  let active = null;

  async function read(options = {}) {
    let signal;
    let cutoff;
    let input;
    try {
      signal = options?.signal;
      if (closed || active || !validPath(dbPath) || typeof spawnFn !== "function"
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS
        || (signal && (typeof signal.addEventListener !== "function"
          || typeof signal.removeEventListener !== "function")) || signal?.aborted) throw unavailable();
      cutoff = nowFn().toISOString();
      if (!CANONICAL_UTC.test(cutoff) || new Date(cutoff).toISOString() !== cutoff) throw unavailable();
      input = JSON.stringify({ dbPath, cutoff });
      if (Buffer.byteLength(input) > MAX_INPUT_BYTES || signal?.aborted) throw unavailable();
    } catch {
      throw unavailable();
    }

    return new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const diagnostic = typeof onDiagnostic === "function" ? createLedgerDiagnosticParser(onDiagnostic) : null;
      let failureCategory = null;
      const report = (event, category) => {
        if (diagnostic) notifyLedgerDiagnostic(onDiagnostic, {
          kind: "reader", event, category, elapsedMs: Math.max(0, Math.floor(performance.now() - startedAt)),
          lastPhase: diagnostic.lastPhase(), diagnosticState: diagnostic.state()
        });
      };
      const run = { child: null, reaped: false, fail: null };
      let settled = false;
      let timer;
      let output = Buffer.alloc(MAX_OUTPUT_BYTES);
      let received = 0;
      active = run;

      const clearDeadline = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };
      const kill = () => {
        if (run.reaped || !run.child) return;
        // Failure to kill never releases the slot: only close proves reaping.
        try { run.child.kill("SIGKILL"); } catch { /* Keep ownership. */ }
      };
      const fail = (category = "reader_error") => {
        if (settled) return;
        failureCategory = category;
        settled = true;
        output = null;
        clearDeadline();
        report("failure", category);
        reject(unavailable());
        kill();
      };
      run.fail = fail;
      const onAbort = () => fail("request_aborted");
      const onError = () => fail("worker_io_error");
      const onDiagnostics = (chunk) => {
        try { diagnostic.push(chunk); } catch { fail("diagnostic_invalid"); }
      };
      const onDiagnosticError = () => fail("diagnostic_invalid");
      const onExit = (code, exitSignal) => {
        // close drains the opt-in diagnostic pipe, including data arriving after exit.
        if (!diagnostic && (code !== 0 || exitSignal != null)) fail("worker_exit");
      };
      const onData = (chunk) => {
        if (settled) return;
        try {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (bytes.length > MAX_OUTPUT_BYTES - received) return fail("output_too_large");
          bytes.copy(output, received);
          received += bytes.length;
        } catch { fail("invalid_output"); }
      };
      const onClose = (code, exitSignal) => {
        run.reaped = true;
        if (active === run) active = null;
        clearDeadline();
        run.child.removeListener("error", onError);
        run.child.removeListener("exit", onExit);
        run.child.removeListener("close", onClose);
        run.child.stdin?.removeListener("error", onError);
        run.child.stdout?.removeListener("error", onError);
        run.child.stdout?.removeListener("data", onData);
        run.child.stdio?.[3]?.removeListener("data", onDiagnostics);
        run.child.stdio?.[3]?.removeListener("error", onDiagnosticError);
        try { diagnostic?.finish(); } catch { fail("diagnostic_invalid"); }
        if (settled) { report("closed", failureCategory); return; }
        if (performance.now() - startedAt >= timeoutMs) fail("reader_timeout");
        else if (code !== 0 || exitSignal != null) fail(diagnostic?.failureCategory() ?? "worker_exit");
        if (settled) { report("closed", failureCategory); return; }
        try {
          diagnostic?.finish({ success: true });
          const text = new TextDecoder("utf-8", { fatal: true }).decode(output.subarray(0, received));
          const summary = validateAdminUsageLedgerResponse(JSON.parse(text), cutoff);
          if (performance.now() - startedAt >= timeoutMs) {
            fail("reader_timeout"); report("closed", failureCategory); return;
          }
          settled = true;
          output = null;
          report("success", "accepted");
          report("closed", "accepted");
          resolve(summary);
        } catch {
          fail(diagnostic?.state() === "invalid" ? "diagnostic_invalid" : "invalid_output");
          report("closed", failureCategory);
        }
      };

      timer = setTimeout(() => fail("reader_timeout"), timeoutMs);
      try {
        run.child = spawnFn(process.execPath, ["--max-old-space-size=128", WORKER_PATH, ...(diagnostic ? [LEDGER_DIAGNOSTIC_FLAG] : [])], {
          shell: false, windowsHide: true,
          stdio: diagnostic ? ["pipe", "pipe", "ignore", "pipe"] : ["pipe", "pipe", "ignore"], env: childEnvironment()
        });
        run.child.on("error", onError);
        run.child.on("exit", onExit);
        run.child.once("close", onClose);
        run.child.stdin.on("error", onError);
        run.child.stdout.on("error", onError);
        run.child.stdout.on("data", onData);
        if (diagnostic) {
          run.child.stdio[3].on("data", onDiagnostics);
          run.child.stdio[3].on("error", onDiagnosticError);
        }
        // A test-injected spawn can synchronously trigger close before returning.
        if (settled) { kill(); return; }
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) return fail("request_aborted");
        if (closed) return fail("reader_closed");
        if (performance.now() - startedAt >= timeoutMs) return fail("reader_timeout");
        run.child.stdin.end(input);
      } catch {
        // A synchronous spawn failure owns no child and needs no reap event.
        if (!run.child && active === run) active = null;
        fail("spawn_failed");
      }
    });
  }

  function close() {
    closed = true;
    active?.fail("reader_closed");
  }

  return { read, close };
}
