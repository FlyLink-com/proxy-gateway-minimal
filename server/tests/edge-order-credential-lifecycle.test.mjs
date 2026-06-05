import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrderCredentialLifecycleService
} from "../services/edge/order-credential-lifecycle.mjs";

const NOW = "2026-06-05T00:00:00.000Z";

function activeOrder(overrides = {}) {
  return {
    id: "pareq_active_001",
    portalUserRef: "portal_user_001",
    status: "delivered",
    expiresAt: "2026-07-05T00:00:00.000Z",
    edgeCredentialRef: "edgecred_pareq_active_001",
    edgeMaterialDigest: "digest_active_001",
    edgeChannelRef: "channel-aliyun-a-tuic",
    ...overrides
  };
}

test("order credential lifecycle dry-run builds redacted reconciliation without mutation", () => {
  const service = createOrderCredentialLifecycleService({
    channelRef: "channel-aliyun-a-tuic",
    nowFn: () => NOW,
    listOrders: () => [
      activeOrder(),
      activeOrder({
        id: "pareq_disabled_002",
        status: "disabled",
        edgeCredentialRef: "edgecred_disabled_002",
        edgeMaterialDigest: "digest_disabled_002"
      })
    ],
    listCurrentCredentials: () => [
      {
        credentialRef: "edgecred_stale_001",
        materialDigest: "digest_stale_001"
      }
    ]
  });

  const report = service.reconcileOrderLifecycle({
    reason: "order_refreshed",
    order: {
      id: "pareq_active_001",
      status: "delivered"
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "plan");
  assert.equal(report.channelRef, "channel-aliyun-a-tuic");
  assert.equal(report.summary.addCount, 1);
  assert.equal(report.summary.revokeCount, 1);
  assert.equal(report.mutation, false);
  assert.equal(report.redacted, true);
  assert.doesNotMatch(JSON.stringify(report), /digest_disabled_002|uuid|password|subscriptionUrl/i);
});

test("order credential lifecycle apply records a redacted edge receipt", () => {
  const receipts = [];
  const service = createOrderCredentialLifecycleService({
    channelRef: "channel-aliyun-a-tuic",
    nowFn: () => NOW,
    executeProductionMutation: true,
    listOrders: () => [activeOrder()],
    listCurrentCredentials: () => [],
    runtimeAdapter: {
      applyCredentialReconciliation() {
        return {
          status: "applied",
          mutation: true,
          backupRef: "backup_aliyun_001",
          configTest: {
            exitCode: 0,
            ok: true
          },
          service: {
            name: "mihomo-tuic.service",
            active: true,
            restarted: true
          },
          listener: {
            udp443: true
          },
          appliedAt: NOW
        };
      }
    },
    receiptStore: {
      recordEdgeApplyReceipt(receipt) {
        receipts.push(receipt);
        return receipt;
      }
    },
    receiptIdFactory: () => "edge_receipt_001",
    desiredStateRefFactory: () => "desired_state_orders_001"
  });

  const report = service.reconcileOrderLifecycle({
    reason: "order_created",
    order: {
      id: "pareq_active_001",
      status: "delivered"
    }
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, "apply");
  assert.equal(report.nextAction, "validate_runtime_state");
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0], {
    id: "edge_receipt_001",
    channelRef: "channel-aliyun-a-tuic",
    desiredStateRef: "desired_state_orders_001",
    status: "applied",
    actionCounts: {
      add: 1,
      revoke: 0,
      rotate: 0,
      unchanged: 0
    },
    configTestOk: true,
    serviceActive: true,
    listenerUdp443: true,
    backupRef: "backup_aliyun_001",
    rollbackRef: undefined,
    appliedAt: NOW,
    createdAt: NOW
  });
  assert.doesNotMatch(JSON.stringify(report), /uuid|password|subscriptionUrl|rawConfig/i);
});
