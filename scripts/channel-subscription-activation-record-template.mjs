#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelSubscriptionActivationRecordTemplate } from "../server/services/channel-subscription-activation-record-template.mjs";

function readJson(path) {
  if (!path) {
    throw new Error("channel subscription activation flow fixture file path is required");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  const [fixturePath] = process.argv.slice(2);
  if (!fixturePath || process.argv.length !== 3) {
    throw new Error("channel subscription activation record template requires one fixture file path");
  }

  const template = buildChannelSubscriptionActivationRecordTemplate(readJson(fixturePath));
  process.stdout.write(template.record.markdown);
} catch (error) {
  process.stderr.write(`channel subscription activation record template failed: ${error.message}\n`);
  process.exitCode = 1;
}
