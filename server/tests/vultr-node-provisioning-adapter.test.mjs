import assert from "node:assert/strict";
import test from "node:test";
import { buildVultrNodeProvisioningDryRun } from "../../ops/node-provisioning/providers/vultr/adapter.mjs";

const safeProfile = {
  providerRef: "provider-vultr",
  regionRef: "region-japan-pending-c1-gate",
  instancePlanRef: "lightweight-vultr-plan-pending-c1-gate",
  sizePlanRef: "lowest-cost-feasible-vultr-shared-cpu-pending-c1-gate",
  installationMethod: "rescue-dd",
  bootMode: "bios-mbr",
  sizeDecisionApproved: false,
  regionDecisionApproved: false
};

test("Vultr adapter emits only a non-executable provider-specific plan", () => {
  const plan = buildVultrNodeProvisioningDryRun(safeProfile);
  assert.equal(plan.provider, "vultr");
  assert.equal(plan.mode, "dry-run-only");
  assert.equal(plan.executable, false);
  assert.equal(plan.safety.providerApiCalled, false);
  assert.equal(plan.safety.providerCredentialsRead, false);
  assert.equal(plan.safety.externalMutation, false);
  assert.ok(plan.plannedOperations.every((operation) => operation.mutation === false));
  assert.ok(plan.blockedMutations.includes("create-instance"));
  assert.ok(plan.blockedMutations.includes("delete-instance"));
});

test("Vultr adapter rejects a non-Vultr provider or unsafe region reference", () => {
  assert.throws(() => buildVultrNodeProvisioningDryRun({ ...safeProfile, providerRef: "provider-other" }));
  assert.throws(() => buildVultrNodeProvisioningDryRun({ ...safeProfile, regionRef: "203.0.113.10" }));
});

test("Vultr adapter rejects any installation method outside the reviewed rescue-dd BIOS path", () => {
  assert.throws(() => buildVultrNodeProvisioningDryRun({ ...safeProfile, installationMethod: "api-image" }));
  assert.throws(() => buildVultrNodeProvisioningDryRun({ ...safeProfile, bootMode: "uefi" }));
});


test("Vultr adapter rejects IPv6 literals and unreviewed credential fields", () => {
  assert.throws(() => buildVultrNodeProvisioningDryRun({
    ...safeProfile,
    regionRef: "2001:db8::1"
  }));
  assert.throws(() => buildVultrNodeProvisioningDryRun({
    ...safeProfile,
    apiKey: "synthetic-provider-key"
  }));
});
