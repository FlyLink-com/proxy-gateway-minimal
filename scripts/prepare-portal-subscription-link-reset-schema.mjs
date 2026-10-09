import Database from "better-sqlite3";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { checkPortalSubscriptionLinkResetSchema, ensurePortalSubscriptionLinkResetSchema } from "../server/services/platform/portal-subscription-link-reset-store.mjs";

// No database discovery, environment loading, service operations or implicit
// apply. Production use requires separately approved backup/migration steps.
export function preparePortalSubscriptionLinkResetSchema(args) {
  let dbPath;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--db" && !dbPath && args[i + 1] && !args[i + 1].startsWith("--")) dbPath = args[++i];
    else if (args[i] === "--apply" && !apply) apply = true;
    else throw Object.assign(new Error("Use --db <existing SQLite file> [--apply]"), { code: "validation_error" });
  }
  if (!dbPath) throw Object.assign(new Error("Explicit database path is required"), { code: "validation_error" });
  const db = new Database(resolve(dbPath), { fileMustExist: true, readonly: !apply });
  try {
    db.pragma("busy_timeout = 2000");
    if (!db.prepare("select name from sqlite_master where type = 'table' and name = 'platform_portal_access_requests'").get()) {
      throw Object.assign(new Error("Control schema is unavailable"), { code: "subscription_link_reset_schema_unavailable" });
    }
    if (apply) ensurePortalSubscriptionLinkResetSchema(db);
    else checkPortalSubscriptionLinkResetSchema(db);
    return { status: "ok", mode: apply ? "apply" : "check", schema: "portal-subscription-link-reset-v1", applicationFeatureChanged: false };
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(preparePortalSubscriptionLinkResetSchema(process.argv.slice(2)))}\n`); }
  catch (error) {
    const code = ["validation_error", "subscription_link_reset_schema_unavailable"].includes(error.code) ? error.code : "schema_preparation_failed";
    process.stderr.write(`${JSON.stringify({ status: "error", code })}\n`);
    process.exitCode = 1;
  }
}
