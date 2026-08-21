#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  CandidateDependencyGateError,
  runCandidateDependencyA3PhysicalValidation
} from "./control-plane-candidate-dependency-gate.mjs";
import { createDiagnosticsObserver } from "./control-plane-materializer-a3-physical-validation-diagnostics.mjs";

const TYPE = "control_plane_materializer_a3_physical_validation";
const SCHEMA_VERSION = "1";

function isBooleanFlag(value) {
  return value === "1" || value === "true" || value === "yes";
}

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

function readDiagnosticsConfig(env = process.env) {
  // Step 1: strict boolean parse. If A3_PHYSICAL_DIAGNOSTICS is set to
  // anything other than a true/false literal, refuse — do NOT silently
  // fall through to "not enabled". This closes iteration 6 P1 #1.
  let diagnosticsEnabled;
  try {
    diagnosticsEnabled = parseStrictBoolean("A3_PHYSICAL_DIAGNOSTICS", env.A3_PHYSICAL_DIAGNOSTICS);
  } catch (err) {
    throw err;
  }
  if (!diagnosticsEnabled) return null;

  // Step 2: FILE is REQUIRED when diagnostics is enabled. Missing or
  // empty FILE now refuses instead of silently falling through to the
  // un-diagnosed collector.
  const filePath = env.A3_PHYSICAL_DIAGNOSTICS_FILE;
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("diagnostics_missing_file");
  }
  const maxBytes = Number(env.A3_PHYSICAL_DIAGNOSTICS_MAX_BYTES);
  const preview = Number(env.A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES);

  // Step 3: SINK_ROOT is REQUIRED when diagnostics is enabled. We
  // can no longer infer it from FILE because that lets an attacker
  // who controls FILE redirect the publish into an arbitrary tree.
  // SINK_ROOT MUST be absolute (POSIX `/...` or Windows
  // `<drive>:\...` / `<drive>:/...`).
  const sinkRootRaw = env.A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT;
  if (typeof sinkRootRaw !== "string" || sinkRootRaw.length === 0) {
    throw new Error("diagnostics_missing_sink_root");
  }
  if (!/^[a-zA-Z]:[\\/]|^[\\/]/.test(sinkRootRaw)) {
    throw new Error("diagnostics_invalid_sink_root");
  }

  const config = {
    filePath,
    sinkRoot: sinkRootRaw,
    maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : 65536
  };
  if (Number.isInteger(preview) && preview > 0) config.previewBytes = preview;

  // Step 4: UID is optional but must be valid when supplied.
  const uidRaw = env.A3_PHYSICAL_DIAGNOSTICS_UID;
  if (uidRaw !== undefined) {
    const uid = Number(uidRaw);
    if (!Number.isInteger(uid) || uid < 0) throw new Error("diagnostics_invalid_uid");
    config.uid = uid;
  }

  // Step 5: ENFORCE_OWNED_ROOT is opt-in strict boolean. When on,
  // uid must be supplied.
  try {
    const enforce = parseStrictBoolean("A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT", env.A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT);
    if (enforce === true) {
      config.enforceOwnedRoot = true;
      if (!Number.isInteger(config.uid)) {
        throw new Error("diagnostics_enforce_owned_root_requires_uid");
      }
    }
  } catch (err) {
    throw err;
  }
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

export function runA3PhysicalValidationCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env
} = {}) {
  let mode = null;
  let diagnostics = null;
  try {
    const request = parseA3PhysicalValidationArgs(argv);
    mode = request.mode;
    // readDiagnosticsConfig may throw when the operator-provided env
    // is unparsable (relative sink root, negative uid, etc.). We
    // surface that as a dedicated diagnostics-config gate line on
    // stderr — distinct from the collector's invalid_input shape — so
    // the operator can tell why the run was rejected before the
    // collector was invoked.
    let diagnosticsConfig = null;
    try {
      diagnosticsConfig = readDiagnosticsConfig(env);
    } catch (configErr) {
      stderr.write(`${JSON.stringify({
        schemaVersion: "1",
        type: "control_plane_materializer_a3_physical_validation_diagnostics_gate",
        state: "diagnostics_unpublished",
        condition: configErr.message
      })}\n`);
      return 1;
    }
    if (diagnosticsConfig) {
      diagnostics = createDiagnosticsObserver(diagnosticsConfig);
    }
    const overrides = diagnostics ? { observePhysicalCommand: diagnostics.record } : {};
    const result = runCandidateDependencyA3PhysicalValidation({ ...request, overrides });
    stdout.write(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: TYPE, state: "verified", ...result })}\n`);
    return 0;
  } catch (error) {
    const condition = error instanceof CandidateDependencyGateError ? error.condition : "invalid_input";
    stderr.write(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: TYPE, mode, state: error?.attentionRequired === true ? "attention_required" : "blocked", condition })}\n`);
    return 1;
  } finally {
    if (diagnostics) {
      // flush() returns a structured status. We surface a separate
      // diagnostic gate line on stderr ONLY when the diagnostics
      // publish itself failed; the collector's primary exit code and
      // schema are preserved verbatim. The diagnostics line uses a
      // dedicated type so it cannot be confused with the collector
      // result.
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
        }
      } catch {
        // diagnostics are best-effort; their failure must not flip the exit code
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runA3PhysicalValidationCli();
}