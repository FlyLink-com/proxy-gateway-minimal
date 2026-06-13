import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { buildCredentialReconciliationApplyPlan } from "../services/edge/credential-reconciliation-gateway.mjs";
import { createSingBoxSsHostRuntimeAdapter } from "../services/edge/sing-box-ss-runtime-adapter.mjs";

function desiredState() {
  return {
    channelRef: "channel-vultr-a-ss-tcp",
    runtime: "sing-box-ss",
    activationSurface: "explicit-restart",
    desiredStateRef: "desired_state_vultr_ss_001",
    desiredCredentials: [
      {
        credentialRef: "edgecred_order_001",
        orderRef: "order_001",
        userRef: "portal_user_001",
        expiresAt: "2026-07-05T00:00:00.000Z",
        materialDigest: "sha256:digest_001"
      }
    ],
    currentCredentials: []
  };
}

test("Sing-box SS host runtime adapter writes candidate, tests, backs up, restarts, and validates TCP listener", () => {
  const dir = mkdtempSync(join(tmpdir(), "sing-box-ss-host-adapter-"));
  const activeConfigPath = join(dir, "config.json");
  const candidateConfigPath = join(dir, "config.candidate.json");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "{}\n", { mode: 0o600 });
    const adapter = createSingBoxSsHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "sing-box-ss.service",
      singBoxBinary: "sing-box",
      listener: {
        name: "channel-vultr-a-ss-tcp",
        port: 18388,
        listen: "0.0.0.0",
        method: "2022-blake3-aes-256-gcm",
        serverPassword: "synthetic-server-password"
      },
      resolveCredentialMaterial: () => ({
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "synthetic-user-password"
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "sing-box") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 0.0.0.0:18388 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-07T12:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState(),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtime, "sing-box-ss");
    assert.equal(report.runtimeReceipt.status, "applied");
    assert.equal(report.runtimeReceipt.listener.tcp, true);
    assert.match(report.runtimeReceipt.backupRef, /^config\.json\./);
    assert.deepEqual(calls, [
      ["sing-box", "check", "-c", candidateConfigPath],
      ["systemctl", "restart", "sing-box-ss.service"],
      ["systemctl", "is-active", "--quiet", "sing-box-ss.service"],
      ["ss", "-H", "-tln", "sport", "=", ":18388"]
    ]);
    assert.equal(existsSync(candidateConfigPath), true);
    const candidate = JSON.parse(readFileSync(candidateConfigPath, "utf8"));
    assert.equal(candidate.inbounds[0].type, "shadowsocks");
    assert.equal(candidate.inbounds[0].network, "tcp");
    assert.equal(candidate.inbounds[0].method, "2022-blake3-aes-256-gcm");
    assert.equal(candidate.inbounds[0].multiplex.enabled, true);
    assert.equal(candidate.inbounds[0].users[0].name, "edgecred_order_001");
    assert.equal(readFileSync(activeConfigPath, "utf8"), readFileSync(candidateConfigPath, "utf8"));
    assert.equal(existsSync(join(backupDir, report.runtimeReceipt.backupRef)), true);
    assert.equal(basename(report.runtimeReceipt.backupRef), report.runtimeReceipt.backupRef);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-user-password|synthetic-server-password|11111111|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Sing-box SS host runtime adapter stops before backup when config test fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "sing-box-ss-host-adapter-fail-"));
  const activeConfigPath = join(dir, "config.json");
  const candidateConfigPath = join(dir, "config.candidate.json");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "{}\n", { mode: 0o600 });
    const adapter = createSingBoxSsHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      listener: {
        name: "channel-vultr-a-ss-tcp",
        serverPassword: "synthetic-server-password"
      },
      resolveCredentialMaterial: () => ({ password: "synthetic-user-password" }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        return { exitCode: command === "sing-box" ? 1 : 0 };
      }
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState(),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, false);
    assert.equal(report.runtimeReceipt.status, "failed");
    assert.equal(report.runtimeReceipt.mutation, false);
    assert.deepEqual(calls, [["sing-box", "check", "-c", candidateConfigPath]]);
    assert.equal(existsSync(backupDir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
