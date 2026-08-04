import type {
  PortalRechargeNextAction,
  PortalRechargeOrder,
} from "./portal-recharge-client";
import { stagePortalRechargeReturn } from "./portal-recharge-return";

export type PortalRechargePaymentRedirectResult = "not_applicable" | "blocked" | "redirected";

export function canContinuePortalRechargeOrder(
  order: PortalRechargeOrder,
): order is PortalRechargeOrder & {
  status: "entry_ready";
  nextAction: PortalRechargeNextAction;
} {
  return order.status === "entry_ready" && order.nextAction?.type === "redirect";
}

export function createPortalRechargeIdempotencyKey(kind: "create" | "capture") {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `portal_${kind}_${random}`;
}

export function handoffPortalRechargeOrderToPayment(
  order: PortalRechargeOrder,
  paymentRedirect: (url: string) => void,
): PortalRechargePaymentRedirectResult {
  if (!canContinuePortalRechargeOrder(order)) return "not_applicable";
  const staged = stagePortalRechargeReturn({
    version: 1,
    orderRef: order.orderRef,
    captureIdempotencyKey: createPortalRechargeIdempotencyKey("capture"),
  });
  if (!staged) return "blocked";
  paymentRedirect(order.nextAction.url);
  return "redirected";
}
