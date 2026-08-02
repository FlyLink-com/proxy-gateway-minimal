import assert from "node:assert/strict";
import test from "node:test";

import * as chaoJiPayCandidate from "../services/platform/chaojipay-documented-payment-candidate.mjs";

const EXPECTED_METADATA = {
  adapterKey: "chaojipay_v1",
  contractVersion: "unverified",
  documentedPaymentMethods: ["wechat_pay"],
  documentedProductCode: "726",
  requestEncoding: "application/json; charset=utf-8",
  createOrigin: "https://payment.chaojipay.me",
  createPath: "/api/order/create",
  queryPath: "/api/order/search",
  callbackVerification: "unverified",
  acknowledgement: "unverified",
};

function assertCandidateError(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test("ChaoJiPay candidate records only frozen unverified documentation metadata", () => {
  const { CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE } = chaoJiPayCandidate;
  assert.deepEqual(CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE, EXPECTED_METADATA);
  assert.equal(Object.isFrozen(CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE), true);
  assert.equal(Object.isFrozen(CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE.documentedPaymentMethods), true);
  assert.deepEqual(Object.keys(chaoJiPayCandidate).sort(), [
    "CHAOJIPAY_DOCUMENTED_PAYMENT_CANDIDATE",
    "canonicalizeChaoJiPayCreateSigningCandidate",
    "canonicalizeChaoJiPayQuerySigningCandidate",
    "digestChaoJiPaySigningCandidate",
  ]);
});

test("ChaoJiPay create candidate sorts eligible synthetic fields and omits documented exclusions", () => {
  const canonicalText = chaoJiPayCandidate.canonicalizeChaoJiPayCreateSigningCandidate({
    productCode: "726",
    sign: "ignored",
    amount: "1200",
    merchantId: "merchant_demo",
    realName: "ignored",
    orderNo: "order_demo_1",
    body: "",
  });
  assert.equal(canonicalText, "amount=1200&merchantId=merchant_demo&orderNo=order_demo_1&productCode=726");
  assert.equal(
    chaoJiPayCandidate.digestChaoJiPaySigningCandidate({ canonicalText, syntheticSecret: "synthetic_secret" }),
    "DAD03A26B612CC30E3A17DAFD20A822E",
  );
});

test("ChaoJiPay query candidate canonically sorts only its permitted synthetic fields", () => {
  assert.equal(
    chaoJiPayCandidate.canonicalizeChaoJiPayQuerySigningCandidate({
      realName: "ignored",
      orderNo: "order_demo_1",
      sign: "ignored",
      merchantId: "merchant_demo",
    }),
    "merchantId=merchant_demo&orderNo=order_demo_1",
  );
});

test("ChaoJiPay candidate fails closed for unsafe or non-documentation inputs", () => {
  const proxy = new Proxy({}, {});
  const accessor = {};
  let accessorReads = 0;
  Object.defineProperty(accessor, "merchantId", { enumerable: true, get() { accessorReads += 1; return "merchant_demo"; } });
  for (const input of [
    null,
    [],
    proxy,
    new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } }),
    accessor,
    Object.assign(Object.create(null), { merchantId: "merchant_demo" }),
    { merchantId: "merchant_demo", orderNo: "unsafe/reference" },
    { merchantId: "merchant_demo", orderNo: "order_demo_1", unexpected: "value" },
    { merchantId: "merchant_demo", orderNo: 1 },
  ]) {
    assertCandidateError(
      () => chaoJiPayCandidate.canonicalizeChaoJiPayCreateSigningCandidate(input),
      "invalid_documented_payment_candidate",
    );
  }
  assert.equal(accessorReads, 0);
  for (const input of [
    null,
    [],
    new Proxy({}, {}),
    new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } }),
    { canonicalText: "merchantId=merchant_demo", syntheticSecret: "" },
    { canonicalText: "merchantId=merchant_demo", syntheticSecret: "not_synthetic" },
    { canonicalText: "merchantId=merchant_live", syntheticSecret: "synthetic_secret" },
    { canonicalText: 1, syntheticSecret: "synthetic_secret" },
    { canonicalText: "merchantId=merchant_demo", syntheticSecret: "synthetic_secret", extra: "value" },
  ]) {
    assertCandidateError(
      () => chaoJiPayCandidate.digestChaoJiPaySigningCandidate(input),
      "provider_contract_unverified",
    );
  }
});
