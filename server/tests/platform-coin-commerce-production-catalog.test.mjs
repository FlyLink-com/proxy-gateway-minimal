import assert from "node:assert/strict";
import test from "node:test";

import {
  COIN_COMMERCE_DATA_PACK_CANDIDATES,
  COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS,
  COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS,
  COIN_COMMERCE_PRODUCTION_OFFERS
} from "../services/platform/coin-commerce-production-catalog.mjs";
import {
  normalizeCoinCommerceOffer
} from "../services/platform/coin-commerce-domain.mjs";

const ACCEPTED_COIN_TYPES = [
  "bonus_coins",
  "paid_coins",
  "reward_coins"
];

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test("production catalog exposes exactly three normalized immutable v1 plan offers", () => {
  assert.deepEqual(
    COIN_COMMERCE_PRODUCTION_OFFERS.map((offer) => ({
      offerRef: offer.offerRef,
      offerVersionRef: offer.offerVersionRef,
      version: offer.version,
      category: offer.category,
      baseCoinUnits: offer.baseCoinUnits,
      referencePrice: offer.referencePrice,
      acceptedCoinTypes: offer.acceptedCoinTypes,
      delivery: offer.delivery
    })),
    [
      {
        offerRef: "offer_plan_30d_50gb_monthly",
        offerVersionRef: "offerv_plan_30d_50gb_monthly_v1",
        version: 1,
        category: "plan",
        baseCoinUnits: 20,
        referencePrice: { currency: "CNY", amountMinor: 2_000 },
        acceptedCoinTypes: ACCEPTED_COIN_TYPES,
        delivery: {
          kind: "subscription_plan",
          durationDays: 30,
          monthlyTrafficGb: 50,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 0
        }
      },
      {
        offerRef: "offer_plan_30d_100gb_monthly",
        offerVersionRef: "offerv_plan_30d_100gb_monthly_v1",
        version: 1,
        category: "plan",
        baseCoinUnits: 30,
        referencePrice: { currency: "CNY", amountMinor: 3_000 },
        acceptedCoinTypes: ACCEPTED_COIN_TYPES,
        delivery: {
          kind: "subscription_plan",
          durationDays: 30,
          monthlyTrafficGb: 100,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 0
        }
      },
      {
        offerRef: "offer_plan_365d_200gb_monthly",
        offerVersionRef: "offerv_plan_365d_200gb_monthly_v1",
        version: 1,
        category: "plan",
        baseCoinUnits: 200,
        referencePrice: { currency: "CNY", amountMinor: 20_000 },
        acceptedCoinTypes: ACCEPTED_COIN_TYPES,
        delivery: {
          kind: "subscription_plan",
          durationDays: 365,
          monthlyTrafficGb: 200,
          trafficGb: null,
          neverExpires: false,
          discountBasisPoints: 0
        }
      }
    ]
  );
  assert.equal(
    COIN_COMMERCE_PRODUCTION_OFFERS.some(
      (offer) => offer.category === "data_pack" || offer.delivery.kind === "data_pack"
    ),
    false
  );
  for (const offer of COIN_COMMERCE_PRODUCTION_OFFERS) {
    assert.deepEqual(normalizeCoinCommerceOffer(offer), offer);
  }
  assertDeepFrozen(COIN_COMMERCE_PRODUCTION_OFFERS);
  assert.equal(
    COIN_COMMERCE_PRODUCTION_OFFERS,
    COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
  );
  assert.notEqual(
    COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS,
    COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
  );
  assert.deepEqual(
    COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS,
    COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
  );
  assertDeepFrozen(COIN_COMMERCE_PRODUCTION_FULFILLMENT_OFFER_VERSIONS);
});

test("three data-pack candidates have fixed Coins prices and lifetime one-time quotas but are not published yet", () => {
  assert.deepEqual(COIN_COMMERCE_DATA_PACK_CANDIDATES.map((offer) => ({
    category: offer.category,
    versionRef: offer.offerVersionRef,
    coins: offer.baseCoinUnits,
    delivery: offer.delivery
  })), [
    [100, 30], [200, 50], [500, 100]
  ].map(([gb, coins]) => ({
    category: "data_pack",
    versionRef: `offerv_pack_${gb}gb_v1`,
    coins,
    delivery: {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: gb,
      neverExpires: true,
      discountBasisPoints: null
    }
  })));
  assertDeepFrozen(COIN_COMMERCE_DATA_PACK_CANDIDATES);
  for (const offer of COIN_COMMERCE_DATA_PACK_CANDIDATES) {
    assert.deepEqual(normalizeCoinCommerceOffer(offer), offer);
    assert.equal(COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS.some(
      (published) => published.offerRef === offer.offerRef
    ), false);
  }
});
