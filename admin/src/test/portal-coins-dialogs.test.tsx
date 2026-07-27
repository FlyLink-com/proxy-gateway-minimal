import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CoinsPurchaseDialog,
  ProductDetailDialog,
  type PortalCoinOffer,
  type PortalCoinOrder,
  type PortalCoinQuote
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

const insufficientQuote: PortalCoinQuote = {
  quoteRef: "quote_basic",
  offer,
  amountUnits: 15,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "insufficient_balance",
  shortfallUnits: 5,
  allocation: [],
  balances: {
    before: {
      bonusCoins: 0,
      paidCoins: 10,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 0,
      paidCoins: 10,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Portal Coins dialogs", () => {
  test("product detail is a labelled focus-contained modal with caller-owned close restoration", () => {
    const onPreview = vi.fn();
    const onRequestClose = vi.fn();
    const onRestoreFocus = vi.fn();
    const view = render(createElement(ProductDetailDialog, {
      locale: "en",
      offer,
      onPreview,
      onRequestClose,
      onRestoreFocus
    }));

    const dialog = screen.getByRole("dialog", { name: "Basic plan" });
    const title = within(dialog).getByRole("heading", {
      name: "Basic plan"
    });
    expect(title).toHaveFocus();
    expect(within(dialog).getByText("Basic summary")).toBeInTheDocument();
    expect(within(dialog).getByText(/30 days/)).toBeInTheDocument();
    expect(within(dialog).getByText(/100 GB/)).toBeInTheDocument();

    const buttons = within(dialog).getAllByRole("button");
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(buttons.at(-1)).toHaveFocus();
    buttons.at(-1)?.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(buttons[0]).toHaveFocus();
    buttons[0].focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(buttons.at(-1)).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onPreview).not.toHaveBeenCalled();
    view.unmount();
    expect(onRestoreFocus).toHaveBeenCalledTimes(1);
  });

  test("Escape is consumed at the modal boundary whether or not close is enabled", () => {
    const ancestorKeyDown = vi.fn();
    const onRequestClose = vi.fn();
    const product = render(createElement(
      "div",
      { onKeyDown: ancestorKeyDown },
      createElement(ProductDetailDialog, {
        locale: "en",
        offer,
        onPreview: vi.fn(),
        onRequestClose
      })
    ));
    const productDialog = screen.getByRole("dialog", { name: "Basic plan" });
    expect(fireEvent.keyDown(productDialog, { key: "Escape" })).toBe(false);
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(ancestorKeyDown).not.toHaveBeenCalled();
    product.unmount();

    const lockedAncestorKeyDown = vi.fn();
    const lockedClose = vi.fn();
    const onCancel = vi.fn();
    render(createElement(
      "div",
      { onKeyDown: lockedAncestorKeyDown },
      createElement(CoinsPurchaseDialog, {
        locale: "en",
        quote: insufficientQuote,
        order: heldOrder,
        submitting: false,
        cancelling: false,
        errorCode: null,
        onConfirm: vi.fn(),
        onCancel,
        onRefresh: vi.fn(),
        onOpenRecharge: vi.fn(),
        onRequestClose: lockedClose
      })
    ));
    const lockedDialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(fireEvent.keyDown(lockedDialog, { key: "Escape" })).toBe(false);
    expect(lockedClose).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(lockedAncestorKeyDown).not.toHaveBeenCalled();
  });

  test("insufficient confirmation shows server facts, disables confirm, and delegates recharge", () => {
    const onConfirm = vi.fn();
    const onOpenRecharge = vi.fn();
    const onRequestClose = vi.fn();
    render(createElement(CoinsPurchaseDialog, {
      locale: "en",
      quote: insufficientQuote,
      order: null,
      submitting: false,
      cancelling: false,
      errorCode: null,
      onConfirm,
      onCancel: vi.fn(),
      onRefresh: vi.fn(),
      onOpenRecharge,
      onRequestClose
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(within(dialog).getByText("Basic plan")).toBeInTheDocument();
    expect(within(dialog).getByText("15 Coins")).toBeInTheDocument();
    expect(within(dialog).getByText("Allocation").parentElement)
      .toHaveTextContent("AllocationNone");
    expect(within(dialog).getByText(/Before: 10/)).toBeInTheDocument();
    expect(within(dialog).getByText(/After: 10/)).toBeInTheDocument();
    expect(within(dialog).getByText("Availability").parentElement)
      .toHaveTextContent("AvailabilityInsufficient balance");
    expect(within(dialog).getByText(/Shortfall: 5 Coins/)).toBeInTheDocument();
    expect(within(dialog).getByText(
      "2026-07-27T20:00:00.000Z"
    )).toBeInTheDocument();

    const confirm = within(dialog).getByRole("button", {
      name: "Confirm purchase"
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Open recharge"
    }));
    expect(onOpenRecharge).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  test("submitting Order marks the dialog busy and locks Close and Escape", () => {
    const onRequestClose = vi.fn();
    render(createElement(CoinsPurchaseDialog, {
      locale: "en",
      quote: {
        ...insufficientQuote,
        purchaseAvailability: "available",
        shortfallUnits: 0,
        allocation: [{ coinType: "paid_coins", amountUnits: 15 }],
        balances: {
          before: { ...insufficientQuote.balances.before, paidCoins: 20 },
          after: {
            ...insufficientQuote.balances.after,
            paidCoins: 5,
            heldCoins: 15
          }
        }
      },
      order: null,
      submitting: true,
      cancelling: false,
      errorCode: null,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      onRefresh: vi.fn(),
      onOpenRecharge: vi.fn(),
      onRequestClose
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByRole("button", {
      name: "Close"
    })).toBeDisabled();
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  test.each([
    ["en", "Allocation", "None", /Before: 10/, /After: 10/],
    ["zh", "分配", "无", /之前: 10/, /之后: 10/]
  ] as const)(
    "server-valid insufficient Quote renders empty allocation in %s",
    (locale, allocationLabel, emptyLabel, beforeText, afterText) => {
      const validInsufficientQuote: PortalCoinQuote = {
        ...insufficientQuote,
        allocation: [],
        balances: {
          before: { ...insufficientQuote.balances.before },
          after: { ...insufficientQuote.balances.before }
        }
      };
      render(createElement(CoinsPurchaseDialog, {
        locale,
        quote: validInsufficientQuote,
        order: null,
        submitting: false,
        cancelling: false,
        errorCode: null,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        onRefresh: vi.fn(),
        onOpenRecharge: vi.fn(),
        onRequestClose: vi.fn()
      }));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(allocationLabel).parentElement)
        .toHaveTextContent(`${allocationLabel}${emptyLabel} · 0 Coins`);
      expect(within(dialog).getByText(beforeText)).toBeInTheDocument();
      expect(within(dialog).getByText(afterText)).toBeInTheDocument();
      expect(within(dialog).getByText(
        locale === "zh" ? "缺少" : "Shortfall"
      ).parentElement).toHaveTextContent("5 Coins");
    }
  );

  test("order refresh or cancel rejection is announced as a safe alert", () => {
    render(createElement(CoinsPurchaseDialog, {
      locale: "en",
      quote: insufficientQuote,
      order: heldOrder,
      submitting: false,
      cancelling: false,
      errorCode: "commerce_unavailable",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      onRefresh: vi.fn(),
      onOpenRecharge: vi.fn(),
      onRequestClose: vi.fn()
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Unable to refresh the Order. Retry safely."
    );
  });

  test("held status is polite, reduced-motion safe, cancellable, and Escape never cancels", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    })));
    const onCancel = vi.fn();
    const onRequestClose = vi.fn();
    render(createElement(CoinsPurchaseDialog, {
      locale: "en",
      quote: insufficientQuote,
      order: heldOrder,
      submitting: false,
      cancelling: false,
      errorCode: null,
      onConfirm: vi.fn(),
      onCancel,
      onRefresh: vi.fn(),
      onOpenRecharge: vi.fn(),
      onRequestClose
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    const status = within(dialog).getByText("Coins reserved");
    expect(status).toHaveAttribute("aria-live", "polite");
    const spinner = dialog.querySelector(".portal-coins-status-spinner");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).toHaveAttribute("data-motion", "reduced");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Cancel Order"
    }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
