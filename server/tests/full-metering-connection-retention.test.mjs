import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { transitionFullMeteringCounters as transition, advanceVerifiedFullMeteringGeneration as advance,
  reconcileVerifiedFullMeteringScope as reconcile } from "../services/edge/full-metering-counter-transition.mjs";

const day = 86400000;
const start = "2026-09-01T00:00:00.000Z";
const at = milliseconds => new Date(Date.parse(start) + milliseconds).toISOString();
const generation = "a".repeat(64);
const pair = (connectionId, uploadBytes = 100, downloadBytes = 200) => ({ edgeCredentialRef: "user-a", connectionId, uploadBytes, downloadBytes });
function step(state, observations, milliseconds, extra = {}) {
  const observedAt = at(milliseconds);
  return transition({ state, mode: "connections", sourceRef: "source-a", channelRef: "channel-a", generation,
    eligibleRefs: ["user-a"], retainedRefs: [], observations, observedAt, now: observedAt, minObservedAt: start, ...extra });
}
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}` : JSON.stringify(value);
function rehash(value) {
  const { stateDigest: ignored, ...body } = value;
  return { ...body, stateDigest: createHash("sha256").update(canonical(body)).digest("hex") };
}
const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
function legacyClosed(count = 2) {
  const initial = step(null, [pair("seed")], 1000).nextState;
  const { connectionHistory: ignoredHistory, retentionMigration: ignoredMigration, ...legacy } = initial;
  legacy.schemaVersion = 1;
  legacy.lastObservedAt = at(3000);
  legacy.entries[0].usage = { uploadBytes: 12, downloadBytes: 34 };
  legacy.entries[0].connectionIds = Array.from({ length: count }, (_, n) => `connection-${String(n).padStart(8, "0")}`);
  legacy.connections = legacy.entries[0].connectionIds.map(connectionId => ({ connectionId, edgeCredentialRef: "user-a", generation,
    uploadBytes: 112, downloadBytes: 234, observedAt: at(1000), closedAt: at(2000) }));
  return rehash(legacy);
}

test("retention: closed details become compact history without changing charged usage", () => {
  const baseline = step(null, [pair("one"), pair("live")], 1000).nextState;
  const charged = step(baseline, [pair("one", 110, 220), pair("live", 103, 204)], 2000);
  const closed = step(charged.nextState, [pair("live", 105, 208)], 3000);
  assert.equal(closed.nextState.schemaVersion, 2);
  assert.equal(closed.nextState.connections.length, 1);
  assert.deepEqual(closed.nextState.entries[0].connectionIds, ["live"]);
  assert.equal(closed.nextState.connectionHistory.count, 1);
  assert.equal(closed.totals.totalBytes, 43);
  assert.equal(closed.deltas[0].totalBytes, 6);
  assert.throws(() => step(closed.nextState, [pair("one", 9000, 8000), pair("live", 105, 208)], 4000), /closed_connection_reappeared/);
});

test("retention: exactly thirty days remains protected; older history expires and reappearance only baselines", () => {
  const first = step(null, [pair("one")], 1000).nextState;
  const closed = step(first, [], 2000).nextState;
  const boundary = step(closed, [], 30 * day + 2000).nextState;
  assert.equal(boundary.connectionHistory.count, 1);
  assert.throws(() => step(boundary, [pair("one", 9000, 8000)], 30 * day + 2000), /observation_replay_conflict/);
  const expired = step(boundary, [pair("one", 9000, 8000)], 30 * day + 2001);
  assert.equal(expired.nextState.connectionHistory.count, 0);
  assert.deepEqual(expired.deltas, []);
  assert.equal(expired.totals.totalBytes, 0);
  const continuing = step(expired.nextState, [pair("one", 9001, 8002)], 30 * day + 3000);
  assert.equal(continuing.totals.totalBytes, 3);
});

test("retention: an active thirty-one-day connection keeps its baseline and only adds new bytes", () => {
  const first = step(null, [pair("long-lived")], 1000).nextState;
  const later = step(first, [pair("long-lived", 101, 202)], 31 * day);
  assert.equal(later.nextState.connections.length, 1);
  assert.equal(later.totals.totalBytes, 3);
  assert.equal(later.nextState.connectionHistory.count, 0);
});

test("retention: legacy closed checkpoint migrates explicitly after its original digest verifies", () => {
  const legacy = legacyClosed();
  const frozen = structuredClone(legacy);
  const result = step(legacy, [], 4000);
  assert.equal(result.nextState.schemaVersion, 2);
  assert.equal(result.nextState.connectionHistory.count, 2);
  assert.equal(result.nextState.connections.length, 0);
  assert.equal(result.nextState.retentionMigration.previousStateDigest, legacy.stateDigest);
  assert.equal(result.nextState.retentionMigration.previousSchemaVersion, 1);
  assert.deepEqual(result.nextState.entries[0].usage, legacy.entries[0].usage);
  assert.deepEqual(legacy, frozen);
  assert.deepEqual(result.deltas, []);
  assert.throws(() => step({ ...legacy, stateDigest: "e".repeat(64) }, [], 4000), /counter_state_invalid/);
});

test("retention: migrating an old checkpoint prunes already expired closures without a new charge", () => {
  const result = step(legacyClosed(), [pair("connection-00000000", 100000, 200000)], 31 * day);
  assert.equal(result.nextState.connectionHistory.count, 0);
  assert.equal(result.totals.totalBytes, 46);
  assert.deepEqual(result.deltas, []);
});

test("retention: exact replay leaves the compact state and its migration receipt untouched", () => {
  const closed = step(legacyClosed(), [], 4000).nextState;
  const repeated = step(closed, [], 4000);
  assert.equal(repeated.unchanged, true);
  assert.deepEqual(repeated.nextState, closed);
  assert.deepEqual(repeated.deltas, []);
});

test("retention: generation rotation retains thirty-day fingerprints without copying closed history into archives", () => {
  const closed = step(legacyClosed(), [], 4000).nextState;
  const nextGeneration = "b".repeat(64);
  const changed = advance({ state: closed, generation: nextGeneration, verifiedAt: at(5000) }).nextState;
  assert.equal(changed.connectionHistory.count, 2);
  assert.equal(changed.generationArchives[0].version, 2);
  assert.equal(changed.generationArchives[0].sourceStateDigest, closed.stateDigest);
  assert.equal(Object.hasOwn(changed.generationArchives[0], "snapshot"), false);
  const baseline = step(changed, [pair("connection-00000000", 9000, 8000)], 5000, { generation: nextGeneration });
  assert.deepEqual(baseline.deltas, []);
  assert.equal(baseline.totals.totalBytes, 46);
  const expired = step(baseline.nextState, [pair("connection-00000000", 9001, 8001)], 31 * day, { generation: nextGeneration });
  assert.equal(expired.nextState.connectionHistory.count, 0);
  assert.equal(expired.totals.totalBytes, 48);
});

test("retention: malformed compact histories fail closed even when outer state is rehashed", () => {
  const closed = step(legacyClosed(), [], 4000).nextState;
  const history = closed.connectionHistory;
  for (const patch of [{ count: history.count + 1 }, { encoding: "unknown" }, { data: "!" }, { count: 2000001 }, { data: `${history.data}AAAA` }]) {
    assert.throws(() => step(rehash({ ...closed, connectionHistory: { ...history, ...patch } }), [], 5000), /counter_state_invalid/);
  }
});

test("retention: the legacy 88,790-closure failure case compacts without discarding a thirty-day record", () => {
  const legacy = legacyClosed(88790);
  const result = step(legacy, [], 4000);
  assert.equal(result.nextState.connectionHistory.count, 88790);
  assert.ok(Buffer.byteLength(JSON.stringify(result.nextState)) < 6 * 1024 * 1024);
  assert.equal(result.totals.totalBytes, 46);
  assert.deepEqual(result.deltas, []);
});

test("retention: legacy generation snapshots migrate to explicit summaries retaining old hashes and closure fingerprints", () => {
  const old = legacyClosed(3), nextGeneration = "b".repeat(64);
  const { generationArchives: ignored, ...snapshot } = old;
  const archiveBody = { snapshot, nextGeneration, verifiedAt: at(5000) };
  const archive = { ...archiveBody, archiveDigest: hash(archiveBody) };
  const oldRotated = rehash({ ...old, generation: nextGeneration, generationRevision: 1, generationStartedAt: at(5000),
    generationAwaitingObservation: true, generationArchives: [archive], previousStateDigest: old.stateDigest,
    generationUnassignedGap: { startedAt: at(3000), verifiedAt: at(5000), baselineCompletedAt: null, unassignedBytes: null },
    lastObservedAt: at(5000), lastObservationDigest: hash({ type: "verified_generation_boundary", generation: nextGeneration, verifiedAt: at(5000) }),
    connections: [], entries: old.entries.map(entry => ({ ...entry, generation: nextGeneration, status: "pending_start", carryUsage: { ...entry.usage }, connectionIds: [] })) });
  const migrated = step(oldRotated, [pair("connection-00000000", 9000, 8000)], 5000, { generation: nextGeneration }).nextState;
  assert.equal(migrated.connectionHistory.count, 3);
  assert.equal(migrated.generationArchives[0].sourceStateDigest, old.stateDigest);
  assert.equal(migrated.generationArchives[0].sourceArchiveDigest, archive.archiveDigest);
  assert.deepEqual(migrated.retentionMigration.originalArchiveDigests, [archive.archiveDigest]);
  assert.equal(migrated.retentionMigration.previousStateDigest, oldRotated.stateDigest);
  assert.deepEqual(migrated.entries[0].carryUsage, old.entries[0].usage);
  assert.equal(Object.hasOwn(migrated.generationArchives[0], "snapshot"), false);
  const after = step(migrated, [pair("connection-00000000", 9001, 8001)], 6000, { generation: nextGeneration });
  assert.equal(after.totals.totalBytes, 48);
  const expired = step(after.nextState, [pair("connection-00000000", 9002, 8002)], 31 * day, { generation: nextGeneration });
  assert.equal(expired.nextState.connectionHistory.count, 0);
  assert.equal(expired.totals.totalBytes, 50);
  const tampered = structuredClone(oldRotated);
  tampered.generationArchives[0].snapshot.entries[0].usage.uploadBytes++;
  const { archiveDigest: ignoredDigest, ...forgedBody } = tampered.generationArchives[0];
  tampered.generationArchives[0].archiveDigest = hash(forgedBody);
  assert.throws(() => step(rehash(tampered), [], 5000, { generation: nextGeneration }), /counter_state_invalid/);
});

test("retention: retained owners stop growing cursor lists once their connections disappear", () => {
  const baseline = step(null, [pair("retiring")], 1000).nextState;
  const charged = step(baseline, [pair("retiring", 110, 220)], 2000).nextState;
  const retired = reconcile({ state: charged, eligibleRefs: [], retainedRefs: ["user-a"] }).nextState;
  const missing = step(retired, [], 3000, { eligibleRefs: [], retainedRefs: ["user-a"] }).nextState;
  assert.deepEqual(missing.retiredConnections, []);
  assert.deepEqual(missing.retiredEntries[0].connectionIds, []);
  assert.deepEqual(missing.retiredEntries[0].usage, { uploadBytes: 10, downloadBytes: 20 });
  assert.equal(missing.connectionHistory.count, 1);
  const expired = step(missing, [pair("retiring", 9999, 9999)], 31 * day, { eligibleRefs: [], retainedRefs: ["user-a"] });
  assert.equal(expired.retiredTotals.totalBytes, 30);
  assert.equal(expired.nextState.connectionHistory.count, 0);
  assert.deepEqual(expired.deltas, []);
});

test("retention: sorted unique fingerprints and trustworthy closure timestamps are mandatory", () => {
  const closed = step(legacyClosed(2), [], 4000).nextState;
  const original = Buffer.from(closed.connectionHistory.data, "base64");
  const reversed = Buffer.concat([original.subarray(40), original.subarray(0, 40)]);
  const duplicate = Buffer.concat([original.subarray(0, 40), original.subarray(0, 40)]);
  const future = Buffer.from(original); future.writeBigUInt64BE(BigInt(Date.parse(at(6000))), 32);
  const unsafe = Buffer.from(original); unsafe.writeBigUInt64BE(0xffffffffffffffffn, 32);
  for (const buffer of [reversed, duplicate, future, unsafe]) assert.throws(() => step(rehash({ ...closed,
    connectionHistory: { ...closed.connectionHistory, data: buffer.toString("base64") } }), [], 5000), /counter_state_invalid/);
  let invoked = 0;
  const getter = { ...closed };
  Object.defineProperty(getter, "schemaVersion", { enumerable: true, get() { invoked++; return 2; } });
  assert.throws(() => step(getter, [], 5000), /counter_state_invalid/);
  assert.equal(invoked, 0);
});

test("retention: a verified generation boundary at the initial observation timestamp is still a zero-charge boundary", () => {
  const first = step(null, [pair("instant")], 0).nextState;
  const nextGeneration = "b".repeat(64);
  const next = advance({ state: first, generation: nextGeneration, verifiedAt: start }).nextState;
  assert.equal(next.connectionHistory.count, 1);
  const baseline = step(next, [pair("instant", 9000, 8000)], 0, { generation: nextGeneration });
  assert.deepEqual(baseline.deltas, []);
  assert.equal(baseline.totals.totalBytes, 0);
});
