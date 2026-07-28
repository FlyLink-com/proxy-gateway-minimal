import { createElement } from "react";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PortalOrdersPanel,
  portalOrdersIdentityMatches
} from "../features/user-portal/orders/portal-orders-panel";
import type {
  PortalCoinCommerceClient,
  PortalCoinOrder
} from "../features/user-portal/commerce";
import { PortalCoinCommerceClientError } from "../features/user-portal/commerce";

afterEach(cleanup);

const ORDER: PortalCoinOrder = {
  orderRef: "order_consumption_001",
  offer: {
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
    acceptedCoinTypes: ["paid_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 50,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 500
    }
  },
  amountUnits: 20,
  allocation: [{ coinType: "paid_coins", amountUnits: 20 }],
  paymentStatus: "captured",
  cancelUntil: "2026-07-27T12:30:00.000Z",
  fulfillment: { status: "delivered", safeCode: null },
  createdAt: "2026-07-27T12:00:00.000Z",
  updatedAt: "2026-07-27T12:01:00.000Z"
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe("PortalOrdersPanel", () => {
  test("provides roving keyboard tabs with stable tabpanel relationships", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => createElement("p", null, "History")
    }));
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(tabs.map((tab) => [tab.id, tab.getAttribute("aria-controls")])).toEqual([
      ["portal-orders-all-tab", "portal-orders-all-panel"],
      ["portal-orders-coins-consumption-tab", "portal-orders-coins-consumption-panel"],
      ["portal-orders-coins-recharge-tab", "portal-orders-coins-recharge-panel"],
      ["portal-orders-historical-tab", "portal-orders-historical-panel"]
    ]);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "portal-orders-all-tab");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[3]).toHaveFocus();
    fireEvent.keyDown(tabs[3], { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[3]).toHaveFocus();
  });

  test("defines every scoped Orders color token used by the component styles", () => {
    const css = readFileSync("src/styles/portal-static-preserve/user-portal-commerce.css", "utf8");
    const used = [...css.matchAll(/var\((--portal-orders-[a-z-]+)\)/g)].map((match) => match[1]);
    const defined = new Set([...css.matchAll(/(--portal-orders-[a-z-]+)\s*:/g)].map((match) => match[1]));
    expect(new Set(used)).toEqual(defined);
    expect(css).not.toMatch(/\.portal-v2-shell \.portal-orders-[^{]+\{[^}]*var\(--portal-v2-/s);
  });

  test("rejects visible state produced by a different client, session, or generation", () => {
    const client = {} as PortalCoinCommerceClient;
    const identity = { commerceClient: client, sessionRef: "session_a", sessionGeneration: 1 };
    expect(portalOrdersIdentityMatches(identity, identity)).toBe(true);
    expect(portalOrdersIdentityMatches(identity, { ...identity, sessionRef: "session_b" })).toBe(false);
    expect(portalOrdersIdentityMatches(identity, { ...identity, sessionGeneration: 2 })).toBe(false);
    expect(portalOrdersIdentityMatches(identity, { ...identity, commerceClient: {} as PortalCoinCommerceClient })).toBe(false);
  });

  test("renders the localized filters and keeps all domains separately ordered", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => createElement("p", null, "Historical slot")
    }));

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All",
      "Coins Consumption Orders",
      "Coins Recharge Orders",
      "Historical Orders"
    ]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Coins consumption orders",
      "Coins recharge orders",
      "Historical orders"
    ]);
    expect(screen.getByText("Historical slot")).toBeInTheDocument();
  });

  test("loads bounded consumption pages, preserves server order, and opens a read-only detail", async () => {
    const olderOrder = { ...ORDER, orderRef: "order_consumption_002", createdAt: "2026-07-27T11:00:00.000Z" };
    const client = {
      listOrders: vi.fn()
        .mockResolvedValueOnce({
          orders: [ORDER],
          nextCursor: {
            afterCreatedAt: ORDER.createdAt,
            afterOrderRef: ORDER.orderRef
          }
        })
        .mockResolvedValueOnce({ orders: [olderOrder], nextCursor: null }),
      getOrder: vi.fn().mockResolvedValue(ORDER)
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_current",
      sessionGeneration: 7,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));

    await waitFor(() => expect(client.listOrders).toHaveBeenCalledWith({
      sessionRef: "session_current",
      limit: 25
    }));
    expect(await screen.findByRole("button", { name: "order_consumption_001" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    await waitFor(() => expect(client.listOrders).toHaveBeenLastCalledWith({
      sessionRef: "session_current",
      limit: 25,
      afterCreatedAt: "2026-07-27T12:00:00.000Z",
      afterOrderRef: "order_consumption_001"
    }));
    expect(screen.getAllByRole("button", { name: /order_consumption_00/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "order_consumption_001",
      "order_consumption_002"
    ]);

    fireEvent.click(screen.getByRole("button", { name: "order_consumption_001" }));
    await waitFor(() => expect(client.getOrder).toHaveBeenCalledWith({
      sessionRef: "session_current",
      orderRef: "order_consumption_001"
    }));
    expect(await screen.findByText("Payment: captured")).toBeInTheDocument();
    expect(screen.getByText("Fulfillment: delivered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel|pay|deliver/i })).toBeNull();
  });

  test("keeps recharge static and maps only the current session-invalid read to logout", async () => {
    const currentInvalid = vi.fn();
    const currentClient = {
      listOrders: vi.fn().mockRejectedValue(new PortalCoinCommerceClientError("commerce_session_invalid", false))
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: currentClient,
      sessionRef: "session_current",
      sessionGeneration: 4,
      onSessionInvalid: currentInvalid,
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(currentInvalid).toHaveBeenCalledTimes(1));

    const staticClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    const { unmount } = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: staticClient,
      sessionRef: "session_static",
      sessionGeneration: 5,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(staticClient.listOrders).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole("tab", { name: "Coins Recharge Orders" })[1]);
    expect(screen.getAllByText("Recharge order data source is not connected yet")).toHaveLength(2);
    expect(staticClient.listOrders).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("ignores a stale session-invalid rejection after the session changes", async () => {
    const oldRead = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const oldClient = {
      listOrders: vi.fn(() => oldRead.promise)
    } as unknown as PortalCoinCommerceClient;
    const newClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    const onSessionInvalid = vi.fn();
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: oldClient,
      sessionRef: "session_old",
      sessionGeneration: 10,
      onSessionInvalid,
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(oldClient.listOrders).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new",
      sessionGeneration: 11,
      onSessionInvalid,
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(newClient.listOrders).toHaveBeenCalledTimes(1));
    await act(async () => oldRead.reject(new PortalCoinCommerceClientError("commerce_session_invalid", false)));
    expect(onSessionInvalid).not.toHaveBeenCalled();
  });

  test("distinguishes empty, unavailable, and retryable errors without inventing recharge data", async () => {
    const unavailableClient = {
      listOrders: vi.fn()
        .mockRejectedValueOnce(new PortalCoinCommerceClientError("commerce_unavailable", true))
        .mockResolvedValueOnce({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    const unavailableView = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: unavailableClient,
      sessionRef: "session_unavailable",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    expect(await screen.findByText("Coins consumption orders are unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry consumption orders" }));
    expect(await screen.findByText("No Coins consumption orders.")).toBeInTheDocument();
    unavailableView.unmount();

    const errorClient = {
      listOrders: vi.fn().mockRejectedValue(new PortalCoinCommerceClientError("wallet_not_active", false))
    } as unknown as PortalCoinCommerceClient;
    const errorView = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: errorClient,
      sessionRef: "session_error",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    expect(await screen.findByText("Coins consumption orders could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry consumption orders" })).toBeNull();
    errorView.unmount();

    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 3,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    expect(await screen.findByText("Coins consumption orders are unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry consumption orders" })).toBeNull();
  });

  test("allows one in-flight cursor request and deduplicates its paired page", async () => {
    const nextPage = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const secondOrder = { ...ORDER, orderRef: "order_consumption_002", createdAt: "2026-07-27T11:00:00.000Z" };
    const client = {
      listOrders: vi.fn()
        .mockResolvedValueOnce({
          orders: [ORDER],
          nextCursor: { afterCreatedAt: ORDER.createdAt, afterOrderRef: ORDER.orderRef }
        })
        .mockImplementationOnce(() => nextPage.promise)
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_paged",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await screen.findByRole("button", { name: "order_consumption_001" });
    const more = screen.getByRole("button", { name: "Load more consumption orders" });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(client.listOrders).toHaveBeenCalledTimes(2);
    expect(client.listOrders).toHaveBeenLastCalledWith({
      sessionRef: "session_paged",
      limit: 25,
      afterCreatedAt: ORDER.createdAt,
      afterOrderRef: ORDER.orderRef
    });
    await act(async () => nextPage.resolve({ orders: [secondOrder], nextCursor: null }));
    expect(screen.getAllByRole("button", { name: /order_consumption_00/ })).toHaveLength(2);
  });

  test("ignores stale list and detail resolutions while only a current detail-invalid read logs out", async () => {
    const staleList = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const staleDetail = deferred<PortalCoinOrder>();
    const oldClient = {
      listOrders: vi.fn()
        .mockResolvedValueOnce({ orders: [ORDER], nextCursor: null })
        .mockImplementationOnce(() => staleList.promise),
      getOrder: vi.fn(() => staleDetail.promise)
    } as unknown as PortalCoinCommerceClient;
    const newClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null }),
      getOrder: vi.fn().mockRejectedValue(new PortalCoinCommerceClientError("commerce_session_invalid", false))
    } as unknown as PortalCoinCommerceClient;
    const onSessionInvalid = vi.fn();
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: oldClient,
      sessionRef: "session_old",
      sessionGeneration: 1,
      onSessionInvalid,
      renderHistoricalOrders: () => null
    }));
    await screen.findByRole("button", { name: "order_consumption_001" });
    fireEvent.click(screen.getByRole("button", { name: "order_consumption_001" }));
    await waitFor(() => expect(oldClient.getOrder).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new",
      sessionGeneration: 2,
      onSessionInvalid,
      renderHistoricalOrders: () => null
    }));
    await act(async () => {
      staleList.resolve({ orders: [ORDER], nextCursor: null });
      staleDetail.reject(new PortalCoinCommerceClientError("commerce_session_invalid", false));
    });
    expect(onSessionInvalid).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Coins Consumption Orders" }));
    await screen.findByText("No Coins consumption orders.");
    expect(screen.queryByRole("button", { name: "order_consumption_001" })).toBeNull();
  });

  test("logs out only when the current identity detail GET rejects as session invalid", async () => {
    const onSessionInvalid = vi.fn();
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null }),
      getOrder: vi.fn().mockRejectedValue(
        new PortalCoinCommerceClientError("commerce_session_invalid", false)
      )
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_current_detail",
      sessionGeneration: 3,
      onSessionInvalid,
      renderHistoricalOrders: () => null
    }));
    fireEvent.click(await screen.findByRole("button", { name: ORDER.orderRef }));
    await waitFor(() => expect(client.getOrder).toHaveBeenCalledWith({
      sessionRef: "session_current_detail",
      orderRef: ORDER.orderRef
    }));
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
  });

  test("ignores a successful old-detail resolution after the visible identity changes", async () => {
    const oldDetail = deferred<PortalCoinOrder>();
    const oldClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null }),
      getOrder: vi.fn(() => oldDetail.promise)
    } as unknown as PortalCoinCommerceClient;
    const newClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: oldClient,
      sessionRef: "session_old_detail",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    fireEvent.click(await screen.findByRole("button", { name: ORDER.orderRef }));
    await waitFor(() => expect(oldClient.getOrder).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new_detail",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await act(async () => oldDetail.resolve(ORDER));
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();
    expect(screen.queryByRole("button", { name: ORDER.orderRef })).toBeNull();
  });

  test("retries the selected detail GET only and ignores an old list resolution", async () => {
    const oldList = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const oldOnlyOrder = { ...ORDER, orderRef: "order_old_only" };
    const oldClient = {
      listOrders: vi.fn(() => oldList.promise)
    } as unknown as PortalCoinCommerceClient;
    const newerOrder = { ...ORDER, orderRef: "order_consumption_002" };
    const newClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER, newerOrder], nextCursor: null }),
      getOrder: vi.fn()
        .mockRejectedValueOnce(new PortalCoinCommerceClientError("commerce_unavailable", true))
        .mockResolvedValueOnce(newerOrder)
    } as unknown as PortalCoinCommerceClient;
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: oldClient,
      sessionRef: "session_old",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(oldClient.listOrders).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await screen.findByRole("button", { name: "order_consumption_002" });
    await act(async () => oldList.resolve({ orders: [oldOnlyOrder], nextCursor: null }));
    expect(screen.queryByRole("button", { name: "order_old_only" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "order_consumption_002" }));
    expect(await screen.findByText("Order detail is unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry order detail" }));
    await waitFor(() => expect(newClient.getOrder).toHaveBeenLastCalledWith({
      sessionRef: "session_new",
      orderRef: "order_consumption_002"
    }));
    expect(await screen.findByText("order_consumption_002", { selector: "h4" })).toBeInTheDocument();
  });

  test("keeps an in-flight read across a callback-only rerender and uses the latest committed callback", async () => {
    const initialRead = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    const client = {
      listOrders: vi.fn()
        .mockImplementationOnce(() => initialRead.promise)
        .mockRejectedValueOnce(new PortalCoinCommerceClientError("commerce_session_invalid", false))
    } as unknown as PortalCoinCommerceClient;
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_stable",
      sessionGeneration: 8,
      onSessionInvalid: firstCallback,
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(client.listOrders).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_stable",
      sessionGeneration: 8,
      onSessionInvalid: latestCallback,
      renderHistoricalOrders: () => null
    }));
    await act(async () => initialRead.resolve({ orders: [ORDER], nextCursor: null }));
    expect(await screen.findByRole("button", { name: "order_consumption_001" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Historical Orders" }));
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(latestCallback).toHaveBeenCalledTimes(1));
    expect(firstCallback).not.toHaveBeenCalled();
  });

  test("clears old detail immediately after a client, session, or generation change", async () => {
    const changedList = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const firstClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null }),
      getOrder: vi.fn().mockResolvedValue(ORDER)
    } as unknown as PortalCoinCommerceClient;
    const changedClient = {
      listOrders: vi.fn(() => changedList.promise)
    } as unknown as PortalCoinCommerceClient;
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: firstClient,
      sessionRef: "session_before",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await screen.findByRole("button", { name: "order_consumption_001" });
    fireEvent.click(screen.getByRole("button", { name: "order_consumption_001" }));
    expect(await screen.findByRole("region", { name: "Coins consumption order detail" })).toBeInTheDocument();
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: changedClient,
      sessionRef: "session_after",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();
  });

  test("rejects a duplicate cross-page ref and does not let an old same-cursor finalizer unlock the new request", async () => {
    const oldPage = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const newPage = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const page = {
      orders: [ORDER],
      nextCursor: { afterCreatedAt: ORDER.createdAt, afterOrderRef: ORDER.orderRef }
    };
    const oldClient = {
      listOrders: vi.fn().mockResolvedValueOnce(page).mockImplementationOnce(() => oldPage.promise)
    } as unknown as PortalCoinCommerceClient;
    const newClient = {
      listOrders: vi.fn().mockResolvedValueOnce(page).mockImplementationOnce(() => newPage.promise)
    } as unknown as PortalCoinCommerceClient;
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: oldClient,
      sessionRef: "session_same_cursor",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await screen.findByRole("button", { name: "order_consumption_001" });
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_same_cursor",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await waitFor(() => expect(newClient.listOrders).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    await act(async () => oldPage.resolve({ orders: [ORDER], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    expect(newClient.listOrders).toHaveBeenCalledTimes(2);
    await act(async () => newPage.resolve({ orders: [ORDER], nextCursor: null }));
    expect(await screen.findByText("Coins consumption orders could not be loaded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry consumption orders" }));
    await waitFor(() => expect(newClient.listOrders).toHaveBeenLastCalledWith({
      sessionRef: "session_same_cursor",
      limit: 25,
      afterCreatedAt: ORDER.createdAt,
      afterOrderRef: ORDER.orderRef
    }));
  });

  test("retains page one after a load-more failure and appends page two on the paired retry", async () => {
    const secondOrder = { ...ORDER, orderRef: "order_consumption_002", createdAt: "2026-07-27T11:00:00.000Z" };
    const cursor = { afterCreatedAt: ORDER.createdAt, afterOrderRef: ORDER.orderRef };
    const retryPage = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const client = {
      listOrders: vi.fn()
        .mockResolvedValueOnce({ orders: [ORDER], nextCursor: cursor })
        .mockRejectedValueOnce(new PortalCoinCommerceClientError("commerce_unavailable", true))
        .mockImplementationOnce(() => retryPage.promise)
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_retry_cursor",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      renderHistoricalOrders: () => null
    }));
    await screen.findByRole("button", { name: "order_consumption_001" });
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    expect(await screen.findByText("Coins consumption orders are unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "order_consumption_001" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more consumption orders" })).toBeNull();
    const retry = screen.getByRole("button", { name: "Retry consumption orders" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(client.listOrders).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(client.listOrders).toHaveBeenLastCalledWith({
      sessionRef: "session_retry_cursor",
      limit: 25,
      ...cursor
    }));
    await act(async () => retryPage.resolve({ orders: [secondOrder], nextCursor: null }));
    expect(await screen.findByRole("button", { name: "order_consumption_002" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "order_consumption_001" })).toBeInTheDocument();
  });
});
