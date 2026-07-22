import { commerceError, normalizePaymentResult } from './coins-commerce-model.mjs';

const PROVIDER_ID = /^[a-z][a-z0-9_-]{2,63}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const INPUT_KEYS = ['rechargeOrderRef', 'attemptRef', 'quoteSnapshot', 'idempotencyKey'];
const QUOTE_KEYS = ['rechargeOfferRef', 'paidCoins', 'bonusCoins', 'fiatAmountMinor', 'fiatCurrency', 'rateNumerator', 'rateDenominator', 'rateVersionRef', 'promotionRef'];
const RESULT_KEYS = ['providerOrderRef', 'status', 'chargeCertainty', 'nextAction'];

function validationError() {
  return commerceError('validation_error', {});
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function closedClone(value, seen = new Set()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0) throw validationError();
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw validationError();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length;
    if (!Object.hasOwn(length, 'value') || length.enumerable || length.configurable || typeof length.writable !== 'boolean' || !Number.isSafeInteger(length.value)) throw validationError();
    const clone = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw validationError();
      clone.push(closedClone(descriptor.value, seen));
    }
    if (Object.keys(descriptors).length !== length.value + 1) throw validationError();
    seen.delete(value);
    return clone;
  }
  if (!isPlainObject(value)) throw validationError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const clone = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw validationError();
    clone[key] = closedClone(descriptor.value, seen);
  }
  seen.delete(value);
  return clone;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyTrimmedString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function deepFreeze(value) {
  if (Array.isArray(value) || isPlainObject(value)) Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function validateInput(value) {
  const input = closedClone(value);
  if (!hasExactKeys(input, INPUT_KEYS) || !nonEmptyTrimmedString(input.rechargeOrderRef) || !nonEmptyTrimmedString(input.attemptRef) || !nonEmptyTrimmedString(input.idempotencyKey)) throw validationError();
  const quote = input.quoteSnapshot;
  if (!hasExactKeys(quote, QUOTE_KEYS)) throw validationError();
  for (const key of ['rechargeOfferRef', 'rateVersionRef']) if (!nonEmptyTrimmedString(quote[key])) throw validationError();
  for (const key of ['paidCoins', 'fiatAmountMinor', 'rateNumerator', 'rateDenominator']) if (!positiveSafeInteger(quote[key])) throw validationError();
  if (!Number.isSafeInteger(quote.bonusCoins) || quote.bonusCoins < 0 || !/^[A-Z]{3}$/.test(quote.fiatCurrency)) throw validationError();
  if (quote.promotionRef !== null && !nonEmptyTrimmedString(quote.promotionRef)) throw validationError();
  return deepFreeze(input);
}

function validateProviderResult(value, allowLoopbackHttp) {
  const resultValue = closedClone(value);
  if (!isPlainObject(resultValue) || Object.keys(resultValue).some((key) => !RESULT_KEYS.includes(key))) throw validationError();
  const result = normalizePaymentResult(resultValue);
  const hasProviderOrderRef = Object.hasOwn(result, 'providerOrderRef');
  if (result.status === 'entry_unavailable' ? hasProviderOrderRef : !hasProviderOrderRef) throw validationError();
  if (hasProviderOrderRef && (!nonEmptyTrimmedString(result.providerOrderRef) || !REF.test(result.providerOrderRef))) throw validationError();
  if (result.nextAction.type === 'hosted_redirect') {
    let url;
    try { url = new URL(result.nextAction.url); } catch { throw validationError(); }
    const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(allowLoopbackHttp && url.protocol === 'http:' && loopback))) throw validationError();
  }
  return deepFreeze(closedClone(result));
}

function validateFactoryOptions(options) {
  try {
    if (!isPlainObject(options) || Object.getOwnPropertySymbols(options).length !== 0) throw validationError();
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const keys = Object.keys(descriptors);
    if (!['providerId', 'createRechargeOrderFn'].every((key) => Object.hasOwn(descriptors, key)) || keys.some((key) => !['providerId', 'createRechargeOrderFn', 'allowLoopbackHttp'].includes(key))) throw validationError();
    for (const descriptor of Object.values(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw validationError();
    const providerId = descriptors.providerId.value;
    const createRechargeOrderFn = descriptors.createRechargeOrderFn.value;
    const allowLoopbackHttp = Object.hasOwn(descriptors, 'allowLoopbackHttp') ? descriptors.allowLoopbackHttp.value : false;
    if (typeof providerId !== 'string' || !PROVIDER_ID.test(providerId) || typeof createRechargeOrderFn !== 'function' || typeof allowLoopbackHttp !== 'boolean') throw validationError();
    return { providerId, createRechargeOrderFn, allowLoopbackHttp };
  } catch (error) {
    if (error?.code === 'validation_error') throw error;
    throw validationError();
  }
}

export function createCoinsCommerceProviderPreview(options) {
  const { providerId, createRechargeOrderFn, allowLoopbackHttp } = validateFactoryOptions(options);
  const adapter = {
    providerId,
    capabilities: deepFreeze({ createRechargeOrder: true }),
    async createRechargeOrder(value) {
      const input = validateInput(value);
      let providerResult;
      try {
        providerResult = await createRechargeOrderFn(input);
      } catch {
        throw commerceError('provider_unavailable', { reason: 'preview_adapter_failed' });
      }
      try {
        return validateProviderResult(providerResult, allowLoopbackHttp);
      } catch {
        throw commerceError('provider_unavailable', { reason: 'invalid_provider_result' });
      }
    }
  };
  return deepFreeze(adapter);
}
