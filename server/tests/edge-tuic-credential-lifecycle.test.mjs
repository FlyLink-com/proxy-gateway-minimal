import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTuicCredentialLifecycleApplyPlan,
  buildTuicCredentialLifecyclePlan
} from "../services/edge/tuic-credential-lifecycle.mjs";

function safeDesiredState(overrides = {}) {
  return {
    node: "channel-lab-b-tuic",
    runtime: "mihomo-tuic",
    actions: [
      {
        action: "add",
        credentialRef: "order_ref_add",
        expiresAt: "2026-07-05T00:00:00.000Z"
      },
      {
        action: "disable",
        credentialRef: "order_ref_expired",
        reason: "order_expired"
      },
      {
        action: "rotate",
        credentialRef: "order_ref_rotate",
        nextCredentialRef: "order_ref_rotate_next"
      }
    ],
    ...overrides
  };
}

test("TUIC credential lifecycle plan summarizes safe desired actions without leaking material", () => {
  const report = buildTuicCredentialLifecyclePlan({
    desiredState: safeDesiredState(),
    inputPath: "desired-state.json"
  });

  assert.equal(report.type, "gccgw_edge_tuic_credential_lifecycle_plan");
  assert.equal(report.ok, true);
  assert.equal(report.node, "channel-lab-b-tuic");
  assert.equal(report.runtime, "mihomo-tuic");
  assert.deepEqual(report.summary, {
    actionCount: 3,
    addCount: 1,
    disableCount: 1,
    rotateCount: 1
  });
  assert.deepEqual(report.actions.map((action) => action.action), ["add", "disable", "rotate"]);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /password|token|subscriptionUrl|rawConfig|sqliteRow/i);
});

test("TUIC credential lifecycle plan rejects raw sensitive desired-state fields", () => {
  const report = buildTuicCredentialLifecyclePlan({
    desiredState: safeDesiredState({
      actions: [
        {
          action: "add",
          credentialRef: "order_ref_add",
          password: "synthetic-secret-value",
          subscriptionUrl: "https://sub.example.invalid/path?token=synthetic-token"
        }
      ],
      customerEmail: "person@example.invalid"
    }),
    inputPath: "unsafe-desired-state.json"
  });

  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "raw_sensitive_field_present"));
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-secret-value|synthetic-token|person@example/i);
});

test("TUIC credential lifecycle apply is blocked without the production execution flag", () => {
  const report = buildTuicCredentialLifecycleApplyPlan({
    desiredState: safeDesiredState(),
    inputPath: "desired-state.json",
    executeProductionMutation: false
  });

  assert.equal(report.type, "gccgw_edge_tuic_credential_lifecycle_apply_plan");
  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "execute_production_mutation_required"));
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
});

test("TUIC credential lifecycle apply is still blocked until a runtime adapter exists", () => {
  const report = buildTuicCredentialLifecycleApplyPlan({
    desiredState: safeDesiredState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true
  });

  assert.equal(report.type, "gccgw_edge_tuic_credential_lifecycle_apply_plan");
  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "runtime_apply_adapter_not_implemented"));
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
});

test("TUIC credential lifecycle apply can target an explicit restart activation gate", () => {
  const report = buildTuicCredentialLifecycleApplyPlan({
    desiredState: safeDesiredState({
      activationSurface: "explicit-restart"
    }),
    inputPath: "desired-state.json",
    executeProductionMutation: true
  });

  assert.equal(report.type, "gccgw_edge_tuic_credential_lifecycle_apply_plan");
  assert.equal(report.ok, false);
  assert.equal(report.activationSurface, "explicit-restart");
  assert.ok(report.blockers.some((blocker) => blocker.code === "production_runtime_adapter_required"));
  assert.ok(report.warnings.some((warning) => warning.code === "service_restart_activation_requires_approved_downtime"));
  assert.equal(report.blockers.some((blocker) => blocker.code === "runtime_apply_adapter_not_implemented"), false);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
});
