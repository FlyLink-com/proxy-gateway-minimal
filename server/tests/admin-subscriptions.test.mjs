import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp } from "../app.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { listen } from "./helpers/listen.mjs";

const RAW_TOKEN = "pgsub_route_visible_token";

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
      },
      {
        id: "node_tokyo",
        name: "aws-tokyo",
        host: "203.0.113.11",
        port: 18389,
        method: "aes-256-gcm",
        password: "other-secret"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fakeService() {
  const tenant = {
    id: "tenant_1",
    displayName: "Customer A",
    status: "active",
    expiresAt: "2026-06-21T00:00:00.000Z"
  };
  const renewed = { ...tenant, expiresAt: "2026-07-21T00:00:00.000Z" };
  const disabled = { ...tenant, status: "disabled" };

  return {
    createTenant: (body) => ({
      tenant,
      subscriptionUrl: `https://gateway.example.com/sub/clash.yaml?token=${body.displayName}`
    }),
    listTenants: () => [tenant],
    getTenant: (id) => ({ ...tenant, id }),
    renewTenant: (id, body) => ({ ...renewed, id, note: body.note ?? "" }),
    disableTenant: (id) => ({ ...disabled, id }),
    enableTenant: (id) => ({ ...tenant, id }),
    resetToken: (id) => ({
      tenant: { ...tenant, id, tokenPrefix: "pgsub_new_tok" },
      subscriptionUrl: "https://gateway.example.com/sub/clash.yaml?token=pgsub_new_token"
    }),
    createTempLink: (id) => ({
      id: "temp_1",
      tenant: { ...tenant, id },
      tokenPrefix: "pgtmp_route_",
      expiresAt: "2026-05-23T00:00:00.000Z",
      usedAt: null,
      createdAt: "2026-05-22T00:00:00.000Z",
      subscriptionUrl: "https://gateway.example.com/sub/clash.yaml?token=pgtmp_route_token"
    }),
    nodes: () => [{ id: "node_sg", name: "aws-singapore", status: "online" }],
    overview: () => ({ ok: true, counts: { total: 1, active: 1, expiring: 0, disabledOrExpired: 0 } })
  };
}

function fakeState(service = fakeService()) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    subscriptions: { service },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

function realSubscriptionContext() {
  const database = new Database(":memory:");
  const repository = createSubscriptionRepository({ database });
  const proxyConfig = sampleProxyConfig();
  const service = createSubscriptionService({
    repository,
    proxyConfig,
    publicSubscriptionBaseUrl: "https://gateway.example.com",
    nowFn: () => new Date("2026-05-21T00:00:00.000Z"),
    tokenFactory: () => ({
      rawToken: RAW_TOKEN,
      tokenHash: hashSubscriptionToken(RAW_TOKEN),
      tokenPrefix: RAW_TOKEN.slice(0, 14)
    }),
    idFactory: () => "tenant_real_1"
  });

  return {
    service,
    proxyConfig,
    close: () => {
      repository.close();
      database.close();
    }
  };
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}?token=secret`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const isJson = response.headers.get("content-type")?.includes("application/json");

  return {
    response,
    body: text && isJson ? JSON.parse(text) : text
  };
}

test("admin subscription routes create, list, read, mutate, and reset tokens", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions", {
      method: "POST",
      body: { displayName: "Customer A", expiresAt: "2026-06-21T00:00:00.000Z" }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.tenant.id, "tenant_1");
    assert.match(created.body.subscriptionUrl, /token=Customer A$/);

    const listed = await requestJson(baseUrl, "/api/admin/subscriptions");
    assert.equal(listed.response.status, 200);
    assert.deepEqual(listed.body.items, [{
      id: "tenant_1",
      displayName: "Customer A",
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z"
    }]);

    const read = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1");
    assert.equal(read.response.status, 200);
    assert.equal(read.body.tenant.id, "tenant_1");

    const patched = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1", {
      method: "PATCH",
      body: { expiresAt: "2026-07-21T00:00:00.000Z", note: "renewed" }
    });
    assert.equal(patched.response.status, 200);
    assert.equal(patched.body.tenant.expiresAt, "2026-07-21T00:00:00.000Z");
    assert.equal(patched.body.tenant.note, "renewed");

    const renewed = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/renew", {
      method: "POST",
      body: { expiresAt: "2026-07-21T00:00:00.000Z" }
    });
    assert.equal(renewed.response.status, 200);
    assert.equal(renewed.body.tenant.expiresAt, "2026-07-21T00:00:00.000Z");

    const disabled = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/disable", { method: "POST" });
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.body.tenant.status, "disabled");

    const enabled = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/enable", { method: "POST" });
    assert.equal(enabled.response.status, 200);
    assert.equal(enabled.body.tenant.status, "active");

    const reset = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/reset-token", { method: "POST" });
    assert.equal(reset.response.status, 200);
    assert.equal(reset.body.tenant.tokenPrefix, "pgsub_new_tok");
    assert.match(reset.body.subscriptionUrl, /token=pgsub_new_token$/);
  } finally {
    server.close();
  }
});

test("admin subscription routes map validation and missing tenant errors", async () => {
  const service = {
    ...fakeService(),
    createTenant: () => {
      throw serviceError("validation_error", "displayName is required");
    },
    getTenant: () => {
      throw serviceError("not_found", "Subscription tenant not found: missing");
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState(service)));
  try {
    const invalid = await requestJson(baseUrl, "/api/admin/subscriptions", {
      method: "POST",
      body: { displayName: "" }
    });
    assert.equal(invalid.response.status, 400);
    assert.deepEqual(invalid.body, { error: "validation_error", message: "displayName is required" });

    const missing = await requestJson(baseUrl, "/api/admin/subscriptions/missing");
    assert.equal(missing.response.status, 404);
    assert.deepEqual(missing.body, {
      error: "not_found",
      message: "Subscription tenant not found: missing"
    });
  } finally {
    server.close();
  }
});

test("admin route creates temporary subscription links", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/temp-link", {
      method: "POST"
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.body.id, "temp_1");
    assert.equal(created.body.tenant.id, "tenant_1");
    assert.equal(
      created.body.subscriptionUrl,
      "https://gateway.example.com/sub/clash.yaml?token=pgtmp_route_token"
    );
    assert.doesNotMatch(JSON.stringify(created.body), /tokenHash/);
  } finally {
    server.close();
  }
});

test("admin subscription nodes and overview return service outputs", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const nodes = await requestJson(baseUrl, "/api/admin/nodes");
    assert.equal(nodes.response.status, 200);
    assert.deepEqual(nodes.body, { items: [{ id: "node_sg", name: "aws-singapore", status: "online" }] });

    const overview = await requestJson(baseUrl, "/api/admin/overview");
    assert.equal(overview.response.status, 200);
    assert.deepEqual(overview.body, {
      ok: true,
      counts: { total: 1, active: 1, expiring: 0, disabledOrExpired: 0 }
    });
  } finally {
    server.close();
  }
});

test("tenant subscription token fetches scoped Clash YAML and disabled tenants are rejected", async () => {
  const context = realSubscriptionContext();
  const { server, baseUrl } = await listen(createApp(fakeState(context.service)));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions", {
      method: "POST",
      body: { displayName: "Customer A", expiresAt: "2026-06-21T00:00:00.000Z" }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.subscriptionUrl, `https://gateway.example.com/sub/clash.yaml?token=${RAW_TOKEN}`);

    const subscription = await fetch(`${baseUrl}/sub/clash.yaml?token=${RAW_TOKEN}`);
    assert.equal(subscription.status, 200);
    assert.match(subscription.headers.get("content-type"), /application\/x-yaml/);
    const yaml = await subscription.text();
    assert.match(yaml, /name: "aws-singapore"/);
    assert.match(yaml, /password: "shared-secret"/);
    assert.doesNotMatch(yaml, /aws-tokyo|other-secret/);

    const disabled = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/disable", { method: "POST" });
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.body.tenant.status, "disabled");

    const blocked = await fetch(`${baseUrl}/sub/clash.yaml?token=${RAW_TOKEN}`);
    assert.equal(blocked.status, 403);
    assert.deepEqual(await blocked.json(), { error: "Subscription disabled" });
  } finally {
    server.close();
    context.close();
  }
});
