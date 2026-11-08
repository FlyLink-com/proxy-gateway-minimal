import assert from "node:assert/strict";
import test from "node:test";

import {
  createWalletFirstCurrentResourceSetupDelivery
} from "../services/platform/wallet-first-current-resource-setup-delivery.mjs";

const NOW = "2026-08-14T00:00:00.000Z";
const HANDOFF_REF = "setup_handoff_alpha";
const IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_REF = "portal_session_alpha";
const SUBSCRIPTION_URL = "https://portal.example.test/sub/clash.yaml?token=opaque-test-token";
const BINDING = Object.freeze({
  handoffRef: HANDOFF_REF,
  initialTransitionRef: "transition_initial_alpha",
  transitionRef: "transition_alpha",
  effectRef: "effect_alpha",
  tenantId: "tenant_alpha",
  artifactId: "artifact_alpha",
  tenantRef: "tenantref_alpha",
  artifactRef: "artifactref_alpha"
});

function escrowBinding() {
  return {
    transitionRef: BINDING.transitionRef,
    effectRef: BINDING.effectRef,
    tenantId: BINDING.tenantId,
    artifactId: BINDING.artifactId
  };
}

function createControlStore(overrides = {}) {
  const calls = {
    availability: [],
    claim: [],
    binding: [],
    acknowledgementBinding: [],
    acknowledge: [],
    reconciliation: []
  };
  const controlStore = {
    readWalletFirstSetupDeliveryAvailabilityBinding(input) {
      calls.availability.push(structuredClone(input));
      return {
        state: "available",
        handoffRef: HANDOFF_REF,
        binding: structuredClone(BINDING)
      };
    },
    claimWalletFirstSetupDeliveryHandoff(input) {
      calls.claim.push(structuredClone(input));
      return {
        state: "claimed",
        handoffRef: HANDOFF_REF,
        claimGeneration: 1,
        binding: structuredClone(BINDING)
      };
    },
    readWalletFirstSetupDeliveryBinding(input) {
      calls.binding.push(structuredClone(input));
      return {
        state: "claimed",
        handoffRef: HANDOFF_REF,
        claimGeneration: 1,
        binding: structuredClone(BINDING)
      };
    },
    readWalletFirstSetupDeliveryAcknowledgementBinding(input) {
      calls.acknowledgementBinding.push(structuredClone(input));
      return {
        state: "claimed",
        handoffRef: HANDOFF_REF,
        claimGeneration: 1,
        binding: structuredClone(BINDING)
      };
    },
    acknowledgeWalletFirstSetupDeliveryHandoff(input) {
      calls.acknowledge.push(structuredClone(input));
      return { state: "delivered" };
    },
    markWalletFirstSetupDeliveryHandoffReconciliationRequired(input) {
      calls.reconciliation.push(structuredClone(input));
      return { state: "reconciliation_required" };
    },
    ...overrides
  };
  return { controlStore, calls };
}

function createDeliveryEscrow(overrides = {}) {
  const calls = {
    summary: [],
    release: [],
    acknowledge: []
  };
  const deliveryEscrow = {
    getSetupDeliverySummary(input) {
      calls.summary.push(structuredClone(input));
      return {
        version: "wallet_first_setup_delivery_escrow_v1",
        state: "available",
        handoffRef: HANDOFF_REF,
        bindingDigest: "a".repeat(64),
        resourceDigest: "b".repeat(64)
      };
    },
    releaseSetupDelivery(input) {
      calls.release.push(structuredClone(input));
      return { handoffRef: HANDOFF_REF, subscriptionUrl: SUBSCRIPTION_URL };
    },
    acknowledgeSetupDelivery(input) {
      calls.acknowledge.push(structuredClone(input));
      return { handoffRef: HANDOFF_REF, status: "acknowledged" };
    },
    ...overrides
  };
  return { deliveryEscrow, calls };
}

function createService({ control = {}, escrow = {} } = {}) {
  const { controlStore, calls: controlCalls } = createControlStore(control);
  const { deliveryEscrow, calls: escrowCalls } = createDeliveryEscrow(escrow);
  return {
    service: createWalletFirstCurrentResourceSetupDelivery({
      controlStore,
      deliveryEscrow,
      nowFn: () => NOW
    }),
    controlCalls,
    escrowCalls
  };
}

test("wallet-first setup delivery releases the escrowed URL only after an account/session-bound claim and exact binding recheck", () => {
  const { service, controlCalls, escrowCalls } = createService();

  const result = service.deliverSetup({
    accountId: "acct_alpha",
    sessionRef: SESSION_REF,
    idempotencyKey: IDEMPOTENCY_KEY
  });

  assert.deepEqual(result, {
    delivery: {
      handoffRef: HANDOFF_REF,
      kind: "subscription_url",
      subscriptionUrl: SUBSCRIPTION_URL
    }
  });
  assert.deepEqual(controlCalls.availability, []);
  assert.equal(controlCalls.claim.length, 1);
  assert.deepEqual(Object.keys(controlCalls.claim[0]).sort(), [
    "accountId",
    "idempotencyKeyHash",
    "leaseMs",
    "now",
    "sessionBindingHash"
  ]);
  assert.equal(controlCalls.claim[0].accountId, "acct_alpha");
  assert.equal(controlCalls.claim[0].now, NOW);
  assert.equal(controlCalls.claim[0].leaseMs, 600_000);
  assert.match(controlCalls.claim[0].idempotencyKeyHash, /^[a-f0-9]{64}$/);
  assert.match(controlCalls.claim[0].sessionBindingHash, /^[a-f0-9]{64}$/);
  assert.notEqual(controlCalls.claim[0].idempotencyKeyHash, IDEMPOTENCY_KEY);
  assert.notEqual(controlCalls.claim[0].sessionBindingHash, SESSION_REF);
  assert.equal(controlCalls.binding.length, 1);
  assert.deepEqual(Object.keys(controlCalls.binding[0]).sort(), [
    "accountId",
    "handoffRef",
    "now",
    "sessionBindingHash"
  ]);
  assert.deepEqual(escrowCalls.summary, [escrowBinding()]);
  assert.deepEqual(escrowCalls.release, [{ handoffRef: HANDOFF_REF, ...escrowBinding() }]);
  assert.deepEqual(escrowCalls.acknowledge, []);
  assert.doesNotMatch(
    JSON.stringify(result),
    /account|entitlement|request|issued|link|tenant|artifact|node|transition|material|digest/i
  );
});

test("wallet-first setup delivery accepts the control store's safe runtime identifier grammar only for escrow runtime IDs", () => {
  const binding = Object.freeze({
    ...BINDING,
    tenantId: "Tenant-Alpha_01",
    artifactId: "Artifact-Beta_02"
  });
  const { service, escrowCalls } = createService({
    control: {
      claimWalletFirstSetupDeliveryHandoff() {
        return {
          state: "claimed",
          handoffRef: HANDOFF_REF,
          claimGeneration: 1,
          binding: structuredClone(binding)
        };
      },
      readWalletFirstSetupDeliveryBinding() {
        return {
          state: "claimed",
          handoffRef: HANDOFF_REF,
          claimGeneration: 1,
          binding: structuredClone(binding)
        };
      }
    }
  });

  service.deliverSetup({
    accountId: "acct_alpha",
    sessionRef: SESSION_REF,
    idempotencyKey: IDEMPOTENCY_KEY
  });

  assert.deepEqual(escrowCalls.release, [{
    handoffRef: HANDOFF_REF,
    transitionRef: binding.transitionRef,
    effectRef: binding.effectRef,
    tenantId: binding.tenantId,
    artifactId: binding.artifactId
  }]);
});

test("wallet-first setup delivery exposes availability only after the control binding and escrow summary agree", () => {
  const { service, controlCalls, escrowCalls } = createService();

  assert.equal(service.getSetupAvailability({ accountId: "acct_alpha" }), true);
  assert.deepEqual(controlCalls.availability, [{ accountId: "acct_alpha", now: NOW }]);
  assert.deepEqual(escrowCalls.summary, [escrowBinding()]);

  const none = createService({
    control: {
      readWalletFirstSetupDeliveryAvailabilityBinding() {
        return { state: "none" };
      }
    }
  });
  assert.equal(none.service.getSetupAvailability({ accountId: "acct_alpha" }), false);
  assert.deepEqual(none.escrowCalls.summary, []);
});

test("wallet-first setup delivery rejects malformed caller input, non-HTTPS material, and ambiguous control or escrow state without returning material", () => {
  let unsafeReleaseCalls = 0;
  const { service, escrowCalls } = createService({
    escrow: {
      releaseSetupDelivery() {
        unsafeReleaseCalls += 1;
        return {
          handoffRef: HANDOFF_REF,
          subscriptionUrl: "http://portal.example.test/sub/clash.yaml?token=must-not-release"
        };
      }
    }
  });

  for (const input of [
    {},
    { accountId: "acct_alpha", sessionRef: SESSION_REF },
    { accountId: "acct_alpha", sessionRef: SESSION_REF, idempotencyKey: "short" },
    { accountId: "acct_alpha", sessionRef: SESSION_REF, idempotencyKey: "setup-idempotency-key-alpha-0001" },
    {
      accountId: "acct_alpha",
      sessionRef: SESSION_REF,
      idempotencyKey: IDEMPOTENCY_KEY,
      tenantId: "caller_must_not_select_resource"
    }
  ]) {
    assert.throws(
      () => service.deliverSetup(input),
      (error) => error?.code === "validation_error"
    );
  }

  assert.throws(
    () => service.deliverSetup({
      accountId: "acct_alpha",
      sessionRef: SESSION_REF,
      idempotencyKey: IDEMPOTENCY_KEY
    }),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
  assert.equal(unsafeReleaseCalls, 1);
  assert.deepEqual(escrowCalls.release, []);

  const mismatch = createService({
    escrow: {
      getSetupDeliverySummary() {
        return {
          version: "wallet_first_setup_delivery_escrow_v1",
          state: "available",
          handoffRef: "setup_handoff_other",
          bindingDigest: "b".repeat(64),
          resourceDigest: "c".repeat(64)
        };
      }
    }
  });
  assert.throws(
    () => mismatch.service.getSetupAvailability({ accountId: "acct_alpha" }),
    (error) => error?.code === "wallet_first_setup_delivery_unavailable"
  );
  assert.deepEqual(mismatch.escrowCalls.release, []);
});

test("wallet-first setup acknowledgement revalidates the same session-bound claim, acknowledges control first, then removes escrowed material", () => {
  const { service, controlCalls, escrowCalls } = createService();

  assert.equal(service.acknowledgeSetup({
    accountId: "acct_alpha",
    sessionRef: SESSION_REF,
    handoffRef: HANDOFF_REF
  }), undefined);

  assert.equal(controlCalls.acknowledgementBinding.length, 1);
  assert.equal(controlCalls.acknowledge.length, 1);
  assert.deepEqual(Object.keys(controlCalls.acknowledge[0]).sort(), [
    "accountId",
    "handoffRef",
    "now",
    "sessionBindingHash"
  ]);
  assert.match(controlCalls.acknowledge[0].sessionBindingHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(escrowCalls.acknowledge, [{ handoffRef: HANDOFF_REF, ...escrowBinding() }]);
  assert.deepEqual(escrowCalls.release, []);
  assert.deepEqual(escrowCalls.summary, [escrowBinding()]);
});

test("wallet-first acknowledgement retries only escrow cleanup after a durable control acknowledgement and never re-releases material", () => {
  let handoffState = "claimed";
  let escrowCleanupAttempts = 0;
  let releases = 0;
  const { service, controlCalls, escrowCalls } = createService({
    control: {
      readWalletFirstSetupDeliveryAcknowledgementBinding() {
        return handoffState === "claimed"
          ? {
            state: "claimed",
            handoffRef: HANDOFF_REF,
            claimGeneration: 1,
            binding: structuredClone(BINDING)
          }
          : {
            state: "delivered",
            handoffRef: HANDOFF_REF,
            binding: structuredClone(BINDING)
          };
      },
      acknowledgeWalletFirstSetupDeliveryHandoff(input) {
        controlCalls.acknowledge.push(structuredClone(input));
        handoffState = "delivered";
        return { state: "delivered" };
      }
    },
    escrow: {
      releaseSetupDelivery() {
        releases += 1;
        return { handoffRef: HANDOFF_REF, subscriptionUrl: SUBSCRIPTION_URL };
      },
      acknowledgeSetupDelivery(input) {
        escrowCalls.acknowledge.push(structuredClone(input));
        escrowCleanupAttempts += 1;
        if (escrowCleanupAttempts === 1) {
          const error = new Error("synthetic secure-delete fault");
          error.code = "wallet_first_setup_delivery_reconciliation_required";
          throw error;
        }
        return { handoffRef: HANDOFF_REF, status: "acknowledged" };
      }
    }
  });

  assert.throws(
    () => service.acknowledgeSetup({
      accountId: "acct_alpha",
      sessionRef: SESSION_REF,
      handoffRef: HANDOFF_REF
    }),
    (error) => error?.code === "wallet_first_setup_delivery_unavailable"
  );
  assert.equal(handoffState, "delivered");
  assert.equal(releases, 0);

  assert.equal(service.acknowledgeSetup({
    accountId: "acct_alpha",
    sessionRef: SESSION_REF,
    handoffRef: HANDOFF_REF
  }), undefined);
  assert.equal(escrowCleanupAttempts, 2);
  assert.equal(releases, 0);
  assert.equal(controlCalls.acknowledge.length, 2);
});

test("wallet-first setup refuses a delivered handoff and rejects a different session before either material release or cleanup", () => {
  const delivered = createService({
    control: {
      claimWalletFirstSetupDeliveryHandoff() {
        return { state: "delivered" };
      }
    }
  });
  assert.throws(
    () => delivered.service.deliverSetup({
      accountId: "acct_alpha",
      sessionRef: SESSION_REF,
      idempotencyKey: IDEMPOTENCY_KEY
    }),
    (error) => error?.code === "wallet_first_setup_delivery_unavailable"
  );
  assert.deepEqual(delivered.escrowCalls.release, []);

  const differentSession = createService({
    control: {
      readWalletFirstSetupDeliveryAcknowledgementBinding() {
        const error = new Error("claim belongs to a different session");
        error.code = "claim_lost";
        throw error;
      }
    }
  });
  assert.throws(
    () => differentSession.service.acknowledgeSetup({
      accountId: "acct_alpha",
      sessionRef: "portal_session_other",
      handoffRef: HANDOFF_REF
    }),
    (error) => error?.code === "wallet_first_setup_delivery_reconciliation_required"
  );
  assert.deepEqual(differentSession.escrowCalls.release, []);
  assert.deepEqual(differentSession.escrowCalls.acknowledge, []);
});
