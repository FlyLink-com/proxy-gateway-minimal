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

export function createOperationsReadEnvelope(input = {}, options = {}) {
  try {
    if (!isPlainObject(input) || !isPlainObject(options)) {
      throw operationsReadContractError();
    }

    const schemaVersion = String(input.schemaVersion || "");
    const freshness = String(input.freshness || "");
    const sourceState = String(input.sourceState || "");
    const warnings = input.warnings;
    const access = input.access;
    const nowFn = options.nowFn || (() => new Date());

    if (
      !SCHEMA_VERSION_PATTERN.test(schemaVersion)
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
      data: { ...input.data },
      warnings: warnings.map((warning) => ({ code: warning.code })),
      access: {
        allowed: true,
        capability: access.capability,
        reasonCode: "allowed"
      }
    };
  } catch (error) {
    if (error?.code === "operations_read_contract_error") {
      throw error;
    }
    throw operationsReadContractError();
  }
}
