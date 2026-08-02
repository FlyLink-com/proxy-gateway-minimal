const CNY_TIERS = Object.freeze([
  Object.freeze(["coins_10", 10, 1000]),
  Object.freeze(["coins_30", 30, 3000]),
  Object.freeze(["coins_50", 50, 5000]),
  Object.freeze(["coins_100", 100, 10000]),
  Object.freeze(["coins_200", 200, 20000]),
  Object.freeze(["coins_300", 300, 30000]),
]);

export function createProductionCnyPaymentRechargeOffers() {
  return Object.freeze(CNY_TIERS.map(([offerRef, paidCoinUnits, amountMinor]) => Object.freeze({
    offerRef,
    quoteVersion: 1,
    paidCoinUnits,
    amountMinor,
    currency: "CNY",
    currencyExponent: 2,
    paymentMethods: Object.freeze(["alipay", "wechat_pay"]),
    enabled: true,
  })));
}
