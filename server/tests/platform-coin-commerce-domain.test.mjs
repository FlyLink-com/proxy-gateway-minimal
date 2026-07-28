import assert from "node:assert/strict";
import test from "node:test";
import {
  COIN_COMMERCE_CONTRACT_VERSION,
  DEFAULT_COIN_COMMERCE_CANCEL_WINDOW_MS,
  DEFAULT_COIN_COMMERCE_HOLD_RECOVERY_GRACE_MS,
  applyCoinDiscount,
  canonicalCommerceRequestDigest,
  deriveCommerceOperationRefs,
  normalizeCancelOrderRequest,
  normalizeCheckoutQuoteRequest,
  normalizeCoinCommerceOffer,
  normalizeConfirmOrderRequest,
  normalizeFulfillmentResult
} from "../services/platform/coin-commerce-domain.mjs";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function monthlyBasicOffer() {
  return {
    offerRef: "offer_monthly_basic",
    offerVersionRef: "offerv_monthly_basic_v1",
    version: 1,
    category: "plan",
    title: { zh: "基础月卡", en: "Basic monthly plan" },
    summary: {
      zh: "每月 50 GB · 商城商品 9.5 折",
      en: "50 GB monthly · 5% off Marketplace products"
    },
    importantNotices: {
      zh: ["仅用于 GCC WebOS 平台自营服务", "不可提现、转账或兑换法币"],
      en: [
        "For GCC WebOS platform-owned services only",
        "Not withdrawable, transferable, or redeemable for fiat"
      ]
    },
    baseCoinUnits: 20,
    referencePrice: { currency: "CNY", amountMinor: 2_000 },
    acceptedCoinTypes: ["reward_coins", "paid_coins", "bonus_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 500
    }
  };
}

function dataPackOffer() {
  const offer = monthlyBasicOffer();
  return {
    ...offer,
    offerRef: "offer_data_pack_100",
    offerVersionRef: "offerv_data_pack_100_v1",
    category: "data_pack",
    delivery: {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: 100,
      neverExpires: true,
      discountBasisPoints: null
    }
  };
}

function assertCommerceError(error, code, field) {
  return error?.code === code && (!field || error.field === field)
    && !error.message.includes("offer_monthly_basic");
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test("exposes the fixed Commerce contract and timing constants", () => {
  assert.equal(COIN_COMMERCE_CONTRACT_VERSION, "coin-commerce/v1");
  assert.equal(DEFAULT_COIN_COMMERCE_CANCEL_WINDOW_MS, 3_000);
  assert.equal(DEFAULT_COIN_COMMERCE_HOLD_RECOVERY_GRACE_MS, 86_400_000);
});

test("normalizes the approved offer without trusting extra fields", () => {
  const offer = normalizeCoinCommerceOffer(monthlyBasicOffer());
  assert.deepEqual(offer, {
    ...monthlyBasicOffer(),
    acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"]
  });
  assertDeepFrozen(offer);
  assert.throws(
    () => normalizeCoinCommerceOffer({ ...monthlyBasicOffer(), clientPrice: 1 }),
    (error) => assertCommerceError(error, "unexpected_commerce_request_field", "clientPrice")
  );
});

test("normalizes valid data-pack delivery without plan fields", () => {
  assert.deepEqual(normalizeCoinCommerceOffer(dataPackOffer()).delivery, {
    kind: "data_pack",
    durationDays: null,
    monthlyTrafficGb: null,
    trafficGb: 100,
    neverExpires: true,
    discountBasisPoints: null
  });
});

test("rejects malformed offer locales, delivery combinations, units, and Coin types", () => {
  const invalidOffers = [
    { ...monthlyBasicOffer(), title: { zh: "基础月卡", en: " Basic monthly plan" } },
    { ...monthlyBasicOffer(), importantNotices: { ...monthlyBasicOffer().importantNotices, zh: ["重复", "重复"] } },
    { ...monthlyBasicOffer(), delivery: { ...monthlyBasicOffer().delivery, trafficGb: 1 } },
    { ...dataPackOffer(), delivery: { ...dataPackOffer().delivery, neverExpires: false } },
    { ...monthlyBasicOffer(), baseCoinUnits: 0 },
    { ...monthlyBasicOffer(), referencePrice: { currency: "CNY", amountMinor: 1.5 } },
    { ...monthlyBasicOffer(), version: MAX_SAFE + 1 },
    { ...monthlyBasicOffer(), category: "gift" },
    { ...monthlyBasicOffer(), acceptedCoinTypes: ["paid_coins", "paid_coins"] },
    { ...monthlyBasicOffer(), acceptedCoinTypes: ["gift_coins"] }
  ];
  for (const input of invalidOffers) {
    assert.throws(() => normalizeCoinCommerceOffer(input), (error) => (
      ["invalid_commerce_locale", "invalid_commerce_delivery", "invalid_commerce_units", "invalid_commerce_enum", "invalid_commerce_offer"].includes(error?.code)
    ));
  }
});

test("rejects hostile important-notice arrays without leaking raw getter errors", () => {
  const rawMarker = "RAW_NOTICE_GETTER_MARKER";
  const cases = [
    ["sparse", () => Object.assign(Array(1), {})],
    ["index accessor", () => {
      const notices = ["valid"];
      Object.defineProperty(notices, "0", { enumerable: true, get: () => "valid" });
      return notices;
    }],
    ["symbol key", () => {
      const notices = ["valid"];
      notices[Symbol("notice")] = "extra";
      return notices;
    }],
    ["extra property", () => Object.assign(["valid"], { marker: "extra" })],
    ["custom prototype", () => {
      const notices = ["valid"];
      Object.setPrototypeOf(notices, Object.create(Array.prototype));
      return notices;
    }],
    ["custom map", () => Object.assign([" not-valid "], { map: () => ["valid"] })],
    ["throwing getter", () => {
      const notices = ["valid"];
      Object.defineProperty(notices, "0", {
        enumerable: true,
        get: () => { throw new Error(rawMarker); }
      });
      return notices;
    }]
  ];
  for (const [name, createNotices] of cases) {
    assert.throws(
      () => normalizeCoinCommerceOffer({
        ...monthlyBasicOffer(),
        importantNotices: { zh: createNotices(), en: ["valid"] }
      }),
      (error) => error?.code === "invalid_commerce_locale" && !error.message.includes(rawMarker),
      name
    );
  }
});

test("rejects accepted Coin types with a custom iterator before Wallet normalization", () => {
  const acceptedCoinTypes = ["not_a_coin_type"];
  Object.defineProperty(acceptedCoinTypes, Symbol.iterator, {
    value: function* customIterator() { yield "paid_coins"; }
  });
  assert.throws(
    () => normalizeCoinCommerceOffer({ ...monthlyBasicOffer(), acceptedCoinTypes }),
    (error) => error?.code === "invalid_commerce_offer"
  );
});

test("uses integer basis points and rounds discounted Coins upward", () => {
  assert.equal(applyCoinDiscount({ baseCoinUnits: 20, discountBasisPoints: 500 }), 19);
  assert.equal(applyCoinDiscount({ baseCoinUnits: 31, discountBasisPoints: 1_000 }), 28);
  assert.equal(applyCoinDiscount({ baseCoinUnits: 1, discountBasisPoints: 10_000 }), 0);
  for (const input of [
    { baseCoinUnits: 0, discountBasisPoints: 0 },
    { baseCoinUnits: 1.5, discountBasisPoints: 0 },
    { baseCoinUnits: 1, discountBasisPoints: -1 },
    { baseCoinUnits: 1, discountBasisPoints: 10_001 },
    { baseCoinUnits: 1, discountBasisPoints: 1.5 }
  ]) {
    assert.throws(() => applyCoinDiscount(input), (error) => error?.code === "invalid_commerce_units");
  }
});

test("normalizes each closed checkout business payload and freezes the result", () => {
  const quote = normalizeCheckoutQuoteRequest({ accountId: "account_001", offerRef: "offer_monthly_basic" });
  const confirm = normalizeConfirmOrderRequest({ accountId: "account_001", quoteRef: "quote_001" });
  const cancel = normalizeCancelOrderRequest({ accountId: "account_001", orderRef: "order_001" });
  const fulfillment = normalizeFulfillmentResult({ status: "delivered", effectRef: "effect_001" });
  assert.deepEqual(quote, { accountId: "account_001", offerRef: "offer_monthly_basic" });
  assert.deepEqual(confirm, { accountId: "account_001", quoteRef: "quote_001" });
  assert.deepEqual(cancel, { accountId: "account_001", orderRef: "order_001" });
  assert.deepEqual(fulfillment, { status: "delivered", effectRef: "effect_001" });
  for (const normalized of [quote, confirm, cancel, fulfillment]) assert.equal(Object.isFrozen(normalized), true);
});

test("rejects extra, malformed, timestamp, and non-normalized checkout payload fields", () => {
  const cases = [
    [() => normalizeCheckoutQuoteRequest({ accountId: "account_001", offerRef: "offer_monthly_basic", timestamp: "2026-07-26T00:00:00.000Z" }), "unexpected_commerce_request_field"],
    [() => normalizeConfirmOrderRequest({ accountId: " account_001", quoteRef: "quote_001" }), "non_normalized_commerce_request"],
    [() => normalizeCancelOrderRequest({ accountId: "account_001", orderRef: "ORDER_001" }), "invalid_commerce_reference"],
    [() => normalizeFulfillmentResult({ status: "failed", effectRef: "effect_001" }), "invalid_fulfillment_result"],
    [() => normalizeFulfillmentResult({ status: "delivered", effectRef: "effect_001", safeCode: "x" }), "unexpected_commerce_request_field"]
  ];
  for (const [invoke, code] of cases) assert.throws(invoke, (error) => error?.code === code);
});

test("canonical Commerce request digest is stable, key-order independent, and domain separated", () => {
  const createQuote = canonicalCommerceRequestDigest("create_quote", { accountId: "account_001", offerRef: "offer_monthly_basic" });
  assert.equal(createQuote, "f01f8df5adc2cda7d7d1b79f3f625d3766cbe9b56e38bdf83e1bde14208eba0c");
  assert.equal(canonicalCommerceRequestDigest("create_quote", { offerRef: "offer_monthly_basic", accountId: "account_001" }), createQuote);
  const digests = new Set([
    canonicalCommerceRequestDigest("publish_offer", monthlyBasicOffer()),
    createQuote,
    canonicalCommerceRequestDigest("confirm_order", { accountId: "account_001", quoteRef: "quote_001" }),
    canonicalCommerceRequestDigest("cancel_order", { accountId: "account_001", orderRef: "order_001" }),
    canonicalCommerceRequestDigest("claim_capture", { orderRef: "order_001" }),
    canonicalCommerceRequestDigest("capture_order", { orderRef: "order_001" }),
    canonicalCommerceRequestDigest("fulfillment_result", { status: "delivered", effectRef: "effect_001" })
  ]);
  assert.equal(digests.size, 7);
});

test("canonical Commerce request digest rejects unknown operations and payload extras", () => {
  assert.throws(
    () => canonicalCommerceRequestDigest("unknown", { accountId: "account_001", offerRef: "offer_monthly_basic" }),
    (error) => error?.code === "invalid_commerce_operation"
  );
  assert.throws(
    () => canonicalCommerceRequestDigest("claim_capture", { orderRef: "order_001", actorId: "account_001" }),
    (error) => error?.code === "unexpected_commerce_request_field"
  );
});

test("derives deterministic domain-separated operation references", () => {
  const refs = deriveCommerceOperationRefs("order_monthly_001");
  assert.deepEqual(refs, {
    holdOperationRef: "coinop_hold_8e1412cfbb8765804226b69c305b00b1",
    captureOperationRef: "coinop_capture_8e1412cfbb8765804226b69c305b00b1",
    releaseOperationRef: "coinop_release_8e1412cfbb8765804226b69c305b00b1",
    commandRef: "coincmd_8e1412cfbb8765804226b69c305b00b1",
    recoveryOperationRef: "coinop_recovery_8e1412cfbb8765804226b69c305b00b1"
  });
  assert.equal(Object.isFrozen(refs), true);
  assert.throws(() => deriveCommerceOperationRefs(" order_monthly_001"), (error) => error?.code === "non_normalized_commerce_request");
  assert.throws(() => deriveCommerceOperationRefs("ab"), (error) => error?.code === "invalid_commerce_reference");
});
