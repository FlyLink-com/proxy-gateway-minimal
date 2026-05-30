import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSqliteSubscriptionStore } from "../services/subscriptions/repository.mjs";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";

const rootDir = new URL("../../", import.meta.url);

function inputFixture(overrides = {}) {
  return {
    displayName: "Test User",
    expiresAt: "2026-06-04T00:00:00.000Z",
    nodeId: "prod-edge-a",
    note: "test-note",
    control: {
      accountId: "acct_test_user",
      ownerRef: "cust_8f14e45fceea167a",
      entitlementId: "ent_test_user",
      plan: "pilot",
      requestId: "iss_test_user_001",
      requestedByRef: "operator_1f3870be274f6c49",
      purpose: "preproduction-canary",
      maxArtifacts: 1,
      maxDevices: 1,
      trafficLimitBytes: 0
    },
    artifact: {
      create: true
    },
    ...overrides
  };
}

function withTempEnv(fn, input = inputFixture()) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-issue-subscription-"));
  try {
    const dbPath = join(tempDir, "test.sqlite");
    const controlDbPath = join(tempDir, "control.sqlite");
    const inputPath = join(tempDir, "input.json");
    const handoffPath = join(tempDir, "handoff.txt");
    writeFileSync(inputPath, JSON.stringify(input, null, 2));

    // Init empty DB so it exists and is ready
    const store = createSqliteSubscriptionStore({ dbPath });
    store.close();

    return fn({ tempDir, dbPath, controlDbPath, inputPath, handoffPath });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runCli(args) {
  return execFileSync(process.execPath, ["scripts/platform-issue-subscription.mjs", ...args], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, SS_PASSWORD: process.env.SS_PASSWORD || "dummy" }
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

test("platform issue-subscription fails without mandatory execution flags", () => {
  withTempEnv(({ inputPath, dbPath, controlDbPath, handoffPath }) => {
    // Missing approval ref
    const err1 = runCliThrows([
      "--execute-production-mutation",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err1);
    assert.match(err1.stderr || err1.message, /--approval-ref is mandatory for execution/);

    // Missing https scheme
    const err2 = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "http://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err2);
    assert.match(err2.stderr || err2.message, /--public-base-url must be an https URL/);
  });
});

test("platform issue-subscription requires explicit control database for execution", () => {
  withTempEnv(({ inputPath, dbPath, handoffPath }) => {
    const err = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err);
    assert.match(err.stderr || err.message, /--control-db-path is mandatory for execution/);
  });
});

test("platform issue-subscription defaults to dry-run when execution flag is omitted", () => {
  withTempEnv(({ inputPath, dbPath, handoffPath }) => {
    const stdout = runCli([
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);

    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.match(result.message, /No database mutation occurred/);

    // Verify DB remains empty
    const store = createSqliteSubscriptionStore({ dbPath });
    assert.equal(store.listTenants().length, 0);
    store.close();
  });
});

test("platform issue-subscription executes mutation, records control state, and cleanly isolates secrets", () => {
  withTempEnv(({ inputPath, dbPath, controlDbPath, handoffPath }) => {
    const stdout = runCli([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);

    // STDOUT should be clean
    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.mode, "platform-issue-subscription");
    assert.equal(summary.handoffWritten, true);
    assert.equal(summary.rawUrlReturned, false);
    assert.equal(summary.dbMutated, true);
    assert.equal(summary.controlDbMutated, true);
    assert.equal(summary.approvalRef, "PR-123");
    assert.match(summary.accountRef, /^accountref_[a-f0-9]{16}$/);
    assert.equal(summary.issuanceRequestRef, "iss_test_user_001");
    assert.match(summary.tenantRef, /^tenantref_[a-f0-9]{16}$/);
    assert.match(summary.artifactRef, /^artifactref_[a-f0-9]{16}$/);

    assert.doesNotMatch(stdout, /https:\/\/example\.com/);
    assert.doesNotMatch(stdout, /tenant_\d|artifact_\d|rawTenantUrl|subscriptionUrl/);

    // Handoff file should contain the visible-once opaque artifact URL only.
    const handoffRaw = readFileSync(handoffPath, "utf8");
    const handoff = JSON.parse(handoffRaw);
    assert.match(handoff.tenantId, /^tenant_/);
    assert.notEqual(handoff.tenantId, summary.tenantRef);
    assert.match(handoff.artifactId, /^artifact_/);
    assert.notEqual(handoff.artifactId, summary.artifactRef);
    assert.match(handoff.subscriptionUrl, /^https:\/\/example\.com\/sub\/a\//);
    assert.doesNotMatch(handoffRaw, /\/sub\/clash\.yaml\?token=/);

    // DB should contain the tenant and artifact
    const store = createSqliteSubscriptionStore({ dbPath });
    const tenants = store.listTenants();
    assert.equal(tenants.length, 1);
    assert.equal(tenants[0].id, handoff.tenantId);

    const artifacts = store.listArtifactsByTenant(handoff.tenantId);
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].id, handoff.artifactId);

    store.close();

    const controlStore = createSqliteSubscriptionControlStore({ dbPath: controlDbPath });
    const controlSummary = controlStore.getAccountControlSummary("acct_test_user");
    assert.equal(controlSummary.account.ownerRef, "cust_8f14e45fceea167a");
    assert.equal(controlSummary.entitlements[0].id, "ent_test_user");
    assert.equal(controlSummary.issuanceRequests[0].id, "iss_test_user_001");
    assert.equal(controlSummary.issuanceRequests[0].status, "issued");
    assert.equal(controlSummary.issuedLinks[0].tenantRef, summary.tenantRef);
    assert.equal(controlSummary.issuedLinks[0].artifactRef, summary.artifactRef);
    assert.equal(controlSummary.quotaCounters[0].metric, "artifact_issuance");
    assert.equal(controlSummary.auditEvents.at(-1).action, "issued");
    assert.doesNotMatch(JSON.stringify(controlSummary), /subscriptionUrl|artifactSecret|owner@sensitive/i);
    controlStore.close();
  });
});

test("platform issue-subscription requires explicit node and opaque artifact issuance", () => {
  withTempEnv(({ inputPath, dbPath, controlDbPath, handoffPath }) => {
    const err = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err);
    assert.match(err.stderr || err.message, /nodeId is mandatory/);
    assert.ok(!existsSync(controlDbPath), "control DB must not be created on invalid input");
    assert.ok(!existsSync(handoffPath), "handoff file must not be created on invalid input");
  }, inputFixture({ nodeId: "" }));

  withTempEnv(({ inputPath, dbPath, controlDbPath, handoffPath }) => {
    const err = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err);
    assert.match(err.stderr || err.message, /artifact\.create must be true/);
  }, inputFixture({ artifact: { create: false } }));
});

function withCleanEnv(fn, input = inputFixture()) {
  const tempDir = mkdtempSync(join(tmpdir(), "platform-issue-subscription-"));
  try {
    const dbPath = join(tempDir, "runtime.sqlite");
    const controlDbPath = join(tempDir, "control.sqlite");
    const inputPath = join(tempDir, "input.json");
    const handoffPath = join(tempDir, "handoff.txt");
    writeFileSync(inputPath, JSON.stringify(input, null, 2));

    return fn({ tempDir, dbPath, controlDbPath, inputPath, handoffPath });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("platform issue-subscription rejects execution without control facts", () => {
  withTempEnv(({ inputPath, dbPath, controlDbPath, handoffPath }) => {
    const err = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err);
    assert.match(err.stderr || err.message, /control\.accountId is mandatory/);
  }, inputFixture({ control: undefined }));
});

test("platform issue-subscription strictly fails closed without creating runtime or control sqlite on invalid input", () => {
  withCleanEnv(({ inputPath, dbPath, controlDbPath, handoffPath }) => {
    const err = runCliThrows([
      "--execute-production-mutation",
      "--approval-ref", "PR-123",
      "--db-path", dbPath,
      "--control-db-path", controlDbPath,
      "--public-base-url", "https://example.com",
      "--handoff-file", handoffPath,
      inputPath
    ]);
    assert.ok(err);
    assert.match(err.stderr || err.message, /nodeId is mandatory/);
    assert.ok(!existsSync(dbPath), "runtime DB must not be created on invalid input");
    assert.ok(!existsSync(controlDbPath), "control DB must not be created on invalid input");
    assert.ok(!existsSync(handoffPath), "handoff file must not be created on invalid input");
  }, inputFixture({ nodeId: "" }));
});
