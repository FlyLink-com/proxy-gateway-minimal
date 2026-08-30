#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
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
const REVIEWED_COMPATIBILITY_STATE_SHA256 = new Map([
  ["project-state/lanes.json", "99f806d846b7a3639650238814956e6f06645fa0f96869a98dd19a476667da52"],
  ["project-state/current.json", "081a2f3a56fdb8fef459b7071a47582507f79dbc901d5b182f65e16969c37c26"],
  ["project-state/tasks.json", "d27722ccd62441707084eced794ff68845aadd69a196b807487ab85a29886817"]
]);
const LIVE_AUTHORITY_KEYS = new Set([
  "activeblockers",
  "activedirections",
  "activegoal",
  "activetasks",
  "currentwork",
  "issuestates",
  "readytasks",
  "currenttask",
  "nexttask",
  "nextaction"
]);
const LANE_ENTRY_KEYS = new Set([
  "id", "name", "status", "riskBoundary", "purpose", "primaryDocs",
  "primaryCodeAreas", "nonGoals"
]);
const TASK_ENTRY_KEYS = new Set([
  "id", "risk", "status", "lane", "title", "goal", "allowedFiles",
  "forbiddenActions", "validation"
]);
const ARCHITECTURE_VIEW_KEYS = new Set(["mentalModelAtObservation", "layers", "nonGoals"]);
const COORDINATION_SNAPSHOT_KEYS = new Set([
  "id", "name", "primaryIssue", "portalLifecycleIssue", "commercialFoundationIssue",
  "coinsLifecycleIssues", "legacyRetirementIssues", "operationsPlaneIssues",
  "releaseMaturityIssues", "leadAgent", "operatorRole", "riskBoundary",
  "historicalDependencyPromotionIssues"
]);
const PRODUCTION_SNAPSHOT_KEYS = new Set([
  "snapshotState", "evidenceCutoff", "requiresLiveVerification", "controlPlaneAuthority",
  "dataPlaneCapacity", "sourceActivationBoundaryAtObservation", "releaseUnits",
  "companySitePromotionBoundary", "cloudflareSiteBoundary", "trafficEvidence", "notes"
]);
const SOURCE_ACTIVATION_BOUNDARY_KEYS = new Set([
  "sourceCommit", "productionState", "unactivatedExtensions", "legacyEnabledState", "boundary"
]);
const VALIDATION_SNAPSHOT_KEYS = new Set([
  "latestReleaseArtifactRun", "releaseArtifactCount", "releaseArtifactAvailability",
  "latestDependencyArtifactRun", "latestCiRun", "latestCodeqlRun",
  "latestCloudflareWorkflowRun", "githubGateBoundary", "projectStateCheck",
  "cTierDiffCheck", "releaseSourceCommit", "releaseEvidenceDate",
  "sourceCutoffBoundary", "githubProject"
]);
const SOURCE_SECURITY_SNAPSHOT_KEYS = new Set([
  "inventoryDate", "codeScanningOpen", "dependabotOpen", "secretScanningOpen",
  "workflowActionPins", "recentRemediation", "requiresLiveVerification", "boundary"
]);
const WORKFLOW_ACTION_PINS_KEYS = new Set(["totalUses", "fullShaPinned", "mutableTagUses"]);
const ACCESS_MODEL_SNAPSHOT_KEYS = new Set(["companySite", "userPortal", "admin", "internalRuntime"]);
const BLOCKER_RECEIPT_KEYS = new Set(["id", "summary", "sourceDoc"]);
const RELEASE_UNIT_KEYS = new Set(["id", "state", "identity"]);
const TASK_MERGED_RECEIPT_KEYS = new Set([
  "pr", "sourceCommit", "lane", "receipt", "productionState", "artifactEvidence"
]);
const TASK_MERGED_RECEIPT_REQUIRED_KEYS = new Set([
  "pr", "sourceCommit", "lane", "receipt", "productionState"
]);
const REPO_KEYS = new Set([
  "name", "github", "localPath", "defaultBranch", "legacyCheckoutRule"
]);
const A3_PRODUCTION_CLOSEOUT_KEYS = new Set([
  "observedAt", "sourceCommit", "mergedPrs", "mergedPrRange", "releaseArtifactRun",
  "sourceArtifactId", "dependencyArtifactRun", "dependencyArtifactId", "productionDryRun",
  "previousRelease", "release", "target", "state", "candidateStartAttempts",
  "rollbackStartAttempts", "candidatePreparationReceiptSha256",
  "localPromotionReceiptSha256", "remotePromotionReceiptSha256",
  "publicHealthReceiptSha256", "identityImpact", "deployNote", "issueReceipt", "boundary"
]);
const LANES_A3_PRODUCTION_CLOSEOUT_REQUIRED_KEYS = new Set([
  "observedAt", "sourceCommit", "mergedPrRange", "releaseArtifactRun",
  "dependencyArtifactRun", "productionDryRun", "previousRelease", "release", "state",
  "candidateStartAttempts", "rollbackStartAttempts", "candidatePreparationReceiptSha256",
  "localPromotionReceiptSha256", "remotePromotionReceiptSha256",
  "publicHealthReceiptSha256", "identityImpact", "deployNote", "issueReceipt", "boundary"
]);
const CURRENT_A3_PRODUCTION_CLOSEOUT_REQUIRED_KEYS = new Set([
  "observedAt", "sourceCommit", "mergedPrs", "releaseArtifactRun", "sourceArtifactId",
  "dependencyArtifactRun", "dependencyArtifactId", "productionDryRun", "previousRelease",
  "release", "target", "state", "candidateStartAttempts", "rollbackStartAttempts",
  "candidatePreparationReceiptSha256", "localPromotionReceiptSha256",
  "remotePromotionReceiptSha256", "publicHealthReceiptSha256", "identityImpact",
  "deployNote", "issueReceipt", "boundary"
]);
const TASK_A3_PRODUCTION_CLOSEOUT_REQUIRED_KEYS = new Set([
  "observedAt", "sourceCommit", "mergedPrs", "releaseArtifactRun", "sourceArtifactId",
  "dependencyArtifactRun", "dependencyArtifactId", "productionDryRun", "previousRelease",
  "release", "state", "candidateStartAttempts", "rollbackStartAttempts",
  "candidatePreparationReceiptSha256", "localPromotionReceiptSha256",
  "remotePromotionReceiptSha256", "publicHealthReceiptSha256", "identityImpact",
  "deployNote", "issueReceipt", "boundary"
]);
const LANES_GOVERNANCE_BOUNDARY_KEYS = new Set([
  "releaseArtifact", "dependencyArtifact", "ci", "codeql", "cloudflareWorkflow",
  "ruleset", "environments", "sourceSecurity", "requiresLiveVerification"
]);
const LANES_SOURCE_BOUNDARY_KEYS = new Set([
  "observedAt", "preChangeHead", "deployedControlPlaneSource",
  "sourceProductionState", "boundary"
]);
const LANES_GITHUB_PROJECT_INDEX_KEYS = new Set([
  "name", "number", "url", "verifiedAt", "repository", "laneOptions",
  "internalOnlyLanes", "authority", "migrationBoundary"
]);
const TASK_HISTORICAL_BOUNDARY_KEYS = new Set([
  "sourceSnapshotAtReconciliation", "productionRuntimeEvidenceCutoff",
  "requiresLiveVerification", "rule"
]);
const TASK_SOURCE_SECURITY_KEYS = new Set([
  "codeScanning", "dependabot", "secretScanning", "codeQuality", "workflowActionPins",
  "recentRemediation", "requiresLiveVerification", "boundary"
]);
const TASK_ISSUE_RECEIPT_KEYS = new Set([
  "observedAt", "state", "pr479State", "productionState", "reason"
]);
const TASK_CI_GOVERNANCE_KEYS = new Set([
  "inventoryDate", "master", "ruleset", "environments", "ci", "codeql",
  "cloudflareWorkflow", "dependencyArtifact", "releaseArtifact", "requiresLiveVerification"
]);
const BRANCH_CONTEXT_KEYS = new Set([
  "stableBaseline", "sourceReconciliation", "deployedControlPlane",
  "sourceProductionState", "githubProjectIndex", "mergePolicyObservation", "boundary"
]);
const SOURCE_RECONCILIATION_KEYS = new Set(["observedAt", "preChangeHead", "boundary"]);
const DEPLOYED_CONTROL_PLANE_KEYS = new Set(["observedAt", "sourceCommit", "release", "state"]);
const GITHUB_PROJECT_INDEX_KEYS = new Set([
  "name", "number", "url", "verifiedAt", "repository", "authority", "migrationBoundary"
]);
const MERGE_POLICY_OBSERVATION_KEYS = new Set([
  "inventoryDate", "rulesetState", "environmentState", "alertGateState",
  "requiresLiveVerification", "boundary"
]);
const COMPANY_SITE_PROMOTION_KEYS = new Set([
  "requiresLiveVerification", "historicalEvidenceCutoff", "productionBranch",
  "autoAssignCustomDomains", "deploymentAtObservation", "deploymentRecordAtObservation",
  "deploymentSourceAtObservation", "publicAliases", "latestStagedCandidate",
  "operationalProof", "promotionAuthority"
]);
const LATEST_STAGED_CANDIDATE_KEYS = new Set([
  "vercelUrl", "githubDeployment", "sourceCommit", "state",
  "productionEnvironment", "publicAliasesAssigned"
]);
const CLOUDFLARE_SITE_BOUNDARY_KEYS = new Set([
  "requiresLiveVerification", "historicalEvidenceCutoff", "githubWorkflowAutoDeploy",
  "githubWorkflowEnvironment", "nativeGitTrigger", "nativeGitProductionBranch",
  "nativeDeployCommand", "providerSettingChangedAt", "lastProvenActiveDeployment",
  "lastProvenActiveVersion", "latestSavedCandidateVersion", "latestBuildId",
  "customDomainCountAtLastProof", "proofState", "activeDeploymentLiveReadAtThisCutoff"
]);
const TRAFFIC_EVIDENCE_KEYS = new Set([
  "requiresLiveVerification", "historicalEvidenceCutoff", "capabilitySource",
  "runtimeState", "reconciliationState", "identityGate", "identitySync",
  "lastObservedCounts", "identityImpactEvidence", "accountingCompleteness",
  "accountingBehavior", "quotaBehavior", "mapApply", "trustLoop", "automation"
]);
const TRAFFIC_LAST_OBSERVED_COUNT_KEYS = new Set([
  "runtime", "mapped", "missing", "stale", "changed", "missingMaterial"
]);
const EXPECTED_STATE_STATUS = new Map([
  ["project-state/lanes.json", "taxonomy-and-dated-evidence"],
  ["project-state/current.json", "dated-compatibility-snapshot"],
  ["project-state/tasks.json", "dated-compatibility-contract"]
]);
const EXPECTED_STATE_PURPOSE = new Map([
  ["project-state/lanes.json", "Versioned lane definitions, safety boundaries, and dated evidence pointers for Phase 2. It is not a live Agent queue. Project #1's Lane field is the mutable navigation classification for current items; native Issue and PR records own item state, scope, risk, and done criteria. Resolve current sequencing with fresh native reads."],
  ["project-state/current.json", "Dated, reviewed coordination snapshot for Agent orientation. It is not a live work index; verify GitHub, deployment, and production facts from their authoritative sources before relying on them, and before every Risk A action."],
  ["project-state/tasks.json", "Dated compatibility receipts for repository-local tooling. Task status values are observations at the stated cutoff, not a live queue or current Issue state. Resolve all current work and sequencing from native Issue and PR records."]
]);
const EXPECTED_AUTHORITY_VALUES = new Map([
  ["project-state/lanes.json.purpose", "Versioned lane definitions, safety boundaries, and dated evidence pointers for Phase 2. It is not a live Agent queue. Project #1's Lane field is the mutable navigation classification for current items; native Issue and PR records own item state, scope, risk, and done criteria. Resolve current sequencing with fresh native reads."],
  ["project-state/current.json.branchContext.githubProjectIndex.authority", "Mutable work projection and navigation index only; current Issue and PR state comes from their native records, and deployed/runtime state requires dated receipts plus fresh task-specific verification."],
  ["project-state/current.json.branchContext.githubProjectIndex.migrationBoundary", "This baseline configures Project fields, views, and native workflows; it does not migrate work, production, or approval authority into Project."],
  ["project-state/current.json.branchContext.boundary", "Do not copy live Issue, PR, Project-item, or branch counts into this file. Resolve mutable GitHub facts live when a decision depends on them."],
  ["project-state/current.json.productionSnapshot.companySitePromotionBoundary.promotionAuthority", "separate exact Risk A approval"],
  ["project-state/current.json.productionSnapshot.controlPlaneAuthority", "Vultr Japan"],
  ["project-state/lanes.json.githubProjectIndex.authority", "Project fields are a mutable projection and navigation index. The Project Lane field classifies current item membership for navigation; lane definitions and safety boundaries remain reviewed here. Native Issue/PR records, exact receipts, and fresh production evidence remain authoritative in their own domains."],
  ["project-state/lanes.json.githubProjectIndex.migrationBoundary", "This baseline configures Project fields, views, and native workflows; it does not migrate work, production, or approval authority into Project."],
  ["project-state/lanes.json.a3ProductionCloseout.boundary", "This receipt updates only the A3 dependency-materialization and production-operations evidence. It validates the exact deployed source, not the later master source cutoff or live Project state."],
  ["project-state/lanes.json.lanes[8].purpose", "Define serialized inventory, exact approval, validation, rollback, and redacted-evidence requirements for production actions without becoming an implementation backlog. Current production and rollback availability always require fresh task-specific reads; every Risk A action requires separate authority bound to its exact subject."],
  ["project-state/lanes.json.lanes[7].nonGoals[1]", "treating the completed promotion receipt as authority for another deployment, schema change or feature activation"],
  ["project-state/tasks.json.tasks[11].forbiddenActions[1]", "reuse the consumed promotion-09 approval for another production action"],
  ["project-state/tasks.json.tasks[17].forbiddenActions[1]", "claim source as deployment or current-live evidence"]
]);
const STATE_TOP_LEVEL_KEYS = new Map([
  ["project-state/lanes.json", new Set([
    "schemaVersion", "lastUpdated", "observedAt", "timezone", "requiresLiveIssueRead",
    "status", "purpose", "a3ProductionCloseout", "governanceBoundary", "sourceDocs",
    "lanes", "sourceBoundary", "githubProjectIndex"
  ])],
  ["project-state/current.json", new Set([
    "schemaVersion", "lastUpdated", "observedAt", "timezone", "status", "purpose",
    "requiresLiveIssueRead", "compatibilityBoundary", "sourceDocs", "repo", "branchContext",
    "a3ProductionCloseout", "architectureView", "productSpine", "directionsAtObservation",
    "coordinationSnapshotAtObservation", "productionSnapshot", "validationSnapshot",
    "sourceSecuritySnapshot", "accessModelSnapshot", "blockerReceiptsAtObservation",
    "forbiddenInStateFiles"
  ])],
  ["project-state/tasks.json", new Set([
    "schemaVersion", "lastUpdated", "observedAt", "timezone", "status", "purpose",
    "requiresLiveIssueRead", "sourceDocs", "historicalBoundary", "sourceReceipts",
    "a3ProductionCloseout", "issue437ReceiptAtObservation", "ciGovernance", "sourceSecurity",
    "tasks"
  ])]
]);
const TASK_SOURCE_RECEIPT_KEYS = new Set(["inventoryDate", "master", "boundary", "merged"]);
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

function checkReviewedCompatibilityStateDigests(rootDir, errors) {
  const invalidPaths = new Set();
  for (const [path, expectedSha256] of REVIEWED_COMPATIBILITY_STATE_SHA256) {
    const inspected = inspectRegularRepoFile(rootDir, path);
    if (!inspected.ok) {
      errors.push(`${path}: reviewed compatibility file must be a regular non-symlink file within the repository`);
      invalidPaths.add(path);
      continue;
    }
    const reviewedBytes = readFileSync(inspected.path);
    const canonicalLineEndingBytes = Buffer.from(
      reviewedBytes.toString("utf8").replace(/\r\n/gu, "\n"),
      "utf8"
    );
    const actualSha256 = createHash("sha256")
      .update(canonicalLineEndingBytes)
      .digest("hex");
    if (actualSha256 !== expectedSha256) {
      errors.push(`${path}: content digest must match the reviewed compatibility contract`);
    }
  }
  return invalidPaths;
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

function isUnsafeRepoPath(path) {
  const normalized = String(path).replaceAll("\\", "/");
  return (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  );
}

function inspectRegularRepoFile(rootDir, path) {
  try {
    const rootRealPath = realpathSync(rootDir);
    const unresolvedPath = resolve(rootDir, path);
    const fileStat = lstatSync(unresolvedPath);
    const fileRealPath = realpathSync(unresolvedPath);
    const relativeRealPath = relative(rootRealPath, fileRealPath).replaceAll("\\", "/");
    const expectedRealPath = resolve(rootRealPath, path);
    const contained = relativeRealPath !== ".." &&
      !relativeRealPath.startsWith("../") &&
      !isAbsolute(relativeRealPath);
    return {
      ok: contained && fileStat.isFile() && !fileStat.isSymbolicLink() && fileRealPath === expectedRealPath,
      path: fileRealPath
    };
  } catch {
    return { ok: false, path: null };
  }
}

function checkRequiredArray(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label}: expected a non-empty array`);
    return false;
  }
  return true;
}

function isExplicitCalendarDate(value) {
  if (typeof value !== "string") {
    return false;
  }
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!calendarDate) {
    return false;
  }
  const [, yearText, monthText, dayText] = calendarDate;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (day < 1 || day > daysInMonth) {
    return false;
  }
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function currentLosAngelesDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function checkFreshnessMetadata(owner, state, errors, today) {
  const observedAtValid = isExplicitCalendarDate(state?.observedAt);
  const lastUpdatedValid = typeof state?.lastUpdated === "string" &&
    isExplicitCalendarDate(state.lastUpdated);
  if (!observedAtValid) {
    errors.push(`${owner}: observedAt must be an explicit ISO-8601 calendar date`);
  }
  if (!lastUpdatedValid) {
    errors.push(`${owner}: lastUpdated must be an explicit ISO-8601 date`);
  }
  if (observedAtValid && lastUpdatedValid && state.observedAt > state.lastUpdated) {
    errors.push(`${owner}: observedAt must not be later than lastUpdated`);
  }
  if (observedAtValid && state.observedAt > today) {
    errors.push(`${owner}: observedAt must not be in the future`);
  }
  if (lastUpdatedValid && state.lastUpdated > today) {
    errors.push(`${owner}: lastUpdated must not be in the future`);
  }
  if (state?.timezone !== "America/Los_Angeles") {
    errors.push(`${owner}: timezone must be America/Los_Angeles`);
  }
  for (const field of ["schemaVersion", "purpose"]) {
    if (typeof state?.[field] !== "string" || state[field].trim() === "") {
      errors.push(`${owner}: ${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(state?.sourceDocs) || state.sourceDocs.length === 0) {
    errors.push(`${owner}: sourceDocs must be a non-empty array of exact document paths`);
  }
  if (state?.requiresLiveIssueRead !== true) {
    errors.push(`${owner}: requiresLiveIssueRead must be true`);
  }
  const expectedStatus = EXPECTED_STATE_STATUS.get(owner);
  if (expectedStatus && state?.status !== expectedStatus) {
    errors.push(`${owner}: status must be ${expectedStatus}`);
  }
  const expectedPurpose = EXPECTED_STATE_PURPOSE.get(owner);
  if (expectedPurpose && state?.purpose !== expectedPurpose) {
    errors.push(`${owner}: purpose must match the reviewed dated authority boundary`);
  }
}

function checkAllowedTopLevelFields(owner, state, errors) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return;
  }
  const allowedKeys = STATE_TOP_LEVEL_KEYS.get(owner);
  for (const key of Object.keys(state)) {
    if (!allowedKeys?.has(key)) {
      errors.push(`${owner}.${key}: unsupported top-level field; update the reviewed dated schema explicitly`);
    }
  }
}

function checkAllowedObjectFields(owner, value, allowedKeys, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${owner}: expected an object in the reviewed compatibility schema`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${owner}.${key}: unsupported field in reviewed compatibility schema`);
    }
  }
  return true;
}

function checkRequiredObjectFields(owner, value, allowedKeys, requiredKeys, errors) {
  if (!checkAllowedObjectFields(owner, value, allowedKeys, errors)) {
    return false;
  }
  for (const key of requiredKeys) {
    const entry = value[key];
    if (
      !Object.hasOwn(value, key) ||
      entry === null ||
      entry === undefined ||
      (typeof entry === "string" && entry.trim() === "")
    ) {
      errors.push(`${owner}.${key}: required field is missing or empty`);
    }
  }
  return true;
}

function checkExpectedAuthorityValue(fieldPath, value, expectedValue, errors) {
  if (value !== expectedValue) {
    errors.push(`${fieldPath}: authority value must match the reviewed fail-closed boundary`);
  }
}

function checkRequiredStringArray(owner, value, errors) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    errors.push(`${owner}: expected a non-empty string array`);
    return false;
  }
  return true;
}

function checkRequiredObjectArray(owner, value, allowedKeys, errors, requiredKeys = allowedKeys) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${owner}: expected a non-empty object array`);
    return false;
  }
  value.forEach((entry, index) => {
    checkRequiredObjectFields(`${owner}[${index}]`, entry, allowedKeys, requiredKeys, errors);
  });
  return true;
}

function checkRequiredBoolean(owner, value, expectedValue, errors) {
  if (value !== expectedValue) {
    errors.push(`${owner}: must be ${expectedValue}`);
  }
}

function checkTaskSourceReceipts(tasksState, errors) {
  const receipts = tasksState?.sourceReceipts;
  if (!checkRequiredObjectFields(
    "project-state/tasks.json.sourceReceipts",
    receipts,
    TASK_SOURCE_RECEIPT_KEYS,
    TASK_SOURCE_RECEIPT_KEYS,
    errors
  )) {
    return;
  }
  checkRequiredObjectArray(
    "project-state/tasks.json.sourceReceipts.merged",
    receipts.merged,
    TASK_MERGED_RECEIPT_KEYS,
    errors,
    TASK_MERGED_RECEIPT_REQUIRED_KEYS
  );
}

function isMutableGitHubInventoryKey(key) {
  const normalizedKey = canonicalStateKey(key);
  return (
    /(?:issue|pullrequest|pr|branch)count$/.test(normalizedKey) ||
    /^(?:open|active|current|remote).*(?:issues|drafts|pullrequests|prs|branches)$/.test(normalizedKey)
  );
}

function normalizeStateText(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/gu, " ");
}

function normalizeDiscourseText(value) {
  return normalizeStateText(value)
    .replace(/\s+(?:\/+|-+)\s+/gu, "; ")
    .replace(/[()[\]{}•·▪◦]/gu, ";")
    .replace(/\s*;\s*/gu, "; ");
}

function findFirstMatchEnd(value, patterns) {
  let first = null;
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (match && (first === null || match.index < first.index)) {
      first = { index: match.index, end: match.index + match[0].length };
    }
  }
  return first?.end ?? -1;
}

function canonicalStateKey(key) {
  return normalizeStateText(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitSemanticClauses(value) {
  return normalizeStateText(value)
    .split(/(?:[.!?;]+|\b(?:but|however|although|yet)\b)/iu)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function isExactReviewedAuthorityValue(fieldPath, value) {
  const expectedValue = EXPECTED_AUTHORITY_VALUES.get(fieldPath);
  return expectedValue !== undefined && value === expectedValue;
}

function hasDatedObservationContext(value) {
  return (
    /\b\d{4}-\d{2}-\d{2}\b/u.test(value) ||
    /\b(?:dated|historical|observed|observation|cutoff|recorded|consumed)\b/iu.test(value)
  );
}

function hasFreshLiveVerificationBoundary(value) {
  return (
    /\b(?:requires?|required|must|resolve|verify|read)\b[^.!?;]{0,120}\b(?:fresh|live)\b[^.!?;]{0,100}\b(?:verification|read(?:back)?|inventory|evidence|issue|pr|record|state)\b/iu.test(value) ||
    /\b(?:fresh|live)\b[^.!?;]{0,100}\b(?:task-specific\s+)?(?:verification|read(?:back)?|inventory|evidence|issue|pr|record)\b/iu.test(value) ||
    /\bresolve\b[^.!?;]{0,140}\b(?:production|runtime|deployment|release)\s+state\b[^.!?;]{0,60}\blive\b/iu.test(value)
  );
}

function hasProjectWorkSelectionClaim(value) {
  return (
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,120}\b(?:tells?\b[^.!?;]{0,60}\bwhat\s+to\s+do\s+next|(?:selects?|chooses?)\b[^.!?;]{0,80}\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,40}\bas\s+next)\b/iu.test(value) ||
    /\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,80}\bis\s+(?:selected|chosen)\s+by\s+(?:the\s+)?project(?:\s*#?\d+)?\b/iu.test(value) ||
    /\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,100}\baccording\s+to\s+(?:the\s+)?project(?:\s*#?\d+)?\b[^.!?;]{0,60}\b(?:is|comes)\s+(?:first|next)\b/iu.test(value) ||
    /\baccording\s+to\s+(?:the\s+)?project(?:\s*#?\d+)?\b[^.!?;]{0,100}\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,60}\b(?:is|comes)\s+(?:first|next)\b/iu.test(value) ||
    /\b(?:selected|chosen)\s+by\s+(?:the\s+)?project(?:\s*#?\d+)?\b[^.!?;]{0,80}\bas\s+next\b[^.!?;]{0,80}\b(?:issue|pr)\s*#?\d+\b/iu.test(value)
  );
}

function hasProjectCurrentScope(value) {
  return (
    hasProjectWorkSelectionClaim(value) ||
    (
      /\bproject\b(?!-(?:quota|state|check)\b)/iu.test(value) &&
      /\b(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task|authoritative|canonical|source\s+of\s+truth|system\s+of\s+record)\b/iu.test(value)
    )
  );
}

function hasProjectOwnerBoundary(value) {
  return (
    /\b(?:native\s+(?:issue|pr)|fresh\s+(?:native\s+)?(?:issue|pr)|issue\s+and\s+pr\s+records|issue\/pr\s+records)\b/iu.test(value) ||
    /\bresolve\b[^.!?;]{0,100}\b(?:native|fresh)\b/iu.test(value)
  );
}

function hasProjectNavigationBoundary(value) {
  return (
    /\b(?:for\s+navigation|navigation\s+only|projection\s+and\s+navigation\s+index\s+only|mutable\s+navigation\s+projection)\b/iu.test(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,100}\b(?:navigation|projection)\b[^.!?;]{0,60}\bonly\b/iu.test(value)
  );
}

function hasExplicitProjectDenial(value) {
  return (
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,100}\bis\s+(?:the\s+)?authoritative\s+only\s+for\s+navigation\b[^.!?;]{0,100}\bnever\b[^.!?;]{0,60}\b(?:current\s+)?work\b/iu.test(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,120}\b(?:is|remains)\s+not\s+(?:the\s+)?(?:authority|authoritative|canonical|source\s+of\s+truth|system\s+of\s+record)\b/iu.test(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,120}\b(?:does\s+not|cannot|never)\b[^.!?;]{0,80}\b(?:own|control|govern|direct|determine|define|drive|assign|provide|select|choose)\w*\b/iu.test(value) ||
    /\bno\s+project(?:\s+field)?\b[^.!?;]{0,100}\b(?:owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?|selects?|chooses?)\b/iu.test(value) ||
    /\bproject\s+status\b[^.!?;]{0,100}\bneither\b[^.!?;]{0,100}\bnor\b/iu.test(value) ||
    /\bproject\s+status\b[^.!?;]{0,100}\b(?:carries?|grants?)\s+no\b[^.!?;]{0,80}\bauthority\b/iu.test(value)
  );
}

function hasAffirmativeProjectAuthority(value) {
  return (
    hasProjectWorkSelectionClaim(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,140}\b(?:owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?|selects?|chooses?)\b[^.!?;]{0,120}\b(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task)\b/iu.test(value) ||
    /\b(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task)\b[^.!?;]{0,140}\b(?:comes?\s+from|follows?|is\s+(?:owned|controlled|governed|directed|determined|defined|driven|assigned|provided|selected)\s+by)\b[^.!?;]{0,100}\bproject(?:\s*#?\d+)?\b/iu.test(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,140}\b(?:is|remains|becomes?|serves?\s+as|acts?\s+as)\s+(?:the\s+)?(?:authoritative|canonical|source\s+of\s+truth|system\s+of\s+record)\b/iu.test(value) ||
    /\b(?:use|follow|consult|read)\b[^.!?;]{0,60}\bproject(?:\s*#?\d+)?\b[^.!?;]{0,40}\b(?:for|as)\s+(?:the\s+)?(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task)\b/iu.test(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,100}[, ]\s*(?:and\s+)?(?:it|the\s+project)\s+\b(?:owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?|selects?|chooses?)\b/iu.test(value)
  );
}

function isSafeProjectClause(value) {
  if (hasExplicitProjectDenial(value)) {
    return true;
  }
  if (hasAffirmativeProjectAuthority(value)) {
    return false;
  }
  return hasProjectNavigationBoundary(value) && hasProjectOwnerBoundary(value);
}

function hasApprovalFutureScope(value) {
  const hasApprovalSubject = /\b(?:approval|receipt|authorization|sign[- ]?off)\b/iu.test(value);
  const hasFutureAction = /\b(?:next|future|another|later)\b[^.!?;]{0,120}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b/iu.test(value);
  const hasPermissionClaim = /\b(?:authori[sz](?:e[sd]?|ation)|approv(?:e[sd]?|al)|permit(?:s|ted|ting)?|permission|sufficient|enough|reuse[sd]?|reusable|valid|effective|appl(?:y|ies)|covers?|inherits?|lets?|allows?|grants?|go[- ]?ahead|green\s+light)\b/iu.test(value);
  const hasDeployVerb = /\b(?:deploy|roll(?:out|\s+out)|release|execute|mutate|promote|rollback)\w*\b/iu.test(value);
  return hasApprovalSubject && (hasFutureAction || (hasPermissionClaim && hasDeployVerb));
}

function hasFreshApprovalRequirement(value) {
  return (
    /\b(?:obtain|requires?|required|must\s+obtain)\b[^.!?;]{0,120}\b(?:new|fresh|separate|independent|exact)\b[^.!?;]{0,80}\b(?:approval|receipt|authorization|risk\s+a)\b[^.!?;]{0,160}\b(?:any|next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b/iu.test(value) ||
    /\b(?:new|fresh|separate|independent|exact)\b[^.!?;]{0,80}\b(?:approval|receipt|authorization|risk\s+a)\b[^.!?;]{0,80}\b(?:is\s+required|must\s+be\s+obtained)\b[^.!?;]{0,160}\b(?:any|next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b/iu.test(value)
  );
}

function hasExplicitApprovalDenial(value) {
  return (
    /\b(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,120}\b(?:does\s+not|cannot|never|must\s+not)\b[^.!?;]{0,80}\b(?:authori[sz]e|approve|permit|apply|cover|grant|allow|let|suffice|reuse|carry)\w*\b/iu.test(value) ||
    /\b(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,100}\bgrants?\s+no\s+(?:authority|permission)\b/iu.test(value) ||
    /\bno\s+(?:old|prior|previous|dated|historical|existing|consumed)?\s*(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,120}\b(?:authori[sz]es?|approves?|permits?|applies?|covers?|grants?|allows?)\b/iu.test(value) ||
    /\bno\s+(?:next|future|another|later)\s+(?:mutation|deploy(?:ment)?|rollout|release|execution|action|promotion|rollback)\b[^.!?;]{0,120}\b(?:is|remains)\s+(?:authori[sz]ed|approved|permitted|covered)\b[^.!?;]{0,100}\b(?:approval|receipt|authorization|sign[- ]?off)\b/iu.test(value) ||
    /\b(?:requires?|must\s+obtain)\b[^.!?;]{0,100}\b(?:new|fresh|separate|independent|exact)\b[^.!?;]{0,80}\b(?:approval|receipt|authorization|risk\s+a)\b/iu.test(value) ||
    /\b(?:old|prior|previous|dated|historical|existing|consumed)\s+(?:approval|receipt|authorization|sign[- ]?off)(?:\s+status)?\s+(?:is|remains?)\s+unknown\b/iu.test(value) ||
    /\b(?:a\s+)?(?=[^.!?;]{0,80}\b(?:new|fresh|separate|independent|exact)\b)(?:(?:new|fresh|separate|independent|exact)\s+)+(?:risk\s+a\s+)?(?:approval|authorization|sign[- ]?off)\s+is\s+required\b/iu.test(value) ||
    /\b(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,80}\bis\s+(?:invalid|insufficient)\b/iu.test(value) ||
    /\b(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,80}\b(?:is|remains?|stays?)\s+(?:invalid|insufficient|unknown)\b/iu.test(value) ||
    /\bdo\s+not\s+(?:use|reuse|apply|carry)\b[^.!?;]{0,100}\b(?:approval|receipt|authorization|sign[- ]?off)\b/iu.test(value)
  );
}

function isSafeApprovalClause(value, fullText, fieldPath) {
  if (
    /\.(?:forbiddenActions|nonGoals)\[\d+\]$/.test(fieldPath) &&
    /\bwithout\b[^.!?;]{0,80}\b(?:separate\s+)?(?:exact\s+)?approval\b/iu.test(value)
  ) {
    return true;
  }
  if (hasExplicitApprovalDenial(value)) {
    return true;
  }
  if (
    hasExplicitApprovalDenial(fullText) &&
    hasFreshApprovalRequirement(fullText) &&
    !hasContradictoryApprovalAuthority(fullText)
  ) {
    return true;
  }
  return (
    hasDatedObservationContext(fullText) &&
    hasFreshLiveVerificationBoundary(fullText) &&
    /\b(?:requires?|must)\b[^.!?;]{0,120}\b(?:new|fresh|separate|independent|exact)\b[^.!?;]{0,80}\b(?:approval|receipt|authorization|risk\s+a)\b/iu.test(value)
  );
}

function hasAffirmativeProductionClaim(value) {
  return (
    /\b(?:production|runtime|deployment|release)(?:\s+(?:health|status|state|availability))?\s*(?::|=|\bis\b|\bremains\b|\bstays?\b|\blooks?\b|\bappears?\b|\bseems?\b|\bcontinues?\b|\bhas\s+been\b)\s*(?!not\b)(?:currently\s+|now\s+)?(?:green|healthy|verified|aligned|available|active|live|running|deployed|operational|normal(?:ly)?|functioning|working|works?|passing|passed|up)\b/iu.test(value) ||
    /\b(?:current\s+)?(?:production|runtime|deployment|release)\s+(?:continues?\s+(?:normally|to\s+(?:operate|run|work))|works|runs|operates?)\b/iu.test(value) ||
    /\b(?:production|runtime|deployment|release)\s+(?:health|status|verification|checks?)\b[^.!?;]{0,60}\b(?:passed|passing|green|healthy|verified|operational)\b/iu.test(value) ||
    /\b(?:production|runtime|deployment|release)\b[^.!?;]{0,50}\b(?:is\s+serving\s+traffic|endpoint\s+responds?)\b/iu.test(value)
  );
}

function hasProductionCurrentScope(value) {
  return (
    hasAffirmativeProductionClaim(value) ||
    /\bcurrent\b[^.!?;]{0,80}\b(?:production|runtime|deployment|release)\b|\b(?:production|runtime|deployment|release)\b[^.!?;]{0,80}\bcurrent\b/iu.test(value)
  );
}

function hasExplicitProductionDenial(value) {
  return (
    /\b(?:does\s+not|did\s+not|cannot|never)\b[^.!?;]{0,80}\b(?:claim|assert|prove|establish|infer|represent|demonstrate|verify|revalidate)\w*\b[^.!?;]{0,100}\b(?:current|live)?\s*(?:production|runtime|deployment|release)\b/iu.test(value) ||
    /\bnot\s+(?:a\s+)?current\s+(?:production|runtime|deployment|release)\s+(?:claim|assertion|proof|state|status)\b/iu.test(value) ||
    /\bwithout\b[^.!?;]{0,80}\b(?:validating|verifying|revalidating|treating)\b[^.!?;]{0,100}\b(?:current|live)?\s*(?:production|runtime|deployment|release)\b/iu.test(value) ||
    /\bno\s+(?:current\s+)?(?:production|runtime|deployment|release)\b[^.!?;]{0,100}\b(?:without|unless|until)\b[^.!?;]{0,80}\b(?:fresh|live)\b/iu.test(value)
  );
}

function isSafeProductionClause(value, fullText) {
  if (hasExplicitProductionDenial(value)) {
    return true;
  }
  if (hasAffirmativeProductionClaim(value)) {
    return false;
  }
  if (
    /\bcurrent\s+(?:production|runtime|deployment|release)(?:\s+state)?\b[^.!?;]{0,100}\b(?:is|remains?|stays?)\s+unknown\b/iu.test(value) &&
    hasFreshLiveVerificationBoundary(fullText)
  ) {
    return true;
  }
  if (
    /\bcurrent\b[^.!?;]{0,80}\b(?:production|runtime|deployment|release)\b[^.!?;]{0,100}\bunknown\b[^.!?;]{0,100}\brequires?\b[^.!?;]{0,80}\b(?:fresh|live)\b/iu.test(value) ||
    /\bcurrent\s+(?:production|runtime|deployment|release)\s+state\b[^.!?;]{0,80}\brequires?\b[^.!?;]{0,80}\b(?:fresh|live)\b/iu.test(value) ||
    /\bcurrent\s+(?:production|runtime|deployment|release)\b[^.!?;]{0,80}\b(?:is|remains?|stays?)\s+unknown\b[^.!?;]{0,100}\b(?:pending|until|requires?)\b[^.!?;]{0,80}\b(?:fresh|live)\b[^.!?;]{0,80}\b(?:verification|read(?:back)?|inventory|evidence)\b/iu.test(value)
  ) {
    return true;
  }
  return (
    hasDatedObservationContext(fullText) &&
    hasFreshLiveVerificationBoundary(fullText) &&
    /\bcurrent\b[^.!?;]{0,100}\b(?:production|runtime|deployment|release)\b|\b(?:production|runtime|deployment|release)\b[^.!?;]{0,100}\bcurrent\b/iu.test(value)
  );
}

function hasCrossClauseApprovalAuthority(value) {
  return (
    /\b(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,160}[.!?;]+\s*(?:(?:and|but|however|yet|nevertheless|nonetheless)\s+)?(?:(?:please\s+)?(?:use|reuse|apply|carry)\s+it\b|it\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?(?:should|must|can|may|will)\s+be\s+(?:used|reused|applied)\b|it\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?(?:authori[sz]es?|approves?|permits?|covers?|allows?|grants?)\b)[^.!?;]{0,120}\b(?:next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b/iu.test(value) ||
    /\b(?:authori[sz]ed|approved|permitted|covered|allowed)\s+by\s+(?:the\s+)?(?:(?:old|prior|previous|dated|historical|existing|consumed)\s+)?(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,140}\b(?:next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b/iu.test(value) ||
    /\b(?:next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b[^.!?;]{0,140}\b(?:is|remains|stays?)\s+(?:authori[sz]ed|approved|permitted|covered|allowed)\s+by\s+(?:the\s+)?(?:(?:old|prior|previous|dated|historical|existing|consumed)\s+)?(?:approval|receipt|authorization|sign[- ]?off)\b/iu.test(value)
  );
}

function hasCrossClauseProjectAuthority(value) {
  return (
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,160}[.!?;]+\s*(?:(?:and|but|however|yet|nevertheless|nonetheless)\s+)?(?:it|this\s+project|the\s+project)\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?\b(?:owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?|selects?|chooses?)\b[^.!?;]{0,100}\b(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task)\b/iu.test(value) ||
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,160}[.!?;]+\s*(?:(?:and|but|however|yet|nevertheless|nonetheless)\s+)?(?:it|this\s+project|the\s+project)\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?\b(?:selects?|chooses?)\b[^.!?;]{0,80}\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,40}\bas\s+next\b/iu.test(value)
  );
}

function hasCrossClauseProductionClaim(value) {
  return /\b(?:production|runtime|deployment|release)\b[^.!?;]{0,160}[.!?;]+\s*(?:it|this(?:\s+(?:production|runtime|deployment|release))?)\s+(?:is|remains|looks?|appears?|seems?|stays?|has\s+been)\s+(?!not\b)(?:green|healthy|verified|aligned|available|active|live|running|deployed|operational|normal(?:ly)?|functioning|working|passing|passed|up|serving\s+traffic)\b/iu.test(value);
}

function hasContradictoryProjectAuthority(value) {
  if (!hasExplicitProjectDenial(value)) {
    return false;
  }
  const affirmativeTailPattern = /(?:it|this\s+project|the\s+project|project(?:\s*#?\d+)?)\s+(?:(?:still|now|nevertheless|nonetheless|instead|therefore)\s+)?(?:(?:owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?)\b[^.!?;]{0,100}\b(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task)\b|(?:selects?|chooses?)\b[^.!?;]{0,80}\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,40}\bas\s+next\b)/iu;
  const denialEnd = findFirstMatchEnd(value, [
    /\bproject(?:\s*#?\d+)?\b[^.!?;]{0,140}\b(?:does\s+not|cannot|never|must\s+not|is\s+not|remains\s+not)\b/iu,
    /\bno\s+project(?:\s+field)?\b[^.!?;]{0,140}\b(?:authority|owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?|selects?|chooses?)\b/iu,
    /\bproject\s+status\b[^.!?;]{0,140}\b(?:no\s+authority|neither)\b/iu
  ]);
  return (
    /(?:[.!?;,:/]+|\s-\s|\b(?:and|but|however|yet|while|whereas|then|nevertheless|nonetheless)\b[\s,:-]*)\s*(?:it|this\s+project|the\s+project|project(?:\s*#?\d+)?)\s+(?:(?:still|now|nevertheless|nonetheless|instead|therefore)\s+)?(?:(?:owns?|controls?|governs?|directs?|determines?|defines?|drives?|assigns?|provides?)\b[^.!?;]{0,100}\b(?:current|live|active|status|work|queue|backlog|priorit(?:y|ies)|sequenc(?:e|ing)|work[- ]?order|next\s+task)\b|(?:selects?|chooses?)\b[^.!?;]{0,80}\b(?:issue|pr)\s*#?\d+\b[^.!?;]{0,40}\bas\s+next\b)/iu.test(value) ||
    (denialEnd >= 0 && affirmativeTailPattern.test(value.slice(denialEnd)))
  );
}

function hasContradictoryApprovalAuthority(value) {
  if (!hasExplicitApprovalDenial(value)) {
    return false;
  }
  const affirmativeTailPattern = /(?:(?:the\s+)?(?:(?:old|prior|previous|dated|historical|existing|consumed)\s+)?(?:approval|receipt|authorization|sign[- ]?off)|it)\s+(?:(?:still|now|nevertheless|nonetheless|instead|therefore)\s+)?(?:(?:is|remains?|stays?)\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?(?:valid|effective|sufficient|enough)|authori[sz]es?|approves?|permits?|covers?|allows?|grants?|lets?)\b[^.!?;]{0,120}\b(?:it|next|future|another|later|deployment|roll(?:out|\s+out)|release|mutation|execution|action|promotion|rollback)\b/iu;
  const invertedAffirmativeTailPatterns = [
    /\b(?:authori[sz]ed|approved|permitted|covered|allowed)\s+by\s+(?:the\s+)?(?:(?:old|prior|previous|dated|historical|existing|consumed)\s+)?(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,140}\b(?:next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b/iu,
    /\b(?:next|future|another|later)\b[^.!?;]{0,100}\b(?:mutation|deploy(?:ment)?|roll(?:out|\s+out)|release|execution|action|promotion|rollback)\b[^.!?;]{0,140}\b(?:is|remains|stays?)\s+(?:authori[sz]ed|approved|permitted|covered|allowed)\s+by\s+(?:the\s+)?(?:(?:old|prior|previous|dated|historical|existing|consumed)\s+)?(?:approval|receipt|authorization|sign[- ]?off)\b/iu
  ];
  const denialEnd = findFirstMatchEnd(value, [
    /\b(?:approval|receipt|authorization|sign[- ]?off)\b[^.!?;]{0,140}\b(?:does\s+not|cannot|never|must\s+not|invalid|insufficient|unknown|grants?\s+no)\b/iu,
    /\b(?:old|prior|previous|dated|historical|existing|consumed)\s+(?:approval|receipt|authorization|sign[- ]?off)(?:\s+status)?\s+(?:is|remains?)\s+unknown\b/iu,
    /\bno\s+(?:next|future|another|later)\s+(?:mutation|deploy(?:ment)?|rollout|release|execution|action|promotion|rollback)\b[^.!?;]{0,160}?\b(?:approval|receipt|authorization|sign[- ]?off)\b/iu,
    /\b(?:new|fresh|separate|independent|exact)\b[^.!?;]{0,80}\b(?:approval|receipt|authorization|risk\s+a)\b[^.!?;]{0,80}\b(?:is\s+required|must\s+be\s+obtained)\b/iu,
    /\b(?:obtain|requires?|required|must\s+obtain)\b[^.!?;]{0,120}\b(?:new|fresh|separate|independent|exact)\b[^.!?;]{0,80}\b(?:approval|receipt|authorization|risk\s+a)\b/iu
  ]);
  return (
    /(?:[.!?;,:/]+|\s-\s|\b(?:and|but|however|yet|while|whereas|then|nevertheless|nonetheless)\b[\s,:-]*)\s*(?:(?:the\s+)?(?:(?:old|prior|previous|dated|historical|existing|consumed)\s+)?(?:approval|receipt|authorization|sign[- ]?off)|it)\s+(?:(?:still|now|nevertheless|nonetheless|instead|therefore)\s+)?(?:(?:is|remains?|stays?)\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?(?:valid|effective|sufficient|enough)|authori[sz]es?|approves?|permits?|covers?|allows?|grants?|lets?)\b[^.!?;]{0,120}\b(?:it|next|future|another|later|deployment|roll(?:out|\s+out)|release|mutation|execution|action|promotion|rollback)\b/iu.test(value) ||
    (denialEnd >= 0 && (
      affirmativeTailPattern.test(value.slice(denialEnd)) ||
      invertedAffirmativeTailPatterns.some((pattern) => pattern.test(value.slice(denialEnd)))
    ))
  );
}

function hasContradictoryProductionAuthority(value) {
  const hasNegativeProductionBoundary = /\b(?:production|runtime|deployment|release)(?:\s+(?:health|status|state|availability))?\b[^.!?;/]{0,80}\b(?:is|remains?|stays?)\s+(?:unknown|not\s+(?:(?:proven|currently)\s+)?(?:green|healthy|verified|aligned|available|active|live|running|deployed|operational|normal(?:ly)?|functioning|working|passing|passed|up))\b/iu.test(value);
  const hasUnknownFreshBoundary = /\b(?:current\s+)?(?:production|runtime|deployment|release)(?:\s+state)?\b[^.!?;]{0,80}\b(?:is|remains?|stays?)\s+unknown\b[^.!?;]{0,100}\b(?:pending|until|requires?)\b[^.!?;]{0,80}\b(?:fresh|live)\b/iu.test(value);
  if (!hasExplicitProductionDenial(value) && !hasNegativeProductionBoundary && !hasUnknownFreshBoundary) {
    return false;
  }
  const affirmativeTailPattern = /(?:it|this\s+(?:production|runtime|deployment|release)|the\s+(?:production|runtime|deployment|release)|production|runtime|deployment|release)\s+(?:(?:still|now|nevertheless|nonetheless|instead|therefore)\s+)?(?:is|remains|looks?|appears?|seems?|stays?|has\s+been)\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?(?!not\b)(?:green|healthy|verified|aligned|available|active|live|running|deployed|operational|normal(?:ly)?|functioning|working|passing|passed|up|serving\s+traffic)\b/iu;
  const denialEnd = findFirstMatchEnd(value, [
    /\b(?:production|runtime|deployment|release)(?:\s+(?:health|status|state|availability))?\b[^.!?;]{0,100}\b(?:is|remains?|stays?)\s+(?:unknown|not\b)/iu,
    /\b(?:does\s+not|did\s+not|cannot|never)\b[^.!?;]{0,100}\b(?:current|live)?\s*(?:production|runtime|deployment|release)\b/iu,
    /\bno\s+(?:current\s+)?(?:production|runtime|deployment|release)\b[^.!?;]{0,120}\b(?:is|remains?|stays?|looks?|appears?|seems?|has\s+been)\s+(?:currently\s+|now\s+)?(?:green|healthy|verified|aligned|available|active|live|running|deployed|operational|normal(?:ly)?|functioning|working|passing|passed|up|serving\s+traffic)\b/iu
  ]);
  return (
    /(?:[.!?;,:/]+|\s-\s|\b(?:and|but|however|yet|while|whereas|then|nevertheless|nonetheless)\b[\s,:-]*)\s*(?:it|this\s+(?:production|runtime|deployment|release)|the\s+(?:production|runtime|deployment|release)|production|runtime|deployment|release)\s+(?:(?:still|now|nevertheless|nonetheless|instead|therefore)\s+)?(?:is|remains|looks?|appears?|seems?|stays?|has\s+been)\s+(?:(?:still|now|nevertheless|nonetheless)\s+)?(?!not\b)(?:green|healthy|verified|aligned|available|active|live|running|deployed|operational|normal(?:ly)?|functioning|working|passing|passed|up|serving\s+traffic)\b/iu.test(value) ||
    (denialEnd >= 0 && affirmativeTailPattern.test(value.slice(denialEnd)))
  );
}

function checkSemanticAuthorityClaim(value, errors, fieldPath) {
  if (typeof value !== "string") {
    return;
  }
  const text = normalizeStateText(value);
  const discourseText = normalizeDiscourseText(value);
  if (/\.(?:sourceDocs|primaryDocs|primaryCodeAreas|allowedFiles)\[\d+\]$/.test(fieldPath)) {
    return;
  }
  if (
    /(?:^|[.!?]\s+)(?:please\s+)?(?:merge|close|reopen|execute|start|continue|track|prioriti[sz]e|select|coordinate|implement)\b[^.\n]{0,160}\b(?:issue|pr)\s*#?\d+\b/i.test(text) ||
    /\b(?:must|should|shall|need\s+to|next\s+to)\s+(?:merge|close|reopen|execute|start|continue|track|prioriti[sz]e|select|coordinate|implement)\b[^.\n]{0,160}\b(?:issue|pr)\s*#?\d+\b/i.test(text) ||
    /(?:^|[.!?]\s+)next\s*(?::|-)\s*(?:merge|close|reopen|execute|start|continue|track|prioriti[sz]e|select|coordinate|implement)\b[^.\n]{0,160}\b(?:issue|pr)\s*#?\d+\b/i.test(text) ||
    /(?:^|[.!?]\s+)proceed\s+with\b[^.\n]{0,120}\b(?:issue|pr)\s*#?\d+\b(?:[^.\n]{0,40}\bnow\b)?/i.test(text) ||
    /\b(?:issue|pr)\s*#?\d+\b[^.\n]{0,100}\b(?:is|comes)\s+(?:first|next)\s+(?:in|on)\s+(?:the\s+)?queue\b/i.test(text) ||
    /\b(?:issue|pr)\s*#?\d+\b[^.\n]{0,80}\b(?:has|takes)\s+(?:the\s+)?(?:highest\s+|next\s+)?priority\b/i.test(text)
  ) {
    errors.push(`${fieldPath}: imperative Issue/PR sequencing is forbidden in dated project-state contracts`);
  }

  if (
    /\bcurrent\s+live\s+(?:work\s+)?queue\b/iu.test(text) ||
    /\b(?:is|are)\s+the\s+next\s+(?:task|action|step)\b/iu.test(text) ||
    /\bleads?\s+(?:the\s+)?(?:queue|work[- ]?order)\b/iu.test(text) ||
    /\brun\s+it\s+now\b/iu.test(text)
  ) {
    errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
    return;
  }

  if (isExactReviewedAuthorityValue(fieldPath, text)) {
    return;
  }

  if (
    hasContradictoryProjectAuthority(discourseText) ||
    hasContradictoryApprovalAuthority(discourseText) ||
    hasContradictoryProductionAuthority(discourseText)
  ) {
    errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
    return;
  }

  const hasWholeProjectBoundary =
    hasProjectNavigationBoundary(discourseText) &&
    hasProjectOwnerBoundary(discourseText) &&
    !hasAffirmativeProjectAuthority(discourseText) &&
    !hasCrossClauseProjectAuthority(discourseText);
  if (
    hasCrossClauseProjectAuthority(discourseText) ||
    (
      hasProjectCurrentScope(discourseText) &&
      hasAffirmativeProjectAuthority(discourseText) &&
      !hasExplicitProjectDenial(discourseText)
    )
  ) {
    errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
    return;
  }

  if (
    (hasCrossClauseApprovalAuthority(discourseText) && !hasExplicitApprovalDenial(discourseText)) ||
    hasCrossClauseProductionClaim(discourseText)
  ) {
    errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
    return;
  }

  for (const clause of splitSemanticClauses(discourseText)) {
    if (
      hasProjectCurrentScope(clause) &&
      !hasWholeProjectBoundary &&
      !isSafeProjectClause(clause)
    ) {
      errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
      return;
    }
    if (hasApprovalFutureScope(clause) && !isSafeApprovalClause(clause, discourseText, fieldPath)) {
      errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
      return;
    }
    if (hasProductionCurrentScope(clause) && !isSafeProductionClause(clause, discourseText)) {
      errors.push(`${fieldPath}: live work/authority claim is forbidden in dated project-state contracts`);
      return;
    }
  }
}
function checkNoLiveAuthorityFields(owner, value, errors, path = owner) {
  if (typeof value === "string") {
    checkSemanticAuthorityClaim(value, errors, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => checkNoLiveAuthorityFields(owner, entry, errors, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    const normalizedKey = canonicalStateKey(key);
    if (normalizedKey.endsWith("queue")) {
      errors.push(`${fieldPath}: queue fields are forbidden in dated project-state contracts`);
    }
    if (LIVE_AUTHORITY_KEYS.has(normalizedKey)) {
      errors.push(`${fieldPath}: active work-state fields are forbidden in dated project-state contracts`);
    }
    if (/^(?:ready|active|current|next|ordered|live)(?:task|tasks|work|workitem|workitems|action|actions|step|steps|blocker|blockers|lane|lanes|issue|issues|pr|prs|pullrequest|pullrequests)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: live work-order fields are forbidden in dated project-state contracts`);
    }
    if (/(?:backlog|priorit(?:y|ies))$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: backlog/priority fields are forbidden in dated project-state contracts`);
    }
    if (/^(?:ready|active|current|next|ordered|live).*(?:production|runtime|deployment|release|health|healthy|availability|available|aligned)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: live production/runtime fields are forbidden in dated project-state contracts`);
    }
    if (/^(?:production|runtime|deployment|release)(?:health|healthy|status|availability|available|aligned|ready|operational)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: live production/runtime fields are forbidden in dated project-state contracts`);
    }
    if (/(?:greenlight|goahead)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: stale approval aliases are forbidden in dated project-state contracts`);
    }
    if (/livequeue/.test(normalizedKey) || /^(?:task|work|issue|pr)(?:sequence|sequencing|order|priority)$/.test(normalizedKey) || normalizedKey === "projectauthority") {
      errors.push(`${fieldPath}: live queue/sequence authority fields are forbidden in dated project-state contracts`);
    }
    if (/^project.*(?:controls?|decides?|determines?|owns?).*(?:sequence|sequencing|queue|status|backlog|priority|workorder)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: Project sequencing authority fields are forbidden in dated project-state contracts`);
    }
    if (/(?:receipt|approval).*(?:reuse|reusable|valid|effective|applies|carryforward)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: stale approval reuse fields are forbidden in dated project-state contracts`);
    }
    if (/(?:authori[sz]e|approved|approval)/.test(normalizedKey) || /(?:ready|readiness)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: approval/readiness fields are forbidden in dated project-state contracts`);
    }
    if (normalizedKey.endsWith("authority")) {
      const expectedAuthorityValue = EXPECTED_AUTHORITY_VALUES.get(fieldPath);
      if (expectedAuthorityValue === undefined) {
        errors.push(`${fieldPath}: unreviewed authority fields are forbidden in project-state contracts`);
      } else if (entry !== expectedAuthorityValue) {
        errors.push(`${fieldPath}: authority value must match the reviewed fail-closed boundary`);
      }
    }
    if (isMutableGitHubInventoryKey(key)) {
      errors.push(`${fieldPath}: mutable GitHub inventory fields are forbidden in project-state contracts`);
    }
    if (/(?:token|password|apikey|secret|credentials?)(?:value|text|raw|data)?$/.test(normalizedKey) || /^(?:subscriptionurl|proxyuri)$/.test(normalizedKey)) {
      errors.push(`${fieldPath}: sensitive fields are forbidden in project-state contracts`);
    }
    if (normalizedKey === "status" && typeof entry === "string" && /currentqueue/.test(canonicalStateKey(entry))) {
      errors.push(`${fieldPath}: current-queue status is forbidden; use a dated compatibility status`);
    }
    checkNoLiveAuthorityFields(owner, entry, errors, fieldPath);
  }
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
    if (isUnsafeRepoPath(path)) {
      errors.push(`${owner}: path reference must stay within the repository: ${normalizedRepoPath(path)}`);
      continue;
    }
    if (isGlobLike(path)) {
      errors.push(`${owner}: document path references must not use globs: ${normalizedRepoPath(path)}`);
      continue;
    }
    const inspected = inspectRegularRepoFile(rootDir, path);
    if (!inspected.ok) {
      errors.push(`${owner}: referenced path must be a regular non-symlink file within the repository: ${normalizedRepoPath(path)}`);
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
    } else if (isUnsafeRepoPath(path)) {
      errors.push(`${owner}: path pattern must stay within the repository: ${normalizedRepoPath(path)}`);
    }
  }
}

function isHistoricalCompletedOrBlockedStatus(value) {
  return /^(?:historical|observed-at-cutoff)-(?:completed|blocked)(?:-|$)/.test(String(value ?? ""));
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
    checkAllowedObjectFields(label, lane, LANE_ENTRY_KEYS, errors);
    for (const field of ["id", "name", "status", "riskBoundary", "purpose"]) {
      if (typeof lane?.[field] !== "string" || lane[field].trim() === "") {
        errors.push(`${label}: missing ${field}`);
      }
    }
    if (lane?.status !== "definition-only") {
      errors.push(`${label}: status must be definition-only`);
    }
    if (typeof lane?.purpose === "string" && /(?:#\d+|\b(?:issue|pr)\s*#?\d+\b)/i.test(lane.purpose)) {
      errors.push(`${label}: purpose must be definition-only taxonomy without live Issue/PR membership`);
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

function checkLaneStateContracts(lanesState, errors) {
  checkRequiredObjectFields(
    "project-state/lanes.json.a3ProductionCloseout",
    lanesState?.a3ProductionCloseout,
    A3_PRODUCTION_CLOSEOUT_KEYS,
    LANES_A3_PRODUCTION_CLOSEOUT_REQUIRED_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/lanes.json.governanceBoundary",
    lanesState?.governanceBoundary,
    LANES_GOVERNANCE_BOUNDARY_KEYS,
    LANES_GOVERNANCE_BOUNDARY_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/lanes.json.sourceBoundary",
    lanesState?.sourceBoundary,
    LANES_SOURCE_BOUNDARY_KEYS,
    LANES_SOURCE_BOUNDARY_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/lanes.json.githubProjectIndex",
    lanesState?.githubProjectIndex,
    LANES_GITHUB_PROJECT_INDEX_KEYS,
    LANES_GITHUB_PROJECT_INDEX_KEYS,
    errors
  );
  checkExpectedAuthorityValue(
    "project-state/lanes.json.githubProjectIndex.authority",
    lanesState?.githubProjectIndex?.authority,
    EXPECTED_AUTHORITY_VALUES.get("project-state/lanes.json.githubProjectIndex.authority"),
    errors
  );
  checkRequiredStringArray(
    "project-state/lanes.json.githubProjectIndex.laneOptions",
    lanesState?.githubProjectIndex?.laneOptions,
    errors
  );
  checkRequiredStringArray(
    "project-state/lanes.json.githubProjectIndex.internalOnlyLanes",
    lanesState?.githubProjectIndex?.internalOnlyLanes,
    errors
  );
  checkRequiredBoolean(
    "project-state/lanes.json.governanceBoundary.requiresLiveVerification",
    lanesState?.governanceBoundary?.requiresLiveVerification,
    true,
    errors
  );
}

function checkTasks(rootDir, tasksState, laneIds, errors) {
  const tasks = tasksState?.tasks;
  if (!checkRequiredArray(tasks, "project-state/tasks.json tasks", errors)) {
    return;
  }

  const taskIds = new Set();
  for (const task of tasks) {
    const label = `task ${task?.id ?? "<missing-id>"}`;
    checkAllowedObjectFields(label, task, TASK_ENTRY_KEYS, errors);
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
    if (typeof task?.status === "string" && !/^(?:observed-at-cutoff|historical)-/.test(task.status)) {
      errors.push(`${label}: live-like task status is forbidden in dated compatibility records: ${task.status}`);
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
    if (task?.risk === "A" && !isHistoricalCompletedOrBlockedStatus(task?.status)) {
      errors.push(`${label}: A-tier task must remain blocked until runbook and approval`);
    }
  }
}

function checkTaskStateContracts(tasksState, errors) {
  checkRequiredObjectFields(
    "project-state/tasks.json.a3ProductionCloseout",
    tasksState?.a3ProductionCloseout,
    A3_PRODUCTION_CLOSEOUT_KEYS,
    TASK_A3_PRODUCTION_CLOSEOUT_REQUIRED_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/tasks.json.historicalBoundary",
    tasksState?.historicalBoundary,
    TASK_HISTORICAL_BOUNDARY_KEYS,
    TASK_HISTORICAL_BOUNDARY_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/tasks.json.issue437ReceiptAtObservation",
    tasksState?.issue437ReceiptAtObservation,
    TASK_ISSUE_RECEIPT_KEYS,
    TASK_ISSUE_RECEIPT_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/tasks.json.ciGovernance",
    tasksState?.ciGovernance,
    TASK_CI_GOVERNANCE_KEYS,
    TASK_CI_GOVERNANCE_KEYS,
    errors
  );
  checkRequiredObjectFields(
    "project-state/tasks.json.sourceSecurity",
    tasksState?.sourceSecurity,
    TASK_SOURCE_SECURITY_KEYS,
    TASK_SOURCE_SECURITY_KEYS,
    errors
  );
  for (const [path, value] of [
    ["historicalBoundary", tasksState?.historicalBoundary?.requiresLiveVerification],
    ["ciGovernance", tasksState?.ciGovernance?.requiresLiveVerification],
    ["sourceSecurity", tasksState?.sourceSecurity?.requiresLiveVerification]
  ]) {
    checkRequiredBoolean(
      `project-state/tasks.json.${path}.requiresLiveVerification`,
      value,
      true,
      errors
    );
  }
}

function checkCurrentState(rootDir, currentState, errors) {
  if (!currentState || typeof currentState !== "object") {
    errors.push("project-state/current.json: expected object");
    return;
  }
  checkPathReferences(rootDir, "project-state/current.json sourceDocs", currentState.sourceDocs, errors);
  for (const [path, value, allowedKeys, requiredKeys = allowedKeys] of [
    ["repo", currentState.repo, REPO_KEYS],
    ["a3ProductionCloseout", currentState.a3ProductionCloseout, A3_PRODUCTION_CLOSEOUT_KEYS, CURRENT_A3_PRODUCTION_CLOSEOUT_REQUIRED_KEYS],
    ["architectureView", currentState.architectureView, ARCHITECTURE_VIEW_KEYS],
    ["coordinationSnapshotAtObservation", currentState.coordinationSnapshotAtObservation, COORDINATION_SNAPSHOT_KEYS],
    ["productionSnapshot", currentState.productionSnapshot, PRODUCTION_SNAPSHOT_KEYS],
    ["productionSnapshot.sourceActivationBoundaryAtObservation", currentState.productionSnapshot?.sourceActivationBoundaryAtObservation, SOURCE_ACTIVATION_BOUNDARY_KEYS],
    ["branchContext", currentState.branchContext, BRANCH_CONTEXT_KEYS],
    ["branchContext.sourceReconciliation", currentState.branchContext?.sourceReconciliation, SOURCE_RECONCILIATION_KEYS],
    ["branchContext.deployedControlPlane", currentState.branchContext?.deployedControlPlane, DEPLOYED_CONTROL_PLANE_KEYS],
    ["branchContext.githubProjectIndex", currentState.branchContext?.githubProjectIndex, GITHUB_PROJECT_INDEX_KEYS],
    ["branchContext.mergePolicyObservation", currentState.branchContext?.mergePolicyObservation, MERGE_POLICY_OBSERVATION_KEYS],
    ["productionSnapshot.companySitePromotionBoundary", currentState.productionSnapshot?.companySitePromotionBoundary, COMPANY_SITE_PROMOTION_KEYS],
    ["productionSnapshot.companySitePromotionBoundary.latestStagedCandidate", currentState.productionSnapshot?.companySitePromotionBoundary?.latestStagedCandidate, LATEST_STAGED_CANDIDATE_KEYS],
    ["productionSnapshot.cloudflareSiteBoundary", currentState.productionSnapshot?.cloudflareSiteBoundary, CLOUDFLARE_SITE_BOUNDARY_KEYS],
    ["productionSnapshot.trafficEvidence", currentState.productionSnapshot?.trafficEvidence, TRAFFIC_EVIDENCE_KEYS],
    ["productionSnapshot.trafficEvidence.lastObservedCounts", currentState.productionSnapshot?.trafficEvidence?.lastObservedCounts, TRAFFIC_LAST_OBSERVED_COUNT_KEYS],
    ["validationSnapshot", currentState.validationSnapshot, VALIDATION_SNAPSHOT_KEYS],
    ["sourceSecuritySnapshot", currentState.sourceSecuritySnapshot, SOURCE_SECURITY_SNAPSHOT_KEYS],
    ["sourceSecuritySnapshot.workflowActionPins", currentState.sourceSecuritySnapshot?.workflowActionPins, WORKFLOW_ACTION_PINS_KEYS],
    ["accessModelSnapshot", currentState.accessModelSnapshot, ACCESS_MODEL_SNAPSHOT_KEYS]
  ]) {
    checkRequiredObjectFields(
      `project-state/current.json.${path}`,
      value,
      allowedKeys,
      requiredKeys,
      errors
    );
  }
  checkRequiredStringArray("project-state/current.json.productSpine", currentState.productSpine, errors);
  checkRequiredStringArray("project-state/current.json.directionsAtObservation", currentState.directionsAtObservation, errors);
  checkRequiredStringArray("project-state/current.json.forbiddenInStateFiles", currentState.forbiddenInStateFiles, errors);
  checkRequiredStringArray("project-state/current.json.productionSnapshot.dataPlaneCapacity", currentState.productionSnapshot?.dataPlaneCapacity, errors);
  checkRequiredStringArray("project-state/current.json.productionSnapshot.notes", currentState.productionSnapshot?.notes, errors);
  checkRequiredStringArray("project-state/current.json.productionSnapshot.sourceActivationBoundaryAtObservation.unactivatedExtensions", currentState.productionSnapshot?.sourceActivationBoundaryAtObservation?.unactivatedExtensions, errors);
  checkRequiredStringArray("project-state/current.json.productionSnapshot.sourceActivationBoundaryAtObservation.legacyEnabledState", currentState.productionSnapshot?.sourceActivationBoundaryAtObservation?.legacyEnabledState, errors);
  checkRequiredObjectArray("project-state/current.json.productionSnapshot.releaseUnits", currentState.productionSnapshot?.releaseUnits, RELEASE_UNIT_KEYS, errors);
  checkRequiredObjectArray(
    "project-state/current.json.blockerReceiptsAtObservation",
    currentState.blockerReceiptsAtObservation,
    BLOCKER_RECEIPT_KEYS,
    errors
  );
  checkExpectedAuthorityValue(
    "project-state/current.json.branchContext.githubProjectIndex.authority",
    currentState.branchContext?.githubProjectIndex?.authority,
    EXPECTED_AUTHORITY_VALUES.get("project-state/current.json.branchContext.githubProjectIndex.authority"),
    errors
  );
  checkExpectedAuthorityValue(
    "project-state/current.json.productionSnapshot.controlPlaneAuthority",
    currentState.productionSnapshot?.controlPlaneAuthority,
    EXPECTED_AUTHORITY_VALUES.get("project-state/current.json.productionSnapshot.controlPlaneAuthority"),
    errors
  );
  if (currentState.productionSnapshot?.snapshotState !== undefined && currentState.productionSnapshot.snapshotState !== "a3_promotion_receipt_documented_requires_future_live_verification") {
    errors.push("project-state/current.json.productionSnapshot.snapshotState: unsupported snapshot state; current/live authority is forbidden");
  }
  checkExpectedAuthorityValue(
    "project-state/current.json.productionSnapshot.companySitePromotionBoundary.promotionAuthority",
    currentState.productionSnapshot?.companySitePromotionBoundary?.promotionAuthority,
    EXPECTED_AUTHORITY_VALUES.get("project-state/current.json.productionSnapshot.companySitePromotionBoundary.promotionAuthority"),
    errors
  );
  if (currentState.productionSnapshot?.requiresLiveVerification !== true) {
    errors.push("project-state/current.json: productionSnapshot.requiresLiveVerification must be true");
  }
  for (const [path, value, expectedValue] of [
    ["branchContext.mergePolicyObservation.requiresLiveVerification", currentState.branchContext?.mergePolicyObservation?.requiresLiveVerification, true],
    ["productionSnapshot.companySitePromotionBoundary.requiresLiveVerification", currentState.productionSnapshot?.companySitePromotionBoundary?.requiresLiveVerification, true],
    ["productionSnapshot.companySitePromotionBoundary.autoAssignCustomDomains", currentState.productionSnapshot?.companySitePromotionBoundary?.autoAssignCustomDomains, false],
    ["productionSnapshot.companySitePromotionBoundary.latestStagedCandidate.productionEnvironment", currentState.productionSnapshot?.companySitePromotionBoundary?.latestStagedCandidate?.productionEnvironment, false],
    ["productionSnapshot.companySitePromotionBoundary.latestStagedCandidate.publicAliasesAssigned", currentState.productionSnapshot?.companySitePromotionBoundary?.latestStagedCandidate?.publicAliasesAssigned, false],
    ["productionSnapshot.cloudflareSiteBoundary.requiresLiveVerification", currentState.productionSnapshot?.cloudflareSiteBoundary?.requiresLiveVerification, true],
    ["productionSnapshot.cloudflareSiteBoundary.githubWorkflowAutoDeploy", currentState.productionSnapshot?.cloudflareSiteBoundary?.githubWorkflowAutoDeploy, false],
    ["productionSnapshot.cloudflareSiteBoundary.activeDeploymentLiveReadAtThisCutoff", currentState.productionSnapshot?.cloudflareSiteBoundary?.activeDeploymentLiveReadAtThisCutoff, false],
    ["productionSnapshot.trafficEvidence.requiresLiveVerification", currentState.productionSnapshot?.trafficEvidence?.requiresLiveVerification, true],
    ["sourceSecuritySnapshot.requiresLiveVerification", currentState.sourceSecuritySnapshot?.requiresLiveVerification, true]
  ]) {
    checkRequiredBoolean(`project-state/current.json.${path}`, value, expectedValue, errors);
  }
}

export function findSensitivePatternFindings(rootDir, paths) {
  const findings = [];
  for (const path of paths) {
    if (typeof path !== "string" || isUnsafeRepoPath(path) || isGlobLike(path)) {
      continue;
    }
    const inspected = inspectRegularRepoFile(rootDir, path);
    if (!inspected.ok) {
      continue;
    }
    const text = readFileSync(inspected.path, "utf8");
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
  const today = options.today ?? currentLosAngelesDate();
  const errors = [];

  for (const path of REQUIRED_STATE_FILES) {
    if (!existsRepoPath(rootDir, path)) {
      errors.push(`${path}: required file is missing`);
    }
  }

  const invalidReviewedPaths = checkReviewedCompatibilityStateDigests(rootDir, errors);

  const lanesState = invalidReviewedPaths.has("project-state/lanes.json")
    ? null
    : readJson(rootDir, "project-state/lanes.json", errors);
  const currentState = invalidReviewedPaths.has("project-state/current.json")
    ? null
    : readJson(rootDir, "project-state/current.json", errors);
  const tasksState = invalidReviewedPaths.has("project-state/tasks.json")
    ? null
    : readJson(rootDir, "project-state/tasks.json", errors);

  for (const [path, state] of [
    ["project-state/lanes.json", lanesState],
    ["project-state/current.json", currentState],
    ["project-state/tasks.json", tasksState]
  ]) {
    checkFreshnessMetadata(path, state, errors, today);
    checkAllowedTopLevelFields(path, state, errors);
    checkNoLiveAuthorityFields(path, state, errors);
  }

  const laneIds = checkLanes(rootDir, lanesState, errors);
  checkLaneStateContracts(lanesState, errors);
  checkCurrentState(rootDir, currentState, errors);
  checkTasks(rootDir, tasksState, laneIds, errors);
  checkTaskStateContracts(tasksState, errors);
  checkTaskSourceReceipts(tasksState, errors);

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
