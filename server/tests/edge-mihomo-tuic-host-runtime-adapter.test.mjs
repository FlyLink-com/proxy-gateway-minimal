import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { buildCredentialReconciliationApplyPlan } from "../services/edge/credential-reconciliation-gateway.mjs";
import { createMihomoTuicHostRuntimeAdapter } from "../services/edge/mihomo-tuic-host-runtime-adapter.mjs";

function desiredState() {
  return {
    channelRef: "channel-aliyun-a-tuic",
    runtime: "mihomo-tuic",
    activationSurface: "explicit-restart",
    desiredStateRef: "desired_state_aliyun_host_001",
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

test("Mihomo TUIC host runtime adapter writes candidate, tests config, backs up, replaces, restarts, and validates", () => {
  const dir = mkdtempSync(join(tmpdir(), "mihomo-tuic-host-adapter-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "listeners: []\n", { mode: 0o600 });
    const adapter = createMihomoTuicHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "mihomo-tuic.service",
      mihomoBinary: "mihomo",
      listener: {
        name: "channel-aliyun-a-tuic",
        port: 443,
        listen: "0.0.0.0",
        certificate: "/etc/mihomo/server.crt",
        privateKey: "/etc/mihomo/server.key"
      },
      resolveCredentialMaterial: () => ({
        uuid: "11111111-1111-4111-8111-111111111111",
        password: Buffer.from("synthetic-host-password", "utf8").toString("base64")
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "mihomo") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "udp UNCONN 0 0 0.0.0.0:443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-05T11:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState(),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    assert.equal(report.runtimeReceipt.mutation, true);
    assert.equal(report.runtimeReceipt.configTest.ok, true);
    assert.equal(report.runtimeReceipt.service.active, true);
    assert.equal(report.runtimeReceipt.listener.udp443, true);
    assert.match(report.runtimeReceipt.backupRef, /^config\.yaml\./);
    assert.deepEqual(calls, [
      ["mihomo", "-t", "-d", dirname(candidateConfigPath), "-f", candidateConfigPath],
      ["systemctl", "restart", "mihomo-tuic.service"],
      ["systemctl", "is-active", "--quiet", "mihomo-tuic.service"],
      ["ss", "-H", "-lun", "sport", "=", ":443"]
    ]);
    assert.equal(existsSync(candidateConfigPath), true);
    assert.equal(readFileSync(activeConfigPath, "utf8"), readFileSync(candidateConfigPath, "utf8"));
    assert.equal(existsSync(join(backupDir, report.runtimeReceipt.backupRef)), true);
    assert.equal(basename(report.runtimeReceipt.backupRef), report.runtimeReceipt.backupRef);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-host-password|11111111-1111-4111-8111-111111111111|config\.candidate|backups|server\.key/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Mihomo TUIC host runtime adapter retries listener validation after restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "mihomo-tuic-host-adapter-listener-race-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");
  const calls = [];
  let listenerChecks = 0;

  try {
    writeFileSync(activeConfigPath, "listeners: []\n", { mode: 0o600 });
    const adapter = createMihomoTuicHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "mihomo-tuic.service",
      mihomoBinary: "mihomo",
      listener: {
        name: "channel-aliyun-a-tuic",
        port: 443,
        listen: "0.0.0.0",
        certificate: "/etc/mihomo/server.crt",
        privateKey: "/etc/mihomo/server.key",
        validationAttempts: 2,
        validationRetryDelayMs: 0
      },
      resolveCredentialMaterial: () => ({
        uuid: "11111111-1111-4111-8111-111111111111",
        password: Buffer.from("synthetic-host-password", "utf8").toString("base64")
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "mihomo") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") {
          listenerChecks += 1;
          return listenerChecks === 1
            ? { exitCode: 0, stdout: "" }
            : { exitCode: 0, stdout: "UNCONN 0 0 *:443 *:*" };
        }
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-05T11:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState(),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    assert.equal(report.runtimeReceipt.listener.udp443, true);
    assert.equal(calls.filter(([command]) => command === "ss").length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Mihomo TUIC host runtime adapter stops before backup when config test fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "mihomo-tuic-host-adapter-fail-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "listeners: []\n", { mode: 0o600 });
    const adapter = createMihomoTuicHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      listener: {
        name: "channel-aliyun-a-tuic",
        certificate: "/etc/mihomo/server.crt",
        privateKey: "/etc/mihomo/server.key"
      },
      resolveCredentialMaterial: () => ({
        uuid: "11111111-1111-4111-8111-111111111111",
        password: Buffer.from("synthetic-host-password", "utf8").toString("base64")
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        return { exitCode: command === "mihomo" ? 1 : 0 };
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
    assert.deepEqual(calls, [
      ["mihomo", "-t", "-d", dirname(candidateConfigPath), "-f", candidateConfigPath]
    ]);
    assert.equal(existsSync(backupDir), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
