import { closeSync, readFileSync, writeSync } from "node:fs";

function requireExact(value, expected) {
  if (value !== expected) {
    throw new Error("synthetic_protocol_invalid");
  }
}

try {
  writeSync(4, "synthetic-acquired\n");
  requireExact(readFileSync(5, "utf8"), "synthetic-commit\n");
  writeSync(4, "synthetic-held\n");
  closeSync(4);
  requireExact(readFileSync(5, "utf8"), "synthetic-release\n");
} catch {
  process.exitCode = 1;
}
