import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinOrder,
  PortalCoinQuote
} from "../api-contract";
import {
  CoinsDialogFrame
} from "./product-detail-dialog";
import { CoinsPaymentStatusCard } from "./coins-payment-status-card";

type CommerceLocale = "zh" | "en";

export type CoinsPurchaseDialogProps = {
  cancelling: boolean;
  errorCode: PortalCoinCommerceClientErrorCode | null;
  locale: CommerceLocale;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenRecharge: () => void;
  onRefresh: () => void;
  onRequestClose: () => void;
  onRestoreFocus?: () => void;
  order: PortalCoinOrder | null;
  quote: PortalCoinQuote | null;
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

function safeErrorText(
  code: PortalCoinCommerceClientErrorCode,
  locale: CommerceLocale
) {
  const labels: Record<PortalCoinCommerceClientErrorCode, [string, string]> = {
    cancel_window_closed: ["取消期限已结束，请刷新订单。", "The cancellation window has closed. Refresh the Order."],
    capture_in_progress: ["结算处理中，请刷新订单。", "Settlement is in progress. Refresh the Order."],
    commerce_not_found: ["未找到该商城记录。", "The Commerce record was not found."],
    commerce_rate_limited: ["请求过于频繁，请稍后重试。", "Too many requests. Try again shortly."],
    commerce_request_failed: ["商城暂时不可用，请安全重试。", "Commerce is temporarily unavailable. Retry safely."],
    commerce_request_invalid: ["商城请求无效，请重新开始。", "The Commerce request is invalid. Start again."],
    commerce_session_invalid: ["会话已失效，请重新登录。", "The session is no longer valid. Sign in again."],
    commerce_unavailable: ["商城暂时不可用，请稍后重试。", "Commerce is temporarily unavailable. Try again later."],
    idempotency_key_required: ["操作标识无效，请重新开始。", "The operation identifier is invalid. Start again."],
    idempotency_key_reused: ["操作状态冲突，请刷新订单。", "The operation state conflicts. Refresh the Order."],
    insufficient_coins: ["Coins 余额不足。", "The Coins balance is insufficient."],
    offer_unavailable: ["该商品当前不可用。", "This product is currently unavailable."],
    quote_expired: ["报价已过期，请重新预览。", "The Quote expired. Preview again."],
    quote_stale: ["报价已更新，请重新预览。", "The Quote changed. Preview again."],
    reconciliation_required: ["订单需要人工核对，尚未完成。", "The Order needs support review and is not complete."],
    wallet_not_active: ["Coins 钱包尚未启用。", "The Coins wallet is not active."]
  };
  return localized(locale, labels[code][0], labels[code][1]);
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
  return (
    <div className="portal-coins-purchase-dialog__quote">
      <h3>{locale === "zh" ? quote.offer.title.zh : quote.offer.title.en}</h3>
      <p>{deliveryText(quote, locale)}</p>
      <dl>
        <div>
          <dt>{localized(locale, "接受的 Coins", "Accepted Coins")}</dt>
          <dd>{quote.offer.acceptedCoinTypes.join(", ")}</dd>
        </div>
        <div>
          <dt>{localized(locale, "订单金额", "Order amount")}</dt>
          <dd>{quote.amountUnits} Coins</dd>
        </div>
        <div>
          <dt>{localized(locale, "分配", "Allocation")}</dt>
          <dd>
            {quote.allocation.map((item) => (
              <span key={item.coinType}>
                {item.coinType}: {item.amountUnits}
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
              <li>bonus_coins: {before.bonusCoins} → {after.bonusCoins}</li>
              <li>paid_coins: {before.paidCoins} → {after.paidCoins}</li>
              <li>reward_coins: {before.rewardCoins} → {after.rewardCoins}</li>
              <li>held_coins: {before.heldCoins} → {after.heldCoins}</li>
            </ul>
          </dd>
        </div>
        <div>
          <dt>{localized(locale, "报价到期", "Quote expiry")}</dt>
          <dd><time dateTime={quote.expiresAt}>{quote.expiresAt}</time></dd>
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
  errorCode,
  locale,
  onCancel,
  onConfirm,
  onOpenRecharge,
  onRefresh,
  onRequestClose,
  onRestoreFocus,
  order,
  quote,
  submitting
}: CoinsPurchaseDialogProps) {
  const insufficient = quote?.purchaseAvailability === "insufficient_balance";
  const liveText = errorCode
    ? safeErrorText(errorCode, locale)
    : insufficient && quote
      ? localized(
          locale,
          `Coins 余额不足，缺少 ${quote.shortfallUnits} Coins。`,
          `Insufficient balance. Shortfall: ${quote.shortfallUnits} Coins.`
        )
      : submitting
        ? localized(locale, "正在提交订单。", "Submitting the Order.")
        : localized(locale, "请确认服务端报价。", "Review the server Quote.");

  return (
    <CoinsDialogFrame
      closeLabel={localized(locale, "关闭", "Close")}
      escapeCloseEnabled={order === null}
      onRequestClose={onRequestClose}
      onRestoreFocus={onRestoreFocus}
      panelClassName="portal-coins-purchase-dialog"
      title={localized(locale, "确认 Coins 购买", "Confirm Coins purchase")}
      footer={quote && !order ? (
        <>
          {insufficient ? (
            <button type="button" onClick={onOpenRecharge}>
              {localized(locale, "打开充值", "Open recharge")}
            </button>
          ) : null}
          <button
            disabled={insufficient || submitting}
            type="button"
            onClick={onConfirm}
          >
            {localized(locale, "确认购买", "Confirm purchase")}
          </button>
        </>
      ) : null}
    >
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
      {!order ? <p aria-live="polite">{liveText}</p> : null}
    </CoinsDialogFrame>
  );
}
