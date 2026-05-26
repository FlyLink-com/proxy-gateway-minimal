#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runChannelBenchmarkPlan } from "../server/services/channel-benchmark-runner.mjs";

function parseArgs(argv) {
  const [planPath, ...rest] = argv;
  const options = { planPath, runnerPath: "", generatedAt: undefined };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--runner") {
      options.runnerPath = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--generated-at") {
      options.generatedAt = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error("unsupported channel benchmark runner option");
  }

  return options;
}

function loadPlan(planPath) {
  if (!planPath) {
    throw new Error("benchmark plan file path is required");
  }
  return JSON.parse(readFileSync(planPath, "utf8"));
}

async function loadRunProbe(runnerPath) {
  if (!runnerPath) {
    throw new Error("--runner local module path is required");
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(runnerPath)) {
    throw new Error("--runner must be a local module path");
  }

  let module;
  try {
    module = await import(pathToFileURL(resolve(runnerPath)).href);
  } catch {
    throw new Error("local runner module could not be loaded");
  }

  const runProbe = module.runProbe ?? module.default;
  if (typeof runProbe !== "function") {
    throw new Error("local runner module must export runProbe");
  }
  return runProbe;
}

try {
  const { planPath, runnerPath, generatedAt } = parseArgs(process.argv.slice(2));
  const fixture = await runChannelBenchmarkPlan(loadPlan(planPath), {
    generatedAt: generatedAt || undefined,
    runProbe: await loadRunProbe(runnerPath)
  });
  process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel benchmark runner failed: ${error.message}\n`);
  process.exitCode = 1;
}
