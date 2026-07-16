import { createHash } from "node:crypto";

const RISKS = new Set(["A", "B", "C"]);
const RISK_RANK = Object.freeze({ C: 0, B: 1, A: 2 });
const ATTRIBUTION_CATEGORIES = new Set([
  "baseline_identity_drift",
  "business_contract",
  "ci_configuration",
  "docs_metadata",
  "execution_transport",
  "test_fixture",
  "transport_format",
  "unknown"
]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const CLASSIFIER_MODES = new Set(["deterministic", "assisted", "unknown"]);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const SAFE_GATE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SAFE_REASON_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_HEAD_PATTERN = /^[a-f0-9]{40}$/;
const LEGACY_EMPTY_LEDGER_POLICY_DIGEST = "8ca4737109a75afb81e8e68df4824a41c48aa9bd717811a4c3ddc79481a6c27d";
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EVENT_TYPES = new Set([
  "proposed",
  "approval_recorded",
  "approval_consumed",
  "terminal_passed",
  "terminal_blocked",
  "failure_attributed",
  "repair_routed",
  "successor_proposed",
  "expired",
  "superseded"
]);
const EVENT_TRANSITIONS = new Map([
  [null, new Set(["proposed"])],
  ["proposed", new Set(["approval_recorded", "terminal_blocked", "expired", "superseded"])],
  ["approval_recorded", new Set(["approval_consumed", "terminal_blocked", "expired", "superseded"])],
  ["approval_consumed", new Set(["terminal_passed", "terminal_blocked"])],
  ["terminal_blocked", new Set(["failure_attributed"])],
  ["failure_attributed", new Set(["repair_routed"])],
  ["repair_routed", new Set(["successor_proposed"])],
  ["expired", new Set(["successor_proposed"])]
]);
const LEDGER_TERMINAL_EVENTS = new Set([
  "terminal_passed",
  "successor_proposed",
  "superseded"
]);
const AUTO_REPAIR_CATEGORIES = new Set([
  "ci_configuration",
  "docs_metadata",
  "execution_transport",
  "test_fixture",
  "transport_format"
]);
const CATEGORY_RISK_FLOOR = Object.freeze({
  baseline_identity_drift: "A",
  business_contract: "A",
  ci_configuration: "B",
  docs_metadata: "C",
  execution_transport: "C",
  test_fixture: "B",
  transport_format: "C",
  unknown: "A"
});
const PROTECTED_CAPABILITIES = new Set([
  "deployment",
  "executor_self_change",
  "oidc",
  "permission_expansion",
  "production",
  "provider",
  "runtime",
  "secret_access",
  "validator_self_change"
]);
const ESCALATION_INVARIANTS = new Set([
  "contract_change",
  "credential_boundary",
  "production_boundary",
  "scope_drift",
  "security_boundary",
  "sensitive_output"
]);
const GOVERNANCE_TRUST_ROOT_PATHS = new Set([
  ".github/workflows/governance-validate.yml",
  "project-state/repair-policy.json",
  "schemas/failure-attribution-v2.schema.json",
  "schemas/gate-ledger-v1.schema.json",
  "schemas/repair-policy-v2.schema.json",
  "scripts/check-gate-governance.mjs",
  "server/services/governance/gate-governance.mjs"
]);

export const DEFAULT_REPAIR_POLICY = Object.freeze({
  schemaVersion: "2",
  retryBudget: Object.freeze({ A: 0, B: 1, C: 1 }),
  categoryRiskFloor: Object.freeze({ ...CATEGORY_RISK_FLOOR }),
  pathRiskFloors: Object.freeze([
    Object.freeze({ prefix: ".github/actions/", risk: "B" }),
    Object.freeze({ prefix: ".github/workflows/", risk: "B" }),
    Object.freeze({ prefix: "server/services/governance/", risk: "B" })
  ]),
  capabilityRiskFloors: Object.freeze({}),
  protectedCapabilities: Object.freeze([...PROTECTED_CAPABILITIES].sort()),
  autoProposalCategories: Object.freeze([...AUTO_REPAIR_CATEGORIES].sort()),
  escalationInvariants: Object.freeze([...ESCALATION_INVARIANTS].sort())
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareUnicodeCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftPoints[index] < rightPoints[index]) return -1;
    if (leftPoints[index] > rightPoints[index]) return 1;
  }
  if (leftPoints.length < rightPoints.length) return -1;
  if (leftPoints.length > rightPoints.length) return 1;
  return 0;
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeDomainSeparatedDigest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\0`, "utf8")
    .update(canonicalizeJson(value), "utf8")
    .digest("hex");
}

function sameCanonicalJson(left, right) {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

export function computeGateScopeDigest(scope) {
  return createHash("sha256").update(canonicalizeJson(scope), "utf8").digest("hex");
}

export function computeRepairPolicyDigest(policy) {
  return createHash("sha256").update(canonicalizeJson(policy), "utf8").digest("hex");
}

export function computeFailureAttributionDigest(attribution) {
  return computeDomainSeparatedDigest("ATTRIBUTION:v2", attribution);
}

export function computeRouterResultDigest(routerResult) {
  return computeDomainSeparatedDigest("ROUTER_RESULT:v2", routerResult);
}

export function isLegacyEmptyGateLedger(state) {
  return isPlainObject(state)
    && state.schemaVersion === "1"
    && state.repairPolicyVersion === "1"
    && state.repairPolicyDigest === LEGACY_EMPTY_LEDGER_POLICY_DIGEST
    && Array.isArray(state.gates)
    && state.gates.length === 0;
}

function validIsoTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validUniqueSafeIds(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === "string" && SAFE_ID_PATTERN.test(entry))
    && new Set(value).size === value.length;
}

function validSortedSafeIds(value, { allowEmpty = true } = {}) {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.every((entry) => typeof entry === "string" && SAFE_ID_PATTERN.test(entry))
    && new Set(value).size === value.length
    && value.every((entry, index) => index === 0 || compareUnicodeCodePoints(value[index - 1], entry) < 0);
}

export function validateRepairPolicy(policy) {
  const errors = [];
  if (!hasExactKeys(
    policy,
    [
      "schemaVersion",
      "retryBudget",
      "categoryRiskFloor",
      "pathRiskFloors",
      "capabilityRiskFloors",
      "protectedCapabilities",
      "autoProposalCategories",
      "escalationInvariants"
    ]
  )) {
    return { ok: false, errors: ["repair policy must contain exact fields"] };
  }
  if (policy.schemaVersion !== "2") errors.push("repair policy schemaVersion must be 2");
  if (!hasExactKeys(policy.retryBudget, ["A", "B", "C"])) {
    errors.push("repair policy retryBudget must contain exact risk fields");
  } else {
    for (const risk of RISKS) {
      if (!Number.isInteger(policy.retryBudget[risk]) || policy.retryBudget[risk] < 0) {
        errors.push(`repair policy retryBudget.${risk} must be a non-negative integer`);
      }
    }
    if (policy.retryBudget.A !== 0 || policy.retryBudget.B > 1 || policy.retryBudget.C > 1) {
      errors.push("repair policy retryBudget exceeds the hard safety ceiling");
    }
  }
  if (!hasExactKeys(policy.categoryRiskFloor, ATTRIBUTION_CATEGORIES)) {
    errors.push("repair policy categoryRiskFloor must contain every closed category");
  } else {
    for (const [category, risk] of Object.entries(policy.categoryRiskFloor)) {
      if (!RISKS.has(risk)) {
        errors.push(`repair policy categoryRiskFloor.${category} is unsupported`);
      } else if (RISK_RANK[risk] < RISK_RANK[CATEGORY_RISK_FLOOR[category]]) {
        errors.push(`repair policy categoryRiskFloor.${category} weakens the hard safety floor`);
      }
    }
  }
  if (!Array.isArray(policy.pathRiskFloors) || policy.pathRiskFloors.length === 0) {
    errors.push("repair policy pathRiskFloors must be a non-empty array");
  } else {
    const prefixes = [];
    for (const [index, floor] of policy.pathRiskFloors.entries()) {
      if (!hasExactKeys(floor, ["prefix", "risk"])) {
        errors.push(`repair policy pathRiskFloors[${index}] must contain exact fields`);
        continue;
      }
      const normalized = typeof floor.prefix === "string" && floor.prefix.endsWith("/")
        ? floor.prefix.slice(0, -1)
        : floor.prefix;
      if (!validRepoRelativePath(normalized)) {
        errors.push(`repair policy pathRiskFloors[${index}].prefix is invalid`);
      }
      if (!RISKS.has(floor.risk)) errors.push(`repair policy pathRiskFloors[${index}].risk is unsupported`);
      prefixes.push(floor.prefix);
    }
    if (
      new Set(prefixes).size !== prefixes.length
      || prefixes.some((prefix, index) => index > 0 && compareUnicodeCodePoints(prefixes[index - 1], prefix) >= 0)
    ) {
      errors.push("repair policy pathRiskFloors must use sorted unique prefixes");
    }
    for (const required of DEFAULT_REPAIR_POLICY.pathRiskFloors) {
      const actual = policy.pathRiskFloors.find((floor) => floor?.prefix === required.prefix);
      if (actual === undefined || !RISKS.has(actual.risk) || RISK_RANK[actual.risk] < RISK_RANK[required.risk]) {
        errors.push(`repair policy pathRiskFloors must preserve ${required.prefix} at ${required.risk} or higher`);
      }
    }
  }
  if (!isPlainObject(policy.capabilityRiskFloors)) {
    errors.push("repair policy capabilityRiskFloors must be an object");
  } else {
    for (const [capability, risk] of Object.entries(policy.capabilityRiskFloors)) {
      if (!SAFE_ID_PATTERN.test(capability) || !RISKS.has(risk)) {
        errors.push(`repair policy capabilityRiskFloors.${capability} is invalid`);
      }
    }
  }
  if (!validSortedSafeIds(policy.protectedCapabilities, { allowEmpty: false })) {
    errors.push("repair policy protectedCapabilities must contain sorted unique safe ids");
  } else if ([...PROTECTED_CAPABILITIES].some((value) => !policy.protectedCapabilities.includes(value))) {
    errors.push("repair policy protectedCapabilities must include the hard safety floor");
  }
  if (
    !validSortedSafeIds(policy.autoProposalCategories, { allowEmpty: false })
    || policy.autoProposalCategories.some((category) => !ATTRIBUTION_CATEGORIES.has(category))
  ) {
    errors.push("repair policy autoProposalCategories must be supported sorted unique categories");
  }
  if (!validSortedSafeIds(policy.escalationInvariants, { allowEmpty: false })) {
    errors.push("repair policy escalationInvariants must be sorted unique safe ids");
  } else if ([...ESCALATION_INVARIANTS].some((value) => !policy.escalationInvariants.includes(value))) {
    errors.push("repair policy escalationInvariants must include the hard safety floor");
  }
  if (
    Array.isArray(policy.autoProposalCategories)
    && policy.autoProposalCategories.some((category) => !AUTO_REPAIR_CATEGORIES.has(category))
  ) {
    errors.push("repair policy autoProposalCategories exceed the hard safety allowlist");
  }
  return { ok: errors.length === 0, errors };
}

export function validateRepairPolicyTransition(basePolicy, headPolicy) {
  const errors = [];
  const headResult = validateRepairPolicy(headPolicy);
  errors.push(...headResult.errors.map((error) => `head: ${error}`));
  if (basePolicy === null) {
    if (!sameCanonicalJson(headPolicy, DEFAULT_REPAIR_POLICY)) {
      errors.push("bootstrap must use the default repair policy");
    }
    return { ok: errors.length === 0, errors };
  }
  const baseResult = validateRepairPolicy(basePolicy);
  errors.push(...baseResult.errors.map((error) => `base: ${error}`));
  if (!sameCanonicalJson(basePolicy, headPolicy)) {
    errors.push("repair policy rewrite is forbidden within schema version 2");
  }
  return { ok: errors.length === 0, errors };
}

export function validateFailureAttribution(attribution) {
  const errors = [];
  const fields = [
    "schemaVersion",
    "observationDigest",
    "classifierVersion",
    "classifierRulesDigest",
    "classifierMode",
    "category",
    "reasonCode",
    "technicalImpact",
    "confidence",
    "affectedInvariants",
    "evidenceRefs",
    "decisionReason"
  ];
  if (!hasExactKeys(attribution, fields)) {
    return { ok: false, errors: ["failure attribution must contain exact fields"] };
  }
  if (attribution.schemaVersion !== "2") errors.push("failure attribution schemaVersion must be 2");
  if (typeof attribution.observationDigest !== "string" || !SHA256_PATTERN.test(attribution.observationDigest)) {
    errors.push("failure attribution observationDigest must be a lowercase SHA-256 digest");
  }
  if (typeof attribution.classifierVersion !== "string" || !SAFE_VERSION_PATTERN.test(attribution.classifierVersion)) {
    errors.push("failure attribution classifierVersion must be a safe version");
  }
  if (typeof attribution.classifierRulesDigest !== "string" || !SHA256_PATTERN.test(attribution.classifierRulesDigest)) {
    errors.push("failure attribution classifierRulesDigest must be a lowercase SHA-256 digest");
  }
  if (!CLASSIFIER_MODES.has(attribution.classifierMode)) {
    errors.push("failure attribution classifierMode is unsupported");
  }
  if (!ATTRIBUTION_CATEGORIES.has(attribution.category)) {
    errors.push("failure attribution category is unsupported");
  }
  if (typeof attribution.reasonCode !== "string" || !SAFE_REASON_CODE_PATTERN.test(attribution.reasonCode)) {
    errors.push("failure attribution reasonCode must be a safe reason code");
  }
  if (!CONFIDENCE_LEVELS.has(attribution.confidence)) errors.push("failure attribution confidence is unsupported");
  if (!validSortedSafeIds(attribution.technicalImpact)) {
    errors.push("failure attribution technicalImpact must contain sorted unique safe ids");
  }
  if (!validSortedSafeIds(attribution.affectedInvariants)) {
    errors.push("failure attribution affectedInvariants must contain sorted unique safe ids");
  }
  if (!validSortedSafeIds(attribution.evidenceRefs)) {
    errors.push("failure attribution evidenceRefs must contain sorted unique safe ids");
  }
  if (!hasExactKeys(attribution.decisionReason, ["category", "blockers", "missingEvidence"])) {
    errors.push("failure attribution decisionReason must contain exact fields");
  } else {
    if (
      typeof attribution.decisionReason.category !== "string"
      || !SAFE_REASON_CODE_PATTERN.test(attribution.decisionReason.category)
    ) {
      errors.push("failure attribution decisionReason.category must be a safe reason code");
    }
    if (!validSortedSafeIds(attribution.decisionReason.blockers)) {
      errors.push("failure attribution decisionReason.blockers must contain sorted unique safe ids");
    }
    if (!validSortedSafeIds(attribution.decisionReason.missingEvidence)) {
      errors.push("failure attribution decisionReason.missingEvidence must contain sorted unique safe ids");
    }
  }
  return { ok: errors.length === 0, errors };
}

function addExactKeyError(value, expected, label, errors) {
  if (!hasExactKeys(value, expected)) {
    errors.push(`${label}: expected exact fields`);
    return false;
  }
  return true;
}

function validRepoRelativePath(value) {
  if (typeof value !== "string" || value.trim() !== value || value === "" || value.length > 256) return false;
  if (
    value.includes("\\")
    || value.includes(":")
    || value.startsWith("/")
    || /[\u0000-\u001f*?\[\]{}!<>|"]/.test(value)
  ) {
    return false;
  }
  return value.split("/").every((segment) => (
    segment !== ""
    && segment !== "."
    && segment !== ".."
    && segment.toLowerCase() !== ".git"
  ));
}

function validateRouteScope(scope) {
  return isPlainObject(scope)
    && hasExactKeys(scope, ["targetPaths", "capabilityIds", "protectedScope"])
    && Array.isArray(scope.targetPaths)
    && scope.targetPaths.length > 0
    && new Set(scope.targetPaths).size === scope.targetPaths.length
    && scope.targetPaths.every(validRepoRelativePath)
    && scope.targetPaths.every((path, index) => index === 0 || compareUnicodeCodePoints(scope.targetPaths[index - 1], path) < 0)
    && validSortedSafeIds(scope.capabilityIds)
    && typeof scope.protectedScope === "boolean";
}

function pathMatchesPrefix(path, prefix) {
  if (prefix.endsWith("/")) return path.startsWith(prefix);
  return path === prefix || path.startsWith(`${prefix}/`);
}

function routeScopeRequiresOperator(scope, policy) {
  return scope.protectedScope
    || scope.capabilityIds.some((capability) => policy.protectedCapabilities.includes(capability))
    || scope.targetPaths.some((path) => (
      GOVERNANCE_TRUST_ROOT_PATHS.has(path)
      || path.startsWith("deployments/")
      || (path.startsWith("ops/") && !path.endsWith(".md"))
      || path === ".github/CODEOWNERS"
    ));
}

function raiseRisk(current, candidate) {
  return RISK_RANK[candidate] > RISK_RANK[current] ? candidate : current;
}

function computeGovernanceRisk(gateRisk, attribution, scope, policy) {
  let risk = raiseRisk(gateRisk, policy.categoryRiskFloor[attribution.category]);
  for (const targetPath of scope.targetPaths) {
    for (const floor of policy.pathRiskFloors) {
      if (pathMatchesPrefix(targetPath, floor.prefix)) risk = raiseRisk(risk, floor.risk);
    }
  }
  for (const capability of scope.capabilityIds) {
    const floor = policy.capabilityRiskFloors[capability];
    if (floor !== undefined) risk = raiseRisk(risk, floor);
  }
  return risk;
}

function eventExpectedFields(type) {
  const common = ["type", "at", "evidence"];
  if (type === "approval_recorded" || type === "approval_consumed") {
    return [...common, "authorization"];
  }
  if (type === "terminal_passed") return [...common, "checks", "stateClaims"];
  if (type === "terminal_blocked") return [...common, "reasonCode", "approvalState", "stateClaims"];
  if (type === "failure_attributed") return [...common, "attribution"];
  if (type === "repair_routed") {
    return [
      "schemaVersion",
      "type",
      "at",
      "parentReceiptDigest",
      "observationDigest",
      "attributionDigest",
      "routerResult",
      "routerResultDigest",
      "retry",
      "policyVersion",
      "policyDigest"
    ];
  }
  if (type === "successor_proposed") return [...common, "successorGateId"];
  if (type === "expired") return [...common, "reasonCode"];
  if (type === "superseded") return [...common, "reasonCode", "successorGateId"];
  return common;
}

function checkEvidence(evidence, label, errors) {
  if (!addExactKeyError(evidence, ["reference", "sha256"], label, errors)) return;
  if (typeof evidence.reference !== "string" || !SAFE_ID_PATTERN.test(evidence.reference)) {
    errors.push(`${label}.reference: expected a safe id`);
  }
  if (typeof evidence.sha256 !== "string" || !SHA256_PATTERN.test(evidence.sha256)) {
    errors.push(`${label}.sha256: expected a lowercase SHA-256 digest`);
  }
}

function checkStateClaims(stateClaims, label, errors) {
  const fields = [
    "sourceFilesChanged",
    "commitCreated",
    "pushPerformed",
    "retainedLocalState",
    "retainedStateDigest",
    "productionMutation"
  ];
  if (!addExactKeyError(stateClaims, fields, label, errors)) return;
  for (const field of [
    "sourceFilesChanged",
    "commitCreated",
    "pushPerformed",
    "retainedLocalState",
    "productionMutation"
  ]) {
    if (typeof stateClaims[field] !== "boolean") errors.push(`${label}.${field}: expected boolean`);
  }
  if (stateClaims.pushPerformed === true && stateClaims.commitCreated !== true) {
    errors.push(`${label}: pushPerformed requires commitCreated`);
  }
  if (stateClaims.retainedLocalState === true) {
    if (typeof stateClaims.retainedStateDigest !== "string" || !SHA256_PATTERN.test(stateClaims.retainedStateDigest)) {
      errors.push(`${label}.retainedStateDigest: retained local state requires a lowercase SHA-256 digest`);
    }
    if (stateClaims.sourceFilesChanged !== true && stateClaims.commitCreated !== true) {
      errors.push(`${label}: retained local state requires source or commit state`);
    }
  } else if (stateClaims.retainedStateDigest !== null) {
    errors.push(`${label}.retainedStateDigest: must be null without retained local state`);
  }
  if (stateClaims.productionMutation !== false) {
    errors.push(`${label}: production mutation cannot be claimed by this ledger`);
  }
}

function checkAuthorization(authorization, gate, expectedAuthority, label, errors) {
  const fields = ["gateId", "lineageId", "authority", "scopeDigest", "sourceHead", "policyVersion"];
  if (!addExactKeyError(authorization, fields, label, errors)) return;
  if (authorization.gateId !== gate.id) {
    errors.push(`${label}.gateId: must match Gate id`);
  }
  if (authorization.lineageId !== gate.lineageId) {
    errors.push(`${label}.lineageId: must match Gate lineage id`);
  }
  if (!["operator", "repair_policy"].includes(authorization.authority)) {
    errors.push(`${label}.authority: expected operator or repair_policy`);
  } else if (authorization.authority !== expectedAuthority) {
    errors.push(`${label}.authority: does not match predecessor route authority`);
  }
  if (authorization.scopeDigest !== gate.scopeDigest) {
    errors.push(`${label}.scopeDigest: must match Gate scope digest`);
  }
  if (authorization.sourceHead !== gate.subject?.sourceHead) {
    errors.push(`${label}.sourceHead: must match Gate source head`);
  }
  if (authorization.authority === "repair_policy") {
    if (authorization.policyVersion !== "2") errors.push(`${label}.policyVersion: expected repair policy version 2`);
  } else if (authorization.policyVersion !== null) {
    errors.push(`${label}.policyVersion: operator authorization must use null`);
  }
}

function checkTerminalPassed(event, validation, label, errors) {
  const names = new Set();
  if (!Array.isArray(event.checks) || event.checks.length === 0) {
    errors.push(`${label}.checks: expected non-empty passed checks`);
  } else {
    for (const [index, check] of event.checks.entries()) {
      const checkLabel = `${label}.checks[${index}]`;
      if (!addExactKeyError(check, ["name", "result"], checkLabel, errors)) continue;
      if (typeof check.name !== "string" || !SAFE_ID_PATTERN.test(check.name)) {
        errors.push(`${checkLabel}.name: expected a safe id`);
      } else if (names.has(check.name)) {
        errors.push(`${label}.checks: duplicate name`);
      }
      names.add(check.name);
      if (check.result !== "passed") errors.push(`${checkLabel}.result: expected passed`);
    }
  }
  if (
    Array.isArray(validation)
    && (names.size !== validation.length || validation.some((name) => !names.has(name)))
  ) {
    errors.push(`${label}.checks: must exactly cover scope.validation`);
  }
  checkStateClaims(event.stateClaims, `${label}.stateClaims`, errors);
}

function routerScopeFromGateScope(scope) {
  return {
    targetPaths: Array.isArray(scope?.allowedFiles)
      ? [...scope.allowedFiles].sort(compareUnicodeCodePoints)
      : [],
    capabilityIds: [],
    protectedScope: false
  };
}

function checkRouteEvent(
  event,
  gateRisk,
  attribution,
  attributionEvidenceDigest,
  expectedRetryState,
  policy,
  gateScope,
  label,
  errors
) {
  if (event.schemaVersion !== "2") errors.push(`${label}.schemaVersion: expected 2`);
  for (const field of [
    "parentReceiptDigest",
    "observationDigest",
    "attributionDigest",
    "routerResultDigest",
    "policyDigest"
  ]) {
    if (typeof event[field] !== "string" || !SHA256_PATTERN.test(event[field])) {
      errors.push(`${label}.${field}: expected a lowercase SHA-256 digest`);
    }
  }
  const expectedAttributionDigest = computeFailureAttributionDigest(attribution);
  if (event.parentReceiptDigest !== attributionEvidenceDigest) {
    errors.push(`${label}.parentReceiptDigest: must bind the preceding attribution receipt`);
  }
  if (event.observationDigest !== attribution.observationDigest) {
    errors.push(`${label}.observationDigest: must match Attribution V2`);
  }
  if (event.attributionDigest !== expectedAttributionDigest) {
    errors.push(`${label}.attributionDigest: must match Attribution V2`);
  }
  if (event.policyVersion !== policy.schemaVersion) {
    errors.push(`${label}.policyVersion: must match the exact repair policy`);
  }
  if (event.policyDigest !== computeRepairPolicyDigest(policy)) {
    errors.push(`${label}.policyDigest: must match the exact repair policy`);
  }
  if (!addExactKeyError(event.retry, ["attempt", "budget", "remaining", "lineageDigest"], `${label}.retry`, errors)) {
    return;
  }
  for (const field of ["attempt", "budget", "remaining"]) {
    if (!Number.isInteger(event.retry[field]) || event.retry[field] < 0) {
      errors.push(`${label}.retry.${field}: expected a non-negative integer`);
    }
  }
  if (typeof event.retry.lineageDigest !== "string" || !SHA256_PATTERN.test(event.retry.lineageDigest)) {
    errors.push(`${label}.retry.lineageDigest: expected a lowercase SHA-256 digest`);
  }
  if (event.retry.attempt !== expectedRetryState.attempt) {
    errors.push(`${label}.retry.attempt: must match immutable successor lineage (${expectedRetryState.attempt})`);
  }
  if (
    expectedRetryState.lineageDigest !== null
    && event.retry.lineageDigest !== expectedRetryState.lineageDigest
  ) {
    errors.push(`${label}.retry.lineageDigest: must match immutable successor lineage`);
  }
  try {
    const expected = routeGateFailure({
      gateRisk,
      attributionRecord: attribution,
      attributionDigest: expectedAttributionDigest,
      policy,
      policyVersion: policy.schemaVersion,
      policyDigest: computeRepairPolicyDigest(policy),
      scope: routerScopeFromGateScope(gateScope),
      retryLineage: {
        lineageDigest: event.retry.lineageDigest,
        parentReceipt: "ledger-parent-receipt",
        attempt: event.retry.attempt,
        budget: event.retry.budget
      }
    });
    if (!sameCanonicalJson(event.routerResult, expected.value.record)) {
      errors.push(`${label}.routerResult: does not match the exact Router V2 decision`);
    }
    if (event.routerResultDigest !== computeRouterResultDigest(event.routerResult)) {
      errors.push(`${label}.routerResultDigest: does not match the embedded Router result`);
    }
    if (event.routerResultDigest !== expected.value.routerResultDigest) {
      errors.push(`${label}.routerResultDigest: does not match the exact Router V2 decision`);
    }
    const duplicatedRetry = {
      ...event.routerResult?.retry,
      lineageDigest: event.routerResult?.lineageDigest
    };
    if (!sameCanonicalJson(event.retry, duplicatedRetry)) {
      errors.push(`${label}.retry: must equal the embedded Router result`);
    }
    if (
      event.policyVersion !== event.routerResult?.policyVersion
      || event.policyDigest !== event.routerResult?.policyDigest
    ) {
      errors.push(`${label}.policy: must equal the embedded Router result`);
    }
  } catch (error) {
    errors.push(`${label}.routerResult: cannot be evaluated (${error.message})`);
  }
}

function registerEvidence(evidence, type, gateId, label, evidenceRegistry, errors) {
  const reference = evidence?.reference;
  if (typeof reference !== "string" || !SAFE_ID_PATTERN.test(reference)) return;
  const prior = evidenceRegistry.get(reference);
  if (prior === undefined) {
    evidenceRegistry.set(reference, { gateId, sha256: evidence.sha256, type });
    return;
  }
  if (prior.sha256 !== evidence.sha256) {
    errors.push(`${label}.reference: evidence reference content identity mismatch`);
  }
  if (prior.gateId !== gateId) {
    errors.push(`${label}.reference: evidence reused across gate ids`);
  }
  const roles = new Set([prior.type, type]);
  if (
    roles.size !== 2
    || !roles.has("approval_recorded")
    || !roles.has("approval_consumed")
  ) {
    errors.push(`${label}.reference: evidence reference role reuse is forbidden`);
  }
}

function checkGateEvents(
  gate,
  label,
  evidenceRegistry,
  policy,
  expectedRetryState,
  expectedAuthorizationAuthority,
  errors
) {
  if (!Array.isArray(gate.events) || gate.events.length === 0) {
    errors.push(`${label}.events: expected a non-empty array`);
    return;
  }
  let previousType = null;
  let previousTime = null;
  let terminalSeen = false;
  let currentAttribution = null;
  let currentAttributionEvidenceDigest = null;
  let recordedAuthorization = null;
  let recordedApprovalEvidence = null;
  for (const [index, event] of gate.events.entries()) {
    const eventLabel = `${label}.events[${index}]`;
    if (!isPlainObject(event)) {
      errors.push(`${eventLabel}: expected an object`);
      continue;
    }
    const type = event.type;
    if (!EVENT_TYPES.has(type)) errors.push(`${eventLabel}.type: unsupported gate event`);
    addExactKeyError(event, eventExpectedFields(type), eventLabel, errors);
    if (terminalSeen) {
      errors.push(`${eventLabel}: event after terminal event is forbidden`);
    } else {
      const allowed = EVENT_TRANSITIONS.get(previousType) ?? new Set();
      if (!allowed.has(type)) {
        errors.push(`${eventLabel}: invalid event transition from ${previousType ?? "start"} to ${EVENT_TYPES.has(type) ? type : "unsupported"}`);
      }
    }
    if (!validIsoTimestamp(event.at)) {
      errors.push(`${eventLabel}.at: expected an exact ISO timestamp`);
    } else {
      const time = Date.parse(event.at);
      if (previousTime !== null && time <= previousTime) {
        errors.push(`${eventLabel}.at: timestamps must be strictly increasing`);
      }
      previousTime = time;
    }
    if (type !== "repair_routed") {
      checkEvidence(event.evidence, `${eventLabel}.evidence`, errors);
      registerEvidence(event.evidence, type, gate.id, `${eventLabel}.evidence`, evidenceRegistry, errors);
    }

    if (type === "approval_recorded") {
      checkAuthorization(
        event.authorization,
        gate,
        expectedAuthorizationAuthority,
        `${eventLabel}.authorization`,
        errors
      );
      recordedAuthorization = event.authorization;
      recordedApprovalEvidence = event.evidence;
    } else if (type === "approval_consumed") {
      checkAuthorization(
        event.authorization,
        gate,
        expectedAuthorizationAuthority,
        `${eventLabel}.authorization`,
        errors
      );
      if (!sameCanonicalJson(event.authorization, recordedAuthorization)) {
        errors.push(`${eventLabel}.authorization: must match recorded authorization identity`);
      }
      if (!sameCanonicalJson(event.evidence, recordedApprovalEvidence)) {
        errors.push(`${eventLabel}.evidence: must match recorded approval evidence identity`);
      }
    } else if (type === "terminal_passed") {
      checkTerminalPassed(event, gate.scope?.validation, eventLabel, errors);
    } else if (type === "terminal_blocked") {
      if (typeof event.reasonCode !== "string" || !SAFE_REASON_CODE_PATTERN.test(event.reasonCode)) {
        errors.push(`${eventLabel}.reasonCode: expected a safe reason code`);
      }
      const expectedApprovalState = previousType === "approval_consumed"
        ? "consumed"
        : previousType === "approval_recorded"
          ? "recorded_unconsumed"
          : "absent";
      if (event.approvalState !== expectedApprovalState) {
        errors.push(`${eventLabel}.approvalState: expected ${expectedApprovalState}`);
      }
      checkStateClaims(event.stateClaims, `${eventLabel}.stateClaims`, errors);
    } else if (type === "failure_attributed") {
      const result = validateFailureAttribution(event.attribution);
      errors.push(...result.errors.map((error) => `${eventLabel}.attribution: ${error}`));
      if (!event.attribution?.evidenceRefs?.includes(event.evidence?.reference)) {
        errors.push(`${eventLabel}.attribution.evidenceRefs: must include event evidence`);
      }
      currentAttribution = result.ok ? event.attribution : null;
      currentAttributionEvidenceDigest = result.ok ? event.evidence?.sha256 : null;
    } else if (type === "repair_routed") {
      if (currentAttribution !== null && currentAttributionEvidenceDigest !== null) {
        checkRouteEvent(
          event,
          gate.risk,
          currentAttribution,
          currentAttributionEvidenceDigest,
          expectedRetryState,
          policy,
          gate.scope,
          eventLabel,
          errors
        );
      } else {
        errors.push(`${eventLabel}.routerResult: requires a valid preceding Attribution V2 record`);
      }
    } else if (type === "successor_proposed") {
      if (typeof event.successorGateId !== "string" || !SAFE_GATE_ID_PATTERN.test(event.successorGateId)) {
        errors.push(`${eventLabel}.successorGateId: expected a safe gate id`);
      } else if (event.successorGateId === gate.id) {
        errors.push(`${eventLabel}.successorGateId: cannot equal gate id`);
      }
    } else if (type === "expired" || type === "superseded") {
      if (typeof event.reasonCode !== "string" || !SAFE_REASON_CODE_PATTERN.test(event.reasonCode)) {
        errors.push(`${eventLabel}.reasonCode: expected a safe reason code`);
      }
      if (type === "superseded" && (
        typeof event.successorGateId !== "string"
        || !SAFE_GATE_ID_PATTERN.test(event.successorGateId)
        || event.successorGateId === gate.id
      )) {
        errors.push(`${eventLabel}.successorGateId: expected another safe gate id`);
      }
    }
    if (LEDGER_TERMINAL_EVENTS.has(type)) terminalSeen = true;
    previousType = type;
  }
}

export function validateGateLedger(state, { policy = DEFAULT_REPAIR_POLICY } = {}) {
  const errors = [];
  const policyResult = validateRepairPolicy(policy);
  if (!policyResult.ok) {
    errors.push(...policyResult.errors.map((error) => `repair policy: ${error}`));
    return { ok: false, errors };
  }
  if (!addExactKeyError(
    state,
    ["schemaVersion", "authority", "description", "repairPolicyVersion", "repairPolicyDigest", "gates"],
    "gate ledger",
    errors
  )) return { ok: false, errors };
  if (state.schemaVersion !== "1") errors.push("gate ledger schemaVersion must be 1");
  if (state.authority !== "evidence-index-only") errors.push("gate ledger authority must be evidence-index-only");
  if (typeof state.description !== "string" || state.description.trim() === "") {
    errors.push("gate ledger description must be non-empty");
  }
  if (!Array.isArray(state.gates)) {
    errors.push("gate ledger gates must be an array");
    return { ok: false, errors };
  }
  if (!isLegacyEmptyGateLedger(state)) {
    if (state.repairPolicyVersion !== policy.schemaVersion) {
      errors.push("gate ledger repairPolicyVersion must match the exact repair policy");
    }
    if (state.repairPolicyDigest !== computeRepairPolicyDigest(policy)) {
      errors.push("gate ledger repairPolicyDigest must match the exact repair policy");
    }
  }
  const gateIds = new Set();
  const priorGates = new Map();
  const lineageRetryStates = new Map();
  const rootSubjectOwners = new Map();
  const evidenceRegistry = new Map();
  for (const [index, gate] of state.gates.entries()) {
    const label = `gate ledger.gates[${index}]`;
    if (!addExactKeyError(
      gate,
      ["id", "lineageId", "predecessorGateId", "risk", "subject", "scope", "scopeDigest", "events"],
      label,
      errors
    )) {
      continue;
    }
    if (typeof gate.id !== "string" || !SAFE_GATE_ID_PATTERN.test(gate.id)) {
      errors.push(`${label}.id: expected a safe gate id`);
    } else if (gateIds.has(gate.id)) {
      errors.push(`${label}.id: duplicate gate id`);
    }
    gateIds.add(gate.id);
    if (typeof gate.lineageId !== "string" || !SAFE_GATE_ID_PATTERN.test(gate.lineageId)) {
      errors.push(`${label}.lineageId: expected a safe Gate lineage id`);
    }
    let expectedRetryState = { attempt: 0, lineageDigest: null };
    let predecessor = null;
    let expectedAuthorizationAuthority = "operator";
    if (gate.predecessorGateId !== null) {
      if (typeof gate.predecessorGateId !== "string" || !SAFE_GATE_ID_PATTERN.test(gate.predecessorGateId)) {
        errors.push(`${label}.predecessorGateId: expected a prior safe gate id or null`);
      } else if (gate.predecessorGateId === gate.id) {
        errors.push(`${label}.predecessorGateId: cannot equal gate id`);
      } else {
        predecessor = priorGates.get(gate.predecessorGateId);
        if (predecessor === undefined) {
          errors.push(`${label}.predecessorGateId: predecessor must appear earlier in the ledger`);
        } else {
          const finalEvent = Array.isArray(predecessor.events) ? predecessor.events.at(-1) : undefined;
          if (
            !["successor_proposed", "superseded"].includes(finalEvent?.type)
            || finalEvent.successorGateId !== gate.id
          ) {
            errors.push(`${label}.predecessorGateId: predecessor must name this exact successor`);
          }
          expectedRetryState = lineageRetryStates.get(gate.predecessorGateId) ?? expectedRetryState;
          const routeEvent = Array.isArray(predecessor.events)
            ? predecessor.events.find((event) => event?.type === "repair_routed")
            : undefined;
          if (routeEvent?.routerResult?.lane === "codex_auto_repair") {
            expectedAuthorizationAuthority = "repair_policy";
          }
          const predecessorFinalTime = Date.parse(finalEvent?.at);
          const successorFirstTime = Date.parse(gate.events?.[0]?.at);
          if (
            Number.isFinite(predecessorFinalTime)
            && Number.isFinite(successorFirstTime)
            && successorFirstTime <= predecessorFinalTime
          ) {
            errors.push(`${label}.events: successor chronology must follow predecessor final event`);
          }
        }
      }
    } else if (gate.lineageId !== gate.id) {
      errors.push(`${label}.lineageId: root Gate lineage id must equal Gate id`);
    }
    if (!RISKS.has(gate.risk)) errors.push(`${label}.risk: expected A, B, or C`);
    if (addExactKeyError(gate.subject, ["issue", "pullRequest", "purpose", "sourceHead"], `${label}.subject`, errors)) {
      if (!Number.isInteger(gate.subject.issue) || gate.subject.issue < 1) {
        errors.push(`${label}.subject.issue: expected a positive integer`);
      }
      if (gate.subject.pullRequest !== null && (!Number.isInteger(gate.subject.pullRequest) || gate.subject.pullRequest < 1)) {
        errors.push(`${label}.subject.pullRequest: expected a positive integer or null`);
      }
      if (typeof gate.subject.purpose !== "string" || !SAFE_ID_PATTERN.test(gate.subject.purpose)) {
        errors.push(`${label}.subject.purpose: expected a safe purpose id`);
      }
      if (typeof gate.subject.sourceHead !== "string" || !SOURCE_HEAD_PATTERN.test(gate.subject.sourceHead)) {
        errors.push(`${label}.subject.sourceHead: expected a lowercase commit hash`);
      }
      if (gate.predecessorGateId === null) {
        const rootSubjectKey = canonicalizeJson([
          gate.subject.issue,
          gate.subject.pullRequest,
          gate.subject.purpose
        ]);
        if (rootSubjectOwners.has(rootSubjectKey)) {
          errors.push(`${label}.subject: root subject already has a Gate lineage`);
        } else {
          rootSubjectOwners.set(rootSubjectKey, gate.id);
        }
      } else if (predecessor !== null && predecessor !== undefined) {
        if (gate.lineageId !== predecessor.lineageId) {
          errors.push(`${label}.lineageId: successor must inherit predecessor lineage`);
        }
        if (
          gate.subject.issue !== predecessor.subject?.issue
          || gate.subject.pullRequest !== predecessor.subject?.pullRequest
          || gate.subject.purpose !== predecessor.subject?.purpose
        ) {
          errors.push(`${label}.subject: successor subject continuity is required`);
        }
        if (RISKS.has(gate.risk) && RISKS.has(predecessor.risk) && RISK_RANK[gate.risk] < RISK_RANK[predecessor.risk]) {
          errors.push(`${label}.risk: successor risk downgrade is forbidden`);
        }
      }
    }
    if (addExactKeyError(gate.scope, ["allowedFiles", "forbiddenActions", "validation"], `${label}.scope`, errors)) {
      if (
        !Array.isArray(gate.scope.allowedFiles)
        || gate.scope.allowedFiles.length === 0
        || new Set(gate.scope.allowedFiles).size !== gate.scope.allowedFiles.length
        || gate.scope.allowedFiles.some((path) => !validRepoRelativePath(path))
      ) {
        errors.push(`${label}.scope.allowedFiles: expected non-empty unique repo-relative paths`);
      }
      for (const field of ["forbiddenActions", "validation"]) {
        if (!validUniqueSafeIds(gate.scope[field])) {
          errors.push(`${label}.scope.${field}: expected non-empty unique safe ids`);
        }
      }
    }
    if (typeof gate.scopeDigest !== "string" || !SHA256_PATTERN.test(gate.scopeDigest)) {
      errors.push(`${label}.scopeDigest: expected a lowercase SHA-256 digest`);
    } else if (isPlainObject(gate.scope) && gate.scopeDigest !== computeGateScopeDigest(gate.scope)) {
      errors.push(`${label}.scopeDigest: does not match canonical scope`);
    }
    if (predecessor !== null && predecessor !== undefined) {
      const routeEvent = Array.isArray(predecessor.events)
        ? predecessor.events.find((event) => event?.type === "repair_routed")
        : undefined;
      if (routeEvent?.routerResult?.lane === "codex_auto_repair") {
        if (
          gate.risk !== predecessor.risk
          || gate.subject?.sourceHead !== predecessor.subject?.sourceHead
          || !sameCanonicalJson(gate.scope, predecessor.scope)
          || gate.scopeDigest !== predecessor.scopeDigest
        ) {
          errors.push(`${label}: automatic successor must inherit exact risk, source head, and scope`);
        }
      }
    }
    checkGateEvents(
      gate,
      label,
      evidenceRegistry,
      policy,
      expectedRetryState,
      expectedAuthorizationAuthority,
      errors
    );
    const routeEvent = Array.isArray(gate.events)
      ? gate.events.find((event) => event?.type === "repair_routed")
      : undefined;
    lineageRetryStates.set(gate.id, routeEvent
      ? {
          attempt: Number.isInteger(routeEvent.retry?.attempt)
            ? routeEvent.retry.attempt + 1
            : expectedRetryState.attempt,
          lineageDigest: typeof routeEvent.retry?.lineageDigest === "string"
            ? routeEvent.retry.lineageDigest
            : expectedRetryState.lineageDigest
        }
      : expectedRetryState);
    priorGates.set(gate.id, gate);
  }
  for (const [index, gate] of state.gates.entries()) {
    const finalEvent = Array.isArray(gate?.events) ? gate.events.at(-1) : undefined;
    if (
      ["successor_proposed", "superseded"].includes(finalEvent?.type)
      && !gateIds.has(finalEvent.successorGateId)
    ) {
      errors.push(`gate ledger.gates[${index}]: named successor must exist in the same ledger snapshot`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateGateLedgerTransition(baseState, headState, options = {}) {
  const errors = [];
  const headPolicy = options.headPolicy ?? options.policy ?? DEFAULT_REPAIR_POLICY;
  const basePolicy = options.basePolicy ?? options.policy ?? headPolicy;
  const headResult = validateGateLedger(headState, { policy: headPolicy });
  errors.push(...headResult.errors.map((error) => `head: ${error}`));
  if (baseState === null) {
    if (headResult.ok && headState.gates.length !== 0) errors.push("bootstrap must introduce an empty ledger");
    return { ok: errors.length === 0, errors };
  }
  const baseResult = validateGateLedger(baseState, { policy: basePolicy });
  errors.push(...baseResult.errors.map((error) => `base: ${error}`));
  if (!baseResult.ok || !headResult.ok) return { ok: false, errors };
  for (const field of [
    "schemaVersion",
    "authority",
    "description",
    "repairPolicyVersion",
    "repairPolicyDigest"
  ]) {
    if (!sameCanonicalJson(baseState[field], headState[field])) {
      errors.push(`gate ledger ${field} rewrite is forbidden`);
    }
  }
  if (headState.gates.length < baseState.gates.length) errors.push("gate deletion is forbidden");
  for (const [index, baseGate] of baseState.gates.entries()) {
    const headGate = headState.gates[index];
    if (!headGate || headGate.id !== baseGate.id) {
      errors.push(`gate ${baseGate.id}: reordered or replaced gate is forbidden`);
      continue;
    }
    for (const field of ["lineageId", "predecessorGateId", "risk", "subject", "scope", "scopeDigest"]) {
      if (!sameCanonicalJson(baseGate[field], headGate[field])) {
        errors.push(`gate ${baseGate.id}: ${field} rewrite is forbidden`);
      }
    }
    if (headGate.events.length < baseGate.events.length) {
      errors.push(`gate ${baseGate.id}: event deletion is forbidden`);
      continue;
    }
    for (const [eventIndex, event] of baseGate.events.entries()) {
      if (!sameCanonicalJson(event, headGate.events[eventIndex])) {
        errors.push(`gate ${baseGate.id}: event rewrite is forbidden at index ${eventIndex}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function routeGateFailure({
  gateRisk,
  attributionRecord,
  attributionDigest,
  policy = DEFAULT_REPAIR_POLICY,
  policyVersion,
  policyDigest,
  scope,
  retryLineage
} = {}) {
  if (!RISKS.has(gateRisk)) throw new Error("gate_governance_contract_invalid");
  if (!validateRepairPolicy(policy).ok) throw new Error("gate_governance_contract_invalid");
  if (!validateFailureAttribution(attributionRecord).ok) {
    throw new Error("gate_governance_contract_invalid");
  }
  if (
    typeof attributionDigest !== "string"
    || !SHA256_PATTERN.test(attributionDigest)
    || attributionDigest !== computeFailureAttributionDigest(attributionRecord)
  ) {
    throw new Error("gate_governance_contract_invalid");
  }
  if (
    policyVersion !== policy.schemaVersion
    || typeof policyDigest !== "string"
    || !SHA256_PATTERN.test(policyDigest)
    || policyDigest !== computeRepairPolicyDigest(policy)
  ) {
    throw new Error("gate_governance_contract_invalid");
  }
  if (!validateRouteScope(scope)) throw new Error("gate_governance_contract_invalid");
  if (
    !hasExactKeys(retryLineage, ["lineageDigest", "parentReceipt", "attempt", "budget"])
    || typeof retryLineage.lineageDigest !== "string"
    || !SHA256_PATTERN.test(retryLineage.lineageDigest)
    || typeof retryLineage.parentReceipt !== "string"
    || !SAFE_ID_PATTERN.test(retryLineage.parentReceipt)
    || !Number.isInteger(retryLineage.attempt)
    || retryLineage.attempt < 0
    || !Number.isInteger(retryLineage.budget)
    || retryLineage.budget < 0
  ) {
    throw new Error("gate_governance_contract_invalid");
  }
  const governanceRisk = computeGovernanceRisk(gateRisk, attributionRecord, scope, policy);
  if (retryLineage.budget !== policy.retryBudget[governanceRisk]) {
    throw new Error("gate_governance_contract_invalid");
  }
  const escalationInvariants = new Set(policy.escalationInvariants);
  const autoProposalCategories = new Set(policy.autoProposalCategories);
  let lane = "codex_auto_repair";
  let reasonCode = "bounded_auto_repair";
  if (routeScopeRequiresOperator(scope, policy)) {
    lane = "operator_review";
    reasonCode = "protected_scope";
  } else if (attributionRecord.affectedInvariants.some((value) => escalationInvariants.has(value))) {
    lane = "operator_review";
    reasonCode = "escalation_invariant";
  } else if (attributionRecord.category === "unknown" || attributionRecord.classifierMode === "unknown") {
    lane = "operator_review";
    reasonCode = "attribution_unknown";
  } else if (governanceRisk === "A") {
    lane = "operator_review";
    reasonCode = "risk_a_operator_required";
  } else if (attributionRecord.confidence !== "high") {
    lane = "operator_review";
    reasonCode = "attribution_confidence_insufficient";
  } else if (!autoProposalCategories.has(attributionRecord.category)) {
    lane = "operator_review";
    reasonCode = "category_not_auto_repairable";
  } else if (retryLineage.attempt >= retryLineage.budget) {
    lane = "operator_review";
    reasonCode = "retry_budget_exhausted";
  }
  const proposalEligible = lane === "codex_auto_repair";
  const record = {
    schemaVersion: "2",
    routerVersion: "repair-router/v2",
    repository: "gccwebos-com/proxy-gateway-minimal",
    attributionDigest,
    gateRisk,
    scopeDigest: computeGateScopeDigest(scope),
    governanceRisk,
    lane,
    proposalEligible,
    shadowEligible: attributionRecord.classifierMode !== "unknown",
    executionAuthority: false,
    operatorApprovalRequiredForMutation: true,
    newGateRequired: true,
    retry: {
      attempt: retryLineage.attempt,
      budget: retryLineage.budget,
      remaining: proposalEligible
        ? retryLineage.budget - retryLineage.attempt - 1
        : Math.max(retryLineage.budget - retryLineage.attempt, 0)
    },
    reasonCodes: [reasonCode],
    policyVersion,
    policyDigest,
    lineageDigest: retryLineage.lineageDigest
  };
  return {
    ok: true,
    code: "accepted",
    value: {
      record,
      routerResultDigest: computeRouterResultDigest(record)
    }
  };
}
