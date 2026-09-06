import { lstatSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  REQUIRED_COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATION_ID as ID,
  COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS,
  inspectCoinCommerceInitialConfirmationSchema,
  applyCoinCommerceInitialConfirmationMigrations,
  removeUnusedCoinCommerceInitialConfirmationMigration,
  dryRunCoinCommerceInitialConfirmationMigrations
} from "../server/services/platform/coin-commerce-migrations.mjs";

const CHECKSUM = COIN_COMMERCE_INITIAL_CONFIRMATION_MIGRATIONS[0].ddlChecksum;
const MODES = new Set(["validate", "dry-run", "apply", "remove-unused"]);
const FLAGS = new Set(["--mode", "--db-path", "--temp-root", "--confirm-migration-id", "--confirm-ddl-checksum"]);
function contract() { throw Object.assign(new Error("schema_contract_rejected"), { code: "schema_contract_rejected" }); }
function absolute(value) {
  return typeof value === "string" && isAbsolute(value)
    && (process.platform !== "win32" || /^[A-Za-z]:[\\/]/.test(value));
}
function parse(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) contract();
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!FLAGS.has(argv[index]) || args.has(argv[index]) || typeof argv[index + 1] !== "string"
      || !argv[index + 1] || argv[index + 1].startsWith("--")) contract();
    args.set(argv[index], argv[index + 1]);
  }
  const mode = args.get("--mode");
  if (!MODES.has(mode) || !absolute(args.get("--db-path"))) contract();
  const writes = mode === "apply" || mode === "remove-unused";
  if (writes ? args.get("--confirm-migration-id") !== ID || args.get("--confirm-ddl-checksum") !== CHECKSUM
    : args.has("--confirm-migration-id") || args.has("--confirm-ddl-checksum")) contract();
  if (args.has("--temp-root") && (mode !== "dry-run" || !absolute(args.get("--temp-root")))) contract();
  return { mode, dbPath: args.get("--db-path"), tempRoot: args.get("--temp-root") };
}

// This schema-only CLI cannot select an order or perform confirmation. Its two
// write modes require a separately approved operator invocation and exact DDL.
export async function runInitialConfirmationSchemaCli(argv) {
  let options;
  try { options = parse(argv); } catch {
    return { exitCode: 2, output: { ok: false, reasonCode: "schema_contract_rejected", redacted: true } };
  }
  const base = { mode: options.mode, migrationId: ID, ddlChecksum: CHECKSUM, redacted: true };
  try {
    const stat = lstatSync(options.dbPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid_database");
    let result;
    if (options.mode === "validate") {
      const db = new Database(options.dbPath, { readonly: true, fileMustExist: true });
      try { result = inspectCoinCommerceInitialConfirmationSchema({ database: db }); } finally { db.close(); }
    } else if (options.mode === "dry-run") {
      result = await dryRunCoinCommerceInitialConfirmationMigrations(options);
    } else {
      const operation = options.mode === "apply"
        ? applyCoinCommerceInitialConfirmationMigrations : removeUnusedCoinCommerceInitialConfirmationMigration;
      result = operation({ dbPath: options.dbPath, expectedMigrationId: ID, expectedDdlChecksum: CHECKSUM });
    }
    return { exitCode: result.ok === true ? 0 : 3,
      output: { ...base, ok: result.ok === true, sourceChanged: result.sourceChanged === true,
        ...(options.mode === "dry-run" ? { unusedInverseVerified: result.unusedInverseVerified === true } : {}),
        reasonCode: result.ok === true ? "schema_verified" : "schema_not_ready" } };
  } catch (error) {
    const inUse = error?.code === "commerce_initial_confirmation_migration_in_use";
    return { exitCode: inUse ? 3 : 4,
      output: { ...base, ok: false, reasonCode: inUse ? "extension_in_use" : "schema_operation_unavailable" } };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const result = await runInitialConfirmationSchemaCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}
