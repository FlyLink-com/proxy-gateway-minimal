#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildChannelMeasurementBundleReport } from "../server/services/channel-measurement-bundle.mjs";

function manifestPathFromArgs(argv) {
  const [path, extra] = argv;
  if (!path || extra) {
    throw new Error("channel measurement bundle requires exactly one manifest file path");
  }
  return path;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("failed to read measurement input");
  }
}

function summaryPath(baseDir, window) {
  const summaryFile = String(window?.summaryFile ?? "").trim();
  if (!summaryFile) {
    throw new Error("channel measurement bundle summary file is required");
  }
  return resolve(baseDir, summaryFile);
}

try {
  const manifestPath = manifestPathFromArgs(process.argv.slice(2));
  const manifest = readJson(manifestPath);
  const baseDir = dirname(resolve(manifestPath));
  const summaries = (manifest.windows ?? []).map((window) => readJson(summaryPath(baseDir, window)));
  const report = buildChannelMeasurementBundleReport(manifest, summaries, {
    generatedAt: manifest.generatedAt
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`channel measurement bundle failed: ${error.message}\n`);
  process.exitCode = 1;
}
