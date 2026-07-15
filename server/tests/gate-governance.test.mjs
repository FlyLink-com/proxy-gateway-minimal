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

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function evaluateGovernanceModule(source) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8"
  });
}

test("risk-aware router keeps C and bounded B repair with Codex while A requires a new approval", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      routeGateFailure
    } from "./server/services/governance/gate-governance.mjs";

    const attribution = (category, failureRisk = "C", affectedInvariants = ["execution_transport"]) => ({
      schemaVersion: "1",
      failureId: "failure-001",
      gateId: "gate-001",
      stage: "execution_transport",
      category,
      failureRisk,
      confidence: "high",
      affectedInvariants,
      evidenceRefs: ["issuecomment-1"],
      observedAt: "2026-07-15T12:00:00.000Z"
    });
    const scope = { allowedFiles: ["server/tests/example.test.mjs"] };

    const output = {
      c: routeGateFailure({
        scope,
        gateRisk: "C",
        attribution: attribution("transport_format"),
        repairAttempts: 0,
        policy: DEFAULT_REPAIR_POLICY
      }),
      b: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution: attribution("test_fixture", "B", ["test_contract"]),
        repairAttempts: 0,
        policy: DEFAULT_REPAIR_POLICY
      }),
      a: routeGateFailure({
        scope,
        gateRisk: "A",
        attribution: attribution("transport_format", "C"),
        repairAttempts: 0,
        policy: DEFAULT_REPAIR_POLICY
      })
    };
    process.stdout.write(JSON.stringify(output));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.c, {
    lane: "codex_auto_repair",
    approvalRequired: false,
    newGateRequired: true,
    retryBudget: 1,
    retryRemaining: 0,
    reasonCode: "bounded_auto_repair"
  });
  assert.deepEqual(output.b, {
    lane: "codex_auto_repair",
    approvalRequired: false,
    newGateRequired: true,
    retryBudget: 1,
    retryRemaining: 0,
    reasonCode: "bounded_auto_repair"
  });
  assert.deepEqual(output.a, {
    lane: "codex_successor_preparation",
    approvalRequired: true,
    newGateRequired: true,
    retryBudget: 0,
    retryRemaining: 0,
    reasonCode: "risk_a_new_approval_required"
  });
});

test("router escalates scope drift, unsupported B failures, and exhausted retry budgets", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      routeGateFailure
    } from "./server/services/governance/gate-governance.mjs";

    const attribution = (category, affectedInvariants = ["execution_transport"]) => ({
      schemaVersion: "1",
      failureId: "failure-002",
      gateId: "gate-002",
      stage: "execution_transport",
      category,
      failureRisk: "B",
      confidence: "high",
      affectedInvariants,
      evidenceRefs: ["issuecomment-2"],
      observedAt: "2026-07-15T12:01:00.000Z"
    });
    const scope = { allowedFiles: ["server/tests/example.test.mjs"] };

    process.stdout.write(JSON.stringify({
      scopeDrift: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution: attribution("transport_format", ["scope_drift"]),
        repairAttempts: 0,
        policy: DEFAULT_REPAIR_POLICY
      }),
      unsupported: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution: attribution("business_contract"),
        repairAttempts: 0,
        policy: DEFAULT_REPAIR_POLICY
      }),
      exhausted: routeGateFailure({
        scope,
        gateRisk: "C",
        attribution: attribution("docs_metadata"),
        repairAttempts: 1,
        policy: DEFAULT_REPAIR_POLICY
      }),
      protectedScope: routeGateFailure({
        scope: { allowedFiles: [".github/workflows/deploy-cloudflare-site.yml"] },
        gateRisk: "B",
        attribution: attribution("execution_transport"),
        repairAttempts: 0,
        policy: DEFAULT_REPAIR_POLICY
      })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.scopeDrift.lane, "operator_review");
  assert.equal(output.scopeDrift.reasonCode, "escalation_invariant");
  assert.equal(output.unsupported.lane, "operator_review");
  assert.equal(output.unsupported.reasonCode, "category_not_auto_repairable");
  assert.equal(output.exhausted.lane, "operator_review");
  assert.equal(output.exhausted.reasonCode, "retry_budget_exhausted");
  assert.equal(output.protectedScope.lane, "operator_review");
  assert.equal(output.protectedScope.reasonCode, "protected_scope");
});

test("router validates and applies the supplied machine repair policy", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      routeGateFailure,
      validateRepairPolicy
    } from "./server/services/governance/gate-governance.mjs";

    const attribution = {
      schemaVersion: "1",
      failureId: "failure-policy",
      gateId: "gate-policy",
      stage: "governance_validation",
      category: "execution_transport",
      failureRisk: "B",
      confidence: "high",
      affectedInvariants: ["test_contract"],
      evidenceRefs: ["issuecomment-policy"],
      observedAt: "2026-07-15T12:01:30.000Z"
    };
    const scope = { allowedFiles: ["server/tests/example.test.mjs"] };
    const customPolicy = {
      ...DEFAULT_REPAIR_POLICY,
      retryBudget: { ...DEFAULT_REPAIR_POLICY.retryBudget },
      autoRepairCategories: [...DEFAULT_REPAIR_POLICY.autoRepairCategories],
      escalationInvariants: [...DEFAULT_REPAIR_POLICY.escalationInvariants, "test_contract"]
    };
    const autoPolicy = {
      ...customPolicy,
      escalationInvariants: customPolicy.escalationInvariants.filter((value) => value !== "test_contract")
    };

    process.stdout.write(JSON.stringify({
      valid: validateRepairPolicy(customPolicy),
      invalidExtra: validateRepairPolicy({ ...customPolicy, fallback: "retry" }),
      escalated: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution,
        repairAttempts: 0,
        policy: customPolicy
      }),
      auto: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution,
        repairAttempts: 0,
        policy: autoPolicy
      })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.valid, { ok: true, errors: [] });
  assert.equal(output.invalidExtra.ok, false);
  assert.equal(output.escalated.lane, "operator_review");
  assert.equal(output.escalated.reasonCode, "escalation_invariant");
  assert.deepEqual(output.auto, {
    lane: "codex_auto_repair",
    approvalRequired: false,
    newGateRequired: true,
    retryBudget: 1,
    retryRemaining: 0,
    reasonCode: "bounded_auto_repair"
  });
});

test("repair policy transition prevents self-authorized weakening", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      validateRepairPolicyTransition
    } from "./server/services/governance/gate-governance.mjs";

    const base = structuredClone(DEFAULT_REPAIR_POLICY);
    const weakened = structuredClone(base);
    weakened.retryBudget.B = 9;
    weakened.autoRepairCategories.push("business_contract");
    weakened.escalationInvariants = weakened.escalationInvariants.filter(
      (value) => value !== "security_boundary"
    );
    process.stdout.write(JSON.stringify({
      unchanged: validateRepairPolicyTransition(base, structuredClone(base)),
      weakened: validateRepairPolicyTransition(base, weakened),
      bootstrapDefault: validateRepairPolicyTransition(null, structuredClone(base)),
      bootstrapCustom: validateRepairPolicyTransition(null, weakened)
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.unchanged, { ok: true, errors: [] });
  assert.equal(output.weakened.ok, false);
  assert.match(output.weakened.errors.join("\n"), /repair policy rewrite is forbidden/);
  assert.deepEqual(output.bootstrapDefault, { ok: true, errors: [] });
  assert.equal(output.bootstrapCustom.ok, false);
  assert.match(output.bootstrapCustom.errors.join("\n"), /bootstrap must use the default repair policy/);
});

test("router uses effective risk, confidence, category, and strict attribution before automation", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      routeGateFailure
    } from "./server/services/governance/gate-governance.mjs";

    const attribution = (overrides = {}) => ({
      schemaVersion: "1",
      failureId: "failure-routing",
      gateId: "gate-routing",
      stage: "execution_transport",
      category: "execution_transport",
      failureRisk: "B",
      confidence: "high",
      affectedInvariants: ["execution_transport"],
      evidenceRefs: ["issuecomment-routing"],
      observedAt: "2026-07-15T12:01:45.000Z",
      ...overrides
    });
    const scope = { allowedFiles: ["server/tests/example.test.mjs"] };
    let invalidError = null;
    try {
      routeGateFailure({
        scope,
        gateRisk: "B",
        attribution: attribution({ evidenceRefs: ["https://unsafe.invalid/raw"] }),
        policy: DEFAULT_REPAIR_POLICY
      });
    } catch (error) {
      invalidError = error.message;
    }

    process.stdout.write(JSON.stringify({
      executionTransport: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution: attribution(),
        policy: DEFAULT_REPAIR_POLICY
      }),
      effectiveA: routeGateFailure({
        scope,
        gateRisk: "C",
        attribution: attribution({ failureRisk: "A" }),
        policy: DEFAULT_REPAIR_POLICY
      }),
      lowConfidence: routeGateFailure({
        scope,
        gateRisk: "B",
        attribution: attribution({ confidence: "medium" }),
        policy: DEFAULT_REPAIR_POLICY
      }),
      unsupportedC: routeGateFailure({
        scope,
        gateRisk: "C",
        attribution: attribution({ category: "business_contract", failureRisk: "C" }),
        policy: DEFAULT_REPAIR_POLICY
      }),
      invalidError
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.executionTransport.lane, "codex_auto_repair");
  assert.equal(output.effectiveA.lane, "codex_successor_preparation");
  assert.equal(output.effectiveA.approvalRequired, true);
  assert.equal(output.lowConfidence.lane, "operator_review");
  assert.equal(output.lowConfidence.reasonCode, "attribution_confidence_insufficient");
  assert.equal(output.unsupportedC.lane, "operator_review");
  assert.equal(output.unsupportedC.reasonCode, "category_not_auto_repairable");
  assert.equal(output.invalidError, "gate_failure_attribution_invalid");
});

test("failure attribution accepts only the strict redacted machine schema", () => {
  const result = evaluateGovernanceModule(`
    import {
      validateFailureAttribution
    } from "./server/services/governance/gate-governance.mjs";

    const valid = {
      schemaVersion: "1",
      failureId: "failure-003",
      gateId: "gate-003",
      stage: "fresh_binding",
      category: "baseline_identity_drift",
      failureRisk: "A",
      confidence: "high",
      affectedInvariants: ["frozen_identity"],
      evidenceRefs: ["issuecomment-3"],
      observedAt: "2026-07-15T12:02:00.000Z"
    };

    process.stdout.write(JSON.stringify({
      valid: validateFailureAttribution(valid),
      extraField: validateFailureAttribution({ ...valid, rawOutput: "forbidden" }),
      unsafeEvidence: validateFailureAttribution({ ...valid, evidenceRefs: ["https://unsafe.invalid/raw"] }),
      badTimestamp: validateFailureAttribution({ ...valid, observedAt: "today" })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.valid, { ok: true, errors: [] });
  assert.equal(output.extraField.ok, false);
  assert.match(output.extraField.errors.join("\n"), /exact fields/);
  assert.equal(output.unsafeEvidence.ok, false);
  assert.match(output.unsafeEvidence.errors.join("\n"), /evidenceRefs/);
  assert.equal(output.badTimestamp.ok, false);
  assert.match(output.badTimestamp.errors.join("\n"), /observedAt/);
});

test("gate ledger validates blocked attribution and deterministic repair routing", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      computeGateScopeDigest,
      computeRepairPolicyDigest,
      routeGateFailure,
      validateGateLedger
    } from "./server/services/governance/gate-governance.mjs";

    const evidence = (reference, digit) => ({ reference, sha256: digit.repeat(64) });
    const scope = {
      allowedFiles: ["server/tests/example.test.mjs"],
      forbiddenActions: ["production_mutation"],
      validation: ["targeted", "full", "diff_check"]
    };
    const scopeDigest = computeGateScopeDigest(scope);
    const authorization = {
      gateId: "gate-004",
      lineageId: "gate-004",
      authority: "operator",
      scopeDigest,
      sourceHead: "a".repeat(40),
      policyVersion: null
    };
    const attribution = {
      schemaVersion: "1",
      failureId: "failure-004",
      gateId: "gate-004",
      stage: "targeted_green",
      category: "test_fixture",
      failureRisk: "B",
      confidence: "high",
      affectedInvariants: ["test_contract"],
      evidenceRefs: ["issuecomment-4"],
      observedAt: "2026-07-15T12:04:00.000Z"
    };
    const route = routeGateFailure({
      scope,
      gateRisk: "B",
      attribution,
      repairAttempts: 0,
      policy: DEFAULT_REPAIR_POLICY
    });
    const commonEvents = [
      { type: "proposed", at: "2026-07-15T12:00:00.000Z", evidence: evidence("issuecomment-1", "1") },
      { type: "approval_recorded", at: "2026-07-15T12:01:00.000Z", evidence: evidence("issuecomment-2", "2"), authorization },
      { type: "approval_consumed", at: "2026-07-15T12:02:00.000Z", evidence: evidence("issuecomment-2", "2"), authorization },
      {
        type: "terminal_blocked",
        at: "2026-07-15T12:03:00.000Z",
        evidence: evidence("issuecomment-3", "3"),
        reasonCode: "targeted_green_failed",
        approvalState: "consumed",
        stateClaims: {
          sourceFilesChanged: false,
          commitCreated: false,
          pushPerformed: false,
          retainedLocalState: false,
          retainedStateDigest: null,
          productionMutation: false
        }
      }
    ];
    const gate = {
      id: "gate-004",
      lineageId: "gate-004",
      predecessorGateId: null,
      risk: "B",
      subject: {
        issue: 437,
        pullRequest: 499,
        purpose: "targeted_repair",
        sourceHead: "a".repeat(40)
      },
      scope,
      scopeDigest,
      events: [
        ...commonEvents,
        {
          type: "failure_attributed",
          at: "2026-07-15T12:04:00.000Z",
          evidence: evidence("issuecomment-4", "4"),
          attribution
        },
        {
          type: "repair_routed",
          at: "2026-07-15T12:05:00.000Z",
          evidence: evidence("issuecomment-5", "5"),
          repairAttempts: 0,
          route
        }
      ]
    };
    const ledger = {
      schemaVersion: "1",
      authority: "evidence-index-only",
      description: "Prospective machine-readable Gate evidence.",
      repairPolicyVersion: "1",
      repairPolicyDigest: computeRepairPolicyDigest(DEFAULT_REPAIR_POLICY),
      gates: [gate]
    };
    const skippedAttribution = structuredClone(ledger);
    skippedAttribution.gates[0].events.splice(4, 1);
    const routeMismatch = structuredClone(ledger);
    routeMismatch.gates[0].events[5].route = {
      ...routeMismatch.gates[0].events[5].route,
      lane: "operator_review",
      approvalRequired: true,
      newGateRequired: true,
      reasonCode: "forged_route"
    };

    process.stdout.write(JSON.stringify({
      valid: validateGateLedger(ledger, { policy: DEFAULT_REPAIR_POLICY }),
      skippedAttribution: validateGateLedger(skippedAttribution, { policy: DEFAULT_REPAIR_POLICY }),
      routeMismatch: validateGateLedger(routeMismatch, { policy: DEFAULT_REPAIR_POLICY })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.valid, { ok: true, errors: [] });
  assert.equal(output.skippedAttribution.ok, false);
  assert.match(output.skippedAttribution.errors.join("\n"), /invalid event transition/);
  assert.equal(output.routeMismatch.ok, false);
  assert.match(output.routeMismatch.errors.join("\n"), /route does not match policy/);
});

test("blocked receipts preserve approval phase, retained local state, and evidence identity", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      computeGateScopeDigest,
      computeRepairPolicyDigest,
      routeGateFailure,
      validateGateLedger
    } from "./server/services/governance/gate-governance.mjs";

    const evidence = (reference, digit) => ({ reference, sha256: digit.repeat(64) });
    const scope = {
      allowedFiles: ["server/tests/example.test.mjs"],
      forbiddenActions: ["production_mutation"],
      validation: ["targeted"]
    };
    const attribution = {
      schemaVersion: "1",
      failureId: "failure-preconsumption",
      gateId: "gate-preconsumption",
      stage: "approval_writer",
      category: "execution_transport",
      failureRisk: "B",
      confidence: "high",
      affectedInvariants: ["execution_transport"],
      evidenceRefs: ["issuecomment-preconsumption-attribution"],
      observedAt: "2026-07-15T14:02:00.000Z"
    };
    const retainedClaims = {
      sourceFilesChanged: true,
      commitCreated: false,
      pushPerformed: false,
      retainedLocalState: true,
      retainedStateDigest: "f".repeat(64),
      productionMutation: false
    };
    const preconsumptionGate = {
      id: "gate-preconsumption",
      lineageId: "gate-preconsumption",
      predecessorGateId: null,
      risk: "B",
      subject: {
        issue: 437,
        pullRequest: 499,
        purpose: "transport_repair",
        sourceHead: "a".repeat(40)
      },
      scope,
      scopeDigest: computeGateScopeDigest(scope),
      events: [
        { type: "proposed", at: "2026-07-15T14:00:00.000Z", evidence: evidence("issuecomment-preconsumption-proposal", "1") },
        {
          type: "terminal_blocked",
          at: "2026-07-15T14:01:00.000Z",
          evidence: evidence("issuecomment-preconsumption-terminal", "2"),
          reasonCode: "approval_writer_failed",
          approvalState: "absent",
          stateClaims: retainedClaims
        },
        {
          type: "failure_attributed",
          at: attribution.observedAt,
          evidence: evidence("issuecomment-preconsumption-attribution", "3"),
          attribution
        },
        {
          type: "repair_routed",
          at: "2026-07-15T14:03:00.000Z",
          evidence: evidence("issuecomment-preconsumption-route", "4"),
          repairAttempts: 0,
          route: routeGateFailure({
            scope,
            gateRisk: "B",
            attribution,
            repairAttempts: 0,
            policy: DEFAULT_REPAIR_POLICY
          })
        }
      ]
    };
    const approvalConflict = structuredClone(preconsumptionGate);
    approvalConflict.id = "gate-approval-conflict";
    approvalConflict.lineageId = "gate-approval-conflict";
    approvalConflict.subject.purpose = "approval_conflict_check";
    const conflictAuthorization = {
      gateId: approvalConflict.id,
      lineageId: approvalConflict.lineageId,
      authority: "operator",
      scopeDigest: approvalConflict.scopeDigest,
      sourceHead: approvalConflict.subject.sourceHead,
      policyVersion: null
    };
    approvalConflict.events = [
      { type: "proposed", at: "2026-07-15T15:00:00.000Z", evidence: evidence("issuecomment-conflict-proposal", "5") },
      { type: "approval_recorded", at: "2026-07-15T15:01:00.000Z", evidence: evidence("issuecomment-conflict-approval", "6"), authorization: conflictAuthorization },
      { type: "approval_consumed", at: "2026-07-15T15:02:00.000Z", evidence: evidence("issuecomment-conflict-approval", "7"), authorization: conflictAuthorization },
      {
        type: "terminal_blocked",
        at: "2026-07-15T15:03:00.000Z",
        evidence: evidence("issuecomment-conflict-terminal", "8"),
        reasonCode: "targeted_failed",
        approvalState: "consumed",
        stateClaims: {
          sourceFilesChanged: false,
          commitCreated: false,
          pushPerformed: false,
          retainedLocalState: false,
          retainedStateDigest: null,
          productionMutation: false
        }
      }
    ];
    const wrongGateAuthorization = structuredClone(approvalConflict);
    for (const event of wrongGateAuthorization.events) {
      if (event.authorization) event.authorization.gateId = "different-gate";
    }
    const malformedEvents = structuredClone(preconsumptionGate);
    malformedEvents.events = {};
    const invalidRisk = structuredClone(preconsumptionGate);
    invalidRisk.risk = "D";
    const ledger = (gate) => ({
      schemaVersion: "1",
      authority: "evidence-index-only",
      description: "Prospective machine-readable Gate evidence.",
      repairPolicyVersion: "1",
      repairPolicyDigest: computeRepairPolicyDigest(DEFAULT_REPAIR_POLICY),
      gates: [gate]
    });

    process.stdout.write(JSON.stringify({
      preconsumption: validateGateLedger(ledger(preconsumptionGate), { policy: DEFAULT_REPAIR_POLICY }),
      approvalConflict: validateGateLedger(ledger(approvalConflict), { policy: DEFAULT_REPAIR_POLICY }),
      wrongGateAuthorization: validateGateLedger(ledger(wrongGateAuthorization), { policy: DEFAULT_REPAIR_POLICY }),
      malformedEvents: validateGateLedger(ledger(malformedEvents), { policy: DEFAULT_REPAIR_POLICY }),
      invalidRisk: validateGateLedger(ledger(invalidRisk), { policy: DEFAULT_REPAIR_POLICY })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.preconsumption, { ok: true, errors: [] });
  assert.equal(output.approvalConflict.ok, false);
  assert.match(output.approvalConflict.errors.join("\n"), /evidence reference content identity mismatch/);
  assert.equal(output.wrongGateAuthorization.ok, false);
  assert.match(output.wrongGateAuthorization.errors.join("\n"), /authorization\.gateId: must match Gate id/);
  assert.equal(output.malformedEvents.ok, false);
  assert.match(output.malformedEvents.errors.join("\n"), /events: expected a non-empty array/);
  assert.equal(output.invalidRisk.ok, false);
  assert.match(output.invalidRisk.errors.join("\n"), /risk: expected A, B, or C/);
});

test("gate ledger transition accepts append-only attribution and rejects historical rewrites", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      computeGateScopeDigest,
      computeRepairPolicyDigest,
      routeGateFailure,
      validateGateLedgerTransition
    } from "./server/services/governance/gate-governance.mjs";

    const evidence = (reference, digit) => ({ reference, sha256: digit.repeat(64) });
    const scope = {
      allowedFiles: ["docs/example.md"],
      forbiddenActions: ["production_mutation"],
      validation: ["diff_check"]
    };
    const scopeDigest = computeGateScopeDigest(scope);
    const authorization = {
      gateId: "gate-005",
      lineageId: "gate-005",
      authority: "operator",
      scopeDigest,
      sourceHead: "b".repeat(40),
      policyVersion: null
    };
    const attribution = {
      schemaVersion: "1",
      failureId: "failure-005",
      gateId: "gate-005",
      stage: "diff_check",
      category: "docs_metadata",
      failureRisk: "C",
      confidence: "high",
      affectedInvariants: ["documentation_contract"],
      evidenceRefs: ["issuecomment-5"],
      observedAt: "2026-07-15T13:04:00.000Z"
    };
    const baseEvents = [
      { type: "proposed", at: "2026-07-15T13:00:00.000Z", evidence: evidence("issuecomment-1", "1") },
      { type: "approval_recorded", at: "2026-07-15T13:01:00.000Z", evidence: evidence("issuecomment-2", "2"), authorization },
      { type: "approval_consumed", at: "2026-07-15T13:02:00.000Z", evidence: evidence("issuecomment-2", "2"), authorization },
      {
        type: "terminal_blocked",
        at: "2026-07-15T13:03:00.000Z",
        evidence: evidence("issuecomment-3", "3"),
        reasonCode: "diff_check_failed",
        approvalState: "consumed",
        stateClaims: {
          sourceFilesChanged: false,
          commitCreated: false,
          pushPerformed: false,
          retainedLocalState: false,
          retainedStateDigest: null,
          productionMutation: false
        }
      }
    ];
    const gate = {
      id: "gate-005",
      lineageId: "gate-005",
      predecessorGateId: null,
      risk: "C",
      subject: {
        issue: 437,
        pullRequest: null,
        purpose: "diff_repair",
        sourceHead: "b".repeat(40)
      },
      scope,
      scopeDigest,
      events: baseEvents
    };
    const base = {
      schemaVersion: "1",
      authority: "evidence-index-only",
      description: "Prospective machine-readable Gate evidence.",
      repairPolicyVersion: "1",
      repairPolicyDigest: computeRepairPolicyDigest(DEFAULT_REPAIR_POLICY),
      gates: [gate]
    };
    const head = structuredClone(base);
    head.gates[0].events.push(
      {
        type: "failure_attributed",
        at: "2026-07-15T13:04:00.000Z",
        evidence: evidence("issuecomment-5", "5"),
        attribution
      },
      {
        type: "repair_routed",
        at: "2026-07-15T13:05:00.000Z",
        evidence: evidence("issuecomment-6", "6"),
        repairAttempts: 0,
        route: routeGateFailure({
          scope,
          gateRisk: "C",
          attribution,
          repairAttempts: 0,
          policy: DEFAULT_REPAIR_POLICY
        })
      }
    );
    const rewritten = structuredClone(head);
    rewritten.gates[0].events[0].at = "2026-07-15T12:59:00.000Z";

    process.stdout.write(JSON.stringify({
      appendOnly: validateGateLedgerTransition(base, head, { policy: DEFAULT_REPAIR_POLICY }),
      rewritten: validateGateLedgerTransition(base, rewritten, { policy: DEFAULT_REPAIR_POLICY })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.appendOnly, { ok: true, errors: [] });
  assert.equal(output.rewritten.ok, false);
  assert.match(output.rewritten.errors.join("\n"), /event rewrite is forbidden/);
});

test("gate ledger derives retry attempts from immutable successor lineage", () => {
  const result = evaluateGovernanceModule(`
    import {
      DEFAULT_REPAIR_POLICY,
      computeGateScopeDigest,
      computeRepairPolicyDigest,
      routeGateFailure,
      validateGateLedger
    } from "./server/services/governance/gate-governance.mjs";

    const evidence = (reference, digit) => ({ reference, sha256: digit.repeat(64) });
    const scope = {
      allowedFiles: ["docs/example.md"],
      forbiddenActions: ["production_mutation"],
      validation: ["diff_check"]
    };
    const events = ({ gateId, lineageId, hour, attempts, digits, authority, successorGateId = null }) => {
      const attribution = {
        schemaVersion: "1",
        failureId: "failure-" + gateId,
        gateId,
        stage: "diff_check",
        category: "docs_metadata",
        failureRisk: "B",
        confidence: "high",
        affectedInvariants: ["documentation_contract"],
        evidenceRefs: ["issuecomment-" + digits[4]],
        observedAt: "2026-07-15T" + hour + ":04:00.000Z"
      };
      const authorization = {
        gateId,
        lineageId,
        authority,
        scopeDigest: computeGateScopeDigest(scope),
        sourceHead: "a".repeat(40),
        policyVersion: authority === "repair_policy" ? "1" : null
      };
      const values = [
        { type: "proposed", at: "2026-07-15T" + hour + ":00:00.000Z", evidence: evidence("issuecomment-" + digits[0], digits[0]) },
        { type: "approval_recorded", at: "2026-07-15T" + hour + ":01:00.000Z", evidence: evidence("issuecomment-" + digits[1], digits[1]), authorization },
        { type: "approval_consumed", at: "2026-07-15T" + hour + ":02:00.000Z", evidence: evidence("issuecomment-" + digits[1], digits[1]), authorization },
        {
          type: "terminal_blocked",
          at: "2026-07-15T" + hour + ":03:00.000Z",
          evidence: evidence("issuecomment-" + digits[3], digits[3]),
          reasonCode: "diff_check_failed",
          approvalState: "consumed",
          stateClaims: {
            sourceFilesChanged: false,
            commitCreated: false,
            pushPerformed: false,
            retainedLocalState: false,
            retainedStateDigest: null,
            productionMutation: false
          }
        },
        {
          type: "failure_attributed",
          at: attribution.observedAt,
          evidence: evidence("issuecomment-" + digits[4], digits[4]),
          attribution
        },
        {
          type: "repair_routed",
          at: "2026-07-15T" + hour + ":05:00.000Z",
          evidence: evidence("issuecomment-" + digits[5], digits[5]),
          repairAttempts: attempts,
          route: routeGateFailure({
            scope,
            gateRisk: "B",
            attribution,
            repairAttempts: attempts,
            policy: DEFAULT_REPAIR_POLICY
          })
        }
      ];
      if (successorGateId !== null) values.push({
        type: "successor_proposed",
        at: "2026-07-15T" + hour + ":06:00.000Z",
        evidence: evidence("issuecomment-" + digits[6], digits[6]),
        successorGateId
      });
      return values;
    };
    const rootGate = {
      id: "gate-root",
      lineageId: "gate-root",
      predecessorGateId: null,
      risk: "B",
      subject: {
        issue: 437,
        pullRequest: 499,
        purpose: "docs_repair",
        sourceHead: "a".repeat(40)
      },
      scope,
      scopeDigest: computeGateScopeDigest(scope),
      events: events({
        gateId: "gate-root",
        lineageId: "gate-root",
        hour: "10",
        attempts: 0,
        digits: ["1", "2", "2", "3", "4", "5", "6"],
        authority: "operator",
        successorGateId: "gate-successor"
      })
    };
    const successorGate = {
      id: "gate-successor",
      lineageId: "gate-root",
      predecessorGateId: "gate-root",
      risk: "B",
      subject: {
        issue: 437,
        pullRequest: 499,
        purpose: "docs_repair",
        sourceHead: "a".repeat(40)
      },
      scope,
      scopeDigest: computeGateScopeDigest(scope),
      events: events({
        gateId: "gate-successor",
        lineageId: "gate-root",
        hour: "11",
        attempts: 1,
        digits: ["7", "8", "8", "9", "a", "b", "c"],
        authority: "repair_policy"
      })
    };
    const valid = {
      schemaVersion: "1",
      authority: "evidence-index-only",
      description: "Prospective machine-readable Gate evidence.",
      repairPolicyVersion: "1",
      repairPolicyDigest: computeRepairPolicyDigest(DEFAULT_REPAIR_POLICY),
      gates: [rootGate, successorGate]
    };
    const expiredRecovery = structuredClone(valid);
    expiredRecovery.gates[0].events = [
      { type: "proposed", at: "2026-07-15T09:00:00.000Z", evidence: evidence("expired-root-proposal", "1") },
      {
        type: "expired",
        at: "2026-07-15T09:01:00.000Z",
        evidence: evidence("expired-root-receipt", "2"),
        reasonCode: "approval_window_expired"
      },
      {
        type: "successor_proposed",
        at: "2026-07-15T09:02:00.000Z",
        evidence: evidence("expired-successor-link", "3"),
        successorGateId: "gate-successor"
      }
    ];
    const expiredSuccessorAuthorization = {
      gateId: "gate-successor",
      lineageId: "gate-root",
      authority: "operator",
      scopeDigest: computeGateScopeDigest(scope),
      sourceHead: "a".repeat(40),
      policyVersion: null
    };
    expiredRecovery.gates[1].events = [
      { type: "proposed", at: "2026-07-15T09:03:00.000Z", evidence: evidence("expired-successor-proposal", "4") },
      { type: "approval_recorded", at: "2026-07-15T09:04:00.000Z", evidence: evidence("expired-successor-approval", "5"), authorization: expiredSuccessorAuthorization },
      { type: "approval_consumed", at: "2026-07-15T09:05:00.000Z", evidence: evidence("expired-successor-approval", "5"), authorization: expiredSuccessorAuthorization },
      {
        type: "terminal_passed",
        at: "2026-07-15T09:06:00.000Z",
        evidence: evidence("expired-successor-terminal", "6"),
        checks: [{ name: "diff_check", result: "passed" }],
        stateClaims: {
          sourceFilesChanged: false,
          commitCreated: false,
          pushPerformed: false,
          retainedLocalState: false,
          retainedStateDigest: null,
          productionMutation: false
        }
      }
    ];
    const resetBudget = structuredClone(valid);
    const routeEvent = resetBudget.gates[1].events.find((event) => event.type === "repair_routed");
    routeEvent.repairAttempts = 0;
    const attributionEvent = resetBudget.gates[1].events.find((event) => event.type === "failure_attributed");
    routeEvent.route = routeGateFailure({
      scope,
      gateRisk: "B",
      attribution: attributionEvent.attribution,
      repairAttempts: 0,
      policy: DEFAULT_REPAIR_POLICY
    });

    const riskDowngrade = structuredClone(valid);
    riskDowngrade.gates[1].risk = "C";
    const chronologyDrift = structuredClone(valid);
    chronologyDrift.gates[1].events[0].at = "2026-07-15T10:05:30.000Z";
    const traversal = structuredClone(valid);
    traversal.gates[1].scope.allowedFiles = ["../../production/**"];
    traversal.gates[1].scopeDigest = computeGateScopeDigest(traversal.gates[1].scope);
    const wildcard = structuredClone(valid);
    wildcard.gates[1].scope.allowedFiles = ["server/**"];
    wildcard.gates[1].scopeDigest = computeGateScopeDigest(wildcard.gates[1].scope);
    const gitControlPath = structuredClone(valid);
    gitControlPath.gates[1].scope.allowedFiles = [".git/config"];
    gitControlPath.gates[1].scopeDigest = computeGateScopeDigest(gitControlPath.gates[1].scope);
    const purposeDrift = structuredClone(valid);
    purposeDrift.gates[1].subject.purpose = "different_repair";
    const rootReset = structuredClone(valid);
    rootReset.gates.push({
      id: "gate-reset",
      lineageId: "gate-reset",
      predecessorGateId: null,
      risk: "B",
      subject: {
        issue: 437,
        pullRequest: 499,
        purpose: "docs_repair",
        sourceHead: "c".repeat(40)
      },
      scope,
      scopeDigest: computeGateScopeDigest(scope),
      events: [
        {
          type: "proposed",
          at: "2026-07-15T12:00:00.000Z",
          evidence: evidence("issuecomment-root-reset", "d")
        }
      ]
    });

    process.stdout.write(JSON.stringify({
      valid: validateGateLedger(valid, { policy: DEFAULT_REPAIR_POLICY }),
      expiredRecovery: validateGateLedger(expiredRecovery, { policy: DEFAULT_REPAIR_POLICY }),
      resetBudget: validateGateLedger(resetBudget, { policy: DEFAULT_REPAIR_POLICY }),
      riskDowngrade: validateGateLedger(riskDowngrade, { policy: DEFAULT_REPAIR_POLICY }),
      chronologyDrift: validateGateLedger(chronologyDrift, { policy: DEFAULT_REPAIR_POLICY }),
      traversal: validateGateLedger(traversal, { policy: DEFAULT_REPAIR_POLICY }),
      wildcard: validateGateLedger(wildcard, { policy: DEFAULT_REPAIR_POLICY }),
      gitControlPath: validateGateLedger(gitControlPath, { policy: DEFAULT_REPAIR_POLICY }),
      purposeDrift: validateGateLedger(purposeDrift, { policy: DEFAULT_REPAIR_POLICY }),
      rootReset: validateGateLedger(rootReset, { policy: DEFAULT_REPAIR_POLICY })
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.valid, { ok: true, errors: [] });
  assert.deepEqual(output.expiredRecovery, { ok: true, errors: [] });
  assert.equal(output.resetBudget.ok, false);
  assert.match(output.resetBudget.errors.join("\n"), /repairAttempts.*successor lineage/);
  assert.match(output.riskDowngrade.errors.join("\n"), /successor risk downgrade is forbidden/);
  assert.match(output.chronologyDrift.errors.join("\n"), /successor chronology/);
  assert.match(output.traversal.errors.join("\n"), /allowedFiles.*repo-relative/);
  assert.match(output.wildcard.errors.join("\n"), /allowedFiles.*repo-relative/);
  assert.match(output.gitControlPath.errors.join("\n"), /allowedFiles.*repo-relative/);
  assert.match(output.purposeDrift.errors.join("\n"), /successor subject continuity/);
  assert.match(output.rootReset.errors.join("\n"), /root subject already has a Gate lineage/);
});

test("repository publishes strict governance schemas, policy, and a prospective-only ledger", () => {
  const paths = [
    "schemas/failure-attribution-v1.schema.json",
    "schemas/gate-ledger-v1.schema.json",
    "schemas/repair-policy-v1.schema.json",
    "project-state/repair-policy.json",
    "project-state/gates.json",
    "scripts/check-gate-governance.mjs"
  ];
  for (const path of paths) {
    assert.equal(existsSync(resolve(REPOSITORY_ROOT, path)), true, `missing ${path}`);
  }

  const schemas = paths.slice(0, 3).map((path) => JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, path), "utf8")));
  for (const schema of schemas) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.equal(schema.additionalProperties, false);
  }

  const result = evaluateGovernanceModule(`
    import { readFileSync } from "node:fs";
    import {
      computeRepairPolicyDigest,
      validateGateLedger,
      validateRepairPolicy
    } from "./server/services/governance/gate-governance.mjs";

    const policy = JSON.parse(readFileSync("project-state/repair-policy.json", "utf8"));
    const ledger = JSON.parse(readFileSync("project-state/gates.json", "utf8"));
    process.stdout.write(JSON.stringify({
      policy: validateRepairPolicy(policy),
      ledger: validateGateLedger(ledger, { policy }),
      gateCount: ledger.gates.length,
      authority: ledger.authority,
      versionsMatch: ledger.repairPolicyVersion === policy.schemaVersion,
      digestMatches: ledger.repairPolicyDigest === computeRepairPolicyDigest(policy)
    }));
  `);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.policy, { ok: true, errors: [] });
  assert.deepEqual(output.ledger, { ok: true, errors: [] });
  assert.equal(output.gateCount, 0);
  assert.equal(output.authority, "evidence-index-only");
  assert.equal(output.versionsMatch, true);
  assert.equal(output.digestMatches, true);
});

test("governance CLI validates snapshots and fails closed on incomplete invocation", () => {
  const run = (...args) => spawnSync(
    process.execPath,
    ["scripts/check-gate-governance.mjs", ...args],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" }
  );

  const snapshot = run("--snapshot");
  assert.equal(snapshot.status, 0, snapshot.stderr);
  assert.match(snapshot.stdout, /Gate governance validation passed/);

  const bootstrap = run("--base-state-missing");
  assert.equal(bootstrap.status, 0, bootstrap.stderr);

  const exactBase = run(
    "--base-gates-file",
    "project-state/gates.json",
    "--base-policy-file",
    "project-state/repair-policy.json"
  );
  assert.equal(exactBase.status, 0, exactBase.stderr);

  const trustedCandidate = run(
    "--head-gates-file",
    "project-state/gates.json",
    "--head-policy-file",
    "project-state/repair-policy.json",
    "--base-gates-file",
    "project-state/gates.json",
    "--base-policy-file",
    "project-state/repair-policy.json"
  );
  assert.equal(trustedCandidate.status, 0, trustedCandidate.stderr);

  const incomplete = run("--base-gates-file");
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /gate_governance_arguments_invalid/);
});

test("repository documents the bounded repair and escalation contract", () => {
  const packageJson = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"));
  const workflow = readFileSync(resolve(REPOSITORY_ROOT, "docs/GITHUB_ISSUE_PR_WORKFLOW.md"), "utf8");
  const baseline = readFileSync(resolve(REPOSITORY_ROOT, "docs/VALIDATION_BASELINE.md"), "utf8");

  assert.equal(
    packageJson.scripts["governance:check"],
    "node scripts/check-gate-governance.mjs --snapshot"
  );
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
    writeFileSync(
      resolve(rootDir, "project-state/gates.json"),
      JSON.stringify({ note: "token=unit-test-secret" })
    );
    writeFileSync(
      resolve(rootDir, "project-state/repair-policy.json"),
      readFileSync(resolve(REPOSITORY_ROOT, "project-state/repair-policy.json"), "utf8")
    );

    const { checkProjectState } = await import("../../scripts/check-project-state.mjs");
    const result = checkProjectState({ rootDir });
    assert.match(
      result.errors.join("\n"),
      /project-state\/gates\.json:1: raw secret pattern matched \(token\)/
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
