import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../deployment/canonical-json.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const LEGACY_ENTITLEMENT_NORMALIZATION_POLICY = Object.freeze({
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

const ACCOUNT_STATES = new Set(["active", "inactive_or_unknown"]);
const SERVICE_CHAIN_STATES = new Set([
  "none",
  "unique_current_exact",
  "multiple_current_exact",
  "lapsed_only",
  "future_or_effect_backed",
  "partial_or_inconsistent"
]);
const AUTHORITY_STATES = new Set([
  "not_applicable",
  "none",
  "exact",
  "conflict",
  "drift",
  "version_changed"
]);
const COMMERCE_STATES = new Set(["clear", "inflight_or_reconciliation"]);
const RUNTIME_STATES = new Set(["not_applicable", "verified", "unverified_or_drift"]);
const IDENTITY_STATES = new Set(["unique", "duplicate_or_ambiguous"]);

export const NORMALIZATION_CLASSIFICATIONS = Object.freeze([
  "no_service_noop",
  "requires_explicit_canonical_chain",
  "requires_explicit_authority_assignment",
  "requires_explicit_transition_contract",
  "blocked_account_inactive_or_unknown",
  "blocked_duplicate_login_identity",
  "blocked_inflight_commerce_or_reconciliation",
  "blocked_lapsed_only",
  "blocked_future_or_effect_backed_chain",
  "blocked_partial_or_inconsistent_chain",
  "blocked_authority_conflict",
  "blocked_authority_drift",
  "blocked_authority_version_changed",
  "blocked_runtime_or_identity_unverified"
]);

const COUNT_KEYS = Object.freeze([
  "totalCases",
  "noServiceNoop",
  "requiresExplicitCanonicalChain",
  "requiresExplicitAuthorityAssignment",
  "requiresExplicitTransitionContract",
  "blockedAccountInactiveOrUnknown",
  "blockedDuplicateLoginIdentity",
  "blockedInflightCommerceOrReconciliation",
  "blockedLapsedOnly",
  "blockedFutureOrEffectBackedChain",
  "blockedPartialOrInconsistentChain",
  "blockedAuthorityConflict",
  "blockedAuthorityDrift",
  "blockedAuthorityVersionChanged",
  "blockedRuntimeOrIdentityUnverified",
  "manualReviewRequired"
]);

function frozenContract(schemaId, fieldOrder, { nested = {}, arrays = {}, validate = () => {} } = {}) {
  return Object.freeze({
    schemaId,
    maxBytes: 2 * 1024 * 1024,
    fieldOrder: Object.freeze([...fieldOrder]),
    nested: Object.freeze({ ...nested }),
    arrays: Object.freeze({ ...arrays }),
    validate
  });
}

function assertIsoTimestamp(value, code) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw new Error(code);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(code);
  }
}

function assertExactEnum(value, allowed, code) {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(code);
}

function assertSafeCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

function assertSha256(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

function assertCaseRecordConsistency(value) {
  if (value.serviceChainState === "none") {
    if (value.authorityState !== "not_applicable" || value.runtimeState !== "not_applicable") {
      throw new Error("legacy_entitlement_normalization_case_inconsistent");
    }
    return;
  }
  if (value.authorityState === "not_applicable" || value.runtimeState === "not_applicable") {
    throw new Error("legacy_entitlement_normalization_case_inconsistent");
  }
}

const CASE_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_case_v1",
  [
    "caseRef",
    "accountState",
    "serviceChainState",
    "authorityState",
    "commerceState",
    "runtimeState",
    "identityState"
  ],
  {
    validate(value) {
      if (typeof value.caseRef !== "string" || !SHA256_PATTERN.test(value.caseRef)) {
        throw new Error("legacy_entitlement_normalization_case_ref_invalid");
      }
      assertExactEnum(value.accountState, ACCOUNT_STATES, "legacy_entitlement_normalization_case_invalid");
      assertExactEnum(value.serviceChainState, SERVICE_CHAIN_STATES, "legacy_entitlement_normalization_case_invalid");
      assertExactEnum(value.authorityState, AUTHORITY_STATES, "legacy_entitlement_normalization_case_invalid");
      assertExactEnum(value.commerceState, COMMERCE_STATES, "legacy_entitlement_normalization_case_invalid");
      assertExactEnum(value.runtimeState, RUNTIME_STATES, "legacy_entitlement_normalization_case_invalid");
      assertExactEnum(value.identityState, IDENTITY_STATES, "legacy_entitlement_normalization_case_invalid");
      assertCaseRecordConsistency(value);
    }
  }
);

const SNAPSHOT_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_snapshot_v1",
  ["schemaVersion", "snapshotType", "observedAt", "sourceCommit", "cases"],
  {
    arrays: { cases: "case" },
    nested: { case: CASE_CONTRACT },
    validate(value) {
      if (value.schemaVersion !== "1" || value.snapshotType !== "aggregate_case_snapshot") {
        throw new Error("legacy_entitlement_normalization_snapshot_invalid");
      }
      assertIsoTimestamp(value.observedAt, "legacy_entitlement_normalization_snapshot_invalid");
      if (typeof value.sourceCommit !== "string" || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit)) {
        throw new Error("legacy_entitlement_normalization_snapshot_invalid");
      }
      const refs = new Set();
      for (const entry of value.cases) {
        if (refs.has(entry.caseRef)) {
          throw new Error("legacy_entitlement_normalization_duplicate_case_ref");
        }
        refs.add(entry.caseRef);
      }
    }
  }
);

function createEmptyCounts() {
  return {
    totalCases: 0,
    noServiceNoop: 0,
    requiresExplicitCanonicalChain: 0,
    requiresExplicitAuthorityAssignment: 0,
    requiresExplicitTransitionContract: 0,
    blockedAccountInactiveOrUnknown: 0,
    blockedDuplicateLoginIdentity: 0,
    blockedInflightCommerceOrReconciliation: 0,
    blockedLapsedOnly: 0,
    blockedFutureOrEffectBackedChain: 0,
    blockedPartialOrInconsistentChain: 0,
    blockedAuthorityConflict: 0,
    blockedAuthorityDrift: 0,
    blockedAuthorityVersionChanged: 0,
    blockedRuntimeOrIdentityUnverified: 0,
    manualReviewRequired: 0
  };
}

function classificationToCountKey(classification) {
  return {
    no_service_noop: "noServiceNoop",
    requires_explicit_canonical_chain: "requiresExplicitCanonicalChain",
    requires_explicit_authority_assignment: "requiresExplicitAuthorityAssignment",
    requires_explicit_transition_contract: "requiresExplicitTransitionContract",
    blocked_account_inactive_or_unknown: "blockedAccountInactiveOrUnknown",
    blocked_duplicate_login_identity: "blockedDuplicateLoginIdentity",
    blocked_inflight_commerce_or_reconciliation: "blockedInflightCommerceOrReconciliation",
    blocked_lapsed_only: "blockedLapsedOnly",
    blocked_future_or_effect_backed_chain: "blockedFutureOrEffectBackedChain",
    blocked_partial_or_inconsistent_chain: "blockedPartialOrInconsistentChain",
    blocked_authority_conflict: "blockedAuthorityConflict",
    blocked_authority_drift: "blockedAuthorityDrift",
    blocked_authority_version_changed: "blockedAuthorityVersionChanged",
    blocked_runtime_or_identity_unverified: "blockedRuntimeOrIdentityUnverified"
  }[classification];
}

function assertCounts(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("legacy_entitlement_normalization_counts_invalid");
  }
  const keys = Object.keys(value);
  if (keys.length !== COUNT_KEYS.length || COUNT_KEYS.some((key) => !Object.hasOwn(value, key))) {
    throw new Error("legacy_entitlement_normalization_counts_invalid");
  }
  for (const key of COUNT_KEYS) assertSafeCount(value[key], "legacy_entitlement_normalization_counts_invalid");
}

const COUNTS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_counts_v1",
  COUNT_KEYS,
  { validate: assertCounts }
);

function assertReasonCounts(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("legacy_entitlement_normalization_reason_counts_invalid");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== NORMALIZATION_CLASSIFICATIONS.length
    || NORMALIZATION_CLASSIFICATIONS.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error("legacy_entitlement_normalization_reason_counts_invalid");
  }
  for (const key of NORMALIZATION_CLASSIFICATIONS) {
    assertSafeCount(value[key], "legacy_entitlement_normalization_reason_counts_invalid");
  }
}

const REASON_COUNTS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_reason_counts_v1",
  NORMALIZATION_CLASSIFICATIONS,
  { validate: assertReasonCounts }
);

const POLICY_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_policy_v1",
  [
    "policyId",
    "targetOfferRef",
    "targetOfferVersionRef",
    "targetDurationDays",
    "targetMonthlyTrafficGb",
    "targetTrafficLimitBytes",
    "targetPortalPlan",
    "migrationScope",
    "validUntilStrategy",
    "cycleAnchorStrategy"
  ],
  {
    validate(value) {
      for (const [key, expected] of Object.entries(LEGACY_ENTITLEMENT_NORMALIZATION_POLICY)) {
        if (value[key] !== expected) throw new Error("legacy_entitlement_normalization_policy_invalid");
      }
    }
  }
);

const DECISIONS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_decisions_v1",
  [
    "autoSelectedChains",
    "plannedAssignments",
    "plannedTransitions",
    "zeroServiceResourceCreations",
    "coinsEffects",
    "commerceOrderEffects",
    "fulfillmentEffects"
  ],
  {
    validate(value) {
      for (const field of Object.keys(value)) {
        assertSafeCount(value[field], "legacy_entitlement_normalization_decisions_invalid");
        if (value[field] !== 0) throw new Error("legacy_entitlement_normalization_decisions_invalid");
      }
    }
  }
);

const PLAN_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_plan_v1",
  ["schemaVersion", "snapshotDigest", "policy", "counts", "reasonCounts", "decisions"],
  {
    nested: {
      policy: POLICY_CONTRACT,
      counts: COUNTS_CONTRACT,
      reasonCounts: REASON_COUNTS_CONTRACT,
      decisions: DECISIONS_CONTRACT
    },
    validate(value) {
      if (value.schemaVersion !== "1") throw new Error("legacy_entitlement_normalization_plan_invalid");
      assertSha256(value.snapshotDigest, "legacy_entitlement_normalization_plan_invalid");
    }
  }
);

function normalizeSnapshot(snapshot) {
  return parseCanonicalJsonBytes(
    serializeCanonicalJsonBytes(snapshot, SNAPSHOT_CONTRACT),
    SNAPSHOT_CONTRACT
  );
}

export function parseLegacyEntitlementNormalizationSnapshot(bytes) {
  return parseCanonicalJsonBytes(bytes, SNAPSHOT_CONTRACT);
}

export function serializeLegacyEntitlementNormalizationSnapshot(snapshot) {
  return serializeCanonicalJsonBytes(snapshot, SNAPSHOT_CONTRACT);
}

export function classifyLegacyEntitlementNormalizationCase(caseRecord) {
  const value = normalizeSnapshot({
    schemaVersion: "1",
    snapshotType: "aggregate_case_snapshot",
    observedAt: "2026-01-01T00:00:00.000Z",
    sourceCommit: "0000000000000000000000000000000000000000",
    cases: [caseRecord]
  }).cases[0];

  return classifyCanonicalCase(value);
}

function classifyCanonicalCase(value) {
  return collectCanonicalCaseReasons(value)[0];
}

function collectCanonicalCaseReasons(value) {
  const reasons = [];

  if (value.accountState !== "active") reasons.push("blocked_account_inactive_or_unknown");
  if (value.identityState !== "unique") reasons.push("blocked_duplicate_login_identity");
  if (value.commerceState !== "clear") reasons.push("blocked_inflight_commerce_or_reconciliation");

  if (value.serviceChainState === "none") {
    reasons.push("no_service_noop");
    return Object.freeze(reasons);
  }

  if (value.runtimeState !== "verified") reasons.push("blocked_runtime_or_identity_unverified");

  if (value.serviceChainState === "multiple_current_exact") {
    reasons.push("requires_explicit_canonical_chain");
  } else if (value.serviceChainState === "lapsed_only") {
    reasons.push("blocked_lapsed_only");
  } else if (value.serviceChainState === "future_or_effect_backed") {
    reasons.push("blocked_future_or_effect_backed_chain");
  } else if (value.serviceChainState !== "unique_current_exact") {
    reasons.push("blocked_partial_or_inconsistent_chain");
  }

  if (value.authorityState === "none") {
    reasons.push("requires_explicit_authority_assignment");
  } else if (value.authorityState === "exact") {
    reasons.push("requires_explicit_transition_contract");
  } else if (value.authorityState === "conflict") {
    reasons.push("blocked_authority_conflict");
  } else if (value.authorityState === "drift") {
    reasons.push("blocked_authority_drift");
  } else if (value.authorityState === "version_changed") {
    reasons.push("blocked_authority_version_changed");
  }

  return Object.freeze(reasons);
}

export function listLegacyEntitlementNormalizationCaseReasons(caseRecord) {
  const value = normalizeSnapshot({
    schemaVersion: "1",
    snapshotType: "aggregate_case_snapshot",
    observedAt: "2026-01-01T00:00:00.000Z",
    sourceCommit: "0000000000000000000000000000000000000000",
    cases: [caseRecord]
  }).cases[0];
  return collectCanonicalCaseReasons(value);
}

export function buildLegacyEntitlementNormalizationInventory(snapshot) {
  const value = normalizeSnapshot(snapshot);
  const counts = createEmptyCounts();
  const reasonCounts = Object.fromEntries(NORMALIZATION_CLASSIFICATIONS.map((key) => [key, 0]));

  for (const caseRecord of value.cases) {
    const reasons = collectCanonicalCaseReasons(caseRecord);
    const classification = reasons[0];
    const countKey = classificationToCountKey(classification);
    counts[countKey] += 1;
    for (const reason of reasons) reasonCounts[reason] += 1;
  }
  counts.totalCases = value.cases.length;
  counts.manualReviewRequired = value.cases.length - counts.noServiceNoop;

  return Object.freeze({
    snapshotDigest: sha256Hex(serializeLegacyEntitlementNormalizationSnapshot(value)),
    counts: Object.freeze(counts),
    reasonCounts: Object.freeze(reasonCounts)
  });
}

export function buildLegacyEntitlementNormalizationPlan(snapshot) {
  const inventory = buildLegacyEntitlementNormalizationInventory(snapshot);
  const plan = Object.freeze({
    schemaVersion: "1",
    snapshotDigest: inventory.snapshotDigest,
    policy: LEGACY_ENTITLEMENT_NORMALIZATION_POLICY,
    counts: inventory.counts,
    reasonCounts: inventory.reasonCounts,
    decisions: Object.freeze({
      autoSelectedChains: 0,
      plannedAssignments: 0,
      plannedTransitions: 0,
      zeroServiceResourceCreations: 0,
      coinsEffects: 0,
      commerceOrderEffects: 0,
      fulfillmentEffects: 0
    })
  });
  const bytes = serializeCanonicalJsonBytes(plan, PLAN_CONTRACT);
  return Object.freeze({
    ...inventory,
    plan,
    planDigest: sha256Hex(bytes)
  });
}

export function dryRunLegacyEntitlementNormalization(snapshot) {
  const plan = buildLegacyEntitlementNormalizationPlan(snapshot);
  return Object.freeze({
    ...plan,
    dryRunVerified: plan.plan.decisions.autoSelectedChains === 0
      && plan.plan.decisions.plannedAssignments === 0
      && plan.plan.decisions.plannedTransitions === 0
      && plan.plan.decisions.zeroServiceResourceCreations === 0
      && plan.plan.decisions.coinsEffects === 0
      && plan.plan.decisions.commerceOrderEffects === 0
      && plan.plan.decisions.fulfillmentEffects === 0
  });
}
