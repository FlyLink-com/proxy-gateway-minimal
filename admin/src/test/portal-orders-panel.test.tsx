import { createElement, Fragment, useLayoutEffect, useState } from "react";
import { readFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PortalOrdersPanel as PortalOrdersPanelComponent,
  portalOrdersIdentityMatches,
  type PortalOrdersPanelProps
} from "../features/user-portal/orders/portal-orders-panel";
import {
  buildPortalOrderCenterItems,
  orderCenterStatusForCoin,
  orderCenterStatusForPayment,
  orderCenterStatusForService,
  type PortalServiceOrder
} from "../features/user-portal/orders/portal-order-center-model";
import type {
  PortalCoinCommerceClient,
  PortalCoinOrder
} from "../features/user-portal/commerce";
import { PortalCoinCommerceClientError } from "../features/user-portal/commerce";
import type {
  PortalPaymentOrder,
  PortalSubscriptionRequest
} from "../features/user-portal/user-portal-client";

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
    baseCoinUnits: 20,
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

const PAYMENT_ORDER: PortalPaymentOrder = {
  accessRequestRef: "access_request_001",
  accessRequestStatus: "subscription_ready",
  amountMinor: 2_000,
  channel: "alipay",
  checkoutUrl: "https://example.test/checkout/pay_001",
  createdAt: "2026-07-27T13:00:00.000Z",
  currency: "CNY",
  orderRef: "pay_001",
  paidAt: "2026-07-27T13:01:00.000Z",
  paymentExpiresAt: "2026-07-27T13:30:00.000Z",
  planId: "monthly_basic",
  planLabel: "基础月付",
  providerOrderRef: "provider_pay_001",
  qrCode: "https://example.test/qr/pay_001",
  status: "payment_failed",
  urlScheme: "alipay://pay_001",
  safety: {
    noRawMerchantKey: true,
    noRawProviderPayload: true
  }
};

const SERVICE_REQUEST: PortalSubscriptionRequest = {
  status: "subscription_ready",
  lifecycle: "active",
  requestRef: "service_request_001",
  userRef: "user_001",
  planId: "monthly_basic",
  clientTarget: "clash",
  expiresAt: "2026-08-27T14:00:00.000Z",
  durationDays: 30,
  quantity: 1,
  subscriptionUrl: "https://example.test/subscription/service_001",
  usage: {
    uploadBytes: 0,
    downloadBytes: 0,
    usedBytes: 0,
    totalBytes: 50 * 1024 ** 3,
    usageRatio: 0,
    status: "within_limit",
    collectionStatus: "measured_zero",
    channelCount: 1,
    measuredChannelCount: 1,
    updatedAt: "2026-07-27T14:00:00.000Z"
  },
  nextAction: "copy_subscription_url",
  updatedAt: "2026-07-27T14:00:00.000Z",
  safety: {
    noAdminApi: true,
    noDbMutation: true,
    noPaymentActivation: true,
    noPublicAdmin: true,
    noRawCustomerDataReturned: true
  }
};

const SERVICE_ORDER: PortalServiceOrder = {
  requestRef: "service_request_001",
  request: SERVICE_REQUEST,
  createdAt: "2026-07-27T14:00:00.000Z",
  planId: "monthly_basic" as const,
  durationDays: 30,
  quantity: 1,
  clientTarget: "clash" as const,
  status: "active" as const,
  expiresAt: "2026-08-27T14:00:00.000Z",
  subscriptionUrl: "https://example.test/subscription/service_001"
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

function installMobileViewport() {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia
    });
  };
}

type DirectPanelProps = Pick<
  PortalOrdersPanelProps,
  "locale" | "commerceClient" | "sessionRef" | "sessionGeneration" | "onSessionInvalid"
> & Partial<Omit<
  PortalOrdersPanelProps,
  "locale" | "commerceClient" | "sessionRef" | "sessionGeneration" | "onSessionInvalid"
>>;

function PortalOrdersPanel(props: DirectPanelProps) {
  return createElement(PortalOrdersPanelComponent, {
    legacyPaymentOrders: [],
    serviceOrders: [],
    selectedServiceOrderRef: null,
    orderSearch: "",
    onOrderSearchChange: () => undefined,
    onOpenServiceOrder: () => undefined,
    onOpenMarketplace: () => undefined,
    ...props
  });
}

function CommitPhaseAction({
  action,
  armed
}: {
  action: () => void;
  armed: boolean;
}) {
  useLayoutEffect(() => {
    if (armed) action();
  }, [action, armed]);
  return null;
}

function ordersThemeTokens(css: string, theme: "dark" | "light") {
  const selector = `.portal-v2-shell[data-portal-theme="${theme}"] .portal-orders-panel`;
  const block = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  expect(block, `missing explicit ${theme} Orders token block`).not.toBeNull();
  return new Map(
    [...(block?.[1] ?? "").matchAll(/(--portal-orders-[a-z-]+)\s*:\s*([^;]+);/g)]
      .map((match) => [match[1], match[2].trim()])
  );
}

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/../g);
  if (!channels || channels.length !== 3) throw new Error(`Expected six-digit hex color, received ${hex}`);
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

describe("PortalOrdersPanel", () => {
  test.each([
    [
      "captured delivered Coins order",
      "successful",
      () => orderCenterStatusForCoin(ORDER)
    ],
    [
      "held Coins order",
      "in_progress",
      () => orderCenterStatusForCoin({
        ...ORDER,
        orderRef: "order_consumption_held",
        paymentStatus: "held",
        fulfillment: { status: "not_requested", safeCode: null }
      })
    ],
    [
      "failed legacy payment",
      "attention",
      () => orderCenterStatusForPayment(PAYMENT_ORDER)
    ],
    [
      "active service order",
      "successful",
      () => orderCenterStatusForService(SERVICE_ORDER)
    ],
    [
      "expired service order",
      "closed",
      () => orderCenterStatusForService({
        ...SERVICE_ORDER,
        request: {
          ...SERVICE_REQUEST,
          lifecycle: "expired",
          status: "subscription_disabled"
        },
        status: "expired"
      })
    ],
    [
      "runtime-unknown Coins payment status",
      "attention",
      () => orderCenterStatusForCoin({
        ...ORDER,
        orderRef: "order_consumption_unknown",
        paymentStatus: "historical_unknown_status"
      } as unknown as PortalCoinOrder)
    ],
    [
      "unknown legacy payment status",
      "attention",
      () => orderCenterStatusForPayment({
        ...PAYMENT_ORDER,
        orderRef: "pay_unknown",
        status: "historical_unknown_status"
      })
    ]
  ])("maps complete source DTO %s to %s", (_description, expected, actual) => {
    expect(actual()).toBe(expected);
  });

  test("builds domain-prefixed, newest-first items without collapsing source records", () => {
    const items = buildPortalOrderCenterItems({
      coinOrders: [ORDER],
      legacyPaymentOrders: [PAYMENT_ORDER],
      serviceOrders: [SERVICE_ORDER]
    });

    expect(items.map((item) => ({
      kind: item.kind,
      key: item.key,
      createdAt: item.createdAt,
      status: item.status
    }))).toEqual([
      {
        kind: "service_access",
        key: "service_access:service_request_001",
        createdAt: "2026-07-27T14:00:00.000Z",
        status: "successful"
      },
      {
        kind: "legacy_payment",
        key: "legacy_payment:pay_001",
        createdAt: "2026-07-27T13:00:00.000Z",
        status: "attention"
      },
      {
        kind: "coins_consumption",
        key: "coins_consumption:order_consumption_001",
        createdAt: "2026-07-27T12:00:00.000Z",
        status: "successful"
      }
    ]);
    expect(items[0].source).toBe(SERVICE_ORDER);
    expect(items[1].source).toBe(PAYMENT_ORDER);
    expect(items[2].source).toBe(ORDER);
  });

  test("uses one button group for the visible Orders type filters", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "zh",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
    }));
    const filters = screen.getByRole("group", { name: "订单类型" });
    const buttons = within(filters).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "全部",
      "商城消费",
      "套餐与服务"
    ]);
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false"
    ]);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Coins 消费订单" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Coins 充值订单" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "历史订单" })).toBeNull();
  });

  test("keeps the labelled Orders search contract while composing the frozen Empty and Filled field", () => {
    const onOrderSearchChange = vi.fn();
    const props: DirectPanelProps = {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      orderSearch: "",
      onOrderSearchChange
    };
    const view = render(PortalOrdersPanel(props));

    const input = screen.getByRole("textbox", { name: "Search orders" });
    expect(input).not.toHaveAttribute("role", "searchbox");
    const field = input.parentElement;
    expect(field).toHaveClass("portal-order-search-field");
    expect(field?.tagName).toBe("SPAN");
    expect(field).toHaveAttribute("data-state", "empty");
    const icon = field?.firstElementChild;
    expect(icon?.tagName).toBe("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    fireEvent.change(input, { target: { value: "order_001" } });
    expect(onOrderSearchChange).toHaveBeenCalledWith("order_001");

    view.rerender(PortalOrdersPanel({
      ...props,
      orderSearch: "order_001"
    }));
    expect(screen.getByRole("textbox", {
      name: "Search orders"
    }).parentElement).toHaveAttribute("data-state", "filled");
  });

  test("defines every scoped Orders color token used by the component styles", () => {
    const css = readFileSync("src/styles/portal-static-preserve/user-portal-commerce.css", "utf8");
    const used = [...css.matchAll(/var\((--portal-orders-[a-z-]+)\)/g)].map((match) => match[1]);
    const usedTokens = new Set(used);
    for (const theme of ["dark", "light"] as const) {
      const themeTokens = ordersThemeTokens(css, theme);
      expect(new Set(themeTokens.keys())).toEqual(usedTokens);
      expect(contrastRatio(
        themeTokens.get("--portal-orders-accent") ?? "",
        themeTokens.get("--portal-orders-on-accent") ?? ""
      )).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(
        themeTokens.get("--portal-orders-focus") ?? "",
        themeTokens.get("--portal-orders-surface") ?? ""
      )).toBeGreaterThanOrEqual(3);
    }
    expect(css).not.toMatch(/\.portal-v2-shell \.portal-orders-[^{]+\{[^}]*var\(--portal-v2-/s);
  });

  test("keeps the desktop empty row spanning the table and restores the mobile card layout", () => {
    const css = readFileSync("src/styles/portal-static-preserve/user-portal-commerce.css", "utf8");
    expect(css).toMatch(
      /\.portal-v2-shell \.portal-orders-panel td\.portal-order-empty-state\s*\{[^}]*display:\s*table-cell;/s
    );
    expect(css).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.portal-v2-shell \.portal-orders-panel td\.portal-order-empty-state\s*\{[^}]*display:\s*block;/s
    );
    expect(css).toMatch(
      /@media \(min-width:\s*721px\)\s*\{[\s\S]*?\.portal-order-table-wrap\[data-empty="true"\]\s*\{[^}]*overflow-x:\s*hidden;/s
    );
    expect(css).toMatch(
      /\.portal-order-table-wrap\[data-empty="true"\]\s+\.portal-order-table\s*\{[^}]*min-width:\s*100%;/s
    );
  });

  test("themes the Orders search input and every unified status badge", () => {
    const css = readFileSync("src/styles/portal-static-preserve/user-portal-commerce.css", "utf8");
    expect(css).toMatch(
      /\.portal-v2-shell \.portal-orders-panel \.portal-order-search-input\s*\{[^}]*background:\s*var\(--portal-orders-surface\);[^}]*color:\s*var\(--portal-orders-text\);/s
    );
    expect(css).toMatch(
      /\.portal-v2-shell \.portal-orders-panel \.portal-order-search-input::placeholder\s*\{[^}]*color:\s*var\(--portal-orders-muted\);/s
    );
    expect(css).toMatch(
      /\.portal-v2-shell \.portal-orders-panel \.portal-order-search-input:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--portal-orders-focus\);/s
    );
    for (const status of ["in_progress", "successful", "attention", "closed"]) {
      expect(css).toMatch(
        new RegExp(`\\.portal-v2-shell \\.portal-orders-panel \\.portal-order-status\\.${status}\\s*\\{[^}]*var\\(--portal-orders-${status.replace("_", "-")}-`, "s")
      );
    }
  });

  test("exposes product and user-facing payment and fulfillment context in each consumption order button name", async () => {
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_accessible_order",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
    }));

    expect(await screen.findByRole("button", {
      name: /order_consumption_001.*Monthly 50 GB.*Payment complete.*Delivered/i
    })).toBeInTheDocument();
  });

  test("labels processing fulfillment as delivery in progress", async () => {
    const processingOrder: PortalCoinOrder = {
      ...ORDER,
      orderRef: "order_consumption_processing",
      fulfillment: { status: "processing", safeCode: null }
    };
    const client = {
      listOrders: vi.fn().mockResolvedValue({
        orders: [processingOrder],
        nextCursor: null
      })
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_processing_order",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn()
    }));

    expect(await screen.findByRole("button", {
      name: /order_consumption_processing.*Payment complete.*Delivering/i
    })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Orders" }))
      .queryByText("Needs attention")).toBeNull();
  });

  test("gives every order action unique context and links expanded details", async () => {
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null }),
      getOrder: vi.fn().mockResolvedValue(ORDER)
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_accessible_details",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [PAYMENT_ORDER],
      serviceOrders: [SERVICE_ORDER]
    }));

    const table = screen.getByRole("table", { name: "Orders" });
    within(table).getAllByRole("columnheader").forEach((header) => {
      expect(header).toHaveAttribute("scope", "col");
    });
    expect(within(table).getByRole("button", {
      name: /View.*pay_001.*Basic monthly.*Payment failed/i
    })).toBeInTheDocument();
    const serviceAction = within(table).getByRole("button", {
      name: /View.*service_request_001.*Monthly basic.*Active/i
    });
    expect(serviceAction).toHaveAttribute("aria-expanded", "false");
    expect(serviceAction).not.toHaveAttribute("aria-controls");
    const legacyAction = within(table).getByRole("button", {
      name: /View.*pay_001.*Basic monthly.*Payment failed/i
    });
    expect(legacyAction).toHaveAttribute("aria-expanded", "false");
    expect(legacyAction).not.toHaveAttribute("aria-controls");

    const coinsAction = await within(table).findByRole("button", {
      name: /order_consumption_001.*Monthly 50 GB/i
    });
    expect(coinsAction).toHaveAttribute("aria-expanded", "false");
    expect(coinsAction).not.toHaveAttribute("aria-controls");
    fireEvent.click(coinsAction);

    const detail = await screen.findByRole("region", {
      name: "Coins consumption order detail"
    });
    const detailId = coinsAction.getAttribute("aria-controls");
    expect(detailId).toBeTruthy();
    expect(coinsAction).toHaveAttribute("aria-expanded", "true");
    expect(detail).toHaveAttribute("id", detailId);
    expect(document.querySelectorAll(".portal-order-detail-row")).toHaveLength(1);

    fireEvent.click(coinsAction);

    expect(coinsAction).toHaveAttribute("aria-expanded", "false");
    expect(coinsAction).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("region", {
      name: "Coins consumption order detail"
    })).toBeNull();
    expect(client.getOrder).toHaveBeenCalledTimes(1);
  });

  test("keeps a pending legacy payment inside Orders as a collapsible read-only detail", () => {
    const pendingPaymentOrder: PortalPaymentOrder = {
      ...PAYMENT_ORDER,
      orderRef: "pay_pending_001",
      status: "pending_payment",
      paidAt: undefined
    };
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [pendingPaymentOrder]
    }));

    const table = screen.getByRole("table", { name: "Orders" });
    const action = within(table).getByRole("button", {
      name: /View.*pay_pending_001.*Basic monthly.*Pending payment/i
    });
    expect(action).toHaveAttribute("aria-expanded", "false");
    expect(action).not.toHaveAttribute("aria-controls");
    expect(within(table).queryByRole("button", { name: /Pay now/i })).toBeNull();

    fireEvent.click(action);

    const detail = screen.getByRole("region", {
      name: /Plan payment details: P-pending_001/i
    });
    const detailId = action.getAttribute("aria-controls");
    expect(detailId).toBeTruthy();
    expect(action).toHaveAttribute("aria-expanded", "true");
    expect(detail).toHaveAttribute("id", detailId);
    expect(within(detail).getByText("Pending payment")).toBeInTheDocument();

    fireEvent.click(action);

    expect(action).toHaveAttribute("aria-expanded", "false");
    expect(action).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("region", {
      name: /Plan payment details: P-pending_001/i
    })).toBeNull();
  });

  test("does not restore a previously selected service after legacy detail closes", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: "session_single_detail",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [PAYMENT_ORDER],
      serviceOrders: [SERVICE_ORDER],
      selectedServiceOrderRef: SERVICE_ORDER.requestRef
    }));

    expect(screen.getByRole("region", {
      name: /Service record details:/i
    })).toBeInTheDocument();
    const legacyAction = screen.getByRole("button", {
      name: /View.*pay_001.*Basic monthly.*Payment failed/i
    });
    fireEvent.click(legacyAction);
    expect(screen.getByRole("region", {
      name: /Plan payment details: P-001/i
    })).toBeInTheDocument();
    expect(screen.queryByRole("region", {
      name: /Service record details:/i
    })).toBeNull();

    fireEvent.click(legacyAction);

    expect(document.querySelectorAll(".portal-order-detail-row")).toHaveLength(0);
    expect(legacyAction).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", {
      name: /View.*service_request_001.*Monthly basic.*Active/i
    })).toHaveAttribute("aria-expanded", "false");
  });

  test("exposes the scrollable Orders table as a named keyboard-focusable region", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [PAYMENT_ORDER]
    }));

    const scrollRegion = screen.getByRole("region", {
      name: "Scrollable orders table"
    });
    expect(scrollRegion).toHaveAttribute("tabindex", "0");
    expect(within(scrollRegion).getByRole("table", { name: "Orders" })).toBeInTheDocument();
  });

  test("does not add a table-scroll focus stop to the mobile card layout", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 720
    });
    try {
      render(createElement(PortalOrdersPanel, {
        locale: "en",
        commerceClient: null,
        sessionRef: null,
        sessionGeneration: 1,
        onSessionInvalid: vi.fn(),
        legacyPaymentOrders: [PAYMENT_ORDER]
      }));

      const wrapper = document.querySelector(".portal-order-table-wrap");
      expect(wrapper).not.toBeNull();
      expect(wrapper).not.toHaveAttribute("role");
      expect(wrapper).not.toHaveAttribute("aria-label");
      expect(wrapper).not.toHaveAttribute("tabindex");
      expect(screen.queryByRole("region", {
        name: "Scrollable orders table"
      })).toBeNull();
    } finally {
      cleanup();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth
      });
    }
  });

  test("keeps accessible action names unique when displayed service refs share a prefix", async () => {
    const secondServiceOrder: PortalServiceOrder = {
      ...SERVICE_ORDER,
      requestRef: "service_request_002"
    };
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_unique_service_refs",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      serviceOrders: [SERVICE_ORDER, secondServiceOrder]
    }));

    const table = await screen.findByRole("table", { name: "Orders" });
    const first = within(table).getByRole("button", {
      name: /View.*service_request_001.*Monthly basic.*Active/i
    });
    const second = within(table).getByRole("button", {
      name: /View.*service_request_002.*Monthly basic.*Active/i
    });
    expect(first).not.toHaveAccessibleName(second.getAttribute("aria-label") ?? "");
  });

  test("does not announce an empty result while the Coins source is loading", () => {
    const pending = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const client = {
      listOrders: vi.fn(() => pending.promise)
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_loading_orders",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn()
    }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Marketplace orders…"
    );
    expect(screen.queryByText("No matching orders")).toBeNull();
    expect(screen.queryByText("No Coins consumption orders.")).toBeNull();
  });

  test("switches from a Coins detail to the selected service in the single detail surface", async () => {
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null }),
      getOrder: vi.fn().mockResolvedValue(ORDER)
    } as unknown as PortalCoinCommerceClient;

    function Harness() {
      const [selectedServiceOrderRef, setSelectedServiceOrderRef] = useState<string | null>(null);
      return createElement(PortalOrdersPanelComponent, {
        locale: "en",
        commerceClient: client,
        sessionRef: "session_switch_detail",
        sessionGeneration: 1,
        onSessionInvalid: vi.fn(),
        legacyPaymentOrders: [],
        serviceOrders: [SERVICE_ORDER],
        selectedServiceOrderRef,
        orderSearch: "",
        onOrderSearchChange: () => undefined,
        onOpenServiceOrder: (order) => setSelectedServiceOrderRef(order.requestRef),
        onOpenMarketplace: () => undefined
      });
    }

    render(createElement(Harness));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(ORDER.orderRef) }));
    expect(await screen.findByRole("region", { name: "Coins consumption order detail" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: /View.*service_request_001.*Monthly basic.*Active/i
    }));
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();
    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(document.querySelectorAll(".portal-order-detail-row")).toHaveLength(1);
  });

  test("invalidates an in-flight Coins detail before switching to a service detail", async () => {
    const staleDetail = deferred<PortalCoinOrder>();
    const onSessionInvalid = vi.fn();
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [ORDER], nextCursor: null }),
      getOrder: vi.fn(() => staleDetail.promise)
    } as unknown as PortalCoinCommerceClient;

    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_switch_stale_detail",
      sessionGeneration: 1,
      onSessionInvalid,
      serviceOrders: [SERVICE_ORDER]
    }));

    fireEvent.click(await screen.findByRole("button", {
      name: new RegExp(ORDER.orderRef)
    }));
    await waitFor(() => expect(client.getOrder).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", {
      name: /View.*service_request_001.*Monthly basic.*Active/i
    }));
    expect(screen.getByText("Client")).toBeInTheDocument();

    await act(async () => {
      staleDetail.reject(new PortalCoinCommerceClientError(
        "commerce_session_invalid",
        false
      ));
      await Promise.resolve();
    });

    expect(onSessionInvalid).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", {
      name: "Coins consumption order detail"
    })).toBeNull();
    expect(screen.getByText("Client")).toBeInTheDocument();
  });

  test("turns the empty Orders table into a recoverable next step", async () => {
    const onOpenMarketplace = vi.fn();
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_empty_plans",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      onOpenMarketplace
    }));

    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    const tableWrap = document.querySelector(".portal-order-table-wrap");
    expect(tableWrap).not.toBeNull();
    expect(tableWrap).toHaveAttribute("data-empty", "true");
    expect(tableWrap).not.toHaveAttribute("role");
    expect(tableWrap).not.toHaveAttribute("tabindex");
    expect(screen.getAllByRole("button", {
      name: "Go to Marketplace"
    })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Go to Marketplace" }));
    expect(onOpenMarketplace).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Plans and services" }));

    expect(screen.getByText("No matching orders")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
  });

  test("keeps focus inside Orders when loading resolves to the desktop empty state", async () => {
    const list = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const client = {
      listOrders: vi.fn(() => list.promise)
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_empty_focus",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn()
    }));

    const loadingMarketplaceButton = screen.getByRole("button", {
      name: "Go to Marketplace"
    });
    loadingMarketplaceButton.focus();
    expect(document.activeElement).toBe(loadingMarketplaceButton);

    await act(async () => {
      list.resolve({ orders: [], nextCursor: null });
      await list.promise;
    });

    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", {
      name: "Go to Marketplace"
    }));
  });

  test("returns focus to the stable toolbar action when the desktop empty state gains an order", async () => {
    const client = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    const baseProps = {
      locale: "en" as const,
      commerceClient: client,
      sessionRef: "session_empty_focus_return",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn()
    };
    const { rerender } = render(createElement(PortalOrdersPanel, baseProps));

    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    const emptyMarketplaceButton = screen.getByRole("button", {
      name: "Go to Marketplace"
    });
    emptyMarketplaceButton.focus();
    expect(document.activeElement).toBe(emptyMarketplaceButton);

    rerender(createElement(PortalOrdersPanel, {
      ...baseProps,
      serviceOrders: [SERVICE_ORDER]
    }));

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", {
        name: "Go to Marketplace"
      }));
    });
    expect(screen.getByText("Monthly basic")).toBeInTheDocument();
  });

  test("preserves the legacy Orders empty state on mobile", async () => {
    const restoreViewport = installMobileViewport();
    try {
      const client = {
        listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
      } as unknown as PortalCoinCommerceClient;
      render(createElement(PortalOrdersPanel, {
        locale: "en",
        commerceClient: client,
        sessionRef: "session_empty_mobile",
        sessionGeneration: 1,
        onSessionInvalid: vi.fn()
      }));

      expect(await screen.findByText("No Coins consumption orders.")).toBeInTheDocument();
      expect(screen.queryByText("No orders yet")).toBeNull();
      expect(screen.getAllByRole("button", {
        name: "Go to Marketplace"
      })).toHaveLength(1);
      const tableWrap = document.querySelector(".portal-order-table-wrap");
      expect(tableWrap).not.toBeNull();
      expect(tableWrap).not.toHaveAttribute("data-empty");
      expect(tableWrap).not.toHaveAttribute("role");
      expect(tableWrap).not.toHaveAttribute("tabindex");
    } finally {
      restoreViewport();
    }
  });

  test("keeps legacy and service rows when the Coins source is unavailable", async () => {
    const client = {
      listOrders: vi.fn().mockRejectedValue(
        new PortalCoinCommerceClientError("commerce_unavailable", true)
      )
    } as unknown as PortalCoinCommerceClient;
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_partial_orders",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [PAYMENT_ORDER],
      serviceOrders: [SERVICE_ORDER]
    }));

    expect(await screen.findByText("Some Marketplace orders are temporarily unavailable")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Orders" });
    expect(within(table).getAllByText("Plan payment")).toHaveLength(1);
    expect(within(table).getAllByText("Service record")).toHaveLength(1);
  });

  test("formats a legacy amount with the currency from its DTO", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [{
        ...PAYMENT_ORDER,
        orderRef: "pay_usd_001",
        currency: "USD",
        amountMinor: 1_234
      }]
    }));

    expect(within(screen.getByRole("table", { name: "Orders" })).getByText("USD 12.34"))
      .toBeInTheDocument();
    expect(screen.queryByText("CNY 12.34")).toBeNull();
  });

  test("derives English legacy plan names from planId when planLabel is missing or Chinese", () => {
    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [
        {
          ...PAYMENT_ORDER,
          orderRef: "pay_without_label",
          planId: "monthly_basic",
          planLabel: undefined
        },
        {
          ...PAYMENT_ORDER,
          orderRef: "pay_chinese_default_label",
          planId: "monthly_plus",
          planLabel: "标准月付"
        }
      ]
    }));

    const table = within(screen.getByRole("table", { name: "Orders" }));
    expect(table.getByText("Basic monthly")).toBeInTheDocument();
    expect(table.getByText("Standard monthly")).toBeInTheDocument();
    expect(table.queryByText("基础月付")).toBeNull();
    expect(table.queryByText("标准月付")).toBeNull();
  });

  test("invalidates old list and detail reads before a new identity passive effect can run", async () => {
    const oldAppend = deferred<{ orders: PortalCoinOrder[]; nextCursor: null }>();
    const oldDetail = deferred<PortalCoinOrder>();
    const cursor = { afterCreatedAt: ORDER.createdAt, afterOrderRef: ORDER.orderRef };
    const oldClient = {
      listOrders: vi.fn()
        .mockResolvedValueOnce({ orders: [ORDER], nextCursor: cursor })
        .mockImplementationOnce(() => oldAppend.promise),
      getOrder: vi.fn(() => oldDetail.promise)
    } as unknown as PortalCoinCommerceClient;
    const newClient = {
      listOrders: vi.fn().mockResolvedValue({ orders: [], nextCursor: null })
    } as unknown as PortalCoinCommerceClient;
    const onSessionInvalid = vi.fn();
    const identityCommitted = deferred<void>();
    const commitAction = () => {
      const invalid = new PortalCoinCommerceClientError("commerce_session_invalid", false);
      oldAppend.reject(invalid);
      oldDetail.reject(invalid);
      identityCommitted.resolve();
    };
    const renderPanel = (current: "old" | "new") => createElement(Fragment, null,
      createElement(PortalOrdersPanel, {
        locale: "en",
        commerceClient: current === "old" ? oldClient : newClient,
        sessionRef: current === "old" ? "session_commit_old" : "session_commit_new",
        sessionGeneration: current === "old" ? 1 : 2,
        onSessionInvalid,
      }),
      createElement(CommitPhaseAction, {
        action: commitAction,
        armed: current === "new"
      })
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const actEnvironment = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
    try {
      await act(async () => root.render(renderPanel("old")));
      const panel = within(container);
      fireEvent.click(await panel.findByRole("button", { name: new RegExp(ORDER.orderRef) }));
      fireEvent.click(panel.getByRole("button", { name: "Load more consumption orders" }));
      await waitFor(() => {
        expect(oldClient.getOrder).toHaveBeenCalledTimes(1);
        expect(oldClient.listOrders).toHaveBeenCalledTimes(2);
      });

      actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      root.render(renderPanel("new"));
      await identityCommitted.promise;
      await Promise.resolve();

      expect(onSessionInvalid).not.toHaveBeenCalled();
      expect(panel.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
      await act(async () => root.unmount());
      container.remove();
    }
  });

  test("rejects visible state produced by a different client, session, or generation", () => {
    const client = {} as PortalCoinCommerceClient;
    const identity = { commerceClient: client, sessionRef: "session_a", sessionGeneration: 1 };
    expect(portalOrdersIdentityMatches(identity, identity)).toBe(true);
    expect(portalOrdersIdentityMatches(identity, { ...identity, sessionRef: "session_b" })).toBe(false);
    expect(portalOrdersIdentityMatches(identity, { ...identity, sessionGeneration: 2 })).toBe(false);
    expect(portalOrdersIdentityMatches(identity, { ...identity, commerceClient: {} as PortalCoinCommerceClient })).toBe(false);
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
    }));

    await waitFor(() => expect(client.listOrders).toHaveBeenCalledWith({
      sessionRef: "session_current",
      limit: 25
    }));
    expect(await screen.findByRole("button", { name: /order_consumption_001/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    await waitFor(() => expect(client.listOrders).toHaveBeenLastCalledWith({
      sessionRef: "session_current",
      limit: 25,
      afterCreatedAt: "2026-07-27T12:00:00.000Z",
      afterOrderRef: "order_consumption_001"
    }));
    expect(screen.getAllByRole("button", { name: /order_consumption_00/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /order_consumption_001/ }));
    await waitFor(() => expect(client.getOrder).toHaveBeenCalledWith({
      sessionRef: "session_current",
      orderRef: "order_consumption_001"
    }));
    expect(await screen.findByText("Payment complete")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.queryByText("captured")).toBeNull();
    expect(screen.queryByText("delivered")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(cancel|pay|deliver)\b/i })).toBeNull();
  });

  test("maps only the current session-invalid read to logout without exposing recharge placeholders", async () => {
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
    }));
    await waitFor(() => expect(currentInvalid).toHaveBeenCalledTimes(1));

    expect(screen.queryByText("Recharge order data source is not connected yet")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
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
    }));
    await waitFor(() => expect(oldClient.listOrders).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new",
      sessionGeneration: 11,
      onSessionInvalid,
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
    }));
    expect(await screen.findByText("Some Marketplace orders are temporarily unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry consumption orders" }));
    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
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
    }));
    expect(await screen.findByText("Some Marketplace orders are temporarily unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry consumption orders" })).toBeNull();
    errorView.unmount();

    render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: null,
      sessionGeneration: 3,
      onSessionInvalid: vi.fn(),
    }));
    expect(await screen.findByText("Some Marketplace orders are temporarily unavailable")).toBeInTheDocument();
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
    }));
    await screen.findByRole("button", { name: /order_consumption_001/ });
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
    }));
    await screen.findByRole("button", { name: /order_consumption_001/ });
    fireEvent.click(screen.getByRole("button", { name: /order_consumption_001/ }));
    await waitFor(() => expect(oldClient.getOrder).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new",
      sessionGeneration: 2,
      onSessionInvalid,
    }));
    await act(async () => {
      staleList.resolve({ orders: [ORDER], nextCursor: null });
      staleDetail.reject(new PortalCoinCommerceClientError("commerce_session_invalid", false));
    });
    expect(onSessionInvalid).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Marketplace purchases" }));
    await screen.findByText("No matching orders");
    expect(screen.queryByRole("button", { name: /order_consumption_001/ })).toBeNull();
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
    }));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(ORDER.orderRef) }));
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
    }));
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(ORDER.orderRef) }));
    await waitFor(() => expect(oldClient.getOrder).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new_detail",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
    }));
    await act(async () => oldDetail.resolve(ORDER));
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(ORDER.orderRef) })).toBeNull();
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
    }));
    await waitFor(() => expect(oldClient.listOrders).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_new",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
    }));
    await screen.findByRole("button", { name: /order_consumption_002/ });
    await act(async () => oldList.resolve({ orders: [oldOnlyOrder], nextCursor: null }));
    expect(screen.queryByRole("button", { name: /order_old_only/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /order_consumption_002/ }));
    expect(await screen.findByText("Order detail is unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry order detail" }));
    await waitFor(() => expect(newClient.getOrder).toHaveBeenLastCalledWith({
      sessionRef: "session_new",
      orderRef: "order_consumption_002"
    }));
    expect(await screen.findByText(/order_consumption_002/, {
      selector: ".portal-order-detail__title"
    }))
      .toBeInTheDocument();
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
    }));
    await waitFor(() => expect(client.listOrders).toHaveBeenCalledTimes(1));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: client,
      sessionRef: "session_stable",
      sessionGeneration: 8,
      onSessionInvalid: latestCallback,
    }));
    await act(async () => initialRead.resolve({ orders: [ORDER], nextCursor: null }));
    expect(await screen.findByRole("button", { name: /order_consumption_001/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Plans and services" }));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
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
    }));
    await screen.findByRole("button", { name: /order_consumption_001/ });
    fireEvent.click(screen.getByRole("button", { name: /order_consumption_001/ }));
    expect(await screen.findByRole("region", { name: "Coins consumption order detail" })).toBeInTheDocument();
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: changedClient,
      sessionRef: "session_after",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
    }));
    expect(screen.queryByRole("region", { name: "Coins consumption order detail" })).toBeNull();
  });

  test("clears an expanded legacy detail when the Portal identity changes", () => {
    const view = render(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: "session_legacy_before",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [PAYMENT_ORDER]
    }));
    fireEvent.click(screen.getByRole("button", {
      name: /View.*pay_001.*Basic monthly.*Payment failed/i
    }));
    expect(screen.getByRole("region", {
      name: /Plan payment details: P-001/i
    })).toBeInTheDocument();

    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: null,
      sessionRef: "session_legacy_after",
      sessionGeneration: 2,
      onSessionInvalid: vi.fn(),
      legacyPaymentOrders: [PAYMENT_ORDER]
    }));

    expect(screen.queryByRole("region", {
      name: /Plan payment details: P-001/i
    })).toBeNull();
    expect(screen.getByRole("button", {
      name: /View.*pay_001.*Basic monthly.*Payment failed/i
    })).toHaveAttribute("aria-expanded", "false");
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
    }));
    await screen.findByRole("button", { name: /order_consumption_001/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    view.rerender(createElement(PortalOrdersPanel, {
      locale: "en",
      commerceClient: newClient,
      sessionRef: "session_same_cursor",
      sessionGeneration: 1,
      onSessionInvalid: vi.fn(),
    }));
    await waitFor(() => expect(newClient.listOrders).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    await act(async () => oldPage.resolve({ orders: [ORDER], nextCursor: null }));
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    expect(newClient.listOrders).toHaveBeenCalledTimes(2);
    await act(async () => newPage.resolve({ orders: [ORDER], nextCursor: null }));
    expect(await screen.findByText("Some Marketplace orders are temporarily unavailable")).toBeInTheDocument();
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
    }));
    await screen.findByRole("button", { name: /order_consumption_001/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more consumption orders" }));
    expect(await screen.findByText("Some Marketplace orders are temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /order_consumption_001/ })).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: /order_consumption_002/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /order_consumption_001/ })).toBeInTheDocument();
  });
});
