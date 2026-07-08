import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

async function withJsonServer(payload, fn, path = "/usage") {
  const server = createServer((req, res) => {
    if (req.url !== path) {
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
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function runProofScript(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/tuic-per-credential-usage-proof.mjs"], {
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

test("TUIC per-credential usage proof accepts only redacted credential-level rows", async () => {
  await withJsonServer({
    users: [
      {
        edgeCredentialRef: "edgecred_tuic_proof_001",
        uploadBytes: 1200,
        downloadBytes: 3400,
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "runtime-password",
        remoteAddress: "198.51.100.88"
      }
    ]
  }, async (controllerUrl) => {
    const result = await runProofScript({
      ...process.env,
      TUIC_USAGE_PROOF_CONTROLLER_URL: controllerUrl,
      TUIC_USAGE_PROOF_METRICS_PATH: "/usage",
      TUIC_USAGE_PROOF_CHANNEL_REF: "channel-vultr-a-tuic"
    });

    assert.equal(result.status, 0);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary, {
      type: "tuic_per_credential_usage_proof",
      ok: true,
      readyToEnableCollector: true,
      controllerLoopbackOnly: true,
      collectorStatus: "collected",
      channelRef: "channel-vultr-a-tuic",
      observationCount: 1,
      mappedObservationCount: 0,
      aggregateOnlyBlocked: false,
      usageLedgerRecorded: false,
      quotaDecision: null,
      blockers: [],
      nextAction: "request_operator_approval_to_enable_tuic_usage_collector",
      sensitiveOutputSuppressed: true
    });
    assert.doesNotMatch(result.stdout, /runtime-password|11111111-1111-4111-8111-111111111111|198\.51\.100\.88|127\.0\.0\.1/);
    assert.equal(result.stderr, "");
  });
});

test("TUIC per-credential usage proof maps connections through a credential map", async () => {
  const runtimeUser = "11111111-1111-4111-8111-111111111111";
  const edgeCredentialRef = "edgecred_tuic_connections_proof_001";
  await withJsonServer({
    observedAt: "2026-06-08T00:05:00.000Z",
    uploadTotal: 3000,
    downloadTotal: 5000,
    connections: [
      {
        upload: 120,
        download: 340,
        metadata: {
          inboundUser: runtimeUser,
          sourceIP: "198.51.100.88"
        },
        password: "runtime-password"
      },
      {
        upload: 80,
        download: 160,
        metadata: {
          inboundUser: runtimeUser
        }
      }
    ]
  }, async (controllerUrl) => {
    const result = await runProofScript({
      ...process.env,
      TUIC_USAGE_PROOF_CONTROLLER_URL: controllerUrl,
      TUIC_USAGE_PROOF_METRICS_PATH: "/connections",
      TUIC_USAGE_PROOF_CHANNEL_REF: "channel-vultr-a-tuic",
      TUIC_USAGE_PROOF_CREDENTIAL_MAP_JSON: JSON.stringify({
        [runtimeUser]: edgeCredentialRef
      })
    });

    assert.equal(result.status, 0);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.readyToEnableCollector, true);
    assert.equal(summary.collectorStatus, "collected");
    assert.equal(summary.observationCount, 1);
    assert.equal(summary.channelRef, "channel-vultr-a-tuic");
    assert.doesNotMatch(result.stdout, /runtime-password|11111111-1111-4111-8111-111111111111|198\.51\.100\.88|127\.0\.0\.1/);
    assert.equal(result.stderr, "");
  }, "/connections");
});

test("TUIC per-credential usage proof rejects aggregate-only runtime traffic", async () => {
  await withJsonServer({
    uploadBytes: 9000,
    downloadBytes: 1000,
    password: "runtime-password"
  }, async (controllerUrl) => {
    const result = await runProofScript({
      ...process.env,
      TUIC_USAGE_PROOF_CONTROLLER_URL: controllerUrl,
      TUIC_USAGE_PROOF_METRICS_PATH: "/usage",
      TUIC_USAGE_PROOF_CHANNEL_REF: "channel-vultr-a-tuic"
    });

    assert.equal(result.status, 1);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.type, "tuic_per_credential_usage_proof");
    assert.equal(summary.ok, false);
    assert.equal(summary.readyToEnableCollector, false);
    assert.equal(summary.aggregateOnlyBlocked, true);
    assert.deepEqual(summary.blockers, ["node_aggregate_only"]);
    assert.equal(summary.nextAction, "do_not_enable_tuic_usage_collector_until_per_credential_rows_exist");
    assert.doesNotMatch(result.stdout, /runtime-password|127\.0\.0\.1/);
    assert.equal(result.stderr, "");
  });
});
