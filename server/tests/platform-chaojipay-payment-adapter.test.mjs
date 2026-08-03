import assert from "node:assert/strict";
import test from "node:test";

import { assertPaymentProviderAdapterContract, createCredentialScopedPaymentExecution } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createChaoJiPayPaymentAdapter } from "../services/platform/chaojipay-payment-adapter.mjs";

const NOW = "2026-08-02T00:00:00.000Z";
const ACTION_ORIGIN = "https://checkout.example.test";
const CAPABILITIES = Object.freeze({
  createRechargeOrder: true, queryPayment: false, capturePayment: false, verifyCallback: true,
  refund: false, reconcile: false, repeatCreateIdempotent: false, repeatCaptureIdempotent: false,
});
const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1",
  paymentMethod: "wechat_pay", amountMinor: 1200, currency: "CNY", currencyExponent: 2,
  expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z",
  callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1",
});

function executionScope(actionOrigin = ACTION_ORIGIN) {
  return createCredentialScopedPaymentExecution({
    profileRef: "chaojipay_profile", adapterKey: "chaojipay_v1", contractVersion: "v1",
    credentialProfileRef: "chaojipay_credential",
    credentialLoader: { withCredential(_binding, callback) { return callback({ opaque: "credential" }); } },
    requestFn({ request }) {
      if (request.action === "chaojipay_payment_create") return { response: { data: { payUrl: `${actionOrigin}/pay/1` } }, evidence: null };
      return {
        response: { orderId: "provider_capture_1", orderStatus: "1", outTradeId: "payment_order_1", amount: "12.00" },
        evidence: { merchantScopeDigest: "a".repeat(64), payloadDigest: "b".repeat(64) },
      };
    },
    allowedActionOrigins: [ACTION_ORIGIN],
  });
}

test("ChaoJiPay remains unverified and disabled without a credential-scoped execution scope", () => {
  const raw = createChaoJiPayPaymentAdapter();
  assert.equal(raw.contractVersion, "unverified");
  assert.deepEqual(raw.supportedPaymentMethods, []);
  assert.equal(raw.capabilities.createRechargeOrder, false);
  const withClockOnly = createChaoJiPayPaymentAdapter({ nowFn: () => NOW });
  assert.equal(withClockOnly.contractVersion, "unverified");
  assert.equal(withClockOnly.capabilities.verifyCallback, false);
});

test("ChaoJiPay rejects non-HTTPS and unallowlisted checkout actions through the complete Adapter contract", async () => {
  for (const actionOrigin of ["http://checkout.example.test", "https://unallowlisted.example.test"]) {
    const adapter = assertPaymentProviderAdapterContract(
      createChaoJiPayPaymentAdapter({ executionScope: executionScope(actionOrigin), nowFn: () => NOW }),
      { allowedActionOrigins: [ACTION_ORIGIN] },
    );
    await assert.rejects(() => adapter.createRechargeOrder(CREATE_INPUT), /provider_operation_failed/u);
  }
});

test("ChaoJiPay v1 exposes only WeChat create and verified callback", async () => {
  const raw = createChaoJiPayPaymentAdapter({ executionScope: executionScope(), nowFn: () => NOW });
  assert.deepEqual(raw.capabilities, CAPABILITIES);
  assert.deepEqual(raw.supportedPaymentMethods, ["wechat_pay"]);
  const adapter = assertPaymentProviderAdapterContract(raw, { allowedActionOrigins: [ACTION_ORIGIN] });
  assert.equal((await adapter.createRechargeOrder(CREATE_INPUT)).status, "entry_ready");
  const callback = await adapter.verifyAndNormalizeCallback({
    callbackRequestRef: "callback_request_1", receivedAt: NOW,
    bodyBase64: Buffer.from("amount=12.00&orderId=provider_capture_1&orderStatus=1&outTradeId=payment_order_1&sign=synthetic", "utf8").toString("base64"),
    headerEntries: [{ name: "content-type", value: "application/form" }],
  });
  assert.equal(callback.eventType, "payment_succeeded");
  assert.deepEqual(await adapter.webhookSuccessAck(callback), { statusCode: 200, contentType: "text/plain", body: "success" });
  await assert.rejects(() => adapter.queryPayment({ paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerOrderRef: "payment_order_1" }), /payment_provider_capability_disabled/u);
  await assert.rejects(() => adapter.createRechargeOrder({ ...CREATE_INPUT, paymentMethod: "alipay" }), /provider_operation_failed/u);
});
