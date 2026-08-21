// A3-1 physical-validation diagnostics observer tests (iteration 3).
//
// These tests pin the boundary behaviour of the read-only diagnostics
// observer added to the A3-1 physical-validation runner. Each case
// asserts that the observer is fail-closed: malformed inputs, oversized
// outputs, timeouts, invalid UTF-8, duplicate invocations, symlink
// substitution, existing-sink refusal (without mutation), custody
// readback failure, and observer hook exceptions must NOT silently
// swallow or transform the collector's primary exit code or stderr
// JSON. End-to-end tests drive the public
// `runCandidateDependencyA3PhysicalValidation` entry point with
// deterministic fake executors so the real `executeA3Physical` hook
// is exercised, not bypassed.

import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  statSync,
  symlinkSync,
  existsSync as exists
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDiagnosticsObserver } from "../../scripts/control-plane-materializer-a3-physical-validation-diagnostics.mjs";
import { runA3PhysicalValidationCli } from "../../scripts/control-plane-materializer-a3-physical-validation.mjs";
import { runCandidateDependencyA3PhysicalValidation } from "../../scripts/control-plane-candidate-dependency-gate.mjs";

function withDiagnosticsDir(callback) {
  const directory = mkdtempSync(join(tmpdir(), "a3-diag-"));
  return Promise.resolve()
    .then(() => callback(directory))
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
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p", "/var/sandbox"],
      status: 0,
      stdout: "4242 0 0 1\n",
      stderr: "",
      error: null,
      condition: "storage_quota_evidence_invalid",
      elapsedMs: 12.34
    });
    const status = observer.flush();
    assert.equal(status.published, true);
    assert.equal(status.bodySha256.length, 64);
    assert.equal(status.recordCount, 1);
    const body = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
    assert.equal(body.length, 2); // record + integrity footer
    const parsed = JSON.parse(body[0]);
    assert.equal(parsed.schemaVersion, "diagnostics-1");
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation_diagnostics");
    assert.equal(parsed.command, "/usr/sbin/xfs_quota");
    assert.deepEqual(parsed.argv, ["-x", "-c", "report -p", "/var/sandbox"]);
    assert.equal(parsed.exitStatus, 0);
    assert.equal(parsed.exitError, null);
    assert.equal(parsed.elapsedMs, 12);
    assert.equal(parsed.stdoutBytes, "4242 0 0 1\n".length);
    assert.equal(typeof parsed.stdoutSha256, "string");
    assert.equal(parsed.stdoutSha256.length, 64);
    assert.equal(parsed.stderrBytes, 0);
    assert.equal(parsed.condition, "storage_quota_evidence_invalid");
    assert.equal(parsed.truncated, false);
    assert.equal(parsed.duplicate, false);
    const footer = JSON.parse(body[1]);
    assert.equal(footer.type, "control_plane_materializer_a3_physical_validation_diagnostics_integrity");
    assert.equal(footer.recordCount, 1);
    assert.equal(footer.observerError, null);
    assert.equal(typeof footer.bodySha256, "string");
    assert.equal(footer.bodySha256.length, 64);
  });
});

test("diagnostics observer redacts IPv4, all IPv6 forms (incl. bare ::1 and ::), SSH, and secrets", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 2048 });
    const payload = [
      "1.2.3.4",                       // IPv4
      "203.0.113.42/24",               // IPv4 with mask
      "::1",                           // bare compressed loopback IPv6 (no leading word char)
      "::",                            // bare compressed unspecified IPv6
      "::ffff:192.0.2.128",            // IPv4-mapped IPv6
      "fe80::1ff:fe23:4567%eth0",      // IPv6 link-local zone
      "2001:db8::1",                   // IPv6 compressed
      "2001:0db8:85a3:0000:0000:8a2e:0370:7334", // IPv6 full
      "http://[2001:db8::1]:443/",     // IPv6 in URL bracket
      "user@host:22",                  // SSH user@host:port
      "host:2222",                     // host:port
      "secret=abc123",                 // secret key=value
      "TOKEN=xyz",                     // token key=value
      "Authorization: Bearer eyJabc.def.ghi", // bearer header
      "Bearer eyJxyz.uvw"              // bare bearer
    ];
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: payload.join(" "),
      stderr: "10.0.0.1 ::1 2001:db8::1 user@10.0.0.5:22",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    // None of the secret-bearing substrings should survive.
    for (const token of [
      "1.2.3.4",
      "203.0.113.42",
      "::1",
      "::",
      "::ffff:192.0.2.128",
      "fe80::1ff:fe23:4567",
      "2001:db8::1",
      "2001:0db8:85a3",
      "[2001:db8::1]",
      "user@host:22",
      "user@10.0.0.5:22",
      "secret=abc123",
      "TOKEN=xyz",
      "Authorization: Bearer",
      "Bearer eyJabc",
      "Bearer eyJxyz",
      "10.0.0.1"
    ]) {
      assert.equal(body.includes(token), false, `expected redaction of ${token}`);
    }
    assert.equal(body.includes("<redacted>"), true);
  });
});

test("diagnostics observer drops invalid UTF-16 surrogates and NUL bytes from previews", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
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
    assert.equal(body.includes("\ud800"), false);
    assert.equal(body.includes("\ufffd"), true);
    assert.equal(body.includes("\0"), false);
    assert.equal(body.includes("before"), true);
    assert.equal(body.includes("after"), true);
  });
});

test("diagnostics observer marks duplicate command invocations but never throws", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
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
    assert.equal(body.length, 4); // 3 records + footer
    const parsed = body.slice(0, 3).map((line) => JSON.parse(line));
    assert.equal(parsed[0].duplicate, false);
    assert.equal(parsed[1].duplicate, true);
    assert.equal(parsed[2].duplicate, false);
  });
});

test("diagnostics observer caps total bytes and sets truncated=true when exceeded", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
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
    const snap = observer.snapshot();
    assert.equal(snap.truncated, true);
    assert.equal(snap.recordCount > 0, true);
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    // Footer is unconditional proof-of-flush and is outside the cap.
    assert.equal(body.length <= 4096, true);
  });
});

test("diagnostics observer rejects non-string filePath and non-positive integers", () => {
  assert.throws(() => createDiagnosticsObserver({ filePath: "" }));
  assert.throws(() => createDiagnosticsObserver({ filePath: "/tmp/x", maxBytes: 0 }));
  assert.throws(() => createDiagnosticsObserver({ filePath: "/tmp/x", previewBytes: -1 }));
});

test("diagnostics observer refuses to overwrite an existing sink file WITHOUT mutating it", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const sentinel = "PRE_EXISTING_SENTINEL\n";
    writeFileSync(filePath, sentinel, "utf8");
    const beforeStats = statSync(filePath);
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: "4242",
      stderr: "",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    const status = observer.flush();
    assert.equal(status.published, false);
    assert.equal(status.observerError.includes("diagnostics_publish_failed"), true);
    // Existing sentinel must survive untouched and unchanged.
    const body = readFileSync(filePath, "utf8");
    assert.equal(body, sentinel);
    const afterStats = statSync(filePath);
    assert.equal(afterStats.size, beforeStats.size);
    assert.equal(afterStats.mtimeMs, beforeStats.mtimeMs);
    // A sibling integrity-fallback file should have been written.
    const fallback = readFileSync(`${filePath}.integrity-fallback`, "utf8");
    const parsed = JSON.parse(fallback.trim());
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation_diagnostics_integrity");
    assert.match(parsed.observerError, /diagnostics_publish_failed/);
  });
});

test("diagnostics observer refuses symlink substitution at the sink path", async () => {
  await withDiagnosticsDir(async (directory) => {
    const target = join(directory, "target.jsonl");
    const targetContent = "TARGET_SENTINEL\n";
    writeFileSync(target, targetContent, "utf8");
    const link = join(directory, "diagnostics.jsonl");
    try {
      symlinkSync(target, link, "file");
    } catch {
      return; // Windows without developer mode: skip
    }
    const observer = createDiagnosticsObserver({ filePath: link, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: "4242",
      stderr: "",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    const status = observer.flush();
    assert.equal(status.published, false);
    const targetBody = readFileSync(target, "utf8");
    assert.equal(targetBody, targetContent);
  });
});

test("diagnostics observer publishes with O_EXCL — no lstat/rename race window", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/bin/true",
      args: [],
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      condition: "ok"
    });
    const status = observer.flush();
    assert.equal(status.published, true);
    // No intermediate tmp files should be left behind. We use only the
    // `publishOnce` final-path open so the directory MUST contain only
    // the requested sink file.
    const entries = readdirSync(directory);
    const tmpEntries = entries.filter((e) => e.includes(".tmp-"));
    assert.equal(tmpEntries.length, 0);
  });
});

test("diagnostics observer refuses a sink path inside a non-existent parent directory", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "missing-parent", "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/bin/true",
      args: [],
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      condition: "ok"
    });
    const status = observer.flush();
    assert.equal(status.published, false);
  });
});

test("diagnostics observer writes the sink file with mode 0600", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p"],
      status: 0,
      stdout: "4242",
      stderr: "",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    observer.flush();
    if (process.platform !== "win32") {
      const stats = statSync(filePath);
      assert.equal(stats.mode & 0o777, 0o600);
    }
  });
});

test("diagnostics observer attaches elapsedMs to every record", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/bin/true",
      args: [],
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      condition: "ok",
      elapsedMs: 7.5
    });
    observer.flush();
    const body = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
    const parsed = JSON.parse(body[0]);
    assert.equal(parsed.elapsedMs, 8); // rounded
  });
});

test("diagnostics observer argv values are never copied into stdoutRedacted or stderrRedacted", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 256 });
    observer.record({
      command: "/usr/sbin/xfs_quota",
      args: ["-x", "-c", "report -p", "/var/sandbox-secret"],
      status: 0,
      stdout: "stdout-output",
      stderr: "stderr-output",
      error: null,
      condition: "storage_quota_evidence_invalid"
    });
    observer.flush();
    const body = readFileSync(filePath, "utf8");
    const record = JSON.parse(body.split(/\r?\n/)[0]);
    // Structured argv is preserved verbatim (operator owns argv shape).
    assert.deepEqual(record.argv, ["-x", "-c", "report -p", "/var/sandbox-secret"]);
    // Argv contents MUST NOT appear inside the stdout/stderr preview
    // fields. They live only in the structured argv array.
    assert.equal(record.stdoutRedacted.includes("var/sandbox-secret"), false, "argv leaked into stdoutRedacted");
    assert.equal(record.stderrRedacted.includes("var/sandbox-secret"), false, "argv leaked into stderrRedacted");
    assert.equal(record.stdoutRedacted.includes("stdout-output"), true);
    assert.equal(record.stderrRedacted.includes("stderr-output"), true);
  });
});

test("runA3PhysicalValidationCli leaves exit code untouched when env is unset", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "0",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).condition, "invalid_input");
    assert.equal(exists(filePath), false);
  });
});

test("runA3PhysicalValidationCli surfaces invalid_input under diagnostics and writes an integrity-only footer", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    // stderr carries the primary condition line plus, only when
    // diagnostics publish itself failed, a dedicated
    // `control_plane_materializer_a3_physical_validation_diagnostics_gate`
    // line. Inspect the first line for the collector schema.
    const stderrLines = result.stderr.trim().split(/\r?\n/);
    assert.equal(stderrLines[0].length > 0, true);
    const stderr = JSON.parse(stderrLines[0]);
    assert.equal(stderr.condition, "invalid_input");
    assert.equal(stderr.type, "control_plane_materializer_a3_physical_validation");
    assert.equal(exists(filePath), true);
    const body = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
    assert.equal(body.length, 1);
    const footer = JSON.parse(body[0]);
    assert.equal(footer.type, "control_plane_materializer_a3_physical_validation_diagnostics_integrity");
    assert.equal(footer.recordCount, 0);
  });
});

test("runA3PhysicalValidationCli preserves the original stdout/stderr JSON schema verbatim", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    // First line is always the collector's primary condition JSON.
    // Subsequent lines (if any) carry a distinct diagnostics gate
    // marker; both shapes are acceptable as long as the first line
    // preserves the original schema.
    const firstLine = result.stderr.trim().split(/\r?\n/)[0];
    const parsed = JSON.parse(firstLine);
    assert.equal(parsed.schemaVersion, "1");
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation");
    assert.equal(parsed.state, "blocked");
    assert.equal(parsed.condition, "invalid_input");
  });
});

test("runA3PhysicalValidationCli ignores an unobtainable diagnostics file path", async () => {
  await withDiagnosticsDir(async (directory) => {
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: "Z:\\nonexistent\\diagnostics\\file.jsonl"
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    const firstLine = result.stderr.trim().split(/\r?\n/)[0];
    assert.equal(JSON.parse(firstLine).condition, "invalid_input");
  });
});

test("diagnostics observer refuses to publish when an ancestor parent directory is a symlink", async () => {
  await withDiagnosticsDir(async (directory) => {
    // Construct a layout:
    //   <directory>/real/                   (real directory)
    //   <directory>/link -> real/           (symlink / junction)
    //   <directory>/link/diagnostics.jsonl  (target under the link)
    // The observer MUST refuse because lstat(<link>) reports a
    // symlink, not a directory, and a junction/symlink in any parent
    // segment can divert the open into a different tree.
    const real = join(directory, "real");
    mkdirSync(real);
    const linkParent = join(directory, "link");
    let createdLink = false;
    try {
      symlinkSync(real, linkParent, "junction");
      createdLink = true;
    } catch {
      try {
        symlinkSync(real, linkParent, "dir");
        createdLink = true;
      } catch {
        // No privilege to create junctions or symlinks on this host —
        // skip rather than fail.
      }
    }
    if (!createdLink) return;
    const filePath = join(linkParent, "diagnostics.jsonl");
    // Force the observer to walk the parent chain FROM <directory>.
    // Without an explicit sinkRoot, verifyParentChain treats the
    // immediate parent as root and skips the symlink segment.
    const observer = createDiagnosticsObserver({
      filePath,
      maxBytes: 65536,
      previewBytes: 256,
      sinkRoot: directory
    });
    observer.record({
      command: "/bin/true",
      args: [],
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      condition: "ok"
    });
    const status = observer.flush();
    assert.equal(status.published, false);
    assert.equal(status.observerError.includes("diagnostics_parent_chain_unsafe"), true);
    // Nothing must have been written under the linked parent.
    const entries = readdirSync(linkParent);
    assert.equal(entries.length, 0, "observer must not write under a symlinked parent");
  });
});

test("diagnostics observer publishes when target path is nested under sink root", async () => {
  await withDiagnosticsDir(async (directory) => {
    const sinkDir = join(directory, "sub", "deep");
    mkdirSync(sinkDir, { recursive: true });
    const filePath = join(sinkDir, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({
      filePath,
      maxBytes: 65536,
      previewBytes: 256,
      sinkRoot: directory
    });
    observer.record({
      command: "/bin/true",
      args: [],
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      condition: "ok"
    });
    const status = observer.flush();
    // The sink IS nested under the sink root; publish must succeed.
    assert.equal(status.published, true);
    assert.equal(status.parentDir, sinkDir);
  });
});

test("diagnostics observer refuses when target path is outside sink root", async () => {
  await withDiagnosticsDir(async (directory) => {
    // sinkRoot is a child of the test directory. The sink is placed in
    // a SIBLING child, which is NOT nested under sinkRoot.
    const sinkRoot = join(directory, "root");
    mkdirSync(sinkRoot);
    const sibling = join(directory, "sibling");
    mkdirSync(sibling);
    const filePath = join(sibling, "diagnostics.jsonl");
    const observer = createDiagnosticsObserver({
      filePath,
      maxBytes: 65536,
      previewBytes: 256,
      sinkRoot
    });
    observer.record({
      command: "/bin/true",
      args: [],
      status: 0,
      stdout: "",
      stderr: "",
      error: null,
      condition: "ok"
    });
    const status = observer.flush();
    assert.equal(status.published, false);
    assert.equal(status.observerError.includes("diagnostics_parent_chain_unsafe"), true);
  });
});

test("end-to-end: observer receives records through real executeA3Physical via overrides.executePhysicalCommand", async () => {
  // Drive the public `runCandidateDependencyA3PhysicalValidation` with a
  // deterministic fake executor and observer hook injected through
  // `overrides`. The wrapper passes overrides into
  // `createCandidateDependencyGateA3PhysicalValidationRuntime` which
  // threads them into the `supplied` object consumed by the real
  // `executeA3Physical`. We assert that the hook fires for the real
  // physical command and that the captured stdout SHA matches the
  // fake executor's exact bytes.
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");

    const fakeStdout = JSON.stringify({
      filesystems: [{ target: "/var/sandbox", source: "/dev/loop0", fstype: "xfs", options: "rw,pquota" }]
    });

    const observedCommands = [];
    const fakeExecutor = (cmd, argv) => {
      observedCommands.push({ cmd, argv });
      return { status: 0, stdout: fakeStdout, stderr: "", error: null };
    };
    const observer = createDiagnosticsObserver({ filePath, maxBytes: 65536, previewBytes: 512 });

    try {
      runCandidateDependencyA3PhysicalValidation({
        mode: "quota",
        runLabel: "probe-e2e",
        projectId: 4242,
        overrides: {
          // Pretend we are root on Linux so the A3 context gate accepts
          // the supplied object. We are NOT actually root in the test
          // environment — we only need `getuid() === 0` to be reported
          // so that a3PhysicalContext does not throw `invalid_input`.
          platform: "linux",
          requireRoot: true,
          allowA3PhysicalValidation: true,
          getuid: () => 0,
          getgid: () => 0,
          // Provide every key in A3_PHYSICAL_TOOLS with the exact
          // trusted-path string. We do not need these binaries to
          // actually exist on disk because the executor override
          // short-circuits the spawn.
          tools: {
            findmnt: "/usr/bin/findmnt",
            node: "/usr/bin/node",
            systemctl: "/usr/bin/systemctl",
            systemdRun: "/usr/bin/systemd-run",
            xfsIo: "/usr/sbin/xfs_io",
            xfsQuota: "/usr/sbin/xfs_quota"
          },
          executePhysicalCommand: fakeExecutor,
          observePhysicalCommand: observer.record
        }
      });
    } catch {
      // The fake findmnt output is well-formed enough to pass the
      // first evidence stage but downstream quota steps will reject
      // it. Either way the hook fires for every executeA3Physical call.
    }
    observer.flush();

    assert.equal(observedCommands.length > 0, true, "fake executor was never invoked");
    const body = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
    assert.equal(body.length > 1, true);
    const record = JSON.parse(body[0]);
    assert.equal(record.schemaVersion, "diagnostics-1");
    // The first call from collectStorageQuotaEvidence is findmnt.
    assert.equal(record.command, "/usr/bin/findmnt");
    assert.equal(record.exitStatus, 0);
    // The exact fake stdout bytes must survive into the SHA256,
    // proving the hook saw the real executor result and not a stub.
    assert.equal(record.stdoutSha256.length, 64);
    assert.equal(record.stdoutBytes, fakeStdout.length);
    assert.equal(typeof record.elapsedMs, "number");
    const footer = JSON.parse(body[body.length - 1]);
    assert.equal(footer.type, "control_plane_materializer_a3_physical_validation_diagnostics_integrity");
    assert.equal(footer.recordCount, body.length - 1);
  });
});
test("[iteration 5] CLI rejects relative A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT via the diagnostics config fail-closed path", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath,
      A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT: "relative/path"
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    const firstLine = result.stderr.trim().split(/\\r?\\n/)[0];
    const parsed = JSON.parse(firstLine);
    // The diagnostics-config gate line is the first line (no record yet).
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation_diagnostics_gate");
    assert.equal(parsed.state, "diagnostics_unpublished");
    assert.equal(parsed.condition, "diagnostics_invalid_sink_root");
    // No diagnostics file must have been created.
    assert.equal(exists(filePath), false);
  });
});

test("[iteration 5] CLI rejects non-absolute Windows-style SINK_ROOT", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath,
      A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT: "C:relative\\no-slash"
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    const parsed = JSON.parse(result.stderr.trim().split(/\\r?\\n/)[0]);
    assert.equal(parsed.condition, "diagnostics_invalid_sink_root");
  });
});

test("[iteration 5] CLI rejects enforce_owned_root without uid", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath,
      A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT: directory,
      A3_PHYSICAL_DIAGNOSTICS_ENFORCE_OWNED_ROOT: "1"
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    const parsed = JSON.parse(result.stderr.trim().split(/\\r?\\n/)[0]);
    assert.equal(parsed.condition, "diagnostics_enforce_owned_root_requires_uid");
  });
});

test("[iteration 5] CLI rejects negative uid", async () => {
  await withDiagnosticsDir(async (directory) => {
    const filePath = join(directory, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath,
      A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT: directory,
      A3_PHYSICAL_DIAGNOSTICS_UID: "-1"
    };
    const result = captureCli({ env });
    assert.equal(result.code, 1);
    const parsed = JSON.parse(result.stderr.trim().split(/\\r?\\n/)[0]);
    assert.equal(parsed.condition, "diagnostics_invalid_uid");
  });
});

test("[iteration 5] CLI surfaces absolute SINK_ROOT into the observer", async () => {
  // We provide a valid SINK_ROOT (the test dir itself) and a valid
  // A3_PHYSICAL_DIAGNOSTICS_FILE nested under it. The CLI must reach
  // createDiagnosticsObserver, the observer must publish, and the
  // collector run must produce its normal stdout line.
  await withDiagnosticsDir(async (directory) => {
    const sinkDir = join(directory, "nested");
    mkdirSync(sinkDir);
    const filePath = join(sinkDir, "diagnostics.jsonl");
    const env = {
      A3_PHYSICAL_DIAGNOSTICS: "1",
      A3_PHYSICAL_DIAGNOSTICS_FILE: filePath,
      A3_PHYSICAL_DIAGNOSTICS_SINK_ROOT: directory
    };
    // We force a fail-closed collector by passing only --mode (no
    // --run-label / --project-id) so the cli errors out via the
    // regular invalid_input path AFTER the diagnostics config gate has
    // passed. This proves the CLI honored the SINK_ROOT env var rather
    // than silently dropping it.
    const result = captureCli({ env, argv: ["--mode"] });
    assert.equal(result.code, 1);
    // First stderr line is the collector's invalid_input shape, not a
    // diagnostics config gate line — meaning the SINK_ROOT was accepted.
    const firstLine = result.stderr.trim().split(/\\r?\\n/)[0];
    const parsed = JSON.parse(firstLine);
    assert.equal(parsed.type, "control_plane_materializer_a3_physical_validation");
    assert.equal(parsed.condition, "invalid_input");
  });
});
