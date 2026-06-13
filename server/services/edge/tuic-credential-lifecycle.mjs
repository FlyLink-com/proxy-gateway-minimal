const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const ACTION_FIELD_ALLOWLIST = new Set([
  "action",
  "credentialRef",
  "expiresAt",
  "nextCredentialRef",
  "reason"
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
  "password",
  "privateKey",
  "rawConfig",
  "secret",
  "sqliteRow",
  "subscriptionUrl",
  "token",
  "url"
].map(normalizeKey));

const ALLOWED_ACTIONS = new Set(["add", "disable", "rotate"]);
const ACTIVATION_SURFACES = new Set(["reload", "api-managed", "explicit-restart"]);

function normalizeKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeActivationSurface(value) {
  const raw = safeString(value).toLowerCase().replace(/[\s_]+/g, "-");
  if (!raw) {
    return "";
  }
  if (raw === "restart" || raw === "service-restart" || raw === "systemd-restart") {
    return "explicit-restart";
  }
  if (raw === "api" || raw === "external-controller" || raw === "external-controller-api") {
    return "api-managed";
  }
  if (raw === "exec-reload" || raw === "systemd-reload") {
    return "reload";
  }
  return raw;
}

function validateSafeRef(value, path, issues, code = "invalid_reference") {
  const ref = safeString(value);
  if (!ref || !SAFE_REF_PATTERN.test(ref)) {
    issues.push(blocker(code, path));
    return "";
  }
  return ref;
}

function validateIsoDate(value, path, issues) {
  if (value === undefined) {
    return undefined;
  }
  const text = safeString(value);
  const time = Date.parse(text);
  if (!text || Number.isNaN(time)) {
    issues.push(blocker("invalid_expires_at", path));
    return undefined;
  }
  return new Date(time).toISOString();
}

function sanitizeAction(action, index, issues) {
  if (!isPlainObject(action)) {
    issues.push(blocker("invalid_action_shape", `actions[${index}]`));
    return null;
  }

  const unsupportedFields = Object.keys(action)
    .filter((field) => !ACTION_FIELD_ALLOWLIST.has(field))
    .filter((field) => !SENSITIVE_KEYS.has(normalizeKey(field)));
  for (const field of unsupportedFields) {
    issues.push(blocker("unsupported_action_field", `actions[${index}].${field}`));
  }

  const actionType = safeString(action.action);
  if (!ALLOWED_ACTIONS.has(actionType)) {
    issues.push(blocker("unsupported_action", `actions[${index}].action`));
    return null;
  }

  const credentialRef = validateSafeRef(action.credentialRef, `actions[${index}].credentialRef`, issues);
  const sanitized = {
    action: actionType,
    ...(credentialRef ? { credentialRef } : {})
  };

  if (actionType === "add") {
    const expiresAt = validateIsoDate(action.expiresAt, `actions[${index}].expiresAt`, issues);
    if (expiresAt) {
      sanitized.expiresAt = expiresAt;
    }
  }

  if (actionType === "rotate") {
    const nextCredentialRef = validateSafeRef(
      action.nextCredentialRef,
      `actions[${index}].nextCredentialRef`,
      issues
    );
    if (nextCredentialRef) {
      sanitized.nextCredentialRef = nextCredentialRef;
    }
  }

  const reason = safeString(action.reason);
  if (reason) {
    sanitized.reason = reason.slice(0, 160);
  }

  return sanitized;
}

function buildSummary(actions = []) {
  return {
    actionCount: actions.length,
    addCount: actions.filter((action) => action.action === "add").length,
    disableCount: actions.filter((action) => action.action === "disable").length,
    rotateCount: actions.filter((action) => action.action === "rotate").length
  };
}

export function buildTuicCredentialLifecyclePlan({
  desiredState = {},
  inputPath = ""
} = {}) {
  const issues = [];

  if (!isPlainObject(desiredState)) {
    issues.push(blocker("invalid_desired_state", "desiredState"));
  }

  const source = isPlainObject(desiredState) ? desiredState : {};
  issues.push(...walkSensitiveFields(source));

  const node = validateSafeRef(source.node, "desiredState.node", issues, "invalid_node_ref");
  const runtime = safeString(source.runtime || "mihomo-tuic");
  if (!runtime || !SAFE_REF_PATTERN.test(runtime)) {
    issues.push(blocker("invalid_runtime_ref", "desiredState.runtime"));
  }

  const activationSurface = normalizeActivationSurface(
    source.activationSurface || source.runtimeActivationSurface || source.credentialLifecycle?.activationSurface
  );
  if (activationSurface && !ACTIVATION_SURFACES.has(activationSurface)) {
    issues.push(blocker("unsupported_activation_surface", "desiredState.activationSurface"));
  }

  const warnings = [];
  if (activationSurface === "explicit-restart") {
    warnings.push(warning(
      "service_restart_activation_requires_approved_downtime",
      "desiredState.activationSurface"
    ));
  }

  if (!Array.isArray(source.actions)) {
    issues.push(blocker("actions_required", "desiredState.actions"));
  }

  const actions = Array.isArray(source.actions)
    ? source.actions.map((action, index) => sanitizeAction(action, index, issues)).filter(Boolean)
    : [];
  const ok = issues.length === 0;

  return {
    type: "gccgw_edge_tuic_credential_lifecycle_plan",
    generatedBy: "gccgw edge tuic-credentials plan",
    ok,
    mode: "plan",
    inputPath: inputPath || "",
    node: node || null,
    runtime: runtime || null,
    activationSurface: activationSurface || null,
    summary: buildSummary(ok ? actions : []),
    actions: ok ? actions : [],
    blockers: issues,
    warnings,
    nextAction: ok ? "review_apply_gate" : "resolve_desired_state_blockers",
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}

export function buildTuicCredentialLifecycleApplyPlan({
  desiredState = {},
  inputPath = "",
  executeProductionMutation = false
} = {}) {
  const plan = buildTuicCredentialLifecyclePlan({ desiredState, inputPath });
  const blockers = [...plan.blockers];

  if (executeProductionMutation !== true) {
    blockers.push(blocker("execute_production_mutation_required", "flags.--execute-production-mutation"));
  } else if (plan.activationSurface === "explicit-restart") {
    blockers.push(blocker("production_runtime_adapter_required", "runtime.adapter"));
  } else {
    blockers.push(blocker("runtime_apply_adapter_not_implemented", "runtime.adapter"));
  }

  return {
    ...plan,
    type: "gccgw_edge_tuic_credential_lifecycle_apply_plan",
    generatedBy: "gccgw edge tuic-credentials apply",
    mode: "apply",
    ok: false,
    blockers,
    nextAction: "stop_before_runtime_mutation",
    mutation: false,
    productionAuthority: false,
    redacted: true
  };
}
