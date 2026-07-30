const FRESHNESS_VALUES = new Set(["fresh", "stale", "partial", "unknown"]);
const SOURCE_STATE_VALUES = new Set([
  "implemented_source",
  "source_not_deployed",
  "production_unknown"
]);
const WARNING_CODES = new Set([
  "source_stale",
  "source_partial",
  "source_unavailable"
]);
const SCHEMA_VERSION_PATTERN = /^[a-z][a-z0-9-]*\/v[1-9][0-9]*$/;
const UNSAFE_DATA_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  error.code = "operations_read_contract_error";
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

function cloneDataValue(value, ancestors = new Set()) {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw operationsReadContractError();
    }
    ancestors.add(value);
    const clone = value.map((item) => cloneDataValue(item, ancestors));
    ancestors.delete(value);
    return clone;
  }

  if (!isPlainObject(value) || ancestors.has(value)) {
    throw operationsReadContractError();
  }

  ancestors.add(value);
  const clone = {};
  for (const key of Object.keys(value)) {
    if (UNSAFE_DATA_KEYS.has(key)) {
      throw operationsReadContractError();
    }
    Object.defineProperty(clone, key, {
      value: cloneDataValue(value[key], ancestors),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  ancestors.delete(value);
  return clone;
}

export function createOperationsReadEnvelope(input = {}, options = {}) {
  try {
    if (!isPlainObject(input) || !isPlainObject(options)) {
      throw operationsReadContractError();
    }

    const schemaVersion = input.schemaVersion;
    const freshness = input.freshness;
    const sourceState = input.sourceState;
    const warnings = input.warnings;
    const access = input.access;
    const nowFn = Object.hasOwn(options, "nowFn")
      ? options.nowFn
      : () => new Date();

    if (
      typeof schemaVersion !== "string"
      || typeof freshness !== "string"
      || typeof sourceState !== "string"
      || !SCHEMA_VERSION_PATTERN.test(schemaVersion)
      || !FRESHNESS_VALUES.has(freshness)
      || !SOURCE_STATE_VALUES.has(sourceState)
      || !isPlainObject(input.data)
      || !Array.isArray(warnings)
      || !warnings.every((warning) => (
        isPlainObject(warning)
        && Object.keys(warning).length === 1
        && WARNING_CODES.has(warning.code)
      ))
      || !isPlainObject(access)
      || access.allowed !== true
      || typeof access.capability !== "string"
      || !access.capability
      || access.reasonCode !== "allowed"
      || typeof nowFn !== "function"
    ) {
      throw operationsReadContractError();
    }

    const now = nowFn();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw operationsReadContractError();
    }

    return {
      schemaVersion,
      generatedAt: now.toISOString(),
      freshness,
      sourceState,
      data: cloneDataValue(input.data),
      warnings: warnings.map((warning) => ({ code: warning.code })),
      access: {
        allowed: true,
        capability: access.capability,
        reasonCode: "allowed"
      }
    };
  } catch {
    throw operationsReadContractError();
  }
}
