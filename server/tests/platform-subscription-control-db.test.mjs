import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";

function withStore(fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-subscription-control-"));
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

test("subscription control store persists the business issuance lifecycle", () => {
  withStore((store) => {
    const now = "2026-05-29T00:00:00.000Z";

    const account = store.createAccount({
      id: "acct_alpha",
      ownerRef: "cust_8f14e45fceea167a",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: "operator_provisioning_form",
        channel: "manual"
      }
    });
    assert.equal(account.id, "acct_alpha");
    assert.equal(account.ownerRef, "cust_8f14e45fceea167a");
    assert.equal(account.metadata.source, "operator_provisioning_form");

    const entitlement = store.createEntitlement({
      id: "ent_pilot",
      accountId: account.id,
      plan: "pilot",
      status: "active",
      validFrom: now,
      validUntil: "2099-06-04T00:00:00.000Z",
      maxArtifacts: 3,
      maxDevices: 2,
      trafficLimitBytes: 1024,
      createdAt: now,
      updatedAt: now
    });
    assert.equal(entitlement.usable, true);

    const request = store.createIssuanceRequest({
      id: "iss_preprod_001",
      accountId: account.id,
      entitlementId: entitlement.id,
      approvalRef: "chat-approval-001",
      status: "planned",
      quantity: 1,
      nodeId: "channel-lab-b-tuic",
      purpose: "preproduction-canary",
      requestedByRef: "operator_1f3870be274f6c49",
      createdAt: now,
      updatedAt: now
    });
    assert.equal(request.status, "planned");
    assert.equal(request.quantity, 1);

    const link = store.linkIssuedSubscription({
      id: "link_001",
      requestId: request.id,
      tenantRef: "tenantref_0123456789abcdef",
      artifactRef: "artifactref_0123456789abcdef",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    assert.equal(link.tenantRef, "tenantref_0123456789abcdef");

    store.setIssuanceRequestStatus(request.id, {
      status: "issued",
      updatedAt: "2026-05-29T00:01:00.000Z"
    });

    store.upsertQuotaCounter({
      accountId: account.id,
      entitlementId: entitlement.id,
      metric: "artifact_issuance",
      period: "2026-05",
      amount: 1,
      updatedAt: now
    });
    store.bindDevice({
      id: "dev_001",
      accountId: account.id,
      artifactRef: link.artifactRef,
      deviceRef: "device_9f86d081884c7d65",
      status: "active",
      firstSeenAt: now,
      lastSeenAt: now
    });
    store.recordAuditEvent({
      id: "audit_001",
      entityType: "issuance_request",
      entityRef: request.id,
      action: "issued",
      actorRef: "operator_1f3870be274f6c49",
      createdAt: now,
      metadata: {
        source: "platform:issue-subscription"
      }
    });

    const summary = store.getAccountControlSummary(account.id);
    assert.equal(summary.account.id, account.id);
    assert.equal(summary.entitlements.length, 1);
    assert.equal(summary.issuanceRequests.length, 1);
    assert.equal(summary.issuanceRequests[0].status, "issued");
    assert.equal(summary.issuedLinks.length, 1);
    assert.equal(summary.quotaCounters.length, 1);
    assert.equal(summary.deviceBindings.length, 1);
    assert.equal(summary.auditEvents.length, 1);

    store.recordRevocation({
      id: "rev_001",
      requestId: request.id,
      issuedLinkId: link.id,
      tenantRef: link.tenantRef,
      artifactRef: link.artifactRef,
      reasonCode: "operator_revoke",
      revokedByRef: "operator_1f3870be274f6c49",
      createdAt: "2026-05-29T00:02:00.000Z"
    });
    store.setIssuedLinkStatus(link.id, {
      status: "revoked",
      updatedAt: "2026-05-29T00:02:00.000Z"
    });

    const afterRevoke = store.getAccountControlSummary(account.id);
    assert.equal(afterRevoke.revocationEvents.length, 1);
    assert.equal(afterRevoke.issuedLinks[0].status, "revoked");
  });
});

test("subscription control store rejects raw secrets and customer data fields", () => {
  withStore((store) => {
    assert.throws(() => store.createAccount({
      id: "acct_bad",
      ownerRef: "cust_hash",
      status: "active",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
      customerEmail: "owner@sensitive.example"
    }), /unsafe field is not allowed/);

    assert.throws(() => store.linkIssuedSubscription({
      id: "link_bad",
      requestId: "iss_missing",
      tenantRef: "tenantref_safe",
      artifactRef: "artifactref_safe",
      status: "active",
      subscriptionUrl: "https://example.com/sub/a/secret",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z"
    }), /unsafe field is not allowed/);
  });
});

test("subscription control store rolls back grouped control writes on failure", () => {
  withStore((store) => {
    const now = "2026-05-29T00:00:00.000Z";
    store.createAccount({
      id: "acct_tx",
      ownerRef: "cust_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.createEntitlement({
      id: "ent_tx",
      accountId: "acct_tx",
      plan: "pilot",
      status: "active",
      validFrom: now,
      validUntil: "2099-06-04T00:00:00.000Z",
      createdAt: now,
      updatedAt: now
    });
    store.createIssuanceRequest({
      id: "iss_tx",
      accountId: "acct_tx",
      entitlementId: "ent_tx",
      approvalRef: "approval_tx",
      status: "planned",
      quantity: 1,
      nodeId: "node_tx",
      purpose: "test",
      requestedByRef: "operator_safe_ref",
      createdAt: now,
      updatedAt: now
    });

    assert.throws(() => {
      store.runInTransaction(() => {
        store.linkIssuedSubscription({
          id: "link_tx",
          requestId: "iss_tx",
          tenantRef: "tenantref_0123456789abcdef",
          artifactRef: "artifactref_0123456789abcdef",
          status: "active",
          createdAt: now,
          updatedAt: now
        });
        store.upsertQuotaCounter({
          accountId: "acct_tx",
          entitlementId: "ent_tx",
          metric: "artifact_issuance",
          period: "2026-05",
          amount: 1,
          updatedAt: now
        });
        throw new Error("simulate control finalization failure");
      });
    }, /simulate control finalization failure/);

    const summary = store.getAccountControlSummary("acct_tx");
    assert.equal(summary.issuedLinks.length, 0);
    assert.equal(summary.quotaCounters.length, 0);
    assert.equal(summary.issuanceRequests[0].status, "planned");
  });
});

test("subscription control store exposes only safe references in serialized summaries", () => {
  withStore((store) => {
    const now = "2026-05-29T00:00:00.000Z";
    store.createAccount({
      id: "acct_public_summary",
      ownerRef: "cust_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.recordAuditEvent({
      id: "audit_safe",
      entityType: "account",
      entityRef: "acct_public_summary",
      action: "created",
      actorRef: "operator_safe_ref",
      createdAt: now,
      metadata: {
        publicEvidence: "summary-only"
      }
    });

    const serialized = JSON.stringify(store.getAccountControlSummary("acct_public_summary"));
    assert.doesNotMatch(serialized, /owner@sensitive\.example/);
    assert.doesNotMatch(serialized, /subscriptionUrl|artifactSecret|token|password|credential/i);
  });
});
