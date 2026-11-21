import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runControlledCli } from "../../tools/d1-stage2/controlled-cli.mjs";

function captureStream() {
  let value = "";
  return {
    write(chunk) {
      value += String(chunk);
      return true;
    },
    get value() {
      return value;
    },
  };
}

function run(argv) {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = runControlledCli({
    argv,
    stdout,
    stderr,
    now: () => new Date("2026-11-21T00:00:00.000Z"),
  });
  return { exitCode, stdout: stdout.value, stderr: stderr.value };
}

test("controlled CLI calls all four Stage 2 modules using only a synthetic fixture", () => {
  const result = run(["--mode", "synthetic", "--operator", "test-runner", "--json"]);
  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS_SYNTHETIC_ONLY");
  assert.deepEqual(report.modulesInvoked, [
    "source-manifest",
    "source-export",
    "credential-reconciliation",
    "freeze-drain",
  ]);
  assert.equal(report.sourceSnapshot.verified, true);
  assert.equal(report.sourceSnapshot.isFullSourceSnapshot, false);
  assert.equal(report.export.verified, true);
  assert.equal(report.credentialReconciliation.rotatedCount, 1);
  assert.deepEqual(report.incrementalManifest.summary, {
    tables: 4,
    inserted: 1,
    updated: 2,
    deleted: 1,
  });
  assert.equal(report.incrementalManifest.verified, true);
  assert.equal(report.freezeDrain.verified, true);
  assert.equal(report.freezeDrain.phaseTransition, "none");
  assert.equal(report.safety.syntheticOnly, true);
  assert.equal(report.safety.notProductionEvidence, true);
  assert.equal(report.safety.realBwhReads, 0);
  assert.equal(report.safety.remoteNetworkCalls, 0);
  assert.equal(report.safety.remoteD1Writes, 0);
  assert.equal(report.safety.productionCredentialsRead, false);
  assert.equal(report.safety.productionFreezeExecuted, false);
  assert.equal(report.safety.scheduled, false);
  assert.equal(report.safety.deployed, false);
  assert.equal(report.safety.cutover, false);
  assert.equal(report.stopReason, null);
  assert.doesNotMatch(result.stdout, /s2s-cred-001-rotated/);
  assert.doesNotMatch(result.stdout, /synthetic-tuic-password/);
});

test("controlled CLI rejects database, URL, token, production and scheduling arguments", () => {
  for (const forbidden of [
    "--db",
    "--database",
    "--url",
    "--token",
    "--secret",
    "--production",
    "--cron",
    "--schedule",
    "--execute",
    "--write",
  ]) {
    const result = run([
      "--mode", "synthetic",
      "--operator", "test-runner",
      forbidden,
      "--json",
    ]);
    assert.equal(result.exitCode, 2, forbidden);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "STOPPED", forbidden);
    assert.equal(report.stopCode, "cli_argument_not_allowed", forbidden);
    assert.equal(report.safety.realBwhReads, 0, forbidden);
    assert.equal(report.safety.remoteD1Writes, 0, forbidden);
  }
});

test("controlled CLI rejects every mode except synthetic", () => {
  const result = run(["--mode", "production", "--operator", "test-runner", "--json"]);
  assert.equal(result.exitCode, 2);
  assert.equal(JSON.parse(result.stdout).stopCode, "cli_mode_not_allowed");
});

test("controlled CLI requires a safe operator alias and synthetic snapshot id", () => {
  const missingOperator = run(["--mode", "synthetic", "--json"]);
  assert.equal(missingOperator.exitCode, 2);
  assert.equal(JSON.parse(missingOperator.stdout).stopCode, "cli_operator_invalid");

  const invalidSnapshot = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--snapshot-id", "production-snapshot-001",
    "--json",
  ]);
  assert.equal(invalidSnapshot.exitCode, 2);
  assert.equal(JSON.parse(invalidSnapshot.stdout).stopCode, "cli_snapshot_id_invalid");
});

test("controlled CLI rejects duplicate arguments and missing values", () => {
  const duplicate = run([
    "--mode", "synthetic",
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--json",
  ]);
  assert.equal(duplicate.exitCode, 2);
  assert.equal(JSON.parse(duplicate.stdout).stopCode, "cli_argument_duplicate");

  const missing = run(["--mode", "--operator", "test-runner", "--json"]);
  assert.equal(missing.exitCode, 2);
  assert.equal(JSON.parse(missing.stdout).stopCode, "cli_argument_value_missing");
});

test("controlled CLI accepts help without opening a fixture", () => {
  const result = run(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /synthetic only/);
  assert.match(result.stdout, /No database path/);
});

test("controlled CLI source has no network, environment-secret or remote D1 client path", () => {
  const source = readFileSync(new URL("../../tools/d1-stage2/controlled-cli.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /node:(?:http|https)|undici|WebSocket/);
  assert.doesNotMatch(source, /process\.env|CLOUDFLARE_API_TOKEN|D1Database|wrangler/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("controlled CLI never echoes an unrecognized argument value into the JSON stop record", () => {
  const sensitive = "ghp_FAKESECRET1234567890";
  const result = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--token=" + sensitive,
    "--json",
  ]);
  assert.equal(result.exitCode, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "STOPPED");
  assert.equal(report.stopCode, "cli_argument_not_allowed");
  assert.equal(report.stopReason, "argument is not allowlisted");
  assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(sensitive)));
});

test("controlled CLI never echoes an unrecognized argument value into the terminal stop record", () => {
  const sensitive = "/home/operator/.ssh/id_ed25519";
  const result = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    sensitive,
  ]);
  assert.equal(result.exitCode, 2, result.stdout);
  assert.doesNotMatch(result.stderr, new RegExp(escapeRegExp(sensitive)));
  assert.match(result.stderr, /Stop: cli_argument_not_allowed — argument is not allowlisted/);
});

test("controlled CLI derives distinct next snapshot ids for parents sharing a long common prefix", () => {
  const sharedPrefix = "s2s-" + "a".repeat(66);
  const first = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--snapshot-id", sharedPrefix + "xxx",
    "--json",
  ]);
  const second = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--snapshot-id", sharedPrefix + "yyy",
    "--json",
  ]);
  assert.equal(first.exitCode, 0, first.stderr);
  assert.equal(second.exitCode, 0, second.stderr);
  const firstNext = JSON.parse(first.stdout).incrementalManifest.snapshotId;
  const secondNext = JSON.parse(second.stdout).incrementalManifest.snapshotId;
  assert.notEqual(firstNext, secondNext);
  assert.match(firstNext, /^s2s-[a-z0-9-]{3,80}$/);
  assert.match(secondNext, /^s2s-[a-z0-9-]{3,80}$/);
});

test("controlled CLI derives a valid next snapshot id for a maximum-length parent id", () => {
  const parent = "s2s-" + "c".repeat(80);
  assert.equal(parent.length, 84);
  const result = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--snapshot-id", parent,
    "--json",
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS_SYNTHETIC_ONLY");
  assert.match(report.incrementalManifest.snapshotId, /^s2s-[a-z0-9-]{3,80}$/);
  assert.notEqual(report.incrementalManifest.snapshotId, parent);
});

test("controlled CLI does not stop on a parent id that ends in -next", () => {
  const parent = "s2s-" + "b".repeat(66) + "-next";
  assert.equal(parent.length, 75);
  const result = run([
    "--mode", "synthetic",
    "--operator", "test-runner",
    "--snapshot-id", parent,
    "--json",
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS_SYNTHETIC_ONLY");
  assert.notEqual(report.incrementalManifest.snapshotId, parent);
});
