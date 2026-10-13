import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLAN_SWITCH_MIGRATIONS,
  REQUIRED_PLAN_SWITCH_MIGRATION_ID,
  applyPlanSwitchMigrations,
  dryRunPlanSwitchMigrations,
  rollbackPlanSwitchMigrations,
  validatePlanSwitchSchema
} from "../server/services/platform/coin-commerce-plan-switch-migrations.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const DDL_CHECKSUM = PLAN_SWITCH_MIGRATIONS[0].ddlChecksum;
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply", "rollback"]);
const SCHEMA_STATES = new Set(["ready", "pending", "blocked", "unavailable"]);
const CHECK_KEYS = Object.freeze([
  "commerceDependency",
  "schemaExact",
  "rollbackSafe",
  "quickCheck",
  "foreignKeys"
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
  "rollback_confirmation_required",
  "temp_root_must_be_absolute",
  "unknown_argument"
]);
const SAFE_OPERATION_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable",
  "foreign_key_check_failed",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "plan_switch_applied_schema_incompatible",
  "plan_switch_database_unavailable",
  "plan_switch_migration_apply_failed",
  "plan_switch_migration_checksum_mismatch",
  "plan_switch_migration_dependency_missing",
  "plan_switch_owned_object_without_migration",
  "plan_switch_rollback_rows_present",
  "plan_switch_source_changed_during_dry_run",
  "quick_check_failed",
  "required_migration_missing"
]);
const SAFE_REASON_CODES = new Set([
  ...CONTRACT_REASON_CODES,
  ...SAFE_OPERATION_REASON_CODES,
  "unexpected_execution_failure"
]);
const SCHEMA_ERROR_CODES = new Set([
  "plan_switch_applied_schema_incompatible",
  "plan_switch_migration_checksum_mismatch",
  "plan_switch_migration_dependency_missing",
  "plan_switch_owned_object_without_migration",
  "plan_switch_rollback_rows_present"
]);
const INFRASTRUCTURE_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_unavailable",
  "plan_switch_database_unavailable",
  "plan_switch_migration_apply_failed",
  "plan_switch_source_changed_during_dry_run"
]);
const DEFAULT_OPERATIONS = Object.freeze({
  applyPlanSwitchMigrations,
  dryRunPlanSwitchMigrations,
  rollbackPlanSwitchMigrations,
  validatePlanSwitchSchema
});

class CliContractError extends Error {
  constructor(reasonCode, mode = null) {
    super("Coin commerce plan switch schema CLI contract rejected");
    this.name = "CliContractError";
    this.reasonCode = reasonCode;
    this.mode = mode;
  }
}

function contractError(reasonCode, mode = null) {
  return new CliContractError(reasonCode, mode);
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
  const mutationMode = mode === "apply" || mode === "rollback";
  if (!mutationMode && (
    expectedMigrationId !== undefined || expectedDdlChecksum !== undefined
  )) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (mutationMode && (
    expectedMigrationId === undefined || expectedDdlChecksum === undefined
  )) {
    throw contractError(
      mode === "apply"
        ? "apply_confirmation_required"
        : "rollback_confirmation_required",
      mode
    );
  }
  if (mutationMode && expectedMigrationId !== REQUIRED_PLAN_SWITCH_MIGRATION_ID) {
    throw contractError("migration_id_mismatch", mode);
  }
  if (mutationMode && expectedDdlChecksum !== DDL_CHECKSUM) {
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

function closedChecks(checks) {
  const output = {};
  for (const key of CHECK_KEYS) output[key] = checks?.[key] === true;
  return output;
}

function closedOutput({
  ok = false,
  mode = null,
  schemaState = "blocked",
  sourceChanged = false,
  checks,
  reasonCodes = [],
  appliedMigrationIds = [],
  pendingMigrationIds = [],
  removedMigrationIds = []
} = {}) {
  return {
    ok: ok === true,
    mode: MODES.has(mode) ? mode : null,
    schemaState: SCHEMA_STATES.has(schemaState) ? schemaState : "unavailable",
    requiredMigrationId: REQUIRED_PLAN_SWITCH_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    checks: closedChecks(checks),
    reasonCodes: reasonCodes.filter((value) => SAFE_REASON_CODES.has(value)),
    appliedMigrationIds: appliedMigrationIds.filter(
      (value) => value === REQUIRED_PLAN_SWITCH_MIGRATION_ID
    ),
    pendingMigrationIds: pendingMigrationIds.filter(
      (value) => value === REQUIRED_PLAN_SWITCH_MIGRATION_ID
    ),
    removedMigrationIds: removedMigrationIds.filter(
      (value) => value === REQUIRED_PLAN_SWITCH_MIGRATION_ID
    )
  };
}

function operationResultHasSafeReasons(result) {
  return Array.isArray(result?.reasonCodes)
    && result.reasonCodes.every((value) => SAFE_REASON_CODES.has(value));
}

function unavailableOutput(mode) {
  return closedOutput({
    mode,
    schemaState: "unavailable",
    reasonCodes: ["database_unavailable"]
  });
}

function unexpectedExecutionOutcome(mode = null) {
  return {
    exitCode: EXIT_INFRASTRUCTURE_FAILURE,
    output: closedOutput({
      mode,
      schemaState: "unavailable",
      reasonCodes: ["unexpected_execution_failure"]
    })
  };
}

function preflightFailure(validation, mode) {
  if (validation.reasonCodes.some((code) => INFRASTRUCTURE_REASON_CODES.has(code))) {
    return {
      exitCode: EXIT_INFRASTRUCTURE_FAILURE,
      output: unavailableOutput(mode)
    };
  }
  if (
    validation.reasonCodes.includes("database_missing")
    || validation.reasonCodes.includes("database_invalid")
  ) {
    return {
      exitCode: EXIT_SCHEMA_REJECTED,
      output: closedOutput({ ...validation, mode })
    };
  }
  return null;
}

function operationFailure(error, mode) {
  if (SCHEMA_ERROR_CODES.has(error?.code)) {
    return {
      exitCode: EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        mode,
        schemaState: "blocked",
        reasonCodes: [error.code]
      })
    };
  }
  return {
    exitCode: EXIT_INFRASTRUCTURE_FAILURE,
    output: unavailableOutput(mode)
  };
}

async function execute(options, operations) {
  if (options.mode === "validate") {
    const result = operations.validatePlanSwitchSchema({ dbPath: options.dbPath });
    if (!operationResultHasSafeReasons(result)) {
      return unexpectedExecutionOutcome(options.mode);
    }
    const unavailable = preflightFailure(result, options.mode);
    if (unavailable) return unavailable;
    return {
      exitCode: result.ok ? EXIT_SUCCESS : EXIT_SCHEMA_REJECTED,
      output: closedOutput({ ...result, mode: options.mode })
    };
  }
  const validation = operations.validatePlanSwitchSchema({ dbPath: options.dbPath });
  if (!operationResultHasSafeReasons(validation)) {
    return unexpectedExecutionOutcome(options.mode);
  }
  const unavailable = preflightFailure(validation, options.mode);
  if (unavailable) return unavailable;
  if (
    options.mode !== "rollback"
    && !validation.checks?.commerceDependency
  ) {
    return {
      exitCode: EXIT_SCHEMA_REJECTED,
      output: closedOutput({ ...validation, mode: options.mode })
    };
  }
  try {
    const result = options.mode === "dry-run"
      ? await operations.dryRunPlanSwitchMigrations({
        dbPath: options.dbPath,
        tempRoot: options.tempRoot
      })
      : options.mode === "rollback"
        ? operations.rollbackPlanSwitchMigrations({
          dbPath: options.dbPath,
          expectedMigrationId: options.expectedMigrationId,
          expectedDdlChecksum: options.expectedDdlChecksum
        })
        : operations.applyPlanSwitchMigrations({
          dbPath: options.dbPath,
          expectedMigrationId: options.expectedMigrationId,
          expectedDdlChecksum: options.expectedDdlChecksum
        });
    if (!operationResultHasSafeReasons(result)) {
      return unexpectedExecutionOutcome(options.mode);
    }
    const rollbackReady = options.mode === "rollback"
      && result.removedMigrationIds?.length === 1
      && result.schemaState === "pending";
    return {
      exitCode: result.ok || rollbackReady ? EXIT_SUCCESS : EXIT_SCHEMA_REJECTED,
      output: closedOutput({
        ...result,
        ok: result.ok === true || rollbackReady,
        sourceChanged: result.sourceChanged
      })
    };
  } catch (error) {
    return operationFailure(error, options.mode);
  }
}

export async function runPlanSwitchSchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    return (
      error instanceof CliContractError
      && CONTRACT_REASON_CODES.has(error.reasonCode)
    )
      ? {
        exitCode: EXIT_CONTRACT_REJECTED,
        output: closedOutput({
          mode: error.mode,
          reasonCodes: [error.reasonCode]
        })
      }
      : unexpectedExecutionOutcome();
  }
  try {
    return await execute(options, operations);
  } catch {
    return unexpectedExecutionOutcome(options.mode);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runPlanSwitchSchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
