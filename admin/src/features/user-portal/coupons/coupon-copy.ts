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
      ["购买住宅流量包时，系统会自动使用抵扣最多的那张券。", "At checkout we automatically apply the coupon that saves you the most."],
      ["结算页可以换一张券或不使用，确认券后价格再支付。", "You can switch coupons or use none at checkout; check the final price before paying."],
    ],
    rules: [
      ["每个兑换码只能兑换一次，每张优惠券只能用于一笔订单。", "Each code redeems once; each coupon covers one order."],
      ["每个账户每天最多兑换 1 个兑换码。", "One code per account per day."],
      ["兑换码签发后 30 天内有效，兑换后的优惠券 30 天内可用。", "Codes must be redeemed within 30 days; coupons are usable for 30 days after redeeming."],
      ["优惠最多为原价的 20%。", "Savings are capped at 20% of the list price."],
      ["流量包为一次性购买，不支持退款，未用完的流量不结转。", "Packs are one-time purchases: no refunds, no rollover."],
    ],
    dismiss: ["知道了", "Got it"],
  },
  checkout: {
    title: ["住宅流量包", "Residential packs"],
    pack: ["流量包", "Pack"],
    summary: ["价格", "Price"],
    list: ["原价", "List price"],
    deduction: ["优惠券抵扣", "Coupon"],
    final: ["应付", "You pay"],
    coupon: ["优惠券", "Coupon"],
    best: ["最省", "Best"],
    none: ["不使用优惠券", "No coupon"],
    noCoupons: ["暂无可用于此流量包的优惠券", "No coupons for this pack"],
    noSkus: ["暂无可购买的住宅流量包。", "No residential packs available."],
    pay: ["购买即将开放", "Purchasing opens soon"],
    failed: ["价格暂时无法计算，请稍后重试。", "Couldn't price this right now. Try again later."],
  },
  redeem: {
    label: ["兑换码", "Code"],
    submit: ["兑换", "Redeem"],
    success: ["兑换成功，已放入我的优惠券。", "Redeemed. It's now in My coupons."],
    view: ["查看我的优惠券", "View my coupons"],
    invalid: ["兑换码无效或已被使用。", "This code is invalid or already used."],
    limited: ["尝试次数过多，请稍后再试。", "Too many attempts. Try again later."],
    daily: ["今天已兑换过，请明天再来。", "You've already redeemed a code today. Try again tomorrow."],
    failed: ["暂时无法兑换，请稍后重试。", "Couldn't redeem right now. Try again later."],
  },
} as const;
