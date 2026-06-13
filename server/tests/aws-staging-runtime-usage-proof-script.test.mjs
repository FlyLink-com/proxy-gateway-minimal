import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";

async function withJsonServer(payload, fn) {
  const server = createServer((req, res) => {
    if (req.url !== "/usage") {
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
    const child = spawn(process.execPath, ["scripts/aws-staging-runtime-usage-proof.mjs"], {
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

test("AWS staging runtime usage proof script prints only redacted mapping conclusions", async () => {
  await withJsonServer({
    users: [
      {
        edgeCredentialRef: "edgecred_script_001",
        uploadBytes: 10,
        downloadBytes: 20,
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "runtime-password",
        remoteAddress: "198.51.100.50"
      }
    ]
  }, async (controllerUrl) => {
    const result = await runProofScript({
        ...process.env,
        USAGE_PROOF_CONTROLLER_URL: controllerUrl,
        USAGE_PROOF_METRICS_PATH: "/usage",
        USAGE_PROOF_CHANNEL_REF: "channel-aws-staging-a-tuic"
    });

    assert.equal(result.status, 0);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary, {
      ok: true,
      controllerLoopbackOnly: true,
      collectorStatus: "collected",
      observationCount: 1,
      mappedObservationCount: 0,
      aggregateOnlyBlocked: false,
      usageLedgerRecorded: false,
      quotaDecision: null,
      blockers: [],
      sensitiveOutputSuppressed: true
    });
    assert.doesNotMatch(result.stdout, /runtime-password|11111111-1111-4111-8111-111111111111|198\.51\.100\.50|127\.0\.0\.1/);
    assert.equal(result.stderr, "");
  });
});
