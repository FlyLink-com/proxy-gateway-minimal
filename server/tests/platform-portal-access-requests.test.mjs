import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createOrderEdgeCredentialIssuer } from "../services/edge/order-credential-issuer.mjs";
import { createOrderCredentialLifecycleService } from "../services/edge/order-credential-lifecycle.mjs";
import { createDataPlaneDesiredStateNotifier } from "../services/edge/data-plane-desired-state-notifier.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { COIN_COMMERCE_PRODUCTION_OFFERS } from "../services/platform/coin-commerce-production-catalog.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const NOW = "2026-05-31T00:00:00.000Z";

function safeIssuedRef(prefix, value) {
  return `${prefix}ref_${createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 16)}`;
}

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

const TEST_REMOTE_NODE_REF = "node-synthetic-remote";

function authoritativeDesiredStateIdentity(channelRef, nodeRef = TEST_REMOTE_NODE_REF) {
  return {
    nodeRef,
    channelRefs: [channelRef],
    desiredStateRef: `desired_state_authoritative_${channelRef}`,
    generation: `gen_authoritative_${channelRef}`
  };
}

function pendingDesiredStateNotification(channelRef, overrides = {}) {
  const nodeRef = overrides.nodeRef || TEST_REMOTE_NODE_REF;
  const authoritative = authoritativeDesiredStateIdentity(channelRef, nodeRef);
  return {
    channelRef,
    nodeRef,
    desiredStateRef: authoritative.desiredStateRef,
    generation: authoritative.generation,
    status: "pending",
    ...overrides
  };
}

function desiredStateAuthorityStore() {
  const reads = [];
  return {
    reads,
    getLatestEdgeDesiredStateForChannel(channelRef, filters = {}) {
      reads.push({
        channelRef,
        nodeRef: filters.nodeRef,
        channelRefs: filters.channelRefs
      });
      return authoritativeDesiredStateIdentity(channelRef, filters.nodeRef);
    }
  };
}

function refreshStateMachineHarness({
  requestId,
  refreshLifecycleResult,
  runtimeCore = null,
  tenantId = null,
  desiredStateStore = desiredStateAuthorityStore(),
  refreshNotificationResult = {
    ok: true,
    notificationCount: 1,
    notifications: [pendingDesiredStateNotification("channel-aliyun-a-tuic")],
    redacted: true
  },
  rollbackLifecycleResult = {
    ok: true,
    mutation: true,
    runtimeReceipt: { status: "applied" },
    redacted: true
  },
  rollbackNotificationResult = {
    ok: true,
    notificationCount: 1,
    notifications: [pendingDesiredStateNotification("channel-aliyun-a-tuic")],
    redacted: true
  }
}) {
  const materialStore = edgeMaterialStore();
  const lifecycleReasons = [];
  const notificationCalls = [];
  let credentialSequence = 0;
  let requests;
  const edgeDesiredStateNotifier = refreshNotificationResult === null ? null : {
    notifyOrderLifecycle(input) {
      notificationCalls.push(input);
      if (input.reason === "order_refresh_rolled_back") {
        return typeof rollbackNotificationResult === "function"
          ? rollbackNotificationResult({ input, requests })
          : rollbackNotificationResult;
      }
      if (input.reason !== "order_refreshed") {
        return {
          ok: true,
          notificationCount: 1,
          notifications: [pendingDesiredStateNotification("channel-aliyun-a-tuic")],
          redacted: true
        };
      }
      return typeof refreshNotificationResult === "function"
        ? refreshNotificationResult({ input, requests })
        : refreshNotificationResult;
    }
  };

  requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => requestId,
    edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
      channelRef: "channel-aliyun-a-tuic",
      materialStore,
      uuidFactory: () => `00000000-0000-4000-8000-${String(++credentialSequence).padStart(12, "0")}`,
      passwordFactory: () => `synthetic-refresh-password-${credentialSequence}`
    }),
    controlStore: desiredStateStore,
    edgeLifecycleService: {
      reconcileOrderLifecycle({ reason }) {
        lifecycleReasons.push(reason);
        if (reason === "order_refreshed") {
          return typeof refreshLifecycleResult === "function"
            ? refreshLifecycleResult()
            : refreshLifecycleResult;
        }
        if (reason === "order_refresh_rolled_back") {
          return typeof rollbackLifecycleResult === "function"
            ? rollbackLifecycleResult()
            : rollbackLifecycleResult;
        }
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: { status: "applied" },
          redacted: true
        };
      }
    },
    ...(runtimeCore ? { runtimeCore } : {}),
    ...(edgeDesiredStateNotifier ? { edgeDesiredStateNotifier } : {})
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered(requestId, {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    ...(tenantId ? { tenantId } : {}),
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  notificationCalls.length = 0;

  return {
    desiredStateStore,
    lifecycleReasons,
    materialStore,
    notificationCalls,
    requests
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

function seedUsageOrder(store, overrides = {}) {
  const now = overrides.now || "2026-06-06T00:00:00.000Z";
  const requestId = overrides.requestId || "pareq_usage_summary_1";
  const accountId = overrides.accountId || "acct_usage_summary_1";
  const entitlementId = overrides.entitlementId || "ent_usage_summary_1";
  const tenantRef = overrides.tenantRef || "tenant_usage_summary_1";
  const artifactRef = overrides.artifactRef || "artifact_usage_summary_1";
  const issuedTenantRef = overrides.issuedTenantRef || tenantRef;
  const issuedArtifactRef = overrides.issuedArtifactRef || artifactRef;
  const edgeCredentialRef = overrides.edgeCredentialRef || `edgecred_${requestId}`;
  const edgeChannelRef = overrides.edgeChannelRef || "channel-vultr-a-vless-reality-tcp";
  const edgeCredentials = Array.isArray(overrides.edgeCredentials) ? overrides.edgeCredentials : undefined;
  const plan = overrides.plan || "monthly";
  const entitlementPlan = overrides.entitlementPlan || plan;
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
    plan: entitlementPlan,
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
    nodeId: edgeChannelRef,
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: `link_${requestId}`,
    requestId,
    tenantRef: issuedTenantRef,
    artifactRef: issuedArtifactRef,
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
    edgeChannelRef,
    edgeCredentialRef,
    edgeMaterialDigest: `sha256:digest_${requestId}`,
    ...(edgeCredentials ? { edgeCredentials } : {})
  });

  return { now, requestId, accountId, entitlementId, edgeCredentialRef };
}

function quotaResumeFixture({
  entitlementPlan = "offerv_plan_365d_200gb_monthly_v1",
  validFrom = "2026-01-31T00:00:00.000Z",
  validUntil = "2027-01-31T00:00:00.000Z",
  tenantExpiresAt = validUntil,
  requestPlan = "yearly",
  usageSamples = [],
  resumeLifecycleResult = {
    ok: true,
    mutation: true,
    runtimeReceipt: { status: "applied" },
    redacted: true
  },
  rollbackLifecycleResult = {
    ok: true,
    mutation: true,
    runtimeReceipt: { status: "applied" },
    redacted: true
  },
  enableTenantResult,
  readbackTenantResult,
  bindingOverrides = {},
  controlOverrides = {},
  edgeDesiredStateNotifier = null,
  suspendWithQuota = true
} = {}) {
  let now = "2026-02-15T00:00:00.000Z";
  let tenantStatus = "active";
  let artifactStatus = "active";
  let enableCount = 0;
  let disableCount = 0;
  let usageReadCount = 0;
  let runtimeReadCount = 0;
  const lifecycleReasons = [];
  const account = {
    id: "portal_user_quota_fixture",
    ownerRef: "portal_user_quota_fixture",
    status: "active",
    ...bindingOverrides.account
  };
  const entitlement = {
    id: "ent_quota_fixture",
    accountId: account.id,
    plan: entitlementPlan,
    status: "active",
    validFrom,
    validUntil,
    trafficLimitBytes: 1000,
    ...bindingOverrides.entitlement
  };
  const issuance = {
    id: "pareq_quota_fixture",
    accountId: account.id,
    entitlementId: entitlement.id,
    status: "issued",
    ...bindingOverrides.issuance
  };
  const issuedLink = {
    id: "link_pareq_quota_fixture",
    requestId: issuance.id,
    tenantRef: safeIssuedRef("tenant", "tenant_quota_fixture"),
    artifactRef: safeIssuedRef("artifact", "artifact_quota_fixture"),
    status: "active",
    ...bindingOverrides.issuedLink
  };
  const defaultBinding = {
    id: issuedLink.id,
    linkId: issuedLink.id,
    requestId: issuance.id,
    accountId: account.id,
    entitlementId: entitlement.id,
    tenantRef: issuedLink.tenantRef,
    artifactRef: issuedLink.artifactRef,
    status: "active",
    requestStatus: "issued",
    entitlementStatus: "active"
  };
  const bindings = bindingOverrides.bindings ?? [{
    ...defaultBinding,
    ...bindingOverrides.binding
  }];
  const runtimeCore = {
    revokeSubscriptionArtifact(id) {
      artifactStatus = "revoked";
      return { id, status: artifactStatus };
    },
    disableTenant(id) {
      disableCount += 1;
      tenantStatus = "disabled";
      return { id, status: tenantStatus, expiresAt: tenantExpiresAt };
    },
    enableTenant(id) {
      enableCount += 1;
      tenantStatus = "active";
      return typeof enableTenantResult === "function"
        ? enableTenantResult({ id, status: tenantStatus, expiresAt: tenantExpiresAt })
        : (enableTenantResult ?? { id, status: tenantStatus, expiresAt: tenantExpiresAt });
    },
    getTenant(id) {
      runtimeReadCount += 1;
      if (tenantStatus === "active" && readbackTenantResult !== undefined) {
        return typeof readbackTenantResult === "function"
          ? readbackTenantResult({ id, status: tenantStatus, expiresAt: tenantExpiresAt })
          : readbackTenantResult;
      }
      return { id, status: tenantStatus, expiresAt: tenantExpiresAt };
    },
    listSubscriptionArtifacts() {
      runtimeReadCount += 1;
      return [{
        id: "artifact_quota_fixture",
        tenantId: "tenant_quota_fixture",
        status: artifactStatus
      }];
    }
  };
  const control = {
    getAccount() {
      return bindingOverrides.account === null ? null : account;
    },
    getEntitlement() {
      return bindingOverrides.entitlement === null ? null : entitlement;
    },
    getIssuanceRequest() {
      return bindingOverrides.issuance === null ? null : issuance;
    },
    listIssuedSubscriptionBindings() {
      return bindings;
    },
    getIssuedLink() {
      return bindingOverrides.issuedLink === null ? null : issuedLink;
    },
    listUsageSamples() {
      usageReadCount += 1;
      return usageSamples;
    },
    ...controlOverrides
  };
  const requestStore = portalRequestStoreWith([]);
  const createRequests = () => createPortalAccessRequestService({
    nowFn: () => now,
    requestIdFactory: () => "pareq_quota_fixture",
    runtimeCore,
    controlStore: control,
    portalAccessRequestStore: requestStore,
    ...(edgeDesiredStateNotifier ? { edgeDesiredStateNotifier } : {}),
    edgeLifecycleService: {
      reconcileOrderLifecycle({ reason }) {
        lifecycleReasons.push(reason);
        if (reason === "traffic_supply_resumed") {
          return typeof resumeLifecycleResult === "function"
            ? resumeLifecycleResult()
            : resumeLifecycleResult;
        }
        if (reason === "traffic_supply_resume_rolled_back") {
          return typeof rollbackLifecycleResult === "function"
            ? rollbackLifecycleResult()
            : rollbackLifecycleResult;
        }
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: { status: "applied" },
          redacted: true
        };
      }
    }
  });
  const requests = createRequests();
  requests.submitRequest({
    portalUserRef: "portal_user_quota_fixture",
    plan: requestPlan
  });
  requests.markDelivered("pareq_quota_fixture", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_quota_fixture",
    accessGrantRef: "grant_quota_fixture",
    tenantId: "tenant_quota_fixture",
    artifactId: "artifact_quota_fixture",
    subscriptionUrl: "https://gateway.example.test/sub/a/quota-fixture.yaml",
    expiresAt: validUntil
  });
  if (suspendWithQuota) {
    requests.suspendTrafficSupply({
      portalUserRef: "portal_user_quota_fixture",
      requestRef: "pareq_quota_fixture"
    });
  } else {
    requests.disableSubscription({
      portalUserRef: "portal_user_quota_fixture",
      requestRef: "pareq_quota_fixture"
    });
  }
  return {
    requests,
    reopenRequests: createRequests,
    requestStore,
    lifecycleReasons,
    setNow(value) {
      now = value;
    },
    enableCount() {
      return enableCount;
    },
    disableCount() {
      return disableCount;
    },
    usageReadCount() {
      return usageReadCount;
    },
    runtimeReadCount() {
      return runtimeReadCount;
    },
    tenantStatus() {
      return tenantStatus;
    },
    setTenantStatus(value) {
      tenantStatus = value;
    },
    artifactStatus() {
      return artifactStatus;
    }
  };
}

function quotaResumeCrashFixture({
  desiredStateStatus = "applied",
  lifecycleRevisionSafe = true,
  validUntil
} = {}) {
  const channelRef = "channel-quota-crash-recovery";
  const nodeRef = "node-quota-crash-recovery";
  const desiredStateRef = "desired_state_quota_crash_recovery";
  const generation = "gen_quota_crash_recovery";
  const notificationId = "edge_state_notify_quota_crash_recovery";
  let persistedReason = "traffic_supply_resumed";
  const notification = () => ({
    id: notificationId,
    nodeRef,
    channelRef,
    desiredStateRef,
    generation,
    reason: persistedReason,
    status: desiredStateStatus
  });
  const fixture = quotaResumeFixture({
    ...(validUntil ? { validUntil } : {}),
    controlOverrides: {
      getLatestEdgeDesiredStateForChannel() {
        return {
          nodeRef,
          channelRefs: [channelRef],
          desiredStateRef,
          generation,
          lifecycleRevisionSafe
        };
      },
      getEdgeDesiredStateNotification() {
        return notification();
      },
      listEdgeApplyReceipts() {
        return desiredStateStatus === "applied"
          ? [{
            id: "receipt_quota_crash_recovery",
            channelRef,
            desiredStateRef,
            status: "applied",
            configTestOk: true,
            serviceActive: true,
            listenerUdp443: true,
            createdAt: "2026-03-01T00:00:00.000Z"
          }]
          : [];
      }
    },
    edgeDesiredStateNotifier: {
      notifyOrderLifecycle({ reason }) {
        persistedReason = reason;
        return {
          ok: true,
          notificationCount: 1,
          notifications: [notification()],
          redacted: true
        };
      }
    }
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");
  const pending = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");
  fixture.requestStore.upsertPortalAccessRequest({
    ...pending,
    status: "disabled",
    nextAction: "traffic_supply_resume_pending",
    updatedAt: "2026-03-01T00:00:00.000Z"
  });
  fixture.setTenantStatus("active");
  return fixture;
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

test("wallet-first accounts cannot create legacy access requests while legacy accounts remain supported", () => {
  const walletFirstControl = controlStore();
  walletFirstControl.createAccount({
    id: "acct_wallet_first_access_request",
    ownerRef: "owner_wallet_first_access_request",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: { commercialModel: "wallet_first_unique_v1" }
  });
  const walletFirstRequests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_wallet_first_blocked",
    controlStore: walletFirstControl,
    walletFirstRegistrationEnabled: true
  });
  for (const plan of ["trial", "monthly", "yearly"]) {
    assert.throws(
      () => walletFirstRequests.submitRequest(validTrialInput({
        portalUserRef: "acct_wallet_first_access_request",
        plan
      })),
      (error) => error?.code === "wallet_first_deferred_required"
    );
  }
  assert.throws(
    () => walletFirstRequests.listRequests({
      portalUserRef: "acct_wallet_first_access_request"
    }),
    (error) => error?.code === "wallet_first_deferred_required"
  );
  const walletFirstRequestsWithFlagOff = createPortalAccessRequestService({
    nowFn: () => NOW,
    controlStore: walletFirstControl,
    walletFirstRegistrationEnabled: false
  });
  assert.throws(
    () => walletFirstRequestsWithFlagOff.listRequests({
      portalUserRef: "acct_wallet_first_access_request"
    }),
    (error) => error?.code === "wallet_first_deferred_required"
  );

  const legacyControl = controlStore();
  for (const [accountId, metadata] of [
    ["acct_explicit_legacy_access_request", { commercialModel: "legacy" }],
    ["acct_missing_legacy_access_request", {}]
  ]) {
    legacyControl.createAccount({
      id: accountId,
      ownerRef: `owner_${accountId}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata
    });
  }
  let legacyRequestSequence = 0;
  const legacyRequests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => `pareq_legacy_supported_${++legacyRequestSequence}`,
    controlStore: legacyControl,
    walletFirstRegistrationEnabled: true
  });
  assert.equal(legacyRequests.submitRequest(validTrialInput({
    portalUserRef: "acct_explicit_legacy_access_request",
    plan: "monthly"
  })).plan, "monthly");
  assert.equal(legacyRequests.submitRequest(validTrialInput({
    portalUserRef: "acct_missing_legacy_access_request",
    plan: "yearly"
  })).plan, "yearly");

  const noModelSource = createPortalAccessRequestService({
    nowFn: () => NOW,
    walletFirstRegistrationEnabled: true
  });
  assert.throws(
    () => noModelSource.submitRequest(validTrialInput()),
    (error) => error?.code === "wallet_first_access_request_unavailable"
  );

  const unknownModelControl = controlStore();
  unknownModelControl.createAccount({
    id: "acct_unknown_access_request_model",
    ownerRef: "owner_unknown_access_request_model",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: { commercialModel: "future_commercial_model" }
  });
  const unknownModelRequests = createPortalAccessRequestService({
    nowFn: () => NOW,
    controlStore: unknownModelControl,
    walletFirstRegistrationEnabled: false
  });
  assert.throws(
    () => unknownModelRequests.submitRequest(validTrialInput({
      portalUserRef: "acct_unknown_access_request_model"
    })),
    (error) => error?.code === "wallet_first_access_request_unavailable"
  );

  const unresolvedAccountSource = {
    getAccount() {
      return null;
    }
  };
  const requiredModelRequests = createPortalAccessRequestService({
    nowFn: () => NOW,
    controlStore: unresolvedAccountSource,
    walletFirstRegistrationEnabled: true
  });
  assert.throws(
    () => requiredModelRequests.submitRequest(validTrialInput()),
    (error) => error?.code === "wallet_first_access_request_unavailable"
  );
});

test("wallet-first account markers block legacy access-request lifecycle operations", () => {
  const accountId = "acct_wallet_first_historical_request";
  const walletFirstControl = controlStore();
  walletFirstControl.createAccount({
    id: accountId,
    ownerRef: "owner_wallet_first_historical_request",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: { commercialModel: "wallet_first_unique_v1" }
  });
  const requestStore = portalRequestStoreWith([
    materialBearingPortalRequest({
      id: "pareq_wallet_first_historical_delivered",
      portalUserRef: accountId
    }),
    materialBearingPortalRequest({
      id: "pareq_wallet_first_historical_quota_suspended",
      portalUserRef: accountId,
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      event: {
        type: "traffic_supply_suspended",
        occurredAt: NOW,
        previousStatus: "delivered"
      }
    })
  ]);
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    controlStore: walletFirstControl,
    portalAccessRequestStore: requestStore,
    // An existing wallet-first marker remains authoritative after this flag is off.
    walletFirstRegistrationEnabled: false
  });
  const deferredRequired = (operation) => assert.throws(
    operation,
    (error) => error?.code === "wallet_first_deferred_required"
  );

  deferredRequired(() => requests.revealSubscription({
    portalUserRef: accountId,
    requestRef: "pareq_wallet_first_historical_delivered"
  }));
  deferredRequired(() => requests.refreshSubscription({
    portalUserRef: accountId,
    requestRef: "pareq_wallet_first_historical_delivered",
    clientTarget: "clash"
  }));
  deferredRequired(() => requests.suspendTrafficSupply({
    portalUserRef: accountId,
    requestRef: "pareq_wallet_first_historical_delivered"
  }));
  deferredRequired(() => requests.disableSubscription({
    portalUserRef: accountId,
    requestRef: "pareq_wallet_first_historical_delivered"
  }));
  deferredRequired(() => requests.resumeTrafficSupply({
    portalUserRef: accountId,
    requestRef: "pareq_wallet_first_historical_quota_suspended"
  }));
  deferredRequired(() => requests.disableSubscription({
    portalUserRef: accountId,
    requestRef: "pareq_wallet_first_historical_quota_suspended"
  }));

  assert.equal(
    requestStore.getPortalAccessRequest("pareq_wallet_first_historical_delivered").status,
    "delivered"
  );
  assert.equal(
    requestStore.getPortalAccessRequest("pareq_wallet_first_historical_quota_suspended").status,
    "disabled"
  );

  const legacyControl = controlStore();
  legacyControl.createAccount({
    id: "acct_explicit_legacy_historical_request",
    ownerRef: "owner_explicit_legacy_historical_request",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    metadata: { commercialModel: "legacy" }
  });
  const legacyRequests = createPortalAccessRequestService({
    nowFn: () => NOW,
    controlStore: legacyControl,
    portalAccessRequestStore: portalRequestStoreWith([
      materialBearingPortalRequest({
        id: "pareq_explicit_legacy_historical_delivered",
        portalUserRef: "acct_explicit_legacy_historical_request"
      })
    ]),
    walletFirstRegistrationEnabled: true
  });
  assert.equal(legacyRequests.revealSubscription({
    portalUserRef: "acct_explicit_legacy_historical_request",
    requestRef: "pareq_explicit_legacy_historical_delivered"
  }).status, "delivered");

  const unresolvedHistoricalRequests = createPortalAccessRequestService({
    nowFn: () => NOW,
    controlStore: {
      getAccount() {
        return null;
      }
    },
    portalAccessRequestStore: portalRequestStoreWith([
      materialBearingPortalRequest({
        id: "pareq_unresolved_legacy_historical_delivered",
        portalUserRef: "portal_user_legacy_historical_request"
      })
    ]),
    walletFirstRegistrationEnabled: false
  });
  assert.equal(unresolvedHistoricalRequests.revealSubscription({
    portalUserRef: "portal_user_legacy_historical_request",
    requestRef: "pareq_unresolved_legacy_historical_delivered"
  }).status, "delivered");
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

test("commerce product fulfillment creates one stable account resource and replays across delivery refresh", () => {
  withControlStore((store) => {
    const runtimeCore = lifecycleRuntimeCore();
    const requests = createPortalAccessRequestService({
      nowFn: () => NOW,
      runtimeCore,
      controlStore: store,
      edgeCredentialIssuer: edgeCredentialIssuer(),
      edgeLifecycleService: edgeLifecycleService(),
      autoIssuance: {
        enabled: true,
        nodeId: "channel-aliyun-a-tuic",
        reviewedByRef: "commerce_product_issuer"
      }
    });
    const input = {
      commandRef: "coincmd_first_account_resource_1",
      orderRef: "coinord_first_account_resource_1",
      accountId: "acct_first_account_resource_1",
      offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
      portalPlan: "monthly",
      durationDays: 30,
      trafficLimitBytes: 50 * 1024 ** 3
    };

    store.createAccount({
      id: input.accountId,
      ownerRef: input.accountId,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW
    });
    store.createAccount({
      id: "acct_wallet_first_commerce_fulfillment",
      ownerRef: "acct_wallet_first_commerce_fulfillment",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: { commercialModel: "wallet_first_unique_v1" }
    });

    assert.equal(requests.isCommerceProductFulfillmentReady(), true);
    assert.throws(
      () => requests.fulfillCommerceProduct({
        ...input,
        commandRef: "coincmd_wallet_first_legacy_fulfillment_blocked",
        orderRef: "coinord_wallet_first_legacy_fulfillment_blocked",
        accountId: "acct_wallet_first_commerce_fulfillment"
      }),
      (error) => error?.code === "wallet_first_deferred_required"
    );
    assert.equal(
      store.listPortalAccessRequests({
        portalUserRef: "acct_wallet_first_commerce_fulfillment"
      }).length,
      0
    );
    const first = requests.fulfillCommerceProduct(input);
    assert.equal(first.status, "delivered");
    assert.equal(first.redacted, true);

    const [resource] = store.listPortalAccessRequests({
      portalUserRef: input.accountId
    });
    const entitlement = store.getEntitlement(resource.entitlementRef);
    assert.equal(entitlement.plan, input.offerVersionRef);
    assert.equal(entitlement.validFrom, NOW);
    assert.equal(entitlement.validUntil, "2026-06-30T00:00:00.000Z");
    assert.equal(entitlement.trafficLimitBytes, input.trafficLimitBytes);

    assert.equal(resource.id, first.requestRef);
    assert.equal(resource.status, "delivered");
    assert.equal(resource.entitlementRef, entitlement.id);
    assert.equal(runtimeCore.calls.filter(([name]) => name === "createTenant").length, 1);
    assert.equal(runtimeCore.calls.filter(([name]) => name === "createSubscriptionArtifact").length, 1);

    store.upsertPortalAccessRequest({
      ...resource,
      event: {
        type: "delivery_generation_reissued",
        occurredAt: "2026-06-01T00:00:00.000Z"
      },
      updatedAt: "2026-06-01T00:00:00.000Z"
    });

    const replay = requests.fulfillCommerceProduct(input);
    assert.deepEqual(replay, first);
    assert.equal(store.getAccountControlSummary(input.accountId).entitlements.length, 1);
    assert.equal(store.listPortalAccessRequests({ portalUserRef: input.accountId }).length, 1);
    assert.equal(runtimeCore.calls.filter(([name]) => name === "createTenant").length, 1);
    assert.equal(runtimeCore.calls.filter(([name]) => name === "createSubscriptionArtifact").length, 1);
    assert.throws(
      () => requests.fulfillCommerceProduct({
        ...input,
        orderRef: "coinord_conflicting_replay"
      }),
      (error) => error?.code === "commerce_product_fulfillment_drift"
    );
  });
});

test("commerce product fulfillment binds an optional internal issuedAt to initial resource validity", async (t) => {
  const issuerNow = "2026-05-31T00:00:00.007Z";
  for (const scenario of [
    { name: "operation issuedAt precedes the issuer clock", clockInput: { issuedAt: NOW }, expected: NOW },
    { name: "absent issuedAt retains the standalone issuer clock", clockInput: {}, expected: issuerNow }
  ]) {
    await t.test(scenario.name, () => withControlStore((store) => {
      const runtimeCore = lifecycleRuntimeCore();
      const requests = createPortalAccessRequestService({
        nowFn: () => issuerNow,
        runtimeCore,
        controlStore: store,
        autoIssuance: {
          enabled: true,
          nodeId: "channel-aliyun-a-tuic",
          reviewedByRef: "commerce_product_issuer"
        }
      });
      const input = {
        commandRef: "coincmd_initial_clock_handoff",
        orderRef: "coinord_initial_clock_handoff",
        accountId: "acct_initial_clock_handoff",
        offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
        portalPlan: "monthly",
        durationDays: 30,
        trafficLimitBytes: 50 * 1024 ** 3,
        ...scenario.clockInput
      };
      store.createAccount({
        id: input.accountId,
        ownerRef: input.accountId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW
      });

      const result = requests.fulfillCommerceProduct(input);
      const resource = store.getPortalAccessRequest(result.requestRef);
      const entitlement = store.getEntitlement(resource.entitlementRef);
      const issuance = store.getIssuanceRequest(resource.id);
      const expiresAt = new Date(Date.parse(scenario.expected) + 30 * 86400000).toISOString();

      assert.equal(result.status, "delivered");
      assert.equal(resource.submittedAt, scenario.expected);
      assert.equal(resource.expiresAt, expiresAt);
      assert.equal(resource.validUntil, expiresAt);
      assert.equal(entitlement.validFrom, scenario.expected);
      assert.equal(entitlement.createdAt, scenario.expected);
      assert.equal(entitlement.validUntil, expiresAt);
      assert.equal(issuance.createdAt, scenario.expected);
      assert.equal(entitlement.plan, input.offerVersionRef);
      assert.equal(entitlement.trafficLimitBytes, input.trafficLimitBytes);
      assert.equal(store.listPortalAccessRequests({ portalUserRef: input.accountId }).length, 1);
      assert.equal(store.getAccountControlSummary(input.accountId).entitlements.length, 1);
      const tenantCalls = runtimeCore.calls.filter(([name]) => name === "createTenant");
      assert.equal(tenantCalls.length, 1);
      assert.equal(tenantCalls[0][1].expiresAt, expiresAt);
    }));
  }
});

test("commerce product fulfillment rejects malformed or noncanonical issuedAt before creating records", async (t) => {
  for (const [name, issuedAt] of [
    ["null", null],
    ["empty", ""],
    ["invalid date", "not-a-timestamp"],
    ["leading whitespace", ` ${NOW}`],
    ["missing milliseconds", "2026-05-31T00:00:00Z"],
    ["non-UTC offset", "2026-05-31T08:00:00.000+08:00"],
    ["calendar rollover", "2026-02-30T00:00:00.000Z"],
    ["Date object", new Date(NOW)],
    ["numeric timestamp", Date.parse(NOW)]
  ]) {
    await t.test(name, () => withControlStore((store) => {
      const runtimeCore = lifecycleRuntimeCore();
      const requests = createPortalAccessRequestService({
        nowFn: () => NOW,
        runtimeCore,
        controlStore: store,
        autoIssuance: {
          enabled: true,
          nodeId: "channel-aliyun-a-tuic",
          reviewedByRef: "commerce_product_issuer"
        }
      });
      const input = {
        commandRef: "coincmd_invalid_clock_handoff",
        orderRef: "coinord_invalid_clock_handoff",
        accountId: "acct_invalid_clock_handoff",
        offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
        portalPlan: "monthly",
        durationDays: 30,
        trafficLimitBytes: 50 * 1024 ** 3,
        issuedAt
      };
      store.createAccount({
        id: input.accountId,
        ownerRef: input.accountId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW
      });
      const accountBefore = store.getAccount(input.accountId);
      const commandDigest = createHash("sha256").update(input.commandRef).digest("hex");

      assert.throws(
        () => requests.fulfillCommerceProduct(input),
        (error) => error?.code === "commerce_product_fulfillment_drift"
      );
      assert.deepEqual(store.getAccount(input.accountId), accountBefore);
      assert.equal(store.listPortalAccessRequests({ portalUserRef: input.accountId }).length, 0);
      assert.equal(store.getAccountControlSummary(input.accountId).entitlements.length, 0);
      assert.equal(store.getEntitlement(`ent_commerce_${commandDigest}`), null);
      assert.equal(store.getIssuanceRequest(`pareq_commerce_${commandDigest}`), null);
      assert.equal(store.listIssuedSubscriptionBindings().length, 0);
      assert.equal(runtimeCore.calls.length, 0);
    }));
  }
});

test("every production Commerce product can issue its exact first account resource", async (t) => {
  for (const [index, offer] of COIN_COMMERCE_PRODUCTION_OFFERS.entries()) {
    await t.test(offer.offerVersionRef, () => withControlStore((store) => {
      const accountId = `acct_first_product_${index}`;
      const requests = createPortalAccessRequestService({
        nowFn: () => NOW,
        runtimeCore: lifecycleRuntimeCore(),
        controlStore: store,
        autoIssuance: {
          enabled: true,
          nodeId: "channel-aliyun-a-tuic",
          reviewedByRef: "commerce_product_issuer"
        }
      });
      store.createAccount({
        id: accountId,
        ownerRef: accountId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW
      });

      const delivered = requests.fulfillCommerceProduct({
        commandRef: `coincmd_first_product_${index}`,
        orderRef: `coinord_first_product_${index}`,
        accountId,
        offerVersionRef: offer.offerVersionRef,
        portalPlan: offer.delivery.durationDays === 365 ? "yearly" : "monthly",
        durationDays: offer.delivery.durationDays,
        trafficLimitBytes: offer.delivery.monthlyTrafficGb * 1024 ** 3
      });
      const request = store.getPortalAccessRequest(delivered.requestRef);
      const entitlement = store.getEntitlement(request.entitlementRef);

      assert.equal(request.status, "delivered");
      assert.equal(request.durationDays, offer.delivery.durationDays);
      assert.equal(entitlement.plan, offer.offerVersionRef);
      assert.equal(
        entitlement.trafficLimitBytes,
        offer.delivery.monthlyTrafficGb * 1024 ** 3
      );
    }));
  }
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

test("refresh compensates a failed lifecycle report that may have mutated runtime", () => {
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
    requestIdFactory: () => "pareq_refresh_failed_mutation_1",
    edgeCredentialIssuer: issuer,
    edgeLifecycleService: {
      reconcileOrderLifecycle({ reason }) {
        lifecycleReasons.push(reason);
        if (reason === "order_refreshed") {
          return {
            ok: false,
            mutation: true,
            runtimeReceipt: { status: "failed" },
            redacted: true
          };
        }
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
  requests.markDelivered("pareq_refresh_failed_mutation_1", {
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
    requestRef: "pareq_refresh_failed_mutation_1",
    clientTarget: "karing"
  }), { code: "edge_lifecycle_failed" });

  const [after] = requests.listEdgeCredentialOrders();
  const afterMaterial = materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  const request = requests.getRequest("pareq_refresh_failed_mutation_1");
  assert.equal(after.edgeCredentialRef, before.edgeCredentialRef);
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(afterMaterial.materialDigest, beforeMaterial.materialDigest);
  assert.equal(request.clientTarget, "clash");
  assert.equal(request.event, null);
  assert.deepEqual(lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh publishes an explicit remote pending result after persisting the rotated order", () => {
  let notifiedDigest;
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_remote_pending_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef: "channel-aliyun-a-tuic",
      mutation: false,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    },
    refreshNotificationResult({ input, requests }) {
      const [persisted] = requests.listEdgeCredentialOrders();
      notifiedDigest = persisted.edgeMaterialDigest;
      assert.equal(input.order.edgeMaterialDigest, persisted.edgeMaterialDigest);
      return {
        ok: true,
        notificationCount: 1,
        notifications: [pendingDesiredStateNotification("channel-aliyun-a-tuic")],
        redacted: true
      };
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  const refreshed = harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_remote_pending_1",
    clientTarget: "karing"
  });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(refreshed.runtimeEnforcement.state, "pending");
  assert.equal(refreshed.event.type, "delivery_generation_reissued");
  assert.equal(refreshed.clientTarget, "karing");
  assert.notEqual(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(notifiedDigest, after.edgeMaterialDigest);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), ["order_refreshed"]);
  assert.deepEqual(harness.lifecycleReasons, ["order_delivered", "order_refreshed"]);
  assert.doesNotMatch(
    JSON.stringify(refreshed),
    /synthetic-refresh-password|00000000-0000-4000-8000|edgeMaterialDigest|rawConfig/i
  );
});

test("refresh rejects stale remote pending notification identity against authoritative desired state", () => {
  const channelRef = "channel-aliyun-a-tuic";
  const nodeRef = TEST_REMOTE_NODE_REF;
  const staleNotification = pendingDesiredStateNotification(channelRef, {
    nodeRef,
    desiredStateRef: "desired_state_stale_notification",
    generation: "gen_stale_notification"
  });
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_stale_notification_identity_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef,
      mutation: false,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    },
    refreshNotificationResult: {
      ok: true,
      notificationCount: 1,
      notifications: [staleNotification],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();
  const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  const beforeRequest = harness.requests.getRequest("pareq_refresh_stale_notification_identity_1");

  assert.equal(staleNotification.channelRef, channelRef);
  assert.equal(staleNotification.nodeRef, nodeRef);
  assert.equal(staleNotification.status, "pending");
  assert.equal(new Set([staleNotification.channelRef]).size, 1);
  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_stale_notification_identity_1",
    clientTarget: "karing"
  }), { code: "subscription_refresh_runtime_enforcement_pending" }, "stale_notification_identity_accepted");

  const [after] = harness.requests.listEdgeCredentialOrders();
  const restored = harness.requests.getRequest("pareq_refresh_stale_notification_identity_1");
  assert.deepEqual(harness.desiredStateStore.reads, [{
    channelRef,
    nodeRef,
    channelRefs: [channelRef]
  }, {
    channelRef,
    nodeRef,
    channelRefs: [channelRef]
  }]);
  assert.equal(after.edgeCredentialRef, before.edgeCredentialRef);
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(
    harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest,
    beforeMaterial.materialDigest
  );
  assert.equal(restored.clientTarget, beforeRequest.clientTarget);
  assert.deepEqual(restored.event, beforeRequest.event);
  assert.deepEqual(harness.notificationCalls.map(({ reason }) => reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh rejects an unclassified lifecycle plan before notifying or saving", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_generic_plan_1",
    refreshLifecycleResult: {
      ok: true,
      mutation: false,
      nextAction: "review_apply_gate",
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();
  const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_generic_plan_1",
    clientTarget: "karing"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  const restored = harness.requests.getRequest("pareq_refresh_generic_plan_1");
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(
    harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest,
    beforeMaterial.materialDigest
  );
  assert.equal(restored.clientTarget, "clash");
  assert.equal(restored.event, null);
  assert.equal(harness.notificationCalls.length, 0);
});

test("refresh restores remote pending rotation when no desired-state notification is recorded", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_remote_without_notification_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef: "channel-aliyun-a-tuic",
      mutation: false,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    },
    refreshNotificationResult: {
      ok: true,
      notificationCount: 0,
      notifications: [],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();
  const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_remote_without_notification_1",
    clientTarget: "karing"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  const restored = harness.requests.getRequest("pareq_refresh_remote_without_notification_1");
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(
    harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest,
    beforeMaterial.materialDigest
  );
  assert.equal(restored.clientTarget, "clash");
  assert.equal(restored.event, null);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh accepts a fully classified fanout containing applied and remote pending reports", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_mixed_fanout_1",
    refreshLifecycleResult: {
      ok: true,
      mutation: true,
      reports: [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          ok: true,
          runtimeStatus: "applied",
          mutation: true,
          nextAction: "validate_runtime_state"
        },
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        }
      ],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  const refreshed = harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_mixed_fanout_1"
  });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(refreshed.runtimeEnforcement.state, "pending");
  assert.notEqual(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, ["order_delivered", "order_refreshed"]);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), ["order_refreshed"]);
});

test("refresh rejects a direct pending report with mutation evidence and compensates runtime", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_mutated_pending_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef: "channel-aliyun-a-tuic",
      mutation: true,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_mutated_pending_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.equal(harness.notificationCalls.length, 0);
});

test("refresh rejects inconsistent fanout mutation evidence and compensates from child reports", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_inconsistent_fanout_mutation_1",
    refreshLifecycleResult: {
      ok: true,
      mutation: false,
      reports: [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          ok: true,
          runtimeStatus: "applied",
          mutation: true,
          nextAction: "validate_runtime_state"
        },
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        }
      ],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_inconsistent_fanout_mutation_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.deepEqual(
    harness.notificationCalls.map(({ reason }) => reason),
    ["order_refresh_rolled_back"]
  );
});

test("refresh rejects a direct pending notification for the wrong channel and restores state", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_wrong_notification_channel_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef: "channel-aliyun-a-tuic",
      mutation: false,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    },
    refreshNotificationResult: {
      ok: true,
      notificationCount: 1,
      notifications: [pendingDesiredStateNotification("channel-unrelated-a-hy2")],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_wrong_notification_channel_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, ["order_delivered", "order_refreshed", "order_refresh_rolled_back"]);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh requires notifications for every pending fanout channel and compensates applied children", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_partial_fanout_notification_1",
    refreshLifecycleResult: {
      ok: true,
      mutation: true,
      reports: [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          ok: true,
          runtimeStatus: "applied",
          mutation: true,
          nextAction: "validate_runtime_state"
        },
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        },
        {
          channelRef: "channel-sgp-a-hy2",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        }
      ],
      redacted: true
    },
    refreshNotificationResult: {
      ok: true,
      notificationCount: 2,
      notifications: [
        pendingDesiredStateNotification("channel-aliyun-a-tuic"),
        pendingDesiredStateNotification("channel-unrelated-a-hy2")
      ],
      redacted: true
    },
    rollbackNotificationResult: {
      ok: true,
      notificationCount: 2,
      notifications: [
        pendingDesiredStateNotification("channel-aliyun-a-tuic"),
        pendingDesiredStateNotification("channel-sgp-a-hy2")
      ],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_partial_fanout_notification_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh completes mixed fanout rollback only with exact pending notification coverage", () => {
  const pendingChannelRefs = ["channel-aliyun-a-tuic", "channel-sgp-a-hy2"];
  const mixedFanoutResult = () => ({
    ok: true,
    mutation: true,
    reports: [
      {
        channelRef: "channel-vultr-a-vless-reality-tcp",
        ok: true,
        runtimeStatus: "applied",
        mutation: true,
        nextAction: "validate_runtime_state"
      },
      ...pendingChannelRefs.map((channelRef) => ({
        channelRef,
        ok: true,
        runtimeStatus: "pending",
        mutation: false,
        nextAction: "complete_data_plane_handoff"
      }))
    ],
    redacted: true
  });
  const incompleteRefreshNotification = {
    ok: true,
    notificationCount: 1,
    notifications: [pendingDesiredStateNotification(pendingChannelRefs[0])],
    redacted: true
  };
  const exactRollbackNotification = {
    ok: true,
    notificationCount: pendingChannelRefs.length,
    notifications: pendingChannelRefs.map((channelRef) => (
      pendingDesiredStateNotification(channelRef)
    )),
    redacted: true
  };
  let rollbackNotificationOrder;
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_mixed_rollback_1",
    refreshLifecycleResult: mixedFanoutResult(),
    refreshNotificationResult: incompleteRefreshNotification,
    rollbackLifecycleResult: mixedFanoutResult(),
    rollbackNotificationResult({ input, requests }) {
      rollbackNotificationOrder = input.order;
      const [restoredOrder] = requests.listEdgeCredentialOrders();
      assert.equal(input.order.edgeMaterialDigest, restoredOrder.edgeMaterialDigest);
      return exactRollbackNotification;
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();
  const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_mixed_rollback_1",
    clientTarget: "karing"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  const restored = harness.requests.getRequest("pareq_refresh_mixed_rollback_1");
  assert.equal(after.edgeCredentialRef, before.edgeCredentialRef);
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(
    harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest,
    beforeMaterial.materialDigest
  );
  assert.equal(restored.clientTarget, "clash");
  assert.equal(restored.event, null);
  assert.equal(rollbackNotificationOrder.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.equal(exactRollbackNotification.notificationCount, pendingChannelRefs.length);
  assert.ok(exactRollbackNotification.notifications.every(({ status }) => status === "pending"));
  assert.equal(
    new Set(exactRollbackNotification.notifications.map(({ channelRef }) => channelRef)).size,
    pendingChannelRefs.length
  );
  assert.deepEqual(
    exactRollbackNotification.notifications.map(({ channelRef }) => channelRef).sort(),
    [...pendingChannelRefs].sort()
  );

  const failClosedScenarios = [
    {
      name: "failed-lifecycle",
      rollbackLifecycleResult: {
        ok: false,
        mutation: true,
        runtimeReceipt: { status: "failed" },
        redacted: true
      }
    },
    {
      name: "unavailable-lifecycle",
      rollbackLifecycleResult: {
        ok: true,
        mutation: true,
        nextAction: "review_apply_gate",
        redacted: true
      }
    },
    {
      name: "failed-notification",
      rollbackNotificationResult: {
        ...exactRollbackNotification,
        notifications: [
          pendingDesiredStateNotification(pendingChannelRefs[0]),
          pendingDesiredStateNotification(pendingChannelRefs[1], { status: "failed" })
        ]
      }
    },
    {
      name: "duplicate-notification",
      rollbackNotificationResult: {
        ...exactRollbackNotification,
        notifications: pendingChannelRefs.map(() => (
          pendingDesiredStateNotification(pendingChannelRefs[0])
        ))
      }
    },
    {
      name: "wrong-channel-notification",
      rollbackNotificationResult: {
        ...exactRollbackNotification,
        notifications: [
          pendingDesiredStateNotification(pendingChannelRefs[0]),
          pendingDesiredStateNotification("channel-unrelated-a-hy2")
        ]
      }
    },
    {
      name: "partial-notification",
      rollbackNotificationResult: {
        ok: true,
        notificationCount: 1,
        notifications: [pendingDesiredStateNotification(pendingChannelRefs[0])],
        redacted: true
      }
    }
  ];
  for (const scenario of failClosedScenarios) {
    const requestId = `pareq_refresh_mixed_rollback_${scenario.name}`;
    const failClosedHarness = refreshStateMachineHarness({
      requestId,
      refreshLifecycleResult: mixedFanoutResult(),
      refreshNotificationResult: incompleteRefreshNotification,
      rollbackLifecycleResult: scenario.rollbackLifecycleResult || mixedFanoutResult(),
      rollbackNotificationResult: scenario.rollbackNotificationResult || exactRollbackNotification
    });
    const [beforeFailure] = failClosedHarness.requests.listEdgeCredentialOrders();
    const beforeFailureMaterial = failClosedHarness.materialStore
      .getCredentialMaterialSummary(beforeFailure.edgeCredentialRef);

    assert.throws(() => failClosedHarness.requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: requestId
    }), { code: "subscription_refresh_rollback_failed" });

    const [afterFailure] = failClosedHarness.requests.listEdgeCredentialOrders();
    assert.equal(afterFailure.edgeMaterialDigest, beforeFailure.edgeMaterialDigest);
    assert.equal(
      failClosedHarness.materialStore
        .getCredentialMaterialSummary(afterFailure.edgeCredentialRef).materialDigest,
      beforeFailureMaterial.materialDigest
    );
  }
});

test("refresh notifies exact pending rollback fanout before candidate save and preserves binding failure", () => {
  const pendingChannelRefs = ["channel-aliyun-a-tuic", "channel-sgp-a-hy2"];
  const mixedFanoutResult = () => ({
    ok: true,
    mutation: true,
    reports: [
      {
        channelRef: "channel-vultr-a-vless-reality-tcp",
        ok: true,
        runtimeStatus: "applied",
        mutation: true,
        nextAction: "validate_runtime_state"
      },
      ...pendingChannelRefs.map((channelRef) => ({
        channelRef,
        ok: true,
        runtimeStatus: "pending",
        mutation: false,
        nextAction: "complete_data_plane_handoff"
      }))
    ],
    redacted: true
  });
  const exactRollbackNotification = {
    ok: true,
    notificationCount: pendingChannelRefs.length,
    notifications: pendingChannelRefs.map((channelRef) => (
      pendingDesiredStateNotification(channelRef)
    )),
    redacted: true
  };
  let rollbackNotificationOrder;
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_mixed_presave_binding_failure_1",
    refreshLifecycleResult: mixedFanoutResult(),
    rollbackLifecycleResult: mixedFanoutResult(),
    rollbackNotificationResult({ input }) {
      rollbackNotificationOrder = input.order;
      return exactRollbackNotification;
    },
    runtimeCore: {
      bindTenantCredentialMaterial({ material }) {
        if (material.uuid.endsWith("000000000002")) {
          throw Object.assign(new Error("synthetic binding failure"), { code: "binding_failed" });
        }
        return { ok: true };
      }
    },
    tenantId: "tenant_runtime_1"
  });
  const [before] = harness.requests.listEdgeCredentialOrders();
  const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  let observedError;

  try {
    harness.requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: "pareq_refresh_mixed_presave_binding_failure_1",
      clientTarget: "karing"
    });
  } catch (error) {
    observedError = error;
  }

  const [after] = harness.requests.listEdgeCredentialOrders();
  const restored = harness.requests.getRequest("pareq_refresh_mixed_presave_binding_failure_1");
  const rollbackNotificationCalls = harness.notificationCalls.filter(
    ({ reason }) => reason === "order_refresh_rolled_back"
  );
  assert.equal(after.edgeCredentialRef, before.edgeCredentialRef);
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(
    harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest,
    beforeMaterial.materialDigest
  );
  assert.equal(restored.clientTarget, "clash");
  assert.equal(restored.event, null);
  assert.deepEqual({
    errorCode: observedError?.code,
    rollbackNotificationCallCount: rollbackNotificationCalls.length,
    rollbackPendingNotificationCount: rollbackNotificationCalls.length
      ? exactRollbackNotification.notificationCount
      : 0
  }, {
    errorCode: "binding_failed",
    rollbackNotificationCallCount: 1,
    rollbackPendingNotificationCount: pendingChannelRefs.length
  });
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.deepEqual(harness.notificationCalls.map(({ reason }) => reason), [
    "order_refresh_rolled_back"
  ]);
  assert.equal(rollbackNotificationOrder.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.equal(exactRollbackNotification.notificationCount, pendingChannelRefs.length);
  assert.ok(exactRollbackNotification.notifications.every(({ status }) => status === "pending"));
  assert.equal(
    new Set(exactRollbackNotification.notifications.map(({ channelRef }) => channelRef)).size,
    pendingChannelRefs.length
  );
  assert.deepEqual(
    exactRollbackNotification.notifications.map(({ channelRef }) => channelRef).sort(),
    [...pendingChannelRefs].sort()
  );
});

test("refresh rejects a matching remote notification whose recorded status is failed", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_failed_notification_status_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef: "channel-aliyun-a-tuic",
      mutation: false,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    },
    refreshNotificationResult: {
      ok: true,
      notificationCount: 1,
      notifications: [pendingDesiredStateNotification("channel-aliyun-a-tuic", { status: "failed" })],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_failed_notification_status_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, ["order_delivered", "order_refreshed", "order_refresh_rolled_back"]);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh rejects remote notification counts that disagree with the notification array", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_notification_count_mismatch_1",
    refreshLifecycleResult: {
      ok: true,
      channelRef: "channel-aliyun-a-tuic",
      mutation: false,
      runtimeReceipt: { status: "pending" },
      nextAction: "complete_data_plane_handoff",
      redacted: true
    },
    refreshNotificationResult: {
      ok: true,
      notificationCount: 2,
      notifications: [pendingDesiredStateNotification("channel-aliyun-a-tuic")],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_notification_count_mismatch_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, ["order_delivered", "order_refreshed", "order_refresh_rolled_back"]);
  assert.deepEqual(harness.notificationCalls.map((call) => call.reason), [
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh rejects duplicate fanout channels with conflicting applied and pending evidence", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_duplicate_conflicting_channel_1",
    refreshLifecycleResult: {
      ok: true,
      mutation: true,
      reports: [
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "applied",
          mutation: true,
          nextAction: "validate_runtime_state"
        },
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        }
      ],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_duplicate_conflicting_channel_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
  assert.deepEqual(
    harness.notificationCalls.map(({ reason }) => reason),
    ["order_refresh_rolled_back"]
  );
});

test("refresh compensates identified pending fanout despite duplicate or ambiguous siblings", () => {
  const pendingReport = {
    channelRef: "channel-aliyun-a-tuic",
    ok: true,
    runtimeStatus: "pending",
    mutation: false,
    nextAction: "complete_data_plane_handoff"
  };
  const ambiguousReport = {
    channelRef: "channel-sgp-a-hy2",
    ok: true,
    runtimeStatus: "pending",
    mutation: false,
    nextAction: "review_apply_gate"
  };
  const scenarios = [
    { name: "duplicate", reports: [pendingReport, pendingReport] },
    { name: "pending-first", reports: [pendingReport, ambiguousReport] },
    { name: "ambiguous-first", reports: [ambiguousReport, pendingReport] }
  ];

  const observations = scenarios.map(({ name, reports }) => {
    const requestId = `pareq_refresh_pending_fanout_${name}`;
    const harness = refreshStateMachineHarness({
      requestId,
      refreshLifecycleResult: {
        ok: true,
        mutation: false,
        reports,
        redacted: true
      }
    });
    const [before] = harness.requests.listEdgeCredentialOrders();
    const beforeRequest = harness.requests.getRequest(requestId);
    let errorCode = "none";

    try {
      harness.requests.refreshSubscription({
        portalUserRef: "user_safe_ref",
        requestRef: requestId,
        clientTarget: "karing"
      });
    } catch (error) {
      errorCode = error?.code || "unknown";
    }

    const [after] = harness.requests.listEdgeCredentialOrders();
    const restored = harness.requests.getRequest(requestId);
    return {
      name,
      errorCode,
      lifecycleReasons: harness.lifecycleReasons,
      notificationReasons: harness.notificationCalls.map(({ reason }) => reason),
      stateRestored: (
        after.edgeMaterialDigest === before.edgeMaterialDigest
        && restored.clientTarget === beforeRequest.clientTarget
        && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
      )
    };
  });

  assert.deepEqual(observations, scenarios.map(({ name }) => ({
    name,
    errorCode: "subscription_refresh_runtime_enforcement_pending",
    lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
    notificationReasons: ["order_refresh_rolled_back"],
    stateRestored: true
  })));
});

test("refresh compensates direct remote pending evidence despite incomplete top-level success", () => {
  const scenarios = [
    { name: "missing-ok", topLevel: {}, expectedError: "subscription_refresh_runtime_enforcement_pending" },
    { name: "false-ok", topLevel: { ok: false }, expectedError: "edge_lifecycle_failed" }
  ];

  const observations = scenarios.map(({ name, topLevel }) => {
    const requestId = `pareq_refresh_pending_${name}`;
    const harness = refreshStateMachineHarness({
      requestId,
      refreshLifecycleResult: {
        ...topLevel,
        channelRef: "channel-aliyun-a-tuic",
        mutation: false,
        runtimeReceipt: { status: "pending" },
        nextAction: "complete_data_plane_handoff",
        redacted: true
      }
    });
    const [before] = harness.requests.listEdgeCredentialOrders();
    const beforeRequest = harness.requests.getRequest(requestId);
    let errorCode = "none";

    try {
      harness.requests.refreshSubscription({
        portalUserRef: "user_safe_ref",
        requestRef: requestId,
        clientTarget: "karing"
      });
    } catch (error) {
      errorCode = error?.code || "unknown";
    }

    const [after] = harness.requests.listEdgeCredentialOrders();
    const restored = harness.requests.getRequest(requestId);
    return {
      name,
      errorCode,
      lifecycleReasons: harness.lifecycleReasons,
      notificationReasons: harness.notificationCalls.map(({ reason }) => reason),
      stateRestored: (
        after.edgeMaterialDigest === before.edgeMaterialDigest
        && restored.clientTarget === beforeRequest.clientTarget
        && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
      )
    };
  });

  assert.deepEqual(observations, scenarios.map(({ name, expectedError }) => ({
    name,
    errorCode: expectedError,
    lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
    notificationReasons: ["order_refresh_rolled_back"],
    stateRestored: true
  })));
});

test("refresh rejects fanout evidence without explicit top-level success and compensates child mutation", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_fanout_without_top_ok_1",
    refreshLifecycleResult: {
      mutation: true,
      reports: [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          ok: true,
          runtimeStatus: "applied",
          mutation: true,
          nextAction: "validate_runtime_state"
        },
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        }
      ],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_fanout_without_top_ok_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(
    harness.notificationCalls.map(({ reason }) => reason),
    ["order_refresh_rolled_back"]
  );
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh rejects conflicting direct receipt and fanout evidence before commit", () => {
  const harness = refreshStateMachineHarness({
    requestId: "pareq_refresh_direct_and_fanout_conflict_1",
    refreshLifecycleResult: {
      ok: true,
      mutation: true,
      runtimeReceipt: { status: "applied" },
      reports: [
        {
          channelRef: "channel-vultr-a-vless-reality-tcp",
          ok: true,
          runtimeStatus: "applied",
          mutation: true,
          nextAction: "validate_runtime_state"
        },
        {
          channelRef: "channel-aliyun-a-tuic",
          ok: true,
          runtimeStatus: "pending",
          mutation: false,
          nextAction: "complete_data_plane_handoff"
        }
      ],
      redacted: true
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();

  assert.throws(() => harness.requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_direct_and_fanout_conflict_1"
  }), { code: "subscription_refresh_runtime_enforcement_pending" });

  const [after] = harness.requests.listEdgeCredentialOrders();
  assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
  assert.deepEqual(
    harness.notificationCalls.map(({ reason }) => reason),
    ["order_refresh_rolled_back"]
  );
  assert.deepEqual(harness.lifecycleReasons, [
    "order_delivered",
    "order_refreshed",
    "order_refresh_rolled_back"
  ]);
});

test("refresh fails closed for fanout reports with ambiguous pending authority", () => {
  const scenarios = [
    {
      requestId: "pareq_refresh_fanout_missing_status_1",
      reports: [{
        channelRef: "channel-sgp-a-hy2",
        ok: true,
        mutation: false,
        nextAction: "complete_data_plane_handoff"
      }]
    },
    {
      requestId: "pareq_refresh_fanout_wrong_action_1",
      reports: [{
        channelRef: "channel-sgp-a-hy2",
        ok: true,
        runtimeStatus: "pending",
        mutation: false,
        nextAction: "review_apply_gate"
      }]
    }
  ];

  for (const scenario of scenarios) {
    const harness = refreshStateMachineHarness({
      requestId: scenario.requestId,
      refreshLifecycleResult: {
        ok: true,
        mutation: false,
        reports: scenario.reports,
        redacted: true
      }
    });
    const [before] = harness.requests.listEdgeCredentialOrders();

    assert.throws(() => harness.requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: scenario.requestId
    }), { code: "subscription_refresh_runtime_enforcement_pending" });

    const [after] = harness.requests.listEdgeCredentialOrders();
    assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
    assert.equal(harness.notificationCalls.length, 0);
  }
});

test("refresh compensates runtime and restores active state when post-apply tenant binding fails", () => {
  const channelRef = "channel-aliyun-a-tuic";
  const materialStore = edgeMaterialStore();
  const desiredStateStore = desiredStateAuthorityStore();
  let sequence = 0;
  let previousBindingAttempts = 0;
  const lifecycleReasons = [];
  const notificationCalls = [];
  const issuer = createOrderEdgeCredentialIssuer({
    channelRef,
    materialStore,
    uuidFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    passwordFactory: () => `password-${sequence}`
  });
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_refresh_compensate_1",
    edgeCredentialIssuer: issuer,
    controlStore: desiredStateStore,
    runtimeCore: {
      bindTenantCredentialMaterial({ material }) {
        if (material.uuid.endsWith("000000000002")) {
          throw Object.assign(new Error("synthetic binding failure"), { code: "binding_failed" });
        }
        if (material.uuid.endsWith("000000000001")) {
          previousBindingAttempts += 1;
          if (previousBindingAttempts > 1) {
            throw Object.assign(new Error("synthetic tenant restore failure"), { code: "tenant_restore_failed" });
          }
        }
        return { ok: true };
      }
    },
    edgeLifecycleService: {
      reconcileOrderLifecycle({ reason }) {
        lifecycleReasons.push(reason);
        if (reason === "order_refresh_rolled_back") {
          return {
            ok: true,
            channelRef,
            mutation: false,
            runtimeReceipt: { status: "pending" },
            nextAction: "complete_data_plane_handoff",
            redacted: true
          };
        }
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: { status: "applied" },
          redacted: true
        };
      }
    },
    edgeDesiredStateNotifier: {
      notifyOrderLifecycle(input) {
        notificationCalls.push(input);
        return {
          ok: true,
          notificationCount: 1,
          notifications: [pendingDesiredStateNotification(channelRef)],
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
  notificationCalls.length = 0;
  desiredStateStore.reads.length = 0;
  const [before] = requests.listEdgeCredentialOrders();

  assert.throws(() => requests.refreshSubscription({
    portalUserRef: "user_safe_ref",
    requestRef: "pareq_refresh_compensate_1"
  }), { code: "subscription_refresh_rollback_failed" });

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
  assert.equal(previousBindingAttempts, 2);
  assert.deepEqual(notificationCalls.map(({ reason }) => reason), [
    "order_refresh_rolled_back"
  ]);
  const expectedPendingIdentity = authoritativeDesiredStateIdentity(channelRef);
  assert.deepEqual(desiredStateStore.reads, [{
    channelRef,
    nodeRef: expectedPendingIdentity.nodeRef,
    channelRefs: [channelRef]
  }]);
});

test("refresh compensates direct remote pending handoffs across candidate persistence failures", () => {
  const channelRef = "channel-aliyun-a-tuic";
  const scenarios = [
    {
      name: "pre-save-binding-failure",
      expectedError: "binding_failed",
      failCandidateBinding: true,
      expectedNotificationReasons: ["order_refresh_rolled_back"]
    },
    {
      name: "post-save-notification-failure",
      expectedError: "subscription_refresh_runtime_enforcement_pending",
      failCandidateBinding: false,
      expectedNotificationReasons: ["order_refreshed", "order_refresh_rolled_back"]
    }
  ];

  for (const scenario of scenarios) {
    const requestId = `pareq_refresh_direct_pending_${scenario.name}`;
    const materialStore = edgeMaterialStore();
    const lifecycleReasons = [];
    const notificationCalls = [];
    let sequence = 0;
    const rollbackNotificationResult = {
      ok: true,
      notificationCount: 1,
      notifications: [pendingDesiredStateNotification(channelRef)],
      redacted: true
    };
    const runtimeCore = scenario.failCandidateBinding ? {
      bindTenantCredentialMaterial({ material }) {
        if (material.uuid.endsWith("000000000002")) {
          throw Object.assign(new Error("synthetic binding failure"), { code: "binding_failed" });
        }
        return { ok: true };
      }
    } : null;
    const requests = createPortalAccessRequestService({
      nowFn: () => NOW,
      requestIdFactory: () => requestId,
      edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
        channelRef,
        materialStore,
        uuidFactory: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
        passwordFactory: () => `password-${sequence}`
      }),
      controlStore: desiredStateAuthorityStore(),
      edgeLifecycleService: {
        reconcileOrderLifecycle({ reason }) {
          lifecycleReasons.push(reason);
          if (reason === "order_delivered") {
            return {
              ok: true,
              mutation: true,
              runtimeReceipt: { status: "applied" },
              redacted: true
            };
          }
          return {
            ok: true,
            channelRef,
            mutation: false,
            runtimeReceipt: { status: "pending" },
            nextAction: "complete_data_plane_handoff",
            redacted: true
          };
        }
      },
      edgeDesiredStateNotifier: {
        notifyOrderLifecycle(input) {
          notificationCalls.push(input);
          if (input.reason === "order_refreshed") {
            return {
              ok: true,
              notificationCount: 0,
              notifications: [],
              redacted: true
            };
          }
          return rollbackNotificationResult;
        }
      },
      ...(runtimeCore ? { runtimeCore } : {})
    });
    requests.submitRequest(validTrialInput());
    requests.markDelivered(requestId, {
      reviewedByRef: "operator_safe_ref",
      entitlementRef: "ent_safe_ref",
      accessGrantRef: "grant_safe_ref",
      tenantId: `tenant_${scenario.name}`,
      artifactId: "artifact_runtime_1",
      subscriptionUrl: "https://sub.example.test/import/original-visible-once",
      expiresAt: "2026-06-07T00:00:00.000Z"
    });
    notificationCalls.length = 0;

    const [before] = requests.listEdgeCredentialOrders();
    const beforeMaterial = materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
    const beforeRequest = requests.getRequest(requestId);
    let thrownError;
    try {
      requests.refreshSubscription({
        portalUserRef: "user_safe_ref",
        requestRef: requestId,
        clientTarget: "karing"
      });
      assert.fail("refresh should preserve the original failure after compensation");
    } catch (error) {
      thrownError = error;
    }

    assert.deepEqual(lifecycleReasons, [
      "order_delivered",
      "order_refreshed",
      "order_refresh_rolled_back"
    ]);
    assert.deepEqual(
      notificationCalls.map((call) => call.reason),
      scenario.expectedNotificationReasons
    );
    assert.equal(thrownError?.code, scenario.expectedError);
    assert.equal(rollbackNotificationResult.notificationCount, 1);
    assert.deepEqual(rollbackNotificationResult.notifications, [
      pendingDesiredStateNotification(channelRef)
    ]);

    const [after] = requests.listEdgeCredentialOrders();
    const restored = requests.getRequest(requestId);
    assert.equal(after.edgeCredentialRef, before.edgeCredentialRef);
    assert.equal(after.edgeMaterialDigest, before.edgeMaterialDigest);
    assert.equal(
      materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest,
      beforeMaterial.materialDigest
    );
    assert.equal(restored.clientTarget, beforeRequest.clientTarget);
    assert.deepEqual(restored.event, beforeRequest.event);
  }
});

test("refresh compensates pending fanout children when a sibling fails without mutation", () => {
  const pendingChannelRef = "channel-aliyun-a-tuic";
  const failedChannelRef = "channel-sgp-a-hy2";
  const pendingReport = {
    channelRef: pendingChannelRef,
    ok: true,
    runtimeStatus: "pending",
    mutation: false,
    nextAction: "complete_data_plane_handoff"
  };
  const failedReport = {
    channelRef: failedChannelRef,
    ok: false,
    runtimeStatus: "failed",
    mutation: false,
    nextAction: "review_runtime_apply_receipt"
  };
  const ambiguousReport = {
    channelRef: failedChannelRef,
    ok: true,
    runtimeStatus: "pending",
    mutation: false,
    nextAction: "review_apply_gate"
  };
  const rollbackPendingResult = {
    ok: true,
    channelRef: pendingChannelRef,
    mutation: false,
    runtimeReceipt: { status: "pending" },
    nextAction: "complete_data_plane_handoff",
    redacted: true
  };
  const rollbackAppliedSiblingResult = {
    ok: true,
    channelRef: failedChannelRef,
    mutation: true,
    runtimeReceipt: { status: "applied" },
    redacted: true
  };
  const exactRollbackNotification = {
    ok: true,
    notificationCount: 1,
    notifications: [pendingDesiredStateNotification(pendingChannelRef)],
    redacted: true
  };
  const expectedPendingIdentity = authoritativeDesiredStateIdentity(pendingChannelRef);

  function observe({
    name,
    reports,
    rollbackLifecycleResult,
    rollbackNotificationResult,
    verifyForwardPendingCoverage = false
  }) {
    const requestId = `pareq_refresh_failed_pending_${name}`;
    const harness = refreshStateMachineHarness({
      requestId,
      refreshLifecycleResult: {
        ok: false,
        mutation: false,
        reports,
        redacted: true
      },
      rollbackLifecycleResult,
      rollbackNotificationResult
    });
    const [before] = harness.requests.listEdgeCredentialOrders();
    const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
    const beforeRequest = harness.requests.getRequest(requestId);
    let errorCode = "none";

    try {
      harness.requests.refreshSubscription({
        portalUserRef: "user_safe_ref",
        requestRef: requestId,
        clientTarget: "karing"
      });
    } catch (error) {
      errorCode = error?.code || "unknown";
    }

    const [after] = harness.requests.listEdgeCredentialOrders();
    const restored = harness.requests.getRequest(requestId);
    const observation = {
      errorCode,
      lifecycleReasons: harness.lifecycleReasons,
      notificationReasons: harness.notificationCalls.map(({ reason }) => reason),
      stateRestored: (
        after.edgeCredentialRef === before.edgeCredentialRef
        && after.edgeMaterialDigest === before.edgeMaterialDigest
        && harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest
          === beforeMaterial.materialDigest
        && restored.clientTarget === beforeRequest.clientTarget
        && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
      )
    };
    if (!verifyForwardPendingCoverage) return observation;

    const rollbackNotifications = Array.isArray(rollbackNotificationResult?.notifications)
      ? rollbackNotificationResult.notifications
      : [];
    return {
      ...observation,
      rollbackNotificationCoverage: {
        callCount: harness.notificationCalls.filter(
          ({ reason }) => reason === "order_refresh_rolled_back"
        ).length,
        notificationCount: rollbackNotificationResult?.notificationCount,
        notificationArrayCount: rollbackNotifications.length,
        channelRefs: rollbackNotifications.map(({ channelRef }) => channelRef),
        uniqueChannelCount: new Set(
          rollbackNotifications.map(({ channelRef }) => channelRef)
        ).size,
        statuses: rollbackNotifications.map(({ status }) => status),
        nodeRefs: rollbackNotifications.map(({ nodeRef }) => nodeRef),
        desiredStateRefs: rollbackNotifications.map(({ desiredStateRef }) => desiredStateRef),
        generations: rollbackNotifications.map(({ generation }) => generation),
        authorityReads: harness.desiredStateStore.reads
      }
    };
  }

  const observations = [
    { name: "pending-first", reports: [pendingReport, failedReport] },
    { name: "failed-first", reports: [failedReport, pendingReport] }
  ].map(({ name, reports }) => ({
    name,
    compensated: observe({
      name: `${name}_compensated`,
      reports,
      rollbackLifecycleResult: rollbackPendingResult,
      rollbackNotificationResult: exactRollbackNotification
    }),
    rollbackAppliedOnlyToSibling: observe({
      name: `${name}_rollback_applied_only_to_sibling`,
      reports,
      rollbackLifecycleResult: rollbackAppliedSiblingResult,
      rollbackNotificationResult: exactRollbackNotification,
      verifyForwardPendingCoverage: true
    }),
    rollbackLifecycleFailed: observe({
      name: `${name}_rollback_lifecycle_failed`,
      reports,
      rollbackLifecycleResult: {
        ok: false,
        mutation: false,
        runtimeReceipt: { status: "failed" },
        redacted: true
      },
      rollbackNotificationResult: exactRollbackNotification,
      verifyForwardPendingCoverage: true
    }),
    rollbackLifecycleThrows: observe({
      name: `${name}_rollback_lifecycle_throws`,
      reports,
      rollbackLifecycleResult() {
        throw new Error("synthetic rollback lifecycle failure");
      },
      rollbackNotificationResult: exactRollbackNotification,
      verifyForwardPendingCoverage: true
    }),
    rollbackNotificationIncomplete: observe({
      name: `${name}_rollback_notification_incomplete`,
      reports,
      rollbackLifecycleResult: rollbackPendingResult,
      rollbackNotificationResult: {
        ok: true,
        notificationCount: 0,
        notifications: [],
        redacted: true
      }
    }),
    malformedRollbackEvidence: [
      {
        name: "failed-pending-first",
        result: {
          ok: false,
          mutation: false,
          reports: [pendingReport, failedReport],
          redacted: true
        }
      },
      {
        name: "failed-failed-first",
        result: {
          ok: false,
          mutation: false,
          reports: [failedReport, pendingReport],
          redacted: true
        }
      },
      {
        name: "unavailable-pending-first",
        result: {
          ok: true,
          mutation: false,
          reports: [pendingReport, ambiguousReport],
          redacted: true
        }
      },
      {
        name: "unavailable-ambiguous-first",
        result: {
          ok: true,
          mutation: false,
          reports: [ambiguousReport, pendingReport],
          redacted: true
        }
      }
    ].map((scenario) => ({
      name: scenario.name,
      observation: observe({
        name: `${name}_${scenario.name}`,
        reports,
        rollbackLifecycleResult: scenario.result,
        rollbackNotificationResult: exactRollbackNotification
      })
    }))
  }));

  assert.deepEqual(observations, ["pending-first", "failed-first"].map((name) => ({
    name,
    compensated: {
      errorCode: "edge_lifecycle_failed",
      lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
      notificationReasons: ["order_refresh_rolled_back"],
      stateRestored: true
    },
    rollbackAppliedOnlyToSibling: {
      errorCode: "edge_lifecycle_failed",
      lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
      notificationReasons: ["order_refresh_rolled_back"],
      stateRestored: true,
      rollbackNotificationCoverage: {
        callCount: 1,
        notificationCount: 1,
        notificationArrayCount: 1,
        channelRefs: [pendingChannelRef],
        uniqueChannelCount: 1,
        statuses: ["pending"],
        nodeRefs: [expectedPendingIdentity.nodeRef],
        desiredStateRefs: [expectedPendingIdentity.desiredStateRef],
        generations: [expectedPendingIdentity.generation],
        authorityReads: [{
          channelRef: pendingChannelRef,
          nodeRef: expectedPendingIdentity.nodeRef,
          channelRefs: [pendingChannelRef]
        }]
      }
    },
    rollbackLifecycleFailed: {
      errorCode: "subscription_refresh_rollback_failed",
      lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
      notificationReasons: ["order_refresh_rolled_back"],
      stateRestored: true,
      rollbackNotificationCoverage: {
        callCount: 1,
        notificationCount: 1,
        notificationArrayCount: 1,
        channelRefs: [pendingChannelRef],
        uniqueChannelCount: 1,
        statuses: ["pending"],
        nodeRefs: [expectedPendingIdentity.nodeRef],
        desiredStateRefs: [expectedPendingIdentity.desiredStateRef],
        generations: [expectedPendingIdentity.generation],
        authorityReads: [{
          channelRef: pendingChannelRef,
          nodeRef: expectedPendingIdentity.nodeRef,
          channelRefs: [pendingChannelRef]
        }]
      }
    },
    rollbackLifecycleThrows: {
      errorCode: "subscription_refresh_rollback_failed",
      lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
      notificationReasons: ["order_refresh_rolled_back"],
      stateRestored: true,
      rollbackNotificationCoverage: {
        callCount: 1,
        notificationCount: 1,
        notificationArrayCount: 1,
        channelRefs: [pendingChannelRef],
        uniqueChannelCount: 1,
        statuses: ["pending"],
        nodeRefs: [expectedPendingIdentity.nodeRef],
        desiredStateRefs: [expectedPendingIdentity.desiredStateRef],
        generations: [expectedPendingIdentity.generation],
        authorityReads: [{
          channelRef: pendingChannelRef,
          nodeRef: expectedPendingIdentity.nodeRef,
          channelRefs: [pendingChannelRef]
        }]
      }
    },
    rollbackNotificationIncomplete: {
      errorCode: "subscription_refresh_rollback_failed",
      lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
      notificationReasons: ["order_refresh_rolled_back"],
      stateRestored: true
    },
    malformedRollbackEvidence: [
      "failed-pending-first",
      "failed-failed-first",
      "unavailable-pending-first",
      "unavailable-ambiguous-first"
    ].map((scenarioName) => ({
      name: scenarioName,
      observation: {
        errorCode: "subscription_refresh_rollback_failed",
        lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
        notificationReasons: ["order_refresh_rolled_back"],
        stateRestored: true
      }
    }))
  })));
});

test("refresh notifies pending rollback children before rejecting a failed rollback fanout", () => {
  const pendingChannelRef = "channel-aliyun-a-tuic";
  const pendingReport = {
    channelRef: pendingChannelRef,
    ok: true,
    runtimeStatus: "pending",
    mutation: false,
    nextAction: "complete_data_plane_handoff"
  };
  const failedReport = {
    channelRef: "channel-sgp-a-hy2",
    ok: false,
    runtimeStatus: "failed",
    mutation: false,
    nextAction: "review_runtime_apply_receipt"
  };
  const exactRollbackNotification = {
    ok: true,
    notificationCount: 1,
    notifications: [pendingDesiredStateNotification(pendingChannelRef)],
    redacted: true
  };

  const observations = [
    { name: "pending-first", reports: [pendingReport, failedReport] },
    { name: "failed-first", reports: [failedReport, pendingReport] }
  ].map(({ name, reports }) => {
    const requestId = `pareq_refresh_failed_rollback_pending_${name}`;
    let rollbackNotificationOrder;
    const harness = refreshStateMachineHarness({
      requestId,
      refreshLifecycleResult: {
        ok: true,
        channelRef: pendingChannelRef,
        mutation: false,
        runtimeReceipt: { status: "pending" },
        nextAction: "complete_data_plane_handoff",
        redacted: true
      },
      refreshNotificationResult: {
        ok: true,
        notificationCount: 0,
        notifications: [],
        redacted: true
      },
      rollbackLifecycleResult: {
        ok: false,
        mutation: false,
        reports,
        redacted: true
      },
      rollbackNotificationResult({ input }) {
        rollbackNotificationOrder = input.order;
        return exactRollbackNotification;
      }
    });
    const [before] = harness.requests.listEdgeCredentialOrders();
    const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
    const beforeRequest = harness.requests.getRequest(requestId);
    let errorCode = "none";

    try {
      harness.requests.refreshSubscription({
        portalUserRef: "user_safe_ref",
        requestRef: requestId,
        clientTarget: "karing"
      });
    } catch (error) {
      errorCode = error?.code || "unknown";
    }

    const [after] = harness.requests.listEdgeCredentialOrders();
    const restored = harness.requests.getRequest(requestId);
    return {
      name,
      errorCode,
      lifecycleReasons: harness.lifecycleReasons,
      notificationReasons: harness.notificationCalls.map(({ reason }) => reason),
      rollbackNotificationCount: harness.notificationCalls.filter(
        ({ reason }) => reason === "order_refresh_rolled_back"
      ).length,
      rollbackNotificationHasExactPendingCoverage: (
        exactRollbackNotification.notificationCount === 1
        && exactRollbackNotification.notifications.length === 1
        && exactRollbackNotification.notifications[0].channelRef === pendingChannelRef
        && exactRollbackNotification.notifications[0].status === "pending"
      ),
      rollbackNotificationUsesRestoredOrder: (
        rollbackNotificationOrder?.edgeMaterialDigest === before.edgeMaterialDigest
      ),
      stateRestored: (
        after.edgeCredentialRef === before.edgeCredentialRef
        && after.edgeMaterialDigest === before.edgeMaterialDigest
        && harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest
          === beforeMaterial.materialDigest
        && restored.clientTarget === beforeRequest.clientTarget
        && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
      )
    };
  });

  assert.deepEqual(observations, ["pending-first", "failed-first"].map((name) => ({
    name,
    errorCode: "subscription_refresh_rollback_failed",
    lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
    notificationReasons: ["order_refreshed", "order_refresh_rolled_back"],
    rollbackNotificationCount: 1,
    rollbackNotificationHasExactPendingCoverage: true,
    rollbackNotificationUsesRestoredOrder: true,
    stateRestored: true
  })));
});

test("refresh attempts restored desired-state notification before rejecting a failed rollback", () => {
  const channelRefs = ["channel-aliyun-a-tuic", "channel-sgp-a-hy2"];
  const candidateNotificationWrites = [];
  const rollbackNotificationWrites = [];
  let rollbackNotificationOrder;
  const requestId = "pareq_refresh_partial_notification_failed_rollback";
  const harness = refreshStateMachineHarness({
    requestId,
    refreshLifecycleResult: {
      ok: true,
      mutation: true,
      runtimeReceipt: { status: "applied" },
      redacted: true
    },
    refreshNotificationResult({ input }) {
      for (const channelRef of channelRefs) {
        if (candidateNotificationWrites.length > 0) {
          throw Object.assign(new Error("synthetic later-channel notification failure"), {
            code: "edge_desired_state_notification_failed"
          });
        }
        candidateNotificationWrites.push({ reason: input.reason, channelRef });
      }
      return null;
    },
    rollbackLifecycleResult: {
      ok: false,
      mutation: false,
      runtimeReceipt: { status: "failed" },
      redacted: true
    },
    rollbackNotificationResult({ input }) {
      rollbackNotificationOrder = input.order;
      rollbackNotificationWrites.push(...channelRefs.map((channelRef) => ({
        reason: input.reason,
        channelRef
      })));
      return {
        ok: true,
        notificationCount: channelRefs.length,
        notifications: channelRefs.map((channelRef) => pendingDesiredStateNotification(channelRef)),
        redacted: true
      };
    }
  });
  const [before] = harness.requests.listEdgeCredentialOrders();
  const beforeMaterial = harness.materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  const beforeRequest = harness.requests.getRequest(requestId);
  let errorCode = "none";

  try {
    harness.requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: requestId,
      clientTarget: "karing"
    });
  } catch (error) {
    errorCode = error?.code || "unknown";
  }

  const [after] = harness.requests.listEdgeCredentialOrders();
  const restored = harness.requests.getRequest(requestId);
  assert.deepEqual({
    errorCode,
    lifecycleReasons: harness.lifecycleReasons,
    notificationReasons: harness.notificationCalls.map(({ reason }) => reason),
    rollbackNotificationCount: harness.notificationCalls.filter(
      ({ reason }) => reason === "order_refresh_rolled_back"
    ).length,
    candidateNotificationWrites,
    rollbackNotificationWrites,
    rollbackNotificationUsesRestoredOrder: (
      rollbackNotificationOrder?.edgeMaterialDigest === before.edgeMaterialDigest
    ),
    stateRestored: (
      after.edgeCredentialRef === before.edgeCredentialRef
      && after.edgeMaterialDigest === before.edgeMaterialDigest
      && harness.materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest
        === beforeMaterial.materialDigest
      && restored.clientTarget === beforeRequest.clientTarget
      && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
    )
  }, {
    errorCode: "subscription_refresh_rollback_failed",
    lifecycleReasons: ["order_delivered", "order_refreshed", "order_refresh_rolled_back"],
    notificationReasons: ["order_refreshed", "order_refresh_rolled_back"],
    rollbackNotificationCount: 1,
    candidateNotificationWrites: [
      { reason: "order_refreshed", channelRef: "channel-aliyun-a-tuic" }
    ],
    rollbackNotificationWrites: channelRefs.map((channelRef) => ({
      reason: "order_refresh_rolled_back",
      channelRef
    })),
    rollbackNotificationUsesRestoredOrder: true,
    stateRestored: true
  });
});

test("refresh compensates a real lifecycle receipt failure after the remote handoff", () => {
  const channelRef = "channel-sgp-a-hy2";
  const materialStore = edgeMaterialStore();
  const notificationCalls = [];
  const refreshAdapterAttempts = [];
  let credentialSequence = 0;
  let adapterSequence = 0;
  let receiptSequence = 0;
  let receiptWriteCount = 0;
  let captureRefreshAttempts = false;
  let rollbackNotificationOrder;
  let requests;
  const lifecycleService = createOrderCredentialLifecycleService({
    channelRef,
    runtime: "hysteria2",
    nowFn: () => NOW,
    executeProductionMutation: true,
    listOrders: () => requests?.listEdgeCredentialOrders() || [],
    listCurrentCredentials: () => [],
    runtimeAdapter: {
      applyCredentialReconciliation() {
        adapterSequence += 1;
        if (captureRefreshAttempts) {
          refreshAdapterAttempts.push(adapterSequence);
        }
        return {
          status: "pending",
          mutation: false,
          handoffRef: `handoff_channel-sgp-a-hy2_${adapterSequence}`,
          service: {
            name: "remote-data-plane-handoff",
            active: false,
            restarted: false
          },
          listener: {
            udp443: false
          },
          appliedAt: NOW
        };
      }
    },
    receiptStore: {
      recordEdgeApplyReceipt(receipt) {
        receiptWriteCount += 1;
        if (receiptWriteCount === 2) {
          throw Object.assign(new Error("synthetic apply receipt persistence failure"), {
            code: "receipt_write_failed"
          });
        }
        return receipt;
      }
    },
    receiptIdFactory: () => `edge_receipt_post_adapter_${++receiptSequence}`,
    desiredStateRefFactory: () => `desired_state_post_adapter_${receiptSequence + 1}`
  });

  requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_refresh_post_adapter_receipt_failure",
    edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
      channelRef,
      materialStore,
      uuidFactory: () => `00000000-0000-4000-8000-${String(++credentialSequence).padStart(12, "0")}`,
      passwordFactory: () => `synthetic-receipt-failure-password-${credentialSequence}`
    }),
    controlStore: desiredStateAuthorityStore(),
    edgeLifecycleService: lifecycleService,
    edgeDesiredStateNotifier: {
      notifyOrderLifecycle(input) {
        notificationCalls.push(input);
        if (input.reason === "order_refresh_rolled_back") {
          rollbackNotificationOrder = input.order;
        }
        return {
          ok: true,
          notificationCount: 1,
          notifications: [pendingDesiredStateNotification(channelRef)],
          redacted: true
        };
      }
    }
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_refresh_post_adapter_receipt_failure", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  notificationCalls.length = 0;
  captureRefreshAttempts = true;

  const [before] = requests.listEdgeCredentialOrders();
  const beforeMaterial = materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  const beforeRequest = requests.getRequest("pareq_refresh_post_adapter_receipt_failure");
  let errorCode = "none";

  try {
    requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: "pareq_refresh_post_adapter_receipt_failure",
      clientTarget: "karing"
    });
  } catch (error) {
    errorCode = error?.code || "unknown";
  }

  const [after] = requests.listEdgeCredentialOrders();
  const restored = requests.getRequest("pareq_refresh_post_adapter_receipt_failure");
  assert.deepEqual({
    errorCode,
    refreshAdapterAttempts,
    receiptWriteCount,
    notificationReasons: notificationCalls.map(({ reason }) => reason),
    rollbackNotificationCount: notificationCalls.filter(
      ({ reason }) => reason === "order_refresh_rolled_back"
    ).length,
    rollbackNotificationUsesRestoredOrder: (
      rollbackNotificationOrder?.edgeMaterialDigest === before.edgeMaterialDigest
    ),
    stateRestored: (
      after.edgeCredentialRef === before.edgeCredentialRef
      && after.edgeMaterialDigest === before.edgeMaterialDigest
      && materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest
        === beforeMaterial.materialDigest
      && restored.clientTarget === beforeRequest.clientTarget
      && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
    )
  }, {
    errorCode: "receipt_write_failed",
    refreshAdapterAttempts: [2, 3],
    receiptWriteCount: 3,
    notificationReasons: ["order_refresh_rolled_back"],
    rollbackNotificationCount: 1,
    rollbackNotificationUsesRestoredOrder: true,
    stateRestored: true
  });
});

test("refresh attempts restored-state notification when rollback receipt persistence fails after handoff", () => {
  const channelRef = "channel-sgp-a-hy2";
  const materialStore = edgeMaterialStore();
  const notificationCalls = [];
  const refreshAdapterAttempts = [];
  let credentialSequence = 0;
  let adapterSequence = 0;
  let receiptSequence = 0;
  let receiptWriteCount = 0;
  let captureRefreshAttempts = false;
  let rollbackNotificationOrder;
  let requests;
  const lifecycleService = createOrderCredentialLifecycleService({
    channelRef,
    runtime: "hysteria2",
    nowFn: () => NOW,
    executeProductionMutation: true,
    listOrders: () => requests?.listEdgeCredentialOrders() || [],
    listCurrentCredentials: () => [],
    runtimeAdapter: {
      applyCredentialReconciliation() {
        adapterSequence += 1;
        if (captureRefreshAttempts) {
          refreshAdapterAttempts.push(adapterSequence);
        }
        return {
          status: "pending",
          mutation: false,
          handoffRef: `handoff_channel-sgp-a-hy2_${adapterSequence}`,
          service: {
            name: "remote-data-plane-handoff",
            active: false,
            restarted: false
          },
          listener: {
            udp443: false
          },
          appliedAt: NOW
        };
      }
    },
    receiptStore: {
      recordEdgeApplyReceipt(receipt) {
        receiptWriteCount += 1;
        if (receiptWriteCount === 3) {
          throw Object.assign(new Error("synthetic rollback receipt persistence failure"), {
            code: "receipt_write_failed"
          });
        }
        return receipt;
      }
    },
    receiptIdFactory: () => `edge_receipt_rollback_failure_${++receiptSequence}`,
    desiredStateRefFactory: () => `desired_state_rollback_failure_${receiptSequence + 1}`
  });

  requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_refresh_rollback_receipt_failure",
    edgeCredentialIssuer: createOrderEdgeCredentialIssuer({
      channelRef,
      materialStore,
      uuidFactory: () => `00000000-0000-4000-8000-${String(++credentialSequence).padStart(12, "0")}`,
      passwordFactory: () => `synthetic-rollback-receipt-password-${credentialSequence}`
    }),
    controlStore: desiredStateAuthorityStore(),
    runtimeCore: {
      bindTenantCredentialMaterial({ material }) {
        if (material.uuid.endsWith("000000000002")) {
          throw Object.assign(new Error("synthetic binding failure"), { code: "binding_failed" });
        }
        return { ok: true };
      }
    },
    edgeLifecycleService: lifecycleService,
    edgeDesiredStateNotifier: {
      notifyOrderLifecycle(input) {
        notificationCalls.push(input);
        if (input.reason === "order_refresh_rolled_back") {
          rollbackNotificationOrder = input.order;
        }
        return {
          ok: true,
          notificationCount: 1,
          notifications: [pendingDesiredStateNotification(channelRef)],
          redacted: true
        };
      }
    }
  });
  requests.submitRequest(validTrialInput());
  requests.markDelivered("pareq_refresh_rollback_receipt_failure", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_safe_ref",
    accessGrantRef: "grant_safe_ref",
    tenantId: "tenant_runtime_rollback_receipt_failure",
    artifactId: "artifact_runtime_1",
    subscriptionUrl: "https://sub.example.test/import/original-visible-once",
    expiresAt: "2026-06-07T00:00:00.000Z"
  });
  notificationCalls.length = 0;
  captureRefreshAttempts = true;

  const [before] = requests.listEdgeCredentialOrders();
  const beforeMaterial = materialStore.getCredentialMaterialSummary(before.edgeCredentialRef);
  const beforeRequest = requests.getRequest("pareq_refresh_rollback_receipt_failure");
  let errorCode = "none";

  try {
    requests.refreshSubscription({
      portalUserRef: "user_safe_ref",
      requestRef: "pareq_refresh_rollback_receipt_failure",
      clientTarget: "karing"
    });
  } catch (error) {
    errorCode = error?.code || "unknown";
  }

  const [after] = requests.listEdgeCredentialOrders();
  const restored = requests.getRequest("pareq_refresh_rollback_receipt_failure");
  assert.deepEqual({
    errorCode,
    refreshAdapterAttempts,
    receiptWriteCount,
    notificationReasons: notificationCalls.map(({ reason }) => reason),
    rollbackNotificationCount: notificationCalls.filter(
      ({ reason }) => reason === "order_refresh_rolled_back"
    ).length,
    rollbackNotificationUsesRestoredOrder: (
      rollbackNotificationOrder?.edgeMaterialDigest === before.edgeMaterialDigest
    ),
    stateRestored: (
      after.edgeCredentialRef === before.edgeCredentialRef
      && after.edgeMaterialDigest === before.edgeMaterialDigest
      && materialStore.getCredentialMaterialSummary(after.edgeCredentialRef).materialDigest
        === beforeMaterial.materialDigest
      && restored.clientTarget === beforeRequest.clientTarget
      && JSON.stringify(restored.event) === JSON.stringify(beforeRequest.event)
    )
  }, {
    errorCode: "subscription_refresh_rollback_failed",
    refreshAdapterAttempts: [2, 3],
    receiptWriteCount: 3,
    notificationReasons: ["order_refresh_rolled_back"],
    rollbackNotificationCount: 1,
    rollbackNotificationUsesRestoredOrder: true,
    stateRestored: true
  });
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

test("legacy traffic supply suspension keeps the original revoke behavior", () => {
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

test("each new traffic supply suspension gets a durable non-clock lifecycle revision", () => {
  const requestStore = portalRequestStoreWith([
    materialBearingPortalRequest({
      id: "pareq_suspend_revision",
      portalUserRef: "portal_user_suspend_revision",
      status: "delivered",
      nextAction: "user_can_use_access",
      event: null
    })
  ]);
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    portalAccessRequestStore: requestStore,
    runtimeCore: {
      revokeSubscriptionArtifact(id) {
        return { id, status: "revoked" };
      },
      disableTenant(id) {
        return { id, status: "disabled" };
      }
    }
  });

  const firstSummary = requests.suspendTrafficSupply({
    portalUserRef: "portal_user_suspend_revision",
    requestRef: "pareq_suspend_revision"
  });
  const firstRecord = requestStore.getPortalAccessRequest("pareq_suspend_revision");

  assert.match(
    firstRecord.event.lifecycleRevisionRef,
    /^lifecycle_ref_[a-f0-9]{32}$/
  );
  assert.equal(
    JSON.stringify(firstSummary).includes(firstRecord.event.lifecycleRevisionRef),
    false
  );

  requestStore.upsertPortalAccessRequest({
    ...firstRecord,
    status: "delivered",
    nextAction: "user_can_use_access",
    subscriptionUrl: "safe-visible-once-link",
    event: {
      type: "traffic_supply_resumed",
      occurredAt: NOW,
      previousStatus: "delivered",
      lifecycleRevisionRef: firstRecord.event.lifecycleRevisionRef
    }
  });
  requests.suspendTrafficSupply({
    portalUserRef: "portal_user_suspend_revision",
    requestRef: "pareq_suspend_revision"
  });
  const secondRecord = requestStore.getPortalAccessRequest("pareq_suspend_revision");

  assert.match(
    secondRecord.event.lifecycleRevisionRef,
    /^lifecycle_ref_[a-f0-9]{32}$/
  );
  assert.notEqual(
    secondRecord.event.lifecycleRevisionRef,
    firstRecord.event.lifecycleRevisionRef
  );
});

test("30-day Coins quota suspension preserves stable delivery for a possible renewed cycle", () => {
  const runtimeCore = lifecycleRuntimeCore();
  const requests = createPortalAccessRequestService({
    nowFn: () => NOW,
    requestIdFactory: () => "pareq_suspend_30d_coins",
    runtimeCore,
    controlStore: {
      getEntitlement() {
        return {
          id: "ent_30d_coins",
          plan: "offerv_plan_30d_50gb_monthly_v1"
        };
      }
    }
  });
  requests.submitRequest({
    portalUserRef: "portal_user_30d_coins",
    plan: "monthly"
  });
  requests.markDelivered("pareq_suspend_30d_coins", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_30d_coins",
    accessGrantRef: "grant_30d_coins",
    tenantId: "tenant_30d_coins",
    artifactId: "artifact_30d_coins",
    subscriptionUrl: "https://sub.example.test/import/30d-coins",
    expiresAt: "2026-06-30T00:00:00.000Z"
  });

  requests.suspendTrafficSupply({
    portalUserRef: "portal_user_30d_coins",
    requestRef: "pareq_suspend_30d_coins"
  });

  assert.deepEqual(runtimeCore.calls, [
    ["disableTenant", "tenant_30d_coins"]
  ]);
});

test("a new annual quota cycle resumes the same tenant, artifact, credential, and stable link exactly once", () => {
  withControlStore((store) => {
    let now = "2026-02-15T00:00:00.000Z";
    const seeded = seedUsageOrder(store, {
      now: "2026-01-31T00:00:00.000Z",
      requestId: "pareq_quota_resume_1",
      accountId: "portal_user_usage_summary_1",
      entitlementId: "ent_quota_resume_1",
      tenantRef: "tenant_quota_resume_1",
      artifactRef: "artifact_quota_resume_1",
      issuedTenantRef: safeIssuedRef("tenant", "tenant_quota_resume_1"),
      issuedArtifactRef: safeIssuedRef("artifact", "artifact_quota_resume_1"),
      edgeCredentialRef: "edgecred_quota_resume_1",
      plan: "yearly",
      entitlementPlan: "offerv_plan_365d_200gb_monthly_v1",
      durationDays: 365,
      validUntil: "2027-01-31T00:00:00.000Z"
    });
    const database = new Database(":memory:");
    const repository = createSubscriptionRepository({ database });
    const rawArtifact = "synthetic_stable_quota_artifact";
    const rawToken = "pgsub_synthetic_quota_token";
    try {
      const core = createSubscriptionCore({
        repository,
        proxyConfig: {
          servers: [{
            id: "node_quota_resume_1",
            name: "quota-resume-test-node",
            region: "Test",
            host: "192.0.2.10",
            port: 443,
            method: "aes-256-gcm",
            password: "synthetic-test-password",
            status: "online"
          }]
        },
        publicSubscriptionBaseUrl: "https://gateway.example.test/",
        nowFn: () => new Date(now),
        tokenFactory: () => ({
          rawToken,
          tokenHash: hashSubscriptionToken(rawToken),
          tokenPrefix: rawToken.slice(0, 14)
        }),
        artifactSecretFactory: () => rawArtifact,
        idFactory: () => "tenant_quota_resume_1",
        artifactIdFactory: () => "artifact_quota_resume_1"
      });
      const tenant = core.createTenant({
        displayName: "Quota resume fixture",
        expiresAt: "2027-01-31T00:00:00.000Z"
      });
      const artifact = core.createSubscriptionArtifact(tenant.tenant.id);
      const stored = store.getPortalAccessRequest(seeded.requestId);
      store.upsertPortalAccessRequest({
        ...stored,
        tenantId: tenant.tenant.id,
        artifactId: artifact.artifact.id,
        subscriptionUrl: artifact.subscriptionUrl
      });
      let enableCount = 0;
      const runtimeCore = {
        ...core,
        enableTenant(id) {
          enableCount += 1;
          return core.enableTenant(id);
        }
      };
      const edgeLifecycle = edgeLifecycleService({ applied: true });
      const requests = createPortalAccessRequestService({
        nowFn: () => now,
        controlStore: store,
        runtimeCore,
        edgeLifecycleService: edgeLifecycle
      });

      assert.equal(core.resolveSubscriptionArtifact(rawArtifact).ok, true);
      const suspended = requests.suspendTrafficSupply({
        portalUserRef: "portal_user_usage_summary_1",
        requestRef: seeded.requestId
      });
      assert.equal(suspended.status, "disabled");
      assert.equal(core.resolveSubscriptionArtifact(rawArtifact).status, 403);
      assert.equal(core.listSubscriptionArtifacts(tenant.tenant.id)[0].status, "active");

      now = "2026-03-01T00:00:00.000Z";
      const resumed = requests.resumeTrafficSupply({
        portalUserRef: "portal_user_usage_summary_1",
        requestRef: seeded.requestId,
        reviewedByRef: "usage_quota_rollover_gate"
      });
      const repeated = requests.resumeTrafficSupply({
        portalUserRef: "portal_user_usage_summary_1",
        requestRef: seeded.requestId,
        reviewedByRef: "usage_quota_rollover_gate"
      });
      const resumedRecord = store.getPortalAccessRequest(seeded.requestId);

      assert.equal(resumed.status, "quota_traffic_supply_resumed");
      assert.equal(resumed.runtimeEnforcement.state, "applied");
      assert.equal(repeated.status, "quota_traffic_supply_already_resumed");
      assert.equal(enableCount, 1);
      assert.equal(resumedRecord.status, "delivered");
      assert.equal(resumedRecord.tenantId, "tenant_quota_resume_1");
      assert.equal(resumedRecord.artifactId, "artifact_quota_resume_1");
      assert.equal(resumedRecord.edgeCredentialRef, "edgecred_quota_resume_1");
      assert.equal(resumedRecord.subscriptionUrl, artifact.subscriptionUrl);
      assert.equal(core.resolveSubscriptionArtifact(rawArtifact).ok, true);
      assert.equal(edgeLifecycle.calls.at(-1).reason, "traffic_supply_resumed");
      assert.equal(resumed.request.subscriptionUrl, undefined);
      assert.doesNotMatch(JSON.stringify(resumed), /synthetic_stable_quota_artifact/i);
    } finally {
      repository.close();
      database.close();
    }
  });
});

test("default-off rollover does not auto-resume a legacy yearly entitlement", () => {
  let now = "2026-02-15T00:00:00.000Z";
  let tenantStatus = "active";
  let enableCount = 0;
  let revokeCount = 0;
  const runtimeCore = {
    revokeSubscriptionArtifact() {
      revokeCount += 1;
      return { id: "artifact_legacy_yearly", status: "revoked" };
    },
    disableTenant() {
      tenantStatus = "disabled";
      return { id: "tenant_legacy_yearly", status: tenantStatus };
    },
    enableTenant() {
      enableCount += 1;
      tenantStatus = "active";
      return { id: "tenant_legacy_yearly", status: tenantStatus };
    },
    getTenant() {
      return { id: "tenant_legacy_yearly", status: tenantStatus };
    },
    listSubscriptionArtifacts() {
      return [{ id: "artifact_legacy_yearly", status: "active" }];
    }
  };
  const requests = createPortalAccessRequestService({
    nowFn: () => now,
    requestIdFactory: () => "pareq_legacy_yearly",
    runtimeCore,
    controlStore: {
      getEntitlement() {
        return {
          id: "ent_legacy_yearly",
          plan: "yearly",
          status: "active",
          validFrom: "2026-01-31T00:00:00.000Z",
          validUntil: "2027-01-31T00:00:00.000Z",
          trafficLimitBytes: 1000
        };
      },
      listUsageSamples() {
        return [];
      }
    },
    edgeLifecycleService: edgeLifecycleService({ applied: true })
  });
  requests.submitRequest({
    portalUserRef: "portal_user_legacy_yearly",
    plan: "yearly"
  });
  requests.markDelivered("pareq_legacy_yearly", {
    reviewedByRef: "operator_safe_ref",
    entitlementRef: "ent_legacy_yearly",
    accessGrantRef: "grant_legacy_yearly",
    tenantId: "tenant_legacy_yearly",
    artifactId: "artifact_legacy_yearly",
    subscriptionUrl: "https://gateway.example.test/sub/a/legacy-yearly.yaml",
    expiresAt: "2027-01-31T00:00:00.000Z"
  });
  requests.suspendTrafficSupply({
    portalUserRef: "portal_user_legacy_yearly",
    requestRef: "pareq_legacy_yearly"
  });

  now = "2026-03-01T00:00:00.000Z";
  const result = requests.resumeTrafficSupply({
    portalUserRef: "portal_user_legacy_yearly",
    requestRef: "pareq_legacy_yearly",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(result.blockers, [{ code: "plan_not_rollover_managed" }]);
  assert.equal(enableCount, 0);
  assert.equal(revokeCount, 1);
  assert.equal(requests.getRequest("pareq_legacy_yearly").status, "disabled");
});

test("an early-renewed 30-day Coins offer resumes at its next anchored cycle", () => {
  const fixture = quotaResumeFixture({
    entitlementPlan: "offerv_plan_30d_50gb_monthly_v1",
    validUntil: "2026-04-01T00:00:00.000Z",
    requestPlan: "monthly"
  });
  assert.equal(fixture.artifactStatus(), "active");
  fixture.setNow("2026-03-02T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resumed");
  assert.equal(result.runtimeEnforcement.state, "applied");
  assert.equal(fixture.enableCount(), 1);
  assert.equal(fixture.tenantStatus(), "active");
  assert.equal(fixture.artifactStatus(), "active");
});

test("an unrenewed 30-day Coins offer revokes its stable delivery at the final boundary", () => {
  const fixture = quotaResumeFixture({
    entitlementPlan: "offerv_plan_30d_100gb_monthly_v1",
    validUntil: "2026-03-02T00:00:00.000Z",
    requestPlan: "monthly"
  });
  assert.equal(fixture.artifactStatus(), "active");
  fixture.setNow("2026-03-02T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_expiry_cleanup_completed");
  assert.equal(result.runtimeEnforcement.state, "applied");
  assert.equal(result.mutation, true);
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.equal(fixture.artifactStatus(), "revoked");
  assert.equal(
    fixture.requests.getRequest("pareq_quota_fixture").nextAction,
    "subscription_expired"
  );
  assert.equal(
    fixture.requests.getRequest("pareq_quota_fixture").event.type,
    "subscription_expired"
  );
  assert.equal(
    fixture.lifecycleReasons.at(-1),
    "traffic_supply_expired"
  );
});

test("30-day expiry cleanup converges across process reopen only after the exact tombstone receipt", () => {
  withControlStore((store) => {
    const channelRef = "channel-quota-expiry-remote";
    const validUntil = "2026-03-02T00:00:00.000Z";
    const seeded = seedUsageOrder(store, {
      now: "2026-01-31T00:00:00.000Z",
      requestId: "pareq_quota_expiry_remote",
      accountId: "portal_user_usage_summary_1",
      entitlementId: "ent_quota_expiry_remote",
      tenantRef: "tenant_quota_expiry_remote",
      artifactRef: "artifact_quota_expiry_remote",
      issuedTenantRef: safeIssuedRef("tenant", "tenant_quota_expiry_remote"),
      issuedArtifactRef: safeIssuedRef("artifact", "artifact_quota_expiry_remote"),
      edgeChannelRef: channelRef,
      edgeCredentialRef: "edgecred_quota_expiry_remote",
      plan: "monthly",
      entitlementPlan: "offerv_plan_30d_50gb_monthly_v1",
      durationDays: 30,
      validUntil
    });
    let now = "2026-02-15T00:00:00.000Z";
    let tenantStatus = "active";
    let artifactStatus = "active";
    let enableCount = 0;
    let revokeCount = 0;
    const runtimeCore = {
      disableTenant(id) {
        tenantStatus = "disabled";
        return { id, status: tenantStatus, expiresAt: validUntil };
      },
      enableTenant(id) {
        enableCount += 1;
        tenantStatus = "active";
        return { id, status: tenantStatus, expiresAt: validUntil };
      },
      getTenant(id) {
        return { id, status: tenantStatus, expiresAt: validUntil };
      },
      listSubscriptionArtifacts(id) {
        return [{
          id: "artifact_quota_expiry_remote",
          tenantId: id,
          status: artifactStatus
        }];
      },
      revokeSubscriptionArtifact(id) {
        revokeCount += 1;
        artifactStatus = "revoked";
        return { id, status: artifactStatus };
      }
    };
    const lifecycle = {
      reconcileOrderLifecycle({ reason }) {
        if (reason === "traffic_supply_expired") {
          return {
            ok: true,
            mutation: false,
            reports: [{
              ok: true,
              mutation: false,
              channelRef,
              runtimeStatus: "pending",
              nextAction: "complete_data_plane_handoff",
              redacted: true
            }],
            redacted: true
          };
        }
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: { status: "applied" },
          redacted: true
        };
      }
    };
    const createRequests = () => createPortalAccessRequestService({
      nowFn: () => now,
      controlStore: store,
      runtimeCore,
      edgeLifecycleService: lifecycle,
      edgeDesiredStateNotifier: createDataPlaneDesiredStateNotifier({
        controlStore: store,
        servers: [{
          id: channelRef,
          name: channelRef,
          physicalNodeRef: "node-quota-expiry-remote",
          runtimeAdapter: "remote-data-plane-handoff"
        }],
        nowFn: () => now
      })
    });

    const firstProcess = createRequests();
    firstProcess.suspendTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId
    });
    now = validUntil;
    assert.deepEqual(
      firstProcess.listQuotaSuspendedTrafficSupplies({ limit: 10 }),
      [{
        requestRef: seeded.requestId,
        portalUserRef: "portal_user_usage_summary_1"
      }]
    );
    const pending = firstProcess.resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });
    const pendingRecord = store.getPortalAccessRequest(seeded.requestId);
    const expiryNotifications = store
      .listEdgeDesiredStateNotifications()
      .filter((notification) => notification.reason === "traffic_supply_expired");

    assert.equal(pending.status, "quota_traffic_supply_expiry_cleanup_pending");
    assert.equal(pending.runtimeEnforcement.state, "pending");
    assert.equal(pendingRecord.nextAction, "traffic_supply_expiry_cleanup_pending");
    assert.equal(pendingRecord.subscriptionUrl, null);
    assert.equal(artifactStatus, "revoked");
    assert.equal(revokeCount, 1);
    assert.equal(enableCount, 0);
    assert.equal(expiryNotifications.length, 1);

    now = "2026-03-03T00:00:00.000Z";
    const secondProcess = createRequests();
    assert.deepEqual(
      secondProcess.listQuotaSuspendedTrafficSupplies({ limit: 10 }),
      [{
        requestRef: seeded.requestId,
        portalUserRef: "portal_user_usage_summary_1"
      }]
    );
    const repeatedPending = secondProcess.resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });
    const repeatedNotifications = store
      .listEdgeDesiredStateNotifications()
      .filter((notification) => notification.reason === "traffic_supply_expired");

    assert.equal(repeatedPending.status, "quota_traffic_supply_expiry_cleanup_pending");
    assert.equal(revokeCount, 1);
    assert.equal(repeatedNotifications.length, 1);
    assert.equal(
      repeatedNotifications[0].desiredStateRef,
      expiryNotifications[0].desiredStateRef
    );

    store.recordEdgeApplyReceipt({
      id: "receipt_quota_expiry_remote",
      channelRef,
      desiredStateRef: expiryNotifications[0].desiredStateRef,
      status: "applied",
      actionCounts: { add: 0, revoke: 1, rotate: 0, unchanged: 0 },
      configTestOk: true,
      serviceActive: true,
      listenerUdp443: true,
      appliedAt: now,
      createdAt: now
    });
    now = "2026-03-04T00:00:00.000Z";
    const thirdProcess = createRequests();
    const completed = thirdProcess.resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });
    const completedRecord = store.getPortalAccessRequest(seeded.requestId);
    const completedDesiredState = store.getLatestEdgeDesiredStateForChannel(channelRef, {
      nodeRef: "node-quota-expiry-remote"
    });

    assert.equal(completed.status, "quota_traffic_supply_expiry_cleanup_completed");
    assert.equal(completed.runtimeEnforcement.state, "applied");
    assert.equal(completedRecord.status, "disabled");
    assert.equal(completedRecord.nextAction, "subscription_expired");
    assert.equal(completedRecord.subscriptionUrl, null);
    assert.equal(completedRecord.event.type, "subscription_expired");
    assert.equal(completedDesiredState.desiredStateRef, expiryNotifications[0].desiredStateRef);
    assert.equal(revokeCount, 1);
    assert.equal(enableCount, 0);
    assert.deepEqual(thirdProcess.listQuotaSuspendedTrafficSupplies({ limit: 10 }), []);
  });
});

test("rollover candidates include only explicit Coins quota suspensions", () => {
  const records = [
    {
      id: "pareq_coins_quota_expired",
      portalUserRef: "portal_user_expired",
      entitlementRef: "ent_coins_expired",
      tenantId: "tenant_quota_candidate",
      artifactId: "artifact_quota_candidate",
      subscriptionUrl: "https://gateway.example.test/sub/a/quota-candidate.yaml",
      expiresAt: "2026-02-20T00:00:00.000Z",
      validUntil: "2026-02-20T00:00:00.000Z",
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      event: {
        type: "traffic_supply_suspended",
        occurredAt: "2026-02-15T00:00:00.000Z",
        previousStatus: "delivered"
      }
    },
    {
      id: "pareq_coins_quota_suspended",
      portalUserRef: "portal_user_coins",
      entitlementRef: "ent_coins_annual",
      tenantId: "tenant_quota_candidate",
      artifactId: "artifact_quota_candidate",
      subscriptionUrl: "https://gateway.example.test/sub/a/quota-candidate.yaml",
      expiresAt: "2027-01-31T00:00:00.000Z",
      validUntil: "2027-01-31T00:00:00.000Z",
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      event: {
        type: "traffic_supply_suspended",
        occurredAt: "2026-02-15T00:00:00.000Z",
        previousStatus: "delivered"
      }
    },
    {
      id: "pareq_legacy_quota_suspended",
      portalUserRef: "portal_user_legacy",
      entitlementRef: "ent_legacy_yearly",
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      event: {
        type: "traffic_supply_suspended",
        occurredAt: "2026-02-15T00:00:00.000Z",
        previousStatus: "delivered"
      }
    },
    {
      id: "pareq_coins_manually_disabled",
      portalUserRef: "portal_user_manual",
      entitlementRef: "ent_coins_annual",
      status: "disabled",
      nextAction: "subscription_disabled",
      event: {
        type: "subscription_disabled",
        occurredAt: "2026-02-15T00:00:00.000Z",
        previousStatus: "delivered"
      }
    }
  ];
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-01T00:00:00.000Z",
    portalAccessRequestStore: {
      getPortalAccessRequest(id) {
        return records.find((record) => record.id === id) || null;
      },
      listPortalAccessRequests() {
        return records;
      },
      upsertPortalAccessRequest(record) {
        return record;
      }
    },
    controlStore: {
      getEntitlement(id) {
        const accountId = id === "ent_coins_annual"
          ? "portal_user_coins"
          : id === "ent_coins_expired"
            ? "portal_user_expired"
            : "portal_user_legacy";
        return {
          id,
          accountId,
          plan: id.startsWith("ent_coins_")
            ? "offerv_plan_365d_200gb_monthly_v1"
            : "yearly",
          status: "active",
          validFrom: "2026-01-31T00:00:00.000Z",
          validUntil: id === "ent_coins_expired"
            ? "2026-02-20T00:00:00.000Z"
            : "2027-01-31T00:00:00.000Z",
          trafficLimitBytes: 1000
        };
      },
      getAccount(id) {
        return { id, ownerRef: id, status: "active" };
      },
      getIssuanceRequest(id) {
        if (id !== "pareq_coins_quota_suspended") return null;
        return {
          id,
          accountId: "portal_user_coins",
          entitlementId: "ent_coins_annual",
          status: "issued"
        };
      },
      listIssuedSubscriptionBindings() {
        return [{
          id: "link_pareq_coins_quota_suspended",
          requestId: "pareq_coins_quota_suspended",
          accountId: "portal_user_coins",
          entitlementId: "ent_coins_annual",
          tenantRef: safeIssuedRef("tenant", "tenant_quota_candidate"),
          artifactRef: safeIssuedRef("artifact", "artifact_quota_candidate"),
          status: "active",
          requestStatus: "issued",
          entitlementStatus: "active"
        }];
      },
      getIssuedLink() {
        return {
          id: "link_pareq_coins_quota_suspended",
          requestId: "pareq_coins_quota_suspended",
          tenantRef: safeIssuedRef("tenant", "tenant_quota_candidate"),
          artifactRef: safeIssuedRef("artifact", "artifact_quota_candidate"),
          status: "active"
        };
      },
      listUsageSamples() {
        return [];
      }
    },
    runtimeCore: {
      getTenant() {
        return {
          id: "tenant_quota_candidate",
          status: "disabled",
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      },
      listSubscriptionArtifacts() {
        return [{
          id: "artifact_quota_candidate",
          tenantId: "tenant_quota_candidate",
          status: "active"
        }];
      },
      enableTenant() {
        throw new Error("candidate listing must not enable a tenant");
      },
      disableTenant() {
        throw new Error("candidate listing must not disable a tenant");
      }
    }
  });

  const candidates = [
    ...requests.listQuotaSuspendedTrafficSupplies({ limit: 1 }),
    ...requests.listQuotaSuspendedTrafficSupplies({ limit: 1 }),
    ...requests.listQuotaSuspendedTrafficSupplies({ limit: 1 })
  ];
  assert.deepEqual(candidates, [{
    requestRef: "pareq_coins_quota_suspended",
    portalUserRef: "portal_user_coins"
  }]);
});

test("rollover candidate pagination bounds expensive reads and rotates pending work", () => {
  const validUntil = "2027-01-31T00:00:00.000Z";
  const records = Array.from({ length: 5 }, (_, index) => ({
    ...materialBearingPortalRequest({
      id: `pareq_quota_page_${index}`,
      portalUserRef: `portal_user_quota_page_${index}`,
      plan: "yearly",
      durationDays: 365,
      status: "disabled",
      nextAction: index === 0
        ? "traffic_supply_resume_pending"
        : "traffic_supply_suspended_quota",
      submittedAt: `2026-01-31T00:00:0${index}.000Z`,
      updatedAt: "2026-02-15T00:00:00.000Z",
      expiresAt: validUntil,
      validUntil,
      entitlementRef: `ent_quota_page_${index}`,
      tenantId: `tenant_quota_page_${index}`,
      artifactId: `artifact_quota_page_${index}`,
      subscriptionUrl: `https://gateway.example.test/sub/a/quota-page-${index}.yaml`,
      event: {
        type: "traffic_supply_suspended",
        occurredAt: "2026-02-15T00:00:00.000Z",
        previousStatus: "delivered"
      }
    })
  }));
  let usageReads = 0;
  let runtimeReads = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-01T00:00:00.000Z",
    portalAccessRequestStore: portalRequestStoreWith(records),
    controlStore: {
      getEntitlement(id) {
        const index = id.at(-1);
        return {
          id,
          accountId: `portal_user_quota_page_${index}`,
          plan: "offerv_plan_365d_200gb_monthly_v1",
          status: "active",
          validFrom: "2026-01-31T00:00:00.000Z",
          validUntil,
          trafficLimitBytes: 1000
        };
      },
      getAccount(id) {
        return { id, ownerRef: id, status: "active" };
      },
      getIssuanceRequest(id) {
        const index = id.at(-1);
        return {
          id,
          accountId: `portal_user_quota_page_${index}`,
          entitlementId: `ent_quota_page_${index}`,
          status: "issued"
        };
      },
      listIssuedSubscriptionBindings({ tenantRef }) {
        const record = records.find((item) =>
          safeIssuedRef("tenant", item.tenantId) === tenantRef
        );
        if (!record) return [];
        return [{
          id: `link_${record.id}`,
          requestId: record.id,
          accountId: record.portalUserRef,
          entitlementId: record.entitlementRef,
          tenantRef,
          artifactRef: safeIssuedRef("artifact", record.artifactId),
          status: "active",
          requestStatus: "issued",
          entitlementStatus: "active"
        }];
      },
      getIssuedLink(id) {
        const record = records.find((item) => id === `link_${item.id}`);
        return record ? {
          id,
          requestId: record.id,
          tenantRef: safeIssuedRef("tenant", record.tenantId),
          artifactRef: safeIssuedRef("artifact", record.artifactId),
          status: "active"
        } : null;
      },
      listUsageSamples() {
        usageReads += 1;
        return [];
      }
    },
    runtimeCore: {
      getTenant(id) {
        runtimeReads += 1;
        return { id, status: "disabled", expiresAt: validUntil };
      },
      listSubscriptionArtifacts(id) {
        runtimeReads += 1;
        return [{
          id: id.replace("tenant_", "artifact_"),
          tenantId: id,
          status: "active"
        }];
      },
      enableTenant() {
        throw new Error("candidate listing must not enable");
      },
      disableTenant() {
        throw new Error("candidate listing must not disable");
      }
    }
  });

  const first = requests.listQuotaSuspendedTrafficSupplies({ limit: 2 });
  assert.deepEqual(first.map((item) => item.requestRef), [
    "pareq_quota_page_0",
    "pareq_quota_page_1"
  ]);
  assert.equal(usageReads, 2);
  assert.equal(runtimeReads, 4);

  usageReads = 0;
  runtimeReads = 0;
  const second = requests.listQuotaSuspendedTrafficSupplies({ limit: 2 });
  assert.deepEqual(second.map((item) => item.requestRef), [
    "pareq_quota_page_2",
    "pareq_quota_page_3"
  ]);
  assert.equal(usageReads, 2);
  assert.equal(runtimeReads, 4);

  usageReads = 0;
  runtimeReads = 0;
  const third = requests.listQuotaSuspendedTrafficSupplies({ limit: 2 });
  assert.deepEqual(third.map((item) => item.requestRef), [
    "pareq_quota_page_4",
    "pareq_quota_page_0"
  ]);
  assert.equal(usageReads, 2);
  assert.equal(runtimeReads, 4);
});

test("expiry cleanup pending remains retryable when later binding or runtime reads drift", () => {
  const record = materialBearingPortalRequest({
    id: "pareq_quota_cleanup_retry",
    portalUserRef: "portal_user_quota_cleanup_retry",
    status: "disabled",
    nextAction: "traffic_supply_expiry_cleanup_pending",
    entitlementRef: "ent_quota_cleanup_retry",
    tenantId: "tenant_quota_cleanup_retry",
    artifactId: "artifact_quota_cleanup_retry",
    subscriptionUrl: null,
    event: {
      type: "traffic_supply_suspended",
      occurredAt: "2026-02-15T00:00:00.000Z",
      previousStatus: "delivered"
    }
  });
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-03T00:00:00.000Z",
    portalAccessRequestStore: portalRequestStoreWith([record]),
    controlStore: {},
    runtimeCore: {}
  });

  assert.deepEqual(
    requests.listQuotaSuspendedTrafficSupplies({ limit: 10 }),
    [{
      requestRef: "pareq_quota_cleanup_retry",
      portalUserRef: "portal_user_quota_cleanup_retry"
    }]
  );
  const result = requests.resumeTrafficSupply({
    requestRef: "pareq_quota_cleanup_retry",
    portalUserRef: "portal_user_quota_cleanup_retry",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_expiry_cleanup_failed");
  assert.equal(result.runtimeEnforcement.state, "failed");
  assert.deepEqual(
    requests.listQuotaSuspendedTrafficSupplies({ limit: 10 }),
    [{
      requestRef: "pareq_quota_cleanup_retry",
      portalUserRef: "portal_user_quota_cleanup_retry"
    }]
  );
});

test("default-off inventory with no immutable rollover offer performs zero expensive reads or mutation", () => {
  const record = materialBearingPortalRequest({
    id: "pareq_quota_default_off_legacy",
    portalUserRef: "portal_user_quota_default_off_legacy",
    status: "disabled",
    nextAction: "traffic_supply_suspended_quota",
    entitlementRef: "ent_quota_default_off_legacy",
    event: {
      type: "traffic_supply_suspended",
      occurredAt: "2026-02-15T00:00:00.000Z",
      previousStatus: "delivered"
    }
  });
  let mutationCount = 0;
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-01T00:00:00.000Z",
    portalAccessRequestStore: portalRequestStoreWith([record]),
    controlStore: {
      getEntitlement() {
        return {
          id: "ent_quota_default_off_legacy",
          plan: "yearly",
          status: "active",
          validFrom: "2026-01-31T00:00:00.000Z",
          validUntil: "2027-01-31T00:00:00.000Z",
          trafficLimitBytes: 1000
        };
      },
      listUsageSamples() {
        throw new Error("legacy inventory must not read usage");
      }
    },
    runtimeCore: {
      getTenant() {
        throw new Error("legacy inventory must not read runtime");
      },
      listSubscriptionArtifacts() {
        throw new Error("legacy inventory must not read runtime");
      },
      enableTenant() {
        mutationCount += 1;
      },
      disableTenant() {
        mutationCount += 1;
      }
    }
  });

  assert.deepEqual(requests.listQuotaSuspendedTrafficSupplies({ limit: 10 }), []);
  assert.equal(mutationCount, 0);
});

test("quota resume fails closed when a remote handoff lacks authoritative desired-state receipts", () => {
  const fixture = quotaResumeFixture({
    resumeLifecycleResult: {
      ok: true,
      mutation: false,
      nextAction: "complete_data_plane_handoff",
      channelRef: "channel-quota-fixture",
      runtimeReceipt: { status: "pending" },
      redacted: true
    }
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });
  const repeated = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(result.mutation, false);
  assert.equal(result.runtimeEnforcement.state, "failed");
  assert.deepEqual(result.blockers, [{ code: "edge_runtime_enforcement_failed" }]);
  assert.equal(repeated.status, "quota_traffic_supply_resume_failed");
  assert.equal(fixture.requests.getRequest("pareq_quota_fixture").status, "disabled");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.equal(fixture.artifactStatus(), "active");
});

test("an applied direct lifecycle result cannot bypass a pending desired-state channel", () => {
  const channelRef = "channel-quota-direct-with-remote";
  const nodeRef = "node-quota-direct-with-remote";
  const desiredStateRef = "desired_state_quota_direct_with_remote";
  const generation = "gen_quota_direct_with_remote";
  const notificationId = "edge_state_notify_quota_direct_with_remote";
  let persistedReason = "traffic_supply_suspended";
  const notification = () => ({
    id: notificationId,
    nodeRef,
    channelRef,
    desiredStateRef,
    generation,
    reason: persistedReason,
    status: "pending"
  });
  const fixture = quotaResumeFixture({
    controlOverrides: {
      getLatestEdgeDesiredStateForChannel() {
        return {
          nodeRef,
          channelRefs: [channelRef],
          desiredStateRef,
          generation
        };
      },
      getEdgeDesiredStateNotification() {
        return notification();
      },
      listEdgeApplyReceipts() {
        return [];
      }
    },
    edgeDesiredStateNotifier: {
      notifyOrderLifecycle({ reason }) {
        persistedReason = reason;
        return {
          ok: true,
          notificationCount: 1,
          notifications: [notification()],
          redacted: true
        };
      }
    }
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resume_pending");
  assert.equal(result.runtimeEnforcement.state, "pending");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
});

test("quota resume converges across process reopen only after every exact active desired receipt is applied", () => {
  withControlStore((store) => {
    const channels = ["channel-quota-remote-a", "channel-quota-remote-b"];
    const edgeCredentials = channels.map((channelRef, index) => ({
      edgeChannelRef: channelRef,
      edgeCredentialRef: `edgecred_quota_remote_${index}`,
      edgeMaterialDigest: `sha256:quota_remote_digest_${index}`
    }));
    const seeded = seedUsageOrder(store, {
      now: "2026-01-31T00:00:00.000Z",
      requestId: "pareq_quota_remote",
      accountId: "portal_user_usage_summary_1",
      entitlementId: "ent_quota_remote",
      tenantRef: "tenant_quota_remote",
      artifactRef: "artifact_quota_remote",
      issuedTenantRef: safeIssuedRef("tenant", "tenant_quota_remote"),
      issuedArtifactRef: safeIssuedRef("artifact", "artifact_quota_remote"),
      edgeChannelRef: channels[0],
      edgeCredentialRef: edgeCredentials[0].edgeCredentialRef,
      edgeCredentials,
      plan: "yearly",
      entitlementPlan: "offerv_plan_365d_200gb_monthly_v1",
      durationDays: 365,
      validUntil: "2027-01-31T00:00:00.000Z"
    });
    let now = "2026-02-15T00:00:00.000Z";
    let tenantStatus = "active";
    let enableCount = 0;
    const runtimeCore = {
      disableTenant(id) {
        tenantStatus = "disabled";
        return {
          id,
          status: tenantStatus,
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      },
      enableTenant(id) {
        enableCount += 1;
        tenantStatus = "active";
        return {
          id,
          status: tenantStatus,
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      },
      getTenant(id) {
        return {
          id,
          status: tenantStatus,
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      },
      listSubscriptionArtifacts(id) {
        return [{
          id: "artifact_quota_remote",
          tenantId: id,
          status: "active"
        }];
      }
    };
    const servers = channels.map((channelRef) => ({
      id: channelRef,
      name: channelRef,
      physicalNodeRef: `node-${channelRef}`,
      runtimeAdapter: "remote-data-plane-handoff"
    }));
    const lifecycle = {
      reconcileOrderLifecycle({ reason }) {
        if (
          reason === "traffic_supply_resumed"
          || reason === "traffic_supply_resume_rolled_back"
        ) {
          return {
            ok: true,
            mutation: false,
            reports: channels.map((channelRef) => ({
              ok: true,
              mutation: false,
              channelRef,
              runtimeStatus: "pending",
              nextAction: "complete_data_plane_handoff",
              redacted: true
            })),
            redacted: true
          };
        }
        return {
          ok: true,
          mutation: true,
          runtimeReceipt: { status: "applied" },
          redacted: true
        };
      }
    };
    const createRequests = () => createPortalAccessRequestService({
      nowFn: () => now,
      controlStore: store,
      runtimeCore,
      edgeLifecycleService: lifecycle,
      edgeDesiredStateNotifier: createDataPlaneDesiredStateNotifier({
        controlStore: store,
        servers,
        nowFn: () => now
      })
    });
    const recordApplied = (notification, suffix) => {
      store.recordEdgeApplyReceipt({
        id: `receipt_${suffix}_${notification.channelRef}`,
        channelRef: notification.channelRef,
        desiredStateRef: notification.desiredStateRef,
        status: "applied",
        actionCounts: { add: 0, revoke: 0, rotate: 0, unchanged: 1 },
        configTestOk: true,
        serviceActive: true,
        listenerUdp443: true,
        appliedAt: now,
        createdAt: now
      });
    };

    const firstProcess = createRequests();
    firstProcess.suspendTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId
    });
    const suspensionLifecycleRevisionRef = store
      .getPortalAccessRequest(seeded.requestId)
      .event
      .lifecycleRevisionRef;
    assert.match(
      suspensionLifecycleRevisionRef,
      /^lifecycle_ref_[a-f0-9]{32}$/
    );
    const tombstoneNotifications = store
      .listEdgeDesiredStateNotifications()
      .filter((notification) => notification.reason === "traffic_supply_suspended");
    assert.equal(tombstoneNotifications.length, channels.length);
    for (const notification of tombstoneNotifications) {
      recordApplied(notification, "tombstone");
    }

    now = "2026-03-01T00:00:00.000Z";
    const firstAttempt = firstProcess.resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });
    assert.equal(firstAttempt.status, "quota_traffic_supply_resume_pending");
    assert.equal(enableCount, 0);
    assert.equal(tenantStatus, "disabled");
    assert.equal(
      store.getPortalAccessRequest(seeded.requestId).nextAction,
      "traffic_supply_resume_pending"
    );
    assert.equal(
      store.getPortalAccessRequest(seeded.requestId).event.lifecycleRevisionRef,
      suspensionLifecycleRevisionRef
    );
    const activeNotifications = store
      .listEdgeDesiredStateNotifications()
      .filter((notification) => notification.reason === "traffic_supply_resumed");
    assert.equal(activeNotifications.length, channels.length);
    assert.equal(
      activeNotifications.some((notification) =>
        tombstoneNotifications.some((tombstone) =>
          tombstone.channelRef === notification.channelRef
          && tombstone.desiredStateRef === notification.desiredStateRef
        )
      ),
      false
    );

    recordApplied(activeNotifications[0], "active_a");
    now = "2026-03-02T00:00:00.000Z";
    const secondProcess = createRequests();
    const secondAttempt = secondProcess.resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });
    assert.equal(secondAttempt.status, "quota_traffic_supply_resume_pending");
    assert.equal(enableCount, 0);
    assert.equal(tenantStatus, "disabled");
    assert.equal(
      store.getPortalAccessRequest(seeded.requestId).event.lifecycleRevisionRef,
      suspensionLifecycleRevisionRef
    );

    recordApplied(activeNotifications[1], "active_b");
    now = "2026-03-03T00:00:00.000Z";
    const thirdProcess = createRequests();
    const applied = thirdProcess.resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });

    assert.equal(applied.status, "quota_traffic_supply_resumed");
    assert.equal(applied.runtimeEnforcement.state, "applied");
    assert.equal(enableCount, 1);
    assert.equal(tenantStatus, "active");
    assert.equal(store.getPortalAccessRequest(seeded.requestId).status, "delivered");
    assert.equal(
      store.getPortalAccessRequest(seeded.requestId).nextAction,
      "user_can_use_access"
    );

    now = "2026-03-15T00:00:00.000Z";
    const fourthProcess = createRequests();
    fourthProcess.suspendTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId
    });
    const firstTombstoneIds = new Set(
      tombstoneNotifications.map((notification) => notification.id)
    );
    const nextTombstoneNotifications = store
      .listEdgeDesiredStateNotifications()
      .filter((notification) => (
        notification.reason === "traffic_supply_suspended"
        && !firstTombstoneIds.has(notification.id)
      ));
    assert.equal(nextTombstoneNotifications.length, channels.length);
    for (const notification of nextTombstoneNotifications) {
      recordApplied(notification, "next_tombstone");
    }

    now = "2026-04-01T00:00:00.000Z";
    const nextCycleAttempt = createRequests().resumeTrafficSupply({
      portalUserRef: "portal_user_usage_summary_1",
      requestRef: seeded.requestId,
      reviewedByRef: "usage_quota_rollover_gate"
    });
    assert.equal(nextCycleAttempt.status, "quota_traffic_supply_resume_pending");
    assert.equal(enableCount, 1);
    assert.equal(tenantStatus, "disabled");
    const firstActiveIds = new Set(
      activeNotifications.map((notification) => notification.id)
    );
    const nextActiveNotifications = store
      .listEdgeDesiredStateNotifications()
      .filter((notification) => (
        notification.reason === "traffic_supply_resumed"
        && !firstActiveIds.has(notification.id)
      ));
    assert.equal(nextActiveNotifications.length, channels.length);
    assert.equal(
      nextActiveNotifications.some((notification) =>
        activeNotifications.some((priorNotification) =>
          priorNotification.channelRef === notification.channelRef
          && priorNotification.desiredStateRef === notification.desiredStateRef
        )
      ),
      false
    );
  });
});

test("quota resume finalizes an exact active crash state after process reopen without enabling twice", () => {
  const fixture = quotaResumeCrashFixture({ desiredStateStatus: "applied" });

  const result = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });
  const stored = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");

  assert.equal(result.status, "quota_traffic_supply_resumed");
  assert.equal(result.runtimeEnforcement.state, "applied");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "active");
  assert.equal(stored.status, "delivered");
  assert.equal(stored.nextAction, "user_can_use_access");
});

test("quota resume disables an exact active crash state when applied evidence is incomplete", () => {
  const fixture = quotaResumeCrashFixture({ desiredStateStatus: "pending" });
  const disableCountBeforeRecovery = fixture.disableCount();

  const result = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });
  const stored = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.disableCount(), disableCountBeforeRecovery + 1);
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.equal(stored.status, "disabled");
  assert.equal(stored.nextAction, "traffic_supply_resume_rollback_pending");
});

test("an exact active crash state cannot finalize without an exact desired-state receipt", () => {
  const fixture = quotaResumeFixture();
  fixture.setNow("2026-03-01T00:00:00.000Z");
  const suspended = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");
  fixture.requestStore.upsertPortalAccessRequest({
    ...suspended,
    status: "disabled",
    nextAction: "traffic_supply_resume_pending",
    updatedAt: "2026-03-01T00:00:00.000Z"
  });
  fixture.setTenantStatus("active");

  const result = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
});

test("an active pending resume fails closed when its lifecycle revision is missing", () => {
  const fixture = quotaResumeFixture();
  fixture.setNow("2026-03-01T00:00:00.000Z");
  const pending = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");
  fixture.requestStore.upsertPortalAccessRequest({
    ...pending,
    status: "disabled",
    nextAction: "traffic_supply_resume_pending",
    updatedAt: "2026-03-01T00:00:00.000Z",
    event: {
      ...pending.event,
      lifecycleRevisionRef: undefined
    }
  });
  fixture.setTenantStatus("active");

  const result = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.match(
    fixture.requestStore
      .getPortalAccessRequest("pareq_quota_fixture")
      .event
      .lifecycleRevisionRef,
    /^lifecycle_ref_[a-f0-9]{32}$/
  );
});

test("an active pending resume rejects desired-state evidence with an unsafe lifecycle revision", () => {
  const fixture = quotaResumeCrashFixture({ lifecycleRevisionSafe: false });

  const result = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
});

test("a legacy disabled resume intent backfills one lifecycle revision and keeps it across retries", () => {
  const fixture = quotaResumeCrashFixture({ desiredStateStatus: "pending" });
  fixture.setTenantStatus("disabled");
  const suspended = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");
  fixture.requestStore.upsertPortalAccessRequest({
    ...suspended,
    status: "disabled",
    nextAction: "traffic_supply_suspended_quota",
    event: {
      ...suspended.event,
      lifecycleRevisionRef: undefined
    }
  });

  const first = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });
  const firstRevision = fixture.requestStore
    .getPortalAccessRequest("pareq_quota_fixture")
    .event
    .lifecycleRevisionRef;
  const second = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(first.status, "quota_traffic_supply_resume_pending");
  assert.equal(second.status, "quota_traffic_supply_resume_pending");
  assert.match(firstRevision, /^lifecycle_ref_[a-f0-9]{32}$/);
  assert.equal(
    fixture.requestStore
      .getPortalAccessRequest("pareq_quota_fixture")
      .event
      .lifecycleRevisionRef,
    firstRevision
  );
});

test("a legacy expiry cleanup intent backfills one lifecycle revision and keeps it across retries", () => {
  const fixture = quotaResumeCrashFixture({
    desiredStateStatus: "pending",
    validUntil: "2026-02-20T00:00:00.000Z"
  });
  fixture.setTenantStatus("disabled");
  const suspended = fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture");
  fixture.requestStore.upsertPortalAccessRequest({
    ...suspended,
    status: "disabled",
    nextAction: "traffic_supply_suspended_quota",
    event: {
      ...suspended.event,
      lifecycleRevisionRef: undefined
    }
  });

  const first = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });
  const firstRevision = fixture.requestStore
    .getPortalAccessRequest("pareq_quota_fixture")
    .event
    .lifecycleRevisionRef;
  const second = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(first.status, "quota_traffic_supply_expiry_cleanup_pending");
  assert.equal(second.status, "quota_traffic_supply_expiry_cleanup_pending");
  assert.match(firstRevision, /^lifecycle_ref_[a-f0-9]{32}$/);
  assert.equal(
    fixture.requestStore
      .getPortalAccessRequest("pareq_quota_fixture")
      .event
      .lifecycleRevisionRef,
    firstRevision
  );
});

test("an ordinary suspended request never treats an active tenant as a resumable crash state", () => {
  const fixture = quotaResumeFixture();
  fixture.setNow("2026-03-01T00:00:00.000Z");
  fixture.setTenantStatus("active");

  const result = fixture.reopenRequests().resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(
    result.blockers,
    [{ code: "stable_subscription_not_resumable" }]
  );
  assert.equal(fixture.enableCount(), 0);
  assert.equal(
    fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture").nextAction,
    "traffic_supply_suspended_quota"
  );
});

test("quota resume rechecks entitlement expiry after edge reconcile before enabling", () => {
  let entitlementValidUntil = "2027-01-31T00:00:00.000Z";
  const fixture = quotaResumeFixture({
    controlOverrides: {
      getEntitlement() {
        return {
          id: "ent_quota_fixture",
          accountId: "portal_user_quota_fixture",
          plan: "offerv_plan_365d_200gb_monthly_v1",
          status: "active",
          validFrom: "2026-01-31T00:00:00.000Z",
          validUntil: entitlementValidUntil,
          trafficLimitBytes: 1000
        };
      }
    },
    resumeLifecycleResult() {
      entitlementValidUntil = "2027-02-28T00:00:00.000Z";
      return {
        ok: true,
        mutation: true,
        runtimeReceipt: { status: "applied" },
        redacted: true
      };
    }
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.deepEqual(
    result.blockers,
    [{ code: "edge_runtime_enforcement_failed" }]
  );
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.equal(
    fixture.requestStore.getPortalAccessRequest("pareq_quota_fixture").nextAction,
    "traffic_supply_suspended_quota"
  );
});

test("quota resume uses a fresh clock after edge reconcile before enabling", () => {
  let fixture;
  fixture = quotaResumeFixture({
    validUntil: "2026-03-01T00:00:01.000Z",
    resumeLifecycleResult() {
      fixture.setNow("2026-03-01T00:00:02.000Z");
      return {
        ok: true,
        mutation: true,
        runtimeReceipt: { status: "applied" },
        redacted: true
      };
    }
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
});

test("quota resume rolls back local enablement when edge enforcement fails", () => {
  const fixture = quotaResumeFixture({
    resumeLifecycleResult: {
      ok: false,
      mutation: false,
      runtimeReceipt: { status: "failed" },
      redacted: true
    }
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "quota_traffic_supply_resume_failed");
  assert.equal(result.mutation, false);
  assert.equal(result.runtimeEnforcement.state, "failed");
  assert.equal(fixture.requests.getRequest("pareq_quota_fixture").status, "disabled");
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.equal(fixture.enableCount(), 0);
});

test("quota resume rejects an inexact tenant enable result or readback and preserves expiry", () => {
  const cases = [
    {
      name: "wrong enable id",
      enableTenantResult: {
        id: "tenant_other",
        status: "active",
        expiresAt: "2027-01-31T00:00:00.000Z"
      }
    },
    {
      name: "enable status is not active",
      enableTenantResult: {
        id: "tenant_quota_fixture",
        status: "disabled",
        expiresAt: "2027-01-31T00:00:00.000Z"
      }
    },
    {
      name: "wrong readback id",
      readbackTenantResult: {
        id: "tenant_other",
        status: "active",
        expiresAt: "2027-01-31T00:00:00.000Z"
      }
    },
    {
      name: "readback status is not active",
      readbackTenantResult: {
        id: "tenant_quota_fixture",
        status: "disabled",
        expiresAt: "2027-01-31T00:00:00.000Z"
      }
    },
    {
      name: "readback expiry changed",
      readbackTenantResult: {
        id: "tenant_quota_fixture",
        status: "active",
        expiresAt: "2027-02-01T00:00:00.000Z"
      }
    }
  ];

  for (const fixtureCase of cases) {
    const fixture = quotaResumeFixture(fixtureCase);
    fixture.setNow("2026-03-01T00:00:00.000Z");

    const result = fixture.requests.resumeTrafficSupply({
      portalUserRef: "portal_user_quota_fixture",
      requestRef: "pareq_quota_fixture",
      reviewedByRef: "usage_quota_rollover_gate"
    });

    assert.equal(result.ok, false, fixtureCase.name);
    assert.equal(result.status, "quota_traffic_supply_resume_failed", fixtureCase.name);
    assert.deepEqual(
      result.blockers,
      [{ code: "edge_runtime_enforcement_failed" }],
      fixtureCase.name
    );
    assert.equal(
      fixture.requests.getRequest("pareq_quota_fixture").status,
      "disabled",
      fixtureCase.name
    );
    assert.equal(
      fixture.requests.getRequest("pareq_quota_fixture").nextAction,
      "traffic_supply_suspended_quota",
      fixtureCase.name
    );
    assert.equal(fixture.tenantStatus(), "disabled", fixtureCase.name);
  }
});

test("quota resume fails closed on account, issuance, or issued-link binding drift before expensive reads", () => {
  const exactBinding = {
    id: "link_pareq_quota_fixture",
    linkId: "link_pareq_quota_fixture",
    requestId: "pareq_quota_fixture",
    accountId: "portal_user_quota_fixture",
    entitlementId: "ent_quota_fixture",
    tenantRef: safeIssuedRef("tenant", "tenant_quota_fixture"),
    artifactRef: safeIssuedRef("artifact", "artifact_quota_fixture"),
    status: "active",
    requestStatus: "issued",
    entitlementStatus: "active"
  };
  const cases = [
    {
      name: "account inactive",
      bindingOverrides: { account: { status: "disabled" } }
    },
    {
      name: "issuance not issued",
      bindingOverrides: { issuance: { status: "planned" } }
    },
    {
      name: "issuance entitlement drift",
      bindingOverrides: { issuance: { entitlementId: "ent_other" } }
    },
    {
      name: "tenant hash drift",
      bindingOverrides: { binding: { tenantRef: "tenantref_other" } }
    },
    {
      name: "artifact hash drift",
      bindingOverrides: { binding: { artifactRef: "artifactref_other" } }
    },
    {
      name: "ambiguous exact binding",
      bindingOverrides: {
        bindings: [
          exactBinding,
          { ...exactBinding, id: "link_duplicate", linkId: "link_duplicate" }
        ]
      }
    },
    {
      name: "issued link inactive on exact readback",
      bindingOverrides: { issuedLink: { status: "revoked" } }
    }
  ];

  for (const fixtureCase of cases) {
    const fixture = quotaResumeFixture(fixtureCase);
    fixture.setNow("2026-03-01T00:00:00.000Z");

    const result = fixture.requests.resumeTrafficSupply({
      portalUserRef: "portal_user_quota_fixture",
      requestRef: "pareq_quota_fixture",
      reviewedByRef: "usage_quota_rollover_gate"
    });

    assert.equal(
      result.status,
      "quota_traffic_supply_resume_not_eligible",
      fixtureCase.name
    );
    assert.deepEqual(
      result.blockers,
      [{ code: "quota_binding_not_resumable" }],
      fixtureCase.name
    );
    assert.equal(fixture.usageReadCount(), 0, fixtureCase.name);
    assert.equal(fixture.runtimeReadCount(), 0, fixtureCase.name);
    assert.equal(fixture.enableCount(), 0, fixtureCase.name);
  }
});

test("quota resume reports uncertain rollback unless forward edge compensation is applied", () => {
  const rollbackCases = [
    {
      name: "pending compensation",
      rollbackLifecycleResult: {
        ok: true,
        mutation: false,
        nextAction: "complete_data_plane_handoff",
        channelRef: "channel-quota-fixture",
        runtimeReceipt: { status: "pending" },
        redacted: true
      }
    },
    {
      name: "unknown compensation",
      rollbackLifecycleResult: {
        ok: true,
        mutation: false,
        redacted: true
      }
    }
  ];

  for (const rollbackCase of rollbackCases) {
    const fixture = quotaResumeFixture({
      ...rollbackCase,
      enableTenantResult: {
        id: "tenant_other",
        status: "active",
        expiresAt: "2027-01-31T00:00:00.000Z"
      }
    });
    fixture.setNow("2026-03-01T00:00:00.000Z");

    const result = fixture.requests.resumeTrafficSupply({
      portalUserRef: "portal_user_quota_fixture",
      requestRef: "pareq_quota_fixture",
      reviewedByRef: "usage_quota_rollover_gate"
    });

    assert.equal(result.ok, false, rollbackCase.name);
    assert.deepEqual(
      result.blockers,
      [{ code: "quota_resume_rollback_failed" }],
      rollbackCase.name
    );
    assert.equal(fixture.tenantStatus(), "disabled", rollbackCase.name);
    assert.equal(
      fixture.requests.getRequest("pareq_quota_fixture").status,
      "disabled",
      rollbackCase.name
    );
    assert.equal(
      fixture.requests.getRequest("pareq_quota_fixture").nextAction,
      "traffic_supply_resume_rollback_pending",
      rollbackCase.name
    );
  }
});

test("expired subscriptions clean up and manually disabled subscriptions never auto-resume", () => {
  const expired = quotaResumeFixture({
    validUntil: "2026-02-20T00:00:00.000Z"
  });
  expired.setNow("2026-03-01T00:00:00.000Z");
  const expiredResult = expired.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  const manual = quotaResumeFixture({ suspendWithQuota: false });
  manual.setNow("2026-03-01T00:00:00.000Z");
  const manualResult = manual.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(expiredResult.status, "quota_traffic_supply_expiry_cleanup_completed");
  assert.equal(expiredResult.runtimeEnforcement.state, "applied");
  assert.equal(expired.enableCount(), 0);
  assert.equal(expired.artifactStatus(), "revoked");
  assert.equal(manualResult.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(manualResult.blockers, [{ code: "not_quota_suspended" }]);
  assert.equal(manual.enableCount(), 0);
  assert.equal(manual.artifactStatus(), "revoked");
});

test("manual disable converts a quota suspension into a permanent disabled subscription", () => {
  const fixture = quotaResumeFixture();

  const disabled = fixture.requests.disableSubscription({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "operator_safe_ref"
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");
  const resumeAttempt = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.nextAction, "subscription_disabled");
  assert.equal(disabled.event.type, "subscription_disabled");
  assert.equal(disabled.runtimeEnforcement.state, "applied");
  assert.equal(disabled.subscriptionUrl, undefined);
  assert.equal(fixture.tenantStatus(), "disabled");
  assert.equal(fixture.artifactStatus(), "revoked");
  assert.equal(resumeAttempt.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(resumeAttempt.blockers, [{ code: "not_quota_suspended" }]);
  assert.equal(fixture.enableCount(), 0);
  assert.equal(
    fixture.requests.listQuotaSuspendedTrafficSupplies({ limit: 10 }).length,
    0
  );
});

test("manual disable clears a pending quota-resume intent while edge enforcement remains receipt-gated", () => {
  const record = materialBearingPortalRequest({
    id: "pareq_quota_manual_pending",
    portalUserRef: "portal_user_quota_manual_pending",
    status: "disabled",
    nextAction: "traffic_supply_resume_pending",
    entitlementRef: "ent_quota_manual_pending",
    tenantId: "tenant_quota_manual_pending",
    artifactId: "artifact_quota_manual_pending",
    subscriptionUrl: "https://gateway.example.test/sub/a/quota-manual-pending.yaml",
    event: {
      type: "traffic_supply_suspended",
      occurredAt: "2026-02-15T00:00:00.000Z",
      previousStatus: "delivered"
    }
  });
  const requestStore = portalRequestStoreWith([record]);
  let artifactStatus = "active";
  let tenantStatus = "disabled";
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-01T00:00:00.000Z",
    portalAccessRequestStore: requestStore,
    runtimeCore: {
      revokeSubscriptionArtifact(id) {
        artifactStatus = "revoked";
        return { id, status: artifactStatus };
      },
      disableTenant(id) {
        tenantStatus = "disabled";
        return { id, status: tenantStatus };
      }
    },
    edgeLifecycleService: {
      reconcileOrderLifecycle() {
        return {
          ok: true,
          mutation: false,
          channelRef: "channel-quota-manual-pending",
          runtimeReceipt: { status: "pending" },
          nextAction: "complete_data_plane_handoff",
          redacted: true
        };
      }
    },
    edgeDesiredStateNotifier: {
      notifyOrderLifecycle() {
        return {
          ok: true,
          notificationCount: 1,
          notifications: [{
            channelRef: "channel-quota-manual-pending",
            status: "pending"
          }],
          redacted: true
        };
      }
    }
  });

  const disabled = requests.disableSubscription({
    portalUserRef: "portal_user_quota_manual_pending",
    requestRef: "pareq_quota_manual_pending",
    reviewedByRef: "operator_safe_ref"
  });
  const stored = requestStore.getPortalAccessRequest("pareq_quota_manual_pending");
  const resumeAttempt = requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_manual_pending",
    requestRef: "pareq_quota_manual_pending",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(disabled.runtimeEnforcement.state, "pending");
  assert.equal(stored.status, "disabled");
  assert.equal(stored.nextAction, "subscription_disabled");
  assert.equal(stored.event.type, "subscription_disabled");
  assert.equal(stored.subscriptionUrl, null);
  assert.equal(artifactStatus, "revoked");
  assert.equal(tenantStatus, "disabled");
  assert.equal(resumeAttempt.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(resumeAttempt.blockers, [{ code: "not_quota_suspended" }]);
});

test("manual disable permanently closes an expiry cleanup pending intent", () => {
  const record = materialBearingPortalRequest({
    id: "pareq_quota_manual_expiry_pending",
    portalUserRef: "portal_user_quota_manual_expiry_pending",
    status: "disabled",
    nextAction: "traffic_supply_expiry_cleanup_pending",
    entitlementRef: "ent_quota_manual_expiry_pending",
    tenantId: "tenant_quota_manual_expiry_pending",
    artifactId: "artifact_quota_manual_expiry_pending",
    subscriptionUrl: null,
    event: {
      type: "traffic_supply_suspended",
      occurredAt: "2026-02-15T00:00:00.000Z",
      previousStatus: "delivered"
    }
  });
  const requestStore = portalRequestStoreWith([record]);
  let artifactStatus = "revoked";
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-03T00:00:00.000Z",
    portalAccessRequestStore: requestStore,
    runtimeCore: {
      revokeSubscriptionArtifact(id) {
        artifactStatus = "revoked";
        return { id, status: artifactStatus };
      },
      disableTenant(id) {
        return { id, status: "disabled" };
      }
    },
    edgeLifecycleService: edgeLifecycleService({ applied: true })
  });

  const disabled = requests.disableSubscription({
    portalUserRef: "portal_user_quota_manual_expiry_pending",
    requestRef: "pareq_quota_manual_expiry_pending",
    reviewedByRef: "operator_safe_ref"
  });
  const stored = requestStore.getPortalAccessRequest("pareq_quota_manual_expiry_pending");

  assert.equal(disabled.nextAction, "subscription_disabled");
  assert.equal(stored.nextAction, "subscription_disabled");
  assert.equal(stored.event.type, "subscription_disabled");
  assert.equal(stored.subscriptionUrl, null);
  assert.equal(artifactStatus, "revoked");
  assert.deepEqual(requests.listQuotaSuspendedTrafficSupplies({ limit: 10 }), []);
});

test("quota resume stays disabled when the new cycle is already exhausted", () => {
  const fixture = quotaResumeFixture({
    usageSamples: [{
      uploadBytes: 400,
      downloadBytes: 600,
      totalBytes: 1000,
      observedAt: "2026-03-01T00:05:00.000Z",
      createdAt: "2026-03-01T00:05:00.000Z"
    }]
  });
  fixture.setNow("2026-03-01T00:10:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(result.blockers, [{ code: "current_cycle_quota_exhausted" }]);
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.requests.getRequest("pareq_quota_fixture").status, "disabled");
});

test("quota resume rejects a disabled tenant whose expiry drifted from the entitlement", () => {
  const fixture = quotaResumeFixture({
    tenantExpiresAt: "2026-12-31T00:00:00.000Z"
  });
  fixture.setNow("2026-03-01T00:00:00.000Z");

  const result = fixture.requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_fixture",
    requestRef: "pareq_quota_fixture",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resume_not_eligible");
  assert.deepEqual(result.blockers, [{ code: "stable_subscription_not_resumable" }]);
  assert.equal(fixture.enableCount(), 0);
  assert.equal(fixture.tenantStatus(), "disabled");
});

test("quota resume restores an originally issued Portal request to issued", () => {
  let tenantStatus = "disabled";
  const record = materialBearingPortalRequest({
    id: "pareq_quota_issued",
    portalUserRef: "portal_user_quota_issued",
    plan: "yearly",
    durationDays: 365,
    status: "disabled",
    nextAction: "traffic_supply_suspended_quota",
    submittedAt: "2026-01-31T00:00:00.000Z",
    updatedAt: "2026-02-15T00:00:00.000Z",
    expiresAt: "2027-01-31T00:00:00.000Z",
    validUntil: "2027-01-31T00:00:00.000Z",
    entitlementRef: "ent_quota_issued",
    tenantId: "tenant_quota_issued",
    artifactId: "artifact_quota_issued",
    subscriptionUrl: "https://gateway.example.test/sub/a/quota-issued.yaml",
    event: {
      type: "traffic_supply_suspended",
      occurredAt: "2026-02-15T00:00:00.000Z",
      previousStatus: "issued"
    }
  });
  const store = portalRequestStoreWith([record]);
  const requests = createPortalAccessRequestService({
    nowFn: () => "2026-03-01T00:00:00.000Z",
    portalAccessRequestStore: store,
    controlStore: {
      getEntitlement() {
        return {
          id: "ent_quota_issued",
          accountId: "portal_user_quota_issued",
          plan: "offerv_plan_365d_200gb_monthly_v1",
          status: "active",
          validFrom: "2026-01-31T00:00:00.000Z",
          validUntil: "2027-01-31T00:00:00.000Z",
          trafficLimitBytes: 1000
        };
      },
      getAccount() {
        return {
          id: "portal_user_quota_issued",
          ownerRef: "portal_user_quota_issued",
          status: "active"
        };
      },
      getIssuanceRequest() {
        return {
          id: "pareq_quota_issued",
          accountId: "portal_user_quota_issued",
          entitlementId: "ent_quota_issued",
          status: "issued"
        };
      },
      listIssuedSubscriptionBindings() {
        return [{
          id: "link_pareq_quota_issued",
          requestId: "pareq_quota_issued",
          accountId: "portal_user_quota_issued",
          entitlementId: "ent_quota_issued",
          tenantRef: safeIssuedRef("tenant", "tenant_quota_issued"),
          artifactRef: safeIssuedRef("artifact", "artifact_quota_issued"),
          status: "active",
          requestStatus: "issued",
          entitlementStatus: "active"
        }];
      },
      getIssuedLink() {
        return {
          id: "link_pareq_quota_issued",
          requestId: "pareq_quota_issued",
          tenantRef: safeIssuedRef("tenant", "tenant_quota_issued"),
          artifactRef: safeIssuedRef("artifact", "artifact_quota_issued"),
          status: "active"
        };
      },
      listUsageSamples() {
        return [];
      }
    },
    runtimeCore: {
      getTenant() {
        return {
          id: "tenant_quota_issued",
          status: tenantStatus,
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      },
      listSubscriptionArtifacts() {
        return [{
          id: "artifact_quota_issued",
          tenantId: "tenant_quota_issued",
          status: "active"
        }];
      },
      enableTenant() {
        tenantStatus = "active";
        return {
          id: "tenant_quota_issued",
          status: tenantStatus,
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      },
      disableTenant() {
        tenantStatus = "disabled";
        return {
          id: "tenant_quota_issued",
          status: tenantStatus,
          expiresAt: "2027-01-31T00:00:00.000Z"
        };
      }
    },
    edgeLifecycleService: edgeLifecycleService({ applied: true })
  });

  const result = requests.resumeTrafficSupply({
    portalUserRef: "portal_user_quota_issued",
    requestRef: "pareq_quota_issued",
    reviewedByRef: "usage_quota_rollover_gate"
  });

  assert.equal(result.status, "quota_traffic_supply_resumed");
  assert.equal(result.request.status, "issued");
  assert.equal(store.getPortalAccessRequest("pareq_quota_issued").status, "issued");
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
