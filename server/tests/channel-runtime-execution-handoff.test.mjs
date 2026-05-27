import assert from "node:assert/strict";
import test from "node:test";
import { buildChannelRuntimeExecutionHandoff } from "../services/channel-runtime-execution-handoff.mjs";

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
    generatedAt: "2026-05-27T23:00:00.000Z",
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
    generatedAt: "2026-05-27T23:01:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-b",
        observedAt: "2026-05-27T23:02:00.000Z",
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

test("runtime execution handoff summarizes an approval-ready workbench without granting authority", () => {
  const handoff = buildChannelRuntimeExecutionHandoff({
    dryRunSummary: dryRunSummary(),
    measurementScore: measurementScore(),
    runtimeEvidenceInput: runtimeEvidenceInput(),
    generatedAt: "2026-05-27T23:03:00.000Z"
  });

  assert.equal(handoff.ok, true);
  assert.equal(handoff.mode, "channel-runtime-execution-handoff-packet");
  assert.equal(handoff.handoff.status, "ready_for_operator_approval_request");
  assert.equal(handoff.handoff.requiredNextAction, "request_risk_a_runtime_canary_approval");
  assert.equal(handoff.handoff.executionAuthority, "not_granted");
  assert.equal(handoff.handoff.nextGate.risk, "A");
  assert.equal(handoff.handoff.nextGate.gate, "risk_a_channel_runtime_canary");
  assert.equal(handoff.handoff.nextGate.approvalRequestReady, true);
  assert.equal(handoff.handoff.nextGate.approvalTextIncluded, false);
  assert.equal(handoff.handoff.nextGate.approvalSubmissionRoute, null);
  assert.equal(handoff.handoff.nextGate.runtimeExecutionRoute, null);
  assert.equal(handoff.handoff.nextGate.executesGate, false);
  assert.equal(handoff.candidates.approvalReady[0].name, "tuic-lab");
  assert.equal(handoff.checklists.preflight.includes("confirm_channel_runtime_canary_runbook"), true);
  assert.equal(handoff.checklists.validation.includes("record_operator_device_canary_metrics"), true);
  assert.equal(handoff.checklists.rollback.includes("document_runtime_cleanup_or_retain_decision"), true);
  assert.equal(handoff.safety.noRuntimeMutation, true);
  assert.equal(handoff.safety.noApprovalSubmission, true);
  assert.equal(handoff.safety.noTrafficMovement, true);
  assert.doesNotMatch(JSON.stringify(handoff), /secret|"host"\s*:|"port"\s*:|token=|"approvalPhrase"\s*:|"rawLog"\s*:/);
});

test("runtime execution handoff remains blocked when runtime evidence is incomplete", () => {
  const handoff = buildChannelRuntimeExecutionHandoff({
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
    generatedAt: "2026-05-27T23:04:00.000Z"
  });

  assert.equal(handoff.handoff.status, "blocked_before_operator_approval_request");
  assert.equal(handoff.handoff.nextGate.approvalRequestReady, false);
  assert.equal(handoff.handoff.requiredNextAction, "resolve_runtime_inventory_blockers");
  assert.equal(handoff.handoff.counts.runtimeBlocked, 1);
  assert.equal(handoff.candidates.blocked[0].blockers.includes("ssh_banner_timeout"), true);
});

test("runtime execution handoff rejects unsafe inputs without echoing raw values", () => {
  assert.throws(
    () => buildChannelRuntimeExecutionHandoff({
      dryRunSummary: dryRunSummary(),
      measurementScore: measurementScore(),
      runtimeEvidenceInput: runtimeEvidenceInput({
        candidateName: "203.0.113.10:443",
        targetLabel: "runtime-secret.example"
      })
    }),
    (error) => {
      assert.match(error.message, /channel runtime execution handoff/);
      assert.doesNotMatch(error.message, /203\.0\.113\.10|443|runtime-secret/);
      return true;
    }
  );
});
