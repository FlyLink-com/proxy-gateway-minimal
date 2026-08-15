#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TRANSITION_EVIDENCE_SCHEMA_VERSION = "1";
export const TRANSITION_EVIDENCE_TYPE = "control_plane_transition_evidence";
export const MINIMUM_HEALTHY_LOCAL_ROOT_SUCCESSES = 3;

const RECORD_FILE_PATTERN = /^(\d{6})-(pre_switch|candidate_started|candidate_health_terminal|validated_terminal|rollback_terminal)\.json$/;
const RELEASE_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const TRANSITION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,159}$/;
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SECRET_LABEL_FRAGMENT_PATTERN = /(?:^|[._-])(?:secret|token|password|passwd|credential|authorization|bearer|api[_-]?key|private[_-]?key)(?:$|[._-])/i;
const ACCESS_TOKEN_LABEL_PATTERN = /^(?:(?:sk|pk)_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9_-]{8,})$/i;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_PROBE_ATTEMPTS = 10_000;
const MAX_ELAPSED_MS = 3_600_000;

const STAGES = new Set([
  "pre_switch",
  "candidate_started",
  "candidate_health_terminal",
  "validated_terminal",
  "rollback_terminal"
]);
const ACTIVE_STATES = new Set(["active", "inactive", "failed", "unknown"]);
const SUBSTATES = new Set(["running", "dead", "failed", "exited", "unknown"]);
const SERVICE_RESULTS = new Set(["success", "failure", "unknown"]);
const PID_RELATIONS = new Set(["same", "different", "missing", "unknown"]);
const CWD_BINDINGS = new Set(["candidate", "rollback", "mismatch", "unknown"]);
const CANDIDATE_STARTED_CWD_BINDINGS = new Set(["candidate", "mismatch", "unknown"]);
const TERMINAL_CONDITIONS = new Set([
  "pending",
  "healthy",
  "runtime_inactive",
  "runtime_substate_unexpected",
  "service_result_unexpected",
  "main_exec_pid_relation_unexpected",
  "cwd_binding_failed",
  "restart_count_changed",
  "local_root_probe_failed",
  "local_root_probe_timeout",
  "observation_unavailable",
  "validated",
  "rollback_completed"
]);
const TERMINAL_STAGES = new Set(["validated_terminal", "rollback_terminal"]);

class TransitionEvidenceError extends Error {
  constructor(condition) {
    super(condition);
    this.name = "TransitionEvidenceError";
    this.condition = condition;
  }
}

function fail(condition) {
  throw new TransitionEvidenceError(condition);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys) {
  if (!isPlainObject(value)) fail("record_schema_invalid");
  if (Object.getOwnPropertySymbols(value).length !== 0) fail("record_schema_invalid");
  const actual = Object.getOwnPropertyNames(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("record_schema_invalid");
  }
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail("record_schema_invalid");
    }
  }
}

function ownDataCopy(value) {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    fail("record_schema_invalid");
  }
  const copy = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail("record_schema_invalid");
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

function assertBoolean(value) {
  if (typeof value !== "boolean") fail("record_schema_invalid");
  return value;
}

function assertSafeInteger(value, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    fail("record_schema_invalid");
  }
  return value;
}

function assertEnum(value, allowed) {
  if (typeof value !== "string" || !allowed.has(value)) fail("record_schema_invalid");
  return value;
}

function assertReleaseLabel(value) {
  if (typeof value !== "string" || !RELEASE_LABEL_PATTERN.test(value)) {
    fail("record_schema_invalid");
  }
  if (SECRET_LABEL_FRAGMENT_PATTERN.test(value) || ACCESS_TOKEN_LABEL_PATTERN.test(value)) {
    fail("record_schema_invalid");
  }
  return value;
}

function assertTransitionId(value) {
  if (typeof value !== "string" || !TRANSITION_ID_PATTERN.test(value)) {
    fail("record_schema_invalid");
  }
  if (SECRET_LABEL_FRAGMENT_PATTERN.test(value) || ACCESS_TOKEN_LABEL_PATTERN.test(value)) {
    fail("record_schema_invalid");
  }
  return value;
}

function assertIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail("record_schema_invalid");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("record_schema_invalid");
  }
  return value;
}

function assertStatus(value) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 100 || value > 599) {
    fail("record_schema_invalid");
  }
  return value;
}

function assertBinding(binding) {
  assertExactKeys(binding, [
    "sourceCommit",
    "candidateRelease",
    "artifactSha256",
    "assemblySha256",
    "snapshotSha256",
    "snapshotLabel",
    "rollbackRelease"
  ]);
  if (!COMMIT_PATTERN.test(binding.sourceCommit)) fail("record_schema_invalid");
  for (const key of ["artifactSha256", "assemblySha256", "snapshotSha256"]) {
    if (typeof binding[key] !== "string" || !SHA256_PATTERN.test(binding[key])) {
      fail("record_schema_invalid");
    }
  }
  for (const key of ["candidateRelease", "snapshotLabel", "rollbackRelease"]) {
    assertReleaseLabel(binding[key]);
  }
}

function assertService(service) {
  assertExactKeys(service, [
    "activeState",
    "substate",
    "result",
    "mainExecPidRelation",
    "cwdBinding",
    "restartBaseline",
    "restartObserved",
    "restartDelta"
  ]);
  assertEnum(service.activeState, ACTIVE_STATES);
  assertEnum(service.substate, SUBSTATES);
  assertEnum(service.result, SERVICE_RESULTS);
  assertEnum(service.mainExecPidRelation, PID_RELATIONS);
  assertEnum(service.cwdBinding, CWD_BINDINGS);
  const baseline = assertSafeInteger(service.restartBaseline);
  const observed = assertSafeInteger(service.restartObserved);
  const delta = service.restartDelta;
  if (!Number.isSafeInteger(delta) || delta < -Number.MAX_SAFE_INTEGER || delta > Number.MAX_SAFE_INTEGER) {
    fail("record_schema_invalid");
  }
  if (delta !== observed - baseline) fail("record_schema_invalid");
}

function assertLocalRootProbe(probe) {
  assertExactKeys(probe, [
    "attemptCount",
    "successCount",
    "consecutiveSuccessCount",
    "firstStatus",
    "finalStatus",
    "timeoutCount",
    "elapsedMs",
    "terminalCondition"
  ]);
  const attemptCount = assertSafeInteger(probe.attemptCount, { max: MAX_PROBE_ATTEMPTS });
  const successCount = assertSafeInteger(probe.successCount, { max: MAX_PROBE_ATTEMPTS });
  const consecutiveSuccessCount = assertSafeInteger(probe.consecutiveSuccessCount, {
    max: MAX_PROBE_ATTEMPTS
  });
  const timeoutCount = assertSafeInteger(probe.timeoutCount, { max: MAX_PROBE_ATTEMPTS });
  const firstStatus = assertStatus(probe.firstStatus);
  const finalStatus = assertStatus(probe.finalStatus);
  assertSafeInteger(probe.elapsedMs, { max: MAX_ELAPSED_MS });
  assertEnum(probe.terminalCondition, TERMINAL_CONDITIONS);
  if (
    successCount > attemptCount
    || timeoutCount > attemptCount
    || successCount > attemptCount - timeoutCount
    || consecutiveSuccessCount > successCount
    || consecutiveSuccessCount > attemptCount - timeoutCount
    || (attemptCount === 0 && (firstStatus !== null || finalStatus !== null))
  ) {
    fail("record_schema_invalid");
  }
}

function assertOutcome(outcome) {
  assertExactKeys(outcome, [
    "pointerMatchesCandidate",
    "rollbackPerformed",
    "rollbackPointerMatchesPrevious"
  ]);
  assertBoolean(outcome.pointerMatchesCandidate);
  assertBoolean(outcome.rollbackPerformed);
  assertBoolean(outcome.rollbackPointerMatchesPrevious);
}

function hasContinuousLocalRootSuccessWindow(localRootProbe) {
  return !(
    localRootProbe.attemptCount < MINIMUM_HEALTHY_LOCAL_ROOT_SUCCESSES
    || localRootProbe.successCount !== localRootProbe.attemptCount
    || localRootProbe.consecutiveSuccessCount !== localRootProbe.attemptCount
    || localRootProbe.firstStatus !== 200
    || localRootProbe.finalStatus !== 200
    || localRootProbe.timeoutCount !== 0
  );
}

function assertContinuousLocalRootSuccessWindow(localRootProbe) {
  if (!hasContinuousLocalRootSuccessWindow(localRootProbe)) fail("record_schema_invalid");
}

function candidateObservationUnavailable(observation) {
  const { service, localRootProbe } = observation;
  return service.activeState === "unknown"
    || service.substate === "unknown"
    || service.result === "unknown"
    || service.mainExecPidRelation === "unknown"
    || service.mainExecPidRelation === "missing"
    || service.cwdBinding === "unknown"
    || localRootProbe.attemptCount === 0;
}

function candidateHealthTerminalCondition(observation) {
  const { service, localRootProbe } = observation;
  if (candidateObservationUnavailable(observation)) return "observation_unavailable";
  if (service.activeState !== "active") return "runtime_inactive";
  if (service.substate !== "running") return "runtime_substate_unexpected";
  if (service.result !== "success") return "service_result_unexpected";
  if (service.mainExecPidRelation !== "same") return "main_exec_pid_relation_unexpected";
  if (service.cwdBinding !== "candidate") return "cwd_binding_failed";
  if (service.restartDelta !== 0) return "restart_count_changed";
  if (localRootProbe.timeoutCount > 0) return "local_root_probe_timeout";
  if (!hasContinuousLocalRootSuccessWindow(localRootProbe)) return "local_root_probe_failed";
  return "healthy";
}

function assertHealthyObservation(observation) {
  const { service } = observation;
  if (
    service.activeState !== "active"
    || service.substate !== "running"
    || service.result !== "success"
    || service.mainExecPidRelation !== "same"
    || service.cwdBinding !== "candidate"
    || service.restartDelta !== 0
  ) {
    fail("record_schema_invalid");
  }
  assertContinuousLocalRootSuccessWindow(observation.localRootProbe);
}

function assertPreSwitchHealthyObservation(observation) {
  const { service } = observation;
  if (
    service.activeState !== "active"
    || service.substate !== "running"
    || service.result !== "success"
    || service.mainExecPidRelation !== "same"
    || service.cwdBinding !== "rollback"
    || service.restartObserved !== service.restartBaseline
    || service.restartDelta !== 0
  ) {
    fail("record_schema_invalid");
  }
  assertContinuousLocalRootSuccessWindow(observation.localRootProbe);
}

function assertRollbackObservation(observation) {
  const { service } = observation;
  if (
    service.activeState !== "active"
    || service.substate !== "running"
    || service.result !== "success"
    || service.mainExecPidRelation !== "same"
    || service.cwdBinding !== "rollback"
    || service.restartDelta < 0
  ) {
    fail("record_schema_invalid");
  }
  assertContinuousLocalRootSuccessWindow(observation.localRootProbe);
}

function assertStageInvariants(record) {
  const { stage, observation, outcome } = record;
  const condition = observation.localRootProbe.terminalCondition;
  if (stage === "pre_switch") {
    if (
      condition !== "pending"
      || outcome.pointerMatchesCandidate !== false
      || outcome.rollbackPerformed !== false
      || outcome.rollbackPointerMatchesPrevious !== false
    ) fail("record_schema_invalid");
    assertPreSwitchHealthyObservation(observation);
    return;
  }
  if (stage === "candidate_started") {
    if (
      condition !== "pending"
      || !CANDIDATE_STARTED_CWD_BINDINGS.has(observation.service.cwdBinding)
      || outcome.pointerMatchesCandidate !== true
      || outcome.rollbackPerformed !== false
      || outcome.rollbackPointerMatchesPrevious !== false
    ) fail("record_schema_invalid");
    return;
  }
  if (stage === "candidate_health_terminal") {
    const expectedCondition = candidateHealthTerminalCondition(observation);
    if (
      condition !== expectedCondition
      || outcome.pointerMatchesCandidate !== true
      || outcome.rollbackPerformed !== false
      || outcome.rollbackPointerMatchesPrevious !== false
    ) fail("record_schema_invalid");
    if (
      (condition === "cwd_binding_failed" && observation.service.cwdBinding !== "mismatch")
      || (condition === "observation_unavailable" && ![
        "candidate",
        "unknown"
      ].includes(observation.service.cwdBinding))
      || (!["cwd_binding_failed", "observation_unavailable"].includes(condition)
        && observation.service.cwdBinding !== "candidate")
    ) fail("record_schema_invalid");
    if (condition === "healthy") assertHealthyObservation(observation);
    return;
  }
  if (stage === "validated_terminal") {
    if (
      condition !== "validated"
      || outcome.pointerMatchesCandidate !== true
      || outcome.rollbackPerformed !== false
      || outcome.rollbackPointerMatchesPrevious !== false
    ) fail("record_schema_invalid");
    assertHealthyObservation(observation);
    return;
  }
  if (stage === "rollback_terminal") {
    if (
      condition !== "rollback_completed"
      || outcome.pointerMatchesCandidate !== false
      || outcome.rollbackPerformed !== true
      || outcome.rollbackPointerMatchesPrevious !== true
    ) fail("record_schema_invalid");
    assertRollbackObservation(observation);
    return;
  }
  fail("record_schema_invalid");
}

function assertRecordSchema(record) {
  assertExactKeys(record, [
    "schemaVersion",
    "type",
    "transitionId",
    "sequence",
    "previousRecordSha256",
    "stage",
    "recordedAt",
    "binding",
    "observation",
    "outcome"
  ]);
  if (record.schemaVersion !== TRANSITION_EVIDENCE_SCHEMA_VERSION || record.type !== TRANSITION_EVIDENCE_TYPE) {
    fail("record_schema_invalid");
  }
  assertTransitionId(record.transitionId);
  assertSafeInteger(record.sequence, { max: 999_999 });
  if (record.sequence === 0) {
    if (record.previousRecordSha256 !== null) fail("record_schema_invalid");
  } else if (typeof record.previousRecordSha256 !== "string" || !SHA256_PATTERN.test(record.previousRecordSha256)) {
    fail("record_schema_invalid");
  }
  assertEnum(record.stage, STAGES);
  assertIsoTimestamp(record.recordedAt);
  assertBinding(record.binding);
  assertExactKeys(record.observation, ["service", "localRootProbe"]);
  assertService(record.observation.service);
  assertLocalRootProbe(record.observation.localRootProbe);
  assertOutcome(record.outcome);
  assertStageInvariants(record);
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (!isPlainObject(value)) fail("record_schema_invalid");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function createTransitionEvidenceRecord(record) {
  const normalized = ownDataCopy(record);
  if (!Object.hasOwn(normalized, "schemaVersion")) {
    normalized.schemaVersion = TRANSITION_EVIDENCE_SCHEMA_VERSION;
  }
  if (!Object.hasOwn(normalized, "type")) {
    normalized.type = TRANSITION_EVIDENCE_TYPE;
  }
  assertRecordSchema(normalized);
  return JSON.parse(canonicalJson(normalized));
}

export function serializeTransitionEvidenceRecord(record) {
  return canonicalJson(createTransitionEvidenceRecord(record));
}

export function transitionEvidenceRecordSha256(record) {
  return createHash("sha256")
    .update(serializeTransitionEvidenceRecord(record), "utf8")
    .digest("hex");
}

function comparablePath(value) {
  const absolute = resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function assertOwnedByCurrentProcess(metadata, condition) {
  if (process.platform === "win32") return;
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isSafeInteger(uid) || metadata.uid !== uid) fail(condition);
}

function assertTrustedEvidenceParents(path) {
  if (process.platform === "win32") return;
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isSafeInteger(uid)) fail("evidence_directory_invalid");
  let parent = dirname(path);
  while (true) {
    let metadata;
    try {
      metadata = lstatSync(parent);
    } catch {
      fail("evidence_directory_invalid");
    }
    const groupOrOtherWritable = (metadata.mode & 0o022) !== 0;
    const sticky = (metadata.mode & 0o1000) !== 0;
    if (
      metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || (metadata.uid !== uid && metadata.uid !== 0)
      || (groupOrOtherWritable && !sticky)
    ) {
      fail("evidence_directory_invalid");
    }
    const next = dirname(parent);
    if (next === parent) return;
    parent = next;
  }
}

function assertEvidenceDirectory(value) {
  if (typeof value !== "string" || !isAbsolute(value)) fail("evidence_directory_invalid");
  const path = resolve(value);
  let metadata;
  let realPath;
  try {
    metadata = lstatSync(path);
    realPath = realpathSync(path);
  } catch {
    fail("evidence_directory_invalid");
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || comparablePath(path) !== comparablePath(realPath)
    || (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
  ) {
    fail("evidence_directory_invalid");
  }
  assertOwnedByCurrentProcess(metadata, "evidence_directory_invalid");
  assertTrustedEvidenceParents(path);
  return realPath;
}

function recordFileName(record) {
  return `${String(record.sequence).padStart(6, "0")}-${record.stage}.json`;
}

function recordPath(directory, fileName) {
  const path = resolve(directory, fileName);
  if (dirname(path) !== directory || basename(path) !== fileName) {
    fail("record_integrity_invalid");
  }
  return path;
}

function assertRecordFile(path) {
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch {
    fail("record_unavailable");
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isFile()
    || metadata.size <= 0
    || metadata.size > MAX_RECORD_BYTES
    || (process.platform !== "win32" && metadata.nlink !== 1)
  ) {
    fail("record_integrity_invalid");
  }
  if (process.platform !== "win32" && (metadata.mode & 0o777) !== 0o600) {
    fail("record_permission_invalid");
  }
  assertOwnedByCurrentProcess(metadata, "record_permission_invalid");
}

function readRecordFile(path) {
  assertRecordFile(path);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    fail("record_unavailable");
  }
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes)) fail("record_integrity_invalid");
  let record;
  try {
    record = JSON.parse(source);
  } catch {
    fail("record_integrity_invalid");
  }
  let serialized;
  try {
    serialized = serializeTransitionEvidenceRecord(record);
  } catch {
    fail("record_integrity_invalid");
  }
  if (source !== `${serialized}\n`) fail("record_integrity_invalid");
  return createTransitionEvidenceRecord(record);
}

function listRecordFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    fail("record_unavailable");
  }
  const files = [];
  for (const entry of entries) {
    const match = RECORD_FILE_PATTERN.exec(entry.name);
    if (!match || !entry.isFile() || entry.isSymbolicLink()) {
      fail("record_integrity_invalid");
    }
    files.push({
      sequence: Number(match[1]),
      stage: match[2],
      fileName: entry.name
    });
  }
  return files.sort((left, right) => left.sequence - right.sequence || left.fileName.localeCompare(right.fileName));
}

function expectedNextStage(previous) {
  if (previous.stage === "pre_switch") return new Set(["candidate_started"]);
  if (previous.stage === "candidate_started") return new Set(["candidate_health_terminal"]);
  if (previous.stage === "candidate_health_terminal") {
    return previous.observation.localRootProbe.terminalCondition === "healthy"
      ? new Set(["validated_terminal", "rollback_terminal"])
      : new Set(["rollback_terminal"]);
  }
  return new Set();
}

function assertChainTransition(record, previous, condition, preSwitchRecord = null) {
  if (!previous) {
    if (
      record.sequence !== 0
      || record.previousRecordSha256 !== null
      || record.stage !== "pre_switch"
    ) fail(condition);
    return;
  }
  if (
    !preSwitchRecord
    || preSwitchRecord.stage !== "pre_switch"
    || record.observation.service.restartBaseline
      !== preSwitchRecord.observation.service.restartBaseline
  ) {
    fail(condition);
  }
  const expectedStages = expectedNextStage(previous);
  const previousTimestamp = Date.parse(previous.recordedAt);
  const currentTimestamp = Date.parse(record.recordedAt);
  if (
    record.transitionId !== previous.transitionId
    || record.sequence !== previous.sequence + 1
    || record.previousRecordSha256 !== transitionEvidenceRecordSha256(previous)
    || canonicalJson(record.binding) !== canonicalJson(previous.binding)
    || currentTimestamp < previousTimestamp
    || !expectedStages.has(record.stage)
  ) {
    fail(condition);
  }
}

function readValidatedChain(directory) {
  const files = listRecordFiles(directory);
  const records = [];
  let previous = null;
  for (const file of files) {
    const record = readRecordFile(recordPath(directory, file.fileName));
    if (record.sequence !== file.sequence || record.stage !== file.stage || recordFileName(record) !== file.fileName) {
      fail("record_integrity_invalid");
    }
    assertChainTransition(
      record,
      previous,
      "record_integrity_invalid",
      records[0] ?? null
    );
    records.push(record);
    previous = record;
  }
  return records;
}

function fsyncDirectory(directory) {
  if (process.platform === "win32") return;
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    fail("record_publish_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPublishedRecord(path, expectedRecord) {
  const actual = readRecordFile(path);
  if (serializeTransitionEvidenceRecord(actual) !== serializeTransitionEvidenceRecord(expectedRecord)) {
    fail("record_publish_failed");
  }
}

function publishAtomicRecord({ directory, fileName, record, dependencies = {} }) {
  const finalPath = recordPath(directory, fileName);
  const temporaryPath = recordPath(directory, `.${fileName}.${randomUUID()}.tmp`);
  const publishLink = (() => {
    if (dependencies === undefined) return linkSync;
    if (!isPlainObject(dependencies) || Object.getOwnPropertySymbols(dependencies).length !== 0) {
      fail("invalid_input");
    }
    const keys = Object.getOwnPropertyNames(dependencies);
    if (keys.length === 0) return linkSync;
    if (keys.length !== 1 || keys[0] !== "publishLink") fail("invalid_input");
    const descriptor = Object.getOwnPropertyDescriptor(dependencies, "publishLink");
    if (!descriptor || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "function") {
      fail("invalid_input");
    }
    return descriptor.value;
  })();
  const body = `${serializeTransitionEvidenceRecord(record)}\n`;
  let descriptor;
  let published = false;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, body, "utf8");
    fsyncSync(descriptor);
    chmodSync(temporaryPath, 0o600);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    publishLink(temporaryPath, finalPath);
    published = true;
    fsyncDirectory(directory);
    unlinkSync(temporaryPath);
    fsyncDirectory(directory);
    assertPublishedRecord(finalPath, record);
  } catch (error) {
    try {
      if (descriptor !== undefined) closeSync(descriptor);
    } catch {}
    if (!published) {
      try {
        rmSync(temporaryPath, { force: true });
      } catch {}
      if (error instanceof TransitionEvidenceError) throw error;
      fail("record_publish_failed");
    }
    fail("record_publish_indeterminate");
  }
}

export function readTransitionEvidenceChain({ directory } = {}) {
  const evidenceDirectory = assertEvidenceDirectory(directory);
  return readValidatedChain(evidenceDirectory);
}

export function writeTransitionEvidenceRecord({ directory, record, dependencies = {} } = {}) {
  const evidenceDirectory = assertEvidenceDirectory(directory);
  const candidate = createTransitionEvidenceRecord(record);
  const records = readValidatedChain(evidenceDirectory);
  const previous = records.at(-1) ?? null;
  assertChainTransition(
    candidate,
    previous,
    "record_transition_invalid",
    records[0] ?? null
  );
  const fileName = recordFileName(candidate);
  if (records.some((entry) => entry.sequence === candidate.sequence || recordFileName(entry) === fileName)) {
    fail("record_transition_invalid");
  }
  publishAtomicRecord({
    directory: evidenceDirectory,
    fileName,
    record: candidate,
    dependencies
  });
  return Object.freeze({
    sha256: transitionEvidenceRecordSha256(candidate),
    sequence: candidate.sequence,
    stage: candidate.stage
  });
}

export function verifyTransitionEvidenceChain({ directory } = {}) {
  const records = readTransitionEvidenceChain({ directory });
  const terminal = records.at(-1);
  if (!terminal || !TERMINAL_STAGES.has(terminal.stage)) fail("evidence_incomplete");
  return Object.freeze({
    transitionId: terminal.transitionId,
    recordCount: records.length,
    terminalStage: terminal.stage,
    terminalCondition: terminal.observation.localRootProbe.terminalCondition,
    terminalRecordSha256: transitionEvidenceRecordSha256(terminal)
  });
}

function argumentValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.filter((item) => item.startsWith(prefix));
  const positional = argv.flatMap((item, index) => item === name ? [argv[index + 1]] : []);
  if (inline.length + positional.length !== 1) fail("invalid_input");
  const value = inline[0]?.slice(prefix.length) ?? positional[0];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) fail("invalid_input");
  return value;
}

function parseCliArguments(argv) {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) fail("invalid_input");
  const mode = argumentValue(argv, "--mode");
  if (!new Set(["write", "verify"]).has(mode)) fail("invalid_input");
  const directory = argumentValue(argv, "--directory");
  const allowed = new Set(["--mode", "--directory"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const key = item.includes("=") ? item.slice(0, item.indexOf("=")) : item;
    if (!allowed.has(key)) fail("invalid_input");
    if (item === key) index += 1;
  }
  return { mode, directory };
}

function readCliRecord(stdin) {
  let bytes;
  try {
    bytes = readFileSync(stdin.fd ?? 0);
  } catch {
    fail("invalid_input");
  }
  if (bytes.length === 0 || bytes.length > MAX_RECORD_BYTES) fail("invalid_input");
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes)) fail("invalid_input");
  try {
    return JSON.parse(source);
  } catch {
    fail("invalid_input");
  }
}

export function runTransitionEvidenceCli({
  argv = process.argv.slice(2),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const { mode, directory } = parseCliArguments(argv);
    if (mode === "verify") {
      stdout.write(`${JSON.stringify(verifyTransitionEvidenceChain({ directory }))}\n`);
      return 0;
    }
    const record = readCliRecord(stdin);
    const result = writeTransitionEvidenceRecord({ directory, record });
    stdout.write(`${JSON.stringify({
      schemaVersion: TRANSITION_EVIDENCE_SCHEMA_VERSION,
      type: TRANSITION_EVIDENCE_TYPE,
      state: "recorded",
      ...result
    })}\n`);
    return 0;
  } catch (error) {
    const condition = error instanceof TransitionEvidenceError
      ? error.condition
      : "invalid_input";
    stderr.write(`${JSON.stringify({
      schemaVersion: TRANSITION_EVIDENCE_SCHEMA_VERSION,
      type: TRANSITION_EVIDENCE_TYPE,
      state: "error",
      condition
    })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runTransitionEvidenceCli();
}
