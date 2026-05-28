#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { buildPlatformControlledOpenPackage } from "../server/services/platform/controlled-open-flow.mjs";

const inputPath = process.argv[2];

try {
  if (!inputPath) {
    throw new Error("usage: platform-controlled-open <controlled-open-input.json>");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const controlledOpenPackage = buildPlatformControlledOpenPackage(input);
  process.stdout.write(`${JSON.stringify(controlledOpenPackage, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`platform controlled-open failed: ${error.message}\n`);
  process.exitCode = 1;
}
