import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

function runProofScript(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/vless-xray-stats-usage-proof.mjs"], {
      cwd: process.cwd(),
      env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

test("VLESS Xray stats usage proof accepts only redacted user counters", async () => {
  const result = await runProofScript({
    ...process.env,
    VLESS_XRAY_USAGE_PROOF_STATS_JSON: JSON.stringify({
      stat: [
        {
          name: "user>>>edgecred_vless_proof_001>>>traffic>>>uplink",
          value: 1200
        },
        {
          name: "user>>>edgecred_vless_proof_001>>>traffic>>>downlink",
          value: 3400
        }
      ],
      privateKey: "runtime-private-key",
      password: "runtime-password"
    }),
    VLESS_XRAY_USAGE_PROOF_SERVER: "127.0.0.1:10085",
    VLESS_XRAY_USAGE_PROOF_CHANNEL_REF: "channel-vultr-a-vless-reality-tcp"
  });

  assert.equal(result.status, 0);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary, {
    type: "vless_xray_stats_usage_proof",
    ok: true,
    readyToEnableCollector: true,
    idleNoUserTraffic: false,
    statsServerLoopbackOnly: true,
    collectorStatus: "collected",
    channelRef: "channel-vultr-a-vless-reality-tcp",
    observationCount: 1,
    mappedObservationCount: 0,
    usageLedgerRecorded: false,
    quotaDecision: null,
    blockers: [],
    nextAction: "request_operator_approval_to_enable_vless_usage_collector",
    sensitiveOutputSuppressed: true
  });
  assert.doesNotMatch(result.stdout, /runtime-private-key|runtime-password|127\.0\.0\.1|10085/);
  assert.equal(result.stderr, "");
});

test("VLESS Xray stats usage proof reports idle when stats are reachable but empty", async () => {
  const result = await runProofScript({
    ...process.env,
    VLESS_XRAY_USAGE_PROOF_STATS_JSON: JSON.stringify({
      stat: [
        {
          name: "inbound>>>channel-vless>>>traffic>>>uplink",
          value: 9000
        }
      ],
      privateKey: "runtime-private-key"
    }),
    VLESS_XRAY_USAGE_PROOF_SERVER: "127.0.0.1:10085",
    VLESS_XRAY_USAGE_PROOF_CHANNEL_REF: "channel-vultr-a-vless-reality-tcp"
  });

  assert.equal(result.status, 0);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.type, "vless_xray_stats_usage_proof");
  assert.equal(summary.ok, true);
  assert.equal(summary.readyToEnableCollector, false);
  assert.equal(summary.idleNoUserTraffic, true);
  assert.equal(summary.collectorStatus, "idle_no_user_traffic");
  assert.deepEqual(summary.blockers, []);
  assert.equal(summary.nextAction, "continue_usage_monitoring_until_user_counters_are_observed");
  assert.doesNotMatch(result.stdout, /runtime-private-key|127\.0\.0\.1|10085/);
  assert.equal(result.stderr, "");
});
