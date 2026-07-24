import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createCredentialScopedPaymentExecution,
  normalizePaymentOperationResult,
  normalizeVerifiedPaymentEvent,
} from "../services/platform/payment-provider-adapter-contract.mjs";
import {
  decodePayPalCaptureOrderResponse,
  decodePayPalCreateOrderResponse,
  decodePayPalQueryOrderResponse,
  decodeVerifiedPayPalWebhook,
  derivePayPalProviderRequestId,
  encodePayPalCaptureOrderRequest,
  encodePayPalCreateOrderRequest,
  encodePayPalQueryOrderRequest,
  encodePayPalWebhookVerificationRequest,
} from "../services/platform/paypal-payment-protocol-codec.mjs";

const ACTION_ORIGIN = "https://payer-action.synthetic.invalid";
const ACTION_URL = `${ACTION_ORIGIN}/checkout/order-1`;
const CERT_URL = "https://cert.synthetic.invalid/paypal.pem";
const RECEIVED_AT = "2026-07-24T12:34:56.000Z";
const EXPIRES_AT = "2026-07-24T12:49:56.000Z";
const MERCHANT_SCOPE_DIGEST = "a".repeat(64);
const PAYLOAD_DIGEST = "b".repeat(64);

const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "pay_order_1",
  attemptRef: "attempt_1",
  providerRequestRef: "provider_request_1",
  paymentMethod: "paypal",
  amountMinor: 1234,
  currency: "USD",
  currencyExponent: 2,
  expectedPaidCoins: 10,
  quoteDigest: "c".repeat(64),
  expiresAt: EXPIRES_AT,
  callbackRouteRef: "callback_route_1",
  returnRouteRef: "return_route_1",
});

const QUERY_INPUT = Object.freeze({
  paymentOrderRef: "pay_order_1",
  attemptRef: "attempt_1",
  providerOrderRef: "provider_order_1",
});

const CAPTURE_INPUT = Object.freeze({
  paymentOrderRef: "pay_order_1",
  attemptRef: "attempt_1",
  providerOrderRef: "provider_order_1",
  captureRequestRef: "capture_request_1",
  amountMinor: 1234,
  currency: "USD",
  currencyExponent: 2,
});

function protocolError(message = "invalid_paypal_protocol") {
  return (error) => {
    assert.equal(error?.constructor, TypeError);
    assert.equal(error?.message, message);
    assert.deepEqual(Object.keys(error), []);
    return true;
  };
}

function assertProxyRejectedWithoutTraps(invoke, validInput) {
  const counters = {
    get: 0,
    ownKeys: 0,
    descriptor: 0,
    getPrototypeOf: 0,
  };
  const proxy = new Proxy(validInput, {
    get(target, key, receiver) {
      counters.get += 1;
      return Reflect.get(target, key, receiver);
    },
    ownKeys(target) {
      counters.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      counters.descriptor += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    getPrototypeOf(target) {
      counters.getPrototypeOf += 1;
      return Reflect.getPrototypeOf(target);
    },
  });
  assert.throws(() => invoke(proxy), protocolError());
  assert.deepEqual(counters, {
    get: 0,
    ownKeys: 0,
    descriptor: 0,
    getPrototypeOf: 0,
  });
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function createResponse({
  status = "CREATED",
  links = [{ rel: "approve", href: ACTION_URL }],
  id = "provider_order_1",
} = {}) {
  return { id, status, links };
}

function completedCaptureResponse({
  orderId = CAPTURE_INPUT.providerOrderRef,
  customId = CAPTURE_INPUT.paymentOrderRef,
  captureId = "provider_capture_1",
  currency = CAPTURE_INPUT.currency,
  value = "12.34",
} = {}) {
  return {
    id: orderId,
    status: "COMPLETED",
    purchase_units: [{
      custom_id: customId,
      payments: {
        captures: [{
          id: captureId,
          status: "COMPLETED",
          amount: {
            currency_code: currency,
            value,
          },
        }],
      },
    }],
  };
}

function completedWebhookEvent({
  eventId = "provider_event_1",
  eventType = "PAYMENT.CAPTURE.COMPLETED",
  captureId = "provider_capture_1",
  captureStatus = "COMPLETED",
  paymentOrderRef = CAPTURE_INPUT.paymentOrderRef,
  providerOrderRef = CAPTURE_INPUT.providerOrderRef,
  currency = CAPTURE_INPUT.currency,
  value = "12.34",
} = {}) {
  return {
    id: eventId,
    event_type: eventType,
    resource: {
      id: captureId,
      status: captureStatus,
      custom_id: paymentOrderRef,
      supplementary_data: {
        related_ids: {
          order_id: providerOrderRef,
        },
      },
      amount: {
        currency_code: currency,
        value,
      },
    },
  };
}

function callbackInput(event = completedWebhookEvent(), headerEntries) {
  return {
    callbackRequestRef: "callback_request_1",
    receivedAt: RECEIVED_AT,
    bodyBase64: Buffer.from(JSON.stringify(event), "utf8").toString("base64"),
    headerEntries: headerEntries ?? [
      { name: "paypal-auth-algo", value: "SHA256withRSA" },
      { name: "paypal-cert-url", value: CERT_URL },
      { name: "paypal-transmission-id", value: "transmission_1" },
      { name: "paypal-transmission-sig", value: "signature_1" },
      { name: "paypal-transmission-time", value: RECEIVED_AT },
      { name: "x-synthetic-ignored", value: "ignored" },
    ],
  };
}

function captureDecodeInput(overrides = {}) {
  return {
    captureInput: CAPTURE_INPUT,
    providerResponse: completedCaptureResponse(),
    merchantScopeDigest: MERCHANT_SCOPE_DIGEST,
    payloadDigest: PAYLOAD_DIGEST,
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

function webhookDecodeInput(callback = callbackInput(), overrides = {}) {
  return {
    callbackInput: callback,
    verificationResponse: { verification_status: "SUCCESS" },
    merchantScopeDigest: MERCHANT_SCOPE_DIGEST,
    payloadDigest: PAYLOAD_DIGEST,
    ...overrides,
  };
}

function expectedDedupe(prefix, parts) {
  return `${prefix}${createHash("sha256").update(parts.join("\0"), "utf8").digest("hex")}`;
}

test("PayPal create codec emits a detached descriptor and maps an allowlisted payer action", () => {
  const descriptor = encodePayPalCreateOrderRequest(CREATE_INPUT);
  assert.deepEqual(descriptor, {
    action: "paypal_orders_create",
    requestId: derivePayPalProviderRequestId({
      operation: "create_recharge_order",
      requestRef: CREATE_INPUT.providerRequestRef,
    }),
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: CREATE_INPUT.paymentOrderRef,
        amount: {
          currency_code: "USD",
          value: "12.34",
        },
      }],
    },
  });
  assertDeepFrozen(descriptor);

  const raw = decodePayPalCreateOrderResponse({
    createInput: CREATE_INPUT,
    providerResponse: createResponse(),
    receivedAt: RECEIVED_AT,
  });
  assert.deepEqual(raw, {
    providerOrderRef: "provider_order_1",
    status: "entry_ready",
    chargeCertainty: "possibly_charged",
    nextAction: {
      type: "redirect",
      url: ACTION_URL,
      expiresAt: EXPIRES_AT,
    },
    occurredAt: RECEIVED_AT,
  });
  assert.deepEqual(
    normalizePaymentOperationResult(raw, {
      allowedActionOrigins: [ACTION_ORIGIN],
    }),
    raw,
  );
  assertDeepFrozen(raw);

  for (const malformed of [
    { ...CREATE_INPUT, currency: "EUR", paymentMethod: "card" },
    { ...CREATE_INPUT, currency: "EUR", quoteDigest: "not-a-digest" },
  ]) {
    assert.throws(
      () => encodePayPalCreateOrderRequest(malformed),
      protocolError(),
    );
  }
  assert.throws(
    () => encodePayPalCreateOrderRequest({ ...CREATE_INPUT, currency: "EUR" }),
    protocolError("provider_contract_unverified"),
  );
});

test("PayPal request ids are stable and domain-separated for create and capture", () => {
  const requestRef = "same_request_ref";
  const createId = derivePayPalProviderRequestId({
    operation: "create_recharge_order",
    requestRef,
  });
  const captureId = derivePayPalProviderRequestId({
    operation: "capture_payment",
    requestRef,
  });
  assert.equal(
    createId,
    expectedDedupe("gcc_", [
      "GCCWEBOS:PAYPAL_REQUEST:v1",
      "create_recharge_order",
      requestRef,
    ]),
  );
  assert.equal(
    createId,
    derivePayPalProviderRequestId({
      operation: "create_recharge_order",
      requestRef,
    }),
  );
  assert.notEqual(createId, captureId);
  assert.match(createId, /^gcc_[a-f0-9]{64}$/u);
});

test("PayPal create recognizes approve and payer-action relations", () => {
  for (const rel of ["approve", "payer-action"]) {
    const raw = decodePayPalCreateOrderResponse({
      createInput: CREATE_INPUT,
      providerResponse: createResponse({
        status: rel === "approve" ? "CREATED" : "PAYER_ACTION_REQUIRED",
        links: [{ rel: "self", href: `${ACTION_ORIGIN}/orders/1` }, { rel, href: ACTION_URL }],
      }),
      receivedAt: RECEIVED_AT,
    });
    assert.equal(raw.status, "entry_ready");
    assert.equal(raw.nextAction.url, ACTION_URL);
  }

  const approved = decodePayPalCreateOrderResponse({
    createInput: CREATE_INPUT,
    providerResponse: createResponse({ status: "APPROVED", links: [] }),
    receivedAt: RECEIVED_AT,
  });
  assert.equal(approved.status, "pending");
  assert.equal(approved.nextAction, null);
});

test("PayPal create treats duplicate or simultaneous reviewed action links as ambiguous", () => {
  for (const links of [
    [
      { rel: "approve", href: ACTION_URL },
      { rel: "approve", href: `${ACTION_ORIGIN}/checkout/order-2` },
    ],
    [
      { rel: "approve", href: ACTION_URL },
      { rel: "payer-action", href: `${ACTION_ORIGIN}/checkout/order-2` },
    ],
  ]) {
    const raw = decodePayPalCreateOrderResponse({
      createInput: CREATE_INPUT,
      providerResponse: createResponse({ links }),
      receivedAt: RECEIVED_AT,
    });
    assert.deepEqual(raw, {
      providerOrderRef: "provider_order_1",
      status: "reconciliation_required",
      chargeCertainty: "unknown",
      nextAction: null,
      occurredAt: RECEIVED_AT,
    });
  }

  assert.throws(
    () => decodePayPalCreateOrderResponse({
      createInput: CREATE_INPUT,
      providerResponse: createResponse({
        links: Array.from({ length: 17 }, (_value, index) => ({
          rel: "self",
          href: `${ACTION_ORIGIN}/orders/${index}`,
        })),
      }),
      receivedAt: RECEIVED_AT,
    }),
    protocolError(),
  );
  assert.throws(
    () => decodePayPalCreateOrderResponse({
      createInput: CREATE_INPUT,
      providerResponse: createResponse({ links: new Array(1) }),
      receivedAt: RECEIVED_AT,
    }),
    protocolError(),
  );
  assert.throws(
    () => decodePayPalCreateOrderResponse({
      createInput: CREATE_INPUT,
      providerResponse: createResponse({
        links: [{ rel: "approve", href: ACTION_URL, extra: true }],
      }),
      receivedAt: RECEIVED_AT,
    }),
    protocolError(),
  );
  let nestedAccessorCalls = 0;
  const hostileLink = { rel: "approve", href: ACTION_URL };
  Object.defineProperty(hostileLink, "href", {
    enumerable: true,
    get() {
      nestedAccessorCalls += 1;
      throw new Error("hostile nested accessor");
    },
  });
  assert.throws(
    () => decodePayPalCreateOrderResponse({
      createInput: CREATE_INPUT,
      providerResponse: createResponse({ links: [hostileLink] }),
      receivedAt: RECEIVED_AT,
    }),
    protocolError(),
  );
  assert.equal(nestedAccessorCalls, 0);
});

test("PayPal Core rejects a decoded action outside the compiled redirect origin", () => {
  const raw = decodePayPalCreateOrderResponse({
    createInput: CREATE_INPUT,
    providerResponse: createResponse({
      links: [{ rel: "approve", href: "https://outside.synthetic.invalid/checkout" }],
    }),
    receivedAt: RECEIVED_AT,
  });
  assert.throws(
    () => normalizePaymentOperationResult(raw, {
      allowedActionOrigins: [ACTION_ORIGIN],
    }),
    /invalid_payment_operation_result/u,
  );
});

test("PayPal query codec is read-only and never emits or invokes capture", () => {
  const descriptor = encodePayPalQueryOrderRequest(QUERY_INPUT);
  assert.deepEqual(descriptor, {
    action: "paypal_orders_query",
    providerOrderRef: QUERY_INPUT.providerOrderRef,
  });
  assert.equal("requestId" in descriptor, false);
  assert.equal("body" in descriptor, false);
  assert.equal(JSON.stringify(descriptor).includes("capture"), false);

  for (const [status, expected] of [
    ["CREATED", ["pending", "possibly_charged"]],
    ["APPROVED", ["pending", "possibly_charged"]],
    ["COMPLETED", ["succeeded", "confirmed_charged"]],
    ["VOIDED", ["reconciliation_required", "unknown"]],
  ]) {
    const raw = decodePayPalQueryOrderResponse({
      queryInput: QUERY_INPUT,
      providerResponse: { id: QUERY_INPUT.providerOrderRef, status },
      receivedAt: RECEIVED_AT,
    });
    assert.equal(raw.status, expected[0]);
    assert.equal(raw.chargeCertainty, expected[1]);
    assert.equal(raw.nextAction, null);
    assert.deepEqual(Object.keys(raw), [
      "providerOrderRef",
      "status",
      "chargeCertainty",
      "nextAction",
      "occurredAt",
    ]);
  }
});

test("PayPal capture codec returns a matching raw authenticated-capture fact", async () => {
  const descriptor = encodePayPalCaptureOrderRequest(CAPTURE_INPUT);
  assert.deepEqual(descriptor, {
    action: "paypal_orders_capture",
    providerOrderRef: CAPTURE_INPUT.providerOrderRef,
    requestId: derivePayPalProviderRequestId({
      operation: "capture_payment",
      requestRef: CAPTURE_INPUT.captureRequestRef,
    }),
    body: {},
  });

  const raw = decodePayPalCaptureOrderResponse(captureDecodeInput());
  assert.deepEqual(raw, {
    operationResult: {
      providerOrderRef: CAPTURE_INPUT.providerOrderRef,
      status: "succeeded",
      chargeCertainty: "confirmed_charged",
      nextAction: null,
      occurredAt: RECEIVED_AT,
    },
    paymentFact: {
      sourceType: "authenticated_capture_response",
      providerEventRef: null,
      eventDedupeKey: expectedDedupe("pp_", [
        "GCCWEBOS:PAYPAL_CAPTURE_EVENT:v1",
        CAPTURE_INPUT.providerOrderRef,
        "provider_capture_1",
      ]),
      eventType: "payment_succeeded",
      paymentOrderRef: CAPTURE_INPUT.paymentOrderRef,
      providerOrderRef: CAPTURE_INPUT.providerOrderRef,
      providerCaptureRef: "provider_capture_1",
      providerRefundRef: null,
      amountMinor: CAPTURE_INPUT.amountMinor,
      currency: "USD",
      currencyExponent: 2,
      merchantScopeDigest: MERCHANT_SCOPE_DIGEST,
      payloadDigest: PAYLOAD_DIGEST,
      occurredAt: RECEIVED_AT,
      verificationResult: "verified",
    },
  });
  assertDeepFrozen(raw);
  assert.throws(() => normalizeVerifiedPaymentEvent(raw.paymentFact), /invalid_verified_payment_event/u);

  let requestCount = 0;
  let loaderCount = 0;
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (..._args) => {
    fetchCount += 1;
    throw new Error("global fetch must not run");
  };
  try {
    const execution = createCredentialScopedPaymentExecution({
      profileRef: "paypal_test_profile",
      adapterKey: "paypal_v1",
      contractVersion: "v1",
      credentialProfileRef: "paypal_synthetic_credential",
      credentialLoader: {
        withCredential(_binding, callback) {
          loaderCount += 1;
          return callback("opaque_synthetic_credential");
        },
      },
      requestFn({ binding, credentialHandle, request }) {
        requestCount += 1;
        assert.equal(binding.adapterKey, "paypal_v1");
        assert.equal(credentialHandle, "opaque_synthetic_credential");
        assert.deepEqual(request, descriptor);
        return {
          response: completedCaptureResponse(),
          evidence: {
            merchantScopeDigest: MERCHANT_SCOPE_DIGEST,
            payloadDigest: PAYLOAD_DIGEST,
          },
        };
      },
      allowedActionOrigins: [ACTION_ORIGIN],
    });
    const branded = await execution.withCredential(
      "capture_payment",
      async ({ request }) => {
        const transportResult = await request(descriptor);
        const captureOutcome = decodePayPalCaptureOrderResponse({
          captureInput: CAPTURE_INPUT,
          providerResponse: transportResult.response,
          merchantScopeDigest: transportResult.evidence.merchantScopeDigest,
          payloadDigest: transportResult.evidence.payloadDigest,
          receivedAt: RECEIVED_AT,
        });
        return {
          transportReceipt: transportResult.transportReceipt,
          captureOutcome,
        };
      },
    );
    assert.equal(normalizeVerifiedPaymentEvent(branded.paymentFact), branded.paymentFact);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(loaderCount, 1);
  assert.equal(requestCount, 1);
  assert.equal(fetchCount, 0);
});

test("PayPal capture rejects mismatched order amount currency exponent and missing capture reference", () => {
  for (const providerResponse of [
    completedCaptureResponse({ orderId: "provider_order_other" }),
    completedCaptureResponse({ customId: "pay_order_other" }),
    completedCaptureResponse({ value: "12.35" }),
    completedCaptureResponse({ currency: "EUR" }),
    completedCaptureResponse({ captureId: "" }),
  ]) {
    assert.throws(
      () => decodePayPalCaptureOrderResponse(captureDecodeInput({ providerResponse })),
      protocolError(),
    );
  }
  assert.throws(
    () => encodePayPalCaptureOrderRequest({ ...CAPTURE_INPUT, currencyExponent: 3 }),
    protocolError("provider_contract_unverified"),
  );
  for (const malformed of [
    { ...CAPTURE_INPUT, currency: "usd" },
    { ...CAPTURE_INPUT, currencyExponent: "2" },
    { ...CAPTURE_INPUT, currencyExponent: 10 },
  ]) {
    assert.throws(
      () => encodePayPalCaptureOrderRequest(malformed),
      protocolError(),
    );
  }
  assert.throws(
    () => encodePayPalCaptureOrderRequest({ ...CAPTURE_INPUT, currency: "EUR" }),
    protocolError("provider_contract_unverified"),
  );
  for (const malformed of [
    { ...CAPTURE_INPUT, currency: "EUR", amountMinor: 0 },
    { ...CAPTURE_INPUT, currency: "EUR", captureRequestRef: "bad ref" },
  ]) {
    assert.throws(
      () => encodePayPalCaptureOrderRequest(malformed),
      protocolError(),
    );
  }

  const duplicatePurchaseUnit = completedCaptureResponse();
  duplicatePurchaseUnit.purchase_units.push(
    structuredClone(duplicatePurchaseUnit.purchase_units[0]),
  );
  assert.throws(
    () => decodePayPalCaptureOrderResponse(captureDecodeInput({
      providerResponse: duplicatePurchaseUnit,
    })),
    protocolError(),
  );
  const duplicateCapture = completedCaptureResponse();
  duplicateCapture.purchase_units[0].payments.captures.push(
    structuredClone(
      duplicateCapture.purchase_units[0].payments.captures[0],
    ),
  );
  assert.throws(
    () => decodePayPalCaptureOrderResponse(captureDecodeInput({
      providerResponse: duplicateCapture,
    })),
    protocolError(),
  );
  const extraAmountField = completedCaptureResponse();
  extraAmountField.purchase_units[0].payments.captures[0].amount.extra = true;
  assert.throws(
    () => decodePayPalCaptureOrderResponse(captureDecodeInput({
      providerResponse: extraAmountField,
    })),
    protocolError(),
  );
  let amountAccessorCalls = 0;
  const accessorAmount = completedCaptureResponse();
  Object.defineProperty(
    accessorAmount.purchase_units[0].payments.captures[0].amount,
    "value",
    {
      enumerable: true,
      get() {
        amountAccessorCalls += 1;
        throw new Error("hostile amount accessor");
      },
    },
  );
  assert.throws(
    () => decodePayPalCaptureOrderResponse(captureDecodeInput({
      providerResponse: accessorAmount,
    })),
    protocolError(),
  );
  assert.equal(amountAccessorCalls, 0);
});

test("PayPal non-success capture outcomes carry a null payment fact", () => {
  for (const [status, expectedStatus, certainty] of [
    ["APPROVED", "pending", "possibly_charged"],
    ["PAYER_ACTION_REQUIRED", "pending", "possibly_charged"],
    ["VOIDED", "reconciliation_required", "unknown"],
  ]) {
    const raw = decodePayPalCaptureOrderResponse(captureDecodeInput({
      providerResponse: {
        id: CAPTURE_INPUT.providerOrderRef,
        status,
        purchase_units: [],
      },
    }));
    assert.deepEqual(raw, {
      operationResult: {
        providerOrderRef: CAPTURE_INPUT.providerOrderRef,
        status: expectedStatus,
        chargeCertainty: certainty,
        nextAction: null,
        occurredAt: RECEIVED_AT,
      },
      paymentFact: null,
    });
  }
});

test("PayPal callback codec mints a raw fact only after injected verification succeeds", async () => {
  const input = callbackInput();
  const descriptor = encodePayPalWebhookVerificationRequest(input);
  assert.deepEqual(descriptor, {
    action: "paypal_webhook_verify",
    transmission: {
      authAlgo: "SHA256withRSA",
      certUrl: CERT_URL,
      transmissionId: "transmission_1",
      transmissionSig: "signature_1",
      transmissionTime: RECEIVED_AT,
    },
    webhookEvent: completedWebhookEvent(),
  });
  assertDeepFrozen(descriptor);

  let requestCount = 0;
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (..._args) => {
    fetchCount += 1;
    throw new Error("global fetch must not run");
  };
  try {
    const execution = createCredentialScopedPaymentExecution({
      profileRef: "paypal_test_profile",
      adapterKey: "paypal_v1",
      contractVersion: "v1",
      credentialProfileRef: "paypal_synthetic_credential",
      credentialLoader: {
        withCredential(_binding, callback) {
          return callback("opaque_synthetic_credential");
        },
      },
      requestFn({ request }) {
        requestCount += 1;
        assert.deepEqual(request, descriptor);
        return {
          response: { verification_status: "SUCCESS" },
          evidence: {
            merchantScopeDigest: MERCHANT_SCOPE_DIGEST,
            payloadDigest: PAYLOAD_DIGEST,
          },
        };
      },
      allowedActionOrigins: [ACTION_ORIGIN],
    });
    const branded = await execution.withCredential(
      "verify_callback",
      async ({ request }) => {
        const transportResult = await request(descriptor);
        const paymentFact = decodeVerifiedPayPalWebhook({
          callbackInput: input,
          verificationResponse: transportResult.response,
          merchantScopeDigest: transportResult.evidence.merchantScopeDigest,
          payloadDigest: transportResult.evidence.payloadDigest,
        });
        assert.throws(
          () => normalizeVerifiedPaymentEvent(paymentFact),
          /invalid_verified_payment_event/u,
        );
        return {
          transportReceipt: transportResult.transportReceipt,
          paymentFact,
        };
      },
    );
    assert.equal(normalizeVerifiedPaymentEvent(branded), branded);
    assert.equal(branded.sourceType, "callback");
    assert.equal(branded.occurredAt, RECEIVED_AT);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestCount, 1);
  assert.equal(fetchCount, 0);
});

test("PayPal callback rejects FAILURE unsupported malformed ambiguous and mismatched events with one safe error", () => {
  const valid = callbackInput();
  const cases = [
    webhookDecodeInput(valid, {
      verificationResponse: { verification_status: "FAILURE" },
    }),
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      eventType: "PAYMENT.CAPTURE.DENIED",
    }))),
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      captureStatus: "PENDING",
    }))),
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      value: "12.340",
    }))),
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      providerOrderRef: "order ref with spaces",
    }))),
  ];
  for (const value of cases) {
    assert.throws(() => decodeVerifiedPayPalWebhook(value), protocolError());
  }

  const malformedEvent = completedWebhookEvent();
  malformedEvent.extra = "ambiguous";
  assert.throws(
    () => encodePayPalWebhookVerificationRequest(callbackInput(malformedEvent)),
    protocolError(),
  );
  assert.throws(
    () => decodeVerifiedPayPalWebhook(webhookDecodeInput(callbackInput(
      completedWebhookEvent({ currency: "usd" }),
    ))),
    protocolError(),
  );
  assert.throws(
    () => decodeVerifiedPayPalWebhook(webhookDecodeInput(callbackInput(
      completedWebhookEvent({ currency: "EUR" }),
    ))),
    protocolError("provider_contract_unverified"),
  );
  for (const malformed of [
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      currency: "EUR",
      value: "malformed",
    }))),
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      currency: "EUR",
    })), {
      merchantScopeDigest: "not-a-digest",
    }),
    webhookDecodeInput(callbackInput(completedWebhookEvent({
      currency: "EUR",
      providerOrderRef: "bad ref",
    }))),
  ]) {
    assert.throws(
      () => decodeVerifiedPayPalWebhook(malformed),
      protocolError(),
    );
  }
});

test("PayPal callback requires each verification header exactly once and rejects duplicates", () => {
  const required = callbackInput().headerEntries.slice(0, 5);
  const withHeaders = (headerEntries) => callbackInput(
    completedWebhookEvent(),
    headerEntries,
  );
  for (let index = 0; index < required.length; index += 1) {
    assert.throws(
      () => encodePayPalWebhookVerificationRequest(withHeaders(
        required.filter((_entry, entryIndex) => entryIndex !== index),
      )),
      protocolError(),
    );
    assert.throws(
      () => encodePayPalWebhookVerificationRequest(withHeaders([
        ...required,
        { ...required[index] },
      ])),
      protocolError(),
    );
    assert.throws(
      () => encodePayPalWebhookVerificationRequest(withHeaders(
        required.map((entry, entryIndex) => (
          entryIndex === index ? { ...entry, value: "" } : entry
        )),
      )),
      protocolError(),
    );
  }
  assert.throws(
    () => encodePayPalWebhookVerificationRequest(withHeaders(
      required.map((entry) => (
        entry.name === "paypal-cert-url"
          ? { ...entry, value: "https://cert.other.invalid/paypal.pem" }
          : entry
      )),
    )),
    protocolError(),
  );
  assert.doesNotThrow(() => encodePayPalWebhookVerificationRequest(withHeaders([
    ...required,
    { name: "x-synthetic-ignored", value: "" },
  ])));
});

test("PayPal raw decoded facts have no Provider Core provenance", () => {
  const captureFact = decodePayPalCaptureOrderResponse(captureDecodeInput()).paymentFact;
  const callbackFact = decodeVerifiedPayPalWebhook(webhookDecodeInput());
  assert.deepEqual(Object.keys(captureFact), [
    "sourceType",
    "providerEventRef",
    "eventDedupeKey",
    "eventType",
    "paymentOrderRef",
    "providerOrderRef",
    "providerCaptureRef",
    "providerRefundRef",
    "amountMinor",
    "currency",
    "currencyExponent",
    "merchantScopeDigest",
    "payloadDigest",
    "occurredAt",
    "verificationResult",
  ]);
  assert.deepEqual(Object.keys(callbackFact), Object.keys(captureFact));
  assert.deepEqual(Object.getOwnPropertySymbols(captureFact), []);
  assert.deepEqual(Object.getOwnPropertySymbols(callbackFact), []);
  assert.throws(() => normalizeVerifiedPaymentEvent(captureFact), /invalid_verified_payment_event/u);
  assert.throws(() => normalizeVerifiedPaymentEvent(callbackFact), /invalid_verified_payment_event/u);
});

test("PayPal decoders reject missing extra accessor Proxy and digest envelope fields", () => {
  const decoderCases = [
    [
      decodePayPalCreateOrderResponse,
      {
        createInput: CREATE_INPUT,
        providerResponse: createResponse(),
        receivedAt: RECEIVED_AT,
      },
    ],
    [
      decodePayPalQueryOrderResponse,
      {
        queryInput: QUERY_INPUT,
        providerResponse: { id: QUERY_INPUT.providerOrderRef, status: "APPROVED" },
        receivedAt: RECEIVED_AT,
      },
    ],
    [decodePayPalCaptureOrderResponse, captureDecodeInput()],
    [decodeVerifiedPayPalWebhook, webhookDecodeInput()],
  ];
  for (const [decode, valid] of decoderCases) {
    const [firstKey] = Object.keys(valid);
    const missing = { ...valid };
    delete missing[firstKey];
    assert.throws(() => decode(missing), protocolError());
    assert.throws(() => decode({ ...valid, extra: true }), protocolError());

    let accessorCalls = 0;
    const accessor = { ...valid };
    Object.defineProperty(accessor, firstKey, {
      enumerable: true,
      get() {
        accessorCalls += 1;
        throw new Error("hostile accessor");
      },
    });
    assert.throws(() => decode(accessor), protocolError());
    assert.equal(accessorCalls, 0);

  }

  for (const [invoke, valid] of [
    [
      derivePayPalProviderRequestId,
      { operation: "create_recharge_order", requestRef: "request_1" },
    ],
    [encodePayPalCreateOrderRequest, CREATE_INPUT],
    [
      decodePayPalCreateOrderResponse,
      {
        createInput: CREATE_INPUT,
        providerResponse: createResponse(),
        receivedAt: RECEIVED_AT,
      },
    ],
    [encodePayPalQueryOrderRequest, QUERY_INPUT],
    [
      decodePayPalQueryOrderResponse,
      {
        queryInput: QUERY_INPUT,
        providerResponse: { id: QUERY_INPUT.providerOrderRef, status: "APPROVED" },
        receivedAt: RECEIVED_AT,
      },
    ],
    [encodePayPalCaptureOrderRequest, CAPTURE_INPUT],
    [decodePayPalCaptureOrderResponse, captureDecodeInput()],
    [encodePayPalWebhookVerificationRequest, callbackInput()],
    [decodeVerifiedPayPalWebhook, webhookDecodeInput()],
  ]) {
    assertProxyRejectedWithoutTraps(invoke, valid);
  }

  for (const key of ["merchantScopeDigest", "payloadDigest"]) {
    const missingCapture = captureDecodeInput();
    delete missingCapture[key];
    assert.throws(
      () => decodePayPalCaptureOrderResponse(missingCapture),
      protocolError(),
    );
    const missingWebhook = webhookDecodeInput();
    delete missingWebhook[key];
    assert.throws(
      () => decodeVerifiedPayPalWebhook(missingWebhook),
      protocolError(),
    );
  }
});

test("PayPal protocol module has no credential network environment Store route or wallet seam", async () => {
  const codecSource = await readFile(
    new URL("../services/platform/paypal-payment-protocol-codec.mjs", import.meta.url),
    "utf8",
  );
  const adapterSource = await readFile(
    new URL("../services/platform/paypal-payment-adapter.mjs", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    [...codecSource.matchAll(/^import .* from "([^"]+)";$/gmu)].map((match) => match[1]),
    ["node:crypto", "node:util", "./payment-money-codec.mjs"],
  );
  assert.doesNotMatch(
    codecSource,
    /api-m\.paypal|paypal\.com\/v2|client[_-]?secret|oauth|process\.env|globalThis\.fetch|fetch\s*\(|node:https|node:http|createConnection|paymentStore|walletStore|Date\.now\s*\(|new Date\s*\(\s*\)/iu,
  );
  assert.doesNotMatch(adapterSource, /paypal-payment-protocol-codec/u);
  assert.match(adapterSource, /createUnverifiedPaymentAdapter/u);
  assert.match(adapterSource, /adapterKey:\s*"paypal_v1"/u);
});
