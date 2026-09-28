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

test("exhausting one independent pack changes only its edge credential and Agent receipt", () => {
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
    const service = createDataPlaneAgentService({
      controlStore: store,
      nodes: [{ nodeRef: NODE_REF, channelRefs: [CHANNEL_REF],
        tokenSha256: hashDataPlaneAgentToken("synthetic-pack-agent-token") }],
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
    assert.equal(store.listEdgeApplyReceipts({ channelRef: CHANNEL_REF }).length, 2);
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
