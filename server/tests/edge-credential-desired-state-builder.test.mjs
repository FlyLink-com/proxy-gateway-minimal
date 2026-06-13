import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEdgeCredentialDesiredState
} from "../services/edge/credential-desired-state-builder.mjs";

const NOW = "2026-06-05T00:00:00.000Z";

function order(overrides = {}) {
  return {
    id: "pareq_active_001",
    portalUserRef: "portal_user_001",
    status: "delivered",
    expiresAt: "2026-07-05T00:00:00.000Z",
    validUntil: "2026-07-05T00:00:00.000Z",
    edgeCredentialRef: "edgecred_pareq_active_001",
    edgeMaterialDigest: "digest_active_001",
    edgeChannelRef: "channel-aliyun-a-tuic",
    ...overrides
  };
}

test("desired-state builder includes only active non-expired order credentials without leaking material", () => {
  const state = buildEdgeCredentialDesiredState({
    channelRef: "channel-aliyun-a-tuic",
    desiredStateRef: "desired_state_portal_orders_001",
    now: NOW,
    orders: [
      order(),
      order({
        id: "pareq_issued_002",
        status: "issued",
        portalUserRef: "portal_user_002",
        edgeCredentialRef: "edgecred_pareq_issued_002",
        edgeMaterialDigest: "digest_issued_002"
      }),
      order({
        id: "pareq_disabled_003",
        status: "disabled",
        edgeCredentialRef: "edgecred_disabled",
        edgeMaterialDigest: "digest_disabled"
      }),
      order({
        id: "pareq_expired_004",
        expiresAt: "2026-06-04T23:59:59.000Z",
        validUntil: "2026-06-04T23:59:59.000Z",
        edgeCredentialRef: "edgecred_expired",
        edgeMaterialDigest: "digest_expired"
      }),
      order({
        id: "pareq_rejected_005",
        status: "rejected",
        edgeCredentialRef: "edgecred_rejected",
        edgeMaterialDigest: "digest_rejected"
      })
    ],
    currentCredentials: [
      {
        credentialRef: "edgecred_stale_001",
        materialDigest: "digest_stale_001"
      }
    ]
  });

  assert.equal(state.channelRef, "channel-aliyun-a-tuic");
  assert.equal(state.runtime, "mihomo-tuic");
  assert.equal(state.activationSurface, "explicit-restart");
  assert.equal(state.desiredStateRef, "desired_state_portal_orders_001");
  assert.deepEqual(state.desiredCredentials.map((credential) => credential.credentialRef), [
    "edgecred_pareq_active_001",
    "edgecred_pareq_issued_002"
  ]);
  assert.deepEqual(state.desiredCredentials.map((credential) => credential.orderRef), [
    "pareq_active_001",
    "pareq_issued_002"
  ]);
  assert.deepEqual(state.currentCredentials, [
    {
      credentialRef: "edgecred_stale_001",
      materialDigest: "digest_stale_001"
    }
  ]);
  assert.equal(state.summary.includedCount, 2);
  assert.equal(state.summary.skippedCount, 3);
  assert.equal(state.redacted, true);
  assert.doesNotMatch(JSON.stringify(state), /uuid|password|digest_disabled|digest_expired|digest_rejected/i);
});

test("desired-state builder fails closed for missing safe credential facts", () => {
  assert.throws(
    () => buildEdgeCredentialDesiredState({
      channelRef: "channel-aliyun-a-tuic",
      desiredStateRef: "desired_state_missing_material",
      now: NOW,
      orders: [
        order({
          edgeCredentialRef: "",
          edgeMaterialDigest: ""
        })
      ]
    }),
    (error) => error.code === "validation_error" && /edge credential/.test(error.message)
  );
});
