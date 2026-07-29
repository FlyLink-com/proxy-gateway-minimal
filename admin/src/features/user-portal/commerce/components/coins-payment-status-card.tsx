import { useEffect, useState } from "react";
import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinFulfillmentSafeCode,
  PortalCoinOrder
} from "../api-contract";
import {
  portalCoinOrderUiState,
  type PortalCoinOrderUiState
} from "../use-coins-purchase-flow";

type CommerceLocale = "zh" | "en";

export type CoinsPaymentStatusCardProps = {
  cancelling: boolean;
  errorCode: PortalCoinCommerceClientErrorCode | null;
  locale: CommerceLocale;
  onCancel: () => void;
  onRefresh: () => void;
  order: PortalCoinOrder;
};

function localized(
  locale: CommerceLocale,
  zh: string,
  en: string
) {
  return locale === "zh" ? zh : en;
}

function initialReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(initialReducedMotion);
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const update = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    media.addEventListener?.("change", update);
    return () => {
      media.removeEventListener?.("change", update);
    };
  }, []);
  return reduced;
}

function stateText(state: PortalCoinOrderUiState, locale: CommerceLocale) {
  const labels: Record<PortalCoinOrderUiState, [string, string]> = {
    reserved: ["Coins 已预留", "Coins reserved"],
    settling: ["结算处理中", "Settlement in progress"],
    delivering: ["交付处理中", "Delivery in progress"],
    succeeded: ["购买和交付已完成", "Purchase and delivery complete"],
    delivery_failed: ["交付未完成，请联系支持", "Delivery did not complete. Contact support."],
    cancelled: ["订单已取消，预留已释放", "Order cancelled and reservation released"],
    capture_failed: ["结算未完成，请刷新或联系支持", "Settlement did not complete. Refresh or contact support."],
    reconciliation_required: ["订单需要人工核对，尚未完成", "Order needs support review and is not complete"]
  };
  return localized(locale, labels[state][0], labels[state][1]);
}

function safeFailureText(
  code: PortalCoinFulfillmentSafeCode,
  locale: CommerceLocale
) {
  const labels: Record<PortalCoinFulfillmentSafeCode, [string, string]> = {
    fulfillment_attempt_limit: ["交付尝试次数已达上限", "Delivery attempt limit reached"],
    fulfillment_handler_failed: ["交付处理失败", "Delivery handler failed"],
    fulfillment_handler_unavailable: ["交付处理暂不可用", "Delivery handler unavailable"],
    fulfillment_result_invalid: ["交付结果无效", "Delivery result invalid"]
  };
  return localized(locale, labels[code][0], labels[code][1]);
}

function commerceErrorText(
  code: PortalCoinCommerceClientErrorCode,
  locale: CommerceLocale
) {
  if (code === "wallet_not_active") {
    return localized(locale, "Coins 钱包尚未启用。", "The Coins wallet is not active.");
  }
  if (code === "insufficient_coins") {
    return localized(locale, "Coins 余额不足。", "The Coins balance is insufficient.");
  }
  if (code === "reconciliation_required") {
    return localized(locale, "订单需要人工核对。", "The Order needs support review.");
  }
  return localized(locale, "无法刷新订单，请安全重试。", "Unable to refresh the Order. Retry safely.");
}

export function CoinsPaymentStatusCard({
  cancelling,
  errorCode,
  locale,
  onCancel,
  onRefresh,
  order
}: CoinsPaymentStatusCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const state = portalCoinOrderUiState(order);
  const pending = state === "reserved"
    || state === "settling"
    || state === "delivering";
  const safeFailure = order.fulfillment.status === "failed"
    ? safeFailureText(order.fulfillment.safeCode, locale)
    : null;

  return (
    <section
      aria-label={localized(locale, "Coins 订单状态", "Coins Order status")}
      aria-busy={cancelling || undefined}
      className={`portal-coins-payment-status portal-coins-payment-status--${state}`}
    >
      <p aria-live="polite">
        {cancelling
          ? localized(locale, "正在取消订单…", "Cancelling the Order…")
          : stateText(state, locale)}
      </p>
      {pending || cancelling ? (
        <span
          aria-hidden="true"
          className="portal-coins-status-spinner"
          data-motion={reducedMotion ? "reduced" : "full"}
        />
      ) : null}
      {safeFailure ? <p>{safeFailure}</p> : null}
      {errorCode ? (
        <p role="alert">{commerceErrorText(errorCode, locale)}</p>
      ) : null}
      <div className="portal-coins-payment-status__actions">
        {state === "reserved" && !cancelling ? (
          <button type="button" onClick={onCancel}>
            {localized(locale, "取消订单", "Cancel Order")}
          </button>
        ) : null}
        <button disabled={cancelling} type="button" onClick={onRefresh}>
          {localized(locale, "刷新订单", "Refresh Order")}
        </button>
      </div>
    </section>
  );
}
