import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateOfferPrice,
  commerceError,
  createDefaultCommerceCatalog,
  createOrderItemSnapshot,
  normalizeNextAction,
  normalizePaymentResult
} from '../services/platform/coins-commerce-model.mjs';

const publishedAt = '2026-07-22T00:00:00.000Z';

function catalogEntries() {
  const catalog = createDefaultCommerceCatalog();
  return {
    catalog,
    products: Object.fromEntries(catalog.productVersions.map((value) => [value.productId, value])),
    offers: Object.fromEntries(catalog.offerVersions.map((value) => [value.productVersionRef, value]))
  };
}

test('publishes the frozen catalog with exact recharge denominations and version references', () => {
  const { catalog, products, offers } = catalogEntries();
  assert.deepEqual(Object.keys(catalog), ['schemaVersion', 'publishedAt', 'productVersions', 'offerVersions', 'rechargeOffers']);
  assert.equal(catalog.schemaVersion, 'coins_commerce_catalog_v1');
  assert.equal(catalog.publishedAt, publishedAt);
  assert.deepEqual(catalog.rechargeOffers.map(({ rechargeOfferRef, paidCoins, bonusCoins }) => [rechargeOfferRef, paidCoins, bonusCoins]), [
    ['rov_paid_10_v1', 10, 0], ['rov_paid_20_v1', 20, 0], ['rov_paid_30_v1', 30, 0],
    ['rov_paid_50_v1', 50, 0], ['rov_paid_100_v1', 100, 0], ['rov_paid_200_v1', 200, 0], ['rov_paid_300_v1', 300, 0]
  ]);
  assert.equal(catalog.productVersions.length, 6);
  assert.equal(catalog.offerVersions.length, 6);
  assert.deepEqual(Object.values(products).map(({ productId, productVersionRef, kind }) => [productId, productVersionRef, kind]), [
    ['membership_monthly_50gb', 'pv_membership_monthly_50gb_v1', 'membership'],
    ['membership_monthly_100gb', 'pv_membership_monthly_100gb_v1', 'membership'],
    ['membership_annual_200gb_monthly', 'pv_membership_annual_200gb_monthly_v1', 'membership'],
    ['traffic_pack_permanent_100gb', 'pv_traffic_pack_permanent_100gb_v1', 'traffic_pack'],
    ['traffic_pack_permanent_300gb', 'pv_traffic_pack_permanent_300gb_v1', 'traffic_pack'],
    ['traffic_pack_permanent_1000gb', 'pv_traffic_pack_permanent_1000gb_v1', 'traffic_pack']
  ]);
  assert.equal(offers[products.membership_annual_200gb_monthly.productVersionRef].offerVersionRef, 'ov_membership_annual_200gb_monthly_v1');
  assert.equal(offers[products.traffic_pack_permanent_300gb.productVersionRef].priceCoins, 60);
  assert.throws(() => { catalog.productVersions[0].grants[0].mode = 'changed'; }, TypeError);
  assert.throws(() => { catalog.rechargeOffers.push({}); }, TypeError);
});

test('models reset-only membership traffic and membership-first permanent traffic priority', () => {
  const { products } = catalogEntries();
  const monthly = products.membership_monthly_50gb;
  const annual = products.membership_annual_200gb_monthly;
  const permanent = products.traffic_pack_permanent_100gb;
  assert.deepEqual(monthly.grants[1], {
    type: 'traffic', quantityGb: 50, cycleDays: 30, resetAtCycleEnd: true, carryOver: false, consumptionPriority: 100
  });
  assert.deepEqual(annual.grants[1], {
    type: 'traffic', quantityGb: 200, cycleDays: 30, resetAtCycleEnd: true, carryOver: false, consumptionPriority: 100
  });
  assert.deepEqual(permanent.grants, [
    { type: 'access', durationDays: null, mode: 'while_traffic_remaining' },
    { type: 'traffic', quantityGb: 100, cycleDays: null, resetAtCycleEnd: false, carryOver: true, consumptionPriority: 200 }
  ]);
  assert.deepEqual(monthly.commerceBenefits, [{
    type: 'offer_discount', eligibleDiscountClasses: ['traffic_pack'], priceBasisPoints: 9500
  }]);
});

test('calculates integer-only discounted prices and deterministic membership benefit selection', () => {
  const { products, offers } = catalogEntries();
  const monthly20 = products.membership_monthly_50gb;
  const annual200 = products.membership_annual_200gb_monthly;
  const trafficPack30 = offers[products.traffic_pack_permanent_100gb.productVersionRef];
  const trafficPack60 = offers[products.traffic_pack_permanent_300gb.productVersionRef];
  const annualMembership = offers[annual200.productVersionRef];
  assert.deepEqual(calculateOfferPrice({ offerVersion: trafficPack30, activeMemberships: [monthly20] }), {
    basePriceCoins: 30, payableCoins: 28,
    discount: { sourceProductVersionRef: monthly20.productVersionRef, priceBasisPoints: 9500 }
  });
  assert.equal(calculateOfferPrice({ offerVersion: trafficPack60, activeMemberships: [monthly20, annual200] }).payableCoins, 48);
  assert.deepEqual(calculateOfferPrice({ offerVersion: annualMembership, activeMemberships: [annual200] }), {
    basePriceCoins: 200, payableCoins: 200, discount: null
  });
  assert.equal(calculateOfferPrice({ offerVersion: trafficPack30, activeMemberships: [monthly20, monthly20] }).discount.sourceProductVersionRef, monthly20.productVersionRef);
  assert.throws(() => calculateOfferPrice({
    offerVersion: trafficPack30,
    activeMemberships: [{ ...monthly20, commerceBenefits: [{ ...monthly20.commerceBenefits[0], priceBasisPoints: 0 }] }]
  }), /validation_error/);
  assert.throws(() => calculateOfferPrice({
    offerVersion: trafficPack30,
    activeMemberships: [{ ...monthly20, productVersionRef: 'pv_forged_membership_v1' }]
  }), /validation_error/);
  assert.throws(() => calculateOfferPrice({ offerVersion: { ...trafficPack30, priceCoins: 1.5 }, activeMemberships: [] }), /validation_error/);
  assert.throws(() => calculateOfferPrice({ offerVersion: { ...trafficPack30, priceCoins: Number.MAX_SAFE_INTEGER }, activeMemberships: [monthly20] }), /validation_error/);
  assert.throws(() => calculateOfferPrice({ offerVersion: trafficPack30, activeMemberships: [{ ...monthly20, commerceBenefits: [{ ...monthly20.commerceBenefits[0], priceBasisPoints: 9500.5 }] }] }), /validation_error/);
});

test('publishes safe-integer grants and canonical UTC timestamps', () => {
  const { catalog } = catalogEntries();
  for (const product of catalog.productVersions) {
    assert.equal(new Date(product.publishedAt).toISOString(), product.publishedAt);
    for (const grant of product.grants) {
      if (grant.type === 'access') {
        assert.ok(grant.durationDays === null || Number.isSafeInteger(grant.durationDays));
      } else {
        assert.ok(Number.isSafeInteger(grant.quantityGb));
        assert.ok(grant.cycleDays === null || Number.isSafeInteger(grant.cycleDays));
        assert.ok(Number.isSafeInteger(grant.consumptionPriority));
      }
    }
  }
});

test('creates detached frozen snapshots only for matching safe-integer versions', () => {
  const { products, offers } = catalogEntries();
  const product = products.traffic_pack_permanent_100gb;
  const offer = offers[product.productVersionRef];
  const snapshot = createOrderItemSnapshot({ productVersion: product, offerVersion: offer, priceContext: { activeMemberships: [products.membership_monthly_50gb] } });
  assert.deepEqual(snapshot, {
    productId: product.productId, productVersionRef: product.productVersionRef, offerVersionRef: offer.offerVersionRef,
    currency: 'COINS', basePriceCoins: 30, payableCoins: 28,
    discount: { sourceProductVersionRef: 'pv_membership_monthly_50gb_v1', priceBasisPoints: 9500 }, grants: product.grants
  });
  assert.throws(() => { snapshot.grants[1].quantityGb = 1; }, TypeError);
  assert.notEqual(snapshot.grants, product.grants);
  assert.throws(() => createOrderItemSnapshot({ productVersion: { ...product, productVersionRef: 'wrong' }, offerVersion: offer, priceContext: { activeMemberships: [] } }), /validation_error/);
  assert.throws(() => createOrderItemSnapshot({ productVersion: { ...product, version: 1.1 }, offerVersion: offer, priceContext: { activeMemberships: [] } }), /validation_error/);
});

test('normalizes only exact next-action and payment-result state schemas', () => {
  const action = normalizeNextAction({ type: 'hosted_redirect', url: 'https://payments.example.test/order', expiresAt: publishedAt });
  assert.deepEqual(action, { type: 'hosted_redirect', url: 'https://payments.example.test/order', expiresAt: publishedAt });
  assert.throws(() => { action.type = 'none'; }, TypeError);
  assert.deepEqual(normalizeNextAction({ type: 'bank_instructions', instructions: ['Use your reference'] }), { type: 'bank_instructions', instructions: ['Use your reference'] });
  assert.throws(() => normalizeNextAction({ type: 'none', extra: true }), /validation_error/);
  assert.throws(() => normalizeNextAction({ type: 'qr', payload: '' }), /validation_error/);
  assert.throws(() => normalizeNextAction({ type: 'provider_sdk', actionRef: 'a', expiresAt: '2026-07-22' }), /validation_error/);
  const result = normalizePaymentResult({ status: 'action_required', chargeCertainty: 'pending', nextAction: action, providerOrderRef: 'provider-order-1' });
  assert.deepEqual(result, { status: 'action_required', chargeCertainty: 'pending', nextAction: action, providerOrderRef: 'provider-order-1' });
  assert.throws(() => normalizePaymentResult({ status: 'succeeded', chargeCertainty: 'charged', nextAction: action }), /validation_error/);
  assert.throws(() => normalizePaymentResult({ status: 'pending', chargeCertainty: 'charged', nextAction: { type: 'none' } }), /validation_error/);
  assert.throws(() => normalizePaymentResult({ status: 'unknown', chargeCertainty: 'unknown', nextAction: { type: 'none' }, extra: 1 }), /validation_error/);
});

test('creates safe, frozen, code-only commerce errors', () => {
  const error = commerceError('insufficient_coins', { order: { count: 2, state: 'open' } });
  assert.equal(error.name, 'CoinsCommerceError');
  assert.equal(error.message, 'insufficient_coins');
  assert.equal(error.code, 'insufficient_coins');
  assert.deepEqual(error.details, { order: { count: 2, state: 'open' } });
  assert.throws(() => { error.details.order.count = 3; }, TypeError);
  assert.throws(() => commerceError('other', {}), /validation_error/);
  assert.throws(() => commerceError('validation_error', { token: 'nope' }), /validation_error/);
  assert.throws(() => commerceError('validation_error', { amount: 0.1 }), /validation_error/);
});
