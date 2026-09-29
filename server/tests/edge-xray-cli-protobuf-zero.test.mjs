import assert from "node:assert/strict";
import test from "node:test";
import { createXrayStatsCliUsageSnapshotReader } from "../services/edge/xray-stats-cli-usage-reader.mjs";
import { parseStrictXrayUserCounters, parseXrayStatsCliProtobufUserCounters } from "../services/edge/xray-recovery-counter-parser.mjs";

const ref = "synthetic_cli_zero";
const row = (direction, value) => ({ name: `user>>>${ref}>>>traffic>>>${direction}`, value });
const omitted = direction => ({ name: `user>>>${ref}>>>traffic>>>${direction}` });
const pair = [row("uplink", 0), row("downlink", 0)];

function read(payload, calls = []) {
  return createXrayStatsCliUsageSnapshotReader({
    strictCounters: true,
    xrayBinary: "synthetic-xray",
    statsServer: "127.0.0.1:10085",
    nowFn: () => new Date("2026-09-29T22:00:00Z"),
    commandRunner(binary, args, options) {
      calls.push({ binary, args, options });
      return { exitCode: 0, stdout: typeof payload === "string" ? payload : JSON.stringify(payload) };
    }
  })();
}

for (const [label, stat, expected] of [
  ["both omitted protobuf defaults", [omitted("uplink"), omitted("downlink")], [0, 0]],
  ["one omitted default and a canonical int64", [omitted("uplink"), row("downlink", "23")], [0, 23]],
  ["explicit zero pair", pair, [0, 0]],
  ["inbound/outbound omitted defaults", [
    { name: "inbound>>>synthetic_in>>>traffic>>>uplink" },
    { name: "outbound>>>synthetic_out>>>traffic>>>downlink" }, ...pair
  ], [0, 0]]
]) {
  test(`strict CLI accepts ${label} without reset or fabricated identities`, async () => {
    const calls = [];
    const snapshot = await read({ stat }, calls);
    assert.deepEqual(snapshot.entries, [{ edgeCredentialRef: ref, uploadBytes: expected[0], downloadBytes: expected[1] }]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ["api", "statsquery", "--server=127.0.0.1:10085"]);
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.timeout, 20000);
  });
}

test("strict CLI empty stat array has no user observations, not zero observations for configured users", async () => {
  assert.deepEqual((await read({ stat: [] })).entries, []);
});

for (const [label, payload] of [
  ["missing root stat", {}],
  ["stats alias", { stats: pair }],
  ["root array", pair],
  ["null stat", { stat: null }],
  ["missing uplink", { stat: [omitted("downlink")] }],
  ["missing downlink", { stat: [omitted("uplink")] }],
  ["duplicate direction", { stat: [omitted("uplink"), ...pair] }],
  ["unknown row name", { stat: [{ name: "synthetic-unknown" }, ...pair] }],
  ["missing name", { stat: [{}, ...pair] }],
  ["non-object row", { stat: [null, ...pair] }],
  ["null value", { stat: [row("uplink", null), row("downlink", 0)] }],
  ["empty string value", { stat: [row("uplink", ""), row("downlink", 0)] }],
  ["noncanonical value", { stat: [row("uplink", "01"), row("downlink", 0)] }],
  ["negative value", { stat: [row("uplink", -1), row("downlink", 0)] }],
  ["fractional value", { stat: [row("uplink", 0.5), row("downlink", 0)] }],
  ["boolean value", { stat: [row("uplink", false), row("downlink", 0)] }],
  ["unsafe int64", { stat: [row("uplink", "9007199254740993"), row("downlink", 0)] }],
  ["unsafe pair sum", { stat: [row("uplink", Number.MAX_SAFE_INTEGER), row("downlink", 1)] }],
  ["duplicate value key", `{"stat":[{"name":"user>>>${ref}>>>traffic>>>uplink","value":-1,"value":0},{"name":"user>>>${ref}>>>traffic>>>downlink","value":0}]}`]
]) {
  test(`strict CLI still rejects ${label} without exposing the payload`, async () => {
    await assert.rejects(read(payload), error => {
      assert.ok(["recovery_counters_invalid", "validation_error"].includes(error.code));
      assert.doesNotMatch(error.message, /synthetic_cli_zero|synthetic-unknown|9007199254740993/);
      return true;
    });
  });
}

test("generic strict parser never interprets missing fields as CLI protobuf defaults", () => {
  assert.throws(() => parseStrictXrayUserCounters({ stat: [omitted("uplink"), omitted("downlink")] }),
    error => error.code === "recovery_counters_invalid");
});

test("CLI protobuf adapter preserves its input and rejects an explicitly present undefined value", () => {
  const payload = { stat: [omitted("uplink"), row("downlink", "7")] };
  const before = structuredClone(payload);
  assert.deepEqual(parseXrayStatsCliProtobufUserCounters(payload), [{ edgeCredentialRef: ref, uploadBytes: 0, downloadBytes: 7 }]);
  assert.deepEqual(payload, before);
  assert.throws(() => parseXrayStatsCliProtobufUserCounters({ stat: [row("uplink", undefined), row("downlink", 0)] }),
    error => error.code === "recovery_counters_invalid");
});

test("CLI protobuf adapter never accepts an invalid reference or inherited name", () => {
  for (const malformed of [{ name: "user>>>invalid ref>>>traffic>>>uplink" }, Object.create(omitted("uplink"))]) {
    assert.throws(() => parseXrayStatsCliProtobufUserCounters({ stat: [malformed, omitted("downlink")] }),
      error => error.code === "recovery_counters_invalid");
  }
});

test("strict CLI timestamps remain locally observed even with omitted zero fields", async () => {
  const snapshot = await read({ stat: [omitted("uplink"), omitted("downlink")], observedAt: "1999-01-01T00:00:00Z" });
  assert.equal(snapshot.observedAt, "2026-09-29T22:00:00.000Z");
});

test("synthetic CLI startup-to-traffic sequence preserves absent users and cumulative nonzero values", async () => {
  const bodies = [
    { stat: [{ name: "inbound>>>synthetic_in>>>traffic>>>uplink" }, { name: "inbound>>>synthetic_in>>>traffic>>>downlink" }] },
    { stat: [omitted("uplink"), omitted("downlink")] },
    { stat: [row("uplink", "11"), row("downlink", "29")] }
  ];
  let queries = 0;
  const reader = createXrayStatsCliUsageSnapshotReader({ strictCounters: true, commandRunner(_binary, args) {
    assert.deepEqual(args, ["api", "statsquery", "--server=127.0.0.1:10085"]);
    return { exitCode: 0, stdout: JSON.stringify(bodies[queries++]) };
  } });
  assert.deepEqual((await reader()).entries, []);
  assert.deepEqual((await reader()).entries, [{ edgeCredentialRef: ref, uploadBytes: 0, downloadBytes: 0 }]);
  assert.deepEqual((await reader()).entries, [{ edgeCredentialRef: ref, uploadBytes: 11, downloadBytes: 29 }]);
  assert.equal(queries, 3); // Three independent synthetic observations; no internal retry.
});
