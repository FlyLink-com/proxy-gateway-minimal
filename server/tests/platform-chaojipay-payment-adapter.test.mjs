import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPaymentProviderAdapterContract } from "../services/platform/payment-provider-adapter-contract.mjs";
import { createChaoJiPayPaymentAdapter } from "../services/platform/chaojipay-payment-adapter.mjs";

const FALSE_CAPABILITIES = Object.freeze({
  createRechargeOrder: false, queryPayment: false, capturePayment: false,
  verifyCallback: false, refund: false, reconcile: false,
  repeatCreateIdempotent: false, repeatCaptureIdempotent: false,
});

test("ChaoJiPay is the exact identity-only unverified disabled Adapter", () => {
  const raw = createChaoJiPayPaymentAdapter();
  assert.equal(raw.adapterKey, "chaojipay_v1");
  assert.equal(raw.providerId, "chaojipay");
  assert.equal(raw.contractVersion, "unverified");
  assert.deepEqual(raw.capabilities, FALSE_CAPABILITIES);
  assert.deepEqual(raw.supportedPaymentMethods, []);
  assert.deepEqual(assertPaymentProviderAdapterContract(raw).capabilities, FALSE_CAPABILITIES);
});

test("ChaoJiPay exports no protocol codec status acknowledgement endpoint or payment method surface", async () => {
  const source = await readFile(
    new URL("../services/platform/chaojipay-payment-adapter.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /createUnverifiedPaymentAdapter/u);
  assert.doesNotMatch(source, /codec|endpoint|signature|merchant|credential|\bstatus\b|paymentMethod/iu);
  assert.deepEqual(Object.keys(await import("../services/platform/chaojipay-payment-adapter.mjs")), [
    "createChaoJiPayPaymentAdapter",
  ]);
});
