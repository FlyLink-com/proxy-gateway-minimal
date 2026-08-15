import { createElement } from "react";
import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  describe,
  expect,
  test,
  vi
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";

import type {
  PortalCoinCommerceClient,
  PortalCoinOffer,
  PortalDeferredCheckoutQuote,
  PortalDeferredTransition,
  PortalWalletFirstCommerceClient
} from "../features/user-portal/commerce";
import { PortalCoinCommerceClientError } from "../features/user-portal/commerce";
import { MarketplacePanel } from "../features/user-portal/portal-commerce-panels";

const OFFER: PortalCoinOffer = {
  offerRef: "offer_annual_premium",
  offerVersionRef: "offerversion_annual_premium_1",
  category: "plan",
  title: { zh: "年度套餐", en: "Annual plan" },
  summary: { zh: "年度服务", en: "Annual service" },
  importantNotices: {
    zh: ["按订阅周期交付"],
    en: ["Delivered by subscription period"]
  },
  baseCoinUnits: 200,
  referencePrice: { currency: "CNY", amountMinor: 20_000 },
  acceptedCoinTypes: ["bonus_coins", "paid_coins", "reward_coins"],
  delivery: {
    kind: "subscription_plan",
    durationDays: 365,
    monthlyTrafficGb: 200,
    trafficGb: null,
    neverExpires: false,
    discountBasisPoints: 0
  }
};

const QUOTE: PortalDeferredCheckoutQuote = {
  quoteRef: "quote_annual_premium_1",
  offer: OFFER,
  amountUnits: 200,
  appliedDiscountBasisPoints: 0,
  purchaseAvailability: "available",
  shortfallUnits: 0,
  allocation: [{ coinType: "bonus_coins", amountUnits: 200 }],
  balances: {
    before: {
      bonusCoins: 1_000,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 800,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 200
    }
  },
  expiresAt: "2026-08-13T00:05:00.000Z",
  transition: {
    flowKind: "initial_activation",
    scheduledFor: "2026-08-13T00:00:00.000Z"
  }
};

const INSUFFICIENT_QUOTE: PortalDeferredCheckoutQuote = {
  ...QUOTE,
  purchaseAvailability: "insufficient_balance",
  shortfallUnits: 5,
  allocation: [],
  balances: {
    before: {
      bonusCoins: 195,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 0
    },
    after: {
      bonusCoins: 195,
      paidCoins: 0,
      rewardCoins: 0,
      heldCoins: 0
    }
  }
};

const QUEUED_TRANSITION: PortalDeferredTransition = {
  transitionRef: "transition_existing_1",
  offer: OFFER,
  amountUnits: 200,
  flowKind: "scheduled_switch",
  scheduledFor: "2027-08-13T00:00:00.000Z",
  state: "reserved",
  safeCode: null,
  reservedAt: "2026-08-13T00:00:00.000Z",
  settledAt: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z"
};

const RESERVED_TRANSITION: PortalDeferredTransition = {
  ...QUEUED_TRANSITION,
  transitionRef: "transition_new_1",
  flowKind: "initial_activation",
  scheduledFor: "2026-08-13T00:00:00.000Z"
};

const SETTLED_TRANSITION: PortalDeferredTransition = {
  ...QUEUED_TRANSITION,
  transitionRef: "transition_settled_1",
  state: "settled",
  settledAt: "2026-08-13T00:10:00.000Z",
  updatedAt: "2026-08-13T00:10:00.000Z"
};

function legacyClient(): PortalCoinCommerceClient {
  return {
    listOffers: vi.fn().mockResolvedValue([OFFER]),
    listOrders: vi.fn(),
    getOffer: vi.fn(),
    previewCheckout: vi.fn(),
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn()
  } as unknown as PortalCoinCommerceClient;
}

function walletFirstClient(): PortalWalletFirstCommerceClient {
  return {
    listOffers: vi.fn().mockResolvedValue([OFFER]),
    getOffer: vi.fn().mockResolvedValue(OFFER),
    previewDeferredCheckout: vi.fn().mockResolvedValue(QUOTE),
    listDeferredTransitions: vi.fn().mockResolvedValue([QUEUED_TRANSITION]),
    getDeferredTransition: vi.fn(),
    reserveDeferredTransition: vi.fn().mockResolvedValue(RESERVED_TRANSITION),
    cancelDeferredTransition: vi.fn().mockResolvedValue({
      ...QUEUED_TRANSITION,
      state: "cancelled"
    })
  } as unknown as PortalWalletFirstCommerceClient;
}

function renderMarketplace(input: {
  legacy: PortalCoinCommerceClient;
  model: "legacy" | "wallet_first_unique_v1";
  onOpenWallet?: () => void;
  onWalletMutation?: () => void;
  walletFirst: PortalWalletFirstCommerceClient;
}) {
  return render(createElement(MarketplacePanel, {
    commerceClient: input.legacy,
    commerceModelClient: {
      getCommerceModel: vi.fn().mockResolvedValue(input.model)
    },
    locale: "zh",
    onOpenWallet: input.onOpenWallet,
    onWalletMutation: input.onWalletMutation,
    sessionRef: "portal_session_wallet_first",
    sessionGeneration: 1,
    theme: "dark",
    walletFirstCommerceClient: input.walletFirst
  }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Portal wallet-first Marketplace model gate", () => {
  test("uses only the deferred client for a server-projected wallet-first account and presents its queue", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "wallet_first_reserve_1" });
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    const onWalletMutation = vi.fn();
    render(createElement(MarketplacePanel, {
      commerceClient: legacy,
      commerceModelClient: {
        getCommerceModel: vi.fn().mockResolvedValue("wallet_first_unique_v1")
      },
      locale: "zh",
      onWalletMutation,
      sessionRef: "portal_session_wallet_first",
      sessionGeneration: 1,
      theme: "dark",
      walletFirstCommerceClient: walletFirst
    }));

    await waitFor(() => {
      expect(walletFirst.listOffers).toHaveBeenCalledWith({
        sessionRef: "portal_session_wallet_first"
      });
      expect(walletFirst.listDeferredTransitions).toHaveBeenCalledWith({
        sessionRef: "portal_session_wallet_first"
      });
    });
    expect(legacy.listOffers).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "服务切换" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "正在进行的切换" })).toBeInTheDocument();
    expect(screen.getByText("到期后切换")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "使用 Coins 预约：年度套餐"
    }));
    await waitFor(() => {
      expect(walletFirst.previewDeferredCheckout).toHaveBeenCalledWith({
        sessionRef: "portal_session_wallet_first",
        offerRef: OFFER.offerRef
      });
    });
    expect(screen.getByRole("dialog", { name: "确认 Coins 服务切换" })).toBeInTheDocument();
    expect(screen.getByText("首次开通")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认预留 Coins" }));
    await waitFor(() => {
      expect(walletFirst.reserveDeferredTransition).toHaveBeenCalledWith({
        sessionRef: "portal_session_wallet_first",
        quoteRef: QUOTE.quoteRef,
        idempotencyKey: "wallet_first_reserve_1"
      });
    });
    expect(onWalletMutation).toHaveBeenCalledTimes(1);
    expect(legacy.createOrder).not.toHaveBeenCalled();
    expect(legacy.previewCheckout).not.toHaveBeenCalled();
  });

  test("keeps a server-projected legacy account on its existing client surface", async () => {
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    renderMarketplace({ legacy, model: "legacy", walletFirst });

    await waitFor(() => {
      expect(legacy.listOffers).toHaveBeenCalledWith({
        sessionRef: "portal_session_wallet_first"
      });
    });
    expect(walletFirst.listOffers).not.toHaveBeenCalled();
    expect(walletFirst.listDeferredTransitions).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "服务切换" })).not.toBeInTheDocument();
  });

  test("groups active and recent transitions and refreshes only the deferred transition read", async () => {
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    const onWalletMutation = vi.fn();
    vi.mocked(walletFirst.listDeferredTransitions)
      .mockResolvedValueOnce([QUEUED_TRANSITION, SETTLED_TRANSITION])
      .mockResolvedValueOnce([{
        ...QUEUED_TRANSITION,
        state: "processing",
        updatedAt: "2026-08-13T00:02:00.000Z"
      }]);
    renderMarketplace({
      legacy,
      model: "wallet_first_unique_v1",
      onWalletMutation,
      walletFirst
    });

    const activeHeading = await screen.findByRole("heading", { name: "正在进行的切换" });
    const recentHeading = screen.getByRole("heading", { name: "近期切换" });
    const activeSection = activeHeading.closest("section");
    const recentSection = recentHeading.closest("section");
    expect(activeSection).toHaveTextContent("已预留，等待执行");
    expect(recentSection).toHaveTextContent("已完成");

    fireEvent.click(screen.getByRole("button", { name: "刷新切换" }));

    await waitFor(() => {
      expect(walletFirst.listDeferredTransitions).toHaveBeenCalledTimes(2);
      expect(activeSection).toHaveTextContent("正在执行");
    });
    expect(walletFirst.listOffers).toHaveBeenCalledTimes(1);
    expect(walletFirst.reserveDeferredTransition).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
    expect(onWalletMutation).toHaveBeenCalledTimes(1);
  });

  test("keeps transitions visible when a manual refresh fails and retries only that read", async () => {
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    const onWalletMutation = vi.fn();
    vi.mocked(walletFirst.listDeferredTransitions)
      .mockResolvedValueOnce([QUEUED_TRANSITION])
      .mockRejectedValueOnce(new PortalCoinCommerceClientError(
        "commerce_request_failed",
        true
      ))
      .mockResolvedValueOnce([{
        ...QUEUED_TRANSITION,
        state: "processing",
        updatedAt: "2026-08-13T00:02:00.000Z"
      }]);
    renderMarketplace({
      legacy,
      model: "wallet_first_unique_v1",
      onWalletMutation,
      walletFirst
    });

    const activeHeading = await screen.findByRole("heading", { name: "正在进行的切换" });
    const activeSection = activeHeading.closest("section");
    fireEvent.click(screen.getByRole("button", { name: "刷新切换" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(activeSection).toHaveTextContent("已预留，等待执行");
    expect(onWalletMutation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => {
      expect(walletFirst.listDeferredTransitions).toHaveBeenCalledTimes(3);
      expect(activeSection).toHaveTextContent("正在执行");
    });
    expect(walletFirst.listOffers).toHaveBeenCalledTimes(1);
    expect(walletFirst.reserveDeferredTransition).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
    expect(onWalletMutation).toHaveBeenCalledTimes(1);
  });

  test("routes an insufficient wallet-first Quote to the existing Wallet without creating a payment or order", async () => {
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    const onOpenWallet = vi.fn();
    vi.mocked(walletFirst.previewDeferredCheckout).mockResolvedValue(INSUFFICIENT_QUOTE);
    renderMarketplace({
      legacy,
      model: "wallet_first_unique_v1",
      onOpenWallet,
      walletFirst
    });

    await screen.findByRole("button", { name: "使用 Coins 预约：年度套餐" });
    fireEvent.click(screen.getByRole("button", { name: "使用 Coins 预约：年度套餐" }));

    const dialog = await screen.findByRole("dialog", { name: "确认 Coins 服务切换" });
    expect(dialog).toHaveTextContent("仍缺少 5 Coins");
    expect(within(dialog).getByRole("button", { name: "确认预留 Coins" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "前往钱包" }));

    expect(onOpenWallet).toHaveBeenCalledTimes(1);
    expect(walletFirst.reserveDeferredTransition).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
  });
});
