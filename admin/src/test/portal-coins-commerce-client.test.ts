import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createHttpUserPortalClient,
  createLocalUserPortalClient
} from "../features/user-portal/user-portal-client";
import { PortalCoinCommerceClientError } from "../features/user-portal/commerce";

type CommerceSurface = {
  listOffers(input: { sessionRef: string }): Promise<unknown>;
  listOrders(input:
    | {
        sessionRef: string;
        limit: number;
        afterCreatedAt?: never;
        afterOrderRef?: never;
      }
    | {
        sessionRef: string;
        limit: number;
        afterCreatedAt: string;
        afterOrderRef: string;
      }
  ): Promise<unknown>;
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

function heldOrderAt(
  orderRef: string,
  createdAt: string
) {
  return {
    ...clone(HELD_ORDER),
    orderRef,
    cancelUntil: new Date(Date.parse(createdAt) + 3_000).toISOString(),
    createdAt,
    updatedAt: createdAt
  };
}

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

  test("rejects successful statuses outside each endpoint contract", async () => {
    const responses = [
      wireResponse({ offers: [PLAN_OFFER] }, 201),
      wireResponse({ order: HELD_ORDER }, 200),
      wireResponse({ order: HELD_ORDER }, 202)
    ];
    const fetchFn = vi.fn<typeof fetch>(async () => responses.shift()!);
    const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));

    await expectSafeFailure(
      commerce.listOffers({ sessionRef: "session_alpha" })
    );
    await expectSafeFailure(commerce.createOrder({
      sessionRef: "session_alpha",
      quoteRef: "quote_monthly_50gb_1",
      idempotencyKey: "checkout-status-200"
    }));
    await expectSafeFailure(commerce.createOrder({
      sessionRef: "session_alpha",
      quoteRef: "quote_monthly_50gb_1",
      idempotencyKey: "checkout-status-202"
    }));
    expect(fetchFn).toHaveBeenCalledTimes(3);
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

  test("exposes the strict consumption-order list capability", () => {
    const commerce = commerceOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>()
    }));

    expect(typeof commerce.listOrders).toBe("function");
  });

  test("uses only the fixed relative order-list GET with stable paired cursor query", async () => {
    const newest = heldOrderAt(
      "order_page_newest",
      "2026-07-27T12:00:00.000Z"
    );
    const older = heldOrderAt(
      "order_page_older",
      "2026-07-27T11:59:00.000Z"
    );
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(wireResponse({
        orders: [newest],
        nextCursor: null
      }))
      .mockResolvedValueOnce(wireResponse({
        orders: [older],
        nextCursor: {
          afterCreatedAt: older.createdAt,
          afterOrderRef: older.orderRef
        }
      }));
    const commerce = commerceOf(createHttpUserPortalClient({
      baseUrl: "https://must-not-be-used.example.test/redirect",
      fetchFn
    }));

    await expect(commerce.listOrders({
      sessionRef: "session_alpha",
      limit: 25
    })).resolves.toEqual({ orders: [newest], nextCursor: null });
    await expect(commerce.listOrders({
      sessionRef: "session_alpha",
      limit: 10,
      afterCreatedAt: newest.createdAt,
      afterOrderRef: newest.orderRef
    })).resolves.toEqual({
      orders: [older],
      nextCursor: {
        afterCreatedAt: older.createdAt,
        afterOrderRef: older.orderRef
      }
    });

    expect(fetchFn.mock.calls).toEqual([
      [
        "/api/portal/commerce/orders?limit=25",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_alpha" }
        }
      ],
      [
        "/api/portal/commerce/orders?limit=10&afterCreatedAt=2026-07-27T12%3A00%3A00.000Z&afterOrderRef=order_page_newest",
        {
          method: "GET",
          headers: { "X-Portal-Session": "session_alpha" }
        }
      ]
    ]);
    expect(JSON.stringify(fetchFn.mock.calls)).not.toContain("accountId");
  });

  test("rejects malformed list caller input before fetch", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));
    const accessor = { sessionRef: "session_alpha", limit: 10 };
    Object.defineProperty(accessor, "afterCreatedAt", {
      enumerable: true,
      get() {
        throw new Error("accessor must not execute");
      }
    });
    const symbol = {
      sessionRef: "session_alpha",
      limit: 10
    } as Record<PropertyKey, unknown>;
    symbol[Symbol("unsafe")] = true;
    const invalidInputs: unknown[] = [
      { sessionRef: "session_alpha", limit: 0 },
      { sessionRef: "session_alpha", limit: 101 },
      { sessionRef: "session_alpha", limit: 1.5 },
      { sessionRef: "session_alpha", limit: Number.MAX_SAFE_INTEGER + 1 },
      { sessionRef: "session_alpha", limit: "10" },
      {
        sessionRef: "session_alpha",
        limit: 10,
        afterCreatedAt: "2026-07-27T12:00:00.000Z"
      },
      {
        sessionRef: "session_alpha",
        limit: 10,
        afterOrderRef: "order_page_newest"
      },
      {
        sessionRef: "session_alpha",
        limit: 10,
        afterCreatedAt: "2026-07-27T12:00:00Z",
        afterOrderRef: "order_page_newest"
      },
      {
        sessionRef: "session_alpha",
        limit: 10,
        afterCreatedAt: "2026-07-27T12:00:00.000Z",
        afterOrderRef: "../other-account"
      },
      {
        sessionRef: "session_alpha",
        limit: 10,
        extra: true
      },
      accessor,
      symbol,
      Object.assign(Object.create(null), {
        sessionRef: "session_alpha",
        limit: 10
      })
    ];

    for (const input of invalidInputs) {
      await expectSafeFailure(
        commerce.listOrders(input as never)
      );
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("accepts only bounded strictly descending pages and matching cursors", async () => {
    const newest = heldOrderAt(
      "order_page_newest",
      "2026-07-27T12:00:00.000Z"
    );
    const tieHigh = heldOrderAt(
      "order_page_tie_b",
      "2026-07-27T11:59:00.000Z"
    );
    const tieLow = heldOrderAt(
      "order_page_tie_a",
      "2026-07-27T11:59:00.000Z"
    );
    const older = heldOrderAt(
      "order_page_older",
      "2026-07-27T11:58:00.000Z"
    );
    const invalidCases = [
      {
        input: { sessionRef: "session_alpha", limit: 1 },
        body: { orders: [newest, older], nextCursor: null }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: { orders: [newest, newest], nextCursor: null }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: {
          orders: [
            newest,
            { ...older, orderRef: newest.orderRef }
          ],
          nextCursor: null
        }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: { orders: [older, newest], nextCursor: null }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: { orders: [tieLow, tieHigh], nextCursor: null }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: {
          orders: [],
          nextCursor: {
            afterCreatedAt: older.createdAt,
            afterOrderRef: older.orderRef
          }
        }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: {
          orders: [newest, older],
          nextCursor: {
            afterCreatedAt: newest.createdAt,
            afterOrderRef: newest.orderRef
          }
        }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: {
          orders: [newest],
          nextCursor: {
            afterCreatedAt: newest.createdAt,
            afterOrderRef: newest.orderRef,
            extra: true
          }
        }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: {
          orders: [newest],
          nextCursor: {
            afterCreatedAt: "2026-07-27T12:00:00Z",
            afterOrderRef: newest.orderRef
          }
        }
      },
      {
        input: { sessionRef: "session_alpha", limit: 3 },
        body: {
          orders: [newest],
          nextCursor: {
            afterCreatedAt: newest.createdAt,
            afterOrderRef: "../other-account"
          }
        }
      },
      {
        input: {
          sessionRef: "session_alpha",
          limit: 3,
          afterCreatedAt: newest.createdAt,
          afterOrderRef: newest.orderRef
        },
        body: { orders: [newest], nextCursor: null }
      },
      {
        input: {
          sessionRef: "session_alpha",
          limit: 3,
          afterCreatedAt: tieHigh.createdAt,
          afterOrderRef: tieHigh.orderRef
        },
        body: { orders: [newest], nextCursor: null }
      }
    ];

    for (const entry of invalidCases) {
      const commerce = commerceOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse(entry.body))
      }));
      await expectSafeFailure(commerce.listOrders(entry.input));
    }

    const validRows = [newest, tieHigh, tieLow, older];
    const commerce = commerceOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        orders: validRows,
        nextCursor: {
          afterCreatedAt: older.createdAt,
          afterOrderRef: older.orderRef
        }
      }))
    }));
    await expect(commerce.listOrders({
      sessionRef: "session_alpha",
      limit: 4
    })).resolves.toEqual({
      orders: validRows,
      nextCursor: {
        afterCreatedAt: older.createdAt,
        afterOrderRef: older.orderRef
      }
    });
  });

  test("rejects hostile page shapes and malformed orders through the exact projector", async () => {
    const order = heldOrderAt(
      "order_page_newest",
      "2026-07-27T12:00:00.000Z"
    );
    const sparse = new Array(1);
    const accessor = { orders: [order] };
    Object.defineProperty(accessor, "nextCursor", {
      enumerable: true,
      get() {
        throw new Error("accessor must not execute");
      }
    });
    const symbol = { orders: [order], nextCursor: null };
    Object.defineProperty(symbol, Symbol("unsafe"), {
      enumerable: true,
      value: true
    });
    const cursorAccessor = {
      afterCreatedAt: order.createdAt
    };
    Object.defineProperty(cursorAccessor, "afterOrderRef", {
      enumerable: true,
      get() {
        throw new Error("accessor must not execute");
      }
    });
    const cursorSymbol = {
      afterCreatedAt: order.createdAt,
      afterOrderRef: order.orderRef
    };
    Object.defineProperty(cursorSymbol, Symbol("unsafe"), {
      enumerable: true,
      value: true
    });
    const cursorPrototype = Object.assign(Object.create(null), {
      afterCreatedAt: order.createdAt,
      afterOrderRef: order.orderRef
    });
    const hostilePages: unknown[] = [
      { orders: [order], nextCursor: null, extra: true },
      { orders: [order] },
      Object.assign(Object.create(null), {
        orders: [order],
        nextCursor: null
      }),
      accessor,
      symbol,
      { orders: sparse, nextCursor: null },
      { orders: [order], nextCursor: cursorAccessor },
      { orders: [order], nextCursor: cursorSymbol },
      { orders: [order], nextCursor: cursorPrototype }
    ];
    for (const page of hostilePages) {
      const fetchFn = vi.fn<typeof fetch>(async () => wireResponse("{}"));
      const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));
      vi.spyOn(JSON, "parse").mockReturnValueOnce(page);
      await expectSafeFailure(commerce.listOrders({
        sessionRef: "session_alpha",
        limit: 10
      }));
      vi.mocked(JSON.parse).mockRestore();
    }

    const invalidOrders = [
      { ...clone(order), paymentStatus: "unknown" },
      {
        ...clone(order),
        paymentStatus: "captured",
        fulfillment: { status: "unknown", safeCode: null }
      },
      {
        ...clone(order),
        paymentStatus: "captured",
        fulfillment: { status: "failed", safeCode: "internal_detail" }
      },
      { ...clone(order), amountUnits: Number.MAX_SAFE_INTEGER + 1 },
      { ...clone(order), createdAt: "2026-07-27T12:00:00Z" }
    ];
    for (const invalidOrder of invalidOrders) {
      const commerce = commerceOf(createHttpUserPortalClient({
        fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
          orders: [invalidOrder],
          nextCursor: null
        }))
      }));
      await expectSafeFailure(commerce.listOrders({
        sessionRef: "session_alpha",
        limit: 10
      }));
    }
  });

  test("maps only the exact legacy list 401 while preserving structured session errors", async () => {
    const exactLegacy = commerceOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        error: "Unauthorized"
      }, 401))
    }));
    await expectSafeFailure(
      exactLegacy.listOrders({ sessionRef: "session_alpha", limit: 10 }),
      "commerce_unavailable",
      true
    );

    const hostileBodies: unknown[] = [
      { error: "Unauthorized", extra: true },
      { error: "unauthorized" },
      { error: { code: "Unauthorized" } },
      Object.assign(Object.create(null), { error: "Unauthorized" }),
      (() => {
        const value = {};
        Object.defineProperty(value, "error", {
          enumerable: true,
          get() {
            throw new Error("accessor must not execute");
          }
        });
        return value;
      })(),
      (() => {
        const value = { error: "Unauthorized" };
        Object.defineProperty(value, Symbol("unsafe"), {
          enumerable: true,
          value: true
        });
        return value;
      })()
    ];
    for (const body of hostileBodies) {
      const fetchFn = vi.fn<typeof fetch>(async () => wireResponse("ignored", 401));
      const commerce = commerceOf(createHttpUserPortalClient({ fetchFn }));
      vi.spyOn(JSON, "parse").mockReturnValueOnce(body);
      await expectSafeFailure(commerce.listOrders({
        sessionRef: "session_alpha",
        limit: 10
      }));
      vi.mocked(JSON.parse).mockRestore();
    }
    const wrongStatus = commerceOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        error: "Unauthorized"
      }, 403))
    }));
    await expectSafeFailure(wrongStatus.listOrders({
      sessionRef: "session_alpha",
      limit: 10
    }));

    const structured = commerceOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        error: {
          code: "commerce_session_invalid",
          retryable: false
        }
      }, 401))
    }));
    await expectSafeFailure(
      structured.listOrders({ sessionRef: "session_alpha", limit: 10 }),
      "commerce_session_invalid",
      false
    );
  });

  test("keeps legacy 401 fallback unchanged for all six existing requests", async () => {
    const commerce = commerceOf(createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => wireResponse({
        error: "Unauthorized"
      }, 401))
    }));
    const existingCalls = [
      () => commerce.listOffers({ sessionRef: "session_alpha" }),
      () => commerce.getOffer({
        sessionRef: "session_alpha",
        offerRef: "offer_data_100gb"
      }),
      () => commerce.previewCheckout({
        sessionRef: "session_alpha",
        offerRef: "offer_monthly_50gb"
      }),
      () => commerce.createOrder({
        sessionRef: "session_alpha",
        quoteRef: "quote_monthly_50gb_1",
        idempotencyKey: "checkout-attempt-1"
      }),
      () => commerce.getOrder({
        sessionRef: "session_alpha",
        orderRef: "order_monthly_50gb_1"
      }),
      () => commerce.cancelOrder({
        sessionRef: "session_alpha",
        orderRef: "order_monthly_50gb_1",
        idempotencyKey: "cancel-attempt-1"
      })
    ];

    for (const existingCall of existingCalls) {
      await expectSafeFailure(existingCall());
    }
  });
});
