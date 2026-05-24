import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import {
  SUBSCRIPTION_STORE_METHODS,
  assertSubscriptionStore
} from "../services/subscriptions/store-contract.mjs";
import {
  createSqliteSubscriptionStore,
  createSubscriptionRepository
} from "../services/subscriptions/repository.mjs";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";
import { createPlatformSubscriptionIntegration } from "../services/subscriptions/platform-integration.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { listen } from "./helpers/listen.mjs";

const RAW_TOKEN = "pgsub_contract_visible_token";

function sampleProxyConfig() {
  return {
    servers: [
      {
        id: "node_sg",
        name: "aws-singapore",
        region: "Singapore",
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "shared-secret"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function tokenFactory() {
  return {
    rawToken: RAW_TOKEN,
    tokenHash: hashSubscriptionToken(RAW_TOKEN),
    tokenPrefix: RAW_TOKEN.slice(0, 14)
  };
}

function fakeState(service) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: sampleProxyConfig(),
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    subscriptions: { core: service },
    platformIntegration: {
      renewSubscription: () => {
        throw new Error("platform unavailable");
      }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("subscription service compatibility export points to the core contract", () => {
  assert.equal(createSubscriptionService, createSubscriptionCore);
});

test("store contract lists and validates the persistence methods required by the core", () => {
  assert.deepEqual(SUBSCRIPTION_STORE_METHODS, [
    "listTenants",
    "getTenant",
    "findTenantByTokenHash",
    "createTenant",
    "renewTenant",
    "setTenantNode",
    "setTenantStatus",
    "resetTenantToken",
    "markLastUsed",
    "createTempLink",
    "findTempLinkByTokenHash",
    "markTempLinkUsed",
    "createArtifact",
    "listArtifactsByTenant",
    "findArtifactBySecretHash",
    "markArtifactRefreshed",
    "revokeArtifact",
    "rotateArtifact"
  ]);

  assert.throws(
    () => assertSubscriptionStore({ listTenants: () => [] }),
    /SubscriptionStore is missing method getTenant/
  );
});

test("sqlite store adapter keeps the existing repository factory as a compatibility alias", () => {
  assert.equal(createSubscriptionRepository, createSqliteSubscriptionStore);
});

test("subscription core exposes listNodes as the stable node-list contract", () => {
  const store = Object.fromEntries(SUBSCRIPTION_STORE_METHODS.map((method) => [method, () => {
    if (method === "listTenants") return [];
    return null;
  }]));
  const core = createSubscriptionCore({
    store,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.com"
  });

  assert.equal(typeof core.listNodes, "function");
  assert.deepEqual(core.listNodes(), [{
    id: "node_sg",
    name: "aws-singapore",
    region: "Singapore",
    host: "203.0.113.10",
    port: 18388,
    method: "aes-256-gcm",
    credentialMode: "shared-node",
    status: "online"
  }]);
});

test("platform integration delegates business operations to the subscription core", () => {
  const calls = [];
  const integration = createPlatformSubscriptionIntegration({
    core: {
      createTenant: (input) => {
        calls.push(["createTenant", input]);
        return { tenant: { id: "tenant_1" }, subscriptionUrl: "visible-once" };
      },
      renewTenant: (id, input) => {
        calls.push(["renewTenant", id, input]);
        return { id, expiresAt: input.expiresAt };
      },
      disableTenant: (id) => {
        calls.push(["disableTenant", id]);
        return { id, status: "disabled" };
      },
      getTenant: (id) => {
        calls.push(["getTenant", id]);
        return { id, status: "active" };
      }
    }
  });

  assert.equal(integration.openSubscription({
    displayName: "customer-a",
    expiresAt: "2026-06-21T00:00:00.000Z"
  }).subscriptionUrl, "visible-once");
  assert.equal(integration.renewSubscription("tenant_1", {
    expiresAt: "2026-07-21T00:00:00.000Z"
  }).expiresAt, "2026-07-21T00:00:00.000Z");
  assert.equal(integration.disableSubscription("tenant_1").status, "disabled");
  assert.equal(integration.getSubscription("tenant_1").status, "active");
  assert.deepEqual(calls.map(([name]) => name), [
    "createTenant",
    "renewTenant",
    "disableTenant",
    "getTenant"
  ]);
});

test("http subscription routes do not import sqlite or repository adapters directly", () => {
  const adminRoute = readFileSync(new URL("../routes/admin-subscriptions.mjs", import.meta.url), "utf8");
  const publicRoute = readFileSync(new URL("../routes/subscription.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(adminRoute, /better-sqlite3|repository\.mjs|createSubscriptionRepository/);
  assert.doesNotMatch(publicRoute, /better-sqlite3|repository\.mjs|createSubscriptionRepository/);
});

test("public subscription refresh stays independent from platform integration failures", async () => {
  const database = new Database(":memory:");
  const store = createSqliteSubscriptionStore({ database });
  const core = createSubscriptionCore({
    store,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.com",
    nowFn: () => new Date("2026-05-21T00:00:00.000Z"),
    tokenFactory,
    idFactory: () => "tenant_contract_1"
  });
  core.createTenant({
    displayName: "Customer A",
    expiresAt: "2026-06-21T00:00:00.000Z"
  });

  const { server, baseUrl } = await listen(createApp(fakeState(core)));
  try {
    const response = await fetch(`${baseUrl}/sub/clash.yaml?token=${RAW_TOKEN}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /name: "aws-singapore"/);
  } finally {
    server.close();
    store.close();
    database.close();
  }
});
