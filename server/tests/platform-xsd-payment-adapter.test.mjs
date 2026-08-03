import assert from "node:assert/strict";
import test from "node:test";

import { assertPaymentProviderAdapterContract } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createCredentialScopedPaymentExecution } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createXsdPaymentAdapter } from "../services/platform/xsd-payment-adapter.mjs";

const NOW = "2026-08-02T00:00:00.000Z";
const ACTION_ORIGIN = "https://checkout.example.test";
const CREATE_INPUT = Object.freeze({
  paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerRequestRef: "provider_request_1",
  paymentMethod: "alipay", amountMinor: 1200, currency: "CNY", currencyExponent: 2,
  expectedPaidCoins: 30, quoteDigest: "c".repeat(64), expiresAt: "2026-08-02T00:10:00.000Z",
  callbackRouteRef: "portal_payment_callback_v1", returnRouteRef: "portal_wallet_return_v1",
});

function executionScope() {
  return createCredentialScopedPaymentExecution({
    profileRef: "xsd_profile", adapterKey: "xsd_v1", contractVersion: "v1",
    credentialProfileRef: "xsd_credential",
    credentialLoader: { withCredential(_binding, callback) { return callback({ opaque: "credential" }); } },
    requestFn({ request }) {
      if (request.action === "xsd_payment_create") return { response: { url: `${ACTION_ORIGIN}/pay/1` }, evidence: null };
      if (request.action === "xsd_payment_query") return { response: { mch_order_no: "payment_order_1", status: "00" }, evidence: null };
      return {
        response: { mch_order_no: "payment_order_1", partnerorderid: "provider_order_1", status: "1", mchId: "merchant_demo", amount: "12.00" },
        evidence: { merchantScopeDigest: "a".repeat(64), payloadDigest: "b".repeat(64) },
      };
    },
    allowedActionOrigins: [ACTION_ORIGIN],
  });
}

test("XSD remains default-off until a credential-scoped execution scope is injected", () => {
  const raw = createXsdPaymentAdapter();
  assert.equal(raw.contractVersion, "unverified");
  assert.deepEqual(raw.supportedPaymentMethods, []);
  assert.equal(raw.capabilities.createRechargeOrder, false);
});

test("XSD rejects non-exact execution scopes without invoking accessors", () => {
  let getterCalls = 0;
  const accessorScope = {};
  Object.defineProperty(accessorScope, "withCredential", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return () => Promise.reject(new Error("must-not-run"));
    },
  });

  assert.throws(
    () => createXsdPaymentAdapter({
      executionScope: accessorScope,
      nowFn: () => NOW,
    }),
    /invalid_payment_provider_adapter/u,
  );
  assert.equal(getterCalls, 0);

  const withCredential = () => Promise.reject(new Error("must-not-run"));
  const inherited = Object.create({ withCredential });
  const nullPrototype = Object.assign(Object.create(null), { withCredential });
  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, "withCredential", {
    value: withCredential,
    enumerable: false,
  });
  const symbolic = { withCredential };
  symbolic[Symbol("extra")] = true;

  for (const executionScopeValue of [
    inherited,
    nullPrototype,
    nonEnumerable,
    { withCredential, extra: true },
    symbolic,
  ]) {
    assert.throws(
      () => createXsdPaymentAdapter({
        executionScope: executionScopeValue,
        nowFn: () => NOW,
      }),
      /invalid_payment_provider_adapter/u,
    );
  }
});

test("XSD snapshots the execution method while preserving its receiver", async () => {
  let originalCalls = 0;
  let replacementCalls = 0;
  const mutableScope = {
    withCredential(operation, callback) {
      assert.equal(this, mutableScope);
      assert.equal(operation, "create_recharge_order");
      originalCalls += 1;
      return callback({
        request: async (request) => {
          assert.equal(request.action, "xsd_payment_create");
          return { response: { url: `${ACTION_ORIGIN}/pay/snapshotted` } };
        },
      });
    },
  };
  const raw = createXsdPaymentAdapter({
    executionScope: mutableScope,
    nowFn: () => NOW,
  });
  mutableScope.withCredential = () => {
    replacementCalls += 1;
    return Promise.reject(new Error("replacement_scope_called"));
  };
  const adapter = assertPaymentProviderAdapterContract(raw, {
    allowedActionOrigins: [ACTION_ORIGIN],
  });

  const result = await adapter.createRechargeOrder(CREATE_INPUT);

  assert.equal(result.status, "entry_ready");
  assert.equal(result.nextAction.url, `${ACTION_ORIGIN}/pay/snapshotted`);
  assert.deepEqual({ originalCalls, replacementCalls }, {
    originalCalls: 1,
    replacementCalls: 0,
  });
});

test("XSD v1 exposes only create, query, and verified callback capabilities", async () => {
  const raw = createXsdPaymentAdapter({ executionScope: executionScope(), nowFn: () => NOW });
  assert.deepEqual({
    adapterKey: raw.adapterKey, providerId: raw.providerId, contractVersion: raw.contractVersion,
    supportedPaymentMethods: raw.supportedPaymentMethods, capabilities: raw.capabilities,
  }, {
    adapterKey: "xsd_v1", providerId: "xsd", contractVersion: "v1",
    supportedPaymentMethods: ["alipay", "wechat_pay"],
    capabilities: {
      createRechargeOrder: true, queryPayment: true, capturePayment: false, verifyCallback: true,
      refund: false, reconcile: false, repeatCreateIdempotent: false, repeatCaptureIdempotent: false,
    },
  });
  const adapter = assertPaymentProviderAdapterContract(raw, { allowedActionOrigins: [ACTION_ORIGIN] });
  assert.equal((await adapter.createRechargeOrder(CREATE_INPUT)).status, "entry_ready");
  assert.equal((await adapter.queryPayment({ paymentOrderRef: "payment_order_1", attemptRef: "attempt_1", providerOrderRef: "payment_order_1" })).status, "pending");
  const callback = await adapter.verifyAndNormalizeCallback({
    callbackRequestRef: "callback_request_1", receivedAt: NOW,
    bodyBase64: Buffer.from("amount=12.00&mchId=merchant_demo&mch_order_no=payment_order_1&partnerorderid=provider_order_1&sign=synthetic&status=1", "utf8").toString("base64"),
    headerEntries: [{ name: "content-type", value: "application/x-www-form-urlencoded; charset=utf-8" }],
  });
  assert.equal(callback.eventType, "payment_succeeded");
  assert.deepEqual(await adapter.webhookSuccessAck(callback), { statusCode: 200, contentType: "text/plain", body: "SUCCESS" });
  await assert.rejects(() => adapter.capturePayment({}), /payment_provider_capability_disabled/u);
  await assert.rejects(() => adapter.refund({}), /payment_provider_capability_disabled/u);
  await assert.rejects(() => adapter.reconcile({}), /payment_provider_capability_disabled/u);
});
