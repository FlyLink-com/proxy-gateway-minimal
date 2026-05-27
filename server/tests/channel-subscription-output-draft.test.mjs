import assert from "node:assert/strict";
import test from "node:test";
import { buildChannelSubscriptionOutputDraft } from "../services/channel-subscription-output-draft.mjs";

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
    generatedAt: "2026-05-28T09:00:00.000Z",
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
        channelScore: 94,
        recommendedPool: "canary",
        reasonCodes: ["candidate_requires_canary"]
      }
    ]
  };
}

function runtimeEvidenceInput(overrides = {}) {
  return {
    generatedAt: "2026-05-28T09:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-28T09:01:00.000Z",
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

test("channel subscription output draft summarizes baseline and canary pools without mutating output", () => {
  const draft = buildChannelSubscriptionOutputDraft({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-28T09:02:00.000Z"
  });

  assert.equal(draft.ok, true);
  assert.equal(draft.mode, "channel-subscription-output-draft");
  assert.equal(draft.generatedAt, "2026-05-28T09:02:00.000Z");
  assert.equal(draft.status, "draft_ready_for_runtime_gate_review");
  assert.equal(draft.subscriptionOutputDraft.yamlGenerated, false);
  assert.equal(draft.subscriptionOutputDraft.realSubscriptionOutputChanged, false);
  assert.equal(draft.subscriptionOutputDraft.activationAllowed, false);
  assert.deepEqual(draft.subscriptionOutputDraft.baselinePool, [
    {
      name: "ss-baseline",
      protocol: "ss",
      qualityClass: "stable",
      qualityTier: "healthy",
      channelScore: 99,
      reasonCodes: ["stable_baseline_healthy"]
    }
  ]);
  assert.deepEqual(draft.subscriptionOutputDraft.canaryPool, [
    {
      name: "tuic-lab",
      protocol: "tuic",
      qualityClass: "weak-network",
      qualityTier: "healthy",
      channelScore: 94,
      targetLabel: "channel-lab-b",
      lifecycleStatus: "inventory_ready",
      nextGate: "runtime_deployment_approval",
      reasonCodes: ["candidate_requires_canary"]
    }
  ]);
  assert.deepEqual(draft.subscriptionOutputDraft.blockedPool, []);
  assert.equal(draft.nextGate.gate, "risk_a_channel_runtime_canary");
  assert.equal(draft.nextGate.approvalRequired, true);
  assert.equal(draft.nextGate.subscriptionOutputActivationApproved, false);
  assert.equal(draft.nextGate.approvalSubmissionRoute, null);
  assert.equal(draft.nextGate.executionRoute, null);
  assert.equal(draft.safety.noSubscriptionOutputMutation, true);
  assert.equal(draft.safety.noRuntimeMutation, true);
  assert.equal(draft.safety.noTrafficMovement, true);
});

test("channel subscription output draft blocks when runtime evidence is missing", () => {
  const draft = buildChannelSubscriptionOutputDraft({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: { generatedAt: "2026-05-28T09:01:00.000Z", records: [] }
  });

  assert.equal(draft.status, "blocked_before_subscription_output_draft");
  assert.equal(draft.subscriptionOutputDraft.canaryPool.length, 0);
  assert.equal(draft.subscriptionOutputDraft.blockedPool.length, 1);
  assert.deepEqual(draft.subscriptionOutputDraft.blockedPool[0].reasonCodes, [
    "candidate_requires_canary",
    "missing_runtime_inventory"
  ]);
  assert.equal(draft.nextGate.approvalRequired, false);
  assert.equal(draft.nextGate.subscriptionOutputActivationApproved, false);
  assert.equal(draft.safety.noSubscriptionOutputMutation, true);
});

test("channel subscription output draft rejects unsafe input without echoing it", () => {
  assert.throws(
    () => buildChannelSubscriptionOutputDraft({
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
      assert.match(error.message, /channel subscription output draft/);
      assert.doesNotMatch(error.message, /edge-secret|token=unsafe|https:/);
      return true;
    }
  );
});
