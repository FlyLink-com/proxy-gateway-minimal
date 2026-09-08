import Database from "better-sqlite3";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPortalReferralMigration,
  validatePortalReferralSchema,
  REFERRAL_MIGRATION_ID,
  REFERRAL_DDL_CHECKSUM,
} from "../server/services/platform/portal-referral-migrations.mjs";
import {
  digest,
  referralError,
} from "../server/services/platform/portal-referral-contract.mjs";

export function runPortalReferralSchemaCli(argv) {
  let source, snapshot;
  let mode = null;
  try {
    const flags = new Map();
    const allowed = [
      "--mode",
      "--db-path",
      "--confirm-migration-id",
      "--confirm-ddl-checksum",
    ];
    for (let i = 0; i < argv.length; i += 2) {
      if (
        !allowed.includes(argv[i]) ||
        flags.has(argv[i]) ||
        !argv[i + 1] ||
        argv[i + 1].startsWith("--")
      )
        throw referralError("referral_request_invalid");
      flags.set(argv[i], argv[i + 1]);
    }
    mode = flags.get("--mode");
    const dbPath = flags.get("--db-path");
    if (
      !["validate", "dry-run", "apply"].includes(mode) ||
      typeof dbPath !== "string" ||
      !isAbsolute(dbPath)
    )
      throw referralError("referral_request_invalid");
    const confirmation = {
      expectedMigrationId: flags.get("--confirm-migration-id"),
      expectedDdlChecksum: flags.get("--confirm-ddl-checksum"),
    };
    if (mode === "apply") {
      if (
        confirmation.expectedMigrationId !== REFERRAL_MIGRATION_ID ||
        confirmation.expectedDdlChecksum !== REFERRAL_DDL_CHECKSUM
      )
        throw referralError("referral_migration_confirmation_required");
    } else if (
      confirmation.expectedMigrationId !== undefined ||
      confirmation.expectedDdlChecksum !== undefined
    )
      throw referralError("referral_request_invalid");
    source = new Database(dbPath, {
      readonly: mode !== "apply",
      fileMustExist: true,
    });
    let applied = false,
      sourceChanged = false;
    if (mode === "dry-run") {
      // SQLite serialization includes the committed WAL view. All DDL runs on
      // this isolated in-memory copy, never on the source database connection.
      const bytes = source.serialize(),
        before = digest(bytes);
      // sqlite3_deserialize cannot read WAL-format images. Normalize only this
      // independent input buffer, retaining the original bytes for source checks.
      // https://www.sqlite.org/c3ref/deserialize.html
      const snapshotBytes = Buffer.from(bytes);
      snapshotBytes[18] = 1;
      snapshotBytes[19] = 1;
      snapshot = new Database(snapshotBytes);
      applied = applyPortalReferralMigration(snapshot, {
        expectedMigrationId: REFERRAL_MIGRATION_ID,
        expectedDdlChecksum: REFERRAL_DDL_CHECKSUM,
      }).applied;
      sourceChanged = before !== digest(source.serialize());
    } else if (mode === "apply")
      applied = applyPortalReferralMigration(source, confirmation).applied;
    const ok =
      validatePortalReferralSchema(snapshot || source) && !sourceChanged;
    return {
      exitCode: ok ? 0 : 3,
      output: {
        ok,
        mode,
        migrationId: REFERRAL_MIGRATION_ID,
        ddlChecksum: REFERRAL_DDL_CHECKSUM,
        applied,
        sourceChanged,
      },
    };
  } catch (error) {
    const safe = [
      "referral_request_invalid",
      "referral_migration_confirmation_required",
      "referral_schema_dependency_missing",
      "referral_schema_conflict",
    ];
    return {
      exitCode: 2,
      output: {
        ok: false,
        mode,
        reason: safe.includes(error.code)
          ? error.code
          : "referral_schema_unavailable",
      },
    };
  } finally {
    snapshot?.close();
    source?.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const outcome = runPortalReferralSchemaCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`);
  process.exitCode = outcome.exitCode;
}
