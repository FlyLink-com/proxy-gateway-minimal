import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import * as commerce from "../features/user-portal/commerce";
import type {
  PortalCoinCommerceClient,
  PortalCoinOffer,
  PortalCoinOrder,
  PortalCoinQuote
} from "../features/user-portal/commerce";

const offer: PortalCoinOffer = {
  offerRef: "offer_basic",
  offerVersionRef: "offer_version_basic",
  category: "plan",
  title: { zh: "基础套餐", en: "Basic plan" },
  summary: { zh: "基础说明", en: "Basic summary" },
  importantNotices: {
    zh: ["购买后按订单状态交付"],
    en: ["Delivery follows the Order state"]
  },
  referencePrice: { currency: "CNY", amountMinor: 1500 },
  acceptedCoinTypes: ["paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 30,
    monthlyTrafficGb: 100,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};

const quote: PortalCoinQuote = {
  quoteRef: "quote_basic",
  offer,
  amountUnits: 15,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [{ coinType: "paid_coins", amountUnits: 15 }],
  balances: {
    before: {
      bonusCoins: 0,
      paidCoins: 20,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 0,
      paidCoins: 5,
      rewardCoins: 0,
      heldCoins: 0
    }
  },
  expiresAt: "2026-07-27T20:00:00.000Z"
};

const heldOrder: PortalCoinOrder = {
  orderRef: "order_basic",
  offer,
  amountUnits: 15,
  allocation: [{ coinType: "paid_coins", amountUnits: 15 }],
  paymentStatus: "held",
  cancelUntil: "2026-07-27T20:05:00.000Z",
  fulfillment: { status: "not_requested", safeCode: null },
  createdAt: "2026-07-27T19:55:00.000Z",
  updatedAt: "2026-07-27T19:55:00.000Z"
};

const cancelledOrder: PortalCoinOrder = {
  ...heldOrder,
  paymentStatus: "cancelled",
  updatedAt: "2026-07-27T19:56:00.000Z"
};

const deliveredOrder: PortalCoinOrder = {
  ...heldOrder,
  paymentStatus: "captured",
  fulfillment: { status: "delivered", safeCode: null },
  updatedAt: "2026-07-27T19:57:00.000Z"
};

function commerceClient(
  overrides: Partial<PortalCoinCommerceClient> = {}
): PortalCoinCommerceClient {
  return {
    listOffers: vi.fn(async () => [offer]),
    getOffer: vi.fn(async () => offer),
    previewCheckout: vi.fn(async () => quote),
    createOrder: vi.fn(async () => heldOrder),
    getOrder: vi.fn(async () => heldOrder),
    cancelOrder: vi.fn(async () => heldOrder),
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Portal Coins purchase flow", () => {
  test("exposes the Task 4 purchase controller without adding a second Portal host", () => {
    expect(Object.hasOwn(commerce, "useCoinsPurchaseFlow")).toBe(true);
  });

  test("loads server product detail before requesting its checkout preview", async () => {
    const client = commerceClient();
    const { result } = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1"
    }));

    await act(async () => {
      await result.current.openProduct("offer_basic");
    });
    expect(result.current.phase).toBe("detail");
    expect(result.current.offer).toEqual(offer);
    expect(client.getOffer).toHaveBeenCalledWith({
      sessionRef: "session-1",
      offerRef: "offer_basic"
    });

    await act(async () => {
      await result.current.previewCheckout();
    });
    expect(result.current.phase).toBe("quote");
    expect(result.current.quote).toEqual(quote);
    expect(client.previewCheckout).toHaveBeenCalledWith({
      sessionRef: "session-1",
      offerRef: "offer_basic"
    });
  });

  test("creates one Order for a double confirm and generates one create intent key", async () => {
    const pendingOrder = deferred<PortalCoinOrder>();
    const client = commerceClient({
      createOrder: vi.fn(() => pendingOrder.promise)
    });
    const createIdempotencyKey = vi.fn(() => "create_intent_1");
    const { result } = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      createIdempotencyKey
    }));
    await act(async () => {
      await result.current.openProduct("offer_basic");
      await result.current.previewCheckout();
    });

    let firstConfirm!: Promise<void>;
    act(() => {
      firstConfirm = result.current.confirmPurchase();
      void result.current.confirmPurchase();
    });
    expect(client.createOrder).toHaveBeenCalledTimes(1);
    expect(client.createOrder).toHaveBeenCalledWith({
      sessionRef: "session-1",
      quoteRef: "quote_basic",
      idempotencyKey: "create_intent_1"
    });
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingOrder.resolve(heldOrder);
      await firstConfirm;
    });
    expect(result.current.order).toEqual(heldOrder);
  });

  test("reuses the create intent key when an uncertain transport result is retried", async () => {
    const createOrder = vi.fn()
      .mockRejectedValueOnce(
        new commerce.PortalCoinCommerceClientError(
          "commerce_request_failed",
          true
        )
      )
      .mockResolvedValueOnce(heldOrder);
    const client = commerceClient({ createOrder });
    const createIdempotencyKey = vi.fn(() => "create_intent_retry");
    const { result } = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      createIdempotencyKey
    }));
    await act(async () => {
      await result.current.openProduct("offer_basic");
      await result.current.previewCheckout();
      await result.current.confirmPurchase();
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.errorCode).toBe("commerce_request_failed");

    await act(async () => {
      await result.current.confirmPurchase();
    });
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createOrder.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      "create_intent_retry",
      "create_intent_retry"
    ]);
    expect(createIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(result.current.order).toEqual(heldOrder);
  });

  test("uses one cancel intent key and requires a GET readback after server cancellation", async () => {
    const pendingCancel = deferred<PortalCoinOrder>();
    const cancelOrder = vi.fn(() => pendingCancel.promise);
    const getOrder = vi.fn(async () => cancelledOrder);
    const client = commerceClient({ cancelOrder, getOrder });
    const cancelIdempotencyKey = vi.fn(() => "cancel_intent_1");
    const { result } = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      createIdempotencyKey: () => "create_intent_1",
      cancelIdempotencyKey
    }));
    await act(async () => {
      await result.current.openProduct("offer_basic");
      await result.current.previewCheckout();
      await result.current.confirmPurchase();
    });

    let firstCancel!: Promise<void>;
    act(() => {
      firstCancel = result.current.cancelPurchase();
      void result.current.cancelPurchase();
    });
    expect(cancelOrder).toHaveBeenCalledTimes(1);
    expect(cancelOrder).toHaveBeenCalledWith({
      sessionRef: "session-1",
      orderRef: "order_basic",
      idempotencyKey: "cancel_intent_1"
    });
    expect(cancelIdempotencyKey).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingCancel.resolve(cancelledOrder);
      await firstCancel;
    });
    expect(getOrder).toHaveBeenCalledWith({
      sessionRef: "session-1",
      orderRef: "order_basic"
    });
    expect(result.current.order).toEqual(cancelledOrder);
  });

  test("polls with GET only and stops after a terminal server Order", async () => {
    vi.useFakeTimers();
    try {
      const getOrder = vi.fn(async () => deliveredOrder);
      const client = commerceClient({ getOrder });
      const { result, unmount } = renderHook(() => commerce.useCoinsPurchaseFlow({
        client,
        sessionRef: "session-1",
        createIdempotencyKey: () => "create_intent_1",
        pollIntervalMs: 1_000
      }));
      await act(async () => {
        await result.current.openProduct("offer_basic");
        await result.current.previewCheckout();
        await result.current.confirmPurchase();
      });

      expect(getOrder).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(getOrder).toHaveBeenCalledTimes(1);
      expect(result.current.order).toEqual(deliveredOrder);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(getOrder).toHaveBeenCalledTimes(1);
      expect(client.cancelOrder).not.toHaveBeenCalled();
      expect(client.createOrder).toHaveBeenCalledTimes(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("ignores deferred detail from an earlier client and session generation", async () => {
    const pendingOffer = deferred<PortalCoinOffer>();
    const firstClient = commerceClient({
      getOffer: vi.fn(() => pendingOffer.promise)
    });
    const secondClient = commerceClient();
    const { result, rerender } = renderHook(
      ({ client, sessionRef }) => commerce.useCoinsPurchaseFlow({
        client,
        sessionRef
      }),
      {
        initialProps: {
          client: firstClient,
          sessionRef: "session-1"
        }
      }
    );

    let detailRequest!: Promise<void>;
    act(() => {
      detailRequest = result.current.openProduct("offer_basic");
    });
    rerender({ client: secondClient, sessionRef: "session-2" });
    expect(result.current.phase).toBe("idle");

    await act(async () => {
      pendingOffer.resolve(offer);
      await detailRequest;
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.offer).toBeNull();
  });

  test("persists only the Order reference and restores it through GET", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      })
    };
    const client = commerceClient();
    const first = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      createIdempotencyKey: () => "create_intent_1",
      storage
    }));
    await act(async () => {
      await first.result.current.openProduct("offer_basic");
      await first.result.current.previewCheckout();
      await first.result.current.confirmPurchase();
    });
    expect(storage.setItem).toHaveBeenCalledWith(
      commerce.PORTAL_COIN_ORDER_STORAGE_KEY,
      "{\"orderRef\":\"order_basic\"}"
    );
    first.unmount();

    const restoredClient = commerceClient({
      getOrder: vi.fn(async () => heldOrder)
    });
    const restored = renderHook(() => commerce.useCoinsPurchaseFlow({
      client: restoredClient,
      sessionRef: "session-1",
      storage
    }));
    await waitFor(() => {
      expect(restored.result.current.order).toEqual(heldOrder);
    });
    expect(restoredClient.getOrder).toHaveBeenCalledWith({
      sessionRef: "session-1",
      orderRef: "order_basic"
    });
    restored.unmount();
  });

  test.each(["quote_expired", "quote_stale"] as const)(
    "%s discards the Quote and requires a new preview",
    async (code) => {
      const client = commerceClient({
        createOrder: vi.fn(async () => {
          throw new commerce.PortalCoinCommerceClientError(code, false);
        })
      });
      const { result } = renderHook(() => commerce.useCoinsPurchaseFlow({
        client,
        sessionRef: "session-1",
        createIdempotencyKey: () => "create_intent_1"
      }));
      await act(async () => {
        await result.current.openProduct("offer_basic");
        await result.current.previewCheckout();
        await result.current.confirmPurchase();
      });

      expect(result.current.errorCode).toBe(code);
      expect(result.current.phase).toBe("detail");
      expect(result.current.quote).toBeNull();
    }
  );

  test.each([
    ["extra fields", "{\"orderRef\":\"order_basic\",\"sessionRef\":\"forbidden\"}"],
    [
      "custom prototype values",
      Object.assign(Object.create({ inherited: true }), {
        orderRef: "order_basic"
      })
    ]
  ])("discards stored Order recovery with %s", async (_label, storedValue) => {
    const storage = {
      getItem: vi.fn(() => storedValue as string),
      removeItem: vi.fn(),
      setItem: vi.fn()
    };
    const client = commerceClient();
    const hook = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      storage
    }));
    await waitFor(() => {
      expect(storage.removeItem).toHaveBeenCalledWith(
        commerce.PORTAL_COIN_ORDER_STORAGE_KEY
      );
    });
    expect(client.getOrder).not.toHaveBeenCalled();
    hook.unmount();
  });

  test.each([
    ["held", "not_requested", "reserved"],
    ["capture_pending", "not_requested", "settling"],
    ["captured", "pending", "delivering"],
    ["captured", "processing", "delivering"],
    ["captured", "delivered", "succeeded"],
    ["captured", "failed", "delivery_failed"],
    ["cancelled", "not_requested", "cancelled"],
    ["capture_failed", "not_requested", "capture_failed"],
    [
      "reconciliation_required",
      "not_requested",
      "reconciliation_required"
    ]
  ] as const)(
    "maps server %s/%s to %s without inventing transitions",
    (paymentStatus, fulfillmentStatus, expected) => {
      const order = {
        ...heldOrder,
        paymentStatus,
        fulfillment: fulfillmentStatus === "failed"
          ? {
              status: fulfillmentStatus,
              safeCode: "fulfillment_handler_failed"
            }
          : { status: fulfillmentStatus, safeCode: null }
      } as PortalCoinOrder;
      expect(commerce.portalCoinOrderUiState(order)).toBe(expected);
    }
  );

  test("reuses the cancel intent key after an uncertain transport result", async () => {
    const cancelOrder = vi.fn()
      .mockRejectedValueOnce(
        new commerce.PortalCoinCommerceClientError(
          "commerce_request_failed",
          true
        )
      )
      .mockResolvedValueOnce(cancelledOrder);
    const client = commerceClient({
      cancelOrder,
      getOrder: vi.fn(async () => cancelledOrder)
    });
    const cancelIdempotencyKey = vi.fn(() => "cancel_intent_retry");
    const { result, unmount } = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      createIdempotencyKey: () => "create_intent_1",
      cancelIdempotencyKey
    }));
    await act(async () => {
      await result.current.openProduct("offer_basic");
      await result.current.previewCheckout();
      await result.current.confirmPurchase();
      await result.current.cancelPurchase();
      await result.current.cancelPurchase();
    });
    expect(cancelOrder.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      "cancel_intent_retry",
      "cancel_intent_retry"
    ]);
    expect(cancelIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(result.current.order).toEqual(cancelledOrder);
    unmount();
  });

  test("reset invalidates state and drains a pending polling timer", async () => {
    vi.useFakeTimers();
    try {
      const client = commerceClient();
      const { result, unmount } = renderHook(() => commerce.useCoinsPurchaseFlow({
        client,
        sessionRef: "session-1",
        createIdempotencyKey: () => "create_intent_1",
        pollIntervalMs: 1_000
      }));
      await act(async () => {
        await result.current.openProduct("offer_basic");
        await result.current.previewCheckout();
        await result.current.confirmPurchase();
      });
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      act(() => {
        result.current.reset();
      });
      expect(result.current.phase).toBe("idle");
      expect(result.current.order).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(client.getOrder).not.toHaveBeenCalled();
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  test("unmount invalidates a deferred create before it can persist recovery state", async () => {
    const pendingOrder = deferred<PortalCoinOrder>();
    const storage = {
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn()
    };
    const client = commerceClient({
      createOrder: vi.fn(() => pendingOrder.promise)
    });
    const { result, unmount } = renderHook(() => commerce.useCoinsPurchaseFlow({
      client,
      sessionRef: "session-1",
      createIdempotencyKey: () => "create_intent_1",
      storage
    }));
    await act(async () => {
      await result.current.openProduct("offer_basic");
      await result.current.previewCheckout();
    });
    let createRequest!: Promise<void>;
    act(() => {
      createRequest = result.current.confirmPurchase();
    });
    unmount();
    pendingOrder.resolve(heldOrder);
    await createRequest;
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
