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
  processRelease: "release-002",
  restartCount: 4
});

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
    expectedProcessSeen: true,
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
    "--restart-baseline", "4",
    "--local-health-url", "http://127.0.0.1:3456/api/health",
    "--public-health-url", "https://portal.gccwebos.com/api/health"
  ]);

  assert.equal(parsed.expectedRelease, "release-002");
  assert.equal(parsed.restartBaseline, 4);
  assert.throws(
    () => parsePromotionHealthGateArgs([
      "--expected-release", "release-002",
      "--restart-baseline", "4",
      "--local-health-url", "http://example.com/api/health",
      "--public-health-url", "https://portal.gccwebos.com/api/health"
    ]),
    /promotion_health_gate_input_invalid/
  );
  assert.throws(
    () => parsePromotionHealthGateArgs([
      "--expected-release", "release-002",
      "--restart-baseline", "4",
      "--local-health-url", "http://127.0.0.1:3456/api/health",
      "--public-health-url", "https://other.example/api/health"
    ]),
    /promotion_health_gate_input_invalid/
  );
});

test("promotion gate reads only the fixed systemd runtime identity fields", async () => {
  let observedCommand = null;
  const state = await readControlPlaneRuntimeState({
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
    readProcessCwd: () => "/opt/proxy-gateway-minimal-candidate/releases/release-002"
  });

  assert.deepEqual(state, READY_RUNTIME);
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
});

test("promotion gate CLI rejects unsafe input without echoing it", async () => {
  let stdout = "";
  let stderr = "";

  const exitCode = await runPromotionHealthGateCli({
    argv: [
      "--expected-release", "release-002",
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
});
