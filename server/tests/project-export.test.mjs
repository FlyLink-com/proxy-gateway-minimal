import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PROJECT_EXPORT_QUERIES,
  ProjectExportError,
  buildProjectItemsQuery,
  exportProjectV2,
  normalizeProjectV2Contract
} from "../services/governance/project-v2-export.mjs";
import {
  createGithubGraphqlClient,
  parsePinnedProjectV2ContractBytes,
  runProjectExportCli
} from "../../scripts/project-export.mjs";
import {
  PROJECT_V2_CONTRACT_CANONICAL_SHA256,
  computeProjectV2ContractSha256,
  verifyProjectV2ContractCanonicalBytes
} from "../services/governance/project-v2-contract.mjs";

const NOW = "2026-08-30T10:00:00.000Z";
const PROJECT_UPDATED_AT = "2026-08-30T09:59:00.000Z";
const CANONICAL_CONTRACT_BYTES = readFileSync(new URL(
  "../../project-state/project-v2-contract.json",
  import.meta.url
));
const CANONICAL_CONTRACT = JSON.parse(CANONICAL_CONTRACT_BYTES.toString("utf8"));

function projectContract(overrides = {}) {
  const contract = structuredClone(CANONICAL_CONTRACT);
  contract.managedFields[1] = {
    key: contract.managedFields[1].key,
    name: contract.managedFields[1].name,
    dataType: "SINGLE_SELECT",
    options: contract.managedFields[1].options.map((name) => ({
      key: name.replaceAll("-", "_"),
      name
    }))
  };
  return { ...contract, ...overrides };
}

function normalizedContract() {
  return normalizeProjectV2Contract(projectContract());
}

function fieldNodes(contract = normalizedContract()) {
  return contract.managedFields.map((field, index) => ({
    __typename: "ProjectV2SingleSelectField",
    id: `PVTF_${index + 1}`,
    name: field.name,
    dataType: "SINGLE_SELECT"
  }));
}

function extraFieldNodes() {
  return [
    { __typename: "ProjectV2Field", id: "PVTF_extra_1", name: "Repository", dataType: "REPOSITORY" },
    { __typename: "ProjectV2Field", id: "PVTF_extra_2", name: "Updated", dataType: "UPDATED" }
  ];
}

function optionNodes(contract = normalizedContract()) {
  return fieldNodes(contract).map((field, fieldIndex) => ({
    ...field,
    options: contract.managedFields[fieldIndex].options.map((option, optionIndex) => ({
      id: `OPT_${fieldIndex + 1}_${optionIndex + 1}`,
      name: option.name
    }))
  }));
}

function fence({
  title = "GCC WebOS — Delivery",
  closed = false,
  updatedAt = PROJECT_UPDATED_AT,
  fieldCount = 8,
  itemCount = 4
} = {}) {
  return {
    organization: {
      projectV2: {
        id: "PVT_delivery_1",
        number: 1,
        title,
        closed,
        updatedAt,
        fields: { totalCount: fieldCount },
        items: { totalCount: itemCount }
      }
    }
  };
}

function page(nodes, { totalCount = nodes.length, hasNextPage = false, endCursor = null } = {}) {
  return {
    totalCount,
    nodes,
    pageInfo: { hasNextPage, endCursor }
  };
}

function fieldValue(optionId, name) {
  return {
    __typename: "ProjectV2ItemFieldSingleSelectValue",
    optionId,
    name
  };
}

function managedValues(values = {}) {
  const contract = normalizedContract();
  return Object.fromEntries(contract.managedFields.map((field, index) => {
    const name = values[field.key];
    if (name === undefined || name === null) return [`managedField${index}`, null];
    const optionIndex = field.options.findIndex((option) => option.name === name);
    assert.notEqual(optionIndex, -1, `unknown fixture option ${field.key}:${name}`);
    return [
      `managedField${index}`,
      fieldValue(`OPT_${index + 1}_${optionIndex + 1}`, name)
    ];
  }));
}

function issueItem(overrides = {}) {
  return {
    id: "PVTI_issue_597",
    type: "ISSUE",
    isArchived: false,
    updatedAt: "2026-08-30T08:00:00.000Z",
    content: {
      __typename: "Issue",
      id: "I_597",
      number: 597,
      state: "OPEN",
      stateReason: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-30T08:00:00.000Z",
      closedAt: null,
      repository: { nameWithOwner: "gccwebos-com/proxy-gateway-minimal" },
      title: "must never be copied"
    },
    ...managedValues({
      status: "Blocked",
      lane: "portal-lifecycle",
      risk: "A",
      "source-production-state": "drift",
      "validation-state": "Blocked",
      "production-impact": "read-only"
    }),
    ...overrides
  };
}

function pullRequestItem(overrides = {}) {
  return {
    id: "PVTI_pr_678",
    type: "PULL_REQUEST",
    isArchived: false,
    updatedAt: "2026-08-29T10:00:00.000Z",
    content: {
      __typename: "PullRequest",
      id: "PR_678",
      number: 678,
      state: "MERGED",
      isDraft: false,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-29T10:00:00.000Z",
      closedAt: "2026-08-29T10:00:00.000Z",
      mergedAt: "2026-08-29T10:00:00.000Z",
      headRefOid: "7".repeat(40),
      baseRefOid: "5".repeat(40),
      mergeCommit: { oid: "e".repeat(40) },
      repository: { nameWithOwner: "gccwebos-com/proxy-gateway-minimal" },
      body: "must never be copied"
    },
    ...managedValues({ status: "Done", lane: "portal-lifecycle", risk: "B" }),
    ...overrides
  };
}

function draftItem(overrides = {}) {
  return {
    id: "PVTI_draft_1",
    type: "DRAFT_ISSUE",
    isArchived: true,
    updatedAt: "2026-08-11T00:00:00.000Z",
    content: {
      __typename: "DraftIssue",
      id: "DI_1",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      title: "private draft title",
      body: "private draft body"
    },
    ...managedValues({ status: "Backlog" }),
    ...overrides
  };
}

function redactedItem(overrides = {}) {
  return {
    id: "PVTI_redacted_1",
    type: "REDACTED",
    isArchived: false,
    updatedAt: "2026-08-12T00:00:00.000Z",
    content: null,
    ...managedValues({ status: "Todo" }),
    ...overrides
  };
}

function graphqlFixture({ fenceValues, fieldPages, itemPages, optionFields } = {}) {
  const calls = [];
  const fences = [...(fenceValues || [fence(), fence()])];
  const fields = fieldPages || [page([...fieldNodes(), ...extraFieldNodes()], { totalCount: 8 })];
  const items = itemPages || [page([
    issueItem(),
    pullRequestItem(),
    draftItem(),
    redactedItem()
  ], { totalCount: 4 })];
  let fenceIndex = 0;

  const graphql = async (request) => {
    calls.push(request);
    if (request.operationName === "ProjectExportFence") {
      const value = fences[fenceIndex];
      fenceIndex += 1;
      if (!value) throw new Error("unexpected fence read");
      return value;
    }
    if (request.operationName === "ProjectExportFields") {
      const cursor = request.variables.after;
      const index = cursor === null ? 0 : Number(String(cursor).replace("field-cursor-", ""));
      return { node: { fields: fields[index] } };
    }
    if (request.operationName === "ProjectExportManagedFieldOptions") {
      const requested = new Set(request.variables.fieldIds);
      return {
        nodes: (optionFields || optionNodes()).filter((field) => requested.has(field.id))
      };
    }
    if (request.operationName === "ProjectExportItems") {
      const cursor = request.variables.after;
      const index = cursor === null ? 0 : Number(String(cursor).replace("item-cursor-", ""));
      return { node: { items: items[index] } };
    }
    throw new Error(`unexpected operation ${request.operationName}`);
  };
  return { graphql, calls };
}

test("project contract normalizer accepts string and keyed option forms", () => {
  const contract = normalizedContract();

  assert.deepEqual(contract.target, {
    owner: "gccwebos-com",
    projectNumber: 1,
    repository: "gccwebos-com/proxy-gateway-minimal",
    name: "GCC WebOS — Delivery",
    expectedClosed: false
  });
  assert.equal(contract.nativeWorkflowGraceSeconds, 900);
  assert.equal(contract.itemFieldRequirements.length, 2);
  assert.equal(contract.views.length, 4);
  assert.equal(contract.nativeWorkflows.length, 6);
  assert.equal(contract.managedFields.length, 6);
  assert.deepEqual(contract.managedFields[0].options[2], {
    key: "in_progress",
    name: "In Progress"
  });
  assert.deepEqual(contract.managedFields[1].options[0], {
    key: "traffic_accounting",
    name: "traffic-accounting"
  });
  assert.ok(contract.managedFields.every((field) => field.dataType === "SINGLE_SELECT"));
});

test("project contract normalizer fails closed on write authority and ambiguous fields", () => {
  assert.throws(
    () => normalizeProjectV2Contract(projectContract({
      authority: {
        projectProjectionOnly: true,
        productionAuthority: false,
        writebackEnabled: true
      }
    })),
    (error) => error instanceof ProjectExportError
      && error.code === "PROJECT_EXPORT_CONTRACT_AUTHORITY_INVALID"
  );

  const duplicate = projectContract();
  duplicate.managedFields = [
    ...duplicate.managedFields,
    { key: "status-copy", name: "Status", type: "single-select", options: ["Todo"] }
  ];
  assert.throws(
    () => normalizeProjectV2Contract(duplicate),
    (error) => error.code === "PROJECT_EXPORT_MANAGED_FIELD_AMBIGUOUS"
  );
});

test("project contract canonical bytes accept CRLF normalization and reject semantic tampering", () => {
  assert.equal(
    computeProjectV2ContractSha256(CANONICAL_CONTRACT_BYTES),
    PROJECT_V2_CONTRACT_CANONICAL_SHA256
  );
  assert.equal(verifyProjectV2ContractCanonicalBytes(CANONICAL_CONTRACT_BYTES), true);

  const crlfBytes = Buffer.from(
    CANONICAL_CONTRACT_BYTES.toString("utf8").replaceAll("\n", "\r\n"),
    "utf8"
  );
  assert.equal(verifyProjectV2ContractCanonicalBytes(crlfBytes), true);
  assert.equal(parsePinnedProjectV2ContractBytes(crlfBytes).target.expectedClosed, false);

  const tampered = Buffer.from(
    CANONICAL_CONTRACT_BYTES.toString("utf8").replace(
      '"expectedClosed": false',
      '"expectedClosed": true'
    ),
    "utf8"
  );
  assert.equal(verifyProjectV2ContractCanonicalBytes(tampered), false);
  assert.throws(
    () => parsePinnedProjectV2ContractBytes(tampered),
    (error) => error instanceof ProjectExportError
      && error.code === "PROJECT_EXPORT_CONTRACT_INVALID"
      && error.exitCode === 5
  );
});

test("project GraphQL reads both archived states and omits free-form or deprecated fields", () => {
  const itemQuery = buildProjectItemsQuery(normalizedContract());
  const nonFenceQueries = [
    PROJECT_EXPORT_QUERIES.fields,
    PROJECT_EXPORT_QUERIES.managedFieldOptions,
    itemQuery
  ]
    .concat(itemQuery)
    .join("\n");

  assert.match(PROJECT_EXPORT_QUERIES.fence, /projectV2[\s\S]*\btitle\b/);
  assert.match(itemQuery, /archivedStates:\s*\[ARCHIVED,\s*NOT_ARCHIVED\]/);
  assert.match(itemQuery, /fieldValueByName/);
  assert.match(itemQuery, /nodes\s*{\s*id\s*type\s*isArchived\s*updatedAt\s*content\s*{/);
  assert.doesNotMatch(nonFenceQueries, /\bfullDatabaseId\b|\bdatabaseId\b/);
  assert.doesNotMatch(nonFenceQueries, /\btitle\b|\bbody\b|\bcomments\b|\bactor\b|\bauthor\b|\bassignees\b/);
  assert.doesNotMatch(itemQuery, /ProjectV2ItemFieldTextValue|\btext\b/);
});

test("project export paginates fields and items and normalizes safe identities", async () => {
  const contract = normalizedContract();
  const allFields = fieldNodes(contract);
  const extraFields = extraFieldNodes();
  const firstItems = [issueItem(), pullRequestItem()];
  const secondItems = [draftItem(), redactedItem()];
  const fixture = graphqlFixture({
    fieldPages: [
      page(allFields.slice(0, 3), { totalCount: 8, hasNextPage: true, endCursor: "field-cursor-1" }),
      page([...allFields.slice(3), ...extraFields], { totalCount: 8 })
    ],
    itemPages: [
      page(firstItems, { totalCount: 4, hasNextPage: true, endCursor: "item-cursor-1" }),
      page(secondItems, { totalCount: 4 })
    ]
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract,
    now: () => new Date(NOW),
    pageSize: 3
  });

  assert.equal(report.type, "gccgw_project_export");
  assert.equal(report.schemaVersion, "1");
  assert.equal(report.canonicalContractSha256, PROJECT_V2_CONTRACT_CANONICAL_SHA256);
  assert.equal(report.ok, true);
  assert.equal(report.readOnly, true);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
  assert.equal(report.generatedAt, NOW);
  assert.deepEqual(report.observationClock, { source: "local_system", trusted: false });
  assert.deepEqual(report.source, {
    provider: "github-projects-v2",
    owner: "gccwebos-com",
    projectNumber: 1,
    projectId: "PVT_delivery_1",
    titleMatchesContract: true,
    url: "https://github.com/orgs/gccwebos-com/projects/1",
    repository: "gccwebos-com/proxy-gateway-minimal",
    closed: false
  });
  assert.deepEqual(report.coverage, {
    projectFields: "complete",
    projectItems: "complete",
    projectItemContent: "complete_with_unavailable",
    nativeRepositoryInventory: "not_collected",
    checks: "not_collected",
    source: "not_collected",
    production: "not_collected"
  });
  assert.deepEqual(report.completeness, {
    complete: true,
    projectResolved: true,
    fieldManifestComplete: true,
    itemPaginationComplete: true,
    managedFieldValuesComplete: true,
    stableRead: true
  });
  assert.deepEqual(report.pagination, {
    pageSize: 3,
    fields: { pages: 2, reportedTotalCount: 8, exportedCount: 8 },
    items: {
      pages: 2,
      reportedTotalCount: 4,
      exportedCount: 4,
      archivedStates: ["ARCHIVED", "NOT_ARCHIVED"]
    }
  });
  assert.equal(report.readFence.stable, true);
  assert.equal(report.readFence.attempts, 1);
  assert.equal(report.readFence.projectionPassesPerAttempt, 2);
  assert.equal(report.fieldManifest.managed.status.fieldId, "PVTF_1");
  assert.equal(report.fieldManifest.managed.status.resolution, "matched");
  assert.equal(report.fieldManifest.managed.status.candidateCount, 1);
  assert.deepEqual(report.fieldManifest.managed.status.options[3], {
    key: "blocked",
    name: "Blocked",
    optionId: "OPT_1_4"
  });

  const issue = report.items[0];
  assert.equal(issue.scope, "managed_repository");
  assert.equal(issue.native.kind, "issue");
  assert.equal(issue.native.url, "https://github.com/gccwebos-com/proxy-gateway-minimal/issues/597");
  assert.equal(issue.managedFields.status.name, "Blocked");
  assert.equal(issue.managedFields["production-impact"].name, "read-only");
  assert.deepEqual(issue.checks, { state: "not_applicable" });
  assert.equal(Object.hasOwn(issue.native, "title"), false);
  assert.equal(Object.hasOwn(issue, "projectCreatedAt"), false);

  const pullRequest = report.items[1];
  assert.equal(pullRequest.native.kind, "pull_request");
  assert.equal(pullRequest.native.url, "https://github.com/gccwebos-com/proxy-gateway-minimal/pull/678");
  assert.equal(pullRequest.native.headOid, "7".repeat(40));
  assert.deepEqual(pullRequest.checks, {
    state: "not_collected",
    headSha: "7".repeat(40)
  });
  assert.equal(Object.hasOwn(pullRequest.native, "body"), false);

  const draft = report.items[2];
  assert.equal(draft.isArchived, true);
  assert.equal(draft.scope, "non_repository");
  assert.deepEqual(draft.native, {
    kind: "draft_issue",
    nodeId: "DI_1",
    repository: null,
    number: null,
    url: null,
    state: null,
    stateReason: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    closedAt: null
  });
  assert.equal(draft.managedFields.risk, null);

  const unavailable = report.items[3];
  assert.equal(unavailable.scope, "unknown");
  assert.equal(unavailable.native.kind, "unavailable");
  assert.equal(unavailable.native.expectedType, "REDACTED");
  assert.deepEqual(report.warnings, [{
    code: "PROJECT_EXPORT_ITEM_CONTENT_UNAVAILABLE",
    count: 1
  }]);
  assert.doesNotMatch(JSON.stringify(report), /must never be copied|private draft|private draft body/);
});

test("project export marks external repository items while redacting their identity", async () => {
  const external = issueItem({
    id: "PVTI_external",
    content: {
      ...issueItem().content,
      id: "NODE_private_external",
      number: 4,
      repository: { nameWithOwner: "another-org/another-repo" }
    }
  });
  const fixture = graphqlFixture({
    fenceValues: [fence({ itemCount: 1 }), fence({ itemCount: 1 })],
    itemPages: [page([external], { totalCount: 1 })]
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.items[0].scope, "external_repository");
  assert.deepEqual(report.items[0].native, {
    kind: "external_repository_item",
    expectedType: "ISSUE",
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
  assert.deepEqual(report.items[0].checks, { state: "not_applicable" });
  assert.equal(report.items[0].projectItemId, "external_item_1");
  assert.equal(report.summary.externalRepositoryItemCount, 1);
  assert.equal(report.summary.issueItemCount, 1);
  assert.doesNotMatch(
    JSON.stringify(report),
    /another-org|another-repo|NODE_private_external|PVTI_external/u
  );

  const externalPullRequest = pullRequestItem({
    id: "PVTI_external_pr",
    content: {
      ...pullRequestItem().content,
      id: "PR_external_private",
      number: 91,
      headRefOid: "c".repeat(40),
      baseRefOid: "d".repeat(40),
      mergeCommit: { oid: "f".repeat(40) },
      repository: { nameWithOwner: "private-org/private-repository" }
    }
  });
  const pullRequestFixture = graphqlFixture({
    fenceValues: [fence({ itemCount: 1 }), fence({ itemCount: 1 })],
    itemPages: [page([externalPullRequest], { totalCount: 1 })]
  });
  const pullRequestReport = await exportProjectV2({
    graphql: pullRequestFixture.graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });
  assert.equal(pullRequestReport.items[0].native.kind, "external_repository_item");
  assert.equal(pullRequestReport.items[0].native.expectedType, "PULL_REQUEST");
  assert.equal(pullRequestReport.items[0].projectItemId, "external_item_1");
  assert.equal(pullRequestReport.summary.pullRequestItemCount, 1);
  assert.doesNotMatch(
    JSON.stringify(pullRequestReport),
    /private-org|private-repository|PR_external_private|PVTI_external_pr|c{40}|d{40}|f{40}/u
  );
});

test("project export counts unavailable Issue and PR content without claiming full content coverage", async () => {
  const items = [
    issueItem({ id: "PVTI_unavailable_issue", content: null }),
    pullRequestItem({ id: "PVTI_unavailable_pr", content: null })
  ];
  const fixture = graphqlFixture({
    fenceValues: [fence({ itemCount: 2 }), fence({ itemCount: 2 })],
    itemPages: [page(items, { totalCount: 2 })]
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.coverage.projectItemContent, "complete_with_unavailable");
  assert.equal(report.summary.unavailableItemCount, 2);
  assert.deepEqual(report.items.map((item) => item.native), [
    {
      kind: "unavailable",
      expectedType: "ISSUE",
      nodeId: null,
      repository: null,
      number: null,
      url: null,
      state: null,
      stateReason: null,
      createdAt: null,
      updatedAt: null,
      closedAt: null
    },
    {
      kind: "unavailable",
      expectedType: "PULL_REQUEST",
      nodeId: null,
      repository: null,
      number: null,
      url: null,
      state: null,
      stateReason: null,
      createdAt: null,
      updatedAt: null,
      closedAt: null
    }
  ]);
  assert.deepEqual(report.warnings, [{
    code: "PROJECT_EXPORT_ITEM_CONTENT_UNAVAILABLE",
    count: 2
  }]);
});

test("project export retries the whole read once when the fence changes", async () => {
  const fixture = graphqlFixture({
    fenceValues: [
      fence({ updatedAt: "2026-08-30T09:00:00.000Z" }),
      fence({ updatedAt: "2026-08-30T09:01:00.000Z" }),
      fence({ updatedAt: "2026-08-30T09:01:00.000Z" }),
      fence({ updatedAt: "2026-08-30T09:01:00.000Z" })
    ]
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.readFence.attempts, 2);
  assert.equal(report.readFence.projectUpdatedAt, "2026-08-30T09:01:00.000Z");
  assert.equal(fixture.calls.filter((call) => call.operationName === "ProjectExportItems").length, 4);
});

test("project export fences a rename and reports live title and closed state without inferring alignment", async () => {
  const renamed = "GCC WebOS — Delivery Renamed";
  const fixture = graphqlFixture({
    fenceValues: [
      fence(),
      fence({ title: renamed, closed: true }),
      fence({ title: renamed, closed: true }),
      fence({ title: renamed, closed: true })
    ]
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.readFence.attempts, 2);
  assert.equal(report.source.titleMatchesContract, false);
  assert.equal(report.source.closed, true);
  assert.doesNotMatch(JSON.stringify(report), /Delivery Renamed/u);
});

test("project export retries when equal parent fences contain unequal bounded projections", async () => {
  const fixture = graphqlFixture({
    fenceValues: [
      fence({ itemCount: 1 }),
      fence({ itemCount: 1 }),
      fence({ itemCount: 1 }),
      fence({ itemCount: 1 })
    ]
  });
  const original = issueItem();
  const changed = issueItem({ managedField0: fieldValue("OPT_1_2", "Todo") });
  let itemReads = 0;
  const graphql = async (request) => {
    if (request.operationName === "ProjectExportItems") {
      itemReads += 1;
      const item = itemReads === 1 ? original : changed;
      return { node: { items: page([item], { totalCount: 1 }) } };
    }
    return fixture.graphql(request);
  };

  const report = await exportProjectV2({
    graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.readFence.attempts, 2);
  assert.equal(itemReads, 4);
  assert.equal(report.items[0].managedFields.status.name, "Todo");
});

test("project export retries a transient pagination count mismatch from a fresh fence", async () => {
  const fixture = graphqlFixture({
    fenceValues: [fence(), fence(), fence()]
  });
  const fields = [...fieldNodes(), ...extraFieldNodes()];
  let fieldReads = 0;
  const graphql = async (request) => {
    if (request.operationName === "ProjectExportFields") {
      fieldReads += 1;
      return {
        node: {
          fields: page(fields, { totalCount: fieldReads === 1 ? 9 : 8 })
        }
      };
    }
    return fixture.graphql(request);
  };

  const report = await exportProjectV2({
    graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.readFence.attempts, 2);
  assert.equal(fieldReads, 3);
});

test("project export fails atomically when both read attempts change", async () => {
  const fixture = graphqlFixture({
    fenceValues: [
      fence({ updatedAt: "2026-08-30T09:00:00.000Z" }),
      fence({ updatedAt: "2026-08-30T09:01:00.000Z" }),
      fence({ updatedAt: "2026-08-30T09:02:00.000Z" }),
      fence({ updatedAt: "2026-08-30T09:03:00.000Z" })
    ]
  });

  await assert.rejects(
    exportProjectV2({
      graphql: fixture.graphql,
      contract: normalizedContract(),
      now: () => new Date(NOW)
    }),
    (error) => error instanceof ProjectExportError
      && error.code === "PROJECT_EXPORT_CHANGED_DURING_READ"
      && error.exitCode === 4
      && error.retryable === true
  );
});

test("project export rejects cursor loops and incomplete page counts", async () => {
  const loopFixture = graphqlFixture({
    fieldPages: [
      page(fieldNodes().slice(0, 2), {
        totalCount: 8,
        hasNextPage: true,
        endCursor: "field-cursor-0"
      })
    ]
  });
  await assert.rejects(
    exportProjectV2({ graphql: loopFixture.graphql, contract: normalizedContract() }),
    (error) => error.code === "PROJECT_EXPORT_CURSOR_REPEATED"
  );

  const countFixture = graphqlFixture({
    fieldPages: [page(fieldNodes(), { totalCount: 9 })]
  });
  await assert.rejects(
    exportProjectV2({ graphql: countFixture.graphql, contract: normalizedContract() }),
    (error) => error.code === "PROJECT_EXPORT_COUNT_MISMATCH"
  );
});

test("project export preserves stable missing and ambiguous field observations", async () => {
  const missingFixture = graphqlFixture({
    fieldPages: [page(fieldNodes().slice(1), { totalCount: 5 })],
    fenceValues: [fence({ fieldCount: 5 }), fence({ fieldCount: 5 })]
  });
  const missingReport = await exportProjectV2({
    graphql: missingFixture.graphql,
    contract: normalizedContract()
  });
  assert.deepEqual(missingReport.fieldManifest.managed.status, {
    resolution: "missing",
    candidateCount: 0
  });
  assert.equal(missingReport.items[0].managedFields.status, null);
  assert.equal(missingReport.completeness.complete, true);

  const duplicateStatus = {
    ...fieldNodes()[0],
    id: "PVTF_status_duplicate"
  };
  const ambiguousFields = [...fieldNodes(), ...extraFieldNodes(), duplicateStatus];
  const ambiguousFixture = graphqlFixture({
    fieldPages: [page(ambiguousFields, { totalCount: ambiguousFields.length })],
    fenceValues: [
      fence({ fieldCount: ambiguousFields.length }),
      fence({ fieldCount: ambiguousFields.length })
    ]
  });
  const ambiguousReport = await exportProjectV2({
    graphql: ambiguousFixture.graphql,
    contract: normalizedContract()
  });
  assert.deepEqual(ambiguousReport.fieldManifest.managed.status, {
    resolution: "ambiguous",
    candidateCount: 2
  });
  assert.equal(ambiguousReport.items[0].managedFields.status, null);
  assert.equal(
    ambiguousFixture.calls
      .find((call) => call.operationName === "ProjectExportItems")
      .query.includes("managedField0:"),
    false
  );
});

test("project export preserves stable managed field type and option drift", async () => {
  const wrongTypeFields = fieldNodes();
  wrongTypeFields[0] = {
    ...wrongTypeFields[0],
    __typename: "ProjectV2Field",
    dataType: "TEXT"
  };
  const typeFixture = graphqlFixture({
    fieldPages: [page(wrongTypeFields, { totalCount: wrongTypeFields.length })],
    fenceValues: [
      fence({ fieldCount: wrongTypeFields.length }),
      fence({ fieldCount: wrongTypeFields.length })
    ]
  });
  const typeReport = await exportProjectV2({
    graphql: typeFixture.graphql,
    contract: normalizedContract()
  });
  assert.deepEqual(typeReport.fieldManifest.managed.status, {
    resolution: "matched",
    candidateCount: 1,
    name: "Status",
    fieldId: "PVTF_1",
    dataType: "TEXT",
    options: []
  });
  assert.equal(typeReport.items[0].managedFields.status, null);
  assert.equal(
    typeFixture.calls
      .find((call) => call.operationName === "ProjectExportItems")
      .query.includes("managedField0:"),
    false
  );

  const driftedOptions = optionNodes();
  driftedOptions[0] = {
    ...driftedOptions[0],
    options: driftedOptions[0].options.filter((option) => option.name !== "Blocked")
  };
  const optionFixture = graphqlFixture({
    optionFields: driftedOptions,
    itemPages: [page([], { totalCount: 0 })],
    fenceValues: [fence({ itemCount: 0 }), fence({ itemCount: 0 })]
  });
  const optionReport = await exportProjectV2({
    graphql: optionFixture.graphql,
    contract: normalizedContract()
  });
  assert.deepEqual(
    optionReport.fieldManifest.managed.status.options.map((option) => option.name),
    ["Backlog", "Todo", "In Progress", "Done"]
  );

  const reorderedOptions = optionNodes();
  reorderedOptions[0] = {
    ...reorderedOptions[0],
    options: [reorderedOptions[0].options[1], reorderedOptions[0].options[0], ...reorderedOptions[0].options.slice(2)]
  };
  const reorderedFixture = graphqlFixture({ optionFields: reorderedOptions });
  const reorderedReport = await exportProjectV2(
    { graphql: reorderedFixture.graphql, contract: normalizedContract() }
  );
  assert.deepEqual(
    reorderedReport.fieldManifest.managed.status.options.map((option) => option.name),
    ["Todo", "Backlog", "In Progress", "Blocked", "Done"]
  );

  const unexpectedName = "Private-Customer-Alpha";
  const optionsWithUnexpected = optionNodes();
  optionsWithUnexpected[0] = {
    ...optionsWithUnexpected[0],
    options: [
      ...optionsWithUnexpected[0].options,
      { id: "OPT_private_1", name: unexpectedName }
    ]
  };
  const privacyFixture = graphqlFixture({
    optionFields: optionsWithUnexpected,
    itemPages: [page([], { totalCount: 0 })],
    fenceValues: [fence({ itemCount: 0 }), fence({ itemCount: 0 })]
  });
  const privacyReport = await exportProjectV2({
    graphql: privacyFixture.graphql,
    contract: normalizedContract()
  });
  const unexpected = privacyReport.fieldManifest.managed.status.options.at(-1);
  assert.deepEqual(Object.keys(unexpected).sort(), ["key", "optionId", "unexpected"]);
  assert.equal(unexpected.key, "observed_6");
  assert.equal(unexpected.unexpected, true);
  assert.equal(unexpected.optionId, "OPT_private_1");
  assert.doesNotMatch(JSON.stringify(privacyReport), /Private-Customer-Alpha/u);

  const selectedUnexpected = issueItem({
    managedField0: fieldValue("OPT_private_1", unexpectedName)
  });
  const selectedFixture = graphqlFixture({
    optionFields: optionsWithUnexpected,
    itemPages: [page([selectedUnexpected], { totalCount: 1 })],
    fenceValues: [fence({ itemCount: 1 }), fence({ itemCount: 1 })]
  });
  const selectedReport = await exportProjectV2({
    graphql: selectedFixture.graphql,
    contract: normalizedContract()
  });
  assert.equal(selectedReport.items[0].managedFields.status, null);
  assert.doesNotMatch(JSON.stringify(selectedReport), /Private-Customer-Alpha/u);
});

test("project export fences changes hidden behind unexpected option redaction", async () => {
  const privateOptions = (name) => {
    const fields = optionNodes();
    fields[0] = {
      ...fields[0],
      options: [...fields[0].options, { id: "OPT_private_stable", name }]
    };
    return fields;
  };
  const fixture = graphqlFixture({
    itemPages: [page([], { totalCount: 0 })],
    fenceValues: [
      fence({ itemCount: 0 }),
      fence({ itemCount: 0 }),
      fence({ itemCount: 0 }),
      fence({ itemCount: 0 })
    ]
  });
  let optionRead = 0;
  const graphql = async (request) => {
    if (request.operationName === "ProjectExportManagedFieldOptions") {
      optionRead += 1;
      const requested = new Set(request.variables.fieldIds);
      const name = optionRead === 1 ? "Private-Alpha" : "Private-Beta";
      return {
        nodes: privateOptions(name).filter((field) => requested.has(field.id))
      };
    }
    return fixture.graphql(request);
  };

  const report = await exportProjectV2({ graphql, contract: normalizedContract() });
  assert.equal(report.readFence.attempts, 2);
  assert.equal(optionRead, 4);
  assert.doesNotMatch(JSON.stringify(report), /Private-Alpha|Private-Beta/u);
});

test("project export rejects managed item values unknown to the live manifest", async () => {
  const invalid = issueItem({
    managedField0: fieldValue("OPT_unknown", "Blocked")
  });
  const fixture = graphqlFixture({
    fenceValues: [fence({ itemCount: 1 }), fence({ itemCount: 1 })],
    itemPages: [page([invalid], { totalCount: 1 })]
  });

  await assert.rejects(
    exportProjectV2({ graphql: fixture.graphql, contract: normalizedContract() }),
    (error) => error.code === "PROJECT_EXPORT_ITEM_FIELD_VALUE_INVALID"
  );
});

test("project export canonicalizes GitHub timestamps to RFC3339 milliseconds", async () => {
  const item = issueItem({
    updatedAt: "2026-08-30T08:00:00.123456789Z",
    content: {
      ...issueItem().content,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-30T08:00:00.123456789Z"
    }
  });
  const fixture = graphqlFixture({
    fenceValues: [
      fence({ updatedAt: "2026-08-30T09:59:00Z", itemCount: 1 }),
      fence({ updatedAt: "2026-08-30T09:59:00Z", itemCount: 1 })
    ],
    itemPages: [page([item], { totalCount: 1 })]
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract: normalizedContract(),
    now: () => new Date(NOW)
  });

  assert.equal(report.readFence.projectUpdatedAt, "2026-08-30T09:59:00.000Z");
  assert.equal(report.items[0].projectUpdatedAt, "2026-08-30T08:00:00.123Z");
  assert.equal(report.items[0].native.createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(report.items[0].native.updatedAt, "2026-08-30T08:00:00.123Z");
});

test("project export uses an explicit trusted GitHub observation clock when available", async () => {
  const fixture = graphqlFixture();
  Object.defineProperty(fixture.graphql, "getObservationClock", {
    value: () => ({
      source: "github_http_date",
      trusted: true,
      observedAt: "2026-08-30T10:01:02Z"
    })
  });

  const report = await exportProjectV2({
    graphql: fixture.graphql,
    contract: normalizedContract(),
    now: () => new Date("2030-01-01T00:00:00.000Z")
  });

  assert.equal(report.generatedAt, "2026-08-30T10:01:02.000Z");
  assert.deepEqual(report.observationClock, {
    source: "github_http_date",
    trusted: true
  });
});

test("project export rejects secret-shaped opaque identifiers before serialization", async () => {
  const unsafeFence = fence();
  unsafeFence.organization.projectV2.id = `github_pat_${"x".repeat(32)}`;
  const fixture = graphqlFixture({ fenceValues: [unsafeFence] });

  await assert.rejects(
    exportProjectV2({ graphql: fixture.graphql, contract: normalizedContract() }),
    (error) => error.code === "PROJECT_EXPORT_REDACTION_FAILED"
      && error.exitCode === 6
  );
});

test("GitHub GraphQL client keeps the token in the header and sanitizes remote errors", async () => {
  const token = `github_pat_${"x".repeat(32)}`;
  let request;
  const graphql = createGithubGraphqlClient({
    token,
    endpoint: "https://attacker.invalid/graphql",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        errors: [{
          message: `remote echoed ${token}`,
          extensions: { type: "FORBIDDEN" }
        }]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await assert.rejects(
    graphql({ operationName: "SafeOperation", query: "query SafeOperation { viewer { id } }", variables: {} }),
    (error) => error.code === "PROJECT_EXPORT_AUTHORIZATION_FAILED"
      && !String(error.message).includes(token)
  );

  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://api.github.com/graphql");
  assert.equal(request.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(JSON.stringify(body).includes(token), false);
});

test("GitHub GraphQL client classifies secondary limits and body-read failures as retryable", async () => {
  const token = `github_pat_${"x".repeat(32)}`;
  const secondaryLimitClient = createGithubGraphqlClient({
    token,
    fetchImpl: async () => new Response("{}", {
      status: 403,
      headers: { "retry-after": "60", "x-ratelimit-remaining": "100" }
    })
  });
  await assert.rejects(
    secondaryLimitClient({ operationName: "Safe", query: "query Safe { viewer { id } }", variables: {} }),
    (error) => error.code === "PROJECT_EXPORT_RATE_LIMITED"
      && error.exitCode === 4
      && error.retryable === true
  );

  const headerlessSecondaryLimitClient = createGithubGraphqlClient({
    token,
    fetchImpl: async () => new Response("{}", { status: 403 })
  });
  await assert.rejects(
    headerlessSecondaryLimitClient({
      operationName: "Safe",
      query: "query Safe { viewer { id } }",
      variables: {}
    }),
    (error) => error.code === "PROJECT_EXPORT_RATE_LIMITED"
      && error.exitCode === 4
      && error.retryable === true
  );

  const interruptedBodyClient = createGithubGraphqlClient({
    token,
    fetchImpl: async () => ({
      ok: true,
      text: async () => { throw new Error(`socket echoed ${token}`); }
    })
  });
  await assert.rejects(
    interruptedBodyClient({ operationName: "Safe", query: "query Safe { viewer { id } }", variables: {} }),
    (error) => error.code === "PROJECT_EXPORT_API_UNAVAILABLE"
      && error.exitCode === 4
      && error.retryable === true
      && !error.message.includes(token)
  );
});

test("GitHub GraphQL client rejects a malformed errors envelope even when data exists", async () => {
  const graphql = createGithubGraphqlClient({
    token: `github_pat_${"x".repeat(32)}`,
    fetchImpl: async () => new Response(JSON.stringify({
      data: { viewer: { id: "VIEWER_1" } },
      errors: { message: "malformed" }
    }), { status: 200 })
  });

  await assert.rejects(
    graphql({ operationName: "Safe", query: "query Safe { viewer { id } }", variables: {} }),
    (error) => error.code === "PROJECT_EXPORT_RESPONSE_INVALID"
      && error.exitCode === 5
  );
});

test("GitHub GraphQL client captures only the last successful valid HTTP Date", async () => {
  let calls = 0;
  const graphql = createGithubGraphqlClient({
    token: `github_pat_${"x".repeat(32)}`,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: { viewer: { id: "VIEWER_1" } } }), {
        status: 200,
        headers: calls === 1 ? { date: "Sun, 30 Aug 2026 10:01:02 GMT" } : {}
      });
    }
  });
  const request = {
    operationName: "Safe",
    query: "query Safe { viewer { id } }",
    variables: {}
  };

  await graphql(request);
  assert.deepEqual(graphql.getObservationClock(), {
    source: "github_http_date",
    trusted: true,
    observedAt: "2026-08-30T10:01:02.000Z"
  });
  await graphql(request);
  assert.equal(graphql.getObservationClock(), null);
});

test("project export CLI accepts only --json and emits one JSON error envelope", async () => {
  const outputs = [];
  const missingJsonCode = await runProjectExportCli([], {
    env: { GH_TOKEN: `github_pat_${"x".repeat(32)}` },
    writeStdout: (value) => outputs.push(value),
    readContract: async () => projectContract()
  });
  assert.equal(missingJsonCode, 2);
  assert.equal(JSON.parse(outputs.pop()).errors[0].code, "PROJECT_EXPORT_JSON_REQUIRED");

  const tokenArgCode = await runProjectExportCli(["--json", "--token", "unsafe"], {
    env: { GH_TOKEN: `github_pat_${"x".repeat(32)}` },
    writeStdout: (value) => outputs.push(value),
    readContract: async () => projectContract()
  });
  assert.equal(tokenArgCode, 2);
  assert.equal(JSON.parse(outputs.pop()).errors[0].code, "PROJECT_EXPORT_ARGUMENT_INVALID");

  const tokenCode = await runProjectExportCli(["--json"], {
    env: {},
    writeStdout: (value) => outputs.push(value),
    readContract: async () => projectContract()
  });
  assert.equal(tokenCode, 3);
  assert.equal(JSON.parse(outputs.pop()).errors[0].code, "PROJECT_EXPORT_TOKEN_MISSING");
});

test("project export CLI prints a complete report without exposing its token", async () => {
  const token = `github_pat_${"z".repeat(32)}`;
  const outputs = [];
  const fixture = graphqlFixture();
  const exitCode = await runProjectExportCli(["--json"], {
    env: { GH_TOKEN: token },
    writeStdout: (value) => outputs.push(value),
    readContract: async () => projectContract(),
    graphql: fixture.graphql,
    now: () => new Date(NOW)
  });

  assert.equal(exitCode, 0);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].includes(token), false);
  const report = JSON.parse(outputs[0]);
  assert.equal(report.ok, true);
  assert.equal(report.items.length, 4);
});
