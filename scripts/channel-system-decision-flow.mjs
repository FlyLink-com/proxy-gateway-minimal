import { readFileSync } from "node:fs";
import { buildChannelSystemDecisionFlow } from "../server/services/channel-system-decision-flow.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read channel system decision flow input");
  }
}

function main(argv) {
  if (argv.length !== 3) {
    throw new Error("channel system decision flow requires dry-run, measurement score, and runtime inventory input file paths");
  }

  return buildChannelSystemDecisionFlow({
    dryRunSummary: readJson(argv[0]),
    measurementScore: readJson(argv[1]),
    runtimeInventoryInput: readJson(argv[2])
  });
}

try {
  const flow = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(flow, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel system decision flow failed: ${error.message}\n`);
  process.exitCode = 1;
}
