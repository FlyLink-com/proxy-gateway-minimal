import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createHttpUserPortalClient,
  createLocalUserPortalClient
} from "../features/user-portal/user-portal-client";
import { PortalCoinCommerceClientError } from "../features/user-portal/commerce";

type CommerceSurface = {
  listOffers(input: { sessionRef: string }): Promise<unknown>;
  getOffer(input: { sessionRef: string; offerRef: string }): Promise<unknown>;
  previewCheckout(input: { sessionRef: string; offerRef: string }): Promise<unknown>;
  createOrder(input: {
    sessionRef: string;
    quoteRef: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  getOrder(input: { sessionRef: string; orderRef: string }): Promise<unknown>;
  cancelOrder(input: {
    sessionRef: string;
    orderRef: string;
    idempotencyKey: string;
  }): Promise<unknown>;
};

const PLAN_OFFER = {
  offerRef: "offer_monthly_50gb",
  offerVersionRef: "offerversion_monthly_50gb_1",
  category: "plan",
  title: { zh: "月付 50 GB", en: "Monthly 50 GB" },
  summary: { zh: "每月 50 GB", en: "50 GB each month" },
  importantNotices: {
    zh: ["购买后自动交付"],
    en: ["Delivered automatically after purchase"]
  },
  referencePrice: { currency: "CNY", amountMinor: 2_000 },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 50,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 500
  }
};

const DATA_PACK_OFFER = {
  offerRef: "offer_data_100gb",
  offerVersionRef: "offerversion_data_100gb_1",
  category: "data_pack",
  title: { zh: "100 GB 流量包", en: "100 GB data pack" },
  summary: { zh: "永久有效", en: "Never expires" },
  importantNotices: {
    zh: ["仅限平台自营服务"],
    en: ["For platform-operated services only"]
  },
  referencePrice: { currency: "CNY", amountMinor: 3_000 },
  acceptedCoinTypes: ["paid_coins", "reward_coins"],
  delivery: {
    kind: "data_pack",
    durationDays: null,
    monthlyTrafficGb: null,
    trafficGb: 100,
    neverExpires: true,
    discountBasisPoints: null
  }
};

const AVAILABLE_QUOTE = {
  quoteRef: "quote_monthly_50gb_1",
  offer: PLAN_OFFER,
  amountUnits: 20,
  appliedDiscountBasisPoints: 500,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [
    { coinType: "bonus_coins", amountUnits: 5 },
    { coinType: "paid_coins", amountUnits: 15 }
  ],
  balances: {
    before: {
      bonusCoins: 5,
      paidCoins: 995,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 0,
      paidCoins: 980,
      rewardCoins: 0,
      heldCoins: 20
    }
  },
  expiresAt: "2026-07-27T12:01:00.000Z"
};

const INSUFFICIENT_QUOTE = {
  quoteRef: "quote_data_100gb_1",
  offer: DATA_PACK_OFFER,
  amountUnits: 30,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "insufficient_balance",
  shortfallUnits: 20,
  allocation: [],
  balances: {
    before: {
      bonusCoins: 500,
      paidCoins: 7,
      rewardCoins: 3,
      heldCoins: 0
    },
    after: {
      bonusCoins: 500,
      paidCoins: 7,
      rewardCoins: 3,
      heldCoins: 0
    }
  },
  expiresAt: "2026-07-27T12:01:00.000Z"
};

const HELD_ORDER = {
  orderRef: "order_monthly_50gb_1",
  offer: PLAN_OFFER,
  amountUnits: 20,
  allocation: [
    { coinType: "bonus_coins", amountUnits: 5 },
    { coinType: "paid_coins", amountUnits: 15 }
  ],
  paymentStatus: "held",
  cancelUntil: "2026-07-27T12:00:03.000Z",
  fulfillment: { status: "not_requested", safeCode: null },
  createdAt: "2026-07-27T12:00:00.000Z",
  updatedAt: "2026-07-27T12:00:00.000Z"
};

const CAPTURED_ORDER = {
  ...HELD_ORDER,
  paymentStatus: "captured",
  fulfillment: { status: "delivered", safeCode: null },
  updatedAt: "2026-07-27T12:00:02.000Z"
};

const CANCELLED_ORDER = {
  ...HELD_ORDER,
  paymentStatus: "cancelled",
  updatedAt: "2026-07-27T12:00:01.000Z"
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function wireResponse(body: unknown, status = 200) {
  const response = new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } }
  );
  vi.spyOn(response, "json").mockRejectedValue(
    new Error("Commerce client must decode Response.text()")
  );
  return response;
}

function commerceOf(client: unknown): CommerceSurface {
  return (client as { commerce: CommerceSurface }).commerce;
}

async function expectSafeFailure(
  promise: Promise<unknown>,
  code = "commerce_request_failed",
  retryable = true
) {
  try {
    await promise;
    throw new Error("expected Commerce client failure");
  } catch (error) {
    expect(error).toMatchObject({
      name: "PortalCoinCommerceClientError",
      message: "Portal Commerce request failed.",
      code,
      retryable
    });
    expect(String(error)).not.toMatch(
      /synthetic internal|credential|session_alpha|raw auth detail/i
    );
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Portal Coins Commerce HTTP client", () => {
  test("is an HTTP-only capability and is absent from the local client", () => {
    const httpClient = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>()
    });
    const localClient = createLocalUserPortalClient();

    expect(Object.hasOwn(httpClient, "commerce")).toBe(true);
    expect(Object.hasOwn(localClient, "commerce")).toBe(false);
  });

  test("uses the six exact relative routes, headers, methods, and bodies", async () => {
    const responses = [
      { offers: [PLAN_OFFER, DATA_PACK_OFFER] },
      { offer: DATA_PACK_OFFER },
      { quote: AVAILABLE_QUOTE },
      { order: HELD_ORDER },
      { order: CAPTURED_ORDER },
      { order: CANCELLED_ORDER }
    ];
    const fetchFn = vi.fn<typeof fetch>(async () => (
      wireResponse(responses.shift(), responses.length === 2 ? 201 : 200)
    ));
    const commerce = commerceOf(createHttpUserPortalClient({
      baseUrl: "https://must-not-be-used.example.test",
      fetchFn
    }));

    await expect(commerce.listOffers({ sessionRef: "session_alpha" }))
      .resolves.toEqual([PLAN_OFFER, DATA_PACK_OFFER]);
    await expect(commerce.getOffer({
      sessionRef: "session_alpha",
      offerRef: "offer_data_100gb"
    })).resolves.toEqual(DATA_PACK_OFFER);
    await expect(commerce.previewCheckout({
      sessionRef: "session_alpha",
      offerRef: "offer_monthly_50gb"
    })).resolves.toEqual(AVAILABLE_QUOTE);
    await expect(commerce.createOrder({
      sessionRef: "session_alpha",
      quoteRef: "quote_monthly_50gb_1",
      idempotencyKey: "checkout-attempt-1"
    })).resolves.toEqual(HELD_ORDER);
    await expect(commerce.getOrder({
      sessionRef: "session_alpha",
      orderRef: "order_monthly_50gb_1"
    })).resolves.toEqual(CAPTURED_ORDER);
    await expect(commerce.cancelOrder({
      sessionRef: "session_alpha",
      orderRef: "order_monthly_50gb_1",
      idempotencyKey: "cancel-attempt-1"
    })).resolves.toEqual(CANCELLED_ORDER);

    expect(fetchFn.mock.calls).toEqual([
      [
        "/api/portal/catalog/offers",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_alpha" }
        }
      ],
      [
        "/api/portal/catalog/offers/offer_data_100gb",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_alpha" }
        }
      ],
      [
        "/api/portal/commerce/checkout-preview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Portal-Session": "session_alpha"
          },
          body: "{\"offerRef\":\"offer_monthly_50gb\"}"
        }
      ],
      [
        "/api/portal/commerce/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Portal-Session": "session_alpha",
            "Idempotency-Key": "checkout-attempt-1"
          },
          body: "{\"quoteRef\":\"quote_monthly_50gb_1\"}"
        }
      ],
      [
        "/api/portal/commerce/orders/order_monthly_50gb_1",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_alpha" }
        }
      ],
      [
        "/api/portal/commerce/orders/order_monthly_50gb_1/cancel",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Portal-Session": "session_alpha",
            "Idempotency-Key": "cancel-attempt-1"
          },
          body: "{}"
        }
      ]
    ]);
  });

  test("accepts both Quote states and the held, captured, and cancelled Order states", async () => {
    const bodies = [
      { quote: AVAILABLE_QUOTE },
      { quote: INSUFFICIENT_QUOTE },
      { order: HELD_ORDER },
      { order: CAPTURED_ORDER },
      { order: CANCELLED_ORDER }
    ];
    const fetchFn = vi.fn<typeof fetch>(async () => wireResponse(bodies.shift()));
    const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));

    await expect(commerce.previewCheckout({
      sessionRef: "session_alpha",
      offerRef: "offer_monthly_50gb"
    })).resolves.toEqual(AVAILABLE_QUOTE);
    await expect(commerce.previewCheckout({
      sessionRef: "session_alpha",
      offerRef: "offer_data_100gb"
    })).resolves.toEqual(INSUFFICIENT_QUOTE);
    for (const order of [HELD_ORDER, CAPTURED_ORDER, CANCELLED_ORDER]) {
      await expect(commerce.getOrder({
        sessionRef: "session_alpha",
        orderRef: "order_monthly_50gb_1"
      })).resolves.toEqual(order);
    }
  });

  test("rejects malformed caller references and account overrides before fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));
    const invalidCalls = [
      commerce.listOffers({ sessionRef: "" }),
      commerce.getOffer({
        sessionRef: "session_alpha",
        offerRef: "../other-account"
      }),
      commerce.previewCheckout({
        sessionRef: "session alpha",
        offerRef: "offer_monthly_50gb"
      }),
      commerce.createOrder({
        sessionRef: "session_alpha",
        quoteRef: "UPPERCASE",
        idempotencyKey: "checkout-attempt-1"
      }),
      commerce.getOrder({
        sessionRef: "session_alpha",
        orderRef: "o"
      }),
      commerce.cancelOrder({
        sessionRef: "session_alpha",
        orderRef: "order_monthly_50gb_1",
        idempotencyKey: "contains whitespace"
      }),
      commerce.listOffers({
        sessionRef: "session_alpha",
        accountId: "acct_override"
      } as never)
    ];

    for (const promise of invalidCalls) {
      await expectSafeFailure(promise);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("rejects hostile object and array shapes even if JSON.parse is replaced", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => wireResponse("{}"));
    const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));
    const values: unknown[] = [];

    values.push(Object.assign(Object.create(null), {
      offers: [clone(PLAN_OFFER)]
    }));
    const accessor = {};
    Object.defineProperty(accessor, "offers", {
      enumerable: true,
      get() {
        throw new Error("accessor must not execute");
      }
    });
    values.push(accessor);
    const symbol = { offers: [clone(PLAN_OFFER)] };
    Object.defineProperty(symbol, Symbol("unsafe"), {
      enumerable: true,
      value: true
    });
    values.push(symbol);
    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "offers", {
      enumerable: false,
      value: [clone(PLAN_OFFER)]
    });
    values.push(nonEnumerable);
    const sparse = new Array(1);
    values.push({ offers: sparse });
    const propertyBearing = [clone(PLAN_OFFER)] as typeof PLAN_OFFER[] & {
      internal?: boolean;
    };
    propertyBearing.internal = true;
    values.push({ offers: propertyBearing });

    for (const value of values) {
      vi.spyOn(JSON, "parse").mockReturnValueOnce(value);
      await expectSafeFailure(
        commerce.listOffers({ sessionRef: "session_alpha" })
      );
      vi.mocked(JSON.parse).mockRestore();
    }
  });

  test("rejects exact-schema, enum, numeric, timestamp, arithmetic, and state drift", async () => {
    const extraOffer = clone(PLAN_OFFER) as typeof PLAN_OFFER & {
      internal?: boolean;
    };
    extraOffer.internal = true;
    const wrongDelivery = clone(PLAN_OFFER);
    wrongDelivery.delivery.kind = "data_pack";
    const unsafeQuote = clone(AVAILABLE_QUOTE);
    unsafeQuote.amountUnits = Number.MAX_SAFE_INTEGER + 1;
    const invalidTimestamp = clone(AVAILABLE_QUOTE);
    invalidTimestamp.expiresAt = "2026-07-27T12:01:00Z";
    const quoteArithmeticDrift = clone(AVAILABLE_QUOTE);
    quoteArithmeticDrift.balances.after.paidCoins += 1;
    const invalidAvailability = clone(INSUFFICIENT_QUOTE);
    invalidAvailability.purchaseAvailability = "pending";
    const orderAllocationDrift = clone(HELD_ORDER);
    orderAllocationDrift.allocation[1].amountUnits = 14;
    const invalidOrderState = clone(HELD_ORDER);
    invalidOrderState.fulfillment = {
      status: "pending",
      safeCode: null
    };
    const invalidCapturedState = clone(CAPTURED_ORDER);
    invalidCapturedState.fulfillment = {
      status: "failed",
      safeCode: null
    };

    const cases = [
      { offers: null },
      { offers: [extraOffer] },
      { offers: [wrongDelivery] },
      { offers: [PLAN_OFFER], extra: true },
      { quote: unsafeQuote },
      { quote: invalidTimestamp },
      { quote: quoteArithmeticDrift },
      { quote: invalidAvailability },
      { order: orderAllocationDrift },
      { order: invalidOrderState },
      { order: invalidCapturedState }
    ];
    for (const body of cases) {
      const fetchFn = vi.fn<typeof fetch>(async () => wireResponse(body));
      const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));
      const promise = Object.hasOwn(body, "offers")
        ? commerce.listOffers({ sessionRef: "session_alpha" })
        : Object.hasOwn(body, "quote")
          ? commerce.previewCheckout({
              sessionRef: "session_alpha",
              offerRef: "offer_monthly_50gb"
            })
          : commerce.getOrder({
              sessionRef: "session_alpha",
              orderRef: "order_monthly_50gb_1"
            });
      await expectSafeFailure(promise);
    }
  });

  test("preserves only exact structured Commerce errors and makes every other failure safe", async () => {
    const structured = vi.fn<typeof fetch>(async () => wireResponse({
      error: {
        code: "commerce_rate_limited",
        retryable: true
      }
    }, 429));
    const commerce = commerceOf(createHttpUserPortalClient({
      fetchFn: structured
    }));
    await expectSafeFailure(
      commerce.listOffers({ sessionRef: "session_alpha" }),
      "commerce_rate_limited",
      true
    );

    const failures: Array<() => Promise<Response>> = [
      async () => {
        throw new Error("synthetic internal credential detail");
      },
      async () => {
        throw new PortalCoinCommerceClientError(
          "commerce_not_found",
          false
        );
      },
      async () => wireResponse("{not-json"),
      async () => wireResponse({
        error: {
          code: "commerce_rate_limited",
          retryable: true,
          detail: "synthetic internal detail"
        }
      }, 429),
      async () => wireResponse({
        error: {
          code: "commerce_not_found",
          retryable: true
        }
      }, 404),
      async () => wireResponse({
        error: "raw auth detail for session_alpha"
      }, 401),
      async () => wireResponse("<html>not found</html>", 404)
    ];
    for (const failure of failures) {
      const client = commerceOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(failure)
      }));
      await expectSafeFailure(
        client.listOffers({ sessionRef: "session_alpha" })
      );
    }
  });
});
