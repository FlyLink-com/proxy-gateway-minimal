import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, test, vi } from "vitest";
import { PortalWalletPanel } from "../features/user-portal/wallet/portal-wallet-panel";
import type { PortalWalletReadModel } from "../features/user-portal/wallet/use-portal-wallet-read-model";
import type { PortalRechargeModel } from "../features/user-portal/recharge";

afterEach(cleanup);

const wallet: PortalWalletReadModel = {
  summary: { phase: "ready", value: {
    status: "active", version: 1,
    balances: { paidCoins: 120, bonusCoins: 30, rewardCoins: 5 },
    spendableUnits: 155, heldUnits: 9, pendingUnits: 4,
  } },
  ledger: { phase: "empty", value: [] },
  nextLedgerCursor: null, loadingMoreLedger: false, loadMoreLedgerError: null,
  retrySummary: vi.fn(), retryLedger: vi.fn(), refreshWallet: vi.fn(), loadMoreLedger: vi.fn(),
};

function recharge(overrides: Partial<PortalRechargeModel> = {}): PortalRechargeModel {
  return {
    available: true, dialogOpen: false, activeOrder: null, busy: false, error: null,
    offersState: { status: "ready" },
    offers: [10, 30, 50, 100, 200, 300].map((units) => ({
      offerRef: `layout_offer_${units}`, quoteVersion: 1, paidCoinUnits: units,
      amountMinor: units * 100, currency: "CNY", currencyExponent: 2,
      paymentMethods: ["alipay"],
    })),
    openDialog: vi.fn(), closeDialog: vi.fn(), retryOffers: vi.fn(),
    createOrder: vi.fn(async () => undefined),
    continueOrderPayment: vi.fn(() => "not_applicable" as const),
    ...overrides,
  };
}

test.each(["zh", "en"] as const)("%s wallet keeps balance, recharge, activity and guide in four ordered regions", (locale) => {
  const model = recharge();
  render(createElement(PortalWalletPanel, { locale, model: wallet, rechargeModel: model }));
  const zh = locale === "zh";
  expect(screen.queryByRole("heading", { name: zh ? "钱包总览" : "Wallet overview" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const offers = screen.getByRole("list", { name: zh ? "Coins 充值档位" : "Coins recharge denominations" });
  const cards = within(offers).getAllByRole("listitem");
  expect(cards).toHaveLength(6);
  expect(within(offers).queryAllByText(zh ? "到账 Coins" : "Coins to receive")).toHaveLength(0);
  expect(within(offers).queryAllByText(zh ? "支付金额" : "Payment amount")).toHaveLength(0);
  expect(within(cards[2]).getByText("50 Coins")).toBeInTheDocument();
  expect(within(cards[2]).getByText("CNY 50.00")).toBeInTheDocument();
  const balance = screen.getByRole("region", { name: zh ? "余额" : "Balance" });
  expect(within(balance).queryByRole("heading")).not.toBeInTheDocument();
  expect(within(balance).queryByRole("button", { name: zh ? "刷新钱包" : "Refresh Wallet" })).not.toBeInTheDocument();
  expect(within(balance).queryByText(zh ? "正常" : "Active")).not.toBeInTheDocument();
  expect(within(offers).queryAllByText(zh ? "支付宝" : "Alipay", { exact: true })).toHaveLength(0);
  expect(within(cards[2]).getByRole("button")).toHaveTextContent(zh ? "支付宝支付" : "Pay with Alipay");
  expect(balance.compareDocumentPosition(offers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const amounts = balance.querySelector(".portal-wallet-balance-grid");
  expect(amounts?.children).toHaveLength(5);
  expect(amounts?.firstElementChild).toHaveClass("portal-wallet-balance-grid__spendable");
  expect(amounts?.firstElementChild).toHaveTextContent("155");
  expect(amounts?.children[1]).toHaveTextContent("120");
  expect(amounts?.children[2]).toHaveTextContent("30");
  expect(amounts?.children[3]).toHaveTextContent("5");
  expect(amounts?.children[4]).toHaveTextContent(zh ? "订单预留9" : "Order reserved9");
  expect(balance.querySelector(".portal-wallet-status-grid")).toHaveTextContent(zh ? "待确认奖励4" : "Pending rewards4");
  const activity = screen.getByRole("region", { name: zh ? "近期账变明细" : "Recent Wallet activity" });
  const guide = screen.getByRole("complementary", { name: zh ? "钱包规则指南" : "Wallet guide" });
  const rechargeRegion = screen.getByRole("region", { name: zh ? "充值 Coins" : "Recharge Coins" });
  expect(balance.parentElement).toBe(rechargeRegion.parentElement);
  expect(balance.parentElement).toBe(activity.parentElement);
  expect(balance.parentElement).toBe(guide.parentElement);
  expect(activity.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(within(cards[2]).getByRole("button"));
  expect(model.openDialog).toHaveBeenCalledTimes(1);
  expect(model.createOrder).toHaveBeenCalledExactlyOnceWith("layout_offer_50");
  expect(vi.mocked(model.openDialog).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(model.createOrder).mock.invocationCallOrder[0]);
});

test.each([
  ["zh", "frozen", "已冻结"], ["en", "frozen", "Frozen"],
  ["zh", "closed", "已关闭"], ["en", "closed", "Closed"],
  ["zh", "not_created", "待首次入账"], ["en", "not_created", "Awaiting first credit"],
] as const)("%s preserves visible feedback for a %s wallet", (locale, status, label) => {
  const current: PortalWalletReadModel = {
    ...wallet,
    summary: { phase: "ready", value: {
      status, version: 1, balances: { paidCoins: 0, bonusCoins: 0, rewardCoins: 0 },
      spendableUnits: 0, heldUnits: 0, pendingUnits: 0,
    } },
  };
  render(createElement(PortalWalletPanel, { locale, model: current }));
  const balance = screen.getByRole("region", { name: locale === "zh" ? "余额" : "Balance" });
  expect(within(balance).getByRole("status")).toHaveTextContent(label);
  expect(within(balance).getByText(label)).toBeVisible();
});

test("unknown creation recovers the original attempt instead of offering a different denomination", () => {
  const model = recharge({ unresolvedCreateOfferRef: "layout_offer_30", error: "create_unknown" });
  render(createElement(PortalWalletPanel, { locale: "zh", model: wallet, rechargeModel: model }));
  expect(screen.queryByRole("list", { name: "Coins 充值档位" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "确认本次充值订单" }));
  expect(model.openDialog).toHaveBeenCalledTimes(1);
  expect(model.createOrder).not.toHaveBeenCalled();
});

test("busy inline denominations cannot open a second create attempt", () => {
  const model = recharge({ busy: true });
  render(createElement(PortalWalletPanel, { locale: "en", model: wallet, rechargeModel: model }));
  const offers = screen.getByRole("list", { name: "Coins recharge denominations" });
  for (const button of within(offers).getAllByRole("button")) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(model.openDialog).not.toHaveBeenCalled();
  expect(model.createOrder).not.toHaveBeenCalled();
});
