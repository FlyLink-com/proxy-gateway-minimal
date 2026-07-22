import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CommerceClientError, type CommerceClient } from "../features/user-portal/commerce/commerce-client";
import { CommerceWorkspace } from "../features/user-portal/commerce/commerce-pages";
import type {
  CatalogDto,
  CommerceOrderDto,
  PaymentAttemptDto,
  ProductOrderResultDto,
  RechargeOrderResultDto,
  ReferralSummaryDto,
  SafeNextActionDto,
  WalletDto,
  WalletTransactionDto
} from "../features/user-portal/commerce/commerce-model";

const NOW = "2026-07-22T00:00:00.000Z";
const TRANSACTION_TYPES: WalletTransactionDto["type"][] = [
  "credit", "hold", "capture", "release", "referral_freeze", "referral_release", "referral_settlement", "referral_reversal"
];

function wallet(): WalletDto {
  return {
    summary: {
      accountRef: "acct-safe",
      at: NOW,
      totalAvailableCoins: 220,
      totalFrozenCoins: 12,
      byOrigin: {
        bonus: { availableCoins: 20, frozenCoins: 2 },
        paid: { availableCoins: 180, frozenCoins: 0 },
        referral: { availableCoins: 20, frozenCoins: 10 }
      }
    },
    transactions: TRANSACTION_TYPES.map((type, index) => ({
      transactionRef: `transaction-${index}`,
      accountRef: "acct-safe",
      type,
      amountCoins: index + 1,
      allocations: [],
      relatedRef: `related-${index}`,
      createdAt: NOW
    }))
  };
}

function product(index: number, priceBasisPoints?: number) {
  return {
    productId: `product-${index}`,
    productVersionRef: `product-version-${index}`,
    version: 1,
    status: "published" as const,
    kind: index === 0 || index === 5 ? "membership" as const : "traffic_pack" as const,
    selfOperated: true as const,
    publishedAt: NOW,
    grants: [],
    commerceBenefits: priceBasisPoints === undefined ? [] : [{
      type: "offer_discount" as const,
      eligibleDiscountClasses: ["traffic_pack", "addon"],
      priceBasisPoints
    }]
  };
}

function catalog(): CatalogDto {
  const productVersions = Array.from({ length: 6 }, (_, index) => product(index, index === 0 ? 8000 : undefined));
  return {
    catalog: {
      schemaVersion: "coins_commerce_catalog_v1",
      publishedAt: NOW,
      productVersions,
      offerVersions: productVersions.map((item, index) => ({
        offerVersionRef: `offer-${index}`,
        productVersionRef: item.productVersionRef,
        version: 1,
        status: "published",
        currency: "COINS",
        priceCoins: 101,
        discountClass: index === 0 ? "membership" : "traffic_pack",
        selfOperated: true,
        publishedAt: NOW
      })),
      rechargeOffers: Array.from({ length: 7 }, (_, index) => ({
        rechargeOfferRef: `recharge-${index}`,
        version: 1,
        status: "published",
        currency: "COINS",
        paidCoins: (index + 1) * 10,
        bonusCoins: 0,
        publishedAt: NOW
      }))
    },
    activeMemberships: [product(0, 9000), product(5, 8000)]
  };
}

function referral(): ReferralSummaryDto {
  return {
    cumulativeEarnedCoins: 21,
    availableCoins: 2,
    internallyConsumedCoins: 3,
    frozenCoins: 9,
    frozenForSettlementCoins: 5,
    externallySettledCoins: 6,
    reversedCoins: 7
  };
}

function paymentAttempt(
  status: PaymentAttemptDto["status"],
  nextAction: SafeNextActionDto = { type: "none" },
  providerId = "provider_alpha"
): PaymentAttemptDto {
  const chargeCertainty = status === "succeeded" ? "charged" : status === "unknown" ? "unknown" : status === "possibly_charged" ? "possibly_charged" : status === "reversed" ? "reversed" : status === "pending" || status === "action_required" ? "pending" : status === "entry_unavailable" ? "not_charge_capable" : "confirmed_no_charge";
  const reconciliationState = status === "succeeded" ? "charged_uncredited" : status === "unknown" || status === "possibly_charged" ? "requires_review" : status === "reversed" ? "reversed" : status === "pending" || status === "action_required" ? "pending" : status === "entry_unavailable" ? "not_charge_capable" : "confirmed_no_charge";
  return {
    attemptRef: "attempt-safe",
    orderRef: "recharge-order-safe",
    providerId,
    status,
    chargeCertainty,
    nextAction,
    sourceAttemptRef: null,
    targetAttemptRef: null,
    switchReason: null,
    reconciliationState,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function productResult(orderRef = "product-order-safe"): ProductOrderResultDto {
  const selected = catalog().catalog.productVersions[0];
  return {
    order: {
      schemaVersion: "coins_commerce_order_v1",
      orderRef,
      accountRef: "acct-safe",
      orderType: "product",
      status: "fulfillment_planned",
      currency: "COINS",
      item: {
        productId: selected.productId,
        productVersionRef: selected.productVersionRef,
        offerVersionRef: "offer-0",
        currency: "COINS",
        basePriceCoins: 101,
        payableCoins: 101,
        discount: null,
        grants: []
      },
      amountCoins: 101,
      holdRef: "hold-safe",
      captureTransactionRef: "capture-safe",
      fulfillmentPlanRef: "plan-safe",
      createdAt: NOW
    },
    fulfillmentPlan: {
      schemaVersion: "coins_commerce_fulfillment_plan_v1",
      planRef: "plan-safe",
      orderRef,
      accountRef: "acct-safe",
      status: "ready",
      productVersionRef: selected.productVersionRef,
      offerVersionRef: "offer-0",
      grants: [],
      createdAt: NOW
    }
  };
}

function rechargeResult(attempt: PaymentAttemptDto | null, status: RechargeOrderResultDto["status"] = attempt?.status ?? "entry_unavailable"): RechargeOrderResultDto {
  return {
    order: {
      schemaVersion: "coins_commerce_order_v1",
      orderRef: "recharge-order-safe",
      accountRef: "acct-safe",
      orderType: "recharge",
      status: "payment_requested",
      rechargeSnapshot: { rechargeOfferRef: "recharge-0", currency: "COINS", paidCoins: 10, bonusCoins: 0 },
      createdAt: NOW
    },
    attempt,
    status,
    chargeCertainty: attempt?.chargeCertainty ?? "not_charge_capable",
    nextAction: attempt?.nextAction ?? { type: "none" }
  };
}

function client(overrides: Partial<CommerceClient> = {}): CommerceClient {
  return {
    getWallet: vi.fn().mockResolvedValue(wallet()),
    getCatalog: vi.fn().mockResolvedValue(catalog()),
    listOrders: vi.fn().mockResolvedValue([]),
    getReferral: vi.fn().mockResolvedValue(referral()),
    createProductOrder: vi.fn().mockResolvedValue(productResult()),
    createRechargeOrder: vi.fn().mockResolvedValue(rechargeResult(null)),
    getPaymentAttempt: vi.fn().mockResolvedValue(paymentAttempt("pending")),
    switchPaymentAttempt: vi.fn(),
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function openCatalog() {
  await screen.findByRole("heading", { name: "Coins 钱包" });
  fireEvent.click(screen.getByRole("button", { name: "商城" }));
  await screen.findByRole("heading", { name: "Coins 商城目录" });
}

function selectFirstProduct() {
  fireEvent.click(screen.getAllByText("使用 Coins 支付")[0]);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CommerceWorkspace read pages", () => {
  test("starts all four reads before any read resolves", async () => {
    const reads = { wallet: deferred<WalletDto>(), catalog: deferred<CatalogDto>(), orders: deferred<CommerceOrderDto[]>(), referral: deferred<ReferralSummaryDto>() };
    const c = client({
      getWallet: vi.fn(() => reads.wallet.promise),
      getCatalog: vi.fn(() => reads.catalog.promise),
      listOrders: vi.fn(() => reads.orders.promise),
      getReferral: vi.fn(() => reads.referral.promise)
    });

    render(<CommerceWorkspace client={c} sessionRef="session-safe" />);

    expect(c.getWallet).toHaveBeenCalledTimes(1);
    expect(c.getCatalog).toHaveBeenCalledTimes(1);
    expect(c.listOrders).toHaveBeenCalledTimes(1);
    expect(c.getReferral).toHaveBeenCalledTimes(1);
    await act(async () => {
      reads.wallet.resolve(wallet()); reads.catalog.resolve(catalog()); reads.orders.resolve([]); reads.referral.resolve(referral());
    });
    expect(await screen.findByRole("heading", { name: "Coins 钱包" })).toBeTruthy();
  });

  test("renders all balances, all eight ledger states, seven recharge tiers, and six discounted offers", async () => {
    render(<CommerceWorkspace client={client()} sessionRef="session-safe" />);
    const walletPage = await screen.findByRole("region", { name: "Coins 钱包" });
    expect(within(walletPage).getByText("Bonus Coins")).toBeTruthy();
    expect(within(walletPage).getByText("Paid Coins")).toBeTruthy();
    expect(within(walletPage).getByText("Referral Coins")).toBeTruthy();
    expect(within(walletPage).getByRole("region", { name: "Bonus Coins：20 Coins" })).toBeTruthy();
    expect(within(walletPage).getByRole("region", { name: "Paid Coins：180 Coins" })).toBeTruthy();
    expect(within(walletPage).getByRole("region", { name: "Referral Coins：20 Coins" })).toBeTruthy();
    expect(within(walletPage).getByRole("region", { name: "总可用余额：220 Coins" })).toBeTruthy();
    expect(within(walletPage).getAllByRole("row")).toHaveLength(9);
    const transactionLabels = [
      "入账", "冻结", "扣减", "释放", "推荐奖励冻结", "推荐奖励释放", "推荐奖励结算", "推荐奖励冲正"
    ];
    for (const [index, type] of TRANSACTION_TYPES.entries()) {
      const row = walletPage.querySelector(`[data-transaction-type="${type}"]`) as HTMLElement;
      expect(row).not.toBeNull();
      expect(within(row).getByText(transactionLabels[index])).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "商城" }));
    expect((await screen.findByRole("list", { name: "充值档" })).querySelectorAll("li")).toHaveLength(7);
    expect(screen.getByRole("list", { name: "商品 Offer" }).querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "使用 101 Coins 购买product-0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "使用 80 Coins 购买product-1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "使用 101 Coins 购买product-5" })).toBeTruthy();
  });

  test("uses the same discounted payable amount on the offer and confirmation pages", async () => {
    render(<CommerceWorkspace client={client()} sessionRef="session-safe" />);
    await openCatalog();
    fireEvent.click(screen.getByRole("button", { name: "使用 80 Coins 购买product-1" }));

    const confirmation = screen.getByRole("region", { name: "购买确认" });
    expect(within(confirmation).getByText(/（80 Coins）/)).toBeTruthy();
    expect(within(confirmation).queryByText(/（101 Coins）/)).toBeNull();
  });

  test("renders six non-overlapping referral partitions without settlement controls", async () => {
    render(<CommerceWorkspace client={client()} sessionRef="session-safe" />);
    await screen.findByRole("heading", { name: "Coins 钱包" });
    fireEvent.click(screen.getByRole("button", { name: "推荐" }));
    const page = screen.getByRole("region", { name: "推荐 Coins" });
    expect(page.querySelectorAll("dt")).toHaveLength(6);
    for (const [label, value] of [
      ["累计获得", 21], ["可用余额", 2], ["内部消费", 3],
      ["待结算冻结", 5], ["外部结算", 6], ["已冲正", 7]
    ] as const) {
      const term = within(page).getByText(label);
      expect(term.nextElementSibling?.textContent).toBe(`${value} Coins`);
    }
    expect(within(page).queryByText("冻结", { exact: true })).toBeNull();
    expect(within(page).queryByRole("button", { name: /提现|结算|cash/i })).toBeNull();
    expect(within(page).queryByRole("link", { name: /提现|结算|cash/i })).toBeNull();
  });
});

describe("CommerceWorkspace recharge and purchase flow", () => {
  test("continues a real recharge into payment status without auto-purchasing and restores pending purchase on back", async () => {
    const createProductOrder = vi.fn()
      .mockRejectedValueOnce(new CommerceClientError("insufficient_coins", 409, { type: "go_to_recharge", shortfallCoins: 20 }))
      .mockResolvedValueOnce(productResult());
    const nextAction = { type: "hosted_redirect", url: "https://pay.example.test/continue" } as const;
    const createRechargeOrder = vi.fn().mockResolvedValue(rechargeResult(paymentAttempt("action_required", nextAction), "action_required"));
    render(<CommerceWorkspace client={client({ createProductOrder, createRechargeOrder })} sessionRef="session-safe" />);

    await openCatalog(); selectFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    fireEvent.click(await screen.findByRole("button", { name: "去充值" }));
    fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));

    expect(await screen.findByText("需要完成支付")).toBeTruthy();
    expect(screen.getByRole("link", { name: "继续支付" }).getAttribute("href")).toBe(nextAction.url);
    expect(createProductOrder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "返回商城" }));
    expect(screen.getByRole("heading", { name: "确认购买" })).toBeTruthy();
    expect(createProductOrder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await waitFor(() => expect(createProductOrder).toHaveBeenCalledTimes(2));
  });

  test("renders attempt-null entry-unavailable as a terminal state", async () => {
    const createRechargeOrder = vi.fn().mockResolvedValue(rechargeResult(null));
    const getPaymentAttempt = vi.fn().mockResolvedValue(paymentAttempt("pending"));
    render(<CommerceWorkspace client={client({ createRechargeOrder, getPaymentAttempt })} sessionRef="session-safe" />);
    await openCatalog();
    fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));

    expect(await screen.findByText("支付入口不可用")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "正在读取支付状态" })).toBeNull();
    expect(getPaymentAttempt).not.toHaveBeenCalled();
  });

  test("shows a safe recharge error and keeps the same intent available for retry", async () => {
    const createRechargeOrder = vi.fn().mockRejectedValue(new Error("synthetic provider detail"));
    render(<CommerceWorkspace client={client({ createRechargeOrder })} sessionRef="session-safe" />);
    await openCatalog();
    fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));
    expect(await screen.findByRole("alert", { name: "充值订单暂不可用" })).toBeTruthy();
    expect(screen.queryByText("synthetic provider detail")).toBeNull();
  });

  test("returns from recharge to an explicit pending-purchase confirmation", async () => {
    const createProductOrder = vi.fn().mockRejectedValue(
      new CommerceClientError("insufficient_coins", 409, { type: "go_to_recharge", shortfallCoins: 20 })
    );
    render(<CommerceWorkspace client={client({ createProductOrder })} sessionRef="session-safe" />);
    await openCatalog(); selectFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    fireEvent.click(await screen.findByRole("button", { name: "去充值" }));
    fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "返回商城" }));

    expect(screen.getByRole("heading", { name: "确认购买" })).toBeTruthy();
    expect(createProductOrder).toHaveBeenCalledTimes(1);
  });

  test("honors the explicit recharge back destination", async () => {
    render(
      <CommerceWorkspace
        client={client()}
        sessionRef="session-safe"
        initialDestination={{ type: "recharge", rechargeOfferRef: "recharge-0", backTo: "orders" }}
      />
    );
    await screen.findByRole("heading", { name: "充值 Coins" });
    fireEvent.click(screen.getByRole("button", { name: "返回订单" }));
    expect(screen.getByRole("heading", { name: "Coins 订单" })).toBeTruthy();
  });
});

describe("CommerceWorkspace next actions and payment safety", () => {
  test.each([
    ["succeeded", "支付成功"],
    ["confirmed_no_charge", "未扣款"],
    ["pending", "支付处理中"],
    ["provider_insufficient", "支付渠道余额不足"],
    ["risk_rejected", "风控拒绝"],
    ["unknown", "状态待确认"],
    ["possibly_charged", "可能已扣款"],
    ["reversed", "已冲正"]
  ] as const)("renders the complete payment status %s as %s", async (status, label) => {
    render(<CommerceWorkspace client={client({ getPaymentAttempt: vi.fn().mockResolvedValue(paymentAttempt(status)) })} sessionRef="session-safe" initialDestination={{ type: "payment_status", attemptRef: "attempt-safe", backTo: "orders" }} />);
    expect(await screen.findByText(label)).toBeTruthy();
  });

  const nextActionCases: [SafeNextActionDto, string, string][] = [
    [{ type: "hosted_redirect", url: "https://pay.example.test/continue" }, "继续支付", "provider_alpha"],
    [{ type: "provider_sdk", actionRef: "sdk-safe" }, "当前页面不能直接启动支付组件", "provider_beta"],
    [{ type: "qr", payload: "qr-safe-payload" }, "支付二维码", "provider_gamma"],
    [{ type: "bank_instructions", instructions: ["instruction-safe"] }, "银行支付说明", "provider_delta"],
    [{ type: "none" }, "暂无后续支付操作", "provider_epsilon"]
  ];
  test.each(nextActionCases)("renders nextAction %s without provider routing", async (nextAction, expectedName, providerId) => {
    const status = nextAction.type === "none" ? "pending" : "action_required";
    const getPaymentAttempt = vi.fn().mockResolvedValue(paymentAttempt(status, nextAction, providerId));
    render(<CommerceWorkspace client={client({ getPaymentAttempt })} sessionRef="session-safe" initialDestination={{ type: "payment_status", attemptRef: "attempt-safe", backTo: "orders" }} />);
    if (nextAction.type === "qr" || nextAction.type === "bank_instructions") {
      expect(await screen.findByLabelText(expectedName)).toBeTruthy();
    } else {
      expect(await screen.findByText(expectedName, { exact: false })).toBeTruthy();
    }
    if (nextAction.type === "provider_sdk") expect(screen.queryByRole("button", { name: "打开支付组件" })).toBeNull();
    if (nextAction.type === "qr") expect(screen.getByText("qr-safe-payload")).toBeTruthy();
    if (nextAction.type === "bank_instructions") expect(screen.getByText("instruction-safe")).toBeTruthy();
  });

  test.each(["succeeded", "confirmed_no_charge", "provider_insufficient", "risk_rejected", "reversed"] as const)("offers a real new-order route for safe status %s", async (status) => {
    render(<CommerceWorkspace client={client({ getPaymentAttempt: vi.fn().mockResolvedValue(paymentAttempt(status)) })} sessionRef="session-safe" initialDestination={{ type: "payment_status", attemptRef: "attempt-safe", backTo: "orders" }} />);
    const action = await screen.findByRole("button", { name: "创建新订单" });
    fireEvent.click(action);
    expect(screen.getByRole("heading", { name: "Coins 商城目录" })).toBeTruthy();
  });

  test.each(["pending", "unknown", "possibly_charged"] as const)("blocks retry, switch, and new order for uncertain status %s while retaining back", async (status) => {
    render(<CommerceWorkspace client={client({ getPaymentAttempt: vi.fn().mockResolvedValue(paymentAttempt(status)) })} sessionRef="session-safe" initialDestination={{ type: "payment_status", attemptRef: "attempt-safe", backTo: "orders" }} />);
    await screen.findByRole("heading", { name: "支付状态" });
    expect(screen.queryByRole("button", { name: /重试|切换|创建新订单/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Coins 商业流程" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "返回订单" }));
    expect(screen.getByRole("heading", { name: "Coins 订单" })).toBeTruthy();
  });

  test("keeps payment read failures uncertain instead of claiming entry unavailable", async () => {
    render(
      <CommerceWorkspace
        client={client({ getPaymentAttempt: vi.fn().mockRejectedValue(new Error("network detail")) })}
        sessionRef="session-safe"
        initialDestination={{ type: "payment_status", attemptRef: "attempt-safe", backTo: "orders" }}
      />
    );

    expect(await screen.findByRole("alert", { name: "支付状态无法确认" })).toBeTruthy();
    expect(screen.queryByText("支付入口不可用")).toBeNull();
    expect(screen.queryByText("not_charge_capable")).toBeNull();
    expect(screen.queryByRole("button", { name: /重试|切换|创建新订单/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Coins 商业流程" })).toBeNull();
    expect(screen.getByRole("button", { name: "返回订单" })).toBeTruthy();
  });
});

describe("CommerceWorkspace intent-scoped idempotency and local orders", () => {
  test("uses a collision-resistant key for an initial purchase intent", async () => {
    const uuid = "00000000-0000-4000-8000-000000000001";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(uuid);
    const createProductOrder = vi.fn().mockResolvedValue(productResult());
    render(
      <CommerceWorkspace
        client={client({ createProductOrder })}
        sessionRef="session-safe"
        initialDestination={{ type: "purchase_confirm", offerVersionRef: "offer-0", backTo: "catalog" }}
      />
    );

    await screen.findByRole("heading", { name: "确认购买" });
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await waitFor(() => expect(createProductOrder).toHaveBeenCalledTimes(1));
    expect(createProductOrder.mock.calls[0][1].idempotencyKey).toBe(`coins-intent-purchase-${uuid}`);
  });

  test("uses a collision-resistant key for an initial recharge intent", async () => {
    const uuid = "00000000-0000-4000-8000-000000000002";
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(uuid);
    const createRechargeOrder = vi.fn().mockResolvedValue(rechargeResult(null));
    render(
      <CommerceWorkspace
        client={client({ createRechargeOrder })}
        sessionRef="session-safe"
        initialDestination={{ type: "recharge", rechargeOfferRef: "recharge-0", backTo: "catalog" }}
      />
    );

    await screen.findByRole("heading", { name: "充值 Coins" });
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));
    await waitFor(() => expect(createRechargeOrder).toHaveBeenCalledTimes(1));
    expect(createRechargeOrder.mock.calls[0][1].idempotencyKey).toBe(`coins-intent-recharge-${uuid}`);
  });

  test("ignores a product result from a replaced Portal session", async () => {
    const pending = deferred<ProductOrderResultDto>();
    const c = client({ createProductOrder: vi.fn(() => pending.promise) });
    const view = render(<CommerceWorkspace client={c} sessionRef="session-one" />);
    await openCatalog(); selectFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    view.rerender(<CommerceWorkspace client={c} sessionRef="session-two" />);
    expect(await screen.findByRole("heading", { name: "Coins 钱包" })).toBeTruthy();
    await act(async () => pending.resolve(productResult("old-session-product-order")));
    expect(screen.queryByRole("region", { name: "old-session-product-order" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Coins 钱包" })).toBeTruthy();
  });

  test("ignores a recharge result from a replaced Portal session", async () => {
    const pending = deferred<RechargeOrderResultDto>();
    const c = client({ createRechargeOrder: vi.fn(() => pending.promise) });
    const view = render(<CommerceWorkspace client={c} sessionRef="session-one" />);
    await openCatalog(); fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));
    view.rerender(<CommerceWorkspace client={c} sessionRef="session-two" />);
    expect(await screen.findByRole("heading", { name: "Coins 钱包" })).toBeTruthy();
    await act(async () => pending.resolve(rechargeResult(null)));
    expect(screen.queryByRole("heading", { name: "支付状态" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Coins 钱包" })).toBeTruthy();
  });

  test("keeps purchase navigation and cancellation locked while submission is pending", async () => {
    const pending = deferred<ProductOrderResultDto>();
    const createProductOrder = vi.fn(() => pending.promise);
    render(<CommerceWorkspace client={client({ createProductOrder })} sessionRef="session-safe" />);
    await openCatalog(); selectFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));

    expect((screen.getByRole("button", { name: "确认使用 Coins 支付" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "取消购买" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("navigation", { name: "Coins 商业流程" })).toBeNull();
    await act(async () => pending.resolve(productResult("product-order-pending")));
    expect(screen.getByRole("region", { name: "product-order-pending" })).toBeTruthy();
  });

  test("reuses a purchase key only for retry, then rotates it after success", async () => {
    const createProductOrder = vi.fn()
      .mockRejectedValueOnce(new Error("retryable"))
      .mockResolvedValueOnce(productResult("product-order-first"))
      .mockResolvedValueOnce(productResult("product-order-second"));
    render(<CommerceWorkspace client={client({ createProductOrder })} sessionRef="session-safe" />);
    await openCatalog(); selectFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await screen.findByText("订单暂不可用");
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    expect((await screen.findAllByText("product-order-first")).length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toContain("订单已创建");
    const firstKey = createProductOrder.mock.calls[0][1].idempotencyKey;
    expect(createProductOrder.mock.calls[1][1].idempotencyKey).toBe(firstKey);

    fireEvent.click(screen.getByRole("button", { name: "商城" })); selectFirstProduct();
    fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await waitFor(() => expect(createProductOrder).toHaveBeenCalledTimes(3));
    expect(createProductOrder.mock.calls[2][1].idempotencyKey).not.toBe(firstKey);
  });

  test("rotates a purchase key after explicit cancel", async () => {
    const createProductOrder = vi.fn().mockRejectedValue(new Error("retryable"));
    render(<CommerceWorkspace client={client({ createProductOrder })} sessionRef="session-safe" />);
    await openCatalog(); selectFirstProduct(); fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await screen.findByText("订单暂不可用");
    const firstKey = createProductOrder.mock.calls[0][1].idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: "取消购买" }));
    selectFirstProduct(); fireEvent.click(screen.getByRole("button", { name: "确认使用 Coins 支付" }));
    await waitFor(() => expect(createProductOrder).toHaveBeenCalledTimes(2));
    expect(createProductOrder.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  });

  test("reuses a recharge key only for retry, rotates it after success, and keeps the created order", async () => {
    const createRechargeOrder = vi.fn()
      .mockRejectedValueOnce(new Error("retryable"))
      .mockResolvedValueOnce(rechargeResult(null))
      .mockResolvedValueOnce(rechargeResult(null));
    render(<CommerceWorkspace client={client({ createRechargeOrder })} sessionRef="session-safe" />);
    await openCatalog(); fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" })); await screen.findByRole("alert", { name: "充值订单暂不可用" });
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" })); await screen.findByText("支付入口不可用");
    const firstKey = createRechargeOrder.mock.calls[0][1].idempotencyKey;
    expect(createRechargeOrder.mock.calls[1][1].idempotencyKey).toBe(firstKey);
    fireEvent.click(screen.getByRole("button", { name: "返回商城" }));
    fireEvent.click(screen.getByRole("button", { name: "订单" }));
    expect(screen.getAllByText("recharge-order-safe").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "商城" }));
    fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));
    await waitFor(() => expect(createRechargeOrder).toHaveBeenCalledTimes(3));
    expect(createRechargeOrder.mock.calls[2][1].idempotencyKey).not.toBe(firstKey);
  });

  test("rotates a recharge key after explicit cancel", async () => {
    const createRechargeOrder = vi.fn().mockRejectedValue(new Error("retryable"));
    render(<CommerceWorkspace client={client({ createRechargeOrder })} sessionRef="session-safe" />);
    await openCatalog(); fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));
    await screen.findByRole("alert", { name: "充值订单暂不可用" });
    const firstKey = createRechargeOrder.mock.calls[0][1].idempotencyKey;
    fireEvent.click(screen.getByRole("button", { name: "返回商城" }));
    fireEvent.click(screen.getByRole("button", { name: "充值 10 Coins" }));
    fireEvent.click(screen.getByRole("button", { name: "创建充值订单" }));
    await waitFor(() => expect(createRechargeOrder).toHaveBeenCalledTimes(2));
    expect(createRechargeOrder.mock.calls[1][1].idempotencyKey).not.toBe(firstKey);
  });
});
