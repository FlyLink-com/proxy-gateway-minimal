import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
  REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM,
  isFullyQualifiedSubscriptionDistributionPath,
  validateSubscriptionDistributionSchema,
  dryRunSubscriptionDistributionMigrations,
  applySubscriptionDistributionMigrations
} from "../server/services/platform/subscription-distribution-migrations.mjs";

const DEFAULT_OPERATIONS = { validateSubscriptionDistributionSchema, dryRunSubscriptionDistributionMigrations, applySubscriptionDistributionMigrations };
const FLAGS = new Set(["--mode", "--db-path", "--temp-root", "--confirm-migration-id", "--confirm-ddl-checksum"]);
const SAFE_REASONS = new Set(["invalid_migration_contract", "migration_id_mismatch", "migration_checksum_mismatch", "required_migration_missing", "third_party_schema_required", "owned_object_without_migration", "owned_object_incompatible", "quick_check_failed", "foreign_key_check_failed", "database_inspection_failed", "database_missing", "invalid_temp_root", "source_changed_during_dry_run", "applied_schema_incompatible", "database_unavailable"]);
const rejected = reason => ({ exitCode: 2, output: { ok: false, mode: null, schemaState: "blocked", reasonCodes: [reason] } });
export async function runSubscriptionDistributionSchemaCli({ argv, operations = DEFAULT_OPERATIONS } = {}) {
  const args = {};
  if (!Array.isArray(argv) || argv.length % 2) return rejected("invalid_migration_contract");
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!FLAGS.has(key) || Object.hasOwn(args, key) || typeof value !== "string" || !value) return rejected("invalid_migration_contract");
    args[key] = value;
  }
  const mode = args["--mode"], dbPath = args["--db-path"], tempRoot = args["--temp-root"];
  if (!["validate", "dry-run", "apply"].includes(mode) || !isFullyQualifiedSubscriptionDistributionPath(dbPath)
    || (tempRoot !== undefined && (!isFullyQualifiedSubscriptionDistributionPath(tempRoot) || mode !== "dry-run"))
    || (mode !== "apply" && (args["--confirm-migration-id"] !== undefined || args["--confirm-ddl-checksum"] !== undefined))) return rejected("invalid_migration_contract");
  if (mode === "apply" && (args["--confirm-migration-id"] !== REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID
    || args["--confirm-ddl-checksum"] !== REQUIRED_SUBSCRIPTION_DISTRIBUTION_DDL_CHECKSUM)) return rejected("invalid_migration_contract");
  try {
    const result = await (mode === "validate" ? operations.validateSubscriptionDistributionSchema({ dbPath })
      : mode === "dry-run" ? operations.dryRunSubscriptionDistributionMigrations({ dbPath, tempRoot })
        : operations.applySubscriptionDistributionMigrations({ dbPath, expectedMigrationId: args["--confirm-migration-id"], expectedDdlChecksum: args["--confirm-ddl-checksum"] }));
    const safeReasons = Array.isArray(result.reasonCodes) && result.reasonCodes.every(code => SAFE_REASONS.has(code)) ? result.reasonCodes : ["database_unavailable"];
    const output = { mode, ok: result.ok === true, schemaState: ["ready", "pending", "blocked"].includes(result.schemaState) ? result.schemaState : "blocked",
      requiredMigrationId: REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID,
      checks: Object.fromEntries(["schemaExact", "quickCheck", "foreignKeys"].map(key => [key, result.checks?.[key] === true])),
      reasonCodes: safeReasons, sourceChanged: result.sourceChanged === true,
      appliedMigrationIds: (result.appliedMigrationIds || []).filter(id => id === REQUIRED_SUBSCRIPTION_DISTRIBUTION_MIGRATION_ID),
      restoreVerified: result.restoreVerified === true };
    return { exitCode: output.ok && safeReasons.length === 0 ? 0 : 3, output };
  } catch (error) {
    const code = SAFE_REASONS.has(error?.code) ? error.code : "database_unavailable";
    return { exitCode: 4, output: { mode, ok: false, schemaState: "blocked", reasonCodes: [code] } };
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await runSubscriptionDistributionSchemaCli({ argv: process.argv.slice(2) });
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
