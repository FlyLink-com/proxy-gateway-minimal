import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import * as counters from "../services/edge/full-metering-counter-transition.mjs";

const transition = counters.transitionFullMeteringCounters;
const material = request => counters.transitionVerifiedFullMeteringMaterialCounters(request);
const times = Array.from({ length: 7 }, (_, i) => `2026-09-24T06:00:${String(i * 10).padStart(2, "0")}.000Z`);
times[6] = "2026-09-24T06:01:00.000Z";
const pair = (edgeCredentialRef, uploadBytes, downloadBytes, connectionId) => ({
  edgeCredentialRef, uploadBytes, downloadBytes, ...(connectionId ? { connectionId } : {})
});
function request(state, observations, index, overrides = {}) {
  return { state, mode: state?.mode ?? "cumulative", sourceRef: "source-a", channelRef: "channel-a",
    generation: "a".repeat(64), eligibleRefs: ["user-a", "user-b"], retainedRefs: ["retained-a"],
    observedAt: times[index], now: times[index], minObservedAt: times[0], maxAgeMs: 60000, observations, ...overrides };
}
function baseline(mode = "cumulative") {
  const id = mode === "connections" ? ["conn-a", "conn-b"] : [];
  const first = transition(request(null, [pair("user-a", 100, 200, id[0]), pair("user-b", 300, 400, id[1])], 1, { mode }));
  return transition(request(first.nextState, [pair("user-a", 150, 260, id[0]), pair("user-b", 310, 420, id[1])], 2)).nextState;
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

test("material counters: explicit export preserves usage and generation while baselining only selected cumulative identities", () => {
  const state = baseline();
  const original = structuredClone(state);
  const result = material({ ...request(state, [pair("user-a", 1, 2), pair("user-b", 315, 427)], 3), materialRefs: ["user-a"] });
  assert.deepEqual(state, original);
  assert.equal(result.unchanged, false);
  assert.equal(result.nextState.generation, state.generation);
  assert.equal(result.nextState.generationRevision, state.generationRevision);
  assert.deepEqual(result.nextState.generationArchives, state.generationArchives);
  assert.deepEqual(result.nextState.entries[0].usage, { uploadBytes: 50, downloadBytes: 60 });
  assert.deepEqual(result.nextState.entries[0].carryUsage, state.entries[0].usage);
  assert.deepEqual(result.nextState.entries[0].cursor, { uploadBytes: 1, downloadBytes: 2, observedAt: times[3] });
  assert.deepEqual(result.deltas, [{ edgeCredentialRef: "user-b", uploadBytes: 5, downloadBytes: 7,
    totalBytes: 12, intervalStartedAt: times[2], intervalEndedAt: times[3] }]);
  assert.deepEqual(result.totals, { uploadBytes: 65, downloadBytes: 87, totalBytes: 152 });
  assert.equal(result.receipt.unassignedBytes, null);
  assert.equal(result.receipt.beforeStateDigest, state.stateDigest);
  assert.equal(result.receipt.afterStateDigest, result.nextState.stateDigest);
  assert.equal(result.receipt.materialCount, 1);
  assert.equal(JSON.stringify(result.receipt).includes("user-a"), false);
  const later = transition(request(result.nextState, [pair("user-a", 4, 7), pair("user-b", 318, 428)], 4));
  assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.uploadBytes, d.downloadBytes]), [["user-a", 3, 5], ["user-b", 3, 1]]);
  assert.deepEqual(later.nextState.entries[0].usage, { uploadBytes: 53, downloadBytes: 65 });
});

test("material counters: higher replacement counters are also a zero-charge boundary", () => {
  const state = baseline();
  const result = material({ ...request(state, [pair("user-a", 9000, 8000), pair("user-b", 310, 420)], 3), materialRefs: ["user-a"] });
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.nextState.entries.map(e => e.usage), state.entries.map(e => e.usage));
  assert.equal(result.counters[0].uploadBytes, 9000);
});

test("material counters: ordinary transition rejects material opt-in and still rejects decreases", () => {
  const state = baseline();
  const r = request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3);
  reject(() => transition({ ...r, materialRefs: ["user-a"] }), "counter_input_invalid");
  reject(() => transition(r), "counter_decreased");
});

test("material counters: material refs must be a nonempty sorted unique eligible subset", () => {
  const state = baseline();
  for (const materialRefs of [[], ["user-a", "user-a"], ["user-b", "user-a"], ["retained-a"], ["unknown-a"]]) {
    assert.throws(() => material({ ...request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), materialRefs }));
  }
});

test("material counters: existing valid state, unchanged source/scope/generation and strictly later fresh time are required", () => {
  const state = baseline();
  const r = { ...request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), materialRefs: ["user-a"] };
  for (const patch of [{ state: null }, { state: { ...state, stateDigest: "b".repeat(64) } },
    { sourceRef: "other-source" }, { eligibleRefs: ["user-a"] }, { generation: "b".repeat(64) },
    { observedAt: times[2] }, { observedAt: times[1] }, { now: "2026-09-24T06:02:00.000Z" }, { unexpected: true }]) {
    assert.throws(() => material({ ...r, ...patch }));
  }
});

test("material counters: complete selected pairs and normal unaffected safety checks remain mandatory", () => {
  const state = baseline();
  for (const observations of [[pair("user-b", 310, 420)], [pair("user-a", 1, 2)],
    [pair("user-a", 1, 2), pair("user-b", 309, 420)],
    [{ edgeCredentialRef: "user-a", uploadBytes: 1 }, pair("user-b", 310, 420)]]) {
    assert.throws(() => material({ ...request(state, observations, 3), materialRefs: ["user-a"] }));
  }
});

test("material counters: connections baseline selected current IDs and preserve unaffected increments and old history", () => {
  const initial = baseline("connections");
  const closed = transition(request(initial, [pair("user-a", 150, 260, "conn-a"), pair("user-a", 1000, 2000, "old-a"),
    pair("user-b", 310, 420, "conn-b")], 3)).nextState;
  const state = transition(request(closed, [pair("user-a", 150, 260, "conn-a"), pair("user-b", 310, 420, "conn-b")], 4)).nextState;
  assert.equal(state.connectionHistory.count, 1);
  const result = material({ ...request(state, [pair("user-a", 1, 2, "conn-a"), pair("user-a", 5000, 6000, "new-a"),
    pair("user-b", 315, 427, "conn-b")], 5), materialRefs: ["user-a"] });
  assert.deepEqual(result.nextState.entries[0].usage, state.entries[0].usage);
  assert.deepEqual(result.nextState.entries[0].carryUsage, state.entries[0].usage);
  assert.deepEqual(result.nextState.connectionHistory, state.connectionHistory);
  assert.deepEqual(result.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-b", 12]]);
  const later = transition(request(result.nextState, [pair("user-a", 3, 5, "conn-a"), pair("user-a", 5001, 6002, "new-a"),
    pair("user-b", 315, 427, "conn-b")], 6));
  assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.uploadBytes, d.downloadBytes]), [["user-a", 3, 5]]);
  reject(() => transition(request(result.nextState, [pair("user-a", 1, 2, "old-a"), pair("user-b", 315, 427, "conn-b")], 6)), "closed_connection_reappeared");
});

test("material counters: disappearing selected live connection becomes a tombstone", () => {
  const state = baseline("connections");
  const result = material({ ...request(state, [pair("user-a", 1, 2, "new-a"), pair("user-b", 310, 420, "conn-b")], 3), materialRefs: ["user-a"] });
  assert.equal(result.nextState.connectionHistory.count, 1);
  assert.deepEqual(result.nextState.entries[0].usage, state.entries[0].usage);
  reject(() => transition(request(result.nextState, [pair("user-a", 151, 261, "conn-a"), pair("user-b", 310, 420, "conn-b")], 4)), "closed_connection_reappeared");
});

test("material counters: selected connection owner drift and prior tombstones cannot be rebased", () => {
  const state = baseline("connections");
  reject(() => material({ ...request(state, [pair("user-a", 1, 2, "conn-b"), pair("user-b", 1, 2, "conn-a")], 3), materialRefs: ["user-a"] }), "connection_identity_changed");
  const closed = transition(request(state, [pair("user-b", 310, 420, "conn-b")], 3)).nextState;
  reject(() => material({ ...request(closed, [pair("user-a", 1, 2, "conn-a"), pair("user-b", 310, 420, "conn-b")], 4), materialRefs: ["user-a"] }), "closed_connection_reappeared");
});

test("material counters: selected connection identity may be absent while unaffected usage continues", () => {
  const state = baseline("connections");
  const result = material({ ...request(state, [pair("user-b", 315, 427, "conn-b")], 3), materialRefs: ["user-a"] });
  assert.deepEqual(result.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-b", 12]]);
  assert.deepEqual(result.nextState.entries[0].usage, state.entries[0].usage);
  assert.deepEqual(result.nextState.entries[0].carryUsage, state.entries[0].usage);
  assert.equal(result.nextState.entries[0].status, "observed");
  assert.deepEqual(result.nextState.entries[0].connectionIds, []);
  assert.equal(result.nextState.connectionHistory.count, 1);
  reject(() => transition(request(result.nextState, [pair("user-a", 151, 261, "conn-a"), pair("user-b", 315, 427, "conn-b")], 4)), "closed_connection_reappeared");
});

test("material counters: all-empty complete connection snapshot carries usage and later new connections baseline normally", () => {
  const state = baseline("connections");
  const result = material({ ...request(state, [], 3), materialRefs: ["user-a"] });
  assert.deepEqual(result.counters, []);
  assert.deepEqual(result.deltas, []);
  assert.deepEqual(result.nextState.entries.map(e => e.usage), state.entries.map(e => e.usage));
  assert.deepEqual(result.nextState.entries.map(e => e.status), ["observed", "observed"]);
  assert.deepEqual(result.nextState.connections, []);
  assert.equal(result.nextState.connectionHistory.count, 2);
  assert.equal(result.receipt.unassignedBytes, null);
  const fresh = transition(request(result.nextState, [pair("user-a", 9000, 8000, "new-a"), pair("user-b", 7000, 6000, "new-b")], 4));
  assert.deepEqual(fresh.deltas, []);
  assert.deepEqual(fresh.nextState.entries.map(e => e.usage), state.entries.map(e => e.usage));
  const later = transition(request(fresh.nextState, [pair("user-a", 9003, 8005, "new-a"), pair("user-b", 7002, 6001, "new-b")], 5));
  assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.uploadBytes, d.downloadBytes]), [["user-a", 3, 5], ["user-b", 2, 1]]);
  for (const [owner, id] of [["user-a", "conn-a"], ["user-b", "conn-b"]]) {
    reject(() => transition(request(result.nextState, [pair(owner, 1000, 2000, id)], 4)), "closed_connection_reappeared");
  }
});

test("material counters: absent selected pending connection identity stays pending until its first actual connection", () => {
  const state = transition(request(null, [pair("user-b", 100, 200, "conn-b")], 1, { mode: "connections" })).nextState;
  assert.equal(state.entries[0].status, "pending_start");
  const result = material({ ...request(state, [], 2), materialRefs: ["user-a"] });
  assert.equal(result.nextState.entries[0].status, "pending_start");
  assert.deepEqual(result.nextState.entries[0].usage, { uploadBytes: 0, downloadBytes: 0 });
  assert.deepEqual(result.nextState.entries[0].carryUsage, { uploadBytes: 0, downloadBytes: 0 });
  assert.deepEqual(result.nextState.entries[0].connectionIds, []);
  assert.equal(result.nextState.connectionHistory.count, 1);
  const observed = transition(request(result.nextState, [pair("user-a", 9000, 8000, "new-a")], 3));
  assert.equal(observed.nextState.entries[0].status, "observed");
  assert.deepEqual(observed.deltas, []);
});

test("material counters: repeated explicit boundaries keep prior evidence and ordinary exact replay remains unchanged", () => {
  const state = baseline();
  const first = material({ ...request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), materialRefs: ["user-a"] });
  const advanced = transition(request(first.nextState, [pair("user-a", 4, 7), pair("user-b", 310, 420)], 4)).nextState;
  const second = material({ ...request(advanced, [pair("user-a", 0, 0), pair("user-b", 310, 420)], 5), materialRefs: ["user-a"] });
  assert.equal(second.nextState.materialBoundaries.length, 2);
  assert.deepEqual(second.nextState.materialBoundaries[0], first.nextState.materialBoundaries[0]);
  assert.deepEqual(second.nextState.entries[0].carryUsage, { uploadBytes: 53, downloadBytes: 65 });
  const replay = transition(request(second.nextState, [pair("user-a", 0, 0), pair("user-b", 310, 420)], 5));
  assert.equal(replay.unchanged, true);
  assert.deepEqual(replay.nextState, second.nextState);
  assert.throws(() => material({ ...request(second.nextState, [pair("user-a", 0, 0), pair("user-b", 310, 420)], 5), materialRefs: ["user-a"] }));
});

for (const mode of ["cumulative", "connections"]) test(`material counters: ${mode} material carry survives retirement and a true generation advance`, () => {
  const state = baseline(mode);
  const ids = mode === "connections" ? ["new-a", "conn-b"] : [];
  const result = material({ ...request(state, [pair("user-a", 1, 2, ids[0]), pair("user-b", 310, 420, ids[1])], 3), materialRefs: ["user-a"] });
  const retired = counters.reconcileVerifiedFullMeteringScope({ state: result.nextState, eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }).nextState;
  const rotated = counters.advanceVerifiedFullMeteringGeneration({ state: retired, generation: "b".repeat(64), verifiedAt: times[4] }).nextState;
  const observed = transition(request(rotated, [pair("user-b", 1, 2, ids[1])], 5, {
    generation: "b".repeat(64), eligibleRefs: ["user-b"], retainedRefs: ["retained-a", "user-a"] }));
  assert.deepEqual(observed.nextState.retiredEntries[0].usage, state.entries[0].usage);
  assert.deepEqual(observed.nextState.retiredEntries[0].carryUsage, state.entries[0].usage);
  assert.deepEqual(observed.nextState.materialBoundaries, result.nextState.materialBoundaries);
  assert.deepEqual(observed.deltas, []);
});

test("material counters: optional material evidence and carry invariants reject rehashed corruption", () => {
  const state = material({ ...request(baseline(), [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3), materialRefs: ["user-a"] }).nextState;
  const variants = [
    s => { delete s.materialBoundaries; },
    s => { s.materialBoundaries = []; },
    s => { s.materialBoundaries[0].unexpected = true; },
    s => { s.materialBoundaries[0].observedAt = times[4]; },
    s => { s.materialBoundaries[0].generation = "b".repeat(64); },
    s => { s.entries[0].carryUsage.uploadBytes = 49; },
    s => { s.materialBoundaries.push(structuredClone(s.materialBoundaries[0])); },
    s => { s.materialBoundaries[0].entries[0].carryUsage.uploadBytes = 51;
      const { boundaryDigest: ignored, ...payload } = s.materialBoundaries[0]; s.materialBoundaries[0].boundaryDigest = digest(payload); }
  ];
  for (const mutate of variants) {
    const changed = structuredClone(state); mutate(changed);
    reject(() => transition(request(rehash(changed), [pair("user-a", 2, 3), pair("user-b", 310, 420)], 4)), "counter_state_invalid");
  }
});

test("material counters: source boundary count is bounded and exhaustion does not interrupt normal increments", () => {
  let state = baseline();
  for (let i = 1; i <= 128; i++) {
    const observedAt = new Date(Date.parse(times[2]) + i * 1000).toISOString();
    state = material({ ...request(state, [pair("user-a", 1, 2), pair("user-b", 310, 420)], 3,
      { observedAt, now: observedAt }), materialRefs: ["user-a"] }).nextState;
  }
  assert.equal(state.materialBoundaries.length, 128);
  const observedAt = new Date(Date.parse(state.lastObservedAt) + 1000).toISOString();
  const next = request(state, [pair("user-a", 2, 4), pair("user-b", 310, 420)], 3, { observedAt, now: observedAt });
  reject(() => material({ ...next, materialRefs: ["user-a"] }), "counter_material_transition_invalid");
  assert.deepEqual(transition(next).deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-a", 3]]);
});

for (const mode of ["cumulative", "connections"]) test(`material counters: ${mode} next-generation carry and later material boundary remain independently valid`, () => {
  const ids = mode === "connections" ? ["conn-a", "conn-b"] : [];
  const state = material({ ...request(baseline(mode), [pair("user-a", 1, 2, ids[0]), pair("user-b", 310, 420, ids[1])], 3), materialRefs: ["user-a"] }).nextState;
  const advanced = counters.advanceVerifiedFullMeteringGeneration({ state, generation: "b".repeat(64), verifiedAt: times[4] }).nextState;
  const current = transition(request(advanced, [pair("user-a", 10, 20, ids[0]), pair("user-b", 30, 40, ids[1])], 4, { generation: "b".repeat(64) })).nextState;
  const result = material({ ...request(current, [pair("user-a", 0, 0, ids[0]), pair("user-b", 31, 42, ids[1])], 5,
    { generation: "b".repeat(64) }), materialRefs: ["user-a"] });
  assert.equal(result.nextState.generationRevision, 1);
  assert.equal(result.nextState.materialBoundaries.length, 2);
  assert.deepEqual(result.nextState.entries[0].carryUsage, state.entries[0].usage);
  const later = transition(request(result.nextState, [pair("user-a", 1, 1, ids[0]), pair("user-b", 31, 42, ids[1])], 6,
    { generation: "b".repeat(64) }));
  assert.deepEqual(later.deltas.map(d => [d.edgeCredentialRef, d.totalBytes]), [["user-a", 2]]);
});

test("material counters: a valid legacy connection state migrates while carrying its material evidence", () => {
  const state = baseline("connections");
  const { connectionHistory: ignoredHistory, retentionMigration: ignoredMigration, ...old } = state;
  old.schemaVersion = 1;
  const legacy = rehash(old);
  const result = material({ ...request(legacy, [pair("user-a", 1, 2, "conn-a"), pair("user-b", 310, 420, "conn-b")], 3), materialRefs: ["user-a"] });
  assert.equal(result.nextState.schemaVersion, 2);
  assert.equal(result.nextState.retentionMigration.previousStateDigest, legacy.stateDigest);
  assert.deepEqual(result.nextState.entries[0].carryUsage, legacy.entries[0].usage);
  assert.deepEqual(result.deltas, []);
  const later = transition(request(result.nextState, [pair("user-a", 3, 5, "conn-a"), pair("user-b", 310, 420, "conn-b")], 4));
  assert.equal(later.totals.totalBytes, 145);
});
