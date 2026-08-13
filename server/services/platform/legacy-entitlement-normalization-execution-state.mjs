import {
  parseCanonicalJsonBytes,
  serializeCanonicalJsonBytes,
  sha256Hex
} from "../deployment/canonical-json.mjs";
import {
  LEGACY_ENTITLEMENT_NORMALIZATION_POLICY,
  buildLegacyEntitlementNormalizationPlan,
  deriveLegacyEntitlementNormalizationRemoteHandoffScopeDigest,
  digestLegacyEntitlementNormalizationCase,
  listLegacyEntitlementNormalizationCaseReasons,
  parseLegacyEntitlementNormalizationSnapshot,
  serializeLegacyEntitlementNormalizationSnapshot
} from "./legacy-entitlement-normalization.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const YEARLY_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_INTENT_TTL_MS = 60 * 60 * 1000;
const MAX_SNAPSHOT_TO_INTENT_MS = 15 * 60 * 1000;

const EXECUTION_STATES = new Set([
  "no_action",
  "blocked",
  "review_required",
  "candidate_for_separate_risk_a"
]);
const REVIEW_STATES = new Set(["not_required", "bound_for_external_review"]);
const BARRIER_STATES = new Set(["held", "not_held"]);
const BACKUP_STATES = new Set(["paired_verified", "not_verified"]);
const RUNTIME_STATES = new Set(["verified_exact", "not_verified", "not_applicable"]);

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

function assertSha256(value, code) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(code);
}

function assertSafeCount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

function assertCanonicalTime(value, code) {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) throw new Error(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(code);
  return parsed;
}

function assertExactEnum(value, allowed, code) {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(code);
}

function canonicalize(value, contract) {
  return parseCanonicalJsonBytes(serializeCanonicalJsonBytes(value, contract), contract);
}

const BARRIER_DECLARATION_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_barrier_declaration_v1",
  [
    "state",
    "intentDigest",
    "scopeDigest",
    "generation",
    "verifiedAt",
    "expiresAt",
    "walletOperationsStarted",
    "activeQuotes",
    "activeHolds",
    "nonterminalCommerceOrders",
    "paymentWritesInFlight",
    "fulfillmentWritesInFlight"
  ]
);

function deriveBarrierGenerationDigest(value) {
  return sha256Hex(serializeCanonicalJsonBytes({
    state: value.state,
    intentDigest: value.intentDigest,
    scopeDigest: value.scopeDigest,
    generation: value.generation,
    verifiedAt: value.verifiedAt,
    expiresAt: value.expiresAt,
    walletOperationsStarted: value.walletOperationsStarted,
    activeQuotes: value.activeQuotes,
    activeHolds: value.activeHolds,
    nonterminalCommerceOrders: value.nonterminalCommerceOrders,
    paymentWritesInFlight: value.paymentWritesInFlight,
    fulfillmentWritesInFlight: value.fulfillmentWritesInFlight
  }, BARRIER_DECLARATION_CONTRACT));
}

export function deriveLegacyEntitlementNormalizationBarrierGenerationDigest(value) {
  return deriveBarrierGenerationDigest(value);
}

const INTENT_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_intent_v1",
  [
    "schemaVersion",
    "intentType",
    "sourceCommit",
    "policyId",
    "snapshotDigest",
    "planDigest",
    "executionManifestDigest",
    "transitionContractDigest",
    "issuedAt",
    "expiresAt",
    "maxCases"
  ],
  {
    validate(value) {
      if (value.schemaVersion !== "1" || value.intentType !== "private_execution_intent_binding") {
        throw new Error("legacy_entitlement_normalization_execution_intent_invalid");
      }
      if (typeof value.sourceCommit !== "string" || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit)) {
        throw new Error("legacy_entitlement_normalization_execution_intent_invalid");
      }
      if (value.policyId !== LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.policyId) {
        throw new Error("legacy_entitlement_normalization_execution_intent_invalid");
      }
      assertSha256(value.snapshotDigest, "legacy_entitlement_normalization_execution_intent_invalid");
      assertSha256(value.planDigest, "legacy_entitlement_normalization_execution_intent_invalid");
      if (value.executionManifestDigest !== null) {
        assertSha256(value.executionManifestDigest, "legacy_entitlement_normalization_execution_intent_invalid");
      }
      if (value.transitionContractDigest !== null) {
        assertSha256(value.transitionContractDigest, "legacy_entitlement_normalization_execution_intent_invalid");
      }
      if ((value.executionManifestDigest === null) !== (value.transitionContractDigest === null)
        || (value.executionManifestDigest !== null && value.executionManifestDigest !== value.transitionContractDigest)) {
        throw new Error("legacy_entitlement_normalization_execution_intent_invalid");
      }
      const issuedAt = assertCanonicalTime(value.issuedAt, "legacy_entitlement_normalization_execution_intent_invalid");
      const expiresAt = assertCanonicalTime(value.expiresAt, "legacy_entitlement_normalization_execution_intent_invalid");
      if (
        expiresAt <= issuedAt
        || expiresAt - issuedAt > MAX_INTENT_TTL_MS
        || !Number.isSafeInteger(value.maxCases)
        || value.maxCases < 1
        || value.maxCases > 100
      ) {
        throw new Error("legacy_entitlement_normalization_execution_intent_invalid");
      }
    }
  }
);

const BARRIER_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_barrier_v1",
  [
    "state",
    "intentDigest",
    "scopeDigest",
    "generation",
    "generationDigest",
    "verifiedAt",
    "expiresAt",
    "walletOperationsStarted",
    "activeQuotes",
    "activeHolds",
    "nonterminalCommerceOrders",
    "paymentWritesInFlight",
    "fulfillmentWritesInFlight"
  ],
  {
    validate(value) {
      assertExactEnum(value.state, BARRIER_STATES, "legacy_entitlement_normalization_execution_barrier_invalid");
      assertSha256(value.intentDigest, "legacy_entitlement_normalization_execution_barrier_invalid");
      if (value.scopeDigest !== null) {
        assertSha256(value.scopeDigest, "legacy_entitlement_normalization_execution_barrier_invalid");
      }
      assertSafeCount(value.generation, "legacy_entitlement_normalization_execution_barrier_invalid");
      assertSha256(value.generationDigest, "legacy_entitlement_normalization_execution_barrier_invalid");
      const verifiedAt = assertCanonicalTime(value.verifiedAt, "legacy_entitlement_normalization_execution_barrier_invalid");
      const expiresAt = assertCanonicalTime(value.expiresAt, "legacy_entitlement_normalization_execution_barrier_invalid");
      if (expiresAt <= verifiedAt) throw new Error("legacy_entitlement_normalization_execution_barrier_invalid");
      for (const key of [
        "walletOperationsStarted",
        "activeQuotes",
        "activeHolds",
        "nonterminalCommerceOrders",
        "paymentWritesInFlight",
        "fulfillmentWritesInFlight"
      ]) {
        assertSafeCount(value[key], "legacy_entitlement_normalization_execution_barrier_invalid");
      }
      if (value.generationDigest !== deriveBarrierGenerationDigest(value)) {
        throw new Error("legacy_entitlement_normalization_execution_barrier_invalid");
      }
    }
  }
);

const BACKUPS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_backups_v1",
  [
    "state",
    "intentDigest",
    "controlBackupDigest",
    "runtimeBackupDigest",
    "restoreProofDigest",
    "verifiedAt"
  ],
  {
    validate(value) {
      assertExactEnum(value.state, BACKUP_STATES, "legacy_entitlement_normalization_execution_backups_invalid");
      for (const key of [
        "intentDigest",
        "controlBackupDigest",
        "runtimeBackupDigest",
        "restoreProofDigest"
      ]) {
        assertSha256(value[key], "legacy_entitlement_normalization_execution_backups_invalid");
      }
      assertCanonicalTime(value.verifiedAt, "legacy_entitlement_normalization_execution_backups_invalid");
    }
  }
);

const RUNTIME_ATTESTATION_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_runtime_attestation_v1",
  [
    "scopeDigest",
    "desiredStateDigest",
    "notificationDigest",
    "leaseDigest",
    "receiptDigest",
    "identityGateDigest",
    "verifiedAt"
  ]
);

function deriveRuntimeAttestationDigest(value) {
  return sha256Hex(serializeCanonicalJsonBytes({
    scopeDigest: value.scopeDigest,
    desiredStateDigest: value.desiredStateDigest,
    notificationDigest: value.notificationDigest,
    leaseDigest: value.leaseDigest,
    receiptDigest: value.receiptDigest,
    identityGateDigest: value.identityGateDigest,
    verifiedAt: value.verifiedAt
  }, RUNTIME_ATTESTATION_CONTRACT));
}

export function deriveLegacyEntitlementNormalizationRuntimeAttestationDigest(value) {
  return deriveRuntimeAttestationDigest(value);
}

const RUNTIME_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_runtime_v1",
  [
    "state",
    "intentDigest",
    "scopeDigest",
    "desiredStateDigest",
    "notificationDigest",
    "leaseDigest",
    "receiptDigest",
    "identityGateDigest",
    "attestationDigest",
    "verifiedAt"
  ],
  {
    validate(value) {
      assertExactEnum(value.state, RUNTIME_STATES, "legacy_entitlement_normalization_execution_runtime_invalid");
      assertSha256(value.intentDigest, "legacy_entitlement_normalization_execution_runtime_invalid");
      assertCanonicalTime(value.verifiedAt, "legacy_entitlement_normalization_execution_runtime_invalid");
      const digestFields = [
        "scopeDigest",
        "desiredStateDigest",
        "notificationDigest",
        "leaseDigest",
        "receiptDigest",
        "identityGateDigest"
      ];
      if (value.state === "verified_exact") {
        for (const key of digestFields) {
          assertSha256(value[key], "legacy_entitlement_normalization_execution_runtime_invalid");
        }
        if (value.attestationDigest !== deriveRuntimeAttestationDigest(value)) {
          throw new Error("legacy_entitlement_normalization_execution_runtime_invalid");
        }
        return;
      }
      for (const key of digestFields) {
        if (value[key] !== null) throw new Error("legacy_entitlement_normalization_execution_runtime_invalid");
      }
      if (value.attestationDigest !== null) {
        throw new Error("legacy_entitlement_normalization_execution_runtime_invalid");
      }
    }
  }
);

const CASE_REVIEW_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_case_review_v1",
  [
    "caseRef",
    "sourceCaseDigest",
    "sourceBindingDigest",
    "intentDigest",
    "executionManifestDigest",
    "operationRef",
    "state",
    "resolutionDigest",
    "reviewedAt",
    "expiresAt"
  ],
  {
    validate(value) {
      assertSha256(value.caseRef, "legacy_entitlement_normalization_execution_case_review_invalid");
      assertSha256(value.sourceCaseDigest, "legacy_entitlement_normalization_execution_case_review_invalid");
      assertSha256(value.sourceBindingDigest, "legacy_entitlement_normalization_execution_case_review_invalid");
      assertExactEnum(value.state, REVIEW_STATES, "legacy_entitlement_normalization_execution_case_review_invalid");
      if (value.state === "not_required") {
        if (
          value.intentDigest !== null
          || value.executionManifestDigest !== null
          || value.operationRef !== null
          || value.resolutionDigest !== null
          || value.reviewedAt !== null
          || value.expiresAt !== null
        ) {
          throw new Error("legacy_entitlement_normalization_execution_case_review_invalid");
        }
      } else {
        assertSha256(value.intentDigest, "legacy_entitlement_normalization_execution_case_review_invalid");
        assertSha256(value.sourceBindingDigest, "legacy_entitlement_normalization_execution_case_review_invalid");
        assertSha256(value.executionManifestDigest, "legacy_entitlement_normalization_execution_case_review_invalid");
        assertSha256(value.operationRef, "legacy_entitlement_normalization_execution_case_review_invalid");
        assertSha256(value.resolutionDigest, "legacy_entitlement_normalization_execution_case_review_invalid");
        const reviewedAt = assertCanonicalTime(value.reviewedAt, "legacy_entitlement_normalization_execution_case_review_invalid");
        const expiresAt = assertCanonicalTime(value.expiresAt, "legacy_entitlement_normalization_execution_case_review_invalid");
        if (expiresAt <= reviewedAt) {
          throw new Error("legacy_entitlement_normalization_execution_case_review_invalid");
        }
      }
    }
  }
);

const PREFLIGHT_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_preflight_v1",
  ["schemaVersion", "preflightType", "evaluatedAt", "intent", "intentDigest", "barrier", "backups", "runtime", "caseReviews"],
  {
    nested: {
      intent: INTENT_CONTRACT,
      barrier: BARRIER_CONTRACT,
      backups: BACKUPS_CONTRACT,
      runtime: RUNTIME_CONTRACT,
      caseReview: CASE_REVIEW_CONTRACT
    },
    arrays: { caseReviews: "caseReview" },
    validate(value) {
      if (value.schemaVersion !== "1" || value.preflightType !== "aggregate_execution_preflight") {
        throw new Error("legacy_entitlement_normalization_execution_preflight_invalid");
      }
      assertCanonicalTime(value.evaluatedAt, "legacy_entitlement_normalization_execution_preflight_invalid");
      assertSha256(value.intentDigest, "legacy_entitlement_normalization_execution_preflight_invalid");
      let previousCaseRef = null;
      for (const review of value.caseReviews) {
        if (previousCaseRef !== null && review.caseRef <= previousCaseRef) {
          throw new Error("legacy_entitlement_normalization_execution_case_reviews_not_sorted");
        }
        previousCaseRef = review.caseRef;
      }
    }
  }
);

const CHECKS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_checks_v1",
  [
    "sourceBound",
    "snapshotBound",
    "snapshotFresh",
    "planBound",
    "executionManifestBound",
    "intentDigestBound",
    "intentCurrent",
    "writeBarrierHeld",
    "pairedBackupsVerified",
    "runtimePreflightVerified",
    "caseReviewsBound"
  ],
  {
    validate(value) {
      for (const key of Object.keys(value)) {
        if (typeof value[key] !== "boolean") {
          throw new Error("legacy_entitlement_normalization_execution_checks_invalid");
        }
      }
    }
  }
);

const COUNTS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_counts_v1",
  [
    "totalCases",
    "noServiceNoop",
    "blockedGlobal",
    "blockedCase",
    "reviewRequired",
    "candidateForSeparateRiskA"
  ],
  {
    validate(value) {
      for (const key of Object.keys(value)) {
        assertSafeCount(value[key], "legacy_entitlement_normalization_execution_counts_invalid");
      }
    }
  }
);

const EFFECTS_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_effects_v1",
  [
    "authorityAssignments",
    "entitlementTransitions",
    "resourceRetirements",
    "coinsEffects",
    "commerceOrderEffects",
    "fulfillmentEffects",
    "runtimeEffects"
  ],
  {
    validate(value) {
      for (const key of Object.keys(value)) {
        if (value[key] !== 0) throw new Error("legacy_entitlement_normalization_execution_effects_invalid");
      }
    }
  }
);

const RECEIPT_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_preflight_receipt_v1",
  [
    "schemaVersion",
    "receiptType",
    "preflightDigest",
    "evaluatedAt",
    "snapshotDigest",
    "planDigest",
    "intentDigest",
    "runtimeAttestationDigest",
    "state",
    "aggregateOnly",
    "executionAllowed",
    "sourceChanged",
    "externalRiskAGateRequired",
    "attestationClaimsOnly",
    "checks",
    "counts",
    "effects"
  ],
  {
    nested: {
      checks: CHECKS_CONTRACT,
      counts: COUNTS_CONTRACT,
      effects: EFFECTS_CONTRACT
    },
    validate(value) {
      if (
        value.schemaVersion !== "1"
        || value.receiptType !== "aggregate_execution_preflight_receipt"
        || value.aggregateOnly !== true
        || value.executionAllowed !== false
        || value.sourceChanged !== false
        || value.externalRiskAGateRequired !== true
        || value.attestationClaimsOnly !== true
      ) {
        throw new Error("legacy_entitlement_normalization_execution_receipt_invalid");
      }
      assertSha256(value.preflightDigest, "legacy_entitlement_normalization_execution_receipt_invalid");
      assertCanonicalTime(value.evaluatedAt, "legacy_entitlement_normalization_execution_receipt_invalid");
      assertSha256(value.snapshotDigest, "legacy_entitlement_normalization_execution_receipt_invalid");
      assertSha256(value.planDigest, "legacy_entitlement_normalization_execution_receipt_invalid");
      assertSha256(value.intentDigest, "legacy_entitlement_normalization_execution_receipt_invalid");
      if (value.runtimeAttestationDigest !== null) {
        assertSha256(value.runtimeAttestationDigest, "legacy_entitlement_normalization_execution_receipt_invalid");
      }
      assertExactEnum(value.state, EXECUTION_STATES, "legacy_entitlement_normalization_execution_receipt_invalid");
      const countTotal = value.counts.noServiceNoop
        + value.counts.blockedGlobal
        + value.counts.blockedCase
        + value.counts.reviewRequired
        + value.counts.candidateForSeparateRiskA;
      if (countTotal !== value.counts.totalCases) {
        throw new Error("legacy_entitlement_normalization_execution_receipt_invalid");
      }
      const allChecksPass = Object.values(value.checks).every(Boolean);
      if (value.state === "candidate_for_separate_risk_a") {
        if (!allChecksPass || value.counts.candidateForSeparateRiskA < 1 || value.counts.blockedGlobal !== 0 || value.counts.blockedCase !== 0 || value.counts.reviewRequired !== 0) {
          throw new Error("legacy_entitlement_normalization_execution_receipt_invalid");
        }
      } else if (value.state === "no_action") {
        if (!allChecksPass || value.counts.totalCases !== value.counts.noServiceNoop) {
          throw new Error("legacy_entitlement_normalization_execution_receipt_invalid");
        }
      } else if (value.state === "blocked") {
        if (value.counts.blockedGlobal + value.counts.blockedCase < 1) {
          throw new Error("legacy_entitlement_normalization_execution_receipt_invalid");
        }
      } else if (value.state === "review_required") {
        if (!allChecksPass || value.counts.reviewRequired < 1 || value.counts.blockedGlobal !== 0 || value.counts.blockedCase !== 0) {
          throw new Error("legacy_entitlement_normalization_execution_receipt_invalid");
        }
      }
    }
  }
);

function hashIntent(intent) {
  return sha256Hex(serializeCanonicalJsonBytes(intent, INTENT_CONTRACT));
}

function zeroEffects() {
  return Object.freeze({
    authorityAssignments: 0,
    entitlementTransitions: 0,
    resourceRetirements: 0,
    coinsEffects: 0,
    commerceOrderEffects: 0,
    fulfillmentEffects: 0,
    runtimeEffects: 0
  });
}

function allBarrierWritesAreZero(barrier) {
  return barrier.walletOperationsStarted === 0
    && barrier.activeQuotes === 0
    && barrier.activeHolds === 0
    && barrier.nonterminalCommerceOrders === 0
    && barrier.paymentWritesInFlight === 0
    && barrier.fulfillmentWritesInFlight === 0;
}

function hasBlockedReason(reasons) {
  return reasons.some((reason) => reason.startsWith("blocked_"));
}

function hasExternalReviewRequirement(reasons) {
  return reasons.includes("requires_explicit_authority_assignment")
    || reasons.includes("requires_explicit_transition_contract");
}

function evaluateTimestamp(value) {
  return assertCanonicalTime(value, "legacy_entitlement_normalization_execution_evaluated_at_invalid");
}

const PRIVATE_REF_PATTERN = /^[a-z][a-z0-9_-]{5,127}$/;
const AUTHORITY_ACTIONS = new Set(["assign_initial", "preserve_exact"]);

function assertPrivateRef(value, code) {
  if (typeof value !== "string" || !PRIVATE_REF_PATTERN.test(value)) throw new Error(code);
  if (/token|secret|password|credential|url|sqlite|\.env/i.test(value)) throw new Error(code);
}

const TRANSITION_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_transition_v1",
  [
    "validFrom",
    "validUntil",
    "cycleAnchorAt",
    "targetOfferVersionRef",
    "targetDurationDays",
    "targetMonthlyTrafficGb",
    "targetTrafficLimitBytes",
    "targetPortalPlan",
    "resourceAction",
    "commerceAction"
  ],
  {
    validate(value) {
      const validFrom = assertCanonicalTime(value.validFrom, "legacy_entitlement_normalization_execution_transition_invalid");
      const validUntil = assertCanonicalTime(value.validUntil, "legacy_entitlement_normalization_execution_transition_invalid");
      const cycleAnchorAt = assertCanonicalTime(value.cycleAnchorAt, "legacy_entitlement_normalization_execution_transition_invalid");
      if (
        validUntil <= validFrom
        || validUntil - validFrom !== YEARLY_DURATION_MS
        || cycleAnchorAt !== validFrom
        || value.targetOfferVersionRef !== LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetOfferVersionRef
        || value.targetDurationDays !== LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetDurationDays
        || value.targetMonthlyTrafficGb !== LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetMonthlyTrafficGb
        || value.targetTrafficLimitBytes !== LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetTrafficLimitBytes
        || value.targetPortalPlan !== LEGACY_ENTITLEMENT_NORMALIZATION_POLICY.targetPortalPlan
        || value.resourceAction !== "reuse_existing_canonical_triad"
        || value.commerceAction !== "none"
      ) {
        throw new Error("legacy_entitlement_normalization_execution_transition_invalid");
      }
    }
  }
);

const MANIFEST_ENTRY_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_manifest_entry_v1",
  [
    "caseRef",
    "accountRef",
    "resourceRequestRef",
    "entitlementRef",
    "issuedLinkRef",
    "authorityAction",
    "expectedAuthorityRef",
    "expectedAuthorityVersion",
    "expectedAuthorityHistoryCount",
    "sourceBindingDigest",
    "preconditionDigest",
    "transition",
    "operationRef"
  ],
  {
    nested: { transition: TRANSITION_CONTRACT },
    validate(value) {
      assertSha256(value.caseRef, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      for (const key of ["accountRef", "resourceRequestRef", "entitlementRef", "issuedLinkRef"]) {
        assertPrivateRef(value[key], "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      }
      assertExactEnum(value.authorityAction, AUTHORITY_ACTIONS, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      if (value.authorityAction === "assign_initial") {
        if (value.expectedAuthorityRef !== null || value.expectedAuthorityVersion !== 0 || value.expectedAuthorityHistoryCount !== 0) {
          throw new Error("legacy_entitlement_normalization_execution_manifest_entry_invalid");
        }
      } else {
        assertPrivateRef(value.expectedAuthorityRef, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
        if (value.expectedAuthorityVersion < 1 || value.expectedAuthorityHistoryCount < 1) {
          throw new Error("legacy_entitlement_normalization_execution_manifest_entry_invalid");
        }
      }
      assertSafeCount(value.expectedAuthorityVersion, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      assertSafeCount(value.expectedAuthorityHistoryCount, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      assertSha256(value.sourceBindingDigest, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      assertSha256(value.preconditionDigest, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
      assertSha256(value.operationRef, "legacy_entitlement_normalization_execution_manifest_entry_invalid");
    }
  }
);

const EXECUTION_MANIFEST_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_manifest_v1",
  [
    "schemaVersion",
    "manifestType",
    "sourceCommit",
    "snapshotDigest",
    "planDigest",
    "entries",
    "manifestDigest"
  ],
  {
    nested: { entry: MANIFEST_ENTRY_CONTRACT },
    arrays: { entries: "entry" },
    validate(value) {
      if (value.schemaVersion !== "1" || value.manifestType !== "private_execution_intent") {
        throw new Error("legacy_entitlement_normalization_execution_manifest_invalid");
      }
      if (typeof value.sourceCommit !== "string" || !SOURCE_COMMIT_PATTERN.test(value.sourceCommit)) {
        throw new Error("legacy_entitlement_normalization_execution_manifest_invalid");
      }
      assertSha256(value.snapshotDigest, "legacy_entitlement_normalization_execution_manifest_invalid");
      assertSha256(value.planDigest, "legacy_entitlement_normalization_execution_manifest_invalid");
      assertSha256(value.manifestDigest, "legacy_entitlement_normalization_execution_manifest_invalid");
      if (value.entries.length < 1 || value.entries.length > 100) {
        throw new Error("legacy_entitlement_normalization_execution_manifest_invalid");
      }
      const accountRefs = new Set();
      const resourceRequestRefs = new Set();
      const entitlementRefs = new Set();
      const issuedLinkRefs = new Set();
      const operationRefs = new Set();
      let previousCaseRef = null;
      for (const entry of value.entries) {
        if (previousCaseRef !== null && entry.caseRef <= previousCaseRef) {
          throw new Error("legacy_entitlement_normalization_execution_manifest_entries_not_sorted");
        }
        previousCaseRef = entry.caseRef;
        for (const [set, ref] of [
          [accountRefs, entry.accountRef],
          [resourceRequestRefs, entry.resourceRequestRef],
          [entitlementRefs, entry.entitlementRef],
          [issuedLinkRefs, entry.issuedLinkRef],
          [operationRefs, entry.operationRef]
        ]) {
          if (set.has(ref)) throw new Error("legacy_entitlement_normalization_execution_manifest_duplicate_ref");
          set.add(ref);
        }
      }
    }
  }
);

const OPERATION_PROJECTION_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_operation_projection_v1",
  [
    "domain",
    "sourceCommit",
    "snapshotDigest",
    "planDigest",
    "caseRef",
    "accountRef",
    "resourceRequestRef",
    "entitlementRef",
    "issuedLinkRef",
    "authorityAction",
    "expectedAuthorityRef",
    "expectedAuthorityVersion",
    "expectedAuthorityHistoryCount",
    "sourceBindingDigest",
    "preconditionDigest",
    "transition"
  ],
  { nested: { transition: TRANSITION_CONTRACT } }
);

const MANIFEST_DIGEST_PROJECTION_CONTRACT = frozenContract(
  "legacy_entitlement_normalization_execution_manifest_digest_projection_v1",
  ["schemaVersion", "manifestType", "sourceCommit", "snapshotDigest", "planDigest", "entries"],
  { nested: { entry: MANIFEST_ENTRY_CONTRACT }, arrays: { entries: "entry" } }
);

function deriveOperationRef({ sourceCommit, snapshotDigest, planDigest, entry }) {
  return sha256Hex(serializeCanonicalJsonBytes({
    domain: "legacy_entitlement_normalization_operation_ref_v1",
    sourceCommit,
    snapshotDigest,
    planDigest,
    caseRef: entry.caseRef,
    accountRef: entry.accountRef,
    resourceRequestRef: entry.resourceRequestRef,
    entitlementRef: entry.entitlementRef,
    issuedLinkRef: entry.issuedLinkRef,
    authorityAction: entry.authorityAction,
    expectedAuthorityRef: entry.expectedAuthorityRef,
    expectedAuthorityVersion: entry.expectedAuthorityVersion,
    expectedAuthorityHistoryCount: entry.expectedAuthorityHistoryCount,
    sourceBindingDigest: entry.sourceBindingDigest,
    preconditionDigest: entry.preconditionDigest,
    transition: entry.transition
  }, OPERATION_PROJECTION_CONTRACT));
}

function deriveManifestDigest(manifest) {
  return sha256Hex(serializeCanonicalJsonBytes({
    schemaVersion: manifest.schemaVersion,
    manifestType: manifest.manifestType,
    sourceCommit: manifest.sourceCommit,
    snapshotDigest: manifest.snapshotDigest,
    planDigest: manifest.planDigest,
    entries: manifest.entries
  }, MANIFEST_DIGEST_PROJECTION_CONTRACT));
}

function assertManifestBoundToSnapshot(manifest, snapshot) {
  const plan = buildLegacyEntitlementNormalizationPlan(snapshot);
  if (
    manifest.sourceCommit !== snapshot.sourceCommit
    || manifest.snapshotDigest !== plan.snapshotDigest
    || manifest.planDigest !== plan.planDigest
    || manifest.manifestDigest !== deriveManifestDigest(manifest)
  ) {
    throw new Error("legacy_entitlement_normalization_execution_manifest_binding_invalid");
  }
  const cases = new Map(snapshot.cases.map((caseRecord) => [caseRecord.caseRef, caseRecord]));
  for (const entry of manifest.entries) {
    const caseRecord = cases.get(entry.caseRef);
    if (!caseRecord) {
      throw new Error("legacy_entitlement_normalization_execution_manifest_case_not_eligible");
    }
    const reasons = listLegacyEntitlementNormalizationCaseReasons(caseRecord);
    const expectedCaseDigest = digestLegacyEntitlementNormalizationCase(caseRecord);
    if (
      reasons.length !== 1
      || (reasons[0] !== "requires_explicit_authority_assignment"
        && reasons[0] !== "requires_explicit_transition_contract")
    ) {
      throw new Error("legacy_entitlement_normalization_execution_manifest_case_not_eligible");
    }
    if (
      (reasons[0] === "requires_explicit_authority_assignment" && entry.authorityAction !== "assign_initial")
      || (reasons[0] === "requires_explicit_transition_contract" && entry.authorityAction !== "preserve_exact")
      || entry.operationRef !== deriveOperationRef({
        sourceCommit: manifest.sourceCommit,
        snapshotDigest: manifest.snapshotDigest,
        planDigest: manifest.planDigest,
        entry
      })
      || entry.preconditionDigest !== expectedCaseDigest
      || entry.sourceBindingDigest !== caseRecord.sourceBindingDigest
    ) {
      throw new Error("legacy_entitlement_normalization_execution_manifest_case_not_eligible");
    }
  }
  return plan;
}

export function createLegacyEntitlementNormalizationExecutionManifest({ snapshot, entries }) {
  const canonicalSnapshot = parseLegacyEntitlementNormalizationSnapshot(
    serializeLegacyEntitlementNormalizationSnapshot(snapshot)
  );
  const plan = buildLegacyEntitlementNormalizationPlan(canonicalSnapshot);
  const entriesWithoutOperationRefs = [...entries].map((entry) => ({ ...entry }));
  const draftEntries = entriesWithoutOperationRefs.map((entry) => ({
    ...entry,
    operationRef: deriveOperationRef({
      sourceCommit: canonicalSnapshot.sourceCommit,
      snapshotDigest: plan.snapshotDigest,
      planDigest: plan.planDigest,
      entry
    })
  }));
  const draft = {
    schemaVersion: "1",
    manifestType: "private_execution_intent",
    sourceCommit: canonicalSnapshot.sourceCommit,
    snapshotDigest: plan.snapshotDigest,
    planDigest: plan.planDigest,
    entries: draftEntries,
    manifestDigest: "0".repeat(64)
  };
  const manifest = {
    ...draft,
    manifestDigest: deriveManifestDigest(draft)
  };
  const canonicalManifest = canonicalize(manifest, EXECUTION_MANIFEST_CONTRACT);
  assertManifestBoundToSnapshot(canonicalManifest, canonicalSnapshot);
  return canonicalManifest;
}

function parseLegacyEntitlementNormalizationExecutionManifest(bytes) {
  return parseCanonicalJsonBytes(bytes, EXECUTION_MANIFEST_CONTRACT);
}

function serializeLegacyEntitlementNormalizationExecutionManifest(manifest) {
  return serializeCanonicalJsonBytes(manifest, EXECUTION_MANIFEST_CONTRACT);
}

export function validateLegacyEntitlementNormalizationExecutionManifestAgainstSnapshot({ manifest, snapshot }) {
  const canonicalSnapshot = parseLegacyEntitlementNormalizationSnapshot(
    serializeLegacyEntitlementNormalizationSnapshot(snapshot)
  );
  const canonicalManifest = parseLegacyEntitlementNormalizationExecutionManifest(
    serializeLegacyEntitlementNormalizationExecutionManifest(manifest)
  );
  assertManifestBoundToSnapshot(canonicalManifest, canonicalSnapshot);
  return Object.freeze({
    valid: true,
    manifestDigest: canonicalManifest.manifestDigest,
    snapshotDigest: canonicalManifest.snapshotDigest,
    planDigest: canonicalManifest.planDigest,
    entryCount: canonicalManifest.entries.length,
    aggregateOnly: true,
    executionAllowed: false,
    sourceChanged: false
  });
}

export function summarizeLegacyEntitlementNormalizationExecutionManifest(manifest) {
  const canonicalManifest = parseLegacyEntitlementNormalizationExecutionManifest(
    serializeLegacyEntitlementNormalizationExecutionManifest(manifest)
  );
  if (canonicalManifest.manifestDigest !== deriveManifestDigest(canonicalManifest)) {
    throw new Error("legacy_entitlement_normalization_execution_manifest_binding_invalid");
  }
  return Object.freeze({
    manifestDigest: canonicalManifest.manifestDigest,
    snapshotDigest: canonicalManifest.snapshotDigest,
    planDigest: canonicalManifest.planDigest,
    entryCount: canonicalManifest.entries.length,
    aggregateOnly: true,
    executionAllowed: false,
    sourceChanged: false
  });
}

export function deriveLegacyEntitlementNormalizationExecutionIntentDigest(intent) {
  return hashIntent(canonicalize(intent, INTENT_CONTRACT));
}

export function serializeLegacyEntitlementNormalizationExecutionPreflightReceipt(receipt) {
  return serializeCanonicalJsonBytes(receipt, RECEIPT_CONTRACT);
}

export function evaluateLegacyEntitlementNormalizationExecutionPreflight(
  { snapshot, manifest = null, preflight },
  { evaluatedAt }
) {
  const canonicalSnapshot = parseLegacyEntitlementNormalizationSnapshot(
    serializeLegacyEntitlementNormalizationSnapshot(snapshot)
  );
  const canonicalPreflight = canonicalize(preflight, PREFLIGHT_CONTRACT);
  const evaluatedAtMs = evaluateTimestamp(evaluatedAt);
  if (canonicalPreflight.evaluatedAt !== evaluatedAt) {
    throw new Error("legacy_entitlement_normalization_execution_evaluated_at_mismatch");
  }
  const plan = buildLegacyEntitlementNormalizationPlan(canonicalSnapshot);
  const snapshotDigest = sha256Hex(serializeLegacyEntitlementNormalizationSnapshot(canonicalSnapshot));
  const intentDigest = hashIntent(canonicalPreflight.intent);
  const preflightDigest = sha256Hex(serializeCanonicalJsonBytes(canonicalPreflight, PREFLIGHT_CONTRACT));
  const remoteHandoffScopeDigest = deriveLegacyEntitlementNormalizationRemoteHandoffScopeDigest(canonicalSnapshot);
  const { intent, barrier, backups, runtime } = canonicalPreflight;
  let manifestEntriesByCaseRef = new Map();
  let executionManifestBound = manifest === null
    && intent.executionManifestDigest === null
    && intent.transitionContractDigest === null;
  if (manifest !== null && intent.executionManifestDigest !== null && intent.transitionContractDigest !== null) {
    try {
      const canonicalManifest = parseLegacyEntitlementNormalizationExecutionManifest(
        serializeLegacyEntitlementNormalizationExecutionManifest(manifest)
      );
      assertManifestBoundToSnapshot(canonicalManifest, canonicalSnapshot);
      executionManifestBound = canonicalManifest.manifestDigest === intent.executionManifestDigest
        && canonicalManifest.manifestDigest === intent.transitionContractDigest
        && canonicalManifest.entries.length <= intent.maxCases;
      if (executionManifestBound) {
        manifestEntriesByCaseRef = new Map(canonicalManifest.entries.map((entry) => [entry.caseRef, entry]));
      }
    } catch {
      executionManifestBound = false;
    }
  }

  const checks = {
    sourceBound: intent.sourceCommit === canonicalSnapshot.sourceCommit,
    snapshotBound: intent.snapshotDigest === snapshotDigest,
    snapshotFresh: Date.parse(canonicalSnapshot.observedAt) <= Date.parse(intent.issuedAt)
      && Date.parse(intent.issuedAt) - Date.parse(canonicalSnapshot.observedAt) <= MAX_SNAPSHOT_TO_INTENT_MS,
    planBound: intent.planDigest === plan.planDigest,
    executionManifestBound,
    intentDigestBound: canonicalPreflight.intentDigest === intentDigest
  };
  checks.intentCurrent = Date.parse(intent.issuedAt) <= evaluatedAtMs
    && evaluatedAtMs < Date.parse(intent.expiresAt)
    && canonicalSnapshot.cases.length <= intent.maxCases;
  checks.writeBarrierHeld = barrier.state === "held"
    && barrier.intentDigest === intentDigest
    && barrier.scopeDigest === remoteHandoffScopeDigest
    && barrier.generation > 0
    && Date.parse(intent.issuedAt) <= Date.parse(barrier.verifiedAt)
    && Date.parse(barrier.verifiedAt) <= evaluatedAtMs
    && evaluatedAtMs < Date.parse(barrier.expiresAt)
    && Date.parse(barrier.expiresAt) <= Date.parse(intent.expiresAt)
    && allBarrierWritesAreZero(barrier);
  checks.pairedBackupsVerified = backups.state === "paired_verified"
    && backups.intentDigest === intentDigest
    && Date.parse(barrier.verifiedAt) <= Date.parse(backups.verifiedAt)
    && Date.parse(backups.verifiedAt) <= evaluatedAtMs
    && new Set([
      backups.controlBackupDigest,
      backups.runtimeBackupDigest,
      backups.restoreProofDigest
    ]).size === 3;
  checks.runtimePreflightVerified = remoteHandoffScopeDigest === null
    ? runtime.state === "not_applicable"
      && runtime.intentDigest === intentDigest
      && runtime.scopeDigest === null
      && runtime.desiredStateDigest === null
      && runtime.notificationDigest === null
      && runtime.leaseDigest === null
      && runtime.receiptDigest === null
      && runtime.identityGateDigest === null
      && runtime.attestationDigest === null
      && Date.parse(backups.verifiedAt) <= Date.parse(runtime.verifiedAt)
      && Date.parse(runtime.verifiedAt) <= evaluatedAtMs
    : runtime.state === "verified_exact"
      && runtime.intentDigest === intentDigest
      && runtime.scopeDigest === remoteHandoffScopeDigest
      && runtime.attestationDigest === deriveRuntimeAttestationDigest(runtime)
      && Date.parse(backups.verifiedAt) <= Date.parse(runtime.verifiedAt)
      && Date.parse(runtime.verifiedAt) <= evaluatedAtMs;

  const reviewsByCaseRef = new Map(canonicalPreflight.caseReviews.map((review) => [review.caseRef, review]));
  checks.caseReviewsBound = reviewsByCaseRef.size === canonicalSnapshot.cases.length
    && canonicalSnapshot.cases.every((caseRecord) => {
      const review = reviewsByCaseRef.get(caseRecord.caseRef);
      return review !== undefined
        && review.sourceCaseDigest === digestLegacyEntitlementNormalizationCase(caseRecord)
        && review.sourceBindingDigest === caseRecord.sourceBindingDigest
        && (review.state !== "bound_for_external_review"
          || (
            review.intentDigest === intentDigest
            && review.executionManifestDigest === intent.executionManifestDigest
            && review.operationRef === manifestEntriesByCaseRef.get(caseRecord.caseRef)?.operationRef
            && review.resolutionDigest === intent.transitionContractDigest
            && Date.parse(runtime.verifiedAt) <= Date.parse(review.reviewedAt)
            && Date.parse(review.reviewedAt) <= evaluatedAtMs
            && evaluatedAtMs < Date.parse(review.expiresAt)
            && Date.parse(review.expiresAt) <= Date.parse(intent.expiresAt)
          ));
    });

  const globalReady = Object.values(checks).every(Boolean);
  const counts = {
    totalCases: canonicalSnapshot.cases.length,
    noServiceNoop: 0,
    blockedGlobal: 0,
    blockedCase: 0,
    reviewRequired: 0,
    candidateForSeparateRiskA: 0
  };

  for (const caseRecord of canonicalSnapshot.cases) {
    const reasons = listLegacyEntitlementNormalizationCaseReasons(caseRecord);
    const review = reviewsByCaseRef.get(caseRecord.caseRef);
    if (!globalReady) {
      counts.blockedGlobal += 1;
      continue;
    }
    if (reasons.length === 1 && reasons[0] === "no_service_noop") {
      counts.noServiceNoop += 1;
      continue;
    }
    if (hasBlockedReason(reasons)) {
      counts.blockedCase += 1;
      continue;
    }
    if (reasons.includes("requires_explicit_canonical_chain")) {
      counts.reviewRequired += 1;
      continue;
    }
    if (
      hasExternalReviewRequirement(reasons)
      && (review?.state !== "bound_for_external_review"
        || review.intentDigest !== intentDigest
        || review.executionManifestDigest !== intent.executionManifestDigest
        || review.operationRef !== manifestEntriesByCaseRef.get(caseRecord.caseRef)?.operationRef
        || review.sourceBindingDigest !== caseRecord.sourceBindingDigest
        || review.resolutionDigest !== intent.transitionContractDigest
        || !manifestEntriesByCaseRef.has(caseRecord.caseRef))
    ) {
      counts.reviewRequired += 1;
      continue;
    }
    counts.candidateForSeparateRiskA += 1;
  }

  const state = counts.blockedGlobal > 0 || counts.blockedCase > 0
    ? "blocked"
    : counts.reviewRequired > 0
      ? "review_required"
      : counts.candidateForSeparateRiskA > 0
        ? "candidate_for_separate_risk_a"
        : "no_action";
  return canonicalize({
    schemaVersion: "1",
    receiptType: "aggregate_execution_preflight_receipt",
    preflightDigest,
    evaluatedAt: canonicalPreflight.evaluatedAt,
    snapshotDigest,
    planDigest: plan.planDigest,
    intentDigest,
    runtimeAttestationDigest: runtime.state === "verified_exact" ? runtime.attestationDigest : null,
    state,
    aggregateOnly: true,
    executionAllowed: false,
    sourceChanged: false,
    externalRiskAGateRequired: true,
    attestationClaimsOnly: true,
    checks,
    counts,
    effects: zeroEffects()
  }, RECEIPT_CONTRACT);
}
