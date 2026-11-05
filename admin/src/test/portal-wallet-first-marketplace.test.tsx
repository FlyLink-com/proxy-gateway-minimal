import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  describe,
  expect,
  test,
  vi
} from "vitest";
import {
  act,
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
import { WalletFirstMarketplacePanel } from "../features/user-portal/wallet-first-marketplace-panel";
import { clearAdsClickData, clearPortalAdsServerConsent, PORTAL_ADS_CLICK_STORAGE_KEY, setAdsUserDataConsent, setPortalAdsServerConsent } from "../features/ads-attribution";

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
  clearAdsClickData();
  clearPortalAdsServerConsent();
  document.cookie = "gccwebos-ad-user-data-consent-v1=; Path=/; Max-Age=0";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Portal wallet-first Marketplace model gate", () => {
  test.each(["zh", "en"] as const)("%s names catalog regions without visible section headings and retains product CTAs", async (locale) => {
    const client = walletFirstClient();
    const pack: PortalCoinOffer = {
      ...OFFER,
      offerRef: "offer_data_pack",
      offerVersionRef: "offer_version_data_pack",
      category: "data_pack",
      title: { zh: "100 GB 流量包", en: "100 GB data pack" },
      delivery: {
        kind: "data_pack", durationDays: null, monthlyTrafficGb: null,
        trafficGb: 100, neverExpires: true, discountBasisPoints: null
      }
    };
    vi.mocked(client.listOffers).mockResolvedValue([OFFER, pack]);
    vi.mocked(client.listDeferredTransitions).mockResolvedValue([]);
    render(<WalletFirstMarketplacePanel
      commerceClient={client} locale={locale} sessionRef="test_session" theme="light"
    />);
    const label = locale === "zh" ? "套餐" : "Plans";
    const plans = await screen.findByRole("region", { name: label });
    expect(plans).toHaveAttribute("aria-label", label);
    expect(plans).not.toHaveAttribute("aria-labelledby");
    expect(within(plans).queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(within(plans).getByRole("heading", { level: 3, name: OFFER.title[locale] })).toBeInTheDocument();
    expect(within(plans).getByRole("button", {
      name: locale === "zh" ? "使用 Coins 预约：年度套餐" : "Reserve with Coins: Annual plan"
    })).toBeInTheDocument();
    const packLabel = locale === "zh" ? "流量包" : "Data packs";
    const dataPacks = screen.getByRole("region", { name: packLabel });
    expect(dataPacks).toHaveAttribute("aria-label", packLabel);
    expect(dataPacks).not.toHaveAttribute("aria-labelledby");
    expect(within(dataPacks).queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(within(dataPacks).getByRole("heading", { level: 3, name: pack.title[locale] })).toBeInTheDocument();
    expect(within(dataPacks).getByRole("button", {
      name: locale === "zh" ? "使用 Coins 预约：100 GB 流量包" : "Reserve with Coins: 100 GB data pack"
    })).toBeInTheDocument();
    expect(client.previewDeferredCheckout).not.toHaveBeenCalled();
    expect(client.reserveDeferredTransition).not.toHaveBeenCalled();
  });

  test.each(["zh", "en"] as const)("%s keeps loading and unavailable copy consumer-facing", (locale) => {
    const client = walletFirstClient();
    vi.mocked(client.listOffers).mockReturnValue(new Promise(() => {}));
    const view = render(<WalletFirstMarketplacePanel
      commerceClient={client} locale={locale} sessionRef="test_session" theme="light"
    />);
    expect(screen.getByRole("status")).toHaveTextContent(locale === "zh" ? "正在加载商城…" : "Loading the Marketplace…");
    expect(screen.getByRole("status")).not.toHaveTextContent(/钱包优先|wallet-first/i);
    view.rerender(<WalletFirstMarketplacePanel
      commerceClient={null} locale={locale} sessionRef={null} theme="light"
    />);
    expect(screen.getByRole("status")).toHaveTextContent(locale === "zh" ? "商城暂时不可用，请稍后再试。" : "The Marketplace is temporarily unavailable. Please try again later.");
    expect(screen.getByRole("status")).not.toHaveTextContent(/钱包优先|wallet-first/i);
  });

  test("keeps reservation facts and cancellation independent of simplified product cards", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "wallet_first_cancel_1" });
    let resolveCancellation!: (transition: PortalDeferredTransition) => void;
    const cancellation = new Promise<PortalDeferredTransition>((resolve) => {
      resolveCancellation = resolve;
    });
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    vi.mocked(walletFirst.cancelDeferredTransition).mockReturnValue(cancellation);
    renderMarketplace({ legacy, model: "wallet_first_unique_v1", walletFirst });
    const active = (await screen.findByRole("heading", { name: "正在进行的切换" })).closest("section")!;
    expect(screen.getByRole("region", { name: "商城目录" })).toHaveAttribute("data-commerce-model", "wallet_first_unique_v1");
    const card = within(active).getByRole("article");
    expect(card.parentElement).toHaveClass("portal-deferred-transition");
    expect(card.parentElement).not.toHaveClass("portal-marketplace-card");
    expect(card.parentElement?.parentElement).toHaveClass("portal-deferred-transition-list");
    const facts = card.querySelector(".portal-deferred-transition__facts");
    expect(facts).toHaveTextContent("执行方式到期后切换");
    expect(facts).toHaveTextContent("计划时间");
    expect(facts).toHaveTextContent("200 Coins");
    expect(card.querySelector(".portal-marketplace-card__facts")).toBeNull();
    expect(card.querySelector(".portal-marketplace-card__actions")).toBeNull();
    const cancel = within(card).getByRole("button", { name: "取消预留" });
    expect(cancel.parentElement).toHaveClass("portal-deferred-transition__actions");
    fireEvent.click(cancel);
    expect(cancel).toBeDisabled();
    expect(cancel).toHaveTextContent("正在取消…");
    fireEvent.click(cancel);
    expect(walletFirst.cancelDeferredTransition).toHaveBeenCalledTimes(1);
    expect(facts).toHaveTextContent("200 Coins");
    await act(async () => {
      resolveCancellation({ ...QUEUED_TRANSITION, state: "cancelled" });
      await cancellation;
    });
    expect(screen.queryByRole("button", { name: "取消预留" })).not.toBeInTheDocument();
    const recent = screen.getByRole("heading", { name: "近期切换" }).closest("section");
    expect(recent).toHaveTextContent("已取消");
    expect(recent).toHaveTextContent("200 Coins");
    expect(walletFirst.reserveDeferredTransition).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
  });

  test("owns responsive reservation facts and intrinsic actions outside product-card selectors", () => {
    const style = document.createElement("style");
    style.textContent = readFileSync(resolve("src/styles/portal-static-preserve/user-portal-commerce.css"), "utf8");
    document.head.append(style);
    try {
      const prefix = ".portal-v2-shell .portal-wallet-first-transition-queue";
      const readDeclaration = (suffix: string, property: string, media?: string) => {
        let value = "";
        for (const rule of Array.from(style.sheet?.cssRules ?? [])) {
          const candidates = media && rule instanceof CSSMediaRule && rule.conditionText === media
            ? Array.from(rule.cssRules) : media ? [] : [rule];
          for (const candidate of candidates) {
            if (candidate instanceof CSSStyleRule && candidate.selectorText === `${prefix} ${suffix}`) {
              value = candidate.style.getPropertyValue(property).trim() || value;
            }
          }
        }
        return value;
      };
      expect(readDeclaration(".portal-deferred-transition-list", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
      expect(readDeclaration(".portal-deferred-transition > article", "display")).toBe("flex");
      expect(readDeclaration(".portal-deferred-transition h4", "font-size")).toBe("17px");
      expect(readDeclaration(".portal-deferred-transition__facts", "grid-template-columns")).toBe("repeat(2, minmax(0, 1fr))");
      expect(readDeclaration(".portal-deferred-transition__facts", "grid-template-columns", "(max-width: 720px)")).toBe("minmax(0, 1fr)");
      expect(readDeclaration(".portal-deferred-transition-list", "grid-template-columns", "(max-width: 720px)")).toBe("minmax(0, 1fr)");
      expect(readDeclaration(".portal-deferred-transition__actions", "display")).toBe("flex");
      expect(readDeclaration(".portal-deferred-transition__actions button", "width")).toBe("auto");
      expect(readDeclaration(".portal-deferred-transition__actions button", "min-height")).toBe("44px");
      expect(readDeclaration(".portal-deferred-transition__actions button:disabled", "cursor")).toBe("not-allowed");
      expect(readDeclaration(".portal-deferred-transition__actions button:focus-visible", "outline")).toBe("3px solid var(--portal-commerce-accent)");
    } finally {
      style.remove();
    }
  });

  test("keeps quote-bound reservation terms without implementation copy before any reserve", async () => {
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    vi.mocked(walletFirst.previewDeferredCheckout).mockResolvedValue({
      ...QUOTE,
      offer: { ...OFFER, importantNotices: { zh: ["本次预约须知"], en: ["Terms for this reservation"] } }
    });
    renderMarketplace({ legacy, model: "wallet_first_unique_v1", walletFirst });
    fireEvent.click(await screen.findByRole("button", {
      name: "使用 Coins 预约：年度套餐"
    }));
    const dialog = await screen.findByRole("dialog", { name: "确认 Coins 服务切换" });
    expect(within(dialog).getByText("本次预约须知")).toBeInTheDocument();
    expect(within(dialog).queryByText("按订阅周期交付")).not.toBeInTheDocument();
    expect(within(dialog).getByText("365 天 · 每月 200 GB")).toBeInTheDocument();
    expect(within(dialog).getByText("赠送 Coins、已购 Coins、奖励 Coins")).toBeInTheDocument();
    expect(within(dialog).getByText("确认后将预留 Coins，按以下时间安排服务；进度可在商城查看。")).toBeInTheDocument();
    expect(within(dialog).queryByText(/服务端|报价队列|server|queue entry/i)).not.toBeInTheDocument();
    expect(walletFirst.reserveDeferredTransition).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
  });

  test("retains English data-pack reservation terms and never promises immediate purchase", async () => {
    const pack: PortalCoinOffer = {
      ...OFFER,
      category: "data_pack",
      title: { zh: "100 GB 流量包", en: "100 GB data pack" },
      delivery: {
        kind: "data_pack", durationDays: null, monthlyTrafficGb: null,
        trafficGb: 100, neverExpires: true, discountBasisPoints: null
      }
    };
    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    vi.mocked(walletFirst.listOffers).mockResolvedValue([pack]);
    vi.mocked(walletFirst.previewDeferredCheckout).mockResolvedValue({
      ...QUOTE,
      offer: { ...pack, importantNotices: { zh: [], en: ["Terms for this data pack"] } }
    });
    render(createElement(MarketplacePanel, {
      commerceClient: legacy,
      commerceModelClient: { getCommerceModel: vi.fn().mockResolvedValue("wallet_first_unique_v1") },
      locale: "en",
      sessionRef: "portal_session_wallet_first",
      theme: "light",
      walletFirstCommerceClient: walletFirst
    }));
    expect(screen.queryByRole("button", { name: /Details/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Reserve with Coins: 100 GB data pack" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm Coins service transition" });
    expect(within(dialog).getByText("100 GB · never expires")).toBeInTheDocument();
    expect(within(dialog).getByText("Accepted Coins").parentElement).toHaveTextContent("Bonus Coins, Purchased Coins, Reward Coins");
    expect(within(dialog).getByRole("list", { name: "Purchase terms" })).toHaveTextContent("Terms for this data pack");
    expect(within(dialog).queryByText(OFFER.importantNotices.en[0])).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Reserve Coins" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Confirm purchase" })).not.toBeInTheDocument();
    expect(walletFirst.reserveDeferredTransition).not.toHaveBeenCalled();
    expect(legacy.createOrder).not.toHaveBeenCalled();
  });

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
  test("attaches consented Ads attribution only to the final wallet-first reservation", async () => {
    vi.stubEnv("VITE_PUBLIC_ADS_CLICK_BINDING_ENABLED", "true");
    expect(setAdsUserDataConsent("granted")).toBe(true);
    // Site-cookie preference does not stand in for the Portal account grant.
    setPortalAdsServerConsent("portal_session_wallet_first", "granted");
    window.sessionStorage.setItem(PORTAL_ADS_CLICK_STORAGE_KEY, JSON.stringify({
      type: "gbraid",
      value: "synthetic_wallet_click",
      clickAt: Date.now()
    }));
    vi.stubGlobal("crypto", { randomUUID: () => "wallet_first_ads_reserve_1" });

    const legacy = legacyClient();
    const walletFirst = walletFirstClient();
    renderMarketplace({ legacy, model: "wallet_first_unique_v1", walletFirst });

    fireEvent.click(await screen.findByRole("button", { name: "使用 Coins 预约：年度套餐" }));
    const dialog = await screen.findByRole("dialog", { name: "确认 Coins 服务切换" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认预留 Coins" }));

    await waitFor(() => {
      expect(walletFirst.reserveDeferredTransition).toHaveBeenCalledWith(expect.objectContaining({
        sessionRef: "portal_session_wallet_first",
        quoteRef: QUOTE.quoteRef,
        idempotencyKey: "wallet_first_ads_reserve_1",
        adsClick: {
          type: "gbraid",
          value: "synthetic_wallet_click",
          clickAt: expect.any(Number),
          consent: { adUserData: true, adPersonalization: false }
        }
      }));
    });
    expect(legacy.createOrder).not.toHaveBeenCalled();
  });

});
