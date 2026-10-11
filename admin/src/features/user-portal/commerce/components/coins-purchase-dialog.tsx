import { useEffect, useRef } from "react";
import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinOrder,
  PortalCoinQuote
} from "../api-contract";
import {
  formatPortalDateTime,
  portalCoinTypeLabel,
  portalCoinTypeListLabel
} from "../../portal-commerce-presentation";
import {
  CoinsDialogFrame
} from "./product-detail-dialog";
import { CoinsPaymentStatusCard } from "./coins-payment-status-card";
import { portalCoinCommerceErrorText } from "../commerce-error-presentation";
import { isPortalCoinOrderTerminal } from "../use-coins-purchase-flow";

type CommerceLocale = "zh" | "en";

export type CoinsPurchaseDialogProps = {
  cancelling: boolean;
  confirmDisabled?: boolean;
  errorCode: PortalCoinCommerceClientErrorCode | null;
  locale: CommerceLocale;
  onCancel: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
  onRequestClose: () => void;
  onRestoreFocus?: () => void;
  order: PortalCoinOrder | null;
  quote: PortalCoinQuote | null;
  resumingExistingOrder?: boolean;
  submitting: boolean;
};

function localized(
  locale: CommerceLocale,
  zh: string,
  en: string
) {
  return locale === "zh" ? zh : en;
}

function deliveryText(quote: PortalCoinQuote, locale: CommerceLocale) {
  const delivery = quote.offer.delivery;
  if (delivery.kind === "subscription_plan") {
    return localized(
      locale,
      `${delivery.durationDays} 天 · 每月 ${delivery.monthlyTrafficGb} GB`,
      `${delivery.durationDays} days · ${delivery.monthlyTrafficGb} GB monthly`
    );
  }
  return localized(
    locale,
    `${delivery.trafficGb} GB · 永不过期`,
    `${delivery.trafficGb} GB · never expires`
  );
}

function balanceTotal(balance: PortalCoinQuote["balances"]["before"]) {
  return balance.bonusCoins + balance.paidCoins + balance.rewardCoins;
}

function QuoteFacts({
  locale,
  quote
}: {
  locale: CommerceLocale;
  quote: PortalCoinQuote;
}) {
  const before = quote.balances.before;
  const after = quote.balances.after;
  const notices = quote.offer.importantNotices[locale];
  return (
    <div className="portal-coins-purchase-dialog__quote">
      <h3>{locale === "zh" ? quote.offer.title.zh : quote.offer.title.en}</h3>
      <p>{deliveryText(quote, locale)}</p>
      {notices.length > 0 ? (
        <ul aria-label={localized(locale, "购买须知", "Purchase terms")}>
          {notices.map((notice, index) => <li key={`${index}:${notice}`}>{notice}</li>)}
        </ul>
      ) : null}
      {quote.planSwitch ? (
        <p>
          {localized(
            locale,
            "升级立即生效，不退款；降级在当前周期结束后生效，已支付不退款；续费或升级会取消待生效的降级。",
            "An upgrade takes effect immediately and is not refunded. A downgrade takes effect after the current period and the amount already paid is not refunded. Renewing or upgrading cancels a pending downgrade."
          )}
        </p>
      ) : null}
      <dl>
        <div>
          <dt>{localized(locale, "接受的 Coins", "Accepted Coins")}</dt>
          <dd>{portalCoinTypeListLabel(quote.offer.acceptedCoinTypes, locale)}</dd>
        </div>
        <div>
          <dt>{localized(locale, "订单金额", "Order amount")}</dt>
          <dd>{quote.amountUnits} Coins</dd>
        </div>
        <div>
          <dt>{localized(locale, "分配", "Allocation")}</dt>
          <dd>
            {quote.allocation.length === 0
              ? `${localized(locale, "无", "None")} · 0 Coins`
              : quote.allocation.map((item) => (
                <span key={item.coinType}>
                  {portalCoinTypeLabel(item.coinType, locale)}: {item.amountUnits}
                </span>
              ))}
          </dd>
        </div>
        <div>
          <dt>{localized(locale, "余额", "Balances")}</dt>
          <dd>
            <span>{localized(locale, "之前", "Before")}: {balanceTotal(before)}</span>
            {" · "}
            <span>{localized(locale, "之后", "After")}: {balanceTotal(after)}</span>
            <ul>
              <li>{portalCoinTypeLabel("bonus_coins", locale)}: {before.bonusCoins} → {after.bonusCoins}</li>
              <li>{portalCoinTypeLabel("paid_coins", locale)}: {before.paidCoins} → {after.paidCoins}</li>
              <li>{portalCoinTypeLabel("reward_coins", locale)}: {before.rewardCoins} → {after.rewardCoins}</li>
              <li>{portalCoinTypeLabel("held_coins", locale)}: {before.heldCoins} → {after.heldCoins}</li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>{localized(locale, "报价到期", "Quote expiry")}</dt>
          <dd>
            <time dateTime={quote.expiresAt}>
              {formatPortalDateTime(quote.expiresAt, locale)}
            </time>
          </dd>
        </div>
        <div>
          <dt>{localized(locale, "可购买状态", "Availability")}</dt>
          <dd>
            {quote.purchaseAvailability === "available"
              ? localized(locale, "可购买", "Available")
              : localized(locale, "余额不足", "Insufficient balance")}
          </dd>
        </div>
        <div>
          <dt>{localized(locale, "缺少", "Shortfall")}</dt>
          <dd>{quote.shortfallUnits} Coins</dd>
        </div>
      </dl>
    </div>
  );
}

export function CoinsPurchaseDialog({
  cancelling,
  confirmDisabled = false,
  errorCode,
  locale,
  onCancel,
  onConfirm,
  onRefresh,
  onRequestClose,
  onRestoreFocus,
  order,
  quote,
  resumingExistingOrder = false,
  submitting
}: CoinsPurchaseDialogProps) {
  const insufficient = quote?.purchaseAvailability === "insufficient_balance";
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (errorCode && !order) errorRef.current?.focus();
  }, [errorCode, order]);
  const liveText = errorCode
    ? portalCoinCommerceErrorText(errorCode, locale)
    : insufficient && quote
      ? localized(
          locale,
          `Coins 余额不足，缺少 ${quote.shortfallUnits} Coins。`,
          `Insufficient balance. Shortfall: ${quote.shortfallUnits} Coins.`
        )
      : submitting
        ? localized(locale, "正在提交订单。", "Submitting the Order.")
        : localized(locale, "请确认商品和购买金额。", "Review the product and purchase amount.");

  return (
    <CoinsDialogFrame
      busy={submitting || cancelling}
      closeDisabled={submitting || cancelling}
      closeLabel={localized(locale, "关闭", "Close")}
      escapeCloseEnabled={!submitting && !cancelling}
      onRequestClose={onRequestClose}
      onRestoreFocus={onRestoreFocus}
      panelClassName="portal-coins-purchase-dialog"
      title={localized(locale, "确认 Coins 购买", "Confirm Coins purchase")}
      footer={quote && !order ? (
        <button
          className="portal-coins-dialog__primary"
          disabled={insufficient || submitting || confirmDisabled}
          type="button"
          onClick={onConfirm}
        >
          {localized(locale, "确认购买", "Confirm purchase")}
        </button>
      ) : null}
    >
      {order && resumingExistingOrder && !isPortalCoinOrderTerminal(order) ? (
        <p role="status">
          {localized(
            locale,
            "你有一笔订单尚未完成，已打开该订单供你查看进度。",
            "You have an unfinished order. It has been opened so you can check its progress."
          )}
        </p>
      ) : null}
      {!order && errorCode ? (
        <p ref={errorRef} role="alert" tabIndex={-1}>{liveText}</p>
      ) : null}
      {order ? (
        <CoinsPaymentStatusCard
          cancelling={cancelling}
          errorCode={errorCode}
          locale={locale}
          onCancel={onCancel}
          onRefresh={onRefresh}
          order={order}
        />
      ) : quote ? <QuoteFacts locale={locale} quote={quote} /> : null}
      {!order && !errorCode ? <p aria-live="polite">{liveText}</p> : null}
    </CoinsDialogFrame>
  );
}
