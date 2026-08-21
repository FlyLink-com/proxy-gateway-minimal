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
  const config = { filePath, maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : 65536 };
  const preview = Number(env.A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES);
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
    const diagnosticsConfig = readDiagnosticsConfig(env);
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
      try {
        diagnostics.flush();
      } catch {
        // diagnostics are best-effort; their failure must not flip the exit code
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runA3PhysicalValidationCli();
}