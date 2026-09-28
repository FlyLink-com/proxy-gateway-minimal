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

function dataPackCandidate({ trafficGb, baseCoinUnits }) {
  return normalizeCoinCommerceOffer({
    offerRef: `offer_pack_${trafficGb}gb`,
    offerVersionRef: `offerv_pack_${trafficGb}gb_v1`,
    version: 1,
    category: "data_pack",
    title: {
      zh: `${trafficGb} GB 流量包`,
      en: `${trafficGb} GB data pack`
    },
    summary: {
      zh: "一次性流量额度，用完即止，不按月重置",
      en: "One-time allowance until exhausted; no monthly reset"
    },
    importantNotices: {
      zh: ["独立订阅，不与其他套餐或流量包混用", "刷新或重置订阅不会恢复已用流量"],
      en: ["Separate subscription; no shared allowance", "Refreshing a subscription never restores consumed data"]
    },
    baseCoinUnits,
    // Compatibility display metadata only. Coins are the purchase currency.
    referencePrice: {
      currency: "CNY",
      amountMinor: baseCoinUnits * 100
    },
    acceptedCoinTypes: ACCEPTED_COIN_TYPES,
    delivery: {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb,
      neverExpires: true,
      discountBasisPoints: null
    }
  });
}

// Do not publish these until independent issuance, lifetime quota enforcement,
// order-owned handoff, and recovery are validated together. Catalog visibility
// without executable fulfillment would allow paid orders with no resource.
export const COIN_COMMERCE_DATA_PACK_CANDIDATES = Object.freeze([
  dataPackCandidate({ trafficGb: 100, baseCoinUnits: 30 }),
  dataPackCandidate({ trafficGb: 200, baseCoinUnits: 50 }),
  dataPackCandidate({ trafficGb: 500, baseCoinUnits: 100 })
]);

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
