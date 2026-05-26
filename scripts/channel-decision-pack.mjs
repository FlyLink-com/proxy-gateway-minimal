#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildChannelDecisionPack } from "../server/services/channel-decision-pack.mjs";

function pathsFromArgs(argv) {
  const [dryRunPath, scorePath, extra] = argv;
  if (!dryRunPath || !scorePath || extra) {
    throw new Error("channel decision pack requires dry-run and score JSON file paths");
  }
  return { dryRunPath, scorePath };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  const { dryRunPath, scorePath } = pathsFromArgs(process.argv.slice(2));
  const pack = buildChannelDecisionPack({
    dryRunSummary: readJson(dryRunPath),
    measurementScore: readJson(scorePath)
  });
  process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel decision pack failed: ${error.message}\n`);
  process.exitCode = 1;
}
