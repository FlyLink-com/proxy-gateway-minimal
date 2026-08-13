import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as executionState from "../services/platform/legacy-entitlement-normalization-execution-state.mjs";

import {
  LEGACY_ENTITLEMENT_NORMALIZATION_POLICY,
  buildLegacyEntitlementNormalizationPlan,
  deriveLegacyEntitlementNormalizationRemoteHandoffScopeDigest,
  digestLegacyEntitlementNormalizationCase
} from "../services/platform/legacy-entitlement-normalization.mjs";
import {
  createLegacyEntitlementNormalizationExecutionManifest,
  deriveLegacyEntitlementNormalizationBarrierGenerationDigest,
  deriveLegacyEntitlementNormalizationExecutionIntentDigest,
  deriveLegacyEntitlementNormalizationRuntimeAttestationDigest,
  evaluateLegacyEntitlementNormalizationExecutionPreflight,
  summarizeLegacyEntitlementNormalizationExecutionManifest,
  validateLegacyEntitlementNormalizationExecutionManifestAgainstSnapshot,
  serializeLegacyEntitlementNormalizationExecutionPreflightReceipt
} from "../services/platform/legacy-entitlement-normalization-execution-state.mjs";

const SOURCE_COMMIT = "2492515eadf254bd0d20001e3d03219edec16c57";
const CASE_REF = "b".repeat(64);
const EVALUATED_AT = "2026-08-13T12:00:00.000Z";

function digest(char) {
  return char.repeat(64);
}

function remoteHandoffPreflight(overrides = {}) {
  return {
    scopeKind: "remote_handoff",
    scopeDigest: digest("1"),
    desiredState: "current",
    notification: "current_applied",
    lease: "active_current",
    receipt: "current_applied_listener_ready",
    ...overrides
  };
}

function caseRecord(overrides = {}) {
  const base = {
    caseRef: CASE_REF,
    sourceBindingDigest: digest("0"),
    accountState: "active",
    serviceChainState: "unique_current_exact",
    authorityState: "none",
    commerceState: "clear",
    runtimeState: "verified",
    runtimePreflight: remoteHandoffPreflight(),
    identityState: "unique"
  };
  return {
    ...base,
    ...overrides,
    runtimePreflight: {
      ...base.runtimePreflight,
      ...(overrides.runtimePreflight ?? {})
    }
  };
}

function snapshot(cases = [caseRecord()]) {
  return {
    schemaVersion: "1",
    snapshotType: "aggregate_case_snapshot",
    observedAt: "2026-08-13T11:55:00.000Z",
    sourceCommit: SOURCE_COMMIT,
    cases
  };
}

function intentFor(input, overrides = {}) {
  const plan = buildLegacyEntitlementNormalizationPlan(input);
  return {
    schemaVersion: "1",
    intentType: "private_execution_intent_binding",
    sourceCommit: input.sourceCommit,
    policyId: "legacy_entitlement_normalization_plan_v1",
    snapshotDigest: plan.snapshotDigest,
    planDigest: plan.planDigest,
    executionManifestDigest: null,
    transitionContractDigest: null,
    issuedAt: "2026-08-13T11:59:00.000Z",
    expiresAt: "2026-08-13T12:30:00.000Z",
    maxCases: 5,
    ...overrides
  };
}

function privateEntry(caseRef = CASE_REF, overrides = {}) {
  return {
    caseRef,
    accountRef: "account_private_0001",
    resourceRequestRef: "request_private_0001",
    entitlementRef: "entitlement_private_0001",
    issuedLinkRef: "issued_link_private_0001",
    authorityAction: "assign_initial",
    expectedAuthorityRef: null,
    expectedAuthorityVersion: 0,
    expectedAuthorityHistoryCount: 0,
    sourceBindingDigest: digest("0"),
    preconditionDigest: digestLegacyEntitlementNormalizationCase(caseRecord()),
    transition: {
      validFrom: "2026-08-13T12:00:00.000Z",
      validUntil: "2027-08-13T12:00:00.000Z",
      cycleAnchorAt: "2026-08-13T12:00:00.000Z",
      targetOfferVersionRef: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetOfferVersionRef,
      targetDurationDays: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetDurationDays,
      targetMonthlyTrafficGb: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetMonthlyTrafficGb,
      targetTrafficLimitBytes: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetTrafficLimitBytes,
      targetPortalPlan: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetPortalPlan,
      resourceAction: "reuse_existing_canonical_triad",
      commerceAction: "none"
    },
    ...overrides
  };
}

function manifestBoundInput(input) {
  const manifest = createLegacyEntitlementNormalizationExecutionManifest({
    snapshot: input,
    entries: [privateEntry()]
  });
  return {
    manifest,
    intent: intentFor(input, {
      executionManifestDigest: manifest.manifestDigest,
      transitionContractDigest: manifest.manifestDigest
    })
  };
}

function preflightFor(input, {
  intent: suppliedIntent,
  manifest = null,
  barrier: barrierOverrides = {},
  backups: backupsOverrides = {},
  runtime: runtimeOverrides = {},
  caseReviews: suppliedCaseReviews,
  evaluatedAt = EVALUATED_AT,
  ...overrides
} = {}) {
  const intent = suppliedIntent ?? intentFor(input);
  const intentDigest = deriveLegacyEntitlementNormalizationExecutionIntentDigest(intent);
  const scopeDigest = deriveLegacyEntitlementNormalizationRemoteHandoffScopeDigest(input);
  const manifestEntriesByCaseRef = new Map((manifest?.entries ?? []).map((entry) => [entry.caseRef, entry]));
  const defaultBarrier = {
    state: "held",
    intentDigest,
    scopeDigest,
    generation: 1,
    generationDigest: null,
    verifiedAt: "2026-08-13T11:59:30.000Z",
    expiresAt: "2026-08-13T12:20:00.000Z",
    walletOperationsStarted: 0,
    activeQuotes: 0,
    activeHolds: 0,
    nonterminalCommerceOrders: 0,
    paymentWritesInFlight: 0,
    fulfillmentWritesInFlight: 0
  };
  const barrier = {
    ...defaultBarrier,
    ...barrierOverrides
  };
  barrier.generationDigest = Object.hasOwn(barrierOverrides, "generationDigest")
    ? barrierOverrides.generationDigest
    : deriveLegacyEntitlementNormalizationBarrierGenerationDigest(barrier);
  const defaultRuntime = scopeDigest === null
    ? {
      state: "not_applicable",
      intentDigest,
      scopeDigest: null,
      desiredStateDigest: null,
      notificationDigest: null,
      leaseDigest: null,
      receiptDigest: null,
      identityGateDigest: null,
      attestationDigest: null,
      verifiedAt: "2026-08-13T11:59:30.000Z"
    }
    : {
      state: "verified_exact",
      intentDigest,
      scopeDigest,
      desiredStateDigest: digest("7"),
      notificationDigest: digest("8"),
      leaseDigest: digest("9"),
      receiptDigest: digest("a"),
      identityGateDigest: digest("c"),
      attestationDigest: null,
      verifiedAt: "2026-08-13T11:59:30.000Z"
    };
  const runtime = {
    ...defaultRuntime,
    ...runtimeOverrides
  };
  runtime.attestationDigest = Object.hasOwn(runtimeOverrides, "attestationDigest")
    ? runtimeOverrides.attestationDigest
    : runtime.state === "verified_exact"
      ? deriveLegacyEntitlementNormalizationRuntimeAttestationDigest(runtime)
      : null;
  const base = {
    schemaVersion: "1",
    preflightType: "aggregate_execution_preflight",
    evaluatedAt,
    intent,
    intentDigest,
    barrier,
    backups: {
      state: "paired_verified",
      intentDigest,
      controlBackupDigest: digest("4"),
      runtimeBackupDigest: digest("5"),
      restoreProofDigest: digest("6"),
      verifiedAt: "2026-08-13T11:59:30.000Z"
    },
    runtime,
    caseReviews: input.cases.map((entry) => ({
      caseRef: entry.caseRef,
      sourceCaseDigest: digestLegacyEntitlementNormalizationCase(entry),
      sourceBindingDigest: entry.sourceBindingDigest,
      intentDigest: manifestEntriesByCaseRef.has(entry.caseRef) ? intentDigest : null,
      executionManifestDigest: manifestEntriesByCaseRef.has(entry.caseRef) ? intent.executionManifestDigest : null,
      operationRef: manifestEntriesByCaseRef.get(entry.caseRef)?.operationRef ?? null,
      state: manifestEntriesByCaseRef.has(entry.caseRef) ? "bound_for_external_review" : "not_required",
      resolutionDigest: manifestEntriesByCaseRef.has(entry.caseRef) ? intent.transitionContractDigest : null,
      reviewedAt: manifestEntriesByCaseRef.has(entry.caseRef) ? "2026-08-13T11:59:30.000Z" : null,
      expiresAt: manifestEntriesByCaseRef.has(entry.caseRef) ? "2026-08-13T12:20:00.000Z" : null
    }))
  };
  return {
    ...base,
    ...overrides,
    backups: { ...base.backups, ...backupsOverrides },
    caseReviews: suppliedCaseReviews ?? base.caseReviews
  };
}

test("all bound aggregate claims yield only a separate Risk A candidate with zero effects", () => {
  const input = snapshot();
  const { manifest, intent } = manifestBoundInput(input);
  const receipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: input, manifest, preflight: preflightFor(input, { intent, manifest }) },
    { evaluatedAt: EVALUATED_AT }
  );

  assert.equal(receipt.state, "candidate_for_separate_risk_a");
  assert.equal(receipt.aggregateOnly, true);
  assert.equal(receipt.executionAllowed, false);
  assert.equal(receipt.sourceChanged, false);
  assert.equal(receipt.externalRiskAGateRequired, true);
  assert.equal(receipt.attestationClaimsOnly, true);
  assert.deepEqual(receipt.effects, {
    authorityAssignments: 0,
    entitlementTransitions: 0,
    resourceRetirements: 0,
    coinsEffects: 0,
    commerceOrderEffects: 0,
    fulfillmentEffects: 0,
    runtimeEffects: 0
  });
  const serialized = serializeLegacyEntitlementNormalizationExecutionPreflightReceipt(receipt).toString("utf8");
  assert.equal(serialized.includes(CASE_REF), false);
  assert.equal(serialized.includes("private_execution_intent_binding"), false);
});

test("intent, barrier, backup, runtime, and case binding drift all fail closed", () => {
  const input = snapshot();
  const { manifest, intent } = manifestBoundInput(input);
  const cases = [
    preflightFor(input, { manifest, intent: { ...intent, sourceCommit: "0".repeat(40) } }),
    preflightFor(input, { manifest, intent, barrier: { state: "not_held" } }),
    preflightFor(input, { manifest, intent, backups: { state: "not_verified" } }),
    preflightFor(input, {
      manifest,
      intent,
      runtime: {
        state: "not_verified",
        scopeDigest: null,
        desiredStateDigest: null,
        notificationDigest: null,
        leaseDigest: null,
        receiptDigest: null,
        identityGateDigest: null
      }
    }),
    preflightFor(input, {
      manifest,
      intent,
      caseReviews: [{
        ...preflightFor(input, { manifest, intent }).caseReviews[0],
        sourceCaseDigest: digest("e")
      }]
    }),
    preflightFor(input, {
      manifest,
      intent,
      caseReviews: [{
        ...preflightFor(input, { manifest, intent }).caseReviews[0],
        sourceBindingDigest: digest("e")
      }]
    }),
    preflightFor(input, {
      manifest,
      intent,
      caseReviews: [{
        ...preflightFor(input, { manifest, intent }).caseReviews[0],
        operationRef: digest("e")
      }]
    })
  ];

  for (const preflight of cases) {
    const receipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
      { snapshot: input, manifest, preflight },
      { evaluatedAt: EVALUATED_AT }
    );
    assert.equal(receipt.state, "blocked");
    assert.equal(receipt.counts.blockedGlobal, 1);
    assert.equal(receipt.counts.candidateForSeparateRiskA, 0);
  }
});

test("invalid barrier declarations and non-annual manifest transitions are rejected", () => {
  const input = snapshot();
  const { manifest, intent } = manifestBoundInput(input);
  assert.throws(() => evaluateLegacyEntitlementNormalizationExecutionPreflight(
    {
      snapshot: input,
      manifest,
      preflight: preflightFor(input, {
        intent,
        manifest,
        barrier: { generationDigest: digest("f") }
      })
    },
    { evaluatedAt: EVALUATED_AT }
  ), /legacy_entitlement_normalization_execution_barrier_invalid/);

  assert.throws(() => createLegacyEntitlementNormalizationExecutionManifest({
    snapshot: input,
    entries: [privateEntry(CASE_REF, {
      transition: {
        ...privateEntry().transition,
        validUntil: "2026-08-14T12:00:00.000Z"
      }
    })]
  }), /legacy_entitlement_normalization_execution_transition_invalid/);

  assert.throws(() => createLegacyEntitlementNormalizationExecutionManifest({
    snapshot: input,
    entries: [privateEntry(CASE_REF, {
      transition: {
        ...privateEntry().transition,
        cycleAnchorAt: "2026-08-13T12:00:01.000Z"
      }
    })]
  }), /legacy_entitlement_normalization_execution_transition_invalid/);
});

test("stale preflight and nonzero writes remain blocked even when the case review is bound", () => {
  const input = snapshot();
  const { manifest, intent } = manifestBoundInput(input);
  const stale = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: input, manifest, preflight: preflightFor(input, { intent, manifest, evaluatedAt: "2026-08-13T12:31:00.000Z" }) },
    { evaluatedAt: "2026-08-13T12:31:00.000Z" }
  );
  const nonzeroWrites = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: input, manifest, preflight: preflightFor(input, { intent, manifest, barrier: { activeHolds: 1 } }) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(stale.state, "blocked");
  assert.equal(nonzeroWrites.state, "blocked");
});

test("time bindings reject a snapshot from after the intent or after evaluation", () => {
  const lateSnapshot = snapshot();
  lateSnapshot.observedAt = "2026-08-13T12:01:00.000Z";
  const lateIntent = intentFor(lateSnapshot, {
    issuedAt: "2026-08-13T12:00:00.000Z",
    expiresAt: "2026-08-13T12:30:00.000Z"
  });
  const lateReceipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: lateSnapshot, preflight: preflightFor(lateSnapshot, { intent: lateIntent }) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(lateReceipt.state, "blocked");
  assert.equal(lateReceipt.checks.snapshotFresh, false);

  const input = snapshot();
  const { manifest, intent } = manifestBoundInput(input);
  const preflight = preflightFor(input, { intent, manifest });
  assert.throws(() => evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: input, manifest, preflight },
    { evaluatedAt: "2026-08-13T12:01:00.000Z" }
  ), /legacy_entitlement_normalization_execution_evaluated_at_mismatch/);
});

test("hard blockers cannot be cleared by a bound external review and multi-chain remains review only", () => {
  const lapsed = snapshot([caseRecord({ serviceChainState: "lapsed_only" })]);
  const lapsedReceipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: lapsed, preflight: preflightFor(lapsed) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(lapsedReceipt.state, "blocked");
  assert.equal(lapsedReceipt.counts.blockedCase, 1);

  const multiple = snapshot([caseRecord({ serviceChainState: "multiple_current_exact" })]);
  const multipleReceipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: multiple, preflight: preflightFor(multiple) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(multipleReceipt.state, "review_required");
  assert.equal(multipleReceipt.counts.reviewRequired, 1);
});

test("zero-service snapshot remains no_action and remote scope binding is exact", () => {
  const noService = snapshot([caseRecord({
    serviceChainState: "none",
    authorityState: "not_applicable",
    runtimeState: "not_applicable",
    runtimePreflight: {
      scopeKind: "not_applicable",
      scopeDigest: null,
      desiredState: "not_applicable",
      notification: "not_applicable",
      lease: "not_applicable",
      receipt: "not_applicable"
    }
  })]);
  const noServiceReceipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: noService, preflight: preflightFor(noService) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(noServiceReceipt.state, "no_action");
  assert.equal(noServiceReceipt.counts.noServiceNoop, 1);

  const noServiceWithBrokenBarrier = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: noService, preflight: preflightFor(noService, { barrier: { state: "not_held" } }) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(noServiceWithBrokenBarrier.state, "blocked");
  assert.equal(noServiceWithBrokenBarrier.counts.blockedGlobal, 1);

  const input = snapshot();
  const { manifest, intent } = manifestBoundInput(input);
  const receipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    {
      snapshot: input,
      manifest,
      preflight: preflightFor(input, {
        intent,
        manifest,
        runtime: { scopeDigest: digest("f") }
      })
    },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(receipt.state, "blocked");
});

test("private execution intent manifest is deterministic, bound, and never exposes entries in its summary", () => {
  const input = snapshot();
  const { manifest } = manifestBoundInput(input);
  const validation = validateLegacyEntitlementNormalizationExecutionManifestAgainstSnapshot({
    manifest,
    snapshot: input
  });
  const summary = summarizeLegacyEntitlementNormalizationExecutionManifest(manifest);
  assert.equal(validation.valid, true);
  assert.equal(validation.executionAllowed, false);
  assert.equal(summary.manifestDigest, manifest.manifestDigest);
  assert.equal(JSON.stringify(summary).includes("account_private_0001"), false);
  assert.equal(JSON.stringify(summary).includes(CASE_REF), false);
  assert.equal("serializeLegacyEntitlementNormalizationExecutionManifest" in executionState, false);
  assert.equal("parseLegacyEntitlementNormalizationExecutionManifest" in executionState, false);

  assert.throws(() => validateLegacyEntitlementNormalizationExecutionManifestAgainstSnapshot({
    manifest: {
      ...manifest,
      manifestDigest: digest("f")
    },
    snapshot: input
  }), /legacy_entitlement_normalization_execution_manifest_binding_invalid/);
});

test("an unlisted transition case remains review-only when no private manifest binds it", () => {
  const input = snapshot([caseRecord({ authorityState: "exact" })]);
  const intent = intentFor(input, { executionManifestDigest: null });
  const receipt = evaluateLegacyEntitlementNormalizationExecutionPreflight(
    { snapshot: input, preflight: preflightFor(input, { intent }) },
    { evaluatedAt: EVALUATED_AT }
  );
  assert.equal(receipt.state, "review_required");
  assert.equal(receipt.checks.executionManifestBound, true);
  assert.equal(receipt.counts.reviewRequired, 1);
});

test("execution-state has only the two source-only static imports", () => {
  const source = readFileSync(
    new URL("../services/platform/legacy-entitlement-normalization-execution-state.mjs", import.meta.url),
    "utf8"
  );
  const imports = [...source.matchAll(/from "([^"]+)";/g)].map((match) => match[1]);
  assert.deepEqual(imports, [
    "../deployment/canonical-json.mjs",
    "./legacy-entitlement-normalization.mjs"
  ]);
});
