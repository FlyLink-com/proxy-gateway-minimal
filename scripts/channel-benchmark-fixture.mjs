#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createChannelBenchmarkFixtureFromPlan } from "../server/services/channel-benchmark-results.mjs";

const summaryPath = process.argv[2];

function loadBenchmarkPlan(path) {
  if (!path) {
    throw new Error("dry-run summary file path is required");
  }

  const payload = JSON.parse(readFileSync(path, "utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("dry-run summary must be an object");
  }
  return payload.benchmarkPlan;
}

try {
  const fixture = createChannelBenchmarkFixtureFromPlan(loadBenchmarkPlan(summaryPath));
  process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel benchmark fixture failed: ${error.message}\n`);
  process.exitCode = 1;
}
