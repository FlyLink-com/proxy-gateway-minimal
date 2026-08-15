import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";

function scopeCredentialDigest(edgeCredentialRef) {
  return `sha256:${createHash("sha256")
    .update(`gccgw:scoped-tombstone-lineage:v1:${edgeCredentialRef}`)
    .digest("hex")}`;
}

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

function withWelcomeCoinGrantStore(fn) {
  const database = new Database(":memory:");
  let store;
  try {
    store = createSqliteSubscriptionControlStore({ database });
    database.exec(`
      create table platform_portal_registration_welcome_coin_grants (
        grant_ref text primary key,
        account_id text not null unique references platform_accounts(id) on delete cascade,
        coin_type text not null check (coin_type = 'bonus_coins'),
        amount_units integer not null check (typeof(amount_units) = 'integer' and amount_units = 10),
        source_type text not null,
        source_ref text not null unique,
        source_digest text not null,
        actor_scope text not null,
        idempotency_key text not null,
        expires_at text not null check (
          typeof(expires_at) = 'text'
          and typeof(created_at) = 'text'
          and length(expires_at) = 24
          and length(created_at) = 24
          and expires_at glob '????-??-??T??:??:??.???Z'
          and created_at glob '????-??-??T??:??:??.???Z'
          and strftime('%Y-%m-%dT%H:%M:%fZ', expires_at) = expires_at
          and strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
          and strftime(
            '%Y-%m-%dT%H:%M:%fZ',
            julianday(created_at) + 7
          ) = expires_at
        ),
        status text not null check (status in (
          'pending', 'processing', 'credited', 'expired', 'reconciliation_required'
        )),
        next_attempt_at text not null,
        attempt_count integer not null default 0 check (typeof(attempt_count) = 'integer' and attempt_count >= 0),
        lease_generation integer not null default 0 check (typeof(lease_generation) = 'integer' and lease_generation >= 0),
        lease_token text,
        lease_until text,
        last_safe_code text,
        credited_lot_ref text,
        created_at text not null,
        updated_at text not null,
        credited_at text,
        unique (actor_scope, idempotency_key),
        check (
          (
            status = 'pending'
            and lease_token is null
            and lease_until is null
            and credited_lot_ref is null
            and credited_at is null
          )
          or
          (
            status = 'processing'
            and lease_token is not null
            and lease_until is not null
            and credited_lot_ref is null
            and credited_at is null
          )
          or
          (
            status = 'credited'
            and lease_token is null
            and lease_until is null
            and credited_lot_ref is not null
            and credited_at is not null
          )
          or
          (
            status in ('expired', 'reconciliation_required')
            and lease_token is null
            and lease_until is null
            and credited_lot_ref is null
            and credited_at is null
          )
        )
      );
      create index platform_portal_registration_welcome_coin_grants_claim_idx
        on platform_portal_registration_welcome_coin_grants(
          status, next_attempt_at, lease_until, expires_at, grant_ref
        );
    `);
    return fn(store, database);
  } finally {
    store?.close();
    database.close();
  }
}

function welcomeCoinGrant(overrides = {}) {
  return {
    grantRef: "welcome_grant_acct_welcome_1",
    accountId: "acct_welcome_1",
    coinType: "bonus_coins",
    amountUnits: 10,
    expiresAt: "2026-08-20T00:00:00.000Z",
    sourceType: "portal_registration",
    sourceRef: "portal_registration_acct_welcome_1",
    sourceDigest: "a".repeat(64),
    actorScope: "portal_registration",
    idempotencyKey: "welcome_bonus_acct_welcome_1",
    now: "2026-08-13T00:00:00.000Z",
    ...overrides
  };
}

function createWelcomeCoinAccount(store, accountId, now = "2026-08-13T00:00:00.000Z") {
  return store.createAccount({
    id: accountId,
    ownerRef: `portal_user_${accountId}`,
    status: "active",
    createdAt: now,
    updatedAt: now
  });
}

function durableLead(overrides = {}) {
  return {
    id: "lead_durable_1",
    type: "platform_lead",
    status: "new",
    organization: "Synthetic Research",
    email: "synthetic@example.test",
    direction: "API Sandbox",
    stage: "review",
    message: "Synthetic local fixture only.",
    source: "company-site",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...overrides
  };
}

test("subscription control store rejects a zero-length entitlement validity interval", () => {
  withStore((store) => {
    const now = "2026-07-30T00:00:00.000Z";
    store.createAccount({
      id: "acct_zero_length_entitlement",
      ownerRef: "portal_user_zero_length_entitlement",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    assert.throws(
      () => store.createEntitlement({
        id: "ent_zero_length",
        accountId: "acct_zero_length_entitlement",
        plan: "monthly",
        status: "active",
        validFrom: now,
        validUntil: now,
        createdAt: now,
        updatedAt: now
      }),
      (error) => error.code === "validation_error"
    );
    assert.equal(store.getEntitlement("ent_zero_length"), null);
  });
});

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

    const repeated = store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_apply_001",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_current",
      generation: "gen_current",
      reason: "order_delivered",
      status: "pending",
      createdAt: now,
      updatedAt: "2026-06-14T00:02:00.000Z"
    });
    assert.equal(repeated.status, "applied");
    assert.equal(repeated.updatedAt, "2026-06-14T00:01:00.000Z");

    const unsafeReplay = store.recordEdgeDesiredStateNotification({
      id: "edge_state_notify_apply_001",
      nodeRef: "vultr-sgp-a",
      channelRef: "channel-sgp-a-hy2",
      desiredStateRef: "desired_state_channel-sgp-a-hy2_current",
      generation: "gen_current",
      reason: "order_delivered",
      status: "pending",
      lifecycleRevisionSafe: false,
      createdAt: now,
      updatedAt: "2026-06-14T00:03:00.000Z"
    });
    assert.equal(unsafeReplay.status, "pending");
    assert.equal(unsafeReplay.updatedAt, "2026-06-14T00:03:00.000Z");
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

    const pendingResume = store.upsertPortalAccessRequest({
      ...delivered,
      status: "disabled",
      nextAction: "traffic_supply_resume_pending",
      updatedAt: "2026-07-11T00:03:00.000Z"
    });
    const resumedIntent = store.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "vultr-sgp-a"
    });
    assert.deepEqual(resumedIntent.edgeCredentialRefs, ["edgecred_desired_tombstone_001"]);
    assert.deepEqual(resumedIntent.materialDigests, [{
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: "edgecred_desired_tombstone_001",
      digest: "sha256:digest_desired_tombstone_001"
    }]);
    assert.notEqual(resumedIntent.desiredStateRef, active.desiredStateRef);
    assert.notEqual(resumedIntent.generation, active.generation);

    store.upsertPortalAccessRequest({
      ...pendingResume,
      nextAction: "subscription_disabled",
      subscriptionUrl: null,
      updatedAt: "2026-07-11T00:04:00.000Z"
    });
    const repeated = store.getLatestEdgeDesiredStateForChannel("channel-sgp-a-hy2", {
      nodeRef: "vultr-sgp-a"
    });
    assert.notEqual(repeated.desiredStateRef, tombstone.desiredStateRef);
    assert.notEqual(repeated.generation, tombstone.generation);
    assert.deepEqual(repeated.edgeCredentialRefs, []);
    assert.equal(
      store.getPortalEdgeCredentialChannelRef("edgecred_desired_tombstone_001"),
      "channel-sgp-a-hy2"
    );
    assert.equal(store.getPortalEdgeCredentialChannelRef("edgecred_unknown_001"), null);
    assert.equal(
      store.getPortalEdgeCredentialChannelRefByScopeDigest(
        scopeCredentialDigest("edgecred_desired_tombstone_001")
      ),
      "channel-sgp-a-hy2"
    );
    assert.equal(
      store.getPortalEdgeCredentialChannelRefByScopeDigest("sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
      null
    );
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
    store.createAccount({
      id: "acct_edge_recovery_other",
      ownerRef: "portal_user_edge_recovery_other",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    store.createEntitlement({
      id: "ent_edge_recovery_other",
      accountId: "acct_edge_recovery_other",
      plan: "monthly",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-05T00:00:00.000Z",
      createdAt: now,
      updatedAt: now
    });
    store.createIssuanceRequest({
      id: "pareq_edge_recovery_other",
      accountId: "acct_edge_recovery_other",
      entitlementId: "ent_edge_recovery_other",
      approvalRef: "approval_edge_recovery_other",
      status: "issued",
      quantity: 1,
      nodeId: "channel-aliyun-a-tuic",
      purpose: "portal_access_request",
      requestedByRef: "portal_auto_issuer",
      createdAt: now,
      updatedAt: now
    });
    store.linkIssuedSubscription({
      id: "link_edge_recovery_other",
      requestId: "pareq_edge_recovery_other",
      tenantRef: "tenant_edge_recovery_other",
      artifactRef: "artifact_edge_recovery_other",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const bindings = store.listIssuedSubscriptionBindings({
      accountId: "acct_edge_recovery",
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
    assert.equal(
      store.listIssuedSubscriptionBindings({
        accountId: "acct_edge_recovery_other"
      }).length,
      1
    );
    assert.deepEqual(
      store.listIssuedSubscriptionBindings({
        accountId: "acct_edge_recovery_missing"
      }),
      []
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

test("subscription control store persists retained Leads across restart and preserves createdAt", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-lead-durable-"));
  const dbPath = join(tempDir, "control.sqlite");
  let first;
  let second;

  try {
    first = createSqliteSubscriptionControlStore({ dbPath });
    const created = first.upsertLead(durableLead(), {
      expiresAt: "2026-10-14T00:00:00.000Z"
    });
    assert.deepEqual(created, durableLead());
    first.close();
    first = null;

    second = createSqliteSubscriptionControlStore({ dbPath });
    assert.deepEqual(second.getLead("lead_durable_1"), durableLead());

    const updated = second.upsertLead(durableLead({
      status: "reviewing",
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z"
    }), {
      expiresAt: "2026-10-16T00:00:00.000Z"
    });
    assert.equal(updated.status, "reviewing");
    assert.equal(updated.createdAt, "2026-07-16T00:00:00.000Z");
    assert.equal(updated.updatedAt, "2026-07-18T00:00:00.000Z");
    assert.deepEqual(second.listLeads({ status: "reviewing" }), [updated]);
  } finally {
    first?.close();
    second?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("subscription control store purges Leads at the approved expiry boundary", () => {
  withStore((store) => {
    store.upsertLead(durableLead(), {
      expiresAt: "2026-10-14T00:00:00.000Z"
    });

    assert.equal(store.purgeExpiredLeads({ now: "2026-10-13T23:59:59.999Z" }), 0);
    assert.equal(store.getLead("lead_durable_1")?.id, "lead_durable_1");
    assert.equal(store.purgeExpiredLeads({ now: "2026-10-14T00:00:00.000Z" }), 1);
    assert.equal(store.getLead("lead_durable_1"), null);
  });
});

test("subscription control store adds only the approved Lead objects to a legacy fixture", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-lead-schema-"));
  const dbPath = join(tempDir, "control.sqlite");
  const database = new Database(dbPath);

  try {
    database.exec(`
      create table legacy_sentinel (
        id text primary key,
        value text not null
      );
      insert into legacy_sentinel (id, value) values ('sentinel_1', 'preserve-me');
    `);

    createSqliteSubscriptionControlStore({ database }).close();
    createSqliteSubscriptionControlStore({ database }).close();

    assert.deepEqual(
      database.prepare("select id, value from legacy_sentinel").all(),
      [{ id: "sentinel_1", value: "preserve-me" }]
    );
    assert.deepEqual(
      database.prepare(`
        select type, name from sqlite_master
        where name like 'platform_leads%'
        order by type desc, name asc
      `).all(),
      [
        { type: "table", name: "platform_leads" },
        { type: "index", name: "platform_leads_expires_at_idx" },
        { type: "index", name: "platform_leads_status_created_idx" }
      ]
    );
  } finally {
    database.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("subscription control store non-initializing maintenance mode preserves an absent Lead schema", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-lead-maintenance-"));
  const dbPath = join(tempDir, "control.sqlite");
  const database = new Database(dbPath);

  try {
    database.exec(`
      create table legacy_sentinel (
        id text primary key,
        value text not null
      );
      insert into legacy_sentinel (id, value) values ('sentinel_1', 'preserve-me');
    `);

    createSqliteSubscriptionControlStore({
      database,
      initializeSchema: false
    }).close();

    assert.deepEqual(
      database.prepare("select id, value from legacy_sentinel").all(),
      [{ id: "sentinel_1", value: "preserve-me" }]
    );
    assert.deepEqual(
      database.prepare(`
        select type, name from sqlite_master
        where name like 'platform_leads%'
        order by type desc, name asc
      `).all(),
      []
    );
  } finally {
    database.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("subscription control store non-initializing maintenance mode refuses a missing database path", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-lead-maintenance-missing-"));
  const dbPath = join(tempDir, "missing", "control.sqlite");
  let store;
  try {
    let failure;
    try {
      store = createSqliteSubscriptionControlStore({
        dbPath,
        initializeSchema: false
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure, "maintenance mode should refuse a missing database");
    assert.equal(existsSync(dbPath), false);
    assert.equal(existsSync(join(tempDir, "missing")), false);
  } finally {
    store?.close();
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("subscription control store makes a registration welcome grant durable, idempotent, and claim-safe", () => {
  withWelcomeCoinGrantStore((store) => {
    const input = welcomeCoinGrant();
    const pending = store.runInTransaction(() => {
      createWelcomeCoinAccount(store, input.accountId, input.now);
      return store.enqueuePortalRegistrationWelcomeCoinGrant(input);
    });

    assert.equal(pending.status, "pending");
    assert.equal(pending.attemptCount, 0);
    assert.equal(pending.leaseToken, undefined);
    assert.equal(store.nextPortalRegistrationWelcomeCoinGrantWakeAt(), input.now);
    assert.deepEqual(
      store.getPortalRegistrationWelcomeCoinGrant({ accountId: input.accountId }),
      pending
    );

    const replay = store.enqueuePortalRegistrationWelcomeCoinGrant({
      ...input,
      now: "2026-08-13T01:00:00.000Z"
    });
    assert.deepEqual(replay, pending);
    assert.throws(
      () => store.enqueuePortalRegistrationWelcomeCoinGrant({
        ...input,
        sourceDigest: "b".repeat(64)
      }),
      (error) => error.code === "idempotency_conflict"
    );
    assert.throws(
      () => store.enqueuePortalRegistrationWelcomeCoinGrant({
        ...input,
        commercialModel: "wallet_first_unique_v1"
      }),
      (error) => error.code === "validation_error"
    );
    assert.throws(
      () => store.enqueuePortalRegistrationWelcomeCoinGrant({
        ...input,
        grantRef: "welcome_grant_idempotency_drift",
        accountId: "acct_idempotency_drift",
        sourceRef: "portal_registration_acct_idempotency_drift"
      }),
      (error) => error.code === "idempotency_conflict"
    );

    const claimed = store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: input.now,
      leaseMs: 60_000
    });
    assert.deepEqual(Object.keys(claimed), [
      "grantRef",
      "accountId",
      "coinType",
      "amountUnits",
      "sourceType",
      "sourceRef",
      "sourceDigest",
      "actorScope",
      "idempotencyKey",
      "expiresAt",
      "leaseGeneration",
      "leaseToken"
    ]);
    assert.equal(claimed.grantRef, input.grantRef);
    assert.equal(claimed.leaseGeneration, 1);
    assert.match(claimed.leaseToken, /^[a-f0-9]{64}$/);
    assert.equal(
      store.getPortalRegistrationWelcomeCoinGrant({ grantRef: input.grantRef }).leaseToken,
      undefined
    );
    assert.equal(store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: "2026-08-13T00:00:01.000Z",
      leaseMs: 60_000
    }), null);
  });
});

test("subscription control store rejects a welcome grant outside the fixed 10-Coin seven-day contract", () => {
  withWelcomeCoinGrantStore((store, database) => {
    const input = welcomeCoinGrant();
    createWelcomeCoinAccount(store, input.accountId, input.now);

    assert.throws(
      () => store.enqueuePortalRegistrationWelcomeCoinGrant({
        ...input,
        expiresAt: "2026-08-21T00:00:00.000Z"
      }),
      (error) => error.code === "validation_error"
    );
    assert.equal(database.prepare(`
      select count(*) as count
        from platform_portal_registration_welcome_coin_grants
    `).get().count, 0);
  });
});

test("subscription control store defers, reclaims, and completes a welcome grant with lease CAS", () => {
  withWelcomeCoinGrantStore((store) => {
    const input = welcomeCoinGrant();
    createWelcomeCoinAccount(store, input.accountId, input.now);
    store.enqueuePortalRegistrationWelcomeCoinGrant(input);
    const firstClaim = store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: input.now,
      leaseMs: 60_000
    });
    const retryAt = "2026-08-13T00:05:00.000Z";
    const deferred = store.deferPortalRegistrationWelcomeCoinGrant({
      grantRef: firstClaim.grantRef,
      leaseGeneration: firstClaim.leaseGeneration,
      leaseToken: firstClaim.leaseToken,
      safeCode: "wallet_transient_unavailable",
      nextAttemptAt: retryAt,
      updatedAt: "2026-08-13T00:00:05.000Z"
    });
    assert.equal(deferred.status, "pending");
    assert.equal(deferred.lastSafeCode, "wallet_transient_unavailable");
    assert.equal(store.nextPortalRegistrationWelcomeCoinGrantWakeAt(), retryAt);
    assert.equal(store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: "2026-08-13T00:04:59.999Z",
      leaseMs: 60_000
    }), null);

    const secondClaim = store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: retryAt,
      leaseMs: 60_000
    });
    assert.equal(secondClaim.leaseGeneration, 2);
    assert.throws(
      () => store.completePortalRegistrationWelcomeCoinGrant({
        grantRef: firstClaim.grantRef,
        leaseGeneration: firstClaim.leaseGeneration,
        leaseToken: firstClaim.leaseToken,
        lotRef: "lot_welcome_1",
        completedAt: "2026-08-13T00:05:01.000Z"
      }),
      (error) => error.code === "claim_lost"
    );

    const completed = store.completePortalRegistrationWelcomeCoinGrant({
      grantRef: secondClaim.grantRef,
      leaseGeneration: secondClaim.leaseGeneration,
      leaseToken: secondClaim.leaseToken,
      lotRef: "lot_welcome_1",
      completedAt: "2026-08-13T00:05:01.000Z"
    });
    assert.equal(completed.status, "credited");
    assert.equal(completed.creditedLotRef, "lot_welcome_1");
    assert.equal(completed.creditedAt, "2026-08-13T00:05:01.000Z");
    assert.equal(store.nextPortalRegistrationWelcomeCoinGrantWakeAt(), null);
    assert.equal(store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: "2026-08-13T00:06:00.000Z",
      leaseMs: 60_000
    }), null);
  });
});

test("subscription control store terminalizes due welcome grants without taking an active processing lease", () => {
  withWelcomeCoinGrantStore((store, database) => {
    const pending = welcomeCoinGrant({
      grantRef: "welcome_grant_expired_pending",
      accountId: "acct_expired_pending",
      sourceRef: "portal_registration_acct_expired_pending",
      sourceDigest: "b".repeat(64),
      idempotencyKey: "welcome_bonus_acct_expired_pending",
      expiresAt: "2026-08-14T00:00:00.000Z",
      now: "2026-08-07T00:00:00.000Z"
    });
    const processing = welcomeCoinGrant({
      grantRef: "welcome_grant_expired_processing",
      accountId: "acct_expired_processing",
      sourceRef: "portal_registration_acct_expired_processing",
      sourceDigest: "c".repeat(64),
      idempotencyKey: "welcome_bonus_acct_expired_processing",
      expiresAt: "2026-08-13T23:59:59.999Z",
      now: "2026-08-06T23:59:59.999Z"
    });
    createWelcomeCoinAccount(store, pending.accountId, pending.now);
    createWelcomeCoinAccount(store, processing.accountId, processing.now);
    store.enqueuePortalRegistrationWelcomeCoinGrant(pending);
    store.enqueuePortalRegistrationWelcomeCoinGrant(processing);
    const processingClaim = store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: processing.now,
      leaseMs: 60_000
    });
    assert.equal(processingClaim.grantRef, processing.grantRef);

    database.prepare(`
      update platform_portal_registration_welcome_coin_grants
      set lease_until = ?
      where grant_ref = ?
    `).run("2026-08-15T00:00:00.000Z", processing.grantRef);

    assert.equal(store.expireDuePortalRegistrationWelcomeCoinGrants({
      now: "2026-08-14T00:00:00.000Z"
    }), 1);
    assert.equal(
      store.getPortalRegistrationWelcomeCoinGrant({ grantRef: pending.grantRef }).status,
      "expired"
    );
    assert.equal(
      store.getPortalRegistrationWelcomeCoinGrant({ grantRef: processing.grantRef }).status,
      "processing"
    );
    assert.throws(
      () => store.completePortalRegistrationWelcomeCoinGrant({
        grantRef: processingClaim.grantRef,
        leaseGeneration: processingClaim.leaseGeneration,
        leaseToken: processingClaim.leaseToken,
        lotRef: "lot_expired_processing",
        completedAt: "2026-08-14T00:00:00.000Z"
      }),
      (error) => error.code === "claim_lost"
    );
    assert.equal(store.nextPortalRegistrationWelcomeCoinGrantWakeAt(), "2026-08-15T00:00:00.000Z");

    assert.equal(store.expireDuePortalRegistrationWelcomeCoinGrants({
      now: "2026-08-15T00:00:00.000Z"
    }), 1);
    const reconciled = store.getPortalRegistrationWelcomeCoinGrant({
      grantRef: processing.grantRef
    });
    assert.equal(reconciled.status, "reconciliation_required");
    assert.equal(reconciled.lastSafeCode, "welcome_coin_grant_expired_while_processing");
    assert.equal(store.claimNextPortalRegistrationWelcomeCoinGrant({
      now: "2026-08-15T00:00:00.000Z",
      leaseMs: 60_000
    }), null);
  });
});
