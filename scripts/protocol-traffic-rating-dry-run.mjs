// Read-only impact check. --apply and --migrate never open a database.
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";
import { inspectProtocolTrafficRating } from "../server/services/platform/protocol-traffic-rating.mjs";

const args = process.argv.slice(2);
const refuse = (reason, apply = "not_performed") => {
  console.log(JSON.stringify({ ok: false, apply, reason }));
  process.exit(2);
};
if (args.some((arg) => arg === "--apply" || arg === "--migrate")) refuse("apply_refused", "refused");
if (args.length === 0) refuse("target_required");
if (args.length !== 2 || args[0] !== "--db" || !isAbsolute(args[1]) || !existsSync(args[1])) refuse("target_unproven");
let info;
try { info = statSync(args[1]); } catch { refuse("target_unproven"); }
if (!info.isFile()) refuse("target_unproven");
let db;
try {
  db = new Database(args[1], { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  const report = inspectProtocolTrafficRating(db);
  console.log(JSON.stringify(report));
} catch {
  refuse("target_unproven");
} finally {
  db?.close();
}
