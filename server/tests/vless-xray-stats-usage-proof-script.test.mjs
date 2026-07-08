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

test("VLESS Xray stats usage proof blocks aggregate or empty stats", async () => {
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

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.type, "vless_xray_stats_usage_proof");
  assert.equal(summary.ok, false);
  assert.equal(summary.readyToEnableCollector, false);
  assert.deepEqual(summary.blockers, ["xray_user_stats_required"]);
  assert.equal(summary.nextAction, "do_not_enable_vless_usage_collector_until_user_counters_exist");
  assert.doesNotMatch(result.stdout, /runtime-private-key|127\.0\.0\.1|10085/);
  assert.equal(result.stderr, "");
});
