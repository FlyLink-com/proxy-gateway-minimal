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

function readDiagnosticsConfig(env = process.env) {
  if (!isBooleanFlag(env.A3_PHYSICAL_DIAGNOSTICS)) return null;
  const filePath = env.A3_PHYSICAL_DIAGNOSTICS_FILE;
  if (typeof filePath !== "string" || filePath.length === 0) return null;
  const maxBytes = Number(env.A3_PHYSICAL_DIAGNOSTICS_MAX_BYTES);
  const preview = Number(env.A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES);
  // sinkRoot is OPT-IN hardening. When supplied, it MUST be absolute
  // (POSIX `/...` or Windows `<drive>:\...` / `<drive>:/...`); when
  // missing or relative, the observer falls back to using the parent
  // directory of filePath as the chain root. The chain walk still
  // verifies rootAbs + every segment as a directory (no symlinks), so
  // the substitution P1 is closed for both hardened and default
  // invocations — only the group/other-writable + uid match check
  // requires the explicit `enforceOwnedRoot + uid` pair.
  const sinkRootRaw = env.A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT;
  let sinkRoot = null;
  if (typeof sinkRootRaw === "string" && sinkRootRaw.length > 0) {
    if (!/^[a-zA-Z]:[\\/]|^[\\/]/.test(sinkRootRaw)) {
      throw new Error("diagnostics_invalid_sink_root");
    }
    sinkRoot = sinkRootRaw;
  }
  const config = {
    filePath,
    sinkRoot,
    maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : 65536
  };
  if (Number.isInteger(preview) && preview > 0) config.previewBytes = preview;
  const uidRaw = env.A3_PHYSICAL_DIAGNOSTICS_UID;
  if (uidRaw !== undefined) {
    const uid = Number(uidRaw);
    if (!Number.isInteger(uid) || uid < 0) throw new Error("diagnostics_invalid_uid");
    config.uid = uid;
  }
  if (isBooleanFlag(env.A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT)) {
    config.enforceOwnedRoot = true;
    if (!Number.isInteger(config.uid)) {
      throw new Error("diagnostics_enforce_owned_root_requires_uid");
    }
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