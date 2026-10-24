import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";
import { createApp } from "../app.mjs";
import { adminSubscriptionRoutes } from "../routes/admin-subscriptions.mjs";
import { buildTrafficCollectorAdminProjection } from "../services/platform/traffic-collector-admin-projection.mjs";
import { createSubscriptionCore } from "../services/subscriptions/core.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { listen } from "./helpers/listen.mjs";

const RAW_TOKEN = "pgsub_route_visible_token";
const SUBSCRIPTION_WEBSITE = "https://www.gccwebos.com/";

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

function realSubscriptionContext({ nowFn = () => new Date("2026-05-21T00:00:00.000Z") } = {}) {
  const database = new Database(":memory:");
  const repository = createSubscriptionRepository({ database });
  const proxyConfig = sampleProxyConfig();
  const service = createSubscriptionService({
    repository,
    proxyConfig,
    publicSubscriptionBaseUrl: "https://gateway.example.com",
    nowFn,
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
    assert.equal(subscription.headers.get("profile-web-page-url"), SUBSCRIPTION_WEBSITE);
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
    assert.equal(blocked.headers.get("profile-web-page-url"), null);
    assert.deepEqual(await blocked.json(), { error: "Subscription disabled" });
  } finally {
    server.close();
    context.close();
  }
});

test("tenant subscription headers include traffic rollup from the control store when bound", async () => {
  const context = realSubscriptionContext();
  const controlStore = createSqliteSubscriptionControlStore({
    database: new Database(":memory:")
  });
  const now = "2026-07-06T00:00:00.000Z";
  const validUntil = "2027-07-06T00:00:00.000Z";
  let usageSequence = 0;
  try {
    controlStore.createAccount({
      id: "acct_header_usage_1",
      ownerRef: "portal_user_header_usage_1",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    controlStore.createEntitlement({
      id: "ent_header_usage_1",
      accountId: "acct_header_usage_1",
      plan: "yearly",
      status: "active",
      validFrom: now,
      validUntil,
      trafficLimitBytes: 4096,
      createdAt: now,
      updatedAt: now
    });
    controlStore.createIssuanceRequest({
      id: "pareq_header_usage_1",
      accountId: "acct_header_usage_1",
      entitlementId: "ent_header_usage_1",
      approvalRef: "approval_header_usage_1",
      status: "issued",
      quantity: 1,
      nodeId: "node_sg",
      purpose: "portal_auto_issuance",
      requestedByRef: "portal_auto_issuer",
      createdAt: now,
      updatedAt: now
    });
    controlStore.linkIssuedSubscription({
      id: "link_header_usage_1",
      requestId: "pareq_header_usage_1",
      tenantRef: "tenant_real_1",
      artifactRef: "artifact_header_usage_1",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    controlStore.upsertPortalAccessRequest({
      id: "pareq_header_usage_1",
      portalUserRef: "portal_user_header_usage_1",
      plan: "yearly",
      clientTarget: "clash",
      durationDays: 365,
      quantity: 1,
      status: "delivered",
      nextAction: "user_can_use_access",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: now,
      updatedAt: now,
      reviewedAt: now,
      reviewedByRef: "portal_auto_issuer",
      expiresAt: validUntil,
      validUntil,
      entitlementRef: "ent_header_usage_1",
      accessGrantRef: "grant_header_usage_1",
      tenantId: "tenant_real_1",
      artifactId: "artifact_header_usage_1",
      subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
      edgeChannelRef: "node_sg",
      edgeCredentialRef: "edgecred_pareq_header_usage_1",
      edgeMaterialDigest: "sha256:digest_header_usage_1"
    });
    createTrafficAccountingService({
      controlStore,
      nowFn: () => "2026-08-07T00:10:00.000Z",
      usageSampleRefFactory: () => `usage_sample_header_${++usageSequence}`
    }).recordUsageObservation({
      sourceRef: "mihomo_snapshot_header_1",
      channelRef: "node_sg",
      edgeCredentialRef: "edgecred_pareq_header_usage_1",
      observedAt: "2026-07-10T00:05:00.000Z",
      intervalStartedAt: "2026-07-10T00:00:00.000Z",
      intervalEndedAt: "2026-07-10T00:05:00.000Z",
      uploadBytes: 1000,
      downloadBytes: 2000
    });
    createTrafficAccountingService({
      controlStore,
      nowFn: () => "2026-08-07T00:10:00.000Z",
      usageSampleRefFactory: () => `usage_sample_header_${++usageSequence}`
    }).recordUsageObservation({
      sourceRef: "mihomo_snapshot_header_2",
      channelRef: "node_sg",
      edgeCredentialRef: "edgecred_pareq_header_usage_1",
      observedAt: "2026-08-07T00:05:00.000Z",
      intervalStartedAt: "2026-08-07T00:00:00.000Z",
      intervalEndedAt: "2026-08-07T00:05:00.000Z",
      uploadBytes: 90,
      downloadBytes: 110
    });

    const state = fakeState(context.service);
    state.platform = {
      controlStore,
      usageNowFn: () => "2026-08-07T00:06:00.000Z"
    };
    const { server, baseUrl } = await listen(createApp(state));
    try {
      const created = await requestJson(baseUrl, "/api/admin/subscriptions", {
        method: "POST",
        body: { displayName: "Customer A", expiresAt: validUntil }
      });
      assert.equal(created.response.status, 201);

      const subscription = await fetch(`${baseUrl}/sub/clash.yaml?token=${RAW_TOKEN}`);
      assert.equal(subscription.status, 200);
      assert.equal(
        subscription.headers.get("subscription-userinfo"),
        `upload=90; download=110; total=4096; expire=${Math.floor(Date.parse(validUntil) / 1000)}`
      );
      assert.equal(subscription.headers.get("x-subscription-expires-at"), validUntil);
    } finally {
      server.close();
    }
  } finally {
    controlStore.close();
    context.close();
  }
});

test("successful subscription routes advertise the public website without lifecycle metadata", async () => {
  const resolved = {
    ok: true,
    tenant: { id: "tenant_no_expiry", status: "active" },
    proxyConfig: sampleProxyConfig()
  };
  const service = {
    ...fakeService(),
    resolveSubscriptionToken: () => resolved,
    resolveSubscriptionArtifact: () => resolved
  };
  const { server, baseUrl } = await listen(createApp(fakeState(service)));
  try {
    for (const path of [
      `/sub/clash.yaml?token=${RAW_TOKEN}`,
      "/sub/a/synthetic-artifact.yaml",
      "/sub/a/synthetic-artifact/profile.yaml",
      "/sub/a/synthetic-artifact/provider.yaml"
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { host: "untrusted.example.test" }
      });
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("profile-web-page-url"), SUBSCRIPTION_WEBSITE, path);
      assert.equal(response.headers.get("subscription-userinfo"), null, path);
      assert.equal(response.headers.get("x-subscription-expires-at"), null, path);
      assert.match(response.headers.get("content-type"), /application\/x-yaml/);
      assert.doesNotMatch(await response.text(), /profile-web-page-url|www\.gccwebos\.com/);
    }
  } finally {
    server.close();
  }
});

test("unauthorized subscriptions are rejected and authenticated expiry returns only a public renewal notice", async () => {
  let now = new Date("2026-05-21T00:00:00.000Z");
  const context = realSubscriptionContext({ nowFn: () => now });
  const { server, baseUrl } = await listen(createApp(fakeState(context.service)));
  try {
    for (const path of ["/sub/clash.yaml", "/sub/clash.yaml?token=unknown-test-token"]) {
      const denied = await fetch(`${baseUrl}${path}`);
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get("profile-web-page-url"), null);
      await denied.text();
    }
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
    now = new Date("2026-06-22T00:00:00.000Z");
    for (const path of [
      `/sub/clash.yaml?token=${RAW_TOKEN}`,
      artifactPath,
      `${artifactPath}/profile.yaml`,
      `${artifactPath}/provider.yaml`
    ]) {
      const expired = await fetch(`${baseUrl}${path}`);
      assert.equal(expired.status, 200, path);
      assert.equal(expired.headers.get("profile-web-page-url"), "https://portal.gccwebos.com", path);
      assert.equal(expired.headers.get("x-subscription-status"), "expired", path);
      const notice = await expired.text();
      assert.match(notice, /当前订阅已过期/);
      assert.doesNotMatch(notice, /shared-secret|other-secret|server:|password:/);
    }
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
    assert.equal(subscription.headers.get("profile-web-page-url"), SUBSCRIPTION_WEBSITE);
    assert.equal(subscription.headers.get("x-subscription-expires-at"), "2026-06-21T00:00:00.000Z");
    const yaml = await subscription.text();
    assert.match(yaml, /^# globalcircle-subscription-status: "active"/);
    assert.match(yaml, /# globalcircle-subscription-expires-at: "2026-06-21T00:00:00.000Z"/);
    assert.match(yaml, /name: "aws-singapore"/);
    assert.match(yaml, /name: "aws-tokyo"/);
    assert.doesNotMatch(yaml, /tenant_real_1|pgsub_route_visible/);

    const artifactWithLegacyToken = await fetch(`${baseUrl}${artifactPath}?token=${RAW_TOKEN}`);
    assert.equal(artifactWithLegacyToken.status, 200);
    const artifactWithLegacyTokenYaml = await artifactWithLegacyToken.text();
    assert.match(artifactWithLegacyTokenYaml, /^# globalcircle-subscription-status: "active"/);
    assert.match(artifactWithLegacyTokenYaml, /name: "aws-singapore"/);
    assert.match(artifactWithLegacyTokenYaml, /name: "aws-tokyo"/);
    assert.doesNotMatch(artifactWithLegacyTokenYaml, /tenant_real_1|pgsub_route_visible/);

    const fallback = await fetch(`${baseUrl}/sub/a/missing-artifact.yaml?token=${RAW_TOKEN}`);
    assert.equal(fallback.status, 404);
    assert.equal(fallback.headers.get("profile-web-page-url"), null);
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
    assert.equal(profile.headers.get("profile-web-page-url"), SUBSCRIPTION_WEBSITE);
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
    assert.equal(provider.headers.get("profile-web-page-url"), SUBSCRIPTION_WEBSITE);
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
    assert.equal(missing.headers.get("profile-web-page-url"), null);
    assert.deepEqual(await missing.json(), { error: "Not found" });
  } finally {
    server.close();
    context.close();
  }
});

test("rotated opaque artifact blocks profile provider and bare routes", async () => {
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

    const rotated = await requestJson(
      baseUrl,
      `/api/admin/subscription-artifacts/${artifact.body.artifact.id}/rotate`,
      { method: "POST" }
    );
    assert.equal(rotated.response.status, 201);

    const oldPath = new URL(artifact.body.subscriptionUrl).pathname;
    const oldProviderPath = oldPath.replace(/\.yaml$/i, "");
    for (const path of [
      oldPath,
      `${oldProviderPath}/profile.yaml`,
      `${oldProviderPath}/provider.yaml`
    ]) {
      const blocked = await fetch(`${baseUrl}${path}`);
      assert.equal(blocked.status, 410);
      assert.equal(blocked.headers.get("profile-web-page-url"), null);
      assert.deepEqual(await blocked.json(), { error: "Subscription artifact rotated" });
    }

    const replacementPath = new URL(rotated.body.subscriptionUrl).pathname.replace(/\.yaml$/i, "");
    const replacementProfile = await fetch(`${baseUrl}${replacementPath}/profile.yaml`);
    assert.equal(replacementProfile.status, 200);
    assert.doesNotMatch(await replacementProfile.text(), /pgsub_route_visible|tenant_real_1/);

    const revoked = await requestJson(
      baseUrl,
      `/api/admin/subscription-artifacts/${rotated.body.replacement.id}/revoke`,
      { method: "POST" }
    );
    assert.equal(revoked.response.status, 200);
    for (const path of [replacementPath, `${replacementPath}/profile.yaml`, `${replacementPath}/provider.yaml`]) {
      const blocked = await fetch(`${baseUrl}${path}`);
      assert.equal(blocked.status, 410);
      assert.equal(blocked.headers.get("profile-web-page-url"), null);
      assert.deepEqual(await blocked.json(), { error: "Subscription artifact revoked" });
    }
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

test("Admin overview returns 401 without a principal when capability authorization is enabled", async () => {
  const state = fakeState();
  state.platform = {
    adminAuthorizationEnabled: true
  };
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const overview = await requestJson(baseUrl, "/api/admin/overview");
    assert.equal(overview.response.status, 401);
    assert.deepEqual(overview.body, {
      error: "admin_authentication_required"
    });
  } finally {
    server.close();
  }
});

test("Admin overview returns 403 when the principal lacks operations.read", async () => {
  const state = fakeState();
  state.platform = {
    adminAuthorizationEnabled: true
  };
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = {
      capabilities: ["users.read"]
    };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/overview`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "admin_capability_required",
      capability: "operations.read"
    });
  } finally {
    server.close();
  }
});


test("Operations overview route is absent while Admin authorization is disabled", async () => {
  let overviewCalls = 0;
  const service = {
    ...fakeService(),
    overview: () => {
      overviewCalls += 1;
      return fakeService().overview();
    }
  };
  const state = fakeState(service);
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const operations = await requestJson(baseUrl, "/api/admin/operations/overview");
    assert.equal(operations.response.status, 404);
    assert.equal(overviewCalls, 0);

    const legacy = await requestJson(baseUrl, "/api/admin/overview");
    assert.equal(legacy.response.status, 200);
    assert.equal(legacy.body.ok, true);
    assert.equal(typeof legacy.body.counts, "object");
    assert.equal(overviewCalls, 1);
  } finally {
    server.close();
  }
});


test("Operations overview returns an allowlisted authorized Envelope", async () => {
  const state = fakeState();
  state.platform = {
    adminAuthorizationEnabled: true
  };
  let overviewCalls = 0;
  state.subscriptions.service.overview = () => {
    overviewCalls += 1;
    return {
      ok: true,
      total: 12,
      active: 8,
      expiring: 2,
      disabled: 1,
      expired: 1,
      counts: {
        total: 12,
        active: 8,
        expiring: 2,
        disabledOrExpired: 2
      },
      nodes: [{ name: "node-secret" }],
      distribution: { "credential-secret": 1 },
      token: "must-not-cross",
      futureSourceField: "future-must-not-cross"
    };
  };

  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = {
      capabilities: ["operations.read"]
    };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.schemaVersion, "operations-overview-read-envelope/v1");
    assert.equal(body.freshness, "fresh");
    assert.equal(body.sourceState, "implemented_source");
    assert.deepEqual(body.data, {
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    });
    assert.deepEqual(Object.keys(body.data), [
      "total",
      "active",
      "expiring",
      "disabledOrExpired"
    ]);
    assert.deepEqual(body.warnings, []);
    assert.deepEqual(body.access, {
      allowed: true,
      capability: "operations.read",
      reasonCode: "allowed"
    });
    assert.equal(new Date(body.generatedAt).toISOString(), body.generatedAt);
    assert.equal(overviewCalls, 1);
    assert.deepEqual(
      Object.keys(body).sort(),
      [
        "access",
        "data",
        "freshness",
        "generatedAt",
        "schemaVersion",
        "sourceState",
        "warnings"
      ]
    );
    assert.doesNotMatch(
      JSON.stringify(body),
      /node-secret|credential-secret|must-not-cross|futureSourceField/
    );
  } finally {
    server.close();
  }
});


test("Operations overview accepts the real Subscription Core overview shape", async () => {
  const database = new Database(":memory:");
  const store = createSubscriptionRepository({ database });
  const core = createSubscriptionCore({
    store,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.com",
    nowFn: () => new Date("2026-05-21T00:00:00.000Z")
  });
  const state = fakeState(core, "core");
  state.platform = { adminAuthorizationEnabled: true };

  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data, {
      total: 0,
      active: 0,
      expiring: 0,
      disabledOrExpired: 0
    });
    assert.deepEqual(Object.keys(body).sort(), [
      "access",
      "data",
      "freshness",
      "generatedAt",
      "schemaVersion",
      "sourceState",
      "warnings"
    ]);
  } finally {
    server.close();
    store.close();
    database.close();
  }
});


test("Operations overview route requires the authorization flag to be exactly true", async () => {
  let overviewCalls = 0;
  const service = {
    ...fakeService(),
    overview: () => {
      overviewCalls += 1;
      return fakeService().overview();
    }
  };
  const state = fakeState(service);
  state.platform = { adminAuthorizationEnabled: 1 };
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 404);
    assert.equal(overviewCalls, 0);
  } finally {
    server.close();
  }
});

test("Operations overview returns 401 without an Admin principal", async () => {
  let overviewCalls = 0;
  const service = {
    ...fakeService(),
    overview: () => {
      overviewCalls += 1;
      return fakeService().overview();
    }
  };
  const state = fakeState(service);
  state.platform = { adminAuthorizationEnabled: true };
  const app = express();
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "admin_authentication_required"
    });
    assert.equal(overviewCalls, 0);
  } finally {
    server.close();
  }
});

test("Operations overview returns 403 without operations.read", async () => {
  let overviewCalls = 0;
  const service = {
    ...fakeService(),
    overview: () => {
      overviewCalls += 1;
      return fakeService().overview();
    }
  };
  const state = fakeState(service);
  state.platform = { adminAuthorizationEnabled: true };
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["users.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "admin_capability_required",
      capability: "operations.read"
    });
    assert.equal(overviewCalls, 0);
  } finally {
    server.close();
  }
});

test("Operations overview hides invalid owner data behind a safe internal error", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  state.subscriptions.service.overview = () => ({
    total: "12",
    active: 8,
    expiring: 2,
    disabledOrExpired: 2,
    secret: "must-not-cross"
  });

  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));

  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/overview`);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(body, { error: "internal_error" });
    assert.doesNotMatch(JSON.stringify(body), /must-not-cross|12/);
  } finally {
    server.close();
  }
});


function errorWithInheritedCode(code, message) {
  const error = new Error(message);
  Object.setPrototypeOf(error, Object.create(Error.prototype, {
    code: {
      value: code,
      enumerable: true,
      configurable: true
    }
  }));
  return error;
}

for (const [label, failureFactory] of [
  [
    "an own validation_error",
    () => serviceError("validation_error", "owner-secret-own-validation")
  ],
  [
    "an own not_found error",
    () => serviceError("not_found", "owner-secret-own-not-found")
  ],
  [
    "an inherited validation_error",
    () => errorWithInheritedCode(
      "validation_error",
      "owner-secret-inherited-validation"
    )
  ],
  [
    "an inherited not_found error",
    () => errorWithInheritedCode(
      "not_found",
      "owner-secret-inherited-not-found"
    )
  ],
  ["a null throw", () => null],
  [
    "a throwing code accessor",
    () => {
      const error = new Error("owner-secret-throwing-code");
      Object.defineProperty(error, "code", {
        configurable: true,
        get() {
          throw new Error("owner-secret-code-accessor");
        }
      });
      return error;
    }
  ]
]) {
  test(`Operations overview safely normalizes ${label} from the Owner`, async () => {
    const state = fakeState({
      ...fakeService(),
      overview: () => {
        throw failureFactory();
      }
    });
    state.platform = { adminAuthorizationEnabled: true };

    const app = express();
    app.use((req, _res, next) => {
      req.adminPrincipal = { capabilities: ["operations.read"] };
      next();
    });
    app.use(adminSubscriptionRoutes(state));

    const { server, baseUrl } = await listen(app);
    try {
      const failed = await requestJson(baseUrl, "/api/admin/operations/overview");
      assert.equal(failed.response.status, 500);
      assert.deepEqual(failed.body, { error: "internal_error" });
      assert.doesNotMatch(
        JSON.stringify(failed.body),
        /owner-secret|validation_error|not_found/
      );
    } finally {
      server.close();
    }
  });
}

test("dashboard summary returns 401 without a principal when capability authorization is enabled", async () => {
  let overviewCalls = 0;
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  state.subscriptions.service.overview = () => {
    overviewCalls += 1;
    return fakeService().overview();
  };
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const { response, body } = await requestJson(baseUrl, "/api/admin/operations/dashboard-summary");
    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: "admin_authentication_required" });
    assert.equal(overviewCalls, 0);
  } finally {
    server.close();
  }
});

test("dashboard summary stays unregistered when capability authorization is disabled", async () => {
  let overviewCalls = 0;
  const state = fakeState();
  state.subscriptions.service.overview = () => {
    overviewCalls += 1;
    return {
      ok: true,
      counts: { total: 3, active: 2, expiring: 1, disabledOrExpired: 0 },
      nodes: [{ name: "node-secret" }],
      token: "must-not-cross"
    };
  };
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const summary = await requestJson(baseUrl, "/api/admin/operations/dashboard-summary");
    assert.equal(summary.response.status, 404);
    assert.equal(overviewCalls, 0);
    assert.equal(JSON.stringify(summary.body).includes("access"), false);
    assert.equal(JSON.stringify(summary.body).includes("operations.read"), false);

    const legacy = await requestJson(baseUrl, "/api/admin/overview");
    assert.equal(legacy.response.status, 200);
    assert.equal(legacy.body.nodes[0].name, "node-secret");
    assert.equal(overviewCalls, 1);

    const operations = await requestJson(baseUrl, "/api/admin/operations/overview");
    assert.equal(operations.response.status, 404);
  } finally {
    server.close();
  }
});

test("dashboard summary returns subscription tenant counts and leaves other metrics unconnected", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  state.subscriptions.service.overview = () => ({
    ok: true,
    total: 0,
    active: 0,
    expiring: 0,
    disabled: 0,
    expired: 0,
    counts: { total: 0, active: 0, expiring: 0, disabledOrExpired: 0 },
    nodes: [{ name: "node-secret" }],
    token: "must-not-cross",
    subscriptionUrl: "https://gateway.example.invalid/sub/secret"
  });
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));
  const { server, baseUrl } = await listen(app);
  try {
    const { response, body } = await requestJson(baseUrl, "/api/admin/operations/dashboard-summary");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.schemaVersion, "operations-dashboard-summary/v1");
    assert.equal(body.freshness, "partial");
    assert.equal(body.sourceState, "implemented_source");
    assert.match(body.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(body.warnings, [{ code: "source_partial" }]);
    assert.deepEqual(body.data.subscriptions, {
      availability: "ready",
      definition: "subscription_tenants",
      total: 0,
      active: 0,
      expiring: 0,
      disabledOrExpired: 0
    });
    for (const key of ["platformHealth", "channelCoverage", "freshnessP95", "riskCandidates"]) {
      assert.deepEqual(body.data[key], { availability: "not_connected" });
    }
    assert.deepEqual(body.data.registrationGrowth, { availability: "not_authorized" });
    assert.deepEqual(body.data.trafficCollector, { availability: "not_connected", observedAt: null });
    assert.equal(JSON.stringify(body).includes("node-secret"), false);
    assert.equal(JSON.stringify(body).includes("must-not-cross"), false);
    assert.equal(JSON.stringify(body).includes("subscriptionUrl"), false);
  } finally {
    server.close();
  }
});

test("dashboard summary returns nonzero tenant counts only after operations.read allows it", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  state.subscriptions.service.overview = () => ({
    ok: true,
    counts: { total: 3, active: 2, expiring: 1, disabledOrExpired: 0 },
    nodes: [{ name: "node-secret" }],
    token: "must-not-cross"
  });
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.access.allowed, true);
    assert.equal(body.access.capability, "operations.read");
    assert.equal(body.access.reasonCode, "allowed");
    assert.deepEqual(body.data.subscriptions, {
      availability: "ready",
      definition: "subscription_tenants",
      total: 3,
      active: 2,
      expiring: 1,
      disabledOrExpired: 0
    });
    assert.equal(JSON.stringify(body).includes("node-secret"), false);
    assert.equal(JSON.stringify(body).includes("must-not-cross"), false);
    assert.deepEqual(body.data.registrationGrowth, { availability: "not_authorized" });
    assert.deepEqual(body.data.trafficCollector, { availability: "not_connected", observedAt: null });
  } finally {
    server.close();
  }
});

test("dashboard summary requires operations.read when admin authorization is enabled", async () => {
  let overviewCalls = 0;
  const service = {
    ...fakeService(),
    overview: () => {
      overviewCalls += 1;
      return fakeService().overview();
    }
  };
  const state = fakeState(service);
  state.platform = { adminAuthorizationEnabled: true };
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["users.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "admin_capability_required",
      capability: "operations.read"
    });
    assert.equal(overviewCalls, 0);
  } finally {
    server.close();
  }
});

test("dashboard summary hides invalid subscription counts behind a safe internal error", async () => {
  const state = fakeState();
  state.platform = { adminAuthorizationEnabled: true };
  state.subscriptions.service.overview = () => ({
    counts: { total: "12", active: 1, expiring: 0, disabledOrExpired: 0 },
    nodes: [{ name: "node-secret" }]
  });
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities: ["operations.read"] };
    next();
  });
  app.use(adminSubscriptionRoutes(state));
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_error" });
  } finally {
    server.close();
  }
});

function dashboardApp(state, capabilities) {
  state.platform = { ...(state.platform ?? {}), adminAuthorizationEnabled: true };
  const app = express();
  app.use((req, _res, next) => {
    req.adminPrincipal = { capabilities };
    next();
  });
  app.use(adminSubscriptionRoutes(state));
  return app;
}

test("dashboard summary projects queried UTC registration days and real zeros", async () => {
  let growthCalls = 0;
  const state = fakeState();
  state.platform = {
    controlStore: {
      listUserMonitorGrowthDays() {
        growthCalls += 1;
        return [{
          at: "2026-10-01T00:00:00.000Z",
          registeredCount: 2,
          otherCreatedCount: 1
        }];
      }
    }
  };
  const { server, baseUrl } = await listen(dashboardApp(state, ["operations.read", "users.read"]));
  try {
    const shifted = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary?from=2026-10-01T08:00:00.000%2B08:00&to=2026-10-03T08:00:00.000%2B08:00`);
    assert.equal(shifted.status, 200);
    const body = await shifted.json();
    assert.equal(body.data.subscriptions.total, 1);
    assert.deepEqual(body.data.registrationGrowth, {
      availability: "ready",
      timezone: "UTC",
      definition: "account_created_at",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-03T00:00:00.000Z",
      registeredCount: 2,
      otherCreatedCount: 1,
      points: [
        {
          at: "2026-10-01T00:00:00.000Z",
          registeredCount: 2,
          otherCreatedCount: 1,
          coverage: "queried"
        },
        {
          at: "2026-10-02T00:00:00.000Z",
          registeredCount: 0,
          otherCreatedCount: 0,
          coverage: "queried"
        }
      ]
    });
    assert.equal(growthCalls, 1);
    assert.equal(JSON.stringify(body).includes("email"), false);

    const exact = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary?from=2026-09-23T00:00:00.000Z&to=2026-10-24T00:00:00.000Z`);
    assert.equal(exact.status, 200);
    const over = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary?from=2026-09-22T00:00:00.000Z&to=2026-10-24T00:00:00.000Z`);
    assert.equal(over.status, 400);
    assert.deepEqual(await over.json(), { error: "invalid_query" });
  } finally {
    server.close();
  }
});

test("dashboard summary keeps subscription counts when registration growth cannot be read", async () => {
  const state = fakeState();
  state.platform = {
    controlStore: {
      listUserMonitorGrowthDays() {
        return [{
          at: "2026-10-01T00:00:00.000Z",
          registeredCount: -1,
          otherCreatedCount: 0
        }];
      }
    }
  };
  const { server, baseUrl } = await listen(dashboardApp(state, ["operations.read", "users.read"]));
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.subscriptions.total, 1);
    assert.deepEqual(body.data.registrationGrowth, { availability: "unavailable" });
    assert.equal(JSON.stringify(body.data.registrationGrowth).includes("0"), false);
    assert.equal(body.warnings.some((warning) => warning.code === "source_unavailable"), true);
  } finally {
    server.close();
  }
});

test("dashboard summary rejects an invalid registration query before reading subscriptions", async () => {
  let overviewCalls = 0;
  let growthCalls = 0;
  const state = fakeState();
  state.subscriptions.service.overview = () => {
    overviewCalls += 1;
    return fakeService().overview();
  };
  state.platform = {
    controlStore: {
      listUserMonitorGrowthDays() {
        growthCalls += 1;
        return [];
      }
    }
  };
  const { server, baseUrl } = await listen(dashboardApp(state, ["operations.read"]));
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary?from=2026-10-01T00:00:00.000Z`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_query" });
    assert.equal(overviewCalls, 0);
    assert.equal(growthCalls, 0);
  } finally {
    server.close();
  }
});

test("dashboard summary does not read registration growth without users.read", async () => {
  let growthCalls = 0;
  const state = fakeState();
  state.platform = {
    controlStore: {
      listUserMonitorGrowthDays() {
        growthCalls += 1;
        return [];
      }
    }
  };
  const { server, baseUrl } = await listen(dashboardApp(state, ["operations.read"]));
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.registrationGrowth, { availability: "not_authorized" });
    assert.equal(growthCalls, 0);
    assert.equal(body.data.subscriptions.total, 1);
  } finally {
    server.close();
  }
});

test("dashboard summary projects collector observation time without internal refs", async () => {
  let reads = 0;
  const observedAt = "2026-07-10T13:00:00.000Z";
  const projection = buildTrafficCollectorAdminProjection({
    summary: {
      type: "traffic_usage_collect_once",
      ok: true,
      rawReportOk: true,
      collectorCount: 1,
      idleCollectorCount: 0,
      observationCount: 1,
      recordedCount: 1,
      insertedCount: 1,
      unresolvedCount: 0,
      reports: [{
        channelRef: "channel-secret",
        collectorState: {
          type: "traffic_collector_state",
          health: "healthy",
          condition: "ok",
          sourceRef: "source-secret",
          channelRef: "channel-secret",
          lastCollectorSuccessAt: observedAt,
          observationCount: 1,
          unresolvedCount: 0,
          safety: { redacted: true }
        },
        blockers: [],
        observability: { statsApiReachable: true }
      }],
      customerEmail: "private@example.test",
      token: "must-not-cross"
    },
    observedAt
  });
  const state = fakeState();
  state.platform = {
    trafficCollectorStatusStore: {
      read() {
        reads += 1;
        return projection;
      }
    }
  };
  const { server, baseUrl } = await listen(dashboardApp(state, ["operations.read", "users.read"]));
  try {
    const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary?from=2026-10-01T00:00:00.000Z&to=2026-10-02T00:00:00.000Z`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.trafficCollector, {
      availability: "ready",
      observedAt
    });
    assert.notEqual(body.generatedAt, observedAt);
    assert.equal(reads, 1);
    const encoded = JSON.stringify(body);
    assert.equal(encoded.includes("channel-secret"), false);
    assert.equal(encoded.includes("source-secret"), false);
    assert.equal(encoded.includes("private@example.test"), false);
    assert.equal(encoded.includes("must-not-cross"), false);
  } finally {
    server.close();
  }
});

test("dashboard summary reports collector states without inventing an observation time", async () => {
  const cases = [
    [{ availability: "not_observed", observedAt: null }, { availability: "unknown", observedAt: null }],
    [{ availability: "invalid_observation" }, { availability: "unknown", observedAt: null }]
  ];
  for (const [stored, expected] of cases) {
    const state = fakeState();
    state.platform = {
      trafficCollectorStatusStore: { read: () => stored }
    };
    const { server, baseUrl } = await listen(dashboardApp(state, ["operations.read"]));
    try {
      const response = await fetch(`${baseUrl}/api/admin/operations/dashboard-summary`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.data.trafficCollector, expected);
      assert.equal(JSON.stringify(body.data.trafficCollector).includes("channel"), false);
    } finally {
      server.close();
    }
  }

  const thrown = fakeState();
  thrown.platform = {
    trafficCollectorStatusStore: {
      read() {
        throw new Error("collector-secret-failure");
      }
    }
  };
  const failed = await listen(dashboardApp(thrown, ["operations.read"]));
  try {
    const response = await fetch(`${failed.baseUrl}/api/admin/operations/dashboard-summary`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.data.trafficCollector, { availability: "unknown", observedAt: null });
    assert.equal(JSON.stringify(body).includes("collector-secret-failure"), false);
    assert.equal(body.warnings.some((warning) => warning.code === "source_unavailable"), true);
  } finally {
    failed.server.close();
  }
});

test("dashboard summary does not read collector state before operations.read allows it", async () => {
  let reads = 0;
  const state = fakeState();
  state.platform = {
    adminAuthorizationEnabled: true,
    trafficCollectorStatusStore: {
      read() {
        reads += 1;
        return { availability: "available", observedAt: "2026-07-10T13:00:00.000Z", channelRef: "channel-secret" };
      }
    }
  };
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const unauthenticated = await requestJson(baseUrl, "/api/admin/operations/dashboard-summary");
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(reads, 0);
  } finally {
    server.close();
  }
});
