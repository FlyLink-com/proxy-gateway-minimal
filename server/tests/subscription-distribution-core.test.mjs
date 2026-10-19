import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";

const NOW = "2026-10-19T00:00:00.000Z";
const TOKEN = "pgsub_distribution_synthetic_only";
const OWNED_NAME = "synthetic-owned";

function ownedConfig() {
  return { servers: [{ name: OWNED_NAME, host: "192.0.2.10", port: 443,
    protocol: "vless", credentialMode: "per-user", uuid: "synthetic-shared-placeholder" }],
  pingHosts: [], nginx: {} };
}

function thirdPartyConfig(baseProxyConfig) {
  return { ...baseProxyConfig, servers: [{ name: "synthetic-third-party", host: "198.51.100.10",
    port: 8388, protocol: "ss", method: "aes-256-gcm", password: "synthetic-upstream-only" }] };
}

function fixture(t, { tenant = {}, ...options } = {}) {
  const database = new Database(":memory:");
  t.after(() => database.close());
  const repository = createSubscriptionRepository({ database });
  let now = NOW;
  let sequence = 0;
  const proxyConfig = ownedConfig();
  const core = createSubscriptionCore({ repository, proxyConfig,
    publicSubscriptionBaseUrl: "https://subscription.example.test", nowFn: () => new Date(now),
    tenantCredentialMaterialResolver: ({ tenantId }) => ({ uuid: `synthetic-${tenantId}`, password: "synthetic-only" }),
    tokenFactory: () => {
      const rawToken = `pgsub_distribution_replacement_${++sequence}`;
      return { rawToken, tokenHash: hashSubscriptionToken(rawToken), tokenPrefix: rawToken.slice(0, 14) };
    },
    tempTokenFactory: () => {
      const rawToken = `pgtemp_distribution_synthetic_${++sequence}`;
      return { rawToken, tokenHash: hashSubscriptionToken(rawToken), tokenPrefix: rawToken.slice(0, 14) };
    },
    tempLinkIdFactory: () => `temp_synthetic_${++sequence}`,
    artifactIdFactory: () => `artifact_synthetic_${++sequence}`,
    artifactSecretFactory: () => `synthetic_distribution_artifact_${++sequence}`,
    ...options
  });
  repository.createTenant({ id: "tenant_synthetic", displayName: "Synthetic", status: "active",
    expiresAt: "2026-12-01T00:00:00.000Z", note: "", nodeId: OWNED_NAME,
    credentialMode: "shared-node", tokenHash: hashSubscriptionToken(TOKEN),
    tokenPrefix: TOKEN.slice(0, 14), now: NOW, ...tenant });
  return { core, repository, proxyConfig, clock(value) { now = value; } };
}

function secretFromUrl(value) {
  const url = new URL(value);
  return url.searchParams.get("token") || decodeURIComponent(url.pathname.split("/").at(-1).replace(/\.yaml$/, ""));
}

test("absent, null and null-returning distribution hooks preserve the native result", t => {
  const original = fixture(t).core.resolveSubscriptionToken(TOKEN);
  assert.deepEqual(fixture(t, { resolveTenantProxyConfig: null }).core.resolveSubscriptionToken(TOKEN), original);
  assert.deepEqual(fixture(t, { resolveTenantProxyConfig: () => null }).core.resolveSubscriptionToken(TOKEN), original);
  assert.equal(Object.hasOwn(original, "distributionManaged"), false);
  assert.equal(original.proxyConfig.servers[0].uuid, "synthetic-tenant_synthetic");
});

for (const [label, expiresAt, expectedStatus] of [
  ["active", "2026-12-01T00:00:00.000Z", "active"],
  ["expiring", "2026-10-20T00:00:00.000Z", "expiring"]
]) {
  test(`authenticated ${label} tenant receives managed third-party config before native gates`, t => {
    let called = 0;
    const f = fixture(t, { tenant: { expiresAt },
      subscriptionChannelGate: () => { assert.fail("native channel gate must not run"); },
      tenantCredentialMaterialResolver: () => { assert.fail("native material must not be resolved"); },
      resolveTenantProxyConfig: ({ tenant, baseProxyConfig, resolveOwnedProxyConfig }) => {
        called += 1;
        assert.equal(tenant.id, "tenant_synthetic");
        assert.equal(tenant.status, expectedStatus);
        assert.equal(baseProxyConfig, f.proxyConfig);
        assert.equal(typeof resolveOwnedProxyConfig, "function");
        return { proxyConfig: thirdPartyConfig(baseProxyConfig), distributionManaged: true };
      }
    });
    f.proxyConfig.servers[0].status = "disabled";
    const before = structuredClone(f.proxyConfig);
    const result = f.core.resolveSubscriptionToken(TOKEN);
    assert.equal(result.ok, true);
    assert.equal(result.distributionManaged, true);
    assert.equal(result.tenant.status, expectedStatus);
    assert.equal(result.proxyConfig.servers[0].host, "198.51.100.10");
    assert.equal(result.proxyConfig.servers.length, 1);
    assert.equal(called, 1);
    assert.equal(f.repository.getTenant("tenant_synthetic").lastUsedAt, NOW);
    assert.equal(Object.hasOwn(result.tenant, "tokenHash"), false);
    assert.deepEqual(f.proxyConfig, before);
  });
}

test("managed native selection retains channel gates, tenant credential isolation and base material", t => {
  const events = [];
  const f = fixture(t, {
    subscriptionChannelGate: ({ tenantId }) => { events.push(`gate:${tenantId}`); return true; },
    tenantCredentialMaterialResolver: ({ tenantId }) => {
      events.push(`material:${tenantId}`);
      return { uuid: `synthetic-${tenantId}`, password: "synthetic-only" };
    },
    resolveTenantProxyConfig: ({ resolveOwnedProxyConfig }) => ({
      proxyConfig: resolveOwnedProxyConfig(), distributionManaged: true
    })
  });
  const secondToken = "pgsub_distribution_second_synthetic";
  f.repository.createTenant({ ...f.repository.getTenant("tenant_synthetic"), id: "tenant_second",
    tokenHash: hashSubscriptionToken(secondToken), tokenPrefix: secondToken.slice(0, 14), now: NOW });
  const before = structuredClone(f.proxyConfig);
  const first = f.core.resolveSubscriptionToken(TOKEN);
  const second = f.core.resolveSubscriptionToken(secondToken);
  assert.equal(first.proxyConfig.servers[0].uuid, "synthetic-tenant_synthetic");
  assert.equal(second.proxyConfig.servers[0].uuid, "synthetic-tenant_second");
  assert.deepEqual(events, ["gate:tenant_synthetic", "material:tenant_synthetic", "gate:tenant_second", "material:tenant_second"]);
  assert.deepEqual(f.proxyConfig, before);
  assert.equal(first.proxyConfig.servers[0].thirdParty, undefined);
});

for (const [label, hook] of [
  ["throw", () => { throw new Error("synthetic-private-material-must-not-leak"); }],
  ["non-function", {}],
  ["undefined result", () => undefined],
  ["array result", () => []],
  ["unmanaged result", () => ({ proxyConfig: ownedConfig() })],
  ["false managed marker", () => ({ proxyConfig: ownedConfig(), distributionManaged: false })],
  ["missing config", () => ({ distributionManaged: true })],
  ["array config", () => ({ distributionManaged: true, proxyConfig: [] })],
  ["missing servers", () => ({ distributionManaged: true, proxyConfig: {} })],
  ["non-array servers", () => ({ distributionManaged: true, proxyConfig: { servers: {} } })],
  ["invalid node", () => ({ distributionManaged: true, proxyConfig: { servers: [null] } })],
  ["async result", () => Promise.resolve({ proxyConfig: ownedConfig(), distributionManaged: true })],
  ["async rejection", () => Promise.reject(new Error("synthetic private failure"))]
]) {
  test(`distribution ${label} fails closed without native fallback or usage bookkeeping`, t => {
    const f = fixture(t, { resolveTenantProxyConfig: hook,
      subscriptionChannelGate: () => { assert.fail("must not fall back to owned nodes"); } });
    assert.deepEqual(f.core.resolveSubscriptionToken(TOKEN), {
      ok: false, status: 503, error: "subscription_distribution_unavailable"
    });
    assert.equal(f.repository.getTenant("tenant_synthetic").lastUsedAt, null);
  });
}

for (const cause of ["blocked channel", "missing material"]) {
  test(`managed owned branch still denies ${cause}`, t => {
    const f = fixture(t, {
      subscriptionChannelGate: () => cause !== "blocked channel",
      tenantCredentialMaterialResolver: () => null,
      resolveTenantProxyConfig: ({ resolveOwnedProxyConfig }) => ({
        proxyConfig: resolveOwnedProxyConfig(), distributionManaged: true
      })
    });
    assert.deepEqual(f.core.resolveSubscriptionToken(TOKEN), {
      ok: false, status: 403, error: "Subscription node unavailable"
    });
    assert.equal(f.repository.getTenant("tenant_synthetic").lastUsedAt, null);
  });
}

test("managed selection with no nodes preserves node-unavailable denial", t => {
  const f = fixture(t, { resolveTenantProxyConfig: ({ baseProxyConfig }) => ({
    proxyConfig: { ...baseProxyConfig, servers: [] }, distributionManaged: true
  }) });
  assert.deepEqual(f.core.resolveSubscriptionToken(TOKEN), {
    ok: false, status: 403, error: "Subscription node unavailable"
  });
  assert.equal(f.repository.getTenant("tenant_synthetic").lastUsedAt, null);
});

for (const [status, expiresAt, expectedError] of [
  ["disabled", "2026-12-01T00:00:00.000Z", "Subscription disabled"],
  ["active", "2026-10-18T00:00:00.000Z", "Subscription expired"]
]) {
  test(`${expectedError} is enforced before distribution for token, temp and artifact links`, t => {
    const f = fixture(t, { tenant: { status, expiresAt },
      resolveTenantProxyConfig: () => { assert.fail("denied tenant must not enter distribution"); } });
    const temp = f.core.createTempLink("tenant_synthetic");
    const artifact = f.core.createSubscriptionArtifact("tenant_synthetic");
    for (const result of [f.core.resolveSubscriptionToken(TOKEN),
      f.core.resolveSubscriptionToken(secretFromUrl(temp.subscriptionUrl)),
      f.core.resolveSubscriptionArtifact(secretFromUrl(artifact.subscriptionUrl))]) {
      assert.equal(result.ok, false);
      assert.equal(result.status, 403);
      assert.equal(result.error, expectedError);
    }
    assert.equal(f.repository.getTenant("tenant_synthetic").lastUsedAt, null);
  });
}

test("unknown, old reset token, expired temp, revoked and rotated artifacts cannot reach distribution", t => {
  let called = 0;
  const f = fixture(t, { resolveTenantProxyConfig: ({ baseProxyConfig }) => {
    called += 1;
    return { proxyConfig: thirdPartyConfig(baseProxyConfig), distributionManaged: true };
  } });
  assert.equal(f.core.resolveSubscriptionToken("synthetic_unknown").status, 401);
  assert.equal(f.core.resolveSubscriptionArtifact("synthetic_unknown").status, 404);
  const replacement = f.core.resetToken("tenant_synthetic");
  assert.equal(f.core.resolveSubscriptionToken(TOKEN).status, 401);
  const temp = f.core.createTempLink("tenant_synthetic");
  const revoked = f.core.createSubscriptionArtifact("tenant_synthetic");
  f.core.revokeSubscriptionArtifact(revoked.artifact.id);
  assert.equal(f.core.resolveSubscriptionArtifact(secretFromUrl(revoked.subscriptionUrl)).status, 410);
  const original = f.core.createSubscriptionArtifact("tenant_synthetic");
  const rotated = f.core.rotateSubscriptionArtifact(original.artifact.id);
  assert.equal(f.core.resolveSubscriptionArtifact(secretFromUrl(original.subscriptionUrl)).status, 410);
  f.clock("2026-10-21T00:00:00.000Z");
  assert.equal(f.core.resolveSubscriptionToken(secretFromUrl(temp.subscriptionUrl)).status, 403);
  assert.equal(called, 0);
  assert.equal(f.core.resolveSubscriptionToken(secretFromUrl(replacement.subscriptionUrl)).ok, true);
  assert.equal(f.core.resolveSubscriptionArtifact(secretFromUrl(rotated.subscriptionUrl)).ok, true);
  assert.equal(called, 2);
});

test("managed temp and opaque links preserve successful refresh bookkeeping", t => {
  const f = fixture(t, { resolveTenantProxyConfig: ({ baseProxyConfig }) => ({
    proxyConfig: thirdPartyConfig(baseProxyConfig), distributionManaged: true
  }) });
  const temp = f.core.createTempLink("tenant_synthetic");
  const tempSecret = secretFromUrl(temp.subscriptionUrl);
  const artifact = f.core.createSubscriptionArtifact("tenant_synthetic");
  assert.equal(f.core.resolveSubscriptionToken(tempSecret).distributionManaged, true);
  assert.equal(f.repository.findTempLinkByTokenHash(hashSubscriptionToken(tempSecret)).usedAt, NOW);
  assert.equal(f.core.resolveSubscriptionArtifact(secretFromUrl(artifact.subscriptionUrl)).distributionManaged, true);
  const [stored] = f.core.listSubscriptionArtifacts("tenant_synthetic");
  assert.equal(stored.refreshCount, 1);
  assert.equal(stored.lastSeenAt, NOW);
});

test("managed result skips legacy append without consulting third-party state", () => {
  const proxyConfig = thirdPartyConfig(ownedConfig());
  const state = { get thirdPartySubscriptions() { assert.fail("explicit route must bypass append"); } };
  assert.equal(applyThirdPartyProxyConfig(state, { distributionManaged: true, proxyConfig }), proxyConfig);
});
