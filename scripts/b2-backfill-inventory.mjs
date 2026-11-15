// B2-a backfill inventory CLI (read-only): prints the B2 backfill inventory
// for one subscription-control database as JSON on stdout.
//
// Read-only by construction: the database is opened with better-sqlite3
// `{ readonly: true, fileMustExist: true }`, the control store is built with
// `initializeSchema: false` (no DDL, no WAL pragma, no parent-directory
// creation), and nothing in this script writes. Usage:
//
//   node scripts/b2-backfill-inventory.mjs <control-database-path>
//
// The output carries account ids and digests only, never raw emails.

import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../server/services/platform/subscription-control-db.mjs";
import { buildB2BackfillInventory } from "../server/services/platform/b2-backfill-inventory.mjs";

function readInventory(dbPath) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const store = createSqliteSubscriptionControlStore({ database, initializeSchema: false });
    const accounts = store.listAccounts();
    let bindingsTablePresent = true;
    let boundAccountIds = [];
    try {
      boundAccountIds = database.prepare(
        "SELECT DISTINCT account_id FROM platform_identity_bindings"
      ).all().map((row) => row.account_id);
    } catch (error) {
      // A snapshot that predates B2-2 has no bindings table: that means zero
      // bindings, not a failure. Any other error is real and propagates.
      if (!/no such table/i.test(error.message)) throw error;
      bindingsTablePresent = false;
    }
    return {
      generatedAt: new Date().toISOString(),
      source: { dbPath, bindingsTablePresent },
      ...buildB2BackfillInventory({ accounts, boundAccountIds })
    };
  } finally {
    database.close();
  }
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("b2 backfill inventory requires one control database path");
  }
  return readInventory(argv[0]);
}

try {
  const inventory = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`b2 backfill inventory failed: ${error.message}\n`);
  process.exitCode = 1;
}
