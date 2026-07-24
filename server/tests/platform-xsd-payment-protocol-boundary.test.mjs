import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeVerifiedPaymentEvent } from "../services/platform/payment-provider-adapter-contract.mjs";
import * as xsdBoundary from "../services/platform/xsd-payment-protocol-boundary.mjs";
import {
  XSD_DOCUMENTED_FIELD_ROLES,
  classifyXsdCallbackStatus,
  classifyXsdQueryStatus,
  encodeXsdSignedCreateRequest,
  encodeXsdSuccessAck,
  verifyXsdCallbackSignature,
} from "../services/platform/xsd-payment-protocol-boundary.mjs";

function assertDeepFrozen(value) {
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assert.ok(Object.isFrozen(child));
}

test("XSD boundary exposes only frozen documented field roles", () => {
  assert.deepEqual(Object.keys(xsdBoundary).sort(), [
    "XSD_DOCUMENTED_FIELD_ROLES",
    "classifyXsdCallbackStatus",
    "classifyXsdQueryStatus",
    "encodeXsdSignedCreateRequest",
    "encodeXsdSuccessAck",
    "verifyXsdCallbackSignature",
  ]);
  assert.deepEqual(Object.keys(XSD_DOCUMENTED_FIELD_ROLES), ["create", "query", "callback"]);
  assert.deepEqual(XSD_DOCUMENTED_FIELD_ROLES, {
    create: [
      "merchant_order_ref",
      "amount",
      "notify_target",
      "return_target",
      "merchant_scope",
      "channel",
      "signature",
      "response_format",
      "attachment",
    ],
    query: ["merchant_order_ref", "merchant_scope", "signature"],
    callback: [
      "merchant_order_ref",
      "provider_order_ref",
      "merchant_scope",
      "amount",
      "status",
      "signature",
      "attachment",
    ],
  });
  assertDeepFrozen(XSD_DOCUMENTED_FIELD_ROLES);
});

test("XSD query status classifier maps only documented values", () => {
  for (const [value, expected] of [
    ["3", { status: "succeeded", chargeCertainty: "confirmed_charged" }],
    ["00", { status: "pending", chargeCertainty: "possibly_charged" }],
    ["unexpected", { status: "reconciliation_required", chargeCertainty: "unknown" }],
  ]) {
    const actual = classifyXsdQueryStatus(value);
    assert.deepEqual(actual, expected);
    assert.deepEqual(Object.keys(actual), ["status", "chargeCertainty"]);
    assertDeepFrozen(actual);
  }
});

test("XSD callback classifier remains unverified and never creates a payment fact", () => {
  const results = [
    ["1", { eventType: "payment_succeeded", verificationResult: "unverified" }],
    ["-1", { eventType: "payment_pending", verificationResult: "unverified" }],
    ["unexpected", { eventType: "reconciliation_required", verificationResult: "unverified" }],
  ];
  for (const [value, expected] of results) {
    const actual = classifyXsdCallbackStatus(value);
    assert.deepEqual(actual, expected);
    assert.deepEqual(Object.keys(actual), ["eventType", "verificationResult"]);
    assertDeepFrozen(actual);
  }
  assert.throws(
    () => normalizeVerifiedPaymentEvent(classifyXsdCallbackStatus("1")),
    /invalid_verified_payment_event/u,
  );
});

test("XSD acknowledgement codec emits the exact UTF-8 success body", () => {
  const acknowledgement = encodeXsdSuccessAck();
  assert.deepEqual(acknowledgement, {
    statusCode: 200,
    contentType: "text/plain",
    body: "SUCCESS",
  });
  assertDeepFrozen(acknowledgement);
  assert.deepEqual(Buffer.from(acknowledgement.body, "utf8"), Buffer.from([83, 85, 67, 67, 69, 83, 83]));
});

test("XSD signer and verifier reject before inspecting hostile input", () => {
  const counters = { get: 0, ownKeys: 0 };
  const hostile = new Proxy({}, {
    get() { counters.get += 1; throw new Error("must-not-read"); },
    ownKeys() { counters.ownKeys += 1; throw new Error("must-not-enumerate"); },
  });
  for (const [name, operation] of [
    ["signer", encodeXsdSignedCreateRequest],
    ["verifier", verifyXsdCallbackSignature],
  ]) {
    let getterReads = 0;
    const ordinary = {};
    Object.defineProperty(ordinary, "merchant_order_ref", {
      enumerable: true,
      get() { getterReads += 1; throw new Error("must-not-read"); },
    });
    assert.throws(() => operation(ordinary), (error) => {
      assert.equal(error.constructor, Error, `${name} must throw Error`);
      assert.equal(error.message, "provider_contract_unverified");
      return true;
    });
    assert.equal(getterReads, 0, `${name} must not read ordinary input`);
    assert.throws(() => operation(hostile), (error) => {
      assert.equal(error.constructor, Error, `${name} must throw Error`);
      assert.equal(error.message, "provider_contract_unverified");
      return true;
    });
  }
  assert.deepEqual(counters, { get: 0, ownKeys: 0 });
});

test("XSD boundary contains no guessed signing encoding or transport implementation", () => {
  const source = readFileSync(new URL("../services/platform/xsd-payment-protocol-boundary.mjs", import.meta.url), "utf8");
  for (const [rule, forbidden] of [
    ["MD5 or crypto digest API", /\b(?:md5|node:crypto|createHash|createHmac|subtle\.digest|crypto\.)\b/iu],
    ["field sorting", /\.(?:sort|toSorted)\s*\(/u],
    ["field joining", /\.(?:join|concat|reduce)\s*\(/u],
    ["obvious string concatenation", /(?:\+\s*=|\+\s*["'`]|["'`]\s*\+)/u],
    ["charset encoder", /\b(?:TextEncoder|TextDecoder|Buffer|utf-?8|ascii|latin1|gbk)\b/iu],
    ["form encoder", /\b(?:URLSearchParams|FormData|application\/x-www-form-urlencoded)\b/iu],
    ["digest case transform", /\.(?:toLowerCase|toUpperCase)\s*\(/u],
    ["credential or environment loader", /\b(?:credential|secret|token|process\.env|readFile(?:Sync)?|createReadStream)\b/iu],
    ["network request API", /\b(?:fetch|XMLHttpRequest|axios|undici|node:https?|https?\.request|request|net\.connect)\b/iu],
    ["URL literal", /https?:\/\//iu],
    ["sandbox or retry behavior", /\b(?:sandbox|retry)\b/iu],
  ]) {
    assert.doesNotMatch(source, forbidden, rule);
  }
});
