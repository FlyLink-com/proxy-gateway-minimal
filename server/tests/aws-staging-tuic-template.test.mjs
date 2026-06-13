import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProxyConfig } from "../services/config.mjs";
import { generateClashSubscription } from "../services/clash-subscription.mjs";

const rootDir = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const configPath = resolve(rootDir, "config", "proxy-servers.aws-staging-tuic.template.json");

test("AWS staging TUIC template is isolated from production channels", () => {
  const rawTemplate = JSON.parse(readFileSync(configPath, "utf8"));
  const [rawServer] = rawTemplate.servers;

  assert.equal(rawTemplate.reviewedRuntimeTemplate, true);
  assert.equal(rawServer.name, "channel-aws-staging-a-tuic");
  assert.equal(rawServer.physicalNodeRef, "aws-apne1-staging-a");
  assert.equal(rawServer.provider, "aws");
  assert.equal(rawServer.host, "${AWS_STAGING_TUIC_HOST}");
  assert.equal(rawServer.uuid, "${AWS_STAGING_TUIC_UUID}");
  assert.equal(rawServer.password, "${AWS_STAGING_TUIC_PASSWORD}");
  assert.equal(rawServer.sni, "${AWS_STAGING_TUIC_SNI}");
});

test("AWS staging TUIC template carries client parameters required by the managed listener", () => {
  const proxyConfig = loadProxyConfig({
    configPath,
    env: {
      AWS_STAGING_TUIC_HOST: "edge.example.test",
      AWS_STAGING_TUIC_UUID: "11111111-1111-4111-8111-111111111111",
      AWS_STAGING_TUIC_PASSWORD: "synthetic-tuic-password",
      AWS_STAGING_TUIC_SNI: "edge.example.test"
    }
  });

  const [server] = proxyConfig.servers;
  assert.equal(server.id, "channel_aws_staging_a_tuic");
  assert.equal(server.name, "channel-aws-staging-a-tuic");
  assert.equal(server.physicalNodeRef, "aws-apne1-staging-a");
  assert.equal(server.displayName, "AWS Tokyo Staging TUIC");
  assert.equal(server.region, "ap-northeast-1");
  assert.equal(server.provider, "aws");
  assert.equal(server.protocol, "tuic");
  assert.equal(server.type, "tuic");
  assert.equal(server.credentialMode, "per-order");
  assert.deepEqual(server.credentialLifecycle, {
    addCredential: true,
    disableCredential: true,
    rotateCredential: true,
    restart: true
  });
  assert.equal(server.udpRelayMode, "native");
  assert.equal(server.congestionController, "bbr");
  assert.deepEqual(server.alpn, ["h3"]);
  assert.equal(server.channelPool, "staging");
  assert.equal(server.channelRole, "staging");
  assert.equal(server.subscriptionEligible, true);
  assert.equal(server.host, "edge.example.test");
  assert.equal(server.sni, "edge.example.test");

  const yaml = generateClashSubscription(proxyConfig);
  assert.match(yaml, /name: "channel-aws-staging-a-tuic"/);
  assert.match(yaml, /type: tuic/);
  assert.match(yaml, /server: "edge\.example\.test"/);
  assert.match(yaml, /udp-relay-mode: "native"/);
  assert.match(yaml, /congestion-controller: "bbr"/);
  assert.match(yaml, /sni: "edge\.example\.test"/);
  assert.match(yaml, /alpn:\n      - "h3"/);
  assert.doesNotMatch(yaml, /\$\{AWS_STAGING_TUIC_/);
  assert.doesNotMatch(yaml, /- DIRECT/);
});
