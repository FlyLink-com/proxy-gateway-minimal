import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { generateClashSubscription, subscriptionSummary } from "../services/clash-subscription.mjs";
import { listen } from "./helpers/listen.mjs";

function sampleConfig() {
  return {
    servers: [
      {
        name: "miyao (Aliyun Shadowsocks)",
        host: "47.251.178.125",
        port: 18388,
        method: "aes-256-gcm",
        password: "pw:with#chars"
      },
      {
        name: "miyao-legacy",
        host: "47.251.178.125",
        port: 8388,
        method: "aes-256-gcm",
        password: "secondary-secret"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function fakeState() {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    host: "127.0.0.1",
    ports: { console: 3456, socks: 1080, httpProxy: 18180 },
    consoleToken: "secret",
    proxyConfig: sampleConfig(),
    services: {
      ssLocal: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) },
      httpProxy: { status: () => ({ running: false }), start: async () => ({ ok: true }), stop: async () => ({ ok: true }) }
    },
    isPortListening: async () => false,
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false })
  };
}

test("generateClashSubscription emits Clash Shadowsocks YAML", () => {
  const yaml = generateClashSubscription(sampleConfig());

  assert.match(yaml, /mixed-port: 7897/);
  assert.match(yaml, /mode: global/);
  assert.match(yaml, /name: "miyao \(Aliyun Shadowsocks\)"/);
  assert.match(yaml, /type: ss/);
  assert.match(yaml, /server: "47\.251\.178\.125"/);
  assert.match(yaml, /port: 18388/);
  assert.match(yaml, /cipher: "aes-256-gcm"/);
  assert.match(yaml, /password: "pw:with#chars"/);
  assert.match(yaml, /- "miyao \(Aliyun Shadowsocks\)"/);
  assert.match(yaml, /- DIRECT/);
  assert.match(yaml, /- MATCH,GLOBAL/);
});

test("subscriptionSummary returns metadata without passwords", () => {
  const summary = subscriptionSummary({
    proxyConfig: sampleConfig(),
    host: "127.0.0.1",
    consolePort: 3456,
    consoleToken: "secret"
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.serverCount, 2);
  assert.equal(summary.subscriptionUrl, "http://127.0.0.1:3456/sub/clash.yaml?token=secret");
  assert.deepEqual(summary.servers, [
    { name: "miyao (Aliyun Shadowsocks)", host: "47.251.178.125", port: 18388, type: "ss" },
    { name: "miyao-legacy", host: "47.251.178.125", port: 8388, type: "ss" }
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /pw:with#chars|secondary-secret/);
});

test("Clash subscription routes are authenticated", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const blocked = await fetch(`${baseUrl}/sub/clash.yaml`);
    assert.equal(blocked.status, 401);

    const response = await fetch(`${baseUrl}/sub/clash.yaml?token=secret`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/x-yaml/);
    const yaml = await response.text();
    assert.match(yaml, /password: "pw:with#chars"/);

    const status = await fetch(`${baseUrl}/api/subscription/status?token=secret`);
    assert.equal(status.status, 200);
    const body = await status.json();
    assert.equal(body.serverCount, 2);
    assert.equal(body.subscriptionUrl, "http://127.0.0.1:3456/sub/clash.yaml?token=secret");
    assert.doesNotMatch(JSON.stringify(body), /pw:with#chars|secondary-secret/);
  } finally {
    server.close();
  }
});
