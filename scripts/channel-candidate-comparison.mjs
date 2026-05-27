#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelCandidateComparisonPlan } from "../server/services/channel-candidate-comparison.mjs";

function pathsFromArgs(argv) {
  const [investigationPath, dryRunPath, extra] = argv;
  if (!investigationPath || !dryRunPath || extra) {
    throw new Error("channel candidate comparison requires investigation and dry-run JSON file paths");
  }
  return { investigationPath, dryRunPath };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read channel candidate comparison input");
  }
}

try {
  const { investigationPath, dryRunPath } = pathsFromArgs(process.argv.slice(2));
  const plan = buildChannelCandidateComparisonPlan({
    investigationReport: readJson(investigationPath),
    dryRunSummary: readJson(dryRunPath)
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel candidate comparison failed: ${error.message}\n`);
  process.exitCode = 1;
}
