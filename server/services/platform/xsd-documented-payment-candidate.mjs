// Synthetic candidate only: passing local tests is not provider compatibility evidence.
// This module must remain unreachable from runtime until a later Risk A contract-validation Gate.
import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export const XSD_DOCUMENTED_PAYMENT_CANDIDATE = Object.freeze({
  adapterKey: "xsd_v1",
  contractVersion: "unverified",
  documentedChannels: Object.freeze({ alipay: "1917", wechat_pay: "1923" }),
  requestEncoding: "application/x-www-form-urlencoded; charset=utf-8",
  createOrigin: "https://www.xsd8866.com",
  createPath: "/api/gaia/unifiedorder",
  queryPath: "/api/gaia/query",
  callbackVerification: "unverified",
  acknowledgement: "unverified",
});

const CREATE_FIELDS = Object.freeze([
  "attach", "body", "format", "mch_create_ip", "mch_id", "notify_url",
  "out_trade_no", "return_url", "service", "sign", "total_fee",
]);
const QUERY_FIELDS = Object.freeze(["attach", "format", "mch_id", "out_trade_no", "sign"]);
const EXCLUDED_FIELDS = new Set(["sign", "format", "attach"]);
const SAFE_ORDER_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CANONICAL_VALUE_DELIMITER = /[&=]/u;
const SYNTHETIC_SECRET = "synthetic_secret";
const SYNTHETIC_CANONICAL_TEXTS = Object.freeze([
  "mch_create_ip=203.0.113.10&mch_id=merchant_demo&out_trade_no=order_demo_1&total_fee=1200",
  "mch_id=merchant_demo&out_trade_no=order_demo_1",
]);

function candidateError(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  try {
    return value !== null
      && typeof value === "object"
      && !utilTypes.isProxy(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function snapshotFields(value, allowedFields) {
  if (!isPlainObject(value)) throw candidateError("invalid_documented_payment_candidate");

  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw candidateError("invalid_documented_payment_candidate");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowedFields.includes(key))) {
    throw candidateError("invalid_documented_payment_candidate");
  }

  const snapshot = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
      || typeof descriptor.value !== "string"
      || CANONICAL_VALUE_DELIMITER.test(descriptor.value)
    ) throw candidateError("invalid_documented_payment_candidate");
    snapshot[key] = descriptor.value;
  }
  try {
    structuredClone(value);
  } catch {
    throw candidateError("invalid_documented_payment_candidate");
  }
  if (
    Object.hasOwn(snapshot, "out_trade_no")
    && !SAFE_ORDER_REFERENCE.test(snapshot.out_trade_no)
  ) throw candidateError("invalid_documented_payment_candidate");
  return snapshot;
}

function canonicalize(fields, allowedFields) {
  const snapshot = snapshotFields(fields, allowedFields);
  const keys = Object.keys(snapshot)
    .filter((key) => snapshot[key] !== "" && !EXCLUDED_FIELDS.has(key))
    .sort();
  return keys.map((key) => `${key}=${snapshot[key]}`).join("&");
}

function isSyntheticCanonicalText(value) {
  return SYNTHETIC_CANONICAL_TEXTS.includes(value);
}

function snapshotDigestInput(value) {
  if (!isPlainObject(value)) throw candidateError("provider_contract_unverified");
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw candidateError("provider_contract_unverified");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 2
    || keys.some((key) => typeof key !== "string" || !["canonicalText", "syntheticSecret"].includes(key))
  ) throw candidateError("provider_contract_unverified");
  const snapshot = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true || typeof descriptor.value !== "string") {
      throw candidateError("provider_contract_unverified");
    }
    snapshot[key] = descriptor.value;
  }
  try {
    structuredClone(value);
  } catch {
    throw candidateError("provider_contract_unverified");
  }
  if (
    snapshot.canonicalText === ""
    || snapshot.syntheticSecret !== SYNTHETIC_SECRET
    || !isSyntheticCanonicalText(snapshot.canonicalText)
  ) {
    throw candidateError("provider_contract_unverified");
  }
  return snapshot;
}

export function canonicalizeXsdCreateSigningCandidate(fields) {
  return canonicalize(fields, CREATE_FIELDS);
}

export function canonicalizeXsdQuerySigningCandidate(fields) {
  return canonicalize(fields, QUERY_FIELDS);
}

export function digestXsdSigningCandidate(value) {
  const { canonicalText, syntheticSecret } = snapshotDigestInput(value);
  return createHash("md5").update(`${canonicalText}${syntheticSecret}`, "utf8").digest("hex");
}
