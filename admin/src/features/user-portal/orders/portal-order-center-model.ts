import type { PortalCoinOrder } from "../commerce";
import type { PortalRechargeOrder } from "../recharge";
import type {
  PortalClientId,
  PortalPaymentOrder,
  PortalPlanId,
  PortalSubscriptionRequest
} from "../user-portal-client";

export type PortalOrderCenterKind =
  | "coins_consumption"
  | "coin_recharge"
  | "legacy_payment"
  | "service_access";

export type PortalOrderCenterStatus =
  | "in_progress"
  | "successful"
  | "attention"
  | "closed";

export type PortalServiceOrder = {
  requestRef: string;
  request: PortalSubscriptionRequest;
  createdAt: string;
  planId: PortalPlanId;
  durationDays: number;
  quantity: number;
  clientTarget: PortalClientId;
  status: "pending" | "active" | "expired" | "disabled";
  expiresAt: string;
  subscriptionUrl?: string;
};

export type PortalOrderCenterItem =
  | {
      kind: "coins_consumption";
      key: string;
      createdAt: string;
      status: PortalOrderCenterStatus;
      source: PortalCoinOrder;
    }
  | {
      kind: "coin_recharge";
      key: string;
      createdAt: string;
      status: PortalOrderCenterStatus;
      source: PortalRechargeOrder;
    }
  | {
      kind: "legacy_payment";
      key: string;
      createdAt: string;
      status: PortalOrderCenterStatus;
      source: PortalPaymentOrder;
    }
  | {
      kind: "service_access";
      key: string;
      createdAt: string;
      status: PortalOrderCenterStatus;
      source: PortalServiceOrder;
    };

export function orderCenterStatusForCoin(order: PortalCoinOrder): PortalOrderCenterStatus {
  switch (order.paymentStatus) {
    case "held":
    case "capture_pending":
      return "in_progress";
    case "cancelled":
      return "closed";
    case "capture_failed":
    case "reconciliation_required":
      return "attention";
    case "captured":
      if (order.fulfillment.status === "delivered") return "successful";
      return order.fulfillment.status === "failed" ? "attention" : "in_progress";
  }
  return "attention";
}

export function orderCenterStatusForPayment(order: PortalPaymentOrder): PortalOrderCenterStatus {
  switch (order.status) {
    case "pending_payment":
    case "paid_pending_admin_review":
      return "in_progress";
    case "paid_access_delivered":
      return "successful";
    default:
      return "attention";
  }
}

export function orderCenterStatusForRecharge(order: PortalRechargeOrder): PortalOrderCenterStatus {
  switch (order.status) {
    case "created":
    case "entry_ready":
    case "pending":
    case "payment_verified":
      return "in_progress";
    case "credited":
      return "successful";
    case "reconciliation_required":
      return "attention";
    case "failed_no_charge":
    case "expired":
      return "closed";
  }
}

export function orderCenterStatusForService(order: PortalServiceOrder): PortalOrderCenterStatus {
  if (order.status === "active") return "successful";
  if (order.status === "pending") return "in_progress";
  return "closed";
}

export function buildPortalOrderCenterItems(input: {
  coinOrders: PortalCoinOrder[];
  rechargeOrders?: PortalRechargeOrder[];
  legacyPaymentOrders: PortalPaymentOrder[];
  serviceOrders: PortalServiceOrder[];
}): PortalOrderCenterItem[] {
  return [
    ...input.coinOrders.map((source): PortalOrderCenterItem => ({
      kind: "coins_consumption",
      key: `coins_consumption:${source.orderRef}`,
      createdAt: source.createdAt,
      status: orderCenterStatusForCoin(source),
      source
    })),
    ...(input.rechargeOrders ?? []).map((source): PortalOrderCenterItem => ({
      kind: "coin_recharge",
      key: `coin_recharge:${source.orderRef}`,
      createdAt: source.createdAt,
      status: orderCenterStatusForRecharge(source),
      source
    })),
    ...input.legacyPaymentOrders.map((source): PortalOrderCenterItem => ({
      kind: "legacy_payment",
      key: `legacy_payment:${source.orderRef}`,
      createdAt: source.createdAt,
      status: orderCenterStatusForPayment(source),
      source
    })),
    ...input.serviceOrders.map((source): PortalOrderCenterItem => ({
      kind: "service_access",
      key: `service_access:${source.requestRef}`,
      createdAt: source.createdAt,
      status: orderCenterStatusForService(source),
      source
    }))
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
