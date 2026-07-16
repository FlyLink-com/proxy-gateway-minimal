#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync
} from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, posix, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  JAPAN_TUIC_REPAIR_GATE,
  JapanTuicRepairContractError,
  validateArtifactIdentity,
  validateCandidateReport,
  validateExecutionReceipt,
  validateNaturalObservation,
  validatePostApplyIdentity
} from "./japan-tuic-additive-repair-contract.mjs";

const BINDING_PATH_KEYS = Object.freeze([
  "authorizedKeys",
  "backupDirectory",
  "currentMap",
  "materialStore",
  "mihomoConfig",
  "naturalObservation",
  "producerStatus",
  "temporaryRoot"
]);
const REQUIRED_ARCHIVE_ENTRIES = Object.freeze([
  "scripts/mihomo-tuic-usage-map-rebuild.mjs",
  "scripts/traffic-accounting-natural-observation.mjs",
  "server/services/platform/traffic-collector-admin-projection.mjs",
  "server/services/platform/traffic-collector-status-producers.mjs"
]);
const SAFE_ERROR_CODES = new Set([
  "artifact_identity_mismatch",
  "atomic_apply_failed",
  "backup_failed",
  "expected_count_mismatch",
  "host_cleanup_failed",
  "natural_observation_failed",
  "natural_observation_timeout",
  "post_apply_invariant_failed",
  "receipt_validation_failed",
  "restricted_identity_rejected",
  "rollback_verification_failed",
  "stable_snapshot_unavailable",
  "target_identity_mismatch",
  "workflow_identity_mismatch"
]);
const execFileAsync = promisify(execFileCallback);
const MAX_HELPER_OUTPUT_BYTES = 64 * 1024;
const MAX_PROTECTED_OBSERVATION_BYTES = 4 * 1024 * 1024;

function safeError(code) {
  return new JapanTuicRepairContractError(code);
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactKeys(value, expected) {
  const keys = Object.keys(record(value)).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function safeAbsolutePath(value) {
  return typeof value === "string"
    && value.length > 1
    && value.length <= 4096
    && !value.includes("\0")
    && !value.includes("\\")
    && posix.isAbsolute(value)
    && posix.normalize(value) === value;
}

export function validateRunnerBinding(input = {}) {
  const value = record(input);
  if (!exactKeys(value, ["authorizationMarker", "gateId", "paths", "schemaVersion", "units"])
    || value.schemaVersion !== "1"
    || value.gateId !== JAPAN_TUIC_REPAIR_GATE.executionGateId) {
    throw safeError("target_identity_mismatch");
  }
  const paths = record(value.paths);
  if (!exactKeys(paths, [...BINDING_PATH_KEYS].sort())) throw safeError("target_identity_mismatch");
  const pathValues = BINDING_PATH_KEYS.map((key) => paths[key]);
  if (pathValues.some((path) => !safeAbsolutePath(path))
    || new Set(pathValues).size !== pathValues.length) {
    throw safeError("target_identity_mismatch");
  }
  const units = record(value.units);
  if (!exactKeys(units, ["service", "timer"])
    || units.timer !== "gccgw-traffic-usage-collect.timer"
    || units.service !== "gccgw-traffic-usage-collect.service"
    || typeof value.authorizationMarker !== "string"
    || !/^[A-Za-z0-9._:-]{16,160}$/.test(value.authorizationMarker)) {
    throw safeError("target_identity_mismatch");
  }
  return {
    schemaVersion: "1",
    gateId: JAPAN_TUIC_REPAIR_GATE.executionGateId,
    paths: Object.fromEntries(BINDING_PATH_KEYS.map((key) => [key, paths[key]])),
    units: { timer: units.timer, service: units.service },
    authorizationMarker: value.authorizationMarker
  };
}

export function validateArchiveEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100000) {
    throw safeError("artifact_identity_mismatch");
  }
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry !== "string"
      || entry.length === 0
      || entry.length > 4096
      || entry.includes("\0")
      || entry.includes("\\")
      || entry.startsWith("/")
      || /^[A-Za-z]:/.test(entry)
      || posix.normalize(entry) !== entry
      || entry === ".."
      || entry.startsWith("../")
      || seen.has(entry)) {
      throw safeError("artifact_identity_mismatch");
    }
    seen.add(entry);
  }
  if (REQUIRED_ARCHIVE_ENTRIES.some((entry) => !seen.has(entry))) {
    throw safeError("artifact_identity_mismatch");
  }
  return { safe: true, entryCount: entries.length };
}

export function deriveWaitBudget({ intervalSeconds } = {}) {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return Math.min(720000, (intervalSeconds * 2 + 60) * 1000);
}

function validateFrozenIdentity(input, expected, code) {
  const value = record(input);
  const output = {};
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (value[key] !== expectedValue) throw safeError(code);
    output[key] = expectedValue;
  }
  return output;
}

function validateBeforeIdentity(input) {
  return validateFrozenIdentity(input, JAPAN_TUIC_REPAIR_GATE.before, "expected_count_mismatch");
}

function validateAppliedReport(input) {
  const value = record(input);
  if (value.applied !== true || value.finalMode !== "600") throw safeError("post_apply_invariant_failed");
  return validateCandidateReport(value);
}

function validatePostApplyCandidate(input) {
  const value = record(input);
  const candidate = record(value.candidate);
  const expected = {
    addCount: 0,
    removeCount: 0,
    deferredRemoveCount: 27,
    deferredChangedCount: 0,
    missingMaterialCount: 0,
    projectedMapCount: 82,
    ready: true
  };
  if (value.ok !== true || value.candidateReady !== true) throw safeError("post_apply_invariant_failed");
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (candidate[key] !== expectedValue) throw safeError("post_apply_invariant_failed");
  }
  return { ok: true, candidateReady: true, candidate: expected };
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(record(value)).sort());
}

function assertStableAggregate(first, second, beforeOne, beforeTwo) {
  if (stableJson(first) !== stableJson(second) || stableJson(beforeOne) !== stableJson(beforeTwo)) {
    throw safeError("stable_snapshot_unavailable");
  }
}

function validateMetadata(value, code) {
  const metadata = record(value);
  if (!Number.isInteger(metadata.mode)
    || metadata.mode !== 0o600
    || !Number.isInteger(metadata.uid)
    || metadata.uid < 0
    || !Number.isInteger(metadata.gid)
    || metadata.gid < 0) {
    throw safeError(code);
  }
  return { mode: metadata.mode, uid: metadata.uid, gid: metadata.gid };
}

function assertMetadataPreserved(before, after) {
  const left = validateMetadata(before, "post_apply_invariant_failed");
  const right = validateMetadata(after, "post_apply_invariant_failed");
  if (left.mode !== right.mode || left.uid !== right.uid || left.gid !== right.gid) {
    throw safeError("post_apply_invariant_failed");
  }
}

function validateTimerState(value, code) {
  const timer = record(value);
  if (timer.active !== true
    || timer.enabled !== true
    || !Number.isInteger(timer.timerRestarts)
    || timer.timerRestarts < 0
    || !Number.isInteger(timer.serviceRestarts)
    || timer.serviceRestarts < 0) {
    throw safeError(code);
  }
  deriveWaitBudget(timer);
  return {
    active: true,
    enabled: true,
    timerRestarts: timer.timerRestarts,
    serviceRestarts: timer.serviceRestarts,
    intervalSeconds: timer.intervalSeconds
  };
}

function validateObservationBaseline(value) {
  const baseline = record(value);
  if (!Number.isInteger(baseline.collectorCount)
    || baseline.collectorCount < 0
    || !Number.isInteger(baseline.unresolvedTotal)
    || baseline.unresolvedTotal < 0) {
    throw safeError("stable_snapshot_unavailable");
  }
  return {
    collectorCount: baseline.collectorCount,
    unresolvedTotal: baseline.unresolvedTotal
  };
}

async function waitForNaturalObservation({
  operations,
  extracted,
  binding,
  applyBoundary,
  observationBefore,
  timerBefore
}) {
  const waitBudget = deriveWaitBudget(timerBefore);
  const pollMilliseconds = Math.min(
    5000,
    Math.max(1000, Math.floor(timerBefore.intervalSeconds * 250))
  );
  const maxAttempts = Math.max(1, Math.ceil(waitBudget / pollMilliseconds));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const currentObservation = record(await operations.readNaturalObservation({
      root: extracted.root,
      binding,
      phase: "current"
    }));
    const captured = typeof currentObservation.capturedAt === "string"
      ? Date.parse(currentObservation.capturedAt)
      : Number.NaN;
    if (!Number.isFinite(captured)) throw safeError("natural_observation_failed");
    if (captured > Date.parse(applyBoundary)) {
      const timerCurrent = validateTimerState(
        await operations.readTimerState(binding),
        "natural_observation_failed"
      );
      return validateNaturalObservation({
        applyBoundary,
        baseline: {
          ...observationBefore,
          timerRestarts: timerBefore.timerRestarts,
          serviceRestarts: timerBefore.serviceRestarts
        },
        current: {
          ...currentObservation,
          timerActive: timerCurrent.active,
          timerEnabled: timerCurrent.enabled,
          timerRestarts: timerCurrent.timerRestarts,
          serviceRestarts: timerCurrent.serviceRestarts
        }
      });
    }
    if (attempt + 1 < maxAttempts) await operations.sleep(pollMilliseconds);
  }
  throw safeError("natural_observation_timeout");
}

function safeCode(error, fallback) {
  return error instanceof JapanTuicRepairContractError && SAFE_ERROR_CODES.has(error.code)
    ? error.code
    : fallback;
}

function baseReceipt({ productionResult, error, rollbackVerified = false }) {
  const receipt = {
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult,
    hostCredentialCleanup: "failed",
    closeout: "incomplete"
  };
  if (error) receipt.error = error;
  if (rollbackVerified) receipt.rollbackVerified = true;
  return receipt;
}

async function verifyRollback({ operations, binding, extracted, metadataBefore }) {
  validateCandidateReport(await operations.runMapHelper({ root: extracted.root, binding, apply: false }));
  validateBeforeIdentity(await operations.readIdentityGate({ root: extracted.root, binding, phase: "rollback" }));
  assertMetadataPreserved(metadataBefore, await operations.readFileMetadata(binding.paths.currentMap));
}

async function cleanupHost({ operations, binding }) {
  let temporaryRemoved = false;
  let authorizationRevoked = false;
  try {
    temporaryRemoved = await operations.removeTemporaryMaterial(binding) === true;
  } catch {
    temporaryRemoved = false;
  }
  try {
    authorizationRevoked = await operations.revokeOwnAuthorization(binding) === true;
  } catch {
    authorizationRevoked = false;
  }
  return temporaryRemoved && authorizationRevoked;
}

export async function executeJapanTuicAdditiveRepair({
  binding: rawBinding,
  artifactStream,
  operations,
  now = () => new Date()
} = {}) {
  const binding = validateRunnerBinding(rawBinding);
  if (!operations || typeof operations !== "object") throw safeError("restricted_identity_rejected");
  let receipt;
  let extracted = null;
  let backup = null;
  let metadataBefore = null;
  let applyAttempted = false;

  try {
    const received = await operations.receiveArtifact(artifactStream);
    validateArtifactIdentity({
      runId: JAPAN_TUIC_REPAIR_GATE.artifact.runId,
      fileName: JAPAN_TUIC_REPAIR_GATE.artifact.fileName,
      sizeBytes: received.sizeBytes,
      sha256: received.sha256,
      sourceCommit: JAPAN_TUIC_REPAIR_GATE.artifact.sourceCommit
    });
    validateArchiveEntries(await operations.listArchiveEntries(received.path));
    extracted = await operations.extractArtifact(received.path);

    const firstCandidate = validateCandidateReport(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const beforeOne = validateBeforeIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" })
    );
    const secondCandidate = validateCandidateReport(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const beforeTwo = validateBeforeIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "before" })
    );
    assertStableAggregate(firstCandidate, secondCandidate, beforeOne, beforeTwo);

    metadataBefore = validateMetadata(
      await operations.readFileMetadata(binding.paths.currentMap),
      "stable_snapshot_unavailable"
    );
    const timerBefore = validateTimerState(
      await operations.readTimerState(binding),
      "stable_snapshot_unavailable"
    );
    const observationBefore = validateObservationBaseline(
      await operations.readNaturalObservation({ root: extracted.root, binding, phase: "baseline" })
    );
    backup = await operations.createBackup(binding);
    if (!backup || typeof backup !== "object" || typeof backup.ref !== "string" || backup.ref.length === 0) {
      throw safeError("backup_failed");
    }

    const applyBoundary = now().toISOString();
    applyAttempted = true;
    validateAppliedReport(await operations.runMapHelper({ root: extracted.root, binding, apply: true }));
    validatePostApplyCandidate(
      await operations.runMapHelper({ root: extracted.root, binding, apply: false })
    );
    const afterIdentity = validatePostApplyIdentity(
      await operations.readIdentityGate({ root: extracted.root, binding, phase: "after" })
    );
    assertMetadataPreserved(
      metadataBefore,
      await operations.readFileMetadata(binding.paths.currentMap)
    );
    validateTimerState(
      await operations.readTimerState(binding),
      "natural_observation_failed"
    );
    const observation = await waitForNaturalObservation({
      operations,
      extracted,
      binding,
      applyBoundary,
      observationBefore,
      timerBefore
    });
    receipt = {
      ...baseReceipt({ productionResult: "applied_validated" }),
      candidate: { ...JAPAN_TUIC_REPAIR_GATE.candidate },
      identityAfter: afterIdentity,
      naturalObservation: observation
    };
  } catch (error) {
    if (applyAttempted && backup && extracted && metadataBefore) {
      try {
        await operations.restoreBackup(binding, backup);
        await verifyRollback({ operations, binding, extracted, metadataBefore });
        receipt = baseReceipt({
          productionResult: "rolled_back_validated",
          error: safeCode(error, "post_apply_invariant_failed"),
          rollbackVerified: true
        });
      } catch {
        receipt = baseReceipt({
          productionResult: "indeterminate",
          error: "rollback_verification_failed"
        });
      }
    } else {
      receipt = baseReceipt({
        productionResult: "stopped_pre_apply",
        error: safeCode(error, "stable_snapshot_unavailable")
      });
    }
  }

  const hostCleanupVerified = await cleanupHost({ operations, binding });
  receipt.hostCredentialCleanup = hostCleanupVerified ? "verified" : "failed";
  receipt.closeout = hostCleanupVerified ? "github_cleanup_pending" : "incomplete";
  return validateExecutionReceipt(receipt);
}

function fileSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function applyMetadata(path, metadata, platform = process.platform) {
  if (platform === "linux") chownSync(path, metadata.uid, metadata.gid);
  chmodSync(path, metadata.mode);
}

function parseKeyValueOutput(output) {
  const values = {};
  for (const line of String(output || "").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function parseNonNegativeInteger(value, code) {
  if (!/^\d+$/.test(String(value ?? ""))) throw safeError(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw safeError(code);
  return parsed;
}

function parseJsonOutput(output, code) {
  const text = String(output || "");
  if (Buffer.byteLength(text) === 0 || Buffer.byteLength(text) > MAX_HELPER_OUTPUT_BYTES) {
    throw safeError(code);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw safeError(code);
  }
}

function validateZipTypeListing(output) {
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([bcdlps-])[rwxStTs-]{9}\s/);
    if (match && !new Set(["-", "d"]).has(match[1])) {
      throw safeError("artifact_identity_mismatch");
    }
  }
}

function exactArchiveEntries(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readBoundedJson(path, maxBytes, code) {
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) throw safeError(code);
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    throw safeError(code);
  }
}

function naturalObservationSummary(input, report) {
  const projectionInput = record(record(input).projection);
  const collectors = Array.isArray(projectionInput.collectors) ? projectionInput.collectors : [];
  const japanTuic = collectors.find((collector) => {
    const value = record(collector);
    return value.channelRef === "channel-vultr-a-tuic"
      || value.collectorRef === "channel-vultr-a-tuic";
  });
  if (!japanTuic) throw safeError("natural_observation_failed");
  const projection = record(record(report).projection);
  return {
    capturedAt: report.capturedAt,
    collectorInvocationObserved: report.collectorInvocationObserved,
    collectorCount: projection.collectorCount,
    unresolvedTotal: projection.unresolvedTotal,
    japanTuicUnresolved: record(japanTuic).unresolvedCount,
    omittedCollectorCount: projection.omittedCollectors,
    omittedProducerCount: projection.omittedProducers,
    provenanceConserved: projection.provenanceConserved,
    validatorPassed: report.passed === true
  };
}

export function createHostOperations({
  binding,
  expectedArtifact = JAPAN_TUIC_REPAIR_GATE.artifact,
  execFileFn = execFileAsync,
  makeTemporaryDirectoryFn,
  naturalObservationBuilder,
  platform = process.platform
} = {}) {
  let temporaryDirectory = null;
  let lastMapReport = null;
  const backups = new Map();

  async function runFile(file, args, code, options = {}) {
    try {
      const result = await execFileFn(file, args, {
        encoding: "utf8",
        maxBuffer: MAX_PROTECTED_OBSERVATION_BYTES,
        shell: false,
        windowsHide: true,
        ...options
      });
      return { stdout: String(result?.stdout || ""), stderr: String(result?.stderr || "") };
    } catch {
      throw safeError(code);
    }
  }

  function ensureArtifactDirectory() {
    if (!temporaryDirectory) {
      const rootStats = statSync(binding.paths.temporaryRoot);
      if (!rootStats.isDirectory()) throw safeError("artifact_identity_mismatch");
      temporaryDirectory = mkdtempSync(join(binding.paths.temporaryRoot, "github-japan-tuic-"));
      chmodSync(temporaryDirectory, 0o700);
    }
    return temporaryDirectory;
  }

  return {
    async receiveArtifact(stream) {
      const directory = ensureArtifactDirectory();
      const artifactPath = join(directory, "artifact.zip");
      const handle = openSync(artifactPath, "wx", 0o600);
      const hash = createHash("sha256");
      let sizeBytes = 0;
      try {
        for await (const chunk of stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          sizeBytes += bytes.length;
          if (sizeBytes > expectedArtifact.sizeBytes) throw safeError("artifact_identity_mismatch");
          hash.update(bytes);
          writeSync(handle, bytes);
        }
      } finally {
        closeSync(handle);
      }
      chmodSync(artifactPath, 0o600);
      const sha256 = hash.digest("hex");
      if (sizeBytes !== expectedArtifact.sizeBytes || sha256 !== expectedArtifact.sha256) {
        throw safeError("artifact_identity_mismatch");
      }
      return { path: artifactPath, sizeBytes, sha256 };
    },

    async listArchiveEntries(artifactPath) {
      const names = await runFile(
        "/usr/bin/unzip",
        ["-Z1", artifactPath],
        "artifact_identity_mismatch"
      );
      const types = await runFile(
        "/usr/bin/unzip",
        ["-ZTs", artifactPath],
        "artifact_identity_mismatch"
      );
      validateZipTypeListing(types.stdout);
      return exactArchiveEntries(names.stdout);
    },

    async extractArtifact(artifactPath) {
      const root = makeTemporaryDirectoryFn
        ? makeTemporaryDirectoryFn()
        : join(ensureArtifactDirectory(), "source");
      if (!makeTemporaryDirectoryFn) mkdirSync(root, { recursive: false, mode: 0o700 });
      await runFile(
        "/usr/bin/unzip",
        ["-qq", artifactPath, "-d", root],
        "artifact_identity_mismatch"
      );
      return { root };
    },

    async runMapHelper({ root, binding: activeBinding, apply }) {
      const helperPath = join(root, "scripts", "mihomo-tuic-usage-map-rebuild.mjs");
      const args = [
        helperPath,
        "--current-map", activeBinding.paths.currentMap,
        "--mihomo-config", activeBinding.paths.mihomoConfig,
        "--material-store", activeBinding.paths.materialStore,
        "--strategy", "additive_missing_only",
        "--expected-add", "3",
        "--expected-remove", "0",
        "--expected-deferred-remove", "27",
        "--expected-changed", "0",
        "--expected-missing-material", "0",
        "--expected-projected-map-count", "82"
      ];
      if (apply) args.push("--apply");
      const result = await runFile(
        "/usr/bin/node",
        args,
        apply ? "atomic_apply_failed" : "stable_snapshot_unavailable",
        { maxBuffer: MAX_HELPER_OUTPUT_BYTES }
      );
      lastMapReport = parseJsonOutput(
        result.stdout,
        apply ? "atomic_apply_failed" : "stable_snapshot_unavailable"
      );
      return lastMapReport;
    },

    async readIdentityGate({ phase } = {}) {
      const report = record(lastMapReport);
      const candidate = record(report.candidate);
      const runtimeCount = report.rebuiltMapCount;
      const missing = candidate.addCount;
      if (!Number.isInteger(runtimeCount) || !Number.isInteger(missing)) {
        throw safeError("stable_snapshot_unavailable");
      }
      const identity = {
        runtimeCount,
        mappedCount: runtimeCount - missing,
        missing,
        stale: candidate.deferredRemoveCount,
        changed: candidate.deferredChangedCount,
        missingMaterial: candidate.missingMaterialCount
      };
      if (phase === "after") {
        identity.retentionState = "pending";
        identity.state = "degraded";
      }
      return identity;
    },

    async readFileMetadata(path) {
      try {
        const stats = statSync(path);
        if (!stats.isFile()) throw safeError("stable_snapshot_unavailable");
        return { mode: stats.mode & 0o777, uid: stats.uid, gid: stats.gid };
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("stable_snapshot_unavailable");
      }
    },

    async createBackup(activeBinding) {
      try {
        const directoryStats = statSync(activeBinding.paths.backupDirectory);
        if (!directoryStats.isDirectory()) throw safeError("backup_failed");
        const sourceStats = statSync(activeBinding.paths.currentMap);
        if (!sourceStats.isFile()) throw safeError("backup_failed");
        const id = randomUUID();
        const path = join(activeBinding.paths.backupDirectory, `.japan-tuic-${id}.bak`);
        copyFileSync(activeBinding.paths.currentMap, path, constants.COPYFILE_EXCL);
        applyMetadata(path, {
          mode: sourceStats.mode & 0o777,
          uid: sourceStats.uid,
          gid: sourceStats.gid
        }, platform);
        if (fileSha256(path) !== fileSha256(activeBinding.paths.currentMap)) {
          throw safeError("backup_failed");
        }
        const ref = `backup-${id}`;
        backups.set(ref, {
          path,
          sha256: fileSha256(path),
          metadata: {
            mode: sourceStats.mode & 0o777,
            uid: sourceStats.uid,
            gid: sourceStats.gid
          }
        });
        return { ref };
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("backup_failed");
      }
    },

    async restoreBackup(activeBinding, backup) {
      const stored = backups.get(record(backup).ref);
      if (!stored) throw safeError("rollback_verification_failed");
      const temporaryPath = join(
        dirname(activeBinding.paths.currentMap),
        `.japan-tuic-restore-${randomUUID()}.tmp`
      );
      try {
        copyFileSync(stored.path, temporaryPath, constants.COPYFILE_EXCL);
        applyMetadata(temporaryPath, stored.metadata, platform);
        if (fileSha256(temporaryPath) !== stored.sha256) {
          throw safeError("rollback_verification_failed");
        }
        renameSync(temporaryPath, activeBinding.paths.currentMap);
      } catch (error) {
        if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("rollback_verification_failed");
      }
    },

    async readTimerState(activeBinding) {
      const timerResult = await runFile(
        "/usr/bin/systemctl",
        [
          "show",
          activeBinding.units.timer,
          "--property=ActiveState",
          "--property=UnitFileState",
          "--property=NRestarts",
          "--property=LastTriggerUSec",
          "--property=NextElapseUSecRealtime",
          "--no-pager"
        ],
        "stable_snapshot_unavailable"
      );
      const serviceResult = await runFile(
        "/usr/bin/systemctl",
        [
          "show",
          activeBinding.units.service,
          "--property=NRestarts",
          "--no-pager"
        ],
        "stable_snapshot_unavailable"
      );
      const timer = parseKeyValueOutput(timerResult.stdout);
      const service = parseKeyValueOutput(serviceResult.stdout);
      const lastTrigger = Date.parse(timer.LastTriggerUSec);
      const nextTrigger = Date.parse(timer.NextElapseUSecRealtime);
      const intervalSeconds = (nextTrigger - lastTrigger) / 1000;
      if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
        throw safeError("stable_snapshot_unavailable");
      }
      return {
        active: timer.ActiveState === "active",
        enabled: timer.UnitFileState === "enabled",
        timerRestarts: parseNonNegativeInteger(timer.NRestarts, "stable_snapshot_unavailable"),
        serviceRestarts: parseNonNegativeInteger(service.NRestarts, "stable_snapshot_unavailable"),
        intervalSeconds
      };
    },

    async readNaturalObservation({ root, binding: activeBinding }) {
      const input = readBoundedJson(
        activeBinding.paths.naturalObservation,
        MAX_PROTECTED_OBSERVATION_BYTES,
        "natural_observation_failed"
      );
      let builder = naturalObservationBuilder;
      if (!builder) {
        try {
          const module = await import(pathToFileURL(join(
            root,
            "scripts",
            "traffic-accounting-natural-observation.mjs"
          )).href);
          builder = module.buildTrafficAccountingNaturalObservation;
        } catch {
          throw safeError("natural_observation_failed");
        }
      }
      try {
        return naturalObservationSummary(input, builder(input));
      } catch (error) {
        if (error instanceof JapanTuicRepairContractError) throw error;
        throw safeError("natural_observation_failed");
      }
    },

    async sleep(milliseconds) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
    },

    async removeTemporaryMaterial() {
      if (!temporaryDirectory) return true;
      try {
        rmSync(temporaryDirectory, { recursive: true, force: true });
        return !existsSync(temporaryDirectory);
      } catch {
        return false;
      }
    },

    async revokeOwnAuthorization(activeBinding) {
      const path = activeBinding.paths.authorizedKeys;
      const marker = activeBinding.authorizationMarker;
      try {
        const stats = statSync(path);
        if (!stats.isFile() || stats.size <= 0 || stats.size > 1024 * 1024) return false;
        const original = readFileSync(path, "utf8");
        const lines = original.split(/\r?\n/);
        const matches = lines.filter((line) => {
          const fields = line.trim().split(/\s+/).filter(Boolean);
          return fields.at(-1) === marker;
        });
        if (matches.length !== 1) return false;
        const next = lines.filter((line) => line !== matches[0]).join("\n");
        const temporaryPath = join(dirname(path), `.authorized-keys-${randomUUID()}.tmp`);
        writeFileSync(temporaryPath, next, { encoding: "utf8", flag: "wx", mode: stats.mode & 0o777 });
        applyMetadata(temporaryPath, {
          mode: stats.mode & 0o777,
          uid: stats.uid,
          gid: stats.gid
        }, platform);
        renameSync(temporaryPath, path);
        const readback = readFileSync(path, "utf8");
        return !readback.split(/\r?\n/).some((line) => {
          const fields = line.trim().split(/\s+/).filter(Boolean);
          return fields.at(-1) === marker;
        });
      } catch {
        return false;
      }
    }
  };
}

function loadRootOwnedBinding(path, platform = process.platform) {
  if (!safeAbsolutePath(path)) throw safeError("restricted_identity_rejected");
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size <= 0 || stats.size > 64 * 1024) {
      throw safeError("restricted_identity_rejected");
    }
    if (platform === "linux" && (stats.uid !== 0 || (stats.mode & 0o777) !== 0o600)) {
      throw safeError("restricted_identity_rejected");
    }
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof JapanTuicRepairContractError) throw error;
    throw safeError("restricted_identity_rejected");
  }
}

function safeCliFailure() {
  return {
    schemaVersion: "1",
    type: "japan_tuic_additive_repair_execution",
    productionResult: "indeterminate",
    hostCredentialCleanup: "failed",
    closeout: "incomplete",
    error: "restricted_identity_rejected"
  };
}

export async function runJapanTuicAdditiveRepairCli({
  argv = process.argv.slice(2),
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env,
  platform = process.platform,
  loadBindingFn = loadRootOwnedBinding,
  operationsFactory = createHostOperations,
  executeFn = executeJapanTuicAdditiveRepair
} = {}) {
  void env;
  try {
    if (argv.length !== 2 || argv[0] !== "--binding" || !safeAbsolutePath(argv[1])) {
      throw safeError("restricted_identity_rejected");
    }
    const binding = validateRunnerBinding(loadBindingFn(argv[1], platform));
    const receipt = await executeFn({
      binding,
      artifactStream: stdin,
      operations: operationsFactory({ binding, platform })
    });
    stdout.write(`${JSON.stringify(receipt)}\n`);
    if (receipt.productionResult === "applied_validated"
      && receipt.hostCredentialCleanup === "verified") return 0;
    if (new Set(["rolled_back_validated", "stopped_pre_apply"]).has(receipt.productionResult)) return 2;
    return 1;
  } catch {
    stderr.write(`${JSON.stringify(safeCliFailure())}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = await runJapanTuicAdditiveRepairCli();
}
