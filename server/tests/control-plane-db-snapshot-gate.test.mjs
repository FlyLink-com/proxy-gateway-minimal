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
  parseSystemdUnitShowProperties,
  runControlPlaneDatabaseSnapshotGateCli,
  runtimeConditionStartGuardPaths,
  snapshotControlPlaneDatabase,
  verifyControlPlaneDatabaseStartGuard,
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
  unitFileState = "enabled",
  runtimeConditionStartGuard = true,
  runtimeConditionStartGuardIdentity = "runtime-condition-v1:test-guard"
} = {}) {
  return () => ({
    activeState,
    unitFileState,
    runtimeConditionStartGuard,
    runtimeConditionStartGuardIdentity
  });
}

function countedUnitStateReader({
  activeState = "inactive",
  unitFileState = "enabled",
  runtimeConditionStartGuard = true,
  runtimeConditionStartGuardIdentity = "runtime-condition-v1:test-guard"
} = {}) {
  let calls = 0;
  return {
    read: () => {
      calls += 1;
      return {
        activeState,
        unitFileState,
        runtimeConditionStartGuard,
        runtimeConditionStartGuardIdentity
      };
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
      return {
        activeState: "inactive",
        unitFileState: "enabled",
        runtimeConditionStartGuard: true,
        runtimeConditionStartGuardIdentity: "runtime-condition-v1:test-guard",
        ...state
      };
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

test("systemd show parser preserves a real DropInPaths value", () => {
  const guardDropIn = "/run/systemd/system/proxy-gateway-candidate.service.d/zzzzzz-control-plane-db-snapshot-start-guard.conf";
  const parsed = parseSystemdUnitShowProperties([
    "ActiveState=active",
    "UnitFileState=enabled",
    "LoadState=loaded",
    "NeedDaemonReload=no",
    `DropInPaths=${guardDropIn}`
  ].join("\n"));

  assert.deepEqual(parsed, {
    activeState: "active",
    unitFileState: "enabled",
    loadState: "loaded",
    needDaemonReload: "no",
    dropInPaths: [guardDropIn]
  });
});

test("systemd show parser fails closed for malformed property sets", () => {
  const validProperties = [
    "ActiveState=active",
    "UnitFileState=enabled",
    "LoadState=loaded",
    "NeedDaemonReload=no",
    "DropInPaths=/run/systemd/system/proxy-gateway-candidate.service.d/zzzzzz-control-plane-db-snapshot-start-guard.conf"
  ];
  const cases = [
    {
      name: "malformed",
      lines: [...validProperties.slice(0, -1), "DropInPaths"]
    },
    {
      name: "duplicate",
      lines: [...validProperties, "ActiveState=inactive"]
    },
    {
      name: "unknown",
      lines: [...validProperties.slice(0, -1), "UnexpectedState=active"]
    },
    {
      name: "missing",
      lines: validProperties.slice(0, -1)
    }
  ];

  for (const { name, lines } of cases) {
    assert.throws(
      () => parseSystemdUnitShowProperties(lines.join("\n")),
      (error) => error?.condition === "service_state_unavailable",
      name
    );
  }
});

test("snapshot gate resolves systemd inspection through fixed absolute binaries and a minimal environment", () => {
  const source = readFileSync(
    new URL("../../scripts/control-plane-db-snapshot-gate.mjs", import.meta.url),
    "utf8"
  );

  assert.match(source, /const SYSTEMCTL_PATH = "\/usr\/bin\/systemctl"/);
  assert.match(source, /const BUSCTL_PATH = "\/usr\/bin\/busctl"/);
  assert.match(source, /PATH: "\/usr\/bin:\/bin"/);
  assert.match(source, /env: SYSTEMD_COMMAND_ENV/);
  assert.match(source, /withoutOutput\(SYSTEMCTL_PATH,/);
  assert.match(source, /withoutOutput\(BUSCTL_PATH,/);
});

test("snapshot and restore runbook requires the external runtime condition start guard", () => {
  const contract = readFileSync(CONTROL_PLANE_SNAPSHOT_CONTRACT, "utf8");

  assert.match(contract, /runtime-only systemd\s+condition start guard/);
  assert.match(contract, /ConditionPathExists=!/);
  assert.match(contract, /systemctl daemon-reload/);
  assert.match(contract, /not stop or start systemd/);
  assert.match(contract, /pre-publication change fails closed before the restore rename sequence/);
  assert.match(contract, /post-publication change returns `attention_required`/);
  assert.match(contract, /do not remove the runtime block\/drop-in/);
  assert.match(contract, /reblock_on_start_failure/);
  assert.match(
    contract,
    /rm -- "\$BLOCK_FILE"\s+systemctl start -- "\$SERVICE_UNIT"\s+install -o root -g root -m 0600 \/dev\/null "\$BLOCK_FILE"\s+systemctl is-active --quiet -- "\$SERVICE_UNIT"/
  );
  assert.match(
    contract,
    /rm -- "\$DROPIN_FILE"\s+systemctl daemon-reload\s+rm -- "\$BLOCK_FILE"/
  );
});

test("runtime condition guard paths are derived only from the validated service unit", () => {
  assert.deepEqual(
    runtimeConditionStartGuardPaths({ serviceUnit: "proxy-gateway-candidate.service" }),
    {
      blockDirectory: "/run/control-plane-db-snapshot-gates",
      blockPath: "/run/control-plane-db-snapshot-gates/proxy-gateway-candidate.service.block",
      dropInDirectory: "/run/systemd/system/proxy-gateway-candidate.service.d",
      dropInPath: "/run/systemd/system/proxy-gateway-candidate.service.d/zzzzzz-control-plane-db-snapshot-start-guard.conf"
    }
  );
  assert.throws(
    () => runtimeConditionStartGuardPaths({ serviceUnit: "../unsafe.service" }),
    (error) => error?.condition === "service_unit_invalid"
  );
});

test("start-guard verification uses the same exact guard check before a service is stopped", () => {
  const guarded = verifyControlPlaneDatabaseStartGuard({
    serviceUnit: "proxy-gateway-candidate.service",
    expectedServiceState: "active",
    unitStateReader: unitStateReader({ activeState: "active" })
  });
  assert.deepEqual(guarded, {
    schemaVersion: "1",
    type: "control_plane_db_snapshot_gate",
    mode: "guard",
    state: "guarded",
    serviceState: "active",
    databaseQuiesced: false,
    snapshot: null,
    preRestoreSnapshot: null
  });

  assert.throws(
    () => verifyControlPlaneDatabaseStartGuard({
      serviceUnit: "proxy-gateway-candidate.service",
      expectedServiceState: "active",
      unitStateReader: unitStateReader({
        activeState: "active",
        runtimeConditionStartGuard: false
      })
    }),
    (error) => error?.condition === "service_start_guard_missing"
  );
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

test("snapshot requires an externally established runtime condition start guard before database touch", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["guard-missing"]);
  source.close();

  await assert.rejects(
    makeSnapshot({
      ...state,
      unitStateReader: unitStateReader({ runtimeConditionStartGuard: false })
    }),
    (error) => error?.condition === "service_start_guard_missing"
  );

  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assertNoSqliteSidecars(state.dbPath);
});

test("snapshot accepts an externally established runtime condition start guard", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["runtime-condition-guard"]);
  source.close();

  const result = await makeSnapshot({
    ...state,
    unitStateReader: unitStateReader({
      unitFileState: "enabled",
      runtimeConditionStartGuard: true
    })
  });

  assert.equal(result.state, "snapshotted");
  assertNoSqliteSidecars(state.dbPath);
});

test("snapshot rejects a condition guard that is absent before database touch", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["runtime-condition-missing"]);
  source.close();

  await assert.rejects(
    makeSnapshot({
      ...state,
      unitStateReader: unitStateReader({
        unitFileState: "enabled",
        runtimeConditionStartGuard: false
      })
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
    { runtimeConditionStartGuard: true },
    { runtimeConditionStartGuard: true },
    { runtimeConditionStartGuard: false }
  );

  await assert.rejects(
    makeSnapshot({ ...state, unitStateReader: stateReader.read }),
    (error) => error?.condition === "service_start_guard_changed"
  );

  assert.equal(stateReader.calls(), 3);
  assert.equal(readdirSync(state.snapshotDirectory).length, 0);
  assertNoSqliteSidecars(state.dbPath);
});

test("snapshot fails closed when the runtime condition guard identity changes", async (t) => {
  const state = fixture(t);
  const source = createDatabase(state.dbPath, ["guard-identity-changed-before-snapshot-publish"]);
  source.close();
  const stateReader = sequenceUnitStateReader(
    { runtimeConditionStartGuardIdentity: "runtime-condition-v1:entry" },
    { runtimeConditionStartGuardIdentity: "runtime-condition-v1:entry" },
    { runtimeConditionStartGuardIdentity: "runtime-condition-v1:replacement" }
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
    ...Array.from({ length: 5 }, () => ({ runtimeConditionStartGuard: true })),
    { runtimeConditionStartGuard: false }
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
    ...Array.from({ length: 6 }, () => ({ runtimeConditionStartGuard: true })),
    { runtimeConditionStartGuard: false }
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
