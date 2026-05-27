import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildChannelRuntimeInventorySummary } from "../services/channel-runtime-inventory-summary.mjs";

function withJsonFile(payload, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-runtime-inventory-summary-"));
  try {
    const path = join(tempDir, "inventory.json");
    writeFileSync(path, JSON.stringify(payload, null, 2));
    return fn(path);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("runtime inventory summary normalizes safe runtime gate records", () => {
  const summary = buildChannelRuntimeInventorySummary({
    generatedAt: "2026-05-27T19:10:00.000Z",
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-a",
        lifecycleStatus: "inventory_blocked",
        deploymentReady: false,
        blockers: ["ssh_banner_timeout", "ssh_banner_timeout", ""],
        nextGate: "channel_lab_b_selection"
      },
      {
        candidateName: "hysteria2-lab",
        protocol: "hysteria2",
        targetLabel: "channel-lab-a",
        lifecycleStatus: "runtime_deployed",
        deploymentReady: true,
        blockers: [],
        nextGate: "extended_measurement"
      }
    ]
  });

  assert.deepEqual(summary, {
    ok: true,
    mode: "channel-runtime-inventory-summary",
    generatedAt: "2026-05-27T19:10:00.000Z",
    recordCount: 2,
    deploymentReadyCount: 1,
    blockedCount: 1,
    records: [
      {
        candidateName: "tuic-lab",
        protocol: "tuic",
        targetLabel: "channel-lab-a",
        lifecycleStatus: "inventory_blocked",
        deploymentReady: false,
        blockers: ["ssh_banner_timeout"],
        nextGate: "channel_lab_b_selection"
      },
      {
        candidateName: "hysteria2-lab",
        protocol: "hysteria2",
        targetLabel: "channel-lab-a",
        lifecycleStatus: "runtime_deployed",
        deploymentReady: true,
        blockers: [],
        nextGate: "extended_measurement"
      }
    ],
    safety: {
      summaryOnly: true,
      noRuntimeMutation: true,
      noProductionMutation: true,
      omittedFields: ["hosts", "ports", "urls", "credentials", "rawLogs", "tokens", "subscriptionUrls"]
    }
  });
  assert.doesNotMatch(JSON.stringify(summary), /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:/);
});

test("runtime inventory summary rejects unsafe runtime details without echoing raw values", () => {
  assert.throws(
    () => buildChannelRuntimeInventorySummary({
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-a",
          lifecycleStatus: "inventory_ready",
          deploymentReady: true,
          blockers: [],
          nextGate: "runtime_deployment_approval",
          host: "secret.example",
          port: 443,
          token: "token=secret"
        }
      ]
    }),
    (error) => {
      assert.match(error.message, /safe runtime inventory summary/);
      assert.doesNotMatch(error.message, /secret|443|token/);
      return true;
    }
  );
});

test("runtime inventory summary CLI prints safe JSON", () => {
  withJsonFile(
    {
      generatedAt: "2026-05-27T19:11:00.000Z",
      records: [
        {
          candidateName: "tuic-lab",
          protocol: "tuic",
          targetLabel: "channel-lab-b",
          lifecycleStatus: "inventory_ready",
          deploymentReady: true,
          blockers: [],
          nextGate: "runtime_deployment_approval"
        }
      ]
    },
    (path) => {
      const stdout = execFileSync(process.execPath, [
        "scripts/channel-runtime-inventory-summary.mjs",
        path
      ], {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8"
      });

      const summary = JSON.parse(stdout);
      assert.equal(summary.ok, true);
      assert.equal(summary.mode, "channel-runtime-inventory-summary");
      assert.equal(summary.deploymentReadyCount, 1);
      assert.doesNotMatch(stdout, /secret|"host"\s*:|"port"\s*:|token=|"rawLog"\s*:/);
    }
  );
});
