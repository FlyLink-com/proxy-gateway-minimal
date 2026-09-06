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
import {
  CoinsPaymentStatusCard
} from "../features/user-portal/commerce/components/coins-payment-status-card";
import type {
  PortalCoinOrderUiState
} from "../features/user-portal/commerce/use-coins-purchase-flow";

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
  baseCoinUnits: 15,
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
  test("removes the unfinished-order explanation when the resumed order completes", () => {
    const props = {
      locale: "en" as const,
      quote: null,
      order: heldOrder,
      submitting: false,
      cancelling: false,
      resumingExistingOrder: true,
      errorCode: null,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      onRefresh: vi.fn(),
      onRequestClose: vi.fn()
    };
    const view = render(createElement(CoinsPurchaseDialog, props));
    expect(screen.getByRole("status")).toHaveTextContent("You have an unfinished order.");
    view.rerender(createElement(CoinsPurchaseDialog, {
      ...props,
      order: {
        ...heldOrder,
        paymentStatus: "captured",
        fulfillment: { status: "delivered", safeCode: null }
      }
    }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Purchase complete. Your service is active."))
      .toBeInTheDocument();
  });

  test.each([
    ["zh", "取消期限已结束，无法再取消此订单，请刷新订单查看进度。"],
    ["en", "This order can no longer be cancelled. Refresh it to check its progress."]
  ] as const)("explains a closed cancellation window in %s without claiming a refresh failure", (locale, message) => {
    render(createElement(CoinsPaymentStatusCard, {
      locale,
      order: heldOrder,
      cancelling: false,
      errorCode: "cancel_window_closed",
      onCancel: vi.fn(),
      onRefresh: vi.fn()
    }));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/安全重试|Retry safely|无法刷新|Unable to refresh/);
  });

  test.each([
    "fulfillment_attempt_limit",
    "fulfillment_handler_failed",
    "fulfillment_handler_unavailable",
    "fulfillment_result_invalid"
  ] as const)("presents %s as an incomplete service, not an internal handler failure or success", (safeCode) => {
    render(createElement(CoinsPaymentStatusCard, {
      locale: "zh",
      order: {
        ...heldOrder,
        paymentStatus: "captured",
        fulfillment: { status: "failed", safeCode }
      },
      cancelling: false,
      errorCode: null,
      onCancel: vi.fn(),
      onRefresh: vi.fn()
    }));
    const card = screen.getByRole("region", { name: "Coins 订单状态" });
    expect(card).toHaveTextContent("本次服务开通结果尚未确认，请联系支持");
    expect(card).not.toHaveTextContent(/服务暂未开通|尚未发放|无法发放|交付|处理失败|结果无效|次数已达|handler|fulfillment_|购买完成|购买成功/);
  });

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
    expect(within(dialog).getByText("Purchased Coins, Reward Coins"))
      .toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(
      /paid_coins|bonus_coins|reward_coins|held_coins/
    );

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

  test("Escape is consumed at the modal boundary and follows the visible Close action", () => {
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
    const orderClose = vi.fn();
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
        onRequestClose: orderClose
      })
    ));
    const orderDialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(within(orderDialog).getByRole("button", { name: "Close" }))
      .toBeEnabled();
    expect(fireEvent.keyDown(orderDialog, { key: "Escape" })).toBe(false);
    expect(orderClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(lockedAncestorKeyDown).not.toHaveBeenCalled();
  });

  test("insufficient confirmation shows server facts and disables confirm without a recharge path", () => {
    const onConfirm = vi.fn();
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
    const expiry = dialog.querySelector("time");
    expect(expiry).toHaveAttribute("dateTime", "2026-07-27T20:00:00.000Z");
    expect(expiry).not.toHaveTextContent("2026-07-27T20:00:00.000Z");
    expect(dialog).toHaveTextContent("Purchased Coins");
    expect(dialog).toHaveTextContent("Bonus Coins");
    expect(dialog).toHaveTextContent("Reward Coins");
    expect(dialog).toHaveTextContent("Held Coins");
    expect(dialog).not.toHaveTextContent(
      /paid_coins|bonus_coins|reward_coins|held_coins/
    );

    const confirm = within(dialog).getByRole("button", {
      name: "Confirm purchase"
    });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("button", {
      name: "Open recharge"
    })).not.toBeInTheDocument();
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

  test("cancelling marks the dialog busy, announces progress, and locks duplicate actions", () => {
    const onCancel = vi.fn();
    const onRefresh = vi.fn();
    const onRequestClose = vi.fn();
    render(createElement(CoinsPurchaseDialog, {
      locale: "en",
      quote: insufficientQuote,
      order: heldOrder,
      submitting: false,
      cancelling: true,
      errorCode: null,
      onConfirm: vi.fn(),
      onCancel,
      onRefresh,
      onRequestClose
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByText("Cancelling the Order…"))
      .toHaveAttribute("aria-live", "polite");
    expect(within(dialog).queryByRole("button", { name: "Cancel Order" }))
      .toBeNull();
    expect(within(dialog).getByRole("button", { name: "Refresh Order" }))
      .toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close" }))
      .toBeDisabled();
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
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
      onRequestClose: vi.fn()
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "The Marketplace is temporarily unavailable. Try again later."
    );
  });

  test("held status is polite, reduced-motion safe, cancellable, and Escape only closes", () => {
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
      onRequestClose
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    const status = within(dialog).getByText("Coins reserved");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.parentElement).toHaveClass(
      "portal-coins-payment-status__status"
    );
    const spinner = dialog.querySelector<HTMLElement>(
      ".portal-coins-status-spinner"
    );
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).toHaveAttribute("data-motion", "reduced");
    expect(spinner?.tagName).toBe("svg");
    expect(spinner).toHaveClass("lucide-loader-circle");
    expect(status.parentElement).toContainElement(spinner);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Cancel Order"
    }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("uses the frozen pending indicator, terminal marker, and action availability for all eight order states", () => {
    const stateCases = {
      reserved: {
        order: heldOrder,
        pending: true
      },
      settling: {
        order: { ...heldOrder, paymentStatus: "capture_pending" },
        pending: true
      },
      delivering: {
        order: {
          ...heldOrder,
          paymentStatus: "captured",
          fulfillment: { status: "pending", safeCode: null }
        },
        pending: true
      },
      succeeded: {
        order: {
          ...heldOrder,
          paymentStatus: "captured",
          fulfillment: { status: "delivered", safeCode: null }
        },
        pending: false
      },
      delivery_failed: {
        order: {
          ...heldOrder,
          paymentStatus: "captured",
          fulfillment: {
            status: "failed",
            safeCode: "fulfillment_handler_failed"
          }
        },
        pending: false
      },
      cancelled: {
        order: { ...heldOrder, paymentStatus: "cancelled" },
        pending: false
      },
      capture_failed: {
        order: { ...heldOrder, paymentStatus: "capture_failed" },
        pending: false
      },
      reconciliation_required: {
        order: {
          ...heldOrder,
          paymentStatus: "reconciliation_required"
        },
        pending: false
      }
    } satisfies Record<
      PortalCoinOrderUiState,
      { order: PortalCoinOrder; pending: boolean }
    >;

    Object.entries(stateCases).forEach(([
      expectedState,
      { order, pending }
    ]) => {
      const view = render(createElement(CoinsPaymentStatusCard, {
        cancelling: false,
        errorCode: null,
        locale: "en",
        onCancel: vi.fn(),
        onRefresh: vi.fn(),
        order
      }));
      const card = screen.getByRole("region", {
        name: "Coins Order status"
      });
      expect(card).toHaveClass(
        `portal-coins-payment-status--${expectedState}`
      );
      expect(card.querySelector(".portal-coins-payment-status__status"))
        .toBeInTheDocument();
      const spinner = card.querySelector(".portal-coins-status-spinner");
      const marker = card.querySelector(".portal-coins-status-marker");
      if (pending) {
        expect(spinner).toBeInTheDocument();
        expect(spinner).toHaveClass("lucide-loader-circle");
        expect(marker).not.toBeInTheDocument();
      } else {
        expect(spinner).not.toBeInTheDocument();
        expect(marker).toBeInTheDocument();
        expect(marker).toHaveClass("lucide-circle");
        expect(marker).toHaveAttribute("fill", "none");
      }
      const cancel = within(card).queryByRole("button", {
        name: "Cancel Order"
      });
      if (expectedState === "reserved") {
        expect(cancel).toBeInTheDocument();
        expect(cancel).toHaveClass(
          "portal-coins-payment-status__action--quiet"
        );
      } else {
        expect(cancel).not.toBeInTheDocument();
      }
      expect(within(card).getByRole("button", {
        name: "Refresh Order"
      })).toHaveClass(
        "portal-coins-payment-status__action--secondary"
      );
      view.unmount();
    });
  });
});
