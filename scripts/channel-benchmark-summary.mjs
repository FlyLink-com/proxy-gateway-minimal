#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  normalizeChannelBenchmarkFixture,
  summarizeChannelBenchmarkResults
} from "../server/services/channel-benchmark-results.mjs";

const samplesPath = process.argv[2];

function loadSamples(path) {
  if (!path) {
    throw new Error("sample file path is required");
  }

  return normalizeChannelBenchmarkFixture(JSON.parse(readFileSync(path, "utf8")));
}

try {
  const { samples, generatedAt } = loadSamples(samplesPath);
  const summary = summarizeChannelBenchmarkResults(samples, { generatedAt });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel benchmark summary failed: ${error.message}\n`);
  process.exitCode = 1;
}
