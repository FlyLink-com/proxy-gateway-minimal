#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelCandidateReport } from "../server/services/channel-candidate-report.mjs";

function pathsFromArgs(argv) {
  const [dryRunPath, scorePath, extra] = argv;
  if (!dryRunPath || !scorePath || extra) {
    throw new Error("channel candidate report requires dry-run and score JSON file paths");
  }
  return { dryRunPath, scorePath };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  const { dryRunPath, scorePath } = pathsFromArgs(process.argv.slice(2));
  const report = buildChannelCandidateReport({
    dryRunSummary: readJson(dryRunPath),
    measurementScore: readJson(scorePath)
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel candidate report failed: ${error.message}\n`);
  process.exitCode = 1;
}
