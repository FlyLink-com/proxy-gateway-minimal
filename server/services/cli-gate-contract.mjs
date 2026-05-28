export const CLI_GATE_CONTRACT_SCHEMA_VERSION = "cli-gate-contract/v1";

const GLOBAL_FORBIDDEN_INPUT_KEYS = [
  "approvalPhrase",
  "apiSecret",
  "authorization",
  "credential",
  "password",
  "rawHost",
  "rawLog",
  "rawLogs",
  "rawPort",
  "rawUrl",
  "secret",
  "subscriptionUrl",
  "token",
  "yaml"
];

const COMMAND_SPECS = {
  "platform.resource-package": {
    title: "Platform resource package summary",
    family: "operator-platform",
    riskTier: "B",
    allowedActors: ["operator"],
    allowedModes: ["dry-run", "apply"],
    defaultMode: "dry-run",
    sideEffectClass: "local_artifact",
    executionAuthority: "local_only",
    requiredNextAction: "build_operator_safe_resource_package_or_fix_blockers",
    produces: ["operator-safe-resource-package-summary"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS
  },
  "platform.access-inventory.summary": {
    title: "Platform access inventory summary",
    family: "operator-platform",
    riskTier: "B",
    allowedActors: ["operator"],
    allowedModes: ["dry-run", "apply"],
    defaultMode: "dry-run",
    sideEffectClass: "local_artifact",
    executionAuthority: "local_only",
    requiredNextAction: "write_safe_summary_or_continue_review",
    produces: ["safe-json-summary"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS
  },
  "platform.clean-edge.readiness": {
    title: "Clean edge readiness handoff",
    family: "operator-edge",
    riskTier: "A",
    allowedActors: ["operator"],
    allowedModes: ["dry-run", "apply"],
    defaultMode: "dry-run",
    sideEffectClass: "handoff_packet",
    executionAuthority: "not_granted",
    requiredNextAction: "request_clean_edge_rebuild_execution_approval",
    produces: ["approval-readiness-packet"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS
  },
  "channel.runtime.handoff": {
    title: "Channel runtime execution handoff",
    family: "operator-channel",
    riskTier: "A",
    allowedActors: ["operator"],
    allowedModes: ["dry-run", "apply"],
    defaultMode: "dry-run",
    sideEffectClass: "handoff_packet",
    executionAuthority: "not_granted",
    requiredNextAction: "request_risk_a_runtime_canary_approval",
    produces: ["approval-readiness-packet"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS
  },
  "channel.subscription.activation-package": {
    title: "Channel subscription activation package",
    family: "operator-channel",
    riskTier: "A",
    allowedActors: ["operator"],
    allowedModes: ["dry-run", "apply"],
    defaultMode: "dry-run",
    sideEffectClass: "handoff_packet",
    executionAuthority: "not_granted",
    requiredNextAction: "request_risk_a_subscription_output_activation_approval",
    produces: ["activation-request-package"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS
  },
  "customer.network.diagnose": {
    title: "Customer network diagnostic bundle",
    family: "customer-support",
    riskTier: "B",
    allowedActors: ["customer", "operator"],
    allowedModes: ["dry-run", "apply"],
    defaultMode: "dry-run",
    sideEffectClass: "local_diagnostic",
    executionAuthority: "local_only",
    requiredNextAction: "return_redacted_diagnostic_bundle",
    produces: ["redacted-diagnostic-summary"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS,
    forbiddenTruthyKeys: ["includeRawLogs"]
  },
  "customer.subscription.status": {
    title: "Customer subscription status summary",
    family: "customer-access",
    riskTier: "C",
    allowedActors: ["customer", "operator"],
    allowedModes: ["dry-run"],
    defaultMode: "dry-run",
    sideEffectClass: "read_only",
    executionAuthority: "local_only",
    requiredNextAction: "return_redacted_status_summary",
    produces: ["safe-json-summary"],
    forbiddenInputKeys: GLOBAL_FORBIDDEN_INPUT_KEYS
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeActorType(actorType) {
  return actorType === "customer" ? "customer" : "operator";
}

function normalizeMode(mode) {
  return mode === "apply" ? "apply" : "dry-run";
}

function forbiddenKeySet(spec) {
  return new Set((spec?.forbiddenInputKeys ?? GLOBAL_FORBIDDEN_INPUT_KEYS).map((key) => key.toLowerCase()));
}

function scanForbiddenInput(value, blockedKeys, path = []) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (blockedKeys.has(key.toLowerCase())) {
      findings.push(nextPath.join("."));
      continue;
    }
    findings.push(...scanForbiddenInput(child, blockedKeys, nextPath));
  }
  return findings;
}

function scanForbiddenTruthyInput(value, blockedKeys, path = []) {
  if (!value || typeof value !== "object") {
    return [];
  }
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (blockedKeys.has(key.toLowerCase()) && child === true) {
      findings.push(nextPath.join("."));
      continue;
    }
    findings.push(...scanForbiddenTruthyInput(child, blockedKeys, nextPath));
  }
  return findings;
}

function safeCommandSummary(spec) {
  return {
    title: spec.title,
    family: spec.family,
    riskTier: spec.riskTier,
    allowedActors: [...spec.allowedActors],
    allowedModes: [...spec.allowedModes],
    defaultMode: spec.defaultMode,
    sideEffectClass: spec.sideEffectClass,
    executionAuthority: spec.executionAuthority,
    requiredNextAction: spec.requiredNextAction,
    produces: [...spec.produces],
    forbiddenInputKeys: [...spec.forbiddenInputKeys].sort(),
    forbiddenTruthyKeys: [...(spec.forbiddenTruthyKeys ?? [])].sort()
  };
}

function blockedResult({ commandId, reason, forbiddenFields = [], requiredNextAction = null }) {
  return {
    ok: false,
    commandId,
    status: "blocked",
    reason,
    executionAuthority: "not_granted",
    ...(forbiddenFields.length ? { forbiddenFields } : {}),
    ...(requiredNextAction ? { requiredNextAction } : {}),
    safety: { noSideEffects: true, redacted: true }
  };
}

export function buildCliCommandManifest() {
  return {
    schemaVersion: CLI_GATE_CONTRACT_SCHEMA_VERSION,
    defaultMode: "dry-run",
    allowsShellPassthrough: false,
    commands: Object.fromEntries(
      Object.entries(COMMAND_SPECS).map(([commandId, spec]) => [commandId, safeCommandSummary(spec)])
    ),
    safety: {
      noShellPassthrough: true,
      defaultDryRun: true,
      noApprovalSubmission: true,
      noProductionExecution: true,
      redactedOutputOnly: true
    }
  };
}

export function evaluateCliGateRequest(request = {}) {
  const commandId = String(request.commandId ?? "");
  const spec = COMMAND_SPECS[commandId];
  if (!spec) {
    return blockedResult({ commandId, reason: "unknown_command" });
  }

  const actorType = normalizeActorType(request.actorType);
  if (!spec.allowedActors.includes(actorType)) {
    return blockedResult({ commandId, reason: "actor_not_allowed" });
  }

  const mode = normalizeMode(request.mode ?? spec.defaultMode);
  if (!spec.allowedModes.includes(mode)) {
    return blockedResult({ commandId, reason: "mode_not_allowed", requiredNextAction: spec.requiredNextAction });
  }

  const forbiddenFields = [
    ...scanForbiddenInput(request.input ?? {}, forbiddenKeySet(spec)),
    ...scanForbiddenTruthyInput(
      request.input ?? {},
      new Set((spec.forbiddenTruthyKeys ?? []).map((key) => key.toLowerCase()))
    )
  ];
  if (forbiddenFields.length > 0) {
    return blockedResult({
      commandId,
      reason: "forbidden_input_field",
      forbiddenFields: forbiddenFields.sort()
    });
  }

  if (mode === "apply" && spec.riskTier === "A") {
    return blockedResult({
      commandId,
      reason: "a_tier_handoff_only",
      requiredNextAction: spec.requiredNextAction
    });
  }

  return {
    ok: true,
    commandId,
    status: "allowed",
    actorType,
    mode,
    riskTier: spec.riskTier,
    sideEffectClass: spec.sideEffectClass,
    executionAuthority: spec.executionAuthority,
    requiredNextAction: spec.requiredNextAction,
    safety: {
      shellPassthrough: false,
      redacted: true,
      approvalSubmitted: false,
      productionMutation: false
    },
    command: safeCommandSummary(spec)
  };
}

export function listCliGateCommandSpecs() {
  return clone(COMMAND_SPECS);
}
