import type { MouseEvent } from "react";
import { cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PortalCoinOffer } from "../features/user-portal/commerce/api-contract";
import { MarketplaceOfferCard } from "../features/user-portal/marketplace-offer-card";

type Locale = "zh" | "en";
type Mode = "purchase" | "reserve";

function offerFor(category: "plan" | "data_pack" = "plan", amount = 137): PortalCoinOffer {
  const common = {
    offerRef: `presentation_${category}`,
    offerVersionRef: `presentation_${category}_v1`,
    title: { zh: "服务端商品名称", en: "Server product title" },
    summary: { zh: "服务端商品说明", en: "Server product summary" },
    importantNotices: {
      zh: ["仅包括列出的交付资源", "请先查看详细条款"],
      en: ["Only listed delivery resources are included", "Read the detailed terms first"],
    },
    baseCoinUnits: amount,
    // The fiat reference and discount are deliberately different from the
    // catalog Coins amount. This presentation must not compute a quote.
    referencePrice: { currency: "CNY" as const, amountMinor: 98765 },
    acceptedCoinTypes: ["paid_coins", "bonus_coins", "reward_coins"] as PortalCoinOffer["acceptedCoinTypes"],
  };
  return category === "plan" ? {
    ...common,
    category,
    delivery: {
      kind: "subscription_plan",
      durationDays: 45,
      monthlyTrafficGb: 123,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 8750,
    },
  } : {
    ...common,
    category,
    delivery: {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: 57,
      neverExpires: true,
      discountBasisPoints: null,
    },
  };
}

function primaryLabel(locale: Locale, mode: Mode) {
  if (locale === "zh") return mode === "purchase" ? "使用 Coins 购买" : "使用 Coins 预约";
  return mode === "purchase" ? "Buy with Coins" : "Reserve with Coins";
}

function actionName(label: string, title: string, locale: Locale) {
  return `${label}${locale === "zh" ? "：" : ": "}${title}`;
}

function mountCard({
  offer = offerFor(), locale = "en", mode = "purchase", busy = false, onPrimary = vi.fn(),
}: {
  offer?: PortalCoinOffer; locale?: Locale; mode?: Mode; busy?: boolean;
  onPrimary?: (event: MouseEvent<HTMLButtonElement>) => void;
} = {}) {
  render(<ul aria-label="Marketplace results">
    <MarketplaceOfferCard busy={busy} locale={locale} offer={offer} mode={mode} onPrimary={onPrimary} />
  </ul>);
  const card = screen.getByRole("article");
  return {
    card,
    primary: within(card).getByRole("button", {
      name: actionName(primaryLabel(locale, mode), offer.title[locale], locale),
    }),
  };
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Shared marketplace offer-card presentation", () => {
  test.each([
    ["zh", "plan", 137], ["en", "plan", 137], ["zh", "plan", 0], ["en", "plan", 0],
    ["zh", "data_pack", 137], ["en", "data_pack", 137], ["zh", "data_pack", 0], ["en", "data_pack", 0],
  ] as const)("%s %s preserves the exact catalog price of %i Coins", (locale, category, amount) => {
    const offer = offerFor(category, amount);
    const original = structuredClone(offer);
    const { card } = mountCard({ offer, locale });
    const priceList = within(card).getByText(locale === "zh" ? "价格" : "Price").closest("dl")!;
    const price = within(priceList).getByRole("definition");
    expect(price.textContent).toBe(`${amount} Coins`);
    expect(price.querySelector(".portal-marketplace-card__amount")?.textContent).toBe(String(amount));
    expect(price.querySelector(".portal-marketplace-card__unit")?.textContent).toBe("Coins");
    expect(within(card).queryByText("987.65 Coins")).toBeNull();
    expect(offer).toEqual(original);
  });

  test.each([
    ["zh", "plan"], ["en", "plan"], ["zh", "data_pack"], ["en", "data_pack"],
  ] as const)("%s %s uses the same name, price, summary and single purchase action", (locale, category) => {
    const offer = offerFor(category);
    const { card, primary } = mountCard({ offer, locale });
    const heading = within(card).getByRole("heading", { name: offer.title[locale], level: 3 });
    const price = within(card).getByText(locale === "zh" ? "价格" : "Price").closest("dl");
    const summary = within(card).getByText(offer.summary[locale]);
    expect(summary.tagName).toBe("P");
    expect(Array.from(card.children)).toEqual([heading, price, summary, primary.parentElement]);
    expect(within(card).getAllByRole("button")).toEqual([primary]);
    expect(within(card).queryByRole("button", { name: /查看详情|Details/ })).toBeNull();
    expect(within(card).queryByRole("list")).toBeNull();
    expect(within(card).queryByText(locale === "zh" ? "交付" : "Delivery")).toBeNull();
    expect(within(card).queryByText(locale === "zh" ? "接受的 Coins" : "Accepted Coins")).toBeNull();
    for (const notice of offer.importantNotices[locale]) {
      expect(within(card).queryByText(notice)).toBeNull();
    }
    expect(primary).toHaveClass("portal-marketplace-card__purchase");
  });

  test.each([
    ["zh", 30], ["zh", 90], ["zh", 365], ["zh", 45],
    ["en", 30], ["en", 90], ["en", 365], ["en", 45],
  ] as const)("%s keeps the exact %i-day summary without inventing billing or promotional claims", (locale, durationDays) => {
    const originalOffer = offerFor();
    if (originalOffer.category !== "plan") throw new Error("Expected a plan");
    const summary = locale === "zh" ? `有效期 ${durationDays} 天，每月 123 GB` : `${durationDays} days, 123 GB monthly`;
    const offer = {
      ...originalOffer, summary: { zh: summary, en: summary },
      delivery: { ...originalOffer.delivery, durationDays },
    };
    const { card } = mountCard({ offer, locale });
    expect(within(card).getByText(summary)).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/¥|￥|推荐|折扣|特惠|recommended|most popular|discount|save \d|\/\s*(?:月|年|mo(?:nth)?|yr|year)/i);
  });

  test.each([
    ["zh", "purchase"], ["en", "purchase"], ["zh", "reserve"], ["en", "reserve"],
  ] as const)("%s %s retains its CTA semantics and click focus anchor", (locale, mode) => {
    const anchors: HTMLButtonElement[] = [];
    const onPrimary = vi.fn((event: MouseEvent<HTMLButtonElement>) => { anchors.push(event.currentTarget); });
    const { card, primary } = mountCard({ locale, mode, onPrimary });
    expect(primary).toHaveTextContent(primaryLabel(locale, mode));
    expect(within(card).getAllByRole("button")).toHaveLength(1);
    expect(onPrimary).not.toHaveBeenCalled();
    const click = createEvent.click(primary);
    fireEvent(primary, click);
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onPrimary.mock.calls[0][0].nativeEvent).toBe(click);
    expect(anchors).toEqual([primary]);
  });

  test.each([
    ["zh", "purchase"], ["en", "purchase"], ["zh", "reserve"], ["en", "reserve"],
  ] as const)("%s %s prevents clicks while busy", (locale, mode) => {
    const onPrimary = vi.fn();
    const { primary } = mountCard({ locale, mode, busy: true, onPrimary });
    expect(primary).toBeDisabled();
    fireEvent.click(primary);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  test("plan switch labels keep the catalog price and name the action", () => {
    const offer = offerFor("plan", 30);
    render(<ul>
      <MarketplaceOfferCard
        busy={false}
        locale="zh"
        mode="purchase"
        offer={offer}
        onPrimary={vi.fn()}
        planAction={{
          action: "upgrade",
          chargeUnits: 5,
          currentTitle: "50 GB 月度套餐",
          currentValidUntil: "2026-08-16T00:00:00.000Z",
          effectiveAt: null,
          reasonCode: null
        }}
      />
    </ul>);
    const card = screen.getByRole("article");
    const price = within(card).getByText("价格").closest("dl");
    expect(price?.textContent).toContain("30");
    expect(price?.textContent).toContain("Coins");
    expect(within(card).getByRole("button", { name: /升级，补差价 5 Coins/ })).toBeEnabled();
    expect(within(card).getByText(/当前套餐：50 GB 月度套餐/)).toBeInTheDocument();
  });

  test("an unsupported plan change is disabled with the specific reason", () => {
    const offer = offerFor("plan", 200);
    render(<ul>
      <MarketplaceOfferCard
        busy={false}
        locale="en"
        mode="purchase"
        offer={offer}
        onPrimary={vi.fn()}
        planAction={{
          action: "unavailable",
          chargeUnits: null,
          currentTitle: "50 GB monthly plan",
          currentValidUntil: "2026-08-16T00:00:00.000Z",
          effectiveAt: null,
          reasonCode: "plan_switch_upgrade_window_closed"
        }}
      />
    </ul>);
    const card = screen.getByRole("article");
    const button = within(card).getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Plan change unavailable");
    expect(within(card).getByText(/Too little time remains to upgrade/)).toBeInTheDocument();
    expect(within(card).queryByText("This product is currently unavailable.")).toBeNull();
  });
});
