import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function hostError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function requiredText(value, field) {
  const normalized = text(value);
  if (!normalized) {
    throw hostError("validation_error", `${field} is required`);
  }
  return normalized;
}

function safeRef(value, fallback = "") {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : fallback;
}

function positivePort(value, fallback = 18388) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleepMs(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function defaultCommandRunner(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function writeProtectedFile(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, filePath);
  chmodSync(filePath, 0o600);
}

function defaultBackupRef(activeConfigPath, now) {
  const stamp = now.toISOString().replace(/[^A-Za-z0-9]+/g, "_");
  return `${basename(activeConfigPath)}.${stamp}.bak`;
}

function desiredRuntimeActions(actions = []) {
  return Array.isArray(actions)
    ? actions.filter((action) => ["add", "rotate", "unchanged"].includes(action?.action))
    : [];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveRuntimeUsers(actions, resolveCredentialMaterial) {
  const users = [];
  for (const action of actions) {
    const credentialRef = safeRef(action.credentialRef);
    if (!credentialRef || typeof resolveCredentialMaterial !== "function") {
      return null;
    }
    const material = resolveCredentialMaterial(credentialRef);
    if (!isPlainObject(material)) {
      return null;
    }
    const password = text(material.password);
    if (!password) {
      return null;
    }
    users.push({ name: credentialRef, password });
  }
  return users;
}

function failedReceipt({ serviceName, mutation = false, exitCode = null } = {}) {
  return {
    status: "failed",
    mutation,
    ...(exitCode !== null ? { configTest: { exitCode, ok: exitCode === 0 } } : {}),
    service: {
      name: serviceName,
      active: false,
      restarted: false
    }
  };
}

function buildSingBoxConfig(payload, users, listener) {
  return JSON.stringify({
    log: {
      level: "warn"
    },
    inbounds: [
      {
        type: "shadowsocks",
        tag: listener.name || payload.channelRef,
        listen: listener.listen,
        listen_port: listener.port,
        method: listener.method,
        password: listener.serverPassword,
        network: "tcp",
        users,
        multiplex: {
          enabled: true
        }
      }
    ],
    outbounds: [
      {
        type: "direct",
        tag: "direct"
      }
    ],
    route: {
      final: "direct"
    },
    experimental: listener.v2rayApiListen
      ? {
          v2ray_api: {
            listen: listener.v2rayApiListen,
            stats: {
              enabled: true,
              inbounds: [listener.name || payload.channelRef],
              users: users.map((user) => user.name)
            }
          }
        }
      : undefined
  }, null, 2);
}

export function createSingBoxSsExplicitRestartAdapter({
  serviceName = "sing-box-ss.service",
  listener = {},
  resolveCredentialMaterial,
  writeCandidateConfig,
  runConfigTest,
  backupActiveConfig,
  replaceActiveConfig,
  restartService,
  validateService,
  validateListener,
  now = () => new Date()
} = {}) {
  const safeServiceName = safeRef(serviceName, "sing-box-ss.service");
  const runtimeListener = {
    name: safeRef(listener.name, "channel-vultr-a-ss-tcp"),
    listen: text(listener.listen) || "0.0.0.0",
    port: positivePort(listener.port, 18388),
    method: text(listener.method) || "2022-blake3-aes-256-gcm",
    serverPassword: text(listener.serverPassword),
    v2rayApiListen: text(listener.v2rayApiListen)
  };

  return {
    applyCredentialReconciliation(payload = {}) {
      if (payload.activationSurface !== "explicit-restart" || payload.runtime !== "sing-box-ss") {
        return failedReceipt({ serviceName: safeServiceName });
      }
      if (!runtimeListener.serverPassword) {
        return failedReceipt({ serviceName: safeServiceName });
      }

      const actions = desiredRuntimeActions(payload.actions);
      const users = resolveRuntimeUsers(actions, resolveCredentialMaterial);
      if (!users) {
        return failedReceipt({ serviceName: safeServiceName });
      }
      if (typeof writeCandidateConfig !== "function" || typeof runConfigTest !== "function") {
        return failedReceipt({ serviceName: safeServiceName });
      }

      writeCandidateConfig(buildSingBoxConfig(payload, users, runtimeListener));
      const configTest = runConfigTest() || {};
      const exitCode = Number.isInteger(configTest.exitCode) ? configTest.exitCode : 1;
      if (exitCode !== 0) {
        return failedReceipt({ serviceName: safeServiceName, mutation: false, exitCode });
      }
      if (
        typeof backupActiveConfig !== "function" ||
        typeof replaceActiveConfig !== "function" ||
        typeof restartService !== "function" ||
        typeof validateService !== "function" ||
        typeof validateListener !== "function"
      ) {
        return failedReceipt({ serviceName: safeServiceName, mutation: false, exitCode });
      }

      const backup = backupActiveConfig() || {};
      replaceActiveConfig();
      const restart = restartService() || {};
      const service = validateService() || {};
      const listenerState = validateListener() || {};
      const serviceActive = service.active === true;
      const tcp = listenerState.tcp === true;
      const restartOk = restart.ok !== false;
      const applied = serviceActive && tcp && restartOk;

      return {
        status: applied ? "applied" : "failed",
        mutation: true,
        ...(safeRef(backup.backupRef) ? { backupRef: safeRef(backup.backupRef) } : {}),
        configTest: {
          exitCode,
          ok: true
        },
        service: {
          name: safeServiceName,
          active: serviceActive,
          restarted: restartOk
        },
        listener: {
          tcp
        },
        appliedAt: now().toISOString()
      };
    }
  };
}

export function createSingBoxSsHostRuntimeAdapter({
  activeConfigPath,
  candidateConfigPath,
  backupDir,
  serviceName = "sing-box-ss.service",
  singBoxBinary = "sing-box",
  listener = {},
  resolveCredentialMaterial,
  commandRunner = defaultCommandRunner,
  now = () => new Date()
} = {}) {
  const safeActiveConfigPath = requiredText(activeConfigPath, "activeConfigPath");
  const safeCandidateConfigPath = requiredText(candidateConfigPath, "candidateConfigPath");
  const safeBackupDir = requiredText(backupDir, "backupDir");
  const safeServiceName = safeRef(serviceName, "sing-box-ss.service");
  const safeSingBoxBinary = requiredText(singBoxBinary, "singBoxBinary");
  const port = positivePort(listener.port, 18388);
  const listenerValidationAttempts = positiveInteger(listener.validationAttempts, 5);
  const listenerValidationRetryDelayMs = nonNegativeInteger(listener.validationRetryDelayMs, 100);

  return createSingBoxSsExplicitRestartAdapter({
    serviceName: safeServiceName,
    listener: {
      name: listener.name || "channel-vultr-a-ss-tcp",
      port,
      listen: listener.listen || "0.0.0.0",
      method: listener.method || "aes-256-gcm",
      serverPassword: listener.serverPassword,
      v2rayApiListen: listener.v2rayApiListen
    },
    resolveCredentialMaterial,
    writeCandidateConfig(content) {
      writeProtectedFile(safeCandidateConfigPath, content);
      return { candidateRef: basename(safeCandidateConfigPath) };
    },
    runConfigTest() {
      const result = commandRunner(safeSingBoxBinary, ["check", "-c", safeCandidateConfigPath]) || {};
      return { exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 1 };
    },
    backupActiveConfig() {
      mkdirSync(safeBackupDir, { recursive: true, mode: 0o700 });
      const backupRef = defaultBackupRef(safeActiveConfigPath, now());
      const backupPath = join(safeBackupDir, backupRef);
      if (existsSync(safeActiveConfigPath)) {
        copyFileSync(safeActiveConfigPath, backupPath);
      } else {
        writeFileSync(backupPath, "", { mode: 0o600 });
      }
      chmodSync(backupPath, 0o600);
      return { backupRef };
    },
    replaceActiveConfig() {
      const content = readFileSync(safeCandidateConfigPath, "utf8");
      writeProtectedFile(safeActiveConfigPath, content);
      return { ok: true };
    },
    restartService() {
      const result = commandRunner("systemctl", ["restart", safeServiceName]) || {};
      return { ok: result.exitCode === 0 };
    },
    validateService() {
      const result = commandRunner("systemctl", ["is-active", "--quiet", safeServiceName]) || {};
      return { active: result.exitCode === 0 };
    },
    validateListener() {
      let result = {};
      for (let attempt = 1; attempt <= listenerValidationAttempts; attempt += 1) {
        result = commandRunner("ss", ["-H", "-tln", "sport", "=", `:${port}`]) || {};
        if (result.exitCode === 0 && text(result.stdout).includes(`:${port}`)) {
          return { tcp: true };
        }
        if (attempt < listenerValidationAttempts) {
          sleepMs(listenerValidationRetryDelayMs);
        }
      }
      return {
        tcp: result.exitCode === 0 && text(result.stdout).includes(`:${port}`)
      };
    },
    now
  });
}
