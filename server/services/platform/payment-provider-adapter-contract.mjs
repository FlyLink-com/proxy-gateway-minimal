import { types as utilTypes } from "node:util";
import { isIP } from "node:net";

const ERROR_CODES = new Set([
  "invalid_payment_method",
  "invalid_payment_provider_adapter",
  "invalid_payment_next_action",
  "invalid_payment_operation_input",
  "invalid_payment_operation_result",
  "invalid_verified_payment_event",
  "invalid_payment_provider_error",
  "invalid_payment_webhook_ack",
  "invalid_payment_execution",
  "unsupported_payment_operation",
  "payment_execution_scope_closed",
  "payment_provider_capability_disabled",
]);

const ADAPTER_KEYS = [
  "adapterKey",
  "providerId",
  "contractVersion",
  "capabilities",
  "supportedPaymentMethods",
  "createRechargeOrder",
  "queryPayment",
  "verifyAndNormalizeCallback",
  "normalizeError",
  "webhookSuccessAck",
  "refund",
  "reconcile",
];
const CAPABILITY_KEYS = [
  "createRechargeOrder",
  "queryPayment",
  "verifyCallback",
  "refund",
  "reconcile",
  "repeatCreateIdempotent",
];
const EXECUTION_OPERATIONS = new Set([
  "create_recharge_order",
  "query_payment",
  "verify_callback",
  "refund",
  "reconcile",
]);
const PROVIDER_ERROR_CODES = new Set([
  "invalid_request",
  "unsupported_payment_method",
  "provider_contract_unverified",
  "provider_authentication_failed",
  "provider_authorization_failed",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable",
  "provider_rejected",
  "provider_verification_failed",
  "provider_idempotency_conflict",
  "provider_protocol_error",
  "provider_operation_failed",
]);
const NO_CHARGE_CODES = new Set([
  "invalid_request",
  "unsupported_payment_method",
  "provider_contract_unverified",
]);
const CHARGE_CERTAINTIES = new Set([
  "unknown",
  "possibly_charged",
  "confirmed_no_charge",
  "confirmed_charged",
]);
const EVENT_TYPES = new Set([
  "payment_pending",
  "payment_succeeded",
  "payment_failed",
  "payment_refunded",
  "payment_chargeback",
]);
const REFUND_REASONS = new Set([
  "duplicate_charge",
  "customer_request",
  "fraud",
  "service_failure",
  "other",
]);
const ACK_CONTENT_TYPES = new Set([
  "text/plain",
  "application/json",
  "application/xml",
  "text/xml",
]);
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);
const METHOD_RE = /^[a-z][a-z0-9_]{2,63}$/;
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]{1,128}$/;

const verifiedEvents = new WeakSet();
const providerErrors = new WeakSet();

function contractError(code) {
  if (!ERROR_CODES.has(code)) throw new Error("invalid_contract_error_code");
  return new Error(code);
}

function reject(code) {
  return Promise.reject(contractError(code));
}

function snapshotObject(value, expectedKeys, code) {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) {
    throw contractError(code);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw contractError(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== "string")
    || expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
  ) {
    throw contractError(code);
  }
  const result = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      throw contractError(code);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotOptionalObject(value, allowedKeys, code) {
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) {
    throw contractError(code);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw contractError(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
  ) {
    throw contractError(code);
  }
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      throw contractError(code);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotArray(value, code) {
  if (utilTypes.isProxy(value) || !Array.isArray(value)) throw contractError(code);
  if (Object.getPrototypeOf(value) !== Array.prototype) throw contractError(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) throw contractError(code);
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw contractError(code);
  }
  const length = lengthDescriptor.value;
  if (keys.length !== length + 1) throw contractError(code);
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      throw contractError(code);
    }
    result.push(descriptor.value);
  }
  return result;
}

function snapshotFunction(value, code) {
  if (typeof value !== "function" || utilTypes.isProxy(value)) throw contractError(code);
  return value;
}

function assertSafeRef(value, nullable, code) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) throw contractError(code);
  return value;
}

function assertMethodKey(value, code) {
  if (typeof value !== "string" || !METHOD_RE.test(value)) throw contractError(code);
  return value;
}

function assertPositiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    throw contractError(code);
  }
  return value;
}

function assertCurrency(value, code) {
  if (typeof value !== "string" || !CURRENCY_RE.test(value)) throw contractError(code);
  return value;
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) throw contractError(code);
  return value;
}

function assertTimestamp(value, code) {
  if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) {
    throw contractError(code);
  }
  try {
    if (new Date(value).toISOString() !== value) throw contractError(code);
  } catch {
    throw contractError(code);
  }
  return value;
}

function freezeObject(value) {
  for (const key of Reflect.ownKeys(value)) {
    const child = value[key];
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      freezeObject(child);
    }
  }
  return Object.freeze(value);
}

function isNativePromise(value) {
  return (
    value !== null
    && typeof value === "object"
    && !utilTypes.isProxy(value)
    && Object.getPrototypeOf(value) === Promise.prototype
  );
}

function isCustomThenable(value) {
  if (
    value === null
    || (typeof value !== "object" && typeof value !== "function")
    || isNativePromise(value)
  ) {
    return false;
  }
  if (utilTypes.isProxy(value)) return true;
  let current = value;
  while (current !== null) {
    if (utilTypes.isProxy(current)) return true;
    if (Object.getOwnPropertyDescriptor(current, "then")) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function canonicalOrigin(value, code) {
  if (typeof value !== "string" || /[^\x20-\x7e]/u.test(value)) throw contractError(code);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw contractError(code);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.origin !== value
    || hostname.endsWith(".")
    || isLoopbackHost(hostname)
  ) {
    throw contractError(code);
  }
  return parsed.origin;
}

function ipv6Words(value) {
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half) => {
    if (half === "") return [];
    const words = [];
    for (const part of half.split(":")) {
      if (part.includes(".")) {
        if (isIP(part) !== 4) return null;
        const bytes = part.split(".").map(Number);
        words.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
      } else {
        const word = Number.parseInt(part, 16);
        if (!/^[a-f0-9]{1,4}$/iu.test(part) || !Number.isInteger(word)) return null;
        words.push(word);
      }
    }
    return words;
  };
  const left = parseHalf(halves[0]);
  const right = halves.length === 2 ? parseHalf(halves[1]) : [];
  if (left === null || right === null) return null;
  const missing = 8 - left.length - right.length;
  if (
    missing < 0
    || (halves.length === 1 && missing !== 0)
    || (halves.length === 2 && missing < 1)
  ) {
    return null;
  }
  return [...left, ...Array(missing).fill(0), ...right];
}

function isLoopbackHost(hostname) {
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (bare === "localhost" || bare.endsWith(".localhost")) return true;
  const ipVersion = isIP(bare);
  if (ipVersion === 4) return Number(bare.split(".")[0]) === 127;
  if (ipVersion !== 6) return false;
  const words = ipv6Words(bare);
  if (words === null) return false;
  const directLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const mappedOrCompatible = words.slice(0, 5).every((word) => word === 0)
    && (words[5] === 0 || words[5] === 0xffff)
    && (words[6] >> 8) === 127;
  return directLoopback || mappedOrCompatible;
}

function snapshotAllowedOrigins(value, code) {
  const origins = snapshotArray(value, code);
  const normalized = origins.map((origin) => canonicalOrigin(origin, code));
  if (new Set(normalized).size !== normalized.length) throw contractError(code);
  return Object.freeze(normalized);
}

function snapshotActionOptions(options, code) {
  const input = snapshotOptionalObject(options, ["allowedActionOrigins"], code);
  return Object.hasOwn(input, "allowedActionOrigins")
    ? snapshotAllowedOrigins(input.allowedActionOrigins, code)
    : Object.freeze([]);
}

function normalizeRawNextAction(value, allowedActionOrigins, code) {
  if (value === null) return null;
  const input = snapshotObject(value, ["type", "url", "expiresAt"], code);
  if (input.type !== "redirect" && input.type !== "qr_code") throw contractError(code);
  if (typeof input.url !== "string" || /[^\x20-\x7e]/u.test(input.url)) {
    throw contractError(code);
  }
  let parsed;
  try {
    parsed = new URL(input.url);
  } catch {
    throw contractError(code);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
    || hostname.endsWith(".")
    || isLoopbackHost(hostname)
    || !allowedActionOrigins.includes(parsed.origin)
  ) {
    throw contractError(code);
  }
  return freezeObject({
    type: input.type,
    url: input.url,
    expiresAt: assertTimestamp(input.expiresAt, code),
  });
}

export const PAYMENT_METHODS_V1 = Object.freeze(["alipay", "wechat_pay"]);

export function normalizePaymentMethod(value) {
  if (value !== "alipay" && value !== "wechat_pay") {
    throw contractError("invalid_payment_method");
  }
  return value;
}

export function normalizePaymentNextAction(value, options = {}) {
  const origins = snapshotActionOptions(options, "invalid_payment_next_action");
  return normalizeRawNextAction(value, origins, "invalid_payment_next_action");
}

function normalizeRawOperationResult(value, allowedActionOrigins, code) {
  const input = snapshotObject(
    value,
    ["providerOrderRef", "status", "chargeCertainty", "nextAction", "occurredAt"],
    code,
  );
  const providerOrderRef = assertSafeRef(input.providerOrderRef, true, code);
  const nextAction = normalizeRawNextAction(input.nextAction, allowedActionOrigins, code);
  const occurredAt = assertTimestamp(input.occurredAt, code);
  let legal = false;
  if (input.status === "entry_ready") {
    legal = input.chargeCertainty === "possibly_charged"
      && providerOrderRef !== null
      && nextAction !== null;
  } else if (input.status === "pending") {
    legal = input.chargeCertainty === "possibly_charged"
      && providerOrderRef !== null
      && nextAction === null;
  } else if (input.status === "succeeded" || input.status === "reversed") {
    legal = input.chargeCertainty === "confirmed_charged"
      && providerOrderRef !== null
      && nextAction === null;
  } else if (input.status === "failed_no_charge") {
    legal = input.chargeCertainty === "confirmed_no_charge" && nextAction === null;
  } else if (input.status === "reconciliation_required") {
    legal = (
      input.chargeCertainty === "unknown"
      || input.chargeCertainty === "possibly_charged"
      || input.chargeCertainty === "confirmed_charged"
    ) && nextAction === null;
  }
  if (!legal) throw contractError(code);
  return freezeObject({
    providerOrderRef,
    status: input.status,
    chargeCertainty: input.chargeCertainty,
    nextAction,
    occurredAt,
  });
}

export function normalizePaymentOperationResult(value, options = {}) {
  const origins = snapshotActionOptions(options, "invalid_payment_operation_result");
  return normalizeRawOperationResult(value, origins, "invalid_payment_operation_result");
}

function normalizeRawVerifiedEvent(value, code) {
  const input = snapshotObject(value, [
    "providerEventRef",
    "eventDedupeKey",
    "eventType",
    "providerOrderRef",
    "amountMinor",
    "currency",
    "merchantScopeDigest",
    "payloadDigest",
    "occurredAt",
    "verificationResult",
  ], code);
  if (!EVENT_TYPES.has(input.eventType) || input.verificationResult !== "verified") {
    throw contractError(code);
  }
  return freezeObject({
    providerEventRef: assertSafeRef(input.providerEventRef, true, code),
    eventDedupeKey: assertSafeRef(input.eventDedupeKey, false, code),
    eventType: input.eventType,
    providerOrderRef: assertSafeRef(input.providerOrderRef, false, code),
    amountMinor: assertPositiveInteger(input.amountMinor, code),
    currency: assertCurrency(input.currency, code),
    merchantScopeDigest: assertDigest(input.merchantScopeDigest, code),
    payloadDigest: assertDigest(input.payloadDigest, code),
    occurredAt: assertTimestamp(input.occurredAt, code),
    verificationResult: "verified",
  });
}

export function normalizeVerifiedPaymentEvent(value) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || !verifiedEvents.has(value)
    || !Object.isFrozen(value)
  ) {
    throw contractError("invalid_verified_payment_event");
  }
  return value;
}

function createProviderError(input) {
  const error = new Error(input.code);
  Object.assign(error, {
    code: input.code,
    operation: input.operation,
    retryable: input.retryable,
    chargeCertainty: input.chargeCertainty,
    providerOrderRef: input.providerOrderRef,
    occurredAt: input.occurredAt,
  });
  providerErrors.add(error);
  return Object.freeze(error);
}

export function normalizePaymentProviderError(value) {
  const code = "invalid_payment_provider_error";
  const input = snapshotObject(value, [
    "code",
    "operation",
    "retryable",
    "chargeCertainty",
    "providerOrderRef",
    "occurredAt",
  ], code);
  if (
    !PROVIDER_ERROR_CODES.has(input.code)
    || !EXECUTION_OPERATIONS.has(input.operation)
    || typeof input.retryable !== "boolean"
    || !CHARGE_CERTAINTIES.has(input.chargeCertainty)
  ) {
    throw contractError(code);
  }
  const providerOrderRef = assertSafeRef(input.providerOrderRef, true, code);
  if (
    (input.chargeCertainty === "confirmed_no_charge"
      && (!NO_CHARGE_CODES.has(input.code) || providerOrderRef !== null))
    || (input.chargeCertainty === "confirmed_charged" && providerOrderRef === null)
  ) {
    throw contractError(code);
  }
  return createProviderError({
    code: input.code,
    operation: input.operation,
    retryable: input.retryable,
    chargeCertainty: input.chargeCertainty,
    providerOrderRef,
    occurredAt: assertTimestamp(input.occurredAt, code),
  });
}

function genericProviderError(operation) {
  return createProviderError({
    code: "provider_operation_failed",
    operation,
    retryable: false,
    chargeCertainty: "unknown",
    providerOrderRef: null,
    occurredAt: new Date().toISOString(),
  });
}

function safeProviderError(error, operation) {
  return (
    error !== null
    && typeof error === "object"
    && !utilTypes.isProxy(error)
    && providerErrors.has(error)
  ) ? error : genericProviderError(operation);
}

function createInput(value) {
  const code = "invalid_payment_operation_input";
  const input = snapshotObject(value, [
    "paymentOrderRef",
    "attemptRef",
    "providerRequestRef",
    "paymentMethod",
    "amountMinor",
    "currency",
    "expectedPaidCoins",
    "quoteDigest",
    "expiresAt",
    "callbackRouteRef",
    "returnRouteRef",
  ], code);
  return freezeObject({
    paymentOrderRef: assertSafeRef(input.paymentOrderRef, false, code),
    attemptRef: assertSafeRef(input.attemptRef, false, code),
    providerRequestRef: assertSafeRef(input.providerRequestRef, false, code),
    paymentMethod: (() => {
      try {
        return normalizePaymentMethod(input.paymentMethod);
      } catch {
        throw contractError(code);
      }
    })(),
    amountMinor: assertPositiveInteger(input.amountMinor, code),
    currency: assertCurrency(input.currency, code),
    expectedPaidCoins: assertPositiveInteger(input.expectedPaidCoins, code),
    quoteDigest: assertDigest(input.quoteDigest, code),
    expiresAt: assertTimestamp(input.expiresAt, code),
    callbackRouteRef: assertSafeRef(input.callbackRouteRef, false, code),
    returnRouteRef: assertSafeRef(input.returnRouteRef, true, code),
  });
}

function lookupInput(value) {
  const code = "invalid_payment_operation_input";
  const input = snapshotObject(
    value,
    ["paymentOrderRef", "attemptRef", "providerOrderRef"],
    code,
  );
  return freezeObject({
    paymentOrderRef: assertSafeRef(input.paymentOrderRef, false, code),
    attemptRef: assertSafeRef(input.attemptRef, false, code),
    providerOrderRef: assertSafeRef(input.providerOrderRef, false, code),
  });
}

function refundInput(value) {
  const code = "invalid_payment_operation_input";
  const input = snapshotObject(value, [
    "paymentOrderRef",
    "attemptRef",
    "providerOrderRef",
    "refundRequestRef",
    "amountMinor",
    "currency",
    "reasonCode",
  ], code);
  if (!REFUND_REASONS.has(input.reasonCode)) throw contractError(code);
  return freezeObject({
    paymentOrderRef: assertSafeRef(input.paymentOrderRef, false, code),
    attemptRef: assertSafeRef(input.attemptRef, false, code),
    providerOrderRef: assertSafeRef(input.providerOrderRef, false, code),
    refundRequestRef: assertSafeRef(input.refundRequestRef, false, code),
    amountMinor: assertPositiveInteger(input.amountMinor, code),
    currency: assertCurrency(input.currency, code),
    reasonCode: input.reasonCode,
  });
}

function callbackInput(value) {
  const code = "invalid_payment_operation_input";
  const input = snapshotObject(
    value,
    ["callbackRequestRef", "receivedAt", "bodyBase64", "headerEntries"],
    code,
  );
  if (typeof input.bodyBase64 !== "string" || input.bodyBase64.length % 4 !== 0) {
    throw contractError(code);
  }
  let body;
  try {
    body = Buffer.from(input.bodyBase64, "base64");
  } catch {
    throw contractError(code);
  }
  if (
    body.length < 1
    || body.length > 1_048_576
    || body.toString("base64") !== input.bodyBase64
  ) {
    throw contractError(code);
  }
  const headers = snapshotArray(input.headerEntries, code);
  if (headers.length > 64) throw contractError(code);
  const normalizedHeaders = headers.map((entry) => {
    const header = snapshotObject(entry, ["name", "value"], code);
    if (
      typeof header.name !== "string"
      || !HEADER_NAME_RE.test(header.name)
      || FORBIDDEN_HEADERS.has(header.name)
      || typeof header.value !== "string"
      || header.value.length > 4096
      || /[\r\n\0]/u.test(header.value)
    ) {
      throw contractError(code);
    }
    return { name: header.name, value: header.value };
  });
  return freezeObject({
    callbackRequestRef: assertSafeRef(input.callbackRequestRef, false, code),
    receivedAt: assertTimestamp(input.receivedAt, code),
    bodyBase64: input.bodyBase64,
    headerEntries: normalizedHeaders,
  });
}

function normalizeAck(value) {
  const code = "invalid_payment_webhook_ack";
  const input = snapshotObject(value, ["statusCode", "contentType", "body"], code);
  if (
    !Number.isSafeInteger(input.statusCode)
    || input.statusCode < 200
    || input.statusCode > 299
    || !ACK_CONTENT_TYPES.has(input.contentType)
    || typeof input.body !== "string"
    || Buffer.byteLength(input.body, "utf8") > 256
    || input.body.includes("\0")
  ) {
    throw contractError(code);
  }
  return freezeObject({
    statusCode: input.statusCode,
    contentType: input.contentType,
    body: input.body,
  });
}

function invokeCompiled(compiled, input, normalize, operation) {
  let raw;
  try {
    raw = compiled(input);
  } catch (error) {
    return Promise.reject(safeProviderError(error, operation));
  }
  if (isNativePromise(raw)) {
    return raw.then(
      (value) => normalize(value),
      (error) => Promise.reject(safeProviderError(error, operation)),
    );
  }
  try {
    return Promise.resolve(normalize(raw));
  } catch (error) {
    return Promise.reject(error);
  }
}

export function assertPaymentProviderAdapterContract(adapter, options = {}) {
  const code = "invalid_payment_provider_adapter";
  const input = snapshotObject(adapter, ADAPTER_KEYS, code);
  const optionInput = snapshotOptionalObject(options, ["allowedActionOrigins"], code);
  const allowedActionOrigins = Object.hasOwn(optionInput, "allowedActionOrigins")
    ? snapshotAllowedOrigins(optionInput.allowedActionOrigins, code)
    : Object.freeze([]);
  const capabilities = snapshotObject(input.capabilities, CAPABILITY_KEYS, code);
  if (CAPABILITY_KEYS.some((key) => typeof capabilities[key] !== "boolean")) {
    throw contractError(code);
  }
  assertMethodKey(input.adapterKey, code);
  assertMethodKey(input.providerId, code);
  if (input.providerId === "alipay" || input.providerId === "wechat_pay") {
    throw contractError(code);
  }
  if (input.adapterKey === input.providerId) throw contractError(code);
  if (input.contractVersion !== "v1" && input.contractVersion !== "unverified") {
    throw contractError(code);
  }
  const supportedPaymentMethods = snapshotArray(input.supportedPaymentMethods, code);
  for (const method of supportedPaymentMethods) {
    try {
      normalizePaymentMethod(method);
    } catch {
      throw contractError(code);
    }
  }
  const canonicalSubset = PAYMENT_METHODS_V1.filter((method) => supportedPaymentMethods.includes(method));
  if (
    canonicalSubset.length !== supportedPaymentMethods.length
    || canonicalSubset.some((method, index) => method !== supportedPaymentMethods[index])
  ) {
    throw contractError(code);
  }
  const anyOperationEnabled = (
    capabilities.createRechargeOrder
    || capabilities.queryPayment
    || capabilities.verifyCallback
    || capabilities.refund
    || capabilities.reconcile
  );
  if (
    (capabilities.repeatCreateIdempotent && !capabilities.createRechargeOrder)
    || (anyOperationEnabled && supportedPaymentMethods.length === 0)
    || (!anyOperationEnabled && supportedPaymentMethods.length !== 0)
    || (input.contractVersion === "unverified"
      && CAPABILITY_KEYS.some((key) => capabilities[key] !== false))
  ) {
    throw contractError(code);
  }
  const methods = {
    createRechargeOrder: snapshotFunction(input.createRechargeOrder, code),
    queryPayment: snapshotFunction(input.queryPayment, code),
    verifyAndNormalizeCallback: snapshotFunction(input.verifyAndNormalizeCallback, code),
    normalizeError: snapshotFunction(input.normalizeError, code),
    webhookSuccessAck: snapshotFunction(input.webhookSuccessAck, code),
    refund: snapshotFunction(input.refund, code),
    reconcile: snapshotFunction(input.reconcile, code),
  };
  if (methods.queryPayment === methods.verifyAndNormalizeCallback) {
    throw contractError(code);
  }

  const disabled = () => reject("payment_provider_capability_disabled");
  const normalizedCapabilities = freezeObject({ ...capabilities });
  const normalizedMethods = Object.freeze([...supportedPaymentMethods]);
  const result = {
    adapterKey: input.adapterKey,
    providerId: input.providerId,
    contractVersion: input.contractVersion,
    capabilities: normalizedCapabilities,
    supportedPaymentMethods: normalizedMethods,
    createRechargeOrder: capabilities.createRechargeOrder
      ? (value) => {
        let normalized;
        try {
          normalized = createInput(value);
        } catch (error) {
          return Promise.reject(error);
        }
        return invokeCompiled(
          methods.createRechargeOrder,
          normalized,
          (output) => normalizeRawOperationResult(
            output,
            allowedActionOrigins,
            "invalid_payment_operation_result",
          ),
          "create_recharge_order",
        );
      }
      : disabled,
    queryPayment: capabilities.queryPayment
      ? (value) => {
        let normalized;
        try {
          normalized = lookupInput(value);
        } catch (error) {
          return Promise.reject(error);
        }
        return invokeCompiled(
          methods.queryPayment,
          normalized,
          (output) => normalizeRawOperationResult(
            output,
            allowedActionOrigins,
            "invalid_payment_operation_result",
          ),
          "query_payment",
        );
      }
      : disabled,
    verifyAndNormalizeCallback: capabilities.verifyCallback
      ? (value) => {
        let normalized;
        try {
          normalized = callbackInput(value);
        } catch (error) {
          return Promise.reject(error);
        }
        return invokeCompiled(
          methods.verifyAndNormalizeCallback,
          normalized,
          (output) => normalizeVerifiedPaymentEvent(output),
          "verify_callback",
        );
      }
      : disabled,
    normalizeError: (value) => {
      let wrapper;
      try {
        wrapper = snapshotObject(value, ["operation", "error"], code);
        if (!EXECUTION_OPERATIONS.has(wrapper.operation)) throw contractError(code);
      } catch {
        return genericProviderError("reconcile");
      }
      let raw;
      try {
        raw = methods.normalizeError(Object.freeze({
          operation: wrapper.operation,
          error: wrapper.error,
        }));
        if (isNativePromise(raw)) {
          void raw.then(
            () => undefined,
            () => undefined,
          );
          return genericProviderError(wrapper.operation);
        }
        return normalizePaymentProviderError(raw);
      } catch {
        return genericProviderError(wrapper.operation);
      }
    },
    webhookSuccessAck: capabilities.verifyCallback
      ? (event) => {
        if (
          event === null
          || typeof event !== "object"
          || utilTypes.isProxy(event)
          || !verifiedEvents.has(event)
        ) {
          return reject("invalid_payment_webhook_ack");
        }
        return invokeCompiled(
          methods.webhookSuccessAck,
          event,
          normalizeAck,
          "verify_callback",
        );
      }
      : disabled,
    refund: capabilities.refund
      ? (value) => {
        let normalized;
        try {
          normalized = refundInput(value);
        } catch (error) {
          return Promise.reject(error);
        }
        return invokeCompiled(
          methods.refund,
          normalized,
          (output) => normalizeRawOperationResult(
            output,
            allowedActionOrigins,
            "invalid_payment_operation_result",
          ),
          "refund",
        );
      }
      : disabled,
    reconcile: capabilities.reconcile
      ? (value) => {
        let normalized;
        try {
          normalized = lookupInput(value);
        } catch (error) {
          return Promise.reject(error);
        }
        return invokeCompiled(
          methods.reconcile,
          normalized,
          (output) => normalizeRawOperationResult(
            output,
            allowedActionOrigins,
            "invalid_payment_operation_result",
          ),
          "reconcile",
        );
      }
      : disabled,
  };
  return Object.freeze(result);
}

function normalizeExecutionOutput(operation, value, allowedActionOrigins) {
  if (operation === "verify_callback") {
    const event = normalizeRawVerifiedEvent(value, "invalid_verified_payment_event");
    verifiedEvents.add(event);
    return event;
  }
  return normalizeRawOperationResult(
    value,
    allowedActionOrigins,
    "invalid_payment_operation_result",
  );
}

export function createCredentialScopedPaymentExecution(options) {
  const code = "invalid_payment_execution";
  const input = snapshotObject(options, [
    "profileRef",
    "adapterKey",
    "contractVersion",
    "credentialProfileRef",
    "credentialLoader",
    "requestFn",
    "allowedActionOrigins",
  ], code);
  const profileRef = assertSafeRef(input.profileRef, false, code);
  const adapterKey = assertMethodKey(input.adapterKey, code);
  if (input.contractVersion !== "v1" && input.contractVersion !== "unverified") {
    throw contractError(code);
  }
  const contractVersion = input.contractVersion;
  const credentialProfileRef = assertSafeRef(input.credentialProfileRef, false, code);
  const loader = snapshotObject(input.credentialLoader, ["withCredential"], code);
  const loaderMethod = snapshotFunction(loader.withCredential, code);
  const requestFn = snapshotFunction(input.requestFn, code);
  const allowedActionOrigins = snapshotAllowedOrigins(input.allowedActionOrigins, code);

  const withCredential = (operation, compiledAdapterCallback) => {
    if (!EXECUTION_OPERATIONS.has(operation)) {
      return reject("unsupported_payment_operation");
    }
    let callback;
    try {
      callback = snapshotFunction(compiledAdapterCallback, code);
    } catch (error) {
      return Promise.reject(error);
    }
    const binding = freezeObject({
      profileRef,
      adapterKey,
      contractVersion,
      credentialProfileRef,
      operation,
    });
    let callbackInvoked = false;
    let callbackOutcome;
    let loaderClosed = false;
    let scopeActive = false;
    const closeScope = () => {
      scopeActive = false;
    };
    const drainCallbackOutcome = () => {
      if (isNativePromise(callbackOutcome)) {
        void callbackOutcome.then(
          () => undefined,
          () => undefined,
        );
      }
    };
    const abortLoader = (error) => {
      loaderClosed = true;
      closeScope();
      drainCallbackOutcome();
      return Promise.reject(error);
    };

    const loaderCallback = (credentialHandle) => {
      if (callbackInvoked) return callbackOutcome;
      if (loaderClosed) return Promise.reject(genericProviderError(operation));
      callbackInvoked = true;
      scopeActive = true;
      const scopedRequest = (request) => {
        if (!scopeActive) return reject("payment_execution_scope_closed");
        let response;
        try {
          response = requestFn({ binding, credentialHandle, request });
        } catch (error) {
          closeScope();
          return Promise.reject(safeProviderError(error, operation));
        }
        if (isNativePromise(response)) {
          return response.catch((error) => {
            closeScope();
            return Promise.reject(safeProviderError(error, operation));
          });
        }
        return response;
      };
      const context = Object.freeze({ binding, request: scopedRequest });
      let raw;
      try {
        raw = callback(context);
      } catch (error) {
        closeScope();
        callbackOutcome = Promise.reject(safeProviderError(error, operation));
        return callbackOutcome;
      }
      if (isNativePromise(raw)) {
        callbackOutcome = raw.then(
          (value) => normalizeExecutionOutput(operation, value, allowedActionOrigins),
          (error) => Promise.reject(safeProviderError(error, operation)),
        ).catch((error) => Promise.reject(safeProviderError(error, operation)))
          .finally(() => {
            closeScope();
          });
        return callbackOutcome;
      }
      try {
        callbackOutcome = Promise.resolve(
          normalizeExecutionOutput(operation, raw, allowedActionOrigins),
        );
      } catch (error) {
        callbackOutcome = Promise.reject(safeProviderError(error, operation));
      }
      closeScope();
      return callbackOutcome;
    };

    let loaderOutcome;
    try {
      loaderOutcome = loaderMethod(binding, loaderCallback);
    } catch (error) {
      return abortLoader(safeProviderError(error, operation));
    }
    if (isCustomThenable(loaderOutcome)) {
      return abortLoader(genericProviderError(operation));
    }
    if (isNativePromise(loaderOutcome)) {
      return loaderOutcome.then(
        () => {
          loaderClosed = true;
          return callbackInvoked
            ? callbackOutcome
            : Promise.reject(genericProviderError(operation));
        },
        (error) => {
          return abortLoader(safeProviderError(error, operation));
        },
      );
    }
    loaderClosed = true;
    if (!callbackInvoked) return Promise.reject(genericProviderError(operation));
    return callbackOutcome;
  };

  return Object.freeze({ withCredential });
}
