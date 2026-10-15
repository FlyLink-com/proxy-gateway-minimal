import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildProjectDriftReport as buildUncheckedProjectDriftReport,
  projectDriftExitCode
} from "../services/governance/project-drift-report.mjs";
import { exportProjectV2 } from "../services/governance/project-v2-export.mjs";
import {
  PROJECT_V2_CONTRACT_CANONICAL_SHA256
} from "../services/governance/project-v2-contract.mjs";
import { runProjectDriftCli } from "../../scripts/project-drift.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CANONICAL_CONTRACT_BYTES = readFileSync(
  join(REPOSITORY_ROOT, "project-state/project-v2-contract.json")
);
const CANONICAL_CONTRACT = JSON.parse(CANONICAL_CONTRACT_BYTES.toString("utf8"));
const FIELD_DEFINITIONS = Object.freeze(Object.fromEntries(
  CANONICAL_CONTRACT.managedFields.map((field) => [
    field.key,
    Object.freeze({ name: field.name, options: Object.freeze([...field.options]) })
  ])
));

function contract(overrides = {}) {
  return { ...structuredClone(CANONICAL_CONTRACT), ...overrides };
}

function buildProjectDriftReport(options = {}) {
  return buildUncheckedProjectDriftReport({
    ...options,
    canonicalContractBytes: CANONICAL_CONTRACT_BYTES
  });
}

function fieldManifest(overrides = {}) {
  return Object.fromEntries(
    Object.entries(FIELD_DEFINITIONS).map(([key, definition], index) => [
      key,
      {
        resolution: "matched",
        candidateCount: 1,
        name: definition.name,
        fieldId: `FIELD_${index}`,
        dataType: "SINGLE_SELECT",
        options: definition.options.map((name, optionIndex) => ({
          key: `${key}_${optionIndex}`,
          name,
          optionId: `${key.toUpperCase()}_${optionIndex}`
        })),
        ...(overrides[key] ?? {})
      }
    ])
  );
}

function managedFields(overrides = {}) {
  const selected = {
    status: "Todo",
    lane: "portal-lifecycle",
    risk: "B",
    "source-production-state": "unknown",
    "validation-state": "Not started",
    "production-impact": "none",
    ...overrides
  };
  return Object.fromEntries(
    Object.entries(selected).map(([key, name]) => [
      key,
      name === null
        ? null
        : {
            fieldId: `FIELD_${Object.keys(FIELD_DEFINITIONS).indexOf(key)}`,
            optionId: `${key.toUpperCase()}_${FIELD_DEFINITIONS[key].options.indexOf(name)}`,
            name
          }
    ])
  );
}

function issueItem(number, overrides = {}) {
  return {
    projectItemId: `ITEM_ISSUE_${number}`,
    positionIndex: number,
    isArchived: false,
    projectItemType: "ISSUE",
    projectCreatedAt: "2026-08-01T00:00:00.000Z",
    projectUpdatedAt: "2026-08-01T00:00:00.000Z",
    scope: "managed_repository",
    native: {
      kind: "issue",
      nodeId: `ISSUE_${number}`,
      repository: "gccwebos-com/proxy-gateway-minimal",
      number,
      url: `https://github.com/gccwebos-com/proxy-gateway-minimal/issues/${number}`,
      state: "OPEN",
      stateReason: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      closedAt: null
    },
    managedFields: managedFields(),
    checks: { state: "not_applicable" },
    ...overrides
  };
}

function pullRequestItem(number, overrides = {}) {
  return {
    projectItemId: `ITEM_PR_${number}`,
    positionIndex: number,
    isArchived: false,
    projectItemType: "PULL_REQUEST",
    projectCreatedAt: "2026-08-01T00:00:00.000Z",
    projectUpdatedAt: "2026-08-01T00:00:00.000Z",
    scope: "managed_repository",
    native: {
      kind: "pull_request",
      nodeId: `PR_${number}`,
      repository: "gccwebos-com/proxy-gateway-minimal",
      number,
      url: `https://github.com/gccwebos-com/proxy-gateway-minimal/pull/${number}`,
      state: "OPEN",
      stateReason: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      closedAt: null,
      isDraft: true,
      mergedAt: null,
      headOid: "a".repeat(40),
      baseOid: "b".repeat(40),
      mergeCommitOid: null
    },
    managedFields: managedFields({ status: "In Progress", "validation-state": "Running" }),
    checks: { state: "not_collected", headSha: "a".repeat(40) },
    ...overrides
  };
}

function exportSummary(items) {
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
    if (item.native.kind === "issue") summary.issueItemCount += 1;
    else if (item.native.kind === "pull_request") summary.pullRequestItemCount += 1;
    else if (item.native.kind === "draft_issue") summary.draftIssueItemCount += 1;
    else if (item.native.kind === "unavailable") summary.unavailableItemCount += 1;
    if (item.isArchived) summary.archivedItemCount += 1;
    if (item.scope === "managed_repository") summary.managedRepositoryItemCount += 1;
    if (item.scope === "external_repository") summary.externalRepositoryItemCount += 1;
  }
  return summary;
}

function projectExport(items = [issueItem(1)], overrides = {}) {
  const summary = exportSummary(items);
  const unavailableItemCount = summary.unavailableItemCount;
  return {
    type: "gccgw_project_export",
    schemaVersion: "1",
    canonicalContractSha256: PROJECT_V2_CONTRACT_CANONICAL_SHA256,
    ok: true,
    readOnly: true,
    mutation: false,
    productionAuthority: false,
    redacted: true,
    generatedAt: "2026-08-30T12:00:00.000Z",
    observationClock: {
      source: "github_http_date",
      trusted: true
    },
    source: {
      provider: "github-projects-v2",
      owner: "gccwebos-com",
      projectNumber: 1,
      projectId: "PROJECT_1",
      titleMatchesContract: true,
      url: "https://github.com/orgs/gccwebos-com/projects/1",
      repository: "gccwebos-com/proxy-gateway-minimal",
      closed: false
    },
    coverage: {
      projectFields: "complete",
      projectItems: "complete",
      projectItemContent: unavailableItemCount > 0 ? "complete_with_unavailable" : "complete",
      nativeRepositoryInventory: "not_collected",
      checks: "not_collected",
      source: "not_collected",
      production: "not_collected"
    },
    completeness: {
      complete: true,
      projectResolved: true,
      fieldManifestComplete: true,
      itemPaginationComplete: true,
      managedFieldValuesComplete: true,
      stableRead: true
    },
    readFence: {
      stable: true,
      attempts: 1,
      projectionPassesPerAttempt: 2,
      projectUpdatedAt: "2026-08-30T11:59:00.000Z",
      fieldCount: 6,
      itemCount: items.length
    },
    fieldManifest: { managed: fieldManifest() },
    summary,
    items,
    pagination: {
      pageSize: 100,
      fields: { pages: 1, reportedTotalCount: 6, exportedCount: 6 },
      items: {
        pages: 1,
        reportedTotalCount: items.length,
        exportedCount: items.length,
        archivedStates: ["ARCHIVED", "NOT_ARCHIVED"]
      }
    },
    warnings: unavailableItemCount > 0
      ? [{ code: "PROJECT_EXPORT_ITEM_CONTENT_UNAVAILABLE", count: unavailableItemCount }]
      : [],
    errors: [],
    ...overrides
  };
}

function findingCodes(report) {
  return report.findings.map((finding) => finding.code);
}

function producerGraphqlFixture(rawContract, {
  transformFields = (fields) => fields,
  transformOptionFields = (fields) => fields,
  transformItem = (item) => item,
  projectTitle = rawContract.target.name
} = {}) {
  const canonicalFields = rawContract.managedFields.map((field, fieldIndex) => ({
    __typename: "ProjectV2SingleSelectField",
    id: `PRODUCER_FIELD_${fieldIndex}`,
    name: field.name,
    dataType: "SINGLE_SELECT"
  }));
  const canonicalOptionFields = canonicalFields.map((field, fieldIndex) => ({
    ...field,
    options: rawContract.managedFields[fieldIndex].options.map((name, optionIndex) => ({
      id: `PRODUCER_OPTION_${fieldIndex}_${optionIndex}`,
      name
    }))
  }));
  const fields = transformFields(structuredClone(canonicalFields));
  const optionFields = transformOptionFields(structuredClone(canonicalOptionFields));
  const managedAliases = Object.fromEntries(rawContract.managedFields.map((field, index) => [
    `managedField${index}`,
    field.key === "status"
      ? {
          __typename: "ProjectV2ItemFieldSingleSelectValue",
          optionId: "PRODUCER_OPTION_0_1",
          name: "Todo"
        }
      : null
  ]));
  const pullRequest = transformItem({
    id: "PRODUCER_ITEM_PR_90",
    type: "PULL_REQUEST",
    isArchived: false,
    updatedAt: "2026-08-30T11:30:00.000Z",
    content: {
      __typename: "PullRequest",
      id: "PRODUCER_PR_90",
      number: 90,
      state: "OPEN",
      isDraft: false,
      createdAt: "2026-08-30T11:00:00.000Z",
      updatedAt: "2026-08-30T11:30:00.000Z",
      closedAt: null,
      mergedAt: null,
      headRefOid: "a".repeat(40),
      baseRefOid: "b".repeat(40),
      mergeCommit: null,
      repository: { nameWithOwner: rawContract.target.repository }
    },
    ...managedAliases
  });
  const connection = (nodes) => ({
    totalCount: nodes.length,
    nodes,
    pageInfo: { hasNextPage: false, endCursor: null }
  });
  return async ({ operationName, variables }) => {
    if (operationName === "ProjectExportFence") {
      return {
        organization: {
          projectV2: {
            id: "PRODUCER_PROJECT_1",
            number: 1,
            title: projectTitle,
            closed: false,
            updatedAt: "2026-08-30T11:59:00.000Z",
            fields: { totalCount: fields.length },
            items: { totalCount: 1 }
          }
        }
      };
    }
    if (operationName === "ProjectExportFields") {
      return { node: { fields: connection(fields) } };
    }
    if (operationName === "ProjectExportManagedFieldOptions") {
      return {
        nodes: optionFields.filter((field) => variables.fieldIds.includes(field.id))
      };
    }
    if (operationName === "ProjectExportItems") {
      return { node: { items: connection([pullRequest]) } };
    }
    throw new Error("unexpected producer operation");
  };
}

test("drift report is a redacted read-only clean-in-scope projection", () => {
  const report = buildProjectDriftReport({
    projectExport: projectExport(),
    contract: contract()
  });

  assert.equal(report.type, "gccgw_project_drift_report");
  assert.equal(report.schemaVersion, "1");
  assert.equal(report.readOnly, true);
  assert.equal(report.mutation, false);
  assert.equal(report.productionAuthority, false);
  assert.equal(report.redacted, true);
  assert.equal(report.outcome, "clean_in_evaluated_scope");
  assert.deepEqual(report.findings, []);
  assert.match(report.inputDigests.projectExportSha256, /^[0-9a-f]{64}$/u);
  assert.match(report.inputDigests.contractSha256, /^[0-9a-f]{64}$/u);
  assert.equal(report.coverage.nativeRepositoryInventory, "not_evaluated");
  assert.equal(report.coverage.checks, "not_evaluated");
  assert.equal(report.coverage.source, "not_evaluated");
  assert.equal(report.coverage.production, "not_evaluated");
  assert.equal(report.coverage.projectViews, "not_evaluated");
  assert.equal(report.coverage.nativeWorkflows, "not_evaluated");
  assert.equal(report.coverage.exportFreshness, "not_evaluated");
  assert.equal(projectDriftExitCode(report), 0);
});

test("drift evaluator accepts the checked-in semantic contract without hard-coded option IDs", () => {
  const canonicalContract = JSON.parse(readFileSync(
    join(REPOSITORY_ROOT, "project-state/project-v2-contract.json"),
    "utf8"
  ));
  const canonicalManifest = Object.fromEntries(canonicalContract.managedFields.map((field, index) => [
    field.key,
    {
      resolution: "matched",
      candidateCount: 1,
      name: field.name,
      fieldId: `CANONICAL_FIELD_${index}`,
      dataType: "SINGLE_SELECT",
      options: field.options.map((name, optionIndex) => ({
        key: `${field.key}_${optionIndex}`,
        name,
        optionId: `CANONICAL_OPTION_${index}_${optionIndex}`
      }))
    }
  ]));
  const report = buildProjectDriftReport({
    projectExport: projectExport([], {
      fieldManifest: { managed: canonicalManifest }
    }),
    contract: canonicalContract
  });

  assert.equal(report.outcome, "clean_in_evaluated_scope");
  assert.deepEqual(report.findings, []);
});

test("real project export output is accepted and applies PR Status-only requirements", async () => {
  const rawContract = contract();
  const liveExport = await exportProjectV2({
    graphql: producerGraphqlFixture(rawContract),
    contract: rawContract,
    now: () => new Date("2026-08-30T12:00:00.000Z")
  });
  assert.equal(liveExport.readFence.projectionPassesPerAttempt, 2);

  const report = buildProjectDriftReport({ projectExport: liveExport, contract: rawContract });
  assert.equal(
    liveExport.canonicalContractSha256,
    PROJECT_V2_CONTRACT_CANONICAL_SHA256
  );
  assert.equal(report.outcome, "clean_in_evaluated_scope");
  assert.deepEqual(report.findings, []);
});

test("real exporter unavailable Issue and PR content remains review-only", async () => {
  const rawContract = contract();

  for (const projectItemType of ["ISSUE", "PULL_REQUEST"]) {
    const liveExport = await exportProjectV2({
      graphql: producerGraphqlFixture(rawContract, {
        transformItem: (item) => ({
          ...item,
          type: projectItemType,
          content: null
        })
      }),
      contract: rawContract,
      now: () => new Date("2026-08-30T12:00:00.000Z")
    });

    assert.equal(liveExport.summary.unavailableItemCount, 1);
    assert.equal(liveExport.summary.issueItemCount, projectItemType === "ISSUE" ? 1 : 0);
    assert.equal(
      liveExport.summary.pullRequestItemCount,
      projectItemType === "PULL_REQUEST" ? 1 : 0
    );
    assert.equal(liveExport.coverage.projectItemContent, "complete_with_unavailable");
    assert.deepEqual(liveExport.warnings, [{
      code: "PROJECT_EXPORT_ITEM_CONTENT_UNAVAILABLE",
      count: 1
    }]);
    assert.deepEqual(liveExport.items[0].native, {
      kind: "unavailable",
      expectedType: projectItemType,
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

    const report = buildProjectDriftReport({ projectExport: liveExport, contract: rawContract });
    assert.equal(report.outcome, "review_required");
    assert.deepEqual(findingCodes(report), [
      "project_drift_native_content_unavailable_review"
    ]);
    assert.equal(projectDriftExitCode(report), 2);
  }
});

test("stale or missing export contract identity fails closed", async () => {
  const rawContract = contract();
  const liveExport = await exportProjectV2({
    graphql: producerGraphqlFixture(rawContract),
    contract: rawContract,
    now: () => new Date("2026-08-30T12:00:00.000Z")
  });
  const stale = structuredClone(liveExport);
  stale.canonicalContractSha256 = "0".repeat(64);
  const missing = structuredClone(liveExport);
  delete missing.canonicalContractSha256;

  for (const candidate of [stale, missing]) {
    const report = buildProjectDriftReport({ projectExport: candidate, contract: rawContract });
    assert.equal(report.outcome, "indeterminate");
    assert.deepEqual(findingCodes(report), [
      "project_drift_export_contract_digest_mismatch"
    ]);
    assert.equal(projectDriftExitCode(report), 2);
  }
});

test("real exporter evidence proves managed schema drift", async () => {
  const rawContract = contract();
  const scenarios = [
    {
      graphql: producerGraphqlFixture(rawContract, {
        transformFields: (fields) => fields.filter((field) => field.name !== "Lane"),
        transformOptionFields: (fields) => fields.filter((field) => field.name !== "Lane")
      }),
      expectedCode: "project_drift_managed_field_missing"
    },
    {
      graphql: producerGraphqlFixture(rawContract, {
        transformFields: (fields) => [
          ...fields,
          { ...fields.find((field) => field.name === "Lane"), id: "DUPLICATE_LANE" }
        ]
      }),
      expectedCode: "project_drift_managed_field_ambiguous"
    },
    {
      graphql: producerGraphqlFixture(rawContract, {
        transformFields: (fields) => fields.map((field) => field.name === "Status"
          ? { ...field, __typename: "ProjectV2Field", dataType: "TEXT" }
          : field)
      }),
      expectedCode: "project_drift_managed_field_type_mismatch"
    },
    {
      graphql: producerGraphqlFixture(rawContract, {
        transformOptionFields: (fields) => fields.map((field) => field.name === "Status"
          ? {
              ...field,
              options: [
                ...field.options,
                { id: "EXTRA_STATUS_OPTION", name: "Private-Customer-Alpha" }
              ]
            }
          : field),
        transformItem: (item) => ({
          ...item,
          managedField0: {
            __typename: "ProjectV2ItemFieldSingleSelectValue",
            optionId: "EXTRA_STATUS_OPTION",
            name: "Private-Customer-Alpha"
          }
        })
      }),
      expectedCode: "project_drift_managed_field_options_mismatch",
      forbiddenText: "Private-Customer-Alpha"
    }
  ];

  for (const scenario of scenarios) {
    const liveExport = await exportProjectV2({
      graphql: scenario.graphql,
      contract: rawContract,
      now: () => new Date("2026-08-30T12:00:00.000Z")
    });
    const report = buildProjectDriftReport({ projectExport: liveExport, contract: rawContract });
    assert.equal(report.outcome, "drift");
    assert.deepEqual(findingCodes(report), [scenario.expectedCode]);
    assert.equal(projectDriftExitCode(report), 1);
    if (scenario.forbiddenText) {
      assert.doesNotMatch(JSON.stringify(liveExport), new RegExp(scenario.forbiddenText, "u"));
      assert.doesNotMatch(JSON.stringify(report), new RegExp(scenario.forbiddenText, "u"));
    }
  }
});

test("real exporter redacts a mismatched title and external repository identity", async () => {
  const rawContract = contract();
  const liveExport = await exportProjectV2({
    graphql: producerGraphqlFixture(rawContract, {
      projectTitle: "Private-Customer-Project",
      transformItem: (item) => ({
        ...item,
        content: {
          ...item.content,
          id: "PRIVATE_PR_NODE",
          number: 991,
          headRefOid: "e".repeat(40),
          baseRefOid: "f".repeat(40),
          repository: { nameWithOwner: "private-org/customer-alpha" }
        }
      })
    }),
    contract: rawContract,
    now: () => new Date("2026-08-30T12:00:00.000Z")
  });
  const report = buildProjectDriftReport({ projectExport: liveExport, contract: rawContract });
  const encodedExport = JSON.stringify(liveExport);
  const encodedReport = JSON.stringify(report);

  assert.equal(liveExport.source.titleMatchesContract, false);
  assert.equal(liveExport.items[0].native.kind, "external_repository_item");
  assert.equal(report.outcome, "drift");
  assert.deepEqual(findingCodes(report), ["project_drift_target_configuration_mismatch"]);
  for (const sensitive of [
    "Private-Customer-Project",
    "private-org/customer-alpha",
    "PRIVATE_PR_NODE",
    "e".repeat(40),
    "f".repeat(40)
  ]) {
    assert.doesNotMatch(encodedExport, new RegExp(sensitive, "u"));
    assert.doesNotMatch(encodedReport, new RegExp(sensitive, "u"));
  }

  const tamperedExport = structuredClone(liveExport);
  tamperedExport.items[0].projectItemId = "Private-Customer-Item";
  const tamperedReport = buildProjectDriftReport({
    projectExport: tamperedExport,
    contract: rawContract
  });
  assert.equal(tamperedReport.outcome, "indeterminate");
  assert.deepEqual(findingCodes(tamperedReport), ["project_drift_input_invalid"]);
  assert.doesNotMatch(JSON.stringify(tamperedReport), /Private-Customer-Item/u);
});

test("drift consumer rejects unredacted external repository item shapes", () => {
  const externalRepository = "private-org/customer-alpha";
  const externalItem = issueItem(991, {
    scope: "external_repository",
    native: {
      ...issueItem(991).native,
      nodeId: "PRIVATE_ISSUE_NODE",
      repository: externalRepository,
      url: `https://github.com/${externalRepository}/issues/991`
    },
    managedFields: {
      ...managedFields(),
      risk: {
        ...managedFields().risk,
        fieldId: "DIFFERENT_FIELD"
      }
    }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([externalItem]),
    contract: contract()
  });
  const encoded = JSON.stringify(report);

  assert.equal(report.outcome, "indeterminate");
  assert.deepEqual(findingCodes(report), ["project_drift_input_invalid"]);
  assert.doesNotMatch(encoded, /private-org|customer-alpha|PRIVATE_ISSUE_NODE/u);
  assert.doesNotMatch(encoded, /"number":991/u);
});

test("malformed direct inputs produce deterministic indeterminate reports", () => {
  const report = buildProjectDriftReport();

  assert.equal(report.outcome, "indeterminate");
  assert.deepEqual(findingCodes(report), ["project_drift_contract_invalid"]);
  assert.equal(projectDriftExitCode(report), 2);
});

test("drift evaluation requires the checked-in canonical contract bytes", () => {
  const missingBytes = buildUncheckedProjectDriftReport({
    projectExport: projectExport(),
    contract: contract()
  });
  const changedBytes = buildUncheckedProjectDriftReport({
    projectExport: projectExport(),
    contract: contract(),
    canonicalContractBytes: Buffer.from("{}\n")
  });

  for (const report of [missingBytes, changedBytes]) {
    assert.equal(report.canonicalContract, false);
    assert.equal(report.canonicalContractSha256, null);
    assert.equal(report.outcome, "indeterminate");
    assert.deepEqual(findingCodes(report), ["project_drift_contract_not_canonical"]);
    assert.equal(projectDriftExitCode(report), 2);
  }
});

test("redacted reports reject sensitive contract text and sanitize opaque item IDs", () => {
  const sensitiveContract = contract();
  sensitiveContract.target = {
    ...sensitiveContract.target,
    owner: "attacker-owned-project",
    repository: "attacker-owned-project/plausible-repository"
  };
  sensitiveContract.managedFields[0].options.push("token=contract-secret-value-123456");
  const contractReport = buildProjectDriftReport({
    projectExport: projectExport(),
    contract: sensitiveContract
  });
  assert.equal(contractReport.outcome, "indeterminate");
  assert.doesNotMatch(JSON.stringify(contractReport), /contract-secret-value|token=/u);
  assert.deepEqual(contractReport.target, {
    owner: null,
    projectNumber: null,
    repository: null
  });
  assert.doesNotMatch(JSON.stringify(contractReport), /attacker-owned-project|plausible-repository/u);

  const sensitiveItem = issueItem(7, {
    projectItemId: "token=item-secret-value-123456",
    managedFields: managedFields({ lane: null })
  });
  const itemReport = buildProjectDriftReport({
    projectExport: projectExport([sensitiveItem]),
    contract: contract()
  });
  assert.equal(itemReport.outcome, "indeterminate");
  assert.deepEqual(findingCodes(itemReport), ["project_drift_input_invalid"]);
  assert.equal(itemReport.findings[0].subject.projectItemIdSha256, null);
  assert.doesNotMatch(JSON.stringify(itemReport), /item-secret-value|token=/u);

  const opaqueButPrivateItem = issueItem(8, {
    projectItemId: "Private-Customer-Alpha",
    managedFields: managedFields({ lane: null })
  });
  const privateItemReport = buildProjectDriftReport({
    projectExport: projectExport([opaqueButPrivateItem]),
    contract: contract()
  });
  assert.equal(privateItemReport.outcome, "drift");
  assert.match(privateItemReport.findings[0].subject.projectItemIdSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(privateItemReport), /Private-Customer-Alpha/u);
});

test("custom contract semantics fail closed and are never reflected as report text", () => {
  const customContract = contract();
  customContract.managedFields[0].name = "Private-Customer-Alpha";
  const semanticReport = buildProjectDriftReport({
    projectExport: projectExport(),
    contract: customContract
  });
  assert.equal(semanticReport.outcome, "indeterminate");
  assert.doesNotMatch(JSON.stringify(semanticReport), /Private-Customer-Alpha/u);

  const unboundedContract = contract({ nativeWorkflowGraceSeconds: Number.MAX_SAFE_INTEGER });
  const unboundedReport = buildProjectDriftReport({
    projectExport: projectExport(),
    contract: unboundedContract
  });
  assert.equal(unboundedReport.outcome, "indeterminate");
  assert.deepEqual(unboundedReport.target, {
    owner: null,
    projectNumber: null,
    repository: null
  });
});

test("malformed observed IDs, options, and managed value keys fail closed", () => {
  const strippedIds = projectExport();
  strippedIds.fieldManifest.managed.status.options = strippedIds
    .fieldManifest.managed.status.options.map(({ name }) => ({ name }));
  strippedIds.items[0].managedFields.status = {
    name: strippedIds.items[0].managedFields.status.name
  };

  const malformedOption = projectExport();
  malformedOption.fieldManifest.managed.status.options.push({
    name: "token=malformed-option-secret-123456"
  });

  const extraValueKey = projectExport();
  extraValueKey.items[0].managedFields.status.extra = "must-not-be-accepted";

  for (const candidate of [strippedIds, malformedOption, extraValueKey]) {
    const report = buildProjectDriftReport({ projectExport: candidate, contract: contract() });
    assert.equal(report.outcome, "indeterminate");
    assert.deepEqual(findingCodes(report), ["project_drift_input_invalid"]);
    assert.doesNotMatch(
      JSON.stringify(report),
      /malformed-option-secret|must-not-be-accepted|token=/u
    );
  }
});

test("source, coverage, completeness, summary, and read counts are self-consistent", () => {
  const invalidCases = [];

  const source = projectExport();
  source.source.provider = "untrusted-provider";
  invalidCases.push(source);

  const coverage = projectExport();
  coverage.coverage.checks = "complete";
  invalidCases.push(coverage);

  const completeness = projectExport();
  completeness.completeness.extra = true;
  invalidCases.push(completeness);

  const summary = projectExport();
  summary.summary.projectItemCount += 1;
  invalidCases.push(summary);

  const accounting = projectExport();
  accounting.pagination.items.reportedTotalCount += 1;
  invalidCases.push(accounting);

  const impossibleCandidates = projectExport();
  impossibleCandidates.fieldManifest.managed.lane = {
    resolution: "ambiguous",
    candidateCount: 7
  };
  invalidCases.push(impossibleCandidates);

  for (const candidate of invalidCases) {
    const report = buildProjectDriftReport({ projectExport: candidate, contract: contract() });
    assert.equal(report.outcome, "indeterminate");
    assert.deepEqual(findingCodes(report), ["project_drift_input_invalid"]);
  }
});

test("malformed normalized native content cannot produce a clean report", () => {
  const malformed = issueItem(6, {
    native: { ...issueItem(6).native, state: "UNKNOWN" }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([malformed]),
    contract: contract()
  });

  assert.equal(report.outcome, "indeterminate");
  assert.deepEqual(findingCodes(report), ["project_drift_input_invalid"]);
});

test("target mismatch and incomplete input fail closed as indeterminate", () => {
  const wrongTarget = projectExport([], {
    source: {
      ...projectExport().source,
      projectNumber: 2,
      url: "https://github.com/orgs/gccwebos-com/projects/2"
    }
  });
  const targetReport = buildProjectDriftReport({
    projectExport: wrongTarget,
    contract: contract()
  });
  assert.equal(targetReport.outcome, "indeterminate");
  assert.deepEqual(findingCodes(targetReport), ["project_drift_target_mismatch"]);
  assert.equal(projectDriftExitCode(targetReport), 2);

  const incompleteReport = buildProjectDriftReport({
    projectExport: projectExport([], {
      completeness: {
        ...projectExport().completeness,
        complete: false,
        stableRead: false
      }
    }),
    contract: contract()
  });
  assert.equal(incompleteReport.outcome, "indeterminate");
  assert.deepEqual(findingCodes(incompleteReport), ["project_drift_input_incomplete"]);
  assert.equal(projectDriftExitCode(incompleteReport), 2);
});

test("reviewed Project title and open state drift are proven without title disclosure", () => {
  const renamed = projectExport([], {
    source: {
      ...projectExport().source,
      titleMatchesContract: false
    }
  });
  const closed = projectExport([], {
    source: {
      ...projectExport().source,
      closed: true
    }
  });

  for (const candidate of [renamed, closed]) {
    const report = buildProjectDriftReport({ projectExport: candidate, contract: contract() });
    assert.equal(report.outcome, "drift");
    assert.deepEqual(findingCodes(report), ["project_drift_target_configuration_mismatch"]);
    assert.doesNotMatch(JSON.stringify(report), /Renamed Delivery Project/u);
  }
});

test("field manifest name, type, and option names are compared semantically", () => {
  const typeManifest = fieldManifest({
    status: {
      name: "Workflow Status",
      dataType: "TEXT",
      options: []
    }
  });
  const typeReport = buildProjectDriftReport({
    projectExport: projectExport([], { fieldManifest: { managed: typeManifest } }),
    contract: contract()
  });
  const optionManifest = fieldManifest({
    status: {
      options: [{ key: "todo", name: "Todo", optionId: "TODO" }]
    }
  });
  const optionReport = buildProjectDriftReport({
    projectExport: projectExport([], { fieldManifest: { managed: optionManifest } }),
    contract: contract()
  });

  assert.equal(typeReport.outcome, "drift");
  assert.deepEqual(findingCodes(typeReport), [
    "project_drift_managed_field_name_mismatch",
    "project_drift_managed_field_type_mismatch"
  ]);
  assert.equal(optionReport.outcome, "drift");
  assert.deepEqual(findingCodes(optionReport), [
    "project_drift_managed_field_options_mismatch"
  ]);
  assert.equal(projectDriftExitCode(typeReport), 1);
  assert.equal(projectDriftExitCode(optionReport), 1);
});

test("observed missing and ambiguous managed fields are proven schema drift", () => {
  const missingManifest = fieldManifest({
    lane: { resolution: "missing", candidateCount: 0 }
  });
  delete missingManifest.lane.name;
  delete missingManifest.lane.fieldId;
  delete missingManifest.lane.dataType;
  delete missingManifest.lane.options;
  const ambiguousManifest = fieldManifest({
    risk: { resolution: "ambiguous", candidateCount: 2 }
  });
  delete ambiguousManifest.risk.name;
  delete ambiguousManifest.risk.fieldId;
  delete ambiguousManifest.risk.dataType;
  delete ambiguousManifest.risk.options;

  for (const [managed, expectedCode] of [
    [missingManifest, "project_drift_managed_field_missing"],
    [ambiguousManifest, "project_drift_managed_field_ambiguous"]
  ]) {
    const candidate = projectExport([], { fieldManifest: { managed } });
    candidate.readFence.fieldCount = expectedCode.endsWith("missing") ? 5 : 7;
    candidate.pagination.fields.reportedTotalCount = candidate.readFence.fieldCount;
    candidate.pagination.fields.exportedCount = candidate.readFence.fieldCount;
    const report = buildProjectDriftReport({ projectExport: candidate, contract: contract() });
    assert.equal(report.outcome, "drift");
    assert.deepEqual(findingCodes(report), [expectedCode]);
  }
});

test("managed repository items require all six declared option values", () => {
  const item = issueItem(8, {
    managedFields: managedFields({ lane: null, risk: "Unexpected" })
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([item]),
    contract: contract()
  });
  const encoded = JSON.stringify(report);

  assert.equal(report.outcome, "indeterminate");
  assert.deepEqual(findingCodes(report), [
    "project_drift_required_item_field_missing",
    "project_drift_item_option_id_mismatch",
    "project_drift_item_option_undeclared"
  ]);
  assert.doesNotMatch(encoded, /Unexpected/u);
});

test("item field requirements keep Issues at six fields and PRs at Status only", () => {
  const issueValues = managedFields({ lane: null });
  const pullRequestValues = managedFields({
    lane: null,
    risk: null,
    "source-production-state": null,
    "validation-state": null,
    "production-impact": null
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([
      issueItem(81, { managedFields: issueValues }),
      pullRequestItem(82, { managedFields: pullRequestValues })
    ]),
    contract: contract()
  });

  assert.equal(report.outcome, "drift");
  assert.deepEqual(findingCodes(report), ["project_drift_required_item_field_missing"]);
  assert.equal(report.findings[0].subject.number, 81);
  assert.equal(report.findings[0].fieldKey, "lane");
});

test("item field and option IDs must agree with the observed export manifest", () => {
  const values = managedFields();
  values.risk = { ...values.risk, fieldId: "DIFFERENT_FIELD" };
  values.lane = { ...values.lane, optionId: "DIFFERENT_OPTION" };
  const report = buildProjectDriftReport({
    projectExport: projectExport([issueItem(9, { managedFields: values })]),
    contract: contract()
  });

  assert.equal(report.outcome, "indeterminate");
  assert.deepEqual(findingCodes(report), [
    "project_drift_item_option_id_mismatch",
    "project_drift_item_field_id_mismatch"
  ]);
  assert.ok(report.findings.every((entry) => entry.writeEligible === false));
});

test("closed issues and merged PRs become proven drift only after the grace window", () => {
  const oldClosedIssue = issueItem(10, {
    native: {
      ...issueItem(10).native,
      state: "CLOSED",
      closedAt: "2026-08-30T11:00:00.000Z"
    }
  });
  const oldMergedPr = pullRequestItem(11, {
    native: {
      ...pullRequestItem(11).native,
      state: "MERGED",
      closedAt: "2026-08-30T11:00:00.000Z",
      mergedAt: "2026-08-30T11:00:00.000Z",
      mergeCommitOid: "c".repeat(40)
    }
  });
  const exactBoundaryIssue = issueItem(12, {
    native: {
      ...issueItem(12).native,
      state: "CLOSED",
      closedAt: "2026-08-30T11:45:00.000Z"
    }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([oldMergedPr, exactBoundaryIssue, oldClosedIssue]),
    contract: contract()
  });

  assert.equal(report.outcome, "drift");
  assert.deepEqual(findingCodes(report), [
    "project_drift_native_closed_status_not_done",
    "project_drift_native_workflow_sync_pending",
    "project_drift_native_merged_status_not_done"
  ]);
  assert.deepEqual(report.findings.map((finding) => finding.subject.number), [10, 12, 11]);
  assert.equal(report.summary.provenCount, 2);
  assert.equal(report.summary.reviewCount, 1);
});

test("lifecycle grace accepts exporter timestamp precision without weakening 900/901 seconds", () => {
  const exactBoundary = issueItem(13, {
    native: {
      ...issueItem(13).native,
      state: "CLOSED",
      closedAt: "2026-08-30T11:45:00Z"
    }
  });
  const beyondBoundary = issueItem(14, {
    native: {
      ...issueItem(14).native,
      state: "CLOSED",
      closedAt: "2026-08-30T11:44:59.000000000Z"
    }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([exactBoundary, beyondBoundary], {
      generatedAt: "2026-08-30T12:00:00Z"
    }),
    contract: contract()
  });

  assert.equal(report.outcome, "drift");
  assert.deepEqual(findingCodes(report), [
    "project_drift_native_workflow_sync_pending",
    "project_drift_native_closed_status_not_done"
  ]);
  assert.equal(report.summary.reviewCount, 1);
  assert.equal(report.summary.provenCount, 1);
});

test("untrusted local observation clock cannot prove lifecycle drift", () => {
  const oldClosedIssue = issueItem(15, {
    native: {
      ...issueItem(15).native,
      state: "CLOSED",
      closedAt: "2026-08-30T11:00:00.000Z"
    }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([oldClosedIssue], {
      observationClock: { source: "local_system", trusted: false }
    }),
    contract: contract()
  });

  assert.equal(report.outcome, "review_required");
  assert.deepEqual(findingCodes(report), [
    "project_drift_lifecycle_observation_clock_untrusted"
  ]);
  assert.equal(report.summary.provenCount, 0);
  assert.equal(report.summary.reviewCount, 1);
  assert.equal(projectDriftExitCode(report), 2);
});

test("open Done is review-only while closed-unmerged PR lifecycle still projects Done", () => {
  const openDone = issueItem(20, { managedFields: managedFields({ status: "Done" }) });
  const closedUnmerged = pullRequestItem(21, {
    native: {
      ...pullRequestItem(21).native,
      state: "CLOSED",
      closedAt: "2026-08-01T00:00:00.000Z"
    }
  });
  const recentClosedUnmerged = pullRequestItem(22, {
    native: {
      ...pullRequestItem(22).native,
      state: "CLOSED",
      closedAt: "2026-08-30T11:50:00.000Z"
    }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([closedUnmerged, openDone, recentClosedUnmerged]),
    contract: contract()
  });

  assert.equal(report.outcome, "drift");
  assert.deepEqual(findingCodes(report), [
    "project_drift_open_status_done_review",
    "project_drift_native_closed_status_not_done",
    "project_drift_native_workflow_sync_pending"
  ]);
  assert.equal(report.summary.provenCount, 1);
  assert.equal(report.summary.reviewCount, 2);
  assert.ok(report.nonClaims.includes("closed_unmerged_pull_request_delivery_not_inferred"));
});

test("unavailable content is review-only and never leaks raw content", () => {
  const unavailable = {
    ...issueItem(30),
    isArchived: true,
    projectItemType: "REDACTED",
    scope: "unknown",
    native: {
      kind: "unavailable",
      expectedType: "REDACTED",
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
    managedFields: managedFields(),
    rawResponse: "token=must-never-appear-123456"
  };
  const report = buildProjectDriftReport({
    projectExport: projectExport([unavailable], {
      coverage: {
        ...projectExport().coverage,
        projectItemContent: "complete_with_unavailable"
      }
    }),
    contract: contract()
  });

  assert.equal(report.outcome, "review_required");
  assert.deepEqual(findingCodes(report), ["project_drift_native_content_unavailable_review"]);
  assert.equal(projectDriftExitCode(report), 2);
  assert.doesNotMatch(JSON.stringify(report), /must-never-appear|rawResponse|token=/u);
});

test("archived managed native items remain in deterministic field and lifecycle evaluation", () => {
  const archived = issueItem(31, {
    isArchived: true,
    native: {
      ...issueItem(31).native,
      state: "CLOSED",
      closedAt: "2026-08-01T00:00:00.000Z"
    }
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([archived]),
    contract: contract()
  });

  assert.equal(report.outcome, "drift");
  assert.deepEqual(findingCodes(report), ["project_drift_native_closed_status_not_done"]);
});

test("linked PRs, Site checks, and #597/#598 never infer Epic completion or production", () => {
  const issue597 = issueItem(597, {
    managedFields: managedFields({
      status: "Blocked",
      "source-production-state": "drift",
      "validation-state": "Blocked"
    }),
    linkedPullRequests: [{ number: 667, state: "MERGED" }],
    checks: { state: "success", workflow: "Deploy Cloudflare Site" }
  });
  const issue598 = issueItem(598, {
    managedFields: managedFields({
      status: "Backlog",
      "source-production-state": "unknown",
      "validation-state": "Not started"
    }),
    linkedPullRequests: [
      { number: 593, state: "MERGED" },
      { number: 594, state: "CLOSED" }
    ]
  });
  const report = buildProjectDriftReport({
    projectExport: projectExport([issue598, issue597]),
    contract: contract()
  });
  const encoded = JSON.stringify(report);

  assert.equal(report.outcome, "clean_in_evaluated_scope");
  assert.deepEqual(report.findings, []);
  assert.equal(report.coverage.checks, "not_evaluated");
  assert.equal(report.coverage.source, "not_evaluated");
  assert.equal(report.coverage.production, "not_evaluated");
  assert.doesNotMatch(encoded, /Deploy Cloudflare Site|linkedPullRequests|aligned|delivered/u);
});

test("finding order is deterministic across item order", () => {
  const issue40 = issueItem(40, { managedFields: managedFields({ lane: null }) });
  const issue39 = issueItem(39, { managedFields: managedFields({ risk: null }) });
  const left = buildProjectDriftReport({
    projectExport: projectExport([issue40, issue39]),
    contract: contract()
  });
  const right = buildProjectDriftReport({
    projectExport: projectExport([issue39, issue40]),
    contract: contract()
  });

  assert.deepEqual(left.findings, right.findings);
  assert.deepEqual(left.findings.map((finding) => finding.subject.number), [39, 40]);
});

test("CLI emits JSON only and maps clean, drift, and invalid input to 0/1/2", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "project-drift-cli-"));
  const inputPath = join(rootDir, "input.json");
  writeFileSync(inputPath, JSON.stringify(projectExport()));

  const cleanStdout = [];
  const cleanStderr = [];
  const cleanCode = runProjectDriftCli({
    argv: ["--input", inputPath, "--json"],
    stdout: (value) => cleanStdout.push(value),
    stderr: (value) => cleanStderr.push(value)
  });
  assert.equal(cleanCode, 0);
  assert.equal(cleanStderr.join(""), "");
  const cleanReport = JSON.parse(cleanStdout.join(""));
  assert.equal(cleanReport.outcome, "clean_in_evaluated_scope");
  assert.equal(cleanReport.canonicalContract, true);
  assert.match(cleanReport.canonicalContractSha256, /^[0-9a-f]{64}$/u);

  const driftInput = projectExport();
  driftInput.fieldManifest.managed.status.name = "Workflow Status";
  writeFileSync(inputPath, JSON.stringify(driftInput));
  const driftStdout = [];
  assert.equal(runProjectDriftCli({
    argv: ["--input", inputPath, "--json"],
    stdout: (value) => driftStdout.push(value),
    stderr: () => {}
  }), 1);
  assert.equal(JSON.parse(driftStdout.join("")).outcome, "drift");

  const invalidStdout = [];
  const invalidStderr = [];
  assert.equal(runProjectDriftCli({
    argv: ["--input", join(rootDir, "missing.json"), "--json"],
    stdout: (value) => invalidStdout.push(value),
    stderr: (value) => invalidStderr.push(value)
  }), 2);
  assert.equal(invalidStderr.join(""), "");
  const missingReport = JSON.parse(invalidStdout.join(""));
  assert.equal(missingReport.outcome, "indeterminate");
  assert.deepEqual(missingReport.errors, [{ code: "project_drift_cli_input_read_failed" }]);

  const malformedInputPath = join(rootDir, "malformed.json");
  writeFileSync(malformedInputPath, "{");
  const malformedStdout = [];
  assert.equal(runProjectDriftCli({
    argv: ["--input", malformedInputPath, "--json"],
    stdout: (value) => malformedStdout.push(value),
    stderr: () => {}
  }), 2);
  assert.deepEqual(JSON.parse(malformedStdout.join("")).errors, [
    { code: "project_drift_cli_input_json_invalid" }
  ]);

  const unsupportedStdout = [];
  assert.equal(runProjectDriftCli({
    argv: ["--contract", join(rootDir, "contract.json"), "--json"],
    stdout: (value) => unsupportedStdout.push(value),
    stderr: () => {}
  }), 2);
  assert.deepEqual(JSON.parse(unsupportedStdout.join("")).errors, [
    { code: "project_drift_cli_argument_unsupported" }
  ]);

  const badContractStdout = [];
  let badContractReads = 0;
  assert.equal(runProjectDriftCli({
    argv: ["--input", inputPath, "--json"],
    stdout: (value) => badContractStdout.push(value),
    stderr: () => {},
    readFile: (path, encoding) => {
      if (resolve(path) === resolve(REPOSITORY_ROOT, "project-state/project-v2-contract.json")) {
        badContractReads += 1;
        return Buffer.from("{}");
      }
      return readFileSync(path, encoding);
    }
  }), 2);
  assert.equal(badContractReads, 1, "the canonical contract read must use the invalid fixture");
  assert.deepEqual(JSON.parse(badContractStdout.join("")).errors, [
    { code: "project_drift_cli_contract_not_canonical" }
  ]);

  const duplicateStdout = [];
  const duplicateStderr = [];
  assert.equal(runProjectDriftCli({
    argv: ["--input", inputPath, "--json", "--json"],
    stdout: (value) => duplicateStdout.push(value),
    stderr: (value) => duplicateStderr.push(value)
  }), 2);
  assert.equal(duplicateStderr.join(""), "");
  assert.deepEqual(JSON.parse(duplicateStdout.join("")).errors, [
    { code: "project_drift_cli_argument_invalid" }
  ]);

  const usageStdout = [];
  const usageStderr = [];
  assert.equal(runProjectDriftCli({
    argv: ["--input", inputPath],
    stdout: (value) => usageStdout.push(value),
    stderr: (value) => usageStderr.push(value)
  }), 2);
  assert.equal(usageStdout.join(""), "");
  assert.equal(usageStderr.join(""), "project_drift_cli_argument_invalid\n");
});
