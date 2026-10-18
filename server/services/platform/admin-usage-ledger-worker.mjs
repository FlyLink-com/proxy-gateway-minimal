import { isAbsolute } from "node:path";

const MAX_INPUT_BYTES = 8192;
const MAX_OUTPUT_BYTES = 262144;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const input = Buffer.alloc(MAX_INPUT_BYTES);
let received = 0;
let failed = false;

function fail() {
  failed = true;
  process.exitCode = 1;
  process.stdin.destroy();
}

process.stdin.on("error", fail);
process.stdout.on("error", fail);
process.stdin.on("data", (chunk) => {
  if (failed) return;
  if (chunk.length > MAX_INPUT_BYTES - received) return fail();
  chunk.copy(input, received);
  received += chunk.length;
});
process.stdin.on("end", async () => {
  if (failed) return;
  try {
    const request = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(0, received)));
    if (!request || typeof request !== "object" || Array.isArray(request)
      || Object.keys(request).length !== 2 || !Object.hasOwn(request, "dbPath")
      || !Object.hasOwn(request, "cutoff")) return fail();
    const { dbPath, cutoff } = request;
    if (typeof dbPath !== "string" || !isAbsolute(dbPath) || dbPath.includes("\0")
      || /^[a-z][a-z\d+.-]*:/i.test(dbPath.replace(/^[a-z]:[\\/]/i, ""))
      || typeof cutoff !== "string" || !CANONICAL_UTC.test(cutoff)
      || new Date(cutoff).toISOString() !== cutoff) return fail();
    // Import failures, SQLite failures and native details stay inside the worker.
    // The core opens an existing file read-only and never creates its schema.
    const { readAdminUsageLedger } = await import("./admin-usage-ledger-query.mjs");
    const output = Buffer.from(JSON.stringify(readAdminUsageLedger({ dbPath, cutoff })));
    if (output.length > MAX_OUTPUT_BYTES) return fail();
    process.stdout.end(output);
  } catch { fail(); }
});
