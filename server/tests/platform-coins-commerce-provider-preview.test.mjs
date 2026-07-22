import assert from 'node:assert/strict';
import test from 'node:test';

import { createCoinsCommerceProviderPreview } from '../services/platform/coins-commerce-provider-preview.mjs';

const input = () => ({
  rechargeOrderRef: 'recharge_order_1',
  attemptRef: 'attempt_1',
  quoteSnapshot: {
    rechargeOfferRef: 'rov_paid_10_v1', paidCoins: 10, bonusCoins: 0,
    fiatAmountMinor: 1000, fiatCurrency: 'USD', rateNumerator: 100,
    rateDenominator: 1, rateVersionRef: 'rate_usd_v1', promotionRef: null
  },
  idempotencyKey: 'idem_1'
});

const actionRequired = (url = 'https://pay.example.test/checkout') => ({
  providerOrderRef: 'provider_order_1', status: 'action_required',
  chargeCertainty: 'pending', nextAction: { type: 'hosted_redirect', url }
});

function preview(fn = () => actionRequired(), options = {}) {
  return createCoinsCommerceProviderPreview({ providerId: 'preview_local', createRechargeOrderFn: fn, ...options });
}

test('exposes only a frozen stable provider capability', () => {
  const adapter = preview();
  assert.deepEqual(Object.keys(adapter), ['providerId', 'capabilities', 'createRechargeOrder']);
  assert.equal(adapter.providerId, 'preview_local');
  assert.deepEqual(adapter.capabilities, { createRechargeOrder: true });
  assert.ok(Object.isFrozen(adapter));
  assert.ok(Object.isFrozen(adapter.capabilities));
  assert.throws(() => createCoinsCommerceProviderPreview({ providerId: 'X', createRechargeOrderFn() {} }), /validation_error/);
  assert.throws(() => createCoinsCommerceProviderPreview({ providerId: 'preview_local', createRechargeOrderFn() {}, allowLoopbackHttp: 'true' }), /validation_error/);
});

test('passes a detached frozen exact input to the injected preview function', async () => {
  let received;
  const original = input();
  const adapter = preview((value) => { received = value; return actionRequired(); });
  const result = await adapter.createRechargeOrder(original);
  assert.notEqual(received, original);
  assert.notEqual(received.quoteSnapshot, original.quoteSnapshot);
  assert.deepEqual(received, original);
  assert.ok(Object.isFrozen(received));
  assert.ok(Object.isFrozen(received.quoteSnapshot));
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.nextAction));
  original.quoteSnapshot.paidCoins = 99;
  assert.equal(received.quoteSnapshot.paidCoins, 10);
});

test('rejects closed-invalid caller input without executing injected function', async () => {
  let calls = 0;
  const adapter = preview(() => { calls += 1; return actionRequired(); });
  const invalid = input();
  invalid.extra = true;
  await assert.rejects(adapter.createRechargeOrder(invalid), /validation_error/);
  assert.equal(calls, 0);
});

test('rejects getters, symbols, non-enumerable properties, cycles, and non-plain input without getters running', async () => {
  const adapter = preview();
  const getter = input();
  Object.defineProperty(getter, 'extra', { enumerable: true, get() { throw new Error('must not run'); } });
  await assert.rejects(adapter.createRechargeOrder(getter), /validation_error/);
  const symbol = input();
  symbol[Symbol('extra')] = 1;
  await assert.rejects(adapter.createRechargeOrder(symbol), /validation_error/);
  const hidden = input();
  Object.defineProperty(hidden, 'extra', { value: 1 });
  await assert.rejects(adapter.createRechargeOrder(hidden), /validation_error/);
  const cyclic = input();
  cyclic.quoteSnapshot.loop = cyclic;
  await assert.rejects(adapter.createRechargeOrder(cyclic), /validation_error/);
  await assert.rejects(adapter.createRechargeOrder(Object.assign(Object.create(null), input())), /validation_error/);
});

test('maps injected throws and rejections to a non-leaking provider unavailable error', async () => {
  for (const fn of [() => { throw new Error('secret failure'); }, async () => { throw { token: 'secret' }; }]) {
    await assert.rejects(preview(fn).createRechargeOrder(input()), (error) => {
      assert.equal(error.code, 'provider_unavailable');
      assert.deepEqual(error.details, { reason: 'preview_adapter_failed' });
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
  }
});

test('rejects unsafe or non-closed provider results without exposing them', async () => {
  const unsafe = actionRequired();
  unsafe.rawPayload = { token: 'secret' };
  await assert.rejects(preview(() => unsafe).createRechargeOrder(input()), (error) => error.code === 'provider_unavailable' && error.details.reason === 'invalid_provider_result');
  const getter = actionRequired();
  Object.defineProperty(getter, 'rawResponse', { enumerable: true, get() { throw new Error('must not run'); } });
  await assert.rejects(preview(() => getter).createRechargeOrder(input()), /provider_unavailable/);
  const cyclic = actionRequired();
  cyclic.nextAction.loop = cyclic;
  await assert.rejects(preview(() => cyclic).createRechargeOrder(input()), /provider_unavailable/);
});

test('enforces safe hosted redirects and loopback-only HTTP previews', async () => {
  for (const url of ['http://pay.example.test/checkout', 'ftp://pay.example.test/checkout', 'https://user:pass@pay.example.test/checkout']) {
    await assert.rejects(preview(() => actionRequired(url)).createRechargeOrder(input()), /provider_unavailable/);
  }
  await assert.rejects(preview(() => actionRequired('http://localhost:3456/checkout')).createRechargeOrder(input()), /provider_unavailable/);
  const result = await preview(() => actionRequired('http://[::1]:3456/checkout'), { allowLoopbackHttp: true }).createRechargeOrder(input());
  assert.equal(result.nextAction.url, 'http://[::1]:3456/checkout');
});

test('requires providerOrderRef except for entry unavailable and permits QR payload', async () => {
  const unavailable = await preview(() => ({ status: 'entry_unavailable', chargeCertainty: 'not_charge_capable', nextAction: { type: 'none' } })).createRechargeOrder(input());
  assert.equal(Object.hasOwn(unavailable, 'providerOrderRef'), false);
  await assert.rejects(preview(() => ({ status: 'entry_unavailable', chargeCertainty: 'not_charge_capable', nextAction: { type: 'none' }, providerOrderRef: 'must_not_exist' })).createRechargeOrder(input()), /provider_unavailable/);
  await assert.rejects(preview(() => ({ status: 'pending', chargeCertainty: 'pending', nextAction: { type: 'none' } })).createRechargeOrder(input()), /provider_unavailable/);
  const qr = await preview(() => ({ providerOrderRef: 'provider_order_2', status: 'action_required', chargeCertainty: 'pending', nextAction: { type: 'qr', payload: 'preview-qr' } })).createRechargeOrder(input());
  assert.equal(qr.nextAction.payload, 'preview-qr');
});

test('permits dense bank-instruction arrays but rejects exotic array shapes', async () => {
  const bankInstructions = () => ({
    providerOrderRef: 'provider_order_bank', status: 'action_required', chargeCertainty: 'pending',
    nextAction: { type: 'bank_instructions', instructions: ['Use preview bank', 'Reference provider_order_bank'] }
  });
  const result = await preview(bankInstructions).createRechargeOrder(input());
  assert.deepEqual(result.nextAction.instructions, ['Use preview bank', 'Reference provider_order_bank']);
  assert.ok(Object.isFrozen(result.nextAction.instructions));

  const sparse = bankInstructions();
  sparse.nextAction.instructions = ['Use preview bank', , 'Reference provider_order_bank'];
  await assert.rejects(preview(() => sparse).createRechargeOrder(input()), /provider_unavailable/);
  const extra = bankInstructions();
  extra.nextAction.instructions.extra = 'nope';
  await assert.rejects(preview(() => extra).createRechargeOrder(input()), /provider_unavailable/);
  const accessor = bankInstructions();
  Object.defineProperty(accessor.nextAction.instructions, '0', { enumerable: true, get() { throw new Error('must not run'); } });
  await assert.rejects(preview(() => accessor).createRechargeOrder(input()), /provider_unavailable/);
  const hiddenIndex = bankInstructions();
  Object.defineProperty(hiddenIndex.nextAction.instructions, '0', { enumerable: false, value: 'Use preview bank' });
  await assert.rejects(preview(() => hiddenIndex).createRechargeOrder(input()), /provider_unavailable/);
  const cyclic = bankInstructions();
  cyclic.nextAction.instructions.push(cyclic.nextAction.instructions);
  await assert.rejects(preview(() => cyclic).createRechargeOrder(input()), /provider_unavailable/);
});

test('validates factory options before reading fields or running getters', () => {
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'providerId', { enumerable: true, get() { getterCalls += 1; return 'preview_local'; } });
  Object.defineProperty(accessor, 'createRechargeOrderFn', { enumerable: true, value() {} });
  assert.throws(() => createCoinsCommerceProviderPreview(accessor), /validation_error/);
  assert.equal(getterCalls, 0);
  for (const options of [null, undefined, 'preview_local', { providerId: 'preview_local', createRechargeOrderFn() {}, credential: 'nope' }, { providerId: 'preview_local', createRechargeOrderFn() {}, config: {} }]) {
    assert.throws(() => createCoinsCommerceProviderPreview(options), /validation_error/);
  }
});
