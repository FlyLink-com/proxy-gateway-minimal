import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  ArtifactIngressV2RunError,
  runArtifactIngressV2RunContractCli,
  validateArtifactIngressV2ProducerRuns
} from "../../scripts/control-plane-artifact-ingress-v2-run-contract.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const REPOSITORY = "gccwebos-com/proxy-gateway-minimal";

function run({ id, name, path, ...overrides }) {
  return {
    id,
    name,
    path,
    event: "push",
    head_branch: "master",
    head_sha: SOURCE_COMMIT,
    status: "completed",
    conclusion: "success",
    repository: { full_name: REPOSITORY },
    ...overrides
  };
}

function input() {
  return {
    sourceCommit: SOURCE_COMMIT,
    repository: REPOSITORY,
    releaseRunId: "33729273185",
    dependencyRunId: "33729273169",
    releaseRun: run({
      id: 33729273185,
      name: "Release Artifact",
      path: ".github/workflows/release-artifact.yml"
    }),
    dependencyRun: run({
      id: 33729273169,
      name: "Control Plane Dependency Artifact",
      path: ".github/workflows/control-plane-dependency-artifact.yml"
    })
  };
}

test("v2 producer-run contract binds both successful protected-master workflows", () => {
  assert.deepEqual(validateArtifactIngressV2ProducerRuns(input()), {
    sourceCommit: SOURCE_COMMIT,
    repository: REPOSITORY,
    releaseRunId: 33729273185,
    dependencyRunId: 33729273169
  });
});

test("v2 producer-run contract rejects every mutable provenance dimension", () => {
  const mutations = [
    (value) => { value.releaseRun.id += 1; },
    (value) => { value.releaseRun.name = "Other"; },
    (value) => { value.releaseRun.path = ".github/workflows/other.yml"; },
    (value) => { value.releaseRun.event = "workflow_dispatch"; },
    (value) => { value.releaseRun.head_branch = "feature"; },
    (value) => { value.releaseRun.head_sha = "b".repeat(40); },
    (value) => { value.releaseRun.status = "in_progress"; },
    (value) => { value.releaseRun.conclusion = "failure"; },
    (value) => { value.releaseRun.repository.full_name = "other/repository"; },
    (value) => { value.dependencyRun.name = "Release Artifact"; },
    (value) => { value.dependencyRun.path = ".github/workflows/release-artifact.yml"; }
  ];
  for (const mutate of mutations) {
    const value = structuredClone(input());
    mutate(value);
    assert.throws(
      () => validateArtifactIngressV2ProducerRuns(value),
      (error) => error instanceof ArtifactIngressV2RunError
        && error.code === "artifact_ingress_v2_producer_run_invalid"
    );
  }
});

test("v2 producer-run contract accepts only safe positive run identifiers", () => {
  const maximum = structuredClone(input());
  maximum.releaseRunId = String(Number.MAX_SAFE_INTEGER);
  maximum.dependencyRunId = String(Number.MAX_SAFE_INTEGER);
  maximum.releaseRun.id = Number.MAX_SAFE_INTEGER;
  maximum.dependencyRun.id = Number.MAX_SAFE_INTEGER;
  assert.equal(validateArtifactIngressV2ProducerRuns(maximum).releaseRunId, Number.MAX_SAFE_INTEGER);

  for (const invalid of [
    "0",
    "01",
    "9007199254740992",
    "10000000000000000",
    "not-a-run"
  ]) {
    const value = structuredClone(input());
    value.releaseRunId = invalid;
    assert.throws(
      () => validateArtifactIngressV2ProducerRuns(value),
      (error) => error instanceof ArtifactIngressV2RunError
        && error.code === "artifact_ingress_v2_producer_run_invalid"
    );
  }
});

test("v2 producer-run CLI reads only its exact bounded argument set", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gccgw-artifact-ingress-v2-runs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const value = input();
  const releasePath = join(root, "release.json");
  const dependencyPath = join(root, "dependency.json");
  writeFileSync(releasePath, JSON.stringify(value.releaseRun));
  writeFileSync(dependencyPath, JSON.stringify(value.dependencyRun));
  const argv = [
    "--source-commit", value.sourceCommit,
    "--repository", value.repository,
    "--release-run-id", value.releaseRunId,
    "--release-run-json", releasePath,
    "--dependency-run-id", value.dependencyRunId,
    "--dependency-run-json", dependencyPath
  ];
  let stdout = "";
  let stderr = "";
  assert.equal(await runArtifactIngressV2RunContractCli({
    argv,
    stdout: { write(output) { stdout += output; } },
    stderr: { write(output) { stderr += output; } }
  }), 0);
  assert.equal(stdout, "artifact_ingress_v2_producer_runs_verified\n");
  assert.equal(stderr, "");

  let invalidError = "";
  assert.equal(await runArtifactIngressV2RunContractCli({
    argv: argv.slice(0, -2),
    stdout: { write() {} },
    stderr: { write(output) { invalidError += output; } }
  }), 1);
  assert.equal(invalidError, "artifact_ingress_v2_run_arguments_invalid\n");
});
