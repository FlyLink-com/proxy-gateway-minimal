import { lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATION_ID as ID,
  COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS
} from "../server/services/platform/coin-commerce-initial-confirmation-guard-plan-c-ddl.mjs";
import {
  applyCoinCommerceInitialConfirmationGuardMigrations,
  dryRunCoinCommerceInitialConfirmationGuardMigrations,
  validateCoinCommerceInitialConfirmationGuardSchema
} from "../server/services/platform/coin-commerce-initial-confirmation-guard-plan-c-schema.mjs";

const CHECKSUM = COIN_COMMERCE_INITIAL_CONFIRMATION_GUARD_MIGRATIONS[0].ddlChecksum;
const MODES = new Set(["validate", "dry-run", "apply"]);
const FLAGS = new Set(["--mode", "--db-path", "--temp-root", "--confirm-migration-id", "--confirm-ddl-checksum"]);
const CONTRACT_REASONS = new Set([
  "argument_not_allowed_for_mode", "apply_confirmation_required",
  "database_path_must_be_absolute", "database_path_required", "duplicate_argument",
  "empty_argument", "invalid_mode", "migration_checksum_mismatch",
  "migration_id_mismatch", "mode_required", "temp_root_must_be_absolute", "unknown_argument"
]);
const SCHEMA_ERRORS = new Set([
  "commerce_initial_confirmation_schema_incompatible",
  "commerce_initial_confirmation_guard_migration_missing",
  "commerce_initial_confirmation_guard_schema_incompatible",
  "commerce_migration_id_mismatch", "commerce_migration_checksum_mismatch"
]);
const SAFE_REASONS = new Set([
  ...CONTRACT_REASONS, ...SCHEMA_ERRORS,
  "commerce_invalid_database_path", "commerce_invalid_temp_root",
  "commerce_source_changed_during_dry_run",
  "commerce_initial_confirmation_guard_migration_failed",
  "database_close_failed", "database_inspection_failed",
  "database_invalid", "database_missing", "database_unavailable"
]);

function rejected(reasonCode) {
  return { exitCode: 2, output: {
    ok: false, mode: null, requiredMigrationId: ID,
    ddlChecksum: CHECKSUM, sourceChanged: false, redacted: true, reasonCode
  } };
}

function parse(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) return { error: "unknown_argument" };
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!FLAGS.has(flag)) return { error: "unknown_argument" };
    if (args.has(flag)) return { error: "duplicate_argument" };
    if (typeof value !== "string" || !value || FLAGS.has(value)) return { error: "empty_argument" };
    args.set(flag, value);
  }
  const mode = args.get("--mode");
  if (!mode) return { error: "mode_required" };
  if (!MODES.has(mode)) return { error: "invalid_mode" };
  const dbPath = args.get("--db-path");
  if (!dbPath) return { error: "database_path_required" };
  if (!isAbsolute(dbPath)) return { error: "database_path_must_be_absolute" };
  const tempRoot = args.get("--temp-root");
  const confirmId = args.get("--confirm-migration-id");
  const confirmChecksum = args.get("--confirm-ddl-checksum");
  if (tempRoot && !isAbsolute(tempRoot)) return { error: "temp_root_must_be_absolute" };
  if (tempRoot && mode !== "dry-run") return { error: "argument_not_allowed_for_mode" };
  if (mode !== "apply" && (confirmId || confirmChecksum)) return { error: "argument_not_allowed_for_mode" };
  if (mode === "apply" && (!confirmId || !confirmChecksum)) return { error: "apply_confirmation_required" };
  if (mode === "apply" && confirmId !== ID) return { error: "migration_id_mismatch" };
  if (mode === "apply" && confirmChecksum !== CHECKSUM) return { error: "migration_checksum_mismatch" };
  return { options: { mode, dbPath, tempRoot, confirmId, confirmChecksum } };
}

function safeOutput(result, mode) {
  return {
    ok: result.ok === true,
    mode,
    requiredMigrationId: ID,
    ddlChecksum: CHECKSUM,
    sourceChanged: result.sourceChanged === true,
    checks: {
      schemaExact: result.checks?.schemaExact === true,
      walletDependency: result.checks?.walletDependency === true,
      quickCheck: result.checks?.quickCheck === true,
      foreignKeys: result.checks?.foreignKeys === true,
      initialConfirmationExtension: result.checks?.initialConfirmationExtension === true,
      initialConfirmationGuardPlanC: result.checks?.initialConfirmationGuardPlanC === true
    },
    appliedMigrationIds: (result.appliedMigrationIds ?? []).filter((value) => value === ID),
    pendingMigrationIds: (result.pendingMigrationIds ?? []).filter((value) => value === ID),
    reasonCodes: (result.reasonCodes ?? []).filter((value) => SAFE_REASONS.has(value)),
    redacted: true
  };
}

export async function runCoinCommerceInitialConfirmationGuardSchemaCli({ argv = process.argv.slice(2) } = {}) {
  const parsed = parse(argv);
  if (parsed.error) return rejected(parsed.error);
  const options = parsed.options;
  try {
    const stat = lstatSync(options.dbPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { exitCode: 4, output: {
        ok: false, mode: options.mode, requiredMigrationId: ID,
        ddlChecksum: CHECKSUM, sourceChanged: false, redacted: true,
        reasonCodes: ["database_unavailable"]
      } };
    }
    let result;
    if (options.mode === "validate") {
      result = validateCoinCommerceInitialConfirmationGuardSchema({ dbPath: options.dbPath });
    } else if (options.mode === "dry-run") {
      result = await dryRunCoinCommerceInitialConfirmationGuardMigrations({
        dbPath: options.dbPath, tempRoot: options.tempRoot
      });
    } else {
      result = applyCoinCommerceInitialConfirmationGuardMigrations({
        dbPath: options.dbPath,
        expectedMigrationId: options.confirmId,
        expectedDdlChecksum: options.confirmChecksum
      });
    }
    return { exitCode: result.ok === true ? 0 : 3, output: safeOutput(result, options.mode) };
  } catch (error) {
    const schemaFailure = SCHEMA_ERRORS.has(error?.code);
    return { exitCode: schemaFailure ? 3 : 4, output: {
      ok: false, mode: options.mode, requiredMigrationId: ID,
      ddlChecksum: CHECKSUM, sourceChanged: false, redacted: true,
      reasonCodes: [SAFE_REASONS.has(error?.code) ? error.code : "database_unavailable"]
    } };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await runCoinCommerceInitialConfirmationGuardSchemaCli({ argv: process.argv.slice(2) });
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
