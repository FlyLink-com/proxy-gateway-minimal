import { createHash } from "node:crypto";

const CONTRACT_ERROR_MESSAGE = "The Project v2 static contract v1 is invalid.";

export const PROJECT_V2_CONTRACT_CANONICAL_SHA256 =
  "2b264539a6e3629fc5fd939c602573a6419a176184b81e8feeaca0c10a00017b";

const SENSITIVE_TEXT_PATTERNS = Object.freeze([
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_:.-]{8,}\b/i,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /\b(?:password|passwd|secret|token|api[-_ ]?key|client[-_ ]?secret)\s*[:=]\s*\S+/i,
  /\b(?:ss|vless|vmess|trojan|hysteria2|tuic):\/\/\S+/i
]);

const OWNER_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/;
const REPOSITORY_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)\/[A-Za-z0-9._-]{1,100}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

const TOP_LEVEL_KEYS = Object.freeze([
  "schemaVersion",
  "contractType",
  "verifiedAt",
  "identityBinding",
  "target",
  "authority",
  "nativeWorkflowGraceSeconds",
  "managedFields",
  "itemFieldRequirements",
  "views",
  "nativeWorkflows"
]);

const EXPECTED_TARGET = Object.freeze({
  owner: "gccwebos-com",
  projectNumber: 1,
  repository: "gccwebos-com/proxy-gateway-minimal",
  name: "GCC WebOS — Delivery",
  expectedClosed: false
});

const EXPECTED_AUTHORITY = Object.freeze({
  projectProjectionOnly: true,
  productionAuthority: false,
  writebackEnabled: false
});

const EXPECTED_MANAGED_FIELDS = Object.freeze([
  Object.freeze({
    key: "status",
    name: "Status",
    options: Object.freeze(["Backlog", "Todo", "In Progress", "Blocked", "Done"])
  }),
  Object.freeze({
    key: "lane",
    name: "Lane",
    options: Object.freeze([
      "traffic-accounting",
      "portal-lifecycle",
      "commercial-foundation",
      "operations-foundation",
      "version-management",
      "dependency-materialization",
      "legacy-retirement"
    ])
  }),
  Object.freeze({ key: "risk", name: "Risk", options: Object.freeze(["A", "B", "C"]) }),
  Object.freeze({
    key: "source-production-state",
    name: "Source / Production State",
    options: Object.freeze(["aligned", "drift", "runtime-only", "artifact-only", "unknown"])
  }),
  Object.freeze({
    key: "validation-state",
    name: "Validation State",
    options: Object.freeze(["Not started", "Running", "Passed", "Blocked"])
  }),
  Object.freeze({
    key: "production-impact",
    name: "Production Impact",
    options: Object.freeze(["none", "read-only", "mutation gated separately"])
  })
]);

const EXPECTED_ITEM_FIELD_REQUIREMENTS = Object.freeze([
  Object.freeze({
    scope: "managed_repository",
    nativeKind: "issue",
    requiredFieldKeys: Object.freeze([
      "status",
      "lane",
      "risk",
      "source-production-state",
      "validation-state",
      "production-impact"
    ])
  }),
  Object.freeze({
    scope: "managed_repository",
    nativeKind: "pull_request",
    requiredFieldKeys: Object.freeze(["status"])
  })
]);

const EXPECTED_VIEWS = Object.freeze([
  Object.freeze({
    key: "portfolio-triage",
    name: "Portfolio Triage",
    layout: "table",
    filter: "is:issue is:open"
  }),
  Object.freeze({
    key: "execution-board",
    name: "Execution Board",
    layout: "board",
    filter: "is:issue is:open",
    groupBy: "Status",
    sliceBy: "Lane"
  }),
  Object.freeze({
    key: "risk-a-gates",
    name: "Risk A Gates",
    layout: "board",
    filter: "risk:A -status:Done",
    groupBy: "Status"
  }),
  Object.freeze({
    key: "review-queue",
    name: "Review Queue",
    layout: "table",
    filter: "is:pr is:open -is:draft"
  })
]);

const EXPECTED_NATIVE_WORKFLOWS = Object.freeze([
  Object.freeze({
    key: "auto-add-open-repository-items",
    name: "Auto-add to project",
    trigger: Object.freeze({
      type: "item-matches-query",
      repository: "gccwebos-com/proxy-gateway-minimal",
      filter: "is:issue,pr is:open"
    }),
    action: Object.freeze({ type: "add-to-project" })
  }),
  Object.freeze({
    key: "item-added-to-todo",
    name: "Item added to project",
    trigger: Object.freeze({ type: "item-added" }),
    action: Object.freeze({ type: "set-field", field: "Status", value: "Todo" })
  }),
  Object.freeze({
    key: "item-closed-to-done",
    name: "Item closed",
    trigger: Object.freeze({ type: "item-closed" }),
    action: Object.freeze({ type: "set-field", field: "Status", value: "Done" })
  }),
  Object.freeze({
    key: "item-reopened-to-todo",
    name: "Item reopened",
    trigger: Object.freeze({ type: "item-reopened" }),
    action: Object.freeze({ type: "set-field", field: "Status", value: "Todo" })
  }),
  Object.freeze({
    key: "pull-request-linked-to-issue-to-in-progress",
    name: "Pull request linked to issue",
    trigger: Object.freeze({ type: "pull-request-linked-to-issue" }),
    action: Object.freeze({ type: "set-field", field: "Status", value: "In Progress" })
  }),
  Object.freeze({
    key: "pull-request-merged-to-done",
    name: "Pull request merged",
    trigger: Object.freeze({ type: "pull-request-merged" }),
    action: Object.freeze({ type: "set-field", field: "Status", value: "Done" })
  })
]);

export class ProjectV2ContractError extends Error {
  constructor(code = "PROJECT_V2_CONTRACT_INVALID") {
    super(CONTRACT_ERROR_MESSAGE);
    this.name = "ProjectV2ContractError";
    this.code = code;
    this.exitCode = 5;
    this.retryable = false;
  }
}

function invalid(code) {
  throw new ProjectV2ContractError(code);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function safeText(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 160
    || value !== value.trim()
    || /\p{Cc}/u.test(value)
  ) {
    invalid();
  }
  if (SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
    invalid("PROJECT_V2_CONTRACT_SENSITIVE_VALUE");
  }
  return value;
}

function assertSafeTree(value, seen = new WeakSet()) {
  if (typeof value === "string") {
    safeText(value);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) invalid();
    seen.add(value);
    value.forEach((entry) => assertSafeTree(entry, seen));
    return;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) invalid();
    seen.add(value);
    Object.entries(value).forEach(([key, entry]) => {
      safeText(key);
      assertSafeTree(entry, seen);
    });
  }
}

function optionKeyFromName(name) {
  const key = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!KEY_PATTERN.test(key)) invalid();
  return key;
}

function normalizeOption(rawOption) {
  if (typeof rawOption === "string") {
    const name = safeText(rawOption);
    return Object.freeze({ key: optionKeyFromName(name), name });
  }
  if (!hasExactKeys(rawOption, ["key", "name"])) invalid();
  const key = safeText(rawOption.key);
  const name = safeText(rawOption.name);
  if (!KEY_PATTERN.test(key)) invalid();
  return Object.freeze({ key, name });
}

function normalizeManagedField(rawField, expectedField) {
  if (!isPlainObject(rawField)) invalid();
  const hasType = Object.hasOwn(rawField, "type");
  const hasDataType = Object.hasOwn(rawField, "dataType");
  const expectedKeys = hasType
    ? ["key", "name", "type", "options"]
    : ["key", "name", "dataType", "options"];
  if (hasType === hasDataType || !hasExactKeys(rawField, expectedKeys)) invalid();

  const key = safeText(rawField.key);
  const name = safeText(rawField.name);
  if (!KEY_PATTERN.test(key)) invalid();
  if (
    (hasType && rawField.type !== "single-select")
    || (hasDataType && rawField.dataType !== "SINGLE_SELECT")
  ) {
    invalid("PROJECT_V2_CONTRACT_FIELD_TYPE_MISMATCH");
  }

  const rawOptions = rawField.options;
  if (
    !Array.isArray(rawOptions)
    || rawOptions.length === 0
    || (hasType && !rawOptions.every((option) => typeof option === "string"))
    || (hasDataType && !rawOptions.every((option) => isPlainObject(option)))
  ) invalid();
  const options = rawOptions.map(normalizeOption);
  if (
    new Set(options.map((option) => option.key)).size !== options.length
    || new Set(options.map((option) => option.name)).size !== options.length
  ) {
    invalid("PROJECT_V2_CONTRACT_OPTION_SET_MISMATCH");
  }
  if (
    key !== expectedField.key
    || name !== expectedField.name
    || options.length !== expectedField.options.length
    || options.some((option, index) => (
      option.name !== expectedField.options[index]
      || option.key !== optionKeyFromName(option.name)
    ))
  ) {
    invalid("PROJECT_V2_CONTRACT_SEMANTIC_MISMATCH");
  }
  return Object.freeze({ key, name, dataType: "SINGLE_SELECT", options: Object.freeze(options) });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

function exactJson(value, expected) {
  return JSON.stringify(canonicalJson(value)) === JSON.stringify(canonicalJson(expected));
}

function cloneFrozen(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozen));
  if (isPlainObject(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneFrozen(entry)])
    ));
  }
  return value;
}

export function canonicalizeProjectV2ContractBytes(rawBytes) {
  let text;
  try {
    if (typeof rawBytes === "string") {
      text = rawBytes;
    } else if (rawBytes instanceof Uint8Array) {
      text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  return text.replaceAll("\r\n", "\n");
}

export function computeProjectV2ContractSha256(rawBytes) {
  const canonical = canonicalizeProjectV2ContractBytes(rawBytes);
  if (canonical === null) return null;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyProjectV2ContractCanonicalBytes(rawBytes) {
  return computeProjectV2ContractSha256(rawBytes) === PROJECT_V2_CONTRACT_CANONICAL_SHA256;
}

function normalizeProjectV2ContractImpl(rawContract) {
  if (!hasExactKeys(rawContract, TOP_LEVEL_KEYS)) invalid();
  assertSafeTree(rawContract);
  if (
    rawContract.schemaVersion !== 1
    || rawContract.contractType !== "github-project-v2-static-contract"
    || rawContract.verifiedAt !== "2026-08-30"
    || rawContract.identityBinding !== "semantic-only"
    || rawContract.nativeWorkflowGraceSeconds !== 900
  ) {
    invalid("PROJECT_V2_CONTRACT_SEMANTIC_MISMATCH");
  }

  if (
    !hasExactKeys(rawContract.target, Object.keys(EXPECTED_TARGET))
    || !OWNER_PATTERN.test(rawContract.target.owner)
    || !REPOSITORY_PATTERN.test(rawContract.target.repository)
    || !exactJson(rawContract.target, EXPECTED_TARGET)
  ) {
    invalid("PROJECT_V2_CONTRACT_TARGET_MISMATCH");
  }
  if (
    !hasExactKeys(rawContract.authority, Object.keys(EXPECTED_AUTHORITY))
    || !exactJson(rawContract.authority, EXPECTED_AUTHORITY)
  ) {
    invalid("PROJECT_V2_CONTRACT_AUTHORITY_INVALID");
  }

  if (!Array.isArray(rawContract.managedFields)) {
    invalid();
  }
  const seenFieldKeys = new Set();
  const seenFieldNames = new Set();
  for (const field of rawContract.managedFields) {
    if (!isPlainObject(field)) invalid();
    if (seenFieldKeys.has(field.key) || seenFieldNames.has(field.name)) {
      invalid("PROJECT_V2_CONTRACT_MANAGED_FIELD_AMBIGUOUS");
    }
    seenFieldKeys.add(field.key);
    seenFieldNames.add(field.name);
  }
  if (rawContract.managedFields.length !== EXPECTED_MANAGED_FIELDS.length) invalid();
  const managedFields = rawContract.managedFields.map((field, index) => (
    normalizeManagedField(field, EXPECTED_MANAGED_FIELDS[index])
  ));

  if (
    !exactJson(rawContract.itemFieldRequirements, EXPECTED_ITEM_FIELD_REQUIREMENTS)
    || !exactJson(rawContract.views, EXPECTED_VIEWS)
    || !exactJson(rawContract.nativeWorkflows, EXPECTED_NATIVE_WORKFLOWS)
  ) {
    invalid("PROJECT_V2_CONTRACT_SEMANTIC_MISMATCH");
  }

  return Object.freeze({
    schemaVersion: 1,
    contractType: "github-project-v2-static-contract",
    verifiedAt: "2026-08-30",
    identityBinding: "semantic-only",
    target: cloneFrozen(EXPECTED_TARGET),
    authority: cloneFrozen(EXPECTED_AUTHORITY),
    nativeWorkflowGraceSeconds: 900,
    managedFields: Object.freeze(managedFields),
    itemFieldRequirements: cloneFrozen(EXPECTED_ITEM_FIELD_REQUIREMENTS),
    views: cloneFrozen(EXPECTED_VIEWS),
    nativeWorkflows: cloneFrozen(EXPECTED_NATIVE_WORKFLOWS)
  });
}

export function normalizeProjectV2Contract(rawContract) {
  try {
    return normalizeProjectV2ContractImpl(rawContract);
  } catch (error) {
    if (error instanceof ProjectV2ContractError) throw error;
    throw new ProjectV2ContractError();
  }
}
