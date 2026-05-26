#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelExtendedMeasurementReport } from "../server/services/channel-extended-report.mjs";

function summaryPathsFromArgs(argv) {
  if (argv.length === 0) {
    throw new Error("channel extended report requires at least one summary file path");
  }
  return argv;
}

try {
  const summaryPaths = summaryPathsFromArgs(process.argv.slice(2));
  const summaries = summaryPaths.map((summaryPath) => JSON.parse(readFileSync(summaryPath, "utf8")));
  const report = buildChannelExtendedMeasurementReport(summaries, {
    generatedAt: summaries.at(-1)?.generatedAt
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel extended report failed: ${error.message}\n`);
  process.exitCode = 1;
}
