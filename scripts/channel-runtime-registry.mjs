import { readFileSync } from "node:fs";
import { buildChannelRuntimeRegistry } from "../server/services/channel-runtime-registry.mjs";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read channel runtime registry input");
  }
}

function main(argv) {
  if (argv.length !== 3) {
    throw new Error("channel runtime registry requires dry-run, score, and runtime inventory file paths");
  }

  const [dryRunPath, scorePath, inventoryPath] = argv;
  return buildChannelRuntimeRegistry({
    dryRunSummary: readJson(dryRunPath),
    measurementScore: readJson(scorePath),
    runtimeInventory: readJson(inventoryPath)
  });
}

try {
  const registry = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(registry, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel runtime registry failed: ${error.message}\n`);
  process.exitCode = 1;
}
