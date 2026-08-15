import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
  applyWalletFirstSetupDeliveryHandoffsMigrations,
  dryRunWalletFirstSetupDeliveryHandoffsMigrations,
  validateWalletFirstSetupDeliveryHandoffsSchema
} from "../server/services/platform/wallet-first-setup-delivery-handoffs-migrations.mjs";

const EXIT_SUCCESS = 0;
const EXIT_CONTRACT_REJECTED = 2;
const EXIT_SCHEMA_REJECTED = 3;
const EXIT_INFRASTRUCTURE_FAILURE = 4;
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const MODES = new Set(["validate", "dry-run", "apply"]);
const CHECK_KEYS = Object.freeze([
  "runtimeClaimsDependency",
  "schemaExact",
  "quickCheck",
  "foreignKeys"
]);
const SAFE_REASON_CODES = new Set([
  "applied_schema_incompatible",
  "apply_confirmation_required",
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
  "invalid_migration_contract",
  "invalid_mode",
  "invalid_temp_root",
  "migration_checksum_mismatch",
  "migration_dependency_missing",
  "migration_id_mismatch",
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
const INFRASTRUCTURE_REASON_CODES = new Set([
  "database_close_failed",
  "database_inspection_failed",
  "database_unavailable",
  "source_changed_during_dry_run"
]);
const DEFAULT_OPERATIONS = Object.freeze({
  validateWalletFirstSetupDeliveryHandoffsSchema,
  dryRunWalletFirstSetupDeliveryHandoffsMigrations,
  applyWalletFirstSetupDeliveryHandoffsMigrations
});
const CONTRACT_ERRORS = new WeakSet();

function contractError(reasonCode, mode = null) {
  const error = new Error("Wallet-first setup-delivery handoff schema CLI contract rejected");
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
  return ![".", "..", "?"].includes(server)
    && ![".", ".."].includes(share)
    && !/[<>:"|?*]/.test(server)
    && !/[<>:"|?*]/.test(share);
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) throw contractError("invalid_migration_contract");
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAGS.has(flag)) throw contractError("unknown_argument");
    if (Object.hasOwn(parsed, flag)) throw contractError("duplicate_argument");
    if (typeof value !== "string" || value.length === 0) throw contractError("empty_argument");
    parsed[flag] = value;
  }
  const mode = parsed["--mode"];
  if (!mode) throw contractError("mode_required");
  if (!MODES.has(mode)) throw contractError("invalid_mode", mode);
  const dbPath = parsed["--db-path"];
  if (!dbPath) throw contractError("database_path_required", mode);
  if (!isFullyQualifiedPath(dbPath)) throw contractError("database_path_must_be_absolute", mode);
  const tempRoot = parsed["--temp-root"];
  if (tempRoot !== undefined && !isFullyQualifiedPath(tempRoot)) {
    throw contractError("temp_root_must_be_absolute", mode);
  }
  const migrationId = parsed["--confirm-migration-id"];
  const checksum = parsed["--confirm-ddl-checksum"];
  if (mode === "apply") {
    if (!migrationId || !checksum) throw contractError("apply_confirmation_required", mode);
    if (tempRoot !== undefined) throw contractError("argument_not_allowed_for_mode", mode);
  } else if (migrationId !== undefined || checksum !== undefined) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (mode !== "dry-run" && tempRoot !== undefined) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  return {
    mode,
    dbPath,
    tempRoot,
    expectedMigrationId: migrationId,
    expectedDdlChecksum: checksum
  };
}

function safeReasons(value) {
  if (!Array.isArray(value)) return ["unexpected_execution_failure"];
  const reasons = value.filter((code) => SAFE_REASON_CODES.has(code));
  return reasons.length === value.length && reasons.length > 0
    ? [...new Set(reasons)].sort()
    : reasons.length === 0 && value.length === 0
      ? []
      : ["unexpected_execution_failure"];
}

function safeMigrationIds(value) {
  return Array.isArray(value)
    && value.every((item) => item === REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID)
    ? [...new Set(value)]
    : [];
}

function closedOutput({
  mode = null,
  ok = false,
  schemaState = "blocked",
  checks = {},
  reasonCodes = ["unexpected_execution_failure"],
  pendingMigrationIds = [],
  appliedMigrationIds = [],
  sourceChanged = false
} = {}) {
  return {
    mode,
    ok: ok === true,
    schemaState: ["ready", "pending", "blocked"].includes(schemaState)
      ? schemaState
      : "blocked",
    requiredMigrationId: REQUIRED_WALLET_FIRST_SETUP_DELIVERY_HANDOFFS_MIGRATION_ID,
    checks: Object.fromEntries(CHECK_KEYS.map((key) => [key, checks?.[key] === true])),
    reasonCodes: safeReasons(reasonCodes),
    pendingMigrationIds: safeMigrationIds(pendingMigrationIds),
    appliedMigrationIds: safeMigrationIds(appliedMigrationIds),
    sourceChanged: sourceChanged === true
  };
}

function operationFrom(operations, name) {
  const operation = operations?.[name];
  if (typeof operation !== "function") throw new Error("invalid operation");
  return operation;
}

function validationOutcome(validation, mode) {
  const output = closedOutput({ ...validation, mode, sourceChanged: false, appliedMigrationIds: [] });
  if (output.ok && output.schemaState === "ready" && output.reasonCodes.length === 0) {
    return { mayContinue: false, exitCode: EXIT_SUCCESS, output };
  }
  const isPending = output.schemaState === "pending"
    && output.reasonCodes.length === 1
    && output.reasonCodes[0] === "required_migration_missing"
    && output.pendingMigrationIds.length === 1;
  if (isPending && mode !== "validate") return { mayContinue: true, output };
  return {
    mayContinue: false,
    exitCode: output.reasonCodes.some((code) => INFRASTRUCTURE_REASON_CODES.has(code))
      ? EXIT_INFRASTRUCTURE_FAILURE
      : EXIT_SCHEMA_REJECTED,
    output
  };
}

function operationErrorOutcome(error, mode) {
  const code = error?.code;
  const reasonCode = typeof code === "string" && SAFE_REASON_CODES.has(code)
    ? code
    : /^SQLITE_(?:BUSY|LOCKED)(?:_|$)/.test(String(code))
      ? "database_unavailable"
      : "unexpected_execution_failure";
  return {
    exitCode: INFRASTRUCTURE_REASON_CODES.has(reasonCode)
      ? EXIT_INFRASTRUCTURE_FAILURE
      : EXIT_SCHEMA_REJECTED,
    output: closedOutput({ mode, reasonCodes: [reasonCode] })
  };
}

export async function runWalletFirstSetupDeliveryHandoffsSchemaCli({
  argv,
  operations = DEFAULT_OPERATIONS
} = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    const reasonCode = CONTRACT_ERRORS.has(error) ? error.reasonCode : "unexpected_execution_failure";
    return {
      exitCode: CONTRACT_ERRORS.has(error) ? EXIT_CONTRACT_REJECTED : EXIT_INFRASTRUCTURE_FAILURE,
      output: closedOutput({ mode: error?.mode ?? null, reasonCodes: [reasonCode] })
    };
  }
  let validation;
  try {
    validation = await operationFrom(
      operations,
      "validateWalletFirstSetupDeliveryHandoffsSchema"
    )({ dbPath: parsed.dbPath });
  } catch (error) {
    return operationErrorOutcome(error, parsed.mode);
  }
  const preflight = validationOutcome(validation, parsed.mode);
  if (parsed.mode === "validate" || preflight.mayContinue !== true) {
    return { exitCode: preflight.exitCode, output: preflight.output };
  }
  try {
    const result = await (parsed.mode === "dry-run"
      ? operationFrom(operations, "dryRunWalletFirstSetupDeliveryHandoffsMigrations")({
        dbPath: parsed.dbPath,
        tempRoot: parsed.tempRoot
      })
      : operationFrom(operations, "applyWalletFirstSetupDeliveryHandoffsMigrations")({
        dbPath: parsed.dbPath,
        expectedMigrationId: parsed.expectedMigrationId,
        expectedDdlChecksum: parsed.expectedDdlChecksum
      }));
    const output = closedOutput({ ...result, mode: parsed.mode });
    if (output.ok && output.schemaState === "ready" && output.reasonCodes.length === 0) {
      return { exitCode: EXIT_SUCCESS, output };
    }
    return {
      exitCode: output.reasonCodes.some((code) => INFRASTRUCTURE_REASON_CODES.has(code))
        ? EXIT_INFRASTRUCTURE_FAILURE
        : EXIT_SCHEMA_REJECTED,
      output
    };
  } catch (error) {
    return operationErrorOutcome(error, parsed.mode);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runWalletFirstSetupDeliveryHandoffsSchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
