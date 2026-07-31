function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  Object.defineProperty(error, "code", {
    value: "operations_read_contract_error",
    writable: true,
    enumerable: true,
    configurable: true
  });
  return error;
}

function isPlainObject(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function ownDataValue(input, field) {
  const descriptor = Object.getOwnPropertyDescriptor(input, field);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) {
    throw operationsReadContractError();
  }
  return descriptor.value;
}

function validatedCount(counts, field) {
  const value = ownDataValue(counts, field);
  if (!Number.isInteger(value) || value < 0) {
    throw operationsReadContractError();
  }
  return value;
}

export function projectOperationsOverviewReadModel(input = {}) {
  try {
    if (!isPlainObject(input)) {
      throw operationsReadContractError();
    }

    const counts = ownDataValue(input, "counts");
    if (!isPlainObject(counts)) {
      throw operationsReadContractError();
    }

    const total = validatedCount(counts, "total");
    const active = validatedCount(counts, "active");
    const expiring = validatedCount(counts, "expiring");
    const disabledOrExpired = validatedCount(counts, "disabledOrExpired");

    return { total, active, expiring, disabledOrExpired };
  } catch {
    throw operationsReadContractError();
  }
}
