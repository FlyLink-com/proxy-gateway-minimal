import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeVerifiedPaymentEvent } from "../services/platform/payment-provider-adapter-contract.mjs";
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
  assert.deepEqual(classifyXsdQueryStatus("3"), {
    status: "succeeded",
    chargeCertainty: "confirmed_charged",
  });
  assert.deepEqual(classifyXsdQueryStatus("00"), {
    status: "pending",
    chargeCertainty: "possibly_charged",
  });
  assert.deepEqual(classifyXsdQueryStatus("unexpected"), {
    status: "reconciliation_required",
    chargeCertainty: "unknown",
  });
  assertDeepFrozen(classifyXsdQueryStatus("3"));
});

test("XSD callback classifier remains unverified and never creates a payment fact", () => {
  const succeeded = classifyXsdCallbackStatus("1");
  assert.deepEqual(succeeded, {
    eventType: "payment_succeeded",
    verificationResult: "unverified",
  });
  assert.deepEqual(classifyXsdCallbackStatus("-1"), {
    eventType: "payment_pending",
    verificationResult: "unverified",
  });
  assert.deepEqual(classifyXsdCallbackStatus("unexpected"), {
    eventType: "reconciliation_required",
    verificationResult: "unverified",
  });
  assertDeepFrozen(succeeded);
  assert.throws(
    () => normalizeVerifiedPaymentEvent(succeeded),
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
  for (const operation of [encodeXsdSignedCreateRequest, verifyXsdCallbackSignature]) {
    assert.throws(() => operation(hostile), /provider_contract_unverified/u);
  }
  assert.deepEqual(counters, { get: 0, ownKeys: 0 });
});

test("XSD boundary contains no guessed signing encoding or transport implementation", () => {
  const source = readFileSync(new URL("../services/platform/xsd-payment-protocol-boundary.mjs", import.meta.url), "utf8");
  for (const forbidden of [
    /createHash/u,
    /\.sort\(/u,
    /\.join\(/u,
    /TextEncoder/u,
    /URLSearchParams/u,
    /\.toLowerCase\(/u,
    /\.toUpperCase\(/u,
    /process\.env/u,
    /\bfetch\(/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
