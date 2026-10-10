import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { generateClashSubscription } from "../services/clash-subscription.mjs";
import { applyThirdPartyProxyConfig } from "../services/platform/third-party-subscription-render.mjs";
import { resolveThirdPartyPlanId } from "../services/platform/third-party-subscription-tier.mjs";
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
const SECRET_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SOURCE_URL = "https://example.invalid/third-party-source-secret-path";
const TOKEN = "pgsub_third_party_synthetic_only";
const ARTIFACT = "third_party_artifact_synthetic_only";
const SS_HK = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.10:8388#HK";
const SS_JP = "ss://YWVzLTI1Ni1nY206c3ludGhldGljLXBhc3N3b3Jk@203.0.113.11:8388#JP";

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

test("tier resolution maps 50/100/200 GiB and fails closed otherwise", () => {
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 50 * GIB, tenantStatus: "active" }), "monthly_basic");
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 100 * GIB, tenantStatus: "active" }), "monthly_plus");
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 200 * GIB, tenantStatus: "active" }), "yearly");
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 5 * GIB, tenantStatus: "active" }), null);
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 50 * GIB, tenantStatus: "disabled" }), null);
  assert.equal(resolveThirdPartyPlanId({ trafficLimitBytes: 50 * GIB }), "monthly_basic");
  assert.equal(resolveThirdPartyPlanId({}), null);
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

function appliedStore(fetchBody) {
  const database = new Database(":memory:");
  applyThirdPartySubscriptionMigrations({
    database,
    expectedMigrationId: REQUIRED_THIRD_PARTY_SUBSCRIPTION_MIGRATION_ID,
    expectedDdlChecksum: REQUIRED_THIRD_PARTY_SUBSCRIPTION_DDL_CHECKSUM,
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  const store = createSqliteThirdPartySubscriptionStore({
    database,
    secretProtector: createPortalTotpSecretProtector({ key: SECRET_KEY }),
    fetchFn: async () => ({
      status: 200,
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(fetchBody));
          controller.close();
        }
      })
    }),
    resolveFn: async () => ["203.0.113.8"],
    nowFn: () => new Date("2026-10-10T00:00:00.000Z")
  });
  return { database, store };
}

async function seededFeature() {
  const { store } = appliedStore([SS_HK, SS_JP].join("\n"));
  const source = store.createSource({
    name: "synthetic-source",
    subscriptionUrl: SOURCE_URL,
    tiers: ["monthly_basic"]
  });
  await store.refreshSource(source.id);
  return {
    enabled: true,
    available: true,
    store
  };
}

test("flag-on adds marked third-party nodes and per-country groups for the matching tier only", async () => {
  const feature = await seededFeature();
  const original = sampleOwnConfig();
  const baseline = generateClashSubscription(original);
  const plusState = {
    thirdPartySubscriptions: feature,
    platform: {
      controlStore: {
        findUsageBindingByTenantRef: () => ({ trafficLimitBytes: 100 * GIB })
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
        findUsageBindingByTenantRef: () => ({ trafficLimitBytes: 50 * GIB })
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

test("unknown traffic, inactive tenant and missing binding receive no third-party nodes", async () => {
  const feature = await seededFeature();
  const original = sampleOwnConfig();
  const baseline = generateClashSubscription(original);
  const cases = [
    { tenant: { id: "t1", status: "active" }, binding: { trafficLimitBytes: 5 * GIB } },
    { tenant: { id: "t2", status: "disabled" }, binding: { trafficLimitBytes: 50 * GIB } },
    { tenant: { id: "t3", status: "active" }, binding: null }
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
    findUsageBindingByTenantRef: () => ({ trafficLimitBytes: 50 * GIB })
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
        findUsageBindingByTenantRef: () => ({ trafficLimitBytes: 50 * GIB })
      }
    }
  }, { proxyConfig: original, tenant: { id: "t", status: "active" } }));
  const names = [...yaml.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.filter((name) => name.startsWith("[3P] HK 1")).length, 2);
});

test("expired subscriber YAML is the expiry notice and contains no third-party nodes", async (t) => {
  const feature = await seededFeature();
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
        findUsageBindingByTenantRef: () => ({ trafficLimitBytes: 50 * GIB })
      }
    }
  }));
  const { server, baseUrl } = await listen(app);
  t.after(() => {
    server.closeAllConnections();
    server.close();
    database.close();
  });
  now = new Date("2026-10-09T00:01:00.000Z");
  const response = await fetch(`${baseUrl}/sub/clash.yaml?token=${TOKEN}`);
  assert.equal(response.status, 200);
  const yaml = await response.text();
  assert.match(yaml, /当前订阅已过期/);
  assert.doesNotMatch(yaml, /\[3P\]|3P-HK|synthetic-password/);
  assert.equal(yaml, generateSubscriptionExpiryNotice());
});
