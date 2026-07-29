import type { PortalCoinType } from "./commerce/api-contract";
import type { PortalWalletLedgerCategory } from "./wallet/api-contract";

export type PortalCommercePresentationLocale = "zh" | "en";

export function portalCoinTypeLabel(
  coinType: PortalCoinType | "held_coins",
  locale: PortalCommercePresentationLocale
) {
  const labels = locale === "zh"
    ? {
        paid_coins: "已购 Coins",
        bonus_coins: "赠送 Coins",
        reward_coins: "奖励 Coins",
        held_coins: "冻结 Coins"
      }
    : {
        paid_coins: "Purchased Coins",
        bonus_coins: "Bonus Coins",
        reward_coins: "Reward Coins",
        held_coins: "Held Coins"
      };
  return labels[coinType];
}

export function portalCoinTypeListLabel(
  coinTypes: readonly PortalCoinType[],
  locale: PortalCommercePresentationLocale
) {
  return coinTypes
    .map((coinType) => portalCoinTypeLabel(coinType, locale))
    .join(locale === "zh" ? "、" : ", ");
}

export function portalLedgerCategoryLabel(
  category: PortalWalletLedgerCategory,
  locale: PortalCommercePresentationLocale
) {
  const labels = locale === "zh"
    ? {
        credit: "Coins 入账",
        pending_to_available: "待确认转可用",
        available_to_held: "订单预留",
        held_to_available: "预留释放",
        held_to_consumed: "消费完成",
        held_to_expired: "预留到期",
        available_to_expired: "可用余额到期"
      }
    : {
        credit: "Coins credited",
        pending_to_available: "Pending cleared",
        available_to_held: "Reserved for order",
        held_to_available: "Reservation released",
        held_to_consumed: "Purchase completed",
        held_to_expired: "Reservation expired",
        available_to_expired: "Available balance expired"
      };
  return labels[category];
}

export function formatPortalDateTime(
  value: string,
  locale: PortalCommercePresentationLocale
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
