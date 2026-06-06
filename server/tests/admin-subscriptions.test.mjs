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
    createSubscriptionArtifact: (id) => ({
      artifact: {
        id: "artifact_1",
        tenantId: id,
        artifactPrefix: "opaque_pref",
        status: "active",
        refreshCount: 0,
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z"
      },
      subscriptionUrl: "https://gateway.example.com/sub/a/opaque_route_secret.yaml"
    }),
    listSubscriptionArtifacts: (id) => [{
      id: "artifact_1",
      tenantId: id,
      artifactPrefix: "opaque_pref",
      status: "active",
      refreshCount: 0,
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z"
    }],
    revokeSubscriptionArtifact: (id) => ({
      id,
      tenantId: "tenant_1",
      artifactPrefix: "opaque_pref",
      status: "revoked"
    }),
    rotateSubscriptionArtifact: (id) => ({
      previous: {
        id,
        tenantId: "tenant_1",
        artifactPrefix: "opaque_pref",
        status: "rotated"
      },
      replacement: {
        id: "artifact_2",
        tenantId: "tenant_1",
        artifactPrefix: "opaque_next",
        status: "active"
      },
      subscriptionUrl: "https://gateway.example.com/sub/a/opaque_next_secret.yaml"
    }),
    setTenantNode: (id, body) => ({ ...tenant, id, nodeName: body.nodeId }),
    listNodes: () => [{ id: "node_sg", name: "aws-singapore", status: "online" }],
    nodes: () => [{ id: "node_sg", name: "aws-singapore", status: "online" }],
    overview: () => ({
      ok: true,
      total: 1,
      active: 1,
      expiring: 0,
      disabled: 0,
      expired: 0,
      counts: { total: 1, active: 1, expiring: 0, disabledOrExpired: 0 }
    })
  };
}

function fakeState(service = fakeService(), subscriptionKey = "service") {
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
    subscriptions: { [subscriptionKey]: service },
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
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      authorization: "Bearer secret",
      ...(options.headers ?? {})
    },
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

    const reassigned = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/node", {
      method: "POST",
      body: { nodeId: "prod-edge-b" }
    });
    assert.equal(reassigned.response.status, 200);
    assert.equal(reassigned.body.tenant.nodeName, "prod-edge-b");
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

test("admin subscription routes do not echo internal error messages", async () => {
  const service = {
    ...fakeService(),
    listTenants: () => {
      throw new Error(
        "database failed while handling https://gateway.example.com/sub/clash.yaml?token=pgsub_sensitive password=secret"
      );
    }
  };
  const { server, baseUrl } = await listen(createApp(fakeState(service)));
  try {
    const failed = await requestJson(baseUrl, "/api/admin/subscriptions");

    assert.equal(failed.response.status, 500);
    assert.deepEqual(failed.body, { error: "internal_error" });
    assert.doesNotMatch(JSON.stringify(failed.body), /pgsub_sensitive|password=secret|gateway\.example/);
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

test("admin route manages opaque subscription artifacts without exposing raw secrets in summaries", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/artifacts", {
      method: "POST"
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.artifact.id, "artifact_1");
    assert.equal(created.body.subscriptionUrl, "https://gateway.example.com/sub/a/opaque_route_secret.yaml");
    assert.equal(Object.hasOwn(created.body.artifact, "artifactHash"), false);

    const listed = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_1/artifacts");
    assert.equal(listed.response.status, 200);
    assert.deepEqual(listed.body.items, [{
      id: "artifact_1",
      tenantId: "tenant_1",
      artifactPrefix: "opaque_pref",
      status: "active",
      refreshCount: 0,
      createdAt: "2026-05-22T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z"
    }]);
    assert.doesNotMatch(JSON.stringify(listed.body), /opaque_route_secret|artifactHash/);

    const revoked = await requestJson(baseUrl, "/api/admin/subscription-artifacts/artifact_1/revoke", {
      method: "POST"
    });
    assert.equal(revoked.response.status, 200);
    assert.equal(revoked.body.artifact.status, "revoked");

    const rotated = await requestJson(baseUrl, "/api/admin/subscription-artifacts/artifact_1/rotate", {
      method: "POST"
    });
    assert.equal(rotated.response.status, 201);
    assert.equal(rotated.body.previous.status, "rotated");
    assert.equal(rotated.body.replacement.status, "active");
    assert.equal(rotated.body.subscriptionUrl, "https://gateway.example.com/sub/a/opaque_next_secret.yaml");
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
      total: 1,
      active: 1,
      expiring: 0,
      disabled: 0,
      expired: 0,
      counts: { total: 1, active: 1, expiring: 0, disabledOrExpired: 0 }
    });
  } finally {
    server.close();
  }
});

test("admin subscription routes work when runtime exposes only subscription core", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState(fakeService(), "core")));
  try {
    const listed = await requestJson(baseUrl, "/api/admin/subscriptions");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.items[0].id, "tenant_1");

    const nodes = await requestJson(baseUrl, "/api/admin/nodes");
    assert.equal(nodes.response.status, 200);
    assert.deepEqual(nodes.body, { items: [{ id: "node_sg", name: "aws-singapore", status: "online" }] });
  } finally {
    server.close();
  }
});

test("tenant subscription token fetches V2 Clash YAML and disabled tenants are rejected", async () => {
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
    assert.equal(
      subscription.headers.get("subscription-userinfo"),
      `upload=0; download=0; total=0; expire=${Math.floor(Date.parse("2026-06-21T00:00:00.000Z") / 1000)}`
    );
    assert.equal(subscription.headers.get("x-subscription-expires-at"), "2026-06-21T00:00:00.000Z");
    assert.equal(subscription.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
    const yaml = await subscription.text();
    assert.match(yaml, /^# globalcircle-subscription-status: "active"/);
    assert.match(yaml, /# globalcircle-subscription-expires-at: "2026-06-21T00:00:00.000Z"/);
    assert.match(yaml, /name: "aws-singapore"/);
    assert.match(yaml, /password: "shared-secret"/);
    assert.match(yaml, /name: "aws-tokyo"/);
    assert.match(yaml, /password: "other-secret"/);

    const reassigned = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/node", {
      method: "POST",
      body: { nodeId: "node_tokyo" }
    });
    assert.equal(reassigned.response.status, 200);
    assert.equal(reassigned.body.tenant.nodeName, "aws-tokyo");

    const canarySubscription = await fetch(`${baseUrl}/sub/clash.yaml?token=${RAW_TOKEN}`);
    assert.equal(canarySubscription.status, 200);
    const canaryYaml = await canarySubscription.text();
    assert.match(canaryYaml, /name: "aws-tokyo"/);
    assert.match(canaryYaml, /password: "other-secret"/);
    assert.doesNotMatch(canaryYaml, /aws-singapore|shared-secret/);

    const missingNode = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/node", {
      method: "POST",
      body: {}
    });
    assert.equal(missingNode.response.status, 400);
    assert.deepEqual(missingNode.body, { error: "validation_error", message: "nodeId is required" });

    const blankNode = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/node", {
      method: "POST",
      body: { nodeId: "   " }
    });
    assert.equal(blankNode.response.status, 400);
    assert.deepEqual(blankNode.body, { error: "validation_error", message: "nodeId is required" });

    const afterInvalidReassign = await fetch(`${baseUrl}/sub/clash.yaml?token=${RAW_TOKEN}`);
    assert.equal(afterInvalidReassign.status, 200);
    const afterInvalidYaml = await afterInvalidReassign.text();
    assert.match(afterInvalidYaml, /name: "aws-tokyo"/);
    assert.doesNotMatch(afterInvalidYaml, /aws-singapore|shared-secret/);

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

test("opaque artifact route refreshes V2 Clash YAML without accepting query-token fallback", async () => {
  const context = realSubscriptionContext();
  const { server, baseUrl } = await listen(createApp(fakeState(context.service)));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions", {
      method: "POST",
      body: { displayName: "Customer A", expiresAt: "2026-06-21T00:00:00.000Z" }
    });
    assert.equal(created.response.status, 201);

    const artifact = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/artifacts", {
      method: "POST"
    });
    assert.equal(artifact.response.status, 201);
    const artifactPath = new URL(artifact.body.subscriptionUrl).pathname;

    const subscription = await fetch(`${baseUrl}${artifactPath}`);
    assert.equal(subscription.status, 200);
    assert.equal(subscription.headers.get("x-subscription-expires-at"), "2026-06-21T00:00:00.000Z");
    const yaml = await subscription.text();
    assert.match(yaml, /^# globalcircle-subscription-status: "active"/);
    assert.match(yaml, /# globalcircle-subscription-expires-at: "2026-06-21T00:00:00.000Z"/);
    assert.match(yaml, /name: "aws-singapore"/);
    assert.match(yaml, /name: "aws-tokyo"/);
    assert.doesNotMatch(yaml, /tenant_real_1|pgsub_route_visible/);

    const fallback = await fetch(`${baseUrl}/sub/a/missing-artifact.yaml?token=${RAW_TOKEN}`);
    assert.equal(fallback.status, 404);
    assert.deepEqual(await fallback.json(), { error: "Not found" });

    const blank = await fetch(`${baseUrl}/sub/a/.yaml`);
    assert.equal(blank.status, 404);
    assert.deepEqual(await blank.json(), { error: "Not found" });

    const whitespace = await fetch(`${baseUrl}/sub/a/%20.yaml`);
    assert.equal(whitespace.status, 404);
    assert.deepEqual(await whitespace.json(), { error: "Not found" });
  } finally {
    server.close();
    context.close();
  }
});

test("opaque artifact provider-mode routes split profile and provider YAML", async () => {
  const context = realSubscriptionContext();
  const { server, baseUrl } = await listen(createApp(fakeState(context.service)));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions", {
      method: "POST",
      body: { displayName: "Customer A", expiresAt: "2026-06-21T00:00:00.000Z" }
    });
    assert.equal(created.response.status, 201);

    const artifact = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/artifacts", {
      method: "POST"
    });
    assert.equal(artifact.response.status, 201);

    const artifactPath = new URL(artifact.body.subscriptionUrl).pathname.replace(/\.yaml$/i, "");
    const profile = await fetch(`${baseUrl}${artifactPath}/profile.yaml`);
    assert.equal(profile.status, 200);
    assert.match(profile.headers.get("content-type"), /application\/x-yaml/);
    assert.equal(profile.headers.get("x-subscription-expires-at"), "2026-06-21T00:00:00.000Z");
    const profileYaml = await profile.text();
    assert.match(profileYaml, /^# globalcircle-subscription-status: "active"/);
    assert.match(profileYaml, /# globalcircle-subscription-expires-at: "2026-06-21T00:00:00.000Z"/);
    assert.match(profileYaml, /proxy-providers:\n  "globalcircle-pool":\n    type: http/);
    assert.match(profileYaml, new RegExp(`url: "${baseUrl.replace(/\./g, "\\.")}${artifactPath}/provider\\.yaml"`));
    assert.match(profileYaml, /use:\n      - "globalcircle-pool"/);
    assert.doesNotMatch(profileYaml, /shared-secret|other-secret|pgsub_route_visible|tenant_real_1/);

    const provider = await fetch(`${baseUrl}${artifactPath}/provider.yaml`);
    assert.equal(provider.status, 200);
    assert.match(provider.headers.get("content-type"), /application\/x-yaml/);
    assert.equal(provider.headers.get("x-subscription-expires-at"), "2026-06-21T00:00:00.000Z");
    const providerYaml = await provider.text();
    assert.match(providerYaml, /^# globalcircle-subscription-status: "active"/);
    assert.match(providerYaml, /# globalcircle-subscription-expires-at: "2026-06-21T00:00:00.000Z"/);
    assert.match(providerYaml, /proxies:/);
    assert.match(providerYaml, /name: "aws-singapore"/);
    assert.match(providerYaml, /password: "shared-secret"/);
    assert.match(providerYaml, /name: "aws-tokyo"/);
    assert.match(providerYaml, /password: "other-secret"/);
    assert.doesNotMatch(providerYaml, /tenant_real_1|pgsub_route_visible/);

    const missing = await fetch(`${baseUrl}/sub/a/missing-artifact/provider.yaml?token=${RAW_TOKEN}`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Not found" });
  } finally {
    server.close();
    context.close();
  }
});

test("opaque artifact provider profile uses configured public subscription base URL", async () => {
  const context = realSubscriptionContext();
  const state = fakeState(context.service);
  state.subscriptions.publicSubscriptionBaseUrl = "https://configured.example.com";
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const created = await requestJson(baseUrl, "/api/admin/subscriptions", {
      method: "POST",
      body: { displayName: "Customer A", expiresAt: "2026-06-21T00:00:00.000Z" }
    });
    assert.equal(created.response.status, 201);

    const artifact = await requestJson(baseUrl, "/api/admin/subscriptions/tenant_real_1/artifacts", {
      method: "POST"
    });
    assert.equal(artifact.response.status, 201);

    const artifactPath = new URL(artifact.body.subscriptionUrl).pathname.replace(/\.yaml$/i, "");
    const profile = await fetch(`${baseUrl}${artifactPath}/profile.yaml`, {
      headers: { host: "attacker.example.test" }
    });
    assert.equal(profile.status, 200);
    const profileYaml = await profile.text();
    assert.match(profileYaml, /url: "https:\/\/configured\.example\.com\/sub\/a\/[^"\s]+\/provider\.yaml"/);
    assert.doesNotMatch(profileYaml, /attacker\.example\.test|shared-secret|other-secret/);
  } finally {
    server.close();
    context.close();
  }
});
