// Concise Chinese/English copy for 我的优惠券 (飞连VPN / FlinkVPN).
export const COUPON_COPY = {
  title: ["我的优惠券", "My coupons"],
  lead: ["飞连VPN（FlinkVPN）住宅流量包专用优惠券，下单时填写券码即可抵扣。", "FlinkVPN residential pack coupons. Enter the code at checkout to apply it."],
  tabs: { available: ["可用", "Available"], used: ["已使用", "Used"], expired: ["已过期", "Expired"] },
  empty: {
    available: ["暂无可用优惠券，获得后会显示在这里。", "No coupons available yet. New coupons will show up here."],
    used: ["还没有使用过优惠券。", "You haven't used a coupon yet."],
    expired: ["没有已过期的优惠券。", "No expired coupons."],
  },
  howTo: {
    title: ["如何使用", "How to use"],
    steps: [
      ["在商城选择住宅流量包", "Choose a residential pack in the store"],
      ["结算时粘贴券码", "Paste the code at checkout"],
      ["确认券后价格再支付", "Check the price after the coupon before paying"],
    ],
  },
  rules: {
    title: ["使用规则", "Rules"],
    items: [
      ["仅限住宅流量包使用，每笔订单限用一张。", "Residential packs only, one coupon per order."],
      ["每张券按剩余次数使用，用完即失效。", "Each use counts down the remaining uses."],
      ["流量包为一次性购买，不支持退款；到期未用完的流量不结转。", "Packs are one-time purchases: no refunds, unused data does not roll over."],
      ["过期或停用的优惠券无法使用。", "Expired or paused coupons can't be used."],
    ],
  },
} as const;
