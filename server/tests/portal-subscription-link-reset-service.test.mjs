import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";

const NOW = "2026-10-09T00:00:00.000Z";
const input = { portalUserRef: "account_reset", requestRef: "request_reset", confirmed: true,
  idempotencyKey: "synthetic-operation-key-01" };
function fixture(t, { enabled = true, schema = true } = {}) {
  const db = new Database(":memory:");
  const runtimeDb = new Database(":memory:");
  t.after(() => { db.close(); runtimeDb.close(); });
  const control = createSqliteSubscriptionControlStore({ database: db });
  const repository = createSubscriptionRepository({ database: runtimeDb });
  let at = NOW;
  const nowFn = () => new Date(at);
  const core = createSubscriptionCore({ repository, nowFn, publicSubscriptionBaseUrl: "https://subscription.example.test",
    proxyConfig: { servers: [{ name: "synthetic", host: "192.0.2.1", port: 443,
      protocol: "ss", method: "aes-256-gcm", password: "synthetic-only" }] } });
  repository.createTenant({ id: "tenant_reset", displayName: "synthetic", status: "active", nodeId: "synthetic",
    expiresAt: "2026-11-09T00:00:00.000Z", credentialMode: "shared-node", tokenHash: "synthetic_hash",
    tokenPrefix: "synthetic", note: "synthetic", now: NOW });
  const original = core.createSubscriptionArtifact("tenant_reset");
  control.createAccount({ id: input.portalUserRef, ownerRef: input.portalUserRef, status: "active", createdAt: NOW, updatedAt: NOW });
  control.createEntitlement({ id: "ent_reset", accountId: input.portalUserRef, plan: "monthly", status: "active",
    validFrom: "2026-10-08T00:00:00.000Z", validUntil: "2026-11-09T00:00:00.000Z", trafficLimitBytes: 1000,
    createdAt: NOW, updatedAt: NOW });
  control.createIssuanceRequest({ id: input.requestRef, accountId: input.portalUserRef, entitlementId: "ent_reset",
    approvalRef: "approval_synthetic", status: "issued", quantity: 1, nodeId: "channel_synthetic",
    purpose: "portal_auto_issuance", requestedByRef: "synthetic_issuer", createdAt: NOW, updatedAt: NOW });
  control.upsertPortalAccessRequest({ id: input.requestRef, portalUserRef: input.portalUserRef,
    plan: "monthly", clientTarget: "clash", durationDays: 30, quantity: 1, status: "delivered",
    nextAction: "subscription_ready", priorTrialState: "none", submittedAt: NOW, updatedAt: NOW,
    validUntil: "2026-11-09T00:00:00.000Z", expiresAt: "2026-11-09T00:00:00.000Z",
    entitlementRef: "ent_reset", accessGrantRef: "grant_reset", tenantId: "tenant_reset",
    artifactId: original.artifact.id, subscriptionUrl: original.subscriptionUrl,
    edgeChannelRef: "channel_synthetic", edgeCredentialRef: "edgecred_synthetic", edgeMaterialDigest: "1".repeat(64) });
  control.recordUsageSample({ id: "usage_reset", sourceRef: "synthetic_stats", channelRef: "channel_synthetic",
    edgeCredentialRef: "edgecred_synthetic", accountId: input.portalUserRef, entitlementId: "ent_reset", requestId: input.requestRef,
    observedAt: NOW, intervalStartedAt: "2026-10-08T23:59:00.000Z", intervalEndedAt: NOW,
    uploadBytes: 300, downloadBytes: 400, sampleDigest: "synthetic_reset_usage_digest", createdAt: NOW });
  if (schema) ensurePortalSubscriptionLinkResetSchema(db);
  const makeService = () => createPortalAccessRequestService({ runtimeCore: core, controlStore: control, nowFn,
    subscriptionLinkResetEnabled: enabled, subscriptionLinkResetCooldownMs: 300000, refreshCooldownMs: 300000 });
  return { db, runtimeDb, control, repository, core, original, makeService, service: makeService(), clock(value) { at = value; } };
}
function rawArtifact(url) { return new URL(url).pathname.split("/").at(-1).slice(0, -5); }

test("confirmed link reset revokes old URL, preserves resources and survives response retry", t => {
  const f = fixture(t);
  const before = f.control.getPortalAccessRequest(input.requestRef);
  const tenant = f.repository.getTenant("tenant_reset");
  const entitlement = f.control.getEntitlement("ent_reset");
  const usageBefore = f.service.getRequest(input.requestRef).usage;
  assert.equal(usageBefore.usedBytes, 700);
  const result = f.service.resetSubscriptionLink(input);
  assert.notEqual(result.subscriptionUrl, f.original.subscriptionUrl);
  assert.equal(result.event.type, "subscription_link_reset");
  assert.deepEqual(result.usage, usageBefore);
  assert.deepEqual(f.control.getEntitlement("ent_reset"), entitlement);
  assert.equal(f.core.resolveSubscriptionArtifact(rawArtifact(f.original.subscriptionUrl)).status, 410);
  assert.equal(f.core.resolveSubscriptionArtifact(rawArtifact(result.subscriptionUrl)).ok, true);
  const after = f.control.getPortalAccessRequest(input.requestRef);
  for (const key of Object.keys(before)) {
    if (!["artifactId", "subscriptionUrl", "event", "updatedAt"].includes(key)) assert.deepEqual(after[key], before[key], key);
  }
  // Rendering can update lastUsed; no commercial or runtime identity field changes.
  const afterTenant = f.repository.getTenant("tenant_reset");
  for (const key of Object.keys(tenant)) if (key !== "lastUsedAt") assert.deepEqual(afterTenant[key], tenant[key], key);
  assert.equal(f.service.revealSubscription(input).subscriptionUrl, result.subscriptionUrl);
  assert.equal(f.makeService().resetSubscriptionLink(input).subscriptionUrl, result.subscriptionUrl);
  assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 2);
  assert.throws(() => f.service.refreshSubscription(input), { code: "subscription_refresh_rate_limited" });
  assert.throws(() => f.service.resetSubscriptionLink({ ...input, idempotencyKey: "synthetic-operation-key-02" }),
    { code: "subscription_link_reset_rate_limited" });
});

test("runtime commit with control failure resumes exactly once across service reconstruction", t => {
  const f = fixture(t);
  f.db.exec("create trigger synthetic_failure before update of artifact_id on platform_portal_access_requests begin select raise(abort, 'synthetic'); end;");
  assert.throws(() => f.service.resetSubscriptionLink(input), { code: "subscription_link_reset_reconciliation_required" });
  assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 2);
  assert.equal(f.core.resolveSubscriptionArtifact(rawArtifact(f.original.subscriptionUrl)).status, 410);
  assert.throws(() => f.makeService().resetSubscriptionLink({ ...input, idempotencyKey: "synthetic-operation-key-02" }),
    { code: "subscription_link_reset_conflict" });
  f.db.exec("drop trigger synthetic_failure;");
  const result = f.makeService().resetSubscriptionLink(input);
  assert.equal(f.core.resolveSubscriptionArtifact(rawArtifact(result.subscriptionUrl)).ok, true);
  assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 2);
});

test("confirmation, ownership, active order and idempotency boundaries reject without rotation", t => {
  const f = fixture(t);
  for (const bad of [{ confirmed: false }, { confirmed: "true" }, { idempotencyKey: "" },
    { idempotencyKey: "https://not-an-id.example" }]) {
    assert.throws(() => f.service.resetSubscriptionLink({ ...input, ...bad }), { code: "validation_error" });
  }
  assert.throws(() => f.service.resetSubscriptionLink({ ...input, portalUserRef: "other_account" }), { code: "not_found" });
  f.clock("2026-12-01T00:00:00.000Z");
  assert.throws(() => f.service.resetSubscriptionLink(input));
  assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 1);
});

test("disabled feature and missing explicit schema fail closed without auto migration", t => {
  for (const config of [{ enabled: false, schema: false }, { enabled: true, schema: false }]) {
    const f = fixture(t, config);
    assert.throws(() => f.service.resetSubscriptionLink(input), { code: "subscription_link_reset_unavailable" });
    assert.equal(f.db.prepare("select name from sqlite_master where name = 'platform_portal_subscription_link_resets'").get(), undefined);
    assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 1);
  }
});

test("an older completed key cannot disclose or revive a replaced link", t => {
  const f = fixture(t);
  const first = f.service.resetSubscriptionLink(input);
  f.clock("2026-10-09T00:06:00.000Z");
  const second = f.service.resetSubscriptionLink({ ...input, idempotencyKey: "synthetic-operation-key-02" });
  assert.notEqual(second.subscriptionUrl, first.subscriptionUrl);
  assert.throws(() => f.service.resetSubscriptionLink(input), { code: "subscription_link_reset_conflict" });
  assert.equal(f.core.resolveSubscriptionArtifact(rawArtifact(first.subscriptionUrl)).status, 410);
  assert.equal(f.core.listSubscriptionArtifacts("tenant_reset").length, 3);
});
