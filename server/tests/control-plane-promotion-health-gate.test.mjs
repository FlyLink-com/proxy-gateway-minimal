import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  parsePromotionHealthGateArgs,
  readControlPlaneRuntimeState,
  runPromotionHealthGate,
  runPromotionHealthGateCli
} from "../../scripts/control-plane-promotion-health-gate.mjs";

const SCRIPT_PATH = resolve("scripts/control-plane-promotion-health-gate.mjs");

function createHarness({
  runtimeStates = [],
  localStatuses = [],
  publicStatuses = []
} = {}) {
  let nowMs = 0;
  let runtimeIndex = 0;
  let localIndex = 0;
  let publicIndex = 0;

  return {
    now: () => nowMs,
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    readRuntimeState: async () => runtimeStates[
      Math.min(runtimeIndex++, Math.max(0, runtimeStates.length - 1))
    ],
    probeLocalHealth: async () => localStatuses[
      Math.min(localIndex++, Math.max(0, localStatuses.length - 1))
    ],
    probePublicHealth: async () => publicStatuses[
      Math.min(publicIndex++, Math.max(0, publicStatuses.length - 1))
    ],
    counts: () => ({
      runtime: runtimeIndex,
      local: localIndex,
      public: publicIndex
    })
  };
}

const READY_RUNTIME = Object.freeze({
  active: true,
  substate: "running",
  currentPointerMatchesExpected: true,
  processCwdMatchesExpected: true,
  restartCount: 4
});

const EXPECTED_RELEASE_PATH = "/opt/proxy-gateway-minimal-candidate/releases/release-002";
const CURRENT_LINK_PATH = "/opt/proxy-gateway-minimal-candidate/current";

test("promotion gate tolerates an initial 502 and requires consecutive readiness", async () => {
  const harness = createHarness({
    runtimeStates: [READY_RUNTIME],
    localStatuses: [502, 200, 200, 200, 200, 200],
    publicStatuses: [503, 200, 200]
  });

  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 10_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 3,
    requiredPublicSuccesses: 2,
    ...harness
  });

  assert.equal(result.state, "validated");
  assert.equal(result.condition, "ok");
  assert.equal(result.attemptCount, 6);
  assert.equal(result.elapsedMs, 5_000);
  assert.deepEqual(result.runtime, {
    activeSeen: true,
    currentPointerMatchesExpected: true,
    processCwdMatchesExpected: true,
    restartCountDelta: 0
  });
  assert.deepEqual(result.local, {
    attemptCount: 6,
    successCount: 5,
    consecutiveSuccesses: 5,
    firstStatus: 502,
    finalStatus: 200,
    firstSuccessMs: 1_000
  });
  assert.deepEqual(result.public, {
    attemptCount: 3,
    successCount: 2,
    consecutiveSuccesses: 2,
    firstStatus: 503,
    finalStatus: 200,
    firstSuccessMs: 4_000
  });
});

test("promotion gate rejects restart-count growth before probing health", async () => {
  const harness = createHarness({
    runtimeStates: [{ ...READY_RUNTIME, restartCount: 5 }],
    localStatuses: [200],
    publicStatuses: [200]
  });

  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 10_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 3,
    requiredPublicSuccesses: 2,
    ...harness
  });

  assert.equal(result.state, "rejected");
  assert.equal(result.condition, "restart_count_changed");
  assert.equal(result.runtime.restartCountDelta, 1);
  assert.deepEqual(harness.counts(), { runtime: 1, local: 0, public: 0 });
});

test("promotion gate rejects a matching release name without the exact current pointer", async () => {
  const harness = createHarness({
    runtimeStates: [{ ...READY_RUNTIME, currentPointerMatchesExpected: false }],
    localStatuses: [200],
    publicStatuses: [200]
  });

  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 2_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 1,
    requiredPublicSuccesses: 1,
    ...harness
  });

  assert.equal(result.state, "timeout");
  assert.equal(result.condition, "current_pointer_not_ready");
  assert.deepEqual(result.runtime, {
    activeSeen: true,
    currentPointerMatchesExpected: false,
    processCwdMatchesExpected: true,
    restartCountDelta: 0
  });
  assert.deepEqual(harness.counts(), { runtime: 2, local: 0, public: 0 });
});

test("promotion gate rejects a matching release name without the exact process cwd", async () => {
  const harness = createHarness({
    runtimeStates: [{ ...READY_RUNTIME, processCwdMatchesExpected: false }],
    localStatuses: [200],
    publicStatuses: [200]
  });

  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 2_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 1,
    requiredPublicSuccesses: 1,
    ...harness
  });

  assert.equal(result.state, "timeout");
  assert.equal(result.condition, "process_cwd_not_ready");
  assert.deepEqual(result.runtime, {
    activeSeen: true,
    currentPointerMatchesExpected: true,
    processCwdMatchesExpected: false,
    restartCountDelta: 0
  });
  assert.deepEqual(harness.counts(), { runtime: 2, local: 0, public: 0 });
});

test("promotion gate resets public readiness when loopback health regresses", async () => {
  const harness = createHarness({
    runtimeStates: [READY_RUNTIME],
    localStatuses: [200, 200, 200, 502, 200, 200, 200, 200],
    publicStatuses: [200, 200, 200]
  });

  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 10_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 3,
    requiredPublicSuccesses: 2,
    ...harness
  });

  assert.equal(result.state, "validated");
  assert.equal(result.attemptCount, 8);
  assert.equal(result.public.attemptCount, 3);
  assert.equal(result.public.successCount, 3);
  assert.equal(result.public.consecutiveSuccesses, 2);
});

test("promotion gate elapsed time includes completed probe duration", async () => {
  let nowMs = 0;
  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 10_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 1,
    requiredPublicSuccesses: 1,
    readRuntimeState: async () => READY_RUNTIME,
    probeLocalHealth: async () => {
      nowMs += 300;
      return 200;
    },
    probePublicHealth: async () => {
      nowMs += 700;
      return 200;
    },
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    now: () => nowMs
  });

  assert.equal(result.state, "validated");
  assert.equal(result.elapsedMs, 1_000);
  assert.equal(result.local.firstSuccessMs, 300);
  assert.equal(result.public.firstSuccessMs, 1_000);
});

test("promotion gate never accepts readiness completed after the deadline", async () => {
  let nowMs = 0;
  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 1_000,
    intervalMs: 100,
    requiredLocalSuccesses: 1,
    requiredPublicSuccesses: 1,
    readRuntimeState: async () => READY_RUNTIME,
    probeLocalHealth: async () => {
      nowMs += 600;
      return 200;
    },
    probePublicHealth: async () => {
      nowMs += 600;
      return 200;
    },
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    now: () => nowMs
  });

  assert.equal(result.state, "timeout");
  assert.equal(result.condition, "deadline_exceeded");
  assert.equal(result.elapsedMs, 1_200);
});

test("promotion gate caps every runtime and HTTP probe to the remaining budget", async () => {
  let nowMs = 0;
  const runtimeBudgets = [];
  const localBudgets = [];
  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 1_000,
    intervalMs: 900,
    probeTimeoutMs: 500,
    requiredLocalSuccesses: 3,
    requiredPublicSuccesses: 2,
    readRuntimeState: async ({ timeoutMs }) => {
      runtimeBudgets.push(timeoutMs);
      return READY_RUNTIME;
    },
    probeLocalHealth: async ({ timeoutMs }) => {
      localBudgets.push(timeoutMs);
      if (localBudgets.length === 2) nowMs += timeoutMs;
      return 502;
    },
    probePublicHealth: async () => {
      throw new Error("public probe must not run before loopback readiness");
    },
    sleep: async (milliseconds) => {
      nowMs += milliseconds;
    },
    now: () => nowMs
  });

  assert.equal(result.state, "timeout");
  assert.deepEqual(runtimeBudgets, [500, 100]);
  assert.deepEqual(localBudgets, [500, 100]);
  assert.equal(result.elapsedMs, 1_000);
});

test("promotion gate times out without exposing probe errors or URLs", async () => {
  const secretError = new Error("private upstream response body and token");
  const harness = createHarness({
    runtimeStates: [READY_RUNTIME],
    localStatuses: [
      { status: null, error: secretError },
      { status: 502, error: secretError }
    ],
    publicStatuses: [200]
  });

  const result = await runPromotionHealthGate({
    expectedRelease: "release-002",
    restartBaseline: 4,
    timeoutMs: 3_000,
    intervalMs: 1_000,
    requiredLocalSuccesses: 3,
    requiredPublicSuccesses: 2,
    ...harness
  });

  assert.equal(result.state, "timeout");
  assert.equal(result.condition, "local_health_not_ready");
  assert.equal(result.public.attemptCount, 0);
  assert.equal(JSON.stringify(result).includes("private upstream"), false);
  assert.equal(JSON.stringify(result).includes("token"), false);
  assert.equal(JSON.stringify(result).includes("http"), false);
});

test("promotion gate validates loopback and public health URL boundaries", () => {
  const parsed = parsePromotionHealthGateArgs([
    "--expected-release", "release-002",
    "--expected-release-path", EXPECTED_RELEASE_PATH,
    "--current-link", CURRENT_LINK_PATH,
    "--restart-baseline", "4",
    "--local-health-url", "http://127.0.0.1:3456/api/health",
    "--public-health-url", "https://portal.gccwebos.com/api/health"
  ]);

  assert.equal(parsed.expectedRelease, "release-002");
  assert.equal(parsed.expectedReleasePath, EXPECTED_RELEASE_PATH);
  assert.equal(parsed.currentLinkPath, CURRENT_LINK_PATH);
  assert.equal(parsed.restartBaseline, 4);
  assert.throws(
    () => parsePromotionHealthGateArgs([
      "--expected-release", "release-002",
      "--expected-release-path", EXPECTED_RELEASE_PATH,
      "--current-link", CURRENT_LINK_PATH,
      "--restart-baseline", "4",
      "--local-health-url", "http://example.com/api/health",
      "--public-health-url", "https://portal.gccwebos.com/api/health"
    ]),
    /promotion_health_gate_input_invalid/
  );
  assert.throws(
    () => parsePromotionHealthGateArgs([
      "--expected-release", "release-002",
      "--expected-release-path", EXPECTED_RELEASE_PATH,
      "--current-link", CURRENT_LINK_PATH,
      "--restart-baseline", "4",
      "--local-health-url", "http://127.0.0.1:3456/api/health",
      "--public-health-url", "https://other.example/api/health"
    ]),
    /promotion_health_gate_input_invalid/
  );
  assert.throws(
    () => parsePromotionHealthGateArgs([
      "--expected-release", "release-002",
      "--expected-release-path", "/opt/proxy-gateway-minimal-candidate/releases/release-003",
      "--current-link", CURRENT_LINK_PATH
    ]),
    /promotion_health_gate_input_invalid/
  );
  assert.throws(
    () => parsePromotionHealthGateArgs([
      "--expected-release", "release-002",
      "--expected-release-path", EXPECTED_RELEASE_PATH,
      "--current-link", "relative/current"
    ]),
    /promotion_health_gate_input_invalid/
  );
});

test("promotion gate reads only the fixed systemd runtime identity fields", async () => {
  let observedCommand = null;
  const observedLstatInputs = [];
  const observedRealpathInputs = [];
  const state = await readControlPlaneRuntimeState({
    expectedRelease: "release-002",
    expectedReleasePath: EXPECTED_RELEASE_PATH,
    currentLinkPath: CURRENT_LINK_PATH,
    commandRunner: async (command, args) => {
      observedCommand = { command, args };
      return {
        ok: true,
        stdout: [
          "ActiveState=active",
          "SubState=running",
          "MainPID=321",
          "NRestarts=4"
        ].join("\n")
      };
    },
    readProcessCwd: () => EXPECTED_RELEASE_PATH,
    lstatPath: (path) => {
      observedLstatInputs.push(path);
      if (path === EXPECTED_RELEASE_PATH) {
        return {
          isSymbolicLink: () => false,
          isDirectory: () => true
        };
      }
      assert.equal(path, CURRENT_LINK_PATH);
      return {
        isSymbolicLink: () => true,
        isDirectory: () => false
      };
    },
    realpathPath: (path) => {
      observedRealpathInputs.push(path);
      if (path === EXPECTED_RELEASE_PATH || path === CURRENT_LINK_PATH) {
        return EXPECTED_RELEASE_PATH;
      }
      throw new Error("unexpected path");
    }
  });

  assert.deepEqual(state, READY_RUNTIME);
  assert.deepEqual(observedLstatInputs, [EXPECTED_RELEASE_PATH, CURRENT_LINK_PATH]);
  assert.deepEqual(observedRealpathInputs, [
    EXPECTED_RELEASE_PATH,
    CURRENT_LINK_PATH,
    EXPECTED_RELEASE_PATH
  ]);
  assert.equal(JSON.stringify(state).includes("/opt/"), false);
  assert.equal(observedCommand.command, "systemctl");
  assert.deepEqual(observedCommand.args, [
    "show",
    "proxy-gateway-candidate.service",
    "--property=ActiveState",
    "--property=SubState",
    "--property=MainPID",
    "--property=NRestarts"
  ]);
});

test("promotion gate rejects same-basename pointer and cwd paths from another release root", async () => {
  const observedPaths = [];
  const state = await readControlPlaneRuntimeState({
    expectedRelease: "release-002",
    expectedReleasePath: EXPECTED_RELEASE_PATH,
    currentLinkPath: CURRENT_LINK_PATH,
    commandRunner: async () => ({
      ok: true,
      stdout: [
        "ActiveState=active",
        "SubState=running",
        "MainPID=321",
        "NRestarts=4"
      ].join("\n")
    }),
    readProcessCwd: () => "/srv/other/releases/release-002",
    lstatPath: (path) => path === EXPECTED_RELEASE_PATH
      ? {
        isSymbolicLink: () => false,
        isDirectory: () => true
      }
      : {
        isSymbolicLink: () => true,
        isDirectory: () => false
      },
    realpathPath: (path) => {
      observedPaths.push(path);
      if (path === EXPECTED_RELEASE_PATH) return EXPECTED_RELEASE_PATH;
      if (path === CURRENT_LINK_PATH) return "/srv/other/releases/release-002";
      if (path === "/srv/other/releases/release-002") return "/srv/other/releases/release-002";
      throw new Error("unexpected path");
    }
  });

  assert.deepEqual(state, {
    active: true,
    substate: "running",
    currentPointerMatchesExpected: false,
    processCwdMatchesExpected: false,
    restartCount: 4
  });
  assert.deepEqual(observedPaths, [
    EXPECTED_RELEASE_PATH,
    CURRENT_LINK_PATH,
    "/srv/other/releases/release-002"
  ]);
  assert.equal(JSON.stringify(state).includes("/srv/"), false);
});

test("promotion gate rejects a same-name expected candidate symlink", async () => {
  let currentLinkRead = false;
  let processCwdRead = false;
  const state = await readControlPlaneRuntimeState({
    expectedRelease: "release-002",
    expectedReleasePath: EXPECTED_RELEASE_PATH,
    currentLinkPath: CURRENT_LINK_PATH,
    commandRunner: async () => ({
      ok: true,
      stdout: [
        "ActiveState=active",
        "SubState=running",
        "MainPID=321",
        "NRestarts=4"
      ].join("\n")
    }),
    readProcessCwd: () => {
      processCwdRead = true;
      return EXPECTED_RELEASE_PATH;
    },
    lstatPath: (path) => {
      assert.equal(path, EXPECTED_RELEASE_PATH);
      return {
        isSymbolicLink: () => true,
        isDirectory: () => false
      };
    },
    realpathPath: () => {
      currentLinkRead = true;
      return "/srv/releases/release-002";
    }
  });

  assert.deepEqual(state, {
    active: true,
    substate: "running",
    currentPointerMatchesExpected: false,
    processCwdMatchesExpected: false,
    restartCount: 4
  });
  assert.equal(currentLinkRead, false);
  assert.equal(processCwdRead, false);
});

test("promotion gate rejects an expected directory whose resolved basename differs", async () => {
  let currentLinkRead = false;
  let processCwdRead = false;
  const state = await readControlPlaneRuntimeState({
    expectedRelease: "release-002",
    expectedReleasePath: EXPECTED_RELEASE_PATH,
    currentLinkPath: CURRENT_LINK_PATH,
    commandRunner: async () => ({
      ok: true,
      stdout: [
        "ActiveState=active",
        "SubState=running",
        "MainPID=321",
        "NRestarts=4"
      ].join("\n")
    }),
    readProcessCwd: () => {
      processCwdRead = true;
      return EXPECTED_RELEASE_PATH;
    },
    lstatPath: (path) => {
      assert.equal(path, EXPECTED_RELEASE_PATH);
      return {
        isSymbolicLink: () => false,
        isDirectory: () => true
      };
    },
    realpathPath: (path) => {
      assert.equal(path, EXPECTED_RELEASE_PATH);
      currentLinkRead = true;
      return "/srv/releases/release-001";
    }
  });

  assert.deepEqual(state, {
    active: true,
    substate: "running",
    currentPointerMatchesExpected: false,
    processCwdMatchesExpected: false,
    restartCount: 4
  });
  assert.equal(currentLinkRead, true);
  assert.equal(processCwdRead, false);
});

test("promotion gate rejects a same-name expected candidate behind a symlinked ancestor", async () => {
  let currentLinkRead = false;
  let processCwdRead = false;
  const state = await readControlPlaneRuntimeState({
    expectedRelease: "release-002",
    expectedReleasePath: EXPECTED_RELEASE_PATH,
    currentLinkPath: CURRENT_LINK_PATH,
    commandRunner: async () => ({
      ok: true,
      stdout: [
        "ActiveState=active",
        "SubState=running",
        "MainPID=321",
        "NRestarts=4"
      ].join("\n")
    }),
    readProcessCwd: () => {
      processCwdRead = true;
      return EXPECTED_RELEASE_PATH;
    },
    lstatPath: (path) => {
      assert.equal(path, EXPECTED_RELEASE_PATH);
      return {
        isSymbolicLink: () => false,
        isDirectory: () => true
      };
    },
    realpathPath: (path) => {
      assert.equal(path, EXPECTED_RELEASE_PATH);
      currentLinkRead = true;
      return "/srv/external/releases/release-002";
    }
  });

  assert.deepEqual(state, {
    active: true,
    substate: "running",
    currentPointerMatchesExpected: false,
    processCwdMatchesExpected: false,
    restartCount: 4
  });
  assert.equal(currentLinkRead, true);
  assert.equal(processCwdRead, false);
});

test("promotion gate CLI emits only redacted evidence", async () => {
  let stdout = "";
  let stderr = "";
  const harness = createHarness({
    runtimeStates: [READY_RUNTIME],
    localStatuses: [200],
    publicStatuses: [200]
  });

  const exitCode = await runPromotionHealthGateCli({
    argv: [
      "--expected-release", "release-002",
      "--expected-release-path", EXPECTED_RELEASE_PATH,
      "--current-link", CURRENT_LINK_PATH,
      "--restart-baseline", "4",
      "--local-health-url", "http://127.0.0.1:3456/api/health",
      "--public-health-url", "https://portal.gccwebos.com/api/health",
      "--local-successes", "1",
      "--public-successes", "1"
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
    dependencies: harness
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).state, "validated");
  assert.equal(stdout.includes("127.0.0.1"), false);
  assert.equal(stdout.includes("portal.gccwebos.com"), false);
  assert.equal(stdout.includes(EXPECTED_RELEASE_PATH), false);
  assert.equal(stdout.includes(CURRENT_LINK_PATH), false);
});

test("promotion gate CLI rejects unsafe input without echoing it", async () => {
  let stdout = "";
  let stderr = "";

  const exitCode = await runPromotionHealthGateCli({
    argv: [
      "--expected-release", "release-002",
      "--expected-release-path", EXPECTED_RELEASE_PATH,
      "--current-link", CURRENT_LINK_PATH,
      "--restart-baseline", "4",
      "--local-health-url", "http://unsafe.example/private?token=secret",
      "--public-health-url", "https://portal.gccwebos.com/api/health"
    ],
    stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } }
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout, "");
  assert.deepEqual(JSON.parse(stderr), {
    schemaVersion: "1",
    type: "control_plane_promotion_health_gate",
    state: "error",
    condition: "invalid_input"
  });
  assert.equal(stderr.includes("unsafe.example"), false);
  assert.equal(stderr.includes("secret"), false);
});

test("promotion gate is standalone and executes when streamed through node stdin", () => {
  const scriptSource = readFileSync(SCRIPT_PATH, "utf8");
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: scriptSource,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    schemaVersion: "1",
    type: "control_plane_promotion_health_gate",
    state: "error",
    condition: "invalid_input"
  });
  assert.doesNotMatch(scriptSource, /from "\.\.\/server\//);
});

test("package and deployment runbook expose the read-only promotion gate", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  const runbook = readFileSync(resolve("docs/GITHUB_DEPLOYMENT_RUNBOOK.md"), "utf8");

  assert.equal(
    packageJson.scripts["promotion:health-gate"],
    "node scripts/control-plane-promotion-health-gate.mjs"
  );
  assert.match(runbook, /condition-driven promotion health window/i);
  assert.match(runbook, /does not switch a release,\s+restart a\s+service,\s+or perform rollback/i);
  assert.match(runbook, /streamed through Node stdin/i);
  assert.match(runbook, /remaining deadline\s+budget/i);
  assert.match(runbook, /expected-release-path/i);
  assert.match(runbook, /current-link/i);
  assert.match(runbook, /full resolved path/i);
  assert.match(runbook, /not a\s+symlink/i);
  assert.match(runbook, /no ancestor may be\s+a symlink/i);
  assert.match(runbook, /resolved basename must exactly equal/i);
  assert.match(runbook, /new reviewed artifact/i);
});
