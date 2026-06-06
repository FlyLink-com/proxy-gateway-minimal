import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";

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

test("createRuntimeState exposes expected ports and services", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-state-"));
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
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
      env: { SS_PASSWORD: "pw" },
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
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
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
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        PUBLIC_SUBSCRIPTION_BASE_URL: "  https://subscriptions.example.test///  "
      },
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
    state?.close();
    rmSync(dir, { recursive: true, force: true });
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
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        SUBSCRIPTION_CONTROL_DB_PATH: configuredControlPath
      },
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
    env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
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
      env: { CONSOLE_TOKEN: "secret", SS_PASSWORD: "pw" },
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
    env: {
      CONSOLE_TOKEN: "secret",
      SS_PASSWORD: "pw",
      ADMIN_ALLOWED_CIDRS: "127.0.0.1/32,10.0.0.0/8",
      TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
      SUB_RATE_LIMIT_WINDOW_MS: "1000",
      SUB_RATE_LIMIT_MAX: "2",
      SUBSCRIPTION_TEMP_LINK_TTL_MINUTES: "30"
    },
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
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_ROUTES_ENABLED: "true",
        USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true"
      },
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
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState verifies TOTP second factor for portal password login", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-portal-totp-wiring-"));
  const now = "2026-06-06T00:00:00.000Z";
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_ROUTES_ENABLED: "true",
        USER_PORTAL_ALLOW_PASSWORD_ONLY_SETUP_SESSION: "true"
      },
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
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState wires env-gated edge credential lifecycle services", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-wiring-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-aliyun-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
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
    assert.equal(edgeOrders[0].edgeChannelRef, "channel-aliyun-a-tuic");
    assert.equal(edgeOrders[0].edgeCredentialRef, `edgecred_${request.id}`);
    assert.match(edgeOrders[0].edgeMaterialDigest, /^sha256:/);
    assert.equal(existsSync(materialPath), true);
    assert.equal(typeof state.platform.edgeLifecycleService.reconcileOrderLifecycle, "function");
    assert.doesNotMatch(JSON.stringify(state.platform.edgeCredentialMaterialStore.listCredentialMaterialSummaries()), /uuid|password/i);
  } finally {
    state?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createRuntimeState restores persisted edge orders into lifecycle desired state", () => {
  const dir = mkdtempSync(join(tmpdir(), "proxy-gateway-edge-recovery-"));
  const materialPath = join(dir, "protected", "edge-material.json");
  let state;

  try {
    state = createRuntimeState({
      rootDir: new URL("../../", import.meta.url),
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-aliyun-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath
      },
      subscriptionDbPath: join(dir, "subscriptions.sqlite"),
      controlDbPath: join(dir, "control.sqlite"),
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
      nodeId: "channel-aliyun-a-tuic",
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
    rmSync(dir, { recursive: true, force: true });
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
      env: {
        CONSOLE_TOKEN: "secret",
        SS_PASSWORD: "pw",
        USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true",
        USER_PORTAL_EDGE_CHANNEL_REF: "channel-aliyun-a-tuic",
        EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
        EDGE_CREDENTIAL_LIFECYCLE_EXECUTE_PRODUCTION_MUTATION: "true",
        EDGE_CREDENTIAL_RUNTIME_ADAPTER: "mihomo-tuic-explicit-restart",
        EDGE_MIHOMO_ACTIVE_CONFIG_PATH: activeConfigPath,
        EDGE_MIHOMO_CANDIDATE_CONFIG_PATH: candidateConfigPath,
        EDGE_MIHOMO_BACKUP_DIR: backupDir,
        EDGE_MIHOMO_TUIC_CERTIFICATE_PATH: "/etc/mihomo/server.crt",
        EDGE_MIHOMO_TUIC_PRIVATE_KEY_PATH: "/etc/mihomo/server.key"
      },
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
    rmSync(dir, { recursive: true, force: true });
  }
});
