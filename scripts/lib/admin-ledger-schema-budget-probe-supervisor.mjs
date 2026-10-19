import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoDuplicateObjectKeys } from "../../server/services/deployment/strict-json-scan.mjs";

const WORKER = fileURLToPath(new URL("../admin-ledger-schema-budget-probe-worker.mjs", import.meta.url));
const VERSION = "admin-ledger-schema-budget-probe/v1";
const CATEGORIES = new Set(["invalid_query", "source_unavailable", "scan_limit_exceeded", "integer_overflow", "diagnostic_unavailable", "cleanup_unconfirmed", "invalid_input", "import_failed"]);
const MAX_BYTES = 49152;
const MAX_LINE = 2048;
const MAX_RECORDS = 70;
const descriptor = (phase, role = "none", step = 0, part = "operation") => ({ phase, role, step, part });
const OPEN = descriptor("db_open");
const SETUP = descriptor("db_setup");
const TRANSACTION = descriptor("transaction");
const CLOSE = descriptor("db_close");
const normal = [];
const pair = (d) => normal.push({ ...d, event: "start" }, { ...d, event: "end" });
pair(OPEN); pair(SETUP); normal.push({ ...TRANSACTION, event: "start" });
for (const role of ["samples", "rollups", "accounts"]) {
  for (let step = 1; step <= 3; step += 1) {
    pair(descriptor("sql", role, step, "prepare"));
    pair(descriptor("sql", role, step, "execute"));
  }
}
normal.push({ ...TRANSACTION, event: "end" }); pair(CLOSE);

function requireThat(value) { if (!value) throw new Error("Invalid probe protocol"); }
function keys(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every((key) => Object.hasOwn(value, key));
}
const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const matches = (record, expected) => Object.entries(expected).every(([key, value]) => record[key] === value);
function metrics(value) {
  requireThat(keys(value, ["wallMs", "cpu", "resource"]) && number(value.wallMs));
  const cpu = value.cpu;
  requireThat((keys(cpu, ["state"]) && cpu.state === "unknown")
    || (keys(cpu, ["state", "userUs", "systemUs"]) && cpu.state === "available" && integer(cpu.userUs) && integer(cpu.systemUs)));
  const resource = value.resource;
  const fields = ["minorFaults", "majorFaults", "fsRead", "voluntaryCS", "involuntaryCS", "maxRssKiB", "maxRssGrowthKiB"];
  requireThat((keys(resource, ["state"]) && resource.state === "unknown")
    || (keys(resource, ["state", ...fields]) && resource.state === "available" && fields.every((key) => integer(resource[key]))));
}

/** Accept only bounded fixed-label diagnostics, including an incomplete valid prefix. */
export function createSchemaBudgetProbeParser(onEvent) {
  let bytes = 0;
  let pending = Buffer.alloc(0);
  let lastTime = -1;
  let workerTime = -1;
  let workerStage = 0;
  let next = 0;
  let failed = false;
  let invalid = false;
  let result = null;
  const stack = [];
  const events = [];
  function accept(record) {
    requireThat(!result && events.length < MAX_RECORDS);
    if (record.kind === "worker") {
      requireThat(keys(record, ["kind", "event", "elapsedMs"]) && number(record.elapsedMs)
        && record.elapsedMs >= workerTime && record.elapsedMs <= 12000
        && record.event === ["ready", "imported"][workerStage]);
      workerTime = record.elapsedMs; workerStage += 1;
    } else if (record.kind === "probe") {
      requireThat(keys(record, ["kind", "record"]) && workerStage === 2);
      const event = record.record;
      const fields = ["phase", "role", "step", "part", "event", "elapsedMs"];
      requireThat(["start", "end", "error"].includes(event?.event)
        && keys(event, [...fields, ...(event.event === "start" ? [] : ["metrics"]), ...(event.event === "error" ? ["category"] : [])])
        && number(event.elapsedMs) && event.elapsedMs >= lastTime && event.elapsedMs <= 12000);
      if (event.event !== "start") metrics(event.metrics);
      const d = descriptor(event.phase, event.role, event.step, event.part);
      if (event.event === "error") {
        requireThat(stack.length > 0 && matches(event, stack.at(-1)) && CATEGORIES.has(event.category));
        stack.pop(); failed = true;
      } else if (failed) {
        requireThat(matches(event, CLOSE) && ((event.event === "start" && stack.length === 0)
          || (event.event === "end" && stack.length === 1 && matches(stack[0], CLOSE))));
        if (event.event === "start") stack.push(d); else stack.pop();
      } else {
        requireThat(next < normal.length && matches(event, normal[next]));
        next += 1;
        if (event.event === "start") stack.push(d);
        else { requireThat(stack.length > 0 && matches(event, stack.at(-1))); stack.pop(); }
      }
      lastTime = event.elapsedMs;
    } else {
      requireThat(record.kind === "result" && keys(record, ["kind", "ok", "category", "version"])
        && record.version === VERSION && typeof record.ok === "boolean");
      if (record.ok) requireThat(record.category === "accepted" && !failed && next === normal.length && stack.length === 0);
      else requireThat(CATEGORIES.has(record.category));
      result = record;
    }
    events.push(record);
    const pendingObserver = onEvent?.(structuredClone(record));
    if (pendingObserver != null && typeof pendingObserver.then === "function") {
      Promise.resolve(pendingObserver).catch(() => {});
      throw new Error("Probe observer must be synchronous");
    }
  }
  return {
    push(chunk) {
      try {
        requireThat(!invalid);
        const part = Buffer.from(chunk);
        bytes += part.length; requireThat(bytes <= MAX_BYTES);
        pending = Buffer.concat([pending, part]);
        for (let index = pending.indexOf(10); index !== -1; index = pending.indexOf(10)) {
          requireThat(index > 0 && index <= MAX_LINE);
          const line = pending.subarray(0, index); pending = pending.subarray(index + 1);
          const text = new TextDecoder("utf-8", { fatal: true }).decode(line);
          assertNoDuplicateObjectKeys(text);
          accept(JSON.parse(text));
        }
        requireThat(pending.length <= MAX_LINE);
      } catch { invalid = true; pending = Buffer.alloc(0); throw new Error("Invalid probe protocol"); }
    },
    finish() { requireThat(!invalid && pending.length === 0); return result; },
    snapshot() { return structuredClone(events); }
  };
}

function validInput(input) {
  return keys(input, ["dbPath", "scanLimit"]) && typeof input.dbPath === "string"
    && isAbsolute(input.dbPath) && !input.dbPath.includes("\0")
    && !/^[a-z][a-z\d+.-]*:/i.test(input.dbPath.replace(/^[a-z]:[\\/]/i, ""))
    && Number.isSafeInteger(input.scanLimit) && input.scanLimit >= 1 && input.scanLimit <= 1000000
    && Buffer.byteLength(JSON.stringify(input)) <= 8192;
}

/** Explicit one-shot operator API. No DB discovery, HTTP route, retry, or automatic execution.
 * A future production caller must bind target/file identity and authorization separately.
 * Ten-second child deadline plus at most two seconds to observe close; unknown cleanup is failure.
 */
export async function runSchemaBudgetProbeSupervised(input, { spawnFn = spawn, timeoutMs = 10000, cleanupMs = 2000, onEvent, signal } = {}) {
  if (!validInput(input) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000
    || !Number.isInteger(cleanupMs) || cleanupMs < 1 || cleanupMs > 2000
    || (onEvent !== undefined && typeof onEvent !== "function")
    || (signal && (typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function"))) {
    throw new Error("Invalid probe input");
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const parser = createSchemaBudgetProbeParser(onEvent);
    let child;
    let firstFailure = null;
    let finished = false;
    let workerClosed = false;
    let killRequested = false;
    let deadline;
    let cleanup;
    const settle = (category) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline); clearTimeout(cleanup);
      signal?.removeEventListener("abort", abort);
      resolve({ ok: category === "accepted" && workerClosed, category, failureCategory: firstFailure, workerClosed, killRequested,
        elapsedMs: Math.floor(performance.now() - started), events: parser.snapshot() });
    };
    const fail = (category) => {
      if (finished || firstFailure) return;
      firstFailure = category; clearTimeout(deadline);
      if (!child || workerClosed) { settle(category); return; }
      cleanup = setTimeout(() => settle("cleanup_unconfirmed"), cleanupMs);
      killRequested = true;
      try { child.kill("SIGKILL"); } catch { /* No claim of cleanup without close. */ }
    };
    const abort = () => fail("cancelled");
    if (signal?.aborted) { settle("cancelled"); return; }
    const env = {};
    if (process.platform === "win32") {
      const root = process.env.SYSTEMROOT ?? process.env.SystemRoot;
      if (root) env.SYSTEMROOT = root;
    }
    deadline = setTimeout(() => fail("reader_timeout"), timeoutMs);
    try {
      child = spawnFn(process.execPath, ["--max-old-space-size=128", WORKER, "--schema-budget-probe-worker-v1"], {
        shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env
      });
      const ioError = () => fail("worker_io_error");
      child.on("error", ioError);
      child.stdin.on("error", ioError);
      child.stdout.on("error", ioError);
      child.stdout.on("data", (data) => {
        if (finished || firstFailure) return;
        try { parser.push(data); } catch { fail("diagnostic_invalid"); }
      });
      child.once("close", (code, exitSignal) => {
        workerClosed = true;
        if (finished) return;
        if (firstFailure) { settle(firstFailure); return; }
        if (performance.now() - started >= timeoutMs) { settle("reader_timeout"); return; }
        let result;
        try { result = parser.finish(); } catch { settle("diagnostic_invalid"); return; }
        if (!result) { settle("incomplete_probe"); return; }
        if (!result.ok) { settle(result.category); return; }
        settle(code === 0 && exitSignal == null ? "accepted" : "worker_exit");
      });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      if (performance.now() - started >= timeoutMs) { fail("reader_timeout"); return; }
      child.stdin.end(JSON.stringify(input));
    } catch { fail("spawn_failed"); }
  });
}
