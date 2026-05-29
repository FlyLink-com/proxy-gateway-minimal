import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("platform revoke-access CLI prints a dry-run plan without raw tenant id", () => {
  const rawTenantId = "tenant_sensitive_customer_alpha";
  const stdout = execFileSync(process.execPath, ["scripts/platform-revoke-access.mjs", rawTenantId, "--dry-run"], {
    cwd: new URL("../../", import.meta.url),
    encoding: "utf8"
  });

  const plan = JSON.parse(stdout);
  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.status, "PLAN_READY");
  assert.equal(plan.safety.noDatabaseMutation, true);
  assert.equal(plan.safety.noProductionMutation, true);
  assert.equal(plan.safety.rawTenantIdReturned, false);
  assert.match(plan.tenantRef, /^tenant_[a-f0-9]{16}$/);
  assert.doesNotMatch(stdout, /tenant_sensitive_customer_alpha/);
});

test("platform revoke-access CLI rejects non-dry-run modes", () => {
  assert.throws(
    () => execFileSync(process.execPath, ["scripts/platform-revoke-access.mjs", "tenant_sensitive_customer_alpha", "--execute"], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      stdio: "pipe"
    }),
    /Only --dry-run mode is currently permitted/
  );
});
