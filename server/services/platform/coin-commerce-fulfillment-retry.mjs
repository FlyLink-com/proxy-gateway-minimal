const retryableFulfillmentErrors = new WeakSet();
const reconciliationFulfillmentErrors = new WeakSet();

export function createCoinCommerceFulfillmentRetryableError() {
  const error = new Error("Coin Commerce fulfillment is temporarily unavailable");
  error.code = "coin_commerce_fulfillment_retryable";
  retryableFulfillmentErrors.add(error);
  return error;
}

export function isCoinCommerceFulfillmentRetryableError(error) {
  return (
    (typeof error === "object" && error !== null)
    || typeof error === "function"
  ) && retryableFulfillmentErrors.has(error);
}

export function createCoinCommerceFulfillmentReconciliationError() {
  const error = new Error("Coin Commerce fulfillment requires reconciliation");
  error.code = "coin_commerce_fulfillment_reconciliation_required";
  reconciliationFulfillmentErrors.add(error);
  return error;
}

export function isCoinCommerceFulfillmentReconciliationError(error) {
  return (
    (typeof error === "object" && error !== null)
    || typeof error === "function"
  ) && reconciliationFulfillmentErrors.has(error);
}
