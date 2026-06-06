import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProxyConfig } from "../services/config.mjs";
import { generateClashSubscription } from "../services/clash-subscription.mjs";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));

test("Aliyun TUIC template carries client parameters required by the managed listener", () => {
  const proxyConfig = loadProxyConfig({
    configPath: resolve(rootDir, "config", "proxy-servers.aliyun-local-tuic.template.json"),
    env: {
      ALIYUN_TUIC_HOST: "edge.example.test",
      ALIYUN_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
      ALIYUN_TUIC_PASSWORD: "synthetic-tuic-password",
      ALIYUN_TUIC_SNI: "edge.example.test"
    }
  });

  const [server] = proxyConfig.servers;
  assert.equal(server.name, "channel-aliyun-a-tuic");
  assert.equal(server.protocol, "tuic");
  assert.equal(server.credentialMode, "per-order");
  assert.equal(server.udpRelayMode, "native");
  assert.equal(server.congestionController, "bbr");
  assert.deepEqual(server.alpn, ["h3"]);

  const yaml = generateClashSubscription(proxyConfig);
  assert.match(yaml, /name: "channel-aliyun-a-tuic"/);
  assert.match(yaml, /type: tuic/);
  assert.match(yaml, /udp-relay-mode: "native"/);
  assert.match(yaml, /congestion-controller: "bbr"/);
  assert.match(yaml, /sni: "edge\.example\.test"/);
  assert.match(yaml, /alpn:\n      - "h3"/);
  assert.doesNotMatch(yaml, /- DIRECT/);
});
