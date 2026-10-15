import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createCoinCommerceDataPackRuntimeIssuer } from "../services/platform/coin-commerce-data-pack-runtime-issuer.mjs";
import { createCoinCommerceDataPackMaterialEscrow } from "../services/platform/coin-commerce-data-pack-material-escrow.mjs";
import { createCoinCommerceDataPackOrderDelivery } from "../services/platform/coin-commerce-data-pack-order-delivery.mjs";

const NOW = "2026-09-28T00:00:00.000Z";
const UNTIL = "9999-12-31T23:59:59.999Z";
const LEASE = { leaseGeneration: 1, leaseToken: "b".repeat(64) };
const INPUT = {
  commandRef: "coincmd_pack_delivery",
  orderRef: "coinord_pack_delivery",
  accountId: "acct_pack_delivery",
  offerVersionRef: "offerv_pack_100gb_v1",
  quotaBytes: 100 * 1024 ** 3
};

test("only a delivered owner-scoped order can re-fetch its own protected pack subscription", () => {
  const directory = mkdtempSync(join(tmpdir(), "data-pack-delivery-"));
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  const escrow = createCoinCommerceDataPackMaterialEscrow({ key: Buffer.alloc(32, 4), filePath: join(directory, "material.json") });
  const tenants = [];
  const artifacts = new Map();
  const runtimeCore = {
    listTenants: () => tenants,
    listSubscriptionArtifacts: (id) => artifacts.get(id) || [],
    createTenant: ({ nodeId, expiresAt, note }) => {
      const tenant = { id: "tenant_pack_delivery", nodeId, expiresAt, note, status: "active" };
      tenants.push(tenant);
      return { tenant, subscriptionUrl: "https://example.invalid/tenant-secret" };
    },
    createSubscriptionArtifact: (id) => {
      const artifact = { id: "artifact_pack_delivery", tenantId: id, status: "active" };
      artifacts.set(id, [artifact]);
      return { artifact, subscriptionUrl: "https://example.invalid/sub/private-pack" };
    }
  };
  try {
    controlStore.createAccount({ id: INPUT.accountId, ownerRef: "portal_pack_delivery", status: "active", createdAt: NOW, updatedAt: NOW });
    const issued = createCoinCommerceDataPackRuntimeIssuer({
      commerceStore: { verifyCapturedFulfillmentClaim: ({ commandRef, orderRef, accountId }) => ({
        commandRef, orderRef, accountId, offerVersionRef: INPUT.offerVersionRef,
        delivery: { kind: "data_pack", neverExpires: true, trafficGb: 100 }
      }) },
      controlStore, runtimeCore, materialEscrow: escrow, nodeId: "node_sg", nowFn: () => new Date(NOW)
    }).issue(INPUT, LEASE);
    controlStore.applyCoinCommerceDataPackFulfillment({
      ...INPUT, requestRef: issued.requestRef, entitlementRef: issued.entitlementRef,
      issuedLinkRef: issued.issuedLinkRef, technicalValidUntil: UNTIL,
      commercialNeverExpires: true, createdAt: NOW
    });
    let delivered = false;
    const commerceStore = {
      getDeliveredOrderBinding({ accountId, orderRef }) {
        if (!delivered || accountId !== INPUT.accountId || orderRef !== INPUT.orderRef) return null;
        return { kind: "data_pack", orderRef, offerVersionRef: INPUT.offerVersionRef,
          requestRef: issued.requestRef, entitlementRef: issued.entitlementRef };
      }
    };
    const delivery = createCoinCommerceDataPackOrderDelivery({
      commerceStore, controlStore, runtimeCore, materialEscrow: escrow, nowFn: () => new Date(NOW)
    });
    assert.throws(() => delivery.get({ accountId: INPUT.accountId, orderRef: INPUT.orderRef }),
      (error) => error.code === "coin_commerce_data_pack_delivery_unavailable");
    delivered = true;
    assert.throws(() => delivery.get({ accountId: "acct_other", orderRef: INPUT.orderRef }),
      (error) => error.code === "coin_commerce_data_pack_delivery_unavailable");
    const result = delivery.get({ accountId: INPUT.accountId, orderRef: INPUT.orderRef });
    assert.equal(result.subscriptionUrl, "https://example.invalid/sub/private-pack");
    assert.equal(result.usage.totalBytes, INPUT.quotaBytes);
    assert.equal(result.usage.collectionStatus, "pending");
    assert.equal(result.technicalValidUntil, undefined);
    assert.equal(result.validUntil, undefined);
    artifacts.set(tenants[0].id, [{ ...artifacts.get(tenants[0].id)[0], id: "artifact_pack_wrong" }]);
    assert.throws(() => delivery.get({ accountId: INPUT.accountId, orderRef: INPUT.orderRef }),
      (error) => error.code === "coin_commerce_data_pack_delivery_unavailable");
  } finally {
    escrow.close();
    controlStore.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
