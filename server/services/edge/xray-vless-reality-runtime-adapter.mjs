import {
  chownSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
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

function positivePort(value, fallback = 443) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function integerOrDefault(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
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
  let ownership = null;
  try {
    const existing = statSync(filePath);
    ownership = { uid: existing.uid, gid: existing.gid };
  } catch {
    ownership = null;
  }
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, filePath);
  if (ownership) {
    try {
      chownSync(filePath, ownership.uid, ownership.gid);
    } catch {
      // Best effort: Windows and some restricted filesystems do not support chown.
    }
  }
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

function resolveRuntimeClients(actions, resolveCredentialMaterial, flow) {
  const clients = [];
  for (const action of actions) {
    const credentialRef = safeRef(action.credentialRef);
    if (!credentialRef || typeof resolveCredentialMaterial !== "function") {
      return null;
    }
    const material = resolveCredentialMaterial(credentialRef);
    if (!isPlainObject(material)) {
      return null;
    }
    const uuid = text(material.uuid);
    if (!uuid) {
      return null;
    }
    clients.push({
      id: uuid,
      email: credentialRef,
      ...(flow ? { flow } : {})
    });
  }
  return clients;
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

function arrayOfText(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return source.map(text).filter(Boolean);
}

function buildXrayConfig(payload, clients, listener) {
  const tag = text(listener.name) || payload.channelRef;
  const serverNames = arrayOfText(listener.serverNames, []);
  const shortIds = arrayOfText(listener.shortIds, []);
  return JSON.stringify({
    log: {
      loglevel: "warning"
    },
    inbounds: [
      {
        tag,
        listen: text(listener.listen) || "0.0.0.0",
        port: positivePort(listener.port, 443),
        protocol: "vless",
        settings: {
          clients,
          decryption: "none"
        },
        streamSettings: {
          network: text(listener.network) || "tcp",
          security: "reality",
          realitySettings: {
            show: false,
            dest: text(listener.dest),
            xver: integerOrDefault(listener.xver, 0),
            serverNames,
            privateKey: text(listener.privateKey),
            shortIds
          }
        },
        sniffing: {
          enabled: true,
          destOverride: ["http", "tls", "quic"]
        }
      }
    ],
    outbounds: [
      {
        protocol: "freedom",
        tag: "direct"
      }
    ]
  }, null, 2);
}

export function createXrayVlessRealityExplicitRestartAdapter({
  serviceName = "xray-vless-reality.service",
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
  const safeServiceName = safeRef(serviceName, "xray-vless-reality.service");
  const flow = text(listener.flow) || "xtls-rprx-vision";
  const runtimeListener = {
    ...listener,
    flow
  };

  return {
    applyCredentialReconciliation(payload = {}) {
      if (payload.activationSurface !== "explicit-restart" || payload.runtime !== "xray-vless-reality") {
        return failedReceipt({ serviceName: safeServiceName });
      }
      if (!text(runtimeListener.dest) || !text(runtimeListener.privateKey)) {
        return failedReceipt({ serviceName: safeServiceName });
      }

      const actions = desiredRuntimeActions(payload.actions);
      const clients = resolveRuntimeClients(actions, resolveCredentialMaterial, flow);
      if (!clients) {
        return failedReceipt({ serviceName: safeServiceName });
      }
      if (typeof writeCandidateConfig !== "function" || typeof runConfigTest !== "function") {
        return failedReceipt({ serviceName: safeServiceName });
      }

      writeCandidateConfig(buildXrayConfig(payload, clients, runtimeListener));
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

export function createXrayVlessRealityHostRuntimeAdapter({
  activeConfigPath,
  candidateConfigPath,
  backupDir,
  serviceName = "xray-vless-reality.service",
  xrayBinary = "xray",
  listener = {},
  resolveCredentialMaterial,
  commandRunner = defaultCommandRunner,
  now = () => new Date()
} = {}) {
  const safeActiveConfigPath = requiredText(activeConfigPath, "activeConfigPath");
  const safeCandidateConfigPath = requiredText(candidateConfigPath, "candidateConfigPath");
  const safeBackupDir = requiredText(backupDir, "backupDir");
  const safeServiceName = safeRef(serviceName, "xray-vless-reality.service");
  const safeXrayBinary = requiredText(xrayBinary, "xrayBinary");
  const port = positivePort(listener.port, 443);
  const listenerValidationAttempts = positiveInteger(listener.validationAttempts, 5);
  const listenerValidationRetryDelayMs = nonNegativeInteger(listener.validationRetryDelayMs, 100);

  return createXrayVlessRealityExplicitRestartAdapter({
    serviceName: safeServiceName,
    listener: {
      name: listener.name || "channel-vultr-a-vless-reality-tcp",
      port,
      listen: listener.listen || "0.0.0.0",
      flow: listener.flow || "xtls-rprx-vision",
      dest: listener.dest,
      serverNames: listener.serverNames,
      privateKey: listener.privateKey,
      shortIds: listener.shortIds,
      xver: listener.xver
    },
    resolveCredentialMaterial,
    writeCandidateConfig(content) {
      writeProtectedFile(safeCandidateConfigPath, content);
      return { candidateRef: basename(safeCandidateConfigPath) };
    },
    runConfigTest() {
      const result = commandRunner(safeXrayBinary, ["run", "-test", "-config", safeCandidateConfigPath]) || {};
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
