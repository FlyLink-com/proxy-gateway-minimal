import assert from "node:assert/strict";
import test from "node:test";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";

const NOW = "2026-05-31T00:00:00.000Z";

function service() {
  return createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_1"
  });
}

function validTrialInput(overrides = {}) {
  return {
    portalUserRef: "user_safe_ref",
    plan: "trial",
    clientTarget: "clash",
    quantity: 1,
    note: "try before monthly",
    ...overrides
  };
}

function lifecycleRuntimeCore() {
  const calls = [];
  return {
    calls,
    rotateSubscriptionArtifact(id) {
      calls.push(["rotateSubscriptionArtifact", id]);
      return {
        previous: { id, status: "rotated" },
        replacement: { id: "artifact_rotated_2", status: "active" },
        subscriptionUrl: "https://sub.example.test/import/refreshed-visible-once"
      };
    },
    revokeSubscriptionArtifact(id) {
      calls.push(["revokeSubscriptionArtifact", id]);
      return { id, status: "revoked" };
    },
    disableTenant(id) {
      calls.push(["disableTenant", id]);
      return { id, status: "disabled" };
    }
  };
}

function edgeLifecycleService() {
  const calls = [];
  return {
    calls,
    reconcileOrderLifecycle(input) {
      calls.push(input);
      return {
        ok: true,
        nextAction: "review_apply_gate",
        mutation: false,
        redacted: true
      };
    }
  };
}

function edgeCredentialIssuer() {
  const calls = [];
  return {
    calls,
    ensureCredentialForOrder(order) {
      calls.push(order);
      return {
        edgeChannelRef: "channel-aliyun-a-tuic",
        edgeCredentialRef: `edgecred_${order.id}`,
        edgeMaterialDigest: `sha256:digest_${order.id}`
      };
    }
  };
}

test("portal access request service creates 7-day trial requests pending admin review", () => {
  const requests = service();
  const request = requests.submitRequest(validTrialInput());

  assert.equal(request.id, "pareq_1");
  assert.equal(request.type, "portal_access_request_summary");
  assert.equal(request.status, "pending_admin_review");
  assert.equal(request.plan, "trial");
  assert.equal(request.clientTarget, "clash");
  assert.equal(request.durationDays, 7);
  assert.equal(request.quantity, 1);
  assert.equal(request.nextAction, "admin_review_required");
  assert.equal(request.safety.noSubscriptionUrl, true);
  assert.equal(request.safety.noEntitlementCreated, true);
  assert.equal("contactComplete" in request, false);
  assert.equal("email" in request, false);
  assert.equal("displayName" in request, false);
  assert.equal(JSON.stringify(request).includes("try before monthly"), false);
});

test("portal access request service accepts monthly and yearly with fixed durations", () => {
  const monthly = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_monthly"
  }).submitRequest(validTrialInput({ plan: "monthly" }));
  const yearly = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_yearly"
  }).submitRequest(validTrialInput({ plan: "yearly" }));

  assert.equal(monthly.durationDays, 30);
  assert.equal(yearly.durationDays, 365);
});

test("portal access request service records order quantity and client target", () => {
  const request = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_monthly_quantity"
  }).submitRequest(validTrialInput({
    plan: "monthly",
    clientTarget: "karing",
    quantity: 3
  }));

  assert.equal(request.clientTarget, "karing");
  assert.equal(request.quantity, 3);
});

test("portal access request service validates order quantity and client target", () => {
  const requests = service();

  assert.throws(
    () => requests.submitRequest(validTrialInput({ quantity: 0 })),
    (error) => error.code === "validation_error" && error.message === "quantity is invalid"
  );
  assert.throws(
    () => requests.submitRequest(validTrialInput({ quantity: 13 })),
    (error) => error.code === "validation_error" && error.message === "quantity is invalid"
  );
  assert.throws(
    () => requests.submitRequest(validTrialInput({ clientTarget: "unknown-client" })),
    (error) => error.code === "validation_error" && error.message === "clientTarget is invalid"
  );
});

test("portal access request service blocks repeat initial trial by default", () => {
  let sequence = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => {
      sequence += 1;
      return `pareq_${sequence}`;
    }
  });

  requests.submitRequest(validTrialInput());

  assert.throws(
    () => requests.submitRequest(validTrialInput()),
    (error) => error.code === "validation_error" && error.message === "trial request already exists for this account"
  );
});

test("portal access request service blocks repeat initial trial even after review rejection", () => {
  let sequence = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => {
      sequence += 1;
      return `pareq_${sequence}`;
    }
  });

  requests.submitRequest(validTrialInput());
  requests.rejectRequest("pareq_1", {
    reviewedByRef: "operator_safe_ref",
    reasonCode: "operator_rejected"
  });

  assert.throws(
    () => requests.submitRequest(validTrialInput()),
    (error) => error.code === "validation_error" && error.message === "trial request already exists for this account"
  );
});

test("admin review can reject or prepare approval preview without issuing", () => {
  const requests = service();
  requests.submitRequest(validTrialInput());

  const preview = requests.previewApproval("pareq_1", {
    reviewedByRef: "operator_safe_ref",
    nodeId: "channel-lab-b-tuic",
    approvalRef: "approval_trial_1"
  });

  assert.equal(preview.status, "approved_pending_delivery");
  assert.equal(preview.issuanceInput.plan, "trial");
  assert.equal(preview.issuanceInput.nodeId, "channel-lab-b-tuic");
  assert.equal(preview.issuanceInput.expiresAt, "2026-06-07T00:00:00.000Z");
  assert.equal(preview.safety.noSubscriptionUrl, true);
  assert.equal(preview.safety.noRuntimeMutation, true);

  const rejected = requests.rejectRequest("pareq_1", {
    reviewedByRef: "operator_safe_ref",
    reasonCode: "operator_rejected"
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.safeReasonCode, "operator_rejected");
});

test("delivery records the generated subscription expiry without leaking raw material", () => {
  const requests = service();
  requests.submitRequest(validTrialInput());

  const delivered = requests.markDelivered("pareq_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.expiresAt, "2026-06-07T00:00:00.000Z");
  assert.equal(delivered.validUntil, "2026-06-07T00:00:00.000Z");
  assert.equal(delivered.entitlementRef, "ent_safe_ref");
  assert.equal(delivered.accessGrantRef, "grant_safe_ref");
  assert.equal(JSON.stringify(delivered).includes("subscriptionUrl"), false);
  assert.equal(delivered.safety.noEntitlementCreated, false);
});

test("delivery can issue a protected edge credential and expose only safe lifecycle order facts", () => {
  const issuer = edgeCredentialIssuer();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_delivery_1",
    edgeCredentialIssuer: issuer
  });
  requests.submitRequest(validTrialInput());

  const delivered = requests.markDelivered("pareq_edge_delivery_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  assert.equal(delivered.edgeCredentialRef, undefined);
  assert.equal(delivered.edgeMaterialDigest, undefined);
  assert.equal(issuer.calls.length, 1);
  assert.deepEqual(requests.listEdgeCredentialOrders(), [
    {
      id: "pareq_edge_delivery_1",
      portalUserRef: "user_safe_ref",
      plan: "trial",
      clientTarget: "clash",
      durationDays: 7,
      quantity: 1,
      status: "delivered",
      submittedAt: NOW,
      updatedAt: NOW,
      expiresAt: "2026-06-07T00:00:00.000Z",
      validUntil: "2026-06-07T00:00:00.000Z",
      entitlementRef: "ent_safe_ref",
      accessGrantRef: "grant_safe_ref",
      edgeChannelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_edge_delivery_1",
      edgeMaterialDigest: "sha256:digest_pareq_edge_delivery_1"
    }
  ]);
  assert.doesNotMatch(JSON.stringify(requests.listEdgeCredentialOrders()), /subscriptionUrl|tenant_runtime|artifact_runtime|password|uuid/i);
});

test("edge lifecycle mutation updates portal safety flags", () => {
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_mutation_1",
    edgeCredentialIssuer: edgeCredentialIssuer(),
    edgeLifecycleService: {
      reconcileOrderLifecycle() {
        return {
          ok: true,
          mutation: true,
          redacted: true
        };
      }
    }
  });
  requests.submitRequest(validTrialInput());

  const delivered = requests.markDelivered("pareq_edge_mutation_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  assert.equal(delivered.safety.noRuntimeMutation, false);
  assert.equal(delivered.safety.noProductionMutation, false);
  assert.doesNotMatch(JSON.stringify(delivered), /uuid|password/i);
});

test("refresh replaces material for an already-delivered order and keeps expiry", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_lifecycle_1",
    runtimeCore
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_lifecycle_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  const refreshed = requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_lifecycle_1",
    clientTarget: "karing"
  });

  assert.equal(refreshed.status, "delivered");
  assert.equal(refreshed.clientTarget, "karing");
  assert.equal(refreshed.subscriptionUrl, "https://sub.example.test/import/refreshed-visible-once");
  assert.equal(refreshed.expiresAt, "2026-06-07T00:00:00.000Z");
  assert.equal(refreshed.validUntil, "2026-06-07T00:00:00.000Z");
  assert.equal(refreshed.event.type, "old_link_invalidated");
  assert.deepEqual(runtimeCore.calls, [["rotateSubscriptionArtifact", "artifact_runtime_1"]]);
  assert.equal(JSON.stringify(refreshed).includes("tenant_runtime_1"), false);
  assert.equal(JSON.stringify(refreshed).includes("artifact_runtime_1"), false);
});

test("disable revokes the active artifact and disables the delivered tenant without deleting the order", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_disable_1",
    runtimeCore
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_disable_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  const disabled = requests.disableSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_disable_1"
  });

  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.nextAction, "subscription_disabled");
  assert.equal(disabled.subscriptionUrl, undefined);
  assert.equal(disabled.expiresAt, "2026-06-07T00:00:00.000Z");
  assert.deepEqual(runtimeCore.calls, [
    ["revokeSubscriptionArtifact", "artifact_runtime_1"],
    ["disableTenant", "tenant_runtime_1"]
  ]);
  assert.equal(requests.getRequest("pareq_disable_1").status, "disabled");
});

test("refresh and disable notify the optional edge lifecycle service", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const edgeLifecycle = edgeLifecycleService();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_lifecycle_1",
    runtimeCore,
    edgeLifecycleService: edgeLifecycle
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_edge_lifecycle_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_edge_lifecycle_1"
  });
  requests.disableSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_edge_lifecycle_1"
  });

  assert.deepEqual(edgeLifecycle.calls.map((call) => call.reason), [
    "order_refreshed",
    "order_disabled"
  ]);
  assert.deepEqual(edgeLifecycle.calls.map((call) => call.order.status), [
    "delivered",
    "disabled"
  ]);
  assert.equal(edgeLifecycle.calls[0].order.subscriptionUrl, undefined);
  assert.equal(edgeLifecycle.calls[0].order.artifactId, undefined);
  assert.equal(edgeLifecycle.calls[0].order.tenantId, undefined);
});

test("edge lifecycle failure blocks order lifecycle completion", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_lifecycle_fail",
    runtimeCore,
    edgeLifecycleService: {
      reconcileOrderLifecycle() {
        throw Object.assign(new Error("edge lifecycle failed"), { code: "edge_lifecycle_failed" });
      }
    }
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_edge_lifecycle_fail", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  assert.throws(
    () => requests.disableSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: "pareq_edge_lifecycle_fail"
    }),
    (error) => error.code === "edge_lifecycle_failed"
  );
});
