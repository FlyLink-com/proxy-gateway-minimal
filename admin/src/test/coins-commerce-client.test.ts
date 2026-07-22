import { describe, expect, test, vi } from "vitest";
import {
  CommerceClientError,
  createHttpCommerceClient,
  createLocalPreviewCommerceClient
} from "../features/user-portal/commerce/commerce-client";
import type {
  CatalogDto,
  PaymentAttemptDto,
  ReferralSummaryDto,
  WalletDto
} from "../features/user-portal/commerce/commerce-model";

const NOW = "2026-07-22T00:00:00.000Z";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function fetchMock(...responses: Response[]) {
  return vi.fn(async () => responses.shift() ?? response({ error: "unexpected_request" }, 500));
}

function requestAt(fetchFn: ReturnType<typeof fetchMock>, index: number) {
  const [url, init] = fetchFn.mock.calls[index] as unknown as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : null };
}

function wallet(): WalletDto {
  return {
    summary: {
      accountRef: "acct-safe",
      at: NOW,
      totalAvailableCoins: 30,
      totalFrozenCoins: 0,
      byOrigin: {
        bonus: { availableCoins: 0, frozenCoins: 0 },
        paid: { availableCoins: 30, frozenCoins: 0 },
        referral: { availableCoins: 0, frozenCoins: 0 }
      }
    },
    transactions: []
  };
}

function catalog(): CatalogDto {
  return {
    catalog: {
      schemaVersion: "coins_commerce_catalog_v1",
      publishedAt: NOW,
      productVersions: [],
      offerVersions: [],
      rechargeOffers: []
    },
    activeMemberships: []
  };
}

function referral(): ReferralSummaryDto {
  return {
    cumulativeEarnedCoins: 0,
    availableCoins: 0,
    internallyConsumedCoins: 0,
    frozenCoins: 0,
    frozenForSettlementCoins: 0,
    externallySettledCoins: 0,
    reversedCoins: 0
  };
}

function attempt(overrides: Partial<PaymentAttemptDto> = {}): PaymentAttemptDto {
  return {
    attemptRef: "attempt-safe",
    orderRef: "order-safe",
    providerId: "provider_safe",
    status: "pending",
    chargeCertainty: "pending",
    nextAction: { type: "none" },
    sourceAttemptRef: null,
    targetAttemptRef: null,
    switchReason: null,
    reconciliationState: "pending",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function productOrderResult() {
  const grants = [
    { type: "access" as const, durationDays: null, mode: "while_traffic_remaining" as const },
    {
      type: "traffic" as const,
      quantityGb: 100,
      cycleDays: null,
      resetAtCycleEnd: false,
      carryOver: true,
      consumptionPriority: 200
    }
  ];
  return {
    order: {
      schemaVersion: "coins_commerce_order_v1" as const,
      orderRef: "product-order-safe",
      accountRef: "acct-safe",
      orderType: "product" as const,
      status: "fulfillment_planned" as const,
      currency: "COINS" as const,
      item: {
        productId: "traffic_pack_permanent_100gb",
        productVersionRef: "pv-safe",
        offerVersionRef: "ov-safe",
        currency: "COINS" as const,
        basePriceCoins: 30,
        payableCoins: 30,
        discount: null,
        grants
      },
      amountCoins: 30,
      holdRef: "hold-safe",
      captureTransactionRef: "capture-safe",
      fulfillmentPlanRef: "plan-safe",
      createdAt: NOW
    },
    fulfillmentPlan: {
      schemaVersion: "coins_commerce_fulfillment_plan_v1" as const,
      planRef: "plan-safe",
      orderRef: "product-order-safe",
      accountRef: "acct-safe",
      status: "ready" as const,
      productVersionRef: "pv-safe",
      offerVersionRef: "ov-safe",
      grants,
      createdAt: NOW
    }
  };
}

describe("HTTP Coins commerce client", () => {
  test("uses same-origin GETs with the Portal session and propagates AbortSignal", async () => {
    const fetchFn = fetchMock(response(wallet()));
    const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });
    const controller = new AbortController();

    await expect(client.getWallet("portal-session-safe", controller.signal)).resolves.toEqual(wallet());

    const request = requestAt(fetchFn, 0);
    expect(request.url).toBe("/api/portal/commerce/wallet");
    expect(request.init.method).toBe("GET");
    expect(request.init.signal).toBe(controller.signal);
    expect(request.headers.get("X-Portal-Session")).toBe("portal-session-safe");
    expect(request.url).not.toMatch(/account|userRef|portalUserRef/i);
  });

  test("refuses a cross-origin base URL before a session-bearing fetch and allows explicit same-origin", async () => {
    const crossOriginFetch = fetchMock(response(catalog()));
    const crossOriginClient = createHttpCommerceClient({
      baseUrl: "https://untrusted.example.test",
      fetchFn: crossOriginFetch as unknown as typeof fetch
    });

    const result = await crossOriginClient.getCatalog("synthetic-session-marker").catch((error: unknown) => error);

    expect(result).toMatchObject({
      name: "CommerceClientError",
      code: "validation_error",
      status: 400
    });
    expect(crossOriginFetch).not.toHaveBeenCalled();

    const sameOriginFetch = fetchMock(response(catalog()));
    const sameOriginClient = createHttpCommerceClient({
      baseUrl: window.location.origin,
      fetchFn: sameOriginFetch as unknown as typeof fetch
    });
    await expect(sameOriginClient.getCatalog("same-origin-session")).resolves.toEqual(catalog());
    expect(requestAt(sameOriginFetch, 0).url).toBe(`${window.location.origin}/api/portal/commerce/catalog`);
  });

  test("fails closed for nested Commerce DTOs and status-linked payment evidence", async () => {
    const baseProductResult = productOrderResult();
    const malformedCatalog = {
      ...catalog(),
      catalog: {
        ...catalog().catalog,
        productVersions: [{ providerPayload: { credential: "synthetic-marker" } }],
        offerVersions: [{}],
        rechargeOffers: [{}]
      },
      activeMemberships: [{}]
    };
    const malformedWallet = {
      ...wallet(),
      transactions: [{
        transactionRef: "transaction-safe",
        accountRef: "acct-safe",
        type: "credit",
        amountCoins: 1.5,
        allocations: [],
        relatedRef: "bad/ref",
        createdAt: "not-a-timestamp"
      }]
    };
    const malformedItem = {
      ...baseProductResult,
      order: {
        ...baseProductResult.order,
        item: {
          ...baseProductResult.order.item,
          providerPayload: { credential: "synthetic-marker" }
        }
      }
    };
    const malformedPlan = {
      ...baseProductResult,
      fulfillmentPlan: {
        ...baseProductResult.fulfillmentPlan,
        orderRef: "different-order",
        grants: [{ type: "traffic", providerPayload: { credential: "synthetic-marker" } }]
      }
    };
    const fetchFn = fetchMock(
      response(malformedCatalog),
      response(malformedWallet),
      response(malformedItem, 201),
      response(malformedPlan, 201),
      response(attempt({ status: "succeeded", chargeCertainty: "charged", reconciliationState: "pending" })),
      response(attempt({
        status: "action_required",
        chargeCertainty: "pending",
        reconciliationState: "pending",
        nextAction: { type: "provider_sdk", actionRef: "bad/ref", expiresAt: "not-a-timestamp" }
      }))
    );
    const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });
    const results = await Promise.allSettled([
      client.getCatalog("session-safe"),
      client.getWallet("session-safe"),
      client.createProductOrder("session-safe", { offerVersionRef: "ov-safe", idempotencyKey: "item-check" }),
      client.createProductOrder("session-safe", { offerVersionRef: "ov-safe", idempotencyKey: "plan-check" }),
      client.getPaymentAttempt("session-safe", "attempt-safe"),
      client.getPaymentAttempt("session-safe", "attempt-action-safe")
    ]);

    expect(results.map(({ status }) => status)).toEqual(Array.from({ length: 6 }, () => "rejected"));
    for (const result of results) {
      if (result.status !== "rejected") continue;
      expect(result.reason).toMatchObject({ name: "CommerceClientError", code: "invalid_response" });
    }
  });

  test("puts idempotency only in headers and omits caller ownership from every POST", async () => {
    const productResult = productOrderResult();
    const rechargeResult = {
      order: {
        schemaVersion: "coins_commerce_order_v1",
        orderRef: "recharge-order-safe",
        accountRef: "acct-safe",
        orderType: "recharge",
        status: "payment_requested",
        rechargeSnapshot: {
          rechargeOfferRef: "rov-safe",
          currency: "COINS",
          paidCoins: 20,
          bonusCoins: 0
        },
        createdAt: NOW
      },
      attempt: attempt(),
      status: "pending",
      chargeCertainty: "pending",
      nextAction: { type: "none" }
    };
    const fetchFn = fetchMock(response(productResult, 201), response(rechargeResult, 201), response(rechargeResult, 201));
    const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });

    await client.createProductOrder("session-safe", {
      offerVersionRef: "ov-safe",
      idempotencyKey: "intent-product-1"
    });
    await client.createRechargeOrder("session-safe", {
      rechargeOfferRef: "rov-safe",
      preferredProviderId: null,
      idempotencyKey: "intent-recharge-1"
    });
    await client.switchPaymentAttempt("session-safe", "attempt/ref ?", {
      targetProviderId: "provider_next",
      idempotencyKey: "intent-switch-1"
    });

    const product = requestAt(fetchFn, 0);
    const recharge = requestAt(fetchFn, 1);
    const paymentSwitch = requestAt(fetchFn, 2);
    expect(product.url).toBe("/api/portal/commerce/orders");
    expect(product.body).toEqual({ offerVersionRef: "ov-safe" });
    expect(recharge.url).toBe("/api/portal/commerce/recharge-orders");
    expect(recharge.body).toEqual({ rechargeOfferRef: "rov-safe", preferredProviderId: null });
    expect(paymentSwitch.url).toBe("/api/portal/commerce/payment-attempts/attempt%2Fref%20%3F/switch");
    expect(paymentSwitch.body).toEqual({ targetProviderId: "provider_next" });

    for (const [request, key] of [
      [product, "intent-product-1"],
      [recharge, "intent-recharge-1"],
      [paymentSwitch, "intent-switch-1"]
    ] as const) {
      expect(request.init.method).toBe("POST");
      expect(request.headers.get("X-Portal-Session")).toBe("session-safe");
      expect(request.headers.get("Idempotency-Key")).toBe(key);
      expect(JSON.stringify(request.body)).not.toMatch(/accountRef|userRef|portalUserRef|sessionRef/i);
    }
  });

  test("encodes attempt refs on reads", async () => {
    const fetchFn = fetchMock(response(attempt()));
    const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });

    await client.getPaymentAttempt("session-safe", "attempt/ref ?");

    expect(requestAt(fetchFn, 0).url).toBe("/api/portal/commerce/payment-attempts/attempt%2Fref%20%3F");
  });

  test("parses only stable safe errors", async () => {
    const fetchFn = fetchMock(response({
      error: "insufficient_coins",
      recovery: { type: "go_to_recharge", shortfallCoins: 12 },
      rawException: "must-not-escape"
    }, 409));
    const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });

    const caught = await client.createProductOrder("session-safe", {
      offerVersionRef: "ov-safe",
      idempotencyKey: "intent-safe"
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(CommerceClientError);
    const commerceError = caught as CommerceClientError;
    expect(commerceError).toMatchObject({
      name: "CommerceClientError",
      code: "insufficient_coins",
      status: 409,
      recovery: { type: "go_to_recharge", shortfallCoins: 12 }
    });
    expect(String(commerceError)).not.toContain("must-not-escape");
    expect(Object.keys(commerceError)).not.toContain("rawException");
  });

  test.each(["javascript:alert(1)", "data:text/html,unsafe", "http://payments.example.test/unsafe"])(
    "rejects unsafe hosted redirect protocol %s",
    async (url) => {
      const fetchFn = fetchMock(response(attempt({
        status: "action_required",
        chargeCertainty: "pending",
        nextAction: { type: "hosted_redirect", url }
      })));
      const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });

      await expect(client.getPaymentAttempt("session-safe", "attempt-safe")).rejects.toMatchObject({
        name: "CommerceClientError",
        code: "invalid_response"
      });
    }
  );

  test("rejects provider-specific payload instead of interpreting it", async () => {
    const fetchFn = fetchMock(response({
      ...attempt(),
      providerPayload: { accountBalance: 999, credential: "must-not-be-read" }
    }));
    const client = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });

    await expect(client.getPaymentAttempt("session-safe", "attempt-safe")).rejects.toMatchObject({
      name: "CommerceClientError",
      code: "invalid_response"
    });
  });

  test("keeps synthetic local preview an explicit factory instead of hostname-selected behavior", async () => {
    const fetchFn = fetchMock(response(wallet()));
    const httpClient = createHttpCommerceClient({ fetchFn: fetchFn as unknown as typeof fetch });
    const localClient = createLocalPreviewCommerceClient({
      wallet: wallet(),
      catalog: catalog(),
      orders: [],
      referral: referral()
    });

    await expect(httpClient.getWallet("session-safe")).resolves.toEqual(wallet());
    await expect(localClient.getWallet("synthetic-session")).resolves.toEqual(wallet());
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
