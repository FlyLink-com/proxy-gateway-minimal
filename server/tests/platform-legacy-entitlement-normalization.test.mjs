import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_ENTITLEMENT_NORMALIZATION_POLICY,
  buildLegacyEntitlementNormalizationInventory,
  buildLegacyEntitlementNormalizationPlan,
  classifyLegacyEntitlementNormalizationCase,
  dryRunLegacyEntitlementNormalization,
  listLegacyEntitlementNormalizationCaseReasons,
  parseLegacyEntitlementNormalizationSnapshot,
  serializeLegacyEntitlementNormalizationSnapshot
} from "../services/platform/legacy-entitlement-normalization.mjs";

const CASE_REFS = Object.freeze({
  noService: "a".repeat(64),
  uniqueNoAuthority: "b".repeat(64),
  uniqueAuthority: "c".repeat(64),
  multiple: "d".repeat(64),
  lapsed: "e".repeat(64),
  inflight: "f".repeat(64)
});

function caseRecord(caseRef, overrides = {}) {
  return {
    caseRef,
    accountState: "active",
    serviceChainState: "unique_current_exact",
    authorityState: "none",
    commerceState: "clear",
    runtimeState: "verified",
    identityState: "unique",
    ...overrides
  };
}

function snapshot(cases) {
  return {
    schemaVersion: "1",
    snapshotType: "aggregate_case_snapshot",
    observedAt: "2026-08-13T00:00:00.000Z",
    sourceCommit: "2492515eadf254bd0d20001e3d03219edec16c57",
    cases
  };
}

test("legacy normalization policy fixes the target annual offer but leaves transition timing unresolved", () => {
  assert.deepEqual(LEGACY_ENTITLEMENT_NORMALIZATION_POLICY, {
    policyId: "legacy_entitlement_normalization_plan_v1",
    targetOfferRef: "offer_plan_365d_200gb_monthly",
    targetOfferVersionRef: "offerv_plan_365d_200gb_monthly_v1",
    targetDurationDays: 365,
    targetMonthlyTrafficGb: 200,
    targetTrafficLimitBytes: 200 * 1024 ** 3,
    targetPortalPlan: "yearly",
    migrationScope: "current_service_only",
    validUntilStrategy: "operator_must_specify",
    cycleAnchorStrategy: "operator_must_specify"
  });
});

test("classification is fail-closed and never auto-selects a legacy resource chain", () => {
  assert.equal(classifyLegacyEntitlementNormalizationCase(caseRecord(CASE_REFS.uniqueNoAuthority)), "requires_explicit_authority_assignment");
  assert.equal(classifyLegacyEntitlementNormalizationCase(caseRecord(CASE_REFS.uniqueAuthority, { authorityState: "exact" })), "requires_explicit_transition_contract");
  assert.equal(classifyLegacyEntitlementNormalizationCase(caseRecord(CASE_REFS.multiple, { serviceChainState: "multiple_current_exact" })), "requires_explicit_canonical_chain");
  assert.equal(classifyLegacyEntitlementNormalizationCase(caseRecord(CASE_REFS.lapsed, { serviceChainState: "lapsed_only" })), "blocked_lapsed_only");
  assert.equal(classifyLegacyEntitlementNormalizationCase(caseRecord(CASE_REFS.inflight, { commerceState: "inflight_or_reconciliation" })), "blocked_inflight_commerce_or_reconciliation");
});

test("aggregate reasons retain overlapping blockers even though a primary classification remains deterministic", () => {
  const overlapping = caseRecord(CASE_REFS.multiple, {
    serviceChainState: "multiple_current_exact",
    authorityState: "drift",
    runtimeState: "unverified_or_drift"
  });
  assert.equal(classifyLegacyEntitlementNormalizationCase(overlapping), "blocked_runtime_or_identity_unverified");
  assert.deepEqual(listLegacyEntitlementNormalizationCaseReasons(overlapping), [
    "blocked_runtime_or_identity_unverified",
    "requires_explicit_canonical_chain",
    "blocked_authority_drift"
  ]);

  const inventory = buildLegacyEntitlementNormalizationInventory(snapshot([overlapping]));
  assert.equal(inventory.counts.blockedRuntimeOrIdentityUnverified, 1);
  assert.equal(inventory.reasonCounts.blocked_runtime_or_identity_unverified, 1);
  assert.equal(inventory.reasonCounts.requires_explicit_canonical_chain, 1);
  assert.equal(inventory.reasonCounts.blocked_authority_drift, 1);
});

test("zero-service accounts remain no-op and do not bootstrap an entitlement or authority", () => {
  const classification = classifyLegacyEntitlementNormalizationCase(caseRecord(CASE_REFS.noService, {
    serviceChainState: "none",
    authorityState: "not_applicable",
    runtimeState: "not_applicable"
  }));
  assert.equal(classification, "no_service_noop");
});

test("inventory is aggregate-only and produces no selectable target", () => {
  const inventory = buildLegacyEntitlementNormalizationInventory(snapshot([
    caseRecord(CASE_REFS.noService, {
      serviceChainState: "none",
      authorityState: "not_applicable",
      runtimeState: "not_applicable"
    }),
    caseRecord(CASE_REFS.uniqueNoAuthority),
    caseRecord(CASE_REFS.uniqueAuthority, { authorityState: "exact" }),
    caseRecord(CASE_REFS.multiple, { serviceChainState: "multiple_current_exact" }),
    caseRecord(CASE_REFS.lapsed, { serviceChainState: "lapsed_only" }),
    caseRecord(CASE_REFS.inflight, { commerceState: "inflight_or_reconciliation" })
  ]));

  assert.equal(inventory.counts.totalCases, 6);
  assert.equal(inventory.counts.noServiceNoop, 1);
  assert.equal(inventory.counts.requiresExplicitAuthorityAssignment, 1);
  assert.equal(inventory.counts.requiresExplicitTransitionContract, 1);
  assert.equal(inventory.counts.requiresExplicitCanonicalChain, 1);
  assert.equal(inventory.counts.blockedLapsedOnly, 1);
  assert.equal(inventory.counts.blockedInflightCommerceOrReconciliation, 1);
  assert.equal(inventory.counts.manualReviewRequired, 5);
  assert.match(inventory.snapshotDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(inventory).includes(CASE_REFS.uniqueNoAuthority), false);
});

test("plan and dry-run have stable digests and hard-zero all mutations", () => {
  const input = snapshot([caseRecord(CASE_REFS.uniqueNoAuthority)]);
  const first = buildLegacyEntitlementNormalizationPlan(input);
  const second = buildLegacyEntitlementNormalizationPlan({
    sourceCommit: input.sourceCommit,
    observedAt: input.observedAt,
    schemaVersion: input.schemaVersion,
    cases: input.cases,
    snapshotType: input.snapshotType
  });
  const dryRun = dryRunLegacyEntitlementNormalization(input);

  assert.equal(first.planDigest, second.planDigest);
  assert.deepEqual(first.plan.decisions, {
    autoSelectedChains: 0,
    plannedAssignments: 0,
    plannedTransitions: 0,
    zeroServiceResourceCreations: 0,
    coinsEffects: 0,
    commerceOrderEffects: 0,
    fulfillmentEffects: 0
  });
  assert.equal(dryRun.dryRunVerified, true);
});

test("plan digest binds the opaque snapshot and every overlapping blocker count", () => {
  const first = snapshot([caseRecord(CASE_REFS.multiple, {
    serviceChainState: "multiple_current_exact"
  })]);
  const second = snapshot([caseRecord(CASE_REFS.multiple, {
    serviceChainState: "multiple_current_exact",
    authorityState: "drift"
  })]);
  const firstPlan = buildLegacyEntitlementNormalizationPlan(first);
  const secondPlan = buildLegacyEntitlementNormalizationPlan(second);

  assert.equal(firstPlan.counts.requiresExplicitCanonicalChain, 1);
  assert.equal(secondPlan.counts.requiresExplicitCanonicalChain, 1);
  assert.equal(firstPlan.reasonCounts.blocked_authority_drift, 0);
  assert.equal(secondPlan.reasonCounts.blocked_authority_drift, 1);
  assert.notEqual(firstPlan.snapshotDigest, secondPlan.snapshotDigest);
  assert.notEqual(firstPlan.planDigest, secondPlan.planDigest);
  assert.equal(firstPlan.plan.snapshotDigest, firstPlan.snapshotDigest);
  assert.deepEqual(firstPlan.plan.reasonCounts, firstPlan.reasonCounts);
});

test("snapshot contract rejects identifiers, duplicate cases, and inconsistent zero-service records", () => {
  const valid = snapshot([caseRecord(CASE_REFS.uniqueNoAuthority)]);
  assert.throws(() => serializeLegacyEntitlementNormalizationSnapshot({
    ...valid,
    cases: [{ ...valid.cases[0], caseRef: "account@example.com" }]
  }), /legacy_entitlement_normalization_case_ref_invalid/);
  assert.throws(() => serializeLegacyEntitlementNormalizationSnapshot({
    ...valid,
    cases: [valid.cases[0], valid.cases[0]]
  }), /legacy_entitlement_normalization_duplicate_case_ref/);
  assert.throws(() => serializeLegacyEntitlementNormalizationSnapshot(snapshot([
    caseRecord(CASE_REFS.noService, { serviceChainState: "none", authorityState: "none", runtimeState: "not_applicable" })
  ])), /legacy_entitlement_normalization_case_inconsistent/);
});

test("canonical snapshots round-trip and reject reordered bytes", () => {
  const bytes = serializeLegacyEntitlementNormalizationSnapshot(snapshot([caseRecord(CASE_REFS.uniqueNoAuthority)]));
  const parsed = parseLegacyEntitlementNormalizationSnapshot(bytes);
  assert.equal(parsed.cases.length, 1);
  assert.throws(() => parseLegacyEntitlementNormalizationSnapshot(Buffer.from(
    '{"snapshotType":"aggregate_case_snapshot","schemaVersion":"1","observedAt":"2026-08-13T00:00:00.000Z","sourceCommit":"2492515eadf254bd0d20001e3d03219edec16c57","cases":[]}'
  )), /canonical_json_bytes_mismatch/);
});
