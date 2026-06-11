import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProxyConfig } from "../services/config.mjs";
import { generateClashSubscription } from "../services/clash-subscription.mjs";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));

test("Vultr TUIC template carries client parameters required by the managed listener", () => {
  const proxyConfig = loadProxyConfig({
    configPath: resolve(rootDir, "config", "proxy-servers.vultr-local-tuic.template.json"),
    env: {
      VULTR_TUIC_HOST: "edge.example.test",
      VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
      VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
      VULTR_TUIC_SNI: "edge.example.test"
    }
  });

  const [server] = proxyConfig.servers;
  assert.equal(server.name, "channel-vultr-a-tuic");
  assert.equal(server.provider, "vultr");
  assert.equal(server.region, "nrt");
  assert.equal(server.protocol, "tuic");
  assert.equal(server.credentialMode, "per-order");
  assert.equal(server.udpRelayMode, "native");
  assert.equal(server.congestionController, "bbr");
  assert.deepEqual(server.alpn, ["h3"]);

  const yaml = generateClashSubscription(proxyConfig);
  assert.match(yaml, /name: "channel-vultr-a-tuic"/);
  assert.match(yaml, /type: tuic/);
  assert.match(yaml, /udp-relay-mode: "native"/);
  assert.match(yaml, /congestion-controller: "bbr"/);
  assert.match(yaml, /sni: "edge\.example\.test"/);
  assert.match(yaml, /alpn:\n      - "h3"/);
  assert.doesNotMatch(yaml, /- DIRECT/);
});

test("Vultr multi-channel template follows VLESS Reality, Hy2, and TUIC channel plan", () => {
  const proxyConfig = loadProxyConfig({
    configPath: resolve(rootDir, "config", "proxy-servers.vultr-multichannel.template.json"),
    env: {
      VULTR_TUIC_HOST: "edge.example.test",
      VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
      VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
      VULTR_TUIC_SNI: "edge.example.test",
      VULTR_VLESS_REALITY_HOST: "vless.example.test",
      VULTR_VLESS_REALITY_UUID: "22222222-2222-4222-8222-222222222222",
      VULTR_VLESS_REALITY_SNI: "www.example.test",
      VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
      VULTR_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
      VULTR_HY2_HOST: "edge.example.test",
      VULTR_HY2_PASSWORD: "synthetic-hy2-password",
      VULTR_HY2_SNI: "edge.example.test",
      SGP_TUIC_STATIC_UUID: "33333333-3333-4333-8333-333333333333",
      SGP_TUIC_STATIC_PASSWORD: "synthetic-sgp-tuic-password",
      SGP_VLESS_STATIC_UUID: "44444444-4444-4444-8444-444444444444",
      SGP_XRAY_VLESS_REALITY_PUBLIC_KEY: "synthetic-sgp-public-key",
      SGP_XRAY_VLESS_REALITY_SHORT_ID: "synthetic-sgp-short-id",
      SGP_HY2_STATIC_PASSWORD: "synthetic-sgp-hy2-password"
    }
  });

  assert.deepEqual(proxyConfig.servers.map((server) => server.name), [
    "channel-vultr-a-vless-reality-tcp",
    "channel-vultr-a-hy2",
    "channel-vultr-a-tuic",
    "channel-sgp-a-vless-reality-tcp",
    "channel-sgp-a-hy2",
    "channel-sgp-a-tuic"
  ]);
  assert.equal(proxyConfig.servers.some((server) => server.protocol === "ss"), false);

  const [stableCandidate, weakNetwork, canary] = proxyConfig.servers;
  assert.equal(stableCandidate.protocol, "vless");
  assert.equal(stableCandidate.subscriptionBundleRef, "vultr-production-a");
  assert.equal(stableCandidate.channelPool, "stable");
  assert.equal(stableCandidate.channelRole, "stable");
  assert.equal(stableCandidate.network, "tcp");
  assert.equal(stableCandidate.port, 8443);
  assert.equal(stableCandidate.flow, "xtls-rprx-vision");
  assert.equal(stableCandidate.uuid, "22222222-2222-4222-8222-222222222222");
  assert.equal(stableCandidate.serverName, "www.example.test");
  assert.deepEqual(stableCandidate.realityOpts, {
    publicKey: "synthetic-public-key",
    shortId: "synthetic-short-id"
  });
  assert.equal(stableCandidate.subscriptionEligible, true);
  assert.equal(stableCandidate.stableProtocolApproved, true);

  assert.equal(weakNetwork.name, "channel-vultr-a-hy2");
  assert.equal(weakNetwork.protocol, "hysteria2");
  assert.equal(weakNetwork.subscriptionBundleRef, "vultr-production-a");
  assert.equal(weakNetwork.channelPool, "weak-network");
  assert.equal(weakNetwork.channelRole, "weak-network");
  assert.equal(weakNetwork.qualityClass, "weak-network");
  assert.equal(weakNetwork.port, 10443);
  assert.equal(weakNetwork.password, "synthetic-hy2-password");
  assert.equal(weakNetwork.subscriptionEligible, true);
  assert.deepEqual(weakNetwork.runtimePolicy, {
    sniff: {
      enabled: true,
      rewriteDomain: true,
      tcpPorts: "80,443,8000-9000",
      udpPorts: "all"
    },
    outbound: {
      mode: 4
    },
    trafficStats: {
      loopbackOnly: true,
      listenEnv: "EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN"
    }
  });

  assert.equal(canary.name, "channel-vultr-a-tuic");
  assert.equal(canary.protocol, "tuic");
  assert.equal(canary.subscriptionBundleRef, "vultr-production-a");
  assert.equal(canary.port, 443);
  assert.equal(canary.channelPool, "canary");
  assert.equal(canary.channelRole, "canary");
  assert.equal(canary.stableProtocolApproved, false);
  assert.deepEqual(canary.alpn, ["h3"]);
  assert.equal(proxyConfig.servers[3].name, "channel-sgp-a-vless-reality-tcp");
  assert.equal(proxyConfig.servers[3].runtimeAdapter, "remote-data-plane-handoff");
  assert.equal(proxyConfig.servers[3].physicalNodeRef, "vultr-sgp-a");
  assert.equal(proxyConfig.servers[3].subscriptionBundleRef, "vultr-production-a");
  assert.equal(proxyConfig.servers[3].host, "sub.globalcirclecat.cloud");
  assert.equal(proxyConfig.servers[3].uuid, "44444444-4444-4444-8444-444444444444");
  assert.equal(proxyConfig.servers[3].serverName, "www.cloudflare.com");
  assert.deepEqual(proxyConfig.servers[3].realityOpts, {
    publicKey: "synthetic-sgp-public-key",
    shortId: "synthetic-sgp-short-id"
  });
  assert.equal(proxyConfig.servers[4].name, "channel-sgp-a-hy2");
  assert.equal(proxyConfig.servers[4].runtimeAdapter, "remote-data-plane-handoff");
  assert.equal(proxyConfig.servers[4].port, 10443);
  assert.equal(proxyConfig.servers[4].host, "sub.globalcirclecat.cloud");
  assert.equal(proxyConfig.servers[4].password, "synthetic-sgp-hy2-password");
  assert.equal(proxyConfig.servers[4].sni, "globalcirclecat.cloud");
  assert.equal(proxyConfig.servers[5].name, "channel-sgp-a-tuic");
  assert.equal(proxyConfig.servers[5].runtimeAdapter, "remote-data-plane-handoff");
  assert.equal(proxyConfig.servers[5].port, 443);
  assert.equal(proxyConfig.servers[5].host, "sub.globalcirclecat.cloud");
  assert.equal(proxyConfig.servers[5].uuid, "33333333-3333-4333-8333-333333333333");
  assert.equal(proxyConfig.servers[5].password, "synthetic-sgp-tuic-password");
  assert.equal(proxyConfig.servers[5].sni, "sub.globalcirclecat.cloud");

  const yaml = generateClashSubscription(proxyConfig);
  assert.match(yaml, /name: "channel-vultr-a-vless-reality-tcp"/);
  assert.match(yaml, /type: vless/);
  assert.match(yaml, /reality-opts:\n      public-key: "synthetic-public-key"\n      short-id: "synthetic-short-id"/);
  assert.match(yaml, /name: "channel-vultr-a-hy2"/);
  assert.match(yaml, /type: hysteria2/);
  assert.match(yaml, /name: "channel-vultr-a-tuic"/);
  assert.match(yaml, /type: tuic/);
  assert.match(yaml, /name: "channel-sgp-a-vless-reality-tcp"/);
  assert.match(yaml, /name: "channel-sgp-a-hy2"/);
  assert.match(yaml, /name: "channel-sgp-a-tuic"/);
  assert.doesNotMatch(yaml, /Shadowsocks|channel-vultr-a-ss-tcp|type: ss/);
});

test("Vultr multi-channel template separates runtime listen tuples from web and UDP canary ports", () => {
  const proxyConfig = loadProxyConfig({
    configPath: resolve(rootDir, "config", "proxy-servers.vultr-multichannel.template.json"),
    env: {
      VULTR_TUIC_HOST: "edge.example.test",
      VULTR_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
      VULTR_TUIC_PASSWORD: "synthetic-tuic-password",
      VULTR_TUIC_SNI: "edge.example.test",
      VULTR_VLESS_REALITY_HOST: "vless.example.test",
      VULTR_VLESS_REALITY_UUID: "22222222-2222-4222-8222-222222222222",
      VULTR_VLESS_REALITY_SNI: "www.example.test",
      VULTR_VLESS_REALITY_PUBLIC_KEY: "synthetic-public-key",
      VULTR_VLESS_REALITY_SHORT_ID: "synthetic-short-id",
      VULTR_HY2_HOST: "edge.example.test",
      VULTR_HY2_PASSWORD: "synthetic-hy2-password",
      VULTR_HY2_SNI: "edge.example.test",
      SGP_TUIC_STATIC_UUID: "33333333-3333-4333-8333-333333333333",
      SGP_TUIC_STATIC_PASSWORD: "synthetic-sgp-tuic-password",
      SGP_VLESS_STATIC_UUID: "44444444-4444-4444-8444-444444444444",
      SGP_XRAY_VLESS_REALITY_PUBLIC_KEY: "synthetic-sgp-public-key",
      SGP_XRAY_VLESS_REALITY_SHORT_ID: "synthetic-sgp-short-id",
      SGP_HY2_STATIC_PASSWORD: "synthetic-sgp-hy2-password"
    }
  });

  const runtimeTuples = proxyConfig.servers.map((server) => {
    const transport = server.protocol === "vless" ? "tcp" : "udp";
    return `${server.physicalNodeRef}:${transport}:${server.port}`;
  });

  assert.deepEqual(runtimeTuples, [
    "vultr-nrt-a:tcp:8443",
    "vultr-nrt-a:udp:10443",
    "vultr-nrt-a:udp:443",
    "vultr-sgp-a:tcp:8443",
    "vultr-sgp-a:udp:10443",
    "vultr-sgp-a:udp:443"
  ]);
  assert.equal(new Set(runtimeTuples).size, runtimeTuples.length);
  assert.equal(runtimeTuples.some((tuple) => tuple.endsWith(":tcp:443")), false);
});
