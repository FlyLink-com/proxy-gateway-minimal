import { writeSync } from "node:fs";
import { assertNoDuplicateObjectKeys } from "../server/services/deployment/strict-json-scan.mjs";

// Private child entrypoint. Run through runSchemaBudgetProbeSupervised, never alone.
const started = performance.now();
let bytes = 0;
let done = false;
const input = Buffer.alloc(8192);
let received = 0;
const VERSION = "admin-ledger-schema-budget-probe/v1";
const allowed = new Set(["invalid_query", "source_unavailable", "scan_limit_exceeded", "integer_overflow", "diagnostic_unavailable", "cleanup_unconfirmed"]);
function emit(record) {
  const buffer = Buffer.from(`${JSON.stringify(record)}\n`);
  bytes += buffer.length;
  if (bytes > 49152) throw new Error("Probe output unavailable");
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(1, buffer, offset, buffer.length - offset);
    if (written < 1) throw new Error("Probe output unavailable");
    offset += written;
  }
}
function finish(ok, category) {
  if (done) return;
  done = true;
  process.exitCode = ok ? 0 : 1;
  try { emit({ kind: "result", ok, category, version: VERSION }); } catch { process.exitCode = 1; }
  process.stdin.destroy();
}
function milestone(event) { emit({ kind: "worker", event, elapsedMs: Math.floor(performance.now() - started) }); }
if (process.argv.length !== 3 || process.argv[2] !== "--schema-budget-probe-worker-v1") finish(false, "invalid_input");
else {
  try { milestone("ready"); } catch { finish(false, "diagnostic_unavailable"); }
  process.stdin.on("error", () => finish(false, "invalid_input"));
  process.stdout.on("error", () => finish(false, "diagnostic_unavailable"));
  process.stdin.on("data", (chunk) => {
    if (done) return;
    if (chunk.length > input.length - received) { finish(false, "invalid_input"); return; }
    chunk.copy(input, received); received += chunk.length;
  });
  process.stdin.on("end", async () => {
    if (done) return;
    let stage = "invalid_input";
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(0, received));
      assertNoDuplicateObjectKeys(text);
      const request = JSON.parse(text);
      if (!request || typeof request !== "object" || Array.isArray(request)
        || Object.keys(request).length !== 2 || !Object.hasOwn(request, "dbPath") || !Object.hasOwn(request, "scanLimit")) {
        finish(false, "invalid_input"); return;
      }
      stage = "import_failed";
      const { runAdminLedgerSchemaBudgetProbe } = await import("./lib/admin-ledger-schema-budget-probe.mjs");
      milestone("imported");
      stage = "source_unavailable";
      runAdminLedgerSchemaBudgetProbe(request, { onEvent(record) { emit({ kind: "probe", record }); } });
      finish(true, "accepted");
    } catch (error) {
      finish(false, stage === "source_unavailable" && allowed.has(error?.category) ? error.category : stage);
    }
  });
}
