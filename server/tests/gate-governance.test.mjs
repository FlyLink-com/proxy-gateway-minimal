import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_REPAIR_POLICY,
  computeFailureAttributionDigest,
  computeGateScopeDigest,
  computeRepairPolicyDigest,
  computeRouterResultDigest,
  isLegacyEmptyGateLedger,
  routeGateFailure,
  validateFailureAttribution,
  validateGateLedger,
  validateGateLedgerTransition,
  validateRepairPolicy,
  validateRepairPolicyTransition
} from "../services/governance/gate-governance.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const POLICY_DIGEST = computeRepairPolicyDigest(DEFAULT_REPAIR_POLICY);

function clone(value) {
  return structuredClone(value);
}

function evidence(reference, digit) {
  return { reference, sha256: digit.repeat(64) };
}

function stateClaims(overrides = {}) {
  return {
    sourceFilesChanged: false,
    commitCreated: false,
    pushPerformed: false,
    retainedLocalState: false,
    retainedStateDigest: null,
    productionMutation: false,
    ...overrides
  };
}

function gateScope(allowedFiles = ["docs/README.md"]) {
  return {
    allowedFiles,
    forbiddenActions: ["production_mutation"],
    validation: ["diff_check"]
  };
}

function routerScope(scope, overrides = {}) {
  return {
    targetPaths: [...scope.allowedFiles].sort(),
    capabilityIds: [],
    protectedScope: false,
    ...overrides
  };
}

function attribution(overrides = {}) {
  return {
    schemaVersion: "2",
    observationDigest: "a".repeat(64),
    classifierVersion: "classifier/v2",
    classifierRulesDigest: "b".repeat(64),
    classifierMode: "deterministic",
    category: "docs_metadata",
    reasonCode: "obsolete_expectation",
    technicalImpact: ["validation_failed"],
    confidence: "high",
    affectedInvariants: ["documentation_contract"],
    evidenceRefs: ["issuecomment-attribution"],
    decisionReason: {
      category: "deterministic_rule",
      blockers: [],
      missingEvidence: []
    },
    ...overrides
  };
}

function routeDecision({
  gateRisk = "C",
  attributionRecord = attribution(),
  scope = routerScope(gateScope()),
  attempt = 0,
  budget = 1,
  lineageDigest = "c".repeat(64),
  parentReceipt = "issuecomment-attribution",
  policy = DEFAULT_REPAIR_POLICY
} = {}) {
  return routeGateFailure({
    gateRisk,
    attributionRecord,
    attributionDigest: computeFailureAttributionDigest(attributionRecord),
    scope,
    policy,
    policyVersion: policy.schemaVersion,
    policyDigest: computeRepairPolicyDigest(policy),
    retryLineage: { lineageDigest, parentReceipt, attempt, budget }
  });
}

function routeEvent({
  gateRisk = "C",
  attributionRecord,
  attributionEvidence,
  scope,
  at,
  attempt = 0,
  budget = 1,
  lineageDigest = "c".repeat(64)
}) {
  const routed = routeDecision({
    gateRisk,
    attributionRecord,
    scope: routerScope(scope),
    attempt,
    budget,
    lineageDigest,
    parentReceipt: attributionEvidence.reference
  });
  return {
    schemaVersion: "2",
    type: "repair_routed",
    at,
    parentReceiptDigest: attributionEvidence.sha256,
    observationDigest: attributionRecord.observationDigest,
    attributionDigest: computeFailureAttributionDigest(attributionRecord),
    routerResult: routed.value.record,
    routerResultDigest: routed.value.routerResultDigest,
    retry: { ...routed.value.record.retry, lineageDigest },
    policyVersion: DEFAULT_REPAIR_POLICY.schemaVersion,
    policyDigest: POLICY_DIGEST
  };
}

function ledger(gates) {
  return {
    schemaVersion: "1",
    authority: "evidence-index-only",
    description: "prospective Gate evidence fixture",
    repairPolicyVersion: DEFAULT_REPAIR_POLICY.schemaVersion,
    repairPolicyDigest: POLICY_DIGEST,
    gates
  };
}

function rootRoutedGate({ successorGateId = null } = {}) {
  const scope = gateScope();
  const attributionEvidence = evidence("issuecomment-attribution", "3");
  const attributionRecord = attribution({ evidenceRefs: [attributionEvidence.reference] });
  const events = [
    { type: "proposed", at: "2026-07-15T12:00:00.000Z", evidence: evidence("issuecomment-proposal", "1") },
    {
      type: "terminal_blocked",
      at: "2026-07-15T12:01:00.000Z",
      evidence: evidence("issuecomment-blocked", "2"),
      reasonCode: "diff_check_failed",
      approvalState: "absent",
      stateClaims: stateClaims()
    },
    {
      type: "failure_attributed",
      at: "2026-07-15T12:02:00.000Z",
      evidence: attributionEvidence,
      attribution: attributionRecord
    },
    routeEvent({
      attributionRecord,
      attributionEvidence,
      scope,
      at: "2026-07-15T12:03:00.000Z"
    })
  ];
  if (successorGateId !== null) {
    events.push({
      type: "successor_proposed",
      at: "2026-07-15T12:04:00.000Z",
      evidence: evidence("issuecomment-successor", "4"),
      successorGateId
    });
  }
  return {
    id: "gate-root",
    lineageId: "gate-root",
    predecessorGateId: null,
    risk: "C",
    subject: {
      issue: 437,
      pullRequest: 499,
      purpose: "route_validation",
      sourceHead: "1".repeat(40)
    },
    scope,
    scopeDigest: computeGateScopeDigest(scope),
    events
  };
}

function successorGate() {
  const scope = gateScope();
  const authorization = {
    gateId: "gate-successor",
    lineageId: "gate-root",
    authority: "repair_policy",
    scopeDigest: computeGateScopeDigest(scope),
    sourceHead: "1".repeat(40),
    policyVersion: "2"
  };
  const approvalEvidence = evidence("issuecomment-approval", "5");
  const attributionEvidence = evidence("issuecomment-attribution-2", "7");
  const attributionRecord = attribution({
    observationDigest: "d".repeat(64),
    evidenceRefs: [attributionEvidence.reference]
  });
  return {
    id: "gate-successor",
    lineageId: "gate-root",
    predecessorGateId: "gate-root",
    risk: "C",
    subject: {
      issue: 437,
      pullRequest: 499,
      purpose: "route_validation",
      sourceHead: "1".repeat(40)
    },
    scope,
    scopeDigest: computeGateScopeDigest(scope),
    events: [
      { type: "proposed", at: "2026-07-15T12:05:00.000Z", evidence: evidence("issuecomment-proposal-2", "6") },
      { type: "approval_recorded", at: "2026-07-15T12:06:00.000Z", evidence: approvalEvidence, authorization },
      { type: "approval_consumed", at: "2026-07-15T12:07:00.000Z", evidence: approvalEvidence, authorization },
      {
        type: "terminal_blocked",
        at: "2026-07-15T12:08:00.000Z",
        evidence: evidence("issuecomment-blocked-2", "8"),
        reasonCode: "targeted_failed",
        approvalState: "consumed",
        stateClaims: stateClaims()
      },
      {
        type: "failure_attributed",
        at: "2026-07-15T12:09:00.000Z",
        evidence: attributionEvidence,
        attribution: attributionRecord
      },
      routeEvent({
        attributionRecord,
        attributionEvidence,
        scope,
        at: "2026-07-15T12:10:00.000Z",
        attempt: 1,
        budget: 1,
        lineageDigest: "c".repeat(64)
      })
    ]
  };
}

test("failure attribution v2 is facts-only, strict, and domain separated", () => {
  const valid = attribution();
  assert.deepEqual(validateFailureAttribution(valid), { ok: true, errors: [] });
  assert.equal(validateFailureAttribution({ ...valid, failureRisk: "C" }).ok, false);
  assert.equal(validateFailureAttribution({ ...valid, approvalRequired: false }).ok, false);
  assert.equal(validateFailureAttribution({ ...valid, schemaVersion: "1" }).ok, false);
  assert.equal(validateFailureAttribution({
    ...valid,
    affectedInvariants: ["z_invariant", "a_invariant"]
  }).ok, false);
  assert.equal(validateFailureAttribution({
    ...valid,
    affectedInvariants: ["A", "a"]
  }).ok, true);
  assert.equal(validateFailureAttribution({
    ...valid,
    affectedInvariants: ["a", "A"]
  }).ok, false);
  assert.match(computeFailureAttributionDigest(valid), /^[a-f0-9]{64}$/);
  assert.notEqual(computeFailureAttributionDigest(valid), computeRouterResultDigest(valid));
});

test("router v2 applies risk floors and never grants mutation authority", () => {
  const workflowScope = {
    targetPaths: [".github/workflows/ci.yml"],
    capabilityIds: ["workflow_repair"],
    protectedScope: false
  };
  const workflow = routeDecision({
    attributionRecord: attribution({ category: "ci_configuration", reasonCode: "timeout_contract" }),
    scope: workflowScope
  });
  assert.equal(workflow.ok, true);
  assert.equal(workflow.value.record.governanceRisk, "B");
  assert.equal(workflow.value.record.lane, "codex_auto_repair");
  assert.equal(workflow.value.record.proposalEligible, true);
  assert.equal(workflow.value.record.executionAuthority, false);
  assert.equal(workflow.value.record.operatorApprovalRequiredForMutation, true);
  assert.equal(workflow.value.routerResultDigest, computeRouterResultDigest(workflow.value.record));

  const protectedPath = routeDecision({
    gateRisk: "B",
    attributionRecord: attribution({ category: "execution_transport" }),
    scope: {
      targetPaths: ["server/services/governance/gate-governance.mjs"],
      capabilityIds: [],
      protectedScope: false
    }
  });
  assert.equal(protectedPath.value.record.lane, "operator_review");
  assert.deepEqual(protectedPath.value.record.reasonCodes, ["protected_scope"]);

  const protectedCapability = routeDecision({
    gateRisk: "B",
    attributionRecord: attribution({ category: "execution_transport" }),
    scope: {
      targetPaths: ["server/tests/example.test.mjs"],
      capabilityIds: ["validator_self_change"],
      protectedScope: false
    }
  });
  assert.equal(protectedCapability.value.record.lane, "operator_review");

  const riskA = routeDecision({
    gateRisk: "A",
    attributionRecord: attribution({ category: "execution_transport" }),
    budget: 0
  });
  assert.equal(riskA.value.record.lane, "operator_review");
  assert.equal(riskA.value.record.governanceRisk, "A");

  const lowConfidence = routeDecision({
    attributionRecord: attribution({ confidence: "medium" })
  });
  assert.equal(lowConfidence.value.record.lane, "operator_review");
  assert.deepEqual(lowConfidence.value.record.reasonCodes, ["attribution_confidence_insufficient"]);

  const exhausted = routeDecision({ attempt: 1 });
  assert.equal(exhausted.value.record.lane, "operator_review");
  assert.deepEqual(exhausted.value.record.reasonCodes, ["retry_budget_exhausted"]);

  const segmentBoundary = routeDecision({
    scope: {
      targetPaths: [".github/workflows-archive/example.yml"],
      capabilityIds: [],
      protectedScope: false
    }
  });
  assert.equal(segmentBoundary.value.record.governanceRisk, "C");

  assert.doesNotThrow(() => routeDecision({
    scope: {
      targetPaths: ["A/example.yml", "a/example.yml"],
      capabilityIds: [],
      protectedScope: false
    }
  }));

  assert.throws(() => routeGateFailure({
    gateRisk: "C",
    attributionRecord: attribution(),
    attributionDigest: "f".repeat(64),
    scope: routerScope(gateScope()),
    policy: DEFAULT_REPAIR_POLICY,
    policyVersion: "2",
    policyDigest: POLICY_DIGEST,
    retryLineage: {
      lineageDigest: "c".repeat(64),
      parentReceipt: "issuecomment-attribution",
      attempt: 0,
      budget: 1
    }
  }), /gate_governance_contract_invalid/);
});

test("repair policy v2 is closed and cannot self-authorize weakening", () => {
  assert.deepEqual(validateRepairPolicy(DEFAULT_REPAIR_POLICY), { ok: true, errors: [] });
  const loweredCategory = clone(DEFAULT_REPAIR_POLICY);
  loweredCategory.categoryRiskFloor.business_contract = "C";
  const removedProtection = clone(DEFAULT_REPAIR_POLICY);
  removedProtection.protectedCapabilities = removedProtection.protectedCapabilities.filter(
    (value) => value !== "secret_access"
  );
  const expandedAuto = clone(DEFAULT_REPAIR_POLICY);
  expandedAuto.autoProposalCategories.push("business_contract");
  expandedAuto.autoProposalCategories.sort();
  assert.equal(validateRepairPolicy(loweredCategory).ok, false);
  assert.equal(validateRepairPolicy(removedProtection).ok, false);
  assert.equal(validateRepairPolicy(expandedAuto).ok, false);
  assert.deepEqual(
    validateRepairPolicyTransition(DEFAULT_REPAIR_POLICY, clone(DEFAULT_REPAIR_POLICY)),
    { ok: true, errors: [] }
  );
  const changedV2Policy = clone(DEFAULT_REPAIR_POLICY);
  changedV2Policy.retryBudget.C = 0;
  assert.match(
    validateRepairPolicyTransition(DEFAULT_REPAIR_POLICY, changedV2Policy).errors.join("\n"),
    /schema version 2/
  );
  assert.equal(validateRepairPolicyTransition(DEFAULT_REPAIR_POLICY, loweredCategory).ok, false);
  assert.deepEqual(validateRepairPolicyTransition(null, clone(DEFAULT_REPAIR_POLICY)), { ok: true, errors: [] });
  assert.equal(validateRepairPolicyTransition(null, loweredCategory).ok, false);
});

test("gate ledger v1 binds the exact v2 route event and rejects v1 mixtures", () => {
  const valid = ledger([rootRoutedGate()]);
  assert.deepEqual(validateGateLedger(valid), { ok: true, errors: [] });

  const v1Mixture = clone(valid);
  v1Mixture.gates[0].events[3].repairAttempts = 0;
  assert.match(validateGateLedger(v1Mixture).errors.join("\n"), /exact fields/);

  const tamperedDigest = clone(valid);
  tamperedDigest.gates[0].events[3].routerResultDigest = "f".repeat(64);
  assert.match(validateGateLedger(tamperedDigest).errors.join("\n"), /routerResultDigest/);

  const retryMismatch = clone(valid);
  retryMismatch.gates[0].events[3].retry.remaining = 1;
  assert.match(validateGateLedger(retryMismatch).errors.join("\n"), /retry.*embedded Router result/);

  const policyMismatch = clone(valid);
  policyMismatch.gates[0].events[3].policyDigest = "e".repeat(64);
  assert.match(validateGateLedger(policyMismatch).errors.join("\n"), /policyDigest/);
});

test("successor retry lineage cannot reset attempt, budget, or lineage identity", () => {
  const valid = ledger([rootRoutedGate({ successorGateId: "gate-successor" }), successorGate()]);
  assert.deepEqual(validateGateLedger(valid), { ok: true, errors: [] });

  const resetAttempt = clone(valid);
  const attemptGate = resetAttempt.gates[1];
  const attemptAttributionEvent = attemptGate.events[4];
  attemptGate.events[5] = routeEvent({
    attributionRecord: attemptAttributionEvent.attribution,
    attributionEvidence: attemptAttributionEvent.evidence,
    scope: attemptGate.scope,
    at: "2026-07-15T12:10:00.000Z",
    attempt: 0,
    budget: 1,
    lineageDigest: "c".repeat(64)
  });
  assert.match(validateGateLedger(resetAttempt).errors.join("\n"), /retry\.attempt.*immutable successor lineage/);

  const resetLineage = clone(valid);
  const lineageGate = resetLineage.gates[1];
  const lineageAttributionEvent = lineageGate.events[4];
  lineageGate.events[5] = routeEvent({
    attributionRecord: lineageAttributionEvent.attribution,
    attributionEvidence: lineageAttributionEvent.evidence,
    scope: lineageGate.scope,
    at: "2026-07-15T12:10:00.000Z",
    attempt: 1,
    budget: 1,
    lineageDigest: "d".repeat(64)
  });
  assert.match(validateGateLedger(resetLineage).errors.join("\n"), /retry\.lineageDigest.*immutable successor lineage/);

  const scopeDrift = clone(valid);
  scopeDrift.gates[1].scope.allowedFiles = ["docs/PROJECT_CONTEXT.md"];
  scopeDrift.gates[1].scopeDigest = computeGateScopeDigest(scopeDrift.gates[1].scope);
  assert.match(validateGateLedger(scopeDrift).errors.join("\n"), /automatic successor must inherit exact/);

  const chronologyDrift = clone(valid);
  chronologyDrift.gates[1].events[0].at = "2026-07-15T12:03:30.000Z";
  assert.match(validateGateLedger(chronologyDrift).errors.join("\n"), /successor chronology/);
});

test("approval consumption preserves evidence identity and blocked state claims", () => {
  const scope = gateScope(["server/tests/example.test.mjs"]);
  const authorization = {
    gateId: "gate-approval",
    lineageId: "gate-approval",
    authority: "operator",
    scopeDigest: computeGateScopeDigest(scope),
    sourceHead: "2".repeat(40),
    policyVersion: null
  };
  const approvalEvidence = evidence("issuecomment-approval", "2");
  const valid = ledger([{
    id: "gate-approval",
    lineageId: "gate-approval",
    predecessorGateId: null,
    risk: "B",
    subject: {
      issue: 437,
      pullRequest: 499,
      purpose: "approval_validation",
      sourceHead: "2".repeat(40)
    },
    scope,
    scopeDigest: computeGateScopeDigest(scope),
    events: [
      { type: "proposed", at: "2026-07-15T13:00:00.000Z", evidence: evidence("issuecomment-proposal", "1") },
      { type: "approval_recorded", at: "2026-07-15T13:01:00.000Z", evidence: approvalEvidence, authorization },
      { type: "approval_consumed", at: "2026-07-15T13:02:00.000Z", evidence: approvalEvidence, authorization },
      {
        type: "terminal_blocked",
        at: "2026-07-15T13:03:00.000Z",
        evidence: evidence("issuecomment-blocked", "3"),
        reasonCode: "output_failed",
        approvalState: "consumed",
        stateClaims: stateClaims({
          sourceFilesChanged: true,
          retainedLocalState: true,
          retainedStateDigest: "4".repeat(64)
        })
      }
    ]
  }]);
  assert.deepEqual(validateGateLedger(valid), { ok: true, errors: [] });

  const mismatchedApproval = clone(valid);
  mismatchedApproval.gates[0].events[2].evidence = {
    ...mismatchedApproval.gates[0].events[2].evidence,
    sha256: "9".repeat(64)
  };
  assert.match(validateGateLedger(mismatchedApproval).errors.join("\n"), /approval evidence identity|content identity mismatch/);

  const lostRetainedDigest = clone(valid);
  lostRetainedDigest.gates[0].events[3].stateClaims.retainedStateDigest = null;
  assert.match(validateGateLedger(lostRetainedDigest).errors.join("\n"), /retained local state requires/);
});

test("gate ledger transition is append-only and rejects historical rewrites", () => {
  const headGate = rootRoutedGate();
  const baseGate = clone(headGate);
  baseGate.events = baseGate.events.slice(0, 2);
  const base = ledger([baseGate]);
  const head = ledger([headGate]);
  assert.deepEqual(validateGateLedger(base), { ok: true, errors: [] });
  assert.deepEqual(validateGateLedger(head), { ok: true, errors: [] });
  assert.deepEqual(validateGateLedgerTransition(base, head, {
    basePolicy: DEFAULT_REPAIR_POLICY,
    headPolicy: DEFAULT_REPAIR_POLICY
  }), { ok: true, errors: [] });

  const rewritten = clone(head);
  rewritten.gates[0].events[0].evidence.sha256 = "9".repeat(64);
  assert.match(validateGateLedgerTransition(base, rewritten, {
    basePolicy: DEFAULT_REPAIR_POLICY,
    headPolicy: DEFAULT_REPAIR_POLICY
  }).errors.join("\n"), /event rewrite is forbidden/);
});

test("repository publishes v2 governance contracts while retaining the empty legacy ledger root", () => {
  const paths = [
    "schemas/failure-attribution-v2.schema.json",
    "schemas/gate-ledger-v1.schema.json",
    "schemas/repair-policy-v2.schema.json",
    "project-state/repair-policy.json",
    "project-state/gates.json",
    "scripts/check-gate-governance.mjs"
  ];
  for (const path of paths) assert.equal(existsSync(resolve(REPOSITORY_ROOT, path)), true, `missing ${path}`);

  const schemas = paths.slice(0, 3).map((path) => JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, path), "utf8")));
  for (const schema of schemas) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
  }
  assert.equal(schemas[0].properties.schemaVersion.const, "2");
  assert.equal(schemas[2].properties.schemaVersion.const, "2");
  assert.match(JSON.stringify(schemas[1]), /failure-attribution-v2\.schema\.json/);
  assert.doesNotMatch(JSON.stringify(schemas[1]), /failure-attribution-v1\.schema\.json|repairAttempts/);

  const policy = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "project-state/repair-policy.json"), "utf8"));
  const storedLedger = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "project-state/gates.json"), "utf8"));
  assert.deepEqual(validateRepairPolicy(policy), { ok: true, errors: [] });
  assert.equal(isLegacyEmptyGateLedger(storedLedger), true);
  assert.deepEqual(validateGateLedger(storedLedger, { policy }), { ok: true, errors: [] });
  assert.equal(storedLedger.gates.length, 0);
});

test("governance CLI validates snapshots and fails closed on incomplete invocation", () => {
  const run = (...args) => spawnSync(
    process.execPath,
    ["scripts/check-gate-governance.mjs", ...args],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );
  for (const args of [
    ["--snapshot"],
    ["--base-state-missing"],
    ["--base-gates-file", "project-state/gates.json", "--base-policy-file", "project-state/repair-policy.json"],
    [
      "--head-gates-file", "project-state/gates.json",
      "--head-policy-file", "project-state/repair-policy.json",
      "--base-gates-file", "project-state/gates.json",
      "--base-policy-file", "project-state/repair-policy.json"
    ]
  ]) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
  }
  const incomplete = run("--base-gates-file");
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /gate_governance_arguments_invalid/);
});

test("repository documents the bounded repair and escalation contract", () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
  const workflow = readFileSync(resolve(REPOSITORY_ROOT, "docs/GITHUB_ISSUE_PR_WORKFLOW.md"), "utf8");
  const baseline = readFileSync(resolve(REPOSITORY_ROOT, "docs/VALIDATION_BASELINE.md"), "utf8");
  assert.equal(packageJson.scripts["governance:check"], "node scripts/check-gate-governance.mjs --snapshot");
  assert.match(workflow, /prospective-only/i);
  assert.match(workflow, /does not reopen or continue a consumed Gate/i);
  assert.match(workflow, /high confidence/i);
  assert.match(workflow, /retry budget/i);
  assert.match(workflow, /scope drift.*operator review/is);
  assert.match(workflow, /Risk A.*new operator approval/is);
  assert.match(baseline, /npm run governance:check/);
  assert.match(baseline, /Governance trusted advisory/);
  assert.match(baseline, /exact base ledger/i);
});

test("project-state sensitive scanning includes governance state files", async () => {
  const rootDir = mkdtempSync(resolve(tmpdir(), "gate-governance-sensitive-"));
  try {
    mkdirSync(resolve(rootDir, "project-state"), { recursive: true });
    for (const name of ["current.json", "lanes.json", "tasks.json"]) {
      writeFileSync(
        resolve(rootDir, "project-state", name),
        readFileSync(resolve(REPOSITORY_ROOT, "project-state", name), "utf8")
      );
    }
    writeFileSync(resolve(rootDir, "project-state/gates.json"), JSON.stringify({ note: "token=unit-test-secret" }));
    writeFileSync(
      resolve(rootDir, "project-state/repair-policy.json"),
      readFileSync(resolve(REPOSITORY_ROOT, "project-state/repair-policy.json"), "utf8")
    );
    const { checkProjectState } = await import("../../scripts/check-project-state.mjs");
    const result = checkProjectState({ rootDir });
    assert.match(result.errors.join("\n"), /project-state\/gates\.json:1: raw secret pattern matched \(token\)/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
