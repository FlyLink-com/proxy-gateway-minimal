import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COIN_WALLET_REFERENCE_INDEX_MIGRATIONS,
  REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
  applyCoinWalletReferenceIndexMigrations,
  dryRunCoinWalletReferenceIndexMigrations,
  validateCoinWalletReferenceIndexSchema
} from "../server/services/platform/coin-wallet-reference-index-migrations.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const DDL_CHECKSUM =
  COIN_WALLET_REFERENCE_INDEX_MIGRATIONS[0].ddlChecksum;
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply"]);
const SAFE_REASON_CODES = new Set([
  "apply_confirmation_required",
  "applied_schema_incompatible",
  "argument_not_allowed_for_mode",
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_path_must_be_absolute",
  "database_path_required",
  "database_unavailable",
  "duplicate_argument",
  "empty_argument",
  "foreign_key_check_failed",
  "invalid_mode",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
  "migration_ledger_incompatible",
  "mode_required",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "quick_check_failed",
  "required_migration_missing",
  "source_changed_during_dry_run",
  "temp_root_must_be_absolute",
  "unexpected_execution_failure",
  "unknown_argument"
]);
const CONTRACT_REASON_CODES = new Set([
  "apply_confirmation_required",
  "argument_not_allowed_for_mode",
  "database_path_must_be_absolute",
  "database_path_required",
  "duplicate_argument",
  "empty_argument",
  "invalid_mode",
  "migration_checksum_mismatch",
  "migration_id_mismatch",
  "mode_required",
  "temp_root_must_be_absolute",
  "unknown_argument"
]);
const INFRASTRUCTURE_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_unavailable",
  "source_changed_during_dry_run"
]);
const OPERATION_REASON_CODES = new Set([
  "applied_schema_incompatible",
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable",
  "foreign_key_check_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
  "migration_ledger_incompatible",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "quick_check_failed",
  "required_migration_missing",
  "source_changed_during_dry_run"
]);
const DEFAULT_OPERATIONS = Object.freeze({
  validateCoinWalletReferenceIndexSchema,
  dryRunCoinWalletReferenceIndexMigrations,
  applyCoinWalletReferenceIndexMigrations
});
const CONTRACT_ERRORS = new WeakSet();

function contractError(reasonCode, mode = null) {
  const error = new Error("Wallet reference-index CLI contract rejected");
  CONTRACT_ERRORS.add(error);
  error.reasonCode = reasonCode;
  error.mode = mode;
  return error;
}

function isFullyQualifiedPath(value) {
  if (typeof value !== "string" || !isAbsolute(value)) return false;
  if (process.platform !== "win32") return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  const unc = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)(?:[\\/]|$)/.exec(value);
  if (!unc) return false;
  const [, server, share] = unc;
  if ([".", "..", "?"].includes(server) || [".", ".."].includes(share)) {
    return false;
  }
  return !/[<>:"|?*]/.test(server) && !/[<>:"|?*]/.test(share);
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw contractError("unknown_argument");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (typeof flag !== "string" || !FLAGS.has(flag)) {
      throw contractError("unknown_argument");
    }
    if (values.has(flag)) throw contractError("duplicate_argument");
    let value;
    try {
      value = argv[index + 1];
    } catch {
      throw contractError("unknown_argument");
    }
    if (
      index + 1 >= argv.length
      || FLAGS.has(value)
      || typeof value !== "string"
      || value.length === 0
    ) {
      throw contractError("empty_argument");
    }
    values.set(flag, value);
  }

  const mode = values.get("--mode") ?? null;
  if (!mode) throw contractError("mode_required");
  if (!MODES.has(mode)) throw contractError("invalid_mode");
  const dbPath = values.get("--db-path");
  if (!dbPath) throw contractError("database_path_required", mode);
  if (!isFullyQualifiedPath(dbPath)) {
    throw contractError("database_path_must_be_absolute", mode);
  }

  const tempRoot = values.get("--temp-root");
  const expectedMigrationId = values.get("--confirm-migration-id");
  const expectedDdlChecksum = values.get("--confirm-ddl-checksum");
  if (tempRoot !== undefined && !isFullyQualifiedPath(tempRoot)) {
    throw contractError("temp_root_must_be_absolute", mode);
  }
  if (mode !== "dry-run" && tempRoot !== undefined) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (
    mode !== "apply"
    && (
      expectedMigrationId !== undefined
      || expectedDdlChecksum !== undefined
    )
  ) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (
    mode === "apply"
    && (
      expectedMigrationId === undefined
      || expectedDdlChecksum === undefined
    )
  ) {
    throw contractError("apply_confirmation_required", mode);
  }
  if (
    mode === "apply"
    && expectedMigrationId
      !== REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
  ) {
    throw contractError("migration_id_mismatch", mode);
  }
  if (mode === "apply" && expectedDdlChecksum !== DDL_CHECKSUM) {
    throw contractError("migration_checksum_mismatch", mode);
  }

  return {
    mode,
    dbPath,
    tempRoot,
    expectedMigrationId,
    expectedDdlChecksum
  };
}

function safeFilteredArray(value, predicate) {
  try {
    if (!Array.isArray(value)) return [];
    return value.filter(predicate);
  } catch {
    return [];
  }
}

function safeCheck(checks, key) {
  try {
    return checks !== null
      && typeof checks === "object"
      && checks[key] === true;
  } catch {
    return false;
  }
}

function closedOutput({
  ok = false,
  mode = null,
  schemaState = "blocked",
  sourceChanged = false,
  checks = {},
  reasonCodes = [],
  appliedMigrationIds = [],
  pendingMigrationIds = []
} = {}) {
  const safeSchemaState = new Set(["ready", "pending", "blocked"])
    .has(schemaState)
    ? schemaState
    : "blocked";
  return {
    ok: ok === true,
    mode: MODES.has(mode) ? mode : null,
    schemaState: safeSchemaState,
    requiredMigrationId:
      REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    checks: {
      foundationDependency: safeCheck(checks, "foundationDependency"),
      schemaExact: safeCheck(checks, "schemaExact"),
      quickCheck: safeCheck(checks, "quickCheck"),
      foreignKeys: safeCheck(checks, "foreignKeys")
    },
    reasonCodes: safeFilteredArray(
      reasonCodes,
      (code) => SAFE_REASON_CODES.has(code)
    ),
    appliedMigrationIds: safeFilteredArray(
      appliedMigrationIds,
      (id) => id === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    ),
    pendingMigrationIds: safeFilteredArray(
      pendingMigrationIds,
      (id) => id === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
    )
  };
}

function contractOutcome(reasonCode, mode) {
  return {
    exitCode: EXIT_CONTRACT_REJECTED,
    output: closedOutput({
      mode,
      reasonCodes: [reasonCode]
    })
  };
}

function unexpectedExecutionOutcome(mode = null) {
  return {
    exitCode: EXIT_INFRASTRUCTURE_FAILURE,
    output: closedOutput({
      mode,
      reasonCodes: ["unexpected_execution_failure"]
    })
  };
}

function readArray(result, key, { optional = false } = {}) {
  const value = result[key];
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new Error("invalid result");
  return [...value];
}

function readChecks(result) {
  const checks = result.checks;
  if (checks === null || typeof checks !== "object" || Array.isArray(checks)) {
    throw new Error("invalid checks");
  }
  const snapshot = {};
  for (const key of [
    "foundationDependency",
    "schemaExact",
    "quickCheck",
    "foreignKeys"
  ]) {
    const value = checks[key];
    if (typeof value !== "boolean") throw new Error("invalid check");
    snapshot[key] = value;
  }
  return snapshot;
}

function readOperationResult(result, { target = false } = {}) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("invalid result");
  }
  const ok = result.ok;
  const schemaState = result.schemaState;
  const requiredMigrationId = result.requiredMigrationId;
  const sourceChanged = result.sourceChanged;
  if (typeof ok !== "boolean") throw new Error("invalid ok");
  if (!new Set(["ready", "pending", "blocked"]).has(schemaState)) {
    throw new Error("invalid schema state");
  }
  if (
    requiredMigrationId
    !== REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
  ) {
    throw new Error("invalid migration identity");
  }
  if (target && typeof sourceChanged !== "boolean") {
    throw new Error("invalid source state");
  }
  if (!target && sourceChanged !== undefined && typeof sourceChanged !== "boolean") {
    throw new Error("invalid source state");
  }
  const reasonCodes = readArray(result, "reasonCodes");
  if (
    !reasonCodes.every(
      (code) => typeof code === "string" && OPERATION_REASON_CODES.has(code)
    )
  ) {
    throw new Error("unsafe result reason");
  }
  const pendingMigrationIds = readArray(result, "pendingMigrationIds");
  const appliedMigrationIds = readArray(
    result,
    "appliedMigrationIds",
    { optional: !target }
  );
  return {
    ok,
    schemaState,
    sourceChanged: sourceChanged === true,
    checks: readChecks(result),
    reasonCodes,
    appliedMigrationIds,
    pendingMigrationIds
  };
}

function checksAreExactReady(checks) {
  return checks.foundationDependency
    && checks.schemaExact
    && checks.quickCheck
    && checks.foreignKeys;
}

function isExactReady(validation) {
  return validation.ok
    && validation.schemaState === "ready"
    && checksAreExactReady(validation.checks)
    && validation.reasonCodes.length === 0
    && validation.pendingMigrationIds.length === 0;
}

function isExactPending(validation) {
  return !validation.ok
    && validation.schemaState === "pending"
    && validation.checks.foundationDependency
    && !validation.checks.schemaExact
    && validation.checks.quickCheck
    && validation.checks.foreignKeys
    && validation.reasonCodes.length === 1
    && validation.reasonCodes[0] === "required_migration_missing"
    && validation.pendingMigrationIds.length === 1
    && validation.pendingMigrationIds[0]
      === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID;
}

function hasInfrastructureReason(result) {
  return result.reasonCodes.some(
    (code) => INFRASTRUCTURE_REASON_CODES.has(code)
  );
}

function validationOutcome(validation, mode) {
  const exactReady = isExactReady(validation);
  const exactPending = isExactPending(validation);
  if (
    exactReady
    || exactPending
    || (
      !validation.ok
      && validation.schemaState === "blocked"
      && validation.reasonCodes.length > 0
    )
  ) {
    return {
      exitCode: exactReady
        ? EXIT_SUCCESS
        : hasInfrastructureReason(validation)
          ? EXIT_INFRASTRUCTURE_FAILURE
          : EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        ...validation,
        mode,
        sourceChanged: false,
        appliedMigrationIds: []
      }),
      mayContinue: exactReady || exactPending
    };
  }
  if (!validation.ok && validation.schemaState === "pending") {
    return {
      exitCode: EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        ...validation,
        mode,
        sourceChanged: false,
        appliedMigrationIds: []
      }),
      mayContinue: false
    };
  }
  return unexpectedExecutionOutcome(mode);
}

function knownFailureOutcome(reasonCode, mode) {
  const exitCode = INFRASTRUCTURE_REASON_CODES.has(reasonCode)
    ? EXIT_INFRASTRUCTURE_FAILURE
    : EXIT_SCHEMA_REJECTED;
  return {
    exitCode,
    output: closedOutput({
      mode,
      reasonCodes: [reasonCode],
      sourceChanged: false,
      appliedMigrationIds: []
    })
  };
}

function safeErrorCode(error) {
  try {
    return typeof error?.code === "string" ? error.code : null;
  } catch {
    return null;
  }
}

function operationErrorOutcome(error, mode) {
  const code = safeErrorCode(error);
  if (
    typeof code === "string"
    && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(code)
  ) {
    return knownFailureOutcome("database_unavailable", mode);
  }
  if (OPERATION_REASON_CODES.has(code)) {
    return knownFailureOutcome(code, mode);
  }
  return unexpectedExecutionOutcome(mode);
}

function targetOutcome(result, mode) {
  if (
    result.ok
    && result.schemaState === "ready"
    && checksAreExactReady(result.checks)
    && result.reasonCodes.length === 0
  ) {
    const applied = result.appliedMigrationIds;
    const pending = result.pendingMigrationIds;
    const appliedIsExact = (
      applied.length === 0
      || (
        applied.length === 1
        && applied[0]
          === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
      )
    );
    const pendingIsExact = (
      pending.length === 0
      || (
        pending.length === 1
        && pending[0]
          === REQUIRED_COIN_WALLET_REFERENCE_INDEX_MIGRATION_ID
      )
    );
    const sourceStateIsExact = mode === "dry-run"
      ? !result.sourceChanged
      : result.sourceChanged === (applied.length === 1);
    const dryRunListsAgree = mode !== "dry-run"
      || (
        applied.length === pending.length
        && applied.every((id, index) => id === pending[index])
      );
    const applyHasNoPending = mode !== "apply" || pending.length === 0;
    if (
      appliedIsExact
      && pendingIsExact
      && sourceStateIsExact
      && dryRunListsAgree
      && applyHasNoPending
    ) {
      return {
        exitCode: EXIT_SUCCESS,
        output: closedOutput({
          ...result,
          mode
        })
      };
    }
    return unexpectedExecutionOutcome(mode);
  }
  if (
    !result.ok
    && result.schemaState === "blocked"
    && result.reasonCodes.length > 0
  ) {
    if (result.reasonCodes.some((code) => INFRASTRUCTURE_REASON_CODES.has(code))) {
      return {
        exitCode: EXIT_INFRASTRUCTURE_FAILURE,
        output: closedOutput({
          ...result,
          mode,
          sourceChanged: false,
          appliedMigrationIds: []
        })
      };
    }
    return {
      exitCode: EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        ...result,
        mode,
        sourceChanged: false,
        appliedMigrationIds: []
      })
    };
  }
  return unexpectedExecutionOutcome(mode);
}

function operationFrom(operations, name) {
  if (
    operations === null
    || (typeof operations !== "object" && typeof operations !== "function")
  ) {
    throw new Error("invalid operations");
  }
  const operation = operations[name];
  if (typeof operation !== "function") throw new Error("invalid operation");
  return operation;
}

async function executeParsedOperation(parsed, operations) {
  let validation;
  try {
    const validate = operationFrom(
      operations,
      "validateCoinWalletReferenceIndexSchema"
    );
    validation = readOperationResult(
      await validate({ dbPath: parsed.dbPath })
    );
  } catch (error) {
    return operationErrorOutcome(error, parsed.mode);
  }
  const preflight = validationOutcome(validation, parsed.mode);
  if (parsed.mode === "validate" || preflight.mayContinue !== true) {
    return {
      exitCode: preflight.exitCode,
      output: preflight.output
    };
  }

  try {
    const rawResult = await (parsed.mode === "dry-run"
      ? operationFrom(
        operations,
        "dryRunCoinWalletReferenceIndexMigrations"
      )({
        dbPath: parsed.dbPath,
        tempRoot: parsed.tempRoot
      })
      : operationFrom(
        operations,
        "applyCoinWalletReferenceIndexMigrations"
      )({
        dbPath: parsed.dbPath,
        expectedMigrationId: parsed.expectedMigrationId,
        expectedDdlChecksum: parsed.expectedDdlChecksum
      }));
    return targetOutcome(
      readOperationResult(rawResult, { target: true }),
      parsed.mode
    );
  } catch (error) {
    return operationErrorOutcome(error, parsed.mode);
  }
}

export async function runCoinWalletReferenceIndexSchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    return CONTRACT_ERRORS.has(error)
      && CONTRACT_REASON_CODES.has(error.reasonCode)
      ? contractOutcome(error.reasonCode, error.mode)
      : unexpectedExecutionOutcome();
  }

  try {
    return await executeParsedOperation(parsed, operations);
  } catch {
    return unexpectedExecutionOutcome(parsed.mode);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runCoinWalletReferenceIndexSchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
