import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createSubscriptionService } from "../services/subscriptions/service.mjs";
import { createSubscriptionRepository } from "../services/subscriptions/repository.mjs";
import {
  TEMP_SUBSCRIPTION_TOKEN_PREFIX,
  hashSubscriptionToken
} from "../services/subscriptions/tokens.mjs";

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

function edgeInventoryProxyConfig() {
  return {
    servers: [
      {
        id: "node_sg",
        name: "prod-edge-a",
        role: "primary",
        region: "Singapore",
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "shared-secret",
        status: "online"
      },
      {
        id: "node_tokyo",
        name: "prod-edge-b",
        role: "canary",
        region: "Tokyo",
        host: "203.0.113.11",
        port: 18389,
        method: "aes-256-gcm",
        password: "maintenance-secret",
        maintenance: true,
        maintenanceReason: "canary maintenance"
      },
      {
        id: "node_legacy",
        name: "legacy-blue",
        role: "legacy",
        region: "Singapore",
        host: "203.0.113.12",
        port: 18390,
        method: "aes-256-gcm",
        password: "disabled-secret",
        status: "disabled",
        disabledReason: "retained for rollback review"
      }
    ],
    pingHosts: ["1.1.1.1"],
    nginx: { host: "127.0.0.1", ports: [443] }
  };
}

function channelStrategyProxyConfig() {
  return {
    servers: [
      {
        id: "node_canary",
        name: "channel-lab-a",
        role: "canary",
        region: "Singapore",
        channelPool: "canary",
        strategyPriority: 5,
        protocol: "hysteria2",
        host: "198.51.100.20",
        port: 443,
        password: "hy2-secret",
        status: "online"
      },
      {
        id: "node_stable_b",
        name: "stable-b",
        role: "edge",
        region: "Tokyo",
        channelPool: "stable",
        strategyPriority: 20,
        host: "203.0.113.20",
        port: 18388,
        method: "aes-256-gcm",
        password: "stable-b-secret",
        status: "online"
      },
      {
        id: "node_private",
        name: "private-operator",
        role: "private",
        region: "Singapore",
        channelPool: "private",
        strategyPriority: 1,
        host: "198.51.100.30",
        port: 18389,
        method: "aes-256-gcm",
        password: "private-secret",
        status: "online"
      },
      {
        id: "node_stable_a",
        name: "stable-a",
        role: "edge",
        region: "Singapore",
        channelPool: "stable",
        strategyPriority: 10,
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        password: "stable-a-secret",
        status: "online"
      },
      {
        id: "node_recovery",
        name: "recovery-a",
        role: "recovery",
        region: "Singapore",
        channelPool: "recovery",
        strategyPriority: 1,
        host: "198.51.100.40",
        port: 18390,
        method: "aes-256-gcm",
        password: "recovery-secret",
        status: "online"
      }
    ],
    pingHosts: ["1.1.1.1"],
    nginx: { host: "127.0.0.1", ports: [443] }
  };
}

function tokenFromRaw(rawToken) {
  return {
    rawToken,
    tokenHash: hashSubscriptionToken(rawToken),
    tokenPrefix: rawToken.slice(0, 14)
  };
}

function sequenceTokenFactory(rawTokens) {
  const queue = [...rawTokens];
  return () => tokenFromRaw(queue.shift() || rawTokens.at(-1));
}

function withService(fn, options = {}) {
  const database = new Database(":memory:");
  const repository = createSubscriptionRepository({ database });
  let now = "2026-05-22T00:00:00.000Z";
  const primaryTokens = options.rawTokenSequence || [options.rawToken || RAW_TOKEN];
  const currentNowFn = options.nowFn || (() => new Date(now));
  const serviceOptions = {
    repository,
    proxyConfig: sampleProxyConfig(),
    publicSubscriptionBaseUrl: "https://gateway.example.com/",
    nowFn: currentNowFn,
    tokenFactory: sequenceTokenFactory(primaryTokens),
    tempTokenFactory: () => tokenFromRaw(options.tempRawToken || `${TEMP_SUBSCRIPTION_TOKEN_PREFIX}visible_once_token`),
    artifactSecretFactory: (() => {
      const artifacts = options.rawArtifactSequence || [options.rawArtifact || "opaque_device_secret"];
      const queue = [...artifacts];
      return () => queue.shift() || artifacts.at(-1);
    })(),
    idFactory: () => "tenant_1",
    artifactIdFactory: (() => {
      const ids = options.artifactIds || ["artifact_1", "artifact_2", "artifact_3"];
      const queue = [...ids];
      return () => queue.shift() || ids.at(-1);
    })(),
    tempLinkIdFactory: () => "temp_1",
    tempLinkTtlMinutes: options.tempLinkTtlMinutes || 24 * 60,
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

test("createTenant uses the default first named node when no node is requested", async () => {
  await withService(async (context) => {
    const result = await createActiveTenant(context, { nodeName: "aws-tokyo" });

    assert.equal(result.tenant.nodeName, "aws-singapore");
  });
});

test("createTenant assigns a requested node by id or name", async () => {
  await withService(async (context) => {
    const byId = await createActiveTenant(context, { nodeId: "node_tokyo" });
    assert.equal(byId.tenant.nodeName, "aws-tokyo");

    const byName = await context.service.createTenant({
      displayName: "Customer B",
      expiresAt: "2026-06-21T00:00:00.000Z",
      nodeId: "aws-singapore"
    });
    assert.equal(byName.tenant.nodeName, "aws-singapore");
  }, {
    idFactory: (() => {
      const ids = ["tenant_1", "tenant_2"];
      return () => ids.shift();
    })(),
    rawTokenSequence: ["pgsub_tokyo_token", "pgsub_sg_token"]
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
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "customer@example.com"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "token=raw-secret"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "https://example.com/sub/a/raw.yaml"
    }));
    assertCode("validation_error", () => context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z",
      nodeId: "missing-node"
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

test("resolveSubscriptionToken returns V2 multi-node output for default tenants and marks lastUsedAt", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);
    context.setNow(LATER);

    const result = await context.service.resolveSubscriptionToken(RAW_TOKEN);

    assert.equal(result.ok, true);
    assert.equal(result.tenant.id, "tenant_1");
    assert.equal(result.tenant.lastUsedAt, LATER);
    assert.equal(Object.hasOwn(result.tenant, "tokenHash"), false);
    assert.equal(result.proxyConfig.servers.length, 2);
    assert.equal(result.proxyConfig.servers[0].name, "aws-singapore");
    assert.equal(result.proxyConfig.servers[0].password, "shared-secret");
    assert.equal(result.proxyConfig.servers[1].name, "aws-tokyo");
    assert.equal(result.proxyConfig.servers[1].password, "other-secret");
    assert.deepEqual(result.proxyConfig.pingHosts, ["1.1.1.1"]);
    assert.deepEqual(result.proxyConfig.nginx, { host: "127.0.0.1", ports: [443] });
    assert.equal(context.repository.getTenant("tenant_1").lastUsedAt, LATER);
  });
});

test("setTenantNode reassigns an existing tenant and scopes future subscription output", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);

    const reassigned = context.service.setTenantNode("tenant_1", { nodeId: "node_tokyo" });
    assert.equal(reassigned.nodeName, "aws-tokyo");

    context.setNow(LATER);
    const result = context.service.resolveSubscriptionToken(RAW_TOKEN);
    assert.equal(result.ok, true);
    assert.equal(result.proxyConfig.servers.length, 1);
    assert.equal(result.proxyConfig.servers[0].name, "aws-tokyo");
    assert.equal(result.proxyConfig.servers[0].password, "other-secret");
  });
});

test("setTenantNode requires an explicit node and leaves existing assignment unchanged", async () => {
  await withService(async (context) => {
    await createActiveTenant(context, { nodeId: "node_tokyo" });
    assert.equal(context.service.getTenant("tenant_1").nodeName, "aws-tokyo");

    assertCode("validation_error", () => context.service.setTenantNode("tenant_1", {}));
    assertCode("validation_error", () => context.service.setTenantNode("tenant_1", { nodeId: "   " }));

    assert.equal(context.service.getTenant("tenant_1").nodeName, "aws-tokyo");
    assert.equal(context.repository.getTenant("tenant_1").nodeId, "aws-tokyo");
  });
});

test("resolveSubscriptionToken throttles repeated tenant last-used writes inside the interval", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);
    const markLastUsed = context.repository.markLastUsed.bind(context.repository);
    const calls = [];
    context.repository.markLastUsed = (id, input) => {
      calls.push({ id, now: input.now });
      return markLastUsed(id, input);
    };

    context.setNow("2026-05-22T00:00:00.000Z");
    const first = context.service.resolveSubscriptionToken(RAW_TOKEN);
    assert.equal(first.ok, true);
    assert.equal(first.tenant.lastUsedAt, "2026-05-22T00:00:00.000Z");
    assert.equal(calls.length, 1);

    context.setNow("2026-05-22T00:05:00.000Z");
    const repeated = context.service.resolveSubscriptionToken(RAW_TOKEN);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.tenant.lastUsedAt, "2026-05-22T00:00:00.000Z");
    assert.equal(calls.length, 1);

    context.setNow("2026-05-22T00:16:00.000Z");
    const afterInterval = context.service.resolveSubscriptionToken(RAW_TOKEN);
    assert.equal(afterInterval.ok, true);
    assert.equal(afterInterval.tenant.lastUsedAt, "2026-05-22T00:16:00.000Z");
    assert.deepEqual(calls, [
      { id: "tenant_1", now: "2026-05-22T00:00:00.000Z" },
      { id: "tenant_1", now: "2026-05-22T00:16:00.000Z" }
    ]);
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

test("service creates visible-once opaque artifacts and resolves them to V2 output", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);

    const created = context.service.createSubscriptionArtifact("tenant_1");
    assert.equal(created.artifact.id, "artifact_1");
    assert.equal(created.artifact.tenantId, "tenant_1");
    assert.equal(created.artifact.status, "active");
    assert.equal(Object.hasOwn(created.artifact, "artifactHash"), false);
    assert.equal(Object.hasOwn(created.artifact, "rawArtifact"), false);
    assert.equal(created.subscriptionUrl, "https://gateway.example.com/sub/a/opaque_device_secret.yaml");

    const listed = context.service.listSubscriptionArtifacts("tenant_1");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "artifact_1");
    assert.equal(Object.hasOwn(listed[0], "artifactHash"), false);

    context.setNow(LATER);
    const resolved = context.service.resolveSubscriptionArtifact("opaque_device_secret", {
      ip: "203.0.113.44",
      userAgent: "Clash/Test"
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.tenant.id, "tenant_1");
    assert.equal(resolved.proxyConfig.servers.length, 2);
    assert.equal(context.repository.listArtifactsByTenant("tenant_1")[0].refreshCount, 1);
  });
});

test("service rejects revoked and rotated opaque artifacts", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);
    context.service.createSubscriptionArtifact("tenant_1");

    const rotated = context.service.rotateSubscriptionArtifact("artifact_1");
    assert.equal(rotated.previous.status, "rotated");
    assert.equal(rotated.replacement.id, "artifact_2");

    assert.deepEqual(context.service.resolveSubscriptionArtifact("opaque_device_secret"), {
      ok: false,
      status: 410,
      error: "Subscription artifact rotated"
    });

    context.service.revokeSubscriptionArtifact("artifact_2");
    assert.deepEqual(context.service.resolveSubscriptionArtifact("opaque_replacement_secret"), {
      ok: false,
      status: 410,
      error: "Subscription artifact revoked"
    });
    assert.deepEqual(context.service.resolveSubscriptionArtifact("opaque_device_secret"), {
      ok: false,
      status: 410,
      error: "Subscription artifact rotated"
    });
  }, {
    rawArtifactSequence: ["opaque_device_secret", "opaque_replacement_secret"]
  });
});

test("service keeps tenant expiry and disabled behavior for opaque artifacts", async () => {
  await withService(async (context) => {
    await createActiveTenant(context, { expiresAt: "2026-05-20T23:59:59.000Z" });
    context.service.createSubscriptionArtifact("tenant_1");

    assert.deepEqual(context.service.resolveSubscriptionArtifact("opaque_device_secret"), {
      ok: false,
      status: 403,
      error: "Subscription expired"
    });
  });

  await withService(async (context) => {
    await createActiveTenant(context);
    context.service.createSubscriptionArtifact("tenant_1");
    context.service.disableTenant("tenant_1");

    assert.deepEqual(context.service.resolveSubscriptionArtifact("opaque_device_secret"), {
      ok: false,
      status: 403,
      error: "Subscription disabled"
    });
  });
});

test("service creates temporary subscription links and resolves them until expiry", async () => {
  await withService(({ service, repository }) => {
    const created = service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    assert.match(created.subscriptionUrl, /token=pgsub_/);

    const temp = service.createTempLink("tenant_1");
    assert.equal(
      temp.subscriptionUrl,
      "https://gateway.example.com/sub/clash.yaml?token=pgtmp_visible_once_token"
    );
    assert.equal(temp.tenant.id, "tenant_1");
    assert.equal(temp.expiresAt, "2026-05-23T00:00:00.000Z");

    const resolved = service.resolveSubscriptionToken("pgtmp_visible_once_token");
    assert.equal(resolved.ok, true);
    assert.equal(resolved.tenant.id, "tenant_1");
    assert.equal(resolved.proxyConfig.servers.length, 2);
    assert.equal(resolved.proxyConfig.servers[0].name, "aws-singapore");
    assert.equal(resolved.proxyConfig.servers[1].name, "aws-tokyo");

    const usedTempLink = repository.findTempLinkByTokenHash(hashSubscriptionToken("pgtmp_visible_once_token"));
    assert.equal(usedTempLink.usedAt, "2026-05-22T00:00:00.000Z");
  }, {
    tempRawToken: "pgtmp_visible_once_token",
    tempLinkTtlMinutes: 24 * 60
  });
});

test("temporary link resolution marks temp link usage immediately inside tenant last-used interval", async () => {
  await withService((context) => {
    context.service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    context.service.createTempLink("tenant_1");

    const markLastUsed = context.repository.markLastUsed.bind(context.repository);
    const markTempLinkUsed = context.repository.markTempLinkUsed.bind(context.repository);
    let lastUsedWrites = 0;
    const tempLinkWrites = [];
    context.repository.markLastUsed = (id, input) => {
      lastUsedWrites += 1;
      return markLastUsed(id, input);
    };
    context.repository.markTempLinkUsed = (id, input) => {
      tempLinkWrites.push({ id, now: input.now });
      return markTempLinkUsed(id, input);
    };

    context.setNow("2026-05-22T00:00:00.000Z");
    assert.equal(context.service.resolveSubscriptionToken(RAW_TOKEN).ok, true);
    assert.equal(lastUsedWrites, 1);

    context.setNow("2026-05-22T00:05:00.000Z");
    const resolved = context.service.resolveSubscriptionToken("pgtmp_visible_once_token");
    assert.equal(resolved.ok, true);
    assert.equal(lastUsedWrites, 1);
    assert.deepEqual(tempLinkWrites, [
      { id: "temp_1", now: "2026-05-22T00:05:00.000Z" }
    ]);

    const usedTempLink = context.repository.findTempLinkByTokenHash(hashSubscriptionToken("pgtmp_visible_once_token"));
    assert.equal(usedTempLink.usedAt, "2026-05-22T00:05:00.000Z");
  }, {
    tempRawToken: "pgtmp_visible_once_token"
  });
});

test("service rejects expired temporary subscription links", async () => {
  let current = new Date("2026-05-22T00:00:00.000Z");
  await withService(({ service }) => {
    service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    service.createTempLink("tenant_1");

    current = new Date("2026-05-23T00:00:01.000Z");
    assert.deepEqual(service.resolveSubscriptionToken("pgtmp_visible_once_token"), {
      ok: false,
      status: 403,
      error: "Subscription link expired"
    });
  }, {
    nowFn: () => current,
    tempRawToken: "pgtmp_visible_once_token",
    tempLinkTtlMinutes: 24 * 60
  });
});

test("disabled tenants block temporary subscription links without marking them used", async () => {
  await withService(({ service, repository }) => {
    service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    service.createTempLink("tenant_1");
    service.disableTenant("tenant_1");

    assert.deepEqual(service.resolveSubscriptionToken("pgtmp_visible_once_token"), {
      ok: false,
      status: 403,
      error: "Subscription disabled"
    });

    const tempLink = repository.findTempLinkByTokenHash(hashSubscriptionToken("pgtmp_visible_once_token"));
    assert.equal(tempLink.usedAt, null);
  }, {
    tempRawToken: "pgtmp_visible_once_token"
  });
});

test("resetting primary token invalidates the previous primary token without deleting temp links", async () => {
  await withService(({ service }) => {
    service.createTenant({
      displayName: "Customer A",
      expiresAt: "2026-06-21T00:00:00.000Z"
    });
    service.createTempLink("tenant_1");

    service.resetToken("tenant_1");

    assert.deepEqual(service.resolveSubscriptionToken("pgsub_visible_once_token"), {
      ok: false,
      status: 401,
      error: "Unauthorized"
    });
    assert.equal(service.resolveSubscriptionToken("pgsub_rotated_token").ok, true);
    assert.equal(service.resolveSubscriptionToken("pgtmp_visible_once_token").ok, true);
  }, {
    rawTokenSequence: ["pgsub_visible_once_token", "pgsub_rotated_token"],
    tempRawToken: "pgtmp_visible_once_token"
  });
});

test("nodes returns planned shared-node summaries", async () => {
  await withService(async (context) => {
    assert.deepEqual(context.service.nodes()[0], {
      id: "node_sg",
      name: "aws-singapore",
      role: "",
      region: "Singapore",
      channelPool: "stable",
      strategyPriority: 0,
      canaryWeight: 0,
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      credentialMode: "shared-node",
      status: "online",
      maintenance: false,
      subscriptionEligible: true,
      reason: ""
    });
  });
});

test("nodes returns safe edge inventory summaries without credentials", async () => {
  await withService(async (context) => {
    const nodes = context.service.listNodes();

    assert.deepEqual(nodes, [
      {
        id: "node_sg",
        name: "prod-edge-a",
        role: "primary",
        region: "Singapore",
        channelPool: "stable",
        strategyPriority: 0,
        canaryWeight: 0,
        host: "203.0.113.10",
        port: 18388,
        method: "aes-256-gcm",
        credentialMode: "shared-node",
        status: "online",
        maintenance: false,
        subscriptionEligible: true,
        reason: ""
      },
      {
        id: "node_tokyo",
        name: "prod-edge-b",
        role: "canary",
        region: "Tokyo",
        channelPool: "canary",
        strategyPriority: 0,
        canaryWeight: 0,
        host: "203.0.113.11",
        port: 18389,
        method: "aes-256-gcm",
        credentialMode: "shared-node",
        status: "maintenance",
        maintenance: true,
        subscriptionEligible: false,
        reason: "canary maintenance"
      },
      {
        id: "node_legacy",
        name: "legacy-blue",
        role: "legacy",
        region: "Singapore",
        channelPool: "stable",
        strategyPriority: 0,
        canaryWeight: 0,
        host: "203.0.113.12",
        port: 18390,
        method: "aes-256-gcm",
        credentialMode: "shared-node",
        status: "disabled",
        maintenance: false,
        subscriptionEligible: false,
        reason: "retained for rollback review"
      }
    ]);
    assert.doesNotMatch(JSON.stringify(nodes), /shared-secret|maintenance-secret|disabled-secret/);
  }, {
    proxyConfig: edgeInventoryProxyConfig()
  });
});

test("default subscription output excludes maintenance and disabled edge nodes", async () => {
  await withService(async (context) => {
    await createActiveTenant(context);

    const result = context.service.resolveSubscriptionToken(RAW_TOKEN);

    assert.equal(result.ok, true);
    assert.deepEqual(result.proxyConfig.servers.map((server) => server.name), ["prod-edge-a"]);
    assert.doesNotMatch(JSON.stringify(result.proxyConfig), /maintenance-secret|disabled-secret/);
  }, {
    proxyConfig: edgeInventoryProxyConfig()
  });
});

test("default channel strategy emits only stable pool nodes in priority order", async () => {
  await withService(async (context) => {
    const created = await createActiveTenant(context);
    assert.equal(created.tenant.nodeName, "stable-a");

    const result = context.service.resolveSubscriptionToken(RAW_TOKEN);

    assert.equal(result.ok, true);
    assert.deepEqual(result.proxyConfig.servers.map((server) => server.name), [
      "stable-a",
      "stable-b"
    ]);
    assert.doesNotMatch(
      JSON.stringify(result.proxyConfig),
      /hy2-secret|private-secret|recovery-secret/
    );
  }, {
    proxyConfig: channelStrategyProxyConfig()
  });
});

test("explicit channel strategy canary assignment emits only the assigned node", async () => {
  await withService(async (context) => {
    await createActiveTenant(context, { nodeId: "node_canary" });

    const result = context.service.resolveSubscriptionToken(RAW_TOKEN);

    assert.equal(result.ok, true);
    assert.deepEqual(result.proxyConfig.servers.map((server) => server.name), [
      "channel-lab-a"
    ]);
    assert.equal(result.proxyConfig.servers[0].protocol, "hysteria2");
    assert.doesNotMatch(JSON.stringify(result.proxyConfig), /stable-a-secret|stable-b-secret|private-secret|recovery-secret/);
  }, {
    proxyConfig: channelStrategyProxyConfig()
  });
});

test("assigned maintenance or disabled edge nodes fail closed before marking last use", async () => {
  await withService(async (context) => {
    context.repository.createTenant(repositoryTenant({
      id: "tenant_maintenance_node",
      nodeId: "prod-edge-b",
      tokenHash: hashSubscriptionToken(OLD_NODE_TOKEN),
      tokenPrefix: OLD_NODE_TOKEN.slice(0, 14)
    }));
    context.setNow(LATER);

    assert.deepEqual(await context.service.resolveSubscriptionToken(OLD_NODE_TOKEN), {
      ok: false,
      status: 403,
      error: "Subscription node unavailable"
    });
    assert.equal(context.repository.getTenant("tenant_maintenance_node").lastUsedAt, null);
  }, {
    proxyConfig: edgeInventoryProxyConfig()
  });

  await withService(async (context) => {
    context.repository.createTenant(repositoryTenant({
      id: "tenant_disabled_node",
      nodeId: "legacy-blue",
      tokenHash: hashSubscriptionToken(OLD_NODE_TOKEN),
      tokenPrefix: OLD_NODE_TOKEN.slice(0, 14)
    }));
    context.setNow(LATER);

    assert.deepEqual(await context.service.resolveSubscriptionToken(OLD_NODE_TOKEN), {
      ok: false,
      status: 403,
      error: "Subscription node unavailable"
    });
    assert.equal(context.repository.getTenant("tenant_disabled_node").lastUsedAt, null);
  }, {
    proxyConfig: edgeInventoryProxyConfig()
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
    assert.equal(overview.total, 4);
    assert.equal(overview.active, 1);
    assert.equal(overview.expiring, 1);
    assert.equal(overview.disabled, 1);
    assert.equal(overview.expired, 1);
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
      role: "",
      region: "Singapore",
      channelPool: "stable",
      strategyPriority: 0,
      canaryWeight: 0,
      host: "203.0.113.10",
      port: 18388,
      method: "aes-256-gcm",
      credentialMode: "shared-node",
      status: "online",
      maintenance: false,
      subscriptionEligible: true,
      reason: ""
    });
    assert.deepEqual(overview.distribution, {
      mode: "subscription-v2",
      ready: true,
      eligibleNodes: 2,
      blockedNodes: 0,
      blockers: []
    });
  });
});

test("overview distribution readiness follows the default stable channel pool", async () => {
  await withService(async (context) => {
    const overview = context.service.overview();

    assert.deepEqual(overview.distribution, {
      mode: "subscription-v2",
      ready: true,
      eligibleNodes: 2,
      blockedNodes: 3,
      blockers: []
    });
  }, {
    proxyConfig: channelStrategyProxyConfig()
  });
});

test("overview reports distribution blockers when no node can render subscriptions", async () => {
  await withService(async (context) => {
    const overview = context.service.overview();

    assert.deepEqual(overview.distribution, {
      mode: "subscription-v2",
      ready: false,
      eligibleNodes: 0,
      blockedNodes: 2,
      blockers: ["no_subscription_eligible_nodes"]
    });
  }, {
    proxyConfig: {
      servers: [
        {
          id: "node_maintenance",
          name: "prod-edge-a",
          region: "Singapore",
          host: "203.0.113.10",
          port: 18388,
          method: "aes-256-gcm",
          password: "maintenance-secret",
          maintenance: true
        },
        {
          id: "node_disabled",
          name: "prod-edge-b",
          region: "Singapore",
          host: "203.0.113.11",
          port: 18388,
          method: "aes-256-gcm",
          password: "disabled-secret",
          status: "disabled"
        }
      ],
      pingHosts: [],
      nginx: {}
    }
  });
});
