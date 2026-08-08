import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

import {
  ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
  applyAccountResourceAuthorityMigrations,
  dryRunAccountResourceAuthorityMigrations,
  rollbackAccountResourceAuthorityMigration,
  validateAccountResourceAuthoritySchema
} from "../server/services/platform/account-resource-authority-migrations.mjs";
import {
  createAccountResourceAuthorityStore
} from "../server/services/platform/account-resource-authority.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const DDL_CHECKSUM = ACCOUNT_RESOURCE_AUTHORITY_MIGRATIONS[0].ddlChecksum;
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set([
  "validate",
  "dry-run",
  "resolve-dry-run",
  "apply",
  "rollback"
]);
const SCHEMA_STATES = new Set(["ready", "pending", "blocked", "unavailable"]);
const CHECK_KEYS = Object.freeze([
  "walletDependency",
  "commerceDependency",
  "lineageDependency",
  "schemaExact",
  "zeroBackfill",
  "rollbackSafe",
  "quickCheck",
  "foreignKeys"
]);
const COUNT_KEYS = Object.freeze([
  "authorityRows",
  "ownedObjects",
  "migrationRows",
  "foreignKeyViolations",
  "externalDependencies",
  "accounts",
  "activeAuthorityRows",
  "resolved",
  "missingAuthority",
  "invalidAuthority",
  "authorityConflicts",
  "ambiguousBindingsWithoutAuthority",
  "singleBindingWithoutAuthority",
  "noBindingWithoutAuthority"
]);
const RESOLUTION_REASON_COUNT_KEYS = Object.freeze([
  "no_authority",
  "authority_conflict",
  "authority_drift"
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
  "authority_applied_schema_incompatible",
  "authority_database_close_failed",
  "authority_database_unavailable",
  "authority_invalid_database_path",
  "authority_invalid_migration_contract",
  "authority_invalid_temp_root",
  "authority_migration_apply_failed",
  "authority_migration_checksum_mismatch",
  "authority_migration_dependency_missing",
  "authority_migration_id_mismatch",
  "authority_owned_object_without_migration",
  "authority_rollback_dependency_present",
  "authority_rollback_rows_present",
  "authority_source_changed_during_dry_run",
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
  "quick_check_failed",
  "required_migration_missing"
]);
const SAFE_REASON_CODES = new Set([
  ...CONTRACT_REASON_CODES,
  ...SAFE_OPERATION_REASON_CODES,
  "unexpected_execution_failure"
]);
const INFRASTRUCTURE_REASON_CODES = new Set([
  "authority_database_close_failed",
  "authority_database_unavailable",
  "authority_migration_apply_failed",
  "authority_source_changed_during_dry_run",
  "database_close_failed",
  "database_inspection_failed",
  "database_unavailable"
]);

class CliContractError extends Error {
  constructor(reasonCode, mode = null) {
    super("Account resource authority schema CLI contract rejected");
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
  if (
    mutationMode
    && expectedMigrationId !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  ) {
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

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function closedChecks(checks) {
  const output = {};
  for (const key of CHECK_KEYS) output[key] = checks?.[key] === true;
  return output;
}

function closedCounts(counts) {
  const output = {};
  for (const key of COUNT_KEYS) output[key] = safeInteger(counts?.[key]);
  return output;
}

function closedReasonCounts(reasonCounts) {
  const output = {};
  for (const key of RESOLUTION_REASON_COUNT_KEYS) {
    output[key] = safeInteger(reasonCounts?.[key]);
  }
  return output;
}

function safeIdList(value) {
  return Array.isArray(value)
    ? value.filter(
      (id) => id === REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    )
    : [];
}

function safeReasonList(value) {
  return Array.isArray(value)
    ? value.filter((code) => SAFE_REASON_CODES.has(code))
    : [];
}

function closedOutput({
  ok = false,
  mode = null,
  schemaState = "blocked",
  sourceChanged = false,
  resolutionReady = false,
  checks = {},
  counts = {},
  reasonCounts = {},
  reasonCodes = [],
  pendingMigrationIds = [],
  appliedMigrationIds = [],
  rolledBackMigrationIds = []
} = {}) {
  return {
    ok: ok === true,
    mode: MODES.has(mode) ? mode : null,
    schemaState: SCHEMA_STATES.has(schemaState) ? schemaState : "blocked",
    requiredMigrationId: REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    resolutionReady: resolutionReady === true,
    checks: closedChecks(checks),
    counts: closedCounts(counts),
    reasonCounts: closedReasonCounts(reasonCounts),
    reasonCodes: safeReasonList(reasonCodes),
    pendingMigrationIds: safeIdList(pendingMigrationIds),
    appliedMigrationIds: safeIdList(appliedMigrationIds),
    rolledBackMigrationIds: safeIdList(rolledBackMigrationIds)
  };
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSafeResult(result) {
  if (!isPlainObject(result)) return false;
  if (typeof result.ok !== "boolean") return false;
  if (!SCHEMA_STATES.has(result.schemaState)) return false;
  if (
    result.requiredMigrationId
    !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
  ) {
    return false;
  }
  if (!Array.isArray(result.reasonCodes)) return false;
  if (!result.reasonCodes.every((code) => SAFE_OPERATION_REASON_CODES.has(code))) {
    return false;
  }
  return isPlainObject(result.checks) && isPlainObject(result.counts);
}

function validationOutcome(result, mode) {
  if (!validateSafeResult(result)) return unexpectedExecutionOutcome(mode);
  const infrastructureFailure = result.reasonCodes.some(
    (code) => INFRASTRUCTURE_REASON_CODES.has(code)
  );
  return {
    exitCode: result.ok
      ? EXIT_SUCCESS
      : infrastructureFailure
        ? EXIT_INFRASTRUCTURE_FAILURE
        : EXIT_SCHEMA_REJECTED,
    output: closedOutput({ ...result, mode })
  };
}

function validateMigrationResult(result, mode) {
  if (!validateSafeResult(result)) return false;
  if (typeof result.sourceChanged !== "boolean") return false;
  const idLists = [
    result.pendingMigrationIds ?? [],
    result.appliedMigrationIds ?? [],
    result.rolledBackMigrationIds ?? []
  ];
  return idLists.every(
    (items) => Array.isArray(items) && items.every(
      (id) => id === REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_MIGRATION_ID
    )
  ) && (
    mode !== "dry-run" || result.sourceChanged === false
  );
}

function migrationOutcome(result, mode) {
  if (!validateMigrationResult(result, mode)) {
    return unexpectedExecutionOutcome(mode);
  }
  const successfulRollback = mode === "rollback"
    && result.schemaState === "pending"
    && result.reasonCodes.length === 1
    && result.reasonCodes[0] === "required_migration_missing";
  const infrastructureFailure = result.reasonCodes.some(
    (code) => INFRASTRUCTURE_REASON_CODES.has(code)
  );
  return {
    exitCode: result.ok || successfulRollback
      ? EXIT_SUCCESS
      : infrastructureFailure
        ? EXIT_INFRASTRUCTURE_FAILURE
        : EXIT_SCHEMA_REJECTED,
    output: closedOutput({
      ...result,
      ok: result.ok || successfulRollback,
      mode
    })
  };
}

function validateResolutionResult(result) {
  if (!isPlainObject(result)) return false;
  const allowedTopLevel = new Set([
    "ok",
    "ready",
    "aggregateOnly",
    "counts",
    "reasonCodes"
  ]);
  if (!Object.keys(result).every((key) => allowedTopLevel.has(key))) return false;
  if (
    result.ok !== true
    || typeof result.ready !== "boolean"
    || result.aggregateOnly !== true
  ) {
    return false;
  }
  if (!isPlainObject(result.counts) || !isPlainObject(result.reasonCodes)) {
    return false;
  }
  if (!Object.keys(result.counts).every((key) => COUNT_KEYS.includes(key))) {
    return false;
  }
  if (
    !Object.keys(result.reasonCodes).every(
      (key) => RESOLUTION_REASON_COUNT_KEYS.includes(key)
    )
  ) {
    return false;
  }
  return [...Object.values(result.counts), ...Object.values(result.reasonCodes)]
    .every((value) => Number.isSafeInteger(value) && value >= 0);
}

function defaultResolveDryRun({ dbPath }) {
  let database;
  try {
    database = new Database(dbPath, { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    const store = createAccountResourceAuthorityStore({ database });
    return store.dryRunAuthorities();
  } finally {
    database?.close();
  }
}

const DEFAULT_OPERATIONS = Object.freeze({
  validateAccountResourceAuthoritySchema,
  dryRunAccountResourceAuthorityMigrations,
  applyAccountResourceAuthorityMigrations,
  rollbackAccountResourceAuthorityMigration,
  resolveDryRunAccountResourceAuthorities: defaultResolveDryRun
});

async function execute(options, operations) {
  const validation = await operations.validateAccountResourceAuthoritySchema({
    dbPath: options.dbPath
  });
  const checked = validationOutcome(validation, options.mode);
  if (options.mode === "validate") return checked;
  if (
    checked.exitCode === EXIT_INFRASTRUCTURE_FAILURE
    || validation.schemaState === "blocked"
    || validation.schemaState === "unavailable"
  ) {
    return checked;
  }

  if (options.mode === "resolve-dry-run") {
    if (checked.exitCode !== EXIT_SUCCESS) return checked;
    const result = await operations.resolveDryRunAccountResourceAuthorities({
      dbPath: options.dbPath
    });
    if (!validateResolutionResult(result)) {
      return unexpectedExecutionOutcome(options.mode);
    }
    return {
      exitCode: EXIT_SUCCESS,
      output: closedOutput({
        ok: true,
        mode: options.mode,
        schemaState: "ready",
        sourceChanged: false,
        resolutionReady: result.ready,
        checks: validation.checks,
        counts: {
          ...validation.counts,
          ...result.counts
        },
        reasonCounts: result.reasonCodes
      })
    };
  }

  let result;
  if (options.mode === "dry-run") {
    result = await operations.dryRunAccountResourceAuthorityMigrations({
      dbPath: options.dbPath,
      tempRoot: options.tempRoot
    });
  } else if (options.mode === "apply") {
    result = await operations.applyAccountResourceAuthorityMigrations({
      dbPath: options.dbPath,
      expectedMigrationId: options.expectedMigrationId,
      expectedDdlChecksum: options.expectedDdlChecksum
    });
  } else {
    result = await operations.rollbackAccountResourceAuthorityMigration({
      dbPath: options.dbPath,
      expectedMigrationId: options.expectedMigrationId,
      expectedDdlChecksum: options.expectedDdlChecksum
    });
  }
  return migrationOutcome(result, options.mode);
}

export async function runAccountResourceAuthoritySchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    if (
      error instanceof CliContractError
      && CONTRACT_REASON_CODES.has(error.reasonCode)
    ) {
      return {
        exitCode: EXIT_CONTRACT_REJECTED,
        output: closedOutput({
          mode: error.mode,
          reasonCodes: [error.reasonCode]
        })
      };
    }
    return unexpectedExecutionOutcome();
  }

  try {
    return await execute(options, operations);
  } catch (error) {
    if (SAFE_OPERATION_REASON_CODES.has(error?.code)) {
      const infrastructureFailure = INFRASTRUCTURE_REASON_CODES.has(error.code);
      return {
        exitCode: infrastructureFailure
          ? EXIT_INFRASTRUCTURE_FAILURE
          : EXIT_SCHEMA_REJECTED,
        output: closedOutput({
          mode: options.mode,
          schemaState: infrastructureFailure ? "unavailable" : "blocked",
          reasonCodes: [error.code]
        })
      };
    }
    return unexpectedExecutionOutcome(options.mode);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runAccountResourceAuthoritySchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
