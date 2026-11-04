import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT_HELPER = join(ROOT, "scripts", "m0-gate-snapshot.mjs");
const CENSUS_HELPER = join(ROOT, "scripts", "m0-gate-census.mjs");
const CHANNELS = [
  "channel-vultr-a-vless-reality-tcp",
  "channel-vultr-a-hy2",
  "channel-vultr-a-tuic",
  "channel-vultr-jp-01-vless-reality-tcp",
  "channel-vultr-jp-01-hy2",
  "channel-vultr-jp-01-tuic"
];
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");

test("M0 helpers preserve WAL and emit a single-snapshot, aggregate-only census", t => {
  const dir = mkdtempSync(join(tmpdir(), "m0-gate-helper-fixture-"));
  const source = join(dir, "source.sqlite");
  const snapshot = join(dir, "snapshot.sqlite");
  const db = new Database(source);
  t.after(() => {
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  });

  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 0");
  db.exec("CREATE TABLE platform_portal_edge_credentials (edge_channel_ref TEXT NOT NULL, edge_credential_ref TEXT NOT NULL);\n" +
    "CREATE TABLE platform_portal_access_requests (id TEXT NOT NULL);");
  const insert = db.prepare("INSERT INTO platform_portal_edge_credentials VALUES (?, ?)");
  insert.run(CHANNELS[0], "synthetic-ref-vless");
  insert.run(CHANNELS[1], "synthetic-ref-hy2");
  insert.run(CHANNELS[2], "synthetic-ref-tuic");
  insert.run("channel-synthetic-other-a", "synthetic-ref-other-a");
  insert.run("channel-synthetic-other-b", "synthetic-ref-other-b");
  db.prepare("INSERT INTO platform_portal_access_requests VALUES (?)").run("synthetic-request-1");
  db.prepare("INSERT INTO platform_portal_access_requests VALUES (?)").run("synthetic-request-2");

  const walPath = source + "-wal";
  assert.equal(existsSync(walPath), true, "fixture must retain an active WAL sidecar");
  const walBefore = sha256(walPath);

  const snapshotStdout = execFileSync(process.execPath, [SNAPSHOT_HELPER, source, snapshot], { encoding: "utf8" });
  const snapshotResult = JSON.parse(snapshotStdout.trim());
  assert.deepEqual(Object.keys(snapshotResult).sort(), ["bytes", "integrity", "journalMode", "ok"]);
  assert.equal(snapshotResult.ok, true);
  assert.equal(snapshotResult.integrity, "ok");
  assert.equal(typeof snapshotResult.bytes, "number");
  assert.equal(typeof snapshotResult.journalMode, "string");
  assert.equal(sha256(walPath), walBefore, "read-only Backup API must not change source WAL bytes");
  assert.equal(existsSync(snapshot + "-wal"), false);
  assert.equal(existsSync(snapshot + "-shm"), false);

  const censusStdout = execFileSync(process.execPath, [CENSUS_HELPER, snapshot], { encoding: "utf8" });
  const census = JSON.parse(censusStdout.trim());
  assert.equal(census.ok, true);
  assert.equal(census.credentialsTotal, 5);
  assert.equal(census.bindingRows, 5);
  assert.equal(census.otherChannelsTotal, 2);
  assert.equal(census.accessRequestsTotal, 2);
  assert.deepEqual(census.perChannel, {
    [CHANNELS[0]]: 1,
    [CHANNELS[1]]: 1,
    [CHANNELS[2]]: 1,
    [CHANNELS[3]]: 0,
    [CHANNELS[4]]: 0,
    [CHANNELS[5]]: 0
  });
  assert.deepEqual(census.equalities, {
    bindingRowsEqCredentialsTotal: true,
    channelCountsEqCredentialsTotal: true
  });
  const output = JSON.stringify(census);
  for (const secret of ["synthetic-ref-", "synthetic-request-"]) assert.equal(output.includes(secret), false);
  db.close();
});
