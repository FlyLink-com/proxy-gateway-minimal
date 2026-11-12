import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { seedAccountModelForTest } from "./helpers/account-model-seed.mjs";

const NOW = "2026-09-20T12:00:00.000Z";
const FROM = "2026-09-01T12:00:00.000Z";
const UNTIL = "2026-10-01T12:00:00.000Z";
const GB = 1024 ** 3;

function fixture({ secondBinding = false, samples = true, subscriptionUrl = null, commercialModel, trafficLimitBytes = 50 * GB, validFrom = FROM, validUntil = UNTIL, requestEntitlementRef = "ent_legacy", requestPortalUserRef = "acct_legacy", requestTenantId = "tenant_legacy", requestArtifactId = "artifact_legacy" } = {}) {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database });
  if (commercialModel) {
    seedAccountModelForTest(database, {
      id: "acct_legacy",
      ownerRef: "owner_legacy",
      createdAt: FROM,
      updatedAt: FROM,
      commercialModel
    });
  } else {
    store.createAccount({
      id: "acct_legacy",
      ownerRef: "owner_legacy",
      createdAt: FROM,
      updatedAt: FROM
    });
  }
  store.createEntitlement({ id: "ent_legacy", accountId: "acct_legacy", plan: "monthly", validFrom, validUntil, trafficLimitBytes, createdAt: FROM, updatedAt: FROM });
  store.createIssuanceRequest({ id: "req_legacy", accountId: "acct_legacy", entitlementId: "ent_legacy", approvalRef: "approval_legacy", status: "issued", nodeId: "node_legacy", purpose: "subscription", requestedByRef: "owner_legacy", createdAt: FROM, updatedAt: FROM });
  store.linkIssuedSubscription({ id: "link_legacy", requestId: "req_legacy", tenantRef: `tenantref_${createHash("sha256").update("tenant_legacy").digest("hex").slice(0, 16)}`, artifactRef: `artifactref_${createHash("sha256").update("artifact_legacy").digest("hex").slice(0, 16)}`, createdAt: FROM, updatedAt: FROM });
  store.upsertPortalAccessRequest({ id: "req_legacy", portalUserRef: requestPortalUserRef, plan: "monthly", durationDays: 30, status: "issued", nextAction: "none", priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM, validUntil, entitlementRef: requestEntitlementRef, tenantId: requestTenantId, artifactId: requestArtifactId, subscriptionUrl });
  if (secondBinding) {
    store.createIssuanceRequest({ id: "req_legacy_2", accountId: "acct_legacy", entitlementId: "ent_legacy", approvalRef: "approval_legacy_2", status: "issued", nodeId: "node_legacy", purpose: "subscription", requestedByRef: "owner_legacy", createdAt: FROM, updatedAt: FROM });
    store.linkIssuedSubscription({ id: "link_legacy_2", requestId: "req_legacy_2", tenantRef: "tenantref_2", artifactRef: "artifactref_2", createdAt: FROM, updatedAt: FROM });
  }
  if (samples) store.recordUsageSample({ id: "sample_legacy", sourceRef: "source_legacy", channelRef: "channel_legacy", edgeCredentialRef: "edgecred_req_legacy", accountId: "acct_legacy", entitlementId: "ent_legacy", requestId: "req_legacy", observedAt: "2026-09-20T11:59:00.000Z", intervalStartedAt: "2026-09-20T11:58:00.000Z", intervalEndedAt: "2026-09-20T11:59:00.000Z", uploadBytes: 100, downloadBytes: 900, totalBytes: 1000, sampleDigest: "digest_legacy", createdAt: "2026-09-20T11:59:00.000Z" });
  return {
    ...store,
    close() {
      store.close();
      database.close();
    }
  };
}

test("legacy reader returns a read-only current bound resource and usage", () => {
  const store = fixture({ subscriptionUrl: "https://example.invalid/subscription" });
  const before = store.listUsageSamples({ accountId: "acct_legacy" }).length;
  const result = store.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW });
  assert.equal(result.model, "legacy");
  assert.equal(result.requestRef, "req_legacy");
  assert.deepEqual(store.readLegacyPortalCurrentResourceBinding({ accountId: "acct_legacy", now: NOW }), {
    state: "available",
    requestRef: "req_legacy",
    resourceRef: result.resource.resourceRef,
    tenantId: "tenant_legacy",
    artifactId: "artifact_legacy"
  });
  assert.equal(result.resource.state, "available");
  assert.equal(Object.hasOwn(result, "artifactLineageNeeded"), false);
  assert.deepEqual(result.resource.plan, { id: "monthly", durationDays: 30, monthlyTrafficGb: 50 });
  assert.equal(result.resource.setupAvailable, true);
  assert.equal(result.resource.usage.usedBytes, 1000);
  assert.equal(result.resource.usage.collectionStatus, "measured");
  assert.match(result.resource.resourceRef, /^resource_[a-f0-9]{64}$/);
  assert.equal(store.listUsageSamples({ accountId: "acct_legacy" }).length, before);
  store.close();
});

test("legacy reader distinguishes pending and measured zero", () => {
  const pending = fixture({ samples: false });
  assert.equal(pending.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }).resource.usage.collectionStatus, "pending");
  pending.close();
  const zero = fixture({ samples: false });
  zero.recordUsageSample({ id: "sample_zero", sourceRef: "source_zero", channelRef: "channel_zero", edgeCredentialRef: "edgecred_req_legacy", accountId: "acct_legacy", entitlementId: "ent_legacy", requestId: "req_legacy", observedAt: "2026-09-20T11:59:00.000Z", intervalStartedAt: "2026-09-20T11:58:00.000Z", intervalEndedAt: "2026-09-20T11:59:00.000Z", totalBytes: 0, sampleDigest: "digest_zero", createdAt: "2026-09-20T11:59:00.000Z" });
  assert.equal(zero.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }).resource.usage.collectionStatus, "measured_zero");
  zero.close();
});

test("legacy reader fails closed for ambiguous binding and isolates accounts", () => {
  const ambiguous = fixture({ secondBinding: true });
  assert.equal(ambiguous.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }).resource.state, "reconciliation_required");
  assert.equal(ambiguous.readLegacyPortalCurrentResource({ accountId: "acct_other", now: NOW }).resource.state, "none");
  ambiguous.close();
});

test("legacy reader classifies expired and future entitlements as none", () => {
  const expired = fixture({ validFrom: "2026-08-01T12:00:00.000Z", validUntil: "2026-09-01T12:00:00.000Z" });
  assert.equal(expired.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }).resource.state, "none");
  expired.close();
  const future = fixture({ validFrom: "2026-10-01T12:00:00.000Z", validUntil: "2026-11-01T12:00:00.000Z" });
  assert.equal(future.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }).resource.state, "none");
  future.close();
});

test("legacy reader fails closed for mismatched request and account model", () => {
  const mismatched = fixture({ requestEntitlementRef: "ent_other" });
  assert.equal(mismatched.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }).resource.state, "reconciliation_required");
  mismatched.close();
  const wallet = fixture({ commercialModel: "wallet_first_unique_v1" });
  assert.deepEqual(wallet.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW }), { model: "wallet_first" });
  assert.throws(() => wallet.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW, model: "legacy" }), /not allowed/);
  wallet.close();
});
test("legacy unset quota remains available with actual usage, not unlimited or exhausted; fractional GiB is preserved", () => {
  for (const trafficLimitBytes of [0, 1.5 * GB]) {
    const store = fixture({ trafficLimitBytes, subscriptionUrl: "https://example.test/sub/synthetic" });
    const { resource } = store.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW });
    assert.equal(resource.state, "available");
    assert.equal(resource.setupAvailable, true);
    assert.equal(resource.plan.monthlyTrafficGb, trafficLimitBytes / GB);
    assert.equal(resource.usage.totalBytes, trafficLimitBytes);
    assert.equal(resource.usage.usedBytes, 1000);
    assert.equal(resource.usage.remainingBytes, trafficLimitBytes === 0 ? null : trafficLimitBytes - 1000);
    assert.equal(resource.usage.collectionStatus, "measured");
    store.close();
  }
});

test("legacy artifact mismatch requests runtime lineage proof only as internal top-level metadata", () => {
  const store = fixture({ subscriptionUrl: "https://example.test/sub/synthetic" });
  try {
    const original = store.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW });
    store.upsertPortalAccessRequest({ ...store.getPortalAccessRequest("req_legacy"), artifactId: "artifact_replacement" });
    const result = store.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW });
    assert.equal(result.resource.state, "available");
    assert.notEqual(result.resource.resourceRef, original.resource.resourceRef);
    assert.deepEqual(result.artifactLineageNeeded, {
      tenantId: "tenant_legacy", currentArtifactId: "artifact_replacement",
      issuedArtifactRef: `artifactref_${createHash("sha256").update("artifact_legacy").digest("hex").slice(0, 16)}`
    });
    assert.equal(Object.hasOwn(result.resource, "artifactLineageNeeded"), false);
    assert.equal(JSON.stringify(result.resource).includes("artifact_replacement"), false);
    assert.equal(JSON.stringify(result.resource).includes("tenant_legacy"), false);
  } finally { store.close(); }
});

for (const [name, changes] of [
  ["account", { requestPortalUserRef: "acct_other" }],
  ["entitlement", { requestEntitlementRef: "ent_other" }],
  ["tenant", { requestTenantId: "tenant_other" }]
]) {
  test(`legacy artifact mismatch never weakens the ${name} binding guard`, () => {
    const store = fixture({ requestArtifactId: "artifact_replacement", ...changes });
    try {
      const result = store.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW });
      assert.deepEqual(result.resource, { state: "reconciliation_required" });
      assert.equal(Object.hasOwn(result, "artifactLineageNeeded"), false);
    } finally { store.close(); }
  });
}

for (const requestArtifactId of ["artifact_legacy", "artifact_replacement"]) {
  test(`legacy resource rejects global tenant ownership ambiguity for ${requestArtifactId}`, () => {
    const store = fixture({ requestArtifactId });
    try {
      store.createAccount({ id: "acct_other", ownerRef: "owner_other", createdAt: FROM, updatedAt: FROM });
      store.createEntitlement({ id: "ent_other", accountId: "acct_other", plan: "monthly", validFrom: FROM, validUntil: UNTIL, trafficLimitBytes: 50 * GB, createdAt: FROM, updatedAt: FROM });
      store.createIssuanceRequest({ id: "req_other", accountId: "acct_other", entitlementId: "ent_other", approvalRef: "approval_other", status: "issued", nodeId: "node_legacy", purpose: "subscription", requestedByRef: "owner_other", createdAt: FROM, updatedAt: FROM });
      store.linkIssuedSubscription({ id: "link_other", requestId: "req_other", tenantRef: `tenantref_${createHash("sha256").update("tenant_legacy").digest("hex").slice(0, 16)}`, artifactRef: "artifactref_other", createdAt: FROM, updatedAt: FROM });
      const result = store.readLegacyPortalCurrentResource({ accountId: "acct_legacy", now: NOW });
      assert.deepEqual(result.resource, { state: "reconciliation_required" });
      assert.equal(Object.hasOwn(result, "artifactLineageNeeded"), false);
    } finally { store.close(); }
  });
}
