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

const EXPECTED_TOP_LEVEL_CONSTS = [
  "XSD_DOCUMENTED_FIELD_ROLES",
  "QUERY_STATUS",
  "CALLBACK_STATUS",
  "SUCCESS_ACK",
];
const EXPECTED_FUNCTION_DECLARATIONS = [
  "unverified",
  "classifyXsdQueryStatus",
  "classifyXsdCallbackStatus",
  "encodeXsdSuccessAck",
  "encodeXsdSignedCreateRequest",
  "verifyXsdCallbackSignature",
];
const ALLOWED_MEMBER_EXPRESSIONS = new Set([
  "Object.freeze",
  "QUERY_STATUS.succeeded",
  "QUERY_STATUS.pending",
  "QUERY_STATUS.unknown",
  "CALLBACK_STATUS.succeeded",
  "CALLBACK_STATUS.pending",
  "CALLBACK_STATUS.unknown",
]);
const ALLOWED_CALL_EXPRESSIONS = new Set(["Object.freeze", "Error", "unverified"]);
const CONTROL_FLOW_KEYWORDS = new Set(["if", "for", "while", "switch", "catch"]);
const SEMANTIC_FORBIDDEN_PATTERNS = [
  ["crypto_digest", /\b(?:md5|node:crypto|createHash|createHmac|subtle\.digest|crypto\.)\b/iu],
  ["field_sorting", /\.(?:sort|toSorted)\s*\(/u],
  ["field_joining", /\.(?:join|concat|reduce)\s*\(/u],
  ["charset_encoding", /\b(?:TextEncoder|TextDecoder|Buffer|utf-?8|ascii|latin1|gbk)\b/iu],
  ["form_encoding", /\b(?:URLSearchParams|FormData|application\/x-www-form-urlencoded)\b/iu],
  ["digest_case", /\.(?:toLowerCase|toUpperCase)\s*\(/u],
  ["credential_loading", /\b(?:credential|secret|token|process\.env|readFile(?:Sync)?|createReadStream)\b/iu],
  ["network_request", /\b(?:fetch|XMLHttpRequest|axios|undici|node:https?|https?\.request|request|net\.connect)\b/iu],
  ["url_literal", /https?:\/\//iu],
  ["sandbox_or_retry", /\b(?:sandbox|retry)\b/iu],
];

function extractTopLevelConstNames(source) {
  return [...source.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gmu)]
    .map((match) => match[1]);
}

function extractFunctionDeclarationNames(source) {
  return [...source.matchAll(/^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gmu)]
    .map((match) => match[1]);
}

function findBoundaryViolations(source) {
  const violations = new Set();
  if (
    /(?:^|\n)\s*import(?:\s|\{|\*|\()/mu.test(source)
    || /\bimport\s*\(/u.test(source)
    || /\bexport\s+(?:\*|\{[^}]*\})\s+from\b/u.test(source)
    || /\b(?:require|createRequire)\b/u.test(source)
  ) violations.add("module_loading");
  if (/\+/u.test(source)) violations.add("string_concatenation");
  if (/\$\{/u.test(source)) violations.add("template_interpolation");
  if (/\bclass\b/u.test(source)) violations.add("class_declaration");
  if (/=>/u.test(source)) violations.add("arrow_function");
  if (/\b(?:setTimeout|setInterval|queueMicrotask|setImmediate)\s*\(/u.test(source)) {
    violations.add("scheduling");
  }
  if (/\bfunction\s*\(/u.test(source)) violations.add("function_expression");
  if (JSON.stringify(extractTopLevelConstNames(source)) !== JSON.stringify(EXPECTED_TOP_LEVEL_CONSTS)) {
    violations.add("top_level_constants");
  }
  if (JSON.stringify(extractFunctionDeclarationNames(source)) !== JSON.stringify(EXPECTED_FUNCTION_DECLARATIONS)) {
    violations.add("function_declarations");
  }
  for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\b/gu)) {
    if (!ALLOWED_MEMBER_EXPRESSIONS.has(match[1])) violations.add("unknown_member_access");
  }
  for (const match of source.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/gu)) {
    const callee = match[1];
    const prefix = source.slice(0, match.index);
    if (/function\s+$/u.test(prefix) || CONTROL_FLOW_KEYWORDS.has(callee)) continue;
    if (!ALLOWED_CALL_EXPRESSIONS.has(callee)) violations.add("unknown_call");
  }
  for (const [rule, pattern] of SEMANTIC_FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) violations.add(rule);
  }
  return [...violations].sort();
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
  assert.deepEqual(extractTopLevelConstNames(source), EXPECTED_TOP_LEVEL_CONSTS);
  assert.deepEqual(extractFunctionDeclarationNames(source), EXPECTED_FUNCTION_DECLARATIONS);
  assert.deepEqual(findBoundaryViolations(source), []);
  for (const [fixtureName, fixtureSource, expectedRule] of [
    ["left plus right", "const output = left + right;", "string_concatenation"],
    ["template interpolation", "const output = `${value}`;", "template_interpolation"],
    ["generic helper import", 'import { helper } from "node:querystring";', "module_loading"],
    ["querystring member call", "querystring.stringify(input);", "unknown_member_access"],
    ["iconv member call", "iconv.encode(input);", "unknown_member_access"],
    ["client member call", "client.post(input);", "unknown_member_access"],
    ["configuration member read", "config.apiKey;", "unknown_member_access"],
    ["scheduling call", "setTimeout(task, 0);", "scheduling"],
  ]) {
    assert.ok(
      findBoundaryViolations(fixtureSource).includes(expectedRule),
      `${fixtureName} must be rejected by ${expectedRule}`,
    );
  }
});
