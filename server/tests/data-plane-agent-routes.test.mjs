import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import {
  createDataPlaneAgentService,
  hashDataPlaneAgentToken
} from "../services/edge/data-plane-agent-service.mjs";
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
        listenerPresent: input.listenerPresent === true,
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
