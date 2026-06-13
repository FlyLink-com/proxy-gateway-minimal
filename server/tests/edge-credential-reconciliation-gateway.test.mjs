import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCredentialReconciliationApplyPlan,
  buildCredentialReconciliationPlan
} from "../services/edge/credential-reconciliation-gateway.mjs";

function reconciliationState(overrides = {}) {
  return {
    channelRef: "channel-aliyun-a-tuic",
    runtime: "mihomo-tuic",
    activationSurface: "explicit-restart",
    desiredStateRef: "desired_state_aliyun_001",
    desiredCredentials: [
      {
        credentialRef: "order_ref_new",
        orderRef: "order_new",
        userRef: "portal_user_001",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:new_digest"
      },
      {
        credentialRef: "order_ref_rotate",
        orderRef: "order_rotate",
        userRef: "portal_user_002",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:rotated_digest"
      },
      {
        credentialRef: "order_ref_same",
        orderRef: "order_same",
        userRef: "portal_user_003",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:same_digest"
      }
    ],
    currentCredentials: [
      {
        credentialRef: "order_ref_expired",
        materialDigest: "sha256:expired_digest"
      },
      {
        credentialRef: "order_ref_rotate",
        materialDigest: "sha256:old_digest"
      },
      {
        credentialRef: "order_ref_same",
        materialDigest: "sha256:same_digest"
      }
    ],
    ...overrides
  };
}

test("reconciliation plan computes add revoke rotate and unchanged without leaking material", () => {
  const report = buildCredentialReconciliationPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json"
  });

  assert.equal(report.type, "gccgw_edge_credential_reconciliation_plan");
  assert.equal(report.ok, true);
  assert.equal(report.channelRef, "channel-aliyun-a-tuic");
  assert.equal(report.runtime, "mihomo-tuic");
  assert.equal(report.activationSurface, "explicit-restart");
  assert.deepEqual(report.summary, {
    desiredCount: 3,
    currentCount: 3,
    addCount: 1,
    revokeCount: 1,
    rotateCount: 1,
    unchangedCount: 1
  });
  assert.deepEqual(report.actions.map((action) => action.action), [
    "add",
    "revoke",
    "rotate",
    "unchanged"
  ]);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /new_digest|old_digest|rotated_digest|same_digest|expired_digest/i);
});

test("reconciliation plan rejects raw credential material fields", () => {
  const report = buildCredentialReconciliationPlan({
    desiredState: reconciliationState({
      desiredCredentials: [
        {
          credentialRef: "order_ref_unsafe",
          orderRef: "order_unsafe",
          userRef: "portal_user_unsafe",
          expiresAt: "2026-07-05T00:00:00.000Z",
          material: {
            uuid: "11111111-1111-4111-8111-111111111111",
            password: "synthetic-secret-value"
          }
        }
      ],
      currentCredentials: []
    }),
    inputPath: "unsafe-desired-state.json"
  });

  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "raw_sensitive_field_present"));
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-secret-value|11111111-1111-4111-8111-111111111111/);
});

test("reconciliation apply remains fail closed until a production runtime adapter exists", () => {
  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true
  });

  assert.equal(report.type, "gccgw_edge_credential_reconciliation_apply_plan");
  assert.equal(report.ok, false);
  assert.equal(report.mode, "apply");
  assert.ok(report.blockers.some((blocker) => blocker.code === "production_runtime_adapter_required"));
  assert.equal(report.nextAction, "stop_before_runtime_mutation");
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
});

test("reconciliation apply uses an injected runtime adapter and returns a redacted receipt", () => {
  const calls = [];
  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: {
      applyCredentialReconciliation(payload) {
        calls.push(payload);
        return {
          status: "applied",
          mutation: true,
          backupRef: "backup_aliyun_001",
          configTest: {
            exitCode: 0,
            ok: true
          },
          service: {
            name: "mihomo-tuic.service",
            active: true,
            restarted: true
          },
          listener: {
            udp443: true
          },
          appliedAt: "2026-06-05T10:00:00.000Z"
        };
      }
    }
  });

  assert.equal(report.type, "gccgw_edge_credential_reconciliation_apply_plan");
  assert.equal(report.ok, true);
  assert.equal(report.mode, "apply");
  assert.equal(report.nextAction, "validate_runtime_state");
  assert.equal(report.mutation, true);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
  assert.deepEqual(report.runtimeReceipt, {
    status: "applied",
    mutation: true,
    backupRef: "backup_aliyun_001",
    configTest: {
      exitCode: 0,
      ok: true
    },
    service: {
      name: "mihomo-tuic.service",
      active: true,
      restarted: true
    },
    listener: {
      udp443: true,
      tcp: false
    },
    appliedAt: "2026-06-05T10:00:00.000Z"
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].channelRef, "channel-aliyun-a-tuic");
  assert.equal(calls[0].desiredStateRef, "desired_state_aliyun_001");
  assert.equal(calls[0].activationSurface, "explicit-restart");
  assert.deepEqual(calls[0].actions.map((action) => action.action), [
    "add",
    "revoke",
    "rotate",
    "unchanged"
  ]);
  assert.doesNotMatch(JSON.stringify(report), /new_digest|old_digest|rotated_digest|same_digest|expired_digest/i);
});

test("reconciliation apply accepts a pending remote data-plane handoff without local mutation", () => {
  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState({
      channelRef: "channel-sgp-a-hy2",
      runtime: "hysteria2",
      desiredStateRef: "desired_state_sgp_001"
    }),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: {
      applyCredentialReconciliation() {
        return {
          status: "pending",
          mutation: false,
          handoffRef: "handoff_channel-sgp-a-hy2_001",
          service: {
            name: "remote-data-plane-handoff",
            active: false,
            restarted: false
          },
          listener: {
            udp443: false
          },
          appliedAt: "2026-06-05T10:00:00.000Z"
        };
      }
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.runtime, "hysteria2");
  assert.equal(report.nextAction, "complete_data_plane_handoff");
  assert.equal(report.mutation, false);
  assert.deepEqual(report.runtimeReceipt, {
    status: "pending",
    mutation: false,
    handoffRef: "handoff_channel-sgp-a-hy2_001",
    service: {
      name: "remote-data-plane-handoff",
      active: false,
      restarted: false
    },
    listener: {
      udp443: false,
      tcp: false
    },
    appliedAt: "2026-06-05T10:00:00.000Z"
  });
  assert.doesNotMatch(JSON.stringify(report), /new_digest|old_digest|rotated_digest|same_digest|expired_digest/i);
});

test("reconciliation apply rejects unsafe runtime adapter receipts without leaking them", () => {
  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: true,
    runtimeAdapter: {
      applyCredentialReconciliation() {
        return {
          status: "applied",
          mutation: true,
          rawConfig: "users:\n  - password: synthetic-secret-value",
          service: {
            name: "mihomo-tuic.service",
            active: true
          }
        };
      }
    }
  });

  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "runtime_receipt_sensitive_field_present"));
  assert.equal(report.mutation, true);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /synthetic-secret-value|rawConfig|password/i);
});

test("reconciliation apply is blocked without the production execution flag", () => {
  const report = buildCredentialReconciliationApplyPlan({
    desiredState: reconciliationState(),
    inputPath: "desired-state.json",
    executeProductionMutation: false
  });

  assert.equal(report.ok, false);
  assert.ok(report.blockers.some((blocker) => blocker.code === "execute_production_mutation_required"));
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
});
