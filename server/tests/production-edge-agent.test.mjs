import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createProductionEdgeAgentRunner,
  normalizeProductionEdgeAgentConfig
} from "../../agent/production-edge-agent.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";

const NOW = "2026-06-11T12:00:00.000Z";

function scopeCredentialDigest(edgeCredentialRef) {
  return `sha256:${createHash("sha256")
    .update(`gccgw:scoped-tombstone-lineage:v1:${edgeCredentialRef}`)
    .digest("hex")}`;
}

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

test("production edge agent posts backup basenames and rejects a path", async () => {
  const backupRef = "config.yaml.2026_06_08T12_00_00_000Z.bak";
  const posted = [];
  const runner = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    applyEnabled: true,
    dryRun: false,
    fetchImpl: async (url, options = {}) => {
      if (String(url).endsWith("/api/internal/data-plane-agent/desired-state")) {
        return responseJson(200, {
          type: "gccgw_data_plane_agent_desired_state_response",
          nodeRef: "vultr-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          desiredStates: [desiredState({
            desiredStateRef: "desired_state_channel-sgp-a-hy2_backup",
            generation: "gen_channel_sgp_hy2_backup",
            edgeCredentialRefs: [],
            materialDigests: []
          })],
          summaries: [],
          redacted: true
        });
      }
      if (String(url).endsWith("/api/internal/data-plane-agent/receipts")) {
        posted.push(JSON.parse(options.body));
        return responseJson(201, {
          type: "gccgw_data_plane_receipt_response",
          nodeRef: "vultr-sgp-a",
          channelRef: "channel-sgp-a-hy2",
          generation: "gen_channel_sgp_hy2_backup",
          receiptId: "receipt_backup_001",
          status: "applied",
          redacted: true
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    nowFn: () => new Date(NOW),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async applyDesiredState() {
          return {
            status: "applied",
            backupRef,
            runtimeReceipt: { rollbackRef: "config.yaml.rollback.bak" },
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
  assert.equal(posted.length, 1);
  assert.equal(posted[0].backupRef, backupRef);
  assert.equal(posted[0].rollbackRef, "config.yaml.rollback.bak");
  assert.equal(result.receipts[0].backupRef, undefined);

  const rejected = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    applyEnabled: true,
    dryRun: false,
    fetchImpl: async (url) => {
      if (String(url).endsWith("/api/internal/data-plane-agent/desired-state")) {
        return responseJson(200, {
          type: "gccgw_data_plane_agent_desired_state_response",
          nodeRef: "vultr-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          desiredStates: [desiredState({
            desiredStateRef: "desired_state_channel-sgp-a-hy2_bad",
            generation: "gen_channel_sgp_hy2_bad",
            edgeCredentialRefs: [],
            materialDigests: []
          })],
          summaries: [],
          redacted: true
        });
      }
      throw new Error("invalid backup ref must not be posted");
    },
    nowFn: () => new Date(NOW),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async applyDesiredState() {
          return {
            status: "applied",
            backupRef: "backup/config.yaml",
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
  await assert.rejects(() => rejected.runOnce(), (error) => error.code === "validation_error");
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

  const tombstoneCalls = [];
  const revokedCredentialRef = "edgecred_revoked_hy2_001";
  const activeACredentialRef = "edgecred_active_a_hy2_001";
  const activeBCredentialRef = "edgecred_active_b_hy2_001";
  const revokedScopeDigest = scopeCredentialDigest(revokedCredentialRef);
  const activeMaterialDigests = [
    {
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: activeACredentialRef,
      digest: "sha256:dddddddddddddddd"
    },
    {
      channelRef: "channel-sgp-a-hy2",
      edgeCredentialRef: activeBCredentialRef,
      digest: "sha256:eeeeeeeeeeeeeeee"
    }
  ];
  const scopedTombstone = desiredState({
    desiredStateRef: "desired_scoped_tombstone_agent_001",
    generation: "gen_scoped_tombstone_agent_001",
    edgeCredentialRefs: [activeACredentialRef, activeBCredentialRef],
    materialDigests: activeMaterialDigests,
    scopedTombstone: {
      sourceDesiredStateRef: "desired_state_hy2_authoritative_001",
      sourceGeneration: "gen_hy2_authoritative_001",
      credentialDigests: [revokedScopeDigest]
    }
  });
  const authoritative = desiredState({
    desiredStateRef: "desired_state_hy2_authoritative_001",
    generation: "gen_hy2_authoritative_001",
    edgeCredentialRefs: [activeACredentialRef, activeBCredentialRef],
    materialDigests: activeMaterialDigests
  });
  let reconciliationCallCount = 0;
  const tombstoneRunner = createProductionEdgeAgentRunner({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "vultr-sgp-a",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: [activeACredentialRef, revokedCredentialRef],
    applyEnabled: true,
    dryRun: false,
    fetchImpl: async (url, options = {}) => {
      tombstoneCalls.push({ url: String(url), options });
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/desired-state")) {
        assert.equal(options.headers["X-GCCGW-Agent-Version"], "1.2");
        assert.deepEqual(
          options.headers["X-GCCGW-Agent-Capabilities"].split(",").sort(),
          ["empty_desired_state", "scoped_tombstone_lineage", "tombstone_reconcile"]
        );
        const filter = parsed.searchParams.get("edgeCredentialRefs");
        if (filter === `${activeACredentialRef},${revokedCredentialRef}`) {
          return responseJson(200, {
            type: "gccgw_data_plane_agent_desired_state_response",
            nodeRef: "vultr-sgp-a",
            channelRefs: ["channel-sgp-a-hy2"],
            desiredStates: [scopedTombstone],
            summaries: [],
            redacted: true
          });
        }
        assert.equal(filter, null);
        return responseJson(200, {
          type: "gccgw_data_plane_agent_desired_state_response",
          nodeRef: "vultr-sgp-a",
          channelRefs: ["channel-sgp-a-hy2"],
          desiredStates: [authoritative],
          summaries: [],
          redacted: true
        });
      }
      if (parsed.pathname.endsWith("/materials")) {
        const body = JSON.parse(options.body);
        assert.equal(body.desiredStateRef, authoritative.desiredStateRef);
        assert.deepEqual(body.edgeCredentialRefs, [activeACredentialRef, activeBCredentialRef]);
        return responseJson(200, {
          type: "gccgw_data_plane_material_response",
          nodeRef: "vultr-sgp-a",
          desiredStateRef: authoritative.desiredStateRef,
          mode: "material",
          records: [
            {
              edgeCredentialRef: activeACredentialRef,
              materialDigest: "sha256:dddddddddddddddd",
              material: {
                uuid: "22222222-2222-4222-8222-222222222222",
                password: "synthetic-active-a-material"
              }
            },
            {
              edgeCredentialRef: activeBCredentialRef,
              materialDigest: "sha256:eeeeeeeeeeeeeeee",
              material: {
                uuid: "33333333-3333-4333-8333-333333333333",
                password: "synthetic-active-b-material"
              }
            }
          ],
          sensitive: true
        });
      }
      if (parsed.pathname.endsWith("/receipts")) {
        const body = JSON.parse(options.body);
        assert.equal(body.desiredStateRef, scopedTombstone.desiredStateRef);
        assert.equal(body.generation, scopedTombstone.generation);
        assert.equal(body.credentialCount, 2);
        assert.deepEqual(body.materialDigests, activeMaterialDigests.map((entry) => entry.digest));
        assert.deepEqual(body.scopedTombstone, scopedTombstone.scopedTombstone);
        assert.doesNotMatch(JSON.stringify(body), new RegExp(revokedCredentialRef));
        return responseJson(201, {
          type: "gccgw_data_plane_receipt_response",
          nodeRef: "vultr-sgp-a",
          channelRef: "channel-sgp-a-hy2",
          generation: scopedTombstone.generation,
          receiptId: "receipt_scoped_tombstone_001",
          status: "applied",
          redacted: true
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    nowFn: () => new Date(NOW),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        runtime: "hysteria2",
        async applyDesiredState() {
          assert.fail("scoped tombstones must use exact credential reconciliation");
        },
        async applyCredentialReconciliation(payload) {
          reconciliationCallCount += 1;
          assert.deepEqual(payload.summary, {
            addCount: 2,
            revokeCount: 1,
            rotateCount: 0,
            unchangedCount: 0
          });
          assert.deepEqual(payload.actions, [
            { action: "add", credentialRef: activeACredentialRef },
            { action: "add", credentialRef: activeBCredentialRef },
            { action: "revoke", credentialRef: revokedCredentialRef }
          ]);
          return {
            status: "applied",
            configTest: true,
            serviceActive: true,
            listenerPresent: true
          };
        }
      }
    },
    materialStore: createEdgeCredentialMaterialStore()
  });

  const tombstoneResult = await tombstoneRunner.runOnce();
  assert.equal(tombstoneResult.ok, true);
  assert.equal(tombstoneResult.receiptCount, 1);
  assert.equal(tombstoneResult.materialCount, 2);
  assert.equal(tombstoneCalls.length, 4);
  assert.equal(reconciliationCallCount, 1);

  const invalidMixedStates = [
    {
      name: "missing authoritative active B",
      state: {
        ...scopedTombstone,
        edgeCredentialRefs: [activeACredentialRef],
        materialDigests: [activeMaterialDigests[0]]
      },
      code: "scoped_tombstone_state_mismatch"
    },
    {
      name: "mismatched authoritative material",
      state: {
        ...scopedTombstone,
        materialDigests: [
          activeMaterialDigests[0],
          {
            ...activeMaterialDigests[1],
            digest: "sha256:ffffffffffffffff"
          }
        ]
      },
      code: "scoped_tombstone_state_mismatch"
    },
    {
      name: "stale authoritative source identity",
      state: {
        ...scopedTombstone,
        scopedTombstone: {
          ...scopedTombstone.scopedTombstone,
          sourceGeneration: "gen_stale_authoritative"
        }
      },
      code: "scoped_tombstone_authority_mismatch"
    },
    {
      name: "unselected revoked lineage",
      state: {
        ...scopedTombstone,
        scopedTombstone: {
          ...scopedTombstone.scopedTombstone,
          credentialDigests: [
            revokedScopeDigest,
            scopeCredentialDigest("edgecred_unselected_revoked_hy2_001")
          ].sort((a, b) => a.localeCompare(b))
        }
      },
      code: "scoped_tombstone_scope_mismatch"
    }
  ];

  for (const invalid of invalidMixedStates) {
    let mutationCount = 0;
    let receiptPostCount = 0;
    const invalidRunner = createProductionEdgeAgentRunner({
      baseUrl: "http://127.0.0.1:3456",
      token: "node-agent-token",
      nodeRef: "vultr-sgp-a",
      channelRefs: ["channel-sgp-a-hy2"],
      edgeCredentialRefs: [activeACredentialRef, revokedCredentialRef],
      applyEnabled: true,
      dryRun: false,
      fetchImpl: async (url, options = {}) => {
        const parsed = new URL(String(url));
        if (parsed.pathname.endsWith("/desired-state")) {
          const filtered = parsed.searchParams.has("edgeCredentialRefs");
          return responseJson(200, {
            type: "gccgw_data_plane_agent_desired_state_response",
            nodeRef: "vultr-sgp-a",
            channelRefs: ["channel-sgp-a-hy2"],
            desiredStates: [filtered ? invalid.state : authoritative],
            summaries: [],
            redacted: true
          });
        }
        if (parsed.pathname.endsWith("/materials")) {
          return responseJson(200, {
            type: "gccgw_data_plane_material_response",
            nodeRef: "vultr-sgp-a",
            desiredStateRef: authoritative.desiredStateRef,
            mode: "material",
            records: [
              {
                edgeCredentialRef: activeACredentialRef,
                materialDigest: activeMaterialDigests[0].digest,
                material: { password: "synthetic-invalid-a-material" }
              },
              {
                edgeCredentialRef: activeBCredentialRef,
                materialDigest: activeMaterialDigests[1].digest,
                material: { password: "synthetic-invalid-b-material" }
              }
            ],
            sensitive: true
          });
        }
        if (parsed.pathname.endsWith("/receipts")) {
          receiptPostCount += 1;
          return responseJson(201, {
            type: "gccgw_data_plane_receipt_response",
            nodeRef: "vultr-sgp-a",
            channelRef: "channel-sgp-a-hy2",
            generation: invalid.state.generation,
            receiptId: "receipt_invalid_scoped_state",
            status: "applied",
            redacted: true
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      },
      nowFn: () => new Date(NOW),
      runtimeAdapters: {
        "channel-sgp-a-hy2": {
          runtime: "hysteria2",
          async applyDesiredState() {
            assert.fail("invalid scoped lineage must not use desired-state apply");
          },
          async applyCredentialReconciliation() {
            mutationCount += 1;
            return {
              status: "applied",
              configTest: true,
              serviceActive: true,
              listenerPresent: true
            };
          }
        }
      },
      materialStore: createEdgeCredentialMaterialStore()
    });

    await assert.rejects(
      () => invalidRunner.runOnce(),
      (error) => error.code === invalid.code,
      invalid.name
    );
    assert.equal(mutationCount, 0, invalid.name);
    assert.equal(receiptPostCount, 0, invalid.name);
  }
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
