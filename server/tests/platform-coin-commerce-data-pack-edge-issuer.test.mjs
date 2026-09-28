import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { createFileBackedEdgeCredentialMaterialStore } from "../services/edge/credential-material-store.mjs";
import { createOrderEdgeCredentialIssuer } from "../services/edge/order-credential-issuer.mjs";
import { createCoinCommerceDataPackEdgeIssuer } from "../services/platform/coin-commerce-data-pack-edge-issuer.mjs";

const NOW = "2026-09-28T00:00:00.000Z";
const LEASE = { leaseGeneration: 1, leaseToken: "a".repeat(64) };

test("a captured pack claim issues one protected edge credential and replays after material restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "pack-edge-issuer-"));
  const controlStore = createSqliteSubscriptionControlStore({ dbPath: join(directory, "control.sqlite") });
  try {
    const claim = {
      commandRef: "coincmd_pack_edge_issue", orderRef: "coinord_pack_edge_issue",
      accountId: "acct_pack_edge_issue", offerVersionRef: "offerv_pack_100gb_v1",
      quotaBytes: 100 * 1024 ** 3, nodeId: "channel_sg_pack", now: NOW
    };
    controlStore.createAccount({
      id: claim.accountId, ownerRef: "portal_pack_edge_issue", status: "active",
      createdAt: NOW, updatedAt: NOW
    });
    const reserved = controlStore.reserveCoinCommerceDataPackIssuance(claim);
    controlStore.completeCoinCommerceDataPackIssuance({
      commandRef: claim.commandRef, orderRef: claim.orderRef,
      accountId: claim.accountId, requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef, nodeId: claim.nodeId,
      tenantRef: "tenantref_pack_edge_issue", artifactRef: "artifactref_pack_edge_issue",
      now: NOW
    });
    const commerceStore = {
      verifyCapturedFulfillmentClaim(input) {
        if (input.leaseGeneration !== LEASE.leaseGeneration
          || input.leaseToken !== LEASE.leaseToken
          || input.commandRef !== claim.commandRef
          || input.orderRef !== claim.orderRef
          || input.accountId !== claim.accountId) {
          const error = new Error("lease lost");
          error.code = "commerce_fulfillment_lease_lost";
          throw error;
        }
        return {
          commandRef: claim.commandRef, orderRef: claim.orderRef,
          accountId: claim.accountId, offerVersionRef: claim.offerVersionRef,
          delivery: { kind: "data_pack", neverExpires: true, trafficGb: 100 }
        };
      }
    };
    const materialPath = join(directory, "edge-material.json");
    const issuerFor = (materialStore) => createCoinCommerceDataPackEdgeIssuer({
      commerceStore, controlStore, materialStore,
      credentialIssuer: createOrderEdgeCredentialIssuer({
        channelRef: claim.nodeId, materialStore,
        uuidFactory: () => "00000000-0000-4000-8000-000000000001",
        passwordFactory: () => "synthetic-pack-edge-material"
      }),
      nowFn: () => new Date(NOW)
    });
    const input = {
      commandRef: claim.commandRef, orderRef: claim.orderRef,
      accountId: claim.accountId, requestRef: reserved.requestRef,
      entitlementRef: reserved.entitlementRef
    };
    let materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: materialPath });
    const firstIssuer = issuerFor(materialStore);
    assert.throws(() => firstIssuer.issue(input, { ...LEASE, leaseToken: "0".repeat(64) }),
      (error) => error.code === "commerce_fulfillment_lease_lost");
    assert.equal(materialStore.listCredentialMaterialSummaries().length, 0);
    const first = firstIssuer.issue(input, LEASE);
    assert.equal(first.status, "active");
    assert.equal(first.requestRef, reserved.requestRef);
    assert.equal(first.edgeChannelRef, claim.nodeId);
    assert.equal(JSON.stringify(first).includes("synthetic-pack-edge-material"), false);
    assert.equal(materialStore.getCredentialMaterialSummary(first.edgeCredentialRef)?.materialDigest.length, 71);
    assert.deepEqual(firstIssuer.issue(input, LEASE), first);
    materialStore = createFileBackedEdgeCredentialMaterialStore({ filePath: materialPath });
    assert.deepEqual(issuerFor(materialStore).issue(input, LEASE), first);
    assert.equal(materialStore.listCredentialMaterialSummaries().length, 1);
    assert.equal(controlStore.findIssuedSubscriptionBindingByEdgeCredentialRef(
      first.edgeCredentialRef
    )?.requestId, reserved.requestRef);
    assert.equal(controlStore.getLatestEdgeDesiredStateForChannel(claim.nodeId), null);
  } finally {
    controlStore.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
});
