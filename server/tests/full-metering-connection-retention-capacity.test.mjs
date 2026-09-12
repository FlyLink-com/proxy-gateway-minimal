import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomFillSync } from "node:crypto";
import { transitionFullMeteringCounters as transition } from "../services/edge/full-metering-counter-transition.mjs";

const at = milliseconds => new Date(Date.UTC(2026, 8, 1) + milliseconds).toISOString();
const generation = "a".repeat(64);
function step(state, milliseconds) {
  return transition({ state, mode: "connections", sourceRef: "source-a", channelRef: "channel-a", generation,
    eligibleRefs: ["user-a"], retainedRefs: [], observations: [], minObservedAt: at(0), observedAt: at(milliseconds), now: at(milliseconds) });
}
function rehash(state) {
  const hash = createHash("sha256");
  const visit = value => {
    if (Array.isArray(value)) { hash.update("["); value.forEach((item, i) => { if (i) hash.update(","); visit(item); }); hash.update("]"); }
    else if (value && typeof value === "object") { hash.update("{"); Object.keys(value).sort().forEach((key, i) => { if (i) hash.update(","); hash.update(`${JSON.stringify(key)}:`); visit(value[key]); }); hash.update("}"); }
    else hash.update(JSON.stringify(value));
  };
  const { stateDigest: ignored, ...body } = state; visit(body); return { ...body, stateDigest: hash.digest("hex") };
}

test("retention capacity: 1.33 million thirty-day fingerprints remain bounded independently of live-observation limit", t => {
  const startedAt = performance.now();
  const count = 1330000;
  const buffer = Buffer.allocUnsafe(count * 40);
  // Random suffixes model incompressible fingerprint bytes. Monotonic prefixes
  // make the fixture sorted without creating 1.33 million JavaScript objects.
  randomFillSync(buffer);
  for (let index = 0; index < count; index++) {
    buffer.writeUInt32BE(index, index * 40);
    buffer.writeBigUInt64BE(BigInt(Date.parse(at(1000))), index * 40 + 32);
  }
  const base = step(null, 1000).nextState;
  const state = rehash({ ...base, connectionHistory: { ...base.connectionHistory, count, data: buffer.toString("base64") } });
  const retained = step(state, 29 * 86400000);
  assert.equal(retained.nextState.connectionHistory.count, count);
  assert.deepEqual(retained.deltas, []);
  assert.ok(retained.nextState.connectionHistory.data.length < 72 * 1024 * 1024);
  const expired = step(retained.nextState, 31 * 86400000);
  assert.equal(expired.nextState.connectionHistory.count, 0);
  assert.equal(expired.nextState.connectionHistory.data, "");
  assert.deepEqual(expired.deltas, []);
  t.diagnostic(JSON.stringify({ fingerprintCount: count, packedBytes: buffer.length, base64Bytes: state.connectionHistory.data.length,
    elapsedMs: Math.round(performance.now() - startedAt), maxResidentKiB: process.resourceUsage().maxRSS }));
});
