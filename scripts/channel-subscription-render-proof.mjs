#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelSubscriptionRenderProof } from "../server/services/channel-subscription-render-proof.mjs";
import { loadProxyConfig } from "../server/services/config.mjs";

const fixturePath = process.argv[2];
const configPath = process.argv[3] || "config/proxy-servers.json";

try {
  if (!fixturePath) {
    throw new Error("usage: channel-subscription-render-proof <activation-flow-fixture.json> [proxy-servers.json]");
  }

  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const proxyConfig = loadProxyConfig({ configPath });
  const proof = buildChannelSubscriptionRenderProof({ fixture, proxyConfig });
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel subscription render proof failed: ${error.message}\n`);
  process.exitCode = 1;
}
