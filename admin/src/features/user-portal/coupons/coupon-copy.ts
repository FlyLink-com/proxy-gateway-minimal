// Concise copy for 我的优惠券 / 兑换码兑换 (飞连VPN / FlinkVPN).
// The explanation lives only in the first-visit hint; pages stay functional.
export const COUPON_COPY = {
  couponsTitle: ["我的优惠券", "My coupons"],
  redeemTitle: ["兑换码兑换", "Redeem code"],
  tabs: { available: ["可用", "Available"], used: ["已使用", "Used"], expired: ["已过期", "Expired"] },
  empty: {
    available: ["暂无可用优惠券。", "No coupons available."],
    used: ["还没有使用过优惠券。", "No used coupons."],
    expired: ["没有已过期的优惠券。", "No expired coupons."],
  },
  hint: {
    title: ["优惠券怎么用", "How coupons work"],
    intro: ["飞连VPN 住宅流量包优惠券。", "FlinkVPN residential pack coupons."],
    steps: [
      ["在「兑换码兑换」输入兑换码，优惠券会放入「我的优惠券」。", "Enter a code under Redeem code; the coupon appears in My coupons."],
      ["购买住宅流量包时选用优惠券。", "Apply it when buying a residential pack."],
      ["确认券后价格再支付。", "Check the final price before paying."],
    ],
    rules: [
      ["每个兑换码只能兑换一次，每张优惠券只能用于一笔订单。", "Each code redeems once; each coupon covers one order."],
      ["优惠最多为原价的 20%。", "Savings are capped at 20% of the list price."],
      ["流量包为一次性购买，不支持退款，未用完的流量不结转。", "Packs are one-time purchases: no refunds, no rollover."],
      ["过期的兑换码和优惠券无法使用。", "Expired codes and coupons can't be used."],
    ],
    dismiss: ["知道了", "Got it"],
  },
  redeem: {
    label: ["兑换码", "Code"],
    submit: ["兑换", "Redeem"],
    success: ["兑换成功，已放入我的优惠券。", "Redeemed. It's now in My coupons."],
    view: ["查看我的优惠券", "View my coupons"],
    invalid: ["兑换码无效或已被使用。", "This code is invalid or already used."],
    limited: ["尝试次数过多，请稍后再试。", "Too many attempts. Try again later."],
    failed: ["暂时无法兑换，请稍后重试。", "Couldn't redeem right now. Try again later."],
  },
} as const;
