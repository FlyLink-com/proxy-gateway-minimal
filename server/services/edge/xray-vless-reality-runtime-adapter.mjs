import {
  chownSync,
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_ACTIVE_CONFIG_BYTES = 4 * 1024 * 1024;

function sameConfig(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  try {
    return isDeepStrictEqual(JSON.parse(left), JSON.parse(right));
  } catch {
    return false;
  }
}

function sameFile(left, right) {
  return ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((key) => left[key] === right[key]);
}

function readActiveConfigFile(filePath) {
  let before;
  try {
    before = lstatSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!before.isFile() || before.size > MAX_ACTIVE_CONFIG_BYTES) {
    throw hostError("active_config_unreadable", "active config must be a bounded regular file");
  }
  const fd = openSync(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || !sameFile(before, opened)) {
      throw hostError("active_config_changed", "active config changed during inspection");
    }
    const buffer = Buffer.alloc(opened.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size !== opened.size || !sameFile(opened, fstatSync(fd)) || !sameFile(opened, lstatSync(filePath))) {
      throw hostError("active_config_changed", "active config changed during inspection");
    }
    return buffer.subarray(0, size).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function loadedConfigProof(result, configStat) {
  if (result?.exitCode !== 0 || !configStat.isFile()) {
    throw hostError("active_config_unverified", "running config inspection failed");
  }
  const fields = Object.fromEntries(String(result.stdout || "").trim().split("\n").map((line) => {
    const split = line.indexOf("=");
    return [line.slice(0, split), line.slice(split + 1).trim()];
  }));
  const started = /^\w{3} (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\.(\d{6}) UTC$/.exec(fields.ExecMainStartTimestamp || "");
  if (["inactive", "failed", "activating", "deactivating"].includes(fields.ActiveState)) return { loaded: false };
  if (fields.ActiveState !== "active" || !/^[1-9]\d*$/.test(fields.MainPID || "") || !started) {
    throw hostError("active_config_unverified", "running config identity is unavailable");
  }
  const startedMs = Date.parse(`${started[1]}T${started[2]}Z`) + Number(started[3]) / 1000;
  if (!Number.isFinite(startedMs)) {
    throw hostError("active_config_unverified", "running config timestamp is invalid");
  }
  return {
    loaded: startedMs >= Math.max(configStat.mtimeMs, configStat.ctimeMs),
    processRef: `${fields.MainPID}:${fields.ExecMainStartTimestamp}`
  };
}

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

function isLoopbackHost(value) {
  const host = text(value).replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function loopbackHostPort(value, field) {
  const raw = requiredText(value, field);
  let host = "";
  let port = "";
  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    host = parsed.hostname;
    port = parsed.port;
  } else {
    const separator = raw.lastIndexOf(":");
    if (separator > 0) {
      host = raw.slice(0, separator);
      port = raw.slice(separator + 1);
    }
  }
  host = host.replace(/^\[/, "").replace(/\]$/, "");
  if (!isLoopbackHost(host)) {
    throw hostError("validation_error", `${field} must be loopback-only`);
  }
  const safePort = positivePort(port, 0);
  if (!safePort) {
    throw hostError("validation_error", `${field} must include a port`);
  }
  return {
    listen: host,
    port: safePort
  };
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
  const usageStatsServer = text(listener.usageStats?.statsServer || listener.usageStats?.server || listener.usageStats?.listen);
  const usageStats = usageStatsServer
    ? loopbackHostPort(usageStatsServer, "listener.usageStats.statsServer")
    : null;
  const config = {
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
  };
  if (usageStats) {
    config.stats = {};
    config.api = {
      tag: "api",
      services: ["HandlerService", "LoggerService", "StatsService"]
    };
    config.policy = {
      levels: {
        "0": {
          statsUserUplink: true,
          statsUserDownlink: true
        }
      },
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
        statsOutboundUplink: true,
        statsOutboundDownlink: true
      }
    };
    config.inbounds.push({
      tag: "api",
      listen: usageStats.listen,
      port: usageStats.port,
      protocol: "dokodemo-door",
      settings: {
        address: usageStats.listen
      }
    });
    config.routing = {
      rules: [
        {
          type: "field",
          inboundTag: ["api"],
          outboundTag: "api"
        }
      ]
    };
  }
  return JSON.stringify(config, null, 2);
}

export function createXrayVlessRealityExplicitRestartAdapter({
  serviceName = "xray-vless-reality.service",
  listener = {},
  resolveCredentialMaterial,
  readActiveConfig,
  validateRunningConfig,
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

      let candidateConfig;
      try {
        candidateConfig = buildXrayConfig(payload, clients, runtimeListener);
      } catch {
        return failedReceipt({ serviceName: safeServiceName });
      }
      // Compare actual disk state on every pass. A remembered generation alone
      // would hide drift, revocations, or a previous failed restart.
      try {
        const activeConfig = typeof readActiveConfig === "function" ? readActiveConfig() : null;
        if (sameConfig(activeConfig, candidateConfig)
          && typeof validateService === "function"
          && typeof validateListener === "function"
          && typeof validateRunningConfig === "function") {
          const service = validateService({ readOnly: true }) || {};
          const listenerState = validateListener({ readOnly: true }) || {};
          const running = service.active === true && listenerState.tcp === true ? validateRunningConfig() || {} : {};
          if (service.active === true && listenerState.tcp === true && running.loaded === true && text(running.processRef)) {
            // Test the active file without creating/replacing any config. Keep
            // configTest truthful for the existing data-plane receipt contract.
            const configTest = runConfigTest({ active: true }) || {};
            const exitCode = Number.isInteger(configTest.exitCode) ? configTest.exitCode : 1;
            if (exitCode !== 0) return failedReceipt({ serviceName: safeServiceName, exitCode });
            const serviceAfter = validateService({ readOnly: true }) || {};
            const listenerAfter = validateListener({ readOnly: true }) || {};
            const after = validateRunningConfig() || {};
            if (serviceAfter.active === true && listenerAfter.tcp === true
              && after.loaded === true && after.processRef === running.processRef && readActiveConfig() === activeConfig) {
              return {
                status: "unchanged",
                mutation: false,
                configTest: { exitCode, ok: true },
                service: { name: safeServiceName, active: true, restarted: false },
                listener: { tcp: true },
                appliedAt: now().toISOString()
              };
            }
            return failedReceipt({ serviceName: safeServiceName });
          }
        }
      } catch {
        // An uncertain read/probe must not be converted into a write/restart.
        return failedReceipt({ serviceName: safeServiceName });
      }
      writeCandidateConfig(candidateConfig);
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
      xver: listener.xver,
      usageStats: listener.usageStats
    },
    resolveCredentialMaterial,
    readActiveConfig() {
      return readActiveConfigFile(safeActiveConfigPath);
    },
    validateRunningConfig() {
      const before = lstatSync(safeActiveConfigPath);
      const result = commandRunner("systemctl", [
        "show", safeServiceName, "--property=ActiveState", "--property=MainPID",
        "--property=ExecMainStartTimestamp", "--timestamp=us+utc"
      ]) || {};
      const after = lstatSync(safeActiveConfigPath);
      if (!sameFile(before, after)) {
        throw hostError("active_config_changed", "active config changed during inspection");
      }
      return loadedConfigProof(result, after);
    },
    writeCandidateConfig(content) {
      writeProtectedFile(safeCandidateConfigPath, content);
      return { candidateRef: basename(safeCandidateConfigPath) };
    },
    runConfigTest({ active = false } = {}) {
      const result = commandRunner(safeXrayBinary, ["run", "-test", "-config", active ? safeActiveConfigPath : safeCandidateConfigPath]) || {};
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
    validateService({ readOnly = false } = {}) {
      const result = commandRunner("systemctl", ["is-active", "--quiet", safeServiceName]) || {};
      if (readOnly && ![0, 3].includes(result.exitCode)) {
        throw hostError("active_config_unverified", "service inspection failed");
      }
      return { active: result.exitCode === 0 };
    },
    validateListener({ readOnly = false } = {}) {
      let result = {};
      for (let attempt = 1; attempt <= listenerValidationAttempts; attempt += 1) {
        result = commandRunner("ss", ["-H", "-tln", "sport", "=", `:${port}`]) || {};
        if (readOnly && result.exitCode !== 0) {
          throw hostError("active_config_unverified", "listener inspection failed");
        }
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
