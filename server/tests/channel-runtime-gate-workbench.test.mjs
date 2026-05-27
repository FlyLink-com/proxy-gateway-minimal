import assert from "node:assert/strict";
import test from "node:test";
import { buildChannelRuntimeGateWorkbench } from "../services/channel-runtime-gate-workbench.mjs";

function dryRunSummary() {
  return {
    ok: true,
    servers: [
      { name: "ss-baseline", protocol: "ss", qualityClass: "stable" },
      { name: "tuic-lab", protocol: "tuic", qualityClass: "weak-network" }
    ]
  };
}

function measurementScore() {
  return {
    ok: true,
    mode: "channel-measurement-score",
    generatedAt: "2026-05-27T22:00:00.000Z",
    candidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        qualityClass: "stable",
        channelScore: 99,
        qualityTier: "healthy",
        recommendedPool: "stable",
        reasonCodes: ["stable_baseline_healthy"]
      },
      {
        name: "tuic-lab",
        protocol: "tuic",
        qualityClass: "weak-network",
        channelScore: 94,
        qualityTier: "healthy",
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      }
    ]
  };
}

function runtimeEvidenceInput(overrides = {}) {
  return {
    generatedAt: "2026-05-27T22:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-27T22:02:00.000Z",
        checks: {
          cloudIdentityVerified: true,
          networkPostureVerified: true,
          hostInventoryCompleted: true,
          runtimeSlotAvailable: true,
          runtimeInstalled: false,
          serviceActive: false,
          operatorImportValidated: false,
          cleanupRequired: false
        },
        blockerCodes: [],
        nextGate: "runtime_deployment_approval",
        ...overrides
      }
    ]
  };
}

test("runtime gate workbench summarizes approval-ready bridge evidence without execution controls", () => {
  const workbench = buildChannelRuntimeGateWorkbench({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-27T22:03:00.000Z"
  });

  assert.equal(workbench.ok, true);
  assert.equal(workbench.mode, "channel-runtime-gate-workbench");
  assert.equal(workbench.gate.status, "approval_ready");
  assert.equal(workbench.gate.requiredNextAction, "request_risk_a_runtime_canary_approval");
  assert.equal(workbench.gate.approvalRequestReady, true);
  assert.deepEqual(workbench.gate.counts, {
    canaryReady: 1,
    runtimeBlocked: 0,
    missingRuntimeInventory: 0
  });
  assert.deepEqual(workbench.gate.approvalPolicy, {
    risk: "A",
    approvalRequired: true,
    exactPhraseRequired: true,
    approvalPhraseEchoed: false,
    approvalSubmissionRoute: null,
    executesGate: false
  });
  assert.equal(workbench.candidates.approvalReady[0].name, "tuic-lab");
  assert.equal(workbench.candidates.approvalReady[0].approvalGate, "risk_a_channel_runtime_canary");
  assert.equal(workbench.safety.noRuntimeMutation, true);
  assert.equal(workbench.safety.noApprovalSubmission, true);
  assert.equal(workbench.safety.noTrafficMovement, true);
  assert.doesNotMatch(JSON.stringify(workbench), /secret|"host"\s*:|"port"\s*:|token=|"approvalPhrase"\s*:|"rawLog"\s*:/);
});

test("runtime gate workbench blocks approval when runtime evidence is incomplete", () => {
  const workbench = buildChannelRuntimeGateWorkbench({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput({
      checks: {
        cloudIdentityVerified: true,
        networkPostureVerified: true,
        hostInventoryCompleted: false,
        runtimeSlotAvailable: false,
        runtimeInstalled: false,
        serviceActive: false,
        operatorImportValidated: false,
        cleanupRequired: false
      },
      blockerCodes: ["ssh_banner_timeout"],
      nextGate: "channel_lab_b_selection"
    }),
    generatedAt: "2026-05-27T22:04:00.000Z"
  });

  assert.equal(workbench.gate.status, "blocked");
  assert.equal(workbench.gate.approvalRequestReady, false);
  assert.equal(workbench.gate.requiredNextAction, "resolve_runtime_inventory_blockers");
  assert.equal(workbench.gate.counts.runtimeBlocked, 1);
  assert.equal(workbench.candidates.blocked[0].blockers.includes("ssh_banner_timeout"), true);
});

test("runtime gate workbench rejects unsafe bridge inputs without echoing raw values", () => {
  assert.throws(
    () => buildChannelRuntimeGateWorkbench({
      dryRunSummary: dryRunSummary(),
      measurementScore: measurementScore(),
      runtimeEvidenceInput: runtimeEvidenceInput({
        candidateName: "203.0.113.10:443",
        targetLabel: "runtime-secret.example"
      })
    }),
    (error) => {
      assert.match(error.message, /channel runtime gate workbench/);
      assert.doesNotMatch(error.message, /203\.0\.113\.10|443|runtime-secret/);
      return true;
    }
  );
}
);
