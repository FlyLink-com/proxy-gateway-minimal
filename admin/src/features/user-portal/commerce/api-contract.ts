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
  | "quote_expired"
  | "quote_stale"
  | "reconciliation_required"
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
