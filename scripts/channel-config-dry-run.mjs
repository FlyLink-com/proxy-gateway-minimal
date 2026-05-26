#!/usr/bin/env node
import { dryRunChannelConfig } from "../server/services/channel-config-dry-run.mjs";

const configPath = process.argv[2] || "config/proxy-servers.json";

try {
  const summary = dryRunChannelConfig({ configPath });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel config dry-run failed: ${error.message}\n`);
  process.exitCode = 1;
}
