import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createTransitionEvidenceRecord,
  serializeTransitionEvidenceRecord,
  transitionEvidenceRecordSha256,
  verifyTransitionEvidenceChain,
  writeTransitionEvidenceRecord
} from "../../scripts/control-plane-transition-evidence.mjs";

const SCRIPT_PATH = resolve("scripts/control-plane-transition-evidence.mjs");

function createEvidenceDirectory() {
  return mkdtempSync(join(tmpdir(), "control-plane-transition-evidence-"));
}

function binding() {
  return {
    sourceCommit: "a".repeat(40),
    candidateRelease: "control-plane-215ecd6-20260815",
    artifactSha256: "b".repeat(64),
    assemblySha256: "c".repeat(64),
    snapshotSha256: "d".repeat(64),
    snapshotLabel: "control-db-pre-switch-20260815",
    rollbackRelease: "control-plane-aca1f755-20260814"
  };
}

function service({ cwdBinding = "rollback" } = {}) {
  return {
    activeState: "active",
    substate: "running",
    result: "success",
    mainExecPidRelation: "same",
    cwdBinding,
    restartBaseline: 8,
    restartObserved: 8,
    restartDelta: 0
  };
}

function probe({
  attemptCount = 0,
  successCount = 0,
  consecutiveSuccessCount = 0,
  firstStatus = null,
  finalStatus = null,
  timeoutCount = 0,
  elapsedMs = 0,
  terminalCondition = "pending"
} = {}) {
  return {
    attemptCount,
    successCount,
    consecutiveSuccessCount,
    firstStatus,
    finalStatus,
    timeoutCount,
    elapsedMs,
    terminalCondition
  };
}

function record({
  stage,
  sequence,
  previousRecordSha256,
  recordedAt,
  cwdBinding = "rollback",
  localRootProbe = probe(),
  outcome
}) {
  return createTransitionEvidenceRecord({
    transitionId: "a5d-control-plane-215ecd6-20260815",
    sequence,
    previousRecordSha256,
    stage,
    recordedAt,
    binding: binding(),
    observation: {
      service: service({ cwdBinding }),
      localRootProbe
    },
    outcome
  });
}

function preSwitchRecord() {
  return record({
    stage: "pre_switch",
    sequence: 0,
    previousRecordSha256: null,
    recordedAt: "2026-08-15T14:00:00.000Z",
    localRootProbe: probe({
      attemptCount: 3,
      successCount: 3,
      consecutiveSuccessCount: 3,
      firstStatus: 200,
      finalStatus: 200,
      elapsedMs: 24_000,
      terminalCondition: "pending"
    }),
    outcome: {
      pointerMatchesCandidate: false,
      rollbackPerformed: false,
      rollbackPointerMatchesPrevious: false
    }
  });
}

function candidateStartedRecord(previousRecordSha256) {
  return record({
    stage: "candidate_started",
    sequence: 1,
    previousRecordSha256,
    recordedAt: "2026-08-15T14:00:05.000Z",
    cwdBinding: "candidate",
    outcome: {
      pointerMatchesCandidate: true,
      rollbackPerformed: false,
      rollbackPointerMatchesPrevious: false
    }
  });
}

function healthyCandidateRecord(previousRecordSha256) {
  return record({
    stage: "candidate_health_terminal",
    sequence: 2,
    previousRecordSha256,
    recordedAt: "2026-08-15T14:00:30.000Z",
    cwdBinding: "candidate",
    localRootProbe: probe({
      attemptCount: 3,
      successCount: 3,
      consecutiveSuccessCount: 3,
      firstStatus: 200,
      finalStatus: 200,
      elapsedMs: 25_000,
      terminalCondition: "healthy"
    }),
    outcome: {
      pointerMatchesCandidate: true,
      rollbackPerformed: false,
      rollbackPointerMatchesPrevious: false
    }
  });
}

function validatedRecord(previousRecordSha256) {
  return record({
    stage: "validated_terminal",
    sequence: 3,
    previousRecordSha256,
    recordedAt: "2026-08-15T14:00:31.000Z",
    cwdBinding: "candidate",
    localRootProbe: probe({
      attemptCount: 3,
      successCount: 3,
      consecutiveSuccessCount: 3,
      firstStatus: 200,
      finalStatus: 200,
      elapsedMs: 26_000,
      terminalCondition: "validated"
    }),
    outcome: {
      pointerMatchesCandidate: true,
      rollbackPerformed: false,
      rollbackPointerMatchesPrevious: false
    }
  });
}

function failedCandidateRecord(previousRecordSha256) {
  return record({
    stage: "candidate_health_terminal",
    sequence: 2,
    previousRecordSha256,
    recordedAt: "2026-08-15T14:00:30.000Z",
    cwdBinding: "candidate",
    localRootProbe: probe({
      attemptCount: 3,
      timeoutCount: 3,
      elapsedMs: 25_000,
      terminalCondition: "local_root_probe_timeout"
    }),
    outcome: {
      pointerMatchesCandidate: true,
      rollbackPerformed: false,
      rollbackPointerMatchesPrevious: false
    }
  });
}

function rollbackRecord(previousRecordSha256) {
  return record({
    stage: "rollback_terminal",
    sequence: 3,
    previousRecordSha256,
    recordedAt: "2026-08-15T14:00:45.000Z",
    localRootProbe: probe({
      attemptCount: 3,
      successCount: 3,
      consecutiveSuccessCount: 3,
      firstStatus: 200,
      finalStatus: 200,
      elapsedMs: 40_000,
      terminalCondition: "rollback_completed"
    }),
    outcome: {
      pointerMatchesCandidate: false,
      rollbackPerformed: true,
      rollbackPointerMatchesPrevious: true
    }
  });
}

function writeHealthyChain(directory) {
  const preSwitch = preSwitchRecord();
  const preSwitchWrite = writeTransitionEvidenceRecord({ directory, record: preSwitch });
  const candidateStarted = candidateStartedRecord(preSwitchWrite.sha256);
  const candidateStartedWrite = writeTransitionEvidenceRecord({
    directory,
    record: candidateStarted
  });
  const candidateHealth = healthyCandidateRecord(candidateStartedWrite.sha256);
  const candidateHealthWrite = writeTransitionEvidenceRecord({
    directory,
    record: candidateHealth
  });
  const validated = validatedRecord(candidateHealthWrite.sha256);
  const validatedWrite = writeTransitionEvidenceRecord({ directory, record: validated });
  return {
    preSwitch,
    preSwitchWrite,
    candidateStarted,
    candidateStartedWrite,
    candidateHealth,
    candidateHealthWrite,
    validated,
    validatedWrite
  };
}

test("transition evidence writes and verifies a canonical successful chain", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const chain = writeHealthyChain(directory);
  const verified = verifyTransitionEvidenceChain({ directory });

  assert.deepEqual(verified, {
    transitionId: "a5d-control-plane-215ecd6-20260815",
    recordCount: 4,
    terminalStage: "validated_terminal",
    terminalCondition: "validated",
    terminalRecordSha256: chain.validatedWrite.sha256
  });
  assert.equal(
    readFileSync(join(directory, "000003-validated_terminal.json"), "utf8"),
    `${serializeTransitionEvidenceRecord(chain.validated)}\n`
  );
});

test("transition evidence locks every restart baseline to the pre-switch baseline", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const malformedPreSwitch = preSwitchRecord();
  malformedPreSwitch.observation.service.restartObserved = 9;
  malformedPreSwitch.observation.service.restartDelta = 1;
  assert.throws(
    () => createTransitionEvidenceRecord(malformedPreSwitch),
    /record_schema_invalid/
  );

  const chain = writeHealthyChain(directory);
  const resetBaseline = JSON.parse(serializeTransitionEvidenceRecord(chain.validated));
  resetBaseline.observation.service.restartBaseline = 9;
  resetBaseline.observation.service.restartObserved = 9;
  resetBaseline.observation.service.restartDelta = 0;
  const terminalPath = join(directory, "000003-validated_terminal.json");
  writeFileSync(terminalPath, `${serializeTransitionEvidenceRecord(resetBaseline)}\n`);
  if (process.platform !== "win32") chmodSync(terminalPath, 0o600);

  assert.throws(
    () => verifyTransitionEvidenceChain({ directory }),
    /record_integrity_invalid/
  );
});

test("transition evidence requires a healthy rollback-bound pre-switch observation", () => {
  const serviceFailure = preSwitchRecord();
  serviceFailure.observation.service.activeState = "inactive";
  assert.throws(
    () => createTransitionEvidenceRecord(serviceFailure),
    /record_schema_invalid/
  );

  const localRootFailure = preSwitchRecord();
  localRootFailure.observation.localRootProbe.successCount = 2;
  localRootFailure.observation.localRootProbe.consecutiveSuccessCount = 2;
  localRootFailure.observation.localRootProbe.firstStatus = 502;
  assert.throws(
    () => createTransitionEvidenceRecord(localRootFailure),
    /record_schema_invalid/
  );

  const nonPending = preSwitchRecord();
  nonPending.observation.localRootProbe.terminalCondition = "healthy";
  assert.throws(
    () => createTransitionEvidenceRecord(nonPending),
    /record_schema_invalid/
  );
});

test("transition evidence detects canonical tampering through binding and hash-chain verification", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  writeHealthyChain(directory);
  const candidateStartedPath = join(directory, "000001-candidate_started.json");
  const tampered = JSON.parse(readFileSync(candidateStartedPath, "utf8"));
  tampered.binding.candidateRelease = "control-plane-tampered-20260815";
  writeFileSync(candidateStartedPath, `${serializeTransitionEvidenceRecord(tampered)}\n`);
  if (process.platform !== "win32") chmodSync(candidateStartedPath, 0o600);

  assert.throws(
    () => verifyTransitionEvidenceChain({ directory }),
    /record_integrity_invalid/
  );
});

test("transition evidence permits a failed candidate-health record only into a verified rollback terminal", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const preSwitchWrite = writeTransitionEvidenceRecord({
    directory,
    record: preSwitchRecord()
  });
  const candidateStartedWrite = writeTransitionEvidenceRecord({
    directory,
    record: candidateStartedRecord(preSwitchWrite.sha256)
  });
  const candidateHealthWrite = writeTransitionEvidenceRecord({
    directory,
    record: failedCandidateRecord(candidateStartedWrite.sha256)
  });
  const rollbackWrite = writeTransitionEvidenceRecord({
    directory,
    record: rollbackRecord(candidateHealthWrite.sha256)
  });

  assert.deepEqual(verifyTransitionEvidenceChain({ directory }), {
    transitionId: "a5d-control-plane-215ecd6-20260815",
    recordCount: 4,
    terminalStage: "rollback_terminal",
    terminalCondition: "rollback_completed",
    terminalRecordSha256: rollbackWrite.sha256
  });
});

test("transition evidence rejects non-private record modes on POSIX", {
  skip: process.platform === "win32"
}, (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  writeHealthyChain(directory);
  chmodSync(join(directory, "000000-pre_switch.json"), 0o644);

  assert.throws(
    () => verifyTransitionEvidenceChain({ directory }),
    /record_permission_invalid/
  );
});

test("transition evidence rejects a symlinked evidence directory on POSIX", {
  skip: process.platform === "win32"
}, (t) => {
  const directory = createEvidenceDirectory();
  const alias = `${directory}-alias`;
  t.after(() => {
    rmSync(alias, { force: true });
    rmSync(directory, { recursive: true, force: true });
  });
  symlinkSync(directory, alias, "dir");

  assert.throws(
    () => writeTransitionEvidenceRecord({ directory: alias, record: preSwitchRecord() }),
    /evidence_directory_invalid/
  );
});

test("transition evidence rejects a non-private directory and non-sticky shared parents on POSIX", {
  skip: process.platform === "win32"
}, (t) => {
  const parent = createEvidenceDirectory();
  const directory = join(parent, "evidence");
  mkdirSync(directory, { mode: 0o700 });
  t.after(() => {
    chmodSync(parent, 0o700);
    rmSync(parent, { recursive: true, force: true });
  });

  chmodSync(directory, 0o755);
  assert.throws(
    () => writeTransitionEvidenceRecord({ directory, record: preSwitchRecord() }),
    /evidence_directory_invalid/
  );

  chmodSync(directory, 0o700);
  chmodSync(parent, 0o777);
  assert.throws(
    () => writeTransitionEvidenceRecord({ directory, record: preSwitchRecord() }),
    /evidence_directory_invalid/
  );
});

test("transition evidence rejects a symlinked parent on POSIX", {
  skip: process.platform === "win32"
}, (t) => {
  const parent = createEvidenceDirectory();
  const directory = join(parent, "evidence");
  const alias = `${parent}-alias`;
  mkdirSync(directory, { mode: 0o700 });
  symlinkSync(parent, alias, "dir");
  t.after(() => {
    rmSync(alias, { force: true });
    rmSync(parent, { recursive: true, force: true });
  });

  assert.throws(
    () => writeTransitionEvidenceRecord({
      directory: join(alias, "evidence"),
      record: preSwitchRecord()
    }),
    /evidence_directory_invalid/
  );
});

test("transition evidence rejects unsafe fields, paths, URLs, raw PIDs, and extra keys", () => {
  const unsafe = preSwitchRecord();
  unsafe.binding.candidateRelease = "/opt/proxy-gateway-minimal-candidate/current";
  assert.throws(() => createTransitionEvidenceRecord(unsafe), /record_schema_invalid/);

  const url = preSwitchRecord();
  url.binding.snapshotLabel = "https://example.test/snapshot";
  assert.throws(() => createTransitionEvidenceRecord(url), /record_schema_invalid/);

  const secretLabel = preSwitchRecord();
  secretLabel.binding.candidateRelease = "control-plane-secret-a5d";
  assert.throws(() => createTransitionEvidenceRecord(secretLabel), /record_schema_invalid/);

  const accessTokenLabel = preSwitchRecord();
  accessTokenLabel.binding.snapshotLabel = "sk_abcdefghijk";
  assert.throws(() => createTransitionEvidenceRecord(accessTokenLabel), /record_schema_invalid/);

  const secretTransitionId = preSwitchRecord();
  secretTransitionId.transitionId = "a5d-token-value";
  assert.throws(() => createTransitionEvidenceRecord(secretTransitionId), /record_schema_invalid/);

  const rawPid = preSwitchRecord();
  rawPid.observation.service.mainPid = 12345;
  assert.throws(() => createTransitionEvidenceRecord(rawPid), /record_schema_invalid/);

  const log = preSwitchRecord();
  log.observation.localRootProbe.log = "service output";
  assert.throws(() => createTransitionEvidenceRecord(log), /record_schema_invalid/);

  const accessor = preSwitchRecord();
  let accessorRead = false;
  Object.defineProperty(accessor.observation.service, "result", {
    enumerable: true,
    get() {
      accessorRead = true;
      return "success";
    }
  });
  assert.throws(() => createTransitionEvidenceRecord(accessor), /record_schema_invalid/);
  assert.equal(accessorRead, false);
});

test("transition evidence rejects a healthy terminal with an early or middle local-root failure", () => {
  const earlyFailure = healthyCandidateRecord("e".repeat(64));
  earlyFailure.observation.localRootProbe.successCount = 2;
  earlyFailure.observation.localRootProbe.consecutiveSuccessCount = 2;
  earlyFailure.observation.localRootProbe.firstStatus = 502;
  assert.throws(
    () => createTransitionEvidenceRecord(earlyFailure),
    /record_schema_invalid/
  );

  const middleFailure = healthyCandidateRecord("e".repeat(64));
  middleFailure.observation.localRootProbe.attemptCount = 4;
  middleFailure.observation.localRootProbe.successCount = 3;
  middleFailure.observation.localRootProbe.consecutiveSuccessCount = 2;
  middleFailure.observation.localRootProbe.elapsedMs = 30_000;
  assert.throws(
    () => createTransitionEvidenceRecord(middleFailure),
    /record_schema_invalid/
  );

  const forgedValidated = validatedRecord("e".repeat(64));
  forgedValidated.observation.localRootProbe.successCount = 2;
  forgedValidated.observation.localRootProbe.consecutiveSuccessCount = 2;
  forgedValidated.observation.localRootProbe.firstStatus = 502;
  assert.throws(
    () => createTransitionEvidenceRecord(forgedValidated),
    /record_schema_invalid/
  );
});

test("transition evidence derives candidate-health terminal conditions from a fixed observation priority", () => {
  const healthyButTimeout = healthyCandidateRecord("e".repeat(64));
  healthyButTimeout.observation.localRootProbe.terminalCondition = "local_root_probe_timeout";
  assert.throws(
    () => createTransitionEvidenceRecord(healthyButTimeout),
    /record_schema_invalid/
  );

  const inactiveButTimeout = failedCandidateRecord("e".repeat(64));
  inactiveButTimeout.observation.service.activeState = "inactive";
  assert.throws(
    () => createTransitionEvidenceRecord(inactiveButTimeout),
    /record_schema_invalid/
  );
  inactiveButTimeout.observation.localRootProbe.terminalCondition = "runtime_inactive";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(inactiveButTimeout));

  const unknownBeforeTimeout = failedCandidateRecord("e".repeat(64));
  unknownBeforeTimeout.observation.service.activeState = "unknown";
  unknownBeforeTimeout.observation.localRootProbe.terminalCondition = "observation_unavailable";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(unknownBeforeTimeout));

  const missingPidBeforeTimeout = failedCandidateRecord("e".repeat(64));
  missingPidBeforeTimeout.observation.service.mainExecPidRelation = "missing";
  missingPidBeforeTimeout.observation.localRootProbe.terminalCondition = "observation_unavailable";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(missingPidBeforeTimeout));

  const missingProbeBeforeTimeout = healthyCandidateRecord("e".repeat(64));
  missingProbeBeforeTimeout.observation.localRootProbe = probe({
    terminalCondition: "observation_unavailable"
  });
  assert.doesNotThrow(() => createTransitionEvidenceRecord(missingProbeBeforeTimeout));

  const restartBeforeTimeout = failedCandidateRecord("e".repeat(64));
  restartBeforeTimeout.observation.service.restartObserved = 9;
  restartBeforeTimeout.observation.service.restartDelta = 1;
  restartBeforeTimeout.observation.localRootProbe.terminalCondition = "restart_count_changed";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(restartBeforeTimeout));

  const httpFailure = healthyCandidateRecord("e".repeat(64));
  httpFailure.observation.localRootProbe.successCount = 2;
  httpFailure.observation.localRootProbe.consecutiveSuccessCount = 2;
  httpFailure.observation.localRootProbe.firstStatus = 502;
  httpFailure.observation.localRootProbe.terminalCondition = "local_root_probe_failed";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(httpFailure));

  const unavailableWithoutUnknown = healthyCandidateRecord("e".repeat(64));
  unavailableWithoutUnknown.observation.localRootProbe.terminalCondition = "observation_unavailable";
  assert.throws(
    () => createTransitionEvidenceRecord(unavailableWithoutUnknown),
    /record_schema_invalid/
  );
});

test("transition evidence records only the stage-appropriate redacted CWD binding", () => {
  const preSwitch = preSwitchRecord();
  preSwitch.observation.service.cwdBinding = "candidate";
  assert.throws(() => createTransitionEvidenceRecord(preSwitch), /record_schema_invalid/);

  const candidateStartedUnknown = candidateStartedRecord("e".repeat(64));
  candidateStartedUnknown.observation.service.cwdBinding = "unknown";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(candidateStartedUnknown));

  const candidateStartedMismatch = candidateStartedRecord("e".repeat(64));
  candidateStartedMismatch.observation.service.cwdBinding = "mismatch";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(candidateStartedMismatch));

  const candidateStartedRollback = candidateStartedRecord("e".repeat(64));
  candidateStartedRollback.observation.service.cwdBinding = "rollback";
  assert.throws(
    () => createTransitionEvidenceRecord(candidateStartedRollback),
    /record_schema_invalid/
  );

  const candidateCwdFailure = healthyCandidateRecord("e".repeat(64));
  candidateCwdFailure.observation.service.cwdBinding = "mismatch";
  candidateCwdFailure.observation.localRootProbe.terminalCondition = "cwd_binding_failed";
  assert.doesNotThrow(() => createTransitionEvidenceRecord(candidateCwdFailure));

  const candidateCwdMismatchClaimingHealthy = healthyCandidateRecord("e".repeat(64));
  candidateCwdMismatchClaimingHealthy.observation.service.cwdBinding = "mismatch";
  assert.throws(
    () => createTransitionEvidenceRecord(candidateCwdMismatchClaimingHealthy),
    /record_schema_invalid/
  );

  const validatedMismatch = validatedRecord("e".repeat(64));
  validatedMismatch.observation.service.cwdBinding = "mismatch";
  assert.throws(
    () => createTransitionEvidenceRecord(validatedMismatch),
    /record_schema_invalid/
  );
});

test("transition evidence rejects a rollback terminal without a recovered local-root postcheck", () => {
  const serviceFailure = rollbackRecord("e".repeat(64));
  serviceFailure.observation.service.activeState = "failed";
  serviceFailure.observation.service.substate = "failed";
  serviceFailure.observation.service.result = "failure";
  assert.throws(
    () => createTransitionEvidenceRecord(serviceFailure),
    /record_schema_invalid/
  );

  const localFailure = rollbackRecord("e".repeat(64));
  localFailure.observation.localRootProbe.successCount = 2;
  localFailure.observation.localRootProbe.consecutiveSuccessCount = 2;
  localFailure.observation.localRootProbe.timeoutCount = 1;
  localFailure.observation.localRootProbe.finalStatus = null;
  assert.throws(
    () => createTransitionEvidenceRecord(localFailure),
    /record_schema_invalid/
  );

  const candidateCwd = rollbackRecord("e".repeat(64));
  candidateCwd.observation.service.cwdBinding = "candidate";
  assert.throws(
    () => createTransitionEvidenceRecord(candidateCwd),
    /record_schema_invalid/
  );

  const thirdPartyCwd = rollbackRecord("e".repeat(64));
  thirdPartyCwd.observation.service.cwdBinding = "mismatch";
  assert.throws(
    () => createTransitionEvidenceRecord(thirdPartyCwd),
    /record_schema_invalid/
  );

  const negativeRestartDelta = rollbackRecord("e".repeat(64));
  negativeRestartDelta.observation.service.restartObserved = 7;
  negativeRestartDelta.observation.service.restartDelta = -1;
  assert.throws(
    () => createTransitionEvidenceRecord(negativeRestartDelta),
    /record_schema_invalid/
  );

  const observedRestart = rollbackRecord("e".repeat(64));
  observedRestart.observation.service.restartObserved = 9;
  observedRestart.observation.service.restartDelta = 1;
  assert.doesNotThrow(() => createTransitionEvidenceRecord(observedRestart));
});

test("transition evidence rejects invalid stage transitions before publishing a record", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const preSwitch = preSwitchRecord();
  const preSwitchWrite = writeTransitionEvidenceRecord({ directory, record: preSwitch });
  const invalid = record({
    stage: "candidate_health_terminal",
    sequence: 1,
    previousRecordSha256: preSwitchWrite.sha256,
    recordedAt: "2026-08-15T14:00:10.000Z",
    cwdBinding: "candidate",
    localRootProbe: probe({
      attemptCount: 3,
      successCount: 3,
      consecutiveSuccessCount: 3,
      firstStatus: 200,
      finalStatus: 200,
      elapsedMs: 15_000,
      terminalCondition: "healthy"
    }),
    outcome: {
      pointerMatchesCandidate: true,
      rollbackPerformed: false,
      rollbackPointerMatchesPrevious: false
    }
  });

  assert.throws(
    () => writeTransitionEvidenceRecord({ directory, record: invalid }),
    /record_transition_invalid/
  );
  assert.deepEqual(readdirSync(directory).sort(), ["000000-pre_switch.json"]);
});

test("transition evidence never publishes a partial record when the atomic publish link fails", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const preSwitch = preSwitchRecord();
  const preSwitchWrite = writeTransitionEvidenceRecord({ directory, record: preSwitch });
  const candidateStarted = candidateStartedRecord(preSwitchWrite.sha256);
  const originalBytes = readFileSync(join(directory, "000000-pre_switch.json"));

  assert.throws(
    () => writeTransitionEvidenceRecord({
      directory,
      record: candidateStarted,
      dependencies: {
        publishLink() {
          throw new Error("simulated_publish_failure");
        }
      }
    }),
    /record_publish_failed/
  );

  assert.deepEqual(readdirSync(directory).sort(), ["000000-pre_switch.json"]);
  assert.deepEqual(readFileSync(join(directory, "000000-pre_switch.json")), originalBytes);
  assert.equal(transitionEvidenceRecordSha256(preSwitch), preSwitchWrite.sha256);
});

test("transition evidence CLI accepts only the safe record payload from stdin", (t) => {
  const directory = createEvidenceDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--mode", "write",
    "--directory", directory
  ], {
    input: JSON.stringify(preSwitchRecord()),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: "1",
    type: "control_plane_transition_evidence",
    state: "recorded",
    sha256: transitionEvidenceRecordSha256(preSwitchRecord()),
    sequence: 0,
    stage: "pre_switch"
  });
  assert.deepEqual(readdirSync(directory), ["000000-pre_switch.json"]);
});
