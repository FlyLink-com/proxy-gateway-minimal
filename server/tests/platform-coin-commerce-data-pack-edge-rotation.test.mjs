import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";
import { createHysteria2ExplicitRestartAdapter } from "../services/edge/hysteria2-runtime-adapter.mjs";

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
