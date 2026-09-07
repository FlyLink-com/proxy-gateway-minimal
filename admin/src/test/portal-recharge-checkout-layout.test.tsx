import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as recharge from "../features/user-portal/recharge";
import type { PortalRechargeModel, PortalRechargeOrder } from "../features/user-portal/recharge";

afterEach(cleanup);

function model(order: PortalRechargeOrder | null = null): PortalRechargeModel {
  return { available: true, dialogOpen: true, offersState: { status: "ready" },
    offers: [10, 30, 50, 100, 200, 300].map(units => ({ offerRef: `layout_coins_${units}`,
      quoteVersion: 1, paidCoinUnits: units, amountMinor: units * 100, currency: "CNY",
      currencyExponent: 2, paymentMethods: ["alipay"] })),
    activeOrder: order, busy: false, error: null, openDialog: vi.fn(), closeDialog: vi.fn(),
    retryOffers: vi.fn(), createOrder: vi.fn(async () => undefined),
    continueOrderPayment: vi.fn(() => "redirected" as const), retryCreateOrder: vi.fn(async () => undefined) };
}
function order(status: PortalRechargeOrder["status"] = "entry_ready"): PortalRechargeOrder {
  return { orderRef: "layout_payment_order_long_private_reference_001", offerRef: "layout_coins_30",
    quoteVersion: 1, expectedPaidCoinUnits: 30, amountMinor: 3000, currency: "CNY", currencyExponent: 2,
    adapterKey: "xsd_v1", paymentMethod: "alipay", status, providerOrderRef: null,
    nextAction: { type: "redirect", url: "https://checkout.example.test/synthetic", expiresAt: "2030-01-01T00:00:00.000Z" },
    walletOperationRef: null, walletLotRef: null, expiresAt: "2030-01-01T00:00:00.000Z",
    createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z" };
}

describe("shared recharge offers", () => {
  test("removes only compact Alipay-only chips while retaining the named payment action", () => {
    const current = model();
    const { rerender } = render(<recharge.PortalRechargeOffers compact locale="zh" model={current} />);
    expect(screen.queryAllByText("支付宝", { exact: true })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /^支付宝支付/ })).toHaveLength(6);
    rerender(<recharge.PortalRechargeOffers locale="zh" model={current} />);
    expect(screen.getAllByText("支付宝", { exact: true })).toHaveLength(6);
  });
  test("preserves multi-method and non-Alipay method information in compact cards", () => {
    const current = model();
    current.offers[0].paymentMethods = ["alipay", "wechat_pay"];
    current.offers[1].paymentMethods = ["paypal"];
    render(<recharge.PortalRechargeOffers compact locale="en" model={current} />);
    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Alipay", { exact: true })).toBeVisible();
    expect(within(cards[0]).getByText("WeChat Pay", { exact: true })).toBeVisible();
    expect(within(cards[1]).getByText("PayPal", { exact: true })).toBeVisible();
    expect(within(cards[0]).getByRole("button")).toHaveTextContent("Create order and pay");
    expect(within(cards[1]).getByRole("button")).toHaveTextContent("Create order and pay");
  });
  test("renders the six server denominations inline and delegates selection without creating twice", () => {
    const current = model(); const onChoose = vi.fn();
    render(<recharge.PortalRechargeOffers locale="zh" model={current} onChoose={onChoose} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(6);
    const button = within(cards[1]).getByRole("button", { name: "支付宝支付 30 Coins，CNY 30.00，第 2 个档位" });
    expect(button).toHaveTextContent("支付宝支付");
    expect(button.querySelector("img")).toHaveAttribute("src", "/payment-alipay-icon.png");
    fireEvent.click(button);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("layout_coins_30");
    expect(current.createOrder).not.toHaveBeenCalled();
  });
  test("keeps default model dispatch and generic labels for multi-method offers", () => {
    const current = model(); current.offers[0].paymentMethods = ["alipay", "wechat_pay"];
    render(<recharge.PortalRechargeOffers locale="zh" model={current} />);
    const first = screen.getAllByRole("listitem")[0];
    const button = within(first).getByRole("button");
    expect(button).toHaveTextContent("创建订单并支付");
    expect(button.querySelector("img")).toBeNull();
    fireEvent.click(button);
    expect(current.createOrder).toHaveBeenCalledExactlyOnceWith("layout_coins_10");
  });
  test("cannot start another denomination while the original create result is unresolved", () => {
    const current = { ...model(), unresolvedCreateOfferRef: "layout_coins_30", error: "create_unknown" as const };
    render(<recharge.PortalRechargeOffers locale="zh" model={current} />);
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  test("all inline payment buttons remain disabled and announce busy while creating", () => {
    const current = { ...model(), busy: true };
    render(<recharge.PortalRechargeOffers locale="zh" model={current} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled(); expect(button).toHaveAttribute("aria-busy", "true"); fireEvent.click(button);
    }
    expect(current.createOrder).not.toHaveBeenCalled();
  });
});

describe("compact recharge checkout", () => {
  test("shows the payment amount, Coins product and exact handoff copy with the order reference collapsed", () => {
    const active = order(); const current = model(active);
    render(<recharge.PortalRechargeDialog locale="zh" model={current} />);
    expect(screen.getByText("CNY 30.00")).toHaveClass("portal-recharge-checkout__amount");
    expect(screen.getByText("30 Coins")).toBeVisible();
    expect(screen.getByText("即将跳转支付页面")).toBeVisible();
    expect(screen.queryByText(/第三方收银台/)).toBeNull();
    expect(screen.queryByText(active.orderRef)).toBeNull();
    const reveal = screen.getByRole("button", { name: "查看订单号" });
    expect(reveal).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(reveal);
    expect(screen.getByText(active.orderRef)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收起订单号" }));
    expect(screen.queryByText(active.orderRef)).toBeNull();
  });
  test("continues the exact existing Alipay order without creating or settling an order", () => {
    const active = order(); const current = model(active);
    render(<recharge.PortalRechargeDialog locale="zh" model={current} />);
    const pay = screen.getByRole("button", { name: "支付宝支付，继续本次充值" });
    expect(pay).toHaveTextContent("支付宝支付");
    expect(pay.querySelector("img")).toHaveAttribute("src", "/payment-alipay-icon.png");
    expect(current.continueOrderPayment).not.toHaveBeenCalled();
    fireEvent.click(pay);
    expect(current.continueOrderPayment).toHaveBeenCalledExactlyOnceWith(active);
    expect(current.createOrder).not.toHaveBeenCalled();
  });
  test("busy keeps both existing-order payment and close controls disabled", () => {
    const current = { ...model(order()), busy: true };
    render(<recharge.PortalRechargeDialog locale="zh" model={current} />);
    const pay = screen.getByRole("button", { name: "支付宝支付，继续本次充值" });
    expect(pay).toBeDisabled();
    expect(pay).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
    fireEvent.click(pay);
    expect(current.continueOrderPayment).not.toHaveBeenCalled();
    expect(current.createOrder).not.toHaveBeenCalled();
  });
  test.each(["created", "pending", "payment_verified", "credited", "failed_no_charge", "reconciliation_required", "expired"] as const)(
    "%s never presents a payment CTA", status => {
      render(<recharge.PortalRechargeDialog locale="zh" model={model(order(status))} />);
      expect(screen.queryByRole("button", { name: /继续支付|支付宝支付/ })).toBeNull();
    });
  test("expired redirect deadlines and missing next actions cannot continue payment", () => {
    const active = order(); active.nextAction = { ...active.nextAction!, expiresAt: "2020-01-01T00:00:00.000Z" };
    const { rerender } = render(<recharge.PortalRechargeDialog locale="zh" model={model(active)} />);
    expect(screen.queryByRole("button", { name: /继续支付|支付宝支付/ })).toBeNull();
    rerender(<recharge.PortalRechargeDialog locale="zh" model={model({ ...order(), nextAction: null })} />);
    expect(screen.queryByRole("button", { name: /继续支付|支付宝支付/ })).toBeNull();
  });
  test("shows only the chosen denomination while an inline order is being created", () => {
    const current = { ...model(), busy: true };
    const selectedOffer = current.offers[1];
    render(<recharge.PortalRechargeDialog locale="zh" model={current} selectedOffer={selectedOffer} />);
    expect(screen.getByRole("dialog")).toHaveClass("portal-recharge-dialog--checkout");
    expect(screen.getByText(`${selectedOffer.paidCoinUnits} Coins`)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("正在创建充值订单");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: /支付宝支付|继续支付/ })).toBeNull();
    expect(current.createOrder).not.toHaveBeenCalled();
  });
  test("preserves unknown-create recovery without new offers or payment actions", () => {
    const current = { ...model(), unresolvedCreateOfferRef: "layout_coins_30", error: "create_unknown" as const };
    render(<recharge.PortalRechargeDialog locale="zh" model={current} />);
    expect(screen.getByRole("alert")).toHaveTextContent("不要重新创建或重复支付");
    fireEvent.click(screen.getByRole("button", { name: "确认本次充值订单" }));
    expect(current.retryCreateOrder).toHaveBeenCalledOnce();
    expect(current.createOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
