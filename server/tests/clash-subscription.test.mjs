import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import { generateClashSubscription, subscriptionSummary } from "../services/clash-subscription.mjs";
import { listen } from "./helpers/listen.mjs";

function sampleConfig() {
  return {
    servers: [
      {
        name: "aws-singapore-blue",
        host: "47.129.247.102",
        port: 18388,
        method: "aes-256-gcm",
        password: "pw:with#chars"
      },
      {
        name: "aws-singapore-backup",
        host: "198.51.100.10",
        port: 8388,
        method: "aes-256-gcm",
        password: "secondary-secret"
      }
    ],
    pingHosts: [],
    nginx: {}
  };
}

function fakeState(overrides = {}) {
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
    runCommand: async () => ({ ok: true, stdout: "", stderr: "", code: 0, timedOut: false }),
    ...overrides
  };
}

test("generateClashSubscription emits Clash Shadowsocks YAML", () => {
  const yaml = generateClashSubscription(sampleConfig());

  assert.match(yaml, /mixed-port: 7897/);
  assert.match(yaml, /mode: global/);
  assert.match(yaml, /name: "aws-singapore-blue"/);
  assert.match(yaml, /type: ss/);
  assert.match(yaml, /server: "47\.129\.247\.102"/);
  assert.match(yaml, /port: 18388/);
  assert.match(yaml, /cipher: "aes-256-gcm"/);
  assert.match(yaml, /password: "pw:with#chars"/);
  assert.match(yaml, /- "aws-singapore-blue"/);
  assert.match(yaml, /name: "aws-singapore-backup"/);
  assert.match(yaml, /server: "198\.51\.100\.10"/);
  assert.match(yaml, /password: "secondary-secret"/);
  assert.match(yaml, /- "aws-singapore-backup"/);
  assert.match(yaml, /- DIRECT/);
  assert.match(yaml, /- MATCH,GLOBAL/);
});

test("generateClashSubscription uses configured names as provider-neutral labels", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        id: "internal-node-a",
        name: "prod-edge-a",
        region: "internal-region",
        host: "edge-a.globalcirclecat.com",
        port: 18388,
        method: "aes-256-gcm",
        password: "edge-a-secret",
        note: "operator-only"
      }
    ]
  });

  assert.match(yaml, /name: "prod-edge-a"/);
  assert.match(yaml, /server: "edge-a\.globalcirclecat\.com"/);
  assert.doesNotMatch(yaml, /internal-node-a|internal-region|operator-only/);
});

test("generateClashSubscription emits VLESS XUDP candidate YAML", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        name: "ss-baseline",
        host: "ss.example.test",
        port: 18388,
        method: "aes-256-gcm",
        password: "ss-secret",
        protocol: "ss"
      },
      {
        name: "vless-xudp-candidate",
        host: "vless.example.test",
        port: 443,
        protocol: "vless",
        uuid: "11111111-1111-4111-8111-111111111111",
        udp: true,
        packetEncoding: "xudp",
        tls: true,
        serverName: "front.example.test",
        network: "tcp",
        flow: "xtls-rprx-vision",
        clientFingerprint: "chrome"
      }
    ]
  });

  assert.match(yaml, /name: "ss-baseline"/);
  assert.match(yaml, /type: ss/);
  assert.match(yaml, /name: "vless-xudp-candidate"/);
  assert.match(yaml, /type: vless/);
  assert.match(yaml, /server: "vless\.example\.test"/);
  assert.match(yaml, /port: 443/);
  assert.match(yaml, /uuid: "11111111-1111-4111-8111-111111111111"/);
  assert.match(yaml, /udp: true/);
  assert.match(yaml, /packet-encoding: "xudp"/);
  assert.match(yaml, /tls: true/);
  assert.match(yaml, /servername: "front\.example\.test"/);
  assert.match(yaml, /network: "tcp"/);
  assert.match(yaml, /flow: "xtls-rprx-vision"/);
  assert.match(yaml, /client-fingerprint: "chrome"/);
  assert.match(yaml, /name: AUTO/);
  assert.match(yaml, /type: url-test/);
  assert.match(yaml, /url: "https:\/\/www\.gstatic\.com\/generate_204"/);
  assert.match(yaml, /name: FALLBACK/);
  assert.match(yaml, /type: fallback/);
  assert.match(yaml, /- AUTO/);
  assert.match(yaml, /- FALLBACK/);
});

test("generateClashSubscription emits Hysteria2 and TUIC candidate YAML", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        name: "hy2-candidate",
        host: "hy2.example.test",
        port: 443,
        protocol: "hysteria2",
        password: "hy2-secret",
        ports: "443-8443",
        hopInterval: 30,
        up: "30 Mbps",
        down: "200 Mbps",
        obfs: "salamander",
        obfsPassword: "hy2-obfs-secret",
        sni: "front.example.test",
        skipCertVerify: false,
        fingerprint: "sha256-fingerprint",
        alpn: ["h3"],
        bbrProfile: "standard"
      },
      {
        name: "tuic-candidate",
        host: "tuic.example.test",
        port: 10443,
        protocol: "tuic",
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "tuic-secret",
        token: "tuic-token",
        udpRelayMode: "native",
        congestionController: "bbr",
        bbrProfile: "aggressive",
        sni: "tuic-front.example.test",
        alpn: ["h3"],
        disableSni: false,
        reduceRtt: true,
        requestTimeout: 8000,
        maxUdpRelayPacketSize: 1500,
        fastOpen: true,
        skipCertVerify: false,
        maxOpenStreams: 20
      }
    ]
  });

  assert.match(yaml, /name: "hy2-candidate"/);
  assert.match(yaml, /type: hysteria2/);
  assert.match(yaml, /server: "hy2\.example\.test"/);
  assert.match(yaml, /ports: "443-8443"/);
  assert.match(yaml, /hop-interval: 30/);
  assert.match(yaml, /password: "hy2-secret"/);
  assert.match(yaml, /up: "30 Mbps"/);
  assert.match(yaml, /down: "200 Mbps"/);
  assert.match(yaml, /obfs: "salamander"/);
  assert.match(yaml, /obfs-password: "hy2-obfs-secret"/);
  assert.match(yaml, /sni: "front\.example\.test"/);
  assert.match(yaml, /skip-cert-verify: false/);
  assert.match(yaml, /fingerprint: "sha256-fingerprint"/);
  assert.match(yaml, /alpn:\n      - "h3"/);
  assert.match(yaml, /bbr-profile: "standard"/);

  assert.match(yaml, /name: "tuic-candidate"/);
  assert.match(yaml, /type: tuic/);
  assert.match(yaml, /server: "tuic\.example\.test"/);
  assert.match(yaml, /uuid: "22222222-2222-4222-8222-222222222222"/);
  assert.match(yaml, /password: "tuic-secret"/);
  assert.match(yaml, /token: "tuic-token"/);
  assert.match(yaml, /udp-relay-mode: "native"/);
  assert.match(yaml, /congestion-controller: "bbr"/);
  assert.match(yaml, /bbr-profile: "aggressive"/);
  assert.match(yaml, /sni: "tuic-front\.example\.test"/);
  assert.match(yaml, /disable-sni: false/);
  assert.match(yaml, /reduce-rtt: true/);
  assert.match(yaml, /request-timeout: 8000/);
  assert.match(yaml, /max-udp-relay-packet-size: 1500/);
  assert.match(yaml, /fast-open: true/);
  assert.match(yaml, /skip-cert-verify: false/);
  assert.match(yaml, /max-open-streams: 20/);
  assert.match(yaml, /- "hy2-candidate"/);
  assert.match(yaml, /- "tuic-candidate"/);
});

test("generateClashSubscription rejects unsupported protocol instead of silently emitting it", () => {
  assert.throws(
    () =>
      generateClashSubscription({
        servers: [
          {
            name: "bad-candidate",
            host: "bad.example.test",
            port: 443,
            protocol: "unknown-protocol",
            password: "secret"
          }
        ]
      }),
    /unsupported Clash proxy protocol/
  );
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
    { name: "aws-singapore-blue", host: "47.129.247.102", port: 18388, type: "ss" },
    { name: "aws-singapore-backup", host: "198.51.100.10", port: 8388, type: "ss" }
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /pw:with#chars|secondary-secret/);
});

test("Clash subscription routes are authenticated", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const blocked = await fetch(`${baseUrl}/sub/clash.yaml`);
    assert.equal(blocked.status, 401);
    assert.deepEqual(await blocked.json(), { error: "Unauthorized" });

    const response = await fetch(`${baseUrl}/sub/clash.yaml?token=secret`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/x-yaml/);
    const yaml = await response.text();
    assert.match(yaml, /password: "pw:with#chars"/);

    const bearerResponse = await fetch(`${baseUrl}/sub/clash.yaml`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(bearerResponse.status, 200);
    assert.match(bearerResponse.headers.get("content-type"), /application\/x-yaml/);
    const bearerYaml = await bearerResponse.text();
    assert.match(bearerYaml, /password: "pw:with#chars"/);
    assert.match(bearerYaml, /password: "secondary-secret"/);

    const queryStatus = await fetch(`${baseUrl}/api/subscription/status?token=secret`);
    assert.equal(queryStatus.status, 401);
    assert.deepEqual(await queryStatus.json(), { error: "Unauthorized" });

    const bearerStatus = await fetch(`${baseUrl}/api/subscription/status`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(bearerStatus.status, 200);
    const body = await bearerStatus.json();
    assert.equal(body.serverCount, 2);
    assert.equal(body.subscriptionUrl, "http://127.0.0.1:3456/sub/clash.yaml?token=secret");
    assert.doesNotMatch(JSON.stringify(body), /pw:with#chars|secondary-secret/);
  } finally {
    server.close();
  }
});

test("Clash subscription route hides subscription service failures", async () => {
  const state = fakeState({
    subscriptions: {
      service: {
        resolveSubscriptionToken: async () => {
          throw new Error("database path C:\\secret\\subscriptions.sqlite failed");
        }
      }
    }
  });
  const { server, baseUrl } = await listen(createApp(state));
  try {
    const response = await fetch(`${baseUrl}/sub/clash.yaml?token=pgsub_broken`);
    assert.equal(response.status, 500);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), { error: "internal_error" });
  } finally {
    server.close();
  }
});
