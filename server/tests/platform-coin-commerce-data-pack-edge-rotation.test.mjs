import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createTrafficAccountingService } from "../services/platform/traffic-accounting.mjs";

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
  store.registerCoinCommerceDataPackEdgeCredential({
    requestRef: reserved.requestRef, entitlementRef: reserved.entitlementRef,
    edgeChannelRef: CHANNEL, edgeCredentialRef: oldRef,
    edgeMaterialDigest: `sha256:${suffix.repeat(64)}`, now
  });
  store.applyCoinCommerceDataPackFulfillment({
    orderRef, commandRef, accountId, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, issuedLinkRef: issued.issuedLinkRef,
    offerVersionRef, quotaBytes, technicalValidUntil: UNTIL,
    commercialNeverExpires: true, createdAt: now
  });
  return { accountId, orderRef, requestRef: reserved.requestRef,
    entitlementRef: reserved.entitlementRef, oldRef };
}

test("a pack edge principal transitions without resetting quota or losing delayed old-principal usage", () => {
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
    const replacementRef = "edgecred_pack_rotation_replacement";
    const replacementDigest = `sha256:${"c".repeat(64)}`;
    const rotate = () => store.rotateCoinCommerceDataPackEdgeCredential({
      requestRef: target.requestRef, entitlementRef: target.entitlementRef,
      edgeChannelRef: CHANNEL, oldEdgeCredentialRef: target.oldRef,
      newEdgeCredentialRef: replacementRef,
      newEdgeMaterialDigest: replacementDigest, now
    });
    assert.equal(rotate().status, "active");
    assert.equal(rotate().status, "active");
    const after = store.getLatestEdgeDesiredStateForChannel(CHANNEL);
    assert.notEqual(after.desiredStateRef, before.desiredStateRef);
    assert.deepEqual(after.edgeCredentialRefs.sort(), [other.oldRef, replacementRef].sort());
    assert.equal(store.findIssuedSubscriptionBindingByEdgeCredentialRef(target.oldRef)?.requestId,
      target.requestRef);
    assert.equal(observe(target.oldRef, 7).requestId, target.requestRef);
    assert.equal(observe(replacementRef, 11).requestId, target.requestRef);
    assert.equal(store.readDataPackResourceUsage({ accountId: target.accountId,
      orderRef: target.orderRef, requestRef: target.requestRef,
      entitlementRef: target.entitlementRef, now }).usage.usedBytes, 37);
    assert.equal(store.readDataPackResourceUsage({ accountId: other.accountId,
      orderRef: other.orderRef, requestRef: other.requestRef,
      entitlementRef: other.entitlementRef, now }).usage.usedBytes, null);
    assert.throws(() => store.rotateCoinCommerceDataPackEdgeCredential({
      requestRef: other.requestRef, entitlementRef: other.entitlementRef,
      edgeChannelRef: CHANNEL, oldEdgeCredentialRef: other.oldRef,
      newEdgeCredentialRef: replacementRef,
      newEdgeMaterialDigest: replacementDigest, now
    }), (error) => error.code === "reconciliation_required");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
