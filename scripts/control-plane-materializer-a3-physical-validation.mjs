#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  CandidateDependencyGateError,
  runCandidateDependencyA3PhysicalValidation
} from "./control-plane-candidate-dependency-gate.mjs";
import {
  createDiagnosticsObserver,
  prepareDiagnosticsSink
} from "./control-plane-materializer-a3-physical-validation-diagnostics.mjs";

const TYPE = "control_plane_materializer_a3_physical_validation";
const SCHEMA_VERSION = "1";

// Strict boolean parsing: when the env var is set, ONLY accept exact
// "1" / "true" / "yes". Anything else (including "0", "false", "no",
// empty string, garbage) is an INVALID configuration. This closes
// iteration 6 reviewer's P1: "non-boolean / unknown boolean values
// were silently treated as 'not enabled'".
function parseStrictBoolean(envName, value) {
  if (value === undefined) return undefined;
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  throw new Error(`diagnostics_invalid_${envName.toLowerCase()}`);
}

// Iteration 7: on Linux, when diagnostics is enabled, UID +
// ENFORCE_OWNED_ROOT are FORCED ON. This closes the iteration 7 P1
// reviewer finding: "privileged Linux path still allowed omitting UID
// and ENFORCE_OWNED_ROOT, leaving only path-based lstat before open".
function readDiagnosticsConfig(env = process.env, { platform = process.platform } = {}) {
  // Step 1: strict boolean parse. If A3_PHYSICAL_DIAGNOSTICS is set to
  // anything other than a true/false literal, refuse — do NOT silently
  // fall through to "not enabled".
  const diagnosticsEnabled = parseStrictBoolean("A3_PHYSICAL_DIAGNOSTICS", env.A3_PHYSICAL_DIAGNOSTICS);
  if (!diagnosticsEnabled) return null;

  // Step 2: FILE is REQUIRED when diagnostics is enabled.
  const filePath = env.A3_PHYSICAL_DIAGNOSTICS_FILE;
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("diagnostics_missing_file");
  }
  const maxBytes = Number(env.A3_PHYSICAL_DIAGNOSTICS_MAX_BYTES);
  const preview = Number(env.A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES);

  // Step 3: SINK_ROOT is REQUIRED when diagnostics is enabled.
  const sinkRootRaw = env.A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT;
  if (typeof sinkRootRaw !== "string" || sinkRootRaw.length === 0) {
    throw new Error("diagnostics_missing_sink_root");
  }
  if (!/^[a-zA-Z]:[\\/]|^[\\/]/.test(sinkRootRaw)) {
    throw new Error("diagnostics_invalid_sink_root");
  }

  // Step 4: resolve ENFORCE_OWNED_ROOT. On Linux, it defaults to true
  // and is required to be true. On other platforms, the operator can
  // opt in (Windows tmpdir modes don't preserve the strict Unix bits
  // the check expects; we don't force it there).
  let enforceOwnedRoot = false;
  try {
    const parsed = parseStrictBoolean(
      "A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT",
      env.A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT
    );
    enforceOwnedRoot = parsed === true;
  } catch (err) {
    throw err;
  }
  if (platform === "linux" && enforceOwnedRoot === false) {
    // Iteration 7: refuse on Linux unless ENFORCE_OWNED_ROOT is
    // explicitly enabled. This closes the reviewer P1 that the
    // privileged Linux path could skip UID + mode checks entirely.
    throw new Error("diagnostics_linux_custody_required");
  }

  // Step 5: UID is required on Linux when diagnostics is enabled,
  // otherwise optional but must be valid when supplied.
  const uidRaw = env.A3_PHYSICAL_DIAGNOSTICS_UID;
  let uid = null;
  if (uidRaw !== undefined) {
    const parsed = Number(uidRaw);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("diagnostics_invalid_uid");
    uid = parsed;
  }
  if (platform === "linux" && uid === null) {
    throw new Error("diagnostics_linux_uid_required");
  }
  if (enforceOwnedRoot && uid === null) {
    throw new Error("diagnostics_enforce_owned_root_requires_uid");
  }

  const config = {
    filePath,
    sinkRoot: sinkRootRaw,
    maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : 65536,
    uid,
    enforceOwnedRoot
  };
  if (Number.isInteger(preview) && preview > 0) config.previewBytes = preview;
  return config;
}

export function parseA3PhysicalValidationArgs(argv = []) {
  if (!Array.isArray(argv) || !argv.every((value) => typeof value === "string")) throw new Error("invalid_input");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) throw new Error("invalid_input");
    values.set(key, value);
  }
  const mode = values.get("--mode"), runLabel = values.get("--run-label"), projectId = Number(values.get("--project-id"));
  const common = ["--mode", "--run-label", "--project-id"];
  const expected = mode === "quota" ? common : mode === "smoke" ? [...common, "--service-uid", "--service-gid"] : [];
  if (expected.length === 0 || values.size !== expected.length || expected.some((key) => !values.has(key))
    || !Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("invalid_input");
  if (mode === "quota") return Object.freeze({ mode, runLabel, projectId });
  const serviceUid = Number(values.get("--service-uid")), serviceGid = Number(values.get("--service-gid"));
  if (!Number.isSafeInteger(serviceUid) || serviceUid <= 0 || !Number.isSafeInteger(serviceGid) || serviceGid <= 0) throw new Error("invalid_input");
  return Object.freeze({ mode, runLabel, projectId, serviceUid, serviceGid });
}

// Core pipeline (iteration 7). The CLI delegates to this; tests can
// also call it directly with a stubbed `runCollector`. Returns a
// structured result so the caller can map diagnostics-unpublished to
// exit code 1 even when the collector itself succeeded.
//
// Steps:
//   1. parseA3PhysicalValidationArgs(argv)
//   2. readDiagnosticsConfig(env)        [may throw -> diagnostics_gate exit 1]
//   3. prepareDiagnosticsSink(config)    [may throw -> diagnostics_gate exit 1, NO collector work]
//   4. runCollector({ ...request, overrides: { observePhysicalCommand } })
//   5. flush()                            [may fail -> result.exitCode forced to 1]
//
// Step 3 is the iteration 7 pre-collector gate: the sink is opened and
// the entire parent chain (including the sink root, fstat'd via an
// O_DIRECTORY|O_NOFOLLOW fd on Linux) is verified BEFORE any
// collector command runs. If step 3 fails, the collector NEVER runs.
//
// Step 5 escalates the exit code: when diagnostics is enabled and the
// flush fails, the CLI must exit 1 — successful collector + failed
// diagnostics = failed run (the iteration 7 reviewer flagged this:
// collector success could mask missing diagnostic evidence).
export function runA3PhysicalValidationCore({
  argv = [],
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env,
  platform = process.platform,
  runCollector = runCandidateDependencyA3PhysicalValidation
} = {}) {
  let mode = null;
  let diagnostics = null;
  let result = { exitCode: 1, diagnosticsPublished: null };
  try {
    const request = parseA3PhysicalValidationArgs(argv);
    mode = request.mode;
    let diagnosticsConfig = null;
    try {
      diagnosticsConfig = readDiagnosticsConfig(env, { platform });
    } catch (configErr) {
      stderr.write(`${JSON.stringify({
        schemaVersion: "1",
        type: "control_plane_materializer_a3_physical_validation_diagnostics_gate",
        state: "diagnostics_unpublished",
        condition: configErr.message
      })}\n`);
      result = { exitCode: 1, diagnosticsPublished: false };
      return result;
    }
    if (diagnosticsConfig) {
      // Step 3: pre-collector sink bind. prepareDiagnosticsSink opens
      // the file with O_EXCL|O_NOFOLLOW and verifies the entire parent
      // chain (ancestors + sink root fstat'd via fd + descendents). If
      // any check fails, the collector NEVER runs.
      let preBoundSink = null;
      try {
        preBoundSink = prepareDiagnosticsSink(diagnosticsConfig);
      } catch (bindErr) {
        stderr.write(`${JSON.stringify({
          schemaVersion: "1",
          type: "control_plane_materializer_a3_physical_validation_diagnostics_gate",
          state: "diagnostics_unpublished",
          condition: bindErr.message
        })}\n`);
        result = { exitCode: 1, diagnosticsPublished: false };
        return result;
      }
      diagnostics = createDiagnosticsObserver({ ...diagnosticsConfig, preBoundSink });
    }
    const overrides = diagnostics ? { observePhysicalCommand: diagnostics.record } : {};
    const collectorResult = runCollector({ ...request, overrides });
    stdout.write(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: TYPE, state: "verified", ...collectorResult })}\n`);
    result = { exitCode: 0, diagnosticsPublished: null };
    return result;
  } catch (error) {
    const condition = error instanceof CandidateDependencyGateError ? error.condition : "invalid_input";
    stderr.write(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: TYPE, mode, state: error?.attentionRequired === true ? "attention_required" : "blocked", condition })}\n`);
    result = { exitCode: 1, diagnosticsPublished: null };
    return result;
  } finally {
    if (diagnostics) {
      try {
        const status = diagnostics.flush();
        if (!status.published) {
          const gateLine = JSON.stringify({
            schemaVersion: "1",
            type: "control_plane_materializer_a3_physical_validation_diagnostics_gate",
            state: "diagnostics_unpublished",
            observerError: status.observerError,
            mainPath: status.mainPath,
            fallbackPath: status.fallbackPath ?? null,
            recordCount: status.recordCount,
            byteCount: status.byteCount
          });
          stderr.write(`${gateLine}\n`);
          // Step 5: diagnostics failure forces exit code 1 even if
          // the collector succeeded. The collector receipt on stdout
          // is preserved verbatim (operator sees both lines).
          if (result.exitCode === 0) {
            result = { exitCode: 1, diagnosticsPublished: false };
          } else {
            result.diagnosticsPublished = false;
          }
        } else {
          result.diagnosticsPublished = true;
        }
      } catch {
        if (result.exitCode === 0) result = { exitCode: 1, diagnosticsPublished: false };
      } finally {
        diagnostics.closePreBoundSink();
      }
    }
  }
}

export function runA3PhysicalValidationCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env,
  platform = process.platform,
  runCollector = runCandidateDependencyA3PhysicalValidation
} = {}) {
  return runA3PhysicalValidationCore({ argv, stdout, stderr, env, platform, runCollector }).exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runA3PhysicalValidationCli();
}