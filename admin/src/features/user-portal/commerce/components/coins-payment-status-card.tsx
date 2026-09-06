import { useEffect, useState } from "react";
import { Circle, LoaderCircle } from "lucide-react";
import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinOrder
} from "../api-contract";
import { portalCoinOrderUiState } from "../use-coins-purchase-flow";
import {
  portalCoinCommerceErrorText,
  portalCoinFulfillmentFailureText,
  portalCoinOrderStatusText
} from "../commerce-error-presentation";

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
    ? portalCoinFulfillmentFailureText(order.fulfillment.safeCode, locale)
    : null;

  return (
    <section
      aria-label={localized(locale, "Coins 订单状态", "Coins Order status")}
      aria-busy={cancelling || undefined}
      className={`portal-coins-payment-status portal-coins-payment-status--${state}`}
    >
      <div className="portal-coins-payment-status__status">
        <p aria-live="polite">
          {cancelling
            ? localized(locale, "正在取消订单…", "Cancelling the Order…")
            : portalCoinOrderStatusText(state, locale, order.offer.delivery.kind)}
        </p>
        {pending || cancelling ? (
          <LoaderCircle
            aria-hidden="true"
            className="portal-coins-status-spinner"
            data-motion={reducedMotion ? "reduced" : "full"}
          />
        ) : (
          <Circle
            aria-hidden="true"
            className="portal-coins-status-marker"
          />
        )}
      </div>
      {safeFailure ? <p>{safeFailure}</p> : null}
      {errorCode ? (
        <p role="alert">{portalCoinCommerceErrorText(errorCode, locale)}</p>
      ) : null}
      <div className="portal-coins-payment-status__actions">
        {state === "reserved" && !cancelling ? (
          <button
            className="portal-coins-payment-status__action--quiet"
            type="button"
            onClick={onCancel}
          >
            {localized(locale, "取消订单", "Cancel Order")}
          </button>
        ) : null}
        <button
          className="portal-coins-payment-status__action--secondary"
          disabled={cancelling}
          type="button"
          onClick={onRefresh}
        >
          {localized(locale, "刷新订单", "Refresh Order")}
        </button>
      </div>
    </section>
  );
}
