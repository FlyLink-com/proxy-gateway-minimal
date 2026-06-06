import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const rootDir = new URL("../../", import.meta.url);

function input(overrides = {}) {
  return {
    accountId: "acct_initial_cli_1",
    ownerRef: "owner_initial_cli_safe_ref",
    displayName: "Initial CLI Account",
    issuedByRef: "operator_safe_ref",
    ...overrides
  };
}

function withTempEnv(fn, payload = input()) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-issue-portal-initial-account-"));
  try {
    const controlDbPath = join(tempDir, "control.sqlite");
    const inputPath = join(tempDir, "initial-account-input.json");
    const handoffPath = join(tempDir, "initial-account-handoff.json");
    writeFileSync(inputPath, JSON.stringify(payload, null, 2));
    return fn({ controlDbPath, handoffPath, inputPath });
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function runCli(args) {
  return execFileSync(process.execPath, ["scripts/platform-issue-portal-initial-account.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PORTAL_INITIAL_ACCOUNT_TEST_PASSWORD: "test-only-cli-generated-password"
    }
  });
}

function runCliThrows(args) {
  try {
    runCli(args);
    return null;
  } catch (error) {
    return error;
  }
}

test("platform issue-portal-initial-account defaults to dry-run without mutating control DB", () => {
  withTempEnv(({ inputPath, controlDbPath, handoffPath }) => {
    const stdout = runCli([
      "--approval-ref", "approval_initial_cli_1",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.controlDbMutated, false);
    assert.equal(result.handoffWritten, false);
    assert.ok(!existsSync(controlDbPath), "dry-run must not create a control DB");
    assert.ok(!existsSync(handoffPath), "dry-run must not create a handoff file");
    assert.doesNotMatch(stdout, /test-only-cli-generated-password|initialPassword|passwordHash|scrypt\$v=1/);
  });
});

test("platform issue-portal-initial-account executes only with explicit flags and isolates password in handoff", () => {
  withTempEnv(({ inputPath, controlDbPath, handoffPath }) => {
    const stdout = runCli([
      "--execute-production-mutation",
      "--approval-ref", "approval_initial_cli_1",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "platform-issue-portal-initial-account");
    assert.equal(summary.controlDbMutated, true);
    assert.equal(summary.handoffWritten, true);
    assert.equal(summary.rawPasswordReturned, false);
    assert.equal(summary.summary.action, "portal_initial_account_issued");
    assert.equal(summary.summary.accountId, "acct_initial_cli_1");
    assert.doesNotMatch(stdout, /test-only-cli-generated-password|initialPassword|passwordHash|scrypt\$v=1/);

    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    assert.equal(handoff.accountId, "acct_initial_cli_1");
    assert.equal(handoff.initialPassword, "test-only-cli-generated-password");
    assert.equal(handoff.mustRotate, true);
    if (process.platform !== "win32") {
      assert.equal((statSync(handoffPath).mode & 0o777), 0o600);
    }

    const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    const account = store.getAccount("acct_initial_cli_1");
    assert.equal(account.ownerRef, "owner_initial_cli_safe_ref");
    const credential = store.getActivePortalPasswordCredential("acct_initial_cli_1");
    assert.equal(credential.mustRotate, true);
    assert.notEqual(credential.passwordHash, handoff.initialPassword);
    assert.match(credential.passwordHash, /^scrypt\$v=1\$N=32768\$r=8\$p=1\$/);
    store.close();
  });
});

test("platform issue-portal-initial-account fails closed before creating control DB on invalid input", () => {
  withTempEnv(({ inputPath, controlDbPath, handoffPath }) => {
    const error = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "approval_initial_cli_1",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    assert.ok(error);
    assert.match(error.stderr || error.message, /ownerRef is required/);
    assert.ok(!existsSync(controlDbPath), "control DB must not be created on invalid input");
    assert.ok(!existsSync(handoffPath), "handoff file must not be created on invalid input");
  }, input({ ownerRef: "" }));
});
