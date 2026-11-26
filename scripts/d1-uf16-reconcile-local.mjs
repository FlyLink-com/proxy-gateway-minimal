// Operator-invoked offline prototype. Reads two explicit immutable copies
// and only emits a redacted report to stdout. No Agent/Worker calls.
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { reconcileHistoricalAgentEvidence } from "../agent/g4/local-epoch-reconciliation.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const SCHEMA = "uf16-offline-reconciliation/v1";
const LEDGER_SCHEMA = "uf16-offline-worker-evidence/v1";
const usage = "node scripts/d1-uf16-reconcile-local.mjs --agent-state <copy.json> --worker-ledger <copy.json>";

function paths(args) {
  if (args.length !== 4) return null;
  const files = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const [flag, path] = args.slice(i, i + 2);
    if (!["--agent-state", "--worker-ledger"].includes(flag) || files.has(flag)
      || !path || path.startsWith("--") || /^(?:[a-z]+:\/\/|[\\/]{2})/i.test(path)) return null;
    files.set(flag, path);
  }
  return files;
}

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size
    && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

async function readCopy(path) {
  const expected = await lstat(path);
  if (!expected.isFile() || expected.size === 0 || expected.size > MAX_BYTES) throw new Error();
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await file.stat();
    if (!before.isFile() || !sameFile(expected, before)) throw new Error();
    const buffer = Buffer.alloc(before.size + 1);
    let read = 0;
    while (read < buffer.length) {
      const { bytesRead } = await file.read(buffer, read, buffer.length - read, read);
      if (!bytesRead) break;
      read += bytesRead;
    }
    if (read !== before.size || !sameFile(before, await file.stat()) || !sameFile(before, await lstat(path))) throw new Error();
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, read)));
  } finally {
    await file.close();
  }
}

function emit(report) {
  process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA, ...report }) + "\n");
  process.exitCode = report.status === "invalid_evidence" ? 2 : report.status === "review_required" ? 1 : 0;
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  process.stdout.write(usage + "\n");
} else {
  const files = paths(args);
  if (!files) {
    // Never echo a path, argument value, parse error, or source contents.
    emit({ status: "invalid_evidence", reason: "usage", allowDispatch: false, items: [] });
  } else {
    try {
      const [state, ledger] = await Promise.all([
        readCopy(files.get("--agent-state")),
        readCopy(files.get("--worker-ledger")),
      ]);
      if (ledger?.schemaVersion !== LEDGER_SCHEMA) throw new Error();
      emit(reconcileHistoricalAgentEvidence({
        state,
        writerEpoch: ledger.writerEpoch,
        receiptRows: ledger.receiptRows,
        claimRows: ledger.claimRows,
      }));
    } catch {
      emit({ status: "invalid_evidence", reason: "unreadable_or_invalid_copy", allowDispatch: false, items: [] });
    }
  }
}
