import {
  COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS
} from "./coin-commerce-production-catalog.mjs";
import {
  createCoinCommerceProductionSubscriptionFulfillment
} from "./coin-commerce-production-subscription-fulfillment.mjs";
import { startProxyGateway } from "../../start.mjs";
import { types as utilTypes } from "node:util";

const START_OPTION_FIELDS = new Set([
  "app",
  "logger",
  "runtimeOptions"
]);
const FIXED_RUNTIME_OPTION_FIELDS = new Set([
  "coinCommerceCatalog",
  "coinCommerceFulfillmentFactory"
]);

function invalidProductionRuntime() {
  const error = new Error("Coin Commerce production runtime is invalid");
  error.code = "coin_commerce_production_runtime_invalid";
  return error;
}

function snapshotDataObject(value, {
  allowedFields = null,
  ignoredFields = new Set()
} = {}) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalidProductionRuntime();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot = {};
  for (const field of Reflect.ownKeys(descriptors)) {
    if (
      typeof field !== "string"
      || (allowedFields && !allowedFields.has(field))
    ) {
      throw invalidProductionRuntime();
    }
    if (ignoredFields.has(field)) continue;
    const descriptor = descriptors[field];
    if (
      !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw invalidProductionRuntime();
    }
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

export function startProductionProxyGateway(options = {}) {
  const startOptions = snapshotDataObject(options, {
    allowedFields: START_OPTION_FIELDS
  });
  const runtimeOptions = startOptions.runtimeOptions === undefined
    ? {}
    : snapshotDataObject(startOptions.runtimeOptions, {
      ignoredFields: FIXED_RUNTIME_OPTION_FIELDS
    });
  delete startOptions.runtimeOptions;
  return startProxyGateway({
    ...startOptions,
    runtimeOptions: {
      ...runtimeOptions,
      coinCommerceCatalog: COIN_COMMERCE_PRODUCTION_PUBLISHED_OFFERS,
      coinCommerceFulfillmentFactory:
        createCoinCommerceProductionSubscriptionFulfillment
    }
  });
}
