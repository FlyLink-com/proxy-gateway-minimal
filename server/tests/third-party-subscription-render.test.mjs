import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { generateClashSubscription } from "../services/clash-subscription.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";
import {
  THIRD_PARTY_OFFER_PLAN_MAP,
  findUsageBindingForTenant,
  resolveThirdPartyPlanId
} from "../services/platform/third-party-subscription-tier.mjs";
import { createPortalTotpSecretProtector } from "../services/platform/portal-totp-verifier.mjs";
import {
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
  REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
  applyThirdPartySubscriptionMigrations
} from "../services/platform/third-party-subscription-migrations.mjs";
import { createSqliteThirdPartySubscriptionStore } from "../services/platform/third-party-subscription-store.mjs";
import { subscriptionRoutes } from "../routes/subscription.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { generateSubscriptionExpiryNotice } from "../services/subscription-expiry-notice.mjs";
import { listen } from "./helpers/listen.mjs";

const GIB = 1024 ** 3;
const OFFER_50 = "offerv_plan_30d_50gb_monthly_v1";
const OFFER_100 = "offerv_plan_30d_100gb_monthly_v1";
const OFFER_200 = "offerv_plan_365d_200gb_monthly_v1";
const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const TOKEN = "pgsub_third_party_synthetic_only";
const ARTIFACT = "third_party_artifact_synthetic_only";
const SS_YAML = [
  "proxies:",
  "  - name: HK",
  "    type: ss",
  "    server: 203.0.113.10",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password",
  "  - name: JP",
  "    type: ss",
  "    server: 203.0.113.11",
  "    port: 8388",
  "    cipher: aes-256-gcm",
  "    password: synthetic-password"
].join("\n");
const HY2_YAML = [
  "proxies:",
  "  - name: SG",
  "    type: hysteria2",
  "    server: 203.0.113.12",
  "    port: 443",
  "    password: synthetic-hy2",
  "    sni: hy2.example.test"
].join("\n");
const VLESS_BOOL_YAML = [
  "proxies:",
  "  - name: 日本",
  "    type: vless",
  "    server: 203.0.113.21",
  "    port: 443",
  "    uuid: 11111111-1111-4111-8111-111111111111",
  "    udp: true",
  "    tls: true",
  "  - name: 大阪",
  "    type: vless",
  "    server: 203.0.113.22",
  "    port: 443",
  "    uuid: 22222222-2222-4222-8222-222222222222",
  "    udp: false",
  "    tls: false",
  "  - name: 京都",
  "    type: vless",
  "    server: 203.0.113.23",
  "    port: 443",
  "    uuid: 33333333-3333-4333-8333-333333333333"
].join("\n");

function sampleOwnConfig() {
  return {
    servers: [
      {
        name: "aws-singapore-blue",
        host: "47.129.247.102",
        port: 18388,
        method: "aes-256-gcm",
        password: "pw:with#chars",
        qualityClass: "stable"
      },
      {
        name: "aws-singapore-backup",
        host: "198.51.100.10",
        port: 8388,
        method: "aes-256-gcm",
        password: "secondary-secret"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function proxyGroupBlock(yaml, name) {
  const marker = `  - name: ${name}\n`;
  const start = yaml.indexOf(marker);
  assert.notEqual(start, -1, `expected proxy group ${name}`);
  const next = yaml.indexOf("\n  - name: ", start + marker.length);
  return yaml.slice(start, next === -1 ? yaml.length : next);
}

function proxyBlockByServer(yaml, host) {
  const marker = `server: "${host}"`;
  const at = yaml.indexOf(marker);
  assert.notEqual(at, -1, host);
  const start = yaml.lastIndexOf("\n  - name:", at);
  const next = yaml.indexOf("\n  - name:", at + marker.length);
  return yaml.slice(start === -1 ? 0 : start, next === -1 ? yaml.length : next);
}

test("tier resolution follows the offer version ref and fails closed otherwise", () => {
  // WALLET_FIRST_RESOURCE_EFFECT_SUPPORTED_OFFERS is not exported from
  // subscription-control-db.mjs, so this test does not assert key equality
  // against that private map. The keys below are the duplicated source of truth.
  assert.deepEqual(Object.keys(THIRD_PARTY_OFFER_PLAN_MAP), [OFFER_50, OFFER_100, OFFER_200]);
  const expectedPlanId = {
    [OFFER_50]: "monthly_basic",
    [OFFER_100]: "monthly_plus",
    [OFFER_200]: "yearly"
  };
  for (const [ref, offer] of Object.entries(THIRD_PARTY_OFFER_PLAN_MAP)) {
    const bytes = offer.monthlyTrafficGb * GIB;
    assert.equal(offer.planId, expectedPlanId[ref]);
    assert.equal(resolveThirdPartyPlanId({
      plan: ref,
      trafficLimitBytes: bytes,
      tenantStatus: "active"
    }), offer.planId);
    assert.equal(resolveThirdPartyPlanId({
      plan: ref,
      trafficLimitBytes: bytes + 1,
      tenantStatus: "active"
    }), null);
    assert.equal(resolveThirdPartyPlanId({
      plan: ref,
      trafficLimitBytes: bytes - 1,
      tenantStatus: "active"
    }), null);
    assert.equal(resolveThirdPartyPlanId({
      offerVersionRef: ref,
      trafficLimitBytes: bytes,
      tenantStatus: "active"
    }), offer.planId);
    assert.equal(resolveThirdPartyPlanId({
      plan: ref,
      tenantStatus: "active"
    }), offer.planId);
    assert.equal(resolveThirdPartyPlanId({
      plan: ref,
      trafficLimitBytes: bytes,
      tenantStatus: "disabled"
    }), null);
    assert.equal(resolveThirdPartyPlanId({
      plan: ref,
      trafficLimitBytes: bytes,
      tenantStatus: "expired"
    }), null);
  }
  for (const plan of ["monthly", "yearly", "trial", "pilot"]) {
    assert.equal(resolveThirdPartyPlanId({
      plan,
      trafficLimitBytes: 50 * GIB,
      tenantStatus: "active"
    }), null);
  }
  for (const plan of ["monthly_30d_50gb", "monthly_30d_100gb", "yearly_365d_200gb", "offerv_unknown"]) {
    assert.equal(resolveThirdPartyPlanId({
      plan,
      trafficLimitBytes: 50 * GIB,
      tenantStatus: "active"
    }), null);
  }
  assert.equal(resolveThirdPartyPlanId({
    plan: OFFER_50,
    trafficLimitBytes: 0,
    tenantStatus: "active"
  }), null);
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 50 * GIB, tenantStatus: "active" }), null);
  assert.equal(resolveThirdPartyPlanId({}), null);
  assert.equal(resolveThirdPartyPlanId({ tenantStatus: "active" }), null);
  assert.equal(resolveThirdPartyPlanId({
    plan: OFFER_50,
    trafficLimitBytes: 50 * GIB,
    tenantStatus: "expiring"
  }), "monthly_basic");
  assert.equal(resolveThirdPartyPlanId({
    plan: OFFER_50,
    trafficLimitBytes: 50 * GIB,
    lifecycleStatus: "expiring"
  }), "monthly_basic");
  assert.equal(resolveThirdPartyPlanId({
    plan: OFFER_50,
    trafficLimitBytes: 50 * GIB
  }), "monthly_basic");
  for (const status of ["disabled", "expired", "revoked", "unknown"]) {
    assert.equal(resolveThirdPartyPlanId({
      plan: OFFER_50,
      trafficLimitBytes: 50 * GIB,
      tenantStatus: status
    }), null, status);
  }
});

test("binding lookup returns a plan even when trafficLimitBytes is absent", () => {
  const binding = findUsageBindingForTenant({
    findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: null })
  }, "tenant_basic");
  assert.equal(binding.plan, OFFER_50);
  assert.equal(findUsageBindingForTenant({
    findUsageBindingByTenantRef: () => {
      throw new Error("control db down");
    }
  }, "tenant_basic"), null);
});

test("flag-off merge is identity and YAML is byte-identical to current output", () => {
  const original = sampleOwnConfig();
  const merged = applyThirdPartyProxyConfig({
    thirdPartySubscriptions: { enabled: false, available: false, store: null }
  }, {
    proxyConfig: original,
    tenant: { id: "tenant_1", status: "active" }
  });
  assert.equal(merged, original);
  assert.equal(generateClashSubscription(merged), generateClashSubscription(original));
});

function appliedStore() {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  const secretProtector = createPortalTotpSecretProtector({ key: SECRET_KEY });
  const network = { calls: 0 };
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector,
    fetchFn: async () => {
      network.calls += 1;
      throw new Error("network");
    },
    resolveFn: async () => {
      network.calls += 1;
      throw new Error("dns");
    },
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return { database, store, secretProtector, network };
}

async function seededFeature() {
  const { store, network } = appliedStore();
  // enabled true is the caller's explicit publication request.
  // Omitting it leaves the source disabled and the rendered output unchanged.
  const source = store.createInlineSource({
    name: "synthetic-source",
    yamlContent: SS_YAML,
    tiers: ["monthly_basic"],
    enabled: true
  });
  assert.equal(source.enabled, true);
  assert.equal(source.sourceKind, "inline-yaml");
  assert.equal(network.calls, 0);
  return {
    enabled: true,
    available: true,
    store
  };
}

test("inline import stays disabled until an explicit enable changes rendered output", () => {
  const { store, network } = appliedStore();
  const source = store.createInlineSource({
    name: "synthetic-source",
    yamlContent: SS_YAML,
    tiers: ["monthly_basic"]
  });
  assert.equal(source.enabled, false);
  const original = sampleOwnConfig();
  const baseline = generateClashSubscription(original);
  const state = {
    thirdPartySubscriptions: { enabled: true, available: true, store },
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  };
  const render = (proxyConfig) => generateClashSubscription(applyThirdPartyProxyConfig(state, {
    proxyConfig,
    tenant: { id: "tenant_basic", status: "active" }
  }));
  assert.equal(render(original), baseline);
  const published = store.patchSource(source.id, { enabled: true });
  assert.equal(published.enabled, true);
  const yaml = render(original);
  assert.match(yaml, /\[3P\] HK 1 \| HK/);
  assert.match(yaml, /\[3P\] JP 1 \| JP/);
  assert.notEqual(yaml, baseline);
  assert.equal(network.calls, 0);
});

test("vless explicit udp and tls booleans survive import and render", () => {
  const { store } = appliedStore();
  const source = store.createInlineSource({
    name: "synthetic-vless-flags",
    yamlContent: VLESS_BOOL_YAML,
    tiers: ["monthly_basic"]
  });
  store.patchSource(source.id, { enabled: true });
  const byHost = new Map(store.listActiveServersForPlan("monthly_basic").map((node) => [node.host, node]));
  assert.equal(byHost.get("203.0.113.21").udp, true);
  assert.equal(byHost.get("203.0.113.21").tls, true);
  assert.equal(byHost.get("203.0.113.22").udp, false);
  assert.equal(byHost.get("203.0.113.22").tls, false);
  assert.equal(Object.hasOwn(byHost.get("203.0.113.23"), "udp"), false);
  assert.equal(Object.hasOwn(byHost.get("203.0.113.23"), "tls"), false);
  const yaml = generateClashSubscription(applyThirdPartyProxyConfig({
    thirdPartySubscriptions: { enabled: true, available: true, store },
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  }, {
    proxyConfig: sampleOwnConfig(),
    tenant: { id: "tenant_basic", status: "active" }
  }));
  const on = proxyBlockByServer(yaml, "203.0.113.21");
  const off = proxyBlockByServer(yaml, "203.0.113.22");
  const bare = proxyBlockByServer(yaml, "203.0.113.23");
  assert.match(on, /udp: true/);
  assert.match(on, /tls: true/);
  assert.equal(on.includes("udp: false"), false);
  assert.equal(on.includes("tls: false"), false);
  assert.match(off, /udp: false/);
  assert.match(off, /tls: false/);
  assert.equal(off.includes("udp: true"), false);
  assert.equal(off.includes("tls: true"), false);
  assert.match(bare, /udp: false/);
  assert.equal(bare.includes("tls:"), false);
});

test("flag-on adds marked third-party nodes and per-country groups for the matching tier only", async () => {
  const feature = await seededFeature();
  const original = sampleOwnConfig();
  const baseline = generateClashSubscription(original);
  const plusState = {
    thirdPartySubscriptions: feature,
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_100, trafficLimitBytes: 100 * GIB })
      }
    }
  };
  const plusMerged = applyThirdPartyProxyConfig(plusState, {
    proxyConfig: original,
    tenant: { id: "tenant_plus", status: "active" }
  });
  assert.equal(plusMerged, original);
  assert.equal(generateClashSubscription(plusMerged), baseline);

  const basicState = {
    thirdPartySubscriptions: feature,
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  };
  const merged = applyThirdPartyProxyConfig(basicState, {
    proxyConfig: original,
    tenant: { id: "tenant_basic", status: "active" }
  });
  assert.notEqual(merged, original);
  const yaml = generateClashSubscription(merged);
  assert.match(yaml, /name: "\[3P\] HK 1 \| HK"/);
  assert.match(yaml, /name: "\[3P\] JP 1 \| JP"/);
  assert.match(yaml, /name: 3P-HK/);
  assert.match(yaml, /name: 3P-JP/);
  const auto = proxyGroupBlock(yaml, "AUTO");
  const fallback = proxyGroupBlock(yaml, "FALLBACK");
  const stable = proxyGroupBlock(yaml, "STABLE");
  assert.doesNotMatch(auto, /\[3P\]/);
  assert.doesNotMatch(fallback, /\[3P\]/);
  assert.doesNotMatch(stable, /\[3P\]/);
  assert.match(auto, /aws-singapore/);
  assert.match(fallback, /aws-singapore-blue/);
  assert.match(fallback, /aws-singapore-backup/);
  const names = [...yaml.matchAll(/name: "(\[3P\] [^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.includes("aws-singapore-blue"), false);
  assert.match(yaml, /name: GLOBAL[\s\S]*3P-HK[\s\S]*3P-JP/);
  assert.doesNotMatch(yaml, /example\.invalid|third-party-source-secret-path/);
});

test("legacy plans, mismatched traffic, inactive tenant and missing binding receive no third-party nodes", async () => {
  const feature = await seededFeature();
  const original = sampleOwnConfig();
  const baseline = generateClashSubscription(original);
  const cases = [
    { tenant: { id: "t1", status: "active" }, binding: { plan: OFFER_50, trafficLimitBytes: 5 * GIB } },
    { tenant: { id: "t2", status: "disabled" }, binding: { plan: OFFER_50, trafficLimitBytes: 50 * GIB } },
    { tenant: { id: "t3", status: "active" }, binding: null },
    { tenant: { id: "t4", status: "active" }, binding: { plan: "monthly", trafficLimitBytes: 50 * GIB } },
    { tenant: { id: "t5", status: "active" }, binding: { plan: "yearly", trafficLimitBytes: 200 * GIB } },
    { tenant: { id: "t6", status: "active" }, binding: { plan: "trial", trafficLimitBytes: 50 * GIB } },
    { tenant: { id: "t7", status: "active" }, binding: { plan: "pilot" } },
    { tenant: { id: "t8", status: "active" }, binding: { plan: "offerv_unknown", trafficLimitBytes: 50 * GIB } },
    { tenant: { id: "t9", status: "active" }, binding: { plan: OFFER_200, trafficLimitBytes: 50 * GIB } }
  ];
  for (const item of cases) {
    const yaml = generateClashSubscription(applyThirdPartyProxyConfig({
      thirdPartySubscriptions: feature,
      platform: {
        controlStore: {
          findUsageBindingByTenantRef: () => item.binding
        }
      }
    }, { proxyConfig: original, tenant: item.tenant }));
    assert.equal(yaml, baseline);
  }
});

test("flag-off HTTP YAML stays identical and flag-on adds 3P nodes on all four endpoints", async (t) => {
  const feature = await seededFeature();
  const database = new Database(":memory:");
  const store = createSubscriptionRepository({ database });
  const core = createSubscriptionCore({
    store,
    publicSubscriptionBaseUrl: "https://synthetic.invalid",
    proxyConfig: sampleOwnConfig(),
    nowFn: () => new Date("2026-10-09T00:00:00.000Z"),
    idFactory: () => "tenant_active_fixture",
    tokenFactory: () => ({
      rawToken: TOKEN,
      tokenHash: hashSubscriptionToken(TOKEN),
      tokenPrefix: "pgsub_fixture"
    }),
    artifactSecretFactory: () => ARTIFACT,
    artifactIdFactory: () => "artifact_active_1"
  });
  core.createTenant({ displayName: "Synthetic active", expiresAt: "2026-12-01T00:00:00.000Z" });
  core.createSubscriptionArtifact("tenant_active_fixture");
  const controlStore = {
    findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
  };
  const offApp = express();
  offApp.use(subscriptionRoutes({
    subscriptions: { core },
    thirdPartySubscriptions: { enabled: false, available: false, store: null },
    platform: { controlStore }
  }));
  const onApp = express();
  onApp.use(subscriptionRoutes({
    subscriptions: { core },
    thirdPartySubscriptions: feature,
    platform: { controlStore }
  }));
  const off = await listen(offApp);
  const on = await listen(onApp);
  t.after(() => {
    off.server.closeAllConnections();
    off.server.close();
    on.server.closeAllConnections();
    on.server.close();
    database.close();
  });
  const paths = [
    `/sub/clash.yaml?token=${TOKEN}`,
    `/sub/a/${ARTIFACT}`,
    `/sub/a/${ARTIFACT}/profile.yaml`,
    `/sub/a/${ARTIFACT}/provider.yaml`
  ];
  for (const path of paths) {
    const offYaml = await (await fetch(off.baseUrl + path)).text();
    const onYaml = await (await fetch(on.baseUrl + path)).text();
    assert.equal(offYaml.includes("[3P]"), false, path);
    assert.match(onYaml, /\[3P\] HK 1/, path);
    assert.notEqual(onYaml, offYaml, path);
    assert.equal(onYaml.includes("example.invalid"), false);
  }
});

test("third-party display names stay unique against owned node names", async () => {
  const feature = await seededFeature();
  const original = {
    servers: [
      {
        name: "[3P] HK 1 | HK",
        host: "198.51.100.20",
        port: 8388,
        method: "aes-256-gcm",
        password: "owned-secret"
      }
    ]
  };
  const yaml = generateClashSubscription(applyThirdPartyProxyConfig({
    thirdPartySubscriptions: feature,
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  }, { proxyConfig: original, tenant: { id: "t", status: "active" } }));
  const names = [...yaml.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.filter((name) => name.startsWith("[3P] HK 1")).length, 2);
});

test("four YAML routes stop third-party delivery exactly at expiry and resume after renewal", async (t) => {
  const feature = await seededFeature();
  let thirdPartyReads = 0;
  const listActive = feature.store.listActiveServersForPlan;
  feature.store.listActiveServersForPlan = (...args) => {
    thirdPartyReads += 1;
    return listActive(...args);
  };
  const database = new Database(":memory:");
  const store = createSubscriptionRepository({ database });
  let now = new Date("2026-10-09T00:00:00.000Z");
  const core = createSubscriptionCore({
    store,
    publicSubscriptionBaseUrl: "https://synthetic.invalid",
    proxyConfig: sampleOwnConfig(),
    nowFn: () => now,
    idFactory: () => "tenant_expiry_fixture",
    tokenFactory: () => ({
      rawToken: TOKEN,
      tokenHash: hashSubscriptionToken(TOKEN),
      tokenPrefix: "pgsub_fixture"
    }),
    artifactSecretFactory: () => ARTIFACT,
    artifactIdFactory: () => "artifact_expiry_1"
  });
  core.createTenant({ displayName: "Synthetic expiry", expiresAt: "2026-10-09T00:01:00.000Z" });
  core.createSubscriptionArtifact("tenant_expiry_fixture");
  const app = express();
  app.use(subscriptionRoutes({
    subscriptions: { core },
    thirdPartySubscriptions: feature,
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  }));
  const { server, baseUrl } = await listen(app);
  t.after(() => {
    server.closeAllConnections();
    server.close();
    database.close();
  });
  const paths = [
    `/sub/clash.yaml?token=${TOKEN}`,
    `/sub/a/${ARTIFACT}`,
    `/sub/a/${ARTIFACT}/profile.yaml`,
    `/sub/a/${ARTIFACT}/provider.yaml`
  ];
  now = new Date("2026-10-09T00:00:59.999Z");
  for (const path of paths) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /\[3P\] HK 1/);
  }
  const readsBeforeExpiry = thirdPartyReads;
  assert.ok(readsBeforeExpiry >= paths.length);
  for (const at of ["2026-10-09T00:01:00.000Z", "2026-10-09T00:01:00.001Z"]) {
    now = new Date(at);
    for (const path of paths) {
      const response = await fetch(baseUrl + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("x-subscription-status"), "expired");
      const yaml = await response.text();
      assert.doesNotMatch(yaml, /\[3P\]|3P-HK|synthetic-password|password:|uuid:|server:/);
      assert.equal(yaml, generateSubscriptionExpiryNotice({ providerOnly: path.endsWith("/provider.yaml") }));
    }
  }
  assert.equal(thirdPartyReads, readsBeforeExpiry, "expired routes must not read third-party credentials");
  core.renewTenant("tenant_expiry_fixture", { expiresAt: "2026-11-09T00:00:00.000Z" });
  for (const path of paths) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-subscription-status"), null);
    assert.match(await response.text(), /\[3P\] HK 1/);
  }
  assert.ok(thirdPartyReads > readsBeforeExpiry);
});

test("tier resolution ignores inherited object keys as plan refs", () => {
  for (const plan of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(resolveThirdPartyPlanId({ plan, tenantStatus: "active" }), null, plan);
  }
});

test("expiring subscribers receive third-party nodes and closed statuses do not", async () => {
  const feature = await seededFeature();
  const original = sampleOwnConfig();
  const baseline = generateClashSubscription(original);
  const state = {
    thirdPartySubscriptions: feature,
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  };
  const expiring = generateClashSubscription(applyThirdPartyProxyConfig(state, {
    proxyConfig: original,
    tenant: { id: "tenant_expiring", status: "expiring" }
  }));
  assert.match(expiring, /\[3P\] HK 1/);
  assert.match(expiring, /\[3P\] JP 1/);
  for (const status of ["expired", "disabled", "revoked", "unknown", ""]) {
    const yaml = generateClashSubscription(applyThirdPartyProxyConfig(state, {
      proxyConfig: original,
      tenant: { id: "tenant_closed", status }
    }));
    assert.equal(yaml, baseline, status || "blank");
  }
  const missing = generateClashSubscription(applyThirdPartyProxyConfig(state, {
    proxyConfig: original,
    tenant: { id: "tenant_missing" }
  }));
  assert.equal(missing, baseline);
});

test("hy2 dedup key stays internal from inline import through store to render", async () => {
  const { database, store, secretProtector, network } = appliedStore();
  const source = store.createInlineSource({
    name: "synthetic-hy2-source",
    yamlContent: HY2_YAML,
    tiers: ["monthly_basic"],
    enabled: true
  });
  const afterSecond = database.prepare(
    "select id, fingerprint, protected_config, active from platform_third_party_nodes where source_id = ?"
  ).all(source.id);
  assert.equal(afterSecond.length, 1);
  assert.equal(afterSecond[0].active, 1);
  const beforeRefresh = afterSecond.map((row) => ({ ...row }));
  await assert.rejects(
    () => store.refreshSource(source.id),
    (error) => error?.code === "remote_refresh_disabled"
  );
  assert.deepEqual(database.prepare(
    "select id, fingerprint, protected_config, active from platform_third_party_nodes where source_id = ?"
  ).all(source.id), beforeRefresh);
  assert.equal(network.calls, 0);
  const dedup = afterSecond[0].fingerprint;
  const stored = JSON.parse(secretProtector.unprotect(afterSecond[0].protected_config));
  assert.equal(stored.dedupKey, dedup);
  assert.equal(Object.hasOwn(stored, "fingerprint"), false);

  const state = {
    thirdPartySubscriptions: { enabled: true, available: true, store },
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ plan: OFFER_50, trafficLimitBytes: 50 * GIB })
      }
    }
  };
  const renderYaml = (tenantStatus) => generateClashSubscription(applyThirdPartyProxyConfig(state, {
    proxyConfig: sampleOwnConfig(),
    tenant: { id: "tenant_hy2", status: tenantStatus }
  }));
  const freshYaml = renderYaml("active");
  assert.match(freshYaml, /type: hysteria2/);
  assert.match(freshYaml, /\[3P\] SG 1/);
  assert.doesNotMatch(freshYaml, /fingerprint:/);
  assert.equal(freshYaml.includes(dedup), false);
  const delivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].id, afterSecond[0].id);
  assert.equal(Object.hasOwn(delivered[0], "fingerprint"), false);
  assert.equal(Object.hasOwn(delivered[0], "dedupKey"), false);

  const legacy = { ...stored, fingerprint: dedup };
  delete legacy.dedupKey;
  database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?")
    .run(secretProtector.protect(JSON.stringify(legacy)), afterSecond[0].id);
  const legacyYaml = renderYaml("expiring");
  assert.match(legacyYaml, /type: hysteria2/);
  assert.match(legacyYaml, /\[3P\] SG 1/);
  assert.doesNotMatch(legacyYaml, /fingerprint:/);
  assert.equal(legacyYaml.includes(dedup), false);
  const legacyDelivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(legacyDelivered[0].id, afterSecond[0].id);
  assert.equal(Object.hasOwn(legacyDelivered[0], "fingerprint"), false);

  const pinned = { ...stored, fingerprint: "synthetic-cert-pin" };
  delete pinned.dedupKey;
  database.prepare("update platform_third_party_nodes set protected_config = ? where id = ?")
    .run(secretProtector.protect(JSON.stringify(pinned)), afterSecond[0].id);
  const pinnedYaml = renderYaml("active");
  assert.match(pinnedYaml, /fingerprint: "synthetic-cert-pin"/);
  assert.equal(pinnedYaml.includes(dedup), false);
  const pinnedDelivered = store.listActiveServersForPlan("monthly_basic");
  assert.equal(pinnedDelivered[0].id, afterSecond[0].id);
  assert.equal(pinnedDelivered[0].fingerprint, "synthetic-cert-pin");
  assert.equal(Object.hasOwn(pinnedDelivered[0], "dedupKey"), false);
});
