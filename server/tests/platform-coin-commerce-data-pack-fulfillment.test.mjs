import assert from "node:assert/strict";
import test from "node:test";
import {
  createCoinCommerceDataPackFulfillmentHandler
} from "../services/platform/coin-commerce-data-pack-fulfillment.mjs";
import {
  isCoinCommerceFulfillmentRetryableError,
  isCoinCommerceFulfillmentReconciliationError
} from "../services/platform/coin-commerce-fulfillment-retry.mjs";

const LEASE = Object.freeze({ leaseGeneration: 3, leaseToken: "a".repeat(64) });
const COMMAND = Object.freeze({
  commandRef: "coincmd_pack_delivery", orderRef: "coinord_pack_delivery",
  accountId: "acct_pack_delivery", offerVersionRef: "offerv_pack_100gb_v1",
  delivery: Object.freeze({
    kind: "data_pack", durationDays: null, monthlyTrafficGb: null,
    trafficGb: 100, neverExpires: true, discountBasisPoints: null
  }),
  fulfillmentLease: LEASE
});
const REQUEST_REF = "pareq_pack_delivery";
const ENTITLEMENT_REF = "ent_pack_delivery";
const CHANNEL_REF = "channel_sg_pack";
const CREDENTIAL_REF = "edgecred_pack_delivery";
const MATERIAL_DIGEST = `sha256:${"b".repeat(64)}`;
const DESIRED_REF = "desired_state_pack_delivery";
const EFFECT_REF = "effect_pack_delivery";

function fixture() {
  const calls = [];
  let receipt = null;
  let leaseValid = true;
  let effectCreatedAt = null;
  let requestCreatedAt = "2026-09-28T00:00:00.000Z";
  const dependencies = {
    commerceStore: {
      verifyCapturedFulfillmentClaim(input) {
        calls.push("verify");
        if (!leaseValid || input.leaseToken !== LEASE.leaseToken) {
          const error = new Error("lease lost");
          error.code = "commerce_fulfillment_lease_lost";
          throw error;
        }
        return {
          commandRef: COMMAND.commandRef, orderRef: COMMAND.orderRef,
          accountId: COMMAND.accountId, offerVersionRef: COMMAND.offerVersionRef,
          delivery: COMMAND.delivery
        };
      }
    },
    runtimeIssuer: {
      issue(input, lease) {
        calls.push("runtime");
        assert.equal(input.quotaBytes, 100 * 1024 ** 3);
        assert.deepEqual(lease, LEASE);
        return {
          status: "issued", orderRef: COMMAND.orderRef,
          requestRef: REQUEST_REF, entitlementRef: ENTITLEMENT_REF,
          issuedLinkRef: `${REQUEST_REF}_link_1`,
          tenantRef: "tenantref_pack_delivery",
          artifactRef: "artifactref_pack_delivery"
        };
      }
    },
    edgeIssuer: {
      issue(input, lease) {
        calls.push("edge");
        assert.equal(input.requestRef, REQUEST_REF);
        assert.deepEqual(lease, LEASE);
        return {
          status: "active", requestRef: REQUEST_REF,
          entitlementRef: ENTITLEMENT_REF,
          edgeChannelRef: CHANNEL_REF,
          edgeCredentialRef: CREDENTIAL_REF
        };
      }
    },
    controlStore: {
      getIssuanceRequest(requestRef) {
        assert.equal(requestRef, REQUEST_REF);
        return {
          id: REQUEST_REF, accountId: COMMAND.accountId,
          entitlementId: ENTITLEMENT_REF, status: "issued",
          purpose: "coin_commerce_data_pack_fulfillment",
          createdAt: requestCreatedAt,
          metadata: { commandRef: COMMAND.commandRef, orderRef: COMMAND.orderRef }
        };
      },
      applyCoinCommerceDataPackFulfillment(input) {
        calls.push("effect");
        assert.equal(input.requestRef, REQUEST_REF);
        assert.equal(input.quotaBytes, 100 * 1024 ** 3);
        if (effectCreatedAt !== null) assert.equal(input.createdAt, effectCreatedAt);
        effectCreatedAt = input.createdAt;
        return {
          effectRef: EFFECT_REF, orderRef: COMMAND.orderRef,
          requestRef: REQUEST_REF, entitlementRef: ENTITLEMENT_REF,
          issuedLinkRef: `${REQUEST_REF}_link_1`
        };
      },
      getLatestEdgeDesiredStateForChannel(channelRef, { nodeRef }) {
        calls.push("desired");
        assert.equal(channelRef, CHANNEL_REF);
        assert.equal(nodeRef, "node_sg_pack");
        return {
          desiredStateRef: DESIRED_REF, generation: "gen_pack_delivery",
          edgeCredentialRefs: [CREDENTIAL_REF],
          materialDigests: [{ channelRef: CHANNEL_REF,
            edgeCredentialRef: CREDENTIAL_REF, digest: MATERIAL_DIGEST }]
        };
      },
      listEdgeApplyReceipts({ channelRef }) {
        calls.push("receipts");
        assert.equal(channelRef, CHANNEL_REF);
        return receipt ? [receipt] : [];
      }
    },
    desiredStateNotifier: {
      notifyOrderLifecycle({ order }) {
        calls.push("notify");
        assert.equal(order.edgeChannelRef, CHANNEL_REF);
        return {
          notificationCount: 1,
          notifications: [{
            id: "notify_pack_delivery", channelRef: CHANNEL_REF,
            nodeRef: "node_sg_pack", desiredStateRef: DESIRED_REF,
            generation: "gen_pack_delivery",
            status: receipt ? "applied" : "pending"
          }]
        };
      }
    }
  };
  return {
    calls, dependencies,
    applyReceipt() {
      receipt = {
        id: "receipt_pack_delivery", channelRef: CHANNEL_REF,
        desiredStateRef: DESIRED_REF, status: "applied",
        configTestOk: true, serviceActive: true, listenerUdp443: true,
        appliedAt: "2026-09-28T00:01:00.000Z"
      };
    },
    setRequestCreatedAt(value) { requestCreatedAt = value; },
    loseLease() { leaseValid = false; }
  };
}

test("captured pack effect remains pending until matching edge application, then replays the same request/effect", () => {
  const state = fixture();
  const handler = createCoinCommerceDataPackFulfillmentHandler(state.dependencies);
  assert.throws(() => handler.execute(COMMAND), isCoinCommerceFulfillmentRetryableError);
  assert.deepEqual(state.calls, ["verify", "runtime", "edge", "effect", "notify", "desired", "receipts"]);
  state.applyReceipt();
  const completed = handler.execute(COMMAND);
  assert.deepEqual(completed, { status: "delivered", effectRef: EFFECT_REF });
  assert.deepEqual(state.calls.slice(7), [
    "verify", "runtime", "edge", "effect", "notify", "desired", "receipts", "verify"
  ]);
});

test("wallet-first authority does not replace the independent pack resource", () => {
  const state = fixture();
  const command = {
    ...COMMAND,
    authority: {
      authorityRef: "authority:existing", authorityVersion: 1,
      resourceRequestId: "request_existing", entitlementId: "ent_existing",
      issuedLinkId: "link_existing"
    }
  };
  assert.throws(() => createCoinCommerceDataPackFulfillmentHandler(state.dependencies)
    .execute(command), isCoinCommerceFulfillmentRetryableError);
  assert.deepEqual(state.calls, ["verify", "runtime", "edge", "effect", "notify", "desired", "receipts"]);
});

test("malformed immutable request time fails reconciliation before applying an effect", () => {
  const state = fixture();
  state.setRequestCreatedAt("not-a-date");
  assert.throws(() => createCoinCommerceDataPackFulfillmentHandler(state.dependencies)
    .execute(COMMAND), isCoinCommerceFulfillmentReconciliationError);
  assert.deepEqual(state.calls, ["verify", "runtime", "edge"]);
});

test("lost Commerce claim cannot start another pack fulfillment", () => {
  const state = fixture();
  state.loseLease();
  const handler = createCoinCommerceDataPackFulfillmentHandler(state.dependencies);
  assert.throws(() => handler.execute(COMMAND), isCoinCommerceFulfillmentRetryableError);
  assert.deepEqual(state.calls, ["verify"]);
});
