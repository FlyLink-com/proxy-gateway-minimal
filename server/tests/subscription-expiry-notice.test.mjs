import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { subscriptionRoutes } from "../routes/subscription.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { listen } from "./helpers/listen.mjs";

const START = "2026-10-09T00:00:00.000Z";
const EXPIRY = "2026-10-09T00:01:00.000Z";
const TOKEN = "pgsub_expiry_synthetic_only";
const ARTIFACT = "expiry_artifact_synthetic_only";
const PORTAL = "https://portal.gccwebos.com";

async function fixture(t) {
  const database = new Database(":memory:");
  const store = createSubscriptionRepository({ database });
  let now = new Date(START), artifactIndex = 0, tokenIndex = 0, gateCalls = 0;
  const core = createSubscriptionCore({
    store,
    publicSubscriptionBaseUrl: "https://synthetic.invalid",
    proxyConfig: { servers: [{ name: "expiry-synthetic-node", host: "192.0.2.1", port: 12345,
      method: "aes-256-gcm", password: "expiry-synthetic-password" }] },
    nowFn: () => now, idFactory: () => "tenant_expiry_fixture",
    tokenFactory: () => {
      const rawToken = tokenIndex++ === 0 ? TOKEN : "pgsub_expiry_rotated_synthetic";
      return { rawToken, tokenHash: hashSubscriptionToken(rawToken), tokenPrefix: "pgsub_fixture" };
    },
    artifactSecretFactory: () => artifactIndex === 0 ? ARTIFACT : "expiry_artifact_rotated_synthetic",
    artifactIdFactory: () => `artifact_expiry_${++artifactIndex}`,
    subscriptionChannelGate() { gateCalls++; return true; }
  });
  core.createTenant({ displayName: "Synthetic expiry", expiresAt: EXPIRY });
  core.createSubscriptionArtifact("tenant_expiry_fixture");
  const app = express(); app.use(subscriptionRoutes({ subscriptions: { core } }));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); database.close(); });
  return { core, store, baseUrl, setNow: value => { now = new Date(value); }, gateCalls: () => gateCalls };
}

const paths = [
  `/sub/clash.yaml?token=${TOKEN}`,
  `/sub/a/${ARTIFACT}`,
  `/sub/a/${ARTIFACT}/profile.yaml`,
  `/sub/a/${ARTIFACT}/provider.yaml`
];

test("expiry boundary returns fixed credential-free notice on all YAML routes and renews on refresh", async t => {
  const f = await fixture(t);
  f.setNow("2026-10-09T00:00:59.999Z");
  const active = await fetch(f.baseUrl + paths[0]);
  assert.equal(active.status, 200);
  assert.match(await active.text(), /expiry-synthetic-node/);
  const tenantBefore = f.store.getTenant("tenant_expiry_fixture");
  const artifactsBefore = f.core.listSubscriptionArtifacts("tenant_expiry_fixture");
  const calls = f.gateCalls();
  f.setNow(EXPIRY);
  for (const path of paths) {
    const response = await fetch(f.baseUrl + path, { headers: { "X-Forwarded-Host": "untrusted.invalid" } });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /application\/x-yaml/);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("profile-web-page-url"), PORTAL);
    assert.equal(response.headers.get("x-subscription-status"), "expired");
    assert.equal(response.headers.get("subscription-userinfo"), null, "do not invent zero usage");
    const yaml = await response.text();
    assert.match(yaml, /当前订阅已过期/);
    assert.match(yaml, /请访问用户面板进行充值/);
    assert.ok(yaml.includes(PORTAL));
    assert.equal((yaml.match(/type: reject/g) || []).length, 2);
    assert.doesNotMatch(yaml, /expiry-synthetic|tenant_expiry|192\.0\.2\.1|password:|uuid:|server:|untrusted\.invalid/);
    assert.doesNotMatch(yaml, /proxy-providers:|url-test|health-check/);
    if (path.endsWith("/provider.yaml")) {
      assert.doesNotMatch(yaml, /proxy-groups:|rules:/);
    } else {
      assert.match(yaml, /mode: rule/);
      assert.match(yaml, /MATCH,REJECT/);
      assert.match(yaml, /DOMAIN,portal\.gccwebos\.com,DIRECT/);
      assert.match(yaml, /DOMAIN,sub\.gccwebos\.com,DIRECT/);
      assert.doesNotMatch(yaml, /MATCH,DIRECT|DOMAIN-SUFFIX/);
    }
  }
  assert.equal(f.gateCalls(), calls, "no runtime material/availability path for an expired tenant");
  assert.deepEqual(f.store.getTenant("tenant_expiry_fixture"), tenantBefore, "no lastUsed or lifecycle write");
  assert.deepEqual(f.core.listSubscriptionArtifacts("tenant_expiry_fixture"), artifactsBefore, "no artifact refresh write");
  assert.deepEqual(f.core.resolveSubscriptionToken(TOKEN), {
    ok: false, status: 403, error: "Subscription expired", denialReason: "subscription_expired"
  });
  f.core.renewTenant("tenant_expiry_fixture", { expiresAt: "2026-11-09T00:00:00.000Z" });
  for (const path of paths) {
    const response = await fetch(f.baseUrl + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-subscription-status"), null);
    assert.equal(response.headers.get("profile-web-page-url"), "https://www.gccwebos.com/");
    assert.doesNotMatch(await response.text(), /当前订阅已过期|type: reject/);
  }
});

test("still-valid temporary access can show tenant expiry without marking that link used", async t => {
  const f = await fixture(t);
  const temp = f.core.createTempLink("tenant_expiry_fixture");
  const target = new URL(temp.subscriptionUrl);
  f.setNow(EXPIRY);
  const token = target.searchParams.get("token");
  const before = f.store.findTempLinkByTokenHash(hashSubscriptionToken(token));
  const response = await fetch(f.baseUrl + target.pathname + target.search);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-subscription-status"), "expired");
  assert.match(await response.text(), /当前订阅已过期/);
  assert.deepEqual(f.store.findTempLinkByTokenHash(hashSubscriptionToken(token)), before);
  assert.equal(f.gateCalls(), 0);
});

test("unknown, disabled, revoked, rotated and expired temporary links never receive a notice", async t => {
  const f = await fixture(t);
  const temp = f.core.createTempLink("tenant_expiry_fixture");
  f.setNow(EXPIRY);
  async function deny(path, status) {
    const response = await fetch(f.baseUrl + path);
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("profile-web-page-url"), null);
    assert.equal(response.headers.get("x-subscription-status"), null);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.doesNotMatch(await response.text(), /当前订阅已过期|portal\.gccwebos\.com/);
  }
  await deny("/sub/clash.yaml", 401);
  await deny("/sub/clash.yaml?token=unknown-synthetic", 401);
  await deny("/sub/a/unknown-synthetic", 404);
  f.core.disableTenant("tenant_expiry_fixture");
  for (const path of paths) await deny(path, 403);
  f.core.enableTenant("tenant_expiry_fixture");
  f.core.rotateSubscriptionArtifact("artifact_expiry_1");
  for (const path of paths.slice(1)) await deny(path, 410);
  f.core.revokeSubscriptionArtifact("artifact_expiry_2");
  await deny("/sub/a/expiry_artifact_rotated_synthetic", 410);
  f.core.resetToken("tenant_expiry_fixture");
  await deny(paths[0], 401);
  f.setNow("2026-10-11T00:00:00.000Z");
  const tempUrl = new URL(temp.subscriptionUrl, "https://synthetic.invalid");
  await deny(tempUrl.pathname + tempUrl.search, 403);
});

test("error text alone and non-expiry failures do not opt into a successful notice response", async t => {
  let failure = { ok: false, status: 403, error: "Subscription expired" };
  const core = { resolveSubscriptionToken: () => failure, resolveSubscriptionArtifact: () => failure };
  const app = express(); app.use(subscriptionRoutes({ subscriptions: { core } }));
  const { server, baseUrl } = await listen(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const value of [failure,
    { ok: false, status: 500, error: "internal_error", denialReason: "subscription_expired" },
    { ok: false, status: 403, error: "Subscription node unavailable" }]) {
    failure = value;
    for (const path of paths) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, value.status);
      assert.equal(response.headers.get("x-subscription-status"), null);
      assert.deepEqual(await response.json(), { error: value.error });
    }
  }
});
