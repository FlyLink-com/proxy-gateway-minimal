import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PAYMENT_ROUTING_POLICY_KEYS_V1,
  evaluatePaymentRoutingPolicy,
} from "../services/platform/payment-routing-policy.mjs";

const POLICY_KEY = "safe_automatic_v1";
const FINGERPRINT_A = "a".repeat(64);
const FINGERPRINT_B = "b".repeat(64);
const OUTPUT_KEYS = ["action", "profileRef", "reason"];

function routingInput(overrides = {}) {
  return {
    policyKey: POLICY_KEY,
    routeProfileRefs: ["profile-a", "profile-b"],
    attemptedProfileRefs: [],
    currentAttempt: null,
    ...overrides,
  };
}

function currentAttempt(overrides = {}) {
  return {
    profileRef: "profile-a",
    dispatchState: "created",
    status: "created",
    chargeCertainty: "unknown",
    providerOrderRef: null,
    entryIssued: false,
    providerFingerprint: null,
    finalNoChargeEvidence: null,
    ...overrides,
  };
}

function finalNoChargeAttempt(overrides = {}) {
  return currentAttempt({
    dispatchState: "dispatch_prepared",
    status: "failed_no_charge",
    chargeCertainty: "confirmed_no_charge",
    providerFingerprint: FINGERPRINT_A,
    finalNoChargeEvidence: {
      kind: "provider_create_confirmed_no_order",
      providerFingerprint: FINGERPRINT_A,
    },
    ...overrides,
  });
}

function withAttempt(attempt = currentAttempt(), overrides = {}) {
  return routingInput({
    attemptedProfileRefs: ["profile-a"],
    currentAttempt: attempt,
    ...overrides,
  });
}

function assertDecision(input, expected) {
  const result = evaluatePaymentRoutingPolicy(input);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(Object.keys(result), OUTPUT_KEYS);
  assert.deepEqual(result, expected);
  assert.ok(Object.isFrozen(result));
  return result;
}

function assertRoutingError(action, code, forbidden = "synthetic-secret-marker") {
  assert.throws(action, (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.deepEqual(Object.keys(error), ["code"]);
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.doesNotMatch(JSON.stringify(error), new RegExp(forbidden, "iu"));
    return true;
  });
}

function trappingProxy(value, counters) {
  return new Proxy(value, {
    get(target, key, receiver) {
      counters.get += 1;
      return Reflect.get(target, key, receiver);
    },
    getPrototypeOf(target) {
      counters.getPrototypeOf += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      counters.ownKeys += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      counters.descriptor += 1;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
}

function zeroCounters() {
  return {
    get: 0,
    getPrototypeOf: 0,
    ownKeys: 0,
    descriptor: 0,
  };
}

test("exports exactly one immutable registered policy key", () => {
  assert.deepEqual(PAYMENT_ROUTING_POLICY_KEYS_V1, [POLICY_KEY]);
  assert.ok(Object.isFrozen(PAYMENT_ROUTING_POLICY_KEYS_V1));
});

test("unknown policy fails before parsing remaining business fields", () => {
  assertRoutingError(
    () => evaluatePaymentRoutingPolicy({ policyKey: "future_policy_v2" }),
    "payment_routing_policy_not_registered",
  );
  assertRoutingError(
    () => evaluatePaymentRoutingPolicy({
      policyKey: "synthetic-secret-marker",
      routeProfileRefs: "not-an-array",
      attemptedProfileRefs: 7,
      currentAttempt: "not-an-attempt",
      extra: true,
    }),
    "payment_routing_policy_not_registered",
  );
});

test("initial selection follows the first supplied candidate", () => {
  assertDecision(routingInput(), {
    action: "select_initial",
    profileRef: "profile-a",
    reason: "first_route_candidate",
  });
  assertDecision(routingInput({
    routeProfileRefs: ["profile-z", "profile-a", "profile-m"],
  }), {
    action: "select_initial",
    profileRef: "profile-z",
    reason: "first_route_candidate",
  });
});

test("an empty candidate route stops without selection", () => {
  assertDecision(routingInput({ routeProfileRefs: [] }), {
    action: "stop",
    profileRef: null,
    reason: "route_has_no_candidates",
  });
});

test("the exact pre-dispatch entry-unavailable row selects only the next candidate", () => {
  assertDecision(withAttempt(currentAttempt({
    status: "entry_unavailable",
  })), {
    action: "select_fallback",
    profileRef: "profile-b",
    reason: "pre_dispatch_entry_unavailable",
  });
});

test("provider-create final-no-charge evidence permits a fingerprint-bound fallback", () => {
  assertDecision(withAttempt(finalNoChargeAttempt()), {
    action: "select_fallback",
    profileRef: "profile-b",
    reason: "final_no_charge_evidence",
  });
});

test("provider-query final-no-charge evidence requires and accepts a provider order", () => {
  assertDecision(withAttempt(finalNoChargeAttempt({
    providerOrderRef: "order-a",
    finalNoChargeEvidence: {
      kind: "provider_query_final_no_charge",
      providerFingerprint: FINGERPRINT_A,
    },
  })), {
    action: "select_fallback",
    profileRef: "profile-b",
    reason: "final_no_charge_evidence",
  });
});

test("fallback retains supplied route order as the only tie-break", () => {
  assertDecision(withAttempt(
    currentAttempt({ status: "entry_unavailable" }),
    {
      routeProfileRefs: ["profile-a", "profile-z", "profile-b"],
    },
  ), {
    action: "select_fallback",
    profileRef: "profile-z",
    reason: "pre_dispatch_entry_unavailable",
  });
});

test("an exhausted safe chain stops and never wraps around", () => {
  for (const attempt of [
    currentAttempt({ status: "entry_unavailable" }),
    finalNoChargeAttempt(),
  ]) {
    assertDecision(withAttempt(attempt, {
      routeProfileRefs: ["profile-a"],
    }), {
      action: "stop",
      profileRef: null,
      reason: "candidate_chain_exhausted",
    });
  }
});

test("a normal active attempt stops without selecting a concurrent attempt", () => {
  assertDecision(withAttempt(currentAttempt()), {
    action: "stop",
    profileRef: null,
    reason: "current_attempt_active",
  });
  assertDecision(withAttempt(currentAttempt({
    dispatchState: "dispatch_prepared",
    status: "entry_ready",
    chargeCertainty: "confirmed_no_charge",
    providerOrderRef: "order-a",
    entryIssued: true,
    providerFingerprint: FINGERPRINT_A,
  })), {
    action: "stop",
    profileRef: null,
    reason: "current_attempt_active",
  });
});

test("dispatch crashes, pending work, provider exceptions, and ambiguous outcomes reconcile", () => {
  const cases = [
    currentAttempt({
      dispatchState: "dispatch_prepared",
      status: "dispatch_prepared",
      providerFingerprint: FINGERPRINT_A,
    }),
    currentAttempt({
      dispatchState: "dispatch_prepared",
      status: "pending",
      chargeCertainty: "possibly_charged",
      providerOrderRef: "order-a",
      providerFingerprint: FINGERPRINT_A,
    }),
    currentAttempt({
      dispatchState: "dispatch_prepared",
      status: "reconciliation_required",
      chargeCertainty: "unknown",
      providerFingerprint: FINGERPRINT_A,
    }),
    finalNoChargeAttempt({
      chargeCertainty: "unknown",
      finalNoChargeEvidence: null,
    }),
    finalNoChargeAttempt({
      chargeCertainty: "possibly_charged",
      finalNoChargeEvidence: null,
    }),
  ];

  for (const attempt of cases) {
    assertDecision(withAttempt(attempt), {
      action: "reconcile",
      profileRef: null,
      reason: "dispatch_outcome_uncertain",
    });
  }
});

test("a provider order without final-no-charge evidence must reconcile", () => {
  assertDecision(withAttempt(finalNoChargeAttempt({
    providerOrderRef: "order-a",
    finalNoChargeEvidence: null,
  })), {
    action: "reconcile",
    profileRef: null,
    reason: "final_no_charge_evidence_missing",
  });
});

test("an issued payment entry forbids automatic fallback", () => {
  assertDecision(withAttempt(finalNoChargeAttempt({
    entryIssued: true,
  })), {
    action: "reconcile",
    profileRef: null,
    reason: "payment_entry_already_issued",
  });
});

test("succeeded and reversed attempts stop", () => {
  for (const [status, reason] of [
    ["succeeded", "payment_succeeded"],
    ["reversed", "payment_reversed"],
  ]) {
    assertDecision(withAttempt(currentAttempt({
      dispatchState: "dispatch_prepared",
      status,
      chargeCertainty: "confirmed_charged",
      providerOrderRef: "order-a",
      entryIssued: true,
      providerFingerprint: FINGERPRINT_A,
    })), {
      action: "stop",
      profileRef: null,
      reason,
    });
  }
});

test("contradictory succeeded and reversed states reconcile", () => {
  for (const status of ["succeeded", "reversed"]) {
    for (const chargeCertainty of [
      "unknown",
      "possibly_charged",
      "confirmed_no_charge",
    ]) {
      assertDecision(withAttempt(currentAttempt({
        dispatchState: "dispatch_prepared",
        status,
        chargeCertainty,
        providerOrderRef: "order-a",
        entryIssued: true,
        providerFingerprint: FINGERPRINT_A,
      })), {
        action: "reconcile",
        profileRef: null,
        reason: "attempt_state_inconsistent",
      });
    }
    assertDecision(withAttempt(currentAttempt({
      dispatchState: "dispatch_prepared",
      status,
      chargeCertainty: "confirmed_charged",
      providerOrderRef: null,
      entryIssued: true,
      providerFingerprint: FINGERPRINT_A,
    })), {
      action: "reconcile",
      profileRef: null,
      reason: "attempt_state_inconsistent",
    });
  }
});

test("missing, mismatched, or kind-incompatible final evidence reconciles", () => {
  assertDecision(withAttempt(finalNoChargeAttempt({
    finalNoChargeEvidence: null,
  })), {
    action: "reconcile",
    profileRef: null,
    reason: "final_no_charge_evidence_missing",
  });
  assertDecision(withAttempt(finalNoChargeAttempt({
    finalNoChargeEvidence: {
      kind: "provider_create_confirmed_no_order",
      providerFingerprint: FINGERPRINT_B,
    },
  })), {
    action: "reconcile",
    profileRef: null,
    reason: "final_no_charge_evidence_mismatch",
  });
  assertDecision(withAttempt(finalNoChargeAttempt({
    providerOrderRef: "order-a",
  })), {
    action: "reconcile",
    profileRef: null,
    reason: "final_no_charge_evidence_mismatch",
  });
  assertDecision(withAttempt(finalNoChargeAttempt({
    finalNoChargeEvidence: {
      kind: "provider_query_final_no_charge",
      providerFingerprint: FINGERPRINT_A,
    },
  })), {
    action: "reconcile",
    profileRef: null,
    reason: "final_no_charge_evidence_mismatch",
  });
});

test("attempt chains must be duplicate-free prefixes whose current attempt is the tail", () => {
  const inconsistentInputs = [
    routingInput({
      routeProfileRefs: ["profile-a", "profile-a"],
    }),
    withAttempt(currentAttempt(), {
      attemptedProfileRefs: ["profile-a", "profile-a"],
    }),
    withAttempt(currentAttempt({ profileRef: "profile-b" }), {
      attemptedProfileRefs: ["profile-b"],
    }),
    withAttempt(currentAttempt({ profileRef: "profile-c" }), {
      attemptedProfileRefs: ["profile-a"],
    }),
    routingInput({
      attemptedProfileRefs: ["profile-a"],
      currentAttempt: null,
    }),
    withAttempt(currentAttempt({ profileRef: "profile-a" }), {
      routeProfileRefs: ["profile-a", "profile-b"],
      attemptedProfileRefs: ["profile-a", "profile-b"],
    }),
  ];

  for (const input of inconsistentInputs) {
    assertDecision(input, {
      action: "reconcile",
      profileRef: null,
      reason: "attempt_chain_inconsistent",
    });
  }
});

test("dispatch-boundary contradictions reconcile as attempt-state inconsistencies", () => {
  const inconsistentAttempts = [
    currentAttempt({ providerFingerprint: FINGERPRINT_A }),
    currentAttempt({
      dispatchState: "dispatch_prepared",
      status: "entry_ready",
      chargeCertainty: "confirmed_no_charge",
      providerFingerprint: null,
    }),
    currentAttempt({
      dispatchState: "created",
      status: "entry_ready",
    }),
    currentAttempt({
      status: "created",
      providerOrderRef: "order-a",
    }),
    currentAttempt({
      status: "created",
      entryIssued: true,
    }),
    currentAttempt({
      status: "created",
      finalNoChargeEvidence: {
        kind: "provider_create_confirmed_no_order",
        providerFingerprint: FINGERPRINT_A,
      },
    }),
  ];

  for (const attempt of inconsistentAttempts) {
    assertDecision(withAttempt(attempt), {
      action: "reconcile",
      profileRef: null,
      reason: "attempt_state_inconsistent",
    });
  }
});

test("table-driven combinations prove automatic fallback is limited to the safe paths", () => {
  const cases = [
    {
      name: "safe pre-dispatch",
      attempt: currentAttempt({ status: "entry_unavailable" }),
      action: "select_fallback",
    },
    {
      name: "safe create final evidence",
      attempt: finalNoChargeAttempt(),
      action: "select_fallback",
    },
    {
      name: "safe query final evidence",
      attempt: finalNoChargeAttempt({
        providerOrderRef: "order-a",
        finalNoChargeEvidence: {
          kind: "provider_query_final_no_charge",
          providerFingerprint: FINGERPRINT_A,
        },
      }),
      action: "select_fallback",
    },
    {
      name: "pre-dispatch wrong certainty",
      attempt: currentAttempt({
        status: "entry_unavailable",
        chargeCertainty: "confirmed_no_charge",
      }),
      action: "reconcile",
    },
    {
      name: "pre-dispatch order exists",
      attempt: currentAttempt({
        status: "entry_unavailable",
        providerOrderRef: "order-a",
      }),
      action: "reconcile",
    },
    {
      name: "pre-dispatch entry issued",
      attempt: currentAttempt({
        status: "entry_unavailable",
        entryIssued: true,
      }),
      action: "reconcile",
    },
    {
      name: "post-dispatch unknown certainty",
      attempt: finalNoChargeAttempt({
        chargeCertainty: "unknown",
      }),
      action: "reconcile",
    },
    {
      name: "post-dispatch possibly charged",
      attempt: finalNoChargeAttempt({
        chargeCertainty: "possibly_charged",
      }),
      action: "reconcile",
    },
    {
      name: "post-dispatch confirmed charged",
      attempt: finalNoChargeAttempt({
        chargeCertainty: "confirmed_charged",
      }),
      action: "reconcile",
    },
    {
      name: "post-dispatch issued entry",
      attempt: finalNoChargeAttempt({
        entryIssued: true,
      }),
      action: "reconcile",
    },
    {
      name: "post-dispatch missing evidence",
      attempt: finalNoChargeAttempt({
        finalNoChargeEvidence: null,
      }),
      action: "reconcile",
    },
  ];

  for (const { name, attempt, action } of cases) {
    assert.equal(
      evaluatePaymentRoutingPolicy(withAttempt(attempt)).action,
      action,
      name,
    );
  }
  assert.equal(
    cases.filter(({ action }) => action === "select_fallback").length,
    3,
  );
});

test("known policy input rejects missing or extra fields with a fixed safe error", () => {
  const invalidInputs = [];
  for (const key of [
    "policyKey",
    "routeProfileRefs",
    "attemptedProfileRefs",
    "currentAttempt",
  ]) {
    const input = routingInput();
    delete input[key];
    invalidInputs.push(input);
  }
  invalidInputs.push({ ...routingInput(), extra: "synthetic-secret-marker" });

  for (const input of invalidInputs) {
    assertRoutingError(
      () => evaluatePaymentRoutingPolicy(input),
      "invalid_payment_routing_policy_input",
    );
  }
});

test("closed nested values reject missing and extra fields", () => {
  const missingAttemptField = currentAttempt();
  delete missingAttemptField.status;
  const extraAttemptField = {
    ...currentAttempt(),
    secret: "synthetic-secret-marker",
  };
  const missingEvidenceField = {
    kind: "provider_create_confirmed_no_order",
  };
  const extraEvidenceField = {
    kind: "provider_create_confirmed_no_order",
    providerFingerprint: FINGERPRINT_A,
    secret: "synthetic-secret-marker",
  };
  for (const attempt of [
    missingAttemptField,
    extraAttemptField,
    currentAttempt({ finalNoChargeEvidence: missingEvidenceField }),
    currentAttempt({ finalNoChargeEvidence: extraEvidenceField }),
  ]) {
    assertRoutingError(
      () => evaluatePaymentRoutingPolicy(withAttempt(attempt)),
      "invalid_payment_routing_policy_input",
    );
  }
});

test("invalid refs, enums, booleans, and fingerprints fail structurally", () => {
  const invalidInputs = [
    routingInput({ routeProfileRefs: [""] }),
    routingInput({ routeProfileRefs: ["unsafe ref"] }),
    routingInput({ attemptedProfileRefs: ["../unsafe"] }),
    withAttempt(currentAttempt({ profileRef: "unsafe/ref" })),
    withAttempt(currentAttempt({ dispatchState: "sent" })),
    withAttempt(currentAttempt({ status: "timeout" })),
    withAttempt(currentAttempt({ chargeCertainty: "maybe" })),
    withAttempt(currentAttempt({ providerOrderRef: "unsafe order" })),
    withAttempt(currentAttempt({ entryIssued: 0 })),
    withAttempt(currentAttempt({ providerFingerprint: "A".repeat(64) })),
    withAttempt(currentAttempt({ providerFingerprint: "a".repeat(63) })),
    withAttempt(currentAttempt({
      finalNoChargeEvidence: {
        kind: "unsupported_kind",
        providerFingerprint: FINGERPRINT_A,
      },
    })),
    withAttempt(currentAttempt({
      finalNoChargeEvidence: {
        kind: "provider_create_confirmed_no_order",
        providerFingerprint: "f".repeat(65),
      },
    })),
  ];
  for (const input of invalidInputs) {
    assertRoutingError(
      () => evaluatePaymentRoutingPolicy(input),
      "invalid_payment_routing_policy_input",
    );
  }
});

test("sparse, symbolic, accessor-backed, or exotic arrays and objects are rejected", () => {
  const sparse = [];
  sparse.length = 1;
  const symbolicArray = ["profile-a"];
  symbolicArray[Symbol("synthetic-secret-marker")] = true;
  const exoticArray = Object.setPrototypeOf(["profile-a"], null);
  const symbolicInput = routingInput();
  symbolicInput[Symbol("synthetic-secret-marker")] = true;
  const exoticInput = Object.assign(Object.create(null), routingInput());
  const symbolicAttempt = currentAttempt();
  symbolicAttempt[Symbol("synthetic-secret-marker")] = true;
  const exoticAttempt = Object.assign(Object.create(null), currentAttempt());

  let topAccessorCalls = 0;
  const accessorInput = routingInput();
  Object.defineProperty(accessorInput, "routeProfileRefs", {
    enumerable: true,
    get() {
      topAccessorCalls += 1;
      return ["synthetic-secret-marker"];
    },
  });

  let attemptAccessorCalls = 0;
  const accessorAttempt = currentAttempt();
  Object.defineProperty(accessorAttempt, "status", {
    enumerable: true,
    get() {
      attemptAccessorCalls += 1;
      return "synthetic-secret-marker";
    },
  });

  const invalidInputs = [
    routingInput({ routeProfileRefs: sparse }),
    routingInput({ routeProfileRefs: symbolicArray }),
    routingInput({ routeProfileRefs: exoticArray }),
    symbolicInput,
    exoticInput,
    accessorInput,
    withAttempt(symbolicAttempt),
    withAttempt(exoticAttempt),
    withAttempt(accessorAttempt),
  ];
  for (const input of invalidInputs) {
    assertRoutingError(
      () => evaluatePaymentRoutingPolicy(input),
      "invalid_payment_routing_policy_input",
    );
  }
  assert.equal(topAccessorCalls, 0);
  assert.equal(attemptAccessorCalls, 0);
});

test("Proxies are rejected at every level without executing traps", () => {
  const cases = [
    {
      counters: zeroCounters(),
      build(proxy) {
        return proxy;
      },
      value: routingInput(),
    },
    {
      counters: zeroCounters(),
      build(proxy) {
        return routingInput({ routeProfileRefs: proxy });
      },
      value: ["profile-a"],
    },
    {
      counters: zeroCounters(),
      build(proxy) {
        return routingInput({ attemptedProfileRefs: proxy });
      },
      value: [],
    },
    {
      counters: zeroCounters(),
      build(proxy) {
        return withAttempt(proxy);
      },
      value: currentAttempt(),
    },
    {
      counters: zeroCounters(),
      build(proxy) {
        return withAttempt(currentAttempt({
          finalNoChargeEvidence: proxy,
        }));
      },
      value: {
        kind: "provider_create_confirmed_no_order",
        providerFingerprint: FINGERPRINT_A,
      },
    },
  ];

  for (const item of cases) {
    const proxy = trappingProxy(item.value, item.counters);
    assertRoutingError(
      () => evaluatePaymentRoutingPolicy(item.build(proxy)),
      "invalid_payment_routing_policy_input",
    );
    assert.deepEqual(item.counters, zeroCounters());
  }
});

test("outputs are fresh, detached, deterministic, and contain no internal markers", () => {
  const input = routingInput();
  const first = evaluatePaymentRoutingPolicy(input);
  const second = evaluatePaymentRoutingPolicy(input);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), OUTPUT_KEYS);
  assert.equal("policyKey" in first, false);
  assert.equal("attempt" in first, false);
  assert.equal("evidence" in first, false);
  assert.equal("providerFingerprint" in first, false);

  input.routeProfileRefs[0] = "profile-mutated";
  assert.equal(first.profileRef, "profile-a");
  assert.throws(() => {
    first.action = "reconcile";
  }, TypeError);
});

test("errors never expose attacker-controlled refs, fingerprints, or causes", () => {
  const marker = "synthetic-secret-marker";
  let captured;
  try {
    evaluatePaymentRoutingPolicy(routingInput({
      routeProfileRefs: [`${marker}/unsafe`],
    }));
  } catch (error) {
    captured = error;
  }
  assert.ok(captured instanceof Error);
  assert.doesNotMatch(JSON.stringify(captured), new RegExp(marker, "u"));
  assert.equal(Object.hasOwn(captured, "cause"), false);
});

test("routing source is pure, static, and free of integration wiring", async () => {
  const source = await readFile(
    new URL(
      "../services/platform/payment-routing-policy.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /from\s+["']node:(?:fs|http|https|net)/u);
  assert.doesNotMatch(source, /\bimport\s*\(/u);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|axios|undici)\b/u);
  assert.doesNotMatch(source, /\bprocess\.env\b/u);
  assert.doesNotMatch(source, /\b(?:Date|setTimeout|setInterval)\b/u);
  assert.doesNotMatch(source, /\bMath\.random\b/u);
  assert.doesNotMatch(source, /\bconsole\./u);
  assert.doesNotMatch(source, /\b(?:Store|SQLite|Registry|Adapter|wallet)\b/iu);
  assert.doesNotMatch(source, /\b(?:router|listen|server)\b/iu);
});
