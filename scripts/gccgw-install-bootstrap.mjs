#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateInstallConfigurePlanEnvelope } from "../server/services/cli/router.mjs";

const args = process.argv.slice(2);

function optionValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

if (!args.includes("--execute-production-mutation")) {
  console.error("--execute-production-mutation is required for install bootstrap.");
  process.exit(1);
}

if (!args.includes("--apply")) {
  console.error("--apply is required and is passed to ops/edge-node/bootstrap.sh.");
  process.exit(1);
}

const configPlanPath = optionValue("--config-plan");
if (!configPlanPath) {
  console.error("--config-plan is required for install bootstrap.");
  process.exit(1);
}

const unsupported = [];
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--execute-production-mutation" || arg === "--apply") {
    continue;
  }
  if (arg === "--config-plan") {
    index += 1;
    continue;
  }
  unsupported.push(arg);
}
if (unsupported.length > 0) {
  console.error("unsupported install bootstrap argument");
  process.exit(1);
}

let configurePlan;
try {
  configurePlan = JSON.parse(readFileSync(resolve(configPlanPath), "utf8"));
} catch {
  console.error("configure plan is unreadable.");
  process.exit(1);
}

const configurePlanValidation = validateInstallConfigurePlanEnvelope(configurePlan);
if (!configurePlanValidation.ok) {
  console.error("configure plan is not approved for bootstrap.");
  console.error(`blockers: ${configurePlanValidation.blockers.map((item) => item.code).join(", ")}`);
  process.exit(1);
}

if (process.platform !== "linux") {
  console.error("install bootstrap can only run on a Linux server host.");
  process.exit(1);
}

const scriptPath = resolve("ops/edge-node/bootstrap.sh");
const result = spawnSync("bash", [scriptPath, "--apply"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
