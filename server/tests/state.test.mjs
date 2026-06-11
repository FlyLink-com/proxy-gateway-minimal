import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";
import { buildSubscriptionUsageMonitor } from "../services/platform/subscription-usage-monitor.mjs";

function fakeSubscriptionStore(overrides = {}) {
  return {
    listTenants: () => [],
    getTenant: () => null,
    findTenantByTokenHash: () => null,
    createTenant: () => null,
    renewTenant: () => null,
    setTenantStatus: () => null,
    setTenantNode: () => null,
    resetTenantToken: () => null,
    markLastUsed: () => null,
    createTempLink: () => null,
    findTempLinkByTokenHash: () => null,
    markTempLinkUsed: () => null,
    createArtifact: () => null,
    listArtifactsByTenant: () => [],
    findArtifactBySecretHash: () => null,
    markArtifactRefreshed: () => null,
    revokeArtifact: () => null,
    rotateArtifact: () => null,
    close: () => {},
    ...overrides
  };
}

const VULTR_MULTICHANNEL_ENV = {
  VULTR_TUIC_HOST: "tuic.example.test",
  VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
  VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
  VULTR_TUIC_SNI: "tuic.example.test",
  VULTR_VLESS_REALITY_HOST: "vless.example.test",
  VULTR_VLESS_REALITY_UUID: "22222222-2222-4222-8222-222222222222",
  VULTR_VLESS_REALITY_SNI: "www.example.test",
  VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
  VULTR_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
  VULTR_HY2_HOST: "hy2.example.test",
  VULTR_HY2_PASSWORD: "synthetic-hy2-password",
  VULTR_HY2_SNI: "hy2.example.test",
  SGP_TUIC_HOST: "sgp-tuic.example.test",
  SGP_TUIC_UUID: "33333333-3333-4333-8333-333333333333",
  SGP_TUIC_PASSWORD: "synthetic-sgp-tuic-password",
  SGP_TUIC_SNI: "sgp-tuic.example.test",
  SGP_VLESS_REALITY_HOST: "sgp-vless.example.test",
  SGP_VLESS_REALITY_UUID: "44444444-4444-4444-8444-444444444444",
  SGP_VLESS_REALITY_SNI: "www.sgp-example.test",
  SGP_VLESS_REALITY_PUBLIC_KEY: "synthetic-sgp-public-key",
  SGP_VLESS_REALITY_SHORT_ID: "synthetic-sgp-short-id",
  SGP_HY2_HOST: "sgp-hy2.example.test",
  SGP_HY2_PASSWORD: "synthetic-sgp-hy2-password",
  SGP_HY2_SNI: "sgp-hy2.example.test"
};

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeTempDir(dir) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error?.code)) {
        throw error;
      }
      sleepMs(100);
    }
  }
  if (process.platform === "win32" && ["EPERM", "EBUSY"].includes(lastError?.code)) {
    return;
  }
  throw lastError;
}

function runtimeEnv(overrides = {}) {
  return {
    ...VULTR_MULTICHANNEL_ENV,
    ...overrides
  };
}

test("createRuntimeState exposes expected ports and services", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-state-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({ CONSOLE_TOKEN: "secret" }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(state.host, "127.0.0.1");
    assert.equal(state.ports.console, 3456);
    assert.equal(state.ports.socks, 1080);
    assert.equal(state.ports.httpProxy, 18180);
    assert.equal(typeof state.services.ssLocal.start, "function");
    assert.equal(typeof state.services.httpProxy.start, "function");
    assert.equal(typeof state.proxyConfig, "object");
    assert.equal(state.consoleToken, "secret");
  } finally {
    state?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState reuses a generated console token across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-token-"));
  const tokenStorePath = join(dir, "console-token");
  let first;
  let second;

  try {
    let generated = 0;
    const options = {
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv(),
      autoStartHttpProxy: false,
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      consoleTokenStorePath: tokenStorePath,
      tokenFactory: () => `generated-token-${++generated}`
    };

    first = createRuntimeState(options);
    second = createRuntimeState(options);

    assert.equal(first.consoleToken, "generated-token-1");
    assert.equal(second.consoleToken, "generated-token-1");
    assert.equal(generated, 1);
    assert.equal(readFileSync(tokenStorePath, "utf8"), "generated-token-1\n");
  } finally {
    first?.subscriptions?.repository.close();
    second?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState wires subscription runtime services with default public URL", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-subscriptions-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({ CONSOLE_TOKEN: "secret" }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(state.subscriptions.publicSubscriptionBaseUrl, "http://127.0.0.1:3456");
    assert.equal(state.subscriptions.core, state.subscriptions.service);
    assert.equal(state.subscriptions.store, state.subscriptions.repository);
    assert.equal(typeof state.subscriptions.service.createTenant, "function");
    assert.equal(typeof state.subscriptions.repository.close, "function");
  } finally {
    state?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState respects PUBLIC_SUBSCRIPTION_BASE_URL override", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-subscriptions-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        PUBLIC_SUBSCRIPTION_BASE_URL: "  https://subscriptions.example.test///  "
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(state.subscriptions.publicSubscriptionBaseUrl, "https://subscriptions.example.test");
    assert.equal(typeof state.subscriptions.service.createTenant, "function");
  } finally {
    state?.subscriptions?.repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState uses SUBSCRIPTION_PROXY_CONFIG_PATH for protected node config", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-protected-proxy-config-"));
  const proxyConfigPath = join(dir, "protected", "proxy-servers.json");
  let state;

  try {
    mkdirSync(join(dir, "protected"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_aliyun_a_tuic",
          name: "channel-aliyun-a-tuic",
          physicalNodeRef: "aliyun-control-a",
          protocol: "tuic",
          type: "tuic",
          host: "edge.example.test",
          port: 443,
          uuid: "${ALIYUN_TUIC_UUID}",
          password: "${ALIYUN_TUIC_PASSWORD}",
          channelPool: "stable",
          channelRole: "stable",
          status: "online",
          subscriptionEligible: true,
          stableProtocolApproved: true,
          stableProtocolApprovalRef: "aliyun-local-tuic-explicit-restart",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true,
            restart: true
          }
        }
      ]
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        ALIYUN_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
        ALIYUN_TUIC_PASSWORD: "synthetic-tuic-password"
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    const nodes = state.subscriptions.core.listNodes();
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].name, "channel-aliyun-a-tuic");
    assert.equal(nodes[0].credentialMode, "per-order");
    assert.equal(nodes[0].physicalNodeRef, "aliyun-control-a");
  } finally {
    state?.subscriptions?.close?.();
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test("createRuntimeState uses SUBSCRIPTION_CONTROL_DB_PATH for the business control store", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-control-db-"));
  const configuredControlPath = join(dir, "configured", "subscription-control.sqlite");
  const defaultControlPath = join(dir, ".proxy-gateway", "control.sqlite");
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        SUBSCRIPTION_CONTROL_DB_PATH: configuredControlPath
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      autoStartHttpProxy: false
    });

    assert.equal(existsSync(configuredControlPath), true);
    assert.equal(existsSync(defaultControlPath), false);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState closes only owned subscription repositories", () => {
  let closeCount = 0;
  const repository = fakeSubscriptionStore({
    close: () => {
      closeCount += 1;
    }
  });

  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: runtimeEnv({ CONSOLE_TOKEN: "secret" }),
    subscriptionRepository: repository,
    autoStartHttpProxy: false
  });

  state.close();
  state.subscriptions.close();

  assert.equal(closeCount, 0);
  assert.equal(state.subscriptions.store, repository);
  assert.equal(state.subscriptions.repository, repository);
  assert.equal(state.subscriptions.core, state.subscriptions.service);
  assert.equal(typeof state.subscriptions.service.createTenant, "function");
});

test("createRuntimeState does not create a store when subscription core is injected alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-service-only-"));
  const service = { createTenant: () => {} };

  try {
    const state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({ CONSOLE_TOKEN: "secret" }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      subscriptionCore: service,
      autoStartHttpProxy: false
    });

    assert.equal(state.subscriptions.store, null);
    assert.equal(state.subscriptions.repository, null);
    assert.equal(state.subscriptions.core, service);
    assert.equal(state.subscriptions.service, service);
    assert.equal(existsSync(join(dir, "subscriptions.sqlite")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState parses hardening security environment", () => {
  const state = createRuntimeState({
    rootDir: new URL("../../", import.meta.url),
    env: runtimeEnv({
      CONSOLE_TOKEN: "secret",
      ADMIN_ALLOWED_CIDRS: "127.0.0.1/32,10.0.0.0/8",
      TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
      SUB_RATE_LIMIT_WINDOW_MS: "1000",
      SUB_RATE_LIMIT_MAX: "2",
      SUBSCRIPTION_TEMP_LINK_TTL_MINUTES: "30"
    }),
    autoStartHttpProxy: false,
    subscriptionDbPath: ":memory:"
  });

  try {
    assert.deepEqual(state.security.adminAllowedCidrs, ["127.0.0.1/32", "10.0.0.0/8"]);
    assert.deepEqual(state.security.trustedProxyCidrs, ["127.0.0.1/32"]);
    assert.deepEqual(state.security.subRateLimit, { windowMs: 1000, max: 2 });
    assert.equal(state.subscriptions.tempLinkTtlMinutes, 30);
  } finally {
    state.close();
  }
});

test("createRuntimeState wires env-gated user portal password login services", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-auth-wiring-"));
  const now = "2026-06-06T00:00:00.000Z";
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_ROUTES_ENABLED: "true",
        USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true"
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      userPortalNowFn: () => now,
      autoStartHttpProxy: false
    });

    assert.equal(state.platform.userPortalRoutesEnabled, true);
    assert.equal(typeof state.platform.portalHumanChallenges.issueChallenge, "function");
    assert.equal(typeof state.platform.portalPasswordCredentialService.issueInitialPasswordCredential, "function");
    assert.equal(typeof state.platform.userPortalAuth.verifyPasswordAndMaybeChallenge, "function");

    state.platform.controlStore.createAccount({
      id: "acct_portal_state_1",
      ownerRef: "portal_user_state_1",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    state.platform.portalPasswordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_state_1",
      plainPassword: "synthetic-password",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_state_1"
    });

    const issued = state.platform.portalHumanChallenges.issueChallenge({ scope: "portal_login" });
    assert.equal(issued.challenge.type, "math");

    const result = state.platform.userPortalAuth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_state_1",
      plainPassword: "synthetic-password"
    });
    assert.equal(result.session.authMethod, "password");
    assert.equal(result.session.accountId, "acct_portal_state_1");
    assert.doesNotMatch(JSON.stringify(result), /synthetic-password|scrypt\$v=1/);
  } finally {
    state?.subscriptions?.repository?.close?.();
    state?.platform?.controlStore?.close?.();
    state?.subscriptions?.close?.();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("createRuntimeState verifies TOTP second factor for portal password login", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-totp-wiring-"));
  const now = "2026-06-06T00:00:00.000Z";
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_ROUTES_ENABLED: "true",
        USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true"
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      userPortalNowFn: () => now,
      autoStartHttpProxy: false
    });

    state.platform.controlStore.createAccount({
      id: "acct_portal_totp_state_1",
      ownerRef: "portal_user_totp_state_1",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    state.platform.portalPasswordCredentialService.issueInitialPasswordCredential({
      accountId: "acct_portal_totp_state_1",
      plainPassword: "synthetic-password",
      issuedByRef: "operator_safe_ref",
      approvalRef: "approval_portal_totp_state_1"
    });
    state.platform.controlStore.createPortalTotpCredential({
      id: "totp_portal_state_1",
      accountId: "acct_portal_totp_state_1",
      encryptedTotpSecret: "enc:JBSWY3DPEHPK3PXP",
      status: "active",
      failureCount: 0,
      enrolledAt: now,
      updatedAt: now
    });

    const challenge = state.platform.userPortalAuth.verifyPasswordAndMaybeChallenge({
      accountId: "acct_portal_totp_state_1",
      plainPassword: "synthetic-password"
    });
    assert.equal(challenge.result.status, "second_factor_required");
    assert.deepEqual(challenge.result.availableFactors, ["totp"]);

    const completed = state.platform.userPortalAuth.completeSecondFactor({
      challengeRef: challenge.result.challengeRef,
      factor: "totp",
      code: "049557"
    });
    assert.equal(completed.session.authMethod, "totp");
    assert.equal(completed.session.accountId, "acct_portal_totp_state_1");
  } finally {
    state?.close();
    removeTempDir(dir);
  }
});

test("createRuntimeState wires env-gated edge credential lifecycle services", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-wiring-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeAdapter: { applyDesiredState: () => ({ ok: true }) },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_001",
      plan: "trial"
    });
    state.platform.portalAccessRequests.markDelivered(request.id, {
      reviewedByRef: "operator_safe_ref",
      entitlementRef: "ent_state_ref",
      accessGrantRef: "grant_state_ref",
      expiresAt: "2026-07-05T00:00:00.000Z"
    });

    const edgeOrders = state.platform.portalAccessRequests.listEdgeCredentialOrders();
    assert.equal(edgeOrders.length, 1);
    assert.equal(edgeOrders[0].edgeChannelRef, "channel-vultr-a-tuic");
    assert.equal(edgeOrders[0].edgeCredentialRef, `edgecred_${request.id}`);
    assert.match(edgeOrders[0].edgeMaterialDigest, /^sha256:/);
    assert.equal(existsSync(materialPath), true);
    assert.equal(typeof state.platform.edgeLifecycleService.reconcileOrderLifecycle, "function");
    assert.doesNotMatch(JSON.stringify(state.platform.edgeCredentialMaterialStore.listCredentialMaterialSummaries()), /uuid|password/i);
  } finally {
    state?.close();
    removeTempDir(dir);
  }
});

test("createRuntimeState restores persisted edge orders into lifecycle desired state", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-recovery-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeAdapter: { applyDesiredState: () => ({ ok: true }) },
      autoStartHttpProxy: false
    });

    const now = "2026-06-05T00:00:00.000Z";
    state.platform.controlStore.createAccount({
      id: "acct_edge_restore",
      ownerRef: "portal_user_edge_restore",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.createEntitlement({
      id: "ent_edge_restore",
      accountId: "acct_edge_restore",
      plan: "monthly",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-05T00:00:00.000Z",
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.createIssuanceRequest({
      id: "pareq_edge_restore_001",
      accountId: "acct_edge_restore",
      entitlementId: "ent_edge_restore",
      approvalRef: "approval_edge_restore",
      status: "issued",
      quantity: 1,
      nodeId: "channel-vultr-a-tuic",
      purpose: "portal_access_request",
      requestedByRef: "portal_auto_issuer",
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.linkIssuedSubscription({
      id: "link_edge_restore_001",
      requestId: "pareq_edge_restore_001",
      tenantRef: "tenant_edge_restore_001",
      artifactRef: "artifact_edge_restore_001",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    state.platform.edgeCredentialMaterialStore.putCredentialMaterial({
      credentialRef: "edgecred_pareq_edge_restore_001",
      materialDigest: "sha256:edge_restore_digest",
      material: {
        uuid: "33333333-3333-4333-8333-333333333333",
        password: "edge-restore-password"
      }
    });

    const report = state.platform.edgeLifecycleService.reconcileOrderLifecycle();

    assert.equal(report.ok, true);
    assert.equal(report.summary.addCount, 1);
    assert.equal(report.summary.desiredCount, 1);
    assert.doesNotMatch(JSON.stringify(report), /33333333-3333-4333-8333-333333333333|edge-restore-password/i);
  } finally {
    state?.close();
    removeTempDir(dir);
  }
});

test("createRuntimeState wires env-gated portal auto issuance into order submission", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-auto-issuance-"));
  const proxyConfigPath = join(dir, "protected", "proxy-servers.json");
  let state;

  try {
    mkdirSync(join(dir, "protected"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_aliyun_a_tuic",
          name: "channel-aliyun-a-tuic",
          physicalNodeRef: "aliyun-control-a",
          protocol: "tuic",
          type: "tuic",
          host: "edge.example.test",
          port: 443,
          uuid: "${ALIYUN_TUIC_UUID}",
          password: "${ALIYUN_TUIC_PASSWORD}",
          channelPool: "stable",
          channelRole: "stable",
          status: "online",
          subscriptionEligible: true,
          stableProtocolApproved: true,
          stableProtocolApprovalRef: "aliyun-local-tuic-explicit-restart",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true,
            restart: true
          }
        }
      ]
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        ALIYUN_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
        ALIYUN_TUIC_PASSWORD: "synthetic-tuic-password",
        USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
        USER_PORTAL_AUTO_ISSUANCE_NODE_ID: "channel-aliyun-a-tuic",
        USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT: "5000",
        USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT: "1000"
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_auto_state_1",
      plan: "monthly",
      clientTarget: "clash",
      quantity: 1
    });

    assert.equal(request.status, "delivered");
    assert.equal(request.nextAction, "user_can_use_access");
    assert.equal(request.durationDays, 30);
    assert.equal(request.expiresAt?.startsWith("20"), true);
    assert.equal(typeof request.subscriptionUrl, "string");
    assert.equal(state.subscriptions.store.listTenants()[0].nodeId, "channel-aliyun-a-tuic");
    assert.doesNotMatch(JSON.stringify(request), /11111111-1111-4111-8111-111111111111|synthetic-tuic-password/i);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState resolves auto-issued per-order TUIC artifacts after restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-auto-issuance-durable-tuic-"));
  const proxyConfigPath = join(dir, "protected", "proxy-servers.json");
  const subscriptionDbPath = join(dir, "subscriptions.sqlite");
  const controlDbPath = join(dir, "control.sqlite");
  const materialPath = join(dir, "protected", "edge-material.json");
  let first;
  let second;

  try {
    mkdirSync(join(dir, "protected"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_aliyun_a_tuic",
          name: "channel-aliyun-a-tuic",
          physicalNodeRef: "aliyun-control-a",
          protocol: "tuic",
          type: "tuic",
          host: "edge.example.test",
          port: 443,
          uuid: "${ALIYUN_TUIC_UUID}",
          password: "${ALIYUN_TUIC_PASSWORD}",
          channelPool: "stable",
          channelRole: "stable",
          status: "online",
          subscriptionEligible: true,
          stableProtocolApproved: true,
          stableProtocolApprovalRef: "aliyun-local-tuic-explicit-restart",
          credentialMode: "per-order",
          credentialLifecycle: {
            addCredential: true,
            disableCredential: true,
            rotateCredential: true,
            restart: true
          }
        }
      ]
    }), { mode: 0o600 });

    const env = {
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
      ALIYUN_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
      ALIYUN_TUIC_PASSWORD: "synthetic-tuic-password",
      USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
      USER_PORTAL_EDGE_CHANNEL_REF: "channel-aliyun-a-tuic",
      EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
      USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
      USER_PORTAL_AUTO_ISSUANCE_NODE_ID: "channel-aliyun-a-tuic",
      USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT: "5000",
      USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT: "1000"
    };

    first = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath,
      controlDbPath,
      autoStartHttpProxy: false
    });

    const request = first.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_auto_durable_1",
      plan: "monthly",
      clientTarget: "clash",
      quantity: 1
    });
    const artifactSecret = new URL(request.subscriptionUrl).pathname
      .split("/")
      .at(-1)
      .replace(/\.yaml$/, "");
    first.close();
    first = null;

    second = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath,
      controlDbPath,
      autoStartHttpProxy: false
    });

    const resolved = second.subscriptions.core.resolveSubscriptionArtifact(artifactSecret);

    assert.equal(resolved.ok, true);
    assert.equal(resolved.proxyConfig.servers.length, 1);
    assert.equal(resolved.proxyConfig.servers[0].name, "channel-aliyun-a-tuic");
    assert.notEqual(resolved.proxyConfig.servers[0].uuid, "11111111-1111-4111-8111-111111111111");
    assert.notEqual(resolved.proxyConfig.servers[0].password, "synthetic-tuic-password");
    assert.doesNotMatch(JSON.stringify(resolved), /synthetic-tuic-password/i);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState resolves auto-issued per-order channel bundles after restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-auto-issuance-durable-bundle-"));
  const proxyConfigPath = join(dir, "protected", "proxy-servers.json");
  const subscriptionDbPath = join(dir, "subscriptions.sqlite");
  const controlDbPath = join(dir, "control.sqlite");
  const materialPath = join(dir, "protected", "edge-material.json");
  let first;
  let second;

  try {
    mkdirSync(join(dir, "protected"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_vultr_vless",
          name: "channel-vultr-a-vless-reality-tcp",
          subscriptionBundleRef: "vultr-production-a",
          protocol: "vless",
          type: "vless",
          host: "edge.example.test",
          port: 8443,
          uuid: "${VULTR_VLESS_REALITY_UUID}",
          network: "tcp",
          udp: true,
          tls: true,
          channelPool: "stable",
          status: "online",
          credentialMode: "per-order"
        },
        {
          id: "channel_vultr_hy2",
          name: "channel-vultr-a-hy2",
          subscriptionBundleRef: "vultr-production-a",
          protocol: "hysteria2",
          type: "hysteria2",
          host: "edge.example.test",
          port: 10443,
          password: "${VULTR_HY2_PASSWORD}",
          channelPool: "canary",
          qualityClass: "weak-network",
          status: "online",
          credentialMode: "per-order"
        }
      ]
    }), { mode: 0o600 });

    const env = {
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
      VULTR_VLESS_REALITY_UUID: "11111111-1111-4111-8111-111111111111",
      VULTR_HY2_PASSWORD: "synthetic-hy2-template-password",
      USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
      USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-vless-reality-tcp",
      USER_PORTAL_EDGE_CHANNEL_REFS: "channel-vultr-a-vless-reality-tcp,channel-vultr-a-hy2",
      EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
      USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
      USER_PORTAL_AUTO_ISSUANCE_NODE_ID: "channel-vultr-a-vless-reality-tcp",
      USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: "channel-vultr-a-vless-reality-tcp,channel-vultr-a-hy2",
      USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT: "5000",
      USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT: "1000"
    };

    first = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath,
      controlDbPath,
      autoStartHttpProxy: false
    });

    const request = first.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_auto_bundle_1",
      plan: "monthly",
      clientTarget: "clash",
      quantity: 1
    });
    const artifactSecret = new URL(request.subscriptionUrl).pathname
      .split("/")
      .at(-1)
      .replace(/\.yaml$/, "");
    first.close();
    first = null;

    second = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath,
      controlDbPath,
      autoStartHttpProxy: false
    });

    const resolved = second.subscriptions.core.resolveSubscriptionArtifact(artifactSecret);

    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.proxyConfig.servers.map((server) => server.name), [
      "channel-vultr-a-vless-reality-tcp",
      "channel-vultr-a-hy2"
    ]);
    assert.notEqual(resolved.proxyConfig.servers[0].uuid, "11111111-1111-4111-8111-111111111111");
    assert.notEqual(resolved.proxyConfig.servers[1].password, "synthetic-hy2-template-password");
    assert.doesNotMatch(JSON.stringify(resolved), /synthetic-hy2-template-password/i);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState withholds remote data-plane channels until matching applied receipts exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-remote-receipt-gate-"));
  const proxyConfigPath = join(dir, "protected", "proxy-servers.json");
  const subscriptionDbPath = join(dir, "subscriptions.sqlite");
  const controlDbPath = join(dir, "control.sqlite");
  const materialPath = join(dir, "protected", "edge-material.json");
  const channels = [
    "channel-vultr-a-vless-reality-tcp",
    "channel-vultr-a-hy2",
    "channel-vultr-a-tuic",
    "channel-sgp-a-vless-reality-tcp",
    "channel-sgp-a-hy2",
    "channel-sgp-a-tuic"
  ];
  const sgpChannels = channels.filter((channel) => channel.startsWith("channel-sgp-"));
  let first;
  let second;

  function serverForChannel(channel) {
    const isHy2 = channel.includes("hy2");
    const isTuic = channel.includes("tuic");
    return {
      id: channel.replaceAll("-", "_"),
      name: channel,
      subscriptionBundleRef: "vultr-production-a",
      physicalNodeRef: channel.startsWith("channel-sgp-") ? "vultr-sgp-a" : "vultr-japan-a",
      protocol: isHy2 ? "hysteria2" : isTuic ? "tuic" : "vless",
      type: isHy2 ? "hysteria2" : isTuic ? "tuic" : "vless",
      host: channel.startsWith("channel-sgp-") ? "sgp.example.test" : "jp.example.test",
      port: isHy2 ? 10443 : isTuic ? 443 : 8443,
      ...(isHy2 ? { password: channel.startsWith("channel-sgp-") ? "${SGP_HY2_PASSWORD}" : "${VULTR_HY2_PASSWORD}" } : {}),
      ...(isTuic ? {
        uuid: channel.startsWith("channel-sgp-") ? "${SGP_TUIC_UUID}" : "${VULTR_TUIC_UUID}",
        password: channel.startsWith("channel-sgp-") ? "${SGP_TUIC_PASSWORD}" : "${VULTR_TUIC_PASSWORD}"
      } : {}),
      ...(!isHy2 && !isTuic ? {
        uuid: channel.startsWith("channel-sgp-") ? "${SGP_VLESS_REALITY_UUID}" : "${VULTR_VLESS_REALITY_UUID}"
      } : {}),
      ...(channel.startsWith("channel-sgp-") ? { runtimeAdapter: "remote-data-plane-handoff" } : {}),
      credentialMode: "per-order",
      status: "online",
      subscriptionEligible: true
    };
  }

  try {
    mkdirSync(join(dir, "protected"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: channels.map(serverForChannel)
    }), { mode: 0o600 });

    const env = {
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
      VULTR_VLESS_REALITY_UUID: "11111111-1111-4111-8111-111111111111",
      VULTR_HY2_PASSWORD: "synthetic-vultr-hy2-template-password",
      VULTR_TUIC_UUID: "22222222-2222-4222-8222-222222222222",
      VULTR_TUIC_PASSWORD: "synthetic-vultr-tuic-template-password",
      SGP_VLESS_REALITY_UUID: "33333333-3333-4333-8333-333333333333",
      SGP_HY2_PASSWORD: "synthetic-sgp-hy2-template-password",
      SGP_TUIC_UUID: "44444444-4444-4444-8444-444444444444",
      SGP_TUIC_PASSWORD: "synthetic-sgp-tuic-template-password",
      USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
      USER_PORTAL_EDGE_CHANNEL_REF: channels[0],
      USER_PORTAL_EDGE_CHANNEL_REFS: channels.join(","),
      EDGE_CREDENTIAL_CHANNEL_REFS: channels.join(","),
      EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
      USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
      USER_PORTAL_AUTO_ISSUANCE_NODE_ID: channels[0],
      USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: channels.join(","),
      USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT: "5000",
      USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT: "1000"
    };

    first = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath,
      controlDbPath,
      autoStartHttpProxy: false
    });

    const request = first.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_remote_receipt_gate_1",
      plan: "monthly",
      clientTarget: "clash",
      quantity: 1
    });
    const artifactSecret = new URL(request.subscriptionUrl).pathname
      .split("/")
      .at(-1)
      .replace(/\.yaml$/, "");
    first.close();
    first = null;

    second = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env,
      subscriptionDbPath,
      controlDbPath,
      autoStartHttpProxy: false
    });

    const withoutReceipts = second.subscriptions.core.resolveSubscriptionArtifact(artifactSecret);
    assert.equal(withoutReceipts.ok, true);
    assert.deepEqual(withoutReceipts.proxyConfig.servers.map((server) => server.name), channels.slice(0, 3));

    const staleDesired = second.platform.controlStore.getLatestEdgeDesiredStateForChannel(sgpChannels[0], {
      nodeRef: "vultr-sgp-a",
      channelRefs: [sgpChannels[0]]
    });
    second.platform.controlStore.recordEdgeApplyReceipt({
      id: "edge_receipt_stale_sgp_vless",
      channelRef: sgpChannels[0],
      desiredStateRef: `${staleDesired.desiredStateRef}_stale`,
      status: "applied",
      actionCounts: { add: staleDesired.edgeCredentialRefs.length },
      configTestOk: true,
      serviceActive: true,
      listenerUdp443: true,
      appliedAt: "2026-06-11T00:00:00.000Z",
      createdAt: "2026-06-11T00:00:00.000Z"
    });

    const withStaleReceipt = second.subscriptions.core.resolveSubscriptionArtifact(artifactSecret);
    assert.equal(withStaleReceipt.ok, true);
    assert.deepEqual(withStaleReceipt.proxyConfig.servers.map((server) => server.name), channels.slice(0, 3));

    for (const [index, channel] of sgpChannels.entries()) {
      const desiredState = second.platform.controlStore.getLatestEdgeDesiredStateForChannel(channel, {
        nodeRef: "vultr-sgp-a",
        channelRefs: [channel]
      });
      assert.equal(typeof desiredState?.desiredStateRef, "string");
      second.platform.controlStore.recordEdgeApplyReceipt({
        id: `edge_receipt_matching_sgp_${index + 1}`,
        channelRef: channel,
        desiredStateRef: desiredState.desiredStateRef,
        status: "applied",
        actionCounts: { add: desiredState.edgeCredentialRefs.length },
        configTestOk: true,
        serviceActive: true,
        listenerUdp443: true,
        appliedAt: `2026-06-11T00:0${index + 1}:00.000Z`,
        createdAt: `2026-06-11T00:0${index + 1}:00.000Z`
      });
    }

    const withFreshReceipts = second.subscriptions.core.resolveSubscriptionArtifact(artifactSecret);
    assert.equal(withFreshReceipts.ok, true);
    assert.deepEqual(withFreshReceipts.proxyConfig.servers.map((server) => server.name), channels);
    assert.doesNotMatch(JSON.stringify(withFreshReceipts), /synthetic-sgp-hy2-template-password|synthetic-sgp-tuic-template-password/i);
  } finally {
    first?.close();
    second?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState wires env-gated Mihomo TUIC host adapter for edge lifecycle apply", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-host-wiring-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  const activeConfigPath = join(dir, "mihomo", "config.yaml");
  const candidateConfigPath = join(dir, "mihomo", "config.candidate.yaml");
  const backupDir = join(dir, "mihomo", "backups");
  const commandCalls = [];
  let state;

  try {
    mkdirSync(join(dir, "mihomo"), { recursive: true });
    writeFileSync(activeConfigPath, "listeners: []\n", { mode: 0o600 });
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        EDGE_CREDENTIAL_RUNTIME_ADAPTER: "mihomo-tuic-explicit-restart",
        EDGE_MIHOMO_ACTIVE_CONFIG_PATH: activeConfigPath,
        EDGE_MIHOMO_CANDIDATE_CONFIG_PATH: candidateConfigPath,
        EDGE_MIHOMO_BACKUP_DIR: backupDir,
        EDGE_MIHOMO_TUIC_CERTIFICATE_PATH: "/etc/mihomo/server.crt",
        EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH: "/etc/mihomo/server.key"
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeCommandRunner(command, args) {
        commandCalls.push([command, ...args]);
        if (command === "mihomo") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "udp UNCONN 0 0 0.0.0.0:443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_host_001",
      plan: "trial"
    });
    const delivered = state.platform.portalAccessRequests.markDelivered(request.id, {
      reviewedByRef: "operator_safe_ref",
      entitlementRef: "ent_state_host_ref",
      accessGrantRef: "grant_state_host_ref",
      expiresAt: "2026-07-05T00:00:00.000Z"
    });

    assert.equal(delivered.safety.noRuntimeMutation, false);
    assert.equal(delivered.safety.noProductionMutation, false);
    assert.deepEqual(commandCalls.map((call) => call[0]), ["mihomo", "systemctl", "systemctl", "ss"]);
    const activeConfig = readFileSync(activeConfigPath, "utf8");
    assert.match(activeConfig, /^listeners:/m);
    assert.match(activeConfig, /type: tuic/);
    assert.match(activeConfig, /users:/);
    assert.equal(existsSync(candidateConfigPath), true);
    assert.equal(existsSync(backupDir), true);
    assert.doesNotMatch(JSON.stringify(delivered), /uuid|password|server\.key|config\.candidate|backups/i);
  } finally {
    state?.close();
    removeTempDir(dir);
  }
});

test("createRuntimeState wires env-gated Sing-box SS host adapter for edge lifecycle apply", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-sing-box-wiring-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  const activeConfigPath = join(dir, "sing-box", "config.json");
  const candidateConfigPath = join(dir, "sing-box", "config.candidate.json");
  const backupDir = join(dir, "sing-box", "backups");
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const commandCalls = [];
  let state;

  try {
    mkdirSync(join(dir, "sing-box"), { recursive: true });
    writeFileSync(activeConfigPath, "{}\n", { mode: 0o600 });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          name: "channel-vultr-a-ss-tcp",
          protocol: "shadowsocks",
          type: "shadowsocks",
          host: "ss.example.test",
          port: 18388,
          cipher: "2022-blake3-aes-256-gcm",
          password: "synthetic-server-password",
          status: "online"
        }
      ]
    }));
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-ss-tcp",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        EDGE_CREDENTIAL_RUNTIME_ADAPTER: "sing-box-ss-explicit-restart",
        EDGE_SING_BOX_ACTIVE_CONFIG_PATH: activeConfigPath,
        EDGE_SING_BOX_CANDIDATE_CONFIG_PATH: candidateConfigPath,
        EDGE_SING_BOX_BACKUP_DIR: backupDir,
        EDGE_SING_BOX_BINARY: "sing-box",
        EDGE_SING_BOX_SS_PORT: "18388",
        EDGE_SING_BOX_SS_SERVER_PASSWORD: "synthetic-server-password"
      }),
      proxyConfigPath,
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeCommandRunner(command, args) {
        commandCalls.push([command, ...args]);
        if (command === "sing-box") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 0.0.0.0:18388 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_sing_box_001",
      plan: "trial"
    });
    const delivered = state.platform.portalAccessRequests.markDelivered(request.id, {
      reviewedByRef: "operator_safe_ref",
      entitlementRef: "ent_state_sing_box_ref",
      accessGrantRef: "grant_state_sing_box_ref",
      expiresAt: "2026-07-05T00:00:00.000Z"
    });

    assert.equal(delivered.safety.noRuntimeMutation, false);
    assert.equal(delivered.safety.noProductionMutation, false);
    assert.deepEqual(commandCalls.map((call) => call[0]), ["sing-box", "systemctl", "systemctl", "ss"]);
    const activeConfig = JSON.parse(readFileSync(activeConfigPath, "utf8"));
    assert.equal(activeConfig.inbounds[0].type, "shadowsocks");
    assert.equal(activeConfig.inbounds[0].tag, "channel-vultr-a-ss-tcp");
    assert.equal(activeConfig.inbounds[0].users.length, 1);
    assert.equal(existsSync(candidateConfigPath), true);
    assert.equal(existsSync(backupDir), true);
    assert.doesNotMatch(JSON.stringify(delivered), /uuid|password|config\.candidate|backups/i);
  } finally {
    state?.close();
    removeTempDir(dir);
  }
});

test("createRuntimeState wires env-gated Xray VLESS Reality host adapter for edge lifecycle apply", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-xray-wiring-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  const activeConfigPath = join(dir, "xray", "config.json");
  const candidateConfigPath = join(dir, "xray", "config.candidate.json");
  const backupDir = join(dir, "xray", "backups");
  const commandCalls = [];
  let state;

  try {
    mkdirSync(join(dir, "xray"), { recursive: true });
    writeFileSync(activeConfigPath, "{}\n", { mode: 0o600 });
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-vless-reality-tcp",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        EDGE_CREDENTIAL_RUNTIME_ADAPTER: "xray-vless-reality-explicit-restart",
        EDGE_XRAY_ACTIVE_CONFIG_PATH: activeConfigPath,
        EDGE_XRAY_CANDIDATE_CONFIG_PATH: candidateConfigPath,
        EDGE_XRAY_BACKUP_DIR: backupDir,
        EDGE_XRAY_BINARY: "xray",
        EDGE_XRAY_VLESS_PORT: "443",
        EDGE_XRAY_VLESS_DEST: "www.example.com:443",
        EDGE_XRAY_VLESS_SERVER_NAMES: "www.example.com",
        EDGE_XRAY_VLESS_REALITY_PRIVATE_KEY: "synthetic-private-key",
        EDGE_XRAY_VLESS_SHORT_IDS: "abcd1234"
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeCommandRunner(command, args) {
        commandCalls.push([command, ...args]);
        if (command === "xray") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 0.0.0.0:443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_xray_001",
      plan: "trial"
    });
    const delivered = state.platform.portalAccessRequests.markDelivered(request.id, {
      reviewedByRef: "operator_safe_ref",
      entitlementRef: "ent_state_xray_ref",
      accessGrantRef: "grant_state_xray_ref",
      expiresAt: "2026-07-05T00:00:00.000Z"
    });

    assert.equal(delivered.safety.noRuntimeMutation, false);
    assert.equal(delivered.safety.noProductionMutation, false);
    assert.deepEqual(commandCalls.map((call) => call[0]), ["xray", "systemctl", "systemctl", "ss"]);
    const activeConfig = JSON.parse(readFileSync(activeConfigPath, "utf8"));
    assert.equal(activeConfig.inbounds[0].protocol, "vless");
    assert.equal(activeConfig.inbounds[0].tag, "channel-vultr-a-vless-reality-tcp");
    assert.equal(activeConfig.inbounds[0].settings.clients.length, 1);
    assert.equal(existsSync(candidateConfigPath), true);
    assert.equal(existsSync(backupDir), true);
    assert.doesNotMatch(JSON.stringify(delivered), /uuid|password|synthetic-private-key|config\.candidate|backups/i);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState wires env-gated Hysteria2 host adapter for edge lifecycle apply", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-hy2-wiring-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  const activeConfigPath = join(dir, "hysteria2", "config.yaml");
  const candidateConfigPath = join(dir, "hysteria2", "config.candidate.yaml");
  const backupDir = join(dir, "hysteria2", "backups");
  const commandCalls = [];
  let state;

  try {
    mkdirSync(join(dir, "hysteria2"), { recursive: true });
    writeFileSync(activeConfigPath, "listen: :443\n", { mode: 0o600 });
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: runtimeEnv({
        CONSOLE_TOKEN: "secret",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-hy2",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        EDGE_CREDENTIAL_RUNTIME_ADAPTER: "hysteria2-explicit-restart",
        EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH: activeConfigPath,
        EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH: candidateConfigPath,
        EDGE_HYSTERIA2_BACKUP_DIR: backupDir,
        EDGE_HYSTERIA2_BINARY: "hysteria",
        EDGE_HYSTERIA2_LISTEN: ":443",
        EDGE_HYSTERIA2_CERTIFICATE_PATH: "/etc/letsencrypt/live/example/fullchain.pem",
        EDGE_HYSTERIA2_PRIVATE_KEY_PATH: "/etc/letsencrypt/live/example/privkey.pem",
        EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN: "127.0.0.1:26080",
        EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET: "synthetic-stats-secret"
      }),
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeCommandRunner(command, args) {
        commandCalls.push([command, ...args]);
        if (command === "hysteria") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "UNCONN 0 0 0.0.0.0:443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_hy2_001",
      plan: "trial"
    });
    const delivered = state.platform.portalAccessRequests.markDelivered(request.id, {
      reviewedByRef: "operator_safe_ref",
      entitlementRef: "ent_state_hy2_ref",
      accessGrantRef: "grant_state_hy2_ref",
      expiresAt: "2026-07-05T00:00:00.000Z"
    });

    assert.equal(delivered.safety.noRuntimeMutation, false);
    assert.equal(delivered.safety.noProductionMutation, false);
    assert.deepEqual(commandCalls.map((call) => call[0]), ["hysteria", "systemctl", "systemctl", "ss"]);
    const activeConfig = readFileSync(activeConfigPath, "utf8");
    assert.match(activeConfig, /^auth:\n  type: userpass\n  userpass:/m);
    assert.match(activeConfig, /edgecred_pareq_/);
    assert.match(activeConfig, /^trafficStats:/m);
    assert.equal(existsSync(candidateConfigPath), true);
    assert.equal(existsSync(backupDir), true);
    assert.doesNotMatch(JSON.stringify(delivered), /uuid|password|synthetic-stats-secret|config\.candidate|backups/i);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState fans out edge lifecycle apply to every configured runtime channel", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-fanout-wiring-"));
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const materialPath = join(dir, "protected", "edge-material.json");
  const xrayActiveConfigPath = join(dir, "xray", "config.json");
  const xrayCandidateConfigPath = join(dir, "xray", "config.candidate.json");
  const xrayBackupDir = join(dir, "xray", "backups");
  const hy2ActiveConfigPath = join(dir, "hysteria2", "config.yaml");
  const hy2CandidateConfigPath = join(dir, "hysteria2", "config.candidate.yaml");
  const hy2BackupDir = join(dir, "hysteria2", "backups");
  const tuicActiveConfigPath = join(dir, "mihomo", "config.yaml");
  const tuicCandidateConfigPath = join(dir, "mihomo", "config.candidate.yaml");
  const tuicBackupDir = join(dir, "mihomo", "backups");
  const commandCalls = [];
  let state;

  try {
    mkdirSync(join(dir, "xray"), { recursive: true });
    mkdirSync(join(dir, "hysteria2"), { recursive: true });
    mkdirSync(join(dir, "mihomo"), { recursive: true });
    writeFileSync(xrayActiveConfigPath, "{}\n", { mode: 0o600 });
    writeFileSync(hy2ActiveConfigPath, "listen: :10443\n", { mode: 0o600 });
    writeFileSync(tuicActiveConfigPath, "listeners: []\n", { mode: 0o600 });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_vultr_vless",
          name: "channel-vultr-a-vless-reality-tcp",
          protocol: "vless",
          type: "vless",
          host: "edge.example.test",
          port: 8443,
          uuid: "${VULTR_VLESS_REALITY_UUID}",
          network: "tcp",
          tls: true,
          realityOpts: {
            publicKey: "${VULTR_VLESS_REALITY_PUBLIC_KEY}",
            shortId: "${VULTR_VLESS_REALITY_SHORT_ID}"
          },
          runtimeAdapter: "xray-vless-reality-explicit-restart",
          credentialMode: "per-order",
          status: "online"
        },
        {
          id: "channel_vultr_hy2",
          name: "channel-vultr-a-hy2",
          protocol: "hysteria2",
          type: "hysteria2",
          host: "edge.example.test",
          port: 10443,
          password: "${VULTR_HY2_PASSWORD}",
          runtimeAdapter: "hysteria2-explicit-restart",
          credentialMode: "per-order",
          status: "online"
        },
        {
          id: "channel_vultr_tuic",
          name: "channel-vultr-a-tuic",
          protocol: "tuic",
          type: "tuic",
          host: "edge.example.test",
          port: 443,
          uuid: "${VULTR_TUIC_UUID}",
          password: "${VULTR_TUIC_PASSWORD}",
          runtimeAdapter: "mihomo-tuic-explicit-restart",
          credentialMode: "per-order",
          status: "online"
        }
      ]
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-vless-reality-tcp",
        USER_PORTAL_EDGE_CHANNEL_REFS: "channel-vultr-a-vless-reality-tcp,channel-vultr-a-hy2,channel-vultr-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        VULTR_VLESS_REALITY_UUID: "11111111-1111-4111-8111-111111111111",
        VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
        VULTR_VLESS_REALITY_SHORT_ID: "abcd1234",
        VULTR_HY2_PASSWORD: "synthetic-hy2-password",
        VULTR_TUIC_UUID: "22222222-2222-4222-8222-222222222222",
        VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
        EDGE_XRAY_ACTIVE_CONFIG_PATH: xrayActiveConfigPath,
        EDGE_XRAY_CANDIDATE_CONFIG_PATH: xrayCandidateConfigPath,
        EDGE_XRAY_BACKUP_DIR: xrayBackupDir,
        EDGE_XRAY_BINARY: "xray",
        EDGE_XRAY_VLESS_PORT: "8443",
        EDGE_XRAY_VLESS_DEST: "www.example.com:443",
        EDGE_XRAY_VLESS_SERVER_NAMES: "www.example.com",
        EDGE_XRAY_VLESS_REALITY_PRIVATE_KEY: "synthetic-private-key",
        EDGE_XRAY_VLESS_SHORT_IDS: "abcd1234",
        EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH: hy2ActiveConfigPath,
        EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH: hy2CandidateConfigPath,
        EDGE_HYSTERIA2_BACKUP_DIR: hy2BackupDir,
        EDGE_HYSTERIA2_BINARY: "hysteria",
        EDGE_HYSTERIA2_LISTEN: ":10443",
        EDGE_HYSTERIA2_CERTIFICATE_PATH: "/etc/letsencrypt/live/example/fullchain.pem",
        EDGE_HYSTERIA2_PRIVATE_KEY_PATH: "/etc/letsencrypt/live/example/privkey.pem",
        EDGE_HYSTERIA2_SNIFF_ENABLED: "true",
        EDGE_HYSTERIA2_SNIFF_REWRITE_DOMAIN: "true",
        EDGE_HYSTERIA2_SNIFF_TCP_PORTS: "80,443,8000-9000",
        EDGE_HYSTERIA2_SNIFF_UDP_PORTS: "all",
        EDGE_HYSTERIA2_OUTBOUND_MODE: "4",
        EDGE_HYSTERIA2_BANDWIDTH_UP: "80 mbps",
        EDGE_HYSTERIA2_BANDWIDTH_DOWN: "120 mbps",
        EDGE_HYSTERIA2_IGNORE_CLIENT_BANDWIDTH: "true",
        EDGE_HYSTERIA2_CONGESTION_TYPE: "bbr",
        EDGE_HYSTERIA2_CONGESTION_BBR_PROFILE: "aggressive",
        EDGE_HYSTERIA2_QUIC_INIT_STREAM_RECEIVE_WINDOW: "26843545",
        EDGE_HYSTERIA2_QUIC_MAX_STREAM_RECEIVE_WINDOW: "26843545",
        EDGE_HYSTERIA2_QUIC_INIT_CONN_RECEIVE_WINDOW: "67108864",
        EDGE_HYSTERIA2_QUIC_MAX_CONN_RECEIVE_WINDOW: "67108864",
        EDGE_HYSTERIA2_QUIC_MAX_IDLE_TIMEOUT: "45s",
        EDGE_HYSTERIA2_QUIC_MAX_INCOMING_STREAMS: "1024",
        EDGE_HYSTERIA2_QUIC_DISABLE_PATH_MTU_DISCOVERY: "true",
        EDGE_HYSTERIA2_UDP_IDLE_TIMEOUT: "45s",
        EDGE_MIHOMO_ACTIVE_CONFIG_PATH: tuicActiveConfigPath,
        EDGE_MIHOMO_CANDIDATE_CONFIG_PATH: tuicCandidateConfigPath,
        EDGE_MIHOMO_BACKUP_DIR: tuicBackupDir,
        EDGE_MIHOMO_TUIC_PORT: "443",
        EDGE_MIHOMO_TUIC_CERTIFICATE_PATH: "/etc/mihomo/server.crt",
        EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH: "/etc/mihomo/server.key",
        USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
        USER_PORTAL_AUTO_ISSUANCE_NODE_ID: "channel-vultr-a-vless-reality-tcp",
        USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: "channel-vultr-a-vless-reality-tcp,channel-vultr-a-hy2,channel-vultr-a-tuic"
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeCommandRunner(command, args) {
        commandCalls.push([command, ...args]);
        if (["xray", "hysteria", "mihomo"].includes(command)) return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") {
          return {
            exitCode: 0,
            stdout: [
              "LISTEN 0 4096 0.0.0.0:8443 0.0.0.0:*",
              "UNCONN 0 0 0.0.0.0:10443 0.0.0.0:*",
              "udp UNCONN 0 0 0.0.0.0:443 0.0.0.0:*"
            ].join("\n")
          };
        }
        return { exitCode: 1 };
      },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_fanout_001",
      plan: "trial"
    });

    assert.equal(request.safety.noRuntimeMutation, false);
    assert.deepEqual(
      commandCalls.filter((call) => ["xray", "hysteria", "mihomo"].includes(call[0])).map((call) => call[0]),
      ["xray", "hysteria", "mihomo"]
    );
    assert.equal(JSON.parse(readFileSync(xrayActiveConfigPath, "utf8")).inbounds[0].settings.clients.length, 1);
    const xrayClient = JSON.parse(readFileSync(xrayActiveConfigPath, "utf8")).inbounds[0].settings.clients[0];
    assert.equal(xrayClient.email, `edgecred_${request.id}_channel-vultr-a-vless-reality-tcp`);
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), /edgecred_pareq_/);
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), new RegExp(`edgecred_${request.id}_channel-vultr-a-hy2`));
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), /^sniff:\n  enable: true\n  rewriteDomain: true\n  tcpPorts: "80,443,8000-9000"\n  udpPorts: "all"/m);
    assert.match(
      readFileSync(hy2ActiveConfigPath, "utf8"),
      /^outbounds:\n  - name: direct\n    type: direct\n    direct:\n      mode: 4/m
    );
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), /^bandwidth:\n  up: "80 mbps"\n  down: "120 mbps"/m);
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), /^ignoreClientBandwidth: true/m);
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), /^congestion:\n  type: "bbr"\n  bbrProfile: "aggressive"/m);
    assert.match(
      readFileSync(hy2ActiveConfigPath, "utf8"),
      /^quic:\n  initStreamReceiveWindow: 26843545\n  maxStreamReceiveWindow: 26843545\n  initConnReceiveWindow: 67108864\n  maxConnReceiveWindow: 67108864\n  maxIdleTimeout: "45s"\n  maxIncomingStreams: 1024\n  disablePathMTUDiscovery: true/m
    );
    assert.match(readFileSync(hy2ActiveConfigPath, "utf8"), /^udpIdleTimeout: "45s"/m);
    assert.match(readFileSync(tuicActiveConfigPath, "utf8"), /users:/);
    assert.doesNotMatch(JSON.stringify(request), /uuid|password|synthetic-private-key|server\.key|privkey/i);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState merges stale user portal channel env with credential channel refs", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-channel-merge-"));
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const materialPath = join(dir, "protected", "edge-material.json");
  const handoffDir = join(dir, "handoff");
  const channels = [
    "channel-vultr-a-vless-reality-tcp",
    "channel-vultr-a-hy2",
    "channel-vultr-a-tuic",
    "channel-sgp-a-vless-reality-tcp",
    "channel-sgp-a-hy2",
    "channel-sgp-a-tuic"
  ];
  let state;

  try {
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: channels.map((channel) => ({
        id: channel.replaceAll("-", "_"),
        name: channel,
        protocol: channel.includes("hy2") ? "hysteria2" : channel.includes("tuic") ? "tuic" : "vless",
        type: channel.includes("hy2") ? "hysteria2" : channel.includes("tuic") ? "tuic" : "vless",
        host: "edge.example.test",
        port: channel.includes("hy2") ? 10443 : channel.includes("tuic") ? 443 : 8443,
        ...(channel.includes("hy2") ? { password: "synthetic-hy2-password" } : {}),
        ...(channel.includes("tuic") ? {
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "synthetic-tuic-password"
        } : {}),
        ...(!channel.includes("hy2") && !channel.includes("tuic") ? {
          uuid: "22222222-2222-4222-8222-222222222222"
        } : {}),
        runtimeAdapter: "remote-data-plane-handoff",
        credentialMode: "per-order",
        status: "online"
      }))
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: channels[0],
        USER_PORTAL_EDGE_CHANNEL_REFS: channels.slice(0, 4).join(","),
        EDGE_CREDENTIAL_CHANNEL_REFS: channels.join(","),
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_DATA_PLANE_HANDOFF_DIR: handoffDir,
        USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
        USER_PORTAL_AUTO_ISSUANCE_NODE_ID: channels[0],
        USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: channels.slice(0, 3).join(",")
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      autoStartHttpProxy: false
    });

    state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_merge_001",
      plan: "monthly"
    });

    assert.deepEqual(
      state.platform.portalAccessRequests.listEdgeCredentialOrders().map((order) => order.edgeChannelRef),
      channels
    );
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState rejects production auto issuance channel refs that are not present in the proxy config", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-channel-filter-"));
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const materialPath = join(dir, "protected", "edge-material.json");
  const handoffDir = join(dir, "handoff");
  const liveChannels = [
    "channel-vultr-a-vless-reality-tcp",
    "channel-vultr-a-hy2",
    "channel-vultr-a-tuic"
  ];
  const staleChannels = [
    "channel-sgp-a-vless-reality-tcp",
    "channel-sgp-a-hy2",
    "channel-sgp-a-tuic"
  ];
  const allChannels = [...liveChannels, ...staleChannels];
  let state;

  try {
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: liveChannels.map((channel) => ({
        id: channel.replaceAll("-", "_"),
        name: channel,
        protocol: channel.includes("hy2") ? "hysteria2" : channel.includes("tuic") ? "tuic" : "vless",
        type: channel.includes("hy2") ? "hysteria2" : channel.includes("tuic") ? "tuic" : "vless",
        host: "edge.example.test",
        port: channel.includes("hy2") ? 10443 : channel.includes("tuic") ? 443 : 8443,
        ...(channel.includes("hy2") ? { password: "synthetic-hy2-password" } : {}),
        ...(channel.includes("tuic") ? {
          uuid: "11111111-1111-4111-8111-111111111111",
          password: "synthetic-tuic-password"
        } : {}),
        ...(!channel.includes("hy2") && !channel.includes("tuic") ? {
          uuid: "22222222-2222-4222-8222-222222222222"
        } : {}),
        runtimeAdapter: "remote-data-plane-handoff",
        credentialMode: "per-order",
        status: "online"
      }))
    }), { mode: 0o600 });

    assert.throws(() => {
      state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: liveChannels[0],
        USER_PORTAL_EDGE_CHANNEL_REFS: allChannels.join(","),
        EDGE_CREDENTIAL_CHANNEL_REFS: allChannels.join(","),
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_DATA_PLANE_HANDOFF_DIR: handoffDir,
        USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
        USER_PORTAL_AUTO_ISSUANCE_NODE_ID: liveChannels[0],
        USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: allChannels.join(",")
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      autoStartHttpProxy: false
      });
    }, {
      code: "validation_error",
      message: /USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS contains refs not present in proxy config: channel-sgp-a-vless-reality-tcp, channel-sgp-a-hy2, channel-sgp-a-tuic/
    });
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState writes remote data-plane lifecycle handoff instead of mutating local host runtime", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-remote-data-plane-handoff-"));
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const materialPath = join(dir, "protected", "edge-material.json");
  const handoffDir = join(dir, "handoff");
  const commandCalls = [];
  let state;

  try {
    mkdirSync(join(dir, "protected"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_sgp_hy2",
          name: "channel-sgp-a-hy2",
          physicalNodeRef: "vultr-sgp-a",
          protocol: "hysteria2",
          type: "hysteria2",
          host: "sgp.example.test",
          port: 443,
          password: "${SGP_HY2_PASSWORD}",
          runtimeAdapter: "remote-data-plane-handoff",
          credentialMode: "per-order",
          status: "online"
        }
      ]
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        SGP_HY2_PASSWORD: "synthetic-hy2-template-password",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-sgp-a-hy2",
        USER_PORTAL_EDGE_CHANNEL_REFS: "channel-sgp-a-hy2",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        EDGE_DATA_PLANE_HANDOFF_DIR: handoffDir,
        USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
        USER_PORTAL_AUTO_ISSUANCE_NODE_ID: "channel-sgp-a-hy2",
        USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: "channel-sgp-a-hy2",
        USER_PORTAL_AUTO_ISSUANCE_7D_MONTHLY_LIMIT: "5000",
        USER_PORTAL_AUTO_ISSUANCE_30D_MONTHLY_LIMIT: "1000"
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeRuntimeCommandRunner(command, args) {
        commandCalls.push([command, ...args]);
        return { exitCode: 1 };
      },
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_sgp_remote_001",
      plan: "trial",
      clientTarget: "clash",
      quantity: 1
    });

    assert.equal(request.status, "delivered");
    assert.equal(commandCalls.length, 0);
    const files = readdirSync(handoffDir).filter((file) => file.endsWith(".json"));
    assert.equal(files.length, 1);
    const handoff = JSON.parse(readFileSync(join(handoffDir, files[0]), "utf8"));
    assert.equal(handoff.type, "gccgw_remote_data_plane_credential_handoff");
    assert.equal(handoff.channelRef, "channel-sgp-a-hy2");
    assert.equal(handoff.physicalNodeRef, "vultr-sgp-a");
    assert.equal(handoff.runtime, "hysteria2");
    assert.equal(handoff.mutation, false);
    assert.equal(handoff.nextAction, "apply_on_data_plane_node");
    assert.equal(handoff.actions.length, 1);
    assert.match(handoff.actions[0].credentialRef, /^edgecred_pareq_/);
    assert.doesNotMatch(JSON.stringify(handoff), /synthetic-hy2-template-password|password|uuid|subscriptionUrl|rawConfig/i);
    assert.doesNotMatch(JSON.stringify(request), /synthetic-hy2-template-password|password|uuid|rawConfig/i);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState records runtime usage observations into the control ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-runtime-usage-ledger-"));
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const materialPath = join(dir, "protected", "edge-material.json");
  const xrayActiveConfigPath = join(dir, "xray", "config.json");
  const xrayCandidateConfigPath = join(dir, "xray", "config.candidate.json");
  const xrayBackupDir = join(dir, "xray", "backups");
  const hy2ActiveConfigPath = join(dir, "hysteria2", "config.yaml");
  const hy2CandidateConfigPath = join(dir, "hysteria2", "config.candidate.yaml");
  const hy2BackupDir = join(dir, "hysteria2", "backups");
  let state;

  try {
    mkdirSync(join(dir, "xray"), { recursive: true });
    mkdirSync(join(dir, "hysteria2"), { recursive: true });
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_vultr_vless",
          name: "channel-vultr-a-vless-reality-tcp",
          protocol: "vless",
          type: "vless",
          host: "edge.example.test",
          port: 8443,
          uuid: "${VULTR_VLESS_REALITY_UUID}",
          network: "tcp",
          tls: true,
          realityOpts: {
            publicKey: "${VULTR_VLESS_REALITY_PUBLIC_KEY}",
            shortId: "${VULTR_VLESS_REALITY_SHORT_ID}"
          },
          runtimeAdapter: "xray-vless-reality-explicit-restart",
          credentialMode: "per-order",
          status: "online"
        },
        {
          id: "channel_vultr_hy2",
          name: "channel-vultr-a-hy2",
          protocol: "hysteria2",
          type: "hysteria2",
          host: "edge.example.test",
          port: 10443,
          password: "${VULTR_HY2_PASSWORD}",
          runtimeAdapter: "hysteria2-explicit-restart",
          credentialMode: "per-order",
          status: "online"
        }
      ]
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-vultr-a-vless-reality-tcp",
        USER_PORTAL_EDGE_CHANNEL_REFS: "channel-vultr-a-vless-reality-tcp,channel-vultr-a-hy2",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        VULTR_VLESS_REALITY_UUID: "11111111-1111-4111-8111-111111111111",
        VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
        VULTR_VLESS_REALITY_SHORT_ID: "abcd1234",
        VULTR_HY2_PASSWORD: "synthetic-hy2-password",
        EDGE_XRAY_ACTIVE_CONFIG_PATH: xrayActiveConfigPath,
        EDGE_XRAY_CANDIDATE_CONFIG_PATH: xrayCandidateConfigPath,
        EDGE_XRAY_BACKUP_DIR: xrayBackupDir,
        EDGE_XRAY_BINARY: "xray",
        EDGE_XRAY_VLESS_PORT: "8443",
        EDGE_XRAY_VLESS_DEST: "www.example.com:443",
        EDGE_XRAY_VLESS_SERVER_NAMES: "www.example.com",
        EDGE_XRAY_VLESS_REALITY_PRIVATE_KEY: "synthetic-private-key",
        EDGE_XRAY_VLESS_SHORT_IDS: "abcd1234",
        EDGE_HYSTERIA2_ACTIVE_CONFIG_PATH: hy2ActiveConfigPath,
        EDGE_HYSTERIA2_CANDIDATE_CONFIG_PATH: hy2CandidateConfigPath,
        EDGE_HYSTERIA2_BACKUP_DIR: hy2BackupDir,
        EDGE_HYSTERIA2_BINARY: "hysteria",
        EDGE_HYSTERIA2_LISTEN: ":10443",
        EDGE_HYSTERIA2_CERTIFICATE_PATH: "/etc/letsencrypt/live/example/fullchain.pem",
        EDGE_HYSTERIA2_PRIVATE_KEY_PATH: "/etc/letsencrypt/live/example/privkey.pem",
        USER_PORTAL_AUTO_ISSUANCE_ENABLED: "true",
        USER_PORTAL_AUTO_ISSUANCE_NODE_ID: "channel-vultr-a-vless-reality-tcp",
        USER_PORTAL_AUTO_ISSUANCE_CHANNEL_REFS: "channel-vultr-a-vless-reality-tcp,channel-vultr-a-hy2"
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      edgeUsageCollectors: [
        {
          channelRef: "channel-vultr-a-hy2",
          collect: async () => ({
            ok: true,
            status: "collected",
            sourceRef: "hysteria2_traffic_stats",
            channelRef: "channel-vultr-a-hy2",
            observations: [
              {
                sourceRef: "hysteria2_traffic_stats",
                channelRef: "channel-vultr-a-hy2",
                edgeCredentialRef: "edgecred_pending",
                observedAt: "2026-06-07T00:05:00.000Z",
                intervalStartedAt: "2026-06-07T00:00:00.000Z",
                intervalEndedAt: "2026-06-07T00:05:00.000Z",
                uploadBytes: 100,
                downloadBytes: 200
              }
            ],
            blockers: [],
            safety: {
              noRawRuntimePayload: true,
              noSecretMaterialReturned: true
            }
          })
        }
      ],
      autoStartHttpProxy: false
    });

    const request = state.platform.portalAccessRequests.submitRequest({
      portalUserRef: "portal_user_state_usage_001",
      plan: "trial"
    });
    const artifactSecret = new URL(request.subscriptionUrl).pathname
      .split("/")
      .at(-1)
      .replace(/\.yaml$/, "");
    const rendered = state.subscriptions.core.resolveSubscriptionArtifact(artifactSecret);
    assert.equal(rendered.ok, true);
    assert.deepEqual(rendered.proxyConfig.servers.map((server) => server.name), [
      "channel-vultr-a-vless-reality-tcp",
      "channel-vultr-a-hy2"
    ]);
    state.platform.edgeUsageCollectors[0].collect = async () => ({
      ok: true,
      status: "collected",
      sourceRef: "hysteria2_traffic_stats",
      channelRef: "channel-vultr-a-hy2",
      observations: [
        {
          sourceRef: "hysteria2_traffic_stats",
          channelRef: "channel-vultr-a-hy2",
          edgeCredentialRef: `edgecred_${request.id}_channel-vultr-a-hy2`,
          observedAt: "2026-06-07T00:05:00.000Z",
          intervalStartedAt: "2026-06-07T00:00:00.000Z",
          intervalEndedAt: "2026-06-07T00:05:00.000Z",
          uploadBytes: 100,
          downloadBytes: 200
        }
      ],
      blockers: [],
      safety: {
        noRawRuntimePayload: true,
        noSecretMaterialReturned: true
      }
    });

    const usage = await state.platform.edgeUsageAccounting.collectAndRecord({
      since: "2026-06-07T00:00:00.000Z"
    });

    assert.equal(usage.ok, true);
    assert.equal(usage.observationCount, 1);
    assert.equal(usage.recordedCount, 1);
    assert.equal(usage.insertedCount, 1);
    assert.equal(usage.unresolvedCount, 0);
    const rollup = state.platform.controlStore.getUsageRollupByEdgeCredentialRef(
      `edgecred_${request.id}_channel-vultr-a-hy2`
    );
    assert.equal(rollup.totalBytes, 300);
    assert.equal(rollup.channelRef, "channel-vultr-a-hy2");
    const monitor = buildSubscriptionUsageMonitor({
      controlStore: state.platform.controlStore,
      subscriptionCore: state.subscriptions.core,
      filters: { accountId: "portal_user_state_usage_001" },
      now: "2026-06-07T01:00:00.000Z"
    });
    assert.equal(monitor.items.length, 1);
    assert.equal(monitor.items[0].portalUserRef, "portal_user_state_usage_001");
    assert.equal(monitor.items[0].issuanceRequestId, request.id);
    assert.equal(monitor.items[0].usedBytes, 300);
    assert.deepEqual(monitor.items[0].channelUsages, [
      {
        channelRef: "channel-vultr-a-hy2",
        usedBytes: 300,
        uploadBytes: 100,
        downloadBytes: 200,
        lastObservedAt: "2026-06-07T00:05:00.000Z"
      }
    ]);
    assert.equal(monitor.series.aggregates.byOrder[request.id], 300);
    assert.equal(monitor.series.aggregates.byAccount.portal_user_state_usage_001, 300);
    assert.equal(monitor.series.aggregates.byChannel["channel-vultr-a-hy2"], 300);
    assert.equal(monitor.safety.orderLevelRows, true);
    assert.doesNotMatch(JSON.stringify(usage), /password|token|subscriptionUrl|rawConfig/i);
    assert.doesNotMatch(JSON.stringify(monitor), /https?:\/\/|password|token=|bearer|rawConfig|edgecred_/i);
  } finally {
    state?.subscriptions?.repository?.close?.();
    state?.platform?.controlStore?.close?.();
    state?.subscriptions?.close?.();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // Windows can keep SQLite temp handles briefly after close; do not mask
      // the usage accounting assertion result.
    }
  }
});

test("createRuntimeState wires env-gated Hy2 usage collector into the control ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-env-usage-ledger-"));
  const proxyConfigPath = join(dir, "proxy-servers.json");
  const edgeCredentialRef = "edgecred_pareq_env_usage_001_channel-vultr-a-hy2";
  const readerCalls = [];
  let state;

  try {
    writeFileSync(proxyConfigPath, JSON.stringify({
      servers: [
        {
          id: "channel_vultr_hy2",
          name: "channel-vultr-a-hy2",
          protocol: "hysteria2",
          type: "hysteria2",
          host: "edge.example.test",
          port: 10443,
          password: "synthetic-hy2-password",
          runtimeAdapter: "hysteria2-explicit-restart",
          credentialMode: "per-order",
          status: "online"
        }
      ]
    }), { mode: 0o600 });

    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_PROXY_CONFIG_PATH: proxyConfigPath,
        EDGE_CREDENTIAL_CHANNEL_REFS: "channel-vultr-a-hy2",
        EDGE_USAGE_COLLECTOR_ENABLED: "true",
        EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN: "127.0.0.1:26080",
        EDGE_HYSTERIA2_TRAFFIC_STATS_SECRET: "synthetic-stats-secret"
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
      hysteria2TrafficReader: async (input) => {
        readerCalls.push(input);
        return {
          [edgeCredentialRef]: {
            tx: 321,
            rx: 654
          }
        };
      },
      autoStartHttpProxy: false
    });

    const now = "2026-06-08T00:00:00.000Z";
    state.platform.controlStore.createAccount({
      id: "acct_env_usage_001",
      ownerRef: "portal_user_env_usage_001",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.createEntitlement({
      id: "ent_env_usage_001",
      accountId: "acct_env_usage_001",
      plan: "monthly",
      status: "active",
      validFrom: now,
      validUntil: "2026-07-08T00:00:00.000Z",
      trafficLimitBytes: 10_000,
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.createIssuanceRequest({
      id: "pareq_env_usage_001",
      accountId: "acct_env_usage_001",
      entitlementId: "ent_env_usage_001",
      approvalRef: "approval_env_usage_001",
      status: "issued",
      quantity: 1,
      nodeId: "channel-vultr-a-hy2",
      purpose: "portal_auto_issuance",
      requestedByRef: "portal_auto_issuer",
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.linkIssuedSubscription({
      id: "link_env_usage_001",
      requestId: "pareq_env_usage_001",
      tenantRef: "tenant_env_usage_001",
      artifactRef: "artifact_env_usage_001",
      status: "active",
      createdAt: now,
      updatedAt: now
    });
    state.platform.controlStore.upsertPortalAccessRequest({
      id: "pareq_env_usage_001",
      portalUserRef: "portal_user_env_usage_001",
      plan: "monthly",
      clientTarget: "clash",
      durationDays: 30,
      quantity: 1,
      status: "delivered",
      nextAction: "user_can_use_access",
      noteProvided: false,
      priorTrialState: "not_applicable",
      submittedAt: now,
      updatedAt: now,
      reviewedAt: now,
      reviewedByRef: "portal_auto_issuer",
      expiresAt: "2026-07-08T00:00:00.000Z",
      validUntil: "2026-07-08T00:00:00.000Z",
      entitlementRef: "ent_env_usage_001",
      accessGrantRef: "grant_env_usage_001",
      tenantId: "tenant_env_usage_001",
      artifactId: "artifact_env_usage_001",
      subscriptionUrl: "https://sub.example.test/sub/a/visible-once.yaml",
      edgeChannelRef: "channel-vultr-a-hy2",
      edgeCredentialRef,
      edgeMaterialDigest: "sha256:env_usage_digest"
    });

    assert.equal(state.platform.edgeUsageCollectors.length, 1);
    assert.ok(state.platform.edgeUsageAccounting);
    const usage = await state.platform.edgeUsageAccounting.collectAndRecord({
      since: "2026-06-08T00:00:00.000Z"
    });

    assert.equal(usage.ok, true);
    assert.equal(usage.observationCount, 1);
    assert.equal(usage.recordedCount, 1);
    assert.equal(usage.insertedCount, 1);
    assert.equal(usage.unresolvedCount, 0);
    assert.deepEqual(readerCalls, [
      {
        channelRef: "channel-vultr-a-hy2",
        clear: true
      }
    ]);
    const rollup = state.platform.controlStore.getUsageRollupByEdgeCredentialRef(edgeCredentialRef);
    assert.equal(rollup.totalBytes, 975);
    assert.equal(rollup.uploadBytes, 321);
    assert.equal(rollup.downloadBytes, 654);
    assert.equal(rollup.requestId, "pareq_env_usage_001");
    assert.doesNotMatch(JSON.stringify(usage), /synthetic-stats-secret|visible-once|password|token|subscriptionUrl|rawConfig/i);
  } finally {
    state?.subscriptions?.repository?.close?.();
    state?.platform?.controlStore?.close?.();
    state?.subscriptions?.close?.();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // Windows can keep SQLite temp handles briefly after close; do not mask
      // the usage accounting assertion result.
    }
  }
});
