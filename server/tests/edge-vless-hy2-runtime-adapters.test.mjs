import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { buildCredentialReconciliationApplyPlan, buildCredentialReconciliationPlan } from "../services/edge/credential-reconciliation-gateway.mjs";
import { createHysteria2HostRuntimeAdapter } from "../services/edge/hysteria2-runtime-adapter.mjs";
import { createXrayVlessRealityHostRuntimeAdapter } from "../services/edge/xray-vless-reality-runtime-adapter.mjs";

function desiredState(runtime, channelRef) {
  return {
    channelRef,
    runtime,
    activationSurface: "explicit-restart",
    desiredStateRef: `desired_state_${channelRef}_001`,
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

test("credential reconciliation accepts VLESS Reality and Hysteria2 runtimes", () => {
  for (const [runtime, channelRef] of [
    ["xray-vless-reality", "channel-vultr-a-vless-reality-tcp"],
    ["hysteria2", "channel-vultr-a-hy2"]
  ]) {
    const report = buildCredentialReconciliationPlan({
      desiredState: desiredState(runtime, channelRef),
      inputPath: "runtime:test"
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtime, runtime);
    assert.equal(report.channelRef, channelRef);
    assert.equal(report.redacted, true);
  }
});

test("Xray VLESS Reality host adapter writes candidate, tests, backs up, restarts, and validates TCP listener", () => {
  const dir = mkdtempSync(join(tmpdir(), "xray-vless-host-adapter-"));
  const activeConfigPath = join(dir, "config.json");
  const candidateConfigPath = join(dir, "config.candidate.json");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "{}\n", { mode: 0o600 });
    const adapter = createXrayVlessRealityHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "xray-vless-reality.service",
      xrayBinary: "xray",
      listener: {
        name: "channel-vultr-a-vless-reality-tcp",
        listen: "0.0.0.0",
        port: 443,
        flow: "xtls-rprx-vision",
        dest: "www.example.com:443",
        serverNames: ["www.example.com"],
        privateKey: "synthetic-private-key",
        shortIds: ["abcd1234"]
      },
      resolveCredentialMaterial: () => ({
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "unused-password"
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "xray") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 0.0.0.0:443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-07T12:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState("xray-vless-reality", "channel-vultr-a-vless-reality-tcp"),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    assert.equal(report.runtimeReceipt.listener.tcp, true);
    assert.deepEqual(calls, [
      ["xray", "run", "-test", "-config", candidateConfigPath],
      ["systemctl", "restart", "xray-vless-reality.service"],
      ["systemctl", "is-active", "--quiet", "xray-vless-reality.service"],
      ["ss", "-H", "-tln", "sport", "=", ":443"]
    ]);
    const candidate = JSON.parse(readFileSync(candidateConfigPath, "utf8"));
    const inbound = candidate.inbounds[0];
    assert.equal(inbound.protocol, "vless");
    assert.equal(inbound.settings.clients[0].id, "11111111-1111-4111-8111-111111111111");
    assert.equal(inbound.settings.clients[0].email, "edgecred_order_001");
    assert.equal(inbound.settings.clients[0].flow, "xtls-rprx-vision");
    assert.equal(inbound.streamSettings.security, "reality");
    assert.deepEqual(inbound.streamSettings.realitySettings.serverNames, ["www.example.com"]);
    assert.equal(readFileSync(activeConfigPath, "utf8"), readFileSync(candidateConfigPath, "utf8"));
    assert.equal(existsSync(join(backupDir, report.runtimeReceipt.backupRef)), true);
    assert.equal(basename(report.runtimeReceipt.backupRef), report.runtimeReceipt.backupRef);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-private-key|11111111-1111-4111-8111-111111111111|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Xray VLESS Reality host adapter preserves loopback usage stats source", () => {
  const dir = mkdtempSync(join(tmpdir(), "xray-vless-host-adapter-usage-source-"));
  const activeConfigPath = join(dir, "config.json");
  const candidateConfigPath = join(dir, "config.candidate.json");
  const backupDir = join(dir, "backups");

  try {
    writeFileSync(activeConfigPath, "{}\n", { mode: 0o600 });
    const adapter = createXrayVlessRealityHostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      listener: {
        name: "channel-sgp-a-vless-reality-tcp",
        listen: "0.0.0.0",
        port: 8443,
        flow: "xtls-rprx-vision",
        dest: "www.example.com:443",
        serverNames: ["www.example.com"],
        privateKey: "synthetic-private-key",
        shortIds: ["abcd1234"],
        usageStats: {
          statsServer: "127.0.0.1:10085"
        }
      },
      resolveCredentialMaterial: () => ({
        uuid: "11111111-1111-4111-8111-111111111111",
        password: "unused-password"
      }),
      commandRunner(command) {
        if (command === "xray") return { exitCode: 0 };
        if (command === "systemctl") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "LISTEN 0 4096 0.0.0.0:8443 0.0.0.0:*" };
        return { exitCode: 1 };
      }
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState("xray-vless-reality", "channel-sgp-a-vless-reality-tcp"),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    const candidate = JSON.parse(readFileSync(candidateConfigPath, "utf8"));
    assert.deepEqual(candidate.stats, {});
    assert.deepEqual(candidate.api.services, ["HandlerService", "LoggerService", "StatsService"]);
    assert.equal(candidate.api.tag, "api");
    const apiInbound = candidate.inbounds.find((inbound) => inbound.tag === "api");
    assert.equal(apiInbound.listen, "127.0.0.1");
    assert.equal(apiInbound.port, 10085);
    assert.equal(apiInbound.protocol, "dokodemo-door");
    assert.equal(candidate.policy.levels["0"].statsUserUplink, true);
    assert.equal(candidate.policy.levels["0"].statsUserDownlink, true);
    assert.equal(candidate.routing.rules.some((rule) => rule.inboundTag?.includes("api") && rule.outboundTag === "api"), true);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-private-key|11111111-1111-4111-8111-111111111111|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Hysteria2 host adapter writes userpass config, tests, backs up, restarts, and validates UDP listener", () => {
  const dir = mkdtempSync(join(tmpdir(), "hy2-host-adapter-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "listen: :443\n", { mode: 0o600 });
    const adapter = createHysteria2HostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "hysteria2.service",
      hysteriaBinary: "hysteria",
      listener: {
        listen: ":443",
        certificate: "/etc/letsencrypt/live/example/fullchain.pem",
        privateKey: "/etc/letsencrypt/live/example/privkey.pem",
        trafficStatsListen: "127.0.0.1:26080",
        trafficStatsSecret: "synthetic-stats-secret"
      },
      resolveCredentialMaterial: () => ({
        uuid: "unused-uuid",
        password: "synthetic-user-password"
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "hysteria" && args.includes("--help")) return { exitCode: 0, stdout: "--check" };
        if (command === "hysteria") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "UNCONN 0 0 0.0.0.0:443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-07T12:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState("hysteria2", "channel-vultr-a-hy2"),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    assert.equal(report.runtimeReceipt.listener.udp443, true);
    assert.deepEqual(calls, [
      ["hysteria", "server", "--help"],
      ["hysteria", "server", "-c", candidateConfigPath, "--check"],
      ["systemctl", "restart", "hysteria2.service"],
      ["systemctl", "is-active", "--quiet", "hysteria2.service"],
      ["ss", "-H", "-uln", "sport", "=", ":443"]
    ]);
    const candidate = readFileSync(candidateConfigPath, "utf8");
    assert.match(candidate, /^listen: ":443"/m);
    assert.match(candidate, /^auth:\n  type: userpass\n  userpass:\n    edgecred_order_001:/m);
    assert.match(candidate, /^trafficStats:\n  listen: "127\.0\.0\.1:26080"/m);
    assert.equal(readFileSync(activeConfigPath, "utf8"), readFileSync(candidateConfigPath, "utf8"));
    assert.equal(existsSync(join(backupDir, report.runtimeReceipt.backupRef)), true);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-user-password|synthetic-stats-secret|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Hysteria2 host adapter persists production sniff and IPv4 outbound policy with traffic stats", () => {
  const dir = mkdtempSync(join(tmpdir(), "hy2-host-adapter-production-policy-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");

  try {
    writeFileSync(activeConfigPath, "listen: :10443\n", { mode: 0o600 });
    const adapter = createHysteria2HostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "hysteria2.service",
      hysteriaBinary: "hysteria",
      listener: {
        listen: ":10443",
        certificate: "/etc/letsencrypt/live/example/fullchain.pem",
        privateKey: "/etc/letsencrypt/live/example/privkey.pem",
        trafficStatsListen: "127.0.0.1:26080",
        trafficStatsSecret: "synthetic-stats-secret",
        sniff: {
          enabled: true,
          rewriteDomain: true,
          tcpPorts: "80,443,8000-9000",
          udpPorts: "all"
        },
        outbound: {
          mode: 4
        }
      },
      resolveCredentialMaterial: () => ({
        password: "synthetic-user-password"
      }),
      commandRunner(command, args) {
        if (command === "hysteria" && args.includes("--help")) return { exitCode: 0, stdout: "--check" };
        if (command === "hysteria") return { exitCode: 0 };
        if (command === "systemctl") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "UNCONN 0 0 0.0.0.0:10443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-08T12:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState("hysteria2", "channel-vultr-a-hy2"),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    const candidate = readFileSync(candidateConfigPath, "utf8");
    assert.match(candidate, /^listen: ":10443"/m);
    assert.match(candidate, /^trafficStats:\n  listen: "127\.0\.0\.1:26080"/m);
    assert.match(candidate, /^sniff:\n  enable: true\n  rewriteDomain: true\n  tcpPorts: "80,443,8000-9000"\n  udpPorts: "all"/m);
    assert.match(candidate, /^outbounds:\n  - name: direct\n    type: direct\n    direct:\n      mode: 4/m);
    assert.equal(readFileSync(activeConfigPath, "utf8"), candidate);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-user-password|synthetic-stats-secret|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Hysteria2 host adapter persists explicit protocol tuning options", () => {
  const dir = mkdtempSync(join(tmpdir(), "hy2-host-adapter-protocol-tuning-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");

  try {
    writeFileSync(activeConfigPath, "listen: :10443\n", { mode: 0o600 });
    const adapter = createHysteria2HostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "hysteria2.service",
      hysteriaBinary: "hysteria",
      listener: {
        listen: ":10443",
        certificate: "/etc/letsencrypt/live/example/fullchain.pem",
        privateKey: "/etc/letsencrypt/live/example/privkey.pem",
        bandwidth: {
          up: "80 mbps",
          down: "120 mbps"
        },
        ignoreClientBandwidth: true,
        congestion: {
          type: "bbr",
          bbrProfile: "aggressive"
        },
        quic: {
          initStreamReceiveWindow: 26843545,
          maxStreamReceiveWindow: 26843545,
          initConnReceiveWindow: 67108864,
          maxConnReceiveWindow: 67108864,
          maxIdleTimeout: "45s",
          maxIncomingStreams: 1024,
          disablePathMTUDiscovery: true
        },
        udpIdleTimeout: "45s"
      },
      resolveCredentialMaterial: () => ({
        password: "synthetic-user-password"
      }),
      commandRunner(command, args) {
        if (command === "hysteria" && args.includes("--help")) return { exitCode: 0, stdout: "--check" };
        if (command === "hysteria") return { exitCode: 0 };
        if (command === "systemctl") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "UNCONN 0 0 0.0.0.0:10443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-09T12:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState("hysteria2", "channel-vultr-a-hy2"),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    const candidate = readFileSync(candidateConfigPath, "utf8");
    assert.match(candidate, /^bandwidth:\n  up: "80 mbps"\n  down: "120 mbps"/m);
    assert.match(candidate, /^ignoreClientBandwidth: true/m);
    assert.match(candidate, /^congestion:\n  type: "bbr"\n  bbrProfile: "aggressive"/m);
    assert.match(candidate, /^quic:\n  initStreamReceiveWindow: 26843545\n  maxStreamReceiveWindow: 26843545\n  initConnReceiveWindow: 67108864\n  maxConnReceiveWindow: 67108864\n  maxIdleTimeout: "45s"\n  maxIncomingStreams: 1024\n  disablePathMTUDiscovery: true/m);
    assert.match(candidate, /^udpIdleTimeout: "45s"/m);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-user-password|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Hysteria2 host adapter skips unsupported config check and relies on restart plus listener validation", () => {
  const dir = mkdtempSync(join(tmpdir(), "hy2-host-adapter-no-check-"));
  const activeConfigPath = join(dir, "config.yaml");
  const candidateConfigPath = join(dir, "config.candidate.yaml");
  const backupDir = join(dir, "backups");
  const calls = [];

  try {
    writeFileSync(activeConfigPath, "listen: :10443\n", { mode: 0o600 });
    const adapter = createHysteria2HostRuntimeAdapter({
      activeConfigPath,
      candidateConfigPath,
      backupDir,
      serviceName: "hysteria2.service",
      hysteriaBinary: "hysteria",
      listener: {
        listen: ":10443",
        certificate: "/etc/letsencrypt/live/example/fullchain.pem",
        privateKey: "/etc/letsencrypt/live/example/privkey.pem"
      },
      resolveCredentialMaterial: () => ({
        uuid: "unused-uuid",
        password: "synthetic-user-password"
      }),
      commandRunner(command, args) {
        calls.push([command, ...args]);
        if (command === "hysteria" && args.includes("--help")) return { exitCode: 0, stdout: "--config" };
        if (command === "systemctl" && args[0] === "restart") return { exitCode: 0 };
        if (command === "systemctl" && args[0] === "is-active") return { exitCode: 0 };
        if (command === "ss") return { exitCode: 0, stdout: "UNCONN 0 0 0.0.0.0:10443 0.0.0.0:*" };
        return { exitCode: 1 };
      },
      now: () => new Date("2026-06-07T12:00:00.000Z")
    });

    const report = buildCredentialReconciliationApplyPlan({
      desiredState: desiredState("hysteria2", "channel-vultr-a-hy2"),
      inputPath: "runtime:order-lifecycle",
      executeProductionMutation: true,
      runtimeAdapter: adapter
    });

    assert.equal(report.ok, true);
    assert.equal(report.runtimeReceipt.status, "applied");
    assert.equal(report.runtimeReceipt.configTest.ok, true);
    assert.equal(report.runtimeReceipt.listener.udp443, true);
    assert.deepEqual(calls, [
      ["hysteria", "server", "--help"],
      ["systemctl", "restart", "hysteria2.service"],
      ["systemctl", "is-active", "--quiet", "hysteria2.service"],
      ["ss", "-H", "-uln", "sport", "=", ":10443"]
    ]);
    assert.doesNotMatch(JSON.stringify(report), /synthetic-user-password|config\.candidate|backups/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
