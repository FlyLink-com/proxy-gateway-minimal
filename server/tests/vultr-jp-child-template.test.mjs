import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadProxyConfig } from "../services/config.mjs";

const template = JSON.parse(readFileSync(
  new URL("../../config/proxy-servers.vultr-jp-child.template.json", import.meta.url),
  "utf8"
));

const EXPECTED_NODE_REF = "node-vultr-jp-01";
const EXPECTED_CHANNELS = [
  "channel-vultr-jp-01-vless-reality-tcp",
  "channel-vultr-jp-01-hy2",
  "channel-vultr-jp-01-tuic"
];

test("JP child template binds three logical channels to one dedicated physical node", () => {
  assert.equal(template.nodeRef, EXPECTED_NODE_REF);
  assert.equal(template.physicalNodeRef, EXPECTED_NODE_REF);
  assert.equal(template.provider, "vultr");
  assert.equal(template.region, "nrt");
  assert.equal(template.countryCode, "JP");
  assert.equal(template.role, "data-plane");
  assert.equal(template.servers.length, 3);

  assert.deepEqual(
    template.servers.map((server) => server.name),
    EXPECTED_CHANNELS
  );
  for (const server of template.servers) {
    assert.equal(server.nodeRef, EXPECTED_NODE_REF);
    assert.equal(server.physicalNodeRef, EXPECTED_NODE_REF);
    assert.equal(server.provider, "vultr");
    assert.equal(server.region, "nrt");
    assert.equal(server.countryCode, "JP");
    assert.equal(server.subscriptionBundleRef, "vultr-production-a");
  }
});

test("JP child channels are private and cannot enter default subscription output", () => {
  for (const server of template.servers) {
    assert.equal(server.runtimeAdapter, "remote-data-plane-handoff");
    assert.equal(server.requiresAppliedReceipt, true);
    assert.equal(server.channelPool, "private");
    assert.equal(server.channelRole, "lab");
    assert.equal(server.lifecycle, "private-validation");
    assert.equal(server.status, "offline");
    assert.equal(server.subscriptionEligible, false);
    assert.equal(server.autoEligible, false);
    assert.deepEqual(server.credentialLifecycle, {
      addCredential: true,
      disableCredential: true,
      rotateCredential: true,
      restart: true
    });
  }
});

test("JP child channel protocol and listener plan is explicit", () => {
  const [vless, hy2, tuic] = template.servers;

  assert.equal(vless.protocol, "vless");
  assert.equal(vless.network, "tcp");
  assert.equal(vless.port, 8443);
  assert.equal(vless.flow, "xtls-rprx-vision");
  assert.equal(vless.packetEncoding, "xudp");

  assert.equal(hy2.protocol, "hysteria2");
  assert.equal(hy2.network, "udp");
  assert.equal(hy2.port, 10443);
  assert.equal(hy2.runtimePolicy.trafficStats.loopbackOnly, true);
  assert.equal(hy2.runtimePolicy.trafficStats.listenEnv, "EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN");

  assert.equal(tuic.protocol, "tuic");
  assert.equal(tuic.network, "udp");
  assert.equal(tuic.port, 443);
  assert.equal(tuic.udpRelayMode, "native");
  assert.equal(tuic.congestionController, "bbr");
});

test("JP child template loads and resolves all three client protocols from protected placeholders", () => {
  const proxyConfig = loadProxyConfig({
    configPath: new URL("../../config/proxy-servers.vultr-jp-child.template.json", import.meta.url),
    env: {
      JP_CHILD_VLESS_REALITY_HOST: "jp-child.example.test",
      JP_CHILD_VLESS_REALITY_UUID: "55555555-5555-4555-8555-555555555555",
      JP_CHILD_VLESS_REALITY_SNI: "www.example.test",
      JP_CHILD_VLESS_REALITY_PUBLIC_KEY: "synthetic-jp-child-public-key",
      JP_CHILD_VLESS_REALITY_SHORT_ID: "synthetic-jp-child-short-id",
      JP_CHILD_HY2_HOST: "jp-child.example.test",
      JP_CHILD_HY2_PASSWORD: "synthetic-jp-child-hy2-password",
      JP_CHILD_HY2_SNI: "jp-child.example.test",
      JP_CHILD_TUIC_HOST: "jp-child.example.test",
      JP_CHILD_TUIC_UUID: "66666666-6666-4666-8666-666666666666",
      JP_CHILD_TUIC_PASSWORD: "synthetic-jp-child-tuic-password",
      JP_CHILD_TUIC_SNI: "jp-child.example.test"
    }
  });

  assert.deepEqual(proxyConfig.servers.map((server) => server.name), EXPECTED_CHANNELS);
  const [vless, hy2, tuic] = proxyConfig.servers;
  assert.equal(vless.host, "jp-child.example.test");
  assert.equal(vless.uuid, "55555555-5555-4555-8555-555555555555");
  assert.equal(vless.serverName, "www.example.test");
  assert.deepEqual(vless.realityOpts, {
    publicKey: "synthetic-jp-child-public-key",
    shortId: "synthetic-jp-child-short-id"
  });
  assert.equal(hy2.host, "jp-child.example.test");
  assert.equal(hy2.password, "synthetic-jp-child-hy2-password");
  assert.equal(hy2.port, 10443);
  assert.equal(tuic.host, "jp-child.example.test");
  assert.equal(tuic.uuid, "66666666-6666-4666-8666-666666666666");
  assert.equal(tuic.password, "synthetic-jp-child-tuic-password");
  assert.equal(tuic.port, 443);
  assert.equal(JSON.stringify(proxyConfig).includes("${"), false);
});

test("JP child template contains only protected-material placeholders, never material values", () => {
  const placeholder = /^\$\{[A-Z0-9_]+\}$/;
  const protectedValues = [
    ["VLESS host", template.servers[0].host],
    ["VLESS UUID", template.servers[0].uuid],
    ["VLESS SNI", template.servers[0].serverName],
    ["VLESS Reality public key", template.servers[0].realityOpts.publicKey],
    ["VLESS Reality short ID", template.servers[0].realityOpts.shortId],
    ["Hysteria2 host", template.servers[1].host],
    ["Hysteria2 password", template.servers[1].password],
    ["Hysteria2 SNI", template.servers[1].sni],
    ["TUIC host", template.servers[2].host],
    ["TUIC UUID", template.servers[2].uuid],
    ["TUIC password", template.servers[2].password],
    ["TUIC SNI", template.servers[2].sni]
  ];

  for (const [label, value] of protectedValues) {
    assert.match(value, placeholder, `${label} must remain a protected-material placeholder`);
  }
  assert.doesNotMatch(JSON.stringify(template), /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{12,}/i);
});
