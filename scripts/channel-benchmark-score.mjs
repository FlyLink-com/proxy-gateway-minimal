#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { scoreChannelBenchmarkSummary } from "../server/services/channel-benchmark-results.mjs";

function summaryPathFromArgs(argv) {
  const [path, extra] = argv;
  if (!path || extra) {
    throw new Error("channel benchmark score requires exactly one summary file path");
  }
  return path;
}

try {
  const summaryPath = summaryPathFromArgs(process.argv.slice(2));
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const scored = scoreChannelBenchmarkSummary(summary, {
    generatedAt: summary.generatedAt
  });
  process.stdout.write(`${JSON.stringify(scored, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel benchmark score failed: ${error.message}\n`);
  process.exitCode = 1;
}
