import assert from "node:assert/strict";
import test from "node:test";
import * as counters from "../services/edge/full-metering-counter-transition.mjs";

const ordinary = counters.transitionFullMeteringCounters;
const combined = request => counters.transitionVerifiedFullMeteringMaterialAndPlanSwitchCounters(request);
const time = index => new Date(Date.parse("2026-10-15T00:00:00.000Z") + index * 10000).toISOString();
const pair = (edgeCredentialRef, uploadBytes, downloadBytes, mode = "cumulative") => ({ edgeCredentialRef,
  uploadBytes, downloadBytes, ...(mode === "connections" ? { connectionId: `connection-${edgeCredentialRef}` } : {}) });
const observations = (mode, values) => values.map(([owner, upload, download]) => pair(owner, upload, download, mode));
function request(state, values, index, patch = {}) {
  return { state, mode: state?.mode ?? "cumulative", sourceRef: "source-a", channelRef: "channel-a",
    generation: state?.generation ?? "a".repeat(64), eligibleRefs: ["pack", "peer", "plan"], retainedRefs: ["legacy"],
    observedAt: time(index), now: time(index), minObservedAt: time(0), observations: values, ...patch };
}
function baseline(mode = "cumulative") {
  let state = ordinary(request(null, observations(mode, [["pack", 100, 200], ["peer", 300, 400], ["plan", 500, 600]]), 1, { mode })).nextState;
  return ordinary(request(state, observations(mode, [["pack", 150, 260], ["peer", 310, 420], ["plan", 550, 660]]), 2)).nextState;
}
function boundaryRequest(state, patch = {}) {
  return { ...request(state, observations(state.mode, [["pack", 1, 2], ["peer", 315, 427], ["plan", 9000, 8000]]), 3),
    materialRefs: ["pack"], planSwitchRefs: ["plan"], ...patch };
}
const reject = (fn, code) => assert.throws(fn, error => error.code === code);

for (const mode of ["cumulative", "connections"]) {
  test(`combined boundaries: ${mode} atomically preserves two carries and charges only the ordinary peer`, () => {
    const state = baseline(mode), original = structuredClone(state), result = combined(boundaryRequest(state));
    assert.deepEqual(state, original);
    assert.deepEqual(result.deltas.map(delta => [delta.edgeCredentialRef, delta.totalBytes]), [["peer", 12]]);
    for (const owner of ["pack", "plan"]) {
      const previous = state.entries.find(entry => entry.edgeCredentialRef === owner);
      const next = result.nextState.entries.find(entry => entry.edgeCredentialRef === owner);
      assert.deepEqual(next.usage, previous.usage);
      assert.deepEqual(next.carryUsage, previous.usage);
    }
    assert.deepEqual(result.nextState.materialBoundaries[0].entries.map(entry => entry.edgeCredentialRef), ["pack"]);
    assert.deepEqual(result.nextState.planSwitchBoundaries[0].entries.map(entry => entry.edgeCredentialRef), ["plan"]);
    assert.deepEqual(result.receipt, {
      type: "verified_full_metering_material_and_plan_switch_transition", materialCount: 1, planSwitchCount: 1,
      materialBoundaryDigest: result.nextState.materialBoundaries[0].boundaryDigest,
      planSwitchBoundaryDigest: result.nextState.planSwitchBoundaries[0].boundaryDigest,
      beforeStateDigest: state.stateDigest, afterStateDigest: result.nextState.stateDigest,
      generation: state.generation, observedAt: time(3), unassignedBytes: null
    });
    assert.equal(Object.hasOwn(result.receipt, "materialRefs"), false);
    assert.equal(Object.hasOwn(result.receipt, "planSwitchRefs"), false);
    const later = ordinary(request(result.nextState, observations(mode,
      [["pack", 4, 7], ["peer", 316, 428], ["plan", 9002, 8003]]), 4));
    assert.deepEqual(later.deltas.map(delta => [delta.edgeCredentialRef, delta.totalBytes]), [["pack", 8], ["peer", 2], ["plan", 5]]);
    assert.deepEqual(later.nextState.materialBoundaries, result.nextState.materialBoundaries);
    assert.deepEqual(later.nextState.planSwitchBoundaries, result.nextState.planSwitchBoundaries);
  });
  test(`combined boundaries: ${mode} plan-only and ordinary counters remain monotonic`, () => {
    const state = baseline(mode), original = structuredClone(state);
    for (const values of [
      [["pack", 1, 2], ["peer", 315, 427], ["plan", 549, 660]],
      [["pack", 1, 2], ["peer", 315, 427], ["plan", 550, 659]],
      [["pack", 1, 2], ["peer", 309, 420], ["plan", 9000, 8000]]
    ]) reject(() => combined(boundaryRequest(state, { observations: observations(mode, values) })), "counter_decreased");
    assert.deepEqual(state, original);
  });
  test(`combined boundaries: ${mode} plan reactivation composes with a different pack reset`, () => {
    const paid = baseline(mode), state = counters.reconcileVerifiedFullMeteringScope({ state: paid,
      eligibleRefs: ["pack", "peer"], retainedRefs: ["legacy", "plan"] }).nextState;
    const original = structuredClone(state), result = combined(boundaryRequest(state, { reactivationRefs: ["plan"] }));
    assert.deepEqual(state, original);
    assert.deepEqual(result.deltas.map(delta => [delta.edgeCredentialRef, delta.totalBytes]), [["peer", 12]]);
    assert.equal(result.nextState.retiredEntries.length, 0);
    assert.deepEqual(result.nextState.entries.find(entry => entry.edgeCredentialRef === "plan").usage, paid.entries[2].usage);
    assert.equal(result.receipt.reactivationCount, 1);
    assert.equal(result.receipt.reactivationBoundaryDigest, result.nextState.planSwitchReactivations[0].boundaryDigest);
    assert.equal(result.nextState.materialBoundaries.length, 1);
    assert.equal(result.nextState.planSwitchBoundaries.length, 1);
    reject(() => combined(boundaryRequest(state, { reactivationRefs: ["plan"], observations: observations(mode,
      [["pack", 1, 2], ["peer", 315, 427], ["plan", 549, 660]]) })), "counter_decreased");
    const later = ordinary(request(result.nextState, observations(mode,
      [["pack", 4, 7], ["peer", 316, 428], ["plan", 9002, 8003]]), 4));
    assert.deepEqual(later.deltas.map(delta => [delta.edgeCredentialRef, delta.totalBytes]), [["pack", 8], ["peer", 2], ["plan", 5]]);
  });
  test(`combined boundaries: ${mode} independently verified generation reactivation keeps zero-charge boundaries`, () => {
    const state = counters.reconcileVerifiedFullMeteringScope({ state: baseline(mode),
      eligibleRefs: ["pack", "peer"], retainedRefs: ["legacy", "plan"] }).nextState;
    const advanced = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: time(3) }).nextState;
    const result = combined(boundaryRequest(advanced, { reactivationRefs: ["plan"],
      observations: observations(mode, [["pack", 1, 2], ["peer", 3, 4], ["plan", 5, 6]]) }));
    assert.deepEqual(result.deltas, []);
    assert.equal(result.receipt.materialBoundaryDigest, null);
    assert.equal(result.receipt.planSwitchBoundaryDigest, null);
    assert.equal(result.nextState.generationRevision, 1);
    assert.equal(result.nextState.generationAwaitingObservation, false);
    assert.equal(Object.hasOwn(result.nextState, "materialBoundaries"), false);
    assert.equal(Object.hasOwn(result.nextState, "planSwitchBoundaries"), false);
    const later = ordinary(request(result.nextState, observations(mode, [["pack", 2, 4], ["peer", 5, 6], ["plan", 7, 9]]), 4));
    assert.deepEqual(later.deltas.map(delta => [delta.edgeCredentialRef, delta.totalBytes]), [["pack", 3], ["peer", 4], ["plan", 5]]);
  });
}

test("combined boundaries: malformed, overlapping, unknown or empty selections cannot authorize a boundary", () => {
  const state = baseline(), original = structuredClone(state);
  for (const patch of [{ materialRefs: [] }, { planSwitchRefs: [] }, { materialRefs: ["pack", "pack"] },
    { planSwitchRefs: ["plan", "plan"] }, { materialRefs: ["pack", "plan"] }, { materialRefs: ["unknown"] },
    { planSwitchRefs: ["unknown"] }, { materialRefs: ["legacy"] }, { materialRefs: ["peer", "pack"] },
    { planSwitchRefs: ["plan", "peer"] }, { reactivationRefs: [] }, { reactivationRefs: ["pack"] },
    { reactivationRefs: ["plan", "plan"] }, { reactivationRefs: ["plan"] }, { unexpected: true },
    { state: null }, { sourceRef: "other" }, { channelRef: "other" }, { generation: "b".repeat(64) },
    { eligibleRefs: ["pack", "plan"] }, { observedAt: time(2) }]) {
    assert.throws(() => combined(boundaryRequest(state, patch)));
    assert.deepEqual(state, original);
  }
  const getter = boundaryRequest(state);
  Object.defineProperty(getter, "materialRefs", { get() { throw new Error("must-not-read-getter"); } });
  reject(() => combined(getter), "counter_input_invalid");
  assert.throws(() => combined({ ...boundaryRequest(state), [Symbol("unknown")]: true }));
});

test("combined boundaries: replay is ordinary and cannot establish duplicate continuation evidence", () => {
  const initial = boundaryRequest(baseline()), result = combined(initial);
  const { materialRefs: ignoredMaterial, planSwitchRefs: ignoredPlan, ...replay } = initial;
  assert.equal(ordinary({ ...replay, state: result.nextState }).unchanged, true);
  assert.throws(() => combined({ ...initial, state: result.nextState }));
  reject(() => ordinary({ ...replay, state: result.nextState,
    observations: observations("cumulative", [["pack", 2, 2], ["peer", 315, 427], ["plan", 9000, 8000]]) }), "observation_replay_conflict");
});

test("combined boundaries: cumulative selected refs require real pairs; a generation advance is not implicit", () => {
  const state = baseline();
  for (const owner of ["pack", "plan"]) assert.throws(() => combined(boundaryRequest(state,
    { observations: boundaryRequest(state).observations.filter(observation => observation.edgeCredentialRef !== owner) })));
  const advanced = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: time(3) }).nextState;
  assert.throws(() => combined(boundaryRequest(advanced)));
});

test("combined boundaries: complete empty connection snapshot preserves usage and closed IDs", () => {
  const state = baseline("connections"), result = combined(boundaryRequest(state, { observations: [] }));
  assert.deepEqual(result.deltas, []);
  assert.equal(result.nextState.connectionHistory.count, 3);
  assert.deepEqual(result.nextState.entries.map(entry => entry.usage), state.entries.map(entry => entry.usage));
  reject(() => ordinary(request(result.nextState, observations("connections", [["pack", 1, 2]]), 4)), "closed_connection_reappeared");
});

for (const mode of ["cumulative", "connections"]) test(`combined boundaries: ${mode} repeated boundaries and true generation retirement retain both histories`, () => {
  const first = combined(boundaryRequest(baseline(mode))).nextState;
  const metered = ordinary(request(first, observations(mode, [["pack", 4, 7], ["peer", 316, 428], ["plan", 9002, 8003]]), 4)).nextState;
  const second = combined({ ...request(metered, observations(mode, [["pack", 1, 1], ["peer", 317, 429], ["plan", 10000, 10000]]), 5),
    materialRefs: ["pack"], planSwitchRefs: ["plan"] }).nextState;
  assert.deepEqual(second.materialBoundaries.slice(0, 1), first.materialBoundaries);
  assert.deepEqual(second.planSwitchBoundaries.slice(0, 1), first.planSwitchBoundaries);
  assert.deepEqual(second.entries[0].carryUsage, { uploadBytes: 53, downloadBytes: 65 });
  assert.deepEqual(second.entries[2].carryUsage, { uploadBytes: 52, downloadBytes: 63 });
  const retired = counters.reconcileVerifiedFullMeteringScope({ state: second,
    eligibleRefs: ["peer"], retainedRefs: ["legacy", "pack", "plan"] }).nextState;
  const advanced = counters.advanceVerifiedFullMeteringGeneration({ state: retired,
    generation: "b".repeat(64), verifiedAt: time(6) }).nextState;
  const result = ordinary(request(advanced, observations(mode, [["peer", 1, 2]]), 7,
    { eligibleRefs: ["peer"], retainedRefs: ["legacy", "pack", "plan"] }));
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.nextState.materialBoundaries, second.materialBoundaries);
  assert.deepEqual(result.nextState.planSwitchBoundaries, second.planSwitchBoundaries);
  assert.deepEqual(result.nextState.retiredEntries.map(entry => entry.usage), [second.entries[0].usage, second.entries[2].usage]);
});
