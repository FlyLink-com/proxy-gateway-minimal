import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAdminUsageLedgerResponse } from "./admin-usage-ledger-response.mjs";

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
  dbPath, nowFn = () => new Date(), timeoutMs = MAX_TIMEOUT_MS, spawnFn = spawn
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
      const fail = () => {
        if (settled) return;
        settled = true;
        output = null;
        clearDeadline();
        reject(unavailable());
        kill();
      };
      run.fail = fail;
      const onAbort = () => fail();
      const onError = () => fail();
      const onExit = (code, exitSignal) => {
        if (code !== 0 || exitSignal != null) fail();
      };
      const onData = (chunk) => {
        if (settled) return;
        try {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (bytes.length > MAX_OUTPUT_BYTES - received) return fail();
          bytes.copy(output, received);
          received += bytes.length;
        } catch { fail(); }
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
        if (settled) return;
        if (code !== 0 || exitSignal != null || performance.now() - startedAt >= timeoutMs) return fail();
        try {
          const text = new TextDecoder("utf-8", { fatal: true }).decode(output.subarray(0, received));
          const summary = validateAdminUsageLedgerResponse(JSON.parse(text), cutoff);
          if (performance.now() - startedAt >= timeoutMs) return fail();
          settled = true;
          output = null;
          resolve(summary);
        } catch { fail(); }
      };

      timer = setTimeout(fail, timeoutMs);
      try {
        run.child = spawnFn(process.execPath, ["--max-old-space-size=128", WORKER_PATH], {
          shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env: childEnvironment()
        });
        run.child.on("error", onError);
        run.child.on("exit", onExit);
        run.child.once("close", onClose);
        run.child.stdin.on("error", onError);
        run.child.stdout.on("error", onError);
        run.child.stdout.on("data", onData);
        // A test-injected spawn can synchronously trigger close before returning.
        if (settled) { kill(); return; }
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted || closed || performance.now() - startedAt >= timeoutMs) return fail();
        run.child.stdin.end(input);
      } catch {
        // A synchronous spawn failure owns no child and needs no reap event.
        if (!run.child && active === run) active = null;
        fail();
      }
    });
  }

  function close() {
    closed = true;
    active?.fail();
  }

  return { read, close };
}
