import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import {
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS,
  REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID,
  applyAccountResourceAuthorityCommerceMigrations,
  dryRunAccountResourceAuthorityCommerceMigrations,
  rollbackAccountResourceAuthorityCommerceMigration,
  validateAccountResourceAuthorityCommerceSchema
} from "../server/services/platform/account-resource-authority-commerce-migrations.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const SCHEMA_VERSION = "1";
const TYPE = "account_resource_authority_commerce_schema_operator";
const OWNED_OBJECT_COUNT = 4;
const DDL_CHECKSUM =
  ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATIONS[0].ddlChecksum;

const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply", "rollback"]);
const SCHEMA_STATES = new Set(["ready", "pending", "blocked"]);
const CHECK_KEYS = Object.freeze([
  "authorityDependency",
  "commerceDependency",
  "schemaExact",
  "zeroBackfill",
  "rollbackSafe",
  "quickCheck",
  "foreignKeys"
]);
const COUNT_KEYS = Object.freeze([
  "bindingRows",
  "externalDependencies",
  "ownedObjects",
  "migrationRows",
  "foreignKeyViolations"
]);
const BASE_RESULT_KEYS = Object.freeze([
  "ok",
  "schemaState",
  "requiredMigrationId",
  "checks",
  "counts",
  "reasonCodes",
  "pendingMigrationIds"
]);
const MODE_ACTION_KEYS = Object.freeze({
  "dry-run": "appliedMigrationIds",
  apply: "appliedMigrationIds",
  rollback: "rolledBackMigrationIds"
});
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
  "authority_commerce_applied_schema_incompatible",
  "authority_commerce_database_close_failed",
  "authority_commerce_database_unavailable",
  "authority_commerce_invalid_database_path",
  "authority_commerce_invalid_migration_contract",
  "authority_commerce_invalid_temp_root",
  "authority_commerce_migration_apply_failed",
  "authority_commerce_migration_checksum_mismatch",
  "authority_commerce_migration_dependency_missing",
  "authority_commerce_migration_id_mismatch",
  "authority_commerce_owned_object_without_migration",
  "authority_commerce_rollback_dependency_present",
  "authority_commerce_rollback_rows_present",
  "authority_commerce_source_changed_during_dry_run",
  "binding_row_count_unknown",
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable",
  "foreign_key_check_failed",
  "migration_checksum_mismatch",
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
  "authority_commerce_database_close_failed",
  "authority_commerce_database_unavailable",
  "authority_commerce_invalid_database_path",
  "authority_commerce_invalid_migration_contract",
  "authority_commerce_invalid_temp_root",
  "authority_commerce_migration_apply_failed",
  "authority_commerce_source_changed_during_dry_run",
  "binding_row_count_unknown",
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable"
]);
const INCOMPLETE_INSPECTION_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "database_unavailable"
]);
const INSPECTION_REASON_CODES = new Set([
  "authority_commerce_migration_dependency_missing",
  "binding_row_count_unknown",
  "foreign_key_check_failed",
  "migration_checksum_mismatch",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "quick_check_failed",
  "required_migration_missing"
]);
const SCHEMA_REASON_CODES = new Set([
  "migration_checksum_mismatch",
  "owned_object_incompatible",
  "owned_object_missing",
  "owned_object_without_migration",
  "required_migration_missing"
]);

class CliContractError extends Error {
  constructor(reasonCode, mode = null) {
    super("Account resource authority Commerce schema CLI contract rejected");
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
    && expectedMigrationId
      !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
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

function snapshotOwnDataObject(value, expectedKeys) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || isProxy(value)
  ) {
    return null;
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype) return null;
  const expected = new Set(expectedKeys);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== expected.size
    || ownKeys.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    return null;
  }
  const snapshot = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return null;
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotDenseDataArray(value) {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    return null;
  }
  let descriptors;
  try {
    if (
      !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.enumerable !== false
  ) {
    return null;
  }
  const length = lengthDescriptor.value;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== length + 1) return null;
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      return null;
    }
    snapshot.push(descriptor.value);
  }
  return ownKeys.every((key) =>
    key === "length"
    || (
      typeof key === "string"
      && Number.isSafeInteger(Number(key))
      && String(Number(key)) === key
      && Number(key) >= 0
      && Number(key) < length
    )
  ) ? snapshot : null;
}

function snapshotOperationResult(value, mode) {
  const actionKey = MODE_ACTION_KEYS[mode];
  const expectedKeys = mode === "validate"
    ? BASE_RESULT_KEYS
    : [...BASE_RESULT_KEYS, "mode", "sourceChanged", actionKey];
  const result = snapshotOwnDataObject(value, expectedKeys);
  if (!result) return null;
  const checks = snapshotOwnDataObject(result.checks, CHECK_KEYS);
  const counts = snapshotOwnDataObject(result.counts, COUNT_KEYS);
  const reasonCodes = snapshotDenseDataArray(result.reasonCodes);
  const pendingMigrationIds = snapshotDenseDataArray(
    result.pendingMigrationIds
  );
  const actionMigrationIds = actionKey
    ? snapshotDenseDataArray(result[actionKey])
    : [];
  if (
    !checks
    || !counts
    || !reasonCodes
    || !pendingMigrationIds
    || !actionMigrationIds
  ) {
    return null;
  }
  return {
    ...result,
    checks,
    counts,
    reasonCodes,
    pendingMigrationIds,
    ...(actionKey ? { [actionKey]: actionMigrationIds } : {})
  };
}

function closedChecks(checks) {
  const output = {};
  for (const key of CHECK_KEYS) output[key] = checks?.[key] === true;
  return output;
}

function closedCount(value) {
  if (value === null) return null;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function closedSourceChanged(value) {
  return typeof value === "boolean" ? value : null;
}

function closedCounts(counts) {
  const output = {};
  for (const key of COUNT_KEYS) output[key] = closedCount(counts?.[key]);
  return output;
}

function safeReasonList(value) {
  return Array.isArray(value)
    ? value.filter((reasonCode) => SAFE_REASON_CODES.has(reasonCode))
    : [];
}

function safeMigrationList(value) {
  return Array.isArray(value) && (
    value.length === 0
    || (
      value.length === 1
      && value[0]
        === REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
    )
  );
}

function migrationCount(value) {
  return safeMigrationList(value) ? value.length : null;
}

function closedOutput({
  mode = null,
  ok = false,
  schemaState = "blocked",
  sourceChanged = null,
  requiredMigrationPresent = false,
  checks = {},
  counts = {},
  reasonCodes = [],
  pendingMigrationCount = null,
  appliedMigrationCount = null,
  rolledBackMigrationCount = null
} = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: TYPE,
    mode: MODES.has(mode) ? mode : null,
    ok: ok === true,
    schemaState: SCHEMA_STATES.has(schemaState) ? schemaState : "blocked",
    sourceChanged: closedSourceChanged(sourceChanged),
    requiredMigrationPresent: requiredMigrationPresent === true,
    checks: closedChecks(checks),
    counts: closedCounts(counts),
    reasonCodes: safeReasonList(reasonCodes),
    pendingMigrationCount: closedCount(pendingMigrationCount),
    appliedMigrationCount: closedCount(appliedMigrationCount),
    rolledBackMigrationCount: closedCount(rolledBackMigrationCount)
  };
}

function unexpectedExecutionOutcome(mode = null) {
  return {
    exitCode: EXIT_INFRASTRUCTURE_FAILURE,
    output: closedOutput({
      mode,
      sourceChanged: mode === "apply" || mode === "rollback" ? null : false,
      reasonCodes: ["unexpected_execution_failure"]
    })
  };
}

function checksAreComplete(checks) {
  return CHECK_KEYS.every((key) => typeof checks[key] === "boolean");
}

function countsAreComplete(counts) {
  return COUNT_KEYS.every(
    (key) => (
      counts[key] === null
      || (Number.isSafeInteger(counts[key]) && counts[key] >= 0)
    )
  );
}

function reasonCodesAreSortedAndUnique(reasonCodes) {
  return reasonCodes.every((reasonCode, index) =>
    typeof reasonCode === "string"
    && (index === 0 || reasonCodes[index - 1] < reasonCode)
  );
}

function isClosedValidationResult(result) {
  return result.schemaState === "blocked"
    && result.ok === false
    && result.pendingMigrationIds.length === 0
    && result.reasonCodes.length === 1
    && INCOMPLETE_INSPECTION_REASON_CODES.has(result.reasonCodes[0])
    && CHECK_KEYS.every((key) => result.checks[key] === false)
    && result.counts.bindingRows === null
    && result.counts.externalDependencies === null
    && result.counts.ownedObjects === 0
    && result.counts.migrationRows === 0
    && result.counts.foreignKeyViolations === 0;
}

function inspectionSemanticsAreCoherent(result, mode) {
  if (result.reasonCodes.some(
    (reasonCode) => INCOMPLETE_INSPECTION_REASON_CODES.has(reasonCode)
  )) {
    return isClosedValidationResult(result);
  }
  if (!result.reasonCodes.every(
    (reasonCode) => INSPECTION_REASON_CODES.has(reasonCode)
  )) {
    return false;
  }
  const { checks, counts, reasonCodes } = result;
  if (
    counts.externalDependencies === null
    || counts.ownedObjects === null
    || counts.migrationRows === null
    || counts.foreignKeyViolations === null
    || counts.ownedObjects > OWNED_OBJECT_COUNT
  ) {
    return false;
  }
  if (checks.zeroBackfill !== (counts.bindingRows === 0)) return false;
  if (
    checks.rollbackSafe !== (
      counts.bindingRows === 0 && counts.externalDependencies === 0
    )
  ) {
    return false;
  }

  const dependencyMissing = reasonCodes.includes(
    "authority_commerce_migration_dependency_missing"
  );
  if (
    dependencyMissing
      !== !(checks.authorityDependency && checks.commerceDependency)
  ) {
    return false;
  }
  if (
    reasonCodes.includes("binding_row_count_unknown")
      !== (counts.bindingRows === null)
    || reasonCodes.includes("quick_check_failed") !== !checks.quickCheck
    || reasonCodes.includes("foreign_key_check_failed")
      !== !checks.foreignKeys
  ) {
    return false;
  }
  if (
    checks.foreignKeys
      ? counts.foreignKeyViolations !== 0
      : !(
          counts.foreignKeyViolations > 0
          || (counts.foreignKeyViolations === 0 && !checks.quickCheck)
        )
  ) {
    return false;
  }

  const schemaReasons = reasonCodes.filter(
    (reasonCode) => SCHEMA_REASON_CODES.has(reasonCode)
  );
  if (checks.schemaExact) {
    if (
      counts.ownedObjects !== OWNED_OBJECT_COUNT
      || counts.migrationRows < 1
      || schemaReasons.length !== 0
    ) {
      return false;
    }
  } else if (
    checks.authorityDependency
    && checks.commerceDependency
    && schemaReasons.length === 0
  ) {
    return false;
  }

  const requiredMissing = reasonCodes.includes("required_migration_missing");
  const objectWithoutMigration = reasonCodes.includes(
    "owned_object_without_migration"
  );
  const checksumMismatch = reasonCodes.includes("migration_checksum_mismatch");
  if (requiredMissing && (
    !checks.authorityDependency
    || !checks.commerceDependency
    || checks.schemaExact
    || counts.bindingRows !== 0
    || counts.ownedObjects !== 0
    || schemaReasons.length !== 1
  )) {
    return false;
  }
  if (objectWithoutMigration && (
    checks.schemaExact
    || counts.ownedObjects === 0
    || schemaReasons.length !== 1
  )) {
    return false;
  }
  if (checksumMismatch && (
    checks.schemaExact
    || counts.migrationRows < 1
    || schemaReasons.length !== 1
  )) {
    return false;
  }
  if (
    reasonCodes.includes("owned_object_missing")
    && counts.ownedObjects >= OWNED_OBJECT_COUNT
  ) {
    return false;
  }

  if (result.schemaState === "ready") {
    return result.ok === true
      && reasonCodes.length === 0
      && checks.authorityDependency
      && checks.commerceDependency
      && checks.schemaExact
      && checks.quickCheck
      && checks.foreignKeys
      && counts.ownedObjects === OWNED_OBJECT_COUNT
      && counts.migrationRows >= 1
      && counts.foreignKeyViolations === 0
      && (
        mode === "dry-run"
          ? safeMigrationList(result.pendingMigrationIds)
          : result.pendingMigrationIds.length === 0
      );
  }
  if (result.schemaState === "pending") {
    return result.ok === false
      && reasonCodes.length === 1
      && requiredMissing
      && result.pendingMigrationIds.length === 1
      && checks.authorityDependency
      && checks.commerceDependency
      && !checks.schemaExact
      && checks.quickCheck
      && checks.foreignKeys
      && counts.bindingRows === 0
      && counts.ownedObjects === 0
      && counts.foreignKeyViolations === 0;
  }
  return result.ok === false
    && reasonCodes.length > 0
    && result.pendingMigrationIds.length === 0
    && !(requiredMissing && reasonCodes.length === 1);
}

function resultIsCoherent(result, mode) {
  if (!result) return false;
  if (typeof result.ok !== "boolean" || !SCHEMA_STATES.has(result.schemaState)) {
    return false;
  }
  if (
    result.requiredMigrationId
    !== REQUIRED_ACCOUNT_RESOURCE_AUTHORITY_COMMERCE_MIGRATION_ID
  ) {
    return false;
  }
  if (!checksAreComplete(result.checks) || !countsAreComplete(result.counts)) {
    return false;
  }
  if (
    !reasonCodesAreSortedAndUnique(result.reasonCodes)
    || !safeMigrationList(result.pendingMigrationIds)
    || !inspectionSemanticsAreCoherent(result, mode)
  ) {
    return false;
  }

  if (mode === "validate") {
    return true;
  }

  if (result.mode !== mode || typeof result.sourceChanged !== "boolean") {
    return false;
  }
  if (mode === "dry-run") {
    return result.schemaState === "ready"
      && result.sourceChanged === false
      && safeMigrationList(result.appliedMigrationIds)
      && result.pendingMigrationIds.length
        === result.appliedMigrationIds.length;
  }
  if (mode === "apply") {
    return result.schemaState === "ready"
      && result.pendingMigrationIds.length === 0
      && safeMigrationList(result.appliedMigrationIds)
      && result.sourceChanged === (result.appliedMigrationIds.length === 1);
  }
  return result.schemaState === "pending"
    && safeMigrationList(result.rolledBackMigrationIds)
    && result.sourceChanged === (result.rolledBackMigrationIds.length === 1);
}

function integrityInspectionFailed(result) {
  return result.reasonCodes.includes("quick_check_failed")
    && result.reasonCodes.includes("foreign_key_check_failed")
    && result.checks.quickCheck === false
    && result.checks.foreignKeys === false
    && result.counts.foreignKeyViolations === 0;
}

function resultOutput(result, mode, accepted) {
  const relevantApplied = mode === "dry-run" || mode === "apply";
  const relevantRolledBack = mode === "rollback";
  const inspectionIncomplete = result.reasonCodes.some(
    (reasonCode) => INCOMPLETE_INSPECTION_REASON_CODES.has(reasonCode)
  );
  const outputCounts = inspectionIncomplete
    ? {}
    : integrityInspectionFailed(result)
      ? { ...result.counts, foreignKeyViolations: null }
      : result.counts;
  return closedOutput({
    mode,
    ok: accepted,
    schemaState: result.schemaState,
    sourceChanged: mode === "validate" ? false : result.sourceChanged,
    requiredMigrationPresent: result.schemaState === "ready",
    checks: result.checks,
    counts: outputCounts,
    reasonCodes: result.reasonCodes,
    pendingMigrationCount: migrationCount(result.pendingMigrationIds),
    appliedMigrationCount: relevantApplied
      ? migrationCount(result.appliedMigrationIds)
      : 0,
    rolledBackMigrationCount: relevantRolledBack
      ? migrationCount(result.rolledBackMigrationIds)
      : 0
  });
}

function infrastructureFailure(result) {
  return integrityInspectionFailed(result) || result.reasonCodes.some(
    (reasonCode) => INFRASTRUCTURE_REASON_CODES.has(reasonCode)
  );
}

function operationOutcome(result, mode) {
  const snapshot = snapshotOperationResult(result, mode);
  if (!resultIsCoherent(snapshot, mode)) return unexpectedExecutionOutcome(mode);

  const accepted = mode === "validate"
    ? snapshot.schemaState === "ready" || snapshot.schemaState === "pending"
    : mode === "dry-run" || mode === "apply"
      ? snapshot.schemaState === "ready" && snapshot.ok === true
      : snapshot.schemaState === "pending";
  const exitCode = accepted
    ? EXIT_SUCCESS
    : infrastructureFailure(snapshot)
      ? EXIT_INFRASTRUCTURE_FAILURE
      : EXIT_SCHEMA_REJECTED;
  return {
    exitCode,
    output: resultOutput(snapshot, mode, accepted)
  };
}

const DEFAULT_OPERATIONS = Object.freeze({
  validateAccountResourceAuthorityCommerceSchema,
  dryRunAccountResourceAuthorityCommerceMigrations,
  applyAccountResourceAuthorityCommerceMigrations,
  rollbackAccountResourceAuthorityCommerceMigration
});

async function execute(options, operations) {
  let result;
  if (options.mode === "validate") {
    result = await operations.validateAccountResourceAuthorityCommerceSchema({
      dbPath: options.dbPath
    });
  } else if (options.mode === "dry-run") {
    result = await operations.dryRunAccountResourceAuthorityCommerceMigrations({
      dbPath: options.dbPath,
      tempRoot: options.tempRoot
    });
  } else if (options.mode === "apply") {
    result = await operations.applyAccountResourceAuthorityCommerceMigrations({
      dbPath: options.dbPath,
      expectedMigrationId: options.expectedMigrationId,
      expectedDdlChecksum: options.expectedDdlChecksum
    });
  } else {
    result = await operations.rollbackAccountResourceAuthorityCommerceMigration({
      dbPath: options.dbPath,
      expectedMigrationId: options.expectedMigrationId,
      expectedDdlChecksum: options.expectedDdlChecksum
    });
  }
  return operationOutcome(result, options.mode);
}

function safeErrorCode(error) {
  try {
    return typeof error?.code === "string" ? error.code : null;
  } catch {
    return null;
  }
}

export async function runAccountResourceAuthorityCommerceSchemaCli({
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
          sourceChanged: false,
          reasonCodes: [error.reasonCode]
        })
      };
    }
    return unexpectedExecutionOutcome();
  }

  try {
    return await execute(options, operations);
  } catch (error) {
    const code = safeErrorCode(error);
    if (SAFE_OPERATION_REASON_CODES.has(code)) {
      const infrastructure = INFRASTRUCTURE_REASON_CODES.has(code);
      return {
        exitCode: infrastructure
          ? EXIT_INFRASTRUCTURE_FAILURE
          : EXIT_SCHEMA_REJECTED,
        output: closedOutput({
          mode: options.mode,
          schemaState: "blocked",
          sourceChanged:
            options.mode === "apply" || options.mode === "rollback"
              ? null
              : false,
          reasonCodes: [code]
        })
      };
    }
    return unexpectedExecutionOutcome(options.mode);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runAccountResourceAuthorityCommerceSchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
