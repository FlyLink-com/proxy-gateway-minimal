import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
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

test("subscription control store updates entitlement traffic limits without changing runtime bindings", () => {
  withStore((store) => {
    const now = "2026-06-15T00:00:00.000Z";
    store.createAccount({
      id: "acct_quota_edit",
      ownerRef: "portal_user_quota_edit",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.createEntitlement({
      id: "ent_quota_edit",
      accountId: "acct_quota_edit",
      plan: "monthly",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-15T00:00:00.000Z",
      trafficLimitBytes: 1024,
      createdAt: now,
      updatedAt: now
    });
    store.createIssuanceRequest({
      id: "pareq_quota_edit",
      accountId: "acct_quota_edit",
      entitlementId: "ent_quota_edit",
      approvalRef: "approval_quota_edit",
      status: "issued",
      quantity: 1,
      nodeId: "channel-vultr-a-vless-reality-tcp",
      purpose: "portal_access_request",
      requestedByRef: "operator_safe_ref",
      createdAt: now,
      updatedAt: now
    });
    store.linkIssuedSubscription({
      id: "link_quota_edit",
      requestId: "pareq_quota_edit",
      tenantRef: "tenant_quota_edit",
      artifactRef: "artifact_quota_edit",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const updated = store.updateEntitlementTrafficLimit("ent_quota_edit", {
      trafficLimitBytes: 2048,
      updatedAt: "2026-06-15T00:01:00.000Z"
    });

    assert.equal(updated.trafficLimitBytes, 2048);
    assert.equal(updated.updatedAt, "2026-06-15T00:01:00.000Z");
    assert.equal(store.getEntitlement("ent_quota_edit").trafficLimitBytes, 2048);
    assert.equal(
      store.findIssuedSubscriptionBindingByTenantRef("tenant_quota_edit").trafficLimitBytes,
      2048
    );
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

test("subscription control store persists portal password credential summaries safely", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_auth_1",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const credential = store.createPortalPasswordCredential({
      id: "pwd_cred_1",
      accountId: "acct_auth_1",
      passwordHash: "scrypt$v=1$N=32768$r=8$p=1$saltref$hashref",
      status: "active",
      mustRotate: true,
      createdAt: now,
      updatedAt: now
    });

    assert.equal(credential.id, "pwd_cred_1");
    assert.equal(credential.accountId, "acct_auth_1");
    assert.equal(credential.mustRotate, true);
    assert.equal(store.getActivePortalPasswordCredential("acct_auth_1").id, "pwd_cred_1");

    const serialized = JSON.stringify(store.getAccountControlSummary("acct_auth_1"));
    assert.doesNotMatch(serialized, /passwordHash|scrypt\$v=1|saltref|hashref|credential/i);
  });
});

test("subscription control store records redacted edge apply receipts", () => {
  withStore((store) => {
    const now = "2026-06-05T00:00:00.000Z";

    const receipt = store.recordEdgeApplyReceipt({
      id: "edge_receipt_001",
      channelRef: "channel-aliyun-a-tuic",
      desiredStateRef: "desired_state_orders_001",
      status: "applied",
      actionCounts: {
        add: 1,
        revoke: 1,
        rotate: 0,
        unchanged: 2
      },
      configTestOk: true,
      serviceActive: true,
      listenerUdp443: true,
      backupRef: "backup_aliyun_001",
      appliedAt: now,
      createdAt: now
    });

    assert.equal(receipt.id, "edge_receipt_001");
    assert.equal(receipt.channelRef, "channel-aliyun-a-tuic");
    assert.equal(receipt.status, "applied");
    assert.deepEqual(receipt.actionCounts, {
      add: 1,
      revoke: 1,
      rotate: 0,
      unchanged: 2
    });
    assert.equal(receipt.configTestOk, true);
    assert.equal(receipt.serviceActive, true);
    assert.equal(receipt.listenerUdp443, true);

    const receipts = store.listEdgeApplyReceipts({
      channelRef: "channel-aliyun-a-tuic"
    });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].desiredStateRef, "desired_state_orders_001");
    assert.doesNotMatch(JSON.stringify(receipts), /password|rawConfig|subscriptionUrl|uuid|token/i);
  });
});

test("subscription control store persists safe edge desired-state notifications", () => {
  withStore((store) => {
    const now = "2026-06-11T00:00:00.000Z";

    const notification = store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_001",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_001",
      generation: "gen_001",
      reason: "order_delivered",
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    assert.equal(notification.id, "edge_state_notify_001");
    assert.equal(notification.nodeRef, "vultr-sgp-a");
    assert.equal(notification.channelRef, "channel-sgp-a-hy2");
    assert.equal(notification.status, "pending");

    const updated = store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_001",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_001",
      generation: "gen_001",
      reason: "order_delivered",
      status: "acknowledged",
      createdAt: now,
      updatedAt: "2026-06-11T00:01:00.000Z"
    });

    assert.equal(updated.status, "acknowledged");
    assert.equal(updated.createdAt, now);
    assert.equal(updated.updatedAt, "2026-06-11T00:01:00.000Z");

    const byNode = store.listEdgeDesiredStateNotifications({
      nodeRef: "vultr-sgp-a"
    });
    assert.equal(byNode.length, 1);
    assert.equal(byNode[0].desiredStateRef, "desired_state_channel-sgp-a-hy2_001");

    const byChannel = store.listEdgeDesiredStateNotifications({
      channelRef: "channel-sgp-a-hy2",
      status: "acknowledged"
    });
    assert.equal(byChannel.length, 1);
    assert.doesNotMatch(JSON.stringify(byChannel), /password|rawConfig|subscriptionUrl|uuid|token/i);

    assert.throws(() => store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_unsafe",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_unsafe",
      generation: "gen_unsafe",
      reason: "order_delivered",
      status: "pending",
      rawConfig: "users:\n- password: unsafe",
      createdAt: now,
      updatedAt: now
    }), /unsafe field is not allowed/);
  });
});

test("subscription control store marks matching desired-state notification applied from receipt", () => {
  withStore((store) => {
    const now = "2026-06-14T00:00:00.000Z";

    store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_apply_001",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_current",
      generation: "gen_current",
      reason: "order_delivered",
      status: "pending",
      createdAt: now,
      updatedAt: now
    });
    store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_apply_old",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_old",
      generation: "gen_old",
      reason: "order_delivered",
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    store.recordEdgeApplyReceipt({
      id: "edge_receipt_apply_001",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_current",
      status: "applied",
      actionCounts: {
        add: 1,
        revoke: 0,
        rotate: 0,
        unchanged: 0
      },
      configTestOk: true,
      serviceActive: true,
      listenerUdp443: true,
      appliedAt: "2026-06-14T00:01:00.000Z",
      createdAt: "2026-06-14T00:01:00.000Z"
    });

    const applied = store.getEdgeDesiredStateNotification("edge_state_notify_apply_001");
    const old = store.getEdgeDesiredStateNotification("edge_state_notify_apply_old");
    assert.equal(applied.status, "applied");
    assert.equal(applied.updatedAt, "2026-06-14T00:01:00.000Z");
    assert.equal(old.status, "pending");
  });
});

test("subscription control store persists portal access request lifecycle", () => {
  withStore((store) => {
    const now = "2026-06-06T00:00:00.000Z";

    const created = store.upsertPortalAccessRequest({
      id: "pareq_store_001",
      portalUserRef: "portal_user_store_001",
      plan: "monthly",
      clientTarget: "clash",
      durationDays: 30,
      quantity: 1,
      status: "pending_admin_review",
      nextAction: "admin_review_required",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: now,
      updatedAt: now
    });

    assert.equal(created.id, "pareq_store_001");
    assert.equal(created.status, "pending_admin_review");

    const delivered = store.upsertPortalAccessRequest({
      ...created,
      status: "delivered",
      nextAction: "user_can_use_access",
      reviewedByRef: "portal_auto_issuer",
      reviewedAt: "2026-06-06T00:01:00.000Z",
      expiresAt: "2026-07-06T00:00:00.000Z",
      validUntil: "2026-07-06T00:00:00.000Z",
      entitlementRef: "ent_pareq_store_001",
      accessGrantRef: "grant_pareq_store_001",
      tenantId: "tenant_store_001",
      artifactId: "artifact_store_001",
      subscriptionUrl: "https://sub.example.test/sub/a/store-visible-once.yaml",
      edgeChannelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_store_001",
      edgeMaterialDigest: "sha256:digest_pareq_store_001",
      updatedAt: "2026-06-06T00:01:00.000Z"
    });

    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.validUntil, "2026-07-06T00:00:00.000Z");
    assert.equal(store.getPortalAccessRequest("pareq_store_001").edgeChannelRef, "channel-aliyun-a-tuic");

    const listed = store.listPortalAccessRequests({
      portalUserRef: "portal_user_store_001"
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].subscriptionUrl, "https://sub.example.test/sub/a/store-visible-once.yaml");
    assert.doesNotMatch(JSON.stringify(listed), /password|uuid|rawConfig|token/i);
  });
});

test("subscription control store emits an empty desired-state after the last channel credential is disabled", () => {
  withStore((store) => {
    const delivered = store.upsertPortalAccessRequest({
      id: "pareq_desired_tombstone_001",
      portalUserRef: "portal_user_desired_tombstone",
      plan: "monthly",
      clientTarget: "clash",
      durationDays: 30,
      quantity: 1,
      status: "delivered",
      nextAction: "user_can_use_access",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:01:00.000Z",
      expiresAt: "2099-08-10T00:00:00.000Z",
      validUntil: "2099-08-10T00:00:00.000Z",
      edgeChannelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_desired_tombstone_001",
      edgeMaterialDigest: "sha256:digest_desired_tombstone_001"
    });
    const active = store.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "vultr-sgp-a"
    });
    assert.deepEqual(active.edgeCredentialRefs, ["edgecred_desired_tombstone_001"]);

    store.upsertPortalAccessRequest({
      ...delivered,
      status: "disabled",
      nextAction: "traffic_supply_suspended_quota",
      subscriptionUrl: null,
      updatedAt: "2026-07-11T00:02:00.000Z"
    });
    const tombstone = store.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "vultr-sgp-a"
    });

    assert.ok(tombstone);
    assert.deepEqual(tombstone.channelRefs, ["channel-sgp-a-hy2"]);
    assert.deepEqual(tombstone.edgeCredentialRefs, []);
    assert.deepEqual(tombstone.materialDigests, []);
    assert.notEqual(tombstone.desiredStateRef, active.desiredStateRef);

    const repeated = store.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "vultr-sgp-a"
    });
    assert.equal(repeated.desiredStateRef, tombstone.desiredStateRef);
    assert.equal(repeated.generation, tombstone.generation);
    assert.deepEqual(repeated.edgeCredentialRefs, []);
  });
});

test("subscription control store upgrades legacy portal access request schema", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-subscription-control-legacy-"));
  let db;
  let store;
  try {
    const dbPath = join(tempDir, "control.sqlite");
    db = new Database(dbPath);
    db.exec(`
      create table platform_portal_access_requests (
        id text primary key,
        portal_user_ref text not null,
        plan text not null,
        client_target text not null default 'clash',
        duration_days integer not null check (duration_days > 0),
        quantity integer not null check (quantity > 0),
        status text not null,
        next_action text not null,
        note_provided integer not null default 0 check (note_provided in (0, 1)),
        prior_trial_state text not null,
        submitted_at text not null,
        updated_at text not null,
        reviewed_at text,
        reviewed_by_ref text,
        safe_reason_code text,
        entitlement_ref text,
        access_grant_ref text,
        expires_at text,
        valid_until text,
        runtime_mutated integer not null default 0 check (runtime_mutated in (0, 1)),
        production_mutated integer not null default 0 check (production_mutated in (0, 1)),
        delivery_link_count integer not null default 0
      );
    `);
    db.close();
    db = null;

    store = createSqliteSubscriptionControlStore({ dbPath });
    const saved = store.upsertPortalAccessRequest({
      id: "pareq_legacy_upgrade_001",
      portalUserRef: "portal_user_legacy_upgrade",
      plan: "monthly",
      clientTarget: "clash",
      durationDays: 30,
      quantity: 1,
      status: "delivered",
      nextAction: "user_can_use_access",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:01:00.000Z",
      reviewedAt: "2026-06-06T00:01:00.000Z",
      reviewedByRef: "portal_auto_issuer",
      expiresAt: "2026-07-06T00:00:00.000Z",
      validUntil: "2026-07-06T00:00:00.000Z",
      entitlementRef: "ent_pareq_legacy_upgrade_001",
      accessGrantRef: "grant_pareq_legacy_upgrade_001",
      tenantId: "tenant_legacy_upgrade_001",
      artifactId: "artifact_legacy_upgrade_001",
      subscriptionUrl: "https://sub.example.test/sub/a/legacy-upgrade.yaml",
      edgeChannelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_legacy_upgrade_001",
      edgeMaterialDigest: "sha256:digest_pareq_legacy_upgrade_001",
      edgeLifecycleMutation: true,
      event: { status: "auto_issued" }
    });

    assert.equal(saved.tenantId, "tenant_legacy_upgrade_001");
    assert.equal(saved.edgeLifecycleMutation, true);
    assert.equal(store.getPortalAccessRequest("pareq_legacy_upgrade_001").edgeChannelRef, "channel-aliyun-a-tuic");
  } finally {
    db?.close();
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("subscription control store lists issued subscription bindings for edge recovery", () => {
  withStore((store) => {
    const now = "2026-06-05T00:00:00.000Z";
    store.createAccount({
      id: "acct_edge_recovery",
      ownerRef: "portal_user_edge_recovery",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.createEntitlement({
      id: "ent_edge_recovery",
      accountId: "acct_edge_recovery",
      plan: "monthly",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-05T00:00:00.000Z",
      createdAt: now,
      updatedAt: now
    });
    store.createIssuanceRequest({
      id: "pareq_edge_recovery_001",
      accountId: "acct_edge_recovery",
      entitlementId: "ent_edge_recovery",
      approvalRef: "approval_edge_recovery",
      status: "issued",
      quantity: 1,
      nodeId: "channel-aliyun-a-tuic",
      purpose: "portal_access_request",
      requestedByRef: "portal_auto_issuer",
      createdAt: now,
      updatedAt: now
    });
    store.linkIssuedSubscription({
      id: "link_edge_recovery_001",
      requestId: "pareq_edge_recovery_001",
      tenantRef: "tenant_edge_recovery_001",
      artifactRef: "artifact_edge_recovery_001",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const bindings = store.listIssuedSubscriptionBindings({
      nodeId: "channel-aliyun-a-tuic"
    });
    assert.equal(bindings.length, 1);
    assert.deepEqual(bindings[0], {
      id: "link_edge_recovery_001",
      linkId: "link_edge_recovery_001",
      requestId: "pareq_edge_recovery_001",
      accountId: "acct_edge_recovery",
      entitlementId: "ent_edge_recovery",
      tenantRef: "tenant_edge_recovery_001",
      artifactRef: "artifact_edge_recovery_001",
      status: "active",
      requestStatus: "issued",
      entitlementStatus: "active",
      nodeId: "channel-aliyun-a-tuic",
      plan: "monthly",
      validFrom: "2026-06-05T00:00:00.000Z",
      validUntil: "2026-07-05T00:00:00.000Z",
      trafficLimitBytes: 0,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z"
    });

    assert.equal(
      store.findIssuedSubscriptionBindingByTenantRef("tenant_edge_recovery_001").requestId,
      "pareq_edge_recovery_001"
    );
    assert.doesNotMatch(JSON.stringify(bindings), /password|token|subscriptionUrl|uuid|rawConfig/i);
  });
});

test("subscription control store records idempotent traffic usage samples and rollups", () => {
  withStore((store) => {
    const now = "2026-06-06T00:00:00.000Z";
    store.createAccount({
      id: "acct_usage_1",
      ownerRef: "portal_user_usage_1",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.createEntitlement({
      id: "ent_usage_1",
      accountId: "acct_usage_1",
      plan: "monthly",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-06T00:00:00.000Z",
      trafficLimitBytes: 1024,
      createdAt: now,
      updatedAt: now
    });
    store.createIssuanceRequest({
      id: "pareq_usage_1",
      accountId: "acct_usage_1",
      entitlementId: "ent_usage_1",
      approvalRef: "approval_usage_1",
      status: "issued",
      quantity: 1,
      nodeId: "channel-aliyun-a-tuic",
      purpose: "portal_auto_issuance",
      requestedByRef: "portal_auto_issuer",
      createdAt: now,
      updatedAt: now
    });
    store.linkIssuedSubscription({
      id: "link_usage_1",
      requestId: "pareq_usage_1",
      tenantRef: "tenant_usage_1",
      artifactRef: "artifact_usage_1",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.upsertPortalAccessRequest({
      id: "pareq_usage_1",
      portalUserRef: "portal_user_usage_1",
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
      reviewedByRef: "portal_auto_issuer",
      expiresAt: "2026-07-06T00:00:00.000Z",
      validUntil: "2026-07-06T00:00:00.000Z",
      entitlementRef: "ent_usage_1",
      accessGrantRef: "grant_usage_1",
      tenantId: "tenant_usage_1",
      artifactId: "artifact_usage_1",
      subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
      edgeChannelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_1",
      edgeMaterialDigest: "sha256:digest_usage_1",
      edgeCredentials: [
        {
          edgeChannelRef: "channel-aliyun-a-tuic",
          edgeCredentialRef: "edgecred_pareq_usage_1",
          edgeMaterialDigest: "sha256:digest_usage_1"
        },
        {
          edgeChannelRef: "channel-vultr-a-hy2",
          edgeCredentialRef: "safe_nonprefix_hy2_ref",
          edgeMaterialDigest: "sha256:digest_usage_hy2"
        }
      ]
    });

    const binding = store.findIssuedSubscriptionBindingByEdgeCredentialRef("edgecred_pareq_usage_1");
    assert.equal(binding.requestId, "pareq_usage_1");
    assert.equal(binding.trafficLimitBytes, 1024);
    assert.equal(binding.edgeCredentialRef, "edgecred_pareq_usage_1");

    const channelBinding = store.findIssuedSubscriptionBindingByEdgeCredentialRef(
      "edgecred_pareq_usage_1_channel-vultr-a-hy2"
    );
    assert.equal(channelBinding.requestId, "pareq_usage_1");
    assert.equal(channelBinding.nodeId, "channel-vultr-a-hy2");
    assert.equal(channelBinding.edgeCredentialRef, "edgecred_pareq_usage_1_channel-vultr-a-hy2");

    const durableChannelBinding = store.findIssuedSubscriptionBindingByEdgeCredentialRef("safe_nonprefix_hy2_ref");
    assert.equal(durableChannelBinding.requestId, "pareq_usage_1");
    assert.equal(durableChannelBinding.nodeId, "channel-vultr-a-hy2");
    assert.equal(durableChannelBinding.portalUserRef, "portal_user_usage_1");
    assert.equal(durableChannelBinding.edgeCredentialRef, "safe_nonprefix_hy2_ref");

    const first = store.recordUsageSample({
      id: "usage_sample_1",
      sourceRef: "mihomo_snapshot_1",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_1",
      accountId: "acct_usage_1",
      entitlementId: "ent_usage_1",
      requestId: "pareq_usage_1",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200,
      sampleDigest: "sha256:usage_sample_digest_1",
      createdAt: "2026-06-06T00:05:01.000Z"
    });
    assert.equal(first.inserted, true);
    assert.equal(first.sample.totalBytes, 300);
    assert.equal(first.rollup.totalBytes, 300);

    const duplicate = store.recordUsageSample({
      id: "usage_sample_1_duplicate",
      sourceRef: "mihomo_snapshot_1",
      channelRef: "channel-aliyun-a-tuic",
      edgeCredentialRef: "edgecred_pareq_usage_1",
      accountId: "acct_usage_1",
      entitlementId: "ent_usage_1",
      requestId: "pareq_usage_1",
      observedAt: "2026-06-06T00:05:00.000Z",
      intervalStartedAt: "2026-06-06T00:00:00.000Z",
      intervalEndedAt: "2026-06-06T00:05:00.000Z",
      uploadBytes: 100,
      downloadBytes: 200,
      sampleDigest: "sha256:usage_sample_digest_1",
      createdAt: "2026-06-06T00:05:02.000Z"
    });
    assert.equal(duplicate.inserted, false);
    assert.equal(duplicate.sample.id, "usage_sample_1");
    assert.equal(duplicate.rollup.totalBytes, 300);

    const samples = store.listUsageSamples({ edgeCredentialRef: "edgecred_pareq_usage_1" });
    assert.equal(samples.length, 1);
    assert.equal(store.getUsageRollupByEdgeCredentialRef("edgecred_pareq_usage_1").downloadBytes, 200);
    const rollups = store.listUsageRollupsByRequestId("pareq_usage_1");
    assert.deepEqual(rollups.map((rollup) => ({
      requestId: rollup.requestId,
      channelRef: rollup.channelRef,
      uploadBytes: rollup.uploadBytes,
      downloadBytes: rollup.downloadBytes,
      totalBytes: rollup.totalBytes
    })), [
      {
        requestId: "pareq_usage_1",
        channelRef: "channel-aliyun-a-tuic",
        uploadBytes: 100,
        downloadBytes: 200,
        totalBytes: 300
      }
    ]);
    assert.doesNotMatch(JSON.stringify({ samples, duplicate }), /password|token|subscriptionUrl|rawConfig/i);
  });
});

test("subscription control store rejects unsafe edge apply receipt material", () => {
  withStore((store) => {
    assert.throws(() => store.recordEdgeApplyReceipt({
      id: "edge_receipt_bad",
      channelRef: "channel-aliyun-a-tuic",
      desiredStateRef: "desired_state_bad",
      status: "applied",
      actionCounts: {
        add: 1
      },
      rawConfig: "users:\n- password: unsafe",
      createdAt: "2026-06-05T00:00:00.000Z"
    }), /unsafe field is not allowed/);
  });
});

test("subscription control store tracks portal password verification state", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_auth_2",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.createPortalPasswordCredential({
      id: "pwd_cred_2",
      accountId: "acct_auth_2",
      passwordHash: "scrypt$v=1$N=32768$r=8$p=1$saltref$hashref",
      status: "active",
      mustRotate: false,
      createdAt: now,
      updatedAt: now
    });

    const failed = store.recordPortalPasswordVerificationFailure("pwd_cred_2", {
      updatedAt: "2026-06-03T00:01:00.000Z"
    });
    assert.equal(failed.failureCount, 1);
    assert.equal(failed.status, "active");

    const locked = store.recordPortalPasswordVerificationFailure("pwd_cred_2", {
      updatedAt: "2026-06-03T00:02:00.000Z",
      lockedUntil: "2026-06-03T00:12:00.000Z"
    });
    assert.equal(locked.failureCount, 2);
    assert.equal(locked.status, "locked");
    assert.equal(locked.lockedUntil, "2026-06-03T00:12:00.000Z");

    const verified = store.markPortalPasswordVerified("pwd_cred_2", {
      verifiedAt: "2026-06-03T00:13:00.000Z",
      updatedAt: "2026-06-03T00:13:00.000Z"
    });
    assert.equal(verified.failureCount, 0);
    assert.equal(verified.status, "active");
    assert.equal(verified.lockedUntil, null);
    assert.equal(verified.lastVerifiedAt, "2026-06-03T00:13:00.000Z");
  });
});

test("subscription control store resolves portal login refs by exact account id or unique metadata", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_exact_login",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        loginRef: "shared-login@example.test",
        displayRef: "Exact Login"
      }
    });
    store.createAccount({
      id: "acct_metadata_login",
      ownerRef: "owner_safe_ref_2",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        loginRef: "Customer.Login@example.test",
        displayRef: "Customer.Visible@example.test"
      }
    });
    store.createAccount({
      id: "acct_duplicate_login_a",
      ownerRef: "owner_safe_ref_3",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        loginRef: "duplicate-login@example.test"
      }
    });
    store.createAccount({
      id: "acct_duplicate_login_b",
      ownerRef: "owner_safe_ref_4",
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: {
        displayRef: "DUPLICATE-LOGIN@example.test"
      }
    });
    store.createAccount({
      id: "acct_inactive_login",
      ownerRef: "owner_safe_ref_5",
      status: "disabled",
      createdAt: now,
      updatedAt: now,
      metadata: {
        loginRef: "customer.login@example.test"
      }
    });

    const exact = store.resolvePortalLoginAccount("acct_exact_login");
    assert.equal(exact.status, "resolved");
    assert.equal(exact.account.id, "acct_exact_login");

    const loginRef = store.resolvePortalLoginAccount(" customer.login@example.test ");
    assert.equal(loginRef.status, "resolved");
    assert.equal(loginRef.account.id, "acct_metadata_login");

    const displayRef = store.resolvePortalLoginAccount("CUSTOMER.VISIBLE@example.test");
    assert.equal(displayRef.status, "resolved");
    assert.equal(displayRef.account.id, "acct_metadata_login");

    const duplicate = store.resolvePortalLoginAccount("duplicate-login@example.test");
    assert.equal(duplicate.status, "ambiguous");
    assert.equal(duplicate.account, null);

    const missing = store.resolvePortalLoginAccount("missing-login@example.test");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.account, null);
  });
});

test("subscription control store persists portal passkey credentials without public summary leakage", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_passkey_1",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const credential = store.createPortalPasskeyCredential({
      id: "passkey_cred_1",
      accountId: "acct_passkey_1",
      credentialId: "webauthn-credential-id",
      credentialIdHash: "credhash_abcdef",
      publicKeyJwk: { kty: "EC", crv: "P-256", x: "safe-x", y: "safe-y" },
      signCount: 7,
      transports: ["usb", "internal"],
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    assert.equal(credential.id, "passkey_cred_1");
    assert.equal(credential.signCount, 7);
    assert.deepEqual(credential.transports, ["usb", "internal"]);
    assert.equal(store.getPortalPasskeyCredentialByCredentialId("webauthn-credential-id").id, "passkey_cred_1");
    assert.equal(store.listActivePortalPasskeyCredentials("acct_passkey_1").length, 1);

    const verified = store.markPortalPasskeyVerified("passkey_cred_1", {
      verifiedAt: "2026-06-03T00:01:00.000Z",
      signCount: 8,
      updatedAt: "2026-06-03T00:01:00.000Z"
    });
    assert.equal(verified.signCount, 8);
    assert.equal(verified.lastVerifiedAt, "2026-06-03T00:01:00.000Z");

    const serialized = JSON.stringify(store.getAccountControlSummary("acct_passkey_1"));
    assert.doesNotMatch(serialized, /webauthn-credential-id|credhash_abcdef|publicKeyJwk|safe-x|safe-y|credential/i);
  });
});

test("subscription control store consumes portal second-factor challenges once", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_factor_1",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const challenge = store.createPortalSecondFactorChallenge({
      id: "mfa_challenge_1",
      accountId: "acct_factor_1",
      challengeHash: "challengehash_abcdef",
      allowedFactors: ["totp", "passkey"],
      status: "active",
      expiresAt: "2026-06-03T00:05:00.000Z",
      createdAt: now,
      updatedAt: now
    });
    assert.equal(challenge.status, "active");
    assert.deepEqual(challenge.allowedFactors, ["totp", "passkey"]);

    const failed = store.recordPortalSecondFactorChallengeFailure("mfa_challenge_1", {
      updatedAt: "2026-06-03T00:01:00.000Z"
    });
    assert.equal(failed.failureCount, 1);

    const used = store.markPortalSecondFactorChallengeUsed("mfa_challenge_1", {
      usedAt: "2026-06-03T00:02:00.000Z",
      updatedAt: "2026-06-03T00:02:00.000Z"
    });
    assert.equal(used.status, "used");
    assert.throws(() => store.markPortalSecondFactorChallengeUsed("mfa_challenge_1", {
      usedAt: "2026-06-03T00:03:00.000Z",
      updatedAt: "2026-06-03T00:03:00.000Z"
    }), /portal second-factor challenge is not active/);
  });
});

test("subscription control store rolls back grouped portal credential writes", () => {
  withStore((store) => {
    const now = "2026-06-03T00:00:00.000Z";
    store.createAccount({
      id: "acct_auth_tx",
      ownerRef: "owner_safe_ref",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    assert.throws(() => {
      store.runInTransaction(() => {
        store.createPortalPasswordCredential({
          id: "pwd_cred_tx",
          accountId: "acct_auth_tx",
          passwordHash: "scrypt$v=1$N=32768$r=8$p=1$saltref$hashref",
          status: "active",
          mustRotate: true,
          createdAt: now,
          updatedAt: now
        });
        throw new Error("simulate portal credential failure");
      });
    }, /simulate portal credential failure/);

    assert.equal(store.getActivePortalPasswordCredential("acct_auth_tx"), null);
  });
});
