#!/usr/bin/env node
import { spawn } from "node:child_process";
import { lstatSync, readlinkSync, realpathSync } from "node:fs";
import { posix, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = "proxy-gateway-candidate.service";
const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const PUBLIC_HOST = "portal.gccwebos.com";

export const PROMOTION_HEALTH_GATE_DEFAULTS = Object.freeze({
  timeoutMs: 60_000,
  intervalMs: 2_000,
  probeTimeoutMs: 5_000,
  requiredLocalSuccesses: 3,
  requiredPublicSuccesses: 2
});

function runCommand(command, args, { timeoutMs, maxOutput }) {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-maxOutput);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-maxOutput);
    });
    child.on("error", () => {
      clearTimeout(timeout);
      resolveCommand({ ok: false, stdout: "", stderr: "", timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveCommand({
        ok: code === 0 && !timedOut,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut
      });
    });
  });
}

function inputError() {
  return new Error("promotion_health_gate_input_invalid");
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

function requiredText(argv, name) {
  const value = String(argValue(argv, name) ?? "").trim();
  if (!value) throw inputError();
  return value;
}

function requiredLinuxAbsolutePath(argv, name) {
  const value = requiredText(argv, name);
  if (
    value.includes("\0")
    || value === "/"
    || !value.startsWith("/")
    || value.endsWith("/")
    || posix.normalize(value) !== value
  ) {
    throw inputError();
  }
  return value;
}

function integerArg(argv, name, fallback, { min, max }) {
  const raw = argValue(argv, name);
  if (raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw inputError();
  return value;
}

function healthUrl(raw, kind) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw inputError();
  }
  if (
    parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== "/api/health"
  ) {
    throw inputError();
  }
  if (kind === "local") {
    if (parsed.protocol !== "http:" || !LOCAL_HOSTS.has(parsed.hostname)) {
      throw inputError();
    }
  } else if (parsed.protocol !== "https:" || parsed.hostname !== PUBLIC_HOST) {
    throw inputError();
  }
  return parsed.toString();
}

export function parsePromotionHealthGateArgs(argv = []) {
  const expectedRelease = requiredText(argv, "--expected-release");
  if (!RELEASE_PATTERN.test(expectedRelease)) throw inputError();
  const expectedReleasePath = requiredLinuxAbsolutePath(argv, "--expected-release-path");
  const currentLinkPath = requiredLinuxAbsolutePath(argv, "--current-link");
  if (
    posix.basename(expectedReleasePath) !== expectedRelease
    || posix.basename(currentLinkPath) !== "current"
  ) {
    throw inputError();
  }
  const restartBaseline = integerArg(argv, "--restart-baseline", null, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER
  });
  if (restartBaseline === null) throw inputError();
  const timeoutMs = integerArg(
    argv,
    "--timeout-ms",
    PROMOTION_HEALTH_GATE_DEFAULTS.timeoutMs,
    { min: 5_000, max: 300_000 }
  );
  const intervalMs = integerArg(
    argv,
    "--interval-ms",
    PROMOTION_HEALTH_GATE_DEFAULTS.intervalMs,
    { min: 100, max: 30_000 }
  );
  if (intervalMs > timeoutMs) throw inputError();

  return {
    expectedRelease,
    expectedReleasePath,
    currentLinkPath,
    restartBaseline,
    localHealthUrl: healthUrl(requiredText(argv, "--local-health-url"), "local"),
    publicHealthUrl: healthUrl(requiredText(argv, "--public-health-url"), "public"),
    timeoutMs,
    intervalMs,
    probeTimeoutMs: integerArg(
      argv,
      "--probe-timeout-ms",
      PROMOTION_HEALTH_GATE_DEFAULTS.probeTimeoutMs,
      { min: 100, max: 30_000 }
    ),
    requiredLocalSuccesses: integerArg(
      argv,
      "--local-successes",
      PROMOTION_HEALTH_GATE_DEFAULTS.requiredLocalSuccesses,
      { min: 1, max: 10 }
    ),
    requiredPublicSuccesses: integerArg(
      argv,
      "--public-successes",
      PROMOTION_HEALTH_GATE_DEFAULTS.requiredPublicSuccesses,
      { min: 1, max: 10 }
    )
  };
}

function emptyProbeEvidence() {
  return {
    attemptCount: 0,
    successCount: 0,
    consecutiveSuccesses: 0,
    firstStatus: null,
    finalStatus: null,
    firstSuccessMs: null
  };
}

function probeStatus(value) {
  const status = typeof value === "number" ? value : value?.status;
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function recordProbe(evidence, status, elapsedMs) {
  evidence.attemptCount += 1;
  if (evidence.attemptCount === 1) evidence.firstStatus = status;
  evidence.finalStatus = status;
  if (status === 200) {
    evidence.successCount += 1;
    evidence.consecutiveSuccesses += 1;
    if (evidence.firstSuccessMs === null) evidence.firstSuccessMs = elapsedMs;
  } else {
    evidence.consecutiveSuccesses = 0;
  }
}

function resultShape({
  state,
  condition,
  expectedRelease,
  attemptCount,
  elapsedMs,
  runtime,
  local,
  publicEvidence
}) {
  return {
    schemaVersion: "1",
    type: "control_plane_promotion_health_gate",
    state,
    condition,
    expectedRelease,
    attemptCount,
    elapsedMs,
    runtime,
    local,
    public: publicEvidence
  };
}

function timeoutCondition(runtime, local, requiredLocalSuccesses) {
  if (!runtime.activeSeen) return "runtime_not_ready";
  if (!runtime.currentPointerMatchesExpected) return "current_pointer_not_ready";
  if (!runtime.processCwdMatchesExpected) return "process_cwd_not_ready";
  if (local.consecutiveSuccesses < requiredLocalSuccesses) return "local_health_not_ready";
  return "public_health_not_ready";
}

export async function runPromotionHealthGate({
  expectedRelease,
  restartBaseline,
  timeoutMs = PROMOTION_HEALTH_GATE_DEFAULTS.timeoutMs,
  intervalMs = PROMOTION_HEALTH_GATE_DEFAULTS.intervalMs,
  probeTimeoutMs = PROMOTION_HEALTH_GATE_DEFAULTS.probeTimeoutMs,
  requiredLocalSuccesses = PROMOTION_HEALTH_GATE_DEFAULTS.requiredLocalSuccesses,
  requiredPublicSuccesses = PROMOTION_HEALTH_GATE_DEFAULTS.requiredPublicSuccesses,
  readRuntimeState,
  probeLocalHealth,
  probePublicHealth,
  sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  now = () => performance.now()
} = {}) {
  if (
    !RELEASE_PATTERN.test(String(expectedRelease ?? ""))
    || !Number.isInteger(restartBaseline)
    || restartBaseline < 0
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1
    || !Number.isInteger(intervalMs)
    || intervalMs < 1
    || !Number.isInteger(probeTimeoutMs)
    || probeTimeoutMs < 1
    || typeof readRuntimeState !== "function"
    || typeof probeLocalHealth !== "function"
    || typeof probePublicHealth !== "function"
    || typeof sleep !== "function"
    || typeof now !== "function"
  ) {
    throw inputError();
  }

  const startedAt = now();
  const runtimeEvidence = {
    activeSeen: false,
    currentPointerMatchesExpected: false,
    processCwdMatchesExpected: false,
    restartCountDelta: 0
  };
  const localEvidence = emptyProbeEvidence();
  const publicEvidence = emptyProbeEvidence();
  let attemptCount = 0;

  while (true) {
    attemptCount += 1;
    const elapsedMs = Math.max(0, Math.round(now() - startedAt));
    const runtimeBudgetMs = Math.min(probeTimeoutMs, timeoutMs - elapsedMs);
    if (runtimeBudgetMs <= 0) {
      return resultShape({
        state: "timeout",
        condition: timeoutCondition(
          runtimeEvidence,
          localEvidence,
          requiredLocalSuccesses
        ),
        expectedRelease,
        attemptCount,
        elapsedMs,
        runtime: runtimeEvidence,
        local: localEvidence,
        publicEvidence
      });
    }
    let runtimeState = null;
    try {
      runtimeState = await readRuntimeState({ timeoutMs: runtimeBudgetMs });
    } catch {
      runtimeState = null;
    }
    const restartCount = Number.isInteger(runtimeState?.restartCount)
      ? runtimeState.restartCount
      : null;
    const restartCountDelta = restartCount === null ? 0 : restartCount - restartBaseline;
    runtimeEvidence.restartCountDelta = restartCountDelta;
    runtimeEvidence.activeSeen ||= runtimeState?.active === true;
    runtimeEvidence.currentPointerMatchesExpected = runtimeState?.currentPointerMatchesExpected === true;
    runtimeEvidence.processCwdMatchesExpected = runtimeState?.processCwdMatchesExpected === true;

    if (restartCount !== null && restartCountDelta !== 0) {
      return resultShape({
        state: "rejected",
        condition: "restart_count_changed",
        expectedRelease,
        attemptCount,
        elapsedMs,
        runtime: runtimeEvidence,
        local: localEvidence,
        publicEvidence
      });
    }

    const runtimeElapsedMs = Math.max(0, Math.round(now() - startedAt));
    if (runtimeElapsedMs > timeoutMs) {
      return resultShape({
        state: "timeout",
        condition: "deadline_exceeded",
        expectedRelease,
        attemptCount,
        elapsedMs: runtimeElapsedMs,
        runtime: runtimeEvidence,
        local: localEvidence,
        publicEvidence
      });
    }

    const runtimeReady = runtimeState?.active === true
      && runtimeState?.substate === "running"
      && runtimeState?.currentPointerMatchesExpected === true
      && runtimeState?.processCwdMatchesExpected === true
      && restartCount === restartBaseline;

    if (runtimeReady) {
      const localBudgetMs = Math.min(probeTimeoutMs, timeoutMs - runtimeElapsedMs);
      if (localBudgetMs <= 0) {
        return resultShape({
          state: "timeout",
          condition: "local_health_not_ready",
          expectedRelease,
          attemptCount,
          elapsedMs: runtimeElapsedMs,
          runtime: runtimeEvidence,
          local: localEvidence,
          publicEvidence
        });
      }
      let localStatus = null;
      try {
        localStatus = probeStatus(await probeLocalHealth({ timeoutMs: localBudgetMs }));
      } catch {
        localStatus = null;
      }
      const localElapsedMs = Math.max(0, Math.round(now() - startedAt));
      recordProbe(localEvidence, localStatus, localElapsedMs);
      if (localStatus !== 200) publicEvidence.consecutiveSuccesses = 0;
      if (localElapsedMs > timeoutMs) {
        return resultShape({
          state: "timeout",
          condition: "deadline_exceeded",
          expectedRelease,
          attemptCount,
          elapsedMs: localElapsedMs,
          runtime: runtimeEvidence,
          local: localEvidence,
          publicEvidence
        });
      }

      if (localEvidence.consecutiveSuccesses >= requiredLocalSuccesses) {
        const publicBudgetMs = Math.min(probeTimeoutMs, timeoutMs - localElapsedMs);
        if (publicBudgetMs <= 0) {
          return resultShape({
            state: "timeout",
            condition: "public_health_not_ready",
            expectedRelease,
            attemptCount,
            elapsedMs: localElapsedMs,
            runtime: runtimeEvidence,
            local: localEvidence,
            publicEvidence
          });
        }
        let publicStatus = null;
        try {
          publicStatus = probeStatus(await probePublicHealth({ timeoutMs: publicBudgetMs }));
        } catch {
          publicStatus = null;
        }
        const publicElapsedMs = Math.max(0, Math.round(now() - startedAt));
        recordProbe(publicEvidence, publicStatus, publicElapsedMs);
        if (publicElapsedMs > timeoutMs) {
          return resultShape({
            state: "timeout",
            condition: "deadline_exceeded",
            expectedRelease,
            attemptCount,
            elapsedMs: publicElapsedMs,
            runtime: runtimeEvidence,
            local: localEvidence,
            publicEvidence
          });
        }
        if (publicEvidence.consecutiveSuccesses >= requiredPublicSuccesses) {
          return resultShape({
            state: "validated",
            condition: "ok",
            expectedRelease,
            attemptCount,
            elapsedMs: publicElapsedMs,
            runtime: runtimeEvidence,
            local: localEvidence,
            publicEvidence
          });
        }
      }
    } else {
      localEvidence.consecutiveSuccesses = 0;
      publicEvidence.consecutiveSuccesses = 0;
    }

    const afterAttemptMs = Math.max(0, Math.round(now() - startedAt));
    if (afterAttemptMs >= timeoutMs) {
      return resultShape({
        state: "timeout",
        condition: timeoutCondition(
          runtimeEvidence,
          localEvidence,
          requiredLocalSuccesses
        ),
        expectedRelease,
        attemptCount,
        elapsedMs: afterAttemptMs,
        runtime: runtimeEvidence,
        local: localEvidence,
        publicEvidence
      });
    }
    await sleep(Math.min(intervalMs, timeoutMs - afterAttemptMs));
  }
}

function parseSystemdProperties(output) {
  return Object.fromEntries(
    String(output ?? "")
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function resolveReleaseIdentity({
  expectedRelease,
  expectedReleasePath,
  currentLinkPath,
  lstatPath,
  realpathPath
}) {
  try {
    const expectedCandidateMetadata = lstatPath(expectedReleasePath);
    if (
      expectedCandidateMetadata.isSymbolicLink()
      || !expectedCandidateMetadata.isDirectory()
    ) {
      return { expectedCandidatePath: "", currentPointerMatchesExpected: false };
    }
    const expectedCandidatePath = realpathPath(expectedReleasePath);
    if (
      expectedCandidatePath !== expectedReleasePath
      || posix.basename(expectedCandidatePath) !== expectedRelease
    ) {
      return { expectedCandidatePath: "", currentPointerMatchesExpected: false };
    }
    const currentLinkMetadata = lstatPath(currentLinkPath);
    const currentPointerMatchesExpected = currentLinkMetadata.isSymbolicLink()
      && realpathPath(currentLinkPath) === expectedCandidatePath;
    return { expectedCandidatePath, currentPointerMatchesExpected };
  } catch {
    return { expectedCandidatePath: "", currentPointerMatchesExpected: false };
  }
}

export async function readControlPlaneRuntimeState({
  expectedRelease,
  expectedReleasePath,
  currentLinkPath,
  commandRunner = runCommand,
  readProcessCwd = (pid) => readlinkSync(`/proc/${pid}/cwd`),
  lstatPath = lstatSync,
  realpathPath = realpathSync,
  timeoutMs = PROMOTION_HEALTH_GATE_DEFAULTS.probeTimeoutMs
} = {}) {
  const result = await commandRunner("systemctl", [
    "show",
    SERVICE_NAME,
    "--property=ActiveState",
    "--property=SubState",
    "--property=MainPID",
    "--property=NRestarts"
  ], {
    timeoutMs,
    maxOutput: 4_096
  });
  if (!result.ok) {
    return {
      active: false,
      substate: "unknown",
      currentPointerMatchesExpected: false,
      processCwdMatchesExpected: false,
      restartCount: null
    };
  }
  const properties = parseSystemdProperties(result.stdout);
  const releaseIdentity = resolveReleaseIdentity({
    expectedRelease,
    expectedReleasePath,
    currentLinkPath,
    lstatPath,
    realpathPath
  });
  const pid = Number(properties.MainPID);
  let processCwdMatchesExpected = false;
  if (Number.isInteger(pid) && pid > 0 && releaseIdentity.expectedCandidatePath) {
    try {
      processCwdMatchesExpected = realpathPath(readProcessCwd(pid))
        === releaseIdentity.expectedCandidatePath;
    } catch {
      processCwdMatchesExpected = false;
    }
  }
  const restartCount = Number(properties.NRestarts);
  return {
    active: properties.ActiveState === "active",
    substate: properties.SubState || "unknown",
    currentPointerMatchesExpected: releaseIdentity.currentPointerMatchesExpected,
    processCwdMatchesExpected,
    restartCount: Number.isInteger(restartCount) && restartCount >= 0 ? restartCount : null
  };
}

async function probeHealth(url, { fetchImpl = globalThis.fetch, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    response.body?.cancel?.();
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runPromotionHealthGateCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  dependencies = {}
} = {}) {
  let options;
  try {
    options = parsePromotionHealthGateArgs(argv);
  } catch {
    stderr.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "control_plane_promotion_health_gate",
      state: "error",
      condition: "invalid_input"
    })}\n`);
    return 1;
  }

  try {
    const result = await runPromotionHealthGate({
      ...options,
      readRuntimeState: dependencies.readRuntimeState
        ?? (({ timeoutMs }) => readControlPlaneRuntimeState({
          expectedRelease: options.expectedRelease,
          expectedReleasePath: options.expectedReleasePath,
          currentLinkPath: options.currentLinkPath,
          timeoutMs
        })),
      probeLocalHealth: dependencies.probeLocalHealth
        ?? (({ timeoutMs }) => probeHealth(options.localHealthUrl, {
          fetchImpl: dependencies.fetchImpl,
          timeoutMs
        })),
      probePublicHealth: dependencies.probePublicHealth
        ?? (({ timeoutMs }) => probeHealth(options.publicHealthUrl, {
          fetchImpl: dependencies.fetchImpl,
          timeoutMs
        })),
      sleep: dependencies.sleep,
      now: dependencies.now
    });
    stdout.write(`${JSON.stringify(result)}\n`);
    return result.state === "validated" ? 0 : 2;
  } catch {
    stderr.write(`${JSON.stringify({
      schemaVersion: "1",
      type: "control_plane_promotion_health_gate",
      state: "error",
      condition: "execution_failed"
    })}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation() || process.argv[1] === "-") {
  process.exitCode = await runPromotionHealthGateCli();
}
