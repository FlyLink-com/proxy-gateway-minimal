import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import { hashSubscriptionToken } from "../services/subscriptions/tokens.mjs";

const NOW = "2026-05-21T00:00:00.000Z";
const LATER = "2026-05-21T01:00:00.000Z";
const RAW_TOKEN = "pgsub_visible_once_token";
const OLD_NODE_TOKEN = "pgsub_old_node_token";

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
    pingHosts: ["1.1.1.1"],
    nginx: { host: "127.0.0.1", ports: [443] }
  };
}

function withService(fn, options = {}) {
  const database = new Database(":memory:");
  const repository = createSubscriptionRepository({ database });
  let now = NOW;
  const serviceOptions = {
    repository,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.com/",
    nowFn: () => new Date(now),
    tokenFactory: () => ({
      rawToken: RAW_TOKEN,
      tokenHash: hashSubscriptionToken(RAW_TOKEN),
      tokenPrefix: RAW_TOKEN.slice(0, 14)
    }),
    idFactory: () => "tenant_1",
    expiringDays: 7,
    ...options
  };

  const service = createSubscriptionService(serviceOptions);

  return Promise.resolve()
    .then(() => fn({
      service,
      repository,
      setNow: (value) => {
        now = value;
      }
    }))
    .finally(() => {
      repository.close();
      database.close();
    });
}

async function createActiveTenant(context, overrides = {}) {
  return context.service.createTenant({
    displayName: " Customer A ",
    expiresAt: "2026-06-21T00:00:00.000Z",
    note: " paid account ",
    ...overrides
  });
}

function assertCode(errorCode, fn) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, errorCode);
    return true;
  });
}

function repositoryTenant(overrides = {}) {
  return {
    id: "tenant_direct",
    displayName: "Direct Tenant",
    status: "active",
    expiresAt: "2026-06-21T00:00:00.000Z",
    note: "",
    nodeId: "aws-singapore",
    credentialMode: "shared-node",
    tokenHash: "direct_hash",
    tokenPrefix: "pgsub_direct",
    now: NOW,
    ...overrides
  };
}

test("service creates tenant with visible-once URL and no raw token in tenant", async () => {
  await withService(async (context) => {
    const result = await createActiveTenant(context);

    assert.equal(result.subscriptionUrl, "https://gateway.example.com/sub/clash.yaml?token=pgsub_visible_once_token");
    assert.equal(result.tenant.id, "tenant_1");
    assert.equal(result.tenant.displayName, "Customer A");
    assert.equal(result.tenant.status, "active");
    assert.equal(result.tenant.expiresAt, "2026-06-21T00:00:00.000Z");
    assert.equal(result.tenant.note, "paid account");
    assert.equal(result.tenant.nodeName, "aws-singapore");
    assert.equal(result.tenant.credentialMode, "shared-node");
    assert.equal(result.tenant.tokenPrefix, "pgsub_visible_");
    assert.equal(Object.hasOwn(result.tenant, "rawToken"), false);
    assert.equal(Object.hasOwn(result.tenant, "tokenHash"), false);
  });
});

test("service default idFactory uses tenant-prefixed UUIDs", async () => {
  await withService(async (context) => {
    const result = await createActiveTenant(context);

    assert.match(result.tenant.id, /^tenant_[0-9a-f-]{36}$/);
  }, {
    idFactory: undefined
  });
});

test("createTenant always uses the default first named node", async () => {
  await withService(async (context) => {
    const result = await createActiveTenant(context, { nodeName: "aws-tokyo" });

    assert.equal(result.tenant.nodeName, "aws-singapore");
  });
});

test("createTenant validation failures throw validation_error", async () => {
  await withService(async (context) => {
    assertCode("validation_error", () => context.service.createTenant({
      displayName: " ",
      expiresAt: "2026-06-21T00:00:00.000Z"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "not-a-date"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026/06/21"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-02-31T00:00:00.000Z"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "x".repeat(501)
    }));
  });
});

test("tenant lookup and mutations throw not_found for missing tenants", async () => {
  await withService(async (context) => {
    assertCode("not_found", () => context.service.getTenant("missing"));
    assertCode("not_found", () => context.service.renewTenant("missing", {
      expiresAt: "2026-07-21T00:00:00.000Z"
    }));
    assertCode("not_found", () => context.service.disableTenant("missing"));
    assertCode("not_found", () => context.service.enableTenant("missing"));
    assertCode("not_found", () => context.service.resetToken("missing"));
  });
});

test("service rejects invalid public subscription base URL", () => {
  const database = new Database(":memory:");
  const repository = createSubscriptionRepository({ database });
  try {
    assertCode("validation_error", () => createSubscriptionService({
      repository,
      proxyConfig: sampleProxyConfig(),
      publicSubscriptionBaseUrl: "not a url"
    }));
  } finally {
    repository.close();
    database.close();
  }
});

test("repository stored tokenHash equals hash of raw visible-once token", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);

    const stored = context.repository.findTenantByTokenHash(hashSubscriptionToken(RAW_TOKEN));
    assert.equal(stored.id, "tenant_1");
    assert.equal(stored.tokenHash, hashSubscriptionToken(RAW_TOKEN));
  });
});

test("resolveSubscriptionToken validates token, scopes proxy config to the allowed node, and marks lastUsedAt", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);
    context.setNow(LATER);

    const result = await context.service.resolveSubscriptionToken(RAW_TOKEN);

    assert.equal(result.ok, true);
    assert.equal(result.tenant.id, "tenant_1");
    assert.equal(result.tenant.lastUsedAt, LATER);
    assert.equal(Object.hasOwn(result.tenant, "tokenHash"), false);
    assert.equal(result.proxyConfig.servers.length, 1);
    assert.equal(result.proxyConfig.servers[0].name, "aws-singapore");
    assert.equal(result.proxyConfig.servers[0].password, "shared-secret");
    assert.deepEqual(result.proxyConfig.pingHosts, ["1.1.1.1"]);
    assert.deepEqual(result.proxyConfig.nginx, { host: "127.0.0.1", ports: [443] });
    assert.equal(context.repository.getTenant("tenant_1").lastUsedAt, LATER);
  });
});

test("resolveSubscriptionToken rejects unknown token", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);

    assert.deepEqual(await context.service.resolveSubscriptionToken("pgsub_unknown"), {
      ok: false,
      status: 401,
      error: "Unauthorized"
    });
  });
});

test("resolveSubscriptionToken rejects disabled token", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);
    await context.service.disableTenant("tenant_1");

    assert.deepEqual(await context.service.resolveSubscriptionToken(RAW_TOKEN), {
      ok: false,
      status: 403,
      error: "Subscription disabled"
    });
  });
});

test("resolveSubscriptionToken rejects expired token", async () => {
  await withService(async (context) => {
    await createActiveTenant(context, { expiresAt: "2026-05-20T23:59:59.000Z" });

    assert.deepEqual(await context.service.resolveSubscriptionToken(RAW_TOKEN), {
      ok: false,
      status: 403,
      error: "Subscription expired"
    });
  });
});

test("resolveSubscriptionToken rejects unavailable tenant node without marking last use", async () => {
  await withService(async (context) => {
    context.repository.createTenant(repositoryTenant({
      id: "tenant_old_node",
      nodeId: "old-node",
      tokenHash: hashSubscriptionToken(OLD_NODE_TOKEN),
      tokenPrefix: OLD_NODE_TOKEN.slice(0, 14)
    }));
    context.setNow(LATER);

    assert.deepEqual(await context.service.resolveSubscriptionToken(OLD_NODE_TOKEN), {
      ok: false,
      status: 403,
      error: "Subscription node unavailable"
    });
    assert.equal(context.repository.getTenant("tenant_old_node").lastUsedAt, null);
  });
});

test("nodes returns planned shared-node summaries", async () => {
  await withService(async (context) => {
    assert.deepEqual(context.service.nodes()[0], {
      id: "node_sg",
      name: "aws-singapore",
      region: "Singapore",
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      credentialMode: "shared-node",
      status: "online"
    });
  });
});

test("overview returns ok, counts, and node summaries", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);
    context.repository.createTenant(repositoryTenant({
      id: "tenant_expiring",
      displayName: "Expiring Tenant",
      expiresAt: "2026-05-25T00:00:00.000Z",
      tokenHash: "expiring_hash",
      tokenPrefix: "pgsub_expire"
    }));
    context.repository.createTenant(repositoryTenant({
      id: "tenant_disabled",
      displayName: "Disabled Tenant",
      status: "disabled",
      tokenHash: "disabled_hash",
      tokenPrefix: "pgsub_disabl"
    }));
    context.repository.createTenant(repositoryTenant({
      id: "tenant_expired",
      displayName: "Expired Tenant",
      expiresAt: "2026-05-20T23:59:59.000Z",
      tokenHash: "expired_hash",
      tokenPrefix: "pgsub_expird"
    }));

    const overview = context.service.overview();

    assert.equal(overview.ok, true);
    assert.deepEqual(overview.counts, {
      total: 4,
      active: 1,
      expiring: 1,
      disabledOrExpired: 2
    });
    assert.equal(Array.isArray(overview.nodes), true);
    assert.deepEqual(overview.nodes[0], {
      id: "node_sg",
      name: "aws-singapore",
      region: "Singapore",
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      credentialMode: "shared-node",
      status: "online"
    });
  });
});
