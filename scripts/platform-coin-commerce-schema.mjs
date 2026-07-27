import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COIN_COMMERCE_MIGRATIONS,
  REQUIRED_COIN_COMMERCE_MIGRATION_ID,
  applyCoinCommerceMigrations,
  dryRunCoinCommerceMigrations,
  validateCoinCommerceSchema
} from "../server/services/platform/coin-commerce-migrations.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const DDL_CHECKSUM = COIN_COMMERCE_MIGRATIONS[0].ddlChecksum;
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply"]);
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
const SAFE_REASON_CODES = new Set([
  ...CONTRACT_REASON_CODES,
  "commerce_applied_schema_incompatible",
  "commerce_migration_checksum_mismatch",
  "commerce_migration_dependency_missing",
  "commerce_migration_ledger_incompatible",
  "commerce_owned_object_incompatible",
  "commerce_owned_object_missing",
  "commerce_owned_object_without_migration",
  "commerce_required_migration_missing",
  "commerce_source_changed_during_dry_run",
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable",
  "foreign_key_check_failed",
  "quick_check_failed",
  "unexpected_execution_failure"
]);
const SCHEMA_ERROR_CODES = new Set([
  "commerce_applied_schema_incompatible",
  "commerce_migration_checksum_mismatch",
  "commerce_migration_dependency_missing",
  "commerce_owned_object_without_migration"
]);
const INFRASTRUCTURE_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed"
]);
const DEFAULT_OPERATIONS = Object.freeze({
  applyCoinCommerceMigrations,
  dryRunCoinCommerceMigrations,
  validateCoinCommerceSchema
});

class CliContractError extends Error {
  constructor(reasonCode, mode = null) {
    super("Coin commerce schema CLI contract rejected");
    this.name = "CliContractError";
    this.reasonCode = reasonCode;
    this.mode = mode;
  }
}

function contractError(reasonCode, mode = null) {
  return new CliContractError(reasonCode, mode);
}

function isFullyQualifiedPath(value) {
  if (!isAbsolute(value)) return false;
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
    if (!FLAGS.has(flag)) throw contractError("unknown_argument");
    if (values.has(flag)) throw contractError("duplicate_argument");
    if (
      index + 1 >= argv.length
      || FLAGS.has(argv[index + 1])
      || typeof argv[index + 1] !== "string"
      || argv[index + 1].length === 0
    ) {
      throw contractError("empty_argument");
    }
    values.set(flag, argv[index + 1]);
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
  const confirmMigrationId = values.get("--confirm-migration-id");
  const confirmDdlChecksum = values.get("--confirm-ddl-checksum");
  if (tempRoot && !isFullyQualifiedPath(tempRoot)) {
    throw contractError("temp_root_must_be_absolute", mode);
  }
  if (mode !== "dry-run" && tempRoot) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (mode !== "apply" && (confirmMigrationId || confirmDdlChecksum)) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (mode === "apply" && (!confirmMigrationId || !confirmDdlChecksum)) {
    throw contractError("apply_confirmation_required", mode);
  }
  if (
    mode === "apply"
    && confirmMigrationId !== REQUIRED_COIN_COMMERCE_MIGRATION_ID
  ) {
    throw contractError("migration_id_mismatch", mode);
  }
  if (mode === "apply" && confirmDdlChecksum !== DDL_CHECKSUM) {
    throw contractError("migration_checksum_mismatch", mode);
  }
  return {
    mode,
    dbPath,
    tempRoot,
    confirmMigrationId,
    confirmDdlChecksum
  };
}

function closedOutput({
  ok = false,
  mode = null,
  schemaState = "rejected",
  sourceChanged = false,
  checks,
  reasonCodes = [],
  appliedMigrationIds = [],
  pendingMigrationIds = []
} = {}) {
  return {
    ok: ok === true,
    mode: MODES.has(mode) ? mode : null,
    schemaState: ["ready", "blocked", "rejected", "unavailable"].includes(schemaState)
      ? schemaState
      : "unavailable",
    requiredMigrationId: REQUIRED_COIN_COMMERCE_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    checks: {
      schemaExact: checks?.schemaExact === true,
      walletDependency: checks?.walletDependency === true,
      quickCheck: checks?.quickCheck === true,
      foreignKeys: checks?.foreignKeys === true
    },
    reasonCodes: reasonCodes.filter((value) => SAFE_REASON_CODES.has(value)),
    appliedMigrationIds: appliedMigrationIds.filter(
      (value) => value === REQUIRED_COIN_COMMERCE_MIGRATION_ID
    ),
    pendingMigrationIds: pendingMigrationIds.filter(
      (value) => value === REQUIRED_COIN_COMMERCE_MIGRATION_ID
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
    const result = operations.validateCoinCommerceSchema({
      dbPath: options.dbPath
    });
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

  const validation = operations.validateCoinCommerceSchema({
    dbPath: options.dbPath
  });
  if (!operationResultHasSafeReasons(validation)) {
    return unexpectedExecutionOutcome(options.mode);
  }
  const unavailable = preflightFailure(validation, options.mode);
  if (unavailable) return unavailable;
  try {
    const result = options.mode === "dry-run"
      ? await operations.dryRunCoinCommerceMigrations({
        dbPath: options.dbPath,
        tempRoot: options.tempRoot
      })
      : operations.applyCoinCommerceMigrations({
        dbPath: options.dbPath,
        expectedMigrationId: options.confirmMigrationId,
        expectedDdlChecksum: options.confirmDdlChecksum
      });
    if (!operationResultHasSafeReasons(result)) {
      return unexpectedExecutionOutcome(options.mode);
    }
    return {
      exitCode: EXIT_SUCCESS,
      output: closedOutput({
        ...result,
        sourceChanged: options.mode === "apply"
          ? true
          : result.sourceChanged
      })
    };
  } catch (error) {
    return operationFailure(error, options.mode);
  }
}

export async function runCoinCommerceSchemaCli({
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
  const outcome = await runCoinCommerceSchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
