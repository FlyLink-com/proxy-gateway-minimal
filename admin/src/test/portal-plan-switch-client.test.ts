import { describe, expect, test, vi } from "vitest";

import {
  createPortalCoinCommerceClient,
  PortalCoinCommerceClientError
} from "../features/user-portal/commerce/commerce-client";

const OFFER = {
  offerRef: "offer_monthly_50gb",
  offerVersionRef: "offerversion_monthly_50gb_1",
  category: "plan",
  title: { zh: "月付 50 GB", en: "Monthly 50 GB" },
  summary: { zh: "每月 50 GB", en: "50 GB each month" },
  importantNotices: {
    zh: ["购买后自动交付"],
    en: ["Delivered automatically after purchase"]
  },
  baseCoinUnits: 30,
  referencePrice: { currency: "CNY", amountMinor: 3_000 },
  acceptedCoinTypes: ["paid_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 100,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};

function quote(amountUnits: number, planSwitch?: object) {
  return {
    quoteRef: "quote_plan_switch_1",
    offer: OFFER,
    amountUnits,
    appliedDiscountBasisPoints: 0,
    purchaseAvailability: "available",
    shortfallUnits: 0,
    allocation: [{ coinType: "paid_coins", amountUnits }],
    balances: {
      before: { bonusCoins: 0, paidCoins: 100, rewardCoins: 0, heldCoins: 0 },
      after: {
        bonusCoins: 0,
        paidCoins: 100 - amountUnits,
        rewardCoins: 0,
        heldCoins: amountUnits
      }
    },
    expiresAt: "2026-08-01T00:05:00.000Z",
    ...(planSwitch ? { planSwitch } : {})
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("plan switch commerce client", () => {
  test("accepts a prorated quote only when planSwitch proves the charge", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, {
      quote: quote(5, {
        kind: "upgrade_inplace",
        creditUnits: 5,
        chargeUnits: 5,
        effectiveAt: null,
        cancelsPendingDowngrade: false
      })
    }));
    const client = createPortalCoinCommerceClient({ fetchFn });
    const parsed = await client.previewCheckout({
      sessionRef: "session_alpha",
      offerRef: OFFER.offerRef
    });
    expect(parsed.amountUnits).toBe(5);
    expect(parsed.planSwitch?.kind).toBe("upgrade_inplace");
  });

  test("rejects a prorated quote that omits planSwitch", async () => {
    const client = createPortalCoinCommerceClient({
      fetchFn: vi.fn(async () => jsonResponse(200, { quote: quote(5) }))
    });
    await expect(client.previewCheckout({
      sessionRef: "session_alpha",
      offerRef: OFFER.offerRef
    })).rejects.toBeInstanceOf(PortalCoinCommerceClientError);
  });

  test("treats a missing plan-switch state route as the current UI", async () => {
    const client = createPortalCoinCommerceClient({
      fetchFn: vi.fn(async () => new Response("missing", { status: 404 }))
    });
    await expect(client.readPlanSwitchState({
      sessionRef: "session_alpha"
    })).resolves.toBeNull();
  });
});
