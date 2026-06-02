import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("gccgw install bootstrap script requires a reviewed configure plan", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/gccgw-install-bootstrap.mjs", "--execute-production-mutation", "--apply"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /--config-plan is required/
  );
});

test("gccgw install bootstrap validates configure plan before host mutation checks", () => {
  const dir = mkdtempSync(join(tmpdir(), "gccgw-bootstrap-"));
  const planPath = join(dir, "unsafe-plan.json");
  writeFileSync(planPath, JSON.stringify({
    type: "gccgw_install_configure_plan",
    ok: false,
    mutation: true,
    redacted: false,
    blockers: [{ code: "unsafe" }]
  }));

  assert.throws(
    () => execFileSync(process.execPath, [
      "scripts/gccgw-install-bootstrap.mjs",
      "--execute-production-mutation",
      "--apply",
      "--config-plan",
      planPath
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /configure plan is not approved for bootstrap/
  );
});

test("gccgw install bootstrap reaches host gate after a valid configure plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "gccgw-bootstrap-"));
  const planPath = join(dir, "valid-plan.json");
  writeFileSync(planPath, JSON.stringify({
    type: "gccgw_install_configure_plan",
    ok: true,
    mutation: false,
    productionAuthority: false,
    redacted: true,
    blockers: [],
    derivedPaths: {
      envSkeletonPath: "/opt/proxy-gateway-minimal/.env",
      runtimeDbPath: "/opt/proxy-gateway-minimal/.proxy-gateway/subscriptions.sqlite",
      controlDbPath: "/opt/proxy-gateway-minimal/.proxy-gateway/subscription-control.sqlite"
    }
  }));

  const expectedHostGate = process.platform === "linux"
    ? /bootstrap\.sh must run as root via sudo/
    : /install bootstrap can only run on a Linux server host/;

  assert.throws(
    () => execFileSync(process.execPath, [
      "scripts/gccgw-install-bootstrap.mjs",
      "--execute-production-mutation",
      "--apply",
      "--config-plan",
      planPath
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    expectedHostGate
  );
});
