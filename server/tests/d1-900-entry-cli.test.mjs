// D1 Stage 2 — controlled entry CLI tests (card 12, #900 four modules).
// All fixtures are synthetic (s2s- prefix). No production data, no real
// credential material, no network. The CLI is exercised as a child
// process, exactly as an operator would run it.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "d1-900-entry-cli.mjs");

function runCli(t, args, cwd) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8", cwd });
  return result;
}

function makeWorkdir(t) {
  const dir = mkdtempSync(join(tmpdir(), "d1-900-entry-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runOk(t, dir, args) {
  const result = runCli(t, args, dir);
  assert.equal(result.status, 0, `expected exit 0 for ${args.join(" ")}; stderr: ${result.stderr}`);
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("help lists every command group and exits 0", (t) => {
  const dir = makeWorkdir(t);
  const result = runOk(t, dir, ["--help"]);
  assert.match(result.stdout, /snapshot build/);
  assert.match(result.stdout, /export page/);
  assert.match(result.stdout, /credential rotations/);
  assert.match(result.stdout, /freeze bundle/);
  assert.match(result.stdout, /smoke/);
});

test("unknown command exits 2 with a usage error", (t) => {
  const dir = makeWorkdir(t);
  const result = runCli(t, ["nosuchcmd"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown command/);
});

test("smoke runs the full four-module chain on synthetic data", (t) => {
  const dir = makeWorkdir(t);
  const result = runOk(t, dir, ["smoke"]);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.steps.snapshotVerify.valid, true);
  // Exactly one credential rotation, same row count: the case the
  // fingerprint diff cannot see, caught by the version manifest.
  assert.equal(summary.steps.credentialRotations.rotated.length, 1);
  assert.equal(summary.steps.credentialRotations.rotated[0].pk, "s2s-request-001|s2s-channel-a");
  assert.equal(summary.steps.credentialRotations.rotated[0].fromVersion, 1);
  assert.equal(summary.steps.credentialRotations.rotated[0].toVersion, 2);
  assert.equal(summary.steps.credentialRotations.unchanged, 2);
  // Four export pages verified; incremental manifest sees the
  // entitlement update plus the credential rotation.
  assert.deepEqual(Object.keys(summary.steps.exportPages).sort(), [
    "platform_accounts",
    "platform_entitlements",
    "platform_portal_edge_credentials",
    "platform_schema_migrations",
  ]);
  assert.equal(summary.steps.exportPages.platform_accounts.rowCount, 3);
  assert.equal(summary.steps.exportPages.platform_schema_migrations.rowCount, 19);
  assert.equal(summary.steps.incrementalManifest.valid, true);
  assert.equal(summary.steps.incrementalSummary.updated, 2);
  assert.equal(summary.steps.freezeBundle.valid, true);
  assert.match(summary.steps.freezeBundleHash, /^[0-9a-f]{64}$/);
  assert.equal(summary.steps.coverage.total, 28);
  assert.equal(summary.steps.coverage.openCount, 28);
});

test("snapshot build + verify round-trips through files", (t) => {
  const dir = makeWorkdir(t);
  const dbPath = join(dir, "snap.sqlite");
  const metaPath = join(dir, "meta.json");
  runOk(t, dir, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-001", "--db-path", dbPath, "--out", metaPath]);
  assert.equal(existsSync(dbPath), true);
  const metadata = readJson(metaPath);
  assert.equal(metadata.sourceSnapshotId, "s2s-cli-test-001");
  assert.match(metadata.snapshotHash, /^[0-9a-f]{64}$/);
  const verified = runOk(t, dir, ["snapshot", "verify", "--db-path", dbPath, "--metadata", metaPath]);
  assert.equal(JSON.parse(verified.stdout).valid, true);
});

test("snapshot build rejects a non-synthetic snapshot id", (t) => {
  const dir = makeWorkdir(t);
  const result = runCli(t, ["snapshot", "build", "--snapshot-id", "prod-001", "--db-path", join(dir, "x.sqlite")], dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /entry_snapshot_id_invalid/);
});

test("snapshot build refuses a production database filename", (t) => {
  const dir = makeWorkdir(t);
  const result = runCli(t, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-002", "--db-path", join(dir, "subscription-control.sqlite")], dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /entry_db_path_forbidden/);
  assert.equal(existsSync(join(dir, "subscription-control.sqlite")), false);
});

test("export page + verify round-trips; a tampered page fails verify", (t) => {
  const dir = makeWorkdir(t);
  const dbPath = join(dir, "snap.sqlite");
  runOk(t, dir, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-003", "--db-path", dbPath]);
  const pagePath = join(dir, "page.json");
  runOk(t, dir, ["export", "page", "--db-path", dbPath, "--table", "platform_entitlements", "--pk", "id", "--snapshot-id", "s2s-cli-test-003", "--out", pagePath]);
  const page = readJson(pagePath);
  assert.equal(page.rowCount, 4);
  assert.equal(page.columns.includes("metadata_json"), false);
  const verified = runOk(t, dir, ["export", "verify", "--page", pagePath]);
  assert.equal(JSON.parse(verified.stdout).valid, true);

  const tamperedPath = join(dir, "page-tampered.json");
  const tampered = { ...page, rows: page.rows.map((row, i) => (i === 0 ? { ...row, plan: "s2s-plan-tampered" } : row)) };
  writeFileSync(tamperedPath, JSON.stringify(tampered), "utf8");
  const rejected = runCli(t, ["export", "verify", "--page", tamperedPath], dir);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /export_page_hash_mismatch/);
});

test("export page rejects a limit above the rehearsal bound", (t) => {
  const dir = makeWorkdir(t);
  const dbPath = join(dir, "snap.sqlite");
  runOk(t, dir, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-004", "--db-path", dbPath]);
  const result = runCli(t, ["export", "page", "--db-path", dbPath, "--table", "platform_accounts", "--pk", "id", "--snapshot-id", "s2s-cli-test-004", "--limit", "21"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--limit must be an integer between 1 and 20/);
});

test("credential manifest + verify, and rotations detect a rotation", (t) => {
  const dir = makeWorkdir(t);
  const dbPath = join(dir, "snap.sqlite");
  runOk(t, dir, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-005", "--db-path", dbPath]);
  const manifestAPath = join(dir, "cred-a.json");
  runOk(t, dir, ["credential", "manifest", "--db-path", dbPath, "--snapshot-id", "s2s-cli-test-005", "--out", manifestAPath]);
  const manifestA = readJson(manifestAPath);
  assert.equal(manifestA.liveRowCount, 3);
  assert.equal(manifestA.backfilledCount, 0);
  const verifiedA = runOk(t, dir, ["credential", "verify", "--manifest", manifestAPath]);
  assert.equal(JSON.parse(verifiedA.stdout).valid, true);

  // Rotate one credential in place (same row count, new ref): the
  // trigger bumps the version, the manifest diff sees it.
  const db = new Database(dbPath);
  try {
    db.prepare(
      `update platform_portal_edge_credentials set edge_credential_ref = ? where request_id = ? and edge_channel_ref = ?`,
    ).run("s2s-cred-002-rotated", "s2s-request-002", "s2s-channel-a");
  } finally {
    db.close();
  }
  const manifestBPath = join(dir, "cred-b.json");
  runOk(t, dir, ["credential", "manifest", "--db-path", dbPath, "--snapshot-id", "s2s-cli-test-006", "--out", manifestBPath]);
  const rotations = runOk(t, dir, ["credential", "rotations", "--previous", manifestAPath, "--current", manifestBPath]);
  const parsed = JSON.parse(rotations.stdout);
  assert.equal(parsed.rotated.length, 1);
  assert.equal(parsed.rotated[0].pk, "s2s-request-002|s2s-channel-a");
  assert.equal(parsed.unchanged, 2);
});

test("freeze receipts bundle through files and never transition phase", (t) => {
  const dir = makeWorkdir(t);
  const dbPath = join(dir, "snap.sqlite");
  runOk(t, dir, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-007", "--db-path", dbPath]);
  const wlPath = join(dir, "wl.json");
  const schedPath = join(dir, "sched.json");
  const cbPath = join(dir, "cb.json");
  const hwmPath = join(dir, "hwm.json");
  const bundlePath = join(dir, "bundle.json");
  runOk(t, dir, ["freeze", "write-lock", "--db-path", dbPath, "--snapshot-id", "s2s-cli-test-007", "--checkpoint-id", "s2s-cli-test-007", "--out", wlPath]);
  runOk(t, dir, ["freeze", "scheduler", "--snapshot-id", "s2s-cli-test-007", "--all-quiesced", "--out", schedPath]);
  runOk(t, dir, ["freeze", "callback", "--snapshot-id", "s2s-cli-test-007", "--callbacks", "[]", "--out", cbPath]);
  runOk(t, dir, ["freeze", "hwm", "--snapshot-id", "s2s-cli-test-007", "--seq", "1", "--manifest-seq", "1",
    "--row-counts", JSON.stringify({ platform_accounts: 3, platform_entitlements: 4, platform_portal_edge_credentials: 3, platform_schema_migrations: 19 }),
    "--out", hwmPath]);
  runOk(t, dir, ["freeze", "bundle", "--snapshot-id", "s2s-cli-test-007",
    "--write-lock", wlPath, "--scheduler", schedPath, "--callback", cbPath, "--hwm", hwmPath, "--out", bundlePath]);
  const bundle = readJson(bundlePath);
  assert.equal(bundle.phaseTransition, "none");
  assert.match(bundle.bundleHash, /^[0-9a-f]{64}$/);
  const verified = runOk(t, dir, ["freeze", "verify-bundle", "--bundle", bundlePath]);
  assert.equal(JSON.parse(verified.stdout).valid, true);

  const coverage = runOk(t, dir, ["freeze", "coverage"]);
  const coverageParsed = JSON.parse(coverage.stdout);
  assert.equal(coverageParsed.total, 28);
  assert.equal(coverageParsed.openCount, 28);
});

test("freeze scheduler without evidence or --all-quiesced is a usage error", (t) => {
  const dir = makeWorkdir(t);
  const result = runCli(t, ["freeze", "scheduler", "--snapshot-id", "s2s-cli-test-008"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--evidence <json> or --all-quiesced/);
});

test("export manifest + verify-manifest round-trips; tampered seq fails", (t) => {
  const dir = makeWorkdir(t);
  const dbPath = join(dir, "snap.sqlite");
  runOk(t, dir, ["snapshot", "build", "--snapshot-id", "s2s-cli-test-009", "--db-path", dbPath]);
  const manifestPath = join(dir, "inc.json");
  runOk(t, dir, ["export", "manifest", "--db-path", dbPath, "--snapshot-id", "s2s-cli-test-010",
    "--previous-snapshot-id", "s2s-cli-test-009", "--seq", "1", "--out", manifestPath]);
  const manifest = readJson(manifestPath);
  assert.equal(manifest.seq, 1);
  assert.equal(manifest.summary.inserted, 0);
  assert.equal(manifest.summary.updated, 0);
  const verified = runOk(t, dir, ["export", "verify-manifest", "--manifest", manifestPath]);
  assert.equal(JSON.parse(verified.stdout).valid, true);

  const tamperedPath = join(dir, "inc-tampered.json");
  writeFileSync(tamperedPath, JSON.stringify({ ...manifest, seq: 2 }), "utf8");
  const rejected = runCli(t, ["export", "verify-manifest", "--manifest", tamperedPath], dir);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /export_manifest_hash_mismatch/);
});
