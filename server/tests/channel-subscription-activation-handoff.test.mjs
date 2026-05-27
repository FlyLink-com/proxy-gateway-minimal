import assert from "node:assert/strict";
import test from "node:test";

const handoffModule = await import("../services/channel-subscription-activation-handoff.mjs").catch(() => ({}));
const { buildChannelSubscriptionActivationHandoff } = handoffModule;

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
    generatedAt: "2026-05-28T10:00:00.000Z",
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
    generatedAt: "2026-05-28T10:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-28T10:01:00.000Z",
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

test("channel subscription activation handoff is exported", () => {
  assert.equal(typeof buildChannelSubscriptionActivationHandoff, "function");
});

test("channel subscription activation handoff prepares operator packet without executing activation", () => {
  const handoff = buildChannelSubscriptionActivationHandoff({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T10:03:00.000Z"
  });

  assert.equal(handoff.ok, true);
  assert.equal(handoff.mode, "channel-subscription-activation-handoff-packet");
  assert.equal(handoff.handoff.status, "ready_for_operator_approval_request");
  assert.equal(handoff.handoff.executionAuthority, "not_granted");
  assert.equal(handoff.handoff.nextGate.risk, "A");
  assert.equal(handoff.handoff.nextGate.gate, "risk_a_subscription_output_activation");
  assert.equal(handoff.handoff.nextGate.approvalRequestReady, true);
  assert.equal(handoff.handoff.nextGate.approvalTextIncluded, false);
  assert.equal(handoff.handoff.nextGate.approvalSubmissionRoute, null);
  assert.equal(handoff.handoff.nextGate.subscriptionOutputExecutionRoute, null);
  assert.equal(handoff.handoff.nextGate.executesGate, false);
  assert.equal(handoff.handoff.counts.baselinePool, 1);
  assert.equal(handoff.handoff.counts.canaryPool, 1);
  assert.equal(handoff.checklists.preflight.includes("confirm_channel_subscription_activation_readiness"), true);
  assert.equal(handoff.checklists.validation.includes("record_subscription_output_activation_validation"), true);
  assert.equal(handoff.checklists.rollback.includes("prepare_subscription_output_revert_plan"), true);
  assert.equal(handoff.candidates.canary[0].name, "tuic-lab");
  assert.equal(handoff.safety.noSubscriptionOutputMutation, true);
  assert.equal(handoff.safety.yamlNotGenerated, true);
  assert.equal(handoff.safety.noApprovalSubmission, true);
  assert.equal(handoff.safety.noTrafficMovement, true);
});

test("channel subscription activation handoff stays blocked when readiness is blocked", () => {
  const handoff = buildChannelSubscriptionActivationHandoff({
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

  assert.equal(handoff.handoff.status, "blocked_before_operator_approval_request");
  assert.equal(handoff.handoff.nextGate.approvalRequestReady, false);
  assert.equal(handoff.handoff.requiredNextAction, "complete_runtime_canary_before_subscription_output_activation");
  assert.deepEqual(handoff.handoff.blockers, ["runtime_canary_not_completed"]);
  assert.equal(handoff.safety.noSubscriptionOutputMutation, true);
});

test("channel subscription activation handoff rejects unsafe input without echoing it", () => {
  assert.throws(
    () => buildChannelSubscriptionActivationHandoff({
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
      assert.match(error.message, /channel subscription activation handoff/);
      assert.doesNotMatch(error.message, /edge-secret|token=unsafe|https:/);
      return true;
    }
  );
});
