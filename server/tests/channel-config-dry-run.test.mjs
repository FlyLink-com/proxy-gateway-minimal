import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dryRunChannelConfig } from "../services/channel-config-dry-run.mjs";

function withConfig(config, fn) {
  const tempDir = mkdtempSync(join(tmpdir(), "channel-dry-run-"));
  try {
    const configPath = join(tempDir, "proxy-servers.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return fn(configPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function candidateConfig() {
  return {
    servers: [
      {
        name: "ss-baseline",
        host: "ss.example.test",
        port: 18388,
        protocol: "ss",
        method: "aes-256-gcm",
        password: "${SS_PASSWORD}"
      },
      {
        name: "vless-candidate",
        host: "vless.example.test",
        port: 443,
        protocol: "vless",
        uuid: "${VLESS_UUID}",
        packetEncoding: "xudp",
        tls: true
      },
      {
        name: "hy2-candidate",
        host: "hy2.example.test",
        port: 443,
        protocol: "hysteria2",
        password: "${HY2_PASSWORD}"
      },
      {
        name: "tuic-candidate",
        host: "tuic.example.test",
        port: 10443,
        protocol: "tuic",
        uuid: "${TUIC_UUID}",
        password: "${TUIC_PASSWORD}",
        token: "${TUIC_TOKEN}"
      }
    ]
  };
}

test("dryRunChannelConfig validates and summarizes channel candidates without secrets", () => {
  withConfig(candidateConfig(), (configPath) => {
    const summary = dryRunChannelConfig({
      configPath,
      env: {
        SS_PASSWORD: "ss-secret",
        VLESS_UUID: "11111111-1111-4111-8111-111111111111",
        HY2_PASSWORD: "hy2-secret",
        TUIC_UUID: "22222222-2222-4222-8222-222222222222",
        TUIC_PASSWORD: "tuic-secret",
        TUIC_TOKEN: "tuic-token"
      }
    });

    assert.equal(summary.ok, true);
    assert.equal(summary.serverCount, 4);
    assert.deepEqual(summary.protocolCounts, {
      ss: 1,
      vless: 1,
      hysteria2: 1,
      tuic: 1
    });
    assert.equal(summary.generatedYamlBytes > 0, true);
    assert.deepEqual(summary.servers, [
      { name: "ss-baseline", host: "ss.example.test", port: 18388, protocol: "ss" },
      { name: "vless-candidate", host: "vless.example.test", port: 443, protocol: "vless" },
      { name: "hy2-candidate", host: "hy2.example.test", port: 443, protocol: "hysteria2" },
      { name: "tuic-candidate", host: "tuic.example.test", port: 10443, protocol: "tuic" }
    ]);
    assert.doesNotMatch(JSON.stringify(summary), /ss-secret|hy2-secret|tuic-secret|tuic-token|11111111|22222222/);
  });
});

test("dryRunChannelConfig returns a safe local benchmark plan without connecting remotely", () => {
  withConfig(candidateConfig(), (configPath) => {
    const summary = dryRunChannelConfig({
      configPath,
      env: {
        SS_PASSWORD: "ss-secret",
        VLESS_UUID: "11111111-1111-4111-8111-111111111111",
        HY2_PASSWORD: "hy2-secret",
        TUIC_UUID: "22222222-2222-4222-8222-222222222222",
        TUIC_PASSWORD: "tuic-secret",
        TUIC_TOKEN: "tuic-token"
      }
    });

    assert.deepEqual(summary.benchmarkPlan, {
      mode: "local-dry-run",
      remoteConnections: false,
      metrics: [
        "successRate",
        "timeoutCount",
        "connectTimeMs",
        "timeToFirstByteMs",
        "p50Ms",
        "p95Ms",
        "p99Ms"
      ],
      probes: [
        {
          name: "ss-baseline",
          protocol: "ss",
          role: "baseline",
          host: "ss.example.test",
          port: 18388,
          checks: ["clash-render", "tcp-connect", "http-generate-204-through-proxy"],
          udpProbe: false
        },
        {
          name: "vless-candidate",
          protocol: "vless",
          role: "candidate",
          host: "vless.example.test",
          port: 443,
          checks: ["clash-render", "tcp-connect", "http-generate-204-through-proxy", "sustained-session"],
          udpProbe: true
        },
        {
          name: "hy2-candidate",
          protocol: "hysteria2",
          role: "candidate",
          host: "hy2.example.test",
          port: 443,
          checks: ["clash-render", "tcp-connect", "http-generate-204-through-proxy", "sustained-session"],
          udpProbe: true
        },
        {
          name: "tuic-candidate",
          protocol: "tuic",
          role: "candidate",
          host: "tuic.example.test",
          port: 10443,
          checks: ["clash-render", "tcp-connect", "http-generate-204-through-proxy", "sustained-session"],
          udpProbe: true
        }
      ]
    });
    assert.doesNotMatch(JSON.stringify(summary.benchmarkPlan), /ss-secret|hy2-secret|tuic-secret|tuic-token|11111111|22222222/);
  });
});

test("dryRunChannelConfig rejects invalid configs without leaking provided secrets", () => {
  withConfig(
    {
      servers: [
        {
          name: "bad-candidate",
          host: "bad.example.test",
          port: 443,
          protocol: "tuic",
          uuid: "${TUIC_UUID}"
        }
      ]
    },
    (configPath) => {
      assert.throws(
        () =>
          dryRunChannelConfig({
            configPath,
            env: {
              TUIC_UUID: "22222222-2222-4222-8222-222222222222"
            }
          }),
        (error) => {
          assert.match(error.message, /proxy server bad-candidate/);
          assert.doesNotMatch(error.message, /tuic-secret|22222222/);
          return true;
        }
      );
    }
  );
});

test("channel config dry-run CLI prints only safe JSON summary", () => {
  withConfig(candidateConfig(), (configPath) => {
    const stdout = execFileSync(process.execPath, ["scripts/channel-config-dry-run.mjs", configPath], {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        SS_PASSWORD: "ss-secret",
        VLESS_UUID: "11111111-1111-4111-8111-111111111111",
        HY2_PASSWORD: "hy2-secret",
        TUIC_UUID: "22222222-2222-4222-8222-222222222222",
        TUIC_PASSWORD: "tuic-secret",
        TUIC_TOKEN: "tuic-token"
      },
      encoding: "utf8"
    });

    const summary = JSON.parse(stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.serverCount, 4);
    assert.deepEqual(summary.protocolCounts, {
      ss: 1,
      vless: 1,
      hysteria2: 1,
      tuic: 1
    });
    assert.doesNotMatch(stdout, /ss-secret|hy2-secret|tuic-secret|tuic-token|11111111|22222222/);
  });
});
