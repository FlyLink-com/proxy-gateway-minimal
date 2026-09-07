import type {
  PortalRechargeNextAction,
  PortalRechargeOrder,
} from "./portal-recharge-client";
import { stagePortalRechargeReturn } from "./portal-recharge-return";

export type PortalRechargePaymentRedirectResult = "not_applicable" | "blocked" | "expired" | "redirected";

type ReadyRechargeOrder = PortalRechargeOrder & {
  status: "entry_ready";
  nextAction: PortalRechargeNextAction;
};

function hasPaymentAction(order: PortalRechargeOrder): order is ReadyRechargeOrder {
  return order.status === "entry_ready" && order.nextAction?.type === "redirect";
}

function paymentDeadlineState(order: ReadyRechargeOrder, now: number) {
  const orderExpiry = Date.parse(order.expiresAt);
  const actionExpiry = Date.parse(order.nextAction.expiresAt);
  if (![now, orderExpiry, actionExpiry].every(Number.isFinite)) return "blocked";
  return orderExpiry > now && actionExpiry > now ? "ready" : "expired";
}

export function canContinuePortalRechargeOrder(
  order: PortalRechargeOrder,
  now = Date.now(),
): order is ReadyRechargeOrder {
  return hasPaymentAction(order) && paymentDeadlineState(order, now) === "ready";
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
  if (!hasPaymentAction(order)) return "not_applicable";
  // The rendered button may predate the deadline; check again at the action boundary.
  const deadlineState = paymentDeadlineState(order, Date.now());
  if (deadlineState !== "ready") return deadlineState;
  const staged = stagePortalRechargeReturn({
    version: 1,
    orderRef: order.orderRef,
    captureIdempotencyKey: createPortalRechargeIdempotencyKey("capture"),
  });
  if (!staged) return "blocked";
  try {
    paymentRedirect(order.nextAction.url);
  } catch {
    return "blocked";
  }
  return "redirected";
}
