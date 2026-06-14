import { readFileSync } from "node:fs";
import { buildNodeImageProvisioningReadinessSummary } from "../server/services/node-image-provisioning-readiness-summary.mjs";

const MODE = "node-image-provisioning-readiness-summary";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read node image provisioning readiness summary input");
  }
}

function main(argv) {
  if (argv.length !== 1) {
    throw new Error("node image provisioning readiness summary requires one safe inventory file path");
  }

  return buildNodeImageProvisioningReadinessSummary(readJson(argv[0]));
}

try {
  const summary = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    mode: MODE,
    error: error.message
  }, null, 2)}\n`);
  process.exitCode = 1;
}
