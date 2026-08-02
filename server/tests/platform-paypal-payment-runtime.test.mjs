import assert from "node:assert/strict";
import test from "node:test";

import { createPayPalSandboxRuntime } from "../services/platform/paypal-payment-runtime.mjs";

const API_ORIGIN = "https://api-m.sandbox.paypal.com";
const SECRET = "sandbox-secret-marker";
const MERCHANT_DIGEST = "a".repeat(64);

function response(status, body) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  });
}

function createRuntime(fetchFn) {
  return createPayPalSandboxRuntime({
    credential: {
      clientId: "sandbox-client-id",
      clientSecret: SECRET,
      webhookId: "sandbox-webhook-id",
      merchantScopeDigest: MERCHANT_DIGEST,
    },
    fetchFn,
    apiOrigin: API_ORIGIN,
    allowedActionOrigins: ["https://www.sandbox.paypal.com"],
    routeMap: {
      portal_payment_callback_v1: "https://portal.example.com/api/payment/paypal/callback",
      portal_wallet_return_v1: "https://portal.example.com/wallet",
    },
    nowFn: () => "2026-08-01T00:00:00.000Z",
  });
}

async function requestWithCredential(runtime, operation, request) {
  const binding = Object.freeze({
    profileRef: "paypal_sandbox_profile",
    adapterKey: "paypal_v1",
    contractVersion: "v1",
    credentialProfileRef: "paypal_sandbox_credential",
    operation,
  });
  return runtime.credentialLoader.withCredential(binding, (credentialHandle) => (
    runtime.transport.requestFn({ binding, credentialHandle, request })
  ));
}

test("PayPal sandbox runtime exchanges OAuth and creates an idempotent order", async () => {
  const calls = [];
  const runtime = createRuntime(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/v1/oauth2/token")) {
      return response(200, {
        access_token: "sandbox-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    return response(201, {
      id: "paypal_order_1",
      status: "CREATED",
      payer: { email_address: SECRET },
      links: [{
        rel: "approve",
        href: "https://www.sandbox.paypal.com/checkoutnow?token=safe",
      }],
    });
  });
  const result = await requestWithCredential(runtime, "create_recharge_order", {
    action: "paypal_orders_create",
    requestId: "gcc_request_1",
    routeRefs: {
      callbackRouteRef: "portal_payment_callback_v1",
      returnRouteRef: "portal_wallet_return_v1",
    },
    body: {
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: "payment_order_1",
        amount: { currency_code: "USD", value: "1.00" },
      }],
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${API_ORIGIN}/v1/oauth2/token`);
  assert.equal(calls[1].url, `${API_ORIGIN}/v2/checkout/orders`);
  assert.equal(calls[1].init.headers["PayPal-Request-Id"], "gcc_request_1");
  assert.equal(JSON.parse(calls[1].init.body).application_context.return_url,
    "https://portal.example.com/wallet");
  assert.equal(result.response.id, "paypal_order_1");
  assert.equal(Object.hasOwn(result.response, "payer"), false);
  assert.equal(result.evidence, null);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET, "u"));
});

test("PayPal runtime captures and verifies webhooks with bounded safe evidence", async () => {
  const requests = [];
  const runtime = createRuntime(async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith("/v1/oauth2/token")) {
      return response(200, {
        access_token: "sandbox-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    if (url.endsWith("/capture")) {
      return response(201, { id: "paypal_order_1", status: "COMPLETED", purchase_units: [] });
    }
    return response(200, { verification_status: "SUCCESS" });
  });
  const capture = await requestWithCredential(runtime, "capture_payment", {
    action: "paypal_orders_capture",
    providerOrderRef: "paypal_order_1",
    requestId: "gcc_capture_1",
    body: {},
  });
  assert.equal(capture.evidence.merchantScopeDigest, MERCHANT_DIGEST);
  assert.match(capture.evidence.payloadDigest, /^[a-f0-9]{64}$/u);
  const verified = await requestWithCredential(runtime, "verify_callback", {
    action: "paypal_webhook_verify",
    transmission: {
      authAlgo: "SHA256withRSA",
      certUrl: "https://api.paypal.com/v1/notifications/certs/CERT-safe",
      transmissionId: "transmission_1",
      transmissionSig: "signature_1",
      transmissionTime: "2026-08-01T00:00:00.000Z",
    },
    webhookEvent: { id: "event_1" },
  });
  const verificationBody = JSON.parse(requests.at(-1).init.body);
  assert.equal(verificationBody.webhook_id, "sandbox-webhook-id");
  assert.equal(verified.response.verification_status, "SUCCESS");
  assert.match(verified.evidence.payloadDigest, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify({ capture, verified }), new RegExp(SECRET, "u"));
});

test("PayPal runtime queries without mutation and fails closed on oversized provider JSON", async () => {
  let mode = "query";
  const runtime = createRuntime(async (url) => {
    if (url.endsWith("/v1/oauth2/token")) {
      return response(200, {
        access_token: "sandbox-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    if (mode === "query") {
      return response(200, {
        id: "paypal_order_1",
        status: "APPROVED",
        payer: { private_marker: SECRET },
      });
    }
    return Object.freeze({
      status: 200,
      async text() {
        return `{"oversized":"${"x".repeat(1_048_576)}"}`;
      },
    });
  });
  const queried = await requestWithCredential(runtime, "query_payment", {
    action: "paypal_orders_query",
    providerOrderRef: "paypal_order_1",
  });
  assert.deepEqual(queried, {
    response: { id: "paypal_order_1", status: "APPROVED" },
    evidence: null,
  });
  mode = "oversized";
  await assert.rejects(
    () => requestWithCredential(runtime, "query_payment", {
      action: "paypal_orders_query",
      providerOrderRef: "paypal_order_1",
    }),
    (error) => {
      assert.equal(error.message, "paypal_transport_failed");
      assert.doesNotMatch(JSON.stringify(error), new RegExp(SECRET, "u"));
      return true;
    },
  );
  assert.throws(
    () => runtime.credentialLoader.withCredential({
      adapterKey: "xsd_v1",
      contractVersion: "v1",
    }, () => undefined),
    /paypal_transport_failed/u,
  );
});
