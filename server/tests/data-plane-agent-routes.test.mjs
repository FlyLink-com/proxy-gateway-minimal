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
import { createPortalHumanChallengeService } from "../services/platform/portal-human-challenge.mjs";
import { listen } from "./helpers/listen.mjs";

const VALID_UNTIL = "2026-07-10T00:00:00.000Z";

function desired() {
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
    validUntil: VALID_UNTIL
  };
}

function fakeControlStore() {
  const receipts = [];
  const leases = [];
  return {
    receipts,
    leases,
    getLatestEdgeDesiredStateForChannel(channelRef) {
      return channelRef === "channel-sgp-a-hy2" ? desired() : null;
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

function state({ routesEnabled = true } = {}) {
  const controlStore = fakeControlStore();
  const service = createDataPlaneAgentService({
    controlStore,
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
    _controlStore: controlStore
  };
}

function agentHeaders(token = "node-agent-token") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function seedIssuedPortalOrder(store) {
  const now = "2026-06-10T00:00:00.000Z";
  const validUntil = "2026-07-10T00:00:00.000Z";
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
      SUBSCRIPTION_CONTROL_DB_PATH: join(rootDir, "control.sqlite"),
      SUBSCRIPTION_DB_PATH: join(rootDir, "subscriptions.sqlite")
    },
    autoStartHttpProxy: false
  });
  seedIssuedPortalOrder(appState.platform.controlStore);
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
