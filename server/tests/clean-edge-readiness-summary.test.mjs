import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCleanEdgeReadinessSummary } from "../services/clean-edge-readiness-summary.mjs";

function withJsonFile(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "clean-edge-readiness-summary-"));
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
    generatedAt: "2026-05-27T21:40:00.000Z",
    repoState: {
      branchSynced: true,
      openPrRefs: [],
      blockingPrRefs: [],
      projectStateCheckPassed: true
    },
    subscriptionBoundary: {
      subOnAliyun: true,
      healthOk: true,
      adminBlocked: true,
      rootBlocked: true,
      noTokenRejected: true
    },
    edgeDns: {
      ssSgUnchangedOnOldAws: true
    },
    stoppedNodes: {
      prodEdgeAStopped: true,
      prodEdgeANoPublicIp: true,
      prodEdgeBStopped: true,
      prodEdgeBNoPublicIp: true
    },
    cleanTarget: {
      noTargetSelected: true,
      noTargetProvisioned: true
    },
    approval: {
      exactApprovalReceived: false
    },
    notes: ["summary only", "summary only", ""],
    ...overrides
  };
}

test("clean edge readiness summary normalizes safe gate evidence", () => {
  const summary = buildCleanEdgeReadinessSummary(readyInput());

  assert.deepEqual(summary, {
    ok: true,
    mode: "clean-edge-readiness-summary",
    generatedAt: "2026-05-27T21:40:00.000Z",
    readiness: {
      preconditionsReady: true,
      approvalRequired: true,
      executionAllowed: false,
      blockers: []
    },
    repoState: {
      branchSynced: true,
      projectStateCheckPassed: true,
      openPrScopeRecorded: true,
      openPrRefs: [],
      blockingPrRefs: [],
      blockingOpenPrRefs: []
    },
    subscriptionBoundary: {
      subOnAliyun: true,
      healthOk: true,
      adminBlocked: true,
      rootBlocked: true,
      noTokenRejected: true
    },
    edgeDns: {
      ssSgUnchangedOnOldAws: true
    },
    stoppedNodes: {
      prodEdgeAStopped: true,
      prodEdgeANoPublicIp: true,
      prodEdgeBStopped: true,
      prodEdgeBNoPublicIp: true
    },
    cleanTarget: {
      noTargetSelected: true,
      noTargetProvisioned: true
    },
    approval: {
      exactApprovalReceived: false
    },
    notes: ["summary only"],
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      noCloudMutation: true,
      noDnsMutation: true,
      noSubscriptionOutputMutation: true,
      noSecretHandling: true,
      omittedFields: [
        "rawHosts",
        "rawIps",
        "rawPorts",
        "rawSecrets",
        "tokens",
        "subscriptionUrls",
        "credentials",
        "customerData"
      ]
    }
  });
  assert.doesNotMatch(JSON.stringify(summary), /secret|token=|https?:|customer@example\.com|\/sub\/clash\.yaml\?/);
});

test("clean edge readiness summary blocks only on scoped blocking PRs", () => {
  const summary = buildCleanEdgeReadinessSummary(readyInput({
    repoState: {
      branchSynced: true,
      openPrRefs: ["pr-810", "pr-812"],
      blockingPrRefs: ["pr-812"],
      projectStateCheckPassed: true
    }
  }));

  assert.equal(summary.readiness.preconditionsReady, false);
  assert.deepEqual(summary.readiness.blockers, ["scoped blocking PRs are still open"]);
  assert.deepEqual(summary.repoState.blockingOpenPrRefs, ["pr-812"]);
});

test("clean edge readiness summary reports blockers and approval state without mutating anything", () => {
  const summary = buildCleanEdgeReadinessSummary(readyInput({
    repoState: {
      branchSynced: false,
      projectStateCheckPassed: false
    },
    subscriptionBoundary: {
      subOnAliyun: false,
      healthOk: false,
      adminBlocked: false,
      rootBlocked: false,
      noTokenRejected: false
    },
    edgeDns: {
      ssSgUnchangedOnOldAws: false
    },
    stoppedNodes: {
      prodEdgeAStopped: false,
      prodEdgeANoPublicIp: false,
      prodEdgeBStopped: true,
      prodEdgeBNoPublicIp: false
    },
    cleanTarget: {
      noTargetSelected: false,
      noTargetProvisioned: false
    },
    approval: {
      exactApprovalReceived: true
    }
  }));

  assert.equal(summary.readiness.preconditionsReady, false);
  assert.equal(summary.readiness.approvalRequired, false);
  assert.equal(summary.readiness.executionAllowed, false);
  assert.deepEqual(summary.readiness.blockers, [
    "repository branch is not synced",
    "open PR scope evidence is not recorded",
    "project-state check has not passed",
    "subscription boundary is not confirmed on Aliyun",
    "public health check is not verified",
    "public Admin blocking is not verified",
    "public root blocking is not verified",
    "no-token subscription rejection is not verified",
    "ss-sg edge DNS is not confirmed unchanged on the old AWS address",
    "prod-edge-a is not confirmed stopped",
    "prod-edge-a public IP absence is not confirmed",
    "prod-edge-b public IP absence is not confirmed",
    "clean edge target has already been selected before this readiness gate",
    "clean edge target has already been provisioned before this readiness gate"
  ]);
  assert.equal(summary.safety.noCloudMutation, true);
  assert.equal(summary.safety.noSecretHandling, true);
});

test("clean edge readiness summary allows execution only after approval and clean preconditions", () => {
  const summary = buildCleanEdgeReadinessSummary(readyInput({
    approval: {
      exactApprovalReceived: true
    }
  }));

  assert.equal(summary.readiness.preconditionsReady, true);
  assert.equal(summary.readiness.approvalRequired, false);
  assert.equal(summary.readiness.executionAllowed, true);
});

test("clean edge readiness summary rejects unsafe raw fields without echoing them", () => {
  assert.throws(
    () => buildCleanEdgeReadinessSummary({
      ...readyInput(),
      rawHost: "sub.example.com",
      rawIp: "203.0.113.10",
      rawSubscriptionUrl: "https://sub.example/sub/clash.yaml?token=secret-token",
      customerEmail: "customer@example.com"
    }),
    (error) => {
      assert.match(error.message, /safe clean edge readiness summary/);
      assert.doesNotMatch(error.message, /secret-token|customer@example\.com|sub\.example|203\.0\.113/);
      return true;
    }
  );
});

test("clean edge readiness summary CLI prints safe JSON", () => {
  withJsonFile(readyInput(), (path) => {
    const stdout = execFileSync(process.execPath, [
      "scripts/clean-edge-readiness-summary.mjs",
      path
    ], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8"
    });

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "clean-edge-readiness-summary");
    assert.equal(summary.readiness.preconditionsReady, true);
    assert.equal(summary.readiness.executionAllowed, false);
    assert.doesNotMatch(stdout, /secret|token=|https?:|customer@example\.com|\/sub\/clash\.yaml\?/);
  });
});
