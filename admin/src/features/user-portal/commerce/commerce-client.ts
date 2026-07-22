import type {
  CatalogDto,
  ChargeCertainty,
  CommerceOrderDto,
  CommerceOrderStatus,
  PaymentAttemptDto,
  PaymentAttemptStatus,
  PaymentSwitchInput,
  ProductOrderDto,
  ProductOrderInput,
  ProductOrderResultDto,
  RechargeOrderDto,
  RechargeOrderInput,
  RechargeOrderResultDto,
  RecoveryActionDto,
  ReferralSummaryDto,
  SafeNextActionDto,
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

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function safeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) invalidResponse();
  return Number(value);
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
  const optionalExpiry = Object.hasOwn(value, "expiresAt") ? text(value.expiresAt) : undefined;
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
    return { type, actionRef: text(value.actionRef), ...(optionalExpiry ? { expiresAt: optionalExpiry } : {}) };
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
  if (!["not_charge_capable", "confirmed_no_charge", "pending", "requires_review", "charged_uncredited", "reversed"].includes(reconciliationState)) {
    invalidResponse();
  }
  return {
    attemptRef: text(record.attemptRef),
    orderRef: text(record.orderRef),
    providerId: text(record.providerId),
    status,
    chargeCertainty,
    nextAction,
    sourceAttemptRef: nullableText(record.sourceAttemptRef),
    targetAttemptRef: nullableText(record.targetAttemptRef),
    switchReason: nullableText(record.switchReason),
    reconciliationState: reconciliationState as PaymentAttemptDto["reconciliationState"],
    createdAt: text(record.createdAt),
    updatedAt: text(record.updatedAt)
  };
}

function parseOrder(value: unknown): CommerceOrderDto {
  if (!isRecord(value)) invalidResponse();
  const orderType = text(value.orderType);
  const common = {
    schemaVersion: text(value.schemaVersion),
    orderRef: text(value.orderRef),
    accountRef: text(value.accountRef),
    createdAt: text(value.createdAt)
  };
  if (common.schemaVersion !== "coins_commerce_order_v1") invalidResponse();
  if (orderType === "product") {
    const record = exactRecord(value, [
      "schemaVersion", "orderRef", "accountRef", "orderType", "status", "currency", "item",
      "amountCoins", "holdRef", "captureTransactionRef", "fulfillmentPlanRef", "createdAt"
    ]);
    const status = stringValue<CommerceOrderStatus>(record.status, ORDER_STATUS_SET);
    if (status !== "fulfillment_planned" || record.currency !== "COINS" || !isRecord(record.item)) invalidResponse();
    return {
      ...common,
      schemaVersion: "coins_commerce_order_v1",
      orderType,
      status,
      currency: "COINS",
      item: record.item as ProductOrderDto["item"],
      amountCoins: safeInteger(record.amountCoins),
      holdRef: text(record.holdRef),
      captureTransactionRef: text(record.captureTransactionRef),
      fulfillmentPlanRef: text(record.fulfillmentPlanRef)
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
    if (status !== "payment_requested" || snapshot.currency !== "COINS") invalidResponse();
    return {
      ...common,
      schemaVersion: "coins_commerce_order_v1",
      orderType,
      status,
      rechargeSnapshot: {
        rechargeOfferRef: text(snapshot.rechargeOfferRef),
        currency: "COINS",
        paidCoins: safeInteger(snapshot.paidCoins),
        bonusCoins: safeInteger(snapshot.bonusCoins)
      }
    };
  }
  return invalidResponse();
}

function parseWallet(value: unknown): WalletDto {
  const record = exactRecord(value, ["summary", "transactions"]);
  const summary = exactRecord(record.summary, [
    "accountRef", "at", "totalAvailableCoins", "totalFrozenCoins", "byOrigin"
  ]);
  const byOrigin = exactRecord(summary.byOrigin, [...COIN_ORIGINS]);
  const balances = Object.fromEntries(COIN_ORIGINS.map((origin) => {
    const balance = exactRecord(byOrigin[origin], ["availableCoins", "frozenCoins"]);
    return [origin, {
      availableCoins: safeInteger(balance.availableCoins),
      frozenCoins: safeInteger(balance.frozenCoins)
    }];
  })) as WalletDto["summary"]["byOrigin"];
  if (!Array.isArray(record.transactions)) invalidResponse();
  return {
    summary: {
      accountRef: text(summary.accountRef),
      at: text(summary.at),
      totalAvailableCoins: safeInteger(summary.totalAvailableCoins),
      totalFrozenCoins: safeInteger(summary.totalFrozenCoins),
      byOrigin: balances
    },
    transactions: record.transactions as WalletDto["transactions"]
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
  return {
    catalog: catalog as CatalogDto["catalog"],
    activeMemberships: record.activeMemberships as CatalogDto["activeMemberships"]
  };
}

function parseProductOrderResult(value: unknown): ProductOrderResultDto {
  const record = exactRecord(value, ["order", "fulfillmentPlan"]);
  const order = parseOrder(record.order);
  const plan = exactRecord(record.fulfillmentPlan, [
    "schemaVersion", "planRef", "orderRef", "accountRef", "status", "productVersionRef",
    "offerVersionRef", "grants", "createdAt"
  ]);
  if (order.orderType !== "product"
    || plan.schemaVersion !== "coins_commerce_fulfillment_plan_v1"
    || plan.status !== "ready"
    || !Array.isArray(plan.grants)) invalidResponse();
  return { order, fulfillmentPlan: plan as ProductOrderResultDto["fulfillmentPlan"] };
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
    || JSON.stringify(attempt.nextAction) !== JSON.stringify(nextAction)) invalidResponse();
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
  return `${baseUrl.replace(/\/$/, "")}${path}`;
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
  const read = <T>(sessionRef: string, path: string, parse: (value: unknown) => T, signal?: AbortSignal) => (
    requestJson(fetchFn, endpoint(baseUrl, path), {
      method: "GET",
      headers: sessionHeaders(sessionRef),
      signal
    }, parse)
  );
  const write = <T>(
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
  return JSON.parse(JSON.stringify(value)) as T;
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
