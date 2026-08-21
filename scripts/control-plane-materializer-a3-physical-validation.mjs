#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  CandidateDependencyGateError,
  runCandidateDependencyA3PhysicalValidation
} from "./control-plane-candidate-dependency-gate.mjs";

const TYPE = "control_plane_materializer_a3_physical_validation";
const SCHEMA_VERSION = "1";

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

export function runA3PhysicalValidationCli({ argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}) {
  let mode = null;
  try {
    const request = parseA3PhysicalValidationArgs(argv);
    mode = request.mode;
    const result = runCandidateDependencyA3PhysicalValidation(request);
    stdout.write(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: TYPE, state: "verified", ...result })}\n`);
    return 0;
  } catch (error) {
    const condition = error instanceof CandidateDependencyGateError ? error.condition : "invalid_input";
    stderr.write(`${JSON.stringify({ schemaVersion: SCHEMA_VERSION, type: TYPE, mode, state: error?.attentionRequired === true ? "attention_required" : "blocked", condition })}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runA3PhysicalValidationCli();
}
