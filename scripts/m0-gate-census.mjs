#!/usr/bin/env node
// M0 formal Identity Gate — census helper v2.
// Read-only aggregate census of ONE database file (a standalone snapshot, or
// the production DB via a normal WAL-aware read-only connection — never
// immutable=1). Every query runs in one BEGIN DEFERRED read transaction so
// schema, counts and the binding digest describe one SQLite read snapshot.
// Credential refs are hashed host-side and are never printed.
// Usage: node m0-gate-census.mjs <dbAbsPath>
// Output: one JSON line with schemaVersion, schemaDigest, credentialsTotal,
// six perChannel counts, otherChannelsTotal, accessRequestsTotal, bindingRows,
// bindingProjectionDigest and successful count-equality flags.
import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import Database from "better-sqlite3";

const CHANNELS = [
  "channel-vultr-a-vless-reality-tcp",
  "channel-vultr-a-hy2",
  "channel-vultr-a-tuic",
  "channel-vultr-jp-01-vless-reality-tcp",
  "channel-vultr-jp-01-hy2",
  "channel-vultr-jp-01-tuic"
];
const [path] = process.argv.slice(2);
function fail(code) {
  process.stdout.write(JSON.stringify({ ok: false, code }) + "\n");
  process.exit(1);
}
if (!path || !isAbsolute(path)) fail("args_invalid");
if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) fail("db_invalid");

let db;
try {
  db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  db.pragma("busy_timeout = 2000");

  // better-sqlite3's deferred transaction issues BEGIN DEFERRED. The first
  // SELECT below establishes the read snapshot; all subsequent reads remain
  // pinned to that same snapshot until this callback returns.
  const readSnapshot = db.transaction(() => {
    const schemaRows = db.prepare(
      "SELECT type, name, tbl_name, COALESCE(sql, '') AS sql FROM sqlite_master ORDER BY type, name"
    ).all();
    const schemaVersion = db.pragma("schema_version", { simple: true });
    const schemaDigest = createHash("sha256")
      .update(schemaRows.map((r) => r.type + "|" + r.name + "|" + r.tbl_name + "|" + r.sql).join("\n"))
      .digest("hex");

    const credentialsTotal = db.prepare(
      "SELECT COUNT(*) AS n FROM platform_portal_edge_credentials"
    ).get().n;
    const grouped = db.prepare(
      "SELECT edge_channel_ref AS ch, COUNT(*) AS n FROM platform_portal_edge_credentials GROUP BY edge_channel_ref"
    ).all();
    const perChannel = {};
    let otherChannelsTotal = 0;
    for (const row of grouped) {
      if (CHANNELS.includes(row.ch)) perChannel[row.ch] = row.n;
      else otherChannelsTotal += row.n;
    }
    for (const ch of CHANNELS) if (!(ch in perChannel)) perChannel[ch] = 0;

    const accessRequestsTotal = db.prepare(
      "SELECT COUNT(*) AS n FROM platform_portal_access_requests"
    ).get().n;
    const bindings = db.prepare(
      "SELECT edge_channel_ref AS ch, edge_credential_ref AS ref FROM platform_portal_edge_credentials ORDER BY edge_channel_ref, edge_credential_ref"
    ).all();
    const bindingProjectionDigest = createHash("sha256")
      .update(bindings.map((b) => b.ch + "|" + b.ref).join("\n"))
      .digest("hex");

    const bindingRows = bindings.length;
    const namedChannelTotal = CHANNELS.reduce((sum, ch) => sum + perChannel[ch], 0);
    const equalities = {
      bindingRowsEqCredentialsTotal: bindingRows === credentialsTotal,
      channelCountsEqCredentialsTotal: namedChannelTotal + otherChannelsTotal === credentialsTotal
    };
    if (!equalities.bindingRowsEqCredentialsTotal || !equalities.channelCountsEqCredentialsTotal) {
      throw Object.assign(new Error("census_inconsistent"), { gateCode: "census_inconsistent" });
    }

    return {
      ok: true,
      schemaVersion,
      schemaDigest,
      credentialsTotal,
      perChannel,
      otherChannelsTotal,
      accessRequestsTotal,
      bindingRows,
      bindingProjectionDigest,
      equalities
    };
  }).deferred();

  const result = readSnapshot();
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  fail(error?.gateCode === "census_inconsistent" ? "census_inconsistent" : "census_failed");
} finally {
  try { db?.close(); } catch { /* ignore */ }
}
