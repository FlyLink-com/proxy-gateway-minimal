function frozenValues<const T extends readonly string[]>(values: T): Readonly<T> {
  return Object.freeze(values);
}

export const COIN_ORIGINS = frozenValues(["bonus", "paid", "referral"] as const);
export const PRODUCT_KINDS = frozenValues(["membership", "traffic_pack"] as const);
export const GRANT_TYPES = frozenValues(["access", "traffic"] as const);
export const ORDER_STATUSES = frozenValues(["fulfillment_planned", "payment_requested"] as const);
export const PAYMENT_ATTEMPT_STATUSES = frozenValues([
  "entry_unavailable",
  "action_required",
  "pending",
  "confirmed_no_charge",
  "provider_insufficient",
  "risk_rejected",
  "succeeded",
  "unknown",
  "possibly_charged",
  "reversed"
] as const);
export const CHARGE_CERTAINTIES = frozenValues([
  "not_charge_capable",
  "confirmed_no_charge",
  "pending",
  "unknown",
  "possibly_charged",
  "charged",
  "reversed"
] as const);
export const NEXT_ACTION_TYPES = frozenValues([
  "hosted_redirect",
  "provider_sdk",
  "qr",
  "bank_instructions",
  "none"
] as const);
export const RECOVERY_ACTION_TYPES = frozenValues(["go_to_recharge"] as const);
export const PAYMENT_RESULT_CARD_TYPES = frozenValues([
  "success",
  "confirmed_no_charge",
  "pending",
  "provider_insufficient",
  "risk_rejected",
  "unknown",
  "possibly_charged",
  "reversed"
] as const);

export type CoinOrigin = (typeof COIN_ORIGINS)[number];
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export type GrantType = (typeof GRANT_TYPES)[number];
export type CommerceOrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];
export type ChargeCertainty = (typeof CHARGE_CERTAINTIES)[number];
export type SafeNextActionType = (typeof NEXT_ACTION_TYPES)[number];
export type RecoveryActionType = (typeof RECOVERY_ACTION_TYPES)[number];
export type PaymentResultCardType = (typeof PAYMENT_RESULT_CARD_TYPES)[number];

export type AccessGrantDto = {
  type: "access";
  durationDays: number | null;
  mode: "fixed_term" | "while_traffic_remaining";
};

export type TrafficGrantDto = {
  type: "traffic";
  quantityGb: number;
  cycleDays: number | null;
  resetAtCycleEnd: boolean;
  carryOver: boolean;
  consumptionPriority: number;
};

export type CommerceGrantDto = AccessGrantDto | TrafficGrantDto;

export type OfferDiscountBenefitDto = {
  type: "offer_discount";
  eligibleDiscountClasses: string[];
  priceBasisPoints: number;
};

export type ProductVersionDto = {
  productId: string;
  productVersionRef: string;
  version: number;
  status: "published";
  kind: ProductKind;
  selfOperated: true;
  publishedAt: string;
  grants: CommerceGrantDto[];
  commerceBenefits: OfferDiscountBenefitDto[];
};

export type OfferVersionDto = {
  offerVersionRef: string;
  productVersionRef: string;
  version: number;
  status: "published";
  currency: "COINS";
  priceCoins: number;
  discountClass: "membership" | "traffic_pack" | "addon";
  selfOperated: true;
  publishedAt: string;
};

export type RechargeOfferDto = {
  rechargeOfferRef: string;
  version: number;
  status: "published";
  currency: "COINS";
  paidCoins: number;
  bonusCoins: number;
  publishedAt: string;
};

export type CommerceCatalogDto = {
  schemaVersion: "coins_commerce_catalog_v1";
  publishedAt: string;
  productVersions: ProductVersionDto[];
  offerVersions: OfferVersionDto[];
  rechargeOffers: RechargeOfferDto[];
};

export type CatalogDto = {
  catalog: CommerceCatalogDto;
  activeMemberships: ProductVersionDto[];
};

export type WalletOriginBalanceDto = {
  availableCoins: number;
  frozenCoins: number;
};

export type WalletSummaryDto = {
  accountRef: string;
  at: string;
  totalAvailableCoins: number;
  totalFrozenCoins: number;
  byOrigin: Record<CoinOrigin, WalletOriginBalanceDto>;
};

export type WalletAllocationDto = {
  lotRef: string;
  origin: CoinOrigin;
  amountCoins: number;
};

export type WalletTransactionType =
  | "credit"
  | "hold"
  | "capture"
  | "release"
  | "referral_freeze"
  | "referral_release"
  | "referral_settlement"
  | "referral_reversal";

export type WalletTransactionDto = {
  transactionRef: string;
  accountRef: string;
  type: WalletTransactionType;
  amountCoins: number;
  allocations: WalletAllocationDto[];
  relatedRef: string;
  createdAt: string;
};

export type WalletDto = {
  summary: WalletSummaryDto;
  transactions: WalletTransactionDto[];
};

export type OrderItemDiscountDto = {
  sourceProductVersionRef: string;
  priceBasisPoints: number;
};

export type OrderItemDto = {
  productId: string;
  productVersionRef: string;
  offerVersionRef: string;
  currency: "COINS";
  basePriceCoins: number;
  payableCoins: number;
  discount: OrderItemDiscountDto | null;
  grants: CommerceGrantDto[];
};

export type ProductOrderDto = {
  schemaVersion: "coins_commerce_order_v1";
  orderRef: string;
  accountRef: string;
  orderType: "product";
  status: "fulfillment_planned";
  currency: "COINS";
  item: OrderItemDto;
  amountCoins: number;
  holdRef: string;
  captureTransactionRef: string;
  fulfillmentPlanRef: string;
  createdAt: string;
};

export type RechargeSnapshotDto = {
  rechargeOfferRef: string;
  currency: "COINS";
  paidCoins: number;
  bonusCoins: number;
};

export type RechargeOrderDto = {
  schemaVersion: "coins_commerce_order_v1";
  orderRef: string;
  accountRef: string;
  orderType: "recharge";
  status: "payment_requested";
  rechargeSnapshot: RechargeSnapshotDto;
  createdAt: string;
};

export type CommerceOrderDto = ProductOrderDto | RechargeOrderDto;

export type FulfillmentPlanDto = {
  schemaVersion: "coins_commerce_fulfillment_plan_v1";
  planRef: string;
  orderRef: string;
  accountRef: string;
  status: "ready";
  productVersionRef: string;
  offerVersionRef: string;
  grants: CommerceGrantDto[];
  createdAt: string;
};

type ExpiringAction = { expiresAt?: string };

export type SafeNextActionDto =
  | ({ type: "hosted_redirect"; url: string } & ExpiringAction)
  | ({ type: "provider_sdk"; actionRef: string } & ExpiringAction)
  | ({ type: "qr"; payload: string } & ExpiringAction)
  | ({ type: "bank_instructions"; instructions: string[] } & ExpiringAction)
  | { type: "none" };

export type RecoveryActionDto = {
  type: "go_to_recharge";
  shortfallCoins: number;
};

export type PaymentReconciliationState =
  | "not_charge_capable"
  | "confirmed_no_charge"
  | "pending"
  | "requires_review"
  | "charged_uncredited"
  | "reversed";

export type PaymentAttemptDto = {
  attemptRef: string;
  orderRef: string;
  providerId: string;
  status: PaymentAttemptStatus;
  chargeCertainty: ChargeCertainty;
  nextAction: SafeNextActionDto;
  sourceAttemptRef: string | null;
  targetAttemptRef: string | null;
  switchReason: string | null;
  reconciliationState: PaymentReconciliationState;
  createdAt: string;
  updatedAt: string;
};

export type ProductOrderInput = {
  offerVersionRef: string;
  idempotencyKey: string;
};

export type RechargeOrderInput = {
  rechargeOfferRef: string;
  preferredProviderId: string | null;
  idempotencyKey: string;
};

export type PaymentSwitchInput = {
  targetProviderId: string;
  idempotencyKey: string;
};

export type ProductOrderResultDto = {
  order: ProductOrderDto;
  fulfillmentPlan: FulfillmentPlanDto;
};

export type RechargeOrderResultDto = {
  order: RechargeOrderDto;
  attempt: PaymentAttemptDto | null;
  status: PaymentAttemptStatus;
  chargeCertainty: ChargeCertainty;
  nextAction: SafeNextActionDto;
};

export type ReferralSummaryDto = {
  cumulativeEarnedCoins: number;
  availableCoins: number;
  internallyConsumedCoins: number;
  frozenCoins: number;
  frozenForSettlementCoins: number;
  externallySettledCoins: number;
  reversedCoins: number;
};

export type PaymentResultCardStatus = Exclude<PaymentAttemptStatus, "entry_unavailable" | "action_required">;
export type PaymentResultCardState =
  | { type: "success" }
  | { type: "confirmed_no_charge" }
  | { type: "pending" }
  | { type: "provider_insufficient" }
  | { type: "risk_rejected" }
  | { type: "unknown" }
  | { type: "possibly_charged" }
  | { type: "reversed" };

const PAYMENT_CARD_CERTAINTY: Record<PaymentResultCardStatus, ChargeCertainty> = {
  succeeded: "charged",
  confirmed_no_charge: "confirmed_no_charge",
  pending: "pending",
  provider_insufficient: "confirmed_no_charge",
  risk_rejected: "confirmed_no_charge",
  unknown: "unknown",
  possibly_charged: "possibly_charged",
  reversed: "reversed"
};

const PAYMENT_CARD_TYPE: Record<PaymentResultCardStatus, PaymentResultCardType> = {
  succeeded: "success",
  confirmed_no_charge: "confirmed_no_charge",
  pending: "pending",
  provider_insufficient: "provider_insufficient",
  risk_rejected: "risk_rejected",
  unknown: "unknown",
  possibly_charged: "possibly_charged",
  reversed: "reversed"
};

export function derivePaymentResultCardState(input: {
  status: PaymentResultCardStatus;
  chargeCertainty: ChargeCertainty;
}): PaymentResultCardState {
  if (PAYMENT_CARD_CERTAINTY[input.status] !== input.chargeCertainty) {
    throw new Error("invalid_payment_result_state");
  }
  return Object.freeze({ type: PAYMENT_CARD_TYPE[input.status] }) as PaymentResultCardState;
}
