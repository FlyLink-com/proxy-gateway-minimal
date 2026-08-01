import { ModalFrame } from "../../../components/modal-frame";

import type { PortalRechargeModel } from "./use-portal-recharge";

function amountLabel(amountMinor: number) {
  return `USD ${(amountMinor / 100).toFixed(2)}`;
}

function statusText(status: NonNullable<PortalRechargeModel["activeOrder"]>["status"], zh: boolean) {
  const labels = {
    created: zh ? "正在创建 PayPal 订单" : "Creating PayPal order",
    entry_ready: zh ? "等待 PayPal 付款" : "Waiting for PayPal payment",
    pending: zh ? "支付确认中" : "Payment confirmation pending",
    payment_verified: zh ? "支付已验证，正在入账" : "Payment verified; crediting Wallet",
    credited: zh ? "充值已到账" : "Recharge credited",
    failed_no_charge: zh ? "支付未完成，未扣款" : "Payment incomplete; no charge",
    reconciliation_required: zh ? "需要人工核对" : "Support review required",
    expired: zh ? "充值订单已过期" : "Recharge order expired",
  };
  return labels[status];
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
  return (
    <ModalFrame
      closeDisabled={model.busy}
      closeLabel={zh ? "关闭" : "Close"}
      onClose={model.closeDialog}
      panelClassName="portal-recharge-dialog"
      title={zh ? "充值 Coins" : "Recharge Coins"}
      titleId="portal-recharge-dialog-title"
      subtitle={zh ? "PayPal Sandbox 使用 USD 测试价格，不产生生产支付。" : "PayPal Sandbox uses USD test pricing and does not create a production payment."}
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
          <p className="portal-recharge-status" role="status">{statusText(order.status, zh)}</p>
          <dl>
            <div><dt>{zh ? "到账" : "Credit"}</dt><dd>{order.expectedPaidCoinUnits} Coins</dd></div>
            <div><dt>{zh ? "支付金额" : "Payment amount"}</dt><dd>{amountLabel(order.amountMinor)}</dd></div>
            <div><dt>{zh ? "订单号" : "Order"}</dt><dd>{order.orderRef}</dd></div>
          </dl>
          {order.status === "credited" ? (
            <p className="portal-recharge-success">
              {zh
                ? `${order.expectedPaidCoinUnits} paid Coins 已可用。`
                : `${order.expectedPaidCoinUnits} paid Coins are available.`}
            </p>
          ) : null}
          {order.status === "entry_ready" || order.status === "pending" ? (
            <div className="portal-recharge-actions">
              <button type="button" disabled={model.busy} onClick={() => void model.captureOrder()}>
                {model.busy
                  ? zh ? "正在确认…" : "Confirming…"
                  : zh ? "确认 PayPal 支付" : "Confirm PayPal payment"}
              </button>
              <button type="button" disabled={model.busy} onClick={() => void model.refreshOrder()}>
                {zh ? "刷新订单" : "Refresh order"}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <ul className="portal-recharge-offers" aria-label={zh ? "Coins 充值档位" : "Coins recharge denominations"}>
          {model.offers.map((offer) => (
            <li key={offer.offerRef}>
              <div><strong>{offer.paidCoinUnits} Coins</strong><span>{amountLabel(offer.amountMinor)}</span></div>
              <button type="button" disabled={model.busy} onClick={() => void model.createOrder(offer.offerRef)}>
                {model.busy
                  ? zh ? "正在创建订单…" : "Creating order…"
                  : zh ? "使用 PayPal 测试支付" : "Use PayPal Sandbox"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalFrame>
  );
}
