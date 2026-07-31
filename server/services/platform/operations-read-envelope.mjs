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
const DATE_GET_TIME = Date.prototype.getTime;
const DATE_TO_ISO_STRING = Date.prototype.toISOString;

function operationsReadContractError() {
  const error = new Error("Operations read contract is invalid");
  Object.defineProperty(error, "code", {
    value: "operations_read_contract_error",
    enumerable: true,
    configurable: true,
    writable: true
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
    const clone = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw operationsReadContractError();
      }
      Object.defineProperty(clone, index, {
        value: cloneDataValue(value[index], ancestors),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    ancestors.delete(value);
    return clone;
  }

  if (!isPlainObject(value) || ancestors.has(value)) {
    throw operationsReadContractError();
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      typeof key !== "string"
      || UNSAFE_DATA_KEYS.has(key)
      || descriptor.enumerable !== true
      || !Object.hasOwn(descriptor, "value")
    ) {
      throw operationsReadContractError();
    }
  }

  ancestors.add(value);
  const clone = {};
  for (const key of keys) {
    Object.defineProperty(clone, key, {
      value: cloneDataValue(descriptors[key].value, ancestors),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  ancestors.delete(value);
  return clone;
}

function requiredOwnDataValue(descriptors, key) {
  if (!Object.hasOwn(descriptors, key)) {
    throw operationsReadContractError();
  }
  const descriptor = descriptors[key];
  if (!Object.hasOwn(descriptor, "value")) {
    throw operationsReadContractError();
  }
  return descriptor.value;
}

export function createOperationsReadEnvelope(input = {}, options = {}) {
  try {
    if (!isPlainObject(input) || !isPlainObject(options)) {
      throw operationsReadContractError();
    }

    const inputDescriptors = Object.getOwnPropertyDescriptors(input);
    const schemaVersion = requiredOwnDataValue(
      inputDescriptors,
      "schemaVersion"
    );
    const freshness = requiredOwnDataValue(inputDescriptors, "freshness");
    const sourceState = requiredOwnDataValue(inputDescriptors, "sourceState");
    const data = requiredOwnDataValue(inputDescriptors, "data");
    const warnings = requiredOwnDataValue(inputDescriptors, "warnings");
    const access = requiredOwnDataValue(inputDescriptors, "access");
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
      || !isPlainObject(data)
      || !Array.isArray(warnings)
      || !isPlainObject(access)
      || typeof nowFn !== "function"
    ) {
      throw operationsReadContractError();
    }

    const warningSnapshots = [];
    for (let index = 0; index < warnings.length; index += 1) {
      if (!Object.hasOwn(warnings, index)) {
        throw operationsReadContractError();
      }
      const warning = warnings[index];
      const keys = isPlainObject(warning) ? Reflect.ownKeys(warning) : [];
      if (keys.length !== 1 || keys[0] !== "code") {
        throw operationsReadContractError();
      }
      const code = warning.code;
      if (!WARNING_CODES.has(code)) {
        throw operationsReadContractError();
      }
      Object.defineProperty(warningSnapshots, index, {
        value: { code },
        enumerable: true,
        configurable: true,
        writable: true
      });
    }

    const accessDescriptors = Object.getOwnPropertyDescriptors(access);
    const accessAllowed = requiredOwnDataValue(accessDescriptors, "allowed");
    const accessCapability = requiredOwnDataValue(
      accessDescriptors,
      "capability"
    );
    const accessReasonCode = requiredOwnDataValue(
      accessDescriptors,
      "reasonCode"
    );
    if (
      accessAllowed !== true
      || typeof accessCapability !== "string"
      || !accessCapability
      || accessReasonCode !== "allowed"
    ) {
      throw operationsReadContractError();
    }

    const now = nowFn();
    const timestamp = now instanceof Date
      ? DATE_GET_TIME.call(now)
      : Number.NaN;
    if (!Number.isFinite(timestamp)) {
      throw operationsReadContractError();
    }

    return {
      schemaVersion,
      generatedAt: DATE_TO_ISO_STRING.call(new Date(timestamp)),
      freshness,
      sourceState,
      data: cloneDataValue(data),
      warnings: warningSnapshots,
      access: {
        allowed: accessAllowed,
        capability: accessCapability,
        reasonCode: accessReasonCode
      }
    };
  } catch {
    throw operationsReadContractError();
  }
}
