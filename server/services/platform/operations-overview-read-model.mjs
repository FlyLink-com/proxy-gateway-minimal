function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  error.code = "operations_read_contract_error";
  return error;
}

function validatedCount(input, field) {
  const value = input[field];
  if (!Number.isInteger(value) || value < 0) {
    throw operationsReadContractError();
  }
  return value;
}

export function projectOperationsOverviewReadModel(input = {}) {
  try {
    if (
      !input
      || typeof input !== "object"
      || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype
    ) {
      throw operationsReadContractError();
    }

    const total = validatedCount(input, "total");
    const active = validatedCount(input, "active");
    const expiring = validatedCount(input, "expiring");
    const disabledOrExpired = validatedCount(input, "disabledOrExpired");

    return { total, active, expiring, disabledOrExpired };
  } catch {
    throw operationsReadContractError();
  }
}
