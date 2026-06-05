import { createHash } from "node:crypto";

const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ALLOWED_RUNTIMES = new Set(["mihomo-tuic"]);
const ALLOWED_ACTIVATION_SURFACES = new Set(["explicit-restart"]);
const RUNTIME_RECEIPT_STATUSES = new Set([
  "applied",
  "failed",
  "pending",
  "rolled_back",
  "drift_detected"
]);

const SENSITIVE_KEYS = new Set([
  "apiKey",
  "apiToken",
  "auth",
  "authToken",
  "customerEmail",
  "email",
  "endpoint",
  "host",
  "material",
  "password",
  "privateKey",
  "rawConfig",
  "secret",
  "sqliteRow",
  "subscriptionUrl",
  "token",
  "url",
  "uuid"
].map(normalizeKey));

function normalizeKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return String(value ?? "").trim();
}

function blocker(code, path, severity = "blocker") {
  return {
    code,
    severity,
    ...(path ? { path } : {})
  };
}

function warning(code, path) {
  return blocker(code, path, "warning");
}

function bool(value) {
  return value === true;
}

function walkSensitiveFields(value, path = "desiredState", issues = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkSensitiveFields(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (!isPlainObject(value)) {
    return issues;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (SENSITIVE_KEYS.has(normalizeKey(key))) {
      issues.push(blocker("raw_sensitive_field_present", nestedPath));
      continue;
    }
    walkSensitiveFields(nested, nestedPath, issues);
  }
  return issues;
}

function validateSafeRef(value, path, issues, code = "invalid_reference") {
  const ref = text(value);
  if (!ref || !SAFE_REF_PATTERN.test(ref)) {
    issues.push(blocker(code, path));
    return "";
  }
  return ref;
}

function validateIsoDate(value, path, issues) {
  const raw = text(value);
  const time = Date.parse(raw);
  if (!raw || Number.isNaN(time)) {
    issues.push(blocker("invalid_expires_at", path));
    return "";
  }
  return new Date(time).toISOString();
}

function digestFingerprint(value) {
  const raw = text(value);
  if (!raw) {
    return "";
  }
  return `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 16)}`;
}

function safeInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function sanitizeRuntimeReceipt(receipt = {}) {
  const issues = [];
  const source = isPlainObject(receipt) ? receipt : {};
  if (!isPlainObject(receipt)) {
    issues.push(blocker("invalid_runtime_receipt", "runtimeReceipt"));
  }

  const sensitiveIssues = walkSensitiveFields(source, "runtimeReceipt");
  if (sensitiveIssues.length > 0) {
    issues.push(blocker("runtime_receipt_sensitive_field_present", "runtimeReceipt"));
  }

  const status = text(source.status);
  if (!RUNTIME_RECEIPT_STATUSES.has(status)) {
    issues.push(blocker("invalid_runtime_receipt_status", "runtimeReceipt.status"));
  }

  const sanitized = {
    ...(RUNTIME_RECEIPT_STATUSES.has(status) ? { status } : {}),
    mutation: bool(source.mutation)
  };

  const backupRef = text(source.backupRef);
  if (backupRef) {
    if (SAFE_REF_PATTERN.test(backupRef)) {
      sanitized.backupRef = backupRef;
    } else {
      issues.push(blocker("invalid_runtime_backup_ref", "runtimeReceipt.backupRef"));
    }
  }

  const rollbackRef = text(source.rollbackRef);
  if (rollbackRef) {
    if (SAFE_REF_PATTERN.test(rollbackRef)) {
      sanitized.rollbackRef = rollbackRef;
    } else {
      issues.push(blocker("invalid_runtime_rollback_ref", "runtimeReceipt.rollbackRef"));
    }
  }

  if (isPlainObject(source.configTest)) {
    const exitCode = safeInteger(source.configTest.exitCode);
    sanitized.configTest = {
      ...(exitCode !== null ? { exitCode } : {}),
      ok: bool(source.configTest.ok)
    };
  }

  if (isPlainObject(source.service)) {
    const serviceName = text(source.service.name);
    sanitized.service = {
      ...(SAFE_REF_PATTERN.test(serviceName) ? { name: serviceName } : {}),
      active: bool(source.service.active),
      restarted: bool(source.service.restarted)
    };
    if (serviceName && !SAFE_REF_PATTERN.test(serviceName)) {
      issues.push(blocker("invalid_runtime_service_name", "runtimeReceipt.service.name"));
    }
  }

  if (isPlainObject(source.listener)) {
    sanitized.listener = {
      udp443: bool(source.listener.udp443)
    };
  }

  const appliedAt = text(source.appliedAt);
  if (appliedAt) {
    const time = Date.parse(appliedAt);
    if (Number.isNaN(time)) {
      issues.push(blocker("invalid_runtime_applied_at", "runtimeReceipt.appliedAt"));
    } else {
      sanitized.appliedAt = new Date(time).toISOString();
    }
  }

  return {
    receipt: sanitized,
    issues,
    mutation: bool(source.mutation)
  };
}

function sanitizeDesiredCredential(credential, index, issues) {
  if (!isPlainObject(credential)) {
    issues.push(blocker("invalid_desired_credential_shape", `desiredCredentials[${index}]`));
    return null;
  }
  const credentialRef = validateSafeRef(
    credential.credentialRef,
    `desiredCredentials[${index}].credentialRef`,
    issues,
    "invalid_credential_ref"
  );
  const orderRef = validateSafeRef(
    credential.orderRef,
    `desiredCredentials[${index}].orderRef`,
    issues,
    "invalid_order_ref"
  );
  const userRef = validateSafeRef(
    credential.userRef,
    `desiredCredentials[${index}].userRef`,
    issues,
    "invalid_user_ref"
  );
  const expiresAt = validateIsoDate(credential.expiresAt, `desiredCredentials[${index}].expiresAt`, issues);
  const materialDigest = validateSafeRef(
    credential.materialDigest,
    `desiredCredentials[${index}].materialDigest`,
    issues,
    "invalid_material_digest"
  );

  if (!credentialRef || !orderRef || !userRef || !expiresAt || !materialDigest) {
    return null;
  }

  return {
    credentialRef,
    orderRef,
    userRef,
    expiresAt,
    materialFingerprint: digestFingerprint(materialDigest)
  };
}

function sanitizeCurrentCredential(credential, index, issues) {
  if (!isPlainObject(credential)) {
    issues.push(blocker("invalid_current_credential_shape", `currentCredentials[${index}]`));
    return null;
  }
  const credentialRef = validateSafeRef(
    credential.credentialRef,
    `currentCredentials[${index}].credentialRef`,
    issues,
    "invalid_credential_ref"
  );
  const materialDigest = validateSafeRef(
    credential.materialDigest,
    `currentCredentials[${index}].materialDigest`,
    issues,
    "invalid_material_digest"
  );
  if (!credentialRef || !materialDigest) {
    return null;
  }
  return {
    credentialRef,
    materialFingerprint: digestFingerprint(materialDigest)
  };
}

function byCredentialRef(a, b) {
  return a.credentialRef.localeCompare(b.credentialRef);
}

function buildActions({ desiredCredentials, currentCredentials }) {
  const desiredByRef = new Map(desiredCredentials.map((credential) => [credential.credentialRef, credential]));
  const currentByRef = new Map(currentCredentials.map((credential) => [credential.credentialRef, credential]));

  const add = desiredCredentials
    .filter((credential) => !currentByRef.has(credential.credentialRef))
    .sort(byCredentialRef)
    .map((credential) => ({
      action: "add",
      credentialRef: credential.credentialRef,
      orderRef: credential.orderRef,
      userRef: credential.userRef,
      expiresAt: credential.expiresAt,
      materialFingerprint: credential.materialFingerprint
    }));

  const revoke = currentCredentials
    .filter((credential) => !desiredByRef.has(credential.credentialRef))
    .sort(byCredentialRef)
    .map((credential) => ({
      action: "revoke",
      credentialRef: credential.credentialRef,
      materialFingerprint: credential.materialFingerprint
    }));

  const rotate = desiredCredentials
    .filter((credential) => {
      const current = currentByRef.get(credential.credentialRef);
      return current && current.materialFingerprint !== credential.materialFingerprint;
    })
    .sort(byCredentialRef)
    .map((credential) => ({
      action: "rotate",
      credentialRef: credential.credentialRef,
      orderRef: credential.orderRef,
      userRef: credential.userRef,
      expiresAt: credential.expiresAt,
      materialFingerprint: credential.materialFingerprint
    }));

  const unchanged = desiredCredentials
    .filter((credential) => {
      const current = currentByRef.get(credential.credentialRef);
      return current && current.materialFingerprint === credential.materialFingerprint;
    })
    .sort(byCredentialRef)
    .map((credential) => ({
      action: "unchanged",
      credentialRef: credential.credentialRef,
      orderRef: credential.orderRef,
      userRef: credential.userRef,
      expiresAt: credential.expiresAt,
      materialFingerprint: credential.materialFingerprint
    }));

  return [...add, ...revoke, ...rotate, ...unchanged];
}

function buildSummary({ desiredCredentials, currentCredentials, actions }) {
  return {
    desiredCount: desiredCredentials.length,
    currentCount: currentCredentials.length,
    addCount: actions.filter((action) => action.action === "add").length,
    revokeCount: actions.filter((action) => action.action === "revoke").length,
    rotateCount: actions.filter((action) => action.action === "rotate").length,
    unchangedCount: actions.filter((action) => action.action === "unchanged").length
  };
}

export function buildCredentialReconciliationPlan({
  desiredState = {},
  inputPath = ""
} = {}) {
  const issues = [];
  if (!isPlainObject(desiredState)) {
    issues.push(blocker("invalid_desired_state", "desiredState"));
  }

  const source = isPlainObject(desiredState) ? desiredState : {};
  issues.push(...walkSensitiveFields(source));

  const channelRef = validateSafeRef(source.channelRef, "desiredState.channelRef", issues, "invalid_channel_ref");
  const desiredStateRef = validateSafeRef(
    source.desiredStateRef,
    "desiredState.desiredStateRef",
    issues,
    "invalid_desired_state_ref"
  );

  const runtime = text(source.runtime || "mihomo-tuic");
  if (!ALLOWED_RUNTIMES.has(runtime)) {
    issues.push(blocker("unsupported_runtime", "desiredState.runtime"));
  }

  const activationSurface = text(source.activationSurface || "explicit-restart");
  if (!ALLOWED_ACTIVATION_SURFACES.has(activationSurface)) {
    issues.push(blocker("unsupported_activation_surface", "desiredState.activationSurface"));
  }

  if (!Array.isArray(source.desiredCredentials)) {
    issues.push(blocker("desired_credentials_required", "desiredState.desiredCredentials"));
  }
  if (!Array.isArray(source.currentCredentials)) {
    issues.push(blocker("current_credentials_required", "desiredState.currentCredentials"));
  }

  const desiredCredentials = Array.isArray(source.desiredCredentials)
    ? source.desiredCredentials.map((credential, index) =>
      sanitizeDesiredCredential(credential, index, issues)
    ).filter(Boolean)
    : [];
  const currentCredentials = Array.isArray(source.currentCredentials)
    ? source.currentCredentials.map((credential, index) =>
      sanitizeCurrentCredential(credential, index, issues)
    ).filter(Boolean)
    : [];

  const ok = issues.length === 0;
  const actions = ok ? buildActions({ desiredCredentials, currentCredentials }) : [];
  const warnings = [];
  if (activationSurface === "explicit-restart") {
    warnings.push(warning("service_restart_activation_requires_approved_downtime", "desiredState.activationSurface"));
  }

  return {
    type: "gccgw_edge_credential_reconciliation_plan",
    generatedBy: "gccgw edge credentials reconcile-plan",
    ok,
    mode: "plan",
    inputPath: inputPath || "",
    channelRef: channelRef || null,
    desiredStateRef: desiredStateRef || null,
    runtime: ALLOWED_RUNTIMES.has(runtime) ? runtime : null,
    activationSurface: ALLOWED_ACTIVATION_SURFACES.has(activationSurface) ? activationSurface : null,
    summary: buildSummary({ desiredCredentials: ok ? desiredCredentials : [], currentCredentials: ok ? currentCredentials : [], actions }),
    actions,
    blockers: issues,
    warnings,
    nextAction: ok ? "review_apply_gate" : "resolve_reconciliation_blockers",
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

export function buildCredentialReconciliationApplyPlan({
  desiredState = {},
  inputPath = "",
  executeProductionMutation = false,
  runtimeAdapter = null
} = {}) {
  const plan = buildCredentialReconciliationPlan({ desiredState, inputPath });
  const blockers = [...plan.blockers];

  if (executeProductionMutation !== true) {
    blockers.push(blocker("execute_production_mutation_required", "flags.--execute-production-mutation"));
  } else if (!runtimeAdapter || typeof runtimeAdapter.applyCredentialReconciliation !== "function") {
    blockers.push(blocker("production_runtime_adapter_required", "runtime.adapter"));
  }

  if (blockers.length > 0) {
    return {
      ...plan,
      type: "gccgw_edge_credential_reconciliation_apply_plan",
      generatedBy: "gccgw edge credentials apply",
      mode: "apply",
      ok: false,
      blockers,
      nextAction: "stop_before_runtime_mutation",
      mutation: false,
      productionAuthority: false,
      redacted: true
    };
  }

  let runtimeReceipt;
  try {
    runtimeReceipt = runtimeAdapter.applyCredentialReconciliation({
      channelRef: plan.channelRef,
      desiredStateRef: plan.desiredStateRef,
      runtime: plan.runtime,
      activationSurface: plan.activationSurface,
      summary: plan.summary,
      actions: plan.actions
    });
  } catch {
    blockers.push(blocker("runtime_adapter_failed", "runtime.adapter"));
  }

  const sanitizedRuntimeReceipt = sanitizeRuntimeReceipt(runtimeReceipt || {});
  blockers.push(...sanitizedRuntimeReceipt.issues);

  if (blockers.length > 0) {
    return {
      ...plan,
      type: "gccgw_edge_credential_reconciliation_apply_plan",
      generatedBy: "gccgw edge credentials apply",
      mode: "apply",
      ok: false,
      blockers,
      runtimeReceipt: sanitizedRuntimeReceipt.receipt,
      nextAction: "stop_before_runtime_mutation",
      mutation: sanitizedRuntimeReceipt.mutation,
      productionAuthority: false,
      redacted: true
    };
  }

  return {
    ...plan,
    type: "gccgw_edge_credential_reconciliation_apply_plan",
    generatedBy: "gccgw edge credentials apply",
    mode: "apply",
    ok: sanitizedRuntimeReceipt.receipt.status === "applied",
    blockers,
    runtimeReceipt: sanitizedRuntimeReceipt.receipt,
    nextAction: sanitizedRuntimeReceipt.receipt.status === "applied"
      ? "validate_runtime_state"
      : "review_runtime_apply_receipt",
    mutation: sanitizedRuntimeReceipt.mutation,
    productionAuthority: false,
    redacted: true
  };
}
