import assert from "node:assert/strict";
import test from "node:test";

import {
  createPortalRegistrationWelcomeBonusCoordinator
} from "../services/platform/portal-registration-welcome-bonus-coordinator.mjs";

const NOW = "2026-08-13T00:00:00.000Z";
const LATER = "2026-08-20T00:00:00.000Z";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

function claim(overrides = {}) {
  return {
    grantRef: "grant_welcome_test",
    accountId: "acct_welcome_test",
    commercialModel: "wallet_first_unique_v1",
    coinType: "bonus_coins",
    amountUnits: 10,
    sourceType: "portal_registration_welcome_bonus",
    sourceRef: "welcome_bonus_test",
    sourceDigest: DIGEST_A,
    actorScope: "registration_welcome_bonus",
    idempotencyKey: "welcome_bonus_test",
    expiresAt: LATER,
    leaseGeneration: 1,
    leaseToken: DIGEST_B,
    ...overrides
  };
}

function createHarness({ claims = [], credit = null } = {}) {
  const queue = [...claims];
  const calls = {
    claim: [],
    expire: [],
    complete: [],
    defer: [],
    reconcile: [],
    credit: [],
    expireLots: []
  };
  const controlStore = {
    claimNextPortalRegistrationWelcomeCoinGrant(input) {
      calls.claim.push(input);
      return queue.shift() ?? null;
    },
    completePortalRegistrationWelcomeCoinGrant(input) {
      calls.complete.push(input);
    },
    deferPortalRegistrationWelcomeCoinGrant(input) {
      calls.defer.push(input);
    },
    markPortalRegistrationWelcomeCoinGrantReconciliationRequired(input) {
      calls.reconcile.push(input);
    },
    expireDuePortalRegistrationWelcomeCoinGrants(input) {
      calls.expire.push(input);
      return 0;
    },
    nextPortalRegistrationWelcomeCoinGrantWakeAt() {
      return null;
    }
  };
  const walletStore = {
    creditCoins(input) {
      calls.credit.push(input);
      if (credit instanceof Error) throw credit;
      return credit ?? {
        ok: true,
        replayed: false,
        safeResultCode: "credited",
        resultRef: "lot_welcome_test"
      };
    },
    expireDuePortalRegistrationWelcomeBonusCoinLots(input) {
      calls.expireLots.push(input);
      return 0;
    }
  };
  const coordinator = createPortalRegistrationWelcomeBonusCoordinator({
    controlStore,
    walletStore,
    nowFn: () => new Date(NOW),
    batchSize: 5,
    leaseMs: 30_000,
    retryDelayMs: 5_000,
    scheduleFn: () => ({ timer: true }),
    clearScheduleFn: () => {}
  });
  return { calls, coordinator };
}

test("welcome-bonus coordinator credits the persisted 10-Coin grant exactly through its durable identity", async () => {
  const { calls, coordinator } = createHarness({ claims: [claim()] });

  const result = await coordinator.runOnce();

  assert.deepEqual(result, {
    expired: 0,
    expiredLots: 0,
    claimed: 1,
    credited: 1,
    deferred: 0,
    reconciliationRequired: 0
  });
  assert.deepEqual(calls.credit, [{
    accountId: "acct_welcome_test",
    coinType: "bonus_coins",
    amountUnits: 10,
    availability: "available",
    sourceType: "portal_registration_welcome_bonus",
    sourceRef: "welcome_bonus_test",
    sourceDigest: DIGEST_A,
    policyRef: null,
    policyVersion: null,
    expiresAt: LATER,
    operation: {
      actorScope: "registration_welcome_bonus",
      actorType: "system",
      actorRef: "portal_registration",
      idempotencyKey: "welcome_bonus_test"
    }
  }]);
  assert.deepEqual(calls.complete, [{
    grantRef: "grant_welcome_test",
    leaseGeneration: 1,
    leaseToken: DIGEST_B,
    lotRef: "lot_welcome_test",
    completedAt: NOW
  }]);
  assert.deepEqual(calls.expireLots, [{ limit: 5 }]);
});

test("an expired claimed grant never calls the wallet and is returned to terminal expiry handling", async () => {
  const { calls, coordinator } = createHarness({
    claims: [claim({ expiresAt: NOW })]
  });

  const result = await coordinator.runOnce();

  assert.equal(result.expired, 1);
  assert.equal(calls.credit.length, 0);
  assert.deepEqual(calls.defer, [{
    grantRef: "grant_welcome_test",
    leaseGeneration: 1,
    leaseToken: DIGEST_B,
    safeCode: "welcome_bonus_expired_before_credit",
    nextAttemptAt: "2026-08-13T00:00:05.000Z",
    updatedAt: NOW
  }]);
  assert.equal(calls.expire.length, 2);
});

test("wallet identity conflicts become reconciliation rather than a duplicate or a blind retry", async () => {
  const conflict = Object.assign(new Error("conflict"), {
    code: "credit_origin_conflict"
  });
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    credit: conflict
  });

  const result = await coordinator.runOnce();

  assert.equal(result.reconciliationRequired, 1);
  assert.equal(result.deferred, 0);
  assert.equal(calls.complete.length, 0);
  assert.deepEqual(calls.reconcile, [{
    grantRef: "grant_welcome_test",
    leaseGeneration: 1,
    leaseToken: DIGEST_B,
    safeCode: "welcome_bonus_wallet_conflict",
    updatedAt: NOW
  }]);
});

test("transient wallet failures defer the exact same durable grant identity", async () => {
  const unavailable = Object.assign(new Error("busy"), {
    code: "wallet_infrastructure_error"
  });
  const { calls, coordinator } = createHarness({
    claims: [claim()],
    credit: unavailable
  });

  const result = await coordinator.runOnce();

  assert.equal(result.deferred, 1);
  assert.equal(result.reconciliationRequired, 0);
  assert.deepEqual(calls.defer, [{
    grantRef: "grant_welcome_test",
    leaseGeneration: 1,
    leaseToken: DIGEST_B,
    safeCode: "welcome_bonus_wallet_unavailable",
    nextAttemptAt: "2026-08-13T00:00:05.000Z",
    updatedAt: NOW
  }]);
});
