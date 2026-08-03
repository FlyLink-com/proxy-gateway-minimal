import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE } from "../services/platform/chaojipay-documented-payment-candidate.mjs";

test("ChaoJiPay detached candidate records the corrected create vocabulary only", async () => {
  assert.deepEqual(CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE, {
    adapterKey: "chaojipay_v1", contractVersion: "unverified", documentedPaymentMethods: ["wechat_pay"],
    documentedProductCode: "726", requestEncoding: "application/json; charset=utf-8",
    createOrigin: "https://payment.chaojipay.me", createPath: "/api/order/create",
    createFields: ["outTradeId", "amount", "productCode", "merchantId", "ip", "notifyUrl", "sign"],
    callbackFields: ["orderId", "orderStatus", "outTradeId", "amount", "sign"],
    callbackVerification: "unverified", acknowledgement: "unverified",
  });
  assert.equal(Object.isFrozen(CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE), true);
  assert.equal(Object.isFrozen(CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE.createFields), true);
  const source = await readFile(new URL("../services/platform/chaojipay-documented-payment-candidate.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /orderNo|\bbody\b|returnUrl/u);
  assert.doesNotMatch(source, /chaojipay-payment-(?:adapter|runtime)/u);
});
