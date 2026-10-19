import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { subscriptionRoutes } from "../routes/subscription.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  applyThirdPartySubscriptionMigrations,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM
} from "../services/platform/third-party-subscription-migrations.mjs";
import {
  applySubscriptionDistributionMigrations,
  REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
  REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM
} from "../services/platform/subscription-distribution-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { createSqliteSubscriptionDistributionStore } from "../services/platform/subscription-distribution-store.mjs";
import { listen } from "./helpers/listen.mjs";
import { parse as parseYaml } from "yaml";

const NOW = "2026-10-19T00:00:00.000Z";
const OWNED_HOST = "192.0.2.80";
const SELECTED_HOST = "198.51.100.81";
const OTHER_HOST = "198.51.100.82";
const OFFER = "offerv_plan_30d_50gb_monthly_v1";
const YAML = `proxies:
  - {name: SG selected synthetic, type: ss, server: ${SELECTED_HOST}, port: 8388, cipher: aes-256-gcm, password: synthetic-selected-only}
  - {name: SG unselected synthetic, type: ss, server: ${OTHER_HOST}, port: 8388, cipher: aes-256-gcm, password: synthetic-not-selected}`;

function tokenFor(id) { return `pgsub_distribution_http_${id}`; }
function artifactFrom(url) { return new URL(url).pathname.split("/").at(-1).replace(/\.yaml$/, ""); }
function pathsFor(id, artifact) {
  return [`/sub/clash.yaml?token=${tokenFor(id)}`, `/sub/a/${artifact}`,
    `/sub/a/${artifact}/profile.yaml`, `/sub/a/${artifact}/provider.yaml`];
}
function hasNoMaterials(body) {
  return ![OWNED_HOST, SELECTED_HOST, OTHER_HOST, "synthetic-owned-material", "synthetic-selected-only", "synthetic-not-selected"]
    .some(value => body.includes(value));
}

async function fixture(t, options = {}) {
  const subscriptionDb = new Database(":memory:");
  const distributionDb = new Database(":memory:");
  let server;
  t.after(() => {
    server?.closeAllConnections();
    server?.close();
    subscriptionDb.close();
    distributionDb.close();
  });
  let now = NOW;
  let available = true;
  let nativeSupply = true;
  let sequence = 0;
  const stats = { hookCalls: 0, gateCalls: 0, materialCalls: 0, networkCalls: 0 };
  const nowFn = () => new Date(now);
  applyThirdPartySubscriptionMigrations({ database: distributionDb,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM, nowFn });
  applySubscriptionDistributionMigrations({ database: distributionDb,
    expectedMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM, nowFn });
  const thirdPartyStore = createSqliteThirdPartySubscriptionStore({ database: distributionDb,
    nowFn, secretProtector: createPortalTotpSecretProtector({ key: Buffer.alloc(32, 29) }),
    fetchFn: async () => { stats.networkCalls += 1; throw new Error("unexpected upstream network"); },
    resolveFn: async () => { stats.networkCalls += 1; throw new Error("unexpected upstream DNS"); }
  });
  const source = thirdPartyStore.createInlineSource({ name: "Synthetic routing source", yamlContent: YAML,
    tiers: ["monthly_basic"], enabled: true });
  const selectedId = thirdPartyStore.listActiveServersForPlan("monthly_basic").find(node => node.host === SELECTED_HOST).id;
  const ownedConfig = { servers: [{ name: "synthetic-owned-vless", protocol: "vless", host: OWNED_HOST,
    port: 443, credentialMode: "per-user", uuid: "synthetic-shared-placeholder" }], pingHosts: [], nginx: {} };
  const history = Object.freeze({ uploadBytes: 123, downloadBytes: 456 });
  const bindings = new Map(["tenant_a", "tenant_b"].map(id => [id, Object.freeze({
    plan: OFFER, trafficLimitBytes: 50 * 1024 ** 3, edgeCredentialRef: `edge_synthetic_${id}`, requestId: `request_synthetic_${id}`
  })]));
  const controlStore = {
    getThirdPartySubscriptionEligibilityByTenantRefs: refs => {
      const binding = refs.map(ref => bindings.get(ref)).find(Boolean);
      return binding ? { state: "bound", binding } : { state: "missing", binding: null };
    },
    findUsageBindingByTenantRef: ref => bindings.get(ref) || null,
    getUsageRollupByEdgeCredentialRef: () => ({ ...history })
  };
  const distributionStore = createSqliteSubscriptionDistributionStore({ database: distributionDb,
    proxyConfig: ownedConfig, thirdPartyStore, controlStore, nowFn, routingPolicy: options.routingPolicy,
    nativeSupplyAllowed: options.controlNativeSupply ? () => nativeSupply : undefined });
  assert.equal(distributionStore.available, true);
  const repository = createSubscriptionRepository({ database: subscriptionDb });
  const core = createSubscriptionCore({ repository, proxyConfig: ownedConfig, nowFn,
    publicSubscriptionBaseUrl: "https://subscription.example.test",
    subscriptionChannelGate: () => { stats.gateCalls += 1; return available; },
    tenantCredentialMaterialResolver: ({ tenantId }) => {
      stats.materialCalls += 1;
      if (!available) throw new Error("synthetic native material unavailable");
      return { uuid: `synthetic-owned-material-${tenantId}`, password: "synthetic-owned-password" };
    },
    resolveTenantProxyConfig: input => { stats.hookCalls += 1; return distributionStore.resolveProxyConfig(input); },
    artifactIdFactory: () => `artifact_synthetic_http_${++sequence}`,
    artifactSecretFactory: () => `synthetic_distribution_http_artifact_${++sequence}`,
    tokenFactory: () => {
      const rawToken = `pgsub_distribution_http_reset_${++sequence}`;
      return { rawToken, tokenHash: hashSubscriptionToken(rawToken), tokenPrefix: rawToken.slice(0, 14) };
    }
  });
  const artifacts = {};
  for (const id of ["tenant_a", "tenant_b", "tenant_unqualified"]) {
    repository.createTenant({ id, displayName: "Synthetic", status: "active", expiresAt: "2026-12-01T00:00:00.000Z",
      note: "", nodeId: "synthetic-owned-vless", credentialMode: "shared-node", tokenHash: hashSubscriptionToken(tokenFor(id)),
      tokenPrefix: tokenFor(id).slice(0, 14), now: NOW });
    const result = core.createSubscriptionArtifact(id);
    artifacts[id] = { id: result.artifact.id, secret: artifactFrom(result.subscriptionUrl) };
  }
  const state = { subscriptions: { core, publicSubscriptionBaseUrl: "https://subscription.example.test" },
    proxyConfig: ownedConfig, thirdPartySubscriptions: { enabled: true, available: true, store: thirdPartyStore },
    platform: { controlStore, usageNowFn: nowFn } };
  const app = express();
  app.use(subscriptionRoutes(state));
  const listening = await listen(app);
  server = listening.server;
  const request = async path => {
    const response = await fetch(listening.baseUrl + path);
    return { status: response.status, headers: response.headers, body: await response.text() };
  };
  function route(mode, nodeIds = [selectedId]) {
    const snapshot = distributionStore.getSnapshot();
    return distributionStore.writeRoutes({ revision: snapshot.revision, routes: snapshot.routes.map(value =>
      value.planId === "monthly_basic" ? { planId: value.planId, mode,
        nodeIds: mode === "third-party" ? nodeIds : [] } : value) });
  }
  function stableBusinessState() {
    return JSON.stringify({ history, bindings: [...bindings], tenants: repository.listTenants().map(({ id, expiresAt, nodeId, status, credentialMode }) =>
      ({ id, expiresAt, nodeId, status, credentialMode })) });
  }
  return { core, repository, source, selectedId, thirdPartyStore, distributionStore, artifacts, stats,
    request, route, stableBusinessState, ownedAvailable(value) { available = value; }, nativeSupply(value) { nativeSupply = value; }, clock(value) { now = value; } };
}

async function assertThirdPartyOnly(f, paths) {
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control")?.includes("no-store"), true);
    assert.equal(result.body.includes(SELECTED_HOST), true, "selected upstream must be rendered");
    assert.equal(result.body.includes("[3P]"), true, "third-party route must be identified");
    assert.equal([OWNED_HOST, OTHER_HOST, "synthetic-owned-material", "synthetic-shared-placeholder", "synthetic-not-selected"]
      .some(value => result.body.includes(value)), false, "unselected/native material must not be rendered");
  }
}

test("same original links switch owned → selected upstream → owned across four HTTP YAML entries", async t => {
  const f = await fixture(t);
  const pathsA = pathsFor("tenant_a", f.artifacts.tenant_a.secret);
  const pathsB = pathsFor("tenant_b", f.artifacts.tenant_b.secret);
  const beforeBusinessState = f.stableBusinessState();
  for (const [id, paths] of [["tenant_a", pathsA], ["tenant_b", pathsB]]) {
    for (const path of paths) {
      const result = await f.request(path);
      assert.equal(result.status, 200);
      assert.equal(result.body.includes("[3P]"), false);
      assert.equal(result.body.includes(SELECTED_HOST), false);
      if (path.endsWith("/profile.yaml")) assert.equal(result.body.includes("proxy-providers:"), true);
      else {
        assert.equal(result.body.includes(OWNED_HOST), true);
        assert.equal(result.body.includes(`synthetic-owned-material-${id}`), true);
        assert.equal(result.body.includes(`synthetic-owned-material-${id === "tenant_a" ? "tenant_b" : "tenant_a"}`), false);
      }
    }
  }
  f.route("third-party");
  f.ownedAvailable(false);
  const nativeCalls = { gateCalls: f.stats.gateCalls, materialCalls: f.stats.materialCalls };
  await assertThirdPartyOnly(f, [...pathsA, ...pathsB]);
  assert.equal(f.stats.gateCalls, nativeCalls.gateCalls);
  assert.equal(f.stats.materialCalls, nativeCalls.materialCalls);
  assert.equal(f.stableBusinessState() === beforeBusinessState, true);

  f.route("owned");
  f.ownedAvailable(true);
  for (const [id, path] of [["tenant_a", pathsA[0]], ["tenant_b", pathsB[0]]]) {
    const result = await f.request(path);
    assert.equal(result.status, 200);
    assert.equal(result.body.includes(OWNED_HOST), true);
    assert.equal(result.body.includes(`synthetic-owned-material-${id}`), true);
    assert.equal(result.body.includes(SELECTED_HOST), false);
  }
  assert.equal(f.stableBusinessState() === beforeBusinessState, true);
  assert.equal(f.stats.networkCalls, 0);
});

test("paused or deleted selected upstream rejects all entries and never falls back to BWH", async t => {
  const f = await fixture(t);
  f.route("third-party");
  const paths = pathsFor("tenant_a", f.artifacts.tenant_a.secret);
  await assertThirdPartyOnly(f, paths);
  const nativeCalls = f.stats.gateCalls + f.stats.materialCalls;
  let view = f.thirdPartyStore.listSourceNodes(f.source.id);
  view = f.thirdPartyStore.setSourceNodeEnabled(f.source.id, f.selectedId, { revision: view.revision, enabled: false });
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 503);
    assert.equal(hasNoMaterials(result.body), true);
    assert.equal(result.body.includes("subscription_distribution_unavailable"), true);
  }
  f.thirdPartyStore.deleteSourceNode(f.source.id, f.selectedId, { revision: view.revision });
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 503);
    assert.equal(hasNoMaterials(result.body), true);
  }
  assert.equal(f.stats.gateCalls + f.stats.materialCalls, nativeCalls);
  f.route("owned");
  const restored = await f.request(paths[0]);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.includes(OWNED_HOST), true);
});

test("expired and disabled subscribers are rejected before distribution across all HTTP entries", async t => {
  const f = await fixture(t);
  f.route("third-party");
  const paths = pathsFor("tenant_a", f.artifacts.tenant_a.secret);
  const hookCalls = f.stats.hookCalls;
  f.core.disableTenant("tenant_a");
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 403);
    assert.equal(hasNoMaterials(result.body), true);
  }
  f.core.enableTenant("tenant_a");
  f.clock("2026-12-01T00:00:00.000Z");
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("x-subscription-status"), "expired");
    assert.equal(hasNoMaterials(result.body), true);
  }
  assert.equal(f.stats.hookCalls, hookCalls);
});

test("revoked, rotated, reset and unknown links cannot enter third-party distribution", async t => {
  const f = await fixture(t);
  f.route("third-party");
  const originalA = f.artifacts.tenant_a;
  f.core.revokeSubscriptionArtifact(originalA.id);
  const originalB = f.artifacts.tenant_b;
  const replacement = f.core.rotateSubscriptionArtifact(originalB.id);
  f.core.resetToken("tenant_a");
  const hookCalls = f.stats.hookCalls;
  for (const [id, artifact] of [["tenant_a", originalA], ["tenant_b", originalB]]) {
    for (const path of pathsFor(id, artifact.secret).slice(1)) {
      const result = await f.request(path);
      assert.equal(result.status, 410);
      assert.equal(hasNoMaterials(result.body), true);
    }
  }
  for (const path of [pathsFor("tenant_a", originalA.secret)[0], "/sub/clash.yaml?token=synthetic_unknown"] ) {
    const result = await f.request(path);
    assert.equal(result.status, 401);
    assert.equal(hasNoMaterials(result.body), true);
  }
  const unknown = await f.request("/sub/a/synthetic_unknown");
  assert.equal(unknown.status, 404);
  assert.equal(hasNoMaterials(unknown.body), true);
  assert.equal(f.stats.hookCalls, hookCalls);
  await assertThirdPartyOnly(f, [`/sub/a/${artifactFrom(replacement.subscriptionUrl)}`]);
});

test("unqualified tenant cannot select third-party material even while the same tier is routed upstream", async t => {
  const f = await fixture(t);
  f.route("third-party");
  const paths = pathsFor("tenant_unqualified", f.artifacts.tenant_unqualified.secret);
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 200);
    assert.equal(result.body.includes(SELECTED_HOST), false);
    assert.equal(result.body.includes("[3P]"), false);
    if (!path.endsWith("/profile.yaml")) assert.equal(result.body.includes(OWNED_HOST), true);
  }
  f.ownedAvailable(false);
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 503);
    assert.equal(hasNoMaterials(result.body), true);
  }
});

test("original HTTP links carry client automatic groups and UTC daily priority without server network or business changes", async t => {
  const f = await fixture(t, { routingPolicy: { clientHealthCheckEnabled: true, dailyRotationEnabled: true } });
  const ids = f.distributionStore.getSnapshot().candidates.map(node => node.id);
  f.route("third-party", ids);
  f.ownedAvailable(false);
  const beforeBusiness = f.stableBusinessState();
  const paths = pathsFor("tenant_a", f.artifacts.tenant_a.secret);
  const before = [];
  for (const path of paths) {
    const result = await f.request(path);
    assert.equal(result.status, 200);
    const yaml = parseYaml(result.body);
    assert.equal(yaml.proxies.length, 2);
    assert.equal(result.body.includes(OWNED_HOST), false);
    assert.equal(result.body.includes("tpnode_"), false);
    const names = yaml.proxies.map(item => item.name);
    before.push(names);
    if (path.endsWith("/provider.yaml")) {
      assert.deepEqual(Object.keys(yaml), ["proxies"]);
    } else {
      const groups = yaml["proxy-groups"];
      const auto = groups.find(item => item.name === "3P-AUTO");
      const fallback = groups.find(item => item.name === "3P-FALLBACK");
      assert.equal(groups.find(item => item.name === "GLOBAL").proxies[0], "3P-AUTO");
      assert.equal(auto.type, "url-test");
      assert.equal(auto.interval, 300);
      assert.deepEqual(auto.proxies, names);
      assert.equal(fallback.type, "fallback");
      assert.deepEqual(fallback.proxies, names);
    }
  }
  f.clock("2026-10-20T00:00:00.000Z");
  for (const [index, path] of paths.entries()) {
    const result = await f.request(path);
    assert.equal(result.status, 200);
    const names = parseYaml(result.body).proxies.map(item => item.name);
    assert.notDeepEqual(names, before[index]);
    assert.deepEqual([...names].sort(), [...before[index]].sort());
  }
  assert.equal(f.stableBusinessState(), beforeBusiness);
  assert.equal(f.stats.networkCalls, 0);
  assert.equal(f.stats.gateCalls, 0);
  assert.equal(f.stats.materialCalls, 0);
});

test("BWH physical pause latch removes native output on every original link while selected third-party remains refreshable", async t => {
  const f = await fixture(t, { controlNativeSupply: true });
  const paths = pathsFor("tenant_a", f.artifacts.tenant_a.secret);
  const business = f.stableBusinessState();
  f.nativeSupply(false);
  for (const path of paths) {
    const blocked = await f.request(path);
    assert.equal(blocked.status, 503);
    assert.equal(hasNoMaterials(blocked.body), true);
  }
  f.route("third-party");
  await assertThirdPartyOnly(f, paths);
  for (const path of pathsFor("tenant_unqualified", f.artifacts.tenant_unqualified.secret)) {
    const blocked = await f.request(path);
    assert.equal(blocked.status, 503);
    assert.equal(hasNoMaterials(blocked.body), true);
  }
  f.nativeSupply(true);
  f.route("owned");
  assert.equal((await f.request(paths[0])).status, 200);
  assert.equal(f.stableBusinessState(), business);
});
