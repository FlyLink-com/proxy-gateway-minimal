import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createPortalCommerceModelClient,
  createPortalWalletFirstCommerceClient
} from "../features/user-portal/commerce";

const OFFER = {
  offerRef: "offer_annual_premium",
  offerVersionRef: "offerversion_annual_premium_1",
  category: "plan",
  title: { zh: "年度套餐", en: "Annual plan" },
  summary: { zh: "年度服务", en: "Annual service" },
  importantNotices: {
    zh: ["按订阅周期交付"],
    en: ["Delivered by subscription period"]
  },
  baseCoinUnits: 200,
  referencePrice: { currency: "CNY", amountMinor: 20_000 },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 365,
    monthlyTrafficGb: 200,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};

const QUOTE = {
  quoteRef: "quote_annual_premium_1",
  offer: OFFER,
  amountUnits: 200,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [{ coinType: "bonus_coins", amountUnits: 200 }],
  balances: {
    before: {
      bonusCoins: 1_000,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 800,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 200
    }
  },
  expiresAt: "2026-08-13T00:05:00.000Z",
  transition: {
    flowKind: "initial_activation",
    scheduledFor: "2026-08-13T00:00:00.000Z"
  }
};

const TRANSITION = {
  transitionRef: "transition_annual_premium_1",
  offer: OFFER,
  amountUnits: 200,
  flowKind: "initial_activation",
  scheduledFor: "2026-08-13T00:00:00.000Z",
  state: "reserved",
  safeCode: null,
  reservedAt: "2026-08-13T00:00:00.000Z",
  settledAt: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z"
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function expectSafeFailure(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    name: "PortalCoinCommerceClientError",
    code: "commerce_request_failed",
    retryable: true
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Portal wallet-first Commerce HTTP client", () => {
  test("projects the server model and only uses the dedicated deferred route family", async () => {
    const bodies = [
      { commerceModel: "wallet_first_unique_v1" },
      { offers: [OFFER] },
      { offer: OFFER },
      { quote: QUOTE },
      { transitions: [TRANSITION] },
      { transition: TRANSITION },
      { transition: TRANSITION },
      { transition: { ...TRANSITION, state: "cancelled" } }
    ];
    const statuses = [200, 200, 200, 200, 200, 200, 201, 200];
    const fetchFn = vi.fn<typeof fetch>(async () => response(
      bodies.shift(),
      statuses.shift() ?? 200
    ));
    const model = createPortalCommerceModelClient({ fetchFn });
    const commerce = createPortalWalletFirstCommerceClient({ fetchFn });

    await expect(model.getCommerceModel({ sessionRef: "session_alpha" }))
      .resolves.toBe("wallet_first_unique_v1");
    await expect(commerce.listOffers({ sessionRef: "session_alpha" }))
      .resolves.toEqual([OFFER]);
    await expect(commerce.getOffer({
      sessionRef: "session_alpha",
      offerRef: OFFER.offerRef
    })).resolves.toEqual(OFFER);
    await expect(commerce.previewDeferredCheckout({
      sessionRef: "session_alpha",
      offerRef: OFFER.offerRef
    })).resolves.toEqual(QUOTE);
    await expect(commerce.listDeferredTransitions({ sessionRef: "session_alpha" }))
      .resolves.toEqual([TRANSITION]);
    await expect(commerce.getDeferredTransition({
      sessionRef: "session_alpha",
      transitionRef: TRANSITION.transitionRef
    })).resolves.toEqual(TRANSITION);
    await expect(commerce.reserveDeferredTransition({
      sessionRef: "session_alpha",
      quoteRef: QUOTE.quoteRef,
      idempotencyKey: "reserve_annual_1"
    })).resolves.toEqual(TRANSITION);
    await expect(commerce.cancelDeferredTransition({
      sessionRef: "session_alpha",
      transitionRef: TRANSITION.transitionRef,
      idempotencyKey: "cancel_annual_1"
    })).resolves.toMatchObject({ state: "cancelled" });

    expect(fetchFn.mock.calls).toEqual([
      [
        "/api/portal/commerce/model",
        { method: "GET", headers: { "X-Portal-Session": "session_alpha" } }
      ],
      [
        "/api/portal/commerce/deferred/offers",
        { method: "GET", headers: { "X-Portal-Session": "session_alpha" } }
      ],
      [
        `/api/portal/commerce/deferred/offers/${OFFER.offerRef}`,
        { method: "GET", headers: { "X-Portal-Session": "session_alpha" } }
      ],
      [
        "/api/portal/commerce/deferred/checkout-preview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Portal-Session": "session_alpha"
          },
          body: JSON.stringify({ offerRef: OFFER.offerRef })
        }
      ],
      [
        "/api/portal/commerce/deferred/transitions",
        { method: "GET", headers: { "X-Portal-Session": "session_alpha" } }
      ],
      [
        `/api/portal/commerce/deferred/transitions/${TRANSITION.transitionRef}`,
        { method: "GET", headers: { "X-Portal-Session": "session_alpha" } }
      ],
      [
        "/api/portal/commerce/deferred/transitions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Portal-Session": "session_alpha",
            "Idempotency-Key": "reserve_annual_1"
          },
          body: JSON.stringify({ quoteRef: QUOTE.quoteRef })
        }
      ],
      [
        `/api/portal/commerce/deferred/transitions/${TRANSITION.transitionRef}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Portal-Session": "session_alpha",
            "Idempotency-Key": "cancel_annual_1"
          },
          body: "{}"
        }
      ]
    ]);
    const wire = JSON.stringify(fetchFn.mock.calls);
    expect(wire).not.toContain("/api/portal/commerce/orders");
    expect(wire).not.toContain("commercialModel");
    expect(wire).not.toMatch(/reservationSnapshot|priority|planRank|flowKind|scheduledFor/);
  });

  test("rejects client model/transition hints before they can reach fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const model = createPortalCommerceModelClient({ fetchFn });
    const commerce = createPortalWalletFirstCommerceClient({ fetchFn });

    await expectSafeFailure(model.getCommerceModel({
      sessionRef: "session_alpha",
      commercialModel: "wallet_first_unique_v1"
    } as never));
    await expectSafeFailure(commerce.reserveDeferredTransition({
      sessionRef: "session_alpha",
      quoteRef: QUOTE.quoteRef,
      idempotencyKey: "reserve_spoof_1",
      flowKind: "initial_activation",
      scheduledFor: "2026-08-13T00:00:00.000Z",
      reservationSnapshot: [],
      priority: 9
    } as never));
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("fails safe for an unknown model or a transition projection that leaks internals", async () => {
    const unknownModel = createPortalCommerceModelClient({
      fetchFn: vi.fn<typeof fetch>(async () => response({ commerceModel: "admin_selected" }))
    });
    await expectSafeFailure(unknownModel.getCommerceModel({ sessionRef: "session_alpha" }));

    const leakingTransition = createPortalWalletFirstCommerceClient({
      fetchFn: vi.fn<typeof fetch>(async () => response({
        transition: {
          ...TRANSITION,
          reservationRef: "reservation_internal_1"
        }
      }))
    });
    await expectSafeFailure(leakingTransition.reserveDeferredTransition({
      sessionRef: "session_alpha",
      quoteRef: QUOTE.quoteRef,
      idempotencyKey: "reserve_projection_1"
    }));
  });

  test("preserves non-retryable re-quote and bounded-queue conflicts for the Portal UI", async () => {
    for (const code of [
      "quote_expired",
      "quote_stale",
      "deferred_transition_conflict"
    ] as const) {
      const commerce = createPortalWalletFirstCommerceClient({
        fetchFn: vi.fn<typeof fetch>(async () => response({
          error: { code, retryable: false }
        }, 409))
      });
      await expect(commerce.reserveDeferredTransition({
        sessionRef: "session_alpha",
        quoteRef: QUOTE.quoteRef,
        idempotencyKey: `reserve_${code}`
      })).rejects.toMatchObject({
        name: "PortalCoinCommerceClientError",
        code,
        retryable: false
      });
    }
  });
});
