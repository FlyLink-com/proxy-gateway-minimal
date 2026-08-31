// Import-only schema library; executable entrypoints live in dedicated wrappers.
import { isAbsolute } from "node:path";

import {
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS,
  REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
  applyPortalRegistrationWelcomeBonusMigrations,
  dryRunPortalRegistrationWelcomeBonusMigrations,
  validatePortalRegistrationWelcomeBonusSchema
} from "../server/services/platform/portal-registration-welcome-bonus-migrations.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const DDL_CHECKSUM = PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.at(-1).ddlChecksum;
const MIGRATION_IDS = Object.freeze(
  PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATIONS.map(({ id }) => id)
);
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply"]);
const CHECK_KEYS = Object.freeze([
  "foundationDependency",
  "schemaExact",
  "quickCheck",
  "foreignKeys"
]);
const SAFE_REASON_CODES = new Set([
  "apply_confirmation_required",
  "applied_schema_incompatible",
  "argument_not_allowed_for_mode",
  "custody_gate_required",
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
  "custody_gate_required",
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
  validatePortalRegistrationWelcomeBonusSchema,
  dryRunPortalRegistrationWelcomeBonusMigrations,
  applyPortalRegistrationWelcomeBonusMigrations
});
const CONTRACT_ERRORS = new WeakSet();

function contractError(reasonCode, mode = null) {
  const error = new Error("Welcome-bonus schema CLI contract rejected");
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
    const value = argv[index + 1];
    if (
      index + 1 >= argv.length
      || typeof value !== "string"
      || value.length === 0
      || FLAGS.has(value)
    ) {
      throw contractError("empty_argument");
    }
    values.set(flag, value);
  }

  const mode = values.get("--mode") ?? null;
  if (mode === null) throw contractError("mode_required");
  if (!MODES.has(mode)) throw contractError("invalid_mode");
  const dbPath = values.get("--db-path");
  if (dbPath === undefined) throw contractError("database_path_required", mode);
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
    && (expectedMigrationId !== undefined || expectedDdlChecksum !== undefined)
  ) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (
    mode === "apply"
    && (expectedMigrationId === undefined || expectedDdlChecksum === undefined)
  ) {
    throw contractError("apply_confirmation_required", mode);
  }
  if (
    mode === "apply"
    && expectedMigrationId !== REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
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

function safeArray(value, predicate) {
  try {
    return Array.isArray(value) ? value.filter(predicate) : [];
  } catch {
    return [];
  }
}

function safeCheck(checks, key) {
  try {
    return checks !== null && typeof checks === "object" && checks[key] === true;
  } catch {
    return false;
  }
}

function isMigrationSuffix(ids) {
  return Array.isArray(ids)
    && (ids.length === 0 || (
      ids.length <= MIGRATION_IDS.length
      && ids.every((id, index) => id === MIGRATION_IDS[MIGRATION_IDS.length - ids.length + index])
    ));
}

function migrationIdsAreExact(actual, expected) {
  return actual.length === expected.length
    && actual.every((id, index) => id === expected[index]);
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
  return {
    ok: ok === true,
    mode: MODES.has(mode) ? mode : null,
    schemaState: new Set(["ready", "pending", "blocked"]).has(schemaState)
      ? schemaState
      : "blocked",
    requiredMigrationId: REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    checks: Object.fromEntries(CHECK_KEYS.map((key) => [key, safeCheck(checks, key)])),
    reasonCodes: safeArray(reasonCodes, (code) => SAFE_REASON_CODES.has(code)),
    appliedMigrationIds: safeArray(
      appliedMigrationIds,
      (id) => MIGRATION_IDS.includes(id)
    ),
    pendingMigrationIds: safeArray(
      pendingMigrationIds,
      (id) => MIGRATION_IDS.includes(id)
    )
  };
}

function contractOutcome(reasonCode, mode) {
  return {
    exitCode: EXIT_CONTRACT_REJECTED,
    output: closedOutput({ mode, reasonCodes: [reasonCode] })
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

function safeErrorCode(error) {
  try {
    return typeof error?.code === "string" ? error.code : null;
  } catch {
    return null;
  }
}

function readArray(result, key, { optional = false } = {}) {
  const value = result[key];
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new Error("invalid schema result");
  if (!value.every((item) => typeof item === "string")) {
    throw new Error("invalid schema result");
  }
  return [...value];
}

function readChecks(result) {
  const checks = result.checks;
  if (checks === null || typeof checks !== "object" || Array.isArray(checks)) {
    throw new Error("invalid schema result");
  }
  const output = {};
  for (const key of CHECK_KEYS) {
    if (typeof checks[key] !== "boolean") {
      throw new Error("invalid schema result");
    }
    output[key] = checks[key];
  }
  return output;
}

function readResult(result, { target = false } = {}) {
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("invalid schema result");
  }
  if (typeof result.ok !== "boolean") throw new Error("invalid schema result");
  if (!new Set(["ready", "pending", "blocked"]).has(result.schemaState)) {
    throw new Error("invalid schema result");
  }
  if (
    result.requiredMigrationId
    !== REQUIRED_PORTAL_REGISTRATION_WELCOME_BONUS_MIGRATION_ID
  ) {
    throw new Error("invalid schema result");
  }
  if (target && typeof result.sourceChanged !== "boolean") {
    throw new Error("invalid schema result");
  }
  if (!target && result.sourceChanged !== undefined && typeof result.sourceChanged !== "boolean") {
    throw new Error("invalid schema result");
  }
  const reasonCodes = readArray(result, "reasonCodes");
  if (!reasonCodes.every((code) => OPERATION_REASON_CODES.has(code))) {
    throw new Error("invalid schema result");
  }
  const appliedMigrationIds = readArray(result, "appliedMigrationIds", {
    optional: !target
  });
  if (!target && appliedMigrationIds.length !== 0) {
    throw new Error("invalid schema result");
  }
  const pendingMigrationIds = readArray(result, "pendingMigrationIds");
  if (!isMigrationSuffix(appliedMigrationIds) || !isMigrationSuffix(pendingMigrationIds)) {
    throw new Error("invalid schema result");
  }
  return {
    ok: result.ok,
    schemaState: result.schemaState,
    sourceChanged: result.sourceChanged === true,
    checks: readChecks(result),
    reasonCodes,
    appliedMigrationIds,
    pendingMigrationIds
  };
}

function checksAreReady(checks) {
  return CHECK_KEYS.every((key) => checks[key] === true);
}

function hasInfrastructureReason(result) {
  return result.reasonCodes.some((code) => INFRASTRUCTURE_REASON_CODES.has(code));
}

function exactPending(result) {
  return !result.ok
    && result.schemaState === "pending"
    && result.checks.foundationDependency
    && !result.checks.schemaExact
    && result.checks.quickCheck
    && result.checks.foreignKeys
    && result.reasonCodes.length === 1
    && result.reasonCodes[0] === "required_migration_missing"
    && result.pendingMigrationIds.length > 0
    && isMigrationSuffix(result.pendingMigrationIds);
}

function validationOutcome(result, mode) {
  const ready = result.ok
    && result.schemaState === "ready"
    && checksAreReady(result.checks)
    && result.reasonCodes.length === 0
    && result.pendingMigrationIds.length === 0;
  const pending = exactPending(result);
  if (ready || pending) {
    return {
      exitCode: ready ? EXIT_SUCCESS : EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        ...result,
        mode,
        sourceChanged: false,
        appliedMigrationIds: []
      }),
      mayContinue: true,
      pendingMigrationIds: pending ? result.pendingMigrationIds : []
    };
  }
  if (result.schemaState === "blocked" && result.reasonCodes.length > 0) {
    return {
      exitCode: hasInfrastructureReason(result)
        ? EXIT_INFRASTRUCTURE_FAILURE
        : EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        ...result,
        mode,
        sourceChanged: false,
        appliedMigrationIds: []
      }),
      mayContinue: false
    };
  }
  return unexpectedExecutionOutcome(mode);
}

function targetOutcome(result, mode, expectedPendingMigrationIds) {
  if (
    result.ok
    && result.schemaState === "ready"
    && checksAreReady(result.checks)
    && result.reasonCodes.length === 0
  ) {
    const exactTarget = mode === "dry-run"
      ? result.sourceChanged === false
        && migrationIdsAreExact(result.appliedMigrationIds, expectedPendingMigrationIds)
        && migrationIdsAreExact(result.pendingMigrationIds, expectedPendingMigrationIds)
      : result.sourceChanged === (expectedPendingMigrationIds.length > 0)
        && migrationIdsAreExact(result.appliedMigrationIds, expectedPendingMigrationIds)
        && result.pendingMigrationIds.length === 0;
    if (exactTarget) {
      return {
        exitCode: EXIT_SUCCESS,
        output: closedOutput({ ...result, mode })
      };
    }
  }
  if (result.schemaState === "blocked" && result.reasonCodes.length > 0) {
    return {
      exitCode: hasInfrastructureReason(result)
        ? EXIT_INFRASTRUCTURE_FAILURE
        : EXIT_SCHEMA_REJECTED,
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

function operationErrorOutcome(error, mode) {
  const code = safeErrorCode(error);
  if (typeof code === "string" && /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(code)) {
    return {
      exitCode: EXIT_INFRASTRUCTURE_FAILURE,
      output: closedOutput({ mode, reasonCodes: ["database_unavailable"] })
    };
  }
  if (OPERATION_REASON_CODES.has(code)) {
    return {
      exitCode: INFRASTRUCTURE_REASON_CODES.has(code)
        ? EXIT_INFRASTRUCTURE_FAILURE
        : EXIT_SCHEMA_REJECTED,
      output: closedOutput({ mode, reasonCodes: [code] })
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

async function execute(parsed, operations) {
  let validation;
  try {
    validation = readResult(await operationFrom(
      operations,
      "validatePortalRegistrationWelcomeBonusSchema"
    )({ dbPath: parsed.dbPath }));
  } catch (error) {
    return operationErrorOutcome(error, parsed.mode);
  }
  const preflight = validationOutcome(validation, parsed.mode);
  if (parsed.mode === "validate" || preflight.mayContinue !== true) {
    return { exitCode: preflight.exitCode, output: preflight.output };
  }

  try {
    const result = await (parsed.mode === "dry-run"
      ? operationFrom(operations, "dryRunPortalRegistrationWelcomeBonusMigrations")({
        dbPath: parsed.dbPath,
        tempRoot: parsed.tempRoot
      })
      : operationFrom(operations, "applyPortalRegistrationWelcomeBonusMigrations")({
        dbPath: parsed.dbPath,
        expectedMigrationId: parsed.expectedMigrationId,
        expectedDdlChecksum: parsed.expectedDdlChecksum
      }));
    return targetOutcome(
      readResult(result, { target: true }),
      parsed.mode,
      preflight.pendingMigrationIds
    );
  } catch (error) {
    return operationErrorOutcome(error, parsed.mode);
  }
}

export async function runPortalRegistrationWelcomeBonusSchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    return CONTRACT_ERRORS.has(error) && CONTRACT_REASON_CODES.has(error.reasonCode)
      ? contractOutcome(error.reasonCode, error.mode)
      : unexpectedExecutionOutcome();
  }
  if (parsed.mode === "apply") {
    return contractOutcome("custody_gate_required", parsed.mode);
  }
  try {
    return await execute(parsed, operations);
  } catch {
    return unexpectedExecutionOutcome(parsed.mode);
  }
}
