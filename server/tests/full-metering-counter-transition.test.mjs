import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { transitionFullMeteringCounters as transition, reconcileVerifiedFullMeteringScope as reconcile, advanceVerifiedFullMeteringGeneration as advance } from "../services/edge/full-metering-counter-transition.mjs";

const t0 = "2026-09-08T06:00:00.000Z";
const t1 = "2026-09-08T06:00:10.000Z";
const t2 = "2026-09-08T06:00:20.000Z";
const t3 = "2026-09-08T06:00:30.000Z";
const pair = (edgeCredentialRef, uploadBytes = 100, downloadBytes = 200, connectionId) => ({
  edgeCredentialRef, uploadBytes, downloadBytes,
  ...(connectionId === undefined ? {} : { connectionId })
});
function input(overrides = {}) {
  return { state: null, mode: "cumulative", sourceRef: "source-a", channelRef: "channel-a",
    generation: "a".repeat(64), eligibleRefs: ["user-a", "user-b"], retainedRefs: ["retained-a"],
    observedAt: t1, now: t1, minObservedAt: t0, maxAgeMs: 60000, observations: [], ...overrides };
}
function step(state, observations, overrides = {}) {
  return transition(input({ state, observations, observedAt: t2, now: t2, ...overrides }));
}
const rejects = (fn, code) => assert.throws(fn, (error) => error.code === code && !error.message.includes("user-a"));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
function rehash(state) {
  const { stateDigest: ignored, ...payload } = state;
  return { ...payload, stateDigest: createHash("sha256").update(canonical(payload)).digest("hex") };
}

test("full metering: absent eligible pairs remain pending without synthetic counters", () => {
  const result = transition(input());
  assert.equal(result.nextState.generation, "a".repeat(64));
  assert.deepEqual(result.nextState.entries.map(e => [e.edgeCredentialRef, e.status, e.cursor]),
    [["user-a", "pending_start", null], ["user-b", "pending_start", null]]);
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.counters, []);
  assert.equal(result.summary.pendingCount, 2);
  assert.equal(result.totals.totalBytes, 0);
});

test("full metering: first real pair is a nonzero baseline and only later increments count", () => {
  const first = transition(input({ observations: [pair("user-a", 700, 900)] }));
  assert.deepEqual(first.deltas, []);
  assert.equal(first.nextState.entries[0].cursor.uploadBytes, 700);
  assert.equal(first.summary.observedCount, 1);
  const second = step(first.nextState, [pair("user-a", 710, 920), pair("user-b", 9000, 8000)]);
  assert.deepEqual(second.deltas, [{ edgeCredentialRef: "user-a", uploadBytes: 10, downloadBytes: 20, totalBytes: 30, intervalStartedAt: t1, intervalEndedAt: t2 }]);
  assert.deepEqual(second.totals, { uploadBytes: 10, downloadBytes: 20, totalBytes: 30 });
  assert.equal(second.nextState.entries[1].cursor.uploadBytes, 9000);
  assert.equal(second.summary.initializedCount, 1);
});

test("full metering: exact replay is no-op while later identical counters advance timestamp only", () => {
  const request = input({ observations: [pair("user-a")] });
  const first = transition(request);
  const replay = transition({ ...request, state: first.nextState });
  assert.equal(replay.unchanged, true);
  assert.deepEqual(replay.nextState, first.nextState);
  assert.deepEqual(replay.deltas, []);
  const later = step(first.nextState, request.observations);
  assert.equal(later.unchanged, false);
  assert.deepEqual(later.deltas, []);
  assert.equal(later.nextState.lastObservedAt, t2);
});

test("full metering: same timestamp changed values or retained payload reject", () => {
  const state = transition(input({ observations: [pair("user-a"), pair("retained-a")] })).nextState;
  for (const observations of [[pair("user-a", 101), pair("retained-a")], [pair("user-a")]]) {
    rejects(() => transition(input({ state, observations })), "observation_replay_conflict");
  }
});

test("full metering: ordering is canonical for scope, observations and exact replay", () => {
  const request = input({ observations: [pair("user-a"), pair("user-b"), pair("retained-a")] });
  const first = transition(request);
  const replay = transition({ ...request, state: first.nextState, eligibleRefs: ["user-b", "user-a"], observations: [...request.observations].reverse() });
  assert.equal(replay.unchanged, true);
});

test("full metering: previously observed cumulative pair disappearing fails closed", () => {
  const state = transition(input({ observations: [pair("user-a")] })).nextState;
  rejects(() => step(state, []), "observed_counter_missing");
});

test("full metering: either direction decreasing rejects without automatic epoch or reset", () => {
  const state = transition(input({ observations: [pair("user-a")] })).nextState;
  for (const p of [pair("user-a", 99, 201), pair("user-a", 101, 199)]) {
    rejects(() => step(state, [p]), "counter_decreased");
  }
});

test("full metering: generation changes reject even when all entries remain pending", () => {
  for (const observations of [[], [pair("user-a")]]) {
    const state = transition(input({ observations })).nextState;
    rejects(() => step(state, observations, { generation: "b".repeat(64) }), "source_generation_changed");
  }
});

test("full metering: scope changes cannot silently drop or add identities", () => {
  const state = transition(input()).nextState;
  for (const change of [{ sourceRef: "source-b" }, { channelRef: "channel-b" }, { eligibleRefs: ["user-a"] },
    { retainedRefs: [] }, { mode: "connections" }, { minObservedAt: "2026-09-08T05:59:00.000Z" }]) {
    rejects(() => step(state, [], change), "counter_scope_changed");
  }
});

test("full metering: retained data is validated but never establishes an eligible baseline", () => {
  const result = transition(input({ observations: [pair("retained-a", 9000, 8000)] }));
  assert.equal(result.summary.retainedObservationCount, 1);
  assert.equal(result.summary.pendingCount, 2);
  assert.deepEqual(result.counters, []);
  assert.deepEqual(result.deltas, []);
});

for (const [name, observations, code] of [
  ["unknown identity", [pair("unknown-a")], "unknown_counter_identity"],
  ["half pair", [{ edgeCredentialRef: "user-a", uploadBytes: 1 }], "counter_input_invalid"],
  ["retained half pair", [{ edgeCredentialRef: "retained-a", uploadBytes: 1 }], "counter_input_invalid"],
  ["duplicate eligible", [pair("user-a"), pair("user-a")], "counter_input_invalid"],
  ["duplicate retained", [pair("retained-a"), pair("retained-a")], "counter_input_invalid"],
  ["negative", [pair("user-a", -1)], "counter_input_invalid"],
  ["string byte count", [pair("user-a", "100")], "counter_input_invalid"],
  ["fraction", [pair("user-a", 1.5)], "counter_input_invalid"],
  ["unsafe total", [pair("user-a", Number.MAX_SAFE_INTEGER, 1)], "counter_input_invalid"],
  ["nonfinite", [pair("user-a", NaN)], "counter_input_invalid"],
  ["unknown property", [{ ...pair("user-a"), reset: true }], "counter_input_invalid"]
]) test(`full metering: rejects ${name}`, () => rejects(() => transition(input({ observations })), code));

test("full metering: reference lists reject duplicates, overlap, empty eligibility and malformed keys", () => {
  for (const patch of [{ eligibleRefs: [] }, { eligibleRefs: ["user-a", "user-a"] },
    { retainedRefs: ["user-a"] }, { eligibleRefs: [" user-a"] }, { generation: "not-a-hash" }]) {
    rejects(() => transition(input(patch)), "counter_input_invalid");
  }
});

test("full metering: stale, future, pre-boundary and noncanonical timestamps reject", () => {
  for (const patch of [{ now: "2026-09-08T06:01:10.001Z" }, { now: t0 }, { observedAt: "2026-09-08T05:59:59.999Z" },
    { observedAt: "2026-09-08T06:00:10Z" }, { maxAgeMs: 0 }]) {
    rejects(() => transition(input(patch)), "counter_input_invalid");
  }
  const state = transition(input()).nextState;
  rejects(() => step(state, [], { observedAt: t0 }), "observation_out_of_order");
});

test("full metering: byte-identical replay still needs fresh observation age", () => {
  const state = transition(input()).nextState;
  rejects(() => transition(input({ state, now: "2026-09-08T06:01:10.001Z" })), "counter_input_invalid");
});

test("full metering: input state is immutable on successful and rejected transitions", () => {
  const request = input({ observations: [pair("user-a")] });
  const beforeRequest = structuredClone(request);
  const state = transition(request).nextState;
  const beforeState = structuredClone(state);
  const later = step(state, [pair("user-a", 101, 202)]);
  rejects(() => step(state, []), "observed_counter_missing");
  assert.deepEqual(request, beforeRequest);
  assert.deepEqual(state, beforeState);
  later.nextState.entries[0].cursor.uploadBytes = 999;
  assert.deepEqual(state, beforeState);
});

test("full metering: incomplete or rehashed corrupt state cannot reset missing cursor", () => {
  const state = transition(input({ observations: [pair("user-a")] })).nextState;
  const variants = [
    { ...state, stateDigest: "b".repeat(64) },
    rehash({ ...state, entries: state.entries.slice(0, 1) }),
    rehash({ ...state, entries: state.entries.map((e, i) => i === 0 ? { ...e, cursor: null } : e) }),
    rehash({ ...state, entries: state.entries.map((e, i) => i === 1 ? { ...e, cursor: { uploadBytes: 0, downloadBytes: 0, observedAt: t1 } } : e) }),
    rehash({ ...state, unexpected: true })
  ];
  for (const corrupt of variants) rejects(() => step(corrupt, [pair("user-a")]), "counter_state_invalid");
});

test("full metering: totals across users cannot overflow safe integer", () => {
  const state = transition(input({ observations: [pair("user-a", 0, 0), pair("user-b", 0, 0)] })).nextState;
  rejects(() => step(state, [pair("user-a", Number.MAX_SAFE_INTEGER, 0), pair("user-b", 1, 0)]), "counter_input_invalid");
});

test("full metering: TUIC connections each baseline first then independently accumulate", () => {
  const first = transition(input({ mode: "connections", observations: [pair("user-a", 100, 200, "conn-a")] }));
  assert.deepEqual(first.deltas, []);
  const second = step(first.nextState, [pair("user-a", 110, 220, "conn-a"), pair("user-a", 900, 800, "conn-b"), pair("user-b", 5, 6, "conn-c")], { mode: "connections" });
  assert.deepEqual(second.deltas, [{ edgeCredentialRef: "user-a", uploadBytes: 10, downloadBytes: 20, totalBytes: 30, intervalStartedAt: t1, intervalEndedAt: t2 }]);
  assert.equal(second.summary.initializedConnectionCount, 2);
  const third = step(second.nextState, [pair("user-a", 905, 806, "conn-b"), pair("user-b", 8, 10, "conn-c")], { mode: "connections", observedAt: t3, now: t3 });
  assert.deepEqual(third.deltas, [{ edgeCredentialRef: "user-a", uploadBytes: 5, downloadBytes: 6, totalBytes: 11, intervalStartedAt: t2, intervalEndedAt: t3 }, { edgeCredentialRef: "user-b", uploadBytes: 3, downloadBytes: 4, totalBytes: 7, intervalStartedAt: t2, intervalEndedAt: t3 }]);
  assert.equal(third.nextState.connections.find(c => c.connectionId === "conn-a").closedAt, t3);
  assert.equal(third.totals.totalBytes, 48);
});

test("full metering: TUIC zero active connections close known cursors but do not re-pend identities", () => {
  const first = transition(input({ mode: "connections", observations: [pair("user-a", 100, 200, "conn-a")] }));
  const second = step(first.nextState, [], { mode: "connections" });
  assert.deepEqual(second.deltas, []);
  assert.equal(second.nextState.entries[0].status, "observed");
  assert.equal(second.nextState.entries[1].status, "pending_start");
  assert.equal(second.summary.activeConnectionCount, 0);
  assert.equal(second.nextState.connections[0].closedAt, t2);
});

test("full metering: TUIC duplicate connection IDs reject even across different identities", () => {
  for (const observations of [[pair("user-a", 1, 2, "conn-a"), pair("user-b", 1, 2, "conn-a")],
    [pair("user-a", 1, 2, "conn-a"), pair("retained-a", 1, 2, "conn-a")]]) {
    rejects(() => transition(input({ mode: "connections", observations })), "counter_input_invalid");
  }
});

test("full metering: TUIC ownership changes and closed-ID reuse fail closed", () => {
  const state = transition(input({ mode: "connections", observations: [pair("user-a", 100, 200, "conn-a")] })).nextState;
  for (const ref of ["user-b", "retained-a"]) rejects(() => step(state, [pair(ref, 101, 201, "conn-a")], { mode: "connections" }), "connection_identity_changed");
  const closed = step(state, [], { mode: "connections" }).nextState;
  rejects(() => step(closed, [pair("user-a", 101, 201, "conn-a")], { mode: "connections", observedAt: t3, now: t3 }), "closed_connection_reappeared");
});

test("full metering: TUIC decreasing counter or incomplete pair cannot reset one connection", () => {
  const state = transition(input({ mode: "connections", observations: [pair("user-a", 100, 200, "conn-a")] })).nextState;
  rejects(() => step(state, [pair("user-a", 99, 201, "conn-a")], { mode: "connections" }), "counter_decreased");
  rejects(() => step(state, [{ edgeCredentialRef: "user-a", connectionId: "conn-a", uploadBytes: 101 }], { mode: "connections" }), "counter_input_invalid");
});

test("full metering: TUIC rehashed missing connection state cannot clear an observed user's baseline", () => {
  const state = transition(input({ mode: "connections", observations: [pair("user-a", 100, 200, "conn-a")] })).nextState;
  const corrupt = rehash({ ...state, connections: [] });
  rejects(() => step(corrupt, [pair("user-a", 101, 201, "conn-a")], { mode: "connections" }), "counter_state_invalid");
});

test("full metering: requires explicit initial null, not omitted or undefined state", () => {
  const omitted = input(); delete omitted.state;
  rejects(() => transition(omitted), "counter_input_invalid");
  rejects(() => transition(input({ state: undefined })), "counter_state_invalid");
});

test("full metering: null age and sparse or extra-property observations are malformed", () => {
  const sparse = new Array(1);
  const extra = []; extra.hidden = pair("user-a");
  for (const patch of [{ maxAgeMs: null }, { observations: sparse }, { observations: extra }]) {
    rejects(() => transition(input(patch)), "counter_input_invalid");
  }
});

test("full metering: scope reconciliation adds pending identities without resetting observed bytes", () => {
  const first = transition(input({ observations: [pair("user-a")] })).nextState;
  const changed = reconcile({ state: first, eligibleRefs: ["user-a", "user-b", "user-c"], retainedRefs: ["retained-a"] });
  assert.deepEqual(changed.nextState.entries[0], first.entries[0]);
  assert.equal(changed.nextState.entries[2].status, "pending_start");
  assert.equal(changed.nextState.entries[2].cursor, null);
  assert.equal(changed.nextState.scopeRevision, 1);
  assert.equal(changed.nextState.previousStateDigest, first.stateDigest);
  assert.equal(changed.receipt.beforeStateDigest, first.stateDigest);
  assert.equal(changed.receipt.afterStateDigest, changed.nextState.stateDigest);
  const next = step(changed.nextState, [pair("user-a", 101, 202), pair("user-c", 500, 600)], { eligibleRefs: ["user-a", "user-b", "user-c"] });
  assert.equal(next.totals.totalBytes, 3);
  assert.equal(next.nextState.entries[2].cursor.uploadBytes, 500);
  assert.equal(next.nextState.previousStateDigest, changed.nextState.stateDigest);
});

test("full metering: scope reconciliation archives retired cursors and usage without further billing", () => {
  const first = transition(input({ observations: [pair("user-a"), pair("user-b")] })).nextState;
  const metered = step(first, [pair("user-a", 110, 220), pair("user-b", 102, 203)]).nextState;
  const before = structuredClone(metered);
  const changed = reconcile({ state: metered, eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] });
  assert.deepEqual(changed.nextState.retiredEntries, [metered.entries[0]]);
  assert.deepEqual(metered, before);
  const after = step(changed.nextState, [pair("user-b", 105, 206), pair("user-a", 0, 0)], {
    eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"], observedAt: t3, now: t3
  });
  assert.deepEqual(after.nextState.retiredEntries, changed.nextState.retiredEntries);
  assert.equal(after.deltas.length, 1);
  assert.equal(after.deltas[0].edgeCredentialRef, "user-b");
  assert.equal(after.totals.totalBytes, 11);
  assert.equal(after.retiredTotals.totalBytes, 30);
});

test("full metering: scope reconciliation retains TUIC closed and live connection evidence", () => {
  const first = transition(input({ mode: "connections", observations: [pair("user-a", 10, 20, "a1"), pair("user-b", 30, 40, "b1")] })).nextState;
  const changed = reconcile({ state: first, eligibleRefs: ["user-b", "user-c"], retainedRefs: ["retained-a", "user-a"] });
  assert.deepEqual(changed.nextState.retiredConnections, [first.connections[0]]);
  const after = step(changed.nextState, [pair("user-b", 31, 42, "b1"), pair("user-c", 100, 200, "c1")], {
    mode: "connections", eligibleRefs: ["user-b", "user-c"], retainedRefs: ["retained-a", "user-a"]
  });
  assert.equal(after.totals.totalBytes, 3);
  assert.deepEqual(after.nextState.retiredConnections, changed.nextState.retiredConnections);
  rejects(() => step(changed.nextState, [pair("user-b", 31, 42, "b1"), pair("user-c", 100, 200, "a1")], {
    mode: "connections", eligibleRefs: ["user-b", "user-c"], retainedRefs: ["retained-a", "user-a"]
  }), "connection_identity_changed");
});

test("full metering: unchanged reconciled scope is an exact no-op", () => {
  const state = transition(input()).nextState;
  const result = reconcile({ state, eligibleRefs: ["user-b", "user-a"], retainedRefs: ["retained-a"] });
  assert.equal(result.unchanged, true);
  assert.deepEqual(result.nextState, state);
  assert.equal(result.receipt, null);
});

test("full metering: retained reactivation, disappearing refs and unrelated retained additions reject", () => {
  const state = transition(input({ observations: [pair("user-a")] })).nextState;
  for (const change of [
    { eligibleRefs: ["user-a", "user-b", "retained-a"], retainedRefs: [] },
    { eligibleRefs: ["user-b"], retainedRefs: ["retained-a"] },
    { eligibleRefs: ["user-a", "user-b"], retainedRefs: [] },
    { eligibleRefs: ["user-a", "user-b"], retainedRefs: ["retained-a", "unknown-a"] }
  ]) rejects(() => reconcile({ state, ...change }), "counter_scope_reconciliation_invalid");
});

test("full metering: repeated verified scope changes retain all historical archive records", () => {
  const first = transition(input({ observations: [pair("user-a"), pair("user-b")] })).nextState;
  const one = reconcile({ state: first, eligibleRefs: ["user-b", "user-c"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  const two = reconcile({ state: one, eligibleRefs: ["user-c", "user-d"], retainedRefs: ["retained-a", "user-a", "user-b"] }).nextState;
  assert.deepEqual(two.retiredEntries, first.entries);
  assert.equal(two.scopeRevision, 2);
  assert.equal(two.previousStateDigest, one.stateDigest);
  rejects(() => reconcile({ state: two, eligibleRefs: ["user-a", "user-c", "user-d"], retainedRefs: ["retained-a", "user-b"] }), "counter_scope_reconciliation_invalid");
});

test("full metering: archive and scope receipts remain strictly bound", () => {
  const first = transition(input({ observations: [pair("user-a")] })).nextState;
  const state = reconcile({ state: first, eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  for (const change of [
    { retiredEntries: [] },
    { lastScopeChange: { ...state.lastScopeChange, toScopeDigest: "b".repeat(64) } },
    { previousStateDigest: null }
  ]) rejects(() => step(rehash({ ...state, ...change }), [], { eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }), "counter_state_invalid");
});

test("full metering: verified retirement of the final eligible identity preserves a source with no billable keys", () => {
  const first = transition(input({ eligibleRefs: ["user-a"], observations: [pair("user-a")] })).nextState;
  const retiredRefs = ["retained-a", "user-a"];
  const state = reconcile({ state: first, eligibleRefs: [], retainedRefs: retiredRefs }).nextState;
  const result = step(state, [pair("user-a", 500, 600)], { eligibleRefs: [], retainedRefs: retiredRefs });
  assert.equal(result.summary.eligibleCount, 0);
  assert.equal(result.summary.archivedIdentityCount, 1);
  assert.deepEqual(result.nextState.retiredEntries, first.entries);
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.counters, []);
  const next = reconcile({ state: result.nextState, eligibleRefs: ["user-c"], retainedRefs: retiredRefs });
  assert.equal(next.nextState.entries[0].status, "pending_start");
});

test("full metering: TUIC exact replay does not duplicate connection usage or closure", () => {
  const observations = [pair("user-a", 100, 200, "a1"), pair("user-a", 300, 400, "a2")];
  const first = transition(input({ mode: "connections", observations })).nextState;
  const request = input({ mode: "connections", state: first, observations: [pair("user-a", 305, 407, "a2")], observedAt: t2, now: t2 });
  const second = transition(request);
  const repeated = transition({ ...request, state: second.nextState });
  assert.equal(repeated.unchanged, true);
  assert.equal(repeated.summary.closedConnectionCount, 0);
  assert.deepEqual(repeated.nextState, second.nextState);
  assert.deepEqual(repeated.deltas, []);
  assert.equal(repeated.totals.totalBytes, 12);
  rejects(() => step(second.nextState, request.observations, { mode: "connections", generation: "b".repeat(64), observedAt: t3, now: t3 }), "source_generation_changed");
});

test("full metering: TUIC sums multiple continuing connections but never new-connection historical bytes", () => {
  const state = transition(input({ mode: "connections", observations: [pair("user-a", 100, 200, "a1"), pair("user-a", 300, 400, "a2")] })).nextState;
  const result = step(state, [pair("user-a", 110, 210, "a1"), pair("user-a", 320, 430, "a2"), pair("user-a", 9000, 8000, "a3")], { mode: "connections" });
  assert.deepEqual(result.deltas, [{ edgeCredentialRef: "user-a", uploadBytes: 30, downloadBytes: 40, totalBytes: 70, intervalStartedAt: t1, intervalEndedAt: t2 }]);
  assert.equal(result.summary.initializedConnectionCount, 1);
});

test("full metering: malformed getters are rejected without invocation and errors contain no reference", () => {
  let reads = 0;
  const observation = pair("user-a");
  Object.defineProperty(observation, "uploadBytes", { enumerable: true, get() { reads++; return 0; } });
  rejects(() => transition(input({ observations: [observation] })), "counter_input_invalid");
  assert.equal(reads, 0);
  const array = [pair("user-a")];
  Object.defineProperty(array, "0", { enumerable: true, get() { reads++; return pair("user-a"); } });
  rejects(() => transition(input({ observations: array })), "counter_input_invalid");
  assert.equal(reads, 0);
  const state = transition(input({ observations: [pair("user-a")] })).nextState;
  Object.defineProperty(state.entries[0].cursor, "uploadBytes", { enumerable: true, get() { reads++; return 100; } });
  rejects(() => step(state, [pair("user-a")]), "counter_state_invalid");
  assert.equal(reads, 0);
});

const newGeneration = "b".repeat(64);
function chargedState(mode = "cumulative") {
  const observations = [pair("user-a", 100, 200, mode === "connections" ? "conn-a" : undefined)];
  const first = transition(input({ mode, observations })).nextState;
  return step(first, [pair("user-a", 110, 220, mode === "connections" ? "conn-a" : undefined)], { mode }).nextState;
}

test("full metering generation: verified switch archives exact old state and carries all charged usage", () => {
  const old = chargedState(), frozen = structuredClone(old);
  const changed = advance({ state: old, generation: newGeneration, verifiedAt: t3 });
  assert.deepEqual(old, frozen);
  assert.equal(changed.nextState.generation, newGeneration);
  assert.equal(changed.nextState.generationRevision, 1);
  assert.equal(changed.nextState.generationAwaitingObservation, true);
  assert.equal(changed.nextState.entries[0].status, "pending_start");
  assert.equal(changed.nextState.entries[0].cursor, null);
  assert.deepEqual(changed.nextState.entries[0].usage, { uploadBytes: 10, downloadBytes: 20 });
  assert.deepEqual(changed.nextState.entries[0].carryUsage, old.entries[0].usage);
  assert.deepEqual(changed.nextState.generationArchives[0].snapshot.entries, old.entries);
  assert.equal(changed.nextState.generationArchives[0].snapshot.stateDigest, old.stateDigest);
  assert.equal(Object.hasOwn(changed.nextState.generationArchives[0].snapshot, "generationArchives"), false);
  assert.equal(changed.receipt.beforeStateDigest, old.stateDigest);
  assert.equal(changed.receipt.afterStateDigest, changed.nextState.stateDigest);
});

test("full metering generation: lower new raw bytes baseline at exact verified timestamp without historical debit", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 });
  const result = step(changed.nextState, [pair("user-a", 1, 2)], { generation: newGeneration, observedAt: t3, now: t3 });
  assert.deepEqual(result.deltas, []);
  assert.equal(result.totals.totalBytes, 30);
  assert.equal(result.nextState.entries[0].cursor.uploadBytes, 1);
  assert.equal(result.summary.generationUnassignedGap.unassignedBytes, null);
  assert.equal(result.summary.generationUnassignedGap.startedAt, t2);
  assert.equal(result.summary.generationUnassignedGap.verifiedAt, t3);
  assert.equal(result.nextState.generationAwaitingObservation, false);
});

test("full metering generation: only increments after new first baseline increase lifetime totals", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  const first = step(changed, [pair("user-a", 5000, 6000), pair("user-b", 9000, 8000)], { generation: newGeneration, observedAt: t3, now: t3 });
  const t4 = "2026-09-08T06:00:40.000Z";
  const later = step(first.nextState, [pair("user-a", 5004, 6006), pair("user-b", 9002, 8003)], { generation: newGeneration, observedAt: t4, now: t4 });
  assert.equal(later.totals.totalBytes, 45);
  assert.equal(later.deltas.reduce((n, d) => n + d.totalBytes, 0), 15);
  assert.ok(later.deltas.every(d => d.intervalStartedAt === t3));
  assert.equal(later.summary.generationUnassignedGap.baselineCompletedAt, t3);
});

test("full metering generation: repeated switch request cannot reset a current generation again", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  rejects(() => advance({ state: changed, generation: newGeneration, verifiedAt: t3 }), "counter_generation_transition_invalid");
  rejects(() => advance({ state: changed, generation: "a".repeat(64), verifiedAt: t3 }), "counter_generation_transition_invalid");
});

test("full metering generation: missing, malformed or backwards verification bounds reject", () => {
  const old = chargedState();
  for (const patch of [{ generation: "invalid" }, { verifiedAt: t1 }, { verifiedAt: "2026-09-08T06:00:30Z" }, { verifiedAt: undefined }, { sourceRef: "different" }]) {
    assert.throws(() => advance({ state: old, generation: newGeneration, verifiedAt: t3, ...patch }),
      error => ["counter_input_invalid", "counter_generation_transition_invalid"].includes(error.code));
  }
});

test("full metering generation: old-source snapshots and snapshots before verified boundary still reject", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  rejects(() => step(changed, []), "source_generation_changed");
  rejects(() => step(changed, [], { generation: newGeneration, observedAt: t2, now: t3 }), "observation_before_generation_boundary");
});

test("full metering generation: first empty snapshot remains pending, and later first pair is not charged", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  const empty = step(changed, [], { generation: newGeneration, observedAt: t3, now: t3 });
  assert.equal(empty.summary.pendingCount, 2); assert.equal(empty.totals.totalBytes, 30);
  assert.equal(empty.summary.generationUnassignedGap.baselineCompletedAt, null);
  const t4 = "2026-09-08T06:00:40.000Z";
  const first = step(empty.nextState, [pair("user-a", 10000, 20000)], { generation: newGeneration, observedAt: t4, now: t4 });
  assert.deepEqual(first.deltas, []); assert.equal(first.totals.totalBytes, 30);
});

test("full metering generation: exact first snapshot replay stays no-op and changed same-time snapshot rejects", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  const options = { generation: newGeneration, observedAt: t3, now: t3 };
  const first = step(changed, [pair("user-a", 1, 2)], options);
  const repeat = step(first.nextState, [pair("user-a", 1, 2)], options);
  assert.equal(repeat.unchanged, true); assert.deepEqual(repeat.deltas, []);
  rejects(() => step(first.nextState, [pair("user-a", 2, 3)], options), "observation_replay_conflict");
});

test("full metering generation: TUIC old IDs may reappear only after verified new generation baseline", () => {
  const old = chargedState("connections");
  const changed = advance({ state: old, generation: newGeneration, verifiedAt: t3 }).nextState;
  assert.deepEqual(changed.connections, []);
  assert.deepEqual(changed.generationArchives[0].snapshot.connections, old.connections);
  const first = step(changed, [pair("user-a", 1, 2, "conn-a")], { mode: "connections", generation: newGeneration, observedAt: t3, now: t3 });
  assert.deepEqual(first.deltas, []); assert.equal(first.totals.totalBytes, 30);
});

test("full metering generation: multiple switches form flat independently hash-bound archives", () => {
  const first = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  const second = advance({ state: first, generation: "c".repeat(64), verifiedAt: t3 }).nextState;
  assert.equal(second.generationRevision, 2);
  assert.equal(second.generationArchives.length, 2);
  assert.ok(second.generationArchives.every(a => !Object.hasOwn(a.snapshot, "generationArchives")));
  assert.equal(second.generationArchives[1].snapshot.stateDigest, first.stateDigest);
  const baseline = step(second, [pair("user-a", 2, 3)], { generation: "c".repeat(64), observedAt: t3, now: t3 });
  assert.equal(baseline.totals.totalBytes, 30);
});

test("full metering generation: tampered archives, carry totals and removed archive fields reject", () => {
  const changed = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  for (const change of [
    { generationArchives: [] }, { generationRevision: 0 },
    { generationArchives: [{ ...changed.generationArchives[0], archiveDigest: "e".repeat(64) }] },
    { entries: changed.entries.map((e, i) => i ? e : { ...e, carryUsage: { uploadBytes: 0, downloadBytes: 0 } }) }
  ]) rejects(() => step(rehash({ ...changed, ...change }), [pair("user-a", 1, 2)], { generation: newGeneration, observedAt: t3, now: t3 }), "counter_state_invalid");
});

test("full metering generation: retired evidence and new-scope pending identities survive rotation", () => {
  const retired = reconcile({ state: chargedState(), eligibleRefs: ["user-b", "user-c"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  const next = advance({ state: retired, generation: newGeneration, verifiedAt: t3 }).nextState;
  assert.deepEqual(next.retiredEntries, retired.retiredEntries);
  const result = step(next, [pair("user-c", 1, 2)], { generation: newGeneration, observedAt: t3, now: t3,
    eligibleRefs: ["user-b", "user-c"], retainedRefs: ["retained-a", "user-a"] });
  assert.equal(result.totals.totalBytes, 0); assert.equal(result.retiredTotals.totalBytes, 30);
  const expanded = reconcile({ state: result.nextState, eligibleRefs: ["user-b", "user-c", "user-d"], retainedRefs: ["retained-a", "user-a"] });
  assert.equal(expanded.nextState.entries[2].status, "pending_start");
});

test("full metering generation: archive payload rehash cannot bypass original old-state digest binding", () => {
  const state = advance({ state: chargedState(), generation: newGeneration, verifiedAt: t3 }).nextState;
  const changed = structuredClone(state);
  changed.generationArchives[0].snapshot.entries[0].cursor.uploadBytes++;
  const { archiveDigest: ignored, ...payload } = changed.generationArchives[0];
  changed.generationArchives[0].archiveDigest = createHash("sha256").update(canonical(payload)).digest("hex");
  rejects(() => step(rehash(changed), [pair("user-a", 1, 2)], { generation: newGeneration, observedAt: t3, now: t3 }), "counter_state_invalid");
});

test("full metering generation: reused new-generation connection IDs can retire without erasing older owners", () => {
  const old = chargedState("connections");
  const retired = reconcile({ state: old, eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  const advanced = advance({ state: retired, generation: newGeneration, verifiedAt: t3 }).nextState;
  const first = step(advanced, [pair("user-b", 1, 2, "conn-a")], { mode: "connections", generation: newGeneration, observedAt: t3, now: t3,
    eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  const final = reconcile({ state: first, eligibleRefs: [], retainedRefs: ["retained-a", "user-a", "user-b"] }).nextState;
  assert.equal(final.retiredConnections.length, 2);
  assert.deepEqual(final.retiredConnections.map(c => c.generation), ["a".repeat(64), newGeneration]);
  assert.deepEqual(final.retiredConnections.map(c => c.edgeCredentialRef), ["user-a", "user-b"]);
});
