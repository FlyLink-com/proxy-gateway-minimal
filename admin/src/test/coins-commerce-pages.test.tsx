import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CommerceWorkspace } from "../features/user-portal/commerce/commerce-pages";
import type { CommerceClient } from "../features/user-portal/commerce/commerce-client";
import type { CatalogDto, PaymentAttemptDto, ReferralSummaryDto, WalletDto } from "../features/user-portal/commerce/commerce-model";

const NOW = "2026-07-22T00:00:00.000Z";
const wallet: WalletDto = { summary: { accountRef: "acct", at: NOW, totalAvailableCoins: 220, totalFrozenCoins: 12, byOrigin: { bonus: { availableCoins: 20, frozenCoins: 2 }, paid: { availableCoins: 180, frozenCoins: 0 }, referral: { availableCoins: 20, frozenCoins: 10 } } }, transactions: [] };
const catalog: CatalogDto = { catalog: { schemaVersion: "coins_commerce_catalog_v1", publishedAt: NOW, productVersions: Array.from({ length: 6 }, (_, i) => ({ productId: `p${i}`, productVersionRef: `pv${i}`, version: 1, status: "published", kind: i % 2 ? "traffic_pack" : "membership", selfOperated: true, publishedAt: NOW, grants: [], commerceBenefits: [] } as const)), offerVersions: Array.from({ length: 6 }, (_, i) => ({ offerVersionRef: `ov${i}`, productVersionRef: `pv${i}`, version: 1, status: "published", currency: "COINS", priceCoins: i + 1, discountClass: i % 2 ? "traffic_pack" : "membership", selfOperated: true, publishedAt: NOW } as const)), rechargeOffers: Array.from({ length: 7 }, (_, i) => ({ rechargeOfferRef: `ro${i}`, version: 1, status: "published", currency: "COINS", paidCoins: (i + 1) * 10, bonusCoins: 0, publishedAt: NOW } as const)) }, activeMemberships: [] };
const referral: ReferralSummaryDto = { cumulativeEarnedCoins: 1, availableCoins: 2, internallyConsumedCoins: 3, frozenCoins: 4, frozenForSettlementCoins: 5, externallySettledCoins: 6, reversedCoins: 7 };
const attempt = (status: PaymentAttemptDto["status"]): PaymentAttemptDto => ({ attemptRef: "a", orderRef: "o", providerId: "provider", status, chargeCertainty: status === "succeeded" ? "charged" : status === "unknown" ? "unknown" : status === "possibly_charged" ? "possibly_charged" : status === "reversed" ? "reversed" : status === "pending" ? "pending" : "confirmed_no_charge", nextAction: { type: "none" }, sourceAttemptRef: null, targetAttemptRef: null, switchReason: null, reconciliationState: status === "succeeded" ? "charged_uncredited" : status === "unknown" || status === "possibly_charged" ? "requires_review" : status === "reversed" ? "reversed" : status === "pending" ? "pending" : "confirmed_no_charge", createdAt: NOW, updatedAt: NOW });

function client(overrides: Partial<CommerceClient> = {}): CommerceClient {
  return { getWallet: vi.fn().mockResolvedValue(wallet), getCatalog: vi.fn().mockResolvedValue(catalog), listOrders: vi.fn().mockResolvedValue([]), getReferral: vi.fn().mockResolvedValue(referral), createProductOrder: vi.fn(), createRechargeOrder: vi.fn(), getPaymentAttempt: vi.fn().mockResolvedValue(attempt("pending")), switchPaymentAttempt: vi.fn(), ...overrides };
}

afterEach(() => cleanup());

describe("CommerceWorkspace", () => {
  test("loads primary destinations concurrently and renders wallet/catalog/referral partitions", async () => {
    const c = client();
    render(<CommerceWorkspace client={c} sessionRef="session" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Coins 钱包" })).toBeTruthy());
    expect(vi.mocked(c.getWallet)).toHaveBeenCalled(); expect(vi.mocked(c.getCatalog)).toHaveBeenCalled(); expect(vi.mocked(c.listOrders)).toHaveBeenCalled(); expect(vi.mocked(c.getReferral)).toHaveBeenCalled();
    expect(screen.getByText("Bonus Coins")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "推荐" })); expect(screen.getByText("累计获得")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "商城" }));
    expect((await screen.findByRole("list", { name: "充值档" })).querySelectorAll("li")).toHaveLength(7);
    expect(screen.getByRole("list", { name: "商品 Offer" }).querySelectorAll("li")).toHaveLength(6);
  });

  test("requires explicit purchase confirmation and sends one idempotency key per intent", async () => {
    const create = vi.fn().mockResolvedValue({ order: { orderType: "product", orderRef: "o", amountCoins: 1, rechargeSnapshot: undefined }, fulfillmentPlan: {} });
    const c = client({ createProductOrder: create as never });
    render(<CommerceWorkspace client={c} sessionRef="session" />); await screen.findByRole("heading", { name: "Coins 钱包" });
    fireEvent.click(screen.getByRole("button", { name: "商城" }));
    fireEvent.click((await screen.findAllByText("使用 Coins 支付"))[0]);
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1].idempotencyKey).toMatch(/^coins-intent-/);
  });

  test("shows only recharge recovery for insufficient Coins and never calls a provider", async () => {
    const c = client({ createProductOrder: vi.fn().mockRejectedValue(Object.assign(new Error("insufficient"), { code: "insufficient_coins" })) as never });
    render(<CommerceWorkspace client={c} sessionRef="session" />); await screen.findByRole("heading", { name: "Coins 钱包" }); fireEvent.click(screen.getByRole("button", { name: "商城" }));
    fireEvent.click((await screen.findAllByText("使用 Coins 支付"))[0]); fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    expect(await screen.findByRole("button", { name: "去充值" })).toBeTruthy(); expect(screen.queryByRole("button", { name: /切换|重试/ })).toBeNull();
  });

  test.each(["succeeded", "confirmed_no_charge", "pending", "provider_insufficient", "risk_rejected", "unknown", "possibly_charged", "reversed"] as const)("renders payment state %s", async (status) => {
    const c = client({ getPaymentAttempt: vi.fn().mockResolvedValue(attempt(status)) });
    render(<CommerceWorkspace client={c} sessionRef="session" initialDestination={{ type: "payment_status", attemptRef: "a", backTo: "orders" }} />);
    const labels: Record<string, string> = { succeeded: "支付成功", confirmed_no_charge: "未扣款", pending: "支付处理中", provider_insufficient: "支付渠道余额不足", risk_rejected: "风控拒绝", unknown: "状态待确认", possibly_charged: "可能已扣款", reversed: "已冲正" };
    expect(await screen.findByText(labels[status])).toBeTruthy();
    if (["pending", "unknown", "possibly_charged"].includes(status)) expect(screen.queryByRole("button", { name: /重试|切换/ })).toBeNull();
  });
});
