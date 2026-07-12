import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createOrderEdgeCredentialIssuer } from "../services/edge/order-credential-issuer.mjs";
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

function edgeLifecycleService({ applied = false } = {}) {
  const calls = [];
  return {
    calls,
    reconcileOrderLifecycle(input) {
      calls.push(input);
      return applied ? {
        ok: true,
        nextAction: "validate_runtime_state",
        mutation: true,
        runtimeReceipt: {
          status: "applied"
        },
        redacted: true
      } : {
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

function edgeMaterialStore() {
  return createEdgeCredentialMaterialStore();
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

function seedUsageOrder(store, overrides = {}) {
  const now = overrides.now || "2026-06-06T00:00:00.000Z";
  const requestId = overrides.requestId || "pareq_usage_summary_1";
  const accountId = overrides.accountId || "acct_usage_summary_1";
  const entitlementId = overrides.entitlementId || "ent_usage_summary_1";
  const tenantRef = overrides.tenantRef || "tenant_usage_summary_1";
  const artifactRef = overrides.artifactRef || "artifact_usage_summary_1";
  const edgeCredentialRef = overrides.edgeCredentialRef || `edgecred_${requestId}`;
  const edgeCredentials = Array.isArray(overrides.edgeCredentials) ? overrides.edgeCredentials : undefined;
  const plan = overrides.plan || "monthly";
  const durationDays = overrides.durationDays ?? (plan === "yearly" ? 365 : 30);
  const validUntil = overrides.validUntil || "2026-07-06T00:00:00.000Z";

  store.createAccount({
    id: accountId,
    ownerRef: "portal_user_usage_summary_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.createEntitlement({
    id: entitlementId,
    accountId,
    plan,
    status: "active",
    validFrom: now,
    validUntil,
    trafficLimitBytes: overrides.trafficLimitBytes ?? 1000,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: requestId,
    accountId,
    entitlementId,
    approvalRef: `approval_${requestId}`,
    status: "issued",
    quantity: 1,
    nodeId: "channel-vultr-a-vless-reality-tcp",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: `link_${requestId}`,
    requestId,
    tenantRef,
    artifactRef,
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: requestId,
    portalUserRef: "portal_user_usage_summary_1",
    plan,
    clientTarget: "clash",
    durationDays,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "portal_auto_issuer",
    expiresAt: validUntil,
    validUntil,
    entitlementRef: entitlementId,
    accessGrantRef: `grant_${requestId}`,
    tenantId: tenantRef,
    artifactId: artifactRef,
    subscriptionUrl: "https://sub.example.test/import/visible-once",
    edgeChannelRef: "channel-vultr-a-vless-reality-tcp",
    edgeCredentialRef,
    edgeMaterialDigest: `sha256:digest_${requestId}`,
    ...(edgeCredentials ? { edgeCredentials } : {})
  });

  return { now, requestId, accountId, entitlementId, edgeCredentialRef };
}

const SAFE_ROUTINE_SUMMARY_MARKERS = [
  "safe-visible-once-link",
  "safe-delivery-link",
  "safe-handoff-material",
  "safe-token-marker",
  "safe-credential-marker",
  "safe-raw-artifact-material",
  "safe-edge-credential-ref",
  "safe-edge-material-digest"
];

function materialBearingPortalRequest(overrides = {}) {
  const id = overrides.id || "pareq_safe_summary_delivered";
  const now = "2026-06-08T00:00:00.000Z";
  return {
    id,
    portalUserRef: "portal_user_safe_summary",
    plan: "monthly",
    clientTarget: "clash",
    durationDays: 30,
    quantity: 1,
    status: "delivered",
    nextAction: "user_can_use_access",
    noteProvided: false,
    priorTrialState: "not_applicable",
    submittedAt: now,
    updatedAt: now,
    reviewedAt: now,
    reviewedByRef: "operator_safe_ref",
    safeReasonCode: "safe_reviewed",
    expiresAt: "2026-07-08T00:00:00.000Z",
    validUntil: "2026-07-08T00:00:00.000Z",
    entitlementRef: `ent_${id}`,
    accessGrantRef: `grant_${id}`,
    tenantId: "tenant_safe_summary",
    artifactId: "artifact_safe_summary",
    subscriptionUrl: "safe-visible-once-link",
    deliveryLink: "safe-delivery-link",
    handoffMaterial: { marker: "safe-handoff-material" },
    token: "safe-token-marker",
    credentials: { marker: "safe-credential-marker" },
    rawArtifactMaterial: "safe-raw-artifact-material",
    edgeChannelRef: "channel-safe-summary",
    edgeCredentialRef: "safe-edge-credential-ref",
    edgeMaterialDigest: "safe-edge-material-digest",
    edgeCredentials: [{
      edgeChannelRef: "channel-safe-summary",
      edgeCredentialRef: "safe-edge-credential-ref",
      edgeMaterialDigest: "safe-edge-material-digest"
    }],
    event: {
      type: "delivery_generation_reissued",
      occurredAt: "2026-06-08T00:01:00.000Z",
      deliveryLink: "safe-delivery-link",
      rawArtifactMaterial: "safe-raw-artifact-material"
    },
    ...overrides
  };
}

function portalRequestStoreWith(records) {
  const byId = new Map(records.map((record) => [record.id, structuredClone(record)]));
  return {
    upsertPortalAccessRequest(record) {
      byId.set(record.id, structuredClone(record));
      return structuredClone(record);
    },
    getPortalAccessRequest(id) {
      const record = byId.get(id);
      return record ? structuredClone(record) : null;
    },
    listPortalAccessRequests(filters = {}) {
      const status = String(filters.status || "").trim();
      const portalUserRef = String(filters.portalUserRef || "").trim();
      return [...byId.values()]
        .filter((record) => !status || record.status === status)
        .filter((record) => !portalUserRef || record.portalUserRef === portalUserRef)
        .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id))
        .map((record) => structuredClone(record));
    }
  };
}

function assertRoutineSummarySafe(summary) {
  assert.deepEqual(Object.keys(summary).sort(), [
    "accessGrantRef",
    "clientTarget",
    "delivery",
    "durationDays",
    "entitlementRef",
    "event",
    "expiresAt",
    "id",
    "nextAction",
    "plan",
    "planLabel",
    "portalUserRef",
    "priorTrialState",
    "quantity",
    "reviewedAt",
    "reviewedByRef",
    "safeReasonCode",
    "safety",
    "status",
    "submittedAt",
    "type",
    "updatedAt",
    "validUntil"
  ]);
  assert.equal(Object.hasOwn(summary, "subscriptionUrl"), false);
  assert.deepEqual(summary.event, {
    type: "delivery_generation_reissued",
    occurredAt: "2026-06-08T00:01:00.000Z"
  });
  assert.deepEqual(summary.delivery, {
    model: "account_resource_delivery_generation",
    state: "current",
    artifactPresent: true,
    runtimeMaterialPresent: true,
    lastEventType: "delivery_generation_reissued",
    lastReissuedAt: "2026-06-08T00:01:00.000Z"
  });
  assert.equal(summary.safety.noSubscriptionUrl, true);
  const serialized = JSON.stringify(summary);
  for (const marker of SAFE_ROUTINE_SUMMARY_MARKERS) {
    assert.equal(serialized.includes(marker), false);
  }
}

test("portal access request routine summaries allowlist delivered and issued records", () => {
  const requests = createPortalAccessRequestService({
    portalAccessRequestStore: portalRequestStoreWith([
      materialBearingPortalRequest({ id: "pareq_safe_summary_delivered", status: "delivered" }),
      materialBearingPortalRequest({ id: "pareq_safe_summary_issued", status: "issued" })
    ])
  });

  const listed = requests.listRequests({ portalUserRef: "portal_user_safe_summary" });

  assert.deepEqual(listed.map((request) => request.id), [
    "pareq_safe_summary_delivered",
    "pareq_safe_summary_issued"
  ]);
  for (const summary of listed) {
    assertRoutineSummarySafe(summary);
  }
  assertRoutineSummarySafe(requests.getRequest("pareq_safe_summary_delivered"));
  assertRoutineSummarySafe(requests.getRequest("pareq_safe_summary_issued"));
});

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
  assert.equal(
    control.getEntitlement("ent_pareq_auto_7d_1").trafficLimitBytes,
    5 * 1024 ** 3
  );
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

test("portal access request summaries include redacted usage rollups from the control store", () => {
  withControlStore((store) => {
    const { requestId, accountId, entitlementId, edgeCredentialRef } = seedUsageOrder(store, {
      trafficLimitBytes: 1000
    });
    store.recordUsageSample({
      id: "usage_summary_sample_1",
      sourceRef: "hy2_stats_snapshot_1",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef,
      accountId,
      entitlementId,
      requestId,
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 300,
      downloadBytes: 400,
      sampleDigest: "usage_summary_sample_digest_1",
      createdAt: "2026-06-06T00:05:01.000Z"
    });

    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-06T00:06:00.000Z",
      controlStore: store
    });
    const [summary] = requests.listRequests({
      portalUserRef: "portal_user_usage_summary_1"
    });

    assert.deepEqual(summary.usage, {
      uploadBytes: 300,
      downloadBytes: 400,
      usedBytes: 700,
      totalBytes: 1000,
      usageRatio: 0.7,
      status: "within_limit",
      collectionStatus: "measured",
      channelCount: 1,
      measuredChannelCount: 1,
      updatedAt: "2026-06-06T00:05:01.000Z"
    });
    assert.doesNotMatch(JSON.stringify(summary.usage), /edgecred|channel-vultr|tenant_|artifact_|subscriptionUrl|password|token/i);
  });
});

test("portal access request summaries expose redacted quota limits before usage collection", () => {
  withControlStore((store) => {
    const { requestId } = seedUsageOrder(store, {
      requestId: "pareq_quota_before_usage",
      trafficLimitBytes: 1234
    });
    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-06T00:06:00.000Z",
      controlStore: store
    });

    const summary = requests.getRequest(requestId);

    assert.equal(summary.trafficLimitBytes, 1234);
    assert.equal(summary.usage, undefined);
    assert.doesNotMatch(JSON.stringify(summary), /edgecred|channel-vultr|tenant_|artifact_|password|token=/i);
  });
});

test("portal access request summaries aggregate multi-channel usage by request id", () => {
  withControlStore((store) => {
    const { requestId, accountId, entitlementId } = seedUsageOrder(store, {
      requestId: "pareq_usage_summary_multichannel",
      trafficLimitBytes: 2000
    });
    for (const [index, channelRef, uploadBytes, downloadBytes] of [
      [1, "channel-vultr-a-vless-reality-tcp", 100, 150],
      [2, "channel-vultr-a-hy2", 200, 250],
      [3, "channel-vultr-a-tuic", 300, 350]
    ]) {
      store.recordUsageSample({
        id: `usage_summary_multichannel_${index}`,
        sourceRef: `runtime_stats_snapshot_${index}`,
        channelRef,
        edgeCredentialRef: `edgecred_${requestId}_${channelRef}`,
        accountId,
        entitlementId,
        requestId,
        observedAt: `2026-06-06T00:0${index}:00.000Z`,
        intervalStartedAt: "2026-06-06T00:00:00.000Z",
        intervalEndedAt: `2026-06-06T00:0${index}:00.000Z`,
        uploadBytes,
        downloadBytes,
        sampleDigest: `usage_summary_multichannel_digest_${index}`,
        createdAt: `2026-06-06T00:0${index}:01.000Z`
      });
    }

    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-06T00:06:00.000Z",
      controlStore: store
    });
    const summary = requests.getRequest(requestId);

    assert.equal(summary.usage.uploadBytes, 600);
    assert.equal(summary.usage.downloadBytes, 750);
    assert.equal(summary.usage.usedBytes, 1350);
    assert.equal(summary.usage.totalBytes, 2000);
    assert.equal(summary.usage.usageRatio, 0.675);
    assert.equal(summary.usage.status, "within_limit");
    assert.equal(summary.usage.collectionStatus, "measured");
    assert.equal(summary.usage.channelCount, 3);
    assert.equal(summary.usage.measuredChannelCount, 3);
    assert.equal(summary.usage.updatedAt, "2026-06-06T00:03:01.000Z");
    assert.doesNotMatch(JSON.stringify(summary.usage), /edgecred|channel-vultr|password|token|subscriptionUrl/i);
  });
});

test("portal access request summaries use the current entitlement monthly usage cycle", () => {
  withControlStore((store) => {
    const { requestId, accountId, entitlementId, edgeCredentialRef } = seedUsageOrder(store, {
      now: "2026-07-06T00:00:00.000Z",
      plan: "yearly",
      durationDays: 365,
      validUntil: "2027-07-06T00:00:00.000Z",
      trafficLimitBytes: 1000
    });
    store.recordUsageSample({
      id: "usage_summary_cycle_previous",
      sourceRef: "hy2_stats_snapshot_cycle_previous",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef,
      accountId,
      entitlementId,
      requestId,
      observedAt: "2026-07-10T00:05:00.000Z",
      intervalStartedAt: "2026-07-10T00:00:00.000Z",
      intervalEndedAt: "2026-07-10T00:05:00.000Z",
      uploadBytes: 400,
      downloadBytes: 500,
      sampleDigest: "usage_summary_cycle_previous_digest",
      createdAt: "2026-07-10T00:05:01.000Z"
    });
    store.recordUsageSample({
      id: "usage_summary_cycle_current",
      sourceRef: "hy2_stats_snapshot_cycle_current",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef,
      accountId,
      entitlementId,
      requestId,
      observedAt: "2026-08-07T00:05:00.000Z",
      intervalStartedAt: "2026-08-07T00:00:00.000Z",
      intervalEndedAt: "2026-08-07T00:05:00.000Z",
      uploadBytes: 90,
      downloadBytes: 110,
      sampleDigest: "usage_summary_cycle_current_digest",
      createdAt: "2026-08-07T00:05:01.000Z"
    });

    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-08-07T00:06:00.000Z",
      controlStore: store
    });
    const summary = requests.getRequest(requestId);

    assert.equal(store.getUsageRollupByEdgeCredentialRef(edgeCredentialRef).totalBytes, 1100);
    assert.equal(summary.usage.uploadBytes, 90);
    assert.equal(summary.usage.downloadBytes, 110);
    assert.equal(summary.usage.usedBytes, 200);
    assert.equal(summary.usage.totalBytes, 1000);
    assert.equal(summary.usage.usageRatio, 0.2);
    assert.equal(summary.usage.status, "within_limit");
    assert.equal(summary.usage.updatedAt, "2026-08-07T00:05:01.000Z");
    assert.doesNotMatch(JSON.stringify(summary.usage), /edgecred|channel-vultr|password|token|subscriptionUrl/i);
  });
});

test("portal access request summaries count issued channels without exposing channel refs", () => {
  withControlStore((store) => {
    const requestId = "pareq_usage_summary_partial_channels";
    const issuedChannels = [
      "channel-vultr-a-vless-reality-tcp",
      "channel-vultr-a-hy2",
      "channel-vultr-a-tuic"
    ];
    const { accountId, entitlementId } = seedUsageOrder(store, {
      requestId,
      trafficLimitBytes: 2000,
      edgeCredentials: issuedChannels.map((channelRef) => ({
        edgeChannelRef: channelRef,
        edgeCredentialRef: `edgecred_${requestId}_${channelRef}`,
        edgeMaterialDigest: `sha256:digest_${requestId}_${channelRef}`
      }))
    });
    for (const [index, channelRef, uploadBytes, downloadBytes] of [
      [1, "channel-vultr-a-vless-reality-tcp", 100, 150],
      [2, "channel-vultr-a-hy2", 200, 250]
    ]) {
      store.recordUsageSample({
        id: `usage_summary_partial_channels_${index}`,
        sourceRef: `runtime_stats_snapshot_partial_${index}`,
        channelRef,
        edgeCredentialRef: `edgecred_${requestId}_${channelRef}`,
        accountId,
        entitlementId,
        requestId,
        observedAt: `2026-06-06T00:0${index}:00.000Z`,
        intervalStartedAt: "2026-06-06T00:00:00.000Z",
        intervalEndedAt: `2026-06-06T00:0${index}:00.000Z`,
        uploadBytes,
        downloadBytes,
        sampleDigest: `usage_summary_partial_channels_digest_${index}`,
        createdAt: `2026-06-06T00:0${index}:01.000Z`
      });
    }

    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-06T00:06:00.000Z",
      controlStore: store
    });
    const summary = requests.getRequest(requestId);

    assert.equal(summary.usage.uploadBytes, 300);
    assert.equal(summary.usage.downloadBytes, 400);
    assert.equal(summary.usage.usedBytes, 700);
    assert.equal(summary.usage.channelCount, 3);
    assert.equal(summary.usage.measuredChannelCount, 2);
    assert.doesNotMatch(JSON.stringify(summary.usage), /edgecred|channel-vultr|password|token|subscriptionUrl/i);
  });
});

test("portal access request service edits delivered order traffic limits with safe audit metadata", () => {
  withControlStore((store) => {
    const { requestId, accountId, entitlementId, edgeCredentialRef } = seedUsageOrder(store, {
      requestId: "pareq_usage_quota_edit",
      trafficLimitBytes: 1000
    });
    store.recordUsageSample({
      id: "usage_quota_edit_sample_1",
      sourceRef: "hy2_stats_snapshot_quota_edit",
      channelRef: "channel-vultr-a-hy2",
      edgeCredentialRef,
      accountId,
      entitlementId,
      requestId,
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 300,
      downloadBytes: 400,
      sampleDigest: "usage_quota_edit_sample_digest_1",
      createdAt: "2026-06-06T00:05:01.000Z"
    });
    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-15T00:01:00.000Z",
      controlStore: store
    });

    const result = requests.updateTrafficLimit(requestId, {
      trafficLimitBytes: 2048,
      reviewedByRef: "operator_safe_ref",
      reasonCode: "plan_change"
    });

    assert.equal(result.request.usage.totalBytes, 2048);
    assert.equal(result.request.usage.status, "within_limit");
    assert.equal(result.quota.previousTrafficLimitBytes, 1000);
    assert.equal(result.quota.trafficLimitBytes, 2048);
    assert.equal(result.audit.action, "traffic_limit_updated");
    assert.equal(result.safety.noRuntimeMutation, true);
    assert.equal(result.safety.noProductionMutation, true);
    const summary = store.getAccountControlSummary(accountId);
    assert.equal(summary.entitlements[0].trafficLimitBytes, 2048);
    assert.equal(summary.auditEvents.length, 1);
    assert.deepEqual(summary.auditEvents[0].metadata, {
      requestRef: requestId,
      reasonCode: "plan_change",
      previousTrafficLimitBytes: 1000,
      trafficLimitBytes: 2048
    });
    assert.doesNotMatch(JSON.stringify(result), /https?:|edgecred|channel-vultr|token=|password/i);
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
  assert.equal(preview.issuanceInput.control.trafficLimitBytes, 5 * 1024 ** 3);
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

test("auto-delivery binds protected edge material for every configured channel in the order bundle", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const issuer = {
    calls: [],
    ensureCredentialsForOrder(order) {
      this.calls.push(order);
      return [
        {
          edgeChannelRef: "channel-vultr-a-vless-reality-tcp",
          edgeCredentialRef: `edgecred_${order.id}_channel-vultr-a-vless-reality-tcp`,
          edgeMaterialDigest: `sha256:vless_${order.id}`,
          edgeCredentialMaterial: {
            uuid: "22222222-2222-4222-8222-222222222222",
            password: "per-order-vless-password"
          }
        },
        {
          edgeChannelRef: "channel-vultr-a-hy2",
          edgeCredentialRef: `edgecred_${order.id}_channel-vultr-a-hy2`,
          edgeMaterialDigest: `sha256:hy2_${order.id}`,
          edgeCredentialMaterial: {
            uuid: "33333333-3333-4333-8333-333333333333",
            password: "per-order-hy2-password"
          }
        },
        {
          edgeChannelRef: "channel-vultr-a-tuic",
          edgeCredentialRef: `edgecred_${order.id}_channel-vultr-a-tuic`,
          edgeMaterialDigest: `sha256:tuic_${order.id}`,
          edgeCredentialMaterial: {
            uuid: "44444444-4444-4444-8444-444444444444",
            password: "per-order-tuic-password"
          }
        }
      ];
    }
  };
  runtimeCore.bindTenantCredentialMaterial = (input) => {
    runtimeCore.calls.push(["bindTenantCredentialMaterial", input]);
    return { ok: true };
  };
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_multichannel_auto_1",
    runtimeCore,
    controlStore: controlStore(),
    edgeCredentialIssuer: issuer,
    autoIssuance: {
      enabled: true,
      nodeId: "channel-vultr-a-vless-reality-tcp",
      channelRefs: [
        "channel-vultr-a-vless-reality-tcp",
        "channel-vultr-a-hy2",
        "channel-vultr-a-tuic"
      ],
      reviewedByRef: "portal_auto_issuer"
    }
  });

  const delivered = requests.submitRequest(validTrialInput({ plan: "monthly" }));

  assert.equal(delivered.status, "delivered");
  assert.equal(runtimeCore.calls[0][0], "createTenant");
  assert.equal(runtimeCore.calls[0][1].nodeId, "channel-vultr-a-vless-reality-tcp");
  assert.equal(issuer.calls.length, 1);
  assert.deepEqual(
    runtimeCore.calls
      .filter(([method]) => method === "bindTenantCredentialMaterial")
      .map(([, input]) => input.nodeId),
    [
      "channel-vultr-a-vless-reality-tcp",
      "channel-vultr-a-hy2",
      "channel-vultr-a-tuic"
    ]
  );
  assert.deepEqual(requests.listEdgeCredentialOrders().map((order) => order.edgeChannelRef), [
    "channel-vultr-a-vless-reality-tcp",
    "channel-vultr-a-hy2",
    "channel-vultr-a-tuic"
  ]);
  assert.doesNotMatch(JSON.stringify(delivered), /per-order-|22222222-2222-4222-8222-222222222222|edgecred_pareq_multichannel/i);
});

test("durable portal order store preserves every channel credential after service restart", () => {
  withControlStore((store) => {
    const runtimeCore = lifecycleRuntimeCore();
    runtimeCore.bindTenantCredentialMaterial = (input) => {
      runtimeCore.calls.push(["bindTenantCredentialMaterial", input]);
      return { ok: true };
    };
    const issuer = {
      ensureCredentialsForOrder(order) {
        return [
          {
            edgeChannelRef: "channel-vultr-a-vless-reality-tcp",
            edgeCredentialRef: `edgecred_${order.id}_channel-vultr-a-vless-reality-tcp`,
            edgeMaterialDigest: `sha256:vless_${order.id}`,
            edgeCredentialMaterial: {
              uuid: "22222222-2222-4222-8222-222222222222",
              password: "per-order-vless-password"
            }
          },
          {
            edgeChannelRef: "channel-vultr-a-hy2",
            edgeCredentialRef: `edgecred_${order.id}_channel-vultr-a-hy2`,
            edgeMaterialDigest: `sha256:hy2_${order.id}`,
            edgeCredentialMaterial: {
              uuid: "33333333-3333-4333-8333-333333333333",
              password: "per-order-hy2-password"
            }
          },
          {
            edgeChannelRef: "channel-vultr-a-tuic",
            edgeCredentialRef: `edgecred_${order.id}_channel-vultr-a-tuic`,
            edgeMaterialDigest: `sha256:tuic_${order.id}`,
            edgeCredentialMaterial: {
              uuid: "44444444-4444-4444-8444-444444444444",
              password: "per-order-tuic-password"
            }
          }
        ];
      }
    };
    const firstService = createPortalAccessRequestService({
      nowFn: () => NOW,
      requestIdFactory: () => "pareq_durable_multichannel_1",
      runtimeCore,
      controlStore: store,
      edgeCredentialIssuer: issuer,
      autoIssuance: {
        enabled: true,
        nodeId: "channel-vultr-a-vless-reality-tcp",
        channelRefs: [
          "channel-vultr-a-vless-reality-tcp",
          "channel-vultr-a-hy2",
          "channel-vultr-a-tuic"
        ],
        reviewedByRef: "portal_auto_issuer"
      }
    });

    firstService.submitRequest(validTrialInput({ plan: "monthly" }));

    const restartedService = createPortalAccessRequestService({
      nowFn: () => "2026-05-31T00:01:00.000Z",
      controlStore: store
    });

    const durableOrders = restartedService.listEdgeCredentialOrders();
    assert.deepEqual(durableOrders.map((order) => order.edgeChannelRef), [
      "channel-vultr-a-vless-reality-tcp",
      "channel-vultr-a-hy2",
      "channel-vultr-a-tuic"
    ]);
    assert.deepEqual(durableOrders.map((order) => order.edgeCredentialRef), [
      "edgecred_pareq_durable_multichannel_1_channel-vultr-a-vless-reality-tcp",
      "edgecred_pareq_durable_multichannel_1_channel-vultr-a-hy2",
      "edgecred_pareq_durable_multichannel_1_channel-vultr-a-tuic"
    ]);
    assert.doesNotMatch(JSON.stringify(durableOrders), /per-order-|22222222-2222-4222-8222-222222222222|password|uuid|subscriptionUrl/i);
  });
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

test("deferred edge lifecycle returns delivered order before runtime reconciliation", () => {
  const scheduled = [];
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_deferred_1",
    edgeCredentialIssuer: edgeCredentialIssuer(),
    edgeLifecycleService: {
      calls: [],
      reconcileOrderLifecycle(input) {
        this.calls.push(input);
        return {
          ok: true,
          mutation: true,
          redacted: true
        };
      }
    },
    deferEdgeLifecycle: true,
    edgeLifecycleScheduler(task) {
      scheduled.push(task);
    }
  });
  requests.submitRequest(validTrialInput());

  const delivered = requests.markDelivered("pareq_edge_deferred_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.safety.noRuntimeMutation, true);
  assert.equal(scheduled.length, 1);

  scheduled[0]();

  const reconciled = requests.getRequest("pareq_edge_deferred_1");
  assert.equal(reconciled.safety.noRuntimeMutation, false);
  assert.equal(reconciled.safety.noProductionMutation, false);
  assert.doesNotMatch(JSON.stringify(reconciled), /uuid|password/i);
});

test("refresh rejects false success when runtime credential rotation is unavailable", () => {
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

  assert.throws(() => requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_lifecycle_1",
    clientTarget: "karing"
  }), { code: "subscription_refresh_runtime_credential_unavailable" });

  const unchanged = requests.getRequest("pareq_lifecycle_1");
  assert.equal(unchanged.clientTarget, "clash");
  assert.equal(unchanged.event, null);
  assert.deepEqual(runtimeCore.calls, []);
});

test("refresh restores the active credential when edge reconciliation fails", () => {
  const materialStore = edgeMaterialStore();
  let sequence = 0;
  const issuer = createOrderEdgeCredentialIssuer({
    channelRef: "channel-aliyun-a-tuic",
    materialStore,
    uuidFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    passwordFactory: () => `password-${sequence}`
  });
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_refresh_rollback_1",
    edgeCredentialIssuer: issuer,
    edgeLifecycleService: {
      reconcileOrderLifecycle({ reason }) {
        if (reason === "order_refreshed") {
          throw Object.assign(new Error("synthetic lifecycle failure"), { code: "edge_lifecycle_failed" });
        }
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: {
            status: "applied"
          },
          redacted: true
        };
      }
    }
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_refresh_rollback_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  const [before] = requests.listEdgeCredentialOrders();
  const beforeMaterial = materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);

  assert.throws(() => requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_rollback_1"
  }), { code: "edge_lifecycle_failed" });

  const [after] = requests.listEdgeCredentialOrders();
  const afterMaterial = materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  const request = requests.getRequest("pareq_refresh_rollback_1");
  assert.equal(after.edgeCredentialRef, before.edgeCredentialRef);
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(afterMaterial.materialDigest, beforeMaterial.materialDigest);
  assert.equal(request.status, "delivered");
  assert.equal(request.event, null);
  assert.equal(request.subscriptionUrl, undefined);
});

test("refresh compensates runtime and restores active state when post-apply tenant binding fails", () => {
  const materialStore = edgeMaterialStore();
  let sequence = 0;
  const lifecycleReasons = [];
  const issuer = createOrderEdgeCredentialIssuer({
    channelRef: "channel-aliyun-a-tuic",
    materialStore,
    uuidFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    passwordFactory: () => `password-${sequence}`
  });
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_refresh_compensate_1",
    edgeCredentialIssuer: issuer,
    runtimeCore: {
      bindTenantCredentialMaterial({ material }) {
        if (material.uuid.endsWith("000000000002")) {
          throw Object.assign(new Error("synthetic binding failure"), { code: "binding_failed" });
        }
        return { ok: true };
      }
    },
    edgeLifecycleService: {
      reconcileOrderLifecycle({ reason }) {
        lifecycleReasons.push(reason);
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: { status: "applied" },
          redacted: true
        };
      }
    }
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_refresh_compensate_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  const [before] = requests.listEdgeCredentialOrders();

  assert.throws(() => requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_compensate_1"
  }), { code: "binding_failed" });

  const [after] = requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(
    materialStore.getCredentialMaterialSummary(before.edgeCredentialRef).materialDigest,
    before.edgeMaterialDigest
  );
  assert.equal(requests.getRequest("pareq_refresh_compensate_1").event, null);
  assert.deepEqual(lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh enforces a per-order cooldown before reissuing material again", () => {
  let now = "2026-06-01T00:00:00.000Z";
  let credentialSequence = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => now,
    requestIdFactory: () => "pareq_refresh_cooldown_1",
    refreshCooldownMs: 5 * 60 * 1000,
    edgeLifecycleService: edgeLifecycleService({ applied: true }),
    edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
      channelRef: "channel-aliyun-a-tuic",
      materialStore: edgeMaterialStore(),
      uuidFactory: () => `00000000-0000-4000-8000-${String(++credentialSequence).padStart(12, "0")}`,
      passwordFactory: () => `password-${credentialSequence}`
    })
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_refresh_cooldown_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  const firstRefresh = requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_cooldown_1"
  });
  assert.equal(firstRefresh.event.type, "delivery_generation_reissued");

  assert.throws(
    () => requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: "pareq_refresh_cooldown_1"
    }),
    { code: "subscription_refresh_rate_limited" }
  );

  now = "2026-06-01T00:05:01.000Z";
  const afterCooldown = requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_cooldown_1"
  });
  assert.equal(afterCooldown.event.type, "delivery_generation_reissued");
  assert.equal(afterCooldown.delivery.lastReissuedAt, "2026-06-01T00:05:01.000Z");
});

test("refresh rotates per-order edge material so cached client credentials stop matching runtime", () => {
  const runtimeCore = lifecycleRuntimeCore();
  runtimeCore.bindTenantCredentialMaterial = (input) => {
    runtimeCore.calls.push(["bindTenantCredentialMaterial", {
      tenantId: input.tenantId,
      nodeId: input.nodeId,
      credentialRef: input.credentialRef,
      materialUuid: input.material.uuid
    }]);
    return { ok: true };
  };
  const materialStore = edgeMaterialStore();
  let sequence = 0;
  const issuer = createOrderEdgeCredentialIssuer({
    channelRef: "channel-aliyun-a-tuic",
    materialStore,
    uuidFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    passwordFactory: () => `password-${sequence}`
  });
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_refresh_edge_rotate_1",
    runtimeCore,
    edgeLifecycleService: edgeLifecycleService({ applied: true }),
    edgeCredentialIssuer: issuer
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_refresh_edge_rotate_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  const [before] = requests.listEdgeCredentialOrders();

  const refreshed = requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_edge_rotate_1"
  });
  const [after] = requests.listEdgeCredentialOrders();

  assert.equal(before.edgeCredentialRef, after.edgeCredentialRef);
  assert.notEqual(before.edgeMaterialDigest, after.edgeMaterialDigest);
  assert.equal(refreshed.subscriptionUrl, "https://sub.example.test/import/original-visible-once");
  assert.equal(refreshed.delivery.runtimeMaterialPresent, true);
  assert.deepEqual(runtimeCore.calls.map(([method]) => method), [
    "bindTenantCredentialMaterial",
    "bindTenantCredentialMaterial"
  ]);
  assert.deepEqual(runtimeCore.calls.map(([, input]) => input?.materialUuid).filter(Boolean), [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002"
  ]);
  assert.doesNotMatch(JSON.stringify(requests.getRequest("pareq_refresh_edge_rotate_1")), /password-1|password-2/i);
});

test("refresh preserves entitlement validity, usage cycle totals, and used traffic", () => {
  withControlStore((store) => {
    const seeded = seedUsageOrder(store, {
      requestId: "pareq_refresh_continuity_1",
      validUntil: "2026-07-06T00:00:00.000Z",
      trafficLimitBytes: 2048
    });
    store.recordUsageSample({
      id: "usage_refresh_continuity_1",
      sourceRef: "usage_refresh_source_1",
      channelRef: "channel-vultr-a-vless-reality-tcp",
      edgeCredentialRef: seeded.edgeCredentialRef,
      accountId: seeded.accountId,
      entitlementId: seeded.entitlementId,
      requestId: seeded.requestId,
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 300,
      downloadBytes: 400,
      sampleDigest: "usage_refresh_continuity_digest_1",
      createdAt: "2026-06-06T00:05:01.000Z"
    });
    const materialStore = edgeMaterialStore();
    materialStore.putCredentialMaterial({
      credentialRef: seeded.edgeCredentialRef,
      materialDigest: `sha256:digest_${seeded.requestId}`,
      material: {
        uuid: "66666666-6666-4666-8666-666666666666",
        password: "synthetic-continuity-old-password"
      }
    });
    const requests = createPortalAccessRequestService({
      nowFn: () => "2026-06-06T00:06:00.000Z",
      controlStore: store,
      edgeLifecycleService: edgeLifecycleService({ applied: true }),
      edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
        channelRef: "channel-vultr-a-vless-reality-tcp",
        materialStore,
        uuidFactory: () => "77777777-7777-4777-8777-777777777777",
        passwordFactory: () => "synthetic-continuity-new-password"
      })
    });
    const orderBefore = store.getPortalAccessRequest(seeded.requestId);
    const entitlementBefore = store.getEntitlement(seeded.entitlementId);
    const usageBefore = requests.getRequest(seeded.requestId).usage;

    const refreshed = requests.refreshSubscription({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      clientTarget: "karing"
    });

    const orderAfter = store.getPortalAccessRequest(seeded.requestId);
    const entitlementAfter = store.getEntitlement(seeded.entitlementId);
    const usageAfter = requests.getRequest(seeded.requestId).usage;
    assert.equal(refreshed.runtimeEnforcement.state, "applied");
    assert.equal(orderAfter.entitlementRef, orderBefore.entitlementRef);
    assert.equal(orderAfter.validUntil, orderBefore.validUntil);
    assert.equal(orderAfter.expiresAt, orderBefore.expiresAt);
    assert.deepEqual(entitlementAfter, entitlementBefore);
    assert.deepEqual(usageAfter, usageBefore);
    assert.equal(usageAfter.usedBytes, 700);
  });
});

test("reveal returns the existing delivered subscription URL without rotating material", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_reveal_1",
    runtimeCore
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_reveal_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  const revealed = requests.revealSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_reveal_1"
  });

  assert.equal(revealed.status, "delivered");
  assert.equal(revealed.subscriptionUrl, "https://sub.example.test/import/original-visible-once");
  assert.equal(revealed.expiresAt, "2026-06-07T00:00:00.000Z");
  assert.deepEqual(runtimeCore.calls, []);
  assert.equal(JSON.stringify(revealed).includes("tenant_runtime_1"), false);
  assert.equal(JSON.stringify(revealed).includes("artifact_runtime_1"), false);
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

test("traffic supply suspension revokes access while preserving the order record", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const edgeLifecycle = edgeLifecycleService({ applied: true });
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_suspend_traffic_1",
    runtimeCore,
    edgeLifecycleService: edgeLifecycle
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_suspend_traffic_1", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_1",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });

  const suspended = requests.suspendTrafficSupply({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_suspend_traffic_1"
  });

  assert.equal(suspended.status, "disabled");
  assert.equal(suspended.nextAction, "traffic_supply_suspended_quota");
  assert.equal(suspended.event.type, "traffic_supply_suspended");
  assert.equal(suspended.subscriptionUrl, undefined);
  assert.deepEqual(runtimeCore.calls, [
    ["revokeSubscriptionArtifact", "artifact_runtime_1"],
    ["disableTenant", "tenant_runtime_1"]
  ]);
  assert.equal(edgeLifecycle.calls.length, 1);
  assert.equal(edgeLifecycle.calls[0].reason, "traffic_supply_suspended");
  assert.equal(requests.getRequest("pareq_suspend_traffic_1").nextAction, "traffic_supply_suspended_quota");
});

test("refresh and disable notify the optional edge lifecycle service", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const edgeLifecycle = edgeLifecycleService({ applied: true });
  let credentialSequence = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_edge_lifecycle_1",
    runtimeCore,
    edgeLifecycleService: edgeLifecycle,
    edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
      channelRef: "channel-aliyun-a-tuic",
      materialStore: edgeMaterialStore(),
      uuidFactory: () => `00000000-0000-4000-8000-${String(++credentialSequence).padStart(12, "0")}`,
      passwordFactory: () => `password-${credentialSequence}`
    })
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
    "order_delivered",
    "order_refreshed",
    "order_disabled"
  ]);
  assert.deepEqual(edgeLifecycle.calls.map((call) => call.order.status), [
    "delivered",
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
