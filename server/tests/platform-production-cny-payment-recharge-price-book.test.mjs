import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductionCnyPaymentRechargeOffers,
} from "../services/platform/production-cny-payment-recharge-price-book.mjs";
import {
  createPaymentRechargeOfferCatalog,
} from "../services/platform/payment-recharge-offer-catalog.mjs";

const CNY_OFFERS = Object.freeze([
  ["coins_10", 10, 1000],
  ["coins_30", 30, 3000],
  ["coins_50", 50, 5000],
  ["coins_100", 100, 10000],
  ["coins_200", 200, 20000],
  ["coins_300", 300, 30000],
]);

function productionCatalog(offers = createProductionCnyPaymentRechargeOffers()) {
  return createPaymentRechargeOfferCatalog({ environment: "production", offers });
}

test("production CNY price book returns a fresh deeply frozen six-offer source array", () => {
  const first = createProductionCnyPaymentRechargeOffers();
  const second = createProductionCnyPaymentRechargeOffers();

  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.length, 6);
  assert.deepEqual(first, CNY_OFFERS.map(([offerRef, paidCoinUnits, amountMinor]) => ({
    offerRef,
    quoteVersion: 1,
    paidCoinUnits,
    amountMinor,
    currency: "CNY",
    currencyExponent: 2,
    paymentMethods: ["alipay", "wechat_pay"],
    enabled: true,
  })));
  for (const offer of first) {
    assert.equal(Object.isFrozen(offer), true);
    assert.equal(Object.isFrozen(offer.paymentMethods), true);
  }
});

test("production CNY catalog validates payment methods without redefining an existing quote version", () => {
  const catalog = productionCatalog();
  const offer = catalog.getOffer("coins_10");
  assert.deepEqual(offer.paymentMethods, ["alipay", "wechat_pay"]);
  assert.equal(Object.isFrozen(offer.paymentMethods), true);

  const { paymentMethods: _paymentMethods, ...missingPaymentMethods } =
    createProductionCnyPaymentRechargeOffers()[0];
  assert.throws(() => productionCatalog([missingPaymentMethods]), /invalid_payment_recharge_catalog/u);

  for (const paymentMethods of [
    [],
    ["wechat_pay", "alipay"],
    ["alipay", "alipay"],
    ["xsd_v1"],
  ]) {
    assert.throws(() => productionCatalog([{
      ...createProductionCnyPaymentRechargeOffers()[0],
      paymentMethods,
    }]), /invalid_payment_recharge_catalog/u);
  }
  assert.throws(() => productionCatalog([{
    ...createProductionCnyPaymentRechargeOffers()[0],
    paymentMethods: ["alipay"],
    extra: true,
  }]), /invalid_payment_recharge_catalog/u);
  assert.equal(
    catalog.getOffer("coins_10").quoteDigest,
    productionCatalog([{
      ...createProductionCnyPaymentRechargeOffers()[0],
      paymentMethods: ["alipay"],
    }]).getOffer("coins_10").quoteDigest,
  );
});
