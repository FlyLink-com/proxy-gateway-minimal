import { readFileSync } from "node:fs";
import { buildCleanEdgeReadinessSummary } from "../server/services/clean-edge-readiness-summary.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read clean edge readiness summary input");
  }
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("clean edge readiness summary requires one safe inventory file path");
  }

  return buildCleanEdgeReadinessSummary(readJson(argv[0]));
}

try {
  const summary = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`clean edge readiness summary failed: ${error.message}\n`);
  process.exitCode = 1;
}
