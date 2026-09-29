import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  WELCOME_COINS_NATIVE_COMMON_FLAGS,
  WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
  WELCOME_COINS_NATIVE_POST_EXEC_FLAGS
} from "../../scripts/control-plane-welcome-coins-native-contract.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RUNNER_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-custody-synthetic-runner.c"
);
const CHILD_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/fixtures/welcome-coins-custody-synthetic-child.mjs"
);
const LAUNCHER_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-custody-launcher.c"
);
const POST_EXEC_BOOTSTRAP_PATH = resolve(
  REPOSITORY_ROOT,
  "scripts/native/welcome-coins-post-exec-bootstrap.c"
);
const REQUIRED_CI_WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/ci.yml"
);
const DEPENDENCY_ARTIFACT_WORKFLOW_PATH = resolve(
  REPOSITORY_ROOT,
  ".github/workflows/control-plane-dependency-artifact.yml"
);
const BOUNDED_NATIVE_ENVIRONMENT = Object.freeze({
  PATH: "/usr/bin:/bin",
  LANG: "C",
  LC_ALL: "C",
  SOURCE_DATE_EPOCH: "0",
  TZ: "UTC",
  ZERO_AR_DATE: "1"
});

function requiredSource(path, label) {
  assert.equal(existsSync(path), true, label + " source must exist");
  return readFileSync(path, "utf8");
}

function readExactStream(stream, size, label) {
  return new Promise((resolveRead, rejectRead) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectRead(new Error(label + " timeout"));
    }, 2000);
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off("readable", onReadable);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };
    const onReadable = () => {
      const bytes = stream.read(size);
      if (bytes === null) return;
      cleanup();
      if (bytes.length !== size) {
        rejectRead(new Error(label + " truncated"));
        return;
      }
      resolveRead(bytes);
    };
    const onEnd = () => {
      cleanup();
      rejectRead(new Error(label + " ended"));
    };
    const onError = (error) => {
      cleanup();
      rejectRead(error);
    };
    stream.on("readable", onReadable);
    stream.on("end", onEnd);
    stream.on("error", onError);
    onReadable();
  });
}

async function waitForExit(child, label) {
  return new Promise((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectExit(new Error(label + " timeout"));
    }, 2000);
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onExit = (code, signal) => {
      cleanup();
      resolveExit([code, signal]);
    };
    const onError = (error) => {
      cleanup();
      rejectExit(error);
    };
    child.on("exit", onExit);
    child.on("error", onError);
  });
}

function fakeLauncherSource(finalStatement) {
  return `#!${process.execPath}
import { readSync, writeSync } from "node:fs";
const fd = 7;
const field = 40;
function readExact(size) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(fd, bytes, offset, size - offset, null);
    if (count <= 0) process.exit(121);
    offset += count;
  }
  return bytes;
}
function readFrame(expected) {
  const header = readExact(field + 4);
  const size = header.readUInt32BE(field);
  const payload = readExact(size);
  if (header.subarray(0, expected.length).toString("ascii") !== expected || payload.at(-1) !== 10) process.exit(122);
}
function writeFrame(magic, payload) {
  const body = Buffer.from(payload, "utf8");
  const frame = Buffer.alloc(field + 4 + body.length);
  frame.write(magic, 0, "ascii");
  frame.writeUInt32BE(body.length, field);
  body.copy(frame, field + 4);
  writeSync(fd, frame);
}
readExact(48);
const ready = Buffer.alloc(76);
ready.write("welcome_coins_native_ready_v1", 0, "ascii");
ready.writeUInt32BE(process.pid, 40);
ready.writeBigUInt64BE(1n, 44);
ready.writeBigUInt64BE(2n, 52);
ready.writeBigUInt64BE(1n, 60);
ready.writeBigUInt64BE(3n, 68);
writeSync(fd, ready);
readFrame("welcome_coins_native_authorize_v1");
writeFrame("welcome_coins_native_acquired_v1", "synthetic-acquired\\n");
readFrame("welcome_coins_native_commit_v1");
writeFrame("welcome_coins_native_held_v1", "synthetic-held\\n");
readFrame("welcome_coins_native_release_v1");
${finalStatement}
`;
}

function compileSyntheticRunner(root, source, timeoutMilliseconds = undefined) {
  const fakeLauncher = resolve(root, "fake-launcher.mjs");
  const runnerOutput = resolve(root, "synthetic-runner");
  writeFileSync(fakeLauncher, source, { mode: 0o755 });
  chmodSync(fakeLauncher, 0o755);
  const timeoutFlag = timeoutMilliseconds === undefined
    ? []
    : [`-DWELCOME_COINS_IO_TIMEOUT_MS=${timeoutMilliseconds}`];
  const compiled = spawnSync("/usr/bin/gcc", [
    ...WELCOME_COINS_NATIVE_COMMON_FLAGS,
    ...WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
    ...timeoutFlag,
    `-DWELCOME_COINS_SYNTHETIC_LAUNCHER_PATH="${fakeLauncher}"`,
    RUNNER_PATH,
    "-o",
    runnerOutput
  ], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }
  });
  assert.equal(compiled.status, 0, compiled.stderr);
  assert.equal(compiled.stdout, "");
  assert.equal(compiled.stderr, "");
  return runnerOutput;
}

function nativeStringDefinition(name, value) {
  assert.equal(typeof value, "string");
  assert.doesNotMatch(value, /["\\\r\n]/u);
  return `-D${name}="${value}"`;
}

function compileNativeTarget(argumentsList, label) {
  const compiled = spawnSync("/usr/bin/gcc", argumentsList, {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: BOUNDED_NATIVE_ENVIRONMENT,
    timeout: 60_000,
    maxBuffer: 1024 * 1024
  });
  assert.equal(compiled.error, undefined, label + " compiler launch");
  assert.equal(compiled.signal, null, label + " compiler signal");
  assert.equal(compiled.status, 0, label + ": " + compiled.stderr);
  assert.equal(compiled.stdout, "", label + " compiler stdout");
  assert.equal(compiled.stderr, "", label + " compiler stderr");
}

test("test-only custody synthetic runner drives the fixed native controller protocol", () => {
  const runner = requiredSource(RUNNER_PATH, "synthetic runner");
  const child = requiredSource(CHILD_PATH, "synthetic child");

  for (const requiredValue of [
    "WELCOME_COINS_SETUP_MAGIC",
    "welcome_coins_native_setup_v1",
    "welcome_coins_native_ready_v1",
    "welcome_coins_native_authorize_v1",
    "welcome_coins_native_acquired_v1",
    "welcome_coins_native_commit_v1",
    "welcome_coins_native_held_v1",
    "welcome_coins_native_release_v1",
    "WELCOME_COINS_CONTROLLER_FD 7",
    "WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH"
  ]) {
    assert.equal(
      runner.includes(requiredValue),
      true,
      "synthetic runner must bind " + requiredValue
    );
  }

  assert.match(runner, /socketpair\s*\(\s*AF_UNIX\s*,\s*SOCK_STREAM/u);
  assert.match(runner, /getpwnam\s*\(\s*"nobody"\s*\)/u);
  assert.match(runner, /\bexecve\s*\(/u);
  assert.match(runner, /\bwaitpid\s*\(/u);
  assert.match(runner, /waitpid_bounded/u);
  assert.match(runner, /deadline_after_milliseconds/u);
  assert.match(runner, /wait_fd_until/u);
  assert.match(runner, /ensure_standard_descriptors/u);
  assert.match(runner, /SIGCHLD/u);
  assert.match(runner, /PR_SET_PDEATHSIG/u);
  assert.match(runner, /setpgid/u);
  assert.match(runner, /close_descriptor_interval/u);
  assert.match(runner, /process_group_is_empty/u);
  assert.match(runner, /synthetic_descendant_invalid/u);
  assert.match(runner, /int\s+child_status\s*;/u);
  assert.match(runner, /int\s+exit_code\s*=\s*1\s*;/u);
  assert.match(runner, /return\s+exit_code\s*;/u);
  assert.doesNotMatch(runner, /return\s+status\s*;/u);
  assert.doesNotMatch(
    runner,
    /\b(?:system|popen|execvp|execvpe|execlp|posix_spawnp)\s*\(/u
  );

  assert.match(
    child,
    /writeSync\s*\(\s*4\s*,\s*"synthetic-acquired\\n"\s*\)/u
  );
  assert.match(
    child,
    /writeSync\s*\(\s*4\s*,\s*"synthetic-held\\n"\s*\)/u
  );
  assert.match(child, /closeSync\s*\(\s*4\s*\)/u);
  assert.match(child, /readFileSync\s*\(\s*3\s*,\s*"utf8"\s*\)/u);
  assert.match(child, /readExact\s*\(\s*5\s*,/u);
  assert.doesNotMatch(child, /readFileSync\s*\(\s*5\s*,/u);
  assert.doesNotMatch(
    child,
    /\b(?:process\.env|child_process|net\.|fetch\s*\()/u
  );
});


test("synthetic runner cannot truncate a failed launcher wait status to success", {
  skip: process.platform !== "linux" || process.getuid?.() !== 0 || !existsSync("/usr/bin/gcc")
}, () => {
  const root = mkdtempSync(resolve(tmpdir(), "gccgw-custody-runner-negative-"));

  try {
    const runnerOutput = compileSyntheticRunner(
      root,
      fakeLauncherSource("process.exit(1);")
    );

    const result = spawnSync(runnerOutput, [], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      timeout: 5000
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /"condition":"synthetic_child_invalid"/u);

    const ignoredSigchld = spawnSync("/usr/bin/env", [
      "--ignore-signal=CHLD",
      runnerOutput
    ], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      timeout: 5000
    });
    assert.equal(ignoredSigchld.status, 1, ignoredSigchld.stderr);
    assert.match(ignoredSigchld.stderr, /"condition":"synthetic_child_invalid"/u);

    const closedStderr = spawnSync("/bin/bash", [
      "-c",
      "exec 2>&-; exec \"$1\"",
      "synthetic-runner-closed-stderr",
      runnerOutput
    ], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      timeout: 5000
    });
    assert.equal(closedStderr.status, 1);
    assert.equal(closedStderr.signal, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("synthetic runner bounds a launcher that hangs after release", {
  skip: process.platform !== "linux" || process.getuid?.() !== 0 || !existsSync("/usr/bin/gcc")
}, () => {
  const root = mkdtempSync(resolve(tmpdir(), "gccgw-custody-runner-timeout-"));

  try {
    const runnerOutput = compileSyntheticRunner(
      root,
      fakeLauncherSource("setInterval(() => {}, 1000);"),
      250
    );
    const started = Date.now();
    const result = spawnSync(runnerOutput, [], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      timeout: 3000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /"condition":"synthetic_wait_invalid"/u);
    assert.ok(Date.now() - started < 2000, "synthetic wait must honor one bounded deadline");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("synthetic runner rejects a successful launcher that leaves a live descendant", {
  skip: process.platform !== "linux" || process.getuid?.() !== 0 || !existsSync("/usr/bin/gcc")
}, () => {
  const root = mkdtempSync(resolve(tmpdir(), "gccgw-custody-runner-descendant-"));
  const processRecord = resolve(root, "processes.json");

  try {
    const runnerOutput = compileSyntheticRunner(
      root,
      fakeLauncherSource(`
const { spawn } = await import("node:child_process");
const { writeFileSync } = await import("node:fs");
const survivor = spawn("/bin/sleep", ["30"], { stdio: "ignore" });
writeFileSync(${JSON.stringify(processRecord)}, JSON.stringify({
  processGroup: process.pid,
  survivor: survivor.pid
}));
process.exit(0);`)
    );
    const result = spawnSync(runnerOutput, [], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      timeout: 5000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /"condition":"synthetic_descendant_invalid"/u);

    const { survivor } = JSON.parse(readFileSync(processRecord, "utf8"));
    const pause = new Int32Array(new SharedArrayBuffer(4));
    let state = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const status = readFileSync(`/proc/${survivor}/stat`, "utf8");
        const stateOffset = status.lastIndexOf(") ") + 2;
        state = status[stateOffset] ?? null;
      } catch (error) {
        if (error?.code !== "ENOENT" && error?.code !== "ESRCH") throw error;
        state = null;
      }
      if (state === null || state === "Z") break;
      Atomics.wait(pause, 0, 0, 25);
    }
    assert.ok(state === null || state === "Z", "synthetic descendant must not remain live");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("required CI binds the privileged gate to the exact same-repository source ref without production mutation", () => {
  const workflow = requiredSource(
    REQUIRED_CI_WORKFLOW_PATH,
    "required CI workflow"
  );
  const validateStart = workflow.indexOf("\n  validate:");
  const setupStart = workflow.indexOf("- name: Setup Node", validateStart);
  const gateStart = workflow.indexOf(
    "- name: Run privileged Welcome Coins custody synthetic gate",
    setupStart
  );
  const gateEnd = workflow.indexOf("- name: Determine validation lane", gateStart);
  assert.ok(validateStart >= 0 && setupStart > validateStart && gateStart > setupStart && gateEnd > gateStart);
  const setupStep = workflow.slice(setupStart, gateStart);
  assert.match(setupStep, /\n\s+node-version: 22\s*\n/u);
  assert.doesNotMatch(setupStep, /node-version:\s*22\./u);

  for (const requiredValue of [
    "permissions:\n  contents: read",
    "validate:\n    name: Validate\n    runs-on: ubuntu-24.04",
    "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
    "persist-credentials: false",
    "PULL_REQUEST_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name }}",
    "PULL_REQUEST_SOURCE_COMMIT: ${{ github.event.pull_request.head.sha }}",
    "WORKFLOW_SOURCE_COMMIT: ${{ github.sha }}",
    "case \"$GITHUB_EVENT_NAME\" in",
    "test -n \"$PULL_REQUEST_REPOSITORY\"",
    "test \"$PULL_REQUEST_REPOSITORY\" = \"$EXPECTED_REPOSITORY\"",
    "test \"$source_commit\" = \"$expected_source_commit\"",
    "/usr/bin/sudo -n /usr/bin/env -i",
    "/usr/bin/timeout --signal=TERM --kill-after=10s 180s",
    "WELCOME_COINS_PRIVILEGED_SYNTHETIC_GATE=1",
    "server/tests/control-plane-welcome-coins-native-synthetic-runner.test.mjs"
  ]) {
    assert.equal(workflow.includes(requiredValue), true, "workflow must bind " + requiredValue);
  }
  assert.ok(
    workflow.indexOf("Run privileged Welcome Coins custody synthetic gate")
      < workflow.indexOf("Install root dependencies"),
    "privileged gate must run before dependency installation"
  );
  assert.match(
    workflow,
    /\/usr\/bin\/sudo -n \/usr\/bin\/env -i[\s\S]*?\/usr\/bin\/timeout --signal=TERM --kill-after=10s 180s/u
  );
  const gateStep = workflow.slice(gateStart, gateEnd);
  assert.match(gateStep, /process\.versions\.node\.split\("\."\)\[0\]/u);
  assert.doesNotMatch(gateStep, /\bv22\.\d+\.\d+\b|--version\)"\s*=/u);
  assert.doesNotMatch(
    gateStep,
    /\b(?:ssh|scp|rsync|systemctl|systemd-run|nginx|wrangler)\b|\bgit\s+(?:switch|checkout|reset)\b|\bnpm\s+(?:ci|install|test)\b|--apply|--execute-production-mutation|\/opt\/proxy-gateway-minimal-candidate/u,
    "the exact-source-ref synthetic gate must not become a production deployment or pointer mutation"
  );
  assert.doesNotMatch(workflow, /PULL_REQUEST_(?:REPOSITORY|SOURCE_COMMIT):[^\n]*\|\|/u);
  assert.doesNotMatch(workflow, /sudo[^\n]*\bnpm\s+test\b/u);

  const artifactWorkflow = requiredSource(
    DEPENDENCY_ARTIFACT_WORKFLOW_PATH,
    "dependency artifact workflow"
  );
  assert.match(
    artifactWorkflow,
    /- name: Setup exact Node runtime[\s\S]*?\n\s+node-version: 22\.23\.1\s*\n/u,
    "the reproducible native dependency artifact must retain its exact Node runtime"
  );
});

test("privileged custody synthetic gate completes the native protocol", {
  skip: process.env.WELCOME_COINS_PRIVILEGED_SYNTHETIC_GATE !== "1",
  timeout: 150_000
}, () => {
  assert.equal(process.platform, "linux", "privileged gate requires Linux");
  assert.equal(process.geteuid?.(), 0, "privileged gate requires effective uid 0");
  assert.equal(process.getegid?.(), 0, "privileged gate requires effective gid 0");
  assert.equal(existsSync("/usr/bin/gcc"), true, "privileged gate requires fixed gcc");
  assert.equal(existsSync(process.execPath), true, "privileged gate requires exact Node runtime");

  const root = mkdtempSync(resolve(tmpdir(), "gccgw-custody-privileged-"));
  const nodeModulesDirectory = resolve(root, "node_modules");
  const nativeDirectory = resolve(nodeModulesDirectory, ".gccgw-native");
  const scriptsDirectory = resolve(root, "scripts");
  const launcherOutput = resolve(nativeDirectory, "welcome-coins-custody-launcher");
  const bootstrapOutput = resolve(
    nativeDirectory,
    "welcome-coins-post-exec-bootstrap.so"
  );
  const childOutput = resolve(
    scriptsDirectory,
    "control-plane-welcome-coins-activation-transaction-custody-cli.mjs"
  );
  const runnerOutput = resolve(root, "welcome-coins-custody-synthetic-runner");

  try {
    chmodSync(root, 0o755);
    mkdirSync(nodeModulesDirectory, { mode: 0o755 });
    mkdirSync(nativeDirectory, { mode: 0o755 });
    mkdirSync(scriptsDirectory, { mode: 0o755 });
    chmodSync(nodeModulesDirectory, 0o755);
    chmodSync(nativeDirectory, 0o755);
    chmodSync(scriptsDirectory, 0o755);
    copyFileSync(CHILD_PATH, childOutput);
    chmodSync(childOutput, 0o644);

    compileNativeTarget([
      ...WELCOME_COINS_NATIVE_COMMON_FLAGS,
      ...WELCOME_COINS_NATIVE_POST_EXEC_FLAGS,
      POST_EXEC_BOOTSTRAP_PATH,
      "-o",
      bootstrapOutput
    ], "post-exec bootstrap");
    chmodSync(bootstrapOutput, 0o644);

    compileNativeTarget([
      ...WELCOME_COINS_NATIVE_COMMON_FLAGS,
      ...WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
      "-DWELCOME_COINS_SYNTHETIC_DIAGNOSTIC",
      nativeStringDefinition("WELCOME_COINS_SYNTHETIC_NODE_PATH", process.execPath),
      LAUNCHER_PATH,
      "-o",
      launcherOutput
    ], "diagnostic launcher");
    chmodSync(launcherOutput, 0o755);

    compileNativeTarget([
      ...WELCOME_COINS_NATIVE_COMMON_FLAGS,
      ...WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
      nativeStringDefinition("WELCOME_COINS_SYNTHETIC_LAUNCHER_PATH", launcherOutput),
      RUNNER_PATH,
      "-o",
      runnerOutput
    ], "synthetic runner");
    chmodSync(runnerOutput, 0o755);

    const result = spawnSync(runnerOutput, [], {
      cwd: "/",
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      timeout: 90_000,
      maxBuffer: 1024 * 1024
    });
    assert.equal(result.error, undefined, "synthetic runner launch");
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "{\"schemaVersion\":\"1\",\"type\":\"welcome_coins_custody_synthetic\",\"state\":\"verified\",\"condition\":\"synthetic_protocol_complete\"}\n"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("synthetic child consumes commit and release as two bounded FD5 frames", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "gccgw-custody-child-"));
  const capabilityPath = resolve(root, "capability");
  let capability = -1;
  let child;
  const stderr = [];

  try {
    writeFileSync(capabilityPath, "synthetic-capability\n", { mode: 0o400 });
    capability = openSync(capabilityPath, "r");
    child = spawn(process.execPath, [CHILD_PATH], {
      env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" },
      stdio: ["ignore", "ignore", "pipe", capability, "pipe", "pipe"]
    });
    closeSync(capability);
    capability = -1;
    child.stderr.on("data", (bytes) => stderr.push(bytes));

    assert.equal(
      (await readExactStream(child.stdio[4], Buffer.byteLength("synthetic-acquired\n"), "acquired")).toString("utf8"),
      "synthetic-acquired\n"
    );
    child.stdio[5].write("synthetic-commit\n");
    assert.equal(
      (await readExactStream(child.stdio[4], Buffer.byteLength("synthetic-held\n"), "held")).toString("utf8"),
      "synthetic-held\n"
    );
    child.stdio[5].end("synthetic-release\n");

    const [code, signal] = await waitForExit(child, "synthetic child");
    assert.equal(signal, null);
    assert.equal(code, 0);
    assert.equal(Buffer.concat(stderr).toString("utf8"), "");
  } finally {
    if (capability >= 0) closeSync(capability);
    if (child?.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});

test("native status parser rejects nested namespace pid lists", {
  skip: process.platform !== "linux" || !existsSync("/usr/bin/gcc")
}, () => {
  const root = mkdtempSync(resolve(tmpdir(), "gccgw-custody-status-parser-"));
  const harnessPath = resolve(root, "status-parser-harness.c");
  const harnessOutput = resolve(root, "status-parser-harness");

  try {
    writeFileSync(harnessPath, `
#define main welcome_coins_launcher_entrypoint_for_status_parser_test
#include ${JSON.stringify(LAUNCHER_PATH)}
#undef main

int main(void) {
  if (status_one_id_equals("NSpid:\\t4242\\nGroups:\\t65534\\n", "NSpid", 4242UL) != 0) return 1;
  if (status_one_id_equals("NSpid:\\t4242\\t4242\\n", "NSpid", 4242UL) == 0) return 2;
  if (status_one_id_equals("NSpid:\\t4242 4242\\n", "NSpid", 4242UL) == 0) return 3;
  if (status_one_id_equals("NSpid:\\t4243\\n", "NSpid", 4242UL) == 0) return 4;
  if (status_one_id_equals("NSpid:\\t4242junk\\n", "NSpid", 4242UL) == 0) return 5;
  if (status_one_id_equals("Groups:\\t65534\\n", "NSpid", 4242UL) == 0) return 6;
  return 0;
}
`, { mode: 0o600 });
    compileNativeTarget([
      ...WELCOME_COINS_NATIVE_COMMON_FLAGS,
      ...WELCOME_COINS_NATIVE_LAUNCHER_FLAGS,
      harnessPath,
      "-o",
      harnessOutput
    ], "status parser harness");

    const result = spawnSync(harnessOutput, [], {
      cwd: "/",
      encoding: "utf8",
      env: BOUNDED_NATIVE_ENVIRONMENT,
      timeout: 5000,
      maxBuffer: 1024 * 1024
    });
    assert.equal(result.error, undefined, "status parser harness launch");
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("compile-time synthetic diagnostics preserve the public post-exec condition", () => {
  const launcher = requiredSource(
    resolve(REPOSITORY_ROOT, "scripts/native/welcome-coins-custody-launcher.c"),
    "native launcher"
  );
  const main = launcher.slice(launcher.indexOf("int main("));
  const verifyChildProcStart = launcher.indexOf("static int verify_child_proc(");
  const verifyChildProcEnd = launcher.indexOf(
    "\nstatic int verify_stopped_child_liveness(",
    verifyChildProcStart
  );
  assert.notEqual(verifyChildProcStart, -1, "verify_child_proc must exist");
  assert.notEqual(verifyChildProcEnd, -1, "verify_child_proc must have a fixed boundary");
  const verifyChildProc = launcher.slice(verifyChildProcStart, verifyChildProcEnd);

  assert.match(launcher, /#ifdef WELCOME_COINS_SYNTHETIC_DIAGNOSTIC/u);
  assert.match(
    launcher,
    /#ifdef WELCOME_COINS_SYNTHETIC_DIAGNOSTIC[\s\S]*?#ifndef WELCOME_COINS_SYNTHETIC_NODE_PATH[\s\S]*?#define WELCOME_COINS_NODE_PATH WELCOME_COINS_SYNTHETIC_NODE_PATH[\s\S]*?#else\s+#define WELCOME_COINS_NODE_PATH "\/usr\/bin\/node"\s+#endif/u
  );
  assert.match(launcher, /emit_blocked\("post_exec_security_invalid"\)/u);
  assert.match(launcher, /synthetic_post_exec_barrier_invalid/u);
  assert.match(launcher, /synthetic_post_exec_pipe_invalid/u);
  assert.match(launcher, /synthetic_post_exec_ptrace_setoptions_invalid/u);
  assert.match(launcher, /synthetic_post_exec_exec_event_invalid/u);
  assert.match(launcher, /synthetic_post_exec_bootstrap_process_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_identity_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_parent_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_security_invalid/u);
  assert.match(launcher, /synthetic_post_exec_status_namespace_invalid/u);
  assert.equal(
    verifyChildProc.match(/"\/proc\/%ld\/status"/gu)?.length,
    2,
    "verify_child_proc must read and stat the same status inode path"
  );
  assert.match(
    verifyChildProc,
    /if\s*\(\s*snprintf\s*\(\s*path\s*,\s*sizeof\(path\)\s*,\s*"\/proc\/%ld\/status"\s*,\s*\(long\)child\s*\)\s*<=\s*0\s*\|\|\s*stat\s*\(\s*path\s*,\s*&proc_metadata\s*\)\s*!=\s*0\s*\|\|\s*proc_metadata\.st_uid\s*!=\s*0U\s*\|\|\s*proc_metadata\.st_gid\s*!=\s*0U\s*\)\s*\{\s*record_synthetic_post_exec_stage\s*\(\s*"synthetic_post_exec_status_proc_invalid"\s*\)\s*;\s*return\s+-1\s*;\s*\}/u
  );
  assert.doesNotMatch(verifyChildProc, /"\/proc\/%ld"/u);
  assert.match(
    verifyChildProc,
    /if\s*\(\s*status_one_id_equals\s*\(\s*status\s*,\s*"NSpid"\s*,\s*\(unsigned long\)child\s*\)\s*!=\s*0\s*\)\s*\{\s*record_synthetic_post_exec_stage\s*\(\s*"synthetic_post_exec_status_namespace_invalid"\s*\)\s*;\s*return\s+-1\s*;\s*\}/u
  );
  assert.doesNotMatch(launcher, /strchr\s*\(\s*namespace_pid\s*,\s*'\\t'\s*\)/u);
  assert.doesNotMatch(
    launcher,
    /\b(?:strerror|perror|fprintf)\s*\(/u
  );
  assert.match(
    main,
    /if\s*\(\s*establish_exec_barrier[\s\S]*?emit_post_exec_security_invalid/u
  );
  assert.match(
    main,
    /fstat\s*\(\s*acquired_pipe\[1\][\s\S]*?emit_post_exec_security_invalid/u
  );
});
