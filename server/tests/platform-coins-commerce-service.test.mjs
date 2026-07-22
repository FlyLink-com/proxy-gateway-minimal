import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoinsCommerceProviderPreview } from '../services/platform/coins-commerce-provider-preview.mjs';
import { createCoinsCommerceService } from '../services/platform/coins-commerce-service.mjs';
import {
  canonicalCommerceRequestDigest,
  createInMemoryCoinsCommerceStore
} from '../services/platform/coins-commerce-store.mjs';

const T0 = '2026-07-22T00:00:00.000Z';
const T1 = '2026-07-22T00:00:01.000Z';

function lot({ lotRef = 'paid-1', issuedCoins = 500, origin = 'paid', accountRef = 'acct-1' } = {}) {
  return {
    lotRef, accountRef, origin, issuedCoins, sourceRef: `source:${lotRef}`,
    createdAt: T0, expiresAt: null
  };
}

function refs(overrides = {}) {
  const counts = new Map();
  const generated = [];
  const refFactory = (kind) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    const value = overrides[kind] ?? `${kind}_${counts.get(kind)}`;
    generated.push([kind, value]);
    return value;
  };
  refFactory.generated = generated;
  return refFactory;
}

function quoteFor({ rechargeOfferRef, paidCoins, bonusCoins }) {
  return {
    rechargeOfferRef,
    paidCoins,
    bonusCoins,
    fiatAmountMinor: paidCoins * 100,
    fiatCurrency: 'USD',
    rateNumerator: 100,
    rateDenominator: 1,
    rateVersionRef: 'rate_usd_v1',
    promotionRef: null
  };
}

function preview(providerId, createRechargeOrderFn, options = {}) {
  return createCoinsCommerceProviderPreview({ providerId, createRechargeOrderFn, ...options });
}

function directProvider(providerId, createRechargeOrder) {
  return Object.freeze({
    providerId,
    capabilities: Object.freeze({ createRechargeOrder: true }),
    createRechargeOrder
  });
}

function actionRequired(providerOrderRef = 'provider_order_1', url = 'https://pay.example.test/checkout') {
  return {
    providerOrderRef,
    status: 'action_required',
    chargeCertainty: 'pending',
    nextAction: { type: 'hosted_redirect', url }
  };
}

function normalizedResult(status) {
  const certainty = {
    entry_unavailable: 'not_charge_capable',
    confirmed_no_charge: 'confirmed_no_charge',
    provider_insufficient: 'confirmed_no_charge',
    risk_rejected: 'confirmed_no_charge',
    action_required: 'pending',
    pending: 'pending',
    unknown: 'unknown',
    possibly_charged: 'possibly_charged',
    succeeded: 'charged',
    reversed: 'reversed'
  }[status];
  if (status === 'entry_unavailable') {
    return { status, chargeCertainty: certainty, nextAction: { type: 'none' } };
  }
  if (status === 'action_required') return actionRequired(`provider_order_${status}`);
  return {
    providerOrderRef: `provider_order_${status}`,
    status,
    chargeCertainty: certainty,
    nextAction: { type: 'none' }
  };
}

function serviceFixture({
  walletLots = [lot()],
  accountMemberships = [],
  providers = [],
  rechargeQuoteIssuer = providers.length === 0 ? null : (input) => quoteFor(input),
  refFactory = refs(),
  nowFn = () => T1,
  store = createInMemoryCoinsCommerceStore({ nowFn, walletLots, accountMemberships })
} = {}) {
  const service = createCoinsCommerceService({ store, providers, rechargeQuoteIssuer, nowFn, refFactory });
  return { service, store, refFactory };
}

function assertCommerceError(error, code) {
  assert.equal(error?.name, 'CoinsCommerceError');
  assert.equal(error?.code, code);
  return true;
}

test('validates the exact factory and exposes only the frozen read/write contract', () => {
  const store = createInMemoryCoinsCommerceStore();
  const service = createCoinsCommerceService({ store, providers: [], rechargeQuoteIssuer: null, nowFn: () => T1, refFactory: refs() });
  assert.deepEqual(Object.keys(service), [
    'getWallet', 'getCatalog', 'listOrders', 'createProductOrder', 'createRechargeOrder',
    'getPaymentAttempt', 'switchPaymentAttempt', 'getReferralSummary', 'listPaymentLogs'
  ]);
  assert.equal(Object.isFrozen(service), true);
  for (const forbidden of ['freezeReferralCoins', 'settleReferralFreeze', 'reverseReferralCoins', 'overwriteReferralBalance']) {
    assert.equal(Object.hasOwn(service, forbidden), false);
  }
  assert.throws(() => createCoinsCommerceService({
    store, providers: [], rechargeQuoteIssuer: null, nowFn: () => T1, refFactory: refs(), extra: true
  }), (error) => assertCommerceError(error, 'validation_error'));
  const adapter = preview('provider_one', () => actionRequired());
  assert.throws(() => createCoinsCommerceService({
    store, providers: [adapter, adapter], rechargeQuoteIssuer: (value) => quoteFor(value), nowFn: () => T1, refFactory: refs()
  }), (error) => assertCommerceError(error, 'validation_error'));
  assert.throws(() => createCoinsCommerceService({
    store, providers: [adapter], rechargeQuoteIssuer: null, nowFn: () => T1, refFactory: refs()
  }), (error) => assertCommerceError(error, 'validation_error'));
});

test('atomically captures a discounted product purchase, freezes snapshots, and replays without side effects', async () => {
  const refFactory = refs();
  const { service, store } = serviceFixture({
    refFactory,
    walletLots: [lot({ issuedCoins: 40 })],
    accountMemberships: [{
      accountRef: 'acct-1',
      productVersionRef: 'pv_membership_monthly_50gb_v1',
      validUntil: null
    }]
  });
  const input = {
    accountRef: 'acct-1',
    offerVersionRef: 'ov_traffic_pack_permanent_100gb_v1',
    idempotencyKey: 'product-idem-1'
  };
  const created = await service.createProductOrder(input);
  assert.equal(created.order.orderType, 'product');
  assert.deepEqual(Object.keys(created.order), [
    'schemaVersion', 'orderRef', 'accountRef', 'orderType', 'status', 'currency', 'item',
    'amountCoins', 'holdRef', 'captureTransactionRef', 'fulfillmentPlanRef', 'createdAt'
  ]);
  assert.equal(created.order.status, 'fulfillment_planned');
  assert.equal(created.order.amountCoins, 28);
  assert.deepEqual(created.order.item.discount, {
    sourceProductVersionRef: 'pv_membership_monthly_50gb_v1', priceBasisPoints: 9500
  });
  assert.equal(created.fulfillmentPlan.status, 'ready');
  assert.deepEqual(Object.keys(created.fulfillmentPlan), [
    'schemaVersion', 'planRef', 'orderRef', 'accountRef', 'status', 'productVersionRef',
    'offerVersionRef', 'grants', 'createdAt'
  ]);
  assert.deepEqual(created.fulfillmentPlan.grants, created.order.item.grants);
  assert.deepEqual(created.fulfillmentPlan.grants[1], {
    type: 'traffic', quantityGb: 100, cycleDays: null, resetAtCycleEnd: false,
    carryOver: true, consumptionPriority: 200
  });
  assert.ok(Object.isFrozen(created));
  assert.ok(Object.isFrozen(created.order.item.grants));
  assert.equal(service.getWallet({ accountRef: 'acct-1' }).summary.totalAvailableCoins, 12);
  assert.deepEqual(store.listWalletTransactions({ accountRef: 'acct-1', limit: 10 }).slice(0, 2).map(({ type }) => type), [
    'capture', 'hold'
  ]);

  const generatedBeforeReplay = [...refFactory.generated];
  const replay = await service.createProductOrder({ ...input });
  assert.deepEqual(replay, created);
  assert.deepEqual(refFactory.generated, generatedBeforeReplay);
  assert.equal(store.listOrdersForAccount({ accountRef: 'acct-1' }).length, 1);
  assert.equal(store.listWalletTransactions({ accountRef: 'acct-1', limit: 10 }).filter(({ type }) => type === 'capture').length, 1);
});

test('leaves zero purchase writes after atomic failure and returns closed insufficient recovery', async () => {
  const collisionStore = createInMemoryCoinsCommerceStore({ nowFn: () => T1, walletLots: [lot({ issuedCoins: 50 })] });
  collisionStore.insertFulfillmentPlan({ planRef: 'fulfillment_plan_collision', orderRef: 'existing-order', createdAt: T1 });
  const collisionRefs = refs({ fulfillment_plan: 'fulfillment_plan_collision' });
  const collisionService = createCoinsCommerceService({
    store: collisionStore, providers: [], rechargeQuoteIssuer: null, nowFn: () => T1, refFactory: collisionRefs
  });
  const beforeTransactions = collisionStore.listWalletTransactions({ accountRef: 'acct-1', limit: 20 });
  await assert.rejects(collisionService.createProductOrder({
    accountRef: 'acct-1', offerVersionRef: 'ov_membership_monthly_50gb_v1', idempotencyKey: 'collision-key'
  }), (error) => assertCommerceError(error, 'validation_error'));
  assert.deepEqual(collisionStore.listWalletTransactions({ accountRef: 'acct-1', limit: 20 }), beforeTransactions);
  assert.deepEqual(collisionStore.listOrdersForAccount({ accountRef: 'acct-1' }), []);
  const digest = canonicalCommerceRequestDigest({ offerVersionRef: 'ov_membership_monthly_50gb_v1' });
  assert.equal(collisionStore.getIdempotencyResult({
    scope: 'coins_commerce.product_order.v1', accountRef: 'acct-1', idempotencyKey: 'collision-key', requestDigest: digest
  }), null);

  const { service, store } = serviceFixture({ walletLots: [lot({ issuedCoins: 19 })] });
  const before = store.listWalletTransactions({ accountRef: 'acct-1', limit: 20 });
  await assert.rejects(service.createProductOrder({
    accountRef: 'acct-1', offerVersionRef: 'ov_membership_monthly_50gb_v1', idempotencyKey: 'insufficient-key'
  }), (error) => {
    assertCommerceError(error, 'insufficient_coins');
    assert.deepEqual(error.details, { availableCoins: 19, shortfallCoins: 1, recovery: 'go_to_recharge' });
    return true;
  });
  assert.deepEqual(store.listWalletTransactions({ accountRef: 'acct-1', limit: 20 }), before);
  assert.deepEqual(store.listOrdersForAccount({ accountRef: 'acct-1' }), []);
  assert.deepEqual(store.listPaymentAttempts(), { items: [], nextCursor: null });
});

test('creates a separate idempotent recharge intent without provider, wallet credit, product order, or fulfillment', async () => {
  const refFactory = refs();
  const { service, store } = serviceFixture({ refFactory, walletLots: [lot({ issuedCoins: 5 })] });
  const beforeWallet = service.getWallet({ accountRef: 'acct-1' });
  const input = {
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_50_v1', preferredProviderId: null,
    idempotencyKey: 'recharge-no-provider'
  };
  const created = await service.createRechargeOrder(input);
  assert.deepEqual(created, {
    order: {
      schemaVersion: 'coins_commerce_order_v1', orderRef: 'recharge_order_1', accountRef: 'acct-1',
      orderType: 'recharge', status: 'payment_requested',
      rechargeSnapshot: { rechargeOfferRef: 'rov_paid_50_v1', currency: 'COINS', paidCoins: 50, bonusCoins: 0 },
      createdAt: T1
    },
    attempt: null, status: 'entry_unavailable', chargeCertainty: 'not_charge_capable',
    nextAction: { type: 'none' }
  });
  assert.deepEqual(service.getWallet({ accountRef: 'acct-1' }), beforeWallet);
  assert.equal(store.listOrdersForAccount({ accountRef: 'acct-1' }).filter(({ orderType }) => orderType === 'product').length, 0);
  assert.deepEqual(store.listPaymentAttempts(), { items: [], nextCursor: null });
  assert.throws(() => store.getFulfillmentPlan('fulfillment_plan_1'), /not_found/);
  const generated = [...refFactory.generated];
  assert.deepEqual(await service.createRechargeOrder({ ...input }), created);
  assert.deepEqual(refFactory.generated, generated);
});

test('fails closed before provider calls when trusted quote issuance fails or mismatches the catalog', async () => {
  for (const issuer of [
    () => { throw new Error('issuer failed'); },
    (value) => ({ ...quoteFor(value), paidCoins: value.paidCoins + 1 })
  ]) {
    let providerCalls = 0;
    const adapter = preview('provider_quote', () => { providerCalls += 1; return actionRequired(); });
    const { service, store } = serviceFixture({ providers: [adapter], rechargeQuoteIssuer: issuer });
    const result = await service.createRechargeOrder({
      accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_20_v1', preferredProviderId: null,
      idempotencyKey: `quote-failure-${providerCalls}`
    });
    assert.equal(result.attempt, null);
    assert.equal(result.status, 'entry_unavailable');
    assert.equal(providerCalls, 0);
    assert.deepEqual(store.listPaymentAttempts(), { items: [], nextCursor: null });
    assert.equal(store.getWalletSummary({ accountRef: 'acct-1', at: T1 }).totalAvailableCoins, 500);
  }
});

test('uses the actual preview adapters, routes only entry-unavailable, locks one quote, and replays silently', async () => {
  let firstCalls = 0;
  let secondCalls = 0;
  let quoteCalls = 0;
  let firstInput;
  let secondInput;
  const first = preview('provider_first', (input) => {
    firstCalls += 1;
    firstInput = input;
    return normalizedResult('entry_unavailable');
  });
  const second = preview('provider_second', (input) => {
    secondCalls += 1;
    secondInput = input;
    return actionRequired('provider_order_second');
  });
  const refFactory = refs();
  const { service, store } = serviceFixture({
    providers: [first, second], refFactory,
    rechargeQuoteIssuer(value) { quoteCalls += 1; return quoteFor(value); }
  });
  const request = {
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_100_v1', preferredProviderId: null,
    idempotencyKey: 'route-entry-unavailable'
  };
  const result = await service.createRechargeOrder(request);
  assert.equal(result.attempt.providerId, 'provider_second');
  assert.equal(result.status, 'action_required');
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  assert.equal(quoteCalls, 1);
  assert.deepEqual(firstInput.quoteSnapshot, secondInput.quoteSnapshot);
  assert.notEqual(firstInput.attemptRef, secondInput.attemptRef);
  assert.match(firstInput.idempotencyKey, /^[0-9a-f]{64}$/);
  assert.notEqual(firstInput.idempotencyKey, request.idempotencyKey);
  const source = store.getPaymentAttemptForAccount({ accountRef: 'acct-1', attemptRef: result.attempt.sourceAttemptRef });
  const target = store.getPaymentAttemptForAccount({ accountRef: 'acct-1', attemptRef: result.attempt.attemptRef });
  assert.deepEqual(Object.keys(target), [
    'schemaVersion', 'attemptRef', 'accountRef', 'orderRef', 'providerId', 'sourceAttemptRef',
    'targetAttemptRef', 'switchReason', 'idempotencyFingerprint', 'quoteSnapshot',
    'providerOrderRef', 'status', 'chargeCertainty', 'nextAction', 'reconciliationState',
    'createdAt', 'updatedAt'
  ]);
  assert.equal(source.status, 'entry_unavailable');
  assert.equal(source.targetAttemptRef, result.attempt.attemptRef);
  assert.equal(result.attempt.switchReason, 'automatic_entry_unavailable');
  assert.deepEqual(source.quoteSnapshot, target.quoteSnapshot);

  const generated = [...refFactory.generated];
  const replay = await service.createRechargeOrder({ ...request });
  assert.deepEqual(replay, result);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  assert.equal(quoteCalls, 1);
  assert.deepEqual(refFactory.generated, generated);
});

test('records adapter throws as unknown and never automatically routes to another provider', async () => {
  let firstCalls = 0;
  let secondCalls = 0;
  const first = preview('provider_throw', () => { firstCalls += 1; throw new Error('private provider failure'); });
  const second = preview('provider_unused', () => { secondCalls += 1; return actionRequired(); });
  const { service } = serviceFixture({ providers: [first, second] });
  const result = await service.createRechargeOrder({
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_10_v1', preferredProviderId: null,
    idempotencyKey: 'provider-throw'
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.chargeCertainty, 'unknown');
  assert.equal(result.attempt.reconciliationState, 'requires_review');
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);
  assert.doesNotMatch(JSON.stringify(result), /private provider failure/);
});

test('maps contradictory or unsafe direct-adapter results to unknown without automatic routing', async () => {
  const invalidResults = [
    {
      providerOrderRef: 'contradictory_ref', status: 'entry_unavailable',
      chargeCertainty: 'not_charge_capable', nextAction: { type: 'none' }
    },
    { status: 'pending', chargeCertainty: 'pending', nextAction: { type: 'none' } },
    {
      providerOrderRef: 'unsafe_scheme', status: 'action_required', chargeCertainty: 'pending',
      nextAction: { type: 'hosted_redirect', url: 'http://pay.example.test/checkout' }
    },
    {
      providerOrderRef: 'unsafe_credentials', status: 'action_required', chargeCertainty: 'pending',
      nextAction: { type: 'hosted_redirect', url: 'https://user:pass@pay.example.test/checkout' }
    }
  ];
  for (const [index, invalidResult] of invalidResults.entries()) {
    let firstCalls = 0;
    let secondCalls = 0;
    const first = directProvider(`direct_invalid_${index}`, async () => {
      firstCalls += 1;
      return invalidResult;
    });
    const second = directProvider(`direct_unused_${index}`, async () => {
      secondCalls += 1;
      return actionRequired(`unused_${index}`);
    });
    const { service } = serviceFixture({ providers: [first, second] });
    const result = await service.createRechargeOrder({
      accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_10_v1', preferredProviderId: null,
      idempotencyKey: `direct-invalid-${index}`
    });
    assert.equal(result.status, 'unknown');
    assert.equal(result.chargeCertainty, 'unknown');
    assert.equal(result.attempt.reconciliationState, 'requires_review');
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 0);
  }
});

test('preserves Task3 HTTPS host freedom and explicitly enabled HTTP loopback previews', async () => {
  const urls = [
    'https://127.0.0.1/checkout',
    'https://paybox/checkout',
    'https://localhost/checkout',
    'http://localhost:3456/checkout',
    'http://127.0.0.1:3456/checkout',
    'http://[::1]:3456/checkout'
  ];
  for (const [index, url] of urls.entries()) {
    const provider = preview(`preview_redirect_${index}`, () => actionRequired(`preview_order_${index}`, url), {
      allowLoopbackHttp: true
    });
    const { service } = serviceFixture({ providers: [provider] });
    const result = await service.createRechargeOrder({
      accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_10_v1', preferredProviderId: null,
      idempotencyKey: `preview-redirect-${index}`
    });
    assert.equal(result.status, 'action_required');
    assert.equal(result.nextAction.type, 'hosted_redirect');
    assert.equal(result.nextAction.url, url);
  }
});

test('never automatically routes any normalized non-entry provider result', async () => {
  const statuses = [
    'confirmed_no_charge', 'provider_insufficient', 'risk_rejected', 'action_required',
    'pending', 'unknown', 'possibly_charged', 'succeeded', 'reversed'
  ];
  for (const [index, status] of statuses.entries()) {
    let firstCalls = 0;
    let secondCalls = 0;
    const first = directProvider(`matrix_first_${index}`, async () => {
      firstCalls += 1;
      return normalizedResult(status);
    });
    const second = directProvider(`matrix_second_${index}`, async () => {
      secondCalls += 1;
      return actionRequired(`matrix_unused_${index}`);
    });
    const { service } = serviceFixture({ providers: [first, second] });
    const result = await service.createRechargeOrder({
      accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_10_v1', preferredProviderId: null,
      idempotencyKey: `non-entry-${status}`
    });
    assert.equal(result.status, status);
    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 0);
  }
});

test('records recharge and switch idempotency pointers before provider calls complete', async () => {
  let rechargeCalls = 0;
  let resolveRecharge;
  const rechargeProvider = preview('provider_deferred', () => {
    rechargeCalls += 1;
    return new Promise((resolve) => { resolveRecharge = resolve; });
  });
  const rechargeFixture = serviceFixture({ providers: [rechargeProvider] });
  const rechargeInput = {
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_20_v1', preferredProviderId: null,
    idempotencyKey: 'deferred-recharge'
  };
  const inFlightRecharge = rechargeFixture.service.createRechargeOrder(rechargeInput);
  await new Promise((resolve) => setImmediate(resolve));
  const reservedRecharge = await rechargeFixture.service.createRechargeOrder({ ...rechargeInput });
  assert.equal(rechargeCalls, 1);
  assert.equal(reservedRecharge.status, 'pending');
  assert.equal(reservedRecharge.attempt.providerId, 'provider_deferred');
  resolveRecharge(actionRequired('provider_order_deferred'));
  const completedRecharge = await inFlightRecharge;
  assert.equal(completedRecharge.status, 'action_required');
  assert.equal((await rechargeFixture.service.createRechargeOrder({ ...rechargeInput })).status, 'action_required');
  assert.equal(rechargeCalls, 1);

  let targetCalls = 0;
  let resolveTarget;
  const sourceProvider = preview('provider_source', () => normalizedResult('confirmed_no_charge'));
  const targetProvider = preview('provider_target', () => {
    targetCalls += 1;
    return new Promise((resolve) => { resolveTarget = resolve; });
  });
  const switchFixture = serviceFixture({ providers: [sourceProvider, targetProvider] });
  const source = await switchFixture.service.createRechargeOrder({
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_20_v1', preferredProviderId: 'provider_source',
    idempotencyKey: 'deferred-switch-source'
  });
  const switchInput = {
    accountRef: 'acct-1', attemptRef: source.attempt.attemptRef, targetProviderId: 'provider_target',
    idempotencyKey: 'deferred-switch'
  };
  const inFlightSwitch = switchFixture.service.switchPaymentAttempt(switchInput);
  await new Promise((resolve) => setImmediate(resolve));
  const reservedSwitch = await switchFixture.service.switchPaymentAttempt({ ...switchInput });
  assert.equal(targetCalls, 1);
  assert.equal(reservedSwitch.status, 'pending');
  assert.equal(reservedSwitch.attempt.providerId, 'provider_target');
  resolveTarget(actionRequired('provider_order_switched'));
  const completedSwitch = await inFlightSwitch;
  assert.equal(completedSwitch.status, 'action_required');
  assert.equal((await switchFixture.service.switchPaymentAttempt({ ...switchInput })).status, 'action_required');
  assert.equal(targetCalls, 1);
});

test('enforces every explicit payment-switch matrix row and preserves immutable chain evidence', async () => {
  const rows = [
    ['entry_unavailable', 'not_charge_capable', true],
    ['confirmed_no_charge', 'confirmed_no_charge', true],
    ['provider_insufficient', 'confirmed_no_charge', true],
    ['risk_rejected', 'confirmed_no_charge', false],
    ['action_required', 'pending', false],
    ['pending', 'pending', false],
    ['unknown', 'unknown', false],
    ['possibly_charged', 'possibly_charged', false],
    ['succeeded', 'charged', false],
    ['reversed', 'reversed', false]
  ];
  for (const [status, chargeCertainty, allowed] of rows) {
    let targetCalls = 0;
    const target = preview('provider_target', () => { targetCalls += 1; return actionRequired(`target_${status}`); });
    const sourceAdapter = preview('provider_source', () => actionRequired());
    const store = createInMemoryCoinsCommerceStore({ nowFn: () => T1 });
    store.insertOrder({
      schemaVersion: 'coins_commerce_order_v1', orderRef: `order_${status}`, accountRef: 'acct-1',
      orderType: 'recharge', status: 'payment_requested',
      rechargeSnapshot: { rechargeOfferRef: 'rov_paid_10_v1', currency: 'COINS', paidCoins: 10, bonusCoins: 0 },
      createdAt: T0
    });
    const source = store.insertPaymentAttempt({
      schemaVersion: 'coins_commerce_payment_attempt_v1', attemptRef: `attempt_${status}`,
      accountRef: 'acct-1', orderRef: `order_${status}`, providerId: 'provider_source',
      sourceAttemptRef: null, targetAttemptRef: null, switchReason: null,
      idempotencyFingerprint: 'a'.repeat(64),
      quoteSnapshot: quoteFor({ rechargeOfferRef: 'rov_paid_10_v1', paidCoins: 10, bonusCoins: 0 }),
      providerOrderRef: status === 'entry_unavailable' ? null : `provider_order_${status}`,
      status, chargeCertainty, nextAction: status === 'action_required'
        ? { type: 'hosted_redirect', url: 'https://pay.example.test/source' }
        : { type: 'none' },
      reconciliationState: status === 'entry_unavailable' ? 'not_charge_capable'
        : ['unknown', 'possibly_charged'].includes(status) ? 'requires_review'
          : status === 'succeeded' ? 'charged_uncredited' : status,
      createdAt: T0, updatedAt: T0
    });
    const service = createCoinsCommerceService({
      store, providers: [sourceAdapter, target], rechargeQuoteIssuer: (value) => quoteFor(value),
      nowFn: () => T1, refFactory: refs()
    });
    const operation = service.switchPaymentAttempt({
      accountRef: 'acct-1', attemptRef: source.attemptRef, targetProviderId: 'provider_target',
      idempotencyKey: `switch_${status}`
    });
    if (!allowed) {
      await assert.rejects(operation, (error) => assertCommerceError(error, 'payment_switch_blocked'));
      assert.equal(targetCalls, 0);
      assert.equal(store.getPaymentAttemptForAccount({ accountRef: 'acct-1', attemptRef: source.attemptRef }).targetAttemptRef, null);
      continue;
    }
    const switched = await operation;
    assert.equal(targetCalls, 1);
    assert.equal(switched.attempt.providerId, 'provider_target');
    assert.equal(switched.attempt.sourceAttemptRef, source.attemptRef);
    assert.equal(switched.attempt.switchReason, `explicit_${status}`);
    const storedTarget = store.getPaymentAttemptForAccount({
      accountRef: 'acct-1', attemptRef: switched.attempt.attemptRef
    });
    assert.deepEqual(storedTarget.quoteSnapshot, source.quoteSnapshot);
    const linkedSource = store.getPaymentAttemptForAccount({ accountRef: 'acct-1', attemptRef: source.attemptRef });
    assert.equal(linkedSource.providerId, 'provider_source');
    assert.equal(linkedSource.targetAttemptRef, switched.attempt.attemptRef);
    const replay = await service.switchPaymentAttempt({
      accountRef: 'acct-1', attemptRef: source.attemptRef, targetProviderId: 'provider_target',
      idempotencyKey: `switch_${status}`
    });
    assert.deepEqual(replay, switched);
    assert.equal(targetCalls, 1);
  }
});

test('blocks same or previously tried providers and hides cross-account attempts', async () => {
  const first = preview('provider_first', () => normalizedResult('confirmed_no_charge'));
  const second = preview('provider_second', () => normalizedResult('confirmed_no_charge'));
  const { service } = serviceFixture({ providers: [first, second] });
  const created = await service.createRechargeOrder({
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_10_v1', preferredProviderId: 'provider_first',
    idempotencyKey: 'switch-source'
  });
  await assert.rejects(service.getPaymentAttempt({ accountRef: 'acct-2', attemptRef: created.attempt.attemptRef }), (error) => assertCommerceError(error, 'not_found'));
  await assert.rejects(service.switchPaymentAttempt({
    accountRef: 'acct-1', attemptRef: created.attempt.attemptRef,
    targetProviderId: 'provider_first', idempotencyKey: 'same-provider'
  }), (error) => assertCommerceError(error, 'payment_switch_blocked'));
  const switched = await service.switchPaymentAttempt({
    accountRef: 'acct-1', attemptRef: created.attempt.attemptRef,
    targetProviderId: 'provider_second', idempotencyKey: 'first-switch'
  });
  await assert.rejects(service.switchPaymentAttempt({
    accountRef: 'acct-1', attemptRef: switched.attempt.attemptRef,
    targetProviderId: 'provider_first', idempotencyKey: 'repeat-provider'
  }), (error) => assertCommerceError(error, 'payment_switch_blocked'));
});

test('projects exact redacted payment logs and read-only six-partition referral data', async () => {
  const provider = preview('provider_logs', () => actionRequired('provider_order_sensitive'));
  const { service } = serviceFixture({
    providers: [provider],
    walletLots: [lot({ lotRef: 'referral-log', origin: 'referral', issuedCoins: 25 })]
  });
  await service.createRechargeOrder({
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_20_v1', preferredProviderId: null,
    idempotencyKey: 'raw-caller-key-must-not-log'
  });
  const logs = service.listPaymentLogs();
  assert.deepEqual(Object.keys(logs).sort(), ['items', 'nextCursor', 'safety']);
  assert.deepEqual(logs.safety, { readOnly: true, mutationAllowed: false });
  assert.equal(logs.items.length, 1);
  assert.deepEqual(Object.keys(logs.items[0]), [
    'attemptRef', 'orderRef', 'providerId', 'status', 'chargeCertainty',
    'sourceAttemptRef', 'targetAttemptRef', 'switchReason', 'idempotencyFingerprint',
    'reconciliationState', 'createdAt', 'updatedAt'
  ]);
  assert.match(logs.items[0].idempotencyFingerprint, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(logs);
  for (const forbidden of ['acct-1', 'provider_order_sensitive', 'raw-caller-key-must-not-log', 'https://', 'quoteSnapshot', 'nextAction']) {
    assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.throws(() => { logs.items[0].status = 'changed'; }, TypeError);

  const referral = service.getReferralSummary({ accountRef: 'acct-1' });
  assert.deepEqual(Object.keys(referral), [
    'cumulativeEarnedCoins', 'availableCoins', 'internallyConsumedCoins', 'frozenCoins',
    'frozenForSettlementCoins', 'externallySettledCoins', 'reversedCoins'
  ]);
  assert.equal(referral.cumulativeEarnedCoins, 25);
  assert.equal(Object.hasOwn(referral, 'accountRef'), false);
  assert.equal(Object.hasOwn(referral, 'at'), false);
});

test('rejects extra, accessor, symbol, cyclic, exotic, undefined, bigint, and unsafe service inputs without getters', async () => {
  const { service } = serviceFixture();
  let getterCalls = 0;
  const accessor = { accountRef: 'acct-1' };
  Object.defineProperty(accessor, 'extra', { enumerable: true, get() { getterCalls += 1; return true; } });
  const symbol = { accountRef: 'acct-1' };
  symbol[Symbol('extra')] = true;
  const cyclic = { accountRef: 'acct-1' };
  cyclic.loop = cyclic;
  for (const input of [accessor, symbol, cyclic, Object.assign(Object.create(null), { accountRef: 'acct-1' }), { accountRef: undefined }, { accountRef: 1n }, { accountRef: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => service.getWallet(input), (error) => assertCommerceError(error, 'validation_error'));
  }
  assert.equal(getterCalls, 0);
});

test('rejects own enumerable __proto__ data at public and quote boundaries without prototype pollution or getters', async () => {
  const legacyProtoDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, '__proto__');
  let legacySetterCalls = 0;
  Object.defineProperty(Object.prototype, '__proto__', {
    ...legacyProtoDescriptor,
    set(value) {
      legacySetterCalls += 1;
      return legacyProtoDescriptor.set.call(this, value);
    }
  });
  try {
  const publicInput = { accountRef: 'acct-1' };
  Object.defineProperty(publicInput, '__proto__', {
    value: { task4Polluted: true }, enumerable: true, configurable: true, writable: true
  });
  const publicFixture = serviceFixture();
  assert.throws(() => publicFixture.service.getWallet(publicInput), (error) => assertCommerceError(error, 'validation_error'));
  assert.equal(Object.getPrototypeOf(publicInput), Object.prototype);
  assert.equal(Object.prototype.task4Polluted, undefined);

  let getterCalls = 0;
  const accessorInput = { accountRef: 'acct-1' };
  Object.defineProperty(accessorInput, '__proto__', {
    enumerable: true,
    get() { getterCalls += 1; return { task4Polluted: true }; }
  });
  assert.throws(() => publicFixture.service.getWallet(accessorInput), (error) => assertCommerceError(error, 'validation_error'));
  assert.equal(getterCalls, 0);
  assert.equal(Object.prototype.task4Polluted, undefined);

  let providerCalls = 0;
  const provider = directProvider('provider_proto', async () => {
    providerCalls += 1;
    return actionRequired('provider_order_proto');
  });
  const quoteFixture = serviceFixture({
    providers: [provider],
    rechargeQuoteIssuer(value) {
      const quote = quoteFor(value);
      Object.defineProperty(quote, '__proto__', {
        value: { task4Polluted: true }, enumerable: true, configurable: true, writable: true
      });
      return quote;
    }
  });
  const result = await quoteFixture.service.createRechargeOrder({
    accountRef: 'acct-1', rechargeOfferRef: 'rov_paid_10_v1', preferredProviderId: null,
    idempotencyKey: 'proto-quote'
  });
  assert.equal(result.status, 'entry_unavailable');
  assert.equal(result.attempt, null);
  assert.equal(providerCalls, 0);
  assert.equal(Object.prototype.task4Polluted, undefined);
  } finally {
    Object.defineProperty(Object.prototype, '__proto__', legacyProtoDescriptor);
  }
  assert.equal(legacySetterCalls, 0);
});
