#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { replayChannelSubscriptionActivationFlowFixture } from "../server/services/channel-subscription-activation-flow-fixture.mjs";

function readJson(path) {
  if (!path) {
    throw new Error("channel subscription activation flow fixture file path is required");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  const [fixturePath] = process.argv.slice(2);
  if (!fixturePath || process.argv.length !== 3) {
    throw new Error("channel subscription activation flow replay requires one fixture file path");
  }

  const replay = replayChannelSubscriptionActivationFlowFixture(readJson(fixturePath));
  process.stdout.write(`${JSON.stringify(replay, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel subscription activation flow replay failed: ${error.message}\n`);
  process.exitCode = 1;
}
