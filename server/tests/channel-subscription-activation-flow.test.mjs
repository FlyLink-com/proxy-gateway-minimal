import assert from "node:assert/strict";
import test from "node:test";

const flowModule = await import("../services/channel-subscription-activation-flow.mjs").catch(() => ({}));
const { buildChannelSubscriptionActivationFlow } = flowModule;

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
    generatedAt: "2026-05-28T11:00:00.000Z",
    candidates: [
      {
        name: "ss-baseline",
        protocol: "ss",
        qualityClass: "stable",
        qualityTier: "healthy",
        channelScore: 99,
        recommendedPool: "stable",
        reasonCodes: ["stable_baseline_healthy"]
      },
      {
        name: "tuic-lab",
        protocol: "tuic",
        qualityClass: "weak-network",
        qualityTier: "healthy",
        channelScore: 95,
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      }
    ]
  };
}

function runtimeEvidenceInput(overrides = {}) {
  return {
    generatedAt: "2026-05-28T11:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-28T11:01:00.000Z",
        checks: {
          cloudIdentityVerified: true,
          networkPostureVerified: true,
          hostInventoryCompleted: true,
          runtimeSlotAvailable: true,
          runtimeInstalled: true,
          serviceActive: true,
          operatorImportValidated: true,
          cleanupRequired: false
        },
        blockerCodes: [],
        nextGate: "subscription_output_activation_approval",
        ...overrides
      }
    ]
  };
}

test("channel subscription activation flow is exported", () => {
  assert.equal(typeof buildChannelSubscriptionActivationFlow, "function");
});

test("channel subscription activation flow links draft, readiness, and handoff without executing activation", () => {
  const flow = buildChannelSubscriptionActivationFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T11:03:00.000Z"
  });

  assert.equal(flow.ok, true);
  assert.equal(flow.mode, "channel-subscription-activation-flow");
  assert.equal(flow.flowStatus, "ready_for_a_tier_subscription_output_activation_request");
  assert.equal(flow.requiredNextAction, "request_risk_a_subscription_output_activation_approval");
  assert.equal(flow.stages.runtimeEvidenceBridge.mode, "channel-runtime-evidence-bridge");
  assert.equal(flow.stages.subscriptionOutputDraft.status, "draft_ready_for_activation_review");
  assert.equal(flow.stages.activationReadiness.status, "ready_for_subscription_output_activation_request");
  assert.equal(flow.stages.activationHandoff.status, "ready_for_operator_approval_request");
  assert.equal(flow.gate.risk, "A");
  assert.equal(flow.gate.gate, "risk_a_subscription_output_activation");
  assert.equal(flow.gate.approvalRequestReady, true);
  assert.equal(flow.gate.executionAuthority, "not_granted");
  assert.equal(flow.gate.approvalTextIncluded, false);
  assert.equal(flow.gate.approvalSubmissionRoute, null);
  assert.equal(flow.gate.subscriptionOutputExecutionRoute, null);
  assert.equal(flow.outputs.activationHandoff.mode, "channel-subscription-activation-handoff-packet");
  assert.equal(flow.safety.advisoryOnly, true);
  assert.equal(flow.safety.noSubscriptionOutputMutation, true);
  assert.equal(flow.safety.noRuntimeMutation, true);
  assert.equal(flow.safety.noTrafficMovement, true);
  assert.equal(flow.safety.noApprovalSubmission, true);
  assert.equal(flow.safety.yamlNotGenerated, true);
  assert.doesNotMatch(JSON.stringify(flow), /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:|approvalPhrase/i);
});

test("channel subscription activation flow stays blocked when handoff is not approval-ready", () => {
  const flow = buildChannelSubscriptionActivationFlow({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput({
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
      nextGate: "runtime_deployment_approval"
    })
  });

  assert.equal(flow.flowStatus, "blocked_before_a_tier_subscription_output_activation_request");
  assert.equal(flow.requiredNextAction, "complete_runtime_canary_before_subscription_output_activation");
  assert.deepEqual(flow.blockers, ["runtime_canary_not_completed"]);
  assert.equal(flow.gate.approvalRequestReady, false);
  assert.equal(flow.safety.noSubscriptionOutputMutation, true);
});

test("channel subscription activation flow rejects unsafe input without echoing it", () => {
  assert.throws(
    () => buildChannelSubscriptionActivationFlow({
      dryRunSummary: {
        ok: true,
        servers: [
          { name: "https://edge-secret.example?token=unsafe", protocol: "tuic", qualityClass: "weak-network" }
        ]
      },
      measurementScore: measurementScore(),
      runtimeEvidenceInput: runtimeEvidenceInput()
    }),
    (error) => {
      assert.match(error.message, /channel subscription activation flow/);
      assert.doesNotMatch(error.message, /edge-secret|token=unsafe|https:/);
      return true;
    }
  );
});
