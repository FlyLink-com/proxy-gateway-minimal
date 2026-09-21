import { AlertTriangle, CheckCircle2, Clock3, Circle, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { ModalFrame } from "../../../shared/public/modal-frame";

import { formatPortalRechargeAmount, portalRechargePaymentMethodLabel } from "./portal-recharge-presentation";
import { canContinuePortalRechargeOrder } from "./portal-recharge-payment-handoff";
import { PortalRechargeOffers } from "./portal-recharge-offers";
import type { PortalRechargeModel } from "./use-portal-recharge";
import type { PortalRechargeOffer } from "./portal-recharge-client";
import { portalAssetPath } from "../portal-entry";

type RechargeStatusTone = "neutral" | "pending" | "success" | "attention";

type RechargeStatusMeta = {
  description: string;
  note?: string;
  title: string;
  tone: RechargeStatusTone;
};

function statusMeta(
  status: NonNullable<PortalRechargeModel["activeOrder"]>["status"],
  zh: boolean,
  paidCoinUnits: number,
): RechargeStatusMeta {
  const labels: Record<
    NonNullable<PortalRechargeModel["activeOrder"]>["status"],
    RechargeStatusMeta
  > = {
    created: {
      title: zh ? "正在创建充值订单" : "Creating recharge order",
      description: zh ? "正在准备支付页面" : "Preparing the payment page",
      tone: "neutral",
    },
    entry_ready: {
      title: zh ? "等待付款" : "Waiting for payment",
      description: zh
        ? "即将跳转支付页面"
        : "You will be redirected to the payment page",
      tone: "neutral",
    },
    pending: {
      title: zh ? "支付确认中" : "Payment confirmation pending",
      description: zh ? "支付方正在处理，请勿重复支付" : "The payment provider is processing this payment. Do not pay again.",
      note: zh
        ? "系统正在自动确认，通常约 10 秒完成，最长约 2 分钟"
        : "We are confirming automatically. Usually about 10 seconds, at most 2 minutes.",
      tone: "pending",
    },
    payment_verified: {
      title: zh ? "支付已验证，正在入账" : "Payment verified; crediting Wallet",
      description: zh ? `${paidCoinUnits} Coins 正在写入钱包` : `${paidCoinUnits} Coins are being credited to the Wallet.`,
      note: zh ? "无需重复支付，到账后余额会自动刷新" : "No further payment action is needed; the Wallet updates automatically.",
      tone: "pending",
    },
    credited: {
      title: zh ? "充值已到账" : "Recharge credited",
      description: zh ? `${paidCoinUnits} paid Coins 已可用` : `${paidCoinUnits} paid Coins are available.`,
      tone: "success",
    },
    failed_no_charge: {
      title: zh ? "支付未完成，未扣款" : "Payment incomplete; no charge",
      description: zh ? "本次充值未完成，未产生扣款" : "This recharge did not complete and no charge was made.",
      tone: "attention",
    },
    reconciliation_required: {
      title: zh ? "需要人工核对" : "Support review required",
      description: zh ? "支付结果正在核对，暂不会重复入账" : "The payment result is being reviewed; no duplicate credit will be created.",
      tone: "attention",
    },
    expired: {
      title: zh ? "充值订单已过期" : "Recharge order expired",
      description: zh ? "该订单已结束，如需充值请重新创建订单" : "This order has ended. Create a new order to recharge.",
      tone: "neutral",
    },
  };
  return labels[status];
}

function statusIcon(tone: RechargeStatusTone) {
  if (tone === "pending") return Clock3;
  if (tone === "success") return CheckCircle2;
  if (tone === "attention") return AlertTriangle;
  return Circle;
}

export function PortalRechargeDialog({
  locale,
  model,
  selectedOffer,
}: {
  locale: "zh" | "en";
  model: PortalRechargeModel;
  selectedOffer?: PortalRechargeOffer;
}) {
  const zh = locale === "zh";
  const order = model.activeOrder;
  const [visibleOrderRef, setVisibleOrderRef] = useState<string | null>(null);
  const orderRefVisible = Boolean(order && visibleOrderRef === order.orderRef);
  const canPay = Boolean(order && canContinuePortalRechargeOrder(order));
  const meta = order ? statusMeta(order.status, zh, order.expectedPaidCoinUnits) : null;
  const Icon = meta ? statusIcon(meta.tone) : null;
  const delayed = model.error === "delayed";
  const pending = !delayed
    && (order?.status === "pending" || order?.status === "payment_verified");
  return (
    <ModalFrame
      closeDisabled={model.busy}
      closeLabel={zh ? "关闭" : "Close"}
      onClose={model.closeDialog}
      panelClassName={order || (model.busy && selectedOffer)
        ? "portal-recharge-dialog portal-recharge-dialog--checkout" : "portal-recharge-dialog"}
      title={zh ? "充值 Coins" : "Recharge Coins"}
      titleId="portal-recharge-dialog-title"
    >
      {model.error ? (
        <div className="portal-recharge-state" role="alert">
          {model.error === "create_unknown"
            ? zh
              ? "充值订单结果尚未确认。请确认本次订单，不要重新创建或重复支付。"
              : "The recharge order result is not yet confirmed. Check this attempt; do not create another order or pay again."
            : model.error === "entry_expired"
              ? zh ? "支付入口已过期，请更新订单状态后再继续；未创建新的充值订单。"
                : "The payment entry has expired. Refresh the order status before continuing; no new order was created."
            : model.error === "unavailable"
            ? zh ? "Coins 充值暂不可用。" : "Coins recharge is unavailable."
            : model.error === "delayed"
              ? zh
                ? "支付确认时间较长。可前往订单中心查看最新状态，请勿重复支付。"
                : "Payment confirmation is taking longer than expected. Check Orders for the latest status. Do not pay again."
              : zh ? "充值请求失败，请安全重试。" : "Recharge request failed. Retry safely."}
        </div>
      ) : null}
      {model.unresolvedCreateOfferRef ? (
        <div className="portal-recharge-state">
          <button type="button" disabled={model.busy}
            aria-busy={model.busy ? "true" : undefined}
            onClick={() => void model.retryCreateOrder?.()}>
            {model.busy
              ? zh ? "正在确认本次订单…" : "Checking this attempt…"
              : zh ? "确认本次充值订单" : "Check this recharge attempt"}
          </button>
          <p>{zh ? "可关闭此窗口，稍后返回确认。关闭不会取消已经创建的订单。"
            : "You can close this window and return to check. Closing does not cancel an order already created."}</p>
        </div>
      ) : order ? (
        <section className="portal-recharge-order portal-recharge-checkout" aria-label={zh ? "充值订单" : "Recharge order"}>
          <div className="portal-recharge-checkout__summary">
            <span className="portal-recharge-offer-label">{zh ? "支付金额" : "Payment amount"}</span>
            <strong className="portal-recharge-checkout__amount">{formatPortalRechargeAmount(order)}</strong>
            <p className="portal-recharge-checkout__product">{order.expectedPaidCoinUnits} Coins</p>
          </div>
          <div
            aria-busy={model.busy || pending ? "true" : undefined}
            aria-label={meta?.title}
            aria-live="polite"
            className={`portal-recharge-status-card portal-recharge-status-card--${meta?.tone ?? "neutral"}`}
            role="status"
          >
            <div className="portal-recharge-status-card__icon" aria-hidden="true">
              {Icon ? <Icon /> : null}
            </div>
            <h4>{meta?.title}</h4>
            <p>{meta?.description}</p>
            {meta?.note && !delayed ? (
              <p className="portal-recharge-status-card__note">
                <LoaderCircle aria-hidden="true" className="portal-recharge-status-card__spinner" />
                {meta.note}
              </p>
            ) : null}
          </div>
          <dl className="portal-recharge-checkout__details">
            <div><dt>{zh ? "支付方式" : "Payment method"}</dt><dd>{portalRechargePaymentMethodLabel(order.paymentMethod, locale)}</dd></div>
          </dl>
          <div className="portal-recharge-checkout__reference">
            <button aria-expanded={orderRefVisible} aria-controls="portal-recharge-order-reference" type="button"
              onClick={() => setVisibleOrderRef(orderRefVisible ? null : order.orderRef)}>
              {orderRefVisible ? zh ? "收起订单号" : "Hide order number" : zh ? "查看订单号" : "View order number"}
            </button>
            {orderRefVisible ? <p id="portal-recharge-order-reference">{order.orderRef}</p> : null}
          </div>
          {canPay ? (
            <button type="button" disabled={model.busy} aria-busy={model.busy ? "true" : undefined}
              aria-label={order.paymentMethod === "alipay"
                ? zh ? "支付宝支付，继续本次充值" : "Pay with Alipay, continue this recharge"
                : zh ? "继续支付" : "Continue payment"}
              className={order.paymentMethod === "alipay"
                ? "portal-recharge-pay-button portal-recharge-pay-button--alipay portal-recharge-checkout__pay"
                : "portal-recharge-pay-button portal-recharge-checkout__pay"}
              onClick={() => model.continueOrderPayment(order)}>
              {order.paymentMethod === "alipay" ? <img alt="" aria-hidden="true" src={portalAssetPath("payment-alipay-icon.png")} /> : null}
              {order.paymentMethod === "alipay" ? zh ? "支付宝支付" : "Pay with Alipay"
                : zh ? "继续支付" : "Continue payment"}
            </button>
          ) : null}
        </section>
      ) : model.busy && selectedOffer ? (
        <section className="portal-recharge-order portal-recharge-checkout" aria-label={zh ? "充值摘要" : "Recharge summary"}>
          <div className="portal-recharge-checkout__summary">
            <span className="portal-recharge-offer-label">{zh ? "支付金额" : "Payment amount"}</span>
            <strong className="portal-recharge-checkout__amount">{formatPortalRechargeAmount(selectedOffer)}</strong>
            <p className="portal-recharge-checkout__product">{selectedOffer.paidCoinUnits} Coins</p>
          </div>
          <p role="status" aria-live="polite">{zh ? "正在创建充值订单…" : "Creating recharge order…"}</p>
        </section>
      ) : (
        <PortalRechargeOffers locale={locale} model={model} />
      )}
    </ModalFrame>
  );
}
