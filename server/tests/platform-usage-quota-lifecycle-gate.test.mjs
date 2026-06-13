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

test("usage quota lifecycle gate plans a controlled disable without mutating orders by default", () => {
  withStore((store) => {
    const overQuota = recordOverQuotaUsage(store);
    const calls = [];
    const gate = createOrderUsageQuotaLifecycleGate({
      orderLifecycleService: {
        disableSubscription(input) {
          calls.push(input);
          return { id: input.requestRef, status: "disabled" };
        }
      }
    });

    const result = gate.handleUsageDecision(overQuota);

    assert.equal(overQuota.status, "over_quota_disable_required");
    assert.equal(result.ok, true);
    assert.equal(result.status, "controlled_disable_required");
    assert.equal(result.nextAction, "request_controlled_disable_approval");
    assert.equal(result.mutation, false);
    assert.equal(calls.length, 0);
    assert.equal(store.listPortalAccessRequests({ status: "delivered" }).length, 1);
    assert.doesNotMatch(JSON.stringify(result), /https?:\/\/|password|token|rawConfig/i);
  });
});

test("usage quota lifecycle gate can explicitly disable an over-quota portal order through lifecycle services", () => {
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
      executeControlledDisable: true,
      reviewedByRef: "usage_quota_gate"
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "controlled_disable_completed");
    assert.equal(result.mutation, true);
    assert.deepEqual(runtimeCalls, [
      ["revokeSubscriptionArtifact", "artifact_usage_gate_1"],
      ["disableTenant", "tenant_usage_gate_1"]
    ]);
    assert.equal(edgeLifecycleCalls.length, 1);
    assert.equal(edgeLifecycleCalls[0].reason, "order_disabled");
    assert.equal(edgeLifecycleCalls[0].order.edgeCredentialRef, "edgecred_usage_gate_1");
    assert.equal(store.listPortalAccessRequests({ status: "disabled" })[0].id, "pareq_usage_gate_1");
    assert.equal(result.disabledOrder.status, "disabled");
    assert.equal(result.disabledOrder.safety.noSubscriptionUrl, true);
    assert.doesNotMatch(JSON.stringify(result), /https?:\/\/|password|token|rawConfig/i);
  });
});
