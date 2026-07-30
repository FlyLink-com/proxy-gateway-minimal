import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOrderUsageQuotaLifecycleGate } from "../services/platform/order-usage-quota-lifecycle-gate.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";

const NOW = "2026-06-06T00:00:00.000Z";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-usage-quota-gate-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    seedDeliveredOrder(store);
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedDeliveredOrder(store) {
  store.createAccount({
    id: "acct_usage_gate_1",
    ownerRef: "portal_user_usage_gate_1",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_usage_gate_1",
    accountId: "acct_usage_gate_1",
    plan: "monthly",
    status: "active",
    validFrom: NOW,
    validUntil: "2026-07-06T00:00:00.000Z",
    trafficLimitBytes: 1000,
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "pareq_usage_gate_1",
    accountId: "acct_usage_gate_1",
    entitlementId: "ent_usage_gate_1",
    approvalRef: "approval_usage_gate_1",
    status: "issued",
    quantity: 1,
    nodeId: "channel-aws-staging-hy2",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.linkIssuedSubscription({
    id: "link_usage_gate_1",
    requestId: "pareq_usage_gate_1",
    tenantRef: "tenant_usage_gate_1",
    artifactRef: "artifact_usage_gate_1",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.upsertPortalAccessRequest({
    id: "pareq_usage_gate_1",
    portalUserRef: "portal_user_usage_gate_1",
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: NOW,
    updatedAt: NOW,
    reviewedAt: NOW,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: "2026-07-06T00:00:00.000Z",
    validUntil: "2026-07-06T00:00:00.000Z",
    entitlementRef: "ent_usage_gate_1",
    accessGrantRef: "grant_usage_gate_1",
    tenantId: "tenant_usage_gate_1",
    artifactId: "artifact_usage_gate_1",
    edgeChannelRef: "channel-aws-staging-hy2",
    edgeCredentialRef: "edgecred_usage_gate_1",
    edgeMaterialDigest: "sha256:digest_usage_gate_1"
  });
}

function recordOverQuotaUsage(store) {
  const accounting = createTrafficAccountingService({
    controlStore: store,
    nowFn: () => "2026-06-06T00:05:00.000Z",
    usageSampleRefFactory: () => "usage_sample_usage_gate_1"
  });
  return accounting.recordUsageObservation({
    sourceRef: "hy2_usage_gate_snapshot_1",
    channelRef: "channel-aws-staging-hy2",
    edgeCredentialRef: "edgecred_usage_gate_1",
    observedAt: "2026-06-06T00:05:00.000Z",
    intervalStartedAt: "2026-06-06T00:00:00.000Z",
    intervalEndedAt: "2026-06-06T00:05:00.000Z",
    uploadBytes: 400,
    downloadBytes: 600
  });
}

test("usage quota lifecycle gate plans controlled traffic supply suspension without mutating orders by default", () => {
  withStore((store) => {
    const overQuota = recordOverQuotaUsage(store);
    const calls = [];
    const gate = createOrderUsageQuotaLifecycleGate({
      orderLifecycleService: {
        suspendTrafficSupply(input) {
          calls.push(input);
          return { id: input.requestRef, status: "disabled" };
        }
      }
    });

    const result = gate.handleUsageDecision(overQuota);

    assert.equal(overQuota.status, "over_quota_disable_required");
    assert.equal(overQuota.lifecycleAction, "traffic_supply_suspend_required");
    assert.equal(result.ok, true);
    assert.equal(result.status, "controlled_traffic_supply_suspend_required");
    assert.equal(result.nextAction, "request_controlled_traffic_supply_suspend_approval");
    assert.equal(result.mutation, false);
    assert.equal(result.execution.trafficSupplySuspendRequired, true);
    assert.equal(result.execution.accountMutationRequired, false);
    assert.equal(result.safety.noAccountDisable, true);
    assert.equal(calls.length, 0);
    assert.equal(store.listPortalAccessRequests({ status: "delivered" }).length, 1);
    assert.doesNotMatch(JSON.stringify(result), /https?:\/\/|password|token|rawConfig/i);
  });
});

test("usage quota lifecycle gate keeps suspension pending until edge runtime enforcement is applied", () => {
  withStore((store) => {
    const runtimeCalls = [];
    const edgeLifecycleCalls = [];
    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-06T00:10:00.000Z",
      controlStore: store,
      runtimeCore: {
        revokeSubscriptionArtifact(id) {
          runtimeCalls.push(["revokeSubscriptionArtifact", id]);
          return { id, status: "revoked" };
        },
        disableTenant(id) {
          runtimeCalls.push(["disableTenant", id]);
          return { id, status: "disabled" };
        }
      },
      edgeLifecycleService: {
        reconcileOrderLifecycle(input) {
          edgeLifecycleCalls.push(input);
          return {
            ok: true,
            mutation: false,
            redacted: true,
            nextAction: "review_apply_gate"
          };
        }
      }
    });
    const overQuota = recordOverQuotaUsage(store);
    const gate = createOrderUsageQuotaLifecycleGate({
      orderLifecycleService: requests
    });

    const result = gate.handleUsageDecision(overQuota, {
      executeControlledTrafficSupplySuspend: true,
      reviewedByRef: "usage_quota_gate"
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "controlled_traffic_supply_suspend_pending");
    assert.equal(result.nextAction, "wait_for_edge_runtime_enforcement");
    assert.equal(result.mutation, false);
    assert.equal(result.execution.trafficSupplySuspendExecuted, false);
    assert.equal(result.execution.accountMutationRequired, false);
    assert.deepEqual(runtimeCalls, [
      ["revokeSubscriptionArtifact", "artifact_usage_gate_1"],
      ["disableTenant", "tenant_usage_gate_1"]
    ]);
    assert.equal(edgeLifecycleCalls.length, 1);
    assert.equal(edgeLifecycleCalls[0].reason, "traffic_supply_suspended");
    assert.equal(edgeLifecycleCalls[0].order.edgeCredentialRef, "edgecred_usage_gate_1");
    assert.equal(store.listPortalAccessRequests({ status: "disabled" })[0].id, "pareq_usage_gate_1");
    assert.equal(store.getPortalAccessRequest("pareq_usage_gate_1").nextAction, "traffic_supply_suspended_quota");
    assert.equal(result.suspendedOrder.status, "disabled");
    assert.equal(result.suspendedOrder.nextAction, "traffic_supply_suspended_quota");
    assert.equal(result.suspendedOrder.safety.noSubscriptionUrl, true);
    assert.doesNotMatch(JSON.stringify(result), /https?:\/\/|password|token|rawConfig/i);
  });
});

test("usage quota lifecycle gate keeps legacy mutation-only results pending without an applied receipt", () => {
  const gate = createOrderUsageQuotaLifecycleGate({
    orderLifecycleService: {
      suspendTrafficSupply(input) {
        return {
          id: input.requestRef,
          status: "disabled",
          nextAction: "traffic_supply_suspended_quota",
          safety: {
            noSubscriptionUrl: true,
            noRuntimeMutation: false,
            noProductionMutation: false
          }
        };
      }
    }
  });

  const result = gate.handleUsageDecision({
    ok: true,
    status: "over_quota_disable_required",
    lifecycleAction: "traffic_supply_suspend_required",
    requestId: "pareq_applied_001",
    portalUserRef: "portal_user_applied_001"
  }, {
    executeControlledTrafficSupplySuspend: true
  });

  assert.equal(result.status, "controlled_traffic_supply_suspend_pending");
  assert.equal(result.mutation, false);
  assert.equal(result.execution.trafficSupplySuspendExecuted, false);
});

test("usage quota lifecycle gate completes after an explicit applied runtime receipt", () => {
  const gate = createOrderUsageQuotaLifecycleGate({
    orderLifecycleService: {
      suspendTrafficSupply(input) {
        return {
          id: input.requestRef,
          status: "disabled",
          nextAction: "traffic_supply_suspended_quota",
          runtimeEnforcement: {
            state: "applied",
            receiptStatus: "applied",
            redacted: true
          },
          safety: {
            noSubscriptionUrl: true,
            noRuntimeMutation: false,
            noProductionMutation: false
          }
        };
      }
    }
  });

  const result = gate.handleUsageDecision({
    ok: true,
    status: "over_quota_disable_required",
    lifecycleAction: "traffic_supply_suspend_required",
    requestId: "pareq_receipt_applied_001",
    portalUserRef: "portal_user_receipt_applied_001"
  }, {
    executeControlledTrafficSupplySuspend: true
  });

  assert.equal(result.status, "controlled_traffic_supply_suspend_completed");
  assert.equal(result.mutation, true);
  assert.equal(result.execution.trafficSupplySuspendExecuted, true);
});

test("usage quota lifecycle gate does not treat a partial failed runtime mutation as completed", () => {
  const gate = createOrderUsageQuotaLifecycleGate({
    orderLifecycleService: {
      suspendTrafficSupply(input) {
        return {
          id: input.requestRef,
          status: "disabled",
          runtimeEnforcement: {
            state: "failed",
            redacted: true
          },
          safety: {
            noSubscriptionUrl: true,
            noRuntimeMutation: false,
            noProductionMutation: false
          }
        };
      }
    }
  });

  const result = gate.handleUsageDecision({
    ok: true,
    status: "over_quota_disable_required",
    lifecycleAction: "traffic_supply_suspend_required",
    requestId: "pareq_failed_001",
    portalUserRef: "portal_user_failed_001"
  }, {
    executeControlledTrafficSupplySuspend: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "controlled_traffic_supply_suspend_failed");
  assert.equal(result.mutation, false);
  assert.equal(result.execution.trafficSupplySuspendExecuted, false);
  assert.deepEqual(result.blockers, [{ code: "edge_runtime_enforcement_failed" }]);
});

test("quota rollover sweep is bounded, receipt-aware, idempotent, and returns aggregates only", () => {
  const candidates = [
    { requestRef: "pareq_rollover_applied", portalUserRef: "portal_user_applied" },
    { requestRef: "pareq_rollover_pending", portalUserRef: "portal_user_pending" },
    { requestRef: "pareq_rollover_outside_bound", portalUserRef: "portal_user_outside_bound" }
  ];
  const resumed = new Set();
  const listLimits = [];
  const gate = createOrderUsageQuotaLifecycleGate({
    orderLifecycleService: {
      suspendTrafficSupply() {
        throw new Error("suspend is not part of rollover sweep");
      },
      listQuotaSuspendedTrafficSupplies({ limit }) {
        listLimits.push(limit);
        return candidates.filter((candidate) => !resumed.has(candidate.requestRef)).slice(0, limit);
      },
      resumeTrafficSupply(input) {
        resumed.add(input.requestRef);
        return input.requestRef === "pareq_rollover_applied"
          ? {
              ok: true,
              status: "quota_traffic_supply_expiry_cleanup_completed",
              mutation: true,
              runtimeEnforcement: { state: "applied", redacted: true }
            }
          : {
              ok: true,
              status: "quota_traffic_supply_expiry_cleanup_pending",
              mutation: false,
              runtimeEnforcement: { state: "pending", redacted: true }
            };
      }
    }
  });

  const first = gate.sweepQuotaCycleRollovers({
    limit: 2,
    reviewedByRef: "usage_quota_rollover_gate"
  });
  const repeated = gate.sweepQuotaCycleRollovers({
    limit: 2,
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.deepEqual(listLimits, [2, 2]);
  assert.equal(first.ok, false);
  assert.equal(first.scannedCount, 2);
  assert.equal(first.appliedCount, 1);
  assert.equal(first.pendingCount, 1);
  assert.equal(first.failedCount, 0);
  assert.equal(repeated.scannedCount, 1);
  assert.equal(repeated.appliedCount, 0);
  assert.equal(repeated.pendingCount, 1);
  assert.equal(repeated.failedCount, 0);
  assert.doesNotMatch(
    JSON.stringify({ first, repeated }),
    /pareq_rollover|portal_user|requestRef|portalUserRef/i
  );
});

test("quota rollover sweep reports failed receipts without claiming a mutation", () => {
  const gate = createOrderUsageQuotaLifecycleGate({
    orderLifecycleService: {
      suspendTrafficSupply() {
        throw new Error("suspend is not part of rollover sweep");
      },
      listQuotaSuspendedTrafficSupplies() {
        return [{ requestRef: "pareq_rollover_failed", portalUserRef: "portal_user_failed" }];
      },
      resumeTrafficSupply() {
        return {
          ok: false,
          status: "quota_traffic_supply_expiry_cleanup_failed",
          mutation: false,
          runtimeEnforcement: { state: "failed", redacted: true }
        };
      }
    }
  });

  const result = gate.sweepQuotaCycleRollovers();

  assert.equal(result.ok, false);
  assert.equal(result.appliedCount, 0);
  assert.equal(result.pendingCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(result.mutation, false);
  assert.deepEqual(result.blockers, [{ code: "quota_cycle_rollover_failed" }]);
});

test("legacy lifecycle services do not expose an unavailable rollover sweep", () => {
  const gate = createOrderUsageQuotaLifecycleGate({
    orderLifecycleService: {
      suspendTrafficSupply() {
        return {
          status: "disabled",
          runtimeEnforcement: { state: "applied" }
        };
      }
    }
  });

  assert.equal("sweepQuotaCycleRollovers" in gate, false);
  assert.equal(typeof gate.handleUsageDecision, "function");
});
