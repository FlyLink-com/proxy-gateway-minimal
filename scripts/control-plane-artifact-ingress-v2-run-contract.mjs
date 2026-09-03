#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SOURCE_COMMIT = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const RUN_ID = /^[1-9][0-9]{0,15}$/;
const MAX_RUN_JSON_BYTES = 1024 * 1024;
const ARGUMENT_NAMES = Object.freeze([
  "source-commit",
  "repository",
  "release-run-id",
  "release-run-json",
  "dependency-run-id",
  "dependency-run-json"
]);
const PRODUCERS = Object.freeze({
  release: Object.freeze({
    name: "Release Artifact",
    path: ".github/workflows/release-artifact.yml"
  }),
  dependency: Object.freeze({
    name: "Control Plane Dependency Artifact",
    path: ".github/workflows/control-plane-dependency-artifact.yml"
  })
});

export class ArtifactIngressV2RunError extends Error {
  constructor(code) {
    super(code);
    this.name = "ArtifactIngressV2RunError";
    this.code = code;
  }
}

function fail(code) {
  throw new ArtifactIngressV2RunError(code);
}

function parseRunId(value) {
  if (typeof value !== "string" || !RUN_ID.test(value)) {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail("artifact_ingress_v2_producer_run_invalid");
  return parsed;
}

function validateRun(value, { id, name, path, sourceCommit, repository }) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.id !== id
    || value.name !== name
    || value.path !== path
    || value.event !== "push"
    || value.head_branch !== "master"
    || value.head_sha !== sourceCommit
    || value.status !== "completed"
    || value.conclusion !== "success"
    || value.repository?.full_name !== repository) {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
}

export function validateArtifactIngressV2ProducerRuns({
  sourceCommit,
  repository,
  releaseRunId,
  dependencyRunId,
  releaseRun,
  dependencyRun
} = {}) {
  if (typeof sourceCommit !== "string" || !SOURCE_COMMIT.test(sourceCommit)
    || typeof repository !== "string" || !REPOSITORY.test(repository)) {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
  const releaseId = parseRunId(releaseRunId);
  const dependencyId = parseRunId(dependencyRunId);
  validateRun(releaseRun, {
    id: releaseId,
    ...PRODUCERS.release,
    sourceCommit,
    repository
  });
  validateRun(dependencyRun, {
    id: dependencyId,
    ...PRODUCERS.dependency,
    sourceCommit,
    repository
  });
  return Object.freeze({
    sourceCommit,
    repository,
    releaseRunId: releaseId,
    dependencyRunId: dependencyId
  });
}

async function readRun(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 4096) {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
    || metadata.size <= 0 || metadata.size > MAX_RUN_JSON_BYTES) {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    fail("artifact_ingress_v2_producer_run_invalid");
  }
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== ARGUMENT_NAMES.length * 2) {
    fail("artifact_ingress_v2_run_arguments_invalid");
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || typeof value !== "string" || value.length === 0) {
      fail("artifact_ingress_v2_run_arguments_invalid");
    }
    const name = flag.slice(2);
    if (!ARGUMENT_NAMES.includes(name) || values.has(name)) {
      fail("artifact_ingress_v2_run_arguments_invalid");
    }
    values.set(name, value);
  }
  return Object.fromEntries(values);
}

export async function runArtifactIngressV2RunContractCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const options = parseArguments(argv);
    const [releaseRun, dependencyRun] = await Promise.all([
      readRun(options["release-run-json"]),
      readRun(options["dependency-run-json"])
    ]);
    validateArtifactIngressV2ProducerRuns({
      sourceCommit: options["source-commit"],
      repository: options.repository,
      releaseRunId: options["release-run-id"],
      dependencyRunId: options["dependency-run-id"],
      releaseRun,
      dependencyRun
    });
    stdout.write("artifact_ingress_v2_producer_runs_verified\n");
    return 0;
  } catch (error) {
    const code = error instanceof ArtifactIngressV2RunError
      ? error.code
      : "artifact_ingress_v2_producer_run_failed";
    stderr.write(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exitCode = await runArtifactIngressV2RunContractCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
