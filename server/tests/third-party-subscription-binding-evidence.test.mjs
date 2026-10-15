import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { COIN_COMMERCE_DATA_PACK_CANDIDATES } from "../services/platform/coin-commerce-production-catalog.mjs";
import { DATA_PACK_TECHNICAL_VALID_UNTIL } from "../services/platform/usage-billing-cycle.mjs";
import { resolveThirdPartyPlanIdForTenant } from "../services/platform/third-party-subscription-tier.mjs";

const FROM = "2026-10-01T00:00:00.000Z";
const NOW = "2026-10-14T00:00:00.000Z";
const UNTIL = "2026-11-01T00:00:00.000Z";
const TENANT = "synthetic_legacy_tenant";
const SAFE_TENANT = `tenantref_${createHash("sha256").update(TENANT).digest("hex").slice(0, 16)}`;
const REFS = [TENANT, SAFE_TENANT];

function fixture(t) {
  const db = new Database(":memory:");
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => db.close());
  function seed({ suffix = "one", tenantRef = TENANT, plan = "monthly", linkStatus = "active",
    requestStatus = "issued", entitlementStatus = "active", accountStatus = "active",
    validFrom = FROM, validUntil = UNTIL, createdAt = FROM } = {}) {
    const accountId = `account_${suffix}`;
    const entitlementId = `entitlement_${suffix}`;
    const requestId = `request_${suffix}`;
    const linkId = `link_${suffix}`;
    store.createAccount({ id: accountId, ownerRef: accountId, status: accountStatus,
      createdAt: FROM, updatedAt: FROM });
    store.createEntitlement({ id: entitlementId, accountId, plan, status: entitlementStatus,
      validFrom, validUntil, trafficLimitBytes: 50 * 1024 ** 3, createdAt: FROM, updatedAt: FROM });
    store.createIssuanceRequest({ id: requestId, accountId, entitlementId, status: requestStatus,
      approvalRef: "synthetic_approval", nodeId: "synthetic_node", purpose: "subscription",
      requestedByRef: accountId, createdAt: FROM, updatedAt: FROM });
    store.linkIssuedSubscription({ id: linkId, requestId, tenantRef, artifactRef: "synthetic_artifact",
      status: linkStatus, createdAt, updatedAt: createdAt });
    return { accountId, entitlementId, requestId, linkId };
  }
  function portal({ id = "portal_legacy", status = "disabled", tenantId = TENANT } = {}) {
    store.upsertPortalAccessRequest({ id, portalUserRef: "synthetic_portal_user", plan: "monthly",
      clientTarget: "clash", durationDays: 30, quantity: 1, status, nextAction: "none",
      priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM, tenantId,
      validUntil: UNTIL });
  }
  return { db, store, seed, portal,
    read: (at = NOW) => store.getThirdPartySubscriptionEligibilityByTenantRefs(REFS, { at }) };
}

test("eligibility classifies only genuinely absent control history as unbound without writes", t => {
  const f = fixture(t);
  const changes = f.db.prepare("select total_changes() as count").get().count;
  f.db.pragma("query_only = ON");
  assert.deepEqual(f.read(), { state: "unbound" });
  assert.equal(f.db.prepare("select total_changes() as count").get().count, changes);
});

test("real pack offers do not inherit a legacy monthly tier from the same account", t => {
  const f = fixture(t);
  const { accountId } = f.seed();
  const tenants = [];
  for (const offer of COIN_COMMERCE_DATA_PACK_CANDIDATES) {
    const suffix = offer.delivery.trafficGb;
    const tenant = `synthetic_pack_tenant_${suffix}`;
    const entitlementId = `entitlement_pack_${suffix}`;
    const requestId = `request_pack_${suffix}`;
    f.store.createEntitlement({ id: entitlementId, accountId, plan: offer.offerVersionRef,
      status: "active", validFrom: FROM, validUntil: DATA_PACK_TECHNICAL_VALID_UNTIL,
      trafficLimitBytes: suffix * 1024 ** 3, createdAt: FROM, updatedAt: FROM });
    f.store.createIssuanceRequest({ id: requestId, accountId, entitlementId, status: "issued",
      approvalRef: "synthetic_approval", nodeId: "synthetic_node", purpose: "subscription",
      requestedByRef: accountId, createdAt: FROM, updatedAt: FROM });
    f.store.linkIssuedSubscription({ id: `link_pack_${suffix}`, requestId,
      tenantRef: `tenantref_${createHash("sha256").update(tenant).digest("hex").slice(0, 16)}`,
      artifactRef: "synthetic_artifact", status: "active", createdAt: FROM, updatedAt: FROM });
    tenants.push(tenant);
  }
  f.db.pragma("query_only = ON");
  assert.equal(resolveThirdPartyPlanIdForTenant(f.store, { id: TENANT, status: "active" }, { at: NOW }),
    "monthly_basic");
  for (const tenant of tenants) {
    assert.equal(resolveThirdPartyPlanIdForTenant(f.store, { id: tenant, status: "active" }, { at: NOW }), null);
  }
});

for (const tenantRef of REFS) {
  test(`eligibility reads ${tenantRef === TENANT ? "raw" : "hashed"} binding and exposes only plan evidence`, t => {
    const f = fixture(t);
    f.seed({ tenantRef });
    f.db.pragma("query_only = ON");
    assert.deepEqual(f.read(), { state: "bound", binding: {
      plan: "monthly", trafficLimitBytes: 50 * 1024 ** 3, validFrom: FROM, validUntil: UNTIL
    } });
  });
}

for (const [field, values] of Object.entries({
  linkStatus: ["revoked", "rotated", "disabled"],
  requestStatus: ["planned", "failed", "revoked", "cancelled"],
  entitlementStatus: ["expired", "revoked", "suspended"],
  accountStatus: ["suspended", "disabled"]
})) {
  for (const value of values) {
    test(`eligibility denies ${field}=${value} rather than treating it as absent`, t => {
      const f = fixture(t);
      f.seed({ tenantRef: SAFE_TENANT, [field]: value });
      assert.deepEqual(f.read(), { state: "denied" });
    });
  }
}

test("eligibility checks validFrom inclusively and validUntil exclusively", t => {
  const f = fixture(t);
  f.seed();
  assert.equal(f.read(FROM).state, "bound");
  assert.deepEqual(f.read("2026-09-30T23:59:59.999Z"), { state: "denied" });
  assert.deepEqual(f.read(UNTIL), { state: "denied" });
  f.db.prepare("update platform_entitlements set valid_until = 'invalid'").run();
  assert.deepEqual(f.read(), { state: "denied" });
});

for (const missingTable of ["platform_issuance_requests", "platform_entitlements", "platform_accounts"]) {
  test(`eligibility preserves orphan link evidence when ${missingTable} row is absent`, t => {
    const f = fixture(t);
    f.seed();
    f.db.pragma("foreign_keys = OFF");
    f.db.prepare(`delete from ${missingTable}`).run();
    assert.deepEqual(f.read(), { state: "denied" });
  });
}

test("eligibility rejects mismatched entitlement and issuance account ownership", t => {
  const f = fixture(t);
  f.seed();
  f.seed({ suffix: "other", tenantRef: "synthetic_other_tenant" });
  f.db.prepare("update platform_entitlements set account_id = 'account_other' where id = 'entitlement_one'").run();
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility does not fall back from latest revoked link to an older active link", t => {
  const f = fixture(t);
  const { requestId } = f.seed();
  f.store.linkIssuedSubscription({ id: "link_new_revoked", requestId, tenantRef: TENANT,
    artifactRef: "synthetic_new_artifact", status: "revoked", createdAt: NOW, updatedAt: NOW });
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility permits a routine rotation with a newer active link in the same binding", t => {
  const f = fixture(t);
  const { requestId } = f.seed({ linkStatus: "rotated" });
  f.store.linkIssuedSubscription({ id: "link_new_active", requestId, tenantRef: TENANT,
    artifactRef: "synthetic_new_artifact", status: "active", createdAt: NOW, updatedAt: NOW });
  assert.equal(f.read().state, "bound");
});

test("eligibility uses link id as deterministic tie-breaker, not first active SQL row", t => {
  const f = fixture(t);
  const { requestId } = f.seed();
  f.store.linkIssuedSubscription({ id: "zz_link_revoked", requestId, tenantRef: TENANT,
    artifactRef: "synthetic_new_artifact", status: "revoked", createdAt: FROM, updatedAt: FROM });
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility refuses conflicting active ownership within one ref", t => {
  const f = fixture(t);
  f.seed();
  f.seed({ suffix: "other", createdAt: NOW });
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility refuses conflicting ownership across raw and hashed refs", t => {
  const f = fixture(t);
  f.seed();
  f.seed({ suffix: "other", tenantRef: SAFE_TENANT });
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility checks revoked hashed history even when raw lookup is active", t => {
  const f = fixture(t);
  f.seed();
  f.seed({ suffix: "other", tenantRef: SAFE_TENANT, linkStatus: "revoked" });
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility accepts matching active aliases for the same binding", t => {
  const f = fixture(t);
  const { requestId } = f.seed();
  f.store.linkIssuedSubscription({ id: "link_alias", requestId, tenantRef: SAFE_TENANT,
    artifactRef: "synthetic_alias_artifact", status: "active", createdAt: FROM, updatedAt: FROM });
  assert.equal(f.read().state, "bound");
});

for (const status of ["disabled", "rejected", "delivered", "issued"]) {
  test(`eligibility cannot mistake portal-only ${status} history for an early unbound tenant`, t => {
    const f = fixture(t);
    f.portal({ status });
    assert.deepEqual(f.read(), { state: "denied" });
  });
}

test("eligibility respects disabled portal access attached to an otherwise active binding", t => {
  const f = fixture(t);
  const { requestId } = f.seed();
  f.portal({ id: requestId });
  assert.deepEqual(f.read(), { state: "denied" });
});

test("eligibility propagates database/query errors instead of classifying them as unbound", t => {
  const f = fixture(t);
  f.db.exec("drop table platform_issued_subscription_links");
  assert.throws(() => f.read(), /no such table/);
});

test("eligibility rejects malformed inputs before querying rather than broadening fallback", t => {
  const f = fixture(t);
  for (const refs of [null, [], [""], [TENANT, SAFE_TENANT, "extra"], [1]]) {
    assert.throws(() => f.store.getThirdPartySubscriptionEligibilityByTenantRefs(refs, { at: NOW }));
  }
  assert.throws(() => f.read("not-a-date"));
});
