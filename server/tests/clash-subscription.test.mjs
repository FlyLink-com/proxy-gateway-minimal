import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.mjs";
import {
  generateClashProviderSubscription,
  generateClashProxyProvider,
  generateClashSubscription,
  generateMihomoProviderTemplate,
  generateMihomoRenderTemplate,
  subscriptionSummary
} from "../services/clash-subscription.mjs";
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

function proxyGroupBlock(yaml, name) {
  const marker = `  - name: ${name}\n`;
  const start = yaml.indexOf(marker);
  assert.notEqual(start, -1, `expected proxy group ${name}`);
  const next = yaml.indexOf("\n  - name: ", start + marker.length);
  return yaml.slice(start, next === -1 ? yaml.length : next);
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
  assert.doesNotMatch(yaml, /- DIRECT/);
  assert.match(yaml, /- MATCH,GLOBAL/);
});

test("generateClashSubscription emits safe lifecycle comments when provided", () => {
  const yaml = generateClashSubscription(sampleConfig(), {
    lifecycle: {
      status: "active",
      expiresAt: "2026-06-21T00:00:00.000Z",
      validUntil: "2026-06-21T00:00:00.000Z"
    }
  });

  assert.match(yaml, /^# globalcircle-subscription-status: "active"/);
  assert.match(yaml, /# globalcircle-subscription-expires-at: "2026-06-21T00:00:00.000Z"/);
  assert.match(yaml, /# globalcircle-subscription-valid-until: "2026-06-21T00:00:00.000Z"/);
  assert.match(yaml, /\nproxies:/);
  assert.doesNotMatch(yaml, /tenant_|pgsub_|password=/);
});

test("generateClashSubscription protects node domains from fake-ip self-routing", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        name: "japan-vless",
        host: "sub.globalcirclecat.cloud",
        port: 8443,
        protocol: "vless",
        uuid: "11111111-1111-4111-8111-111111111111",
        udp: true,
        tls: true,
        serverName: "www.cloudflare.com",
        network: "tcp",
        flow: "xtls-rprx-vision",
        realityOpts: {
          publicKey: "synthetic-public-key",
          shortId: "synthetic-short-id"
        }
      },
      {
        name: "singapore-hy2",
        host: "sgp.gccwebos.com",
        port: 10443,
        protocol: "hysteria2",
        password: "synthetic-hy2-secret",
        sni: "sgp.gccwebos.com",
        alpn: ["h3"]
      }
    ]
  });

  assert.match(yaml, /dns:\n  enable: true\n  enhanced-mode: fake-ip/);
  assert.match(yaml, /fake-ip-filter:\n(?:    - .+\n)+/);
  assert.match(yaml, /  - "\+\.globalcirclecat\.cloud"/);
  assert.match(yaml, /  - "\+\.gccwebos\.com"/);
  assert.match(yaml, /  - "sub\.globalcirclecat\.cloud"/);
  assert.match(yaml, /  - "sgp\.gccwebos\.com"/);
  assert.match(yaml, /rules:\n  - DOMAIN,sub\.globalcirclecat\.cloud,DIRECT\n  - DOMAIN,sgp\.gccwebos\.com,DIRECT\n  - DOMAIN-SUFFIX,globalcirclecat\.cloud,DIRECT\n  - DOMAIN-SUFFIX,gccwebos\.com,DIRECT\n  - MATCH,GLOBAL/);
  assert.doesNotMatch(yaml, /globalcirclecat\.icu/);
  assert.doesNotMatch(yaml, /- DIRECT\n/);
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

test("generateClashSubscription emits VLESS Reality TCP fields", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        name: "vless-reality-stable",
        host: "vless.example.test",
        port: 443,
        protocol: "vless",
        uuid: "11111111-1111-4111-8111-111111111111",
        network: "tcp",
        udp: true,
        tls: true,
        flow: "xtls-rprx-vision",
        serverName: "www.example.test",
        realityOpts: {
          publicKey: "synthetic-public-key",
          shortId: "synthetic-short-id"
        },
        clientFingerprint: "chrome"
      }
    ]
  });

  assert.match(yaml, /name: "vless-reality-stable"/);
  assert.match(yaml, /type: vless/);
  assert.match(yaml, /network: "tcp"/);
  assert.match(yaml, /flow: "xtls-rprx-vision"/);
  assert.match(yaml, /servername: "www\.example\.test"/);
  assert.match(yaml, /reality-opts:\n      public-key: "synthetic-public-key"\n      short-id: "synthetic-short-id"/);
  assert.match(yaml, /client-fingerprint: "chrome"/);
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
        heartbeatInterval: 10000,
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
  assert.match(yaml, /heartbeat-interval: 10000/);
  assert.match(yaml, /max-udp-relay-packet-size: 1500/);
  assert.match(yaml, /fast-open: true/);
  assert.match(yaml, /skip-cert-verify: false/);
  assert.match(yaml, /max-open-streams: 20/);
  assert.match(yaml, /- "hy2-candidate"/);
  assert.match(yaml, /- "tuic-candidate"/);
});

test("generateClashSubscription emits long-haul quality groups without leaking metadata fields", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        name: "ss-stable",
        host: "ss.example.test",
        port: 18388,
        protocol: "ss",
        method: "aes-256-gcm",
        password: "ss-secret",
        qualityClass: "stable",
        channelRole: "baseline"
      },
      {
        name: "hy2-long-haul",
        host: "hy2.example.test",
        port: 443,
        protocol: "hysteria2",
        password: "hy2-secret",
        qualityClass: "weak-network",
        channelRole: "candidate"
      },
      {
        name: "tuic-long-haul",
        host: "tuic.example.test",
        port: 10443,
        protocol: "tuic",
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "tuic-secret",
        quality: "weak-network",
        role: "candidate"
      }
    ]
  });

  assert.match(
    yaml,
    /name: WEAK-NETWORK\n    type: url-test\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    tolerance: 50\n    proxies:\n      - "hy2-long-haul"\n      - "tuic-long-haul"/
  );
  assert.match(
    yaml,
    /name: STABLE\n    type: fallback\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    proxies:\n      - "ss-stable"/
  );
  assert.match(yaml, /name: GLOBAL\n    type: select\n    proxies:\n      - AUTO\n      - STABLE\n      - WEAK-NETWORK\n      - FALLBACK/);
  assert.doesNotMatch(yaml, /qualityClass|weak-network|channelRole|baseline|candidate/);
});

test("generateClashSubscription keeps auto-ineligible channels out of AUTO while leaving manual fallback paths", () => {
  const yaml = generateClashSubscription({
    servers: [
      {
        name: "vless-stable",
        host: "stable.example.test",
        port: 8443,
        protocol: "vless",
        uuid: "11111111-1111-4111-8111-111111111111",
        udp: true,
        tls: true,
        serverName: "www.example.test",
        network: "tcp",
        flow: "xtls-rprx-vision",
        qualityClass: "stable",
        realityOpts: {
          publicKey: "synthetic-public-key",
          shortId: "synthetic-short-id"
        }
      },
      {
        name: "sgp-hy2-high-loss",
        host: "sgp.example.test",
        port: 10443,
        protocol: "hysteria2",
        password: "hy2-secret",
        qualityClass: "high-loss",
        autoEligible: false
      },
      {
        name: "sgp-tuic-canary",
        host: "sgp.example.test",
        port: 443,
        protocol: "tuic",
        uuid: "22222222-2222-4222-8222-222222222222",
        password: "tuic-secret",
        qualityClass: "weak-network",
        autoEligible: false
      }
    ]
  });

  assert.match(
    yaml,
    /name: AUTO\n    type: url-test\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    proxies:\n      - "vless-stable"/
  );
  const autoGroup = proxyGroupBlock(yaml, "AUTO");
  assert.doesNotMatch(autoGroup, /sgp-hy2-high-loss|sgp-tuic-canary/);
  assert.match(
    yaml,
    /name: WEAK-NETWORK\n    type: url-test\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    tolerance: 50\n    proxies:\n      - "sgp-hy2-high-loss"\n      - "sgp-tuic-canary"/
  );
  assert.match(
    yaml,
    /name: FALLBACK\n    type: fallback\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    proxies:\n      - "vless-stable"\n      - "sgp-hy2-high-loss"\n      - "sgp-tuic-canary"/
  );
  assert.match(
    yaml,
    /name: GLOBAL\n    type: select\n    proxies:\n      - AUTO\n      - STABLE\n      - WEAK-NETWORK\n      - FALLBACK\n      - "vless-stable"\n      - "sgp-hy2-high-loss"\n      - "sgp-tuic-canary"/
  );
  assert.doesNotMatch(yaml, /autoEligible|auto-eligible/);
});

test("generateClashProviderSubscription emits an auto-updating provider profile without inline secrets", () => {
  const yaml = generateClashProviderSubscription(sampleConfig(), {
    providerName: "globalcircle-pool",
    providerUrl: "https://sub.example.test/sub/p/globalcircle-pool.yaml",
    providerPath: "./providers/globalcircle-pool.yaml"
  });

  assert.match(yaml, /mixed-port: 7897/);
  assert.match(yaml, /mode: global/);
  assert.match(yaml, /proxy-providers:\n  "globalcircle-pool":\n    type: http/);
  assert.match(yaml, /url: "https:\/\/sub\.example\.test\/sub\/p\/globalcircle-pool\.yaml"/);
  assert.match(yaml, /path: "\.\/providers\/globalcircle-pool\.yaml"/);
  assert.match(yaml, /interval: 3600/);
  assert.match(
    yaml,
    /health-check:\n      enable: true\n      url: "https:\/\/www\.gstatic\.com\/generate_204"\n      interval: 300\n      lazy: true/
  );
  assert.match(
    yaml,
    /name: AUTO\n    type: url-test\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    lazy: true\n    use:\n      - "globalcircle-pool"/
  );
  assert.match(
    yaml,
    /name: FALLBACK\n    type: fallback\n    url: "https:\/\/www\.gstatic\.com\/generate_204"\n    interval: 300\n    lazy: true\n    use:\n      - "globalcircle-pool"/
  );
  assert.match(
    yaml,
    /name: GLOBAL\n    type: select\n    proxies:\n      - AUTO\n      - WEAK-NETWORK\n      - FALLBACK\n    use:\n      - "globalcircle-pool"/
  );
  assert.doesNotMatch(yaml, /- DIRECT/);
  assert.doesNotMatch(yaml, /proxies:\n  - name:/);
  assert.doesNotMatch(yaml, /pw:with#chars|secondary-secret/);
});

test("generateClashProviderSubscription quotes provider names used as YAML keys", () => {
  const yaml = generateClashProviderSubscription(sampleConfig(), {
    providerName: "globalcircle:pool # edge",
    providerUrl: "https://sub.example.test/sub/p/globalcircle-pool.yaml"
  });

  assert.match(yaml, /proxy-providers:\n  "globalcircle:pool # edge":\n    type: http/);
  assert.match(yaml, /use:\n      - "globalcircle:pool # edge"/);
});

test("generateClashProviderSubscription requires an explicit provider URL", () => {
  assert.throws(
    () =>
      generateClashProviderSubscription(sampleConfig(), {
        providerName: "globalcircle-pool"
      }),
    /providerUrl is required/
  );
});

test("generateMihomoRenderTemplate emits a minimal owned inline Mihomo profile", () => {
  const yaml = generateMihomoRenderTemplate(sampleConfig());

  assert.match(yaml, /mixed-port: 7897/);
  assert.match(yaml, /mode: rule/);
  assert.match(yaml, /log-level: warning/);
  assert.match(yaml, /unified-delay: true/);
  assert.match(yaml, /tcp-concurrent: true/);
  assert.match(yaml, /global-client-fingerprint: chrome/);
  assert.match(yaml, /profile:\n  store-selected: true/);
  assert.match(yaml, /proxies:\n  - name: "aws-singapore-blue"/);
  assert.match(yaml, /proxy-groups:/);
  assert.match(yaml, /name: GLOBAL\n    type: select/);
  assert.doesNotMatch(yaml, /- DIRECT/);
  assert.match(yaml, /rules:\n  - MATCH,GLOBAL/);
  assert.doesNotMatch(yaml, /BaseProvider|FilterHK|rule-providers|authentication|external-controller|external-ui|listeners:/);
});

test("generateMihomoProviderTemplate emits a minimal provider Mihomo profile without inline secrets", () => {
  const yaml = generateMihomoProviderTemplate(sampleConfig(), {
    providerName: "globalcircle-pool",
    providerUrl: "https://sub.example.test/sub/a/provider.yaml",
    providerPath: "./providers/globalcircle-pool.yaml"
  });

  assert.match(yaml, /mode: rule/);
  assert.match(yaml, /proxy-providers:\n  "globalcircle-pool":\n    type: http/);
  assert.match(yaml, /path: "\.\/providers\/globalcircle-pool\.yaml"/);
  assert.match(yaml, /health-check:/);
  assert.match(yaml, /proxy-groups:/);
  assert.match(yaml, /use:\n      - "globalcircle-pool"/);
  assert.doesNotMatch(yaml, /- DIRECT/);
  assert.match(yaml, /rules:\n  - MATCH,GLOBAL/);
  assert.doesNotMatch(yaml, /proxies:\n  - name:/);
  assert.doesNotMatch(yaml, /pw:with#chars|secondary-secret|BaseProvider|FilterHK|authentication|external-controller|listeners:/);
});

test("generateClashProxyProvider emits only active provider nodes", () => {
  const yaml = generateClashProxyProvider({
    servers: [
      {
        name: "active-tuic",
        host: "tuic.example.test",
        port: 10443,
        protocol: "tuic",
        uuid: "33333333-3333-4333-8333-333333333333",
        password: "active-tuic-secret"
      },
      {
        name: "held-hysteria2",
        host: "hy2.example.test",
        port: 443,
        protocol: "hysteria2",
        password: "held-hy2-secret",
        status: "hold_for_investigation"
      },
      {
        name: "maintenance-hysteria2",
        host: "maintenance.example.test",
        port: 443,
        protocol: "hysteria2",
        password: "maintenance-secret",
        maintenance: true
      },
      {
        name: "disabled-tuic",
        host: "disabled.example.test",
        port: 10443,
        protocol: "tuic",
        uuid: "44444444-4444-4444-8444-444444444444",
        password: "disabled-secret",
        disabled: true
      },
      {
        name: "retired-ss",
        host: "retired.example.test",
        port: 18388,
        protocol: "ss",
        method: "aes-256-gcm",
        password: "retired-secret",
        status: "retired"
      }
    ]
  });

  assert.match(yaml, /proxies:/);
  assert.match(yaml, /name: "active-tuic"/);
  assert.match(yaml, /type: tuic/);
  assert.match(yaml, /server: "tuic\.example\.test"/);
  assert.match(yaml, /password: "active-tuic-secret"/);
  assert.doesNotMatch(
    yaml,
    /held-hysteria2|held-hy2-secret|maintenance-hysteria2|maintenance-secret|disabled-tuic|disabled-secret|retired-ss|retired-secret/
  );
  assert.doesNotMatch(yaml, /status|hold_for_investigation|maintenance|disabled|retired/);
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

test("subscriptionSummary returns metadata without passwords or subscription URLs", () => {
  const summary = subscriptionSummary({
    proxyConfig: sampleConfig(),
    host: "127.0.0.1",
    consolePort: 3456,
    consoleToken: "secret"
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.serverCount, 2);
  assert.equal(Object.hasOwn(summary, "subscriptionUrl"), false);
  assert.deepEqual(summary.servers, [
    { name: "aws-singapore-blue", host: "47.129.247.102", port: 18388, type: "ss" },
    { name: "aws-singapore-backup", host: "198.51.100.10", port: 8388, type: "ss" }
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /pw:with#chars|secondary-secret/);
});

test("Clash subscription routes reject console-token subscription access", async () => {
  const { server, baseUrl } = await listen(createApp(fakeState()));
  try {
    const blocked = await fetch(`${baseUrl}/sub/clash.yaml`);
    assert.equal(blocked.status, 401);
    assert.deepEqual(await blocked.json(), { error: "Unauthorized" });

    const response = await fetch(`${baseUrl}/sub/clash.yaml?token=secret`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });

    const bearerResponse = await fetch(`${baseUrl}/sub/clash.yaml`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(bearerResponse.status, 401);
    assert.deepEqual(await bearerResponse.json(), { error: "Unauthorized" });

    const queryStatus = await fetch(`${baseUrl}/api/subscription/status?token=secret`);
    assert.equal(queryStatus.status, 401);
    assert.deepEqual(await queryStatus.json(), { error: "Unauthorized" });

    const bearerStatus = await fetch(`${baseUrl}/api/subscription/status`, {
      headers: { authorization: "Bearer secret" }
    });
    assert.equal(bearerStatus.status, 200);
    const body = await bearerStatus.json();
    assert.equal(body.serverCount, 2);
    assert.equal(Object.hasOwn(body, "subscriptionUrl"), false);
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
