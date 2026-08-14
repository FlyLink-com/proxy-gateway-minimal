import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
  WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS,
  applyWalletFirstDeferredCheckoutMigrations,
  dryRunWalletFirstDeferredCheckoutMigrations,
  validateWalletFirstDeferredCheckoutSchema
} from "../server/services/platform/wallet-first-deferred-checkout-migrations.mjs";

const MODES = new Set(["validate", "dry-run", "apply"]);
const FLAGS = new Set([
  "--mode",
  "--db-path",
  "--temp-root",
  "--confirm-migration-id",
  "--confirm-ddl-checksum"
]);
const REASONS = new Set([
  "applied_schema_incompatible",
  "apply_confirmation_required",
  "argument_not_allowed_for_mode",
  "database_path_must_be_absolute",
  "database_path_required",
  "database_inspection_failed",
  "database_invalid",
  "database_missing",
  "deferred_checkout_account_unavailable",
  "foreign_key_check_failed",
  "invalid_migration_contract",
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
  "unknown_argument",
  "duplicate_argument",
  "empty_argument",
  "invalid_mode",
  "unexpected_execution_failure"
]);

function contractError(reasonCode, mode = null) {
  const error = new Error("Wallet-first deferred checkout schema CLI rejected arguments");
  error.reasonCode = reasonCode;
  error.mode = mode;
  return error;
}

function pathIsAbsolute(value) {
  return typeof value === "string" && isAbsolute(value);
}

function parse(argv) {
  if (!Array.isArray(argv)) throw contractError("unknown_argument");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!FLAGS.has(flag)) throw contractError("unknown_argument");
    if (values.has(flag)) throw contractError("duplicate_argument");
    if (typeof value !== "string" || value.length === 0 || FLAGS.has(value)) {
      throw contractError("empty_argument");
    }
    values.set(flag, value);
  }
  const mode = values.get("--mode") ?? null;
  if (!mode) throw contractError("mode_required");
  if (!MODES.has(mode)) throw contractError("invalid_mode");
  const dbPath = values.get("--db-path");
  if (!dbPath) throw contractError("database_path_required", mode);
  if (!pathIsAbsolute(dbPath)) throw contractError("database_path_must_be_absolute", mode);
  const tempRoot = values.get("--temp-root") ?? null;
  const migrationId = values.get("--confirm-migration-id") ?? null;
  const checksum = values.get("--confirm-ddl-checksum") ?? null;
  if (tempRoot !== null && !pathIsAbsolute(tempRoot)) {
    throw contractError("temp_root_must_be_absolute", mode);
  }
  if (mode !== "dry-run" && tempRoot !== null) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (mode !== "apply" && (migrationId !== null || checksum !== null)) {
    throw contractError("argument_not_allowed_for_mode", mode);
  }
  if (mode === "apply" && (migrationId === null || checksum === null)) {
    throw contractError("apply_confirmation_required", mode);
  }
  if (mode === "apply" && migrationId !== REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID) {
    throw contractError("migration_id_mismatch", mode);
  }
  if (mode === "apply" && checksum !== WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATIONS[0].ddlChecksum) {
    throw contractError("migration_checksum_mismatch", mode);
  }
  return { mode, dbPath, tempRoot, migrationId, checksum };
}

function closed({
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
    schemaState: ["ready", "pending", "blocked"].includes(schemaState)
      ? schemaState
      : "blocked",
    requiredMigrationId: REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID,
    sourceChanged: sourceChanged === true,
    checks: {
      deferredTransitionDependency: checks.deferredTransitionDependency === true,
      schemaExact: checks.schemaExact === true,
      quickCheck: checks.quickCheck === true,
      foreignKeys: checks.foreignKeys === true
    },
    reasonCodes: reasonCodes.filter((code) => REASONS.has(code)),
    appliedMigrationIds: appliedMigrationIds.filter(
      (id) => id === REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID
    ),
    pendingMigrationIds: pendingMigrationIds.filter(
      (id) => id === REQUIRED_WALLET_FIRST_DEFERRED_CHECKOUT_MIGRATION_ID
    )
  };
}

function exitFor(result) {
  if (result.ok) return 0;
  if (result.reasonCodes.some((code) => [
    "database_inspection_failed", "unexpected_execution_failure"
  ].includes(code))) return 4;
  return 3;
}

function errorOutcome(error, mode = null) {
  const code = error?.reasonCode ?? error?.code;
  return {
    exitCode: code === "apply_confirmation_required" || code?.endsWith("required")
      || code?.includes("argument") || code?.includes("migration_")
      ? 2
      : 4,
    output: closed({
      mode,
      reasonCodes: REASONS.has(code) ? [code] : ["unexpected_execution_failure"]
    })
  };
}

export async function runWalletFirstDeferredCheckoutSchemaCli({
  argv,
  operations = {
    validateWalletFirstDeferredCheckoutSchema,
    dryRunWalletFirstDeferredCheckoutMigrations,
    applyWalletFirstDeferredCheckoutMigrations
  }
} = {}) {
  let parsed;
  try {
    parsed = parse(argv);
    const validation = operations.validateWalletFirstDeferredCheckoutSchema({
      dbPath: parsed.dbPath
    });
    if (parsed.mode === "validate") {
      const output = closed({ ...validation, mode: parsed.mode });
      return { exitCode: exitFor(output), output };
    }
    if (
      validation.schemaState === "blocked"
      && !validation.reasonCodes.includes("required_migration_missing")
    ) {
      const output = closed({ ...validation, mode: parsed.mode });
      return { exitCode: exitFor(output), output };
    }
    const result = parsed.mode === "dry-run"
      ? await operations.dryRunWalletFirstDeferredCheckoutMigrations({
        dbPath: parsed.dbPath,
        tempRoot: parsed.tempRoot ?? undefined
      })
      : operations.applyWalletFirstDeferredCheckoutMigrations({
        dbPath: parsed.dbPath,
        expectedMigrationId: parsed.migrationId,
        expectedDdlChecksum: parsed.checksum
      });
    const output = closed({ ...result, mode: parsed.mode });
    return { exitCode: exitFor(output), output };
  } catch (error) {
    return errorOutcome(error, parsed?.mode ?? error?.mode ?? null);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outcome = await runWalletFirstDeferredCheckoutSchemaCli({
    argv: process.argv.slice(2)
  });
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
