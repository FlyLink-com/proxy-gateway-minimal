import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL(
  "../../scripts/start-local-coin-commerce-validation.mjs",
  import.meta.url
), "utf8");
const definition = source.match(/const UI_OFFERS = (Object\.freeze\(\[[\s\S]*?\]\));/u);
assert.ok(definition, "the fixed UI offer definition remains inspectable without starting the server");
const frozenOffers = runInNewContext(definition[1], {}, { timeout: 100 });
const offers = JSON.parse(JSON.stringify(frozenOffers));

test("UI preview offers use concise consumer copy in both languages", () => {
  assert.deepEqual(offers.map(({ title, summary, importantNotices }) => ({
    title,
    summary,
    importantNotices
  })), [
    {
      title: { zh: "50 GB 月度套餐", en: "50 GB monthly plan" },
      summary: { zh: "有效期 30 天，每月 50 GB 流量。", en: "50 GB per month, valid for 30 days." },
      importantNotices: { zh: ["套餐有效期为 30 天。"], en: ["The plan is valid for 30 days."] }
    },
    {
      title: { zh: "100 GB 月度套餐", en: "100 GB monthly plan" },
      summary: { zh: "有效期 30 天，每月 100 GB 流量。", en: "100 GB per month, valid for 30 days." },
      importantNotices: { zh: ["套餐有效期为 30 天。"], en: ["The plan is valid for 30 days."] }
    },
    {
      title: { zh: "200 GB 年度套餐", en: "200 GB annual plan" },
      summary: { zh: "有效期 365 天，每月 200 GB 流量。", en: "200 GB per month, valid for 365 days." },
      importantNotices: { zh: ["套餐有效期为 365 天。"], en: ["The plan is valid for 365 days."] }
    },
    {
      title: { zh: "100 GB 流量包", en: "100 GB data pack" },
      summary: { zh: "100 GB 流量，不限使用期限。", en: "100 GB of data with no expiry date." },
      importantNotices: { zh: ["流量包没有到期日。"], en: ["The data pack has no expiry date."] }
    },
    {
      title: { zh: "200 GB 流量包", en: "200 GB data pack" },
      summary: { zh: "200 GB 流量，不限使用期限。", en: "200 GB of data with no expiry date." },
      importantNotices: { zh: ["流量包没有到期日。"], en: ["The data pack has no expiry date."] }
    }
  ]);
  for (const { title, summary, importantNotices } of offers) {
    assert.doesNotMatch(
      JSON.stringify({ title, summary, importantNotices }),
      /本地|合成|验证|后端|本机|local|synthetic|validation|backend|自动续费|auto.?renew/iu
    );
  }
});

test("consumer copy preserves the five exact UI offer identities, prices and benefits", () => {
  assert.deepEqual(offers.map((offer) => [
    offer.offerRef,
    offer.offerVersionRef,
    offer.version,
    offer.category,
    offer.baseCoinUnits,
    offer.referencePrice.currency,
    offer.referencePrice.amountMinor,
    offer.acceptedCoinTypes,
    offer.delivery.kind,
    offer.delivery.durationDays,
    offer.delivery.monthlyTrafficGb,
    offer.delivery.trafficGb,
    offer.delivery.neverExpires,
    offer.delivery.discountBasisPoints
  ]), [
    ["offer_local_ui_monthly_50gb", "offerv_local_ui_monthly_50gb_v1", 1, "plan", 20, "CNY", 2000, ["bonus_coins", "paid_coins", "reward_coins"], "subscription_plan", 30, 50, null, false, 0],
    ["offer_local_ui_monthly_100gb", "offerv_local_ui_monthly_100gb_v1", 1, "plan", 30, "CNY", 3000, ["bonus_coins", "paid_coins", "reward_coins"], "subscription_plan", 30, 100, null, false, 0],
    ["offer_local_ui_annual_200gb", "offerv_local_ui_annual_200gb_v1", 1, "plan", 200, "CNY", 20000, ["bonus_coins", "paid_coins", "reward_coins"], "subscription_plan", 365, 200, null, false, 0],
    ["offer_local_ui_data_100gb", "offerv_local_ui_data_100gb_v1", 1, "data_pack", 30, "CNY", 3000, ["bonus_coins", "paid_coins", "reward_coins"], "data_pack", null, null, 100, true, null],
    ["offer_local_ui_data_200gb", "offerv_local_ui_data_200gb_v1", 1, "data_pack", 50, "CNY", 5000, ["bonus_coins", "paid_coins", "reward_coins"], "data_pack", null, null, 200, true, null]
  ]);
});

test("UI offer display fields and business fields remain recursively frozen", () => {
  function assertFrozen(value) {
    if (value === null || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(assertFrozen);
  }
  assertFrozen(frozenOffers);
});
