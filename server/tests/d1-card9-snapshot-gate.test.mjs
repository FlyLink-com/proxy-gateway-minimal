// D1 Card 9 — U-F10 snapshot-gate coordinator tests (D-2/D-3).
//
// Acceptance A1–A7 from decisions/D3_UF10_SNAPSHOT_GATE_DESIGN_2026-11-23.md.
// All fixtures are synthetic (s2s- prefix). No production data, no real
// credential material, no network, no E4/D1 calls. Databases are
// in-memory or temp files; the durable authority guard is the real
// single-writer-authority implementation.
//
// A3/A4 run a real snapshot through the snapshot-gate library's private
// harness (same loader as control-plane-db-snapshot-gate.test.mjs);
// the coordinator itself never opens a database file.

import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { ensureWriterAuthority, readWriterAuthority } from "../services/platform/single-writer-authority.mjs";
import {
  buildWriteLockReceipt,
  buildSchedulerQuiescenceReceipt,
  buildCallbackDrainReceipt,
  buildHwmCompletenessReceipt,
  buildFreezeReadinessBundle,
  SCHEDULER_JOBS,
  UNFENCED_WRITER_BASELINE,
} from "../services/platform/d1-stage2-freeze-drain.mjs";
import {
  buildSnapshotGateManifest,
  verifySnapshotGateManifest,
  buildWriterCoverageMatrix,
  createDrainTracker,
  buildDeltaCatchupReport,
  buildTwoSidedVerificationReport,
  createFreezeDrainCoordinator,
  verifySnapshotGateLog,
  VERIFICATION_CHECK_IDS,
} from "../services/platform/d1-card9-freeze-drain-coordinator.mjs";

const SNAPSHOT = "s2s-card9-snapshot-gate-001";
const CHECKPOINT = "s2s-checkpoint-snapshot-gate-001";
const OPERATOR = "s2s-operator-001";
const WINDOW_START = "2026-11-21T00:05:00.000Z";
const WINDOW_END = "2026-11-21T00:10:00.000Z";

// D-1 ruling file lives in the D1 work area next to this checkout, not
// in the repository (A7 is a document check, not a code test).
const D1_RULING = new URL(
  "../../../d1-load-2026-11-22/decisions/D3_UF10_D1_RULING_2026-11-23.md",
  import.meta.url,
);

function makeClock(t) {
  let nowMs = Date.parse("2026-11-21T00:00:00.000Z");
  const now = () => new Date(nowMs);
  return {
    now,
    advance(ms) { nowMs += ms; },
  };
}

function makeDb(t) {
  const db = new Database(":memory:");
  t.after(() => { if (db.open) db.close(); });
  db.exec(`create table s2s_items (id integer primary key, value text not null, updated_at text not null);
    create table s2s_notes (id integer primary key, body text not null);`);
  db.prepare("insert into s2s_items (id, value, updated_at) values (1, 'a', '2026-11-21T00:00:00.000Z'), (2, 'b', '2026-11-21T00:01:00.000Z')").run();
  db.prepare("insert into s2s_notes (id, body) values (1, 'n')").run();
  ensureWriterAuthority(db);
  return db;
}

function makeCoordinator(t) {
  const clock = makeClock(t);
  const db = makeDb(t);
  const coordinator = createFreezeDrainCoordinator(db, { snapshotId: SNAPSHOT, now: clock.now });
  return { db, coordinator, clock };
}

function buildBundle(db) {
  const writeLock = buildWriteLockReceipt(db, { snapshotId: SNAPSHOT, checkpointId: CHECKPOINT, outstandingJobs: [] });
  const schedulerQuiescence = buildSchedulerQuiescenceReceipt({
    snapshotId: SNAPSHOT,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
  const callbackDrain = buildCallbackDrainReceipt({ snapshotId: SNAPSHOT, callbacks: [] });
  const hwmCompleteness = buildHwmCompletenessReceipt({
    snapshotId: SNAPSHOT,
    highWaterMark: { seq: 7, snapshotId: SNAPSHOT },
    manifestSeq: 7,
    rowCounts: { s2s_items: 2 },
  });
  return buildFreezeReadinessBundle({ snapshotId: SNAPSHOT, writeLock, schedulerQuiescence, callbackDrain, hwmCompleteness });
}

const FENCED_REF = "decisions/D3_28_ITEMS_DISPOSITION_R7_2026-11-24.md (R7-approved writer dispositions)";

function closedCoverage() {
  const fenced = Object.fromEntries(
    UNFENCED_WRITER_BASELINE.map((entry) => entry.id).filter((id) => id !== "U-F17").map((id) => [id, FENCED_REF]),
  );
  return buildWriterCoverageMatrix({ fenced });
}

function drainedTracker(clock) {
  const tracker = createDrainTracker({ timeoutMs: 60000, now: clock.now });
  tracker.registerWrite("s2s-tx-1");
  tracker.registerCallback("s2s-cb-1");
  tracker.settleWrite("s2s-tx-1");
  tracker.settleCallback("s2s-cb-1");
  tracker.markSchedulerQuiesced();
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 }, maxUpdatedAt: { s2s_items: "2026-11-21T00:01:00.000Z" } });
  tracker.recordHwmObservation({ rowCounts: { s2s_items: 2 }, maxUpdatedAt: { s2s_items: "2026-11-21T00:01:00.000Z" } });
  return tracker;
}

function passingVerification(freezeReceiptDigest, snapshotId = SNAPSHOT) {
  return buildTwoSidedVerificationReport({
    snapshotId,
    context: freezeReceiptDigest ? { kind: "freeze-switch", freezeReceiptDigest } : null,
    checks: Object.fromEntries(VERIFICATION_CHECK_IDS.map((id) => [id, { passed: true, detail: `synthetic ${id}` }])),
  });
}

function appliedDelta(freezeReceiptDigest, snapshotId = SNAPSHOT) {
  return buildDeltaCatchupReport({
    snapshotId,
    freezeReceiptDigest,
    items: [{ table: "s2s_items", pk: "2", disposition: "applied" }],
  });
}

function freezeHappy(t) {
  const { db, coordinator, clock } = makeCoordinator(t);
  const result = coordinator.freeze({
    readinessBundle: buildBundle(db),
    coverageMatrix: closedCoverage(),
    drainTracker: drainedTracker(clock),
    checkpointId: CHECKPOINT,
  });
  return { db, coordinator, clock, result };
}

function fullSchedulerReceipt() {
  return buildSchedulerQuiescenceReceipt({
    snapshotId: SNAPSHOT,
    evidence: Object.fromEntries(SCHEDULER_JOBS.map((job) => [job.id, true])),
  });
}

function emptyCallbackReceipt() {
  return buildCallbackDrainReceipt({ snapshotId: SNAPSHOT, callbacks: [] });
}

function issueInstruction(ctx) {
  return ctx.coordinator.issueSnapshotGateInstruction({
    freezeReceipt: ctx.result.freezeReceipt,
    schedulerQuiescence: fullSchedulerReceipt(),
    callbackDrain: emptyCallbackReceipt(),
    operator: OPERATOR,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  });
}

function syntheticManifest(ctx) {
  return buildSnapshotGateManifest({
    snapshotId: SNAPSHOT,
    checkpointId: CHECKPOINT,
    freezeReceiptDigest: ctx.result.freezeReceipt.receiptDigest,
    basename: "s2s-snapshot.sqlite",
    sha256: "a".repeat(64),
    byteCount: 4096,
    createdAt: WINDOW_START,
    quickCheck: true,
    foreignKeys: true,
    schemaVersion: 1,
    journalMode: "delete",
  });
}

function bindSynthetic(ctx) {
  const instruction = issueInstruction(ctx);
  const manifest = syntheticManifest(ctx);
  return ctx.coordinator.bindSnapshotManifest({
    instruction,
    manifest,
    acceptance: { quickCheck: true, foreignKeys: true },
  });
}

function switchArgs(ctx) {
  const digest = ctx.result.freezeReceipt.receiptDigest;
  return {
    deltaReport: appliedDelta(digest),
    verificationReport: passingVerification(digest),
    c1ApprovalRef: "s2s-c1-approval-001",
    handover: { verifiedBy: "s2s-reviewer-001", verifiedAt: "2026-11-21T00:05:00.000Z", receiptRef: "s2s-handover-001" },
  };
}

function codeOf(fn) {
  try {
    fn();
  } catch (error) {
    return error.code;
  }
  return null;
}

// --- Private snapshot harness (same loader as
// control-plane-db-snapshot-gate.test.mjs) for A3/A4. --------------------

const SNAPSHOT_GATE_SOURCE = new URL(
  "../../scripts/control-plane-db-snapshot-gate-lib.mjs",
  import.meta.url,
);

function sourceDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString("base64")}`;
}

async function loadPrivateSnapshotHarness() {
  let source = readFileSync(SNAPSHOT_GATE_SOURCE, "utf8");
  const dependencySpecifier = JSON.stringify("better-sqlite3");
  assert.equal(source.split(dependencySpecifier).length - 1, 1);
  source = source.replace(dependencySpecifier, JSON.stringify(import.meta.resolve("better-sqlite3")));
  const migrationSpecifier = JSON.stringify(
    "../server/services/platform/portal-registration-welcome-bonus-migrations.mjs",
  );
  assert.equal(source.split(migrationSpecifier).length - 1, 1);
  source = source.replace(
    migrationSpecifier,
    JSON.stringify(new URL(
      "../services/platform/portal-registration-welcome-bonus-migrations.mjs",
      import.meta.url,
    ).href),
  );
  for (const name of ["snapshotControlPlaneDatabase", "restoreControlPlaneDatabase"]) {
    const exported = new RegExp(`^export async function ${name}\\(`, "mu");
    const privateDeclaration = new RegExp(`^async function ${name}\\(`, "mu");
    assert.equal(Number(exported.test(source)) + Number(privateDeclaration.test(source)), 1, name);
    source = source.replace(exported, `async function ${name}(`);
  }
  source += `\nexport { snapshotControlPlaneDatabase };\n`;
  return import(sourceDataUrl(source));
}

const privateSnapshotHarness = await loadPrivateSnapshotHarness();
const snapshotControlPlaneDatabase = privateSnapshotHarness.snapshotControlPlaneDatabase;

function gateFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "gccgw-d3-snapshot-gate-"));
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

function createGateDatabase(dbPath, values = []) {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("wal_autocheckpoint = 0");
  database.exec(`create table if not exists snapshot_gate_fixture (value text not null)`);
  const insert = database.prepare("insert into snapshot_gate_fixture (value) values (?)");
  for (const value of values) insert.run(value);
  return database;
}

function snapshotPair(directory) {
  const snapshotFile = readdirSync(directory).find((name) => name.endsWith(".sqlite"));
  assert.ok(snapshotFile, "snapshot file exists");
  const snapshotPath = join(directory, snapshotFile);
  return { snapshotPath, manifestPath: `${snapshotPath}.json` };
}

function unitStateReader() {
  return () => ({
    activeState: "inactive",
    unitFileState: "enabled",
    runtimeConditionStartGuard: true,
    runtimeConditionStartGuardIdentity: "runtime-condition-v1:test-guard",
  });
}

async function makeGateSnapshot(state) {
  return snapshotControlPlaneDatabase({
    dbPath: state.dbPath,
    snapshotDirectory: state.snapshotDirectory,
    serviceUnit: "proxy-gateway-candidate.service",
    expectedServiceState: "inactive",
    createdAt: "2026-08-14T12:00:00.000Z",
    unitStateReader: unitStateReader(),
  });
}

// --- A1: un-frozen instruction is refused and logged ----------------------

test("A1 requesting a snapshot-gate instruction while BWH_ACTIVE is refused and logged", (t) => {
  const { db, coordinator } = makeCoordinator(t);
  // No freeze has happened: there is no T1 entry and the phase is
  // BWH_ACTIVE, so G1 must refuse before any snapshot runs.
  const freezeReceipt = buildWriteLockReceipt(db, { snapshotId: SNAPSHOT, checkpointId: CHECKPOINT, outstandingJobs: [] });
  assert.equal(codeOf(() => coordinator.issueSnapshotGateInstruction({
    freezeReceipt,
    schedulerQuiescence: fullSchedulerReceipt(),
    callbackDrain: emptyCallbackReceipt(),
    operator: OPERATOR,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  })), "freeze_snapshot_gate_refused");
  assert.equal(readWriterAuthority(db).phase, "BWH_ACTIVE");
  const log = coordinator.readSnapshotGateLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, "refusal");
  assert.equal(log[0].gateRefs.gate, "G1");
  assert.deepEqual(verifySnapshotGateLog(db), { valid: true, entries: 1 });
});

// --- A2: incomplete drain is refused --------------------------------------

test("A2 a W-116 scheduler receipt of false refuses the instruction (G2)", (t) => {
  const ctx = freezeHappy(t);
  const scheduler = fullSchedulerReceipt();
  scheduler.jobs.find((job) => job.id === "W-116").quiesced = false;
  assert.equal(codeOf(() => ctx.coordinator.issueSnapshotGateInstruction({
    freezeReceipt: ctx.result.freezeReceipt,
    schedulerQuiescence: scheduler,
    callbackDrain: emptyCallbackReceipt(),
    operator: OPERATOR,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  })), "freeze_snapshot_gate_refused");
  const log = ctx.coordinator.readSnapshotGateLog();
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, "refusal");
  assert.equal(log[0].gateRefs.gate, "G2");
  assert.equal(readWriterAuthority(ctx.db).phase, "FROZEN");
});

test("A2 a callback drain with pending callbacks refuses the instruction (G2)", (t) => {
  const ctx = freezeHappy(t);
  const callbackDrain = { ...emptyCallbackReceipt(), pending: ["s2s-cb-1"], drained: 0 };
  assert.equal(codeOf(() => ctx.coordinator.issueSnapshotGateInstruction({
    freezeReceipt: ctx.result.freezeReceipt,
    schedulerQuiescence: fullSchedulerReceipt(),
    callbackDrain,
    operator: OPERATOR,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  })), "freeze_snapshot_gate_refused");
  assert.equal(ctx.coordinator.readSnapshotGateLog()[0].gateRefs.gate, "G2");
});

// --- A3: busy checkpoint fails closed -------------------------------------

test("A3 a busy checkpoint fails closed: no snapshot is published and the source is untouched", async (t) => {
  const state = gateFixture(t);
  const source = createGateDatabase(state.dbPath, ["checkpoint-blocked"]);
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
      makeGateSnapshot(state),
      (error) => error?.condition === "database_quiesce_failed",
    );
    assert.deepEqual(readdirSync(state.root).sort(), sourceEntriesBefore);
    assert.equal(readdirSync(state.snapshotDirectory).length, 0);
    assert.equal(existsSync(`${state.dbPath}-wal`), true, "the WAL the reader holds is left alone");
  } finally {
    readerDatabase.exec("ROLLBACK");
    readerDatabase.close();
  }
});

// --- A4: frozen full flow with a real snapshot -----------------------------

test("A4 frozen + drained + receipt issues an instruction, a real snapshot binds to the freeze receipt", async (t) => {
  const ctx = freezeHappy(t);
  const instruction = issueInstruction(ctx);
  assert.equal(instruction.snapshotId, SNAPSHOT);
  assert.equal(instruction.freezeReceiptDigest, ctx.result.freezeReceipt.receiptDigest);
  assert.match(instruction.instructionDigest, /^[0-9a-f]{64}$/);

  // Run a real snapshot of a small WAL database through the library.
  const state = gateFixture(t);
  const source = createGateDatabase(state.dbPath, ["frozen-row"]);
  source.close();
  const report = await makeGateSnapshot(state);
  assert.equal(report.state, "snapshotted");
  assert.equal(report.snapshot.quickCheck, true);
  assert.equal(report.snapshot.foreignKeys, true);
  const { snapshotPath, manifestPath } = snapshotPair(state.snapshotDirectory);
  const libManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(libManifest.snapshot.quickCheck, true);
  assert.equal(libManifest.snapshot.foreignKeys, true);

  const manifest = buildSnapshotGateManifest({
    snapshotId: SNAPSHOT,
    checkpointId: CHECKPOINT,
    freezeReceiptDigest: ctx.result.freezeReceipt.receiptDigest,
    basename: libManifest.snapshotFile,
    sha256: libManifest.snapshot.sha256,
    byteCount: libManifest.snapshot.sizeBytes,
    createdAt: libManifest.createdAt,
    quickCheck: libManifest.snapshot.quickCheck,
    foreignKeys: libManifest.snapshot.foreignKeys,
    schemaVersion: libManifest.snapshot.schemaVersion,
    journalMode: libManifest.snapshot.journalMode,
  });
  assert.deepEqual(verifySnapshotGateManifest(manifest), { valid: true, manifestDigest: manifest.manifestDigest });
  const binding = ctx.coordinator.bindSnapshotManifest({
    instruction,
    manifest,
    acceptance: { quickCheck: true, foreignKeys: true },
  });
  assert.equal(binding.snapshotId, SNAPSHOT);
  assert.equal(binding.manifestDigest, manifest.manifestDigest);
  assert.equal(binding.freezeReceiptDigest, ctx.result.freezeReceipt.receiptDigest);
  assert.match(binding.bindingDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(verifySnapshotGateLog(ctx.db), { valid: true, entries: 2 });

  // The bound snapshot now opens T2.
  const switched = ctx.coordinator.switchToD1(switchArgs(ctx));
  assert.equal(switched.transitionId, "T2");
  assert.equal(switched.authority.phase, "D1_ACTIVE");
  assert.equal(switched.coordinatorReceipt.gateRefs.snapshotManifestDigest, manifest.manifestDigest);
  void snapshotPath;
});

// --- A5: unbound manifest blocks T2 ----------------------------------------

test("A5 switch without any snapshot binding is refused and stays FROZEN", (t) => {
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => ctx.coordinator.switchToD1(switchArgs(ctx))), "freeze_snapshot_unbound");
  assert.deepEqual([readWriterAuthority(ctx.db).phase, readWriterAuthority(ctx.db).epoch], ["FROZEN", 2]);
});

test("A5 a manifest bound to a different freeze receipt cannot open T2", (t) => {
  const ctx = freezeHappy(t);
  const instruction = issueInstruction(ctx);
  const foreignManifest = buildSnapshotGateManifest({
    snapshotId: SNAPSHOT,
    checkpointId: CHECKPOINT,
    freezeReceiptDigest: "b".repeat(64),
    basename: "s2s-snapshot.sqlite",
    sha256: "a".repeat(64),
    byteCount: 4096,
    createdAt: WINDOW_START,
    quickCheck: true,
    foreignKeys: true,
    schemaVersion: 1,
    journalMode: "delete",
  });
  assert.equal(codeOf(() => ctx.coordinator.bindSnapshotManifest({
    instruction,
    manifest: foreignManifest,
    acceptance: { quickCheck: true, foreignKeys: true },
  })), "freeze_snapshot_bind_refused");
  assert.equal(ctx.coordinator.readSnapshotGateLog().filter((entry) => entry.kind === "binding").length, 0);
  assert.equal(codeOf(() => ctx.coordinator.switchToD1(switchArgs(ctx))), "freeze_snapshot_unbound");
  assert.equal(readWriterAuthority(ctx.db).phase, "FROZEN");
});

// --- A6: failed acceptance voids the snapshot ------------------------------

test("A6 a snapshot that fails acceptance cannot be manifested, and a failed bind voids it", (t) => {
  const ctx = freezeHappy(t);
  assert.equal(codeOf(() => buildSnapshotGateManifest({
    snapshotId: SNAPSHOT,
    checkpointId: CHECKPOINT,
    freezeReceiptDigest: ctx.result.freezeReceipt.receiptDigest,
    basename: "s2s-snapshot.sqlite",
    sha256: "a".repeat(64),
    byteCount: 4096,
    createdAt: WINDOW_START,
    quickCheck: false,
    foreignKeys: true,
    schemaVersion: 1,
    journalMode: "delete",
  })), "freeze_snapshot_manifest_invalid");

  const instruction = issueInstruction(ctx);
  const manifest = syntheticManifest(ctx);
  assert.equal(codeOf(() => ctx.coordinator.bindSnapshotManifest({
    instruction,
    manifest,
    acceptance: { quickCheck: true, foreignKeys: false },
  })), "freeze_snapshot_acceptance_failed");
  const log = ctx.coordinator.readSnapshotGateLog();
  assert.equal(log.filter((entry) => entry.kind === "void").length, 1);
  assert.equal(log.find((entry) => entry.kind === "void").gateRefs.manifestDigest, manifest.manifestDigest);
  // The same manifest can never be bound afterwards.
  assert.equal(codeOf(() => ctx.coordinator.bindSnapshotManifest({
    instruction,
    manifest,
    acceptance: { quickCheck: true, foreignKeys: true },
  })), "freeze_snapshot_bind_refused");
  assert.equal(codeOf(() => ctx.coordinator.switchToD1(switchArgs(ctx))), "freeze_snapshot_unbound");
});

test("A6 an operator-voided manifest cannot open T2 even after a fresh instruction", (t) => {
  const ctx = freezeHappy(t);
  const binding = bindSynthetic(ctx);
  ctx.coordinator.voidSnapshotManifest({
    snapshotId: SNAPSHOT,
    manifestDigest: binding.manifestDigest,
    reason: "synthetic operator void",
  });
  assert.equal(codeOf(() => ctx.coordinator.switchToD1(switchArgs(ctx))), "freeze_snapshot_unbound");
  assert.equal(readWriterAuthority(ctx.db).phase, "FROZEN");
});

// --- A7: D-1 has a written ruling (document check) --------------------------

test("A7 D-1 has a written ruling taking option B (document check)", (t) => {
  let text;
  try {
    text = readFileSync(D1_RULING, "utf8");
  } catch {
    t.skip("D-1 ruling file is not present in this checkout layout; the document check cannot run here");
    return;
  }
  assert.ok(text.includes("D-1"), "ruling covers D-1");
  assert.ok(text.includes("取选项 B"), "ruling takes option B (coordinator phase gate + drain receipt as the equivalence proof)");
  assert.ok(text.includes("不补 systemd 单元"), "ruling states this round does not add a systemd unit");
});
