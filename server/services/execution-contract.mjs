import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, realpathSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";

const EXECUTION_SPEC_FIELDS = new Set([
  "schemaVersion",
  "executionId",
  "commandId",
  "executable",
  "args",
  "cwd",
  "timeoutMs",
  "maxOutputBytes",
  "environment"
]);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const FORBIDDEN_ENV_NAME_PATTERN = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|API_KEY|ACCESS_KEY|AUTHORIZATION|COOKIE)(?:_|$)/i;
const FORBIDDEN_READBACK_KEY_PATTERN = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|API_KEY|ACCESS_KEY|AUTHORIZATION|COOKIE|STDOUT|STDERR|RAW|URL|HOST|PORT|PATH|CONFIG|ENVIRONMENT)(?:_|$)/i;
const SAFE_READBACK_STRING_PATTERN = /^[A-Za-z0-9._:-]{0,128}$/;

function normalizedFieldName(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function specError() {
  const error = new Error("execution_contract_spec_invalid");
  error.code = "execution_contract_spec_invalid";
  return error;
}

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function receiptError() {
  return contractError("execution_contract_receipt_invalid");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedEnvironment(value) {
  if (!isPlainObject(value)) throw specError();
  const result = {};
  for (const [name, entry] of Object.entries(value)) {
    if (!ENV_NAME_PATTERN.test(name) || typeof entry !== "string") throw specError();
    if (FORBIDDEN_ENV_NAME_PATTERN.test(normalizedFieldName(name))) {
      throw contractError("execution_environment_forbidden");
    }
    result[name] = entry;
  }
  return result;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreezeIntent(intent) {
  Object.freeze(intent.command.args);
  Object.freeze(intent.command);
  Object.freeze(intent.environment);
  return Object.freeze(intent);
}

function intentCore(intent) {
  return {
    schemaVersion: intent?.schemaVersion,
    type: intent?.type,
    executionId: intent?.executionId,
    command: {
      id: intent?.command?.id,
      executable: intent?.command?.executable,
      args: Array.isArray(intent?.command?.args) ? [...intent.command.args] : []
    },
    cwd: intent?.cwd,
    timeoutMs: intent?.timeoutMs,
    maxOutputBytes: intent?.maxOutputBytes,
    environment: isPlainObject(intent?.environment) ? { ...intent.environment } : {}
  };
}

function bindingIsFresh(intent, binding) {
  return isPlainObject(binding)
    && SAFE_ID_PATTERN.test(String(binding.proposalId ?? ""))
    && SAFE_ID_PATTERN.test(String(binding.approvalId ?? ""))
    && SAFE_DIGEST_PATTERN.test(String(binding.intentDigest ?? ""))
    && SAFE_DIGEST_PATTERN.test(String(intent?.intentDigest ?? ""))
    && digest(intentCore(intent)) === intent.intentDigest
    && binding.intentDigest === intent.intentDigest;
}

function fileIsExecutable(path, platform) {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    return platform === "win32" || (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function fileSha256(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", () => rejectHash(contractError("execution_executable_unreadable")));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function pathValue(environment = {}) {
  return String(environment.PATH ?? environment.Path ?? environment.path ?? "");
}

function executableExtensions(executable, environment, platform) {
  if (platform !== "win32" || extname(executable)) return [""];
  const raw = String(environment.PATHEXT ?? ".COM;.EXE;.BAT;.CMD");
  const extensions = raw.split(";").map((value) => value.trim()).filter(Boolean);
  return extensions.length > 0 ? extensions : [".EXE"];
}

function normalizedRealPath(path, platform) {
  const realPath = realpathSync(path);
  return platform === "win32" ? realPath.toLowerCase() : realPath;
}

function safeReadbackValue(value, depth = 0) {
  if (depth > 4) throw contractError("execution_readback_unsafe");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && SAFE_READBACK_STRING_PATTERN.test(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 64) throw contractError("execution_readback_unsafe");
    return value.map((entry) => safeReadbackValue(entry, depth + 1));
  }
  if (!isPlainObject(value)) throw contractError("execution_readback_unsafe");
  const entries = Object.entries(value);
  if (entries.length > 64) throw contractError("execution_readback_unsafe");
  const result = {};
  for (const [key, entry] of entries) {
    if (!ENV_NAME_PATTERN.test(key) || FORBIDDEN_READBACK_KEY_PATTERN.test(normalizedFieldName(key))) {
      throw contractError("execution_readback_unsafe");
    }
    result[key] = safeReadbackValue(entry, depth + 1);
  }
  return result;
}

function streamSummary(bytes, hash) {
  return {
    bytes,
    sha256: hash.digest("hex")
  };
}

function runResolvedProcess(intent, resolution) {
  return new Promise((resolveProcess) => {
    const started = performance.now();
    const stdoutHash = createHash("sha256");
    const stderrHash = createHash("sha256");
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let spawnFailed = false;
    let settled = false;
    let forceKillTimer = null;

    const child = spawn(resolution.resolvedPath, intent.command.args, {
      cwd: intent.cwd,
      env: intent.environment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    function stopChild() {
      try {
        child.kill("SIGTERM");
      } catch {
        // The close/error handlers still produce a fail-closed envelope.
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // The process is already gone.
        }
      }, 250);
      forceKillTimer.unref();
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      stopChild();
    }, intent.timeoutMs);

    function observeOutput(kind, chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (kind === "stdout") {
        stdoutBytes += buffer.length;
        stdoutHash.update(buffer);
      } else {
        stderrBytes += buffer.length;
        stderrHash.update(buffer);
      }
      if (!outputLimitExceeded && stdoutBytes + stderrBytes > intent.maxOutputBytes) {
        outputLimitExceeded = true;
        stopChild();
      }
    }

    child.stdout?.on("data", (chunk) => observeOutput("stdout", chunk));
    child.stderr?.on("data", (chunk) => observeOutput("stderr", chunk));

    function finish(exitCode, signal) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      const state = timedOut
        ? "timed_out"
        : outputLimitExceeded
          ? "output_limit_exceeded"
          : spawnFailed
            ? "spawn_error"
            : exitCode === 0
              ? "succeeded"
              : "failed";
      resolveProcess({
        state,
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        signal: typeof signal === "string" ? signal : null,
        timedOut,
        outputLimitExceeded,
        durationMs,
        stdout: streamSummary(stdoutBytes, stdoutHash),
        stderr: streamSummary(stderrBytes, stderrHash)
      });
    }

    child.on("error", () => {
      spawnFailed = true;
      finish(null, null);
    });
    child.on("close", (code, signal) => finish(code, signal));
  });
}

function processCondition(processResult) {
  switch (processResult?.state) {
    case "succeeded": return "ok";
    case "timed_out": return "process_timed_out";
    case "output_limit_exceeded": return "process_output_limit_exceeded";
    case "spawn_error": return "process_spawn_failed";
    default: return "process_failed";
  }
}

function safeResolution(resolution) {
  if (!isPlainObject(resolution)) return null;
  const result = {
    source: resolution.source,
    basename: resolution.basename,
    pathSha256: resolution.pathSha256,
    contentSha256: resolution.contentSha256,
    matchCount: resolution.matchCount
  };
  if (
    !["absolute", "path"].includes(result.source)
    || !SAFE_ID_PATTERN.test(String(result.basename ?? ""))
    || !SAFE_DIGEST_PATTERN.test(String(result.pathSha256 ?? ""))
    || !SAFE_DIGEST_PATTERN.test(String(result.contentSha256 ?? ""))
    || result.matchCount !== 1
  ) {
    throw receiptError();
  }
  return result;
}

function safeProcess(processResult) {
  if (processResult === null) return null;
  if (!isPlainObject(processResult)) throw receiptError();
  const streamKeysAreSafe = (stream) => isPlainObject(stream)
    && Object.keys(stream).every((key) => ["bytes", "sha256"].includes(key))
    && Number.isInteger(stream.bytes)
    && stream.bytes >= 0
    && SAFE_DIGEST_PATTERN.test(String(stream.sha256 ?? ""));
  if (!streamKeysAreSafe(processResult.stdout) || !streamKeysAreSafe(processResult.stderr)) {
    throw receiptError();
  }
  if (![
    "succeeded",
    "failed",
    "timed_out",
    "output_limit_exceeded",
    "spawn_error"
  ].includes(processResult.state)) {
    throw receiptError();
  }
  return {
    state: processResult.state,
    exitCode: Number.isInteger(processResult.exitCode) ? processResult.exitCode : null,
    signal: typeof processResult.signal === "string" ? processResult.signal : null,
    timedOut: processResult.timedOut === true,
    outputLimitExceeded: processResult.outputLimitExceeded === true,
    durationMs: Number.isInteger(processResult.durationMs) && processResult.durationMs >= 0
      ? processResult.durationMs
      : 0,
    stdout: { ...processResult.stdout },
    stderr: { ...processResult.stderr }
  };
}

function validIsoTimestampOrNull(value) {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function createExecutionIntent(input = {}) {
  if (!isPlainObject(input)) throw specError();
  if (Object.keys(input).some((field) => !EXECUTION_SPEC_FIELDS.has(field))) throw specError();
  if (input.schemaVersion !== "1") throw specError();
  if (!SAFE_ID_PATTERN.test(String(input.executionId ?? ""))) throw specError();
  if (!SAFE_ID_PATTERN.test(String(input.commandId ?? ""))) throw specError();
  if (typeof input.executable !== "string" || input.executable.trim() === "") throw specError();
  if (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== "string")) throw specError();
  if (typeof input.cwd !== "string" || !isAbsolute(input.cwd)) throw specError();
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 300_000) throw specError();
  if (!Number.isInteger(input.maxOutputBytes) || input.maxOutputBytes < 1 || input.maxOutputBytes > 1_048_576) throw specError();

  const core = {
    schemaVersion: "1",
    type: "change_execution_intent",
    executionId: input.executionId,
    command: {
      id: input.commandId,
      executable: input.executable,
      args: [...input.args]
    },
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    maxOutputBytes: input.maxOutputBytes,
    environment: normalizedEnvironment(input.environment)
  };

  return deepFreezeIntent({
    ...core,
    intentDigest: digest(core)
  });
}

export async function resolveExecutable(executable, {
  environment = process.env,
  platform = process.platform
} = {}) {
  if (typeof executable !== "string" || executable.trim() === "") {
    throw contractError("execution_executable_invalid");
  }
  const requested = executable.trim();
  let source = "path";
  let candidates = [];

  if (isAbsolute(requested)) {
    source = "absolute";
    if (fileIsExecutable(requested, platform)) candidates = [requested];
  } else {
    if (requested.includes("/") || requested.includes("\\") || requested.includes("\0")) {
      throw contractError("execution_executable_invalid");
    }
    const pathDelimiter = platform === "win32" ? ";" : ":";
    const directories = pathValue(environment).split(pathDelimiter).filter(Boolean);
    const extensions = executableExtensions(requested, environment, platform);
    for (const directory of directories) {
      for (const extension of extensions) {
        const candidate = join(directory, `${requested}${extension}`);
        if (fileIsExecutable(candidate, platform)) candidates.push(candidate);
      }
    }
  }

  const unique = new Map();
  for (const candidate of candidates) {
    try {
      const realPath = realpathSync(candidate);
      unique.set(normalizedRealPath(realPath, platform), realPath);
    } catch {
      // Ignore disappearing or unreadable candidates and fail closed below.
    }
  }
  const matches = [...unique.values()];
  if (matches.length === 0) throw contractError("execution_executable_not_found");
  if (matches.length > 1) throw contractError("execution_path_shadowed");

  const resolvedPath = matches[0];
  return {
    source,
    requested,
    resolvedPath,
    basename: basename(resolvedPath),
    pathSha256: digest(platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath),
    contentSha256: await fileSha256(resolvedPath),
    matchCount: 1
  };
}

export function createReadbackInterface({ before, after } = {}) {
  if (typeof before !== "function" || typeof after !== "function") {
    throw contractError("execution_readback_interface_invalid");
  }
  return Object.freeze({ before, after });
}

export function buildExecutionReceipt({
  intent,
  binding,
  resolution = null,
  process: processResult = null,
  readback = { before: null, after: null },
  result,
  condition,
  startedAt = null,
  finishedAt = null
} = {}) {
  if (
    !SAFE_ID_PATTERN.test(String(intent?.executionId ?? ""))
    || !SAFE_ID_PATTERN.test(String(intent?.command?.id ?? ""))
    || !SAFE_DIGEST_PATTERN.test(String(intent?.intentDigest ?? ""))
    || !SAFE_ID_PATTERN.test(String(binding?.proposalId ?? ""))
    || !SAFE_ID_PATTERN.test(String(binding?.approvalId ?? ""))
    || !SAFE_DIGEST_PATTERN.test(String(binding?.intentDigest ?? ""))
  ) {
    throw receiptError();
  }

  const safeProcessResult = safeProcess(processResult);
  const normalizedResult = result ?? (safeProcessResult?.state === "succeeded" ? "completed" : "failed");
  const normalizedCondition = condition ?? (safeProcessResult ? processCondition(safeProcessResult) : "blocked");
  if (!["completed", "failed", "blocked"].includes(normalizedResult)) throw receiptError();
  if (!SAFE_ID_PATTERN.test(String(normalizedCondition))) throw receiptError();
  const recordsStaleBinding = normalizedResult === "blocked" && normalizedCondition === "stale_binding";
  if (!recordsStaleBinding && !bindingIsFresh(intent, binding)) throw receiptError();
  if (!validIsoTimestampOrNull(startedAt) || !validIsoTimestampOrNull(finishedAt)) throw receiptError();
  if (
    normalizedResult !== "blocked"
    && (startedAt === null || finishedAt === null || Date.parse(finishedAt) < Date.parse(startedAt))
  ) {
    throw receiptError();
  }

  return {
    schemaVersion: "1",
    type: "change_execution_receipt",
    executionId: intent.executionId,
    commandId: intent.command.id,
    intentDigest: intent.intentDigest,
    binding: {
      proposalId: binding.proposalId,
      approvalId: binding.approvalId,
      intentDigest: binding.intentDigest
    },
    result: normalizedResult,
    condition: normalizedCondition,
    executable: resolution === null ? null : safeResolution(resolution),
    process: safeProcessResult,
    readback: {
      before: readback?.before === null || readback?.before === undefined
        ? null
        : safeReadbackValue(readback.before),
      after: readback?.after === null || readback?.after === undefined
        ? null
        : safeReadbackValue(readback.after)
    },
    startedAt,
    finishedAt,
    authority: {
      production: false,
      provider: false,
      approvalSubmission: false
    },
    redacted: true
  };
}

function blockedReceipt(intent, binding, condition) {
  return buildExecutionReceipt({
    intent,
    binding,
    result: "blocked",
    condition,
    resolution: null,
    process: null,
    readback: { before: null, after: null }
  });
}

export async function executeExecutionContract({
  intent,
  binding,
  allowedEnvironmentNames = [],
  readback = null
} = {}) {
  if (!bindingIsFresh(intent, binding)) {
    return blockedReceipt(intent, binding, "stale_binding");
  }
  const allowed = new Set(
    (Array.isArray(allowedEnvironmentNames) ? allowedEnvironmentNames : [])
      .filter((name) => typeof name === "string")
      .map((name) => name.toUpperCase())
  );
  if (Object.keys(intent.environment).some((name) => !allowed.has(name.toUpperCase()))) {
    return blockedReceipt(intent, binding, "environment_not_allowed");
  }

  let resolution;
  try {
    resolution = await resolveExecutable(intent.command.executable, {
      environment: process.env,
      platform: process.platform
    });
  } catch (error) {
    return blockedReceipt(intent, binding, SAFE_ID_PATTERN.test(String(error?.code ?? ""))
      ? error.code
      : "execution_executable_unavailable");
  }

  const safeContext = {
    executionId: intent.executionId,
    commandId: intent.command.id,
    intentDigest: intent.intentDigest,
    executable: safeResolution(resolution)
  };
  let before = null;
  if (readback !== null) {
    if (typeof readback?.before !== "function" || typeof readback?.after !== "function") {
      return blockedReceipt(intent, binding, "execution_readback_interface_invalid");
    }
    try {
      before = safeReadbackValue(await readback.before(safeContext));
    } catch {
      return blockedReceipt(intent, binding, "execution_readback_unsafe");
    }
  }

  const startedAt = new Date().toISOString();
  const processResult = await runResolvedProcess(intent, resolution);
  const finishedAt = new Date().toISOString();
  let after = null;
  if (readback !== null) {
    try {
      after = safeReadbackValue(await readback.after({
        ...safeContext,
        process: safeProcess(processResult)
      }));
    } catch {
      return buildExecutionReceipt({
        intent,
        binding,
        resolution,
        process: processResult,
        readback: { before, after: null },
        result: "failed",
        condition: "execution_readback_unsafe",
        startedAt,
        finishedAt
      });
    }
  }

  return buildExecutionReceipt({
    intent,
    binding,
    resolution,
    process: processResult,
    readback: { before, after },
    result: processResult.state === "succeeded" ? "completed" : "failed",
    condition: processCondition(processResult),
    startedAt,
    finishedAt
  });
}
