export type PortalRechargeOffer = {
  offerRef: string;
  quoteVersion: number;
  paidCoinUnits: number;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
};

export type PortalRechargePaymentMethod = "alipay" | "wechat_pay" | "paypal";

export type PortalRechargeNextAction = {
  type: "redirect";
  url: string;
  expiresAt: string;
};

export type PortalRechargeOrderStatus =
  | "created"
  | "entry_ready"
  | "pending"
  | "payment_verified"
  | "credited"
  | "failed_no_charge"
  | "reconciliation_required"
  | "expired";

export type PortalRechargeOrder = {
  orderRef: string;
  offerRef: string;
  quoteVersion: number;
  expectedPaidCoinUnits: number;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  adapterKey: string;
  paymentMethod: PortalRechargePaymentMethod;
  status: PortalRechargeOrderStatus;
  providerOrderRef: string | null;
  nextAction: PortalRechargeNextAction | null;
  walletOperationRef: string | null;
  walletLotRef: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PortalRechargeClient = {
  listOffers(input: { sessionRef: string }): Promise<PortalRechargeOffer[]>;
  createOrder(input: {
    sessionRef: string;
    offerRef: string;
    idempotencyKey: string;
  }): Promise<PortalRechargeOrder>;
  listOrders(input: { sessionRef: string }): Promise<PortalRechargeOrder[]>;
  getOrder(input: {
    sessionRef: string;
    orderRef: string;
  }): Promise<PortalRechargeOrder>;
  captureOrder(input: {
    sessionRef: string;
    orderRef: string;
    idempotencyKey: string;
  }): Promise<PortalRechargeOrder>;
};

export type PortalRechargeClientErrorCode =
  | "payment_recharge_session_invalid"
  | "payment_recharge_order_not_found"
  | "payment_recharge_request_invalid"
  | "payment_recharge_unavailable"
  | "payment_recharge_request_failed";

export class PortalRechargeClientError extends Error {
  readonly code: PortalRechargeClientErrorCode;
  readonly retryable: boolean;

  constructor(code: PortalRechargeClientErrorCode, retryable: boolean) {
    super("Portal recharge request failed.");
    this.name = "PortalRechargeClientError";
    this.code = code;
    this.retryable = retryable;
  }
}

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const PAYMENT_METHODS = new Set<PortalRechargePaymentMethod>([
  "alipay", "wechat_pay", "paypal",
]);
const STATUSES = new Set<PortalRechargeOrderStatus>([
  "created", "entry_ready", "pending", "payment_verified", "credited",
  "failed_no_charge", "reconciliation_required", "expired",
]);

function invalidProjection(): never {
  throw new PortalRechargeClientError("payment_recharge_request_failed", true);
}

function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidProjection();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))
  ) return invalidProjection();
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !("value" in descriptor)) return invalidProjection();
    result[field] = descriptor.value;
  }
  return result;
}

function exactArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return invalidProjection();
  }
  return [...value];
}

function reference(value: unknown) {
  if (typeof value !== "string" || !REFERENCE.test(value)) return invalidProjection();
  return value;
}

function positiveInteger(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return invalidProjection();
  return value as number;
}

function currencyCode(value: unknown) {
  if (typeof value !== "string" || !CURRENCY.test(value)) return invalidProjection();
  return value;
}

function currencyExponent(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 9) {
    return invalidProjection();
  }
  return value as number;
}

function paymentMethod(value: unknown): PortalRechargePaymentMethod {
  if (!PAYMENT_METHODS.has(value as PortalRechargePaymentMethod)) return invalidProjection();
  return value as PortalRechargePaymentMethod;
}

function nullableReference(value: unknown) {
  return value === null ? null : reference(value);
}

function timestamp(value: unknown) {
  if (
    typeof value !== "string"
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) return invalidProjection();
  return value;
}

function offerProjection(value: unknown): PortalRechargeOffer {
  const offer = exactObject(value, [
    "offerRef", "quoteVersion", "paidCoinUnits", "amountMinor", "currency", "currencyExponent",
  ]);
  return {
    offerRef: reference(offer.offerRef),
    quoteVersion: positiveInteger(offer.quoteVersion),
    paidCoinUnits: positiveInteger(offer.paidCoinUnits),
    amountMinor: positiveInteger(offer.amountMinor),
    currency: currencyCode(offer.currency),
    currencyExponent: currencyExponent(offer.currencyExponent),
  };
}

export type PortalRechargeTrustedActionOriginsByAdapter = Readonly<
  Record<string, readonly string[]>
>;

const DEFAULT_TRUSTED_ACTION_ORIGINS_BY_ADAPTER: PortalRechargeTrustedActionOriginsByAdapter =
  Object.freeze({
    paypal_v1: Object.freeze(["https://www.sandbox.paypal.com"]),
  });

function isUnsafeActionHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized)
    || (normalized.startsWith("[") && normalized.endsWith("]"));
}

function trustedActionOrigins(
  configured: PortalRechargeTrustedActionOriginsByAdapter | undefined,
) {
  if (
    configured
    && Object.keys(configured).some((adapterKey) => (
      Object.hasOwn(DEFAULT_TRUSTED_ACTION_ORIGINS_BY_ADAPTER, adapterKey)
    ))
  ) return invalidProjection();
  const merged: Record<string, readonly string[]> = {
    ...DEFAULT_TRUSTED_ACTION_ORIGINS_BY_ADAPTER,
    ...(configured ?? {}),
  };
  const result = new Map<string, ReadonlySet<string>>();
  for (const [adapterKey, values] of Object.entries(merged)) {
    reference(adapterKey);
    if (!Array.isArray(values)) return invalidProjection();
    const origins = new Set<string>();
    for (const value of values) {
      if (typeof value !== "string" || /[^\x20-\x7e]/u.test(value)) {
        return invalidProjection();
      }
      let url: URL;
      try { url = new URL(value); } catch { return invalidProjection(); }
      if (
        url.protocol !== "https:"
        || url.origin !== value
        || url.username !== ""
        || url.password !== ""
        || isUnsafeActionHost(url.hostname)
      ) return invalidProjection();
      origins.add(url.origin);
    }
    if (origins.size !== values.length) return invalidProjection();
    result.set(adapterKey, origins);
  }
  return result;
}

function nextActionProjection(
  value: unknown,
  adapterKey: string,
  trustedOrigins: ReadonlyMap<string, ReadonlySet<string>>,
): PortalRechargeOrder["nextAction"] {
  if (value === null) return null;
  const action = exactObject(value, ["type", "url", "expiresAt"]);
  if (
    action.type !== "redirect"
    || typeof action.url !== "string"
    || /[^\x20-\x7e]/u.test(action.url)
  ) return invalidProjection();
  let url: URL;
  try { url = new URL(action.url); } catch { return invalidProjection(); }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || isUnsafeActionHost(url.hostname)
    || !trustedOrigins.get(adapterKey)?.has(url.origin)
  ) return invalidProjection();
  return {
    type: "redirect",
    url: action.url,
    expiresAt: timestamp(action.expiresAt),
  };
}

function orderProjection(
  value: unknown,
  trustedOrigins: ReadonlyMap<string, ReadonlySet<string>>,
): PortalRechargeOrder {
  const order = exactObject(value, [
    "orderRef", "offerRef", "quoteVersion", "expectedPaidCoinUnits", "amountMinor",
    "currency", "currencyExponent", "adapterKey", "paymentMethod", "status",
    "providerOrderRef", "nextAction", "walletOperationRef", "walletLotRef",
    "expiresAt", "createdAt", "updatedAt",
  ]);
  if (!STATUSES.has(order.status as PortalRechargeOrderStatus)) return invalidProjection();
  const adapterKey = reference(order.adapterKey);
  return {
    orderRef: reference(order.orderRef),
    offerRef: reference(order.offerRef),
    quoteVersion: positiveInteger(order.quoteVersion),
    expectedPaidCoinUnits: positiveInteger(order.expectedPaidCoinUnits),
    amountMinor: positiveInteger(order.amountMinor),
    currency: currencyCode(order.currency),
    currencyExponent: currencyExponent(order.currencyExponent),
    adapterKey,
    paymentMethod: paymentMethod(order.paymentMethod),
    status: order.status as PortalRechargeOrderStatus,
    providerOrderRef: nullableReference(order.providerOrderRef),
    nextAction: nextActionProjection(order.nextAction, adapterKey, trustedOrigins),
    walletOperationRef: nullableReference(order.walletOperationRef),
    walletLotRef: nullableReference(order.walletLotRef),
    expiresAt: timestamp(order.expiresAt),
    createdAt: timestamp(order.createdAt),
    updatedAt: timestamp(order.updatedAt),
  };
}

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/u, "")}${path}`;
}

async function request<T>(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  status: number,
  project: (value: unknown) => T,
) {
  let response: Response;
  try { response = await fetchFn(url, init); } catch {
    throw new PortalRechargeClientError("payment_recharge_request_failed", true);
  }
  if (response.status !== status) {
    if (response.status === 401) {
      throw new PortalRechargeClientError("payment_recharge_session_invalid", false);
    }
    if (response.status === 404) {
      throw new PortalRechargeClientError("payment_recharge_unavailable", true);
    }
    throw new PortalRechargeClientError(
      "payment_recharge_request_failed",
      response.status >= 500 || response.status === 429,
    );
  }
  let body: unknown;
  try { body = await response.json(); } catch { return invalidProjection(); }
  return project(body);
}

function headers(sessionRef: string, json = false): Record<string, string> {
  const result = { "X-Portal-Session": reference(sessionRef) };
  return json ? { ...result, "Content-Type": "application/json" } : result;
}

export function createPortalRechargeClient({
  baseUrl = "",
  fetchFn = fetch,
  trustedActionOriginsByAdapter,
}: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  trustedActionOriginsByAdapter?: PortalRechargeTrustedActionOriginsByAdapter;
} = {}): PortalRechargeClient {
  const trustedOrigins = trustedActionOrigins(trustedActionOriginsByAdapter);
  return Object.freeze({
    listOffers({ sessionRef }) {
      return request(
        fetchFn,
        endpoint(baseUrl, "/api/portal/coins/recharge/offers"),
        { method: "GET", headers: headers(sessionRef) },
        200,
        (body) => exactArray(exactObject(body, ["offers"]).offers).map(offerProjection),
      );
    },
    createOrder({ sessionRef, offerRef, idempotencyKey }) {
      return request(
        fetchFn,
        endpoint(baseUrl, "/api/portal/coins/recharge/orders"),
        {
          method: "POST",
          headers: headers(sessionRef, true),
          body: JSON.stringify({ offerRef: reference(offerRef), idempotencyKey: reference(idempotencyKey) }),
        },
        201,
        (body) => orderProjection(
          exactObject(exactObject(body, ["recharge"]).recharge, ["order"]).order,
          trustedOrigins,
        ),
      );
    },
    listOrders({ sessionRef }) {
      return request(
        fetchFn,
        endpoint(baseUrl, "/api/portal/coins/recharge/orders"),
        { method: "GET", headers: headers(sessionRef) },
        200,
        (body) => exactArray(exactObject(body, ["recharges"]).recharges)
          .map((order) => orderProjection(order, trustedOrigins)),
      );
    },
    getOrder({ sessionRef, orderRef }) {
      const expectedRef = reference(orderRef);
      return request(
        fetchFn,
        endpoint(baseUrl, `/api/portal/coins/recharge/orders/${encodeURIComponent(expectedRef)}`),
        { method: "GET", headers: headers(sessionRef) },
        200,
        (body) => {
          const order = orderProjection(
            exactObject(exactObject(body, ["recharge"]).recharge, ["order"]).order,
            trustedOrigins,
          );
          return order.orderRef === expectedRef ? order : invalidProjection();
        },
      );
    },
    captureOrder({ sessionRef, orderRef, idempotencyKey }) {
      const expectedRef = reference(orderRef);
      return request(
        fetchFn,
        endpoint(baseUrl, `/api/portal/coins/recharge/orders/${encodeURIComponent(expectedRef)}/capture`),
        {
          method: "POST",
          headers: headers(sessionRef, true),
          body: JSON.stringify({ idempotencyKey: reference(idempotencyKey) }),
        },
        200,
        (body) => {
          const order = orderProjection(
            exactObject(exactObject(body, ["recharge"]).recharge, ["order"]).order,
            trustedOrigins,
          );
          return order.orderRef === expectedRef ? order : invalidProjection();
        },
      );
    },
  });
}
