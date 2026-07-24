import { types as utilTypes } from "node:util";

export const PAYMENT_ROUTING_POLICY_KEYS_V1 = Object.freeze([
  "safe_automatic_v1",
]);

const INPUT_KEYS = Object.freeze([
  "policyKey",
  "routeProfileRefs",
  "attemptedProfileRefs",
  "currentAttempt",
]);
const ATTEMPT_KEYS = Object.freeze([
  "profileRef",
  "dispatchState",
  "status",
  "chargeCertainty",
  "providerOrderRef",
  "entryIssued",
  "providerFingerprint",
  "finalNoChargeEvidence",
]);
const EVIDENCE_KEYS = Object.freeze([
  "kind",
  "providerFingerprint",
]);
const DISPATCH_STATES = new Set([
  "created",
  "dispatch_prepared",
]);
const ATTEMPT_STATUSES = new Set([
  "created",
  "entry_unavailable",
  "dispatch_prepared",
  "entry_ready",
  "pending",
  "succeeded",
  "failed_no_charge",
  "reconciliation_required",
  "reversed",
]);
const CHARGE_CERTAINTIES = new Set([
  "confirmed_no_charge",
  "unknown",
  "possibly_charged",
  "confirmed_charged",
]);
const EVIDENCE_KINDS = new Set([
  "provider_create_confirmed_no_order",
  "provider_query_final_no_charge",
]);
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FINGERPRINT_RE = /^[a-f0-9]{64}$/;
const INVALID_INPUT = "invalid_payment_routing_policy_input";
const POLICY_NOT_REGISTERED = "payment_routing_policy_not_registered";

function routingError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function inspectDataObject(value) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw routingError(INVALID_INPUT);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string")
    || keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value")
        || descriptor.enumerable !== true
      );
    })
  ) {
    throw routingError(INVALID_INPUT);
  }
  return { descriptors, keys };
}

function snapshotDataObject(value, expectedKeys) {
  const inspected = inspectDataObject(value);
  if (
    inspected.keys.length !== expectedKeys.length
    || expectedKeys.some((key) => !Object.hasOwn(inspected.descriptors, key))
  ) {
    throw routingError(INVALID_INPUT);
  }
  const result = {};
  for (const key of expectedKeys) {
    result[key] = inspected.descriptors[key].value;
  }
  return result;
}

function snapshotArray(value) {
  if (
    utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) {
    throw routingError(INVALID_INPUT);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (
    keys.some((key) => typeof key !== "string")
    || !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || keys.length !== lengthDescriptor.value + 1
  ) {
    throw routingError(INVALID_INPUT);
  }
  const result = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) {
      throw routingError(INVALID_INPUT);
    }
    result.push(descriptor.value);
  }
  return result;
}

function assertSafeRef(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !SAFE_REF_RE.test(value)) {
    throw routingError(INVALID_INPUT);
  }
  return value;
}

function assertFingerprint(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !FINGERPRINT_RE.test(value)) {
    throw routingError(INVALID_INPUT);
  }
  return value;
}

function snapshotEvidence(value) {
  if (value === null) return null;
  const evidence = snapshotDataObject(value, EVIDENCE_KEYS);
  if (!EVIDENCE_KINDS.has(evidence.kind)) {
    throw routingError(INVALID_INPUT);
  }
  return {
    kind: evidence.kind,
    providerFingerprint: assertFingerprint(evidence.providerFingerprint),
  };
}

function snapshotAttempt(value) {
  if (value === null) return null;
  const attempt = snapshotDataObject(value, ATTEMPT_KEYS);
  if (
    !DISPATCH_STATES.has(attempt.dispatchState)
    || !ATTEMPT_STATUSES.has(attempt.status)
    || !CHARGE_CERTAINTIES.has(attempt.chargeCertainty)
    || typeof attempt.entryIssued !== "boolean"
  ) {
    throw routingError(INVALID_INPUT);
  }
  return {
    profileRef: assertSafeRef(attempt.profileRef),
    dispatchState: attempt.dispatchState,
    status: attempt.status,
    chargeCertainty: attempt.chargeCertainty,
    providerOrderRef: assertSafeRef(attempt.providerOrderRef, true),
    entryIssued: attempt.entryIssued,
    providerFingerprint: assertFingerprint(
      attempt.providerFingerprint,
      true,
    ),
    finalNoChargeEvidence: snapshotEvidence(
      attempt.finalNoChargeEvidence,
    ),
  };
}

function snapshotInput(value) {
  const inspected = inspectDataObject(value);
  const policyDescriptor = inspected.descriptors.policyKey;
  if (
    !policyDescriptor
    || typeof policyDescriptor.value !== "string"
  ) {
    throw routingError(INVALID_INPUT);
  }
  if (policyDescriptor.value !== "safe_automatic_v1") {
    throw routingError(POLICY_NOT_REGISTERED);
  }
  if (
    inspected.keys.length !== INPUT_KEYS.length
    || INPUT_KEYS.some((key) => !Object.hasOwn(inspected.descriptors, key))
  ) {
    throw routingError(INVALID_INPUT);
  }

  const routeProfileRefs = snapshotArray(
    inspected.descriptors.routeProfileRefs.value,
  ).map((profileRef) => assertSafeRef(profileRef));
  const attemptedProfileRefs = snapshotArray(
    inspected.descriptors.attemptedProfileRefs.value,
  ).map((profileRef) => assertSafeRef(profileRef));
  return {
    routeProfileRefs,
    attemptedProfileRefs,
    currentAttempt: snapshotAttempt(
      inspected.descriptors.currentAttempt.value,
    ),
  };
}

function decision(action, profileRef, reason) {
  return Object.freeze({
    action,
    profileRef,
    reason,
  });
}

function reconcile(reason) {
  return decision("reconcile", null, reason);
}

function stop(reason) {
  return decision("stop", null, reason);
}

function hasDuplicate(values) {
  return new Set(values).size !== values.length;
}

function attemptChainIsConsistent(input) {
  const { routeProfileRefs, attemptedProfileRefs, currentAttempt } = input;
  if (
    hasDuplicate(routeProfileRefs)
    || hasDuplicate(attemptedProfileRefs)
    || attemptedProfileRefs.length > routeProfileRefs.length
  ) {
    return false;
  }
  for (let index = 0; index < attemptedProfileRefs.length; index += 1) {
    if (attemptedProfileRefs[index] !== routeProfileRefs[index]) return false;
  }
  if (currentAttempt === null) return attemptedProfileRefs.length === 0;
  if (attemptedProfileRefs.length === 0) return false;
  return (
    currentAttempt.profileRef
    === attemptedProfileRefs[attemptedProfileRefs.length - 1]
  );
}

function attemptStateIsConsistent(attempt) {
  if (attempt.dispatchState === "created") {
    return (
      attempt.providerFingerprint === null
      && attempt.providerOrderRef === null
      && attempt.entryIssued === false
      && attempt.finalNoChargeEvidence === null
      && attempt.chargeCertainty === "unknown"
      && (
        attempt.status === "created"
        || attempt.status === "entry_unavailable"
      )
    );
  }
  return (
    attempt.providerFingerprint !== null
    && attempt.status !== "created"
    && attempt.status !== "entry_unavailable"
    && (
      attempt.status === "failed_no_charge"
      || attempt.finalNoChargeEvidence === null
    )
  );
}

function nextCandidateOrExhausted(input, reason) {
  const nextProfileRef = input.routeProfileRefs[
    input.attemptedProfileRefs.length
  ];
  if (nextProfileRef === undefined) {
    return stop("candidate_chain_exhausted");
  }
  return decision("select_fallback", nextProfileRef, reason);
}

function evaluateCurrentAttempt(input) {
  const attempt = input.currentAttempt;
  if (!attemptStateIsConsistent(attempt)) {
    return reconcile("attempt_state_inconsistent");
  }
  if (attempt.dispatchState === "created") {
    if (attempt.status === "entry_unavailable") {
      return nextCandidateOrExhausted(
        input,
        "pre_dispatch_entry_unavailable",
      );
    }
    return stop("current_attempt_active");
  }
  if (attempt.status === "succeeded" || attempt.status === "reversed") {
    if (
      attempt.chargeCertainty !== "confirmed_charged"
      || attempt.providerOrderRef === null
    ) {
      return reconcile("attempt_state_inconsistent");
    }
    return stop(
      attempt.status === "succeeded"
        ? "payment_succeeded"
        : "payment_reversed",
    );
  }
  if (attempt.status === "entry_ready") {
    if (attempt.chargeCertainty === "confirmed_no_charge") {
      return reconcile("attempt_state_inconsistent");
    }
    return reconcile("dispatch_outcome_uncertain");
  }
  if (attempt.status !== "failed_no_charge") {
    return reconcile("dispatch_outcome_uncertain");
  }
  if (attempt.entryIssued) {
    return reconcile("payment_entry_already_issued");
  }
  if (attempt.chargeCertainty !== "confirmed_no_charge") {
    return reconcile("dispatch_outcome_uncertain");
  }
  const evidence = attempt.finalNoChargeEvidence;
  if (evidence === null) {
    return reconcile("final_no_charge_evidence_missing");
  }
  const fingerprintMatches = (
    evidence.providerFingerprint === attempt.providerFingerprint
  );
  const evidenceMatchesOrder = (
    (
      evidence.kind === "provider_create_confirmed_no_order"
      && attempt.providerOrderRef === null
    )
    || (
      evidence.kind === "provider_query_final_no_charge"
      && attempt.providerOrderRef !== null
    )
  );
  if (!fingerprintMatches || !evidenceMatchesOrder) {
    return reconcile("final_no_charge_evidence_mismatch");
  }
  return nextCandidateOrExhausted(input, "final_no_charge_evidence");
}

export function evaluatePaymentRoutingPolicy(input) {
  const snapshot = snapshotInput(input);
  if (!attemptChainIsConsistent(snapshot)) {
    return reconcile("attempt_chain_inconsistent");
  }
  if (snapshot.currentAttempt !== null) {
    return evaluateCurrentAttempt(snapshot);
  }
  if (snapshot.routeProfileRefs.length === 0) {
    return stop("route_has_no_candidates");
  }
  return decision(
    "select_initial",
    snapshot.routeProfileRefs[0],
    "first_route_candidate",
  );
}
