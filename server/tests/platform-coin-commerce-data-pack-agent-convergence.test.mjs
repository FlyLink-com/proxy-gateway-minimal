import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSqliteSubscriptionControlStore
} from "../services/platform/subscription-control-db.mjs";
import {
  createDataPlaneAgentService, hashDataPlaneAgentToken
} from "../services/edge/data-plane-agent-service.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { createEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createProductionEdgeAgentRunner } from "../../agent/production-edge-agent.mjs";
import { createHysteria2ExplicitRestartAdapter } from "../services/edge/hysteria2-runtime-adapter.mjs";

const CHANNEL_REF = "channel_sg_pack";
const NODE_REF = "node_sg_pack";
const TECHNICAL_VALID_UNTIL = "9999-12-31T23:59:59.999Z";
const GIB = 1024 ** 3;

function seedPack(store, { suffix, trafficGb, now }) {
  const orderRef = `coinord_agent_pack_${suffix}`;
  const commandRef = `coincmd_agent_pack_${suffix}`;
  const accountId = "acct_agent_pack";
  const offerVersionRef = `offerv_pack_${trafficGb}gb_v1`;
  const quotaBytes = trafficGb * GIB;
  const reserved = store.reserveCoinCommerceDataPackIssuance({
    commandRef, orderRef, accountId, offerVersionRef,
    quotaBytes, nodeId: CHANNEL_REF, now
  });
  const issued = store.completeCoinCommerceDataPackIssuance({
    commandRef, orderRef, accountId, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, nodeId: CHANNEL_REF,
    tenantRef: `tenantref_agent_${suffix}`,
    artifactRef: `artifactref_agent_${suffix}`, now
  });
  const credentialRef = `edgecred_agent_pack_${suffix}`;
  const materialDigest = `sha256:${suffix.repeat(64)}`;
  store.registerCoinCommerceDataPackEdgeCredential({
    requestRef: reserved.requestRef, entitlementRef: reserved.entitlementRef,
    edgeChannelRef: CHANNEL_REF, edgeCredentialRef: credentialRef,
    edgeMaterialDigest: materialDigest, now
  });
  store.applyCoinCommerceDataPackFulfillment({
    orderRef, commandRef, accountId, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, issuedLinkRef: issued.issuedLinkRef,
    offerVersionRef, quotaBytes, technicalValidUntil: TECHNICAL_VALID_UNTIL,
    commercialNeverExpires: true, createdAt: now
  });
  return { orderRef, accountId, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, credentialRef, materialDigest, quotaBytes };
}

test("exhausting one independent pack changes only its edge credential and Agent receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-agent-convergence-"));
  const store = createSqliteSubscriptionControlStore({
    dbPath: join(directory, "control.sqlite")
  });
  const now = new Date().toISOString();
  try {
    store.createAccount({
      id: "acct_agent_pack", ownerRef: "owner_agent_pack", status: "active",
      createdAt: now, updatedAt: now
    });
    const first = seedPack(store, { suffix: "a", trafficGb: 100, now });
    const second = seedPack(store, { suffix: "b", trafficGb: 200, now });
    const protectedMaterial = createEdgeCredentialMaterialStore();
    for (const pack of [first, second]) {
      protectedMaterial.putCredentialMaterial({
        credentialRef: pack.credentialRef, materialDigest: pack.materialDigest,
        material: { uuid: "11111111-1111-4111-8111-111111111111",
          password: `synthetic-${pack.credentialRef}` }
      });
    }
    const service = createDataPlaneAgentService({
      controlStore: store,
      nodes: [{ nodeRef: NODE_REF, channelRefs: [CHANNEL_REF],
        tokenSha256: hashDataPlaneAgentToken("synthetic-pack-agent-token") }],
      credentialMaterialStore: protectedMaterial,
      nowFn: () => new Date(now)
    });
    const identity = service.authenticate({
      authorization: "Bearer synthetic-pack-agent-token"
    });
    const before = service.getDesiredState(identity).desiredStates[0];
    assert.deepEqual(before.edgeCredentialRefs,
      [first.credentialRef, second.credentialRef]);
    const receiptFor = (desiredState) => service.recordReceipt(identity, {
      type: "gccgw_data_plane_apply_receipt", nodeRef: NODE_REF,
      channelRef: CHANNEL_REF, desiredStateRef: desiredState.desiredStateRef,
      generation: desiredState.generation, status: "applied",
      configTest: true, serviceActive: true, listenerPresent: true,
      credentialCount: desiredState.edgeCredentialRefs.length,
      materialDigests: desiredState.materialDigests.map((item) => item.digest),
      appliedAt: now
    });
    assert.equal(receiptFor(before).status, "applied");

    const accounting = createTrafficAccountingService({
      controlStore: store, nowFn: () => new Date(now)
    });
    const exhaustedObservation = accounting.recordUsageObservation({
      accountingMode: "delta", sourceRef: "source_agent_pack",
      channelRef: CHANNEL_REF, edgeCredentialRef: first.credentialRef,
      observedAt: now,
      intervalStartedAt: now, intervalEndedAt: now,
      uploadBytes: first.quotaBytes, downloadBytes: 0
    });
    assert.equal(exhaustedObservation.status, "over_quota_disable_required");
    assert.equal(exhaustedObservation.requestId, first.requestRef);
    assert.equal(exhaustedObservation.entitlementId, first.entitlementRef);
    assert.equal(exhaustedObservation.trafficSupply.scope, "order_resource");
    const after = service.getDesiredState(identity).desiredStates[0];
    assert.notEqual(after.desiredStateRef, before.desiredStateRef);
    assert.deepEqual(after.edgeCredentialRefs, [second.credentialRef]);
    assert.deepEqual(after.materialDigests.map((item) => item.digest),
      [second.materialDigest]);
    assert.throws(() => receiptFor(before),
      (error) => error.code === "generation_scope_mismatch");
    assert.equal(receiptFor(after).status, "applied");
    const appliedActions = [];
    let candidateConfig = "";
    const agentMaterial = createEdgeCredentialMaterialStore();
    const runtimeAdapter = createHysteria2ExplicitRestartAdapter({
      listener: { certificate: "synthetic-cert", privateKey: "synthetic-key" },
      resolveCredentialMaterial: (ref) => agentMaterial.resolveCredentialMaterial(ref),
      writeCandidateConfig(content) { candidateConfig = content; },
      runConfigTest: () => ({ exitCode: 0 }),
      backupActiveConfig: () => ({ backupRef: "synthetic-backup" }),
      replaceActiveConfig() {},
      restartService: () => ({ ok: true }),
      validateService: () => ({ active: true }),
      validateListener: () => ({ udp443: true }),
      now: () => new Date(now)
    });
    const response = (status, body) => ({
      status, ok: status >= 200 && status < 300, json: async () => body
    });
    const runner = createProductionEdgeAgentRunner({
      baseUrl: "http://127.0.0.1:3456", token: "synthetic-pack-agent-token",
      nodeRef: NODE_REF, channelRefs: [CHANNEL_REF],
      edgeCredentialRefs: [first.credentialRef, second.credentialRef],
      applyEnabled: true, dryRun: false, nowFn: () => new Date(now),
      materialStore: agentMaterial,
      runtimeAdapters: { [CHANNEL_REF]: {
        runtime: "hysteria2",
        async applyCredentialReconciliation(payload) {
          appliedActions.push(payload.actions);
          return runtimeAdapter.applyCredentialReconciliation(payload);
        }
      } },
      fetchImpl: async (url, options = {}) => {
        const target = new URL(url);
        const agent = service.authenticate({ authorization: options.headers.Authorization });
        if (target.pathname.endsWith("/desired-state")) {
          return response(200, service.getDesiredState(agent, {
            edgeCredentialRefs: target.searchParams.get("edgeCredentialRefs") || [],
            agentVersion: options.headers["X-GCCGW-Agent-Version"],
            capabilities: options.headers["X-GCCGW-Agent-Capabilities"].split(",")
          }));
        }
        if (target.pathname.endsWith("/materials")) {
          return response(200, service.getCredentialMaterials(agent, JSON.parse(options.body)));
        }
        if (target.pathname.endsWith("/receipts")) {
          return response(201, service.recordReceipt(agent, JSON.parse(options.body)));
        }
        assert.fail("unexpected Agent request");
      }
    });
    const agentResult = await runner.runOnce();
    assert.equal(agentResult.receiptCount, 1);
    assert.deepEqual(appliedActions, [[
      { action: "add", credentialRef: second.credentialRef },
      { action: "revoke", credentialRef: first.credentialRef }
    ]]);
    assert.match(candidateConfig, /synthetic-edgecred_agent_pack_b/);
    assert.doesNotMatch(candidateConfig, /synthetic-edgecred_agent_pack_a/);
    assert.equal(store.listEdgeApplyReceipts({ channelRef: CHANNEL_REF }).length, 3);
    assert.equal(store.readDataPackResourceUsage({
      accountId: first.accountId, orderRef: first.orderRef,
      requestRef: first.requestRef, entitlementRef: first.entitlementRef, now
    }).usage.exhausted, true);
    assert.equal(store.readDataPackResourceUsage({
      accountId: second.accountId, orderRef: second.orderRef,
      requestRef: second.requestRef, entitlementRef: second.entitlementRef, now
    }).usage.exhausted, null);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
