#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VALID_RISKS = new Set(["A", "B", "C"]);
const REQUIRED_STATE_FILES = [
  "project-state/lanes.json",
  "project-state/current.json",
  "project-state/tasks.json"
];
const GOVERNANCE_STATE_FILES = [
  "project-state/gates.json",
  "project-state/repair-policy.json"
];
const GUARDED_METADATA_DOCS = new Set([
  "docs/PROJECT_CONTEXT.md",
  "docs/VALIDATION_BASELINE.md",
  "docs/AGENT_ONBOARDING.md",
  "docs/CURRENT_SOURCE_AND_ARCHIVE_BOUNDARY.md"
]);
const SENSITIVE_PATTERN_DEFINITIONS = [
  { type: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i },
  { type: "token", pattern: /\btoken=([A-Za-z0-9._~+/=-]{8,})/i },
  { type: "password", pattern: /\bpassword\s*=\s*([^,\s"']{4,})/i },
  { type: "api-key", pattern: /\bapi[_-]?key\s*=\s*([^,\s"']{8,})/i },
  { type: "subscription-url", pattern: /\bhttps?:\/\/[^\s"']+[?&]token=([A-Za-z0-9._~+/=-]{8,})/i },
  { type: "proxy-uri", pattern: /\b(?:ss|vless|vmess|trojan|hysteria2|tuic):\/\/([A-Za-z0-9+/=_:;,.?&%#@-]{8,})/i }
];
const SAFE_PLACEHOLDER_VALUE_PATTERN = /^(?:placeholder|redacted|dummy|fake|sample|example)(?:[-_ ]?(?:value|secret|token|password|api[-_]?key|key|url|uri))?$/i;
const SAFE_PLACEHOLDER_WRAPPER_PATTERN = /^(?:<[^>\r\n]*(?:placeholder|redacted|dummy|fake|sample|example)[^>\r\n]*>|\[[^\]\r\n]*(?:placeholder|redacted|dummy|fake|sample|example)[^\]\r\n]*\]|\.\.\.)$/i;

function readJson(rootDir, path, errors) {
  const fullPath = join(rootDir, path);
  try {
    return JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    errors.push(`${path}: invalid or unreadable JSON (${error.message})`);
    return null;
  }
}

function existsRepoPath(rootDir, path) {
  return existsSync(join(rootDir, path));
}

function isGlobLike(path) {
  return /[*?[\]{}]/.test(path);
}

function normalizedRepoPath(path) {
  return normalize(path).replaceAll("\\", "/");
}

function checkRequiredArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label}: expected a non-empty array`);
    return false;
  }
  return true;
}

function checkPathReferences(rootDir, owner, paths, errors) {
  if (!Array.isArray(paths)) {
    errors.push(`${owner}: expected path references to be an array`);
    return;
  }

  for (const path of paths) {
    if (typeof path !== "string" || path.trim() === "") {
      errors.push(`${owner}: path reference must be a non-empty string`);
      continue;
    }
    if (isGlobLike(path)) {
      continue;
    }
    if (!existsRepoPath(rootDir, path)) {
      errors.push(`${owner}: referenced path does not exist: ${normalizedRepoPath(path)}`);
    }
  }
}

function checkPathPatternArray(owner, paths, errors) {
  if (!Array.isArray(paths) || paths.length === 0) {
    errors.push(`${owner}: expected a non-empty array`);
    return;
  }

  for (const path of paths) {
    if (typeof path !== "string" || path.trim() === "") {
      errors.push(`${owner}: path reference must be a non-empty string`);
    }
  }
}

function isSafePlaceholderValue(value) {
  const trimmed = String(value ?? "").trim();
  return SAFE_PLACEHOLDER_WRAPPER_PATTERN.test(trimmed) || SAFE_PLACEHOLDER_VALUE_PATTERN.test(trimmed);
}

function isSafePlaceholderMatch(definition, match) {
  const capturedValues = match.slice(1).filter((value) => value !== undefined);
  if (capturedValues.length > 0) {
    return capturedValues.every(isSafePlaceholderValue);
  }
  return definition.type === "private-key" && /\b(?:placeholder|redacted|dummy|fake|sample|example)\b/i.test(match[0]);
}

function globalPattern(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function hasMetadataHeader(text) {
  return (
    />\s*Status:/i.test(text) &&
    />\s*-\s*Type:/i.test(text) &&
    />\s*-\s*Risk:/i.test(text) &&
    />\s*-\s*Execution authority:/i.test(text) &&
    />\s*-\s*Production impact:/i.test(text) &&
    />\s*-\s*Source of truth for:/i.test(text)
  );
}

function lineClaimsHistoricalAsCurrent(line) {
  return (
    /\bhistorical\b/i.test(line) &&
    /\bcurrent authority\b/i.test(line) &&
    !/\b(not|notCurrentAuthority|not-current|do not|don't|is not|are not|not a)\b/i.test(line)
  );
}

function checkLanes(rootDir, lanesState, errors) {
  const lanes = lanesState?.lanes;
  if (!checkRequiredArray(lanes, "project-state/lanes.json lanes", errors)) {
    return new Set();
  }

  const laneIds = new Set();
  for (const lane of lanes) {
    const label = `lane ${lane?.id ?? "<missing-id>"}`;
    for (const field of ["id", "name", "status", "riskBoundary", "purpose"]) {
      if (typeof lane?.[field] !== "string" || lane[field].trim() === "") {
        errors.push(`${label}: missing ${field}`);
      }
    }
    if (lane?.id) {
      if (laneIds.has(lane.id)) {
        errors.push(`${label}: duplicate lane id`);
      }
      laneIds.add(lane.id);
    }
    checkPathReferences(rootDir, `${label} primaryDocs`, lane?.primaryDocs, errors);
    if (!Array.isArray(lane?.primaryCodeAreas)) {
      errors.push(`${label}: primaryCodeAreas must be an array`);
    }
    if (!Array.isArray(lane?.nonGoals) || lane.nonGoals.length === 0) {
      errors.push(`${label}: nonGoals must be a non-empty array`);
    }
  }
  return laneIds;
}

function checkTasks(rootDir, tasksState, laneIds, errors) {
  const tasks = tasksState?.tasks;
  if (!checkRequiredArray(tasks, "project-state/tasks.json tasks", errors)) {
    return;
  }

  const taskIds = new Set();
  for (const task of tasks) {
    const label = `task ${task?.id ?? "<missing-id>"}`;
    for (const field of ["id", "risk", "status", "lane", "title", "goal"]) {
      if (typeof task?.[field] !== "string" || task[field].trim() === "") {
        errors.push(`${label}: missing ${field}`);
      }
    }
    if (task?.id) {
      if (taskIds.has(task.id)) {
        errors.push(`${label}: duplicate task id`);
      }
      taskIds.add(task.id);
    }
    if (task?.risk && !VALID_RISKS.has(task.risk)) {
      errors.push(`${label}: unsupported risk tier ${task.risk}`);
    }
    if (task?.lane && !laneIds.has(task.lane)) {
      errors.push(`${label}: lane is not declared in project-state/lanes.json: ${task.lane}`);
    }
    checkPathPatternArray(`${label} allowedFiles`, task?.allowedFiles, errors);
    if (!Array.isArray(task?.forbiddenActions) || task.forbiddenActions.length === 0) {
      errors.push(`${label}: forbiddenActions must be a non-empty array`);
    }
    if (!Array.isArray(task?.validation) || task.validation.length === 0) {
      errors.push(`${label}: validation must be a non-empty array`);
    }
    if (task?.risk === "A" && !String(task?.status ?? "").includes("completed") && !String(task?.status ?? "").includes("blocked")) {
      errors.push(`${label}: A-tier task must remain blocked until runbook and approval`);
    }
  }
}

function checkCurrentState(rootDir, currentState, errors) {
  if (!currentState || typeof currentState !== "object") {
    errors.push("project-state/current.json: expected object");
    return;
  }
  checkPathReferences(rootDir, "project-state/current.json sourceDocs", currentState.sourceDocs, errors);
  if (!Array.isArray(currentState.productSpine) || currentState.productSpine.length === 0) {
    errors.push("project-state/current.json: productSpine must be a non-empty array");
  }
  if (currentState.productionSnapshot?.requiresLiveVerification !== true) {
    errors.push("project-state/current.json: productionSnapshot.requiresLiveVerification must be true");
  }
  if (!Array.isArray(currentState.forbiddenInStateFiles) || currentState.forbiddenInStateFiles.length === 0) {
    errors.push("project-state/current.json: forbiddenInStateFiles must be a non-empty array");
  }
}

export function findSensitivePatternFindings(rootDir, paths) {
  const findings = [];
  for (const path of paths) {
    const fullPath = join(rootDir, path);
    if (!existsSync(fullPath)) {
      continue;
    }
    const text = readFileSync(fullPath, "utf8");
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const definition of SENSITIVE_PATTERN_DEFINITIONS) {
        const pattern = globalPattern(definition.pattern);
        const matches = line.matchAll(pattern);
        if ([...matches].some((match) => !isSafePlaceholderMatch(definition, match))) {
          findings.push({
            path,
            line: index + 1,
            type: definition.type
          });
        }
      }
    }
  }
  return findings;
}

function checkSensitivePatterns(rootDir, paths, errors) {
  for (const finding of findSensitivePatternFindings(rootDir, paths)) {
    errors.push(`${finding.path}:${finding.line}: raw secret pattern matched (${finding.type})`);
  }
}

function checkActiveDocGuards(rootDir, sourceDocs, errors) {
  for (const path of sourceDocs) {
    if (!GUARDED_METADATA_DOCS.has(path)) {
      continue;
    }
    const fullPath = join(rootDir, path);
    if (!existsSync(fullPath)) {
      continue;
    }
    const text = readFileSync(fullPath, "utf8");
    if (!hasMetadataHeader(text)) {
      errors.push(`${path}: metadata header is missing Status/Type/Risk/Execution authority/Production impact/Source of truth fields`);
    }
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (lineClaimsHistoricalAsCurrent(line)) {
        errors.push(`${path}:${index + 1}: authority drift risk; historical material is claimed as current authority`);
      }
    }
  }
}

export function checkProjectState(options = {}) {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const errors = [];

  for (const path of REQUIRED_STATE_FILES) {
    if (!existsRepoPath(rootDir, path)) {
      errors.push(`${path}: required file is missing`);
    }
  }

  const lanesState = readJson(rootDir, "project-state/lanes.json", errors);
  const currentState = readJson(rootDir, "project-state/current.json", errors);
  const tasksState = readJson(rootDir, "project-state/tasks.json", errors);

  const laneIds = checkLanes(rootDir, lanesState, errors);
  checkCurrentState(rootDir, currentState, errors);
  checkTasks(rootDir, tasksState, laneIds, errors);

  const sourceDocs = [
    ...(Array.isArray(lanesState?.sourceDocs) ? lanesState.sourceDocs : []),
    ...(Array.isArray(currentState?.sourceDocs) ? currentState.sourceDocs : []),
    ...(Array.isArray(tasksState?.sourceDocs) ? tasksState.sourceDocs : [])
  ];
  checkPathReferences(rootDir, "project-state sourceDocs", sourceDocs, errors);
  const checkedPaths = [...new Set([
    ...REQUIRED_STATE_FILES,
    ...GOVERNANCE_STATE_FILES,
    ...sourceDocs,
    ...GUARDED_METADATA_DOCS
  ])];
  checkSensitivePatterns(rootDir, checkedPaths, errors);
  checkActiveDocGuards(rootDir, checkedPaths, errors);

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    summary: ok
      ? `validated project-state from ${relative(process.cwd(), rootDir) || "."}`
      : `project-state check failed with ${errors.length} error(s)`
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkProjectState();
  if (result.ok) {
    console.log(result.summary);
  } else {
    console.error(result.summary);
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  }
}
