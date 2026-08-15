import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeferredResourceTransitionCoordinator
} from "../services/platform/deferred-resource-transition-coordinator.mjs";

const NOW = "2026-08-13T00:00:00.000Z";
const ACTIVE_UNTIL = NOW;
const RESERVATION_EXPIRES_AT = "2026-08-14T00:00:00.000Z";
const NEXT_UNTIL = "2026-09-12T00:00:00.000Z";
const LEASE_TOKEN = "a".repeat(64);
const REBASE_LEASE_TOKEN = "b".repeat(64);
const FULL_PLAN_OFFER = Object.freeze({
  offerRef: "offer_yearly_200",
  offerVersionRef: "offerv_yearly_200_v1",
  version: 1,
  category: "plan",
  title: Object.freeze({ zh: "年度套餐", en: "Annual plan" }),
  summary: Object.freeze({ zh: "每月 200 GB", en: "200 GB per month" }),
  importantNotices: Object.freeze({
    zh: Object.freeze(["仅用于平台订阅服务"]),
    en: Object.freeze(["Platform subscription only"])
  }),
  baseCoinUnits: 200,
  referencePrice: Object.freeze({ currency: "CNY", amountMinor: 20_000 }),
  acceptedCoinTypes: Object.freeze(["paid_coins"]),
  delivery: Object.freeze({
    kind: "subscription_plan",
    durationDays: 365,
    monthlyTrafficGb: 200,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  })
});

function claim(overrides = {}) {
  return {
    transitionRef: "transition_test",
    accountId: "account_test",
    orderRef: "order_test",
    reservationRef: "reservation_test",
    flowKind: "scheduled_switch",
    offer: FULL_PLAN_OFFER,
    amountUnits: 200,
    allocationSnapshot: [{
      lotRef: "lot_paid_test",
      allocationSequence: 1,
      coinType: "paid_coins",
      allocatedUnits: 200,
      expiresAt: null
    }],
    scheduledFor: ACTIVE_UNTIL,
    expectedEntitlementId: "entitlement_test",
    expectedRequestId: "request_test",
    expectedIssuedLinkId: "link_test",
    expectedValidUntil: ACTIVE_UNTIL,
    leaseGeneration: 1,
    leaseToken: LEASE_TOKEN,
    ...overrides
  };
}

function verifiedReservation(overrides = {}) {
  return {
    ok: true,
    reservationRef: "reservation_test",
    state: "reserved",
    activationAt: ACTIVE_UNTIL,
    expiresAt: RESERVATION_EXPIRES_AT,
    allocationSnapshot: claim().allocationSnapshot,
    ...overrides
  };
}

function appliedEffect(overrides = {}) {
  return {
    status: "applied",
    effectRef: "effect_test",
    nextEntitlementId: "entitlement_test",
    nextRequestId: "request_test",
    nextIssuedLinkId: "link_test",
    nextValidUntil: NEXT_UNTIL,
    ...overrides
  };
}

function rebaseClaim(overrides = {}) {
  return {
    settledTransitionRef: "transition_settled_test",
    accountId: "account_test",
    effectRef: "effect_settled_test",
    successor: {
      entitlementId: "entitlement_test",
      requestId: "request_test",
      issuedLinkId: "link_test",
      validUntil: NEXT_UNTIL
    },
    leaseGeneration: 1,
    leaseToken: REBASE_LEASE_TOKEN,
    leaseUntil: "2026-08-13T00:00:30.000Z",
    ...overrides
  };
}

function completedRebase(overrides = {}) {
  const outbox = rebaseClaim();
  return {
    settledTransitionRef: outbox.settledTransitionRef,
    accountId: outbox.accountId,
    effectRef: outbox.effectRef,
    state: "completed",
    safeCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    successor: outbox.successor,
    ...overrides
  };
}

function reconciledRebase(overrides = {}) {
  return completedRebase({
    state: "reconciliation_required",
    safeCode: "deferred_rebase_apply_unknown",
    completedAt: null,
    ...overrides
  });
}

function createHarness({
  claims = [],
  claimNext = undefined,
  recoverableClaims = [],
  claimNextRecoverable = undefined,
  pendingRebases = [],
  claimNextPendingRebase = undefined,
  reservation = undefined,
  assessment = undefined,
  resolvedEffect = undefined,
  apply = undefined,
  record = undefined,
  settle = undefined,
  applyClaimedRebase = undefined,
  reconcileRebase = undefined,
  reconcile = undefined,
  requote = undefined,
  reservationLifecycleContract = "deferred-transition-store-reservation-lifecycle/v1"
} = {}) {
  const queue = [...claims];
  const recoverableQueue = [...recoverableClaims];
  const pendingRebaseQueue = [...pendingRebases];
  const calls = [];
  const resolve = (value, input, fallback) => {
    if (typeof value === "function") return value(input);
    if (value instanceof Error) throw value;
    return value === undefined ? fallback : value;
  };
  const store = {
    reservationLifecycleContract,
    claimNextRecoverableEffectAppliedTransition(input) {
      calls.push(["recover", input]);
      if (claimNextRecoverable !== undefined) {
        return resolve(claimNextRecoverable, input, null);
      }
      return recoverableQueue.shift() ?? null;
    },
    claimNextPendingRebase(input) {
      calls.push(["rebaseClaim", input]);
      if (claimNextPendingRebase !== undefined) {
        return resolve(claimNextPendingRebase, input, null);
      }
      return pendingRebaseQueue.shift() ?? null;
    },
    claimNextDueTransition(input) {
      calls.push(["claim", input]);
      if (claimNext !== undefined) return resolve(claimNext, input, null);
      return queue.shift() ?? null;
    },
    verifyClaimedTransitionReservation(input) {
      calls.push(["reservation", input]);
      return resolve(reservation, input, verifiedReservation());
    },
    requireRequote(input) {
      calls.push(["requote", input]);
      return resolve(requote, input, { state: "requote_required" });
    },
    recordEffectApplied(input) {
      calls.push(["record", input]);
      return resolve(record, input, { state: "effect_applied", effectRef: input.effectRef });
    },
    settleTransition(input) {
      calls.push(["settle", input]);
      return resolve(settle, input, { state: "settled" });
    },
    applyClaimedRebase(input) {
      calls.push(["rebaseApply", input]);
      return resolve(applyClaimedRebase, input, completedRebase({
        settledTransitionRef: input.settledTransitionRef
      }));
    },
    reconcileRebase(input) {
      calls.push(["rebaseReconcile", input]);
      return resolve(reconcileRebase, input, reconciledRebase({
        settledTransitionRef: input.settledTransitionRef
      }));
    },
    reconcileTransition(input) {
      calls.push(["reconcile", input]);
      return resolve(reconcile, input, { state: "reconciliation_required" });
    }
  };
  const resourceEffectHandler = {
    idempotencyContract: "deduplicate_by_transition_ref",
    revalidateDeferredResourceTransition(input) {
      calls.push(["revalidate", input]);
      return resolve(assessment, input, { status: "ready" });
    },
    resolveDeferredResourceTransitionEffect(input) {
      calls.push(["resolve", input]);
      return resolve(resolvedEffect, input, null);
    },
    applyDeferredResourceTransition(input) {
      calls.push(["effect", input]);
      return resolve(apply, input, appliedEffect());
    }
  };
  const timers = [];
  const coordinator = createDeferredResourceTransitionCoordinator({
    store,
    resourceEffectHandler,
    nowFn: () => new Date(NOW),
    leaseMs: 30_000,
    batchSize: 5,
    pollIntervalMs: 60_000,
    scheduleFn(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearScheduleFn(timer) {
      timer.cleared = true;
    }
  });
  return { calls, coordinator, timers };
}

test("deferred transition coordinator applies exactly one effect, captures after its receipt, and queues a durable rebase", async () => {
  const { calls, coordinator } = createHarness({ claims: [claim()] });

  const result = await coordinator.runOnce();

  assert.deepEqual(result, {
    claimed: 1,
    requoteRequired: 0,
    effectApplied: 1,
    settled: 1,
    rebased: 0,
    rebasePending: 0,
    reconciliationRequired: 0
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "recover", "rebaseClaim", "claim", "resolve", "reservation", "revalidate", "effect", "record", "settle", "claim"
  ]);
  assert.deepEqual(calls[3][1], { transitionRef: "transition_test" });
  const expectedResourceInput = {
    transitionRef: "transition_test",
    accountId: "account_test",
    orderRef: "order_test",
    flowKind: "scheduled_switch",
    offer: claim().offer,
    scheduledFor: ACTIVE_UNTIL,
    expectedEntitlementId: "entitlement_test",
    expectedRequestId: "request_test",
    expectedIssuedLinkId: "link_test",
    expectedValidUntil: ACTIVE_UNTIL,
    activationAt: NOW
  };
  assert.deepEqual(calls[5][1], expectedResourceInput);
  assert.deepEqual(calls[6][1], expectedResourceInput);
  assert.deepEqual(calls[7][1], {
    transitionRef: "transition_test",
    leaseGeneration: 1,
    leaseToken: LEASE_TOKEN,
    effectRef: "effect_test",
    successor: {
      entitlementId: "entitlement_test",
      requestId: "request_test",
      issuedLinkId: "link_test",
      validUntil: NEXT_UNTIL
    },
    operation: {
      actorScope: "deferred:account_test",
      idempotencyKey: "deferred_record_transition_test_1",
      actorType: "commerce_system",
      actorRef: "deferred_resource_transition_coordinator"
    }
  });
});

test("coordinator settles an initial effect with a setup handoff but never persists that optional result field", async () => {
  const initial = claim({
    flowKind: "initial_activation",
    expectedEntitlementId: null,
    expectedRequestId: null,
    expectedIssuedLinkId: null,
    expectedValidUntil: null
  });
  const { calls, coordinator } = createHarness({
    claims: [initial],
    apply: appliedEffect({
      setupDeliveryHandoffRef: `wfxsetup_${"a".repeat(48)}`
    })
  });

  const result = await coordinator.runOnce();

  assert.equal(result.effectApplied, 1);
  assert.equal(result.settled, 1);
  assert.equal(result.reconciliationRequired, 0);
  const record = calls.find(([name]) => name === "record")[1];
  assert.equal(Object.hasOwn(record, "setupDeliveryHandoffRef"), false);
});

test("coordinator rejects a setup handoff from a scheduled effect before record or settlement", async () => {
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    apply: appliedEffect({
      setupDeliveryHandoffRef: `wfxsetup_${"b".repeat(48)}`
    })
  });

  const result = await coordinator.runOnce();

  assert.equal(result.effectApplied, 0);
  assert.equal(result.settled, 0);
  assert.equal(result.reconciliationRequired, 1);
  assert.equal(calls.some(([name]) => name === "record"), false);
  assert.equal(calls.some(([name]) => name === "settle"), false);
  assert.equal(
    calls.find(([name]) => name === "reconcile")[1].safeCode,
    "deferred_effect_outcome_unknown"
  );
});

test("an expiring bonus allocation becomes requote_required before any resource effect", async () => {
  const expiring = claim({
    allocationSnapshot: [{
      lotRef: "lot_bonus_test",
      allocationSequence: 1,
      coinType: "bonus_coins",
      allocatedUnits: 200,
      expiresAt: NOW
    }]
  });
  const { calls, coordinator } = createHarness({
    claims: [expiring],
    reservation: verifiedReservation({
      allocationSnapshot: expiring.allocationSnapshot
    })
  });

  const result = await coordinator.runOnce();

  assert.equal(result.requoteRequired, 1);
  assert.equal(result.effectApplied, 0);
  assert.equal(calls.some(([name]) => name === "effect"), false);
  assert.deepEqual(calls[5], ["requote", {
    transitionRef: "transition_test",
    leaseGeneration: 1,
    leaseToken: LEASE_TOKEN,
    safeCode: "deferred_bonus_expires_before_reservation_recovery",
    operation: {
      actorScope: "deferred:account_test",
      idempotencyKey: "deferred_requote_transition_test_1",
      actorType: "commerce_system",
      actorRef: "deferred_resource_transition_coordinator"
    }
  }]);
});

test("a bonus that expires during the reservation recovery grace requires requote", async () => {
  const graceExpiring = claim({
    allocationSnapshot: [{
      lotRef: "lot_bonus_grace_test",
      allocationSequence: 1,
      coinType: "bonus_coins",
      allocatedUnits: 200,
      expiresAt: "2026-08-13T12:00:00.000Z"
    }]
  });
  const { calls, coordinator } = createHarness({
    claims: [graceExpiring],
    reservation: verifiedReservation({
      allocationSnapshot: graceExpiring.allocationSnapshot
    })
  });

  const result = await coordinator.runOnce();

  assert.equal(result.requoteRequired, 1);
  assert.equal(calls.some(([name]) => name === "revalidate"), false);
  assert.equal(calls.some(([name]) => name === "effect"), false);
  assert.equal(calls.find(([name]) => name === "requote")[1].safeCode,
    "deferred_bonus_expires_before_reservation_recovery");
});

test("a participant reservation expiry that is not the scheduled grace deadline fails closed", async () => {
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    reservation: verifiedReservation({ expiresAt: NEXT_UNTIL })
  });

  const result = await coordinator.runOnce();

  assert.equal(result.reconciliationRequired, 1);
  assert.equal(calls.some(([name]) => name === "effect"), false);
  assert.equal(calls.find(([name]) => name === "reconcile")[1].safeCode,
    "deferred_reservation_unknown");
});

test("a store-owned reservation preflight failure releases through requote before any effect", async () => {
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    reservation: {
      ok: false,
      reservationRef: "reservation_test",
      safeResultCode: "bonus_expires_before_activation"
    }
  });

  const result = await coordinator.runOnce();

  assert.equal(result.requoteRequired, 1);
  assert.equal(calls.some(([name]) => name === "effect"), false);
  assert.equal(calls.find(([name]) => name === "requote")[1].safeCode,
    "bonus_expires_before_activation");
});

test("a resource revalidation result can require requote without calling the effect handler", async () => {
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    assessment: {
      status: "requote_required",
      safeCode: "deferred_resource_chain_changed"
    }
  });

  const result = await coordinator.runOnce();

  assert.equal(result.requoteRequired, 1);
  assert.equal(calls.some(([name]) => name === "effect"), false);
  assert.equal(calls.filter(([name]) => name === "requote").length, 1);
});

test("a durable effect lookup recovers a prior resource effect without applying it again", async () => {
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    resolvedEffect: appliedEffect()
  });

  const result = await coordinator.runOnce();

  assert.equal(result.effectApplied, 1);
  assert.equal(result.settled, 1);
  assert.equal(calls.some(([name]) => name === "reservation"), false);
  assert.equal(calls.some(([name]) => name === "revalidate"), false);
  assert.equal(calls.some(([name]) => name === "effect"), false);
  assert.deepEqual(calls.map(([name]) => name), [
    "recover", "rebaseClaim", "claim", "resolve", "record", "settle", "claim"
  ]);
});

test("an expired effect_applied lease resumes capture from its persisted successor without replaying the effect", async () => {
  const recovered = claim({
    state: "effect_applied",
    effectRef: "effect_test",
    successor: {
      entitlementId: "entitlement_test",
      requestId: "request_test",
      issuedLinkId: "link_test",
      validUntil: NEXT_UNTIL
    }
  });
  const { calls, coordinator } = createHarness({
    recoverableClaims: [recovered]
  });

  const result = await coordinator.runOnce();

  assert.deepEqual(result, {
    claimed: 1,
    requoteRequired: 0,
    effectApplied: 0,
    settled: 1,
    rebased: 0,
    rebasePending: 0,
    reconciliationRequired: 0
  });
  assert.deepEqual(calls.map(([name]) => name), [
    "recover", "settle", "recover", "rebaseClaim", "claim"
  ]);
  assert.equal(calls.some(([name]) => (
    name === "resolve" || name === "reservation" || name === "revalidate" || name === "effect" || name === "record"
  )), false);
});

test("the durable rebase outbox drains before an ordinary due claim with a lease-independent idempotency key", async () => {
  const { calls, coordinator } = createHarness({
    pendingRebases: [rebaseClaim()],
    claims: [claim()]
  });

  const result = await coordinator.runOnce();

  assert.equal(result.rebased, 1);
  assert.equal(result.claimed, 1);
  assert.deepEqual(calls.slice(0, 4).map(([name]) => name), [
    "recover", "rebaseClaim", "rebaseApply", "rebaseClaim"
  ]);
  assert.deepEqual(calls[2][1], {
    settledTransitionRef: "transition_settled_test",
    leaseGeneration: 1,
    leaseToken: REBASE_LEASE_TOKEN,
    operation: {
      actorScope: "deferred:account_test",
      idempotencyKey: "deferred_rebase_apply_transition_settled_test",
      actorType: "commerce_system",
      actorRef: "deferred_resource_transition_coordinator"
    }
  });
  assert.equal(calls.findIndex(([name]) => name === "rebaseApply") <
    calls.findIndex(([name]) => name === "claim"), true);
});

test("an unknown durable rebase apply uses the fixed reconciliation key and never derives it from a lease", async () => {
  const unavailable = Object.assign(new Error("apply reply lost"), {
    code: "transport_lost"
  });
  const { calls, coordinator } = createHarness({
    pendingRebases: [rebaseClaim({ leaseGeneration: 7 })],
    applyClaimedRebase: unavailable
  });

  const result = await coordinator.runOnce();

  assert.equal(result.reconciliationRequired, 1);
  const reconcileCall = calls.find(([name]) => name === "rebaseReconcile");
  assert.deepEqual(reconcileCall[1], {
    settledTransitionRef: "transition_settled_test",
    leaseGeneration: 7,
    leaseToken: REBASE_LEASE_TOKEN,
    safeCode: "deferred_rebase_apply_unknown",
    operation: {
      actorScope: "deferred:account_test",
      idempotencyKey: "deferred_rebase_reconcile_transition_settled_test",
      actorType: "commerce_system",
      actorRef: "deferred_resource_transition_coordinator"
    }
  });
});

test("a lost rebase apply response is recovered through the same stable apply key before reconciliation", async () => {
  const lostReply = Object.assign(new Error("apply committed but reply was lost"), {
    code: "transport_lost"
  });
  let applies = 0;
  const { calls, coordinator } = createHarness({
    pendingRebases: [rebaseClaim({ leaseGeneration: 9 })],
    applyClaimedRebase() {
      applies += 1;
      if (applies === 1) throw lostReply;
      return completedRebase();
    }
  });

  const result = await coordinator.runOnce();

  assert.equal(result.rebased, 1);
  assert.equal(result.reconciliationRequired, 0);
  const applyCalls = calls.filter(([name]) => name === "rebaseApply");
  assert.equal(applyCalls.length, 2);
  assert.deepEqual(applyCalls[0][1], applyCalls[1][1]);
  assert.equal(calls.some(([name]) => name === "rebaseReconcile"), false);
  assert.equal(applyCalls[0][1].operation.idempotencyKey,
    "deferred_rebase_apply_transition_settled_test");
});

test("a retryable inner runtime lease yields without reconciling and clears the local uncertainty", async () => {
  let attempts = 0;
  const retryable = Object.assign(new Error("inner runtime lease active"), {
    code: "wallet_first_resource_effect_retryable"
  });
  const { calls, coordinator } = createHarness({
    claims: [
      claim(),
      claim({ leaseGeneration: 2, leaseToken: "c".repeat(64) })
    ],
    apply() {
      attempts += 1;
      if (attempts === 1) throw retryable;
      return appliedEffect();
    }
  });

  const result = await coordinator.runOnce();

  assert.deepEqual(result, {
    claimed: 2,
    requoteRequired: 0,
    effectApplied: 1,
    settled: 1,
    rebased: 0,
    rebasePending: 0,
    reconciliationRequired: 0
  });
  assert.equal(calls.some(([name]) => name === "reconcile"), false);
  assert.equal(calls.filter(([name]) => name === "effect").length, 2);
  assert.equal(calls.filter(([name]) => name === "record").length, 1);
});

test("unknown effect outcome is quarantined and a later claim of the same transition never calls the effect again", async () => {
  const unknown = Object.assign(new Error("interrupted"), { code: "transport_lost" });
  let reconciliationAttempts = 0;
  const harness = createHarness({
    claims: [claim(), claim()],
    apply: unknown,
    reconcile() {
      reconciliationAttempts += 1;
      if (reconciliationAttempts === 1) {
        throw new Error("first reconciliation write was unavailable");
      }
      return { state: "reconciliation_required" };
    }
  });

  await assert.rejects(
    harness.coordinator.runOnce(),
    (error) => error?.code === "deferred_transition_coordinator_unavailable"
  );
  const secondResult = await harness.coordinator.runOnce();

  assert.equal(secondResult.reconciliationRequired, 1);
  assert.equal(harness.calls.filter(([name]) => name === "effect").length, 1);
  assert.equal(harness.calls.filter(([name]) => name === "reconcile").length, 2);
});

test("capture failure after a durably recorded effect is reconciled instead of applying the resource effect twice", async () => {
  const captureFailure = Object.assign(new Error("capture unavailable"), {
    code: "deferred_transition_wallet_failure"
  });
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    settle: captureFailure
  });

  const result = await coordinator.runOnce();

  assert.equal(result.effectApplied, 1);
  assert.equal(result.settled, 0);
  assert.equal(result.reconciliationRequired, 1);
  assert.equal(calls.filter(([name]) => name === "effect").length, 1);
  assert.deepEqual(calls.find(([name]) => name === "reconcile")[1].safeCode, "deferred_capture_unknown");
});

test("coordinator refuses a store that does not attest transactional reservation release and capture", () => {
  assert.throws(
    () => createHarness({ reservationLifecycleContract: "state_only_transition_store/v1" }),
    (error) => error?.code === "deferred_transition_coordinator_invalid"
  );
});

test("start schedules a bounded subsequent pass and stop prevents further runs", async () => {
  const { coordinator, timers } = createHarness();

  await coordinator.start();

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 60_000);
  await coordinator.stop();
  assert.equal(timers[0].cleared, true);
  await assert.rejects(
    coordinator.runOnce(),
    (error) => error?.code === "deferred_transition_coordinator_stopped"
  );
});

test("stop waits for an in-flight claim and does not begin the resource effect after stop", async () => {
  let resolveClaim;
  let markClaimCalled;
  const claimGate = new Promise((resolve) => {
    resolveClaim = resolve;
  });
  const claimCalled = new Promise((resolve) => {
    markClaimCalled = resolve;
  });
  const { calls, coordinator } = createHarness({
    claimNext() {
      markClaimCalled();
      return claimGate;
    }
  });

  const started = coordinator.start();
  await claimCalled;
  const stopped = coordinator.stop();
  resolveClaim(claim());

  const [result] = await Promise.all([started, stopped]);

  assert.equal(result.claimed, 0);
  assert.deepEqual(calls.map(([name]) => name), ["recover", "rebaseClaim", "claim"]);
});
