import assert from "node:assert/strict";
import test from "node:test";

const activationModule = await import("../services/channel-subscription-activation-readiness.mjs").catch(() => ({}));
const { buildChannelSubscriptionActivationReadiness } = activationModule;

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

test("channel subscription activation readiness is exported", () => {
  assert.equal(typeof buildChannelSubscriptionActivationReadiness, "function");
});

test("channel subscription activation readiness prepares an approval request without executing activation", () => {
  const readiness = buildChannelSubscriptionActivationReadiness({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T10:02:00.000Z"
  });

  assert.equal(readiness.ok, true);
  assert.equal(readiness.mode, "channel-subscription-activation-readiness");
  assert.equal(readiness.status, "ready_for_subscription_output_activation_request");
  assert.equal(readiness.activationGate.approvalRequestReady, true);
  assert.equal(readiness.activationGate.executionAuthority, "not_granted");
  assert.equal(readiness.activationGate.approvalSubmissionRoute, null);
  assert.equal(readiness.activationGate.executionRoute, null);
  assert.equal(readiness.activationGate.approvalTextIncluded, false);
  assert.equal(readiness.readiness.baselineReady, true);
  assert.equal(readiness.readiness.canaryOutputCandidateCount, 1);
  assert.equal(readiness.readiness.blockedCandidateCount, 0);
  assert.deepEqual(readiness.readiness.blockers, []);
  assert.equal(readiness.subscriptionOutputDraft.yamlGenerated, false);
  assert.equal(readiness.subscriptionOutputDraft.realSubscriptionOutputChanged, false);
  assert.equal(readiness.subscriptionOutputDraft.activationAllowed, false);
  assert.equal(readiness.safety.noSubscriptionOutputMutation, true);
  assert.equal(readiness.safety.noRuntimeMutation, true);
  assert.equal(readiness.safety.noTrafficMovement, true);
});

test("channel subscription activation readiness blocks before runtime canary completion", () => {
  const readiness = buildChannelSubscriptionActivationReadiness({
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

  assert.equal(readiness.status, "blocked_before_subscription_output_activation");
  assert.equal(readiness.activationGate.approvalRequestReady, false);
  assert.equal(readiness.activationGate.requiredNextAction, "complete_runtime_canary_before_subscription_output_activation");
  assert.deepEqual(readiness.readiness.blockers, ["runtime_canary_not_completed"]);
  assert.equal(readiness.safety.noSubscriptionOutputMutation, true);
});

test("channel subscription activation readiness rejects unsafe input without echoing it", () => {
  assert.throws(
    () => buildChannelSubscriptionActivationReadiness({
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
      assert.match(error.message, /channel subscription activation readiness/);
      assert.doesNotMatch(error.message, /edge-secret|token=unsafe|https:/);
      return true;
    }
  );
});
