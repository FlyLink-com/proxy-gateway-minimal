import { AlertTriangle, CheckCircle2, Clock3, Circle, LoaderCircle } from "lucide-react";

import { ModalFrame } from "../../../components/modal-frame";

import { formatPortalRechargeAmount } from "./portal-recharge-presentation";
import type { PortalRechargeModel } from "./use-portal-recharge";

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
        ? "完成付款后，返回页面即可自动确认"
        : "Complete payment on the payment page; the result will be confirmed automatically when you return.",
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
}: {
  locale: "zh" | "en";
  model: PortalRechargeModel;
}) {
  const zh = locale === "zh";
  const order = model.activeOrder;
  const meta = order ? statusMeta(order.status, zh, order.expectedPaidCoinUnits) : null;
  const Icon = meta ? statusIcon(meta.tone) : null;
  const pending = order?.status === "pending" || order?.status === "payment_verified";
  return (
    <ModalFrame
      closeDisabled={model.busy}
      closeLabel={zh ? "关闭" : "Close"}
      onClose={model.closeDialog}
      panelClassName="portal-recharge-dialog"
      title={zh ? "充值 Coins" : "Recharge Coins"}
      titleId="portal-recharge-dialog-title"
    >
      {model.error ? (
        <div className="portal-recharge-state" role="alert">
          {model.error === "unavailable"
            ? zh ? "Coins 充值暂不可用。" : "Coins recharge is unavailable."
            : zh ? "充值请求失败，请安全重试。" : "Recharge request failed. Retry safely."}
        </div>
      ) : null}
      {order ? (
        <section className="portal-recharge-order" aria-label={zh ? "充值订单" : "Recharge order"}>
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
            {meta?.note ? (
              <p className="portal-recharge-status-card__note">
                <LoaderCircle aria-hidden="true" className="portal-recharge-status-card__spinner" />
                {meta.note}
              </p>
            ) : null}
          </div>
          <dl>
            <div><dt>{zh ? "到账" : "Credit"}</dt><dd>{order.expectedPaidCoinUnits} Coins</dd></div>
            <div><dt>{zh ? "支付金额" : "Payment amount"}</dt><dd>{formatPortalRechargeAmount(order)}</dd></div>
            <div><dt>{zh ? "订单号" : "Order"}</dt><dd>{order.orderRef}</dd></div>
          </dl>
        </section>
      ) : (
        <ul className="portal-recharge-offers" aria-label={zh ? "Coins 充值档位" : "Coins recharge denominations"}>
          {model.offers.map((offer, index) => {
            const amount = formatPortalRechargeAmount(offer);
            const paymentLabel = zh
              ? `继续支付 ${offer.paidCoinUnits} Coins，${amount}，第 ${index + 1} 个档位`
              : `Continue to payment for ${offer.paidCoinUnits} Coins, ${amount}, option ${index + 1}`;
            const creatingOrderLabel = zh
              ? `正在创建订单：${offer.paidCoinUnits} Coins，${amount}，第 ${index + 1} 个档位`
              : `Creating order for ${offer.paidCoinUnits} Coins, ${amount}, option ${index + 1}`;
            return (
              <li key={offer.offerRef}>
                <div><strong>{offer.paidCoinUnits} Coins</strong><span>{amount}</span></div>
                <button
                  aria-busy={model.busy ? "true" : undefined}
                  aria-label={model.busy ? creatingOrderLabel : paymentLabel}
                  type="button"
                  disabled={model.busy}
                  onClick={() => void model.createOrder(offer.offerRef)}
                >
                  {model.busy
                    ? zh ? "正在创建订单…" : "Creating order…"
                    : zh ? "继续支付" : "Continue to payment"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ModalFrame>
  );
}
