import {
  normalizeCoinCommerceOffer
} from "./coin-commerce-domain.mjs";

const ACCEPTED_COIN_TYPES = Object.freeze([
  "bonus_coins",
  "paid_coins",
  "reward_coins"
]);

function planOffer({
  offerRef,
  offerVersionRef,
  title,
  summary,
  baseCoinUnits,
  referenceAmountMinor,
  durationDays,
  monthlyTrafficGb
}) {
  return normalizeCoinCommerceOffer({
    offerRef,
    offerVersionRef,
    version: 1,
    category: "plan",
    title,
    summary,
    importantNotices: {
      zh: [
        "仅用于平台自营订阅服务",
        "流量额度按订阅计费周期每月重置"
      ],
      en: [
        "For platform-operated subscription services only",
        "Traffic allowance resets each monthly subscription cycle"
      ]
    },
    baseCoinUnits,
    // Compatibility-only display metadata; baseCoinUnits is the authoritative Coin amount.
    referencePrice: {
      currency: "CNY",
      amountMinor: referenceAmountMinor
    },
    acceptedCoinTypes: ACCEPTED_COIN_TYPES,
    delivery: {
      kind: "subscription_plan",
      durationDays,
      monthlyTrafficGb,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 0
    }
  });
}

export const COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS = Object.freeze([
  planOffer({
    offerRef: "offer_plan_30d_50gb_monthly",
    offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
    title: {
      zh: "50 GB 月度套餐",
      en: "50 GB monthly plan"
    },
    summary: {
      zh: "有效期 30 天，每月 50 GB",
      en: "30 days with 50 GB each month"
    },
    baseCoinUnits: 20,
    referenceAmountMinor: 2_000,
    durationDays: 30,
    monthlyTrafficGb: 50
  }),
  planOffer({
    offerRef: "offer_plan_30d_100gb_monthly",
    offerVersionRef: "offerv_plan_30d_100gb_monthly_v1",
    title: {
      zh: "100 GB 月度套餐",
      en: "100 GB monthly plan"
    },
    summary: {
      zh: "有效期 30 天，每月 100 GB",
      en: "30 days with 100 GB each month"
    },
    baseCoinUnits: 30,
    referenceAmountMinor: 3_000,
    durationDays: 30,
    monthlyTrafficGb: 100
  }),
  planOffer({
    offerRef: "offer_plan_365d_200gb_monthly",
    offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
    title: {
      zh: "200 GB 年度套餐",
      en: "200 GB annual plan"
    },
    summary: {
      zh: "有效期 365 天，每月 200 GB",
      en: "365 days with 200 GB each month"
    },
    baseCoinUnits: 200,
    referenceAmountMinor: 20_000,
    durationDays: 365,
    monthlyTrafficGb: 200
  })
]);

// Append-only fulfillment history. Retired Offer versions must remain here until
// every durable command that references them has reached a terminal receipt.
export const COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS = Object.freeze([
  ...COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
]);

// Compatibility alias for callers that only consume the currently published
// Store bootstrap catalog.
export const COIN_COMMERCE_PRODUCTION_OFFERS =
  COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS;
