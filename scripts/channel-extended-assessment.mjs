#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { assessChannelExtendedMeasurement } from "../server/services/channel-extended-measurement.mjs";

function summaryPathFromArgs(argv) {
  const [path, extra] = argv;
  if (!path || extra) {
    throw new Error("channel extended assessment requires exactly one summary file path");
  }
  return path;
}

try {
  const summaryPath = summaryPathFromArgs(process.argv.slice(2));
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const assessment = assessChannelExtendedMeasurement(summary, {
    generatedAt: summary.generatedAt
  });
  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel extended assessment failed: ${error.message}\n`);
  process.exitCode = 1;
}
