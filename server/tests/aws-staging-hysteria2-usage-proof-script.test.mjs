import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

async function withHy2StatsServer(payload, fn) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({
      url: req.url,
      authorization: req.headers.authorization
    });
    if (!req.url?.startsWith("/traffic")) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address();
    return await fn({
      trafficUrl: `http://127.0.0.1:${port}/traffic`,
      requests
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function runProofScript(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/aws-staging-hysteria2-usage-proof.mjs"], {
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

test("AWS staging Hysteria2 usage proof script prints only redacted clear-mode conclusions", async () => {
  await withHy2StatsServer({
    edgecred_hy2_script_001: { tx: 11, rx: 22 },
    edgecred_hy2_script_002: { tx: 33, rx: 44 }
  }, async ({ trafficUrl, requests }) => {
    const result = await runProofScript({
      ...process.env,
      HY2_USAGE_PROOF_TRAFFIC_URL: trafficUrl,
      HY2_USAGE_PROOF_TRAFFIC_SECRET: "hy2-runtime-api-secret",
      HY2_USAGE_PROOF_CHANNEL_REF: "channel-aws-staging-hy2",
      HY2_USAGE_PROOF_SINCE: "2026-06-06T00:00:00.000Z"
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(requests, [
      {
        url: "/traffic?clear=1",
        authorization: "hy2-runtime-api-secret"
      }
    ]);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary, {
      ok: true,
      trafficStatsLoopbackOnly: true,
      readClearMode: true,
      collectorStatus: "collected",
      accountingMode: "delta",
      observationCount: 2,
      mappedObservationCount: 0,
      usageLedgerRecorded: false,
      quotaDecision: null,
      blockers: [],
      sensitiveOutputSuppressed: true
    });
    assert.doesNotMatch(result.stdout, /hy2-runtime-api-secret|edgecred_hy2_script_001|edgecred_hy2_script_002|127\.0\.0\.1/);
  });
});

test("AWS staging Hysteria2 usage proof script rejects non-loopback traffic API URLs", async () => {
  const result = await runProofScript({
    ...process.env,
    HY2_USAGE_PROOF_TRAFFIC_URL: "http://203.0.113.10:9999/traffic",
    HY2_USAGE_PROOF_CHANNEL_REF: "channel-aws-staging-hy2"
  });

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, false);
  assert.equal(summary.trafficStatsLoopbackOnly, false);
  assert.equal(summary.collectorStatus, "validation_error");
  assert.equal(summary.sensitiveOutputSuppressed, true);
  assert.doesNotMatch(result.stdout, /203\.0\.113\.10|9999/);
});
