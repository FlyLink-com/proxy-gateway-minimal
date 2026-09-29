import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { createHysteria2ExplicitRestartAdapter } from "../services/edge/hysteria2-runtime-adapter.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createDataPlaneDesiredStateNotifier } from "../services/edge/data-plane-desired-state-notifier.mjs";
import { createCoinCommerceDataPackCredentialReset } from "../services/platform/coin-commerce-data-pack-credential-reset.mjs";

const CHANNEL = "channel_pack_rotation_test";
const UNTIL = "9999-12-31T23:59:59.999Z";
const GIB = 1024 ** 3;

function seedPack(store, suffix, now) {
  const accountId = "acct_pack_rotation_test";
  const orderRef = `coinord_pack_rotation_${suffix}`;
  const commandRef = `coincmd_pack_rotation_${suffix}`;
  const offerVersionRef = "offerv_pack_100gb_v1";
  const quotaBytes = 100 * GIB;
  const reserved = store.reserveCoinCommerceDataPackIssuance({
    commandRef, orderRef, accountId, offerVersionRef, quotaBytes,
    nodeId: CHANNEL, now
  });
  const issued = store.completeCoinCommerceDataPackIssuance({
    commandRef, orderRef, accountId, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, nodeId: CHANNEL,
    tenantRef: `tenantref_pack_rotation_${suffix}`,
    artifactRef: `artifactref_pack_rotation_${suffix}`, now
  });
  const oldRef = `edgecred_pack_rotation_${suffix}`;
  const oldDigest = `sha256:${suffix.repeat(64)}`;
  store.registerCoinCommerceDataPackEdgeCredential({
    requestRef: reserved.requestRef, entitlementRef: reserved.entitlementRef,
    edgeChannelRef: CHANNEL, edgeCredentialRef: oldRef,
    edgeMaterialDigest: oldDigest, now
  });
  store.applyCoinCommerceDataPackFulfillment({
    orderRef, commandRef, accountId, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, issuedLinkRef: issued.issuedLinkRef,
    offerVersionRef, quotaBytes, technicalValidUntil: UNTIL,
    commercialNeverExpires: true, createdAt: now
  });
  return { accountId, orderRef, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, oldRef, oldDigest };
}

test("a pack edge credential rotates material without changing its metering identity or quota", () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-edge-rotation-"));
  const store = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  const now = new Date().toISOString();
  try {
    store.createAccount({ id: "acct_pack_rotation_test", ownerRef: "owner_pack_rotation_test",
      status: "active", createdAt: now, updatedAt: now });
    const target = seedPack(store, "a", now);
    const other = seedPack(store, "b", now);
    const accounting = createTrafficAccountingService({ controlStore: store,
      nowFn: () => new Date(now) });
    const observe = (ref, bytes) => accounting.recordUsageObservation({
      accountingMode: "delta", sourceRef: "source_pack_rotation_test",
      channelRef: CHANNEL, edgeCredentialRef: ref, observedAt: now,
      intervalStartedAt: now, intervalEndedAt: now,
      uploadBytes: bytes, downloadBytes: 0
    });
    assert.equal(observe(target.oldRef, 19).requestId, target.requestRef);
    const before = store.getLatestEdgeDesiredStateForChannel(CHANNEL);
    const replacementDigest = `sha256:${"c".repeat(64)}`;
    const rotate = () => store.rotateCoinCommerceDataPackEdgeCredential({
      requestRef: target.requestRef, entitlementRef: target.entitlementRef,
      edgeChannelRef: CHANNEL, edgeCredentialRef: target.oldRef,
      oldEdgeMaterialDigest: target.oldDigest,
      newEdgeMaterialDigest: replacementDigest, now
    });
    assert.equal(rotate().status, "active");
    assert.equal(rotate().status, "active");
    const after = store.getLatestEdgeDesiredStateForChannel(CHANNEL);
    assert.notEqual(after.desiredStateRef, before.desiredStateRef);
    assert.deepEqual(after.edgeCredentialRefs.sort(), before.edgeCredentialRefs.sort());
    assert.equal(after.materialDigests.find((item) => item.edgeCredentialRef === target.oldRef).digest,
      replacementDigest);
    let candidateConfig = "";
    const adapter = createHysteria2ExplicitRestartAdapter({
      listener: { certificate: "synthetic-cert", privateKey: "synthetic-key" },
      resolveCredentialMaterial: (ref) => ({
        password: ref === target.oldRef ? "synthetic-new-password" : "synthetic-other-password"
      }),
      writeCandidateConfig(content) { candidateConfig = content; },
      runConfigTest: () => ({ exitCode: 0 }),
      backupActiveConfig: () => ({ backupRef: "synthetic-backup" }),
      replaceActiveConfig() {},
      restartService: () => ({ ok: true }),
      validateService: () => ({ active: true }),
      validateListener: () => ({ udp443: true })
    });
    assert.equal(adapter.applyCredentialReconciliation({
      activationSurface: "explicit-restart", runtime: "hysteria2",
      actions: [{ action: "rotate", credentialRef: target.oldRef },
        { action: "unchanged", credentialRef: other.oldRef }]
    }).status, "applied");
    assert.match(candidateConfig, /synthetic-new-password/);
    assert.doesNotMatch(candidateConfig, /synthetic-old-password/);
    assert.equal(store.findIssuedSubscriptionBindingByEdgeCredentialRef(target.oldRef)?.requestId,
      target.requestRef);
    assert.equal(observe(target.oldRef, 7).requestId, target.requestRef);
    assert.equal(observe(target.oldRef, 11).requestId, target.requestRef);
    assert.equal(store.readDataPackResourceUsage({ accountId: target.accountId,
      orderRef: target.orderRef, requestRef: target.requestRef,
      entitlementRef: target.entitlementRef, now }).usage.usedBytes, 37);
    assert.equal(store.readDataPackResourceUsage({ accountId: other.accountId,
      orderRef: other.orderRef, requestRef: other.requestRef,
      entitlementRef: other.entitlementRef, now }).usage.usedBytes, null);
    assert.throws(() => store.rotateCoinCommerceDataPackEdgeCredential({
      requestRef: other.requestRef, entitlementRef: other.entitlementRef,
      edgeChannelRef: CHANNEL, edgeCredentialRef: other.oldRef,
      oldEdgeMaterialDigest: target.oldDigest,
      newEdgeMaterialDigest: replacementDigest, now
    }), (error) => error.code === "reconciliation_required");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a durable reset intent fences the edge material switch and preserves metering identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-reset-intent-"));
  const dbPath = join(directory, "control.sqlite");
  let store = createSqliteSubscriptionControlStore({ dbPath });
  const now = new Date().toISOString();
  try {
    store.createAccount({ id: "acct_pack_rotation_test", ownerRef: "owner_pack_rotation_test",
      status: "active", createdAt: now, updatedAt: now });
    const pack = seedPack(store, "d", now);
    const rotationRef = "packrot_durable_001";
    const input = { accountId: pack.accountId, orderRef: pack.orderRef, rotationRef };
    const prepared = store.beginCoinCommerceDataPackCredentialReset({ ...input, now });
    assert.equal(prepared.status, "prepared");
    assert.equal(prepared.requestRef, pack.requestRef);
    assert.equal(prepared.edgeCredentialRef, pack.oldRef);
    assert.equal(prepared.oldEdgeMaterialDigest, pack.oldDigest);
    assert.deepEqual(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }), prepared);
    assert.throws(() => store.beginCoinCommerceDataPackCredentialReset({
      ...input, rotationRef: "packrot_conflict_001", now
    }), (error) => error.code === "reconciliation_required");
    assert.throws(() => store.beginCoinCommerceDataPackArtifactRotation({
      ...input, rotationRef: "packrot_artifact_conflict_001", now
    }), (error) => error.code === "reconciliation_required");
    assert.throws(() => store.beginCoinCommerceDataPackArtifactRotation({ ...input, now }),
      (error) => error.code === "reconciliation_required");
    const leaseRef = "packrotlease_durable_001";
    store.claimCoinCommerceDataPackCredentialReset({ ...input, leaseRef, now });
    const newEdgeMaterialDigest = `sha256:${"e".repeat(64)}`;
    assert.throws(() => store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef: "packrotlease_wrong_001", stage: "staged",
      newEdgeMaterialDigest, now
    }), (error) => error.code === "reconciliation_required");
    const staged = store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "staged", newEdgeMaterialDigest, now
    });
    assert.equal(staged.status, "staged");
    assert.equal(staged.newEdgeMaterialDigest, newEdgeMaterialDigest);
    const before = store.getLatestEdgeDesiredStateForChannel(CHANNEL);
    const switched = store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "control_switched", now
    });
    assert.equal(switched.status, "control_switched");
    assert.deepEqual(store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "control_switched", now
    }), switched);
    const after = store.getLatestEdgeDesiredStateForChannel(CHANNEL);
    assert.notEqual(after.desiredStateRef, before.desiredStateRef);
    assert.deepEqual(after.edgeCredentialRefs, before.edgeCredentialRefs);
    assert.equal(after.materialDigests[0].digest, newEdgeMaterialDigest);
    store.close();
    store = createSqliteSubscriptionControlStore({ dbPath });
    assert.equal(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }).status,
      "control_switched");
    const materialCommitted = store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "material_committed", now
    });
    assert.equal(materialCommitted.status, "material_committed");
    store.recordUsageSample({
      id: "sample_pack_reset_exhausted", sourceRef: "source_pack_reset_exhausted",
      channelRef: CHANNEL, edgeCredentialRef: pack.oldRef,
      accountId: pack.accountId, entitlementId: pack.entitlementRef,
      requestId: pack.requestRef, observedAt: now,
      intervalStartedAt: now, intervalEndedAt: now,
      uploadBytes: 100 * GIB, downloadBytes: 0,
      sampleDigest: "digest_pack_reset_exhausted", createdAt: now
    });
    const exhaustedDesired = store.getLatestEdgeDesiredStateForChannel(CHANNEL);
    assert.equal(exhaustedDesired.edgeCredentialRefs.includes(pack.oldRef), false);
    assert.throws(() => store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "edge_applied", now
    }), (error) => error.code === "reconciliation_required");
    store.recordEdgeDesiredStateNotification({
      id: "notify_pack_reset_wrong_reason", nodeRef: CHANNEL, channelRef: CHANNEL,
      desiredStateRef: exhaustedDesired.desiredStateRef,
      generation: exhaustedDesired.generation,
      reason: "unrelated_lifecycle", status: "pending",
      createdAt: now, updatedAt: now
    });
    store.recordEdgeApplyReceipt({
      id: "receipt_pack_reset_wrong_reason", channelRef: CHANNEL,
      desiredStateRef: exhaustedDesired.desiredStateRef, status: "applied",
      configTestOk: true, serviceActive: true, listenerUdp443: true,
      appliedAt: now, createdAt: now
    });
    assert.throws(() => store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "edge_applied", now
    }), (error) => error.code === "reconciliation_required");
    store.recordEdgeDesiredStateNotification({
      id: "notify_pack_reset_durable", nodeRef: CHANNEL, channelRef: CHANNEL,
      desiredStateRef: exhaustedDesired.desiredStateRef,
      generation: exhaustedDesired.generation,
      reason: "coin_commerce_data_pack_credential_reset", status: "pending",
      createdAt: now, updatedAt: now
    });
    store.recordEdgeApplyReceipt({
      id: "receipt_pack_reset_durable", channelRef: CHANNEL,
      desiredStateRef: exhaustedDesired.desiredStateRef, status: "applied",
      configTestOk: true, serviceActive: true, listenerUdp443: true,
      appliedAt: now, createdAt: now
    });
    assert.equal(store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "edge_applied", now
    }).status, "edge_applied");
    assert.throws(() => store.advanceCoinCommerceDataPackCredentialReset({
      ...input, leaseRef, stage: "complete", now
    }), (error) => error.code === "reconciliation_required");
    store.releaseCoinCommerceDataPackCredentialReset({ ...input, leaseRef });
    assert.deepEqual(store.listPendingCoinCommerceDataPackCredentialResets({ limit: 10, now }), [input]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("credential reset waits for the exact edge receipt before rotating the subscription link", () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-reset-flow-"));
  const store = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  const now = new Date().toISOString();
  try {
    store.createAccount({ id: "acct_pack_rotation_test", ownerRef: "owner_pack_rotation_test",
      status: "active", createdAt: now, updatedAt: now });
    const pack = seedPack(store, "f", now);
    const materialPath = join(directory, "protected-material.json");
    let materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: materialPath });
    materialStore.putCredentialMaterial({ credentialRef: pack.oldRef,
      materialDigest: pack.oldDigest,
      material: { uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        password: "synthetic-original-pack-key" } });
    const notifier = createDataPlaneDesiredStateNotifier({
      controlStore: store,
      servers: [{ name: CHANNEL, physicalNodeRef: "node_pack_reset",
        runtimeAdapter: "remote-data-plane-handoff" }],
      nowFn: () => now
    });
    let artifactCalls = 0;
    let loseArtifactAck = true;
    const artifactRotation = {
      rotate(input) {
        artifactCalls += 1;
        let intent = store.beginCoinCommerceDataPackArtifactRotation({ ...input, now });
        const leaseRef = "packrotlease_artifact_flow";
        intent = store.claimCoinCommerceDataPackArtifactRotation({ ...input, leaseRef, now });
        try {
          if (intent.status === "prepared") intent = store.advanceCoinCommerceDataPackArtifactRotation({
            ...input, leaseRef, stage: "escrowed",
            replacementArtifactRef: "artifactref_pack_reset_new", now
          });
          if (intent.status === "escrowed") intent = store.advanceCoinCommerceDataPackArtifactRotation({
            ...input, leaseRef, stage: "switched", now
          });
          if (intent.status === "switched") intent = store.advanceCoinCommerceDataPackArtifactRotation({
            ...input, leaseRef, stage: "complete", now
          });
          if (loseArtifactAck) {
            loseArtifactAck = false;
            throw new Error("synthetic artifact acknowledgement loss");
          }
          return { status: intent.status, orderRef: input.orderRef };
        } finally { store.releaseCoinCommerceDataPackArtifactRotation({ ...input, leaseRef }); }
      }
    };
    const commerceStore = { getDeliveredOrderBinding({ accountId, orderRef }) {
      return accountId === pack.accountId && orderRef === pack.orderRef
        ? { kind: "data_pack", orderRef, requestRef: pack.requestRef,
          entitlementRef: pack.entitlementRef } : null;
    } };
    const dependencies = {
      commerceStore, controlStore: store, materialStore,
      desiredStateNotifier: notifier, artifactRotation,
      nowFn: () => new Date(now)
    };
    const input = { accountId: pack.accountId, orderRef: pack.orderRef,
      rotationRef: "packrot_flow_001" };
    const interruptedStage = createCoinCommerceDataPackCredentialReset({
      ...dependencies, controlStore: { ...store,
        advanceCoinCommerceDataPackCredentialReset(value) {
          if (value.stage === "staged") throw new Error("synthetic control write failure");
          return store.advanceCoinCommerceDataPackCredentialReset(value);
        }
      }
    });
    assert.throws(() => interruptedStage.rotate(input));
    assert.equal(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }).status,
      "prepared");
    const firstStagedDigest = materialStore.getStagedCredentialMaterialRotation(input.rotationRef)
      .newMaterialDigest;
    const interrupted = createCoinCommerceDataPackCredentialReset({
      ...dependencies, materialStore: { ...materialStore,
        commitCredentialMaterialRotation() { throw new Error("synthetic protected write failure"); }
      }
    });
    assert.throws(() => interrupted.rotate(input));
    assert.equal(artifactCalls, 0);
    assert.equal(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }).status,
      "control_switched");
    assert.equal(materialStore.getCredentialMaterialSummary(pack.oldRef).materialDigest,
      pack.oldDigest);
    const stagedDigest = materialStore.getStagedCredentialMaterialRotation(input.rotationRef)
      .newMaterialDigest;
    assert.equal(stagedDigest, firstStagedDigest);
    materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: materialPath });
    const reset = createCoinCommerceDataPackCredentialReset({
      ...dependencies, materialStore
    });
    assert.throws(() => reset.rotate(input));
    assert.equal(artifactCalls, 0);
    assert.equal(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }).status,
      "material_committed");
    const activeDigest = materialStore.getCredentialMaterialSummary(pack.oldRef).materialDigest;
    assert.equal(activeDigest, stagedDigest);
    const desired = store.getLatestEdgeDesiredStateForChannel(CHANNEL, {
      nodeRef: "node_pack_reset"
    });
    let appliedConfig = "";
    const adapter = createHysteria2ExplicitRestartAdapter({
      listener: { certificate: "synthetic-cert", privateKey: "synthetic-key" },
      resolveCredentialMaterial: (ref) => materialStore.resolveCredentialMaterial(ref),
      writeCandidateConfig(content) { appliedConfig = content; },
      runConfigTest: () => ({ exitCode: 0 }),
      backupActiveConfig: () => ({ backupRef: "synthetic-backup" }),
      replaceActiveConfig() {},
      restartService: () => ({ ok: true }),
      validateService: () => ({ active: true }),
      validateListener: () => ({ udp443: true })
    });
    assert.equal(adapter.applyCredentialReconciliation({
      activationSurface: "explicit-restart", runtime: "hysteria2",
      actions: [{ action: "rotate", credentialRef: pack.oldRef }]
    }).status, "applied");
    assert.equal(appliedConfig.includes("synthetic-original-pack-key"), false);
    assert.equal(appliedConfig.includes(
      materialStore.resolveCredentialMaterial(pack.oldRef).password), true);
    store.recordEdgeApplyReceipt({
      id: "receipt_pack_reset_flow", channelRef: CHANNEL,
      desiredStateRef: desired.desiredStateRef, status: "applied",
      configTestOk: true, serviceActive: true, listenerUdp443: true,
      appliedAt: now, createdAt: now
    });
    assert.deepEqual(reset.reconcilePending({ limit: 1 }),
      { inspected: 1, completed: 0, failed: 1 });
    assert.equal(artifactCalls, 1);
    assert.equal(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }).status,
      "edge_applied");
    assert.deepEqual(reset.reconcilePending({ limit: 1 }),
      { inspected: 1, completed: 1, failed: 0 });
    assert.equal(artifactCalls, 2);
    assert.equal(store.beginCoinCommerceDataPackCredentialReset({ ...input, now }).status,
      "complete");
    assert.deepEqual(reset.rotate(input), { status: "complete", orderRef: pack.orderRef,
      rotationRef: input.rotationRef });
    assert.equal(artifactCalls, 2);
    assert.equal(store.readDataPackResourceUsage({ accountId: pack.accountId,
      orderRef: pack.orderRef, requestRef: pack.requestRef,
      entitlementRef: pack.entitlementRef, now }).usage.usedBytes, null);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
