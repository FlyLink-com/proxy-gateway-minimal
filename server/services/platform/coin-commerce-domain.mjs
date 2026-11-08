import { createHash } from "node:crypto";
import { normalizeAcceptedCoinTypes } from "./coin-wallet-domain.mjs";

export const COIN_COMMERCE_CONTRACT_VERSION = "coin-commerce/v1";
export const DEFAULT_COIN_COMMERCE_CANCEL_WINDOW_MS = 3_000;
export const DEFAULT_COIN_COMMERCE_HOLD_RECOVERY_GRACE_MS = 24 * 60 * 60 * 1_000;

const COMMERCE_REFERENCE = /^[a-z][a-z0-9_]{2,95}$/;
const OFFER_FIELDS = [
  "offerRef", "offerVersionRef", "version", "category", "title", "summary",
  "importantNotices", "baseCoinUnits", "referencePrice", "acceptedCoinTypes", "delivery"
];
const MAX_IMPORTANT_NOTICES_PER_LOCALE = 8;
const MAX_IMPORTANT_NOTICE_UTF8_BYTES = 512;
const NOTICE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const NOTICE_URL_OR_MARKUP_PATTERN = /(?:\b(?:https?|ftp):\/\/|(?:^|\s)www\.|mailto:|javascript:)|<\/?[a-z][^>]*>/i;
const NOTICE_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const NOTICE_PHONE_PATTERN = /(?=(?:\D*\d){10,})\+?\d[\d\s().-]{8,}\d/;
const NOTICE_IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const NOTICE_SECRET_PATTERN = /(?:\bbearer\s+[A-Za-z0-9._~+/-]{12,}|\b(?:api[_-]?key|token|secret|password)\s*[:=]|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16})\b|\b[a-f0-9]{64}\b)/i;
const DELIVERY_FIELDS = [
  "kind", "durationDays", "monthlyTrafficGb", "trafficGb", "neverExpires", "discountBasisPoints"
];
const OPERATION_NORMALIZERS = new Map([
  ["publish_offer", normalizeCoinCommerceOffer],
  ["create_quote", normalizeCheckoutQuoteRequest],
  ["confirm_order", normalizeConfirmOrderRequest],
  ["cancel_order", normalizeCancelOrderRequest],
  ["claim_capture", normalizeOrderReferenceRequest],
  ["capture_order", normalizeOrderReferenceRequest],
  ["fulfillment_result", normalizeFulfillmentResult]
]);

function commerceError(code, field) {
  const error = new Error("invalid Coin commerce domain input");
  error.code = code;
  error.field = field;
  return error;
}

function assertPlainObject(value, field, code = "invalid_commerce_request") {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw commerceError(code, field);
  }
  return value;
}

function ownValues(input, fields, field, invalidCode = "invalid_commerce_request") {
  const value = assertPlainObject(input, field, invalidCode);
  const expected = new Set(fields);
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !expected.has(key)) {
      throw commerceError("unexpected_commerce_request_field", typeof key === "string" ? key : field);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw commerceError("non_normalized_commerce_request", key);
    }
    result[key] = descriptor.value;
  }
  for (const key of fields) {
    if (!Object.hasOwn(result, key)) throw commerceError(invalidCode, key);
  }
  return result;
}

function assertNormalizedText(value, field, code = "non_normalized_commerce_request") {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw commerceError(code, field);
  }
  return value;
}

function normalizeReference(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw commerceError("non_normalized_commerce_request", field);
  }
  if (!COMMERCE_REFERENCE.test(value)) {
    throw commerceError("invalid_commerce_reference", field);
  }
  return value;
}

function normalizePositiveUnits(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw commerceError("invalid_commerce_units", field);
  return value;
}

function normalizeDiscountBasisPoints(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw commerceError("invalid_commerce_units", field);
  }
  return value;
}

function snapshotPlainArray(input, field, code) {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
      throw commerceError(code, field);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      throw commerceError(code, field);
    }
    const { value: length } = lengthDescriptor;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== length + 1) throw commerceError(code, field);
    const snapshot = new Array(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !("value" in descriptor)) throw commerceError(code, field);
      snapshot[index] = descriptor.value;
    }
    return snapshot;
  } catch {
    throw commerceError(code, field);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function normalizeLocaleMap(input, field) {
  const values = ownValues(input, ["zh", "en"], field, "invalid_commerce_locale");
  return {
    zh: assertNormalizedText(values.zh, `${field}.zh`, "invalid_commerce_locale"),
    en: assertNormalizedText(values.en, `${field}.en`, "invalid_commerce_locale")
  };
}

function assertSafeNoticeText(value, field) {
  const normalized = assertNormalizedText(value, field, "invalid_commerce_locale");
  if (
    Buffer.byteLength(normalized, "utf8") > MAX_IMPORTANT_NOTICE_UTF8_BYTES
    || NOTICE_CONTROL_CHARACTER_PATTERN.test(normalized)
    || NOTICE_URL_OR_MARKUP_PATTERN.test(normalized)
    || NOTICE_EMAIL_PATTERN.test(normalized)
    || NOTICE_PHONE_PATTERN.test(normalized)
    || NOTICE_IP_PATTERN.test(normalized)
    || NOTICE_SECRET_PATTERN.test(normalized)
  ) {
    throw commerceError("invalid_commerce_locale", field);
  }
  return normalized;
}

function normalizeImportantNotices(input) {
  const values = ownValues(input, ["zh", "en"], "importantNotices", "invalid_commerce_locale");
  const normalizeNotices = (notices, locale) => {
    const snapshot = snapshotPlainArray(notices, `importantNotices.${locale}`, "invalid_commerce_locale");
    if (snapshot.length === 0 || snapshot.length > MAX_IMPORTANT_NOTICES_PER_LOCALE) {
      throw commerceError("invalid_commerce_locale", `importantNotices.${locale}`);
    }
    const normalized = [];
    for (let index = 0; index < snapshot.length; index += 1) {
      normalized.push(assertSafeNoticeText(snapshot[index], `importantNotices.${locale}[${index}]`));
    }
    if (new Set(normalized).size !== normalized.length) {
      throw commerceError("invalid_commerce_locale", `importantNotices.${locale}`);
    }
    return Object.freeze(normalized);
  };
  return {
    zh: normalizeNotices(values.zh, "zh"),
    en: normalizeNotices(values.en, "en")
  };
}

function normalizeReferencePrice(input) {
  const values = ownValues(input, ["currency", "amountMinor"], "referencePrice", "invalid_commerce_offer");
  if (values.currency !== "CNY") throw commerceError("invalid_commerce_enum", "referencePrice.currency");
  return { currency: "CNY", amountMinor: normalizePositiveUnits(values.amountMinor, "referencePrice.amountMinor") };
}

function normalizeDelivery(input, category) {
  const values = ownValues(input, DELIVERY_FIELDS, "delivery", "invalid_commerce_delivery");
  if (values.kind === "subscription_plan") {
    if (category !== "plan" || values.trafficGb !== null || values.neverExpires !== false || values.discountBasisPoints === null) {
      throw commerceError("invalid_commerce_delivery", "delivery");
    }
    return {
      kind: "subscription_plan",
      durationDays: normalizePositiveUnits(values.durationDays, "delivery.durationDays"),
      monthlyTrafficGb: normalizePositiveUnits(values.monthlyTrafficGb, "delivery.monthlyTrafficGb"),
      trafficGb: null,
      neverExpires: false,
      discountBasisPoints: normalizeDiscountBasisPoints(values.discountBasisPoints, "delivery.discountBasisPoints")
    };
  }
  if (values.kind === "data_pack") {
    if (category !== "data_pack" || values.durationDays !== null || values.monthlyTrafficGb !== null || values.neverExpires !== true || values.discountBasisPoints !== null) {
      throw commerceError("invalid_commerce_delivery", "delivery");
    }
    return {
      kind: "data_pack",
      durationDays: null,
      monthlyTrafficGb: null,
      trafficGb: normalizePositiveUnits(values.trafficGb, "delivery.trafficGb"),
      neverExpires: true,
      discountBasisPoints: null
    };
  }
  throw commerceError("invalid_commerce_enum", "delivery.kind");
}

export function normalizeCoinCommerceOffer(input) {
  const values = ownValues(input, OFFER_FIELDS, "offer", "invalid_commerce_offer");
  if (values.category !== "plan" && values.category !== "data_pack") {
    throw commerceError("invalid_commerce_enum", "category");
  }
  let acceptedCoinTypes;
  try {
    acceptedCoinTypes = normalizeAcceptedCoinTypes(snapshotPlainArray(values.acceptedCoinTypes, "acceptedCoinTypes", "invalid_commerce_offer"));
  } catch {
    throw commerceError("invalid_commerce_offer", "acceptedCoinTypes");
  }
  return deepFreeze({
    offerRef: normalizeReference(values.offerRef, "offerRef"),
    offerVersionRef: normalizeReference(values.offerVersionRef, "offerVersionRef"),
    version: normalizePositiveUnits(values.version, "version"),
    category: values.category,
    title: normalizeLocaleMap(values.title, "title"),
    summary: normalizeLocaleMap(values.summary, "summary"),
    importantNotices: normalizeImportantNotices(values.importantNotices),
    baseCoinUnits: normalizePositiveUnits(values.baseCoinUnits, "baseCoinUnits"),
    referencePrice: normalizeReferencePrice(values.referencePrice),
    acceptedCoinTypes: [...acceptedCoinTypes],
    delivery: normalizeDelivery(values.delivery, values.category)
  });
}

export function applyCoinDiscount(input) {
  const values = ownValues(input, ["baseCoinUnits", "discountBasisPoints"], "input");
  const baseCoinUnits = normalizePositiveUnits(values.baseCoinUnits, "baseCoinUnits");
  const discountBasisPoints = normalizeDiscountBasisPoints(values.discountBasisPoints, "discountBasisPoints");
  const numerator = BigInt(baseCoinUnits) * BigInt(10_000 - discountBasisPoints);
  return Number((numerator + 9_999n) / 10_000n);
}

function normalizeTwoReferenceRequest(input, fields) {
  const values = ownValues(input, fields, "input");
  return deepFreeze(Object.fromEntries(fields.map((field) => [field, normalizeReference(values[field], field)])));
}

export function normalizeCheckoutQuoteRequest(input) {
  return normalizeTwoReferenceRequest(input, ["accountId", "offerRef"]);
}

export function normalizeConfirmOrderRequest(input) {
  return normalizeTwoReferenceRequest(input, ["accountId", "quoteRef"]);
}

export function normalizeCancelOrderRequest(input) {
  return normalizeTwoReferenceRequest(input, ["accountId", "orderRef"]);
}

function normalizeOrderReferenceRequest(input) {
  const values = ownValues(input, ["orderRef"], "input");
  return deepFreeze({ orderRef: normalizeReference(values.orderRef, "orderRef") });
}

export function normalizeFulfillmentResult(input) {
  const values = ownValues(input, ["status", "effectRef"], "input", "invalid_fulfillment_result");
  if (values.status !== "delivered") throw commerceError("invalid_fulfillment_result", "status");
  return deepFreeze({ status: "delivered", effectRef: normalizeReference(values.effectRef, "effectRef") });
}

export function canonicalCommerceRequestDigest(operationType, input) {
  if (typeof operationType !== "string" || operationType.trim() !== operationType || !OPERATION_NORMALIZERS.has(operationType)) {
    throw commerceError("invalid_commerce_operation", "operationType");
  }
  const normalized = OPERATION_NORMALIZERS.get(operationType)(input);
  return createHash("sha256")
    .update(`GCCWEBOS:COIN_COMMERCE_REQUEST:v1\0${operationType}\0${canonicalJson(normalized)}`, "utf8")
    .digest("hex");
}

export function deriveCommerceOperationRefs(orderRef) {
  const normalizedOrderRef = normalizeReference(orderRef, "orderRef");
  const suffix = createHash("sha256")
    .update(`GCCWEBOS:COIN_COMMERCE_OPERATION_REFS:v1\0${normalizedOrderRef}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return Object.freeze({
    holdOperationRef: `coinop_hold_${suffix}`,
    captureOperationRef: `coinop_capture_${suffix}`,
    releaseOperationRef: `coinop_release_${suffix}`,
    commandRef: `coincmd_${suffix}`,
    recoveryOperationRef: `coinop_recovery_${suffix}`
  });
}
