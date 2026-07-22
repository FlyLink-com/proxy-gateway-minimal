import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  BalanceCard,
  LedgerRow,
  OrderSummary,
  ProductOfferCard,
  RechargeOfferCard,
  StateNotice,
  StatusBadge
} from "../features/user-portal/commerce/commerce-components";
import type {
  OfferVersionDto,
  ProductOrderDto,
  ProductVersionDto,
  RechargeOfferDto,
  WalletTransactionDto
} from "../features/user-portal/commerce/commerce-model";

const NOW = "2026-07-22T00:00:00.000Z";
const LONG_PRODUCT_NAME = "年度自营会员与每月刷新流量权益（适用于需要长期稳定连接和清晰账单说明的用户）";

afterEach(() => {
  cleanup();
});

function rechargeOffer(): RechargeOfferDto {
  return {
    rechargeOfferRef: "rov_paid_20_v1",
    version: 1,
    status: "published",
    currency: "COINS",
    paidCoins: 20,
    bonusCoins: 0,
    publishedAt: NOW
  };
}

function productVersion(): ProductVersionDto {
  return {
    productId: "membership_annual_200gb_monthly",
    productVersionRef: "pv_membership_annual_200gb_monthly_v1",
    version: 1,
    status: "published",
    kind: "membership",
    selfOperated: true,
    publishedAt: NOW,
    grants: [
      { type: "access", durationDays: 365, mode: "fixed_term" },
      {
        type: "traffic",
        quantityGb: 200,
        cycleDays: 30,
        resetAtCycleEnd: true,
        carryOver: false,
        consumptionPriority: 100
      }
    ],
    commerceBenefits: [{
      type: "offer_discount",
      eligibleDiscountClasses: ["traffic_pack", "addon"],
      priceBasisPoints: 8000
    }]
  };
}

function offerVersion(): OfferVersionDto {
  return {
    offerVersionRef: "ov_membership_annual_200gb_monthly_v1",
    productVersionRef: "pv_membership_annual_200gb_monthly_v1",
    version: 1,
    status: "published",
    currency: "COINS",
    priceCoins: 200,
    discountClass: "membership",
    selfOperated: true,
    publishedAt: NOW
  };
}

function productOrder(): ProductOrderDto {
  return {
    schemaVersion: "coins_commerce_order_v1",
    orderRef: "product-order-safe",
    accountRef: "acct-safe",
    orderType: "product",
    status: "fulfillment_planned",
    currency: "COINS",
    item: {
      productId: "membership_annual_200gb_monthly",
      productVersionRef: "pv_membership_annual_200gb_monthly_v1",
      offerVersionRef: "ov_membership_annual_200gb_monthly_v1",
      currency: "COINS",
      basePriceCoins: 200,
      payableCoins: 200,
      discount: null,
      grants: productVersion().grants
    },
    amountCoins: 200,
    holdRef: "hold-safe",
    captureTransactionRef: "capture-safe",
    fulfillmentPlanRef: "plan-safe",
    createdAt: NOW
  };
}

function transaction(): WalletTransactionDto {
  return {
    transactionRef: "transaction-safe",
    accountRef: "acct-safe",
    type: "credit",
    amountCoins: 20,
    allocations: [{ lotRef: "lot-safe", origin: "paid", amountCoins: 20 }],
    relatedRef: "lot-safe",
    createdAt: NOW
  };
}

describe("Coins commerce components", () => {
  test("renders semantic headings, offer lists, order details, and ledger tables", () => {
    render(
      <main className="coins-commerce">
        <h1>Coins 商城</h1>
        <BalanceCard title="可用 Coins" amountCoins={220} description="按来源核对余额" />
        <ul aria-label="Coins 商品列表">
          <RechargeOfferCard offer={rechargeOffer()} onSelect={() => undefined} />
          <ProductOfferCard
            product={productVersion()}
            offer={offerVersion()}
            title={LONG_PRODUCT_NAME}
            payableCoins={200}
            onSelect={() => undefined}
          />
        </ul>
        <OrderSummary order={productOrder()} title="订单摘要" statusLabel="已生成履约计划" />
        <table aria-label="Coins 账本">
          <thead>
            <tr><th>类型</th><th>金额</th><th>时间</th></tr>
          </thead>
          <tbody>
            <LedgerRow transaction={transaction()} typeLabel="充值入账" />
          </tbody>
        </table>
      </main>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Coins 商城" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "可用 Coins" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: LONG_PRODUCT_NAME })).not.toBeNull();
    expect(within(screen.getByRole("list", { name: "Coins 商品列表" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "订单摘要" })).not.toBeNull();
    expect(screen.getByRole("table", { name: "Coins 账本" })).not.toBeNull();
    expect(screen.getByRole("cell", { name: "充值入账" })).not.toBeNull();
    expect(screen.getByRole("cell", { name: "20 Coins" })).not.toBeNull();
  });

  test("uses exact accessible names and native keyboard-operable actions", () => {
    const onRecharge = vi.fn();
    const onPurchase = vi.fn();
    render(
      <ul aria-label="可购买项目">
        <RechargeOfferCard offer={rechargeOffer()} onSelect={onRecharge} />
        <ProductOfferCard
          product={productVersion()}
          offer={offerVersion()}
          title="年度会员"
          payableCoins={200}
          onSelect={onPurchase}
        />
      </ul>
    );

    const recharge = screen.getByRole("button", { name: "充值 20 Coins" });
    const purchase = screen.getByRole("button", { name: "使用 200 Coins 购买年度会员" });
    expect(recharge.tagName).toBe("BUTTON");
    expect(purchase.tagName).toBe("BUTTON");
    recharge.focus();
    expect(document.activeElement).toBe(recharge);
    fireEvent.click(recharge);
    fireEvent.click(purchase);
    expect(onRecharge).toHaveBeenCalledWith("rov_paid_20_v1");
    expect(onPurchase).toHaveBeenCalledWith("ov_membership_annual_200gb_monthly_v1");
  });

  test("prevents disabled offer actions", () => {
    const onRecharge = vi.fn();
    const onPurchase = vi.fn();
    render(
      <ul aria-label="暂不可购买项目">
        <RechargeOfferCard offer={rechargeOffer()} onSelect={onRecharge} disabled />
        <ProductOfferCard
          product={productVersion()}
          offer={offerVersion()}
          title="年度会员"
          payableCoins={200}
          onSelect={onPurchase}
          disabled
        />
      </ul>
    );

    const recharge = screen.getByRole("button", { name: "充值 20 Coins" });
    const purchase = screen.getByRole("button", { name: "使用 200 Coins 购买年度会员" });
    expect((recharge as HTMLButtonElement).disabled).toBe(true);
    expect((purchase as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(recharge);
    fireEvent.click(purchase);
    expect(onRecharge).not.toHaveBeenCalled();
    expect(onPurchase).not.toHaveBeenCalled();
  });

  test("renders visible textual statuses without relying on color", () => {
    render(
      <>
        <StatusBadge label="等待支付确认" tone="warning" />
        <StatusBadge label="充值成功" tone="success" />
      </>
    );

    expect(screen.getByText("等待支付确认")).not.toBeNull();
    expect(screen.getByText("充值成功")).not.toBeNull();
    expect(screen.getByText("等待支付确认").getAttribute("data-tone")).toBe("warning");
  });

  test("renders exact loading, empty, and error state names", () => {
    render(
      <>
        <StateNotice state="loading" title="正在加载钱包" message="正在读取 Coins 明细。" />
        <StateNotice state="empty" title="暂无订单" message="完成购买后会显示在这里。" />
        <StateNotice state="error" title="钱包暂不可用" message="请稍后重试。" />
      </>
    );

    expect(screen.getByRole("status", { name: "正在加载钱包" }).getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status", { name: "暂无订单" }).getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("alert", { name: "钱包暂不可用" })).not.toBeNull();
    expect(screen.getByText("正在读取 Coins 明细。")).not.toBeNull();
    expect(screen.getByText("完成购买后会显示在这里。")).not.toBeNull();
    expect(screen.getByText("请稍后重试。")).not.toBeNull();
  });

  test("keeps styles scoped, focus-visible, touch-safe, and overflow-safe", () => {
    const css = readFileSync(
      resolve("src/features/user-portal/commerce/commerce.css"),
      "utf8"
    ).replace(/\r\n?/g, "\n");

    expect(css).toContain(".coins-commerce-action:focus-visible");
    expect(css).toContain("min-block-size: var(--admin-touch-target-min, 44px);");
    expect(css).toContain("min-inline-size: var(--admin-touch-target-min, 44px);");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain("max-width: 100%;");
    expect(css).toContain("min-width: 0;");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(css).not.toMatch(/(^|\n)\s*(?:body|:root|button|table)\s*\{/);
    expect(css).not.toMatch(/overflow-x:\s*(?:scroll|auto)/);
    expect(css).not.toMatch(/min-width:\s*[5-9]\d{2}px/);
  });
});
