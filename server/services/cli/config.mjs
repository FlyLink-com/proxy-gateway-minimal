import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_CONFIG_PATHS = [
  "config/gccgw.config.json",
  "config/gccgw.config.example.json"
];

const FILE_KEYS = [
  "envFile",
  "runtimeDbPath",
  "controlDbPath",
  "handoffDir"
];

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function resolveConfigPath(configPath) {
  if (configPath) {
    return resolve(configPath);
  }
  for (const candidate of DEFAULT_CONFIG_PATHS) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }
  return resolve(DEFAULT_CONFIG_PATHS[1]);
}

function readConfig(configPath) {
  const resolved = resolveConfigPath(configPath);
  const parsed = JSON.parse(readFileSync(resolved, "utf8"));
  return {
    config: parsed,
    configSource: {
      configured: true,
      valuesRedacted: true
    }
  };
}

function sortedProfileEntries(config) {
  return Object.entries(config?.profiles || {}).sort(([a], [b]) => a.localeCompare(b));
}

function safeExecution(execution = {}) {
  return {
    allowProductionMutation: execution.allowProductionMutation === true,
    approvalRequired: execution.approvalRequired === true
  };
}

function safePublicBaseUrl(value) {
  const configured = hasValue(value);
  return {
    configured,
    https: configured && String(value).startsWith("https://"),
    loopback: configured && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/.test(String(value))
  };
}

function safeFiles(files = {}) {
  const result = {};
  for (const key of FILE_KEYS) {
    result[key] = {
      configured: hasValue(files[key])
    };
  }
  return result;
}

function safeProfile(name, profile = {}) {
  return {
    name,
    environment: hasValue(profile.environment) ? String(profile.environment) : "unspecified",
    riskTier: hasValue(profile.riskTier) ? String(profile.riskTier) : "unknown",
    execution: safeExecution(profile.execution),
    publicBaseUrl: safePublicBaseUrl(profile.publicBaseUrl),
    files: safeFiles(profile.files),
    valuesRedacted: true
  };
}

function validationIssue({ profile, field, code, severity = "error" }) {
  return {
    profile: String(profile || "config"),
    field: String(field || "unknown"),
    code: String(code),
    severity
  };
}

function validateProfile(name, profile) {
  const issues = [];
  if (!["C", "B", "A"].includes(profile?.riskTier)) {
    issues.push(validationIssue({ profile: name, field: "riskTier", code: "invalid_risk_tier" }));
  }
  if (!isObject(profile?.execution)) {
    issues.push(validationIssue({ profile: name, field: "execution", code: "missing_execution" }));
  }
  if (!isObject(profile?.files)) {
    issues.push(validationIssue({ profile: name, field: "files", code: "missing_files" }));
  }
  if (profile?.riskTier === "A" && profile?.execution?.allowProductionMutation === true && profile?.execution?.approvalRequired !== true) {
    issues.push(validationIssue({ profile: name, field: "execution.approvalRequired", code: "a_tier_requires_approval" }));
  }
  if (hasValue(profile?.publicBaseUrl) && !safePublicBaseUrl(profile.publicBaseUrl).https && !safePublicBaseUrl(profile.publicBaseUrl).loopback) {
    issues.push(validationIssue({ profile: name, field: "publicBaseUrl", code: "public_base_url_must_be_https_or_loopback" }));
  }
  for (const key of FILE_KEYS) {
    if (!hasValue(profile?.files?.[key])) {
      issues.push(validationIssue({ profile: name, field: `files.${key}`, code: "missing_file_reference", severity: "warning" }));
    }
  }
  return issues;
}

function validateConfig(config, profile) {
  const issues = [];
  if (config?.type !== "gccgw_config") {
    issues.push(validationIssue({ field: "type", code: "invalid_config_type" }));
  }
  if (!isObject(config?.profiles)) {
    issues.push(validationIssue({ field: "profiles", code: "missing_profiles" }));
    return issues;
  }
  const entries = sortedProfileEntries(config);
  if (profile) {
    const selected = config.profiles[profile];
    if (!selected) {
      issues.push(validationIssue({ profile, field: "profiles", code: "unknown_profile" }));
      return issues;
    }
    return validateProfile(profile, selected);
  }
  for (const [name, value] of entries) {
    issues.push(...validateProfile(name, value));
  }
  return issues;
}

function formatListText(payload) {
  return `${[
    "gccgw config profiles",
    "",
    "Profile | Environment | Risk | Production mutation | Approval | Public URL | Runtime DB | Control DB | Handoff",
    "--- | --- | --- | --- | --- | --- | --- | --- | ---",
    ...payload.profiles.map((profile) => [
      profile.name,
      profile.environment,
      profile.riskTier,
      profile.execution.allowProductionMutation ? "yes" : "no",
      profile.execution.approvalRequired ? "yes" : "no",
      profile.publicBaseUrl.configured ? "configured" : "missing",
      profile.files.runtimeDbPath.configured ? "configured" : "missing",
      profile.files.controlDbPath.configured ? "configured" : "missing",
      profile.files.handoffDir.configured ? "configured" : "missing"
    ].join(" | ")),
    "",
    "Values are redacted. Use the config file for real paths and URLs."
  ].join("\n")}\n`;
}

function formatShowText(payload) {
  return `${[
    `gccgw config profile: ${payload.profile}`,
    "",
    `Environment: ${payload.environment}`,
    `Risk tier: ${payload.riskTier}`,
    `Production mutation: ${payload.execution.allowProductionMutation ? "allowed by profile" : "not allowed by profile"}`,
    `Approval required: ${payload.execution.approvalRequired ? "yes" : "no"}`,
    `Public base URL: ${payload.publicBaseUrl.configured ? "configured" : "missing"}`,
    `Runtime DB: ${payload.files.runtimeDbPath.configured ? "configured" : "missing"}`,
    `Control DB: ${payload.files.controlDbPath.configured ? "configured" : "missing"}`,
    `Handoff dir: ${payload.files.handoffDir.configured ? "configured" : "missing"}`,
    "",
    "Values are redacted. Real data remains in the config file."
  ].join("\n")}\n`;
}

function formatValidationText(payload) {
  const lines = [
    "gccgw config validation",
    "",
    `OK: ${payload.ok ? "yes" : "no"}`,
    `Profile: ${payload.profile || "all"}`
  ];
  if (payload.issues.length > 0) {
    lines.push("", "Issues:");
    for (const issue of payload.issues) {
      lines.push(`- ${issue.severity} ${issue.profile}.${issue.field}: ${issue.code}`);
    }
  }
  lines.push("", "Values are redacted. Real data remains in the config file.");
  return `${lines.join("\n")}\n`;
}

export function buildGccgwConfigList({ configPath, format = "text" } = {}) {
  const { config, configSource } = readConfig(configPath);
  const payload = {
    type: "gccgw_config_list",
    generatedBy: "gccgw config list",
    configSource,
    profiles: sortedProfileEntries(config).map(([name, profile]) => safeProfile(name, profile)),
    valuesRedacted: true
  };
  return format === "json" ? payload : formatListText(payload);
}

export function buildGccgwConfigShow({ configPath, profile, format = "text" } = {}) {
  const { config, configSource } = readConfig(configPath);
  const selected = config?.profiles?.[profile];
  if (!selected) {
    throw new Error(`Unknown gccgw config profile: ${profile || "(missing)"}`);
  }
  const safe = safeProfile(profile, selected);
  const payload = {
    type: "gccgw_config_profile",
    generatedBy: "gccgw config show",
    configSource,
    profile: safe.name,
    environment: safe.environment,
    riskTier: safe.riskTier,
    execution: safe.execution,
    publicBaseUrl: safe.publicBaseUrl,
    files: safe.files,
    valuesRedacted: true
  };
  return format === "json" ? payload : formatShowText(payload);
}

export function buildGccgwConfigValidation({ configPath, profile, format = "text" } = {}) {
  const { config, configSource } = readConfig(configPath);
  const issues = validateConfig(config, profile);
  const payload = {
    type: "gccgw_config_validation",
    generatedBy: "gccgw config validate",
    configSource,
    ...(profile ? { profile } : {}),
    ok: issues.filter((issue) => issue.severity === "error").length === 0,
    issues,
    valuesRedacted: true
  };
  return format === "json" ? payload : formatValidationText(payload);
}
