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
  waitFor
} from "@testing-library/react";

import type {
  PortalCoinCommerceClient,
  PortalCoinOffer,
  PortalDeferredCheckoutQuote,
  PortalDeferredTransition,
  PortalWalletFirstCommerceClient
} from "../features/user-portal/commerce";
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
  walletFirst: PortalWalletFirstCommerceClient;
}) {
  return render(createElement(MarketplacePanel, {
    commerceClient: input.legacy,
    commerceModelClient: {
      getCommerceModel: vi.fn().mockResolvedValue(input.model)
    },
    locale: "zh",
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
    expect(screen.getByRole("heading", { name: "待处理的服务切换" })).toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: "待处理的服务切换" })).not.toBeInTheDocument();
  });
});
