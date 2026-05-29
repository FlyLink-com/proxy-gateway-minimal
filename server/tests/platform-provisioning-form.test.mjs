import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const provisioningFormModule = await import("../services/platform/provisioning-form.mjs").catch(() => ({}));
const { buildProvisioningFormPackage } = provisioningFormModule;

function baseForm(overrides = {}) {
  return {
    approvalRef: "PR-263",
    operator: "operator-local",
    customer: {
      label: "Customer Alpha",
      email: "owner@sensitive.example",
      channel: "private-referral"
    },
    subscription: {
      displayName: "alpha-preproduction-canary",
      plan: "pilot",
      expiresAt: "2026-06-04T00:00:00.000Z",
      nodeId: "channel-lab-b-tuic",
      note: "preproduction-canary",
      quantity: 1
    },
    handoff: {
      delivery: "operator_visible_once"
    },
    artifact: {
      create: true
    },
    ...overrides
  };
}

function withTempJson(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-provisioning-form-"));
  try {
    const payloadPath = join(tempDir, "form.json");
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    return fn(payloadPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("platform provisioning form helper is exported", () => {
  assert.equal(typeof buildProvisioningFormPackage, "function");
});

test("platform provisioning form converts operator facts into issuance input without secrets", () => {
  const result = buildProvisioningFormPackage(baseForm());

  assert.equal(result.ok, true);
  assert.equal(result.mode, "platform-provisioning-form");
  assert.equal(result.status, "ready_for_cli_dry_run");
  assert.equal(result.approvalRef, "PR-263");
  assert.match(result.customerRef, /^cust_[a-f0-9]{16}$/);
  assert.equal(result.issuanceInput.displayName, "alpha-preproduction-canary");
  assert.equal(result.issuanceInput.expiresAt, "2026-06-04T00:00:00.000Z");
  assert.equal(result.issuanceInput.nodeId, "channel-lab-b-tuic");
  assert.equal(result.issuanceInput.note, "preproduction-canary");
  assert.deepEqual(result.issuanceInput.artifact, { create: true });
  assert.equal(result.execution.command, "platform:issue-subscription");
  assert.equal(result.execution.requiresRiskAApproval, true);
  assert.equal(result.execution.dbMutationAuthorized, false);
  assert.equal(result.safety.noSubscriptionUrl, true);
  assert.equal(result.safety.noRawCustomerData, true);
  assert.equal(result.safety.noDbMutation, true);

  assert.doesNotMatch(
    JSON.stringify(result),
    /owner@sensitive|Customer Alpha|private-referral|token=|artifact_secret|https?:\/\//i
  );
});

test("platform provisioning form fails closed for missing gate facts", () => {
  const result = buildProvisioningFormPackage(baseForm({
    approvalRef: "",
    subscription: {
      ...baseForm().subscription,
      nodeId: "",
      expiresAt: "not-a-date"
    }
  }));

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked_before_cli_input");
  assert.deepEqual(result.blockers, [
    "approval_ref_required",
    "subscription_expires_at_invalid",
    "subscription_node_required"
  ]);
  assert.equal(result.issuanceInput, null);
  assert.equal(result.safety.noDbMutation, true);
});

test("platform provisioning form requires opaque artifact creation and single quantity", () => {
  const result = buildProvisioningFormPackage(baseForm({
    subscription: {
      ...baseForm().subscription,
      quantity: 2
    },
    artifact: {
      create: false
    }
  }));

  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked_before_cli_input");
  assert.deepEqual(result.blockers, [
    "subscription_quantity_must_be_one",
    "opaque_artifact_required"
  ]);
  assert.equal(result.issuanceInput, null);
});

test("platform provisioning form CLI prints safe JSON", () => {
  withTempJson(baseForm(), (payloadPath) => {
    const stdout = execFileSync(process.execPath, ["scripts/platform-provisioning-form.mjs", payloadPath], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const result = JSON.parse(stdout);
    assert.equal(result.mode, "platform-provisioning-form");
    assert.equal(result.status, "ready_for_cli_dry_run");
    assert.match(result.customerRef, /^cust_[a-f0-9]{16}$/);
    assert.equal(result.issuanceInput.nodeId, "channel-lab-b-tuic");
    assert.equal(result.safety.noSubscriptionUrl, true);
    assert.doesNotMatch(
      stdout,
      /owner@sensitive|Customer Alpha|private-referral|token=|https?:\/\//i
    );
  });
});
