import assert from "node:assert/strict";
import test from "node:test";

import * as xsdCandidate from "../services/platform/xsd-documented-payment-candidate.mjs";

const EXPECTED_METADATA = {
  adapterKey: "xsd_v1",
  contractVersion: "unverified",
  documentedChannels: { alipay: "1917", wechat_pay: "1923" },
  requestEncoding: "application/x-www-form-urlencoded; charset=utf-8",
  createOrigin: "https://www.xsd8866.com",
  createPath: "/api/gaia/unifiedorder",
  queryPath: "/api/gaia/query",
  callbackVerification: "unverified",
  acknowledgement: "unverified",
};

function assertCandidateError(action, code) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

test("XSD candidate records only frozen unverified documentation metadata", () => {
  const { XSD_DOCUMENTED_PAYMENT_CANDIDATE } = xsdCandidate;
  assert.deepEqual(XSD_DOCUMENTED_PAYMENT_CANDIDATE, EXPECTED_METADATA);
  assert.equal(Object.isFrozen(XSD_DOCUMENTED_PAYMENT_CANDIDATE), true);
  assert.equal(Object.isFrozen(XSD_DOCUMENTED_PAYMENT_CANDIDATE.documentedChannels), true);
  assert.deepEqual(Object.keys(xsdCandidate).sort(), [
    "XSD_DOCUMENTED_PAYMENT_CANDIDATE",
    "canonicalizeXsdCreateSigningCandidate",
    "canonicalizeXsdQuerySigningCandidate",
    "digestXsdSigningCandidate",
  ]);
});

test("XSD create candidate sorts eligible synthetic fields and omits documented exclusions", () => {
  const canonicalText = xsdCandidate.canonicalizeXsdCreateSigningCandidate({
    total_fee: "1200",
    sign: "ignored",
    mch_id: "merchant_demo",
    format: "ignored",
    out_trade_no: "order_demo_1",
    attach: "ignored",
    body: "",
    mch_create_ip: "203.0.113.10",
  });
  assert.equal(
    canonicalText,
    "mch_create_ip=203.0.113.10&mch_id=merchant_demo&out_trade_no=order_demo_1&total_fee=1200",
  );
  assert.equal(
    xsdCandidate.digestXsdSigningCandidate({ canonicalText, syntheticSecret: "synthetic_secret" }),
    "09f85cc0c48f254c803d0b431c33fb93",
  );
});

test("XSD query candidate canonically sorts only its permitted synthetic fields", () => {
  assert.equal(
    xsdCandidate.canonicalizeXsdQuerySigningCandidate({
      sign: "ignored",
      out_trade_no: "order_demo_1",
      mch_id: "merchant_demo",
      format: "",
      attach: "ignored",
    }),
    "mch_id=merchant_demo&out_trade_no=order_demo_1",
  );
});

test("XSD candidate fails closed for unsafe or non-documentation inputs", () => {
  const proxy = new Proxy({}, {});
  const accessor = {};
  let accessorReads = 0;
  Object.defineProperty(accessor, "mch_id", { enumerable: true, get() { accessorReads += 1; return "merchant_demo"; } });
  for (const input of [
    null,
    [],
    proxy,
    new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } }),
    accessor,
    Object.assign(Object.create(null), { mch_id: "merchant_demo" }),
    { mch_id: "merchant_demo", out_trade_no: "unsafe/reference" },
    { mch_id: "merchant_demo", out_trade_no: "order_demo_1", unexpected: "value" },
    { mch_id: "merchant_demo", out_trade_no: 1 },
  ]) {
    assertCandidateError(
      () => xsdCandidate.canonicalizeXsdCreateSigningCandidate(input),
      "invalid_documented_payment_candidate",
    );
  }
  assert.equal(accessorReads, 0);
  for (const input of [
    null,
    [],
    new Proxy({}, {}),
    new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } }),
    { canonicalText: "mch_id=merchant_demo", syntheticSecret: "" },
    { canonicalText: "mch_id=merchant_demo", syntheticSecret: "not_synthetic" },
    { canonicalText: "mch_id=merchant_live", syntheticSecret: "synthetic_secret" },
    { canonicalText: "mch_id=merchant_demo&mch_id=merchant_demo", syntheticSecret: "synthetic_secret" },
    { canonicalText: "unknown=merchant_demo", syntheticSecret: "synthetic_secret" },
    { canonicalText: "attach=merchant_demo", syntheticSecret: "synthetic_secret" },
    { canonicalText: "out_trade_no=order_demo_1&mch_id=merchant_demo", syntheticSecret: "synthetic_secret" },
    { canonicalText: 1, syntheticSecret: "synthetic_secret" },
    { canonicalText: "mch_id=merchant_demo", syntheticSecret: "synthetic_secret", extra: "value" },
  ]) {
    assertCandidateError(
      () => xsdCandidate.digestXsdSigningCandidate(input),
      "provider_contract_unverified",
    );
  }
});

test("XSD candidate rejects hostile proxies before reflection traps and delimiter collisions", () => {
  let getPrototypeOfCalls = 0;
  let ownKeysCalls = 0;
  const hostile = new Proxy({}, {
    getPrototypeOf() {
      getPrototypeOfCalls += 1;
      return Object.prototype;
    },
    ownKeys() {
      ownKeysCalls += 1;
      return [];
    },
  });
  assertCandidateError(
    () => xsdCandidate.canonicalizeXsdCreateSigningCandidate(hostile),
    "invalid_documented_payment_candidate",
  );
  assert.equal(getPrototypeOfCalls, 0);
  assert.equal(ownKeysCalls, 0);
  for (const mch_id of ["merchant_demo&total_fee=1", "merchant=demo"]) {
    assertCandidateError(
      () => xsdCandidate.canonicalizeXsdCreateSigningCandidate({ mch_id }),
      "invalid_documented_payment_candidate",
    );
  }
});
