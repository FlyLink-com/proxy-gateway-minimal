import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("gccgw install bootstrap script refuses execution without explicit mutation flag", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/gccgw-install-bootstrap.mjs", "--apply"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /--execute-production-mutation is required/
  );
});

test("gccgw install bootstrap script refuses execution without apply flag", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/gccgw-install-bootstrap.mjs", "--execute-production-mutation"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /--apply is required/
  );
});

test("gccgw install validate-loopback refuses execution without explicit mutation flag", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/gccgw-install-validate-loopback.mjs", "--synthetic"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /--execute-production-mutation is required/
  );
});

test("gccgw install validate-loopback refuses non-synthetic validation", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/gccgw-install-validate-loopback.mjs", "--execute-production-mutation"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /--synthetic is required/
  );
});
