import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../app.mjs";
import { createRuntimeState } from "../state.mjs";
import {
  createDataPlaneAgentService,
  hashDataPlaneAgentToken
} from "../services/edge/data-plane-agent-service.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";
import { listen } from "./helpers/listen.mjs";

const VALID_UNTIL = "2026-07-10T00:00:00.000Z";

function desired(overrides = {}) {
  return {
    desiredStateRef: "desired_route_001",
    nodeRef: "node-sgp-a",
    generation: "gen_route_001",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: ["edgecred_route_hy2"],
    materialDigests: [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_route_hy2",
        digest: "sha256:aaaaaaaaaaaaaaaa"
      }
    ],
    validUntil: VALID_UNTIL,
    ...overrides
  };
}

function fakeControlStore(desiredState = desired()) {
  const receipts = [];
  const leases = [];
  const registeredNode = {
    nodeRef: "node-sgp-a",
    physicalNodeRef: "node-sgp-a",
    pool: "private",
    lifecycle: "private-validation",
    status: "active",
    channelRefs: ["channel-sgp-a-hy2"]
  };
  return {
    receipts,
    leases,
    registeredNode,
    getEdgeRegisteredNode(nodeRef) {
      return nodeRef === registeredNode.nodeRef ? registeredNode : null;
    },
    getLatestEdgeDesiredStateForChannel(channelRef) {
      return channelRef === "channel-sgp-a-hy2" ? desiredState : null;
    },
    recordEdgeApplyReceipt(input) {
      const stored = {
        ...input,
        configTestOk: input.configTestOk === true,
        listenerUdp443: input.listenerUdp443 === true,
        serviceActive: input.serviceActive === true
      };
      receipts.push(stored);
      return stored;
    },
    acquireEdgeAgentLease(input) {
      const stored = {
        ...input
      };
      leases.push(stored);
      return stored;
    }
  };
}

function state({ routesEnabled = true, desiredState = desired() } = {}) {
  const controlStore = fakeControlStore(desiredState);
  const credentialMaterialStore = createEdgeCredentialMaterialStore({
    records: [{
      credentialRef: "edgecred_route_hy2",
      materialDigest: "sha256:aaaaaaaaaaaaaaaa",
      material: {
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "synthetic-route-material"
      }
    }]
  });
  const service = createDataPlaneAgentService({
    controlStore,
    credentialMaterialStore,
    nodes: [
      {
        nodeRef: "node-sgp-a",
        channelRefs: ["channel-sgp-a-hy2"],
        tokenSha256: hashDataPlaneAgentToken("node-agent-token")
      }
    ],
    nowFn: () => new Date("2026-06-10T00:00:00.000Z")
  });
  return {
    rootDir: process.cwd(),
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    platform: {
      dataPlaneAgentRoutesEnabled: routesEnabled,
      dataPlaneAgentService: service
    },
    subscriptions: {},
    services: {
      ssLocal: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) },
      httpProxy: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), status: () => ({ running: false }) }
    },
    isPortListening: async () => false,
    _controlStore: controlStore,
    _credentialMaterialStore: credentialMaterialStore
  };
}

function agentHeaders(token = "node-agent-token") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function tombstoneAgentHeaders(token = "node-agent-token") {
  return {
    ...agentHeaders(token),
    "X-GCCGW-Agent-Version": "1.1",
    "X-GCCGW-Agent-Capabilities": "empty_desired_state,tombstone_reconcile"
  };
}

function seedIssuedPortalOrder(store) {
  const now = "2026-06-10T00:00:00.000Z";
  const validUntil = "2099-07-10T00:00:00.000Z";
  store.createAccount({
    id: "acct_agent_route_sqlite_1",
    ownerRef: "portal_user_agent_route_sqlite_1",
    status: "active",
    createdAt: now,
    updatedAt: now,
    metadata: { source: "agent_route_test" }
  });
  store.createEntitlement({
    id: "ent_agent_route_sqlite_1",
    accountId: "acct_agent_route_sqlite_1",
    plan: "monthly",
    status: "active",
    validFrom: now,
    validUntil,
    trafficLimitBytes: 1024,
    createdAt: now,
    updatedAt: now
  });
  store.createIssuanceRequest({
    id: "pareq_agent_route_sqlite_1",
    accountId: "acct_agent_route_sqlite_1",
    entitlementId: "ent_agent_route_sqlite_1",
    approvalRef: "approval_agent_route_sqlite_1",
    status: "issued",
    quantity: 1,
    nodeId: "channel-sgp-a-hy2",
    purpose: "portal_auto_issuance",
    requestedByRef: "portal_auto_issuer",
    createdAt: now,
    updatedAt: now
  });
  store.linkIssuedSubscription({
    id: "link_agent_route_sqlite_1",
    requestId: "pareq_agent_route_sqlite_1",
    tenantRef: "tenant_agent_route_sqlite_1",
    artifactRef: "artifact_agent_route_sqlite_1",
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  store.upsertPortalAccessRequest({
    id: "pareq_agent_route_sqlite_1",
    portalUserRef: "portal_user_agent_route_sqlite_1",
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
    expiresAt: validUntil,
    validUntil,
    entitlementRef: "ent_agent_route_sqlite_1",
    accessGrantRef: "grant_agent_route_sqlite_1",
    tenantId: "tenant_agent_route_sqlite_1",
    artifactId: "artifact_agent_route_sqlite_1",
    edgeCredentials: [
      {
        edgeChannelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_agent_route_sqlite_hy2",
        edgeMaterialDigest: "sha256:aaaaaaaaaaaaaaaa"
      }
    ]
  });
}

test("agent routes are disabled by default and remain behind console auth", async () => {
  const appState = state({ routesEnabled: false });
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const nodeResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: agentHeaders()
    });
    assert.equal(nodeResponse.status, 401);

    const consoleResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: { Authorization: "Bearer console-secret" }
    });
    assert.equal(consoleResponse.status, 404);
  } finally {
    server.close();
  }
});

test("agent routes reject missing, wrong, and console bearer tokens", async () => {
  const appState = state();
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    for (const headers of [
      {},
      { Authorization: "Bearer wrong-token" },
      { Authorization: "Bearer console-secret" }
    ]) {
      const response = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, { headers });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.redacted, true);
      assert.equal(body.error, "unauthorized");
    }
  } finally {
    server.close();
  }
});

test("agent auth middleware does not intercept public portal challenge route", async () => {
  const appState = state();
  appState.platform.userPortalRoutesEnabled = true;
  appState.platform.portalHumanChallenges = createPortalHumanChallengeService({
    nowFn: () => new Date("2026-06-10T00:00:00.000Z")
  });
  appState.platform.portalAccessRequests = {};
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const response = await fetch(`${baseUrl}/api/portal/human-challenges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "portal_login" })
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(typeof body.challenge.challengeRef, "string");
    assert.equal(typeof body.challenge.prompt, "string");
  } finally {
    server.close();
  }
});

test("agent routes reject inactive registry records even when the bearer token is valid", async () => {
  const appState = state();
  appState._controlStore.registeredNode.status = "inactive";
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const response = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: agentHeaders()
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, "node_not_active");
    assert.equal(body.redacted, true);
  } finally {
    server.close();
  }
});

test("desired-state route returns node-scoped redacted payload", async () => {
  const appState = state();
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const response = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: agentHeaders()
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.type, "gccgw_data_plane_agent_desired_state_response");
    assert.equal(body.nodeRef, "node-sgp-a");
    assert.equal(body.desiredStates.length, 1);
    assert.equal(body.summaries.length, 1);
    assert.equal(body.redacted, true);
    assert.doesNotMatch(JSON.stringify(body), /password|privateKey|subscriptionUrl|rawConfig/i);
  } finally {
    server.close();
  }
});

test("desired-state route negotiates revocation tombstones through agent headers", async () => {
  const tombstone = desired({
    desiredStateRef: "desired_route_tombstone_001",
    generation: "gen_route_tombstone_001",
    edgeCredentialRefs: [],
    materialDigests: []
  });
  const appState = state({ desiredState: tombstone });
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const legacyResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: agentHeaders()
    });
    assert.equal(legacyResponse.status, 200);
    const legacy = await legacyResponse.json();
    assert.deepEqual(legacy.desiredStates, []);
    assert.equal(legacy.compatibility.tombstoneReconcile, false);
    assert.equal(legacy.compatibility.blockedDesiredStateCount, 1);

    const compatibleResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: tombstoneAgentHeaders()
    });
    assert.equal(compatibleResponse.status, 200);
    const compatible = await compatibleResponse.json();
    assert.equal(compatible.desiredStates.length, 1);
    assert.deepEqual(compatible.desiredStates[0].edgeCredentialRefs, []);
    assert.equal(compatible.compatibility.tombstoneReconcile, true);
  } finally {
    server.close();
  }
});

test("desired-state route scopes payload by requested edge credential refs", async () => {
  const appState = state();
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const response = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state?edgeCredentialRefs=edgecred_route_hy2`, {
      headers: agentHeaders()
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.desiredStates.length, 1);
    const [desiredState] = body.desiredStates;
    assert.match(desiredState.desiredStateRef, /^desired_scoped_/);
    assert.deepEqual(desiredState.edgeCredentialRefs, ["edgecred_route_hy2"]);
    assert.equal(body.summaries[0].edgeCredentialCount, 1);
    assert.doesNotMatch(JSON.stringify(body), /password|privateKey|subscriptionUrl|rawConfig/i);
  } finally {
    server.close();
  }
});

test("agent routes reject public source IPs even with a valid node token", async () => {
  const appState = state();
  const app = createApp(appState, { clientIpResolver: () => "203.0.113.10" });
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: agentHeaders()
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Forbidden" });
    assert.equal(appState._controlStore.receipts.length, 0);
  } finally {
    server.close();
  }
});

test("receipt route rejects forbidden material and records valid receipts", async () => {
  const appState = state();
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const unsafe = await fetch(`${baseUrl}/api/internal/data-plane-agent/receipts`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        nodeRef: "node-sgp-a",
        generation: "gen_route_001",
        channelRef: "channel-sgp-a-hy2",
        status: "applied",
        configTest: true,
        serviceActive: true,
        listenerPresent: true,
        credentialCount: 1,
        appliedAt: "2026-06-10T00:01:00.000Z",
        diagnostics: { subscriptionUrl: "https://example.invalid/raw" }
      })
    });
    assert.equal(unsafe.status, 400);
    assert.equal((await unsafe.json()).error, "unsafe_agent_payload");

    const valid = await fetch(`${baseUrl}/api/internal/data-plane-agent/receipts`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        nodeRef: "node-sgp-a",
        generation: "gen_route_001",
        channelRef: "channel-sgp-a-hy2",
        status: "applied",
        configTest: true,
        serviceActive: true,
        listenerPresent: true,
        credentialCount: 1,
        appliedAt: "2026-06-10T00:01:00.000Z",
        materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
      })
    });
    assert.equal(valid.status, 201);
    const body = await valid.json();
    assert.equal(body.status, "applied");
    assert.equal(appState._controlStore.receipts.length, 1);
    assert.equal(appState._controlStore.receipts[0].listenerUdp443, true);
  } finally {
    server.close();
  }
});

test("material route is authenticated, scoped, and supports summary plus material modes", async () => {
  const appState = state();
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/internal/data-plane-agent/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeRef: "node-sgp-a",
        desiredStateRef: "desired_route_001",
        edgeCredentialRefs: ["edgecred_route_hy2"],
        mode: "summary"
      })
    });
    assert.equal(unauthenticated.status, 401);

    const summary = await fetch(`${baseUrl}/api/internal/data-plane-agent/materials`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        nodeRef: "node-sgp-a",
        desiredStateRef: "desired_route_001",
        edgeCredentialRefs: ["edgecred_route_hy2"],
        mode: "summary"
      })
    });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.redacted, true);
    assert.deepEqual(summaryBody.records, [{
      edgeCredentialRef: "edgecred_route_hy2",
      materialDigest: "sha256:aaaaaaaaaaaaaaaa",
      hasMaterial: true
    }]);
    assert.doesNotMatch(JSON.stringify(summaryBody), /synthetic-route-material|11111111/i);

    const material = await fetch(`${baseUrl}/api/internal/data-plane-agent/materials`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        nodeRef: "node-sgp-a",
        desiredStateRef: "desired_route_001",
        edgeCredentialRefs: ["edgecred_route_hy2"],
        mode: "material"
      })
    });
    assert.equal(material.status, 200);
    const materialBody = await material.json();
    assert.equal(materialBody.sensitive, true);
    assert.equal(materialBody.records[0].edgeCredentialRef, "edgecred_route_hy2");
    assert.deepEqual(materialBody.records[0].material, {
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "synthetic-route-material"
    });
  } finally {
    server.close();
  }
});

test("lease route records heartbeat without opening portal or admin boundaries", async () => {
  const appState = state();
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const lease = await fetch(`${baseUrl}/api/internal/data-plane-agent/lease`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        channelRef: "channel-sgp-a-hy2",
        agentRef: "agent-sgp-a"
      })
    });
    assert.equal(lease.status, 201);
    assert.equal(appState._controlStore.leases.length, 1);

    const admin = await fetch(`${baseUrl}/api/admin/platform/data-plane-handoff-queue`, {
      headers: agentHeaders()
    });
    assert.equal(admin.status, 401);

    const portal = await fetch(`${baseUrl}/api/portal/access-requests/current?portalUserRef=user_1`, {
      headers: agentHeaders()
    });
    assert.equal(portal.status, 401);
  } finally {
    server.close();
  }
});

test("runtime-wired agent routes use the durable sqlite control store", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "data-plane-agent-runtime-"));
  const proxyConfigPath = join(rootDir, "proxy-servers.json");
  const materialPath = join(rootDir, "protected", "edge-material.json");
  writeFileSync(proxyConfigPath, JSON.stringify({
    servers: [
      {
        name: "channel-sgp-a-hy2",
        protocol: "hysteria2",
        host: "127.0.0.1",
        port: 10443,
        password: "test-only-password"
      }
    ],
    pingHosts: [],
    nginx: {}
  }), "utf8");
  const appState = createRuntimeState({
    rootDir,
    proxyConfigPath,
    env: {
      CONSOLE_TOKEN: "console-secret",
      EDGE_DATA_PLANE_AGENT_ROUTES_ENABLED: "true",
      EDGE_DATA_PLANE_AGENT_NODE_REF: "node-sgp-a",
      EDGE_DATA_PLANE_AGENT_CHANNEL_REFS: "channel-sgp-a-hy2",
      EDGE_DATA_PLANE_AGENT_TOKEN_SHA256: hashDataPlaneAgentToken("node-agent-token"),
      EDGE_CREDENTIAL_MATERIAL_PATH: materialPath,
      SUBSCRIPTION_CONTROL_DB_PATH: join(rootDir, "control.sqlite"),
      SUBSCRIPTION_DB_PATH: join(rootDir, "subscriptions.sqlite")
    },
    autoStartHttpProxy: false
  });
  seedIssuedPortalOrder(appState.platform.controlStore);
  appState.platform.edgeCredentialMaterialStore.putCredentialMaterial({
    credentialRef: "edgecred_agent_route_sqlite_hy2",
    materialDigest: "sha256:aaaaaaaaaaaaaaaa",
    material: {
      uuid: "22222222-2222-4222-8222-222222222222",
      password: "synthetic-runtime-route-material"
    }
  });
  const { server, baseUrl } = await listen(createApp(appState));
  try {
    const desiredResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/desired-state`, {
      headers: agentHeaders()
    });
    assert.equal(desiredResponse.status, 200);
    const desiredBody = await desiredResponse.json();
    assert.equal(desiredBody.desiredStates.length, 1);
    const [desiredState] = desiredBody.desiredStates;
    assert.equal(desiredState.nodeRef, "node-sgp-a");
    assert.deepEqual(desiredState.edgeCredentialRefs, ["edgecred_agent_route_sqlite_hy2"]);

    const materialResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/materials`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        nodeRef: "node-sgp-a",
        desiredStateRef: desiredState.desiredStateRef,
        edgeCredentialRefs: ["edgecred_agent_route_sqlite_hy2"],
        mode: "summary"
      })
    });
    assert.equal(materialResponse.status, 200);
    const materialBody = await materialResponse.json();
    assert.equal(materialBody.records[0].hasMaterial, true);
    assert.doesNotMatch(JSON.stringify(materialBody), /synthetic-runtime-route-material|22222222/i);

    const receiptResponse = await fetch(`${baseUrl}/api/internal/data-plane-agent/receipts`, {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        type: "gccgw_data_plane_apply_receipt",
        nodeRef: "node-sgp-a",
        generation: desiredState.generation,
        channelRef: "channel-sgp-a-hy2",
        status: "applied",
        configTest: true,
        serviceActive: true,
        listenerPresent: true,
        credentialCount: 1,
        appliedAt: "2026-06-10T00:01:00.000Z",
        materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
      })
    });
    assert.equal(receiptResponse.status, 201);
    const receipts = appState.platform.controlStore.listEdgeApplyReceipts({
      channelRef: "channel-sgp-a-hy2"
    });
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].listenerUdp443, true);
  } finally {
    server.close();
    appState.close?.();
    rmSync(rootDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
