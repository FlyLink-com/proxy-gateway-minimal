import assert from "node:assert/strict";
import test from "node:test";
import { createXrayStatsCliUsageSnapshotReader } from "../services/edge/xray-stats-cli-usage-reader.mjs";

test("Xray stats CLI usage reader rejects non-loopback stats servers", () => {
  assert.throws(() => createXrayStatsCliUsageSnapshotReader({
    statsServer: "203.0.113.10:10085",
    commandRunner: () => ({ exitCode: 0, stdout: "{}" })
  }), /statsServer must be loopback-only/);

  assert.throws(() => createXrayStatsCliUsageSnapshotReader({
    statsServer: "https://127.0.0.1:10085",
    commandRunner: () => ({ exitCode: 0, stdout: "{}" })
  }), /statsServer must be a host:port pair/);
});

test("Xray stats CLI usage reader emits a redacted query failure class", async () => {
  const reader = createXrayStatsCliUsageSnapshotReader({
    statsServer: "127.0.0.1:10085",
    commandRunner: () => ({
      exitCode: 1,
      stdout: "private stats payload must not leak",
      stderr: "private runtime path must not leak"
    })
  });

  await assert.rejects(
    () => reader(),
    (error) => {
      assert.equal(error.code, "xray_stats_query_failed");
      assert.doesNotMatch(error.message, /private stats payload|private runtime path/i);
      return true;
    }
  );
});

test("Xray stats CLI usage reader maps user traffic counters by edge credential ref", async () => {
  const calls = [];
  const reader = createXrayStatsCliUsageSnapshotReader({
    xrayBinary: "xray",
    statsServer: "127.0.0.1:10085",
    nowFn: () => "2026-07-07T12:00:00.000Z",
    commandRunner: (command, args) => {
      calls.push({ command, args });
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          stat: [
            {
              name: "user>>>edgecred_vless_001>>>traffic>>>uplink",
              value: 1200
            },
            {
              name: "user>>>edgecred_vless_001>>>traffic>>>downlink",
              value: 3400
            },
            {
              name: "inbound>>>channel-vless>>>traffic>>>uplink",
              value: 999999
            }
          ],
          privateKey: "must-not-return",
          password: "must-not-return"
        })
      };
    }
  });

  const snapshot = await reader({
    since: "2026-07-07T11:55:00.000Z"
  });

  assert.deepEqual(snapshot, {
    sourceRef: "xray_statsquery_user_traffic",
    accountingMode: "cumulative",
    observedAt: "2026-07-07T12:00:00.000Z",
    intervalStartedAt: "2026-07-07T11:55:00.000Z",
    intervalEndedAt: "2026-07-07T12:00:00.000Z",
    entries: [
      {
        edgeCredentialRef: "edgecred_vless_001",
        uploadBytes: 1200,
        downloadBytes: 3400
      }
    ]
  });
  assert.deepEqual(calls, [
    {
      command: "xray",
      args: ["api", "statsquery", "--server=127.0.0.1:10085"]
    }
  ]);
  assert.doesNotMatch(JSON.stringify(snapshot), /must-not-return|127\.0\.0\.1|10085|privateKey|password/);
});
