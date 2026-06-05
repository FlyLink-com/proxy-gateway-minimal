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
    users.push({
      name: credentialRef,
      uuid,
      password
    });
  }
  return users;
}

function buildManagedUsersConfig(payload, users) {
  return JSON.stringify({
    managedBy: "gccgw-edge-credential-reconciliation",
    runtime: payload.runtime,
    channelRef: payload.channelRef,
    desiredStateRef: payload.desiredStateRef,
    users
  }, null, 2);
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

      const candidateConfig = buildManagedUsersConfig(payload, users);
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
