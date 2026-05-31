import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const rootDir = new URL("../../", import.meta.url);
const NOW = "2026-05-31T00:00:00.000Z";
const FUTURE = "2099-06-04T00:00:00.000Z";

function portalEntryInput(overrides = {}) {
  return {
    accountId: "acct_portal_cli_1",
    entitlementId: "ent_portal_cli_1",
    issuedByRef: "operator_safe_ref",
    expiresAt: FUTURE,
    maxUses: 1,
    ...overrides
  };
}

function seedControlDb(controlDbPath) {
  const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
  store.createAccount({
    id: "acct_portal_cli_1",
    ownerRef: "owner_safe_ref",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  });
  store.createEntitlement({
    id: "ent_portal_cli_1",
    accountId: "acct_portal_cli_1",
    plan: "pilot",
    status: "active",
    validFrom: NOW,
    validUntil: FUTURE,
    maxArtifacts: 1,
    maxDevices: 1,
    trafficLimitBytes: 0,
    createdAt: NOW,
    updatedAt: NOW
  });
  store.close();
}

function withTempEnv(fn, input = portalEntryInput(), { seed = true } = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-issue-portal-entry-"));
  try {
    const controlDbPath = join(tempDir, "control.sqlite");
    const inputPath = join(tempDir, "portal-entry-input.json");
    const handoffPath = join(tempDir, "handoff.json");
    writeFileSync(inputPath, JSON.stringify(input, null, 2));
    if (seed) {
      seedControlDb(controlDbPath);
    }
    return fn({ tempDir, controlDbPath, inputPath, handoffPath });
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

function runCli(args) {
  return execFileSync(process.execPath, ["scripts/platform-issue-portal-entry.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env }
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

test("platform issue-portal-entry defaults to dry-run without mutating control DB", () => {
  withTempEnv(({ inputPath, controlDbPath, handoffPath }) => {
    const stdout = runCli([
      "--approval-ref", "approval-portal-1",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.controlDbMutated, false);
    assert.equal(result.handoffWritten, false);
    assert.ok(!existsSync(handoffPath), "dry-run must not create a handoff file");

    const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    assert.equal(store.findPortalEntryByTokenHash("unused_hash"), null);
    assert.equal(store.listPortalSessions({ accountId: "acct_portal_cli_1" }).length, 0);
    store.close();
  });
});

test("platform issue-portal-entry executes only with explicit flags and isolates raw token in handoff", () => {
  withTempEnv(({ inputPath, controlDbPath, handoffPath }) => {
    const stdout = runCli([
      "--execute-production-mutation",
      "--approval-ref", "approval-portal-1",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "platform-issue-portal-entry");
    assert.equal(summary.controlDbMutated, true);
    assert.equal(summary.handoffWritten, true);
    assert.equal(summary.rawTokenReturned, false);
    assert.equal(summary.summary.action, "portal_entry_issued");
    assert.equal(summary.summary.accountId, "acct_portal_cli_1");
    assert.doesNotMatch(stdout, /portalEntryToken|entryToken|subscriptionUrl|token=/);

    const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
    assert.equal(handoff.entryRef, summary.summary.entryRef);
    assert.match(handoff.entryToken, /^[A-Za-z0-9_-]{32,}$/);
    assert.equal(handoff.expiresAt, FUTURE);

    const store = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    const stored = store.getPortalEntry(summary.summary.entryRef);
    assert.equal(stored.accountId, "acct_portal_cli_1");
    assert.notEqual(stored.tokenHash, handoff.entryToken);
    assert.match(stored.tokenHash, /^portalentryhash_[a-f0-9]{64}$/);
    store.close();
  });
});

test("platform issue-portal-entry fails closed before creating control DB on invalid input", () => {
  withTempEnv(({ inputPath, controlDbPath, handoffPath }) => {
    const error = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "approval-portal-1",
      "--control-db-path", controlDbPath,
      "--handoff-file", handoffPath,
      inputPath
    ]);

    assert.ok(error);
    assert.match(error.stderr || error.message, /entitlementId is required/);
    assert.ok(!existsSync(controlDbPath), "control DB must not be created on invalid input");
    assert.ok(!existsSync(handoffPath), "handoff file must not be created on invalid input");
  }, portalEntryInput({ entitlementId: "" }), { seed: false });
});
