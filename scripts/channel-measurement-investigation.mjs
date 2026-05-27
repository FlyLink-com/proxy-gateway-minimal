#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelMeasurementInvestigationReport } from "../server/services/channel-measurement-investigation.mjs";

function bundleReportPathFromArgs(argv) {
  const [path, extra] = argv;
  if (!path || extra) {
    throw new Error("channel measurement investigation requires exactly one bundle report file path");
  }
  return path;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read measurement investigation input");
  }
}

try {
  const path = bundleReportPathFromArgs(process.argv.slice(2));
  const report = buildChannelMeasurementInvestigationReport(readJson(path));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel measurement investigation failed: ${error.message}\n`);
  process.exitCode = 1;
}
