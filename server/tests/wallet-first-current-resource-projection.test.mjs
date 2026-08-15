import assert from "node:assert/strict";
import test from "node:test";

import {
  createWalletFirstCurrentResourceProjection
} from "../services/platform/wallet-first-current-resource-projection.mjs";
import {
  createWalletFirstCurrentResourceSetupDelivery
} from "../services/platform/wallet-first-current-resource-setup-delivery.mjs";

const AVAILABLE_RESOURCE = Object.freeze({
  state: "available",
  plan: Object.freeze({
    id: "monthly_30d_50gb",
    durationDays: 30,
    monthlyTrafficGb: 50
  }),
  validUntil: "2026-09-13T00:00:00.000Z",
  setupAvailable: false
});

const SETUP_BINDING = Object.freeze({
  handoffRef: "setup_handoff_alpha",
  initialTransitionRef: "transition_initial_alpha",
  transitionRef: "transition_alpha",
  effectRef: "effect_alpha",
  tenantId: "tenant_alpha",
  artifactId: "artifact_alpha",
  tenantRef: "tenantref_alpha",
  artifactRef: "artifactref_alpha"
});

function createVerifiedSetupDelivery() {
  return createWalletFirstCurrentResourceSetupDelivery({
    controlStore: {
      readWalletFirstSetupDeliveryAvailabilityBinding() {
        return {
          state: "available",
          handoffRef: "setup_handoff_alpha",
          binding: structuredClone(SETUP_BINDING)
        };
      },
      claimWalletFirstSetupDeliveryHandoff() {
        return {
          state: "claimed",
          handoffRef: "setup_handoff_alpha",
          claimGeneration: 1,
          binding: structuredClone(SETUP_BINDING)
        };
      },
      readWalletFirstSetupDeliveryBinding() {
        return {
          state: "claimed",
          handoffRef: "setup_handoff_alpha",
          claimGeneration: 1,
          binding: structuredClone(SETUP_BINDING)
        };
      },
      readWalletFirstSetupDeliveryAcknowledgementBinding() {
        return {
          state: "claimed",
          handoffRef: "setup_handoff_alpha",
          claimGeneration: 1,
          binding: structuredClone(SETUP_BINDING)
        };
      },
      acknowledgeWalletFirstSetupDeliveryHandoff() {
        return { state: "delivered" };
      },
      markWalletFirstSetupDeliveryHandoffReconciliationRequired() {
        return { state: "reconciliation_required" };
      }
    },
    deliveryEscrow: {
      getSetupDeliverySummary() {
        return {
          version: "wallet_first_setup_delivery_escrow_v1",
          state: "available",
          handoffRef: "setup_handoff_alpha",
          bindingDigest: "a".repeat(64),
          resourceDigest: "b".repeat(64)
        };
      },
      releaseSetupDelivery() {
        return {
          handoffRef: "setup_handoff_alpha",
          subscriptionUrl: "https://portal.example.test/sub/clash.yaml?token=not-returned-here"
        };
      },
      acknowledgeSetupDelivery() {
        return { handoffRef: "setup_handoff_alpha", status: "acknowledged" };
      }
    },
    nowFn: () => "2026-08-14T00:00:00.000Z"
  });
}

function createControlStore(result, calls) {
  return {
    readWalletFirstCurrentResourceProjection(input) {
      calls.push(structuredClone(input));
      if (result instanceof Error) throw result;
      return structuredClone(result);
    }
  };
}

test("wallet-first current-resource projection forwards only the session-owned account and emits the narrow available DTO", () => {
  const calls = [];
  const service = createWalletFirstCurrentResourceProjection({
    controlStore: createControlStore(AVAILABLE_RESOURCE, calls)
  });

  const resource = service.getCurrentResource({ accountId: "acct_alpha" });

  assert.deepEqual(resource, AVAILABLE_RESOURCE);
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);
  assert.doesNotMatch(
    JSON.stringify(resource),
    /account|entitlement|request|issued|link|tenant|artifact|node|transition|url|material/i
  );
});

test("wallet-first current-resource projection permits only the three public states and fails closed for malformed store output", () => {
  for (const resource of [
    { state: "none" },
    { state: "reconciliation_required" }
  ]) {
    const service = createWalletFirstCurrentResourceProjection({
      controlStore: createControlStore(resource, [])
    });
    assert.deepEqual(service.getCurrentResource({ accountId: "acct_alpha" }), resource);
  }

  for (const malformedResource of [
    {
      ...AVAILABLE_RESOURCE,
      internalReference: "must-not-cross-boundary"
    },
    {
      ...AVAILABLE_RESOURCE,
      setupAvailable: true
    },
    { state: "future_unclassified_state" },
    new Proxy({ state: "none" }, {})
  ]) {
    const malformed = createWalletFirstCurrentResourceProjection({
      controlStore: createControlStore(malformedResource, [])
    });
    assert.throws(
      () => malformed.getCurrentResource({ accountId: "acct_alpha" }),
      (error) => error?.code === "wallet_first_current_resource_unavailable"
    );
  }
});

test("wallet-first current-resource projection never relabels an unavailable control-store read as none", () => {
  const unavailable = new Error("control store is unavailable");
  const service = createWalletFirstCurrentResourceProjection({
    controlStore: createControlStore(unavailable, [])
  });

  assert.throws(
    () => service.getCurrentResource({ accountId: "acct_alpha" }),
    (error) => error?.code === "wallet_first_current_resource_unavailable"
  );
});

test("wallet-first current-resource projection signals setup availability only through a separately verified branded delivery service", () => {
  const calls = [];
  const service = createWalletFirstCurrentResourceProjection({
    controlStore: createControlStore(AVAILABLE_RESOURCE, calls),
    setupDelivery: createVerifiedSetupDelivery()
  });

  assert.deepEqual(service.getCurrentResource({ accountId: "acct_alpha" }), {
    ...AVAILABLE_RESOURCE,
    setupAvailable: true
  });
  assert.deepEqual(calls, [{ accountId: "acct_alpha" }]);

  assert.throws(
    () => createWalletFirstCurrentResourceProjection({
      controlStore: createControlStore(AVAILABLE_RESOURCE, []),
      setupDelivery: {
        getSetupAvailability() {
          return true;
        }
      }
    }),
    (error) => error?.code === "wallet_first_current_resource_unavailable"
  );
});
