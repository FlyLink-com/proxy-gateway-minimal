import type {
  PortalRechargeOffer,
  PortalRechargeOrder,
  PortalRechargePaymentMethod,
} from "./portal-recharge-client";

type PortalRechargeAmount = Pick<
  PortalRechargeOffer | PortalRechargeOrder,
  "amountMinor" | "currency" | "currencyExponent"
>;

export function formatPortalRechargeAmount({
  amountMinor,
  currency,
  currencyExponent,
}: PortalRechargeAmount) {
  const digits = String(amountMinor).padStart(currencyExponent + 1, "0");
  if (currencyExponent === 0) return `${currency} ${digits}`;
  const integer = digits.slice(0, -currencyExponent);
  const fraction = digits.slice(-currencyExponent);
  return `${currency} ${integer}.${fraction}`;
}

export function portalRechargePaymentMethodLabel(
  method: PortalRechargePaymentMethod,
  locale: "zh" | "en",
) {
  const labels: Record<PortalRechargePaymentMethod, { zh: string; en: string }> = {
    alipay: { zh: "支付宝", en: "Alipay" },
    wechat_pay: { zh: "微信支付", en: "WeChat Pay" },
    paypal: { zh: "PayPal", en: "PayPal" },
  };
  return labels[method][locale];
}
