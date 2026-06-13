import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildNodeImageProvisioningReadinessSummary } from "../services/node-image-provisioning-readiness-summary.mjs";

function withJsonFile(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "node-image-readiness-summary-"));
  try {
    const path = join(tempDir, "inventory.json");
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return fn(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readyInput(overrides = {}) {
  return {
    generatedAt: "2026-06-13T10:00:00.000Z",
    repoState: {
      branchSynced: true,
      noOpenPrs: true,
      projectStateCheckPassed: true,
      artifactHashRecorded: true
    },
    imageBuild: {
      noSecretBaseImage: true,
      approvedReleaseSkeleton: true,
      serviceUnitsDisabled: true,
      runtimeBinariesValidated: true,
      templatesParse: true,
      noSecretScanPassed: true,
      buildLogsSanitized: true,
      imageManifestRecorded: true
    },
    firstBoot: {
      nodeRefReviewed: true,
      providerInventoryCaptured: true,
      protectedMaterialOutOfImage: true,
      privateControlPlanePathReady: true,
      edgeAgentInstalled: true,
      channelPlanReviewed: true
    },
    runtime: {
      xrayConfigTestPlanned: true,
      hysteria2ConfigTestPlanned: true,
      tuicConfigTestPlanned: true,
      statsLoopbackOnly: true,
      publicAdminBlocked: true
    },
    receiptGate: {
      desiredStatePullRequired: true,
      appliedReceiptRequired: true,
      freshReceiptRequired: true,
      subscriptionRenderWithholdsUntilReceipt: true,
      disableOrExpiryGateRequired: true
    },
    approval: {
      exactApprovalReceived: false,
      liveOrderSmokeApproved: false
    },
    notes: ["summary only", "summary only", ""],
    ...overrides
  };
}

test("node image readiness summary normalizes image and first-boot facts without execution authority", () => {
  const summary = buildNodeImageProvisioningReadinessSummary(readyInput());

  assert.deepEqual(summary.readiness, {
    preconditionsReady: true,
    approvalRequired: true,
    activationAllowed: false,
    liveOrderSmokeAllowed: false,
    blockers: []
  });
  assert.equal(summary.mode, "node-image-provisioning-readiness-summary");
  assert.equal(summary.safety.noCloudMutation, true);
  assert.equal(summary.safety.noSecretHandling, true);
  assert.deepEqual(summary.notes, ["summary only"]);
  assert.doesNotMatch(JSON.stringify(summary), /secret-token|token=|https?:|customer@example\.com|\/sub\/clash\.yaml\?/);
});

test("node image readiness summary blocks activation when any receipt gate is missing", () => {
  const summary = buildNodeImageProvisioningReadinessSummary(readyInput({
    receiptGate: {
      desiredStatePullRequired: true,
      appliedReceiptRequired: false,
      freshReceiptRequired: false,
      subscriptionRenderWithholdsUntilReceipt: false,
      disableOrExpiryGateRequired: true
    },
    approval: {
      exactApprovalReceived: true,
      liveOrderSmokeApproved: true
    }
  }));

  assert.equal(summary.readiness.preconditionsReady, false);
  assert.equal(summary.readiness.activationAllowed, false);
  assert.equal(summary.readiness.liveOrderSmokeAllowed, false);
  assert.deepEqual(summary.readiness.blockers, [
    "applied receipt is not required",
    "fresh receipt is not required",
    "subscription rendering is not confirmed receipt-gated"
  ]);
});

test("node image readiness summary separates activation approval from live-order smoke approval", () => {
  const activationOnly = buildNodeImageProvisioningReadinessSummary(readyInput({
    approval: {
      exactApprovalReceived: true,
      liveOrderSmokeApproved: false
    }
  }));
  assert.equal(activationOnly.readiness.activationAllowed, true);
  assert.equal(activationOnly.readiness.liveOrderSmokeAllowed, false);

  const withSmoke = buildNodeImageProvisioningReadinessSummary(readyInput({
    approval: {
      exactApprovalReceived: true,
      liveOrderSmokeApproved: true
    }
  }));
  assert.equal(withSmoke.readiness.activationAllowed, true);
  assert.equal(withSmoke.readiness.liveOrderSmokeAllowed, true);
});

test("node image readiness summary rejects unsupported or sensitive raw fields without echoing them", () => {
  assert.throws(
    () => buildNodeImageProvisioningReadinessSummary({
      ...readyInput(),
      rawHost: "sub.example.com",
      rawIp: "203.0.113.10",
      notes: ["https://sub.example/sub/clash.yaml?token=secret-token"]
    }),
    (error) => {
      assert.match(error.message, /safe node image provisioning readiness summary/);
      assert.doesNotMatch(error.message, /secret-token|sub\.example|203\.0\.113/);
      return true;
    }
  );
});

test("node image readiness summary CLI prints safe JSON", () => {
  withJsonFile(readyInput(), (path) => {
    const stdout = execFileSync(process.execPath, [
      "scripts/node-image-provisioning-readiness-summary.mjs",
      path
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "node-image-provisioning-readiness-summary");
    assert.equal(summary.readiness.preconditionsReady, true);
    assert.equal(summary.readiness.activationAllowed, false);
    assert.doesNotMatch(stdout, /secret-token|token=|https?:|customer@example\.com|\/sub\/clash\.yaml\?/);
  });
});
