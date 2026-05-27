#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelSubscriptionActivationPackage } from "../server/services/channel-subscription-activation-package.mjs";
import { loadProxyConfig } from "../server/services/config.mjs";

const fixturePath = process.argv[2];
const configPath = process.argv[3] || "config/proxy-servers.json";

try {
  if (!fixturePath) {
    throw new Error("usage: channel-subscription-activation-package <activation-flow-fixture.json> [proxy-servers.json]");
  }

  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const proxyConfig = loadProxyConfig({ configPath });
  const activationPackage = buildChannelSubscriptionActivationPackage({ fixture, proxyConfig });
  process.stdout.write(`${JSON.stringify(activationPackage, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel subscription activation package failed: ${error.message}\n`);
  process.exitCode = 1;
}
