import { createHash } from "node:crypto";

import {
  PROJECT_V2_CONTRACT_CANONICAL_SHA256,
  ProjectV2ContractError,
  normalizeProjectV2Contract as normalizeStaticProjectV2Contract
} from "./project-v2-contract.mjs";

const PROJECT_EXPORT_TYPE = "gccgw_project_export";
const PROJECT_EXPORT_SCHEMA_VERSION = "1";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 1000;
const DEFAULT_CONSISTENCY_RETRIES = 1;
const ARCHIVED_STATES = Object.freeze(["ARCHIVED", "NOT_ARCHIVED"]);

const ERROR_MESSAGES = Object.freeze({
  PROJECT_EXPORT_ARGUMENT_INVALID: "Project export arguments are invalid.",
  PROJECT_EXPORT_JSON_REQUIRED: "Project export requires --json.",
  PROJECT_EXPORT_TOKEN_MISSING: "Project export requires an ephemeral GitHub read token.",
  PROJECT_EXPORT_AUTHENTICATION_FAILED: "GitHub authentication failed for project export.",
  PROJECT_EXPORT_AUTHORIZATION_FAILED: "GitHub authorization is insufficient for project export.",
  PROJECT_EXPORT_RATE_LIMITED: "GitHub rate limited the project export read.",
  PROJECT_EXPORT_API_UNAVAILABLE: "The GitHub GraphQL API is unavailable.",
  PROJECT_EXPORT_GRAPHQL_ERROR: "GitHub returned a GraphQL error for project export.",
  PROJECT_EXPORT_RESPONSE_INVALID: "GitHub returned an invalid project export response.",
  PROJECT_EXPORT_CONTRACT_INVALID: "The Project v2 static contract is invalid.",
  PROJECT_EXPORT_CONTRACT_AUTHORITY_INVALID: "The Project v2 contract exceeds the read-only projection boundary.",
  PROJECT_EXPORT_OWNER_UNAVAILABLE: "The configured Project v2 owner is unavailable.",
  PROJECT_EXPORT_PROJECT_UNAVAILABLE: "The configured Project v2 project is unavailable.",
  PROJECT_EXPORT_CURSOR_MISSING: "A Project v2 page omitted its continuation cursor.",
  PROJECT_EXPORT_CURSOR_REPEATED: "A Project v2 pagination cursor repeated.",
  PROJECT_EXPORT_DUPLICATE_NODE: "A Project v2 connection returned a duplicate node.",
  PROJECT_EXPORT_COUNT_MISMATCH: "A Project v2 connection count does not match the collected nodes.",
  PROJECT_EXPORT_PAGE_LIMIT_EXCEEDED: "Project v2 pagination exceeded the bounded page limit.",
  PROJECT_EXPORT_MANAGED_FIELD_MISSING: "A managed Project v2 field is missing.",
  PROJECT_EXPORT_MANAGED_FIELD_AMBIGUOUS: "A managed Project v2 field is ambiguous.",
  PROJECT_EXPORT_FIELD_TYPE_MISMATCH: "A managed Project v2 field has the wrong type.",
  PROJECT_EXPORT_OPTION_SET_MISMATCH: "A managed Project v2 option set differs from the static contract.",
  PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID: "A Project v2 item has an invalid managed field value.",
  PROJECT_EXPORT_ITEM_CONTENT_INVALID: "A Project v2 item has invalid or mismatched content.",
  PROJECT_EXPORT_CHANGED_DURING_READ: "Project v2 changed during the bounded export read.",
  PROJECT_EXPORT_REDACTION_FAILED: "Project export refused an unsafe output value."
});

const SECRET_VALUE_PATTERNS = Object.freeze([
  /\bgithub_pat_[A-Za-z0-9_]{8,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_:.-]{8,}\b/i,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /\b(?:password|passwd|secret|token|api[-_ ]?key|client[-_ ]?secret)\s*[:=]\s*\S+/i,
  /\b(?:ss|vless|vmess|trojan|hysteria2|tuic):\/\/\S+/i
]);

const REPOSITORY_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)\/[A-Za-z0-9._-]{1,100}$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_:+/=.\-]{1,512}$/;
const DATA_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const ISSUE_STATES = new Set(["OPEN", "CLOSED"]);
const ISSUE_STATE_REASONS = new Set(["COMPLETED", "DUPLICATE", "NOT_PLANNED", "REOPENED"]);
const PULL_REQUEST_STATES = new Set(["OPEN", "CLOSED", "MERGED"]);
const ITEM_TYPES = new Set(["ISSUE", "PULL_REQUEST", "DRAFT_ISSUE", "REDACTED"]);
const RETRYABLE_CONSISTENCY_CODES = new Set([
  "PROJECT_EXPORT_CURSOR_MISSING",
  "PROJECT_EXPORT_CURSOR_REPEATED",
  "PROJECT_EXPORT_DUPLICATE_NODE",
  "PROJECT_EXPORT_COUNT_MISMATCH",
  "PROJECT_EXPORT_MANAGED_FIELD_MISSING",
  "PROJECT_EXPORT_MANAGED_FIELD_AMBIGUOUS",
  "PROJECT_EXPORT_FIELD_TYPE_MISMATCH",
  "PROJECT_EXPORT_OPTION_SET_MISMATCH",
  "PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID"
]);

export const PROJECT_EXPORT_QUERIES = Object.freeze({
  fence: `query ProjectExportFence($owner: String!, $projectNumber: Int!) {
  organization(login: $owner) {
    projectV2(number: $projectNumber) {
      id
      number
      title
      closed
      updatedAt
      fields(first: 1) {
        totalCount
      }
      items(first: 1, archivedStates: [ARCHIVED, NOT_ARCHIVED]) {
        totalCount
      }
    }
  }
}`,
  fields: `query ProjectExportFields($projectId: ID!, $first: Int!, $after: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: $first, after: $after) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          __typename
          ... on ProjectV2FieldCommon {
            id
            name
            dataType
          }
        }
      }
    }
  }
}`,
  managedFieldOptions: `query ProjectExportManagedFieldOptions($fieldIds: [ID!]!) {
  nodes(ids: $fieldIds) {
    __typename
    ... on ProjectV2SingleSelectField {
      id
      name
      dataType
      options {
        id
        name
      }
    }
  }
}`
});

export class ProjectExportError extends Error {
  constructor(code, { exitCode = 5, retryable = false } = {}) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.PROJECT_EXPORT_RESPONSE_INVALID);
    this.name = "ProjectExportError";
    this.code = code;
    this.exitCode = exitCode;
    this.retryable = retryable;
  }
}

function projectError(code, options) {
  return new ProjectExportError(code, options);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeContractText(value, code = "PROJECT_EXPORT_CONTRACT_INVALID") {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || value.length > 160) {
    throw projectError(code);
  }
  if (/\p{Cc}/u.test(value) || SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw projectError("PROJECT_EXPORT_REDACTION_FAILED", { exitCode: 6 });
  }
  return value;
}

export function normalizeProjectV2Contract(rawContract) {
  try {
    return normalizeStaticProjectV2Contract(rawContract);
  } catch (error) {
    if (!(error instanceof ProjectV2ContractError)) throw error;
    const mapping = {
      PROJECT_V2_CONTRACT_AUTHORITY_INVALID: "PROJECT_EXPORT_CONTRACT_AUTHORITY_INVALID",
      PROJECT_V2_CONTRACT_FIELD_TYPE_MISMATCH: "PROJECT_EXPORT_FIELD_TYPE_MISMATCH",
      PROJECT_V2_CONTRACT_OPTION_SET_MISMATCH: "PROJECT_EXPORT_OPTION_SET_MISMATCH",
      PROJECT_V2_CONTRACT_MANAGED_FIELD_AMBIGUOUS: "PROJECT_EXPORT_MANAGED_FIELD_AMBIGUOUS"
    };
    if (error.code === "PROJECT_V2_CONTRACT_SENSITIVE_VALUE") {
      throw projectError("PROJECT_EXPORT_REDACTION_FAILED", { exitCode: 6 });
    }
    throw projectError(mapping[error.code] ?? "PROJECT_EXPORT_CONTRACT_INVALID");
  }
}

function graphqlString(value) {
  return JSON.stringify(value);
}

export function buildProjectItemsQuery(contract, managedManifest = null) {
  const managedSelections = contract.managedFields
    .map((field, index) => {
      const observation = managedManifest?.[field.key];
      if (
        managedManifest !== null
        && (
          observation?.resolution !== "matched"
          || observation.dataType !== "SINGLE_SELECT"
        )
      ) {
        return "";
      }
      return `        managedField${index}: fieldValueByName(name: ${graphqlString(field.name)}) {
          __typename
          ... on ProjectV2ItemFieldSingleSelectValue {
            optionId
            name
          }
        }`;
    })
    .filter(Boolean)
    .join("\n");

  return `query ProjectExportItems($projectId: ID!, $first: Int!, $after: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(
        first: $first
        after: $after
        archivedStates: [ARCHIVED, NOT_ARCHIVED]
        orderBy: { field: POSITION, direction: ASC }
      ) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          type
          isArchived
          updatedAt
          content {
            __typename
            ... on Issue {
              id
              number
              state
              stateReason
              createdAt
              updatedAt
              closedAt
              repository {
                nameWithOwner
              }
            }
            ... on PullRequest {
              id
              number
              state
              isDraft
              createdAt
              updatedAt
              closedAt
              mergedAt
              headRefOid
              baseRefOid
              mergeCommit {
                oid
              }
              repository {
                nameWithOwner
              }
            }
            ... on DraftIssue {
              id
              createdAt
              updatedAt
            }
          }
${managedSelections}
        }
      }
    }
  }
}`;
}

function requireObject(value, code = "PROJECT_EXPORT_RESPONSE_INVALID") {
  if (!isPlainObject(value)) throw projectError(code);
  return value;
}

function safeOpaqueId(value, code = "PROJECT_EXPORT_RESPONSE_INVALID") {
  if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw projectError("PROJECT_EXPORT_REDACTION_FAILED", { exitCode: 6 });
  }
  if (typeof value !== "string" || !OPAQUE_ID_PATTERN.test(value)) {
    throw projectError(code);
  }
  return value;
}

function safeTimestamp(value, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    || Number.isNaN(Date.parse(value))
  ) {
    throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
  }
  return new Date(value).toISOString();
}

function assertRedactedOutput(value) {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw projectError("PROJECT_EXPORT_REDACTION_FAILED", { exitCode: 6 });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertRedactedOutput);
    return;
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach(assertRedactedOutput);
  }
}

function safeSha(value, { nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  return value.toLowerCase();
}

function safeRepository(value) {
  if (typeof value !== "string" || !REPOSITORY_PATTERN.test(value)) {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  return value;
}

function safeDataType(value) {
  const dataType = safeContractText(value, "PROJECT_EXPORT_RESPONSE_INVALID");
  if (!DATA_TYPE_PATTERN.test(dataType)) {
    throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
  }
  return dataType;
}

function safeTextSha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeIssueNumber(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  return value;
}

async function readFence(graphql, target) {
  const data = requireObject(await graphql({
    operationName: "ProjectExportFence",
    query: PROJECT_EXPORT_QUERIES.fence,
    variables: {
      owner: target.owner,
      projectNumber: target.projectNumber
    }
  }));
  if (data.organization === null || data.organization === undefined) {
    throw projectError("PROJECT_EXPORT_OWNER_UNAVAILABLE", { exitCode: 4 });
  }
  const organization = requireObject(data.organization);
  if (organization.projectV2 === null || organization.projectV2 === undefined) {
    throw projectError("PROJECT_EXPORT_PROJECT_UNAVAILABLE", { exitCode: 4 });
  }
  const project = requireObject(organization.projectV2);
  const fields = requireObject(project.fields);
  const items = requireObject(project.items);
  const projectTitle = safeContractText(project.title, "PROJECT_EXPORT_RESPONSE_INVALID");
  if (
    project.number !== target.projectNumber
    || typeof project.closed !== "boolean"
    || !Number.isSafeInteger(fields.totalCount)
    || fields.totalCount < 0
    || !Number.isSafeInteger(items.totalCount)
    || items.totalCount < 0
  ) {
    throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
  }
  return Object.freeze({
    projectId: safeOpaqueId(project.id),
    projectNumber: project.number,
    projectTitle,
    closed: project.closed,
    projectUpdatedAt: safeTimestamp(project.updatedAt),
    fieldCount: fields.totalCount,
    itemCount: items.totalCount
  });
}

function sameFence(left, right) {
  return left.projectId === right.projectId
    && left.projectNumber === right.projectNumber
    && left.projectTitle === right.projectTitle
    && left.closed === right.closed
    && left.projectUpdatedAt === right.projectUpdatedAt
    && left.fieldCount === right.fieldCount
    && left.itemCount === right.itemCount;
}

async function paginateConnection({
  graphql,
  operationName,
  query,
  variables,
  selectConnection,
  pageSize,
  maxPages
}) {
  const nodes = [];
  const seenNodeIds = new Set();
  const seenCursors = new Set();
  let after = null;
  let pages = 0;
  let reportedTotalCount = null;

  while (true) {
    if (pages >= maxPages) {
      throw projectError("PROJECT_EXPORT_PAGE_LIMIT_EXCEEDED");
    }
    const data = requireObject(await graphql({
      operationName,
      query,
      variables: { ...variables, first: pageSize, after }
    }));
    const connection = requireObject(selectConnection(data));
    const pageInfo = requireObject(connection.pageInfo);
    if (
      !Number.isSafeInteger(connection.totalCount)
      || connection.totalCount < 0
      || !Array.isArray(connection.nodes)
      || typeof pageInfo.hasNextPage !== "boolean"
    ) {
      throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
    }
    if (reportedTotalCount === null) {
      reportedTotalCount = connection.totalCount;
    } else if (reportedTotalCount !== connection.totalCount) {
      throw projectError("PROJECT_EXPORT_COUNT_MISMATCH");
    }

    if (
      pageInfo.hasNextPage
      && typeof pageInfo.endCursor === "string"
      && (pageInfo.endCursor === after || seenCursors.has(pageInfo.endCursor))
    ) {
      throw projectError("PROJECT_EXPORT_CURSOR_REPEATED");
    }

    for (const rawNode of connection.nodes) {
      const node = requireObject(rawNode);
      const nodeId = safeOpaqueId(node.id);
      if (seenNodeIds.has(nodeId)) {
        throw projectError("PROJECT_EXPORT_DUPLICATE_NODE");
      }
      seenNodeIds.add(nodeId);
      nodes.push(node);
    }
    pages += 1;

    if (!pageInfo.hasNextPage) break;
    const nextCursor = pageInfo.endCursor;
    if (typeof nextCursor !== "string" || nextCursor.length === 0) {
      throw projectError("PROJECT_EXPORT_CURSOR_MISSING");
    }
    if (seenCursors.has(nextCursor)) {
      throw projectError("PROJECT_EXPORT_CURSOR_REPEATED");
    }
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  if (nodes.length !== reportedTotalCount) {
    throw projectError("PROJECT_EXPORT_COUNT_MISMATCH");
  }
  return Object.freeze({ nodes, pages, reportedTotalCount });
}

function normalizeObservedField(rawField) {
  const field = requireObject(rawField);
  const fieldId = safeOpaqueId(field.id);
  const name = safeContractText(field.name, "PROJECT_EXPORT_RESPONSE_INVALID");
  const dataType = safeDataType(field.dataType);
  const typename = safeContractText(field.__typename, "PROJECT_EXPORT_RESPONSE_INVALID");
  if (
    (dataType === "SINGLE_SELECT" && typename !== "ProjectV2SingleSelectField")
    || (dataType !== "SINGLE_SELECT" && typename === "ProjectV2SingleSelectField")
  ) {
    throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
  }
  return Object.freeze({ fieldId, name, dataType, typename });
}

function resolveManagedFields(allFields, contract) {
  const observedFields = allFields.map(normalizeObservedField);
  return Object.freeze(contract.managedFields.map((contractField) => {
    const matches = observedFields.filter((field) => field.name === contractField.name);
    if (matches.length === 0) {
      return Object.freeze({
        key: contractField.key,
        resolution: "missing",
        candidateCount: 0
      });
    }
    if (matches.length > 1) {
      return Object.freeze({
        key: contractField.key,
        resolution: "ambiguous",
        candidateCount: matches.length
      });
    }
    const field = matches[0];
    return Object.freeze({
      key: contractField.key,
      resolution: "matched",
      candidateCount: 1,
      name: contractField.name,
      dataType: field.dataType,
      fieldId: field.fieldId,
      expectedOptions: contractField.options
    });
  }));
}

async function buildManagedFieldManifest(graphql, managedFields) {
  const optionFields = managedFields.filter((field) => (
    field.resolution === "matched" && field.dataType === "SINGLE_SELECT"
  ));
  const fieldsById = new Map();
  if (optionFields.length > 0) {
    const data = requireObject(await graphql({
      operationName: "ProjectExportManagedFieldOptions",
      query: PROJECT_EXPORT_QUERIES.managedFieldOptions,
      variables: { fieldIds: optionFields.map((field) => field.fieldId) }
    }));
    if (!Array.isArray(data.nodes) || data.nodes.length !== optionFields.length) {
      throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
    }
    const requestedIds = new Set(optionFields.map((field) => field.fieldId));
    for (const rawField of data.nodes) {
      const field = requireObject(rawField);
      const fieldId = safeOpaqueId(field.id);
      if (!requestedIds.has(fieldId) || fieldsById.has(fieldId)) {
        throw projectError("PROJECT_EXPORT_DUPLICATE_NODE");
      }
      fieldsById.set(fieldId, field);
    }
  }

  const manifest = {};
  const optionBindings = {};
  for (const managedField of managedFields) {
    if (managedField.resolution !== "matched") {
      manifest[managedField.key] = Object.freeze({
        resolution: managedField.resolution,
        candidateCount: managedField.candidateCount
      });
      optionBindings[managedField.key] = Object.freeze([]);
      continue;
    }
    if (managedField.dataType !== "SINGLE_SELECT") {
      manifest[managedField.key] = Object.freeze({
        resolution: "matched",
        candidateCount: 1,
        name: managedField.name,
        fieldId: managedField.fieldId,
        dataType: managedField.dataType,
        options: Object.freeze([])
      });
      optionBindings[managedField.key] = Object.freeze([]);
      continue;
    }
    const liveField = fieldsById.get(managedField.fieldId);
    if (!liveField) {
      throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
    }
    if (
      liveField.__typename !== "ProjectV2SingleSelectField"
      || liveField.name !== managedField.name
      || liveField.dataType !== "SINGLE_SELECT"
      || !Array.isArray(liveField.options)
    ) {
      throw projectError("PROJECT_EXPORT_FIELD_TYPE_MISMATCH");
    }

    const expectedByName = new Map(
      managedField.expectedOptions.map((option) => [option.name, option])
    );
    const liveIds = new Set();
    const liveNames = new Set();
    const options = [];
    const bindings = [];
    for (const [index, rawOption] of liveField.options.entries()) {
      const option = requireObject(rawOption);
      const name = safeContractText(option.name, "PROJECT_EXPORT_OPTION_SET_MISMATCH");
      const optionId = safeOpaqueId(option.id, "PROJECT_EXPORT_OPTION_SET_MISMATCH");
      if (liveNames.has(name) || liveIds.has(optionId)) {
        throw projectError("PROJECT_EXPORT_OPTION_SET_MISMATCH");
      }
      liveNames.add(name);
      liveIds.add(optionId);
      bindings.push(Object.freeze({
        optionId,
        nameSha256: safeTextSha256(name)
      }));
      const expectedOption = expectedByName.get(name);
      options.push(Object.freeze(expectedOption
        ? { key: expectedOption.key, name, optionId }
        : {
            key: `observed_${index + 1}`,
            unexpected: true,
            optionId
          }));
    }

    manifest[managedField.key] = Object.freeze({
      resolution: "matched",
      candidateCount: 1,
      name: managedField.name,
      fieldId: managedField.fieldId,
      dataType: managedField.dataType,
      options: Object.freeze(options)
    });
    optionBindings[managedField.key] = Object.freeze(bindings);
  }
  return Object.freeze({
    manifest: Object.freeze(manifest),
    optionBindings: Object.freeze(optionBindings)
  });
}

function normalizeIssue(content) {
  const repository = safeRepository(content.repository?.nameWithOwner);
  const number = safeIssueNumber(content.number);
  if (!ISSUE_STATES.has(content.state)) {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  if (content.stateReason !== null && !ISSUE_STATE_REASONS.has(content.stateReason)) {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  return Object.freeze({
    kind: "issue",
    nodeId: safeOpaqueId(content.id, "PROJECT_EXPORT_ITEM_CONTENT_INVALID"),
    repository,
    number,
    url: `https://github.com/${repository}/issues/${number}`,
    state: content.state,
    stateReason: content.stateReason,
    createdAt: safeTimestamp(content.createdAt),
    updatedAt: safeTimestamp(content.updatedAt),
    closedAt: safeTimestamp(content.closedAt, { nullable: true })
  });
}

function normalizePullRequest(content) {
  const repository = safeRepository(content.repository?.nameWithOwner);
  const number = safeIssueNumber(content.number);
  if (!PULL_REQUEST_STATES.has(content.state) || typeof content.isDraft !== "boolean") {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  return Object.freeze({
    kind: "pull_request",
    nodeId: safeOpaqueId(content.id, "PROJECT_EXPORT_ITEM_CONTENT_INVALID"),
    repository,
    number,
    url: `https://github.com/${repository}/pull/${number}`,
    state: content.state,
    stateReason: null,
    isDraft: content.isDraft,
    createdAt: safeTimestamp(content.createdAt),
    updatedAt: safeTimestamp(content.updatedAt),
    closedAt: safeTimestamp(content.closedAt, { nullable: true }),
    mergedAt: safeTimestamp(content.mergedAt, { nullable: true }),
    headOid: safeSha(content.headRefOid, { nullable: true }),
    baseOid: safeSha(content.baseRefOid, { nullable: true }),
    mergeCommitOid: safeSha(content.mergeCommit?.oid ?? null, { nullable: true })
  });
}

function normalizeDraftIssue(content) {
  return Object.freeze({
    kind: "draft_issue",
    nodeId: safeOpaqueId(content.id, "PROJECT_EXPORT_ITEM_CONTENT_INVALID"),
    repository: null,
    number: null,
    url: null,
    state: null,
    stateReason: null,
    createdAt: safeTimestamp(content.createdAt),
    updatedAt: safeTimestamp(content.updatedAt),
    closedAt: null
  });
}

function unavailableContent(expectedType) {
  return Object.freeze({
    kind: "unavailable",
    expectedType,
    nodeId: null,
    repository: null,
    number: null,
    url: null,
    state: null,
    stateReason: null,
    createdAt: null,
    updatedAt: null,
    closedAt: null
  });
}

function externalRepositoryContent(expectedType) {
  return Object.freeze({
    kind: "external_repository_item",
    expectedType,
    nodeId: null,
    repository: null,
    number: null,
    url: null,
    state: null,
    stateReason: null,
    createdAt: null,
    updatedAt: null,
    closedAt: null
  });
}

function normalizeContent(item) {
  if (item.content === null || item.content === undefined) {
    return unavailableContent(item.type);
  }
  const content = requireObject(item.content, "PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  if (item.type === "ISSUE" && content.__typename === "Issue") {
    return normalizeIssue(content);
  }
  if (item.type === "PULL_REQUEST" && content.__typename === "PullRequest") {
    return normalizePullRequest(content);
  }
  if (item.type === "DRAFT_ISSUE" && content.__typename === "DraftIssue") {
    return normalizeDraftIssue(content);
  }
  throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
}

function normalizeManagedValues(item, contract, manifest, optionBindings) {
  const values = {};
  contract.managedFields.forEach((contractField, index) => {
    const rawValue = item[`managedField${index}`];
    const fieldManifest = manifest[contractField.key];
    if (
      fieldManifest.resolution !== "matched"
      || fieldManifest.dataType !== "SINGLE_SELECT"
    ) {
      values[contractField.key] = null;
      return;
    }
    if (rawValue === null || rawValue === undefined) {
      values[contractField.key] = null;
      return;
    }
    const value = requireObject(rawValue, "PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID");
    if (
      value.__typename !== "ProjectV2ItemFieldSingleSelectValue"
      || typeof value.name !== "string"
      || typeof value.optionId !== "string"
    ) {
      throw projectError("PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID");
    }
    const option = fieldManifest.options.find((entry) => entry.optionId === value.optionId);
    const binding = optionBindings[contractField.key]
      .find((entry) => entry.optionId === value.optionId);
    const observedName = safeContractText(
      value.name,
      "PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID"
    );
    const optionNameMatches = option
      && binding
      && binding.nameSha256 === safeTextSha256(observedName)
      && (!Object.hasOwn(option, "name") || option.name === observedName);
    if (!optionNameMatches) {
      throw projectError("PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID");
    }
    if (!Object.hasOwn(option, "name")) {
      values[contractField.key] = null;
      return;
    }
    values[contractField.key] = Object.freeze({
      fieldId: fieldManifest.fieldId,
      optionId: option.optionId,
      name: option.name
    });
  });
  return Object.freeze(values);
}

function normalizeItem(item, positionIndex, contract, manifest, optionBindings) {
  if (!ITEM_TYPES.has(item.type) || typeof item.isArchived !== "boolean") {
    throw projectError("PROJECT_EXPORT_ITEM_CONTENT_INVALID");
  }
  let native = normalizeContent(item);
  let scope = "unknown";
  if (native.kind === "draft_issue") {
    scope = "non_repository";
  } else if (native.repository) {
    scope = native.repository === contract.target.repository
      ? "managed_repository"
      : "external_repository";
    if (scope === "external_repository") {
      native = externalRepositoryContent(item.type);
    }
  }
  const checks = native.kind === "pull_request"
    ? Object.freeze({ state: "not_collected", headSha: native.headOid })
    : Object.freeze({ state: "not_applicable" });
  return Object.freeze({
    projectItemId: scope === "external_repository"
      ? `external_item_${positionIndex + 1}`
      : safeOpaqueId(item.id, "PROJECT_EXPORT_ITEM_CONTENT_INVALID"),
    positionIndex,
    isArchived: item.isArchived,
    projectItemType: item.type,
    projectUpdatedAt: safeTimestamp(item.updatedAt),
    scope,
    native,
    managedFields: normalizeManagedValues(item, contract, manifest, optionBindings),
    checks
  });
}

function buildSummary(items) {
  const summary = {
    projectItemCount: items.length,
    issueItemCount: 0,
    pullRequestItemCount: 0,
    draftIssueItemCount: 0,
    unavailableItemCount: 0,
    archivedItemCount: 0,
    managedRepositoryItemCount: 0,
    externalRepositoryItemCount: 0
  };
  for (const item of items) {
    if (item.projectItemType === "ISSUE") summary.issueItemCount += 1;
    else if (item.projectItemType === "PULL_REQUEST") summary.pullRequestItemCount += 1;
    else if (item.projectItemType === "DRAFT_ISSUE") summary.draftIssueItemCount += 1;
    if (item.native.kind === "unavailable") summary.unavailableItemCount += 1;
    if (item.isArchived) summary.archivedItemCount += 1;
    if (item.scope === "managed_repository") summary.managedRepositoryItemCount += 1;
    if (item.scope === "external_repository") summary.externalRepositoryItemCount += 1;
  }
  return Object.freeze(summary);
}

async function readProjection({ graphql, contract, projectId, pageSize, maxPages }) {
  const fieldsPage = await paginateConnection({
    graphql,
    operationName: "ProjectExportFields",
    query: PROJECT_EXPORT_QUERIES.fields,
    variables: { projectId },
    selectConnection: (data) => data.node?.fields,
    pageSize,
    maxPages
  });
  const resolvedFields = resolveManagedFields(fieldsPage.nodes, contract);
  const observedManifest = await buildManagedFieldManifest(graphql, resolvedFields);
  const { manifest, optionBindings } = observedManifest;
  const itemsPage = await paginateConnection({
    graphql,
    operationName: "ProjectExportItems",
    query: buildProjectItemsQuery(contract, manifest),
    variables: { projectId },
    selectConnection: (data) => data.node?.items,
    pageSize,
    maxPages
  });
  const items = Object.freeze(itemsPage.nodes.map((item, index) => (
    normalizeItem(item, index, contract, manifest, optionBindings)
  )));
  return Object.freeze({ fieldsPage, itemsPage, manifest, optionBindings, items });
}

function sameProjection(left, right) {
  return left.fieldsPage.reportedTotalCount === right.fieldsPage.reportedTotalCount
    && left.itemsPage.reportedTotalCount === right.itemsPage.reportedTotalCount
    && JSON.stringify(left.manifest) === JSON.stringify(right.manifest)
    && JSON.stringify(left.optionBindings) === JSON.stringify(right.optionBindings)
    && JSON.stringify(left.items) === JSON.stringify(right.items);
}

async function exportAttempt({ graphql, contract, pageSize, maxPages }) {
  const before = await readFence(graphql, contract.target);
  const firstProjection = await readProjection({
    graphql,
    contract,
    projectId: before.projectId,
    pageSize,
    maxPages
  });
  const verifiedProjection = await readProjection({
    graphql,
    contract,
    projectId: before.projectId,
    pageSize,
    maxPages
  });
  const after = await readFence(graphql, contract.target);

  const stable = sameFence(before, after)
    && firstProjection.fieldsPage.reportedTotalCount === before.fieldCount
    && firstProjection.itemsPage.reportedTotalCount === before.itemCount
    && verifiedProjection.fieldsPage.reportedTotalCount === before.fieldCount
    && verifiedProjection.itemsPage.reportedTotalCount === before.itemCount
    && sameProjection(firstProjection, verifiedProjection);
  if (!stable) {
    return Object.freeze({ stable: false });
  }
  return Object.freeze({
    stable: true,
    fence: after,
    ...verifiedProjection
  });
}

function safeNow(now) {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw projectError("PROJECT_EXPORT_RESPONSE_INVALID");
  }
  return value.toISOString();
}

function resolveObservationClock(graphql, now) {
  try {
    const observation = typeof graphql.getObservationClock === "function"
      ? graphql.getObservationClock()
      : null;
    if (
      isPlainObject(observation)
      && observation.source === "github_http_date"
      && observation.trusted === true
    ) {
      return Object.freeze({
        generatedAt: safeTimestamp(observation.observedAt),
        descriptor: Object.freeze({ source: "github_http_date", trusted: true })
      });
    }
  } catch {
    // An unavailable or malformed observation source falls back without a trust claim.
  }
  return Object.freeze({
    generatedAt: safeNow(now),
    descriptor: Object.freeze({ source: "local_system", trusted: false })
  });
}

export async function exportProjectV2({
  graphql,
  contract: rawContract,
  now = () => new Date(),
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  consistencyRetries = DEFAULT_CONSISTENCY_RETRIES
}) {
  if (typeof graphql !== "function") {
    throw projectError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw projectError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw projectError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
  }
  if (!Number.isSafeInteger(consistencyRetries) || consistencyRetries < 0 || consistencyRetries > 1) {
    throw projectError("PROJECT_EXPORT_ARGUMENT_INVALID", { exitCode: 2 });
  }
  const contract = normalizeProjectV2Contract(rawContract);

  let attemptResult;
  let attempts = 0;
  for (; attempts <= consistencyRetries; attempts += 1) {
    try {
      attemptResult = await exportAttempt({ graphql, contract, pageSize, maxPages });
    } catch (error) {
      if (
        attempts < consistencyRetries
        && error instanceof ProjectExportError
        && RETRYABLE_CONSISTENCY_CODES.has(error.code)
      ) {
        continue;
      }
      throw error;
    }
    if (attemptResult.stable) break;
  }
  if (!attemptResult?.stable) {
    throw projectError("PROJECT_EXPORT_CHANGED_DURING_READ", {
      exitCode: 4,
      retryable: true
    });
  }

  const summary = buildSummary(attemptResult.items);
  const unavailable = summary.unavailableItemCount;
  const observationClock = resolveObservationClock(graphql, now);
  const report = Object.freeze({
    type: PROJECT_EXPORT_TYPE,
    schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
    canonicalContractSha256: PROJECT_V2_CONTRACT_CANONICAL_SHA256,
    generatedAt: observationClock.generatedAt,
    observationClock: observationClock.descriptor,
    ok: true,
    readOnly: true,
    mutation: false,
    productionAuthority: false,
    redacted: true,
    source: Object.freeze({
      provider: "github-projects-v2",
      owner: contract.target.owner,
      projectNumber: contract.target.projectNumber,
      projectId: attemptResult.fence.projectId,
      titleMatchesContract: attemptResult.fence.projectTitle === contract.target.name,
      url: `https://github.com/orgs/${contract.target.owner}/projects/${contract.target.projectNumber}`,
      repository: contract.target.repository,
      closed: attemptResult.fence.closed
    }),
    coverage: Object.freeze({
      projectFields: "complete",
      projectItems: "complete",
      projectItemContent: unavailable > 0 ? "complete_with_unavailable" : "complete",
      nativeRepositoryInventory: "not_collected",
      checks: "not_collected",
      source: "not_collected",
      production: "not_collected"
    }),
    completeness: Object.freeze({
      complete: true,
      projectResolved: true,
      fieldManifestComplete: true,
      itemPaginationComplete: true,
      managedFieldValuesComplete: true,
      stableRead: true
    }),
    readFence: Object.freeze({
      stable: true,
      attempts: attempts + 1,
      projectionPassesPerAttempt: 2,
      projectUpdatedAt: attemptResult.fence.projectUpdatedAt,
      fieldCount: attemptResult.fence.fieldCount,
      itemCount: attemptResult.fence.itemCount
    }),
    fieldManifest: Object.freeze({ managed: attemptResult.manifest }),
    summary,
    items: attemptResult.items,
    pagination: Object.freeze({
      pageSize,
      fields: Object.freeze({
        pages: attemptResult.fieldsPage.pages,
        reportedTotalCount: attemptResult.fieldsPage.reportedTotalCount,
        exportedCount: attemptResult.fieldsPage.nodes.length
      }),
      items: Object.freeze({
        pages: attemptResult.itemsPage.pages,
        reportedTotalCount: attemptResult.itemsPage.reportedTotalCount,
        exportedCount: attemptResult.itemsPage.nodes.length,
        archivedStates: ARCHIVED_STATES
      })
    }),
    warnings: unavailable > 0
      ? Object.freeze([Object.freeze({
          code: "PROJECT_EXPORT_ITEM_CONTENT_UNAVAILABLE",
          count: unavailable
        })])
      : Object.freeze([]),
    errors: Object.freeze([])
  });
  assertRedactedOutput(report);
  return report;
}

export function buildProjectExportErrorReport(error) {
  const safeError = error instanceof ProjectExportError
    ? error
    : projectError("PROJECT_EXPORT_RESPONSE_INVALID");
  return Object.freeze({
    type: PROJECT_EXPORT_TYPE,
    schemaVersion: PROJECT_EXPORT_SCHEMA_VERSION,
    ok: false,
    readOnly: true,
    mutation: false,
    productionAuthority: false,
    redacted: true,
    coverage: Object.freeze({
      projectFields: "not_collected",
      projectItems: "not_collected",
      projectItemContent: "not_collected",
      nativeRepositoryInventory: "not_collected",
      checks: "not_collected",
      source: "not_collected",
      production: "not_collected"
    }),
    completeness: Object.freeze({
      complete: false,
      projectResolved: false,
      fieldManifestComplete: false,
      itemPaginationComplete: false,
      managedFieldValuesComplete: false,
      stableRead: false
    }),
    warnings: Object.freeze([]),
    errors: Object.freeze([Object.freeze({
      code: safeError.code,
      message: safeError.message,
      retryable: safeError.retryable
    })])
  });
}
