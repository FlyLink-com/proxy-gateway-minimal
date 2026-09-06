import type {
  PortalCoinCommerceClientErrorCode,
  PortalCoinFulfillmentSafeCode,
  PortalCoinOffer
} from "./api-contract";
import type { PortalCoinOrderUiState } from "./use-coins-purchase-flow";

type CommerceLocale = "zh" | "en";
type Labels = readonly [string, string];

const errorLabels = {
  cancel_window_closed: ["取消期限已结束，无法再取消此订单，请刷新订单查看进度。", "This order can no longer be cancelled. Refresh it to check its progress."],
  capture_in_progress: ["正在处理付款，请刷新订单查看进度。", "Payment is being processed. Refresh the order to check its progress."],
  commerce_not_found: ["未找到该商品或订单，请刷新页面确认。", "This product or order could not be found. Refresh the page to check."],
  commerce_rate_limited: ["请求过于频繁，请稍后重试。", "Too many requests. Try again shortly."],
  commerce_request_failed: ["暂时无法确认请求结果，请稍后重试；如已提交订单，请先查看订单进度。", "The request result could not be confirmed. Try again later; if you submitted an order, check its progress first."],
  commerce_request_invalid: ["购买信息无法确认，请关闭后重新选择商品。", "The purchase details could not be confirmed. Close this window and select the product again."],
  commerce_session_invalid: ["会话已失效，请重新登录。", "The session is no longer valid. Sign in again."],
  commerce_unavailable: ["商城暂时不可用，请稍后重试。", "The Marketplace is temporarily unavailable. Try again later."],
  deferred_transition_conflict: ["已有服务切换尚未完成，请先查看其处理进度。", "A service change is still pending. Check its progress first."],
  idempotency_key_required: ["本次操作无法继续，请关闭后重新确认购买信息。", "This action cannot continue. Close this window and review the purchase details again."],
  idempotency_key_reused: ["本次操作与已有订单不一致，请先查看订单进度。", "This action does not match the existing order. Check its progress first."],
  insufficient_coins: ["Coins 余额不足。", "The Coins balance is insufficient."],
  offer_unavailable: ["该商品当前不可用。", "This product is currently unavailable."],
  quote_expired: ["报价已过期，请重新预览。", "The quote expired. Preview again."],
  quote_stale: ["报价已更新，请重新预览。", "The quote changed. Preview again."],
  reconciliation_required: ["订单需要人工核对，尚未完成，请联系支持。", "The order needs review and is not complete. Contact support."],
  wallet_first_deferred_required: ["当前账户需要通过服务切换办理，请刷新商城后查看可用操作。", "This account needs a service change. Refresh the Marketplace to see the available options."],
  wallet_not_active: ["Coins 钱包尚未启用。", "The Coins wallet is not active."]
} as const satisfies Record<PortalCoinCommerceClientErrorCode, Labels>;

function localized(labels: Labels, locale: CommerceLocale) {
  return labels[locale === "zh" ? 0 : 1];
}

// Render only consumer copy from known codes, never server messages or raw codes.
export function portalCoinCommerceErrorText(
  code: PortalCoinCommerceClientErrorCode,
  locale: CommerceLocale
) {
  return localized(
    Object.hasOwn(errorLabels, code) ? errorLabels[code] : errorLabels.commerce_request_failed,
    locale
  );
}

export function portalCoinOrderStatusText(
  state: PortalCoinOrderUiState,
  locale: CommerceLocale,
  deliveryKind: PortalCoinOffer["delivery"]["kind"]
) {
  const plan = deliveryKind === "subscription_plan";
  const labels: Record<PortalCoinOrderUiState, Labels> = {
    reserved: ["Coins 已预留", "Coins reserved"],
    settling: ["正在处理付款", "Processing payment"],
    delivering: plan
      ? ["正在开通服务", "Activating your service"]
      : ["正在发放流量", "Adding your data allowance"],
    succeeded: plan
      ? ["购买完成，服务已开通", "Purchase complete. Your service is active."]
      : ["购买完成，流量已到账", "Purchase complete. Your data allowance has been added."],
    delivery_failed: plan
      ? ["本次服务开通结果尚未确认，请联系支持", "This service activation has not been confirmed. Contact support."]
      : ["本次流量到账结果尚未确认，请联系支持", "This data allowance has not been confirmed. Contact support."],
    cancelled: ["订单已取消，预留已释放", "Order cancelled and reservation released"],
    capture_failed: ["付款未完成，请刷新订单或联系支持", "Payment is not complete. Refresh the order or contact support."],
    reconciliation_required: ["订单需要人工核对，尚未完成，请联系支持", "The order needs review and is not complete. Contact support."]
  };
  return localized(
    Object.hasOwn(labels, state) ? labels[state] : labels.reconciliation_required,
    locale
  );
}

const fulfillmentFailureLabels = {
  fulfillment_attempt_limit: ["我们需要进一步核对这笔订单，请联系支持查询处理进度。", "This order needs further review. Contact support to check its progress."],
  fulfillment_handler_failed: ["商品发放结果需要核对，请联系支持查询处理进度。", "The result of your purchase needs review. Contact support to check its progress."],
  fulfillment_handler_unavailable: ["暂时无法确认商品发放结果，请联系支持查询处理进度。", "The result of your purchase cannot be confirmed right now. Contact support to check its progress."],
  fulfillment_result_invalid: ["商品发放结果需要核对，请联系支持查询处理进度。", "The fulfillment of your purchase needs review. Contact support to check its progress."]
} as const satisfies Record<PortalCoinFulfillmentSafeCode, Labels>;

export function portalCoinFulfillmentFailureText(
  code: PortalCoinFulfillmentSafeCode,
  locale: CommerceLocale
) {
  return localized(
    Object.hasOwn(fulfillmentFailureLabels, code)
      ? fulfillmentFailureLabels[code]
      : fulfillmentFailureLabels.fulfillment_result_invalid,
    locale
  );
}
