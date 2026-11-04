import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync
} from "node:fs";
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

function maybeLstat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertSafeSidecarOrAbsent(path) {
  const stat = maybeLstat(path);
  if (!stat) return;
  assert.equal(stat.isSymbolicLink(), false, "sidecar must not be a symlink");
  assert.equal(stat.isFile(), true, "sidecar must be a regular file");
}

function runJson(helper, args) {
  const proc = spawnSync(process.execPath, [helper, ...args], { encoding: "utf8" });
  assert.equal(proc.error, undefined, proc.error?.message);
  let payload;
  try {
    payload = JSON.parse(proc.stdout.trim());
  } catch {
    assert.fail("helper did not emit one JSON object; stderr=" + proc.stderr);
  }
  return { status: proc.status, payload, stderr: proc.stderr };
}

function assertHelperSuccess(helper, args) {
  const result = runJson(helper, args);
  assert.equal(result.status, 0, "helper failed: " + result.stderr + " " + JSON.stringify(result.payload));
  assert.equal(result.payload.ok, true);
  return result.payload;
}

function assertSidecarRejected(helper, dbPath, dest) {
  const args = dest ? [dbPath, dest] : [dbPath];
  const result = runJson(helper, args);
  assert.equal(result.status, 1, "unsafe sidecar must fail closed");
  assert.deepEqual(result.payload, { ok: false, code: "sidecar_invalid" });
}

function copyWalDatabase(source, directory, name) {
  const copy = join(directory, name + ".sqlite");
  copyFileSync(source, copy);
  copyFileSync(source + "-wal", copy + "-wal");
  return copy;
}

test("M0 helpers protect sidecars and census live WAL consistently with its backup snapshot", t => {
  const dir = mkdtempSync(join(ROOT, "m0-gate-helper-fixture-"));
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
  db.pragma("wal_checkpoint(TRUNCATE)");
  const mainBeforeWalOnlyRows = sha256(source);

  const insert = db.prepare("INSERT INTO platform_portal_edge_credentials VALUES (?, ?)");
  insert.run(CHANNELS[0], "synthetic-ref-vless");
  insert.run(CHANNELS[1], "synthetic-ref-hy2");
  insert.run(CHANNELS[2], "synthetic-ref-tuic");
  insert.run("channel-synthetic-other-a", "synthetic-ref-other-a");
  insert.run("channel-synthetic-other-b", "synthetic-ref-other-b");
  db.prepare("INSERT INTO platform_portal_access_requests VALUES (?)").run("synthetic-request-1");
  db.prepare("INSERT INTO platform_portal_access_requests VALUES (?)").run("synthetic-request-2");

  const walPath = source + "-wal";
  assert.ok(statSync(walPath).size > 32, "fixture must retain WAL-only rows");
  assert.equal(sha256(source), mainBeforeWalOnlyRows, "new fixture rows must remain in WAL, not the main DB");
  assert.equal(maybeLstat(source + "-shm")?.isFile(), true, "writer fixture must have a regular SHM sidecar");
  const mainBefore = sha256(source);
  const walBefore = sha256(walPath);

  const liveCensus = JSON.parse(execFileSync(process.execPath, [CENSUS_HELPER, source], { encoding: "utf8" }).trim());
  assert.equal(liveCensus.ok, true);
  assert.equal(liveCensus.credentialsTotal, 5);
  assert.equal(liveCensus.bindingRows, 5);
  assert.equal(liveCensus.otherChannelsTotal, 2);
  assert.equal(liveCensus.accessRequestsTotal, 2);
  assert.deepEqual(liveCensus.equalities, {
    bindingRowsEqCredentialsTotal: true,
    channelCountsEqCredentialsTotal: true
  });
  assert.equal(sha256(source), mainBefore, "live census must not change source main DB bytes");
  assert.equal(sha256(walPath), walBefore, "live census must not change source WAL bytes");
  assertSafeSidecarOrAbsent(source + "-wal");
  assertSafeSidecarOrAbsent(source + "-shm");

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
  assert.deepEqual(
    readdirSync(dir).filter(name => name.startsWith(".m0-gate-probe-")),
    [],
    "the disposable read-only probe directory must be removed"
  );

  const censusStdout = execFileSync(process.execPath, [CENSUS_HELPER, snapshot], { encoding: "utf8" });
  const census = JSON.parse(censusStdout.trim());
  assert.equal(census.ok, true);
  assert.deepEqual(census, liveCensus, "live WAL census and snapshot census must match exactly");
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
  // R3: a WAL database with no -shm is allowed. SQLite may create transient
  // SHM coordination state, but main DB and WAL bytes must remain unchanged.
  const missingShmForCensus = copyWalDatabase(source, dir, "missing-shm-census");
  assert.equal(maybeLstat(missingShmForCensus + "-shm"), null);
  const missingCensusMainHash = sha256(missingShmForCensus);
  const missingCensusWalHash = sha256(missingShmForCensus + "-wal");
  const missingCensus = assertHelperSuccess(CENSUS_HELPER, [missingShmForCensus]);
  assert.equal(missingCensus.credentialsTotal, 5);
  assert.equal(sha256(missingShmForCensus), missingCensusMainHash);
  assert.equal(sha256(missingShmForCensus + "-wal"), missingCensusWalHash);
  assertSafeSidecarOrAbsent(missingShmForCensus + "-shm");

  const missingShmForBackup = copyWalDatabase(source, dir, "missing-shm-backup");
  assert.equal(maybeLstat(missingShmForBackup + "-shm"), null);
  const missingBackupMainHash = sha256(missingShmForBackup);
  const missingBackupWalHash = sha256(missingShmForBackup + "-wal");
  const missingShmSnapshot = join(dir, "missing-shm-snapshot.sqlite");
  assert.equal(assertHelperSuccess(SNAPSHOT_HELPER, [missingShmForBackup, missingShmSnapshot]).ok, true);
  assert.equal(sha256(missingShmForBackup), missingBackupMainHash);
  assert.equal(sha256(missingShmForBackup + "-wal"), missingBackupWalHash);
  assertSafeSidecarOrAbsent(missingShmForBackup + "-shm");
  assert.deepEqual(
    assertHelperSuccess(CENSUS_HELPER, [missingShmSnapshot]),
    liveCensus,
    "snapshot from WAL source with absent SHM must retain WAL-only rows"
  );

  // B4: both helpers must reject symlink and non-regular -wal/-shm sidecars
  // before SQLite opens the DB. Sentinel contents must remain untouched.
  for (const suffix of ["-wal", "-shm"]) {
    for (const helper of [CENSUS_HELPER, SNAPSHOT_HELPER]) {
      const suffixName = suffix.slice(1);
      const helperName = helper === CENSUS_HELPER ? "census" : "snapshot";
      const linkDb = copyWalDatabase(source, dir, "symlink-" + suffixName + "-" + helperName);
      const sidecar = linkDb + suffix;
      if (maybeLstat(sidecar)) rmSync(sidecar, { recursive: true, force: true });
      const sentinel = join(dir, "sentinel-" + suffixName + "-" + helperName + ".txt");
      writeFileSync(sentinel, "do-not-touch");
      const sentinelHash = sha256(sentinel);
      symlinkSync(sentinel, sidecar);
      assert.equal(lstatSync(sidecar).isSymbolicLink(), true);
      const dest = helper === SNAPSHOT_HELPER ? join(dir, "rejected-" + suffixName + ".sqlite") : undefined;
      assertSidecarRejected(helper, linkDb, dest);
      assert.equal(sha256(sentinel), sentinelHash, "symlink target must remain untouched");
      assert.equal(lstatSync(sidecar).isSymbolicLink(), true);
    }
  }

  for (const suffix of ["-wal", "-shm"]) {
    for (const helper of [CENSUS_HELPER, SNAPSHOT_HELPER]) {
      const suffixName = suffix.slice(1);
      const helperName = helper === CENSUS_HELPER ? "census" : "snapshot";
      const invalidDb = copyWalDatabase(source, dir, "nonregular-" + suffixName + "-" + helperName);
      const sidecar = invalidDb + suffix;
      if (maybeLstat(sidecar)) rmSync(sidecar, { recursive: true, force: true });
      mkdirSync(sidecar);
      const dest = helper === SNAPSHOT_HELPER ? join(dir, "rejected-dir-" + suffixName + ".sqlite") : undefined;
      assertSidecarRejected(helper, invalidDb, dest);
      assert.equal(lstatSync(sidecar).isDirectory(), true, "non-regular sidecar must remain untouched");
    }
  }

  assert.equal(sha256(source), mainBefore, "all helper paths must preserve source main DB bytes");
  assert.equal(sha256(walPath), walBefore, "all helper paths must preserve source WAL bytes");
  assertSafeSidecarOrAbsent(source + "-wal");
  assertSafeSidecarOrAbsent(source + "-shm");
  db.close();
});
