const COUNT_FIELDS = Object.freeze([
  "total",
  "active",
  "expiring",
  "disabledOrExpired"
]);

function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  error.code = "operations_read_contract_error";
  return error;
}

export function projectOperationsOverviewReadModel(input = {}) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw operationsReadContractError();
  }

  const projected = {};
  for (const field of COUNT_FIELDS) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 0) {
      throw operationsReadContractError();
    }
    projected[field] = value;
  }
  return projected;
}
