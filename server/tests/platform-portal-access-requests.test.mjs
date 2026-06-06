import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

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
    createTenant(input) {
      calls.push(["createTenant", input]);
      return {
        tenant: {
          id: "tenant_runtime_auto_1",
          nodeId: input.nodeId,
          expiresAt: input.expiresAt
        },
        subscriptionUrl: "https://sub.example.test/legacy-token-url-not-used"
      };
    },
    createSubscriptionArtifact(id) {
      calls.push(["createSubscriptionArtifact", id]);
      return {
        artifact: { id: "artifact_runtime_auto_1", tenantId: id, status: "active" },
        subscriptionUrl: "https://sub.example.test/sub/a/auto-visible-once.yaml"
      };
    },
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

function controlStore() {
  const calls = [];
  const accounts = new Map();
  const entitlements = new Map();
  const issuanceRequests = new Map();
  return {
    calls,
    getAccount(id) {
      return accounts.get(id) ?? null;
    },
    createAccount(input) {
      calls.push(["createAccount", input.id]);
      accounts.set(input.id, input);
      return input;
    },
    getEntitlement(id) {
      return entitlements.get(id) ?? null;
    },
    createEntitlement(input) {
      calls.push(["createEntitlement", input.id]);
      entitlements.set(input.id, input);
      return input;
    },
    createIssuanceRequest(input) {
      calls.push(["createIssuanceRequest", input.id]);
      issuanceRequests.set(input.id, input);
      return input;
    },
    linkIssuedSubscription(input) {
      calls.push(["linkIssuedSubscription", input.requestId]);
      return input;
    },
    setIssuanceRequestStatus(id, input) {
      calls.push(["setIssuanceRequestStatus", id, input.status]);
      const current = issuanceRequests.get(id);
      if (current) issuanceRequests.set(id, { ...current, ...input });
      return issuanceRequests.get(id) ?? null;
    },
    upsertQuotaCounter(input) {
      calls.push(["upsertQuotaCounter", input.accountId, input.metric, input.period, input.amount]);
      return input;
    },
    recordAuditEvent(input) {
      calls.push(["recordAuditEvent", input.entityRef, input.action]);
      return input;
    },
    runInTransaction(callback) {
      return callback();
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

function withControlStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "portal-access-requests-"));
  let store;
  try {
    store = createSqliteSubscriptionControlStore({
      dbPath: join(tempDir, "control.sqlite")
    });
    return fn(store);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
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

test("portal access request service auto-delivers 7-day orders when auto issuance is enabled", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const control = controlStore();
  const edgeLifecycle = edgeLifecycleService();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_auto_7d_1",
    runtimeCore,
    controlStore: control,
    edgeCredentialIssuer: edgeCredentialIssuer(),
    edgeLifecycleService: edgeLifecycle,
    autoIssuance: {
      enabled: true,
      nodeId: "channel-aliyun-a-tuic",
      reviewedByRef: "portal_auto_issuer"
    }
  });

  const request = requests.submitRequest(validTrialInput());

  assert.equal(request.status, "delivered");
  assert.equal(request.nextAction, "user_can_use_access");
  assert.equal(request.plan, "trial");
  assert.equal(request.durationDays, 7);
  assert.equal(request.expiresAt, "2026-06-07T00:00:00.000Z");
  assert.equal(request.subscriptionUrl, "https://sub.example.test/sub/a/auto-visible-once.yaml");
  assert.equal(request.safety.noSubscriptionUrl, false);
  assert.equal(request.safety.noEntitlementCreated, false);
  assert.equal(runtimeCore.calls[0][0], "createTenant");
  assert.equal(runtimeCore.calls[0][1].nodeId, "channel-aliyun-a-tuic");
  assert.equal(runtimeCore.calls[0][1].expiresAt, "2026-06-07T00:00:00.000Z");
  assert.equal(runtimeCore.calls[1][0], "createSubscriptionArtifact");
  assert.deepEqual(edgeLifecycle.calls.map((call) => call.reason), ["order_delivered"]);
  assert.doesNotMatch(JSON.stringify(request), /uuid|password|edgecred|digest|tenant_runtime_auto_1|artifact_runtime_auto_1/i);
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

test("portal access request service reads persisted orders after service restart", () => {
  withControlStore((store) => {
    const firstInstance = createPortalAccessRequestService({
      nowFn: () => NOW,
      requestIdFactory: () => "pareq_durable_restart_1",
      controlStore: store
    });

    firstInstance.submitRequest(validTrialInput({
      plan: "monthly",
      clientTarget: "karing",
      quantity: 2
    }));

    const secondInstance = createPortalAccessRequestService({
      nowFn: () => "2026-05-31T00:01:00.000Z",
      controlStore: store
    });

    const listed = secondInstance.listRequests({
      portalUserRef: "user_safe_ref"
    });

    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "pareq_durable_restart_1");
    assert.equal(listed[0].plan, "monthly");
    assert.equal(listed[0].clientTarget, "karing");
    assert.equal(listed[0].quantity, 2);
    assert.equal(store.listPortalAccessRequests({ portalUserRef: "user_safe_ref" }).length, 1);
  });
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

test("delivery binds protected per-order edge material to the issued tenant without leaking it", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const issuer = {
    calls: [],
    ensureCredentialForOrder(order) {
      this.calls.push(order);
      return {
        edgeChannelRef: "channel-aliyun-a-tuic",
        edgeCredentialRef: `edgecred_${order.id}`,
        edgeMaterialDigest: `sha256:digest_${order.id}`,
        edgeCredentialMaterial: {
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "per-order-tuic-password"
        }
      };
    }
  };
  runtimeCore.bindTenantCredentialMaterial = (input) => {
    runtimeCore.calls.push(["bindTenantCredentialMaterial", input]);
    return { ok: true };
  };
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_bind_1",
    runtimeCore,
    edgeCredentialIssuer: issuer
  });
  requests.submitRequest(validTrialInput());

  const delivered = requests.markDelivered("pareq_edge_bind_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_bind_1",
    artifactId: "artifact_runtime_bind_1",
    subscriptionUrl: "https://sub.example.test/import/bind-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  assert.deepEqual(runtimeCore.calls, [
    ["bindTenantCredentialMaterial", {
      tenantId: "tenant_runtime_bind_1",
      nodeId: "channel-aliyun-a-tuic",
      credentialRef: "edgecred_pareq_edge_bind_1",
      material: {
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "per-order-tuic-password"
      }
    }]
  ]);
  assert.equal(delivered.edgeCredentialRef, undefined);
  assert.doesNotMatch(JSON.stringify(delivered), /11111111-1111-4111-8111-111111111111|per-order-tuic-password|edgecred_pareq_edge_bind_1/i);
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
