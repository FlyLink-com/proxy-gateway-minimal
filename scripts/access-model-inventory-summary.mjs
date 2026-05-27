import { readFileSync } from "node:fs";
import { buildAccessModelInventorySummary } from "../server/services/platform/access-model-inventory-summary.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read access model inventory summary input");
  }
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("access model inventory summary requires one safe inventory file path");
  }

  return buildAccessModelInventorySummary(readJson(argv[0]));
}

try {
  const summary = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`access model inventory summary failed: ${error.message}\n`);
  process.exitCode = 1;
}
