import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { subscriptionRoutes } from "../routes/subscription.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  applyThirdPartySubscriptionMigrations,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { generateSubscriptionExpiryNotice } from "../services/subscription-expiry-notice.mjs";
import { listen } from "./helpers/listen.mjs";

const GIB = 1024 ** 3;
const FROM = "2026-10-01T00:00:00.000Z";
const NOW = "2026-10-14T12:00:00.000Z";
const UNTIL = "2026-11-01T00:00:00.000Z";
const TENANT = "synthetic_legacy_http_tenant";
const SAFE_TENANT = `tenantref_${createHash("sha256").update(TENANT).digest("hex").slice(0, 16)}`;
const OWN_HOST = "198.51.100.80";
const TIERS = ["monthly_basic", "monthly_plus", "yearly"];
const HOSTS = ["203.0.113.51", "203.0.113.52", "203.0.113.53"];

function changes(database) {
  return database.prepare("select total_changes() as count").get().count;
}

async function fixture(t, {
  plan = "monthly", trafficLimitBytes = 50 * GIB, bind = true,
  tenantRef = TENANT, validUntil = UNTIL
} = {}) {
  const controlDb = new Database(":memory:");
  const runtimeDb = new Database(":memory:");
  const thirdPartyDb = new Database(":memory:");
  const controlStore = createSqliteSubscriptionControlStore({ database: controlDb });
  let now = NOW;
  const nowFn = () => new Date(now);
  let tokenSequence = 0;
  let artifactSequence = 0;
  let currentToken;
  let currentArtifact;
  const network = { calls: 0 };
  const reads = { eligibility: 0, upstreamNodes: 0 };
  const core = createSubscriptionCore({
    store: createSubscriptionRepository({ database: runtimeDb }),
    proxyConfig: {
      servers: [{ name: "synthetic-owned", host: OWN_HOST, port: 8388,
        method: "aes-256-gcm", password: "synthetic-owned-password" }],
      pingHosts: [], nginx: {}
    },
    publicSubscriptionBaseUrl: "https://synthetic.invalid",
    nowFn,
    idFactory: () => TENANT,
    tokenFactory: () => {
      currentToken = `pgsub_legacy_http_synthetic_${++tokenSequence}`;
      return { rawToken: currentToken, tokenHash: hashSubscriptionToken(currentToken), tokenPrefix: "pgsub_fixture" };
    },
    artifactSecretFactory: () => (currentArtifact = `legacy_http_synthetic_artifact_${++artifactSequence}`),
    artifactIdFactory: () => `artifact_synthetic_${artifactSequence}`
  });
  core.createTenant({ displayName: "Synthetic legacy monthly/yearly", expiresAt: validUntil });
  core.createSubscriptionArtifact(TENANT);
  if (bind) {
    controlStore.createAccount({ id: "account_synthetic", ownerRef: "synthetic_owner", status: "active", createdAt: FROM, updatedAt: FROM });
    controlStore.createEntitlement({ id: "entitlement_synthetic", accountId: "account_synthetic", plan, status: "active",
      validFrom: FROM, validUntil, trafficLimitBytes, createdAt: FROM, updatedAt: FROM });
    controlStore.createIssuanceRequest({ id: "request_synthetic", accountId: "account_synthetic", entitlementId: "entitlement_synthetic",
      status: "issued", approvalRef: "synthetic_approval", nodeId: "synthetic_owned", purpose: "subscription",
      requestedByRef: "synthetic_owner", createdAt: FROM, updatedAt: FROM });
    controlStore.linkIssuedSubscription({ id: "link_synthetic", requestId: "request_synthetic", tenantRef,
      artifactRef: "synthetic_artifact", status: "active", createdAt: FROM, updatedAt: FROM });
  }
  const eligibility = controlStore.getThirdPartySubscriptionEligibilityByTenantRefs;
  controlStore.getThirdPartySubscriptionEligibilityByTenantRefs = (...args) => {
    reads.eligibility += 1;
    return eligibility(...args);
  };
  applyThirdPartySubscriptionMigrations({ database: thirdPartyDb,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, nowFn });
  const thirdPartyStore = createSqliteThirdPartySubscriptionStore({ database: thirdPartyDb,
    secretProtector: createPortalTotpSecretProtector({ key: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff" }),
    fetchFn: async () => { network.calls += 1; throw new Error("upstream fetch forbidden"); },
    resolveFn: async () => { network.calls += 1; throw new Error("upstream DNS forbidden"); }, nowFn });
  const sources = TIERS.map((tier, index) => thirdPartyStore.createInlineSource({
    name: `synthetic-source-${tier}`, enabled: true, tiers: [tier],
    yamlContent: ["proxies:", `  - name: JP-${tier}`, "    type: ss", `    server: ${HOSTS[index]}`,
      "    port: 8388", "    cipher: aes-256-gcm", `    password: synthetic-upstream-${tier}`].join("\n")
  }));
  const listActive = thirdPartyStore.listActiveServersForPlan;
  thirdPartyStore.listActiveServersForPlan = (...args) => {
    reads.upstreamNodes += 1;
    return listActive(...args);
  };
  const state = {
    subscriptions: { core },
    platform: { controlStore, usageNowFn: nowFn },
    thirdPartySubscriptions: { enabled: true, available: true, store: thirdPartyStore }
  };
  const app = express();
  app.use(subscriptionRoutes(state));
  const { server, baseUrl } = await listen(app);
  t.after(() => {
    server.closeAllConnections();
    server.close();
    controlDb.close(); runtimeDb.close(); thirdPartyDb.close();
    assert.equal(network.calls, 0, "download uses imported cache, not upstream HTTP or DNS");
  });
  const artifactPaths = artifact => [`/sub/a/${artifact}`, `/sub/a/${artifact}/profile.yaml`, `/sub/a/${artifact}/provider.yaml`];
  return {
    controlDb, runtimeDb, thirdPartyDb, controlStore, thirdPartyStore, core, state, sources, reads,
    paths: () => [`/sub/clash.yaml?token=${currentToken}`, ...artifactPaths(currentArtifact)],
    artifactPaths: () => artifactPaths(currentArtifact),
    setNow: value => { now = value; },
    get: async path => {
      const response = await fetch(baseUrl + path);
      return { response, body: await response.text() };
    }
  };
}

async function assertTier(f, tier) {
  const index = TIERS.indexOf(tier);
  for (const path of f.paths()) {
    const { response, body } = await f.get(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.ok(body.includes(OWN_HOST), "owned output retained");
    for (let at = 0; at < HOSTS.length; at += 1) {
      assert.equal(body.includes(HOSTS[at]), at === index, `${tier}: only selected source tier on ${path}`);
    }
  }
}

async function assertOwnedOnly(f) {
  for (const path of f.paths()) {
    const { response, body } = await f.get(path);
    assert.equal(response.status, 200, path);
    if (path.endsWith("/profile.yaml")) {
      assert.match(body, /proxy-providers:/, "owned-only profile retains its normal provider layout");
      assert.ok(body.includes(path.replace(/profile\.yaml$/, "provider.yaml")), "profile still references the same authenticated provider");
    } else {
      assert.ok(body.includes(OWN_HOST), "eligibility failures do not remove existing owned output");
    }
    assert.doesNotMatch(body, /\[3P\]|synthetic-upstream|203\.0\.113\./);
  }
}

for (const [plan, gib, tier] of [["monthly", 0, "monthly_basic"], ["yearly", 0, "yearly"], ["monthly", 50, "monthly_basic"], ["monthly", 100, "monthly_plus"], ["yearly", 200, "yearly"]]) {
  for (const tenantRef of [TENANT, SAFE_TENANT]) {
    test(`legacy HTTP four routes resolve ${plan}/${gib} GiB from ${tenantRef === TENANT ? "raw" : "hashed"} evidence without financial writes`, async t => {
      const f = await fixture(t, { plan, trafficLimitBytes: gib * GIB, tenantRef });
      f.controlDb.prepare("insert into platform_quota_counters (account_id, entitlement_id, metric, period, amount, updated_at) values (?, ?, ?, ?, ?, ?)")
        .run("account_synthetic", "entitlement_synthetic", "traffic_bytes", "synthetic_existing_period", 123456, FROM);
      const controlChanges = changes(f.controlDb);
      const thirdPartyChanges = changes(f.thirdPartyDb);
      const entitlementBefore = f.controlDb.prepare("select plan, traffic_limit_bytes, valid_from, valid_until, status from platform_entitlements").get();
      const tenantBefore = f.runtimeDb.prepare("select id, status, expires_at, node_id, credential_mode, token_hash from subscription_tenants").get();
      f.controlDb.pragma("query_only = ON");
      f.thirdPartyDb.pragma("query_only = ON");
      await assertTier(f, tier);
      assert.equal(changes(f.controlDb), controlChanges, "no entitlement, billing, usage or identity writes");
      assert.equal(changes(f.thirdPartyDb), thirdPartyChanges, "no imported source/node writes");
      assert.deepEqual(f.controlDb.prepare("select plan, traffic_limit_bytes, valid_from, valid_until, status from platform_entitlements").get(), entitlementBefore,
        "compatibility never rewrites quota, plan, entitlement status or validity");
      assert.deepEqual(f.runtimeDb.prepare("select id, status, expires_at, node_id, credential_mode, token_hash from subscription_tenants").get(), tenantBefore,
        "normal download bookkeeping cannot renew, reactivate or rotate the runtime subscription");
      assert.equal(f.controlDb.prepare("select amount from platform_quota_counters where entitlement_id = ?").get("entitlement_synthetic").amount, 123456,
        "existing usage is not reset when zero configured quota gains distribution compatibility");
    });
  }
}

test("legacy zero-quota HTTP expiry emits credential-free notice without reading third-party nodes; exact renewal resumes", async t => {
  const expiry = "2026-10-14T12:01:00.000Z";
  const f = await fixture(t, { validUntil: expiry, trafficLimitBytes: 0 });
  await assertTier(f, "monthly_basic");
  const before = { ...f.reads };
  f.setNow(expiry);
  for (const path of f.paths()) {
    const { response, body } = await f.get(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-subscription-status"), "expired");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(body, generateSubscriptionExpiryNotice({ providerOnly: path.endsWith("/provider.yaml") }));
    assert.doesNotMatch(body, /password:|uuid:|server:|synthetic-upstream|\[3P\]/);
  }
  assert.deepEqual(f.reads, before, "expired core resolution never reaches third-party eligibility or material");
  f.core.renewTenant(TENANT, { expiresAt: UNTIL });
  await assertOwnedOnly(f);
  f.controlDb.prepare("update platform_entitlements set valid_until = ?").run(UNTIL);
  await assertTier(f, "monthly_basic");
});

test("legacy zero-quota HTTP reset rejects rotated artifact paths and superseded tenant token without fallback", async t => {
  const f = await fixture(t, { trafficLimitBytes: 0 });
  await assertTier(f, "monthly_basic");
  const oldPaths = f.paths();
  const oldArtifact = f.core.listSubscriptionArtifacts(TENANT)[0];
  const prepared = f.core.prepareSubscriptionArtifactRotation(oldArtifact.id, { tenantId: TENANT });
  f.core.commitPreparedSubscriptionArtifactRotation(prepared);
  f.core.resetToken(TENANT);
  const before = { ...f.reads };
  for (const [index, path] of oldPaths.entries()) {
    const { response, body } = await f.get(path);
    assert.equal(response.status, index === 0 ? 401 : 410, path);
    assert.doesNotMatch(body, /\[3P\]|synthetic-upstream|password:|uuid:|server:/);
  }
  assert.deepEqual(f.reads, before);
  await assertTier(f, "monthly_basic");
  const activeArtifact = f.core.listSubscriptionArtifacts(TENANT).find(item => item.status === "active");
  f.core.revokeSubscriptionArtifact(activeArtifact.id);
  const beforeRevoked = { ...f.reads };
  for (const path of f.artifactPaths()) {
    const { response, body } = await f.get(path);
    assert.equal(response.status, 410);
    assert.doesNotMatch(body, /\[3P\]|synthetic-upstream/);
  }
  assert.deepEqual(f.reads, beforeRevoked);
});

test("legacy zero-quota HTTP truly unbound tenants stay owned-only rather than infer tier from name or expiry", async t => {
  const f = await fixture(t, { bind: false, trafficLimitBytes: 0 });
  await assertOwnedOnly(f);
  assert.equal(f.reads.upstreamNodes, 0);
});

for (const [plan, trafficLimitBytes] of [["monthly", 1], ["monthly", 200 * GIB], ["yearly", 50 * GIB], ["trial", 0], ["trial", 50 * GIB], ["pilot", 0], ["pilot", 50 * GIB], ["data_pack_100gb", 0], ["data_pack_100gb", 100 * GIB]]) {
  test(`legacy HTTP unsupported ${plan}/${trafficLimitBytes} cannot gain a third-party tier`, async t => {
    const f = await fixture(t, { plan, trafficLimitBytes });
    await assertOwnedOnly(f);
    assert.equal(f.reads.upstreamNodes, 0);
  });
}

for (const history of ["orphan", "revoked", "rotated", "query-error", "account-disabled", "account-suspended", "entitlement-expired", "entitlement-revoked", "not-started", "request-failed", "owner-mismatch"]) {
  test(`legacy zero-quota HTTP ${history} control evidence preserves owned output and refuses third-party fallback`, async t => {
    const f = await fixture(t, { trafficLimitBytes: 0 });
    await assertTier(f, "monthly_basic");
    if (history === "orphan") {
      f.controlDb.pragma("foreign_keys = OFF");
      f.controlDb.prepare("delete from platform_entitlements").run();
    } else if (history === "revoked" || history === "rotated") {
      f.controlDb.prepare("update platform_issued_subscription_links set status = ?").run(history);
    } else if (history === "query-error") {
      f.controlDb.exec("drop table platform_issued_subscription_links");
    } else if (history.startsWith("account-")) {
      f.controlDb.prepare("update platform_accounts set status = ?").run(history.slice("account-".length));
    } else if (history === "entitlement-expired") {
      f.controlDb.prepare("update platform_entitlements set valid_until = ?").run(NOW);
    } else if (history === "entitlement-revoked") {
      f.controlDb.prepare("update platform_entitlements set status = 'revoked'").run();
    } else if (history === "not-started") {
      f.controlDb.prepare("update platform_entitlements set valid_from = ?").run(UNTIL);
    } else if (history === "request-failed") {
      f.controlDb.prepare("update platform_issuance_requests set status = 'failed'").run();
    } else if (history === "owner-mismatch") {
      f.controlStore.createAccount({ id: "account_other_synthetic", ownerRef: "other_synthetic_owner", status: "active", createdAt: FROM, updatedAt: FROM });
      f.controlDb.prepare("update platform_entitlements set account_id = ?").run("account_other_synthetic");
    }
    const before = f.reads.upstreamNodes;
    await assertOwnedOnly(f);
    assert.equal(f.reads.upstreamNodes, before);
  });
}

for (const [plan, tier] of [["monthly", "monthly_basic"], ["yearly", "yearly"]]) {
  test(`legacy zero-quota HTTP ${plan} global, source and individual node pause take effect without upstream fetch`, async t => {
    const f = await fixture(t, { plan, trafficLimitBytes: 0 });
    await assertTier(f, tier);
    f.state.thirdPartySubscriptions.enabled = false;
    const beforeGlobalPause = { ...f.reads };
    await assertOwnedOnly(f);
    assert.deepEqual(f.reads, beforeGlobalPause, "global disable short-circuits eligibility and source reads");
    f.state.thirdPartySubscriptions.enabled = true;
    await assertTier(f, tier);
    const source = f.sources[TIERS.indexOf(tier)];
    f.thirdPartyStore.patchSource(source.id, { enabled: false });
    await assertOwnedOnly(f);
    f.thirdPartyStore.patchSource(source.id, { enabled: true });
    await assertTier(f, tier);
    let view = f.thirdPartyStore.listSourceNodes(source.id);
    const node = view.items[0];
    view = f.thirdPartyStore.setSourceNodeEnabled(source.id, node.id, { revision: view.revision, enabled: false });
    await assertOwnedOnly(f);
    f.thirdPartyStore.setSourceNodeEnabled(source.id, node.id, { revision: view.revision, enabled: true });
    await assertTier(f, tier);
  });
}

test("legacy zero-quota HTTP disabled tenant cannot query third-party material", async t => {
  const f = await fixture(t, { trafficLimitBytes: 0 });
  f.core.disableTenant(TENANT);
  for (const path of f.paths()) {
    const { response, body } = await f.get(path);
    assert.equal(response.status, 403);
    assert.doesNotMatch(body, /\[3P\]|synthetic-upstream/);
  }
  assert.deepEqual(f.reads, { eligibility: 0, upstreamNodes: 0 });
});
