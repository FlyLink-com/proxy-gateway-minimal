import assert from "node:assert/strict";
import test from "node:test";
import { createEdgeAgent } from "../../agent/edge-agent.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";

function desiredState() {
  return {
    nodeRef: "node-sgp-a",
    generation: "gen_agent_001",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: ["edgecred_agent_hy2"],
    materialDigests: [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_agent_hy2",
        digest: "sha256:aaaaaaaaaaaaaaaa"
      }
    ],
    validUntil: "2026-07-10T00:00:00.000Z",
    redacted: true
  };
}

function createHttpClient({ desired = [desiredState()] } = {}) {
  const calls = [];
  const receipts = [];
  const leases = [];
  const httpClient = async (url, options = {}) => {
    calls.push({ url, options });
    if (!options.headers?.Authorization?.startsWith("Bearer ")) {
      throw new Error("missing_authorization");
    }
    if (url.endsWith("/desired-state")) {
      return {
        type: "gccgw_data_plane_agent_desired_state_response",
        nodeRef: "node-sgp-a",
        desiredStates: desired,
        summaries: [],
        redacted: true
      };
    }
    if (url.endsWith("/lease")) {
      const body = JSON.parse(options.body);
      leases.push(body);
      return {
        type: "gccgw_data_plane_lease_response",
        leaseRef: `lease_${body.channelRef}`,
        channelRef: body.channelRef,
        status: "active",
        redacted: true
      };
    }
    if (url.endsWith("/receipts")) {
      const body = JSON.parse(options.body);
      receipts.push(body);
      return {
        type: "gccgw_data_plane_receipt_response",
        channelRef: body.channelRef,
        generation: body.generation,
        status: body.status === "unchanged" ? "applied" : body.status,
        redacted: true
      };
    }
    throw new Error("unexpected_path");
  };
  return { calls, receipts, leases, httpClient };
}

test("dry-run agent pulls desired state, leases channel, invokes adapter, and posts receipt", async () => {
  const http = createHttpClient();
  const adapterCalls = [];
  const agent = createEdgeAgent({
    httpClient: http.httpClient,
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async dryRunDesiredState(input) {
          adapterCalls.push(input);
          return {
            status: "applied",
            configTest: true,
            serviceActive: true,
            listenerPresent: true,
            credentialCount: 1,
            reasonCode: "dry_run_ok",
            materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
          };
        }
      }
    }
  });

  const report = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a",
    agentRef: "agent-sgp-a"
  });

  assert.equal(report.ok, true);
  assert.equal(report.redacted, true);
  assert.equal(report.receiptCount, 1);
  assert.equal(adapterCalls.length, 1);
  assert.equal(http.leases[0].channelRef, "channel-sgp-a-hy2");
  assert.equal(http.receipts[0].status, "applied");
  assert.equal(http.receipts[0].configTest, true);
  assert.doesNotMatch(JSON.stringify(report), /node-agent-token|password|privateKey|subscriptionUrl/i);
});

test("adapter failure posts redacted failed receipt without leaking raw errors", async () => {
  const http = createHttpClient();
  const logs = [];
  const agent = createEdgeAgent({
    httpClient: http.httpClient,
    logger: { warn: (_message, metadata) => logs.push(metadata) },
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        async dryRunDesiredState() {
          throw new Error("raw privateKey leaked in internal adapter error");
        }
      }
    }
  });

  const report = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a"
  });

  assert.equal(report.ok, false);
  assert.equal(http.receipts[0].status, "failed");
  assert.equal(http.receipts[0].reasonCode, "adapter_failed");
  assert.equal(logs[0].reasonCode, "adapter_failed");
  assert.doesNotMatch(JSON.stringify(report), /privateKey|raw/i);
});

test("re-running same desired generation remains idempotent through unchanged receipt", async () => {
  const http = createHttpClient();
  let calls = 0;
  const agent = createEdgeAgent({
    httpClient: http.httpClient,
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {
      "channel-sgp-a-hy2": async () => {
        calls += 1;
        return {
          status: calls === 1 ? "applied" : "unchanged",
          configTest: true,
          serviceActive: true,
          listenerPresent: true,
          credentialCount: 1,
          reasonCode: calls === 1 ? "dry_run_ok" : "generation_unchanged",
          materialDigests: ["sha256:aaaaaaaaaaaaaaaa"]
        };
      }
    }
  });

  const first = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a"
  });
  const second = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a"
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(http.receipts.length, 2);
  assert.equal(http.receipts[1].status, "unchanged");
});

test("missing runtime adapter posts failed receipt instead of mutating runtime", async () => {
  const http = createHttpClient();
  const agent = createEdgeAgent({
    httpClient: http.httpClient,
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {}
  });

  const report = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a"
  });

  assert.equal(report.ok, false);
  assert.equal(http.receipts[0].status, "failed");
  assert.equal(http.receipts[0].reasonCode, "adapter_missing");
});

test("apply mode is fail-closed unless explicitly enabled", async () => {
  const http = createHttpClient();
  const agent = createEdgeAgent({
    httpClient: http.httpClient,
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        applyCredentialReconciliation() {
          throw new Error("must_not_apply");
        }
      }
    }
  });

  await assert.rejects(() => agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a",
    dryRun: false
  }), /apply_disabled/);
  assert.equal(http.receipts.length, 0);
});

test("apply mode refuses to call runtime adapter when protected material is missing", async () => {
  const http = createHttpClient();
  let adapterCalled = false;
  const agent = createEdgeAgent({
    allowApply: true,
    httpClient: http.httpClient,
    materialStore: createEdgeCredentialMaterialStore(),
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        applyCredentialReconciliation() {
          adapterCalled = true;
          throw new Error("must_not_apply_without_material");
        }
      }
    }
  });

  const report = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a",
    dryRun: false
  });

  assert.equal(report.ok, false);
  assert.equal(adapterCalled, false);
  assert.equal(http.receipts[0].status, "failed");
  assert.equal(http.receipts[0].reasonCode, "material_missing");
});

test("apply mode builds reconciliation payload, applies runtime adapter, and posts redacted receipt", async () => {
  const http = createHttpClient();
  const materialStore = createEdgeCredentialMaterialStore();
  materialStore.putCredentialMaterial({
    credentialRef: "edgecred_agent_hy2",
    materialDigest: "sha256:aaaaaaaaaaaaaaaa",
    material: {
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "synthetic-hy2-password"
    }
  });
  const adapterCalls = [];
  const agent = createEdgeAgent({
    allowApply: true,
    httpClient: http.httpClient,
    materialStore,
    nowFn: () => new Date("2026-06-10T00:01:00.000Z"),
    runtimeAdapters: {
      "channel-sgp-a-hy2": {
        applyCredentialReconciliation(payload) {
          adapterCalls.push(payload);
          return {
            status: "applied",
            mutation: true,
            configTest: { ok: true, exitCode: 0 },
            service: { name: "hysteria2.service", active: true, restarted: true },
            listener: { udp443: true },
            appliedAt: "2026-06-10T00:01:00.000Z"
          };
        }
      }
    }
  });

  const report = await agent.runOnce({
    baseUrl: "http://127.0.0.1:3456",
    token: "node-agent-token",
    nodeRef: "node-sgp-a",
    agentRef: "agent-sgp-a",
    dryRun: false
  });

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, false);
  assert.equal(adapterCalls.length, 1);
  assert.equal(adapterCalls[0].runtime, "hysteria2");
  assert.equal(adapterCalls[0].activationSurface, "explicit-restart");
  assert.equal(adapterCalls[0].actions[0].credentialRef, "edgecred_agent_hy2");
  assert.equal(http.receipts[0].status, "applied");
  assert.equal(http.receipts[0].credentialCount, 1);
  assert.doesNotMatch(JSON.stringify(report), /node-agent-token|synthetic-hy2-password|11111111-1111-4111-8111-111111111111|privateKey|subscriptionUrl/i);
});
