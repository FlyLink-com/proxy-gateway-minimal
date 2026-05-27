import assert from "node:assert/strict";
import test from "node:test";
import { buildChannelLabTargetDecision } from "../services/channel-lab-target-decision.mjs";

function blockedLabAInventory(overrides = {}) {
  return {
    ...overrides,
    targetLabel: "channel-lab-a",
    protocol: "tuic",
    lifecycleStatus: "running",
    checks: {
      cloudIdentityVerified: true,
      networkPostureVerified: true,
      sshBannerReachable: false,
      ssmRegistered: false,
      hostInventoryCompleted: false,
      incumbentRuntimePresent: true,
      incumbentRuntimeProtocol: "hysteria2",
      candidatePortPlanRecorded: false,
      cleanupDecisionRecorded: false,
      ...(overrides.checks ?? {})
    },
    blockerCodes: ["ssh_banner_timeout", "ssm_unavailable"],
    nextGate: "channel_lab_b_selection_gate",
    ...(overrides.blockerCodes ? { blockerCodes: overrides.blockerCodes } : {}),
    ...(overrides.nextGate ? { nextGate: overrides.nextGate } : {})
  };
}

test("channel lab target decision recommends fresh channel-lab-b when channel-lab-a access is blocked", () => {
  const decision = buildChannelLabTargetDecision({
    generatedAt: "2026-05-27T23:30:00.000Z",
    inventory: blockedLabAInventory()
  });

  assert.equal(decision.ok, true);
  assert.equal(decision.mode, "channel-lab-target-decision");
  assert.equal(decision.status, "fresh_target_recommended");
  assert.equal(decision.target.targetLabel, "channel-lab-a");
  assert.equal(decision.target.reuseRecommendation, "not_recommended");
  assert.equal(decision.requiredNextAction, "request_channel_lab_b_selection_gate");
  assert.equal(decision.nextGate.risk, "A");
  assert.equal(decision.nextGate.gate, "risk_a_channel_lab_b_selection");
  assert.equal(decision.nextGate.approvalRequired, true);
  assert.equal(decision.nextGate.approvalTextIncluded, false);
  assert.equal(decision.nextGate.approvalSubmissionRoute, null);
  assert.equal(decision.nextGate.runtimeExecutionRoute, null);
  assert.deepEqual(decision.blockers, ["ssh_banner_timeout", "ssm_unavailable", "host_inventory_incomplete"]);
  assert.equal(decision.safety.noRuntimeMutation, true);
  assert.equal(decision.safety.noProductionMutation, true);
  assert.equal(decision.safety.noApprovalSubmission, true);
});

test("channel lab target decision requires access or cleanup gate before reusing channel-lab-a", () => {
  const decision = buildChannelLabTargetDecision({
    inventory: blockedLabAInventory({
      checks: {
        sshBannerReachable: true,
        ssmRegistered: false,
        hostInventoryCompleted: true,
        candidatePortPlanRecorded: false,
        cleanupDecisionRecorded: false
      },
      blockerCodes: []
    })
  });

  assert.equal(decision.status, "access_cleanup_gate_required");
  assert.equal(decision.target.reuseRecommendation, "separate_gate_required");
  assert.equal(decision.requiredNextAction, "request_channel_lab_a_access_port_cleanup_gate");
  assert.equal(decision.nextGate.gate, "risk_a_channel_lab_a_access_port_cleanup");
  assert.deepEqual(decision.blockers, ["candidate_port_plan_missing", "cleanup_decision_missing"]);
});

test("channel lab target decision accepts a fresh ready channel-lab-b candidate without granting execution", () => {
  const decision = buildChannelLabTargetDecision({
    inventory: {
      targetLabel: "channel-lab-b",
      protocol: "tuic",
      lifecycleStatus: "candidate_selected",
      checks: {
        cloudIdentityVerified: true,
        networkPostureVerified: true,
        sshBannerReachable: true,
        ssmRegistered: false,
        hostInventoryCompleted: true,
        incumbentRuntimePresent: false,
        candidatePortPlanRecorded: true,
        cleanupDecisionRecorded: true
      },
      blockerCodes: [],
      nextGate: "runtime_deployment_approval"
    }
  });

  assert.equal(decision.status, "ready_for_runtime_deployment_request");
  assert.equal(decision.target.reuseRecommendation, "fresh_target_ready");
  assert.equal(decision.requiredNextAction, "request_risk_a_runtime_deployment_approval");
  assert.equal(decision.nextGate.gate, "risk_a_channel_runtime_canary");
  assert.equal(decision.executionAuthority, "not_granted");
});

test("channel lab target decision rejects unsafe raw target details without echoing them", () => {
  assert.throws(
    () =>
      buildChannelLabTargetDecision({
        inventory: {
          targetLabel: "channel-lab-a",
          protocol: "tuic",
          host: "203.0.113.10",
          port: 443,
          url: "https://secret.example/path?token=hidden",
          checks: {
            cloudIdentityVerified: true
          }
        }
      }),
    (error) => {
      assert.equal(error.message.includes("203.0.113.10"), false);
      assert.equal(error.message.includes("443"), false);
      assert.equal(error.message.includes("secret.example"), false);
      assert.equal(error.message.includes("token="), false);
      return /channel lab target decision input is invalid/.test(error.message);
    }
  );
});

test("channel lab target decision rejects top-level extra fields", () => {
  assert.throws(
    () =>
      buildChannelLabTargetDecision({
        generatedAt: "2026-05-27T23:30:00.000Z",
        inventory: blockedLabAInventory(),
        rawTarget: "secret.example"
      }),
    (error) => {
      assert.equal(error.message.includes("secret.example"), false);
      return /channel lab target decision input is invalid/.test(error.message);
    }
  );
});
