import assert from "node:assert/strict";
import test from "node:test";

import * as xsdCandidate from "../services/platform/xsd-documented-payment-candidate.mjs";

const EXPECTED_METADATA = {
  adapterKey: "xsd_v1",
  contractVersion: "v1",
  documentedChannels: { alipay: "1917", wechat_pay: "1923" },
  requestEncoding: "application/x-www-form-urlencoded; charset=utf-8",
  createOrigin: "https://www.xsd8866.com",
  createPath: "/api/gaia/unifiedorder",
  queryPath: "/api/gaia/query",
  createFields: ["mch_order_no", "amount", "notifyurl", "callbackurl", "mchId", "channel", "format", "sign"],
  queryFields: ["mch_order_no", "mchId", "sign"],
  callbackFields: ["mch_order_no", "partnerorderid", "status", "mchId", "amount", "sign"],
  readOnlyEvidenceWarning: "Documented field evidence only; no runtime linkage or provider compatibility claim.",
};

function assertCandidateError(action, code) {
  assert.throws(action, (error) => { assert.equal(error?.code, code); return true; });
}

test("XSD candidate records only frozen read-only exact field evidence", () => {
  assert.deepEqual(xsdCandidate.XSD_DOCUMENTED_PAYMENT_CANDIDATE, EXPECTED_METADATA);
  assert.equal(Object.isFrozen(xsdCandidate.XSD_DOCUMENTED_PAYMENT_CANDIDATE), true);
  assert.equal(Object.isFrozen(xsdCandidate.XSD_DOCUMENTED_PAYMENT_CANDIDATE.documentedChannels), true);
  assert.deepEqual(Object.keys(xsdCandidate).sort(), [
    "XSD_DOCUMENTED_PAYMENT_CANDIDATE", "canonicalizeXsdCreateSigningCandidate",
    "canonicalizeXsdQuerySigningCandidate", "digestXsdSigningCandidate",
  ]);
});

test("XSD candidate uses exact documented fields and excludes sign plus format", () => {
  const canonicalText = xsdCandidate.canonicalizeXsdCreateSigningCandidate({
    amount: "12.00", sign: "ignored", mchId: "merchant_demo", format: "json",
    mch_order_no: "order_demo_1", channel: "1917", notifyurl: "https://callback.example.test", callbackurl: "https://return.example.test",
  });
  assert.equal(canonicalText, "amount=12.00&callbackurl=https://return.example.test&channel=1917&mchId=merchant_demo&mch_order_no=order_demo_1&notifyurl=https://callback.example.test");
  assert.equal(xsdCandidate.digestXsdSigningCandidate({ canonicalText, syntheticSecret: "synthetic_secret" }), "41c0c950ae3df01b5bda092431cf9e08");
  assert.equal(xsdCandidate.canonicalizeXsdQuerySigningCandidate({ mch_order_no: "order_demo_1", mchId: "merchant_demo", sign: "ignored" }), "mchId=merchant_demo&mch_order_no=order_demo_1");
});

test("XSD candidate fails closed for superseded fields, accessors, proxies, and delimiter collisions", () => {
  const accessor = {};
  let reads = 0;
  Object.defineProperty(accessor, "mchId", { enumerable: true, get() { reads += 1; return "merchant_demo"; } });
  for (const input of [
    null, [], new Proxy({}, {}), accessor, Object.assign(Object.create(null), { mchId: "merchant_demo" }),
    { mchId: "merchant_demo", mch_order_no: "unsafe/reference" },
    { mchId: "merchant_demo", mch_order_no: "order_demo_1", attach: "unexpected" },
    { mch_id: "merchant_demo", out_trade_no: "order_demo_1" },
    { mchId: "merchant_demo&amount=1" },
  ]) assertCandidateError(() => xsdCandidate.canonicalizeXsdCreateSigningCandidate(input), "invalid_documented_payment_candidate");
  assert.equal(reads, 0);
});
