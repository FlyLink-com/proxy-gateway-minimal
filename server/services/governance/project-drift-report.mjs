import { createHash } from "node:crypto";

import {
  PROJECT_V2_CONTRACT_CANONICAL_SHA256,
  normalizeProjectV2Contract,
  verifyProjectV2ContractCanonicalBytes
} from "./project-v2-contract.mjs";

const MANAGED_FIELD_KEYS = Object.freeze([
  "status",
  "lane",
  "risk",
  "source-production-state",
  "validation-state",
  "production-impact"
]);

const NOT_EVALUATED_DOMAINS = Object.freeze([
  "exportFreshness",
  "projectViews",
  "nativeWorkflows",
  "nativeRepositoryInventory",
  "checks",
  "source",
  "production"
]);

const NON_CLAIMS = Object.freeze([
  "closed_unmerged_pull_request_delivery_not_inferred",
  "issue_or_epic_completion_not_inferred",
  "linked_pull_request_completion_not_inferred",
  "native_workflow_configuration_not_inferred",
  "production_state_not_inferred",
  "project_view_configuration_not_inferred",
  "site_validation_not_used_as_service_evidence",
  "stored_export_freshness_not_inferred",
  "source_completion_not_inferred"
]);

const OWNER_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/u;
const REPOSITORY_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)\/[A-Za-z0-9._-]{1,100}$/u;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_:+/=.-]{1,512}$/u;
const SAFE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/u;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/iu;
const PROJECT_ITEM_TYPES = new Set(["ISSUE", "PULL_REQUEST", "DRAFT_ISSUE", "REDACTED"]);
const PROJECT_ITEM_SCOPES = new Set([
  "managed_repository",
  "external_repository",
  "non_repository",
  "unknown"
]);
const SENSITIVE_TEXT_PATTERNS = Object.freeze([
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/iu,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/iu,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/iu,
  /\b(?:password|passwd|secret|token|api[-_ ]?key|client[-_ ]?secret)\s*[:=]\s*\S+/iu,
  /\b(?:ss|vless|vmess|trojan|hysteria2|tuic):\/\/\S+/iu
]);

const SOURCE_KEYS = Object.freeze([
  "provider",
  "owner",
  "projectNumber",
  "projectId",
  "titleMatchesContract",
  "url",
  "repository",
  "closed"
]);
const COVERAGE_KEYS = Object.freeze([
  "projectFields",
  "projectItems",
  "projectItemContent",
  "nativeRepositoryInventory",
  "checks",
  "source",
  "production"
]);
const COMPLETENESS_KEYS = Object.freeze([
  "complete",
  "projectResolved",
  "fieldManifestComplete",
  "itemPaginationComplete",
  "managedFieldValuesComplete",
  "stableRead"
]);
const SUMMARY_KEYS = Object.freeze([
  "projectItemCount",
  "issueItemCount",
  "pullRequestItemCount",
  "draftIssueItemCount",
  "unavailableItemCount",
  "archivedItemCount",
  "managedRepositoryItemCount",
  "externalRepositoryItemCount"
]);
const MATCHED_MANIFEST_FIELD_KEYS = Object.freeze([
  "resolution",
  "candidateCount",
  "name",
  "fieldId",
  "dataType",
  "options"
]);
const UNRESOLVED_MANIFEST_FIELD_KEYS = Object.freeze(["resolution", "candidateCount"]);
const KNOWN_MANIFEST_OPTION_KEYS = Object.freeze(["key", "name", "optionId"]);
const OBSERVED_MANIFEST_OPTION_KEYS = Object.freeze(["key", "unexpected", "optionId"]);
const MANAGED_VALUE_KEYS = Object.freeze(["fieldId", "optionId", "name"]);
const OBSERVED_OPTION_KEY_PATTERN = /^observed_[1-9][0-9]*$/u;
const COMMON_NATIVE_KEYS = Object.freeze([
  "kind",
  "nodeId",
  "repository",
  "number",
  "url",
  "state",
  "stateReason",
  "createdAt",
  "updatedAt",
  "closedAt"
]);
const PULL_REQUEST_NATIVE_KEYS = Object.freeze([
  ...COMMON_NATIVE_KEYS,
  "isDraft",
  "mergedAt",
  "headOid",
  "baseOid",
  "mergeCommitOid"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isObject(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return actualKeys.length === sortedExpected.length
    && actualKeys.every((key, index) => key === sortedExpected[index]);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (!isObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value)) ?? "undefined";
}

export function computeProjectDriftInputDigest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function safeInputDigest(value) {
  try {
    return computeProjectDriftInputDigest(value);
  } catch {
    return createHash("sha256").update("project-drift-unserializable-input").digest("hex");
  }
}

function safeContractText(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 160
    && value === value.trim()
    && !/\p{Cc}/u.test(value)
    && !SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function safeRepository(value) {
  return typeof value === "string" && REPOSITORY_PATTERN.test(value)
    ? value
    : null;
}

function safeOwner(value) {
  return typeof value === "string" && OWNER_PATTERN.test(value)
    ? value
    : null;
}

function safeOpaqueId(value) {
  return typeof value === "string"
    && OPAQUE_ID_PATTERN.test(value)
    && !SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value))
    ? value
    : null;
}

function validTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value)
    && Number.isFinite(Date.parse(value));
}

function validNullableTimestamp(value) {
  return value === null || validTimestamp(value);
}

function validNullableSha(value) {
  return value === null || (typeof value === "string" && SHA_PATTERN.test(value));
}

function validManagedFieldManifest(managed) {
  if (!hasExactKeys(managed, MANAGED_FIELD_KEYS)) return false;
  const fieldIds = new Set();
  for (const key of MANAGED_FIELD_KEYS) {
    const field = managed[key];
    if (hasExactKeys(field, UNRESOLVED_MANIFEST_FIELD_KEYS)) {
      if (
        (field.resolution === "missing" && field.candidateCount === 0)
        || (
          field.resolution === "ambiguous"
          && Number.isSafeInteger(field.candidateCount)
          && field.candidateCount >= 2
        )
      ) {
        continue;
      }
      return false;
    }
    if (
      !hasExactKeys(field, MATCHED_MANIFEST_FIELD_KEYS)
      || field.resolution !== "matched"
      || field.candidateCount !== 1
      || !safeContractText(field.name)
      || safeOpaqueId(field.fieldId) === null
      || !safeContractText(field.dataType)
      || !Array.isArray(field.options)
      || (field.dataType !== "SINGLE_SELECT" && field.options.length !== 0)
      || fieldIds.has(field.fieldId)
    ) {
      return false;
    }
    fieldIds.add(field.fieldId);
    const optionKeys = new Set();
    const optionNames = new Set();
    const optionIds = new Set();
    for (const option of field.options) {
      const known = hasExactKeys(option, KNOWN_MANIFEST_OPTION_KEYS);
      const observed = hasExactKeys(option, OBSERVED_MANIFEST_OPTION_KEYS);
      if (
        (!known && !observed)
        || typeof option.key !== "string"
        || !SAFE_KEY_PATTERN.test(option.key)
        || (observed && !OBSERVED_OPTION_KEY_PATTERN.test(option.key))
        || (known && !safeContractText(option.name))
        || (observed && option.unexpected !== true)
        || safeOpaqueId(option.optionId) === null
        || optionKeys.has(option.key)
        || (known && optionNames.has(option.name))
        || optionIds.has(option.optionId)
      ) {
        return false;
      }
      optionKeys.add(option.key);
      if (known) optionNames.add(option.name);
      optionIds.add(option.optionId);
    }
  }
  return true;
}

function validManagedValuesShape(values) {
  if (!hasExactKeys(values, MANAGED_FIELD_KEYS)) return false;
  return MANAGED_FIELD_KEYS.every((key) => {
    const value = values[key];
    return value === null || (
      hasExactKeys(value, MANAGED_VALUE_KEYS)
      && safeOpaqueId(value.fieldId) !== null
      && safeOpaqueId(value.optionId) !== null
      && safeContractText(value.name)
    );
  });
}

function managedValuesMatchManifest(values, manifest) {
  return MANAGED_FIELD_KEYS.every((key) => {
    const value = values[key];
    if (value === null) return true;
    const field = manifest[key];
    return field?.resolution === "matched" && field.dataType === "SINGLE_SELECT";
  });
}

function validNormalizedItem(item, managedRepository) {
  if (
    !isObject(item)
    || safeOpaqueId(item.projectItemId) === null
    || !Number.isSafeInteger(item.positionIndex)
    || item.positionIndex < 0
    || !PROJECT_ITEM_TYPES.has(item.projectItemType)
    || typeof item.isArchived !== "boolean"
    || !validTimestamp(item.projectUpdatedAt)
    || !PROJECT_ITEM_SCOPES.has(item.scope)
    || !isObject(item.native)
    || !validManagedValuesShape(item.managedFields)
  ) {
    return false;
  }

  const native = item.native;
  if (native.kind === "unavailable") {
    return hasExactKeys(native, [...COMMON_NATIVE_KEYS, "expectedType"])
      && item.scope === "unknown"
      && native.expectedType === item.projectItemType
      && COMMON_NATIVE_KEYS
        .filter((key) => key !== "kind")
        .every((key) => native[key] === null);
  }
  if (native.kind === "external_repository_item") {
    return hasExactKeys(native, [...COMMON_NATIVE_KEYS, "expectedType"])
      && item.scope === "external_repository"
      && item.projectItemId === `external_item_${item.positionIndex + 1}`
      && ["ISSUE", "PULL_REQUEST"].includes(item.projectItemType)
      && native.expectedType === item.projectItemType
      && COMMON_NATIVE_KEYS
        .filter((key) => key !== "kind")
        .every((key) => native[key] === null);
  }
  if (native.kind === "draft_issue") {
    return hasExactKeys(native, COMMON_NATIVE_KEYS)
      && item.projectItemType === "DRAFT_ISSUE"
      && item.scope === "non_repository"
      && safeOpaqueId(native.nodeId) !== null
      && native.repository === null
      && native.number === null
      && native.url === null
      && native.state === null
      && native.stateReason === null
      && validTimestamp(native.createdAt)
      && validTimestamp(native.updatedAt)
      && native.closedAt === null;
  }
  if (!["issue", "pull_request"].includes(native.kind)) return false;
  const repository = safeRepository(native.repository);
  if (
    repository === null
    || safeOpaqueId(native.nodeId) === null
    || !Number.isSafeInteger(native.number)
    || native.number < 1
    || !validTimestamp(native.createdAt)
    || !validTimestamp(native.updatedAt)
    || !validNullableTimestamp(native.closedAt)
  ) {
    return false;
  }
  if (repository !== managedRepository || item.scope !== "managed_repository") return false;
  if (native.kind === "issue") {
    return hasExactKeys(native, COMMON_NATIVE_KEYS)
      && item.projectItemType === "ISSUE"
      && native.url === `https://github.com/${repository}/issues/${native.number}`
      && ["OPEN", "CLOSED"].includes(native.state)
      && (native.stateReason === null
        || ["COMPLETED", "DUPLICATE", "NOT_PLANNED", "REOPENED"].includes(native.stateReason));
  }
  return hasExactKeys(native, PULL_REQUEST_NATIVE_KEYS)
    && item.projectItemType === "PULL_REQUEST"
    && native.url === `https://github.com/${repository}/pull/${native.number}`
    && ["OPEN", "CLOSED", "MERGED"].includes(native.state)
    && native.stateReason === null
    && typeof native.isDraft === "boolean"
    && validNullableTimestamp(native.mergedAt)
    && validNullableSha(native.headOid)
    && validNullableSha(native.baseOid)
    && validNullableSha(native.mergeCommitOid);
}

function expectedSummary(items) {
  const summary = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, 0]));
  summary.projectItemCount = items.length;
  for (const item of items) {
    if (item.projectItemType === "ISSUE") summary.issueItemCount += 1;
    else if (item.projectItemType === "PULL_REQUEST") summary.pullRequestItemCount += 1;
    else if (item.projectItemType === "DRAFT_ISSUE") summary.draftIssueItemCount += 1;
    if (item.native.kind === "unavailable") summary.unavailableItemCount += 1;
    if (item.isArchived) summary.archivedItemCount += 1;
    if (item.scope === "managed_repository") summary.managedRepositoryItemCount += 1;
    if (item.scope === "external_repository") summary.externalRepositoryItemCount += 1;
  }
  return summary;
}

function validSource(source) {
  if (
    !hasExactKeys(source, SOURCE_KEYS)
    || source.provider !== "github-projects-v2"
    || safeOwner(source.owner) === null
    || !Number.isSafeInteger(source.projectNumber)
    || source.projectNumber < 1
    || safeOpaqueId(source.projectId) === null
    || typeof source.titleMatchesContract !== "boolean"
    || safeRepository(source.repository) === null
    || typeof source.closed !== "boolean"
  ) {
    return false;
  }
  return source.url === `https://github.com/orgs/${source.owner}/projects/${source.projectNumber}`;
}

function validObservationClock(clock) {
  return hasExactKeys(clock, ["source", "trusted"])
    && (
      (clock.source === "github_http_date" && clock.trusted === true)
      || (clock.source === "local_system" && clock.trusted === false)
    );
}

function validCoverage(coverage, unavailableItemCount) {
  return hasExactKeys(coverage, COVERAGE_KEYS)
    && coverage.projectFields === "complete"
    && coverage.projectItems === "complete"
    && coverage.projectItemContent === (
      unavailableItemCount > 0 ? "complete_with_unavailable" : "complete"
    )
    && coverage.nativeRepositoryInventory === "not_collected"
    && coverage.checks === "not_collected"
    && coverage.source === "not_collected"
    && coverage.production === "not_collected";
}

function validCompleteness(completeness) {
  return hasExactKeys(completeness, COMPLETENESS_KEYS)
    && COMPLETENESS_KEYS.every((key) => typeof completeness[key] === "boolean");
}

function validSummary(summary, items) {
  if (
    !hasExactKeys(summary, SUMMARY_KEYS)
    || !SUMMARY_KEYS.every((key) => Number.isSafeInteger(summary[key]) && summary[key] >= 0)
  ) {
    return false;
  }
  const expected = expectedSummary(items);
  return SUMMARY_KEYS.every((key) => summary[key] === expected[key]);
}

function validReadAccounting(projectExport) {
  const { readFence, pagination, items } = projectExport;
  const managedCandidateCount = MANAGED_FIELD_KEYS.reduce((total, key) => (
    total + projectExport.fieldManifest.managed[key].candidateCount
  ), 0);
  if (
    !hasExactKeys(readFence, [
      "stable",
      "attempts",
      "projectionPassesPerAttempt",
      "projectUpdatedAt",
      "fieldCount",
      "itemCount"
    ])
    || readFence.stable !== true
    || !Number.isSafeInteger(readFence.attempts)
    || readFence.attempts < 1
    || readFence.attempts > 2
    || readFence.projectionPassesPerAttempt !== 2
    || !validTimestamp(readFence.projectUpdatedAt)
    || !Number.isSafeInteger(readFence.fieldCount)
    || readFence.fieldCount < 0
    || managedCandidateCount > readFence.fieldCount
    || readFence.itemCount !== items.length
    || !hasExactKeys(pagination, ["pageSize", "fields", "items"])
    || !Number.isSafeInteger(pagination.pageSize)
    || pagination.pageSize < 1
    || pagination.pageSize > 100
    || !hasExactKeys(pagination.fields, ["pages", "reportedTotalCount", "exportedCount"])
    || !hasExactKeys(
      pagination.items,
      ["pages", "reportedTotalCount", "exportedCount", "archivedStates"]
    )
  ) {
    return false;
  }
  const validPage = (page, expectedCount) => Number.isSafeInteger(page.pages)
    && page.pages >= 1
    && page.reportedTotalCount === expectedCount
    && page.exportedCount === expectedCount;
  return validPage(pagination.fields, readFence.fieldCount)
    && validPage(pagination.items, items.length)
    && Array.isArray(pagination.items.archivedStates)
    && pagination.items.archivedStates.length === 2
    && pagination.items.archivedStates[0] === "ARCHIVED"
    && pagination.items.archivedStates[1] === "NOT_ARCHIVED";
}

function validWarningsAndErrors(projectExport, unavailableItemCount) {
  if (!Array.isArray(projectExport.warnings) || !Array.isArray(projectExport.errors)) return false;
  if (projectExport.errors.length !== 0) return false;
  if (unavailableItemCount === 0) return projectExport.warnings.length === 0;
  return projectExport.warnings.length === 1
    && hasExactKeys(projectExport.warnings[0], ["code", "count"])
    && projectExport.warnings[0].code === "PROJECT_EXPORT_ITEM_CONTENT_UNAVAILABLE"
    && projectExport.warnings[0].count === unavailableItemCount;
}

function validateExportShape(projectExport) {
  if (
    !isObject(projectExport)
    || projectExport.type !== "gccgw_project_export"
    || projectExport.schemaVersion !== "1"
    || projectExport.canonicalContractSha256 !== PROJECT_V2_CONTRACT_CANONICAL_SHA256
    || projectExport.readOnly !== true
    || projectExport.mutation !== false
    || projectExport.productionAuthority !== false
    || projectExport.redacted !== true
    || !validTimestamp(projectExport.generatedAt)
    || !validObservationClock(projectExport.observationClock)
    || !validSource(projectExport.source)
    || !hasExactKeys(projectExport.fieldManifest, ["managed"])
    || !validManagedFieldManifest(projectExport.fieldManifest.managed)
    || !Array.isArray(projectExport.items)
    || !validCompleteness(projectExport.completeness)
  ) {
    return false;
  }
  if (!projectExport.items.every((item) => (
    validNormalizedItem(item, projectExport.source.repository)
    && managedValuesMatchManifest(item.managedFields, projectExport.fieldManifest.managed)
  ))) {
    return false;
  }
  const itemIds = projectExport.items.map((item) => item.projectItemId);
  const positionIndexes = projectExport.items.map((item) => item.positionIndex);
  if (
    new Set(itemIds).size !== itemIds.length
    || new Set(positionIndexes).size !== positionIndexes.length
  ) {
    return false;
  }
  const summary = expectedSummary(projectExport.items);
  const unavailableContentCount = summary.unavailableItemCount;
  return validCoverage(projectExport.coverage, unavailableContentCount)
    && validSummary(projectExport.summary, projectExport.items)
    && validReadAccounting(projectExport)
    && validWarningsAndErrors(projectExport, unavailableContentCount);
}

function exportIsComplete(projectExport) {
  const completeness = projectExport.completeness;
  return projectExport.ok === true
    && completeness.complete === true
    && completeness.projectResolved === true
    && completeness.fieldManifestComplete === true
    && completeness.itemPaginationComplete === true
    && completeness.managedFieldValuesComplete === true
    && completeness.stableRead === true
    && projectExport.coverage.projectFields === "complete"
    && projectExport.coverage.projectItems === "complete"
    && ["complete", "complete_with_unavailable"]
      .includes(projectExport.coverage.projectItemContent);
}

function contractFieldsByKey(contract) {
  return new Map(contract.managedFields.map((field) => [field.key, field]));
}

function contractOptionNames(field) {
  return field.options.map((option) => option.name);
}

function projectSubject(contract) {
  return {
    projectItemIdSha256: null,
    nativeKind: "project",
    repository: safeRepository(contract?.target?.repository),
    number: null
  };
}

function itemSubject(item) {
  const native = isObject(item?.native) ? item.native : {};
  const number = Number.isSafeInteger(native.number) && native.number > 0
    ? native.number
    : null;
  return {
    projectItemIdSha256: safeOpaqueId(item?.projectItemId) === null
      ? null
      : computeProjectDriftInputDigest(item.projectItemId),
    nativeKind: typeof native.kind === "string" ? native.kind : "unavailable",
    repository: safeRepository(native.repository),
    number
  };
}

function evidenceItemId(item) {
  return safeOpaqueId(item?.projectItemId) === null
    ? "unavailable"
    : `sha256_${computeProjectDriftInputDigest(item.projectItemId)}`;
}

function finding({
  code,
  classification,
  severity,
  domain,
  subject,
  fieldKey = null,
  expected = null,
  actual = null,
  evidenceRefs = []
}) {
  return {
    code,
    classification,
    severity,
    domain,
    subject,
    fieldKey,
    expected,
    actual,
    evidenceRefs: [...evidenceRefs].sort(),
    writeEligible: false
  };
}

function compareNullable(left, right) {
  const leftValue = String(left ?? "");
  const rightValue = String(right ?? "");
  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}

function compareFindings(left, right) {
  return compareNullable(left.subject.repository, right.subject.repository)
    || compareNullable(left.subject.nativeKind, right.subject.nativeKind)
    || (left.subject.number ?? 0) - (right.subject.number ?? 0)
    || compareNullable(left.subject.projectItemIdSha256, right.subject.projectItemIdSha256)
    || compareNullable(left.fieldKey, right.fieldKey)
    || compareNullable(left.code, right.code);
}

function safeUnexpectedOptionSummary(expectedOptions, actualOptions) {
  const expected = new Set(expectedOptions);
  const actualKnownNames = new Set(actualOptions
    .filter((option) => Object.hasOwn(option, "name"))
    .map((option) => option.name));
  return {
    expectedCount: expectedOptions.length,
    actualCount: actualOptions.length,
    missingExpectedNameSha256: expectedOptions
      .filter((name) => !actualKnownNames.has(name))
      .map((name) => computeProjectDriftInputDigest(name))
      .sort(),
    unexpectedNameSha256: actualOptions
      .flatMap((option) => {
        if (Object.hasOwn(option, "unexpected")) return [];
        return expected.has(option.name)
          ? []
          : [computeProjectDriftInputDigest(option.name)];
      })
      .sort(),
    unexpectedObservedCount: actualOptions
      .filter((option) => option.unexpected === true).length
  };
}

function actualOptions(field) {
  if (!Array.isArray(field?.options)) return [];
  return field.options;
}

function optionsMatchExpected(options, expectedNames) {
  return options.length === expectedNames.length
    && options.every((option, index) => (
      Object.hasOwn(option, "name") && option.name === expectedNames[index]
    ));
}

function evaluateFieldManifest({ projectExport, contract, findings }) {
  const contractFields = contractFieldsByKey(contract);
  const evaluable = new Set();
  const manifest = projectExport.fieldManifest.managed;

  for (const key of MANAGED_FIELD_KEYS) {
    const expectedField = contractFields.get(key);
    const actualField = manifest[key];
    const refs = [`projectExport.fieldManifest.managed.${key}`, `contract.managedFields.${key}`];
    if (actualField.resolution === "missing") {
      findings.push(finding({
        code: "project_drift_managed_field_missing",
        classification: "proven",
        severity: "error",
        domain: "project_schema",
        subject: projectSubject(contract),
        fieldKey: key,
        expected: { present: true },
        actual: { present: false },
        evidenceRefs: refs
      }));
      continue;
    }
    if (actualField.resolution === "ambiguous") {
      findings.push(finding({
        code: "project_drift_managed_field_ambiguous",
        classification: "proven",
        severity: "error",
        domain: "project_schema",
        subject: projectSubject(contract),
        fieldKey: key,
        expected: { candidateCount: 1 },
        actual: { candidateCount: actualField.candidateCount },
        evidenceRefs: refs
      }));
      continue;
    }

    let valid = true;
    if (actualField.name !== expectedField.name) {
      valid = false;
      findings.push(finding({
        code: "project_drift_managed_field_name_mismatch",
        classification: "proven",
        severity: "error",
        domain: "project_schema",
        subject: projectSubject(contract),
        fieldKey: key,
        expected: {
          matchesContractName: true,
          expectedNameSha256: computeProjectDriftInputDigest(expectedField.name)
        },
        actual: { matchesExpectedName: false },
        evidenceRefs: refs
      }));
    }
    if (actualField.dataType !== "SINGLE_SELECT") {
      valid = false;
      findings.push(finding({
        code: "project_drift_managed_field_type_mismatch",
        classification: "proven",
        severity: "error",
        domain: "project_schema",
        subject: projectSubject(contract),
        fieldKey: key,
        expected: { dataType: "SINGLE_SELECT" },
        actual: { matchesExpectedType: false },
        evidenceRefs: refs
      }));
    }

    if (actualField.dataType === "SINGLE_SELECT") {
      const options = actualOptions(actualField);
      const expectedOptionNames = contractOptionNames(expectedField);
      if (!optionsMatchExpected(options, expectedOptionNames)) {
        valid = false;
        findings.push(finding({
          code: "project_drift_managed_field_options_mismatch",
          classification: "proven",
          severity: "error",
          domain: "project_schema",
          subject: projectSubject(contract),
          fieldKey: key,
          expected: {
            optionCount: expectedOptionNames.length,
            orderedOptionNamesSha256: expectedOptionNames
              .map((name) => computeProjectDriftInputDigest(name))
          },
          actual: safeUnexpectedOptionSummary(expectedOptionNames, options),
          evidenceRefs: refs
        }));
      }
    }
    if (valid) evaluable.add(key);
  }

  for (const key of Object.keys(manifest).filter((key) => !contractFields.has(key)).sort()) {
    findings.push(finding({
      code: "project_drift_managed_field_unexpected",
      classification: "proven",
      severity: "error",
      domain: "project_schema",
      subject: projectSubject(contract),
      fieldKey: null,
      expected: { managedFieldCount: MANAGED_FIELD_KEYS.length },
      actual: { unexpectedFieldKeySha256: computeProjectDriftInputDigest(key) },
      evidenceRefs: ["projectExport.fieldManifest.managed"]
    }));
  }

  return evaluable;
}

function managedNativeItem(item, repository) {
  return isObject(item)
    && item.scope === "managed_repository"
    && isObject(item.native)
    && ["issue", "pull_request"].includes(item.native.kind)
    && item.native.repository === repository;
}

function evaluateObservedBindings({ projectExport, findings }) {
  const manifest = projectExport.fieldManifest.managed;
  for (const item of projectExport.items) {
    for (const key of MANAGED_FIELD_KEYS) {
      const value = item.managedFields[key];
      if (value === null) continue;
      const observedField = manifest[key];
      if (value.fieldId !== observedField.fieldId) {
        findings.push(finding({
          code: "project_drift_item_field_id_mismatch",
          classification: "indeterminate",
          severity: "error",
          domain: "input",
          subject: itemSubject(item),
          fieldKey: key,
          expected: { matchesObservedFieldId: true },
          actual: { matchesObservedFieldId: false },
          evidenceRefs: [
            `projectExport.items.${evidenceItemId(item)}.managedFields.${key}.fieldId`,
            `projectExport.fieldManifest.managed.${key}.fieldId`
          ]
        }));
      }
      const observedOption = observedField.options.find((option) => option.name === value.name);
      if (!observedOption || value.optionId !== observedOption.optionId) {
        findings.push(finding({
          code: "project_drift_item_option_id_mismatch",
          classification: "indeterminate",
          severity: "error",
          domain: "input",
          subject: itemSubject(item),
          fieldKey: key,
          expected: { matchesObservedOptionId: true },
          actual: { matchesObservedOptionId: false },
          evidenceRefs: [
            `projectExport.items.${evidenceItemId(item)}.managedFields.${key}.optionId`,
            `projectExport.fieldManifest.managed.${key}.options`
          ]
        }));
      }
    }
  }
}

function evaluateManagedItemFields({
  item,
  contractFields,
  requiredFieldKeys,
  evaluableFields,
  findings
}) {
  const values = isObject(item.managedFields) ? item.managedFields : {};
  for (const key of requiredFieldKeys) {
    if (!evaluableFields.has(key)) continue;
    const value = values[key];
    const refs = [
      `projectExport.items.${evidenceItemId(item)}.managedFields.${key}`,
      `contract.managedFields.${key}`,
      `contract.itemFieldRequirements.${item.native.kind}`
    ];
    if (!isObject(value) || typeof value.name !== "string") {
      findings.push(finding({
        code: "project_drift_required_item_field_missing",
        classification: "proven",
        severity: "error",
        domain: "project_item",
        subject: itemSubject(item),
        fieldKey: key,
        expected: { selectedOption: true },
        actual: { selectedOption: false },
        evidenceRefs: refs
      }));
      continue;
    }
    if (!contractOptionNames(contractFields.get(key)).includes(value.name)) {
      findings.push(finding({
        code: "project_drift_item_option_undeclared",
        classification: "proven",
        severity: "error",
        domain: "project_item",
        subject: itemSubject(item),
        fieldKey: key,
        expected: { declaredOption: true },
        actual: { optionNameSha256: computeProjectDriftInputDigest(value.name) },
        evidenceRefs: refs
      }));
      continue;
    }

  }
}

function evaluateLifecycle({
  item,
  contract,
  contractFields,
  evaluableFields,
  observedAt,
  observationClock,
  findings
}) {
  if (!evaluableFields.has("status")) return;
  const status = item.managedFields?.status;
  if (
    !isObject(status)
    || !contractOptionNames(contractFields.get("status")).includes(status.name)
  ) return;

  const doneName = "Done";
  const native = item.native;
  if (native.state === "OPEN" && status.name === doneName) {
    findings.push(finding({
      code: "project_drift_open_status_done_review",
      classification: "review",
      severity: "warning",
      domain: "native_lifecycle",
      subject: itemSubject(item),
      fieldKey: "status",
      expected: { automaticRepair: false },
      actual: { nativeState: "OPEN", projectStatus: doneName },
      evidenceRefs: [
        `projectExport.items.${evidenceItemId(item)}.native.state`,
        `projectExport.items.${evidenceItemId(item)}.managedFields.status`
      ]
    }));
    return;
  }

  let transitionAt = null;
  let driftCode = null;
  if (native.kind === "issue" && native.state === "CLOSED") {
    transitionAt = native.closedAt;
    driftCode = "project_drift_native_closed_status_not_done";
  } else if (native.kind === "pull_request" && native.state === "MERGED") {
    transitionAt = native.mergedAt;
    driftCode = "project_drift_native_merged_status_not_done";
  } else if (native.kind === "pull_request" && native.state === "CLOSED") {
    transitionAt = native.closedAt;
    driftCode = "project_drift_native_closed_status_not_done";
  }
  if (driftCode === null || status.name === doneName) return;

  if (observationClock.trusted !== true) {
    findings.push(finding({
      code: "project_drift_lifecycle_observation_clock_untrusted",
      classification: "review",
      severity: "warning",
      domain: "native_lifecycle",
      subject: itemSubject(item),
      fieldKey: "status",
      expected: { trustedObservationClock: true },
      actual: { trustedObservationClock: false },
      evidenceRefs: [
        "projectExport.observationClock",
        `projectExport.items.${evidenceItemId(item)}.native`,
        `projectExport.items.${evidenceItemId(item)}.managedFields.status`
      ]
    }));
    return;
  }

  if (!validTimestamp(transitionAt)) {
    findings.push(finding({
      code: "project_drift_native_transition_timestamp_unavailable_review",
      classification: "review",
      severity: "warning",
      domain: "native_lifecycle",
      subject: itemSubject(item),
      fieldKey: "status",
      expected: { transitionTimestampAvailable: true },
      actual: { transitionTimestampAvailable: false },
      evidenceRefs: [`projectExport.items.${evidenceItemId(item)}.native`]
    }));
    return;
  }

  const ageSeconds = (Date.parse(observedAt) - Date.parse(transitionAt)) / 1000;
  if (ageSeconds < 0) {
    findings.push(finding({
      code: "project_drift_native_transition_timestamp_future_review",
      classification: "review",
      severity: "warning",
      domain: "native_lifecycle",
      subject: itemSubject(item),
      fieldKey: "status",
      expected: { transitionNotAfterObservation: true },
      actual: { transitionNotAfterObservation: false },
      evidenceRefs: [`projectExport.items.${evidenceItemId(item)}.native`]
    }));
    return;
  }
  if (ageSeconds <= contract.nativeWorkflowGraceSeconds) {
    findings.push(finding({
      code: "project_drift_native_workflow_sync_pending",
      classification: "review",
      severity: "warning",
      domain: "native_lifecycle",
      subject: itemSubject(item),
      fieldKey: "status",
      expected: { automaticRepair: false },
      actual: { withinGraceWindow: true },
      evidenceRefs: [
        `projectExport.items.${evidenceItemId(item)}.native`,
        `projectExport.items.${evidenceItemId(item)}.managedFields.status`,
        "contract.nativeWorkflowGraceSeconds"
      ]
    }));
    return;
  }

  findings.push(finding({
    code: driftCode,
    classification: "proven",
    severity: "error",
    domain: "native_lifecycle",
    subject: itemSubject(item),
    fieldKey: "status",
    expected: { projectStatus: doneName },
    actual: { nativeState: native.state, projectStatusMatchesDone: false },
    evidenceRefs: [
      `projectExport.items.${evidenceItemId(item)}.native`,
      `projectExport.items.${evidenceItemId(item)}.managedFields.status`,
      "contract.nativeWorkflowGraceSeconds"
    ]
  }));
}

function evaluateItems({ projectExport, contract, evaluableFields, findings }) {
  const contractFields = contractFieldsByKey(contract);
  const requirementsByKind = new Map(contract.itemFieldRequirements.map((requirement) => [
    requirement.nativeKind,
    requirement.requiredFieldKeys
  ]));
  for (const item of projectExport.items) {
    if (item?.native?.kind === "unavailable") {
      findings.push(finding({
        code: "project_drift_native_content_unavailable_review",
        classification: "review",
        severity: "warning",
        domain: "native_lifecycle",
        subject: itemSubject(item),
        expected: { nativeContentAvailable: true },
        actual: { nativeContentAvailable: false },
        evidenceRefs: [`projectExport.items.${evidenceItemId(item)}.native`]
      }));
      continue;
    }
    if (!managedNativeItem(item, contract.target.repository)) continue;
    evaluateManagedItemFields({
      item,
      contractFields,
      requiredFieldKeys: requirementsByKind.get(item.native.kind),
      evaluableFields,
      findings
    });
    evaluateLifecycle({
      item,
      contract,
      contractFields,
      evaluableFields,
      observedAt: projectExport.generatedAt,
      observationClock: projectExport.observationClock,
      findings
    });
  }
}

function standardCoverage(status = "evaluated") {
  return {
    target: status,
    projectFieldManifest: status,
    managedItemFields: status,
    nativeLifecycle: status,
    exportFreshness: "not_evaluated",
    projectViews: "not_evaluated",
    nativeWorkflows: "not_evaluated",
    nativeRepositoryInventory: "not_evaluated",
    checks: "not_evaluated",
    source: "not_evaluated",
    production: "not_evaluated"
  };
}

function skippedRules() {
  return NOT_EVALUATED_DOMAINS.map((domain) => ({
    code: `project_drift_${domain.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)}_not_evaluated`,
    reason: "not_collected"
  }));
}

function reportBase({ projectExport, contract, canonicalContractBytes }) {
  const canonical = verifyProjectV2ContractCanonicalBytes(canonicalContractBytes);
  return {
    type: "gccgw_project_drift_report",
    schemaVersion: "1",
    generatedAt: validTimestamp(projectExport?.generatedAt)
      ? projectExport.generatedAt
      : null,
    readOnly: true,
    mutation: false,
    productionAuthority: false,
    redacted: true,
    canonicalContract: canonical,
    canonicalContractSha256: canonical
      ? PROJECT_V2_CONTRACT_CANONICAL_SHA256
      : null,
    target: {
      owner: null,
      projectNumber: null,
      repository: null
    },
    inputDigests: {
      projectExportSha256: safeInputDigest(projectExport),
      contractSha256: safeInputDigest(contract)
    },
    outcome: "indeterminate",
    coverage: standardCoverage("not_evaluated"),
    summary: {
      evaluatedItemCount: 0,
      provenCount: 0,
      reviewCount: 0,
      indeterminateCount: 0
    },
    findings: [],
    skippedRules: skippedRules(),
    nonClaims: [...NON_CLAIMS]
  };
}

function finalizeReport(report, evaluatedItemCount) {
  report.findings.sort(compareFindings);
  const provenCount = report.findings.filter((entry) => entry.classification === "proven").length;
  const reviewCount = report.findings.filter((entry) => entry.classification === "review").length;
  const indeterminateCount = report.findings
    .filter((entry) => entry.classification === "indeterminate").length;
  report.summary = {
    evaluatedItemCount,
    provenCount,
    reviewCount,
    indeterminateCount
  };
  if (indeterminateCount > 0) {
    report.outcome = "indeterminate";
  } else if (provenCount > 0) {
    report.outcome = "drift";
  } else if (reviewCount > 0) {
    report.outcome = "review_required";
  } else {
    report.outcome = "clean_in_evaluated_scope";
  }
  return report;
}

export function buildProjectDriftReport({
  projectExport,
  contract,
  canonicalContractBytes = null
} = {}) {
  const report = reportBase({ projectExport, contract, canonicalContractBytes });
  if (!report.canonicalContract) {
    report.findings.push(finding({
      code: "project_drift_contract_not_canonical",
      classification: "indeterminate",
      severity: "error",
      domain: "input",
      subject: projectSubject(null),
      expected: { canonicalContract: true },
      actual: { canonicalContract: false },
      evidenceRefs: ["contract"]
    }));
    return finalizeReport(report, 0);
  }
  try {
    contract = normalizeProjectV2Contract(contract);
  } catch {
    report.findings.push(finding({
      code: "project_drift_contract_invalid",
      classification: "indeterminate",
      severity: "error",
      domain: "input",
      subject: projectSubject(null),
      expected: { validContract: true },
      actual: { validContract: false },
      evidenceRefs: ["contract"]
    }));
    return finalizeReport(report, 0);
  }
  report.target = {
    owner: contract.target.owner,
    projectNumber: contract.target.projectNumber,
    repository: contract.target.repository
  };
  if (projectExport?.canonicalContractSha256 !== PROJECT_V2_CONTRACT_CANONICAL_SHA256) {
    report.findings.push(finding({
      code: "project_drift_export_contract_digest_mismatch",
      classification: "indeterminate",
      severity: "error",
      domain: "input",
      subject: projectSubject(contract),
      expected: { matchesCanonicalContractDigest: true },
      actual: { matchesCanonicalContractDigest: false },
      evidenceRefs: ["projectExport.canonicalContractSha256"]
    }));
    return finalizeReport(report, 0);
  }
  if (!validateExportShape(projectExport)) {
    report.findings.push(finding({
      code: "project_drift_input_invalid",
      classification: "indeterminate",
      severity: "error",
      domain: "input",
      subject: projectSubject(contract),
      expected: { validProjectExport: true },
      actual: { validProjectExport: false },
      evidenceRefs: ["projectExport"]
    }));
    return finalizeReport(report, 0);
  }
  if (!exportIsComplete(projectExport)) {
    report.findings.push(finding({
      code: "project_drift_input_incomplete",
      classification: "indeterminate",
      severity: "error",
      domain: "input",
      subject: projectSubject(contract),
      expected: { completeStableExport: true },
      actual: { completeStableExport: false },
      evidenceRefs: ["projectExport.completeness", "projectExport.coverage"]
    }));
    return finalizeReport(report, 0);
  }

  const mismatchedTargetKeys = ["owner", "projectNumber", "repository"]
    .filter((key) => projectExport.source[key] !== contract.target[key]);
  if (mismatchedTargetKeys.length > 0) {
    report.findings.push(finding({
      code: "project_drift_target_mismatch",
      classification: "indeterminate",
      severity: "error",
      domain: "input",
      subject: projectSubject(contract),
      expected: { targetMatchesContract: true },
      actual: { targetMatchesContract: false, mismatchedKeys: mismatchedTargetKeys },
      evidenceRefs: ["contract.target", "projectExport.source"]
    }));
    return finalizeReport(report, 0);
  }

  const mismatchedConfigurationKeys = [];
  if (projectExport.source.titleMatchesContract !== true) {
    mismatchedConfigurationKeys.push("name");
  }
  if (projectExport.source.closed !== contract.target.expectedClosed) {
    mismatchedConfigurationKeys.push("closed");
  }
  if (mismatchedConfigurationKeys.length > 0) {
    report.findings.push(finding({
      code: "project_drift_target_configuration_mismatch",
      classification: "proven",
      severity: "error",
      domain: "project_target",
      subject: projectSubject(contract),
      expected: { matchesReviewedTargetConfiguration: true },
      actual: {
        matchesReviewedTargetConfiguration: false,
        mismatchedKeys: mismatchedConfigurationKeys
      },
      evidenceRefs: ["contract.target", "projectExport.source"]
    }));
  }

  report.coverage = standardCoverage("evaluated");
  const findings = report.findings;
  evaluateObservedBindings({ projectExport, findings });
  const evaluableFields = evaluateFieldManifest({ projectExport, contract, findings });
  evaluateItems({ projectExport, contract, evaluableFields, findings });
  const evaluatedItemCount = projectExport.items.filter((item) =>
    managedNativeItem(item, contract.target.repository)
  ).length;
  return finalizeReport(report, evaluatedItemCount);
}

export function projectDriftExitCode(report) {
  if (report?.outcome === "clean_in_evaluated_scope") return 0;
  if (report?.outcome === "drift") return 1;
  return 2;
}

export const PROJECT_DRIFT_MANAGED_FIELD_KEYS = MANAGED_FIELD_KEYS;
