import { closeSync, readFileSync, readSync, writeSync } from "node:fs";

function requireExact(value, expected) {
  if (value !== expected) {
    throw new Error("synthetic_protocol_invalid");
  }
}

function readExact(descriptor, expected) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actual = Buffer.alloc(expectedBytes.length);
  let offset = 0;

  while (offset < actual.length) {
    const count = readSync(
      descriptor,
      actual,
      offset,
      actual.length - offset,
      null
    );
    if (count <= 0) throw new Error("synthetic_protocol_invalid");
    offset += count;
  }
  if (!actual.equals(expectedBytes)) {
    throw new Error("synthetic_protocol_invalid");
  }
}

try {
  requireExact(readFileSync(3, "utf8"), "synthetic-capability\n");
  closeSync(3);
  writeSync(4, "synthetic-acquired\n");
  readExact(5, "synthetic-commit\n");
  writeSync(4, "synthetic-held\n");
  closeSync(4);
  readExact(5, "synthetic-release\n");
  closeSync(5);
} catch {
  process.exitCode = 1;
}
