#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  createChannelSubscriptionActivationFlowFixture,
  extractChannelSubscriptionActivationFlowPayload
} from "../server/services/channel-subscription-activation-flow-fixture.mjs";

function readJson(path) {
  if (!path) {
    throw new Error("channel subscription activation flow file path is required");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  const [flowPath] = process.argv.slice(2);
  if (!flowPath || process.argv.length !== 3) {
    throw new Error("channel subscription activation flow fixture requires one activation-flow file path");
  }

  const fixture = createChannelSubscriptionActivationFlowFixture(
    extractChannelSubscriptionActivationFlowPayload(readJson(flowPath))
  );
  process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel subscription activation flow fixture failed: ${error.message}\n`);
  process.exitCode = 1;
}
