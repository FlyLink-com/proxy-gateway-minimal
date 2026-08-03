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
  ["crypto_digest", /\b(?:createHash|createHmac|md5[A-Za-z_$\w]*)\s*\(|\b(?:crypto|subtle)\s*\.\s*digest\s*\(/iu],
  ["field_sorting", /\.(?:sort|toSorted)\s*\(/u],
  ["field_joining", /\.(?:join|concat|reduce)\s*\(/u],
  ["charset_encoding", /\b(?:TextEncoder|TextDecoder)\s*\(|\bBuffer\s*\.\s*(?:from|alloc|concat)\s*\(/u],
  ["form_encoding", /\b(?:URLSearchParams|FormData)\s*\(|["'`]application\/x-www-form-urlencoded["'`]/iu],
  ["digest_case", /\.(?:toLowerCase|toUpperCase)\s*\(/u],
  ["credential_loading", /\b(?:readFile(?:Sync)?|createReadStream)\s*\(|\bprocess\s*\.\s*env\b|\b(?:credential|secret|token)[A-Za-z_$\w]*\s*(?:\.|\[)/iu],
  ["network_request", /\b(?:fetch|XMLHttpRequest|axios|undici)\s*(?:\(|\.)|\b(?:https?|net)\s*\.\s*(?:request|connect)\s*\(/iu],
  ["url_literal", /["'`]https?:\/\//iu],
  ["sandbox_or_retry", /\b(?:sandbox|retry)[A-Za-z_$\w]*\s*\(/iu],
];

function extractConstDeclarationNames(source) {
  return [...source.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gu)]
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
  if (/\b[A-Za-z_$][\w$]*\s*\[/u.test(source)) violations.add("computed_member_access");
  if (/\b(?:process|globalThis)\b/u.test(source)) violations.add("ambient_global");
  if (/\b(?:let|var)\b/u.test(source)) violations.add("mutable_binding");
  if (/\b(?:setTimeout|setInterval|queueMicrotask|setImmediate)\s*\(/u.test(source)) {
    violations.add("scheduling");
  }
  if (/\bfunction\s*\(/u.test(source)) violations.add("function_expression");
  if (JSON.stringify(extractConstDeclarationNames(source)) !== JSON.stringify(EXPECTED_TOP_LEVEL_CONSTS)) {
    violations.add("const_declarations");
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

test("legacy XSD boundary remains frozen read-only documentation isolation", () => {
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

test("legacy XSD callback classifier remains unverified and never creates a payment fact", () => {
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
  assert.deepEqual(extractConstDeclarationNames(source), EXPECTED_TOP_LEVEL_CONSTS);
  assert.deepEqual(extractFunctionDeclarationNames(source), EXPECTED_FUNCTION_DECLARATIONS);
  assert.deepEqual(findBoundaryViolations(source), []);
  for (const [fixtureName, fixtureSource, expectedRule, expected = true] of [
    ["left plus right", "const output = left + right;", "string_concatenation"],
    ["template interpolation", "const output = `${value}`;", "template_interpolation"],
    ["generic helper import", 'import { helper } from "node:querystring";', "module_loading"],
    ["querystring member call", "querystring.stringify(input);", "unknown_member_access"],
    ["iconv member call", "iconv.encode(input);", "unknown_member_access"],
    ["client member call", "client.post(input);", "unknown_member_access"],
    ["configuration member read", "config.apiKey;", "unknown_member_access"],
    ["scheduling call", "setTimeout(task, 0);", "scheduling"],
    ["nested const helper", "function helper() { const hidden = value; }", "const_declarations"],
    ["mutable helper binding", "let hidden = value;", "mutable_binding"],
    ["ambient process", "process;", "ambient_global"],
    ["retry comment", "// retry remains unsupported", "sandbox_or_retry", false],
  ]) {
    const violations = findBoundaryViolations(fixtureSource);
    assert.equal(violations.includes(expectedRule), expected, `${fixtureName} rule result`);
  }
  for (const [fixtureName, fixtureSource] of [
    ["computed process access", `${source}\nprocess["env"]["PAYMENT_KEY"];`],
    ["computed global access", `${source}\nglobalThis["providerProof"]();`],
  ]) {
    assert.ok(
      findBoundaryViolations(fixtureSource).includes("computed_member_access"),
      `${fixtureName} must be rejected by computed_member_access`,
    );
  }
});
