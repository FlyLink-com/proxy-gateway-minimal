import type {
  CatalogDto,
  ChargeCertainty,
  CommerceGrantDto,
  CommerceOrderDto,
  CommerceOrderStatus,
  FulfillmentPlanDto,
  OfferVersionDto,
  OrderItemDto,
  PaymentAttemptDto,
  PaymentAttemptStatus,
  PaymentReconciliationState,
  PaymentSwitchInput,
  ProductOrderInput,
  ProductOrderResultDto,
  ProductVersionDto,
  RechargeOfferDto,
  RechargeOrderInput,
  RechargeOrderResultDto,
  RecoveryActionDto,
  ReferralSummaryDto,
  SafeNextActionDto,
  WalletTransactionDto,
  WalletDto
} from "./commerce-model";
import {
  CHARGE_CERTAINTIES,
  COIN_ORIGINS,
  ORDER_STATUSES,
  PAYMENT_ATTEMPT_STATUSES
} from "./commerce-model";

export type CommerceClient = {
  getWallet(sessionRef: string, signal?: AbortSignal): Promise<WalletDto>;
  getCatalog(sessionRef: string, signal?: AbortSignal): Promise<CatalogDto>;
  listOrders(sessionRef: string, signal?: AbortSignal): Promise<CommerceOrderDto[]>;
  createProductOrder(sessionRef: string, input: ProductOrderInput): Promise<ProductOrderResultDto>;
  createRechargeOrder(sessionRef: string, input: RechargeOrderInput): Promise<RechargeOrderResultDto>;
  getPaymentAttempt(sessionRef: string, attemptRef: string, signal?: AbortSignal): Promise<PaymentAttemptDto>;
  switchPaymentAttempt(sessionRef: string, attemptRef: string, input: PaymentSwitchInput): Promise<PaymentAttemptDto>;
  getReferral(sessionRef: string, signal?: AbortSignal): Promise<ReferralSummaryDto>;
};

export type HttpCommerceClientOptions = {
  baseUrl?: string;
  fetchFn?: typeof fetch;
};

export type LocalPreviewCommerceClientOptions = {
  wallet: WalletDto;
  catalog: CatalogDto;
  orders: CommerceOrderDto[];
  referral: ReferralSummaryDto;
  paymentAttempts?: Record<string, PaymentAttemptDto>;
  createProductOrder?: (input: ProductOrderInput) => ProductOrderResultDto | Promise<ProductOrderResultDto>;
  createRechargeOrder?: (input: RechargeOrderInput) => RechargeOrderResultDto | Promise<RechargeOrderResultDto>;
  switchPaymentAttempt?: (
    attemptRef: string,
    input: PaymentSwitchInput
  ) => PaymentAttemptDto | Promise<PaymentAttemptDto>;
};

export type CommerceClientErrorCode =
  | "validation_error"
  | "invalid_session"
  | "not_found"
  | "idempotency_conflict"
  | "insufficient_coins"
  | "payment_switch_blocked"
  | "provider_unavailable"
  | "internal_error"
  | "invalid_response"
  | "network_error";

export class CommerceClientError extends Error {
  readonly code: CommerceClientErrorCode;
  readonly status: number;
  readonly recovery?: RecoveryActionDto;

  constructor(code: CommerceClientErrorCode, status: number, recovery?: RecoveryActionDto) {
    super(code);
    this.name = "CommerceClientError";
    this.code = code;
    this.status = status;
    if (recovery !== undefined) this.recovery = Object.freeze({ ...recovery });
  }
}

const SERVER_ERROR_CODES = new Set<CommerceClientErrorCode>([
  "validation_error",
  "invalid_session",
  "not_found",
  "idempotency_conflict",
  "insufficient_coins",
  "payment_switch_blocked",
  "provider_unavailable",
  "internal_error"
]);
const ATTEMPT_STATUS_SET = new Set<string>(PAYMENT_ATTEMPT_STATUSES);
const CHARGE_CERTAINTY_SET = new Set<string>(CHARGE_CERTAINTIES);
const ORDER_STATUS_SET = new Set<string>(ORDER_STATUSES);
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const PROVIDER_ID = /^[a-z][a-z0-9_-]{2,63}$/;
const TRANSACTION_TYPES = new Set<string>([
  "credit",
  "hold",
  "capture",
  "release",
  "referral_freeze",
  "referral_release",
  "referral_settlement",
  "referral_reversal"
]);
const STATUS_CERTAINTY = new Map<PaymentAttemptStatus, ChargeCertainty>([
  ["entry_unavailable", "not_charge_capable"],
  ["action_required", "pending"],
  ["pending", "pending"],
  ["confirmed_no_charge", "confirmed_no_charge"],
  ["provider_insufficient", "confirmed_no_charge"],
  ["risk_rejected", "confirmed_no_charge"],
  ["succeeded", "charged"],
  ["unknown", "unknown"],
  ["possibly_charged", "possibly_charged"],
  ["reversed", "reversed"]
]);
const STATUS_RECONCILIATION = new Map<PaymentAttemptStatus, PaymentReconciliationState>([
  ["entry_unavailable", "not_charge_capable"],
  ["action_required", "pending"],
  ["pending", "pending"],
  ["confirmed_no_charge", "confirmed_no_charge"],
  ["provider_insufficient", "confirmed_no_charge"],
  ["risk_rejected", "confirmed_no_charge"],
  ["unknown", "requires_review"],
  ["possibly_charged", "requires_review"],
  ["succeeded", "charged_uncredited"],
  ["reversed", "reversed"]
]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new CommerceClientError("invalid_response", 502);
}

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): JsonRecord {
  if (!isRecord(value)) invalidResponse();
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (!required.every((key) => Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    invalidResponse();
  }
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidResponse();
  return value;
}

function safeRef(value: unknown): string {
  const result = text(value);
  if (!SAFE_REF.test(result)) invalidResponse();
  return result;
}

function canonicalTimestamp(value: unknown): string {
  const result = text(value);
  const parsed = new Date(result);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== result) invalidResponse();
  return result;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function nullableRef(value: unknown): string | null {
  return value === null ? null : safeRef(value);
}

function safeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalidResponse();
  return Number(value);
}

function positiveInteger(value: unknown): number {
  const result = safeInteger(value);
  if (result === 0) invalidResponse();
  return result;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") invalidResponse();
  return value;
}

function stringValue<T extends string>(value: unknown, allowed: Set<string>): T {
  const result = text(value);
  if (!allowed.has(result)) invalidResponse();
  return result as T;
}

function safeHostedRedirect(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidResponse();
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback.has(url.hostname)))) {
    invalidResponse();
  }
  return value;
}

function parseNextAction(value: unknown): SafeNextActionDto {
  if (!isRecord(value)) invalidResponse();
  const type = text(value.type);
  const optionalExpiry = Object.hasOwn(value, "expiresAt") ? canonicalTimestamp(value.expiresAt) : undefined;
  if (type === "none") {
    exactRecord(value, ["type"]);
    return { type: "none" };
  }
  if (type === "hosted_redirect") {
    exactRecord(value, ["type", "url"], ["expiresAt"]);
    return { type, url: safeHostedRedirect(text(value.url)), ...(optionalExpiry ? { expiresAt: optionalExpiry } : {}) };
  }
  if (type === "provider_sdk") {
    exactRecord(value, ["type", "actionRef"], ["expiresAt"]);
    return { type, actionRef: safeRef(value.actionRef), ...(optionalExpiry ? { expiresAt: optionalExpiry } : {}) };
  }
  if (type === "qr") {
    exactRecord(value, ["type", "payload"], ["expiresAt"]);
    return { type, payload: text(value.payload), ...(optionalExpiry ? { expiresAt: optionalExpiry } : {}) };
  }
  if (type === "bank_instructions") {
    exactRecord(value, ["type", "instructions"], ["expiresAt"]);
    if (!Array.isArray(value.instructions) || value.instructions.length === 0) invalidResponse();
    return {
      type,
      instructions: value.instructions.map(text),
      ...(optionalExpiry ? { expiresAt: optionalExpiry } : {})
    };
  }
  return invalidResponse();
}

function parseAttempt(value: unknown): PaymentAttemptDto {
  const record = exactRecord(value, [
    "attemptRef",
    "orderRef",
    "providerId",
    "status",
    "chargeCertainty",
    "nextAction",
    "sourceAttemptRef",
    "targetAttemptRef",
    "switchReason",
    "reconciliationState",
    "createdAt",
    "updatedAt"
  ]);
  const status = stringValue<PaymentAttemptStatus>(record.status, ATTEMPT_STATUS_SET);
  const chargeCertainty = stringValue<ChargeCertainty>(record.chargeCertainty, CHARGE_CERTAINTY_SET);
  if (STATUS_CERTAINTY.get(status) !== chargeCertainty) invalidResponse();
  const nextAction = parseNextAction(record.nextAction);
  if ((status === "action_required") !== (nextAction.type !== "none")) invalidResponse();
  const reconciliationState = text(record.reconciliationState);
  if (STATUS_RECONCILIATION.get(status) !== reconciliationState) invalidResponse();
  const providerId = text(record.providerId);
  if (!PROVIDER_ID.test(providerId)) invalidResponse();
  const createdAt = canonicalTimestamp(record.createdAt);
  const updatedAt = canonicalTimestamp(record.updatedAt);
  if (updatedAt < createdAt) invalidResponse();
  return {
    attemptRef: safeRef(record.attemptRef),
    orderRef: safeRef(record.orderRef),
    providerId,
    status,
    chargeCertainty,
    nextAction,
    sourceAttemptRef: nullableRef(record.sourceAttemptRef),
    targetAttemptRef: nullableRef(record.targetAttemptRef),
    switchReason: nullableText(record.switchReason),
    reconciliationState: STATUS_RECONCILIATION.get(status)!,
    createdAt,
    updatedAt
  };
}

function parseGrant(value: unknown): CommerceGrantDto {
  if (!isRecord(value)) invalidResponse();
  if (value.type === "access") {
    const record = exactRecord(value, ["type", "durationDays", "mode"]);
    const durationDays = record.durationDays === null ? null : positiveInteger(record.durationDays);
    if (record.mode !== "fixed_term" && record.mode !== "while_traffic_remaining") invalidResponse();
    return { type: "access", durationDays, mode: record.mode };
  }
  if (value.type === "traffic") {
    const record = exactRecord(value, [
      "type", "quantityGb", "cycleDays", "resetAtCycleEnd", "carryOver", "consumptionPriority"
    ]);
    const cycleDays = record.cycleDays === null ? null : positiveInteger(record.cycleDays);
    return {
      type: "traffic",
      quantityGb: positiveInteger(record.quantityGb),
      cycleDays,
      resetAtCycleEnd: booleanValue(record.resetAtCycleEnd),
      carryOver: booleanValue(record.carryOver),
      consumptionPriority: safeInteger(record.consumptionPriority)
    };
  }
  return invalidResponse();
}

function parseGrants(value: unknown): CommerceGrantDto[] {
  if (!Array.isArray(value) || value.length !== 2) invalidResponse();
  return value.map(parseGrant);
}

function sameGrant(left: CommerceGrantDto, right: CommerceGrantDto): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "access" && right.type === "access") {
    return left.durationDays === right.durationDays && left.mode === right.mode;
  }
  return left.type === "traffic" && right.type === "traffic"
    && left.quantityGb === right.quantityGb
    && left.cycleDays === right.cycleDays
    && left.resetAtCycleEnd === right.resetAtCycleEnd
    && left.carryOver === right.carryOver
    && left.consumptionPriority === right.consumptionPriority;
}

function sameGrants(left: CommerceGrantDto[], right: CommerceGrantDto[]): boolean {
  return left.length === right.length && left.every((grant, index) => sameGrant(grant, right[index]));
}

function parseProductVersion(value: unknown): ProductVersionDto {
  const record = exactRecord(value, [
    "productId", "productVersionRef", "version", "status", "kind", "selfOperated",
    "publishedAt", "grants", "commerceBenefits"
  ]);
  if (record.status !== "published"
    || (record.kind !== "membership" && record.kind !== "traffic_pack")
    || record.selfOperated !== true
    || !Array.isArray(record.commerceBenefits)) invalidResponse();
  const commerceBenefits = record.commerceBenefits.map((benefit) => {
    const parsed = exactRecord(benefit, ["type", "eligibleDiscountClasses", "priceBasisPoints"]);
    if (parsed.type !== "offer_discount"
      || !Array.isArray(parsed.eligibleDiscountClasses)
      || parsed.eligibleDiscountClasses.length === 0) invalidResponse();
    const priceBasisPoints = safeInteger(parsed.priceBasisPoints);
    if (priceBasisPoints > 10000) invalidResponse();
    return {
      type: "offer_discount" as const,
      eligibleDiscountClasses: parsed.eligibleDiscountClasses.map(safeRef),
      priceBasisPoints
    };
  });
  return {
    productId: safeRef(record.productId),
    productVersionRef: safeRef(record.productVersionRef),
    version: positiveInteger(record.version),
    status: "published",
    kind: record.kind,
    selfOperated: true,
    publishedAt: canonicalTimestamp(record.publishedAt),
    grants: parseGrants(record.grants),
    commerceBenefits
  };
}

function parseOfferVersion(value: unknown): OfferVersionDto {
  const record = exactRecord(value, [
    "offerVersionRef", "productVersionRef", "version", "status", "currency", "priceCoins",
    "discountClass", "selfOperated", "publishedAt"
  ]);
  if (record.status !== "published" || record.currency !== "COINS" || record.selfOperated !== true) invalidResponse();
  return {
    offerVersionRef: safeRef(record.offerVersionRef),
    productVersionRef: safeRef(record.productVersionRef),
    version: positiveInteger(record.version),
    status: "published",
    currency: "COINS",
    priceCoins: safeInteger(record.priceCoins),
    discountClass: discountClass(record.discountClass),
    selfOperated: true,
    publishedAt: canonicalTimestamp(record.publishedAt)
  };
}

function discountClass(value: unknown): OfferVersionDto["discountClass"] {
  if (value === "membership" || value === "traffic_pack" || value === "addon") return value;
  return invalidResponse();
}

function parseRechargeOffer(value: unknown): RechargeOfferDto {
  const record = exactRecord(value, [
    "rechargeOfferRef", "version", "status", "currency", "paidCoins", "bonusCoins", "publishedAt"
  ]);
  if (record.status !== "published" || record.currency !== "COINS") invalidResponse();
  return {
    rechargeOfferRef: safeRef(record.rechargeOfferRef),
    version: positiveInteger(record.version),
    status: "published",
    currency: "COINS",
    paidCoins: positiveInteger(record.paidCoins),
    bonusCoins: safeInteger(record.bonusCoins),
    publishedAt: canonicalTimestamp(record.publishedAt)
  };
}

function parseOrderItem(value: unknown): OrderItemDto {
  const record = exactRecord(value, [
    "productId", "productVersionRef", "offerVersionRef", "currency", "basePriceCoins",
    "payableCoins", "discount", "grants"
  ]);
  if (record.currency !== "COINS") invalidResponse();
  const basePriceCoins = safeInteger(record.basePriceCoins);
  const payableCoins = safeInteger(record.payableCoins);
  if (payableCoins > basePriceCoins) invalidResponse();
  let discount: OrderItemDto["discount"] = null;
  if (record.discount !== null) {
    const parsed = exactRecord(record.discount, ["sourceProductVersionRef", "priceBasisPoints"]);
    const priceBasisPoints = safeInteger(parsed.priceBasisPoints);
    if (priceBasisPoints > 10000) invalidResponse();
    discount = { sourceProductVersionRef: safeRef(parsed.sourceProductVersionRef), priceBasisPoints };
  }
  return {
    productId: safeRef(record.productId),
    productVersionRef: safeRef(record.productVersionRef),
    offerVersionRef: safeRef(record.offerVersionRef),
    currency: "COINS",
    basePriceCoins,
    payableCoins,
    discount,
    grants: parseGrants(record.grants)
  };
}

function parseOrder(value: unknown): CommerceOrderDto {
  if (!isRecord(value)) invalidResponse();
  const orderType = text(value.orderType);
  if (orderType === "product") {
    const record = exactRecord(value, [
      "schemaVersion", "orderRef", "accountRef", "orderType", "status", "currency", "item",
      "amountCoins", "holdRef", "captureTransactionRef", "fulfillmentPlanRef", "createdAt"
    ]);
    const status = stringValue<CommerceOrderStatus>(record.status, ORDER_STATUS_SET);
    if (record.schemaVersion !== "coins_commerce_order_v1" || status !== "fulfillment_planned" || record.currency !== "COINS") {
      invalidResponse();
    }
    const item = parseOrderItem(record.item);
    const amountCoins = safeInteger(record.amountCoins);
    if (amountCoins !== item.payableCoins) invalidResponse();
    return {
      schemaVersion: "coins_commerce_order_v1",
      orderRef: safeRef(record.orderRef),
      accountRef: safeRef(record.accountRef),
      orderType: "product",
      status,
      currency: "COINS",
      item,
      amountCoins,
      holdRef: safeRef(record.holdRef),
      captureTransactionRef: safeRef(record.captureTransactionRef),
      fulfillmentPlanRef: safeRef(record.fulfillmentPlanRef),
      createdAt: canonicalTimestamp(record.createdAt)
    };
  }
  if (orderType === "recharge") {
    const record = exactRecord(value, [
      "schemaVersion", "orderRef", "accountRef", "orderType", "status", "rechargeSnapshot", "createdAt"
    ]);
    const status = stringValue<CommerceOrderStatus>(record.status, ORDER_STATUS_SET);
    const snapshot = exactRecord(record.rechargeSnapshot, [
      "rechargeOfferRef", "currency", "paidCoins", "bonusCoins"
    ]);
    if (record.schemaVersion !== "coins_commerce_order_v1"
      || status !== "payment_requested"
      || snapshot.currency !== "COINS") invalidResponse();
    return {
      schemaVersion: "coins_commerce_order_v1",
      orderRef: safeRef(record.orderRef),
      accountRef: safeRef(record.accountRef),
      orderType: "recharge",
      status,
      rechargeSnapshot: {
        rechargeOfferRef: safeRef(snapshot.rechargeOfferRef),
        currency: "COINS",
        paidCoins: positiveInteger(snapshot.paidCoins),
        bonusCoins: safeInteger(snapshot.bonusCoins)
      },
      createdAt: canonicalTimestamp(record.createdAt)
    };
  }
  return invalidResponse();
}

function coinOrigin(value: unknown): WalletTransactionDto["allocations"][number]["origin"] {
  if (value === "bonus" || value === "paid" || value === "referral") return value;
  return invalidResponse();
}

function transactionType(value: unknown): WalletTransactionDto["type"] {
  const result = text(value);
  if (!TRANSACTION_TYPES.has(result)) invalidResponse();
  if (result === "credit" || result === "hold" || result === "capture" || result === "release"
    || result === "referral_freeze" || result === "referral_release"
    || result === "referral_settlement" || result === "referral_reversal") return result;
  return invalidResponse();
}

function parseWalletTransaction(value: unknown): WalletTransactionDto {
  const record = exactRecord(value, [
    "transactionRef", "accountRef", "type", "amountCoins", "allocations", "relatedRef", "createdAt"
  ]);
  if (!Array.isArray(record.allocations) || record.allocations.length === 0) invalidResponse();
  const allocations = record.allocations.map((allocation) => {
    const parsed = exactRecord(allocation, ["lotRef", "origin", "amountCoins"]);
    return {
      lotRef: safeRef(parsed.lotRef),
      origin: coinOrigin(parsed.origin),
      amountCoins: positiveInteger(parsed.amountCoins)
    };
  });
  const amountCoins = positiveInteger(record.amountCoins);
  if (allocations.reduce((total, allocation) => total + allocation.amountCoins, 0) !== amountCoins) invalidResponse();
  return {
    transactionRef: safeRef(record.transactionRef),
    accountRef: safeRef(record.accountRef),
    type: transactionType(record.type),
    amountCoins,
    allocations,
    relatedRef: safeRef(record.relatedRef),
    createdAt: canonicalTimestamp(record.createdAt)
  };
}

function parseWallet(value: unknown): WalletDto {
  const record = exactRecord(value, ["summary", "transactions"]);
  const summary = exactRecord(record.summary, [
    "accountRef", "at", "totalAvailableCoins", "totalFrozenCoins", "byOrigin"
  ]);
  const byOrigin = exactRecord(summary.byOrigin, [...COIN_ORIGINS]);
  const balances = {
    bonus: parseOriginBalance(byOrigin.bonus),
    paid: parseOriginBalance(byOrigin.paid),
    referral: parseOriginBalance(byOrigin.referral)
  };
  const totalAvailableCoins = safeInteger(summary.totalAvailableCoins);
  const totalFrozenCoins = safeInteger(summary.totalFrozenCoins);
  if (Object.values(balances).reduce((total, balance) => total + balance.availableCoins, 0) !== totalAvailableCoins
    || Object.values(balances).reduce((total, balance) => total + balance.frozenCoins, 0) !== totalFrozenCoins
    || !Array.isArray(record.transactions)) invalidResponse();
  const accountRef = safeRef(summary.accountRef);
  const transactions = record.transactions.map(parseWalletTransaction);
  if (transactions.some((transaction) => transaction.accountRef !== accountRef)) invalidResponse();
  return {
    summary: {
      accountRef,
      at: canonicalTimestamp(summary.at),
      totalAvailableCoins,
      totalFrozenCoins,
      byOrigin: balances
    },
    transactions
  };
}

function parseOriginBalance(value: unknown): WalletDto["summary"]["byOrigin"]["paid"] {
  const record = exactRecord(value, ["availableCoins", "frozenCoins"]);
  return {
    availableCoins: safeInteger(record.availableCoins),
    frozenCoins: safeInteger(record.frozenCoins)
  };
}

function parseCatalog(value: unknown): CatalogDto {
  const record = exactRecord(value, ["catalog", "activeMemberships"]);
  const catalog = exactRecord(record.catalog, [
    "schemaVersion", "publishedAt", "productVersions", "offerVersions", "rechargeOffers"
  ]);
  if (catalog.schemaVersion !== "coins_commerce_catalog_v1"
    || !Array.isArray(catalog.productVersions)
    || !Array.isArray(catalog.offerVersions)
    || !Array.isArray(catalog.rechargeOffers)
    || !Array.isArray(record.activeMemberships)) invalidResponse();
  const productVersions = catalog.productVersions.map(parseProductVersion);
  const offerVersions = catalog.offerVersions.map(parseOfferVersion);
  const rechargeOffers = catalog.rechargeOffers.map(parseRechargeOffer);
  const activeMemberships = record.activeMemberships.map(parseProductVersion);
  const productRefs = new Set(productVersions.map(({ productVersionRef }) => productVersionRef));
  if (productRefs.size !== productVersions.length
    || new Set(offerVersions.map(({ offerVersionRef }) => offerVersionRef)).size !== offerVersions.length
    || new Set(rechargeOffers.map(({ rechargeOfferRef }) => rechargeOfferRef)).size !== rechargeOffers.length
    || offerVersions.some(({ productVersionRef }) => !productRefs.has(productVersionRef))
    || activeMemberships.some(({ productVersionRef, kind }) => kind !== "membership" || !productRefs.has(productVersionRef))) {
    invalidResponse();
  }
  return {
    catalog: {
      schemaVersion: "coins_commerce_catalog_v1",
      publishedAt: canonicalTimestamp(catalog.publishedAt),
      productVersions,
      offerVersions,
      rechargeOffers
    },
    activeMemberships
  };
}

function parseFulfillmentPlan(value: unknown): FulfillmentPlanDto {
  const record = exactRecord(value, [
    "schemaVersion", "planRef", "orderRef", "accountRef", "status", "productVersionRef",
    "offerVersionRef", "grants", "createdAt"
  ]);
  if (record.schemaVersion !== "coins_commerce_fulfillment_plan_v1" || record.status !== "ready") invalidResponse();
  return {
    schemaVersion: "coins_commerce_fulfillment_plan_v1",
    planRef: safeRef(record.planRef),
    orderRef: safeRef(record.orderRef),
    accountRef: safeRef(record.accountRef),
    status: "ready",
    productVersionRef: safeRef(record.productVersionRef),
    offerVersionRef: safeRef(record.offerVersionRef),
    grants: parseGrants(record.grants),
    createdAt: canonicalTimestamp(record.createdAt)
  };
}

function parseProductOrderResult(value: unknown): ProductOrderResultDto {
  const record = exactRecord(value, ["order", "fulfillmentPlan"]);
  const order = parseOrder(record.order);
  const fulfillmentPlan = parseFulfillmentPlan(record.fulfillmentPlan);
  if (order.orderType !== "product"
    || fulfillmentPlan.planRef !== order.fulfillmentPlanRef
    || fulfillmentPlan.orderRef !== order.orderRef
    || fulfillmentPlan.accountRef !== order.accountRef
    || fulfillmentPlan.productVersionRef !== order.item.productVersionRef
    || fulfillmentPlan.offerVersionRef !== order.item.offerVersionRef
    || !sameGrants(fulfillmentPlan.grants, order.item.grants)) invalidResponse();
  return { order, fulfillmentPlan };
}

function sameNextAction(left: SafeNextActionDto, right: SafeNextActionDto): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "none" && right.type === "none") return true;
  if (left.type === "hosted_redirect" && right.type === "hosted_redirect") {
    return left.url === right.url && left.expiresAt === right.expiresAt;
  }
  if (left.type === "provider_sdk" && right.type === "provider_sdk") {
    return left.actionRef === right.actionRef && left.expiresAt === right.expiresAt;
  }
  if (left.type === "qr" && right.type === "qr") {
    return left.payload === right.payload && left.expiresAt === right.expiresAt;
  }
  return left.type === "bank_instructions" && right.type === "bank_instructions"
    && left.expiresAt === right.expiresAt
    && left.instructions.length === right.instructions.length
    && left.instructions.every((instruction, index) => instruction === right.instructions[index]);
}

function parseRechargeOrderResult(value: unknown): RechargeOrderResultDto {
  const record = exactRecord(value, ["order", "attempt", "status", "chargeCertainty", "nextAction"]);
  const order = parseOrder(record.order);
  const status = stringValue<PaymentAttemptStatus>(record.status, ATTEMPT_STATUS_SET);
  const chargeCertainty = stringValue<ChargeCertainty>(record.chargeCertainty, CHARGE_CERTAINTY_SET);
  const nextAction = parseNextAction(record.nextAction);
  const attempt = record.attempt === null ? null : parseAttempt(record.attempt);
  if (order.orderType !== "recharge" || STATUS_CERTAINTY.get(status) !== chargeCertainty) invalidResponse();
  if (attempt === null) {
    if (status !== "entry_unavailable" || chargeCertainty !== "not_charge_capable" || nextAction.type !== "none") invalidResponse();
  } else if (attempt.status !== status || attempt.chargeCertainty !== chargeCertainty
    || !sameNextAction(attempt.nextAction, nextAction)) invalidResponse();
  return { order, attempt, status, chargeCertainty, nextAction };
}

function parseReferral(value: unknown): ReferralSummaryDto {
  const record = exactRecord(value, [
    "cumulativeEarnedCoins",
    "availableCoins",
    "internallyConsumedCoins",
    "frozenCoins",
    "frozenForSettlementCoins",
    "externallySettledCoins",
    "reversedCoins"
  ]);
  return {
    cumulativeEarnedCoins: safeInteger(record.cumulativeEarnedCoins),
    availableCoins: safeInteger(record.availableCoins),
    internallyConsumedCoins: safeInteger(record.internallyConsumedCoins),
    frozenCoins: safeInteger(record.frozenCoins),
    frozenForSettlementCoins: safeInteger(record.frozenForSettlementCoins),
    externallySettledCoins: safeInteger(record.externallySettledCoins),
    reversedCoins: safeInteger(record.reversedCoins)
  };
}

function parseError(body: unknown, status: number): CommerceClientError {
  if (!isRecord(body) || typeof body.error !== "string" || !SERVER_ERROR_CODES.has(body.error as CommerceClientErrorCode)) {
    return new CommerceClientError("internal_error", status);
  }
  const code = body.error as CommerceClientErrorCode;
  let recovery: RecoveryActionDto | undefined;
  if (code === "insufficient_coins" && isRecord(body.recovery)) {
    try {
      const value = exactRecord(body.recovery, ["type", "shortfallCoins"]);
      if (value.type === "go_to_recharge") {
        recovery = { type: "go_to_recharge", shortfallCoins: safeInteger(value.shortfallCoins) };
      }
    } catch {
      recovery = undefined;
    }
  }
  return new CommerceClientError(code, status, recovery);
}

async function requestJson<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  parse: (value: unknown) => T
): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, { credentials: "same-origin", ...init });
  } catch (error) {
    if (isRecord(error) && error.name === "AbortError") throw error;
    throw new CommerceClientError("network_error", 0);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) throw new CommerceClientError("internal_error", response.status);
    throw new CommerceClientError("invalid_response", response.status);
  }
  if (!response.ok) throw parseError(body, response.status);
  try {
    return parse(body);
  } catch (error) {
    if (error instanceof CommerceClientError) throw error;
    throw new CommerceClientError("invalid_response", response.status);
  }
}

function requiredInputText(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new CommerceClientError("validation_error", 400);
  }
  return value;
}

function endpoint(baseUrl: string, path: string): string {
  if (baseUrl === "") return path;
  let current: URL;
  let configured: URL;
  try {
    if (typeof window === "undefined") throw new Error("browser origin unavailable");
    current = new URL(window.location.href);
    configured = new URL(baseUrl, current);
  } catch {
    throw new CommerceClientError("validation_error", 400);
  }
  if (current.origin === "null"
    || configured.origin !== current.origin
    || configured.username
    || configured.password
    || configured.search
    || configured.hash) {
    throw new CommerceClientError("validation_error", 400);
  }
  const basePath = configured.pathname.replace(/\/+$/, "");
  return `${configured.origin}${basePath}${path}`;
}

function sessionHeaders(sessionRef: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Portal-Session": requiredInputText(sessionRef)
  };
}

function writeHeaders(sessionRef: string, idempotencyKey: string): Record<string, string> {
  return {
    ...sessionHeaders(sessionRef),
    "Content-Type": "application/json",
    "Idempotency-Key": requiredInputText(idempotencyKey)
  };
}

export function createHttpCommerceClient(options: HttpCommerceClientOptions = {}): CommerceClient {
  const baseUrl = options.baseUrl ?? "";
  const fetchFn = options.fetchFn ?? fetch;
  const read = async <T>(sessionRef: string, path: string, parse: (value: unknown) => T, signal?: AbortSignal) => (
    requestJson(fetchFn, endpoint(baseUrl, path), {
      method: "GET",
      headers: sessionHeaders(sessionRef),
      signal
    }, parse)
  );
  const write = async <T>(
    sessionRef: string,
    path: string,
    idempotencyKey: string,
    body: JsonRecord,
    parse: (value: unknown) => T
  ) => requestJson(fetchFn, endpoint(baseUrl, path), {
    method: "POST",
    headers: writeHeaders(sessionRef, idempotencyKey),
    body: JSON.stringify(body)
  }, parse);

  return {
    getWallet(sessionRef, signal) {
      return read(sessionRef, "/api/portal/commerce/wallet", parseWallet, signal);
    },
    getCatalog(sessionRef, signal) {
      return read(sessionRef, "/api/portal/commerce/catalog", parseCatalog, signal);
    },
    listOrders(sessionRef, signal) {
      return read(sessionRef, "/api/portal/commerce/orders", (value) => {
        if (!Array.isArray(value)) invalidResponse();
        return value.map(parseOrder);
      }, signal);
    },
    createProductOrder(sessionRef, input) {
      return write(sessionRef, "/api/portal/commerce/orders", input.idempotencyKey, {
        offerVersionRef: requiredInputText(input.offerVersionRef)
      }, parseProductOrderResult);
    },
    createRechargeOrder(sessionRef, input) {
      return write(sessionRef, "/api/portal/commerce/recharge-orders", input.idempotencyKey, {
        rechargeOfferRef: requiredInputText(input.rechargeOfferRef),
        preferredProviderId: input.preferredProviderId === null ? null : requiredInputText(input.preferredProviderId)
      }, parseRechargeOrderResult);
    },
    getPaymentAttempt(sessionRef, attemptRef, signal) {
      return read(
        sessionRef,
        `/api/portal/commerce/payment-attempts/${encodeURIComponent(requiredInputText(attemptRef))}`,
        parseAttempt,
        signal
      );
    },
    async switchPaymentAttempt(sessionRef, attemptRef, input) {
      const result = await write(
        sessionRef,
        `/api/portal/commerce/payment-attempts/${encodeURIComponent(requiredInputText(attemptRef))}/switch`,
        input.idempotencyKey,
        { targetProviderId: requiredInputText(input.targetProviderId) },
        parseRechargeOrderResult
      );
      if (result.attempt === null) invalidResponse();
      return result.attempt;
    },
    getReferral(sessionRef, signal) {
      return read(sessionRef, "/api/portal/commerce/referral", parseReferral, signal);
    }
  };
}

function cloneDto<T>(value: T): T {
  return structuredClone(value);
}

function checkAbort(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function previewUnavailable(): never {
  throw new CommerceClientError("validation_error", 400);
}

export function createLocalPreviewCommerceClient(options: LocalPreviewCommerceClientOptions): CommerceClient {
  return {
    async getWallet(sessionRef, signal) {
      requiredInputText(sessionRef);
      checkAbort(signal);
      return cloneDto(options.wallet);
    },
    async getCatalog(sessionRef, signal) {
      requiredInputText(sessionRef);
      checkAbort(signal);
      return cloneDto(options.catalog);
    },
    async listOrders(sessionRef, signal) {
      requiredInputText(sessionRef);
      checkAbort(signal);
      return cloneDto(options.orders);
    },
    async createProductOrder(sessionRef, input) {
      requiredInputText(sessionRef);
      requiredInputText(input.idempotencyKey);
      if (!options.createProductOrder) return previewUnavailable();
      return cloneDto(await options.createProductOrder(input));
    },
    async createRechargeOrder(sessionRef, input) {
      requiredInputText(sessionRef);
      requiredInputText(input.idempotencyKey);
      if (!options.createRechargeOrder) return previewUnavailable();
      return cloneDto(await options.createRechargeOrder(input));
    },
    async getPaymentAttempt(sessionRef, attemptRef, signal) {
      requiredInputText(sessionRef);
      checkAbort(signal);
      const result = options.paymentAttempts?.[requiredInputText(attemptRef)];
      if (!result) throw new CommerceClientError("not_found", 404);
      return cloneDto(result);
    },
    async switchPaymentAttempt(sessionRef, attemptRef, input) {
      requiredInputText(sessionRef);
      requiredInputText(input.idempotencyKey);
      if (!options.switchPaymentAttempt) return previewUnavailable();
      return cloneDto(await options.switchPaymentAttempt(requiredInputText(attemptRef), input));
    },
    async getReferral(sessionRef, signal) {
      requiredInputText(sessionRef);
      checkAbort(signal);
      return cloneDto(options.referral);
    }
  };
}
