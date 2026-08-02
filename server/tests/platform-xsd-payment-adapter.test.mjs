import assert from "node:assert/strict";
import test from "node:test";

import { assertPaymentProviderAdapterContract } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createXsdPaymentAdapter } from "../services/platform/xsd-payment-adapter.mjs";

const FALSE_CAPABILITIES = Object.freeze({
  createRechargeOrder: false, queryPayment: false, capturePayment: false,
  verifyCallback: false, refund: false, reconcile: false,
  repeatCreateIdempotent: false, repeatCaptureIdempotent: false,
});

test("XSD is the exact xsd_v1 unverified disabled Adapter", () => {
  const raw = createXsdPaymentAdapter();
  assert.equal(raw.adapterKey, "xsd_v1");
  assert.equal(raw.providerId, "xsd");
  assert.equal(raw.contractVersion, "unverified");
  assert.deepEqual(raw.capabilities, FALSE_CAPABILITIES);
  assert.deepEqual(raw.supportedPaymentMethods, []);
  assert.deepEqual(Object.values(raw.capabilities), Array(8).fill(false));
  assert.deepEqual(assertPaymentProviderAdapterContract(raw).capabilities, FALSE_CAPABILITIES);
});

test("XSD runtime cannot expose a sendable acknowledgement while unverified", async () => {
  const counters = { loader: 0, request: 0, clock: 0 };
  const raw = createXsdPaymentAdapter({
    executionScope: {
      withCredential() { counters.loader += 1; },
    },
    nowFn() { counters.clock += 1; return "unexpected"; },
  });
  assert.throws(() => raw.webhookSuccessAck(new Proxy({}, {})), (error) => {
    assert.equal(error.code, "provider_contract_unverified");
    assert.equal(error.operation, "verify_callback");
    return true;
  });
  const normalized = assertPaymentProviderAdapterContract(raw);
  await assert.rejects(() => normalized.webhookSuccessAck({}), /payment_provider_capability_disabled/u);
  assert.deepEqual(counters, { loader: 0, request: 0, clock: 0 });
});
