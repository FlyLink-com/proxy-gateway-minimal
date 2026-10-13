import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createPortalAccessRequestService } from "../services/platform/portal-access-requests.mjs";
import { ensurePortalSubscriptionLinkResetSchema } from "../services/platform/portal-subscription-link-reset-store.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import {
  applyThirdPartySubscriptionMigrations,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { listen } from "./helpers/listen.mjs";

const NOW = "2026-10-13T00:00:00.000Z";
const FROM = "2026-10-01T00:00:00.000Z";
const UNTIL = "2026-11-01T00:00:00.000Z";
const ACCOUNT = "account_third_party_reset";
const TENANT = "tenant_third_party_reset";
const REQUEST = "request_third_party_reset";
const ENTITLEMENT = "entitlement_third_party_reset";
const EDGE = "edgecred_third_party_reset";
const SESSION = "synthetic_third_party_reset_session";
const TOKEN = "pgsub_third_party_reset_synthetic_only";
const OFFER = "offerv_plan_30d_50gb_monthly_v1";
const GIB = 1024 ** 3;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ref = (kind, value) => `${kind}ref_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;

function artifactPaths(subscriptionUrl) {
  const full = new URL(subscriptionUrl).pathname;
  const bare = full.replace(/\.yaml$/i, "");
  return [full, bare, `${bare}/profile.yaml`, `${bare}/provider.yaml`,
    `${full}/profile.yaml`, `${full}/provider.yaml`];
}

// Real SQLite stores, reset domain service and HTTP routes. Session identity is
// synthetic. Rendered documentation addresses are never contacted; only the
// generated request paths are sent to the ephemeral loopback HTTP listener.
async function fixture(t) {
  const controlDb = new Database(":memory:");
  const runtimeDb = new Database(":memory:");
  const thirdPartyDb = new Database(":memory:");
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    thirdPartyDb.close();
    runtimeDb.close();
    controlDb.close();
  });
  const nowFn = () => new Date(NOW);
  const control = createSqliteSubscriptionControlStore({ database: controlDb });
  const repository = createSubscriptionRepository({ database: runtimeDb });
  const proxyConfig = { servers: [{
    name: "synthetic-reset-owned", protocol: "ss", host: "192.0.2.1", port: 443,
    method: "aes-256-gcm", password: "synthetic-owned-material"
  }], pingHosts: [], nginx: {} };
  let artifactIndex = 0;
  const core = createSubscriptionCore({
    repository, proxyConfig, nowFn,
    publicSubscriptionBaseUrl: "https://subscription.example.test",
    idFactory: () => TENANT,
    tokenFactory: () => ({ rawToken: TOKEN, tokenHash: hashSubscriptionToken(TOKEN), tokenPrefix: "synthetic" }),
    artifactSecretFactory: () => `synthetic_third_party_reset_material_${artifactIndex + 1}`,
    artifactIdFactory: () => `artifact_third_party_reset_${++artifactIndex}`
  });
  core.createTenant({ displayName: "Synthetic reset", expiresAt: UNTIL });
  const original = core.createSubscriptionArtifact(TENANT);
  control.createAccount({ id: ACCOUNT, ownerRef: ACCOUNT, status: "active", createdAt: FROM, updatedAt: FROM });
  control.createEntitlement({ id: ENTITLEMENT, accountId: ACCOUNT, plan: OFFER, status: "active",
    validFrom: FROM, validUntil: UNTIL, trafficLimitBytes: 50 * GIB, createdAt: FROM, updatedAt: FROM });
  control.createIssuanceRequest({ id: REQUEST, accountId: ACCOUNT, entitlementId: ENTITLEMENT,
    approvalRef: "approval_third_party_reset", status: "issued", nodeId: "synthetic-reset-owned",
    purpose: "subscription", requestedByRef: ACCOUNT, createdAt: FROM, updatedAt: FROM });
  control.linkIssuedSubscription({ id: "link_third_party_reset", requestId: REQUEST,
    tenantRef: ref("tenant", TENANT), artifactRef: ref("artifact", original.artifact.id),
    status: "active", createdAt: FROM, updatedAt: FROM });
  control.upsertPortalAccessRequest({ id: REQUEST, portalUserRef: ACCOUNT, plan: "monthly",
    clientTarget: "clash", durationDays: 30, quantity: 1, status: "delivered",
    nextAction: "subscription_ready", priorTrialState: "not_applicable", submittedAt: FROM, updatedAt: FROM,
    validUntil: UNTIL, expiresAt: UNTIL, entitlementRef: ENTITLEMENT, accessGrantRef: "grant_third_party_reset",
    tenantId: TENANT, artifactId: original.artifact.id, subscriptionUrl: original.subscriptionUrl,
    edgeChannelRef: "synthetic-reset-owned", edgeCredentialRef: EDGE, edgeMaterialDigest: "1".repeat(64) });
  control.recordUsageSample({ id: "sample_third_party_reset", sourceRef: "source_third_party_reset",
    channelRef: "synthetic-reset-owned", edgeCredentialRef: EDGE, accountId: ACCOUNT,
    entitlementId: ENTITLEMENT, requestId: REQUEST, observedAt: "2026-10-12T23:59:00.000Z",
    intervalStartedAt: "2026-10-12T23:58:00.000Z", intervalEndedAt: "2026-10-12T23:59:00.000Z",
    uploadBytes: 1024, downloadBytes: 3072, totalBytes: 4096,
    sampleDigest: "synthetic_third_party_reset_sample", createdAt: NOW });
  ensurePortalSubscriptionLinkResetSchema(controlDb);
  const accessRequests = createPortalAccessRequestService({
    runtimeCore: core, controlStore: control, nowFn, subscriptionLinkResetEnabled: true
  });
  applyThirdPartySubscriptionMigrations({ database: thirdPartyDb,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, nowFn });
  const network = { calls: 0 };
  const noRemoteAccess = async () => { network.calls += 1; throw new Error("Synthetic remote access forbidden"); };
  const thirdPartyStore = createSqliteThirdPartySubscriptionStore({ database: thirdPartyDb,
    secretProtector: createPortalTotpSecretProtector({ key: "12".repeat(32) }),
    fetchFn: noRemoteAccess, resolveFn: noRemoteAccess, nowFn });
  for (const [tier, country, host, password] of [
    ["monthly_basic", "HK", "203.0.113.10", "synthetic-basic-third-party"],
    ["monthly_plus", "JP", "203.0.113.11", "synthetic-plus-third-party"]
  ]) {
    thirdPartyStore.createInlineSource({ name: `synthetic-${tier}`, tiers: [tier], enabled: true,
      yamlContent: ["proxies:", `  - name: ${country}`, "    type: ss", `    server: ${host}`,
        "    port: 8388", "    cipher: aes-256-gcm", `    password: ${password}`].join("\n") });
  }
  const selectedTiers = [];
  const listActive = thirdPartyStore.listActiveServersForPlan;
  thirdPartyStore.listActiveServersForPlan = planId => {
    selectedTiers.push(planId);
    return listActive(planId);
  };
  const app = createApp({
    rootDir: ROOT, consoleToken: "synthetic_console_third_party_reset", proxyConfig,
    subscriptions: { core, publicSubscriptionBaseUrl: "https://subscription.example.test" },
    thirdPartySubscriptions: { enabled: true, available: true, store: thirdPartyStore },
    services: { ssLocal: { status: () => ({ running: false }) }, httpProxy: { status: () => ({ running: false }) } },
    platform: { controlStore: control, portalAccessRequests: accessRequests,
      userPortalRoutesEnabled: true, usageNowFn: nowFn,
      userPortalAuth: { requireSession({ sessionRef }) {
        if (sessionRef !== SESSION) throw Object.assign(new Error("Synthetic session invalid"), { code: "invalid_session" });
        return { accountId: ACCOUNT, sessionRef };
      } }
    }
  });
  const listening = await listen(app);
  server = listening.server;
  async function download(path) {
    const response = await fetch(`${listening.baseUrl}${path}`);
    return { status: response.status, headers: response.headers, text: await response.text() };
  }
  async function reset() {
    const response = await fetch(`${listening.baseUrl}/api/portal/access-requests/reset-link`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Portal-Session": SESSION },
      body: JSON.stringify({ requestRef: REQUEST, idempotencyKey: "synthetic-third-party-reset-01", confirmed: true })
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const body = await response.json();
    assert.equal(body.request.event.type, "subscription_link_reset");
    return body.request.subscriptionUrl;
  }
  function resources() {
    return { tenant: repository.getTenant(TENANT), entitlement: control.getEntitlement(ENTITLEMENT),
      binding: control.findUsageBindingByTenantRef(ref("tenant", TENANT)),
      samples: control.listUsageSamples({ requestId: REQUEST }), rollup: control.getUsageRollupByEdgeCredentialRef(EDGE) };
  }
  return { core, repository, original, download, reset, resources, selectedTiers, network };
}

function assertBasicDelivery(download) {
  assert.equal(download.status, 200);
  assert.match(download.headers.get("cache-control"), /no-store/);
  assert.equal(download.headers.get("subscription-userinfo"),
    `upload=1024; download=3072; total=${50 * GIB}; expire=${Date.parse(UNTIL) / 1000}`);
  assert.match(download.text, /\[3P\] HK 1/);
  assert.match(download.text, /synthetic-basic-third-party/);
  assert.doesNotMatch(download.text, /\[3P\] JP|synthetic-plus-third-party/);
}

test("real Portal reset rejects old artifacts before any third-party read and preserves the new link's tenant and tier", async t => {
  const f = await fixture(t);
  const oldPaths = artifactPaths(f.original.subscriptionUrl);
  const beforeDownloads = [];
  for (const path of oldPaths) {
    const delivered = await f.download(path);
    assertBasicDelivery(delivered);
    beforeDownloads.push(delivered);
  }
  const before = f.resources();
  const readsBeforeReset = f.selectedTiers.length;
  const replacementUrl = await f.reset();
  assert.notEqual(replacementUrl, f.original.subscriptionUrl);
  assert.equal(f.selectedTiers.length, readsBeforeReset, "reset does not retrieve third-party material");
  for (const path of oldPaths) {
    const denied = await f.download(path);
    assert.equal(denied.status, 410);
    assert.deepEqual(JSON.parse(denied.text), { error: "Subscription artifact rotated" });
    assert.doesNotMatch(denied.text, /\[3P\]|synthetic-basic-third-party|proxies:/);
  }
  assert.equal(f.selectedTiers.length, readsBeforeReset, "rotated aliases never retrieve third-party material");
  for (const [index, path] of artifactPaths(replacementUrl).entries()) {
    const delivered = await f.download(path);
    assertBasicDelivery(delivered);
    assert.equal(delivered.text, beforeDownloads[index].text);
  }
  assert.equal(f.selectedTiers.length, readsBeforeReset + oldPaths.length);
  assert.ok(f.selectedTiers.every(tier => tier === "monthly_basic"));
  assert.deepEqual(f.resources(), before, "reset preserves tenant, current tier and existing usage");
  assert.equal(await f.reset(), replacementUrl, "reset retry reuses its durable replacement");
  const artifacts = f.core.listSubscriptionArtifacts(TENANT);
  assert.equal(artifacts.length, 2);
  assert.deepEqual(artifacts.map(artifact => artifact.status).sort(), ["active", "rotated"]);
  assert.equal(f.network.calls, 0);
});

test("artifact reset does not pretend to revoke the separate legacy tenant-token contract", async t => {
  const f = await fixture(t);
  const legacyPath = `/sub/clash.yaml?token=${encodeURIComponent(TOKEN)}`;
  const before = await f.download(legacyPath);
  assertBasicDelivery(before);
  const tokenHash = hashSubscriptionToken(TOKEN);
  const legacyAuth = f.repository.findTenantByTokenHash(tokenHash);
  assert.equal(legacyAuth.id, TENANT);
  assert.equal(legacyAuth.tokenHash, tokenHash);
  const replacementUrl = await f.reset();
  const readsAfterReset = f.selectedTiers.length;
  const after = await f.download(legacyPath);
  assertBasicDelivery(after);
  assert.equal(after.text, before.text);
  assert.equal(f.selectedTiers.length, readsAfterReset + 1);
  assert.deepEqual(f.repository.findTenantByTokenHash(tokenHash), legacyAuth);
  assertBasicDelivery(await f.download(artifactPaths(replacementUrl)[0]));
  assert.ok(f.selectedTiers.every(tier => tier === "monthly_basic"));
  assert.equal(f.network.calls, 0);
});
