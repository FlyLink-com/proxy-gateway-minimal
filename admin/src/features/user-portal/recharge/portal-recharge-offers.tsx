import { LoaderCircle } from "lucide-react";

import { formatPortalRechargeAmount, portalRechargePaymentMethodLabel } from "./portal-recharge-presentation";
import type { PortalRechargeModel, PortalRechargeOffersState } from "./use-portal-recharge";
import { portalAssetPath } from "../portal-entry";

export type PortalRechargeOffersProps = {
  locale: "zh" | "en";
  model: PortalRechargeModel;
  compact?: boolean;
  onChoose?: (offerRef: string) => void | Promise<void>;
};

function RechargeOffersState({ locale, state, onRetry }: {
  locale: "zh" | "en";
  state: PortalRechargeOffersState;
  onRetry: () => void;
}) {
  const zh = locale === "zh";
  if (state.status === "loading") {
    return (
      <div aria-live="polite" className="portal-recharge-state" data-state="loading" role="status">
        <LoaderCircle aria-hidden="true" className="portal-recharge-status-card__spinner" />
        <p>{zh ? "正在加载充值档位…" : "Loading recharge options…"}</p>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="portal-recharge-state" data-state="empty" role="status">
        <p>{zh ? "当前没有可用的充值档位。" : "No recharge options are currently available."}</p>
      </div>
    );
  }
  if (state.status === "unavailable" || state.status === "error") {
    const unavailable = state.status === "unavailable";
    return (
      <div aria-live={unavailable ? "polite" : "assertive"} className="portal-recharge-state"
        data-state={state.status} role={unavailable ? "status" : "alert"}>
        <p>{unavailable
          ? zh ? "Coins 充值暂不可用。" : "Coins recharge is unavailable."
          : zh ? "充值档位加载失败。" : "Recharge options could not be loaded."}</p>
        {state.retryable ? <button type="button" onClick={onRetry}>{zh ? "重试" : "Retry"}</button> : null}
      </div>
    );
  }
  return null;
}

export function PortalRechargeOffers({ locale, model, compact = false, onChoose = model.createOrder }: PortalRechargeOffersProps) {
  const zh = locale === "zh";
  // An unknown creation result must be recovered with its existing key, not a
  // second denomination. Its owner presents the explicit recovery action.
  if (model.unresolvedCreateOfferRef) return null;
  if (model.offersState.status !== "ready") {
    return <RechargeOffersState locale={locale} onRetry={model.retryOffers} state={model.offersState} />;
  }
  return (
    <ul className="portal-recharge-offers" aria-label={zh ? "Coins 充值档位" : "Coins recharge denominations"}>
      {model.offers.map((offer, index) => {
        const amount = formatPortalRechargeAmount(offer);
        const alipayOnly = offer.paymentMethods.length === 1 && offer.paymentMethods[0] === "alipay";
        const actionLabel = alipayOnly ? zh ? "支付宝支付" : "Pay with Alipay"
          : zh ? "创建订单并支付" : "Create order and pay";
        const paymentLabel = zh
          ? `${actionLabel} ${offer.paidCoinUnits} Coins，${amount}，第 ${index + 1} 个档位`
          : `${actionLabel} for ${offer.paidCoinUnits} Coins, ${amount}, option ${index + 1}`;
        const creatingOrderLabel = zh
          ? `正在创建订单：${offer.paidCoinUnits} Coins，${amount}，第 ${index + 1} 个档位`
          : `Creating order for ${offer.paidCoinUnits} Coins, ${amount}, option ${index + 1}`;
        return (
          <li key={offer.offerRef}>
            <div className="portal-recharge-offer-details">
              {!compact ? <span className="portal-recharge-offer-label">{zh ? "到账 Coins" : "Coins to receive"}</span> : null}
              <strong>{offer.paidCoinUnits} Coins</strong>
              <div className="portal-recharge-offer-amount">
                {!compact ? <span className="portal-recharge-offer-label">{zh ? "支付金额" : "Payment amount"}</span> : null}
                <span>{amount}</span>
              </div>
              {!compact || !alipayOnly ? (
                <div className="portal-recharge-payment-methods" aria-label={zh ? "支付方式" : "Payment methods"}>
                  {offer.paymentMethods.map(method => <span key={method}>{portalRechargePaymentMethodLabel(method, locale)}</span>)}
                </div>
              ) : null}
            </div>
            <button aria-busy={model.busy ? "true" : undefined}
              aria-label={model.busy ? creatingOrderLabel : paymentLabel}
              className={alipayOnly ? "portal-recharge-pay-button portal-recharge-pay-button--alipay" : "portal-recharge-pay-button"}
              type="button" disabled={model.busy} onClick={() => void onChoose(offer.offerRef)}>
              {alipayOnly && !model.busy ? <img alt="" aria-hidden="true" src={portalAssetPath("payment-alipay-icon.png")} /> : null}
              {model.busy ? zh ? "正在创建订单…" : "Creating order…"
                : actionLabel}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
