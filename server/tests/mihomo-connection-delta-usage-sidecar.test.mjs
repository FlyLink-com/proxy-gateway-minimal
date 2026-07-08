import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runMihomoConnectionDeltaUsageSidecar } from "../../scripts/mihomo-connection-delta-usage-sidecar.mjs";

test("Mihomo connection delta sidecar emits redacted delta summaries across persisted state", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "mihomo-delta-sidecar-"));
  const statePath = join(tempDir, "state.json");
  const secretPath = join(tempDir, "controller.secret");
  const runtimeUser = "11111111-1111-4111-8111-111111111111";
  writeFileSync(secretPath, "sidecar-controller-secret\n", { mode: 0o600 });
  const env = {
    MIHOMO_CONNECTION_DELTA_CONTROLLER_URL: "http://127.0.0.1:19091",
    MIHOMO_CONNECTION_DELTA_CONTROLLER_SECRET_FILE: secretPath,
    MIHOMO_CONNECTION_DELTA_CHANNEL_REF: "channel-sgp-a-tuic",
    MIHOMO_CONNECTION_DELTA_STATE_PATH: statePath,
    MIHOMO_CONNECTION_DELTA_CREDENTIAL_MAP_JSON: JSON.stringify({
      [runtimeUser]: "edgecred_runtime_user_001"
    })
  };
  const payloads = [
    {
      connections: [
        {
          id: "conn-1",
          upload: 100,
          download: 200,
          metadata: {
            inboundUser: runtimeUser,
            sourceIP: "198.51.100.20"
          },
          password: "runtime-password"
        }
      ]
    },
    {
      connections: [
        {
          id: "conn-1",
          upload: 140,
          download: 260,
          metadata: {
            inboundUser: runtimeUser
          }
        }
      ]
    }
  ];
  let callIndex = 0;
  const authorizations = [];
  const outputs = [];
  const stdout = {
    write(chunk) {
      outputs.push(String(chunk));
    }
  };

  try {
    const firstCode = await runMihomoConnectionDeltaUsageSidecar({
      argv: ["--collect"],
      env,
      stdout,
      fetchJson: async (request) => {
        authorizations.push(request.headers.Authorization);
        return payloads[callIndex++];
      },
      nowFn: () => callIndex === 1 ? "2026-07-08T00:00:00.000Z" : "2026-07-08T00:00:05.000Z"
    });
    const secondCode = await runMihomoConnectionDeltaUsageSidecar({
      argv: ["--collect"],
      env,
      stdout,
      fetchJson: async (request) => {
        authorizations.push(request.headers.Authorization);
        return payloads[callIndex++];
      },
      nowFn: () => "2026-07-08T00:00:05.000Z"
    });

    assert.equal(firstCode, 0);
    assert.equal(secondCode, 0);
    const summaries = outputs.join("").trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(summaries[0].stateWarmup, true);
    assert.equal(summaries[0].observationCount, 0);
    assert.equal(summaries[1].stateWarmup, false);
    assert.equal(summaries[1].observationCount, 1);
    assert.equal(summaries[1].recordUsage, false);
    assert.equal(summaries[1].recordedCount, 0);
    assert.equal(summaries[1].sensitiveOutputSuppressed, true);
    assert.deepEqual(authorizations, [
      "Bearer sidecar-controller-secret",
      "Bearer sidecar-controller-secret"
    ]);
    assert.doesNotMatch(outputs.join(""), /11111111-1111-4111-8111-111111111111|edgecred_runtime_user_001|runtime-password|198\.51\.100\.20|sidecar-controller-secret/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
