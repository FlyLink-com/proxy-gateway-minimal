import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import * as counters from "../services/edge/full-metering-counter-transition.mjs";

const time = i => new Date(Date.parse("2026-10-12T00:00:00.000Z") + i * 10000).toISOString();
const pair = (edgeCredentialRef, uploadBytes, downloadBytes, connectionId) => ({ edgeCredentialRef,
  uploadBytes, downloadBytes, ...(connectionId ? { connectionId } : {}) });
const ordinary = counters.transitionFullMeteringCounters;
const restore = request => counters.transitionVerifiedFullMeteringPlanSwitchReactivationCounters(request);
const scope = (state, eligibleRefs, retainedRefs) => counters.reconcileVerifiedFullMeteringScope({ state, eligibleRefs, retainedRefs }).nextState;
function request(state, observations, index, patch = {}) {
  return { state, mode: state?.mode ?? "cumulative", sourceRef: "source-a", channelRef: "channel-a",
    generation: state?.generation ?? "a".repeat(64), minObservedAt: time(0), observedAt: time(index), now: time(index),
    eligibleRefs: ["a", "b"], retainedRefs: ["legacy"], observations, ...patch };
}
function paid(mode = "cumulative") {
  const ids = mode === "connections" ? ["ca", "cb"] : [];
  const first = ordinary(request(null, [pair("a", 100, 200, ids[0]), pair("b", 300, 400, ids[1])], 1, { mode }));
  return ordinary(request(first.nextState, [pair("a", 150, 260, ids[0]), pair("b", 310, 420, ids[1])], 2)).nextState;
}
function retired(mode = "cumulative") { return scope(paid(mode), ["b"], ["a", "legacy"]); }
function restoreRequest(state, observations, index = 3, patch = {}) {
  return { ...request(state, observations, index), reactivationRefs: ["a"], planSwitchRefs: ["a"], ...patch };
}
const reject = (fn, code) => assert.throws(fn, error => error.code === code);
function digest(value) {
  const canonical = item => Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
    : item && typeof item === "object" ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`
      : JSON.stringify(item);
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function rehash(state) {
  for (const boundary of state.planSwitchReactivations) {
    const { boundaryDigest: ignored, ...payload } = boundary; boundary.boundaryDigest = digest(payload);
  }
  const { stateDigest: ignored, ...payload } = state;
  return { ...payload, stateDigest: digest(payload) };
}

for (const mode of ["cumulative", "connections"]) {
  test(`plan-reactivation: ${mode} preserves retired usage and baselines only the approved restored identity`, () => {
    const state = retired(mode), before = structuredClone(state), ids = mode === "connections" ? ["ca", "cb"] : [];
    const result = restore(restoreRequest(state, [pair("a", 900, 800, ids[0]), pair("b", 315, 427, ids[1])]));
    assert.deepEqual(state, before);
    assert.deepEqual(result.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["b", 12]]);
    assert.deepEqual(result.nextState.entries[0].usage, { uploadBytes: 50, downloadBytes: 60 });
    assert.deepEqual(result.nextState.entries[0].carryUsage, { uploadBytes: 50, downloadBytes: 60 });
    assert.deepEqual(result.nextState.retiredEntries, []);
    assert.deepEqual(result.nextState.planSwitchReactivations[0].entries[0].retiredEntry, state.retiredEntries[0]);
    assert.deepEqual(result.nextState.planSwitchReactivations[0].entries[0].retiredConnections, state.retiredConnections);
    assert.equal(result.receipt.type, "verified_full_metering_plan_switch_reactivation");
    assert.equal(result.receipt.beforeStateDigest, state.stateDigest);
    assert.equal(result.receipt.unassignedBytes, null);
    const later = ordinary(request(result.nextState, [pair("a", 903, 805, ids[0]), pair("b", 316, 428, ids[1])], 4));
    assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["a", 8], ["b", 2]]);
    assert.deepEqual(later.nextState.planSwitchReactivations, result.nextState.planSwitchReactivations);
  });
  test(`plan-reactivation: ${mode} same-generation upload or download decrease remains rejected`, () => {
    const state = retired(mode), ids = mode === "connections" ? ["ca", "cb"] : [];
    for (const [u, d] of [[149, 300], [200, 259]]) reject(() => restore(restoreRequest(state,
      [pair("a", u, d, ids[0]), pair("b", 310, 420, ids[1])])), "counter_decreased");
  });
  test(`plan-reactivation: ${mode} verified new generation can restore an older retired identity at the generation boundary`, () => {
    const state = retired(mode), advanced = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: time(3) }).nextState;
    const ids = mode === "connections" ? ["ca", "cb"] : [];
    const result = restore(restoreRequest(advanced, [pair("a", 1, 2, ids[0]), pair("b", 3, 4, ids[1])]));
    assert.deepEqual(result.deltas, []);
    assert.deepEqual(result.nextState.entries[0].usage, state.retiredEntries[0].usage);
    assert.equal(result.nextState.entries[0].generation, "b".repeat(64));
    assert.equal(result.nextState.generationRevision, 1);
    assert.equal(result.nextState.generationAwaitingObservation, false);
    const later = ordinary(request(result.nextState, [pair("a", 2, 4, ids[0]), pair("b", 5, 6, ids[1])], 4));
    assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["a", 3], ["b", 4]]);
  });
  test(`plan-reactivation: ${mode} repeated expiry/reactivation retains all accepted history`, () => {
    const ids = mode === "connections" ? ["ca", "cb"] : [];
    let state = restore(restoreRequest(retired(mode), [pair("a", 900, 800, ids[0]), pair("b", 310, 420, ids[1])])).nextState;
    state = ordinary(request(state, [pair("a", 905, 807, ids[0]), pair("b", 310, 420, ids[1])], 4)).nextState;
    state = scope(state, ["b"], ["a", "legacy"]);
    const old = structuredClone(state.planSwitchReactivations);
    state = restore(restoreRequest(state, [pair("a", 1900, 1800, ids[0]), pair("b", 311, 421, ids[1])], 5)).nextState;
    assert.deepEqual(state.planSwitchReactivations.slice(0, 1), old);
    assert.deepEqual(state.entries[0].usage, { uploadBytes: 55, downloadBytes: 67 });
    assert.deepEqual(state.planSwitchReactivations[1].entries[0].retiredEntry.usage, state.entries[0].usage);
    assert.doesNotThrow(() => ordinary(request(state, [pair("a", 1901, 1801, ids[0]), pair("b", 312, 422, ids[1])], 6)));
  });
}

test("plan-reactivation: ordinary scope reconcile never reactivates archived or unarchived retained refs", () => {
  reject(() => scope(retired(), ["a", "b"], ["legacy"]), "counter_scope_reconciliation_invalid");
  reject(() => scope(retired(), ["b", "legacy"], ["a"]), "counter_scope_reconciliation_invalid");
});
test("plan-reactivation: exact archived refs and all selected commerce proofs are required", () => {
  const state = retired(), obs = [pair("a", 900, 800), pair("b", 310, 420)];
  for (const patch of [{ reactivationRefs: [] }, { reactivationRefs: ["a", "a"] }, { reactivationRefs: ["b"] },
    { reactivationRefs: ["legacy"], eligibleRefs: ["b", "legacy"], retainedRefs: ["a"] },
    { planSwitchRefs: ["b"] }, { reactivationRefs: ["a"], eligibleRefs: ["a", "b", "legacy"], retainedRefs: [] },
    { generation: "b".repeat(64) }, { sourceRef: "other" }, { channelRef: "other" }, { observedAt: time(2) }, { state: null }]) {
    assert.throws(() => restore(restoreRequest(state, obs, 3, patch)));
  }
});
test("plan-reactivation: same observation replays ordinarily but cannot create another restore boundary", () => {
  const r = restoreRequest(retired(), [pair("a", 900, 800), pair("b", 310, 420)]), result = restore(r);
  assert.equal(ordinary(request(result.nextState, r.observations, 3)).unchanged, true);
  assert.throws(() => restore({ ...r, state: result.nextState }));
});
test("plan-reactivation: independent retire/add and active plan switch coexist without charging selected refs", () => {
  let state = ordinary(request(null, [pair("a", 100, 200), pair("b", 300, 400), pair("c", 50, 60)], 1,
    { eligibleRefs: ["a", "b", "c"] })).nextState;
  state = ordinary(request(state, [pair("a", 150, 260), pair("b", 310, 420), pair("c", 55, 65)], 2,
    { eligibleRefs: ["a", "b", "c"] })).nextState;
  state = scope(state, ["b", "c"], ["a", "legacy"]);
  const result = restore(restoreRequest(state, [pair("a", 900, 800), pair("b", 1000, 1000), pair("c", 60, 70), pair("new", 100, 200)], 3,
    { eligibleRefs: ["a", "b", "new"], retainedRefs: ["c", "legacy"], planSwitchRefs: ["a", "b"] }));
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.nextState.eligibleRefs, ["a", "b", "new"]);
  assert.deepEqual(result.nextState.archivedRefs, ["c"]);
  assert.deepEqual(result.nextState.entries.map(e => e.usage), [{ uploadBytes: 50, downloadBytes: 60 },
    { uploadBytes: 10, downloadBytes: 20 }, { uploadBytes: 0, downloadBytes: 0 }]);
});
test("plan-reactivation: complete empty connection snapshot preserves closed history and rejects old IDs", () => {
  const state = retired("connections");
  const result = restore(restoreRequest(state, [pair("b", 310, 420, "cb")]));
  assert.equal(result.nextState.connectionHistory.count, 1);
  assert.deepEqual(result.nextState.entries[0].usage, { uploadBytes: 50, downloadBytes: 60 });
  reject(() => ordinary(request(result.nextState, [pair("a", 150, 260, "ca"), pair("b", 310, 420, "cb")], 4)), "closed_connection_reappeared");
});
test("plan-reactivation: previously closed connection cannot return after a retained interval", () => {
  let state = ordinary(request(paid("connections"), [pair("b", 310, 420, "cb")], 3)).nextState;
  state = scope(state, ["b"], ["a", "legacy"]);
  reject(() => restore(restoreRequest(state, [pair("a", 150, 260, "ca"), pair("b", 310, 420, "cb")], 4)), "closed_connection_reappeared");
});

for (const mode of ["cumulative", "connections"]) {
  test(`plan-reactivation: ${mode} partial activation keeps other retired refs and their history intact`, () => {
    const ids = mode === "connections" ? ["ca", "cb"] : [];
    const state = scope(paid(mode), [], ["a", "b", "legacy"]), before = structuredClone(state);
    const result = restore(restoreRequest(state, [pair("a", 900, 800, ids[0]), pair("b", 310, 420, ids[1])], 3,
      { eligibleRefs: ["a"], retainedRefs: ["b", "legacy"] }));
    assert.deepEqual(result.deltas, []);
    assert.deepEqual(result.nextState.retiredEntries, [before.retiredEntries[1]]);
    assert.deepEqual(result.nextState.retiredConnections, before.retiredConnections.filter(c => c.edgeCredentialRef === "b"));
    assert.deepEqual(result.nextState.archivedRefs, ["b"]);
    assert.deepEqual(result.nextState.entries[0].usage, before.retiredEntries[0].usage);
  });
  test(`plan-reactivation: ${mode} retained identity can span two real restarts without losing lifetime usage`, () => {
    let state = retired(mode);
    const ids = mode === "connections" ? ["ca", "cb"] : [];
    state = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: time(3) }).nextState;
    state = ordinary(request(state, [pair("b", 10, 20, ids[1])], 3, { eligibleRefs: ["b"], retainedRefs: ["a", "legacy"] })).nextState;
    state = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "c".repeat(64), verifiedAt: time(4) }).nextState;
    state = ordinary(request(state, [pair("b", 1, 2, ids[1])], 4, { eligibleRefs: ["b"], retainedRefs: ["a", "legacy"] })).nextState;
    const result = restore(restoreRequest(state, [pair("a", 1, 1, ids[0]), pair("b", 3, 5, ids[1])], 5));
    assert.deepEqual(result.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["b", 5]]);
    assert.deepEqual(result.nextState.entries[0].usage, { uploadBytes: 50, downloadBytes: 60 });
    assert.equal(result.nextState.planSwitchReactivations[0].entries[0].retiredEntry.generation, "a".repeat(64));
    assert.deepEqual(result.nextState.generationArchives, state.generationArchives);
  });
  test(`plan-reactivation: ${mode} ordinary, material, billing and generation transitions preserve restoration evidence`, () => {
    const ids = mode === "connections" ? ["ca", "cb"] : [];
    let state = restore(restoreRequest(retired(mode), [pair("a", 900, 800, ids[0]), pair("b", 310, 420, ids[1])])).nextState;
    const evidence = structuredClone(state.planSwitchReactivations);
    state = counters.transitionVerifiedFullMeteringMaterialCounters({ ...request(state,
      [pair("a", 1, 2, ids[0]), pair("b", 310, 420, ids[1])], 4), materialRefs: ["a"] }).nextState;
    state = ordinary(request(state, [pair("a", 4, 6, ids[0]), pair("b", 310, 420, ids[1])], 5)).nextState;
    state = counters.transitionVerifiedFullMeteringBillingWindowCounters({ ...request(state,
      [pair("a", 1, 2, ids[0]), pair("b", 310, 420, ids[1])], 6), billingWindowRefs: ["a"] }).nextState;
    state = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: time(7) }).nextState;
    state = ordinary(request(state, [pair("a", 2, 3, ids[0]), pair("b", 1, 2, ids[1])], 7)).nextState;
    assert.deepEqual(state.planSwitchReactivations, evidence);
    assert.deepEqual(state.entries[0].usage, { uploadBytes: 53, downloadBytes: 64 });
  });
}

test("plan-reactivation: missing cumulative counters and incomplete reads fail before returning a state", () => {
  const state = retired(), before = structuredClone(state);
  for (const observations of [[pair("b", 310, 420)], [pair("a", 900, 800)],
    [{ edgeCredentialRef: "a", uploadBytes: 900 }, pair("b", 310, 420)],
    [pair("a", 900, 800), pair("b", 310, 420), pair("unknown", 1, 2)]]) {
    assert.throws(() => restore(restoreRequest(state, observations)));
    assert.deepEqual(state, before);
  }
});
test("plan-reactivation: retained connection ownership cannot be relabeled into an active account", () => {
  const state = retired("connections");
  reject(() => restore(restoreRequest(state, [pair("a", 900, 800, "cb"), pair("b", 310, 420, "ca")])), "connection_identity_changed");
});
test("plan-reactivation: protected archive integrity and exact restoration fields fail closed", () => {
  const result = restore(restoreRequest(retired(), [pair("a", 900, 800), pair("b", 310, 420)]));
  for (const mutate of [s => { s.planSwitchReactivations[0].entries[0].retiredEntry.usage.uploadBytes++; },
    s => { s.planSwitchReactivations[0].entries[0].retiredEntry = null; },
    s => { s.planSwitchReactivations[0].entries[0].retiredConnections = [{}]; },
    s => { s.planSwitchReactivations.push(structuredClone(s.planSwitchReactivations[0])); },
    s => { s.planSwitchReactivations[0].generation = "f".repeat(64); },
    s => { s.planSwitchReactivations[0].entries[0].retiredEntry.carryUsage.uploadBytes = 999; },
    s => { s.planSwitchReactivations[0].entries[0].retiredEntry.unexpected = true; },
    s => { s.planSwitchReactivations[0].entries[0].retiredEntry.cursor.observedAt = time(5); }]) {
    const bad = structuredClone(result.nextState); mutate(bad);
    reject(() => ordinary(request(bad, [pair("a", 901, 801), pair("b", 310, 420)], 4)), "counter_state_invalid");
    reject(() => ordinary(request(rehash(bad), [pair("a", 901, 801), pair("b", 310, 420)], 4)), "counter_state_invalid");
  }
});
test("plan-reactivation: archival capacity fails closed rather than deleting prior restoration evidence", () => {
  let state = retired();
  for (let index = 3; index <= 130; index++) {
    state = restore(restoreRequest(state, [pair("a", 150, 260), pair("b", 310, 420)], index)).nextState;
    state = scope(state, ["b"], ["a", "legacy"]);
  }
  const before = structuredClone(state);
  assert.equal(state.planSwitchReactivations.length, 128);
  reject(() => restore(restoreRequest(state, [pair("a", 151, 261), pair("b", 310, 420)], 131)), "counter_plan_switch_reactivation_invalid");
  assert.deepEqual(state, before);
});
