import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import * as counters from "../services/edge/full-metering-counter-transition.mjs";

const transition = counters.transitionFullMeteringCounters;
const planSwitch = request => counters.transitionVerifiedFullMeteringPlanSwitchCounters(request);
const time = index => new Date(Date.parse("2026-10-12T00:00:00.000Z") + index * 10000).toISOString();
const pair = (edgeCredentialRef, uploadBytes, downloadBytes, connectionId) => ({
  edgeCredentialRef, uploadBytes, downloadBytes, ...(connectionId ? { connectionId } : {})
});
function request(state, observations, index, overrides = {}) {
  return { state, mode: state?.mode ?? "cumulative", sourceRef: "source-a", channelRef: "channel-a",
    generation: "a".repeat(64), eligibleRefs: ["user-a", "user-b"], retainedRefs: ["retained-a"],
    observedAt: time(index), now: time(index), minObservedAt: time(0), maxAgeMs: 60000, observations, ...overrides };
}
function baseline(mode = "cumulative") {
  const ids = mode === "connections" ? ["conn-a", "conn-b"] : [];
  const first = transition(request(null, [pair("user-a", 100, 200, ids[0]), pair("user-b", 300, 400, ids[1])], 1, { mode }));
  return transition(request(first.nextState, [pair("user-a", 150, 260, ids[0]), pair("user-b", 310, 420, ids[1])], 2)).nextState;
}
const reject = (fn, code) => assert.throws(fn, error => error.code === code && !error.message.includes("user-a"));
function digest(value) {
  const canonical = item => Array.isArray(item) ? `[${item.map(canonical).join(",")}]`
    : item && typeof item === "object" ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`
      : JSON.stringify(item);
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function rehash(state) {
  const { stateDigest: ignored, ...payload } = state;
  return { ...payload, stateDigest: digest(payload) };
}

test("plan-switch counters: selected cumulative boundary preserves usage without charging the unknown interval", () => {
  const state = baseline(), original = structuredClone(state);
  const result = planSwitch({ ...request(state, [pair("user-a", 9000, 8000), pair("user-b", 315, 427)], 3), planSwitchRefs: ["user-a"] });
  assert.deepEqual(state, original);
  assert.equal(result.nextState.generation, state.generation);
  assert.equal(result.nextState.generationRevision, 0);
  assert.deepEqual(result.nextState.entries[0].usage, { uploadBytes: 50, downloadBytes: 60 });
  assert.deepEqual(result.nextState.entries[0].carryUsage, state.entries[0].usage);
  assert.deepEqual(result.nextState.entries[0].cursor, { uploadBytes: 9000, downloadBytes: 8000, observedAt: time(3) });
  assert.deepEqual(result.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-b", 12]]);
  assert.equal(result.nextState.planSwitchBoundaries.length, 1);
  assert.equal(Object.hasOwn(result.nextState, "billingWindowBoundaries"), false);
  assert.equal(Object.hasOwn(result.nextState, "materialBoundaries"), false);
  assert.deepEqual(result.receipt, {
    type: "verified_full_metering_plan_switch_transition", planSwitchCount: 1,
    planSwitchBoundaryDigest: result.nextState.planSwitchBoundaries[0].boundaryDigest,
    beforeStateDigest: state.stateDigest, afterStateDigest: result.nextState.stateDigest,
    generation: state.generation, observedAt: time(3), unassignedBytes: null
  });
  assert.equal(JSON.stringify(result.receipt).includes("user-a"), false);
  const later = transition(request(result.nextState, [pair("user-a", 9003, 8005), pair("user-b", 318, 428)], 4));
  assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-a", 8], ["user-b", 4]]);
  assert.deepEqual(later.nextState.entries[0].usage, { uploadBytes: 53, downloadBytes: 65 });
  assert.deepEqual(later.nextState.planSwitchBoundaries, result.nextState.planSwitchBoundaries);
});

test("plan-switch counters: ordinary transition never implicitly opts in", () => {
  const state = baseline(), r = request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3);
  reject(() => transition({ ...r, planSwitchRefs: ["user-a"] }), "counter_input_invalid");
  reject(() => transition(r), "counter_decreased");
});

test("plan-switch counters: refs must be sorted unique nonempty and eligible", () => {
  for (const planSwitchRefs of [[], ["user-a", "user-a"], ["user-b", "user-a"], ["retained-a"], ["unknown-a"]]) {
    assert.throws(() => planSwitch({ ...request(baseline(), [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), planSwitchRefs }));
  }
});

test("plan-switch counters: missing or invalid cumulative observations cannot fabricate a boundary", () => {
  for (const observations of [[pair("user-b", 310, 420)], [pair("user-a", 1, 2)],
    [{ edgeCredentialRef: "user-a", uploadBytes: 1 }, pair("user-b", 310, 420)],
    [pair("user-a", -1, 2), pair("user-b", 310, 420)],
    [pair("user-a", 1, 2), pair("user-a", 1, 2), pair("user-b", 310, 420)],
    [pair("user-a", 1, 2), pair("user-b", 309, 420)],
    [pair("user-a", 1, 2), pair("user-b", 310, 420), pair("unknown-a", 1, 2)]]) {
    assert.throws(() => planSwitch({ ...request(baseline(), observations, 3), planSwitchRefs: ["user-a"] }));
  }
});

test("plan-switch counters: source, scope, generation, state and fresh strictly later observation remain mandatory", () => {
  const state = baseline(), r = { ...request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), planSwitchRefs: ["user-a"] };
  for (const patch of [{ state: null }, { state: { ...state, stateDigest: "b".repeat(64) } },
    { sourceRef: "other" }, { eligibleRefs: ["user-a"] }, { generation: "b".repeat(64) },
    { observedAt: time(2) }, { observedAt: time(1) }, { now: time(10) }, { unexpected: true }]) {
    assert.throws(() => planSwitch({ ...r, ...patch }));
  }
  const advanced = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: time(3) }).nextState;
  reject(() => planSwitch({ ...r, state: advanced, generation: "b".repeat(64), observedAt: time(4), now: time(4) }), "counter_plan_switch_transition_invalid");
});

test("plan-switch counters: replay is idempotent through ordinary transition but cannot create another boundary", () => {
  const firstRequest = request(baseline(), [pair("user-a", 9000, 8000), pair("user-b", 310, 420)], 3);
  const first = planSwitch({ ...firstRequest, planSwitchRefs: ["user-a"] });
  const replay = { ...firstRequest, state: first.nextState };
  assert.deepEqual(transition(replay).nextState, first.nextState);
  assert.equal(transition(replay).unchanged, true);
  reject(() => planSwitch({ ...replay, planSwitchRefs: ["user-a"] }), "counter_plan_switch_transition_invalid");
  reject(() => transition({ ...replay, observations: [pair("user-a", 9001, 8000), pair("user-b", 310, 420)] }), "observation_replay_conflict");
});

for (const mode of ["cumulative", "connections"]) test(`plan-switch counters: ${mode} selected same-generation counters cannot decrease in either direction`, () => {
  const state = baseline(mode), ids = mode === "connections" ? ["conn-a", "conn-b"] : [];
  for (const [upload, download] of [[149, 270], [160, 259]]) {
    reject(() => planSwitch({ ...request(state, [pair("user-a", upload, download, ids[0]), pair("user-b", 310, 420, ids[1])], 3), planSwitchRefs: ["user-a"] }), "counter_decreased");
  }
});

test("plan-switch counters: connections retain accepted usage and baseline existing and new selected connections", () => {
  const state = baseline("connections");
  const result = planSwitch({ ...request(state, [pair("user-a", 9000, 8000, "conn-a"),
    pair("user-a", 5000, 6000, "new-a"), pair("user-b", 315, 427, "conn-b")], 3), planSwitchRefs: ["user-a"] });
  assert.deepEqual(result.nextState.entries[0].usage, state.entries[0].usage);
  assert.deepEqual(result.nextState.entries[0].carryUsage, state.entries[0].usage);
  assert.deepEqual(result.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-b", 12]]);
  const later = transition(request(result.nextState, [pair("user-a", 9002, 8003, "conn-a"),
    pair("user-a", 5001, 6002, "new-a"), pair("user-b", 315, 427, "conn-b")], 4));
  assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-a", 8]]);
});

test("plan-switch counters: complete zero-connection snapshot closes old IDs but never fabricates zero counters", () => {
  const state = baseline("connections");
  const result = planSwitch({ ...request(state, [], 3), planSwitchRefs: ["user-a"] });
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.counters, []);
  assert.deepEqual(result.nextState.entries[0].usage, state.entries[0].usage);
  assert.equal(result.nextState.entries[0].cursor, null);
  assert.deepEqual(result.nextState.entries[0].connectionIds, []);
  assert.equal(result.nextState.connectionHistory.count, 2);
  reject(() => transition(request(result.nextState, [pair("user-a", 151, 261, "conn-a")], 4)), "closed_connection_reappeared");
  assert.deepEqual(transition(request(result.nextState, [pair("user-a", 9999, 9999, "new-a")], 4)).deltas, []);
});

test("plan-switch counters: observed connection owner drift and closed IDs stay rejected", () => {
  const state = baseline("connections");
  reject(() => planSwitch({ ...request(state, [pair("user-a", 1, 2, "conn-b"), pair("user-b", 1, 2, "conn-a")], 3), planSwitchRefs: ["user-a"] }), "connection_identity_changed");
  const closed = transition(request(state, [pair("user-b", 310, 420, "conn-b")], 3)).nextState;
  reject(() => planSwitch({ ...request(closed, [pair("user-a", 1, 2, "conn-a"), pair("user-b", 310, 420, "conn-b")], 4), planSwitchRefs: ["user-a"] }), "closed_connection_reappeared");
});

test("plan-switch counters: material, billing-window and plan boundaries retain chronological carry", () => {
  let state = baseline();
  state = counters.transitionVerifiedFullMeteringMaterialCounters({ ...request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), materialRefs: ["user-a"] }).nextState;
  state = transition(request(state, [pair("user-a", 4, 7), pair("user-b", 310, 420)], 4)).nextState;
  state = planSwitch({ ...request(state, [pair("user-a", 9000, 8000), pair("user-b", 310, 420)], 5), planSwitchRefs: ["user-a"] }).nextState;
  assert.deepEqual(state.entries[0].carryUsage, { uploadBytes: 53, downloadBytes: 65 });
  state = transition(request(state, [pair("user-a", 9001, 8002), pair("user-b", 310, 420)], 6)).nextState;
  state = counters.transitionVerifiedFullMeteringBillingWindowCounters({ ...request(state, [pair("user-a", 2, 3), pair("user-b", 310, 420)], 7), billingWindowRefs: ["user-a"] }).nextState;
  assert.deepEqual(state.entries[0].carryUsage, { uploadBytes: 54, downloadBytes: 67 });
  assert.equal(state.planSwitchBoundaries.length, 1);
  assert.equal(state.materialBoundaries.length, 1);
  assert.equal(state.billingWindowBoundaries.length, 1);
});

for (const mode of ["cumulative", "connections"]) test(`plan-switch counters: ${mode} boundary survives generation advance and retirement`, () => {
  const state = baseline(mode), ids = mode === "connections" ? ["conn-a", "conn-b"] : [];
  const changed = planSwitch({ ...request(state, [pair("user-a", 9000, 8000, ids[0]), pair("user-b", 310, 420, ids[1])], 3), planSwitchRefs: ["user-a"] }).nextState;
  const retired = counters.reconcileVerifiedFullMeteringScope({ state: changed, eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  const advanced = counters.advanceVerifiedFullMeteringGeneration({ state: retired, generation: "b".repeat(64), verifiedAt: time(4) }).nextState;
  const after = transition(request(advanced, [pair("user-b", 1000, 2000, ids[1])], 5, {
    generation: "b".repeat(64), eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }));
  assert.deepEqual(after.deltas, []);
  assert.deepEqual(after.nextState.planSwitchBoundaries, changed.planSwitchBoundaries);
  assert.deepEqual(after.nextState.retiredEntries[0].usage, state.entries[0].usage);
});

test("plan-switch counters: rehashed evidence deletion, corruption, duplicates and unknown fields fail closed", () => {
  const state = planSwitch({ ...request(baseline(), [pair("user-a", 9000, 8000), pair("user-b", 310, 420)], 3), planSwitchRefs: ["user-a"] }).nextState;
  for (const mutate of [s => { delete s.planSwitchBoundaries; }, s => { s.planSwitchBoundaries = []; },
    s => { s.planSwitchBoundaries[0].unexpected = true; }, s => { s.planSwitchBoundaries[0].generation = "b".repeat(64); },
    s => { s.planSwitchBoundaries.push(structuredClone(s.planSwitchBoundaries[0])); },
    s => { s.entries[0].carryUsage.uploadBytes--; }, s => { s.unknownBoundary = []; }]) {
    const changed = structuredClone(state); mutate(changed);
    reject(() => transition(request(rehash(changed), [pair("user-a", 9001, 8001), pair("user-b", 310, 420)], 4)), "counter_state_invalid");
  }
});

test("plan-switch counters: boundary capacity never silently discards older evidence", () => {
  let state = baseline();
  for (let index = 3; index <= 130; index++) {
    state = planSwitch({ ...request(state, [pair("user-a", 150, 260), pair("user-b", 310, 420)], index), planSwitchRefs: ["user-a"] }).nextState;
  }
  assert.equal(state.planSwitchBoundaries.length, 128);
  const r = request(state, [pair("user-a", 151, 262), pair("user-b", 310, 420)], 131);
  reject(() => planSwitch({ ...r, planSwitchRefs: ["user-a"] }), "counter_plan_switch_transition_invalid");
  const ordinary = transition(r);
  assert.deepEqual(ordinary.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-a", 3]]);
  assert.deepEqual(ordinary.nextState.planSwitchBoundaries, state.planSwitchBoundaries);
});
