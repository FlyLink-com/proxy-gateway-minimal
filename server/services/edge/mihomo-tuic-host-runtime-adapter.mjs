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
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createMihomoTuicExplicitRestartAdapter } from "./mihomo-tuic-runtime-adapter.mjs";

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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

function defaultBackupRef(activeConfigPath, now) {
  const stamp = now.toISOString().replace(/[^A-Za-z0-9]+/g, "_");
  return `${basename(activeConfigPath)}.${stamp}.bak`;
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

export function createMihomoTuicHostRuntimeAdapter({
  activeConfigPath,
  candidateConfigPath,
  backupDir,
  serviceName = "mihomo-tuic.service",
  mihomoBinary = "mihomo",
  listener = {},
  resolveCredentialMaterial,
  commandRunner = defaultCommandRunner,
  now = () => new Date()
} = {}) {
  const safeActiveConfigPath = requiredText(activeConfigPath, "activeConfigPath");
  const safeCandidateConfigPath = requiredText(candidateConfigPath, "candidateConfigPath");
  const safeBackupDir = requiredText(backupDir, "backupDir");
  const safeServiceName = safeRef(serviceName, "mihomo-tuic.service");
  const safeMihomoBinary = requiredText(mihomoBinary, "mihomoBinary");
  const port = positivePort(listener.port, 443);
  const listenerValidationAttempts = positiveInteger(listener.validationAttempts, 5);
  const listenerValidationRetryDelayMs = nonNegativeInteger(listener.validationRetryDelayMs, 100);

  return createMihomoTuicExplicitRestartAdapter({
    serviceName: safeServiceName,
    listener: {
      name: listener.name || "channel-aliyun-a-tuic",
      port,
      listen: listener.listen || "0.0.0.0",
      certificate: listener.certificate,
      privateKey: listener.privateKey,
      congestionController: listener.congestionController || "bbr",
      alpn: listener.alpn || ["h3"]
    },
    resolveCredentialMaterial,
    writeCandidateConfig(content) {
      writeProtectedFile(safeCandidateConfigPath, content);
      return { candidateRef: basename(safeCandidateConfigPath) };
    },
    runConfigTest() {
      const result = commandRunner(safeMihomoBinary, [
        "-t",
        "-d",
        dirname(safeCandidateConfigPath),
        "-f",
        safeCandidateConfigPath
      ]) || {};
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
        result = commandRunner("ss", ["-H", "-lun", "sport", "=", `:${port}`]) || {};
        if (result.exitCode === 0 && text(result.stdout).includes(`:${port}`)) {
          return { udp443: true };
        }
        if (attempt < listenerValidationAttempts) {
          sleepMs(listenerValidationRetryDelayMs);
        }
      }
      return {
        udp443: result.exitCode === 0 && text(result.stdout).includes(`:${port}`)
      };
    },
    now
  });
}
