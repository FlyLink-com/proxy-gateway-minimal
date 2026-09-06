import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PortalCoinOffer } from "../features/user-portal/commerce/api-contract";
import { ProductDetailDialog } from "../features/user-portal/commerce/components/product-detail-dialog";

function offerWithPrice(baseCoinUnits: number): PortalCoinOffer {
  return {
    offerRef: "presentation_plan",
    offerVersionRef: "presentation_plan_v1",
    category: "plan",
    title: { zh: "示例订阅套餐", en: "Example subscription plan" },
    summary: { zh: "服务端提供的套餐说明", en: "Server-provided plan summary" },
    importantNotices: {
      zh: ["仅提供本套餐所列资源", "请确认交付规则"],
      en: ["Only the listed resources are included", "Check the delivery rules"],
    },
    baseCoinUnits,
    // Deliberately different from Coins: the view must not substitute or
    // convert the optional fiat reference into a checkout quote.
    referencePrice: { currency: "CNY", amountMinor: 9999 },
    acceptedCoinTypes: ["paid_coins", "bonus_coins"],
    delivery: {
      kind: "subscription_plan",
      durationDays: 30,
      monthlyTrafficGb: 120,
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: 9000,
    },
  };
}

const COPY = {
  zh: {
    catalogPrice: "目录价格",
    quoteDisclaimer: "最终以结算报价为准",
    delivery: "交付",
    deliveryValue: "30 天 · 每月 120 GB",
    accepted: "可用 Coins",
    acceptedValue: "已购 Coins、赠送 Coins",
    preview: "预览 Coins 结算",
  },
  en: {
    catalogPrice: "Catalog price",
    quoteDisclaimer: "Final price is shown at checkout",
    delivery: "Delivery",
    deliveryValue: "30 days · 120 GB monthly",
    accepted: "Accepted Coins",
    acceptedValue: "Purchased Coins, Bonus Coins",
    preview: "Preview Coins checkout",
  },
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Portal product detail catalog-price presentation", () => {
  test.each([
    ["zh", 137],
    ["en", 137],
    ["zh", 0],
    ["en", 0],
  ] as const)("%s shows the exact server catalog amount %i Coins without claiming a final quote", (locale, amount) => {
    const offer = offerWithPrice(amount);
    const frozenInput = structuredClone(offer);
    const onPreview = vi.fn();
    render(<ProductDetailDialog
      locale={locale}
      offer={offer}
      onPreview={onPreview}
      onRequestClose={vi.fn()}
    />);
    const dialog = screen.getByRole("dialog", { name: offer.title[locale] });
    expect(within(dialog).getByText(COPY[locale].catalogPrice)).toBeInTheDocument();
    expect(within(dialog).getByText(`${amount} Coins`)).toBeInTheDocument();
    expect(within(dialog).getByText(COPY[locale].quoteDisclaimer)).toBeInTheDocument();
    expect(offer).toEqual(frozenInput);
    expect(onPreview).not.toHaveBeenCalled();
  });

  test.each(["zh", "en"] as const)(
    "%s preserves server delivery, accepted Coins, notices and the explicit preview action",
    (locale) => {
      const offer = offerWithPrice(137);
      const onPreview = vi.fn();
      render(<ProductDetailDialog
        locale={locale}
        offer={offer}
        onPreview={onPreview}
        onRequestClose={vi.fn()}
      />);
      const dialog = screen.getByRole("dialog", { name: offer.title[locale] });
      expect(within(dialog).getByText(offer.summary[locale])).toBeInTheDocument();
      expect(within(dialog).getByText(COPY[locale].delivery)).toBeInTheDocument();
      expect(within(dialog).getByText(COPY[locale].deliveryValue)).toBeInTheDocument();
      expect(within(dialog).getByText(COPY[locale].accepted)).toBeInTheDocument();
      expect(within(dialog).getByText(COPY[locale].acceptedValue)).toBeInTheDocument();
      for (const notice of offer.importantNotices[locale]) {
        expect(within(dialog).getByText(notice)).toBeInTheDocument();
      }
      expect(onPreview).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("button", { name: COPY[locale].preview }));
      expect(onPreview).toHaveBeenCalledTimes(1);
    },
  );
});
