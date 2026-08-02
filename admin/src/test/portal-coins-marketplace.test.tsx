import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  PortalCoinCommerceClient,
  PortalCoinOffer,
  PortalCoinOrder,
  PortalCoinQuote
} from "../features/user-portal/commerce";
import {
  PORTAL_COIN_ORDER_STORAGE_KEY,
  PortalCoinCommerceClientError
} from "../features/user-portal/commerce";
import {
  createLocalUserPortalClient,
  type PortalSession,
  type UserPortalClient
} from "../features/user-portal/user-portal-client";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import { MarketplacePanel } from "../features/user-portal/portal-commerce-panels";
import type {
  PortalWalletClient,
  PortalWalletSummary
} from "../features/user-portal/wallet";

const commerceCssPath = resolve(
  process.cwd(),
  "src/styles/portal-static-preserve/user-portal-commerce.css"
);

function readCommerceCss(): string {
  return readFileSync(commerceCssPath, "utf8").replace(/\r\n?/g, "\n");
}

const session: PortalSession = {
  status: "authenticated_preview",
  sessionRef: "portal_session_marketplace",
  userRef: "user_marketplace",
  displayName: "Marketplace user",
  authMode: "password",
  registeredAt: "2026-07-27T00:00:00.000Z",
  safety: {
    noAdminApi: true,
    noPublicAuthActivated: true,
    noRawPasswordReturned: true
  }
};

const planOffer: PortalCoinOffer = {
  offerRef: "offer_plan_basic",
  offerVersionRef: "offer_version_plan_basic",
  category: "plan",
  title: { zh: "服务端基础套餐", en: "Server basic plan" },
  summary: { zh: "服务端套餐说明", en: "Server plan summary" },
  importantNotices: {
    zh: ["按订单状态交付"],
    en: ["Delivery follows the Order state"]
  },
  baseCoinUnits: 42,
  referencePrice: { currency: "CNY", amountMinor: 1567 },
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

const dataPackOffer: PortalCoinOffer = {
  offerRef: "offer_data_pack",
  offerVersionRef: "offer_version_data_pack",
  category: "data_pack",
  title: { zh: "服务端流量包", en: "Server data pack" },
  summary: { zh: "服务端流量包说明", en: "Server data-pack summary" },
  importantNotices: {
    zh: ["以订单交付结果为准"],
    en: ["The Order delivery result is authoritative"]
  },
  baseCoinUnits: 30,
  referencePrice: { currency: "CNY", amountMinor: 990 },
  acceptedCoinTypes: ["paid_coins"],
  delivery: {
    kind: "data_pack",
    durationDays: null,
    monthlyTrafficGb: null,
    trafficGb: 50,
    neverExpires: true,
    discountBasisPoints: null
  }
};

const availableQuote: PortalCoinQuote = {
  quoteRef: "quote_plan_basic",
  offer: planOffer,
  amountUnits: 42,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [
    { coinType: "paid_coins", amountUnits: 40 },
    { coinType: "reward_coins", amountUnits: 2 }
  ],
  balances: {
    before: {
      bonusCoins: 0,
      paidCoins: 50,
      rewardCoins: 2,
      heldCoins: 0
    },
    after: {
      bonusCoins: 0,
      paidCoins: 10,
      rewardCoins: 0,
      heldCoins: 42
    }
  },
  expiresAt: "2026-07-27T20:00:00.000Z"
};

const insufficientQuote: PortalCoinQuote = {
  ...availableQuote,
  quoteRef: "quote_plan_insufficient",
  amountUnits: 15,
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
  }
};

const heldOrder: PortalCoinOrder = {
  orderRef: "order_plan_basic",
  offer: planOffer,
  amountUnits: 42,
  allocation: availableQuote.allocation,
  paymentStatus: "held",
  cancelUntil: "2026-07-27T20:05:00.000Z",
  fulfillment: { status: "not_requested", safeCode: null },
  createdAt: "2026-07-27T19:55:00.000Z",
  updatedAt: "2026-07-27T19:55:00.000Z"
};

const cancelledOrder: PortalCoinOrder = {
  ...heldOrder,
  paymentStatus: "cancelled",
  updatedAt: "2026-07-27T19:56:00.000Z"
};

const deliveredOrder: PortalCoinOrder = {
  ...heldOrder,
  paymentStatus: "captured",
  fulfillment: { status: "delivered", safeCode: null },
  updatedAt: "2026-07-27T19:57:00.000Z"
};

function walletSummary(
  spendableUnits: number,
  heldUnits: number
): PortalWalletSummary {
  return {
    status: "active",
    version: heldUnits === 0 ? 1 : 2,
    balances: {
      paidCoins: spendableUnits,
      bonusCoins: 0,
      rewardCoins: 0
    },
    spendableUnits,
    heldUnits,
    pendingUnits: 0
  };
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise
  };
}

function cssRuleBlock(css: string, selector: string) {
  const escapedSelector = selector.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const match = css.match(new RegExp(
    `(?:^|})\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`
  ));
  if (!match) {
    throw new Error(`missing CSS rule: ${selector}`);
  }
  return match[1];
}

function commerceClient(
  overrides: Partial<PortalCoinCommerceClient> = {}
): PortalCoinCommerceClient {
  return {
    listOffers: vi.fn(async () => [planOffer, dataPackOffer]),
    listOrders: vi.fn(async () => ({ orders: [], nextCursor: null })),
    getOffer: vi.fn(async ({ offerRef }) => (
      offerRef === dataPackOffer.offerRef ? dataPackOffer : planOffer
    )),
    previewCheckout: vi.fn(),
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    ...overrides
  };
}

function portalClientWithCommerce(
  commerce: PortalCoinCommerceClient
): UserPortalClient {
  return {
    ...createLocalUserPortalClient(),
    commerce
  };
}

async function openMarketplace(client: UserPortalClient) {
  render(createElement(UserPortalPage, {
    initialSession: session,
    portalClient: client
  }));
  const navigation = await screen.findByRole("navigation", {
    name: "用户中心导航"
  });
  fireEvent.click(within(navigation).getByRole("button", { name: "商城" }));
}

async function loginAndOpenMarketplace(client: UserPortalClient) {
  render(createElement(UserPortalPage, { portalClient: client }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "登录" })).not.toBeDisabled();
  });
  const challenge = screen.getByLabelText("防机器人校验") as HTMLInputElement;
  const match = challenge.placeholder.match(
    /^(\d+)\s+\+\s+(\d+)\s+=\s+\?$/
  );
  if (!match) {
    throw new Error("unexpected local human-challenge prompt");
  }
  fireEvent.change(screen.getByLabelText("电子邮箱"), {
    target: { value: "user_marketplace" }
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "user-password" }
  });
  fireEvent.change(challenge, {
    target: { value: String(Number(match[1]) + Number(match[2])) }
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  const navigation = await screen.findByRole("navigation", {
    name: "用户中心导航"
  });
  fireEvent.click(within(navigation).getByRole("button", { name: "商城" }));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("Portal server-backed Marketplace", () => {
  test("loads the exact authenticated catalog and groups server Offers", async () => {
    const commerce = commerceClient();
    await openMarketplace(portalClientWithCommerce(commerce));

    await waitFor(() => {
      expect(commerce.listOffers).toHaveBeenCalledWith({
        sessionRef: "portal_session_marketplace"
      });
    });
    expect(screen.getByRole("heading", { name: "套餐" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "流量包" })).toBeInTheDocument();
    expect(screen.getByRole("heading", {
      name: "服务端基础套餐"
    })).toBeInTheDocument();
    expect(screen.getByRole("heading", {
      name: "服务端流量包"
    })).toBeInTheDocument();
  });

  test("keeps one Portal shell and renders the server Coins catalog price", async () => {
    await openMarketplace(portalClientWithCommerce(commerceClient()));

    expect(document.querySelectorAll(".portal-v2-shell")).toHaveLength(1);
    expect(screen.getAllByRole("navigation", {
      name: "用户中心导航"
    })).toHaveLength(1);
    expect(screen.queryByRole("heading", {
      name: "平台服务商城"
    })).not.toBeInTheDocument();
    expect(screen.queryByText("商品")).not.toBeInTheDocument();
    expect(screen.queryByText("增值项")).not.toBeInTheDocument();
    expect(screen.queryByText("购买暂未开放")).not.toBeInTheDocument();
    expect(screen.queryByText(/购物车|Cart|数量|Quantity/)).not.toBeInTheDocument();

    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article");
    expect(planCard).not.toBeNull();
    expect(within(planCard as HTMLElement).getByText("服务端套餐说明"))
      .toBeInTheDocument();
    expect(within(planCard as HTMLElement).getByText("30 天 · 每月 100 GB"))
      .toBeInTheDocument();
    expect(within(planCard as HTMLElement).getByText("价格").parentElement)
      .toHaveTextContent("价格42 Coins");
    expect(within(planCard as HTMLElement).queryByText("参考价"))
      .not.toBeInTheDocument();
    expect(within(planCard as HTMLElement).getByText("按订单状态交付"))
      .toBeInTheDocument();
    expect(within(planCard as HTMLElement).getByText("已购 Coins、奖励 Coins"))
      .toBeInTheDocument();
    expect(planCard).not.toHaveTextContent(
      /paid_coins|bonus_coins|reward_coins|held_coins/
    );
    expect(within(planCard as HTMLElement).getByText("42 Coins"))
      .toBeInTheDocument();
    const zhDetails = within(planCard as HTMLElement).getByRole("button", {
      name: "查看详情：服务端基础套餐"
    });
    const zhBuy = within(planCard as HTMLElement).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });
    expect(zhDetails.textContent).toBe("查看详情");
    expect(zhDetails).toHaveAccessibleName(
      `${zhDetails.textContent}：服务端基础套餐`
    );
    expect(zhBuy.textContent).toBe("使用 Coins 购买");
    expect(zhBuy).toHaveAccessibleName(
      `${zhBuy.textContent}：服务端基础套餐`
    );
    expect(screen.getByRole("button", {
      name: "查看详情：服务端流量包"
    })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "使用 Coins 购买：服务端流量包"
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "查看详情"
    })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "使用 Coins 购买"
    })).not.toBeInTheDocument();
  });

  test("shows honest loading, empty, unavailable, auth-error, and retry states", async () => {
    const pendingCatalog = deferred<PortalCoinOffer[]>();
    const loadingCommerce = commerceClient({
      listOffers: vi.fn(() => pendingCatalog.promise)
    });
    const loadingView = render(createElement(UserPortalPage, {
      initialSession: session,
      portalClient: portalClientWithCommerce(loadingCommerce)
    }));
    const loadingNavigation = await screen.findByRole("navigation", {
      name: "用户中心导航"
    });
    fireEvent.click(within(loadingNavigation).getByRole("button", {
      name: "商城"
    }));
    const loadingNotice = screen.getByRole("status");
    expect(loadingNotice).toHaveTextContent("正在加载商城目录");
    expect(loadingNotice).toHaveAttribute("data-state", "loading");
    expect(loadingNotice.querySelector(
      ".portal-notice__indicator--loading[aria-hidden=\"true\"]"
    )).toBeInTheDocument();
    await act(async () => {
      pendingCatalog.resolve([]);
      await pendingCatalog.promise;
    });
    const emptyNotice = await screen.findByRole("status");
    expect(emptyNotice).toHaveTextContent(
      "当前没有可用商品"
    );
    expect(emptyNotice).toHaveAttribute("data-state", "empty");
    expect(emptyNotice).toHaveAttribute("aria-live", "polite");
    const emptyMarker = emptyNotice.querySelector(
      ".portal-notice__marker[aria-hidden=\"true\"]"
    );
    expect(emptyMarker).toBeInTheDocument();
    expect(emptyMarker).toHaveAttribute("fill", "none");
    loadingView.unmount();

    await openMarketplace(createLocalUserPortalClient());
    const unavailableNotice = await screen.findByRole("status");
    expect(unavailableNotice).toHaveTextContent(
      "当前客户端未提供服务端商城能力"
    );
    expect(unavailableNotice).toHaveAttribute("data-state", "unavailable");
    expect(unavailableNotice).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText("服务端基础套餐")).not.toBeInTheDocument();
    cleanup();

    const authList = vi.fn()
      .mockRejectedValue(new PortalCoinCommerceClientError(
        "commerce_session_invalid",
        false
      ));
    await openMarketplace(portalClientWithCommerce(commerceClient({
      listOffers: authList
    })));
    const authAlert = await screen.findByRole("alert");
    expect(authAlert).toHaveTextContent("商城会话已失效，请重新登录");
    expect(authAlert).toHaveAttribute("data-state", "error");
    expect(authAlert).toHaveAttribute("aria-live", "assertive");
    const authMarker = authAlert.querySelector(
      ".portal-notice__marker[aria-hidden=\"true\"]"
    );
    expect(authMarker).toBeInTheDocument();
    expect(authMarker).toHaveAttribute("fill", "none");
    expect(within(authAlert).queryByRole("button", { name: "重试" }))
      .not.toBeInTheDocument();
    cleanup();

    const failingList = vi.fn()
      .mockRejectedValueOnce(new PortalCoinCommerceClientError(
        "commerce_unavailable",
        true
      ))
      .mockResolvedValueOnce([planOffer]);
    const failingCommerce = commerceClient({ listOffers: failingList });
    await openMarketplace(portalClientWithCommerce(failingCommerce));
    const retryAlert = await screen.findByRole("alert");
    expect(retryAlert).toHaveTextContent("Coins 购买流程暂时不可用");
    fireEvent.click(within(retryAlert).getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).toBeInTheDocument();
    expect(failingList).toHaveBeenCalledTimes(2);
  });

  test("opens details and Quote confirmation with one dialog and restores each card origin", async () => {
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote)
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    const details = within(planCard).getByRole("button", {
      name: "查看详情：服务端基础套餐"
    });
    const purchase = within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });

    fireEvent.click(details);
    const detailDialog = await screen.findByRole("dialog", {
      name: "服务端基础套餐"
    });
    const currentTheme = document.querySelector<HTMLElement>(
      ".portal-v2-shell"
    )?.dataset.portalTheme;
    const dialogTheme = detailDialog.closest<HTMLElement>(
      ".portal-coins-dialog-theme"
    );
    expect(currentTheme).toMatch(/^(light|dark)$/);
    expect(dialogTheme).toContainElement(detailDialog);
    expect(dialogTheme?.dataset.portalTheme).toBe(currentTheme);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(commerce.getOffer).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      offerRef: "offer_plan_basic"
    });
    fireEvent.keyDown(detailDialog, { key: "Escape" });
    await waitFor(() => expect(details).toHaveFocus());

    fireEvent.click(details);
    const detailToQuoteDialog = await screen.findByRole("dialog", {
      name: "服务端基础套餐"
    });
    fireEvent.click(within(detailToQuoteDialog).getByRole("button", {
      name: "预览 Coins 结算"
    }));
    const quoteFromDetails = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(within(quoteFromDetails).getByRole("button", {
      name: "关闭"
    }));
    await waitFor(() => expect(details).toHaveFocus());

    fireEvent.click(purchase);
    const purchaseDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(commerce.previewCheckout).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      offerRef: "offer_plan_basic"
    });
    expect(within(purchaseDialog).getByText("42 Coins"))
      .toBeInTheDocument();
    expect(within(purchaseDialog).getByText(/之前: 52/))
      .toBeInTheDocument();
    fireEvent.click(within(purchaseDialog).getByRole("button", {
      name: "关闭"
    }));
    await waitFor(() => expect(purchase).toHaveFocus());
  });

  test("uses accessible loading and safe failure surfaces without mounting a blank dialog", async () => {
    const detail = deferred<PortalCoinOffer>();
    const preview = deferred<PortalCoinQuote>();
    const commerce = commerceClient({
      getOffer: vi.fn(() => detail.promise),
      previewCheckout: vi.fn(() => preview.promise)
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    const purchaseAction = within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });
    fireEvent.click(purchaseAction);

    const detailLoadingNotice = screen.getByRole("status");
    expect(detailLoadingNotice).toHaveTextContent(
      "正在加载商品详情"
    );
    expect(detailLoadingNotice).toHaveAttribute("data-state", "loading");
    expect(detailLoadingNotice.querySelector(
      ".portal-notice__indicator--loading[aria-hidden=\"true\"]"
    )).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      detail.resolve(planOffer);
      await detail.promise;
    });
    const quoteLoadingNotice = await screen.findByRole("status");
    expect(quoteLoadingNotice).toHaveTextContent(
      "正在获取服务端报价"
    );
    expect(quoteLoadingNotice).toHaveAttribute("data-state", "loading");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      preview.reject(new PortalCoinCommerceClientError(
        "commerce_unavailable",
        true
      ));
      await preview.promise.catch(() => undefined);
    });
    const flowErrorNotice = await screen.findByRole("alert");
    expect(flowErrorNotice).toHaveTextContent(
      "Coins 购买流程暂时不可用"
    );
    expect(flowErrorNotice).toHaveAttribute("data-state", "error");
    expect(flowErrorNotice).toHaveAttribute("aria-live", "assertive");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("does not let an older purchase continuation upgrade a newer product detail", async () => {
    const oldPlanDetail = deferred<PortalCoinOffer>();
    const currentDataPackDetail = deferred<PortalCoinOffer>();
    const previewCheckout = vi.fn(async () => ({
      ...availableQuote,
      offer: dataPackOffer
    }));
    const commerce = commerceClient({
      getOffer: vi.fn(({ offerRef }) => (
        offerRef === planOffer.offerRef
          ? oldPlanDetail.promise
          : currentDataPackDetail.promise
      )),
      previewCheckout
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    const dataPackCard = screen.getByRole("heading", {
      name: "服务端流量包"
    }).closest("article") as HTMLElement;
    const oldPurchase = within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });
    const currentDetails = within(dataPackCard).getByRole("button", {
      name: "查看详情：服务端流量包"
    });

    await act(async () => {
      oldPurchase.click();
      currentDetails.click();
    });
    await act(async () => {
      currentDataPackDetail.resolve(dataPackOffer);
      await currentDataPackDetail.promise;
    });
    expect(await screen.findByRole("dialog", {
      name: "服务端流量包"
    })).toBeInTheDocument();
    await act(async () => {
      oldPlanDetail.resolve(planOffer);
      await oldPlanDetail.promise;
    });

    await waitFor(() => expect(previewCheckout).not.toHaveBeenCalled());
    expect(screen.getByRole("dialog", {
      name: "服务端流量包"
    })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", {
      name: "确认 Coins 购买"
    })).not.toBeInTheDocument();
  });

  test("blocks repeated confirmation after a non-retryable create failure", async () => {
    const createOrder = vi.fn().mockRejectedValue(
      new PortalCoinCommerceClientError("commerce_session_invalid", false)
    );
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    const purchaseAction = within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });
    fireEvent.click(purchaseAction);
    const dialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    const confirm = within(dialog).getByRole("button", {
      name: "确认购买"
    });
    fireEvent.click(confirm);

    expect(await within(dialog).findByText("会话已失效，请重新登录。"))
      .toBeInTheDocument();
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(createOrder).toHaveBeenCalledTimes(1);
    const close = within(dialog).getByRole("button", { name: "关闭" });
    expect(close).not.toBeDisabled();
    fireEvent.click(close);
    await waitFor(() => expect(purchaseAction).toHaveFocus());
    expect(screen.queryByRole("dialog", {
      name: "确认 Coins 购买"
    })).not.toBeInTheDocument();
  });

  test("keeps the create intent owned while the Order POST is submitting", async () => {
    const pendingOrder = deferred<PortalCoinOrder>();
    const createOrder = vi.fn(() => pendingOrder.promise);
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "确认购买"
    }));
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));

    const close = within(dialog).getByRole("button", { name: "关闭" });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(close).toBeDisabled();
    fireEvent.click(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", {
      name: "确认 Coins 购买"
    })).toBeInTheDocument();
    const dataPackCard = screen.getByRole("heading", {
      name: "服务端流量包"
    }).closest("article") as HTMLElement;
    expect(within(dataPackCard).getByRole("button", {
      name: "查看详情：服务端流量包"
    })).toBeDisabled();
    expect(within(dataPackCard).getByRole("button", {
      name: "使用 Coins 购买：服务端流量包"
    })).toBeDisabled();

    await act(async () => {
      pendingOrder.resolve(heldOrder);
      await pendingOrder.promise;
    });
    expect(await within(dialog).findByText("Coins 已预留"))
      .toBeInTheDocument();
    expect(close).not.toBeDisabled();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      quoteRef: "quote_plan_basic",
      idempotencyKey: expect.any(String)
    });
  });

  test("moves from details to Quote, explicit confirm, held status, cancel, and GET readback", async () => {
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder: vi.fn(async () => heldOrder),
      cancelOrder: vi.fn(async () => heldOrder),
      getOrder: vi.fn(async () => cancelledOrder)
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(planCard).getByRole("button", {
      name: "查看详情：服务端基础套餐"
    }));
    const detailDialog = await screen.findByRole("dialog", {
      name: "服务端基础套餐"
    });
    fireEvent.click(within(detailDialog).getByRole("button", {
      name: "预览 Coins 结算"
    }));
    const quoteDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    fireEvent.click(within(quoteDialog).getByRole("button", {
      name: "确认购买"
    }));

    expect(await within(quoteDialog).findByText("Coins 已预留"))
      .toHaveAttribute("aria-live", "polite");
    expect(quoteDialog.querySelector(".portal-coins-status-spinner"))
      .toHaveAttribute("aria-hidden", "true");
    expect(commerce.createOrder).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      quoteRef: "quote_plan_basic",
      idempotencyKey: expect.any(String)
    });
    fireEvent.click(within(quoteDialog).getByRole("button", {
      name: "取消订单"
    }));
    expect(await within(quoteDialog).findByText(
      "订单已取消，预留已释放"
    )).toBeInTheDocument();
    expect(commerce.cancelOrder).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      orderRef: "order_plan_basic",
      idempotencyKey: expect.any(String)
    });
    expect(commerce.getOrder).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      orderRef: "order_plan_basic"
    });
  });

  test("reopens a non-terminal Order instead of discarding it for another product", async () => {
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder: vi.fn(async () => heldOrder),
      getOrder: vi.fn(async () => heldOrder)
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    const purchaseAction = within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });
    fireEvent.click(purchaseAction);
    const orderDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    fireEvent.click(within(orderDialog).getByRole("button", {
      name: "确认购买"
    }));
    expect(await within(orderDialog).findByText("Coins 已预留"))
      .toBeInTheDocument();
    fireEvent.click(within(orderDialog).getByRole("button", {
      name: "关闭"
    }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    const dataPackCard = screen.getByRole("heading", {
      name: "服务端流量包"
    }).closest("article") as HTMLElement;
    fireEvent.click(within(dataPackCard).getByRole("button", {
      name: "使用 Coins 购买：服务端流量包"
    }));

    const reopenedDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    expect(within(reopenedDialog).getByText("Coins 已预留"))
      .toBeInTheDocument();
    expect(commerce.getOffer).toHaveBeenCalledTimes(1);
    expect(commerce.previewCheckout).toHaveBeenCalledTimes(1);
    expect(commerce.createOrder).toHaveBeenCalledTimes(1);
  });

  test("opens a recovered non-terminal Order once and respects an explicit close", async () => {
    window.sessionStorage.setItem(
      PORTAL_COIN_ORDER_STORAGE_KEY,
      JSON.stringify({ orderRef: heldOrder.orderRef })
    );
    const getOrder = vi.fn(async () => heldOrder);
    await openMarketplace(portalClientWithCommerce(commerceClient({
      getOrder
    })));

    const recoveredDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    expect(within(recoveredDialog).getByText("Coins 已预留"))
      .toBeInTheDocument();
    expect(getOrder).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      orderRef: heldOrder.orderRef
    });

    fireEvent.click(within(recoveredDialog).getByRole("button", {
      name: "关闭"
    }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("uses GET refresh for captured delivery and never invents success", async () => {
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder: vi.fn(async () => heldOrder),
      getOrder: vi.fn(async () => deliveredOrder)
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "确认购买"
    }));
    expect(await within(dialog).findByText("Coins 已预留"))
      .toBeInTheDocument();
    expect(within(dialog).queryByText("购买和交付已完成"))
      .not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", {
      name: "刷新订单"
    }));
    expect(await within(dialog).findByText("购买和交付已完成"))
      .toBeInTheDocument();
  });

  test("refreshes the real Portal Wallet balance after Marketplace Hold and capture", async () => {
    const wallet: PortalWalletClient = {
      getSummary: vi.fn()
        .mockResolvedValueOnce(walletSummary(1000, 0))
        .mockResolvedValueOnce(walletSummary(800, 200))
        .mockResolvedValue(walletSummary(800, 0)),
      listLedger: vi.fn(async () => ({ entries: [], nextCursor: null }))
    };
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder: vi.fn(async () => heldOrder),
      getOrder: vi.fn(async () => deliveredOrder)
    });
    const client = portalClientWithCommerce(commerce);
    client.wallet = wallet;

    await openMarketplace(client);
    expect(await screen.findByText("Coins · 1000")).toBeInTheDocument();

    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "确认购买"
    }));

    expect(await within(dialog).findByText("Coins 已预留"))
      .toBeInTheDocument();
    expect(await screen.findByText("Coins · 800")).toBeInTheDocument();
    expect(wallet.getSummary).toHaveBeenCalledTimes(2);

    fireEvent.click(within(dialog).getByRole("button", {
      name: "刷新订单"
    }));
    expect(await within(dialog).findByText("购买和交付已完成"))
      .toBeInTheDocument();
    await waitFor(() => {
      expect(wallet.getSummary).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByText("Coins · 800")).toBeInTheDocument();
  });

  test("keeps an insufficient Quote in the purchase dialog without exposing recharge UI", async () => {
    const commerce = commerceClient({
      previewCheckout: vi.fn(async () => insufficientQuote)
    });
    await openMarketplace(portalClientWithCommerce(commerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    const purchaseAction = within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    });
    fireEvent.click(purchaseAction);
    const coinsDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    expect(within(coinsDialog).getByRole("button", {
      name: "确认购买"
    })).toBeDisabled();
    expect(within(coinsDialog).queryByRole("button", {
      name: "打开充值"
    })).not.toBeInTheDocument();
    expect(within(coinsDialog).getByText(/缺少 5 Coins/))
      .toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("dialog", { name: "充值 Coins" }))
      .not.toBeInTheDocument();
    expect(commerce.createOrder).not.toHaveBeenCalled();
  });

  test("keeps bilingual capability parity and the unknown Wallet balance boundary", async () => {
    await openMarketplace(portalClientWithCommerce(commerceClient()));
    expect(await screen.findByText("Coins · --")).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", {
      name: "用户中心导航"
    });
    fireEvent.click(within(navigation).getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    fireEvent.click(within(screen.getByRole("navigation", {
      name: "User center navigation"
    })).getByRole("button", { name: "Marketplace" }));

    expect(await screen.findByRole("heading", { name: "Plans" }))
      .toBeInTheDocument();
    const englishCard = screen.getByRole("heading", {
      name: "Server basic plan"
    }).closest("article") as HTMLElement;
    expect(within(englishCard).getByText("Server plan summary"))
      .toBeInTheDocument();
    expect(within(englishCard).getByText("Price").parentElement)
      .toHaveTextContent("Price42 Coins");
    const englishDetails = within(englishCard).getByRole("button", {
      name: "Details: Server basic plan"
    });
    const englishBuy = within(englishCard).getByRole("button", {
      name: "Buy with Coins: Server basic plan"
    });
    expect(englishDetails.textContent).toBe("Details");
    expect(englishDetails).toHaveAccessibleName(
      `${englishDetails.textContent}: Server basic plan`
    );
    expect(englishBuy.textContent).toBe("Buy with Coins");
    expect(englishBuy).toHaveAccessibleName(
      `${englishBuy.textContent}: Server basic plan`
    );
    expect(screen.getByText("Coins · --")).toBeInTheDocument();
  });

  test("latest session catalog wins and logout ignores the old catalog", async () => {
    const first = deferred<PortalCoinOffer[]>();
    const second = deferred<PortalCoinOffer[]>();
    const listOffers = vi.fn(({ sessionRef }: { sessionRef: string }) => (
      sessionRef === "portal_session_first" ? first.promise : second.promise
    ));
    const commerce = commerceClient({ listOffers });
    const view = render(createElement(MarketplacePanel, {
      commerceClient: commerce,
      locale: "en",
      sessionRef: "portal_session_first",
      theme: "light"
    }));
    view.rerender(createElement(MarketplacePanel, {
      commerceClient: commerce,
      locale: "en",
      sessionRef: "portal_session_second",
      theme: "light"
    }));
    await act(async () => {
      first.resolve([planOffer]);
      second.resolve([dataPackOffer]);
      await Promise.all([first.promise, second.promise]);
    });
    expect(screen.queryByRole("heading", {
      name: "Server basic plan"
    })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {
      name: "Server data pack"
    })).toBeInTheDocument();
    view.unmount();

    const oldCatalog = deferred<PortalCoinOffer[]>();
    const oldCommerce = commerceClient({
      listOffers: vi.fn(() => oldCatalog.promise)
    });
    const oldClient = portalClientWithCommerce(oldCommerce);
    oldClient.authenticate = vi.fn(async () => session);
    await loginAndOpenMarketplace(oldClient);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await act(async () => {
      oldCatalog.resolve([planOffer]);
      await oldCatalog.promise;
    });
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText("服务端基础套餐")).not.toBeInTheDocument();
  });

  test("session replacement clears a pending product surface and ignores its old detail", async () => {
    const oldDetail = deferred<PortalCoinOffer>();
    const getOffer = vi.fn(({
      sessionRef,
      offerRef
    }: {
      sessionRef: string;
      offerRef: string;
    }) => (
      sessionRef === "portal_session_first"
        ? oldDetail.promise
        : Promise.resolve(
            offerRef === dataPackOffer.offerRef ? dataPackOffer : planOffer
          )
    ));
    const commerce = commerceClient({
      getOffer,
      listOffers: vi.fn(async ({ sessionRef }) => (
        sessionRef === "portal_session_first"
          ? [planOffer]
          : [dataPackOffer]
      ))
    });
    const view = render(createElement(MarketplacePanel, {
      commerceClient: commerce,
      locale: "en",
      sessionRef: "portal_session_first",
      theme: "light"
    }));
    const oldCard = (await screen.findByRole("heading", {
      name: "Server basic plan"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(oldCard).getByRole("button", {
      name: "Details: Server basic plan"
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Loading product details"
    );

    view.rerender(createElement(MarketplacePanel, {
      commerceClient: commerce,
      locale: "en",
      sessionRef: "portal_session_second",
      theme: "light"
    }));
    expect(await screen.findByRole("heading", {
      name: "Server data pack"
    })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".portal-coins-dialog-theme"))
        .not.toBeInTheDocument();
    });
    await act(async () => {
      oldDetail.resolve(planOffer);
      await oldDetail.promise;
    });
    expect(screen.queryByRole("dialog", {
      name: "Server basic plan"
    })).not.toBeInTheDocument();

    const currentCard = screen.getByRole("heading", {
      name: "Server data pack"
    }).closest("article") as HTMLElement;
    fireEvent.click(within(currentCard).getByRole("button", {
      name: "Details: Server data pack"
    }));
    expect(await screen.findByRole("dialog", {
      name: "Server data pack"
    })).toBeInTheDocument();
    expect(getOffer).toHaveBeenLastCalledWith({
      sessionRef: "portal_session_second",
      offerRef: "offer_data_pack"
    });
  });

  test("logout removes Order recovery before a different user can mount Commerce", async () => {
    const firstCommerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder: vi.fn(async () => heldOrder)
    });
    await openMarketplace(portalClientWithCommerce(firstCommerce));
    const planCard = (await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(planCard).getByRole("button", {
      name: "使用 Coins 购买：服务端基础套餐"
    }));
    const orderDialog = await screen.findByRole("dialog", {
      name: "确认 Coins 购买"
    });
    fireEvent.click(within(orderDialog).getByRole("button", {
      name: "确认购买"
    }));
    expect(await within(orderDialog).findByText("Coins 已预留"))
      .toBeInTheDocument();
    expect(window.sessionStorage.getItem(PORTAL_COIN_ORDER_STORAGE_KEY))
      .not.toBeNull();
    fireEvent.click(within(orderDialog).getByRole("button", {
      name: "关闭"
    }));
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(window.sessionStorage.getItem(PORTAL_COIN_ORDER_STORAGE_KEY))
      .toBeNull();
    cleanup();

    const getOrder = vi.fn(async () => heldOrder);
    const secondCommerce = commerceClient({ getOrder });
    const secondSession: PortalSession = {
      ...session,
      sessionRef: "portal_session_second_user",
      userRef: "user_second",
      displayName: "Second user"
    };
    render(createElement(UserPortalPage, {
      initialSession: secondSession,
      portalClient: portalClientWithCommerce(secondCommerce)
    }));
    const navigation = await screen.findByRole("navigation", {
      name: "用户中心导航"
    });
    fireEvent.click(within(navigation).getByRole("button", {
      name: "商城"
    }));
    expect(await screen.findByRole("heading", {
      name: "服务端基础套餐"
    })).toBeInTheDocument();
    expect(getOrder).not.toHaveBeenCalled();
  });

  test("logout stays usable when exact Order recovery removal is unavailable", async () => {
    const removeItem = vi.spyOn(Storage.prototype, "removeItem")
      .mockImplementation((key) => {
        if (key === PORTAL_COIN_ORDER_STORAGE_KEY) {
          throw new DOMException("storage unavailable");
        }
      });
    render(createElement(UserPortalPage, {
      initialSession: session,
      portalClient: portalClientWithCommerce(commerceClient())
    }));
    fireEvent.click(await screen.findByRole("button", { name: "退出登录" }));

    expect(removeItem).toHaveBeenCalledWith(PORTAL_COIN_ORDER_STORAGE_KEY);
    expect(screen.getByRole("heading", { name: "账号登录" }))
      .toBeInTheDocument();
  });

  test("same-session client replacement fences a pending Quote but preserves the next client", async () => {
    const oldQuote = deferred<PortalCoinQuote>();
    const oldCommerce = commerceClient({
      previewCheckout: vi.fn(() => oldQuote.promise)
    });
    const currentCommerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote)
    });
    const view = render(createElement(MarketplacePanel, {
      commerceClient: oldCommerce,
      locale: "en",
      sessionRef: "portal_session_marketplace",
      theme: "dark"
    }));
    const oldCard = (await screen.findByRole("heading", {
      name: "Server basic plan"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(oldCard).getByRole("button", {
      name: "Buy with Coins: Server basic plan"
    }));
    await waitFor(() => {
      expect(oldCommerce.previewCheckout).toHaveBeenCalledTimes(1);
    });

    view.rerender(createElement(MarketplacePanel, {
      commerceClient: currentCommerce,
      locale: "en",
      sessionRef: "portal_session_marketplace",
      theme: "dark"
    }));
    await act(async () => {
      oldQuote.resolve(availableQuote);
      await oldQuote.promise;
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "Confirm Coins purchase"
      })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("42 Coins")).toHaveLength(1);

    const currentCard = (await screen.findByRole("heading", {
      name: "Server basic plan"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(currentCard).getByRole("button", {
      name: "Buy with Coins: Server basic plan"
    }));
    expect(await screen.findByRole("dialog", {
      name: "Confirm Coins purchase"
    })).toBeInTheDocument();
    expect(currentCommerce.getOffer).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      offerRef: "offer_plan_basic"
    });
    expect(currentCommerce.previewCheckout).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      offerRef: "offer_plan_basic"
    });
  });

  test("same-session client replacement fences a Quote after its owned create fails", async () => {
    const oldCreate = deferred<PortalCoinOrder>();
    const oldCommerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote),
      createOrder: vi.fn(() => oldCreate.promise)
    });
    const currentCommerce = commerceClient({
      previewCheckout: vi.fn(async () => availableQuote)
    });
    const view = render(createElement(MarketplacePanel, {
      commerceClient: oldCommerce,
      locale: "en",
      sessionRef: "portal_session_marketplace",
      theme: "dark"
    }));
    const oldCard = (await screen.findByRole("heading", {
      name: "Server basic plan"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(oldCard).getByRole("button", {
      name: "Buy with Coins: Server basic plan"
    }));
    const dialog = await screen.findByRole("dialog", {
      name: "Confirm Coins purchase"
    });
    fireEvent.click(within(dialog).getByRole("button", {
      name: "Confirm purchase"
    }));
    await waitFor(() => {
      expect(oldCommerce.createOrder).toHaveBeenCalledTimes(1);
    });

    view.rerender(createElement(MarketplacePanel, {
      commerceClient: currentCommerce,
      locale: "en",
      sessionRef: "portal_session_marketplace",
      theme: "dark"
    }));
    await act(async () => {
      oldCreate.reject(new PortalCoinCommerceClientError(
        "commerce_request_failed",
        true
      ));
      await oldCreate.promise.catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", {
        name: "Confirm Coins purchase"
      })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("42 Coins")).toHaveLength(1);

    const currentCard = (await screen.findByRole("heading", {
      name: "Server basic plan"
    })).closest("article") as HTMLElement;
    fireEvent.click(within(currentCard).getByRole("button", {
      name: "Buy with Coins: Server basic plan"
    }));
    expect(await screen.findByRole("dialog", {
      name: "Confirm Coins purchase"
    })).toBeInTheDocument();
    expect(currentCommerce.getOffer).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      offerRef: "offer_plan_basic"
    });
    expect(currentCommerce.previewCheckout).toHaveBeenCalledWith({
      sessionRef: "portal_session_marketplace",
      offerRef: "offer_plan_basic"
    });
  });

  test("keeps no-notice card actions as the final auto-pushed child", async () => {
    const noNoticeOffer: PortalCoinOffer = {
      ...planOffer,
      offerRef: "offer_plan_without_notices",
      offerVersionRef: "offer_version_plan_without_notices",
      importantNotices: { zh: [], en: [] }
    };
    render(createElement(MarketplacePanel, {
      commerceClient: commerceClient({
        listOffers: vi.fn(async () => [noNoticeOffer])
      }),
      locale: "en",
      sessionRef: "portal_session_marketplace",
      theme: "dark"
    }));

    const card = (await screen.findByRole("heading", {
      name: "Server basic plan"
    })).closest("article") as HTMLElement;
    const actions = card.querySelector<HTMLElement>(
      ".portal-marketplace-card__actions"
    );
    expect(card.querySelector(".portal-marketplace-card__notices")).toBeNull();
    expect(actions).not.toBeNull();
    expect(actions?.parentElement).toBe(card);
    expect(card.lastElementChild).toBe(actions);

    const css = readCommerceCss();
    const articleRule = cssRuleBlock(
      css,
      ".portal-v2-shell .portal-marketplace-card article"
    );
    const actionsRule = cssRuleBlock(
      css,
      ".portal-v2-shell .portal-marketplace-card__actions"
    );
    expect(css).not.toMatch(
      /grid-template-rows\s*:\s*auto\s+auto\s+auto\s+1fr\s+auto\s*;/
    );
    expect(articleRule).toMatch(/(?:^|\s)display\s*:\s*flex\s*;/);
    expect(articleRule).toMatch(
      /(?:^|\s)flex-direction\s*:\s*column\s*;/
    );
    expect(actionsRule).toMatch(/(?:^|\s)margin-top\s*:\s*auto\s*;/);
  });

  test("Commerce CSS keeps theme, focus, safe-area, and responsive rules scoped", () => {
    const css = readCommerceCss();
    expect(css).toMatch(
      /\.portal-coins-dialog-theme\s+\.portal-coins-dialog-backdrop\s*\{/
    );
    expect(css).toMatch(
      /\.portal-coins-dialog-theme\s+\.portal-coins-dialog\s*\{/
    );
    expect(css).not.toContain(
      ".portal-v2-shell .portal-coins-dialog-backdrop"
    );
    expect(css).not.toMatch(
      /(^|\n)\.portal-coins-dialog-backdrop\s*\{/
    );
    const darkThemeRule = cssRuleBlock(
      css,
      '.portal-v2-shell[data-portal-theme="dark"]'
    );
    const lightThemeRule = cssRuleBlock(
      css,
      '.portal-v2-shell[data-portal-theme="light"]'
    );
    expect(darkThemeRule).toMatch(
      /--portal-commerce-focus-accent\s*:\s*#20d5e8\s*;/
    );
    expect(lightThemeRule).toMatch(
      /--portal-commerce-focus-accent\s*:\s*#0969da\s*;/
    );
    expect(css).not.toContain("portal-coins-wallet-entry");
    expect(css).toMatch(
      /\.portal-v2-shell \.portal-commerce-layout button:focus-visible\s*\{\s*outline: 3px solid var\(--portal-commerce-focus-accent\);\s*outline-offset: 2px;\s*box-shadow: none;\s*\}/
    );
    expect(css).not.toContain(
      "box-shadow: 0 0 0 3px rgba(32, 213, 232, 0.2)"
    );
    expect(css).toContain("@media (max-width: 960px)");
    expect(css).toMatch(
      /@media \(max-width: 960px\)\s*\{\s*\.portal-v2-shell \.portal-marketplace-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/
    );
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain(`max-height: calc(
    100dvh
    - max(16px, env(safe-area-inset-top))
    - max(16px, env(safe-area-inset-bottom))
  );`);
    expect(css).toContain(`max-height: calc(
      100dvh
      - max(8px, env(safe-area-inset-top))
      - max(8px, env(safe-area-inset-bottom))
    );`);
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".portal-coins-dialog button:focus-visible");
  });
});
