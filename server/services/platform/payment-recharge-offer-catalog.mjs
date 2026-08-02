import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

const OFFER_FIELDS = Object.freeze([
  "offerRef",
  "quoteVersion",
  "paidCoinUnits",
  "amountMinor",
  "currency",
  "currencyExponent",
  "enabled",
]);
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BRANDED_OFFERS = new WeakSet();

function catalogError() {
  const error = new Error("invalid_payment_recharge_catalog");
  error.code = "invalid_payment_recharge_catalog";
  throw error;
}

function snapshotExact(value, fields) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    catalogError();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))
    || fields.some((field) => !Object.hasOwn(descriptors, field))
  ) {
    catalogError();
  }
  return Object.fromEntries(fields.map((field) => {
    const descriptor = descriptors[field];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      catalogError();
    }
    return [field, descriptor.value];
  }));
}

function positiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    catalogError();
  }
  return value;
}

function normalizeOffer(value, environment) {
  const input = snapshotExact(value, OFFER_FIELDS);
  if (
    typeof input.offerRef !== "string"
    || !SAFE_REF_RE.test(input.offerRef)
    || typeof input.enabled !== "boolean"
    || (environment === "sandbox"
      && (input.currency !== "USD" || input.currencyExponent !== 2))
    || (environment === "production"
      && (input.currency !== "CNY" || input.currencyExponent !== 2))
  ) {
    catalogError();
  }
  const canonical = {
    offerRef: input.offerRef,
    quoteVersion: positiveInteger(input.quoteVersion),
    paidCoinUnits: positiveInteger(input.paidCoinUnits),
    amountMinor: positiveInteger(input.amountMinor),
    currency: input.currency,
    currencyExponent: input.currencyExponent,
    environment,
  };
  const quoteDigest = createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
  const offer = Object.freeze({ ...canonical, quoteDigest });
  BRANDED_OFFERS.add(offer);
  return Object.freeze({ offer, enabled: input.enabled });
}

export function assertPaymentRechargeOffer(value) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || !Object.isFrozen(value)
    || !BRANDED_OFFERS.has(value)
  ) {
    catalogError();
  }
  return value;
}

export function createPaymentRechargeOfferCatalog(options = {}) {
  const input = snapshotExact(options, ["environment", "offers"]);
  if (
    (input.environment !== "sandbox" && input.environment !== "production")
    || !Array.isArray(input.offers)
    || utilTypes.isProxy(input.offers)
  ) {
    catalogError();
  }
  const records = input.offers.map((offer) => normalizeOffer(
    offer,
    input.environment,
  ));
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.offer.offerRef)) catalogError();
    seen.add(record.offer.offerRef);
  }
  const enabled = new Map(records
    .filter((record) => record.enabled)
    .map((record) => [record.offer.offerRef, record.offer]));
  return Object.freeze({
    listOffers() {
      return Object.freeze([...enabled.values()]);
    },
    getOffer(offerRef) {
      if (typeof offerRef !== "string" || !SAFE_REF_RE.test(offerRef)) {
        catalogError();
      }
      return enabled.get(offerRef) ?? null;
    },
  });
}
