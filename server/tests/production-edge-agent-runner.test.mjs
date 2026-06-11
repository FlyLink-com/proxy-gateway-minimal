import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProductionEdgeAgentRunner,
  createProductionRuntimeAdapters,
  normalizePrivateAgentBaseUrl
} from "../../agent/production-edge-agent.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";

function desiredState() {
  return {
    nodeRef: "node-sgp-a",
    generation: "gen_agent_prod_001",
    channelRefs: ["channel-sgp-a-hy2"],
    edgeCredentialRefs: ["edgecred_prod_hy2"],
    materialDigests: [
      {
        channelRef: "channel-sgp-a-hy2",
        edgeCredentialRef: "edgecred_prod_hy2",
        digest: "sha256:prodaaaaaaaaaaaa"
      }
    ],
    validUntil: "2026-07-10T00:00:00.000Z",
    redacted: true
  };
}

function createHttpClient({ desired = [desiredState()] } = {}) {
  const receipts = [];
  const leases = [];
  const httpClient = async (url, options = {}) => {
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
        status: body.status,
        redacted: true
      };
    }
    throw new Error("unexpected_path");
  };
  return { httpClient, leases, receipts };
}

function materialStoreWithHy2Credential() {
  const materialStore = createEdgeCredentialMaterialStore();
  materialStore.putCredentialMaterial({
    credentialRef: "edgecred_prod_hy2",
    materialDigest: "sha256:prodaaaaaaaaaaaa",
    material: {
      uuid: "11111111-1111-4111-8111-111111111111",
      password: "synthetic-production-password"
    }
  });
  return materialStore;
}

test("production runner accepts only private agent base URLs", () => {
  assert.equal(
    normalizePrivateAgentBaseUrl("http://127.0.0.1:3457/"),
    "http://127.0.0.1:3457"
  );
  assert.equal(
    normalizePrivateAgentBaseUrl("http://10.8.0.5:3456/api"),
    "http://10.8.0.5:3456/api"
  );
  assert.throws(
    () => normalizePrivateAgentBaseUrl("https://sub.globalcirclecat.cloud"),
    /private_base_url_required/
  );
});

test("production runner refuses apply mode without protected material store", () => {
  assert.throws(
    () => createProductionEdgeAgentRunner({
      env: {
        EDGE_AGENT_BASE_URL: "http://127.0.0.1:3457",
        EDGE_DATA_PLANE_AGENT_TOKEN: "node-agent-token",
        EDGE_AGENT_NODE_REF: "node-sgp-a",
        EDGE_AGENT_APPLY_ENABLED: "true",
        EDGE_AGENT_CHANNEL_REFS: "channel-sgp-a-hy2"
      },
      runtimeAdapters: {
        "channel-sgp-a-hy2": { applyCredentialReconciliation() {} }
      }
    }),
    /material_store_required/
  );
});

test("production runner refuses declared channels without runtime adapters", () => {
  assert.throws(
    () => createProductionEdgeAgentRunner({
      env: {
        EDGE_AGENT_BASE_URL: "http://127.0.0.1:3457",
        EDGE_DATA_PLANE_AGENT_TOKEN: "node-agent-token",
        EDGE_AGENT_NODE_REF: "node-sgp-a",
        EDGE_AGENT_APPLY_ENABLED: "true",
        EDGE_AGENT_CHANNEL_REFS: "channel-sgp-a-hy2"
      },
      materialStore: materialStoreWithHy2Credential(),
      runtimeAdapters: {}
    }),
    /runtime_adapter_missing/
  );
});

test("production runner can read bearer token from a protected token file", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "gccgw-agent-token-"));
  try {
    const tokenPath = join(tempDir, "token");
    writeFileSync(tokenPath, "node-agent-token-from-file\n", "utf8");
    const http = createHttpClient({ desired: [] });
    const runner = createProductionEdgeAgentRunner({
      env: {
        EDGE_AGENT_BASE_URL: "http://127.0.0.1:3457",
        EDGE_DATA_PLANE_AGENT_TOKEN_FILE: tokenPath,
        EDGE_AGENT_NODE_REF: "node-sgp-a",
        EDGE_AGENT_AGENT_REF: "agent-sgp-a",
        EDGE_AGENT_APPLY_ENABLED: "false",
        EDGE_AGENT_CHANNEL_REFS: "channel-sgp-a-hy2"
      },
      httpClient: http.httpClient,
      runtimeAdapters: {
        "channel-sgp-a-hy2": { applyCredentialReconciliation() {} }
      }
    });

    const report = await runner.runOnce();

    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(http.leases.length, 0);
    assert.doesNotMatch(JSON.stringify(report), /node-agent-token-from-file/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("production runner dry-runs host runtime adapters without mutation", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "gccgw-agent-dry-run-"));
  try {
    const http = createHttpClient();
    let commandCallCount = 0;
    const materialStore = materialStoreWithHy2Credential();
    const runtimeAdapters = createProductionRuntimeAdapters({
      materialStore,
      commandRunner() {
        commandCallCount += 1;
        return { exitCode: 1 };
      },
      channelConfigs: [
        {
          channelRef: "channel-sgp-a-hy2",
          runtime: "hysteria2",
          serviceName: "hysteria2.service",
          activeConfigPath: join(tempDir, "active.yaml"),
          candidateConfigPath: join(tempDir, "candidate.yaml"),
          backupDir: join(tempDir, "backup"),
          listener: { listen: ":10443" }
        }
      ]
    });
    const runner = createProductionEdgeAgentRunner({
      env: {
        EDGE_AGENT_BASE_URL: "http://127.0.0.1:3457",
        EDGE_DATA_PLANE_AGENT_TOKEN: "node-agent-token",
        EDGE_AGENT_NODE_REF: "node-sgp-a",
        EDGE_AGENT_AGENT_REF: "agent-sgp-a",
        EDGE_AGENT_APPLY_ENABLED: "false",
        EDGE_AGENT_CHANNEL_REFS: "channel-sgp-a-hy2"
      },
      httpClient: http.httpClient,
      materialStore,
      runtimeAdapters
    });

    const report = await runner.runOnce();

    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(commandCallCount, 0);
    assert.equal(http.receipts[0].status, "applied");
    assert.equal(http.receipts[0].reasonCode, "dry_run_checked");
    assert.equal(http.leases[0].channelRef, "channel-sgp-a-hy2");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("production runner applies through injected adapter over private transport and redacts output", async () => {
  const http = createHttpClient();
  const adapterCalls = [];
  const runner = createProductionEdgeAgentRunner({
    env: {
      EDGE_AGENT_BASE_URL: "http://127.0.0.1:3457",
      EDGE_DATA_PLANE_AGENT_TOKEN: "node-agent-token",
      EDGE_AGENT_NODE_REF: "node-sgp-a",
      EDGE_AGENT_AGENT_REF: "agent-sgp-a",
      EDGE_AGENT_APPLY_ENABLED: "true",
      EDGE_AGENT_CHANNEL_REFS: "channel-sgp-a-hy2"
    },
    httpClient: http.httpClient,
    materialStore: materialStoreWithHy2Credential(),
    nowFn: () => new Date("2026-06-10T00:02:00.000Z"),
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
            appliedAt: "2026-06-10T00:02:00.000Z"
          };
        }
      }
    }
  });

  const report = await runner.runOnce();

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, false);
  assert.equal(http.leases[0].channelRef, "channel-sgp-a-hy2");
  assert.equal(http.receipts[0].status, "applied");
  assert.equal(adapterCalls.length, 1);
  assert.equal(adapterCalls[0].channelRef, "channel-sgp-a-hy2");
  assert.doesNotMatch(
    JSON.stringify(report),
    /node-agent-token|synthetic-production-password|11111111-1111-4111-8111-111111111111|subscriptionUrl|privateKey/i
  );
});

test("production runtime adapter factory wires channel configs without resolving secrets during construction", () => {
  const factoryCalls = [];
  const materialStore = materialStoreWithHy2Credential();
  const adapters = createProductionRuntimeAdapters({
    channelConfigs: [
      {
        channelRef: "channel-sgp-a-hy2",
        runtime: "hysteria2",
        serviceName: "hysteria2.service",
        activeConfigPath: "/etc/hysteria/config.yaml",
        candidateConfigPath: "/etc/hysteria/config.yaml.candidate",
        backupDir: "/var/backups/gccgw-edge",
        listener: { listen: ":10443" }
      }
    ],
    materialStore,
    adapterFactories: {
      hysteria2(config) {
        factoryCalls.push(config);
        return { applyCredentialReconciliation() {} };
      }
    }
  });

  assert.equal(adapters.get("channel-sgp-a-hy2")?.applyCredentialReconciliation instanceof Function, true);
  assert.equal(factoryCalls.length, 1);
  assert.equal(factoryCalls[0].serviceName, "hysteria2.service");
  assert.equal(factoryCalls[0].resolveCredentialMaterial("edgecred_prod_hy2").password, "synthetic-production-password");
  assert.doesNotMatch(JSON.stringify(factoryCalls[0]), /synthetic-production-password|11111111-1111-4111-8111-111111111111/i);
});
