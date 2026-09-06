import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PortalRechargeDialog,
  type PortalRechargeModel,
  type PortalRechargeOffer,
} from "../features/user-portal/recharge";

afterEach(cleanup);

function readyModel(offerCount: number, busy = false): PortalRechargeModel {
  const offers: PortalRechargeOffer[] = Array.from({ length: offerCount }, (_, index) => ({
    offerRef: `presentation_offer_${index + 1}`,
    quoteVersion: 1,
    paidCoinUnits: 137,
    amountMinor: 2599,
    currency: "USD",
    currencyExponent: 2,
    paymentMethods: ["alipay", "paypal"],
  }));
  return {
    available: true,
    dialogOpen: true,
    offers,
    offersState: { status: "ready" },
    activeOrder: null,
    busy,
    error: null,
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    retryOffers: vi.fn(),
    createOrder: vi.fn(async () => undefined),
    continueOrderPayment: vi.fn(() => "not_applicable" as const),
  };
}

describe.each(["zh", "en"] as const)("%s recharge card presentation", (locale) => {
  const zh = locale === "zh";

  test.each([1, 3])("labels %i server-priced offers without conflating Coins and money", (offerCount) => {
    const model = readyModel(offerCount);
    const originalOffers = structuredClone(model.offers);
    render(createElement(PortalRechargeDialog, { locale, model }));

    const list = screen.getByRole("list", {
      name: zh ? "Coins 充值档位" : "Coins recharge denominations",
    });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(offerCount);
    cards.forEach((card, index) => {
      expect(within(card).getByText(zh ? "到账 Coins" : "Coins to receive")).toBeVisible();
      expect(within(card).getByText("137 Coins")).toBeVisible();
      expect(within(card).getByText(zh ? "支付金额" : "Payment amount")).toBeVisible();
      expect(within(card).getByText("USD 25.99")).toBeVisible();
      expect(within(card).queryByText("USD 137.00")).toBeNull();
      expect(within(card).getByText(zh ? "支付宝" : "Alipay")).toBeVisible();
      expect(within(card).getByText("PayPal")).toBeVisible();
      expect(within(card).getByRole("button", {
        name: zh
          ? `创建订单并支付 137 Coins，USD 25.99，第 ${index + 1} 个档位`
          : `Create order and pay for 137 Coins, USD 25.99, option ${index + 1}`,
      })).toBeEnabled();
    });
    expect(model.createOrder).not.toHaveBeenCalled();

    fireEvent.click(within(cards[offerCount - 1]).getByRole("button"));
    expect(model.createOrder).toHaveBeenCalledExactlyOnceWith(`presentation_offer_${offerCount}`);
    expect(model.offers).toEqual(originalOffers);
    expect(model.continueOrderPayment).not.toHaveBeenCalled();
  });

  test("keeps every offer and close control disabled during order creation", () => {
    const model = readyModel(3, true);
    render(createElement(PortalRechargeDialog, { locale, model }));

    const cards = screen.getAllByRole("listitem");
    cards.forEach((card, index) => {
      expect(within(card).getByText(zh ? "到账 Coins" : "Coins to receive")).toBeVisible();
      const button = within(card).getByRole("button", {
        name: zh
          ? `正在创建订单：137 Coins，USD 25.99，第 ${index + 1} 个档位`
          : `Creating order for 137 Coins, USD 25.99, option ${index + 1}`,
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
      fireEvent.click(button);
    });
    const close = screen.getByRole("button", { name: zh ? "关闭" : "Close" });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    expect(model.createOrder).not.toHaveBeenCalled();
    expect(model.closeDialog).not.toHaveBeenCalled();
  });
});
