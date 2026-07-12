import assert from "node:assert/strict";
import test from "node:test";
import {
  createProductionEdgeAgentRunner,
  normalizeProductionEdgeAgentConfig
} from "../../agent/production-edge-agent.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";

const NOW = "2026-06-11T12:00:00.000Z";

function desiredState(overrides = {}) {
  return {
    type: "gccgw_data_plane_desired_state",
    desiredStateRef: "desired_state_channel-sgp-a-hy2_001",
    nodeRef: "vultr-sgp-a",
    generation: "gen_channel_sgp_hy2_001",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: ["edgecred_safe_hy2_001"],
    materialDigests: [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_safe_hy2_001",
        digest: "sha256:aaaaaaaaaaaaaaaa"
      }
    ],
    validUntil: "2026-07-11T00:00:00.000Z",
    redacted: true,
    ...overrides
  };
}

function responseJson(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    }
  };
}

test("production edge agent pulls desired-state, applies runtime, and posts redacted receipts", async () => {
  const calls = [];
  const applied = [];
  const materialStore = createEdgeCredentialMaterialStore();
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/api/internal/data-plane-agent/desired-state")) {
      assert.equal(options.headers.Authorization, "Bearer node-agent-token");
      return responseJson(200, {
        type: "gccgw_data_plane_agent_desired_state_response",
        nodeRef: "vultr-sgp-a",
        channelRefs: ["channel-sgp-a-hy2"],
        desiredStates: [desiredState()],
        summaries: [],
        redacted: true
      });
    }
    if (String(url).endsWith("/api/internal/data-plane-agent/materials")) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer node-agent-token");
      const body = JSON.parse(options.body);
      assert.equal(body.type, "gccgw_data_plane_material_request");
      assert.equal(body.nodeRef, "vultr-sgp-a");
      assert.equal(body.desiredStateRef, "desired_state_channel-sgp-a-hy2_001");
      assert.deepEqual(body.edgeCredentialRefs, ["edgecred_safe_hy2_001"]);
      assert.equal(body.mode, "material");
      return responseJson(200, {
        type: "gccgw_data_plane_material_response",
        nodeRef: "vultr-sgp-a",
        desiredStateRef: "desired_state_channel-sgp-a-hy2_001",
        mode: "material",
        records: [{
          edgeCredentialRef: "edgecred_safe_hy2_001",
          materialDigest: "sha256:aaaaaaaaaaaaaaaa",
          material: {
            uuid: "11111111-1111-4111-8111-111111111111",
            password: "synthetic-agent-material"
          }
        }],
        sensitive: true
      });
    }
    if (String(url).endsWith("/api/internal/data-plane-agent/receipts")) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer node-agent-token");
      const body = JSON.parse(options.body);
      assert.equal(body.type, "gccgw_data_plane_apply_receipt");
      assert.equal(body.nodeRef, "vultr-sgp-a");
      assert.equal(body.channelRef, "channel-sgp-a-hy2");
      assert.equal(body.generation, "gen_channel_sgp_hy2_001");
      assert.equal(body.status, "applied");
      assert.equal(body.configTest, true);
      assert.equal(body.serviceActive, true);
      assert.equal(body.listenerPresent, true);
      assert.equal(body.credentialCount, 1);
      assert.equal(body.appliedAt, NOW);
      assert.deepEqual(body.materialDigests, ["sha256:aaaaaaaaaaaaaaaa"]);
      assert.doesNotMatch(options.body, /password|privateKey|subscriptionUrl|rawConfig|token/i);
      return responseJson(201, {
        type: "gccgw_data_plane_receipt_response",
        nodeRef: "vultr-sgp-a",
        channelRef: "channel-sgp-a-hy2",
        generation: "gen_channel_sgp_hy2_001",
        receiptId: "receipt_safe_001",
        status: "applied",
        redacted: true
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const runner = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    applyEnabled: true,
    dryRun: false,
    fetchImpl,
    nowFn: () => new Date(NOW),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async applyDesiredState(state) {
          applied.push(state);
          assert.deepEqual(materialStore.resolveCredentialMaterial("edgecred_safe_hy2_001"), {
            uuid: "11111111-1111-4111-8111-111111111111",
            password: "synthetic-agent-material"
          });
          return {
            status: "applied",
            configTest: true,
            serviceActive: true,
            listenerPresent: true,
            credentialCount: state.edgeCredentialRefs.length,
            materialDigests: state.materialDigests.map((item) => item.digest)
          };
        }
      }
    },
    materialStore
  });

  const result = await runner.runOnce();

  assert.equal(result.ok, true);
  assert.equal(result.receiptCount, 1);
  assert.equal(result.appliedCount, 1);
  assert.equal(applied.length, 1);
  assert.equal(calls.filter((call) => String(call.url).endsWith("/desired-state")).length, 1);
  assert.equal(calls.filter((call) => String(call.url).endsWith("/materials")).length, 1);
  assert.equal(calls.filter((call) => String(call.url).endsWith("/receipts")).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /node-agent-token|synthetic-agent-material|11111111|password|privateKey|subscriptionUrl|rawConfig/i);
});

test("production edge agent applies an empty desired-state without requesting credential material", async () => {
  const calls = [];
  const applied = [];
  const emptyState = desiredState({
    desiredStateRef: "desired_state_channel-sgp-a-hy2_empty",
    generation: "gen_channel_sgp_hy2_empty",
    edgeCredentialRefs: [],
    materialDigests: []
  });
  const runner = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    applyEnabled: true,
    dryRun: false,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/api/internal/data-plane-agent/desired-state")) {
        assert.equal(options.headers["X-GCCGW-Agent-Version"], "1.1");
        assert.deepEqual(
          options.headers["X-GCCGW-Agent-Capabilities"].split(",").sort(),
          ["empty_desired_state", "tombstone_reconcile"]
        );
        return responseJson(200, {
          type: "gccgw_data_plane_agent_desired_state_response",
          nodeRef: "vultr-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          desiredStates: [emptyState],
          summaries: [],
          redacted: true
        });
      }
      if (String(url).endsWith("/api/internal/data-plane-agent/materials")) {
        throw new Error("empty desired-state must not request credential material");
      }
      if (String(url).endsWith("/api/internal/data-plane-agent/receipts")) {
        const body = JSON.parse(options.body);
        assert.equal(body.desiredStateRef, "desired_state_channel-sgp-a-hy2_empty");
        assert.equal(body.credentialCount, 0);
        assert.deepEqual(body.materialDigests, []);
        return responseJson(201, {
          type: "gccgw_data_plane_receipt_response",
          nodeRef: "vultr-sgp-a",
          channelRef: "channel-sgp-a-hy2",
          generation: "gen_channel_sgp_hy2_empty",
          receiptId: "receipt_empty_001",
          status: "applied",
          redacted: true
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    nowFn: () => new Date(NOW),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async applyDesiredState(state) {
          applied.push(state);
          return {
            status: "applied",
            configTest: true,
            serviceActive: true,
            listenerPresent: true,
            credentialCount: 0,
            materialDigests: []
          };
        }
      }
    }
  });

  const result = await runner.runOnce();

  assert.equal(result.ok, true);
  assert.equal(result.appliedCount, 1);
  assert.equal(result.materialCount, 0);
  assert.equal(result.receiptCount, 1);
  assert.equal(applied.length, 1);
  assert.equal(calls.some((call) => String(call.url).endsWith("/materials")), false);
});

test("production edge agent dry-run pulls but does not apply or post receipts", async () => {
  const calls = [];
  const runner = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    applyEnabled: true,
    dryRun: true,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      return responseJson(200, {
        type: "gccgw_data_plane_agent_desired_state_response",
        nodeRef: "vultr-sgp-a",
        channelRefs: ["channel-sgp-a-hy2"],
        desiredStates: [desiredState()],
        summaries: [],
        redacted: true
      });
    },
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async applyDesiredState() {
          throw new Error("dry-run must not apply runtime state");
        }
      }
    }
  });

  const result = await runner.runOnce();

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.appliedCount, 0);
  assert.equal(result.receiptCount, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls.some((call) => String(call.url).endsWith("/materials")), false);
});

test("production edge agent scopes desired-state pull and posts scoped receipts", async () => {
  const calls = [];
  const materialStore = createEdgeCredentialMaterialStore();
  const scoped = desiredState({
    desiredStateRef: "desired_scoped_agent_001",
    generation: "gen_scoped_agent_001"
  });
  const runner = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: ["edgecred_safe_hy2_001"],
    applyEnabled: true,
    dryRun: false,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/desired-state")) {
        assert.equal(parsed.searchParams.get("edgeCredentialRefs"), "edgecred_safe_hy2_001");
        return responseJson(200, {
          type: "gccgw_data_plane_agent_desired_state_response",
          nodeRef: "vultr-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          desiredStates: [scoped],
          summaries: [],
          redacted: true
        });
      }
      if (parsed.pathname.endsWith("/materials")) {
        const body = JSON.parse(options.body);
        assert.equal(body.desiredStateRef, "desired_scoped_agent_001");
        assert.deepEqual(body.edgeCredentialRefs, ["edgecred_safe_hy2_001"]);
        return responseJson(200, {
          type: "gccgw_data_plane_material_response",
          nodeRef: "vultr-sgp-a",
          desiredStateRef: "desired_scoped_agent_001",
          mode: "material",
          records: [{
            edgeCredentialRef: "edgecred_safe_hy2_001",
            materialDigest: "sha256:aaaaaaaaaaaaaaaa",
            material: {
              uuid: "11111111-1111-4111-8111-111111111111",
              password: "synthetic-agent-material"
            }
          }],
          sensitive: true
        });
      }
      if (parsed.pathname.endsWith("/receipts")) {
        const body = JSON.parse(options.body);
        assert.equal(body.desiredStateRef, "desired_scoped_agent_001");
        assert.equal(body.generation, "gen_scoped_agent_001");
        return responseJson(201, {
          type: "gccgw_data_plane_receipt_response",
          nodeRef: "vultr-sgp-a",
          channelRef: "channel-sgp-a-hy2",
          generation: "gen_scoped_agent_001",
          receiptId: "receipt_scoped_001",
          status: "applied",
          redacted: true
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    nowFn: () => new Date(NOW),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async applyDesiredState(state) {
          assert.equal(state.desiredStateRef, "desired_scoped_agent_001");
          return {
            status: "applied",
            configTest: true,
            serviceActive: true,
            listenerPresent: true,
            credentialCount: state.edgeCredentialRefs.length,
            materialDigests: state.materialDigests.map((item) => item.digest)
          };
        }
      }
    },
    materialStore
  });

  const result = await runner.runOnce();

  assert.equal(result.ok, true);
  assert.equal(result.receiptCount, 1);
  assert.equal(calls.length, 3);
});

test("production edge agent rejects non-loopback base URL by default", () => {
  assert.throws(
    () => normalizeProductionEdgeAgentConfig({
      baseUrl: "https://example.com",
      token: "node-agent-token",
      nodeRef: "vultr-sgp-a",
      channelRefs: ["channel-sgp-a-hy2"]
    }),
    /baseUrl must be private/
  );
});
