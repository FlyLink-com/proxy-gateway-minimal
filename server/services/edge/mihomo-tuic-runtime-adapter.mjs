const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true;
}

function safeRef(value, fallback = "") {
  const raw = text(value);
  return SAFE_REF_PATTERN.test(raw) ? raw : fallback;
}

function safeExitCode(value) {
  return Number.isInteger(value) ? value : 1;
}

function numberOrDefault(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isLoopbackHost(value) {
  const host = text(value).replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function loopbackControllerAuthority(value, field) {
  const raw = text(value);
  if (!raw) {
    return "";
  }
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
    throw new Error(`${field} must be loopback-only`);
  }
  const safePort = numberOrDefault(port, 0);
  if (!safePort) {
    throw new Error(`${field} must include a port`);
  }
  return `${host}:${safePort}`;
}

function yamlScalar(value) {
  const raw = text(value);
  return `"${raw
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")}"`;
}

function desiredRuntimeActions(actions = []) {
  return Array.isArray(actions)
    ? actions.filter((action) => ["add", "rotate", "unchanged"].includes(action?.action))
    : [];
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
    const uuid = text(material.uuid);
    const password = text(material.password);
    if (!uuid || !password) {
      return null;
    }
    users.push({ credentialRef, uuid, password });
  }
  return users;
}

function buildManagedUsersConfig(payload, users, listener = {}) {
  const listenerName = text(listener.name) || payload.channelRef;
  const port = numberOrDefault(listener.port, 443);
  const listen = text(listener.listen) || "0.0.0.0";
  const certificate = text(listener.certificate);
  const privateKey = text(listener.privateKey);
  const congestionController = text(listener.congestionController);
  const alpn = Array.isArray(listener.alpn) && listener.alpn.length > 0
    ? listener.alpn.map(text).filter(Boolean)
    : ["h3"];
  const controllerAuthority = loopbackControllerAuthority(
    listener.usageController?.controllerUrl || listener.usageController?.listen,
    "listener.usageController.controllerUrl"
  );
  const controllerSecret = text(listener.usageController?.secret);
  const lines = [
    "# managed-by: gccgw-edge-credential-reconciliation",
    `# channel-ref: ${payload.channelRef}`,
    `# desired-state-ref: ${payload.desiredStateRef}`
  ];
  if (controllerAuthority) {
    lines.push(`external-controller: ${yamlScalar(controllerAuthority)}`);
  }
  if (controllerSecret) {
    lines.push(`secret: ${yamlScalar(controllerSecret)}`);
  }
  lines.push(
    "listeners:",
    `  - name: ${yamlScalar(listenerName)}`,
    "    type: tuic",
    `    port: ${port}`,
    `    listen: ${yamlScalar(listen)}`
  );
  if (users.length === 0) {
    lines.push("    users: {}");
  } else {
    lines.push("    users:");
    for (const user of users) {
      lines.push(`      ${yamlScalar(user.uuid)}: ${yamlScalar(user.password)}`);
    }
  }
  if (certificate) {
    lines.push(`    certificate: ${yamlScalar(certificate)}`);
  }
  if (privateKey) {
    lines.push(`    private-key: ${yamlScalar(privateKey)}`);
  }
  if (congestionController) {
    lines.push(`    congestion-controller: ${yamlScalar(congestionController)}`);
  }
  if (alpn.length > 0) {
    lines.push("    alpn:");
    for (const item of alpn) {
      lines.push(`      - ${yamlScalar(item)}`);
    }
  }
  return `${lines.join("\n")}\n`;
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

export function createMihomoTuicExplicitRestartAdapter({
  serviceName = "mihomo-tuic.service",
  listenerName,
  listener,
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
  const safeServiceName = safeRef(serviceName, "mihomo-tuic.service");
  const runtimeListener = {
    ...(listener && typeof listener === "object" ? listener : {}),
    ...(listenerName ? { name: listenerName } : {})
  };

  return {
    applyCredentialReconciliation(payload = {}) {
      if (payload.activationSurface !== "explicit-restart" || payload.runtime !== "mihomo-tuic") {
        return failedReceipt({ serviceName: safeServiceName });
      }

      const actions = desiredRuntimeActions(payload.actions);
      const users = resolveRuntimeUsers(actions, resolveCredentialMaterial);
      if (!users) {
        return failedReceipt({ serviceName: safeServiceName });
      }

      let candidateConfig;
      try {
        candidateConfig = buildManagedUsersConfig(payload, users, runtimeListener);
      } catch {
        return failedReceipt({ serviceName: safeServiceName });
      }
      if (typeof writeCandidateConfig !== "function" || typeof runConfigTest !== "function") {
        return failedReceipt({ serviceName: safeServiceName });
      }

      writeCandidateConfig(candidateConfig);

      const configTest = runConfigTest() || {};
      const exitCode = safeExitCode(configTest.exitCode);
      if (exitCode !== 0) {
        return failedReceipt({
          serviceName: safeServiceName,
          mutation: false,
          exitCode
        });
      }

      if (
        typeof backupActiveConfig !== "function" ||
        typeof replaceActiveConfig !== "function" ||
        typeof restartService !== "function" ||
        typeof validateService !== "function" ||
        typeof validateListener !== "function"
      ) {
        return failedReceipt({
          serviceName: safeServiceName,
          mutation: false,
          exitCode
        });
      }

      const backup = backupActiveConfig() || {};
      replaceActiveConfig();
      const restart = restartService() || {};
      const service = validateService() || {};
      const listener = validateListener() || {};
      const serviceActive = bool(service.active);
      const udp443 = bool(listener.udp443);
      const restartOk = restart.ok !== false;
      const applied = serviceActive && udp443 && restartOk;

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
          udp443
        },
        appliedAt: now().toISOString()
      };
    }
  };
}
