import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import test from "node:test";

import {
  EXPECTED_NONCE_SHA256,
  createRepairStateStore,
  executionClaimSha256,
  executionNonceSha256,
  validateJournal,
  validateJournalTransition
} from "../../scripts/japan-tuic-additive-repair-state.mjs";

const EXECUTION_NONCE = "88a2bb9923bb67a0893b2abcd3d30c951c3041a938583026526c78a5d223d00b";
const CLAIM_SHA256 = "c".repeat(64);
const BACKUP_SHA256 = "b".repeat(64);
const ORIGINAL_MAP_SHA256 = "d".repeat(64);
const ARTIFACT_SHA256 = "d6c0663c9a7c82c6e8ffb7d354e2a4c23d26f3339586533df5c268b887b839fd";
const WORKFLOW_COMMIT = "a".repeat(40);
const PREPARED_AT = "2026-07-17T00:00:00.000Z";

const paths = {
  claim: "C:\\state\\claim.json",
  journal: "C:\\state\\journal.json",
  backupReceipt: "C:\\state\\backup.json"
};

const executeControl = {
  artifactSha256: ARTIFACT_SHA256,
  executionGateId: "github-actions-japan-tuic-additive-repair-20260717-001",
  executionNonce: EXECUTION_NONCE,
  releaseUnit: "japan-runtime-config",
  strategy: "additive_missing_only",
  surface: "japan-tuic",
  target: "vultr-japan-production",
  workflowCommit: WORKFLOW_COMMIT
};

const CLAIM_KEYS = [
  "schemaVersion",
  "type",
  "claimSha256",
  "nonceSha256",
  "workflowCommit",
  "claimedAt"
];
const BACKUP_KEYS = [
  "schemaVersion",
  "type",
  "claimSha256",
  "originalMapSha256",
  "backupSha256",
  "mode",
  "uid",
  "gid",
  "createdAt"
];
const JOURNAL_KEYS = [
  "schemaVersion",
  "type",
  "sequence",
  "phase",
  "claimSha256",
  "workflowCommit",
  "artifactSha256",
  "preparedAt",
  "updatedAt",
  "backupSha256",
  "originalMapSha256",
  "applyBoundary",
  "terminalResult",
  "error"
];

const PHASES = [
  "prepared",
  "claimed",
  "backup_ready",
  "apply_intent",
  "applied",
  "observing",
  "rollback_intent",
  "applied_validated",
  "rolled_back_validated",
  "indeterminate"
];

const ALLOWED_TRANSITIONS = new Set([
  "prepared->claimed",
  "claimed->backup_ready",
  "claimed->indeterminate",
  "backup_ready->apply_intent",
  "backup_ready->indeterminate",
  "apply_intent->applied",
  "apply_intent->rollback_intent",
  "apply_intent->indeterminate",
  "applied->observing",
  "applied->rollback_intent",
  "applied->indeterminate",
  "observing->applied_validated",
  "observing->rollback_intent",
  "observing->indeterminate",
  "rollback_intent->rolled_back_validated",
  "rollback_intent->indeterminate"
]);

function timestamp(sequence) {
  return `2026-07-17T00:00:00.${String(sequence).padStart(3, "0")}Z`;
}

function journalFor(phase, overrides = {}) {
  const sequence = overrides.sequence ?? PHASES.indexOf(phase);
  const hasClaim = phase !== "prepared";
  const hasBackup = !["prepared", "claimed"].includes(phase);
  const hasApply = !["prepared", "claimed", "backup_ready"].includes(phase);
  const terminal = ["applied_validated", "rolled_back_validated", "indeterminate"].includes(phase);
  return {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_journal",
    sequence,
    phase,
    claimSha256: hasClaim ? CLAIM_SHA256 : null,
    workflowCommit: WORKFLOW_COMMIT,
    artifactSha256: ARTIFACT_SHA256,
    preparedAt: PREPARED_AT,
    updatedAt: timestamp(sequence),
    backupSha256: hasBackup ? BACKUP_SHA256 : null,
    originalMapSha256: hasBackup ? ORIGINAL_MAP_SHA256 : null,
    applyBoundary: hasApply ? "helper_rename" : null,
    terminalResult: terminal ? phase : null,
    error: phase === "indeterminate" ? "atomic_apply_failed" : null,
    ...overrides
  };
}

function nextJournal(current, phase, overrides = {}) {
  const next = {
    ...current,
    sequence: current.sequence + 1,
    phase,
    updatedAt: timestamp(current.sequence + 1),
    terminalResult: ["applied_validated", "rolled_back_validated", "indeterminate"].includes(phase) ? phase : null,
    error: phase === "indeterminate" ? "atomic_apply_failed" : null
  };
  if (current.phase === "prepared" && phase === "claimed") next.claimSha256 = CLAIM_SHA256;
  if (current.phase === "claimed" && phase === "backup_ready") {
    next.backupSha256 = BACKUP_SHA256;
    next.originalMapSha256 = ORIGINAL_MAP_SHA256;
  }
  if (current.phase === "backup_ready" && phase === "apply_intent") next.applyBoundary = "helper_rename";
  return { ...next, ...overrides };
}

function backupReceipt(overrides = {}) {
  return {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_backup",
    claimSha256: CLAIM_SHA256,
    originalMapSha256: ORIGINAL_MAP_SHA256,
    backupSha256: BACKUP_SHA256,
    mode: 0o600,
    uid: 0,
    gid: 0,
    createdAt: "2026-07-17T00:00:01.000Z",
    ...overrides
  };
}

function canonicalLine(record) {
  return `${JSON.stringify(record)}\n`;
}

function ioError(code = "EIO") {
  const error = new Error("raw path and runtime details must be redacted");
  error.code = code;
  return error;
}

function createFakeIo({ failAt = null } = {}) {
  const events = [];
  const files = new Map();
  let handleId = 0;

  const fail = (name) => {
    if (failAt === name) throw ioError();
  };

  return {
    events,
    files,
    now: () => "2026-07-17T00:00:02.000Z",
    async readFile(filePath) {
      events.push(["readFile", filePath]);
      if (!files.has(filePath)) throw ioError("ENOENT");
      return files.get(filePath);
    },
    async open(filePath, flags, mode) {
      events.push(["open", filePath, flags, mode]);
      fail("open");
      if ((flags & fsConstants.O_EXCL) !== 0 && files.has(filePath)) throw ioError("EEXIST");
      files.set(filePath, "");
      return { id: ++handleId, path: filePath, closed: false };
    },
    async write(handle, bytes) {
      events.push(["write", handle.path, Buffer.from(bytes).toString("utf8")]);
      fail("write");
      files.set(handle.path, Buffer.from(bytes).toString("utf8"));
    },
    async fsyncFile(handle) {
      events.push(["fsyncFile", handle.path]);
      fail("fsyncFile");
    },
    async rename(from, to) {
      events.push(["rename", from, to]);
      fail("rename");
      const value = files.get(from);
      files.delete(from);
      files.set(to, value);
    },
    async fsyncDirectory(directory) {
      events.push(["fsyncDirectory", directory]);
      fail("fsyncDirectory");
    },
    async close(handle) {
      events.push(["close", handle.path]);
      handle.closed = true;
    },
    async remove(filePath) {
      events.push(["remove", filePath]);
      files.delete(filePath);
    }
  };
}

function expectStateError(callback, code = "receipt_validation_failed") {
  assert.throws(
    callback,
    (error) => error.code === code && error.message === code && !error.message.includes("raw path")
  );
}

async function expectStateRejection(callback, code = "receipt_validation_failed") {
  await assert.rejects(
    callback,
    (error) => error.code === code && error.message === code && !error.message.includes("raw path")
  );
}

test("freezes nonce and canonical execution-claim digests", () => {
  assert.equal(EXPECTED_NONCE_SHA256, "af3b8363d75cf920ca5dea15835c1d6e33684997bc05fa48e2da6e7804e33029");
  assert.equal(executionNonceSha256(EXECUTION_NONCE), EXPECTED_NONCE_SHA256);
  assert.equal(executionClaimSha256(executeControl), "472882bac3aba0cba6351289366090414a1c4fb9484d32372a4ab674edb6ae31");
  for (const control of [
    { ...executeControl, workflowCommit: "A".repeat(40) },
    { ...executeControl, artifactSha256: "D".repeat(64) },
    { ...executeControl, releaseUnit: null },
    { ...executeControl, executionGateId: "" }
  ]) {
    expectStateError(() => executionClaimSha256(control), "execution_claim_mismatch");
  }
});

test("rejects a non-frozen execution nonce synchronously before I/O", () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  assert.throws(
    () => store.claim({ ...executeControl, executionNonce: "0".repeat(64) }),
    { code: "execution_claim_mismatch" }
  );
  assert.deepEqual(io.events, []);
});

test("writes an exact digest-only claim with exclusive file and directory durability", async () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  const claim = await store.claim(executeControl);

  assert.deepEqual(Object.keys(claim), CLAIM_KEYS);
  assert.deepEqual(claim, {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_claim",
    claimSha256: "472882bac3aba0cba6351289366090414a1c4fb9484d32372a4ab674edb6ae31",
    nonceSha256: EXPECTED_NONCE_SHA256,
    workflowCommit: WORKFLOW_COMMIT,
    claimedAt: "2026-07-17T00:00:02.000Z"
  });
  assert.equal(io.files.get(paths.claim), canonicalLine(claim));
  assert.ok(!io.files.get(paths.claim).includes(EXECUTION_NONCE));
  assert.ok(!io.files.get(paths.claim).includes("executionNonce"));

  const writeEvents = io.events.filter(([name]) => name !== "readFile");
  assert.deepEqual(writeEvents.map(([name]) => name), ["open", "write", "fsyncFile", "close", "fsyncDirectory"]);
  const [, , flags, mode] = writeEvents[0];
  assert.equal(flags & fsConstants.O_CREAT, fsConstants.O_CREAT);
  assert.equal(flags & fsConstants.O_EXCL, fsConstants.O_EXCL);
  assert.equal(flags & fsConstants.O_WRONLY, fsConstants.O_WRONLY);
  if (fsConstants.O_NOFOLLOW) assert.equal(flags & fsConstants.O_NOFOLLOW, fsConstants.O_NOFOLLOW);
  assert.equal(mode, 0o600);
});

test("races two claims with exactly one exclusive create and reconciles the existing claim", async () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  const [first, second] = await Promise.all([store.claim(executeControl), store.claim(executeControl)]);
  assert.deepEqual(first, second);
  assert.equal(io.events.filter(([name, filePath]) => name === "open" && filePath === paths.claim).length, 1);
  assert.ok(io.events.filter(([name, filePath]) => name === "readFile" && filePath === paths.claim).length >= 2);
});

test("rejects an existing claim for another canonical execution", async () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  await store.claim(executeControl);
  await expectStateRejection(
    () => store.claim({ ...executeControl, workflowCommit: "e".repeat(40) }),
    "execution_claim_mismatch"
  );
  assert.equal(io.events.filter(([name, filePath]) => name === "open" && filePath === paths.claim).length, 1);
});

test("validates every journal phase and exact record shape", () => {
  for (const phase of PHASES) {
    const record = journalFor(phase);
    assert.deepEqual(validateJournal(record), record);
    assert.deepEqual(Object.keys(validateJournal(record)), JOURNAL_KEYS);
  }

  for (const invalid of [
    journalFor("prepared", { schemaVersion: 3 }),
    journalFor("prepared", { type: "journal" }),
    journalFor("prepared", { sequence: -1 }),
    journalFor("prepared", { sequence: 0.5 }),
    journalFor("prepared", { workflowCommit: "A".repeat(40) }),
    journalFor("prepared", { artifactSha256: "D".repeat(64) }),
    journalFor("prepared", { preparedAt: "2026-07-17T00:00:00Z" }),
    journalFor("prepared", { updatedAt: "2026-02-30T00:00:00.000Z" }),
    journalFor("claimed", { claimSha256: null }),
    journalFor("backup_ready", { originalMapSha256: null }),
    journalFor("applied", { backupSha256: null, originalMapSha256: null }),
    journalFor("apply_intent", { applyBoundary: null }),
    journalFor("observing", { terminalResult: "observing" }),
    journalFor("applied_validated", { terminalResult: null }),
    journalFor("applied_validated", { terminalResult: "rolled_back_validated" }),
    journalFor("prepared", { error: 1 }),
    { ...journalFor("prepared"), executionNonce: EXECUTION_NONCE }
  ]) {
    expectStateError(() => validateJournal(invalid));
  }
});

test("accepts only origin-consistent indeterminate field relationships", () => {
  assert.deepEqual(validateJournal(journalFor("indeterminate", {
    backupSha256: null,
    originalMapSha256: null,
    applyBoundary: null
  })).phase, "indeterminate");
  assert.deepEqual(validateJournal(journalFor("indeterminate", {
    applyBoundary: null
  })).phase, "indeterminate");
  for (const invalid of [
    journalFor("indeterminate", { backupSha256: null }),
    journalFor("indeterminate", { backupSha256: null, originalMapSha256: null, applyBoundary: "helper_rename" })
  ]) {
    expectStateError(() => validateJournal(invalid));
  }
});

test("enforces the complete phase matrix, exact sequence increment, and immutable identities", () => {
  for (const currentPhase of PHASES) {
    const current = journalFor(currentPhase, { sequence: 20 });
    for (const nextPhase of PHASES) {
      const next = nextJournal(current, nextPhase);
      const key = `${currentPhase}->${nextPhase}`;
      if (ALLOWED_TRANSITIONS.has(key)) {
        assert.deepEqual(validateJournalTransition(current, next), next, key);
      } else {
        expectStateError(() => validateJournalTransition(current, next));
      }
    }
  }

  const current = journalFor("backup_ready", { sequence: 30 });
  expectStateError(() => validateJournalTransition(current, nextJournal(current, "apply_intent", { sequence: 32 })));
  expectStateError(() => validateJournalTransition(current, nextJournal(current, "apply_intent", { workflowCommit: "e".repeat(40) })));
  expectStateError(() => validateJournalTransition(current, nextJournal(current, "apply_intent", { preparedAt: timestamp(1) })));
  const terminal = journalFor("applied_validated", { sequence: 40 });
  expectStateError(() => validateJournalTransition(terminal, nextJournal(terminal, "observing")));
});

test("writes and reads the exact backup receipt schema", async () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  const receipt = backupReceipt();
  assert.deepEqual(await store.writeBackupReceipt(receipt), receipt);
  assert.deepEqual(Object.keys(await store.readBackupReceipt()), BACKUP_KEYS);
  assert.equal(io.files.get(paths.backupReceipt), canonicalLine(receipt));

  for (const invalid of [
    backupReceipt({ schemaVersion: 3 }),
    backupReceipt({ type: "backup" }),
    backupReceipt({ claimSha256: "C".repeat(64) }),
    backupReceipt({ mode: -1 }),
    backupReceipt({ uid: 0.5 }),
    backupReceipt({ gid: "0" }),
    backupReceipt({ createdAt: "2026-07-17T00:00:01Z" }),
    { ...backupReceipt(), executionNonce: EXECUTION_NONCE }
  ]) {
    await expectStateRejection(() => store.writeBackupReceipt(invalid), "backup_failed");
  }
});

test("persists prepared exclusively and transitions through canonical atomic replacement", async () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  const prepared = journalFor("prepared", { sequence: 0 });
  const claimed = nextJournal(prepared, "claimed");

  assert.deepEqual(await store.writePrepared(prepared), prepared);
  assert.deepEqual(await store.transition(0, claimed), claimed);
  assert.equal(io.files.get(paths.journal), canonicalLine(claimed));

  const renameIndex = io.events.findIndex(([name]) => name === "rename");
  const atomicNames = io.events.slice(renameIndex - 4, renameIndex + 2).map(([name]) => name);
  assert.deepEqual(atomicNames, ["open", "write", "fsyncFile", "close", "rename", "fsyncDirectory"]);
  const [, temporary, destination] = io.events[renameIndex];
  assert.equal(destination, paths.journal);
  assert.notEqual(temporary, paths.journal);
  assert.equal(temporary.slice(0, temporary.lastIndexOf("\\")), paths.journal.slice(0, paths.journal.lastIndexOf("\\")));
});

test("rejects stale CAS without opening an atomic replacement", async () => {
  const io = createFakeIo();
  const prepared = journalFor("prepared", { sequence: 0 });
  io.files.set(paths.journal, canonicalLine(prepared));
  const store = createRepairStateStore({ paths, io });
  await expectStateRejection(() => store.transition(1, nextJournal(prepared, "claimed")));
  assert.equal(io.events.filter(([name]) => name === "open").length, 0);
  assert.equal(io.files.get(paths.journal), canonicalLine(prepared));
});

test("fails closed at exclusive create and file fsync without a later durable operation", async () => {
  for (const failAt of ["open", "fsyncFile"]) {
    const io = createFakeIo({ failAt });
    const store = createRepairStateStore({ paths, io });
    await expectStateRejection(() => store.writePrepared(journalFor("prepared", { sequence: 0 })));
    assert.equal(io.events.some(([name]) => name === "fsyncDirectory"), false);
    assert.equal(io.events.some(([name]) => name === "rename"), false);
  }
});

test("fails closed at atomic rename, removes only its own temporary, and preserves the current phase", async () => {
  const io = createFakeIo({ failAt: "rename" });
  const prepared = journalFor("prepared", { sequence: 0 });
  io.files.set(paths.journal, canonicalLine(prepared));
  const store = createRepairStateStore({ paths, io });
  await expectStateRejection(() => store.transition(0, nextJournal(prepared, "claimed")));
  assert.equal(io.files.get(paths.journal), canonicalLine(prepared));
  const removed = io.events.filter(([name]) => name === "remove");
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0][1], paths.journal);
  assert.equal(io.events.some(([name]) => name === "fsyncDirectory"), false);
});

test("fails closed when directory fsync cannot confirm an atomic transition", async () => {
  const io = createFakeIo({ failAt: "fsyncDirectory" });
  const prepared = journalFor("prepared", { sequence: 0 });
  const claimed = nextJournal(prepared, "claimed");
  io.files.set(paths.journal, canonicalLine(prepared));
  const store = createRepairStateStore({ paths, io });
  await expectStateRejection(() => store.transition(0, claimed));
  assert.equal(io.files.get(paths.journal), canonicalLine(claimed));
  assert.equal(io.events.at(-1)[0], "fsyncDirectory");
  assert.equal(io.events.some(([name]) => name === "remove"), false);
});

test("readSnapshot validates canonical bytes and returns only durable records", async () => {
  const io = createFakeIo();
  const store = createRepairStateStore({ paths, io });
  const prepared = journalFor("prepared", { sequence: 0 });
  await store.writePrepared(prepared);
  const claim = await store.claim(executeControl);
  const claimed = nextJournal(prepared, "claimed", { claimSha256: claim.claimSha256 });
  await store.transition(0, claimed);
  const backup = backupReceipt({ claimSha256: claim.claimSha256 });
  await store.writeBackupReceipt(backup);
  const backupReady = nextJournal(claimed, "backup_ready", {
    backupSha256: backup.backupSha256,
    originalMapSha256: backup.originalMapSha256
  });
  await store.transition(1, backupReady);
  assert.deepEqual(await store.readSnapshot(), { claim, journal: backupReady, backup });

  io.files.set(paths.journal, JSON.stringify(backupReady));
  await expectStateRejection(() => store.readSnapshot());
});

test("readSnapshot rejects impossible claim and backup relationships", async () => {
  const io = createFakeIo();
  const claim = {
    schemaVersion: "3",
    type: "japan_tuic_additive_repair_claim",
    claimSha256: CLAIM_SHA256,
    nonceSha256: EXPECTED_NONCE_SHA256,
    workflowCommit: WORKFLOW_COMMIT,
    claimedAt: "2026-07-17T00:00:02.000Z"
  };
  io.files.set(paths.claim, canonicalLine(claim));
  io.files.set(paths.journal, canonicalLine(journalFor("claimed", { claimSha256: "e".repeat(64) })));
  const store = createRepairStateStore({ paths, io });
  await expectStateRejection(() => store.readSnapshot());

  io.files.set(paths.journal, canonicalLine(journalFor("backup_ready")));
  await expectStateRejection(() => store.readSnapshot());

  io.files.set(paths.journal, canonicalLine(journalFor("prepared", { sequence: 0 })));
  io.files.set(paths.backupReceipt, canonicalLine(backupReceipt()));
  await expectStateRejection(() => store.readSnapshot());
});
