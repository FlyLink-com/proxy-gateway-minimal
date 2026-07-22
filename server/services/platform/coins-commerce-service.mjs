import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import {
  commerceError,
  createOrderItemSnapshot,
  normalizePaymentResult
} from './coins-commerce-model.mjs';
import { canonicalCommerceRequestDigest } from './coins-commerce-store.mjs';

const PROVIDER_ID = /^[a-z][a-z0-9_-]{2,63}$/;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SCOPES = Object.freeze({
  product: 'coins_commerce.product_order.v1',
  recharge: 'coins_commerce.recharge_order.v1',
  switch: 'coins_commerce.payment_switch.v1'
});
const REF_KINDS = new Set([
  'product_order', 'recharge_order', 'coin_hold', 'capture_transaction',
  'fulfillment_plan', 'payment_attempt'
]);
const PAYMENT_STATUSES = new Set([
  'entry_unavailable', 'confirmed_no_charge', 'provider_insufficient', 'risk_rejected',
  'action_required', 'pending', 'unknown', 'possibly_charged', 'succeeded', 'reversed'
]);
const SWITCHABLE = new Map([
  ['entry_unavailable', 'not_charge_capable'],
  ['confirmed_no_charge', 'confirmed_no_charge'],
  ['provider_insufficient', 'confirmed_no_charge']
]);
const QUOTE_KEYS = [
  'rechargeOfferRef', 'paidCoins', 'bonusCoins', 'fiatAmountMinor', 'fiatCurrency',
  'rateNumerator', 'rateDenominator', 'rateVersionRef', 'promotionRef'
];
const ATTEMPT_LOG_KEYS = [
  'attemptRef', 'orderRef', 'providerId', 'status', 'chargeCertainty',
  'sourceAttemptRef', 'targetAttemptRef', 'switchReason', 'idempotencyFingerprint',
  'reconciliationState', 'createdAt', 'updatedAt'
];

function validation() {
  throw commerceError('validation_error', {});
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function cloneClosed(value, active = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) validation();
    return value;
  }
  if (typeof value !== 'object' || active.has(value)) validation();
  active.add(value);
  let ownKeys;
  let prototype;
  try {
    ownKeys = Reflect.ownKeys(value);
    prototype = Object.getPrototypeOf(value);
  } catch {
    validation();
  }
  if (ownKeys.some((key) => typeof key === 'symbol')) validation();
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) validation();
    let descriptors;
    try { descriptors = Object.getOwnPropertyDescriptors(value); } catch { validation(); }
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
      || lengthDescriptor.enumerable || lengthDescriptor.configurable) validation();
    const length = lengthDescriptor.value;
    const expectedKeys = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    if (ownKeys.length !== expectedKeys.size || ownKeys.some((key) => !expectedKeys.has(key))) validation();
    const result = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) validation();
      result.push(cloneClosed(descriptor.value, active));
    }
    active.delete(value);
    return result;
  }
  if (prototype !== Object.prototype) validation();
  const result = {};
  for (const key of ownKeys) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { validation(); }
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) validation();
    Object.defineProperty(result, key, {
      value: cloneClosed(descriptor.value, active),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  active.delete(value);
  return result;
}

function deepFreeze(value) {
  if (Array.isArray(value) || isPlainObject(value)) Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function snapshot(value) {
  return deepFreeze(cloneClosed(value));
}

function exactRecord(value, requiredKeys, optionalKeys = []) {
  let clone;
  try { clone = cloneClosed(value); } catch { validation(); }
  if (!isPlainObject(clone)) validation();
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Object.keys(clone);
  if (!requiredKeys.every((key) => Object.hasOwn(clone, key)) || keys.some((key) => !allowed.has(key))) validation();
  return clone;
}

function trimmedString(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) validation();
  return value;
}

function safeRef(value) {
  trimmedString(value);
  if (!SAFE_REF.test(value)) validation();
  return value;
}

function canonicalNow(nowFn) {
  let value;
  try { value = nowFn(); } catch { validation(); }
  trimmedString(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) validation();
  return value;
}

function validateAccountRef(value) {
  return safeRef(value);
}

function validateIdempotencyKey(value) {
  trimmedString(value);
  if (value.length > 256) validation();
  return value;
}

function validateRefFactoryResult(refFactory, kind) {
  if (!REF_KINDS.has(kind)) validation();
  let value;
  try { value = refFactory(kind); } catch { validation(); }
  return safeRef(value);
}

function validateFunctionRecord(value, requiredKeys, optionalKeys = []) {
  try {
    if (!isPlainObject(value) || Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) validation();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    const allowed = new Set([...requiredKeys, ...optionalKeys]);
    if (!requiredKeys.every((key) => Object.hasOwn(descriptors, key)) || keys.some((key) => !allowed.has(key))) validation();
    for (const descriptor of Object.values(descriptors)) {
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) validation();
    }
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch {
    validation();
  }
}

function validateProviderArray(value) {
  let providers;
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) validation();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
      || lengthDescriptor.enumerable || lengthDescriptor.configurable) validation();
    const length = lengthDescriptor.value;
    const expectedKeys = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    if (Reflect.ownKeys(value).length !== expectedKeys.size || Reflect.ownKeys(value).some((key) => !expectedKeys.has(key))) validation();
    providers = Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) validation();
      const provider = validateFunctionRecord(descriptor.value, ['providerId', 'capabilities', 'createRechargeOrder']);
      if (typeof provider.providerId !== 'string' || !PROVIDER_ID.test(provider.providerId)
        || typeof provider.createRechargeOrder !== 'function') validation();
      const capabilities = exactRecord(provider.capabilities, ['createRechargeOrder']);
      if (capabilities.createRechargeOrder !== true) validation();
      return Object.freeze({
        providerId: provider.providerId,
        capabilities: deepFreeze(capabilities),
        createRechargeOrder: provider.createRechargeOrder
      });
    });
  } catch {
    validation();
  }
  if (new Set(providers.map(({ providerId }) => providerId)).size !== providers.length) validation();
  return Object.freeze(providers);
}

function validateStore(store) {
  const required = [
    'listCatalog', 'getProductVersion', 'getOffer', 'getRechargeOffer', 'getActiveMemberships',
    'appendCoinLot', 'getWalletSummary', 'listWalletTransactions', 'createCoinHold',
    'captureCoinHold', 'getReferralSummary', 'insertOrder', 'getOrderForAccount',
    'listOrdersForAccount', 'insertPaymentAttempt', 'updatePaymentAttempt',
    'getPaymentAttemptForAccount', 'listPaymentAttempts', 'insertFulfillmentPlan',
    'getFulfillmentPlan', 'getIdempotencyResult', 'recordIdempotencyResult', 'runAtomicMutation'
  ];
  try {
    if (!isPlainObject(store)) validation();
    const descriptors = Object.getOwnPropertyDescriptors(store);
    for (const name of required) {
      const descriptor = descriptors[name];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') validation();
    }
  } catch {
    validation();
  }
  return store;
}

function validateFactoryOptions(options) {
  const values = validateFunctionRecord(options, ['store'], [
    'providers', 'rechargeQuoteIssuer', 'nowFn', 'refFactory'
  ]);
  const store = validateStore(values.store);
  const providers = validateProviderArray(values.providers ?? []);
  const rechargeQuoteIssuer = values.rechargeQuoteIssuer ?? null;
  const nowFn = values.nowFn ?? (() => new Date().toISOString());
  const refFactory = values.refFactory ?? ((kind) => `${kind}_${randomUUID()}`);
  if ((rechargeQuoteIssuer !== null && typeof rechargeQuoteIssuer !== 'function')
    || (providers.length > 0 && rechargeQuoteIssuer === null)
    || typeof nowFn !== 'function' || typeof refFactory !== 'function') validation();
  return { store, providers, rechargeQuoteIssuer, nowFn, refFactory };
}

function fingerprint(scope, accountRef, idempotencyKey, requestDigest) {
  return createHash('sha256')
    .update(`COINS_COMMERCE_PROVIDER_IDEMPOTENCY:v1\0${scope.length}:${scope}${accountRef.length}:${accountRef}${idempotencyKey.length}:${idempotencyKey}${requestDigest}`, 'utf8')
    .digest('hex');
}

function reconciliationState(status) {
  if (status === 'entry_unavailable') return 'not_charge_capable';
  if (['confirmed_no_charge', 'provider_insufficient', 'risk_rejected'].includes(status)) return 'confirmed_no_charge';
  if (['action_required', 'pending'].includes(status)) return 'pending';
  if (['unknown', 'possibly_charged'].includes(status)) return 'requires_review';
  if (status === 'succeeded') return 'charged_uncredited';
  return 'reversed';
}

function validateQuote(value, rechargeOffer) {
  const quote = exactRecord(value, QUOTE_KEYS);
  if (quote.rechargeOfferRef !== rechargeOffer.rechargeOfferRef
    || quote.paidCoins !== rechargeOffer.paidCoins
    || quote.bonusCoins !== rechargeOffer.bonusCoins) validation();
  for (const key of ['fiatAmountMinor', 'rateNumerator', 'rateDenominator']) {
    if (!Number.isSafeInteger(quote[key]) || quote[key] <= 0) validation();
  }
  if (!/^[A-Z]{3}$/.test(quote.fiatCurrency)) validation();
  safeRef(quote.rechargeOfferRef);
  safeRef(quote.rateVersionRef);
  if (quote.promotionRef !== null) safeRef(quote.promotionRef);
  return snapshot(quote);
}

function normalizeProviderOutcome(value) {
  const closed = cloneClosed(value);
  const result = normalizePaymentResult(closed);
  const hasProviderOrderRef = Object.hasOwn(result, 'providerOrderRef');
  if ((result.status === 'entry_unavailable' && hasProviderOrderRef)
    || (result.status !== 'entry_unavailable' && !hasProviderOrderRef)) validation();
  if (result.nextAction.type === 'hosted_redirect') {
    let url;
    try { url = new URL(result.nextAction.url); } catch { validation(); }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || isIP(hostname) !== 0
      || !hostname.includes('.') || hostname === 'localhost' || hostname.endsWith('.localhost')) validation();
  }
  return result;
}

function attemptProjection(attempt) {
  return snapshot({
    attemptRef: attempt.attemptRef,
    orderRef: attempt.orderRef,
    providerId: attempt.providerId,
    status: attempt.status,
    chargeCertainty: attempt.chargeCertainty,
    nextAction: attempt.nextAction,
    sourceAttemptRef: attempt.sourceAttemptRef,
    targetAttemptRef: attempt.targetAttemptRef,
    switchReason: attempt.switchReason,
    reconciliationState: attempt.reconciliationState,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt
  });
}

function attemptLogProjection(attempt) {
  return snapshot(Object.fromEntries(ATTEMPT_LOG_KEYS.map((key) => [key, attempt[key]])));
}

function paymentResponse(order, attempt) {
  if (attempt === null) {
    return snapshot({
      order,
      attempt: null,
      status: 'entry_unavailable',
      chargeCertainty: 'not_charge_capable',
      nextAction: { type: 'none' }
    });
  }
  return snapshot({
    order,
    attempt: attemptProjection(attempt),
    status: attempt.status,
    chargeCertainty: attempt.chargeCertainty,
    nextAction: attempt.nextAction
  });
}

export function createCoinsCommerceService(options) {
  const { store, providers, rechargeQuoteIssuer, nowFn, refFactory } = validateFactoryOptions(options);
  const providerById = new Map(providers.map((provider) => [provider.providerId, provider]));

  function now() {
    return canonicalNow(nowFn);
  }

  function nextRef(kind) {
    return validateRefFactoryResult(refFactory, kind);
  }

  function idemInput(scope, accountRef, idempotencyKey, requestDigest) {
    return { scope, accountRef, idempotencyKey, requestDigest };
  }

  function getWallet(input) {
    const { accountRef } = exactRecord(input, ['accountRef']);
    validateAccountRef(accountRef);
    const at = now();
    return snapshot({
      summary: store.getWalletSummary({ accountRef, at }),
      transactions: store.listWalletTransactions({ accountRef, limit: 50 })
    });
  }

  function getCatalog(input) {
    const { accountRef } = exactRecord(input, ['accountRef']);
    validateAccountRef(accountRef);
    const at = now();
    return snapshot({
      catalog: store.listCatalog(),
      activeMemberships: store.getActiveMemberships({ accountRef, at })
    });
  }

  function listOrders(input) {
    const { accountRef } = exactRecord(input, ['accountRef']);
    validateAccountRef(accountRef);
    return snapshot(store.listOrdersForAccount({ accountRef }));
  }

  function resolveProductResult(accountRef, pointer) {
    const order = store.getOrderForAccount({ accountRef, orderRef: pointer.orderRef });
    const fulfillmentPlan = store.getFulfillmentPlan(pointer.fulfillmentPlanRef);
    if (fulfillmentPlan.accountRef !== accountRef || fulfillmentPlan.orderRef !== order.orderRef) validation();
    return snapshot({ order, fulfillmentPlan });
  }

  async function createProductOrder(input) {
    const values = exactRecord(input, ['accountRef', 'offerVersionRef', 'idempotencyKey']);
    const accountRef = validateAccountRef(values.accountRef);
    const offerVersionRef = safeRef(values.offerVersionRef);
    const idempotencyKey = validateIdempotencyKey(values.idempotencyKey);
    const requestDigest = canonicalCommerceRequestDigest({ offerVersionRef });
    const idempotency = idemInput(SCOPES.product, accountRef, idempotencyKey, requestDigest);
    const replay = store.getIdempotencyResult(idempotency);
    if (replay !== null) return resolveProductResult(accountRef, replay);

    const createdAt = now();
    const offerVersion = store.getOffer(offerVersionRef);
    const productVersion = store.getProductVersion(offerVersion.productVersionRef);
    const activeMemberships = store.getActiveMemberships({ accountRef, at: createdAt });
    const item = createOrderItemSnapshot({
      productVersion,
      offerVersion,
      priceContext: { activeMemberships }
    });
    const orderRef = nextRef('product_order');
    const holdRef = nextRef('coin_hold');
    const captureTransactionRef = nextRef('capture_transaction');
    const fulfillmentPlanRef = nextRef('fulfillment_plan');
    const order = snapshot({
      schemaVersion: 'coins_commerce_order_v1',
      orderRef,
      accountRef,
      orderType: 'product',
      status: 'fulfillment_planned',
      currency: 'COINS',
      item,
      amountCoins: item.payableCoins,
      holdRef,
      captureTransactionRef,
      fulfillmentPlanRef,
      createdAt
    });
    const fulfillmentPlan = snapshot({
      schemaVersion: 'coins_commerce_fulfillment_plan_v1',
      planRef: fulfillmentPlanRef,
      orderRef,
      accountRef,
      status: 'ready',
      productVersionRef: item.productVersionRef,
      offerVersionRef: item.offerVersionRef,
      grants: item.grants,
      createdAt
    });
    try {
      store.runAtomicMutation(() => {
        store.createCoinHold({ accountRef, holdRef, amountCoins: item.payableCoins });
        store.captureCoinHold({ accountRef, holdRef, transactionRef: captureTransactionRef });
        store.insertOrder(order);
        store.insertFulfillmentPlan(fulfillmentPlan);
        store.recordIdempotencyResult({
          ...idempotency,
          result: { orderRef, fulfillmentPlanRef }
        });
      });
    } catch (error) {
      if (error?.name === 'CoinsCommerceError' && error.code === 'insufficient_coins') {
        throw commerceError('insufficient_coins', {
          availableCoins: error.details.availableCoins,
          shortfallCoins: error.details.shortfallCoins,
          recovery: 'go_to_recharge'
        });
      }
      throw error;
    }
    return resolveProductResult(accountRef, { orderRef, fulfillmentPlanRef });
  }

  function latestAttemptFrom(accountRef, attemptRef) {
    const visited = new Set();
    let current = store.getPaymentAttemptForAccount({ accountRef, attemptRef });
    while (current.targetAttemptRef !== null) {
      if (visited.has(current.attemptRef)) validation();
      visited.add(current.attemptRef);
      const target = store.getPaymentAttemptForAccount({ accountRef, attemptRef: current.targetAttemptRef });
      if (target.orderRef !== current.orderRef || target.sourceAttemptRef !== current.attemptRef) validation();
      current = target;
    }
    return current;
  }

  function resolvePaymentPointer(accountRef, pointer) {
    const order = store.getOrderForAccount({ accountRef, orderRef: pointer.orderRef });
    if (pointer.rootAttemptRef === null) return paymentResponse(order, null);
    const attempt = latestAttemptFrom(accountRef, pointer.rootAttemptRef);
    if (attempt.orderRef !== order.orderRef) validation();
    return paymentResponse(order, attempt);
  }

  function rechargeOrder(accountRef, rechargeOffer, orderRef, createdAt) {
    return snapshot({
      schemaVersion: 'coins_commerce_order_v1',
      orderRef,
      accountRef,
      orderType: 'recharge',
      status: 'payment_requested',
      rechargeSnapshot: {
        rechargeOfferRef: rechargeOffer.rechargeOfferRef,
        currency: 'COINS',
        paidCoins: rechargeOffer.paidCoins,
        bonusCoins: rechargeOffer.bonusCoins
      },
      createdAt
    });
  }

  function pendingAttempt({
    attemptRef, accountRef, orderRef, providerId, sourceAttemptRef, switchReason,
    idempotencyFingerprint, quoteSnapshot, createdAt
  }) {
    return snapshot({
      schemaVersion: 'coins_commerce_payment_attempt_v1',
      attemptRef,
      accountRef,
      orderRef,
      providerId,
      sourceAttemptRef,
      targetAttemptRef: null,
      switchReason,
      idempotencyFingerprint,
      quoteSnapshot,
      providerOrderRef: null,
      status: 'pending',
      chargeCertainty: 'pending',
      nextAction: { type: 'none' },
      reconciliationState: 'pending',
      createdAt,
      updatedAt: createdAt
    });
  }

  function completedAttempt(attempt, result, updatedAt) {
    return snapshot({
      ...attempt,
      providerOrderRef: Object.hasOwn(result, 'providerOrderRef') ? result.providerOrderRef : null,
      status: result.status,
      chargeCertainty: result.chargeCertainty,
      nextAction: result.nextAction,
      reconciliationState: reconciliationState(result.status),
      updatedAt
    });
  }

  async function callProvider(provider, orderRef, attempt) {
    let result;
    try {
      const providerInput = snapshot({
        rechargeOrderRef: orderRef,
        attemptRef: attempt.attemptRef,
        quoteSnapshot: attempt.quoteSnapshot,
        idempotencyKey: attempt.idempotencyFingerprint
      });
      const raw = await provider.createRechargeOrder(providerInput);
      result = normalizeProviderOutcome(raw);
    } catch {
      result = snapshot({ status: 'unknown', chargeCertainty: 'unknown', nextAction: { type: 'none' } });
    }
    const updated = completedAttempt(attempt, result, now());
    return store.runAtomicMutation(() => store.updatePaymentAttempt(updated));
  }

  function orderedProviders(preferredProviderId) {
    if (preferredProviderId === null) return providers;
    const preferred = providerById.get(preferredProviderId);
    if (!preferred) validation();
    return Object.freeze([preferred, ...providers.filter(({ providerId }) => providerId !== preferredProviderId)]);
  }

  async function createRechargeOrder(input) {
    const values = exactRecord(input, [
      'accountRef', 'rechargeOfferRef', 'preferredProviderId', 'idempotencyKey'
    ]);
    const accountRef = validateAccountRef(values.accountRef);
    const rechargeOfferRef = safeRef(values.rechargeOfferRef);
    if (values.preferredProviderId !== null) {
      if (typeof values.preferredProviderId !== 'string' || !providerById.has(values.preferredProviderId)) validation();
    }
    const preferredProviderId = values.preferredProviderId;
    const idempotencyKey = validateIdempotencyKey(values.idempotencyKey);
    const requestDigest = canonicalCommerceRequestDigest({ rechargeOfferRef, preferredProviderId });
    const idempotency = idemInput(SCOPES.recharge, accountRef, idempotencyKey, requestDigest);
    const replay = store.getIdempotencyResult(idempotency);
    if (replay !== null) return resolvePaymentPointer(accountRef, replay);

    const createdAt = now();
    const orderRef = nextRef('recharge_order');
    const rechargeOffer = store.getRechargeOffer(rechargeOfferRef);
    const order = rechargeOrder(accountRef, rechargeOffer, orderRef, createdAt);
    const route = orderedProviders(preferredProviderId);
    if (route.length === 0) {
      store.runAtomicMutation(() => {
        store.insertOrder(order);
        store.recordIdempotencyResult({ ...idempotency, result: { orderRef, rootAttemptRef: null } });
      });
      return paymentResponse(order, null);
    }

    const idempotencyFingerprint = fingerprint(SCOPES.recharge, accountRef, idempotencyKey, requestDigest);
    let quoteSnapshot;
    try {
      const issuerInput = snapshot({
        accountRef,
        rechargeOfferRef,
        paidCoins: rechargeOffer.paidCoins,
        bonusCoins: rechargeOffer.bonusCoins,
        quotedAt: createdAt,
        idempotencyFingerprint
      });
      quoteSnapshot = validateQuote(rechargeQuoteIssuer(issuerInput), rechargeOffer);
    } catch {
      store.runAtomicMutation(() => {
        store.insertOrder(order);
        store.recordIdempotencyResult({ ...idempotency, result: { orderRef, rootAttemptRef: null } });
      });
      return paymentResponse(order, null);
    }

    const rootAttemptRef = nextRef('payment_attempt');
    let attempt = pendingAttempt({
      attemptRef: rootAttemptRef,
      accountRef,
      orderRef,
      providerId: route[0].providerId,
      sourceAttemptRef: null,
      switchReason: null,
      idempotencyFingerprint,
      quoteSnapshot,
      createdAt
    });
    store.runAtomicMutation(() => {
      store.insertOrder(order);
      store.insertPaymentAttempt(attempt);
      store.recordIdempotencyResult({ ...idempotency, result: { orderRef, rootAttemptRef } });
    });

    for (let index = 0; index < route.length; index += 1) {
      const provider = route[index];
      attempt = await callProvider(provider, orderRef, attempt);
      if (attempt.status !== 'entry_unavailable' || attempt.chargeCertainty !== 'not_charge_capable'
        || index + 1 >= route.length) break;
      const targetRef = nextRef('payment_attempt');
      const targetCreatedAt = now();
      const target = pendingAttempt({
        attemptRef: targetRef,
        accountRef,
        orderRef,
        providerId: route[index + 1].providerId,
        sourceAttemptRef: attempt.attemptRef,
        switchReason: 'automatic_entry_unavailable',
        idempotencyFingerprint,
        quoteSnapshot,
        createdAt: targetCreatedAt
      });
      store.runAtomicMutation(() => {
        store.updatePaymentAttempt({ ...attempt, targetAttemptRef: targetRef, updatedAt: targetCreatedAt });
        store.insertPaymentAttempt(target);
      });
      attempt = target;
    }
    return paymentResponse(order, attempt);
  }

  async function getPaymentAttempt(input) {
    const values = exactRecord(input, ['accountRef', 'attemptRef']);
    const accountRef = validateAccountRef(values.accountRef);
    const attemptRef = safeRef(values.attemptRef);
    return attemptProjection(store.getPaymentAttemptForAccount({ accountRef, attemptRef }));
  }

  function providersAlreadyTried(accountRef, source) {
    const tried = new Set();
    const visited = new Set();
    let current = source;
    while (current !== null) {
      if (visited.has(current.attemptRef)) validation();
      visited.add(current.attemptRef);
      tried.add(current.providerId);
      if (current.sourceAttemptRef === null) break;
      const previous = store.getPaymentAttemptForAccount({ accountRef, attemptRef: current.sourceAttemptRef });
      if (previous.orderRef !== source.orderRef || previous.targetAttemptRef !== current.attemptRef) validation();
      current = previous;
    }
    return tried;
  }

  async function switchPaymentAttempt(input) {
    const values = exactRecord(input, [
      'accountRef', 'attemptRef', 'targetProviderId', 'idempotencyKey'
    ]);
    const accountRef = validateAccountRef(values.accountRef);
    const attemptRef = safeRef(values.attemptRef);
    if (typeof values.targetProviderId !== 'string' || !providerById.has(values.targetProviderId)) validation();
    const targetProviderId = values.targetProviderId;
    const idempotencyKey = validateIdempotencyKey(values.idempotencyKey);
    const requestDigest = canonicalCommerceRequestDigest({ sourceAttemptRef: attemptRef, targetProviderId });
    const idempotency = idemInput(SCOPES.switch, accountRef, idempotencyKey, requestDigest);
    const replay = store.getIdempotencyResult(idempotency);
    if (replay !== null) return resolvePaymentPointer(accountRef, replay);

    const source = store.getPaymentAttemptForAccount({ accountRef, attemptRef });
    if (source.targetAttemptRef !== null || SWITCHABLE.get(source.status) !== source.chargeCertainty) {
      throw commerceError('payment_switch_blocked', {});
    }
    const tried = providersAlreadyTried(accountRef, source);
    if (tried.has(targetProviderId)) throw commerceError('payment_switch_blocked', {});
    const provider = providerById.get(targetProviderId);
    const createdAt = now();
    const targetAttemptRef = nextRef('payment_attempt');
    const idempotencyFingerprint = fingerprint(SCOPES.switch, accountRef, idempotencyKey, requestDigest);
    const target = pendingAttempt({
      attemptRef: targetAttemptRef,
      accountRef,
      orderRef: source.orderRef,
      providerId: targetProviderId,
      sourceAttemptRef: source.attemptRef,
      switchReason: `explicit_${source.status}`,
      idempotencyFingerprint,
      quoteSnapshot: source.quoteSnapshot,
      createdAt
    });
    store.runAtomicMutation(() => {
      store.updatePaymentAttempt({ ...source, targetAttemptRef, updatedAt: createdAt });
      store.insertPaymentAttempt(target);
      store.recordIdempotencyResult({
        ...idempotency,
        result: { orderRef: source.orderRef, rootAttemptRef: source.attemptRef }
      });
    });
    const completed = await callProvider(provider, source.orderRef, target);
    const order = store.getOrderForAccount({ accountRef, orderRef: source.orderRef });
    return paymentResponse(order, completed);
  }

  function getReferralSummary(input) {
    const { accountRef } = exactRecord(input, ['accountRef']);
    validateAccountRef(accountRef);
    const summary = store.getReferralSummary({ accountRef, at: now() });
    return snapshot({
      cumulativeEarnedCoins: summary.cumulativeEarnedCoins,
      availableCoins: summary.availableCoins,
      internallyConsumedCoins: summary.internallyConsumedCoins,
      frozenCoins: summary.frozenCoins,
      frozenForSettlementCoins: summary.frozenForSettlementCoins,
      externallySettledCoins: summary.externallySettledCoins,
      reversedCoins: summary.reversedCoins
    });
  }

  function listPaymentLogs(input = {}) {
    const values = exactRecord(input, [], ['status', 'limit', 'cursor']);
    const status = Object.hasOwn(values, 'status') ? trimmedString(values.status) : undefined;
    const limit = Object.hasOwn(values, 'limit') ? values.limit : 50;
    const cursor = Object.hasOwn(values, 'cursor') ? values.cursor : 0;
    if ((status !== undefined && !PAYMENT_STATUSES.has(status))
      || !Number.isSafeInteger(limit) || limit <= 0 || limit > 100
      || !Number.isSafeInteger(cursor) || cursor < 0) validation();
    const page = store.listPaymentAttempts({ status, limit, cursor });
    return snapshot({
      items: page.items.map(attemptLogProjection),
      nextCursor: page.nextCursor,
      safety: { readOnly: true, mutationAllowed: false }
    });
  }

  return Object.freeze({
    getWallet,
    getCatalog,
    listOrders,
    createProductOrder,
    createRechargeOrder,
    getPaymentAttempt,
    switchPaymentAttempt,
    getReferralSummary,
    listPaymentLogs
  });
}
