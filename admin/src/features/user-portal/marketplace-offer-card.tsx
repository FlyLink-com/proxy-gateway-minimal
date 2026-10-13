import type { MouseEvent } from "react";
import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinOffer,
  PortalPlanSwitchAction
} from "./commerce/api-contract";
import { portalCoinCommerceErrorText } from "./commerce/commerce-error-presentation";
import {
  formatPortalDateTime,
  type PortalCommercePresentationLocale
} from "./portal-commerce-presentation";

export type MarketplacePlanAction = {
  action: PortalPlanSwitchAction;
  chargeUnits: number | null;
  currentTitle: string | null;
  currentValidUntil: string | null;
  effectiveAt: string | null;
  reasonCode: PortalCoinCommerceClientErrorCode | null;
};

export type MarketplaceOfferCardProps = {
  busy: boolean;
  locale: PortalCommercePresentationLocale;
  mode: "purchase" | "reserve";
  offer: PortalCoinOffer;
  onPrimary: (event: MouseEvent<HTMLButtonElement>) => void;
  planAction?: MarketplacePlanAction;
};

function switchLabel(
  planAction: MarketplacePlanAction,
  locale: PortalCommercePresentationLocale
) {
  const zh = locale === "zh";
  if (planAction.action === "current_renew") return zh ? "续费" : "Renew";
  if (planAction.action === "upgrade") {
    const amount = planAction.chargeUnits ?? 0;
    return zh
      ? `升级，补差价 ${amount} Coins`
      : `Upgrade, pay ${amount} Coins`;
  }
  if (planAction.action === "downgrade") {
    const date = planAction.effectiveAt
      ? formatPortalDateTime(planAction.effectiveAt, locale)
      : "";
    return zh
      ? `期末降级（${date} 生效）`
      : `Downgrade at period end (effective ${date})`;
  }
  return zh ? "暂不可切换" : "Plan change unavailable";
}

function unavailableReason(
  planAction: MarketplacePlanAction,
  locale: PortalCommercePresentationLocale
) {
  if (planAction.reasonCode) {
    return portalCoinCommerceErrorText(planAction.reasonCode, locale);
  }
  if (planAction.currentValidUntil) {
    const date = formatPortalDateTime(planAction.currentValidUntil, locale);
    return locale === "zh"
      ? `你当前的套餐有效期至 ${date}。该操作暂不支持，请在到期后切换。`
      : `Your current plan runs until ${date}. This change is not available. Switch after it ends.`;
  }
  return locale === "zh" ? "该操作暂不支持。" : "This change is not available.";
}

export function MarketplaceOfferCard({
  busy,
  locale,
  mode,
  offer,
  onPrimary,
  planAction
}: MarketplaceOfferCardProps) {
  const zh = locale === "zh";
  const title = zh ? offer.title.zh : offer.title.en;
  const primaryLabel = planAction
    ? switchLabel(planAction, locale)
    : mode === "reserve"
      ? (zh ? "使用 Coins 预约" : "Reserve with Coins")
      : (zh ? "使用 Coins 购买" : "Buy with Coins");
  const currentText = planAction?.currentTitle && planAction.currentValidUntil
    ? (zh
      ? `当前套餐：${planAction.currentTitle}，有效期至 ${formatPortalDateTime(planAction.currentValidUntil, locale)}`
      : `Current plan: ${planAction.currentTitle}, expires ${formatPortalDateTime(planAction.currentValidUntil, locale)}`)
    : null;

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
        {currentText ? <p>{currentText}</p> : null}
        <div className="portal-marketplace-card__actions">
          <button
            aria-label={`${primaryLabel}${zh ? "：" : ": "}${title}`}
            className="portal-marketplace-card__purchase"
            type="button"
            disabled={busy || planAction?.action === "unavailable"}
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
          {planAction?.action === "unavailable" ? (
            <p>{unavailableReason(planAction, locale)}</p>
          ) : null}
        </div>
      </article>
    </li>
  );
}
