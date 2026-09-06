import type { MouseEvent } from "react";
import type { PortalCoinOffer } from "./commerce/api-contract";
import type { PortalCommercePresentationLocale } from "./portal-commerce-presentation";

export type MarketplaceOfferCardProps = {
  busy: boolean;
  locale: PortalCommercePresentationLocale;
  mode: "purchase" | "reserve";
  offer: PortalCoinOffer;
  onPrimary: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function MarketplaceOfferCard({
  busy,
  locale,
  mode,
  offer,
  onPrimary
}: MarketplaceOfferCardProps) {
  const zh = locale === "zh";
  const title = zh ? offer.title.zh : offer.title.en;
  const primaryLabel = mode === "reserve"
    ? (zh ? "使用 Coins 预约" : "Reserve with Coins")
    : (zh ? "使用 Coins 购买" : "Buy with Coins");

  return (
    <li className="portal-marketplace-card">
      <article>
        <h3>{title}</h3>
        <dl className="portal-marketplace-card__price">
          <dt>{zh ? "价格" : "Price"}</dt>
          <dd>
            <span className="portal-marketplace-card__amount">{offer.baseCoinUnits}</span>{" "}
            <span className="portal-marketplace-card__unit">Coins</span>
          </dd>
        </dl>
        <p>{offer.summary[locale]}</p>
        <div className="portal-marketplace-card__actions">
          <button
            aria-label={`${primaryLabel}${zh ? "：" : ": "}${title}`}
            className="portal-marketplace-card__purchase"
            type="button"
            disabled={busy}
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
        </div>
      </article>
    </li>
  );
}
