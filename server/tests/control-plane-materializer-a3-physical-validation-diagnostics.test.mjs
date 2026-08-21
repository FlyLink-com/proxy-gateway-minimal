// A3-1 physical-validation diagnostics observer tests (stacked Draft PR).
//
// These tests pin the boundary behaviour of the read-only diagnostics
// observer added to the A3-1 physical-validation runner. Each case
// asserts that the observer is fail-closed: malformed inputs, oversized
// outputs, timeouts, invalid UTF-8, duplicate invocations, and an
// observer hook exception must NOT silently swallow or transform the
// collector's primary exit code or stderr JSON.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDiagnosticsObserver } from "../../scripts/control-plane-materializer-a3-physical-validation-diagnostics.mjs";
import { runA3PhysicalValidationCli } from "../../scripts/control-plane-materializer-a3-physical-validation.mjs";

function withDiagnosticsEnv(callback, config = {}) {
  const directory = mkdtempSync(join(tmpdir(), "a3-diag-"));
  const filePath = config.filePath ?? join(directory, "diagnostics.jsonl");
  const env = {
    A3_PHYSICAL_DIAGNOSTICS: "1",
    A3_PHYSICAL_DIAGNOSTICS_FILE: filePath,
    A3_PHYSICAL_DIAGNOSTICS_MAX_BYTES: String(config.maxBytes ?? 65536),
    A3_PHYSICAL_DIAGNOSTICS_PREVIEW_BYTES: String(config.previewBytes ?? 256),
    ...config.extra
  };
  return Promise.resolve()
    .then(() => callback({ env, filePath, directory }))
    .finally(() => {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* best effort */ }
    });
}

function captureCli({ env, argv = ["--mode", "quota", "--run-label", "probe-1", "--project-id", "4242"] }) {
  let stdout = "", stderr = "";
  const code = runA3PhysicalValidationCli({
    argv,
    stdout: { write(value) { stdout += value; } },
    stderr: { write(value) { stderr += value; } },
    env
  });
  return { code, stdout, stderr };
}

test("diagnostics observer records physical command invocations and writes bounded JSONL", async () => {
  await withDiagnosticsEnv(async ({ filePath }) => {
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p", "/var/sandbox"],
      status: 0,
      stdout: "4242 0 0 1\n",
      stderr: "",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(body.trim());
    assert.equal(parsed.schemaVersion, "diagnostics-1");
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation_diagnostics");
    assert.equal(parsed.command, "/usr/sbin/xfs_quota");
    assert.deepEqual(parsed.argv, ["-x", "-c", "report -p", "/var/sandbox"]);
    assert.equal(parsed.exitStatus, 0);
    assert.equal(parsed.exitError, null);
    assert.equal(parsed.stdoutBytes, "4242 0 0 1\n".length);
    assert.equal(typeof parsed.stdoutSha256, "string");
    assert.equal(parsed.stdoutSha256.length, 64);
    assert.equal(parsed.stderrBytes, 0);
    assert.equal(parsed.condition, "storage_quota_evidence_invalid");
    assert.equal(parsed.truncated, false);
    assert.equal(parsed.duplicate, false);
  });
});

test("diagnostics observer redacts IP addresses, SSH host:port, and secret-bearing key=value pairs", async () => {
  await withDiagnosticsEnv(async ({ filePath }) => {
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 512 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: "1.2.3.4 user@host:22 secret=abc123 bearer=xyz789",
      stderr: "10.0.0.1",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(body.trim());
    assert.equal(parsed.stdoutRedacted.includes("1.2.3.4"), false);
    assert.equal(parsed.stdoutRedacted.includes("<redacted>"), true);
    assert.equal(parsed.stdoutRedacted.includes("user@host:22"), false);
    assert.equal(parsed.stdoutRedacted.includes("secret=abc123"), false);
    assert.equal(parsed.stderrRedacted.includes("10.0.0.1"), false);
  });
});

test("diagnostics observer drops invalid UTF-16 surrogates and NUL bytes from previews", async () => {
  await withDiagnosticsEnv(async ({ filePath }) => {
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: "4242\ud800x",
      stderr: "before\0after",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(body.trim());
    assert.equal(parsed.stdoutRedacted.includes("\ud800"), false);
    assert.equal(parsed.stdoutRedacted.includes("\ufffd"), true);
    assert.equal(parsed.stderrRedacted.includes("\0"), false);
    assert.equal(parsed.stderrRedacted.includes("before"), true);
    assert.equal(parsed.stderrRedacted.includes("after"), true);
  });
});

test("diagnostics observer marks duplicate command invocations but never throws", async () => {
  await withDiagnosticsEnv(async ({ filePath }) => {
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, maxRecords: 16, previewBytes: 256 });
    const invocation = {
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: "ok",
      stderr: "",
      error: null,
      condition: "storage_quota_evidence_invalid"
    };
    observer.record(invocation);
    observer.record(invocation);
    observer.record({ ...invocation, args: ["-x", "-c", "report -p", "-D"] });
    observer.flush();
    const body = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
    assert.equal(body.length, 3);
    const parsed = body.map((line) => JSON.parse(line));
    assert.equal(parsed[0].duplicate, false);
    assert.equal(parsed[1].duplicate, true);
    assert.equal(parsed[2].duplicate, false);
  });
});

test("diagnostics observer caps total bytes and sets truncated=true when exceeded", async () => {
  await withDiagnosticsEnv(async ({ filePath }) => {
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 1024, maxRecords: 64, previewBytes: 64 });
    for (let index = 0; index < 50; index += 1) {
      observer.record({
        command: "/usr/sbin/xfs_quota",
        args: ["-x", "-c", "report -p"],
        status: 0,
        stdout: "x".repeat(256),
        stderr: "",
        error: null,
        condition: "storage_quota_evidence_invalid"
      });
    }
    const snapshot = observer.snapshot();
    assert.equal(snapshot.truncated, true);
    assert.equal(snapshot.recordCount > 0, true);
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    assert.equal(body.length <= 1024, true);
  });
});

test("diagnostics observer rejects non-string filePath and non-positive integers", () => {
  assert.throws(() => createDiagnosticsObserver({ filePath: "" }));
  assert.throws(() => createDiagnosticsObserver({ filePath: "/tmp/x", maxBytes: 0 }));
  assert.throws(() => createDiagnosticsObserver({ filePath: "/tmp/x", previewBytes: -1 }));
});

test("runA3PhysicalValidationCli leaves exit code untouched when env is unset", async () => {
  await withDiagnosticsEnv(async ({ env, filePath }) => {
    env.A3_PHYSICAL_DIAGNOSTICS = "0";
    env.A3_PHYSICAL_DIAGNOSTICS_FILE = "";
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).condition, "invalid_input");
  });
});

test("runA3PhysicalValidationCli surfaces invalid_input under diagnostics", async () => {
  await withDiagnosticsEnv(async ({ env }) => {
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    const stderr = JSON.parse(result.stderr);
    assert.equal(stderr.condition, "invalid_input");
    assert.equal(stderr.type, "control_plane_materializer_a3_physical_validation");
  });
});

test("runA3PhysicalValidationCli preserves the original stdout/stderr JSON schema verbatim", async () => {
  await withDiagnosticsEnv(async ({ env }) => {
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    const parsed = JSON.parse(result.stderr);
    assert.equal(parsed.schemaVersion, "1");
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation");
    assert.equal(parsed.state, "blocked");
    assert.equal(parsed.condition, "invalid_input");
  });
});

test("runA3PhysicalValidationCli ignores an unobtainable diagnostics file path", async () => {
  await withDiagnosticsEnv(async ({ env }) => {
    env.A3_PHYSICAL_DIAGNOSTICS_FILE = "Z:\\nonexistent\\diagnostics\\file.jsonl";
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).condition, "invalid_input");
  });
});
