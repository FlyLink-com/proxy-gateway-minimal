export type PortalCoinType =
  | "bonus_coins"
  | "paid_coins"
  | "reward_coins";

export type PortalCoinLocalizedText = {
  zh: string;
  en: string;
};

export type PortalCoinReferencePrice = {
  currency: "CNY";
  amountMinor: number;
};

export type PortalCoinPlanDelivery = {
  kind: "subscription_plan";
  durationDays: number;
  monthlyTrafficGb: number;
  trafficGb: null;
  neverExpires: false;
  discountBasisPoints: number;
};

export type PortalCoinDataPackDelivery = {
  kind: "data_pack";
  durationDays: null;
  monthlyTrafficGb: null;
  trafficGb: number;
  neverExpires: true;
  discountBasisPoints: null;
};

type PortalCoinOfferBase = {
  offerRef: string;
  offerVersionRef: string;
  title: PortalCoinLocalizedText;
  summary: PortalCoinLocalizedText;
  importantNotices: {
    zh: string[];
    en: string[];
  };
  baseCoinUnits: number;
  referencePrice: PortalCoinReferencePrice;
  acceptedCoinTypes: PortalCoinType[];
};

export type PortalCoinOffer =
  | (PortalCoinOfferBase & {
      category: "plan";
      delivery: PortalCoinPlanDelivery;
    })
  | (PortalCoinOfferBase & {
      category: "data_pack";
      delivery: PortalCoinDataPackDelivery;
    });

export type PortalCoinAllocation = {
  coinType: PortalCoinType;
  amountUnits: number;
};

export type PortalCoinBalance = {
  bonusCoins: number;
  paidCoins: number;
  rewardCoins: number;
  heldCoins: number;
};

export type PortalPlanSwitchKind =
  | "renewal"
  | "upgrade_inplace"
  | "upgrade_restart"
  | "downgrade_scheduled";

export type PortalPlanSwitchQuote = {
  kind: PortalPlanSwitchKind;
  creditUnits: number;
  chargeUnits: number;
  effectiveAt: string | null;
  cancelsPendingDowngrade: boolean;
};

export type PortalCoinQuote = {
  quoteRef: string;
  offer: PortalCoinOffer;
  amountUnits: number;
  appliedDiscountBasisPoints: number;
  purchaseAvailability: "available" | "insufficient_balance";
  shortfallUnits: number;
  allocation: PortalCoinAllocation[];
  balances: {
    before: PortalCoinBalance;
    after: PortalCoinBalance;
  };
  expiresAt: string;
  planSwitch?: PortalPlanSwitchQuote;
};

export type PortalCoinPaymentStatus =
  | "held"
  | "capture_pending"
  | "captured"
  | "cancelled"
  | "capture_failed"
  | "reconciliation_required";

export type PortalCoinFulfillmentSafeCode =
  | "fulfillment_handler_failed"
  | "fulfillment_result_invalid"
  | "fulfillment_handler_unavailable"
  | "fulfillment_attempt_limit";

export type PortalCoinFulfillment =
  | {
      status: "not_requested" | "pending" | "processing" | "delivered";
      safeCode: null;
    }
  | {
      status: "failed";
      safeCode: PortalCoinFulfillmentSafeCode;
    };

export type PortalCoinOrder = {
  orderRef: string;
  offer: PortalCoinOffer;
  amountUnits: number;
  allocation: PortalCoinAllocation[];
  paymentStatus: PortalCoinPaymentStatus;
  cancelUntil: string;
  fulfillment: PortalCoinFulfillment;
  createdAt: string;
  updatedAt: string;
  planSwitch?: PortalPlanSwitchQuote;
};

export type PortalCoinOrderPage = {
  orders: PortalCoinOrder[];
  nextCursor: {
    afterCreatedAt: string;
    afterOrderRef: string;
  } | null;
};

export type PortalCoinOrderListInput =
  | {
      sessionRef: string;
      limit: number;
      afterCreatedAt?: never;
      afterOrderRef?: never;
    }
  | {
      sessionRef: string;
      limit: number;
      afterCreatedAt: string;
      afterOrderRef: string;
    };

export type PortalCoinCommerceErrorCode =
  | "cancel_window_closed"
  | "capture_in_progress"
  | "commerce_not_found"
  | "commerce_rate_limited"
  | "commerce_request_invalid"
  | "commerce_session_invalid"
  | "commerce_unavailable"
  | "idempotency_key_required"
  | "idempotency_key_reused"
  | "insufficient_coins"
  | "offer_unavailable"
  | "plan_switch_already_scheduled"
  | "plan_switch_application_pending"
  | "plan_switch_authority_mode_unsupported"
  | "plan_switch_authority_row_present"
  | "plan_switch_commerce_model_unsupported"
  | "plan_switch_credit_exceeds_price"
  | "plan_switch_precheck_unavailable"
  | "plan_switch_state_changed"
  | "plan_switch_upgrade_window_closed"
  | "quote_expired"
  | "quote_stale"
  | "reconciliation_required"
  | "deferred_transition_conflict"
  | "wallet_first_deferred_required"
  | "wallet_not_active";

export type PortalCoinCommerceClientErrorCode =
  | PortalCoinCommerceErrorCode
  | "commerce_request_failed";

export type PortalCoinCommerceClient = {
  listOffers(input: {
    sessionRef: string;
  }): Promise<PortalCoinOffer[]>;
  listOrders(input: PortalCoinOrderListInput): Promise<PortalCoinOrderPage>;
  getOffer(input: {
    sessionRef: string;
    offerRef: string;
  }): Promise<PortalCoinOffer>;
  previewCheckout(input: {
    sessionRef: string;
    offerRef: string;
  }): Promise<PortalCoinQuote>;
  readPlanSwitchState?(input: {
    sessionRef: string;
  }): Promise<PortalPlanSwitchState | null>;
  createOrder(input: {
    sessionRef: string;
    quoteRef: string;
    idempotencyKey: string;
  }): Promise<PortalCoinOrder>;
  getOrder(input: {
    sessionRef: string;
    orderRef: string;
  }): Promise<PortalCoinOrder>;
  cancelOrder(input: {
    sessionRef: string;
    orderRef: string;
    idempotencyKey: string;
  }): Promise<PortalCoinOrder>;
};

/**
 * This value is projected only from the authenticated server session.  It is
 * deliberately separate from checkout inputs so a browser cannot select the
 * commercial model that processes its Coins.
 */
export type PortalCommerceModel = "legacy" | "wallet_first_unique_v1";

export type PortalPlanSwitchAction =
  | "current_renew"
  | "upgrade"
  | "downgrade"
  | "unavailable";

export type PortalPlanSwitchOfferState = {
  offerRef: string;
  action: PortalPlanSwitchAction;
  chargeUnits: number | null;
  creditUnits: number | null;
  effectiveAt: string | null;
  reasonCode: PortalCoinCommerceErrorCode | null;
};

export type PortalPlanSwitchState = {
  current: {
    offerRef: string;
    validUntil: string;
  } | null;
  pendingSwitch: {
    toOfferRef: string;
    effectiveAt: string;
  } | null;
  offers: PortalPlanSwitchOfferState[];
};

export type PortalCommerceModelClient = {
  getCommerceModel(input: {
    sessionRef: string;
  }): Promise<PortalCommerceModel>;
};

export type PortalDeferredTransitionFlowKind =
  | "initial_activation"
  | "scheduled_switch";

export type PortalDeferredTransitionState =
  | "reserved"
  | "processing"
  | "effect_applied"
  | "settled"
  | "requote_required"
  | "cancelled"
  | "reconciliation_required";

/**
 * Public projection of a wallet-first transition.  Reservation, resource
 * chain, priority and effect details never leave the server.
 */
export type PortalDeferredTransition = {
  transitionRef: string;
  offer: PortalCoinOffer;
  amountUnits: number;
  flowKind: PortalDeferredTransitionFlowKind;
  scheduledFor: string;
  state: PortalDeferredTransitionState;
  safeCode: string | null;
  reservedAt: string;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalDeferredCheckoutQuote = PortalCoinQuote & {
  transition: {
    flowKind: PortalDeferredTransitionFlowKind;
    scheduledFor: string;
  };
};

/**
 * Dedicated surface for accounts whose server-side commercial model is
 * wallet_first_unique_v1.  It intentionally has no ordinary Order method.
 */
export type PortalWalletFirstCommerceClient = {
  listOffers(input: {
    sessionRef: string;
  }): Promise<PortalCoinOffer[]>;
  getOffer(input: {
    sessionRef: string;
    offerRef: string;
  }): Promise<PortalCoinOffer>;
  previewDeferredCheckout(input: {
    sessionRef: string;
    offerRef: string;
  }): Promise<PortalDeferredCheckoutQuote>;
  listDeferredTransitions(input: {
    sessionRef: string;
  }): Promise<PortalDeferredTransition[]>;
  getDeferredTransition(input: {
    sessionRef: string;
    transitionRef: string;
  }): Promise<PortalDeferredTransition>;
  reserveDeferredTransition(input: {
    sessionRef: string;
    quoteRef: string;
    idempotencyKey: string;
  }): Promise<PortalDeferredTransition>;
  cancelDeferredTransition(input: {
    sessionRef: string;
    transitionRef: string;
    idempotencyKey: string;
  }): Promise<PortalDeferredTransition>;
};
