import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createUserPortalSubscriptionService } from "../services/platform/user-portal-subscriptions.mjs";

const NOW = "2026-05-31T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";
const EXPIRED = "2026-05-30T23:59:59.000Z";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "user-portal-subscriptions-"));
  const store = createSqliteSubscriptionControlStore({
    dbPath: join(tempDir, "control.sqlite")
  });
  try {
    return fn(store);
  } finally {
    store.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function seedAccount(store, {
  sessionExpiresAt = FUTURE,
  entitlementValidFrom = NOW,
  linkStatus = "active",
  requestStatus = "issued",
  entitlementStatus = "active"
} = {}) {
  store.createAccount({
    id: "acct_portal_sub_1",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_portal_sub_1",
    accountId: "acct_portal_sub_1",
    plan: "pilot",
    status: entitlementStatus,
    validFrom: entitlementValidFrom,
    validUntil: FUTURE,
    maxArtifacts: 1,
    maxDevices: 2,
    trafficLimitBytes: 2048,
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createIssuanceRequest({
    id: "req_portal_sub_1",
    accountId: "acct_portal_sub_1",
    entitlementId: "ent_portal_sub_1",
    approvalRef: "approval_safe_ref",
    status: requestStatus,
    quantity: 1,
    nodeId: "channel-lab-b-tuic",
    purpose: "preproduction-canary",
    requestedByRef: "operator_safe_ref",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.linkIssuedSubscription({
    id: "link_portal_sub_1",
    requestId: "req_portal_sub_1",
    tenantRef: "tenantref_safe",
    artifactRef: "artifactref_safe",
    status: linkStatus,
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createPortalSession({
    id: "portal_session_sub_1",
    accountId: "acct_portal_sub_1",
    entryId: null,
    authMethod: "totp",
    status: "active",
    issuedAt: NOW,
    expiresAt: sessionExpiresAt,
    updatedAt: NOW
  });
}

test("user portal subscription summary returns only session-scoped safe metadata", () => withStore((store) => {
  seedAccount(store);
  const service = createUserPortalSubscriptionService({
    controlStore: store,
    nowFn: () => NOW
  });

  const summary = service.getSubscriptionSummary({
    sessionRef: "portal_session_sub_1"
  });

  assert.equal(summary.type, "user_portal_subscription_summary");
  assert.equal(summary.account.accountId, "acct_portal_sub_1");
  assert.equal(summary.entitlements.length, 1);
  assert.equal(summary.entitlements[0].usable, true);
  assert.deepEqual(summary.issuedLinks, [{
    issuedLinkId: "link_portal_sub_1",
    entitlementId: "ent_portal_sub_1",
    requestId: "req_portal_sub_1",
    artifactRef: "artifactref_safe",
    status: "active",
    refreshAllowed: true,
    createdAt: NOW,
    updatedAt: NOW
  }]);
  assert.equal(summary.safety.rawUrlReturned, false);
  assert.equal(summary.safety.rawDeliveryMaterialReturned, false);
  assert.equal(summary.safety.operatorRequiredForRefresh, false);

  const serialized = JSON.stringify(summary).toLowerCase();
  assert.equal(serialized.includes("subscriptionurl"), false);
  assert.equal(serialized.includes("token="), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("portal_session_sub_1"), false);
}));

test("user portal subscription summary rejects expired portal sessions", () => withStore((store) => {
  seedAccount(store, { sessionExpiresAt: EXPIRED });
  const service = createUserPortalSubscriptionService({
    controlStore: store,
    nowFn: () => NOW
  });

  assert.throws(() => service.getSubscriptionSummary({
    sessionRef: "portal_session_sub_1"
  }), /portal session is expired/);
}));

test("user portal subscription refresh records a user audit without returning raw delivery material", () => withStore((store) => {
  seedAccount(store);
  const service = createUserPortalSubscriptionService({
    controlStore: store,
    nowFn: () => NOW,
    auditRefFactory: () => "audit_portal_refresh_1"
  });

  const result = service.requestSubscriptionRefresh({
    sessionRef: "portal_session_sub_1",
    entitlementId: "ent_portal_sub_1"
  });

  assert.equal(result.action, "portal_subscription_refresh_ready");
  assert.equal(result.accountId, "acct_portal_sub_1");
  assert.equal(result.entitlementId, "ent_portal_sub_1");
  assert.equal(result.issuedLink.issuedLinkId, "link_portal_sub_1");
  assert.equal(result.issuedLink.artifactRef, "artifactref_safe");
  assert.equal(result.refresh.mode, "existing_artifact_route");
  assert.equal(result.refresh.operatorRequired, false);
  assert.equal(result.safety.runtimeDbMutated, false);
  assert.equal(result.safety.controlDbMutated, true);
  assert.equal(result.safety.auditOnlyMutation, true);
  assert.equal(result.safety.rawUrlReturned, false);

  const audit = store.getAuditEvent("audit_portal_refresh_1");
  assert.equal(audit.entityType, "issued_subscription_link");
  assert.equal(audit.entityRef, "link_portal_sub_1");
  assert.equal(audit.action, "portal_subscription_refresh_requested");
  assert.equal(audit.actorRef, "acct_portal_sub_1");

  const serialized = JSON.stringify({ result, audit }).toLowerCase();
  assert.equal(serialized.includes("subscriptionurl"), false);
  assert.equal(serialized.includes("token="), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("portal_session_sub_1"), false);
}));

test("user portal subscription refresh fails closed when no active issued link exists", () => withStore((store) => {
  seedAccount(store, { linkStatus: "revoked" });
  const service = createUserPortalSubscriptionService({
    controlStore: store,
    nowFn: () => NOW
  });

  assert.throws(() => service.requestSubscriptionRefresh({
    sessionRef: "portal_session_sub_1",
    entitlementId: "ent_portal_sub_1"
  }), /active issued subscription link not found/);
}));

test("user portal subscription refresh fails closed before entitlement validity window starts", () => withStore((store) => {
  seedAccount(store, { entitlementValidFrom: "2099-01-01T00:00:00.000Z" });
  const service = createUserPortalSubscriptionService({
    controlStore: store,
    nowFn: () => NOW
  });

  assert.throws(() => service.requestSubscriptionRefresh({
    sessionRef: "portal_session_sub_1",
    entitlementId: "ent_portal_sub_1"
  }), /active entitlement not found/);
}));
