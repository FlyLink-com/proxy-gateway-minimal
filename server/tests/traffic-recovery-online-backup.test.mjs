import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createTrafficRecoveryOnlineBackup } from "../../scripts/lib/traffic-recovery-online-backup.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "traffic-online-backup-"));
  chmodSync(root, 0o700);
  const sourcePath = join(root, "source-private.sqlite");
  const db = new Database(sourcePath);
  t.after(() => {
    if (db.open) db.close();
    rmSync(root, { recursive: true, force: true });
  });
  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 0");
  db.exec(`
    CREATE TABLE platform_usage_samples (id INTEGER PRIMARY KEY, upload_bytes INTEGER, download_bytes INTEGER, total_bytes INTEGER);
    CREATE TABLE platform_usage_rollups (id INTEGER PRIMARY KEY, upload_bytes INTEGER, download_bytes INTEGER, total_bytes INTEGER);
    CREATE TABLE platform_usage_counter_cursors (id INTEGER PRIMARY KEY, upload_bytes INTEGER, download_bytes INTEGER);
    CREATE TABLE private_padding (payload BLOB);
    INSERT INTO private_padding VALUES (zeroblob(1048576));
    INSERT INTO platform_usage_rollups VALUES (1, 0, 0, 0);
    INSERT INTO platform_usage_counter_cursors VALUES (1, 0, 0);
  `);
  return { root, sourcePath, db, destinationPath: join(root, "new-private-backup", "snapshot.sqlite") };
}

function addUsage(db) {
  db.transaction(() => {
    db.prepare("INSERT INTO platform_usage_samples (upload_bytes, download_bytes, total_bytes) VALUES (10, 20, 30)").run();
    db.prepare("UPDATE platform_usage_rollups SET upload_bytes = upload_bytes + 10, download_bytes = download_bytes + 20, total_bytes = total_bytes + 30").run();
    db.prepare("UPDATE platform_usage_counter_cursors SET upload_bytes = upload_bytes + 10, download_bytes = download_bytes + 20").run();
  })();
}

function assertRedacted(result, fixture) {
  const serialized = JSON.stringify(result);
  for (const value of [fixture.root, fixture.sourcePath, fixture.destinationPath, "injected-private-secret"]) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(result.productionCollectionAuthorized, false);
}

test("online backup preserves a consistent WAL transaction while another connection writes during transfer", async (t) => {
  const f = fixture(t);
  addUsage(f.db);
  assert.equal(existsSync(`${f.sourcePath}-wal`), true);
  const originalBackup = Database.prototype.backup;
  let observedTransfer = false;
  let observedReadOnly = false;
  Database.prototype.backup = function (destinationPath, options = {}) {
    observedReadOnly = this.readonly === true && this.pragma("query_only", { simple: true }) === 1;
    assert.throws(() => this.exec("CREATE TABLE forbidden_source_write (id INTEGER)"), /readonly/i);
    return originalBackup.call(this, destinationPath, {
      ...options,
      progress: (progress) => {
        if (!observedTransfer && progress.remainingPages > 0) {
          observedTransfer = true;
          addUsage(f.db);
        }
        return options.progress?.(progress) ?? 8;
      }
    });
  };
  t.after(() => { Database.prototype.backup = originalBackup; });
  const result = await createTrafficRecoveryOnlineBackup(f);
  assertRedacted(result, f);
  assert.equal(result.ok, true);
  assert.equal(result.status, "backup_verified");
  assert.equal(observedTransfer, true);
  assert.equal(observedReadOnly, true);
  assert.equal(result.sourceOpenedReadOnly, true);
  assert.equal(result.sourceCheckpointPerformed, false);
  assert.equal(result.integrityCheckPassed, true);
  assert.equal(result.foreignKeyCheckPassed, true);
  assert.equal(result.standalone, true);
  assert.equal(result.byteSumsEqual, true);
  assert.equal(result.exclusiveDirectoryCreated, true);
  assert.equal(result.posixProtectionVerified, process.platform !== "win32");
  assert.equal(result.windowsAclVerified, false);
  assert.equal(result.sizeBytes, statSync(f.destinationPath).size);
  assert.equal(result.sha256, createHash("sha256").update(readFileSync(f.destinationPath)).digest("hex"));
  assert.equal(result.sha256.length, 64);
  assert.deepEqual(readdirSync(dirname(f.destinationPath)), ["snapshot.sqlite"]);
  if (process.platform !== "win32") {
    assert.equal(statSync(dirname(f.destinationPath)).mode & 0o777, 0o700);
    assert.equal(statSync(f.destinationPath).mode & 0o777, 0o600);
  }
  const backup = new Database(f.destinationPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(backup.pragma("integrity_check", { simple: true }), "ok");
    assert.equal(backup.pragma("journal_mode", { simple: true }), "delete");
    const sampleCount = backup.prepare("SELECT COUNT(*) AS count FROM platform_usage_samples").get().count;
    const rollup = backup.prepare("SELECT * FROM platform_usage_rollups").get();
    const cursor = backup.prepare("SELECT * FROM platform_usage_counter_cursors").get();
    assert.equal(sampleCount, 2);
    assert.equal(rollup.total_bytes, sampleCount * 30);
    assert.equal(cursor.upload_bytes + cursor.download_bytes, rollup.total_bytes);
    assert.deepEqual(result.counts, { samples: sampleCount, rollups: 1, cursors: 1 });
  } finally { backup.close(); }
  addUsage(f.db);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM platform_usage_samples").get().count, 3);
  assert.equal(f.db.prepare("SELECT name FROM sqlite_schema WHERE name = 'forbidden_source_write'").get(), undefined);
  const again = await createTrafficRecoveryOnlineBackup(f);
  assert.equal(again.ok, false);
  assert.equal(again.status, "backup_rejected");
  assert.equal(again.partialState, "none");
  assert.equal(createHash("sha256").update(readFileSync(f.destinationPath)).digest("hex"), result.sha256);
});

test("missing source, same source, relative paths, and existing destination directory are rejected without creation", async (t) => {
  const f = fixture(t);
  const cases = [
    { ...f, sourcePath: join(f.root, "missing.sqlite") },
    { ...f, destinationPath: f.sourcePath },
    { ...f, sourcePath: "source.sqlite" },
    { ...f, destinationPath: "relative/snapshot.sqlite" },
    { ...f, destinationPath: join(f.root, "snapshot.sqlite") }
  ];
  const before = readdirSync(f.root);
  for (const args of cases) {
    const result = await createTrafficRecoveryOnlineBackup(args);
    assertRedacted(result, f);
    assert.equal(result.ok, false);
    assert.equal(result.status, "backup_rejected");
    assert.equal(result.partialState, "none");
  }
  assert.deepEqual(readdirSync(f.root), before);
});

test("an existing destination file is never overwritten", async (t) => {
  const f = fixture(t);
  mkdirSync(dirname(f.destinationPath), { mode: 0o700 });
  writeFileSync(f.destinationPath, "injected-private-secret", { mode: 0o600 });
  const result = await createTrafficRecoveryOnlineBackup(f);
  assertRedacted(result, f);
  assert.equal(result.ok, false);
  assert.equal(result.partialState, "none");
  assert.equal(readFileSync(f.destinationPath, "utf8"), "injected-private-secret");
});

test("linked source directory and linked destination parent are rejected on this platform", async (t) => {
  const f = fixture(t);
  const target = join(f.root, "link-target");
  mkdirSync(target, { mode: 0o700 });
  const link = join(f.root, "linked-directory");
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  assert.equal(lstatSync(link).isSymbolicLink(), true);
  const linkedSource = join(link, "source.sqlite");
  const db = new Database(join(target, "source.sqlite"));
  db.close();
  for (const args of [
    { ...f, sourcePath: linkedSource },
    { ...f, destinationPath: join(link, "new-snapshot", "snapshot.sqlite") },
    { ...f, destinationPath: join(link, "snapshot.sqlite") }
  ]) {
    const result = await createTrafficRecoveryOnlineBackup(args);
    assertRedacted(result, f);
    assert.equal(result.ok, false);
    assert.equal(result.partialState, "none");
  }
});

test("platform protection reports Windows limitations and rejects unsafe POSIX owner modes", async (t) => {
  const f = fixture(t);
  if (process.platform === "win32") {
    const result = await createTrafficRecoveryOnlineBackup(f);
    assert.equal(result.ok, true);
    assert.equal(result.posixProtectionVerified, false);
    assert.equal(result.windowsAclVerified, false);
    return;
  }
  chmodSync(f.root, 0o755);
  const result = await createTrafficRecoveryOnlineBackup(f);
  assertRedacted(result, f);
  assert.equal(result.ok, false);
  assert.equal(result.status, "backup_rejected");
  assert.equal(result.partialState, "none");
});

test("invalid database and missing accounting tables return fixed errors without fake success", async (t) => {
  for (const scenario of ["corrupt", "missing_table"]) {
    const f = fixture(t);
    if (scenario === "corrupt") {
      f.db.close();
      writeFileSync(f.sourcePath, "injected-private-secret is not SQLite");
    } else {
      f.db.exec("DROP TABLE platform_usage_counter_cursors");
    }
    const result = await createTrafficRecoveryOnlineBackup(f);
    assertRedacted(result, f);
    assert.equal(result.ok, false);
    assert.equal(result.status, "backup_failed");
    assert.equal(result.errorCode, "traffic_recovery_backup_failed");
    assert.equal(result.verified, false);
    assert.ok(["none", "directory_only", "unverified_file"].includes(result.partialState));
  }
});

test("transfer failure leaves only this operation's protected partial output and source remains usable", async (t) => {
  const f = fixture(t);
  const originalBackup = Database.prototype.backup;
  Database.prototype.backup = function (destinationPath, options = {}) {
    return originalBackup.call(this, destinationPath, { ...options, progress: () => { throw new Error("injected-private-secret"); } });
  };
  t.after(() => { Database.prototype.backup = originalBackup; });
  const result = await createTrafficRecoveryOnlineBackup(f);
  assertRedacted(result, f);
  assert.equal(result.ok, false);
  assert.equal(result.status, "backup_failed");
  assert.equal(result.errorCode, "traffic_recovery_backup_failed");
  assert.equal(result.verified, false);
  assert.equal(result.partialState, "unverified_file");
  assert.equal(result.partialRetained, true);
  assert.equal(existsSync(f.destinationPath), true);
  addUsage(f.db);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM platform_usage_samples").get().count, 1);
});
