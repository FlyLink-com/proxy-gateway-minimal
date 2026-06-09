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

function positivePortFromListen(value, fallback = 443) {
  const raw = text(value);
  const match = raw.match(/:(\d{1,5})$/);
  const parsed = Number.parseInt(match?.[1] || raw, 10);
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

function optionalPositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function booleanFlag(value) {
  if (value === true) return true;
  if (value === false) return false;
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function optionalBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = text(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
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

function yamlScalar(value) {
  const raw = text(value);
  return `"${raw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}

function appendHysteria2Sniff(lines, sniff = {}) {
  if (!isPlainObject(sniff) || !booleanFlag(sniff.enabled ?? sniff.enable)) {
    return;
  }
  lines.push("sniff:");
  lines.push("  enable: true");
  lines.push(`  rewriteDomain: ${booleanFlag(sniff.rewriteDomain) ? "true" : "false"}`);
  if (text(sniff.tcpPorts)) {
    lines.push(`  tcpPorts: ${yamlScalar(sniff.tcpPorts)}`);
  }
  if (text(sniff.udpPorts)) {
    lines.push(`  udpPorts: ${yamlScalar(sniff.udpPorts)}`);
  }
}

function appendHysteria2Outbounds(lines, outbound = {}) {
  if (!isPlainObject(outbound)) {
    return;
  }
  const mode = optionalPositiveInteger(outbound.mode ?? outbound.directMode);
  if (!mode) {
    return;
  }
  lines.push("outbounds:");
  lines.push("  - name: direct");
  lines.push("    type: direct");
  lines.push("    direct:");
  lines.push(`      mode: ${mode}`);
}

function appendHysteria2Bandwidth(lines, bandwidth = {}) {
  if (!isPlainObject(bandwidth)) {
    return;
  }
  const up = text(bandwidth.up);
  const down = text(bandwidth.down);
  if (!up && !down) {
    return;
  }
  lines.push("bandwidth:");
  if (up) {
    lines.push(`  up: ${yamlScalar(up)}`);
  }
  if (down) {
    lines.push(`  down: ${yamlScalar(down)}`);
  }
}

function appendHysteria2IgnoreClientBandwidth(lines, value) {
  const flag = optionalBoolean(value);
  if (flag === undefined) {
    return;
  }
  lines.push(`ignoreClientBandwidth: ${flag ? "true" : "false"}`);
}

function appendHysteria2Congestion(lines, congestion = {}) {
  if (!isPlainObject(congestion)) {
    return;
  }
  const type = text(congestion.type);
  const bbrProfile = text(congestion.bbrProfile);
  if (!type && !bbrProfile) {
    return;
  }
  lines.push("congestion:");
  if (type) {
    lines.push(`  type: ${yamlScalar(type)}`);
  }
  if (bbrProfile) {
    lines.push(`  bbrProfile: ${yamlScalar(bbrProfile)}`);
  }
}

function appendHysteria2Quic(lines, quic = {}) {
  if (!isPlainObject(quic)) {
    return;
  }
  const fields = [
    ["initStreamReceiveWindow", optionalPositiveInteger(quic.initStreamReceiveWindow)],
    ["maxStreamReceiveWindow", optionalPositiveInteger(quic.maxStreamReceiveWindow)],
    ["initConnReceiveWindow", optionalPositiveInteger(quic.initConnReceiveWindow)],
    ["maxConnReceiveWindow", optionalPositiveInteger(quic.maxConnReceiveWindow)],
    ["maxIdleTimeout", text(quic.maxIdleTimeout)],
    ["maxIncomingStreams", optionalPositiveInteger(quic.maxIncomingStreams)]
  ].filter(([, value]) => value !== undefined && value !== "");
  const disablePathMTUDiscovery = optionalBoolean(quic.disablePathMTUDiscovery);
  if (fields.length === 0 && disablePathMTUDiscovery === undefined) {
    return;
  }
  lines.push("quic:");
  for (const [field, value] of fields) {
    if (typeof value === "number") {
      lines.push(`  ${field}: ${value}`);
    } else {
      lines.push(`  ${field}: ${yamlScalar(value)}`);
    }
  }
  if (disablePathMTUDiscovery !== undefined) {
    lines.push(`  disablePathMTUDiscovery: ${disablePathMTUDiscovery ? "true" : "false"}`);
  }
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

function buildHysteria2Config(users, listener = {}) {
  const lines = [
    "# managed-by: gccgw-edge-credential-reconciliation",
    `listen: ${yamlScalar(listener.listen || ":443")}`,
    "tls:",
    `  cert: ${yamlScalar(listener.certificate)}`,
    `  key: ${yamlScalar(listener.privateKey)}`,
    "auth:",
    "  type: userpass",
    "  userpass:"
  ];
  for (const user of users) {
    lines.push(`    ${user.name}: ${yamlScalar(user.password)}`);
  }
  if (text(listener.trafficStatsListen)) {
    lines.push("trafficStats:");
    lines.push(`  listen: ${yamlScalar(listener.trafficStatsListen)}`);
    if (text(listener.trafficStatsSecret)) {
      lines.push(`  secret: ${yamlScalar(listener.trafficStatsSecret)}`);
    }
  }
  appendHysteria2Bandwidth(lines, listener.bandwidth);
  appendHysteria2IgnoreClientBandwidth(lines, listener.ignoreClientBandwidth);
  appendHysteria2Congestion(lines, listener.congestion);
  appendHysteria2Quic(lines, listener.quic);
  if (text(listener.udpIdleTimeout)) {
    lines.push(`udpIdleTimeout: ${yamlScalar(listener.udpIdleTimeout)}`);
  }
  appendHysteria2Sniff(lines, listener.sniff);
  appendHysteria2Outbounds(lines, listener.outbound);
  return `${lines.join("\n")}\n`;
}

export function createHysteria2ExplicitRestartAdapter({
  serviceName = "hysteria2.service",
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
  const safeServiceName = safeRef(serviceName, "hysteria2.service");
  const runtimeListener = {
    ...listener,
    listen: text(listener.listen) || ":443"
  };

  return {
    applyCredentialReconciliation(payload = {}) {
      if (payload.activationSurface !== "explicit-restart" || payload.runtime !== "hysteria2") {
        return failedReceipt({ serviceName: safeServiceName });
      }
      if (!text(runtimeListener.certificate) || !text(runtimeListener.privateKey)) {
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

      writeCandidateConfig(buildHysteria2Config(users, runtimeListener));
      const configTest = runConfigTest() || {};
      const exitCode = Number.isInteger(configTest.exitCode) ? configTest.exitCode : 1;
      const configTestSkipped = configTest.skipped === true;
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
      const udp443 = listenerState.udp443 === true;
      const restartOk = restart.ok !== false;
      const applied = serviceActive && udp443 && restartOk;

      return {
        status: applied ? "applied" : "failed",
        mutation: true,
        ...(safeRef(backup.backupRef) ? { backupRef: safeRef(backup.backupRef) } : {}),
        configTest: {
          exitCode,
          ok: true,
          ...(configTestSkipped ? { skipped: true } : {})
        },
        service: {
          name: safeServiceName,
          active: serviceActive,
          restarted: restartOk
        },
        listener: {
          udp443
        },
        appliedAt: now().toISOString()
      };
    }
  };
}

export function createHysteria2HostRuntimeAdapter({
  activeConfigPath,
  candidateConfigPath,
  backupDir,
  serviceName = "hysteria2.service",
  hysteriaBinary = "hysteria",
  listener = {},
  resolveCredentialMaterial,
  commandRunner = defaultCommandRunner,
  now = () => new Date()
} = {}) {
  const safeActiveConfigPath = requiredText(activeConfigPath, "activeConfigPath");
  const safeCandidateConfigPath = requiredText(candidateConfigPath, "candidateConfigPath");
  const safeBackupDir = requiredText(backupDir, "backupDir");
  const safeServiceName = safeRef(serviceName, "hysteria2.service");
  const safeHysteriaBinary = requiredText(hysteriaBinary, "hysteriaBinary");
  const listen = text(listener.listen) || ":443";
  const port = positivePortFromListen(listen, 443);
  const listenerValidationAttempts = positiveInteger(listener.validationAttempts, 5);
  const listenerValidationRetryDelayMs = nonNegativeInteger(listener.validationRetryDelayMs, 100);

  return createHysteria2ExplicitRestartAdapter({
    serviceName: safeServiceName,
    listener: {
      listen,
      certificate: listener.certificate,
      privateKey: listener.privateKey,
      trafficStatsListen: listener.trafficStatsListen,
      trafficStatsSecret: listener.trafficStatsSecret,
      bandwidth: listener.bandwidth,
      ignoreClientBandwidth: listener.ignoreClientBandwidth,
      congestion: listener.congestion,
      quic: listener.quic,
      udpIdleTimeout: listener.udpIdleTimeout,
      sniff: listener.sniff,
      outbound: listener.outbound
    },
    resolveCredentialMaterial,
    writeCandidateConfig(content) {
      writeProtectedFile(safeCandidateConfigPath, content);
      return { candidateRef: basename(safeCandidateConfigPath) };
    },
    runConfigTest() {
      const helpResult = commandRunner(safeHysteriaBinary, ["server", "--help"]) || {};
      const helpText = `${helpResult.stdout || ""}\n${helpResult.stderr || ""}`;
      if (Number.isInteger(helpResult.exitCode) && helpResult.exitCode === 0 && !helpText.includes("--check")) {
        return { exitCode: 0, skipped: true };
      }
      const result = commandRunner(safeHysteriaBinary, ["server", "-c", safeCandidateConfigPath, "--check"]) || {};
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
        result = commandRunner("ss", ["-H", "-uln", "sport", "=", `:${port}`]) || {};
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
