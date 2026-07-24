import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { formatPaymentAmountMinor, parsePaymentAmountMinor } from "./payment-money-codec.mjs";

const INVALID_PROTOCOL = "invalid_paypal_protocol";
const UNVERIFIED_CONTRACT = "provider_contract_unverified";
const ACTION_CERT_URL = "https://cert.synthetic.invalid/paypal.pem";
const REQUIRED_WEBHOOK_HEADERS = Object.freeze([
  "paypal-auth-algo",
  "paypal-cert-url",
  "paypal-transmission-id",
  "paypal-transmission-sig",
  "paypal-transmission-time",
]);
const REVIEWED_ACTION_RELS = new Set(["approve", "payer-action"]);
const REQUEST_OPERATIONS = new Set([
  "create_recharge_order",
  "capture_payment",
]);
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST_RE = /^[a-f0-9]{64}$/u;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9a-z]{1,128}$/u;
const STATUS_RE = /^[A-Z][A-Z0-9_.-]{0,63}$/u;
const CURRENCY_RE = /^[A-Z]{3}$/u;

function invalidProtocol() {
  throw new TypeError(INVALID_PROTOCOL);
}

function unverifiedContract() {
  throw new TypeError(UNVERIFIED_CONTRACT);
}

function publicCall(callback) {
  try {
    return callback();
  } catch (error) {
    if (
      error?.constructor === TypeError
      && error.message === UNVERIFIED_CONTRACT
    ) {
      throw error;
    }
    invalidProtocol();
  }
}

function snapshotObject(value, expectedKeys) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
  ) {
    invalidProtocol();
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) invalidProtocol();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== "string")
    || expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
  ) {
    invalidProtocol();
  }
  const result = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      invalidProtocol();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotArray(value, maximumLength = Number.MAX_SAFE_INTEGER) {
  if (
    utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    invalidProtocol();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) invalidProtocol();
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximumLength
    || keys.length !== lengthDescriptor.value + 1
  ) {
    invalidProtocol();
  }
  const result = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      invalidProtocol();
    }
    result.push(descriptor.value);
  }
  return result;
}

function safeRef(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) invalidProtocol();
  return value;
}

function boundedText(value, maximumLength = 4096) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximumLength
    || /[\0\r\n]/u.test(value)
  ) {
    invalidProtocol();
  }
  return value;
}

function headerValue(value) {
  if (
    typeof value !== "string"
    || value.length > 4096
    || /[\0\r\n]/u.test(value)
  ) {
    invalidProtocol();
  }
  return value;
}

function providerStatus(value) {
  if (typeof value !== "string" || !STATUS_RE.test(value)) invalidProtocol();
  return value;
}

function positiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    invalidProtocol();
  }
  return value;
}

function currencyCode(value) {
  if (typeof value !== "string" || !CURRENCY_RE.test(value)) invalidProtocol();
  return value;
}

function currencyExponent(value) {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > 9
    || Object.is(value, -0)
  ) {
    invalidProtocol();
  }
  return value;
}

function digest(value) {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) invalidProtocol();
  return value;
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || !TIMESTAMP_RE.test(value)) invalidProtocol();
  try {
    if (new Date(value).toISOString() !== value) invalidProtocol();
  } catch {
    invalidProtocol();
  }
  return value;
}

function compiledMoney(currency, currencyExponent) {
  if (currency !== "USD" || currencyExponent !== 2) unverifiedContract();
  return { currency, currencyExponent };
}

function parsedAmountMinor(value, currencyExponent) {
  try {
    return parsePaymentAmountMinor(value, currencyExponent);
  } catch {
    invalidProtocol();
  }
}

function formattedAmountMinor(value, currencyExponent) {
  try {
    return formatPaymentAmountMinor(value, currencyExponent);
  } catch {
    invalidProtocol();
  }
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

function hashRef(prefix, parts) {
  const digestHex = createHash("sha256")
    .update(parts.join("\0"), "utf8")
    .digest("hex");
  return `${prefix}${digestHex}`;
}

function operationResult(
  providerOrderRef,
  status,
  chargeCertainty,
  occurredAt,
  nextAction = null,
) {
  return deepFreeze({
    providerOrderRef,
    status,
    chargeCertainty,
    nextAction,
    occurredAt,
  });
}

function normalizedCreateInput(value) {
  const input = snapshotObject(value, [
    "paymentOrderRef",
    "attemptRef",
    "providerRequestRef",
    "paymentMethod",
    "amountMinor",
    "currency",
    "currencyExponent",
    "expectedPaidCoins",
    "quoteDigest",
    "expiresAt",
    "callbackRouteRef",
    "returnRouteRef",
  ]);
  const currency = currencyCode(input.currency);
  const exponent = currencyExponent(input.currencyExponent);
  if (input.paymentMethod !== "paypal") invalidProtocol();
  const normalized = {
    paymentOrderRef: safeRef(input.paymentOrderRef),
    attemptRef: safeRef(input.attemptRef),
    providerRequestRef: safeRef(input.providerRequestRef),
    paymentMethod: input.paymentMethod,
    amountMinor: positiveSafeInteger(input.amountMinor),
    currency,
    currencyExponent: exponent,
    expectedPaidCoins: positiveSafeInteger(input.expectedPaidCoins),
    quoteDigest: digest(input.quoteDigest),
    expiresAt: canonicalTimestamp(input.expiresAt),
    callbackRouteRef: safeRef(input.callbackRouteRef),
    returnRouteRef: safeRef(input.returnRouteRef, true),
  };
  compiledMoney(currency, exponent);
  return normalized;
}

function normalizedQueryInput(value) {
  const input = snapshotObject(value, [
    "paymentOrderRef",
    "attemptRef",
    "providerOrderRef",
  ]);
  return {
    paymentOrderRef: safeRef(input.paymentOrderRef),
    attemptRef: safeRef(input.attemptRef),
    providerOrderRef: safeRef(input.providerOrderRef),
  };
}

function normalizedCaptureInput(value) {
  const input = snapshotObject(value, [
    "paymentOrderRef",
    "attemptRef",
    "providerOrderRef",
    "captureRequestRef",
    "amountMinor",
    "currency",
    "currencyExponent",
  ]);
  const currency = currencyCode(input.currency);
  const exponent = currencyExponent(input.currencyExponent);
  const normalized = {
    paymentOrderRef: safeRef(input.paymentOrderRef),
    attemptRef: safeRef(input.attemptRef),
    providerOrderRef: safeRef(input.providerOrderRef),
    captureRequestRef: safeRef(input.captureRequestRef),
    amountMinor: positiveSafeInteger(input.amountMinor),
    currency,
    currencyExponent: exponent,
  };
  compiledMoney(currency, exponent);
  return normalized;
}

function normalizedCreateResponse(value) {
  const input = snapshotObject(value, ["id", "status", "links"]);
  const links = snapshotArray(input.links, 16).map((value) => {
    const link = snapshotObject(value, ["rel", "href"]);
    return {
      rel: boundedText(link.rel, 64),
      href: boundedText(link.href, 2048),
    };
  });
  return {
    id: safeRef(input.id),
    status: providerStatus(input.status),
    links,
  };
}

function normalizedCallbackInput(value) {
  const input = snapshotObject(value, [
    "callbackRequestRef",
    "receivedAt",
    "bodyBase64",
    "headerEntries",
  ]);
  const callbackRequestRef = safeRef(input.callbackRequestRef);
  const receivedAt = canonicalTimestamp(input.receivedAt);
  if (
    typeof input.bodyBase64 !== "string"
    || input.bodyBase64.length === 0
    || input.bodyBase64.length % 4 !== 0
  ) {
    invalidProtocol();
  }
  let body;
  try {
    body = Buffer.from(input.bodyBase64, "base64");
  } catch {
    invalidProtocol();
  }
  if (
    body.length < 1
    || body.length > 1_048_576
    || body.toString("base64") !== input.bodyBase64
  ) {
    invalidProtocol();
  }
  let parsed;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    invalidProtocol();
  }
  const webhookEvent = normalizedWebhookEvent(parsed);
  const headerEntries = snapshotArray(input.headerEntries, 64).map((value) => {
    const entry = snapshotObject(value, ["name", "value"]);
    if (
      typeof entry.name !== "string"
      || !HEADER_NAME_RE.test(entry.name)
    ) {
      invalidProtocol();
    }
    return {
      name: entry.name,
      value: headerValue(entry.value),
    };
  });
  const required = {};
  for (const name of REQUIRED_WEBHOOK_HEADERS) {
    const matches = headerEntries.filter((entry) => entry.name === name);
    if (matches.length !== 1 || matches[0].value.length === 0) {
      invalidProtocol();
    }
    required[name] = matches[0].value;
  }
  if (required["paypal-cert-url"] !== ACTION_CERT_URL) invalidProtocol();
  canonicalTimestamp(required["paypal-transmission-time"]);
  safeRef(required["paypal-transmission-id"]);
  return {
    callbackRequestRef,
    receivedAt,
    webhookEvent,
    transmission: {
      authAlgo: required["paypal-auth-algo"],
      certUrl: required["paypal-cert-url"],
      transmissionId: required["paypal-transmission-id"],
      transmissionSig: required["paypal-transmission-sig"],
      transmissionTime: required["paypal-transmission-time"],
    },
  };
}

function normalizedWebhookEvent(value) {
  const event = snapshotObject(value, ["id", "event_type", "resource"]);
  const resource = snapshotObject(event.resource, [
    "id",
    "status",
    "custom_id",
    "supplementary_data",
    "amount",
  ]);
  const supplementary = snapshotObject(
    resource.supplementary_data,
    ["related_ids"],
  );
  const relatedIds = snapshotObject(supplementary.related_ids, ["order_id"]);
  const amount = snapshotObject(resource.amount, ["currency_code", "value"]);
  return {
    id: safeRef(event.id),
    event_type: providerStatus(event.event_type),
    resource: {
      id: safeRef(resource.id),
      status: providerStatus(resource.status),
      custom_id: safeRef(resource.custom_id),
      supplementary_data: {
        related_ids: {
          order_id: safeRef(relatedIds.order_id),
        },
      },
      amount: {
        currency_code: currencyCode(amount.currency_code),
        value: boundedText(amount.value, 64),
      },
    },
  };
}

export function derivePayPalProviderRequestId(value) {
  return publicCall(() => {
    const input = snapshotObject(value, ["operation", "requestRef"]);
    if (!REQUEST_OPERATIONS.has(input.operation)) invalidProtocol();
    const requestRef = safeRef(input.requestRef);
    return hashRef("gcc_", [
      "GCCWEBOS:PAYPAL_REQUEST:v1",
      input.operation,
      requestRef,
    ]);
  });
}

export function encodePayPalCreateOrderRequest(value) {
  return publicCall(() => {
    const input = normalizedCreateInput(value);
    return deepFreeze({
      action: "paypal_orders_create",
      requestId: derivePayPalProviderRequestId({
        operation: "create_recharge_order",
        requestRef: input.providerRequestRef,
      }),
      body: {
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: input.paymentOrderRef,
          amount: {
            currency_code: input.currency,
            value: formattedAmountMinor(
              input.amountMinor,
              input.currencyExponent,
            ),
          },
        }],
      },
    });
  });
}

export function decodePayPalCreateOrderResponse(value) {
  return publicCall(() => {
    const envelope = snapshotObject(value, [
      "createInput",
      "providerResponse",
      "receivedAt",
    ]);
    const createInput = normalizedCreateInput(envelope.createInput);
    const response = normalizedCreateResponse(envelope.providerResponse);
    const receivedAt = canonicalTimestamp(envelope.receivedAt);
    const reviewed = response.links.filter((link) => (
      REVIEWED_ACTION_RELS.has(link.rel)
    ));
    if (
      (response.status === "CREATED"
        || response.status === "PAYER_ACTION_REQUIRED")
      && reviewed.length === 1
    ) {
      return operationResult(
        response.id,
        "entry_ready",
        "possibly_charged",
        receivedAt,
        {
          type: "redirect",
          url: reviewed[0].href,
          expiresAt: createInput.expiresAt,
        },
      );
    }
    if (response.status === "APPROVED" && reviewed.length === 0) {
      return operationResult(
        response.id,
        "pending",
        "possibly_charged",
        receivedAt,
      );
    }
    return operationResult(
      response.id,
      "reconciliation_required",
      "unknown",
      receivedAt,
    );
  });
}

export function encodePayPalQueryOrderRequest(value) {
  return publicCall(() => {
    const input = normalizedQueryInput(value);
    return deepFreeze({
      action: "paypal_orders_query",
      providerOrderRef: input.providerOrderRef,
    });
  });
}

export function decodePayPalQueryOrderResponse(value) {
  return publicCall(() => {
    const envelope = snapshotObject(value, [
      "queryInput",
      "providerResponse",
      "receivedAt",
    ]);
    const queryInput = normalizedQueryInput(envelope.queryInput);
    const response = snapshotObject(envelope.providerResponse, ["id", "status"]);
    const providerOrderRef = safeRef(response.id);
    const status = providerStatus(response.status);
    const receivedAt = canonicalTimestamp(envelope.receivedAt);
    if (providerOrderRef !== queryInput.providerOrderRef) invalidProtocol();
    if (status === "CREATED" || status === "APPROVED") {
      return operationResult(
        providerOrderRef,
        "pending",
        "possibly_charged",
        receivedAt,
      );
    }
    if (status === "COMPLETED") {
      return operationResult(
        providerOrderRef,
        "succeeded",
        "confirmed_charged",
        receivedAt,
      );
    }
    return operationResult(
      providerOrderRef,
      "reconciliation_required",
      "unknown",
      receivedAt,
    );
  });
}

export function encodePayPalCaptureOrderRequest(value) {
  return publicCall(() => {
    const input = normalizedCaptureInput(value);
    return deepFreeze({
      action: "paypal_orders_capture",
      providerOrderRef: input.providerOrderRef,
      requestId: derivePayPalProviderRequestId({
        operation: "capture_payment",
        requestRef: input.captureRequestRef,
      }),
      body: {},
    });
  });
}

export function decodePayPalCaptureOrderResponse(value) {
  return publicCall(() => {
    const envelope = snapshotObject(value, [
      "captureInput",
      "providerResponse",
      "merchantScopeDigest",
      "payloadDigest",
      "receivedAt",
    ]);
    const captureInput = normalizedCaptureInput(envelope.captureInput);
    const merchantScopeDigest = digest(envelope.merchantScopeDigest);
    const payloadDigest = digest(envelope.payloadDigest);
    const receivedAt = canonicalTimestamp(envelope.receivedAt);
    const response = snapshotObject(envelope.providerResponse, [
      "id",
      "status",
      "purchase_units",
    ]);
    const providerOrderRef = safeRef(response.id);
    const status = providerStatus(response.status);
    if (providerOrderRef !== captureInput.providerOrderRef) invalidProtocol();
    const purchaseUnits = snapshotArray(response.purchase_units);
    if (status !== "COMPLETED") {
      if (purchaseUnits.length !== 0) invalidProtocol();
      const pending = status === "APPROVED"
        || status === "PAYER_ACTION_REQUIRED";
      return deepFreeze({
        operationResult: operationResult(
          providerOrderRef,
          pending ? "pending" : "reconciliation_required",
          pending ? "possibly_charged" : "unknown",
          receivedAt,
        ),
        paymentFact: null,
      });
    }
    if (purchaseUnits.length !== 1) invalidProtocol();
    const purchaseUnit = snapshotObject(purchaseUnits[0], [
      "custom_id",
      "payments",
    ]);
    if (safeRef(purchaseUnit.custom_id) !== captureInput.paymentOrderRef) {
      invalidProtocol();
    }
    const payments = snapshotObject(purchaseUnit.payments, ["captures"]);
    const captures = snapshotArray(payments.captures);
    if (captures.length !== 1) invalidProtocol();
    const capture = snapshotObject(captures[0], [
      "id",
      "status",
      "amount",
    ]);
    const providerCaptureRef = safeRef(capture.id);
    if (capture.status !== "COMPLETED") invalidProtocol();
    const amount = snapshotObject(capture.amount, ["currency_code", "value"]);
    if (amount.currency_code !== captureInput.currency) invalidProtocol();
    const amountMinor = parsedAmountMinor(
      amount.value,
      captureInput.currencyExponent,
    );
    if (amountMinor !== captureInput.amountMinor) invalidProtocol();
    const paymentFact = {
      sourceType: "authenticated_capture_response",
      providerEventRef: null,
      eventDedupeKey: hashRef("pp_", [
        "GCCWEBOS:PAYPAL_CAPTURE_EVENT:v1",
        providerOrderRef,
        providerCaptureRef,
      ]),
      eventType: "payment_succeeded",
      paymentOrderRef: captureInput.paymentOrderRef,
      providerOrderRef,
      providerCaptureRef,
      providerRefundRef: null,
      amountMinor,
      currency: captureInput.currency,
      currencyExponent: captureInput.currencyExponent,
      merchantScopeDigest,
      payloadDigest,
      occurredAt: receivedAt,
      verificationResult: "verified",
    };
    return deepFreeze({
      operationResult: operationResult(
        providerOrderRef,
        "succeeded",
        "confirmed_charged",
        receivedAt,
      ),
      paymentFact,
    });
  });
}

export function encodePayPalWebhookVerificationRequest(value) {
  return publicCall(() => {
    const input = normalizedCallbackInput(value);
    return deepFreeze({
      action: "paypal_webhook_verify",
      transmission: input.transmission,
      webhookEvent: input.webhookEvent,
    });
  });
}

export function decodeVerifiedPayPalWebhook(value) {
  return publicCall(() => {
    const envelope = snapshotObject(value, [
      "callbackInput",
      "verificationResponse",
      "merchantScopeDigest",
      "payloadDigest",
    ]);
    const merchantScopeDigest = digest(envelope.merchantScopeDigest);
    const payloadDigest = digest(envelope.payloadDigest);
    const callbackInput = normalizedCallbackInput(envelope.callbackInput);
    const verification = snapshotObject(
      envelope.verificationResponse,
      ["verification_status"],
    );
    if (
      verification.verification_status !== "SUCCESS"
      && verification.verification_status !== "FAILURE"
    ) {
      invalidProtocol();
    }
    if (verification.verification_status !== "SUCCESS") invalidProtocol();
    const event = callbackInput.webhookEvent;
    if (
      event.event_type !== "PAYMENT.CAPTURE.COMPLETED"
      || event.resource.status !== "COMPLETED"
    ) {
      invalidProtocol();
    }
    const currency = event.resource.amount.currency_code;
    const amountMinor = parsedAmountMinor(event.resource.amount.value, 2);
    compiledMoney(currency, 2);
    const providerOrderRef = event.resource.supplementary_data.related_ids.order_id;
    const providerCaptureRef = event.resource.id;
    return deepFreeze({
      sourceType: "callback",
      providerEventRef: event.id,
      eventDedupeKey: hashRef("pp_", [
        "GCCWEBOS:PAYPAL_WEBHOOK_EVENT:v1",
        callbackInput.transmission.transmissionId,
        event.id,
      ]),
      eventType: "payment_succeeded",
      paymentOrderRef: event.resource.custom_id,
      providerOrderRef,
      providerCaptureRef,
      providerRefundRef: null,
      amountMinor,
      currency,
      currencyExponent: 2,
      merchantScopeDigest,
      payloadDigest,
      occurredAt: callbackInput.receivedAt,
      verificationResult: "verified",
    });
  });
}
