import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  canonicalCommerceRequestDigest,
  createInMemoryCoinsCommerceStore
} from '../services/platform/coins-commerce-store.mjs';

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';
const T2 = '2026-01-03T00:00:00.000Z';
const T3 = '2026-01-04T00:00:00.000Z';
const T4 = '2026-01-05T00:00:00.000Z';
const T5 = '2026-01-06T00:00:00.000Z';
const T6 = '2026-01-07T00:00:00.000Z';
const T7 = '2026-01-08T00:00:00.000Z';
const T8 = '2026-01-09T00:00:00.000Z';
const T9 = '2026-01-10T00:00:00.000Z';

function lot({ lotRef, origin, issuedCoins, createdAt = T0, expiresAt = null, accountRef = 'acct-1' }) {
  return { lotRef, accountRef, origin, issuedCoins, sourceRef: `source:${lotRef}`, createdAt, expiresAt };
}

function sequenceNow(...values) {
  let index = 0;
  const nowFn = () => {
    assert.ok(index < values.length, 'unexpected nowFn call');
    return values[index++];
  };
  nowFn.calls = () => index;
  return nowFn;
}

function assertCommerceError(action, code, details) {
  assert.throws(action, (error) => {
    assert.equal(error.name, 'CoinsCommerceError');
    assert.equal(error.code, code);
    if (details !== undefined) assert.deepEqual(error.details, details);
    return true;
  });
}

test('exposes only the canonical frozen API and detached catalog and membership snapshots', () => {
  const store = createInMemoryCoinsCommerceStore({
    accountMemberships: [
      { accountRef: 'acct-1', productVersionRef: 'pv_membership_monthly_100gb_v1', validUntil: T5 },
      { accountRef: 'acct-1', productVersionRef: 'pv_membership_monthly_50gb_v1', validUntil: null },
      { accountRef: 'acct-1', productVersionRef: 'pv_membership_annual_200gb_monthly_v1', validUntil: T2 }
    ]
  });
  assert.equal(Object.isFrozen(store), true);
  assert.deepEqual(Object.keys(store).sort(), [
    'appendCoinLot', 'captureCoinHold', 'createCoinHold', 'freezeReferralCoins',
    'getActiveMemberships', 'getFulfillmentPlan', 'getIdempotencyResult', 'getOffer',
    'getOrderForAccount', 'getPaymentAttemptForAccount', 'getProductVersion',
    'getRechargeOffer', 'getReferralSummary', 'getWalletSummary', 'insertFulfillmentPlan',
    'insertOrder', 'insertPaymentAttempt', 'listCatalog', 'listOrdersForAccount',
    'listPaymentAttempts', 'listWalletTransactions', 'recordIdempotencyResult',
    'releaseCoinHold', 'releaseReferralFreeze', 'reverseReferralCoins',
    'settleReferralFreeze', 'updatePaymentAttempt'
  ]);

  const catalog = store.listCatalog();
  const product = store.getProductVersion('pv_membership_monthly_50gb_v1');
  const offer = store.getOffer('ov_membership_monthly_50gb_v1');
  const recharge = store.getRechargeOffer('rov_paid_20_v1');
  assert.equal(product.kind, 'membership');
  assert.equal(offer.productVersionRef, product.productVersionRef);
  assert.equal(recharge.paidCoins, 20);
  assert.notEqual(catalog.productVersions[0], store.listCatalog().productVersions[0]);
  assert.throws(() => { catalog.productVersions[0].kind = 'changed'; }, TypeError);
  assert.throws(() => { product.kind = 'changed'; }, TypeError);
  assert.deepEqual(store.getActiveMemberships({ accountRef: 'acct-1', at: T3 }).map((item) => item.productVersionRef), [
    'pv_membership_monthly_100gb_v1', 'pv_membership_monthly_50gb_v1'
  ]);
  assertCommerceError(() => store.getProductVersion('unknown'), 'not_found', {});
  assertCommerceError(() => store.getActiveMemberships({ accountRef: ' acct-1', at: T3 }), 'validation_error');
  assertCommerceError(() => createInMemoryCoinsCommerceStore({
    accountMemberships: [{ accountRef: 'acct-1', productVersionRef: 'pv_traffic_pack_permanent_100gb_v1', validUntil: null }]
  }), 'validation_error');
});

test('normalizes lots, appends exact credits, and rejects duplicate or invalid lots atomically', () => {
  const store = createInMemoryCoinsCommerceStore({ walletLots: [lot({ lotRef: 'seed-paid', origin: 'paid', issuedCoins: 2 })] });
  assert.deepEqual(store.listWalletTransactions({ accountRef: 'acct-1', limit: 10 })[0], {
    transactionRef: 'seed_credit:seed-paid', accountRef: 'acct-1', type: 'credit', amountCoins: 2,
    allocations: [{ lotRef: 'seed-paid', origin: 'paid', amountCoins: 2 }], relatedRef: 'seed-paid', createdAt: T0
  });

  const input = lot({ lotRef: 'bonus-1', origin: 'bonus', issuedCoins: 4, expiresAt: null });
  const appended = store.appendCoinLot({ transactionRef: 'credit-1', lot: input });
  assert.equal(appended.lot.expiresAt, '2026-01-31T00:00:00.000Z');
  assert.deepEqual(appended.transaction, {
    transactionRef: 'credit-1', accountRef: 'acct-1', type: 'credit', amountCoins: 4,
    allocations: [{ lotRef: 'bonus-1', origin: 'bonus', amountCoins: 4 }], relatedRef: 'bonus-1', createdAt: T0
  });
  input.issuedCoins = 999;
  assert.equal(store.getWalletSummary({ accountRef: 'acct-1', at: T1 }).totalAvailableCoins, 6);
  assert.throws(() => { appended.lot.issuedCoins = 1; }, TypeError);

  const before = store.listWalletTransactions({ accountRef: 'acct-1', limit: 10 });
  assertCommerceError(() => store.appendCoinLot({ transactionRef: 'credit-2', lot: lot({ lotRef: 'bonus-1', origin: 'bonus', issuedCoins: 1 }) }), 'validation_error');
  assertCommerceError(() => store.appendCoinLot({ transactionRef: 'credit-1', lot: lot({ lotRef: 'paid-2', origin: 'paid', issuedCoins: 1 }) }), 'validation_error');
  assertCommerceError(() => store.appendCoinLot({ transactionRef: 'credit-3', lot: lot({ lotRef: 'paid-expiring', origin: 'paid', issuedCoins: 1, expiresAt: T9 }) }), 'validation_error');
  assert.deepEqual(store.listWalletTransactions({ accountRef: 'acct-1', limit: 10 }), before);
});

test('allocates bonus then paid then referral with deterministic ties and keeps held expired bonus frozen', () => {
  const nowFn = sequenceNow(T4, T5);
  const store = createInMemoryCoinsCommerceStore({
    nowFn,
    walletLots: [
      lot({ lotRef: 'bonus-expired', origin: 'bonus', issuedCoins: 100, createdAt: T0, expiresAt: T3 }),
      lot({ lotRef: 'bonus-b', origin: 'bonus', issuedCoins: 4, createdAt: T1, expiresAt: T9 }),
      lot({ lotRef: 'paid-b', origin: 'paid', issuedCoins: 2, createdAt: T2 }),
      lot({ lotRef: 'referral-a', origin: 'referral', issuedCoins: 5, createdAt: T0 }),
      lot({ lotRef: 'bonus-early', origin: 'bonus', issuedCoins: 2, createdAt: T2, expiresAt: T8 }),
      lot({ lotRef: 'paid-a', origin: 'paid', issuedCoins: 2, createdAt: T2 }),
      lot({ lotRef: 'bonus-a', origin: 'bonus', issuedCoins: 3, createdAt: T1, expiresAt: T9 })
    ]
  });

  const hold = store.createCoinHold({ accountRef: 'acct-1', holdRef: 'hold-1', amountCoins: 15 });
  assert.deepEqual(hold.allocations, [
    { lotRef: 'bonus-early', origin: 'bonus', amountCoins: 2 },
    { lotRef: 'bonus-a', origin: 'bonus', amountCoins: 3 },
    { lotRef: 'bonus-b', origin: 'bonus', amountCoins: 4 },
    { lotRef: 'paid-a', origin: 'paid', amountCoins: 2 },
    { lotRef: 'paid-b', origin: 'paid', amountCoins: 2 },
    { lotRef: 'referral-a', origin: 'referral', amountCoins: 2 }
  ]);
  assert.deepEqual(store.getWalletSummary({ accountRef: 'acct-1', at: T4 }), {
    accountRef: 'acct-1', at: T4, totalAvailableCoins: 3, totalFrozenCoins: 15,
    byOrigin: {
      bonus: { availableCoins: 0, frozenCoins: 9 },
      paid: { availableCoins: 0, frozenCoins: 4 },
      referral: { availableCoins: 3, frozenCoins: 2 }
    }
  });
  assert.deepEqual(store.getWalletSummary({ accountRef: 'acct-1', at: '2026-01-11T00:00:00.000Z' }).byOrigin.bonus, {
    availableCoins: 0, frozenCoins: 9
  });

  const beforeCapture = store.listWalletTransactions({ accountRef: 'acct-1', limit: 100 });
  const captured = store.captureCoinHold({ accountRef: 'acct-1', holdRef: 'hold-1', transactionRef: 'capture-1' });
  assert.equal(captured.status, 'captured');
  assert.equal(captured.capturedAt, T5);
  assert.deepEqual(store.captureCoinHold({ accountRef: 'acct-1', holdRef: 'hold-1', transactionRef: 'capture-1' }), captured);
  assert.equal(nowFn.calls(), 2);
  assert.equal(store.listWalletTransactions({ accountRef: 'acct-1', limit: 100 }).length, beforeCapture.length + 1);
  assert.equal(store.listWalletTransactions({ accountRef: 'acct-1', limit: 100 })[0].transactionRef, 'capture-1');
  assertCommerceError(() => store.captureCoinHold({ accountRef: 'acct-1', holdRef: 'hold-1', transactionRef: 'capture-2' }), 'validation_error', { reason: 'hold_not_active' });
  assertCommerceError(() => store.releaseCoinHold({ accountRef: 'acct-1', holdRef: 'hold-1', transactionRef: 'release-1' }), 'validation_error', { reason: 'hold_not_active' });
  const tx = store.listWalletTransactions({ accountRef: 'acct-1', limit: 100 })[0];
  assert.throws(() => { tx.allocations[0].amountCoins = 0; }, TypeError);
});

test('makes holds and releases all-or-nothing with terminal replay and global transaction uniqueness', () => {
  const nowFn = sequenceNow(T1, T2, T3);
  const store = createInMemoryCoinsCommerceStore({ nowFn, walletLots: [lot({ lotRef: 'paid-1', origin: 'paid', issuedCoins: 5 })] });
  const before = store.listWalletTransactions({ accountRef: 'acct-1', limit: 20 });
  assertCommerceError(() => store.createCoinHold({ accountRef: 'acct-1', holdRef: 'too-large', amountCoins: 6 }), 'insufficient_coins', {
    availableCoins: 5, shortfallCoins: 1
  });
  assert.deepEqual(store.listWalletTransactions({ accountRef: 'acct-1', limit: 20 }), before);

  const held = store.createCoinHold({ accountRef: 'acct-1', holdRef: 'release-me', amountCoins: 5 });
  assert.equal(held.status, 'held');
  const released = store.releaseCoinHold({ accountRef: 'acct-1', holdRef: 'release-me', transactionRef: 'release-1' });
  assert.equal(released.status, 'released');
  assert.deepEqual(store.releaseCoinHold({ accountRef: 'acct-1', holdRef: 'release-me', transactionRef: 'release-1' }), released);
  assert.equal(store.getWalletSummary({ accountRef: 'acct-1', at: T9 }).totalAvailableCoins, 5);
  assert.equal(store.getWalletSummary({ accountRef: 'acct-1', at: T9 }).totalFrozenCoins, 0);
  assertCommerceError(() => store.releaseCoinHold({ accountRef: 'acct-1', holdRef: 'release-me', transactionRef: 'release-2' }), 'validation_error', { reason: 'hold_not_active' });
  assertCommerceError(() => store.createCoinHold({ accountRef: 'acct-1', holdRef: 'release-me', amountCoins: 1 }), 'validation_error');
  assertCommerceError(() => store.appendCoinLot({ transactionRef: 'release-1', lot: lot({ lotRef: 'paid-2', origin: 'paid', issuedCoins: 1 }) }), 'validation_error');
});

test('partitions referral value across internal consumption, settlement freezes, settlement, and reversal', () => {
  const nowFn = sequenceNow(T1, T2, T3, T3, T3, T4, T5, T5, T6, T7);
  const store = createInMemoryCoinsCommerceStore({
    nowFn,
    walletLots: [
      lot({ lotRef: 'ref-1', origin: 'referral', issuedCoins: 20, createdAt: T0 }),
      lot({ lotRef: 'ref-2', origin: 'referral', issuedCoins: 10, createdAt: T1 })
    ]
  });

  store.createCoinHold({ accountRef: 'acct-1', holdRef: 'internal-1', amountCoins: 8 });
  assert.deepEqual(store.getReferralSummary({ accountRef: 'acct-1', at: T1 }), {
    accountRef: 'acct-1', at: T1, cumulativeEarnedCoins: 30, availableCoins: 22,
    internallyConsumedCoins: 0, frozenCoins: 8, frozenForSettlementCoins: 0,
    externallySettledCoins: 0, reversedCoins: 0
  });
  store.captureCoinHold({ accountRef: 'acct-1', holdRef: 'internal-1', transactionRef: 'capture-internal-1' });

  const freeze = store.freezeReferralCoins({ accountRef: 'acct-1', freezeRef: 'freeze-1', amountCoins: 12 });
  assert.deepEqual(freeze.allocations, [{ lotRef: 'ref-1', origin: 'referral', amountCoins: 12 }]);
  assertCommerceError(() => store.freezeReferralCoins({ accountRef: 'acct-1', freezeRef: 'overflow', amountCoins: 11 }), 'insufficient_coins', {
    availableCoins: 10, shortfallCoins: 1
  });
  assertCommerceError(() => store.createCoinHold({ accountRef: 'acct-1', holdRef: 'cannot-consume-frozen', amountCoins: 11 }), 'insufficient_coins', {
    availableCoins: 10, shortfallCoins: 1
  });

  const released = store.releaseReferralFreeze({ accountRef: 'acct-1', freezeRef: 'freeze-1', transactionRef: 'ref-release-1' });
  assert.equal(released.status, 'released');
  assert.deepEqual(store.releaseReferralFreeze({ accountRef: 'acct-1', freezeRef: 'freeze-1', transactionRef: 'ref-release-1' }), released);
  assertCommerceError(() => store.settleReferralFreeze({ accountRef: 'acct-1', freezeRef: 'freeze-1', transactionRef: 'settle-wrong' }), 'validation_error', { reason: 'freeze_not_active' });

  store.freezeReferralCoins({ accountRef: 'acct-1', freezeRef: 'freeze-2', amountCoins: 15 });
  assertCommerceError(() => store.createCoinHold({ accountRef: 'acct-1', holdRef: 'cannot-consume-frozen-2', amountCoins: 8 }), 'insufficient_coins', {
    availableCoins: 7, shortfallCoins: 1
  });
  const settled = store.settleReferralFreeze({ accountRef: 'acct-1', freezeRef: 'freeze-2', transactionRef: 'ref-settle-2' });
  assert.equal(settled.status, 'settled');
  assert.deepEqual(store.settleReferralFreeze({ accountRef: 'acct-1', freezeRef: 'freeze-2', transactionRef: 'ref-settle-2' }), settled);
  assertCommerceError(() => store.releaseReferralFreeze({ accountRef: 'acct-1', freezeRef: 'freeze-2', transactionRef: 'release-wrong' }), 'validation_error', { reason: 'freeze_not_active' });

  const reversal = store.reverseReferralCoins({ accountRef: 'acct-1', reversalRef: 'reversal-1', amountCoins: 5 });
  assert.equal(reversal.type, 'referral_reversal');
  assert.deepEqual(store.getReferralSummary({ accountRef: 'acct-1', at: T9 }), {
    accountRef: 'acct-1', at: T9, cumulativeEarnedCoins: 30, availableCoins: 2,
    internallyConsumedCoins: 8, frozenCoins: 0, frozenForSettlementCoins: 0,
    externallySettledCoins: 15, reversedCoins: 5
  });
  const referralTransactions = store.listWalletTransactions({ accountRef: 'acct-1', limit: 100 })
    .filter((transaction) => transaction.type.startsWith('referral_'));
  assert.deepEqual(referralTransactions.map((transaction) => transaction.type), [
    'referral_reversal', 'referral_settlement', 'referral_freeze', 'referral_release', 'referral_freeze'
  ]);
  const summary = store.getReferralSummary({ accountRef: 'acct-1', at: T9 });
  assert.equal(summary.cumulativeEarnedCoins, summary.availableCoins + summary.internallyConsumedCoins
    + summary.frozenCoins + summary.externallySettledCoins + summary.reversedCoins);
});

test('validates and replays referral seed entries in deterministic order and rejects impossible history', () => {
  const referralLot = lot({ lotRef: 'ref-1', origin: 'referral', issuedCoins: 10 });
  const freeze = {
    transactionRef: 'referral_freeze:seed-freeze', accountRef: 'acct-1', type: 'referral_freeze', amountCoins: 6,
    allocations: [{ lotRef: 'ref-1', origin: 'referral', amountCoins: 6 }], relatedRef: 'seed-freeze', createdAt: T1
  };
  const release = {
    transactionRef: 'seed-release', accountRef: 'acct-1', type: 'referral_release', amountCoins: 6,
    allocations: [{ lotRef: 'ref-1', origin: 'referral', amountCoins: 6 }], relatedRef: 'seed-freeze', createdAt: T2
  };
  const store = createInMemoryCoinsCommerceStore({ walletLots: [referralLot], referralEntries: [release, freeze] });
  assert.equal(store.getReferralSummary({ accountRef: 'acct-1', at: T3 }).availableCoins, 10);
  assert.deepEqual(store.listWalletTransactions({ accountRef: 'acct-1', limit: 10 }).slice(0, 2).map(({ transactionRef }) => transactionRef), [
    'seed-release', 'referral_freeze:seed-freeze'
  ]);
  assertCommerceError(() => createInMemoryCoinsCommerceStore({ walletLots: [referralLot], referralEntries: [release] }), 'validation_error');
  assertCommerceError(() => createInMemoryCoinsCommerceStore({ walletLots: [referralLot], referralEntries: [{ ...freeze, allocations: [{ ...freeze.allocations[0], amountCoins: 11 }], amountCoins: 11 }] }), 'validation_error');
  assertCommerceError(() => createInMemoryCoinsCommerceStore({ walletLots: [referralLot], referralEntries: [{ ...freeze, type: 'capture' }] }), 'validation_error');
});

test('stores immutable orders, append-only payment attempt revisions, and fulfillment plans', () => {
  const store = createInMemoryCoinsCommerceStore();
  const orderB = { orderRef: 'order-b', accountRef: 'acct-1', createdAt: T2, status: 'pending', quantity: 2 };
  const orderA = { orderRef: 'order-a', accountRef: 'acct-1', createdAt: T1, status: 'created', quantity: 1 };
  const storedA = store.insertOrder(orderA);
  store.insertOrder(orderB);
  orderA.status = 'mutated';
  assert.equal(storedA.status, 'created');
  assert.throws(() => { storedA.status = 'mutated'; }, TypeError);
  assert.deepEqual(store.listOrdersForAccount({ accountRef: 'acct-1' }).map(({ orderRef }) => orderRef), ['order-a', 'order-b']);
  assertCommerceError(() => store.getOrderForAccount({ accountRef: 'acct-2', orderRef: 'order-a' }), 'not_found', {});
  assertCommerceError(() => store.insertOrder({ ...orderA }), 'validation_error');
  assertCommerceError(() => store.insertOrder({ orderRef: 'unsafe', accountRef: 'acct-1', createdAt: T1, apiToken: 'nope' }), 'validation_error');

  const attemptA = {
    attemptRef: 'attempt-a', accountRef: 'acct-1', orderRef: 'order-a', providerId: 'provider-a',
    sourceAttemptRef: 'source-a', createdAt: T3, status: 'pending', nextAction: { type: 'hosted_redirect', url: 'https://pay.example.test/a', expiresAt: T9 }
  };
  const attemptB = { attemptRef: 'attempt-b', accountRef: 'acct-2', orderRef: 'order-b', providerId: 'provider-a', createdAt: T4, status: 'pending' };
  store.insertPaymentAttempt(attemptA);
  store.insertPaymentAttempt(attemptB);
  const updated = store.updatePaymentAttempt({ ...attemptA, createdAt: T5, status: 'succeeded', providerOrderRef: 'provider-order-a' });
  assert.equal(updated.status, 'succeeded');
  assert.equal(store.getPaymentAttemptForAccount({ accountRef: 'acct-1', attemptRef: 'attempt-a' }).createdAt, T5);
  assertCommerceError(() => store.getPaymentAttemptForAccount({ accountRef: 'acct-2', attemptRef: 'attempt-a' }), 'not_found', {});
  assertCommerceError(() => store.updatePaymentAttempt({ ...attemptA, sourceAttemptRef: 'changed', createdAt: T6 }), 'validation_error');
  assert.deepEqual(store.listPaymentAttempts({ limit: 1 }), { items: [updated], nextCursor: 1 });
  assert.deepEqual(store.listPaymentAttempts({ limit: 1, cursor: 1 }).items.map(({ attemptRef }) => attemptRef), ['attempt-b']);
  assert.deepEqual(store.listPaymentAttempts({ status: 'succeeded' }).items.map(({ attemptRef }) => attemptRef), ['attempt-a']);
  assertCommerceError(() => store.listPaymentAttempts({ limit: 101 }), 'validation_error');
  assertCommerceError(() => store.listPaymentAttempts({ cursor: -1 }), 'validation_error');

  const plan = { planRef: 'plan-1', orderRef: 'order-a', createdAt: T6, status: 'ready', steps: [{ type: 'grant' }] };
  const storedPlan = store.insertFulfillmentPlan(plan);
  plan.steps[0].type = 'mutated';
  assert.equal(storedPlan.steps[0].type, 'grant');
  assert.deepEqual(store.getFulfillmentPlan('plan-1'), storedPlan);
  assertCommerceError(() => store.insertFulfillmentPlan({ ...plan }), 'validation_error');
  assertCommerceError(() => store.insertPaymentAttempt({ ...attemptA, attemptRef: 'unsafe-attempt', nextAction: { type: 'qr', payload: 'ok', rawPayload: 'nope' } }), 'validation_error');
});

test('canonicalizes request digests and replays the first detached idempotency result', () => {
  const left = { z: [true, null, 3], a: { y: 'value', x: 1 } };
  const right = { a: { x: 1, y: 'value' }, z: [true, null, 3] };
  const expected = createHash('sha256')
    .update('COINS_COMMERCE_IDEMPOTENCY:v1\0{"a":{"x":1,"y":"value"},"z":[true,null,3]}', 'utf8')
    .digest('hex');
  assert.equal(canonicalCommerceRequestDigest(left), expected);
  assert.equal(canonicalCommerceRequestDigest(right), expected);
  assert.notEqual(canonicalCommerceRequestDigest({ value: 1 }), canonicalCommerceRequestDigest({ value: 2 }));
  for (const invalid of ['', 1.5, undefined, 1n, new Date(), { value: undefined }]) {
    assertCommerceError(() => canonicalCommerceRequestDigest(invalid), 'validation_error');
  }

  const store = createInMemoryCoinsCommerceStore();
  const result = { orderRef: 'order-1', nextAction: { type: 'qr', payload: 'normalized-user-action' } };
  assert.equal(store.getIdempotencyResult({ scope: 'order', accountRef: 'acct-1', idempotencyKey: 'key-1', requestDigest: expected }), null);
  const recorded = store.recordIdempotencyResult({ scope: 'order', accountRef: 'acct-1', idempotencyKey: 'key-1', requestDigest: expected, result });
  result.orderRef = 'mutated';
  assert.equal(recorded.orderRef, 'order-1');
  assert.throws(() => { recorded.orderRef = 'mutated'; }, TypeError);
  assert.deepEqual(store.recordIdempotencyResult({ scope: 'order', accountRef: 'acct-1', idempotencyKey: 'key-1', requestDigest: expected, result: { ignored: true } }), recorded);
  assert.deepEqual(store.getIdempotencyResult({ scope: 'order', accountRef: 'acct-1', idempotencyKey: 'key-1', requestDigest: expected }), recorded);
  assertCommerceError(() => store.getIdempotencyResult({ scope: 'order', accountRef: 'acct-1', idempotencyKey: 'key-1', requestDigest: '0'.repeat(64) }), 'idempotency_conflict', {});
  assertCommerceError(() => store.recordIdempotencyResult({ scope: 'order', accountRef: 'acct-1', idempotencyKey: 'key-1', requestDigest: '0'.repeat(64), result: {} }), 'idempotency_conflict', {});
});

test('rejects sparse or symbol-bearing closed values and malformed nested refs or timestamps', () => {
  const sparse = new Array(1);
  const symbolKeyed = { value: 1 };
  symbolKeyed[Symbol('hidden')] = true;
  assertCommerceError(() => canonicalCommerceRequestDigest(sparse), 'validation_error');
  assertCommerceError(() => canonicalCommerceRequestDigest(symbolKeyed), 'validation_error');

  const store = createInMemoryCoinsCommerceStore();
  assertCommerceError(() => store.insertOrder({
    orderRef: 'order-1', accountRef: 'acct-1', createdAt: T1, item: { productVersionRef: ' untrimmed' }
  }), 'validation_error');
  assertCommerceError(() => store.insertOrder({
    orderRef: 'order-2', accountRef: 'acct-1', createdAt: T1, expiresAt: '2026-01-01'
  }), 'validation_error');
  assertCommerceError(() => store.insertOrder({
    orderRef: 'order-3', accountRef: 'acct-1', createdAt: T1, values: sparse
  }), 'validation_error');
  assertCommerceError(() => store.insertOrder({
    orderRef: 'order-4', accountRef: 'acct-1', createdAt: T1, metadata: symbolKeyed
  }), 'validation_error');

  const catalog = store.listCatalog();
  assertCommerceError(() => createInMemoryCoinsCommerceStore({ catalog: { ...catalog, publishedAt: '2026-01-01' } }), 'validation_error');
});

test('rejects noncanonical event time and cross-account or malformed wallet requests', () => {
  const store = createInMemoryCoinsCommerceStore({
    nowFn: () => '2026-01-01',
    walletLots: [lot({ lotRef: 'paid-1', origin: 'paid', issuedCoins: 5 })]
  });
  assertCommerceError(() => store.createCoinHold({ accountRef: 'acct-1', holdRef: 'hold-1', amountCoins: 1 }), 'validation_error');
  assertCommerceError(() => store.createCoinHold({ accountRef: 'acct-1', holdRef: 'hold-2', amountCoins: 0 }), 'validation_error');
  assertCommerceError(() => store.getWalletSummary({ accountRef: 'acct-1', at: '2026-01-01' }), 'validation_error');
  assertCommerceError(() => store.captureCoinHold({ accountRef: 'acct-2', holdRef: 'missing', transactionRef: 'capture' }), 'not_found', {});
  assertCommerceError(() => createInMemoryCoinsCommerceStore({ walletLots: [lot({ lotRef: 'bad', origin: 'paid', issuedCoins: 1.5 })] }), 'validation_error');
});
