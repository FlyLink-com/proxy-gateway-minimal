import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  serializeLegacyEntitlementNormalizationSnapshot
} from "../services/platform/legacy-entitlement-normalization.mjs";
import {
  runLegacyEntitlementNormalizationCli
} from "../../scripts/platform-legacy-entitlement-normalization.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = join(REPOSITORY_ROOT, "scripts", "platform-legacy-entitlement-normalization.mjs");
const PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const CASE_REF = "a".repeat(64);
const PRIVATE_SENTINEL = "private-account-reference-must-not-appear";

function snapshot() {
  return {
    schemaVersion: "1",
    snapshotType: "aggregate_case_snapshot",
    observedAt: "2026-08-13T00:00:00.000Z",
    sourceCommit: "2492515eadf254bd0d20001e3d03219edec16c57",
    cases: [{
      caseRef: CASE_REF,
      accountState: "active",
      serviceChainState: "unique_current_exact",
      authorityState: "none",
      commerceState: "clear",
      runtimeState: "verified",
      identityState: "unique"
    }]
  };
}

function withTempDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "legacy-normalization-cli-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}

function writeSnapshot(directory) {
  const inputPath = join(directory, "private-snapshot.json");
  writeFileSync(inputPath, serializeLegacyEntitlementNormalizationSnapshot(snapshot()));
  return inputPath;
}

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });
}

function parseOutput(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const output = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(output), [
    "schemaVersion",
    "ok",
    "mode",
    "planState",
    "aggregateOnly",
    "sourceChanged",
    "executionAllowed",
    "policyId",
    "snapshotDigest",
    "planDigest",
    "checks",
    "effects",
    "counts",
    "reasonCounts",
    "reasonCodes"
  ]);
  return output;
}

test("legacy normalization CLI is import-quiet", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `import ${JSON.stringify(pathToFileURL(CLI_PATH).href)}`], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: {},
    timeout: 15_000,
    windowsHide: true
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("package exposes only the source-only normalization CLI entry point", () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));
  assert.equal(
    packageJson.scripts["platform:legacy-entitlement-normalization"],
    "node scripts/platform-legacy-entitlement-normalization.mjs"
  );
});

test("plan and dry-run emit one aggregate-only line without private input references", () => {
  withTempDirectory((directory) => {
    const inputPath = writeSnapshot(directory);
    const inputBefore = readFileSync(inputPath);
    for (const mode of ["inventory", "plan", "dry-run"]) {
      const result = runCli(["--mode", mode, "--input-path", inputPath]);
      assert.equal(result.status, 0);
      const output = parseOutput(result);
      assert.equal(output.ok, true);
      assert.equal(output.mode, mode);
      assert.equal(output.aggregateOnly, true);
      assert.equal(output.sourceChanged, false);
      assert.equal(output.executionAllowed, false);
      assert.equal(output.counts.totalCases, 1);
      assert.equal(output.counts.requiresExplicitAuthorityAssignment, 1);
      assert.equal(output.checks.noAutomaticSelection, true);
      assert.equal(output.checks.noResourceBootstrap, true);
      assert.equal(output.checks.noDataMutation, true);
      assert.equal(output.checks.noCoinsOrCommerceEffects, true);
      assert.deepEqual(output.effects, {
        autoSelectedChains: 0,
        plannedAssignments: 0,
        plannedTransitions: 0,
        zeroServiceResourceCreations: 0,
        coinsEffects: 0,
        commerceOrderEffects: 0,
        fulfillmentEffects: 0
      });
      assert.equal(output.reasonCodes.length, 0);
      const serialized = `${result.stdout}\n${result.stderr}`;
      for (const forbidden of [CASE_REF, inputPath, "private-snapshot", PRIVATE_SENTINEL, "Error", "sqlite"]) {
        assert.equal(serialized.includes(forbidden), false);
      }
    }
    assert.deepEqual(readFileSync(inputPath), inputBefore);
  });
});

test("apply is expressly hard-stopped before an input can be read", async () => {
  const outcome = await runLegacyEntitlementNormalizationCli({
    argv: ["--mode", "apply", "--input-path", "C:\\private\\unreadable.json"]
  });
  assert.equal(outcome.exitCode, 2);
  assert.equal(outcome.output.ok, false);
  assert.equal(outcome.output.mode, "apply");
  assert.deepEqual(outcome.output.reasonCodes, ["apply_not_supported"]);
  assert.equal(outcome.output.executionAllowed, false);
});

test("CLI rejects unknown, duplicate, missing, relative, and database-path arguments", async () => {
  const cases = [
    [[], "mode_required"],
    [["--mode", "plan"], "input_path_required"],
    [["--mode", "plan", "--input-path", "relative.json"], "input_path_must_be_absolute"],
    [["--mode", "plan", "--input-path", "\\\\server\\share\\private.json"], "input_path_network_forbidden"],
    [["--mode", "plan", "--input-path", "C:\\private\\production.sqlite"], "input_path_database_forbidden"],
    [["--mode", "plan", "--input-path", "C:\\private\\snapshot.txt"], "input_path_extension_invalid"],
    [["--mode", "plan", "--db-path", "C:\\private\\db.sqlite"], "unknown_argument"],
    [["--mode", "plan", "--mode", "dry-run", "--input-path", "C:\\private\\snapshot.json"], "duplicate_argument"]
  ];
  for (const [argv, code] of cases) {
    const outcome = await runLegacyEntitlementNormalizationCli({ argv });
    assert.equal(outcome.exitCode, 2);
    assert.deepEqual(outcome.output.reasonCodes, [code]);
  }
});

test("malformed snapshot content returns a closed error without leaking its path or bytes", () => {
  withTempDirectory((directory) => {
    const inputPath = join(directory, "private-invalid.json");
    writeFileSync(inputPath, `{"schemaVersion":"1","schemaVersion":"1","sentinel":"${PRIVATE_SENTINEL}"}`);
    const result = runCli(["--mode", "plan", "--input-path", inputPath]);
    assert.equal(result.status, 3);
    const output = parseOutput(result);
    assert.equal(output.ok, false);
    assert.deepEqual(output.reasonCodes, ["input_snapshot_rejected"]);
    const serialized = `${result.stdout}\n${result.stderr}`;
    assert.equal(serialized.includes(PRIVATE_SENTINEL), false);
    assert.equal(serialized.includes(inputPath), false);
  });
});

test("empty and oversized inputs are rejected before any planning result", () => {
  withTempDirectory((directory) => {
    const emptyPath = join(directory, "private-empty.json");
    const oversizedPath = join(directory, "private-oversized.json");
    writeFileSync(emptyPath, "");
    writeFileSync(oversizedPath, " ".repeat(2 * 1024 * 1024 + 1));
    for (const inputPath of [emptyPath, oversizedPath]) {
      const result = runCli(["--mode", "plan", "--input-path", inputPath]);
      assert.equal(result.status, 3);
      const output = parseOutput(result);
      assert.equal(output.ok, false);
      assert.deepEqual(output.reasonCodes, ["input_snapshot_rejected"]);
      assert.equal(`${result.stdout}\n${result.stderr}`.includes(inputPath), false);
    }
  });
});
