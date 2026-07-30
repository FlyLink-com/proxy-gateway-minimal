import assert from "node:assert/strict";
import test from "node:test";
import {
  createCoinCommerceFulfillmentReconciliationError,
  createCoinCommerceFulfillmentRetryableError,
  isCoinCommerceFulfillmentReconciliationError,
  isCoinCommerceFulfillmentRetryableError
} from "../services/platform/coin-commerce-fulfillment-retry.mjs";

test("coin commerce fulfillment retry classifier accepts only errors created by its factory", () => {
  const retryable = createCoinCommerceFulfillmentRetryableError();

  assert.equal(isCoinCommerceFulfillmentRetryableError(retryable), true);
  assert.equal(isCoinCommerceFulfillmentRetryableError(new Error(retryable.message)), false);
  assert.equal(isCoinCommerceFulfillmentRetryableError({
    name: retryable.name,
    code: retryable.code,
    retryable: true
  }), false);
});

test("coin commerce fulfillment retry factory exposes only stable public metadata", () => {
  const retryable = createCoinCommerceFulfillmentRetryableError();

  assert.deepEqual(
    Object.fromEntries(Object.entries(retryable)),
    { code: "coin_commerce_fulfillment_retryable" }
  );
  assert.equal("cause" in retryable, false);
  assert.equal("details" in retryable, false);
});

test("coin commerce fulfillment reconciliation classifier is branded and exposes only stable public metadata", () => {
  const reconciliation = createCoinCommerceFulfillmentReconciliationError();

  assert.equal(
    isCoinCommerceFulfillmentReconciliationError(reconciliation),
    true
  );
  assert.equal(isCoinCommerceFulfillmentRetryableError(reconciliation), false);
  assert.equal(
    isCoinCommerceFulfillmentReconciliationError({
      code: reconciliation.code,
      reconciliation: true
    }),
    false
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(reconciliation)),
    { code: "coin_commerce_fulfillment_reconciliation_required" }
  );
  assert.equal("cause" in reconciliation, false);
  assert.equal("details" in reconciliation, false);
});
