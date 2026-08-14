import assert from "node:assert/strict";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  runControlPlaneDatabaseSnapshotGateCli,
  snapshotControlPlaneDatabase,
  verifyControlPlaneDatabaseSnapshot,
  restoreControlPlaneDatabase
} from "../../scripts/control-plane-db-snapshot-gate.mjs";

const CONTROL_PLANE_SNAPSHOT_CONTRACT = new URL(
  "../../docs/CONTROL_PLANE_DB_SNAPSHOT_RESTORE_CONTRACT.md",
  import.meta.url
);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-control-db-snapshot-"));
  const snapshotDirectory = join(root, "snapshots");
  const rollbackDirectory = join(root, "rollback");
  const dbPath = join(root, "state", "subscription-control.sqlite");
  mkdirSync(snapshotDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(rollbackDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(resolve(dbPath, ".."), { recursive: true });
  chmodSync(snapshotDirectory, 0o700);
  chmodSync(rollbackDirectory, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, snapshotDirectory, rollbackDirectory, dbPath };
}

function createDatabase(dbPath, values = []) {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("wal_autocheckpoint = 0");
  database.exec(`
    create table if not exists snapshot_gate_fixture (
      value text not null
    )
  `);
  const insert = database.prepare("insert into snapshot_gate_fixture (value) values (?)");
  for (const value of values) insert.run(value);
  return database;
}

function snapshotPair(directory) {
  const snapshotFile = readdirSync(directory).find((name) => name.endsWith(".sqlite"));
  assert.ok(snapshotFile, "snapshot file exists");
  const snapshotPath = join(directory, snapshotFile);
  const manifestPath = `${snapshotPath}.json`;
  return { snapshotPath, manifestPath };
}

function unitStateReader({
  activeState = "inactive",
  unitFileState = "masked-runtime"
} = {}) {
  return () => ({ activeState, unitFileState });
}

function countedUnitStateReader({
  activeState = "inactive",
  unitFileState = "masked-runtime"
} = {}) {
  let calls = 0;
  return {
    read: () => {
      calls += 1;
      return { activeState, unitFileState };
    },
    calls: () => calls
  };
}

function sequenceUnitStateReader(...states) {
  let calls = 0;
  return {
    read: () => {
      const state = states[Math.min(calls, states.length - 1)];
      calls += 1;
      return state;
    },
    calls: () => calls
  };
}

function assertNoSqliteSidecars(dbPath) {
  assert.equal(existsSync(`${dbPath}-wal`), false, "no WAL sidecar");
  assert.equal(existsSync(`${dbPath}-shm`), false, "no SHM sidecar");
}

async function makeSnapshot({ dbPath, snapshotDirectory, unitStateReader: readUnitState = unitStateReader() }) {
  return snapshotControlPlaneDatabase({
    dbPath,
    snapshotDirectory,
    serviceUnit: "proxy-gateway-candidate.service",
    expectedServiceState: "inactive",
    createdAt: "2026-08-14T12:00:00.000Z",
    unitStateReader: readUnitState
  });
}

test("snapshot and restore runbook requires the external runtime-masked start guard", () => {
  const contract = readFileSync(CONTROL_PLANE_SNAPSHOT_CONTRACT, "utf8");

  assert.match(contract, /systemctl mask --runtime --now -- "\$SERVICE_UNIT"/);
  assert.match(contract, /UnitFileState=masked-runtime/);
  assert.match(contract, /never stops, starts, masks, or unmasks a unit/);
  assert.match(contract, /pre-publication change fails closed before the restore rename sequence/);
  assert.match(contract, /post-publication change returns `attention_required`/);
  assert.match(contract, /do not unmask, start the service/);
});

test("snapshot quiesces a stopped WAL source without leaving sidecars or emitting a source path", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["committed-in-wal"]);
  source.close();
  assertNoSqliteSidecars(state.dbPath);
  const stateReader = countedUnitStateReader();

  const result = await makeSnapshot({ ...state, unitStateReader: stateReader.read });
  const { snapshotPath, manifestPath } = snapshotPair(state.snapshotDirectory);
  const manifestText = readFileSync(manifestPath, "utf8");
  const snapshot = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(snapshot.prepare("select count(*) as count from snapshot_gate_fixture").get().count, 1);
  } finally {
    snapshot.close();
  }

  assert.equal(result.state, "snapshotted");
  assert.equal(result.serviceState, "inactive");
  assert.equal(result.databaseQuiesced, true);
  assert.equal(stateReader.calls(), 4);
  assert.equal(result.snapshot.quickCheck, true);
  assert.equal(result.snapshot.foreignKeys, true);
  assert.equal(manifestText.includes(state.dbPath), false);
  assert.equal(JSON.parse(manifestText).snapshotFile, snapshotPath.split(/[\\/]/).at(-1));
  assertNoSqliteSidecars(state.dbPath);
  assertNoSqliteSidecars(snapshotPath);
});

test("snapshot requires an externally established runtime-masked start guard before database touch", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["guard-missing"]);
  source.close();

  await assert.rejects(
    makeSnapshot({
      ...state,
      unitStateReader: unitStateReader({ unitFileState: "disabled" })
    }),
    (error) => error?.condition === "service_start_guard_missing"
  );

  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assertNoSqliteSidecars(state.dbPath);
});

test("snapshot fails closed and removes its unpublished artifact when the start guard changes", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["guard-changed-before-snapshot-publish"]);
  source.close();
  const stateReader = sequenceUnitStateReader(
    { activeState: "inactive", unitFileState: "masked-runtime" },
    { activeState: "inactive", unitFileState: "masked-runtime" },
    { activeState: "inactive", unitFileState: "enabled" }
  );

  await assert.rejects(
    makeSnapshot({ ...state, unitStateReader: stateReader.read }),
    (error) => error?.condition === "service_start_guard_changed"
  );

  assert.equal(stateReader.calls(), 3);
  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assertNoSqliteSidecars(state.dbPath);
});

test("verify fails closed when snapshot bytes no longer match its manifest", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["before-tamper"]);
  source.close();
  await makeSnapshot(state);
  const { snapshotPath, manifestPath } = snapshotPair(state.snapshotDirectory);
  appendFileSync(snapshotPath, "untrusted-tail");

  assert.throws(
    () => verifyControlPlaneDatabaseSnapshot({ snapshotPath, manifestPath }),
    (error) => error?.condition === "snapshot_identity_mismatch"
  );
  assertNoSqliteSidecars(snapshotPath);
});

test("snapshot clears stale zero-length WAL/SHM only inside the stopped quiesce boundary", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["stale-zero-sidecars"]);
  source.close();
  writeFileSync(`${state.dbPath}-wal`, Buffer.alloc(0));
  writeFileSync(`${state.dbPath}-shm`, Buffer.alloc(0));

  const result = await makeSnapshot(state);
  const pair = snapshotPair(state.snapshotDirectory);

  assert.equal(result.databaseQuiesced, true);
  assertNoSqliteSidecars(state.dbPath);
  assertNoSqliteSidecars(pair.snapshotPath);
});

test("snapshot fails closed when an unrelated SQLite reader prevents checkpoint quiesce", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["checkpoint-blocked"]);
  source.close();
  const readerDatabase = new Database(state.dbPath);
  readerDatabase.exec("BEGIN");
  readerDatabase.prepare("select count(*) as count from snapshot_gate_fixture").get();
  const writerDatabase = new Database(state.dbPath);
  writerDatabase.prepare("insert into snapshot_gate_fixture (value) values (?)").run("new-wal-write");
  writerDatabase.close();
  const sourceEntriesBefore = readdirSync(state.root).sort();

  try {
    await assert.rejects(
      makeSnapshot(state),
      (error) => error?.condition === "database_quiesce_failed"
    );
    assert.deepEqual(readdirSync(state.root).sort(), sourceEntriesBefore);
    assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  } finally {
    readerDatabase.exec("ROLLBACK");
    readerDatabase.close();
  }
});

test("restore refuses to write unless the independently read service state is inactive", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["before"]);
  source.close();
  await makeSnapshot(state);
  const sourcePair = snapshotPair(state.snapshotDirectory);
  const changed = createDatabase(state.dbPath, ["after"]);
  changed.close();

  await assert.rejects(
    restoreControlPlaneDatabase({
      dbPath: state.dbPath,
      ...sourcePair,
      rollbackDirectory: state.rollbackDirectory,
      serviceUnit: "proxy-gateway-candidate.service",
      expectedServiceState: "inactive",
      unitStateReader: unitStateReader({ activeState: "active" })
    }),
    (error) => error?.condition === "service_state_mismatch"
  );

  const database = new Database(state.dbPath, { fileMustExist: true });
  try {
    assert.equal(database.prepare("select count(*) as count from snapshot_gate_fixture").get().count, 2);
  } finally {
    database.close();
  }
  assert.equal(readdirSync(state.rollbackDirectory).length, 0);
  assertNoSqliteSidecars(state.dbPath);
});

test("restore fails before any target rename when the external start guard changes", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["before"]);
  source.close();
  await makeSnapshot(state);
  const sourcePair = snapshotPair(state.snapshotDirectory);
  const changed = createDatabase(state.dbPath, ["after"]);
  changed.close();
  const targetBytesBefore = readFileSync(state.dbPath);
  const stateReader = sequenceUnitStateReader(
    ...Array.from({ length: 5 }, () => ({ activeState: "inactive", unitFileState: "masked-runtime" })),
    { activeState: "inactive", unitFileState: "enabled" }
  );

  await assert.rejects(
    restoreControlPlaneDatabase({
      dbPath: state.dbPath,
      ...sourcePair,
      rollbackDirectory: state.rollbackDirectory,
      serviceUnit: "proxy-gateway-candidate.service",
      expectedServiceState: "inactive",
      unitStateReader: stateReader.read
    }),
    (error) => error?.condition === "service_start_guard_changed"
  );

  assert.deepEqual(readFileSync(state.dbPath), targetBytesBefore);
  assert.equal(stateReader.calls(), 6);
  assert.deepEqual(readdirSync(resolve(state.dbPath, "..")).sort(), ["subscription-control.sqlite"]);
  assertNoSqliteSidecars(state.dbPath);
});

test("restore preserves a verified pre-restore snapshot, restores exact verified bytes, and leaves service stopped", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["before"]);
  source.close();
  const snapshotResult = await makeSnapshot(state);
  const sourcePair = snapshotPair(state.snapshotDirectory);
  const changed = createDatabase(state.dbPath, ["after"]);
  changed.close();
  const stateReader = countedUnitStateReader();

  const result = await restoreControlPlaneDatabase({
    dbPath: state.dbPath,
    ...sourcePair,
    rollbackDirectory: state.rollbackDirectory,
    serviceUnit: "proxy-gateway-candidate.service",
    expectedServiceState: "inactive",
    createdAt: "2026-08-14T12:05:00.000Z",
    unitStateReader: stateReader.read
  });

  const restored = new Database(state.dbPath, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(
      restored.prepare("select value from snapshot_gate_fixture order by rowid").all(),
      [{ value: "before" }]
    );
  } finally {
    restored.close();
  }
  const rollbackPair = snapshotPair(state.rollbackDirectory);
  const rollbackSnapshot = new Database(rollbackPair.snapshotPath, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(
      rollbackSnapshot.prepare("select value from snapshot_gate_fixture order by rowid").all(),
      [{ value: "before" }, { value: "after" }]
    );
  } finally {
    rollbackSnapshot.close();
  }
  assert.equal(result.state, "restored");
  assert.equal(result.serviceState, "inactive");
  assert.equal(result.snapshot.id, snapshotResult.snapshot.id);
  assert.equal(result.preRestoreSnapshot.quickCheck, true);
  assert.equal(result.preRestoreSnapshot.foreignKeys, true);
  assert.equal(stateReader.calls(), 7);
  assertNoSqliteSidecars(state.dbPath);
  assertNoSqliteSidecars(sourcePair.snapshotPath);
  assertNoSqliteSidecars(rollbackPair.snapshotPath);
});

test("restore returns attention required when the start guard changes after publish", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["before"]);
  source.close();
  await makeSnapshot(state);
  const sourcePair = snapshotPair(state.snapshotDirectory);
  const changed = createDatabase(state.dbPath, ["after"]);
  changed.close();
  const stateReader = sequenceUnitStateReader(
    ...Array.from({ length: 6 }, () => ({ activeState: "inactive", unitFileState: "masked-runtime" })),
    { activeState: "inactive", unitFileState: "enabled" }
  );

  const result = await restoreControlPlaneDatabase({
    dbPath: state.dbPath,
    ...sourcePair,
    rollbackDirectory: state.rollbackDirectory,
    serviceUnit: "proxy-gateway-candidate.service",
    expectedServiceState: "inactive",
    unitStateReader: stateReader.read
  });

  const database = new Database(state.dbPath, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(
      database.prepare("select value from snapshot_gate_fixture order by rowid").all(),
      [{ value: "before" }]
    );
  } finally {
    database.close();
  }
  assert.equal(result.state, "attention_required");
  assert.equal(result.condition, "restore_service_start_guard_changed");
  assert.equal(stateReader.calls(), 7);
  assertNoSqliteSidecars(state.dbPath);
});

test("snapshot rejects relative database paths before creating a backup", async (t) => {
  const state = fixture(t);
  assert.rejects(
    snapshotControlPlaneDatabase({
      dbPath: "relative.sqlite",
      snapshotDirectory: state.snapshotDirectory,
      serviceUnit: "proxy-gateway-candidate.service",
      expectedServiceState: "inactive",
      unitStateReader: unitStateReader()
    }),
    (error) => error?.condition === "path_must_be_absolute"
  );
});

test("snapshot does not touch a database when the service is active", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["active-service"]);
  source.close();
  assertNoSqliteSidecars(state.dbPath);

  await assert.rejects(
    makeSnapshot({ ...state, unitStateReader: unitStateReader({ activeState: "active" }) }),
    (error) => error?.condition === "service_state_mismatch"
  );

  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assertNoSqliteSidecars(state.dbPath);
});

test("CLI failure reports only a safe condition and never echoes an input path", async () => {
  let stderr = "";
  const privateLookingPath = "relative/private-control.sqlite";
  const exitCode = await runControlPlaneDatabaseSnapshotGateCli({
    argv: [
      "--mode", "verify",
      "--snapshot-path", privateLookingPath,
      "--manifest-path", "relative/private-control.sqlite.json"
    ],
    stdout: { write() {} },
    stderr: { write(value) { stderr += value; } }
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1",
    type: "control_plane_db_snapshot_gate",
    mode: "verify",
    state: "blocked",
    condition: "path_must_be_absolute"
  });
  assert.equal(stderr.includes(privateLookingPath), false);
});

test("CLI verify accepts only its exact argument set and returns a redacted result", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["cli-verify"]);
  source.close();
  await makeSnapshot(state);
  const { snapshotPath, manifestPath } = snapshotPair(state.snapshotDirectory);
  let stdout = "";
  let stderr = "";
  const exitCode = await runControlPlaneDatabaseSnapshotGateCli({
    argv: [
      "--mode", "verify",
      "--snapshot-path", snapshotPath,
      "--manifest-path", manifestPath
    ],
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } }
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).state, "verified");
  assert.equal(stdout.includes(snapshotPath), false);
  assertNoSqliteSidecars(snapshotPath);
});
