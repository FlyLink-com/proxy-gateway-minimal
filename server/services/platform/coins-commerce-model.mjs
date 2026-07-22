const PUBLISHED_AT = '2026-07-22T00:00:00.000Z';
const ERROR_CODES = new Set([
  'validation_error', 'not_found', 'idempotency_conflict', 'insufficient_coins',
  'payment_switch_blocked', 'provider_unavailable'
]);
const SENSITIVE_KEY = /token|secret|credential|password|raw|payload|customer|email|ip|url/i;
const PAYMENT_STATES = new Map([
  ['entry_unavailable', 'not_charge_capable'], ['action_required', 'pending'],
  ['pending', 'pending'], ['confirmed_no_charge', 'confirmed_no_charge'],
  ['provider_insufficient', 'confirmed_no_charge'], ['risk_rejected', 'confirmed_no_charge'],
  ['succeeded', 'charged'], ['unknown', 'unknown'], ['possibly_charged', 'possibly_charged'],
  ['reversed', 'reversed']
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (isPlainObject(value)) Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function makeError(code, details) {
  const error = new Error(code);
  error.name = 'CoinsCommerceError';
  error.code = code;
  error.details = freeze(clone(details));
  return error;
}

function fail(field) {
  throw makeError('validation_error', { field });
}

function requireSafeInteger(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(field);
  return value;
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(field);
  return value;
}

function requireCanonicalIso(value, field) {
  requireNonEmptyString(value, field);
  let date;
  try { date = new Date(value); } catch { fail(field); }
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) fail(field);
  return value;
}

function validateDetails(value, field = 'details') {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') return void requireNonEmptyString(value, field);
  if (typeof value === 'number') return void requireSafeInteger(value, field);
  if (Array.isArray(value)) return void value.forEach((item) => validateDetails(item, field));
  if (!isPlainObject(value)) fail(field);
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) fail(field);
    validateDetails(item, field);
  }
}

export function commerceError(code, details) {
  if (!ERROR_CODES.has(code)) fail('code');
  validateDetails(details);
  return makeError(code, details);
}

function accessGrant(durationDays, mode) {
  return { type: 'access', durationDays, mode };
}

function trafficGrant(quantityGb, cycleDays, resetAtCycleEnd, carryOver, consumptionPriority) {
  return { type: 'traffic', quantityGb, cycleDays, resetAtCycleEnd, carryOver, consumptionPriority };
}

function membership(productId, productVersionRef, offerVersionRef, priceCoins, quantityGb, durationDays, priceBasisPoints, eligibleDiscountClasses) {
  return {
    product: {
      productId, productVersionRef, version: 1, status: 'published', kind: 'membership', selfOperated: true, publishedAt: PUBLISHED_AT,
      grants: [accessGrant(durationDays, 'fixed_term'), trafficGrant(quantityGb, 30, true, false, 100)],
      commerceBenefits: [{ type: 'offer_discount', eligibleDiscountClasses, priceBasisPoints }]
    },
    offer: { offerVersionRef, productVersionRef, version: 1, status: 'published', currency: 'COINS', priceCoins, discountClass: 'membership', selfOperated: true, publishedAt: PUBLISHED_AT }
  };
}

function trafficPack(productId, productVersionRef, offerVersionRef, priceCoins, quantityGb) {
  return {
    product: {
      productId, productVersionRef, version: 1, status: 'published', kind: 'traffic_pack', selfOperated: true, publishedAt: PUBLISHED_AT,
      grants: [accessGrant(null, 'while_traffic_remaining'), trafficGrant(quantityGb, null, false, true, 200)], commerceBenefits: []
    },
    offer: { offerVersionRef, productVersionRef, version: 1, status: 'published', currency: 'COINS', priceCoins, discountClass: 'traffic_pack', selfOperated: true, publishedAt: PUBLISHED_AT }
  };
}

const ITEMS = [
  membership('membership_monthly_50gb', 'pv_membership_monthly_50gb_v1', 'ov_membership_monthly_50gb_v1', 20, 50, 30, 9500, ['traffic_pack']),
  membership('membership_monthly_100gb', 'pv_membership_monthly_100gb_v1', 'ov_membership_monthly_100gb_v1', 30, 100, 30, 9000, ['traffic_pack']),
  membership('membership_annual_200gb_monthly', 'pv_membership_annual_200gb_monthly_v1', 'ov_membership_annual_200gb_monthly_v1', 200, 200, 365, 8000, ['traffic_pack', 'addon']),
  trafficPack('traffic_pack_permanent_100gb', 'pv_traffic_pack_permanent_100gb_v1', 'ov_traffic_pack_permanent_100gb_v1', 30, 100),
  trafficPack('traffic_pack_permanent_300gb', 'pv_traffic_pack_permanent_300gb_v1', 'ov_traffic_pack_permanent_300gb_v1', 60, 300),
  trafficPack('traffic_pack_permanent_1000gb', 'pv_traffic_pack_permanent_1000gb_v1', 'ov_traffic_pack_permanent_1000gb_v1', 100, 1000)
];

const CATALOG = freeze({
  schemaVersion: 'coins_commerce_catalog_v1', publishedAt: PUBLISHED_AT,
  productVersions: ITEMS.map(({ product }) => product), offerVersions: ITEMS.map(({ offer }) => offer),
  rechargeOffers: [10, 20, 30, 50, 100, 200, 300].map((paidCoins) => ({
    rechargeOfferRef: `rov_paid_${paidCoins}_v1`, version: 1, status: 'published', currency: 'COINS', paidCoins, bonusCoins: 0, publishedAt: PUBLISHED_AT
  }))
});

export function createDefaultCommerceCatalog() {
  return CATALOG;
}

function validateGrant(grant, field) {
  if (!isPlainObject(grant) || !['access', 'traffic'].includes(grant.type)) fail(field);
  if (grant.type === 'access') {
    if (!hasExactKeys(grant, ['type', 'durationDays', 'mode']) || !['fixed_term', 'while_traffic_remaining'].includes(grant.mode)) fail(field);
    if (grant.durationDays !== null) requireSafeInteger(grant.durationDays, field, { min: 1 });
  } else {
    if (!hasExactKeys(grant, ['type', 'quantityGb', 'cycleDays', 'resetAtCycleEnd', 'carryOver', 'consumptionPriority'])) fail(field);
    requireSafeInteger(grant.quantityGb, field, { min: 1 });
    if (grant.cycleDays !== null) requireSafeInteger(grant.cycleDays, field, { min: 1 });
    if (typeof grant.resetAtCycleEnd !== 'boolean' || typeof grant.carryOver !== 'boolean') fail(field);
    requireSafeInteger(grant.consumptionPriority, field, { min: 0 });
  }
}

function validateProductVersion(product, field = 'productVersion') {
  if (!hasExactKeys(product, ['productId', 'productVersionRef', 'version', 'status', 'kind', 'selfOperated', 'publishedAt', 'grants', 'commerceBenefits'])) fail(field);
  requireNonEmptyString(product.productId, field); requireNonEmptyString(product.productVersionRef, field);
  requireSafeInteger(product.version, field, { min: 1 });
  if (product.status !== 'published' || !['membership', 'traffic_pack'].includes(product.kind) || product.selfOperated !== true) fail(field);
  requireCanonicalIso(product.publishedAt, field);
  if (!Array.isArray(product.grants) || product.grants.length !== 2 || !Array.isArray(product.commerceBenefits)) fail(field);
  product.grants.forEach((grant) => validateGrant(grant, field));
  for (const benefit of product.commerceBenefits) {
    if (!hasExactKeys(benefit, ['type', 'eligibleDiscountClasses', 'priceBasisPoints']) || benefit.type !== 'offer_discount' || !Array.isArray(benefit.eligibleDiscountClasses) || benefit.eligibleDiscountClasses.length === 0) fail(field);
    benefit.eligibleDiscountClasses.forEach((discountClass) => requireNonEmptyString(discountClass, field));
    requireSafeInteger(benefit.priceBasisPoints, field, { min: 0, max: 10000 });
  }
}

function validateOfferVersion(offer, field = 'offerVersion') {
  if (!hasExactKeys(offer, ['offerVersionRef', 'productVersionRef', 'version', 'status', 'currency', 'priceCoins', 'discountClass', 'selfOperated', 'publishedAt'])) fail(field);
  requireNonEmptyString(offer.offerVersionRef, field); requireNonEmptyString(offer.productVersionRef, field);
  requireSafeInteger(offer.version, field, { min: 1 }); requireSafeInteger(offer.priceCoins, field, { min: 0 });
  if (offer.status !== 'published' || offer.currency !== 'COINS' || !['membership', 'traffic_pack', 'addon'].includes(offer.discountClass) || offer.selfOperated !== true) fail(field);
  requireCanonicalIso(offer.publishedAt, field);
}

export function calculateOfferPrice({ offerVersion, activeMemberships }) {
  validateOfferVersion(offerVersion);
  if (!Array.isArray(activeMemberships)) fail('activeMemberships');
  let chosen = null;
  for (const membership of activeMemberships) {
    validateProductVersion(membership, 'activeMembership');
    for (const benefit of membership.commerceBenefits) {
      if (!benefit.eligibleDiscountClasses.includes(offerVersion.discountClass)) continue;
      const multiplied = offerVersion.priceCoins * benefit.priceBasisPoints;
      if (!Number.isSafeInteger(multiplied)) fail('priceMultiplication');
      const payableCoins = Math.floor(multiplied / 10000);
      const candidate = { sourceProductVersionRef: membership.productVersionRef, priceBasisPoints: benefit.priceBasisPoints, payableCoins };
      if (chosen === null || candidate.payableCoins < chosen.payableCoins || (candidate.payableCoins === chosen.payableCoins && candidate.sourceProductVersionRef < chosen.sourceProductVersionRef)) chosen = candidate;
    }
  }
  return freeze({ basePriceCoins: offerVersion.priceCoins, payableCoins: chosen?.payableCoins ?? offerVersion.priceCoins, discount: chosen === null ? null : { sourceProductVersionRef: chosen.sourceProductVersionRef, priceBasisPoints: chosen.priceBasisPoints } });
}

export function createOrderItemSnapshot({ productVersion, offerVersion, priceContext }) {
  validateProductVersion(productVersion); validateOfferVersion(offerVersion);
  if (productVersion.productVersionRef !== offerVersion.productVersionRef || !hasExactKeys(priceContext, ['activeMemberships'])) fail('snapshotRefs');
  const price = calculateOfferPrice({ offerVersion, activeMemberships: priceContext.activeMemberships });
  return freeze({ productId: productVersion.productId, productVersionRef: productVersion.productVersionRef, offerVersionRef: offerVersion.offerVersionRef, currency: 'COINS', basePriceCoins: price.basePriceCoins, payableCoins: price.payableCoins, discount: clone(price.discount), grants: clone(productVersion.grants) });
}

export function normalizeNextAction(value) {
  if (!isPlainObject(value) || typeof value.type !== 'string') fail('nextAction');
  const schemas = {
    hosted_redirect: ['type', 'url', 'expiresAt'], provider_sdk: ['type', 'actionRef', 'expiresAt'], qr: ['type', 'payload', 'expiresAt'], bank_instructions: ['type', 'instructions', 'expiresAt'], none: ['type']
  };
  const allowed = schemas[value.type];
  if (!allowed || Object.keys(value).some((key) => !allowed.includes(key)) || !Object.keys(value).every((key) => allowed.includes(key))) fail('nextAction');
  if (value.type === 'none') return freeze({ type: 'none' });
  const required = value.type === 'hosted_redirect' ? 'url' : value.type === 'provider_sdk' ? 'actionRef' : value.type === 'qr' ? 'payload' : 'instructions';
  if (!Object.hasOwn(value, required)) fail('nextAction');
  if (required === 'instructions') {
    if (!Array.isArray(value.instructions) || value.instructions.length === 0) fail('nextAction');
    value.instructions.forEach((instruction) => requireNonEmptyString(instruction, 'nextAction'));
  } else requireNonEmptyString(value[required], 'nextAction');
  if (value.type === 'hosted_redirect') {
    try { new URL(value.url); } catch { fail('nextAction'); }
  }
  if (Object.hasOwn(value, 'expiresAt')) requireCanonicalIso(value.expiresAt, 'nextAction');
  return freeze(clone(value));
}

export function normalizePaymentResult(value) {
  const keys = ['status', 'chargeCertainty', 'nextAction', 'providerOrderRef'];
  if (!isPlainObject(value) || !Object.keys(value).every((key) => keys.includes(key)) || !['status', 'chargeCertainty', 'nextAction'].every((key) => Object.hasOwn(value, key))) fail('paymentResult');
  if (PAYMENT_STATES.get(value.status) !== value.chargeCertainty) fail('paymentResult');
  const nextAction = normalizeNextAction(value.nextAction);
  if ((value.status === 'action_required') !== (nextAction.type !== 'none')) fail('paymentResult');
  if (Object.hasOwn(value, 'providerOrderRef')) {
    requireNonEmptyString(value.providerOrderRef, 'paymentResult');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value.providerOrderRef)) fail('paymentResult');
  }
  return freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === 'nextAction' ? nextAction : clone(item)])));
}
